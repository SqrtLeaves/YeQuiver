import { App, MarkdownRenderer, Notice, Plugin, PluginManifest, PluginSettingTab, Setting } from "obsidian";
import { EMBEDDED_CLI_SOURCE, EMBEDDED_QUIVER_STY } from "./embedded-assets.generated";

declare const require: (id: string) => any;

const TEST_TIKZ = "\\begin{tikzcd}\n\tA \\arrow[r] & B\n\\end{tikzcd}";

const PLUGIN_ID = "ye-quiver";

const MANIFEST_FILENAME = "cache-manifest.json";

const DPI_MIN = 72;
const DPI_MAX = 600;
const DPI_DEFAULT = 300;

export interface YeQuiverSettings {
  cacheDir: string;
  maxCacheSize: number;
  maxMemoryCacheSize: number;
  preGenerateOtherTheme: boolean;
  /** 生成 PNG 的 DPI，越大越清晰、文件越大。72–600 */
  dpi: number;
}

const DEFAULT_SETTINGS: YeQuiverSettings = {
  cacheDir: "",
  maxCacheSize: 1000,
  maxMemoryCacheSize: 30,
  preGenerateOtherTheme: true,
  dpi: DPI_DEFAULT,
};
const NODE_MODULES_AVAILABLE: boolean = (() => {
  try {
    require("child_process");
    return true;
  } catch {
    return false;
  }
})();

/** Obsidian 库内插件安装目录：vault/.obsidian/plugins/ye-quiver（仅桌面端 adapter 有 getBasePath） */
function getObsidianPluginRoot(app: App, _manifest: PluginManifest): string | null {
  try {
    const path = require("path");
    const adapter = app.vault.adapter as { getBasePath?: () => string };
    if (adapter && typeof adapter.getBasePath === "function") {
      const base = adapter.getBasePath().replace(/^file:\/\//, "").replace(/\/$/, "");
      return path.join(base, ".obsidian", "plugins", PLUGIN_ID);
    }
  } catch (_) {}
  return null;
}

function getPluginDir(app: App, manifest: PluginManifest): string | null {
  const path = require("path");
  const candidates: string[] = [];
  try {
    const obsidianRoot = getObsidianPluginRoot(app, manifest);
    if (obsidianRoot) candidates.push(obsidianRoot);
  } catch (_) {}
  try {
    if (typeof __dirname !== "undefined") candidates.push(path.resolve(__dirname));
  } catch (_) {}
  try {
    const mdir = (manifest as any).dir;
    if (mdir && path.isAbsolute(mdir)) candidates.push(mdir);
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

/** 解析代码块开头的魔法注释 %% key=value，返回 { tex, style, name? }。name/caption 支持 Markdown 与数学公式 $...$ */
function parseDisplayOptions(source: string): { tex: string; style: Record<string, string>; name?: string } {
  const style: Record<string, string> = {};
  let name: string | undefined;
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
    } else if (key === "name" || key === "caption") name = val;
  }
  if (i > 0) tex = lines.slice(i).join("\n").trim();
  return { tex, style, name };
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
    fs.mkdirSync(styDir, { recursive: true });
    fs.writeFileSync(cliPath, EMBEDDED_CLI_SOURCE, "utf8");
    fs.writeFileSync(styPath, EMBEDDED_QUIVER_STY, "utf8");
    return base;
  } catch {
    const fallback = fs.mkdtempSync(path.join(os.tmpdir(), "ye-quiver-"));
    fs.mkdirSync(path.join(fallback, "package"), { recursive: true });
    fs.writeFileSync(path.join(fallback, "index.mjs"), EMBEDDED_CLI_SOURCE, "utf8");
    fs.writeFileSync(path.join(fallback, "package", "quiver.sty"), EMBEDDED_QUIVER_STY, "utf8");
    return fallback;
  }
}

function cacheKey(tex: string, dark: boolean, dpi: number): string {
  return String(dpi) + "\n" + (dark ? "1" : "0") + "\n" + tex;
}

