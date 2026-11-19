'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { CATEGORY_LABELS, addDays, firstOfMonth, label, todayCaracas, usd } from '@/lib/format';
import { exportExcel, exportPdf } from '@/lib/export';
import { ErrorBox, Loading, PageTitle, Stat, useData } from '@/components/ui';
import TxTable from '@/components/TxTable';

const MAX = 1000;

export default function Reportes() {
  const [range, setRange] = useState({ from: firstOfMonth(), to: todayCaracas() });
  const [exporting, setExporting] = useState(null);
  const [exportError, setExportError] = useState(null);
  const me = useData(() => api('app/me'), []);

  const report = useData(async () => {
    const data = await api('app/transactions', { params: { from: range.from, to: range.to, limit: MAX } });
    return data;
  }, [range.from, range.to]);

  const rows = report.data?.rows ?? [];
  // Mismas reglas que el resumen: sin anuladas; lo pendiente no es caja
  const valid = rows.filter((t) => t.status !== 'anulada');
  const summary = valid.reduce((s, t) => {
    const v = Number(t.amount_usd);
    if (t.status === 'pendiente') { if (t.type === 'ingreso') s.porCobrar += v; return s; }
    if (t.type === 'ingreso') s.ingresos += v; else s.egresos += v;
    return s;
  }, { ingresos: 0, egresos: 0, porCobrar: 0 });
  summary.neto = summary.ingresos - summary.egresos;

  const byCategory = {};
  for (const t of valid) {
    if (t.status === 'pendiente' || t.type !== 'egreso') continue;
    byCategory[t.category_slug] = (byCategory[t.category_slug] ?? 0) + Number(t.amount_usd);
  }
  const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const preset = (from, to) => setRange({ from, to });
  const invalidRange = range.from > range.to;

  async function run(kind) {
    setExportError(null);
    setExporting(kind);
    try {
      if (kind === 'xlsx') await exportExcel(valid, summary, range);
      else await exportPdf(valid, summary, range, me.data?.business_name || me.data?.display_name);
    } catch {
      setExportError('No se pudo generar el archivo. Intenta de nuevo.');
    } finally {
      setExporting(null);
    }
  }

  return (
    <>
      <PageTitle title="Reportes" subtitle="Elige un período y descárgalo en Excel o PDF." />

      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-gray-500">Desde
          <input type="date" className="input mt-1" value={range.from} max={range.to} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} />
        </label>
        <label className="text-xs text-gray-500">Hasta
          <input type="date" className="input mt-1" value={range.to} min={range.from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => preset(todayCaracas(), todayCaracas())}>Hoy</button>
          <button className="btn-ghost" onClick={() => preset(addDays(todayCaracas(), -6), todayCaracas())}>7 días</button>
          <button className="btn-ghost" onClick={() => preset(firstOfMonth(), todayCaracas())}>Este mes</button>
          <button className="btn-ghost" onClick={() => preset(addDays(todayCaracas(), -29), todayCaracas())}>30 días</button>
        </div>
      </div>

      {invalidRange && <ErrorBox message="La fecha de inicio no puede ser posterior a la fecha final." />}
      {report.loading && !report.data && <Loading />}
      {report.error && <ErrorBox message={report.error} onRetry={report.reload} />}

      {report.data && !invalidRange && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat title="Ingresos" value={usd(summary.ingresos)} tone="good" />
            <Stat title="Gastos" value={usd(summary.egresos)} tone="bad" />
            <Stat title="Ganancia neta" value={usd(summary.neto)} tone={summary.neto >= 0 ? 'good' : 'bad'} />
            <Stat title="Por cobrar (fiado)" value={usd(summary.porCobrar)} />
          </section>

          {report.data.total > MAX && (
            <div className="mt-3"><ErrorBox message={`Este período tiene ${report.data.total} movimientos y el reporte incluye solo los ${MAX} más recientes. Elige un período más corto.`} /></div>
          )}

          <div className="card mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">{valid.length} movimientos en el período. Los montos en USD usan la tasa del día de cada registro.</p>
            <div className="flex gap-2">
              <button className="btn" disabled={!valid.length || exporting} onClick={() => run('xlsx')}>{exporting === 'xlsx' ? 'Generando…' : 'Descargar Excel'}</button>
              <button className="btn-ghost" disabled={!valid.length || exporting} onClick={() => run('pdf')}>{exporting === 'pdf' ? 'Generando…' : 'Descargar PDF'}</button>
            </div>
            {exportError && <div className="w-full"><ErrorBox message={exportError} /></div>}
          </div>

          {topCategories.length > 0 && (
            <div className="card mt-4">
              <h2 className="mb-2 font-semibold text-gray-800">Donde más gastaste</h2>
              <ul className="space-y-1 text-sm">
                {topCategories.map(([k, v]) => (
                  <li key={k} className="flex justify-between border-b border-gray-100 py-1 last:border-0">
                    <span>{label(CATEGORY_LABELS, k)}</span><b>{usd(v)}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card mt-4"><TxTable rows={rows} /></div>
        </>
      )}
    </>
  );
}
