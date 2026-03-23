import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import assert from "node:assert/strict";

import { SESSION_REPLACED_CLOSE_CODE, SESSION_REPLACED_CLOSE_REASON } from "@figma-auto/protocol";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { AuditLogger } from "../dist/logging/audit-log.js";
import { BridgeLogger } from "../dist/logging/bridge-log.js";
import { resolveBridgeListenOptions, resolvePublicMcpHttpUrl } from "../dist/config.js";
import { ProtocolFailure } from "../dist/errors.js";
import { validationIssuesToProtocolError } from "../dist/errors.js";
import { registerBridgeResources } from "../dist/resources.js";
import { parseIncomingMessage } from "../dist/schema/protocol.js";
import { PluginSessionStore } from "../dist/session/plugin-session-store.js";
import { isInitializeRequestBody, isMcpRequestPath, RemoteMcpHttpServer } from "../dist/transport/mcp-http.js";
import { RemoteMcpSseServer } from "../dist/transport/mcp-sse.js";
import { formatWebSocketListenError, PluginWebSocketBridge } from "../dist/transport/websocket.js";

class FakeSocket {
  constructor(name) {
    this.name = name;
    this.closed = false;
    this.closeCode = undefined;
    this.closeReason = undefined;
  }

  close(code, reason) {
    this.closed = true;
    this.closeCode = code;
    this.closeReason = reason;
  }
}

function createNoopLogger() {
  return {
    info() {
      return Promise.resolve();
    },
    warn() {
      return Promise.resolve();
    },
    error() {
      return Promise.resolve();
    }
  };
}

async function requestMcpServer({
  method,
  path: requestPath,
  headers,
  body
}) {
  const bridge = new RemoteMcpHttpServer(
    () => {
      throw new Error("createServer should not be called in this test");
    },
    "/mcp",
    createNoopLogger()
  );
  const req = Readable.from(body ? [body] : []);
  req.method = method;
  req.url = requestPath;
  req.headers = headers ?? {};
  let status;
  let responseHeaders = {};
  let responseBody = "";
  const res = {
    headersSent: false,
    writeHead(statusCode, nextHeaders = {}) {
      status = statusCode;
      responseHeaders = Object.fromEntries(
        Object.entries(nextHeaders).map(([key, value]) => [key.toLowerCase(), value])
      );
      this.headersSent = true;
      return this;
    },
    end(chunk = "") {
      responseBody += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      return this;
    }
  };

  try {
    await bridge.handleRequest(req, res);
    return {
      status,
      contentType: responseHeaders["content-type"],
      body: JSON.parse(responseBody)
    };
  } finally {
    await bridge.close();
  }
}

async function requestSseServer({
  method,
  path: requestPath,
  headers,
  body
}) {
  const bridge = new RemoteMcpSseServer(
    () => new McpServer({ name: "figma-auto-test", version: "0.0.0" }),
    "/sse",
    "/messages",
    createNoopLogger()
  );
  const req = Readable.from(body ? [body] : []);
  req.method = method;
  req.url = requestPath;
  req.headers = headers ?? {};
  let status;
  let responseHeaders = {};
  let responseBody = "";
  const listeners = new Map();
  const res = {
    headersSent: false,
    writeHead(statusCode, nextHeaders = {}) {
      status = statusCode;
      responseHeaders = Object.fromEntries(
        Object.entries(nextHeaders).map(([key, value]) => [key.toLowerCase(), value])
      );
      this.headersSent = true;
      return this;
    },
    write(chunk = "") {
      responseBody += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      return true;
    },
    end(chunk = "") {
      responseBody += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      return this;
    },
    on(event, handler) {
      listeners.set(event, handler);
      return this;
    }
  };

  try {
    const handled = await bridge.handleRequest(req, res);
    return {
      handled,
      status,
      contentType: responseHeaders["content-type"],
      body: responseBody
    };
  } finally {
    const closeHandler = listeners.get("close");
    if (closeHandler) {
      closeHandler();
    }
    await bridge.close();
  }
}

test("session store keeps only one active session", () => {
  const store = new PluginSessionStore();
  const firstSocket = new FakeSocket("first");
  const secondSocket = new FakeSocket("second");

  store.register({
    sessionId: "sess_1",
    protocolVersion: "1.0.0",
    pluginInstanceId: "plugin_1",
    fileKey: "file_1",
    pageId: "1:2",
    editorType: "figma"
  }, firstSocket);

  store.register({
    sessionId: "sess_2",
    protocolVersion: "1.0.0",
    pluginInstanceId: "plugin_2",
    fileKey: "file_2",
    pageId: "1:3",
    editorType: "figma"
  }, secondSocket);

  assert.equal(firstSocket.closed, true);
  assert.equal(firstSocket.closeCode, SESSION_REPLACED_CLOSE_CODE);
  assert.equal(firstSocket.closeReason, SESSION_REPLACED_CLOSE_REASON);
  assert.equal(store.getActive().context.sessionId, "sess_2");
});

