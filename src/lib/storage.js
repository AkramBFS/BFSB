/**
 * ML-Pad Storage Engine
 *
 * Strategy:
 * 1. Lightweight structured metadata (tabs, settings, chat history, frame metadata)
 *    is stored in versioned localStorage keys (`mlpad.v2.*`).
 * 2. Binary/base64 frame images are downscaled & JPEG-compressed and stored in IndexedDB
 *    (`mlpad_media_db` -> `frames` store) so user notes never hit the ~5MB localStorage wall.
 * 3. If IndexedDB or localStorage is unavailable (e.g., strict private browsing), an in-memory
 *    fallback store keeps the session functional and notifies the user calmly.
 * 4. The Gemini API key is stored separately under `mlpad.secret.apiKey` and never included
 *    in workspace exports or logs.
 */

export const SCHEMA_VERSION = 2;
const STORAGE_PREFIX = 'mlpad.';
const API_KEY_STORAGE_KEY = 'mlpad.secret.apiKey';
const IDB_NAME = 'mlpad_media_db';
const IDB_VERSION = 1;
const IDB_STORE = 'frames';

// localStorage soft warning threshold: 3.8 MB (out of typical 5 MB limit)
const LS_WARNING_BYTES = 3.8 * 1024 * 1024;
const LS_LIMIT_BYTES = 4.8 * 1024 * 1024;

const memoryMediaCache = new Map();
const memoryKvFallback = new Map();
let storageWarningIssued = false;

/**
 * Open IndexedDB connection for storing compressed frame images.
 */
function openMediaDb() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    try {
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open error'));
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Save a frame's image payload { id, dataUrl, aiBase64 } into IndexedDB + memory cache.
 */
export async function saveFrameMedia(id, { dataUrl, base64 }) {
  if (!id) return { ok: true };
  memoryMediaCache.set(id, { dataUrl, base64 });

  try {
    const db = await openMediaDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put({ id, dataUrl, base64, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return { ok: true, backend: 'idb' };
  } catch {
    // IndexedDB blocked or full: keep in memory cache
    return { ok: true, backend: 'memory' };
  }
}

/**
 * Load a frame's image payload by ID from memory cache or IndexedDB.
 */
export async function loadFrameMedia(id) {
  if (!id) return null;
  if (memoryMediaCache.has(id)) {
    return memoryMediaCache.get(id);
  }
  try {
    const db = await openMediaDb();
    const record = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (record) {
      memoryMediaCache.set(id, { dataUrl: record.dataUrl, base64: record.base64 });
      return { dataUrl: record.dataUrl, base64: record.base64 };
    }
  } catch {
    // Fall back to null
  }
  return null;
}

/**
 * Delete a frame's media from IndexedDB and memory cache.
 */
export async function deleteFrameMedia(id) {
  if (!id) return;
  memoryMediaCache.delete(id);
  try {
    const db = await openMediaDb();
    await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // Ignore
  }
}

/**
 * Clear all media in IndexedDB and memory cache.
 */
export async function clearAllFrameMedia() {
  memoryMediaCache.clear();
  try {
    const db = await openMediaDb();
    await new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  } catch {
    // Ignore
  }
}

/**
 * Downscale and JPEG-compress any image dataUrl or HTMLCanvasElement/HTMLImageElement
 * so it stays fast for AI requests and compact for browser storage.
 */
export function compressImageDataUrl(sourceDataUrl, { maxWidth = 1280, maxHeight = 720, quality = 0.84 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      const clean = String(sourceDataUrl || '').replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
      resolve({ dataUrl: sourceDataUrl, base64: clean, width: maxWidth, height: maxHeight });
      return;
    }

    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth || img.width || 640;
        let h = img.naturalHeight || img.height || 360;

        if (w > maxWidth || h > maxHeight) {
          const ratio = Math.min(maxWidth / w, maxHeight / h);
          w = Math.max(1, Math.round(w * ratio));
          h = Math.max(1, Math.round(h * ratio));
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Fill subtle dark backing in case source is transparent PNG
          ctx.fillStyle = '#141311';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
        }

        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64 = compressedDataUrl.replace(/^data:image\/jpeg;base64,/, '');
        resolve({ dataUrl: compressedDataUrl, base64, width: w, height: h });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Could not decode image data.'));
    img.src = sourceDataUrl;
  });
}

/**
 * Estimate current localStorage usage in bytes.
 */
export function getLocalStorageBytes() {
  if (typeof window === 'undefined' || !window.localStorage) return 0;
  try {
    let total = 0;
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i) || '';
      const v = window.localStorage.getItem(k) || '';
      total += (k.length + v.length) * 2;
    }
    return total;
  } catch {
    return 0;
  }
}

