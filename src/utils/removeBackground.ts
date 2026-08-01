import { removeBackground } from "@imgly/background-removal";

/**
 * 使用浏览器端 AI 模型移除图片背景，
 * 返回一个带透明通道的 PNG Blob。
 */

export async function removeImageBackground(
  imageSource: string
): Promise<Blob> {
  const publicPath = new URL(
    "/bg-removal-assets/",
    window.location.origin
  ).toString();

  return removeBackground(imageSource, {
    publicPath,
  });
}