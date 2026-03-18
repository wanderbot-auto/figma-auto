import type { CreateSpecPagePayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const createSpecPageTool = {
  name: "figma.create_spec_page",
  description: "Create a documentation page summarizing the current file, page, and optional source node.",
  schema: toolSchemas.createSpecPage,
  targetSummary: (input: CreateSpecPagePayload) => `create spec page ${input.name ?? "Specs"}`,
  auditMode: () => "commit" as const
};
