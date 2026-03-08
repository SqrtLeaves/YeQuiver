#!/usr/bin/env bash
# 一键构建并复制 ye-quiver 插件到 Obsidian vault
# CLI 与 quiver.sty 已内嵌在 main.js，只需复制三个文件即可。
# 用法: ./deploy-ye-quiver.sh  或  DEST=/其他/vault/.obsidian/plugins/ye-quiver ./deploy-ye-quiver.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DEST="${DEST:-/Users/leaves/同步空间/Obsidian/MATH/.obsidian/plugins/ye-quiver}"

echo "Build ye-quiver..."
cd ye-quiver
npm run build
echo "Copy to $DEST ..."
mkdir -p "$DEST"
cp manifest.json main.js styles.css "$DEST"
cd "$SCRIPT_DIR"
echo "Done."
