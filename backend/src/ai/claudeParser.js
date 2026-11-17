// Intérprete con Claude (Anthropic API) usando "structured outputs":
// la respuesta está garantizada a cumplir AI_OUTPUT_JSON_SCHEMA.
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { AI_OUTPUT_JSON_SCHEMA, AiOutputSchema } from './schema.js';
import { SYSTEM_PROMPT, buildUserContent } from './systemPrompt.js';

export class AiUnavailableError extends Error {}

let client; // perezoso: no exige credenciales si estás en modo mock
const getClient = () => (client ??= new Anthropic());

/**
 * @param {string} text  Mensaje o transcripción
 * @param {{ today: string, bcvRate: number, defaultMarginPct: number, channel: string }} ctx
 */
export async function parseWithClaude(text, ctx) {
  let response;
  try {
    response = await getClient().beta.messages.create({
      model: config.llm.model,
      max_tokens: 16000,
      // Si el modelo declina por un falso positivo de seguridad, la API
      // reintenta automáticamente con un modelo de respaldo.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: config.llm.effort, // 'low' basta para extracción; súbelo si hay errores
        format: { type: 'json_schema', schema: AI_OUTPUT_JSON_SCHEMA },
      },
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: buildUserContent(text, ctx) }],
    });
  } catch (err) {
    // El SDK ya reintenta 2 veces 429/5xx/errores de red. Si llega aquí, avisamos amable.
    if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.InternalServerError) {
      throw new AiUnavailableError(`IA temporalmente no disponible: ${err.message}`);
    }
    throw err; // 400/401/404 = error de configuración: que se vea en los logs
  }

  if (response.stop_reason === 'refusal') {
    throw new AiUnavailableError('La IA declinó procesar el mensaje');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new AiUnavailableError('Respuesta de la IA truncada (max_tokens)');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new AiUnavailableError('La IA no devolvió contenido');

  return AiOutputSchema.parse(JSON.parse(textBlock.text));
}
