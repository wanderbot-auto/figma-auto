import type { SerializableImagePaint, SerializablePaint, TransformMatrix } from "@figma-auto/protocol";

function toTransformMatrix(matrix: Transform): TransformMatrix {
  return [
    [matrix[0][0], matrix[0][1], matrix[0][2]],
    [matrix[1][0], matrix[1][1], matrix[1][2]]
  ];
}

export function serializePaints(paints: readonly Paint[] | typeof figma.mixed): SerializablePaint[] | undefined {
  if (paints === figma.mixed) {
    return undefined;
  }

  return paints.reduce<SerializablePaint[]>((results, paint) => {
    if (paint.type === "SOLID") {
      results.push({
        type: "SOLID" as const,
        color: {
          r: paint.color.r,
          g: paint.color.g,
          b: paint.color.b,
          a: 1
        },
        opacity: paint.opacity,
        visible: paint.visible
      });
      return results;
    }

    if (paint.type === "IMAGE") {
      results.push({
        type: "IMAGE" as const,
        imageHash: paint.imageHash,
        scaleMode: paint.scaleMode,
        ...(paint.imageTransform ? { imageTransform: toTransformMatrix(paint.imageTransform) } : {}),
        ...(paint.scalingFactor !== undefined ? { scalingFactor: paint.scalingFactor } : {}),
        ...(paint.rotation !== undefined ? { rotation: paint.rotation } : {}),
        ...(paint.opacity !== undefined ? { opacity: paint.opacity } : {}),
        ...(paint.visible !== undefined ? { visible: paint.visible } : {})
      });
      return results;
    }

    return results;
  }, []);
}

async function resolveImageHash(paint: SerializableImagePaint): Promise<string> {
  if (paint.imageHash) {
    const existing = figma.getImageByHash(paint.imageHash);
    if (!existing) {
      throw new Error(`Image hash ${paint.imageHash} was not found`);
    }
    return paint.imageHash;
  }

  if (!paint.src) {
    throw new Error("IMAGE paints require either imageHash or src");
  }

  const image = await figma.createImageAsync(paint.src);
  return image.hash;
}

export async function toFigmaPaint(paint: SerializablePaint): Promise<SolidPaint | ImagePaint> {
  if (paint.type === "SOLID") {
    return {
      type: "SOLID",
      color: {
        r: paint.color.r,
        g: paint.color.g,
        b: paint.color.b
      },
      ...(paint.opacity !== undefined ? { opacity: paint.opacity } : {}),
      ...(paint.visible !== undefined ? { visible: paint.visible } : {})
    };
  }

  const imageHash = await resolveImageHash(paint);
  return {
    type: "IMAGE",
    imageHash,
    scaleMode: paint.scaleMode,
    ...(paint.imageTransform ? { imageTransform: paint.imageTransform as Transform } : {}),
    ...(paint.scalingFactor !== undefined ? { scalingFactor: paint.scalingFactor } : {}),
    ...(paint.rotation !== undefined ? { rotation: paint.rotation } : {}),
    ...(paint.opacity !== undefined ? { opacity: paint.opacity } : {}),
    ...(paint.visible !== undefined ? { visible: paint.visible } : {})
  };
}

export async function toFigmaPaints(paints: SerializablePaint[]): Promise<Array<SolidPaint | ImagePaint>> {
  return Promise.all(paints.map((paint) => toFigmaPaint(paint)));
}
