import { useState, useEffect, useRef, useCallback } from 'react';
import {
  SCHEMA_VERSION,
  readStorageKeySafely,
  writeStorageKeySafely,
  saveFrameMedia,
  loadFrameMedia,
  deleteFrameMedia,
  resetWorkspaceStorage,
  hasIssuedStorageWarning,
  markStorageWarningIssued,
} from '../lib/storage.js';
import { DEFAULT_AI_MODEL } from '../lib/aiService.js';
import { normalizeSwatchKey } from '../lib/contrast.js';

/**
 * Clean welcoming initial state when nothing is saved in the browser.
 * Never populates fake messages or fake frames on a fresh profile.
 */
export function createCleanInitialState() {
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';

  const welcomeTabId = 'tab-welcome';

  return {
    schemaVersion: SCHEMA_VERSION,
    theme: prefersDark,
    accent: 'cobalt',
    noteFont: 'Newsreader',
    editorFont: 'JetBrains Mono',
    customColors: {
      dark: null,
      light: null,
    },
    aiModel: DEFAULT_AI_MODEL,
    youtubeUrl: 'https://www.youtube.com/watch?v=IHZwWFHWa-w',
    videoState: {
      sourceType: 'youtube', // 'youtube' | 'local'
      title: 'Gradient descent, how neural networks learn',
      lastPosition: 0,
      localFileName: '',
    },
    activeTabId: welcomeTabId,
    tabs: [
      {
        id: welcomeTabId,
        title: 'Untitled note',
        content: `# Untitled note\n\nPaste a YouTube lecture on the left or open a local video file. Type \`/\` on any line to insert common ML formulas like\n\n$$\\theta_j := \\theta_j - \\alpha \\frac{\\partial J(\\theta)}{\\partial \\theta_j}$$\n\nor capture a video frame to add it to your notes or transcribe its equations.`,
        cursorStart: 16,
        cursorEnd: 16,
      },
    ],
    frames: [],
    chatMessages: [],
  };
}

/**
 * Pre-tested demo workspace with a real 3Blue1Brown Gradient Descent lecture,
 * sample bilingual + math note, and sample math slide for instant 2-minute demos.
 */
export function createDemoWorkspaceState(currentTheme = 'dark', sampleFrame = null) {
  return {
    schemaVersion: SCHEMA_VERSION,
    theme: currentTheme,
    accent: 'cobalt',
    noteFont: 'Newsreader',
    editorFont: 'JetBrains Mono',
    customColors: {
      dark: null,
      light: null,
    },
    aiModel: DEFAULT_AI_MODEL,
    youtubeUrl: 'https://www.youtube.com/watch?v=IHZwWFHWa-w',
    videoState: {
      sourceType: 'youtube',
      title: 'Gradient descent, explained',
      lastPosition: 754,
      localFileName: '',
    },
    activeTabId: 'demo-tab-1',
    tabs: [
      {
        id: 'demo-tab-1',
        title: 'Gradient descent',
        content: `# Gradient descent\n\nLecture 3 · Optimization & Loss Landscapes\n\n> [12:34](#t=12:34) Take small steps downhill along the negative gradient until the cost stops changing.\n\nThe update repeats for every parameter simultaneously. A learning rate $\\alpha$ that is too large overshoots the valley; too small and convergence crawls.\n\n$$\\theta_j := \\theta_j - \\alpha \\frac{\\partial J(\\theta)}{\\partial \\theta_j}$$\n\n* Start from random initialization $\\theta^{(0)}$, evaluate the gradient $\\nabla J(\\theta)$\n* Step opposite to the gradient, scaled by learning rate $\\alpha$ at [18:02](#t=18:02)\n\n${
          sampleFrame ? `![Frame at ${sampleFrame.timestamp}, cost curve](frame://${sampleFrame.id})` : ''
        }`,
        cursorStart: 0,
        cursorEnd: 0,
      },
      {
        id: 'demo-tab-2',
        title: 'Cost function',
        content: `# Cost function & regularization\n\n> [08:15](#t=08:15) The squared error cost function measures total prediction discrepancy across $m$ training examples.\n\n$$J(\\theta) = \\frac{1}{2m} \\sum_{i=1}^{m} \\left(h_\\theta(x^{(i)}) - y^{(i)}\\right)^2 + \\frac{\\lambda}{2m} \\sum_{j=1}^{n} \\theta_j^2$$\n\nملاحظة حول الانحدار التدريجي (Bilingual Note):\nيضمن خطأ متوسط المربعات (MSE) وجود نهاية صغرى عالمية وحيدة في الانحدار الخطي بسبب التحدب.`,
        cursorStart: 0,
        cursorEnd: 0,
      },
    ],
    frames: sampleFrame ? [sampleFrame] : [],
    chatMessages: [],
  };
}

