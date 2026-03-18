import type { SetInstancePropertiesPayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const setInstancePropertiesTool = {
  name: "figma.set_instance_properties",
  description: "Set variant values, component properties, or swap the main component on an instance.",
  schema: toolSchemas.setInstanceProperties,
  targetSummary: (input: SetInstancePropertiesPayload) => `set instance properties on ${input.nodeId}`,
  auditMode: () => "commit" as const
};
