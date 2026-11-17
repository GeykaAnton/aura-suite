// Transcripción de notas de voz con Whisper (cualquier API compatible con
// el endpoint /v1/audio/transcriptions de OpenAI: OpenAI, Groq, etc.).
import { config } from '../config.js';

// Vocabulario que le "sugiere" a Whisper cómo escribir términos locales
// (mejora mucho "Pago Móvil", "Zelle", "Binance", "bolos"…).
const VOCAB_HINT =
  'Pago Móvil, Zelle, Binance, USDT, bolívares, bolos, lucas, BCV, punto de venta, insumos, fiado, delivery, dólares.';

/**
 * @param {Buffer} audioBuffer
 * @param {string} mimeType
 * @param {{ simulatedText?: string }} [opts]  En modo mock, devuelve este texto
 * @returns {Promise<string>}
 */
export async function transcribeAudio(audioBuffer, mimeType = 'audio/ogg', { simulatedText } = {}) {
  if (config.transcription.mode === 'mock') {
    if (!simulatedText) throw new Error('Modo mock: envía "simulated_transcription" para simular la nota de voz');
    return simulatedText;
  }

  const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mpeg') ? 'mp3' : mimeType.includes('mp4') ? 'm4a' : 'ogg';
  const form = new FormData();
  form.append('file', new Blob([audioBuffer], { type: mimeType.split(';')[0] }), `nota.${ext}`);
  form.append('model', config.transcription.model);
  form.append('language', 'es');
  form.append('prompt', VOCAB_HINT);
  form.append('response_format', 'json');

  const res = await fetch(config.transcription.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.transcription.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Whisper falló (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return (data.text ?? '').trim();
}
