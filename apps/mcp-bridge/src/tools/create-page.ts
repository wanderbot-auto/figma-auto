import type { CreatePagePayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const createPageTool = {
  name: "figma.create_page",
  description: "Create a new page in the active Figma file.",
  schema: toolSchemas.createPage,
  targetSummary: (input: CreatePagePayload) => `create page ${input.name}`,
  auditMode: () => "commit" as const
};
