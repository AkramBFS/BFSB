import {
  getEffectiveApiKey,
  getEnvGemmaEndpoint,
  compressImageDataUrl,
} from './storage.js';
import { cleanAndValidateLatex, findExactLocalFormula } from './formulas.js';

export const DEFAULT_AI_MODEL = 'gemma-4-31b-it';

export const AI_MODEL_OPTIONS = [
  {
    id: 'gemma-4-31b-it',
    label: 'Gemma 4 31B (Default · Vision)',
    badge: 'Gemma 4',
    description: 'Hosted 31B dense instruction-tuned model with image support',
  },
  {
    id: 'gemma-4-26b-a4b-it',
    label: 'Gemma 4 26B MoE (Fast · Vision)',
    badge: 'Gemma 4 MoE',
    description: 'Hosted 26B Mixture-of-Experts (4B active) multimodal model',
  },
  {
    id: 'gemini-flash-lite-latest',
    label: 'Gemini Flash Lite (Ultra-fast OCR)',
    badge: 'Flash Lite',
    description: 'Low-latency multimodal model for instant formula transcription',
  },
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash (Vision fallback)',
    badge: 'Gemini 2.5',
    description: 'Fast multimodal fallback if Gemma 4 quota is busy',
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro (Advanced reasoning)',
    badge: 'Gemini Pro',
    description: 'High-accuracy math reasoning and dense handwriting OCR',
  },
];

const CHAT_SYSTEM_INSTRUCTION = `You are GemmaTH's study assistant for computer science and machine learning lectures.
Rules:
1. Explain concepts clearly, concisely, and without filler or conversational padding.
2. Always format inline mathematical symbols and variables using single dollar signs like $\\theta_j$ or $\\alpha$, and standalone equations using double dollar signs on their own lines like:
$$\\theta_j := \\theta_j - \\alpha \\frac{\\partial J(\\theta)}{\\partial \\theta_j}$$
3. Use valid KaTeX-compatible LaTeX syntax.
4. When an image of a lecture slide or handwritten math is attached, ground your explanation directly in what is shown and transcribe key equations accurately.
5. If an image is blurry or a question is ambiguous, state what is uncertain plainly instead of guessing.`;

const IMAGE_TO_LATEX_PROMPT = `Transcribe the mathematical formula or equation shown in this image into valid KaTeX LaTeX.
If there is NO mathematical formula, equation, or symbolic math expression in this image, output the exact token: NO_MATH_FOUND
Otherwise, output ONLY the raw LaTeX expression.
Do NOT include markdown code fences, do NOT include dollar signs, and do NOT include any explanation or commentary.`;

const TEXT_TO_LATEX_PROMPT = (desc) =>
  `Write the standard machine learning or mathematical formula for: "${desc}" in valid KaTeX LaTeX.
Output ONLY the raw LaTeX expression.
Do NOT include markdown code fences, do NOT include dollar signs, and do NOT include any explanation or commentary.`;

export class AiServiceError extends Error {
  constructor(code, userMessage) {
    super(userMessage);
    this.name = 'AiServiceError';
    this.code = code;
    this.userMessage = userMessage;
  }
}

/**
 * Strip data URL prefix if present and ensure base64 string is reasonably sized.
 */
async function prepareImageBase64(rawImage) {
  if (!rawImage) return null;
  const asDataUrl = rawImage.startsWith('data:image/')
    ? rawImage
    : `data:image/jpeg;base64,${rawImage}`;

  // Downscale if large so requests stay fast and well below size limits
  try {
    const compressed = await compressImageDataUrl(asDataUrl, {
      maxWidth: 1200,
      maxHeight: 720,
      quality: 0.85,
    });
    return compressed.base64;
  } catch {
    return rawImage.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
  }
}

/**
 * Map HTTP status and error payloads to calm, actionable sentence-case messages.
 */
