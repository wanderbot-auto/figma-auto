import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type ToolName } from "@figma-auto/protocol";

import { bridgeConfig } from "./config.js";
import { AuditLogger, type AuditMode } from "./logging/audit-log.js";
import { formatJson } from "./format.js";
import { coerceProtocolError } from "./errors.js";
import { PluginSessionStore } from "./session/plugin-session-store.js";
import { toolDefinitions } from "./tools/index.js";
import { PluginWebSocketBridge } from "./transport/websocket.js";

export class FigmaAutoBridgeServer {
  private readonly sessionStore = new PluginSessionStore();
  private readonly auditLogger = new AuditLogger(bridgeConfig.auditLogPath);
  private readonly wsBridge = new PluginWebSocketBridge(bridgeConfig.port, this.sessionStore);
  private readonly mcpServer = new McpServer({
    name: "figma-auto-bridge",
    version: "0.1.0"
  });

  constructor() {
    this.registerTools();
  }

  async start(): Promise<void> {
    await this.wsBridge.start();
    const transport = new StdioServerTransport();
    await this.mcpServer.connect(transport);
  }

  private registerTools(): void {
    for (const definition of toolDefinitions) {
      this.mcpServer.tool(
        definition.name,
        definition.description,
        definition.schema.shape,
        async (input: Record<string, unknown>) => {
          const requestId = crypto.randomUUID();
          return this.handleTool(
            definition.name as ToolName,
            requestId,
            input,
            definition.targetSummary(input as never),
            definition.auditMode(input as never)
          );
        }
      );
    }
  }

  private async handleTool(
    name: ToolName,
    requestId: string,
    input: Record<string, unknown>,
    targetSummary: string,
    auditMode: AuditMode | null
  ) {
    try {
      const result = await this.wsBridge.callPlugin(name, input, requestId);
      await this.logToolOutcome(name, requestId, targetSummary, auditMode, true);
      return {
        content: [
          {
            type: "text" as const,
            text: formatJson(result)
          }
        ]
      };
    } catch (error) {
      const protocolError = coerceProtocolError(error);
      await this.logToolOutcome(name, requestId, targetSummary, auditMode, false, protocolError.code);
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: formatJson(protocolError)
          }
        ]
      };
    }
  }

  private async logToolOutcome(
    name: ToolName,
    requestId: string,
    targetSummary: string,
    auditMode: AuditMode | null,
    ok: boolean,
    errorCode?: string
  ): Promise<void> {
    if (!auditMode) {
      return;
    }

    const activeSession = this.sessionStore.getActive();
    const entry = {
      timestamp: new Date().toISOString(),
      mode: auditMode,
      sessionId: activeSession?.context.sessionId ?? "missing_session",
      requestId,
      tool: name,
      targetSummary,
      ok
    };
    await this.auditLogger.append(errorCode ? { ...entry, errorCode } : entry);
  }
}
