import type { SetReactionsPayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const setReactionsTool = {
  name: "figma.set_reactions",
  description: "Replace the prototyping reactions on a node.",
  schema: toolSchemas.setReactions,
  targetSummary: (input: SetReactionsPayload) => `set reactions on node ${input.nodeId}`,
  auditMode: () => "commit" as const
};
