import type {
  FileSummary,
  FindNodesPayload,
  FindNodesResult,
  GetCurrentPageResult,
  GetFileResult,
  GetNodeResult,
  GetNodeTreePayload,
  GetNodeTreeResult,
  GetSelectionResult,
  ListPagesResult,
  NodeDetails,
  NodeSummary,
  NodeTreeNode,
  PageSummary,
  PingResult
} from "@figma-auto/protocol";

function hasChildren(node: BaseNode): node is BaseNode & ChildrenMixin {
  return "children" in node;
}

function isSceneNode(node: BaseNode): node is SceneNode {
  return "visible" in node;
}

function isTextNode(node: BaseNode): node is TextNode {
  return node.type === "TEXT";
}

function matchesName(node: BaseNode, payload: FindNodesPayload): boolean {
  const maybeNamedNode = node as BaseNode & { name?: string };
  const name = typeof maybeNamedNode.name === "string" ? maybeNamedNode.name : "";
  const normalizedName = name.toLocaleLowerCase();

  if (payload.nameExact && normalizedName !== payload.nameExact.toLocaleLowerCase()) {
    return false;
  }

  if (payload.nameContains && !normalizedName.includes(payload.nameContains.toLocaleLowerCase())) {
    return false;
  }

  return true;
}

function matchesNode(node: BaseNode, payload: FindNodesPayload): boolean {
  if (payload.type && node.type !== payload.type) {
    return false;
  }

  return matchesName(node, payload);
}

function collectMatchingNodes(
  node: BaseNode,
  payload: FindNodesPayload,
  limit: number,
  matches: NodeSummary[],
  counts: { totalMatches: number }
): void {
  if (isSceneNode(node) && !node.visible && !(payload.includeHidden ?? false)) {
    return;
  }

  if (matchesNode(node, payload)) {
    counts.totalMatches += 1;
    if (matches.length < limit) {
      matches.push(summarizeNode(node));
    }
  }

  if (!hasChildren(node)) {
    return;
  }

  for (const child of node.children) {
    collectMatchingNodes(child, payload, limit, matches, counts);
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

async function requireBaseNode(nodeId: string): Promise<BaseNode> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) {
    throw new Error(`Node ${nodeId} was not found`);
  }

  return node;
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

export function describeNode(node: BaseNode): NodeDetails {
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

  if (isTextNode(node)) {
    details.characters = node.characters;
  }

  return details;
}

function buildNodeTree(node: BaseNode, depth: number | undefined): NodeTreeNode {
  const snapshot: NodeTreeNode = { ...describeNode(node) };
  if (hasChildren(node) && depth !== 0) {
    const nextDepth = depth === undefined ? undefined : depth - 1;
    snapshot.children = node.children.map((child) => buildNodeTree(child, nextDepth));
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
    node: describeNode(await requireBaseNode(nodeId))
  };
}

export async function getNodeTree(payload: GetNodeTreePayload): Promise<GetNodeTreeResult> {
  const root = payload.nodeId ? await requireBaseNode(payload.nodeId) : figma.currentPage;
  return {
    root: buildNodeTree(root, payload.depth),
    requestedDepth: payload.depth
  };
}

export async function findNodes(payload: FindNodesPayload): Promise<FindNodesResult> {
  const root = payload.nodeId ? await requireBaseNode(payload.nodeId) : figma.currentPage;
  const limit = payload.limit ?? 50;
  const matches: NodeSummary[] = [];
  const counts = { totalMatches: 0 };

  collectMatchingNodes(root, payload, limit, matches, counts);

  return {
    root: summarizeNode(root),
    matches,
    totalMatches: counts.totalMatches,
    truncated: counts.totalMatches > matches.length
  };
}
