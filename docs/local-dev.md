# Local Development

Last updated: 2026-03-17

## Purpose

This document describes the local development workflow for the current scaffold and first implementation slice.

## Expected Tooling

- Figma desktop app
- one scratch Figma Design file for manual testing
- Node.js LTS
- npm
- TypeScript

## Planned Local Port

Reserve one local bridge port for v1:

- `4318` for the WebSocket bridge during development

Keep the port fixed in early development so the plugin manifest and local docs stay simple.

## Planned Bootstrap Steps

Bootstrap is already complete. The current workspace uses:

```bash
npm install
```

Useful commands:

```bash
npm run build
npm test
npm run start:local
npm run dev:bridge
npm run paths:local
```

Command roles:

- `npm run start:local` builds the workspace, starts the bridge, and writes bridge stdout/stderr to `logs/bridge.log`
- `npm run dev:bridge` starts the already-built bridge without rebuilding
- `npm run paths:local` prints the manifest, dist, and log paths used by the local helper

## Planned Build Outputs

The first scaffold should produce:

```text
apps/figma-plugin/dist/code.js
apps/figma-plugin/dist/ui.html
apps/figma-plugin/dist/ui.js
apps/mcp-bridge/dist/index.js
```

## Planned Figma Import Flow

1. Open the Figma desktop app
2. Open any scratch Design file
3. Right-click the canvas
4. Go to `Plugins > Development > Import plugin from manifest`
5. Choose `apps/figma-plugin/manifest.json`
6. Run the plugin from `Plugins > Development` or the Actions menu

## Planned Daily Run Order

The current expected manual workflow is:

1. run `npm run start:local`
2. open Figma desktop and the scratch file
3. run the plugin
4. confirm the plugin UI shows bridge connection state
5. execute MCP tools from Codex against the active file

## Development Conventions To Lock Early

- the plugin should only talk to localhost in development
- the bridge should reject writes when no plugin session is active
- destructive operations should require explicit confirmation
- multi-op writes should default to dry-run mode
- all committed writes should be logged

## Manual Verification Checklist

Use this checklist after the first slice is scaffolded:

- plugin imports successfully from `manifest.json`
- plugin can connect to the local bridge
- bridge can report session presence
- `figma.get_file` returns the active file metadata
- `figma.get_current_page` returns the current page metadata
- `figma.get_selection` returns the active selection
- `figma.get_node` returns a normalized node snapshot
- `figma.get_node_tree` returns a recursive subtree snapshot
- `figma.rename_node` changes the selected node name
- `figma.create_page` creates a new page
- `figma.create_frame` creates a frame in the active page
- `figma.create_text` creates a text node in the active page
- `figma.move_node` re-parents a node correctly
- `figma.delete_node` deletes a node only with `confirm: true`
- `figma.batch_edit` supports dry-run and committed execution

## Known Limitations Right Now

- end-to-end verification still depends on importing the plugin into Figma desktop
- `apps/figma-plugin/manifest.json` still uses a placeholder plugin ID
- bridge stdout/stderr goes to `logs/bridge.log` and write-audit events go to `logs/audit.ndjson`
- no automated test currently exercises a live WebSocket session with the plugin runtime
