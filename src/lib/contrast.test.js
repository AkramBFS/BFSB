import { describe, it, expect } from 'vitest';
import {
  getContrastRatio,
  meetsWcagAA,
  SURFACES,
  BASE_SWATCHES,
  NOTE_INKS,
  getSwatchTheme,
  resolveInkColor,
  normalizeSwatchKey,
  normalizeInkKey,
  evaluateCustomTheme,
} from './contrast.js';

describe('WCAG 2.1 Contrast Requirements & Stationery Ink Palette', () => {
  const themes = ['dark', 'light'];
  const swatches = Object.keys(BASE_SWATCHES);
  const inkKeys = Object.keys(NOTE_INKS);

  themes.forEach((theme) => {
    describe(`Theme: ${theme}`, () => {
      const surfaces = SURFACES[theme];

      swatches.forEach((swatchKey) => {
        describe(`App Accent Swatch: ${swatchKey} (${BASE_SWATCHES[swatchKey].label})`, () => {
          const resolved = getSwatchTheme(swatchKey, theme);

          it(`primary capture button label must reach >= 4.5:1 on fill (${resolved.onAccent} on ${resolved.accent})`, () => {
            const ratio = getContrastRatio(resolved.onAccent, resolved.accent);
            expect(ratio).toBeGreaterThanOrEqual(4.5);
          });

          it(`accent-text must reach >= 4.5:1 on canvas surface (${resolved.accentText} on ${surfaces.bg})`, () => {
            const ratio = getContrastRatio(resolved.accentText, surfaces.bg);
            expect(ratio).toBeGreaterThanOrEqual(4.5);
          });

          it(`accent-text must reach >= 4.5:1 on panel surface (${resolved.accentText} on ${surfaces.pn})`, () => {
            const ratio = getContrastRatio(resolved.accentText, surfaces.pn);
            expect(ratio).toBeGreaterThanOrEqual(4.5);
          });

          it(`accent-text must reach >= 4.5:1 on raised surface (${resolved.accentText} on ${surfaces.rz})`, () => {
            const ratio = getContrastRatio(resolved.accentText, surfaces.rz);
            expect(ratio).toBeGreaterThanOrEqual(4.5);
          });
        });
      });

      inkKeys.forEach((inkKey) => {
        describe(`Note Ink: ${inkKey} (${NOTE_INKS[inkKey].label})`, () => {
          const inkHex = resolveInkColor(inkKey, theme, surfaces.pn);

          if (inkKey === 'default') {
            it(`default ink must reach >= 4.5:1 on note page surface (${inkHex} on ${surfaces.pn})`, () => {
              expect(getContrastRatio(inkHex, surfaces.pn)).toBeGreaterThanOrEqual(4.5);
            });

            it(`default ink must reach >= 4.5:1 on raised callout/block surface (${inkHex} on ${surfaces.rz})`, () => {
              expect(getContrastRatio(inkHex, surfaces.rz)).toBeGreaterThanOrEqual(4.5);
            });
          } else {
            it(`highlight ink ${inkKey} matches dark-mode highlight color in ${theme} mode (${inkHex})`, () => {
              expect(inkHex).toBe(NOTE_INKS[inkKey].darkText);
              expect(getContrastRatio(inkHex, SURFACES.dark.pn)).toBeGreaterThanOrEqual(4.5);
            });

            it(`evaluateCustomTheme keeps --ink-${inkKey} identical in ${theme} mode`, () => {
              const evalRes = evaluateCustomTheme(theme, 'cobalt', null);
              expect(evalRes.tokens[`--ink-${inkKey}`]).toBe(NOTE_INKS[inkKey].darkText);
            });
          }
        });
      });

      it(`primary text (--tx) must reach >= 4.5:1 on all surfaces`, () => {
        expect(meetsWcagAA(surfaces.tx, surfaces.bg)).toBe(true);
        expect(meetsWcagAA(surfaces.tx, surfaces.pn)).toBe(true);
        expect(meetsWcagAA(surfaces.tx, surfaces.rz)).toBe(true);
      });
    });
  });

  describe('Legacy Swatch Migration', () => {
    it('maps legacy gold, rose, sage, and sky swatches to nearest stationery inks', () => {
      expect(normalizeSwatchKey('gold')).toBe('sepia');
      expect(normalizeSwatchKey('rose')).toBe('oxblood');
      expect(normalizeSwatchKey('sage')).toBe('verdigris');
      expect(normalizeSwatchKey('sky')).toBe('cobalt');
      expect(normalizeInkKey('rose')).toBe('oxblood');
    });
  });

  describe('Custom Color Readability Guard', () => {
    it('flags unreadable low-contrast custom colors and provides a legible auto-correction', () => {
      const result = evaluateCustomTheme('dark', 'custom', {
        bg: '#12110f',
        pn: '#1a1916',
        tx: '#262420',
        accent: '#f5e960',
      });

      expect(result.isLegible).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(getContrastRatio(result.autoCorrected.tx, result.autoCorrected.bg)).toBeGreaterThanOrEqual(4.5);
      expect(getContrastRatio(result.autoCorrected.tx, result.autoCorrected.pn)).toBeGreaterThanOrEqual(4.5);
    });
  });
});
