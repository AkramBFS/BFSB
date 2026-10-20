import { compressImageDataUrl } from './storage.js';

/**
 * Converts a File, Blob, or data-URL string to a base64 string stripped of the data URI prefix.
 * Automatically optimizes large screenshots via createImageBitmap / canvas to minimize upload latency.
 *
 * @param {File | Blob | string} file
 * @returns {Promise<{ base64: string, mimeType: string, dataUrl: string, width: number, height: number }>}
 */
export async function fileToBase64(file) {
  if (!file) {
    throw new Error('No image file provided.');
  }

  try {
    const res = await compressImageDataUrl(file, {
      maxWidth: 1200,
      maxHeight: 1200,
      quality: 0.88,
    });
    return {
      base64: res.base64,
      mimeType: res.mimeType || 'image/jpeg',
      dataUrl: res.dataUrl,
      width: res.width,
      height: res.height,
    };
  } catch {
    // Fallback to raw FileReader if canvas optimization is unavailable
    if (typeof FileReader !== 'undefined' && typeof file === 'object') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result;
          if (typeof result === 'string') {
            const commaIndex = result.indexOf(',');
            const base64 = commaIndex !== -1 ? result.slice(commaIndex + 1) : result;
            resolve({
              base64,
              mimeType: file.type || 'image/png',
              dataUrl: result,
              width: 0,
              height: 0,
            });
          } else {
            reject(new Error('FileReader result is not a string'));
          }
        };
        reader.onerror = () => {
          reject(reader.error || new Error('FileReader failed to read file'));
        };
        reader.readAsDataURL(file);
      });
    }
    throw new Error('Could not convert file to base64');
  }
}
