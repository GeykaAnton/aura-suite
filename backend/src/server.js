// Punto de entrada: npm run dev (local) / npm start (producción)
import { config, configErrors, configWarnings } from './config.js';
import { createRepository } from './db/repository.js';
import { buildApp } from './app.js';

const errors = configErrors();
if (errors.length) {
  for (const e of errors) console.error(`❌ ${e}`);
  process.exit(1);
}

const repo = await createRepository(config.databaseUrl, { caCert: config.databaseCaCert });
const app = await buildApp({ repo });

for (const w of configWarnings()) app.log.warn(`⚠️  ${w}`);

// Railway/Render envían SIGTERM en cada deploy: cerramos ordenadamente
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    app.log.info(`${signal} recibido, cerrando…`);
    await app.close();
    await repo.close?.();
    process.exit(0);
  });
}

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`🌸 Aura Suite backend en puerto ${config.port} (IA: ${config.llm.mode}, voz: ${config.transcription.mode}, prod: ${config.isProduction})`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
