// API REST mínima que reutilizarán la Web App (Fase 2) y la App Móvil (Fase 3).
// TODO Fase 2: proteger con autenticación (Supabase Auth / JWT).
import { z } from 'zod';
import { config } from '../config.js';
import { getTodayBcvRate } from '../services/bcvRate.js';
import { buildRateTable, calcShieldedPrice } from '../services/money.js';
import { CURRENCIES } from '../ai/schema.js';

const PriceBody = z.object({
  replacement_cost: z.number().positive(),
  cost_currency: z.enum(CURRENCIES).default('USD'),
  pack_units: z.number().positive().default(1),
  margin_pct: z.number().min(0).max(95).default(30),
  fee_pct: z.number().min(0).max(50).default(0),
  fx_buffer_pct: z.number().min(0).max(100).default(0),
  round_ves_to: z.number().positive().default(1),
});

/** @param {import('fastify').FastifyInstance} app */
export default async function apiRoutes(app, { repo }) {
  app.get('/health', async () => ({ ok: true, llm: config.llm.mode, transcription: config.transcription.mode }));

  app.get('/api/rates/bcv', async () => {
    const r = await getTodayBcvRate(repo);
    return { source: 'BCV', rate: r.rate, effective_date: r.effectiveDate, provider: r.provider, stale: r.stale };
  });

  // Calculadora de precio blindado (sin IA): la misma lógica que usa el bot
  app.post('/api/pricing/calculate', async (req, reply) => {
    const parsed = PriceBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const b = parsed.data;
    const r = await getTodayBcvRate(repo);
    return calcShieldedPrice(
      {
        replacementCost: b.replacement_cost / b.pack_units,
        costCurrency: b.cost_currency,
        marginPct: b.margin_pct,
        feePct: b.fee_pct,
        fxBufferPct: b.fx_buffer_pct,
        roundVesTo: b.round_ves_to,
      },
      buildRateTable(r.rate, { usdtUsdRate: config.rates.usdtUsdRate }),
    );
  });
}
