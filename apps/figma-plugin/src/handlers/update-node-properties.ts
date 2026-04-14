import type {
  LetterSpacingValue,
  LineHeightValue,
  UpdateNodePropertiesPayload,
  UpdateNodePropertiesResult
} from "@figma-auto/protocol";

import {
  hasAutoLayout,
  hasAutoLayoutChild,
  hasClipsContent,
  hasCornerRadius,
  hasFills,
  hasOpacity,
  hasRotation,
  hasStrokes,
  isResizableNode,
  requireSceneNode
} from "./node-helpers.js";
import { describeNodeAsync, summarizeNode } from "./read.js";
import { toFigmaPaints } from "./paints.js";
import { loadFontAsyncOrThrow, loadFontsForNode } from "./write.js";

function toFigmaLineHeight(lineHeight: LineHeightValue): LineHeight {
  if (lineHeight.unit === "AUTO") {
    return { unit: "AUTO" };
  }

  return {
    unit: lineHeight.unit,
    value: lineHeight.value ?? 0
  };
}

function toFigmaLetterSpacing(letterSpacing: LetterSpacingValue): LetterSpacing {
  return {
    unit: letterSpacing.unit,
    value: letterSpacing.value
  };
}

async function updateTextFont(node: TextNode, fontFamily?: string, fontStyle?: string): Promise<string[]> {
  if (fontFamily === undefined && fontStyle === undefined) {
    return [];
  }

  if (node.fontName === figma.mixed) {
    if (fontFamily === undefined || fontStyle === undefined) {
      throw new Error(`Node ${node.id} has mixed fonts; provide both fontFamily and fontStyle`);
    }
  }

  const currentFont = node.fontName === figma.mixed ? null : node.fontName;
  const nextFont: FontName = {
    family: fontFamily ?? currentFont?.family ?? "",
    style: fontStyle ?? currentFont?.style ?? ""
  };

  await loadFontAsyncOrThrow(nextFont);
  node.fontName = nextFont;

  const updatedFields: string[] = [];
  if (fontFamily !== undefined) {
    updatedFields.push("text.fontFamily");
  }
  if (fontStyle !== undefined) {
    updatedFields.push("text.fontStyle");
  }

  return updatedFields;
}

