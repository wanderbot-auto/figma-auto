import type { PluginRuntimeContext } from "../types.js";

export function buildPluginRuntimeContext(pluginInstanceId: string): PluginRuntimeContext {
  return {
    pluginInstanceId,
    fileKey: figma.fileKey ?? null,
    pageId: figma.currentPage.id,
    editorType: "figma"
  };
}
