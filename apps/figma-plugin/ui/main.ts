import type { RequestEnvelope, ResponseEnvelope, ToolName } from "@figma-auto/protocol";

import type { PluginRuntimeContext, PluginToUiMessage } from "./types.js";
import { BridgeTransport, type BridgeConnectionState } from "./transport.js";

const bridgeBadgeElement = document.getElementById("bridge-badge");
const statusMessageElement = document.getElementById("status-message");
const reconnectButton = document.getElementById("reconnect");
const actionsPanelElement = document.getElementById("actions-panel");
const actionsEmptyElement = document.getElementById("actions-empty");
const currentBadgeElement = document.getElementById("current-badge");
const currentTitleElement = document.getElementById("current-title");
const currentDetailElement = document.getElementById("current-detail");
const currentMetaElement = document.getElementById("current-meta");
const historyListElement = document.getElementById("history-list");
const contextGridElement = document.getElementById("context-grid");

if (
  !bridgeBadgeElement
  || !statusMessageElement
  || !currentBadgeElement
  || !actionsPanelElement
  || !actionsEmptyElement
  || !currentTitleElement
  || !currentDetailElement
  || !currentMetaElement
  || !historyListElement
  || !contextGridElement
  || !(reconnectButton instanceof HTMLButtonElement)
) {
  throw new Error("Plugin UI failed to initialize");
}

const bridgeBadge = bridgeBadgeElement as HTMLElement;
const statusMessage = statusMessageElement as HTMLElement;
const actionsPanel = actionsPanelElement as HTMLElement;
const actionsEmpty = actionsEmptyElement as HTMLElement;
const currentBadge = currentBadgeElement as HTMLElement;
const currentTitle = currentTitleElement as HTMLElement;
const currentDetail = currentDetailElement as HTMLElement;
const currentMeta = currentMetaElement as HTMLElement;
const historyList = historyListElement as HTMLElement;
const contextGrid = contextGridElement as HTMLElement;

type ActionStatus = "running" | "success" | "preview" | "failed";

interface TrackedAction {
  requestId: string;
  tool: ToolName;
  title: string;
  detail: string;
  effect: "change" | "preview";
  status: ActionStatus;
  startedAt: number;
  finishedAt?: number;
  summary?: string;
}

const MAX_HISTORY_ITEMS = 10;

const trackedTools = new Set<ToolName>([
  "figma.rename_node",
  "figma.create_page",
  "figma.create_frame",
  "figma.create_rectangle",
  "figma.create_component",
  "figma.create_instance",
  "figma.create_text",
  "figma.duplicate_node",
  "figma.set_instance_properties",
  "figma.set_image_fill",
  "figma.set_text",
  "figma.apply_styles",
  "figma.update_node_properties",
  "figma.move_node",
  "figma.delete_node",
  "figma.batch_edit",
  "figma.batch_edit_v2",
  "figma.create_variable_collection",
  "figma.create_variable",
  "figma.bind_variable",
  "figma.normalize_names",
  "figma.create_spec_page"
]);

const previewableTools = new Set<ToolName>([
  "figma.batch_edit",
  "figma.batch_edit_v2",
  "figma.normalize_names"
]);

const pendingActions = new Map<string, TrackedAction>();
const history: TrackedAction[] = [];

let bridgeState: BridgeConnectionState = "idle";
let bridgeMessage = "UI script booted. Waiting for plugin context...";
let runtimeContext: PluginRuntimeContext | null = null;
let lastCompletedAction: TrackedAction | null = null;
let readyPingTimer: number | null = null;

window.addEventListener("error", (event) => {
  bridgeState = "error";
  bridgeMessage = event.error instanceof Error ? event.error.message : String(event.message);
  renderConnection();
});

const transport = new BridgeTransport(
  (state, message) => {
    bridgeState = state;
    bridgeMessage = message;
    renderConnection();
  },
  (request) => {
    trackRequest(request as RequestEnvelope<ToolName>);
    parent.postMessage({ pluginMessage: { type: "bridge.request", request } }, "*");
  }
);

renderConnection();
renderCurrentAction();
renderHistory();
renderContext();

