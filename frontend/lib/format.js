// Formato venezolano (1.234,56) y etiquetas legibles.
const nf = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const usd = (n) => `$${nf.format(Number(n) || 0)}`;
export const ves = (n) => `Bs. ${nf.format(Number(n) || 0)}`;

export function money(amount, currency) {
  switch (currency) {
    case 'VES': return ves(amount);
    case 'USDT': return `${nf.format(Number(amount) || 0)} USDT`;
    case 'EUR': return `€${nf.format(Number(amount) || 0)}`;
    default: return usd(amount);
  }
}

export const CATEGORY_LABELS = {
  ventas: 'Ventas', servicios: 'Servicios prestados', cobro_deuda: 'Cobro de fiado/deuda', otros_ingresos: 'Otros ingresos',
  insumos: 'Insumos', mercancia: 'Mercancía', empaques: 'Empaques', delivery_transporte: 'Delivery / transporte',
  publicidad: 'Publicidad', servicios_basicos: 'Servicios básicos', alquiler: 'Alquiler', nomina: 'Personal',
  comisiones: 'Comisiones', impuestos: 'Impuestos', gastos_personales: 'Gastos personales', otros_gastos: 'Otros gastos',
};

export const METHOD_LABELS = {
  pago_movil: 'Pago Móvil', transferencia_bs: 'Transferencia Bs', punto_de_venta: 'Punto de venta', efectivo_bs: 'Efectivo Bs',
  efectivo_usd: 'Efectivo $', zelle: 'Zelle', binance_usdt: 'Binance USDT', paypal: 'PayPal', otro: 'Otro', desconocido: '—',
};

export const STATUS_LABELS = { confirmada: 'Confirmada', pendiente: 'Pendiente (fiado)', anulada: 'Anulada' };

export const label = (map, key) => map[key] ?? key;

/** 'YYYY-MM-DD' de hoy en Caracas (UTC-4). */
export const todayCaracas = () => new Date(Date.now() - 4 * 3600e3).toISOString().slice(0, 10);

/** Suma/resta días a un 'YYYY-MM-DD'. */
export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const firstOfMonth = () => `${todayCaracas().slice(0, 8)}01`;

export const dateTime = (iso) =>
  new Date(iso).toLocaleString('es-VE', { timeZone: 'America/Caracas', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
