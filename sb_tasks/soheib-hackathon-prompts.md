# Soheib's Hackathon Prompt Guide (my tasks only)

My scope: Gemma 4 AI and clipboard (Phase 2), native export (Phase 3), demo video (Phase 4).
My teammate owns: App.jsx state, the 3-pane layout, VideoPane, PreviewPane, the Settings modal, loading UI, deployment.

How to use: paste ONE prompt at a time into your AI agent, test it, commit, then go to the next. Do not let the agent touch files outside the ones named in each step.

## Before you start (2 min, ask your teammate)

- Which file holds the `<textarea>` (probably `src/components/EditorPane.jsx`)?
- Names of: `markdownText`, `setMarkdownText`, `isTranscribing`, `setIsTranscribing` and where the Export button is.
- The Gemma 4 endpoint URL, auth method, request format and response format. You cannot finish Step 3 without this.

Git: `git pull`, then `git checkout -b soheib-ai-export`. Pull again before each push, and merge small and often so you don't conflict with your teammate.

## Project context (paste FIRST, once)

```
I'm working on a hackathon project: a 3-pane React (Vite) web app with a YouTube video pane, a markdown editor (<textarea>) and a live markdown+KaTeX preview. My teammate owns the layout, App.jsx state and settings UI. I own ONLY these features:
1) pasting a screenshot into the editor -> sending it to a Gemma 4 endpoint -> inserting the returned LaTeX at the cursor,
2) exporting the markdown to a .md file,
3) nothing else.
Rules: plain JavaScript (.jsx), no TypeScript, change as few existing files as possible, put new logic in new files under src/lib/, never reformat or refactor code I didn't ask about. First inspect the repo and tell me: where the <textarea> lives, what props/state it receives (markdownText, setMarkdownText, isTranscribing, setIsTranscribing or similar), and where the Export button is. Don't write code until you've told me this. After each task, list the files you changed and how to test.
```

---

## PHASE 2 - Gemma 4 AI and Clipboard (2:30 - 4:30)

### Step 1 - Clipboard listener (onPaste)

```
In the component that renders the <textarea>, attach an onPaste handler.
Loop over e.clipboardData.items. If an item has item.type.indexOf("image") !== -1, call e.preventDefault(), take item.getAsFile(), and pass the file to a function handleImagePaste(file). If no image item is found, do nothing, so normal text paste keeps working.
For now handleImagePaste only console.logs file.name, file.type and file.size.
If the component doesn't receive the props I need (setMarkdownText, setIsTranscribing), tell me exactly which props to ask my teammate to pass instead of changing App.jsx yourself.
```

Done when: pasting a screenshot logs its info; pasting normal text still pastes normally.

### Step 2 - Blob to Base64

```
Create src/lib/fileToBase64.js exporting async function fileToBase64(file).
Use FileReader.readAsDataURL and resolve with { base64, mimeType } where base64 is ONLY the data after the comma (strip "data:image/png;base64,") and mimeType is file.type. Reject if the reader errors.
Call it inside handleImagePaste with the pasted file and console.log the base64 length and mimeType.
```

Done when: a large base64 length is logged after a paste.

### Step 3 - Gemma 4 fetch and cursor injection

> Fill in the two [PASTE ...] placeholders with the real endpoint details before sending this prompt.

```
Create src/lib/transcribeImage.js exporting async transcribeImage({ base64, mimeType }).
It calls our Gemma 4 endpoint, read from import.meta.env.VITE_GEMMA_ENDPOINT (and optional VITE_GEMMA_API_KEY).
Request format: [PASTE: HTTP method, headers, JSON body shape, where the image and the prompt go]
Response format: [PASTE: JSON shape, where the generated text is]
The prompt text to send is exactly: "Transcribe the math in this image into KaTeX. Return ONLY the LaTeX/markdown, using $...$ for inline math and $$...$$ for block math, with no explanations and no code fences."
Behavior: throw a clear Error if the HTTP status is not OK; extract the generated text; strip leading/trailing ``` or ```latex fences and surrounding whitespace; return the clean string.
Also create .env.example with VITE_GEMMA_ENDPOINT= and VITE_GEMMA_API_KEY= and make sure .env / .env.local are in .gitignore (never commit a real key).

Then finish handleImagePaste in the textarea component:
1. Save textarea.selectionStart and selectionEnd BEFORE any await.
2. setIsTranscribing(true) if that prop exists.
3. fileToBase64 -> transcribeImage.
4. Build the new text: markdownText.slice(0, start) + latex + markdownText.slice(end), then call setMarkdownText(newText). Use the latest text from the textarea (e.g. textarea.value) rather than a stale closure.
5. After React updates, refocus the textarea and put the cursor right after the inserted text (setTimeout 0 or requestAnimationFrame to set selectionStart/selectionEnd).
6. In a finally block, setIsTranscribing(false).
7. On error, show a small inline message (no alert()) that disappears after 4 seconds.
```

