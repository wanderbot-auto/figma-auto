# Context Optimization Plan

## Background

The current `figma-auto` request path is:

`Codex -> mcp-bridge tools -> WebSocket -> figma-plugin -> response`

This path works, but frequent read/write operations can consume too much model context. The main issue is not the number of tools. It is that many responses are heavier than necessary by default.

Relevant implementation points:

- Bridge formats all tool results as pretty JSON text:
  - [apps/mcp-bridge/src/format.ts](/Users/wander/Documents/code/apps/figma-auto/apps/mcp-bridge/src/format.ts:1)
  - [apps/mcp-bridge/src/server.ts](/Users/wander/Documents/code/apps/figma-auto/apps/mcp-bridge/src/server.ts:215)
- Heavy read defaults:
  - [apps/figma-plugin/src/handlers/read.ts](/Users/wander/Documents/code/apps/figma-auto/apps/figma-plugin/src/handlers/read.ts:421)
  - [apps/figma-plugin/src/handlers/variables.ts](/Users/wander/Documents/code/apps/figma-auto/apps/figma-plugin/src/handlers/variables.ts:155)
  - [apps/figma-plugin/src/handlers/components.ts](/Users/wander/Documents/code/apps/figma-auto/apps/figma-plugin/src/handlers/components.ts:79)
  - [apps/figma-plugin/src/handlers/high-level.ts](/Users/wander/Documents/code/apps/figma-auto/apps/figma-plugin/src/handlers/high-level.ts:162)
- Heavy write responses:
  - [apps/figma-plugin/src/handlers/write.ts](/Users/wander/Documents/code/apps/figma-auto/apps/figma-plugin/src/handlers/write.ts:141)
  - [apps/figma-plugin/src/handlers/styles.ts](/Users/wander/Documents/code/apps/figma-auto/apps/figma-plugin/src/handlers/styles.ts:164)
  - [apps/figma-plugin/src/handlers/update-node-properties.ts](/Users/wander/Documents/code/apps/figma-auto/apps/figma-plugin/src/handlers/update-node-properties.ts:294)

## Goals

- Reduce Codex context consumption during normal Figma workflows
- Preserve current tool capability and result fidelity
- Avoid breaking existing MCP clients
- Make heavy detail opt-in where possible
- Prefer low-risk, reversible changes first

## Non-goals

- No large protocol redesign
- No tool removals
- No aggressive default behavior changes in the first stage
- No optimization that reduces editing quality or verification confidence

## Current Problems

### 1. Bridge response formatting is wasteful

The bridge currently returns pretty-printed JSON:

- `JSON.stringify(value, null, 2)`

That increases token usage with no semantic benefit.

## 2. Some read tools are heavy by default

Current default behavior includes:

- `get_variables` defaults to `includeValues = true`
- `get_components` defaults to `includeProperties = true`
- `get_node` returns full `NodeDetails`
- `get_node_tree` returns full recursive `NodeTreeNode`
- `extract_design_tokens` can return full variables and styles

These defaults are useful for inspection, but too heavy for many agent workflows.

## 3. Some write tools return more than needed

Many write operations return full `describeNodeAsync(node)` payloads. For most agent workflows, the minimum useful response is:

- `id`
- `name`
- `parentId`
- changed field list
- key result metadata such as `sourceNodeId`, `text`, or `index`

## Design Principles

### 1. Full fidelity must remain available

Any compact result must still have a path to fetch complete detail.

### 2. Default should favor agent workflows

Responses should be optimized for repeated machine use, not manual reading of large JSON blocks.

### 3. Compatibility first

The first phases should not break existing callers.

### 4. Minimal write confirmation

Write responses should confirm success with just enough state to continue safely.

### 5. Heavy reads should be explicit

Large tree, token, variable-value, and deep metadata reads should require explicit intent.

## Proposed Rollout

## Phase 0: Zero-risk optimization

### 0.1 Return compact JSON instead of pretty JSON

Change bridge formatting from:

- `JSON.stringify(value, null, 2)`

to:

- `JSON.stringify(value)`

Apply this to:

- tool results
- resource results
- protocol errors

Expected benefit:

- immediate token reduction
- no protocol changes
- no field changes
- no behavior changes

Risk:

- very low
- only human readability changes

This should be the first implementation step.

## Phase 1: Make resources lighter by default

Resources are best used as browse entry points. They do not need maximum detail by default.

### 1.1 Suggested resource adjustments

- `figma://variables` should use `includeValues: false`
- `figma://components` should use `includeProperties: false`
- `figma://styles` should keep `includeDetails: false`
- `figma://node-tree/{nodeId}` list entries should remain minimal

Relevant file:

- [apps/mcp-bridge/src/resources.ts](/Users/wander/Documents/code/apps/figma-auto/apps/mcp-bridge/src/resources.ts:46)

Expected benefit:

