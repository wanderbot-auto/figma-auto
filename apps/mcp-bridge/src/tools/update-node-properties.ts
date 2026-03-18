import type { UpdateNodePropertiesPayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const updateNodePropertiesTool = {
  name: "figma.update_node_properties",
  description: "Update a bounded set of supported node properties on an existing node.",
  schema: toolSchemas.updateNodeProperties,
  targetSummary: (input: UpdateNodePropertiesPayload) =>
    `update node ${input.nodeId} (${Object.keys(input.properties).join(", ")})`,
  auditMode: () => "commit" as const
};
