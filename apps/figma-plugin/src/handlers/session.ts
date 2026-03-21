import type { PluginRuntimeContext } from "../types.js";

export function buildPluginRuntimeContext(pluginInstanceId: string): PluginRuntimeContext {
  const fileName = safeRead(() => figma.root.name, "Untitled file");
  const fileKey = safeRead(() => figma.fileKey ?? null, null);
  const pageName = safeRead(() => figma.currentPage.name, "Current page");
  const pageId = safeRead(() => figma.currentPage.id, "");
  const selectionCount = safeRead(() => figma.currentPage.selection.length, 0);

  return {
    pluginInstanceId,
    fileName,
    fileKey,
    pageName,
    pageId,
    selectionCount,
    editorType: "figma"
  };
}

function safeRead<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}
