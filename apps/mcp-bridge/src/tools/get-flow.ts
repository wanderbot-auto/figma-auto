import type { GetFlowPayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const getFlowTool = {
  name: "figma.get_flow",
  description: "Return prototype flow metadata for the current page or a specified page.",
  schema: toolSchemas.getFlow,
  targetSummary: (input: GetFlowPayload) => `page ${input.pageId ?? "current"}`,
  auditMode: () => null
};
