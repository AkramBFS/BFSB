import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import katex from 'katex';
import { parseTimestampToSeconds } from '../lib/youtube';
import { NOTE_FONT_FAMILIES } from '../lib/noteDocument';
import { CloseIcon } from './Icons';

/**
 * Render inline or display LaTeX safely with KaTeX.
 * If syntax is invalid, returns `{ html: null, error }` so we can show a small,
 * local, readable error badge at that exact spot without blanking the rest of the note.
 */
function renderLatexSafely(latex = '', displayMode = false) {
  const trimmed = String(latex || '').trim();
  if (!trimmed) {
    return { html: null, error: 'Empty formula' };
  }
  try {
    const html = katex.renderToString(trimmed, {
      throwOnError: true,
      displayMode,
      strict: 'ignore',
    });
    return { html, error: null };
  } catch (err) {
    const msg = err?.message
      ? err.message.replace(/^KaTeX parse error:\s*/i, '').split('\n')[0]
      : 'Invalid LaTeX syntax';
    return { html: null, error: msg };
  }
}

/**
 * Segment `rawText` into logical blocks (multiline `$$...$$` math blocks, standalone image blocks,
 * or single-line blocks) with exact `[start, end]` character offsets in `rawText`.
 */
function segmentDocumentBlocks(rawText = '') {
  const text = String(rawText || '');
  const lines = text.split('\n');
  const blocks = [];

  let lineIdx = 0;
  let charOffset = 0;

  while (lineIdx < lines.length) {
    const line = lines[lineIdx];
    const lineStart = charOffset;

    // Check for multi-line $$ block math start
    if (line.trim().startsWith('$$') && (line.trim() === '$$' || !line.trim().slice(2).includes('$$'))) {
      let endLineIdx = lineIdx + 1;
      let endOffset = lineStart + line.length;
      let foundClosing = false;

      while (endLineIdx < lines.length) {
        endOffset += 1 + lines[endLineIdx].length; // +1 for \n
        if (lines[endLineIdx].trim().endsWith('$$')) {
          foundClosing = true;
          break;
        }
        endLineIdx++;
      }

      if (foundClosing) {
        const blockRaw = text.slice(lineStart, endOffset);
        const innerLatex = blockRaw.replace(/^\s*\$\$\s*/, '').replace(/\s*\$\$\s*$/, '');
        blocks.push({
          id: `block-${lineStart}`,
          type: 'math-block',
          start: lineStart,
          end: endOffset,
          raw: blockRaw,
          latex: innerLatex,
        });
        charOffset = endOffset + 1;
        lineIdx = endLineIdx + 1;
        continue;
      }
    }

    const lineEnd = lineStart + line.length;
    const trimmed = line.trim();

    // Single-line $$...$$ math block
    if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length >= 4) {
      const innerLatex = trimmed.slice(2, -2).trim();
      blocks.push({
        id: `block-${lineStart}`,
        type: 'math-block',
        start: lineStart,
        end: lineEnd,
        raw: line,
        latex: innerLatex,
      });
    } else if (/^!\[([^\]]*)\]\(([^)]+)\)\s*$/.test(trimmed)) {
      const match = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
      blocks.push({
        id: `block-${lineStart}`,
        type: 'image-block',
        start: lineStart,
        end: lineEnd,
        raw: line,
        alt: match[1] || '',
        src: match[2] || '',
      });
    } else if (/^#{1,3}\s+/.test(line)) {
      const match = line.match(/^(#{1,3})\s+(.*)$/);
      blocks.push({
        id: `block-${lineStart}`,
        type: `h${match[1].length}`,
        start: lineStart,
        end: lineEnd,
        raw: line,
        marker: `${match[1]} `,
        bodyStart: lineStart + match[1].length + 1,
      });
    } else if (/^>\s?/.test(line)) {
      const match = line.match(/^(>\s?)(.*)$/);
      blocks.push({
        id: `block-${lineStart}`,
        type: 'blockquote',
        start: lineStart,
        end: lineEnd,
        raw: line,
        marker: match[1],
        bodyStart: lineStart + match[1].length,
      });
    } else if (/^([-*+])\s+/.test(line)) {
      const match = line.match(/^([-*+]\s+)(.*)$/);
      blocks.push({
        id: `block-${lineStart}`,
        type: 'ul-item',
        start: lineStart,
        end: lineEnd,
        raw: line,
        marker: match[1],
        bodyStart: lineStart + match[1].length,
      });
    } else if (/^(\d+\.)\s+/.test(line)) {
      const match = line.match(/^(\d+\.\s+)(.*)$/);
      blocks.push({
        id: `block-${lineStart}`,
        type: 'ol-item',
        start: lineStart,
        end: lineEnd,
        raw: line,
        marker: match[1],
        numberLabel: match[1].trim(),
        bodyStart: lineStart + match[1].length,
      });
    } else {
      blocks.push({
        id: `block-${lineStart}`,
        type: 'paragraph',
        start: lineStart,
        end: lineEnd,
        raw: line,
        marker: '',
        bodyStart: lineStart,
      });
    }

    charOffset = lineEnd + 1;
    lineIdx++;
  }

  return blocks;
}

/**
 * Tokenize an inline slice of `rawText` (from `sliceStart` to `sliceEnd`) into
 * rich inline tokens: inline math `$...$`, inline images `![alt](src)`, links/timestamps `[label](url)`,
 * bold `**...**`, italic `*...*`, inline code `` `...` ``, and styled text runs.
 */
