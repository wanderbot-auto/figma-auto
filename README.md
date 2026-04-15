# figma-auto

`figma-auto` is a local MCP bridge for Figma.

It has 3 parts:

- `packages/protocol`: shared types, limits, and Zod schemas
- `apps/mcp-bridge`: MCP bridge with stdio and streamable HTTP support, plus the local WebSocket bridge for the plugin
- `apps/figma-plugin`: Figma plugin runtime and handlers

## Current State

- Single active plugin session over WebSocket
- Editor support: `figma` only
- Read surface: file/page/flow/selection/node/tree/style/component/variable search and snapshots
- Write surface: create/duplicate/move/delete, style apply, text edits, instance property edits, image fills, prototype reactions, variable create/bind flows
- Batch surface: `figma.batch_edit` is the legacy bounded interface
- Batch surface: `figma.batch_edit_v2` is the main engine and supports `opId` references
- Higher-level surface: `figma.normalize_names`, `figma.create_spec_page`, and `figma.extract_design_tokens`
- Normalized paint support: `SOLID` and `IMAGE`
- Tests cover `protocol` and `mcp-bridge`
- There is still no separate automated plugin-side test suite

## Productized macOS Flow

```bash
npm install
npm run build:bridge-manager-dmg
```

Then install `dist/FigmaAutoBridgeMenu.app` or the generated dmg. The menu bar app now targets the productized macOS flow:

- ships with a bundled bridge runtime and prebuilt plugin manifests
- creates a default set of design-file instances on first launch
- exposes one MCP connection pattern only: `url = "http://localhost:<port>/mcp"`
- shows per-instance health so users know when to open Figma and run the matching plugin

For development-only terminal flows and legacy SSE details, see `docs/setup-and-mcp-manual.md`.

## Windows

Windows is supported for local development and bridge startup.

In PowerShell, from the repo root:

```powershell
npm install
npm run build
npm run start:local
```

Then import `apps/figma-plugin/manifest.json` into Figma Desktop as a local plugin and run it in the target file.

If you need a custom local port on Windows, keep using `localhost` and set the env vars before rebuilding:

```powershell
$env:FIGMA_AUTO_BRIDGE_PORT="4318"
$env:FIGMA_AUTO_BRIDGE_WS_URL="ws://localhost:4318"
$env:FIGMA_AUTO_BRIDGE_HTTP_URL="http://localhost:4318"
npm run build
npm run start:local
```

## Docs

- `docs/setup-and-mcp-manual.md`: complete startup, verification, Codex MCP, and Trae MCP manual
- `docs/local-dev.md`: local commands, env vars, troubleshooting
- `docs/usage-zh.md`: Chinese feature overview and practical usage guide
- `docs/macos-menu-bar-app.md`: macOS-first product deployment, bundled runtime, and instance mapping flow
- `docs/tool-surface.md`: current MCP tools and important limits
- `docs/architecture.md`: module boundaries and request flow
- `docs/manual-test-checklist.md`: production-oriented manual validation checklist
- `docs/roadmap.md`: shipped work, open gaps, next priorities
