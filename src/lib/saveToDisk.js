/**
 * Saves markdown text to a .md file using the File System Access API
 * with a fallback to a Blob object URL download.
 * @param {string} markdownText
 * @returns {Promise<void>}
 */
export async function saveToDisk(markdownText) {
  const content = markdownText ?? ''

  const fallbackDownload = () => {
    const blob = new Blob([content], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'notes.md'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 1000)
  }

  // 1. If window.showSaveFilePicker exists: use native save picker
  if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'notes.md',
        types: [
          {
            description: 'Markdown file',
            accept: {
              'text/markdown': ['.md'],
            },
          },
        ],
      })
      const writable = await handle.createWritable()
      await writable.write(content)
      await writable.close()
      return
    } catch (error) {
      // 2. If the user cancels the dialog, return silently
      if (error && error.name === 'AbortError') {
        return
      }
      // 3. Fall back to Blob download on any other error
      console.warn('showSaveFilePicker failed, falling back to Blob download:', error)
      fallbackDownload()
      return
    }
  }

  // Fallback for browsers without showSaveFilePicker (e.g. Firefox)
  fallbackDownload()
}