function getCached(tex: string, dark: boolean, dpi: number): string | null {
  const key = cacheKey(tex, dark, dpi);
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

function setCached(tex: string, dark: boolean, dpi: number, base64: string, maxSize: number): void {
  const key = cacheKey(tex, dark, dpi);
  if (renderCache.has(key)) {
    const idx = renderCacheKeys.indexOf(key);
    if (idx >= 0) renderCacheKeys.splice(idx, 1);
  }
  renderCacheKeys.push(key);
  renderCache.set(key, base64);
  while (renderCache.size > maxSize && renderCacheKeys.length > 0) {
    const evict = renderCacheKeys.shift()!;
    renderCache.delete(evict);
  }
}

function getMemoryCacheCount(): number {
  return renderCache.size;
}

function clearMemoryCache(): void {
  renderCache.clear();
  renderCacheKeys.length = 0;
}

/** 磁盘缓存：根据 (tex, dark, dpi) 生成唯一文件名（不含扩展名）。 */
function diskCacheFileKey(tex: string, dark: boolean, dpi: number): string {
  try {
    const crypto = require("crypto");
    const h = crypto.createHash("sha256").update(tex, "utf8").digest("hex").slice(0, 22);
    const theme = dark ? "d" : "l";
    return `${h}_${theme}_${dpi}`;
  } catch {
    const theme = dark ? "d" : "l";
    const fallback = String(Math.abs((tex + tex.length).split("").reduce((a, c) => (a + c.charCodeAt(0)) | 0, 0)));
    return `${theme}_${fallback}_${dpi}`;
  }
}

type ManifestData = Record<string, number>;

function loadDiskManifest(cacheDir: string): ManifestData {
  const fs = require("fs");
  const path = require("path");
  const p = path.join(cacheDir, MANIFEST_FILENAME);
  if (!fs.existsSync(p)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    return typeof data === "object" && data !== null ? data : {};
  } catch {
    return {};
  }
}

function saveDiskManifest(cacheDir: string, manifest: ManifestData): void {
  const fs = require("fs");
  const path = require("path");
  const p = path.join(cacheDir, MANIFEST_FILENAME);
  fs.writeFileSync(p, JSON.stringify(manifest), "utf8");
}

function getDiskCached(tex: string, dark: boolean, dpi: number, cacheDir: string): string | null {
  if (!cacheDir) return null;
  const fs = require("fs");
  const path = require("path");
  const key = diskCacheFileKey(tex, dark, dpi);
  const filePath = path.join(cacheDir, key + ".png");
  if (!fs.existsSync(filePath)) return null;
  try {
    const buf = fs.readFileSync(filePath);
    return buf.toString("base64");
  } catch {
    return null;
  }
}

function setDiskCache(tex: string, dark: boolean, dpi: number, base64: string, cacheDir: string, maxSize: number): void {
  if (!cacheDir || maxSize < 1) return;
  const fs = require("fs");
  const path = require("path");
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  const key = diskCacheFileKey(tex, dark, dpi);
  const filePath = path.join(cacheDir, key + ".png");
  const buf = Buffer.from(base64, "base64");
  fs.writeFileSync(filePath, buf);
  const manifest = loadDiskManifest(cacheDir);
  const now = Date.now();
  manifest[key] = now;
  const entries = Object.entries(manifest).sort((a, b) => a[1] - b[1]);
  while (entries.length > maxSize) {
    const [evictKey] = entries.shift()!;
    const evictPath = path.join(cacheDir, evictKey + ".png");
    try {
      if (fs.existsSync(evictPath)) fs.unlinkSync(evictPath);
    } catch (_) {}
    delete manifest[evictKey];
  }
  saveDiskManifest(cacheDir, manifest);
}

function getDiskCacheCount(cacheDir: string): number {
  if (!cacheDir) return 0;
  const manifest = loadDiskManifest(cacheDir);
  return Object.keys(manifest).length;
}

function clearDiskCache(cacheDir: string): number {
  if (!cacheDir) return 0;
  const fs = require("fs");
  const path = require("path");
  let n = 0;
  try {
    if (!fs.existsSync(cacheDir)) return 0;
    const names = fs.readdirSync(cacheDir);
    for (const name of names) {
      if (name.endsWith(".png")) {
        try {
          fs.unlinkSync(path.join(cacheDir, name));
          n++;
        } catch (_) {}
      }
    }
    if (fs.existsSync(path.join(cacheDir, MANIFEST_FILENAME))) {
      fs.unlinkSync(path.join(cacheDir, MANIFEST_FILENAME));
    }
  } catch (_) {}
  return n;
}

function clampDpi(n: number): number {
  return Math.min(DPI_MAX, Math.max(DPI_MIN, Math.round(n)));
}

async function tikzToPngBase64(tex: string, dark: boolean, settings: YeQuiverSettings, effectiveCacheDir: string): Promise<string> {
  const dpi = clampDpi(settings.dpi);
  const mem = getCached(tex, dark, dpi);
  if (mem != null) return mem;
  const disk = getDiskCached(tex, dark, dpi, effectiveCacheDir);
  if (disk != null) {
    setCached(tex, dark, dpi, disk, settings.maxMemoryCacheSize);
    return disk;
  }

  const path = require("path");
  const fs = require("fs");
  const { spawn } = require("child_process");

  const base = getAssetDir();
  const cliPath = path.join(base, "index.mjs");
  const styDir = path.join(base, "package");

  const args = [cliPath, "--sty-dir", styDir, "--base64", "--dpi", String(dpi)];
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
          ? `Node.js not found (tried: ${nodeCmd}). Install Node.js and ensure it is on PATH or in a common location (e.g. /opt/homebrew/bin, /usr/local/bin).`
          : "Failed to start node: " + (err.message || String(err));
      reject(new Error(msg));
    });
    proc.on("close", (code: number | null, signal: string | null) => {
      if (code === 0 && signal == null) {
        resolve(stdout.toString("utf8").trim());
        return;
      }
      const msg = signal
        ? `Process terminated (signal: ${signal})`
        : code != null
          ? `Exit code ${code}`
          : "Unknown exit code";
      reject(new Error(stderr.trim() || msg));
    });
    proc.stdin?.end(tex, "utf8");
  });

  setCached(tex, dark, dpi, result, settings.maxMemoryCacheSize);
  setDiskCache(tex, dark, dpi, result, effectiveCacheDir, settings.maxCacheSize);
  return result;
}

