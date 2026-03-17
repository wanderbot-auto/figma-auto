import type { BatchEditPayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const batchEditTool = {
  name: "figma.batch_edit",
  description: "Run a bounded batch of supported edit operations.",
  schema: toolSchemas.batchEdit,
  targetSummary: (input: BatchEditPayload) => `${input.ops.length} batch op(s)`,
  auditMode: (input: BatchEditPayload) => (input.dryRun ?? true) ? "dry_run" as const : "commit" as const
};
