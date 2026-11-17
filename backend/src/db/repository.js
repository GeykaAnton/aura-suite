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
      (t) => t.user_id === userId && new Date(t.occurred_at) >= since && t.status !== 'anulada',
    );
    return aggregate(rows);
  }

  async savePriceQuote(q) {
    this.quotes.push({ id: randomUUID(), ...q });
  }
}

function aggregate(rows) {
  const out = { ingresos_usd: 0, egresos_usd: 0, neto_usd: 0, pendiente_por_cobrar_usd: 0, count: rows.length, by_category: {} };
  for (const t of rows) {
    const usd = Number(t.amount_usd);
    if (t.status === 'pendiente') {
      if (t.type === 'ingreso') out.pendiente_por_cobrar_usd += usd;
      continue; // lo fiado no es caja todavía
    }
    if (t.type === 'ingreso') out.ingresos_usd += usd;
    else out.egresos_usd += usd;
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
