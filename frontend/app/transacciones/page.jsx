'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { CATEGORY_LABELS, STATUS_LABELS, label } from '@/lib/format';
import { ErrorBox, Loading, PageTitle, useData } from '@/components/ui';
import TxTable from '@/components/TxTable';

const PAGE = 25;
const EMPTY = { from: '', to: '', type: '', category: '', status: '', q: '' };

export default function Transacciones() {
  const [filters, setFilters] = useState(EMPTY);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const meta = useData(() => api('app/meta'), []);

  // Búsqueda con pausa para no consultar en cada tecla
  useEffect(() => {
    const t = setTimeout(() => { setFilters((f) => ({ ...f, q })); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const list = useData(
    () => api('app/transactions', { params: { ...filters, limit: PAGE, offset: page * PAGE } }),
    [filters, page],
  );

  const set = (key) => (e) => { setFilters((f) => ({ ...f, [key]: e.target.value })); setPage(0); };
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));

  async function remove(t) {
    if (!confirm(`¿Eliminar "${t.description || 'esta transacción'}"? No aparecerá más en tus resúmenes.`)) return;
    setBusyId(t.id);
    setActionError(null);
    try {
      await api(`app/transactions/${t.id}`, { method: 'DELETE' });
      await list.reload();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageTitle title="Transacciones" subtitle="Todo lo que registraste por WhatsApp." />

      <div className="card mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
        <label className="col-span-2 text-xs text-gray-500">Buscar
          <input className="input mt-1" placeholder="Descripción o cliente" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="text-xs text-gray-500">Desde
          <input type="date" className="input mt-1" value={filters.from} onChange={set('from')} />
        </label>
        <label className="text-xs text-gray-500">Hasta
          <input type="date" className="input mt-1" value={filters.to} onChange={set('to')} />
        </label>
        <label className="text-xs text-gray-500">Tipo
          <select className="input mt-1" value={filters.type} onChange={set('type')}>
            <option value="">Todos</option><option value="ingreso">Ingresos</option><option value="egreso">Gastos</option>
          </select>
        </label>
        <label className="text-xs text-gray-500">Estado
          <select className="input mt-1" value={filters.status} onChange={set('status')}>
            <option value="">Todos</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="col-span-2 text-xs text-gray-500 md:col-span-3">Categoría
          <select className="input mt-1" value={filters.category} onChange={set('category')}>
            <option value="">Todas</option>
            {(meta.data?.categories ?? []).map((c) => <option key={c} value={c}>{label(CATEGORY_LABELS, c)}</option>)}
          </select>
        </label>
        <div className="col-span-2 flex items-end md:col-span-3">
          <button className="btn-ghost" onClick={() => { setFilters(EMPTY); setQ(''); setPage(0); }}>Limpiar filtros</button>
        </div>
      </div>

      {actionError && <div className="mb-3"><ErrorBox message={actionError} /></div>}

      <div className="card">
        {list.loading && !list.data ? <Loading /> : list.error ? <ErrorBox message={list.error} onRetry={list.reload} /> : (
          <>
            <TxTable rows={list.data.rows} onDelete={remove} busyId={busyId} />
            <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
              <span>{total} transacciones</span>
              <div className="flex items-center gap-2">
                <button className="btn-ghost" disabled={page === 0 || list.loading} onClick={() => setPage((p) => p - 1)}>Anterior</button>
                <span>Página {page + 1} de {pages}</span>
                <button className="btn-ghost" disabled={page + 1 >= pages || list.loading} onClick={() => setPage((p) => p + 1)}>Siguiente</button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
