'use client';
import { useEffect, useState } from 'react';
import { usd, ves } from '@/lib/format';
import WhatsappShareCard from './WhatsappShareCard';

export default function QuoteBuilder({ lastCalculation, rate, businessName }) {
  const [clientName, setClientName] = useState('');
  const [productName, setProductName] = useState('');
  const [qty, setQty] = useState('1');
  const [unitUsd, setUnitUsd] = useState('');
  const [note, setNote] = useState('Precios válidos por hoy a tasa BCV.');
  const [pagoMovil, setPagoMovil] = useState('');
  const [includePm, setIncludePm] = useState(true);
  const [items, setItems] = useState([]);

  useEffect(() => {
    try { setPagoMovil(localStorage.getItem('aura_pago_movil') ?? ''); } catch {}
  }, []);

  function savePagoMovil(v) {
    setPagoMovil(v);
    try { localStorage.setItem('aura_pago_movil', v); } catch {}
  }

  const activePriceUsd = unitUsd !== '' ? Number(unitUsd) : lastCalculation?.price_usd ?? 0;
  const activeRate = rate ?? lastCalculation?.rate_used ?? 0;

  function addItem(e) {
    e.preventDefault();
    if (!productName.trim() || activePriceUsd <= 0) return;
    const count = Math.max(1, Number(qty) || 1);
    setItems((prev) => [...prev, { id: Date.now(), name: productName.trim(), qty: count, priceUsd: activePriceUsd }]);
    setProductName('');
    setQty('1');
    setUnitUsd('');
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  // Si aún no agregó líneas a la lista pero ya calculó un precio, armamos una cotización rápida directa
  const effectiveItems =
    items.length > 0
      ? items
      : lastCalculation
        ? [{ id: 'preview', name: productName.trim() || 'Producto cotizado', qty: Math.max(1, Number(qty) || 1), priceUsd: lastCalculation.price_usd }]
        : [];

  const totalUsd = effectiveItems.reduce((s, it) => s + it.qty * it.priceUsd, 0);
  const totalVes = activeRate > 0 ? totalUsd * activeRate : 0;

  const greeting = clientName.trim() ? `Hola ${clientName.trim()} ✨` : '¡Hola! ✨';
  const header = businessName ? `${greeting} Te comparto tu cotización de *${businessName}*:` : `${greeting} Te comparto tu cotización:`;
  const lines = effectiveItems.map((it) => `• ${it.qty} × ${it.name}: *${usd(it.qty * it.priceUsd)}*${activeRate ? ` (${ves(it.qty * it.priceUsd * activeRate)})` : ''}`);
  const message = [
    header,
    '',
    ...(lines.length ? lines : ['• (Calcula o agrega un producto para generar tu cotización)']),
    '',
    `💰 *Total:* ${usd(totalUsd)}${totalVes ? ` / ${ves(totalVes)}` : ''}`,
    includePm && pagoMovil.trim() ? `📲 *Para apartar cita / Pago Móvil:* ${pagoMovil.trim()}` : null,
    note.trim() ? `📌 _${note.trim()}_` : null,
  ]
    .filter((x) => x !== null)
    .join('\n');

  return (
    <div className="space-y-4">
      <form onSubmit={addItem} className="card grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-4">
          <h2 className="font-semibold text-gray-900">Generador rápido de cotización</h2>
          <p className="text-xs text-gray-500">Agrega uno o varios productos con su precio blindado y envíalos por WhatsApp.</p>
        </div>
        <label className="col-span-2 text-xs text-gray-500">Clienta (opcional)
          <input className="input mt-1" placeholder="Ej: María" value={clientName} onChange={(e) => setClientName(e.target.value)} />
        </label>
        <label className="col-span-2 text-xs text-gray-500">Producto o servicio
          <input className="input mt-1" placeholder="Ej: Torta de chocolate" value={productName} onChange={(e) => setProductName(e.target.value)} />
        </label>
        <label className="text-xs text-gray-500">Cantidad
          <input className="input mt-1" type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label className="text-xs text-gray-500">Precio unit. USD
          <input
            className="input mt-1"
            type="number"
            min="0"
            step="any"
            placeholder={lastCalculation ? String(lastCalculation.price_usd) : 'Ej: 15'}
            value={unitUsd}
            onChange={(e) => setUnitUsd(e.target.value)}
          />
        </label>
        <label className="col-span-2 text-xs text-gray-500">Nota al pie
          <input className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <label className="col-span-2 text-xs text-gray-500 sm:col-span-3">Datos de Pago Móvil (se guardan en tu teléfono)
          <input className="input mt-1" placeholder="Ej: 0412-1234567 · V-12345678 · Banesco (0134)" value={pagoMovil} onChange={(e) => savePagoMovil(e.target.value)} />
        </label>
        <label className="col-span-2 flex items-end gap-2 pb-2 text-xs text-gray-600 sm:col-span-1">
          <input type="checkbox" checked={includePm} onChange={(e) => setIncludePm(e.target.checked)} className="h-4 w-4 accent-aura-600" />
          <span>Incluir en mensaje</span>
        </label>
        <div className="col-span-2 flex items-center gap-2 sm:col-span-4">
          <button type="submit" className="btn-ghost" disabled={!productName.trim() || activePriceUsd <= 0}>
            ➕ Agregar a la cotización
          </button>
          {items.length > 0 && (
            <button type="button" className="text-xs text-gray-500 underline" onClick={() => setItems([])}>
              Limpiar lista
            </button>
          )}
        </div>

        {items.length > 0 && (
          <ul className="col-span-2 space-y-1 border-t border-stone-100 pt-2 text-sm sm:col-span-4">
            {items.map((it) => (
              <li key={it.id} className="flex items-center justify-between">
                <span>{it.qty} × {it.name} — <b>{usd(it.qty * it.priceUsd)}</b></span>
                <button type="button" onClick={() => removeItem(it.id)} className="text-xs text-rose-600 hover:underline">Quitar</button>
              </li>
            ))}
          </ul>
        )}
      </form>

      <WhatsappShareCard
        title="Cotización lista para WhatsApp"
        subtitle={activeRate ? `Calculada a tasa BCV ${ves(activeRate)}` : undefined}
        text={message}
      />
    </div>
  );
}
