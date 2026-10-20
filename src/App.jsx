import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  useDebouncedWorkspaceState,
  createDemoWorkspaceState,
} from './hooks/useDebouncedLocalStorage';
import { TopBar } from './components/TopBar';
import { VideoPane } from './components/VideoPane';
import { FramesTray } from './components/FramesTray';
import { NotesPane } from './components/NotesPane';
import { ChatDock } from './components/ChatDock';
import { SettingsDialog } from './components/SettingsDialog';
import { FrameViewerDialog } from './components/FrameViewerDialog';
import { StudyHubDrawer } from './components/StudyHubDrawer';
import { evaluateCustomTheme } from './lib/contrast';
import { formatSeconds } from './lib/youtube';
import { compressImageDataUrl, saveFrameMedia } from './lib/storage';
import { generateSampleMathSlide } from './lib/frameCapture';
import { useToast } from './components/ToastContext';

let appIdCounter = 1;
function nextAppItemId(prefix = 'item') {
  appIdCounter += 1;
  return `${prefix}-${Date.now()}-${appIdCounter}`;
}

export default function App() {
  const { showToast } = useToast();

  const {
    state,
    updateState,
    saveStatus,
    saveNow,
    skippedKeys,
    mediaById,
    registerMediaInCache,
    removeFrameById,
    resetToCleanWorkspace,
  } = useDebouncedWorkspaceState({
    onStorageWarning: (msg) => showToast(msg, 'error'),
  });

  const videoPaneRef = useRef(null);
  const notesPaneRef = useRef(null);

  const [currentSeconds, setCurrentSeconds] = useState(
    state.videoState?.lastPosition || 0
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState('ai');
  const [studyHubOpen, setStudyHubOpen] = useState(false);
  const [inspectedFrame, setInspectedFrame] = useState(null);
  const [chatAttachedFrame, setChatAttachedFrame] = useState(null);
  const [transcribingFrameId, setTranscribingFrameId] = useState(null);

  const {
    theme,
    accent,
    noteFont,
    editorFont,
    customColors,
    aiModel,
    youtubeUrl,
    videoState,
    activeTabId,
    tabs,
    frames,
    chatMessages,
  } = state;

  // Notify if any corrupted saved keys were skipped during initial load
  useEffect(() => {
    if (skippedKeys && skippedKeys.length > 0) {
      showToast(
        `Recovered workspace safely (skipped unreadable fields: ${skippedKeys.join(', ')})`
      );
    }
  }, [skippedKeys, showToast]);

  // Apply theme, swatch, and live custom color tokens to document root
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-swatch', accent);
    root.style.colorScheme = theme;

    const activeCustom = customColors?.[theme] || null;
    const { tokens } = evaluateCustomTheme(theme, accent, activeCustom);
    Object.entries(tokens).forEach(([cssVar, val]) => {
      root.style.setProperty(cssVar, val);
    });
  }, [theme, accent, customColors]);

  const currentTimeStr = formatSeconds(currentSeconds);
  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  const handleSnapFrameToLatex = useCallback(
    async (frame) => {
      if (!frame?.base64) {
        showToast('This frame has no image data to transcribe.', 'error');
        return;
      }
      setTranscribingFrameId(frame.id);
      try {
        await notesPaneRef.current?.snapImageToLatex(
          frame.base64,
          `frame ${frame.timestamp}`
        );
      } finally {
        setTranscribingFrameId(null);
      }
    },
    [showToast]
  );

  // Global clipboard paste handler for images (OS screenshots, copied diagrams)
  // Fix 3: Pasting an image ONLY adds it to the Captured Frames tray (never auto-inserts into the note).
  const handleGlobalPaste = useCallback(
    async (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      let imageItem = null;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          imageItem = items[i];
          break;
        }
      }
      if (!imageItem) return;

      const file = imageItem.getAsFile();
      if (!file) return;

      e.preventDefault();
      try {
        const compressed = await compressImageDataUrl(file, {
          maxWidth: 1280,
          maxHeight: 720,
          quality: 0.85,
        });
        const newFrame = {
          id: nextAppItemId('paste'),
          timestamp: currentTimeStr,
          seconds: Math.floor(currentSeconds),
          videoUrl: youtubeUrl,
          label: `Pasted ${currentTimeStr}`,
          caption: `Frame at ${currentTimeStr} (pasted image)`,
          dataUrl: compressed.dataUrl,
          base64: compressed.base64,
          width: compressed.width,
          height: compressed.height,
        };

        await saveFrameMedia(newFrame.id, {
          dataUrl: newFrame.dataUrl,
          base64: newFrame.base64,
        });
        registerMediaInCache(newFrame.id, {
          dataUrl: newFrame.dataUrl,
          base64: newFrame.base64,
        });

        updateState((prev) => ({
          frames: [newFrame, ...prev.frames],
        }));

        showToast(`Added pasted image (${currentTimeStr}) to frames tray`, 'info', {
          actionLabel: 'Read formula',
          onAction: () => {
            handleSnapFrameToLatex(newFrame);
          },
        });
      } catch {
        showToast('Could not process pasted image.', 'error');
      }
    },
    [
      currentSeconds,
      currentTimeStr,
      handleSnapFrameToLatex,
      registerMediaInCache,
      showToast,
      updateState,
      youtubeUrl,
    ]
  );

  useEffect(() => {
    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [handleGlobalPaste]);

  // Tab handlers
  const handleSelectTab = (id) => {
    updateState({ activeTabId: id });
  };

  const handleNewTab = () => {
    const newId = nextAppItemId('tab');
    const newTab = {
      id: newId,
      title: `Untitled ${tabs.length + 1}`,
      content: `# Untitled ${tabs.length + 1}\n\n`,
      cursorStart: `# Untitled ${tabs.length + 1}\n\n`.length,
      cursorEnd: `# Untitled ${tabs.length + 1}\n\n`.length,
    };
    updateState((prev) => ({
      tabs: [...prev.tabs, newTab],
      activeTabId: newId,
    }));
    showToast('Created new note tab');
  };

  const handleCloseTab = (idToClose) => {
    const closedIdx = tabs.findIndex((t) => t.id === idToClose);
    if (closedIdx === -1) return;
    const closedTab = tabs[closedIdx];

    if (tabs.length <= 1) {
      // Closing the last tab leaves a fresh empty one
      const freshId = nextAppItemId('tab');
      const freshTab = {
        id: freshId,
        title: 'Untitled note',
        content: '# Untitled note\n\n',
        cursorStart: 17,
        cursorEnd: 17,
      };
      updateState({
        tabs: [freshTab],
        activeTabId: freshId,
      });
      showToast(`Cleared "${closedTab.title}"`, 'info', {
        actionLabel: 'Undo',
        onAction: () => {
          updateState({
            tabs: [closedTab],
            activeTabId: closedTab.id,
          });
        },
      });
      return;
    }

    const remainingTabs = tabs.filter((t) => t.id !== idToClose);
    const nextActiveId =
      activeTabId === idToClose
        ? remainingTabs[Math.max(0, closedIdx - 1)].id
        : activeTabId;

    updateState({
      tabs: remainingTabs,
      activeTabId: nextActiveId,
    });

    showToast(`Closed "${closedTab.title}"`, 'info', {
      actionLabel: 'Undo',
      onAction: () => {
        updateState((prev) => {
          const next = [...prev.tabs];
          next.splice(Math.min(closedIdx, next.length), 0, closedTab);
          return {
            tabs: next,
            activeTabId: closedTab.id,
          };
        });
      },
    });
  };

  const handleRenameTab = (id, newTitle) => {
    updateState((prev) => ({
      tabs: prev.tabs.map((t) => (t.id === id ? { ...t, title: newTitle } : t)),
    }));
  };

  const handleReorderTabs = (fromIdx, toIdx) => {
    updateState((prev) => {
      const next = [...prev.tabs];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return { tabs: next };
    });
  };

  const handleUpdateTab = useCallback(
    (tabId, patch) => {
      updateState((prev) => ({
        tabs: prev.tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t)),
      }));
    },
    [updateState]
  );

  // Video & Frame handlers
  const handleSeekTimestamp = (seconds, label) => {
    videoPaneRef.current?.seekTo(seconds);
    showToast(`Seeked video to ${label || formatSeconds(seconds)}`);
  };

  const handleInsertTimestamp = (seconds, formatted) => {
    notesPaneRef.current?.insertAtCursor(`[${formatted}](#t=${formatted}) `);
    showToast(`Inserted timestamp ${formatted}`);
  };

  const handleFrameCaptured = async (newFrame, options = {}) => {
    await saveFrameMedia(newFrame.id, {
      dataUrl: newFrame.dataUrl,
      base64: newFrame.base64,
    });
    registerMediaInCache(newFrame.id, {
      dataUrl: newFrame.dataUrl,
      base64: newFrame.base64,
    });
    updateState((prev) => ({
      frames: [newFrame, ...prev.frames],
    }));

    if (options.snapToLatex && newFrame.base64) {
      handleSnapFrameToLatex(newFrame);
    }
  };

  const handleUploadImage = async (newFrame) => {
    await saveFrameMedia(newFrame.id, {
      dataUrl: newFrame.dataUrl,
      base64: newFrame.base64,
    });
    registerMediaInCache(newFrame.id, {
      dataUrl: newFrame.dataUrl,
      base64: newFrame.base64,
    });
    updateState((prev) => ({
      frames: [newFrame, ...prev.frames],
    }));
  };

  const handleInsertFrameToNote = (frame) => {
    if (!activeTab) return;
    const caption = frame.caption || `Frame at ${frame.timestamp}`;
    notesPaneRef.current?.insertAtCursor(`![${caption}](frame://${frame.id})`, {
      block: true,
    });
    showToast(`Added frame (${frame.timestamp}) to note`);
  };

  // Chat handlers
  const handleAddChatMessage = (newMsg) => {
    updateState((prev) => ({
      chatMessages: [...prev.chatMessages, newMsg],
    }));
  };

  const handleRemoveChatMessage = (msgId) => {
    updateState((prev) => ({
      chatMessages: prev.chatMessages.filter((m) => m.id !== msgId),
    }));
  };

  const handleClearChatMessages = () => {
    updateState({ chatMessages: [] });
  };

  const handleInsertReplyToNote = (replyText) => {
    notesPaneRef.current?.insertAtCursor(replyText, { block: true });
  };

  // Demo & Reset handlers
  const handleLoadDemoWorkspace = async () => {
    const slide = generateSampleMathSlide({ timestamp: '12:34' });
    const sampleFrame = {
      id: nextAppItemId('demo-frame'),
      timestamp: '12:34',
      seconds: 754,
      videoUrl: 'https://www.youtube.com/watch?v=IHZwWFHWa-w',
      label: 'J(θ)',
      caption: 'Frame at 12:34, cost curve',
      dataUrl: slide.dataUrl,
      base64: slide.base64,
      width: slide.width,
      height: slide.height,
    };
    await saveFrameMedia(sampleFrame.id, {
      dataUrl: sampleFrame.dataUrl,
      base64: sampleFrame.base64,
    });
    registerMediaInCache(sampleFrame.id, {
      dataUrl: sampleFrame.dataUrl,
      base64: sampleFrame.base64,
    });
    const demoState = createDemoWorkspaceState(theme, sampleFrame);
    updateState(demoState);
    showToast('Loaded demo lecture, bilingual notes, and sample frame');
  };

  const handleResetWorkspace = async () => {
    await resetToCleanWorkspace();
    showToast('Reset workspace to a clean state');
  };

  const openSettingsModal = (section = 'ai') => {
    setSettingsInitialTab(section);
    setSettingsOpen(true);
  };

  return (
    <div
      className="min-h-screen flex flex-col transition-colors selection:bg-[var(--accent)] selection:text-[var(--on-accent)]"
      style={{
        backgroundColor: 'var(--bg)',
        color: 'var(--tx)',
      }}
    >
      {/* 52px Top Bar */}
      <TopBar
        saveStatus={saveStatus}
        onSaveNow={saveNow}
        theme={theme}
        onThemeChange={(newTheme) => updateState({ theme: newTheme })}
        activeTab={activeTab}
        frames={frames}
        mediaById={mediaById}
        onOpenSettings={openSettingsModal}
        onOpenStudyHub={() => setStudyHubOpen(true)}
        lectureSubtitle={videoState?.title || 'Machine learning / Study workspace'}
      />

      {/* Main 2-column workspace */}
      <main
        id="main-layout"
        className="flex-1 w-full max-w-[1920px] mx-auto grid grid-cols-1 min-[900px]:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] gap-5 p-4 md:px-5 md:pt-4 md:pb-5"
      >
        {/* Left Column: Video Pane + Captured Frames */}
        <section id="video-column" className="flex flex-col gap-4">
          <VideoPane
            ref={videoPaneRef}
            youtubeUrl={youtubeUrl}
            videoState={videoState}
            onUrlChange={(url) => updateState({ youtubeUrl: url })}
            onVideoStateChange={(vs) =>
              updateState((prev) => ({
                videoState: { ...prev.videoState, ...vs },
              }))
            }
            onFrameCaptured={handleFrameCaptured}
            onInsertTimestamp={handleInsertTimestamp}
            onTimeChange={setCurrentSeconds}
          />

          <FramesTray
            frames={frames}
            currentTimeStr={currentTimeStr}
            currentSeconds={currentSeconds}
            youtubeUrl={youtubeUrl}
            onInsertFrameToNote={handleInsertFrameToNote}
            onSnapFrameToLatex={handleSnapFrameToLatex}
            onAttachFrameToChat={(frame) => {
              setChatAttachedFrame(frame);
              showToast(`Attached frame ${frame.timestamp} to chat`);
            }}
            onDeleteFrame={(id) => {
              removeFrameById(id);
              showToast('Removed frame from tray');
            }}
            onUploadImage={handleUploadImage}
            onInspectFrame={(frame) => setInspectedFrame(frame)}
            transcribingFrameId={transcribingFrameId}
          />
        </section>

        {/* Right Column: Notes Pane (flex-grow) + Chat Dock (fixed height) */}
        <section id="notes-column" className="flex flex-col gap-4 h-full min-h-0">
          <NotesPane
            ref={notesPaneRef}
            tabs={tabs}
            activeTabId={activeTabId}
            onSelectTab={handleSelectTab}
            onNewTab={handleNewTab}
            onCloseTab={handleCloseTab}
            onRenameTab={handleRenameTab}
            onReorderTabs={handleReorderTabs}
            onUpdateTab={handleUpdateTab}
            noteFont={noteFont}
            onSeekTimestamp={handleSeekTimestamp}
            onInspectFrame={(frame) => setInspectedFrame(frame)}
            frames={frames}
            mediaById={mediaById}
            onUploadImage={handleUploadImage}
            currentTimeStr={currentTimeStr}
            currentSeconds={currentSeconds}
            youtubeUrl={youtubeUrl}
            aiModel={aiModel}
            onRequireApiKey={() => openSettingsModal('ai')}
            onOpenStudyHub={() => setStudyHubOpen(true)}
          />

          <ChatDock
            messages={chatMessages}
            onAddMessage={handleAddChatMessage}
            onRemoveMessage={handleRemoveChatMessage}
            onClearMessages={handleClearChatMessages}
            onInsertReplyToNote={handleInsertReplyToNote}
            onInspectFrame={(frame) => setInspectedFrame(frame)}
            onOpenAiSettings={openSettingsModal}
            frames={frames}
            aiModel={aiModel}
            externalAttachedFrame={chatAttachedFrame}
            onClearExternalAttachedFrame={() => setChatAttachedFrame(null)}
            currentTimeStr={currentTimeStr}
          />
        </section>
      </main>

      {/* Workspace Settings, Custom Colors & API Key Modal */}
      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initialTab={settingsInitialTab}
        theme={theme}
        onThemeChange={(newTheme) => updateState({ theme: newTheme })}
        accent={accent}
        onAccentChange={(newAccent) => updateState({ accent: newAccent })}
        customColors={customColors}
        onCustomColorsChange={(newCustom) => updateState({ customColors: newCustom })}
        noteFont={noteFont}
        onNoteFontChange={(f) => updateState({ noteFont: f })}
        editorFont={editorFont}
        onEditorFontChange={(ef) => updateState({ editorFont: ef })}
        aiModel={aiModel}
        onAiModelChange={(m) => updateState({ aiModel: m })}
        onLoadDemoWorkspace={handleLoadDemoWorkspace}
        onResetWorkspace={handleResetWorkspace}
      />

      {/* Full Frame Inspection & Snap-to-LaTeX Lightbox */}
      <FrameViewerDialog
        frame={inspectedFrame}
        open={Boolean(inspectedFrame)}
        onOpenChange={(open) => {
          if (!open) setInspectedFrame(null);
        }}
        onInsertIntoNote={handleInsertFrameToNote}
        onSnapToLatex={handleSnapFrameToLatex}
        onAttachToChat={(frame) => {
          setChatAttachedFrame(frame);
          showToast(`Attached frame ${frame.timestamp} to chat`);
        }}
        onSeekToFrame={handleSeekTimestamp}
        isTranscribing={
          Boolean(inspectedFrame && transcribingFrameId === inspectedFrame.id)
        }
      />

      {/* AI Study Hub Slide-out Drawer (Summary + Active-Recall Quiz powered by Gemma 4) */}
      <StudyHubDrawer
        open={studyHubOpen}
        onOpenChange={setStudyHubOpen}
        activeTab={activeTab}
        aiModel={aiModel}
        noteFont={noteFont}
        onOpenAiSettings={() => openSettingsModal('ai')}
        onInsertIntoNote={handleInsertReplyToNote}
      />
    </div>
  );
}
