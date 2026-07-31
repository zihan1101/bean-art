import { useEffect, useMemo, useState } from "react";
import { findClosestMardColor } from "../utils/findClosestMardColor";
import { applyModeFilter } from "../utils/applyModeFilter";
import { removeImageBackground } from "../utils/removeBackground";
import { quantizeColors } from "../utils/colorQuantization";

type PixelGridProps = {
  imageUrl: string | null;
  boardSize: number;
  outputSize: number;
};

type PixelCell = {
  r: number;
  g: number;
  b: number;
  a: number;
  isEmpty: boolean;
  colorCode: string;
  hex: string;
};

type RawPixel = {
  r: number;
  g: number;
  b: number;
  a: number;
};

type ColorStatistic = {
  code: string;
  hex: string;
  count: number;
};

type BackgroundRemovalMode = "ai" | "corner" | "none";

function createEmptyPixel(): PixelCell {
  return {
    r: 255,
    g: 255,
    b: 255,
    a: 0,
    isEmpty: true,
    colorCode: "",
    hex: "#FFFFFF",
  };
}

function getTextColor(r: number, g: number, b: number) {
  const brightness =
    r * 0.299 +
    g * 0.587 +
    b * 0.114;

  return brightness > 160
    ? "#111111"
    : "#FFFFFF";
}

function hexToRgb(hex: string) {
  const cleanedHex = hex.replace("#", "");

  return {
    r: Number.parseInt(cleanedHex.slice(0, 2), 16),
    g: Number.parseInt(cleanedHex.slice(2, 4), 16),
    b: Number.parseInt(cleanedHex.slice(4, 6), 16),
  };
}

/*
 * 手动区域平均缩放，替代 canvas 内置的双三次插值缩放。
 * 避免剧烈缩小时产生振铃伪影。
 */
function downsampleByAreaAverage(
  sourceData: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  outputSize: number
): RawPixel[] {
  const result: RawPixel[] = [];

  for (let outY = 0; outY < outputSize; outY++) {
    const startY = Math.floor(
      (outY / outputSize) * sourceHeight
    );

    const endY = Math.max(
      startY + 1,
      Math.floor(
        ((outY + 1) / outputSize) * sourceHeight
      )
    );

    for (let outX = 0; outX < outputSize; outX++) {
      const startX = Math.floor(
        (outX / outputSize) * sourceWidth
      );

      const endX = Math.max(
        startX + 1,
        Math.floor(
          ((outX + 1) / outputSize) * sourceWidth
        )
      );

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumA = 0;
      let count = 0;

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const index = (y * sourceWidth + x) * 4;

          sumR += sourceData[index];
          sumG += sourceData[index + 1];
          sumB += sourceData[index + 2];
          sumA += sourceData[index + 3];
          count += 1;
        }
      }

      result.push({
        r: Math.round(sumR / count),
        g: Math.round(sumG / count),
        b: Math.round(sumB / count),
        a: Math.round(sumA / count),
      });
    }
  }

  return result;
}

/*
 * 双边滤波：只对“颜色相近”的邻居做平均，保留真实边缘细节。
 */
function bilateralFilter(
  pixels: RawPixel[],
  width: number,
  height: number,
  spatialSigma: number,
  colorSigma: number
): RawPixel[] {
  const radius = Math.max(
    1,
    Math.ceil(spatialSigma * 2)
  );

  const safeColorSigma = Math.max(1, colorSigma);

  const result: RawPixel[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const centerIndex = y * width + x;
      const center = pixels[centerIndex];

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumWeight = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const ny = y + dy;
          const nx = x + dx;

          if (
            ny < 0 ||
            ny >= height ||
            nx < 0 ||
            nx >= width
          ) {
            continue;
          }

          const neighbor =
            pixels[ny * width + nx];

          const spatialDistanceSquared =
            dx * dx + dy * dy;

          const spatialWeight = Math.exp(
            -spatialDistanceSquared /
              (2 * spatialSigma * spatialSigma)
          );

          const colorDistanceSquared =
            (neighbor.r - center.r) ** 2 +
            (neighbor.g - center.g) ** 2 +
            (neighbor.b - center.b) ** 2;

          const colorWeight = Math.exp(
            -colorDistanceSquared /
              (2 * safeColorSigma * safeColorSigma)
          );

          const weight =
            spatialWeight * colorWeight;

          sumR += neighbor.r * weight;
          sumG += neighbor.g * weight;
          sumB += neighbor.b * weight;
          sumWeight += weight;
        }
      }

      result.push({
        r: Math.round(sumR / sumWeight),
        g: Math.round(sumG / sumWeight),
        b: Math.round(sumB / sumWeight),
        a: center.a,
      });
    }
  }

  return result;
}

