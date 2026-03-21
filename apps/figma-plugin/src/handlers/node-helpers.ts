export type ChildContainerNode = BaseNode & ChildrenMixin;

export type EffectStyleNode = SceneNode & {
  effects: ReadonlyArray<Effect>;
  effectStyleId: string;
  setEffectStyleIdAsync(styleId: string): Promise<void>;
};

export type ReactionNode = SceneNode & ReactionMixin;
export type FramePrototypingNode = SceneNode & FramePrototypingMixin;

export function hasChildren(node: BaseNode): node is ChildContainerNode {
  return "children" in node;
}

export function isSceneNode(node: BaseNode): node is SceneNode {
  return "visible" in node;
}

export function isTextNode(node: BaseNode): node is TextNode {
  return node.type === "TEXT";
}

export function isInstanceNode(node: BaseNode): node is InstanceNode {
  return node.type === "INSTANCE";
}

export function hasFills(node: BaseNode): node is SceneNode & MinimalFillsMixin {
  return "fills" in node;
}

export function hasStrokes(node: BaseNode): node is SceneNode & MinimalStrokesMixin {
  return "strokes" in node;
}

export function hasCornerRadius(node: BaseNode): node is SceneNode & CornerMixin {
  return "cornerRadius" in node;
}

export function hasAutoLayout(node: BaseNode): node is SceneNode & AutoLayoutMixin {
  return "layoutMode" in node;
}

export function hasAutoLayoutChild(node: BaseNode): node is SceneNode & AutoLayoutChildrenMixin {
  return "layoutGrow" in node && "layoutAlign" in node;
}

export function isResizableNode(node: BaseNode): node is SceneNode & LayoutMixin {
  return "resize" in node;
}

export function hasOpacity(node: BaseNode): node is SceneNode & BlendMixin {
  return "opacity" in node;
}

export function hasRotation(node: BaseNode): node is SceneNode & LayoutMixin {
  return "rotation" in node;
}

export function hasEffects(node: BaseNode): node is EffectStyleNode {
  return "effects" in node && "effectStyleId" in node;
}

export function hasGridStyle(node: BaseNode): node is BaseNode & BaseFrameMixin {
  return "gridStyleId" in node;
}

export function hasClipsContent(node: BaseNode): node is BaseNode & BaseFrameMixin {
  return "clipsContent" in node;
}

export function hasReactions(node: BaseNode): node is ReactionNode {
  return "reactions" in node && "setReactionsAsync" in node;
}

export function hasFramePrototyping(node: BaseNode): node is FramePrototypingNode {
  return "overflowDirection" in node;
}

export async function requireBaseNode(nodeId: string): Promise<BaseNode> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) {
    throw new Error(`Node ${nodeId} was not found`);
  }

  return node;
}

export async function requireSceneNode(nodeId: string): Promise<SceneNode> {
  const node = await requireBaseNode(nodeId);
  if (!isSceneNode(node)) {
    throw new Error(`Node ${nodeId} is not a scene node`);
  }

  return node;
}

export async function requireReactionNode(nodeId: string): Promise<ReactionNode> {
  const node = await requireSceneNode(nodeId);
  if (!hasReactions(node)) {
    throw new Error(`Node ${nodeId} does not support prototyping reactions`);
  }

  return node;
}

export async function requirePageNode(pageId?: string): Promise<PageNode> {
  if (!pageId) {
    return figma.currentPage;
  }

  const node = await requireBaseNode(pageId);
  if (node.type !== "PAGE") {
    throw new Error(`Node ${pageId} is not a page`);
  }

  return node;
}

export async function requireInstanceNode(nodeId: string): Promise<InstanceNode> {
  const node = await requireBaseNode(nodeId);
  if (!isInstanceNode(node)) {
    throw new Error(`Node ${nodeId} is not an instance`);
  }

  return node;
}

export async function requireComponentSource(nodeId: string): Promise<ComponentNode> {
  const node = await requireBaseNode(nodeId);
  if (node.type === "COMPONENT") {
    return node;
  }
  if (node.type === "COMPONENT_SET") {
    return node.defaultVariant;
  }

  throw new Error(`Node ${nodeId} is not a component or component set`);
}

export async function requireChildContainer(nodeId?: string): Promise<ChildContainerNode> {
  if (!nodeId) {
    return figma.currentPage;
  }

  const node = await requireBaseNode(nodeId);
  if (!hasChildren(node)) {
    throw new Error(`Node ${nodeId} cannot contain children`);
  }

  return node;
}

export async function requireFillableNode(nodeId: string): Promise<SceneNode & MinimalFillsMixin> {
  const node = await requireBaseNode(nodeId);
  if (!isSceneNode(node) || !hasFills(node)) {
    throw new Error(`Node ${nodeId} does not support fills`);
  }

  return node;
}
