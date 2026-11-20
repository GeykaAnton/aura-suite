// API del panel web (modo una sola usuaria, SIN login de usuaria).
// Protegida por un token compartido (header x-dashboard-token) que solo conoce el
// servidor del frontend; el navegador nunca lo ve. Sin DASHBOARD_TOKEN no se registra.
// TODO multiusuaria: reemplazar por Supabase Auth / código por WhatsApp.
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { getTodayBcvRate } from '../services/bcvRate.js';
import { calcHealthScore } from '../services/healthScore.js';
import { verifySessionToken } from '../services/auth.js';
import { CURRENCIES, CATEGORIES, PAYMENT_METHODS } from '../ai/schema.js';
import { periodStart, todayInTz } from '../utils/dates.js';

const DAY = 24 * 3600e3;
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
// Fechas en hora de Caracas (UTC-4 fijo)
const startOf = (d) => new Date(`${d}T00:00:00-04:00`);
const endExclusive = (d) => new Date(startOf(d).getTime() + DAY);

const TxQuery = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
  type: z.enum(['ingreso', 'egreso']).optional(),
  status: z.enum(['confirmada', 'pendiente', 'anulada']).optional(),
  category: z.enum(CATEGORIES).optional(),
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const ProductBody = z.object({
  name: z.string().trim().min(1).max(120),
  sku: z.string().trim().max(60).nullable().optional(),
  unit: z.string().trim().min(1).max(30).default('unidad'),
  replacement_cost: z.number().min(0).default(0),
  cost_currency: z.enum(CURRENCIES).default('USD'),
  margin_pct: z.number().min(0).max(95).nullable().optional(),
  stock_qty: z.number().min(0).default(0),
  min_stock_qty: z.number().min(0).default(0),
});

const GoalBody = z.object({
  name: z.string().trim().min(1).max(120),
  target_amount: z.number().positive(),
  currency: z.enum(CURRENCIES).default('USD'),
  saved_amount: z.number().min(0).default(0),
  target_date: dateStr.nullable().optional(),
});

