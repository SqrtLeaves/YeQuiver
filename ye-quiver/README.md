# Ye Quiver — Obsidian 插件

在 Obsidian 阅读模式中将 **TikZ / tikz-cd** 代码块渲染为图片。基于本仓库的 quiver LaTeX 包（`package/quiver.sty`）。

## 依赖

- **桌面版 Obsidian**（不支持移动端）
- 系统已安装 **LaTeX**（TeX Live 或 MacTeX），且 `pdflatex`、`pdftoppm`（poppler-utils）在 PATH 中

```bash
# macOS (Homebrew)
brew install --cask mactex
brew install poppler

# 或仅安装 poppler（若已有 TeX）
brew install poppler
```

## 安装

1. 在 Obsidian 中：设置 → 社区插件 → 关闭安全模式 → 从本地安装。
2. 将本仓库中的 `ye-quiver` 文件夹复制到 vault 的 `.obsidian/plugins/` 下（或通过「从本地加载插件」选择该文件夹）。
3. 确保插件目录内包含：
   - `main.js`、`manifest.json`、`styles.css`
   - `cli/index.mjs`（由 `npm run build` 从仓库根目录复制）
   - `package/quiver.sty`（由 `npm run build` 从仓库根目录复制）
4. 在社区插件中启用 **Ye Quiver**。

## 使用

在笔记里用 **ye-quiver** 代码块写图，例如：

````markdown
```ye-quiver
\begin{tikzcd}
  A \arrow[r] & B
\end{tikzcd}
```
````

或更复杂的 quiver 风格图：

````markdown
```ye-quiver
\begin{tikzcd} & B & \\ \\ {C_0} && {C_1} \\ \arrow[from=3-1, to=1-2] \arrow["f", from=3-3, to=3-1] \end{tikzcd}
```
````

阅读模式下仅显示渲染后的图片。

**编辑时高亮**：在编辑器中，\`\`\`ye-quiver 代码块内的 TikZ/LaTeX 会按 TeX 风格高亮（命令、字符串、注释、括号等使用不同颜色）。

在 **阅读模式** 下，插件会调用本仓库的 CLI，用 `quiver.sty` 和 pdflatex 生成 PNG 并内嵌显示（默认 300 DPI，较清晰）。

**主题适配**：若当前为 Obsidian **深色模式**（`theme-dark`），生成的图会使用深色背景 + 浅色节点与箭头；浅色模式下为浅色背景 + 深色图。切换主题时会自动重新渲染。

**图内缩放（TikZ）**：在 `\begin{tikzcd}` 前使用 `\tikzcdset` 可调节标签、矩阵、箭头等样式与缩放，例如：

````markdown
```ye-quiver
\tikzcdset{
  every label/.append style = {scale=1.5},
  every matrix/.append style = {nodes={scale=1.5, yshift=5ex, xshift=5ex}},
  every arrow/.append style = {line width=0.5pt},
}
\begin{tikzcd}
  A \arrow[r] & B
\end{tikzcd}
```
````

**显示尺寸（魔法注释）**：在代码块**开头**写 `%% key=value` 可控制图片在 Obsidian 中的显示大小（不改变导出分辨率），例如：

- `%% width=80%` 或 `%% width=400px`
- `%% max-width=500px`
- `%% scale=1.2` 整体缩放 1.2 倍

## 开发

```bash
cd ye-quiver
npm install
npm run build   # 编译 main.ts 并复制 cli + package
```

构建会从仓库根目录复制 `cli/index.mjs` 和 `package/quiver.sty` 到插件目录。

## 自动化测试（含 Obsidian CLI）

需要系统已安装 pdflatex、pdftoppm。

```bash
cd ye-quiver
npm run test
```

- **Standalone CLI 测试**：始终运行。用默认与 `--dark` 各渲染一次最小 tikz-cd，并测试文件输入 + `--output`。
- **Obsidian CLI 测试**（可选）：需 Obsidian 1.12.2+ 且已开启「设置 → 常规 → Command line interface」。先打开一个测试用 vault、安装并启用 Ye Quiver 插件，再在该 vault 下执行：
  ```bash
  export OBSIDIAN_VAULT=/path/to/your/test-vault
  npm run test
  ```
  脚本会调用 `obsidian ye-quiver:test`，若返回 `OK` 即通过。

在 Obsidian 内也可直接使用 CLI：在终端运行 `obsidian ye-quiver:test`（会使用当前默认 vault），或带参数 `obsidian ye-quiver:test --tikz "\\begin{tikzcd} A \\arrow[r] & B \\end{tikzcd}" --dark`。

## CLI 单独使用

不通过 Obsidian 也可以直接用命令行把 TikZ 转成图片：

```bash
# 从仓库根目录
node cli/index.mjs test-diagram.tex --output out.png
echo '\begin{tikzcd} A \arrow[r] & B \end{tikzcd}' | node cli/index.mjs --base64
```

选项：`--sty-dir <path>`、`--output <path>`、`--base64`。
