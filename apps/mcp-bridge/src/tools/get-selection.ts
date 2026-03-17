import { toolSchemas } from "../schema/tool-schemas.js";

export const getSelectionTool = {
  name: "figma.get_selection",
  description: "Return the current selection from the active Figma plugin session.",
  schema: toolSchemas.getSelection,
  targetSummary: () => "current selection",
  auditMode: () => null
};
