import { App, Plugin, PluginManifest } from "obsidian";
import { EMBEDDED_CLI_SOURCE, EMBEDDED_QUIVER_STY } from "./embedded-assets.generated";

declare const require: (id: string) => any;

const TEST_TIKZ = "\\begin{tikzcd}\n\tA \\arrow[r] & B\n\\end{tikzcd}";

const PLUGIN_ID = "ye-quiver";
const NODE_MODULES_AVAILABLE: boolean = (() => {
  try {
    require("child_process");
    return true;
  } catch {
    return false;
  }
})();

function getPluginDir(app: App, manifest: PluginManifest): string | null {
  const path = require("path");
  const candidates: string[] = [];
  try {
    if (typeof __dirname !== "undefined") candidates.push(path.resolve(__dirname));
  } catch (_) {}
  try {
    const mdir = (manifest as any).dir;
    if (mdir && path.isAbsolute(mdir)) candidates.push(mdir);
  } catch (_) {}
  try {
    const vault = app.vault;
    const adapter = (vault as any).adapter;
    if (adapter?.getBasePath) {
      const base = (adapter.getBasePath() as string).replace(/^file:\/\//, "").replace(/\/$/, "");
      const dir = (manifest as any).dir || PLUGIN_ID;
      candidates.push(path.join(base, ".obsidian", "plugins", dir));
    }
  } catch (_) {}
  const fs = require("fs");
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, "styles.css"))) return dir;
  }
  return null;
}

function isDarkMode(): boolean {
  return typeof document !== "undefined" && document.body.classList.contains("theme-dark");
}

/** 解析代码块开头的魔法注释 %% key=value，返回 { tex: 去掉注释后的源码, style: 用于 img 的 CSS } */
function parseDisplayOptions(source: string): { tex: string; style: Record<string, string> } {
  const style: Record<string, string> = {};
  let tex = source;
  const lines = source.split("\n");
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^\s*%%\s*(\w+)\s*=\s*(.+)\s*$/);
    if (!m) break;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === "width") style.width = val;
    else if (key === "max-width") style.maxWidth = val;
    else if (key === "height") style.height = val;
    else if (key === "max-height") style.maxHeight = val;
    else if (key === "scale") {
      const n = parseFloat(val);
      if (!isNaN(n) && n > 0) style.transform = `scale(${n})`;
    }
  }
  if (i > 0) tex = lines.slice(i).join("\n").trim();
  return { tex, style };
}

function encodeSourceForAttr(source: string): string {
  try {
    return btoa(unescape(encodeURIComponent(source)));
  } catch {
    return "";
  }
}
function decodeSourceFromAttr(encoded: string): string {
  try {
    return decodeURIComponent(escape(atob(encoded)));
  } catch {
    return "";
  }
}

/** 为编辑器中 ```ye-quiver 代码块内容添加 TeX 风格语法高亮 */
function createYeQuiverHighlightPlugin(
  ViewPlugin: any,
  Decoration: any,
  RangeSetBuilder: any
): any {
  const blockRe = /^```ye-quiver\r?\n([\s\S]*?)^```$/gm;
  const commandRe = /\\([a-zA-Z@]+)/g;
  const stringRe = /"([^"\\]|\\.)*"/g;
  const commentRe = /%.*$/gm;
  const bracketRe = /[{}[\]]/g;

  class PluginValue {
    decorations: any;
    constructor(public view: any) {
      this.decorations = this.buildDecorations();
    }
    update() {
      this.decorations = this.buildDecorations();
    }
    buildDecorations() {
      const builder = new RangeSetBuilder();
      const doc = this.view.state.doc.toString();
      let m;
      blockRe.lastIndex = 0;
      while ((m = blockRe.exec(doc)) !== null) {
        const contentStart = m.index + (m[0].indexOf("\n") + 1);
        const content = m[1];
        const contentEnd = contentStart + content.length;
        const marks: Array<{ from: number; to: number; class: string }> = [];
        function add(re: RegExp, cls: string) {
          re.lastIndex = 0;
          let r;
          while ((r = re.exec(content)) !== null) {
            marks.push({
              from: contentStart + r.index,
              to: contentStart + r.index + r[0].length,
              class: cls,
            });
          }
        }
        add(commentRe, "yq-comment");
        add(stringRe, "yq-string");
        add(commandRe, "yq-command");
        add(bracketRe, "yq-bracket");
        marks.sort((a, b) => a.from - b.from);
        let last = contentStart;
        for (const { from, to, class: cls } of marks) {
          if (from >= last) {
            builder.add(from, to, Decoration.mark({ class: cls }));
            last = to;
          }
        }
      }
      return builder.finish();
    }
  }
  return ViewPlugin.fromClass(PluginValue, {
    decorations: (v: PluginValue) => v.decorations,
  });
}

