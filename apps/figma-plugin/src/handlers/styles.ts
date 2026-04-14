import type {
  ApplyStylesPayload,
  ApplyStylesResult,
  GetStylesPayload,
  GetStylesResult,
  StyleSummary,
  StyleType
} from "@figma-auto/protocol";

import {
  hasEffects,
  hasFills,
  hasGridStyle,
  hasStrokes,
  isTextNode,
  requireSceneNode
} from "./node-helpers.js";
import { describeNodeAsync, summarizeNode } from "./read.js";
import { loadFontsForNode } from "./write.js";

async function requireStyle(styleId: string, expectedType: StyleType) {
  const style = await figma.getStyleByIdAsync(styleId);
  if (!style) {
    throw new Error(`Style ${styleId} was not found`);
  }
  if (style.type !== expectedType) {
    throw new Error(`Style ${styleId} is not a ${expectedType} style`);
  }

  return style;
}

function toSerializable(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function serializeStyle(style: BaseStyle, includeDetails: boolean): StyleSummary {
  const summary: StyleSummary = {
    id: style.id,
    key: style.key,
    name: style.name,
    type: style.type,
    ...(style.description ? { description: style.description } : {}),
    ...(style.boundVariables ? { boundVariables: toSerializable(style.boundVariables) } : {})
  };

  if (!includeDetails) {
    return summary;
  }

  switch (style.type) {
    case "PAINT":
      summary.value = toSerializable({ paints: style.paints });
      break;
    case "TEXT":
      summary.value = toSerializable({
        fontName: style.fontName,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        paragraphSpacing: style.paragraphSpacing,
        paragraphIndent: style.paragraphIndent,
        textCase: style.textCase,
        textDecoration: style.textDecoration
      });
      break;
    case "EFFECT":
      summary.value = toSerializable({ effects: style.effects });
      break;
    case "GRID":
      summary.value = toSerializable({ layoutGrids: style.layoutGrids });
      break;
  }

  return summary;
}

export async function getStyles(payload: GetStylesPayload): Promise<GetStylesResult> {
  const requestedTypes = new Set(payload.types ?? ["PAINT", "TEXT", "EFFECT", "GRID"]);
  const includeDetails = payload.includeDetails ?? false;
  const nameContains = payload.nameContains?.toLocaleLowerCase();
  const limit = payload.limit ?? 100;

  const styleGroups = await Promise.all([
    requestedTypes.has("PAINT") ? figma.getLocalPaintStylesAsync() : Promise.resolve([]),
    requestedTypes.has("TEXT") ? figma.getLocalTextStylesAsync() : Promise.resolve([]),
    requestedTypes.has("EFFECT") ? figma.getLocalEffectStylesAsync() : Promise.resolve([]),
    requestedTypes.has("GRID") ? figma.getLocalGridStylesAsync() : Promise.resolve([])
  ]);

  const styles = styleGroups.flat();
  const filtered = styles.filter((style) =>
    nameContains ? style.name.toLocaleLowerCase().includes(nameContains) : true
  );

  return {
    styles: filtered.slice(0, limit).map((style) => serializeStyle(style, includeDetails)),
    totalStyles: filtered.length,
    truncated: filtered.length > limit
  };
}

export async function applyStyles(payload: ApplyStylesPayload): Promise<ApplyStylesResult> {
  const node = await requireSceneNode(payload.nodeId);
  const appliedFields: string[] = [];

  if (payload.styles.fillStyleId !== undefined) {
    if (!hasFills(node)) {
      throw new Error(`Node ${payload.nodeId} does not support fills`);
    }
    if (payload.styles.fillStyleId) {
      await requireStyle(payload.styles.fillStyleId, "PAINT");
    }
    await node.setFillStyleIdAsync(payload.styles.fillStyleId ?? "");
    appliedFields.push("fillStyleId");
  }

  if (payload.styles.strokeStyleId !== undefined) {
    if (!hasStrokes(node)) {
      throw new Error(`Node ${payload.nodeId} does not support strokes`);
    }
    if (payload.styles.strokeStyleId) {
      await requireStyle(payload.styles.strokeStyleId, "PAINT");
    }
    await node.setStrokeStyleIdAsync(payload.styles.strokeStyleId ?? "");
    appliedFields.push("strokeStyleId");
  }

  if (payload.styles.effectStyleId !== undefined) {
    if (!hasEffects(node)) {
      throw new Error(`Node ${payload.nodeId} does not support effects`);
    }
    if (payload.styles.effectStyleId) {
      await requireStyle(payload.styles.effectStyleId, "EFFECT");
    }
    await node.setEffectStyleIdAsync(payload.styles.effectStyleId ?? "");
    appliedFields.push("effectStyleId");
  }

  if (payload.styles.gridStyleId !== undefined) {
    if (!hasGridStyle(node)) {
      throw new Error(`Node ${payload.nodeId} does not support layout grids`);
    }
    if (payload.styles.gridStyleId) {
      await requireStyle(payload.styles.gridStyleId, "GRID");
    }
    await node.setGridStyleIdAsync(payload.styles.gridStyleId ?? "");
    appliedFields.push("gridStyleId");
  }

  if (payload.styles.textStyleId !== undefined) {
    if (!isTextNode(node)) {
      throw new Error(`Node ${payload.nodeId} is not a text node`);
    }
    await loadFontsForNode(node);
    if (payload.styles.textStyleId) {
      await requireStyle(payload.styles.textStyleId, "TEXT");
    }
    await node.setTextStyleIdAsync(payload.styles.textStyleId ?? "");
    appliedFields.push("textStyleId");
  }

  return {
    node: payload.returnNodeDetails ?? true ? await describeNodeAsync(node) : summarizeNode(node),
    appliedFields
  };
}
