import test from "node:test";
import assert from "node:assert/strict";

import {
  PROTOCOL_VERSION,
  batchEditPayloadSchema,
  bindVariablePayloadSchema,
  createComponentPayloadSchema,
  createFramePayloadSchema,
  createSpecPagePayloadSchema,
  createVariableCollectionPayloadSchema,
  createVariablePayloadSchema,
  deleteNodePayloadSchema,
  errorResponseEnvelopeSchema,
  extractDesignTokensPayloadSchema,
  findNodesPayloadSchema,
  getVariablesPayloadSchema,
  getNodeTreePayloadSchema,
  normalizeNamesPayloadSchema,
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

test("batch edit schema requires confirm=true when dryRun=false", () => {
  const result = batchEditPayloadSchema.safeParse({
    dryRun: false,
    ops: [{ op: "create_page", name: "Specs" }]
  });

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

test("find nodes payload accepts page-scoped filters", () => {
  const parsed = findNodesPayloadSchema.parse({ nameContains: "home", type: "frame", limit: 25 });
  assert.equal(parsed.nameContains, "home");
  assert.equal(parsed.type, "FRAME");
  assert.equal(parsed.limit, 25);
});

test("find nodes payload requires at least one filter", () => {
  const result = findNodesPayloadSchema.safeParse({});
  assert.equal(result.success, false);
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

test("create component payload rejects geometry when converting an existing node", () => {
  const result = createComponentPayloadSchema.safeParse({ nodeId: "1:2", width: 320 });
  assert.equal(result.success, false);
});

test("get variables payload accepts collection and type filters", () => {
  const parsed = getVariablesPayloadSchema.parse({ collectionId: "VariableCollectionId:1:2", resolvedType: "COLOR" });
  assert.equal(parsed.collectionId, "VariableCollectionId:1:2");
  assert.equal(parsed.resolvedType, "COLOR");
});

test("create variable collection payload accepts extra modes", () => {
  const parsed = createVariableCollectionPayloadSchema.parse({ name: "Theme", modes: ["Light", "Dark"] });
  assert.deepEqual(parsed.modes, ["Light", "Dark"]);
});

test("create variable payload accepts code syntax and mode values", () => {
  const parsed = createVariablePayloadSchema.parse({
    collectionId: "VariableCollectionId:1:2",
    name: "color/bg/default",
    resolvedType: "COLOR",
    codeSyntax: { WEB: "--color-bg-default" },
    valuesByMode: {
      "1:1": { r: 1, g: 1, b: 1, a: 1 }
    }
  });
  assert.equal(parsed.codeSyntax?.WEB, "--color-bg-default");
});

test("bind variable payload requires paintIndex for paint bindings", () => {
  const result = bindVariablePayloadSchema.safeParse({
    nodeId: "1:2",
    variableId: "VariableId:1:3",
    kind: "paint",
    field: "color"
  });
  assert.equal(result.success, false);
});

test("normalize names payload requires confirm when dryRun=false", () => {
  const result = normalizeNamesPayloadSchema.safeParse({ dryRun: false });
  assert.equal(result.success, false);
});

test("create spec page payload accepts optional source node", () => {
  const parsed = createSpecPagePayloadSchema.parse({ name: "Specs", sourceNodeId: "1:2" });
  assert.equal(parsed.sourceNodeId, "1:2");
});

test("extract design tokens payload accepts collection filter", () => {
  const parsed = extractDesignTokensPayloadSchema.parse({ collectionId: "VariableCollectionId:1:2", includeStyles: false });
  assert.equal(parsed.includeStyles, false);
});
