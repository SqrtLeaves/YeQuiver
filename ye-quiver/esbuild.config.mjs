import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prod = process.argv.includes("production");

const copyAssets = () => {
  const pluginDir = path.join(__dirname, "..");
  const cliSrc = path.join(pluginDir, "cli");
  const pkgSrc = path.join(pluginDir, "package");
  const dest = __dirname;
  const cliDest = path.join(dest, "cli");
  const pkgDest = path.join(dest, "package");
  if (fs.existsSync(cliSrc)) {
    fs.mkdirSync(path.join(dest, "cli"), { recursive: true });
    fs.copyFileSync(path.join(cliSrc, "index.mjs"), path.join(cliDest, "index.mjs"));
  }
  if (fs.existsSync(pkgSrc)) {
    fs.mkdirSync(pkgDest, { recursive: true });
    fs.copyFileSync(path.join(pkgSrc, "quiver.sty"), path.join(pkgDest, "quiver.sty"));
  }
};

const generateEmbeddedAssets = () => {
  const root = path.join(__dirname, "..");
  const cliPath = path.join(root, "cli", "index.mjs");
  const styPath = path.join(root, "package", "quiver.sty");
  if (!fs.existsSync(cliPath) || !fs.existsSync(styPath)) {
    throw new Error("cli/index.mjs or package/quiver.sty not found for embedding");
  }
  const cliSource = fs.readFileSync(cliPath, "utf8");
  const quiverSty = fs.readFileSync(styPath, "utf8");
  const outPath = path.join(__dirname, "embedded-assets.generated.ts");
  fs.writeFileSync(
    outPath,
    "// auto-generated - do not edit\n" +
      "export const EMBEDDED_CLI_SOURCE: string = " +
      JSON.stringify(cliSource) +
      ";\n" +
      "export const EMBEDDED_QUIVER_STY: string = " +
      JSON.stringify(quiverSty) +
      ";\n",
    "utf8"
  );
};

async function build() {
  copyAssets();
  generateEmbeddedAssets();
  await esbuild.build({
    entryPoints: [path.join(__dirname, "main.ts")],
    bundle: true,
    external: ["obsidian", "path", "fs", "child_process", "process", "os"],
    format: "cjs",
    target: "es2020",
    logLevel: "info",
    sourcemap: !prod,
    outfile: path.join(__dirname, "main.js"),
    alias: {},
  });
}

build().catch(() => process.exit(1));
