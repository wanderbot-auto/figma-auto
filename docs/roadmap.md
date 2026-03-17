# Roadmap

Last updated: 2026-03-17

## Delivery Strategy

Build the project as a thin vertical slice first, then expand the read and write surface in controlled stages.

Recommended first proof:

```text
plugin connects -> bridge session registers -> MCP ping works ->
get_selection works -> rename_node works -> create_page works
```

## Milestone 0: Development Readiness

Complete these before application code starts:

- settle the repository layout inside this repo
- write the bootstrap file list and build outputs
- define the bridge-to-plugin message envelope
- define the audit log format and storage location
- define error shapes and partial-failure semantics
- choose tool naming and batch limits for v1
- write the local setup and manual verification procedure

Exit criteria:

- `docs/architecture.md` is accepted as the working design
- `docs/dev-readiness.md` has no unresolved blockers marked as "must decide now"
- the first implementation slice is small enough to finish without redesign

## Milestone 1: Thin Vertical Slice

Scope:

- plugin imports into Figma desktop from `manifest.json`
- plugin UI connects to the local bridge
- bridge exposes `figma.ping`
- bridge exposes `figma.get_selection`
- bridge exposes `figma.list_pages`
- bridge exposes `figma.rename_node`
- bridge exposes `figma.create_page`
- bridge exposes `figma.set_text`
- bridge exposes `figma.batch_edit`

Definition of done:

- plugin shows connected state when the bridge is running
- Codex can rename a selected node through MCP
- Codex can create a page named `Specs`
- all write operations are logged
- manual acceptance flow passes on a scratch Figma file

## Milestone 2: Broader Read/Write Coverage

Scope:

- `figma.get_node_tree`
- `figma.find_nodes`
- `figma.create_frame`
- `figma.move_node`
- `figma.create_component`
- variable read APIs
- batch dry-run diff preview

Focus:

- page-scoped reads for large files
- better partial-failure reporting
- stronger tool schemas and error messages

## Milestone 3: Higher-Level Operations

Scope:

- variable creation and binding
- higher-level tools such as `normalize_names`
- `create_spec_page`
- design-token extraction
- optional remote bridge mode for team usage

Guardrail:

- do not add higher-level tools until the low-level mutation layer is stable and testable

## Workstreams

### Repository bootstrap

- create monorepo folders for plugin, bridge, and shared protocol
- add root `package.json`
- add TypeScript configs
- add build scripts for plugin main, plugin UI, and bridge
- add lint and test entry points

### Plugin

- build the UI iframe shell
- add bridge connection client
- add main-thread message router
- implement initial read and write handlers
- expose connection status and recovery actions

### MCP bridge

- implement stdio MCP server
- implement tool schemas
- implement session store
- implement WebSocket server
- add audit logging
- add dry-run support

### Verification

- import plugin from local `manifest.json`
- run bridge locally
- run plugin and confirm session registration
- call tools from Codex
- verify writes in a scratch file

## Manual Acceptance Flow

1. Launch the local MCP bridge
2. Open Figma desktop and a scratch Design file
3. Import the plugin from `manifest.json` if needed
4. Run the plugin and confirm it shows `Connected`
5. Select a frame in the file
6. Call `figma.get_selection` and confirm the selected node ID matches
7. Call `figma.rename_node` and confirm the frame name changes
8. Call `figma.create_page` and confirm a page appears
9. Call `figma.batch_edit` in dry-run mode and confirm the preview is correct
10. Call `figma.batch_edit` with writes enabled and confirm the changes land

## What Not To Build First

- background behavior inside the plugin
- a full AI agent inside the plugin
- public multi-tenant hosting
- unrestricted delete and move tools
- automatic whole-file refactors

## Planning Risks

### Plugin lifecycle

Risk:

- the plugin only exists while the user keeps it open

Mitigation:

- keep the UI persistent while open
- show clear session state
- fail fast when the bridge loses the plugin

### Large-file access

Risk:

- dynamic page loading can make full-file reads expensive or brittle

Mitigation:

- keep `documentAccess: dynamic-page`
- prefer page-scoped reads in early milestones
- load only required pages

### Invalid model-generated writes

Risk:

- the bridge receives requests that are syntactically valid but operationally unsafe

Mitigation:

- strict schemas
- node type guards
- bounded operations
- dry-run default

### Local networking friction

Risk:

- localhost bridge connectivity fails during development

Mitigation:

- standardize one development port
- keep the allowed dev domains explicit
- expose a visible connection health indicator
