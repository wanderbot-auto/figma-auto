import {
  PROTOCOL_VERSION,
  batchEditPayloadSchema,
  createFramePayloadSchema,
  createPagePayloadSchema,
  createTextPayloadSchema,
  deleteNodePayloadSchema,
  getNodePayloadSchema,
  getNodeTreePayloadSchema,
  moveNodePayloadSchema,
  renameNodePayloadSchema,
  setTextPayloadSchema,
  type BatchEditResult,
  type CreateFrameResult,
  type CreatePageResult,
  type CreateTextResult,
  type DeleteNodeResult,
  type GetCurrentPageResult,
  type GetFileResult,
  type GetNodeResult,
  type GetNodeTreeResult,
  type GetSelectionResult,
  type ListPagesResult,
  type MoveNodeResult,
  type PingResult,
  type ProtocolError,
  type RenameNodeResult,
  type RequestEnvelope,
  type ResponseEnvelope,
  type SetTextResult
} from "@figma-auto/protocol";

import { batchEdit } from "./handlers/batch.js";
import { getCurrentPage, getFile, getNode, getNodeTree, getSelection, listPages, ping } from "./handlers/read.js";
import { buildPluginRuntimeContext } from "./handlers/session.js";
import { createFrame, createPage, createText, deleteNode, moveNode, renameNode, setText } from "./handlers/write.js";
import type { PluginToUiMessage, UiToPluginMessage } from "./types.js";

const pluginInstanceId = `plugin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

type ToolResult =
  | PingResult
  | GetFileResult
  | GetCurrentPageResult
  | GetSelectionResult
  | ListPagesResult
  | GetNodeResult
  | GetNodeTreeResult
  | RenameNodeResult
  | CreatePageResult
  | CreateFrameResult
  | CreateTextResult
  | SetTextResult
  | MoveNodeResult
  | DeleteNodeResult
  | BatchEditResult;

function postToUi(message: PluginToUiMessage): void {
  figma.ui.postMessage(message);
}

function postContext(): void {
  postToUi({
    type: "plugin.context",
    context: buildPluginRuntimeContext(pluginInstanceId)
  });
}

function success<TResult>(requestId: string, result: TResult): ResponseEnvelope<TResult> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    ok: true,
    result
  };
}

function failure(requestId: string, code: ProtocolError["code"], message: string): ResponseEnvelope<never> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    ok: false,
    error: {
      code,
      message
    }
  };
}

function mapErrorCode(message: string): ProtocolError["code"] {
  if (message.includes("not found")) {
    return "node_not_found";
  }
  if (message.includes("text node") || message.includes("scene node") || message.includes("contain children")) {
    return "node_type_mismatch";
  }
  if (message.includes("font")) {
    return "font_load_failed";
  }
  if (message.includes("confirm=true")) {
    return "permission_denied";
  }

  return "validation_failed";
}

async function executeRequest(request: RequestEnvelope): Promise<ResponseEnvelope<ToolResult>> {
  try {
    switch (request.type) {
      case "figma.ping":
        return success(request.requestId, ping(request.sessionId, pluginInstanceId));
      case "figma.get_file":
        return success(request.requestId, getFile());
      case "figma.get_current_page":
        return success(request.requestId, getCurrentPage());
      case "figma.get_selection":
        return success(request.requestId, getSelection());
      case "figma.list_pages":
        return success(request.requestId, listPages());
      case "figma.get_node":
        return success(request.requestId, getNode(getNodePayloadSchema.parse(request.payload).nodeId));
      case "figma.get_node_tree":
        return success(request.requestId, getNodeTree(getNodeTreePayloadSchema.parse(request.payload)));
      case "figma.rename_node":
        return success(request.requestId, renameNode(renameNodePayloadSchema.parse(request.payload)));
      case "figma.create_page":
        return success(request.requestId, createPage(createPagePayloadSchema.parse(request.payload)));
      case "figma.create_frame":
        return success(request.requestId, createFrame(createFramePayloadSchema.parse(request.payload)));
      case "figma.create_text":
        return success(request.requestId, await createText(createTextPayloadSchema.parse(request.payload)));
      case "figma.set_text":
        return success(request.requestId, await setText(setTextPayloadSchema.parse(request.payload)));
      case "figma.move_node":
        return success(request.requestId, moveNode(moveNodePayloadSchema.parse(request.payload)));
      case "figma.delete_node":
        return success(request.requestId, deleteNode(deleteNodePayloadSchema.parse(request.payload)));
      case "figma.batch_edit":
        return success(request.requestId, await batchEdit(batchEditPayloadSchema.parse(request.payload)));
      default:
        return failure(request.requestId, "validation_failed", `Unsupported request type ${request.type}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown plugin error";
    return failure(request.requestId, mapErrorCode(message), message);
  }
}

figma.showUI(__html__, {
  width: 360,
  height: 260,
  themeColors: true
});

figma.ui.onmessage = async (message: UiToPluginMessage) => {
  if (message.type === "ui.ready") {
    postContext();
    return;
  }

  if (message.type === "bridge.request") {
    const response = await executeRequest(message.request);
    postToUi({
      type: "bridge.response",
      response
    });
  }
};

figma.on("selectionchange", () => postContext());
figma.on("currentpagechange", () => postContext());

postContext();
