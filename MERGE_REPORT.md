# Manual Merge Report: `soheib-ai-export` → `akramside`

**Target Branch:** `merge/akramside+soheib-ai-export`
**Base Branch:** `akramside`
**Incoming Branch:** `soheib-ai-export` (commit `f143983`, merge-base `eadb253`)

---

## 1. Items Worth a Human Look First

- **Environment Variable Endpoint Override (`VITE_GEMMA_ENDPOINT`):** When `VITE_GEMMA_ENDPOINT` is defined in `.env` (currently set to `gemini-flash-lite-latest:generateContent`) and the user leaves the model selector on the default model (`gemma-4-31b-it`), `callGeminiGenerateContent` prioritizes `VITE_GEMMA_ENDPOINT` as the primary endpoint for sub-second OCR response times, while keeping `gemma-4-31b-it` and `gemini-2.5-flash` in the automatic fallback chain. If the user explicitly picks a different model in **Workspace settings → AI & API key**, their selected model endpoint takes precedence.
- **API Key Resolution Order:** User-supplied keys saved in the browser (`mlpad.secret.apiKey`) always take top priority. If no browser key is set, `getEffectiveApiKey()` now falls back to `VITE_GEMMA_API_KEY`, `VITE_GEMINI_API_KEY`, or `VITE_DEMO_GEMINI_API_KEY` from `.env`.

---

## 2. Feature-by-Feature Merge Breakdown

