'use client';
import { useCallback, useEffect, useState } from 'react';

/** Carga datos con estados de carga/error. `fn` debe ser estable (useCallback) o cambiar solo cuando deba recargar. */
export function useData(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      setState({ data: await run(), error: null, loading: false });
    } catch (e) {
      setState({ data: null, error: e.message, loading: false });
    }
  }, [run]);

  useEffect(() => { reload(); }, [reload]);
  return { ...state, reload };
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p>{message}</p>
      {onRetry && <button onClick={onRetry} className="mt-2 font-semibold underline">Reintentar</button>}
    </div>
  );
}

export function Loading({ text = 'Cargando…' }) {
  return <p className="py-8 text-center text-sm text-gray-500">{text}</p>;
}

export function Stat({ title, value, hint, tone = 'default' }) {
  const color = { default: 'text-gray-900', good: 'text-emerald-600', bad: 'text-rose-600' }[tone];
  return (
    <div className="card">
      <p className="text-sm text-gray-500">{title}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

export function PageTitle({ title, subtitle, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
