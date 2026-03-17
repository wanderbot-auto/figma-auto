import type { SetTextPayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const setTextTool = {
  name: "figma.set_text",
  description: "Set text on a text node after strict font validation.",
  schema: toolSchemas.setText,
  targetSummary: (input: SetTextPayload) => `set text on node ${input.nodeId}`,
  auditMode: () => "commit" as const
};
