#!/usr/bin/env node
/**
 * Ye Quiver CLI: convert TikZ/tikz-cd code to PNG.
 * Requires: pdflatex (TeX Live/MacTeX), pdftoppm (poppler-utils).
 *
 * Usage:
 *   node cli/index.mjs [options] [input.tex]
 *   echo '\begin{tikzcd} A \arrow[r] & B \end{tikzcd}' | node cli/index.mjs
 *
 * Options:
 *   --sty-dir <path>   Directory containing quiver.sty (default: ../package)
 *   --output <path>    Write PNG here (default: temp file, print path)
 *   --base64           Print PNG as base64 to stdout (for embedding)
 *   --dark             Use light nodes/arrows on dark background (for Obsidian dark mode)
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const DEFAULT_STY_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "package");

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { styDir: null, output: null, base64: false, dark: false };
  let inputFile = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--sty-dir" && args[i + 1]) {
      options.styDir = args[++i];
    } else if (args[i] === "--output" && args[i + 1]) {
      options.output = args[++i];
    } else if (args[i] === "--base64") {
      options.base64 = true;
    } else if (args[i] === "--dark") {
      options.dark = true;
    } else if (!args[i].startsWith("-")) {
      inputFile = args[i];
      break;
    }
  }
  if (!options.styDir) options.styDir = DEFAULT_STY_DIR;
  return { options, inputFile };
}

function readInput(inputFile) {
  if (inputFile) {
    return fs.readFileSync(inputFile, "utf8");
  }
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}

function wrapStandalone(tex, dark = false) {
  const trimmed = tex.trim();
  // Already a full document
  if (trimmed.startsWith("\\documentclass") || trimmed.startsWith("\\document")) {
    return trimmed;
  }
  // Strip optional \[ \] wrapper
  let body = trimmed.replace(/^\\\[\s*/, "").replace(/\s*\\\]\s*$/, "");
  if (!body.includes("\\begin{tikzcd}")) {
    return null; // Not tikz-cd
  }
  const docParts = ["\\documentclass[tikz]{standalone}", "\\usepackage{quiver}", "\\begin{document}"];
  if (dark) {
    docParts.push("\\pagecolor[rgb]{0.17,0.17,0.17}");
    docParts.push("\\color{white}");
    docParts.push("\\tikzset{every path/.append style={draw=white}, every node/.append style={color=white}}");
  }
  docParts.push(body, "\\end{document}");
  return docParts.join("\n");
}

/** 返回可执行文件的完整路径；GUI 调用时 PATH 常不包含 tex/poppler，故尝试常见安装位置。 */
function resolveCommand(name, extraPaths) {
  if (path.isAbsolute(name) && fs.existsSync(name)) return name;
  const candidates = [...(extraPaths || []), name];
  for (const p of candidates) {
    if (path.isAbsolute(p) && fs.existsSync(p)) return p;
  }
  return name;
}

function getPdflatexPath() {
  const candidates = [];
  if (process.platform === "darwin") {
    candidates.push("/Library/TeX/texbin/pdflatex");
    try {
      const tl = "/usr/local/texlive";
      if (fs.existsSync(tl)) {
        const years = fs.readdirSync(tl).filter((d) => /^\d{4}$/.test(d)).sort().reverse();
        for (const y of years) {
          const bin = path.join(tl, y, "bin");
          if (fs.existsSync(bin)) {
            const arch = fs.readdirSync(bin);
            for (const a of arch) {
              const exe = path.join(bin, a, "pdflatex");
              if (fs.existsSync(exe)) candidates.push(exe);
            }
            break;
          }
        }
      }
    } catch (_) {}
  } else if (process.platform === "win32") {
    const pf = process.env["ProgramFiles"] || "C:\\Program Files";
    const local = process.env.LOCALAPPDATA || "";
    candidates.push(path.join(pf, "MiKTeX", "miktex", "bin", "x64", "pdflatex.exe"));
    candidates.push(path.join(pf, "MiKTeX", "miktex", "bin", "pdflatex.exe"));
    if (local) candidates.push(path.join(local, "Programs", "MiKTeX", "miktex", "bin", "x64", "pdflatex.exe"));
  } else {
    candidates.push("/usr/local/texlive/2024/bin/x86_64-linux/pdflatex", "/usr/bin/pdflatex");
  }
  return resolveCommand("pdflatex", candidates);
}

function getPdftoppmPath() {
  const candidates = [];
  if (process.platform === "darwin") {
    candidates.push("/opt/homebrew/bin/pdftoppm", "/usr/local/bin/pdftoppm", "/Library/TeX/texbin/pdftoppm");
  } else if (process.platform === "win32") {
    const pf = process.env["ProgramFiles"] || "C:\\Program Files";
    candidates.push(path.join(pf, "poppler", "bin", "pdftoppm.exe"));
  } else {
    candidates.push("/usr/bin/pdftoppm");
  }
  return resolveCommand("pdftoppm", candidates);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      ...opts,
    });
    let stdout = "";
    let stderr = "";
    p.stdout?.on("data", (d) => (stdout += d));
    p.stderr?.on("data", (d) => (stderr += d));
    p.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr.trim() || `Exit ${code}`));
      else resolve(stdout);
    });
    p.on("error", reject);
  });
}

async function main() {
  const { options, inputFile } = parseArgs();
  const styDir = path.resolve(options.styDir);
  if (!fs.existsSync(path.join(styDir, "quiver.sty"))) {
    console.error("quiver.sty not found in", styDir);
    process.exit(1);
  }

  const raw = await readInput(inputFile);
  const fullTex = wrapStandalone(raw, options.dark);
  if (!fullTex) {
    console.error("Input must be \\begin{tikzcd}...\\end{tikzcd} or a full LaTeX document.");
    process.exit(1);
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ye-quiver-"));
  const texPath = path.join(tmpDir, "diagram.tex");
  const pdfPath = path.join(tmpDir, "diagram.pdf");
  const pngPath = path.join(tmpDir, "diagram.png");

  try {
    fs.writeFileSync(texPath, fullTex, "utf8");

    // TEXINPUTS: prepend sty dir so our quiver.sty (with between/curve) is used, not system's
    const delim = path.delimiter || ":";
    const texinputs = styDir + path.sep + delim + (process.env.TEXINPUTS || "");
    const pdflatex = getPdflatexPath();
    const pdftoppm = getPdftoppmPath();
    await run(pdflatex, ["-interaction=nonstopmode", "-halt-on-error", "-output-directory", tmpDir, "diagram.tex"], {
      cwd: tmpDir,
      env: { ...process.env, TEXINPUTS: texinputs },
    });

    // pdftoppm: -png -singlefile diagram.pdf diagram -> diagram.png
    const ppmBase = path.join(tmpDir, "diagram");
    await run(pdftoppm, ["-png", "-singlefile", "diagram.pdf", ppmBase], { cwd: tmpDir });
    const generatedPng = ppmBase + ".png";
    if (!fs.existsSync(generatedPng)) {
      throw new Error("pdftoppm did not produce diagram.png");
    }

    if (options.output) {
      const outPath = path.resolve(options.output);
      fs.copyFileSync(generatedPng, outPath);
      if (options.base64) {
        process.stdout.write(Buffer.from(fs.readFileSync(outPath)).toString("base64"));
      } else {
        console.log(outPath);
      }
    } else if (options.base64) {
      process.stdout.write(Buffer.from(fs.readFileSync(generatedPng)).toString("base64"));
    } else {
      console.log(generatedPng);
    }
  } finally {
    if (options.output || options.base64) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
