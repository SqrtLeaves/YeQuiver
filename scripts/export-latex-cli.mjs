#!/usr/bin/env node
/**
 * Export LaTeX CLI: same label formatting as src/quiver.mjs (Export → LaTeX).
 * Reads tikz-cd from file (or stdin), rewrites arrow labels and prints result.
 * Use to verify no extra braces (e.g. f^{X} stays f^{X}, not {f^{X}}).
 *
 *   node scripts/export-latex-cli.mjs path/to/diagram.tex
 *   node scripts/export-latex-cli.mjs scripts/test-full-diagram.tex
 */

import { readFileSync } from "fs";

const needs_braces = (s) => /[[\]"]/.test(s);

const has_outer_braces = (s) => {
  if (s.length < 2 || s[0] !== "{" || s[s.length - 1] !== "}") return false;
  let depth = 0;
  for (let i = 1; i < s.length - 1; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") { depth--; if (depth < 0) return false; }
  }
  return depth === 0;
};

const format_label = (label) => {
  if (label.includes("\\\\")) {
    return `\\begin{array}{c} ${label} \\end{array}`;
  }
  if (has_outer_braces(label)) return label;
  if (needs_braces(label)) {
    return `{${label}}`;
  }
  return label;
};

function strip_outer_braces(label) {
  if (label.length >= 2 && label[0] === "{" && label[label.length - 1] === "}") {
    let depth = 0;
    let balanced = true;
    for (let i = 1; i < label.length - 1; i++) {
      if (label[i] === "{") depth++;
      else if (label[i] === "}") { depth--; if (depth < 0) { balanced = false; break; } }
    }
    if (balanced && depth === 0) return label.slice(1, -1);
  }
  return label;
}

// Match \arrow["<label>", ...] or \arrow["<label>"] - label is everything between first " and second "
const ARROW_LABEL_RE = /\\arrow\["([^"]*)"\s*(?:,\s*|(?=\]))/g;

function transformSource(code) {
  return code.replace(ARROW_LABEL_RE, (match, label) => {
    const stored = strip_outer_braces(label);
    const out = format_label(stored);
    const afterSecondQuote = match.slice(match.indexOf('"') + 1 + label.length + 1);
    return `\\arrow["${out}"` + afterSecondQuote;
  });
}

let input;
if (process.argv[2]) {
  input = readFileSync(process.argv[2], "utf8");
} else {
  try {
    input = readFileSync(0, "utf8");
  } catch (_) {
    input = "";
  }
}

const result = transformSource(input);
process.stdout.write(result);
if (!result.endsWith("\n")) process.stdout.write("\n");