export async function updateNodeProperties(
  payload: UpdateNodePropertiesPayload
): Promise<UpdateNodePropertiesResult> {
  const node = await requireSceneNode(payload.nodeId);
  const { properties } = payload;
  const updatedFields: string[] = [];

  if (properties.name !== undefined) {
    node.name = properties.name;
    updatedFields.push("name");
  }

  if (properties.x !== undefined) {
    node.x = properties.x;
    updatedFields.push("x");
  }

  if (properties.y !== undefined) {
    node.y = properties.y;
    updatedFields.push("y");
  }

  if (properties.width !== undefined || properties.height !== undefined) {
    if (!isResizableNode(node)) {
      throw new Error(`Node ${payload.nodeId} does not support resizing`);
    }

    node.resize(properties.width ?? node.width, properties.height ?? node.height);
    if (properties.width !== undefined) {
      updatedFields.push("width");
    }
    if (properties.height !== undefined) {
      updatedFields.push("height");
    }
  }

  if (properties.rotation !== undefined) {
    if (!hasRotation(node)) {
      throw new Error(`Node ${payload.nodeId} does not support rotation`);
    }

    node.rotation = properties.rotation;
    updatedFields.push("rotation");
  }

  if (properties.visible !== undefined) {
    node.visible = properties.visible;
    updatedFields.push("visible");
  }

  if (properties.locked !== undefined) {
    node.locked = properties.locked;
    updatedFields.push("locked");
  }

  if (properties.opacity !== undefined) {
    if (!hasOpacity(node)) {
      throw new Error(`Node ${payload.nodeId} does not support opacity`);
    }

    node.opacity = properties.opacity;
    updatedFields.push("opacity");
  }

  if (properties.cornerRadius !== undefined) {
    if (!hasCornerRadius(node) || node.cornerRadius === figma.mixed) {
      throw new Error(`Node ${payload.nodeId} does not support a single cornerRadius value`);
    }

    node.cornerRadius = properties.cornerRadius;
    updatedFields.push("cornerRadius");
  }

  if (properties.fills !== undefined) {
    if (!hasFills(node)) {
      throw new Error(`Node ${payload.nodeId} does not support fills`);
    }

    node.fills = await toFigmaPaints(properties.fills);
    updatedFields.push("fills");
  }

  if (properties.strokes !== undefined) {
    if (!hasStrokes(node)) {
      throw new Error(`Node ${payload.nodeId} does not support strokes`);
    }

    node.strokes = await toFigmaPaints(properties.strokes);
    updatedFields.push("strokes");
  }

  if (properties.strokeWeight !== undefined) {
    if (!hasStrokes(node)) {
      throw new Error(`Node ${payload.nodeId} does not support strokeWeight`);
    }

    node.strokeWeight = properties.strokeWeight;
    updatedFields.push("strokeWeight");
  }

  if (properties.clipsContent !== undefined) {
    if (!hasClipsContent(node)) {
      throw new Error(`Node ${payload.nodeId} does not support clipsContent`);
    }

    node.clipsContent = properties.clipsContent;
    updatedFields.push("clipsContent");
  }

  if (properties.layoutGrow !== undefined) {
    if (!hasAutoLayoutChild(node)) {
      throw new Error(`Node ${payload.nodeId} does not support layoutGrow`);
    }

    node.layoutGrow = properties.layoutGrow;
    updatedFields.push("layoutGrow");
  }

  if (properties.layoutAlign !== undefined) {
    if (!hasAutoLayoutChild(node)) {
      throw new Error(`Node ${payload.nodeId} does not support layoutAlign`);
    }

    node.layoutAlign = properties.layoutAlign;
    updatedFields.push("layoutAlign");
  }

  if (properties.layout) {
    if (!hasAutoLayout(node)) {
      throw new Error(`Node ${payload.nodeId} does not support auto-layout properties`);
    }

    if (properties.layout.mode !== undefined) {
      node.layoutMode = properties.layout.mode;
      updatedFields.push("layout.mode");
    }
    if (properties.layout.itemSpacing !== undefined) {
      node.itemSpacing = properties.layout.itemSpacing;
      updatedFields.push("layout.itemSpacing");
    }
    if (properties.layout.paddingTop !== undefined) {
      node.paddingTop = properties.layout.paddingTop;
      updatedFields.push("layout.paddingTop");
    }
    if (properties.layout.paddingRight !== undefined) {
      node.paddingRight = properties.layout.paddingRight;
      updatedFields.push("layout.paddingRight");
    }
    if (properties.layout.paddingBottom !== undefined) {
      node.paddingBottom = properties.layout.paddingBottom;
      updatedFields.push("layout.paddingBottom");
    }
    if (properties.layout.paddingLeft !== undefined) {
      node.paddingLeft = properties.layout.paddingLeft;
      updatedFields.push("layout.paddingLeft");
    }
    if (properties.layout.primaryAxisAlignItems !== undefined) {
      node.primaryAxisAlignItems = properties.layout.primaryAxisAlignItems;
      updatedFields.push("layout.primaryAxisAlignItems");
    }
    if (properties.layout.counterAxisAlignItems !== undefined) {
      node.counterAxisAlignItems = properties.layout.counterAxisAlignItems;
      updatedFields.push("layout.counterAxisAlignItems");
    }
    if (properties.layout.primaryAxisSizingMode !== undefined) {
      node.primaryAxisSizingMode = properties.layout.primaryAxisSizingMode;
      updatedFields.push("layout.primaryAxisSizingMode");
    }
    if (properties.layout.counterAxisSizingMode !== undefined) {
      node.counterAxisSizingMode = properties.layout.counterAxisSizingMode;
      updatedFields.push("layout.counterAxisSizingMode");
    }
  }

  if (properties.text) {
    if (node.type !== "TEXT") {
      throw new Error(`Node ${payload.nodeId} is not a text node`);
    }

    await loadFontsForNode(node);
    updatedFields.push(...(await updateTextFont(node, properties.text.fontFamily, properties.text.fontStyle)));

    if (properties.text.fontSize !== undefined) {
      node.fontSize = properties.text.fontSize;
      updatedFields.push("text.fontSize");
    }
    if (properties.text.lineHeight !== undefined) {
      node.lineHeight = toFigmaLineHeight(properties.text.lineHeight);
      updatedFields.push("text.lineHeight");
    }
    if (properties.text.letterSpacing !== undefined) {
      node.letterSpacing = toFigmaLetterSpacing(properties.text.letterSpacing);
      updatedFields.push("text.letterSpacing");
    }
    if (properties.text.paragraphSpacing !== undefined) {
      node.paragraphSpacing = properties.text.paragraphSpacing;
      updatedFields.push("text.paragraphSpacing");
    }
    if (properties.text.paragraphIndent !== undefined) {
      node.paragraphIndent = properties.text.paragraphIndent;
      updatedFields.push("text.paragraphIndent");
    }
    if (properties.text.textCase !== undefined) {
      node.textCase = properties.text.textCase;
      updatedFields.push("text.textCase");
    }
    if (properties.text.textDecoration !== undefined) {
      node.textDecoration = properties.text.textDecoration;
      updatedFields.push("text.textDecoration");
    }
    if (properties.text.textAlignHorizontal !== undefined) {
      node.textAlignHorizontal = properties.text.textAlignHorizontal;
      updatedFields.push("text.textAlignHorizontal");
    }
    if (properties.text.textAlignVertical !== undefined) {
      node.textAlignVertical = properties.text.textAlignVertical;
      updatedFields.push("text.textAlignVertical");
    }
  }

  return {
    node: payload.returnNodeDetails ?? true ? await describeNodeAsync(node) : summarizeNode(node),
    updatedFields
  };
}
