import type { SetImageFillPayload, SetImageFillResult } from "@figma-auto/protocol";

import { requireFillableNode } from "./node-helpers.js";
import { toFigmaPaint } from "./paints.js";
import { describeNodeAsync } from "./read.js";

export async function setImageFill(payload: SetImageFillPayload): Promise<SetImageFillResult> {
  const node = await requireFillableNode(payload.nodeId);
  const imagePaint = await toFigmaPaint(payload.image);
  if (imagePaint.type !== "IMAGE" || !imagePaint.imageHash) {
    throw new Error("Failed to resolve image fill");
  }

  if (!payload.preserveOtherFills && payload.paintIndex !== undefined && payload.paintIndex !== 0) {
    throw new Error("paintIndex > 0 requires preserveOtherFills=true");
  }

  let paintIndex = 0;
  if (payload.preserveOtherFills) {
    const existingFills = node.fills === figma.mixed ? [] : [...node.fills];
    paintIndex = payload.paintIndex ?? existingFills.length;
    if (paintIndex > existingFills.length) {
      throw new Error(`paintIndex ${paintIndex} is out of range for node ${payload.nodeId}`);
    }
    if (paintIndex === existingFills.length) {
      existingFills.push(imagePaint);
    } else {
      existingFills[paintIndex] = imagePaint;
    }
    node.fills = existingFills;
  } else {
    node.fills = [imagePaint];
  }

  return {
    node: await describeNodeAsync(node),
    imageHash: imagePaint.imageHash,
    paintIndex,
    updatedFields: [payload.preserveOtherFills ? `fills.${paintIndex}` : "fills"]
  };
}
