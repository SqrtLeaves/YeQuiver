import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const cliSrc = path.join(root, "cli");
const pkgSrc = path.join(root, "package");
const cliDest = path.join(__dirname, "cli");
const pkgDest = path.join(__dirname, "package");

if (fs.existsSync(cliSrc)) {
  fs.mkdirSync(cliDest, { recursive: true });
  fs.copyFileSync(path.join(cliSrc, "index.mjs"), path.join(cliDest, "index.mjs"));
  console.log("Copied cli/index.mjs");
}
if (fs.existsSync(pkgSrc)) {
  fs.mkdirSync(pkgDest, { recursive: true });
  fs.copyFileSync(path.join(pkgSrc, "quiver.sty"), path.join(pkgDest, "quiver.sty"));
  console.log("Copied package/quiver.sty");
}
