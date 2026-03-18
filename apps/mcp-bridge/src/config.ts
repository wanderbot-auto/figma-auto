import path from "node:path";

import { BRIDGE_PORT } from "@figma-auto/protocol";

const workspaceRoot = path.resolve(import.meta.dirname, "../../..");
const configuredPort = Number.parseInt(process.env.FIGMA_AUTO_BRIDGE_PORT ?? `${BRIDGE_PORT}`, 10);
const host = process.env.FIGMA_AUTO_BRIDGE_HOST ?? "127.0.0.1";
const publicWsUrl = process.env.FIGMA_AUTO_BRIDGE_PUBLIC_WS_URL ?? `ws://${host}:${Number.isNaN(configuredPort) ? BRIDGE_PORT : configuredPort}`;
const publicHttpUrl = process.env.FIGMA_AUTO_BRIDGE_PUBLIC_HTTP_URL
  ?? publicWsUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:");

export const bridgeConfig = {
  host,
  port: Number.isNaN(configuredPort) ? BRIDGE_PORT : configuredPort,
  workspaceRoot,
  auditLogPath: process.env.FIGMA_AUTO_AUDIT_LOG_PATH ?? path.join(workspaceRoot, "logs", "audit.ndjson"),
  publicWsUrl,
  publicHttpUrl
};
