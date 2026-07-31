type FilterCell = {
  isEmpty: boolean;
  colorCode: string;
  hex: string;
  r: number;
  g: number;
  b: number;
  a: number;
};

type ApplyModeFilterOptions = {
  width: number;
  height: number;
  minimumMajorityCount?: number;
};

export function applyModeFilter(
  pixels: FilterCell[],
  {
    width,
    height,
    minimumMajorityCount = 5,
  }: ApplyModeFilterOptions
): FilterCell[] {
  const result = pixels.map((pixel) => ({ ...pixel }));

  function getIndex(row: number, col: number) {
    return row * width + col;
  }

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const centerIndex = getIndex(row, col);
      const centerPixel = pixels[centerIndex];

      if (centerPixel.isEmpty) {
        continue;
      }

      const colorCounts = new Map<
        string,
        {
          count: number;
          pixel: FilterCell;
        }
      >();

      for (
        let neighborRow = row - 1;
        neighborRow <= row + 1;
        neighborRow++
      ) {
        for (
          let neighborCol = col - 1;
          neighborCol <= col + 1;
          neighborCol++
        ) {
          if (
            neighborRow < 0 ||
            neighborRow >= height ||
            neighborCol < 0 ||
            neighborCol >= width
          ) {
            continue;
          }

          const neighborIndex = getIndex(
            neighborRow,
            neighborCol
          );

          const neighborPixel = pixels[neighborIndex];

          if (neighborPixel.isEmpty) {
            continue;
          }

          const current = colorCounts.get(
            neighborPixel.colorCode
          );

          if (current) {
            current.count += 1;
          } else {
            colorCounts.set(neighborPixel.colorCode, {
              count: 1,
              pixel: neighborPixel,
            });
          }
        }
      }

      let mostCommonColor:
        | {
            count: number;
            pixel: FilterCell;
          }
        | undefined;

      for (const colorInfo of colorCounts.values()) {
        if (
          !mostCommonColor ||
          colorInfo.count > mostCommonColor.count
        ) {
          mostCommonColor = colorInfo;
        }
      }

      if (
        mostCommonColor &&
        mostCommonColor.count >= minimumMajorityCount
      ) {
        result[centerIndex] = {
          ...mostCommonColor.pixel,
        };
      }
    }
  }

  return result;
}