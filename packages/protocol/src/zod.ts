import { z } from "zod";

import {
  MAX_NORMALIZE_NAME_RESULTS,
  ERROR_CODES,
  MAX_FIND_RESULTS,
  MAX_BATCH_OPS,
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
export const variableAliasValueSchema = z.object({
  type: z.literal("VARIABLE_ALIAS"),
  id: z.string().min(1)
});
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
  nameContains: z.string().trim().min(1).optional(),
  nameExact: z.string().trim().min(1).optional(),
  type: z.string().trim().min(1).transform((value) => value.toUpperCase()).optional(),
  includeHidden: z.boolean().optional(),
  limit: z.number().int().min(1).max(MAX_FIND_RESULTS).optional()
}).superRefine((payload, context) => {
  if (payload.nameContains || payload.nameExact || payload.type) {
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
  z.object({
    op: z.literal("set_text"),
    nodeId: z.string().min(1),
    text: z.string()
  })
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
