import { z } from "zod";

import {
  MAX_NORMALIZE_NAME_RESULTS,
  ERROR_CODES,
  MAX_FIND_RESULTS,
  MAX_BATCH_OPS,
  MAX_BATCH_V2_OPS,
  PROTOCOL_VERSION
} from "./messages.js";

export const protocolVersionSchema = z.literal(PROTOCOL_VERSION);
export const errorCodeSchema = z.enum(ERROR_CODES);
export const protocolErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string().min(1),
  details: z.record(z.unknown()).optional()
});

export const requestEnvelopeSchema = z.object({
  protocolVersion: protocolVersionSchema,
  type: z.string().min(1),
  requestId: z.string().min(1),
  sessionId: z.string().min(1),
  payload: z.unknown()
});

export const successResponseEnvelopeSchema = z.object({
  protocolVersion: protocolVersionSchema,
  requestId: z.string().min(1),
  ok: z.literal(true),
  result: z.unknown()
});

export const errorResponseEnvelopeSchema = z.object({
  protocolVersion: protocolVersionSchema,
  requestId: z.string().min(1),
  ok: z.literal(false),
  error: protocolErrorSchema
});

export const responseEnvelopeSchema = z.union([
  successResponseEnvelopeSchema,
  errorResponseEnvelopeSchema
]);

export const sessionRegistrationPayloadSchema = z.object({
  sessionId: z.string().min(1),
  protocolVersion: protocolVersionSchema,
  pluginInstanceId: z.string().min(1),
  fileKey: z.string().min(1).nullable(),
  pageId: z.string().min(1),
  editorType: z.literal("figma")
});

export const emptyPayloadSchema = z.object({}).strict();
export const variableResolvedTypeSchema = z.enum(["BOOLEAN", "COLOR", "FLOAT", "STRING"]);
export const codeSyntaxPlatformSchema = z.enum(["WEB", "ANDROID", "iOS"]);
export const colorValueSchema = z.object({
  r: z.number().min(0).max(1),
  g: z.number().min(0).max(1),
  b: z.number().min(0).max(1),
  a: z.number().min(0).max(1)
});
export const serializableSolidPaintSchema = z.object({
  type: z.literal("SOLID"),
  color: colorValueSchema,
  opacity: z.number().min(0).max(1).optional(),
  visible: z.boolean().optional()
});
export const transformMatrixSchema = z.tuple([
  z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
  z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])
]);
export const serializableImagePaintSchema = z.object({
  type: z.literal("IMAGE"),
  imageHash: z.string().min(1).optional(),
  src: z.string().trim().min(1).optional(),
  scaleMode: z.enum(["FILL", "FIT", "CROP", "TILE"]),
  imageTransform: transformMatrixSchema.optional(),
  scalingFactor: z.number().positive().optional(),
  rotation: z.number().finite().optional(),
  opacity: z.number().min(0).max(1).optional(),
  visible: z.boolean().optional()
}).superRefine((payload, context) => {
  if (payload.imageHash || payload.src) {
    return;
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: "IMAGE paints require either imageHash or src",
    path: ["imageHash"]
  });
});
export const serializablePaintSchema = z.union([
  serializableSolidPaintSchema,
  serializableImagePaintSchema
]);
export const autoLayoutModeSchema = z.enum(["NONE", "HORIZONTAL", "VERTICAL"]);
export const autoLayoutSizingModeSchema = z.enum(["FIXED", "AUTO"]);
export const autoLayoutPrimaryAxisAlignItemsSchema = z.enum(["MIN", "MAX", "CENTER", "SPACE_BETWEEN"]);
export const autoLayoutCounterAxisAlignItemsSchema = z.enum(["MIN", "MAX", "CENTER", "BASELINE"]);
export const autoLayoutChildAlignSchema = z.enum(["MIN", "CENTER", "MAX", "STRETCH", "INHERIT"]);
export const textAlignHorizontalSchema = z.enum(["LEFT", "CENTER", "RIGHT", "JUSTIFIED"]);
export const textAlignVerticalSchema = z.enum(["TOP", "CENTER", "BOTTOM"]);
export const textCaseSchema = z.enum(["ORIGINAL", "UPPER", "LOWER", "TITLE", "SMALL_CAPS", "SMALL_CAPS_FORCED"]);
export const textDecorationSchema = z.enum(["NONE", "UNDERLINE", "STRIKETHROUGH"]);
export const lineHeightValueSchema = z.union([
  z.object({
    unit: z.literal("AUTO")
  }),
  z.object({
    unit: z.enum(["PIXELS", "PERCENT"]),
    value: z.number().positive()
  })
]);
export const letterSpacingValueSchema = z.object({
  unit: z.enum(["PIXELS", "PERCENT"]),
  value: z.number().finite()
});
export const variableAliasValueSchema = z.object({
  type: z.literal("VARIABLE_ALIAS"),
  id: z.string().min(1)
});
export const componentPropertyOverrideValueSchema = z.union([
  z.string(),
  z.boolean(),
  variableAliasValueSchema
]);
export const variableModeValueSchema = z.union([
  z.boolean(),
  z.number().finite(),
  z.string(),
  colorValueSchema,
  variableAliasValueSchema
]);