class YeQuiverSettingTab extends PluginSettingTab {
  plugin: YeQuiverPlugin;

  constructor(app: App, plugin: YeQuiverPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;

    const effectiveDir = this.plugin.getEffectiveCacheDir();
    new Setting(containerEl)
      .setName("Cache directory")
      .setDesc(
        effectiveDir
          ? `Directory for rendered PNGs. Leave empty to use default. Current: ${effectiveDir}`
          : "Directory for rendered PNGs. Leave empty to use default. Current: (unavailable — disk cache disabled)"
      )
      .addText((text) =>
        text
          .setPlaceholder(effectiveDir || "vault/.obsidian/plugins/ye-quiver/cache")
          .setValue(s.cacheDir || "")
          .onChange((v) => {
            s.cacheDir = v.trim();
            this.plugin.saveData(s);
          })
      );

    new Setting(containerEl)
      .setName("Max disk cache size")
      .setDesc("Maximum number of images to keep on disk; oldest are removed when exceeded. Default 1000.")
      .addText((text) =>
        text
          .setPlaceholder("1000")
          .setValue(String(s.maxCacheSize))
          .onChange((v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n >= 0) {
              s.maxCacheSize = Math.min(10000, Math.max(0, n));
              this.plugin.saveData(s);
            }
          })
      );

