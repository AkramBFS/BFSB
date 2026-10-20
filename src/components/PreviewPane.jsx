import React, { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

/**
 * Simple markdown + KaTeX renderer for previewing math notes
 */
export default function PreviewPane({ markdownText }) {
  const renderedHtml = useMemo(() => {
    if (!markdownText) return ''

    let text = markdownText

    // 1. Render block math: $$...$$
    text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, math) => {
      try {
        return `<div class="math-block" style="margin: 16px 0; text-align: center; overflow-x: auto;">${katex.renderToString(
          math.trim(),
          { displayMode: true, throwOnError: false }
        )}</div>`
      } catch (e) {
        return `<div style="color: red;">Error rendering math: ${e.message}</div>`
      }
    })

    // 2. Render inline math: $...$
    text = text.replace(/\$([^$\n]+?)\$/g, (_, math) => {
      try {
        return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false })
      } catch {
        return math
      }
    })

    // 3. Basic Markdown headers and paragraphs
    return text
      .split('\n\n')
      .map((block) => {
        const trimmed = block.trim()
        if (trimmed.startsWith('<div class="math-block"')) {
          return trimmed
        }
        if (trimmed.startsWith('# ')) {
          return `<h1 style="font-size: 24px; font-weight: bold; margin-bottom: 8px;">${trimmed.slice(2)}</h1>`
        }
        if (trimmed.startsWith('## ')) {
          return `<h2 style="font-size: 20px; font-weight: bold; margin-bottom: 8px;">${trimmed.slice(3)}</h2>`
        }
        if (trimmed.startsWith('### ')) {
          return `<h3 style="font-size: 16px; font-weight: bold; margin-bottom: 6px;">${trimmed.slice(4)}</h3>`
        }
        return `<p style="margin-bottom: 8px; line-height: 1.6;">${trimmed.replace(/\n/g, '<br/>')}</p>`
      })
      .join('')
  }, [markdownText])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Live KaTeX Preview</h2>
      </div>
      <div
        id="katex-preview"
        style={{
          flex: 1,
          padding: '16px',
          borderRadius: '8px',
          border: '1px solid #d1d5db',
          backgroundColor: '#fafafa',
          overflowY: 'auto',
          minHeight: '400px',
          boxSizing: 'border-box',
        }}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </div>
  )
}
