# Manual Test Checklist

This checklist is for production-oriented manual validation of the current plugin + bridge surface.

Use a dedicated scratch Figma file and record pass/fail for every case.

## Exit Criteria

- every P0 case passes without unexpected plugin disconnects
- every committed write changes the design exactly once
- every committed write is reflected in the plugin UI action history
- every committed write appends an audit entry to `logs/audit.ndjson`
- expected failure cases return clear errors and do not partially mutate the file
- bridge and plugin remain usable after reconnect, page switch, and repeated tool calls

## Test Fixture

Prepare one scratch file with:

- at least 2 pages
- a frame with nested children
- at least 2 text nodes with different fonts/styles
- one component and one instance
- one rectangle with fills
- local color/text styles
- one local variable collection with at least one variable per type you plan to test

Keep a second empty scratch page for create/move/delete tests.

## Run Setup

1. Run `npm install`, `npm run build`, and `npm run start:local`.
2. Import `apps/figma-plugin/manifest.json` into Figma if needed.
3. Open the scratch file and start the plugin.
4. Confirm the plugin UI shows bridge connected state.
5. Call `figma.get_session_status` and confirm `connected: true`.
6. Clear or rotate `logs/bridge.log` and `logs/audit.ndjson` before a clean test pass.

## P0 Session And Recovery

### P0-01 Bridge Session Boot

- Steps: start bridge, start plugin, call `figma.get_session_status`
- Expected: active session exists, file/page metadata matches the open file, plugin UI shows connected

### P0-02 Plugin UI Context

- Steps: change selection, then change page
- Expected: plugin UI context updates file/page/selection count correctly

### P0-03 Single Active Session

- Steps: open the same plugin in another Figma file or another window
- Expected: bridge keeps only one active session, new session replaces old one cleanly, stale session calls fail as `missing_session`

### P0-04 Manual Reconnect

- Steps: stop bridge or disconnect plugin, then restore bridge and use the plugin UI reconnect button
- Expected: plugin UI returns to connected state, subsequent tool calls succeed

### P0-05 Disconnect During Use

- Steps: run a simple read, stop the plugin, call another tool
- Expected: call fails with `missing_session`, no hang beyond normal timeout, bridge remains usable after plugin restart

## P0 Read Surface

### P0-10 File And Page Reads

- Tools: `figma.get_file`, `figma.get_current_page`, `figma.list_pages`
- Expected: file name, current page, and page list match the open file exactly

### P0-11 Selection Read

- Tool: `figma.get_selection`
- Expected: selected node ids and names match the current selection

### P0-12 Node Read

- Tool: `figma.get_node`
- Expected: node metadata, geometry, and design metadata match the target node

### P0-13 Node Tree Read

- Tool: `figma.get_node_tree`
- Expected: subtree shape matches Figma hierarchy and remains correct across nested frames/components

### P0-14 Search

- Tool: `figma.find_nodes`
- Expected: page-scoped and root-scoped queries return expected matches, limit behavior is correct, no duplicate/missing obvious hits

### P0-15 Styles, Components, Variables Reads

- Tools: `figma.get_styles`, `figma.get_components`, `figma.get_variables`
- Expected: local file assets are returned accurately, truncation/limit behavior is understandable, no cross-file leakage

## P0 Core Writes

### P0-20 Rename

- Tool: `figma.rename_node`
- Expected: only target node name changes, UI history shows the rename, audit log records one commit entry

### P0-21 Create Page

- Tool: `figma.create_page`
- Expected: page appears once with requested name, result payload matches created page

### P0-22 Create Frame And Rectangle

- Tools: `figma.create_frame`, `figma.create_rectangle`
- Expected: node type, parent, size, position, and optional corner radius match payload

### P0-23 Create Text

- Tool: `figma.create_text`
- Expected: node appears in the right parent, text content is correct, no font-load failure for valid fonts

### P0-24 Duplicate

- Tool: `figma.duplicate_node`
- Expected: duplicate appears in expected parent/index, copied content matches source, source remains unchanged

### P0-25 Set Text

- Tool: `figma.set_text`
- Expected: only target text node content changes, other text properties remain intact

