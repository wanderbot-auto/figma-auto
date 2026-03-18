import type { SetImageFillPayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const setImageFillTool = {
  name: "figma.set_image_fill",
  description: "Apply or replace an image fill on a node that supports fills.",
  schema: toolSchemas.setImageFill,
  targetSummary: (input: SetImageFillPayload) => `set image fill on ${input.nodeId}`,
  auditMode: () => "commit" as const
};
