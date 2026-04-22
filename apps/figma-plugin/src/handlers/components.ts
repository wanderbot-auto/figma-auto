import type {
  ComponentPropertyDefinitionSummary,
  ComponentSummary,
  GetComponentsPayload,
  GetComponentsResult
} from "@figma-auto/protocol";

import { hasChildren } from "./node-helpers.js";
import type { CacheEntry } from "./query-cache.js";
import { makePayloadCacheKey, readCachedValue, writeCachedValue } from "./query-cache.js";

let componentSnapshotCache: CacheEntry<Array<ComponentNode | ComponentSetNode>> | null = null;
const componentResultCache = new Map<string, CacheEntry<GetComponentsResult>>();
const componentSummaryCache = {
  basic: new Map<string, ComponentSummary>(),
  detailed: new Map<string, ComponentSummary>()
};

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

function getComponentSummaryCacheKey(node: ComponentNode | ComponentSetNode, includeProperties: boolean): string {
  return `${node.id}:${includeProperties ? "detailed" : "basic"}`;
}

function getAllComponents(): Array<ComponentNode | ComponentSetNode> {
  const cached = readCachedValue(componentSnapshotCache);
  if (cached) {
    return cached;
  }

  const allComponents: Array<ComponentNode | ComponentSetNode> = [];
  collectComponents(figma.root, allComponents);
  componentSnapshotCache = writeCachedValue(allComponents);
  componentResultCache.clear();
  componentSummaryCache.basic.clear();
  componentSummaryCache.detailed.clear();
  return allComponents;
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
  const cache = includeProperties ? componentSummaryCache.detailed : componentSummaryCache.basic;
  const cacheKey = getComponentSummaryCacheKey(node, includeProperties);
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let summary: ComponentSummary;
  if (node.type === "COMPONENT_SET") {
    summary = {
      id: node.id,
      name: node.name,
      type: node.type,
      ...(includeProperties ? { propertyDefinitions: serializePropertyDefinitions(node.componentPropertyDefinitions) } : {}),
      variantChildren: node.children.map((child) => ({ id: child.id, name: child.name }))
    };
  } else {
    summary = {
      id: node.id,
      name: node.name,
      type: node.type,
      componentSetId: node.parent?.type === "COMPONENT_SET" ? node.parent.id : null,
      ...(includeProperties ? { propertyDefinitions: serializePropertyDefinitions(node.componentPropertyDefinitions) } : {})
    };
  }

  cache.set(cacheKey, summary);
  return summary;
}

export async function getComponents(payload: GetComponentsPayload): Promise<GetComponentsResult> {
  const resultCacheKey = makePayloadCacheKey(payload);
  const cachedResult = readCachedValue(componentResultCache.get(resultCacheKey));
  if (cachedResult) {
    return cachedResult;
  }

  const allComponents = getAllComponents();
  const nameContains = payload.nameContains?.toLocaleLowerCase();
  const includeProperties = payload.includeProperties ?? true;
  const limit = payload.limit ?? 100;
  const filtered = allComponents.filter((node) =>
    nameContains ? node.name.toLocaleLowerCase().includes(nameContains) : true
  );

  const result = {
    components: filtered.slice(0, limit).map((node) => serializeComponentSummary(node, includeProperties)),
    totalComponents: filtered.length,
    truncated: filtered.length > limit
  };

  componentResultCache.set(resultCacheKey, writeCachedValue(result));
  return result;
}
