import type { CreateTextPayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const createTextTool = {
  name: "figma.create_text",
  description: "Create a new text node in the active Figma file.",
  schema: toolSchemas.createText,
  targetSummary: (input: CreateTextPayload) => `create text ${input.name ?? "Text"}`,
  auditMode: () => "commit" as const
};
