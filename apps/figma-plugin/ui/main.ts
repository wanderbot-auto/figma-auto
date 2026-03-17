import type { PluginToUiMessage } from "./types.js";
import { BridgeTransport } from "./transport.js";

const statusElement = document.getElementById("status");
const detailsElement = document.getElementById("details");
const reconnectButton = document.getElementById("reconnect");

if (!statusElement || !detailsElement || !(reconnectButton instanceof HTMLButtonElement)) {
  throw new Error("Plugin UI failed to initialize");
}

statusElement.textContent = "UI script booted. Waiting for plugin context...";
detailsElement.textContent = "UI runtime initialized.";

window.addEventListener("error", (event) => {
  statusElement.textContent = "UI runtime error";
  detailsElement.textContent = event.error instanceof Error ? event.error.stack ?? event.error.message : String(event.message);
});

const transport = new BridgeTransport(
  (message) => {
    statusElement.textContent = message;
  },
  (request) => {
    parent.postMessage({ pluginMessage: { type: "bridge.request", request } }, "*");
  }
);

window.onmessage = (event: MessageEvent<{ pluginMessage?: PluginToUiMessage }>) => {
  const message = event.data.pluginMessage;
  if (!message) {
    return;
  }

  if (message.type === "plugin.context") {
    detailsElement.textContent = JSON.stringify(message.context, null, 2);
    transport.updateContext(message.context);
    return;
  }

  if (message.type === "bridge.response") {
    transport.forwardResponse(message.response);
  }
};

reconnectButton.addEventListener("click", () => transport.reconnect());
parent.postMessage({ pluginMessage: { type: "ui.ready" } }, "*");
