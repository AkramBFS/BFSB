import React, { useState, useEffect } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { LogoMark, SaveIcon, SettingsIcon } from './Icons';
import { ThemeToggle } from './ThemeToggle';
import { ExportMenu } from './ExportMenu';
import { useToast } from './ToastContext';
import { getEffectiveApiKey } from '../lib/storage';

export function TopBar({
  saveStatus,
  onSaveNow,
  theme,
  onThemeChange,
  activeTab,
  frames = [],
  mediaById = {},
  onPreparePrint,
  onOpenSettings,
  lectureSubtitle = 'Machine learning / Study workspace',
}) {
  const { showToast } = useToast();
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleManualSave = () => {
    const res = onSaveNow();
    if (res?.ok !== false) {
      showToast('Saved to this browser');
    }
  };

  const hasApiKey = getEffectiveApiKey().source !== 'none';

  return (
    <Tooltip.Provider delayDuration={300}>
      <header
        id="topbar"
        className="h-[52px] w-full px-4 md:px-5 flex items-center justify-between shrink-0 select-none transition-colors border-b"
        style={{
          backgroundColor: 'var(--bg)',
          borderColor: 'var(--bd)',
        }}
      >
        {/* Left branding */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 text-[var(--accent)] shrink-0">
            <LogoMark size={20} />
            <span
              className="text-[21px] font-medium tracking-tight text-[var(--tx)]"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              ML-Pad
            </span>
          </div>

          {lectureSubtitle && (
            <span className="hidden sm:inline-block text-[13px] text-[var(--mu)] font-normal pl-2 border-l border-[var(--bd)] truncate max-w-[260px]">
              {lectureSubtitle}
            </span>
          )}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2.5 shrink-0">
          {isOffline && (
            <span
              className="px-2 py-0.5 text-[11.5px] font-medium rounded-[4px]"
              style={{
                backgroundColor: 'var(--rz)',
                color: 'var(--accent-text)',
                border: '1px solid var(--bd2)',
              }}
            >
              Offline mode
            </span>
          )}

          <span
            className="hidden md:inline-block text-[12.5px] text-[var(--mu)] tabular-nums transition-opacity"
            aria-live="polite"
          >
            {saveStatus}
          </span>

          <ThemeToggle theme={theme} onChange={onThemeChange} />

          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                onClick={() => onOpenSettings('ai')}
                aria-label="Workspace, appearance, and API key settings"
                className="relative inline-flex items-center justify-center w-[34px] h-[34px] rounded-[6px] text-[var(--tx)] hover:bg-[var(--rz)] transition-colors cursor-pointer"
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid var(--bd2)',
                }}
              >
                <SettingsIcon size={15} />
                {!hasApiKey && (
                  <span
                    title="API key not configured"
                    className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: 'var(--accent)' }}
                    aria-hidden="true"
                  />
                )}
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                side="bottom"
                sideOffset={5}
                className="z-50 px-2 py-1 text-[11px] rounded-[4px]"
                style={{
                  backgroundColor: 'var(--rz)',
                  color: 'var(--tx)',
                  border: '1px solid var(--bd2)',
                }}
              >
                Settings, colors &amp; API key
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>

          <button
            type="button"
            onClick={handleManualSave}
            aria-label="Save workspace to browser"
            className="inline-flex items-center gap-1.5 h-[34px] px-3 rounded-[6px] text-[13px] font-medium transition-colors cursor-pointer"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--tx)',
              border: '1px solid var(--bd2)',
            }}
          >
            <SaveIcon size={14} />
            <span className="hidden sm:inline">Save</span>
          </button>

          <ExportMenu
            activeTab={activeTab}
            frames={frames}
            mediaById={mediaById}
            onPreparePrint={onPreparePrint}
          />
        </div>
      </header>
    </Tooltip.Provider>
  );
}
