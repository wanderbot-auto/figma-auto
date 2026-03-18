import type {
  CreateComponentPayload,
  CreateComponentResult,
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

async function requireBaseNode(nodeId: string): Promise<BaseNode> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) {
    throw new Error(`Node ${nodeId} was not found`);
  }

  return node;
}

async function requireSceneNode(nodeId: string): Promise<SceneNode> {
  const node = await requireBaseNode(nodeId);
  if (!("visible" in node)) {
    throw new Error(`Node ${nodeId} is not a scene node`);
  }

  return node;
}

async function requireChildContainer(nodeId: string | undefined): Promise<ChildContainerNode> {
  if (!nodeId) {
    return figma.currentPage;
  }

  const node = await requireBaseNode(nodeId);
  if (!hasChildren(node)) {
    throw new Error(`Node ${nodeId} cannot contain children`);
  }

  return node;
}

export async function loadFontsForNode(node: TextNode): Promise<void> {
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

export async function renameNode(payload: RenameNodePayload): Promise<RenameNodeResult> {
  const node = await requireSceneNode(payload.nodeId);
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

export async function createFrame(payload: CreateFramePayload): Promise<CreateFrameResult> {
  const parent = await requireChildContainer(payload.parentId);
  const frame = figma.createFrame();

  frame.name = payload.name ?? frame.name;
  frame.resize(payload.width ?? frame.width, payload.height ?? frame.height);
  placeNode(frame, parent, payload.x, payload.y);

  return {
    node: describeNode(frame)
  };
}

export async function createComponent(payload: CreateComponentPayload): Promise<CreateComponentResult> {
  if (payload.nodeId) {
    const sourceNode = await requireSceneNode(payload.nodeId);
    const component = figma.createComponentFromNode(sourceNode);
    component.name = payload.name ?? component.name;
    return {
      node: describeNode(component),
      sourceNodeId: payload.nodeId
    };
  }

  const parent = await requireChildContainer(payload.parentId);
  const component = figma.createComponent();

  component.name = payload.name ?? component.name;
  component.resize(payload.width ?? component.width, payload.height ?? component.height);
  placeNode(component, parent, payload.x, payload.y);

  return {
    node: describeNode(component)
  };
}

export async function createText(payload: CreateTextPayload): Promise<CreateTextResult> {
  const parent = await requireChildContainer(payload.parentId);
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
  const node = await requireSceneNode(payload.nodeId);
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

export async function moveNode(payload: MoveNodePayload): Promise<MoveNodeResult> {
  const node = await requireSceneNode(payload.nodeId);
  const parent = await requireChildContainer(payload.parentId);

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

export async function deleteNode(payload: DeleteNodePayload): Promise<DeleteNodeResult> {
  if (!payload.confirm) {
    throw new Error("Deleting a node requires confirm=true");
  }

  const node = await requireSceneNode(payload.nodeId);
  const summary = summarizeNode(node);
  node.remove();

  return {
    deletedNodeId: summary.id,
    parentId: summary.parentId,
    name: summary.name
  };
}
