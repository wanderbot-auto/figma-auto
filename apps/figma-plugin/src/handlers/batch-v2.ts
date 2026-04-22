import type {
  BatchEditItemResult,
  BatchEditItemRisk,
  BatchEditV2Operation,
  BatchEditV2Payload,
  BatchEditV2Result,
  BatchResolvableId,
  BatchResultField,
  BatchValueReference,
  BindVariablePayload,
  CreateFramePayload,
  CreateInstancePayload,
  CreatePagePayload,
  CreateRectanglePayload,
  CreateTextPayload,
  DeleteNodePayload,
  DuplicateNodePayload,
  MoveNodePayload,
  RenameNodePayload,
  SetImageFillPayload,
  SetInstancePropertiesPayload,
  SetTextPayload,
  UpdateNodePropertiesPayload
} from "@figma-auto/protocol";

import {
  hasAutoLayout,
  hasAutoLayoutChild,
  hasChildren,
  hasFills,
  isInstanceNode,
  isSceneNode,
  isTextNode
} from "./node-helpers.js";
import { setImageFill } from "./set-image-fill.js";
import { setInstanceProperties } from "./set-instance-properties.js";
import { updateNodeProperties } from "./update-node-properties.js";
import { bindVariable } from "./variables.js";
import {
  createFrame,
  createInstance,
  createPage,
  createRectangle,
  createText,
  deleteNode,
  duplicateNode,
  moveNode,
  renameNode,
  setText
} from "./write.js";

type SyntheticNodeKind = "PAGE" | "FRAME" | "RECTANGLE" | "TEXT" | "INSTANCE" | "SCENE";

const SYNTHETIC_PREFIX = "__batch_v2_dry_run__";

interface BatchContext {
  resultsByOpId: Map<string, BatchEditItemResult>;
  syntheticKinds: Map<string, SyntheticNodeKind>;
  syntheticAliases: Map<string, string>;
  shadowParentIds: Map<string, string | null>;
  deletedNodeIds: Set<string>;
}

type BatchEditItemResultWithRisks = BatchEditItemResult & {
  risks?: BatchEditItemRisk[] | undefined;
};

interface DryRunRiskContext {
  operation: BatchEditV2Operation;
  result: BatchEditItemResultWithRisks;
  context: BatchContext;
}

function compactBatchItemResult(result: BatchEditItemResultWithRisks): BatchEditItemResultWithRisks {
  if (!result.ok) {
    return result;
  }

  const compact: BatchEditItemResultWithRisks = {
    index: result.index,
    op: result.op,
    ok: result.ok,
    wouldChange: result.wouldChange,
    ...(result.opId !== undefined ? { opId: result.opId } : {}),
    ...(result.createdNodeId !== undefined ? { createdNodeId: result.createdNodeId } : {}),
    ...(result.deletedNodeId !== undefined ? { deletedNodeId: result.deletedNodeId } : {}),
    ...(result.risks !== undefined ? { risks: result.risks } : {}),
    ...(result.targetSummary !== undefined ? { targetSummary: result.targetSummary } : {}),
    ...(result.updatedNodeId !== undefined ? { updatedNodeId: result.updatedNodeId } : {})
  };

  return compact;
}

function isReference(value: BatchResolvableId): value is BatchValueReference {
  return typeof value === "object" && value !== null && "fromOp" in value;
}

function makeSyntheticId(opKey: string, field: BatchResultField): string {
  return `${SYNTHETIC_PREFIX}:${opKey}:${field}`;
}

function isSyntheticId(value: string): boolean {
  return value.startsWith(`${SYNTHETIC_PREFIX}:`);
}

function summarizeOperation(operation: BatchEditV2Operation): string {
  switch (operation.op) {
    case "rename_node":
      return `rename node`;
    case "create_page":
      return `create page ${operation.name}`;
    case "create_frame":
      return `create frame ${operation.name ?? "Frame"}`;
    case "create_rectangle":
      return `create rectangle ${operation.name ?? "Rectangle"}`;
    case "create_instance":
      return `create instance`;
    case "create_text":
      return `create text ${operation.name ?? "Text"}`;
    case "duplicate_node":
      return `duplicate node`;
    case "set_text":
      return `set text`;
    case "set_instance_properties":
      return `set instance properties`;
    case "set_image_fill":
      return `set image fill`;
    case "update_node_properties":
      return `update node properties`;
    case "move_node":
      return `move node`;
    case "delete_node":
      return `delete node`;
    case "bind_variable":
      return `bind variable`;
  }
}

function mapBatchErrorCode(message: string): BatchEditItemResult["error"] extends infer T
  ? T extends { code: infer TCode }
    ? TCode
    : never
  : never {
  if (message.includes("not found") || message.includes("removed earlier in this dry run")) {
    return "node_not_found";
  }
  if (
    message.includes("text node")
    || message.includes("scene node")
    || message.includes("instance")
    || message.includes("component or component set")
    || message.includes("cannot contain children")
    || message.includes("support")
  ) {
    return "node_type_mismatch";
  }
  if (message.includes("font")) {
    return "font_load_failed";
  }
  if (message.includes("confirm=true")) {
    return "permission_denied";
  }

  return "internal_error";
}

