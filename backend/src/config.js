// Configuración centralizada. Lee variables de entorno una sola vez y valida.
// Regla: ningún otro módulo lee process.env directamente.

const env = process.env;

const isProduction = env.NODE_ENV === 'production';

export const config = {
  isProduction,
  port: Number(env.PORT ?? 3000),
  logLevel: env.LOG_LEVEL ?? 'info',
  timezone: env.TIMEZONE ?? 'America/Caracas',
  // En producción, /dev/* solo se activa si además hay un token (header x-dev-token)
  enableDevRoutes: env.ENABLE_DEV_ROUTES === 'true' && (!isProduction || Boolean(env.DEV_ROUTES_TOKEN)),
  devRoutesToken: env.DEV_ROUTES_TOKEN || null,

  whatsapp: {
    verifyToken: env.WHATSAPP_VERIFY_TOKEN ?? '',
    accessToken: env.WHATSAPP_ACCESS_TOKEN ?? '',
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    appSecret: env.WHATSAPP_APP_SECRET ?? '',
    graphVersion: env.GRAPH_API_VERSION ?? 'v23.0',
  },

  llm: {
    mode: env.LLM_MODE ?? 'mock', // 'claude' | 'mock'
    model: env.LLM_MODEL ?? 'claude-opus-5-5',
    effort: env.LLM_EFFORT ?? 'low',
  },

  transcription: {
    mode: env.TRANSCRIPTION_MODE ?? 'mock', // 'whisper' | 'mock'
    url: env.WHISPER_API_URL ?? 'https://api.openai.com/v1/audio/transcriptions',
    apiKey: env.WHISPER_API_KEY ?? '',
    model: env.WHISPER_MODEL ?? 'whisper-1',
  },

  rates: {
    provider: env.BCV_PROVIDER ?? 'dolarapi', // 'dolarapi' | 'bcv' | 'manual'
    manualRate: env.BCV_MANUAL_RATE ? Number(env.BCV_MANUAL_RATE) : null,
    usdtUsdRate: Number(env.USDT_USD_RATE ?? 1),
  },

  databaseUrl: env.DATABASE_URL || null,
  // Certificado CA de Supabase (contenido PEM). Supabase → Database → SSL Configuration → Download certificate
  databaseCaCert: env.DATABASE_CA_CERT ? env.DATABASE_CA_CERT.replace(/\\n/g, '\n') : null,
};

/** Errores que impiden arrancar en producción (fallar rápido > fallar en silencio). */
export function configErrors() {
  if (!isProduction) return [];
  const e = [];
  if (!config.whatsapp.appSecret) e.push('WHATSAPP_APP_SECRET es obligatorio en producción (sin él, cualquiera puede inyectar mensajes falsos).');
  if (!config.whatsapp.verifyToken || config.whatsapp.verifyToken.startsWith('cambia-esto')) e.push('Define un WHATSAPP_VERIFY_TOKEN propio.');
  if (!config.databaseUrl) e.push('DATABASE_URL es obligatorio en producción (en memoria se pierden los datos al reiniciar).');
  if (!config.whatsapp.accessToken || !config.whatsapp.phoneNumberId) e.push('Faltan WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID.');
  return e;
}

/** Advierte (sin romper) cuando falta configuración para modos "reales". */
export function configWarnings() {
  const w = [];
  if (config.llm.mode === 'claude' && !env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN)
    w.push('LLM_MODE=claude pero no hay ANTHROPIC_API_KEY (se intentará usar un perfil de `ant auth login`).');
  if (config.transcription.mode === 'whisper' && !config.transcription.apiKey)
    w.push('TRANSCRIPTION_MODE=whisper pero falta WHISPER_API_KEY.');
  if (!config.whatsapp.appSecret)
    w.push('Falta WHATSAPP_APP_SECRET: la firma del webhook NO se verificará (solo aceptable en desarrollo).');
  if (!config.whatsapp.accessToken)
    w.push('Falta WHATSAPP_ACCESS_TOKEN: las respuestas se imprimirán en consola en vez de enviarse.');
  if (!config.databaseUrl)
    w.push('Sin DATABASE_URL: usando almacenamiento EN MEMORIA (se pierde al reiniciar).');
  return w;
}
