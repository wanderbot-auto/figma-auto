import type { GetComponentsPayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const getComponentsTool = {
  name: "figma.get_components",
  description: "Return local components and component sets from the active Figma file.",
  schema: toolSchemas.getComponents,
  targetSummary: (input: GetComponentsPayload) =>
    input.nameContains ? `components matching ${input.nameContains}` : "list local components",
  auditMode: () => null
};
