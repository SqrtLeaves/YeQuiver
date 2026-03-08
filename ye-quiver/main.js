"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => YeQuiverPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// embedded-assets.generated.ts
var EMBEDDED_CLI_SOURCE = '#!/usr/bin/env node\n/**\n * Ye Quiver CLI: convert TikZ/tikz-cd code to PNG.\n * Requires: pdflatex (TeX Live/MacTeX), pdftoppm (poppler-utils).\n *\n * Usage:\n *   node cli/index.mjs [options] [input.tex]\n *   echo \'\\begin{tikzcd} A \\arrow[r] & B \\end{tikzcd}\' | node cli/index.mjs\n *\n * Options:\n *   --sty-dir <path>   Directory containing quiver.sty (default: ../package)\n *   --output <path>    Write PNG here (default: temp file, print path)\n *   --base64           Print PNG as base64 to stdout (for embedding)\n *   --dark             Use light nodes/arrows on dark background (for Obsidian dark mode)\n *   --bg-rgb <r,g,b>    Page background as 0-1 RGB (e.g. "0.1,0.1,0.1")\n *   --dpi <n>           PNG resolution (default: 300, higher = sharper, larger file)\n */\n\nimport { spawn } from "child_process";\nimport fs from "fs";\nimport path from "path";\nimport os from "os";\n\nconst DEFAULT_STY_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "package");\nconst DEFAULT_DPI = 300;\n\nfunction parseArgs() {\n  const args = process.argv.slice(2);\n  const options = { styDir: null, output: null, base64: false, dark: false, bgRgb: null, dpi: DEFAULT_DPI };\n  let inputFile = null;\n  for (let i = 0; i < args.length; i++) {\n    if (args[i] === "--sty-dir" && args[i + 1]) {\n      options.styDir = args[++i];\n    } else if (args[i] === "--output" && args[i + 1]) {\n      options.output = args[++i];\n    } else if (args[i] === "--base64") {\n      options.base64 = true;\n    } else if (args[i] === "--dark") {\n      options.dark = true;\n    } else if (args[i] === "--bg-rgb" && args[i + 1]) {\n      options.bgRgb = args[++i];\n    } else if (args[i] === "--dpi" && args[i + 1]) {\n      const n = parseInt(args[++i], 10);\n      if (!isNaN(n) && n > 0) options.dpi = Math.min(600, Math.max(72, n));\n    } else if (!args[i].startsWith("-")) {\n      inputFile = args[i];\n      break;\n    }\n  }\n  if (!options.styDir) options.styDir = DEFAULT_STY_DIR;\n  return { options, inputFile };\n}\n\nfunction readInput(inputFile) {\n  if (inputFile) {\n    return fs.readFileSync(inputFile, "utf8");\n  }\n  return new Promise((resolve, reject) => {\n    let data = "";\n    process.stdin.setEncoding("utf8");\n    process.stdin.on("data", (chunk) => (data += chunk));\n    process.stdin.on("end", () => resolve(data));\n    process.stdin.on("error", reject);\n  });\n}\n\nfunction wrapStandalone(tex, _dark = false, _bgRgb = null) {\n  const trimmed = tex.trim();\n  // Already a full document\n  if (trimmed.startsWith("\\\\documentclass") || trimmed.startsWith("\\\\document")) {\n    return trimmed;\n  }\n  // Strip optional \\[ \\] wrapper\n  let body = trimmed.replace(/^\\\\\\[\\s*/, "").replace(/\\s*\\\\\\]\\s*$/, "");\n  if (!body.includes("\\\\begin{tikzcd}")) {\n    return null; // Not tikz-cd\n  }\n  // \u900F\u660E\u80CC\u666F\uFF1Adark \u7528\u9ED1\u5E95+\u767D\u5B57\u518D\u300C\u9ED1\u2192\u900F\u660E\u300D\uFF0Clight \u7528\u767D\u5E95+\u9ED1\u5B57\u518D\u300C\u767D\u2192\u900F\u660E\u300D\n  // dark \u65F6\u7528 \\color{white} \u5305\u88F9\u6574\u56FE\uFF0C\u4FDD\u8BC1\u7BAD\u5934\u4E0E\u8282\u70B9\u90FD\u4E3A\u767D\u8272\n  const docParts = [\n    _dark ? "\\\\documentclass[tikz,border=0pt]{standalone}" : "\\\\documentclass[tikz]{standalone}",\n    "\\\\usepackage{quiver}",\n    ...(_dark ? ["\\\\usepackage{xcolor}"] : []),\n    "\\\\begin{document}",\n    ...(_dark ? ["\\\\pagecolor{black}", "{\\\\color{white}", body, "}"] : [body]),\n    "\\\\end{document}",\n  ];\n  return docParts.join("\\n");\n}\n\n/** \u8FD4\u56DE\u53EF\u6267\u884C\u6587\u4EF6\u7684\u5B8C\u6574\u8DEF\u5F84\uFF1BGUI \u8C03\u7528\u65F6 PATH \u5E38\u4E0D\u5305\u542B tex/poppler\uFF0C\u6545\u5C1D\u8BD5\u5E38\u89C1\u5B89\u88C5\u4F4D\u7F6E\u3002 */\nfunction resolveCommand(name, extraPaths) {\n  if (path.isAbsolute(name) && fs.existsSync(name)) return name;\n  const candidates = [...(extraPaths || []), name];\n  for (const p of candidates) {\n    if (path.isAbsolute(p) && fs.existsSync(p)) return p;\n  }\n  return name;\n}\n\nfunction getPdflatexPath() {\n  const candidates = [];\n  if (process.platform === "darwin") {\n    candidates.push("/Library/TeX/texbin/pdflatex");\n    try {\n      const tl = "/usr/local/texlive";\n      if (fs.existsSync(tl)) {\n        const years = fs.readdirSync(tl).filter((d) => /^\\d{4}$/.test(d)).sort().reverse();\n        for (const y of years) {\n          const bin = path.join(tl, y, "bin");\n          if (fs.existsSync(bin)) {\n            const arch = fs.readdirSync(bin);\n            for (const a of arch) {\n              const exe = path.join(bin, a, "pdflatex");\n              if (fs.existsSync(exe)) candidates.push(exe);\n            }\n            break;\n          }\n        }\n      }\n    } catch (_) {}\n  } else if (process.platform === "win32") {\n    const pf = process.env["ProgramFiles"] || "C:\\\\Program Files";\n    const local = process.env.LOCALAPPDATA || "";\n    candidates.push(path.join(pf, "MiKTeX", "miktex", "bin", "x64", "pdflatex.exe"));\n    candidates.push(path.join(pf, "MiKTeX", "miktex", "bin", "pdflatex.exe"));\n    if (local) candidates.push(path.join(local, "Programs", "MiKTeX", "miktex", "bin", "x64", "pdflatex.exe"));\n  } else {\n    candidates.push("/usr/local/texlive/2024/bin/x86_64-linux/pdflatex", "/usr/bin/pdflatex");\n  }\n  return resolveCommand("pdflatex", candidates);\n}\n\nfunction getPdftoppmPath() {\n  const candidates = [];\n  if (process.platform === "darwin") {\n    candidates.push("/opt/homebrew/bin/pdftoppm", "/usr/local/bin/pdftoppm", "/Library/TeX/texbin/pdftoppm");\n  } else if (process.platform === "win32") {\n    const pf = process.env["ProgramFiles"] || "C:\\\\Program Files";\n    candidates.push(path.join(pf, "poppler", "bin", "pdftoppm.exe"));\n  } else {\n    candidates.push("/usr/bin/pdftoppm");\n  }\n  return resolveCommand("pdftoppm", candidates);\n}\n\n/** ImageMagick convert\uFF1A\u7528\u4E8E\u5C06 PDF \u8F6C\u4E3A\u900F\u660E\u80CC\u666F PNG\uFF08\u767D\u2192\u900F\u660E\uFF09\u3002\u4EC5\u5F53\u5728\u5E38\u89C1\u8DEF\u5F84\u627E\u5230\u65F6\u8FD4\u56DE\uFF0C\u5426\u5219 null\u3002 */\nfunction getConvertPath() {\n  const candidates = [];\n  if (process.platform === "darwin") {\n    candidates.push("/opt/homebrew/bin/convert", "/usr/local/bin/convert");\n  } else if (process.platform === "win32") {\n    const pf = process.env["ProgramFiles"] || "C:\\\\Program Files";\n    candidates.push(path.join(pf, "ImageMagick", "convert.exe"));\n  } else {\n    candidates.push("/usr/bin/convert");\n  }\n  for (const p of candidates) {\n    if (fs.existsSync(p)) return p;\n  }\n  return null;\n}\n\nfunction run(cmd, args, opts = {}) {\n  return new Promise((resolve, reject) => {\n    const p = spawn(cmd, args, {\n      stdio: ["pipe", "pipe", "pipe"],\n      ...opts,\n    });\n    let stdout = "";\n    let stderr = "";\n    p.stdout?.on("data", (d) => (stdout += d));\n    p.stderr?.on("data", (d) => (stderr += d));\n    p.on("close", (code) => {\n      if (code !== 0) reject(new Error(stderr.trim() || `Exit ${code}`));\n      else resolve(stdout);\n    });\n    p.on("error", reject);\n  });\n}\n\nasync function main() {\n  const { options, inputFile } = parseArgs();\n  const styDir = path.resolve(options.styDir);\n  if (!fs.existsSync(path.join(styDir, "quiver.sty"))) {\n    console.error("quiver.sty not found in", styDir);\n    process.exit(1);\n  }\n\n  const raw = await readInput(inputFile);\n  const fullTex = wrapStandalone(raw, options.dark, options.bgRgb);\n  if (!fullTex) {\n    console.error("Input must be \\\\begin{tikzcd}...\\\\end{tikzcd} or a full LaTeX document.");\n    process.exit(1);\n  }\n\n  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ye-quiver-"));\n  const texPath = path.join(tmpDir, "diagram.tex");\n  const pdfPath = path.join(tmpDir, "diagram.pdf");\n  const pngPath = path.join(tmpDir, "diagram.png");\n\n  try {\n    fs.writeFileSync(texPath, fullTex, "utf8");\n\n    // TEXINPUTS: prepend sty dir so our quiver.sty (with between/curve) is used, not system\'s\n    const delim = path.delimiter || ":";\n    const texinputs = styDir + path.sep + delim + (process.env.TEXINPUTS || "");\n    const pdflatex = getPdflatexPath();\n    const pdftoppm = getPdftoppmPath();\n    await run(pdflatex, ["-interaction=batchmode", "-halt-on-error", "-output-directory", tmpDir, "diagram.tex"], {\n      cwd: tmpDir,\n      env: { ...process.env, TEXINPUTS: texinputs },\n    });\n\n    const ppmBase = path.join(tmpDir, "diagram");\n    const generatedPng = ppmBase + ".png";\n    const convertPath = getConvertPath();\n    if (convertPath) {\n      const transparentColor = options.dark ? "black" : "white";\n      const convertArgs = [\n        "-density", String(options.dpi),\n        "-background", "none",\n        "-alpha", "on",\n        "-alpha", "set",\n      ];\n      if (options.dark) convertArgs.push("-fuzz", "5%");\n      convertArgs.push("-transparent", transparentColor, "diagram.pdf", "diagram.png");\n      try {\n        await run(convertPath, convertArgs, { cwd: tmpDir });\n        if (options.dark) {\n          await run(convertPath, ["diagram.png", "-gravity", "North", "-chop", "0x1", "diagram.png"], { cwd: tmpDir });\n        }\n      } catch (_) {\n        await run(pdftoppm, ["-png", "-r", String(options.dpi), "-singlefile", "diagram.pdf", ppmBase], { cwd: tmpDir });\n      }\n    } else {\n      await run(pdftoppm, ["-png", "-r", String(options.dpi), "-singlefile", "diagram.pdf", ppmBase], { cwd: tmpDir });\n    }\n    if (!fs.existsSync(generatedPng)) {\n      throw new Error("PDF to PNG failed (need pdftoppm or ImageMagick convert for transparent background)");\n    }\n\n    if (options.output) {\n      const outPath = path.resolve(options.output);\n      fs.copyFileSync(generatedPng, outPath);\n      if (options.base64) {\n        process.stdout.write(Buffer.from(fs.readFileSync(outPath)).toString("base64"));\n      } else {\n        console.log(outPath);\n      }\n    } else if (options.base64) {\n      process.stdout.write(Buffer.from(fs.readFileSync(generatedPng)).toString("base64"));\n    } else {\n      console.log(generatedPng);\n    }\n  } finally {\n    if (options.output || options.base64) {\n      try {\n        fs.rmSync(tmpDir, { recursive: true, force: true });\n      } catch (_) {}\n    }\n  }\n}\n\nmain().catch((err) => {\n  console.error(err.message || err);\n  process.exit(1);\n});\n';
var EMBEDDED_QUIVER_STY = "% *** quiver ***\n% A package for drawing commutative diagrams exported from https://q.uiver.app.\n%\n% This package is currently a wrapper around the `tikz-cd` package, importing necessary TikZ\n% libraries, and defining new TikZ styles for curves of a fixed height and for shortening paths\n% proportionally.\n%\n% Version: 1.6.0\n% Authors:\n% - varkor (https://github.com/varkor)\n% - Andr\xE9C (https://tex.stackexchange.com/users/138900/andr%C3%A9c)\n% - Andrew Stacey (https://tex.stackexchange.com/users/86/andrew-stacey)\n\n\\NeedsTeXFormat{LaTeX2e}\n\\ProvidesPackage{quiver}[2025/09/20 quiver]\n\n% `tikz-cd` is necessary to draw commutative diagrams.\n\\RequirePackage{tikz-cd}\n% `amssymb` is necessary for `\\lrcorner` and `\\ulcorner`.\n\\RequirePackage{amssymb}\n% `calc` is necessary to draw curved arrows.\n\\usetikzlibrary{calc}\n% `pathmorphing` is necessary to draw squiggly arrows.\n\\usetikzlibrary{decorations.pathmorphing}\n% `spath3` is necessary to draw shortened edges.\n\\usetikzlibrary{spath3}\n\n% A TikZ style for curved arrows of a fixed height, due to Andr\xE9C.\n\\tikzset{curve/.style={settings={#1},to path={(\\tikztostart)\n    .. controls ($(\\tikztostart)!\\pv{pos}!(\\tikztotarget)!\\pv{height}!270:(\\tikztotarget)$)\n    and ($(\\tikztostart)!1-\\pv{pos}!(\\tikztotarget)!\\pv{height}!270:(\\tikztotarget)$)\n    .. (\\tikztotarget)\\tikztonodes}},\n    settings/.code={\\tikzset{quiver/.cd,#1}\n        \\def\\pv##1{\\pgfkeysvalueof{/tikz/quiver/##1}}},\n    quiver/.cd,pos/.initial=0.35,height/.initial=0}\n\n% A TikZ style for shortening paths without the poor behaviour of `shorten <' and `shorten >'.\n\\tikzset{between/.style n args={2}{/tikz/execute at end to={\n    \\tikzset{spath/split at keep middle={current}{#1}{#2}}\n}}}\n\n% TikZ arrowhead/tail styles.\n\\tikzset{tail reversed/.code={\\pgfsetarrowsstart{tikzcd to}}}\n\\tikzset{2tail/.code={\\pgfsetarrowsstart{Implies[reversed]}}}\n\\tikzset{2tail reversed/.code={\\pgfsetarrowsstart{Implies}}}\n% TikZ arrow styles.\n\\tikzset{no body/.style={/tikz/dash pattern=on 0 off 1mm}}\n\n\\endinput\n";

