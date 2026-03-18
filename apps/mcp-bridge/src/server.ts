import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type GetSessionStatusResult, type ToolName } from "@figma-auto/protocol";

import { bridgeConfig } from "./config.js";
import { AuditLogger, type AuditMode } from "./logging/audit-log.js";
import { BridgeLogger } from "./logging/bridge-log.js";
import { formatJson } from "./format.js";
import { coerceProtocolError, validationIssuesToProtocolError } from "./errors.js";
import { PluginSessionStore } from "./session/plugin-session-store.js";
import { toolDefinitions } from "./tools/index.js";
import { PluginWebSocketBridge } from "./transport/websocket.js";

export class FigmaAutoBridgeServer {
  private readonly sessionStore = new PluginSessionStore();
  private readonly auditLogger = new AuditLogger(bridgeConfig.auditLogPath);
  private readonly bridgeLogger = new BridgeLogger(bridgeConfig.bridgeLogPath);
  private readonly wsBridge = new PluginWebSocketBridge(
    bridgeConfig.host,
    bridgeConfig.port,
    this.sessionStore,
    this.bridgeLogger
  );
  private readonly mcpServer = new McpServer({
    name: "figma-auto-bridge",
    version: "0.1.0"
  });

  constructor() {
    this.registerTools();
  }

  async start(): Promise<void> {
    await this.bridgeLogger.info("bridge_starting", {
      host: bridgeConfig.host,
      port: bridgeConfig.port,
      publicWsUrl: bridgeConfig.publicWsUrl
    });

    try {
      await this.wsBridge.start();
      const transport = new StdioServerTransport();
      await this.mcpServer.connect(transport);
      await this.bridgeLogger.info("bridge_ready");
    } catch (error) {
      const protocolError = coerceProtocolError(error);
      await this.bridgeLogger.error("bridge_start_failed", {
        code: protocolError.code,
        message: protocolError.message
      });
      throw error;
    }
  }

  private registerTools(): void {
    for (const definition of toolDefinitions) {
      this.mcpServer.registerTool(
        definition.name,
        {
          description: definition.description,
          inputSchema: definition.schema
        },
        async (input: unknown) => {
          const requestId = crypto.randomUUID();
          const parsed = definition.schema.safeParse(input);
          if (!parsed.success) {
            const protocolError = validationIssuesToProtocolError(parsed.error.issues);
            await this.bridgeLogger.warn("tool_validation_failed", {
              tool: definition.name,
              requestId,
              code: protocolError.code,
              message: protocolError.message
            });
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

          const parsedInput = parsed.data as Record<string, unknown>;
          return this.handleTool(
            definition.name as ToolName,
            requestId,
            parsedInput,
            definition.targetSummary(parsedInput as never),
            definition.auditMode(parsedInput as never)
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
      const result =
        name === "figma.get_session_status"
          ? this.getSessionStatus()
          : await this.wsBridge.callPlugin(name, input, requestId);
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
      await this.bridgeLogger.error("tool_failed", {
        tool: name,
        requestId,
        code: protocolError.code,
        message: protocolError.message,
        targetSummary
      });
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

  private getSessionStatus(): GetSessionStatusResult {
    const activeSession = this.sessionStore.getActive();

    return {
      connected: Boolean(activeSession),
      host: bridgeConfig.host,
      port: bridgeConfig.port,
      publicWsUrl: bridgeConfig.publicWsUrl,
      publicHttpUrl: bridgeConfig.publicHttpUrl,
      session: activeSession
        ? {
            sessionId: activeSession.context.sessionId,
            pluginInstanceId: activeSession.context.pluginInstanceId,
            fileKey: activeSession.context.fileKey,
            pageId: activeSession.context.pageId,
            editorType: activeSession.context.editorType,
            connectedAt: activeSession.connectedAt,
            lastSeenAt: activeSession.lastSeenAt
          }
        : null
    };
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
