/**
 * Converts a File or Blob to a base64 string stripped of the data URI prefix.
 * Automatically optimizes large screenshots via an offscreen canvas to minimize upload latency.
 * @param {File | Blob} file
 * @returns {Promise<{ base64: string, mimeType: string }>}
 */
export async function fileToBase64(file) {
  // If in browser and file is an image, optimize dimensions to guarantee sub-second upload
  if (
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof createImageBitmap === 'function' &&
    file.type?.startsWith('image/')
  ) {
    try {
      const bitmap = await createImageBitmap(file)
      const maxDim = 1200
      let { width, height } = bitmap

      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width)
          width = maxDim
        } else {
          width = Math.round((width * maxDim) / height)
          height = maxDim
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, width, height)
        // Use JPEG for photographic / lecture slides or PNG for crisp lines
        const mimeType = 'image/jpeg'
        const dataUrl = canvas.toDataURL(mimeType, 0.88)
        const commaIndex = dataUrl.indexOf(',')
        const base64 = commaIndex !== -1 ? dataUrl.slice(commaIndex + 1) : dataUrl

        return {
          base64,
          mimeType,
        }
      }
    } catch (e) {
      console.warn('Canvas optimization skipped, falling back to FileReader:', e)
    }
  }

  // Fallback to standard FileReader
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') {
        const commaIndex = result.indexOf(',')
        const base64 = commaIndex !== -1 ? result.slice(commaIndex + 1) : result
        resolve({
          base64,
          mimeType: file.type || 'image/png',
        })
      } else {
        reject(new Error('FileReader result is not a string'))
      }
    }

    reader.onerror = () => {
      reject(reader.error || new Error('FileReader failed to read file'))
    }

    reader.readAsDataURL(file)
  })
}
