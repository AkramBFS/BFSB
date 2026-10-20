import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CloseIcon, SigmaIcon, InsertNoteIcon, SendArrowIcon } from './Icons';

export function FrameViewerDialog({
  frame,
  open,
  onOpenChange,
  onInsertIntoNote,
  onSnapToLatex,
  onAttachToChat,
  onSeekToFrame,
  isTranscribing = false,
}) {
  if (!frame) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 bg-black/70"
          style={{ backdropFilter: 'blur(2px)' }}
        />
        <Dialog.Content
          aria-describedby="frame-viewer-desc"
          className="fixed left-1/2 top-1/2 z-50 w-[94vw] max-w-[740px] -translate-x-1/2 -translate-y-1/2 rounded-[8px] overflow-hidden focus:outline-none"
          style={{
            backgroundColor: 'var(--pn)',
            color: 'var(--tx)',
            border: '1px solid var(--bd2)',
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: 'var(--bd)' }}
          >
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  if (onSeekToFrame && typeof frame.seconds === 'number') {
                    onSeekToFrame(frame.seconds, frame.timestamp);
                  }
                }}
                className="px-2 py-0.5 text-[11.5px] font-medium rounded-[4px] tabular-nums cursor-pointer"
                style={{
                  backgroundColor: 'var(--rz)',
                  color: 'var(--accent-text)',
                  border: '1px solid var(--bd2)',
                }}
              >
                {frame.timestamp || '00:00'}
              </button>
              <Dialog.Title className="text-[14px] font-medium m-0">
                {frame.caption || `Captured frame at ${frame.timestamp}`}
              </Dialog.Title>
            </div>
            <Dialog.Description id="frame-viewer-desc" className="sr-only">
              Full preview of captured video frame with actions to transcribe math or insert into note.
            </Dialog.Description>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close frame preview"
                className="w-[28px] h-[28px] rounded-[6px] flex items-center justify-center text-[var(--mu)] hover:text-[var(--tx)] hover:bg-[var(--rz)] cursor-pointer"
              >
                <CloseIcon size={14} />
              </button>
            </Dialog.Close>
          </div>

          <div className="p-4 bg-[#0d0c0b] flex items-center justify-center max-h-[65vh] overflow-hidden">
            {frame.dataUrl ? (
              <img
                src={frame.dataUrl}
                alt={frame.caption || `Frame at ${frame.timestamp}`}
                className="max-w-full max-h-[60vh] object-contain rounded-[4px]"
              />
            ) : (
              <div className="py-16 text-center text-[#aaa398]">
                <span className="text-[28px] italic font-serif block mb-2">
                  {frame.label || 'Frame'}
                </span>
                <span className="text-[12px]">Preview image</span>
              </div>
            )}
          </div>

          <div
            className="flex items-center justify-between gap-2 px-4 py-3 border-t flex-wrap"
            style={{ borderColor: 'var(--bd)', backgroundColor: 'var(--pn)' }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  onInsertIntoNote(frame);
                  onOpenChange(false);
                }}
                className="inline-flex items-center gap-1.5 h-[32px] px-3 rounded-[6px] text-[12.5px] font-medium cursor-pointer"
                style={{
                  backgroundColor: 'var(--rz)',
                  color: 'var(--tx)',
                  border: '1px solid var(--bd2)',
                }}
              >
                <InsertNoteIcon size={14} className="text-[var(--accent-text)]" />
                <span>Add to note as is</span>
              </button>

              <button
                type="button"
                disabled={isTranscribing}
                onClick={() => {
                  onSnapToLatex(frame);
                  onOpenChange(false);
                }}
                className="inline-flex items-center gap-1.5 h-[32px] px-3 rounded-[6px] text-[12.5px] font-medium cursor-pointer"
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--tx)',
                  border: '1px solid var(--bd2)',
                }}
              >
                <SigmaIcon size={14} className="text-[var(--accent-text)]" />
                <span>Read the formula</span>
              </button>

              {onAttachToChat && (
                <button
                  type="button"
                  onClick={() => {
                    onAttachToChat(frame);
                    onOpenChange(false);
                  }}
                  className="inline-flex items-center gap-1.5 h-[32px] px-3 rounded-[6px] text-[12.5px] font-medium cursor-pointer"
                  style={{
                    backgroundColor: 'transparent',
                    color: 'var(--tx)',
                    border: '1px solid var(--bd2)',
                  }}
                >
                  <SendArrowIcon size={14} className="text-[var(--accent-text)]" />
                  <span>Send to chat</span>
                </button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
