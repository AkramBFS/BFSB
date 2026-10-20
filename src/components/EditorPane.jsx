import React, { useRef, useState } from 'react'
import { fileToBase64 } from '../lib/fileToBase64.js'
import { transcribeImage } from '../lib/transcribeImage.js'
import { saveToDisk } from '../lib/saveToDisk.js'

export default function EditorPane({
  markdownText,
  setMarkdownText,
  isTranscribing,
  setIsTranscribing,
  onExport,
}) {
  const textareaRef = useRef(null)
  const [errorMessage, setErrorMessage] = useState(null)
  const handleExportClick = onExport || (() => saveToDisk(markdownText))

  const handleImagePaste = async (file, targetTextarea) => {
    // 1. Save textarea selection start and end BEFORE any await
    const start = targetTextarea?.selectionStart ?? 0
    const end = targetTextarea?.selectionEnd ?? 0

    // 2. Set transcribing status
    if (typeof setIsTranscribing === 'function') {
      setIsTranscribing(true)
    }

    try {
      // 3. fileToBase64 -> transcribeImage
      const { base64, mimeType } = await fileToBase64(file)
      const latex = await transcribeImage({ base64, mimeType })

      // 4. Build new text using the latest textarea value
      const currentText = targetTextarea?.value ?? markdownText ?? ''
      const newText = currentText.slice(0, start) + latex + currentText.slice(end)
      setMarkdownText(newText)

      // 5. Refocus textarea and place cursor right after the inserted text
      const newCursorPos = start + latex.length
      requestAnimationFrame(() => {
        if (targetTextarea) {
          targetTextarea.focus()
          targetTextarea.selectionStart = newCursorPos
          targetTextarea.selectionEnd = newCursorPos
        }
      })
    } catch (error) {
      console.error('Error transcribing image:', error)
      // 7. On error, show small inline message that disappears after 4 seconds
      setErrorMessage(error.message || 'Transcription failed')
      setTimeout(() => {
        setErrorMessage(null)
      }, 4000)
    } finally {
      // 6. Reset transcribing status
      if (typeof setIsTranscribing === 'function') {
        setIsTranscribing(false)
      }
    }
  }

  const handlePaste = (e) => {
    const items = e.clipboardData?.items
    if (!items) return

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.type && item.type.indexOf('image') !== -1) {
        e.preventDefault()
        if (isTranscribing) {
          return
        }
        const file = item.getAsFile()
        if (file) {
          const target = textareaRef.current || e.target
          handleImagePaste(file, target)
        }
        return
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Markdown Editor</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {isTranscribing && (
            <span style={{ color: '#2563eb', fontSize: '14px', fontWeight: 500 }}>
              Transcribing image...
            </span>
          )}
          <button
            id="export-btn"
            type="button"
            onClick={handleExportClick}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid #ccc',
              cursor: 'pointer',
              background: '#4f46e5',
              color: '#fff',
              fontWeight: 500,
            }}
          >
            Export
          </button>
        </div>
      </div>

      {errorMessage && (
        <div
          role="alert"
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            backgroundColor: '#fee2e2',
            color: '#b91c1c',
            fontSize: '14px',
            border: '1px solid #fca5a5',
          }}
        >
          {errorMessage}
        </div>
      )}

      <textarea
        ref={textareaRef}
        id="markdown-editor"
        value={markdownText}
        onChange={(e) => setMarkdownText(e.target.value)}
        onPaste={handlePaste}
        placeholder="Type markdown here or paste a screenshot..."
        rows={20}
        style={{
          width: '100%',
          flex: 1,
          padding: '12px',
          fontFamily: 'monospace',
          fontSize: '15px',
          borderRadius: '8px',
          border: '1px solid #d1d5db',
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}