/** 返回用于执行 CLI 的 node 可执行路径。GUI 应用（如 Obsidian）往往没有完整 PATH，故尝试常见安装位置。 */
function getNodePath(): string {
  const path = require("path");
  const fs = require("fs");
  const candidates: string[] = [];
  if (process.platform === "darwin") {
    candidates.push("/opt/homebrew/bin/node", "/usr/local/bin/node");
  } else if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA;
    const pf = process.env.ProgramFiles;
    const pf86 = process.env["ProgramFiles(x86)"];
    if (local) candidates.push(path.join(local, "Programs", "node", "node.exe"));
    if (pf) candidates.push(path.join(pf, "nodejs", "node.exe"));
    if (pf86) candidates.push(path.join(pf86, "nodejs", "node.exe"));
  } else {
    candidates.push("/usr/local/bin/node", "/usr/bin/node");
  }
  candidates.push("node"); // 最后尝试 PATH 中的 node
  for (const p of candidates) {
    if (p === "node") return p;
    if (fs.existsSync(p)) return p;
  }
  return "node";
}

const RENDER_CACHE_MAX = 30;
const renderCache = new Map<string, string>();
const renderCacheKeys: string[] = [];

function getAssetDir(): string {
  const path = require("path");
  const fs = require("fs");
  const os = require("os");
  try {
    const base = path.join(os.tmpdir(), "ye-quiver-assets");
    if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
    const cliPath = path.join(base, "index.mjs");
    const styDir = path.join(base, "package");
    const styPath = path.join(styDir, "quiver.sty");
    if (!fs.existsSync(cliPath) || !fs.existsSync(styPath)) {
      fs.mkdirSync(styDir, { recursive: true });
      fs.writeFileSync(cliPath, EMBEDDED_CLI_SOURCE, "utf8");
      fs.writeFileSync(styPath, EMBEDDED_QUIVER_STY, "utf8");
    }
    return base;
  } catch {
    const fallback = fs.mkdtempSync(path.join(os.tmpdir(), "ye-quiver-"));
    fs.mkdirSync(path.join(fallback, "package"), { recursive: true });
    fs.writeFileSync(path.join(fallback, "index.mjs"), EMBEDDED_CLI_SOURCE, "utf8");
    fs.writeFileSync(path.join(fallback, "package", "quiver.sty"), EMBEDDED_QUIVER_STY, "utf8");
    return fallback;
  }
}

function cacheKey(tex: string, dark: boolean): string {
  return (dark ? "1" : "0") + "\n" + tex;
}

function getCached(tex: string, dark: boolean): string | null {
  const key = cacheKey(tex, dark);
  const b64 = renderCache.get(key);
  if (b64 != null) {
    const idx = renderCacheKeys.indexOf(key);
    if (idx >= 0) {
      renderCacheKeys.splice(idx, 1);
      renderCacheKeys.push(key);
    }
    return b64;
  }
  return null;
}

function setCached(tex: string, dark: boolean, base64: string): void {
  const key = cacheKey(tex, dark);
  if (renderCache.has(key)) {
    const idx = renderCacheKeys.indexOf(key);
    if (idx >= 0) renderCacheKeys.splice(idx, 1);
  }
  renderCacheKeys.push(key);
  renderCache.set(key, base64);
  while (renderCache.size > RENDER_CACHE_MAX && renderCacheKeys.length > 0) {
    const evict = renderCacheKeys.shift()!;
    renderCache.delete(evict);
  }
}

async function tikzToPngBase64(tex: string, dark: boolean): Promise<string> {
  const cached = getCached(tex, dark);
  if (cached != null) return cached;

  const path = require("path");
  const fs = require("fs");
  const { spawn } = require("child_process");

  const base = getAssetDir();
  const cliPath = path.join(base, "index.mjs");
  const styDir = path.join(base, "package");

  const args = [cliPath, "--sty-dir", styDir, "--base64"];
  if (dark) args.push("--dark");
  const nodeCmd = getNodePath();
  const result = await new Promise<string>((resolve, reject) => {
    const proc = spawn(nodeCmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });
    let stdout = Buffer.alloc(0);
    let stderr = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout = Buffer.concat([stdout, chunk]);
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err: Error) => {
      const msg =
        (err as NodeJS.ErrnoException).code === "ENOENT"
          ? `未找到 Node.js（已尝试: ${nodeCmd}）。请安装 Node.js 并确保在常见路径（如 /opt/homebrew/bin、/usr/local/bin）或系统 PATH 中。`
          : "无法启动 node: " + (err.message || String(err));
      reject(new Error(msg));
    });
    proc.on("close", (code: number | null, signal: string | null) => {
      if (code === 0 && signal == null) {
        resolve(stdout.toString("utf8").trim());
        return;
      }
      const msg = signal
        ? `进程被终止 (signal: ${signal})`
        : code != null
          ? `退出码 ${code}`
          : "退出码未知";
      reject(new Error(stderr.trim() || msg));
    });
    proc.stdin?.end(tex, "utf8");
  });

  setCached(tex, dark, result);
  return result;
}

