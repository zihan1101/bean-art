export type RgbColor = {
  r: number;
  g: number;
  b: number;
};

type LabColor = {
  l: number;
  a: number;
  b: number;
};

const WHITE_X = 0.95047;
const WHITE_Y = 1.0;
const WHITE_Z = 1.08883;

function srgbToLinear(channel: number) {
  const value = channel / 255;

  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

function linearToSrgb(value: number) {
  const clamped = Math.min(1, Math.max(0, value));

  const converted =
    clamped <= 0.0031308
      ? clamped * 12.92
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;

  return Math.round(
    Math.min(1, Math.max(0, converted)) * 255
  );
}

function rgbToXyz(color: RgbColor) {
  const r = srgbToLinear(color.r);
  const g = srgbToLinear(color.g);
  const b = srgbToLinear(color.b);

  return {
    x: r * 0.4124 + g * 0.3576 + b * 0.1805,
    y: r * 0.2126 + g * 0.7152 + b * 0.0722,
    z: r * 0.0193 + g * 0.1192 + b * 0.9505,
  };
}

function xyzToRgb(xyz: {
  x: number;
  y: number;
  z: number;
}): RgbColor {
  const r =
    xyz.x * 3.2406 +
    xyz.y * -1.5372 +
    xyz.z * -0.4986;

  const g =
    xyz.x * -0.9689 +
    xyz.y * 1.8758 +
    xyz.z * 0.0415;

  const b =
    xyz.x * 0.0557 +
    xyz.y * -0.204 +
    xyz.z * 1.057;

  return {
    r: linearToSrgb(r),
    g: linearToSrgb(g),
    b: linearToSrgb(b),
  };
}

function pivotForward(value: number) {
  return value > 0.008856
    ? Math.cbrt(value)
    : 7.787 * value + 16 / 116;
}

function pivotBackward(value: number) {
  const cubed = value ** 3;

  return cubed > 0.008856
    ? cubed
    : (value - 16 / 116) / 7.787;
}

export function rgbToLab(color: RgbColor): LabColor {
  const xyz = rgbToXyz(color);

  const fx = pivotForward(xyz.x / WHITE_X);
  const fy = pivotForward(xyz.y / WHITE_Y);
  const fz = pivotForward(xyz.z / WHITE_Z);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function labToRgb(lab: LabColor): RgbColor {
  const fy = (lab.l + 16) / 116;
  const fx = fy + lab.a / 500;
  const fz = fy - lab.b / 200;

  const xyz = {
    x: WHITE_X * pivotBackward(fx),
    y: WHITE_Y * pivotBackward(fy),
    z: WHITE_Z * pivotBackward(fz),
  };

  return xyzToRgb(xyz);
}

function labDistanceSquared(
  first: LabColor,
  second: LabColor
) {
  const dl = first.l - second.l;
  const da = first.a - second.a;
  const db = first.b - second.b;

  return dl * dl + da * da + db * db;
}

/*
 * 基于输入颜色本身生成一个固定的随机数种子，
 * 保证同一张图、同样的设置，每次量化结果完全一致，
 * 不会因为算法内部的随机性导致每次生成的图纸颜色都不一样。
 */
function computeSeedFromColors(
  colors: RgbColor[]
): number {
  let seed = (colors.length * 2654435761) >>> 0;

  for (const color of colors) {
    seed =
      (seed ^
        (color.r * 73856093 +
          color.g * 19349663 +
          color.b * 83492791)) >>>
      0;
  }

  return seed >>> 0;
}

/*
 * 简单的可复现伪随机数生成器（mulberry32）。
 */
function createSeededRandom(seed: number) {
  let state = seed >>> 0;

  return function random() {
    state = (state + 0x6d2b79f5) | 0;

    let t = Math.imul(
      state ^ (state >>> 15),
      1 | state
    );

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/*
 * k-means++ 初始化：
 * 第一个中心随机选一个点，
 * 之后每选一个新中心时，距离已有中心越远的点，
 * 被选中的概率越高。
 *
 * 相比均匀采样，这种方式更容易把孤立的、
 * 少数但视觉上重要的“异常色”一开始就选成独立的聚类中心，
 * 而不是从一开始就被主色群吞并。
 */
function kMeansPlusPlusInit(
  labColors: LabColor[],
  clusterCount: number,
  random: () => number
): LabColor[] {
  const centroids: LabColor[] = [];

  const firstIndex = Math.floor(
    random() * labColors.length
  );

  centroids.push({ ...labColors[firstIndex] });

  const nearestDistanceSquared = new Array(
    labColors.length
  ).fill(Infinity);

  while (centroids.length < clusterCount) {
    const lastCentroid =
      centroids[centroids.length - 1];

    let totalWeight = 0;

    for (let i = 0; i < labColors.length; i++) {
      const distance = labDistanceSquared(
        labColors[i],
        lastCentroid
      );

      if (distance < nearestDistanceSquared[i]) {
        nearestDistanceSquared[i] = distance;
      }

      totalWeight += nearestDistanceSquared[i];
    }

    if (totalWeight === 0) {
      const fallbackIndex = Math.floor(
        random() * labColors.length
      );

      centroids.push({
        ...labColors[fallbackIndex],
      });

      continue;
    }

    let threshold = random() * totalWeight;
    let chosenIndex = labColors.length - 1;

    for (let i = 0; i < labColors.length; i++) {
      threshold -= nearestDistanceSquared[i];

      if (threshold <= 0) {
        chosenIndex = i;
        break;
      }
    }

    centroids.push({ ...labColors[chosenIndex] });
  }

  return centroids;
}

function runKMeans(
  labColors: LabColor[],
  initialCentroids: LabColor[],
  maxIterations: number
): {
  assignments: number[];
  centroids: LabColor[];
  distortion: number;
} {
  let centroids = initialCentroids.map(
    (centroid) => ({ ...centroid })
  );

  const assignments = new Array(
    labColors.length
  ).fill(0);

  for (
    let iteration = 0;
    iteration < maxIterations;
    iteration++
  ) {
    let hasChanged = false;

    for (
      let pixelIndex = 0;
      pixelIndex < labColors.length;
      pixelIndex++
    ) {
      let bestClusterIndex = 0;
      let bestDistance = Infinity;

      for (
        let clusterIndex = 0;
        clusterIndex < centroids.length;
        clusterIndex++
      ) {
        const distance = labDistanceSquared(
          labColors[pixelIndex],
          centroids[clusterIndex]
        );

        if (distance < bestDistance) {
          bestDistance = distance;
          bestClusterIndex = clusterIndex;
        }
      }

      if (
        assignments[pixelIndex] !==
        bestClusterIndex
      ) {
        hasChanged = true;
      }

      assignments[pixelIndex] =
        bestClusterIndex;
    }

    const sums = centroids.map(() => ({
      l: 0,
      a: 0,
      b: 0,
      count: 0,
    }));

    for (
      let pixelIndex = 0;
      pixelIndex < labColors.length;
      pixelIndex++
    ) {
      const clusterIndex =
        assignments[pixelIndex];

      sums[clusterIndex].l +=
        labColors[pixelIndex].l;

      sums[clusterIndex].a +=
        labColors[pixelIndex].a;

      sums[clusterIndex].b +=
        labColors[pixelIndex].b;

      sums[clusterIndex].count += 1;
    }

    centroids = sums.map((sum, index) =>
      sum.count > 0
        ? {
            l: sum.l / sum.count,
            a: sum.a / sum.count,
            b: sum.b / sum.count,
          }
        : centroids[index]
    );

    if (!hasChanged) {
      break;
    }
  }

  let distortion = 0;

  for (
    let pixelIndex = 0;
    pixelIndex < labColors.length;
    pixelIndex++
  ) {
    distortion += labDistanceSquared(
      labColors[pixelIndex],
      centroids[assignments[pixelIndex]]
    );
  }

  return { assignments, centroids, distortion };
}

export type QuantizeResult = {
  /*
   * assignments[i] 是第 i 个输入颜色所属的聚类编号，
   * 对应 centroids[assignments[i]]。
   */
  assignments: number[];
  centroids: RgbColor[];
};

/*
 * 在 Lab 色彩空间里做 k-means 聚类，
 * 把大量相近的颜色压缩成 clusterCount 个代表色。
 *
 * 用 k-means++ 初始化 + 多次运行取最优（restartCount 次），
 * 比朴素的均匀初始化更容易保留少数但重要的细节色，
 * 也更不容易陷入局部最优。
 *
 * 用固定种子的随机数，保证同一张图每次结果一致。
 */
export function quantizeColors(
  colors: RgbColor[],
  clusterCount: number,
  maxIterations = 12,
  restartCount = 5
): QuantizeResult {
  if (colors.length === 0) {
    return { assignments: [], centroids: [] };
  }

  const effectiveClusterCount = Math.max(
    1,
    Math.min(clusterCount, colors.length)
  );

  const labColors = colors.map(rgbToLab);

  const seed = computeSeedFromColors(colors);
  const random = createSeededRandom(seed);

  let bestResult: {
    assignments: number[];
    centroids: LabColor[];
    distortion: number;
  } | null = null;

  for (
    let restart = 0;
    restart < restartCount;
    restart++
  ) {
    const initialCentroids =
      kMeansPlusPlusInit(
        labColors,
        effectiveClusterCount,
        random
      );

    const result = runKMeans(
      labColors,
      initialCentroids,
      maxIterations
    );

    if (
      !bestResult ||
      result.distortion < bestResult.distortion
    ) {
      bestResult = result;
    }
  }

  return {
    assignments: bestResult!.assignments,
    centroids:
      bestResult!.centroids.map(labToRgb),
  };
}