function normalizeApiError(status, errorBody) {
  const rawMsg = (errorBody?.error?.message || '').toLowerCase();

  if (status === 400) {
    if (
      rawMsg.includes('api_key_invalid') ||
      rawMsg.includes('api key not valid') ||
      rawMsg.includes('key')
    ) {
      return new AiServiceError(
        'INVALID_KEY',
        'The Gemini API key was not accepted. Check your key in AI settings.'
      );
    }
    if (
      rawMsg.includes('image') ||
      rawMsg.includes('inline_data') ||
      rawMsg.includes('multimodal')
    ) {
      return new AiServiceError(
        'IMAGE_REJECTED',
        'This model could not process the attached image. Try switching to gemma-4-31b-it or gemini-flash-lite-latest in settings.'
      );
    }
    return new AiServiceError(
      'BAD_REQUEST',
      'The request could not be processed by the model. Try simplifying the prompt or switching models.'
    );
  }

  if (status === 401 || status === 403) {
    return new AiServiceError(
      'INVALID_KEY',
      'The API key lacks permission or is invalid. Update your key in AI settings.'
    );
  }

  if (status === 404) {
    return new AiServiceError(
      'MODEL_UNAVAILABLE',
      'The selected model is not available for this API key. Switch to another model in AI settings.'
    );
  }

  if (status === 413) {
    return new AiServiceError(
      'IMAGE_TOO_LARGE',
      'The attached image is too large for a single request. Try capturing a smaller frame.'
    );
  }

  if (status === 429) {
    return new AiServiceError(
      'RATE_LIMIT',
      'The rate limit or quota for this model was reached. Wait a moment and try again, or switch models in settings.'
    );
  }

  if (status >= 500) {
    return new AiServiceError(
      'SERVER_ERROR',
      'The Gemini service is temporarily busy. Wait a few seconds and try again.'
    );
  }

  return new AiServiceError(
    'UNKNOWN_ERROR',
    'Could not complete the AI request. Check your connection or try another model in settings.'
  );
}

/**
 * Build ordered candidate endpoints for resilience on 429 / 5xx errors
 * (combines explicit model endpoint, VITE_GEMMA_ENDPOINT, and high-speed fallback endpoints).
 */
