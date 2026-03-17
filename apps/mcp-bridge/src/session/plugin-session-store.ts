import type { SessionRegistrationPayload } from "@figma-auto/protocol";
import type WebSocket from "ws";

import { ProtocolFailure } from "../errors.js";

export interface ActivePluginSession {
  context: SessionRegistrationPayload;
  socket: WebSocket;
  connectedAt: string;
}

export class PluginSessionStore {
  private activeSession: ActivePluginSession | null = null;

  register(context: SessionRegistrationPayload, socket: WebSocket): ActivePluginSession {
    if (this.activeSession && this.activeSession.socket !== socket) {
      this.activeSession.socket.close();
    }

    this.activeSession = {
      context,
      socket,
      connectedAt: new Date().toISOString()
    };

    return this.activeSession;
  }

  getActive(): ActivePluginSession | null {
    return this.activeSession;
  }

  requireActive(): ActivePluginSession {
    if (!this.activeSession) {
      throw new ProtocolFailure("missing_session", "No active plugin session is attached");
    }

    return this.activeSession;
  }

  clearForSocket(socket: WebSocket): void {
    if (this.activeSession?.socket === socket) {
      this.activeSession = null;
    }
  }
}
