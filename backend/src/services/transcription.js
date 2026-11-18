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

  if (config.transcription.mode === 'gemini') return transcribeWithGemini(audioBuffer, mimeType);

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

// Transcripción con Gemini (API nativa, audio en línea). Reintenta y usa modelos de respaldo.
async function transcribeWithGemini(audioBuffer, mimeType) {
  const { geminiApiKey, geminiModels } = config.transcription;
  const body = JSON.stringify({
    contents: [{
      parts: [
        { text: `Transcribe literalmente esta nota de voz en español (Venezuela). Devuelve SOLO la transcripción, sin comentarios. Vocabulario posible: ${VOCAB_HINT}` },
        { inline_data: { mime_type: mimeType.split(';')[0], data: Buffer.from(audioBuffer).toString('base64') } },
      ],
    }],
    generationConfig: { temperature: 0 },
  });
  let lastErr;
  for (const model of geminiModels) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': geminiApiKey },
          body,
          signal: AbortSignal.timeout(30000),
        });
        if (res.status === 429 || res.status >= 500) throw new Error(`Gemini ${res.status} [${model}]`);
        if (!res.ok) throw new Error(`Transcripción falló (${res.status}) [${model}]: ${(await res.text()).slice(0, 200)}`);
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
        if (!text) throw new Error(`Gemini no devolvió texto [${model}]`);
        return text;
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  throw lastErr;
}
