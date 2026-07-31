import { useEffect, useRef } from "react";

type PixelPreviewProps = {
  imageUrl: string | null;
  outputSize: number;
};

declare global {
  interface Window {
    pixelate: (options: {
      image: HTMLImageElement | HTMLCanvasElement;
      width: number;
      dither?: string;
      strength?: number;
      palette?: string[] | null;
      resolution?: string;
    }) => Promise<HTMLCanvasElement>;
  }
}

function PixelPreview({
  imageUrl,
  outputSize,
}: PixelPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      return;
    }

    async function createPixelArt() {
      const container = containerRef.current;

      if (!container) {
        return;
      }

      container.innerHTML = "";

      if (typeof window.pixelate !== "function") {
        console.error("image-to-pixel.js 没有成功加载");
        return;
      }

      const image = new Image();

      image.onload = async () => {
        try {
          const pixelCanvas = await window.pixelate({
            image,
            width: outputSize,
            dither: "Floyd-Steinberg",
            strength: 10,
            palette: null,
            resolution: "pixel",
          });

          pixelCanvas.style.width = "500px";
          pixelCanvas.style.height = "500px";
          pixelCanvas.style.imageRendering = "pixelated";
          pixelCanvas.style.border = "1px solid black";

          container.appendChild(pixelCanvas);
        } catch (error) {
          console.error("生成像素画失败：", error);
        }
      };

      if (imageUrl) {
        image.src = imageUrl;
      }
    }

    createPixelArt();
  }, [imageUrl, outputSize]);

  if (!imageUrl) {
    return null;
  }

  return (
    <section>
      <h2>像素预览</h2>
      <div ref={containerRef} />
    </section>
  );
}

export default PixelPreview;