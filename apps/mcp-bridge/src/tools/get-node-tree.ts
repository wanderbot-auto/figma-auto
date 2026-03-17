import type { GetNodeTreePayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const getNodeTreeTool = {
  name: "figma.get_node_tree",
  description: "Return a recursive node tree snapshot for a target node or the current page.",
  schema: toolSchemas.getNodeTree,
  targetSummary: (input: GetNodeTreePayload) => input.nodeId ? `node tree ${input.nodeId}` : "current page tree",
  auditMode: () => null
};
