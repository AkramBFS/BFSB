import React, {
  useState,
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useMemo,
} from 'react';
import { NoteTabs } from './NoteTabs';
import { NoteToolbar } from './NoteToolbar';
import { LiveNoteEditor } from './LiveNoteEditor';
import { SigmaIcon, CloseIcon, UploadIcon, RetryIcon } from './Icons';
import { searchFormulaLibrary } from '../lib/formulas';
import {
  resolveFormulaFromText,
  transcribeImageToLatex,
} from '../lib/aiService';
import {
  parseNoteContent,
  serializeNoteContent,
  getStyleAtSelection,
  applyStyleToRange,
  reconcileCharStylesOnEdit,
} from '../lib/noteDocument';
import { compressImageDataUrl } from '../lib/storage';
import { useToast } from './ToastContext';

let uploadNoteIdCounter = 1;
function nextUploadFrameId() {
  uploadNoteIdCounter += 1;
  return `upload-${Date.now()}-${uploadNoteIdCounter}`;
}

export const NotesPane = forwardRef(function NotesPane(
  {
    tabs,
    activeTabId,
    onSelectTab,
    onNewTab,
    onCloseTab,
    onRenameTab,
    onReorderTabs,
    onUpdateTab,
    noteFont = 'Newsreader',
    onSeekTimestamp,
    onInspectFrame,
    frames = [],
    mediaById = {},
    onUploadImage,
    currentTimeStr = '00:00',
    currentSeconds = 0,
    youtubeUrl = '',
    aiModel,
    onRequireApiKey,
  },
  ref
) {
  const [slashPaletteOpen, setSlashPaletteOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashRange, setSlashRange] = useState(null); // { start, end } in rawText if triggered by typing '/'
  const [selectedFormulaIdx, setSelectedFormulaIdx] = useState(0);

  // Typing style override when user changes font or ink with a collapsed caret
  const [typingStyleOverride, setTypingStyleOverride] = useState(null);

  const [aiPendingMessage, setAiPendingMessage] = useState(null);
  const [latexWarningBanner, setLatexWarningBanner] = useState(null); // { message, retryFn }

  const fileInputRef = useRef(null);
  const snapImageInputRef = useRef(null);
  const abortControllerRef = useRef(null);
  const undoStackRef = useRef(new Map()); // tabId -> string[]
  const redoStackRef = useRef(new Map()); // tabId -> string[]
  const latestStateRef = useRef(null);

  const { showToast } = useToast();
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // Parse the active tab's stored markdown (including any inline <span data-ink data-font> runs)
  const parsedDoc = useMemo(
    () => parseNoteContent(activeTab?.content || '', noteFont, 'default'),
    [activeTab?.content, noteFont]
  );

  const cursorStart =
    typeof activeTab?.cursorStart === 'number'
      ? Math.min(parsedDoc.rawText.length, Math.max(0, activeTab.cursorStart))
      : parsedDoc.rawText.length;
  const cursorEnd =
    typeof activeTab?.cursorEnd === 'number'
      ? Math.min(parsedDoc.rawText.length, Math.max(cursorStart, activeTab.cursorEnd))
      : cursorStart;

  const hasSelection = cursorEnd > cursorStart;

  // Determine the style at the current caret or selection so the toolbar stays in sync
  const currentCaretStyle = useMemo(
    () =>
      getStyleAtSelection(
        parsedDoc.rawText,
        parsedDoc.charStyles,
        cursorStart,
        cursorEnd,
        noteFont,
        'default',
        typingStyleOverride
      ),
    [
      parsedDoc.rawText,
      parsedDoc.charStyles,
      cursorStart,
      cursorEnd,
      noteFont,
      typingStyleOverride,
    ]
  );

  // Keep a synchronous ref to the latest active tab & parsed document so async callbacks
  // (like AI transcription completing after a network round-trip) never read a stale closure!
  latestStateRef.current = {
    activeTab,
    parsedDoc,
    cursorStart,
    cursorEnd,
    currentCaretStyle,
    noteFont,
  };

  const pushUndoSnapshot = useCallback((tabId, content) => {
    if (!tabId) return;
    const stack = undoStackRef.current.get(tabId) || [];
    if (stack[stack.length - 1] !== content) {
      const next = [...stack.slice(-39), content];
      undoStackRef.current.set(tabId, next);
      redoStackRef.current.set(tabId, []);
    }
  }, []);

  const handleUndo = useCallback(() => {
    if (!activeTab) return false;
    const stack = undoStackRef.current.get(activeTab.id) || [];
    if (stack.length === 0) return false;
    const previousContent = stack[stack.length - 1];
    undoStackRef.current.set(activeTab.id, stack.slice(0, -1));

    const redoStack = redoStackRef.current.get(activeTab.id) || [];
    redoStackRef.current.set(activeTab.id, [...redoStack, activeTab.content || '']);

    onUpdateTab(activeTab.id, { content: previousContent });
    showToast('Undid last change');
    return true;
  }, [activeTab, onUpdateTab, showToast]);

  const handleRedo = useCallback(() => {
    if (!activeTab) return false;
    const redoStack = redoStackRef.current.get(activeTab.id) || [];
    if (redoStack.length === 0) return false;
    const nextContent = redoStack[redoStack.length - 1];
    redoStackRef.current.set(activeTab.id, redoStack.slice(0, -1));

    const undoStack = undoStackRef.current.get(activeTab.id) || [];
    undoStackRef.current.set(activeTab.id, [...undoStack, activeTab.content || '']);

    onUpdateTab(activeTab.id, { content: nextContent });
    showToast('Redid change');
    return true;
  }, [activeTab, onUpdateTab, showToast]);

  /**
   * Word-processor font change:
   * - If text is selected: changes ONLY the selected range's font.
   * - If nothing is selected: sets the active typing font from the caret onward (existing text is untouched).
   */
  const handleToolbarFontChange = useCallback(
    (newFont) => {
      if (!activeTab) return;
      if (cursorEnd > cursorStart) {
        pushUndoSnapshot(activeTab.id, activeTab.content || '');
        const nextStyles = applyStyleToRange(
          parsedDoc.charStyles,
          cursorStart,
          cursorEnd,
          { font: newFont },
          noteFont,
          'default'
        );
        const serialized = serializeNoteContent(
          parsedDoc.rawText,
          nextStyles,
          noteFont,
          'default'
        );
        onUpdateTab(activeTab.id, {
          content: serialized,
          cursorStart,
          cursorEnd,
        });
      } else {
        setTypingStyleOverride((prev) => ({
          ink: prev?.ink || currentCaretStyle.ink,
          font: newFont,
        }));
      }
    },
    [
      activeTab,
      currentCaretStyle.ink,
      cursorEnd,
      cursorStart,
      noteFont,
      onUpdateTab,
      parsedDoc.charStyles,
      parsedDoc.rawText,
      pushUndoSnapshot,
    ]
  );

  /**
   * Word-processor ink color change:
   * - If text is selected: changes ONLY the selected range's ink color.
   * - If nothing is selected: sets the active typing ink from the caret onward (existing text is untouched).
   */
  const handleToolbarInkChange = useCallback(
    (newInk) => {
      if (!activeTab) return;
      if (cursorEnd > cursorStart) {
        pushUndoSnapshot(activeTab.id, activeTab.content || '');
        const nextStyles = applyStyleToRange(
          parsedDoc.charStyles,
          cursorStart,
          cursorEnd,
          { ink: newInk },
          noteFont,
          'default'
        );
        const serialized = serializeNoteContent(
          parsedDoc.rawText,
          nextStyles,
          noteFont,
          'default'
        );
        onUpdateTab(activeTab.id, {
          content: serialized,
          cursorStart,
          cursorEnd,
        });
      } else {
        setTypingStyleOverride((prev) => ({
          font: prev?.font || currentCaretStyle.font,
          ink: newInk,
        }));
      }
    },
    [
      activeTab,
      currentCaretStyle.font,
      cursorEnd,
      cursorStart,
      noteFont,
      onUpdateTab,
      parsedDoc.charStyles,
      parsedDoc.rawText,
      pushUndoSnapshot,
    ]
  );

  /**
   * Unified insertion engine: inserts text at the active tab's current cursor/selection
   * in `rawText` coordinates, preserves existing inline styles, places the cursor
   * immediately after the inserted content, and records an undo snapshot.
   */
  const insertAtCursor = useCallback(
    (textToInsert, options = {}) => {
      const latest = latestStateRef.current;
      if (!latest?.activeTab) return;
      const {
        activeTab: curTab,
        parsedDoc: curDoc,
        cursorStart: curStart,
        cursorEnd: curEnd,
        currentCaretStyle: curStyle,
        noteFont: curFont,
      } = latest;

      pushUndoSnapshot(curTab.id, curTab.content || '');

      const raw = curDoc.rawText;
      let start =
        typeof options.replaceStart === 'number' ? options.replaceStart : curStart;
      let end =
        typeof options.replaceEnd === 'number' ? options.replaceEnd : curEnd;

      start = Math.max(0, Math.min(raw.length, start));
      end = Math.max(start, Math.min(raw.length, end));

      const before = raw.slice(0, start);
      const after = raw.slice(end);

      let prefix = '';
      let suffix = '';
      if (options.block) {
        if (before.length > 0 && !before.endsWith('\n\n')) {
          prefix = before.endsWith('\n') ? '\n' : '\n\n';
        }
        if (after.length > 0 && !after.startsWith('\n')) {
          suffix = '\n\n';
        } else if (after.length === 0) {
          suffix = '\n';
        }
      }

      const insertion = `${prefix}${textToInsert}${suffix}`;
      const nextRaw = `${before}${insertion}${after}`;
      const nextCursor = start + insertion.length;

      const nextStyles = reconcileCharStylesOnEdit(
        raw,
        curDoc.charStyles,
        nextRaw,
        curStyle,
        curFont,
        'default'
      );
      const serialized = serializeNoteContent(nextRaw, nextStyles, curFont, 'default');

      onUpdateTab(curTab.id, {
        content: serialized,
        cursorStart: nextCursor,
        cursorEnd: nextCursor,
      });
    },
    [onUpdateTab, pushUndoSnapshot]
  );

  /**
   * Run AI image-to-LaTeX transcription ("Read the formula"):
   * - Captures the cursor selection range BEFORE awaiting the network call so insertion
   *   lands at the exact spot the user had their caret when they initiated transcription.
   * - If the image contains a formula, inserts rendered LaTeX at the caret.
   * - If the image contains NO math or fails, shows a plain-language notice + retry
   *   and does NOT insert anything into the note.
   * - If the returned LaTeX has a syntax issue, inserts it and flags it in place so the user can edit or retry.
   */
  const runSnapImageToLatex = useCallback(
    async function snapLatex(imageBase64, label = 'frame') {
      if (!imageBase64) return;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Capture cursor range BEFORE any await (ported from soheib-ai-export EditorPane.jsx)
      const savedStart = latestStateRef.current?.cursorStart;
      const savedEnd = latestStateRef.current?.cursorEnd;

      const controller = new AbortController();
      abortControllerRef.current = controller;
      setAiPendingMessage(`Reading formula from ${label}...`);
      setLatexWarningBanner(null);

      try {
        const res = await transcribeImageToLatex({
          imageBase64,
          displayMode: 'block',
          model: aiModel,
          signal: controller.signal,
        });

        insertAtCursor(res.wrapped, {
          replaceStart: savedStart,
          replaceEnd: savedEnd,
          block: res.displayMode === 'block',
        });

        if (!res.isValid) {
          setLatexWarningBanner({
            message: `Inserted formula has a LaTeX syntax issue (${res.error}). Click the formula in your note to edit it, or retry.`,
            retryFn: () => snapLatex(imageBase64, label),
          });
        } else {
          showToast('Inserted transcribed formula into note', 'info', {
            actionLabel: 'Undo',
            onAction: handleUndo,
          });
        }
      } catch (err) {
        if (err?.code === 'ABORTED') {
          showToast('Cancelled formula transcription');
        } else if (err?.code === 'MISSING_KEY' || err?.code === 'INVALID_KEY') {
          showToast(err.userMessage, 'error', {
            actionLabel: 'API key settings',
            onAction: () => onRequireApiKey && onRequireApiKey(),
          });
        } else {
          // Do NOT insert anything when no math is found or when transcription fails
          setLatexWarningBanner({
            message:
              err?.userMessage ||
              'Could not read a mathematical formula from that image. Nothing was inserted.',
            retryFn: () => snapLatex(imageBase64, label),
          });
        }
      } finally {
        setAiPendingMessage(null);
        abortControllerRef.current = null;
      }
    },
    [aiModel, handleUndo, insertAtCursor, onRequireApiKey, showToast]
  );

  // Expose imperative handles to App.jsx
  useImperativeHandle(ref, () => ({
    insertAtCursor,
    snapImageToLatex: runSnapImageToLatex,
    switchToPreview: () => {},
    switchToWrite: () => {},
  }));

  const filteredFormulas = searchFormulaLibrary(slashQuery);

  const handleSelectLocalFormula = (formulaItem) => {
    const wrapped = formulaItem.displayMode
      ? `$$\n${formulaItem.latex}\n$$`
      : `$${formulaItem.latex}$`;

    insertAtCursor(wrapped, {
      replaceStart: slashRange?.start,
      replaceEnd: slashRange?.end,
      block: formulaItem.displayMode,
    });
    setSlashPaletteOpen(false);
    setSlashQuery('');
    setSlashRange(null);
    showToast(`Inserted ${formulaItem.title}`);
  };

  const handleAskAiForFormula = async (queryText) => {
    const cleanDesc = (queryText || slashQuery || '').replace(/^\//, '').trim();
    if (!cleanDesc) return;

    const rangeToReplace = slashRange;
    setSlashPaletteOpen(false);
    setSlashQuery('');
    setSlashRange(null);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setAiPendingMessage(`Generating LaTeX for "${cleanDesc}"...`);
    setLatexWarningBanner(null);

    try {
      const res = await resolveFormulaFromText({
        query: cleanDesc,
        displayMode: 'block',
        model: aiModel,
        signal: controller.signal,
      });

      insertAtCursor(res.wrapped, {
        replaceStart: rangeToReplace?.start,
        replaceEnd: rangeToReplace?.end,
        block: res.displayMode === 'block',
      });

      if (!res.isValid) {
        setLatexWarningBanner({
          message: `Generated formula may need a syntax check (${res.error}).`,
          retryFn: () => handleAskAiForFormula(cleanDesc),
        });
      } else {
        showToast(
          res.source === 'local'
            ? `Inserted ${res.title}`
            : `Inserted AI formula for "${cleanDesc}"`
        );
      }
    } catch (err) {
      if (err?.code === 'ABORTED') {
        showToast('Cancelled formula request');
      } else if (err?.code === 'MISSING_KEY' || err?.code === 'INVALID_KEY') {
        showToast(err.userMessage, 'error', {
          actionLabel: 'API key settings',
          onAction: () => onRequireApiKey && onRequireApiKey(),
        });
      } else {
        showToast(err?.userMessage || 'Could not generate formula.', 'error');
      }
    } finally {
      setAiPendingMessage(null);
      abortControllerRef.current = null;
    }
  };

  const handleLiveDocumentChange = useCallback(
    (nextRawText, nextCursorStart, nextCursorEnd) => {
      if (!activeTab) return;
      pushUndoSnapshot(activeTab.id, activeTab.content || '');

      const nextStyles = reconcileCharStylesOnEdit(
        parsedDoc.rawText,
        parsedDoc.charStyles,
        nextRawText,
        currentCaretStyle,
        noteFont,
        'default'
      );
      const serialized = serializeNoteContent(
        nextRawText,
        nextStyles,
        noteFont,
        'default'
      );

      onUpdateTab(activeTab.id, {
        content: serialized,
        cursorStart: nextCursorStart,
        cursorEnd: nextCursorEnd,
      });

      // Detect slash command typing: '/' at start of line or after space
      const textBeforeCursor = nextRawText.slice(0, nextCursorStart);
      const slashMatch = textBeforeCursor.match(/(?:^|\s)(\/[a-zA-Z0-9_-]*)$/);
      if (slashMatch) {
        const cmdToken = slashMatch[1];
        const tokenStart = nextCursorStart - cmdToken.length;
        setSlashQuery(cmdToken);
        setSlashRange({ start: tokenStart, end: nextCursorStart });
        setSelectedFormulaIdx(0);
        setSlashPaletteOpen(true);
      } else if (slashPaletteOpen && slashRange) {
        setSlashPaletteOpen(false);
        setSlashRange(null);
      }
    },
    [
      activeTab,
      currentCaretStyle,
      noteFont,
      onUpdateTab,
      parsedDoc.charStyles,
      parsedDoc.rawText,
      pushUndoSnapshot,
      slashPaletteOpen,
      slashRange,
    ]
  );

  const handleSelectRange = useCallback(
    (nextStart, nextEnd) => {
      if (!activeTab) return;
      if (nextStart !== cursorStart || nextEnd !== cursorEnd) {
        // Clear any pending collapsed typing override when the user moves the caret
        setTypingStyleOverride(null);
        onUpdateTab(activeTab.id, {
          cursorStart: nextStart,
          cursorEnd: nextEnd,
        });
      }
    },
    [activeTab, cursorEnd, cursorStart, onUpdateTab]
  );

  const handleEditorKeyDown = (e) => {
    if (slashPaletteOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const maxIdx = Math.max(0, filteredFormulas.length);
        setSelectedFormulaIdx((prev) => (prev + 1) % (maxIdx + 1));
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const maxIdx = Math.max(0, filteredFormulas.length);
        setSelectedFormulaIdx((prev) => (prev - 1 + (maxIdx + 1)) % (maxIdx + 1));
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredFormulas[selectedFormulaIdx]) {
          handleSelectLocalFormula(filteredFormulas[selectedFormulaIdx]);
        } else {
          handleAskAiForFormula(slashQuery);
        }
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashPaletteOpen(false);
        setSlashRange(null);
        return true;
      }
    }

    // Support Ctrl+Z / Cmd+Z undo and Ctrl+Y / Cmd+Shift+Z redo
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      if (e.shiftKey) {
        e.preventDefault();
        handleRedo();
        return true;
      }
      const stack = undoStackRef.current.get(activeTab?.id) || [];
      if (stack.length > 0) {
        e.preventDefault();
        handleUndo();
        return true;
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      handleRedo();
      return true;
    }

    return false;
  };

  const handleInsertTimestampFromToolbar = () => {
    const timeLabel = currentTimeStr || '00:00';
    insertAtCursor(`[${timeLabel}](#t=${timeLabel}) `);
    showToast(`Inserted timestamp ${timeLabel}`);
  };

  /**
   * Fix 3: Uploading an image adds it to the captured frames tray so the user can choose
   * whether to add it to the note, read its formula, or send it to chat (no auto-insert).
   */
  const handleFileChangeForTray = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Select a valid image file.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const compressed = await compressImageDataUrl(reader.result, {
          maxWidth: 1280,
          maxHeight: 720,
          quality: 0.85,
        });
        const cleanName = file.name.replace(/\.[^/.]+$/, '').slice(0, 20);
        const newFrame = {
          id: nextUploadFrameId(),
          timestamp: currentTimeStr || '00:00',
          seconds: Math.floor(currentSeconds || 0),
          videoUrl: youtubeUrl,
          label: cleanName,
          caption: `Frame at ${currentTimeStr || '00:00'}, ${cleanName}`,
          dataUrl: compressed.dataUrl,
          base64: compressed.base64,
        };
        onUploadImage(newFrame);
        showToast('Added image to captured frames tray — click it to choose an action');
      } catch {
        showToast('Could not process image.', 'error');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSnapUploadedImage = (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const compressed = await compressImageDataUrl(reader.result);
        setSlashPaletteOpen(false);
        await runSnapImageToLatex(compressed.base64, file.name);
      } catch {
        showToast('Could not read math image.', 'error');
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const wordCount = useMemo(
    () => parsedDoc.rawText.split(/\s+/).filter(Boolean).length,
    [parsedDoc.rawText]
  );

  return (
    <div
      id="notes-panel"
      aria-label="Notes workspace"
      className="relative flex-1 flex flex-col min-h-[380px] rounded-[8px] overflow-hidden transition-colors border"
      style={{
        backgroundColor: 'var(--pn)',
        borderColor: 'var(--bd)',
      }}
    >
      {/* 1. Note Tabs Strip */}
      <NoteTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={onSelectTab}
        onNewTab={onNewTab}
        onCloseTab={onCloseTab}
        onRenameTab={onRenameTab}
        onReorderTabs={onReorderTabs}
      />

      {/* 2. Formatting Toolbar (Single Live Surface — no Write/Preview toggle) */}
      <NoteToolbar
        noteFont={currentCaretStyle.font}
        onFontChange={handleToolbarFontChange}
        activeInk={currentCaretStyle.ink}
        onInkChange={handleToolbarInkChange}
        hasSelection={hasSelection}
        onInsertImageClick={() => fileInputRef.current?.click()}
        onInsertTimestampClick={handleInsertTimestampFromToolbar}
        onOpenFormulaPalette={() => {
          setSlashRange(null);
          setSlashQuery('');
          setSelectedFormulaIdx(0);
          setSlashPaletteOpen((prev) => !prev);
        }}
        currentTimeStr={currentTimeStr}
      />

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChangeForTray}
      />
      <input
        ref={snapImageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleSnapUploadedImage}
      />

      {/* AI Pending Status Bar (with Cancel button) */}
      {aiPendingMessage && (
        <div
          role="status"
          aria-live="polite"
          className="px-4 py-2 border-b flex items-center justify-between gap-2 text-[12px]"
          style={{
            backgroundColor: 'var(--rz)',
            borderColor: 'var(--bd)',
            color: 'var(--tx)',
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: 'var(--accent)' }}
            />
            <span>{aiPendingMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => abortControllerRef.current?.abort()}
            className="px-2 py-0.5 rounded-[4px] text-[11.5px] font-medium cursor-pointer"
            style={{
              backgroundColor: 'var(--pn)',
              border: '1px solid var(--bd2)',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* LaTeX Warning / Retry Banner */}
      {latexWarningBanner && (
        <div
          role="alert"
          className="px-4 py-2 border-b flex items-center justify-between gap-2 text-[12px] flex-wrap"
          style={{
            backgroundColor: 'var(--callout-bg)',
            borderColor: 'var(--bd2)',
            color: 'var(--tx)',
          }}
        >
          <span>{latexWarningBanner.message}</span>
          <div className="flex items-center gap-2 shrink-0">
            {latexWarningBanner.retryFn && (
              <button
                type="button"
                onClick={latexWarningBanner.retryFn}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[4px] text-[11.5px] font-medium cursor-pointer"
                style={{
                  backgroundColor: 'var(--rz)',
                  border: '1px solid var(--bd2)',
                }}
              >
                <RetryIcon size={11} />
                <span>Retry</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setLatexWarningBanner(null)}
              className="text-[var(--mu)] hover:text-[var(--tx)] px-1 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Floating Formula / Slash-Command & Snap-to-LaTeX Palette */}
      {slashPaletteOpen && (
        <div
          role="dialog"
          aria-label="Formula and Snap-to-LaTeX palette"
          className="z-30 mx-4 mt-2 rounded-[8px] overflow-hidden flex flex-col max-h-[310px]"
          style={{
            backgroundColor: 'var(--rz)',
            border: '1px solid var(--bd2)',
          }}
        >
          {/* Search & AI Formula Input Header */}
          <div
            className="flex items-center gap-2 px-3 py-2 border-b"
            style={{ borderColor: 'var(--bd)' }}
          >
            <SigmaIcon size={14} className="text-[var(--accent-text)] shrink-0" />
            <input
              type="text"
              value={slashQuery}
              onChange={(e) => {
                setSlashQuery(e.target.value);
                setSelectedFormulaIdx(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filteredFormulas[selectedFormulaIdx]) {
                    handleSelectLocalFormula(filteredFormulas[selectedFormulaIdx]);
                  } else {
                    handleAskAiForFormula(slashQuery);
                  }
                } else if (e.key === 'Escape') {
                  setSlashPaletteOpen(false);
                }
              }}
              placeholder="Search formula (/gd, /softmax, /bayes) or describe one for AI..."
              aria-label="Search formulas or describe a formula for AI"
              className="flex-1 bg-transparent text-[12.5px] text-[var(--tx)] placeholder:text-[var(--mu)] outline-none"
            />
            <button
              type="button"
              onClick={() => snapImageInputRef.current?.click()}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-[4px] text-[11px] font-medium cursor-pointer shrink-0"
              style={{
                backgroundColor: 'var(--pn)',
                color: 'var(--tx)',
                border: '1px solid var(--bd2)',
              }}
            >
              <UploadIcon size={11} />
              <span>Read formula from image</span>
            </button>
            <button
              type="button"
              aria-label="Close formula palette"
              onClick={() => setSlashPaletteOpen(false)}
              className="text-[var(--mu)] hover:text-[var(--tx)] p-1 cursor-pointer"
            >
              <CloseIcon size={12} />
            </button>
          </div>

          {/* Formula Options List */}
          <div className="overflow-y-auto p-1.5 space-y-0.5 text-[12.5px]">
            {filteredFormulas.map((item, idx) => {
              const isSelected = idx === selectedFormulaIdx;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectLocalFormula(item)}
                  onMouseEnter={() => setSelectedFormulaIdx(idx)}
                  className="w-full text-left px-2.5 py-1.5 rounded-[5px] flex items-center justify-between gap-3 cursor-pointer"
                  style={{
                    backgroundColor: isSelected ? 'var(--pn)' : 'transparent',
                    color: 'var(--tx)',
                  }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="font-mono text-[11.5px] font-semibold"
                        style={{ color: 'var(--accent-text)' }}
                      >
                        {item.command}
                      </span>
                      <span className="font-medium truncate">{item.title}</span>
                      <span className="text-[10.5px] text-[var(--mu)] hidden sm:inline">
                        · {item.category}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-[var(--mu)] truncate mt-0.5">
                      {item.latex}
                    </div>
                  </div>
                  <span className="text-[10.5px] text-[var(--mu)] shrink-0">Instant</span>
                </button>
              );
            })}

            {/* Tier 2: Ask AI to generate formula from natural language */}
            {slashQuery.replace(/^\//, '').trim().length > 0 && (
              <button
                type="button"
                onClick={() => handleAskAiForFormula(slashQuery)}
                className="w-full text-left px-2.5 py-2 rounded-[5px] flex items-center justify-between gap-3 cursor-pointer mt-1 border-t"
                style={{
                  backgroundColor:
                    selectedFormulaIdx === filteredFormulas.length ? 'var(--pn)' : 'transparent',
                  borderColor: 'var(--bd)',
                  color: 'var(--tx)',
                }}
              >
                <div className="flex items-center gap-2">
                  <SigmaIcon size={13} className="text-[var(--accent-text)]" />
                  <span>
                    Ask AI to write LaTeX for:{' '}
                    <strong>&ldquo;{slashQuery.replace(/^\//, '').trim()}&rdquo;</strong>
                  </span>
                </div>
                <span className="text-[11px] text-[var(--accent-text)] font-medium shrink-0">
                  Enter ↵
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. Single Live Note Surface (Obsidian-style rendered & editable in place) */}
      <div
        id={`panel-${activeTab?.id}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTab?.id}`}
        className="note-page-container flex-1 min-h-0 flex flex-col overflow-y-auto"
      >
        <div className="flex-1 min-h-0">
          <LiveNoteEditor
            rawText={parsedDoc.rawText}
            charStyles={parsedDoc.charStyles}
            defaultFont={noteFont}
            activeTypingStyle={currentCaretStyle}
            cursorStart={cursorStart}
            cursorEnd={cursorEnd}
            onChangeDocument={handleLiveDocumentChange}
            onSelectRange={handleSelectRange}
            onSeekTimestamp={onSeekTimestamp}
            onInspectFrame={onInspectFrame}
            frames={frames}
            mediaById={mediaById}
            onKeyDown={handleEditorKeyDown}
          />
        </div>

        {/* Subtle status footer */}
        <div
          className="no-print px-6 py-1.5 text-[11px] text-[var(--mu)] border-t flex items-center justify-between select-none tabular-nums flex-wrap gap-2"
          style={{ borderColor: 'var(--bd)' }}
        >
          <span>
            Live surface · Click any line or formula to edit · Type{' '}
            <code className="px-1 py-0.2 rounded bg-[var(--rz)] text-[var(--tx)]">/</code> for
            formulas
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleUndo}
              className="hover:text-[var(--tx)] cursor-pointer underline"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={handleRedo}
              className="hover:text-[var(--tx)] cursor-pointer underline"
            >
              Redo
            </button>
            <span>{wordCount} words</span>
          </div>
        </div>
      </div>
    </div>
  );
});
