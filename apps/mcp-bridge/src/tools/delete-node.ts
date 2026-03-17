import type { DeleteNodePayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const deleteNodeTool = {
  name: "figma.delete_node",
  description: "Delete a node after an explicit destructive confirmation.",
  schema: toolSchemas.deleteNode,
  targetSummary: (input: DeleteNodePayload) => `delete node ${input.nodeId}`,
  auditMode: () => "commit" as const
};
