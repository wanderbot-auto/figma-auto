import { createServer } from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { type GetSessionStatusResult, type ToolName } from "@figma-auto/protocol";

import { bridgeConfig, resolveBridgeListenOptions } from "./config.js";
import { AuditLogger, type AuditMode } from "./logging/audit-log.js";
import { BridgeLogger } from "./logging/bridge-log.js";
import { formatJson } from "./format.js";
import { registerBridgeResources } from "./resources.js";
import { coerceProtocolError, validationIssuesToProtocolError } from "./errors.js";
import { PluginSessionStore } from "./session/plugin-session-store.js";
import { toolDefinitions } from "./tools/index.js";
import { RemoteMcpHttpServer } from "./transport/mcp-http.js";
import { RemoteMcpSseServer } from "./transport/mcp-sse.js";
import { PluginWebSocketBridge } from "./transport/websocket.js";

function formatHttpListenError(error: Error & { code?: string }, host: string, port: number): string {
  const target = `${host}:${port}`;
  if (error.code === "EADDRINUSE") {
    return `Failed to bind figma-auto bridge on ${target}: address already in use. Another figma-auto bridge is probably already running on this port.`;
  }

  if (error.code === "EACCES" || error.code === "EPERM") {
    return `Failed to bind figma-auto bridge on ${target}: permission denied. Check local firewall/sandbox restrictions or choose a different host/port.`;
  }

  return `Failed to bind figma-auto bridge on ${target}: ${error.message}`;
}

export class FigmaAutoBridgeServer {
  private readonly sessionStore = new PluginSessionStore();
  private readonly auditLogger = new AuditLogger(bridgeConfig.auditLogPath);
  private readonly bridgeLogger = new BridgeLogger(bridgeConfig.bridgeLogPath);
  private readonly httpServer = createServer((req, res) => {
    (async () => {
      const handledBySseBridge = await this.sseBridge.handleRequest(req, res);
      if (handledBySseBridge) {
        return;
      }

      await this.httpBridge.handleRequest(req, res);
    })().catch((error) => {
      const protocolError = coerceProtocolError(error);
      void this.bridgeLogger.error("mcp_http_request_failed", {
        code: protocolError.code,
        message: protocolError.message,
        method: req.method,
        url: req.url
      });

      if (!res.headersSent) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error"
          },
          id: null
        }));
      } else {
        res.end();
      }
    });
  });
  private readonly wsBridge = new PluginWebSocketBridge(
    bridgeConfig.host,
    bridgeConfig.port,
    bridgeConfig.mcpHttpPath,
    this.sessionStore,
    this.bridgeLogger
  );
  private readonly stdioMcpServer = this.createMcpServer();
  private readonly httpBridge = new RemoteMcpHttpServer(
    () => this.createMcpServer(),
    bridgeConfig.mcpHttpPath,
    this.bridgeLogger
  );
  private readonly sseBridge = new RemoteMcpSseServer(
    () => this.createMcpServer(),
    "/sse",
    "/messages",
    this.bridgeLogger
  );

  constructor() {}

  async start(): Promise<void> {
    await this.bridgeLogger.info("bridge_starting", {
      host: bridgeConfig.host,
      port: bridgeConfig.port,
      publicWsUrl: bridgeConfig.publicWsUrl,
      publicHttpUrl: bridgeConfig.publicHttpUrl,
      publicMcpHttpUrl: bridgeConfig.publicMcpHttpUrl
    });

    try {
      await this.wsBridge.start(this.httpServer);
      await this.startHttpServer();
      const transport = new StdioServerTransport();
      await this.stdioMcpServer.connect(transport);
      await this.bridgeLogger.info("bridge_ready", {
        publicMcpHttpUrl: bridgeConfig.publicMcpHttpUrl,
        legacySseUrl: `${bridgeConfig.publicHttpUrl.replace(/\/+$/, "")}/sse`,
        legacyMessagesUrl: `${bridgeConfig.publicHttpUrl.replace(/\/+$/, "")}/messages`
      });
    } catch (error) {
      const protocolError = coerceProtocolError(error);
      await this.bridgeLogger.error("bridge_start_failed", {
        code: protocolError.code,
        message: protocolError.message
      });
      throw error;
    }
  }

  private createMcpServer(): McpServer {
    const mcpServer = new McpServer({
      name: "figma-auto-bridge",
      version: "0.1.0"
    });
    this.registerTools(mcpServer);
    registerBridgeResources({
      mcpServer,
      sessionStore: this.sessionStore,
      wsBridge: this.wsBridge,
      getSessionStatus: () => this.getSessionStatus()
    });
    return mcpServer;
  }

  private async startHttpServer(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onListening = () => {
        this.httpServer.off("error", onError);
        resolve();
      };

      const onError = (error: Error & { code?: string }) => {
        this.httpServer.off("listening", onListening);
        void this.bridgeLogger.error("http_server_error", {
          message: error.message,
          code: error.code,
          host: bridgeConfig.host,
          port: bridgeConfig.port
        });
        reject(new Error(formatHttpListenError(error, bridgeConfig.host, bridgeConfig.port)));
      };

      this.httpServer.once("listening", onListening);
      this.httpServer.once("error", onError);
      this.httpServer.listen(resolveBridgeListenOptions(bridgeConfig.host, bridgeConfig.port));
    });

    this.httpServer.on("error", (error: Error & { code?: string }) => {
      void this.bridgeLogger.error("http_server_error", {
        message: error.message,
        code: error.code,
        host: bridgeConfig.host,
        port: bridgeConfig.port
      });
    });

    await this.bridgeLogger.info("http_server_listening", {
      host: bridgeConfig.host,
      port: bridgeConfig.port,
      mcpPath: bridgeConfig.mcpHttpPath,
      publicMcpHttpUrl: bridgeConfig.publicMcpHttpUrl
    });
  }

  private registerTools(mcpServer: McpServer): void {
    for (const definition of toolDefinitions) {
      mcpServer.registerTool(
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
      publicHttpUrl: bridgeConfig.publicMcpHttpUrl,
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
