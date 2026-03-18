import type { DuplicateNodePayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const duplicateNodeTool = {
  name: "figma.duplicate_node",
  description: "Duplicate an existing scene node, optionally moving or renaming the copy.",
  schema: toolSchemas.duplicateNode,
  targetSummary: (input: DuplicateNodePayload) => `duplicate node ${input.nodeId}`,
  auditMode: () => "commit" as const
};
