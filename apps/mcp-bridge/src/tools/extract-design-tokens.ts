import type { ExtractDesignTokensPayload } from "@figma-auto/protocol";

import { toolSchemas } from "../schema/tool-schemas.js";

export const extractDesignTokensTool = {
  name: "figma.extract_design_tokens",
  description: "Extract a normalized design-token snapshot from local variables and styles.",
  schema: toolSchemas.extractDesignTokens,
  targetSummary: (input: ExtractDesignTokensPayload) =>
    input.collectionId ? `extract tokens from collection ${input.collectionId}` : "extract design tokens",
  auditMode: () => null
};
