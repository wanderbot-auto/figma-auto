# Roadmap

This file is the restart-oriented status snapshot for future Codex sessions.

## Shipped

- stable protocol / bridge / plugin split
- file/page/selection/node/tree reads
- style, component, and variable reads
- `find_nodes.textContains`
- create frame / rectangle / component / instance / text
- duplicate / move / delete
- style application
- bounded node property updates
- instance property updates
- image fills
- `batch_edit_v2` with `opId` references
- token extraction and plain-text spec page generation

## Current Gaps

- no plugin-side automated test suite
- `batch-v2.ts`, `read.ts`, `messages.ts`, and `zod.ts` are still large
- no one-shot nested composition format beyond sequential batch ops
- missing more primitives like ellipse / line / section
- missing richer media workflows such as local import, crop helpers, and video/media placement
- search can go further on variants, ancestry, and stronger design-system matching
- no rollback/snapshot safety layer for large edits

## Next Priorities

1. plugin-side tests for write handlers and batch behavior
2. nested composition helpers on top of `batch_edit_v2`
3. richer media workflows
4. richer search over components, styles, variants, and variables
5. more primitives and layout-aware insertion helpers

## Good Restart Entry Points

- repo overview: `README.md`
- run/debug: `docs/local-dev.md`
- tools and limits: `docs/tool-surface.md`
- architecture and main files: `docs/architecture.md`
- next work: this file
