# Figma Plugin + MCP Bridge Project Plan

Last updated: 2026-03-17

Status: archived as the original consolidated planning document. Active working docs now live in:

- `docs/architecture.md`
- `docs/roadmap.md`
- `docs/dev-readiness.md`
- `docs/local-dev.md`

## Goal

Build a private Figma Design plugin that can read and write the current design file, then expose those capabilities to Codex through a local MCP bridge.

This is the recommended architecture:

```text
Codex MCP client
  -> local MCP bridge
  -> Figma plugin UI iframe
  -> Figma plugin main thread
  -> Figma document scene
```

## What This Project Must Do

1. Read the current file, page, selection, and node tree from Figma.
2. Apply controlled write operations such as rename, create page, create frame, create text, move node, and batch edit.
3. Expose those operations as MCP tools for Codex.
4. Keep all document writes inside the Figma Plugin API, not through UI automation.
5. Support local development in the Figma desktop app.

## Confirmed Figma Constraints

These are directly supported by Figma official docs:

- Plugins can read and write Figma Design files through the Plugin API.
- Plugin main code can access the Figma scene but not browser APIs.
- Plugin UI runs in an iframe and can use browser APIs.
- Main thread and UI iframe communicate via `postMessage`.
- Plugins do not run in the background; a user must run them.
- Dev Mode plugins are read-only and are not suitable for document mutation.
- Figma desktop supports importing a local plugin from `manifest.json`.

Official references:

- Plugin API intro: https://developers.figma.com/docs/plugins
- How plugins run: https://developers.figma.com/docs/plugins/how-plugins-run/
- Creating UI and message passing: https://developers.figma.com/docs/plugins/creating-ui/
- Plugin manifest: https://developers.figma.com/docs/plugins/manifest/
- Create plugin for development: https://help.figma.com/hc/en-us/articles/360042786733-Create-a-plugin-for-development
- Import plugin from manifest example: https://help.figma.com/hc/en-us/articles/38457121114263-Create-a-Figma-Design-plugin-with-the-Figma-MCP-server-and-agentic-tools

## Key Architectural Decision

Do not try to make the plugin itself the MCP server.

Reason:

- MCP transports are `stdio` or HTTP-based.
- Figma plugin main code is sandboxed and is not a general process host.
- The plugin cannot run persistently in the background.
- The plugin UI iframe can make network requests, but document access still lives in the plugin main thread.

This means the stable design is:

```text
Figma plugin
  = document access and mutations

Local bridge
  = MCP server, session manager, schema validator, logging, batching
```

This architecture choice is an inference from the official runtime model above.

## Recommended Repository Layout

Create a new repo, for example `figma-mcp-bridge`.

```text
figma-mcp-bridge/
  apps/
    figma-plugin/
      manifest.json
      src/
        code.ts
        types.ts
        handlers/
          session.ts
          read.ts
          write.ts
          batch.ts
      ui/
        index.html
        main.ts
        transport.ts
        types.ts
    mcp-bridge/
      package.json
      src/
        index.ts
        server.ts
        transport/
          websocket.ts
          streamable-http.ts
        tools/
          get-file.ts
          list-pages.ts
          get-selection.ts
          get-node-tree.ts
          rename-node.ts
          create-page.ts
          set-text.ts
          batch-edit.ts
        session/
          plugin-session-store.ts
        schema/
          tool-schemas.ts
          protocol.ts
        logging/
          audit-log.ts
  packages/
    protocol/
      src/
        messages.ts
        zod.ts
  docs/
    architecture.md
    protocol.md
    local-dev.md
```

## Technology Choices

Use TypeScript end to end for v1.

- Plugin main thread: TypeScript
- Plugin UI iframe: TypeScript + minimal HTML
- MCP bridge: TypeScript on Node.js
- Validation: `zod`
- WebSocket bridge between plugin UI and local daemon
- MCP transport: start with `stdio`, optionally add Streamable HTTP later

## Why WebSocket Between Plugin UI and Local Bridge

The Figma UI iframe can use browser APIs and can talk to a local bridge if allowed in `networkAccess.devAllowedDomains`.

Use:

- `ws://localhost:4318` for local dev
- optional remote HTTPS endpoint later if needed

Do not connect the plugin main thread directly to the bridge. Keep all external communication in the UI iframe and forward commands through message passing.

## Manifest Baseline

Start with a Design plugin, not a Dev Mode plugin.

