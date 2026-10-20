import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import ReactPlayer from 'react-player';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  LinkIcon,
  FrameCaptureIcon,
  PlayIcon,
  PauseIcon,
  FolderVideoIcon,
  SigmaIcon,
  ClockIcon,
} from './Icons';
import { parseYouTubeUrl, formatSeconds } from '../lib/youtube';
import {
  tabCaptureManager,
  captureLocalVideoElement,
  generateSampleMathSlide,
} from '../lib/frameCapture';
import { useToast } from './ToastContext';

export const VideoPane = forwardRef(function VideoPane(
  {
    youtubeUrl = 'https://www.youtube.com/watch?v=IHZwWFHWa-w',
    videoState = {},
    onUrlChange,
    onVideoStateChange,
    onFrameCaptured,
    onInsertTimestamp,
    onTimeChange,
  },
  ref
) {
  const { showToast } = useToast();

  const [urlInput, setUrlInput] = useState(youtubeUrl);
  const [prevUrl, setPrevUrl] = useState(youtubeUrl);
  const [urlError, setUrlError] = useState(null);

  const [localVideoUrl, setLocalVideoUrl] = useState(null);
  const [localVideoName, setLocalVideoName] = useState('');

  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(videoState?.lastPosition || 0);
  const [duration, setDuration] = useState(1153); // ~19:13 default for 3B1B lecture
  const [playerError, setPlayerError] = useState(null);

  const [isCapturing, setIsCapturing] = useState(false);
  const [isTabStreamActive, setIsTabStreamActive] = useState(false);
  const [hideOverlayForCapture, setHideOverlayForCapture] = useState(false);
  const [autoSnapLatex, setAutoSnapLatex] = useState(false);
  const [captureFallbackMsg, setCaptureFallbackMsg] = useState(null);

  const ytPlayerRef = useRef(null);
  const localVideoRef = useRef(null);
  const videoWellRef = useRef(null);
  const localFileInputRef = useRef(null);
  const restoredPositionRef = useRef(false);

  if (prevUrl !== youtubeUrl) {
    setPrevUrl(youtubeUrl);
    setUrlInput(youtubeUrl);
    setUrlError(null);
  }

  // Subscribe to persistent tab capture session state
  useEffect(() => {
    return tabCaptureManager.subscribe((active) => {
      setIsTabStreamActive(active);
    });
  }, []);

  // Clean up local object URL on unmount
  useEffect(() => {
    return () => {
      if (localVideoUrl) {
        URL.revokeObjectURL(localVideoUrl);
      }
    };
  }, [localVideoUrl]);

  const updateCurrentTime = (sec) => {
    if (typeof sec === 'number' && !isNaN(sec) && sec >= 0) {
      setCurrentTime(sec);
      if (onTimeChange) onTimeChange(sec);
    }
  };

  // Expose seekTo and getCurrentTime to parent App
  useImperativeHandle(ref, () => ({
    seekTo: (seconds) => {
      const target = Math.max(0, Number(seconds) || 0);
      updateCurrentTime(target);

      if (localVideoUrl && localVideoRef.current) {
        localVideoRef.current.currentTime = target;
        return;
      }

      const player = ytPlayerRef.current;
      if (player) {
        if (typeof player.seekTo === 'function') {
          player.seekTo(target, 'seconds');
        } else if ('currentTime' in player) {
          try {
            player.currentTime = target;
          } catch {
            // Ignore
          }
        }
      }
    },
    getCurrentTime: () => currentTime,
  }));

  const handleUrlCommit = (e) => {
    e?.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setUrlError('Paste a valid YouTube link or open a local video file.');
      return;
    }

    const parsed = parseYouTubeUrl(trimmed);
    if (!parsed.isValid) {
      setUrlError(parsed.error);
      return;
    }

    setUrlError(null);
    setPlayerError(null);

    // Switch back from local file if user entered a YouTube link
    if (localVideoUrl) {
      URL.revokeObjectURL(localVideoUrl);
      setLocalVideoUrl(null);
      setLocalVideoName('');
    }

    if (parsed.canonicalUrl !== youtubeUrl || localVideoUrl) {
      restoredPositionRef.current = false;
      onUrlChange(parsed.canonicalUrl);
      if (parsed.startTime > 0) {
        updateCurrentTime(parsed.startTime);
      }
      if (onVideoStateChange) {
        onVideoStateChange({
          sourceType: 'youtube',
          title: videoState?.title || 'YouTube lecture',
          lastPosition: parsed.startTime || 0,
          localFileName: '',
        });
      }
      showToast('Video link updated');
    }
  };

  const handleLocalVideoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      showToast('Select a valid video file (MP4, WebM, MOV).', 'error');
      return;
    }

    if (localVideoUrl) {
      URL.revokeObjectURL(localVideoUrl);
    }

    const blobUrl = URL.createObjectURL(file);
    const cleanTitle = file.name.replace(/\.[^/.]+$/, '');
    setLocalVideoUrl(blobUrl);
    setLocalVideoName(file.name);
    setUrlError(null);
    setPlayerError(null);
    setCaptureFallbackMsg(null);
    setIsPlaying(false);
    updateCurrentTime(0);

    if (onVideoStateChange) {
      onVideoStateChange({
        sourceType: 'local',
        title: cleanTitle,
        lastPosition: 0,
        localFileName: file.name,
      });
    }
    showToast(`Loaded local video: ${file.name}`);
    e.target.value = '';
  };

  const handleTogglePlay = () => {
    if (localVideoUrl && localVideoRef.current) {
      if (localVideoRef.current.paused) {
        localVideoRef.current.play().catch(() => {});
        setIsPlaying(true);
      } else {
        localVideoRef.current.pause();
        setIsPlaying(false);
      }
      return;
    }

    const player = ytPlayerRef.current;
    if (player) {
      if (isPlaying && typeof player.pause === 'function') {
        player.pause();
      } else if (!isPlaying && typeof player.play === 'function') {
        player.play().catch?.(() => {});
      }
    }
    setIsPlaying((prev) => !prev);
  };

  const handleScrub = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetSec = ratio * (duration || 1);
    updateCurrentTime(targetSec);

    if (localVideoUrl && localVideoRef.current) {
      localVideoRef.current.currentTime = targetSec;
    } else if (ytPlayerRef.current) {
      if (typeof ytPlayerRef.current.seekTo === 'function') {
        ytPlayerRef.current.seekTo(targetSec, 'seconds');
      } else if ('currentTime' in ytPlayerRef.current) {
        try {
          ytPlayerRef.current.currentTime = targetSec;
        } catch {
          // Ignore
        }
      }
    }

    if (onVideoStateChange) {
      onVideoStateChange({
        ...videoState,
        lastPosition: Math.floor(targetSec),
      });
    }
  };

  /**
   * Headline Feature: Capture exact video frame (from local video or cropped tab capture).
   */
  const handleCapture = async () => {
    setIsCapturing(true);
    setCaptureFallbackMsg(null);
    const timeStr = formatSeconds(currentTime);
    const secRounded = Math.floor(currentTime);

    try {
      let captured;
      if (localVideoUrl && localVideoRef.current) {
        // Direct zero-permission capture from local video element
        captured = captureLocalVideoElement(localVideoRef.current);
      } else {
        // Persistent tab capture cropped to the video well
        captured = await tabCaptureManager.captureRegion(videoWellRef.current, {
          onBeforeGrab: () => setHideOverlayForCapture(true),
          onAfterGrab: () => setHideOverlayForCapture(false),
        });
      }

      const newFrame = {
        id: `frame-${Date.now()}`,
        timestamp: timeStr,
        seconds: secRounded,
        videoUrl: localVideoUrl ? `local://${localVideoName}` : youtubeUrl,
        label: `Frame ${timeStr}`,
        caption: `Frame at ${timeStr}`,
        dataUrl: captured.dataUrl,
        base64: captured.base64,
        width: captured.width,
        height: captured.height,
      };

      onFrameCaptured(newFrame, { snapToLatex: autoSnapLatex });
      showToast(
        autoSnapLatex
          ? `Captured frame at ${timeStr} and transcribing math...`
          : `Captured frame at ${timeStr}`
      );
    } catch (err) {
      setHideOverlayForCapture(false);
      const message =
        err?.userMessage ||
        'Could not capture the tab directly. Paste a screenshot with Ctrl+V, open a local video, or use the sample slide below.';
      setCaptureFallbackMsg(message);
    } finally {
      setIsCapturing(false);
    }
  };

  /**
   * Fallback: Capture high-contrast sample math slide so demos never stall.
   */
  const handleCaptureSampleSlide = () => {
    const timeStr = formatSeconds(currentTime);
    const slide = generateSampleMathSlide({ timestamp: timeStr });
    const newFrame = {
      id: `frame-${Date.now()}`,
      timestamp: timeStr,
      seconds: Math.floor(currentTime),
      videoUrl: youtubeUrl,
      label: 'J(θ)',
      caption: `Frame at ${timeStr}, gradient descent slide`,
      dataUrl: slide.dataUrl,
      base64: slide.base64,
      width: slide.width,
      height: slide.height,
    };
    setCaptureFallbackMsg(null);
    onFrameCaptured(newFrame, { snapToLatex: autoSnapLatex });
    showToast(`Added lecture slide at ${timeStr} to tray`);
  };

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const displayTitle = localVideoUrl
    ? localVideoName.replace(/\.[^/.]+$/, '')
    : videoState?.title || 'Gradient descent, explained';

  return (
    <Tooltip.Provider delayDuration={300}>
      <section id="video-pane" aria-label="Video lecture workspace" className="flex flex-col gap-3">
        {/* 1. Header row: Video title + Auto-LaTeX toggle + Capture frame primary button */}
        <div className="flex items-center justify-between gap-3 min-h-[36px] flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0">
            <h1
              className="text-[22px] md:text-[24px] font-normal tracking-tight text-[var(--tx)] m-0 truncate"
              style={{ fontFamily: 'var(--font-serif)' }}
              title={displayTitle}
            >
              {displayTitle}
            </h1>

            {isTabStreamActive && !localVideoUrl && (
              <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded-[4px] shrink-0"
                style={{
                  backgroundColor: 'var(--rz)',
                  color: 'var(--accent-text)',
                  border: '1px solid var(--bd2)',
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ backgroundColor: 'var(--accent)' }}
                  aria-hidden="true"
                />
                <span>Capture active</span>
                <button
                  type="button"
                  onClick={() => {
                    tabCaptureManager.stopCapture();
                    showToast('Stopped tab capture sharing');
                  }}
                  className="ml-1 underline hover:opacity-80 cursor-pointer text-[var(--mu)]"
                >
                  Stop
                </button>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Auto Snap-to-LaTeX toggle */}
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  aria-pressed={autoSnapLatex}
                  onClick={() => setAutoSnapLatex(!autoSnapLatex)}
                  className="inline-flex items-center gap-1.5 h-[34px] px-2.5 rounded-[6px] text-[12px] font-medium transition-colors cursor-pointer"
                  style={{
                    backgroundColor: autoSnapLatex ? 'var(--rz)' : 'transparent',
                    color: autoSnapLatex ? 'var(--accent-text)' : 'var(--mu)',
                    border: `1px solid ${autoSnapLatex ? 'var(--accent)' : 'var(--bd2)'}`,
                  }}
                >
                  <SigmaIcon size={13} />
                  <span>→ LaTeX</span>
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side="bottom"
                  sideOffset={4}
                  className="z-50 px-2.5 py-1.5 text-[11.5px] rounded-[4px] max-w-[240px]"
                  style={{
                    backgroundColor: 'var(--rz)',
                    color: 'var(--tx)',
                    border: '1px solid var(--bd2)',
                  }}
                >
                  When enabled, capturing a frame immediately transcribes its math formula into your note at the cursor.
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>

            {/* Primary filled button: Capture frame */}
            <button
              type="button"
              onClick={handleCapture}
              disabled={isCapturing}
              aria-label="Capture video frame"
              className="inline-flex items-center gap-2 h-[34px] px-3.5 rounded-[6px] text-[13px] font-semibold shrink-0 cursor-pointer transition-colors active:opacity-90 disabled:opacity-50"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--on-accent)',
                boxShadow: 'none',
              }}
            >
              <FrameCaptureIcon size={15} />
              <span>{isCapturing ? 'Capturing...' : 'Capture frame'}</span>
            </button>
          </div>
        </div>

        {/* 2. Link field + Local video fallback button */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 w-full">
            <form onSubmit={handleUrlCommit} className="relative flex items-center flex-1">
              <label htmlFor="youtube-url-input" className="sr-only">
                YouTube lecture link
              </label>
              <span
                className="absolute left-3 text-[var(--mu)] pointer-events-none"
                aria-hidden="true"
              >
                <LinkIcon size={14} />
              </span>
              <input
                id="youtube-url-input"
                type="text"
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  if (urlError) setUrlError(null);
                }}
                onBlur={handleUrlCommit}
                placeholder="Paste a YouTube link (watch, youtu.be, or embed)"
                className="w-full h-[34px] pl-9 pr-3 rounded-[6px] text-[13px] text-[var(--tx)] placeholder:text-[var(--mu)] focus:border-[var(--accent)] transition-colors"
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${urlError ? '#d98a86' : 'var(--bd2)'}`,
                }}
              />
            </form>

            {/* Open Local Video File button */}
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  type="button"
                  onClick={() => localFileInputRef.current?.click()}
                  aria-label="Open local video file"
                  className="inline-flex items-center gap-1.5 h-[34px] px-2.5 rounded-[6px] text-[12px] font-medium text-[var(--mu)] hover:text-[var(--tx)] hover:bg-[var(--rz)] transition-colors shrink-0 cursor-pointer"
                  style={{ border: '1px solid var(--bd2)' }}
                >
                  <FolderVideoIcon size={14} />
                  <span className="hidden sm:inline">Local video</span>
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side="bottom"
                  sideOffset={4}
                  className="z-50 px-2.5 py-1 text-[11px] rounded-[4px]"
                  style={{
                    backgroundColor: 'var(--rz)',
                    color: 'var(--tx)',
                    border: '1px solid var(--bd2)',
                  }}
                >
                  Open an MP4/WebM lecture file from your computer (allows instant zero-permission frame capture)
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>

            <input
              ref={localFileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleLocalVideoSelect}
            />
          </div>

          {/* Validation error message */}
          {urlError && (
            <div
              role="alert"
              className="px-3 py-1.5 rounded-[6px] text-[12px] flex items-center justify-between gap-2"
              style={{
                backgroundColor: 'var(--rz)',
                color: 'var(--tx)',
                border: '1px solid var(--bd2)',
              }}
            >
              <span>{urlError}</span>
              <button
                type="button"
                onClick={() => {
                  const demoUrl = 'https://www.youtube.com/watch?v=IHZwWFHWa-w';
                  setUrlInput(demoUrl);
                  setUrlError(null);
                  onUrlChange(demoUrl);
                }}
                className="text-[11.5px] font-medium underline shrink-0 cursor-pointer"
                style={{ color: 'var(--accent-text)' }}
              >
                Restore default lecture
              </button>
            </div>
          )}

          {/* Capture fallback helper banner when permission denied or unsupported */}
          {captureFallbackMsg && (
            <div
              role="status"
              className="p-2.5 rounded-[6px] text-[12px] flex items-center justify-between gap-3 flex-wrap"
              style={{
                backgroundColor: 'var(--callout-bg)',
                color: 'var(--tx)',
                border: '1px solid var(--bd2)',
              }}
            >
              <span>{captureFallbackMsg}</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCaptureSampleSlide}
                  className="px-2.5 py-1 rounded-[4px] text-[11.5px] font-medium cursor-pointer"
                  style={{
                    backgroundColor: 'var(--rz)',
                    color: 'var(--tx)',
                    border: '1px solid var(--bd2)',
                  }}
                >
                  Use sample math slide
                </button>
                <button
                  type="button"
                  onClick={() => localFileInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-[4px] text-[11.5px] font-medium cursor-pointer"
                  style={{
                    backgroundColor: 'var(--rz)',
                    color: 'var(--tx)',
                    border: '1px solid var(--bd2)',
                  }}
                >
                  Open local video
                </button>
                <button
                  type="button"
                  onClick={() => setCaptureFallbackMsg(null)}
                  className="text-[11px] text-[var(--mu)] hover:text-[var(--tx)] px-1 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 3. 16:9 video well (radius 8, 1px border, dark in both themes) */}
        <div
          ref={videoWellRef}
          className="relative aspect-video w-full rounded-[8px] overflow-hidden flex flex-col justify-between"
          style={{
            backgroundColor: '#090807',
            border: '1px solid var(--bd)',
          }}
        >
          <div className="absolute inset-0 w-full h-full">
            {localVideoUrl ? (
              <video
                ref={localVideoRef}
                src={localVideoUrl}
                playsInline
                onClick={handleTogglePlay}
                onLoadedMetadata={(e) => {
                  const dur = e.currentTarget.duration;
                  if (dur && !isNaN(dur)) setDuration(dur);
                  setIsReady(true);
                }}
                onTimeUpdate={(e) => {
                  updateCurrentTime(e.currentTarget.currentTime);
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onError={() =>
                  setPlayerError(
                    'This local video format could not be decoded by the browser. Try an MP4 or WebM file.'
                  )
                }
                className="w-full h-full object-contain bg-black cursor-pointer"
              />
            ) : !playerError ? (
              <ReactPlayer
                ref={ytPlayerRef}
                src={youtubeUrl}
                playing={isPlaying}
                controls={true}
                width="100%"
                height="100%"
                onReady={() => {
                  setIsReady(true);
                  if (
                    !restoredPositionRef.current &&
                    videoState?.lastPosition > 0 &&
                    ytPlayerRef.current
                  ) {
                    restoredPositionRef.current = true;
                    try {
                      if ('currentTime' in ytPlayerRef.current) {
                        ytPlayerRef.current.currentTime = videoState.lastPosition;
                      }
                    } catch {
                      // Ignore
                    }
                  }
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onDurationChange={(e) => {
                  const dur = e?.currentTarget?.duration || ytPlayerRef.current?.duration;
                  if (dur && !isNaN(dur) && dur > 0) {
                    setDuration(dur);
                  }
                }}
                onTimeUpdate={(e) => {
                  const t = e?.currentTarget?.currentTime ?? ytPlayerRef.current?.currentTime;
                  if (typeof t === 'number' && !isNaN(t)) {
                    updateCurrentTime(t);
                  }
                }}
                onError={() => {
                  setPlayerError(
                    'This video could not be loaded or disallows embedding. Paste another YouTube link or open a local video file.'
                  );
                }}
              />
            ) : null}

            {/* Calm error fallback inside video well if YouTube embed is blocked or offline */}
            {playerError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-[#0e0d0b] text-[#f2eee6]">
                <p className="text-[14px] max-w-[380px] leading-relaxed mb-4 text-[#d6cfc2]">
                  {playerError}
                </p>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => localFileInputRef.current?.click()}
                    className="h-[32px] px-3 rounded-[6px] text-[12.5px] font-medium cursor-pointer border border-white/25 hover:bg-white/10"
                  >
                    Open local video file
                  </button>
                  <button
                    type="button"
                    onClick={handleCaptureSampleSlide}
                    className="h-[32px] px-3 rounded-[6px] text-[12.5px] font-medium cursor-pointer border border-white/25 hover:bg-white/10"
                  >
                    Capture sample math slide
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Slim bottom status & scrubber bar (hidden momentarily during frame capture) */}
          {!hideOverlayForCapture && (
            <div
              className="relative z-10 mt-auto w-full px-3 py-2 flex flex-col gap-1.5 select-none pointer-events-auto"
              style={{
                backgroundColor: 'rgba(12, 11, 10, 0.88)',
                borderTop: '1px solid rgba(255, 248, 235, 0.08)',
              }}
            >
              {/* Scrubber track */}
              <div
                role="slider"
                tabIndex={0}
                aria-label="Video timeline scrubber"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration)}
                aria-valuenow={Math.round(currentTime)}
                onClick={handleScrub}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    const next = Math.min(duration, currentTime + 5);
                    updateCurrentTime(next);
                  } else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    const prev = Math.max(0, currentTime - 5);
                    updateCurrentTime(prev);
                  }
                }}
                className="group relative w-full h-2 flex items-center cursor-pointer"
              >
                <div className="w-full h-[3px] bg-white/20 rounded-full overflow-hidden group-hover:h-[5px] transition-all">
                  <div
                    className="h-full"
                    style={{
                      width: `${progressPercent}%`,
                      backgroundColor: 'var(--accent)',
                    }}
                  />
                </div>
              </div>

              {/* Playback controls, timestamp display, and 1-click Insert Timestamp action */}
              <div className="flex items-center justify-between text-[11.5px] text-[#aaa398]">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleTogglePlay}
                    aria-label={isPlaying ? 'Pause lecture' : 'Play lecture'}
                    className="text-[#f2eee6] hover:text-[var(--accent)] transition-colors cursor-pointer"
                  >
                    {isPlaying ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
                  </button>
                  <span className="tabular-nums font-medium text-[#f2eee6]">
                    {formatSeconds(currentTime)}
                  </span>
                  <span className="opacity-50">/</span>
                  <span className="tabular-nums">{formatSeconds(duration)}</span>
                  {!isReady && !localVideoUrl && !playerError && (
                    <span className="text-[11px] text-[#aaa398] ml-1">Ready</span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {onInsertTimestamp && (
                    <button
                      type="button"
                      onClick={() => onInsertTimestamp(currentTime, formatSeconds(currentTime))}
                      title="Insert current timestamp into active note"
                      className="inline-flex items-center gap-1 text-[11.5px] text-[#f2eee6] hover:text-[var(--accent)] transition-colors cursor-pointer"
                    >
                      <ClockIcon size={12} />
                      <span>Insert {formatSeconds(currentTime)} in note</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </Tooltip.Provider>
  );
});