function asRecord(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function opKey(operation: BatchEditV2Operation, index: number): string {
  return operation.opId ?? `index_${index}`;
}

function registerResult(context: BatchContext, operation: BatchEditV2Operation, result: BatchEditItemResult): void {
  if (operation.opId) {
    context.resultsByOpId.set(operation.opId, result);
  }
}

function registerSyntheticKind(
  context: BatchContext,
  result: BatchEditItemResult,
  kind: SyntheticNodeKind | undefined
): void {
  if (!kind) {
    return;
  }

  if (result.createdNodeId && isSyntheticId(result.createdNodeId)) {
    context.syntheticKinds.set(result.createdNodeId, kind);
  }
  if (result.updatedNodeId && isSyntheticId(result.updatedNodeId)) {
    context.syntheticKinds.set(result.updatedNodeId, kind);
  }
  if (result.deletedNodeId && isSyntheticId(result.deletedNodeId)) {
    context.syntheticKinds.set(result.deletedNodeId, kind);
  }
}

function canonicalizeNodeId(nodeId: string, context: BatchContext): string {
  let current = nodeId;
  const visited = new Set<string>();

  while (!visited.has(current)) {
    visited.add(current);
    const aliased = context.syntheticAliases.get(current);
    if (!aliased || aliased === current) {
      return current;
    }
    current = aliased;
  }

  return current;
}

function resolveId(value: BatchResolvableId, context: BatchContext, label: string): string {
  if (!isReference(value)) {
    return value;
  }

  const source = context.resultsByOpId.get(value.fromOp);
  if (!source) {
    throw new Error(`Reference ${label} points to unknown opId ${value.fromOp}`);
  }

  const field = value.field ?? "createdNodeId";
  const resolved = source[field];
  if (!resolved) {
    throw new Error(`Operation ${value.fromOp} did not produce ${field}`);
  }

  return resolved;
}

function resolveOptionalId(
  value: BatchResolvableId | undefined,
  context: BatchContext,
  label: string
): string | undefined {
  return value === undefined ? undefined : resolveId(value, context, label);
}

function resolveNullableId(
  value: BatchResolvableId | null | undefined,
  context: BatchContext,
  label: string
): string | null | undefined {
  if (value === undefined || value === null) {
    return value;
  }

  return resolveId(value, context, label);
}

async function getConcreteNode(nodeId: string): Promise<BaseNode | null> {
  if (isSyntheticId(nodeId)) {
    return null;
  }

  return figma.getNodeByIdAsync(nodeId);
}

async function wasRemovedInDryRun(nodeId: string, context: BatchContext): Promise<boolean> {
  let currentId: string | null = canonicalizeNodeId(nodeId, context);
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    if (context.deletedNodeIds.has(currentId)) {
      return true;
    }

    const shadowParentId = context.shadowParentIds.get(currentId);
    if (shadowParentId !== undefined) {
      currentId = shadowParentId;
      continue;
    }

    if (isSyntheticId(currentId)) {
      return false;
    }

    const node = await figma.getNodeByIdAsync(currentId);
    currentId = node?.parent?.id ?? null;
  }

  return false;
}

async function assertNodeAvailable(nodeId: string, context: BatchContext): Promise<void> {
  if (await wasRemovedInDryRun(nodeId, context)) {
    throw new Error(`Node ${nodeId} was removed earlier in this dry run and would not be found by later ops`);
  }
}

async function resolveCurrentParentId(nodeId: string, context: BatchContext): Promise<string | null> {
  const canonicalNodeId = canonicalizeNodeId(nodeId, context);
  const shadowParentId = context.shadowParentIds.get(canonicalNodeId);
  if (shadowParentId !== undefined) {
    return shadowParentId;
  }

  const node = await getConcreteNode(canonicalNodeId);
  return node?.parent?.id ?? null;
}

function hasActiveAutoLayout(node: BaseNode | null | undefined): boolean {
  return Boolean(node && hasAutoLayout(node) && node.layoutMode !== "NONE");
}

function addRisk(
  risks: BatchEditItemRisk[],
  code: BatchEditItemRisk["code"],
  severity: BatchEditItemRisk["severity"],
  message: string,
  relatedNodeId?: string
): void {
  if (risks.some((risk) => risk.code === code && risk.relatedNodeId === relatedNodeId && risk.message === message)) {
    return;
  }

  risks.push({
    code,
    severity,
    message,
    ...(relatedNodeId ? { relatedNodeId } : {})
  });
}

