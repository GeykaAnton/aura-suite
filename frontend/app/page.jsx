'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { CATEGORY_LABELS, label, usd, ves } from '@/lib/format';
import { ErrorBox, Loading, PageTitle, Stat, useData } from '@/components/ui';
import TxTable from '@/components/TxTable';

const PERIODS = [['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes']];

export default function Dashboard() {
  const [period, setPeriod] = useState('mes');

  const me = useData(() => api('app/me'), []);
  const summary = useData(() => api('app/summary', { params: { period } }), [period]);
  const series = useData(() => api('app/series', { params: { days: 30 } }), []);
  const recent = useData(() => api('app/transactions', { params: { limit: 8 } }), []);

  if (me.error) return <ErrorBox message={me.error} onRetry={me.reload} />;

  const s = summary.data?.summary;
  const rate = summary.data?.rate;
  const categories = s
    ? Object.entries(s.expense_by_category).map(([k, v]) => ({ name: label(CATEGORY_LABELS, k), value: v })).sort((a, b) => b.value - a.value).slice(0, 8)
    : [];
  const name = me.data?.business_name || me.data?.display_name;

  return (
    <>
      <PageTitle title={name ? `Hola, ${name} 👋` : 'Resumen'} subtitle="Tu negocio de un vistazo, en dólares y bolívares.">
        <div className="flex rounded-lg border border-gray-300 bg-white p-0.5">
          {PERIODS.map(([key, text]) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${period === key ? 'bg-aura-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {text}
            </button>
          ))}
        </div>
      </PageTitle>

      {summary.error && <ErrorBox message={summary.error} onRetry={summary.reload} />}
      {summary.loading && !s && <Loading />}

      {s && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat title="Ingresos" value={usd(s.ingresos_usd)} tone="good" hint={rate && ves(s.ingresos_usd * rate.rate)} />
            <Stat title="Gastos" value={usd(s.egresos_usd)} tone="bad" hint={rate && ves(s.egresos_usd * rate.rate)} />
            <Stat title="Ganancia neta" value={usd(s.neto_usd)} tone={s.neto_usd >= 0 ? 'good' : 'bad'} hint={`${s.count} movimientos`} />
            <Stat title="Por cobrar (fiado)" value={usd(s.pendiente_por_cobrar_usd)} hint="Aún no es dinero en caja" />
          </section>
          {rate && (
            <p className="mt-2 text-xs text-gray-500">
              Tasa BCV: <b>{ves(rate.rate)}</b> por $1 ({rate.effective_date}){rate.stale ? ' · tasa desactualizada' : ''}. Los montos en Bs son equivalentes a la tasa de hoy.
            </p>
          )}
        </>
      )}

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold text-gray-800">Últimos 30 días (USD)</h2>
          {series.loading ? <Loading /> : series.error ? <ErrorBox message={series.error} onRetry={series.reload} /> : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                  <XAxis dataKey="day" tickFormatter={(d) => d.slice(8) + '/' + d.slice(5, 7)} fontSize={11} interval={4} />
                  <YAxis fontSize={11} width={48} />
                  <Tooltip formatter={(v) => usd(v)} labelFormatter={(d) => d} />
                  <Legend />
                  <Line type="monotone" dataKey="ingresos_usd" name="Ingresos" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="egresos_usd" name="Gastos" stroke="#f43f5e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold text-gray-800">En qué gastas</h2>
          {summary.loading && !s ? <Loading /> : categories.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">Aún no hay gastos en este período.</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categories} layout="vertical" margin={{ left: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eee" horizontal={false} />
                  <XAxis type="number" fontSize={11} />
                  <YAxis type="category" dataKey="name" fontSize={11} width={110} />
                  <Tooltip formatter={(v) => usd(v)} />
                  <Bar dataKey="value" name="Gasto" fill="#ec4899" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      <section className="card mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Últimas transacciones</h2>
          <Link href="/transacciones" className="text-sm font-medium text-aura-600 hover:underline">Ver todas</Link>
        </div>
        {recent.loading ? <Loading /> : recent.error ? <ErrorBox message={recent.error} onRetry={recent.reload} /> : <TxTable rows={recent.data.rows} />}
      </section>
    </>
  );
}
