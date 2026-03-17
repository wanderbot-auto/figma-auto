import test from "node:test";
import assert from "node:assert/strict";

import {
  PROTOCOL_VERSION,
  batchEditPayloadSchema,
  createFramePayloadSchema,
  deleteNodePayloadSchema,
  errorResponseEnvelopeSchema,
  getNodeTreePayloadSchema,
  sessionRegistrationPayloadSchema
} from "../dist/index.js";

test("session registration schema accepts the agreed payload shape", () => {
  const parsed = sessionRegistrationPayloadSchema.parse({
    sessionId: "sess_123",
    protocolVersion: PROTOCOL_VERSION,
    pluginInstanceId: "plugin_123",
    fileKey: "file_123",
    pageId: "1:2",
    editorType: "figma"
  });

  assert.equal(parsed.editorType, "figma");
});

test("batch edit schema rejects more than the maximum op count", () => {
  const payload = {
    dryRun: true,
    ops: Array.from({ length: 11 }, (_, index) => ({
      op: "create_page",
      name: `Page ${index}`
    }))
  };

  const result = batchEditPayloadSchema.safeParse(payload);
  assert.equal(result.success, false);
});

test("error envelope requires a stable error code", () => {
  const parsed = errorResponseEnvelopeSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    requestId: "req_123",
    ok: false,
    error: {
      code: "missing_session",
      message: "No active plugin session"
    }
  });

  assert.equal(parsed.error.code, "missing_session");
});

test("node tree payload accepts omitted nodeId and explicit depth", () => {
  const parsed = getNodeTreePayloadSchema.parse({ depth: 2 });
  assert.equal(parsed.depth, 2);
  assert.equal(parsed.nodeId, undefined);
});

test("delete node payload requires an explicit destructive confirmation", () => {
  const result = deleteNodePayloadSchema.safeParse({ nodeId: "1:2", confirm: false });
  assert.equal(result.success, false);
});

test("create frame payload accepts partial geometry", () => {
  const parsed = createFramePayloadSchema.parse({ name: "Frame", width: 320, height: 240 });
  assert.equal(parsed.width, 320);
  assert.equal(parsed.height, 240);
});