async function analyzeDryRunRisks({
  operation,
  result,
  context
}: DryRunRiskContext): Promise<BatchEditItemRisk[] | undefined> {
  if (!result.ok) {
    return undefined;
  }

  const risks: BatchEditItemRisk[] = [];

  switch (operation.op) {
    case "create_frame":
    case "create_rectangle":
    case "create_text":
    case "create_instance":
    case "duplicate_node": {
      const parentId = "parentId" in operation && operation.parentId !== undefined
        ? canonicalizeNodeId(resolveId(operation.parentId, context, "parentId"), context)
        : undefined;
      const parentNode = await getConcreteNode(parentId ?? figma.currentPage.id);
      if (hasActiveAutoLayout(parentNode)) {
        addRisk(
          risks,
          "auto_layout_reflow",
          "medium",
          "Adding or duplicating children inside an auto-layout container can reflow sibling layers.",
          parentNode?.id
        );
        if (("x" in operation && operation.x !== undefined) || ("y" in operation && operation.y !== undefined)) {
          addRisk(
            risks,
            "auto_layout_position_ignored",
            "medium",
            "Explicit x/y coordinates may be ignored when the new layer is inserted into auto layout.",
            parentNode?.id
          );
        }
      }
      break;
    }
    case "move_node": {
      const nodeId = canonicalizeNodeId(resolveId(operation.nodeId, context, "nodeId"), context);
      const parentId = canonicalizeNodeId(resolveId(operation.parentId, context, "parentId"), context);
      const node = await getConcreteNode(nodeId);
      const targetParent = await getConcreteNode(parentId);
      const sourceParent = node?.parent ?? null;
      if (sourceParent && sourceParent.id !== parentId) {
        addRisk(
          risks,
          "cross_parent_move",
          "medium",
          "Moving a layer across parents can change constraints, stacking order, and inherited layout behavior.",
          nodeId
        );
      }
      if (hasActiveAutoLayout(sourceParent) || hasActiveAutoLayout(targetParent)) {
        addRisk(
          risks,
          "auto_layout_reflow",
          "high",
          "Moving a layer into or out of auto layout can reflow siblings and change the final layout unexpectedly.",
          nodeId
        );
      }
      break;
    }
    case "delete_node": {
      const nodeId = canonicalizeNodeId(resolveId(operation.nodeId, context, "nodeId"), context);
      const node = await getConcreteNode(nodeId);
      addRisk(
        risks,
        "destructive_delete",
        "medium",
        "Deleting a layer is destructive; if a later op fails, earlier dry-run assumptions may no longer match the document.",
        nodeId
      );
      if (hasActiveAutoLayout(node?.parent ?? null)) {
        addRisk(
          risks,
          "auto_layout_reflow",
          "high",
          "Deleting a child from auto layout will reflow remaining siblings.",
          nodeId
        );
      }
      break;
    }
    case "set_instance_properties": {
      const nodeId = canonicalizeNodeId(resolveId(operation.nodeId, context, "nodeId"), context);
      const swapComponentId = resolveOptionalId(operation.swapComponentId, context, "swapComponentId");
      if (swapComponentId) {
        addRisk(
          risks,
          "instance_swap_overrides",
          operation.preserveOverrides === true ? "medium" : "high",
          operation.preserveOverrides === true
            ? "Swapping the backing component can still change size, slot structure, or variant behavior even when preserving overrides."
            : "Swapping the backing component can drop overrides or change layer structure if the target component differs.",
          nodeId
        );
      }
      break;
    }
    case "update_node_properties": {
      const nodeId = canonicalizeNodeId(resolveId(operation.nodeId, context, "nodeId"), context);
      const node = await getConcreteNode(nodeId);
      const parent = node?.parent ?? null;
      const touchesPosition = operation.properties.x !== undefined || operation.properties.y !== undefined;
      const touchesLayoutSize =
        operation.properties.width !== undefined
        || operation.properties.height !== undefined
        || operation.properties.layout !== undefined
        || operation.properties.layoutGrow !== undefined
        || operation.properties.layoutAlign !== undefined;
      if (touchesPosition && hasActiveAutoLayout(parent)) {
        addRisk(
          risks,
          "auto_layout_position_ignored",
          "medium",
          "Position changes on children inside auto layout are often overridden by the parent layout.",
          nodeId
        );
      }
      if (touchesLayoutSize && (hasActiveAutoLayout(parent) || (node && hasAutoLayoutChild(node)))) {
        addRisk(
          risks,
          "layout_resize_side_effect",
          "medium",
          "Changing size or layout properties can cascade through auto-layout sizing and affect nearby layers.",
          nodeId
        );
      }
      break;
    }
  }

  return risks.length > 0 ? risks : undefined;
}

async function requireChildContainer(nodeId: string, context: BatchContext): Promise<void> {
  const canonicalNodeId = canonicalizeNodeId(nodeId, context);
  await assertNodeAvailable(canonicalNodeId, context);
  if (isSyntheticId(canonicalNodeId)) {
    const kind = context.syntheticKinds.get(canonicalNodeId);
    if (kind && kind !== "FRAME" && kind !== "PAGE" && kind !== "SCENE") {
      throw new Error(`Node ${nodeId} cannot contain children`);
    }
    return;
  }

  const node = await getConcreteNode(canonicalNodeId);
  if (!node) {
    return;
  }
  if (!hasChildren(node)) {
    throw new Error(`Node ${nodeId} cannot contain children`);
  }
}

