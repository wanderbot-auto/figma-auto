import esbuild from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";

const pluginRoot = path.resolve(import.meta.dirname, "..");
const uiTemplatePath = path.join(pluginRoot, "ui", "index.html");
const manifestTemplatePath = path.join(pluginRoot, "manifest.template.json");
const protocolMessagesPath = path.resolve(pluginRoot, "../../packages/protocol/src/messages.ts");
const instanceName = resolveInstanceName(process.env.FIGMA_AUTO_LOCAL_INSTANCE);
const outputRoot = instanceName ? path.join(pluginRoot, "instances", instanceName) : pluginRoot;
const distDir = path.join(outputRoot, "dist");
const manifestPath = path.join(outputRoot, "manifest.json");

async function readProtocolConstants() {
  const protocolSource = await fs.readFile(protocolMessagesPath, "utf8");
  const bridgePortMatch = protocolSource.match(/export const BRIDGE_PORT = (\d+);/);
  const protocolVersionMatch = protocolSource.match(/export const PROTOCOL_VERSION = "([^"]+)";/);

  if (!bridgePortMatch || !protocolVersionMatch) {
    throw new Error(`Unable to resolve protocol constants from ${protocolMessagesPath}`);
  }

  return {
    defaultBridgePort: Number.parseInt(bridgePortMatch[1], 10),
    protocolVersion: protocolVersionMatch[1]
  };
}

function resolveConfiguredBridgePort(defaultPort) {
  const configuredPort = Number.parseInt(process.env.FIGMA_AUTO_BRIDGE_PORT ?? `${defaultPort}`, 10);
  return Number.isNaN(configuredPort) ? defaultPort : configuredPort;
}

function resolveBridgeWsUrl(bridgePort) {
  return process.env.FIGMA_AUTO_BRIDGE_WS_URL ?? `ws://localhost:${bridgePort}`;
}

function resolveBridgeHttpUrl(bridgeWsUrl) {
  if (process.env.FIGMA_AUTO_BRIDGE_HTTP_URL) {
    return process.env.FIGMA_AUTO_BRIDGE_HTTP_URL;
  }

  const wsUrl = new URL(bridgeWsUrl);
  if (wsUrl.protocol === "ws:") {
    wsUrl.protocol = "http:";
    return wsUrl.toString().replace(/\/$/, "");
  }
  if (wsUrl.protocol === "wss:") {
    wsUrl.protocol = "https:";
    return wsUrl.toString().replace(/\/$/, "");
  }

  throw new Error(`Unsupported bridge websocket protocol in ${bridgeWsUrl}`);
}

function isLocalBridgeUrl(rawUrl) {
  const url = new URL(rawUrl);
  return ["localhost", "127.0.0.1"].includes(url.hostname);
}

function canonicalizeLocalUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (isLocalBridgeUrl(rawUrl)) {
    url.hostname = "localhost";
  }
  return url.toString().replace(/\/$/, "");
}

function resolvePluginId() {
  return process.env.FIGMA_AUTO_FIGMA_PLUGIN_ID ?? defaultPluginId();
}

function resolveInstanceName(rawValue) {
  if (!rawValue) {
    return "";
  }

  const normalized = rawValue.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "");
}

function defaultPluginId() {
  if (!instanceName) {
    return "REPLACE_WITH_FIGMA_PLUGIN_ID";
  }

  return `LOCAL_FIGMA_AUTO_${instanceName.replace(/[^a-z0-9]+/g, "_").toUpperCase()}`;
}

function resolvePluginName(baseName) {
  return instanceName ? `${baseName} (${instanceName})` : baseName;
}

function resolveBridgeName() {
  const explicitName = process.env.FIGMA_AUTO_BRIDGE_NAME?.trim();
  if (explicitName) {
    return explicitName;
  }

  return instanceName || "default";
}

await fs.mkdir(distDir, { recursive: true });

const { defaultBridgePort, protocolVersion } = await readProtocolConstants();
const bridgePort = resolveConfiguredBridgePort(defaultBridgePort);
const bridgeWsUrl = canonicalizeLocalUrl(resolveBridgeWsUrl(bridgePort));
const bridgeHttpUrl = canonicalizeLocalUrl(resolveBridgeHttpUrl(bridgeWsUrl));
const bridgeName = resolveBridgeName();
const manifestTemplate = JSON.parse(await fs.readFile(manifestTemplatePath, "utf8"));
const allowedDomains = [bridgeHttpUrl, bridgeWsUrl];
const manifest = {
  ...manifestTemplate,
  name: resolvePluginName(manifestTemplate.name),
  id: resolvePluginId(),
  networkAccess: {
    ...manifestTemplate.networkAccess,
    allowedDomains: isLocalBridgeUrl(bridgeWsUrl) ? ["none"] : allowedDomains,
    devAllowedDomains: isLocalBridgeUrl(bridgeWsUrl) ? allowedDomains : []
  }
};

await esbuild.build({
  entryPoints: [path.join(pluginRoot, "src", "code.ts")],
  bundle: true,
  outfile: path.join(distDir, "code.js"),
  format: "iife",
  platform: "browser",
  // Figma's runtime chokes on newer syntax such as object spread in bundled deps.
  target: ["es2017"]
});

await esbuild.build({
  entryPoints: [path.join(pluginRoot, "ui", "main.ts")],
  bundle: true,
  outfile: path.join(distDir, "ui.js"),
  format: "iife",
  platform: "browser",
  target: ["es2017"],
  define: {
    __FIGMA_AUTO_BRIDGE_NAME__: JSON.stringify(bridgeName),
    __FIGMA_AUTO_BRIDGE_PORT__: `${bridgePort}`,
    __FIGMA_AUTO_BRIDGE_HTTP_URL__: JSON.stringify(bridgeHttpUrl),
    __FIGMA_AUTO_BRIDGE_WS_URL__: JSON.stringify(bridgeWsUrl),
    __FIGMA_AUTO_PROTOCOL_VERSION__: JSON.stringify(protocolVersion)
  }
});

const uiTemplate = await fs.readFile(uiTemplatePath, "utf8");
const uiScript = await fs.readFile(path.join(distDir, "ui.js"), "utf8");
const uiHtml = uiTemplate.replace("__FIGMA_AUTO_UI_SCRIPT__", () => uiScript);

await fs.writeFile(path.join(distDir, "ui.html"), uiHtml, "utf8");
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