/*
 * 传统方式：用图片四角的平均颜色估计背景，
 * 再从边缘开始 flood fill。
 */
function computeCornerBackgroundMask(
  rawPixels: RawPixel[],
  outputSize: number
): boolean[] {
  const BACKGROUND_TOLERANCE = 35;

  const cornerIndexes = [
    0,
    outputSize - 1,
    (outputSize - 1) * outputSize,
    outputSize * outputSize - 1,
  ];

  let backgroundR = 0;
  let backgroundG = 0;
  let backgroundB = 0;

  for (const index of cornerIndexes) {
    backgroundR += rawPixels[index].r;
    backgroundG += rawPixels[index].g;
    backgroundB += rawPixels[index].b;
  }

  backgroundR /= cornerIndexes.length;
  backgroundG /= cornerIndexes.length;
  backgroundB /= cornerIndexes.length;

  function isBackgroundCandidate(pixel: RawPixel) {
    if (pixel.a < 20) {
      return true;
    }

    const redDifference = pixel.r - backgroundR;
    const greenDifference = pixel.g - backgroundG;
    const blueDifference = pixel.b - backgroundB;

    const distance = Math.sqrt(
      redDifference ** 2 +
        greenDifference ** 2 +
        blueDifference ** 2
    );

    return distance <= BACKGROUND_TOLERANCE;
  }

  const backgroundMask = Array(
    outputSize * outputSize
  ).fill(false);

  const queue: number[] = [];
  let queuePosition = 0;

  function addToQueue(row: number, col: number) {
    if (
      row < 0 ||
      row >= outputSize ||
      col < 0 ||
      col >= outputSize
    ) {
      return;
    }

    const index = row * outputSize + col;

    if (backgroundMask[index]) {
      return;
    }

    if (!isBackgroundCandidate(rawPixels[index])) {
      return;
    }

    backgroundMask[index] = true;
    queue.push(index);
  }

  for (let col = 0; col < outputSize; col++) {
    addToQueue(0, col);
    addToQueue(outputSize - 1, col);
  }

  for (let row = 0; row < outputSize; row++) {
    addToQueue(row, 0);
    addToQueue(row, outputSize - 1);
  }

  while (queuePosition < queue.length) {
    const currentIndex = queue[queuePosition];
    queuePosition += 1;

    const row = Math.floor(currentIndex / outputSize);
    const col = currentIndex % outputSize;

    addToQueue(row - 1, col);
    addToQueue(row + 1, col);
    addToQueue(row, col - 1);
    addToQueue(row, col + 1);
  }

  return backgroundMask;
}

