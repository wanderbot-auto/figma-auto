import {
  PROTOCOL_VERSION,
  applyStylesPayloadSchema,
  batchEditPayloadSchema,
  batchEditV2PayloadSchema,
  bindVariablePayloadSchema,
  createComponentPayloadSchema,
  createFramePayloadSchema,
  createInstancePayloadSchema,
  createPagePayloadSchema,
  createRectanglePayloadSchema,
  createSpecPagePayloadSchema,
  createTextPayloadSchema,
  createVariableCollectionPayloadSchema,
  createVariablePayloadSchema,
  deleteNodePayloadSchema,
  duplicateNodePayloadSchema,
  extractDesignTokensPayloadSchema,
  findNodesPayloadSchema,
  getComponentsPayloadSchema,
  getFlowPayloadSchema,
  getStylesPayloadSchema,
  getVariablesPayloadSchema,
  getNodePayloadSchema,
  getNodeTreePayloadSchema,
  moveNodePayloadSchema,
  normalizeNamesPayloadSchema,
  renameNodePayloadSchema,
  setImageFillPayloadSchema,
  setInstancePropertiesPayloadSchema,
  setReactionsPayloadSchema,
  setTextPayloadSchema,
  updateNodePropertiesPayloadSchema,
  type ApplyStylesResult,
  type BatchEditResult,
  type BatchEditV2Result,
  type BindVariableResult,
  type GetComponentsResult,
  type GetFlowResult,
  type CreateComponentResult,
  type CreateFrameResult,
  type CreateInstanceResult,
  type CreatePageResult,
  type CreateRectangleResult,
  type CreateSpecPageResult,
  type CreateTextResult,
  type CreateVariableCollectionResult,
  type CreateVariablePayload,
  type CreateVariableResult,
  type DeleteNodeResult,
  type DuplicateNodeResult,
  type ExtractDesignTokensResult,
  type FindNodesResult,
  type GetCurrentPageResult,
  type GetFileResult,
  type GetStylesResult,
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
  type SetImageFillResult,
  type SetInstancePropertiesResult,
  type SetReactionsResult,
  type SetTextResult,
  type UpdateNodePropertiesResult
} from "@figma-auto/protocol";

import { batchEdit } from "./handlers/batch.js";
import { batchEditV2 } from "./handlers/batch-v2.js";
import { getComponents } from "./handlers/components.js";
import { createSpecPage, extractDesignTokens, normalizeNames } from "./handlers/high-level.js";
import { getFlow } from "./handlers/prototype.js";
import { findNodes, getCurrentPage, getFile, getNode, getNodeTree, getSelection, listPages, ping } from "./handlers/read.js";
import { setImageFill } from "./handlers/set-image-fill.js";
import { setInstanceProperties } from "./handlers/set-instance-properties.js";
import { buildPluginRuntimeContext } from "./handlers/session.js";
import { applyStyles, getStyles } from "./handlers/styles.js";
import { updateNodeProperties } from "./handlers/update-node-properties.js";
import { bindVariable, createVariable, createVariableCollection, getVariables } from "./handlers/variables.js";
import {
  createComponent,
  createFrame,
  createInstance,
  createPage,
  createRectangle,
  createText,
  deleteNode,
  describeUnknownError,
  duplicateNode,
  moveNode,
  renameNode,
  setReactions,
  setText
} from "./handlers/write.js";
import type { PluginToUiMessage, UiToPluginMessage } from "./types.js";

