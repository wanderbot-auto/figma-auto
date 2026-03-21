import type {
  CreateComponentPayload,
  CreateComponentResult,
  CreateFramePayload,
  CreateFrameResult,
  CreateInstancePayload,
  CreateInstanceResult,
  CreatePagePayload,
  CreatePageResult,
  CreateRectanglePayload,
  CreateRectangleResult,
  CreateTextPayload,
  CreateTextResult,
  DeleteNodePayload,
  DeleteNodeResult,
  DuplicateNodePayload,
  DuplicateNodeResult,
  MoveNodePayload,
  MoveNodeResult,
  RenameNodePayload,
  RenameNodeResult,
  SetReactionsPayload,
  SetReactionsResult,
  SetTextPayload,
  SetTextResult
} from "@figma-auto/protocol";

import {
  type ChildContainerNode,
  requireChildContainer,
  requireComponentSource,
  requireReactionNode,
  requireSceneNode
} from "./node-helpers.js";
import { deserializeReactions } from "./prototype.js";
import { describeNodeAsync, summarizeNode } from "./read.js";

function hasClone(node: SceneNode): node is SceneNode & { clone(): SceneNode } {
  return typeof (node as SceneNode & { clone?: () => SceneNode }).clone === "function";
}

export function describeUnknownError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== "{}") {
      return serialized;
    }
  } catch {
    // Ignore serialization failures and fall back to String().
  }

  const fallback = String(error);
  return fallback && fallback !== "[object Object]" ? fallback : "Unknown error";
}

export async function loadFontAsyncOrThrow(fontName: FontName): Promise<void> {
  try {
    await figma.loadFontAsync(fontName);
  } catch (error) {
    const details = describeUnknownError(error);
    const suffix = details === "Unknown error" ? "" : `: ${details}`;
    throw new Error(`Failed to load font ${fontName.family}/${fontName.style}${suffix}`);
  }
}

export async function loadFontsForNode(node: TextNode): Promise<void> {
  if (node.characters.length > 0) {
    const fontNames = node.getRangeAllFontNames(0, node.characters.length);
    const uniqueFonts = Array.from(
      new Map(fontNames.map((fontName) => [`${fontName.family}:${fontName.style}`, fontName])).values()
    );
    for (const fontName of uniqueFonts) {
      await loadFontAsyncOrThrow(fontName);
    }
    return;
  }

  if (node.fontName === figma.mixed) {
    throw new Error("Unable to determine which fonts must be loaded for this text node");
  }

  await loadFontAsyncOrThrow(node.fontName);
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

function placeNodeAtIndex(node: SceneNode, parent: ChildContainerNode, index?: number): void {
  if (node.parent !== parent) {
    parent.appendChild(node);
  }

  if (index === undefined) {
    return;
  }

  const maxIndex = parent.children.length;
  const insertIndex = Math.max(0, Math.min(index, maxIndex));
  parent.insertChild(insertIndex, node);
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
    node: await describeNodeAsync(frame)
  };
}

export async function createRectangle(payload: CreateRectanglePayload): Promise<CreateRectangleResult> {
  const parent = await requireChildContainer(payload.parentId);
  const rectangle = figma.createRectangle();

  rectangle.name = payload.name ?? rectangle.name;
  rectangle.resize(payload.width ?? rectangle.width, payload.height ?? rectangle.height);
  if (payload.cornerRadius !== undefined) {
    rectangle.cornerRadius = payload.cornerRadius;
  }
  placeNode(rectangle, parent, payload.x, payload.y);

  return {
    node: await describeNodeAsync(rectangle)
  };
}

export async function createComponent(payload: CreateComponentPayload): Promise<CreateComponentResult> {
  if (payload.nodeId) {
    const sourceNode = await requireSceneNode(payload.nodeId);
    const component = figma.createComponentFromNode(sourceNode);
    component.name = payload.name ?? component.name;
    return {
      node: await describeNodeAsync(component),
      sourceNodeId: payload.nodeId
    };
  }

  const parent = await requireChildContainer(payload.parentId);
  const component = figma.createComponent();

  component.name = payload.name ?? component.name;
  component.resize(payload.width ?? component.width, payload.height ?? component.height);
  placeNode(component, parent, payload.x, payload.y);

  return {
    node: await describeNodeAsync(component)
  };
}

export async function createInstance(payload: CreateInstancePayload): Promise<CreateInstanceResult> {
  const parent = await requireChildContainer(payload.parentId);
  const component = await requireComponentSource(payload.componentId);
  const instance = component.createInstance();

  instance.name = payload.name ?? instance.name;
  if (payload.width !== undefined || payload.height !== undefined) {
    instance.resize(payload.width ?? instance.width, payload.height ?? instance.height);
  }
  placeNodeAtIndex(instance, parent, payload.index);
  if (payload.x !== undefined) {
    instance.x = payload.x;
  }
  if (payload.y !== undefined) {
    instance.y = payload.y;
  }

  return {
    node: await describeNodeAsync(instance),
    sourceComponentId: component.id
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
    node: await describeNodeAsync(node),
    text: node.characters
  };
}

export async function duplicateNode(payload: DuplicateNodePayload): Promise<DuplicateNodeResult> {
  const sourceNode = await requireSceneNode(payload.nodeId);
  if (!hasClone(sourceNode)) {
    throw new Error(`Node ${payload.nodeId} does not support duplication`);
  }

  const duplicate = sourceNode.clone();
  const parent = await requireChildContainer(payload.parentId ?? duplicate.parent?.id);

  if (payload.name !== undefined) {
    duplicate.name = payload.name;
  }
  placeNodeAtIndex(duplicate, parent, payload.index);
  if (payload.x !== undefined) {
    duplicate.x = payload.x;
  }
  if (payload.y !== undefined) {
    duplicate.y = payload.y;
  }

  return {
    node: await describeNodeAsync(duplicate),
    sourceNodeId: sourceNode.id
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

export async function setReactions(payload: SetReactionsPayload): Promise<SetReactionsResult> {
  const node = await requireReactionNode(payload.nodeId);
  const reactions = await deserializeReactions(payload.reactions);

  await node.setReactionsAsync(reactions);

  return {
    node: await describeNodeAsync(node),
    reactionCount: node.reactions.length
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
    node: await describeNodeAsync(node),
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
