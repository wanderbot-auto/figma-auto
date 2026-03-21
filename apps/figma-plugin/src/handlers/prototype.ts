import type {
  GetFlowPayload,
  GetFlowResult,
  NodePrototypeMetadata,
  NodeSummary,
  PrototypeAction,
  PrototypeConditionalBlock,
  PrototypeEasing,
  PrototypeEasingFunctionBezier,
  PrototypeEasingFunctionSpring,
  PrototypeExpression,
  PrototypeReaction,
  PrototypeTransition,
  PrototypeTrigger,
  PrototypeVariableData,
  PrototypeVariableValueWithExpression,
  VectorValue
} from "@figma-auto/protocol";

import {
  hasFramePrototyping,
  hasReactions,
  requirePageNode
} from "./node-helpers.js";
import { serializePaints } from "./paints.js";

function summarizeNode(node: BaseNode): NodeSummary {
  const maybeNamedNode = node as BaseNode & { name?: string };
  return {
    id: node.id,
    name: typeof maybeNamedNode.name === "string" ? maybeNamedNode.name : node.type,
    type: node.type,
    parentId: node.parent?.id ?? null
  };
}

function toVectorValue(vector: Vector): VectorValue {
  return {
    x: vector.x,
    y: vector.y
  };
}

function isColorValue(value: unknown): value is RGBA {
  return Boolean(
    value
      && typeof value === "object"
      && "r" in value
      && "g" in value
      && "b" in value
      && "a" in value
  );
}

function isVariableAlias(value: unknown): value is VariableAlias {
  return Boolean(
    value
      && typeof value === "object"
      && "type" in value
      && value.type === "VARIABLE_ALIAS"
      && "id" in value
      && typeof value.id === "string"
  );
}

function isSerializableColorValue(value: unknown): value is { r: number; g: number; b: number; a: number } {
  return isColorValue(value);
}

function isPrototypeExpression(value: unknown): value is Expression {
  return Boolean(
    value
      && typeof value === "object"
      && "expressionFunction" in value
      && "expressionArguments" in value
      && Array.isArray(value.expressionArguments)
  );
}

function serializeVariableValue(
  value: VariableValueWithExpression | undefined
): PrototypeVariableValueWithExpression | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }
  if (isColorValue(value)) {
    return {
      r: value.r,
      g: value.g,
      b: value.b,
      a: value.a
    };
  }
  if (isVariableAlias(value)) {
    return {
      type: "VARIABLE_ALIAS",
      id: value.id
    };
  }
  if (isPrototypeExpression(value)) {
    return serializeExpression(value);
  }

  return undefined;
}

function serializeVariableData(data: VariableData | undefined): PrototypeVariableData | undefined {
  if (!data) {
    return undefined;
  }

  return {
    ...(data.type ? { type: data.type } : {}),
    ...(data.resolvedType ? { resolvedType: data.resolvedType } : {}),
    ...(data.value !== undefined ? { value: serializeVariableValue(data.value) } : {})
  };
}

function serializeExpression(expression: Expression): PrototypeExpression {
  return {
    expressionFunction: expression.expressionFunction,
    expressionArguments: expression.expressionArguments.map((argument) => serializeVariableData(argument))
      .filter((argument): argument is PrototypeVariableData => Boolean(argument))
  };
}

function serializeEasing(easing: Easing): PrototypeEasing {
  return {
    type: easing.type,
    ...(easing.easingFunctionCubicBezier
      ? {
          easingFunctionCubicBezier: {
            x1: easing.easingFunctionCubicBezier.x1,
            y1: easing.easingFunctionCubicBezier.y1,
            x2: easing.easingFunctionCubicBezier.x2,
            y2: easing.easingFunctionCubicBezier.y2
          } satisfies PrototypeEasingFunctionBezier
        }
      : {}),
    ...(easing.easingFunctionSpring
      ? {
          easingFunctionSpring: {
            mass: easing.easingFunctionSpring.mass,
            stiffness: easing.easingFunctionSpring.stiffness,
            damping: easing.easingFunctionSpring.damping,
            initialVelocity: easing.easingFunctionSpring.initialVelocity
          } satisfies PrototypeEasingFunctionSpring
        }
      : {})
  };
}