    new Setting(containerEl)
      .setName("Max memory cache size")
      .setDesc("Maximum number of images to keep in memory; oldest are evicted when exceeded. Default 30.")
      .addText((text) =>
        text
          .setPlaceholder("30")
          .setValue(String(s.maxMemoryCacheSize))
          .onChange((v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n >= 0) {
              s.maxMemoryCacheSize = Math.min(500, Math.max(0, n));
              this.plugin.saveData(s);
            }
          })
      );

    new Setting(containerEl)
      .setName("Pre-generate other theme")
      .setDesc("After rendering for current theme, also render for the other theme in background for faster light/dark switching.")
      .addToggle((t) =>
        t.setValue(s.preGenerateOtherTheme).onChange((v) => {
          s.preGenerateOtherTheme = v;
          this.plugin.saveData(s);
        })
      );

    new Setting(containerEl)
      .setName("Image DPI (resolution)")
      .setDesc(`Clarity of generated PNGs. Higher = sharper and larger file. Range ${DPI_MIN}–${DPI_MAX}, default ${DPI_DEFAULT}.`)
      .addText((text) =>
        text
          .setPlaceholder(String(DPI_DEFAULT))
          .setValue(String(s.dpi))
          .onChange((v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n)) {
              s.dpi = clampDpi(n);
              this.plugin.saveData(s);
            }
          })
      );

    const countSetting = new Setting(containerEl)
      .setName("Current cache")
      .setDesc("");
    const countDesc = countSetting.descEl;
    const updateCount = () => {
      const diskN = getDiskCacheCount(this.plugin.getEffectiveCacheDir());
      const memN = getMemoryCacheCount();
      countDesc.setText(`${diskN} on disk, ${memN} in memory`);
    };
    updateCount();

    new Setting(containerEl)
      .setName("Clear cache")
      .setDesc("Clear in-memory cache and delete all cached images from the cache directory.")
      .addButton((btn) =>
        btn.setButtonText("Clear").onClick(() => {
          clearMemoryCache();
          const diskRemoved = clearDiskCache(this.plugin.getEffectiveCacheDir());
          updateCount();
          new Notice(`Cache cleared (${diskRemoved} removed from disk).`);
        })
      );
  }
}

export default class YeQuiverPlugin extends Plugin {
  settings: YeQuiverSettings;

  constructor(app: App, manifest: PluginManifest) {
    super(app, manifest);
    this.settings = { ...DEFAULT_SETTINGS };
  }

  /** 实际使用的 cache 目录：若设置了则用设置值，否则为 Obsidian 库内插件目录下的 cache；若取不到则回退到 getPluginDir（如开发环境）。 */
  getEffectiveCacheDir(): string {
    if (this.settings.cacheDir.trim()) return this.settings.cacheDir;
    const path = require("path");
    let dir = getObsidianPluginRoot(this.app, this.manifest);
    if (!dir) dir = getPluginDir(this.app, this.manifest);
    return dir ? path.join(dir, "cache") : "";
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    if (data) this.settings = { ...DEFAULT_SETTINGS, ...data };
    // 迁移：旧默认是系统临时目录下的 ye-quiver-cache，改为空表示使用新默认（插件目录/cache）
    try {
      const path = require("path");
      const os = require("os");
      const oldDefault = path.join(os.tmpdir(), "ye-quiver-cache");
      if (this.settings.cacheDir === oldDefault) this.settings.cacheDir = "";
    } catch (_) {}
    if (this.settings.dpi == null || isNaN(this.settings.dpi)) this.settings.dpi = DPI_DEFAULT;
    this.settings.dpi = clampDpi(this.settings.dpi);
    await this.saveData(this.settings);
  }

  openPluginSettings(): void {
    const app = this.app as any;
    if (typeof app?.setting?.open === "function") {
      app.setting.open();
      if (typeof app?.setting?.activateTab === "function") {
        try {
          app.setting.activateTab(this.manifest.id);
        } catch (_) {}
      }
    }
    new Notice("If not opened: Settings → Community plugins → click ye-quiver");
  }

  async onload() {
    try {
      await this.loadSettings();
    } catch (e) {
      console.warn("ye-quiver: loadSettings failed", e);
      this.settings = { ...DEFAULT_SETTINGS };
    }

    try {
      this.doOnload();
    } catch (e: any) {
      console.error("ye-quiver: onload failed", e);
      new Notice("ye-quiver failed to load: " + (e?.message || String(e)));
      throw e;
    }
  }