### P0-26 Move

- Tool: `figma.move_node`
- Expected: target node is reparented to the requested parent/index, no accidental reorder beyond the target

### P0-27 Delete Confirmation

- Tool: `figma.delete_node`
- Steps: first call without `confirm: true`, then with `confirm: true`
- Expected: first call fails without mutation, second call deletes exactly one node, UI history records the delete

## P0 Style And Property Writes

### P0-30 Apply Styles

- Tool: `figma.apply_styles`
- Expected: requested style refs are applied, unrelated style refs remain unchanged

### P0-31 Update Node Properties

- Tool: `figma.update_node_properties`
- Expected: every requested field changes, fields not included in payload do not drift

### P0-32 Instance Properties

- Tool: `figma.set_instance_properties`
- Expected: variant/component property overrides land on the target instance only, swap behavior uses the expected component

### P0-33 Image Fill

- Tool: `figma.set_image_fill`
- Expected: image fill lands on the requested paint index, preserve/replace behavior matches payload

## P0 Batch And High-Level Writes

### P0-40 Batch Edit Dry Run

- Tool: `figma.batch_edit`
- Steps: run dry-run payload with multiple operations
- Expected: preview result is returned, no file mutation happens, plugin UI marks it as preview not applied change

### P0-41 Batch Edit Commit

- Tool: `figma.batch_edit`
- Steps: run committed payload with `confirm: true`
- Expected: operations apply in order, result summary is correct, audit log records one committed batch

### P0-42 Batch Edit V2 References

- Tool: `figma.batch_edit_v2`
- Steps: create a node in one op and reference it in later ops
- Expected: `opId` references resolve correctly, created node ids are reusable in later steps

### P0-43 Batch Failure Stops Safely

- Tool: `figma.batch_edit_v2`
- Steps: include one intentionally invalid later op
- Expected: result reports the failure clearly, stop point is correct, already-applied behavior matches current contract and is understandable

### P0-44 Normalize Names

- Tool: `figma.normalize_names`
- Steps: run dry-run first, then committed mode with `confirm: true`
- Expected: dry-run previews changes only, committed mode renames only the expected nodes, limit/truncation behavior is correct

### P0-45 Create Spec Page

- Tool: `figma.create_spec_page`
- Expected: generated page appears once, includes the expected source/selection context, no corruption of the rest of the file

### P0-46 Extract Design Tokens

- Tool: `figma.extract_design_tokens`
- Expected: summary, collections, variables, and styles match the current file assets

## P0 Variable Flows

### P0-50 Create Variable Collection

- Tool: `figma.create_variable_collection`
- Expected: collection appears in local variables with requested name and modes

### P0-51 Create Variable

- Tool: `figma.create_variable`
- Expected: variable is created in the correct collection with correct type, values, and optional code syntax

### P0-52 Bind And Unbind Variable

- Tool: `figma.bind_variable`
- Expected: bind updates the requested field, unbind clears only that binding, unrelated bindings remain intact

## P1 Negative And Validation Cases

### P1-60 Wrong Node Type

- Steps: call text-only or instance-only tools on the wrong node type
- Expected: request fails with a clear `node_type_mismatch` style error and does not mutate the file

### P1-61 Missing Node

- Steps: use a stale or fake node id
- Expected: request fails cleanly as not found

### P1-62 Limit Enforcement

- Steps: exceed `find_nodes.limit`, `batch_edit` op count, `batch_edit_v2` op count, or normalize limit
- Expected: validation rejects the payload before mutation

### P1-63 Confirm Enforcement

- Steps: commit delete, normalize, or batch operations without required `confirm: true`
- Expected: bridge/plugin rejects the request and no mutation occurs

### P1-64 Font Failure Path

- Steps: force a text update/create scenario that cannot load required fonts
- Expected: error is explicit, no partial text mutation occurs

## P1 UI Observability

### P1-70 Live Action Display

- Steps: run one rename, one batch dry-run, and one delete
- Expected: plugin UI shows current action while running and moves each completed action into history with short human-readable summaries

### P1-71 History Quality

