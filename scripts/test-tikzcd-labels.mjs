#!/usr/bin/env node
/**
 * Test tikz-cd label formatting: no extra braces for f^{X}, and no accumulation on round-trip.
 * Run from repo root: node scripts/test-tikzcd-labels.mjs
 */

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

const strip_outer_braces_once = (s) => {
    if (!has_outer_braces(s)) return s;
    return s.slice(1, -1);
};
const strip_outer_braces_all = (s) => {
    let t = s;
    while (has_outer_braces(t)) t = strip_outer_braces_once(t);
    return t;
};

const format_label = (label) => {
    if (label.includes("\\\\")) {
        return `\\begin{array}{c} ${label} \\end{array}`;
    }
    const normalised = strip_outer_braces_all(label);
    if (needs_braces(normalised)) {
        return `{${normalised}}`;
    }
    return normalised;
};

function strip_outer_braces(label) {
    let t = label;
    for (;;) {
        if (t.length < 2 || t[0] !== "{" || t[t.length - 1] !== "}") return t;
        let depth = 0;
        let balanced = true;
        for (let i = 1; i < t.length - 1; i++) {
            if (t[i] === "{") depth++;
            else if (t[i] === "}") { depth--; if (depth < 0) { balanced = false; break; } }
        }
        if (!balanced || depth !== 0) return t;
        t = t.slice(1, -1);
    }
}

// Simulate: import gives raw string, we strip; export gives format_label(stored).
function round_trip(importedLabel) {
    const stored = strip_outer_braces(importedLabel);
    return format_label(stored);
}

let failed = 0;

function ok(cond, msg) {
    if (!cond) {
        console.error("FAIL:", msg);
        failed++;
    } else {
        console.log("OK:", msg);
    }
}

// 1. Export "f^{X}" must stay "f^{X}" (no extra braces)
ok(format_label("f^{X}") === "f^{X}", "format_label('f^{X}') === 'f^{X}'");

// 2. Round-trip: import "f^{X}" -> export should be "f^{X}"
ok(round_trip("f^{X}") === "f^{X}", "round_trip('f^{X}') === 'f^{X}'");

// 3. Round-trip: import "{f^{X}}" -> strip to "f^{X}" -> export "f^{X}"
ok(round_trip("{f^{X}}") === "f^{X}", "round_trip('{f^{X}}') === 'f^{X}'");

// 4. Multiple round-trips must not accumulate
ok(round_trip(round_trip("{f^{X}}")) === "f^{X}", "double round_trip stays 'f^{X}'");

// 5. Labels that need braces: contain [ or ] or "
ok(format_label("[a]") === "{[a]}", "format_label('[a]') === '{[a]}'");
ok(format_label("]x[") === "{]x[}", "format_label(']x[') needs braces");

// 6. Already wrapped: strip and output without extra braces
ok(format_label("{f^{X}}") === "f^{X}", "format_label('{f^{X}}') -> 'f^{X}' (strip then no wrap)");

// 7. Multiple brace layers: strip all
ok(format_label("{{f^{X}}}") === "f^{X}", "format_label('{{f^{X}}}') -> 'f^{X}'");

process.exit(failed ? 1 : 0);
