import type {
  AppliedStyleRefs,
  AutoLayoutMode,
  BoundVariableRef,
  FileSummary,
  FindNodeMatch,
  FindNodesPayload,
  FindNodesResult,
  GetCurrentPageResult,
  GetFileResult,
  GetNodeResult,
  GetNodeTreePayload,
  GetNodeTreeResult,
  GetSelectionResult,
  InstanceMetadata,
  LetterSpacingValue,
  LineHeightValue,
  ListPagesResult,
  NodeDetails,
  NodeSummary,
  NodeTreeNode,
  PageSummary,
  PingResult,
} from "@figma-auto/protocol";

import {
  hasAutoLayout,
  hasAutoLayoutChild,
  hasChildren,
  hasClipsContent,
  hasCornerRadius,
  hasEffects,
  hasFills,
  hasGridStyle,
  hasOpacity,
  hasRotation,
  hasStrokes,
  isSceneNode,
  isTextNode,
  requireBaseNode
} from "./node-helpers.js";
import { serializePaints } from "./paints.js";

function isMixed(value: unknown): boolean {
  return value === figma.mixed;
}

function isFontNameValue(value: FontName | typeof figma.mixed): value is FontName {
  return value !== figma.mixed;
}

function isTextCaseValue(value: TextCase | typeof figma.mixed): value is TextCase {
  return value !== figma.mixed;
}

function isTextDecorationValue(value: TextDecoration | typeof figma.mixed): value is TextDecoration {
  return value !== figma.mixed;
}

function serializeLineHeight(lineHeight: LineHeight | typeof figma.mixed): LineHeightValue | undefined {
  if (lineHeight === figma.mixed) {
    return undefined;
  }

  if (lineHeight.unit === "AUTO") {
    return { unit: "AUTO" };
  }

  return {
    unit: lineHeight.unit,
    value: lineHeight.value
  };
}

function serializeLetterSpacing(letterSpacing: LetterSpacing | typeof figma.mixed): LetterSpacingValue | undefined {
  if (letterSpacing === figma.mixed) {
    return undefined;
  }

  return {
    unit: letterSpacing.unit,
    value: letterSpacing.value
  };
}

function normalizeStyleId(styleId: string | typeof figma.mixed | undefined): string | null | undefined {
  if (styleId === undefined) {
    return undefined;
  }
  if (styleId === figma.mixed) {
    return null;
  }

  return styleId.length > 0 ? styleId : null;
}

function collectStyleRefs(node: BaseNode): AppliedStyleRefs | undefined {
  const styles: AppliedStyleRefs = {};

  if (hasFills(node)) {
    styles.fillStyleId = normalizeStyleId(node.fillStyleId);
  }
  if (hasStrokes(node)) {
    styles.strokeStyleId = normalizeStyleId(node.strokeStyleId);
  }
  if (hasEffects(node)) {
    styles.effectStyleId = normalizeStyleId(node.effectStyleId);
  }
  if (hasGridStyle(node)) {
    styles.gridStyleId = normalizeStyleId(node.gridStyleId);
  }
  if (isTextNode(node)) {
    styles.textStyleId = normalizeStyleId(node.textStyleId);
  }

  return Object.keys(styles).length > 0 ? styles : undefined;
}

function pushVariableBinding(
  results: BoundVariableRef[],
  kind: BoundVariableRef["kind"],
  field: string,
  variable: VariableAlias,
  paintIndex?: number
): void {
  results.push({
    kind,
    field,
    variableId: variable.id,
    ...(paintIndex !== undefined ? { paintIndex } : {})
  });
}

