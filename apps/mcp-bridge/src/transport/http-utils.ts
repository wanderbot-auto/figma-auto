import { type IncomingMessage, type ServerResponse } from "node:http";

import { ProtocolFailure } from "../errors.js";

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  const rawBody = Buffer.concat(chunks).toString("utf8").trim();
  if (rawBody.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new ProtocolFailure("validation_failed", "Invalid JSON request body");
  }
}

export function writeJsonRpcError(
  res: ServerResponse,
  statusCode: number,
  code: number,
  message: string,
  headers: Record<string, string> = {}
): void {
  res.writeHead(statusCode, {
    "content-type": "application/json",
    ...headers
  });
  res.end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code,
      message
    },
    id: null
  }));
}