```json
{
  "name": "Figma MCP Bridge",
  "id": "REPLACE_WITH_FIGMA_PLUGIN_ID",
  "api": "1.0.0",
  "editorType": ["figma"],
  "main": "dist/code.js",
  "ui": "dist/ui.html",
  "documentAccess": "dynamic-page",
  "networkAccess": {
    "allowedDomains": ["none"],
    "devAllowedDomains": ["http://localhost:4318", "ws://localhost:4318"]
  }
}
```

Notes:

- Keep `editorType` as `["figma"]` for v1 because this needs document writes.
- Do not start in Dev Mode because Dev Mode plugins are read-only.
- Use `dynamic-page` because it is required for new plugins and matches large-file access patterns.

## Local Development Workflow

### Confirmed: Can Figma install a self-developed plugin?

Yes.

Figma desktop supports importing a local development plugin from a `manifest.json` file.

Official flow:

1. Open the Figma desktop app.
2. Open any Figma Design file.
3. Right-click the canvas.
4. Go to `Plugins > Development > Import plugin from manifest`.
5. Choose your local `manifest.json`.
6. Run the plugin from `Plugins > Development` or the Actions menu.

Official references:

- https://help.figma.com/hc/en-us/articles/360042786733-Create-a-plugin-for-development
- https://help.figma.com/hc/en-us/articles/38457121114263-Create-a-Figma-Design-plugin-with-the-Figma-MCP-server-and-agentic-tools

### Local Dev Commands

Suggested bootstrap:

```bash
mkdir figma-mcp-bridge
cd figma-mcp-bridge
npm init -y
mkdir -p apps/figma-plugin apps/mcp-bridge packages/protocol docs
```

Suggested plugin and bridge setup:

```bash
npm install -D typescript esbuild @figma/plugin-typings
npm install zod ws
```

Optional root scripts:

```json
{
  "scripts": {
    "plugin:build": "esbuild apps/figma-plugin/src/code.ts --bundle --outfile=apps/figma-plugin/dist/code.js && esbuild apps/figma-plugin/ui/main.ts --bundle --outfile=apps/figma-plugin/dist/ui.js",
    "bridge:dev": "node apps/mcp-bridge/dist/index.js",
    "build": "npm run plugin:build && npm run bridge:build"
  }
}
```

## v1 MCP Tool Surface

Expose a small, composable set of tools first.

### Session

- `figma.get_file`
- `figma.get_current_page`
- `figma.get_selection`
- `figma.ping`

### Read

- `figma.list_pages`
- `figma.list_top_level_nodes`
- `figma.get_node`
- `figma.get_node_tree`
- `figma.find_nodes`
- `figma.get_components`
- `figma.get_variables`

### Write

- `figma.rename_node`
- `figma.create_page`
- `figma.create_frame`
- `figma.create_text`
- `figma.set_text`
- `figma.move_node`
- `figma.delete_node`
- `figma.batch_edit`

## v1 RPC Protocol Between Bridge and Plugin

Keep the bridge-to-plugin protocol explicit and typed.

Example request:

```json
{
  "type": "batch_edit",
  "requestId": "req_123",
  "sessionId": "sess_abc",
  "ops": [
    { "op": "rename_node", "nodeId": "1:714", "name": "Home / Default" },
    { "op": "create_page", "name": "Specs" }
  ]
}
```

Example response:

```json
{
  "ok": true,
  "requestId": "req_123",
  "results": [
    { "op": "rename_node", "ok": true, "nodeId": "1:714" },
    { "op": "create_page", "ok": true, "nodeId": "3:1", "name": "Specs" }
  ]
}
```

## Message Flow

```text
Codex
  -> MCP tool call
  -> local bridge
  -> validated protocol message
  -> plugin UI websocket client
  -> figma.ui.onmessage
  -> plugin main thread handler
  -> document mutation
  -> response back to bridge
  -> MCP tool result back to Codex
```

## Plugin Responsibilities

The plugin main thread should:

- read current file and page context
- resolve node IDs
- load pages on demand
- perform document mutations
- validate node existence and node type before mutation
- return plain structured results

The plugin UI should:

- connect to the bridge over WebSocket
- show connection state
- forward bridge messages to plugin main
- forward plugin main results to the bridge
- expose a manual reconnect button for reliability

## Bridge Responsibilities

The bridge should:

- implement MCP server transport
- maintain plugin session state
- reject writes if no active plugin session is attached
- validate all inputs with schemas
- log all write operations
- support dry-run for `batch_edit`
- return partial-failure details cleanly

## Non-Negotiable Safety Rules

1. Only mutate the currently open file attached to the active session.
2. Default all multi-op writes to `dryRun: true` unless explicitly disabled.
3. Require `confirm: true` for destructive ops such as delete or large moves.
4. Hard-limit max ops per batch for v1.
5. Keep an append-only audit log in the bridge.
6. Reject freeform text patches that are not schema-backed operations.
7. Include node type checks before mutation.

## First Milestone

Ship this before adding advanced features:

- plugin can connect to local bridge
- bridge exposes `figma.ping`
- bridge exposes `figma.get_selection`
- bridge exposes `figma.list_pages`
- bridge exposes `figma.rename_node`
- bridge exposes `figma.create_page`
- bridge exposes `figma.set_text`
- bridge exposes `figma.batch_edit`

Definition of done:

- local plugin imports into Figma desktop from manifest
- plugin connects to bridge and shows connected state
- Codex can rename a selected node through MCP
- Codex can create a new page named `Specs`
- all write operations are logged

## Second Milestone

- `get_node_tree`
- `find_nodes`
- `create_frame`
- `move_node`
- `create_component`
- variable read APIs
- batch dry-run diff preview

## Third Milestone

- variable creation and binding
- higher-level tools like `normalize_names`
- `create_spec_page`
- design-token extraction
- remote bridge option for team use

## Risks

### 1. Plugin lifecycle

Plugins do not run in the background. The user must explicitly run the plugin in the file before Codex can use the bridge-backed tools.

Mitigation:

- make the plugin UI persistent while the plugin is open
- show clear connection and session state
- fail fast in the bridge when the plugin disconnects

### 2. Large-file access

Figma files use dynamic page loading.

Mitigation:

- keep `documentAccess: dynamic-page`
- load only required pages
- prefer page-scoped reads in v1

### 3. Invalid write requests from the model

Mitigation:

- strict schemas
- node type guards
- bounded operations
- `dryRun` default

### 4. Localhost networking friction

Mitigation:

- use `devAllowedDomains`
- standardize a single local port
- provide a visible connection health indicator in the plugin UI

## Suggested Initial Backlog

### Project bootstrap

- create repo layout
- configure TypeScript for plugin and bridge
- add build pipeline for `code.ts` and UI bundle
- add protocol package with shared schemas

### Plugin

- build UI iframe shell
- add bridge connection client
- add plugin main message router
- implement `get_selection`
- implement `list_pages`
- implement `rename_node`
- implement `create_page`
- implement `set_text`
- implement `batch_edit`

### MCP bridge

- implement stdio MCP server
- implement tool schemas
- implement session store
- implement WebSocket server
- add audit logging
- add dry-run handling

### Verification

- import plugin from manifest in Figma desktop
- run bridge locally
- run plugin and confirm session
- call tools from Codex
- verify writes on a scratch Figma file

## Acceptance Test Script

Use this manual test order:

1. Launch the local MCP bridge.
2. Open Figma desktop and a scratch Design file.
3. Import the plugin from manifest if not already imported.
4. Run the plugin and confirm it shows `Connected`.
5. Select a frame in the file.
6. Call `figma.get_selection` from MCP and confirm the selected node ID matches.
7. Call `figma.rename_node` and confirm the frame name changes.
8. Call `figma.create_page` and confirm a new page appears.
9. Call `figma.batch_edit` in dry-run mode and confirm the preview result is correct.
10. Call `figma.batch_edit` with writes enabled and confirm the changes land.

## Recommended v1 Decision Log

- Private local plugin first, not public Community plugin
- Design-mode plugin first, not Dev Mode plugin
- WebSocket bridge first, not custom HTTP inside the plugin
- Typed operation protocol first, not natural-language document edits
- Minimal write surface first, not full document manipulation

## What Not To Build First

- background daemon inside the plugin
- full AI agent inside the plugin
- public multi-tenant hosted bridge
- unrestricted delete/move tools
- automatic whole-file refactors

## Immediate Next Step

Create the new repo and implement the thin vertical slice:

```text
Figma plugin connects -> bridge session registers -> MCP ping works ->
get_selection works -> rename_node works -> create_page works
```

That slice is enough to prove the architecture before building higher-level tools.
