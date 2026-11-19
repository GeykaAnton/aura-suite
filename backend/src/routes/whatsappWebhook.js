// Webhook de WhatsApp Cloud API.
//   GET  /webhook/whatsapp → verificación inicial (Meta envía hub.challenge)
//   POST /webhook/whatsapp → mensajes entrantes
import { config } from '../config.js';
import { extractMessages, verifySignature, downloadMedia, sendText } from '../services/whatsapp.js';
import { processIncomingMessage } from '../services/pipeline.js';

/** @param {import('fastify').FastifyInstance} app */
export default async function whatsappWebhook(app, { repo }) {
  app.get('/webhook/whatsapp', async (req, reply) => {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token && token === config.whatsapp.verifyToken) {
      return reply.type('text/plain').send(challenge);
    }
    return reply.code(403).send('Token de verificación inválido');
  });

  app.post('/webhook/whatsapp', async (req, reply) => {
    if (!verifySignature(req.rawBody, req.headers['x-hub-signature-256'])) {
      req.log.warn('Firma de webhook inválida');
      return reply.code(401).send();
    }

    const messages = extractMessages(req.body);
    const changes = (req.body?.entry ?? []).flatMap((e) => e.changes ?? []);
    req.log.info({
      fields: changes.map((c) => c.field),
      incoming: messages.map((m) => m.type),
      statuses: changes.flatMap((c) => (c.value?.statuses ?? []).map((s) => s.status)),
    }, 'Webhook de WhatsApp recibido');

    // Meta exige 200 rápido (si tarda, reintenta y duplica). Respondemos ya
    // y procesamos en segundo plano. En Fase 2, cambiar por una cola
    // (p. ej. pg-boss o BullMQ) para no perder mensajes si el servidor reinicia.
    reply.code(200).send();

    for (const m of messages) {
      setImmediate(async () => {
        const result = await processIncomingMessage(
          { repo, log: req.log },
          { ...m, loadAudio: m.type === 'audio' ? () => downloadMedia(m.mediaId) : undefined },
        );
        if (result.reply) {
          try {
            await sendText(m.from, result.reply, req.log);
          } catch (err) {
            req.log.error({ err }, 'No se pudo enviar la respuesta por WhatsApp');
          }
        }
      });
    }
  });
}
