import { describe, it, expect } from 'vitest';
import {
  parseYouTubeUrl,
  formatSeconds,
  parseTimestampToSeconds,
} from './youtube.js';
import {
  searchFormulaLibrary,
  findExactLocalFormula,
  cleanAndValidateLatex,
  cleanLatex,
} from './formulas.js';
import {
  sanitizeFilename,
  resolveMarkdownImagesForExport,
} from './export.js';
import { fileToBase64 } from './fileToBase64.js';
import { saveToDisk } from './saveToDisk.js';
import { transcribeImage } from './transcribeImage.js';
import {
  parseNoteContent,
  serializeNoteContent,
  getStyleAtSelection,
  applyStyleToRange,
  reconcileCharStylesOnEdit,
} from './noteDocument.js';
import { extractReferencedFrameIds } from '../hooks/useDebouncedLocalStorage.js';

describe('YouTube URL Parsing & Timestamp Utilities', () => {
  it('parses standard watch URLs with start time', () => {
    const res = parseYouTubeUrl('https://www.youtube.com/watch?v=IHZwWFHWa-w&t=2m15s');
    expect(res.isValid).toBe(true);
    expect(res.videoId).toBe('IHZwWFHWa-w');
    expect(res.startTime).toBe(135);
    expect(res.canonicalUrl).toBe('https://www.youtube.com/watch?v=IHZwWFHWa-w');
  });

  it('parses short youtu.be URLs and embed URLs', () => {
    const shortRes = parseYouTubeUrl('youtu.be/IHZwWFHWa-w?t=90');
    expect(shortRes.isValid).toBe(true);
    expect(shortRes.videoId).toBe('IHZwWFHWa-w');
    expect(shortRes.startTime).toBe(90);

    const embedRes = parseYouTubeUrl('https://www.youtube.com/embed/IHZwWFHWa-w?start=45');
    expect(embedRes.isValid).toBe(true);
    expect(embedRes.videoId).toBe('IHZwWFHWa-w');
    expect(embedRes.startTime).toBe(45);
  });

  it('rejects non-YouTube domains and malformed IDs with plain error messages', () => {
    const invalidHost = parseYouTubeUrl('https://example.com/video/123');
    expect(invalidHost.isValid).toBe(false);
    expect(invalidHost.error).toBeTruthy();

    const badId = parseYouTubeUrl('https://www.youtube.com/watch?v=short');
    expect(badId.isValid).toBe(false);
    expect(badId.error).toBeTruthy();
  });

  it('formats and parses timestamps accurately', () => {
    expect(formatSeconds(754)).toBe('12:34');
    expect(formatSeconds(3725)).toBe('1:02:05');
    expect(parseTimestampToSeconds('12:34')).toBe(754);
    expect(parseTimestampToSeconds('#t=01:02:05')).toBe(3725);
  });
});

describe('Formula Slash Library & LaTeX Sanitizer', () => {
  it('resolves built-in ML formulas via slash commands or natural names', () => {
    const gd = findExactLocalFormula('/gd');
    expect(gd).not.toBeNull();
    expect(gd.latex).toContain('\\theta_j');

    const softmax = findExactLocalFormula('softmax');
    expect(softmax).not.toBeNull();
    expect(softmax.latex).toContain('\\sum');

    const searchResults = searchFormulaLibrary('/cost');
    expect(searchResults.length).toBeGreaterThan(0);
  });

  it('strips markdown fences, dollar wrappers, and validates KaTeX syntax', () => {
    const fenced = '```latex\n$$\\theta_j := \\theta_j - \\alpha \\nabla J(\\theta)$$\n```';
    const cleaned = cleanAndValidateLatex(fenced, 'block');
    expect(cleaned.isValid).toBe(true);
    expect(cleaned.latex).toBe('\\theta_j := \\theta_j - \\alpha \\nabla J(\\theta)');
    expect(cleaned.wrapped).toBe('$$\n\\theta_j := \\theta_j - \\alpha \\nabla J(\\theta)\n$$');
  });

  it('flags broken KaTeX syntax without throwing an unhandled exception', () => {
    const broken = '\\frac{1}{unclosed';
    const res = cleanAndValidateLatex(broken, 'block');
    expect(res.isValid).toBe(false);
    expect(res.error).toBeTruthy();
    expect(res.wrapped).toContain('\\frac{1}{unclosed');
  });

  it('extracts clean math from chain-of-thought preamble and deduplicates repeated blocks (cleanLatex)', () => {
    const withPreamble =
      'Let us analyze the image carefully to transcribe the equation step by step:\n$$J(\\theta) = \\frac{1}{2m} \\sum (h_\\theta(x) - y)^2$$';
    expect(cleanLatex(withPreamble)).toBe(
      '$$J(\\theta) = \\frac{1}{2m} \\sum (h_\\theta(x) - y)^2$$'
    );

    const duplicated = '$$E = mc^2$$\n$$E = mc^2$$';
    expect(cleanLatex(duplicated)).toBe('$$E = mc^2$$');
  });

  it('exposes merged compatibility helpers (fileToBase64, saveToDisk, transcribeImage)', async () => {
    expect(typeof fileToBase64).toBe('function');
    expect(typeof saveToDisk).toBe('function');
    expect(typeof transcribeImage).toBe('function');

    const b64Res = await fileToBase64('data:image/jpeg;base64,QUJD');
    expect(b64Res.base64).toBe('QUJD');
  });
});

