import type { CreateRectanglePayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const createRectangleTool = {
  name: "figma.create_rectangle",
  description: "Create a new rectangle in the active Figma file.",
  schema: toolSchemas.createRectangle,
  targetSummary: (input: CreateRectanglePayload) => `create rectangle ${input.name ?? "Rectangle"}`,
  auditMode: () => "commit" as const
};
