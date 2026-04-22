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
  GetNodePayload,
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
import { DEFAULT_GET_NODE_TREE_DEPTH, MAX_GET_NODE_TREE_NODES } from "@figma-auto/protocol";

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
import { serializePrototypeMetadata } from "./prototype.js";

interface DescribeNodeOptions {
  includeDesign?: boolean | undefined;
  includePrototype?: boolean | undefined;
  includeTextContent?: boolean | undefined;
  includePaints?: boolean | undefined;
}

interface FindNodesContext {
  payload: FindNodesPayload;
  nameExactLower?: string | undefined;
  nameContainsLower?: string | undefined;
  textContainsLower?: string | undefined;
}

interface RankedFindNodeMatch {
  match: FindNodeMatch;
  score: number;
  order: number;
}

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

function createFindNodesContext(payload: FindNodesPayload): FindNodesContext {
  return {
    payload,
    nameExactLower: payload.nameExact?.toLocaleLowerCase(),
    nameContainsLower: payload.nameContains?.toLocaleLowerCase(),
    textContainsLower: payload.textContains?.toLocaleLowerCase()
  };
}

function matchesName(node: BaseNode, context: FindNodesContext, reasons: string[]): boolean {
  const maybeNamedNode = node as BaseNode & { name?: string };
  const name = typeof maybeNamedNode.name === "string" ? maybeNamedNode.name : "";
  const normalizedName = name.toLocaleLowerCase();
  const { nameExactLower, nameContainsLower } = context;

  if (nameExactLower) {
    if (normalizedName !== nameExactLower) {
      return false;
    }
    reasons.push("nameExact");
  }

  if (nameContainsLower) {
    if (!normalizedName.includes(nameContainsLower)) {
      return false;
    }
    reasons.push("nameContains");
  }

  return true;
}

function matchesText(node: BaseNode, context: FindNodesContext, reasons: string[]): boolean {
  if (!context.textContainsLower) {
    return true;
  }

  if (!isTextNode(node)) {
    return false;
  }

  if (!node.characters.toLocaleLowerCase().includes(context.textContainsLower)) {
    return false;
  }

  reasons.push("textContains");
  return true;
}

function hasAnyFilter(context: FindNodesContext): boolean {
  const { payload } = context;
  return Boolean(
    context.nameExactLower
      || context.nameContainsLower
      || context.textContainsLower
      || payload.type
      || payload.styleId
      || payload.variableId
      || payload.componentId
      || payload.instanceOnly
      || payload.visible !== undefined
      || payload.locked !== undefined
  );
}

