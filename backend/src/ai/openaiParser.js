// Intérprete con cualquier API compatible con OpenAI (/chat/completions) usando
// structured outputs (json_schema estricto). Sirve para OpenAI, Groq, Gemini (modo OpenAI), etc.
import { config } from '../config.js';
import { AI_OUTPUT_JSON_SCHEMA, AiOutputSchema } from './schema.js';
import { SYSTEM_PROMPT, buildUserContent } from './systemPrompt.js';
import { AiUnavailableError } from './claudeParser.js';

export async function parseWithOpenAI(text, ctx) {
  const { url, apiKey, model } = config.llm;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserContent(text, ctx) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'ai_output', strict: true, schema: AI_OUTPUT_JSON_SCHEMA },
        },
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    throw new AiUnavailableError(`IA temporalmente no disponible: ${err.message}`);
  }

  if (res.status === 429 || res.status >= 500) {
    throw new AiUnavailableError(`IA temporalmente no disponible (${res.status})`);
  }
  if (!res.ok) throw new Error(`LLM falló (${res.status}): ${await res.text()}`); // config: que se vea en logs

  const data = await res.json();
  const choice = data.choices?.[0];
  if (choice?.finish_reason === 'length') throw new AiUnavailableError('Respuesta de la IA truncada');
  if (choice?.message?.refusal) throw new AiUnavailableError('La IA declinó procesar el mensaje');
  const content = choice?.message?.content;
  if (!content) throw new AiUnavailableError('La IA no devolvió contenido');

  return AiOutputSchema.parse(JSON.parse(content));
}
