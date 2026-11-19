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
    mode: env.LLM_MODE ?? 'mock', // 'openai' (cualquier API compatible) | 'claude' | 'mock'
    model: env.LLM_MODEL ?? (env.LLM_MODE === 'openai' ? 'gpt-4o-mini' : 'claude-opus-5-5'),
    url: env.LLM_API_URL ?? 'https://api.openai.com/v1/chat/completions',
    fallbackModels: (env.LLM_FALLBACK_MODELS ?? '').split(/[,\s]+/).map((s) => s.trim()).filter(Boolean),
    apiKey: env.LLM_API_KEY || env.WHISPER_API_KEY || '', // por defecto reutiliza la llave de OpenAI
    effort: env.LLM_EFFORT ?? 'low',
  },

  transcription: {
    mode: env.TRANSCRIPTION_MODE ?? 'mock', // 'whisper' | 'gemini' | 'mock'
    geminiApiKey: env.GEMINI_API_KEY || env.LLM_API_KEY || '',
    geminiModels: (env.TRANSCRIPTION_GEMINI_MODELS ?? 'gemini-3.1-flash-lite,gemini-3.5-flash,gemini-3.8-flash').split(/[,\s]+/).filter(Boolean),
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

  // Panel web (modo una sola usuaria). Sin DASHBOARD_TOKEN las rutas /api/app/* quedan desactivadas.
  dashboard: {
    token: env.DASHBOARD_TOKEN || null,
    userPhone: env.DASHBOARD_USER_PHONE || null, // si no se define, se usa la usuaria con actividad más reciente
  },
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
  if (config.llm.mode === 'openai' && !config.llm.apiKey)
    w.push('LLM_MODE=openai pero falta LLM_API_KEY (o WHISPER_API_KEY).');
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
