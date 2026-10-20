/**
 * Strips code fences, chain-of-thought commentary, and preamble, returning ONLY the clean KaTeX math.
 * @param {string} rawText
 * @returns {string}
 */
export function cleanLatex(rawText) {
  if (!rawText) return ''
  let cleaned = rawText.trim()

  // 1. If the model wrapped the response in markdown code fences anywhere, extract the inner text
  const fenceMatch = cleaned.match(/```(?:latex|markdown|katex)?\s*\n?([\s\S]*?)\n?```/i)
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim()
  } else {
    // Strip leading code fence if present
    cleaned = cleaned.replace(/^```(?:latex|markdown|katex)?\s*\n?/i, '')
    // Strip trailing code fence if present
    cleaned = cleaned.replace(/\n?```\s*$/i, '')
  }

  // 2. If block math ($$...$$) exists in the output
  const blockMathMatches = [...cleaned.matchAll(/\$\$[\s\S]+?\$\$/g)]
  if (blockMathMatches.length > 0) {
    // If there is reasoning/explanation text before the first math block
    if (blockMathMatches[0].index > 30) {
      const lastBlock = blockMathMatches[blockMathMatches.length - 1][0]
      return lastBlock.trim()
    }
    // Deduplicate if adjacent duplicate block formulas were returned
    if (blockMathMatches.length >= 2 && blockMathMatches[0][0] === blockMathMatches[1][0]) {
      return blockMathMatches[0][0].trim()
    }
    return cleaned.trim()
  }

  // 3. If only inline math ($...$) exists with preceding preamble
  const inlineMathMatches = [...cleaned.matchAll(/\$[^$]+?\$/g)]
  if (inlineMathMatches.length > 0) {
    if (inlineMathMatches[0].index > 30) {
      const lastInline = inlineMathMatches[inlineMathMatches.length - 1][0]
      return lastInline.trim()
    }
    return cleaned.trim()
  }

  // 4. If neither $$ nor $ delimiters are present, wrap in $$...$$ for KaTeX IF it's a formula
  if (cleaned.length > 0 && !cleaned.includes('$')) {
    const isMarkdownDoc = cleaned.startsWith('#') || cleaned.startsWith('-') || cleaned.startsWith('*')
    if (!isMarkdownDoc) {
      return `$$${cleaned}$$`
    }
  }

  return cleaned.trim()
}

/**
 * Sends a base64 encoded image to transcribe math into KaTeX at high speed.
 * @param {{ base64: string, mimeType: string }} params
 * @returns {Promise<string>}
 */
export async function transcribeImage({ base64, mimeType = 'image/png' }) {
  const env =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env
      : typeof process !== 'undefined' && process.env
      ? process.env
      : {}

  // High-speed endpoint (< 2 seconds response time)
  const primaryEndpoint =
    env.VITE_GEMMA_ENDPOINT ||
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent'
  const fallbackEndpoints = [
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
  ]

  const apiKey =
    env.VITE_GEMMA_API_KEY ||
    env.VITE_GEMINI_API_KEY ||
    ''

  const headers = {
    'Content-Type': 'application/json',
  }
  if (apiKey) {
    headers['x-goog-api-key'] = apiKey
  }

  const promptText =
    'Transcribe the math in this image into KaTeX. Return ONLY the LaTeX/markdown, using $...$ for inline math and $$...$$ for block math, with no explanations and no code fences.'

  const body = {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: mimeType || 'image/png',
              data: base64,
            },
          },
          {
            text: promptText,
          },
        ],
      },
    ],
    generationConfig: {
      maxOutputTokens: 256,
      temperature: 0.1,
    },
  }

  const endpointsToTry = [primaryEndpoint]
  for (const fb of fallbackEndpoints) {
    if (!endpointsToTry.includes(fb)) {
      endpointsToTry.push(fb)
    }
  }

  let lastError = null

  for (const targetEndpoint of endpointsToTry) {
    try {
      const response = await fetch(targetEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        let errorMessage = `HTTP error ${response.status} (${response.statusText})`
        try {
          const errJson = await response.json()
          if (errJson?.error?.message) {
            errorMessage = errJson.error.message
          }
        } catch {
          // Body is not JSON
        }

        // If it's a 5xx / 429 error and we have another endpoint, continue to fallback
        if ((response.status >= 500 || response.status === 429) && targetEndpoint !== endpointsToTry[endpointsToTry.length - 1]) {
          console.warn(`Endpoint ${targetEndpoint} returned ${errorMessage}, trying fallback endpoint...`)
          lastError = new Error(`Transcription failed: ${errorMessage}`)
          continue
        }

        throw new Error(`Transcription failed: ${errorMessage}`)
      }

      const data = await response.json()
      const parts = data?.candidates?.[0]?.content?.parts || []

      // Exclude reasoning/thinking parts where thought === true
      const nonThoughtParts = parts.filter((part) => !part.thought)
      const partsToUse = nonThoughtParts.length > 0 ? nonThoughtParts : parts

      const rawText = partsToUse.map((part) => part.text || '').join('')

      if (!rawText) {
        throw new Error('No transcription returned from endpoint.')
      }

      return cleanLatex(rawText)
    } catch (err) {
      lastError = err
      if (targetEndpoint !== endpointsToTry[endpointsToTry.length - 1]) {
        console.warn('Endpoint error, attempting fallback:', err.message)
        continue
      }
      throw err
    }
  }

  throw lastError || new Error('Transcription failed on all endpoints.')
}