- lighter browse and discovery flows
- lower chance that Codex pulls oversized resource payloads unnecessarily

Risk:

- very low
- full detail remains available through tools

## Phase 2: Add explicit lightweight modes to heavy read tools

This phase adds optional parameters without changing current defaults.

### 2.1 `figma.get_node`

Add optional flags:

- `includeDesign?: boolean`
- `includePrototype?: boolean`
- `includeTextContent?: boolean`
- `includePaints?: boolean`

Intended use:

- fast inspection with most detail disabled
- explicit deep inspection only when needed

### 2.2 `figma.get_node_tree`

Add optional flags:

- `summaryOnly?: boolean`
- `includeDesign?: boolean`
- `includePrototype?: boolean`
- `includeTextContent?: boolean`

Suggested behavior:

- when `summaryOnly = true`, each node should return a compact snapshot rather than full `NodeDetails`
- detailed node inspection should then be done with `get_node`

### 2.3 `figma.extract_design_tokens`

Add optional flag:

- `summaryOnly?: boolean`

Suggested behavior:

- return counts and collection summaries without full token payloads
- keep full extraction available when explicitly requested

### 2.4 `figma.create_spec_page`

Add optional flags:

- `includeTokenPayload?: boolean`
- `includeVariableValues?: boolean`
- `includeSourceNodeDetails?: boolean`

Reason:

This tool currently has a path to embed large JSON blocks into the generated page content. That is useful in some cases, but too heavy as a default direction for agent workflows.

Expected benefit:

- same feature surface
- better control over large payload generation

Risk:

- low
- additive only

## Phase 3: Add compact write responses

This phase also stays compatibility-safe by adding options rather than changing defaults.

### 3.1 Add a common opt-in flag

For write tools, add:

- `returnNodeDetails?: boolean`

Candidate tools:

- `create_frame`
- `create_rectangle`
- `create_component`
- `create_instance`
- `create_text`
- `duplicate_node`
- `move_node`
- `apply_styles`
- `update_node_properties`
- `set_reactions`

### 3.2 Compact response shape

When `returnNodeDetails = false`, keep:

- `node: NodeSummary`
- `updatedFields` or `appliedFields`
- `sourceNodeId` or `sourceComponentId`
- `parentId`
- `index`
- `text`
- `reactionCount`

Avoid returning by default:

- full fills/strokes
- full design metadata
- full prototype metadata
- full typography snapshots

Expected benefit:

- much lighter write-confirmation loops
- no loss of safety because callers can follow up with `get_node`

Risk:

- medium-low
- requires protocol extension, but can remain backward compatible

## Phase 4: Calling strategy guidance

This phase requires no protocol changes and should be part of usage guidance.

### 4.1 Recommended read sequence

Use:

1. `get_selection` or `find_nodes`
2. `get_node`
3. `get_node_tree` only when recursive structure is actually needed

### 4.2 Recommended write sequence

Use:

1. write tool
2. rely on compact write result when possible
3. call `get_node` only when validation requires more detail

### 4.3 Recommended token and variable sequence

Use:

1. summary-level query first
2. then filtered or collection-specific detail queries

### 4.4 Patterns to avoid

- calling full-page `get_node_tree` early
- using full `extract_design_tokens` in normal editing loops
- using `get_variables(includeValues=true)` for casual inspection
- calling full tree reads immediately after every mutation

## Recommended Execution Order

### Batch 1

- compact JSON at the bridge layer
- lighter resource defaults

Reason:

- lowest risk
- immediate token savings
- no client behavior break

### Batch 2

- add lightweight flags to `get_node`, `get_node_tree`, and `extract_design_tokens`

Reason:

- biggest gains on read-heavy workflows
- still backward compatible

### Batch 3

- add `returnNodeDetails` to heavy write tools

Reason:

- reduces mutation-loop payload size
- requires slightly more protocol work

### Batch 4

- only after validating client behavior, consider changing some defaults

Reason:

- highest compatibility risk
- should come last

## Compatibility Strategy

- do not remove any fields
- do not remove any tools
- do not change tool defaults in the first stages
- start with representation-layer compression and additive flags
- only consider default behavior changes after downstream validation

## Acceptance Criteria

### Functional correctness

- existing MCP workflows continue to function
- write operations still provide enough confirmation to proceed safely
- full detail can still be fetched explicitly

### Context savings

- average response size drops for `get_variables`, `get_components`, `get_node_tree`, and `extract_design_tokens`
- common edit workflows consume noticeably fewer tokens overall

### Rollback safety

- each phase can be reverted independently
- no all-at-once client migration is required

## Recommendation

The safest path is:

1. compress bridge output formatting
2. make resources lighter by default
3. add lightweight modes to heavy read tools
4. add compact response modes to heavy write tools
5. only then consider changing defaults

This preserves capability and quality while lowering model context pressure in the normal Codex workflow.