function tokenizeInline(rawText, sliceStart, sliceEnd) {
  const sub = rawText.slice(sliceStart, sliceEnd);
  const tokens = [];
  // Combined regex for inline markdown constructs
  const inlineRe =
    /(!\[([^\]]*)\]\(([^)]+)\))|((?<!!)\[([^\]]+)\]\(([^)]+)\))|((?<!\$)\$(?!\$)([^\n$]+?)\$(?!\$))|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/g;

  let lastIdx = 0;
  let m;
  while ((m = inlineRe.exec(sub)) !== null) {
    if (m.index > lastIdx) {
      tokens.push({
        type: 'text',
        start: sliceStart + lastIdx,
        end: sliceStart + m.index,
        text: sub.slice(lastIdx, m.index),
      });
    }

    const tokenStart = sliceStart + m.index;
    const tokenEnd = tokenStart + m[0].length;

    if (m[1]) {
      tokens.push({
        type: 'inline-image',
        start: tokenStart,
        end: tokenEnd,
        raw: m[0],
        alt: m[2] || '',
        src: m[3] || '',
      });
    } else if (m[4]) {
      tokens.push({
        type: 'link',
        start: tokenStart,
        end: tokenEnd,
        raw: m[0],
        label: m[5],
        href: m[6],
        labelStart: tokenStart + 1,
        labelEnd: tokenStart + 1 + m[5].length,
      });
    } else if (m[7]) {
      tokens.push({
        type: 'inline-math',
        start: tokenStart,
        end: tokenEnd,
        raw: m[0],
        latex: m[8],
      });
    } else if (m[9]) {
      tokens.push({
        type: 'bold',
        start: tokenStart,
        end: tokenEnd,
        raw: m[0],
        inner: m[10],
        innerStart: tokenStart + 2,
        innerEnd: tokenEnd - 2,
      });
    } else if (m[11]) {
      tokens.push({
        type: 'italic',
        start: tokenStart,
        end: tokenEnd,
        raw: m[0],
        inner: m[12],
        innerStart: tokenStart + 1,
        innerEnd: tokenEnd - 1,
      });
    } else if (m[13]) {
      tokens.push({
        type: 'code',
        start: tokenStart,
        end: tokenEnd,
        raw: m[0],
        inner: m[14],
        innerStart: tokenStart + 1,
        innerEnd: tokenEnd - 1,
      });
    }

    lastIdx = m.index + m[0].length;
  }

  if (lastIdx < sub.length) {
    tokens.push({
      type: 'text',
      start: sliceStart + lastIdx,
      end: sliceEnd,
      text: sub.slice(lastIdx),
    });
  }

  return tokens;
}

/**
 * Render a text slice `[start, end)` with per-character `{ ink, font }` runs so
 * every styled word/character displays in its chosen fountain-pen ink and font.
 */
function renderStyledSlice(
  rawText,
  start,
  end,
  charStyles,
  defaultFont,
  extraClassName = '',
  forceFontFamily = null
) {
  if (end <= start) return null;
  const segments = [];
  let i = start;
  while (i < end) {
    const st = charStyles[i] || { ink: 'default', font: defaultFont };
    let j = i + 1;
    while (j < end) {
      const nextSt = charStyles[j] || { ink: 'default', font: defaultFont };
      if (nextSt.ink !== st.ink || nextSt.font !== st.font) break;
      j++;
    }
    segments.push({
      start: i,
      end: j,
      ink: st.ink || 'default',
      font: st.font || defaultFont,
      text: rawText.slice(i, j),
    });
    i = j;
  }

  return segments.map((seg) => {
    const fontFamily =
      forceFontFamily ||
      NOTE_FONT_FAMILIES[seg.font] ||
      NOTE_FONT_FAMILIES[defaultFont] ||
      NOTE_FONT_FAMILIES.Newsreader;
    return (
      <span
        key={seg.start}
        data-ink={seg.ink}
        data-char-start={seg.start}
        data-char-end={seg.end}
        className={extraClassName}
        style={{
          fontFamily,
          color: `var(--ink-${seg.ink}, var(--tx))`,
        }}
      >
        {seg.text}
      </span>
    );
  });
}

function resolveBoundaryOffset(node, offset, containerEl, isEnd = false) {
  if (!node || !containerEl) return null;
  if (node.nodeType === 3) {
    const spanEl = node.parentElement?.closest?.('[data-char-start]');
    if (spanEl && containerEl.contains(spanEl)) {
      const charStart = Number(spanEl.getAttribute('data-char-start'));
      const charEnd = Number(spanEl.getAttribute('data-char-end'));
      if (!Number.isNaN(charStart) && !Number.isNaN(charEnd)) {
        return Math.min(charEnd, Math.max(charStart, charStart + offset));
      }
    }
    const blockEl = node.parentElement?.closest?.('[data-block-start]');
    if (blockEl && containerEl.contains(blockEl)) {
      const bStart = Number(blockEl.getAttribute('data-block-start'));
      const bEnd = Number(blockEl.getAttribute('data-block-end'));
      return isEnd ? bEnd : bStart;
    }
    return null;
  }
  if (node.nodeType === 1) {
    const el = node;
    const spanEl = el.closest?.('[data-char-start]');
    if (spanEl && containerEl.contains(spanEl)) {
      const charStart = Number(spanEl.getAttribute('data-char-start'));
      const charEnd = Number(spanEl.getAttribute('data-char-end'));
      return isEnd ? charEnd : charStart;
    }
    const childCount = el.childNodes?.length || 0;
    if (childCount > 0) {
      const childIdx = isEnd
        ? Math.max(0, Math.min(childCount - 1, offset - 1))
        : Math.max(0, Math.min(childCount - 1, offset));
      const child = el.childNodes[childIdx];
      if (child) {
        const childSpan =
          child.nodeType === 1
            ? child.matches?.('[data-char-start]')
              ? child
              : child.querySelector?.('[data-char-start]')
            : child.parentElement?.closest?.('[data-char-start]');
        if (childSpan && containerEl.contains(childSpan)) {
          const charStart = Number(childSpan.getAttribute('data-char-start'));
          const charEnd = Number(childSpan.getAttribute('data-char-end'));
          return isEnd ? charEnd : charStart;
        }
      }
    }
    const blockEl = el.closest?.('[data-block-start]');
    if (blockEl && containerEl.contains(blockEl)) {
      const bStart = Number(blockEl.getAttribute('data-block-start'));
      const bEnd = Number(blockEl.getAttribute('data-block-end'));
      return isEnd ? bEnd : bStart;
    }
  }
  return null;
}

function resolveDomSelectionInContainer(containerEl) {
  if (typeof window === 'undefined' || !window.getSelection || !containerEl) return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!containerEl.contains(range.commonAncestorContainer)) return null;
  const start = resolveBoundaryOffset(
    range.startContainer,
    range.startOffset,
    containerEl,
    false
  );
  const end = resolveBoundaryOffset(
    range.endContainer,
    range.endOffset,
    containerEl,
    true
  );
  if (typeof start === 'number' && typeof end === 'number') {
    return {
      start: Math.min(start, end),
      end: Math.max(start, end),
      isCollapsed: sel.isCollapsed || start === end,
    };
  }
  return null;
}