/** @param {import('fastify').FastifyInstance} app */
export default async function appRoutes(app, { repo }) {
  const expected = Buffer.from(config.dashboard.token);

  app.addHook('onRequest', async (req, reply) => {
    const got = Buffer.from(String(req.headers['x-dashboard-token'] ?? ''));
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
      return reply.code(401).send({ error: 'No autorizado' });
    }
  });

  // Usuaria de la sesión (si viene Bearer token) o usuaria única (fallback admin/tests)
  app.decorateRequest('dashUser', null);
  app.addHook('preHandler', async (req, reply) => {
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
      const payload = verifySessionToken(auth.slice(7));
      if (!payload) return reply.code(401).send({ error: 'Sesión vencida o inválida. Inicia sesión de nuevo.' });
      const user = await repo.findUserById(payload.sub);
      if (!user) return reply.code(401).send({ error: 'Usuaria no encontrada.' });
      req.dashUser = user;
      return;
    }
    const user = await repo.getPrimaryUser(config.dashboard.userPhone);
    if (!user) return reply.code(404).send({ error: 'Aún no hay usuarias: escribe primero al bot de WhatsApp' });
    req.dashUser = user;
  });

  app.get('/api/app/me', async (req) => {
    const u = req.dashUser;
    return {
      display_name: u.display_name, business_name: u.business_name, phone: u.whatsapp_phone,
      default_margin_pct: u.default_margin_pct, fx_buffer_pct: u.fx_buffer_pct,
      timezone: config.timezone, today: todayInTz(config.timezone),
    };
  });

  app.patch('/api/app/me', async (req, reply) => {
    const b = z.object({
      display_name: z.string().trim().max(80).nullable().optional(),
      business_name: z.string().trim().max(100).nullable().optional(),
      default_margin_pct: z.number().min(0).max(95).optional(),
      fx_buffer_pct: z.number().min(0).max(100).optional(),
    }).safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: b.error.flatten() });
    const u = await repo.updateUserProfile(req.dashUser.id, b.data);
    return {
      display_name: u.display_name, business_name: u.business_name, phone: u.whatsapp_phone,
      default_margin_pct: u.default_margin_pct, fx_buffer_pct: u.fx_buffer_pct,
    };
  });

  app.get('/api/app/summary', async (req, reply) => {
    const p = z.enum(['hoy', 'semana', 'mes']).default('hoy').safeParse(req.query.period);
    if (!p.success) return reply.code(400).send({ error: 'period inválido' });
    const since = periodStart(p.data);
    const [summary, rate, products] = await Promise.all([
      repo.summarize(req.dashUser.id, since),
      getTodayBcvRate(repo),
      repo.listProducts(req.dashUser.id),
    ]);
    return {
      period: p.data,
      since,
      summary,
      health: calcHealthScore(summary, products),
      rate: { rate: rate.rate, effective_date: rate.effectiveDate, stale: rate.stale },
    };
  });

  app.get('/api/app/series', async (req) => {
    const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
    const since = new Date(periodStart('hoy').getTime() - (days - 1) * DAY);
    const rows = await repo.dailySeries(req.dashUser.id, since);
    // Rellena los días sin movimiento para que el gráfico no tenga huecos
    const byDay = new Map(rows.map((r) => [r.day, r]));
    const out = [];
    for (let i = 0; i < days; i++) {
      // `since` es la medianoche de Caracas en UTC (04:00Z): restar 4 h da la fecha local
      const local = new Date(since.getTime() + i * DAY - 4 * 3600e3).toISOString().slice(0, 10);
      out.push(byDay.get(local) ?? { day: local, ingresos_usd: 0, egresos_usd: 0 });
    }
    return out;
  });

  app.get('/api/app/transactions', async (req, reply) => {
    const q = TxQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.flatten() });
    const { from, to, ...rest } = q.data;
    return repo.listTransactions(req.dashUser.id, {
      ...rest, from: from ? startOf(from) : undefined, to: to ? endExclusive(to) : undefined,
    });
  });

  app.delete('/api/app/transactions/:id', async (req, reply) => {
    if (!z.string().uuid().safeParse(req.params.id).success) return reply.code(400).send({ error: 'id inválido' });
    const ok = await repo.softDeleteTransaction(req.dashUser.id, req.params.id);
    return ok ? reply.code(204).send() : reply.code(404).send({ error: 'No encontrada' });
  });

  app.get('/api/app/products', async (req) => repo.listProducts(req.dashUser.id));

  app.post('/api/app/products', async (req, reply) => {
    const b = ProductBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: b.error.flatten() });
    const row = await repo.createProduct(req.dashUser.id, b.data);
    return row.conflict ? reply.code(409).send({ error: 'Ya existe un producto con ese nombre' }) : reply.code(201).send(row);
  });

  app.patch('/api/app/products/:id', async (req, reply) => {
    if (!z.string().uuid().safeParse(req.params.id).success) return reply.code(400).send({ error: 'id inválido' });
    const b = ProductBody.partial().safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: b.error.flatten() });
    const row = await repo.updateProduct(req.dashUser.id, req.params.id, b.data);
    if (!row) return reply.code(404).send({ error: 'No encontrado' });
    return row.conflict ? reply.code(409).send({ error: 'Ya existe un producto con ese nombre' }) : row;
  });

  app.delete('/api/app/products/:id', async (req, reply) => {
    if (!z.string().uuid().safeParse(req.params.id).success) return reply.code(400).send({ error: 'id inválido' });
    const ok = await repo.deleteProduct(req.dashUser.id, req.params.id);
    return ok ? reply.code(204).send() : reply.code(404).send({ error: 'No encontrado' });
  });

  app.get('/api/app/goals', async (req) => repo.listGoals(req.dashUser.id));

  app.post('/api/app/goals', async (req, reply) => {
    const b = GoalBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: b.error.flatten() });
    return reply.code(201).send(await repo.createGoal(req.dashUser.id, b.data));
  });

  app.patch('/api/app/goals/:id', async (req, reply) => {
    if (!z.string().uuid().safeParse(req.params.id).success) return reply.code(400).send({ error: 'id inválido' });
    const b = GoalBody.partial().safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: b.error.flatten() });
    const row = await repo.updateGoal(req.dashUser.id, req.params.id, b.data);
    return row ? row : reply.code(404).send({ error: 'No encontrada' });
  });

  app.delete('/api/app/goals/:id', async (req, reply) => {
    if (!z.string().uuid().safeParse(req.params.id).success) return reply.code(400).send({ error: 'id inválido' });
    const ok = await repo.deleteGoal(req.dashUser.id, req.params.id);
    return ok ? reply.code(204).send() : reply.code(404).send({ error: 'No encontrada' });
  });

  // Catálogos para los filtros del frontend
  app.get('/api/app/meta', async () => ({ currencies: CURRENCIES, categories: CATEGORIES, payment_methods: PAYMENT_METHODS }));
}
