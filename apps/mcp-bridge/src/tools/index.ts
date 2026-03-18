import { applyStylesTool } from "./apply-styles.js";
import { batchEditTool } from "./batch-edit.js";
import { batchEditV2Tool } from "./batch-edit-v2.js";
import { bindVariableTool } from "./bind-variable.js";
import { createComponentTool } from "./create-component.js";
import { createFrameTool } from "./create-frame.js";
import { createInstanceTool } from "./create-instance.js";
import { createPageTool } from "./create-page.js";
import { createRectangleTool } from "./create-rectangle.js";
import { createSpecPageTool } from "./create-spec-page.js";
import { createTextTool } from "./create-text.js";
import { createVariableCollectionTool } from "./create-variable-collection.js";
import { createVariableTool } from "./create-variable.js";
import { deleteNodeTool } from "./delete-node.js";
import { duplicateNodeTool } from "./duplicate-node.js";
import { extractDesignTokensTool } from "./extract-design-tokens.js";
import { getCurrentPageTool } from "./get-current-page.js";
import { getComponentsTool } from "./get-components.js";
import { getFileTool } from "./get-file.js";
import { getNodeTool } from "./get-node.js";
import { getNodeTreeTool } from "./get-node-tree.js";
import { getSessionStatusTool } from "./get-session-status.js";
import { getStylesTool } from "./get-styles.js";
import { findNodesTool } from "./find-nodes.js";
import { getSelectionTool } from "./get-selection.js";
import { getVariablesTool } from "./get-variables.js";
import { listPagesTool } from "./list-pages.js";
import { moveNodeTool } from "./move-node.js";
import { normalizeNamesTool } from "./normalize-names.js";
import { pingTool } from "./ping.js";
import { renameNodeTool } from "./rename-node.js";
import { setImageFillTool } from "./set-image-fill.js";
import { setInstancePropertiesTool } from "./set-instance-properties.js";
import { setTextTool } from "./set-text.js";
import { updateNodePropertiesTool } from "./update-node-properties.js";

export const toolDefinitions = [
  getSessionStatusTool,
  pingTool,
  getFileTool,
  getCurrentPageTool,
  getSelectionTool,
  listPagesTool,
  getNodeTool,
  getNodeTreeTool,
  findNodesTool,
  getStylesTool,
  getComponentsTool,
  getVariablesTool,
  renameNodeTool,
  createPageTool,
  createFrameTool,
  createRectangleTool,
  createComponentTool,
  createInstanceTool,
  createTextTool,
  duplicateNodeTool,
  setInstancePropertiesTool,
  setImageFillTool,
  setTextTool,
  applyStylesTool,
  updateNodePropertiesTool,
  moveNodeTool,
  deleteNodeTool,
  batchEditTool,
  batchEditV2Tool,
  createVariableCollectionTool,
  createVariableTool,
  bindVariableTool,
  normalizeNamesTool,
  createSpecPageTool,
  extractDesignTokensTool
] as const;
