import type { CreateInstancePayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const createInstanceTool = {
  name: "figma.create_instance",
  description: "Create a component instance from a component or component set.",
  schema: toolSchemas.createInstance,
  targetSummary: (input: CreateInstancePayload) => `create instance from ${input.componentId}`,
  auditMode: () => "commit" as const
};
