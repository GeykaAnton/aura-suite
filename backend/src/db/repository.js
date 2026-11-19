// ═══════════════════════════════════════════════════════════════════════
// Capa de datos. Dos implementaciones con la MISMA interfaz:
//   - MemoryRepository: para desarrollo/pruebas sin base de datos.
//   - PgRepository:     PostgreSQL / Supabase.
// El resto del código nunca escribe SQL: solo llama a estos métodos.
// ═══════════════════════════════════════════════════════════════════════
import { randomUUID } from 'node:crypto';

/**
 * @typedef {object} Repository
 * @property {(phone: string, name?: string|null) => Promise<{id: string, whatsapp_phone: string, display_name: string|null, default_margin_pct: number, fx_buffer_pct: number}>} findOrCreateUser
 * @property {(m: object) => Promise<{id: string}|null>} registerInboundMessage  null si ya existía (duplicado)
 * @property {(id: string, patch: object) => Promise<void>} updateInboundMessage
 * @property {(source: string, date: string) => Promise<object|null>} getRate
 * @property {(source: string) => Promise<object|null>} getLatestRate
 * @property {(r: object) => Promise<object>} saveRate
 * @property {(txs: object[]) => Promise<object[]>} insertTransactions
 * @property {(userId: string, since: Date) => Promise<object>} summarize
 * @property {(q: object) => Promise<void>} savePriceQuote
 */

// ── En memoria ──────────────────────────────────────────────────────────
export class MemoryRepository {
  users = new Map();
  messages = new Map(); // wa_message_id → row
  rates = [];
  transactions = [];
  quotes = [];

  async findOrCreateUser(phone, name = null) {
    let u = this.users.get(phone);
    if (!u) {
      u = { id: randomUUID(), whatsapp_phone: phone, display_name: name, default_margin_pct: 30, fx_buffer_pct: 0 };
      this.users.set(phone, u);
    }
    return u;
  }

  async registerInboundMessage(m) {
    if (this.messages.has(m.waMessageId)) return null;
    const row = { id: randomUUID(), ...m, status: 'recibido' };
    this.messages.set(m.waMessageId, row);
    return row;
  }

  async updateInboundMessage(id, patch) {
    for (const row of this.messages.values()) if (row.id === id) Object.assign(row, patch);
  }

  async getRate(source, date) {
    return this.rates.find((r) => r.source === source && r.effectiveDate === date) ?? null;
  }

  async getLatestRate(source) {
    return [...this.rates].filter((r) => r.source === source).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0] ?? null;
  }

  async saveRate({ source, rate, effectiveDate, provider }) {
    const existing = await this.getRate(source, effectiveDate);
    if (existing) return existing;
    const row = { id: this.rates.length + 1, source, rate, effectiveDate, provider };
    this.rates.push(row);
    return row;
  }

  async insertTransactions(txs) {
    const rows = txs.map((t) => ({ id: randomUUID(), occurred_at: new Date().toISOString(), ...t }));
    this.transactions.push(...rows);
    return rows;
  }

  async summarize(userId, since) {
    const rows = this.transactions.filter(
      (t) => t.user_id === userId && !t.deleted_at && new Date(t.occurred_at) >= since && t.status !== 'anulada',
    );
    return aggregate(rows);
  }

  async savePriceQuote(q) {
    this.quotes.push({ id: randomUUID(), ...q });
  }

  // ── Web app ──
  products = [];

  async getPrimaryUser(phone = null) {
    const all = [...this.users.values()].filter((u) => !phone || u.whatsapp_phone === phone);
    return all[0] ?? null;
  }

  async listTransactions(userId, f = {}) {
    let rows = this.transactions.filter((t) => t.user_id === userId && !t.deleted_at);
    if (f.from) rows = rows.filter((t) => new Date(t.occurred_at) >= f.from);
    if (f.to) rows = rows.filter((t) => new Date(t.occurred_at) < f.to);
    if (f.type) rows = rows.filter((t) => t.type === f.type);
    if (f.status) rows = rows.filter((t) => t.status === f.status);
    if (f.category) rows = rows.filter((t) => t.category_slug === f.category);
    if (f.q) rows = rows.filter((t) => `${t.description ?? ''} ${t.counterparty ?? ''}`.toLowerCase().includes(f.q.toLowerCase()));
    rows.sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
    const limit = f.limit ?? 50;
    const offset = f.offset ?? 0;
    return { total: rows.length, rows: rows.slice(offset, offset + limit) };
  }

  async softDeleteTransaction(userId, id) {
    const t = this.transactions.find((x) => x.id === id && x.user_id === userId && !x.deleted_at);
    if (!t) return false;
    t.deleted_at = new Date().toISOString();
    return true;
  }

  async dailySeries(userId, since) {
    const by = new Map();
    for (const t of this.transactions) {
      if (t.user_id !== userId || t.deleted_at || t.status !== 'confirmada' || new Date(t.occurred_at) < since) continue;
      const day = new Date(new Date(t.occurred_at).getTime() - 4 * 3600e3).toISOString().slice(0, 10);
      const d = by.get(day) ?? { day, ingresos_usd: 0, egresos_usd: 0 };
      d[t.type === 'ingreso' ? 'ingresos_usd' : 'egresos_usd'] += Number(t.amount_usd);
      by.set(day, d);
    }
    return [...by.values()].sort((a, b) => a.day.localeCompare(b.day));
  }

  async listProducts(userId) {
    return this.products.filter((p) => p.user_id === userId && p.active).sort((a, b) => a.name.localeCompare(b.name));
  }

  async createProduct(userId, p) {
    if (this.products.some((x) => x.user_id === userId && x.active && x.name === p.name)) return { conflict: true };
    const row = { id: randomUUID(), user_id: userId, active: true, ...p };
    this.products.push(row);
    return row;
  }

  async updateProduct(userId, id, patch) {
    const p = this.products.find((x) => x.id === id && x.user_id === userId && x.active);
    if (!p) return null;
    Object.assign(p, patch);
    return p;
  }

  async deleteProduct(userId, id) {
    const p = this.products.find((x) => x.id === id && x.user_id === userId && x.active);
    if (!p) return false;
    p.active = false;
    return true;
  }
}

