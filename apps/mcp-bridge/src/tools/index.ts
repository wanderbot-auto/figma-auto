import { batchEditTool } from "./batch-edit.js";
import { createFrameTool } from "./create-frame.js";
import { createPageTool } from "./create-page.js";
import { createTextTool } from "./create-text.js";
import { deleteNodeTool } from "./delete-node.js";
import { getCurrentPageTool } from "./get-current-page.js";
import { getFileTool } from "./get-file.js";
import { getNodeTool } from "./get-node.js";
import { getNodeTreeTool } from "./get-node-tree.js";
import { getSelectionTool } from "./get-selection.js";
import { listPagesTool } from "./list-pages.js";
import { moveNodeTool } from "./move-node.js";
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
  renameNodeTool,
  createPageTool,
  createFrameTool,
  createTextTool,
  setTextTool,
  moveNodeTool,
  deleteNodeTool,
  batchEditTool
] as const;
