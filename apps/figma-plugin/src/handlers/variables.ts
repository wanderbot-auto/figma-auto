import type {
  BindVariablePayload,
  BindVariableResult,
  CodeSyntaxPlatform,
  ColorValue,
  CreateVariableCollectionPayload,
  CreateVariableCollectionResult,
  CreateVariablePayload,
  CreateVariableResult,
  GetVariablesPayload,
  GetVariablesResult,
  VariableAliasValue,
  VariableCollectionSummary,
  VariableModeValue,
  VariableSummary
} from "@figma-auto/protocol";

import { requireSceneNode } from "./node-helpers.js";
import { summarizeNode } from "./read.js";

function toColorValue(color: RGBA): ColorValue {
  return {
    r: color.r,
    g: color.g,
    b: color.b,
    a: color.a
  };
}

function isVariableAliasValue(value: VariableModeValue): value is VariableAliasValue {
  return typeof value === "object" && value !== null && "type" in value && value.type === "VARIABLE_ALIAS";
}

function isColorValue(value: VariableModeValue): value is ColorValue {
  return typeof value === "object" && value !== null && "r" in value && "g" in value && "b" in value && "a" in value;
}

function serializeVariableValue(value: VariableValue): VariableModeValue {
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && value !== null && "type" in value && value.type === "VARIABLE_ALIAS") {
    return {
      type: "VARIABLE_ALIAS",
      id: value.id
    };
  }

  if (typeof value === "object" && value !== null && "r" in value && "g" in value && "b" in value) {
    return toColorValue({
      r: value.r,
      g: value.g,
      b: value.b,
      a: "a" in value ? value.a : 1
    });
  }

  throw new Error("Unsupported variable value");
}

function serializeCollection(collection: VariableCollection): VariableCollectionSummary {
  return {
    id: collection.id,
    name: collection.name,
    hiddenFromPublishing: collection.hiddenFromPublishing,
    remote: collection.remote,
    isExtension: collection.isExtension,
    defaultModeId: collection.defaultModeId,
    key: collection.key,
    modes: collection.modes.map((mode) => ({
      modeId: mode.modeId,
      name: mode.name
    })),
    variableIds: [...collection.variableIds]
  };
}

function serializeVariable(variable: Variable, includeValues: boolean): VariableSummary {
  return {
    id: variable.id,
    name: variable.name,
    description: variable.description,
    hiddenFromPublishing: variable.hiddenFromPublishing,
    remote: variable.remote,
    variableCollectionId: variable.variableCollectionId,
    key: variable.key,
    resolvedType: variable.resolvedType,
    scopes: [...variable.scopes],
    codeSyntax: { ...variable.codeSyntax },
    valuesByMode: includeValues
      ? Object.fromEntries(Object.entries(variable.valuesByMode).map(([modeId, value]) => [modeId, serializeVariableValue(value)]))
      : undefined
  };
}

async function requireVariableCollection(collectionId: string): Promise<VariableCollection> {
  const collection = await figma.variables.getVariableCollectionByIdAsync(collectionId);
  if (!collection) {
    throw new Error(`Variable collection ${collectionId} was not found`);
  }

  return collection;
}

async function requireVariable(variableId: string): Promise<Variable> {
  const variable = await figma.variables.getVariableByIdAsync(variableId);
  if (!variable) {
    throw new Error(`Variable ${variableId} was not found`);
  }

  return variable;
}

async function resolveVariableValue(value: VariableModeValue): Promise<VariableValue> {
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return value;
  }

  if (isVariableAliasValue(value)) {
    const variable = await requireVariable(value.id);
    return figma.variables.createVariableAlias(variable);
  }

  if (isColorValue(value)) {
    return {
      r: value.r,
      g: value.g,
      b: value.b,
      a: value.a
    };
  }

  throw new Error("Unsupported variable value");
}

function nodeSupportsFills(node: SceneNode): node is SceneNode & MinimalFillsMixin {
  return "fills" in node;
}

