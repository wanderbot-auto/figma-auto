import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { AuditLogger } from "../dist/logging/audit-log.js";
import { PluginSessionStore } from "../dist/session/plugin-session-store.js";

class FakeSocket {
  constructor(name) {
    this.name = name;
    this.closed = false;
  }

  close() {
    this.closed = true;
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
  assert.equal(store.getActive().context.sessionId, "sess_2");
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
