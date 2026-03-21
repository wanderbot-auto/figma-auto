import { randomUUID } from "node:crypto";
import { type IncomingMessage, type ServerResponse } from "node:http";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { type Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

import { type BridgeLogger } from "../logging/bridge-log.js";

interface HttpMcpSession {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

function getSessionId(req: IncomingMessage): string | undefined {
  const header = req.headers["mcp-session-id"];
  return typeof header === "string" && header.length > 0 ? header : undefined;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (rawBody.length === 0) {
    return undefined;
  }

  return JSON.parse(rawBody);
}

function writeJsonRpcError(
  res: ServerResponse,
  statusCode: number,
  code: number,
  message: string
): void {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code,
      message
    },
    id: null
  }));
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
      res.writeHead(404).end("Not Found");
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
      res.writeHead(405, { Allow: "GET, POST, DELETE" }).end("Method Not Allowed");
    }
  }

  async close(): Promise<void> {
    const sessions = [...this.sessions.values()];
    this.sessions.clear();

    for (const session of sessions) {
      await session.transport.close();
      await session.server.close();
    }
  }

  private async handlePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readJsonBody(req);
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
    transport = new StreamableHTTPServerTransport({
      enableJsonResponse: true,
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (initializedSessionId) => {
        this.sessions.set(initializedSessionId, { server, transport });
        void this.bridgeLogger.info("mcp_http_session_started", {
          sessionId: initializedSessionId
        });
      }
    });

    transport.onclose = () => {
      const activeSessionId = transport.sessionId;
      if (!activeSessionId) {
        return;
      }

      this.sessions.delete(activeSessionId);
      void this.bridgeLogger.info("mcp_http_session_closed", {
        sessionId: activeSessionId
      });
      void server.close();
    };

    transport.onerror = (error) => {
      void this.bridgeLogger.warn("mcp_http_transport_error", {
        message: error.message,
        sessionId: transport.sessionId
      });
    };

    // SDK typings are slightly incompatible under exactOptionalPropertyTypes, but the transport is valid at runtime.
    await server.connect(transport as Transport);
    await transport.handleRequest(req, res, body);
  }

  private async handleGet(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const sessionId = getSessionId(req);
    if (!sessionId) {
      res.writeHead(405, { Allow: "POST, DELETE" }).end("Method Not Allowed");
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      res.writeHead(404).end("Unknown MCP session");
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
