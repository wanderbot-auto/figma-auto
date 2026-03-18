import type {
  ComponentPropertyDefinitionSummary,
  ComponentSummary,
  GetComponentsPayload,
  GetComponentsResult
} from "@figma-auto/protocol";

import { hasChildren } from "./node-helpers.js";

function collectComponents(root: BaseNode, results: Array<ComponentNode | ComponentSetNode>): void {
  if (root.type === "COMPONENT" || root.type === "COMPONENT_SET") {
    results.push(root);
  }

  if (!hasChildren(root)) {
    return;
  }

  for (const child of root.children) {
    collectComponents(child, results);
  }
}

function toSerializable(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function serializePropertyDefinitions(
  definitions: ComponentPropertyDefinitions
): Record<string, ComponentPropertyDefinitionSummary> | undefined {
  const entries = Object.entries(definitions).map(([name, definition]) => [
    name,
    {
      type: definition.type,
      ...(definition.defaultValue !== undefined
        ? {
            defaultValue:
              typeof definition.defaultValue === "string" || typeof definition.defaultValue === "boolean"
                ? definition.defaultValue
                : toSerializable(definition.defaultValue)
          }
        : {}),
      ...(definition.variantOptions ? { variantOptions: [...definition.variantOptions] } : {}),
      ...(definition.preferredValues ? { preferredValues: definition.preferredValues.map((value) => toSerializable(value)) } : {})
    }
  ]);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function serializeComponentSummary(
  node: ComponentNode | ComponentSetNode,
  includeProperties: boolean
): ComponentSummary {
  if (node.type === "COMPONENT_SET") {
    return {
      id: node.id,
      name: node.name,
      type: node.type,
      ...(includeProperties ? { propertyDefinitions: serializePropertyDefinitions(node.componentPropertyDefinitions) } : {}),
      variantChildren: node.children.map((child) => ({ id: child.id, name: child.name }))
    };
  }

  return {
    id: node.id,
    name: node.name,
    type: node.type,
    componentSetId: node.parent?.type === "COMPONENT_SET" ? node.parent.id : null,
    ...(includeProperties ? { propertyDefinitions: serializePropertyDefinitions(node.componentPropertyDefinitions) } : {})
  };
}

export async function getComponents(payload: GetComponentsPayload): Promise<GetComponentsResult> {
  const allComponents: Array<ComponentNode | ComponentSetNode> = [];
  collectComponents(figma.root, allComponents);

  const nameContains = payload.nameContains?.toLocaleLowerCase();
  const includeProperties = payload.includeProperties ?? true;
  const limit = payload.limit ?? 100;
  const filtered = allComponents.filter((node) =>
    nameContains ? node.name.toLocaleLowerCase().includes(nameContains) : true
  );

  return {
    components: filtered.slice(0, limit).map((node) => serializeComponentSummary(node, includeProperties)),
    totalComponents: filtered.length,
    truncated: filtered.length > limit
  };
}
