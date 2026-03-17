import { toolSchemas } from "../schema/tool-schemas.js";

export const getCurrentPageTool = {
  name: "figma.get_current_page",
  description: "Return metadata for the current page in the active Figma file.",
  schema: toolSchemas.getCurrentPage,
  targetSummary: () => "current page",
  auditMode: () => null
};
