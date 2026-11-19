'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { money, usd } from '@/lib/format';
import { ErrorBox, Loading, PageTitle, Stat, useData } from '@/components/ui';

const EMPTY = { name: '', sku: '', unit: 'unidad', replacement_cost: '', cost_currency: 'USD', margin_pct: '', stock_qty: '0', min_stock_qty: '0' };

export default function Inventario() {
  const products = useData(() => api('app/products'), []);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function payload() {
    return {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      unit: form.unit.trim() || 'unidad',
      replacement_cost: Number(form.replacement_cost) || 0,
      cost_currency: form.cost_currency,
      margin_pct: form.margin_pct === '' ? null : Number(form.margin_pct),
      stock_qty: Number(form.stock_qty) || 0,
      min_stock_qty: Number(form.min_stock_qty) || 0,
    };
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (editingId) await api(`app/products/${editingId}`, { method: 'PATCH', body: payload() });
      else await api('app/products', { method: 'POST', body: payload() });
      setForm(EMPTY);
      setEditingId(null);
      await products.reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function edit(p) {
    setEditingId(p.id);
    setError(null);
    setForm({
      name: p.name, sku: p.sku ?? '', unit: p.unit, replacement_cost: String(p.replacement_cost), cost_currency: p.cost_currency,
      margin_pct: p.margin_pct == null ? '' : String(p.margin_pct), stock_qty: String(p.stock_qty), min_stock_qty: String(p.min_stock_qty),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function remove(p) {
    if (!confirm(`¿Eliminar "${p.name}" del inventario?`)) return;
    setError(null);
    try {
      await api(`app/products/${p.id}`, { method: 'DELETE' });
      if (editingId === p.id) { setEditingId(null); setForm(EMPTY); }
      await products.reload();
    } catch (err) {
      setError(err.message);
    }
  }

  const rows = products.data ?? [];
  const low = rows.filter((p) => p.min_stock_qty > 0 && p.stock_qty <= p.min_stock_qty);
  const valueUsd = rows.filter((p) => p.cost_currency === 'USD').reduce((s, p) => s + p.replacement_cost * p.stock_qty, 0);

  return (
    <>
      <PageTitle title="Inventario" subtitle="Tus productos, su costo de reposición y cuánto te queda." />

      <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat title="Productos" value={rows.length} />
        <Stat title="Con poco stock" value={low.length} tone={low.length ? 'bad' : 'default'} hint="Igual o por debajo del mínimo" />
        <Stat title="Valor en inventario (USD)" value={usd(valueUsd)} hint="Solo productos con costo en $" />
      </section>

      <form onSubmit={submit} className="card mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <h2 className="col-span-2 font-semibold text-gray-800 md:col-span-4">{editingId ? 'Editar producto' : 'Agregar producto'}</h2>
        <label className="col-span-2 text-xs text-gray-500">Nombre
          <input className="input mt-1" required maxLength={120} value={form.name} onChange={set('name')} />
        </label>
        <label className="text-xs text-gray-500">Código (opcional)
          <input className="input mt-1" maxLength={60} value={form.sku} onChange={set('sku')} />
        </label>
        <label className="text-xs text-gray-500">Unidad
          <input className="input mt-1" value={form.unit} onChange={set('unit')} placeholder="unidad, kg, caja…" />
        </label>
        <label className="text-xs text-gray-500">Costo de reposición
          <div className="mt-1 flex gap-2">
            <input className="input" type="number" min="0" step="any" value={form.replacement_cost} onChange={set('replacement_cost')} />
            <select className="input max-w-24" value={form.cost_currency} onChange={set('cost_currency')}>
              {['USD', 'VES', 'EUR', 'USDT'].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </label>
        <label className="text-xs text-gray-500">Margen % (vacío = el tuyo)
          <input className="input mt-1" type="number" min="0" max="95" step="any" value={form.margin_pct} onChange={set('margin_pct')} />
        </label>
        <label className="text-xs text-gray-500">Stock actual
          <input className="input mt-1" type="number" min="0" step="any" value={form.stock_qty} onChange={set('stock_qty')} />
        </label>
        <label className="text-xs text-gray-500">Stock mínimo (alerta)
          <input className="input mt-1" type="number" min="0" step="any" value={form.min_stock_qty} onChange={set('min_stock_qty')} />
        </label>
        <div className="col-span-2 flex gap-2 md:col-span-4">
          <button className="btn" disabled={busy}>{busy ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Agregar'}</button>
          {editingId && <button type="button" className="btn-ghost" onClick={() => { setEditingId(null); setForm(EMPTY); setError(null); }}>Cancelar</button>}
        </div>
        {error && <div className="col-span-2 md:col-span-4"><ErrorBox message={error} /></div>}
      </form>

      <div className="card">
        {products.loading && !products.data ? <Loading /> : products.error ? <ErrorBox message={products.error} onRetry={products.reload} /> : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">Aún no tienes productos. Agrega el primero arriba.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3">Producto</th><th className="pr-3 text-right">Costo reposición</th>
                  <th className="pr-3 text-right">Margen</th><th className="pr-3 text-right">Stock</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const isLow = p.min_stock_qty > 0 && p.stock_qty <= p.min_stock_qty;
                  return (
                    <tr key={p.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 pr-3">
                        <span className="font-medium text-gray-900">{p.name}</span>
                        {p.sku && <span className="text-gray-400"> · {p.sku}</span>}
                      </td>
                      <td className="pr-3 text-right">{money(p.replacement_cost, p.cost_currency)}</td>
                      <td className="pr-3 text-right text-gray-600">{p.margin_pct == null ? 'El tuyo' : `${p.margin_pct}%`}</td>
                      <td className="pr-3 text-right">
                        <span className={isLow ? 'font-semibold text-rose-600' : ''}>{p.stock_qty} {p.unit}</span>
                        {isLow && <span className="ml-2 rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-700">Poco stock</span>}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <button className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100" onClick={() => edit(p)}>Editar</button>
                        <button className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-rose-50 hover:text-rose-600" onClick={() => remove(p)}>Eliminar</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