function serializeTransition(transition: Transition | null): PrototypeTransition | null {
  if (!transition) {
    return null;
  }

  if ("direction" in transition) {
    return {
      type: transition.type,
      direction: transition.direction,
      matchLayers: transition.matchLayers,
      easing: serializeEasing(transition.easing),
      duration: transition.duration
    };
  }

  return {
    type: transition.type,
    easing: serializeEasing(transition.easing),
    duration: transition.duration
  };
}

function serializeTrigger(trigger: Trigger | null): PrototypeTrigger | null {
  if (!trigger) {
    return null;
  }

  if (trigger.type === "AFTER_TIMEOUT") {
    return {
      type: trigger.type,
      timeout: trigger.timeout
    };
  }
  if (trigger.type === "MOUSE_UP" || trigger.type === "MOUSE_DOWN") {
    return {
      type: trigger.type,
      delay: trigger.delay
    };
  }
  if (trigger.type === "MOUSE_ENTER" || trigger.type === "MOUSE_LEAVE") {
    return {
      type: trigger.type,
      delay: trigger.delay,
      deprecatedVersion: trigger.deprecatedVersion
    };
  }
  if (trigger.type === "ON_KEY_DOWN") {
    return {
      type: trigger.type,
      device: trigger.device,
      keyCodes: [...trigger.keyCodes]
    };
  }
  if (trigger.type === "ON_MEDIA_HIT") {
    return {
      type: trigger.type,
      mediaHitTime: trigger.mediaHitTime
    };
  }
  if (trigger.type === "ON_MEDIA_END") {
    return {
      type: trigger.type
    };
  }

  return {
    type: trigger.type
  };
}

function serializeConditionalBlock(block: ConditionalBlock): PrototypeConditionalBlock {
  return {
    ...(block.condition ? { condition: serializeVariableData(block.condition) } : {}),
    actions: block.actions.map((action) => serializeAction(action))
  };
}

function serializeAction(action: Action): PrototypeAction {
  switch (action.type) {
    case "BACK":
    case "CLOSE":
      return { type: action.type };
    case "URL":
      return {
        type: action.type,
        url: action.url,
        ...(action.openInNewTab !== undefined ? { openInNewTab: action.openInNewTab } : {})
      };
    case "UPDATE_MEDIA_RUNTIME":
      return {
        type: action.type,
        ...(action.destinationId !== undefined ? { destinationId: action.destinationId } : {}),
        mediaAction: action.mediaAction,
        ...("amountToSkip" in action ? { amountToSkip: action.amountToSkip } : {}),
        ...("newTimestamp" in action ? { newTimestamp: action.newTimestamp } : {})
      };
    case "SET_VARIABLE":
      return {
        type: action.type,
        variableId: action.variableId,
        ...(action.variableValue ? { variableValue: serializeVariableData(action.variableValue) } : {})
      };
    case "SET_VARIABLE_MODE":
      return {
        type: action.type,
        variableCollectionId: action.variableCollectionId,
        variableModeId: action.variableModeId
      };
    case "CONDITIONAL":
      return {
        type: action.type,
        conditionalBlocks: action.conditionalBlocks.map((block) => serializeConditionalBlock(block))
      };
    case "NODE":
      return {
        type: action.type,
        destinationId: action.destinationId,
        navigation: action.navigation,
        transition: serializeTransition(action.transition),
        ...(action.preserveScrollPosition !== undefined
          ? { preserveScrollPosition: action.preserveScrollPosition }
          : {}),
        ...(action.overlayRelativePosition
          ? { overlayRelativePosition: toVectorValue(action.overlayRelativePosition) }
          : {}),
        ...(action.resetVideoPosition !== undefined ? { resetVideoPosition: action.resetVideoPosition } : {}),
        ...(action.resetScrollPosition !== undefined ? { resetScrollPosition: action.resetScrollPosition } : {}),
        ...(action.resetInteractiveComponents !== undefined
          ? { resetInteractiveComponents: action.resetInteractiveComponents }
          : {})
      };
  }
}

