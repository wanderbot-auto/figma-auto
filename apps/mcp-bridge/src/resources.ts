import { type GetSessionStatusResult, type ToolName } from "@figma-auto/protocol";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

import { formatJson } from "./format.js";
import { type PluginSessionStore } from "./session/plugin-session-store.js";
import { type PluginWebSocketBridge } from "./transport/websocket.js";

const JSON_MIME_TYPE = "application/json";

interface RegisterBridgeResourcesOptions {
  mcpServer: McpServer;
  sessionStore: PluginSessionStore;
  wsBridge: PluginWebSocketBridge;
  getSessionStatus: () => GetSessionStatusResult;
}

function toResourceResult(uri: string, value: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: JSON_MIME_TYPE,
        text: formatJson(value)
      }
    ]
  };
}

function registerStaticToolResource(
  mcpServer: McpServer,
  wsBridge: PluginWebSocketBridge,
  name: string,
  uri: string,
  description: string,
  toolName: ToolName,
  payload: Record<string, unknown> = {}
): void {
  mcpServer.registerResource(
    name,
    uri,
    {
      description,
      mimeType: JSON_MIME_TYPE
    },
    async () => {
      const result = await wsBridge.callPlugin(toolName, payload);
      return toResourceResult(uri, result);
    }
  );
}

export function registerBridgeResources({
  mcpServer,
  sessionStore,
  wsBridge,
  getSessionStatus
}: RegisterBridgeResourcesOptions): void {
  mcpServer.registerResource(
    "figma-session-status",
    "figma://session/status",
    {
      description: "Read-only bridge connection and active Figma session status.",
      mimeType: JSON_MIME_TYPE
    },
    async () => toResourceResult("figma://session/status", getSessionStatus())
  );

  registerStaticToolResource(
    mcpServer,
    wsBridge,
    "figma-current-file",
    "figma://file/current",
    "Read-only snapshot of the active Figma file metadata.",
    "figma.get_file"
  );
  registerStaticToolResource(
    mcpServer,
    wsBridge,
    "figma-current-page",
    "figma://page/current",
    "Read-only snapshot of the current page, selection, and child IDs.",
    "figma.get_current_page"
  );
  registerStaticToolResource(
    mcpServer,
    wsBridge,
    "figma-current-selection",
    "figma://selection/current",
    "Read-only snapshot of the current page selection.",
    "figma.get_selection"
  );
  registerStaticToolResource(
    mcpServer,
    wsBridge,
    "figma-pages",
    "figma://pages",
    "Read-only list of pages in the active Figma file.",
    "figma.list_pages"
  );
  registerStaticToolResource(
    mcpServer,
    wsBridge,
    "figma-styles",
    "figma://styles",
    "Read-only list of local styles in the active Figma file.",
    "figma.get_styles"
  );
  registerStaticToolResource(
    mcpServer,
    wsBridge,
    "figma-components",
    "figma://components",
    "Read-only list of local components in the active Figma file.",
    "figma.get_components"
  );
  registerStaticToolResource(
    mcpServer,
    wsBridge,
    "figma-variables",
    "figma://variables",
    "Read-only list of local variables in the active Figma file.",
    "figma.get_variables"
  );

  mcpServer.registerResource(
    "figma-node",
    new ResourceTemplate("figma://node/{nodeId}", {
      list: undefined
    }),
    {
      description: "Read-only normalized snapshot of a specific Figma node by node ID.",
      mimeType: JSON_MIME_TYPE
    },
    async (uri, variables) => {
      const nodeId = String(variables.nodeId ?? "");
      const result = await wsBridge.callPlugin("figma.get_node", { nodeId });
      return toResourceResult(uri.toString(), result);
    }
  );

  mcpServer.registerResource(
    "figma-node-tree",
    new ResourceTemplate("figma://node-tree/{nodeId}", {
      list: () => {
        const activeSession = sessionStore.getActive();
        if (!activeSession) {
          return { resources: [] };
        }

        return {
          resources: [
            {
              uri: `figma://node-tree/${encodeURIComponent(activeSession.context.pageId)}`,
              name: "current-page-tree",
              description: "Node tree for the active page root.",
              mimeType: JSON_MIME_TYPE
            }
          ]
        };
      }
    }),
    {
      description: "Read-only normalized subtree for a specific node ID.",
      mimeType: JSON_MIME_TYPE
    },
    async (uri, variables) => {
      const nodeId = String(variables.nodeId ?? "");
      const result = await wsBridge.callPlugin("figma.get_node_tree", { nodeId });
      return toResourceResult(uri.toString(), result);
    }
  );

  mcpServer.registerResource(
    "figma-flow",
    new ResourceTemplate("figma://flow/{pageId}", {
      list: () => {
        const activeSession = sessionStore.getActive();
        if (!activeSession) {
          return { resources: [] };
        }

        return {
          resources: [
            {
              uri: `figma://flow/${encodeURIComponent(activeSession.context.pageId)}`,
              name: "current-page-flow",
              description: "Prototype flow summary for the active page.",
              mimeType: JSON_MIME_TYPE
            }
          ]
        };
      }
    }),
    {
      description: "Read-only prototype flow summary for a specific page ID.",
      mimeType: JSON_MIME_TYPE
    },
    async (uri, variables) => {
      const pageId = String(variables.pageId ?? "");
      const result = await wsBridge.callPlugin("figma.get_flow", { pageId });
      return toResourceResult(uri.toString(), result);
    }
  );
}
