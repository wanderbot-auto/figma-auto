import type {
  CreateFramePayload,
  CreateFrameResult,
  CreatePagePayload,
  CreatePageResult,
  CreateTextPayload,
  CreateTextResult,
  DeleteNodePayload,
  DeleteNodeResult,
  MoveNodePayload,
  MoveNodeResult,
  RenameNodePayload,
  RenameNodeResult,
  SetTextPayload,
  SetTextResult
} from "@figma-auto/protocol";

import { describeNode, summarizeNode } from "./read.js";

type ChildContainerNode = BaseNode & ChildrenMixin;

function hasChildren(node: BaseNode): node is ChildContainerNode {
  return "children" in node;
}

function requireBaseNode(nodeId: string): BaseNode {
  const node = figma.getNodeById(nodeId);
  if (!node) {
    throw new Error(`Node ${nodeId} was not found`);
  }

  return node;
}

function requireSceneNode(nodeId: string): SceneNode {
  const node = requireBaseNode(nodeId);
  if (!("visible" in node)) {
    throw new Error(`Node ${nodeId} is not a scene node`);
  }

  return node;
}

function requireChildContainer(nodeId: string | undefined): ChildContainerNode {
  if (!nodeId) {
    return figma.currentPage;
  }

  const node = requireBaseNode(nodeId);
  if (!hasChildren(node)) {
    throw new Error(`Node ${nodeId} cannot contain children`);
  }

  return node;
}

async function loadFontsForNode(node: TextNode): Promise<void> {
  if (node.characters.length > 0) {
    const fontNames = node.getRangeAllFontNames(0, node.characters.length);
    const uniqueFonts = Array.from(
      new Map(fontNames.map((fontName) => [`${fontName.family}:${fontName.style}`, fontName])).values()
    );
    for (const fontName of uniqueFonts) {
      await figma.loadFontAsync(fontName);
    }
    return;
  }

  if (node.fontName === figma.mixed) {
    throw new Error("Unable to determine which fonts must be loaded for this text node");
  }

  await figma.loadFontAsync(node.fontName);
}

function placeNode(node: SceneNode, parent: ChildContainerNode, x?: number, y?: number): void {
  if (node.parent !== parent) {
    parent.appendChild(node);
  }

  if (x !== undefined) {
    node.x = x;
  }
  if (y !== undefined) {
    node.y = y;
  }
}

export function renameNode(payload: RenameNodePayload): RenameNodeResult {
  const node = requireSceneNode(payload.nodeId);
  node.name = payload.name;
  return { node: summarizeNode(node) };
}

export function createPage(payload: CreatePagePayload): CreatePageResult {
  const page = figma.createPage();
  page.name = payload.name;
  if (page.parent !== figma.root) {
    figma.root.appendChild(page);
  }
  return {
    page: {
      id: page.id,
      name: page.name
    }
  };
}

export function createFrame(payload: CreateFramePayload): CreateFrameResult {
  const parent = requireChildContainer(payload.parentId);
  const frame = figma.createFrame();

  frame.name = payload.name ?? frame.name;
  frame.resize(payload.width ?? frame.width, payload.height ?? frame.height);
  placeNode(frame, parent, payload.x, payload.y);

  return {
    node: describeNode(frame)
  };
}

export async function createText(payload: CreateTextPayload): Promise<CreateTextResult> {
  const parent = requireChildContainer(payload.parentId);
  const node = figma.createText();

  node.name = payload.name ?? node.name;
  await loadFontsForNode(node);
  node.characters = payload.text ?? "";
  placeNode(node, parent, payload.x, payload.y);

  return {
    node: describeNode(node),
    text: node.characters
  };
}

export async function setText(payload: SetTextPayload): Promise<SetTextResult> {
  const node = requireSceneNode(payload.nodeId);
  if (node.type !== "TEXT") {
    throw new Error(`Node ${payload.nodeId} is not a text node`);
  }

  await loadFontsForNode(node);
  node.characters = payload.text;
  return {
    node: summarizeNode(node),
    text: node.characters
  };
}

export function moveNode(payload: MoveNodePayload): MoveNodeResult {
  const node = requireSceneNode(payload.nodeId);
  const parent = requireChildContainer(payload.parentId);

  if (node === parent) {
    throw new Error(`Node ${payload.nodeId} cannot be moved into itself`);
  }

  const maxIndex = parent.children.length;
  const requestedIndex = payload.index ?? maxIndex;
  const insertIndex = Math.max(0, Math.min(requestedIndex, maxIndex));

  parent.insertChild(insertIndex, node);

  return {
    node: describeNode(node),
    parentId: parent.id,
    index: parent.children.indexOf(node)
  };
}

export function deleteNode(payload: DeleteNodePayload): DeleteNodeResult {
  if (!payload.confirm) {
    throw new Error("Deleting a node requires confirm=true");
  }

  const node = requireSceneNode(payload.nodeId);
  const summary = summarizeNode(node);
  node.remove();

  return {
    deletedNodeId: summary.id,
    parentId: summary.parentId,
    name: summary.name
  };
}
