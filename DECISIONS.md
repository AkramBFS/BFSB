# GemmaTH — Technical Decisions (`DECISIONS.md`)

This document records the architectural decisions made where the product specification left design choices open.

---

## 1. Single-Surface Live Note Editor (`src/components/LiveNoteEditor.jsx`)

**Decision:** An Obsidian-style block-and-inline live markdown surface backed by plain markdown text (`tab.content`), without adding any external rich-text editor framework (zero new runtime dependencies).

**Reasoning:**
- **Why no Write/Preview split:** Switching modes interrupts note-taking during a fast-paced lecture. With `LiveNoteEditor`, headings, callouts, lists, inline emphasis, timestamps, images, and KaTeX math (`$...$` and `$$...$$`) render in place at all times.
- **Line/Token-Scoped Syntax Reveal:** Only the block or formula where the caret currently resides reveals its underlying markdown or LaTeX syntax (`# `, `> `, `- `, `$$...$$`). As soon as the caret moves to another line or leaves the formula, the syntax characters tuck away and the element renders cleanly.
- **Resilient Local Math Rendering:** Every inline (`$...$`) and display (`$$...$$`) formula is rendered individually via `katex.renderToString(..., { throwOnError: true })` inside a safe wrapper. If a formula has a syntax mistake, only that specific formula shows a compact, local, clickable error badge (`Syntax error: ... (click to edit)`) while the rest of the note stays rendered and editable.
- **Discoverable Timestamp Gesture:** Rendered timestamps (`[12:34](#t=12:34)`) display as dotted-underline links that seek the video player on click, paired with a subtle adjacent edit affordance (`✎`) and line-click caret entry so placing the caret next to or inside a timestamp is effortless.

---

## 2. Word-Processor Inline Ink & Font Model (`src/lib/noteDocument.js`)

**Decision:** Inline font and ink color runs are represented at runtime as per-character style vectors reconciled against raw markdown text, and serialized into `tab.content` as semantic HTML spans: `<span data-ink="oxblood" data-font="Lora">text</span>`.

**Reasoning:**
- **Word-Processor Selection vs. Caret Semantics:**
  - When a text range is selected (`cursorEnd > cursorStart`), picking a font or ink color in `NoteToolbar` mutates *only* that selected slice (`applyStyleToRange`).
  - When the caret is collapsed (`cursorEnd === cursorStart`), picking a font or ink color sets a typing style override from the caret onward; existing text before and after the caret is never touched (`reconcileCharStylesOnEdit`).
  - Moving the caret or selecting text immediately updates `NoteToolbar`'s displayed font and active ink swatch via `getStyleAtSelection`.
