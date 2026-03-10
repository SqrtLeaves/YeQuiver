# Report: Extra curly braces in exported tikz-cd arrow labels

## Problem

When exporting a diagram to LaTeX (tikz-cd) via the LaTeX export button (⌘E), arrow labels that do not require outer braces are sometimes output with extra curly braces.

**Examples:**
- Expected: `\arrow["f^{X}", from=1-1, to=1-2]`
- Actual:   `\arrow["{f^{X}}", from=1-1, to=1-2]`

The visible label in the rendered diagram then shows literal `{` and `}` around the content (e.g. `{f^{X}}` instead of *f* with superscript *X*).

On **import → export round-trips**, the braces can accumulate (e.g. `{{f^{X}}}`, `{{{f^{X}}}}`) if the exporter re-wraps already-wrapped labels and the importer does not normalise them.

---

## Root cause

In tikz-cd, the first argument of `\arrow` is a quoted string. Outer curly braces around that string’s content are **only** required when the label contains characters that would break parsing: **`[`**, **`]`**, or **`"`**. Labels that are plain LaTeX (e.g. `f^{X}`, `\alpha`, `x_n`) must not be wrapped in an extra `{ }` layer.

Two issues led to the bug:

1. **Export**  
   The exporter did not consistently avoid adding outer braces for such labels. It also did not strip existing outer braces from the stored label before deciding whether to wrap (e.g. after a previous export or paste), so labels like `{f^{X}}` were emitted as-is or wrapped again.

2. **Import**  
   When parsing tikz-cd, the arrow label inside quotes was stored as read. If the source had `"{f^{X}}"`, the diagram stored `{f^{X}}`. On the next export, that string could be wrapped again, causing brace accumulation on repeated round-trips.

---

## Solution

### 1. Export (`src/quiver.mjs`)

- **Only wrap when necessary:** Introduce `needs_braces(s)` that returns true only when the string contains `[`, `]`, or `"`. Use this to decide whether to output `{...}` around the label.
- **Normalise before wrapping:** Before applying the above rule, strip **all** redundant outer brace layers from the label (e.g. `{{f^{X}}}` → `f^{X}`) using a helper that repeatedly removes one level of balanced outer `{ }` until none remain. This ensures that:
  - Labels stored as `{f^{X}}` (e.g. from a previous export) are output as `f^{X}`.
  - Multiple layers (e.g. `{{f^{X}}}`) are normalised to `f^{X}` and not re-wrapped.
- **Single place for formatting:** All arrow (and vertex) labels in the tikz-cd export go through this `format_label` logic so there is no second code path that adds extra braces.

### 2. Import (`src/parser.mjs`)

- When parsing the quoted arrow label (e.g. `"f^{X}"` or `"{f^{X}}"`), strip **all** redundant outer brace layers (same “balanced outer braces” logic in a loop) before assigning to `edge.label`. That way, round-trip does not accumulate braces and the internal representation stays normalised.

### Code references

- **Export:** `QuiverImportExport.tikz_cd.export` in `src/quiver.mjs`: `needs_braces`, `has_outer_braces`, `strip_outer_braces_once`, `strip_outer_braces`, and `format_label` (used for both vertex and edge labels in the tikz-cd output).
- **Import:** Arrow label parsing in `src/parser.mjs` (after `this.eat("\"")`): loop that strips balanced outer `{ }` from the parsed label string before `edge.label = label`.

---

## Summary

| Item | Description |
|------|-------------|
| **Symptom** | Exported tikz-cd arrow labels show extra `{ }` (e.g. `{f^{X}}` instead of `f^{X}`), and braces can accumulate on import/export round-trips. |
| **Cause** | Export sometimes wrapped labels that don’t need braces and didn’t strip existing outer braces; import didn’t normalise labels, so round-trips re-wrapped and accumulated. |
| **Fix** | Export: wrap only when label contains `[`, `]`, or `"`; always strip all redundant outer brace layers before deciding. Import: strip all redundant outer brace layers from the parsed arrow label before storing. |