- Steps: run at least 10 key actions
- Expected: history stays readable, newest items appear first, statuses distinguish applied/preview/failed, no raw protocol dump is needed to understand what changed

### P1-72 Error Visibility

- Steps: trigger one expected failure
- Expected: plugin UI history marks the action as failed and shows enough context to understand the failure

## P1 Logs And Auditability

### P1-80 Bridge Log

- File: `logs/bridge.log`
- Expected: session lifecycle and tool failures are visible enough to debug manual runs

### P1-81 Audit Log

- File: `logs/audit.ndjson`
- Expected: committed write tools append one entry per call with request id, tool name, target summary, mode, and success/failure outcome

### P1-82 Dry Run Audit Semantics

- Steps: run dry-run normalize/batch flows
- Expected: audit entries reflect dry-run mode rather than commit mode

## P1 Stability Pass

### P1-90 Repeated Operation Soak

- Steps: repeat a mixed sequence of read/write calls for 15 to 20 minutes
- Expected: no accumulating UI glitches, no stuck pending action, no bridge crash, no obvious memory or latency spiral

### P1-91 Large Subtree Read

- Steps: run `get_node_tree` and `find_nodes` on a larger page/subtree
- Expected: results return within acceptable time, plugin stays responsive, no timeout under normal file size

### P1-92 Rebuild And Re-import

- Steps: rebuild plugin, re-import manifest, rerun a small smoke suite
- Expected: no stale UI bundle, no manifest drift, session still registers correctly

## Suggested Execution Order

1. Run all P0 cases first.
2. Fix any session, delete-confirmation, batch, or audit-log failures before continuing.
3. Run P1 negative and observability cases.
4. End with the stability pass.

## P0 Run Order

Run P0 in this exact order so each later case builds on a known-good session:

1. `P0-01` to `P0-05`
2. `P0-10` to `P0-15`
3. `P0-20` to `P0-27`
4. `P0-30` to `P0-33`
5. `P0-40` to `P0-46`
6. `P0-50` to `P0-52`

Stop immediately if any of these fail:

- session boot or reconnect
- delete confirmation semantics
- committed batch behavior
- audit log write behavior

## P0 Smoke Commands

Use these as the minimum command/check sequence while you work through P0:

```bash
npm run build
npm run start:local
```

Then confirm:

1. plugin UI shows `Connected`
2. `figma.get_session_status` returns `connected: true`
3. `logs/bridge.log` is updating
4. `logs/audit.ndjson` receives entries for committed writes

## P0 Record Sheet

Copy this block and fill it in as you go:

```text
P0-01 | PASS/FAIL | | 
P0-02 | PASS/FAIL | | 
P0-03 | PASS/FAIL | | 
P0-04 | PASS/FAIL | | 
P0-05 | PASS/FAIL | | 
P0-10 | PASS/FAIL | | 
P0-11 | PASS/FAIL | | 
P0-12 | PASS/FAIL | | 
P0-13 | PASS/FAIL | | 
P0-14 | PASS/FAIL | | 
P0-15 | PASS/FAIL | | 
P0-20 | PASS/FAIL | | 
P0-21 | PASS/FAIL | | 
P0-22 | PASS/FAIL | | 
P0-23 | PASS/FAIL | | 
P0-24 | PASS/FAIL | | 
P0-25 | PASS/FAIL | | 
P0-26 | PASS/FAIL | | 
P0-27 | PASS/FAIL | | 
P0-30 | PASS/FAIL | | 
P0-31 | PASS/FAIL | | 
P0-32 | PASS/FAIL | | 
P0-33 | PASS/FAIL | | 
P0-40 | PASS/FAIL | | 
P0-41 | PASS/FAIL | | 
P0-42 | PASS/FAIL | | 
P0-43 | PASS/FAIL | | 
P0-44 | PASS/FAIL | | 
P0-45 | PASS/FAIL | | 
P0-46 | PASS/FAIL | | 
P0-50 | PASS/FAIL | | 
P0-51 | PASS/FAIL | | 
P0-52 | PASS/FAIL | | 
```

## Test Record Template

Use one line per case:

`CASE_ID | PASS/FAIL | file/page used | short notes | follow-up issue`
