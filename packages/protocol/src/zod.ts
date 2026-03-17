import { z } from "zod";

import {
  ERROR_CODES,
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

export const getNodePayloadSchema = z.object({
  nodeId: z.string().min(1)
});

export const getNodeTreePayloadSchema = z.object({
  nodeId: z.string().min(1).optional(),
  depth: z.number().int().min(0).optional()
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
});
