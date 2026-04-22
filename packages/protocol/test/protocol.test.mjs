import test from "node:test";
import assert from "node:assert/strict";

import {
  PROTOCOL_VERSION,
  applyStylesPayloadSchema,
  batchEditPayloadSchema,
  batchEditV2PayloadSchema,
  bindVariablePayloadSchema,
  createComponentPayloadSchema,
  createFramePayloadSchema,
  createInstancePayloadSchema,
  createRectanglePayloadSchema,
  createSpecPagePayloadSchema,
  createVariableCollectionPayloadSchema,
  createVariablePayloadSchema,
  deleteNodePayloadSchema,
  duplicateNodePayloadSchema,
  errorResponseEnvelopeSchema,
  extractDesignTokensPayloadSchema,
  findNodesPayloadSchema,
  getComponentsPayloadSchema,
  getFlowPayloadSchema,
  getNodePayloadSchema,
  getVariablesPayloadSchema,
  getStylesPayloadSchema,
  getNodeTreePayloadSchema,
  normalizeNamesPayloadSchema,
  sessionRegistrationPayloadSchema,
  setImageFillPayloadSchema,
  setInstancePropertiesPayloadSchema,
  setReactionsPayloadSchema,
  updateNodePropertiesPayloadSchema
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
  const parsed = getNodeTreePayloadSchema.parse({
    depth: 2,
    summaryOnly: true,
    includeDesign: false,
    includePrototype: false,
    includeTextContent: false,
    includePaints: false
  });
  assert.equal(parsed.depth, 2);
  assert.equal(parsed.nodeId, undefined);
  assert.equal(parsed.summaryOnly, true);
  assert.equal(parsed.includeDesign, false);
  assert.equal(parsed.includePaints, false);
});

test("node tree payload rejects depths above the configured cap", () => {
  assert.throws(() => {
    getNodeTreePayloadSchema.parse({
      depth: 7
    });
  }, /less than or equal to 6/);
});

test("get node payload accepts lightweight detail flags", () => {
  const parsed = getNodePayloadSchema.parse({
    nodeId: "1:2",
    includeDesign: false,
    includePrototype: false,
    includeTextContent: false,
    includePaints: false
  });

  assert.equal(parsed.nodeId, "1:2");
  assert.equal(parsed.includePaints, false);
});

test("get flow payload accepts an omitted or explicit pageId", () => {
  assert.equal(getFlowPayloadSchema.parse({}).pageId, undefined);
  assert.equal(getFlowPayloadSchema.parse({ pageId: "1:2" }).pageId, "1:2");
});

test("find nodes payload accepts page-scoped filters", () => {
  const parsed = findNodesPayloadSchema.parse({
    nameContains: "home",
    textContains: "cta",
    type: "frame",
    styleId: "S:1:2",
    instanceOnly: true,
    limit: 25,
    stopAtLimit: true
  });
  assert.equal(parsed.nameContains, "home");
  assert.equal(parsed.textContains, "cta");
  assert.equal(parsed.type, "FRAME");
  assert.equal(parsed.styleId, "S:1:2");
  assert.equal(parsed.instanceOnly, true);
  assert.equal(parsed.limit, 25);
  assert.equal(parsed.stopAtLimit, true);
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
  const parsed = createFramePayloadSchema.parse({
    name: "Frame",
    width: 320,
    height: 240,
    returnNodeDetails: false
  });
  assert.equal(parsed.width, 320);
  assert.equal(parsed.height, 240);
  assert.equal(parsed.returnNodeDetails, false);
});

test("create rectangle payload accepts geometry and corner radius", () => {
  const parsed = createRectanglePayloadSchema.parse({
    name: "Card",
    width: 320,
    height: 180,
    cornerRadius: 20,
    returnNodeDetails: false
  });
  assert.equal(parsed.width, 320);
  assert.equal(parsed.cornerRadius, 20);
  assert.equal(parsed.returnNodeDetails, false);
});