function buildCandidateEndpoints(targetModel) {
  const primary = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    targetModel
  )}:generateContent`;
  const envEndpoint = getEnvGemmaEndpoint();
  const fallbacks = [
    envEndpoint,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
  ].filter(Boolean);

  const list = [];
  // If user stayed on the default model and a custom VITE_GEMMA_ENDPOINT is configured, prioritize it
  if (targetModel === DEFAULT_AI_MODEL && envEndpoint) {
    list.push(envEndpoint);
  }
  if (!list.includes(primary)) {
    list.push(primary);
  }
  for (const fb of fallbacks) {
    if (!list.includes(fb)) {
      list.push(fb);
    }
  }
  return list;
}

/**
 * Core call to Google Gemini / Hosted Gemma 4 `generateContent` endpoint.
 * Includes automatic multi-endpoint fallback on 429/5xx, inline systemInstruction retry on 400,
 * and filtering of reasoning (`part.thought === true`) parts.
 */
export async function callGeminiGenerateContent({
  contents,
  systemInstruction,
  model = DEFAULT_AI_MODEL,
  temperature = 0.2,
  maxOutputTokens = 1024,
  signal,
}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new AiServiceError(
      'OFFLINE',
      'You are currently offline. Your notes and local tools continue to work, and AI features will resume once reconnected.'
    );
  }

  const { key } = getEffectiveApiKey();
  if (!key) {
    throw new AiServiceError(
      'MISSING_KEY',
      'Add your Gemini API key to use AI math transcription and chat.'
    );
  }

  const targetModel = (model || DEFAULT_AI_MODEL).trim();
  const endpointsToTry = buildCandidateEndpoints(targetModel);

  const headers = {
    'Content-Type': 'application/json',
    'x-goog-api-key': key,
  };

  const buildPayload = (includeSysInstruction = true) => {
    const body = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens,
      },
    };
    if (includeSysInstruction && systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }],
      };
    } else if (!includeSysInstruction && systemInstruction && contents.length > 0) {
      const cloned = JSON.parse(JSON.stringify(contents));
      const first = cloned[0];
      if (first && Array.isArray(first.parts)) {
        first.parts.unshift({ text: `[System instructions]\n${systemInstruction}\n\n` });
      }
      body.contents = cloned;
    }
    return body;
  };

  const withKeyParam = (baseUrl) => {
    if (baseUrl.includes('key=')) return baseUrl;
    const sep = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${sep}key=${encodeURIComponent(key)}`;
  };

  let response = null;
  let lastError = null;

  for (let i = 0; i < endpointsToTry.length; i++) {
    const baseUrl = endpointsToTry[i];
    const isLastEndpoint = i === endpointsToTry.length - 1;
    const endpointUrl = withKeyParam(baseUrl);

    try {
      response = await fetch(endpointUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(buildPayload(true)),
        signal,
      });

      // If a hosted Gemma variant rejects the top-level systemInstruction field, retry once with inline instruction
      if (response.status === 400 && systemInstruction) {
        const errPreview = await response.clone().json().catch(() => ({}));
        const msg = (errPreview?.error?.message || '').toLowerCase();
        if (
          msg.includes('system_instruction') ||
          msg.includes('systeminstruction') ||
          msg.includes('developer instruction')
        ) {
          response = await fetch(endpointUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(buildPayload(false)),
            signal,
          });
        }
      }

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const normalizedErr = normalizeApiError(response.status, errBody);
        // If 429 (rate limit), 404 (model unavailable on tier), or 5xx, try next fallback endpoint
        if (
          !isLastEndpoint &&
          (response.status === 429 || response.status === 404 || response.status >= 500)
        ) {
          lastError = normalizedErr;
          continue;
        }
        throw normalizedErr;
      }

      // Success! Break out of fallback loop
      break;
    } catch (err) {
      if (err?.name === 'AbortError' || err?.code === 'ABORTED') {
        throw new AiServiceError('ABORTED', 'Request cancelled.');
      }
      if (err instanceof AiServiceError) {
        lastError = err;
        if (!isLastEndpoint && (err.code === 'RATE_LIMIT' || err.code === 'SERVER_ERROR' || err.code === 'MODEL_UNAVAILABLE')) {
          continue;
        }
        throw err;
      }
      lastError = new AiServiceError(
        'NETWORK_ERROR',
        'Could not reach the Gemini API. Check your internet connection and try again.'
      );
      if (!isLastEndpoint) {
        continue;
      }
      throw lastError;
    }
  }

  if (!response || !response.ok) {
    throw (
      lastError ||
      new AiServiceError(
        'UNKNOWN_ERROR',
        'Could not complete the AI request on any available endpoint.'
      )
    );
  }

  const data = await response.json().catch(() => null);
  if (!data) {
    throw new AiServiceError('MALFORMED_RESPONSE', 'Received an unreadable response from the model.');
  }

  const candidate = data.candidates?.[0];
  if (!candidate) {
    if (data.promptFeedback?.blockReason) {
      throw new AiServiceError(
        'REFUSED',
        'The model declined to answer this prompt due to safety filters.'
      );
    }
    throw new AiServiceError('EMPTY_RESPONSE', 'The model returned an empty response. Try rephrasing.');
  }

  if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'PROHIBITED_CONTENT') {
    throw new AiServiceError(
      'REFUSED',
      'The response was filtered by the model safety settings.'
    );
  }

  const parts = candidate.content?.parts || [];
  // Exclude internal reasoning/thinking parts where thought === true (ported from soheib-ai-export)
  const nonThoughtParts = parts.filter((part) => !part.thought);
  const partsToUse = nonThoughtParts.length > 0 ? nonThoughtParts : parts;

  const text = partsToUse
    .map((p) => p.text || '')
    .join('')
    .trim();

  if (!text) {
    throw new AiServiceError('EMPTY_RESPONSE', 'The model returned no text. Try again or switch models.');
  }

  const isTruncated = candidate.finishReason === 'MAX_TOKENS';
  return {
    text: isTruncated ? `${text}\n\n*(Response reached length limit)*` : text,
    isTruncated,
    modelUsed: targetModel,
  };
}

