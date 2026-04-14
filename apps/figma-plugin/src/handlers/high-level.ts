import type {
  CreateSpecPagePayload,
  CreateSpecPageResult,
  ExtractDesignTokensPayload,
  ExtractDesignTokensResult,
  NormalizeNameItemResult,
  NormalizeNamesPayload,
  NormalizeNamesResult,
  StyleTokenSummary
} from "@figma-auto/protocol";

import { hasChildren, isSceneNode, requireBaseNode } from "./node-helpers.js";
import { getVariables } from "./variables.js";
import { describeNodeAsync, summarizeNode } from "./read.js";
import { loadFontsForNode } from "./write.js";

function toSerializable(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function toTitleCase(value: string): string {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function normalizeName(name: string, caseStyle: NormalizeNamesPayload["caseStyle"]): string {
  const collapsed = name.trim().replace(/\s+/g, " ").replace(/\s*\/\s*/g, " / ");
  switch (caseStyle ?? "none") {
    case "upper":
      return collapsed.toUpperCase();
    case "lower":
      return collapsed.toLowerCase();
    case "title":
      return toTitleCase(collapsed);
    default:
      return collapsed;
  }
}

function collectNodesForNormalization(
  node: BaseNode,
  depth: number | undefined,
  includeHidden: boolean,
  results: BaseNode[]
): void {
  if (isSceneNode(node) && !includeHidden && !node.visible) {
    return;
  }

  results.push(node);
  if (!hasChildren(node) || depth === 0) {
    return;
  }

  const nextDepth = depth === undefined ? undefined : depth - 1;
  for (const child of node.children) {
    collectNodesForNormalization(child, nextDepth, includeHidden, results);
  }
}

function serializePaintStyle(style: PaintStyle): StyleTokenSummary {
  return {
    id: style.id,
    name: style.name,
    type: "PAINT",
    value: {
      paints: toSerializable(style.paints)
    },
    boundVariables: style.boundVariables ? (toSerializable(style.boundVariables) as Record<string, unknown>) : undefined
  };
}

function serializeTextStyle(style: TextStyle): StyleTokenSummary {
  return {
    id: style.id,
    name: style.name,
    type: "TEXT",
    value: {
      fontName: style.fontName,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      paragraphSpacing: style.paragraphSpacing,
      paragraphIndent: style.paragraphIndent
    },
    boundVariables: style.boundVariables ? (toSerializable(style.boundVariables) as Record<string, unknown>) : undefined
  };
}

function serializeEffectStyle(style: EffectStyle): StyleTokenSummary {
  return {
    id: style.id,
    name: style.name,
    type: "EFFECT",
    value: {
      effects: toSerializable(style.effects)
    },
    boundVariables: style.boundVariables ? (toSerializable(style.boundVariables) as Record<string, unknown>) : undefined
  };
}

function serializeGridStyle(style: GridStyle): StyleTokenSummary {
  return {
    id: style.id,
    name: style.name,
    type: "GRID",
    value: {
      layoutGrids: toSerializable(style.layoutGrids)
    },
    boundVariables: style.boundVariables ? (toSerializable(style.boundVariables) as Record<string, unknown>) : undefined
  };
}

async function buildDesignTokenSnapshot(
  payload: ExtractDesignTokensPayload & {
    includeVariableValues?: boolean;
  }
): Promise<ExtractDesignTokensResult> {
  const includeVariables = payload.includeVariables ?? true;
  const includeStyles = payload.includeStyles ?? true;
  const summaryOnly = payload.summaryOnly ?? false;
  const includeVariableValues = payload.includeVariableValues ?? true;
  const variableResult = includeVariables
    ? await getVariables({
        collectionId: payload.collectionId,
        includeValues: summaryOnly ? false : includeVariableValues
      })
    : { collections: [], variables: [], totalVariables: 0 };

  const styleGroups = includeStyles
    ? await Promise.all([
        figma.getLocalPaintStylesAsync(),
        figma.getLocalTextStylesAsync(),
        figma.getLocalEffectStylesAsync(),
        figma.getLocalGridStylesAsync()
      ])
    : [[], [], [], []];
  const styleCount = styleGroups.reduce((total, group) => total + group.length, 0);
  const styles = summaryOnly || !includeStyles
    ? []
    : [
        ...styleGroups[0].map((style) => serializePaintStyle(style)),
        ...styleGroups[1].map((style) => serializeTextStyle(style)),
        ...styleGroups[2].map((style) => serializeEffectStyle(style)),
        ...styleGroups[3].map((style) => serializeGridStyle(style))
      ];

  return {
    summary: `Extracted ${variableResult.totalVariables} variables across ${variableResult.collections.length} collections and ${styleCount} styles`,
    collections: variableResult.collections,
    variables: summaryOnly ? [] : variableResult.variables,
    styles,
    counts: {
      collectionCount: variableResult.collections.length,
      variableCount: variableResult.totalVariables,
      styleCount
    }
  };
}

export async function normalizeNames(payload: NormalizeNamesPayload): Promise<NormalizeNamesResult> {
  const root = payload.nodeId ? await requireBaseNode(payload.nodeId) : figma.currentPage;
  const dryRun = payload.dryRun ?? true;
  if (!dryRun && payload.confirm !== true) {
    throw new Error("Committed normalize_names requires confirm=true");
  }

  const nodes: BaseNode[] = [];
  collectNodesForNormalization(root, payload.depth, payload.includeHidden ?? false, nodes);

  const limit = payload.limit ?? 200;
  const results: NormalizeNameItemResult[] = [];
  let renamedCount = 0;

  for (const node of nodes) {
    if (!("name" in node) || typeof node.name !== "string") {
      continue;
    }

    const afterName = normalizeName(node.name, payload.caseStyle);
    const wouldChange = node.name !== afterName;
    if (!wouldChange) {
      continue;
    }

    if (results.length < limit) {
      results.push({
        nodeId: node.id,
        beforeName: node.name,
        afterName,
        wouldChange
      });
    }
    renamedCount += 1;
    if (!dryRun) {
      node.name = afterName;
    }
  }

  return {
    dryRun,
    root: summarizeNode(root),
    renamedCount,
    truncated: renamedCount > results.length,
    results
  };
}

export async function extractDesignTokens(payload: ExtractDesignTokensPayload): Promise<ExtractDesignTokensResult> {
  return buildDesignTokenSnapshot(payload);
}

export async function createSpecPage(payload: CreateSpecPagePayload): Promise<CreateSpecPageResult> {
  const sourceNode = payload.sourceNodeId ? await requireBaseNode(payload.sourceNodeId) : null;
  const page = figma.createPage();
  page.name = payload.name ?? "Specs";
  if (page.parent !== figma.root) {
    figma.root.appendChild(page);
  }

  const includeVariables = payload.includeVariables ?? true;
  const includeSelection = payload.includeSelection ?? true;
  const includeTokens = payload.includeTokens ?? true;
  const includeTokenPayload = payload.includeTokenPayload ?? true;
  const includeVariableValues = payload.includeVariableValues ?? true;
  const includeSourceNodeDetails = payload.includeSourceNodeDetails ?? true;
  const tokenSnapshot = includeTokens
    ? await buildDesignTokenSnapshot({
        includeVariables,
        includeStyles: true,
        includeVariableValues,
        summaryOnly: !includeTokenPayload
      })
    : null;
  const variableSnapshot = !includeTokens && includeVariables
    ? await getVariables({ includeValues: includeVariableValues })
    : null;

  const specLines = [
    `Spec Page: ${page.name}`,
    "",
    `File: ${figma.root.name}`,
    `Generated At: ${new Date().toISOString()}`,
    `Source Page: ${figma.currentPage.name} (${figma.currentPage.id})`,
    payload.sourceNodeId && sourceNode
      ? `Source Node: ${JSON.stringify(
          includeSourceNodeDetails ? await describeNodeAsync(sourceNode) : summarizeNode(sourceNode)
        )}`
      : null,
    includeSelection
      ? `Selection: ${JSON.stringify(figma.currentPage.selection.map((node) => summarizeNode(node)))}`
      : null,
    variableSnapshot
      ? `Variables: ${JSON.stringify({ collections: variableSnapshot.collections, totalVariables: variableSnapshot.totalVariables }, null, 2)}`
      : null,
    tokenSnapshot ? `Design Tokens: ${JSON.stringify(tokenSnapshot, null, 2)}` : null
  ].filter((line): line is string => Boolean(line));

  const text = figma.createText();
  text.name = "Spec Content";
  await loadFontsForNode(text);
  text.characters = specLines.join("\n");
  text.x = 64;
  text.y = 64;
  page.appendChild(text);

  return {
    page: {
      id: page.id,
      name: page.name
    },
    contentNodeId: text.id,
    sourceSummary: sourceNode ? summarizeNode(sourceNode) : undefined
  };
}