async function getMatchReasons(node: BaseNode, context: FindNodesContext): Promise<string[]> {
  const { payload } = context;
  const reasons: string[] = [];

  if (payload.instanceOnly && node.type !== "INSTANCE") {
    return [];
  }
  if (payload.type && node.type !== payload.type) {
    return [];
  }
  if (payload.type) {
    reasons.push("type");
  }
  if (!matchesName(node, context, reasons)) {
    return [];
  }
  if (!matchesText(node, context, reasons)) {
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

  if (!hasAnyFilter(context)) {
    return [];
  }

  return reasons;
}

function canSkipHiddenBranch(node: BaseNode, payload: FindNodesPayload): boolean {
  return isSceneNode(node) && !node.visible && payload.visible !== false && !(payload.includeHidden ?? false);
}

function isHiddenByAncestor(node: BaseNode, root: BaseNode, payload: FindNodesPayload): boolean {
  if (payload.visible === false || (payload.includeHidden ?? false)) {
    return false;
  }

  let current = node.parent;
  while (current) {
    if (current === root.parent) {
      break;
    }
    if (current === root) {
      return isSceneNode(current) && !current.visible;
    }
    if (isSceneNode(current) && !current.visible) {
      return true;
    }
    current = current.parent;
  }

  return false;
}

function getFastPathCriteriaTypes(payload: FindNodesPayload): NodeType[] | null {
  if (payload.instanceOnly) {
    return ["INSTANCE"];
  }

  if (payload.type) {
    return [payload.type as NodeType];
  }

  if (payload.textContains) {
    return ["TEXT"];
  }

  if (payload.componentId) {
    return ["INSTANCE", "COMPONENT", "COMPONENT_SET"];
  }

  return null;
}

function canUseFindNodesFastPath(root: BaseNode, payload: FindNodesPayload): boolean {
  if (payload.depth !== undefined || !hasChildren(root)) {
    return false;
  }

  return getFastPathCriteriaTypes(payload) !== null;
}

function getNodeName(node: BaseNode): string {
  const maybeNamedNode = node as BaseNode & { name?: string };
  return typeof maybeNamedNode.name === "string" ? maybeNamedNode.name : node.type;
}

function buildNodePath(node: BaseNode, root: BaseNode): string[] | undefined {
  const path: string[] = [];
  let current: BaseNode | null = node;

  while (current) {
    path.push(getNodeName(current));
    if (current === root) {
      return path.reverse();
    }
    current = current.parent;
  }

  return undefined;
}

function getNodeDepthRelativeToRoot(node: BaseNode, root: BaseNode): number {
  let depth = 0;
  let current: BaseNode | null = node;

  while (current && current !== root) {
    current = current.parent;
    depth += 1;
  }

  return current === root ? depth : depth + 2;
}

function scoreFindNodeMatch(node: BaseNode, context: FindNodesContext, reasons: string[], root: BaseNode): number {
  let score = 0;
  const lowerName = getNodeName(node).toLocaleLowerCase();
  const depth = getNodeDepthRelativeToRoot(node, root);

  if (context.nameExactLower && lowerName === context.nameExactLower) {
    score += 100;
  }

  if (context.nameContainsLower) {
    if (lowerName === context.nameContainsLower) {
      score += 70;
    } else if (lowerName.startsWith(context.nameContainsLower)) {
      score += 55;
    } else if (lowerName.includes(context.nameContainsLower)) {
      score += 40;
    }
  }

  if (context.textContainsLower && isTextNode(node)) {
    const lowerText = node.characters.toLocaleLowerCase();
    if (lowerText === context.textContainsLower) {
      score += 75;
    } else if (lowerText.startsWith(context.textContainsLower)) {
      score += 55;
    } else if (lowerText.includes(context.textContainsLower)) {
      score += 35;
    }
  }

  for (const reason of reasons) {
    switch (reason) {
      case "type":
        score += 18;
        break;
      case "instanceOnly":
        score += 16;
        break;
      case "componentId":
        score += 26;
        break;
      case "styleId":
      case "variableId":
        score += 20;
        break;
      case "visible":
        score += 10;
        break;
      case "locked":
        score += 6;
        break;
      default:
        break;
    }
  }

  if (node.parent === root) {
    score += 8;
  }
  score -= Math.min(depth, 6) * 2;

  if (isSceneNode(node) && node.visible && context.payload.visible === undefined && !(context.payload.includeHidden ?? false)) {
    score += 2;
  }

  return Math.max(score, reasons.length * 10);
}

function classifyFindNodeConfidence(score: number): "high" | "medium" | "low" {
  if (score >= 90) {
    return "high";
  }
  if (score >= 45) {
    return "medium";
  }

  return "low";
}

function compareRankedMatches(left: RankedFindNodeMatch, right: RankedFindNodeMatch): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  return left.order - right.order;
}

function addRankedMatch(
  rankedMatches: RankedFindNodeMatch[],
  node: BaseNode,
  reasons: string[],
  context: FindNodesContext,
  root: BaseNode,
  limit: number,
  order: number
): void {
  const score = scoreFindNodeMatch(node, context, reasons, root);
  const rankedMatch: RankedFindNodeMatch = {
    score,
    order,
    match: {
      ...summarizeNode(node),
      matchedBy: reasons,
      confidence: classifyFindNodeConfidence(score),
      confidenceScore: score,
      path: buildNodePath(node, root)
    }
  };

  if (rankedMatches.length < limit) {
    rankedMatches.push(rankedMatch);
    rankedMatches.sort(compareRankedMatches);
    return;
  }

  const worst = rankedMatches[rankedMatches.length - 1];
  if (!worst) {
    return;
  }
  if (compareRankedMatches(rankedMatch, worst) >= 0) {
    return;
  }

  rankedMatches[rankedMatches.length - 1] = rankedMatch;
  rankedMatches.sort(compareRankedMatches);
}

