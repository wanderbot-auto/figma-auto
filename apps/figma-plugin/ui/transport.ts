import type { RequestEnvelope, ResponseEnvelope, SessionRegistrationPayload } from "@figma-auto/protocol";

import type { PluginRuntimeContext } from "./types.js";

const BRIDGE_PORT = 4318;
const PROTOCOL_VERSION = "1.0.0";

function createSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export class BridgeTransport {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private context: PluginRuntimeContext | null = null;
  private sessionId = createSessionId();

  constructor(
    private readonly onStatus: (message: string) => void,
    private readonly onBridgeRequest: (request: RequestEnvelope) => void
  ) {}

  updateContext(context: PluginRuntimeContext): void {
    this.context = context;
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.registerSession();
      return;
    }

    this.connect();
  }

  reconnect(): void {
    this.sessionId = createSessionId();
    if (this.socket) {
      this.socket.close();
    }
    this.connect();
  }

  forwardResponse(response: ResponseEnvelope): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify(response));
  }

  private connect(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.onStatus(`Connecting to ws://localhost:${BRIDGE_PORT}`);
    this.socket = new WebSocket(`ws://localhost:${BRIDGE_PORT}`);

    this.socket.addEventListener("open", () => {
      this.onStatus("Connected to local bridge");
      this.registerSession();
    });

    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data as string) as RequestEnvelope | ResponseEnvelope;
      if ("type" in message) {
        this.onBridgeRequest(message);
      }
    });

    this.socket.addEventListener("close", () => {
      this.onStatus("Disconnected from local bridge");
      this.scheduleReconnect();
    });

    this.socket.addEventListener("error", () => {
      this.onStatus("Bridge connection error");
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = window.setTimeout(() => {
      this.sessionId = createSessionId();
      this.connect();
    }, 2000);
  }

  private registerSession(): void {
    if (!this.context || this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    const payload: SessionRegistrationPayload = {
      sessionId: this.sessionId,
      protocolVersion: PROTOCOL_VERSION,
      pluginInstanceId: this.context.pluginInstanceId,
      fileKey: this.context.fileKey,
      pageId: this.context.pageId,
      editorType: this.context.editorType
    };

    const request: RequestEnvelope<"session.register", SessionRegistrationPayload> = {
      protocolVersion: PROTOCOL_VERSION,
      type: "session.register",
      requestId: createSessionId(),
      sessionId: this.sessionId,
      payload
    };

    this.socket.send(JSON.stringify(request));
  }
}
