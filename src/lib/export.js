/**
 * Export helpers for ML-Pad notes.
 * Supports self-contained Markdown file saving (via showSaveFilePicker with Blob fallback)
 * and PDF export via window.print() with white-paper print isolation.
 */

/**
 * Sanitize a string for use as a filesystem filename.
 */
export function sanitizeFilename(name, extension = 'md') {
  const sanitized = (name || 'Untitled')
    .trim()
    .toLowerCase()
    .replace(/[^\w\u0600-\u06FF\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${sanitized || 'note'}.${extension}`;
}

/**
 * Resolve internal `frame://<id_or_timestamp>` image links into self-contained
 * base64 data URLs so exported Markdown files open with all images intact anywhere,
 * including frames that were removed from the tray but remain in IndexedDB (`mediaById`).
 */
export function resolveMarkdownImagesForExport(
  markdownContent = '',
  frames = [],
  mediaById = {}
) {
  if (!markdownContent) {
    return markdownContent;
  }

  return markdownContent.replace(
    /!\[([^\]]*)\]\((frame:\/\/[^)]+)\)/g,
    (fullMatch, altText, frameRef) => {
      const token = frameRef.replace(/^frame:\/\//, '').trim();
      const matched = Array.isArray(frames)
        ? frames.find(
            (f) => f.id === token || f.timestamp === token || frameRef.includes(f.id)
          )
        : null;
      const resolvedDataUrl = matched?.dataUrl || mediaById?.[token]?.dataUrl;
      if (resolvedDataUrl) {
        return `![${altText}](${resolvedDataUrl})`;
      }
      return fullMatch;
    }
  );
}

/**
 * Export the given tab's content as a self-contained .md file.
 *
 * @param {Object} tab
 * @param {string} tab.title
 * @param {string} tab.content
 * @param {Array} [frames] Captured frames for resolving inline frame:// references
 * @param {Object} [mediaById] Persistent media map from IndexedDB
 * @returns {Promise<{ success: boolean, filename: string, cancelled?: boolean }>}
 */
export async function exportMarkdown(tab, frames = [], mediaById = {}) {
  if (!tab) throw new Error('No active note to export.');
  const filename = sanitizeFilename(tab.title || 'Untitled', 'md');
  const resolvedContent = resolveMarkdownImagesForExport(
    tab.content || '',
    frames,
    mediaById
  );

  // 1. Modern File System Access API
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'Markdown Document',
            accept: { 'text/markdown': ['.md'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(resolvedContent);
      await writable.close();
      return { success: true, filename };
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return { success: false, filename, cancelled: true };
      }
      // Fall back to Blob download if showSaveFilePicker is restricted in context
    }
  }

  // 2. Standard Blob download fallback
  try {
    const blob = new Blob([resolvedContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { success: true, filename };
  } catch {
    throw new Error('Could not save the markdown file. Check your browser download permissions.');
  }
}

/**
 * Trigger browser print dialog for PDF export.
 */
export function exportPdf() {
  if (typeof window !== 'undefined' && typeof window.print === 'function') {
    window.print();
    return { success: true };
  }
  throw new Error('Printing is not available in this browser environment.');
}
