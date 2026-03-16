## Quick LaTeX label shortcuts for Quiver

### Overview

This change adds Quick LaTeX-style shorthand expansion for node and arrow labels inside the Quiver editor UI.  
When typing in the bottom label input, short alphabetic codes (e.g. `al`) can be expanded into LaTeX snippets (e.g. `\alpha`) by pressing Space or Tab.  
The mapping from codes to snippets is not hard-coded: it is loaded from an external text file so that users can customize and hot-reload their own bindings without rebuilding Quiver.

### Functionality

- **Scope**
  - Applies to the **label input bar at the bottom of the Quiver UI** (used to edit labels of selected vertices and edges).
  - Works for both node and arrow labels; any selected cell(s) whose `label` differs from the input value will be updated.

- **Triggering expansion**
  - User types a sequence of ASCII letters (the *shorthand key*), e.g. `al`.
  - Expansion is triggered by:
    - Pressing **Space** (after the key): the key is replaced by the snippet, and the trailing space is kept.
    - Pressing **Tab**: the key is replaced by the snippet, without adding extra whitespace.
  - The shorthand key is only recognized when:
    - It is the *final* run of letters immediately before the caret.
    - The character *before* the key (if any) is **not** a letter. This avoids false positives such as the `ta` in `delta`.
  - Expansion is disabled when the UI is in **Command** mode; there it continues to interpret the label input as a command code list (unchanged behavior).

- **Cursor positioning and placeholders**
  - Snippets may use:
    - `#cursor` – the caret will be placed at this position after expansion; the marker itself is removed.
    - `#tab` – currently removed during expansion (the format is preserved for compatibility, but no extra Tab navigation is implemented yet).
  - If there is no explicit `#cursor`, but the snippet contains `"{}"`, then the caret is placed *inside* the first occurrence of `{}`.
  - Otherwise, the caret is placed at the **end** of the inserted snippet (plus a trailing space if the trigger was Space).

### Binding file and format

- **Location**
  - The bindings are loaded from:
    - `src/quick_latex_binding.txt`
  - The file is served along with the Quiver front-end (e.g. via `make serve`).

- **Format**
  - One binding per line:
    - `key:snippet;`
  - Parsing rules:
    - Leading and trailing whitespace are stripped.
    - Empty lines or lines starting with `%` are ignored.
    - The first `:` separates the key from the snippet; the **last** `;` terminates the snippet.
    - Everything between `:` and the final `;` is taken as the literal snippet (including spaces, `#cursor`, `#tab`, etc.).
  - Example entries:
    - `al:\alpha;`
    - `bi:\binom{#cursor}{#tab};`
    - `cases:\begin{cases}\n#cursor\n\end{cases};`

- **Semantics**
  - The `key` is the alphabetic code the user types (e.g. `al`).
  - The `snippet` is inserted exactly as written at the label input caret position (subject to `#cursor`/`#tab` handling and space/Tab behavior described above).

### Implementation details

All changes are in `src/ui.mjs` and a new resource file `src/quick_latex_binding.txt`.

#### UI state and loading

- The `UI` class now tracks:
  - `this.quick_latex_raw: string | null` – the raw text of the binding file.
  - `this.quick_latex_entries: Record<string, string> | null` – parsed `key → snippet` map.
  - `this.quick_latex_loading: Promise<void> | null` – in-flight fetch promise (used to avoid duplicate requests).

- New method on `UI`:
  - `load_quick_latex_bindings(): Promise<void>`
    - Performs `fetch("quick_latex_binding.txt", { cache: "no-store" })`.
    - On success:
      - Stores the text in `quick_latex_raw`.
      - Parses lines into `quick_latex_entries`.
    - On failure:
      - Resets `quick_latex_raw` to `null` and `quick_latex_entries` to an empty object.
    - Uses `quick_latex_loading` to coalesce concurrent loads.

#### Expansion logic

- Implemented inside `Panel.initialise(ui)` as a local helper:
  - `expand_quick_latex(options?: { keep_trailing_space?: boolean }): boolean`
  - Behavior:
    - Early-exits when the UI is in Command mode or when the label input has no caret position.
    - For space-triggered expansions, inspects the character before the caret and (if it is a space) temporarily backs the caret up by one for key detection.
    - Extracts the *last* run of `[A-Za-z]+` before the caret; validates that the character before this run is not a letter.
    - Looks up the snippet in `ui.quick_latex_entries`.
    - If present, computes the replacement string and new caret location according to the rules under “Cursor positioning and placeholders”.
    - Updates the input element’s value, selection, and dispatches a synthetic `input` event so that existing label update / history logic remains unchanged.
    - Returns `true` if an expansion occurred, otherwise `false`.

- Event wiring on the label input (`this.label_input`):
  - `keydown`:
    - `Tab`:
      - Calls `ui.load_quick_latex_bindings()` and then `expand_quick_latex({ keep_trailing_space: false })`.
      - If expansion succeeds, prevents default and stops propagation.
    - `" "` (Space):
      - Sets a small flag (`this._quick_latex_pending_space = true`) but does not immediately prevent the event, so the space is still inserted by the browser.
  - `input`:
    - If `_quick_latex_pending_space` is set, clears the flag and calls:
      - `ui.load_quick_latex_bindings()` then `expand_quick_latex({ keep_trailing_space: true })`.
    - If expansion occurs, it returns early from the `input` handler, letting the regular “label changed” path be driven by the synthetic `input` dispatched by `expand_quick_latex`.
    - Otherwise, the original label-update logic runs as before.

This design ensures:
- **No interference with existing label editing and history**:
  - All changes still go through the same `input` event path the panel already uses.
- **IME friendliness**:
  - Space-triggered expansion waits for the physical space character to be inserted before acting.
- **Non-invasive integration**:
  - When there is no matching shorthand, the behavior is exactly the same as before (label input remains normal text input).

### Hot reload behavior

- Each time the user presses Space or Tab in the label input (and expansion is considered):
  - Quiver calls `load_quick_latex_bindings()` with `cache: "no-store"`, so the browser does not reuse old cached responses.
  - The bindings are re-read and re-parsed on demand.
- This means:
  - While the server (`make serve`) is running, you can edit and save `src/quick_latex_binding.txt`.
  - After a **browser refresh**, subsequent Space/Tab presses pick up the updated bindings without any rebuild or server restart.

### Usage notes

- When modifying bindings:
  - Edit `src/quick_latex_binding.txt`.
  - For simple one-line snippets, keep one `key:snippet;` per line.
  - For multi-line snippets, start with `key:` and continue on following lines until the terminating `;` line.
  - You can include blank lines or comment lines starting with `%`.
- When using in the UI:
  - Select a cell (vertex or edge) so that the bottom label input is enabled.
  - Type your shorthand (e.g. `al`), then press Space; the shorthand is replaced by the snippet, and you can keep typing.
  - For more complex snippets that use `#cursor` / `#tab`, you can define your own entries in the binding file, following the existing examples.

