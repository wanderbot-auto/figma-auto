import { toolSchemas } from "../schema/tool-schemas.js";

export const pingTool = {
  name: "figma.ping",
  description: "Ping the active Figma plugin session.",
  schema: toolSchemas.ping,
  targetSummary: () => "active session",
  auditMode: () => null
};
