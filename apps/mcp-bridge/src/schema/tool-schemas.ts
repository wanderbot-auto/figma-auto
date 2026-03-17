import {
  batchEditPayloadSchema,
  createFramePayloadSchema,
  createPagePayloadSchema,
  createTextPayloadSchema,
  deleteNodePayloadSchema,
  emptyPayloadSchema,
  getNodePayloadSchema,
  getNodeTreePayloadSchema,
  moveNodePayloadSchema,
  renameNodePayloadSchema,
  setTextPayloadSchema
} from "@figma-auto/protocol";

export const toolSchemas = {
  ping: emptyPayloadSchema,
  getFile: emptyPayloadSchema,
  getCurrentPage: emptyPayloadSchema,
  getSelection: emptyPayloadSchema,
  listPages: emptyPayloadSchema,
  getNode: getNodePayloadSchema,
  getNodeTree: getNodeTreePayloadSchema,
  renameNode: renameNodePayloadSchema,
  createPage: createPagePayloadSchema,
  createFrame: createFramePayloadSchema,
  createText: createTextPayloadSchema,
  setText: setTextPayloadSchema,
  moveNode: moveNodePayloadSchema,
  deleteNode: deleteNodePayloadSchema,
  batchEdit: batchEditPayloadSchema
};
