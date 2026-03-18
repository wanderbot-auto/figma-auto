# Architecture

This document describes the code that exists now.

## Repository Map

- `packages/protocol`
  Owns request/response types, tool payload/result types, limits, and Zod schemas.
  Main files: `src/messages.ts`, `src/zod.ts`

- `apps/mcp-bridge`
  Owns MCP registration, active-session management, WebSocket transport, and audit logging.
  Main files: `src/server.ts`, `src/transport/websocket.ts`, `src/session/plugin-session-store.ts`, `src/tools/index.ts`

- `apps/figma-plugin`
  Owns request dispatch and all Figma document reads/writes.
  Main files:
  `src/code.ts`
  `src/handlers/read.ts`
  `src/handlers/write.ts`
  `src/handlers/styles.ts`
  `src/handlers/variables.ts`
  `src/handlers/update-node-properties.ts`
  `src/handlers/set-instance-properties.ts`
  `src/handlers/set-image-fill.ts`
  `src/handlers/batch-v2.ts`
  `src/handlers/node-helpers.ts`

## Request Flow

1. MCP client starts `apps/mcp-bridge`.
2. Bridge opens a local WebSocket server.
3. Plugin UI connects and sends `session.register`.
4. Bridge keeps exactly one active session.
5. Tool input is validated in the bridge with protocol Zod schemas.
6. Request is forwarded to the plugin unless the tool is `figma.get_session_status`.
7. Plugin dispatches in `src/code.ts`, runs a handler, and returns a protocol response.

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
- `batch_edit` is a compatibility layer over the v2 batch engine
- `batch_edit_v2` is the main multi-step composition surface

## Current Structural Risks

- Large files still exist in `packages/protocol/src/messages.ts`, `packages/protocol/src/zod.ts`, `apps/figma-plugin/src/handlers/read.ts`, and `apps/figma-plugin/src/handlers/batch-v2.ts`
- Plugin-side behavior still lacks direct automated tests