/**
 * Obsidian-style single-surface Live Note Editor.
 * - Everything is rendered in place and editable in place.
 * - Markdown syntax characters (`# `, `> `, `- `, `**`, `*`, `` ` ``, `[label](url)`) are revealed ONLY
 *   on the line or token where the caret currently sits, and tuck away as soon as the caret leaves.
 * - Inline (`$...$`) and block (`$$...$$`) math render in place with KaTeX; when the caret enters or clicks
 *   a formula, its raw LaTeX source is revealed for editing and re-renders when the caret leaves.
 * - Broken formulas show a small, local, readable error badge at that exact spot without blanking the note.
 * - Images appear in place as blocks with editable captions, keyboard selection/deletion, and a hover/focus remove button.
 * - Timestamps render as clickable links that seek the video, while allowing normal caret placement around them.
 */
export const LiveNoteEditor = forwardRef(function LiveNoteEditor(
  {
    rawText = '',
    charStyles = [],
    defaultFont = 'Newsreader',
    activeTypingStyle = { ink: 'default', font: 'Newsreader' },
    cursorStart = 0,
    cursorEnd = 0,
    onChangeDocument,
    onSelectRange,
    onSeekTimestamp,
    onInspectFrame,
    frames = [],
    mediaById = {},
    onKeyDown,
    onPasteImageFile,
  },
  ref
) {
  const [editingBlockStart, setEditingBlockStart] = useState(null);
  const [isSurfaceFocused, setIsSurfaceFocused] = useState(false);
  const [selectedImageBlockStart, setSelectedImageBlockStart] = useState(null);

  const containerRef = useRef(null);
  const activeInputRef = useRef(null);
  const pendingFocusOffsetRef = useRef(null);

  const blocks = useMemo(() => segmentDocumentBlocks(rawText), [rawText]);

  // Determine which block contains `cursorStart`
  const activeBlock = useMemo(() => {
    if (!isSurfaceFocused && editingBlockStart === null) return null;
    const targetPos = editingBlockStart !== null ? editingBlockStart : cursorStart;
    for (const b of blocks) {
      if (targetPos >= b.start && targetPos <= b.end) {
        return b;
      }
    }
    return blocks[blocks.length - 1] || null;
  }, [blocks, cursorStart, editingBlockStart, isSurfaceFocused]);

  useImperativeHandle(
    ref,
    () => ({
      getCurrentSelectionRange: () => {
        if (
          activeBlock &&
          activeInputRef.current &&
          document.activeElement === activeInputRef.current
        ) {
          const s = activeBlock.start + (activeInputRef.current.selectionStart ?? 0);
          const e = activeBlock.start + (activeInputRef.current.selectionEnd ?? 0);
          return [Math.min(s, e), Math.max(s, e)];
        }
        const domSel = resolveDomSelectionInContainer(containerRef.current);
        if (domSel && !domSel.isCollapsed && domSel.end > domSel.start) {
          return [domSel.start, domSel.end];
        }
        return [cursorStart, cursorEnd];
      },
    }),
    [activeBlock, cursorEnd, cursorStart]
  );

  // Focus and position caret inside the active block's editable input/textarea when activated
  useEffect(() => {
    if (!activeBlock || !activeInputRef.current) return;
    const el = activeInputRef.current;
    if (document.activeElement !== el) {
      el.focus({ preventScroll: true });
    }
    if (pendingFocusOffsetRef.current !== null) {
      const localStart = Math.max(
        0,
        Math.min(el.value.length, pendingFocusOffsetRef.current.start - activeBlock.start)
      );
      const localEnd = Math.max(
        localStart,
        Math.min(el.value.length, pendingFocusOffsetRef.current.end - activeBlock.start)
      );
      el.setSelectionRange(localStart, localEnd);
      pendingFocusOffsetRef.current = null;
    }
  }, [activeBlock, editingBlockStart]);

  // Auto-resize active textarea height to fit content seamlessly
  useEffect(() => {
    if (activeInputRef.current && activeInputRef.current.tagName === 'TEXTAREA') {
      const el = activeInputRef.current;
      el.style.height = 'auto';
      el.style.height = `${Math.max(28, el.scrollHeight)}px`;
    }
  }, [activeBlock, rawText]);

  const activateBlockAtOffset = useCallback(
    (docStart, docEnd = docStart) => {
      setSelectedImageBlockStart(null);
      setIsSurfaceFocused(true);
      setEditingBlockStart(docStart);
      pendingFocusOffsetRef.current = { start: docStart, end: docEnd };
      onSelectRange(docStart, docEnd);
    },
    [onSelectRange]
  );

  const replaceBlockRange = useCallback(
    (blockStart, blockEnd, replacementText, nextCaretDocOffset) => {
      const before = rawText.slice(0, blockStart);
      const after = rawText.slice(blockEnd);
      const nextRaw = `${before}${replacementText}${after}`;
      const caret =
        typeof nextCaretDocOffset === 'number'
          ? nextCaretDocOffset
          : blockStart + replacementText.length;
      pendingFocusOffsetRef.current = { start: caret, end: caret };
      setEditingBlockStart(caret);
      onChangeDocument(nextRaw, caret, caret);
    },
    [onChangeDocument, rawText]
  );

  const removeBlockEntirely = useCallback(
    (block) => {
      let removeStart = block.start;
      let removeEnd = block.end;
      if (removeEnd < rawText.length && rawText[removeEnd] === '\n') {
        removeEnd += 1;
      } else if (removeStart > 0 && rawText[removeStart - 1] === '\n') {
        removeStart -= 1;
      }
      const nextRaw = `${rawText.slice(0, removeStart)}${rawText.slice(removeEnd)}`;
      const nextCaret = Math.max(0, Math.min(nextRaw.length, removeStart));
      setSelectedImageBlockStart(null);
      onChangeDocument(nextRaw, nextCaret, nextCaret, { isUndoableSnapshot: true });
    },
    [onChangeDocument, rawText]
  );

  const updateImageCaption = useCallback(
    (block, nextCaption) => {
      const cleanCap = nextCaption.replace(/[\]\n]/g, '');
      const nextMarkdown = `![${cleanCap}](${block.src})`;
      const nextRaw = `${rawText.slice(0, block.start)}${nextMarkdown}${rawText.slice(block.end)}`;
      onChangeDocument(nextRaw, block.start + nextMarkdown.length, block.start + nextMarkdown.length);
    },
    [onChangeDocument, rawText]
  );

  const resolveImageSource = useCallback(
    (src, alt) => {
      const rawToken = (src || '').replace(/^frame:\/\//, '').trim();
      const frameMatch = frames.find(
        (f) =>
          f.id === rawToken ||
          f.timestamp === rawToken ||
          f.dataUrl === src ||
          (src && f.id && src.includes(f.id)) ||
          (alt && f.timestamp && alt.includes(f.timestamp))
      );

      const persistedMedia = mediaById[rawToken];
      const resolvedSrc =
        frameMatch?.dataUrl ||
        persistedMedia?.dataUrl ||
        (src && !src.startsWith('frame://') ? src : null);
      const badgeTime =
        frameMatch?.timestamp || (rawToken.includes(':') ? rawToken : null);

      return { frameMatch, resolvedSrc, badgeTime };
    },
    [frames, mediaById]
  );

  const handleBlockInputKeyDown = (e, block, blockIdx) => {
    // Allow parent slash-command palette & Ctrl+Z / Ctrl+Y shortcuts to intercept first
    if (onKeyDown) {
      const handled = onKeyDown(e);
      if (handled) return;
    }

    const el = e.currentTarget;
    const localStart = el.selectionStart ?? 0;
    const localEnd = el.selectionEnd ?? 0;

    // Enter inside a single-line block splits the line at the caret
    if (e.key === 'Enter' && block.type !== 'math-block' && !e.shiftKey) {
      e.preventDefault();
      const currentLine = el.value;
      const before = currentLine.slice(0, localStart);
      const after = currentLine.slice(localEnd);

      // Auto-continue list items if non-empty, or exit list if empty marker
      let nextLinePrefix = '';
      if (block.type === 'ul-item') {
        if (before.trim() === '-' || before.trim() === '*' || before.trim() === '+') {
          // Clear empty list marker
          replaceBlockRange(block.start, block.end, '', block.start);
          return;
        }
        nextLinePrefix = block.marker;
      } else if (block.type === 'ol-item') {
        const numMatch = block.marker.match(/^(\d+)\.\s+/);
        if (before.trim() === `${numMatch?.[1]}.`) {
          replaceBlockRange(block.start, block.end, '', block.start);
          return;
        }
        const nextNum = numMatch ? Number(numMatch[1]) + 1 : 1;
        nextLinePrefix = `${nextNum}. `;
      }

      const replacement = `${before}\n${nextLinePrefix}${after}`;
      const nextCaret = block.start + before.length + 1 + nextLinePrefix.length;
      replaceBlockRange(block.start, block.end, replacement, nextCaret);
      return;
    }

    // Backspace at the very start of a block merges it with the previous block
    if (e.key === 'Backspace' && localStart === 0 && localEnd === 0 && block.start > 0) {
      e.preventDefault();
      const prevJoinOffset = block.start - 1; // the '\n' before this block
      const nextRaw = `${rawText.slice(0, prevJoinOffset)}${rawText.slice(block.start)}`;
      pendingFocusOffsetRef.current = { start: prevJoinOffset, end: prevJoinOffset };
      setEditingBlockStart(prevJoinOffset);
      onChangeDocument(nextRaw, prevJoinOffset, prevJoinOffset);
      return;
    }

    // Delete at the very end of a block merges the next block into this one
    if (
      e.key === 'Delete' &&
      localStart === el.value.length &&
      localEnd === el.value.length &&
      block.end < rawText.length
    ) {
      e.preventDefault();
      const nextRaw = `${rawText.slice(0, block.end)}${rawText.slice(block.end + 1)}`;
      pendingFocusOffsetRef.current = { start: block.end, end: block.end };
      setEditingBlockStart(block.end);
      onChangeDocument(nextRaw, block.end, block.end);
      return;
    }

    // ArrowUp moves caret to the previous block when on the first line of the current block
    if (e.key === 'ArrowUp' && blockIdx > 0) {
      const textBeforeCaret = el.value.slice(0, localStart);
      if (!textBeforeCaret.includes('\n')) {
        e.preventDefault();
        const prevBlock = blocks[blockIdx - 1];
        if (prevBlock.type === 'image-block') {
          setIsSurfaceFocused(false);
          setEditingBlockStart(null);
          setSelectedImageBlockStart(prevBlock.start);
          return;
        }
        const targetOffset = Math.min(prevBlock.end, prevBlock.start + localStart);
        activateBlockAtOffset(targetOffset, targetOffset);
        return;
      }
    }

    // ArrowDown moves caret to the next block when on the last line of the current block
    if (e.key === 'ArrowDown' && blockIdx < blocks.length - 1) {
      const textAfterCaret = el.value.slice(localEnd);
      if (!textAfterCaret.includes('\n')) {
        e.preventDefault();
        const nextBlock = blocks[blockIdx + 1];
        if (nextBlock.type === 'image-block') {
          setIsSurfaceFocused(false);
          setEditingBlockStart(null);
          setSelectedImageBlockStart(nextBlock.start);
          return;
        }
        const currentLineCol = localStart - (el.value.lastIndexOf('\n', localStart - 1) + 1);
        const targetOffset = Math.min(nextBlock.end, nextBlock.start + currentLineCol);
        activateBlockAtOffset(targetOffset, targetOffset);
        return;
      }
    }

    // ArrowLeft at offset 0 jumps to the end of the previous block
    if (e.key === 'ArrowLeft' && localStart === 0 && localEnd === 0 && blockIdx > 0) {
      e.preventDefault();
      const prevBlock = blocks[blockIdx - 1];
      activateBlockAtOffset(prevBlock.end, prevBlock.end);
      return;
    }

    // ArrowRight at end of block jumps to the start of the next block
    if (
      e.key === 'ArrowRight' &&
      localStart === el.value.length &&
      localEnd === el.value.length &&
      blockIdx < blocks.length - 1
    ) {
      e.preventDefault();
      const nextBlock = blocks[blockIdx + 1];
      activateBlockAtOffset(nextBlock.start, nextBlock.start);
      return;
    }

    // Escape leaves math block editing to immediately show rendered formula
    if (e.key === 'Escape' && block.type === 'math-block') {
      e.preventDefault();
      el.blur();
      setIsSurfaceFocused(false);
      setEditingBlockStart(null);
    }
  };

  const handleRenderedClick = useCallback(
    (e, fallbackOffset) => {
      e.stopPropagation();
      const domSel = resolveDomSelectionInContainer(containerRef.current);
      if (domSel && !domSel.isCollapsed && domSel.end > domSel.start) {
        // User just finished dragging a highlight selection; keep the selection range!
        return;
      }
      const targetOffset =
        domSel && typeof domSel.start === 'number' ? domSel.start : fallbackOffset;
      activateBlockAtOffset(targetOffset, targetOffset);
    },
    [activateBlockAtOffset]
  );

  const handleContainerMouseUp = useCallback(() => {
    if (
      activeInputRef.current &&
      document.activeElement === activeInputRef.current
    ) {
      return;
    }
    const domSel = resolveDomSelectionInContainer(containerRef.current);
    if (!domSel || domSel.isCollapsed || domSel.end <= domSel.start) return;

    // Check if selection is contained within a single editable text block
    const singleBlock = blocks.find(
      (b) =>
        domSel.start >= b.start &&
        domSel.end <= b.end &&
        b.type !== 'math-block' &&
        b.type !== 'image-block'
    );
    if (singleBlock) {
      activateBlockAtOffset(domSel.start, domSel.end);
    } else {
      onSelectRange(domSel.start, domSel.end);
    }
  }, [activateBlockAtOffset, blocks, onSelectRange]);

  /**
   * Render inline tokens for a non-active block (or inactive tokens of a line).
   * Clicking any token places the caret directly into that token's character position,
   * while dragging across tokens preserves the highlighted selection.
   */
  const renderInlineTokens = (sliceStart, sliceEnd) => {
    if (sliceEnd <= sliceStart) return null;
    const tokens = tokenizeInline(rawText, sliceStart, sliceEnd);

    return tokens.map((tok) => {
      if (tok.type === 'text') {
        return (
          <span
            key={tok.start}
            onClick={(e) => handleRenderedClick(e, tok.end)}
          >
            {renderStyledSlice(rawText, tok.start, tok.end, charStyles, defaultFont)}
          </span>
        );
      }

      if (tok.type === 'bold') {
        return (
          <strong
            key={tok.start}
            className="font-semibold"
            onClick={(e) => handleRenderedClick(e, tok.innerEnd)}
          >
            {renderStyledSlice(rawText, tok.innerStart, tok.innerEnd, charStyles, defaultFont)}
          </strong>
        );
      }

      if (tok.type === 'italic') {
        return (
          <em
            key={tok.start}
            className="italic"
            onClick={(e) => handleRenderedClick(e, tok.innerEnd)}
          >
            {renderStyledSlice(rawText, tok.innerStart, tok.innerEnd, charStyles, defaultFont)}
          </em>
        );
      }

      if (tok.type === 'code') {
        return (
          <code
            key={tok.start}
            data-char-start={tok.innerStart}
            data-char-end={tok.innerEnd}
            onClick={(e) => handleRenderedClick(e, tok.innerEnd)}
            className="px-1.5 py-0.5 rounded-[4px] text-[14.5px] font-mono"
            style={{
              backgroundColor: 'var(--rz)',
              color: 'var(--tx)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {renderStyledSlice(
              rawText,
              tok.innerStart,
              tok.innerEnd,
              charStyles,
              defaultFont,
              '',
              'var(--font-mono)'
            )}
          </code>
        );
      }

      if (tok.type === 'inline-math') {
        const { html, error } = renderLatexSafely(tok.latex, false);
        const mathInk = charStyles[tok.start]?.ink || 'default';
        if (error) {
          return (
            <button
              key={tok.start}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                activateBlockAtOffset(tok.start + 1, tok.end - 1);
              }}
              title={`Click to fix LaTeX: ${error}`}
              className="katex-error inline-flex items-center gap-1.5 mx-0.5 cursor-pointer"
            >
              <span>{tok.raw}</span>
              <span className="text-[11px] text-[var(--ink-oxblood)]">({error})</span>
            </button>
          );
        }
        return (
          <span
            key={tok.start}
            data-char-start={tok.start}
            data-char-end={tok.end}
            role="button"
            tabIndex={0}
            aria-label={`Inline formula ${tok.latex}. Click to edit LaTeX.`}
            onClick={(e) => {
              e.stopPropagation();
              activateBlockAtOffset(tok.start + 1, tok.end - 1);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                activateBlockAtOffset(tok.start + 1, tok.end - 1);
              }
            }}
            className="inline-block px-0.5 rounded-[3px] hover:bg-[var(--rz)] cursor-text transition-colors"
            style={{
              color: mathInk !== 'default' ? `var(--ink-${mathInk}, var(--tx))` : undefined,
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      }

      if (tok.type === 'link') {
        const seconds =
          parseTimestampToSeconds(tok.label) ?? parseTimestampToSeconds(tok.href);
        if (seconds !== null) {
          return (
            <span
              key={tok.start}
              data-char-start={tok.start}
              data-char-end={tok.end}
              className="inline-flex items-center gap-0.5 mx-0.5 align-baseline"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onSeekTimestamp) onSeekTimestamp(seconds, tok.label);
                }}
                title={`Jump video to ${tok.label} (click edge to edit text)`}
                className="inline font-medium cursor-pointer transition-opacity hover:opacity-80 tabular-nums"
                style={{
                  color: 'var(--accent-text)',
                  textDecoration: 'underline dotted 1.5px',
                  textUnderlineOffset: '3.5px',
                }}
              >
                {tok.label}
              </button>
              <button
                type="button"
                aria-label={`Edit timestamp ${tok.label}`}
                title="Edit timestamp markdown"
                onClick={(e) => {
                  e.stopPropagation();
                  activateBlockAtOffset(tok.labelStart, tok.labelEnd);
                }}
                className="text-[10px] text-[var(--mu)] hover:text-[var(--tx)] px-0.5 rounded cursor-text opacity-60 hover:opacity-100"
              >
                ✎
              </button>
            </span>
          );
        }

        return (
          <span
            key={tok.start}
            data-char-start={tok.start}
            data-char-end={tok.end}
            className="inline-flex items-baseline gap-1"
          >
            <a
              href={tok.href}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(e) => e.stopPropagation()}
              className="underline underline-offset-2 transition-opacity hover:opacity-80"
              style={{ color: 'var(--accent-text)' }}
            >
              {tok.label}
            </a>
            <button
              type="button"
              aria-label={`Edit link ${tok.label}`}
              title="Edit link"
              onClick={(e) => {
                e.stopPropagation();
                activateBlockAtOffset(tok.labelStart, tok.labelEnd);
              }}
              className="text-[10px] text-[var(--mu)] hover:text-[var(--tx)] px-0.5 rounded cursor-text opacity-60 hover:opacity-100"
            >
              ✎
            </button>
          </span>
        );
      }

      if (tok.type === 'inline-image') {
        const { resolvedSrc, badgeTime } = resolveImageSource(tok.src, tok.alt);
        return (
          <span
            key={tok.start}
            onClick={(e) => {
              e.stopPropagation();
              activateBlockAtOffset(tok.start, tok.end);
            }}
            className="inline-flex items-center gap-2 px-2 py-1 rounded-[6px] border my-1 cursor-pointer"
            style={{ backgroundColor: 'var(--rz)', borderColor: 'var(--bd)' }}
          >
            {resolvedSrc && (
              <img
                src={resolvedSrc}
                alt={tok.alt}
                className="w-10 h-6 object-cover rounded-[3px]"
              />
            )}
            <span className="text-[12.5px] text-[var(--mu)]">
              {tok.alt || `Frame at ${badgeTime || '00:00'}`}
            </span>
          </span>
        );
      }

      return null;
    });
  };

  /**
   * Typography styling classes matching the block's semantic level while keeping
   * editing in-place at the exact same font size and line height.
   */
  const getBlockTypography = (blockType) => {
    switch (blockType) {
      case 'h1':
        return 'text-[30px] md:text-[34px] font-normal tracking-tight leading-tight mt-1 mb-2';
      case 'h2':
        return 'text-[22px] md:text-[24px] font-normal tracking-tight leading-snug mt-5 mb-1.5';
      case 'h3':
        return 'text-[18.5px] font-medium leading-snug mt-3.5 mb-1';
      case 'blockquote':
        return 'callout-box my-3 p-3.5 rounded-[6px] text-[16px] leading-relaxed';
      case 'ul-item':
      case 'ol-item':
        return 'text-[17px] leading-[1.65] my-1';
      default:
        return 'text-[17px] leading-[1.65] my-1.5';
    }
  };

  const getBlockTextSizing = (blockType) => {
    switch (blockType) {
      case 'h1':
        return 'text-[30px] md:text-[34px] font-normal tracking-tight leading-tight';
      case 'h2':
        return 'text-[22px] md:text-[24px] font-normal tracking-tight leading-snug';
      case 'h3':
        return 'text-[18.5px] font-medium leading-snug';
      case 'blockquote':
        return 'text-[16px] leading-relaxed';
      default:
        return 'text-[17px] leading-[1.65]';
    }
  };

  const activeBlockFontFamily = useMemo(() => {
    const fontKey = activeTypingStyle?.font || defaultFont || 'Newsreader';
    return NOTE_FONT_FAMILIES[fontKey] || NOTE_FONT_FAMILIES.Newsreader;
  }, [activeTypingStyle?.font, defaultFont]);

  return (
    <div
      ref={containerRef}
      id="note-page-content"
      role="textbox"
      aria-multiline="true"
      aria-label="Live note editor"
      tabIndex={-1}
      onMouseUp={handleContainerMouseUp}
      onPaste={(e) => {
        const items = e.clipboardData?.items;
        if (!items || !onPasteImageFile) return;
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              e.preventDefault();
              onPasteImageFile(file);
              return;
            }
          }
        }
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const domSel = resolveDomSelectionInContainer(containerRef.current);
          if (domSel && !domSel.isCollapsed && domSel.end > domSel.start) return;
          activateBlockAtOffset(rawText.length, rawText.length);
        }
      }}
      className="note-rendered-article w-full min-h-full px-6 md:px-9 py-6 cursor-text outline-none"
      style={{
        fontFamily: NOTE_FONT_FAMILIES[defaultFont] || NOTE_FONT_FAMILIES.Newsreader,
        color: 'var(--tx)',
        backgroundColor: 'var(--pn)',
      }}
    >
      {blocks.map((block, blockIdx) => {
        const isEditingThisBlock =
          isSurfaceFocused && activeBlock && activeBlock.start === block.start;

        // 1. Standalone Image Block (always rendered as a figure card with editable caption & remove button)
        if (block.type === 'image-block') {
          const { frameMatch, resolvedSrc, badgeTime } = resolveImageSource(
            block.src,
            block.alt
          );
          const isImageSelected = selectedImageBlockStart === block.start;

          return (
            <div
              key={block.id}
              role="figure"
              tabIndex={0}
              aria-label={block.alt || 'Captured frame'}
              onFocus={() => setSelectedImageBlockStart(block.start)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget)) {
                  setSelectedImageBlockStart(null);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Delete' || e.key === 'Backspace') {
                  if (document.activeElement === e.currentTarget) {
                    e.preventDefault();
                    removeBlockEntirely(block);
                  }
                } else if (e.key === 'ArrowUp' && blockIdx > 0) {
                  e.preventDefault();
                  const prev = blocks[blockIdx - 1];
                  activateBlockAtOffset(prev.end, prev.end);
                } else if (e.key === 'ArrowDown' && blockIdx < blocks.length - 1) {
                  e.preventDefault();
                  const next = blocks[blockIdx + 1];
                  activateBlockAtOffset(next.start, next.start);
                }
              }}
              className="inline-frame-card group relative my-3.5 p-2.5 rounded-[8px] flex items-center gap-4 border outline-none transition-colors"
              style={{
                backgroundColor: 'var(--rz)',
                borderColor: isImageSelected ? 'var(--accent)' : 'var(--bd)',
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (frameMatch && onInspectFrame) {
                    onInspectFrame(frameMatch);
                  } else if (badgeTime && onSeekTimestamp) {
                    const sec = parseTimestampToSeconds(badgeTime);
                    if (sec !== null) onSeekTimestamp(sec, badgeTime);
                  }
                }}
                className="relative w-[132px] aspect-video rounded-[6px] overflow-hidden bg-black/40 flex items-center justify-center shrink-0 border cursor-pointer"
                style={{ borderColor: 'var(--bd2)' }}
              >
                {resolvedSrc ? (
                  <img
                    src={resolvedSrc}
                    alt={block.alt || 'Frame preview'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span
                    className="text-[13px] italic font-serif text-[var(--tx)]"
                    style={{ fontFamily: 'var(--font-serif)' }}
                  >
                    {frameMatch?.label || 'Frame'}
                  </span>
                )}
                {badgeTime && (
                  <span
                    className="absolute bottom-1 left-1 px-1 py-0.2 text-[9.5px] font-medium rounded-[3px] tabular-nums"
                    style={{
                      backgroundColor: 'rgba(15, 14, 12, 0.88)',
                      color: '#f2eee6',
                    }}
                  >
                    {badgeTime}
                  </span>
                )}
              </button>

              {/* Editable caption in place */}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <input
                  type="text"
                  dir="auto"
                  value={block.alt}
                  aria-label="Image caption"
                  placeholder="Add a caption..."
                  onChange={(e) => updateImageCaption(block, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'ArrowDown') {
                      e.preventDefault();
                      if (blockIdx < blocks.length - 1) {
                        activateBlockAtOffset(blocks[blockIdx + 1].start);
                      } else {
                        replaceBlockRange(block.end, block.end, '\n', block.end + 1);
                      }
                    }
                  }}
                  className="w-full bg-transparent text-[13.5px] text-[var(--tx)] placeholder:text-[var(--mu)] outline-none border-b border-transparent focus:border-[var(--bd2)] py-0.5"
                />
                {badgeTime && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const sec = parseTimestampToSeconds(badgeTime);
                      if (sec !== null && onSeekTimestamp) {
                        onSeekTimestamp(sec, badgeTime);
                      }
                    }}
                    className="self-start text-[11px] text-[var(--accent-text)] hover:underline mt-0.5 tabular-nums cursor-pointer"
                  >
                    Jump to {badgeTime}
                  </button>
                )}
              </div>

              {/* Visible remove button on hover or focus */}
              <button
                type="button"
                aria-label={`Remove ${block.alt || 'image'} from note`}
                title="Remove image from note (Delete)"
                onClick={(e) => {
                  e.stopPropagation();
                  removeBlockEntirely(block);
                }}
                className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 p-1.5 rounded-[5px] text-[var(--mu)] hover:text-[var(--tx)] hover:bg-[var(--pn)] transition-opacity cursor-pointer shrink-0"
                style={{ border: '1px solid var(--bd)' }}
              >
                <CloseIcon size={12} />
              </button>
            </div>
          );
        }

        // 2. Display Math Block ($$ ... $$)
        if (block.type === 'math-block') {
          if (isEditingThisBlock) {
            const { html: livePreviewHtml, error: liveError } = renderLatexSafely(
              block.latex,
              true
            );
            return (
              <div
                key={block.id}
                className="my-3.5 rounded-[6px] border p-3 transition-colors"
                style={{
                  backgroundColor: 'var(--rz)',
                  borderColor: 'var(--accent)',
                }}
              >
                <textarea
                  ref={activeInputRef}
                  dir="ltr"
                  value={block.raw}
                  aria-label="Edit block formula LaTeX"
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    const selS = e.target.selectionStart ?? nextVal.length;
                    replaceBlockRange(block.start, block.end, nextVal, block.start + selS);
                  }}
                  onSelect={(e) => {
                    const s = block.start + (e.currentTarget.selectionStart ?? 0);
                    const end = block.start + (e.currentTarget.selectionEnd ?? 0);
                    onSelectRange(s, end);
                  }}
                  onBlur={() => {
                    setIsSurfaceFocused(false);
                    setEditingBlockStart(null);
                  }}
                  onKeyDown={(e) => handleBlockInputKeyDown(e, block, blockIdx)}
                  rows={Math.max(2, block.raw.split('\n').length)}
                  className="w-full bg-transparent font-mono text-[13.5px] leading-relaxed text-[var(--tx)] outline-none resize-none"
                  style={{ fontFamily: 'var(--font-mono)' }}
                />
                {/* Live rendered preview or local error while editing */}
                <div
                  className="mt-2 pt-2 border-t flex items-center justify-center overflow-x-auto"
                  style={{ borderColor: 'var(--bd)' }}
                >
                  {liveError ? (
                    <span className="katex-error text-[12px]">
                      LaTeX syntax issue: {liveError}
                    </span>
                  ) : (
                    <div
                      className="text-center"
                      dangerouslySetInnerHTML={{ __html: livePreviewHtml }}
                    />
                  )}
                </div>
              </div>
            );
          }

          const { html, error } = renderLatexSafely(block.latex, true);
          return (
            <div
              key={block.id}
              role="button"
              tabIndex={0}
              aria-label={`Math block: ${block.latex}. Click to edit LaTeX.`}
              onClick={(e) => {
                e.stopPropagation();
                // Place caret inside the $$ delimiters
                const innerOffset = Math.min(block.end - 2, block.start + 3);
                activateBlockAtOffset(innerOffset, innerOffset);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  const innerOffset = Math.min(block.end - 2, block.start + 3);
                  activateBlockAtOffset(innerOffset, innerOffset);
                }
              }}
              className="formula-block my-3.5 cursor-text"
            >
              {error ? (
                <div className="katex-error p-3 rounded-[6px] flex items-center justify-between gap-3">
                  <code className="font-mono text-[12.5px] truncate">{block.latex || block.raw}</code>
                  <span className="text-[11.5px] text-[var(--ink-oxblood)] shrink-0">
                    Syntax error: {error} (click to edit)
                  </span>
                </div>
              ) : (
                <div dangerouslySetInnerHTML={{ __html: html }} />
              )}
            </div>
          );
        }

        // 3. Active Line Editing (Headings, Callouts/Blockquotes, Lists, Paragraphs)
        // Reveals raw markdown syntax ONLY on this active line while rendering per-character ink colors permanently!
        if (isEditingThisBlock) {
          const typographyClass = getBlockTypography(block.type);
          const textSizingClass = getBlockTextSizing(block.type);
          return (
            <div
              key={block.id}
              data-block-start={block.start}
              data-block-end={block.end}
              className={`relative grid ${typographyClass}`}
              style={
                block.type === 'blockquote'
                  ? { backgroundColor: 'var(--callout-bg)', color: 'var(--tx)' }
                  : undefined
              }
            >
              {/* Per-character styled backdrop so highlighted/colored words keep their permanent color while editing */}
              <div
                aria-hidden="true"
                dir="auto"
                className={`w-full pointer-events-none select-none whitespace-pre-wrap break-words overflow-hidden p-0 m-0 ${textSizingClass}`}
                style={{
                  gridArea: '1 / 1',
                  fontFamily: activeBlockFontFamily,
                }}
              >
                {block.raw ? (
                  <>
                    {renderStyledSlice(
                      rawText,
                      block.start,
                      block.end,
                      charStyles,
                      defaultFont,
                      '',
                      activeBlockFontFamily
                    )}
                    {block.raw.endsWith('\n') ? '\n ' : ''}
                  </>
                ) : blockIdx === 0 && blocks.length === 1 ? (
                  <span className="text-[var(--mu)]">
                    Type notes, / for ML formulas, or $...$ for math...
                  </span>
                ) : (
                  <span>&nbsp;</span>
                )}
              </div>

              <textarea
                ref={activeInputRef}
                dir="auto"
                rows={1}
                value={block.raw}
                aria-label="Edit note line"
                onChange={(e) => {
                  const nextVal = e.target.value;
                  const selS = e.target.selectionStart ?? nextVal.length;
                  replaceBlockRange(block.start, block.end, nextVal, block.start + selS);
                }}
                onSelect={(e) => {
                  const s = block.start + (e.currentTarget.selectionStart ?? 0);
                  const end = block.start + (e.currentTarget.selectionEnd ?? 0);
                  onSelectRange(s, end);
                }}
                onBlur={() => {
                  setIsSurfaceFocused(false);
                  setEditingBlockStart(null);
                }}
                onKeyDown={(e) => handleBlockInputKeyDown(e, block, blockIdx)}
                className={`live-note-overlay-textarea w-full bg-transparent outline-none resize-none overflow-hidden block whitespace-pre-wrap break-words p-0 m-0 border-0 ${textSizingClass}`}
                style={{
                  gridArea: '1 / 1',
                  fontFamily: activeBlockFontFamily,
                  color: 'transparent',
                  caretColor: 'var(--tx)',
                }}
              />
            </div>
          );
        }

        // 4. Rendered Line (caret is NOT on this line -> markdown syntax tucks away cleanly)
        const typographyClass = getBlockTypography(block.type);

        if (block.type === 'h1' || block.type === 'h2' || block.type === 'h3') {
          const HeadingTag = block.type;
          return (
            <HeadingTag
              key={block.id}
              data-block-start={block.start}
              data-block-end={block.end}
              dir="auto"
              onClick={(e) => handleRenderedClick(e, block.end)}
              className={`${typographyClass} cursor-text`}
            >
              {renderInlineTokens(block.bodyStart, block.end)}
            </HeadingTag>
          );
        }

        if (block.type === 'blockquote') {
          return (
            <div
              key={block.id}
              data-block-start={block.start}
              data-block-end={block.end}
              dir="auto"
              onClick={(e) => handleRenderedClick(e, block.end)}
              className={`${typographyClass} cursor-text`}
              style={{
                backgroundColor: 'var(--callout-bg)',
                color: 'var(--tx)',
              }}
            >
              {renderInlineTokens(block.bodyStart, block.end)}
            </div>
          );
        }

        if (block.type === 'ul-item') {
          return (
            <div
              key={block.id}
              data-block-start={block.start}
              data-block-end={block.end}
              dir="auto"
              onClick={(e) => handleRenderedClick(e, block.end)}
              className={`${typographyClass} flex items-baseline gap-2.5 pl-2 cursor-text`}
            >
              <span
                aria-hidden="true"
                className="text-[var(--mu)] select-none shrink-0"
              >
                •
              </span>
              <div className="flex-1 min-w-0">
                {renderInlineTokens(block.bodyStart, block.end)}
              </div>
            </div>
          );
        }

        if (block.type === 'ol-item') {
          return (
            <div
              key={block.id}
              data-block-start={block.start}
              data-block-end={block.end}
              dir="auto"
              onClick={(e) => handleRenderedClick(e, block.end)}
              className={`${typographyClass} flex items-baseline gap-2 pl-1 cursor-text`}
            >
              <span
                aria-hidden="true"
                className="text-[var(--mu)] select-none tabular-nums shrink-0 font-medium text-[15px]"
              >
                {block.numberLabel}
              </span>
              <div className="flex-1 min-w-0">
                {renderInlineTokens(block.bodyStart, block.end)}
              </div>
            </div>
          );
        }

        // Empty paragraph line (preserves vertical spacing and lets user click to place caret)
        if (!block.raw.trim()) {
          return (
            <div
              key={block.id}
              data-block-start={block.start}
              data-block-end={block.end}
              onClick={(e) => handleRenderedClick(e, block.start)}
              className="h-[24px] w-full cursor-text"
            >
              {blocks.length === 1 && (
                <span className="text-[var(--mu)] text-[15px] select-none pointer-events-none">
                  Start typing notes, use / for formulas, or write LaTeX in $...$
                </span>
              )}
            </div>
          );
        }

        return (
          <p
            key={block.id}
            data-block-start={block.start}
            data-block-end={block.end}
            dir="auto"
            onClick={(e) => handleRenderedClick(e, block.end)}
            className={`${typographyClass} cursor-text`}
          >
            {renderInlineTokens(block.bodyStart, block.end)}
          </p>
        );
      })}
    </div>
  );
});
