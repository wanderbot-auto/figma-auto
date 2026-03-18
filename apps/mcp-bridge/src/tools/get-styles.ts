import type { GetStylesPayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const getStylesTool = {
  name: "figma.get_styles",
  description: "Return local styles from the active Figma file.",
  schema: toolSchemas.getStyles,
  targetSummary: (input: GetStylesPayload) =>
    input.nameContains ? `styles matching ${input.nameContains}` : "list local styles",
  auditMode: () => null
};
