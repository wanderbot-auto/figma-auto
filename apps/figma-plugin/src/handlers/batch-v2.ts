import type {
  BatchEditItemResult,
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
  if (message.includes("not found")) {
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

async function requireChildContainer(nodeId: string): Promise<void> {
  const node = await getConcreteNode(nodeId);
  if (!node) {
    return;
  }
  if (!hasChildren(node)) {
    throw new Error(`Node ${nodeId} cannot contain children`);
  }
}

async function requireComponentSource(nodeId: string): Promise<void> {
  const node = await getConcreteNode(nodeId);
  if (!node) {
    return;
  }
  if (node.type !== "COMPONENT" && node.type !== "COMPONENT_SET") {
    throw new Error(`Node ${nodeId} is not a component or component set`);
  }
}

async function requireScene(nodeId: string): Promise<void> {
  const node = await getConcreteNode(nodeId);
  if (!node) {
    return;
  }
  if (!isSceneNode(node)) {
    throw new Error(`Node ${nodeId} is not a scene node`);
  }
}

async function requireText(nodeId: string, context: BatchContext): Promise<void> {
  if (isSyntheticId(nodeId)) {
    const kind = context.syntheticKinds.get(nodeId);
    if (kind && kind !== "TEXT") {
      throw new Error(`Node ${nodeId} is not a text node`);
    }
    return;
  }

  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || !isTextNode(node)) {
    throw new Error(node ? `Node ${nodeId} is not a text node` : `Node ${nodeId} was not found`);
  }
}

async function requireInstance(nodeId: string, context: BatchContext): Promise<void> {
  if (isSyntheticId(nodeId)) {
    const kind = context.syntheticKinds.get(nodeId);
    if (kind && kind !== "INSTANCE") {
      throw new Error(`Node ${nodeId} is not an instance`);
    }
    return;
  }

  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node || !isInstanceNode(node)) {
    throw new Error(node ? `Node ${nodeId} is not an instance` : `Node ${nodeId} was not found`);
  }
}

async function requireFillableNode(nodeId: string): Promise<void> {
  const node = await getConcreteNode(nodeId);
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
        preview: {
          after: { name: operation.name }
        }
      };
      return { result, kind: "PAGE" };
    }
    case "create_frame": {
      const parentId = resolveOptionalId(operation.parentId, context, "parentId");
      if (parentId) {
        await requireChildContainer(parentId);
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
        await requireChildContainer(parentId);
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
      await requireComponentSource(componentId);
      if (parentId) {
        await requireChildContainer(parentId);
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
        await requireChildContainer(parentId);
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
      await requireScene(nodeId);
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
      await requireScene(nodeId);
      if (parentId) {
        await requireChildContainer(parentId);
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
        await requireComponentSource(swapComponentId);
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
      await requireFillableNode(nodeId);
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
      await requireScene(nodeId);
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
      await requireScene(nodeId);
      await requireChildContainer(parentId);
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
      await requireScene(nodeId);
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
      await requireScene(nodeId);
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
  batchConfirmed: boolean
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
        result: asRecord(result)
      };
    }
    case "create_frame": {
      const result = await createFrame({
        parentId: resolveOptionalId(operation.parentId, context, "parentId"),
        name: operation.name,
        x: operation.x,
        y: operation.y,
        width: operation.width,
        height: operation.height
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
        cornerRadius: operation.cornerRadius
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
        index: operation.index
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
        y: operation.y
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
        index: operation.index
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
        preserveOverrides: operation.preserveOverrides
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
        preserveOtherFills: operation.preserveOtherFills
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
        properties: operation.properties
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
        index: operation.index
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
  if (!dryRun && payload.confirm !== true) {
    throw new Error("Committed batch_edit_v2 requires confirm=true");
  }

  const results: BatchEditItemResult[] = [];
  const context: BatchContext = {
    resultsByOpId: new Map(),
    syntheticKinds: new Map()
  };

  let stoppedAt: number | undefined;

  for (const [index, operation] of payload.ops.entries()) {
    try {
      const result = dryRun
        ? await dryRunOperation(operation, index, context)
        : { result: await runOperation(operation, index, context, payload.confirm === true) };
      results.push(result.result);
      registerResult(context, operation, result.result);
      registerSyntheticKind(context, result.result, result.kind);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown batch operation error";
      const failure: BatchEditItemResult = {
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
  const stoppedSuffix = stoppedAt === undefined ? "" : ` before stopping at operation ${stoppedAt}`;

  return {
    dryRun,
    summary: `${successful}/${results.length} operation(s) ${dryRun ? "validated" : "applied"}${stoppedSuffix}`,
    results,
    stoppedAt
  };
}