/**
 * Extract all `frame://<id>` tokens referenced across an array of note tabs.
 */
export function extractReferencedFrameIds(tabs = []) {
  const ids = new Set();
  if (!Array.isArray(tabs)) return ids;
  const re = /frame:\/\/([^)\s]+)/g;
  for (const tab of tabs) {
    const content = tab?.content || '';
    let m;
    while ((m = re.exec(content)) !== null) {
      if (m[1]) ids.add(m[1].trim());
    }
  }
  return ids;
}

/**
 * Validate and sanitize loaded workspace state defensively.
 * Migrates legacy swatch names (`gold`, `rose`, `sage`, `sky`) to stationery ink names.
 */
function hydrateWorkspaceSafely() {
  const clean = createCleanInitialState();
  const skipped = [];

  if (typeof window === 'undefined' || !window.localStorage) {
    return { state: clean, skipped };
  }

  let hasSavedData = false;
  try {
    hasSavedData =
      window.localStorage.getItem('mlpad.schemaVersion') !== null ||
      window.localStorage.getItem('mlpad.tabs') !== null;
  } catch {
    return { state: clean, skipped: ['localStorage unavailable'] };
  }

  if (!hasSavedData) {
    return { state: clean, skipped };
  }

  const read = (key, fallback, validator) => {
    const res = readStorageKeySafely(key, fallback);
    if (res.corrupted) {
      skipped.push(key);
      return fallback;
    }
    if (validator && !validator(res.value)) {
      skipped.push(key);
      return fallback;
    }
    return res.value;
  };

  const savedVersion = read('schemaVersion', 1, (v) => typeof v === 'number');

  const tabs = read(
    'tabs',
    clean.tabs,
    (arr) =>
      Array.isArray(arr) &&
      arr.length > 0 &&
      arr.every(
        (t) =>
          t &&
          typeof t.id === 'string' &&
          typeof t.title === 'string' &&
          typeof t.content === 'string'
      )
  );

  let chatMessages = read(
    'chatMessages',
    [],
    (arr) =>
      Array.isArray(arr) &&
      arr.every((m) => m && typeof m.id === 'string' && typeof m.text === 'string')
  );
  if (savedVersion < 2 && chatMessages.length === 2 && chatMessages[0]?.id === 'msg-1') {
    chatMessages = [];
  }

  let frames = read(
    'frames',
    [],
    (arr) => Array.isArray(arr) && arr.every((f) => f && typeof f.id === 'string')
  );
  if (savedVersion < 2 && frames.every((f) => !f.dataUrl && !f.hasStoredMedia)) {
    frames = [];
  }

  const activeTabId = read('activeTabId', tabs[0].id, (id) => typeof id === 'string');
  const resolvedActiveTabId = tabs.some((t) => t.id === activeTabId)
    ? activeTabId
    : tabs[0].id;

  const theme = read('theme', clean.theme, (t) => t === 'dark' || t === 'light');
  const rawAccent = read('accent', clean.accent, (a) => typeof a === 'string');
  const accent = normalizeSwatchKey(rawAccent);

  const noteFont = read(
    'noteFont',
    clean.noteFont,
    (f) => ['Newsreader', 'Lora', 'DM Sans', 'Kalam', 'Cairo', 'Tajawal'].includes(f)
  );
  const editorFont = read(
    'editorFont',
    clean.editorFont,
    (f) => ['JetBrains Mono', 'Fira Code', 'System Mono'].includes(f)
  );
  const customColors = read(
    'customColors',
    clean.customColors,
    (c) => c && typeof c === 'object'
  );
  const aiModel = read(
    'aiModel',
    DEFAULT_AI_MODEL,
    (m) => typeof m === 'string' && m.length > 0
  );
  const youtubeUrl = read('youtubeUrl', clean.youtubeUrl, (u) => typeof u === 'string');
  const videoState = read(
    'videoState',
    clean.videoState,
    (vs) => vs && typeof vs === 'object'
  );

  return {
    state: {
      schemaVersion: SCHEMA_VERSION,
      theme,
      accent,
      noteFont,
      editorFont,
      customColors: {
        dark: customColors?.dark || null,
        light: customColors?.light || null,
      },
      aiModel,
      youtubeUrl,
      videoState: {
        ...clean.videoState,
        ...videoState,
        sourceType: 'youtube',
      },
      activeTabId: resolvedActiveTabId,
      tabs: tabs.map((t) => ({
        ...t,
        cursorStart: typeof t.cursorStart === 'number' ? t.cursorStart : 0,
        cursorEnd: typeof t.cursorEnd === 'number' ? t.cursorEnd : 0,
      })),
      frames,
      chatMessages,
    },
    skipped,
  };
}

