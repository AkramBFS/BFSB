/**
 * GemmaTH Real Frame Capture Engine
 *
 * Supports:
 * 1. Direct HTML5 <video> frame extraction (for local video files, 0 permissions needed).
 * 2. Persistent Browser Tab Capture via `navigator.mediaDevices.getDisplayMedia` with
 *    exact coordinate cropping to the video player box across any zoom, DPI, and scroll offset.
 * 3. Surface validation (ensures the user shared the browser tab rather than an entire monitor/window).
 * 4. Demo / fallback math slide generator for browsers without getDisplayMedia (e.g. mobile).
 */

export class CaptureError extends Error {
  constructor(code, userMessage) {
    super(userMessage);
    this.name = 'CaptureError';
    this.code = code;
    this.userMessage = userMessage;
  }
}

class TabCaptureSessionManager {
  constructor() {
    this.stream = null;
    this.videoEl = null;
    this.listeners = new Set();

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.stopCapture());
    }
  }

  isSupported() {
    return Boolean(
      typeof navigator !== 'undefined' &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getDisplayMedia === 'function'
    );
  }

  isActive() {
    if (!this.stream) return false;
    const tracks = this.stream.getVideoTracks();
    return tracks.length > 0 && tracks[0].readyState === 'live';
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.isActive());
    return () => this.listeners.delete(listener);
  }

  notify() {
    const active = this.isActive();
    this.listeners.forEach((fn) => {
      try {
        fn(active);
      } catch {
        // Ignore listener error
      }
    });
  }

  /**
   * Start persistent tab capture session.
   * Requests permission once, validates surface is 'browser' (tab), and keeps stream warm.
   */
  async startCapture() {
    if (this.isActive()) {
      return this.stream;
    }

    if (!this.isSupported()) {
      throw new CaptureError(
        'UNSUPPORTED_BROWSER',
        'Direct tab capture is not supported in this browser. Paste a screenshot with Ctrl+V, drag an image in, or open a local video file.'
      );
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
          frameRate: { ideal: 30, max: 60 },
        },
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'include',
      });
    } catch (err) {
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        throw new CaptureError(
          'PERMISSION_DENIED',
          'Screen capture was cancelled or denied. Choose this tab when prompted, or paste a screenshot with Ctrl+V.'
        );
      }
      throw new CaptureError(
        'CAPTURE_FAILED',
        'Could not start tab capture. Paste a screenshot with Ctrl+V or upload an image instead.'
      );
    }

    const [videoTrack] = stream.getVideoTracks();
    if (!videoTrack) {
      stream.getTracks().forEach((t) => t.stop());
      throw new CaptureError('NO_VIDEO_TRACK', 'No video track was received from tab capture.');
    }

    // Verify the user selected a browser tab, not a window or entire screen
    const settings = videoTrack.getSettings ? videoTrack.getSettings() : {};
    if (settings.displaySurface && settings.displaySurface !== 'browser') {
      stream.getTracks().forEach((t) => t.stop());
      throw new CaptureError(
        'WRONG_SURFACE',
        'You shared a window or entire screen instead of this browser tab. Click Capture frame again and choose This Tab.'
      );
    }

    videoTrack.onended = () => {
      this.cleanup();
    };

    // Create warm hidden video element consuming the MediaStream
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Stream initialization timed out')), 4000);
      video.onloadedmetadata = async () => {
        clearTimeout(timeout);
        try {
          await video.play();
          resolve();
        } catch (playErr) {
          reject(playErr);
        }
      };
    }).catch(() => {
      stream.getTracks().forEach((t) => t.stop());
      throw new CaptureError('STREAM_INIT_ERROR', 'Could not read video stream from the shared tab.');
    });

    this.stream = stream;
    this.videoEl = video;
    this.notify();
    return stream;
  }

  stopCapture() {
    this.cleanup();
  }

  cleanup() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // Ignore
        }
      });
    }
    if (this.videoEl) {
      try {
        this.videoEl.pause();
        this.videoEl.srcObject = null;
      } catch {
        // Ignore
      }
    }
    this.stream = null;
    this.videoEl = null;
    this.notify();
  }

  /**
   * Grab a fresh frame from the warm tab stream and crop strictly to `targetElement`.
   */
  async captureRegion(targetElement, { onBeforeGrab, onAfterGrab } = {}) {
    if (!targetElement) {
      throw new CaptureError('NO_TARGET', 'The video player is not visible on the page.');
    }

    if (!this.isActive()) {
      await this.startCapture();
    }

    // Ensure the video player is visible within the viewport
    let rect = targetElement.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) {
      throw new CaptureError('TARGET_HIDDEN', 'The video player is currently hidden.');
    }

    const outOfView =
      rect.top < 0 ||
      rect.left < 0 ||
      rect.bottom > window.innerHeight ||
      rect.right > window.innerWidth;

    if (outOfView) {
      targetElement.scrollIntoView({ behavior: 'instant', block: 'center' });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      rect = targetElement.getBoundingClientRect();
    }

    // Hide custom player overlay controls momentarily so the captured image is clean
    if (onBeforeGrab) onBeforeGrab();

    // Wait two animation frames so the browser compositor paints the clean video frame
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 45);
        });
      });
    });

    try {
      const video = this.videoEl;
      if (!video || !this.isActive() || video.videoWidth === 0 || video.videoHeight === 0) {
        this.cleanup();
        throw new CaptureError(
          'CAPTURE_STOPPED',
          'Tab capture ended. Click Capture frame to reconnect.'
        );
      }

      const streamW = video.videoWidth;
      const streamH = video.videoHeight;
      const viewW = window.innerWidth;
      const viewH = window.innerHeight;

      // Scale factors map CSS viewport coordinates to physical stream pixels
      // (accurately handles Retina/HiDPI, browser zoom, and window resizing)
      const scaleX = streamW / viewW;
      const scaleY = streamH / viewH;

      // Inset by 1px to avoid capturing the 1px panel border
      const inset = 1;
      const cropX = Math.max(0, Math.round((rect.left + inset) * scaleX));
      const cropY = Math.max(0, Math.round((rect.top + inset) * scaleY));
      const cropW = Math.min(
        streamW - cropX,
        Math.max(1, Math.round((rect.width - inset * 2) * scaleX))
      );
      const cropH = Math.min(
        streamH - cropY,
        Math.max(1, Math.round((rect.height - inset * 2) * scaleY))
      );

      // Output dimensions capped at 1280x720 for crisp math OCR and fast upload
      const maxOutW = 1280;
      const outScale = cropW > maxOutW ? maxOutW / cropW : 1;
      const outW = Math.max(1, Math.round(cropW * outScale));
      const outH = Math.max(1, Math.round(cropH * outScale));

      const canvas = document.createElement('canvas');
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas 2D context unavailable');
      }

      ctx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, outW, outH);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
      const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');

      return {
        dataUrl,
        base64,
        width: outW,
        height: outH,
        method: 'tab-capture',
      };
    } finally {
      if (onAfterGrab) onAfterGrab();
    }
  }
}

