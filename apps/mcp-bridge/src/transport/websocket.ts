import { randomUUID } from "node:crypto";

import {
  PROTOCOL_VERSION,
  type RequestEnvelope,
  type ResponseEnvelope,
  type SessionRegistrationPayload,
  type ToolName
} from "@figma-auto/protocol";
import WebSocket, { WebSocketServer } from "ws";

import { ProtocolFailure, coerceProtocolError, errorResponse, successResponse } from "../errors.js";
import { bridgeRequestSchema, bridgeResponseSchema, bridgeSessionRegistrationSchema, parseIncomingMessage } from "../schema/protocol.js";
import { PluginSessionStore } from "../session/plugin-session-store.js";

interface PendingRequest {
  socket: WebSocket;
  timer: NodeJS.Timeout;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

export class PluginWebSocketBridge {
  private server: WebSocketServer | null = null;
  private readonly pending = new Map<string, PendingRequest>();

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly sessionStore: PluginSessionStore
  ) {}

  async start(): Promise<void> {
    this.server = new WebSocketServer({ host: this.host, port: this.port });
    this.server.on("connection", (socket: WebSocket) => this.handleConnection(socket));
    await new Promise<void>((resolve) => this.server?.on("listening", () => resolve()));
  }

  async stop(): Promise<void> {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("WebSocket bridge stopped"));
    }
    this.pending.clear();
    if (!this.server) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      this.server?.close((error?: Error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    this.server = null;
  }

  async callPlugin<TResult>(type: ToolName, payload: unknown, requestId: string = randomUUID()): Promise<TResult> {
    const session = this.sessionStore.requireActive();
    if (session.socket.readyState !== WebSocket.OPEN) {
      this.sessionStore.clearForSocket(session.socket);
      throw new ProtocolFailure("missing_session", "The active plugin session is not connected");
    }

    const envelope: RequestEnvelope = {
      protocolVersion: PROTOCOL_VERSION,
      type,
      requestId,
      sessionId: session.context.sessionId,
      payload
    };

    const response = await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new ProtocolFailure("internal_error", `Timed out waiting for plugin response for ${type}`));
      }, 10000);

      this.pending.set(requestId, {
        socket: session.socket,
        timer,
        resolve,
        reject
      });

      session.socket.send(JSON.stringify(envelope));
    });

    const parsed = bridgeResponseSchema.parse(response) as ResponseEnvelope<TResult>;
    if (!parsed.ok) {
      throw new ProtocolFailure(parsed.error.code, parsed.error.message, parsed.error.details);
    }

    return parsed.result;
  }

  private handleConnection(socket: WebSocket): void {
    socket.on("message", (buffer: WebSocket.RawData) => {
      this.handleMessage(socket, buffer.toString()).catch((error) => {
        const requestId = randomUUID();
        socket.send(JSON.stringify(errorResponse(requestId, coerceProtocolError(error))));
      });
    });

    socket.on("close", () => {
      this.rejectPendingForSocket(socket);
      this.sessionStore.clearForSocket(socket);
    });

    socket.on("error", () => {
      this.rejectPendingForSocket(socket);
      this.sessionStore.clearForSocket(socket);
    });
  }

  private rejectPendingForSocket(socket: WebSocket): void {
    for (const [requestId, pending] of this.pending.entries()) {
      if (pending.socket === socket) {
        clearTimeout(pending.timer);
        pending.reject(new ProtocolFailure("missing_session", "The active plugin session disconnected"));
        this.pending.delete(requestId);
      }
    }
  }

  private async handleMessage(socket: WebSocket, raw: string): Promise<void> {
    const parsed = parseIncomingMessage(raw);

    if (this.tryResolvePending(parsed)) {
      return;
    }

    const request = bridgeRequestSchema.parse(parsed);
    if (request.type !== "session.register") {
      throw new ProtocolFailure("validation_failed", `Unsupported inbound request type: ${request.type}`);
    }

    const registration = bridgeSessionRegistrationSchema.parse(request.payload) as SessionRegistrationPayload;
    if (registration.sessionId !== request.sessionId || registration.protocolVersion !== request.protocolVersion) {
      throw new ProtocolFailure("validation_failed", "Session registration payload does not match the envelope");
    }

    this.sessionStore.register(registration, socket);
    socket.send(JSON.stringify(successResponse(request.requestId, { registered: true })));
  }

  private tryResolvePending(message: unknown): boolean {
    const parsed = bridgeResponseSchema.safeParse(message);
    if (!parsed.success) {
      return false;
    }

    const pending = this.pending.get(parsed.data.requestId);
    if (!pending) {
      return false;
    }

    clearTimeout(pending.timer);
    this.pending.delete(parsed.data.requestId);
    pending.resolve(parsed.data);
    return true;
  }
}