  private doOnload(): void {
    this.addSettingTab(new YeQuiverSettingTab(this.app, this));

    this.addRibbonIcon("settings", "ye-quiver settings", () => this.openPluginSettings());

    const statusBar = this.addStatusBarItem();
    statusBar.setText("ye-quiver");
    statusBar.setAttribute("aria-label", "Open ye-quiver settings");
    statusBar.style.cursor = "pointer";
    statusBar.addEventListener("click", () => this.openPluginSettings());

    this.addCommand({
      id: "open-settings",
      name: "Open ye-quiver settings",
      callback: () => this.openPluginSettings(),
    });

    this.addCommand({
      id: "clear-cache",
      name: "Clear ye-quiver cache",
      callback: () => {
        clearMemoryCache();
        const n = clearDiskCache(this.getEffectiveCacheDir());
        new Notice(`Cache cleared (${n} removed from disk).`);
      },
    });

    let pluginDir: string | null = null;
    try {
      pluginDir = getPluginDir(this.app, this.manifest);
    } catch (_) {
      console.warn("ye-quiver: getPluginDir failed");
    }
    if (!pluginDir) {
      console.warn("ye-quiver: could not resolve plugin directory");
    }
    if (!NODE_MODULES_AVAILABLE) {
      console.warn("ye-quiver: child_process not available (e.g. mobile). TikZ blocks will show a message.");
    }

    try {
      const path = require("path");
      const fs = require("fs");
      const stylesPath = path.join(pluginDir || "", "styles.css");
      if (pluginDir && fs.existsSync(stylesPath) && typeof (this as any).addStyleSheet === "function") {
        (this as any).addStyleSheet(stylesPath);
      }
    } catch (_) {}

    const plugin = this;
    const renderOne = async (container: HTMLElement, source: string): Promise<void> => {
      while (container.firstChild) container.removeChild(container.firstChild);
      const { tex, style: displayStyle, name: captionText } = parseDisplayOptions(source);
      const dark = isDarkMode();
      const loading = container.createDiv({ cls: "ye-quiver-loading", text: "Rendering TikZ…" });
      try {
        const base64 = await tikzToPngBase64(tex, dark, plugin.settings, plugin.getEffectiveCacheDir());
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
        if (captionText && captionText.trim()) {
          const captionEl = container.createDiv({ cls: "ye-quiver-caption" });
          const sourcePath = container.getAttribute("data-ye-quiver-source-path") || "";
          try {
            await MarkdownRenderer.render(plugin.app, captionText.trim(), captionEl, sourcePath, plugin);
          } catch (_) {
            captionEl.setText(captionText.trim());
          }
        }
        if (plugin.settings.preGenerateOtherTheme) {
          void tikzToPngBase64(tex, !dark, plugin.settings, plugin.getEffectiveCacheDir()).catch(() => {});
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
      console.warn("ye-quiver: editor syntax highlighting not available (CodeMirror view/state)");
    }

    this.registerMarkdownCodeBlockProcessor("ye-quiver", async (source, el, ctx) => {
      const container = el.createDiv({ cls: "ye-quiver-container" });
      container.setAttribute("data-ye-quiver-source", encodeSourceForAttr(source.trim()));
      container.setAttribute("data-ye-quiver-source-path", ctx.sourcePath || "");
      if (!NODE_MODULES_AVAILABLE) {
        container.createDiv({
          cls: "ye-quiver-error",
          text: "ye-quiver cannot run system commands in this environment (no child_process). Generate images via CLI: run node cli/index.mjs --output out.png <your.tex> in the repo, then insert the PNG into your note.",
        });
        return;
      }
      await renderOne(container, source.trim());
    });

    this.registerEvent(this.app.workspace.on("css-change", refreshAllTikz));

    this.addCommand({
      id: "refresh-all",
      name: "Refresh all ye-quiver diagrams",
      callback: () => {
        refreshAllTikz();
        new Notice("Refreshed all TikZ diagrams.");
      },
    });

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
            await tikzToPngBase64(tikz, dark, plugin.settings, plugin.getEffectiveCacheDir());
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
