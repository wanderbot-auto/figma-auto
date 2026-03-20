#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const logsDir = path.join(rootDir, "logs");
const bridgeEntryPath = path.join(rootDir, "apps", "mcp-bridge", "dist", "index.js");
const pluginRoot = path.join(rootDir, "apps", "figma-plugin");
const protocolMessagesPath = path.join(rootDir, "packages", "protocol", "src", "messages.ts");

let printConfigOnly = false;
let skipBuild = false;
let requestedInstance = process.env.FIGMA_AUTO_LOCAL_INSTANCE ?? "";
let requestedPort = process.env.FIGMA_AUTO_BRIDGE_PORT ?? "";

for (let index = 0; index < process.argv.length - 2; index += 1) {
  const arg = process.argv[index + 2];
  if (arg === "--print-config") {
    printConfigOnly = true;
    continue;
  }
  if (arg === "--skip-build") {
    skipBuild = true;
    continue;
  }
  if (arg === "--instance") {
    requestedInstance = process.argv[index + 3] ?? "";
    index += 1;
    continue;
  }
  if (arg.startsWith("--instance=")) {
    requestedInstance = arg.slice("--instance=".length);
    continue;
  }
  if (arg === "--port") {
    requestedPort = process.argv[index + 3] ?? "";
    index += 1;
    continue;
  }
  if (arg.startsWith("--port=")) {
    requestedPort = arg.slice("--port=".length);
    continue;
  }
  console.error(`Unknown argument: ${arg}`);
  process.exit(1);
}

function formatPath(targetPath) {
  const relativePath = path.relative(rootDir, targetPath);
  if (!relativePath || relativePath === "") {
    return ".";
  }
  if (!relativePath.startsWith("..")) {
    return relativePath.split(path.sep).join("/");
  }
  return targetPath;
}

async function resolveDefaultBridgePort() {
  const protocolSource = await readFile(protocolMessagesPath, "utf8");
  const bridgePortMatch = protocolSource.match(/^export const BRIDGE_PORT = (\d+);$/m);
  if (!bridgePortMatch) {
    throw new Error(`Unable to resolve BRIDGE_PORT from ${protocolMessagesPath}`);
  }
  return Number.parseInt(bridgePortMatch[1], 10);
}

function resolveInstanceName(rawValue) {
  if (!rawValue) {
    return "";
  }

  const normalized = rawValue.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "");
}

function deriveInstancePort(defaultPort, instanceName) {
  let hash = 0;
  for (const character of instanceName) {
    hash = (hash * 31 + character.charCodeAt(0)) % 1000;
  }
  return defaultPort + 1 + hash;
}

function resolvePluginPaths(instanceName) {
  if (!instanceName) {
    return {
      manifestPath: path.join(pluginRoot, "manifest.json"),
      pluginDistDir: path.join(pluginRoot, "dist")
    };
  }

  const instanceRoot = path.join(pluginRoot, "instances", instanceName);
  return {
    manifestPath: path.join(instanceRoot, "manifest.json"),
    pluginDistDir: path.join(instanceRoot, "dist")
  };
}