export default class YeQuiverPlugin extends Plugin {
  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
  }

  onload() {
    const pluginDir = getPluginDir(this.app, this.manifest);
    if (!pluginDir) {
      console.warn("Ye Quiver: could not resolve plugin directory");
    }
    if (!NODE_MODULES_AVAILABLE) {
      console.warn("Ye Quiver: child_process not available (e.g. mobile). TikZ blocks will show a message.");
    }

    const path = require("path");
    const fs = require("fs");
    const stylesPath = path.join(pluginDir || "", "styles.css");
    if (pluginDir && fs.existsSync(stylesPath)) {
      this.addStyleSheet(stylesPath);
    }

    const renderOne = async (container: HTMLElement, source: string): Promise<void> => {
      while (container.firstChild) container.removeChild(container.firstChild);
      const { tex, style: displayStyle } = parseDisplayOptions(source);
      const dark = isDarkMode();
      const loading = container.createDiv({ cls: "ye-quiver-loading", text: "Rendering TikZ…" });
      try {
        const base64 = await tikzToPngBase64(tex, dark);
        loading.remove();
        const img = container.createEl("img", {
          attr: {
            src: `data:image/png;base64,${base64}`,
            alt: "TikZ diagram",
            class: "ye-quiver-img",
          },
        });
        if (Object.keys(displayStyle).length > 0) {
          Object.assign(img.style, displayStyle);
          if (displayStyle.transform) img.style.transformOrigin = "top left";
        }
      } catch (err: any) {
        loading.remove();
        container.createDiv({
          cls: "ye-quiver-error",
          text: `TikZ error: ${err?.message || String(err)}`,
        });
      }
    };

    const refreshAllTikz = () => {
      const containers = document.querySelectorAll<HTMLElement>(".ye-quiver-container[data-ye-quiver-source]");
      const tasks = Array.from(containers)
        .map((container) => {
          const encoded = container.getAttribute("data-ye-quiver-source");
          if (!encoded) return null;
          const source = decodeSourceFromAttr(encoded);
          if (!source) return null;
          return renderOne(container, source);
        })
        .filter((p): p is Promise<void> => p != null);
      void Promise.all(tasks);
    };

    try {
      const { ViewPlugin, Decoration } = require("@codemirror/view");
      const { RangeSetBuilder } = require("@codemirror/state");
      const yeQuiverHighlight = createYeQuiverHighlightPlugin(ViewPlugin, Decoration, RangeSetBuilder);
      this.registerEditorExtension(yeQuiverHighlight);
    } catch (_) {
      console.warn("Ye Quiver: editor syntax highlighting not available (CodeMirror view/state)");
    }

    this.registerMarkdownCodeBlockProcessor("ye-quiver", async (source, el, ctx) => {
      const container = el.createDiv({ cls: "ye-quiver-container" });
      container.setAttribute("data-ye-quiver-source", encodeSourceForAttr(source.trim()));
      if (!NODE_MODULES_AVAILABLE) {
        container.createDiv({
          cls: "ye-quiver-error",
          text: "Ye Quiver 无法在当前 Obsidian 环境中执行系统命令（无 child_process）。请用命令行生成图片后插入：在仓库目录运行 node cli/index.mjs --output 图.png <你的.tex>，再将生成的 PNG 插入笔记。",
        });
        return;
      }
      await renderOne(container, source.trim());
    });

    this.registerEvent(this.app.workspace.on("css-change", refreshAllTikz));

    if (typeof (this as any).registerCliHandler === "function") {
      (this as any).registerCliHandler(
        "ye-quiver:test",
        "Run ye-quiver TikZ render test (for automation). Renders sample tikz-cd and returns OK or FAIL.",
        {
          tikz: {
            value: "<code>",
            description: "TikZ/tikz-cd source (default: minimal A→B diagram)",
            required: false,
          },
          dark: {
            description: "Use light arrows/nodes (for dark theme)",
            required: false,
          },
        },
        async (params: Record<string, string>) => {
          if (!NODE_MODULES_AVAILABLE) return "FAIL: Node (child_process) not available";
          const tikz = params.tikz && params.tikz.trim() ? params.tikz.trim() : TEST_TIKZ;
          const dark = params.dark === "true" || params.dark === "1";
          try {
            await tikzToPngBase64(tikz, dark);
            return "OK";
          } catch (err: any) {
            return "FAIL: " + (err?.message || String(err));
          }
        }
      );
    }
  }

  onunload() {}
}
