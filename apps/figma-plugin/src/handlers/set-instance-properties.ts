import type {
  ComponentPropertyOverrideValue,
  SetInstancePropertiesPayload,
  SetInstancePropertiesResult
} from "@figma-auto/protocol";

import {
  requireComponentSource,
  requireInstanceNode
} from "./node-helpers.js";
import { describeNodeAsync } from "./read.js";

async function toPropertyValue(
  value: ComponentPropertyOverrideValue
): Promise<string | boolean | VariableAlias> {
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  return figma.variables.createVariableAliasByIdAsync(value.id);
}

export async function setInstanceProperties(
  payload: SetInstancePropertiesPayload
): Promise<SetInstancePropertiesResult> {
  const instance = await requireInstanceNode(payload.nodeId);
  const updatedFields: string[] = [];

  if (payload.swapComponentId) {
    const component = await requireComponentSource(payload.swapComponentId);
    if (payload.preserveOverrides ?? true) {
      instance.swapComponent(component);
    } else {
      instance.mainComponent = component;
    }
    updatedFields.push("swapComponent");
  }

  const properties: Record<string, string | boolean | VariableAlias> = {};

  if (payload.componentProperties) {
    for (const [propertyName, value] of Object.entries(payload.componentProperties)) {
      properties[propertyName] = await toPropertyValue(value);
      updatedFields.push(`componentProperties.${propertyName}`);
    }
  }

  if (payload.variantProperties) {
    for (const [propertyName, value] of Object.entries(payload.variantProperties)) {
      properties[propertyName] = value;
      updatedFields.push(`variantProperties.${propertyName}`);
    }
  }

  if (Object.keys(properties).length > 0) {
    instance.setProperties(properties);
  }

  return {
    node: await describeNodeAsync(instance),
    updatedFields,
    sourceComponentId: (await instance.getMainComponentAsync())?.id ?? null
  };
}