describe('Inline Word-Processor Styling & Note Document Serialization', () => {
  it('parses and serializes per-word ink and font runs while migrating legacy swatch names', () => {
    const stored =
      'Normal text <span data-ink="rose" data-font="Lora">oxblood serif</span> and <span data-ink="verdigris">green</span>.';
    const parsed = parseNoteContent(stored, 'Newsreader', 'default');

    expect(parsed.rawText).toBe('Normal text oxblood serif and green.');
    // Check that legacy "rose" migrated to "oxblood"
    const styleAtOxblood = getStyleAtSelection(
      parsed.rawText,
      parsed.charStyles,
      15,
      15,
      'Newsreader',
      'default'
    );
    expect(styleAtOxblood.ink).toBe('oxblood');
    expect(styleAtOxblood.font).toBe('Lora');

    // Check that plain text stayed default
    const styleAtNormal = getStyleAtSelection(
      parsed.rawText,
      parsed.charStyles,
      3,
      3,
      'Newsreader',
      'default'
    );
    expect(styleAtNormal.ink).toBe('default');
    expect(styleAtNormal.font).toBe('Newsreader');

    // Re-serialize and verify round-trip
    const reserialized = serializeNoteContent(
      parsed.rawText,
      parsed.charStyles,
      'Newsreader',
      'default'
    );
    expect(reserialized).toBe(
      'Normal text <span data-ink="oxblood" data-font="Lora">oxblood serif</span> and <span data-ink="verdigris">green</span>.'
    );
  });

  it('changes only the selected range when applying a color or font to a selection', () => {
    const initial = parseNoteContent('Hello world today', 'Newsreader', 'default');
    // Select "world" (indices 6..11) and apply plum ink + Kalam font
    const updatedStyles = applyStyleToRange(
      initial.charStyles,
      6,
      11,
      { ink: 'plum', font: 'Kalam' },
      'Newsreader',
      'default'
    );
    const out = serializeNoteContent(initial.rawText, updatedStyles, 'Newsreader', 'default');
    expect(out).toBe('Hello <span data-ink="plum" data-font="Kalam">world</span> today');
  });

  it('applies active typing style only to newly typed characters from caret onward', () => {
    const initial = parseNoteContent('Hello ', 'Newsreader', 'default');
    const newText = 'Hello world';
    const reconciled = reconcileCharStylesOnEdit(
      initial.rawText,
      initial.charStyles,
      newText,
      { ink: 'cobalt', font: 'DM Sans' },
      'Newsreader',
      'default'
    );
    const out = serializeNoteContent(newText, reconciled, 'Newsreader', 'default');
    expect(out).toBe('Hello <span data-ink="cobalt" data-font="DM Sans">world</span>');
  });
});

describe('Markdown Export & Persistent Note Image Resolution', () => {
  it('sanitizes tab titles including bilingual characters for safe filenames', () => {
    expect(sanitizeFilename('Gradient Descent: Lecture #3!', 'md')).toBe(
      'gradient-descent-lecture-3.md'
    );
  });

  it('resolves internal frame:// references from both active tray frames and persistent mediaById cache', () => {
    const md =
      '# Notes\n\n![Frame at 12:34](frame://f-101)\n\n![Deleted from tray](frame://f-202)\n';
    const frames = [
      {
        id: 'f-101',
        timestamp: '12:34',
        dataUrl: 'data:image/jpeg;base64,TRAY_IMAGE',
      },
    ];
    const mediaById = {
      'f-202': {
        dataUrl: 'data:image/jpeg;base64,PERSISTED_NOTE_IMAGE',
      },
    };
    const exported = resolveMarkdownImagesForExport(md, frames, mediaById);
    expect(exported).toContain('![Frame at 12:34](data:image/jpeg;base64,TRAY_IMAGE)');
    expect(exported).toContain(
      '![Deleted from tray](data:image/jpeg;base64,PERSISTED_NOTE_IMAGE)'
    );
  });

  it('extracts all referenced frame:// IDs across tabs so tray deletion never orphans note images', () => {
    const tabs = [
      { id: 't1', content: 'Text ![cap](frame://img-1) and ![cap2](frame://img-2)' },
      { id: 't2', content: 'Another ![cap3](frame://img-3)' },
    ];
    const refs = extractReferencedFrameIds(tabs);
    expect(refs.has('img-1')).toBe(true);
    expect(refs.has('img-2')).toBe(true);
    expect(refs.has('img-3')).toBe(true);
    expect(refs.has('img-4')).toBe(false);
  });
});
