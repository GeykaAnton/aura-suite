// Redacta las respuestas de WhatsApp a partir de datos YA CALCULADOS.
// WhatsApp soporta *negritas*, _cursivas_ y emojis. Mensajes cortos: se leen en el celular.
import { formatMoney } from './money.js';

const CATEGORY_LABELS = {
  ventas: 'Ventas', servicios: 'Servicios', cobro_deuda: 'Cobro de fiado', otros_ingresos: 'Otros ingresos',
  insumos: 'Insumos', mercancia: 'Mercancía', empaques: 'Empaques', delivery_transporte: 'Delivery/transporte',
  publicidad: 'Publicidad', servicios_basicos: 'Servicios básicos', alquiler: 'Alquiler', nomina: 'Personal',
  comisiones: 'Comisiones', impuestos: 'Impuestos', gastos_personales: 'Gastos personales', otros_gastos: 'Otros gastos',
};
const METHOD_LABELS = {
  pago_movil: 'Pago Móvil', transferencia_bs: 'transferencia', punto_de_venta: 'punto', efectivo_bs: 'efectivo Bs',
  efectivo_usd: 'efectivo $', zelle: 'Zelle', binance_usdt: 'Binance', paypal: 'PayPal', otro: 'otro', desconocido: null,
};

const rateLine = (rate) =>
  `Tasa BCV: ${formatMoney(rate.rate, 'VES')}${rate.stale ? ` _(del ${rate.effectiveDate}, no pude actualizarla)_` : ''}`;

export function formatTransactionsReply(txs, rate, note) {
  const lines = ['✅ *¡Anotado!*'];
  let net = 0;
  for (const t of txs) {
    const icon = t.type === 'ingreso' ? '🟢' : '🔴';
    const method = METHOD_LABELS[t.payment_method];
    const original = formatMoney(t.amount, t.currency);
    // Muestra el equivalente en la "otra" moneda para que concilie con su banco
    const equiv = t.currency === 'VES' ? formatMoney(t.amount_usd, 'USD') : formatMoney(t.amount_ves, 'VES');
    const pending = t.status === 'pendiente' ? ' ⏳ _(por cobrar/pagar)_' : '';
    lines.push(
      `${icon} ${t.type === 'ingreso' ? 'Ingreso' : 'Gasto'}: *${original}* (${equiv})` +
        `${method ? ` vía ${method}` : ''} · ${CATEGORY_LABELS[t.category_slug] ?? t.category_slug}${pending}`,
    );
    if (t.status !== 'pendiente') net += t.type === 'ingreso' ? t.amount_usd : -t.amount_usd;
  }
  if (txs.length > 1) lines.push(`\nBalance de este mensaje: *${net >= 0 ? '+' : '−'}${formatMoney(Math.abs(net), 'USD')}*`);
  lines.push(rateLine(rate));
  if (txs.some((t) => t.ai_confidence < 0.6)) lines.push('_Si algo quedó mal, escríbeme "corregir" y lo arreglamos._');
  if (note) lines.push(`\n${note}`);
  return lines.join('\n');
}

export function formatPriceReply(p, productName, note) {
  return [
    `🛡️ *Precio blindado${productName ? ` · ${productName}` : ''}*`,
    `Costo de reposición: ${formatMoney(p.cost_usd, 'USD')} por unidad`,
    `Margen: ${p.margin_pct}%${p.fee_pct ? ` · Comisión: ${p.fee_pct}%` : ''}${p.fx_buffer_pct ? ` · Colchón cambiario: ${p.fx_buffer_pct}%` : ''}`,
    '',
    `💵 Precio en dólares: *${formatMoney(p.price_usd, 'USD')}*`,
    `🇻🇪 Precio en bolívares hoy: *${formatMoney(p.price_ves, 'VES')}*`,
    `Ganancia por unidad: ${formatMoney(p.profit_usd, 'USD')} (${p.effective_margin_pct}% real)`,
    `Tasa BCV usada: ${formatMoney(p.rate_used, 'VES')}`,
    note ? `\n${note}` : '',
  ].filter((l) => l !== '').join('\n');
}

export function formatSummaryReply(s, period, rate) {
  const title = { hoy: 'de hoy', semana: 'de esta semana', mes: 'del mes' }[period];
  const lines = [
    `📊 *Resumen ${title}*`,
    `🟢 Ingresos: ${formatMoney(s.ingresos_usd, 'USD')}`,
    `🔴 Gastos: ${formatMoney(s.egresos_usd, 'USD')}`,
    `💰 *Neto: ${formatMoney(s.neto_usd, 'USD')}* (≈ ${formatMoney(s.neto_usd * rate.rate, 'VES')} a tasa de hoy)`,
  ];
  if (s.pendiente_por_cobrar_usd > 0) lines.push(`⏳ Por cobrar (fiado): ${formatMoney(s.pendiente_por_cobrar_usd, 'USD')}`);
  if (s.count === 0) lines.push('_Aún no tienes movimientos en este período._');
  return lines.join('\n');
}

export const formatRateReply = (rate) =>
  `💱 ${rateLine(rate)}\nFecha valor: ${rate.effectiveDate}\n_1 $ = ${formatMoney(rate.rate, 'VES')}_`;

export const HELP_REPLY = [
  '👋 ¡Hola! Soy *Aura*, tu asistente de cuentas.',
  'Escríbeme o mándame una nota de voz, por ejemplo:',
  '• _"Gasté 20$ en insumos y cobré 50$ por Pago Móvil"_',
  '• _"¿A cuánto vendo una torta si reponer los ingredientes me cuesta 12$?"_',
  '• _"Resumen de la semana"_',
  '• _"¿A cómo está el dólar?"_',
].join('\n');

export const ERROR_REPLY = '😅 Uy, se me enredó algo procesando tu mensaje. ¿Me lo mandas otra vez en un minutico?';
export const UNSUPPORTED_REPLY = 'Por ahora entiendo textos y notas de voz 🎙️. ¡Pronto también fotos de facturas!';
