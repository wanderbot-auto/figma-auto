# Manual Verification Record

Last updated: 2026-03-17

## Goal

This record is for coordinated manual verification between Codex and a human operator in Figma desktop.

We use it to track:

- the checkpoint being tested
- the tool or action used
- the expected result
- the completion status
- the actual observation and evidence

## Status Values

- `todo`: not started
- `running`: currently being verified
- `pass`: behavior matches the expectation
- `fail`: behavior does not match the expectation
- `blocked`: cannot proceed because of an unmet prerequisite

## Test Preconditions

Record the current environment before starting:

| Field | Value |
| --- | --- |
| Date | 2026-03-17 |
| Operator | |
| Figma file name | |
| Figma page name | |
| Plugin installed | yes |
| Plugin launched in current file | |
| Local bridge started | |
| Bridge URL | `ws://localhost:4318` |
| Bridge log | `logs/bridge.log` |
| Audit log | `logs/audit.ndjson` |

## Execution Notes

- Prefer verifying in a scratch Figma file, not a production file.
- For write operations, record the created node or page names so later checks can reference them.
- For every `fail`, capture the exact tool input, UI message, and any relevant log snippet.
- For every `pass`, record a short factual observation instead of only writing "ok".

## Checkpoints

| ID | Checkpoint | Tool / Action | Expected result | Status | Actual result / Evidence |
| --- | --- | --- | --- | --- | --- |
| ENV-01 | Plugin session is attached to the current file | Manual: open Figma file, launch plugin UI | Plugin UI loads without crash and shows a connection status area | `todo` | |
| ENV-02 | Local bridge is running | Shell: `npm run start:local` or `npm run dev:bridge` | Bridge process stays alive and `logs/bridge.log` is created or updated | `pass` | `figma_ping` reached the bridge and returned a structured bridge error, so the bridge is responding. |
| ENV-03 | Plugin can connect to the bridge | Manual: observe plugin UI after bridge starts | UI shows connected state, or equivalent success message, for `ws://localhost:4318` | `todo` | |
| ENV-04 | Bridge can see an active plugin session | Tool: `figma_ping` | Tool returns success instead of a missing-session error | `blocked` | `figma_ping` returned `missing_session: No active plugin session is attached`. The plugin appears not to be running in the current Figma file yet, or has not connected. |
| READ-01 | Read active file metadata | Tool: `figma_get_file` | Returns current file metadata with stable file identifier | `todo` | |
| READ-02 | Read current page metadata | Tool: `figma_get_current_page` | Returns the currently open page in the active file | `todo` | |
| READ-03 | Read current selection state | Tool: `figma_get_selection` | Returns empty selection when nothing is selected, or selected node metadata when something is selected | `todo` | |
| READ-04 | List pages in the file | Tool: `figma_list_pages` | Returns all pages and includes the current page | `todo` | |
| READ-05 | Read one node by ID | Tool: `figma_get_node` | Returns a normalized snapshot for a known node ID | `todo` | |
| READ-06 | Read a subtree by ID | Tool: `figma_get_node_tree` | Returns recursive child structure for the chosen node | `todo` | |
| WRITE-01 | Rename an existing node | Tool: `figma_rename_node` | Target node name changes in Figma and the tool call succeeds | `todo` | |
| WRITE-02 | Create a new page | Tool: `figma_create_page` | A new page appears with the requested name | `todo` | |
| WRITE-03 | Create a new frame | Tool: `figma_create_frame` | A new frame appears in the target page with the requested size and position if provided | `todo` | |
| WRITE-04 | Create a new text node | Tool: `figma_create_text` | A new text node appears in the target page or frame | `todo` | |
| WRITE-05 | Update text content | Tool: `figma_set_text` | The target text node content updates to the provided string | `todo` | |
| WRITE-06 | Re-parent a node | Tool: `figma_move_node` | Node moves under the requested parent and remains visible in the expected location | `todo` | |
| SAFE-01 | Delete is blocked without confirmation | Tool: `figma_delete_node` with `confirm: false` | Tool rejects the request and the node is not deleted | `todo` | |
| SAFE-02 | Delete succeeds with confirmation | Tool: `figma_delete_node` with `confirm: true` | Target node is deleted and the tool returns success | `todo` | |
| SAFE-03 | Batch edit supports dry run | Tool: `figma_batch_edit` with `dryRun: true` | Tool returns a preview result and the document remains unchanged | `todo` | |
| SAFE-04 | Batch edit can commit changes | Tool: `figma_batch_edit` with `dryRun: false` and `confirm: true` | Tool applies the listed operations and reports per-op results | `todo` | |
| SAFE-05 | Write operations are audited | File check: `logs/audit.ndjson` | Committed write operations append audit entries with enough context to trace the change | `todo` | |

## Detailed Run Log

Use this section to append chronological notes as we execute the plan.

### 2026-03-17 Initial Checks

```text
[current turn]
- checkpoint: ENV-04
- tool or action: figma_ping
- input: {}
- expected: active plugin session is attached and ping succeeds
- observed: bridge responded with missing_session / No active plugin session is attached
- status: blocked
- follow-up: ask the human operator to launch the plugin in the target Figma file and keep the plugin window open, then retry ENV-03 and ENV-04
```

```text
[follow-up fix]
- checkpoint: ENV-01 / ENV-03
- tool or action: inspect plugin UI build pipeline
- input: apps/figma-plugin/scripts/build.mjs and dist/ui.html
- expected: UI script loads and updates the boot message
- observed: UI was built with a large inline script; rebuilt it as external dist/ui.js and reduced the UI bundle size
- status: ready for re-test
- follow-up: relaunch the plugin in Figma and verify the status changes away from "Boot HTML loaded. Waiting for UI script..."
```

### Entry Template

```text
[time]
- checkpoint:
- tool or action:
- input:
- expected:
- observed:
- status:
- follow-up:
```

## Suggested Execution Order

1. Finish all `ENV-*` checks first.
2. Run `READ-*` checks before any write.
3. Use a single scratch page or frame for `WRITE-*` and `SAFE-*` checks.
4. Verify `SAFE-05` only after at least one committed write has succeeded.
