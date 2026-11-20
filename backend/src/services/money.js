// ═══════════════════════════════════════════════════════════════════════
// Matemática de dinero: conversiones y "precio blindado".
//
// Regla de oro: la IA EXTRAE datos, este módulo CALCULA. Los modelos de
// lenguaje no son calculadoras confiables; aquí usamos Decimal (sin errores
// de coma flotante: 0.1 + 0.2 = 0.3 exacto).
// ═══════════════════════════════════════════════════════════════════════
import Decimal from 'decimal.js';

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export const D = (v) => new Decimal(v ?? 0);

/**
 * Tabla de tasas del día expresada como "Bs por 1 unidad de moneda".
 * @typedef {{ USD: Decimal, USDT: Decimal, EUR?: Decimal, VES: Decimal }} RateTable
 */

/**
 * Construye la tabla de tasas a partir de la tasa BCV (Bs/USD).
 * @param {number|string|Decimal} bcvUsdRate  Bs por 1 USD
 * @param {{ usdtUsdRate?: number, eurRate?: number|null }} [opts]
 * @returns {RateTable}
 */
export function buildRateTable(bcvUsdRate, { usdtUsdRate = 1, eurRate = null } = {}) {
  const usd = D(bcvUsdRate);
  if (usd.lte(0)) throw new Error('La tasa BCV debe ser mayor que 0');
  const table = { VES: D(1), USD: usd, USDT: usd.mul(usdtUsdRate) };
  if (eurRate) table.EUR = D(eurRate);
  return table;
}

/**
 * Convierte un monto entre monedas pasando por bolívares.
 * @returns {Decimal}
 */
export function convert(amount, from, to, rates) {
  if (from === to) return D(amount);
  if (!rates[from] || !rates[to]) throw new Error(`No hay tasa disponible para ${from}→${to}`);
  return D(amount).mul(rates[from]).div(rates[to]);
}

/**
 * Enriquecer un monto con sus equivalentes en USD y VES (lo que se guarda en BD).
 */
export function withEquivalents(amount, currency, rates) {
  return {
    amount_usd: convert(amount, currency, 'USD', rates).toDecimalPlaces(4).toNumber(),
    amount_ves: convert(amount, currency, 'VES', rates).toDecimalPlaces(2).toNumber(),
  };
}

/**
 * PRECIO BLINDADO CON MARGEN DE REPOSICIÓN
 * ----------------------------------------
 * 1. Costo de reposición: lo que te cuesta HOY volver a comprar el producto
 *    (no lo que pagaste hace un mes). Se normaliza a USD.
 * 2. Margen SOBRE PRECIO (no "markup"):  precio = costo / (1 - margen)
 *    Ej: costo $10, margen 30% → $14.29 (ganas $4.29 = 30% del precio).
 *    El error típico es costo × 1.30 = $13 → en realidad solo ganas 23%.
 * 3. Comisión de cobro (punto de venta, plataforma): precio / (1 - comisión)
 *    para que la comisión no se coma tu margen.
 * 4. Precio en Bs = precio USD × tasa BCV × (1 + colchón cambiario).
 *    El colchón protege si cobras días después o la tasa sube antes de reponer.
 * 5. Redondeo SIEMPRE hacia arriba (protege, nunca pierde).
 *
 * @param {object} p
 * @param {number} p.replacementCost   Costo de reposición por unidad
 * @param {'USD'|'VES'|'USDT'|'EUR'} p.costCurrency
 * @param {number} p.marginPct         Margen deseado sobre el precio (0–95)
 * @param {number} [p.feePct=0]        Comisión del medio de cobro (%)
 * @param {number} [p.fxBufferPct=0]   Colchón cambiario para el precio en Bs (%)
 * @param {number} [p.roundVesTo=1]    Redondear el precio en Bs al múltiplo superior (1, 5, 10…)
 * @param {RateTable} rates
 */
export function calcShieldedPrice(
  { replacementCost, costCurrency = 'USD', laborUsd = 0, marginPct, feePct = 0, fxBufferPct = 0, roundVesTo = 1 },
  rates,
) {
  const margin = D(marginPct).div(100);
  const fee = D(feePct).div(100);
  const buffer = D(fxBufferPct).div(100);
  const labor = D(laborUsd || 0);

  if (D(replacementCost).lte(0)) throw new Error('El costo de reposición debe ser mayor que 0');
  if (labor.lt(0)) throw new Error('La mano de obra no puede ser negativa');
  if (margin.lt(0) || margin.gte(0.95)) throw new Error('El margen debe estar entre 0% y 95%');
  if (fee.lt(0) || fee.gte(0.5)) throw new Error('La comisión debe estar entre 0% y 50%');

  const costUsd = convert(replacementCost, costCurrency, 'USD', rates);
  const baseUsd = costUsd.plus(labor);
  const priceBeforeFee = baseUsd.div(D(1).minus(margin));
  const priceUsd = priceBeforeFee.div(D(1).minus(fee)).toDecimalPlaces(2, Decimal.ROUND_UP);

  const rawVes = priceUsd.mul(rates.USD).mul(D(1).plus(buffer));
  const step = D(roundVesTo || 1);
  const priceVes = rawVes.div(step).toDecimalPlaces(0, Decimal.ROUND_UP).mul(step);

  const profitUsd = priceUsd.mul(D(1).minus(fee)).minus(baseUsd);

  return {
    cost_usd: costUsd.toDecimalPlaces(2).toNumber(),
    labor_usd: labor.toDecimalPlaces(2).toNumber(),
    margin_pct: Number(marginPct),
    fee_pct: Number(feePct),
    fx_buffer_pct: Number(fxBufferPct),
    rate_used: rates.USD.toNumber(),
    price_usd: priceUsd.toNumber(),
    price_ves: priceVes.toNumber(),
    profit_usd: profitUsd.toDecimalPlaces(2).toNumber(),
    // Margen real luego de redondeos y comisión (transparencia para la usuaria)
    effective_margin_pct: profitUsd.div(priceUsd).mul(100).toDecimalPlaces(1).toNumber(),
  };
}

// ── Formato venezolano: 1.234,56 ────────────────────────────────────────
const fmtVes = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtUsd = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatMoney = (amount, currency) => {
  const n = Number(amount);
  switch (currency) {
    case 'VES': return `Bs. ${fmtVes.format(n)}`;
    case 'USDT': return `${fmtUsd.format(n)} USDT`;
    case 'EUR': return `€${fmtUsd.format(n)}`;
    default: return `$${fmtUsd.format(n)}`;
  }
};
