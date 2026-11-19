'use client';
import { CATEGORY_LABELS, METHOD_LABELS, STATUS_LABELS, dateTime, label, money, usd } from '@/lib/format';

export default function TxTable({ rows, onDelete, busyId }) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-gray-500">No hay transacciones para mostrar.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="py-2 pr-3">Fecha</th>
            <th className="pr-3">Descripción</th>
            <th className="pr-3">Categoría</th>
            <th className="pr-3">Medio</th>
            <th className="pr-3 text-right">Monto</th>
            <th className="pr-3 text-right">En USD</th>
            {onDelete && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const income = t.type === 'ingreso';
            return (
              <tr key={t.id} className="border-b border-gray-100 last:border-0">
                <td className="whitespace-nowrap py-2 pr-3 text-gray-500">{dateTime(t.occurred_at)}</td>
                <td className="pr-3">
                  <span className="font-medium text-gray-900">{t.description || '—'}</span>
                  {t.counterparty && <span className="text-gray-500"> · {t.counterparty}</span>}
                  {t.status !== 'confirmada' && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{label(STATUS_LABELS, t.status)}</span>
                  )}
                </td>
                <td className="pr-3 text-gray-600">{label(CATEGORY_LABELS, t.category_slug)}</td>
                <td className="pr-3 text-gray-600">{label(METHOD_LABELS, t.payment_method)}</td>
                <td className={`whitespace-nowrap pr-3 text-right font-semibold ${income ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {income ? '+' : '−'}{money(t.amount, t.currency)}
                </td>
                <td className="whitespace-nowrap pr-3 text-right text-gray-600">{usd(t.amount_usd)}</td>
                {onDelete && (
                  <td className="text-right">
                    <button
                      onClick={() => onDelete(t)}
                      disabled={busyId === t.id}
                      className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                      title="Eliminar"
                    >
                      Eliminar
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