/**
 * Multi-turn chat helper with image attachment support and history budgeting.
 * Keeps up to the last 10 turns and includes image data for the active turn
 * plus the most recent image in history so follow-up questions about a frame work.
 */
export async function askStudyAssistant({
  history = [],
  text = '',
  imageBase64 = null,
  model = DEFAULT_AI_MODEL,
  signal,
}) {
  const recentHistory = history.filter((m) => !m.error && m.text).slice(-10);

  let lastImageTurnIndex = -1;
  if (!imageBase64) {
    for (let i = recentHistory.length - 1; i >= 0; i--) {
      if (recentHistory[i].imageBase64) {
        lastImageTurnIndex = i;
        break;
      }
    }
  }

  const contents = [];
  for (let i = 0; i < recentHistory.length; i++) {
    const msg = recentHistory[i];
    const role = msg.sender === 'assistant' ? 'model' : 'user';
    const parts = [];

    if (i === lastImageTurnIndex && msg.imageBase64) {
      const prepared = await prepareImageBase64(msg.imageBase64);
      if (prepared) {
        parts.push({
          inline_data: {
            mime_type: 'image/jpeg',
            data: prepared,
          },
        });
      }
    }

    parts.push({ text: msg.text });
    contents.push({ role, parts });
  }

  // Current user turn
  const currentParts = [];
  if (imageBase64) {
    const prepared = await prepareImageBase64(imageBase64);
    if (prepared) {
      currentParts.push({
        inline_data: {
          mime_type: 'image/jpeg',
          data: prepared,
        },
      });
    }
  }
  currentParts.push({
    text:
      (text || '').trim() ||
      'Explain the mathematical formula and concepts shown in this lecture frame.',
  });

  contents.push({
    role: 'user',
    parts: currentParts,
  });

  const result = await callGeminiGenerateContent({
    contents,
    systemInstruction: CHAT_SYSTEM_INSTRUCTION,
    model,
    temperature: 0.25,
    maxOutputTokens: 1024,
    signal,
  });

  return result.text;
}

/**
 * Snap-to-LaTeX (Image mode): Transcribes handwritten or lecture slide math into clean LaTeX.
 */
export async function transcribeImageToLatex({
  imageBase64,
  mimeType = 'image/jpeg',
  displayMode = 'block',
  model = DEFAULT_AI_MODEL,
  signal,
}) {
  if (!imageBase64) {
    throw new AiServiceError(
      'NO_IMAGE',
      'Select or capture an image first to transcribe its math.'
    );
  }

  const prepared = await prepareImageBase64(imageBase64);
  const contents = [
    {
      role: 'user',
      parts: [
        {
          inline_data: {
            mime_type: mimeType || 'image/jpeg',
            data: prepared,
          },
        },
        {
          text: IMAGE_TO_LATEX_PROMPT,
        },
      ],
    },
  ];

  const result = await callGeminiGenerateContent({
    contents,
    model,
    temperature: 0.1,
    maxOutputTokens: 512,
    signal,
  });

  const rawOut = (result.text || '').trim();
  if (
    !rawOut ||
    rawOut.toUpperCase().includes('NO_MATH_FOUND') ||
    /^(no\s+math|no\s+formula|no\s+equation|there\s+is\s+no\s+(math|formula|equation))/i.test(
      rawOut
    )
  ) {
    throw new AiServiceError(
      'NO_MATH_FOUND',
      'No mathematical formula was detected in this image. Try another frame or add the image as is.'
    );
  }

  return cleanAndValidateLatex(rawOut, displayMode);
}

/**
 * Formula tool (Text mode):
 * Tier 1: Checks local built-in formula library first (instant, offline).
 * Tier 2: Calls the AI model for natural-language formula generation.
 */
