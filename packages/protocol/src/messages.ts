export const PROTOCOL_VERSION = "1.0.0";
export const BRIDGE_PORT = 4318;
export const MAX_BATCH_OPS = 10;

export const ERROR_CODES = [
  "missing_session",
  "validation_failed",
  "node_not_found",
  "node_type_mismatch",
  "font_load_failed",
  "permission_denied",
  "batch_limit_exceeded",
  "internal_error"
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];
export type EditorType = "figma";
export type ToolName =
  | "figma.ping"
  | "figma.get_file"
  | "figma.get_current_page"
  | "figma.get_selection"
  | "figma.list_pages"
  | "figma.get_node"
  | "figma.get_node_tree"
  | "figma.rename_node"
  | "figma.create_page"
  | "figma.create_frame"
  | "figma.create_text"
  | "figma.set_text"
  | "figma.move_node"
  | "figma.delete_node"
  | "figma.batch_edit";
export type BridgeMessageType = ToolName | "session.register";
export type BatchOperationType = "rename_node" | "create_page" | "set_text";

export interface ProtocolError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown> | undefined;
}

export interface RequestEnvelope<TType extends string = string, TPayload = unknown> {
  protocolVersion: string;
  type: TType;
  requestId: string;
  sessionId: string;
  payload: TPayload;
}

export interface SuccessResponseEnvelope<TResult = unknown> {
  protocolVersion: string;
  requestId: string;
  ok: true;
  result: TResult;
}

export interface ErrorResponseEnvelope {
  protocolVersion: string;
  requestId: string;
  ok: false;
  error: ProtocolError;
}

export type ResponseEnvelope<TResult = unknown> =
  | SuccessResponseEnvelope<TResult>
  | ErrorResponseEnvelope;

export interface SessionRegistrationPayload {
  sessionId: string;
  protocolVersion: string;
  pluginInstanceId: string;
  fileKey: string | null;
  pageId: string;
  editorType: EditorType;
}

export interface NodeSummary {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
}

export interface NodeDetails extends NodeSummary {
  childIds?: string[] | undefined;
  characters?: string | undefined;
  height?: number | undefined;
  locked?: boolean | undefined;
  visible?: boolean | undefined;
  width?: number | undefined;
  x?: number | undefined;
  y?: number | undefined;
}

export interface NodeTreeNode extends NodeDetails {
  children?: NodeTreeNode[] | undefined;
}

export interface PageSummary {
  id: string;
  name: string;
}

export interface FileSummary {
  fileKey: string | null;
  name: string;
  currentPageId: string;
  pages: PageSummary[];
}

export interface PingResult {
  bridgeTime: string;
  pluginInstanceId: string;
  sessionId: string;
}

export interface GetFileResult {
  file: FileSummary;
}

export interface GetCurrentPageResult {
  page: PageSummary;
  selection: NodeSummary[];
  childIds: string[];
}

export interface GetSelectionResult {
  fileKey: string | null;
  pageId: string;
  selection: NodeSummary[];
}

export interface ListPagesResult {
  fileKey: string | null;
  currentPageId: string;
  pages: PageSummary[];
}

export interface GetNodePayload {
  nodeId: string;
}

export interface GetNodeResult {
  node: NodeDetails;
}

export interface GetNodeTreePayload {
  nodeId?: string | undefined;
  depth?: number | undefined;
}

export interface GetNodeTreeResult {
  root: NodeTreeNode;
  requestedDepth?: number | undefined;
}

export interface RenameNodePayload {
  nodeId: string;
  name: string;
}

export interface RenameNodeResult {
  node: NodeSummary;
}

export interface CreatePagePayload {
  name: string;
}

export interface CreatePageResult {
  page: PageSummary;
}

export interface CreateFramePayload {
  parentId?: string | undefined;
  name?: string | undefined;
  x?: number | undefined;
  y?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

export interface CreateFrameResult {
  node: NodeDetails;
}

export interface CreateTextPayload {
  parentId?: string | undefined;
  name?: string | undefined;
  text?: string | undefined;
  x?: number | undefined;
  y?: number | undefined;
}

export interface CreateTextResult {
  node: NodeDetails;
  text: string;
}

export interface SetTextPayload {
  nodeId: string;
  text: string;
}

export interface SetTextResult {
  node: NodeSummary;
  text: string;
}

export interface MoveNodePayload {
  nodeId: string;
  parentId: string;
  index?: number | undefined;
}

export interface MoveNodeResult {
  node: NodeDetails;
  parentId: string;
  index: number;
}

export interface DeleteNodePayload {
  nodeId: string;
  confirm: boolean;
}

export interface DeleteNodeResult {
  deletedNodeId: string;
  parentId: string | null;
  name: string;
}

export interface BatchRenameNodeOperation {
  op: "rename_node";
  nodeId: string;
  name: string;
}

export interface BatchCreatePageOperation {
  op: "create_page";
  name: string;
}

export interface BatchSetTextOperation {
  op: "set_text";
  nodeId: string;
  text: string;
}

export type BatchOperation =
  | BatchRenameNodeOperation
  | BatchCreatePageOperation
  | BatchSetTextOperation;

export interface BatchEditPayload {
  dryRun?: boolean | undefined;
  confirm?: boolean | undefined;
  ops: BatchOperation[];
}

export interface BatchEditItemResult {
  op: BatchOperationType;
  ok: boolean;
  wouldChange: boolean;
  targetSummary?: string | undefined;
  error?: ProtocolError | undefined;
  result?: Record<string, unknown> | undefined;
}

export interface BatchEditResult {
  dryRun: boolean;
  summary: string;
  results: BatchEditItemResult[];
}
