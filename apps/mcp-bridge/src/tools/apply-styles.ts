import type { ApplyStylesPayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const applyStylesTool = {
  name: "figma.apply_styles",
  description: "Apply or clear local styles on a node.",
  schema: toolSchemas.applyStyles,
  targetSummary: (input: ApplyStylesPayload) => `apply styles on node ${input.nodeId}`,
  auditMode: () => "commit" as const
};
