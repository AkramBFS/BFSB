import React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ExportIcon, ChevronDownIcon } from './Icons';
import { exportMarkdown, exportPdf } from '../lib/export';
import { useToast } from './ToastContext';

export function ExportMenu({ activeTab, frames = [], mediaById = {}, onPreparePrint }) {
  const { showToast } = useToast();

  const handleExportMarkdown = async () => {
    if (!activeTab) return;
    try {
      const res = await exportMarkdown(activeTab, frames, mediaById);
      if (res.cancelled) return;
      showToast(`Exported ${res.filename}`);
    } catch (err) {
      showToast(err?.message || 'Could not export markdown file.', 'error');
    }
  };

  const handleExportPdf = () => {
    try {
      if (onPreparePrint) {
        onPreparePrint();
      }
      showToast('Opening print dialog for PDF export');
      setTimeout(() => {
        try {
          exportPdf();
        } catch (err) {
          showToast(err?.message || 'Could not open print dialog.', 'error');
        }
      }, 150);
    } catch (err) {
      showToast(err?.message || 'Could not prepare PDF export.', 'error');
    }
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label="Export note menu"
          className="inline-flex items-center gap-1.5 h-[34px] px-3 rounded-[6px] text-[13px] font-medium transition-colors cursor-pointer"
          style={{
            backgroundColor: 'transparent',
            color: 'var(--tx)',
            border: '1px solid var(--bd2)',
          }}
        >
          <ExportIcon size={15} />
          <span>Export</span>
          <ChevronDownIcon size={13} className="text-[var(--mu)]" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-[168px] p-1 rounded-[6px] text-[13px]"
          style={{
            backgroundColor: 'var(--rz)',
            color: 'var(--tx)',
            border: '1px solid var(--bd2)',
            boxShadow: 'none',
          }}
        >
          <DropdownMenu.Item
            onSelect={handleExportMarkdown}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-[4px] cursor-pointer outline-none hover:bg-[var(--pn)] focus:bg-[var(--pn)] transition-colors"
          >
            <span className="font-medium">Markdown (.md)</span>
          </DropdownMenu.Item>

          <DropdownMenu.Item
            onSelect={handleExportPdf}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-[4px] cursor-pointer outline-none hover:bg-[var(--pn)] focus:bg-[var(--pn)] transition-colors"
          >
            <span className="font-medium">PDF</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