export async function getVariables(payload: GetVariablesPayload): Promise<GetVariablesResult> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const filteredCollections = payload.collectionId
    ? collections.filter((collection) => collection.id === payload.collectionId)
    : collections;

  if (payload.collectionId && filteredCollections.length === 0) {
    throw new Error(`Variable collection ${payload.collectionId} was not found`);
  }

  const variables = await figma.variables.getLocalVariablesAsync(payload.resolvedType);
  const filteredVariables = variables.filter((variable) =>
    payload.collectionId ? variable.variableCollectionId === payload.collectionId : true
  );
  const includeValues = payload.includeValues ?? true;

  return {
    collections: filteredCollections.map((collection) => serializeCollection(collection)),
    variables: filteredVariables.map((variable) => serializeVariable(variable, includeValues)),
    totalVariables: filteredVariables.length
  };
}

export async function createVariableCollection(
  payload: CreateVariableCollectionPayload
): Promise<CreateVariableCollectionResult> {
  const collection = figma.variables.createVariableCollection(payload.name);
  collection.hiddenFromPublishing = payload.hiddenFromPublishing ?? collection.hiddenFromPublishing;
  for (const modeName of payload.modes ?? []) {
    collection.addMode(modeName);
  }

  return {
    collection: serializeCollection(collection)
  };
}

export async function createVariable(payload: CreateVariablePayload): Promise<CreateVariableResult> {
  const collection = await requireVariableCollection(payload.collectionId);
  const variable = figma.variables.createVariable(payload.name, collection, payload.resolvedType);

  variable.description = payload.description ?? variable.description;
  variable.hiddenFromPublishing = payload.hiddenFromPublishing ?? variable.hiddenFromPublishing;
  if (payload.scopes) {
    variable.scopes = payload.scopes as VariableScope[];
  }
  for (const [platform, value] of Object.entries(payload.codeSyntax ?? {})) {
    if (typeof value === "string") {
      variable.setVariableCodeSyntax(platform as CodeSyntaxPlatform, value);
    }
  }
  for (const [modeId, value] of Object.entries(payload.valuesByMode ?? {})) {
    variable.setValueForMode(modeId, await resolveVariableValue(value));
  }

  return {
    variable: serializeVariable(variable, true)
  };
}

export async function bindVariable(payload: BindVariablePayload): Promise<BindVariableResult> {
  const node = await requireSceneNode(payload.nodeId);
  const variable = payload.variableId ? await requireVariable(payload.variableId) : null;

  switch (payload.kind) {
    case "node_field":
      node.setBoundVariable(payload.field as VariableBindableNodeField, variable);
      break;
    case "text_field":
      if (node.type !== "TEXT") {
        throw new Error(`Node ${payload.nodeId} is not a text node`);
      }
      node.setBoundVariable(payload.field as VariableBindableTextField, variable);
      break;
    case "paint": {
      if (!nodeSupportsFills(node)) {
        throw new Error(`Node ${payload.nodeId} does not support fills`);
      }
      const paintIndex = payload.paintIndex ?? 0;
      if (node.fills === figma.mixed) {
        throw new Error(`Node ${payload.nodeId} has mixed fills and cannot be bound by paint index`);
      }
      const fills = [...node.fills];
      const paint = fills[paintIndex];
      if (!paint || paint.type !== "SOLID") {
        throw new Error(`Paint index ${paintIndex} on node ${payload.nodeId} is not a solid fill`);
      }
      fills[paintIndex] = figma.variables.setBoundVariableForPaint(
        {
          ...paint
        },
        "color",
        variable
      );
      node.fills = fills;
      break;
    }
  }

  return {
    node: summarizeNode(node),
    variableId: variable?.id ?? null,
    kind: payload.kind,
    field: payload.field,
    paintIndex: payload.paintIndex
  };
}

export {
  serializeCollection,
  serializeVariable,
  serializeVariableValue
};
