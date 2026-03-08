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

async function tikzToPngBase64(tex: string, dark: boolean): Promise<string> {
  const path = require("path");
  const fs = require("fs");
  const os = require("os");
  const { spawn } = require("child_process");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ye-quiver-"));
  const cliPath = path.join(tmpDir, "index.mjs");
  const styDir = path.join(tmpDir, "package");
  const styPath = path.join(styDir, "quiver.sty");
  try {
    fs.mkdirSync(styDir, { recursive: true });
    fs.writeFileSync(cliPath, EMBEDDED_CLI_SOURCE, "utf8");
    fs.writeFileSync(styPath, EMBEDDED_QUIVER_STY, "utf8");

    const args = [cliPath, "--sty-dir", styDir, "--base64"];
    if (dark) args.push("--dark");
    const nodeCmd = getNodePath();
    return await new Promise((resolve, reject) => {
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
          // CLI 已输出 base64 文本，直接取 UTF-8 字符串，勿再 .toString("base64") 否则会二次编码
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
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }
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

    this.registerMarkdownCodeBlockProcessor("tikz", async (source, el, ctx) => {
      const dark = isDarkMode();
      const container = el.createDiv({ cls: "ye-quiver-container" });
      container.setAttribute("data-ye-quiver-theme", dark ? "dark" : "light");
      if (!NODE_MODULES_AVAILABLE) {
        container.createDiv({
          cls: "ye-quiver-error",
          text: "Ye Quiver 无法在当前 Obsidian 环境中执行系统命令（无 child_process）。请用命令行生成图片后插入：在仓库目录运行 node cli/index.mjs --output 图.png <你的.tex>，再将生成的 PNG 插入笔记。",
        });
        return;
      }
      const loading = container.createDiv({ cls: "ye-quiver-loading", text: "Rendering TikZ…" });
      try {
        const base64 = await tikzToPngBase64(source.trim(), dark);
        loading.remove();
        const img = container.createEl("img", {
          attr: {
            src: `data:image/png;base64,${base64}`,
            alt: "TikZ diagram",
            class: "ye-quiver-img",
          },
        });
      } catch (err: any) {
        loading.remove();
        const msg = err?.message || String(err);
        container.createDiv({ cls: "ye-quiver-error", text: `TikZ error: ${msg}` });
      }
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
            description: "Use dark theme output",
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
