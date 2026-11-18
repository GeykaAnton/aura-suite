// ═══════════════════════════════════════════════════════════════════════
// ORQUESTADOR: mensaje entrante → texto → IA → cálculo → BD → respuesta
//
//   [WhatsApp] ─► dedupe ─► (audio? Whisper) ─► tasa BCV ─► IA (extrae)
//        ─► money.js (calcula) ─► repositorio (guarda) ─► respuesta
//
// Devuelve un JSON con todo lo ocurrido: lo usa el webhook para responder
// y el endpoint /dev/simulate para que veas el resultado en Postman/curl.
// ═══════════════════════════════════════════════════════════════════════
import { config } from '../config.js';
import { parseWithClaude, AiUnavailableError } from '../ai/claudeParser.js';
import { parseWithOpenAI } from '../ai/openaiParser.js';
import { parseWithRules } from '../ai/mockParser.js';
import { getTodayBcvRate } from './bcvRate.js';
import { buildRateTable, calcShieldedPrice, withEquivalents, D } from './money.js';
import { transcribeAudio } from './transcription.js';
import { todayInTz, periodStart } from '../utils/dates.js';
import * as fmt from './replyFormatter.js';

const parseMessage = (text, ctx) =>
  config.llm.mode === 'openai' ? parseWithOpenAI(text, ctx)
    : config.llm.mode === 'claude' ? parseWithClaude(text, ctx)
      : parseWithRules(text, ctx);

/**
 * @param {object} deps
 * @param {import('../db/repository.js').Repository} deps.repo
 * @param {import('fastify').FastifyBaseLogger} deps.log
 * @param {object} msg
 * @param {string} msg.waMessageId
 * @param {string} msg.from                 Teléfono E.164 sin '+'
 * @param {string|null} [msg.name]
 * @param {'text'|'audio'|'unsupported'} msg.type
 * @param {string} [msg.text]
 * @param {() => Promise<{buffer: Buffer, mimeType: string}>} [msg.loadAudio]  Descarga perezosa del audio
 * @param {string} [msg.simulatedTranscription]
 */
