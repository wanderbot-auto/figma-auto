import type { MoveNodePayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const moveNodeTool = {
  name: "figma.move_node",
  description: "Move a node to a new parent and optional index.",
  schema: toolSchemas.moveNode,
  targetSummary: (input: MoveNodePayload) => `move node ${input.nodeId} to parent ${input.parentId}`,
  auditMode: () => "commit" as const
};
