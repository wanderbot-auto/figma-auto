import type { CreateFramePayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const createFrameTool = {
  name: "figma.create_frame",
  description: "Create a new frame in the active Figma file.",
  schema: toolSchemas.createFrame,
  targetSummary: (input: CreateFramePayload) => `create frame ${input.name ?? "Frame"}`,
  auditMode: () => "commit" as const
};
