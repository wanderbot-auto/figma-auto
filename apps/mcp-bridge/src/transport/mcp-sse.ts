import { type IncomingMessage, type ServerResponse } from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { type Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { ProtocolFailure } from "../errors.js";
import { type BridgeLogger } from "../logging/bridge-log.js";
import { readJsonBody, writeJsonRpcError } from "./http-utils.js";

interface HttpSseSession {
  server: McpServer;
  transport: SSEServerTransport;
}

function getPathname(url: string | undefined): string {
  return new URL(url ?? "/", "http://localhost").pathname;
}

function getLegacySessionId(url: string | undefined): string | undefined {
  const sessionId = new URL(url ?? "/", "http://localhost").searchParams.get("sessionId");
  return typeof sessionId === "string" && sessionId.length > 0 ? sessionId : undefined;
}

export class RemoteMcpSseServer {
  private readonly sessions = new Map<string, HttpSseSession>();

  constructor(
    private readonly createServer: () => McpServer,
    private readonly ssePath: string,
    private readonly messagesPath: string,
    private readonly bridgeLogger: BridgeLogger
  ) {}

  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const pathname = getPathname(req.url);

    if (pathname === this.ssePath) {
      if (req.method !== "GET") {
        writeJsonRpcError(res, 405, -32000, "Method Not Allowed", {
          Allow: "GET"
        });
        return true;
      }

      await this.handleSseGet(res);
      return true;
    }

    if (pathname === this.messagesPath) {
      if (req.method !== "POST") {
        writeJsonRpcError(res, 405, -32000, "Method Not Allowed", {
          Allow: "POST"
        });
        return true;
      }

      await this.handleMessagesPost(req, res);
      return true;
    }

    return false;
  }

  async close(): Promise<void> {
    const sessions = [...this.sessions.values()];
    this.sessions.clear();

    for (const session of sessions) {
      await session.transport.close();
      await session.server.close();
    }
  }

  private async handleSseGet(res: ServerResponse): Promise<void> {
    const server = this.createServer();
    const transport = new SSEServerTransport(this.messagesPath, res);
    const sessionId = transport.sessionId;
    this.sessions.set(sessionId, { server, transport });

    transport.onclose = () => {
      const session = this.sessions.get(sessionId);
      if (!session) {
        return;
      }

      this.sessions.delete(sessionId);
      void this.bridgeLogger.info("mcp_sse_session_closed", {
        sessionId
      });
      void server.close();
    };

    transport.onerror = (error) => {
      void this.bridgeLogger.warn("mcp_sse_transport_error", {
        message: error.message,
        sessionId
      });
    };

    try {
      await server.connect(transport as Transport);
      await this.bridgeLogger.info("mcp_sse_session_started", {
        sessionId,
        ssePath: this.ssePath,
        messagesPath: this.messagesPath
      });
    } catch (error) {
      this.sessions.delete(sessionId);
      await server.close();
      throw error;
    }
  }

  private async handleMessagesPost(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionId = getLegacySessionId(req.url);
    if (!sessionId) {
      writeJsonRpcError(res, 400, -32000, "Bad Request: Missing sessionId query parameter");
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      writeJsonRpcError(res, 404, -32001, `Unknown SSE session: ${sessionId}`);
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      if (error instanceof ProtocolFailure && error.protocolError.code === "validation_failed") {
        writeJsonRpcError(res, 400, -32700, error.message);
        return;
      }

      throw error;
    }

    await session.transport.handlePostMessage(req, res, body);
  }
}