async function requireComponentSource(nodeId: string, context: BatchContext): Promise<void> {
  const canonicalNodeId = canonicalizeNodeId(nodeId, context);
  await assertNodeAvailable(canonicalNodeId, context);
  const node = await getConcreteNode(canonicalNodeId);
  if (!node) {
    return;
  }
  if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") {
    throw new Error(`Node ${nodeId} is not a component or component set`);
  }
}

async function requireScene(nodeId: string, context: BatchContext): Promise<void> {
  const canonicalNodeId = canonicalizeNodeId(nodeId, context);
  await assertNodeAvailable(canonicalNodeId, context);
  if (isSyntheticId(canonicalNodeId)) {
    const kind = context.syntheticKinds.get(canonicalNodeId);
    if (kind === "PAGE") {
      throw new Error(`Node ${nodeId} is not a scene node`);
    }
    return;
  }

  const node = await getConcreteNode(canonicalNodeId);
  if (!node) {
    return;
  }
  if (!isSceneNode(node)) {
    throw new Error(`Node ${nodeId} is not a scene node`);
  }
}

async function requireText(nodeId: string, context: BatchContext): Promise<void> {
  const canonicalNodeId = canonicalizeNodeId(nodeId, context);
  await assertNodeAvailable(canonicalNodeId, context);
  if (isSyntheticId(canonicalNodeId)) {
    const kind = context.syntheticKinds.get(canonicalNodeId);
    if (kind && kind !== "TEXT") {
      throw new Error(`Node ${nodeId} is not a text node`);
    }
    return;
  }

  const node = await figma.getNodeByIdAsync(canonicalNodeId);
  if (!node || !isTextNode(node)) {
    throw new Error(node ? `Node ${nodeId} is not a text node` : `Node ${nodeId} was not found`);
  }
}

async function requireInstance(nodeId: string, context: BatchContext): Promise<void> {
  const canonicalNodeId = canonicalizeNodeId(nodeId, context);
  await assertNodeAvailable(canonicalNodeId, context);
  if (isSyntheticId(canonicalNodeId)) {
    const kind = context.syntheticKinds.get(canonicalNodeId);
    if (kind && kind !== "INSTANCE") {
      throw new Error(`Node ${nodeId} is not an instance`);
    }
    return;
  }

  const node = await figma.getNodeByIdAsync(canonicalNodeId);
  if (!node || !isInstanceNode(node)) {
    throw new Error(node ? `Node ${nodeId} is not an instance` : `Node ${nodeId} was not found`);
  }
}

async function requireFillableNode(nodeId: string, context: BatchContext): Promise<void> {
  const canonicalNodeId = canonicalizeNodeId(nodeId, context);
  await assertNodeAvailable(canonicalNodeId, context);
  const node = await getConcreteNode(canonicalNodeId);
  if (!node) {
    return;
  }
  if (!isSceneNode(node) || !hasFills(node)) {
    throw new Error(`Node ${nodeId} does not support fills`);
  }
}

async function requireVariable(variableId: string | null | undefined): Promise<void> {
  if (!variableId || isSyntheticId(variableId)) {
    return;
  }

  const variable = await figma.variables.getVariableByIdAsync(variableId);
  if (!variable) {
    throw new Error(`Variable ${variableId} was not found`);
  }
}

async function recordDryRunMutation(
  context: BatchContext,
  operation: BatchEditV2Operation,
  result: BatchEditItemResult
): Promise<void> {
  if (!result.ok) {
    return;
  }

  switch (operation.op) {
    case "create_frame":
    case "create_rectangle":
    case "create_instance":
    case "create_text": {
      if (!result.createdNodeId || !isSyntheticId(result.createdNodeId)) {
        return;
      }
      const parentId = operation.parentId !== undefined
        ? canonicalizeNodeId(resolveId(operation.parentId, context, "parentId"), context)
        : figma.currentPage.id;
      context.shadowParentIds.set(result.createdNodeId, parentId);
      return;
    }
    case "duplicate_node": {
      if (!result.createdNodeId || !isSyntheticId(result.createdNodeId)) {
        return;
      }
      const sourceNodeId = resolveId(operation.nodeId, context, "nodeId");
      const parentId = operation.parentId !== undefined
        ? canonicalizeNodeId(resolveId(operation.parentId, context, "parentId"), context)
        : await resolveCurrentParentId(sourceNodeId, context);
      context.shadowParentIds.set(result.createdNodeId, parentId);
      return;
    }
    case "rename_node":
    case "set_text":
    case "set_instance_properties":
    case "set_image_fill":
    case "update_node_properties":
    case "bind_variable": {
      if (!result.updatedNodeId || !isSyntheticId(result.updatedNodeId) || !("nodeId" in operation)) {
        return;
      }
      const sourceNodeId = canonicalizeNodeId(resolveId(operation.nodeId, context, "nodeId"), context);
      context.syntheticAliases.set(result.updatedNodeId, sourceNodeId);
      return;
    }
    case "move_node": {
      const sourceNodeId = canonicalizeNodeId(resolveId(operation.nodeId, context, "nodeId"), context);
      const parentId = canonicalizeNodeId(resolveId(operation.parentId, context, "parentId"), context);
      context.shadowParentIds.set(sourceNodeId, parentId);
      if (result.updatedNodeId && isSyntheticId(result.updatedNodeId)) {
        context.syntheticAliases.set(result.updatedNodeId, sourceNodeId);
      }
      return;
    }
    case "delete_node": {
      const sourceNodeId = canonicalizeNodeId(resolveId(operation.nodeId, context, "nodeId"), context);
      context.deletedNodeIds.add(sourceNodeId);
      if (result.deletedNodeId && isSyntheticId(result.deletedNodeId)) {
        context.syntheticAliases.set(result.deletedNodeId, sourceNodeId);
      }
      return;
    }
    case "create_page":
      return;
  }
}

