// Construye la app Fastify (separado de server.js para poder testearla con app.inject()).
import Fastify from 'fastify';
import { config } from './config.js';
import whatsappWebhook from './routes/whatsappWebhook.js';
import devRoutes from './routes/dev.js';
import apiRoutes from './routes/api.js';

/** @param {{ repo: import('./db/repository.js').Repository, logger?: any }} opts */
export async function buildApp({ repo, logger = { level: config.logLevel } }) {
  const app = Fastify({ logger, bodyLimit: 1_048_576 });

  // Guardamos el body CRUDO: la firma de Meta se calcula sobre los bytes exactos.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (req, body, done) => {
    req.rawBody = body;
    if (body.length === 0) return done(null, {});
    try {
      done(null, JSON.parse(body.toString('utf8')));
    } catch (err) {
      err.statusCode = 400;
      done(err);
    }
  });

  await app.register(apiRoutes, { repo });
  await app.register(whatsappWebhook, { repo });
  if (config.enableDevRoutes) await app.register(devRoutes, { repo });

  return app;
}