window.onmessage = (event: MessageEvent<{ pluginMessage?: PluginToUiMessage }>) => {
  const message = event.data.pluginMessage;
  if (!message) {
    return;
  }

  if (message.type === "plugin.context") {
    runtimeContext = message.context;
    if (readyPingTimer !== null) {
      window.clearInterval(readyPingTimer);
      readyPingTimer = null;
    }
    renderContext();
    transport.updateContext(message.context);
    return;
  }

  if (message.type === "bridge.response") {
    trackResponse(message.response);
    transport.forwardResponse(message.response);
  }
};

reconnectButton.addEventListener("click", () => transport.reconnect());
requestPluginContext();
readyPingTimer = window.setInterval(() => {
  if (runtimeContext) {
    if (readyPingTimer !== null) {
      window.clearInterval(readyPingTimer);
      readyPingTimer = null;
    }
    return;
  }
  requestPluginContext();
}, 500);

function trackRequest(request: RequestEnvelope<ToolName>): void {
  const trackedAction = describeRequest(request);
  if (!trackedAction) {
    return;
  }

  pendingActions.set(request.requestId, trackedAction);
  renderCurrentAction();
}

function requestPluginContext(): void {
  parent.postMessage({ pluginMessage: { type: "ui.ready" } }, "*");
}

function trackResponse(response: ResponseEnvelope): void {
  const pending = pendingActions.get(response.requestId);
  if (!pending) {
    return;
  }

  pendingActions.delete(response.requestId);
  const completedAction: TrackedAction = {
    ...pending,
    status: response.ok ? (pending.effect === "preview" ? "preview" : "success") : "failed",
    finishedAt: Date.now(),
    summary: describeResponseSummary(pending, response)
  };

  lastCompletedAction = completedAction;
  history.unshift(completedAction);
  history.length = Math.min(history.length, MAX_HISTORY_ITEMS);
  renderCurrentAction();
  renderHistory();
}

