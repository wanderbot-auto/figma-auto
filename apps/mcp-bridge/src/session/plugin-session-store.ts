import {
  SESSION_REPLACED_CLOSE_CODE,
  SESSION_REPLACED_CLOSE_REASON,
  type SessionRegistrationPayload
} from "@figma-auto/protocol";
import type WebSocket from "ws";

import { ProtocolFailure } from "../errors.js";

export interface ActivePluginSession {
  context: SessionRegistrationPayload;
  socket: WebSocket;
  connectedAt: string;
  lastSeenAt: string;
}

export interface RegisterSessionResult {
  session: ActivePluginSession;
  replacedSessionId?: string | undefined;
  changed: boolean;
}

function hasSameContext(left: SessionRegistrationPayload, right: SessionRegistrationPayload): boolean {
  return left.sessionId === right.sessionId
    && left.protocolVersion === right.protocolVersion
    && left.pluginInstanceId === right.pluginInstanceId
    && left.fileKey === right.fileKey
    && left.pageId === right.pageId
    && left.editorType === right.editorType;
}

export class PluginSessionStore {
  private activeSession: ActivePluginSession | null = null;

  register(context: SessionRegistrationPayload, socket: WebSocket): RegisterSessionResult {
    const timestamp = new Date().toISOString();
    const previousSession = this.activeSession;
    const replacedSessionId =
      previousSession && previousSession.socket !== socket ? previousSession.context.sessionId : undefined;

    if (previousSession && replacedSessionId) {
      previousSession.socket.close(SESSION_REPLACED_CLOSE_CODE, SESSION_REPLACED_CLOSE_REASON);
    }

    const connectedAt =
      previousSession && previousSession.socket === socket
        ? previousSession.connectedAt
        : timestamp;
    const changed = !previousSession
      || previousSession.socket !== socket
      || !hasSameContext(previousSession.context, context);

    this.activeSession = {
      context,
      socket,
      connectedAt,
      lastSeenAt: timestamp
    };

    return {
      session: this.activeSession,
      changed,
      ...(replacedSessionId ? { replacedSessionId } : {})
    };
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

  touchForSocket(socket: WebSocket): void {
    if (this.activeSession?.socket === socket) {
      this.activeSession = {
        ...this.activeSession,
        lastSeenAt: new Date().toISOString()
      };
    }
  }
}
