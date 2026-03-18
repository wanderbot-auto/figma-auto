# figma-auto

This repository now contains the first working scaffold for a private Figma Design plugin and local MCP bridge that lets Codex read and write the active Figma file through the Figma Plugin API.

## Current Status

- Status: buildable, roadmap feature surface implemented, pending live Figma verification
- Code: workspace, plugin, bridge, shared protocol, and higher-level document tooling are in place
- Main archive document: `figma-plugin-mcp-bridge-project-plan-2026-03-17.md`
- Last reviewed plan date: 2026-03-17

What exists now:

- `apps/figma-plugin` with manifest, plugin main code, UI shell, and build script
- `apps/mcp-bridge` with MCP stdio server, WebSocket bridge, session store, and audit logger
- `packages/protocol` with shared message types and zod schemas
- workspace build and test scripts at the repo root

Current local config convention:

- `packages/protocol/src/messages.ts` is the default source for the bridge port
- `apps/figma-plugin/manifest.json` is generated from `apps/figma-plugin/manifest.template.json` during plugin build
- the plugin UI bundle also receives the configured bridge WebSocket URL at build time, so `dist/ui.js` stays aligned with the generated manifest
- `FIGMA_AUTO_BRIDGE_PORT` overrides the local bridge port for both plugin build output and bridge runtime
- `FIGMA_AUTO_BRIDGE_WS_URL` and `FIGMA_AUTO_BRIDGE_HTTP_URL` can point the plugin at a remote bridge deployment
- `FIGMA_AUTO_BRIDGE_HOST`, `FIGMA_AUTO_BRIDGE_PUBLIC_WS_URL`, and `FIGMA_AUTO_BRIDGE_PUBLIC_HTTP_URL` control bridge listen/public addresses
- `FIGMA_AUTO_FIGMA_PLUGIN_ID` can be set before build to stamp a real Figma plugin ID into the generated manifest

## Intended Outcome

The planned system has two main parts:

1. A Figma Design plugin that reads and mutates the current document through the official Plugin API
2. A local MCP bridge that exposes those capabilities as tools for Codex

Planned high-level flow:

```text
Codex MCP client
  -> local MCP bridge
  -> Figma plugin UI iframe
  -> Figma plugin main thread
  -> Figma document scene
```

## What Exists Today

- A split documentation set:
  - `docs/architecture.md`
  - `docs/roadmap.md`
  - `docs/dev-readiness.md`
  - `docs/local-dev.md`
- The original planning archive:
  - `figma-plugin-mcp-bridge-project-plan-2026-03-17.md`

## Workspace Commands

- `npm install`
- `npm run build`
- `npm test`
- `npm run start:local`
- `npm run dev -w @figma-auto/mcp-bridge`
- `npm run paths:local`

The plugin build output lands in `apps/figma-plugin/dist`, and the bridge build output lands in `apps/mcp-bridge/dist`.
`npm run start:local` now builds the workspace, starts the bridge, and centralizes runtime logs under `logs/`.

## Documentation Guide

- `docs/architecture.md` explains the target system shape and key technical decisions
- `docs/roadmap.md` breaks the plan into milestones, workstreams, and acceptance flow
- `docs/dev-readiness.md` lists the decisions and checklist items that should be complete before implementation starts
- `docs/local-dev.md` captures the intended local workflow before runnable scripts exist
- `figma-plugin-mcp-bridge-project-plan-2026-03-17.md` is kept as the original consolidated source plan

## Known Gaps

Before this repository can be used as a fully verified Figma workflow, it still needs:

- manual end-to-end verification inside the Figma desktop app
- a real Figma plugin ID in the generated `apps/figma-plugin/manifest.json`
- stronger automated tests for live bridge and plugin message flow
- operational hardening for remote bridge deployments, if those become a real team workflow

## Document Notes

The current plan is directionally sound, but it should be treated as a proposal rather than an implementation guide. In particular:

- the repository name in the plan does not match this repository
- some example scripts are incomplete
- the UI build path is not fully specified
- milestone scope should be separated more clearly from the full v1 surface

## Implemented Surface

The current codebase now covers the roadmap feature surface:

```text
plugin session register -> MCP ping -> get_file -> get_current_page ->
get_selection -> list_pages -> get_node -> get_node_tree -> find_nodes ->
get_variables -> rename_node -> create_page -> create_frame -> create_component ->
create_text -> set_text -> move_node -> delete_node -> batch_edit ->
create_variable_collection -> create_variable -> bind_variable ->
normalize_names -> create_spec_page -> extract_design_tokens
```

The next meaningful step is manual verification against a scratch Figma file in the desktop app.
