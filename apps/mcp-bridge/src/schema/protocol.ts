import {
  requestEnvelopeSchema,
  responseEnvelopeSchema,
  sessionRegistrationPayloadSchema
} from "@figma-auto/protocol";

export function parseIncomingMessage(raw: string): unknown {
  return JSON.parse(raw) as unknown;
}

export const bridgeRequestSchema = requestEnvelopeSchema;
export const bridgeResponseSchema = responseEnvelopeSchema;
export const bridgeSessionRegistrationSchema = sessionRegistrationPayloadSchema;