function serializeBoundVariables(boundVariables: unknown): BoundVariableRef[] | undefined {
  if (!boundVariables || typeof boundVariables !== "object") {
    return undefined;
  }

  const bindings: BoundVariableRef[] = [];

  for (const [field, value] of Object.entries(boundVariables as Record<string, unknown>)) {
    if (!value) {
      continue;
    }

    if (field === "componentProperties" && typeof value === "object" && !Array.isArray(value)) {
      for (const [propertyName, alias] of Object.entries(value as Record<string, unknown>)) {
        if (alias && typeof alias === "object" && "id" in alias && typeof alias.id === "string") {
          pushVariableBinding(bindings, "component_property", propertyName, alias as VariableAlias);
        }
      }
      continue;
    }

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (!item || typeof item !== "object" || !("id" in item) || typeof item.id !== "string") {
          return;
        }

        if (field === "fills" || field === "strokes") {
          pushVariableBinding(bindings, "paint", field, item as VariableAlias, index);
          return;
        }
        if (field === "effects") {
          pushVariableBinding(bindings, "effect", field, item as VariableAlias, index);
          return;
        }
        if (field === "layoutGrids") {
          pushVariableBinding(bindings, "grid", field, item as VariableAlias, index);
          return;
        }

        pushVariableBinding(bindings, "text_field", field, item as VariableAlias, index);
      });
      continue;
    }

    if (typeof value === "object" && "id" in value && typeof value.id === "string") {
      pushVariableBinding(bindings, "node_field", field, value as VariableAlias);
    }
  }

  return bindings.length > 0 ? bindings : undefined;
}

