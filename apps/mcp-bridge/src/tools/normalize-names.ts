import type { NormalizeNamesPayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const normalizeNamesTool = {
  name: "figma.normalize_names",
  description: "Normalize layer names within the current page or a target subtree.",
  schema: toolSchemas.normalizeNames,
  targetSummary: (input: NormalizeNamesPayload) => input.nodeId ? `normalize names under ${input.nodeId}` : "normalize names on current page",
  auditMode: (input: NormalizeNamesPayload) => (input.dryRun ?? true) ? "dry_run" as const : "commit" as const
};