function aggregate(rows) {
  const out = { ingresos_usd: 0, egresos_usd: 0, neto_usd: 0, pendiente_por_cobrar_usd: 0, count: rows.length, by_category: {}, income_by_category: {}, expense_by_category: {} };
  for (const t of rows) {
    const usd = Number(t.amount_usd);
    if (t.status === 'pendiente') {
      if (t.type === 'ingreso') out.pendiente_por_cobrar_usd += usd;
      continue; // lo fiado no es caja todavía
    }
    if (t.type === 'ingreso') out.ingresos_usd += usd;
    else out.egresos_usd += usd;
    const bucket = t.type === 'ingreso' ? out.income_by_category : out.expense_by_category;
    bucket[t.category_slug] = Math.round(((bucket[t.category_slug] ?? 0) + usd) * 100) / 100;
    out.by_category[t.category_slug] = (out.by_category[t.category_slug] ?? 0) + (t.type === 'ingreso' ? usd : -usd);
  }
  out.neto_usd = out.ingresos_usd - out.egresos_usd;
  for (const k of ['ingresos_usd', 'egresos_usd', 'neto_usd', 'pendiente_por_cobrar_usd']) out[k] = Math.round(out[k] * 100) / 100;
  return out;
}

// ── PostgreSQL ──────────────────────────────────────────────────────────
export class PgRepository {
  /** @param {import('pg').Pool} pool */
  constructor(pool) {
    this.pool = pool;
  }

  async findOrCreateUser(phone, name = null) {
    const { rows } = await this.pool.query(
      `INSERT INTO users (whatsapp_phone, display_name) VALUES ($1, $2)
       ON CONFLICT (whatsapp_phone) DO UPDATE SET display_name = COALESCE(users.display_name, EXCLUDED.display_name)
       RETURNING id, whatsapp_phone, display_name, default_margin_pct::float, fx_buffer_pct::float`,
      [phone, name],
    );
    return rows[0];
  }

  async registerInboundMessage({ waMessageId, userId, channel, rawText, mediaId }) {
    const { rows } = await this.pool.query(
      `INSERT INTO inbound_messages (wa_message_id, user_id, channel, raw_text, media_id)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (wa_message_id) DO NOTHING RETURNING id`,
      [waMessageId, userId, channel, rawText ?? null, mediaId ?? null],
    );
    return rows[0] ?? null;
  }

  async updateInboundMessage(id, { transcription, aiResult, status, error }) {
    await this.pool.query(
      `UPDATE inbound_messages SET
         transcription = COALESCE($2, transcription),
         ai_result     = COALESCE($3, ai_result),
         status        = COALESCE($4, status),
         error         = COALESCE($5, error)
       WHERE id = $1`,
      [id, transcription ?? null, aiResult ? JSON.stringify(aiResult) : null, status ?? null, error ?? null],
    );
  }

