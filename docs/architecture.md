# Architecture

Last updated: 2026-03-17

## Purpose

This project aims to let Codex safely read from and write to the active Figma Design file through a local MCP bridge and a private Figma plugin.

The system should support:

- document reads from the current file, page, selection, and node tree
- controlled write operations such as rename, create page, create frame, create text, move node, and batch edit
- local development in the Figma desktop app
- schema-backed operations rather than freeform document edits

## Design Principles

- Keep document access inside the Figma Plugin API
- Keep MCP concerns outside the plugin runtime
- Default risky multi-step writes to preview mode
- Prefer narrow, typed operations over broad natural-language mutations
- Fail fast when the plugin session is missing or stale

## Runtime Model

```text
Codex MCP client
  -> local MCP bridge
  -> Figma plugin UI iframe
  -> Figma plugin main thread
  -> Figma document scene
```

## Confirmed Constraints

The current design depends on these Figma runtime constraints:

- plugins can read and write Figma Design files through the Plugin API
- plugin main code can access the Figma scene but not normal browser APIs
- plugin UI runs in an iframe and can use browser APIs
- plugin main and UI communicate via `postMessage`
- plugins do not run in the background and must be launched by the user
- Dev Mode plugins are read-only and are not suitable for mutation flows
- Figma desktop supports importing a local plugin from `manifest.json`

## Core Architectural Decision

Do not implement the MCP server inside the Figma plugin.

Reasoning:

- MCP transports are process or network oriented
- the plugin is not a durable background process
- the plugin main thread is sandboxed
- document access still belongs in plugin code even if the UI iframe talks to localhost

Resulting split:

```text
Figma plugin
  = document access, validation, mutations

Local bridge
  = MCP server, session management, schemas, logging, batching
```

## Component Responsibilities

### Plugin main thread

- read current file and page context
- resolve node IDs and load pages on demand
- validate node existence and node type before mutation
- perform document writes through the Plugin API
- return plain structured responses

### Plugin UI iframe

- connect to the local bridge over WebSocket
- show session and connection state
- forward bridge requests to plugin main
- forward plugin results back to the bridge
- expose a reconnect action for local recovery

### Local MCP bridge

- implement MCP transport, starting with `stdio`
- maintain the active plugin session
- validate tool input and protocol messages
- reject writes when no plugin session is attached
- log write operations and partial failures
- support dry-run behavior for `batch_edit`

## Proposed Repository Layout

Use the current repository rather than creating a separate repo. The target layout should become:

```text
figma-auto/
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
    roadmap.md
    dev-readiness.md
    local-dev.md
```

## Technology Baseline

- TypeScript for plugin code, UI code, and bridge code
- Node.js for the local bridge
- `zod` for schema validation
- WebSocket between plugin UI and local bridge
- `stdio` MCP transport first, with streamable HTTP deferred until needed

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

Implementation note: the build pipeline must explicitly generate both `dist/code.js` and `dist/ui.html`; the original plan only covered the JavaScript bundle and should not be copied as-is.

## Protocol Shape

Bridge-to-plugin communication should use a typed envelope with:

- `type`
- `requestId`
- `sessionId`
- operation payload

Example:

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

Responses should preserve `requestId`, distinguish total failure from partial failure, and return machine-readable error details.

## Safety Rules

These rules should be enforced in code, not just documented:

1. Only mutate the currently open file for the active session
2. Default multi-op writes to `dryRun: true`
3. Require `confirm: true` for destructive operations
4. Hard-limit batch size in v1
5. Keep an append-only audit log in the bridge
6. Reject freeform patches that are not schema-backed
7. Perform node type checks before mutation

## Known Architectural Gaps To Resolve Before Coding

- define how the bridge authenticates or binds the active plugin session on localhost
- define where audit logs live and whether rotation is needed
- define the error model shared by bridge tools and plugin RPC responses
- define how `set_text` handles font-loading constraints before mutation
- define whether page loading happens only in plugin main or can be requested explicitly by tool handlers

## Non-Goals For The First Slice

- making the plugin itself a background daemon
- embedding a general AI agent inside the plugin
- exposing unrestricted document-wide refactors
- supporting hosted multi-tenant bridge deployments