/**
 * Custom hook managing workspace state, 500ms debounced auto-save, IndexedDB image hydration
 * (for both the frames tray and any images already placed in notes), storage limit warnings,
 * and immediate save/reset actions.
 */
export function useDebouncedWorkspaceState({ onStorageWarning } = {}) {
  const [hydrationResult] = useState(() => hydrateWorkspaceSafely());
  const [state, setState] = useState(hydrationResult.state);
  const [skippedKeys] = useState(hydrationResult.skipped);
  const [saveStatus, setSaveStatus] = useState('Saved to this browser');
  const [mediaById, setMediaById] = useState({});

  const timerRef = useRef(null);
  const stateRef = useRef(state);
  const onWarningRef = useRef(onStorageWarning);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    onWarningRef.current = onStorageWarning;
  }, [onStorageWarning]);

  // Rehydrate frame images from IndexedDB on mount and whenever notes reference a frame:// ID
  useEffect(() => {
    let cancelled = false;
    async function rehydrateMedia() {
      const currentFrames = stateRef.current.frames || [];
      const referencedIds = extractReferencedFrameIds(stateRef.current.tabs);
      for (const f of currentFrames) {
        if (f?.id) referencedIds.add(f.id);
      }

      if (referencedIds.size === 0) return;

      const loadedMap = {};
      for (const id of referencedIds) {
        const trayMatch = currentFrames.find((f) => f.id === id);
        if (trayMatch?.dataUrl && trayMatch?.base64) {
          loadedMap[id] = { dataUrl: trayMatch.dataUrl, base64: trayMatch.base64 };
          continue;
        }
        const stored = await loadFrameMedia(id);
        if (stored && (stored.dataUrl || stored.base64)) {
          loadedMap[id] = stored;
        }
      }

      if (cancelled) return;

      setMediaById((prev) => ({ ...prev, ...loadedMap }));

      let updatedTray = false;
      const hydratedFrames = currentFrames.map((frame) => {
        if (frame.dataUrl && frame.base64) return frame;
        const m = loadedMap[frame.id];
        if (m) {
          updatedTray = true;
          return { ...frame, dataUrl: m.dataUrl, base64: m.base64 };
        }
        return frame;
      });

      if (updatedTray) {
        setState((prev) => ({
          ...prev,
          frames: hydratedFrames,
        }));
      }
    }
    rehydrateMedia();
    return () => {
      cancelled = true;
    };
  }, [state.tabs.length]);

  const registerMediaInCache = useCallback((id, mediaObj) => {
    if (!id || !mediaObj) return;
    setMediaById((prev) => ({ ...prev, [id]: mediaObj }));
  }, []);

  /**
   * Persist current workspace to localStorage + IndexedDB media store.
   */
  const persistWorkspace = useCallback((snapshot) => {
    const target = snapshot || stateRef.current;

    const lightweightFrames = (target.frames || []).map((f) => {
      if (f.dataUrl || f.base64) {
        saveFrameMedia(f.id, { dataUrl: f.dataUrl, base64: f.base64 });
      }
      return {
        id: f.id,
        timestamp: f.timestamp,
        seconds: f.seconds,
        videoUrl: f.videoUrl,
        label: f.label,
        caption: f.caption,
        hasStoredMedia: true,
      };
    });

    const lightweightChat = (target.chatMessages || [])
      .slice(-30)
      .map((m, idx, arr) => ({
        ...m,
        imageBase64: idx >= arr.length - 2 ? m.imageBase64 : undefined,
      }));

    const writes = [
      writeStorageKeySafely('schemaVersion', SCHEMA_VERSION),
      writeStorageKeySafely('tabs', target.tabs),
      writeStorageKeySafely('activeTabId', target.activeTabId),
      writeStorageKeySafely('theme', target.theme),
      writeStorageKeySafely('accent', target.accent),
      writeStorageKeySafely('noteFont', target.noteFont),
      writeStorageKeySafely('editorFont', target.editorFont),
      writeStorageKeySafely('customColors', target.customColors),
      writeStorageKeySafely('aiModel', target.aiModel),
      writeStorageKeySafely('youtubeUrl', target.youtubeUrl),
      writeStorageKeySafely('videoState', target.videoState),
      writeStorageKeySafely('frames', lightweightFrames),
      writeStorageKeySafely('chatMessages', lightweightChat),
    ];

    const failed = writes.find((w) => !w.ok);
    const nearLimit = writes.some((w) => w.nearLimit);

    if (failed) {
      setSaveStatus(failed.quotaExceeded ? 'Storage full' : 'Saved in session');
      if (onWarningRef.current) {
        onWarningRef.current(failed.error);
      }
      return { ok: false, error: failed.error };
    }

    if (nearLimit && !hasIssuedStorageWarning()) {
      markStorageWarningIssued();
      if (onWarningRef.current) {
        onWarningRef.current(
          'Browser storage is over 80% full. Consider exporting old notes or deleting unused frames.'
        );
      }
    }

    setSaveStatus('Saved to this browser');
    return { ok: true };
  }, []);

  /**
   * Force immediate synchronous save.
   */
  const saveNow = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return persistWorkspace(stateRef.current);
  }, [persistWorkspace]);

  /**
   * Update state slice and schedule 500ms debounced auto-save.
   */
  const updateState = useCallback(
    (sliceOrUpdater) => {
      setSaveStatus('Unsaved changes');
      setState((prev) => {
        const nextSlice =
          typeof sliceOrUpdater === 'function' ? sliceOrUpdater(prev) : sliceOrUpdater;
        const nextState = { ...prev, ...nextSlice };
        stateRef.current = nextState;
        return nextState;
      });

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      setSaveStatus('Saving...');
      timerRef.current = setTimeout(() => {
        persistWorkspace(stateRef.current);
        timerRef.current = null;
      }, 500);
    },
    [persistWorkspace]
  );

  /**
   * Remove a frame from the Captured Frames tray.
   * Fix 3: If the frame's image is already placed inside any note tab (`frame://<id>`),
   * retain its binary media in IndexedDB and `mediaById` so the note's image never breaks!
   */
  const removeFrameById = useCallback(
    (frameId) => {
      const referencedInNotes = extractReferencedFrameIds(stateRef.current.tabs);
      if (!referencedInNotes.has(frameId)) {
        deleteFrameMedia(frameId);
      }
      updateState((prev) => ({
        frames: prev.frames.filter((f) => f.id !== frameId),
      }));
    },
    [updateState]
  );

  /**
   * Reset workspace to a clean state.
   */
  const resetToCleanWorkspace = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await resetWorkspaceStorage({ includeApiKey: false });
    const fresh = createCleanInitialState();
    stateRef.current = fresh;
    setState(fresh);
    setMediaById({});
    persistWorkspace(fresh);
  }, [persistWorkspace]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    state,
    updateState,
    saveStatus,
    saveNow,
    skippedKeys,
    mediaById,
    registerMediaInCache,
    removeFrameById,
    resetToCleanWorkspace,
  };
}