  #mapRate = (r) => r && { id: Number(r.id), source: r.source, rate: Number(r.rate), effectiveDate: r.effective_date, provider: r.provider };

  async getRate(source, date) {
    const { rows } = await this.pool.query(
      `SELECT id, source, rate, to_char(effective_date, 'YYYY-MM-DD') AS effective_date, provider
       FROM exchange_rates WHERE source = $1 AND base_currency = 'USD' AND quote_currency = 'VES' AND effective_date = $2`,
      [source, date],
    );
    return this.#mapRate(rows[0]) ?? null;
  }

  async getLatestRate(source) {
    const { rows } = await this.pool.query(
      `SELECT id, source, rate, to_char(effective_date, 'YYYY-MM-DD') AS effective_date, provider
       FROM exchange_rates WHERE source = $1 AND base_currency = 'USD' AND quote_currency = 'VES'
       ORDER BY effective_date DESC LIMIT 1`,
      [source],
    );
    return this.#mapRate(rows[0]) ?? null;
  }

  async saveRate({ source, rate, effectiveDate, provider }) {
    const { rows } = await this.pool.query(
      `INSERT INTO exchange_rates (source, rate, effective_date, provider) VALUES ($1, $2, $3, $4)
       ON CONFLICT (source, base_currency, quote_currency, effective_date) DO UPDATE SET fetched_at = now()
       RETURNING id, source, rate, to_char(effective_date, 'YYYY-MM-DD') AS effective_date, provider`,
      [source, rate, effectiveDate, provider],
    );
    return this.#mapRate(rows[0]);
  }

  async insertTransactions(txs) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const out = [];
      for (const t of txs) {
        const { rows } = await client.query(
          `INSERT INTO transactions
             (user_id, type, status, amount, currency, payment_method, exchange_rate_id, rate_used, rate_source,
              amount_usd, amount_ves, category_id, category_slug, description, counterparty, quantity,
              channel, inbound_message_id, ai_confidence, settlement_currency)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
                   (SELECT id FROM categories WHERE slug = $12 AND (user_id IS NULL OR user_id = $1) ORDER BY user_id NULLS LAST LIMIT 1),
                   $12,$13,$14,$15,$16,$17,$18,$19)
           RETURNING id, occurred_at`,
          [t.user_id, t.type, t.status, t.amount, t.currency, t.payment_method, t.exchange_rate_id ?? null, t.rate_used,
           t.rate_source, t.amount_usd, t.amount_ves, t.category_slug, t.description, t.counterparty, t.quantity ?? null,
           t.channel, t.inbound_message_id ?? null, t.ai_confidence ?? null, t.settlement_currency],
        );
        out.push({ ...t, ...rows[0] });
      }
      await client.query('COMMIT');
      return out;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async summarize(userId, since) {
    const { rows } = await this.pool.query(
      `SELECT type, status, category_slug, amount_usd::float AS amount_usd
       FROM transactions WHERE user_id = $1 AND occurred_at >= $2 AND deleted_at IS NULL AND status <> 'anulada'`,
      [userId, since],
    );
    return aggregate(rows);
  }

