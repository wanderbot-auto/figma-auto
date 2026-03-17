import type { RenameNodePayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const renameNodeTool = {
  name: "figma.rename_node",
  description: "Rename a node in the active Figma file.",
  schema: toolSchemas.renameNode,
  targetSummary: (input: RenameNodePayload) => `rename node ${input.nodeId} to ${input.name}`,
  auditMode: () => "commit" as const
};
