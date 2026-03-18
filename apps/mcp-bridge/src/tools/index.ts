import { batchEditTool } from "./batch-edit.js";
import { bindVariableTool } from "./bind-variable.js";
import { createComponentTool } from "./create-component.js";
import { createFrameTool } from "./create-frame.js";
import { createPageTool } from "./create-page.js";
import { createSpecPageTool } from "./create-spec-page.js";
import { createTextTool } from "./create-text.js";
import { createVariableCollectionTool } from "./create-variable-collection.js";
import { createVariableTool } from "./create-variable.js";
import { deleteNodeTool } from "./delete-node.js";
import { extractDesignTokensTool } from "./extract-design-tokens.js";
import { getCurrentPageTool } from "./get-current-page.js";
import { getFileTool } from "./get-file.js";
import { getNodeTool } from "./get-node.js";
import { getNodeTreeTool } from "./get-node-tree.js";
import { findNodesTool } from "./find-nodes.js";
import { getSelectionTool } from "./get-selection.js";
import { getVariablesTool } from "./get-variables.js";
import { listPagesTool } from "./list-pages.js";
import { moveNodeTool } from "./move-node.js";
import { normalizeNamesTool } from "./normalize-names.js";
import { pingTool } from "./ping.js";
import { renameNodeTool } from "./rename-node.js";
import { setTextTool } from "./set-text.js";

export const toolDefinitions = [
  pingTool,
  getFileTool,
  getCurrentPageTool,
  getSelectionTool,
  listPagesTool,
  getNodeTool,
  getNodeTreeTool,
  findNodesTool,
  getVariablesTool,
  renameNodeTool,
  createPageTool,
  createFrameTool,
  createComponentTool,
  createTextTool,
  setTextTool,
  moveNodeTool,
  deleteNodeTool,
  batchEditTool,
  createVariableCollectionTool,
  createVariableTool,
  bindVariableTool,
  normalizeNamesTool,
  createSpecPageTool,
  extractDesignTokensTool
] as const;
