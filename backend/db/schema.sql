-- ═══════════════════════════════════════════════════════════════════════
-- AURA SUITE · Esquema PostgreSQL (Fase 1 + tablas base para Fases 2 y 3)
-- Compatible con Supabase. Ejecuta: npm run db:migrate
--
-- Principios de diseño multimoneda:
--   1. NUNCA float para dinero → NUMERIC.
--   2. Cada transacción guarda su monto ORIGINAL + la tasa usada + los
--      equivalentes en USD y VES "congelados" a esa fecha. Si mañana la tasa
--      cambia, tu historial no se distorsiona.
--   3. El USD es la moneda "ancla" para reportes (el Bs se devalúa);
--      el VES se guarda para conciliar con el banco.
-- ═══════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ── Tipos ───────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE currency_code AS ENUM ('USD', 'VES', 'USDT', 'EUR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tx_type AS ENUM ('ingreso', 'egreso');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  -- 'pendiente' = fiado / por cobrar / por pagar
  CREATE TYPE tx_status AS ENUM ('confirmada', 'pendiente', 'anulada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method AS ENUM (
    'pago_movil', 'transferencia_bs', 'punto_de_venta', 'efectivo_bs',
    'efectivo_usd', 'zelle', 'binance_usdt', 'paypal', 'otro', 'desconocido'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE rate_source AS ENUM ('BCV', 'PARALELO', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE input_channel AS ENUM ('whatsapp_texto', 'whatsapp_audio', 'web', 'movil');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Usuarias ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_phone     TEXT UNIQUE NOT NULL,          -- formato E.164 sin '+': 584141234567
  display_name       TEXT,
  business_name      TEXT,
  email              TEXT UNIQUE,                   -- para login en la web (Fase 2)
  timezone           TEXT NOT NULL DEFAULT 'America/Caracas',
  report_currency    currency_code NOT NULL DEFAULT 'USD',
  default_margin_pct NUMERIC(5,2) NOT NULL DEFAULT 30.00,   -- margen sobre precio de venta
  fx_buffer_pct      NUMERIC(5,2) NOT NULL DEFAULT 0.00,    -- colchón cambiario para precios en Bs
  plan               TEXT NOT NULL DEFAULT 'gratis',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Tasas de cambio (histórico diario) ──────────────────────────────────
-- Una fila por (fuente, par, fecha valor). La tasa BCV se publica con
-- "fecha valor" (a veces para el día hábil siguiente): guardamos ambas fechas.
CREATE TABLE IF NOT EXISTS exchange_rates (
  id              BIGSERIAL PRIMARY KEY,
  source          rate_source   NOT NULL,
  base_currency   currency_code NOT NULL DEFAULT 'USD',
  quote_currency  currency_code NOT NULL DEFAULT 'VES',
  rate            NUMERIC(20,8) NOT NULL CHECK (rate > 0),  -- Bs por 1 unidad de base
  effective_date  DATE NOT NULL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider        TEXT,                                     -- 'dolarapi', 'bcv.org.ve', 'manual'
  UNIQUE (source, base_currency, quote_currency, effective_date)
);
CREATE INDEX IF NOT EXISTS idx_rates_lookup
  ON exchange_rates (source, base_currency, quote_currency, effective_date DESC);

-- ── Categorías (del sistema + personalizadas por usuaria) ───────────────
CREATE TABLE IF NOT EXISTS categories (
  id       SERIAL PRIMARY KEY,
  user_id  UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = categoría del sistema
  slug     TEXT NOT NULL,
  name     TEXT NOT NULL,
  type     tx_type NOT NULL,
  UNIQUE NULLS NOT DISTINCT (user_id, slug)   -- PG15+: evita duplicar categorías del sistema
);

-- ── Mensajes entrantes (auditoría + idempotencia) ───────────────────────
-- Meta reintenta webhooks: wa_message_id UNIQUE evita registrar 2 veces el mismo gasto.
CREATE TABLE IF NOT EXISTS inbound_messages (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id) ON DELETE CASCADE,
  wa_message_id  TEXT UNIQUE NOT NULL,
  channel        input_channel NOT NULL,
  raw_text       TEXT,
  transcription  TEXT,
  media_id       TEXT,
  ai_result      JSONB,                    -- salida estructurada de la IA (para depurar)
  status         TEXT NOT NULL DEFAULT 'recibido',  -- recibido | procesado | error
  error          TEXT,
  received_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Transacciones multimoneda ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type               tx_type NOT NULL,
  status             tx_status NOT NULL DEFAULT 'confirmada',
  -- Monto tal como lo dijo la usuaria
  amount             NUMERIC(20,4) NOT NULL CHECK (amount > 0),
  currency           currency_code NOT NULL,           -- moneda en que se EXPRESÓ ("50$")
  settlement_currency currency_code NOT NULL,          -- moneda en que ENTRÓ/SALIÓ el dinero (Bs por Pago Móvil)
  payment_method     payment_method NOT NULL DEFAULT 'desconocido',
  -- Tasa congelada al momento del registro
  exchange_rate_id   BIGINT REFERENCES exchange_rates(id),
  rate_used          NUMERIC(20,8) NOT NULL,           -- Bs por USD aplicada
  rate_source        rate_source NOT NULL DEFAULT 'BCV',
  amount_usd         NUMERIC(20,4) NOT NULL,           -- equivalente para reportes
  amount_ves         NUMERIC(20,2) NOT NULL,           -- equivalente para conciliación
  -- Clasificación
  category_id        INT REFERENCES categories(id),
  category_slug      TEXT NOT NULL,                    -- desnormalizado para consultas rápidas
  description        TEXT,
  counterparty       TEXT,                             -- clienta / proveedor
  product_id         UUID,                             -- FK a products (se agrega abajo)
  quantity           NUMERIC(14,3),
  -- Trazabilidad
  channel            input_channel NOT NULL,
  inbound_message_id UUID REFERENCES inbound_messages(id),
  ai_confidence      NUMERIC(3,2),
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ                       -- borrado lógico ("deshacer")
);
CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions (user_id, occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tx_user_cat  ON transactions (user_id, category_slug);

-- ── Catálogo / inventario (núcleo para Fase 2) ──────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  sku                TEXT,
  unit               TEXT NOT NULL DEFAULT 'unidad',
  -- Costo de REPOSICIÓN (lo que cuesta volver a comprarlo hoy), no el histórico
  replacement_cost   NUMERIC(20,4) NOT NULL DEFAULT 0,
  cost_currency      currency_code NOT NULL DEFAULT 'USD',
  margin_pct         NUMERIC(5,2),                     -- NULL = usa default de la usuaria
  stock_qty          NUMERIC(14,3) NOT NULL DEFAULT 0,
  min_stock_qty      NUMERIC(14,3) NOT NULL DEFAULT 0,
  active             BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

DO $$ BEGIN
  ALTER TABLE transactions
    ADD CONSTRAINT fk_tx_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Historial de cálculos de precio ("precio blindado") ─────────────────
CREATE TABLE IF NOT EXISTS price_quotes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id           UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name         TEXT,
  replacement_cost_usd NUMERIC(20,4) NOT NULL,
  margin_pct           NUMERIC(5,2) NOT NULL,
  fee_pct              NUMERIC(5,2) NOT NULL DEFAULT 0,   -- comisión punto / plataforma
  fx_buffer_pct        NUMERIC(5,2) NOT NULL DEFAULT 0,
  rate_used            NUMERIC(20,8) NOT NULL,
  price_usd            NUMERIC(20,2) NOT NULL,
  price_ves            NUMERIC(20,2) NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Metas de ahorro (Fase 3, tabla lista desde ya) ──────────────────────
CREATE TABLE IF NOT EXISTS savings_goals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  target_amount  NUMERIC(20,2) NOT NULL CHECK (target_amount > 0),
  currency       currency_code NOT NULL DEFAULT 'USD',
  saved_amount   NUMERIC(20,2) NOT NULL DEFAULT 0,
  target_date    DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Códigos de inicio de sesión por WhatsApp (OTP) ───────────────────────
CREATE TABLE IF NOT EXISTS login_codes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts   INT NOT NULL DEFAULT 0,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_codes_phone ON login_codes (phone, created_at DESC);

-- ── Seguridad (Supabase) ────────────────────────────────────────────────
-- Supabase publica automáticamente las tablas de "public" en su API REST.
-- Activar RLS SIN políticas = nadie puede leerlas por esa API (anon/authenticated).
-- El backend se conecta como "postgres", que no está sujeto a RLS, así que sigue funcionando.
-- En Fase 2 se agregan políticas tipo "cada usuaria ve solo lo suyo".
ALTER TABLE users            ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_rates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_quotes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_codes      ENABLE ROW LEVEL SECURITY;

-- ── Vista: resumen diario en USD (base para la web y el bot) ────────────
-- security_invoker: la vista respeta el RLS de quien consulta (si no, lo saltaría)
CREATE OR REPLACE VIEW v_daily_summary WITH (security_invoker = true) AS
SELECT
  user_id,
  (occurred_at AT TIME ZONE 'America/Caracas')::date AS day,
  SUM(CASE WHEN type = 'ingreso' THEN amount_usd ELSE 0 END) AS ingresos_usd,
  SUM(CASE WHEN type = 'egreso'  THEN amount_usd ELSE 0 END) AS egresos_usd,
  SUM(CASE WHEN type = 'ingreso' THEN amount_usd ELSE -amount_usd END) AS neto_usd,
  COUNT(*) AS n_transacciones
FROM transactions
WHERE deleted_at IS NULL AND status <> 'anulada'
GROUP BY user_id, day;

-- ── Categorías del sistema ──────────────────────────────────────────────
INSERT INTO categories (user_id, slug, name, type) VALUES
  (NULL, 'ventas',             'Ventas',                  'ingreso'),
  (NULL, 'servicios',          'Servicios prestados',     'ingreso'),
  (NULL, 'cobro_deuda',        'Cobro de fiado/deuda',    'ingreso'),
  (NULL, 'otros_ingresos',     'Otros ingresos',          'ingreso'),
  (NULL, 'insumos',            'Insumos / materia prima', 'egreso'),
  (NULL, 'mercancia',          'Mercancía para reventa',  'egreso'),
  (NULL, 'empaques',           'Empaques',                'egreso'),
  (NULL, 'delivery_transporte','Delivery / transporte',   'egreso'),
  (NULL, 'publicidad',         'Publicidad / redes',      'egreso'),
  (NULL, 'servicios_basicos',  'Servicios (luz, internet, teléfono)', 'egreso'),
  (NULL, 'alquiler',           'Alquiler',                'egreso'),
  (NULL, 'nomina',             'Pagos a personal',        'egreso'),
  (NULL, 'comisiones',         'Comisiones bancarias / punto', 'egreso'),
  (NULL, 'impuestos',          'Impuestos (IGTF, IVA, alcaldía)', 'egreso'),
  (NULL, 'gastos_personales',  'Gastos personales',       'egreso'),
  (NULL, 'otros_gastos',       'Otros gastos',            'egreso')
ON CONFLICT DO NOTHING;
