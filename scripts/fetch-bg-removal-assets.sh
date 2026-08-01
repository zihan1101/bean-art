#!/usr/bin/env bash
set -e

ASSET_DIR="public/bg-removal-assets"

if [ -d "$ASSET_DIR" ] && [ "$(ls -A "$ASSET_DIR" 2>/dev/null)" ]; then
  echo "bg-removal-assets 已存在，跳过下载。"
  exit 0
fi

VERSION=$(node -p "require('./package.json').dependencies['@imgly/background-removal']" | sed 's/[^0-9.]//g')

if [ -z "$VERSION" ]; then
  echo "无法从 package.json 中读取 @imgly/background-removal 的版本号"
  exit 1
fi

echo "正在下载 @imgly/background-removal-data v$VERSION ..."

TMP_FILE=$(mktemp)
curl -L -o "$TMP_FILE" "https://staticimgly.com/@imgly/background-removal-data/$VERSION/package.tgz"

TMP_DIR=$(mktemp -d)
tar -xzf "$TMP_FILE" -C "$TMP_DIR"

mkdir -p "$ASSET_DIR"
cp "$TMP_DIR"/package/dist/* "$ASSET_DIR"/

rm -rf "$TMP_FILE" "$TMP_DIR"

echo "完成，模型资源已放到 $ASSET_DIR"