function describeRequest(request: RequestEnvelope<ToolName>): TrackedAction | null {
  if (!trackedTools.has(request.type)) {
    return null;
  }

  const payload = asRecord(request.payload);
  const effect: "change" | "preview" =
    previewableTools.has(request.type) && (getBoolean(payload, "dryRun") ?? true) ? "preview" : "change";

  let title = "Apply design change";
  let detail = "Processing a plugin-driven design change.";

  switch (request.type) {
    case "figma.rename_node":
      title = `Rename layer to ${quote(getString(payload, "name") ?? "new name")}`;
      detail = `Updating layer ${shortId(getString(payload, "nodeId"))}.`;
      break;
    case "figma.create_page":
      title = `Create page ${quote(getString(payload, "name") ?? "Untitled")}`;
      detail = "Adding a new page to the current file.";
      break;
    case "figma.create_frame":
      title = `Create frame ${quote(getString(payload, "name") ?? "Frame")}`;
      detail = describeCreateNodeDetail("frame", payload);
      break;
    case "figma.create_rectangle":
      title = `Create rectangle ${quote(getString(payload, "name") ?? "Rectangle")}`;
      detail = describeCreateNodeDetail("rectangle", payload);
      break;
    case "figma.create_component":
      title = `Create component ${quote(getString(payload, "name") ?? "Component")}`;
      detail = getString(payload, "nodeId")
        ? `Converting node ${shortId(getString(payload, "nodeId"))} into a component.`
        : describeCreateNodeDetail("component", payload);
      break;
    case "figma.create_instance":
      title = "Insert component instance";
      detail = `Using source ${shortId(getString(payload, "componentId"))}.`;
      break;
    case "figma.create_text":
      title = `Create text ${quote(shortText(getString(payload, "text") ?? "Text", 28))}`;
      detail = describeCreateNodeDetail("text node", payload);
      break;
    case "figma.duplicate_node":
      title = "Duplicate node";
      detail = `Cloning node ${shortId(getString(payload, "nodeId"))}.`;
      break;
    case "figma.set_text":
      title = `Update text to ${quote(shortText(getString(payload, "text") ?? "", 30))}`;
      detail = `Editing text node ${shortId(getString(payload, "nodeId"))}.`;
      break;
    case "figma.apply_styles":
      title = "Apply shared styles";
      detail = `Updating style refs on node ${shortId(getString(payload, "nodeId"))}.`;
      break;
    case "figma.update_node_properties":
      title = "Update node properties";
      detail = `Patching ${countObjectKeys(asRecord(payload?.properties))} field(s) on ${shortId(getString(payload, "nodeId"))}.`;
      break;
    case "figma.set_instance_properties":
      title = "Update instance properties";
      detail = `Adjusting overrides on instance ${shortId(getString(payload, "nodeId"))}.`;
      break;
    case "figma.set_image_fill":
      title = "Set image fill";
      detail = `Applying an image fill to ${shortId(getString(payload, "nodeId"))}.`;
      break;
    case "figma.move_node":
      title = "Move node";
      detail = `Reparenting ${shortId(getString(payload, "nodeId"))} into ${shortId(getString(payload, "parentId"))}.`;
      break;
    case "figma.delete_node":
      title = "Delete node";
      detail = `Removing node ${shortId(getString(payload, "nodeId"))}.`;
      break;
    case "figma.batch_edit":
    case "figma.batch_edit_v2": {
      const opCount = Array.isArray(payload?.ops) ? payload.ops.length : 0;
      title = effect === "preview" ? "Preview batch edits" : "Apply batch edits";
      detail = `${opCount} batched operation(s) queued through ${request.type === "figma.batch_edit_v2" ? "v2" : "legacy"} batch mode.`;
      break;
    }
    case "figma.create_variable_collection":
      title = `Create variable collection ${quote(getString(payload, "name") ?? "Collection")}`;
      detail = "Adding a local variable collection to the current file.";
      break;
    case "figma.create_variable":
      title = `Create variable ${quote(getString(payload, "name") ?? "Variable")}`;
      detail = `Adding a ${String(payload?.resolvedType ?? "local")} variable.`;
      break;
    case "figma.bind_variable":
      title = getString(payload, "variableId") ? "Bind variable" : "Clear variable binding";
      detail = `Updating ${getString(payload, "field") ?? "field"} on ${shortId(getString(payload, "nodeId"))}.`;
      break;
    case "figma.normalize_names":
      title = effect === "preview" ? "Preview layer name cleanup" : "Normalize layer names";
      detail = `Scanning ${shortId(getString(payload, "nodeId"))} for naming cleanup.`;
      break;
    case "figma.create_spec_page":
      title = `Generate spec page ${quote(getString(payload, "name") ?? "Specs")}`;
      detail = "Building a summary page inside the current file.";
      break;
  }

  return {
    requestId: request.requestId,
    tool: request.type,
    title,
    detail,
    effect,
    status: "running",
    startedAt: Date.now()
  };
}