export const tabCaptureManager = new TabCaptureSessionManager();

/**
 * Direct zero-permission capture from a local HTML5 <video> element.
 */
export function captureLocalVideoElement(videoElement) {
  if (!videoElement || videoElement.readyState < 2) {
    throw new CaptureError(
      'VIDEO_NOT_READY',
      'Wait for the local video to load a frame before capturing.'
    );
  }

  const vw = videoElement.videoWidth || 1280;
  const vh = videoElement.videoHeight || 720;
  const maxW = 1280;
  const scale = vw > maxW ? maxW / vw : 1;
  const outW = Math.max(1, Math.round(vw * scale));
  const outH = Math.max(1, Math.round(vh * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new CaptureError('CANVAS_ERROR', 'Could not create canvas context for frame capture.');
  }

  ctx.drawImage(videoElement, 0, 0, vw, vh, 0, 0, outW, outH);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.86);
  const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');

  return {
    dataUrl,
    base64,
    width: outW,
    height: outH,
    method: 'local-video',
  };
}

/**
 * Generate a clean, high-contrast sample handwritten/lecture math slide image
 * for demos, testing Snap-to-LaTeX, or fallback when offline/without screen share.
 */
export function generateSampleMathSlide({
  timestamp = '12:34',
  variant = 'gradient-descent',
} = {}) {
  const width = 960;
  const height = 540;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Blackboard / lecture slide background
    ctx.fillStyle = '#141311';
    ctx.fillRect(0, 0, width, height);

    // Subtle coordinate grid
    ctx.strokeStyle = 'rgba(255, 248, 235, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 48; x < width; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 48; y < height; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (variant === 'handwritten-bayes') {
      ctx.fillStyle = '#aaa398';
      ctx.font = '500 20px "DM Sans", sans-serif';
      ctx.fillText('Lecture Note · Conditional Posterior', 64, 72);

      ctx.fillStyle = '#f2eee6';
      ctx.font = 'italic 46px "Newsreader", Georgia, serif';
      ctx.fillText('P(θ | D) = [ P(D | θ) · P(θ) ] / P(D)', 64, 220);

      ctx.fillStyle = '#e0b45a';
      ctx.font = 'italic 34px "Newsreader", Georgia, serif';
      ctx.fillText('MAP:  θ_MAP = argmax_θ [ log P(D | θ) + log P(θ) ]', 64, 330);
    } else {
      // Default: Gradient Descent & MSE Loss Slide
      ctx.fillStyle = '#aaa398';
      ctx.font = '500 18px "DM Sans", sans-serif';
      ctx.fillText('Machine Learning · Optimization & Loss Landscape', 64, 68);

      ctx.fillStyle = '#f2eee6';
      ctx.font = '42px "Newsreader", Georgia, serif';
      ctx.fillText('Gradient Descent Parameter Update', 64, 130);

      // Formula box
      ctx.fillStyle = '#201e1a';
      ctx.strokeStyle = 'rgba(224, 180, 90, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(64, 170, 560, 110, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#f2eee6';
      ctx.font = 'italic 36px Georgia, serif';
      ctx.fillText('θ_j := θ_j − α · ∂J(θ) / ∂θ_j', 105, 236);

      ctx.fillStyle = '#d6cfc2';
      ctx.font = 'italic 28px Georgia, serif';
      ctx.fillText('J(θ) = (1 / 2m) Σ (h_θ(x⁽ⁱ⁾) − y⁽ⁱ⁾)²', 64, 355);

      // Parabolic loss curve illustration on the right
      ctx.strokeStyle = '#e0b45a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let x = 670; x <= 890; x += 4) {
        const u = (x - 780) / 85;
        const y = 370 - (1 - u * u) * -140 - 140;
        if (x === 670) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Tangent point on curve
      ctx.fillStyle = '#d98a86';
      ctx.beginPath();
      ctx.arc(715, 292, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#aaa398';
      ctx.font = '15px "DM Sans", sans-serif';
      ctx.fillText(`Captured at ${timestamp}`, 64, 480);
    }
  }

  const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
  const base64 = dataUrl.replace(/^data:image\/jpeg;base64,/, '');
  return {
    dataUrl,
    base64,
    width,
    height,
    method: 'sample-slide',
  };
}