test("update node properties payload accepts layout and paint patches", () => {
  const parsed = updateNodePropertiesPayloadSchema.parse({
    nodeId: "1:2",
    properties: {
      fills: [
        {
          type: "SOLID",
          color: { r: 1, g: 0.5, b: 0, a: 1 }
        }
      ],
      layout: {
        mode: "VERTICAL",
        itemSpacing: 16,
        primaryAxisSizingMode: "AUTO"
      }
    }
  });

  assert.equal(parsed.properties.layout?.mode, "VERTICAL");
  assert.equal(parsed.properties.layout?.primaryAxisSizingMode, "AUTO");
  assert.equal(parsed.properties.fills?.[0].type, "SOLID");
});

test("update node properties payload accepts richer text and layout child patches", () => {
  const parsed = updateNodePropertiesPayloadSchema.parse({
    nodeId: "1:2",
    properties: {
      layoutGrow: 1,
      layoutAlign: "STRETCH",
      clipsContent: true,
      text: {
        fontFamily: "Inter",
        fontStyle: "Bold",
        lineHeight: { unit: "PIXELS", value: 24 },
        letterSpacing: { unit: "PIXELS", value: 0.5 },
        paragraphSpacing: 12,
        paragraphIndent: 8,
        textCase: "UPPER",
        textDecoration: "UNDERLINE"
      }
    }
  });

  assert.equal(parsed.properties.layoutGrow, 1);
  assert.equal(parsed.properties.text?.textCase, "UPPER");
});

test("update node properties payload rejects empty property patches", () => {
  const result = updateNodePropertiesPayloadSchema.safeParse({
    nodeId: "1:2",
    properties: {}
  });

  assert.equal(result.success, false);
});

test("create component payload rejects geometry when converting an existing node", () => {
  const result = createComponentPayloadSchema.safeParse({ nodeId: "1:2", width: 320 });
  assert.equal(result.success, false);
});

test("create instance payload accepts placement and sizing", () => {
  const parsed = createInstancePayloadSchema.parse({
    componentId: "1:2",
    parentId: "1:3",
    width: 280,
    height: 96,
    index: 1
  });
  assert.equal(parsed.componentId, "1:2");
  assert.equal(parsed.index, 1);
});

test("set instance properties payload accepts variants, component properties, and swap component", () => {
  const parsed = setInstancePropertiesPayloadSchema.parse({
    nodeId: "1:2",
    variantProperties: {
      Size: "Large"
    },
    componentProperties: {
      "IconVisible#0:0": true,
      "Label#0:1": "Buy now"
    },
    swapComponentId: "1:9",
    returnNodeDetails: false
  });

  assert.equal(parsed.variantProperties.Size, "Large");
  assert.equal(parsed.componentProperties["IconVisible#0:0"], true);
  assert.equal(parsed.swapComponentId, "1:9");
  assert.equal(parsed.returnNodeDetails, false);
});

test("set image fill payload accepts URL-backed image fills", () => {
  const parsed = setImageFillPayloadSchema.parse({
    nodeId: "1:2",
    image: {
      type: "IMAGE",
      src: "https://example.com/image.png",
      scaleMode: "FILL"
    },
    returnNodeDetails: false
  });

  assert.equal(parsed.image.type, "IMAGE");
  assert.equal(parsed.image.scaleMode, "FILL");
  assert.equal(parsed.returnNodeDetails, false);
});

test("set reactions payload accepts node navigation and variable actions", () => {
  const parsed = setReactionsPayloadSchema.parse({
    nodeId: "1:2",
    returnNodeDetails: false,
    reactions: [
      {
        trigger: { type: "ON_CLICK" },
        actions: [
          {
            type: "NODE",
            destinationId: "1:3",
            navigation: "NAVIGATE",
            transition: {
              type: "SMART_ANIMATE",
              easing: { type: "EASE_OUT" },
              duration: 0.2
            }
          },
          {
            type: "SET_VARIABLE",
            variableId: "VariableID:1:4",
            variableValue: {
              type: "BOOLEAN",
              resolvedType: "BOOLEAN",
              value: true
            }
          }
        ]
      }
    ]
  });

  assert.equal(parsed.reactions[0].actions[0].type, "NODE");
  assert.equal(parsed.reactions[0].actions[1].type, "SET_VARIABLE");
  assert.equal(parsed.returnNodeDetails, false);
});

test("set reactions payload rejects a reaction without actions", () => {
  const result = setReactionsPayloadSchema.safeParse({
    nodeId: "1:2",
    reactions: [{ trigger: { type: "ON_CLICK" } }]
  });

  assert.equal(result.success, false);
});