- **Theme-Adaptive Named Inks:** Storing semantic ink names (`data-ink="cobalt"`) rather than hardcoded hex codes allows CSS variables (`--ink-cobalt`, `--ink-oxblood`, `--ink-verdigris`, `--ink-plum`, `--ink-sepia`, `--ink-graphite`, `--ink-default`) to resolve to light-on-dark tints in Dark mode and deep fountain-pen inks in Light mode and print, guaranteeing $\ge 4.5:1$ contrast across mode switches.
- **Backwards Compatibility & Migration:** Previously saved plain markdown notes load without modification (defaulting to Carbon Ink and the user's default note font), and legacy swatch names (`gold`, `rose`, `sage`, `sky`) are automatically migrated via `normalizeSwatchKey` / `normalizeInkKey`.

---

## 3. Captured Frames Tray Choice Popover & Independent Note Media (`src/components/FramesTray.jsx`, `src/hooks/useDebouncedLocalStorage.js`)

**Decision:** Capturing a video frame, pasting an image (`Ctrl+V`), or uploading/dropping an image adds it *only* to the Captured Frames tray. Clicking any frame tile in the tray opens an anchored Radix `DropdownMenu` choice popover with a larger preview and three explicit actions:
1. **Add to note as is** — inserts `![Caption](frame://<id>)` at the caret.
2. **Read the formula** — sends the frame to the vision model (`transcribeImageToLatex`), shows an in-progress indicator with cancellation, and inserts rendered LaTeX at the caret. If the model detects no math (`NO_MATH_FOUND`) or fails, a plain-language notice with Retry is shown and nothing is inserted into the note.
3. **Send to chat** — attaches the frame chip to the chat input and focuses the input.

**Deleting Tray Frames Without Breaking Note Images:**
- When a user deletes a frame from the Captured Frames tray (`removeFrameById`), `extractReferencedFrameIds(tabs)` checks whether `frame://<id>` is still referenced in any note tab. If referenced, the binary image payload is preserved in IndexedDB and the `mediaById` cache so the image inside the note continues to render and export cleanly.

---

## 4. Stationery & Fountain-Pen Ink Palette (`src/lib/contrast.js`, `src/styles/tokens.css`)

**Decision:** Replaced the generic amber-gold default accent and 4 pastel swatches with a 6-swatch stationery and fountain-pen ink palette (**Prussian Blue** `cobalt` default, **Oxblood** `oxblood`, **Verdigris** `verdigris`, **Damson Plum** `plum`, **Walnut Sepia** `sepia`, and **Graphite** `graphite`, plus **Carbon Ink** `default` for note text).

**Reasoning:**
- Warm charcoal (`#12110f` / `#1a1916`) in Dark mode and warm cream paper (`#f1ebdf` / `#fbf8f2`) in Light mode pair naturally with classic fountain-pen inks.
- Every ink and accent token is verified by automated unit tests (`src/lib/contrast.test.js`) to meet WCAG 2.1 AA ($\ge 4.5:1$) contrast against all three surfaces (`bg`, `pn`, `rz`) in both Dark and Light modes, as well as button label contrast (`--on-accent` on `--accent`) for the **Capture frame** button.

---

## 5. Storage Strategy, Gemini API Integration & Video Capture (`src/lib/storage.js`, `src/lib/aiService.js`, `src/lib/frameCapture.js`)

- **Hybrid Persistence:** `localStorage` (`mlpad.schemaVersion = 2`) stores lightweight workspace state with a 500ms debounce, while IndexedDB (`mlpad_media_db`) stores compressed JPEG frame media.
- **Gemini / Hosted Gemma 4 Vision API:** Direct REST `fetch` calls to `generateContent` with `gemma-4-31b-it` as default, automatic fallback for inline `systemInstruction`, and strict `localStorage` isolation for `mlpad.secret.apiKey`.
- **Zero New Runtime Dependencies:** All five fixes and visual refinements are implemented within the existing React + Vite + Tailwind + Radix + KaTeX stack.


---

## 6. AI Study Hub — Summary & Active-Recall Quiz (`src/components/StudyHubDrawer.jsx`, `src/lib/aiService.js`)

**Decision:** A slide-out right-hand drawer built on `@radix-ui/react-dialog` and `@radix-ui/react-accordion`, accessible from both the `NoteToolbar` (**Study Hub**) and `TopBar` (**Study Hub**), reusing the app's existing Gemma 4 (`gemma-4-31b-it` default) client (`callGeminiGenerateContent`), API key / `.env` configuration (`getApiKey`, `getCustomGemmaEndpoint`), and Markdown + KaTeX rendering pipeline (`ReactMarkdown` + `remark-math` + `rehype-katex`).

**Reasoning:**
- **Summary Generation (`generateNoteSummary`):** Strips inline `<span data-ink data-font>` styling tags (`stripNoteStylingSpans`), validates that the note is non-empty before calling the network, instructs Gemma 4 to produce **three executive-summary bullet points** followed by a **Key Formulas** section in Markdown + KaTeX (`$...$` / `$$...$$`), and strips any outer markdown fences (`cleanSummaryMarkdown`). Includes one-click **Copy** and **Insert in note** actions.
- **Quiz Generation & Defensive Parsing (`generateNoteQuiz`, `parseQuizResponseDefensively`):** Instructs Gemma 4 to output strictly machine-readable JSON (`[{ "question": "...", "answer": "..." }, ...]`). `parseQuizResponseDefensively` handles code fences, surrounding prose, wrapper objects (`{ quiz: [...] }` / `{ questions: [...] }`), single-backslash LaTeX sequences inside JSON strings (e.g. `\theta`, `\frac`, `\nabla` that `JSON.parse` would otherwise corrupt into control characters), object-literal regex fallback, and structured `Q1:/A1:` blocks, surfacing a clean `MALFORMED_QUIZ` error with **Retry** if the output is unusable.
- **Interactive Active-Recall Accordion (`src/components/ui/Accordion.jsx`):** Uses `@radix-ui/react-accordion` (`type="multiple"`) with all answers collapsed initially so the student can attempt each question before revealing the answer. Both questions and answers render full Markdown and KaTeX math.
- **Per-Tab Session Scoping & Request Cancellation:** Study Hub results are keyed by `activeTab.id` (`resultsByTabId[tabId]`). Switching note tabs or closing the drawer aborts any in-flight `AbortController` request and scopes displayed results to the active note tab so stale output never leaks across tabs.
