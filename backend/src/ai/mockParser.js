// ═══════════════════════════════════════════════════════════════════════
// Intérprete de REGLAS (sin IA) para desarrollo y pruebas automáticas.
// Entiende frases simples tipo "gasté 20$ en insumos y cobré 50$ por pago móvil".
// No pretende reemplazar a la IA; sirve para probar el flujo completo gratis.
// Devuelve exactamente la misma forma que el parser de Claude.
// ═══════════════════════════════════════════════════════════════════════

// Ojo: \b de JS no reconoce letras acentuadas ("gasté" falla con \b), por eso usamos \p{L} con flag u.
const EXPENSE_VERBS = /(?<!\p{L})(gast[eéó]|pagu[eé]|pag[oó]|compr[eéó]|invert[ií]|solt[eé])(?!\p{L})/u;
const INCOME_VERBS = /(?<!\p{L})(cobr[eéó]|vend[ií]|me pagaron|me pag[oó]|me cay[oó]|me entr[oó]|ingres[oó])(?!\p{L})/u;

const CATEGORY_KEYWORDS = [
  ['insumos', /insumo|materia prima|ingrediente|harina|huevo|az[uú]car|tela|hilo/],
  ['empaques', /empaque|bolsa|caja|etiqueta/],
  ['delivery_transporte', /delivery|motorizado|gasolina|pasaje|taxi|transporte/],
  ['publicidad', /publicidad|pauta|promo|instagram/],
  ['servicios_basicos', /\bluz\b|internet|cantv|saldo|recarga/],
  ['mercancia', /mercanc[ií]a/],
  ['alquiler', /alquiler/],
];

function detectCurrency(seg) {
  if (/usdt|binance|tether/.test(seg)) return 'USDT';
  if (/\$|d[oó]lar|usd|verdes/.test(seg)) return 'USD';
  if (/\bbs\b|bs\.|bol[ií]var|bolos?|lucas/.test(seg)) return 'VES';
  return null;
}

function detectPayment(seg) {
  if (/pago ?m[oó]vil|\bpm\b/.test(seg)) return 'pago_movil';
  if (/punto/.test(seg)) return 'punto_de_venta';
  if (/zelle/.test(seg)) return 'zelle';
  if (/binance|usdt/.test(seg)) return 'binance_usdt';
  if (/transferencia/.test(seg)) return 'transferencia_bs';
  if (/efectivo|cash/.test(seg)) return /bol[ií]var|bs/.test(seg) ? 'efectivo_bs' : 'efectivo_usd';
  return 'desconocido';
}

const SETTLEMENT_BY_METHOD = {
  pago_movil: 'VES', punto_de_venta: 'VES', transferencia_bs: 'VES', efectivo_bs: 'VES',
  zelle: 'USD', efectivo_usd: 'USD', binance_usdt: 'USDT',
};

/** "1.500,50" → 1500.5 ; "20.50" → 20.5 ; "50" → 50 */
function parseNumber(raw) {
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)) return Number(raw.replace(/\./g, '').replace(',', '.'));
  return Number(raw.replace(',', '.'));
}

export function parseWithRules(text) {
  const lower = text.toLowerCase();
  const base = { pricing: null, summary_period: null, needs_clarification: false, clarification_question: null, friendly_note: null };

  if (/\b(resumen|c[oó]mo voy|balance)\b/.test(lower)) {
    const period = /semana/.test(lower) ? 'semana' : /mes/.test(lower) ? 'mes' : 'hoy';
    return { ...base, intent: 'consultar_resumen', transactions: [], summary_period: period };
  }
  if (/\b(tasa|a c[oó]mo est[aá] el d[oó]lar)\b/.test(lower)) {
    return { ...base, intent: 'consultar_tasa', transactions: [] };
  }
  const priceMatch = lower.match(/a cu[aá]nto vendo.*?(\d+(?:[.,]\d+)?)\s*(\$|d[oó]lares|bs)?/);
  if (priceMatch) {
    return {
      ...base, intent: 'calcular_precio', transactions: [],
      pricing: {
        product_name: null, replacement_cost: parseNumber(priceMatch[1]),
        cost_currency: priceMatch[2]?.startsWith('bs') ? 'VES' : 'USD',
        pack_units: null, margin_pct: null, fee_pct: null, fx_buffer_pct: null,
      },
    };
  }

  // Dividir en segmentos por " y " / comas antes de un verbo
  const segments = lower.split(/\s+y\s+|,\s*(?=\D)/).map((s) => s.trim()).filter(Boolean);
  const transactions = [];
  let lastType = null;

  for (const seg of segments) {
    // Quitamos "pago móvil" antes de buscar verbos: si no, "pago" parece "pagó" (egreso)
    const verbs = seg.replace(/pago ?m[oó]vil/g, '');
    const type = INCOME_VERBS.test(verbs) ? 'ingreso' : EXPENSE_VERBS.test(verbs) ? 'egreso' : lastType;
    const m = seg.match(/(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?)\s*(lucas)?/);
    if (!type || !m) continue;
    lastType = type;

    let amount = parseNumber(m[1]);
    if (m[2] === 'lucas') amount *= 1000;

    const payment = detectPayment(seg);
    // En "50$ en bolívares" el $ marca la denominación; lo que siga a "en bolívares" es la liquidación
    const denom = detectCurrency(seg.replace(/en bol[ií]vares|en bs/, '')) ?? SETTLEMENT_BY_METHOD[payment] ?? 'USD';
    const settlement = /en bol[ií]vares|en bs\b/.test(seg) ? 'VES' : SETTLEMENT_BY_METHOD[payment] ?? denom;

    const category = type === 'ingreso'
      ? 'ventas'
      : CATEGORY_KEYWORDS.find(([, re]) => re.test(seg))?.[0] ?? 'otros_gastos';

    transactions.push({
      type, amount, currency: denom, settlement_currency: settlement, payment_method: payment, category,
      description: seg.replace(/\s+/g, ' ').slice(0, 80),
      counterparty: null, quantity: null, unit_price: null,
      is_pending: /fi[eé]|fiado|debiendo/.test(seg), custom_rate: null, confidence: 0.7,
    });
  }

  if (transactions.length === 0) {
    return /^(hola|buenas|hey|ayuda)/.test(lower)
      ? { ...base, intent: 'ayuda', transactions: [] }
      : { ...base, intent: 'otro', transactions: [], needs_clarification: true,
          clarification_question: '¿Me lo repites con el monto y si fue gasto o venta? Ej: "Gasté 10$ en empaques"' };
  }
  return { ...base, intent: 'registrar_transacciones', transactions };
}