  async savePriceQuote(q) {
    await this.pool.query(
      `INSERT INTO price_quotes (user_id, product_name, replacement_cost_usd, margin_pct, fee_pct, fx_buffer_pct, rate_used, price_usd, price_ves)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [q.user_id, q.product_name, q.cost_usd, q.margin_pct, q.fee_pct, q.fx_buffer_pct, q.rate_used, q.price_usd, q.price_ves],
    );
  }

  // ── Web app ──
  async getPrimaryUser(phone = null) {
    const { rows } = await this.pool.query(
      `SELECT u.id, u.whatsapp_phone, u.display_name, u.business_name, u.default_margin_pct::float, u.fx_buffer_pct::float
       FROM users u WHERE ($1::text IS NULL OR u.whatsapp_phone = $1)
       ORDER BY (SELECT max(t.occurred_at) FROM transactions t WHERE t.user_id = u.id) DESC NULLS LAST, u.created_at
       LIMIT 1`,
      [phone],
    );
    return rows[0] ?? null;
  }

  async listTransactions(userId, f = {}) {
    const where = ['user_id = $1', 'deleted_at IS NULL'];
    const params = [userId];
    const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
    if (f.from) add('occurred_at >= ?', f.from);
    if (f.to) add('occurred_at < ?', f.to);
    if (f.type) add('type = ?', f.type);
    if (f.status) add('status = ?', f.status);
    if (f.category) add('category_slug = ?', f.category);
    if (f.q) add("(coalesce(description,'') || ' ' || coalesce(counterparty,'')) ILIKE ?", `%${f.q}%`);
    params.push(f.limit ?? 50, f.offset ?? 0);
    const { rows } = await this.pool.query(
      `SELECT id, type, status, amount::float, currency, settlement_currency, payment_method, rate_used::float,
              amount_usd::float, amount_ves::float, category_slug, description, counterparty, channel, occurred_at,
              ai_confidence::float, count(*) OVER()::int AS total
       FROM transactions WHERE ${where.join(' AND ')}
       ORDER BY occurred_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    return { total: rows[0]?.total ?? 0, rows: rows.map(({ total, ...r }) => r) };
  }

  async softDeleteTransaction(userId, id) {
    const { rowCount } = await this.pool.query(
      'UPDATE transactions SET deleted_at = now() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [id, userId],
    );
    return rowCount > 0;
  }

  async dailySeries(userId, since) {
    const { rows } = await this.pool.query(
      `SELECT (occurred_at AT TIME ZONE 'America/Caracas')::date::text AS day,
              coalesce(sum(amount_usd) FILTER (WHERE type = 'ingreso'), 0)::float AS ingresos_usd,
              coalesce(sum(amount_usd) FILTER (WHERE type = 'egreso'), 0)::float AS egresos_usd
       FROM transactions
       WHERE user_id = $1 AND occurred_at >= $2 AND deleted_at IS NULL AND status = 'confirmada'
       GROUP BY 1 ORDER BY 1`,
      [userId, since],
    );
    return rows;
  }

  static PRODUCT_COLS = `id, name, sku, unit, replacement_cost::float, cost_currency, margin_pct::float,
                         stock_qty::float, min_stock_qty::float, active`;

  async listProducts(userId) {
    const { rows } = await this.pool.query(
      `SELECT ${PgRepository.PRODUCT_COLS} FROM products WHERE user_id = $1 AND active ORDER BY name`,
      [userId],
    );
    return rows;
  }

  async createProduct(userId, p) {
    try {
      const { rows } = await this.pool.query(
        `INSERT INTO products (user_id, name, sku, unit, replacement_cost, cost_currency, margin_pct, stock_qty, min_stock_qty)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${PgRepository.PRODUCT_COLS}`,
        [userId, p.name, p.sku ?? null, p.unit, p.replacement_cost, p.cost_currency, p.margin_pct ?? null, p.stock_qty, p.min_stock_qty],
      );
      return rows[0];
    } catch (err) {
      if (err.code === '23505') return { conflict: true };
      throw err;
    }
  }

  async updateProduct(userId, id, patch) {
    const allowed = ['name', 'sku', 'unit', 'replacement_cost', 'cost_currency', 'margin_pct', 'stock_qty', 'min_stock_qty'];
    const keys = Object.keys(patch).filter((k) => allowed.includes(k));
    if (!keys.length) return (await this.listProducts(userId)).find((p) => p.id === id) ?? null;
    const sets = keys.map((k, i) => `${k} = $${i + 3}`);
    try {
      const { rows } = await this.pool.query(
        `UPDATE products SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 AND user_id = $2 AND active
         RETURNING ${PgRepository.PRODUCT_COLS}`,
        [id, userId, ...keys.map((k) => patch[k])],
      );
      return rows[0] ?? null;
    } catch (err) {
      if (err.code === '23505') return { conflict: true };
      throw err;
    }
  }

  async deleteProduct(userId, id) {
    const { rowCount } = await this.pool.query(
      'UPDATE products SET active = false, updated_at = now() WHERE id = $1 AND user_id = $2 AND active',
      [id, userId],
    );
    return rowCount > 0;
  }
}

/** Fábrica: elige implementación según DATABASE_URL. */
export async function createRepository(databaseUrl, { caCert = null } = {}) {
  if (!databaseUrl) return new MemoryRepository();
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 5,
    // Con el CA de Supabase la conexión TLS se verifica de verdad (nunca uses rejectUnauthorized:false)
    ...(caCert ? { ssl: { ca: caCert } } : {}),
  });
  pool.on('error', (err) => console.error('Error inesperado en el pool de PostgreSQL', err));
  await pool.query('SELECT 1'); // falla al arrancar si la conexión está mal, no en el primer mensaje
  const repo = new PgRepository(pool);
  repo.close = () => pool.end();
  return repo;
}
