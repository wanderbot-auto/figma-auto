import type { GetNodePayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const getNodeTool = {
  name: "figma.get_node",
  description: "Return a normalized snapshot of a specific node.",
  schema: toolSchemas.getNode,
  targetSummary: (input: GetNodePayload) => `node ${input.nodeId}`,
  auditMode: () => null
};
