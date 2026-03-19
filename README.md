# figma-auto

`figma-auto` is a local MCP bridge for Figma.

It has 3 parts:

- `packages/protocol`: shared types, limits, and Zod schemas
- `apps/mcp-bridge`: MCP stdio server + local WebSocket bridge
- `apps/figma-plugin`: Figma plugin runtime and handlers

## Current State

- Single active plugin session over WebSocket
- Editor support: `figma` only
- Read surface: file/page/selection/node/tree/style/component/variable search and snapshots
- Write surface: create/duplicate/move/delete, style apply, text edits, instance property edits, image fills, variable create/bind flows
- Batch surface: `figma.batch_edit` is the legacy bounded interface
- Batch surface: `figma.batch_edit_v2` is the main engine and supports `opId` references
- Higher-level surface: `figma.normalize_names`, `figma.create_spec_page`, and `figma.extract_design_tokens`
- Normalized paint support: `SOLID` and `IMAGE`
- Tests cover `protocol` and `mcp-bridge`
- There is still no separate automated plugin-side test suite

## Quick Start

```bash
npm install
npm run build
npm run start:local
```

Then load `apps/figma-plugin/manifest.json` as a local plugin in Figma and run it in the target file.

## Docs

- `docs/local-dev.md`: local commands, env vars, troubleshooting
- `docs/tool-surface.md`: current MCP tools and important limits
- `docs/architecture.md`: module boundaries and request flow
- `docs/manual-test-checklist.md`: production-oriented manual validation checklist
- `docs/roadmap.md`: shipped work, open gaps, next priorities
