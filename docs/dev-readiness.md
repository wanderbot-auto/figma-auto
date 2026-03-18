# Development Readiness

Last updated: 2026-03-17

## Objective

This document originally captured pre-implementation decisions. It now doubles as a record of what was frozen before coding and what has already been implemented.

## Ready / Not Ready Snapshot

Ready:

- the high-level architecture is identified
- the main Figma runtime constraints are understood
- the initial milestone is intentionally narrow
- the repo scaffold exists under `apps/` and `packages/`
- build outputs are defined and produced by `npm run build`
- the session model, protocol envelope, and audit log shape are implemented
- the minimum automated test plan is in place and passing

Not ready yet:

- the live plugin workflow has not yet been verified end to end in Figma desktop
- the placeholder plugin ID still needs to be replaced in `apps/figma-plugin/manifest.json`
- reconnect and stale-session behavior are implemented, but not yet exercised in a live session
- automated coverage still stops short of a live plugin-session integration test

## Decisions Locked Before Coding

These items were settled before implementation because they influenced file layout or API design:

### 1. Repository structure

Decision made:

- build inside `figma-auto` with `apps/` and `packages/`

Why now:

- folder layout affects build scripts, path aliases, and documentation

### 2. Build pipeline outputs

Decision made:

- define exactly how these artifacts are produced:
  - `apps/figma-plugin/dist/code.js`
  - `apps/figma-plugin/dist/ui.html`
  - `apps/figma-plugin/dist/ui.js`
  - `apps/mcp-bridge/dist/index.js`

Why now:

- the original plan had an incomplete example and cannot be used directly

### 3. Session model

Decision made:

- one active plugin session at a time
- reconnect creates a new `sessionId`
- the bridge replaces the old session when a new session registers

Why now:

- tool routing and write safety depend on it

### 4. Error contract

Decision made:

- use a unified envelope with stable error codes and `{ code, message, details? }`

Why now:

- tool handlers and plugin handlers should not invent different error formats later

### 5. Audit log

Decision made:

- log to `logs/audit.ndjson`
- use one file with `mode: dry_run | commit`

Why now:

- audit logging is a non-negotiable rule in the plan

### 6. Text mutation behavior

Decision made:

- require a `TextNode`
- load required fonts before mutation
- fail explicitly on node-type or font-loading errors

Why now:

- text editing is in the first milestone and often introduces plugin-specific edge cases

## Completed Beyond Milestone 1

- remote bridge URL and host configuration
- variable reads, creation, and binding
- higher-level transformation tools such as `normalize_names`
- generated spec-page output and design-token extraction

## Still Deferred

- streamable HTTP transport
- team-oriented operational hardening beyond configurable remote URLs

## Pre-Implementation Checklist

Use this checklist before opening the first feature branch.

### Environment

- Figma desktop app is installed
- a scratch Figma Design file is available for testing
- Node.js and npm versions are chosen and documented
- local development port is reserved for the bridge
- TypeScript version is chosen

### Repository bootstrap

- create `apps/figma-plugin`
- create `apps/mcp-bridge`
- create `packages/protocol`
- create root `package.json`
- add root TypeScript configuration
- choose whether the repo uses npm workspaces

### Plugin skeleton

- define `manifest.json`
- create plugin main entrypoint
- create plugin UI HTML shell
- create message router types shared with the bridge
- decide how connection status appears in the plugin UI

### Bridge skeleton

- define MCP server entrypoint
- define WebSocket server entrypoint
- define session store API
- define schema validation boundary
- define log writer boundary

### Shared protocol

- define request envelope
- define response envelope
- define operation payload schemas
- define shared error codes
- define versioning approach for protocol changes

### Quality gates

- choose formatter and linter
- choose test runner
- define minimum automated tests for milestone 1
- define the manual acceptance checklist location

## Minimum Automated Test Plan

The project should have automated coverage before feature growth. At minimum, prepare tests for:

- schema validation of each milestone 1 tool input
- schema validation of higher-level tool inputs and variable payloads
- protocol encode and decode behavior
- session store behavior for connect, disconnect, and stale session rejection
- audit log writes for committed and dry-run operations
- bridge tool behavior when no plugin session is attached

Manual-only validation is not enough once write operations exist.

## Suggested File Inventory For The First Scaffold

```text
package.json
tsconfig.base.json
apps/figma-plugin/manifest.json
apps/figma-plugin/src/code.ts
apps/figma-plugin/ui/index.html
apps/figma-plugin/ui/main.ts
apps/mcp-bridge/package.json
apps/mcp-bridge/src/index.ts
apps/mcp-bridge/src/server.ts
packages/protocol/src/messages.ts
packages/protocol/src/zod.ts
```

## Definition Of Ready

The project is ready for implementation when all of the following are true:

- the repo layout is accepted
- the first-slice scope is frozen
- the protocol envelope is documented
- the session model is documented
- the build outputs are documented
- the audit log decision is documented
- the test strategy for milestone 1 is documented
- the local manual verification flow is documented

This condition has been met for the current scaffold.

## Remaining Verification Questions

These still need confirmation through live usage rather than further planning:

- does the plugin UI successfully reconnect inside the Figma desktop runtime
- does `set_text` behave correctly on real text nodes with mixed fonts
- do variable creation and binding behave correctly across real file plans and modes
- does `create_component` preserve expected layer structure in live files
- are the current MCP SDK tool responses ergonomic enough for Codex in practice
- should additional metadata be logged once real tool usage starts