const pluginInstanceId = `plugin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
let uiReady = false;
let contextRetryTimer: number | null = null;

type ToolResult =
  | PingResult
  | GetFileResult
  | GetCurrentPageResult
  | GetFlowResult
  | GetSelectionResult
  | ListPagesResult
  | GetNodeResult
  | GetNodeTreeResult
  | FindNodesResult
  | GetStylesResult
  | GetComponentsResult
  | GetVariablesResult
  | RenameNodeResult
  | CreatePageResult
  | CreateFrameResult
  | CreateRectangleResult
  | CreateComponentResult
  | CreateInstanceResult
  | CreateTextResult
  | DuplicateNodeResult
  | SetInstancePropertiesResult
  | SetImageFillResult
  | SetTextResult
  | SetReactionsResult
  | ApplyStylesResult
  | UpdateNodePropertiesResult
  | MoveNodeResult
  | DeleteNodeResult
  | BatchEditResult
  | BatchEditV2Result
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

function stopContextRetry(): void {
  if (contextRetryTimer !== null) {
    clearInterval(contextRetryTimer);
    contextRetryTimer = null;
  }
}

function startContextRetry(): void {
  if (contextRetryTimer !== null) {
    return;
  }

  contextRetryTimer = setInterval(() => {
    if (uiReady) {
      stopContextRetry();
      return;
    }

    postContext();
  }, 500) as unknown as number;
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
  if (
    message.includes("text node")
    || message.includes("scene node")
    || message.includes("contain children")
    || message.includes("component or component set")
    || message.includes("support")
  ) {
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
      case "figma.get_flow":
        return success(request.requestId, await getFlow(getFlowPayloadSchema.parse(request.payload)));
      case "figma.get_selection":
        return success(request.requestId, getSelection());
      case "figma.list_pages":
        return success(request.requestId, listPages());
      case "figma.get_node":
        return success(request.requestId, await getNode(getNodePayloadSchema.parse(request.payload)));
      case "figma.get_node_tree":
        return success(request.requestId, await getNodeTree(getNodeTreePayloadSchema.parse(request.payload)));
      case "figma.find_nodes":
        return success(request.requestId, await findNodes(findNodesPayloadSchema.parse(request.payload)));
      case "figma.get_styles":
        return success(request.requestId, await getStyles(getStylesPayloadSchema.parse(request.payload)));
      case "figma.get_components":
        return success(request.requestId, await getComponents(getComponentsPayloadSchema.parse(request.payload)));
      case "figma.get_variables":
        return success(request.requestId, await getVariables(getVariablesPayloadSchema.parse(request.payload)));
      case "figma.rename_node":
        return success(request.requestId, await renameNode(renameNodePayloadSchema.parse(request.payload)));
      case "figma.create_page":
        return success(request.requestId, createPage(createPagePayloadSchema.parse(request.payload)));
      case "figma.create_frame":
        return success(request.requestId, await createFrame(createFramePayloadSchema.parse(request.payload)));
      case "figma.create_rectangle":
        return success(request.requestId, await createRectangle(createRectanglePayloadSchema.parse(request.payload)));
      case "figma.create_component":
        return success(request.requestId, await createComponent(createComponentPayloadSchema.parse(request.payload)));
      case "figma.create_instance":
        return success(request.requestId, await createInstance(createInstancePayloadSchema.parse(request.payload)));
      case "figma.create_text":
        return success(request.requestId, await createText(createTextPayloadSchema.parse(request.payload)));
      case "figma.duplicate_node":
        return success(request.requestId, await duplicateNode(duplicateNodePayloadSchema.parse(request.payload)));
      case "figma.set_instance_properties":
        return success(
          request.requestId,
          await setInstanceProperties(setInstancePropertiesPayloadSchema.parse(request.payload))
        );
      case "figma.set_image_fill":
        return success(request.requestId, await setImageFill(setImageFillPayloadSchema.parse(request.payload)));
      case "figma.set_reactions":
        return success(request.requestId, await setReactions(setReactionsPayloadSchema.parse(request.payload)));
      case "figma.set_text":
        return success(request.requestId, await setText(setTextPayloadSchema.parse(request.payload)));
      case "figma.apply_styles":
        return success(request.requestId, await applyStyles(applyStylesPayloadSchema.parse(request.payload)));
      case "figma.update_node_properties":
        return success(
          request.requestId,
          await updateNodeProperties(updateNodePropertiesPayloadSchema.parse(request.payload))
        );
      case "figma.move_node":
        return success(request.requestId, await moveNode(moveNodePayloadSchema.parse(request.payload)));
      case "figma.delete_node":
        return success(request.requestId, await deleteNode(deleteNodePayloadSchema.parse(request.payload)));
      case "figma.batch_edit":
        return success(request.requestId, await batchEdit(batchEditPayloadSchema.parse(request.payload)));
      case "figma.batch_edit_v2":
        return success(request.requestId, await batchEditV2(batchEditV2PayloadSchema.parse(request.payload)));
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
    const message = describeUnknownError(error);
    return failure(request.requestId, mapErrorCode(message), message);
  }
}

figma.showUI(__html__, {
  width: 420,
  height: 760,
  themeColors: true
});

startContextRetry();

figma.ui.onmessage = async (message: UiToPluginMessage) => {
  if (message.type === "ui.ready") {
    uiReady = true;
    stopContextRetry();
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