function serializeReaction(reaction: Reaction): PrototypeReaction {
  return {
    ...(reaction.action ? { action: serializeAction(reaction.action) } : {}),
    ...(reaction.actions ? { actions: reaction.actions.map((action) => serializeAction(action)) } : {}),
    trigger: serializeTrigger(reaction.trigger)
  };
}

function serializeReactions(reactions: ReadonlyArray<Reaction>): PrototypeReaction[] | undefined {
  return reactions.length > 0 ? reactions.map((reaction) => serializeReaction(reaction)) : undefined;
}

export function serializePrototypeMetadata(node: BaseNode): NodePrototypeMetadata | undefined {
  const prototype: NodePrototypeMetadata = {};

  if (hasReactions(node)) {
    prototype.reactions = serializeReactions(node.reactions);
  }
  if (hasFramePrototyping(node)) {
    prototype.overflowDirection = node.overflowDirection;
  }

  return Object.keys(prototype).length > 0 ? prototype : undefined;
}

async function deserializeVariableValue(
  value: PrototypeVariableValueWithExpression | undefined
): Promise<VariableValueWithExpression | undefined> {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }
  if ("type" in value && value.type === "VARIABLE_ALIAS") {
    return figma.variables.createVariableAliasByIdAsync(value.id);
  }
  if ("expressionFunction" in value) {
    return {
      expressionFunction: value.expressionFunction,
      expressionArguments: await Promise.all(value.expressionArguments.map((argument) => deserializeVariableData(argument)))
    };
  }
  if (isSerializableColorValue(value)) {
    return {
      r: value.r,
      g: value.g,
      b: value.b,
      a: value.a
    };
  }

  return undefined;
}

async function deserializeVariableData(data: PrototypeVariableData): Promise<VariableData> {
  const value = data.value !== undefined ? await deserializeVariableValue(data.value) : undefined;

  return {
    ...(data.type ? { type: data.type } : {}),
    ...(data.resolvedType ? { resolvedType: data.resolvedType } : {}),
    ...(value !== undefined ? { value } : {})
  };
}

function deserializeEasing(easing: PrototypeEasing): Easing {
  return {
    type: easing.type,
    ...(easing.easingFunctionCubicBezier ? { easingFunctionCubicBezier: easing.easingFunctionCubicBezier } : {}),
    ...(easing.easingFunctionSpring ? { easingFunctionSpring: easing.easingFunctionSpring } : {})
  };
}

function deserializeTransition(transition: PrototypeTransition | null | undefined): Transition | null {
  if (transition === undefined || transition === null) {
    return null;
  }

  if ("direction" in transition) {
    return {
      type: transition.type,
      direction: transition.direction,
      matchLayers: transition.matchLayers,
      easing: deserializeEasing(transition.easing),
      duration: transition.duration
    };
  }

  return {
    type: transition.type,
    easing: deserializeEasing(transition.easing),
    duration: transition.duration
  };
}

function deserializeTrigger(trigger: PrototypeTrigger | null): Trigger | null {
  if (!trigger) {
    return null;
  }

  if (trigger.type === "AFTER_TIMEOUT") {
    return {
      type: trigger.type,
      timeout: trigger.timeout
    };
  }
  if (trigger.type === "MOUSE_UP" || trigger.type === "MOUSE_DOWN") {
    return {
      type: trigger.type,
      delay: trigger.delay
    };
  }
  if (trigger.type === "MOUSE_ENTER" || trigger.type === "MOUSE_LEAVE") {
    return {
      type: trigger.type,
      delay: trigger.delay,
      deprecatedVersion: trigger.deprecatedVersion
    };
  }
  if (trigger.type === "ON_KEY_DOWN") {
    return {
      type: trigger.type,
      device: trigger.device,
      keyCodes: trigger.keyCodes
    };
  }
  if (trigger.type === "ON_MEDIA_HIT") {
    return {
      type: trigger.type,
      mediaHitTime: trigger.mediaHitTime
    };
  }
  if (trigger.type === "ON_MEDIA_END") {
    return {
      type: trigger.type
    };
  }

  return {
    type: trigger.type
  };
}

