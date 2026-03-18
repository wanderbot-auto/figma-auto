import type {
  RequestEnvelope,
  ResponseEnvelope,
  SessionRegistrationPayload
} from "@figma-auto/protocol";

export interface PluginRuntimeContext {
  pluginInstanceId: string;
  fileName: string;
  fileKey: string | null;
  pageName: string;
  pageId: string;
  selectionCount: number;
  editorType: SessionRegistrationPayload["editorType"];
}

export type UiToPluginMessage =
  | { type: "ui.ready" }
  | { type: "bridge.request"; request: RequestEnvelope };

export type PluginToUiMessage =
  | { type: "plugin.context"; context: PluginRuntimeContext }
  | { type: "bridge.response"; response: ResponseEnvelope };
