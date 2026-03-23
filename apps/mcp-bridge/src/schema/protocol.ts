import {
  requestEnvelopeSchema,
  responseEnvelopeSchema,
  sessionRegistrationPayloadSchema
} from "@figma-auto/protocol";

import { ProtocolFailure } from "../errors.js";

export function parseIncomingMessage(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ProtocolFailure("validation_failed", "Invalid JSON message");
  }
}

export const bridgeRequestSchema = requestEnvelopeSchema;
export const bridgeResponseSchema = responseEnvelopeSchema;
export const bridgeSessionRegistrationSchema = sessionRegistrationPayloadSchema;
