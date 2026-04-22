import {
  SESSION_REPLACED_CLOSE_CODE,
  SESSION_REPLACED_CLOSE_REASON,
  type RequestEnvelope,
  type ResponseEnvelope,
  type SessionRegistrationPayload
} from "@figma-auto/protocol";

import type { PluginRuntimeContext } from "./types.js";

declare const __FIGMA_AUTO_BRIDGE_NAME__: string;
declare const __FIGMA_AUTO_BRIDGE_PORT__: number;
declare const __FIGMA_AUTO_BRIDGE_HTTP_URL__: string;
declare const __FIGMA_AUTO_BRIDGE_WS_URL__: string;
declare const __FIGMA_AUTO_PROTOCOL_VERSION__: string;

export type BridgeConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "error";

const BRIDGE_NAME = __FIGMA_AUTO_BRIDGE_NAME__;
const BRIDGE_PORT = __FIGMA_AUTO_BRIDGE_PORT__;
const BRIDGE_HTTP_URL = __FIGMA_AUTO_BRIDGE_HTTP_URL__;
const BRIDGE_WS_URL = __FIGMA_AUTO_BRIDGE_WS_URL__;
const PROTOCOL_VERSION = __FIGMA_AUTO_PROTOCOL_VERSION__;

interface RegistrationContext {
  pluginInstanceId: string;
  fileKey: string | null;
  pageId: string;
  editorType: SessionRegistrationPayload["editorType"];
}

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
  private lastRegisteredContextKey: string | null = null;

  constructor(
    private readonly onStatusChange: (state: BridgeConnectionState, message: string) => void,
    private readonly onBridgeRequest: (request: RequestEnvelope) => void
  ) {}

  updateContext(context: PluginRuntimeContext): void {
    this.context = context;
    if (this.socket?.readyState === WebSocket.OPEN) {
      if (this.getRegistrationContextKey() !== this.lastRegisteredContextKey) {
        this.registerSession();
      }
      return;
    }

    this.connect();
  }

  reconnect(): void {
    this.sessionId = createSessionId();
    this.lastRegisteredContextKey = null;
    this.emitStatus("connecting", `Reconnecting to bridge ${BRIDGE_NAME} on port ${BRIDGE_PORT}`);
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const previousSocket = this.socket;
    this.socket = null;
    previousSocket?.close();
    this.connect();
  }

  forwardResponse(response: ResponseEnvelope): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      this.socket.send(JSON.stringify(response));
    } catch {
      this.emitStatus("error", "Failed to forward response to local bridge");
    }
  }

  private connect(): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.emitStatus("connecting", `Connecting to bridge ${BRIDGE_NAME} on port ${BRIDGE_PORT}`);
    const socket = new WebSocket(BRIDGE_WS_URL);
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) {
        return;
      }
      if (this.reconnectTimer !== null) {
        window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.emitStatus("connected", `Connected to bridge ${BRIDGE_NAME} on port ${BRIDGE_PORT}`);
      this.registerSession();
    });

    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data as string) as RequestEnvelope | ResponseEnvelope;
        if ("type" in message) {
          this.onBridgeRequest(message);
        }
      } catch {
        this.emitStatus("error", "Received an invalid message from the local bridge");
      }
    });

    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) {
        return;
      }

      this.socket = null;
      this.lastRegisteredContextKey = null;
      if (
        event.code === SESSION_REPLACED_CLOSE_CODE
        || event.reason === SESSION_REPLACED_CLOSE_REASON
      ) {
        this.emitStatus("disconnected", "This plugin instance was replaced by another active session. Use Reconnect to take over.");
        return;
      }
      this.emitStatus("disconnected", `Disconnected from bridge ${BRIDGE_NAME}. Retrying in 2 seconds.`);
      this.scheduleReconnect();
    });

    socket.addEventListener("error", () => {
      if (this.socket !== socket) {
        return;
      }
      this.lastRegisteredContextKey = null;
      this.emitStatus("error", `Bridge connection error for ${BRIDGE_NAME} (${BRIDGE_HTTP_URL})`);
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

    const registrationContext = this.toRegistrationContext(this.context);
    const registrationContextKey = this.getRegistrationContextKey(registrationContext);
    const payload: SessionRegistrationPayload = {
      sessionId: this.sessionId,
      protocolVersion: PROTOCOL_VERSION,
      pluginInstanceId: registrationContext.pluginInstanceId,
      fileKey: registrationContext.fileKey,
      pageId: registrationContext.pageId,
      editorType: registrationContext.editorType
    };

    const request: RequestEnvelope<"session.register", SessionRegistrationPayload> = {
      protocolVersion: PROTOCOL_VERSION,
      type: "session.register",
      requestId: createSessionId(),
      sessionId: this.sessionId,
      payload
    };

    this.socket.send(JSON.stringify(request));
    this.lastRegisteredContextKey = registrationContextKey;
  }

  private emitStatus(state: BridgeConnectionState, message: string): void {
    this.onStatusChange(state, message);
  }

  private toRegistrationContext(context: PluginRuntimeContext): RegistrationContext {
    return {
      pluginInstanceId: context.pluginInstanceId,
      fileKey: context.fileKey,
      pageId: context.pageId,
      editorType: context.editorType
    };
  }

  private getRegistrationContextKey(context: RegistrationContext | null = this.context
    ? this.toRegistrationContext(this.context)
    : null): string | null {
    if (!context) {
      return null;
    }

    return JSON.stringify(context);
  }
}
