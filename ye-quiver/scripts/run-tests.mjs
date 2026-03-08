#!/usr/bin/env node
/**
 * ye-quiver automated tests.
 *
 * 1) Standalone CLI tests (no Obsidian): always run.
 *    Requires: pdflatex, pdftoppm, node.
 *
 * 2) Obsidian CLI test (optional): run when Obsidian is running with this plugin.
 *    Set OBSIDIAN_VAULT to your test vault path, then:
 *    obsidian ye-quiver:test
 *    (Obsidian must have CLI enabled: Settings → General → Command line interface)
 */

import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const cliPath = path.join(root, "cli", "index.mjs");
const styDir = path.join(root, "package");
const testTikz = "\\begin{tikzcd}\n\tA \\arrow[r] & B\n\\end{tikzcd}";

function run(cmd, args, opts = { stdin: null }) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      ...opts,
    });
    let stdout = "";
    let stderr = "";
    p.stdout?.on("data", (d) => (stdout += d));
    p.stderr?.on("data", (d) => (stderr += d));
    p.on("close", (code) => resolve({ code, stdout, stderr }));
    p.on("error", reject);
    if (opts.stdin != null) p.stdin?.end(opts.stdin, "utf8");
  });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function testCliStandalone() {
  console.log("  CLI: light theme (default)…");
  const r = await run("node", [cliPath, "--sty-dir", styDir, "--base64"], { stdin: testTikz });
  assert(r.code === 0, `CLI exit ${r.code}: ${r.stderr}`);
  assert(r.stdout.length > 100, "Expected base64 PNG output");
  console.log("  CLI: light theme OK");

  console.log("  CLI: dark theme (--dark)…");
  const r2 = await run("node", [cliPath, "--sty-dir", styDir, "--dark", "--base64"], { stdin: testTikz });
  assert(r2.code === 0, `CLI --dark exit ${r2.code}: ${r2.stderr}`);
  assert(r2.stdout.length > 100, "Expected base64 PNG output");
  console.log("  CLI: dark theme OK");

  console.log("  CLI: file input + --output…");
  const tmpDir = path.join(process.env.TMPDIR || "/tmp", "ye-quiver-test-" + Date.now());
  fs.mkdirSync(tmpDir, { recursive: true });
  const texPath = path.join(tmpDir, "diagram.tex");
  fs.writeFileSync(texPath, testTikz, "utf8");
  const outPath = path.join(tmpDir, "out.png");
  const r3 = await run("node", [cliPath, "--sty-dir", styDir, "--output", outPath, texPath]);
  try {
    assert(r3.code === 0, `CLI file exit ${r3.code}: ${r3.stderr}`);
    assert(fs.existsSync(outPath), "Output PNG not created");
    console.log("  CLI: file input OK");
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}
  }
}

async function testObsidianCli() {
  const vault = process.env.OBSIDIAN_VAULT;
  if (!vault || !fs.existsSync(vault)) {
    console.log("  Obsidian CLI: skip (set OBSIDIAN_VAULT to run)");
    return;
  }
  const obsidian = process.platform === "win32" ? "obsidian.cmd" : "obsidian";
  console.log("  Obsidian CLI: ye-quiver:test (vault: " + vault + ")…");
  const r = await run(obsidian, ["ye-quiver:test"], {
    env: { ...process.env },
    cwd: vault,
  });
  if (r.code !== 0) {
    console.log("  Obsidian CLI: skip (obsidian not in PATH or not running? " + r.stderr?.slice(0, 80) + ")");
    return;
  }
  const out = (r.stdout || "").trim();
  if (out === "OK") {
    console.log("  Obsidian CLI: OK");
    return;
  }
  throw new Error("Obsidian CLI returned: " + out);
}

async function main() {
  console.log("ye-quiver tests\n");

  if (!fs.existsSync(cliPath) || !fs.existsSync(path.join(styDir, "quiver.sty"))) {
    console.error("Run from repo root or ye-quiver; cli and package must exist.");
    process.exit(1);
  }

  try {
    console.log("1) Standalone CLI");
    await testCliStandalone();
    console.log("\n2) Obsidian CLI (optional)");
    await testObsidianCli();
    console.log("\nAll tests passed.");
  } catch (err) {
    console.error("\nTest failed:", err.message);
    process.exit(1);
  }
}

main();
