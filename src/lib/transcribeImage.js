import { cleanLatex } from './formulas.js';
import { transcribeImageToLatex } from './aiService.js';

export { cleanLatex };

/**
 * Sends a base64 encoded image to transcribe math into KaTeX at high speed.
 * Compatible with `soheib-ai-export`'s `transcribeImage({ base64, mimeType })` contract,
 * backed by the unified GemmaTH `transcribeImageToLatex` engine.
 *
 * @param {{ base64: string, mimeType?: string, model?: string, signal?: AbortSignal }} params
 * @returns {Promise<string>}
 */
export async function transcribeImage({
  base64,
  mimeType = 'image/png',
  model,
  signal,
} = {}) {
  const res = await transcribeImageToLatex({
    imageBase64: base64,
    mimeType,
    displayMode: 'block',
    model,
    signal,
  });
  return res.displayMode === 'block' ? `$$${res.latex}$$` : `$${res.latex}$`;
}
