# Tool Surface

This is the current MCP surface registered by `apps/mcp-bridge/src/tools/index.ts` and `apps/mcp-bridge/src/resources.ts`.

## Resources

- `figma://session/status`
- `figma://file/current`
- `figma://page/current`
- `figma://selection/current`
- `figma://pages`
- `figma://styles`
- `figma://components`
- `figma://variables`

## Resource Templates

- `figma://node/{nodeId}`
- `figma://node-tree/{nodeId}`
- `figma://flow/{pageId}`

## Session

- `figma.get_session_status`
- `figma.ping`

## Read

- `figma.get_file`
- `figma.get_current_page`
- `figma.get_flow`
- `figma.get_selection`
- `figma.list_pages`
- `figma.get_node`
- `figma.get_node_tree`
- `figma.find_nodes`
- `figma.get_styles`
- `figma.get_components`
- `figma.get_variables`

## Write

- `figma.rename_node`
- `figma.create_page`
- `figma.create_frame`
- `figma.create_rectangle`
- `figma.create_component`
- `figma.create_instance`
- `figma.create_text`
- `figma.duplicate_node`
- `figma.set_text`
- `figma.apply_styles`
- `figma.update_node_properties`
- `figma.set_instance_properties`
- `figma.set_image_fill`
- `figma.set_reactions`
- `figma.move_node`
- `figma.delete_node`

## Batch And Higher-Level

- `figma.batch_edit`
- `figma.batch_edit_v2`
- `figma.normalize_names`
- `figma.create_spec_page`
- `figma.extract_design_tokens`

## Variable

- `figma.create_variable_collection`
- `figma.create_variable`
- `figma.bind_variable`

## Important Limits

- `find_nodes.limit` defaults to `50`, max `200`
- `normalize_names` defaults to dry-run and caps result reporting at `500`
- `batch_edit` max ops: `10`
- `batch_edit_v2` max ops: `25`
- destructive commit-style operations require `confirm: true`
- normalized paints only include `SOLID` and `IMAGE`
- variables and styles are local-file only

## Notes

- `batch_edit` is the older bounded surface
- `batch_edit_v2` is the main batch engine and supports `{ fromOp, field }` references
- `get_node` and `get_node_tree` include design metadata when available
- `set_image_fill` accepts an existing `imageHash` or a remote/data `src`