test("duplicate node payload accepts rename and placement overrides", () => {
  const parsed = duplicateNodePayloadSchema.parse({
    nodeId: "1:2",
    parentId: "1:3",
    name: "Copy",
    x: 40,
    y: 80,
    index: 2
  });
  assert.equal(parsed.name, "Copy");
  assert.equal(parsed.index, 2);
});

test("get styles payload accepts type filters and details flag", () => {
  const parsed = getStylesPayloadSchema.parse({
    types: ["PAINT", "TEXT"],
    nameContains: "button",
    includeDetails: true
  });
  assert.deepEqual(parsed.types, ["PAINT", "TEXT"]);
  assert.equal(parsed.includeDetails, true);
});

test("get components payload accepts name filter", () => {
  const parsed = getComponentsPayloadSchema.parse({
    nameContains: "button",
    includeProperties: false,
    limit: 25
  });
  assert.equal(parsed.nameContains, "button");
  assert.equal(parsed.includeProperties, false);
});

test("apply styles payload requires at least one style field", () => {
  const result = applyStylesPayloadSchema.safeParse({
    nodeId: "1:2",
    styles: {}
  });
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

test("batch edit schema accepts extended write operations", () => {
  const parsed = batchEditPayloadSchema.parse({
    dryRun: true,
    compactResults: true,
    ops: [
      { op: "create_frame", name: "Card", width: 320, height: 180 },
      { op: "create_rectangle", name: "Border", width: 320, height: 180, cornerRadius: 16 },
      { op: "create_instance", componentId: "1:4", index: 1 },
      {
        op: "update_node_properties",
        nodeId: "1:2",
        properties: {
          opacity: 0.9
        }
      },
      {
        op: "duplicate_node",
        nodeId: "1:3",
        name: "Card Copy"
      }
    ]
  });

  assert.equal(parsed.ops.length, 5);
  assert.equal(parsed.compactResults, true);
});

test("batch edit v2 schema accepts op references and richer operations", () => {
  const parsed = batchEditV2PayloadSchema.parse({
    dryRun: true,
    compactResults: true,
    ops: [
      { opId: "hero", op: "create_frame", name: "Hero", width: 1200, height: 640, returnNodeDetails: false },
      { opId: "headline", op: "create_text", parentId: { fromOp: "hero" }, text: "Launch faster" },
      {
        op: "set_instance_properties",
        nodeId: { fromOp: "hero", field: "createdNodeId" },
        componentProperties: {
          "Label#0:1": "CTA"
        },
        returnNodeDetails: false
      }
    ]
  });

  assert.equal(parsed.ops.length, 3);
  assert.equal(parsed.ops[1].parentId.fromOp, "hero");
  assert.equal(parsed.compactResults, true);
});

test("batch edit v2 schema rejects forward references", () => {
  const result = batchEditV2PayloadSchema.safeParse({
    dryRun: true,
    ops: [
      { op: "create_text", parentId: { fromOp: "later" }, text: "Oops" },
      { opId: "later", op: "create_frame", width: 100, height: 100 }
    ]
  });

  assert.equal(result.success, false);
});

test("normalize names payload requires confirm when dryRun=false", () => {
  const result = normalizeNamesPayloadSchema.safeParse({ dryRun: false });
  assert.equal(result.success, false);
});

test("create spec page payload accepts optional source node", () => {
  const parsed = createSpecPagePayloadSchema.parse({
    name: "Specs",
    sourceNodeId: "1:2",
    includeTokenPayload: false,
    includeVariableValues: false,
    includeSourceNodeDetails: false
  });
  assert.equal(parsed.sourceNodeId, "1:2");
  assert.equal(parsed.includeTokenPayload, false);
  assert.equal(parsed.includeVariableValues, false);
  assert.equal(parsed.includeSourceNodeDetails, false);
});

test("extract design tokens payload accepts collection filter", () => {
  const parsed = extractDesignTokensPayloadSchema.parse({
    collectionId: "VariableCollectionId:1:2",
    includeStyles: false,
    summaryOnly: true
  });
  assert.equal(parsed.includeStyles, false);
  assert.equal(parsed.summaryOnly, true);
});
