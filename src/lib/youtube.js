/**
 * YouTube URL parsing, validation, and timestamp formatting utilities.
 */

/**
 * Parse a time parameter string like "90", "90s", "1m30s", "1h2m3s" into seconds.
 */
export function parseTimeParam(param) {
  if (!param) return 0;
  const str = String(param).trim().toLowerCase();

  if (/^\d+$/.test(str)) {
    return parseInt(str, 10);
  }

  let total = 0;
  const hours = str.match(/(\d+)h/);
  const minutes = str.match(/(\d+)m/);
  const seconds = str.match(/(\d+)s/);

  if (hours) total += parseInt(hours[1], 10) * 3600;
  if (minutes) total += parseInt(minutes[1], 10) * 60;
  if (seconds) total += parseInt(seconds[1], 10);

  if (total === 0 && /^\d+s?$/.test(str)) {
    total = parseInt(str, 10) || 0;
  }

  return total;
}

/**
 * Validate and normalize any common YouTube URL form:
 * - https://www.youtube.com/watch?v=VIDEO_ID&t=120s
 * - https://youtu.be/VIDEO_ID?t=120
 * - https://www.youtube.com/embed/VIDEO_ID?start=120
 * - https://m.youtube.com/watch?v=VIDEO_ID
 * - youtube.com/watch?v=VIDEO_ID
 *
 * Returns { isValid, videoId, canonicalUrl, embedUrl, startTime, error }
 */
export function parseYouTubeUrl(rawInput) {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    return {
      isValid: false,
      videoId: null,
      canonicalUrl: '',
      embedUrl: '',
      startTime: 0,
      error: 'Enter a YouTube link or open a local video file.',
    };
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let urlObj;
  try {
    urlObj = new URL(withProtocol);
  } catch {
    return {
      isValid: false,
      videoId: null,
      canonicalUrl: '',
      embedUrl: '',
      startTime: 0,
      error: 'That link is not a valid URL. Paste a youtube.com/watch or youtu.be link.',
    };
  }

  const host = urlObj.hostname.replace(/^www\./i, '').replace(/^m\./i, '').toLowerCase();
  let videoId = null;
  let startTime = 0;

  if (host === 'youtu.be') {
    const seg = urlObj.pathname.split('/').filter(Boolean)[0];
    if (seg) videoId = seg;
    startTime = parseTimeParam(urlObj.searchParams.get('t') || urlObj.searchParams.get('start'));
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (urlObj.pathname === '/watch') {
      videoId = urlObj.searchParams.get('v');
    } else if (
      (pathParts[0] === 'embed' ||
        pathParts[0] === 'v' ||
        pathParts[0] === 'shorts' ||
        pathParts[0] === 'live') &&
      pathParts[1]
    ) {
      videoId = pathParts[1];
    }
    startTime = parseTimeParam(urlObj.searchParams.get('t') || urlObj.searchParams.get('start'));
  } else {
    return {
      isValid: false,
      videoId: null,
      canonicalUrl: '',
      embedUrl: '',
      startTime: 0,
      error: 'Only YouTube links or local video files are supported in the player.',
    };
  }

  // Standard YouTube video IDs are 11 characters: [A-Za-z0-9_-]{11}
  if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    return {
      isValid: false,
      videoId: null,
      canonicalUrl: '',
      embedUrl: '',
      startTime: 0,
      error: 'Could not find a valid 11-character YouTube video ID in that link.',
    };
  }

  const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&rel=0&modestbranding=1${
    startTime > 0 ? `&start=${startTime}` : ''
  }`;

  return {
    isValid: true,
    videoId,
    canonicalUrl,
    embedUrl,
    startTime,
    error: null,
  };
}

/**
 * Format seconds as mm:ss or hh:mm:ss
 */
export function formatSeconds(sec) {
  if (typeof sec !== 'number' || isNaN(sec) || sec < 0) return '00:00';
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Parse a timestamp string like "12:34" or "1:02:34" into seconds
 */
export function parseTimestampToSeconds(str) {
  if (!str) return null;
  const match = String(str).match(/(?:(\d{1,2}):)?(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  return hours * 3600 + minutes * 60 + seconds;
}
