import type { CreateComponentPayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const createComponentTool = {
  name: "figma.create_component",
  description: "Create a new component or convert an existing node into a component.",
  schema: toolSchemas.createComponent,
  targetSummary: (input: CreateComponentPayload) =>
    input.nodeId ? `component from node ${input.nodeId}` : `create component ${input.name ?? "Component"}`,
  auditMode: () => "commit" as const
};
