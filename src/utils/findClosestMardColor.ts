import {
  mardColors,
  type MardColor,
} from "../data/mardColors";

type RGB = {
  r: number;
  g: number;
  b: number;
};

export function findClosestMardColor(
  target: RGB
): MardColor {
  let closestColor = mardColors[0];
  let smallestDistance = Infinity;

  for (const color of mardColors) {
    const redDifference = target.r - color.rgb.r;
    const greenDifference = target.g - color.rgb.g;
    const blueDifference = target.b - color.rgb.b;

    const distance =
      redDifference ** 2 +
      greenDifference ** 2 +
      blueDifference ** 2;

    if (distance < smallestDistance) {
      smallestDistance = distance;
      closestColor = color;
    }
  }

  return closestColor;
}