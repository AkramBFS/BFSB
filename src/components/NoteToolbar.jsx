import React from 'react';
import * as Select from '@radix-ui/react-select';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  ChevronDownIcon,
  ImageIcon,
  CheckIcon,
  ClockIcon,
  SigmaIcon,
} from './Icons';
import { NOTE_INKS, normalizeInkKey } from '../lib/contrast';

const FONT_OPTIONS = [
  { value: 'Newsreader', label: 'Newsreader', family: "'Newsreader', Georgia, serif" },
  { value: 'Lora', label: 'Lora', family: "'Lora', Georgia, serif" },
  { value: 'DM Sans', label: 'DM Sans', family: "'DM Sans', sans-serif" },
  { value: 'Kalam', label: 'Kalam', family: "'Kalam', cursive" },
  { value: 'Cairo', label: 'Cairo', family: "'Cairo', sans-serif" },
  { value: 'Tajawal', label: 'Tajawal', family: "'Tajawal', sans-serif" },
];

export function NoteToolbar({
  noteFont,
  onFontChange,
  activeInk = 'default',
  onInkChange,
  hasSelection = false,
  onInsertImageClick,
  onInsertTimestampClick,
  onOpenFormulaPalette,
  currentTimeStr = '00:00',
}) {
  const currentFontObj = FONT_OPTIONS.find((f) => f.value === noteFont) || FONT_OPTIONS[0];
  const normalizedInk = normalizeInkKey(activeInk);

  return (
    <Tooltip.Provider delayDuration={300}>
      <div
        id="note-toolbar"
        aria-label="Note formatting toolbar"
        className="flex items-center justify-between gap-2.5 px-4 md:px-5 py-2.5 border-b select-none flex-wrap"
        style={{
          borderColor: 'var(--bd)',
          backgroundColor: 'var(--pn)',
        }}
      >
        {/* Left controls: Font selector + Stationery Ink swatches */}
        <div className="flex items-center gap-3.5 flex-wrap">
          {/* Font Selector (applies to selection or newly typed text at caret) */}
          <Select.Root value={currentFontObj.value} onValueChange={onFontChange}>
            <Select.Trigger
              aria-label="Select text font family"
              title={
                hasSelection
                  ? 'Change font of selected text'
                  : 'Set font for newly typed text at caret'
              }
              className="inline-flex items-center justify-between gap-2 h-[30px] px-2.5 rounded-[6px] text-[13px] transition-colors cursor-pointer min-w-[124px]"
              style={{
                backgroundColor: 'transparent',
                color: 'var(--tx)',
                border: '1px solid var(--bd2)',
                fontFamily: currentFontObj.family,
              }}
            >
              <Select.Value>{currentFontObj.label}</Select.Value>
              <Select.Icon>
                <ChevronDownIcon size={13} className="text-[var(--mu)]" />
              </Select.Icon>
            </Select.Trigger>

            <Select.Portal>
              <Select.Content
                position="popper"
                sideOffset={4}
                className="z-50 min-w-[144px] p-1 rounded-[6px] text-[13px]"
                style={{
                  backgroundColor: 'var(--rz)',
                  color: 'var(--tx)',
                  border: '1px solid var(--bd2)',
                }}
              >
                <Select.Viewport>
                  {FONT_OPTIONS.map((f) => (
                    <Select.Item
                      key={f.value}
                      value={f.value}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded-[4px] cursor-pointer outline-none hover:bg-[var(--pn)] focus:bg-[var(--pn)]"
                      style={{ fontFamily: f.family }}
                    >
                      <Select.ItemText>{f.label}</Select.ItemText>
                      <Select.ItemIndicator>
                        <CheckIcon size={12} className="text-[var(--accent)]" />
                      </Select.ItemIndicator>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>

          {/* Stationery Ink swatches */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[var(--mu)] font-medium">Ink</span>
            <div
              className="flex items-center gap-1.5"
              role="radiogroup"
              aria-label="Text ink color"
            >
              {Object.entries(NOTE_INKS).map(([key, ink]) => {
                const isSelected = normalizedInk === key;
                return (
                  <Tooltip.Root key={key}>
                    <Tooltip.Trigger asChild>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        aria-label={`${ink.label} ink`}
                        onMouseDown={(e) => {
                          // Prevent stealing focus / collapsing text selection in editor
                          e.preventDefault();
                        }}
                        onClick={() => onInkChange && onInkChange(key)}
                        className={`w-4 h-4 rounded-full transition-transform cursor-pointer relative ${
                          isSelected ? 'scale-110' : 'hover:scale-105'
                        }`}
                        style={{
                          backgroundColor: `var(--ink-${key}, ${ink.raw})`,
                          border: isSelected
                            ? '2px solid var(--tx)'
                            : '1px solid var(--bd2)',
                          outline: isSelected ? '1.5px solid var(--pn)' : 'none',
                          outlineOffset: '-3px',
                        }}
                      />
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
                        {ink.label}
                      </Tooltip.Content>
                    </Tooltip.Portal>
                  </Tooltip.Root>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right controls: Timestamp + Formula + Upload Image to Tray */}
        <div className="flex items-center gap-2">
          {/* Insert Timestamp Button */}
          {onInsertTimestampClick && (
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onInsertTimestampClick}
                  aria-label={`Insert current video timestamp (${currentTimeStr})`}
                  className="flex items-center justify-center w-[30px] h-[30px] rounded-[6px] text-[var(--mu)] hover:text-[var(--tx)] hover:bg-[var(--rz)] transition-colors cursor-pointer"
                  style={{ border: '1px solid var(--bd2)' }}
                >
                  <ClockIcon size={14} />
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
                  Insert timestamp [{currentTimeStr}] at cursor
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          )}

          {/* Formula / Snap-to-LaTeX Button */}
          {onOpenFormulaPalette && (
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={onOpenFormulaPalette}
                  aria-label="Insert formula or Snap-to-LaTeX"
                  className="flex items-center justify-center w-[30px] h-[30px] rounded-[6px] text-[var(--mu)] hover:text-[var(--tx)] hover:bg-[var(--rz)] transition-colors cursor-pointer"
                  style={{ border: '1px solid var(--bd2)' }}
                >
                  <SigmaIcon size={14} />
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
                  Formulas (/ slash menu &amp; AI Snap-to-LaTeX)
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          )}

          {/* Add Image icon button */}
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={onInsertImageClick}
                aria-label="Upload image to frames tray"
                className="flex items-center justify-center w-[30px] h-[30px] rounded-[6px] text-[var(--mu)] hover:text-[var(--tx)] hover:bg-[var(--rz)] transition-colors cursor-pointer"
                style={{
                  border: '1px solid var(--bd2)',
                }}
              >
                <ImageIcon size={15} />
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
                Upload image to frames tray
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </div>
      </div>
    </Tooltip.Provider>
  );
}