function describeResponseSummary(action: TrackedAction, response: ResponseEnvelope): string {
  if (!response.ok) {
    return response.error.message;
  }

  const result = asRecord(response.result);
  switch (action.tool) {
    case "figma.rename_node":
      return `Renamed layer to ${quote(getNestedString(result, ["node", "name"]) ?? "new name")}.`;
    case "figma.create_page":
      return `Created page ${quote(getNestedString(result, ["page", "name"]) ?? "Untitled")}.`;
    case "figma.create_frame":
    case "figma.create_rectangle":
    case "figma.create_component":
    case "figma.create_instance":
    case "figma.create_text":
      return `Created ${describeNodeResult(result)}.`;
    case "figma.duplicate_node":
      return `Duplicated into ${describeNodeResult(result)}.`;
    case "figma.set_text":
      return `Updated copy on ${quote(getNestedString(result, ["node", "name"]) ?? "text node")} to ${quote(shortText(getString(result, "text") ?? "", 38))}.`;
    case "figma.apply_styles":
      return `Applied ${countArray(result?.appliedFields)} style field(s) to ${quote(getNestedString(result, ["node", "name"]) ?? "node")}.`;
    case "figma.update_node_properties":
      return `Updated ${countArray(result?.updatedFields)} field(s) on ${quote(getNestedString(result, ["node", "name"]) ?? "node")}.`;
    case "figma.set_instance_properties":
      return `Updated ${countArray(result?.updatedFields)} instance field(s) on ${quote(getNestedString(result, ["node", "name"]) ?? "instance")}.`;
    case "figma.set_image_fill":
      return `Applied image fill to ${quote(getNestedString(result, ["node", "name"]) ?? "node")}.`;
    case "figma.move_node":
      return `Moved ${quote(getNestedString(result, ["node", "name"]) ?? "node")} into ${shortId(getString(result, "parentId"))}.`;
    case "figma.delete_node":
      return `Deleted ${quote(getString(result, "name") ?? "node")}.`;
    case "figma.batch_edit":
    case "figma.batch_edit_v2":
      return getString(result, "summary")
        ?? (action.effect === "preview" ? "Previewed batched changes." : "Applied batched changes.");
    case "figma.create_variable_collection":
      return `Created collection ${quote(getNestedString(result, ["collection", "name"]) ?? "Collection")}.`;
    case "figma.create_variable":
      return `Created variable ${quote(getNestedString(result, ["variable", "name"]) ?? "Variable")}.`;
    case "figma.bind_variable":
      return getString(result, "variableId")
        ? `Bound variable ${shortId(getString(result, "variableId"))} to ${getString(result, "field") ?? "field"}.`
        : `Cleared variable binding on ${getString(result, "field") ?? "field"}.`;
    case "figma.normalize_names": {
      const renamedCount = getNumber(result, "renamedCount");
      return action.effect === "preview"
        ? `Previewed ${renamedCount} potential layer rename(s).`
        : `Renamed ${renamedCount} layer(s).`;
    }
    case "figma.create_spec_page":
      return `Created spec page ${quote(getNestedString(result, ["page", "name"]) ?? "Specs")}.`;
    default:
      return action.effect === "preview" ? "Preview complete." : "Design change applied.";
  }
}

function renderConnection(): void {
  bridgeBadge.textContent = bridgeLabelForState(bridgeState);
  bridgeBadge.className = `badge ${bridgeClassForState(bridgeState)}`;
  statusMessage.textContent = bridgeMessage;
}

function renderCurrentAction(): void {
  const activeAction = getLatestPendingAction();

  if (activeAction) {
    renderActionEmptyState(false);
    currentBadge.textContent = activeAction.effect === "preview" ? "Previewing" : "Running";
    currentBadge.className = `badge ${activeAction.effect === "preview" ? "badge-preview" : "badge-running"}`;
    setActionPanelTone(activeAction.effect === "preview" ? "preview" : "running");
    currentTitle.textContent = activeAction.title;
    currentDetail.textContent = activeAction.detail;
    currentMeta.textContent = `Started ${formatTime(activeAction.startedAt)}.`;
    return;
  }

  currentBadge.textContent = "Idle";
  currentBadge.className = "badge badge-idle";

  if (lastCompletedAction) {
    renderActionEmptyState(false);
    setActionPanelTone(lastCompletedAction.status);
    currentTitle.textContent = "No active design action";
    currentDetail.textContent = lastCompletedAction.summary ?? lastCompletedAction.title;
    currentMeta.textContent = `Last ${statusLabel(lastCompletedAction.status).toLowerCase()} at ${formatTime(lastCompletedAction.finishedAt ?? lastCompletedAction.startedAt)}.`;
    return;
  }

  renderActionEmptyState(true);
  setActionPanelTone("idle");
  currentTitle.textContent = "Actions";
  currentDetail.textContent = "Nothing has been tracked in this session yet.";
  currentMeta.textContent = "Recent bridge activity will show up here.";
}

function renderHistory(): void {
  historyList.replaceChildren();

  if (history.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "history-empty";
    emptyItem.textContent = getLatestPendingAction() ? "No completed actions yet." : "No tracked actions yet.";
    historyList.appendChild(emptyItem);
    return;
  }

  for (const item of history) {
    const row = document.createElement("li");
    row.className = "history-item";

    const main = document.createElement("div");
    main.className = "history-main";

    const title = document.createElement("div");
    title.className = "history-title";
    title.textContent = item.title;

    main.append(title);

    const meta = document.createElement("div");
    meta.className = "history-meta";
    meta.textContent = `${statusLabel(item.status)} · ${formatTime(item.finishedAt ?? item.startedAt)}`;

    row.append(main, meta);
    historyList.appendChild(row);
  }
}

