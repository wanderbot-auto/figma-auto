import type { PluginRuntimeContext } from "../types.js";

export function buildPluginRuntimeContext(pluginInstanceId: string): PluginRuntimeContext {
  return {
    pluginInstanceId,
    fileName: figma.root.name,
    fileKey: figma.fileKey ?? null,
    pageName: figma.currentPage.name,
    pageId: figma.currentPage.id,
    selectionCount: figma.currentPage.selection.length,
    editorType: "figma"
  };
}
