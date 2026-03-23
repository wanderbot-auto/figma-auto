import path from "node:path";
import { type ListenOptions } from "node:net";

import { BRIDGE_PORT } from "@figma-auto/protocol";

export function resolvePublicMcpHttpUrl(publicHttpUrl: string): string {
  const url = new URL(publicHttpUrl);
  const normalizedPath = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
  url.pathname = normalizedPath.endsWith("/mcp") ? normalizedPath : `${normalizedPath}/mcp`;
  return url.toString();
}

export function resolveBridgeListenOptions(host: string, port: number): ListenOptions {
  if (host === "localhost") {
    return {
      host: "::",
      port,
      ipv6Only: false
    };
  }

  return {
    host,
    port
  };
}

const workspaceRoot = path.resolve(import.meta.dirname, "../../..");
const configuredPort = Number.parseInt(process.env.FIGMA_AUTO_BRIDGE_PORT ?? `${BRIDGE_PORT}`, 10);
const host = process.env.FIGMA_AUTO_BRIDGE_HOST ?? "127.0.0.1";
const publicWsUrl = process.env.FIGMA_AUTO_BRIDGE_PUBLIC_WS_URL ?? `ws://${host}:${Number.isNaN(configuredPort) ? BRIDGE_PORT : configuredPort}`;
const publicHttpUrl = process.env.FIGMA_AUTO_BRIDGE_PUBLIC_HTTP_URL
  ?? publicWsUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
const publicMcpHttpUrl = resolvePublicMcpHttpUrl(publicHttpUrl);

export const bridgeConfig = {
  host,
  port: Number.isNaN(configuredPort) ? BRIDGE_PORT : configuredPort,
  workspaceRoot,
  bridgeLogPath: process.env.FIGMA_AUTO_BRIDGE_LOG_PATH ?? path.join(workspaceRoot, "logs", "bridge.log"),
  auditLogPath: process.env.FIGMA_AUTO_AUDIT_LOG_PATH ?? path.join(workspaceRoot, "logs", "audit.ndjson"),
  publicWsUrl,
  publicHttpUrl,
  publicMcpHttpUrl,
  mcpHttpPath: new URL(publicMcpHttpUrl).pathname
};
