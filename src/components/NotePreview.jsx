import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { parseTimestampToSeconds } from '../lib/youtube';

const FONT_FAMILIES = {
  Newsreader: "'Newsreader', 'Cairo', 'Tajawal', Georgia, serif",
  Lora: "'Lora', 'Cairo', 'Tajawal', Georgia, serif",
  'DM Sans': "'DM Sans', 'Cairo', 'Tajawal', sans-serif",
  Kalam: "'Kalam', 'Cairo', 'Tajawal', cursive",
  Cairo: "'Cairo', 'DM Sans', sans-serif",
  Tajawal: "'Tajawal', 'DM Sans', sans-serif",
};

export function NotePreview({
  content,
  noteFont,
  onSeekTimestamp,
  onInspectFrame,
  onSwitchToWrite,
  frames = [],
}) {
  const activeFontFamily = FONT_FAMILIES[noteFont] || FONT_FAMILIES.Newsreader;

  if (!content || !content.trim()) {
    return (
      <div
        id="note-page-content"
        className="w-full h-full flex flex-col items-center justify-center p-9 text-center select-none"
        style={{
          color: 'var(--mu)',
          backgroundColor: 'var(--pn)',
        }}
      >
        <p className="text-[14px] max-w-[340px] leading-relaxed mb-3">
          This note is empty. Switch to Write mode to type markdown and LaTeX, or capture a frame from the lecture.
        </p>
        {onSwitchToWrite && (
          <button
            type="button"
            onClick={onSwitchToWrite}
            className="h-[32px] px-3 rounded-[6px] text-[12.5px] font-medium cursor-pointer"
            style={{
              backgroundColor: 'var(--rz)',
              color: 'var(--tx)',
              border: '1px solid var(--bd2)',
            }}
          >
            Start writing
          </button>
        )}
      </div>
    );
  }

  return (
    <article
      id="note-page-content"
      className="note-rendered-article w-full h-full overflow-y-auto px-6 md:px-9 py-6 select-text"
      style={{
        fontFamily: activeFontFamily,
        color: 'var(--tx)',
        backgroundColor: 'var(--pn)',
      }}
    >
      <ReactMarkdown
        urlTransform={(url) => url}
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, errorColor: '#d98a86', strict: 'ignore' }]]}
        components={{
          h1: ({ children }) => (
            <h1
              dir="auto"
              className="text-[32px] md:text-[36px] font-normal tracking-tight text-[var(--tx)] mb-1 leading-tight"
              style={{ fontFamily: activeFontFamily }}
            >
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2
              dir="auto"
              className="text-[23px] md:text-[24px] font-normal tracking-tight text-[var(--tx)] mt-6 mb-2"
              style={{ fontFamily: activeFontFamily }}
            >
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3
              dir="auto"
              className="text-[19px] font-medium text-[var(--tx)] mt-4 mb-2"
              style={{ fontFamily: activeFontFamily }}
            >
              {children}
            </h3>
          ),
          p: ({ children }) => (
            <p dir="auto" className="text-[17px] leading-[1.65] my-3 text-[var(--tx)]">
              {children}
            </p>
          ),
          blockquote: ({ children }) => (
            <div
              dir="auto"
              className="callout-box my-4 p-3.5 rounded-[6px] text-[15.5px] leading-relaxed transition-colors"
              style={{
                backgroundColor: 'var(--callout-bg)',
                color: 'var(--tx)',
              }}
            >
              {children}
            </div>
          ),
          ul: ({ children }) => (
            <ul dir="auto" className="list-disc pl-5 my-3.5 space-y-1.5 text-[17px] leading-[1.65]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol dir="auto" className="list-decimal pl-5 my-3.5 space-y-1.5 text-[17px] leading-[1.65]">
              {children}
            </ol>
          ),
          li: ({ children }) => <li dir="auto">{children}</li>,
          a: ({ href, children }) => {
            const textContent = String(children);
            const seconds =
              parseTimestampToSeconds(textContent) ?? parseTimestampToSeconds(href);

            if (seconds !== null) {
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    if (onSeekTimestamp) onSeekTimestamp(seconds, textContent);
                  }}
                  title={`Jump video to ${textContent}`}
                  className="inline font-medium cursor-pointer transition-opacity hover:opacity-80 tabular-nums"
                  style={{
                    color: 'var(--accent-text)',
                    textDecoration: 'underline dotted 1.5px',
                    textUnderlineOffset: '3.5px',
                  }}
                >
                  {children}
                </button>
              );
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-2 transition-opacity hover:opacity-80"
                style={{ color: 'var(--accent-text)' }}
              >
                {children}
              </a>
            );
          },
          img: ({ src, alt }) => {
            const rawToken = (src || '').replace(/^frame:\/\//, '').trim();
            const frameMatch = frames.find(
              (f) =>
                f.id === rawToken ||
                f.timestamp === rawToken ||
                f.dataUrl === src ||
                (src && f.id && src.includes(f.id)) ||
                (alt && f.timestamp && alt.includes(f.timestamp))
            );

            const resolvedSrc =
              frameMatch?.dataUrl || (src && !src.startsWith('frame://') ? src : null);
            const badgeTime = frameMatch?.timestamp || (rawToken.includes(':') ? rawToken : null);

            return (
              <span
                role="figure"
                aria-label={alt || 'Captured frame'}
                className="inline-frame-card my-4 p-2.5 rounded-[8px] flex items-center gap-4 border"
                style={{
                  backgroundColor: 'var(--rz)',
                  borderColor: 'var(--bd)',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (frameMatch && onInspectFrame) {
                      onInspectFrame(frameMatch);
                    } else if (badgeTime && onSeekTimestamp) {
                      const sec = parseTimestampToSeconds(badgeTime);
                      if (sec !== null) onSeekTimestamp(sec, badgeTime);
                    }
                  }}
                  className="relative w-[124px] aspect-video rounded-[6px] overflow-hidden bg-black/40 flex items-center justify-center shrink-0 border cursor-pointer"
                  style={{ borderColor: 'var(--bd2)' }}
                >
                  {resolvedSrc ? (
                    <img
                      src={resolvedSrc}
                      alt={alt || 'Frame preview'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span
                      className="text-[13px] italic font-serif text-[var(--tx)]"
                      style={{ fontFamily: 'var(--font-serif)' }}
                    >
                      {frameMatch?.label || 'J(θ)'}
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
                <span className="flex flex-col justify-center min-w-0">
                  <span dir="auto" className="text-[13.5px] text-[var(--mu)] font-normal">
                    {alt || `Frame at ${badgeTime || '12:34'}`}
                  </span>
                </span>
              </span>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
