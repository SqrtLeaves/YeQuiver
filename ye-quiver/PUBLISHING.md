# 将 Ye Quiver 发布到 Obsidian 社区插件库

按以下步骤可将本插件提交到 [Obsidian 社区插件列表](https://github.com/obsidianmd/obsidian-releases)，通过 Obsidian 内「浏览」即可安装。

## 前置条件

- 本仓库已推送到 **GitHub**（例如 `https://github.com/YOUR_USERNAME/YeQuiver`）。
- 仓库根目录有 **LICENSE** 和 **README.md**（本仓库已具备）。
- 发布前请将 `manifest.json` 中的 `author`、`authorUrl` 改为你的 GitHub 用户名/主页（可选但建议）。

## 一、准备发布版本

1. **更新版本号**  
   编辑 `ye-quiver/manifest.json`，将 `version` 改为新版本号（遵循 [语义化版本](https://semver.org/)），例如 `0.1.0`。

2. **构建插件**  
   在仓库根目录执行：
   ```bash
   cd ye-quiver
   npm run build
   ```
   得到 `main.js`、`manifest.json`、`styles.css`（以及已有文件）。

3. **提交并打 tag**  
   ```bash
   git add ye-quiver/manifest.json ye-quiver/main.js ye-quiver/styles.css
   git commit -m "Release ye-quiver x.x.x"
   git tag 0.1.0
   ```
   **注意**：Obsidian 要求发布 tag **不要** 带 `v` 前缀，即用 `0.1.0` 而不是 `v0.1.0`。

## 二、创建 GitHub Release 并上传文件

**方式 A：使用 GitHub Actions（推荐）**

- 已配置 `.github/workflows/release.yml`：当你**发布 Release** 时，会自动构建并上传 `manifest.json`、`main.js`、`styles.css` 到该 Release。
- 操作步骤：
  1. 确保本地已提交并 push 了包含最新 `ye-quiver` 代码的 commit（含 `manifest.json` 中要发布的版本号）。
  2. 在 GitHub 仓库页面：**Releases → Create a new release**。
  3. **Choose a tag**：输入与 `manifest.json` 中一致的版本号（如 `0.1.0`），选择 “Create new tag: 0.1.0 on publish”。
  4. Release title 可填 `Ye Quiver 0.1.0`，描述随意。**无需**在页面上传任何文件。
  5. 点击 **Publish release**。
  6. 等待约 1 分钟，Actions 会自动构建并把三个文件挂到该 Release 下；可在 Release 页面看到 `manifest.json`、`main.js`、`styles.css`。

**方式 B：手动上传**

1. 在 GitHub 仓库：**Releases → Create a new release**。
2. Tag 填版本号（如 `0.1.0`，无 `v`），创建 release。
3. 在 “Attach binaries” 中上传 **ye-quiver** 目录下的：
   - `manifest.json`
   - `main.js`
   - `styles.css`

## 三、提交到 Obsidian 社区插件列表

1. **Fork 官方仓库**  
   打开 [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)，点击 Fork。

2. **在 Fork 中编辑 `community-plugins.json`**  
   - 打开 `community-plugins.json`。
   - 在 JSON 数组末尾添加一条新记录（注意上一项末尾加逗号），例如：
   ```json
   ,
   {
     "id": "ye-quiver",
     "name": "Ye Quiver",
     "author": "你的名字或 GitHub 用户名",
     "description": "Render TikZ/tikz-cd code blocks as images using the quiver LaTeX package.",
     "repo": "YOUR_GITHUB_USERNAME/YeQuiver",
     "branch": "main"
   }
   ```
   - `id` 必须与 `manifest.json` 的 `id` 一致（`ye-quiver`）。
   - `repo` 填你的仓库路径：`你的GitHub用户名/仓库名`。
   - 若主分支是 `master` 可写 `"branch": "master"`，否则可省略（默认 master）。

3. **提交 Pull Request**  
   - 在 Fork 中 commit 并 push，然后在 GitHub 上对 **obsidianmd/obsidian-releases** 发起 **Pull Request**。
   - 按 PR 模板填写说明，勾选已完成的项。

4. **等待审核**  
   Obsidian 团队会审核你的 PR。通过合并后，用户即可在 Obsidian 内通过「设置 → 社区插件 → 浏览」搜索 “Ye Quiver” 安装。

## 四、后续更新

- 以后每次发新版本：只需在 `manifest.json` 中改版本号 → 构建 → 在 GitHub 上创建新的 Release（tag 与新版本号一致）并上传或由 Actions 自动上传三个文件。
- **无需**再次改 `obsidian-releases`；Obsidian 会从你仓库的 Release 自动拉取新版本。

## 参考

- [Obsidian 官方：提交插件](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)
- [obsidian-releases 仓库](https://github.com/obsidianmd/obsidian-releases)
