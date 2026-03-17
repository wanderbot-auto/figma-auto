import { toolSchemas } from "../schema/tool-schemas.js";

export const getFileTool = {
  name: "figma.get_file",
  description: "Return metadata for the active Figma file.",
  schema: toolSchemas.getFile,
  targetSummary: () => "active file",
  auditMode: () => null
};
