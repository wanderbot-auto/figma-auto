import { toolSchemas } from "../schema/tool-schemas.js";

export const getSessionStatusTool = {
  name: "figma.get_session_status",
  description: "Return the local bridge session state for the active Figma plugin connection.",
  schema: toolSchemas.getSessionStatus,
  targetSummary: () => "bridge session status",
  auditMode: () => null
};