function PixelGrid({
  imageUrl,
  boardSize,
  outputSize,
}: PixelGridProps) {
  const [pixels, setPixels] = useState<PixelCell[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [removalMode, setRemovalMode] =
    useState<BackgroundRemovalMode>("ai");

  const [enableDenoise, setEnableDenoise] =
    useState(true);
  const [spatialSigma, setSpatialSigma] =
    useState(1.0);
  const [colorSigma, setColorSigma] = useState(12);

  const [
    enableQuantization,
    setEnableQuantization,
  ] = useState(true);
  const [maxColors, setMaxColors] = useState(40);

  useEffect(() => {
    if (!imageUrl) {
      setPixels([]);
      return;
    }

    let isCancelled = false;

    async function processImage() {
      setIsProcessing(true);

      let cleanUrl: string | null = null;

      try {
        let sourceUrl = imageUrl as string;

        if (removalMode === "ai") {
          const cleanBlob = await removeImageBackground(
            imageUrl as string
          );

          cleanUrl = URL.createObjectURL(cleanBlob);
          sourceUrl = cleanUrl;
        }

        const image = new Image();

        await new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () =>
            reject(new Error("图片读取失败"));
          image.src = sourceUrl;
        });

        if (isCancelled) {
          return;
        }

        const workingSize = Math.min(
          Math.max(outputSize * 4, 200),
          1200
        );

        const workingCanvas =
          document.createElement("canvas");

        const workingContext =
          workingCanvas.getContext("2d");

        if (!workingContext) {
          return;
        }

        workingCanvas.width = workingSize;
        workingCanvas.height = workingSize;

        workingContext.imageSmoothingEnabled = true;
        workingContext.imageSmoothingQuality =
          "high";

        workingContext.clearRect(
          0,
          0,
          workingSize,
          workingSize
        );

        workingContext.drawImage(
          image,
          0,
          0,
          workingSize,
          workingSize
        );

        const workingImageData =
          workingContext.getImageData(
            0,
            0,
            workingSize,
            workingSize
          );

        const areaAveragedPixels =
          downsampleByAreaAverage(
            workingImageData.data,
            workingSize,
            workingSize,
            outputSize
          );

        if (isCancelled) {
          return;
        }

        const rawPixels = enableDenoise
          ? bilateralFilter(
              areaAveragedPixels,
              outputSize,
              outputSize,
              spatialSigma,
              colorSigma
            )
          : areaAveragedPixels;

        const backgroundMask =
          removalMode === "corner"
            ? computeCornerBackgroundMask(
                rawPixels,
                outputSize
              )
            : null;

        let quantizedColorByPixelIndex: Map<
          number,
          { r: number; g: number; b: number }
        > | null = null;

        if (enableQuantization) {
          const foregroundIndexes: number[] = [];
          const foregroundColors: {
            r: number;
            g: number;
            b: number;
          }[] = [];

          rawPixels.forEach((pixel, index) => {
            const isBackground =
              pixel.a < 20 ||
              (backgroundMask
                ? backgroundMask[index]
                : false);

            if (!isBackground) {
              foregroundIndexes.push(index);
              foregroundColors.push({
                r: pixel.r,
                g: pixel.g,
                b: pixel.b,
              });
            }
          });

          const { assignments, centroids } =
            quantizeColors(
              foregroundColors,
              maxColors
            );

          quantizedColorByPixelIndex = new Map();

          foregroundIndexes.forEach(
            (pixelIndex, i) => {
              quantizedColorByPixelIndex!.set(
                pixelIndex,
                centroids[assignments[i]]
              );
            }
          );
        }

        const patternPixels: PixelCell[] = rawPixels.map(
          (pixel, index) => {
            const isBackground =
              pixel.a < 20 ||
              (backgroundMask
                ? backgroundMask[index]
                : false);

            if (isBackground) {
              return createEmptyPixel();
            }

            const colorToMatch =
              quantizedColorByPixelIndex?.get(
                index
              ) ?? {
                r: pixel.r,
                g: pixel.g,
                b: pixel.b,
              };

            const closestMardColor =
              findClosestMardColor(
                colorToMatch
              );

            return {
              r: closestMardColor.rgb.r,
              g: closestMardColor.rgb.g,
              b: closestMardColor.rgb.b,
              a: 255,
              isEmpty: false,
              colorCode:
                closestMardColor.code,
              hex: closestMardColor.hex,
            };
          }
        );

        const filteredPatternPixels =
          applyModeFilter(patternPixels, {
            width: outputSize,
            height: outputSize,
            minimumMajorityCount: 5,
          });

        const boardPixels: PixelCell[] =
          Array.from(
            {
              length:
                boardSize * boardSize,
            },
            createEmptyPixel
          );

        const startRow = Math.floor(
          (boardSize - outputSize) / 2
        );

        const startCol = Math.floor(
          (boardSize - outputSize) / 2
        );

        for (
          let row = 0;
          row < outputSize;
          row++
        ) {
          for (
            let col = 0;
            col < outputSize;
            col++
          ) {
            const patternIndex =
              row * outputSize + col;

            const boardIndex =
              (startRow + row) *
                boardSize +
              (startCol + col);

            boardPixels[boardIndex] =
              filteredPatternPixels[
                patternIndex
              ];
          }
        }

        if (!isCancelled) {
          setPixels(boardPixels);
        }
      } catch (error) {
        console.error("图片处理失败", error);

        if (!isCancelled) {
          setPixels([]);
        }
      } finally {
        if (cleanUrl) {
          URL.revokeObjectURL(cleanUrl);
        }

        if (!isCancelled) {
          setIsProcessing(false);
        }
      }
    }

    processImage();

    return () => {
      isCancelled = true;
    };
  }, [
    imageUrl,
    boardSize,
    outputSize,
    removalMode,
    enableDenoise,
    spatialSigma,
    colorSigma,
    enableQuantization,
    maxColors,
  ]);

  const colorStatistics =
    useMemo<ColorStatistic[]>(() => {
      const statisticMap =
        new Map<string, ColorStatistic>();

      for (const pixel of pixels) {
        if (
          pixel.isEmpty ||
          !pixel.colorCode
        ) {
          continue;
        }

        const existing =
          statisticMap.get(
            pixel.colorCode
          );

        if (existing) {
          existing.count += 1;
        } else {
          statisticMap.set(
            pixel.colorCode,
            {
              code: pixel.colorCode,
              hex: pixel.hex,
              count: 1,
            }
          );
        }
      }

      return Array.from(
        statisticMap.values()
      ).sort((first, second) => {
        if (
          second.count !== first.count
        ) {
          return (
            second.count - first.count
          );
        }

        return first.code.localeCompare(
          second.code,
          undefined,
          {
            numeric: true,
          }
        );
      });
    }, [pixels]);

  const totalBeads = useMemo(() => {
    return colorStatistics.reduce(
      (total, color) =>
        total + color.count,
      0
    );
  }, [colorStatistics]);

  function exportPatternAsPng() {
    if (pixels.length === 0) {
      return;
    }

    setIsExporting(true);

    try {
      const exportCellSize = 32;
      const boardPixelSize =
        boardSize * exportCellSize;

      const outerPadding = 48;
      const titleHeight = 80;
      const summaryHeight = 90;

      const legendColumns = 4;
      const legendItemWidth = 260;
      const legendItemHeight = 72;

      const legendRows = Math.ceil(
        colorStatistics.length /
          legendColumns
      );

      const legendWidth =
        legendColumns * legendItemWidth;

      const contentWidth = Math.max(
        boardPixelSize,
        legendWidth
      );

      const canvasWidth =
        contentWidth +
        outerPadding * 2;

      const canvasHeight =
        outerPadding +
        titleHeight +
        boardPixelSize +
        summaryHeight +
        legendRows *
          legendItemHeight +
        outerPadding;

      const exportCanvas =
        document.createElement("canvas");

      exportCanvas.width = canvasWidth;
      exportCanvas.height = canvasHeight;

      const context =
        exportCanvas.getContext("2d");

      if (!context) {
        return;
      }

      context.fillStyle = "#FFFFFF";
      context.fillRect(
        0,
        0,
        canvasWidth,
        canvasHeight
      );

      context.fillStyle = "#111111";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font =
        "bold 30px Arial, sans-serif";

      context.fillText(
        `MARD 拼豆图纸 · ${boardSize} × ${boardSize}`,
        canvasWidth / 2,
        outerPadding + 24
      );

      context.font =
        "18px Arial, sans-serif";

      context.fillStyle = "#555555";

      context.fillText(
        `图案尺寸：${outputSize} × ${outputSize}`,
        canvasWidth / 2,
        outerPadding + 58
      );

      const boardX =
        (canvasWidth -
          boardPixelSize) /
        2;

      const boardY =
        outerPadding + titleHeight;

      for (
        let row = 0;
        row < boardSize;
        row++
      ) {
        for (
          let col = 0;
          col < boardSize;
          col++
        ) {
          const index =
            row * boardSize + col;

          const pixel = pixels[index];

          const x =
            boardX +
            col * exportCellSize;

          const y =
            boardY +
            row * exportCellSize;

          context.fillStyle =
            pixel.isEmpty
              ? "#FFFFFF"
              : pixel.hex;

          context.fillRect(
            x,
            y,
            exportCellSize,
            exportCellSize
          );

          if (
            !pixel.isEmpty &&
            pixel.colorCode
          ) {
            context.fillStyle =
              getTextColor(
                pixel.r,
                pixel.g,
                pixel.b
              );

            context.font =
              "bold 10px Arial, sans-serif";

            context.textAlign =
              "center";

            context.textBaseline =
              "middle";

            context.fillText(
              pixel.colorCode,
              x + exportCellSize / 2,
              y + exportCellSize / 2
            );
          }
        }
      }

      context.strokeStyle = "#B8BDC4";
      context.lineWidth = 1;

      for (
        let position = 0;
        position <= boardSize;
        position++
      ) {
        const x =
          boardX +
          position * exportCellSize;

        const y =
          boardY +
          position * exportCellSize;

        context.beginPath();
        context.moveTo(x, boardY);
        context.lineTo(
          x,
          boardY + boardPixelSize
        );
        context.stroke();

        context.beginPath();
        context.moveTo(boardX, y);
        context.lineTo(
          boardX + boardPixelSize,
          y
        );
        context.stroke();
      }

      context.strokeStyle = "#8B929B";
      context.lineWidth = 2;

      for (
        let position = 5;
        position < boardSize;
        position += 5
      ) {
        if (position % 10 === 0) {
          continue;
        }

        const x =
          boardX +
          position * exportCellSize;

        const y =
          boardY +
          position * exportCellSize;

        context.beginPath();
        context.moveTo(x, boardY);
        context.lineTo(
          x,
          boardY + boardPixelSize
        );
        context.stroke();

        context.beginPath();
        context.moveTo(boardX, y);
        context.lineTo(
          boardX + boardPixelSize,
          y
        );
        context.stroke();
      }

      context.strokeStyle = "#50565E";
      context.lineWidth = 3;

      for (
        let position = 10;
        position < boardSize;
        position += 10
      ) {
        const x =
          boardX +
          position * exportCellSize;

        const y =
          boardY +
          position * exportCellSize;

        context.beginPath();
        context.moveTo(x, boardY);
        context.lineTo(
          x,
          boardY + boardPixelSize
        );
        context.stroke();

        context.beginPath();
        context.moveTo(boardX, y);
        context.lineTo(
          boardX + boardPixelSize,
          y
        );
        context.stroke();
      }

      context.strokeStyle = "#30343A";
      context.lineWidth = 3;

      context.strokeRect(
        boardX,
        boardY,
        boardPixelSize,
        boardPixelSize
      );

      const summaryY =
        boardY +
        boardPixelSize +
        38;

      context.textAlign = "left";
      context.textBaseline = "middle";
      context.fillStyle = "#111111";

      context.font =
        "bold 24px Arial, sans-serif";

      context.fillText(
        "颜色用量",
        outerPadding,
        summaryY
      );

      context.font =
        "18px Arial, sans-serif";

      context.fillStyle = "#444444";

      context.fillText(
        `总拼豆数量：${totalBeads} 颗`,
        outerPadding,
        summaryY + 36
      );

      context.fillText(
        `使用颜色数量：${colorStatistics.length} 种`,
        outerPadding + 260,
        summaryY + 36
      );

      const legendStartY =
        boardY +
        boardPixelSize +
        summaryHeight;

      colorStatistics.forEach(
        (color, index) => {
          const column =
            index % legendColumns;

          const row = Math.floor(
            index / legendColumns
          );

          const itemX =
            outerPadding +
            column *
              legendItemWidth;

          const itemY =
            legendStartY +
            row *
              legendItemHeight;

          const swatchSize = 46;

          const rgb =
            hexToRgb(color.hex);

          context.fillStyle = color.hex;

          context.fillRect(
            itemX,
            itemY + 10,
            swatchSize,
            swatchSize
          );

          context.strokeStyle =
            "#777777";

          context.lineWidth = 1;

          context.strokeRect(
            itemX,
            itemY + 10,
            swatchSize,
            swatchSize
          );

          context.fillStyle =
            getTextColor(
              rgb.r,
              rgb.g,
              rgb.b
            );

          context.font =
            "bold 12px Arial, sans-serif";

          context.textAlign =
            "center";

          context.textBaseline =
            "middle";

          context.fillText(
            color.code,
            itemX +
              swatchSize / 2,
            itemY +
              10 +
              swatchSize / 2
          );

          context.textAlign =
            "left";

          context.fillStyle =
            "#111111";

          context.font =
            "bold 17px Arial, sans-serif";

          context.fillText(
            color.code,
            itemX + 60,
            itemY + 25
          );

          context.font =
            "16px Arial, sans-serif";

          context.fillStyle =
            "#444444";

          context.fillText(
            `${color.count} 颗`,
            itemX + 60,
            itemY + 48
          );
        }
      );

      exportCanvas.toBlob(
        (blob) => {
          if (!blob) {
            return;
          }

          const downloadUrl =
            URL.createObjectURL(blob);

          const link =
            document.createElement("a");

          link.href = downloadUrl;

          link.download =
            `mard-pattern-${boardSize}x${boardSize}.png`;

          document.body.appendChild(link);
          link.click();
          link.remove();

          URL.revokeObjectURL(
            downloadUrl
          );
        },
        "image/png",
        1
      );
    } finally {
      setIsExporting(false);
    }
  }

  if (!imageUrl) {
    return null;
  }

  const cellSize = 24;

  return (
    <section
      style={{
        background: "var(--paper)",
        borderRadius: "18px",
        padding: "24px",
        border: "1px solid var(--border-soft)",
      }}
    >
      <h2 style={{ fontSize: "18px", marginBottom: "16px" }}>
        拼豆图纸预览
      </h2>

      {/* 去背景方式 */}
      <div
        style={{
          marginBottom: "14px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--ink-soft)",
          }}
        >
          去背景方式
        </span>

        {(
          [
            { value: "ai", label: "AI 智能识别" },
            { value: "corner", label: "角落取色" },
            { value: "none", label: "不处理" },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() =>
              setRemovalMode(option.value)
            }
            style={{
              padding: "6px 16px",
              borderRadius: "999px",
              border:
                removalMode === option.value
                  ? "1px solid var(--bead-rose)"
                  : "1px solid var(--border-soft)",
              background:
                removalMode === option.value
                  ? "var(--bead-rose)"
                  : "#FFFFFF",
              color:
                removalMode === option.value
                  ? "#FFFFFF"
                  : "var(--ink-soft)",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* 双边滤波去噪 */}
      <div
        style={{
          marginBottom: "12px",
          padding: "14px 16px",
          background: "var(--pegboard)",
          borderRadius: "14px",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "13px",
            color: "var(--ink)",
            marginBottom:
              enableDenoise ? "10px" : 0,
          }}
        >
          <input
            type="checkbox"
            checked={enableDenoise}
            onChange={(event) =>
              setEnableDenoise(
                event.target.checked
              )
            }
            style={{ accentColor: "var(--bead-rose)" }}
          />
          去噪（双边滤波）
        </label>

        {enableDenoise && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "20px",
              flexWrap: "wrap",
              paddingLeft: "24px",
              fontSize: "13px",
              color: "var(--ink-soft)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <label htmlFor="spatial-sigma">
                空间范围（{spatialSigma.toFixed(1)}）
              </label>
              <input
                id="spatial-sigma"
                type="range"
                min={0.5}
                max={3}
                step={0.1}
                value={spatialSigma}
                onChange={(event) =>
                  setSpatialSigma(
                    Number(event.target.value)
                  )
                }
                style={{
                  width: "150px",
                  accentColor: "var(--bead-rose)",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <label htmlFor="color-sigma">
                去噪强度（{colorSigma}）
              </label>
              <input
                id="color-sigma"
                type="range"
                min={1}
                max={60}
                step={1}
                value={colorSigma}
                onChange={(event) =>
                  setColorSigma(
                    Number(event.target.value)
                  )
                }
                style={{
                  width: "150px",
                  accentColor: "var(--bead-rose)",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 颜色量化 */}
      <div
        style={{
          marginBottom: "20px",
          padding: "14px 16px",
          background: "var(--pegboard)",
          borderRadius: "14px",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "13px",
            color: "var(--ink)",
            marginBottom: enableQuantization
              ? "10px"
              : 0,
          }}
        >
          <input
            type="checkbox"
            checked={enableQuantization}
            onChange={(event) =>
              setEnableQuantization(
                event.target.checked
              )
            }
            style={{ accentColor: "var(--bead-rose)" }}
          />
          颜色量化（合并相近色）
        </label>

        {enableQuantization && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              paddingLeft: "24px",
              fontSize: "13px",
              color: "var(--ink-soft)",
            }}
          >
            <label htmlFor="max-colors">
              最多颜色数（{maxColors}）
            </label>
            <input
              id="max-colors"
              type="range"
              min={8}
              max={64}
              step={1}
              value={maxColors}
              onChange={(event) =>
                setMaxColors(
                  Number(event.target.value)
                )
              }
              style={{
                width: "200px",
                accentColor: "var(--bead-rose)",
              }}
            />
          </div>
        )}
      </div>

      {isProcessing ? (
        <p
          style={{
            textAlign: "center",
            color: "var(--ink-soft)",
            padding: "24px 0",
          }}
        >
          正在处理图片，请稍候...
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={exportPatternAsPng}
            disabled={
              pixels.length === 0 ||
              isExporting
            }
            style={{
              marginBottom: "20px",
              padding: "12px 24px",
              border: "none",
              borderRadius: "999px",
              background: "var(--bead-rose)",
              color: "#FFFFFF",
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: "15px",
              cursor:
                pixels.length === 0
                  ? "not-allowed"
                  : "pointer",
              opacity:
                pixels.length === 0
                  ? 0.5
                  : 1,
              boxShadow:
                pixels.length === 0
                  ? "none"
                  : "0 3px 0 rgba(58, 44, 48, 0.15)",
            }}
          >
            {isExporting
              ? "正在导出..."
              : "导出高清 PNG 图纸"}
          </button>

          <div
            style={{
              overflow: "auto",
              maxWidth: "100%",
              padding: "10px 0",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${boardSize}, ${cellSize}px)`,
                gridTemplateRows: `repeat(${boardSize}, ${cellSize}px)`,
                width: "fit-content",
                margin: "0 auto",
                backgroundColor: "#FFFFFF",
              }}
            >
              {pixels.map(
                (pixel, index) => {
                  const row = Math.floor(
                    index / boardSize
                  );

                  const col =
                    index % boardSize;

                  const isTopEdge =
                    row === 0;

                  const isBottomEdge =
                    row ===
                    boardSize - 1;

                  const isLeftEdge =
                    col === 0;

                  const isRightEdge =
                    col ===
                    boardSize - 1;

                  const isTenRowLine =
                    row > 0 &&
                    row % 10 === 0;

                  const isTenColLine =
                    col > 0 &&
                    col % 10 === 0;

                  const isFiveRowLine =
                    row > 0 &&
                    row % 5 === 0 &&
                    row % 10 !== 0;

                  const isFiveColLine =
                    col > 0 &&
                    col % 5 === 0 &&
                    col % 10 !== 0;

                  const borderTopWidth =
                    isTopEdge
                      ? 3
                      : isTenRowLine
                        ? 3
                        : isFiveRowLine
                          ? 2
                          : 1;

                  const borderLeftWidth =
                    isLeftEdge
                      ? 3
                      : isTenColLine
                        ? 3
                        : isFiveColLine
                          ? 2
                          : 1;

                  const borderBottomWidth =
                    isBottomEdge
                      ? 3
                      : 0;

                  const borderRightWidth =
                    isRightEdge
                      ? 3
                      : 0;

                  const textColor =
                    getTextColor(
                      pixel.r,
                      pixel.g,
                      pixel.b
                    );

                  return (
                    <div
                      key={index}
                      title={
                        pixel.isEmpty
                          ? "空白"
                          : `${pixel.colorCode} ${pixel.hex}`
                      }
                      style={{
                        width: `${cellSize}px`,
                        height: `${cellSize}px`,
                        boxSizing:
                          "border-box",
                        display: "flex",
                        alignItems: "center",
                        justifyContent:
                          "center",

                        borderTop: `${borderTopWidth}px solid #9ca3af`,
                        borderLeft: `${borderLeftWidth}px solid #9ca3af`,
                        borderBottom: `${borderBottomWidth}px solid #6b7280`,
                        borderRight: `${borderRightWidth}px solid #6b7280`,

                        backgroundColor:
                          pixel.isEmpty
                            ? "#FFFFFF"
                            : pixel.hex,

                        color:
                          pixel.isEmpty
                            ? "transparent"
                            : textColor,

                        fontFamily:
                          "var(--font-mono)",
                        fontSize: "8px",
                        fontWeight: 600,
                        lineHeight: 1,
                        overflow: "hidden",
                        userSelect: "none",
                      }}
                    >
                      {pixel.colorCode}
                    </div>
                  );
                }
              )}
            </div>
          </div>

          {pixels.length > 0 && (
            <div
              style={{
                marginTop: "28px",
              }}
            >
              <h2 style={{ fontSize: "18px" }}>
                颜色用量
              </h2>

              <p
                style={{
                  marginTop: "8px",
                  fontSize: "14px",
                  color: "var(--ink-soft)",
                }}
              >
                总拼豆数量：
                <strong style={{ color: "var(--ink)" }}>
                  {totalBeads}
                </strong>{" "}
                颗 · 使用颜色数量：
                <strong style={{ color: "var(--ink)" }}>
                  {colorStatistics.length}
                </strong>{" "}
                种
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: "10px",
                  marginTop: "16px",
                }}
              >
                {colorStatistics.map(
                  (color) => {
                    const rgb =
                      hexToRgb(color.hex);

                    const textColor =
                      getTextColor(
                        rgb.r,
                        rgb.g,
                        rgb.b
                      );

                    return (
                      <div
                        key={color.code}
                        style={{
                          display: "flex",
                          alignItems:
                            "center",
                          gap: "10px",
                          padding: "8px 10px",
                          border:
                            "1px solid var(--border-soft)",
                          borderRadius: "999px",
                          background:
                            "var(--paper)",
                        }}
                      >
                        <div
                          style={{
                            width: "34px",
                            height: "34px",
                            flexShrink: 0,
                            display: "flex",
                            alignItems:
                              "center",
                            justifyContent:
                              "center",
                            borderRadius: "50%",
                            backgroundColor:
                              color.hex,
                            color: textColor,
                            fontFamily:
                              "var(--font-mono)",
                            fontSize: "9px",
                            fontWeight: 700,
                          }}
                        >
                          {color.code}
                        </div>

                        <div>
                          <div
                            style={{
                              fontFamily:
                                "var(--font-mono)",
                              fontWeight: 700,
                              fontSize: "13px",
                            }}
                          >
                            {color.code}
                          </div>

                          <div
                            style={{
                              fontSize: "12px",
                              color:
                                "var(--ink-soft)",
                            }}
                          >
                            {color.count} 颗
                          </div>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default PixelGrid;