export async function resolveFormulaFromText({
  query,
  displayMode = 'block',
  model = DEFAULT_AI_MODEL,
  signal,
}) {
  const trimmed = (query || '').trim();
  if (!trimmed) {
    throw new AiServiceError('EMPTY_QUERY', 'Enter a formula name or description.');
  }

  // Tier 1: Local built-in dictionary check
  const localMatch = findExactLocalFormula(trimmed);
  if (localMatch) {
    return {
      ...cleanAndValidateLatex(
        localMatch.latex,
        localMatch.displayMode ? 'block' : 'inline'
      ),
      source: 'local',
      title: localMatch.title,
    };
  }

  // Tier 2: AI model generation
  const contents = [
    {
      role: 'user',
      parts: [{ text: TEXT_TO_LATEX_PROMPT(trimmed) }],
    },
  ];

  const result = await callGeminiGenerateContent({
    contents,
    model,
    temperature: 0.1,
    maxOutputTokens: 400,
    signal,
  });

  return {
    ...cleanAndValidateLatex(result.text, displayMode),
    source: 'ai',
    title: trimmed,
  };
}


const STUDY_SUMMARY_SYSTEM_INSTRUCTION = `You are GemmaTH's academic study assistant for computer science, machine learning, and mathematics notes.
Your job is to distill the student's current lecture notes into a crisp executive summary and extract the key mathematical formulas.
Rules:
1. Provide EXACTLY three bullet points ("- ...") forming a concise executive summary of the core concepts in the notes.
2. Follow the three bullet points with a "### Key Formulas" section listing the most important mathematical equations and definitions from the notes.
3. Format all inline mathematical symbols and variables with single dollar signs ($...$) and standalone display equations with double dollar signs ($$...$$) on their own lines using valid KaTeX syntax.
4. Output clean Markdown only. Do NOT wrap the response in outer markdown code fences.`;

const STUDY_QUIZ_SYSTEM_INSTRUCTION = `You are GemmaTH's active-recall quiz generator for machine learning and mathematics notes.
Read the student's notes and produce EXACTLY three active-recall question/answer pairs that test conceptual understanding and mathematical intuition.
CRITICAL OUTPUT FORMAT REQUIREMENT:
- Your reply MUST be strictly machine-readable JSON: a JSON array of exactly 3 objects, each having "question" and "answer" string properties:
[
  { "question": "...", "answer": "..." },
  { "question": "...", "answer": "..." },
  { "question": "...", "answer": "..." }
]
- Output ONLY the JSON array and nothing else (no markdown code fences, no introductory commentary, no trailing prose).
- Inside "question" and "answer" strings, format inline math with $...$ and block math with $$...$$ (properly escaping backslashes for JSON strings, e.g. "\\\\theta").`;

/**
 * Strip inline `<span data-ink="..." data-font="...">` tags from stored note content
 * so the AI model receives clean markdown and math text.
 */
export function stripNoteStylingSpans(noteContent = '') {
  return String(noteContent || '')
    .replace(/<span\s+[^>]*?>([\s\S]*?)<\/span>/gi, '$1')
    .trim();
}

/**
 * Clean outer markdown code fences if the model wrapped a markdown summary response.
 */
export function cleanSummaryMarkdown(rawText = '') {
  let cleaned = String(rawText || '').trim();
  const outerFence = cleaned.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i);
  if (outerFence && outerFence[1]) {
    cleaned = outerFence[1].trim();
  }
  return cleaned;
}

/**
 * Defensively parse a model's quiz response into a validated array of `{ id, question, answer }` items.
 * Tolerates markdown code fences (` ```json ... ``` `), surrounding prose before/after the JSON array,
 * `{ "quiz": [...] }` / `{ "questions": [...] }` wrapper objects, unescaped LaTeX backslashes inside JSON strings,
 * or structured `Q1: ... A1: ...` fallback blocks.
 * Throws `AiServiceError('MALFORMED_QUIZ', ...)` if a valid list of Q&A pairs cannot be extracted.
 */
