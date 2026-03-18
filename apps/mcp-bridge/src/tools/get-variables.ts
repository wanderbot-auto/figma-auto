import type { GetVariablesPayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const getVariablesTool = {
  name: "figma.get_variables",
  description: "Return local variable collections and variables in the active Figma file.",
  schema: toolSchemas.getVariables,
  targetSummary: (input: GetVariablesPayload) =>
    input.collectionId
      ? `variables in collection ${input.collectionId}`
      : `variables${input.resolvedType ? ` of type ${input.resolvedType}` : ""}`,
  auditMode: () => null
};
