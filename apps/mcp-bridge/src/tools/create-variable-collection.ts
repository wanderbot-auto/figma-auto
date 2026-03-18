import type { CreateVariableCollectionPayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const createVariableCollectionTool = {
  name: "figma.create_variable_collection",
  description: "Create a new local variable collection in the active file.",
  schema: toolSchemas.createVariableCollection,
  targetSummary: (input: CreateVariableCollectionPayload) => `create variable collection ${input.name}`,
  auditMode: () => "commit" as const
};
