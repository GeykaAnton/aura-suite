'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { usd, ves } from '@/lib/format';
import { ErrorBox, PageTitle, Stat, useData } from '@/components/ui';
import QuoteBuilder from '@/components/QuoteBuilder';

const CURRENCIES = [['USD', 'Dólares ($)'], ['VES', 'Bolívares (Bs)'], ['EUR', 'Euros (€)'], ['USDT', 'USDT']];

export default function Precios() {
  const me = useData(() => api('app/me'), []);
  const products = useData(() => api('app/products'), []);
  const rate = useData(() => api('rates/bcv'), []);
  const [form, setForm] = useState({ cost: '', currency: 'USD', pack: '1', margin: '', fee: '0', buffer: '', round: '1' });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const margin = form.margin !== '' ? form.margin : String(me.data?.default_margin_pct ?? 30);
  const buffer = form.buffer !== '' ? form.buffer : String(me.data?.fx_buffer_pct ?? 0);

  function loadProduct(id) {
    const p = (products.data ?? []).find((x) => x.id === id);
    if (!p) return;
    setForm((f) => ({
      ...f,
      cost: String(p.replacement_cost),
      currency: p.cost_currency,
      pack: '1',
      margin: p.margin_pct != null ? String(p.margin_pct) : f.margin,
    }));
  }

  async function calculate(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      setResult(await api('pricing/calculate', {
        method: 'POST',
        body: {
          replacement_cost: Number(form.cost),
          cost_currency: form.currency,
          pack_units: Number(form.pack) || 1,
          margin_pct: Number(margin),
          fee_pct: Number(form.fee) || 0,
          fx_buffer_pct: Number(buffer) || 0,
          round_ves_to: Number(form.round) || 1,
        },
      }));
    } catch {
      setResult(null);
      setError('No pude calcular. Revisa que el costo sea mayor que 0, el margen esté entre 0 y 95 % y la comisión no pase de 50 %.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <PageTitle title="Blindaje de precios y cotizador" subtitle="Calcula cuánto cobrar hoy para poder reponer tu mercancía sin perder." />

        <div className="grid gap-4 lg:grid-cols-2">
          <form onSubmit={calculate} className="card grid grid-cols-2 gap-3">
            {(products.data?.length ?? 0) > 0 && (
              <label className="col-span-2 text-xs text-gray-500">Cargar desde tu inventario (opcional)
                <select className="input mt-1" defaultValue="" onChange={(e) => loadProduct(e.target.value)}>
                  <option value="">Elegir un producto…</option>
                  {products.data.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.replacement_cost} {p.cost_currency})</option>)}
                </select>
              </label>
            )}
            <label className="col-span-2 text-xs text-gray-500">¿Cuánto cuesta reponer el producto hoy?
              <div className="mt-1 flex gap-2">
                <input className="input" type="number" min="0" step="any" required placeholder="Ej: 30" value={form.cost} onChange={set('cost')} />
                <select className="input max-w-40" value={form.currency} onChange={set('currency')}>
                  {CURRENCIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </label>
            <label className="text-xs text-gray-500">Unidades por paquete/caja
              <input className="input mt-1" type="number" min="1" step="any" value={form.pack} onChange={set('pack')} />
            </label>
            <label className="text-xs text-gray-500">Margen de ganancia (%)
              <input className="input mt-1" type="number" min="0" max="95" step="any" value={margin} onChange={set('margin')} />
            </label>
            <label className="text-xs text-gray-500">Comisión del punto/plataforma (%)
              <input className="input mt-1" type="number" min="0" max="50" step="any" value={form.fee} onChange={set('fee')} />
            </label>
            <label className="text-xs text-gray-500">Colchón cambiario en Bs (%)
              <input className="input mt-1" type="number" min="0" max="100" step="any" value={buffer} onChange={set('buffer')} />
            </label>
            <label className="col-span-2 text-xs text-gray-500">Redondear el precio en Bs hacia arriba a múltiplos de
              <select className="input mt-1" value={form.round} onChange={set('round')}>
                {[1, 5, 10, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <button className="btn col-span-2" disabled={busy}>{busy ? 'Calculando…' : 'Calcular precio blindado'}</button>
            {error && <div className="col-span-2"><ErrorBox message={error} /></div>}
          </form>

          <div className="space-y-3">
            {result ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Stat title="Precio en dólares" value={usd(result.price_usd)} tone="good" />
                  <Stat title="Precio en bolívares" value={ves(result.price_ves)} tone="good" hint={`Tasa BCV ${ves(result.rate_used)}`} />
                  <Stat title="Costo por unidad" value={usd(result.cost_usd)} />
                  <Stat title="Ganancia por unidad" value={usd(result.profit_usd)} hint={`Margen real: ${result.effective_margin_pct}%`} />
                </div>
                <div className="card text-sm text-gray-600">
                  El margen se calcula <b>sobre el precio de venta</b>, no sobre el costo, así la ganancia es realmente la que pediste. La comisión
                  y el colchón cambiario ya están incluidos, y el precio en Bs se redondea siempre hacia arriba.
                </div>
              </>
            ) : (
              <div className="card flex h-full min-h-48 items-center justify-center text-center text-sm text-gray-500">
                Llena el formulario y pulsa “Calcular precio blindado” para ver cuánto cobrar.
              </div>
            )}
          </div>
        </div>
      </div>

      <QuoteBuilder
        lastCalculation={result}
        rate={rate.data?.rate}
        businessName={me.data?.business_name || me.data?.display_name}
      />
    </div>
  );
}
