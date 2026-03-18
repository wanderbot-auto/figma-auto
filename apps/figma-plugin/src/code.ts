import {
  PROTOCOL_VERSION,
  batchEditPayloadSchema,
  bindVariablePayloadSchema,
  createComponentPayloadSchema,
  createFramePayloadSchema,
  createPagePayloadSchema,
  createSpecPagePayloadSchema,
  createTextPayloadSchema,
  createVariableCollectionPayloadSchema,
  createVariablePayloadSchema,
  deleteNodePayloadSchema,
  extractDesignTokensPayloadSchema,
  findNodesPayloadSchema,
  getVariablesPayloadSchema,
  getNodePayloadSchema,
  getNodeTreePayloadSchema,
  moveNodePayloadSchema,
  normalizeNamesPayloadSchema,
  renameNodePayloadSchema,
  setTextPayloadSchema,
  type BatchEditResult,
  type BindVariableResult,
  type CreateComponentResult,
  type CreateFrameResult,
  type CreatePageResult,
  type CreateSpecPageResult,
  type CreateTextResult,
  type CreateVariableCollectionResult,
  type CreateVariablePayload,
  type CreateVariableResult,
  type DeleteNodeResult,
  type ExtractDesignTokensResult,
  type FindNodesResult,
  type GetCurrentPageResult,
  type GetFileResult,
  type GetVariablesResult,
  type GetNodeResult,
  type GetNodeTreeResult,
  type GetSelectionResult,
  type ListPagesResult,
  type MoveNodeResult,
  type NormalizeNamesResult,
  type PingResult,
  type ProtocolError,
  type RenameNodeResult,
  type RequestEnvelope,
  type ResponseEnvelope,
  type SetTextResult
} from "@figma-auto/protocol";

import { batchEdit } from "./handlers/batch.js";
import { createSpecPage, extractDesignTokens, normalizeNames } from "./handlers/high-level.js";
import { findNodes, getCurrentPage, getFile, getNode, getNodeTree, getSelection, listPages, ping } from "./handlers/read.js";
import { buildPluginRuntimeContext } from "./handlers/session.js";
import { bindVariable, createVariable, createVariableCollection, getVariables } from "./handlers/variables.js";
import { createComponent, createFrame, createPage, createText, deleteNode, moveNode, renameNode, setText } from "./handlers/write.js";
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
  | FindNodesResult
  | GetVariablesResult
  | RenameNodeResult
  | CreatePageResult
  | CreateFrameResult
  | CreateComponentResult
  | CreateTextResult
  | SetTextResult
  | MoveNodeResult
  | DeleteNodeResult
  | BatchEditResult
  | CreateVariableCollectionResult
  | CreateVariableResult
  | BindVariableResult
  | NormalizeNamesResult
  | CreateSpecPageResult
  | ExtractDesignTokensResult;

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
        return success(request.requestId, await getNode(getNodePayloadSchema.parse(request.payload).nodeId));
      case "figma.get_node_tree":
        return success(request.requestId, await getNodeTree(getNodeTreePayloadSchema.parse(request.payload)));
      case "figma.find_nodes":
        return success(request.requestId, await findNodes(findNodesPayloadSchema.parse(request.payload)));
      case "figma.get_variables":
        return success(request.requestId, await getVariables(getVariablesPayloadSchema.parse(request.payload)));
      case "figma.rename_node":
        return success(request.requestId, await renameNode(renameNodePayloadSchema.parse(request.payload)));
      case "figma.create_page":
        return success(request.requestId, createPage(createPagePayloadSchema.parse(request.payload)));
      case "figma.create_frame":
        return success(request.requestId, await createFrame(createFramePayloadSchema.parse(request.payload)));
      case "figma.create_component":
        return success(request.requestId, await createComponent(createComponentPayloadSchema.parse(request.payload)));
      case "figma.create_text":
        return success(request.requestId, await createText(createTextPayloadSchema.parse(request.payload)));
      case "figma.set_text":
        return success(request.requestId, await setText(setTextPayloadSchema.parse(request.payload)));
      case "figma.move_node":
        return success(request.requestId, await moveNode(moveNodePayloadSchema.parse(request.payload)));
      case "figma.delete_node":
        return success(request.requestId, await deleteNode(deleteNodePayloadSchema.parse(request.payload)));
      case "figma.batch_edit":
        return success(request.requestId, await batchEdit(batchEditPayloadSchema.parse(request.payload)));
      case "figma.create_variable_collection":
        return success(
          request.requestId,
          await createVariableCollection(createVariableCollectionPayloadSchema.parse(request.payload))
        );
      case "figma.create_variable":
        return success(
          request.requestId,
          await createVariable(createVariablePayloadSchema.parse(request.payload) as CreateVariablePayload)
        );
      case "figma.bind_variable":
        return success(request.requestId, await bindVariable(bindVariablePayloadSchema.parse(request.payload)));
      case "figma.normalize_names":
        return success(request.requestId, await normalizeNames(normalizeNamesPayloadSchema.parse(request.payload)));
      case "figma.create_spec_page":
        return success(request.requestId, await createSpecPage(createSpecPagePayloadSchema.parse(request.payload)));
      case "figma.extract_design_tokens":
        return success(
          request.requestId,
          await extractDesignTokens(extractDesignTokensPayloadSchema.parse(request.payload))
        );
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
