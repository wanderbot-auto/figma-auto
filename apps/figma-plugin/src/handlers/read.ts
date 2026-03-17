import type {
  FileSummary,
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

function requireBaseNode(nodeId: string): BaseNode {
  const node = figma.getNodeById(nodeId);
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

export function getNode(nodeId: string): GetNodeResult {
  return {
    node: describeNode(requireBaseNode(nodeId))
  };
}

export function getNodeTree(payload: GetNodeTreePayload): GetNodeTreeResult {
  const root = payload.nodeId ? requireBaseNode(payload.nodeId) : figma.currentPage;
  return {
    root: buildNodeTree(root, payload.depth),
    requestedDepth: payload.depth
  };
}