function serializeComponentProperties(componentProperties: ComponentProperties): InstanceMetadata["componentProperties"] {
  const entries = Object.entries(componentProperties).map(([name, definition]) => [
    name,
    {
      type: definition.type,
      value: definition.value
    }
  ]);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

async function collectInstanceMetadata(node: BaseNode): Promise<InstanceMetadata | undefined> {
  if (node.type === "COMPONENT_SET") {
    return {
      nodeKind: "COMPONENT_SET",
      componentSetId: node.id
    };
  }

  if (node.type === "COMPONENT") {
    return {
      nodeKind: "COMPONENT",
      componentSetId: node.parent?.type === "COMPONENT_SET" ? node.parent.id : null
    };
  }

  if (node.type === "INSTANCE") {
    const mainComponent = await node.getMainComponentAsync();
    return {
      nodeKind: "INSTANCE",
      mainComponentId: mainComponent?.id ?? null,
      componentSetId: mainComponent?.parent?.type === "COMPONENT_SET" ? mainComponent.parent.id : null,
      componentProperties: serializeComponentProperties(node.componentProperties)
    };
  }

  return undefined;
}

function matchesName(node: BaseNode, payload: FindNodesPayload, reasons: string[]): boolean {
  const maybeNamedNode = node as BaseNode & { name?: string };
  const name = typeof maybeNamedNode.name === "string" ? maybeNamedNode.name : "";
  const normalizedName = name.toLocaleLowerCase();

  if (payload.nameExact) {
    if (normalizedName !== payload.nameExact.toLocaleLowerCase()) {
      return false;
    }
    reasons.push("nameExact");
  }

  if (payload.nameContains) {
    if (!normalizedName.includes(payload.nameContains.toLocaleLowerCase())) {
      return false;
    }
    reasons.push("nameContains");
  }

  return true;
}

function matchesText(node: BaseNode, payload: FindNodesPayload, reasons: string[]): boolean {
  if (!payload.textContains) {
    return true;
  }

  if (!isTextNode(node)) {
    return false;
  }

  if (!node.characters.toLocaleLowerCase().includes(payload.textContains.toLocaleLowerCase())) {
    return false;
  }

  reasons.push("textContains");
  return true;
}

function hasAnyFilter(payload: FindNodesPayload): boolean {
  return Boolean(
    payload.nameExact
      || payload.nameContains
      || payload.textContains
      || payload.type
      || payload.styleId
      || payload.variableId
      || payload.componentId
      || payload.instanceOnly
      || payload.visible !== undefined
      || payload.locked !== undefined
  );
}

async function getMatchReasons(node: BaseNode, payload: FindNodesPayload): Promise<string[]> {
  const reasons: string[] = [];

  if (payload.instanceOnly && node.type !== "INSTANCE") {
    return [];
  }
  if (payload.type && node.type !== payload.type) {
    return [];
  }
  if (!matchesName(node, payload, reasons)) {
    return [];
  }
  if (!matchesText(node, payload, reasons)) {
    return [];
  }

  if (isSceneNode(node)) {
    if (payload.visible !== undefined) {
      if (node.visible !== payload.visible) {
        return [];
      }
      reasons.push("visible");
    }
    if (payload.locked !== undefined) {
      if (node.locked !== payload.locked) {
        return [];
      }
      reasons.push("locked");
    }
  } else if (payload.visible !== undefined || payload.locked !== undefined) {
    return [];
  }

  if (payload.styleId) {
    const styles = collectStyleRefs(node);
    const styleIds = Object.values(styles ?? {}).filter((value): value is string => typeof value === "string");
    if (!styleIds.includes(payload.styleId)) {
      return [];
    }
    reasons.push("styleId");
  }

  if (payload.variableId) {
    const rawBoundVariables = (node as BaseNode & { boundVariables?: unknown }).boundVariables;
    const bindings = serializeBoundVariables(rawBoundVariables);
    if (!bindings?.some((binding) => binding.variableId === payload.variableId)) {
      return [];
    }
    reasons.push("variableId");
  }

  if (payload.componentId) {
    let matchesComponent = false;
    if (node.type === "INSTANCE") {
      const mainComponent = await node.getMainComponentAsync();
      matchesComponent = mainComponent?.id === payload.componentId
        || (mainComponent?.parent?.type === "COMPONENT_SET" && mainComponent.parent.id === payload.componentId);
    } else {
      matchesComponent = node.id === payload.componentId;
    }

    if (!matchesComponent) {
      return [];
    }
    reasons.push("componentId");
  }

  if (payload.instanceOnly) {
    reasons.push("instanceOnly");
  }

  if (!hasAnyFilter(payload)) {
    return [];
  }

  return reasons;
}

async function collectMatchingNodes(
  node: BaseNode,
  payload: FindNodesPayload,
  limit: number,
  matches: FindNodeMatch[],
  counts: { totalMatches: number },
  depth: number | undefined
): Promise<void> {
  if (isSceneNode(node) && !node.visible && payload.visible !== false && !(payload.includeHidden ?? false)) {
    return;
  }

  const reasons = await getMatchReasons(node, payload);
  if (reasons.length > 0) {
    counts.totalMatches += 1;
    if (matches.length < limit) {
      matches.push({
        ...summarizeNode(node),
        matchedBy: reasons
      });
    }
  }

  if (!hasChildren(node) || depth === 0) {
    return;
  }

  const nextDepth = depth === undefined ? undefined : depth - 1;
  for (const child of node.children) {
    await collectMatchingNodes(child, payload, limit, matches, counts, nextDepth);
  }
}

function toPageSummary(page: PageNode): PageSummary {
  return {
    id: page.id,
    name: page.name
  };
}

function buildFileSummary(): FileSummary {
  return {
    fileKey: figma.fileKey ?? null,
    name: figma.root.name,
    currentPageId: figma.currentPage.id,
    pages: figma.root.children.map((page) => toPageSummary(page))
  };
}

export function summarizeNode(node: BaseNode): NodeSummary {
  const maybeNamedNode = node as BaseNode & { name?: string };
  return {
    id: node.id,
    name: typeof maybeNamedNode.name === "string" ? maybeNamedNode.name : node.type,
    type: node.type,
    parentId: node.parent?.id ?? null
  };
}

function describeNodeSync(node: BaseNode): NodeDetails {
  const summary = summarizeNode(node);
  const details: NodeDetails = { ...summary };

  if (hasChildren(node)) {
    details.childIds = node.children.map((child) => child.id);
  }

  if (isSceneNode(node)) {
    details.visible = node.visible;
    details.locked = node.locked;
    details.x = node.x;
    details.y = node.y;
    details.width = node.width;
    details.height = node.height;
  }

  if (hasOpacity(node)) {
    details.opacity = node.opacity;
  }

  if (hasRotation(node)) {
    details.rotation = node.rotation;
  }

  if (hasCornerRadius(node) && typeof node.cornerRadius === "number") {
    details.cornerRadius = node.cornerRadius;
  }

  if (hasFills(node)) {
    details.fills = serializePaints(node.fills);
  }

  if (hasStrokes(node)) {
    details.strokes = serializePaints(node.strokes);
    if (typeof node.strokeWeight === "number") {
      details.strokeWeight = node.strokeWeight;
    }
  }

  if (hasAutoLayout(node)) {
    details.layoutMode = node.layoutMode as AutoLayoutMode;
    details.itemSpacing = node.itemSpacing;
    details.paddingTop = node.paddingTop;
    details.paddingRight = node.paddingRight;
    details.paddingBottom = node.paddingBottom;
    details.paddingLeft = node.paddingLeft;
    details.primaryAxisAlignItems = node.primaryAxisAlignItems;
    details.counterAxisAlignItems = node.counterAxisAlignItems;
    details.primaryAxisSizingMode = node.primaryAxisSizingMode;
    details.counterAxisSizingMode = node.counterAxisSizingMode;
  }

  if (hasAutoLayoutChild(node)) {
    details.layoutGrow = node.layoutGrow;
    details.layoutAlign = node.layoutAlign;
  }

  if (hasClipsContent(node)) {
    details.clipsContent = node.clipsContent;
  }

  if (isTextNode(node)) {
    details.characters = node.characters;
    if (typeof node.fontSize === "number") {
      details.fontSize = node.fontSize;
    }
    if (isFontNameValue(node.fontName)) {
      details.fontFamily = node.fontName.family;
      details.fontStyle = node.fontName.style;
    }
    details.lineHeight = serializeLineHeight(node.lineHeight);
    details.letterSpacing = serializeLetterSpacing(node.letterSpacing);
    details.paragraphSpacing = node.paragraphSpacing;
    details.paragraphIndent = node.paragraphIndent;
    if (isTextCaseValue(node.textCase)) {
      details.textCase = node.textCase;
    }
    if (isTextDecorationValue(node.textDecoration)) {
      details.textDecoration = node.textDecoration;
    }
    details.textAlignHorizontal = node.textAlignHorizontal;
    details.textAlignVertical = node.textAlignVertical;
  }

  return details;
}

export async function describeNodeAsync(node: BaseNode): Promise<NodeDetails> {
  const details = describeNodeSync(node);
  const styles = collectStyleRefs(node);
  const rawBoundVariables = (node as BaseNode & { boundVariables?: unknown }).boundVariables;
  const boundVariables = serializeBoundVariables(rawBoundVariables);
  const instance = await collectInstanceMetadata(node);

  if (styles || boundVariables || instance) {
    details.design = {
      ...(styles ? { styles } : {}),
      ...(boundVariables ? { boundVariables } : {}),
      ...(instance ? { instance } : {})
    };
  }

  return details;
}

async function buildNodeTree(node: BaseNode, depth: number | undefined): Promise<NodeTreeNode> {
  const snapshot: NodeTreeNode = { ...(await describeNodeAsync(node)) };
  if (hasChildren(node) && depth !== 0) {
    const nextDepth = depth === undefined ? undefined : depth - 1;
    snapshot.children = await Promise.all(node.children.map((child) => buildNodeTree(child, nextDepth)));
  }

  return snapshot;
}

export function ping(sessionId: string, pluginInstanceId: string): PingResult {
  return {
    bridgeTime: new Date().toISOString(),
    pluginInstanceId,
    sessionId
  };
}

export function getFile(): GetFileResult {
  return {
    file: buildFileSummary()
  };
}

export function getCurrentPage(): GetCurrentPageResult {
  return {
    page: toPageSummary(figma.currentPage),
    selection: figma.currentPage.selection.map((node) => summarizeNode(node)),
    childIds: figma.currentPage.children.map((child) => child.id)
  };
}

export function getSelection(): GetSelectionResult {
  return {
    fileKey: figma.fileKey ?? null,
    pageId: figma.currentPage.id,
    selection: figma.currentPage.selection.map((node) => summarizeNode(node))
  };
}

export function listPages(): ListPagesResult {
  return {
    fileKey: figma.fileKey ?? null,
    currentPageId: figma.currentPage.id,
    pages: figma.root.children.map((page) => toPageSummary(page))
  };
}

export async function getNode(nodeId: string): Promise<GetNodeResult> {
  return {
    node: await describeNodeAsync(await requireBaseNode(nodeId))
  };
}

export async function getNodeTree(payload: GetNodeTreePayload): Promise<GetNodeTreeResult> {
  const root = payload.nodeId ? await requireBaseNode(payload.nodeId) : figma.currentPage;
  return {
    root: await buildNodeTree(root, payload.depth),
    requestedDepth: payload.depth
  };
}

export async function findNodes(payload: FindNodesPayload): Promise<FindNodesResult> {
  const root = payload.nodeId ? await requireBaseNode(payload.nodeId) : figma.currentPage;
  const limit = payload.limit ?? 50;
  const matches: FindNodeMatch[] = [];
  const counts = { totalMatches: 0 };

  await collectMatchingNodes(root, payload, limit, matches, counts, payload.depth);

  return {
    root: summarizeNode(root),
    matches,
    totalMatches: counts.totalMatches,
    truncated: counts.totalMatches > matches.length
  };
}