| Feature / Module | Classification | Resolution & Foundation | Details Absorbed from `soheib-ai-export` |
| :--- | :--- | :--- | :--- |
| **Full 2-Column ML-Pad Workspace UI** (`TopBar`, `VideoPane`, `FramesTray`, `NotesPane`, `LiveNoteEditor`, `NoteTabs`, `NoteToolbar`, `ChatDock`, `SettingsDialog`, `FrameViewerDialog`) | **Only on `akramside`** | **Kept as is** (`akramside` foundation) | Preserved 100% of `akramside`'s editorial UI, Obsidian-style single-surface live editor, word-processor inline fountain-pen ink/font styling, and WCAG AA stationery palette. |
| **Image-to-LaTeX AI Transcription** (`src/lib/aiService.js` + `src/lib/transcribeImage.js`) | **On both, implemented differently** | **Combined** (`akramside`'s `aiService.js` as foundation) | Absorbed: (1) Ordered multi-endpoint fallback loop on `429` / `404` / `5xx` errors (`buildCandidateEndpoints`), (2) Filtering out internal model reasoning parts where `part.thought === true`, (3) `x-goog-api-key` request header alongside URL key support, (4) `gemini-flash-lite-latest` preset option in `AI_MODEL_OPTIONS`, and (5) exported `transcribeImage({ base64, mimeType })` wrapper in `src/lib/transcribeImage.js`. |
| **LaTeX Output Sanitization** (`src/lib/formulas.js`) | **On both, implemented differently** | **Combined** (`akramside`'s `cleanAndValidateLatex` as foundation) | Absorbed from `cleanLatex`: (1) Support for `markdown` and `katex` code-fence labels (` ```(?:latex\|tex\|math\|markdown\|katex) `) plus unclosed leading/trailing fence stripping, (2) Extraction of the final `$$...$$` or `$...$` formula when the model emits `> 30` chars of chain-of-thought reasoning preamble before the math block, (3) Deduplication of adjacent identical `$$...$$` blocks, and (4) exported `cleanLatex(rawText)` helper. |
| **Client-Side Image Compression & Base64 Conversion** (`src/lib/storage.js` + `src/lib/fileToBase64.js`) | **On both, implemented differently** | **Combined** (`akramside`'s `compressImageDataUrl` as foundation) | Absorbed from `fileToBase64.js`: (1) Hardware-accelerated `createImageBitmap(file)` fast-path when given a `File` or `Blob` directly (avoiding an intermediate base64 string decode before canvas drawing), (2) `indexOf(',')` slice optimization, and (3) exported `fileToBase64(file)` shared helper delegating to `compressImageDataUrl`. |
| **Native Markdown File Export** (`src/lib/export.js` + `src/lib/saveToDisk.js`) | **On both, implemented differently** | **Combined** (`akramside`'s `exportMarkdown` as foundation) | Absorbed from `saveToDisk.js`: (1) `link.style.display = 'none'` on the fallback download `<a>` element, and (2) exported `saveToDisk(markdownText, options)` wrapper delegating to `exportMarkdown` (so exported notes also benefit from `akramside`'s sanitized tab-title filenames and inline `frame://<id>` base64 image resolution). |
| **Clipboard Screenshot Paste & Pre-Await Cursor Preservation** (`src/App.jsx`, `src/components/NotesPane.jsx`) | **On both, implemented differently** | **Combined** (`akramside` tray workflow + `soheib-ai-export` cursor/closure guards) | Absorbed from `EditorPane.jsx`: (1) Saving `cursorStart` / `cursorEnd` **before** awaiting `transcribeImageToLatex` so async formula insertion always lands at the exact selection the user had when starting transcription, (2) Reading from a live synchronous `latestStateRef` inside `insertAtCursor` so network completions never read a stale closure of note text, and (3) Adding a 1-click **"Read formula"** action button on the toast shown when pasting a screenshot (`Ctrl+V`). |
| **Environment Config & Git Ignore** (`.env.example`, `.gitignore`, `src/lib/storage.js`) | **Only on `soheib-ai-export`** | **Ported** into base config | Added `.env.example`, updated `.gitignore` to ignore `.env` / `.env.*` while tracking `!.env.example`, and wired `VITE_GEMMA_API_KEY`, `VITE_GEMINI_API_KEY`, and `VITE_GEMMA_ENDPOINT` into `src/lib/storage.js`. |

---

## 3. Items Intentionally Dropped from `soheib-ai-export`

1. **`src/components/EditorPane.jsx`, `src/components/PreviewPane.jsx`, and mockup `src/App.jsx`:**
   - *Why dropped:* Per the UI rule, these were 2-pane throwaway test harnesses with hardcoded inline styles (`#4f46e5`, `#fafafa`) and regex-only `<p>`/`<h1>` replacement. All underlying logic (pre-await cursor capture, stale-closure avoidance, KaTeX rendering, and export triggers) is integrated into `akramside`'s `NotesPane`, `LiveNoteEditor`, and `ExportMenu`.
2. **`sb_tasks/soheib-hackathon-prompts.md`:**
   - *Why dropped:* Personal hackathon prompt scratchpad notes, not application code.
3. **Auto-inserting raw LaTeX into the note on every `Ctrl+V` image paste without user choice:**
   - *Why dropped:* Directly conflicts with `akramside`'s Fix 3 requirement (*"Captured frames are chosen, not dumped into the note... Pasting or dropping an image into the workspace adds it to the captured frames tray, same as capturing"*). Instead, `Ctrl+V` adds the screenshot to the frames tray and surfaces a non-intrusive **"Read formula"** toast action alongside the tray's choice popover.

---

## 4. UI Additions & Design Cues Followed

- **Toast Action on Clipboard Paste (`src/App.jsx`):** Uses `akramside`'s existing `Toast` action pill (`actionLabel: 'Read formula'`) styled with `--rz`, `--tx`, and `--bd2` tokens.
- **Model Selector Option (`src/components/SettingsDialog.jsx` via `AI_MODEL_OPTIONS`):** Added `gemini-flash-lite-latest` (*"Gemini Flash Lite (Ultra-fast OCR)"*) to the existing radio group in **Workspace settings → AI & API key**, using the exact same badge and description layout as the Gemma 4 options.

---

## 5. Verification & Test Results

- **Unit Tests (`npm test`):** `2 passed` test files (`src/lib/contrast.test.js`, `src/lib/core.test.js`), **95 passed tests** (including new tests for `cleanLatex` chain-of-thought stripping/deduplication, `fileToBase64`, `saveToDisk`, and `transcribeImage`).
- **Linter (`npm run lint`):** `oxlint` — **0 warnings, 0 errors** across 34 files.
- **Production Build (`npm run build`):** `vite build` — succeeded cleanly in ~4.8s with all self-hosted font and KaTeX assets bundled.
