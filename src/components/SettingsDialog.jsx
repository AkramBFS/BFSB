import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { CloseIcon, KeyIcon, SettingsIcon, CheckIcon } from './Icons';
import {
  getStoredApiKey,
  setStoredApiKey,
  getEffectiveApiKey,
  getStorageStatus,
} from '../lib/storage';
import { AI_MODEL_OPTIONS } from '../lib/aiService';
import {
  SURFACES,
  BASE_SWATCHES,
  evaluateCustomTheme,
  getSwatchTheme,
} from '../lib/contrast';
import { useToast } from './ToastContext';

const NOTE_FONT_OPTIONS = [
  { value: 'Newsreader', label: 'Newsreader (Serif)', family: "'Newsreader', Georgia, serif" },
  { value: 'Lora', label: 'Lora (Editorial Serif)', family: "'Lora', Georgia, serif" },
  { value: 'DM Sans', label: 'DM Sans (Clean Sans)', family: "'DM Sans', sans-serif" },
  { value: 'Kalam', label: 'Kalam (Handwriting)', family: "'Kalam', cursive" },
  { value: 'Cairo', label: 'Cairo (Arabic & Bilingual)', family: "'Cairo', sans-serif" },
  { value: 'Tajawal', label: 'Tajawal (Arabic & Bilingual)', family: "'Tajawal', sans-serif" },
];

const EDITOR_FONT_OPTIONS = [
  {
    value: 'JetBrains Mono',
    label: 'JetBrains Mono',
    family: "'JetBrains Mono', ui-monospace, monospace",
  },
  {
    value: 'Fira Code',
    label: 'Fira Code',
    family: "'Fira Code', ui-monospace, monospace",
  },
  {
    value: 'System Mono',
    label: 'System Monospace',
    family: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  },
];