export async function processIncomingMessage({ repo, log }, msg) {
  const user = await repo.findOrCreateUser(msg.from, msg.name ?? null);
  const channel = msg.type === 'audio' ? 'whatsapp_audio' : 'whatsapp_texto';

  const inbound = await repo.registerInboundMessage({
    waMessageId: msg.waMessageId, userId: user.id, channel, rawText: msg.text ?? null, mediaId: msg.mediaId ?? null,
  });
  if (!inbound) {
    log.info({ waMessageId: msg.waMessageId }, 'Mensaje duplicado (reintento de Meta), ignorado');
    return { status: 'duplicado', reply: null };
  }

  if (msg.type === 'unsupported') {
    await repo.updateInboundMessage(inbound.id, { status: 'procesado' });
    return { status: 'no_soportado', reply: fmt.UNSUPPORTED_REPLY };
  }

  try {
    // 1) Texto (transcribir si es nota de voz)
    let text = msg.text ?? '';
    let transcription = null;
    if (msg.type === 'audio') {
      const audio = msg.loadAudio ? await msg.loadAudio() : { buffer: Buffer.alloc(0), mimeType: 'audio/ogg' };
      transcription = await transcribeAudio(audio.buffer, audio.mimeType, { simulatedText: msg.simulatedTranscription });
      text = transcription;
      await repo.updateInboundMessage(inbound.id, { transcription });
    }

    // 2) Tasa BCV del día
    const rate = await getTodayBcvRate(repo);
    const rates = buildRateTable(rate.rate, { usdtUsdRate: config.rates.usdtUsdRate });

    // 3) IA: interpretar
    const ai = await parseMessage(text, {
      today: todayInTz(config.timezone),
      bcvRate: rate.rate,
      defaultMarginPct: user.default_margin_pct,
      channel,
    });

    // 4) Ejecutar la intención con cálculos deterministas
    const result = {
      status: 'procesado',
      input: { channel, text, transcription },
      exchange_rate: { source: 'BCV', rate: rate.rate, effective_date: rate.effectiveDate, stale: rate.stale },
      intent: ai.intent,
      transactions: [],
      pricing: null,
      summary: null,
      needs_clarification: ai.needs_clarification,
      ai_raw: ai,
      reply: '',
    };

    if (ai.intent === 'registrar_transacciones' && ai.transactions.length > 0) {
      const rows = ai.transactions.map((t) => buildTransactionRow(t, { user, rate, rates, channel, inboundId: inbound.id }));
      result.transactions = await repo.insertTransactions(rows);
      result.reply = fmt.formatTransactionsReply(result.transactions, rate, ai.friendly_note);
      if (ai.needs_clarification && ai.clarification_question) result.reply += `\n\n❓ ${ai.clarification_question}`;
    } else if (ai.intent === 'calcular_precio' && ai.pricing) {
      const p = ai.pricing;
      const unitCost = D(p.replacement_cost).div(p.pack_units ?? 1).toNumber();
      result.pricing = calcShieldedPrice(
        {
          replacementCost: unitCost,
          costCurrency: p.cost_currency,
          marginPct: p.margin_pct ?? user.default_margin_pct,
          feePct: p.fee_pct ?? 0,
          fxBufferPct: p.fx_buffer_pct ?? user.fx_buffer_pct,
        },
        rates,
      );
      await repo.savePriceQuote({ user_id: user.id, product_name: p.product_name, ...result.pricing });
      result.reply = fmt.formatPriceReply(result.pricing, p.product_name, ai.friendly_note);
    } else if (ai.intent === 'consultar_resumen') {
      const period = ai.summary_period ?? 'hoy';
      result.summary = { period, ...(await repo.summarize(user.id, periodStart(period))) };
      result.reply = fmt.formatSummaryReply(result.summary, period, rate);
    } else if (ai.intent === 'consultar_tasa') {
      result.reply = fmt.formatRateReply(rate);
    } else if (ai.needs_clarification && ai.clarification_question) {
      result.reply = `🤔 ${ai.clarification_question}`;
    } else if (ai.intent === 'ayuda') {
      result.reply = fmt.HELP_REPLY;
    } else {
      result.reply = ai.friendly_note ?? fmt.HELP_REPLY;
    }

    await repo.updateInboundMessage(inbound.id, { aiResult: ai, status: 'procesado' });
    return result;
  } catch (err) {
    log.error({ err, waMessageId: msg.waMessageId }, 'Error procesando mensaje');
    await repo.updateInboundMessage(inbound.id, { status: 'error', error: String(err.message ?? err) });
    return {
      status: 'error',
      error: err.message,
      retryable: err instanceof AiUnavailableError,
      reply: fmt.ERROR_REPLY,
    };
  }
}

/** Transacción de la IA → fila lista para BD, con tasa y equivalentes congelados. */
export function buildTransactionRow(t, { user, rate, rates, channel, inboundId }) {
  // Si dio cantidad × precio unitario, el total lo calculamos nosotras (no la IA)
  const amount = t.quantity && t.unit_price ? D(t.quantity).mul(t.unit_price).toNumber() : t.amount;

  // Tasa personalizada ("a tasa 48") solo para esta transacción
  const usedRates = t.custom_rate ? buildRateTable(t.custom_rate, { usdtUsdRate: config.rates.usdtUsdRate }) : rates;

  return {
    user_id: user.id,
    type: t.type,
    status: t.is_pending ? 'pendiente' : 'confirmada',
    amount,
    currency: t.currency,
    settlement_currency: t.settlement_currency,
    payment_method: t.payment_method,
    exchange_rate_id: t.custom_rate ? null : rate.id ?? null,
    rate_used: usedRates.USD.toNumber(),
    rate_source: t.custom_rate ? 'MANUAL' : 'BCV',
    ...withEquivalents(amount, t.currency, usedRates),
    category_slug: t.category,
    description: t.description,
    counterparty: t.counterparty,
    quantity: t.quantity,
    channel,
    inbound_message_id: inboundId,
    ai_confidence: t.confidence,
  };
}
