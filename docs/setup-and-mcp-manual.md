# figma-auto Complete Setup Manual

This manual covers three things:

1. How to build and start `figma-auto` correctly.
2. How to connect the Figma local plugin to the bridge and verify that the session is healthy.
3. How to configure `figma-auto` as an MCP server in Codex and Trae.

For normal macOS product usage, prefer the bundled menu bar app path in `docs/macos-menu-bar-app.md`. The repository-centric commands below are primarily for development and release engineering.

## 1. Prerequisites

- macOS or Windows for normal local development. The macOS menu bar app is macOS-only.
- Node.js and npm available in your login shell.
- Figma Desktop installed.
- For the menu bar app: Swift toolchain available from the command line.

From the repo root:

```bash
npm install
npm run build
```

Main package roles:

- `packages/protocol`: shared protocol constants, types, and Zod schemas
- `apps/mcp-bridge`: MCP bridge, HTTP MCP endpoint, legacy SSE endpoint, local WebSocket bridge
- `apps/figma-plugin`: local Figma plugin that actually executes the requests
- `apps/bridge-manager-macos`: optional macOS menu bar app for managing multiple bridge instances

## 2. Fastest Correct Local Startup

Default single-instance flow:

```bash
npm install
npm run build
npm run start:local
```

What this does:

- builds protocol, bridge, and plugin
- generates the plugin manifest and bundle
- starts the local bridge
- prints the manifest path, log path, port, and MCP endpoint

Useful helper commands:

```bash
npm run dev:bridge
npm run build:bridge
npm run build:plugin
npm run paths:local
npm test
```

## 3. Import and Run the Figma Plugin

After `npm run build` or `npm run start:local`:

1. Open Figma Desktop.
2. Import the local plugin manifest.
3. For the default instance, use `apps/figma-plugin/manifest.json`.
4. Run the plugin inside the target Figma file.
5. Keep the bridge process running while the plugin is active.

For named instances, import the matching manifest instead:

- `apps/figma-plugin/instances/<instance-name>/manifest.json`

Important:

- Prefer `localhost`, not `127.0.0.1`, in plugin-facing URLs.
- Figma local plugin manifest allowlists do not reliably work with `127.0.0.1`.
- The wrapper script already uses `localhost` for local plugin URLs.

## 4. How Ports and URLs Actually Work

There are two URL layers in this project:

- Plugin build-time URLs:
  - `FIGMA_AUTO_BRIDGE_WS_URL`
  - `FIGMA_AUTO_BRIDGE_HTTP_URL`
- Bridge runtime public URLs:
  - `FIGMA_AUTO_BRIDGE_PUBLIC_WS_URL`
  - `FIGMA_AUTO_BRIDGE_PUBLIC_HTTP_URL`

Keep them aligned to the same host and port.

Default bridge port:

- `4318`

Named instances:

- If you pass `--instance <name>` and do not pass `--port`, the wrapper derives a stable port from the instance name.
- Do not assume a menu-bar-managed or named instance still uses `4318`.
- Always verify the real port with `npm run paths:local -- --instance <name>` or in the menu bar app.

Examples:

```bash
npm run paths:local
npm run paths:local -- --instance figma
npm run start:local -- --instance marketing --port 4401
```

## 5. Multi-Instance Startup

Use this when you want multiple Figma files or multiple MCP clients at the same time.

```bash
npm run start:local -- --instance marketing --port 4401
npm run start:local -- --instance product --port 4402
```

Each instance gets its own:

- plugin manifest
- plugin bundle
- bridge log
- audit log

Per-instance output lives under:

- `apps/figma-plugin/instances/<name>/`
- `logs/<name>/`

## 6. macOS Menu Bar App

Run it from the repo:

```bash
cd apps/bridge-manager-macos
swift run
```

What it manages:

- persistent bridge instance list
- per-instance plugin generation
- start and stop of multiple bridge processes
- per-instance logs
- quick reveal of manifests and logs

State file:

- `~/Library/Application Support/figma-auto/bridge-manager/state.json`

If the menu bar app is already running a bridge instance, do not also configure Codex or Trae to launch a second bridge on the same port. In that case, connect the client to the existing HTTP MCP endpoint instead.

## 7. Health Checks

### Check from MCP

The fastest logical check is:

- call `figma.get_session_status`

Healthy output should show:

