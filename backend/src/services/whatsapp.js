// ═══════════════════════════════════════════════════════════════════════
// Integración con WhatsApp Cloud API (Meta)
//   - Verificación de firma X-Hub-Signature-256
//   - Extracción de mensajes del payload del webhook
//   - Descarga de audios (notas de voz)
//   - Envío de respuestas
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
// ═══════════════════════════════════════════════════════════════════════
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

const graphUrl = (path) => `https://graph.facebook.com/${config.whatsapp.graphVersion}/${path}`;
const authHeader = () => ({ Authorization: `Bearer ${config.whatsapp.accessToken}` });

/**
 * Verifica que el webhook venga realmente de Meta.
 * Meta firma el body CRUDO con HMAC-SHA256 usando tu App Secret.
 * @param {Buffer} rawBody
 * @param {string|undefined} signatureHeader  "sha256=abcdef..."
 */
export function verifySignature(rawBody, signatureHeader) {
  if (!config.whatsapp.appSecret) return true; // desarrollo: sin secreto configurado
  if (!signatureHeader?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', config.whatsapp.appSecret).update(rawBody).digest();
  const received = Buffer.from(signatureHeader.slice(7), 'hex');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * Normaliza el payload de Meta a una lista de mensajes simples.
 * Ignora eventos de estado (sent/delivered/read), que también llegan al webhook.
 * @returns {Array<{ waMessageId: string, from: string, name: string|null, type: 'text'|'audio'|'unsupported', text?: string, mediaId?: string, mimeType?: string }>}
 */
export function extractMessages(body) {
  const out = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      const names = Object.fromEntries((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name ?? null]));
      for (const m of value.messages ?? []) {
        const base = { waMessageId: m.id, from: m.from, name: names[m.from] ?? null };
        if (m.type === 'text') out.push({ ...base, type: 'text', text: m.text?.body ?? '' });
        else if (m.type === 'audio') out.push({ ...base, type: 'audio', mediaId: m.audio?.id, mimeType: m.audio?.mime_type });
        else out.push({ ...base, type: 'unsupported' });
      }
    }
  }
  return out;
}

/**
 * Descarga un archivo multimedia (2 pasos: obtener URL temporal → descargar con token).
 * Las notas de voz llegan como audio/ogg; codecs=opus (Whisper lo acepta directo).
 * @returns {Promise<{ buffer: Buffer, mimeType: string }>}
 */
export async function downloadMedia(mediaId) {
  const metaRes = await fetch(graphUrl(mediaId), { headers: authHeader(), signal: AbortSignal.timeout(10000) });
  if (!metaRes.ok) throw new Error(`No se pudo obtener la URL del audio (${metaRes.status})`);
  const { url, mime_type } = await metaRes.json();

  const fileRes = await fetch(url, { headers: authHeader(), signal: AbortSignal.timeout(30000) });
  if (!fileRes.ok) throw new Error(`No se pudo descargar el audio (${fileRes.status})`);
  return { buffer: Buffer.from(await fileRes.arrayBuffer()), mimeType: mime_type ?? 'audio/ogg' };
}

/** Envía un mensaje de texto. Sin token configurado, lo imprime (modo desarrollo). */
export async function sendText(to, body, log = console) {
  if (!config.whatsapp.accessToken || !config.whatsapp.phoneNumberId) {
    log.info({ to, body }, '📤 [simulado] respuesta de WhatsApp');
    return;
  }
  const res = await fetch(graphUrl(`${config.whatsapp.phoneNumberId}/messages`), {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body, preview_url: false } }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`WhatsApp sendText falló (${res.status}): ${await res.text()}`);
}