async function collectMatchesFromCandidates(
  root: BaseNode,
  candidates: BaseNode[],
  context: FindNodesContext,
  limit: number,
  rankedMatches: RankedFindNodeMatch[],
  counts: { totalMatches: number; stoppedEarly: boolean; visitedMatches: number }
): Promise<void> {
  for (const node of candidates) {
    if (counts.stoppedEarly) {
      return;
    }

    if (canSkipHiddenBranch(node, context.payload) || isHiddenByAncestor(node, root, context.payload)) {
      continue;
    }

    const reasons = await getMatchReasons(node, context);
    if (reasons.length === 0) {
      continue;
    }

    counts.totalMatches += 1;
    counts.visitedMatches += 1;
    if (limit > 0) {
      addRankedMatch(rankedMatches, node, reasons, context, root, limit, counts.visitedMatches);
      if ((context.payload.stopAtLimit ?? false) && counts.totalMatches >= limit) {
        counts.stoppedEarly = true;
        return;
      }
    }
  }
}

async function collectMatchingNodes(
  node: BaseNode,
  context: FindNodesContext,
  limit: number,
  rankedMatches: RankedFindNodeMatch[],
  counts: { totalMatches: number; stoppedEarly: boolean; visitedMatches: number },
  root: BaseNode,
  depth: number | undefined
): Promise<void> {
  if (counts.stoppedEarly) {
    return;
  }

  if (canSkipHiddenBranch(node, context.payload)) {
    return;
  }

  const reasons = await getMatchReasons(node, context);
  if (reasons.length > 0) {
    counts.totalMatches += 1;
    counts.visitedMatches += 1;
    if (limit > 0) {
      addRankedMatch(rankedMatches, node, reasons, context, root, limit, counts.visitedMatches);
      if ((context.payload.stopAtLimit ?? false) && counts.totalMatches >= limit) {
        counts.stoppedEarly = true;
        return;
      }
    }
  }

  if (!hasChildren(node) || depth === 0) {
    return;
  }

  const nextDepth = depth === undefined ? undefined : depth - 1;
  for (const child of node.children) {
    await collectMatchingNodes(child, context, limit, rankedMatches, counts, root, nextDepth);
    if (counts.stoppedEarly) {
      return;
    }
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

function normalizeDescribeNodeOptions(options: DescribeNodeOptions = {}): Required<DescribeNodeOptions> {
  return {
    includeDesign: options.includeDesign ?? true,
    includePrototype: options.includePrototype ?? true,
    includeTextContent: options.includeTextContent ?? true,
    includePaints: options.includePaints ?? true
  };
}

function describeNodeSync(node: BaseNode, options: DescribeNodeOptions = {}): NodeDetails {
  const resolvedOptions = normalizeDescribeNodeOptions(options);
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

  if (resolvedOptions.includePaints && hasFills(node)) {
    details.fills = serializePaints(node.fills);
  }

  if (resolvedOptions.includePaints && hasStrokes(node)) {
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
    if (resolvedOptions.includeTextContent) {
      details.characters = node.characters;
    }
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

export async function describeNodeAsync(
  node: BaseNode,
  options: DescribeNodeOptions = {}
): Promise<NodeDetails> {
  const resolvedOptions = normalizeDescribeNodeOptions(options);
  const details = describeNodeSync(node, resolvedOptions);

  if (resolvedOptions.includeDesign) {
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
  }

  if (resolvedOptions.includePrototype) {
    const prototype = serializePrototypeMetadata(node);
    if (prototype) {
      details.prototype = prototype;
    }
  }

  return details;
}

async function buildNodeTree(
  node: BaseNode,
  depth: number | undefined,
  options: DescribeNodeOptions,
  summaryOnly: boolean,
  stats: { nodeCount: number; truncated: boolean }
): Promise<NodeTreeNode> {
  stats.nodeCount += 1;
  const snapshot: NodeTreeNode = summaryOnly
    ? { ...summarizeNode(node) }
    : { ...(await describeNodeAsync(node, options)) };

  if (!hasChildren(node) || depth === 0) {
    return snapshot;
  }

  if (stats.nodeCount >= MAX_GET_NODE_TREE_NODES) {
    if (node.children.length > 0) {
      stats.truncated = true;
    }
    return snapshot;
  }

  const nextDepth = depth === undefined ? undefined : depth - 1;
  const children: NodeTreeNode[] = [];
  for (const child of node.children) {
    if (stats.nodeCount >= MAX_GET_NODE_TREE_NODES) {
      stats.truncated = true;
      break;
    }

    children.push(await buildNodeTree(child, nextDepth, options, summaryOnly, stats));
  }

  if (children.length > 0) {
    snapshot.children = children;
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

export async function getNode(payload: GetNodePayload): Promise<GetNodeResult> {
  return {
    node: await describeNodeAsync(await requireBaseNode(payload.nodeId), payload)
  };
}

export async function getNodeTree(payload: GetNodeTreePayload): Promise<GetNodeTreeResult> {
  const root = payload.nodeId ? await requireBaseNode(payload.nodeId) : figma.currentPage;
  const appliedDepth = payload.depth ?? DEFAULT_GET_NODE_TREE_DEPTH;
  const summaryOnly = payload.summaryOnly ?? true;
  const stats = {
    nodeCount: 0,
    truncated: false
  };
  const options: DescribeNodeOptions = summaryOnly
    ? {}
    : {
        includeDesign: payload.includeDesign ?? false,
        includePrototype: payload.includePrototype ?? false,
        includeTextContent: payload.includeTextContent ?? false,
        includePaints: payload.includePaints ?? false
      };

  return {
    root: await buildNodeTree(root, appliedDepth, options, summaryOnly, stats),
    requestedDepth: payload.depth,
    appliedDepth,
    nodeCount: stats.nodeCount,
    truncated: stats.truncated
  };
}

export async function findNodes(payload: FindNodesPayload): Promise<FindNodesResult> {
  const root = payload.nodeId ? await requireBaseNode(payload.nodeId) : figma.currentPage;
  const limit = payload.limit ?? 50;
  const rankedMatches: RankedFindNodeMatch[] = [];
  const counts = { totalMatches: 0, stoppedEarly: false, visitedMatches: 0 };
  const context = createFindNodesContext(payload);

  if ((payload.instanceOnly && payload.type && payload.type !== "INSTANCE")
    || (payload.textContains && payload.type && payload.type !== "TEXT")) {
    return {
      root: summarizeNode(root),
      matches: [],
      totalMatches: 0,
      totalMatchesExact: true,
      truncated: false
    };
  }

  if (canUseFindNodesFastPath(root, payload)) {
    const candidateTypes = getFastPathCriteriaTypes(payload);
    const candidates: BaseNode[] = [];
    if (!canSkipHiddenBranch(root, payload)) {
      candidates.push(root);
    }
    if (candidateTypes && hasChildren(root)) {
      candidates.push(...root.findAllWithCriteria({ types: candidateTypes }));
    }
    await collectMatchesFromCandidates(root, candidates, context, limit, rankedMatches, counts);
  } else {
    await collectMatchingNodes(root, context, limit, rankedMatches, counts, root, payload.depth);
  }

  return {
    root: summarizeNode(root),
    matches: rankedMatches.map((entry) => entry.match),
    totalMatches: counts.totalMatches,
    totalMatchesExact: !counts.stoppedEarly,
    truncated: counts.stoppedEarly || counts.totalMatches > rankedMatches.length
  };
}
