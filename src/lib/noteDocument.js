import { normalizeInkKey } from './contrast';

export const NOTE_FONT_FAMILIES = {
  Newsreader: "'Newsreader', 'Cairo', 'Tajawal', Georgia, serif",
  Lora: "'Lora', 'Cairo', 'Tajawal', Georgia, serif",
  'DM Sans': "'DM Sans', 'Cairo', 'Tajawal', sans-serif",
  Kalam: "'Kalam', 'Cairo', 'Tajawal', cursive",
  Cairo: "'Cairo', 'DM Sans', sans-serif",
  Tajawal: "'Tajawal', 'DM Sans', sans-serif",
};

const VALID_FONTS = new Set(Object.keys(NOTE_FONT_FAMILIES));

export function normalizeFontKey(font, fallback = 'Newsreader') {
  if (font && VALID_FONTS.has(font)) return font;
  return fallback;
}

/**
 * Normalize a character-level style array (length === rawText.length) into
 * merged contiguous runs: [{ start, end, ink, font }].
 */
export function compactStyleRuns(charStyles = [], defaultFont = 'Newsreader', defaultInk = 'default') {
  const runs = [];
  for (let i = 0; i < charStyles.length; i++) {
    const s = charStyles[i] || {};
    const ink = normalizeInkKey(s.ink || defaultInk);
    const font = normalizeFontKey(s.font || defaultFont, defaultFont);
    const prev = runs[runs.length - 1];
    if (prev && prev.end === i && prev.ink === ink && prev.font === font) {
      prev.end = i + 1;
    } else {
      runs.push({ start: i, end: i + 1, ink, font });
    }
  }
  return runs;
}

/**
 * Expand merged style runs into a per-character array of length `textLength`.
 */
export function expandStyleRuns(textLength, runs = [], defaultFont = 'Newsreader', defaultInk = 'default') {
  const arr = Array.from({ length: textLength }, () => ({
    ink: normalizeInkKey(defaultInk),
    font: normalizeFontKey(defaultFont, defaultFont),
  }));

  if (!Array.isArray(runs)) return arr;
  for (const r of runs) {
    const start = Math.max(0, Math.min(textLength, r.start ?? 0));
    const end = Math.max(start, Math.min(textLength, r.end ?? start));
    const ink = normalizeInkKey(r.ink || defaultInk);
    const font = normalizeFontKey(r.font || defaultFont, defaultFont);
    for (let i = start; i < end; i++) {
      arr[i] = { ink, font };
    }
  }
  return arr;
}

/**
 * Parse a stored markdown string that may contain inline `<span data-ink="..." data-font="...">...</span>`
 * tags into `{ rawText, runs, charStyles }`.
 * Legacy swatch names (`gold`, `rose`, `sage`, `sky`) in `data-ink` are automatically migrated.
 */
