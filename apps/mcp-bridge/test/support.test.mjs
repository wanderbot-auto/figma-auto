import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { SESSION_REPLACED_CLOSE_CODE, SESSION_REPLACED_CLOSE_REASON } from "@figma-auto/protocol";
import { AuditLogger } from "../dist/logging/audit-log.js";
import { BridgeLogger } from "../dist/logging/bridge-log.js";
import { resolvePublicMcpHttpUrl } from "../dist/config.js";
import { validationIssuesToProtocolError } from "../dist/errors.js";
import { PluginSessionStore } from "../dist/session/plugin-session-store.js";
import { isInitializeRequestBody, isMcpRequestPath } from "../dist/transport/mcp-http.js";
import { formatWebSocketListenError } from "../dist/transport/websocket.js";

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

test("HTTP MCP routing accepts root and /mcp, and initialize detection is strict", () => {
  assert.equal(isMcpRequestPath("/", "/mcp"), true);
  assert.equal(isMcpRequestPath("/mcp", "/mcp"), true);
  assert.equal(isMcpRequestPath("/other", "/mcp"), false);
  assert.equal(isInitializeRequestBody({ method: "initialize" }), true);
  assert.equal(isInitializeRequestBody({ method: "tools/list" }), false);
});
