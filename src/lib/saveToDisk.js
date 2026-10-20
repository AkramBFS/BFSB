import { exportMarkdown } from './export.js';

/**
 * Saves markdown text to a .md file using the File System Access API
 * with a fallback to a Blob object URL download.
 * Compatible with `soheib-ai-export`'s `saveToDisk(markdownText)` signature,
 * delegating to the unified GemmaTH `exportMarkdown` engine.
 *
 * @param {string} markdownText
 * @param {Object} [options]
 * @param {string} [options.title='notes']
 * @param {Array} [options.frames=[]]
 * @param {Object} [options.mediaById={}]
 * @returns {Promise<{ success: boolean, filename: string, cancelled?: boolean }>}
 */
export async function saveToDisk(markdownText, options = {}) {
  const { title = 'notes', frames = [], mediaById = {} } = options;
  return exportMarkdown(
    {
      title,
      content: markdownText ?? '',
    },
    frames,
    mediaById
  );
}