export const getNodePayloadSchema = z.object({
  nodeId: z.string().min(1)
});

export const getNodeTreePayloadSchema = z.object({
  nodeId: z.string().min(1).optional(),
  depth: z.number().int().min(0).optional()
});

export const findNodesPayloadSchema = z.object({
  nodeId: z.string().min(1).optional(),
  depth: z.number().int().min(0).optional(),
  nameContains: z.string().trim().min(1).optional(),
  nameExact: z.string().trim().min(1).optional(),
  textContains: z.string().trim().min(1).optional(),
  type: z.string().trim().min(1).transform((value) => value.toUpperCase()).optional(),
  includeHidden: z.boolean().optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  styleId: z.string().min(1).optional(),
  variableId: z.string().min(1).optional(),
  componentId: z.string().min(1).optional(),
  instanceOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(MAX_FIND_RESULTS).optional()
}).superRefine((payload, context) => {
  if (
    payload.nameContains
    || payload.nameExact
    || payload.textContains
    || payload.type
    || payload.visible !== undefined
    || payload.locked !== undefined
    || payload.styleId
    || payload.variableId
    || payload.componentId
    || payload.instanceOnly
  ) {
    return;
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: "find_nodes requires at least one filter",
    path: ["nameContains"]
  });
});

export const getVariablesPayloadSchema = z.object({
  collectionId: z.string().min(1).optional(),
  resolvedType: variableResolvedTypeSchema.optional(),
  includeValues: z.boolean().optional()
});

export const styleTypeSchema = z.enum(["PAINT", "TEXT", "EFFECT", "GRID"]);

export const getStylesPayloadSchema = z.object({
  types: z.array(styleTypeSchema).min(1).max(4).optional(),
  nameContains: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(MAX_FIND_RESULTS).optional(),
  includeDetails: z.boolean().optional()
});

export const getComponentsPayloadSchema = z.object({
  nameContains: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(MAX_FIND_RESULTS).optional(),
  includeProperties: z.boolean().optional()
});

export const renameNodePayloadSchema = z.object({
  nodeId: z.string().min(1),
  name: z.string().trim().min(1)
});

export const createPagePayloadSchema = z.object({
  name: z.string().trim().min(1)
});

export const createFramePayloadSchema = z.object({
  parentId: z.string().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional()
});

export const createRectanglePayloadSchema = z.object({
  parentId: z.string().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  cornerRadius: z.number().min(0).optional()
});

