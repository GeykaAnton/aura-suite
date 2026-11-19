// Cálculo determinista del semáforo de salud financiera (sin IA).
import { D } from './money.js';

/**
 * @param {{ ingresos_usd: number, egresos_usd: number, neto_usd: number, pendiente_por_cobrar_usd: number, count: number, expense_by_category?: Record<string, number> }} summary
 * @param {Array<{ stock_qty: number, min_stock_qty: number }>} [products]
 */
export function calcHealthScore(summary, products = []) {
  const ingresos = D(summary.ingresos_usd || 0);
  const egresos = D(summary.egresos_usd || 0);
  const neto = D(summary.neto_usd || 0);
  const fiado = D(summary.pendiente_por_cobrar_usd || 0);
  const personales = D(summary.expense_by_category?.gastos_personales || 0);
  const lowStockCount = products.filter((p) => Number(p.min_stock_qty) > 0 && Number(p.stock_qty) <= Number(p.min_stock_qty)).length;

  if ((summary.count || 0) === 0 && fiado.eq(0)) {
    return {
      status: 'amarillo',
      title: 'Aún sin movimientos',
      reasons: ['No hay ventas ni gastos registrados en este período.'],
      tip: 'Envía una nota de voz o texto a Aura en WhatsApp con tu primer movimiento de hoy.',
      metrics: { margin_pct: 0, fiado_pct: 0, low_stock_count: lowStockCount },
    };
  }

  const marginPct = ingresos.gt(0) ? neto.div(ingresos).mul(100).toDecimalPlaces(1).toNumber() : neto.lt(0) ? -100 : 0;
  const fiadoPct = ingresos.gt(0) ? fiado.div(ingresos).mul(100).toDecimalPlaces(1).toNumber() : fiado.gt(0) ? 100 : 0;
  const personalPct = ingresos.gt(0) ? personales.div(ingresos).mul(100).toDecimalPlaces(1).toNumber() : 0;

  const reasons = [];
  let status = 'verde';

  if (neto.lt(0)) {
    status = 'rojo';
    reasons.push(`Salió más dinero ($${egresos.toFixed(2)}) del que entró ($${ingresos.toFixed(2)}).`);
  } else if (marginPct < 15) {
    status = 'amarillo';
    reasons.push(`Tu margen neto está ajustado (${marginPct}% de lo que entró).`);
  } else {
    reasons.push(`Buen margen neto: te queda libre el ${marginPct}% de tus ingresos.`);
  }

  if (fiadoPct > 20) {
    if (status === 'verde') status = 'amarillo';
    reasons.push(`Tienes $${fiado.toFixed(2)} por cobrar en fiado (${fiadoPct}% respecto a tus ventas).`);
  }
  if (personalPct > 25) {
    if (status === 'verde') status = 'amarillo';
    reasons.push(`Los gastos personales representan ${personalPct}% de tus ingresos del período.`);
  }
  if (lowStockCount > 0) {
    if (status === 'verde') status = 'amarillo';
    reasons.push(`${lowStockCount} producto${lowStockCount > 1 ? 's' : ''} por debajo del stock mínimo.`);
  }

  const title = status === 'verde' ? 'Negocio saludable' : status === 'amarillo' ? 'Requiere atención' : 'En alerta';
  const tip =
    status === 'rojo'
      ? 'Revisa tus gastos principales y usa la calculadora de precios para asegurar tu margen de reposición.'
      : fiadoPct > 20
        ? 'Prioriza cobrar lo pendiente (fiado) antes de asumir nuevos gastos.'
        : lowStockCount > 0
          ? 'Revisa Inventario para reponer los productos con poco stock antes de quedarte sin mercancía.'
          : status === 'amarillo'
            ? 'Ajusta precios o reduce gastos no esenciales para subir tu margen por encima del 15%.'
            : 'Vas muy bien: separa un porcentaje de tu ganancia libre hacia una meta de ahorro.';

  return {
    status,
    title,
    reasons: reasons.slice(0, 3),
    tip,
    metrics: { margin_pct: marginPct, fiado_pct: fiadoPct, low_stock_count: lowStockCount },
  };
}
