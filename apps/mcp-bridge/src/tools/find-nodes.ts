import type { FindNodesPayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

function summarizeFindNodesTarget(input: FindNodesPayload): string {
  const filters = [
    input.nameExact ? `name=${input.nameExact}` : null,
    input.nameContains ? `name~=${input.nameContains}` : null,
    input.textContains ? `text~=${input.textContains}` : null,
    input.type ? `type=${input.type}` : null,
    input.styleId ? `style=${input.styleId}` : null,
    input.variableId ? `variable=${input.variableId}` : null,
    input.componentId ? `component=${input.componentId}` : null,
    input.instanceOnly ? "instanceOnly=true" : null
  ].filter(Boolean);

  return `${input.nodeId ? `within ${input.nodeId}` : "within current page"} (${filters.join(", ")})`;
}

export const findNodesTool = {
  name: "figma.find_nodes",
  description: "Search for nodes within the current page or a specific root node.",
  schema: toolSchemas.findNodes,
  targetSummary: summarizeFindNodesTarget,
  auditMode: () => null
};
