import { toolSchemas } from "../schema/tool-schemas.js";

export const listPagesTool = {
  name: "figma.list_pages",
  description: "List pages in the active Figma file.",
  schema: toolSchemas.listPages,
  targetSummary: () => "page list",
  auditMode: () => null
};