- `connected: true`
- the active `session`
- the expected `host`, `port`, and public URLs

### Check from HTTP

Current bridge endpoint:

- `http://localhost:<port>/mcp`

Legacy endpoints still exposed for compatibility:

- `http://localhost:<port>/sse`
- `http://localhost:<port>/messages`

A plain `GET /mcp` without an MCP session usually returns `405 Method Not Allowed`. That is normal.

A real initialize request looks like this:

```bash
curl -sS http://127.0.0.1:<port>/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"manual-check","version":"1.0"}}}'
```

Expected success shape:

```json
{
  "result": {
    "protocolVersion": "2025-03-26",
    "capabilities": {
      "tools": { "listChanged": true },
      "resources": { "listChanged": true }
    },
    "serverInfo": {
      "name": "figma-auto-bridge",
      "version": "0.1.0"
    }
  },
  "jsonrpc": "2.0",
  "id": 1
}
```

### Check local logs

Default instance:

- `logs/bridge.log`
- `logs/audit.ndjson`

Named instance:

- `logs/<instance>/bridge.log`
- `logs/<instance>/audit.ndjson`

## 8. Recommended Codex Configuration

Recommended rule:

- If the bridge is already running, use remote URL mode.
- Only use command-launch mode when Codex itself should own the bridge process.

### Option A: Codex remote HTTP MCP mode

This is the correct setup when:

- you started the bridge with `npm run start:local`
- the macOS menu bar app already manages the instance
- you want Codex to attach to an existing bridge

CLI:

```bash
codex mcp add figma_auto_bridge --url http://localhost:4318/mcp
```

Config file:

```toml
[mcp_servers.figma_auto_bridge]
url = "http://localhost:4318/mcp"
```

Verify:

```bash
codex mcp list
codex mcp get figma_auto_bridge
```

For the productized menu bar app, this is the only end-user MCP configuration you should document:

```toml
[mcp_servers.figma_auto_bridge]
url = "http://localhost:<port>/mcp"
```

### Option B: Codex command-launch mode

This is the correct setup when Codex should start the bridge itself.

CLI:

```bash
codex mcp add figma_auto_bridge \
  --env FIGMA_AUTO_BRIDGE_HOST=localhost \
  --env FIGMA_AUTO_BRIDGE_PORT=4318 \
  --env FIGMA_AUTO_BRIDGE_PUBLIC_WS_URL=ws://localhost:4318 \
  --env FIGMA_AUTO_BRIDGE_PUBLIC_HTTP_URL=http://localhost:4318 \
  -- node /ABS/PATH/TO/apps/mcp-bridge/dist/index.js
```

Equivalent `~/.codex/config.toml`:

```toml
[mcp_servers.figma_auto_bridge]
command = "node"
args = ["/ABS/PATH/TO/apps/mcp-bridge/dist/index.js"]

[mcp_servers.figma_auto_bridge.env]
FIGMA_AUTO_BRIDGE_HOST = "localhost"
FIGMA_AUTO_BRIDGE_PORT = "4318"
FIGMA_AUTO_BRIDGE_PUBLIC_HTTP_URL = "http://localhost:4318"
FIGMA_AUTO_BRIDGE_PUBLIC_WS_URL = "ws://localhost:4318"
```

Notes:

- Build the repo before using command mode: `npm run build`
- The plugin must still be imported and running inside Figma.
- Do not use command mode if another bridge is already listening on that port.

## 9. Recommended Trae Configuration

According to the current Trae IDE documentation, MCP supports:

- `stdio`
- `SSE`
- `Streamable HTTP`

For `figma-auto`, prefer streamable HTTP (`/mcp`) for current Trae versions.

### Option A: Trae HTTP mode

Use this when the bridge is already running.

JSON config:

```json
{
  "mcpServers": {
    "figma-auto-bridge": {
      "url": "http://localhost:4318/mcp"
    }
  }
}
```

Trae manual-add path:

1. Open `Settings`.
2. Open `MCP`.
3. Choose `Add > Add Manually`.
4. Paste the JSON config.

### Option B: Trae stdio mode

Use this when Trae should launch the bridge itself.

JSON config:

```json
{
  "mcpServers": {
    "figma-auto-bridge": {
      "command": "node",
      "args": [
        "/ABS/PATH/TO/apps/mcp-bridge/dist/index.js"
      ],
      "env": {
        "FIGMA_AUTO_BRIDGE_HOST": "localhost",
        "FIGMA_AUTO_BRIDGE_PORT": "4318",
        "FIGMA_AUTO_BRIDGE_PUBLIC_WS_URL": "ws://localhost:4318",
        "FIGMA_AUTO_BRIDGE_PUBLIC_HTTP_URL": "http://localhost:4318"
      }
    }
  }
}
```

Trae-specific rules from the official docs:

- `command` must be the executable itself and must not contain spaces
- every `args` item must be a string
- every `env` value must be a string
- `${workspaceFolder}` is supported in command arguments and file paths

Example with `${workspaceFolder}`:

```json
{
  "mcpServers": {
    "figma-auto-bridge": {
      "command": "node",
      "args": [
        "${workspaceFolder}/apps/mcp-bridge/dist/index.js"
      ],
      "env": {
        "FIGMA_AUTO_BRIDGE_HOST": "localhost",
        "FIGMA_AUTO_BRIDGE_PORT": "4318",
        "FIGMA_AUTO_BRIDGE_PUBLIC_WS_URL": "ws://localhost:4318",
        "FIGMA_AUTO_BRIDGE_PUBLIC_HTTP_URL": "http://localhost:4318"
      }
    }
  }
}
```

### Project-level Trae config

Trae also supports project-level MCP loading from:

- `.trae/mcp.json`

This is useful when you want the project to carry its own MCP setup.

## 10. Legacy SSE Compatibility

`figma-auto` still exposes legacy HTTP+SSE MCP compatibility endpoints:

- `http://localhost:<port>/sse`
- `http://localhost:<port>/messages?sessionId=<id>`

Use these only if your MCP client version cannot work with streamable HTTP `/mcp`.

## 11. Troubleshooting

### `missing_session`

Usually means one of these:

- the Figma plugin is not running
- the plugin is running in a different file than you expect
- another plugin session replaced the current one
- the bridge port in the plugin manifest does not match the bridge port actually running

### `EADDRINUSE`

Usually means one of these:

- another `npm run start:local` process is already using that port
- the macOS menu bar app is already managing that instance
- Codex or Trae is trying to launch a second bridge for a port that already has one

Fix:

- stop the conflicting process
- or change the instance name / port
- or switch the MCP client from `command` mode to remote `url` mode

### MCP client connects but tools are missing

Check:

- `figma.get_session_status`
- bridge logs
- whether the plugin is actually attached
- whether you are pointing to the correct port

### Plugin imported but cannot connect

Check:

- plugin was built for `localhost`, not `127.0.0.1`
- the bridge port used by the plugin matches the running bridge
- you rebuilt the plugin after changing bridge URL settings

### Menu bar app cannot find `node` or `npm`

The app launches through `zsh -lc`. Make sure your login shell can resolve `node` and `npm`.

### Swift tests fail locally in `apps/bridge-manager-macos`

In this repository, `swift build` succeeds, but `swift test` can fail on hosts with a Swift toolchain / SDK mismatch or a restricted module cache directory. If you see messages about:

- SDK built with one Swift version but compiler is another
- module cache access failures under `~/.cache/clang/ModuleCache`

fix the host toolchain first, then rerun:

```bash
cd apps/bridge-manager-macos
swift test
```

## 12. Recommended Validation Sequence

Use this exact order:

1. `npm install`
2. `npm run build`
3. `npm run start:local`
4. Import the generated plugin manifest into Figma Desktop
5. Run the plugin in the target file
6. Call `figma.get_session_status`
7. Only then connect Codex or Trae
8. Run `figma.ping`
9. Run a read-only tool like `figma.get_selection`
10. Run a dry-run write tool before committed writes

## 13. Documentation Sources

Primary references used for this manual:

- OpenAI Docs MCP for Codex CLI and `~/.codex/config.toml`: `https://platform.openai.com/docs/docs-mcp`
- Trae MCP overview: `https://docs.trae.ai/ide/model-context-protocol?_lang=en`
- Trae manual add and `mcp.json` configuration: `https://docs.trae.ai/ide/add-mcp-servers?_lang=en`

Local verification used for this repository:

- `codex mcp --help`
- `codex mcp add --help`
- generated local Codex config examples from `codex mcp add`
- repository scripts and source code under `scripts/`, `apps/mcp-bridge/`, `apps/figma-plugin/`, and `apps/bridge-manager-macos/`