async function dryRunOperation(
  operation: BatchEditV2Operation,
  index: number,
  context: BatchContext
): Promise<{ result: BatchEditItemResult; kind?: SyntheticNodeKind }> {
  const base: Omit<BatchEditItemResult, "ok" | "wouldChange"> = {
    index,
    op: operation.op,
    opId: operation.opId,
    targetSummary: summarizeOperation(operation)
  };

  switch (operation.op) {
    case "create_page": {
      const result: BatchEditItemResult = {
        ...base,
        ok: true,
        wouldChange: true,
        createdNodeId: operation.opId ? makeSyntheticId(opKey(operation, index), "createdNodeId") : undefined,
        preview: {
          after: { name: operation.name }
        }
      };
      return { result, kind: "PAGE" };
    }
    case "create_frame": {
      const parentId = resolveOptionalId(operation.parentId, context, "parentId");
      if (parentId) {
        await requireChildContainer(parentId, context);
      }
      const result: BatchEditItemResult = {
        ...base,
        ok: true,
        wouldChange: true,
        createdNodeId: operation.opId ? makeSyntheticId(opKey(operation, index), "createdNodeId") : undefined,
        preview: {
          after: {
            parentId: parentId ?? figma.currentPage.id,
            name: operation.name ?? "Frame",
            width: operation.width,
            height: operation.height
          }
        }
      };
      return { result, kind: "FRAME" };
    }
    case "create_rectangle": {
      const parentId = resolveOptionalId(operation.parentId, context, "parentId");
      if (parentId) {
        await requireChildContainer(parentId, context);
      }
      const result: BatchEditItemResult = {
        ...base,
        ok: true,
        wouldChange: true,
        createdNodeId: operation.opId ? makeSyntheticId(opKey(operation, index), "createdNodeId") : undefined,
        preview: {
          after: {
            parentId: parentId ?? figma.currentPage.id,
            name: operation.name ?? "Rectangle",
            width: operation.width,
            height: operation.height,
            cornerRadius: operation.cornerRadius
          }
        }
      };
      return { result, kind: "RECTANGLE" };
    }
    case "create_instance": {
      const componentId = resolveId(operation.componentId, context, "componentId");
      const parentId = resolveOptionalId(operation.parentId, context, "parentId");
      await requireComponentSource(componentId, context);
      if (parentId) {
        await requireChildContainer(parentId, context);
      }
      const result: BatchEditItemResult = {
        ...base,
        ok: true,
        wouldChange: true,
        createdNodeId: operation.opId ? makeSyntheticId(opKey(operation, index), "createdNodeId") : undefined,
        preview: {
          after: {
            componentId,
            parentId: parentId ?? figma.currentPage.id,
            name: operation.name ?? null
          }
        }
      };
      return { result, kind: "INSTANCE" };
    }
    case "create_text": {
      const parentId = resolveOptionalId(operation.parentId, context, "parentId");
      if (parentId) {
        await requireChildContainer(parentId, context);
      }
      const result: BatchEditItemResult = {
        ...base,
        ok: true,
        wouldChange: true,
        createdNodeId: operation.opId ? makeSyntheticId(opKey(operation, index), "createdNodeId") : undefined,
        preview: {
          after: {
            parentId: parentId ?? figma.currentPage.id,
            name: operation.name ?? "Text",
            text: operation.text ?? ""
          }
        }
      };
      return { result, kind: "TEXT" };
    }
    case "rename_node": {
      const nodeId = resolveId(operation.nodeId, context, "nodeId");
      await requireScene(nodeId, context);
      const result: BatchEditItemResult = {
        ...base,
        ok: true,
        wouldChange: true,
        updatedNodeId: operation.opId ? makeSyntheticId(opKey(operation, index), "updatedNodeId") : nodeId,
        preview: {
          after: { name: operation.name }
        }
      };
      const kind = context.syntheticKinds.get(nodeId);
      return kind ? { result, kind } : { result };
    }
    case "duplicate_node": {
      const nodeId = resolveId(operation.nodeId, context, "nodeId");
      const parentId = resolveOptionalId(operation.parentId, context, "parentId");
      await requireScene(nodeId, context);
      if (parentId) {
        await requireChildContainer(parentId, context);
      }
      const result: BatchEditItemResult = {
        ...base,
        ok: true,
        wouldChange: true,
        createdNodeId: operation.opId ? makeSyntheticId(opKey(operation, index), "createdNodeId") : undefined,
        preview: {
          after: {
            sourceNodeId: nodeId,
            parentId: parentId ?? null,
            name: operation.name ?? null
          }
        }
      };
      return { result, kind: context.syntheticKinds.get(nodeId) ?? "SCENE" };
    }
    case "set_text": {
      const nodeId = resolveId(operation.nodeId, context, "nodeId");
      await requireText(nodeId, context);
      const result: BatchEditItemResult = {
        ...base,
        ok: true,
        wouldChange: true,
        updatedNodeId: operation.opId ? makeSyntheticId(opKey(operation, index), "updatedNodeId") : nodeId,
        preview: {
          after: { text: operation.text }
        }
      };
      return { result, kind: "TEXT" };
    }
    case "set_instance_properties": {
      const nodeId = resolveId(operation.nodeId, context, "nodeId");
      await requireInstance(nodeId, context);
      const swapComponentId = resolveOptionalId(operation.swapComponentId, context, "swapComponentId");
      if (swapComponentId) {
        await requireComponentSource(swapComponentId, context);
      }
      const result: BatchEditItemResult = {
        ...base,
        ok: true,
        wouldChange: true,
        updatedNodeId: operation.opId ? makeSyntheticId(opKey(operation, index), "updatedNodeId") : nodeId,
        preview: {
          after: {
            variantProperties: operation.variantProperties,
            componentProperties: operation.componentProperties,
            swapComponentId: swapComponentId ?? null
          }
        }
      };
      return { result, kind: "INSTANCE" };
    }
    case "set_image_fill": {
      const nodeId = resolveId(operation.nodeId, context, "nodeId");
      await requireFillableNode(nodeId, context);
      const result: BatchEditItemResult = {
        ...base,
        ok: true,
        wouldChange: true,
        updatedNodeId: operation.opId ? makeSyntheticId(opKey(operation, index), "updatedNodeId") : nodeId,
        preview: {
          after: {
            scaleMode: operation.image.scaleMode,
            preserveOtherFills: operation.preserveOtherFills ?? false
          }
        }
      };
      const kind = context.syntheticKinds.get(nodeId) ?? "SCENE";
      return { result, kind };
    }
    case "update_node_properties": {
      const nodeId = resolveId(operation.nodeId, context, "nodeId");
      await requireScene(nodeId, context);
      const result: BatchEditItemResult = {
        ...base,
        ok: true,
        wouldChange: true,
        updatedNodeId: operation.opId ? makeSyntheticId(opKey(operation, index), "updatedNodeId") : nodeId,
        preview: {
          after: operation.properties as unknown as Record<string, unknown>
        }
      };
      const kind = context.syntheticKinds.get(nodeId) ?? "SCENE";
      return { result, kind };
    }
    case "move_node": {
      const nodeId = resolveId(operation.nodeId, context, "nodeId");
      const parentId = resolveId(operation.parentId, context, "parentId");
      await requireScene(nodeId, context);
      await requireChildContainer(parentId, context);
      const result: BatchEditItemResult = {
        ...base,
        ok: true,
        wouldChange: true,
        updatedNodeId: operation.opId ? makeSyntheticId(opKey(operation, index), "updatedNodeId") : nodeId,
        preview: {
          after: {
            parentId,
            index: operation.index ?? null
          }
        }
      };
      const kind = context.syntheticKinds.get(nodeId) ?? "SCENE";
      return { result, kind };
    }
    case "delete_node": {
      const nodeId = resolveId(operation.nodeId, context, "nodeId");
      await requireScene(nodeId, context);
      const result: BatchEditItemResult = {
        ...base,
        ok: true,
        wouldChange: true,
        deletedNodeId: operation.opId ? makeSyntheticId(opKey(operation, index), "deletedNodeId") : nodeId
      };
      const kind = context.syntheticKinds.get(nodeId) ?? "SCENE";
      return { result, kind };
    }
    case "bind_variable": {
      const nodeId = resolveId(operation.nodeId, context, "nodeId");
      const variableId = resolveNullableId(operation.variableId, context, "variableId");
      await requireScene(nodeId, context);
      await requireVariable(variableId);
      const result: BatchEditItemResult = {
        ...base,
        ok: true,
        wouldChange: true,
        updatedNodeId: operation.opId ? makeSyntheticId(opKey(operation, index), "updatedNodeId") : nodeId,
        preview: {
          after: {
            variableId,
            kind: operation.kind,
            field: operation.field
          }
        }
      };
      const kind = context.syntheticKinds.get(nodeId) ?? "SCENE";
      return { result, kind };
    }
  }
}

