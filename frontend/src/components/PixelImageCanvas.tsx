import { useMemo } from "react";
import { resolveMediaUrl } from "@/lib/media";

type PixelImageCanvasProps = {
  pixelArray?: number[][];
  imageUrl?: string;
  width?: number;
  height?: number;
  alt: string;
  className?: string;
  fallbackText?: string;
};

function packToRgb(value: number) {
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return [r, g, b] as const;
}

export function PixelImageCanvas({ pixelArray, imageUrl, width, height, alt, className = "", fallbackText = "Generating..." }: PixelImageCanvasProps) {
  const resolvedImageUrl = useMemo(() => resolveMediaUrl(imageUrl), [imageUrl]);

  const dataUri = useMemo(() => {
    if (!pixelArray || !pixelArray.length || !pixelArray[0]?.length) {
      return "";
    }

    const h = pixelArray.length;
    const w = pixelArray[0].length;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;

    const context = canvas.getContext("2d");
    if (!context) {
      return "";
    }

    const imageData = context.createImageData(w, h);
    let idx = 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const [r, g, b] = packToRgb(pixelArray[y][x]);
        imageData.data[idx++] = r;
        imageData.data[idx++] = g;
        imageData.data[idx++] = b;
        imageData.data[idx++] = 255;
      }
    }

    context.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  }, [pixelArray]);

  if (resolvedImageUrl) {
    return (
      <img
        src={resolvedImageUrl}
        alt={alt}
        width={width || 64}
        height={height || 64}
        className={`w-full h-full object-cover ${className}`}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }

  if (!dataUri) {
    return (
      <div className={`w-full h-full flex items-center justify-center font-display ${className}`}>
        {fallbackText}
      </div>
    );
  }

  return (
    <img
      src={dataUri}
      alt={alt}
      width={width || 64}
      height={height || 64}
      className={`w-full h-full object-cover [image-rendering:pixelated] ${className}`}
      loading="lazy"
    />
  );
}
