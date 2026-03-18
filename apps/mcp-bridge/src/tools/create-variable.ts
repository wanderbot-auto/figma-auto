import type { CreateVariablePayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const createVariableTool = {
  name: "figma.create_variable",
  description: "Create a new variable in a local variable collection.",
  schema: toolSchemas.createVariable,
  targetSummary: (input: CreateVariablePayload) => `create variable ${input.name} in ${input.collectionId}`,
  auditMode: () => "commit" as const
};