export const createComponentPayloadSchema = z.object({
  nodeId: z.string().min(1).optional(),
  parentId: z.string().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional()
}).superRefine((payload, context) => {
  if (!payload.nodeId) {
    return;
  }

  for (const field of ["parentId", "x", "y", "width", "height"] as const) {
    if (payload[field] !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${field} is only supported when creating a new empty component`,
        path: [field]
      });
    }
  }
});

export const createInstancePayloadSchema = z.object({
  componentId: z.string().min(1),
  parentId: z.string().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  index: z.number().int().min(0).optional()
});

export const createTextPayloadSchema = z.object({
  parentId: z.string().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  text: z.string().optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional()
});

export const setTextPayloadSchema = z.object({
  nodeId: z.string().min(1),
  text: z.string()
});

export const setInstancePropertiesPayloadSchema = z.object({
  nodeId: z.string().min(1),
  variantProperties: z.record(z.string().trim().min(1), z.string()).optional(),
  componentProperties: z.record(z.string().trim().min(1), componentPropertyOverrideValueSchema).optional(),
  swapComponentId: z.string().min(1).optional(),
  preserveOverrides: z.boolean().optional()
}).superRefine((payload, context) => {
  const hasVariantProperties = payload.variantProperties && Object.keys(payload.variantProperties).length > 0;
  const hasComponentProperties = payload.componentProperties && Object.keys(payload.componentProperties).length > 0;
  if (hasVariantProperties || hasComponentProperties || payload.swapComponentId) {
    return;
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: "set_instance_properties requires variantProperties, componentProperties, or swapComponentId",
    path: ["variantProperties"]
  });
});

export const setImageFillPayloadSchema = z.object({
  nodeId: z.string().min(1),
  image: serializableImagePaintSchema,
  paintIndex: z.number().int().min(0).optional(),
  preserveOtherFills: z.boolean().optional()
}).superRefine((payload, context) => {
  if (payload.preserveOtherFills || payload.paintIndex === undefined || payload.paintIndex === 0) {
    return;
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: "paintIndex > 0 requires preserveOtherFills=true",
    path: ["paintIndex"]
  });
});

export const applyStylesPayloadSchema = z.object({
  nodeId: z.string().min(1),
  styles: z.object({
    fillStyleId: z.string().min(1).nullable().optional(),
    strokeStyleId: z.string().min(1).nullable().optional(),
    effectStyleId: z.string().min(1).nullable().optional(),
    textStyleId: z.string().min(1).nullable().optional(),
    gridStyleId: z.string().min(1).nullable().optional()
  }).refine((payload) => Object.keys(payload).length > 0, {
    message: "styles must include at least one style field"
  })
});

export const duplicateNodePayloadSchema = z.object({
  nodeId: z.string().min(1),
  parentId: z.string().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  index: z.number().int().min(0).optional()
});

export const layoutPropertiesPatchSchema = z.object({
  mode: autoLayoutModeSchema.optional(),
  itemSpacing: z.number().finite().optional(),
  paddingTop: z.number().finite().optional(),
  paddingRight: z.number().finite().optional(),
  paddingBottom: z.number().finite().optional(),
  paddingLeft: z.number().finite().optional(),
  primaryAxisAlignItems: autoLayoutPrimaryAxisAlignItemsSchema.optional(),
  counterAxisAlignItems: autoLayoutCounterAxisAlignItemsSchema.optional(),
  primaryAxisSizingMode: autoLayoutSizingModeSchema.optional(),
  counterAxisSizingMode: autoLayoutSizingModeSchema.optional()
}).refine((payload) => Object.keys(payload).length > 0, {
  message: "layout patch must include at least one property"
});

export const textPropertiesPatchSchema = z.object({
  fontSize: z.number().positive().optional(),
  fontFamily: z.string().trim().min(1).optional(),
  fontStyle: z.string().trim().min(1).optional(),
  lineHeight: lineHeightValueSchema.optional(),
  letterSpacing: letterSpacingValueSchema.optional(),
  paragraphSpacing: z.number().min(0).optional(),
  paragraphIndent: z.number().min(0).optional(),
  textCase: textCaseSchema.optional(),
  textDecoration: textDecorationSchema.optional(),
  textAlignHorizontal: textAlignHorizontalSchema.optional(),
  textAlignVertical: textAlignVerticalSchema.optional()
}).refine((payload) => Object.keys(payload).length > 0, {
  message: "text patch must include at least one property"
});

export const nodePropertiesPatchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  rotation: z.number().finite().optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  opacity: z.number().min(0).max(1).optional(),
  cornerRadius: z.number().min(0).optional(),
  fills: z.array(serializablePaintSchema).max(16).optional(),
  strokes: z.array(serializablePaintSchema).max(16).optional(),
  strokeWeight: z.number().min(0).optional(),
  clipsContent: z.boolean().optional(),
  layoutGrow: z.number().finite().optional(),
  layoutAlign: autoLayoutChildAlignSchema.optional(),
  layout: layoutPropertiesPatchSchema.optional(),
  text: textPropertiesPatchSchema.optional()
}).refine((payload) => Object.keys(payload).length > 0, {
  message: "properties must include at least one editable field"
});

export const updateNodePropertiesPayloadSchema = z.object({
  nodeId: z.string().min(1),
  properties: nodePropertiesPatchSchema
});

export const moveNodePayloadSchema = z.object({
  nodeId: z.string().min(1),
  parentId: z.string().min(1),
  index: z.number().int().min(0).optional()
});

export const deleteNodePayloadSchema = z.object({
  nodeId: z.string().min(1),
  confirm: z.literal(true)
});

export const createVariableCollectionPayloadSchema = z.object({
  name: z.string().trim().min(1),
  modes: z.array(z.string().trim().min(1)).max(20).optional(),
  hiddenFromPublishing: z.boolean().optional()
});

export const createVariablePayloadSchema = z.object({
  collectionId: z.string().min(1),
  name: z.string().trim().min(1),
  resolvedType: variableResolvedTypeSchema,
  description: z.string().optional(),
  hiddenFromPublishing: z.boolean().optional(),
  scopes: z.array(z.string().trim().min(1)).max(32).optional(),
  codeSyntax: z.object({
    WEB: z.string().trim().min(1).optional(),
    ANDROID: z.string().trim().min(1).optional(),
    iOS: z.string().trim().min(1).optional()
  }).optional(),
  valuesByMode: z.record(z.string().min(1), variableModeValueSchema).optional()
});

export const bindVariablePayloadSchema = z.object({
  nodeId: z.string().min(1),
  variableId: z.string().min(1).nullable().optional(),
  kind: z.enum(["node_field", "text_field", "paint"]),
  field: z.string().trim().min(1),
  paintIndex: z.number().int().min(0).optional()
}).superRefine((payload, context) => {
  const nodeFields = new Set([
    "height",
    "width",
    "characters",
    "itemSpacing",
    "paddingLeft",
    "paddingRight",
    "paddingTop",
    "paddingBottom",
    "visible",
    "topLeftRadius",
    "topRightRadius",
    "bottomLeftRadius",
    "bottomRightRadius",
    "minWidth",
    "maxWidth",
    "minHeight",
    "maxHeight",
    "counterAxisSpacing",
    "strokeWeight",
    "strokeTopWeight",
    "strokeRightWeight",
    "strokeBottomWeight",
    "strokeLeftWeight",
    "opacity",
    "gridRowGap",
    "gridColumnGap"
  ]);
  const textFields = new Set([
    "fontFamily",
    "fontSize",
    "fontStyle",
    "fontWeight",
    "letterSpacing",
    "lineHeight",
    "paragraphSpacing",
    "paragraphIndent"
  ]);
  if (payload.kind === "node_field" && !nodeFields.has(payload.field)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Unsupported node_field binding field ${payload.field}`,
      path: ["field"]
    });
  }
  if (payload.kind === "text_field" && !textFields.has(payload.field)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Unsupported text_field binding field ${payload.field}`,
      path: ["field"]
    });
  }
  if (payload.kind === "paint") {
    if (payload.field !== "color") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Paint bindings currently support only the color field",
        path: ["field"]
      });
    }
    if (payload.paintIndex === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Paint bindings require paintIndex",
        path: ["paintIndex"]
      });
    }
  }
  if (payload.kind !== "paint" && payload.paintIndex !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "paintIndex is only supported for paint bindings",
      path: ["paintIndex"]
    });
  }
});

const batchValueReferenceSchema = z.object({
  fromOp: z.string().trim().min(1),
  field: z.enum(["createdNodeId", "updatedNodeId", "deletedNodeId"]).optional()
});

const batchResolvableIdSchema = z.union([
  z.string().min(1),
  batchValueReferenceSchema
]);

export const normalizeNamesPayloadSchema = z.object({
  nodeId: z.string().min(1).optional(),
  depth: z.number().int().min(0).optional(),
  includeHidden: z.boolean().optional(),
  caseStyle: z.enum(["none", "title", "upper", "lower"]).optional(),
  dryRun: z.boolean().optional(),
  confirm: z.boolean().optional(),
  limit: z.number().int().min(1).max(MAX_NORMALIZE_NAME_RESULTS).optional()
}).superRefine((payload, context) => {
  if ((payload.dryRun ?? true) || payload.confirm === true) {
    return;
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: "Committed normalize_names requires confirm=true",
    path: ["confirm"]
  });
});

export const createSpecPagePayloadSchema = z.object({
  name: z.string().trim().min(1).optional(),
  sourceNodeId: z.string().min(1).optional(),
  includeVariables: z.boolean().optional(),
  includeTokens: z.boolean().optional(),
  includeSelection: z.boolean().optional()
});

export const extractDesignTokensPayloadSchema = z.object({
  collectionId: z.string().min(1).optional(),
  includeVariables: z.boolean().optional(),
  includeStyles: z.boolean().optional()
});

const batchBindVariableOperationSchema = z.object({
  op: z.literal("bind_variable"),
  nodeId: z.string().min(1),
  variableId: z.string().min(1).nullable().optional(),
  kind: z.enum(["node_field", "text_field", "paint"]),
  field: z.string().trim().min(1),
  paintIndex: z.number().int().min(0).optional()
});

const batchV2BaseSchema = z.object({
  opId: z.string().trim().min(1).optional()
});

const batchV2BindVariableOperationSchema = z.object({
  op: z.literal("bind_variable"),
  opId: z.string().trim().min(1).optional(),
  nodeId: batchResolvableIdSchema,
  variableId: z.union([batchResolvableIdSchema, z.null()]).optional(),
  kind: z.enum(["node_field", "text_field", "paint"]),
  field: z.string().trim().min(1),
  paintIndex: z.number().int().min(0).optional()
}).superRefine((payload, context) => {
  const parsed = bindVariablePayloadSchema.safeParse({
    nodeId: "1:1",
    variableId: typeof payload.variableId === "string" ? payload.variableId : payload.variableId ?? undefined,
    kind: payload.kind,
    field: payload.field,
    paintIndex: payload.paintIndex
  });

  if (parsed.success) {
    return;
  }

  for (const issue of parsed.error.issues) {
    context.addIssue(issue);
  }
});

export const batchOperationSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("rename_node"),
    nodeId: z.string().min(1),
    name: z.string().trim().min(1)
  }),
  z.object({
    op: z.literal("create_page"),
    name: z.string().trim().min(1)
  }),
  createFramePayloadSchema.extend({
    op: z.literal("create_frame")
  }),
  createRectanglePayloadSchema.extend({
    op: z.literal("create_rectangle")
  }),
  createInstancePayloadSchema.extend({
    op: z.literal("create_instance")
  }),
  createTextPayloadSchema.extend({
    op: z.literal("create_text")
  }),
  duplicateNodePayloadSchema.extend({
    op: z.literal("duplicate_node")
  }),
  z.object({
    op: z.literal("set_text"),
    nodeId: z.string().min(1),
    text: z.string()
  }),
  updateNodePropertiesPayloadSchema.extend({
    op: z.literal("update_node_properties")
  }),
  moveNodePayloadSchema.extend({
    op: z.literal("move_node")
  }),
  z.object({
    op: z.literal("delete_node")
    ,
    nodeId: z.string().min(1)
  }),
  batchBindVariableOperationSchema
]);

export const batchEditPayloadSchema = z.object({
  dryRun: z.boolean().optional(),
  confirm: z.boolean().optional(),
  ops: z.array(batchOperationSchema).min(1).max(MAX_BATCH_OPS)
}).superRefine((payload, context) => {
  if ((payload.dryRun ?? true) || payload.confirm === true) {
    return;
  }

  context.addIssue({
    code: z.ZodIssueCode.custom,
    message: "Committed batch_edit requires confirm=true",
    path: ["confirm"]
  });
});

export const batchEditV2OperationSchema = z.union([
  batchV2BaseSchema.extend({
    op: z.literal("rename_node"),
    nodeId: batchResolvableIdSchema,
    name: z.string().trim().min(1)
  }),
  batchV2BaseSchema.extend({
    op: z.literal("create_page"),
    name: z.string().trim().min(1)
  }),
  batchV2BaseSchema.extend({
    op: z.literal("create_frame"),
    parentId: batchResolvableIdSchema.optional(),
    name: z.string().trim().min(1).optional(),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional()
  }),
  batchV2BaseSchema.extend({
    op: z.literal("create_rectangle"),
    parentId: batchResolvableIdSchema.optional(),
    name: z.string().trim().min(1).optional(),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    cornerRadius: z.number().min(0).optional()
  }),
  batchV2BaseSchema.extend({
    op: z.literal("create_instance"),
    componentId: batchResolvableIdSchema,
    parentId: batchResolvableIdSchema.optional(),
    name: z.string().trim().min(1).optional(),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    index: z.number().int().min(0).optional()
  }),
  batchV2BaseSchema.extend({
    op: z.literal("create_text"),
    parentId: batchResolvableIdSchema.optional(),
    name: z.string().trim().min(1).optional(),
    text: z.string().optional(),
    x: z.number().finite().optional(),
    y: z.number().finite().optional()
  }),
  batchV2BaseSchema.extend({
    op: z.literal("duplicate_node"),
    nodeId: batchResolvableIdSchema,
    parentId: batchResolvableIdSchema.optional(),
    name: z.string().trim().min(1).optional(),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    index: z.number().int().min(0).optional()
  }),
  batchV2BaseSchema.extend({
    op: z.literal("set_text"),
    nodeId: batchResolvableIdSchema,
    text: z.string()
  }),
  batchV2BaseSchema.extend({
    op: z.literal("set_instance_properties"),
    nodeId: batchResolvableIdSchema,
    variantProperties: z.record(z.string().trim().min(1), z.string()).optional(),
    componentProperties: z.record(z.string().trim().min(1), componentPropertyOverrideValueSchema).optional(),
    swapComponentId: batchResolvableIdSchema.optional(),
    preserveOverrides: z.boolean().optional()
  }).superRefine((payload, context) => {
    const hasVariantProperties = payload.variantProperties && Object.keys(payload.variantProperties).length > 0;
    const hasComponentProperties = payload.componentProperties && Object.keys(payload.componentProperties).length > 0;
    if (hasVariantProperties || hasComponentProperties || payload.swapComponentId) {
      return;
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "set_instance_properties requires variantProperties, componentProperties, or swapComponentId",
      path: ["variantProperties"]
    });
  }),
  batchV2BaseSchema.extend({
    op: z.literal("set_image_fill"),
    nodeId: batchResolvableIdSchema,
    image: serializableImagePaintSchema,
    paintIndex: z.number().int().min(0).optional(),
    preserveOtherFills: z.boolean().optional()
  }).superRefine((payload, context) => {
    if (payload.preserveOtherFills || payload.paintIndex === undefined || payload.paintIndex === 0) {
      return;
    }

    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "paintIndex > 0 requires preserveOtherFills=true",
      path: ["paintIndex"]
    });
  }),
  batchV2BaseSchema.extend({
    op: z.literal("update_node_properties"),
    nodeId: batchResolvableIdSchema,
    properties: nodePropertiesPatchSchema
  }),
  batchV2BaseSchema.extend({
    op: z.literal("move_node"),
    nodeId: batchResolvableIdSchema,
    parentId: batchResolvableIdSchema,
    index: z.number().int().min(0).optional()
  }),
  batchV2BaseSchema.extend({
    op: z.literal("delete_node"),
    nodeId: batchResolvableIdSchema
  }),
  batchV2BindVariableOperationSchema
]);

export const batchEditV2PayloadSchema = z.object({
  dryRun: z.boolean().optional(),
  confirm: z.boolean().optional(),
  ops: z.array(batchEditV2OperationSchema).min(1).max(MAX_BATCH_V2_OPS)
}).superRefine((payload, context) => {
  if (!(payload.dryRun ?? true) && payload.confirm !== true) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Committed batch_edit_v2 requires confirm=true",
      path: ["confirm"]
    });
  }

  const seenOpIds = new Set<string>();
  const collectRefs = (value: unknown, refs: string[]): void => {
    if (!value || typeof value !== "object") {
      return;
    }
    if ("fromOp" in value && typeof value.fromOp === "string") {
      refs.push(value.fromOp);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectRefs(item, refs));
      return;
    }
    Object.values(value as Record<string, unknown>).forEach((item) => collectRefs(item, refs));
  };

  payload.ops.forEach((operation, index) => {
    const refs: string[] = [];
    collectRefs(operation, refs);

    if (operation.opId) {
      if (seenOpIds.has(operation.opId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate opId ${operation.opId}`,
          path: ["ops", index, "opId"]
        });
      }
      seenOpIds.add(operation.opId);
    }

    refs.forEach((fromOp) => {
      if (!seenOpIds.has(fromOp)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Reference to unknown or later opId ${fromOp}`,
          path: ["ops", index]
        });
      }
      if (operation.opId && operation.opId === fromOp) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Operation ${fromOp} cannot reference itself`,
          path: ["ops", index]
        });
      }
    });
  });
});