// main.ts
var TEST_TIKZ = "\\begin{tikzcd}\n	A \\arrow[r] & B\n\\end{tikzcd}";
var PLUGIN_ID = "ye-quiver";
var MANIFEST_FILENAME = "cache-manifest.json";
function getDefaultCacheDir() {
  try {
    const path = require("path");
    const os = require("os");
    return path.join(os.tmpdir(), "ye-quiver-cache");
  } catch {
    return "";
  }
}
var DEFAULT_SETTINGS = {
  cacheDir: getDefaultCacheDir(),
  maxCacheSize: 1e3,
  preGenerateOtherTheme: true
};
var NODE_MODULES_AVAILABLE = (() => {
  try {
    require("child_process");
    return true;
  } catch {
    return false;
  }
})();
function getPluginDir(app, manifest) {
  const path = require("path");
  const candidates = [];
  try {
    if (typeof __dirname !== "undefined") candidates.push(path.resolve(__dirname));
  } catch (_) {
  }
  try {
    const mdir = manifest.dir;
    if (mdir && path.isAbsolute(mdir)) candidates.push(mdir);
  } catch (_) {
  }
  try {
    const vault = app.vault;
    const adapter = vault.adapter;
    if (adapter?.getBasePath) {
      const base = adapter.getBasePath().replace(/^file:\/\//, "").replace(/\/$/, "");
      const dir = manifest.dir || PLUGIN_ID;
      candidates.push(path.join(base, ".obsidian", "plugins", dir));
    }
  } catch (_) {
  }
  const fs = require("fs");
  for (const dir of candidates) {
    if (dir && fs.existsSync(path.join(dir, "styles.css"))) return dir;
  }
  return null;
}
function isDarkMode() {
  return typeof document !== "undefined" && document.body.classList.contains("theme-dark");
}
function parseDisplayOptions(source) {
  const style = {};
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
function encodeSourceForAttr(source) {
  try {
    return btoa(unescape(encodeURIComponent(source)));
  } catch {
    return "";
  }
}
function decodeSourceFromAttr(encoded) {
  try {
    return decodeURIComponent(escape(atob(encoded)));
  } catch {
    return "";
  }
}
function createYeQuiverHighlightPlugin(ViewPlugin, Decoration, RangeSetBuilder) {
  const blockRe = /^```ye-quiver\r?\n([\s\S]*?)^```$/gm;
  const commandRe = /\\([a-zA-Z@]+)/g;
  const stringRe = /"([^"\\]|\\.)*"/g;
  const commentRe = /%.*$/gm;
  const bracketRe = /[{}[\]]/g;
  class PluginValue {
    constructor(view) {
      this.view = view;
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
        let add2 = function(re, cls) {
          re.lastIndex = 0;
          let r;
          while ((r = re.exec(content)) !== null) {
            marks.push({
              from: contentStart + r.index,
              to: contentStart + r.index + r[0].length,
              class: cls
            });
          }
        };
        var add = add2;
        const contentStart = m.index + (m[0].indexOf("\n") + 1);
        const content = m[1];
        const contentEnd = contentStart + content.length;
        const marks = [];
        add2(commentRe, "yq-comment");
        add2(stringRe, "yq-string");
        add2(commandRe, "yq-command");
        add2(bracketRe, "yq-bracket");
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
    decorations: (v) => v.decorations
  });
}
function getNodePath() {
  const path = require("path");
  const fs = require("fs");
  const candidates = [];
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
  candidates.push("node");
  for (const p of candidates) {
    if (p === "node") return p;
    if (fs.existsSync(p)) return p;
  }
  return "node";
}
var RENDER_CACHE_MAX = 30;
var renderCache = /* @__PURE__ */ new Map();
var renderCacheKeys = [];
function getAssetDir() {
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
function cacheKey(tex, dark) {
  return (dark ? "1" : "0") + "\n" + tex;
}
function getCached(tex, dark) {
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
function setCached(tex, dark, base64) {
  const key = cacheKey(tex, dark);
  if (renderCache.has(key)) {
    const idx = renderCacheKeys.indexOf(key);
    if (idx >= 0) renderCacheKeys.splice(idx, 1);
  }
  renderCacheKeys.push(key);
  renderCache.set(key, base64);
  while (renderCache.size > RENDER_CACHE_MAX && renderCacheKeys.length > 0) {
    const evict = renderCacheKeys.shift();
    renderCache.delete(evict);
  }
}
function diskCacheFileKey(tex, dark) {
  try {
    const crypto = require("crypto");
    const h = crypto.createHash("sha256").update(tex, "utf8").digest("hex").slice(0, 24);
    return dark ? `${h}_d` : `${h}_l`;
  } catch {
    return (dark ? "d_" : "l_") + String(Math.abs((tex + tex.length).split("").reduce((a, c) => a + c.charCodeAt(0) | 0, 0)));
  }
}
function loadDiskManifest(cacheDir) {
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
function saveDiskManifest(cacheDir, manifest) {
  const fs = require("fs");
  const path = require("path");
  const p = path.join(cacheDir, MANIFEST_FILENAME);
  fs.writeFileSync(p, JSON.stringify(manifest), "utf8");
}
function getDiskCached(tex, dark, cacheDir) {
  if (!cacheDir) return null;
  const fs = require("fs");
  const path = require("path");
  const key = diskCacheFileKey(tex, dark);
  const filePath = path.join(cacheDir, key + ".png");
  if (!fs.existsSync(filePath)) return null;
  try {
    const buf = fs.readFileSync(filePath);
    return buf.toString("base64");
  } catch {
    return null;
  }
}
function setDiskCache(tex, dark, base64, cacheDir, maxSize) {
  if (!cacheDir || maxSize < 1) return;
  const fs = require("fs");
  const path = require("path");
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  const key = diskCacheFileKey(tex, dark);
  const filePath = path.join(cacheDir, key + ".png");
  const buf = Buffer.from(base64, "base64");
  fs.writeFileSync(filePath, buf);
  const manifest = loadDiskManifest(cacheDir);
  const now = Date.now();
  manifest[key] = now;
  const entries = Object.entries(manifest).sort((a, b) => a[1] - b[1]);
  while (entries.length > maxSize) {
    const [evictKey] = entries.shift();
    const evictPath = path.join(cacheDir, evictKey + ".png");
    try {
      if (fs.existsSync(evictPath)) fs.unlinkSync(evictPath);
    } catch (_) {
    }
    delete manifest[evictKey];
  }
  saveDiskManifest(cacheDir, manifest);
}
function getDiskCacheCount(cacheDir) {
  if (!cacheDir) return 0;
  const manifest = loadDiskManifest(cacheDir);
  return Object.keys(manifest).length;
}
function clearDiskCache(cacheDir) {
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
        } catch (_) {
        }
      }
    }
    if (fs.existsSync(path.join(cacheDir, MANIFEST_FILENAME))) {
      fs.unlinkSync(path.join(cacheDir, MANIFEST_FILENAME));
    }
  } catch (_) {
  }
  return n;
}
async function tikzToPngBase64(tex, dark, settings) {
  const mem = getCached(tex, dark);
  if (mem != null) return mem;
  const disk = getDiskCached(tex, dark, settings.cacheDir);
  if (disk != null) {
    setCached(tex, dark, disk);
    return disk;
  }
  const path = require("path");
  const fs = require("fs");
  const { spawn } = require("child_process");
  const base = getAssetDir();
  const cliPath = path.join(base, "index.mjs");
  const styDir = path.join(base, "package");
  const args = [cliPath, "--sty-dir", styDir, "--base64"];
  if (dark) args.push("--dark");
  const nodeCmd = getNodePath();
  const result = await new Promise((resolve, reject) => {
    const proc = spawn(nodeCmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env }
    });
    let stdout = Buffer.alloc(0);
    let stderr = "";
    proc.stdout?.on("data", (chunk) => {
      stdout = Buffer.concat([stdout, chunk]);
    });
    proc.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      const msg = err.code === "ENOENT" ? `\u672A\u627E\u5230 Node.js\uFF08\u5DF2\u5C1D\u8BD5: ${nodeCmd}\uFF09\u3002\u8BF7\u5B89\u88C5 Node.js \u5E76\u786E\u4FDD\u5728\u5E38\u89C1\u8DEF\u5F84\uFF08\u5982 /opt/homebrew/bin\u3001/usr/local/bin\uFF09\u6216\u7CFB\u7EDF PATH \u4E2D\u3002` : "\u65E0\u6CD5\u542F\u52A8 node: " + (err.message || String(err));
      reject(new Error(msg));
    });
    proc.on("close", (code, signal) => {
      if (code === 0 && signal == null) {
        resolve(stdout.toString("utf8").trim());
        return;
      }
      const msg = signal ? `\u8FDB\u7A0B\u88AB\u7EC8\u6B62 (signal: ${signal})` : code != null ? `\u9000\u51FA\u7801 ${code}` : "\u9000\u51FA\u7801\u672A\u77E5";
      reject(new Error(stderr.trim() || msg));
    });
    proc.stdin?.end(tex, "utf8");
  });
  setCached(tex, dark, result);
  setDiskCache(tex, dark, result, settings.cacheDir, settings.maxCacheSize);
  return result;
}
var YeQuiverSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    const s = this.plugin.settings;
    new import_obsidian.Setting(containerEl).setName("\u7F13\u5B58\u76EE\u5F55").setDesc("\u6E32\u67D3\u7ED3\u679C PNG \u7684\u5B58\u50A8\u8DEF\u5F84\uFF0C\u7559\u7A7A\u5219\u7981\u7528\u78C1\u76D8\u7F13\u5B58\u3002\u9ED8\u8BA4\uFF1A\u7CFB\u7EDF\u4E34\u65F6\u76EE\u5F55\u4E0B\u7684 ye-quiver-cache\u3002").addText(
      (text) => text.setPlaceholder(getDefaultCacheDir()).setValue(s.cacheDir || "").onChange((v) => {
        s.cacheDir = v.trim();
        this.plugin.saveData(s);
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u6700\u5927\u7F13\u5B58\u6570\u91CF").setDesc("\u6700\u591A\u4FDD\u7559\u7684\u56FE\u7247\u6570\u91CF\uFF08\u5F20\uFF09\uFF0C\u8D85\u51FA\u65F6\u6309\u6700\u4E45\u672A\u4F7F\u7528\u5220\u9664\u3002\u9ED8\u8BA4 1000\u3002").addText(
      (text) => text.setPlaceholder("1000").setValue(String(s.maxCacheSize)).onChange((v) => {
        const n = parseInt(v, 10);
        if (!isNaN(n) && n >= 0) {
          s.maxCacheSize = Math.min(1e4, Math.max(0, n));
          this.plugin.saveData(s);
        }
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u9884\u751F\u6210\u53E6\u4E00\u4E3B\u9898").setDesc("\u6E32\u67D3\u5F53\u524D\u4E3B\u9898\u540E\uFF0C\u5728\u540E\u53F0\u518D\u6E32\u67D3\u53E6\u4E00\u4E3B\u9898\u5E76\u5199\u5165\u7F13\u5B58\uFF0C\u5207\u6362\u6DF1/\u6D45\u8272\u65F6\u66F4\u5FEB\u3002").addToggle(
      (t) => t.setValue(s.preGenerateOtherTheme).onChange((v) => {
        s.preGenerateOtherTheme = v;
        this.plugin.saveData(s);
      })
    );
    const countSetting = new import_obsidian.Setting(containerEl).setName("\u5F53\u524D\u7F13\u5B58").setDesc("");
    const countDesc = countSetting.descEl;
    const updateCount = () => {
      const n = getDiskCacheCount(s.cacheDir);
      countDesc.setText(`${n} \u5F20`);
    };
    updateCount();
    new import_obsidian.Setting(containerEl).setName("\u6E05\u7406\u7F13\u5B58").setDesc("\u5220\u9664\u7F13\u5B58\u76EE\u5F55\u4E0B\u6240\u6709\u5DF2\u7F13\u5B58\u7684\u56FE\u7247\u3002").addButton(
      (btn) => btn.setButtonText("\u6E05\u7406").onClick(() => {
        clearDiskCache(s.cacheDir);
        updateCount();
      })
    );
  }
};
var YeQuiverPlugin = class extends import_obsidian.Plugin {
  constructor(app, manifest) {
    super(app, manifest);
    this.settings = { ...DEFAULT_SETTINGS };
  }
  async loadSettings() {
    const data = await this.loadData();
    if (data) this.settings = { ...DEFAULT_SETTINGS, ...data };
    await this.saveData(this.settings);
  }
  onload() {
    this.loadSettings().then(() => {
      this.onloadWithSettings();
    });
  }
  onloadWithSettings() {
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
    this.addSettingTab(new YeQuiverSettingTab(this.app, this));
    const plugin = this;
    const renderOne = async (container, source) => {
      while (container.firstChild) container.removeChild(container.firstChild);
      const { tex, style: displayStyle } = parseDisplayOptions(source);
      const dark = isDarkMode();
      const loading = container.createDiv({ cls: "ye-quiver-loading", text: "Rendering TikZ\u2026" });
      try {
        const base64 = await tikzToPngBase64(tex, dark, plugin.settings);
        loading.remove();
        const img = container.createEl("img", {
          attr: {
            src: `data:image/png;base64,${base64}`,
            alt: "TikZ diagram",
            class: "ye-quiver-img"
          }
        });
        if (Object.keys(displayStyle).length > 0) {
          Object.assign(img.style, displayStyle);
          if (displayStyle.transform) img.style.transformOrigin = "top left";
        }
        if (plugin.settings.preGenerateOtherTheme) {
          void tikzToPngBase64(tex, !dark, plugin.settings).catch(() => {
          });
        }
      } catch (err) {
        loading.remove();
        container.createDiv({
          cls: "ye-quiver-error",
          text: `TikZ error: ${err?.message || String(err)}`
        });
      }
    };
    const refreshAllTikz = () => {
      const containers = document.querySelectorAll(".ye-quiver-container[data-ye-quiver-source]");
      const tasks = Array.from(containers).map((container) => {
        const encoded = container.getAttribute("data-ye-quiver-source");
        if (!encoded) return null;
        const source = decodeSourceFromAttr(encoded);
        if (!source) return null;
        return renderOne(container, source);
      }).filter((p) => p != null);
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
          text: "Ye Quiver \u65E0\u6CD5\u5728\u5F53\u524D Obsidian \u73AF\u5883\u4E2D\u6267\u884C\u7CFB\u7EDF\u547D\u4EE4\uFF08\u65E0 child_process\uFF09\u3002\u8BF7\u7528\u547D\u4EE4\u884C\u751F\u6210\u56FE\u7247\u540E\u63D2\u5165\uFF1A\u5728\u4ED3\u5E93\u76EE\u5F55\u8FD0\u884C node cli/index.mjs --output \u56FE.png <\u4F60\u7684.tex>\uFF0C\u518D\u5C06\u751F\u6210\u7684 PNG \u63D2\u5165\u7B14\u8BB0\u3002"
        });
        return;
      }
      await renderOne(container, source.trim());
    });
    this.registerEvent(this.app.workspace.on("css-change", refreshAllTikz));
    if (typeof this.registerCliHandler === "function") {
      this.registerCliHandler(
        "ye-quiver:test",
        "Run ye-quiver TikZ render test (for automation). Renders sample tikz-cd and returns OK or FAIL.",
        {
          tikz: {
            value: "<code>",
            description: "TikZ/tikz-cd source (default: minimal A\u2192B diagram)",
            required: false
          },
          dark: {
            description: "Use light arrows/nodes (for dark theme)",
            required: false
          }
        },
        async (params) => {
          if (!NODE_MODULES_AVAILABLE) return "FAIL: Node (child_process) not available";
          const tikz = params.tikz && params.tikz.trim() ? params.tikz.trim() : TEST_TIKZ;
          const dark = params.dark === "true" || params.dark === "1";
          try {
            await tikzToPngBase64(tikz, dark, plugin.settings);
            return "OK";
          } catch (err) {
            return "FAIL: " + (err?.message || String(err));
          }
        }
      );
    }
  }
  onunload() {
  }
};
