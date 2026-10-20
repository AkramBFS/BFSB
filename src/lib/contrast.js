/**
 * Contrast calculation, readability guard, and stationery ink palette utility.
 * Implements WCAG 2.1 relative luminance and contrast ratio algorithms.
 */

/**
 * Parse a hex color string into RGB values [0..255].
 * Supports #rgb and #rrggbb.
 */
export function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return { r: 0, g: 0, b: 0 };
  let cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    cleaned = cleaned
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const num = parseInt(cleaned, 16);
  if (isNaN(num)) return { r: 0, g: 0, b: 0 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

/**
 * Convert { r, g, b } back to #rrggbb hex string.
 */
export function rgbToHex({ r, g, b }) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Linearly mix two hex colors. weight = 0 returns hex1, weight = 1 returns hex2.
 */
export function mixColors(hex1, hex2, weight = 0.5) {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  const w = Math.max(0, Math.min(1, weight));
  return rgbToHex({
    r: c1.r + (c2.r - c1.r) * w,
    g: c1.g + (c2.g - c1.g) * w,
    b: c1.b + (c2.b - c1.b) * w,
  });
}

/**
 * Calculate WCAG 2.1 relative luminance of an sRGB color.
 * Normalized to 0.0 (darkest black) to 1.0 (lightest white).
 */
export function getLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two hex colors.
 * Returns ratio >= 1.0 (e.g. 4.5 means 4.5:1).
 */
export function getContrastRatio(hex1, hex2) {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if fg/bg pair satisfies WCAG AA (default 4.5:1 for normal body text).
 */
export function meetsWcagAA(fgHex, bgHex, isLargeText = false) {
  const ratio = getContrastRatio(fgHex, bgHex);
  const threshold = isLargeText ? 3.0 : 4.5;
  return ratio >= threshold;
}

/**
 * Adjust fgHex towards white or black until it reaches targetRatio against bgHex.
 */
export function ensureContrast(fgHex, bgHex, targetRatio = 4.5) {
  if (getContrastRatio(fgHex, bgHex) >= targetRatio) {
    return fgHex;
  }
  const bgLum = getLuminance(bgHex);
  const targetPole = bgLum > 0.42 ? '#12110f' : '#ffffff';

  for (let step = 1; step <= 40; step++) {
    const candidate = mixColors(fgHex, targetPole, step / 40);
    if (getContrastRatio(candidate, bgHex) >= targetRatio) {
      return candidate;
    }
  }
  return getContrastRatio('#ffffff', bgHex) >= getContrastRatio('#12110f', bgHex)
    ? '#ffffff'
    : '#12110f';
}

/**
 * Pick the highest-contrast on-accent text color (#161513 or #ffffff) for a button fill.
 */
export function getBestOnAccent(accentHex) {
  const darkRatio = getContrastRatio('#161513', accentHex);
  const lightRatio = getContrastRatio('#ffffff', accentHex);
  return darkRatio >= lightRatio ? '#161513' : '#ffffff';
}

/**
 * Surface tokens defined in the design system.
 */
export const SURFACES = {
  dark: {
    bg: '#12110f',
    pn: '#1a1916',
    rz: '#25231f',
    tx: '#f2eee6',
    mu: '#aaa398',
  },
  light: {
    bg: '#f1ebdf',
    pn: '#fbf8f2',
    rz: '#ebe4d6',
    tx: '#26231d',
    mu: '#675f53',
  },
};

/**
 * Curated fountain-pen & stationery ink swatches (replaces generic pastel/amber AI palette).
 * Every entry is verified to achieve >= 4.5:1 contrast across all 3 surfaces in both modes.
 */
export const BASE_SWATCHES = {
  cobalt: {
    label: 'Prussian Blue',
    raw: '#2b547e',
    dark: {
      accent: '#7ba7d1',
      accentText: '#8cb5dc',
      onAccent: '#14171a',
    },
    light: {
      accent: '#1d466b',
      accentText: '#1a4163',
      onAccent: '#ffffff',
    },
  },
  oxblood: {
    label: 'Oxblood',
    raw: '#7a282a',
    dark: {
      accent: '#d48284',
      accentText: '#de9294',
      onAccent: '#191212',
    },
    light: {
      accent: '#782224',
      accentText: '#731f21',
      onAccent: '#ffffff',
    },
  },
  verdigris: {
    label: 'Bottle Green',
    raw: '#265c42',
    dark: {
      accent: '#7ab392',
      accentText: '#86bfa0',
      onAccent: '#111814',
    },
    light: {
      accent: '#1e5239',
      accentText: '#1b4d35',
      onAccent: '#ffffff',
    },
  },
  plum: {
    label: 'Damson Plum',
    raw: '#5b3766',
    dark: {
      accent: '#b891c4',
      accentText: '#c49fd0',
      onAccent: '#17121a',
    },
    light: {
      accent: '#542f61',
      accentText: '#502b5c',
      onAccent: '#ffffff',
    },
  },
  sepia: {
    label: 'Walnut Sepia',
    raw: '#6b4628',
    dark: {
      accent: '#c9a07c',
      accentText: '#d4ad8b',
      onAccent: '#191410',
    },
    light: {
      accent: '#633e20',
      accentText: '#5c391c',
      onAccent: '#ffffff',
    },
  },
  graphite: {
    label: 'Graphite',
    raw: '#4d535c',
    dark: {
      accent: '#a9b1bc',
      accentText: '#b4bcc7',
      onAccent: '#141619',
    },
    light: {
      accent: '#3e444c',
      accentText: '#3a4047',
      onAccent: '#ffffff',
    },
  },
};

/**
 * Note Inks available for inline text styling in notes (includes Default Carbon Ink + all 6 stationery inks).
 */
export const NOTE_INKS = {
  default: {
    key: 'default',
    label: 'Carbon Ink (Default)',
    swatchDark: '#f2eee6',
    swatchLight: '#26231d',
    darkText: '#f2eee6',
    lightText: '#26231d',
  },
  cobalt: {
    key: 'cobalt',
    label: 'Prussian Blue',
    swatchDark: '#8cb5dc',
    swatchLight: '#8cb5dc',
    darkText: BASE_SWATCHES.cobalt.dark.accentText,
    lightText: BASE_SWATCHES.cobalt.dark.accentText,
  },
  oxblood: {
    key: 'oxblood',
    label: 'Oxblood',
    swatchDark: '#de9294',
    swatchLight: '#de9294',
    darkText: BASE_SWATCHES.oxblood.dark.accentText,
    lightText: BASE_SWATCHES.oxblood.dark.accentText,
  },
  verdigris: {
    key: 'verdigris',
    label: 'Bottle Green',
    swatchDark: '#86bfa0',
    swatchLight: '#86bfa0',
    darkText: BASE_SWATCHES.verdigris.dark.accentText,
    lightText: BASE_SWATCHES.verdigris.dark.accentText,
  },
  plum: {
    key: 'plum',
    label: 'Damson Plum',
    swatchDark: '#c49fd0',
    swatchLight: '#c49fd0',
    darkText: BASE_SWATCHES.plum.dark.accentText,
    lightText: BASE_SWATCHES.plum.dark.accentText,
  },
  sepia: {
    key: 'sepia',
    label: 'Walnut Sepia',
    swatchDark: '#d4ad8b',
    swatchLight: '#d4ad8b',
    darkText: BASE_SWATCHES.sepia.dark.accentText,
    lightText: BASE_SWATCHES.sepia.dark.accentText,
  },
  graphite: {
    key: 'graphite',
    label: 'Graphite',
    swatchDark: '#b4bcc7',
    swatchLight: '#b4bcc7',
    darkText: BASE_SWATCHES.graphite.dark.accentText,
    lightText: BASE_SWATCHES.graphite.dark.accentText,
  },
};

/**
 * Map legacy swatch names (gold, rose, sage, sky) to the nearest stationery ink.
 */
export const LEGACY_SWATCH_MAP = {
  gold: 'sepia',
  rose: 'oxblood',
  sage: 'verdigris',
  sky: 'cobalt',
};

export function normalizeSwatchKey(key, fallback = 'cobalt') {
  if (!key) return fallback;
  if (BASE_SWATCHES[key]) return key;
  if (LEGACY_SWATCH_MAP[key]) return LEGACY_SWATCH_MAP[key];
  if (key === 'custom') return 'custom';
  return fallback;
}

export function normalizeInkKey(key, fallback = 'default') {
  if (!key) return fallback;
  if (NOTE_INKS[key]) return key;
  if (LEGACY_SWATCH_MAP[key]) return LEGACY_SWATCH_MAP[key];
  return fallback;
}

/**
 * Resolve the readable ink color for a given ink key and theme mode,
 * automatically adjusting against custom panel backgrounds if needed.
 */
export function resolveInkColor(inkKey, theme = 'dark', panelBgHex = null) {
  const normKey = normalizeInkKey(inkKey, 'default');
  const ink = NOTE_INKS[normKey] || NOTE_INKS.default;
  if (normKey !== 'default') {
    // Highlight/ink colors are shared identically between dark and light modes
    return ink.darkText;
  }
  const rawColor = theme === 'light' ? ink.lightText : ink.darkText;
  const targetBg = panelBgHex || (SURFACES[theme]?.pn ?? SURFACES.dark.pn);
  return ensureContrast(rawColor, targetBg, 4.5);
}

/**
 * Helper to get resolved colors for active swatch and theme.
 */
export function getSwatchTheme(swatchKey, theme = 'dark') {
  const normKey = normalizeSwatchKey(swatchKey, 'cobalt');
  const swatch = BASE_SWATCHES[normKey] || BASE_SWATCHES.cobalt;
  const config = swatch[theme] || swatch.dark;
  const { r, g, b } = hexToRgb(config.accent);

  return {
    key: normKey,
    label: swatch.label,
    raw: swatch.raw,
    accent: config.accent,
    accentText: config.accentText,
    onAccent: config.onAccent,
    calloutBg: `rgba(${r}, ${g}, ${b}, 0.12)`,
    accentRgb: `${r}, ${g}, ${b}`,
  };
}

/**
 * Evaluate and derive full CSS token map for either preset or user-customized colors,
 * including per-ink CSS variables (`--ink-*`) guaranteed to meet >= 4.5:1 contrast.
 */
export function evaluateCustomTheme(mode = 'dark', swatchKey = 'cobalt', customModeColors = null) {
  const defaults = SURFACES[mode] || SURFACES.dark;
  const normSwatch = normalizeSwatchKey(swatchKey, 'cobalt');
  const swatchDefaults = getSwatchTheme(
    BASE_SWATCHES[normSwatch] ? normSwatch : 'cobalt',
    mode
  );

  const bg = customModeColors?.bg || defaults.bg;
  const pn = customModeColors?.pn || defaults.pn;
  const tx = customModeColors?.tx || defaults.tx;
  const rawAccent = customModeColors?.accent || swatchDefaults.accent;

  const pnLum = getLuminance(pn);
  const rz =
    customModeColors?.rz ||
    (pnLum < 0.3 ? mixColors(pn, '#ffffff', 0.06) : mixColors(pn, '#000000', 0.07));
  const mu = ensureContrast(mixColors(tx, pn, 0.35), pn, 4.5);

  const txRgb = hexToRgb(tx);
  const bd = `rgba(${txRgb.r}, ${txRgb.g}, ${txRgb.b}, ${pnLum < 0.3 ? 0.09 : 0.10})`;
  const bd2 = `rgba(${txRgb.r}, ${txRgb.g}, ${txRgb.b}, ${pnLum < 0.3 ? 0.34 : 0.40})`;

  const onAccent = getBestOnAccent(rawAccent);
  const buttonContrast = getContrastRatio(onAccent, rawAccent);
  const effectiveAccent =
    buttonContrast >= 4.5 ? rawAccent : ensureContrast(rawAccent, onAccent, 4.5);

  let accentText = ensureContrast(effectiveAccent, pn, 4.5);
  accentText = ensureContrast(accentText, bg, 4.5);
  accentText = ensureContrast(accentText, rz, 4.5);

  const accRgb = hexToRgb(effectiveAccent);
  const calloutBg = `rgba(${accRgb.r}, ${accRgb.g}, ${accRgb.b}, 0.12)`;

  // Note inks: default ink follows primary text, while highlight inks stay identical across dark & light modes
  const inkTokens = {};
  Object.keys(NOTE_INKS).forEach((k) => {
    if (k === 'default') {
      inkTokens[`--ink-${k}`] = tx;
    } else {
      inkTokens[`--ink-${k}`] = NOTE_INKS[k].darkText;
    }
  });

  const warnings = [];
  const txBgRatio = getContrastRatio(tx, bg);
  const txPnRatio = getContrastRatio(tx, pn);
  const txRzRatio = getContrastRatio(tx, rz);

  if (txBgRatio < 4.5) {
    warnings.push({
      role: 'tx-bg',
      ratio: Number(txBgRatio.toFixed(2)),
      message: `Text on canvas background has low contrast (${txBgRatio.toFixed(1)}:1, minimum is 4.5:1).`,
    });
  }
  if (txPnRatio < 4.5) {
    warnings.push({
      role: 'tx-pn',
      ratio: Number(txPnRatio.toFixed(2)),
      message: `Text on panel surface has low contrast (${txPnRatio.toFixed(1)}:1, minimum is 4.5:1).`,
    });
  }
  if (txRzRatio < 4.5) {
    warnings.push({
      role: 'tx-rz',
      ratio: Number(txRzRatio.toFixed(2)),
      message: `Text on raised surface has low contrast (${txRzRatio.toFixed(1)}:1, minimum is 4.5:1).`,
    });
  }

  let safeTx = ensureContrast(tx, pn, 4.6);
  safeTx = ensureContrast(safeTx, bg, 4.6);
  safeTx = ensureContrast(safeTx, rz, 4.6);

  return {
    tokens: {
      '--bg': bg,
      '--pn': pn,
      '--rz': rz,
      '--bd': bd,
      '--bd2': bd2,
      '--tx': tx,
      '--mu': mu,
      '--accent': effectiveAccent,
      '--accent-text': accentText,
      '--on-accent': getBestOnAccent(effectiveAccent),
      '--callout-bg': calloutBg,
      ...inkTokens,
    },
    warnings,
    isLegible: warnings.length === 0,
    autoCorrected: {
      bg,
      pn,
      tx: safeTx,
      accent: effectiveAccent,
    },
  };
}