function printConfig(config) {
  console.log("Local Figma bridge config:");
  console.log(`- instance: ${config.instanceName || "default"}`);
  console.log(`- manifest: ${formatPath(config.manifestPath)}`);
  console.log(`- plugin dist: ${formatPath(config.pluginDistDir)}`);
  console.log(`- bridge entry: ${formatPath(bridgeEntryPath)}`);
  console.log(`- bridge stdout log: ${formatPath(config.bridgeLogPath)}`);
  console.log(`- audit log: ${formatPath(config.auditLogPath)}`);
  console.log(`- websocket url: ${config.bridgeWsUrl}`);
  console.log(`- http url: ${config.bridgeHttpUrl}`);
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: options.stdio
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited with signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${command} exited with code ${code ?? 1}`));
        return;
      }
      resolve();
    });
  });
}

function signalExitCode(signal) {
  if (signal === "SIGINT") {
    return 130;
  }
  if (signal === "SIGTERM") {
    return 143;
  }
  return 1;
}

const defaultBridgePort = await resolveDefaultBridgePort();
const instanceName = resolveInstanceName(requestedInstance);
const fallbackBridgePort = instanceName ? deriveInstancePort(defaultBridgePort, instanceName) : defaultBridgePort;
const bridgePort = Number.parseInt(requestedPort || `${fallbackBridgePort}`, 10);
const resolvedBridgePort = Number.isNaN(bridgePort) ? defaultBridgePort : bridgePort;
const bridgeHost = process.env.FIGMA_AUTO_BRIDGE_HOST ?? "localhost";
const bridgeWsUrl = process.env.FIGMA_AUTO_BRIDGE_PUBLIC_WS_URL ?? `ws://${bridgeHost}:${resolvedBridgePort}`;
const bridgeHttpUrl =
  process.env.FIGMA_AUTO_BRIDGE_PUBLIC_HTTP_URL
  ?? bridgeWsUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
const instanceLogDir = instanceName ? path.join(logsDir, instanceName) : logsDir;
const bridgeLogPath = process.env.FIGMA_AUTO_BRIDGE_LOG_PATH ?? path.join(instanceLogDir, "bridge.log");
const auditLogPath = process.env.FIGMA_AUTO_AUDIT_LOG_PATH ?? path.join(instanceLogDir, "audit.ndjson");
const { manifestPath, pluginDistDir } = resolvePluginPaths(instanceName);

const config = {
  auditLogPath,
  bridgeHttpUrl,
  bridgeLogPath,
  instanceName,
  manifestPath,
  pluginDistDir,
  bridgePort: resolvedBridgePort,
  bridgeWsUrl
};

await mkdir(instanceLogDir, { recursive: true });
printConfig(config);

if (printConfigOnly) {
  process.exit(0);
}

if (!skipBuild) {
  console.log("\nBuilding plugin and bridge...");
  await runCommand(
    npmCommand(),
    ["run", "build"],
    {
      cwd: rootDir,
      env: {
        ...process.env,
        FIGMA_AUTO_LOCAL_INSTANCE: instanceName,
        FIGMA_AUTO_BRIDGE_PORT: `${resolvedBridgePort}`,
        FIGMA_AUTO_BRIDGE_WS_URL: bridgeWsUrl,
        FIGMA_AUTO_BRIDGE_HTTP_URL: bridgeHttpUrl
      },
      stdio: "inherit"
    }
  );
}

console.log("\nStarting local MCP bridge...");
console.log("Press Ctrl+C to stop.\n");

const logStream = createWriteStream(bridgeLogPath, { flags: "a" });
const bridgeProcess = spawn(process.execPath, [bridgeEntryPath], {
  cwd: rootDir,
  env: {
    ...process.env,
    FIGMA_AUTO_LOCAL_INSTANCE: instanceName,
    FIGMA_AUTO_BRIDGE_PORT: `${resolvedBridgePort}`,
    FIGMA_AUTO_BRIDGE_HOST: bridgeHost,
    FIGMA_AUTO_BRIDGE_PUBLIC_WS_URL: bridgeWsUrl,
    FIGMA_AUTO_BRIDGE_PUBLIC_HTTP_URL: bridgeHttpUrl,
    FIGMA_AUTO_AUDIT_LOG_PATH: auditLogPath
  },
  stdio: ["inherit", "pipe", "pipe"]
});

let stoppedBySignal = null;

function writeChunk(stream, chunk) {
  stream.write(chunk);
  logStream.write(chunk);
}

bridgeProcess.stdout.on("data", (chunk) => writeChunk(process.stdout, chunk));
bridgeProcess.stderr.on("data", (chunk) => writeChunk(process.stderr, chunk));
bridgeProcess.on("error", (error) => {
  console.error(`Failed to start bridge: ${error.message}`);
  logStream.end(() => process.exit(1));
});

function stopBridge(signal) {
  if (bridgeProcess.exitCode !== null || bridgeProcess.signalCode !== null) {
    return;
  }
  stoppedBySignal = signal;
  bridgeProcess.kill(signal);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => stopBridge(signal));
}

bridgeProcess.on("close", (code, signal) => {
  const exitCode =
    stoppedBySignal ? signalExitCode(stoppedBySignal)
    : signal ? signalExitCode(signal)
    : code ?? 1;
  logStream.end(() => process.exit(exitCode));
});
