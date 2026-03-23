# Local Development

For the full end-to-end setup, health checks, and Codex / Trae MCP configuration, start with `docs/setup-and-mcp-manual.md`.

## Main Commands

```bash
npm install
npm run build
npm run start:local
```

Fast paths:

- `npm run dev:bridge`
- `npm run build:bridge`
- `npm run build:plugin`
- `npm run paths:local`
- `npm test`

macOS status bar app:

- `cd apps/bridge-manager-macos`
- `swift run`

## Running Locally

1. Build the repo.
2. Import `apps/figma-plugin/manifest.json` as a local plugin in Figma.
3. Start the plugin in the target file.
4. Keep the bridge process running.
5. Verify with `figma.get_session_status`.

If Codex should attach to an already running bridge, use the remote MCP endpoint:

- `http://localhost:<port>/mcp`

For older clients that still use the deprecated HTTP+SSE MCP transport, use:

- `http://localhost:<port>/sse`
  Then POST messages to the `http://localhost:<port>/messages?sessionId=<id>` URL from the SSE endpoint event.

### macOS Status Bar App

Use the Swift status bar app if you want to manage multiple bridge instances without manually running the shell wrapper.

From the repo root:

```bash
cd apps/bridge-manager-macos
swift run
```

The app can:

- keep a saved list of bridge instances
- auto-build the plugin and bridge before start
- start and stop multiple `apps/mcp-bridge/dist/index.js` processes
- reveal the generated manifest and log files for each instance

The app stores its state in `~/Library/Application Support/figma-auto/bridge-manager/state.json`.

When a bridge instance is running, Codex can connect to it as a remote MCP server at:

- `http://localhost:<instance-port>/mcp`
- `http://localhost:<instance-port>/sse` for legacy SSE clients

### Multiple Local Instances

Use separate local bridge instances when you want two Codex windows to control two different Figma files at the same time.

Example:

```bash
npm run start:local -- --instance marketing --port 4401
npm run start:local -- --instance product --port 4402
```

Each instance gets its own generated plugin bundle and manifest:

- `apps/figma-plugin/instances/marketing/manifest.json`
- `apps/figma-plugin/instances/product/manifest.json`

Import each manifest as a separate local plugin in Figma, then run the matching plugin inside the matching file.

Notes:

- `--instance` changes the generated plugin name, plugin ID placeholder, output directory, and default log paths.
- `--port` is optional but recommended when you run more than one bridge at once.
- If `--port` is omitted for a named instance, the wrapper derives a stable local port from the instance name.
- `npm run paths:local -- --instance marketing` prints the manifest and log paths for that instance.

## Environment Variables

Bridge runtime:

- `FIGMA_AUTO_BRIDGE_HOST`
- `FIGMA_AUTO_BRIDGE_PORT`
- `FIGMA_AUTO_BRIDGE_PUBLIC_WS_URL`
- `FIGMA_AUTO_BRIDGE_PUBLIC_HTTP_URL`
- `FIGMA_AUTO_AUDIT_LOG_PATH`
- `FIGMA_AUTO_BRIDGE_LOG_PATH`

Plugin build:

- `FIGMA_AUTO_BRIDGE_WS_URL`
- `FIGMA_AUTO_BRIDGE_HTTP_URL`
- `FIGMA_AUTO_BRIDGE_PORT`
- `FIGMA_AUTO_FIGMA_PLUGIN_ID`
- `FIGMA_AUTO_LOCAL_INSTANCE`

If you change plugin bridge URL settings, rebuild the plugin bundle.
For local plugin development, use `localhost` URLs, not `127.0.0.1`.
Figma rejects `devAllowedDomains` entries like `http://127.0.0.1:4318`, so the generated manifest should use `http://localhost:4318` and `ws://localhost:4318`.
The wrapper script already defaults local runs to `localhost`; if you start the bridge directly, override `FIGMA_AUTO_BRIDGE_HOST` as needed because the bridge process itself defaults to `127.0.0.1`.

## Logs

- bridge stdout: `logs/bridge.log`
- audit log: `logs/audit.ndjson`

## Troubleshooting

- `missing_session`
  Usually means the plugin is not running, could not connect, or was replaced by another plugin session.

- Wrong host or port
  Rebuild the plugin after changing bridge URL env vars. For local runs, prefer `localhost` over `127.0.0.1`.

- Multiple local plugins collide
  Give each bridge its own `--instance` name and port, and import the generated manifest from the matching `instances/<name>/manifest.json` path. The status bar app handles this automatically per instance.

- MCP startup says `startup incomplete` or logs `EADDRINUSE`
  Do not keep a menu bar app or `npm run start:local` bridge running for the same instance/port that your MCP client is configured to launch.
  MCP clients should either start `apps/mcp-bridge/dist/index.js` directly or connect to the already running bridge at `http://localhost:<port>/mcp`.
  Older SSE-only clients should connect to `http://localhost:<port>/sse` instead of `/mcp`.
  If you want multiple clients/files at once, give each client its own instance name and port, then import the matching generated plugin manifest.

- Menu bar app is already running the bridge and Codex still cannot see tools
  Switch Codex from a `command`-based MCP config to a remote `url` config that points at `http://localhost:<port>/mcp`.
  The plugin still uses `ws://localhost:<port>`, but Codex should use the HTTP MCP endpoint.

- Menu bar app cannot find `node` or `npm`
  The app launches commands through `zsh -lc`, so make sure your Node toolchain is available from your normal login shell environment.

- Mutating tool fails inside Figma
  Check `logs/bridge.log`, `logs/audit.ndjson`, and the plugin UI connection state.