Done when: you paste a screenshot of an equation, LaTeX appears at the cursor, and the preview renders it.
If the browser console shows a CORS error, copy the exact error to the agent. The usual fix is a proxy or an API route, so ask the organizers.

---

## PHASE 3 - Native Export (4:30 - 5:00)

### Step 4 - saveToDisk with File System Access API and fallback

```
Create src/lib/saveToDisk.js exporting async function saveToDisk(markdownText).
Logic:
1. If window.showSaveFilePicker exists: call it with suggestedName 'notes.md' and types [{ description: 'Markdown file', accept: { 'text/markdown': ['.md'] } }], then handle.createWritable(), write markdownText, close the stream.
2. If the user cancels the dialog (error.name === 'AbortError'), return silently.
3. Wrap everything in try/catch. If showSaveFilePicker is undefined (Firefox) or fails for any reason other than cancel, fall back to: create new Blob([markdownText], { type: 'text/markdown' }), URL.createObjectURL(blob), create a hidden <a> with download="notes.md", append it, click it, remove it, then URL.revokeObjectURL.
Then connect it to the existing Export button's onClick: onClick={() => saveToDisk(markdownText)}. If the Export button belongs to my teammate's file, make only that one-line change.
```

Done when: Chrome/Edge shows the native save dialog and writes a real .md file; Firefox downloads `notes.md`. Open the saved file to check that the content (including `$$...$$` math) is intact.

### Step 4b - Pre-demo bug check

```
Review only the files I changed (git diff): src/lib/*, the paste handler and the Export hook-up. Look for bugs: stale state, missing awaits, memory leaks (object URLs), errors that aren't caught, and anything that could crash if the clipboard has no image or the API fails. List problems first, then fix the smallest possible set.
```

---

## PHASE 4 - Demo Prep (5:00 - 5:45) - manual tasks (not for the agent)

1. Find the video: search YouTube for an Andrew Ng Machine Learning lecture (e.g. gradient descent, cost function, logistic regression) and pause where a complex equation is large and clearly readable on screen.
2. Copy the URL at that moment: right-click the video, then "Copy video URL at current time" (it includes `&t=...`). Save it in a note.
3. Prepare the screenshot: take the equation screenshot ahead of time and test it in the app. Make sure Gemma 4 transcribes it correctly and the preview renders it properly. If the result is wrong, pick a cleaner timestamp or crop tighter around the equation.
4. Have a backup: keep a second video URL and a second screenshot ready in case the first one fails.
5. Rehearse your part 3 times: paste URL, play, screenshot the equation (while the cursor rests where you want it), paste, wait for the loading state, show the rendered formula, then click Export and open the saved file.
6. Record a 30-second backup video of the full flow in case the network or the endpoint dies on stage.
7. Prepare your demo line: "Students lose time retyping equations from lectures; we turn a screenshot into clean KaTeX in one paste."

---

## Troubleshooting prompts

```
I get this error: [paste exact error + the file]. Find the root cause and fix it with the smallest possible change.
```

```
Paste works but the LaTeX is inserted at the wrong position / replaces the wrong text. Here is my paste handler: [paste]. Check that selectionStart/selectionEnd are saved before the await and that the new text is built from the latest textarea value.
```

```
The Gemma 4 response comes back with explanations or code fences around the math. Improve the prompt in transcribeImage.js and the cleanup so only raw markdown+KaTeX is returned.
```
