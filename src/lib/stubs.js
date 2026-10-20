/**
 * Bridges legacy stub signatures (`captureFrame`, `sendToChat`) to the real
 * GemmaTH frameCapture and aiService engines.
 */

import { generateSampleMathSlide } from './frameCapture.js';
import { askStudyAssistant } from './aiService.js';

/**
 * Capture frame signature returning base64 JPEG (no data-URL prefix).
 */
export async function captureFrame(options = {}) {
  const { timestamp = '12:34' } = options;
  const slide = generateSampleMathSlide({ timestamp });
  return slide.base64;
}

/**
 * Send prompt + optional imageBase64 to the configured Gemini / Gemma 4 model.
 */
export async function sendToChat({ text, imageBase64, history = [], model, signal }) {
  return askStudyAssistant({
    history,
    text,
    imageBase64,
    model,
    signal,
  });
}