/**
 * Check storage health and return usage summary.
 */
export function getStorageStatus() {
  const bytes = getLocalStorageBytes();
  const percent = Math.min(100, Math.round((bytes / LS_LIMIT_BYTES) * 100));
  const nearLimit = bytes >= LS_WARNING_BYTES;
  return {
    bytes,
    percent,
    nearLimit,
    formattedKB: `${Math.round(bytes / 1024)} KB`,
  };
}

/**
 * Safely read a JSON key from localStorage.
 * Returns { value, corrupted } so the caller can warn the user if corrupted data was skipped.
 */
export function readStorageKeySafely(key, fallbackValue) {
  const fullKey = STORAGE_PREFIX + key;
  if (typeof window === 'undefined') {
    return { value: fallbackValue, corrupted: false };
  }
  try {
    const raw = window.localStorage.getItem(fullKey);
    if (raw === null) {
      if (memoryKvFallback.has(fullKey)) {
        return { value: memoryKvFallback.get(fullKey), corrupted: false };
      }
      return { value: fallbackValue, corrupted: false };
    }
    const parsed = JSON.parse(raw);
    return { value: parsed, corrupted: false };
  } catch {
    return { value: fallbackValue, corrupted: true };
  }
}

/**
 * Safely write a JSON key to localStorage with QuotaExceeded & private-mode handling.
 * Returns { ok, nearLimit, quotaExceeded, error }
 */
export function writeStorageKeySafely(key, value) {
  const fullKey = STORAGE_PREFIX + key;
  memoryKvFallback.set(fullKey, value);

  if (typeof window === 'undefined') {
    return { ok: true, nearLimit: false, quotaExceeded: false };
  }

  try {
    const serialized = JSON.stringify(value);
    window.localStorage.setItem(fullKey, serialized);
    const status = getStorageStatus();
    return {
      ok: true,
      nearLimit: status.nearLimit,
      quotaExceeded: false,
      percent: status.percent,
    };
  } catch (err) {
    const isQuota =
      err &&
      (err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        err.code === 22 ||
        err.code === 1014);
    return {
      ok: false,
      nearLimit: true,
      quotaExceeded: Boolean(isQuota),
      error: isQuota
        ? 'Browser storage is full. Export your notes or delete old captured frames to free space.'
        : 'Browser local storage is unavailable in this window. Changes are kept in memory for this session.',
    };
  }
}

/**
 * API Key management (stored separately, never exported or logged).
 */
export function getStoredApiKey() {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(API_KEY_STORAGE_KEY) || memoryKvFallback.get(API_KEY_STORAGE_KEY) || '';
  } catch {
    return memoryKvFallback.get(API_KEY_STORAGE_KEY) || '';
  }
}

export function setStoredApiKey(apiKey) {
  const cleaned = (apiKey || '').trim();
  memoryKvFallback.set(API_KEY_STORAGE_KEY, cleaned);
  if (typeof window === 'undefined') return true;
  try {
    if (cleaned) {
      window.localStorage.setItem(API_KEY_STORAGE_KEY, cleaned);
    } else {
      window.localStorage.removeItem(API_KEY_STORAGE_KEY);
    }
    return true;
  } catch {
    return false;
  }
}

export function getDemoApiKey() {
  try {
    return (import.meta.env && import.meta.env.VITE_DEMO_GEMINI_API_KEY) || '';
  } catch {
    return '';
  }
}

export function getEffectiveApiKey() {
  const userKey = getStoredApiKey();
  if (userKey) return { key: userKey, source: 'user' };
  const demoKey = getDemoApiKey();
  if (demoKey) return { key: demoKey, source: 'demo' };
  return { key: '', source: 'none' };
}

/**
 * Clear all workspace keys (except API key unless includeApiKey is true)
 */
export async function resetWorkspaceStorage({ includeApiKey = false } = {}) {
  await clearAllFrameMedia();
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const keysToRemove = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX)) {
          if (!includeApiKey && k === API_KEY_STORAGE_KEY) continue;
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => window.localStorage.removeItem(k));
    } catch {
      // Ignore
    }
  }
  memoryKvFallback.clear();
  storageWarningIssued = false;
}

export function hasIssuedStorageWarning() {
  return storageWarningIssued;
}

export function markStorageWarningIssued() {
  storageWarningIssued = true;
}
