import { useEffect, useMemo, useState } from "react";
import { findClosestMardColor } from "../utils/findClosestMardColor";
import { applyModeFilter } from "../utils/applyModeFilter";

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

function PixelGrid({
  imageUrl,
  boardSize,
  outputSize,
}: PixelGridProps) {
  const [pixels, setPixels] = useState<PixelCell[]>([]);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!imageUrl) {
      setPixels([]);
      return;
    }

    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      if (!context) {
        return;
      }

      canvas.width = outputSize;
      canvas.height = outputSize;

      context.clearRect(
        0,
        0,
        outputSize,
        outputSize
      );

      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";

      context.drawImage(
        image,
        0,
        0,
        outputSize,
        outputSize
      );

      const imageData = context.getImageData(
        0,
        0,
        outputSize,
        outputSize
      );

      const data = imageData.data;
      const rawPixels: RawPixel[] = [];

      for (
        let index = 0;
        index < data.length;
        index += 4
      ) {
        rawPixels.push({
          r: data[index],
          g: data[index + 1],
          b: data[index + 2],
          a: data[index + 3],
        });
      }

      /*
       * 使用图片四角的平均颜色估计背景。
       */
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

      const BACKGROUND_TOLERANCE = 55;

      function isBackgroundCandidate(
        pixel: RawPixel
      ) {
        if (pixel.a < 20) {
          return true;
        }

        const redDifference =
          pixel.r - backgroundR;

        const greenDifference =
          pixel.g - backgroundG;

        const blueDifference =
          pixel.b - backgroundB;

        const distance = Math.sqrt(
          redDifference ** 2 +
            greenDifference ** 2 +
            blueDifference ** 2
        );

        return distance <= BACKGROUND_TOLERANCE;
      }

      /*
       * 从图片边缘开始进行 flood fill，
       * 只删除与边缘连接的背景。
       */
      const backgroundMask = Array(
        outputSize * outputSize
      ).fill(false);

      const queue: number[] = [];
      let queuePosition = 0;

      function addToQueue(
        row: number,
        col: number
      ) {
        if (
          row < 0 ||
          row >= outputSize ||
          col < 0 ||
          col >= outputSize
        ) {
          return;
        }

        const index =
          row * outputSize + col;

        if (backgroundMask[index]) {
          return;
        }

        if (
          !isBackgroundCandidate(
            rawPixels[index]
          )
        ) {
          return;
        }

        backgroundMask[index] = true;
        queue.push(index);
      }

      for (
        let col = 0;
        col < outputSize;
        col++
      ) {
        addToQueue(0, col);
        addToQueue(outputSize - 1, col);
      }

      for (
        let row = 0;
        row < outputSize;
        row++
      ) {
        addToQueue(row, 0);
        addToQueue(row, outputSize - 1);
      }

      while (
        queuePosition < queue.length
      ) {
        const currentIndex =
          queue[queuePosition];

        queuePosition += 1;

        const row = Math.floor(
          currentIndex / outputSize
        );

        const col =
          currentIndex % outputSize;

        addToQueue(row - 1, col);
        addToQueue(row + 1, col);
        addToQueue(row, col - 1);
        addToQueue(row, col + 1);
      }

      /*
       * 将有效像素匹配为最接近的 MARD 颜色。
       */
      const patternPixels: PixelCell[] =
        rawPixels.map((pixel, index) => {
          if (
            backgroundMask[index] ||
            pixel.a < 20
          ) {
            return createEmptyPixel();
          }

          const closestMardColor =
            findClosestMardColor({
              r: pixel.r,
              g: pixel.g,
              b: pixel.b,
            });

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
        });

      /*
       * 3×3 众数滤波，减少零碎颜色。
       */
      const filteredPatternPixels =
        applyModeFilter(patternPixels, {
          width: outputSize,
          height: outputSize,
          minimumMajorityCount: 5,
        });

      /*
       * 创建完整豆板。
       */
      const boardPixels: PixelCell[] =
        Array.from(
          {
            length:
              boardSize * boardSize,
          },
          createEmptyPixel
        );

      /*
       * 把图案放到豆板中央。
       */
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

      setPixels(boardPixels);
    };

    image.onerror = () => {
      console.error("图片读取失败");
      setPixels([]);
    };

    image.src = imageUrl;
  }, [imageUrl, boardSize, outputSize]);

  /*
   * 统计每个 MARD 色号的数量。
   */
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

  /*
   * 导出高清 PNG。
   */
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
        legendColumns *
        legendItemWidth;

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

      /*
       * 白色背景。
       */
      context.fillStyle = "#FFFFFF";
      context.fillRect(
        0,
        0,
        canvasWidth,
        canvasHeight
      );

      /*
       * 标题。
       */
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

      /*
       * 绘制每个格子的颜色和色号。
       */
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

      /*
       * 先画所有普通 1px 网格线。
       */
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

      /*
       * 每 5 格画 2px 分隔线。
       */
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

      /*
       * 每 10 格画 3px 分隔线。
       */
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

      /*
       * 豆板最外圈 3px。
       */
      context.strokeStyle = "#30343A";
      context.lineWidth = 3;

      context.strokeRect(
        boardX,
        boardY,
        boardPixelSize,
        boardPixelSize
      );

      /*
       * 图纸统计。
       */
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

      /*
       * 色号图例。
       */
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

      /*
       * 下载 PNG。
       */
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

  /*
   * 网页预览仍使用原来的大小。
   * 即使页面显示不完整，也不影响高清导出。
   */
  const cellSize = 24;

  return (
    <section>
      <h2>拼豆图纸预览</h2>

      <button
        type="button"
        onClick={exportPatternAsPng}
        disabled={
          pixels.length === 0 ||
          isExporting
        }
        style={{
          marginBottom: "20px",
          padding: "12px 20px",
          border: "1px solid #222222",
          borderRadius: "8px",
          backgroundColor: "#222222",
          color: "#FFFFFF",
          fontSize: "16px",
          cursor:
            pixels.length === 0
              ? "not-allowed"
              : "pointer",
          opacity:
            pixels.length === 0
              ? 0.5
              : 1,
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
            maxWidth: "900px",
            margin: "32px auto 0",
          }}
        >
          <h2>颜色用量</h2>

          <p>
            总拼豆数量：
            <strong>
              {totalBeads}
            </strong>{" "}
            颗
          </p>

          <p>
            使用颜色数量：
            <strong>
              {colorStatistics.length}
            </strong>{" "}
            种
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "12px",
              marginTop: "16px",
            }}
          >
            {colorStatistics.map(
              (color) => {
                const rgb =
                  hexToRgb(
                    color.hex
                  );

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
                      gap: "12px",
                      padding: "10px",
                      border:
                        "1px solid #d1d5db",
                      borderRadius:
                        "8px",
                      backgroundColor:
                        "#FFFFFF",
                    }}
                  >
                    <div
                      style={{
                        width: "42px",
                        height: "42px",
                        flexShrink: 0,
                        display: "flex",
                        alignItems:
                          "center",
                        justifyContent:
                          "center",
                        border:
                          "1px solid #9ca3af",
                        borderRadius:
                          "6px",
                        backgroundColor:
                          color.hex,
                        color:
                          textColor,
                        fontSize:
                          "11px",
                        fontWeight: 700,
                      }}
                    >
                      {color.code}
                    </div>

                    <div>
                      <div
                        style={{
                          fontWeight:
                            700,
                        }}
                      >
                        {color.code}
                      </div>

                      <div
                        style={{
                          fontSize:
                            "14px",
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
    </section>
  );
}

export default PixelGrid;