async function deserializeConditionalBlock(block: PrototypeConditionalBlock): Promise<ConditionalBlock> {
  return {
    ...(block.condition ? { condition: await deserializeVariableData(block.condition) } : {}),
    actions: await Promise.all(block.actions.map((action) => deserializeAction(action)))
  };
}

async function deserializeAction(action: PrototypeAction): Promise<Action> {
  switch (action.type) {
    case "BACK":
    case "CLOSE":
      return { type: action.type };
    case "URL":
      return {
        type: action.type,
        url: action.url,
        ...(action.openInNewTab !== undefined ? { openInNewTab: action.openInNewTab } : {})
      };
    case "UPDATE_MEDIA_RUNTIME":
      return {
        type: action.type,
        ...(action.destinationId !== undefined ? { destinationId: action.destinationId } : {}),
        mediaAction: action.mediaAction,
        ...(action.amountToSkip !== undefined ? { amountToSkip: action.amountToSkip } : {}),
        ...(action.newTimestamp !== undefined ? { newTimestamp: action.newTimestamp } : {})
      } as Action;
    case "SET_VARIABLE":
      return {
        type: action.type,
        variableId: action.variableId,
        ...(action.variableValue ? { variableValue: await deserializeVariableData(action.variableValue) } : {})
      };
    case "SET_VARIABLE_MODE":
      return {
        type: action.type,
        variableCollectionId: action.variableCollectionId,
        variableModeId: action.variableModeId
      };
    case "CONDITIONAL":
      return {
        type: action.type,
        conditionalBlocks: await Promise.all(action.conditionalBlocks.map((block) => deserializeConditionalBlock(block)))
      };
    case "NODE":
      return {
        type: action.type,
        destinationId: action.destinationId,
        navigation: action.navigation,
        transition: deserializeTransition(action.transition),
        ...(action.preserveScrollPosition !== undefined
          ? { preserveScrollPosition: action.preserveScrollPosition }
          : {}),
        ...(action.overlayRelativePosition ? { overlayRelativePosition: action.overlayRelativePosition } : {}),
        ...(action.resetVideoPosition !== undefined ? { resetVideoPosition: action.resetVideoPosition } : {}),
        ...(action.resetScrollPosition !== undefined ? { resetScrollPosition: action.resetScrollPosition } : {}),
        ...(action.resetInteractiveComponents !== undefined
          ? { resetInteractiveComponents: action.resetInteractiveComponents }
          : {})
      };
  }
}

export async function deserializeReactions(reactions: PrototypeReaction[]): Promise<Reaction[]> {
  return Promise.all(reactions.map(async (reaction) => {
    const action = reaction.action ? await deserializeAction(reaction.action) : undefined;
    const actions = reaction.actions
      ? await Promise.all(reaction.actions.map((item) => deserializeAction(item)))
      : action
        ? [action]
        : undefined;

    return {
      ...(action ? { action } : {}),
      ...(actions ? { actions } : {}),
      trigger: deserializeTrigger(reaction.trigger)
    };
  }));
}

export async function getFlow(payload: GetFlowPayload): Promise<GetFlowResult> {
  const page = await requirePageNode(payload.pageId);
  if (page.id !== figma.currentPage.id) {
    await page.loadAsync();
  }

  return {
    flow: {
      page: {
        id: page.id,
        name: page.name
      },
      flowStartingPoints: page.flowStartingPoints.map((item) => ({
        nodeId: item.nodeId,
        name: item.name
      })),
      prototypeStartNode: page.prototypeStartNode ? summarizeNode(page.prototypeStartNode) : null,
      prototypeBackgrounds: serializePaints(page.prototypeBackgrounds) ?? []
    }
  };
}