export function SettingsDialog({
  open,
  onOpenChange,
  initialTab = 'ai', // 'ai' | 'appearance' | 'workspace'
  theme,
  onThemeChange,
  accent,
  onAccentChange,
  customColors,
  onCustomColorsChange,
  noteFont,
  onNoteFontChange,
  editorFont,
  onEditorFontChange,
  aiModel,
  onAiModelChange,
  onLoadDemoWorkspace,
  onResetWorkspace,
}) {
  const { showToast } = useToast();
  const [activeSection, setActiveSection] = useState(initialTab);
  const [prevOpen, setPrevOpen] = useState(open);
  const [prevInitialTab, setPrevInitialTab] = useState(initialTab);

  const [apiKeyInput, setApiKeyInput] = useState(() => getStoredApiKey());
  const [showKey, setShowKey] = useState(false);
  const [customModelId, setCustomModelId] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  if (open !== prevOpen || initialTab !== prevInitialTab) {
    setPrevOpen(open);
    setPrevInitialTab(initialTab);
    if (open) {
      setActiveSection(initialTab);
      setApiKeyInput(getStoredApiKey());
      setConfirmReset(false);
    }
  }

  const effectiveKeyInfo = getEffectiveApiKey();
  const storageInfo = getStorageStatus();

  const currentModeDefaults = SURFACES[theme] || SURFACES.dark;
  const currentSwatchDefaults = getSwatchTheme(
    BASE_SWATCHES[accent] ? accent : 'cobalt',
    theme
  );
  const activeModeCustom = customColors?.[theme] || null;

  const currentColors = {
    bg: activeModeCustom?.bg || currentModeDefaults.bg,
    pn: activeModeCustom?.pn || currentModeDefaults.pn,
    tx: activeModeCustom?.tx || currentModeDefaults.tx,
    accent: activeModeCustom?.accent || currentSwatchDefaults.accent,
  };

  const evaluation = evaluateCustomTheme(theme, accent, activeModeCustom);

  const handleSaveKey = (e) => {
    e?.preventDefault();
    setStoredApiKey(apiKeyInput);
    showToast(apiKeyInput.trim() ? 'API key saved in this browser' : 'API key cleared');
  };

  const handleColorPickerChange = (role, hexValue) => {
    const updatedModeColors = {
      ...currentColors,
      [role]: hexValue,
    };
    onCustomColorsChange({
      ...customColors,
      [theme]: updatedModeColors,
    });
    if (role === 'accent') {
      onAccentChange('custom');
    }
  };

  const handleAutoFixContrast = () => {
    onCustomColorsChange({
      ...customColors,
      [theme]: evaluation.autoCorrected,
    });
    showToast('Adjusted text contrast for readability');
  };

  const handleResetModeColors = () => {
    onCustomColorsChange({
      ...customColors,
      [theme]: null,
    });
    if (accent === 'custom') {
      onAccentChange('cobalt');
    }
    showToast(`Reset ${theme} mode colors to default`);
  };

  // Prevent locking into completely unreadable colors when closing dialog
  const handleDialogOpenChange = (nextOpen) => {
    if (!nextOpen && !evaluation.isLegible) {
      const worstRatio = Math.min(...evaluation.warnings.map((w) => w.ratio));
      if (worstRatio < 3.0) {
        onCustomColorsChange({
          ...customColors,
          [theme]: evaluation.autoCorrected,
        });
        showToast('Automatically adjusted text color so the interface stays readable');
      }
    }
    onOpenChange(nextOpen);
  };

  const isPresetModel = AI_MODEL_OPTIONS.some((m) => m.id === aiModel);

  return (
    <Dialog.Root open={open} onOpenChange={handleDialogOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50 bg-black/60 transition-opacity"
          style={{ backdropFilter: 'blur(2px)' }}
        />
        <Dialog.Content
          aria-describedby="settings-dialog-desc"
          className="fixed left-1/2 top-1/2 z-50 w-[94vw] max-w-[560px] max-h-[88vh] -translate-x-1/2 -translate-y-1/2 rounded-[8px] flex flex-col overflow-hidden focus:outline-none"
          style={{
            backgroundColor: 'var(--pn)',
            color: 'var(--tx)',
            border: '1px solid var(--bd2)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-3.5 border-b select-none"
            style={{ borderColor: 'var(--bd)' }}
          >
            <div className="flex items-center gap-2">
              <SettingsIcon size={16} className="text-[var(--accent-text)]" />
              <Dialog.Title
                className="text-[18px] font-medium m-0"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                Workspace settings
              </Dialog.Title>
            </div>
            <Dialog.Description id="settings-dialog-desc" className="sr-only">
              Configure Gemini API key, AI model, theme colors, fonts, and workspace storage.
            </Dialog.Description>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close settings"
                className="w-[30px] h-[30px] rounded-[6px] flex items-center justify-center text-[var(--mu)] hover:text-[var(--tx)] hover:bg-[var(--rz)] cursor-pointer"
              >
                <CloseIcon size={14} />
              </button>
            </Dialog.Close>
          </div>

          {/* Section Switcher */}
          <div
            className="flex items-center gap-1 px-5 pt-2.5 border-b select-none"
            style={{ borderColor: 'var(--bd)', backgroundColor: 'var(--bg)' }}
          >
            {[
              { id: 'ai', label: 'AI & API key' },
              { id: 'appearance', label: 'Appearance & fonts' },
              { id: 'workspace', label: 'Demo & storage' },
            ].map((tab) => {
              const active = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSection(tab.id)}
                  className={`px-3 py-2 text-[13px] rounded-t-[6px] border-t border-l border-r -mb-[1px] cursor-pointer transition-colors ${
                    active
                      ? 'font-medium text-[var(--tx)]'
                      : 'text-[var(--mu)] hover:text-[var(--tx)]'
                  }`}
                  style={{
                    backgroundColor: active ? 'var(--pn)' : 'transparent',
                    borderColor: active ? 'var(--bd)' : 'transparent',
                    borderBottomColor: active ? 'var(--pn)' : 'var(--bd)',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Body */}
          <div className="p-5 overflow-y-auto space-y-5 text-[13px]">
            {activeSection === 'ai' && (
              <div className="space-y-5">
                {/* API Key Form */}
                <form onSubmit={handleSaveKey} className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="gemini-api-key-input"
                      className="font-medium text-[var(--tx)] flex items-center gap-1.5"
                    >
                      <KeyIcon size={14} className="text-[var(--accent-text)]" />
                      <span>Gemini API key</span>
                    </label>
                    <span
                      className="text-[11.5px] px-2 py-0.5 rounded-[4px]"
                      style={{
                        backgroundColor: 'var(--rz)',
                        color:
                          effectiveKeyInfo.source !== 'none'
                            ? 'var(--accent-text)'
                            : 'var(--mu)',
                        border: '1px solid var(--bd)',
                      }}
                    >
                      {effectiveKeyInfo.source === 'user'
                        ? 'Key saved in browser'
                        : effectiveKeyInfo.source === 'demo'
                        ? 'Using demo key'
                        : 'No key set'}
                    </span>
                  </div>

                  <p className="text-[12.5px] text-[var(--mu)] leading-relaxed m-0">
                    Your key stays in this browser and is never logged, exported, or sent anywhere except directly to Google&apos;s Gemini API.
                  </p>

                  <div className="flex items-center gap-2 pt-1">
                    <div className="relative flex-1">
                      <input
                        id="gemini-api-key-input"
                        type={showKey ? 'text' : 'password'}
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder="AIzaSy..."
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full h-[34px] pl-3 pr-14 rounded-[6px] text-[13px] font-mono text-[var(--tx)] placeholder:text-[var(--mu)]"
                        style={{
                          backgroundColor: 'var(--bg)',
                          border: '1px solid var(--bd2)',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-[var(--mu)] hover:text-[var(--tx)] px-1.5 py-0.5 cursor-pointer"
                      >
                        {showKey ? 'Hide' : 'Show'}
                      </button>
                    </div>

                    <button
                      type="submit"
                      className="h-[34px] px-3.5 rounded-[6px] text-[13px] font-medium cursor-pointer shrink-0"
                      style={{
                        backgroundColor: 'var(--rz)',
                        color: 'var(--tx)',
                        border: '1px solid var(--bd2)',
                      }}
                    >
                      Save key
                    </button>

                    {apiKeyInput && (
                      <button
                        type="button"
                        onClick={() => {
                          setApiKeyInput('');
                          setStoredApiKey('');
                          showToast('Cleared stored API key');
                        }}
                        className="h-[34px] px-2.5 rounded-[6px] text-[12px] text-[var(--mu)] hover:text-[var(--tx)] cursor-pointer shrink-0"
                        style={{ border: '1px solid var(--bd)' }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </form>

                {/* Model Selector */}
                <div className="space-y-2.5 pt-3 border-t" style={{ borderColor: 'var(--bd)' }}>
                  <label className="block font-medium text-[var(--tx)]">
                    Vision model (Gemma 4 / Gemini API)
                  </label>
                  <p className="text-[12px] text-[var(--mu)] m-0">
                    Used for Snap-to-LaTeX math transcription and lecture chat. Switch models anytime if a hosted tier is rate-limited.
                  </p>

                  <div className="space-y-1.5 pt-1" role="radiogroup" aria-label="AI model">
                    {AI_MODEL_OPTIONS.map((opt) => {
                      const selected = aiModel === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() => {
                            onAiModelChange(opt.id);
                            showToast(`Model set to ${opt.id}`);
                          }}
                          className="w-full text-left p-2.5 rounded-[6px] flex items-center justify-between gap-3 cursor-pointer transition-colors"
                          style={{
                            backgroundColor: selected ? 'var(--rz)' : 'var(--bg)',
                            border: `1px solid ${selected ? 'var(--accent)' : 'var(--bd)'}`,
                          }}
                        >
                          <div>
                            <div className="font-medium text-[13px] text-[var(--tx)] flex items-center gap-2">
                              <span>{opt.label}</span>
                              <span
                                className="text-[11px] font-mono px-1.5 py-0.2 rounded-[4px]"
                                style={{
                                  backgroundColor: 'var(--pn)',
                                  color: 'var(--mu)',
                                  border: '1px solid var(--bd)',
                                }}
                              >
                                {opt.id}
                              </span>
                            </div>
                            <div className="text-[11.5px] text-[var(--mu)] mt-0.5">
                              {opt.description}
                            </div>
                          </div>
                          {selected && <CheckIcon size={14} className="text-[var(--accent-text)] shrink-0" />}
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom model ID override */}
                  <div className="pt-2 flex items-center gap-2">
                    <input
                      type="text"
                      value={customModelId || (!isPresetModel ? aiModel : '')}
                      onChange={(e) => setCustomModelId(e.target.value)}
                      placeholder="Custom model ID (e.g. gemma-4-31b-it)"
                      aria-label="Custom Gemini API model identifier"
                      className="flex-1 h-[32px] px-3 rounded-[6px] text-[12px] font-mono text-[var(--tx)] placeholder:text-[var(--mu)]"
                      style={{
                        backgroundColor: 'var(--bg)',
                        border: '1px solid var(--bd2)',
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = customModelId.trim();
                        if (trimmed) {
                          onAiModelChange(trimmed);
                          showToast(`Model set to ${trimmed}`);
                        }
                      }}
                      className="h-[32px] px-3 rounded-[6px] text-[12px] font-medium cursor-pointer"
                      style={{
                        backgroundColor: 'var(--rz)',
                        border: '1px solid var(--bd2)',
                      }}
                    >
                      Use ID
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'appearance' && (
              <div className="space-y-5">
                {/* Mode & Preset Swatches */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <div className="font-medium text-[var(--tx)]">Theme mode</div>
                    <div className="text-[12px] text-[var(--mu)]">
                      Custom colors are saved separately for Dark and Light modes.
                    </div>
                  </div>
                  <div
                    className="inline-flex p-0.5 rounded-[6px]"
                    style={{
                      backgroundColor: 'var(--rz)',
                      border: '1px solid var(--bd2)',
                    }}
                  >
                    {['light', 'dark'].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => onThemeChange(m)}
                        className={`px-3 py-1 rounded-[4px] text-[12.5px] capitalize cursor-pointer ${
                          theme === m ? 'font-medium text-[var(--tx)]' : 'text-[var(--mu)]'
                        }`}
                        style={{
                          backgroundColor: theme === m ? 'var(--pn)' : 'transparent',
                        }}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preset Accent Swatches */}
                <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: 'var(--bd)' }}>
                  <span className="font-medium text-[var(--tx)]">Preset accent swatches</span>
                  <div className="flex items-center gap-2">
                    {Object.entries(BASE_SWATCHES).map(([key, swatch]) => {
                      const isSelected = accent === key && !activeModeCustom?.accent;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            onAccentChange(key);
                            if (activeModeCustom) {
                              const nextCustom = { ...activeModeCustom };
                              delete nextCustom.accent;
                              onCustomColorsChange({
                                ...customColors,
                                [theme]: Object.keys(nextCustom).length ? nextCustom : null,
                              });
                            }
                          }}
                          title={swatch.label}
                          className="w-5 h-5 rounded-full cursor-pointer"
                          style={{
                            backgroundColor: swatch.raw,
                            boxShadow: isSelected
                              ? '0 0 0 2px var(--pn), 0 0 0 4px var(--accent)'
                              : '0 0 0 1px rgba(0,0,0,0.15)',
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Custom Role Color Pickers */}
                <div className="space-y-3 pt-2 border-t" style={{ borderColor: 'var(--bd)' }}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-[var(--tx)]">
                      Custom colors ({theme} mode)
                    </span>
                    <button
                      type="button"
                      onClick={handleResetModeColors}
                      className="text-[12px] text-[var(--accent-text)] hover:underline cursor-pointer"
                    >
                      Reset to {theme} defaults
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { role: 'bg', label: 'Canvas background', value: currentColors.bg },
                      { role: 'pn', label: 'Panel surface', value: currentColors.pn },
                      { role: 'tx', label: 'Primary text', value: currentColors.tx },
                      { role: 'accent', label: 'Accent color', value: currentColors.accent },
                    ].map((item) => (
                      <label
                        key={item.role}
                        className="flex items-center justify-between p-2.5 rounded-[6px] cursor-pointer"
                        style={{
                          backgroundColor: 'var(--bg)',
                          border: '1px solid var(--bd2)',
                        }}
                      >
                        <div>
                          <div className="text-[12.5px] font-medium text-[var(--tx)]">
                            {item.label}
                          </div>
                          <div className="text-[11px] font-mono text-[var(--mu)] uppercase">
                            {item.value}
                          </div>
                        </div>
                        <input
                          type="color"
                          value={item.value}
                          onChange={(e) => handleColorPickerChange(item.role, e.target.value)}
                          aria-label={item.label}
                          className="w-7 h-7 rounded-[4px] cursor-pointer bg-transparent border-0 p-0"
                        />
                      </label>
                    ))}
                  </div>

                  {/* Readability Guard Warning & Live Preview */}
                  {!evaluation.isLegible && (
                    <div
                      role="alert"
                      className="p-3 rounded-[6px] flex items-center justify-between gap-3"
                      style={{
                        backgroundColor: 'var(--callout-bg)',
                        border: '1px solid var(--accent)',
                      }}
                    >
                      <div className="text-[12px] text-[var(--tx)] space-y-0.5">
                        <div className="font-semibold">Readability warning</div>
                        <div>{evaluation.warnings[0].message}</div>
                      </div>
                      <button
                        type="button"
                        onClick={handleAutoFixContrast}
                        className="px-3 py-1.5 rounded-[6px] text-[12px] font-semibold shrink-0 cursor-pointer"
                        style={{
                          backgroundColor: 'var(--accent)',
                          color: 'var(--on-accent)',
                        }}
                      >
                        Fix contrast
                      </button>
                    </div>
                  )}
                </div>

                {/* Typography Selectors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t" style={{ borderColor: 'var(--bd)' }}>
                  <div className="space-y-1.5">
                    <label htmlFor="settings-note-font" className="block font-medium text-[var(--tx)]">
                      Rendered notes font
                    </label>
                    <select
                      id="settings-note-font"
                      value={noteFont}
                      onChange={(e) => onNoteFontChange(e.target.value)}
                      className="w-full h-[34px] px-2.5 rounded-[6px] text-[13px]"
                      style={{
                        backgroundColor: 'var(--bg)',
                        color: 'var(--tx)',
                        border: '1px solid var(--bd2)',
                      }}
                    >
                      {NOTE_FONT_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="settings-editor-font" className="block font-medium text-[var(--tx)]">
                      Write editor font (monospace)
                    </label>
                    <select
                      id="settings-editor-font"
                      value={editorFont}
                      onChange={(e) => onEditorFontChange(e.target.value)}
                      className="w-full h-[34px] px-2.5 rounded-[6px] text-[13px]"
                      style={{
                        backgroundColor: 'var(--bg)',
                        color: 'var(--tx)',
                        border: '1px solid var(--bd2)',
                      }}
                    >
                      {EDITOR_FONT_OPTIONS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'workspace' && (
              <div className="space-y-5">
                {/* Storage Status */}
                <div
                  className="p-3.5 rounded-[6px] space-y-2"
                  style={{
                    backgroundColor: 'var(--bg)',
                    border: '1px solid var(--bd)',
                  }}
                >
                  <div className="flex items-center justify-between text-[12.5px]">
                    <span className="font-medium text-[var(--tx)]">Browser storage usage</span>
                    <span className="tabular-nums text-[var(--mu)]">
                      {storageInfo.formattedKB} ({storageInfo.percent}% of local key-value quota · Images in IndexedDB)
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full overflow-hidden bg-[var(--rz)]">
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.max(2, storageInfo.percent)}%`,
                        backgroundColor: storageInfo.nearLimit ? '#d98a86' : 'var(--accent)',
                      }}
                    />
                  </div>
                </div>

                {/* Demo Assets Loader */}
                <div
                  className="p-3.5 rounded-[6px] flex items-center justify-between gap-4"
                  style={{
                    backgroundColor: 'var(--bg)',
                    border: '1px solid var(--bd)',
                  }}
                >
                  <div>
                    <div className="font-medium text-[var(--tx)]">Load demo lecture &amp; sample notes</div>
                    <div className="text-[12px] text-[var(--mu)] mt-0.5">
                      Populates the pre-tested Gradient Descent lecture, bilingual math notes, and a sample captured slide.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onLoadDemoWorkspace();
                      onOpenChange(false);
                    }}
                    className="h-[34px] px-3.5 rounded-[6px] text-[12.5px] font-medium shrink-0 cursor-pointer"
                    style={{
                      backgroundColor: 'var(--rz)',
                      color: 'var(--tx)',
                      border: '1px solid var(--bd2)',
                    }}
                  >
                    Load demo
                  </button>
                </div>

                {/* Reset to Clean State */}
                <div
                  className="p-3.5 rounded-[6px] flex items-center justify-between gap-4"
                  style={{
                    backgroundColor: 'var(--bg)',
                    border: '1px solid var(--bd)',
                  }}
                >
                  <div>
                    <div className="font-medium text-[var(--tx)]">Reset workspace to clean state</div>
                    <div className="text-[12px] text-[var(--mu)] mt-0.5">
                      Clears all note tabs, captured frames, and chat messages, starting with one fresh empty note. Your API key is kept.
                    </div>
                  </div>
                  {!confirmReset ? (
                    <button
                      type="button"
                      onClick={() => setConfirmReset(true)}
                      className="h-[34px] px-3.5 rounded-[6px] text-[12.5px] font-medium shrink-0 cursor-pointer"
                      style={{
                        backgroundColor: 'transparent',
                        color: 'var(--tx)',
                        border: '1px solid var(--bd2)',
                      }}
                    >
                      Reset workspace
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onResetWorkspace();
                          setConfirmReset(false);
                          onOpenChange(false);
                        }}
                        className="h-[34px] px-3 rounded-[6px] text-[12px] font-semibold cursor-pointer"
                        style={{
                          backgroundColor: '#9a3632',
                          color: '#ffffff',
                        }}
                      >
                        Confirm reset
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmReset(false)}
                        className="h-[34px] px-2.5 rounded-[6px] text-[12px] text-[var(--mu)] cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
