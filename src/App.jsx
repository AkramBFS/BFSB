import { useState } from 'react'
import EditorPane from './components/EditorPane.jsx'
import PreviewPane from './components/PreviewPane.jsx'
import { saveToDisk } from './lib/saveToDisk.js'
import './App.css'

function App() {
  const [markdownText, setMarkdownText] = useState(
    '# Sample Notes\n\nPaste an equation screenshot into the editor below:'
  )
  const [isTranscribing, setIsTranscribing] = useState(false)

  const handleExport = () => {
    saveToDisk(markdownText)
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', textAlign: 'left' }}>
      <h1>Note App (Editor + Live KaTeX Preview)</h1>
      <p style={{ color: '#6b7280', marginBottom: '20px' }}>
        Paste a screenshot of a formula into the editor on the left. The live KaTeX preview on the right renders it into visual math!
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        <EditorPane
          markdownText={markdownText}
          setMarkdownText={setMarkdownText}
          isTranscribing={isTranscribing}
          setIsTranscribing={setIsTranscribing}
          onExport={handleExport}
        />
        <PreviewPane markdownText={markdownText} />
      </div>
    </div>
  )
}

export default App