test("session store preserves connectedAt and updates lastSeenAt for the same socket", async () => {
  const store = new PluginSessionStore();
  const socket = new FakeSocket("primary");

  store.register({
    sessionId: "sess_1",
    protocolVersion: "1.0.0",
    pluginInstanceId: "plugin_1",
    fileKey: "file_1",
    pageId: "1:2",
    editorType: "figma"
  }, socket);

  const first = store.getActive();
  await new Promise((resolve) => setTimeout(resolve, 5));

  store.touchForSocket(socket);
  store.register({
    sessionId: "sess_1",
    protocolVersion: "1.0.0",
    pluginInstanceId: "plugin_1",
    fileKey: "file_1",
    pageId: "1:3",
    editorType: "figma"
  }, socket);

  const second = store.getActive();

  assert.equal(second.connectedAt, first.connectedAt);
  assert.notEqual(second.lastSeenAt, first.lastSeenAt);
  assert.equal(second.context.pageId, "1:3");
});

test("audit logger writes NDJSON entries", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "figma-auto-audit-"));
  const filePath = path.join(tempDir, "audit.ndjson");
  const logger = new AuditLogger(filePath);

  await logger.append({
    timestamp: new Date().toISOString(),
    mode: "dry_run",
    sessionId: "sess_1",
    requestId: "req_1",
    tool: "figma.batch_edit",
    targetSummary: "1 batch op(s)",
    ok: true
  });

  const content = await fs.readFile(filePath, "utf8");
  const [line] = content.trim().split("\n");
  const parsed = JSON.parse(line);

  assert.equal(parsed.mode, "dry_run");
  assert.equal(parsed.tool, "figma.batch_edit");
});

test("bridge logger writes readable lifecycle lines", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "figma-auto-bridge-log-"));
  const filePath = path.join(tempDir, "bridge.log");
  const logger = new BridgeLogger(filePath);

  await logger.info("session_registered", {
    sessionId: "sess_1",
    pageId: "1:2"
  });

  const content = await fs.readFile(filePath, "utf8");
  assert.match(content, /INFO session_registered/);
  assert.match(content, /sessionId="sess_1"/);
  assert.match(content, /pageId="1:2"/);
});

test("validation issues map batch op overflow to batch_limit_exceeded", () => {
  const error = validationIssuesToProtocolError([
    {
      code: "too_big",
      message: "Array must contain at most 10 element(s)",
      path: ["ops"]
    }
  ]);

  assert.equal(error.code, "batch_limit_exceeded");
});

test("websocket listen errors explain port conflicts", () => {
  const error = new Error("listen EADDRINUSE: address already in use ::1:4975");
  error.code = "EADDRINUSE";

  assert.equal(
    formatWebSocketListenError(error, "localhost", 4975),
    "Failed to bind WebSocket bridge on localhost:4975: address already in use. Another figma-auto bridge is probably already running on this port. Stop the existing bridge or choose a different FIGMA_AUTO_BRIDGE_PORT."
  );
});

test("public MCP URL appends /mcp to the bridge HTTP URL", () => {
  assert.equal(resolvePublicMcpHttpUrl("http://localhost:4975"), "http://localhost:4975/mcp");
  assert.equal(resolvePublicMcpHttpUrl("http://localhost:4975/base"), "http://localhost:4975/base/mcp");
  assert.equal(resolvePublicMcpHttpUrl("http://localhost:4975/mcp"), "http://localhost:4975/mcp");
});

test("localhost bridge host resolves to dual-stack listen options", () => {
  assert.deepEqual(resolveBridgeListenOptions("localhost", 4975), {
    host: "::",
    port: 4975,
    ipv6Only: false
  });
  assert.deepEqual(resolveBridgeListenOptions("127.0.0.1", 4975), {
    host: "127.0.0.1",
    port: 4975
  });
});

test("HTTP MCP routing accepts root and /mcp, and initialize detection is strict", () => {
  assert.equal(isMcpRequestPath("/", "/mcp"), true);
  assert.equal(isMcpRequestPath("/mcp", "/mcp"), true);
  assert.equal(isMcpRequestPath("/other", "/mcp"), false);
  assert.equal(isInitializeRequestBody({ method: "initialize" }), true);
  assert.equal(isInitializeRequestBody({ method: "tools/list" }), false);
});