export function parseNoteContent(storedContent = '', defaultFont = 'Newsreader', defaultInk = 'default') {
  const input = String(storedContent || '');
  const baseFont = normalizeFontKey(defaultFont, 'Newsreader');
  const baseInk = normalizeInkKey(defaultInk);

  const spanRegex = /<span\s+([^>]*?)>([\s\S]*?)<\/span>/gi;
  let rawText = '';
  const charStyles = [];
  let lastIndex = 0;

  let match;
  while ((match = spanRegex.exec(input)) !== null) {
    const attrStr = match[1] || '';
    const innerText = match[2] || '';

    const inkMatch = attrStr.match(/data-ink=["']([^"']+)["']/i);
    const fontMatch = attrStr.match(/data-font=["']([^"']+)["']/i);

    if (!inkMatch && !fontMatch) {
      // Not one of our styling spans; treat literally
      continue;
    }

    // Push preceding plain text
    if (match.index > lastIndex) {
      const plainChunk = input.slice(lastIndex, match.index);
      rawText += plainChunk;
      for (let i = 0; i < plainChunk.length; i++) {
        charStyles.push({ ink: baseInk, font: baseFont });
      }
    }

    const spanInk = inkMatch ? normalizeInkKey(inkMatch[1]) : baseInk;
    const spanFont = fontMatch ? normalizeFontKey(fontMatch[1], baseFont) : baseFont;

    rawText += innerText;
    for (let i = 0; i < innerText.length; i++) {
      charStyles.push({ ink: spanInk, font: spanFont });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < input.length) {
    const tail = input.slice(lastIndex);
    rawText += tail;
    for (let i = 0; i < tail.length; i++) {
      charStyles.push({ ink: baseInk, font: baseFont });
    }
  }

  return {
    rawText,
    charStyles,
    runs: compactStyleRuns(charStyles, baseFont, baseInk),
  };
}

/**
 * Check if a character index inside `rawText` falls inside an atomic markdown token
 * that would be broken if split by an HTML `<span>` tag (e.g., math `$...$`, `$$...$$`,
 * images `![...](...)`, links `[...](...)`, or line-leading block markers `# `, `> `, `- `).
 */
function buildProtectedRanges(rawText = '') {
  const ranges = [];

  // Block math $$...$$
  const blockMathRe = /\$\$[\s\S]*?\$\$/g;
  let m;
  while ((m = blockMathRe.exec(rawText)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }

  // Inline math $...$
  const inlineMathRe = /(?<!\$)\$(?!\$)([^\n$]+?)\$(?!\$)/g;
  while ((m = inlineMathRe.exec(rawText)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }

  // Markdown images ![alt](url)
  const imgRe = /!\[[^\]]*\]\([^)]+\)/g;
  while ((m = imgRe.exec(rawText)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }

  // Markdown links [label](url)
  const linkRe = /(?<!!)\[[^\]]+\]\([^)]+\)/g;
  while ((m = linkRe.exec(rawText)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }

  // Line-start markdown syntax prefixes (# , ## , ### , > , - , * , 1. )
  const lines = rawText.split('\n');
  let offset = 0;
  for (const line of lines) {
    const prefixMatch = line.match(/^(#{1,6}\s+|>\s+|[-*+]\s+|\d+\.\s+)/);
    if (prefixMatch) {
      ranges.push([offset, offset + prefixMatch[0].length]);
    }
    offset += line.length + 1;
  }

  return ranges;
}

function isIndexProtected(idx, protectedRanges) {
  for (const [s, e] of protectedRanges) {
    if (idx >= s && idx < e) return true;
  }
  return false;
}

/**
 * Serialize `{ rawText, charStyles }` back into stored markdown string.
 * Characters that differ from `(defaultFont, 'default')` and are not newline characters
 * or protected markdown syntax are wrapped in `<span data-ink="..." data-font="...">...</span>`.
 */
export function serializeNoteContent(rawText = '', charStyles = [], defaultFont = 'Newsreader', defaultInk = 'default') {
  if (!rawText) return '';
  const baseFont = normalizeFontKey(defaultFont, 'Newsreader');
  const baseInk = normalizeInkKey(defaultInk);
  const protectedRanges = buildProtectedRanges(rawText);

  let out = '';
  let i = 0;
  const len = rawText.length;

  while (i < len) {
    const ch = rawText[i];
    const st = charStyles[i] || { ink: baseInk, font: baseFont };
    const ink = normalizeInkKey(st.ink || baseInk);
    const font = normalizeFontKey(st.font || baseFont, baseFont);

    const needsWrapper =
      ch !== '\n' &&
      !isIndexProtected(i, protectedRanges) &&
      (ink !== baseInk || font !== baseFont);

    if (!needsWrapper) {
      out += ch;
      i++;
      continue;
    }

    // Group contiguous characters with identical (ink, font) on the same line and outside protected ranges
    let j = i + 1;
    while (j < len) {
      const nextCh = rawText[j];
      if (nextCh === '\n' || isIndexProtected(j, protectedRanges)) break;
      const nextSt = charStyles[j] || { ink: baseInk, font: baseFont };
      const nextInk = normalizeInkKey(nextSt.ink || baseInk);
      const nextFont = normalizeFontKey(nextSt.font || baseFont, baseFont);
      if (nextInk !== ink || nextFont !== font) break;
      j++;
    }

    const attrs = [];
    if (ink !== baseInk) attrs.push(`data-ink="${ink}"`);
    if (font !== baseFont) attrs.push(`data-font="${font}"`);
    const chunk = rawText.slice(i, j);
    out += `<span ${attrs.join(' ')}>${chunk}</span>`;
    i = j;
  }

  return out;
}

/**
 * Inspect the effective `{ ink, font }` at a given caret/selection position.
 * - If a range is selected (`selEnd > selStart`), returns the first non-newline character's style in the selection.
 * - If collapsed (`selStart === selEnd`), returns `typingStyleOverride` if active, or the character immediately preceding the caret (`selStart - 1`, or `selStart` if at index 0).
 */
export function getStyleAtSelection(
  rawText = '',
  charStyles = [],
  selStart = 0,
  selEnd = 0,
  defaultFont = 'Newsreader',
  defaultInk = 'default',
  typingStyleOverride = null
) {
  const baseFont = normalizeFontKey(defaultFont, 'Newsreader');
  const baseInk = normalizeInkKey(defaultInk);

  if (selEnd > selStart) {
    for (let i = selStart; i < Math.min(selEnd, charStyles.length); i++) {
      if (rawText[i] !== '\n' && charStyles[i]) {
        return {
          ink: normalizeInkKey(charStyles[i].ink || baseInk),
          font: normalizeFontKey(charStyles[i].font || baseFont, baseFont),
        };
      }
    }
  }

  if (typingStyleOverride) {
    return {
      ink: normalizeInkKey(typingStyleOverride.ink || baseInk),
      font: normalizeFontKey(typingStyleOverride.font || baseFont, baseFont),
    };
  }

  if (charStyles.length === 0) {
    return { ink: baseInk, font: baseFont };
  }

  const probeIdx = selStart > 0 ? Math.min(selStart - 1, charStyles.length - 1) : 0;
  // If probeIdx is a newline and selStart > 1, check the character before the newline or fall back to base
  const st = charStyles[probeIdx];
  if (st) {
    return {
      ink: normalizeInkKey(st.ink || baseInk),
      font: normalizeFontKey(st.font || baseFont, baseFont),
    };
  }
  return { ink: baseInk, font: baseFont };
}

/**
 * Apply a style patch (`{ ink?, font? }`) to a character range `[selStart, selEnd)`
 * and return a new `charStyles` array. Existing characters outside `[selStart, selEnd)` are untouched.
 */
export function applyStyleToRange(
  charStyles = [],
  selStart = 0,
  selEnd = 0,
  stylePatch = {},
  defaultFont = 'Newsreader',
  defaultInk = 'default'
) {
  const baseFont = normalizeFontKey(defaultFont, 'Newsreader');
  const baseInk = normalizeInkKey(defaultInk);
  const next = charStyles.map((s) => ({
    ink: normalizeInkKey(s?.ink || baseInk),
    font: normalizeFontKey(s?.font || baseFont, baseFont),
  }));

  const start = Math.max(0, Math.min(next.length, selStart));
  const end = Math.max(start, Math.min(next.length, selEnd));

  for (let i = start; i < end; i++) {
    next[i] = {
      ink: stylePatch.ink !== undefined ? normalizeInkKey(stylePatch.ink) : next[i].ink,
      font:
        stylePatch.font !== undefined
          ? normalizeFontKey(stylePatch.font, baseFont)
          : next[i].font,
    };
  }
  return next;
}

/**
 * Compute updated `charStyles` when `oldRawText` is edited into `newRawText`,
 * applying `activeTypingStyle` (`{ ink, font }`) to newly inserted characters while
 * preserving existing character styles before and after the edit.
 */
export function reconcileCharStylesOnEdit(
  oldRawText = '',
  oldCharStyles = [],
  newRawText = '',
  activeTypingStyle = { ink: 'default', font: 'Newsreader' },
  defaultFont = 'Newsreader',
  defaultInk = 'default'
) {
  const baseFont = normalizeFontKey(defaultFont, 'Newsreader');
  const baseInk = normalizeInkKey(defaultInk);

  const oldLen = oldRawText.length;
  const newLen = newRawText.length;

  // Find common prefix
  let prefixLen = 0;
  const minLen = Math.min(oldLen, newLen);
  while (prefixLen < minLen && oldRawText[prefixLen] === newRawText[prefixLen]) {
    prefixLen++;
  }

  // Find common suffix not overlapping prefix
  let suffixLen = 0;
  while (
    suffixLen < oldLen - prefixLen &&
    suffixLen < newLen - prefixLen &&
    oldRawText[oldLen - 1 - suffixLen] === newRawText[newLen - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const insertedCount = newLen - prefixLen - suffixLen;
  const fillStyle = {
    ink: normalizeInkKey(activeTypingStyle?.ink || baseInk),
    font: normalizeFontKey(activeTypingStyle?.font || baseFont, baseFont),
  };

  const nextStyles = [];
  for (let i = 0; i < prefixLen; i++) {
    nextStyles.push(
      oldCharStyles[i] || { ink: baseInk, font: baseFont }
    );
  }
  for (let i = 0; i < insertedCount; i++) {
    nextStyles.push({ ...fillStyle });
  }
  for (let i = oldLen - suffixLen; i < oldLen; i++) {
    nextStyles.push(
      oldCharStyles[i] || { ink: baseInk, font: baseFont }
    );
  }

  return nextStyles;
}
