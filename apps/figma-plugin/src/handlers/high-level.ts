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

const SPEC_CONTENT_X = 64;
const SPEC_CONTENT_Y = 64;
const MAX_SPEC_TEXT_NODE_CHARS = 12000;

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

interface SpecSection {
  title: string;
  content: string;
}

function splitSpecSectionContent(content: string, maxChars: number): string[] {
  if (content.length <= maxChars) {
    return [content];
  }

  const chunks: string[] = [];
  const lines = content.split("\n");
  let current = "";

  const flushCurrent = () => {
    if (current.length > 0) {
      chunks.push(current);
      current = "";
    }
  };

  for (const line of lines) {
    const candidate = current.length === 0 ? line : `${current}\n${line}`;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    flushCurrent();

    if (line.length <= maxChars) {
      current = line;
      continue;
    }

    let start = 0;
    while (start < line.length) {
      chunks.push(line.slice(start, start + maxChars));
      start += maxChars;
    }
  }

  flushCurrent();
  return chunks;
}

function buildSpecSections(input: {
  pageName: string;
  fileName: string;
  generatedAt: string;
  sourcePageName: string;
  sourcePageId: string;
  sourceNodeSummary?: unknown;
  selectionSummary?: unknown;
  variableSummary?: unknown;
  tokenSnapshot?: unknown;
}): SpecSection[] {
  const sections: SpecSection[] = [
    {
      title: "Overview",
      content: [
        `Spec Page: ${input.pageName}`,
        `File: ${input.fileName}`,
        `Generated At: ${input.generatedAt}`,
        `Source Page: ${input.sourcePageName} (${input.sourcePageId})`
      ].join("\n")
    }
  ];

  if (input.sourceNodeSummary !== undefined) {
    sections.push({
      title: "Source Node",
      content: JSON.stringify(input.sourceNodeSummary, null, 2)
    });
  }

  if (input.selectionSummary !== undefined) {
    sections.push({
      title: "Selection",
      content: JSON.stringify(input.selectionSummary, null, 2)
    });
  }

  if (input.variableSummary !== undefined) {
    sections.push({
      title: "Variables",
      content: JSON.stringify(input.variableSummary, null, 2)
    });
  }

  if (input.tokenSnapshot !== undefined) {
    sections.push({
      title: "Design Tokens",
      content: JSON.stringify(input.tokenSnapshot, null, 2)
    });
  }

  return sections;
}

async function appendSpecSectionNodes(
  container: FrameNode,
  section: SpecSection,
  preparedFontNode: TextNode
): Promise<void> {
  const sectionHeader = figma.createText();
  sectionHeader.name = `${section.title} Heading`;
  sectionHeader.characters = section.title;
  sectionHeader.fontName = preparedFontNode.fontName;
  if (typeof preparedFontNode.fontSize === "number") {
    sectionHeader.fontSize = Math.max(preparedFontNode.fontSize + 4, 18);
  }
  container.appendChild(sectionHeader);

  const bodyChunkLimit = Math.max(2000, MAX_SPEC_TEXT_NODE_CHARS - section.title.length - 2);
  const chunks = splitSpecSectionContent(section.content, bodyChunkLimit);
  chunks.forEach((chunk, index) => {
    const text = figma.createText();
    text.name = chunks.length > 1 ? `${section.title} ${index + 1}` : section.title;
    text.characters = chunk;
    text.fontName = preparedFontNode.fontName;
    if (typeof preparedFontNode.fontSize === "number") {
      text.fontSize = preparedFontNode.fontSize;
    }
    text.textAutoResize = "HEIGHT";
    container.appendChild(text);
  });
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
  const generatedAt = new Date().toISOString();
  const sourceNodeSummary = payload.sourceNodeId && sourceNode
    ? (includeSourceNodeDetails ? await describeNodeAsync(sourceNode) : summarizeNode(sourceNode))
    : undefined;
  const selectionSummary = includeSelection
    ? figma.currentPage.selection.map((node) => summarizeNode(node))
    : undefined;
  const variableSummary = variableSnapshot
    ? { collections: variableSnapshot.collections, totalVariables: variableSnapshot.totalVariables }
    : undefined;

  const sections = buildSpecSections({
    pageName: page.name,
    fileName: figma.root.name,
    generatedAt,
    sourcePageName: figma.currentPage.name,
    sourcePageId: figma.currentPage.id,
    sourceNodeSummary,
    selectionSummary,
    variableSummary,
    tokenSnapshot: tokenSnapshot ?? undefined
  });

  const contentFrame = figma.createFrame();
  contentFrame.name = "Spec Content";
  contentFrame.layoutMode = "VERTICAL";
  contentFrame.primaryAxisSizingMode = "AUTO";
  contentFrame.counterAxisSizingMode = "AUTO";
  contentFrame.itemSpacing = 24;
  contentFrame.paddingTop = 24;
  contentFrame.paddingRight = 24;
  contentFrame.paddingBottom = 24;
  contentFrame.paddingLeft = 24;
  contentFrame.fills = [];
  contentFrame.strokes = [];
  contentFrame.x = SPEC_CONTENT_X;
  contentFrame.y = SPEC_CONTENT_Y;
  page.appendChild(contentFrame);

  const preparedFontNode = figma.createText();
  await loadFontsForNode(preparedFontNode);
  for (const section of sections) {
    await appendSpecSectionNodes(contentFrame, section, preparedFontNode);
  }
  preparedFontNode.remove();

  return {
    page: {
      id: page.id,
      name: page.name
    },
    contentNodeId: contentFrame.id,
    sourceSummary: sourceNode ? summarizeNode(sourceNode) : undefined
  };
}