test("bridge MCP resources expose static entries and dynamic templates", async () => {
  const sessionStore = new PluginSessionStore();
  const mcpServer = new McpServer({
    name: "figma-auto-test",
    version: "0.0.0"
  });
  const calls = [];
  const wsBridge = {
    async callPlugin(name, payload) {
      calls.push({ name, payload });
      return {
        ok: true,
        name,
        payload
      };
    }
  };

  registerBridgeResources({
    mcpServer,
    sessionStore,
    wsBridge,
    getSessionStatus: () => ({
      connected: false,
      host: "localhost",
      port: 4975,
      publicWsUrl: "ws://localhost:4975",
      publicHttpUrl: "http://localhost:4975",
      session: null
    })
  });

  assert.ok(mcpServer._registeredResources["figma://session/status"]);
  assert.ok(mcpServer._registeredResources["figma://file/current"]);
  assert.ok(mcpServer._registeredResources["figma://page/current"]);
  assert.ok(mcpServer._registeredResources["figma://selection/current"]);
  assert.ok(mcpServer._registeredResources["figma://pages"]);
  assert.ok(mcpServer._registeredResources["figma://styles"]);
  assert.ok(mcpServer._registeredResources["figma://components"]);
  assert.ok(mcpServer._registeredResources["figma://variables"]);
  assert.ok(mcpServer._registeredResourceTemplates["figma-node"]);
  assert.ok(mcpServer._registeredResourceTemplates["figma-node-tree"]);
  assert.ok(mcpServer._registeredResourceTemplates["figma-flow"]);

  const sessionResult = await mcpServer._registeredResources["figma://session/status"].readCallback(
    new URL("figma://session/status"),
    {}
  );
  assert.equal(sessionResult.contents[0].mimeType, "application/json");
  assert.match(sessionResult.contents[0].text, /"connected": false/);

  const nodeResult = await mcpServer._registeredResourceTemplates["figma-node"].readCallback(
    new URL("figma://node/1%3A2"),
    { nodeId: "1:2" },
    {}
  );
  assert.equal(calls[0].name, "figma.get_node");
  assert.deepEqual(calls[0].payload, { nodeId: "1:2" });
  assert.match(nodeResult.contents[0].text, /"name": "figma.get_node"/);
});

test("HTTP MCP errors always include JSON content type", async () => {
  const notFound = await requestMcpServer({
    method: "GET",
    path: "/other"
  });
  assert.equal(notFound.status, 404);
  assert.match(notFound.contentType, /^application\/json\b/);
  assert.equal(notFound.body.error.message, "Not Found");

  const missingSession = await requestMcpServer({
    method: "GET",
    path: "/mcp"
  });
  assert.equal(missingSession.status, 405);
  assert.match(missingSession.contentType, /^application\/json\b/);
  assert.equal(missingSession.body.error.message, "Method Not Allowed");

  const unknownSession = await requestMcpServer({
    method: "GET",
    path: "/mcp",
    headers: {
      "mcp-session-id": "sess_missing"
    }
  });
  assert.equal(unknownSession.status, 404);
  assert.match(unknownSession.contentType, /^application\/json\b/);
  assert.equal(unknownSession.body.error.message, "Unknown MCP session: sess_missing");
});

test("HTTP MCP returns a parse error for invalid JSON bodies", async () => {
  const invalidJson = await requestMcpServer({
    method: "POST",
    path: "/mcp",
    body: "{"
  });

  assert.equal(invalidJson.status, 400);
  assert.match(invalidJson.contentType, /^application\/json\b/);
  assert.equal(invalidJson.body.error.code, -32700);
  assert.equal(invalidJson.body.error.message, "Invalid JSON request body");
});

test("legacy SSE transport exposes /sse endpoint and endpoint event", async () => {
  const response = await requestSseServer({
    method: "GET",
    path: "/sse"
  });

  assert.equal(response.handled, true);
  assert.equal(response.status, 200);
  assert.match(response.contentType, /^text\/event-stream\b/);
  assert.match(response.body, /event: endpoint/);
  assert.match(response.body, /\/messages\?sessionId=/);
});

test("legacy SSE transport rejects missing sessionId on /messages", async () => {
  const response = await requestSseServer({
    method: "POST",
    path: "/messages",
    headers: {
      "content-type": "application/json"
    },
    body: "{}"
  });

  assert.equal(response.handled, true);
  assert.equal(response.status, 400);
  assert.match(response.contentType, /^application\/json\b/);
  assert.match(response.body, /Missing sessionId query parameter/);
});

test("websocket message parsing reports invalid JSON as validation_failed", () => {
  assert.throws(
    () => parseIncomingMessage("{"),
    (error) => {
      assert.equal(error instanceof ProtocolFailure, true);
      assert.equal(error.protocolError.code, "validation_failed");
      assert.equal(error.protocolError.message, "Invalid JSON message");
      return true;
    }
  );
});

test("callPlugin clears pending requests when websocket send throws", async () => {
  const sessionStore = new PluginSessionStore();
  const socket = {
    readyState: 1,
    send() {
      throw new Error("socket write failed");
    },
    close() {}
  };
  sessionStore.register({
    sessionId: "sess_1",
    protocolVersion: "1.0.0",
    pluginInstanceId: "plugin_1",
    fileKey: "file_1",
    pageId: "1:2",
    editorType: "figma"
  }, socket);

  const bridge = new PluginWebSocketBridge(
    "127.0.0.1",
    4318,
    "/mcp",
    sessionStore,
    createNoopLogger()
  );

  await assert.rejects(
    () => bridge.callPlugin("figma.get_selection", {}, "req_send_failure"),
    (error) => {
      assert.equal(error instanceof ProtocolFailure, true);
      assert.equal(error.protocolError.code, "missing_session");
      assert.equal(error.protocolError.message, "Failed to send request to the active plugin session");
      return true;
    }
  );
  assert.equal(bridge.pending.size, 0);
});
