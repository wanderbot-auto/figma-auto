import path from "node:path";

import { BRIDGE_PORT } from "@figma-auto/protocol";

const workspaceRoot = path.resolve(import.meta.dirname, "../../..");
const configuredPort = Number.parseInt(process.env.FIGMA_AUTO_BRIDGE_PORT ?? `${BRIDGE_PORT}`, 10);

export const bridgeConfig = {
  port: Number.isNaN(configuredPort) ? BRIDGE_PORT : configuredPort,
  workspaceRoot,
  auditLogPath: process.env.FIGMA_AUTO_AUDIT_LOG_PATH ?? path.join(workspaceRoot, "logs", "audit.ndjson")
};
