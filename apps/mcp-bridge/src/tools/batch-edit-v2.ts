import type { BatchEditV2Payload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const batchEditV2Tool = {
  name: "figma.batch_edit_v2",
  description: "Run a larger bounded batch of edit operations with references to earlier ops.",
  schema: toolSchemas.batchEditV2,
  targetSummary: (input: BatchEditV2Payload) => `${input.ops.length} batch v2 op(s)`,
  auditMode: (input: BatchEditV2Payload) => (input.dryRun ?? true) ? "dry_run" as const : "commit" as const
};
