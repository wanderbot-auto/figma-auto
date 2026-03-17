import { PROTOCOL_VERSION, type ErrorCode, type ProtocolError, type ResponseEnvelope } from "@figma-auto/protocol";

export class ProtocolFailure extends Error {
  readonly protocolError: ProtocolError;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ProtocolFailure";
    this.protocolError = details ? { code, message, details } : { code, message };
  }
}

export function createProtocolError(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): ProtocolError {
  return details ? { code, message, details } : { code, message };
}

export function successResponse<TResult>(requestId: string, result: TResult): ResponseEnvelope<TResult> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    ok: true,
    result
  };
}

export function errorResponse(requestId: string, error: ProtocolError): ResponseEnvelope<never> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    ok: false,
    error
  };
}

export function coerceProtocolError(error: unknown): ProtocolError {
  if (error instanceof ProtocolFailure) {
    return error.protocolError;
  }

  if (error instanceof Error) {
    return createProtocolError("internal_error", error.message);
  }

  return createProtocolError("internal_error", "Unknown internal error");
}