async function runOperation(
  operation: BatchEditV2Operation,
  index: number,
  context: BatchContext,
  batchConfirmed: boolean,
  compactResults: boolean
): Promise<BatchEditItemResult> {
  const base = {
    index,
    op: operation.op,
    opId: operation.opId,
    targetSummary: summarizeOperation(operation)
  } satisfies Partial<BatchEditItemResult>;

  switch (operation.op) {
    case "rename_node": {
      const result = await renameNode({
        nodeId: resolveId(operation.nodeId, context, "nodeId"),
        name: operation.name
      } satisfies RenameNodePayload);
      return {
        ...base,
        ok: true,
        wouldChange: true,
        result: asRecord(result),
        updatedNodeId: result.node.id
      };
    }
    case "create_page": {
      const result = createPage({
        name: operation.name
      } satisfies CreatePagePayload);
      return {
        ...base,
        ok: true,
        wouldChange: true,
        result: asRecord(result),
        createdNodeId: result.page.id
      };
    }
    case "create_frame": {
      const result = await createFrame({
        parentId: resolveOptionalId(operation.parentId, context, "parentId"),
        name: operation.name,
        x: operation.x,
        y: operation.y,
        width: operation.width,
        height: operation.height,
        returnNodeDetails: operation.returnNodeDetails ?? !compactResults
      } satisfies CreateFramePayload);
      return {
        ...base,
        ok: true,
        wouldChange: true,
        result: asRecord(result),
        createdNodeId: result.node.id
      };
    }
    case "create_rectangle": {
      const result = await createRectangle({
        parentId: resolveOptionalId(operation.parentId, context, "parentId"),
        name: operation.name,
        x: operation.x,
        y: operation.y,
        width: operation.width,
        height: operation.height,
        cornerRadius: operation.cornerRadius,
        returnNodeDetails: operation.returnNodeDetails ?? !compactResults
      } satisfies CreateRectanglePayload);
      return {
        ...base,
        ok: true,
        wouldChange: true,
        result: asRecord(result),
        createdNodeId: result.node.id
      };
    }
    case "create_instance": {
      const result = await createInstance({
        componentId: resolveId(operation.componentId, context, "componentId"),
        parentId: resolveOptionalId(operation.parentId, context, "parentId"),
        name: operation.name,
        x: operation.x,
        y: operation.y,
        width: operation.width,
        height: operation.height,
        index: operation.index,
        returnNodeDetails: operation.returnNodeDetails ?? !compactResults
      } satisfies CreateInstancePayload);
      return {
        ...base,
        ok: true,
        wouldChange: true,
        result: asRecord(result),
        createdNodeId: result.node.id
      };
    }
    case "create_text": {
      const result = await createText({
        parentId: resolveOptionalId(operation.parentId, context, "parentId"),
        name: operation.name,
        text: operation.text,
        x: operation.x,
        y: operation.y,
        returnNodeDetails: operation.returnNodeDetails ?? !compactResults
      } satisfies CreateTextPayload);
      return {
        ...base,
        ok: true,
        wouldChange: true,
        result: asRecord(result),
        createdNodeId: result.node.id
      };
    }
    case "duplicate_node": {
      const result = await duplicateNode({
        nodeId: resolveId(operation.nodeId, context, "nodeId"),
        parentId: resolveOptionalId(operation.parentId, context, "parentId"),
        name: operation.name,
        x: operation.x,
        y: operation.y,
        index: operation.index,
        returnNodeDetails: operation.returnNodeDetails ?? !compactResults
      } satisfies DuplicateNodePayload);
      return {
        ...base,
        ok: true,
        wouldChange: true,
        result: asRecord(result),
        createdNodeId: result.node.id
      };
    }
    case "set_text": {
      const result = await setText({
        nodeId: resolveId(operation.nodeId, context, "nodeId"),
        text: operation.text
      } satisfies SetTextPayload);
      return {
        ...base,
        ok: true,
        wouldChange: true,
        result: asRecord(result),
        updatedNodeId: result.node.id
      };
    }
    case "set_instance_properties": {
      const result = await setInstanceProperties({
        nodeId: resolveId(operation.nodeId, context, "nodeId"),
        variantProperties: operation.variantProperties,
        componentProperties: operation.componentProperties,
        swapComponentId: resolveOptionalId(operation.swapComponentId, context, "swapComponentId"),
        preserveOverrides: operation.preserveOverrides,
        returnNodeDetails: operation.returnNodeDetails ?? !compactResults
      } satisfies SetInstancePropertiesPayload);
      return {
        ...base,
        ok: true,
        wouldChange: result.updatedFields.length > 0,
        result: asRecord(result),
        updatedNodeId: result.node.id
      };
    }
    case "set_image_fill": {
      const result = await setImageFill({
        nodeId: resolveId(operation.nodeId, context, "nodeId"),
        image: operation.image,
        paintIndex: operation.paintIndex,
        preserveOtherFills: operation.preserveOtherFills,
        returnNodeDetails: operation.returnNodeDetails ?? !compactResults
      } satisfies SetImageFillPayload);
      return {
        ...base,
        ok: true,
        wouldChange: true,
        result: asRecord(result),
        updatedNodeId: result.node.id
      };
    }
    case "update_node_properties": {
      const result = await updateNodeProperties({
        nodeId: resolveId(operation.nodeId, context, "nodeId"),
        properties: operation.properties,
        returnNodeDetails: operation.returnNodeDetails ?? !compactResults
      } satisfies UpdateNodePropertiesPayload);
      return {
        ...base,
        ok: true,
        wouldChange: result.updatedFields.length > 0,
        result: asRecord(result),
        updatedNodeId: result.node.id
      };
    }
    case "move_node": {
      const result = await moveNode({
        nodeId: resolveId(operation.nodeId, context, "nodeId"),
        parentId: resolveId(operation.parentId, context, "parentId"),
        index: operation.index,
        returnNodeDetails: operation.returnNodeDetails ?? !compactResults
      } satisfies MoveNodePayload);
      return {
        ...base,
        ok: true,
        wouldChange: true,
        result: asRecord(result),
        updatedNodeId: result.node.id
      };
    }
    case "delete_node": {
      const result = await deleteNode({
        nodeId: resolveId(operation.nodeId, context, "nodeId"),
        confirm: batchConfirmed
      } satisfies DeleteNodePayload);
      return {
        ...base,
        ok: true,
        wouldChange: true,
        result: asRecord(result),
        deletedNodeId: result.deletedNodeId
      };
    }
    case "bind_variable": {
      const result = await bindVariable({
        nodeId: resolveId(operation.nodeId, context, "nodeId"),
        variableId: resolveNullableId(operation.variableId, context, "variableId"),
        kind: operation.kind,
        field: operation.field,
        paintIndex: operation.paintIndex
      } satisfies BindVariablePayload);
      return {
        ...base,
        ok: true,
        wouldChange: true,
        result: asRecord(result),
        updatedNodeId: result.node.id
      };
    }
  }
}

