'use client';

const STYLES = {
  verde: {
    wrap: 'border-emerald-200 bg-emerald-50/70',
    dot: 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.2)]',
    badge: 'bg-emerald-100 text-emerald-800',
    label: 'Saludable',
  },
  amarillo: {
    wrap: 'border-amber-200 bg-amber-50/70',
    dot: 'bg-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.2)]',
    badge: 'bg-amber-100 text-amber-800',
    label: 'Atención',
  },
  rojo: {
    wrap: 'border-rose-200 bg-rose-50/70',
    dot: 'bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.2)]',
    badge: 'bg-rose-100 text-rose-800',
    label: 'En alerta',
  },
};

export default function HealthTrafficLight({ health }) {
  if (!health) return null;
  const s = STYLES[health.status] ?? STYLES.amarillo;

  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${s.wrap}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-2 shadow-xs">
            <span className={`h-3 w-3 rounded-full ${health.status === 'rojo' ? s.dot : 'bg-stone-200'}`} />
            <span className={`h-3 w-3 rounded-full ${health.status === 'amarillo' ? s.dot : 'bg-stone-200'}`} />
            <span className={`h-3 w-3 rounded-full ${health.status === 'verde' ? s.dot : 'bg-stone-200'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-gray-900">{health.title}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.badge}`}>{s.label}</span>
            </div>
            <p className="mt-0.5 text-xs text-gray-600">Semáforo de salud financiera del período</p>
          </div>
        </div>
      </div>

      {health.reasons?.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-gray-700">
          {health.reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-0.5 text-xs">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      {health.tip && (
        <p className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-xs font-medium text-gray-700">
          💡 <b>Siguiente paso:</b> {health.tip}
        </p>
      )}
    </section>
  );
}
