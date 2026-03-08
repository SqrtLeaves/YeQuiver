# Ye Quiver — Obsidian 插件

在 Obsidian 阅读模式中将 **TikZ / tikz-cd** 代码块渲染为图片。基于本仓库的 quiver LaTeX 包（`package/quiver.sty`）。

---

## 从零部署（已安装 Obsidian，clone 本库后）

假设你已经安装好 **Obsidian**，刚 **clone 本仓库**，希望在本机把插件跑起来。按下面顺序做即可。

### 1. 安装依赖

- **Node.js**（用于构建插件，需 18+）：[nodejs.org](https://nodejs.org/) 或 `brew install node`
- **LaTeX**（用于渲染 TikZ）：pdflatex 可用即可，例如 MacTeX / TeX Live
- **poppler**（提供 `pdftoppm`，用于 PDF 转 PNG）：`brew install poppler`
- **ImageMagick**（可选，用于透明背景 PNG）：`brew install imagemagick`；不装则 PNG 为白底

```bash
# macOS (Homebrew) 示例
brew install node
brew install --cask mactex    # 或仅需 pdflatex 的轻量 TeX
brew install poppler
brew install imagemagick     # 可选，透明背景
```

### 2. 构建插件

在**仓库根目录**执行：

```bash
cd ye-quiver
npm install
npm run build
```

构建完成后，`ye-quiver` 目录下会得到可用的 `main.js`、`manifest.json`、`styles.css`（CLI 与 quiver.sty 已内嵌在 main.js，无需单独复制）。

### 3. 安装到 Obsidian vault

任选一种方式。

**方式 A：用部署脚本（推荐）**

在仓库根目录执行，把 `DEST` 换成你的 vault 插件目录：

```bash
DEST="/你的/vault/路径/.obsidian/plugins/ye-quiver" ./deploy-ye-quiver.sh
```

脚本会先执行 `npm run build`，再把 `manifest.json`、`main.js`、`styles.css` 复制到 `DEST`。

**方式 B：手动复制**

1. 在 vault 下创建目录：`.obsidian/plugins/ye-quiver`
2. 将仓库中 **ye-quiver** 目录下的这三个文件复制进去：
   - `manifest.json`
   - `main.js`
   - `styles.css`

### 4. 在 Obsidian 中启用

1. 打开该 vault，进入 **设置 → 社区插件**
2. 关闭 **安全模式**，若需“从本地安装”则先选择并加载插件目录
3. 在社区插件列表中找到 **Ye Quiver**，打开开关

之后在阅读模式下打开包含 ` ```ye-quiver ` 代码块的笔记即可看到渲染结果。

---

## 依赖说明

- **桌面版 Obsidian**（不支持移动端）
- **Node.js**：仅构建时需要；运行时 Obsidian 会调用系统 Node 执行内嵌 CLI
- **LaTeX**：系统需有 `pdflatex`（TeX Live / MacTeX 等）
- **poppler**：系统需有 `pdftoppm`（`brew install poppler`）
- **ImageMagick**（可选）：若有 `convert`，可生成透明背景 PNG；否则为白底

## 安装方式汇总

| 方式 | 适用 |
|------|------|
| [从零部署](#从零部署已安装-obsidianclone-本库后) | 已 clone 本库，从源码构建并安装到本机 vault |
| 从 Obsidian 社区插件安装 | 插件已上架时：设置 → 社区插件 → 浏览 → 搜索 “Ye Quiver” 安装 |

---

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

- **编辑时高亮**：在编辑器中，`ye-quiver` 代码块内的 TikZ/LaTeX 会按 TeX 风格高亮。
- **阅读模式**：插件调用内嵌 CLI，用 `quiver.sty` 和 pdflatex 生成 PNG 并内嵌显示（默认 300 DPI）。
- **主题适配**：深色模式下图为浅色节点/箭头，浅色模式下为深色图；切换主题会自动重新渲染。
- **图内缩放（TikZ）**：在 `\begin{tikzcd}` 前使用 `\tikzcdset{ ... }` 可调节样式与缩放。
- **显示尺寸（魔法注释）**：在代码块**开头**写 `%% key=value`，例如：
  - `%% width=80%`、`%% width=400px`
  - `%% max-width=500px`
  - `%% scale=1.2`

## 开发

```bash
cd ye-quiver
npm install
npm run build   # 编译 main.ts，并将 CLI 与 quiver.sty 内嵌到 main.js
```

## 自动化测试（含 Obsidian CLI）

需要系统已安装 pdflatex、pdftoppm。

```bash
cd ye-quiver
npm run test
```

- **Standalone CLI 测试**：始终运行。用默认与 `--dark` 各渲染一次最小 tikz-cd，并测试文件输入 + `--output`。
- **Obsidian CLI 测试**（可选）：需 Obsidian 1.12.2+ 且已开启「设置 → 常规 → Command line interface」。先打开一个测试用 vault、安装并启用 Ye Quiver，再在该 vault 下执行：
  ```bash
  export OBSIDIAN_VAULT=/path/to/your/test-vault
  npm run test
  ```
  脚本会调用 `obsidian ye-quiver:test`，若返回 `OK` 即通过。

在 Obsidian 内也可直接使用 CLI：在终端运行 `obsidian ye-quiver:test`，或带参数 `obsidian ye-quiver:test --tikz "\\begin{tikzcd} A \\arrow[r] & B \\end{tikzcd}" --dark`。

## CLI 单独使用

不通过 Obsidian 也可以直接用命令行把 TikZ 转成图片：

```bash
# 从仓库根目录
node cli/index.mjs test-diagram.tex --output out.png
echo '\begin{tikzcd} A \arrow[r] & B \end{tikzcd}' | node cli/index.mjs --base64
```

选项：`--sty-dir <path>`、`--output <path>`、`--base64`、`--dark`、`--dpi <n>`。
