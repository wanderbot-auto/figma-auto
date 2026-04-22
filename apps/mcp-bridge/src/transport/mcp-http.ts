import { randomUUID } from "node:crypto";
import { type IncomingMessage, type ServerResponse } from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { type Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { ProtocolFailure } from "../errors.js";
import { type BridgeLogger } from "../logging/bridge-log.js";
import { readJsonBody, writeJsonRpcError } from "./http-utils.js";

interface HttpMcpSession {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
  isClosing: boolean;
}

function getSessionId(req: IncomingMessage): string | undefined {
  const header = req.headers["mcp-session-id"];
  return typeof header === "string" && header.length > 0 ? header : undefined;
}

export function isInitializeRequestBody(body: unknown): body is { method: "initialize" } {
  return typeof body === "object" && body !== null && "method" in body && body.method === "initialize";
}

export function isMcpRequestPath(url: string | undefined, mcpPath: string): boolean {
  const pathname = new URL(url ?? "/", "http://localhost").pathname;
  return pathname === "/" || pathname === mcpPath;
}

export class RemoteMcpHttpServer {
  private readonly sessions = new Map<string, HttpMcpSession>();

  constructor(
    private readonly createServer: () => McpServer,
    private readonly mcpPath: string,
    private readonly bridgeLogger: BridgeLogger
  ) {}

  async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!isMcpRequestPath(req.url, this.mcpPath)) {
      writeJsonRpcError(res, 404, -32000, "Not Found");
      return;
    }

    switch (req.method) {
    case "POST":
      await this.handlePost(req, res);
      return;
    case "GET":
      await this.handleGet(req, res);
      return;
    case "DELETE":
      await this.handleDelete(req, res);
      return;
    default:
      writeJsonRpcError(res, 405, -32000, "Method Not Allowed", {
        Allow: "GET, POST, DELETE"
      });
    }
  }

  async close(): Promise<void> {
    const sessions = [...this.sessions.entries()];
    this.sessions.clear();

    for (const [sessionId, session] of sessions) {
      await this.shutdownSession(sessionId, session, {
        closeTransport: true,
        closeServer: true,
        logClose: false
      });
    }
  }

  private async handlePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
    const sessionId = getSessionId(req);

    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (!session) {
        writeJsonRpcError(res, 404, -32001, `Unknown MCP session: ${sessionId}`);
        return;
      }

      await session.transport.handleRequest(req, res, body);
      return;
    }

    if (!isInitializeRequestBody(body)) {
      writeJsonRpcError(res, 400, -32000, "Bad Request: Missing MCP session ID or initialize request body");
      return;
    }

    const server = this.createServer();
    let transport: StreamableHTTPServerTransport;
    let activeSessionId: string | undefined;
    transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (initializedSessionId) => {
        activeSessionId = initializedSessionId;
        this.sessions.set(initializedSessionId, {
          server,
          transport,
          isClosing: false
        });
        void this.bridgeLogger.info("mcp_http_session_started", {
          sessionId: initializedSessionId
        });
      }
    });

    transport.onclose = () => {
      if (!activeSessionId) {
        return;
      }

      const session = this.sessions.get(activeSessionId);
      if (!session || session.isClosing) {
        return;
      }

      void this.shutdownSession(activeSessionId, session, {
        closeTransport: false,
        closeServer: true,
        logClose: true
      });
    };

    transport.onerror = (error) => {
      void this.bridgeLogger.warn("mcp_http_transport_error", {
        message: error.message,
        sessionId: activeSessionId
      });
    };

    // SDK typings are slightly incompatible under exactOptionalPropertyTypes, but the transport is valid at runtime.
    await server.connect(transport as Transport);
    await transport.handleRequest(req, res, body);
  }

  private async shutdownSession(
    sessionId: string,
    session: HttpMcpSession,
    options: {
      closeTransport: boolean;
      closeServer: boolean;
      logClose: boolean;
    }
  ): Promise<void> {
    if (session.isClosing) {
      return;
    }

    session.isClosing = true;
    this.sessions.delete(sessionId);
    session.transport.onclose = () => {};

    if (options.logClose) {
      await this.bridgeLogger.info("mcp_http_session_closed", {
        sessionId
      });
    }

    if (options.closeTransport) {
      await session.transport.close();
    }

    if (options.closeServer) {
      await session.server.close();
    }
  }

  private async handleGet(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionId = getSessionId(req);
    if (!sessionId) {
      writeJsonRpcError(res, 405, -32000, "Method Not Allowed", {
        Allow: "POST, DELETE"
      });
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      writeJsonRpcError(res, 404, -32001, `Unknown MCP session: ${sessionId}`);
      return;
    }

    await session.transport.handleRequest(req, res);
  }

  private async handleDelete(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionId = getSessionId(req);
    if (!sessionId) {
      writeJsonRpcError(res, 400, -32000, "Bad Request: Missing MCP session ID");
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      writeJsonRpcError(res, 404, -32001, `Unknown MCP session: ${sessionId}`);
      return;
    }

    await session.transport.handleRequest(req, res);
  }
}