function renderContext(): void {
  contextGrid.replaceChildren();

  const entries: Array<[string, string]> = runtimeContext
    ? [
        ["Document", `${runtimeContext.fileName} / ${runtimeContext.pageName}`],
        ["Selection", `${runtimeContext.selectionCount} selected · ${runtimeContext.editorType}`],
        ["File", runtimeContext.fileKey ?? "Local draft"]
      ]
    : [
        ["Document", "Waiting for file"],
        ["Selection", "No active context"],
        ["File", "Local draft"]
      ];

  for (const [label, value] of entries) {
    const item = document.createElement("div");
    item.className = "context-item";

    const key = document.createElement("div");
    key.className = "context-label";
    key.textContent = label;

    const content = document.createElement("div");
    content.className = "context-value";
    content.textContent = value;

    item.append(key, content);
    contextGrid.appendChild(item);
  }
}

function getLatestPendingAction(): TrackedAction | null {
  let latestAction: TrackedAction | null = null;
  for (const action of pendingActions.values()) {
    if (!latestAction || action.startedAt > latestAction.startedAt) {
      latestAction = action;
    }
  }
  return latestAction;
}

function bridgeLabelForState(state: BridgeConnectionState): string {
  switch (state) {
    case "connecting":
      return "Connecting";
    case "connected":
      return "Connected";
    case "disconnected":
      return "Retrying";
    case "error":
      return "Error";
    default:
      return "Waiting";
  }
}

function bridgeClassForState(state: BridgeConnectionState): string {
  switch (state) {
    case "connected":
      return "badge-success";
    case "disconnected":
      return "badge-disconnected";
    case "error":
      return "badge-error";
    default:
      return "badge-idle";
  }
}

function badgeClassForAction(status: ActionStatus): string {
  switch (status) {
    case "success":
      return "badge-success";
    case "preview":
      return "badge-preview";
    case "failed":
      return "badge-failed";
    default:
      return "badge-running";
  }
}

function setActionPanelTone(state: ActionStatus | "idle"): void {
  actionsPanel.className = `panel actions-panel panel-tone-${state}`;
}

function renderActionEmptyState(isEmpty: boolean): void {
  actionsEmpty.classList.toggle("hidden", !isEmpty);
  historyList.hidden = isEmpty;
  const historyLabel = historyList.previousElementSibling;
  if (historyLabel instanceof HTMLElement) {
    historyLabel.hidden = isEmpty;
  }
}

function statusLabel(status: ActionStatus): string {
  switch (status) {
    case "success":
      return "Applied";
    case "preview":
      return "Preview";
    case "failed":
      return "Failed";
    default:
      return "Running";
  }
}

function describeCreateNodeDetail(nodeKind: string, payload: Record<string, unknown> | null): string {
  const parentId = shortId(getString(payload, "parentId"));
  return parentId ? `Creating a ${nodeKind} under ${parentId}.` : `Creating a ${nodeKind} on the current page.`;
}

function describeNodeResult(result: Record<string, unknown> | null): string {
  const nodeName = getNestedString(result, ["node", "name"]);
  const nodeType = getNestedString(result, ["node", "type"])?.toLowerCase();
  if (nodeName && nodeType) {
    return `${nodeType} ${quote(nodeName)}`;
  }
  if (nodeName) {
    return quote(nodeName);
  }
  return nodeType ?? "node";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getString(record: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getBoolean(record: Record<string, unknown> | null | undefined, key: string): boolean | undefined {
  const value = record?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function getNumber(record: Record<string, unknown> | null | undefined, key: string): number {
  const value = record?.[key];
  return typeof value === "number" ? value : 0;
}

function getNestedString(record: Record<string, unknown> | null, path: string[]): string | undefined {
  let current: unknown = record;
  for (const segment of path) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === "string" && current.length > 0 ? current : undefined;
}

function countObjectKeys(record: Record<string, unknown> | null | undefined): number {
  return record ? Object.keys(record).length : 0;
}

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function shortId(value: string | undefined): string {
  if (!value) {
    return "current page";
  }
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

function shortText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function quote(value: string): string {
  return `"${value}"`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}
