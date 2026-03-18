import type { BindVariablePayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const bindVariableTool = {
  name: "figma.bind_variable",
  description: "Bind or unbind a variable on a node field or paint color.",
  schema: toolSchemas.bindVariable,
  targetSummary: (input: BindVariablePayload) =>
    `${input.variableId ?? "clear variable"} on ${input.nodeId} (${input.kind}:${input.field})`,
  auditMode: () => "commit" as const
};
