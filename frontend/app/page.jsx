'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '@/lib/api';
import { CATEGORY_LABELS, label, usd, ves } from '@/lib/format';
import { ErrorBox, Loading, PageTitle, Stat, useData } from '@/components/ui';
import HealthTrafficLight from '@/components/HealthTrafficLight';
import WhatsappShareCard from '@/components/WhatsappShareCard';
import TxTable from '@/components/TxTable';

const PERIODS = [['hoy', 'Hoy'], ['semana', 'Semana'], ['mes', 'Mes']];
const PERIOD_NAME = { hoy: 'de hoy', semana: 'de esta semana', mes: 'de este mes' };

export default function Dashboard() {
  const [period, setPeriod] = useState('mes');

  const me = useData(() => api('app/me'), []);
  const summary = useData(() => api('app/summary', { params: { period } }), [period]);
  const series = useData(() => api('app/series', { params: { days: 30 } }), []);
  const recent = useData(() => api('app/transactions', { params: { limit: 8 } }), []);

  if (me.error) return <ErrorBox message={me.error} onRetry={me.reload} />;

  const s = summary.data?.summary;
  const health = summary.data?.health;
  const rate = summary.data?.rate;
  const categories = s
    ? Object.entries(s.expense_by_category).map(([k, v]) => ({ name: label(CATEGORY_LABELS, k), value: v })).sort((a, b) => b.value - a.value).slice(0, 8)
    : [];
  const name = me.data?.business_name || me.data?.display_name;

  const waSummary = s
    ? [
        `🌸 *Resumen ${PERIOD_NAME[period]}*${name ? ` · ${name}` : ''}`,
        `🟢 Lo que entró: *${usd(s.ingresos_usd)}*`,
        `🔴 Lo que salió: *${usd(s.egresos_usd)}*`,
        `✨ Te queda libre: *${usd(s.neto_usd)}*`,
        s.pendiente_por_cobrar_usd > 0 ? `⏳ Fiado por cobrar: *${usd(s.pendiente_por_cobrar_usd)}*` : null,
        rate ? `💱 Tasa BCV: ${ves(rate.rate)}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  return (
    <>
      <PageTitle title={name ? `Hola, ${name} 👋` : 'Tu negocio hoy'} subtitle="Tus números claros, sin enredos contables.">
        <div className="flex flex-wrap items-center gap-2">
          {rate && (
            <span className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700">
              BCV: <b>{ves(rate.rate)}</b>
            </span>
          )}
          <div className="flex rounded-xl border border-stone-300 bg-white p-0.5">
            {PERIODS.map(([key, text]) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${period === key ? 'bg-aura-600 text-white' : 'text-gray-600 hover:bg-stone-100'}`}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      </PageTitle>

      {summary.error && <ErrorBox message={summary.error} onRetry={summary.reload} />}
      {summary.loading && !s && <Loading />}

      {s && (
        <div className="space-y-4">
          <HealthTrafficLight health={health} />

          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat title="Lo que entró" value={usd(s.ingresos_usd)} tone="good" hint={rate && ves(s.ingresos_usd * rate.rate)} />
            <Stat title="Lo que salió" value={usd(s.egresos_usd)} tone="bad" hint={rate && ves(s.egresos_usd * rate.rate)} />
            <Stat title="Te queda libre" value={usd(s.neto_usd)} tone={s.neto_usd >= 0 ? 'good' : 'bad'} hint={`${s.count} movimientos`} />
            <Stat title="Fiado por cobrar" value={usd(s.pendiente_por_cobrar_usd)} hint="Aún no es dinero en caja" />
          </section>
        </div>
      )}

      <section className="mt-5 grid gap-4 lg:grid-cols-2">
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
                  <Line type="monotone" dataKey="ingresos_usd" name="Entró" stroke="#10b981" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="egresos_usd" name="Salió" stroke="#f43f5e" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold text-gray-800">En qué se fue el dinero</h2>
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
                  <Bar dataKey="value" name="Gasto" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      {s && (
        <section className="mt-4">
          <WhatsappShareCard
            title="Resumen rápido para WhatsApp"
            subtitle="Compártelo con tu socia o guárdalo en tu chat."
            text={waSummary}
          />
        </section>
      )}

      <section className="card mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Últimos movimientos</h2>
          <Link href="/transacciones" className="text-sm font-medium text-aura-600 hover:underline">Ver todos</Link>
        </div>
        {recent.loading ? <Loading /> : recent.error ? <ErrorBox message={recent.error} onRetry={recent.reload} /> : <TxTable rows={recent.data.rows} />}
      </section>
    </>
  );
}
