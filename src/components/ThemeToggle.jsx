import React from 'react';
import { SunIcon, MoonIcon } from './Icons';

/**
 * 2-button grouped theme toggle.
 * Uses aria-pressed and proper keyboard accessibility.
 */
export function ThemeToggle({ theme, onChange }) {
  const isDark = theme === 'dark';

  return (
    <div
      role="group"
      aria-label="Color theme toggle"
      className="inline-flex items-center p-0.5 rounded-[6px]"
      style={{
        backgroundColor: 'var(--rz)',
        border: '1px solid var(--bd2)',
      }}
    >
      <button
        type="button"
        aria-label="Light mode"
        aria-pressed={!isDark}
        onClick={() => onChange('light')}
        className={`px-2 py-1 rounded-[4px] flex items-center justify-center transition-colors cursor-pointer ${
          !isDark ? 'text-[var(--tx)] font-semibold' : 'text-[var(--mu)] hover:text-[var(--tx)]'
        }`}
        style={{
          backgroundColor: !isDark ? 'var(--pn)' : 'transparent',
          boxShadow: !isDark ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
        }}
      >
        <SunIcon size={14} />
      </button>

      <button
        type="button"
        aria-label="Dark mode"
        aria-pressed={isDark}
        onClick={() => onChange('dark')}
        className={`px-2 py-1 rounded-[4px] flex items-center justify-center transition-colors cursor-pointer ${
          isDark ? 'text-[var(--tx)] font-semibold' : 'text-[var(--mu)] hover:text-[var(--tx)]'
        }`}
        style={{
          backgroundColor: isDark ? 'var(--pn)' : 'transparent',
          boxShadow: isDark ? '0 1px 2px rgba(0,0,0,0.2)' : 'none',
        }}
      >
        <MoonIcon size={14} />
      </button>
    </div>
  );
}
