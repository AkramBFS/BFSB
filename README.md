# GemmaTH — Video & Notes Study Workspace

GemmaTH is a browser-only study workspace built for CS and Machine Learning students taking math-heavy notes alongside video lectures. Watch a YouTube lecture or local video file on the left, take live-rendered Markdown + KaTeX notes on the right, capture exact video frames in one click, and transcribe formulas to LaTeX or ask follow-up questions with hosted Gemma 4 / Gemini vision models.

---

## 1. How to Run

```bash
# Install dependencies
npm install

# Start local development server (http://localhost:5173)
npm run dev

# Run unit tests (44 tests covering WCAG contrast, readability guard, URL parsing, LaTeX cleaning, and export)
npm test

# Run linter
npm run lint

# Build production static bundle (outputs to dist/)
npm run build
```

---

## 2. Supplying Your Gemini API Key

GemmaTH runs 100% in the browser with no backend server.
1. Click the **Settings (sliders)** icon in the top bar (or click the **Gemma 4** badge in the chat dock).
2. In the **AI & API key** tab, paste your Google Gemini API key (`AIzaSy...`) and click **Save key**.
3. Your key stays only in your browser (`localStorage` key `mlpad.secret.apiKey`). It is never logged, never included in exported Markdown/PDF files, and never sent anywhere except directly to `https://generativelanguage.googleapis.com`.
4. **Supported Vision Models:**
   - `gemma-4-31b-it` *(Default — Hosted Gemma 4 31B Instruct with vision)*
   - `gemma-4-26b-a4b-it` *(Hosted Gemma 4 26B Mixture-of-Experts with vision)*
   - `gemini-2.5-flash` & `gemini-2.5-pro` *(Vision fallbacks)*
   - Any custom Gemini API model ID can also be entered in Settings.
5. *(Optional for hackathon demos)* You can provide a restricted demo key at build time via `VITE_DEMO_GEMINI_API_KEY` in `.env.local`; any key entered by the user in the UI always overrides it.

---

## 3. How Frame Capture Works & Its Limits

### YouTube Videos (Browser Tab Capture)
Because YouTube embeds run inside a cross-origin `<iframe>`, browser security prevents reading pixels directly from the iframe.
- On your first click of **Capture frame**, GemmaTH requests screen-sharing permission for **This Tab** (`navigator.mediaDevices.getDisplayMedia` with `preferCurrentTab: true`).
- GemmaTH verifies that you selected a browser tab (not a whole monitor or separate window) and keeps the capture stream warm for your session.
- Every subsequent click on **Capture frame** grabs a fresh frame and crops it to the exact bounding box of the video player in ~45ms with **no further prompts**, accounting for window size, browser zoom, Retina/HiDPI scaling, and scroll position.
- Enable the **`→ LaTeX`** toggle next to **Capture frame** to automatically transcribe the captured frame's formula directly into your note at the cursor.

### Local Video Files & Fallbacks (Zero Permission Required)
- **Local Video Files:** Click **Local video** next to the URL bar to open any `.mp4` or `.webm` lecture file from your computer. Frame capture on local videos reads directly from the HTML5 `<video>` element with zero permissions required.
- **Clipboard Paste (`Ctrl+V` / `Cmd+V`):** Take an OS screenshot (`Win+Shift+S` or `Cmd+Shift+4`) and press `Ctrl+V` anywhere in GemmaTH to add the image to the tray and optionally snap it to LaTeX.
- **Drag & Drop / File Upload:** Drag any image onto the Captured Frames tray or click the **Upload image** tile.
- **Sample Math Slide:** In the frames tray or fallback banner, click **Load sample math frame** to generate a crisp Gradient Descent lecture slide for testing AI transcription offline or on mobile browsers.

---

## 4. Slash-Command Formulas & Snap-to-LaTeX

- **Offline Slash Menu:** Type `/` in Write mode (or click the **$\Sigma$** button in the note toolbar) to search 20 built-in ML & math formulas (`/gd`, `/cost`, `/hypothesis`, `/sigmoid`, `/softmax`, `/mse`, `/crossentropy`, `/normal`, `/ridge`, `/lasso`, `/bayes`, `/backprop`, `/attention`, `/kl`, `/gaussian`, `/adam`, `/relu`, `/norm`, `/cosine`, `/matrix`).
- **Natural-Language AI Formulas:** Type any description after `/` (e.g., `/covariance matrix` or `/poisson distribution`) and press `Enter` to have the AI generate and validate the LaTeX formula at your cursor.
- **Image-to-LaTeX:** Hover any captured frame in the tray and click **$\Sigma$** (or click **Snap image → LaTeX** in the formula palette) to transcribe handwritten or slide equations into clean KaTeX math.

---

## 5. Storage Strategy

- **Metadata (`localStorage`):** Note tabs, active tab, cursor positions, video URL & last playback position, theme/custom colors/fonts, and recent chat history are auto-saved with a 500ms debounce under versioned `mlpad.*` keys (`schemaVersion = 2`).
- **Frame Media (`IndexedDB`):** Captured and uploaded images are downscaled (`max 1280×720`, JPEG `0.85`) and stored in IndexedDB (`mlpad_media_db`) so large images never exhaust the 5 MB `localStorage` quota.
- **Demo & Reset:** Open **Settings → Demo & storage** to load the pre-tested demo workspace or reset the workspace to a clean single empty note at any time.

---

## 6. Known Limitations

- **Browser Support for Tab Capture:** `getDisplayMedia` with tab sharing works best on desktop Chromium browsers (Chrome, Edge, Brave) over HTTPS or `localhost`. Firefox and Safari users (or mobile users) can use the **Local video**, **Paste screenshot (`Ctrl+V`)**, or **Upload image** flows, which feed the exact same tray and AI pipeline.
- **YouTube Embed Restrictions:** Some YouTube videos disable third-party embedding by creator setting; GemmaTH detects this and displays a fallback prompt to paste another link or open a local video file.