export async function batchEditV2(payload: BatchEditV2Payload): Promise<BatchEditV2Result> {
  const dryRun = payload.dryRun ?? true;
  const compactResults = payload.compactResults ?? false;
  if (!dryRun && payload.confirm !== true) {
    throw new Error("Committed batch_edit_v2 requires confirm=true");
  }

  const results: BatchEditItemResultWithRisks[] = [];
  const context: BatchContext = {
    resultsByOpId: new Map(),
    syntheticKinds: new Map(),
    syntheticAliases: new Map(),
    shadowParentIds: new Map(),
    deletedNodeIds: new Set()
  };

  let stoppedAt: number | undefined;

  for (const [index, operation] of payload.ops.entries()) {
    try {
      const result = dryRun
        ? await dryRunOperation(operation, index, context)
        : { result: await runOperation(operation, index, context, payload.confirm === true, compactResults) };
      if (dryRun) {
        const risks = await analyzeDryRunRisks({
          operation,
          result: result.result,
          context
        });
        if (risks) {
          result.result = {
            ...result.result,
            risks
          };
        }
        await recordDryRunMutation(context, operation, result.result);
      }
      const finalResult = compactResults ? compactBatchItemResult(result.result) : result.result;
      results.push(finalResult);
      registerResult(context, operation, finalResult);
      registerSyntheticKind(context, finalResult, result.kind);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown batch operation error";
      const failure: BatchEditItemResultWithRisks = {
        index,
        op: operation.op,
        opId: operation.opId,
        ok: false,
        wouldChange: false,
        targetSummary: summarizeOperation(operation),
        error: {
          code: mapBatchErrorCode(message),
          message
        }
      };
      results.push(failure);
      if (!dryRun) {
        stoppedAt = index;
        break;
      }
    }
  }

  const successful = results.filter((result) => result.ok).length;
  const riskCount = dryRun
    ? results.reduce((total, result) => total + (result.risks?.length ?? 0), 0)
    : 0;
  const highRiskCount = dryRun
    ? results.reduce(
        (total, result) => total + (result.risks?.filter((risk) => risk.severity === "high").length ?? 0),
        0
      )
    : 0;
  const stoppedSuffix = stoppedAt === undefined ? "" : ` before stopping at operation ${stoppedAt}`;
  const riskSuffix = dryRun && riskCount > 0
    ? ` with ${riskCount} risk warning(s)${highRiskCount > 0 ? `, ${highRiskCount} high` : ""}`
    : "";

  return {
    dryRun,
    summary: `${successful}/${results.length} operation(s) ${dryRun ? "validated" : "applied"}${stoppedSuffix}${riskSuffix}`,
    results: results as BatchEditItemResult[],
    ...(dryRun ? { riskCount, highRiskCount } : {}),
    stoppedAt
  } as BatchEditV2Result;
}
