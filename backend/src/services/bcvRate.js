// ═══════════════════════════════════════════════════════════════════════
// Servicio de tasa BCV
//
// Estrategia de resiliencia (bcv.org.ve se cae o tiene problemas de SSL):
//   1. Caché en memoria (1 h)
//   2. Base de datos: tasa ya guardada para hoy
//   3. Proveedor configurado (dolarapi / bcv / manual)
//   4. Si todo falla: la ÚLTIMA tasa conocida en BD, marcada como "stale"
//      para que el bot avise ("uso la tasa de ayer, Bs. X").
// ═══════════════════════════════════════════════════════════════════════
import { config } from '../config.js';
import { todayInTz } from '../utils/dates.js';

const CACHE_TTL_MS = 60 * 60 * 1000;
let memoryCache = null; // { rate, effectiveDate, provider, cachedAt, stale }

/** Proveedor 1: API pública que replica la tasa oficial BCV.
 *  Verifica el formato vigente en https://dolarapi.com antes de producción. */
async function fetchFromDolarApi() {
  const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`dolarapi HTTP ${res.status}`);
  const data = await res.json();
  const rate = Number(data.promedio ?? data.venta ?? data.compra);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('dolarapi: tasa inválida');
  const effectiveDate = (data.fechaActualizacion ?? '').slice(0, 10) || todayInTz(config.timezone);
  return { rate, effectiveDate, provider: 'dolarapi' };
}

/** Proveedor 2: scraping directo de bcv.org.ve.
 *  Frágil: depende del HTML (div#dolar) y el sitio a veces presenta una
 *  cadena SSL incompleta. NO desactives la verificación TLS; si falla,
 *  usa otro proveedor. */
async function fetchFromBcvSite() {
  const res = await fetch('https://www.bcv.org.ve/', { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`bcv.org.ve HTTP ${res.status}`);
  const html = await res.text();
  const match = html.match(/id="dolar"[\s\S]*?<strong>\s*([\d.,]+)\s*<\/strong>/i);
  if (!match) throw new Error('bcv.org.ve: no se encontró la tasa en el HTML');
  // "36,50120000" → 36.5012
  const rate = Number(match[1].replace(/\./g, '').replace(',', '.'));
  const dateMatch = html.match(/content="(\d{4}-\d{2}-\d{2})/); // "Fecha Valor"
  return {
    rate,
    effectiveDate: dateMatch?.[1] ?? todayInTz(config.timezone),
    provider: 'bcv.org.ve',
  };
}

function fetchManual() {
  if (!config.rates.manualRate) throw new Error('BCV_MANUAL_RATE no está configurada');
  return { rate: config.rates.manualRate, effectiveDate: todayInTz(config.timezone), provider: 'manual' };
}

const providers = { dolarapi: fetchFromDolarApi, bcv: fetchFromBcvSite, manual: fetchManual };

/**
 * Obtiene la tasa BCV del día.
 * @param {import('../db/repository.js').Repository} repo
 * @returns {Promise<{ id?: number, rate: number, effectiveDate: string, provider: string, stale: boolean }>}
 */
export async function getTodayBcvRate(repo) {
  const today = todayInTz(config.timezone);

  if (memoryCache && !memoryCache.stale && Date.now() - memoryCache.cachedAt < CACHE_TTL_MS) {
    return memoryCache;
  }

  const stored = await repo.getRate('BCV', today);
  if (stored) return cache({ ...stored, stale: false });

  // Orden: el proveedor configurado primero, luego los demás como respaldo
  const order = [config.rates.provider, ...Object.keys(providers).filter((p) => p !== config.rates.provider)];
  const errors = [];
  for (const name of order) {
    try {
      const fresh = await providers[name]();
      const saved = await repo.saveRate({ source: name === 'manual' ? 'MANUAL' : 'BCV', ...fresh });
      return cache({ ...saved, stale: false });
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }

  const last = await repo.getLatestRate('BCV');
  if (last) return cache({ ...last, stale: true });

  throw new Error(`No se pudo obtener la tasa BCV. Detalle → ${errors.join(' | ')}`);
}

function cache(value) {
  memoryCache = { ...value, cachedAt: Date.now() };
  return memoryCache;
}

/** Solo para pruebas. */
export function _resetRateCache() {
  memoryCache = null;
}
