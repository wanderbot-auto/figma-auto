# Architecture

This document describes the code that exists now.

## Repository Map

- `packages/protocol`
  Owns request/response types, tool payload/result types, limits, and Zod schemas.
  Main files: `packages/protocol/src/messages.ts`, `packages/protocol/src/zod.ts`

- `apps/mcp-bridge`
  Owns MCP registration, streamable HTTP, legacy SSE, and stdio transports, active-session management, WebSocket transport, and audit logging.
  Main files:
  `apps/mcp-bridge/src/server.ts`
  `apps/mcp-bridge/src/transport/mcp-http.ts`
  `apps/mcp-bridge/src/transport/websocket.ts`
  `apps/mcp-bridge/src/session/plugin-session-store.ts`
  `apps/mcp-bridge/src/tools/index.ts`

- `apps/figma-plugin`
  Owns plugin UI transport, request dispatch, and all Figma document reads/writes.
  Main files:
  `apps/figma-plugin/src/code.ts`
  `apps/figma-plugin/src/handlers/read.ts`
  `apps/figma-plugin/src/handlers/write.ts`
  `apps/figma-plugin/src/handlers/styles.ts`
  `apps/figma-plugin/src/handlers/variables.ts`
  `apps/figma-plugin/src/handlers/components.ts`
  `apps/figma-plugin/src/handlers/high-level.ts`
  `apps/figma-plugin/src/handlers/update-node-properties.ts`
  `apps/figma-plugin/src/handlers/set-instance-properties.ts`
  `apps/figma-plugin/src/handlers/set-image-fill.ts`
  `apps/figma-plugin/src/handlers/batch.ts`
  `apps/figma-plugin/src/handlers/batch-v2.ts`
  `apps/figma-plugin/ui/transport.ts`

## Request Flow

1. A bridge process starts and listens on one local port.
2. MCP clients either start that process over stdio, connect to its streamable HTTP endpoint at `/mcp`, or use the legacy SSE endpoints at `/sse` and `/messages`.
3. The same bridge process accepts plugin WebSocket connections on that port.
4. Figma loads the plugin UI, and the UI transport connects to the bridge WebSocket.
5. Plugin UI sends `session.register`.
6. Bridge keeps exactly one active plugin session.
7. Tool input is validated in the bridge with protocol Zod schemas.
8. Tool requests are forwarded over WebSocket to the plugin UI transport.
9. Plugin UI relays the request to plugin main code via `postMessage`.
10. Plugin dispatches in `apps/figma-plugin/src/code.ts`, runs a handler, and returns a protocol response.
11. Plugin UI forwards the response back to the bridge over WebSocket.

## Invariants

- One active plugin session at a time
- `figma.get_session_status` is bridge-local
- All other tools require a connected plugin session
- Protocol package is the source of truth for request shapes
- Plugin parses payloads again before executing handlers
- Plugin round trips time out after 10 seconds

## Data Boundaries

- Normalized paints: `SOLID`, `IMAGE`
- Read snapshots include style refs, bound variable refs, and component/instance metadata when available
- Variables and styles are local-file only
- Variable writes currently cover collection creation, variable creation, and node/text/paint bindings
- `batch_edit` is a compatibility layer over the v2 batch engine
- `batch_edit_v2` is the main multi-step composition surface
- High-level helpers currently include name normalization, spec page generation, and design-token extraction

## Current Structural Risks

- Large files still exist in `packages/protocol/src/messages.ts`, `packages/protocol/src/zod.ts`, `apps/figma-plugin/src/handlers/read.ts`, and `apps/figma-plugin/src/handlers/batch-v2.ts`
- Plugin-side behavior still lacks direct automated tests
