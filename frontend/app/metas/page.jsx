'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { money, usd } from '@/lib/format';
import { ErrorBox, Loading, PageTitle, useData } from '@/components/ui';
import GoalSimulator from '@/components/GoalSimulator';

const EMPTY = { name: '', target_amount: '', currency: 'USD', saved_amount: '0', target_date: '' };

export default function Metas() {
  const goals = useData(() => api('app/goals'), []);
  const summary = useData(() => api('app/summary', { params: { period: 'mes' } }), []);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function create(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api('app/goals', {
        method: 'POST',
        body: {
          name: form.name.trim(),
          target_amount: Number(form.target_amount),
          currency: form.currency,
          saved_amount: Number(form.saved_amount) || 0,
          target_date: form.target_date || null,
        },
      });
      setForm(EMPTY);
      await goals.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function addSaving(g, delta) {
    setError(null);
    try {
      await api(`app/goals/${g.id}`, {
        method: 'PATCH',
        body: { saved_amount: Math.max(0, Number(g.saved_amount) + delta) },
      });
      await goals.reload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(g) {
    if (!confirm(`¿Eliminar la meta "${g.name}"?`)) return;
    setError(null);
    try {
      await api(`app/goals/${g.id}`, { method: 'DELETE' });
      await goals.reload();
    } catch (err) {
      setError(err.message);
    }
  }

  const rows = goals.data ?? [];
  const monthlyNetUsd = summary.data?.summary?.neto_usd ?? 0;

  return (
    <div className="space-y-6">
      <PageTitle title="Metas y simulador" subtitle="Ponle nombre a lo que quieres lograr y calcula cómo llegar." />

      <GoalSimulator monthlyNetUsd={monthlyNetUsd} />

      <form onSubmit={create} className="card grid grid-cols-2 gap-3 md:grid-cols-5">
        <h2 className="col-span-2 font-semibold text-gray-900 md:col-span-5">Nueva meta de ahorro</h2>
        <label className="col-span-2 text-xs text-gray-500">¿Para qué ahorras?
          <input className="input mt-1" required maxLength={120} placeholder="Ej: Vitrina nueva" value={form.name} onChange={set('name')} />
        </label>
        <label className="text-xs text-gray-500">Meta
          <div className="mt-1 flex gap-1.5">
            <input className="input" type="number" min="1" step="any" required placeholder="300" value={form.target_amount} onChange={set('target_amount')} />
            <select className="input max-w-22" value={form.currency} onChange={set('currency')}>
              {['USD', 'VES', 'EUR', 'USDT'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </label>
        <label className="text-xs text-gray-500">Ya tienes
          <input className="input mt-1" type="number" min="0" step="any" value={form.saved_amount} onChange={set('saved_amount')} />
        </label>
        <label className="text-xs text-gray-500">Fecha objetivo
          <input className="input mt-1" type="date" value={form.target_date} onChange={set('target_date')} />
        </label>
        <div className="col-span-2 flex items-center gap-3 md:col-span-5">
          <button className="btn" disabled={busy}>{busy ? 'Guardando…' : 'Guardar meta'}</button>
          {error && <span className="text-xs text-rose-600">{error}</span>}
        </div>
      </form>

      <div className="space-y-3">
        <h2 className="font-semibold text-gray-900">Tus metas</h2>
        {goals.loading && !goals.data ? <Loading /> : goals.error ? <ErrorBox message={goals.error} onRetry={goals.reload} /> : rows.length === 0 ? (
          <div className="card text-center text-sm text-gray-500">Aún no has creado metas. Agrega la primera arriba.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {rows.map((g) => {
              const pct = Math.min(100, Math.round((Number(g.saved_amount) / Number(g.target_amount)) * 100));
              return (
                <div key={g.id} className="card space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-gray-900">{g.name}</h3>
                      <p className="text-xs text-gray-500">
                        {money(g.saved_amount, g.currency)} de {money(g.target_amount, g.currency)}
                        {g.target_date ? ` · Para ${g.target_date}` : ''}
                      </p>
                    </div>
                    <span className="rounded-full bg-aura-100 px-2.5 py-0.5 text-xs font-semibold text-aura-700">{pct}%</span>
                  </div>

                  <div className="h-2.5 overflow-hidden rounded-full bg-stone-100">
                    <div className="h-full rounded-full bg-aura-600 transition-all" style={{ width: `${pct}%` }} />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex gap-2">
                      <button type="button" onClick={() => addSaving(g, 10)} className="btn-ghost px-3 py-1 text-xs">+ {usd(10)}</button>
                      <button type="button" onClick={() => addSaving(g, 25)} className="btn-ghost px-3 py-1 text-xs">+ {usd(25)}</button>
                    </div>
                    <button type="button" onClick={() => remove(g)} className="text-xs text-rose-600 hover:underline">Eliminar</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