export function parseQuizResponseDefensively(rawText = '') {
  const raw = String(rawText || '').trim();
  if (!raw) {
    throw new AiServiceError(
      'MALFORMED_QUIZ',
      'The model returned an empty quiz response. Please try again.'
    );
  }

  // 1. Strip code fences if present
  let candidate = raw;
  const fenceMatch = candidate.match(/```(?:json|javascript|js)?\s*\n?([\s\S]*?)\n?```/i);
  if (fenceMatch && fenceMatch[1]) {
    candidate = fenceMatch[1].trim();
  } else {
    candidate = candidate
      .replace(/^```(?:json|javascript|js)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();
  }

  // Helper to normalize an array of raw items into validated { id, question, answer } objects
  const normalizeItems = (arr) => {
    if (!Array.isArray(arr)) return null;
    const valid = arr
      .map((item, idx) => {
        if (!item || typeof item !== 'object') return null;
        const q = String(
          item.question ?? item.q ?? item.prompt ?? item.title ?? ''
        ).trim();
        const a = String(
          item.answer ?? item.a ?? item.solution ?? item.explanation ?? ''
        ).trim();
        if (!q || !a) return null;
        return {
          id: `quiz-item-${idx + 1}`,
          question: q,
          answer: a,
        };
      })
      .filter(Boolean);
    return valid.length > 0 ? valid.slice(0, 3) : null;
  };

  // Helper to attempt JSON.parse, with automatic pre-repair for single unescaped LaTeX backslashes
  // (including \theta, \frac, \beta, \nabla, \right which JSON.parse would otherwise turn into \t, \f, \b, \n, \r control chars)
  const repairLatexBackslashes = (str) =>
    str.replace(
      /(?<!\\)\\(theta|tau|times|text|frac|forall|beta|begin|bar|hat|nabla|nu|neq|alpha|approx|sum|sigma|sqrt|partial|pi|prod|lambda|log|left|right|int|infty|in|cdot|mathcal|mathbf|mathrm|delta|Delta|epsilon|gamma|omega|Omega|mu|phi|psi|rho|leq|geq|subset|supset|mid|parallel|to|rightarrow|leftarrow|Rightarrow|Leftarrow|norm|vec|dot|tilde)/g,
      '\\\\$1'
    );

  const tryParseJson = (jsonStr) => {
    const repaired = repairLatexBackslashes(jsonStr);
    try {
      return JSON.parse(repaired);
    } catch {
      try {
        return JSON.parse(jsonStr);
      } catch {
        return null;
      }
    }
  };

  // 2. Try direct JSON parse or extracting the outermost [...] array or {...} object
  const attempts = [candidate];
  const firstBracket = candidate.indexOf('[');
  const lastBracket = candidate.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    attempts.push(candidate.slice(firstBracket, lastBracket + 1));
  }
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    attempts.push(candidate.slice(firstBrace, lastBrace + 1));
  }

  for (const snippet of attempts) {
    const parsed = tryParseJson(snippet);
    if (parsed) {
      if (Array.isArray(parsed)) {
        const items = normalizeItems(parsed);
        if (items) return items;
      } else if (typeof parsed === 'object') {
        const innerArr =
          parsed.questions || parsed.quiz || parsed.items || parsed.pairs || parsed.data;
        const items = normalizeItems(innerArr);
        if (items) return items;
      }
    }
  }

  // 3. Fallback regex extraction for object literals `{ "question": "...", "answer": "..." }`
  const objPairRegex =
    /["']?question["']?\s*:\s*["']((?:\\.|[^"'])+)["']\s*,\s*["']?answer["']?\s*:\s*["']((?:\\.|[^"'])+)["']/gi;
  const regexItems = [];
  let match;
  while ((match = objPairRegex.exec(candidate)) !== null) {
    const q = match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
    const a = match[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
    if (q && a) {
      regexItems.push({
        id: `quiz-item-${regexItems.length + 1}`,
        question: q,
        answer: a,
      });
    }
  }
  if (regexItems.length > 0) {
    return regexItems.slice(0, 3);
  }

  // 4. Fallback structured Q/A pairs (`Q1: ... A1: ...` or `Question 1: ... Answer: ...`)
  const qaBlocks = candidate.split(
    /(?:^|\n)(?=(?:\*\*?)?(?:Q(?:uestion)?\s*\d+|1\.|2\.|3\.)[:.)\s])/i
  );
  const qaItems = [];
  for (const block of qaBlocks) {
    const qaMatch = block.match(
      /(?:\*\*?)?(?:Q(?:uestion)?\s*\d*|\d+\.)(?:\*\*?)?[:.)\s]+([\s\S]+?)\n+(?:\*\*?)?A(?:nswer)?\s*\d*(?:\*\*?)?[:.)\s]+([\s\S]+)/i
    );
    if (qaMatch) {
      const q = qaMatch[1].trim();
      const a = qaMatch[2].trim();
      if (q && a) {
        qaItems.push({
          id: `quiz-item-${qaItems.length + 1}`,
          question: q,
          answer: a,
        });
      }
    }
  }
  if (qaItems.length > 0) {
    return qaItems.slice(0, 3);
  }

  throw new AiServiceError(
    'MALFORMED_QUIZ',
    'Could not read the generated quiz format. Click Retry to generate a fresh quiz.'
  );
}

/**
 * Study Hub — Generate a 3-bullet executive summary + key formulas from the current notes using Gemma 4.
 */
export async function generateNoteSummary({
  noteContent = '',
  noteTitle = '',
  model = DEFAULT_AI_MODEL,
  signal,
}) {
  const cleanNotes = stripNoteStylingSpans(noteContent);
  if (!cleanNotes || cleanNotes.replace(/^#+\s*.*$/gm, '').trim().length === 0) {
    throw new AiServiceError(
      'EMPTY_NOTES',
      'Your note is empty. Write some lecture notes or formulas first, then click Summarize Notes.'
    );
  }

  const prompt = `These are my machine learning and mathematics study notes${
    noteTitle ? ` titled "${noteTitle}"` : ''
  }.
Write:
1. An executive summary consisting of EXACTLY three concise bullet points ("- ...").
2. A "### Key Formulas" section containing the key mathematical formulas from the notes (using $...$ for inline math and $$...$$ for display math).

Notes content:
"""
${cleanNotes}
"""`;

  const contents = [
    {
      role: 'user',
      parts: [{ text: prompt }],
    },
  ];

  const result = await callGeminiGenerateContent({
    contents,
    systemInstruction: STUDY_SUMMARY_SYSTEM_INSTRUCTION,
    model,
    temperature: 0.2,
    maxOutputTokens: 1024,
    signal,
  });

  const summaryMarkdown = cleanSummaryMarkdown(result.text);
  if (!summaryMarkdown) {
    throw new AiServiceError(
      'EMPTY_RESPONSE',
      'The model returned an empty summary. Please try again.'
    );
  }

  return summaryMarkdown;
}

/**
 * Study Hub — Generate a 3-question active-recall quiz from the current notes using Gemma 4.
 */
export async function generateNoteQuiz({
  noteContent = '',
  noteTitle = '',
  model = DEFAULT_AI_MODEL,
  signal,
}) {
  const cleanNotes = stripNoteStylingSpans(noteContent);
  if (!cleanNotes || cleanNotes.replace(/^#+\s*.*$/gm, '').trim().length === 0) {
    throw new AiServiceError(
      'EMPTY_NOTES',
      'Your note is empty. Write some lecture notes or formulas first, then click Quiz Me.'
    );
  }

  const prompt = `Read the following machine learning / mathematics study notes${
    noteTitle ? ` titled "${noteTitle}"` : ''
  } and produce EXACTLY three active-recall question/answer pairs.
Return ONLY a valid JSON array of 3 objects with "question" and "answer" keys, and no other text or commentary:
[
  { "question": "...", "answer": "..." },
  { "question": "...", "answer": "..." },
  { "question": "...", "answer": "..." }
]

Notes content:
"""
${cleanNotes}
"""`;

  const contents = [
    {
      role: 'user',
      parts: [{ text: prompt }],
    },
  ];

  const result = await callGeminiGenerateContent({
    contents,
    systemInstruction: STUDY_QUIZ_SYSTEM_INSTRUCTION,
    model,
    temperature: 0.25,
    maxOutputTokens: 1024,
    signal,
  });

  return parseQuizResponseDefensively(result.text);
}
