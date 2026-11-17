// Endpoints de DESARROLLO: simulan WhatsApp sin tener Meta configurado.
// Devuelven el JSON completo del procesamiento (sin enviar nada a WhatsApp).
// Se activan con ENABLE_DEV_ROUTES=true. ¡Desactívalos en producción!
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { extractMessages } from '../services/whatsapp.js';
import { processIncomingMessage } from '../services/pipeline.js';

/** @param {import('fastify').FastifyInstance} app */
export default async function devRoutes(app, { repo }) {
  // Si hay DEV_ROUTES_TOKEN (obligatorio en producción), exigir header x-dev-token
  if (config.devRoutesToken) {
    const expected = Buffer.from(config.devRoutesToken);
    app.addHook('onRequest', async (req, reply) => {
      const got = Buffer.from(String(req.headers['x-dev-token'] ?? ''));
      if (got.length !== expected.length || !timingSafeEqual(got, expected)) return reply.code(401).send({ error: 'x-dev-token inválido' });
    });
  }

  /**
   * POST /dev/simulate
   *  Texto:  { "from": "584141234567", "text": "Gasté 20$ en insumos y cobré 50$ por Pago Móvil" }
   *  Audio:  { "from": "584141234567", "type": "audio", "simulated_transcription": "..." }
   *  O un payload real de Meta (con "entry": [...]) para probar el parser del webhook.
   */
  app.post('/dev/simulate', async (req) => {
    const body = req.body ?? {};
    const messages = body.entry
      ? extractMessages(body)
      : [{
          waMessageId: body.wa_message_id ?? `sim-${randomUUID()}`,
          from: body.from ?? '584140000000',
          name: body.name ?? 'Usuaria de prueba',
          type: body.type ?? 'text',
          text: body.text,
          simulatedTranscription: body.simulated_transcription,
        }];

    const results = [];
    for (const m of messages) {
      // En simulación los audios no se descargan: se usa simulated_transcription
      results.push(await processIncomingMessage({ repo, log: req.log }, { ...m, simulatedTranscription: m.simulatedTranscription ?? body.simulated_transcription }));
    }
    return results.length === 1 ? results[0] : results;
  });
}
