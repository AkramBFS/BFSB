import React, { useRef, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  UploadIcon,
  SigmaIcon,
  SendArrowIcon,
  TrashIcon,
  InsertNoteIcon,
} from './Icons';
import { compressImageDataUrl } from '../lib/storage';
import { generateSampleMathSlide } from '../lib/frameCapture';
import { useToast } from './ToastContext';

let uploadIdCounter = 1;
function createFrameId(prefix = 'img') {
  uploadIdCounter += 1;
  return `${prefix}-${Date.now()}-${uploadIdCounter}`;
}

export function FramesTray({
  frames = [],
  currentTimeStr = '00:00',
  currentSeconds = 0,
  youtubeUrl = '',
  onInsertFrameToNote,
  onSnapFrameToLatex,
  onAttachFrameToChat,
  onDeleteFrame,
  onUploadImage,
  onInspectFrame,
  transcribingFrameId = null,
}) {
  const fileInputRef = useRef(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [openMenuFrameId, setOpenMenuFrameId] = useState(null);
  const { showToast } = useToast();

  const processImageFile = async (file, sourceLabel = 'Uploaded') => {
    if (!file || !file.type.startsWith('image/')) {
      showToast('Select a valid image file (PNG, JPEG, WebP).', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const rawDataUrl = reader.result;
        const compressed = await compressImageDataUrl(rawDataUrl, {
          maxWidth: 1280,
          maxHeight: 720,
          quality: 0.85,
        });
        const cleanName = file.name ? file.name.replace(/\.[^/.]+$/, '').slice(0, 18) : 'Image';
        const newFrame = {
          id: createFrameId('img'),
          timestamp: currentTimeStr || '00:00',
          seconds: Math.floor(currentSeconds || 0),
          videoUrl: youtubeUrl,
          label: cleanName,
          caption: `Frame at ${currentTimeStr || '00:00'} · ${cleanName}`,
          dataUrl: compressed.dataUrl,
          base64: compressed.base64,
          width: compressed.width,
          height: compressed.height,
        };
        onUploadImage(newFrame);
        showToast(`${sourceLabel} image added to captured frames tray`);
      } catch {
        showToast('Could not process that image file.', 'error');
      }
    };
    reader.onerror = () => showToast('Could not read the selected image file.', 'error');
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file, 'Uploaded');
    }
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      processImageFile(file, 'Dropped');
    }
  };

  const handleAddSampleSlide = () => {
    const slide = generateSampleMathSlide({ timestamp: currentTimeStr || '12:34' });
    const newFrame = {
      id: createFrameId('sample'),
      timestamp: currentTimeStr || '12:34',
      seconds: Math.floor(currentSeconds || 754),
      videoUrl: youtubeUrl,
      label: 'J(θ)',
      caption: `Frame at ${currentTimeStr || '12:34'}, gradient descent equation`,
      dataUrl: slide.dataUrl,
      base64: slide.base64,
      width: slide.width,
      height: slide.height,
    };
    onUploadImage(newFrame);
    showToast('Added sample math slide to tray');
  };

  return (
    <Tooltip.Provider delayDuration={250}>
      <section
        id="frames-tray"
        aria-label="Captured lecture frames"
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isDraggingOver) setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        className="p-4 rounded-[8px] transition-colors"
        style={{
          backgroundColor: 'var(--pn)',
          border: `1px solid ${isDraggingOver ? 'var(--accent)' : 'var(--bd)'}`,
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3 text-[13px] gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-medium text-[var(--tx)] m-0">Captured frames</h2>
            <span className="text-[11.5px] text-[var(--mu)] hidden sm:inline">
              · Click a frame to choose how to use it
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {frames.length === 0 && (
              <button
                type="button"
                onClick={handleAddSampleSlide}
                className="text-[11.5px] font-medium underline underline-offset-2 cursor-pointer"
                style={{ color: 'var(--accent-text)' }}
              >
                Load sample math frame
              </button>
            )}
            <span className="text-[12px] text-[var(--mu)] tabular-nums">
              {frames.length} {frames.length === 1 ? 'frame' : 'frames'}
            </span>
          </div>
        </div>

        {/* 4-column 16:9 thumbnail grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {frames.map((frame) => {
            const isTranscribing = transcribingFrameId === frame.id;
            const isMenuOpen = openMenuFrameId === frame.id;

            return (
              <DropdownMenu.Root
                key={frame.id}
                open={isMenuOpen}
                onOpenChange={(open) => setOpenMenuFrameId(open ? frame.id : null)}
              >
                <div
                  className="group relative aspect-video rounded-[6px] overflow-hidden flex flex-col items-center justify-center transition-colors"
                  style={{
                    backgroundColor: 'var(--rz)',
                    border: isMenuOpen
                      ? '1px solid var(--accent)'
                      : '1px solid var(--bd2)',
                  }}
                >
                  {/* Main click area: opens anchored choice popover */}
                  <DropdownMenu.Trigger asChild>
                    <button
                      type="button"
                      aria-label={`Choose action for frame at ${frame.timestamp}`}
                      className="w-full h-full flex items-center justify-center p-2 text-center cursor-pointer focus:outline-none"
                    >
                      {frame.dataUrl ? (
                        <img
                          src={frame.dataUrl}
                          alt={frame.caption || `Frame at ${frame.timestamp}`}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <span
                          className="text-[16px] italic font-serif text-[var(--tx)]"
                          style={{ fontFamily: 'var(--font-serif)' }}
                        >
                          {frame.label || 'Frame'}
                        </span>
                      )}
                    </button>
                  </DropdownMenu.Trigger>

                  {/* Transcribing overlay indicator */}
                  {isTranscribing && (
                    <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-1 text-[#f2eee6] text-[11px] font-medium p-2 text-center pointer-events-none">
                      <span
                        className="w-2 h-2 rounded-full animate-pulse"
                        style={{ backgroundColor: 'var(--accent)' }}
                      />
                      <span>Reading formula...</span>
                    </div>
                  )}

                  {/* Delete frame from tray button on top-right */}
                  {!isTranscribing && onDeleteFrame && (
                    <div className="absolute top-1.5 right-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteFrame(frame.id);
                            }}
                            aria-label={`Delete frame ${frame.timestamp} from tray`}
                            className="w-6 h-6 rounded-[4px] flex items-center justify-center cursor-pointer hover:text-rose-400"
                            style={{
                              backgroundColor: 'rgba(18, 17, 15, 0.9)',
                              color: '#f2eee6',
                              border: '1px solid rgba(255, 248, 235, 0.22)',
                            }}
                          >
                            <TrashIcon size={12} />
                          </button>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content
                            side="top"
                            sideOffset={4}
                            className="z-50 px-2 py-1 text-[11px] rounded-[4px]"
                            style={{
                              backgroundColor: 'var(--rz)',
                              color: 'var(--tx)',
                              border: '1px solid var(--bd2)',
                            }}
                          >
                            Remove from tray
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    </div>
                  )}

                  {/* Timestamp chip */}
                  <span
                    className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 text-[10px] font-medium rounded-[4px] tabular-nums pointer-events-none"
                    style={{
                      backgroundColor: 'rgba(15, 14, 12, 0.88)',
                      color: '#f2eee6',
                      border: '1px solid rgba(255, 248, 235, 0.15)',
                    }}
                  >
                    {frame.timestamp}
                  </span>
                </div>

                {/* Anchored Choice Popover with larger preview + 3 clear actions */}
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="start"
                    side="top"
                    sideOffset={6}
                    className="z-50 w-[264px] p-2 rounded-[8px] text-[12.5px]"
                    style={{
                      backgroundColor: 'var(--pn)',
                      color: 'var(--tx)',
                      border: '1px solid var(--bd2)',
                    }}
                  >
                    {/* Larger preview header */}
                    <div
                      onClick={() => {
                        setOpenMenuFrameId(null);
                        if (onInspectFrame) onInspectFrame(frame);
                      }}
                      title="Click to inspect full resolution"
                      className="relative w-full aspect-video rounded-[6px] overflow-hidden mb-2 cursor-pointer border"
                      style={{
                        backgroundColor: 'var(--rz)',
                        borderColor: 'var(--bd)',
                      }}
                    >
                      {frame.dataUrl ? (
                        <img
                          src={frame.dataUrl}
                          alt={frame.caption || `Frame at ${frame.timestamp}`}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center font-serif italic text-[18px]">
                          {frame.label || 'Frame'}
                        </div>
                      )}
                      <span
                        className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 text-[10px] font-medium rounded-[4px] tabular-nums"
                        style={{
                          backgroundColor: 'rgba(15, 14, 12, 0.88)',
                          color: '#f2eee6',
                        }}
                      >
                        {frame.timestamp}
                      </span>
                    </div>

                    <div className="px-1 pb-1.5 text-[11.5px] text-[var(--mu)] truncate">
                      {frame.caption || `Frame at ${frame.timestamp}`}
                    </div>

                    <div className="space-y-0.5">
                      {/* Action 1: Add to note as is */}
                      <DropdownMenu.Item
                        onSelect={() => {
                          if (onInsertFrameToNote) onInsertFrameToNote(frame);
                        }}
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-[5px] cursor-pointer outline-none hover:bg-[var(--rz)] focus:bg-[var(--rz)] font-medium"
                      >
                        <InsertNoteIcon size={14} className="text-[var(--accent-text)] shrink-0" />
                        <div className="flex flex-col">
                          <span>Add to note as is</span>
                          <span className="text-[10.5px] text-[var(--mu)] font-normal">
                            Insert image block at cursor
                          </span>
                        </div>
                      </DropdownMenu.Item>

                      {/* Action 2: Read the formula */}
                      <DropdownMenu.Item
                        onSelect={() => {
                          if (onSnapFrameToLatex) onSnapFrameToLatex(frame);
                        }}
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-[5px] cursor-pointer outline-none hover:bg-[var(--rz)] focus:bg-[var(--rz)] font-medium"
                      >
                        <SigmaIcon size={14} className="text-[var(--accent-text)] shrink-0" />
                        <div className="flex flex-col">
                          <span>Read the formula</span>
                          <span className="text-[10.5px] text-[var(--mu)] font-normal">
                            Transcribe math to LaTeX at cursor
                          </span>
                        </div>
                      </DropdownMenu.Item>

                      {/* Action 3: Send to chat */}
                      <DropdownMenu.Item
                        onSelect={() => {
                          if (onAttachFrameToChat) onAttachFrameToChat(frame);
                        }}
                        className="flex items-center gap-2.5 px-2.5 py-2 rounded-[5px] cursor-pointer outline-none hover:bg-[var(--rz)] focus:bg-[var(--rz)] font-medium"
                      >
                        <SendArrowIcon size={14} className="text-[var(--accent-text)] shrink-0" />
                        <div className="flex flex-col">
                          <span>Send to chat</span>
                          <span className="text-[10.5px] text-[var(--mu)] font-normal">
                            Attach frame to ask a question
                          </span>
                        </div>
                      </DropdownMenu.Item>
                    </div>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            );
          })}

          {/* Upload / Drop / Paste tile */}
          <div
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            title="Click to upload an image, drop a file here, or press Ctrl+V anywhere to add a screenshot to the tray"
            aria-label="Upload, drop, or paste image frame"
            className="aspect-video rounded-[6px] flex flex-col items-center justify-center gap-1 p-2 text-center cursor-pointer transition-colors hover:border-[var(--accent)]"
            style={{
              backgroundColor: 'transparent',
              border: '1px dashed var(--bd2)',
              color: 'var(--mu)',
            }}
          >
            <UploadIcon size={15} />
            <span className="text-[11.5px] font-normal leading-tight">Upload image</span>
            <span className="text-[10px] opacity-75 leading-none">Drop or Ctrl+V</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>
      </section>
    </Tooltip.Provider>
  );
}
