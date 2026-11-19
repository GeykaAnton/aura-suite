'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Resumen', short: 'Inicio', icon: '📊', bottom: true },
  { href: '/transacciones', label: 'Transacciones', short: 'Movim.', icon: '💸', bottom: true },
  { href: '/precios', label: 'Precios', short: 'Precios', icon: '🏷️', bottom: true },
  { href: '/metas', label: 'Metas', short: 'Metas', icon: '🎯', bottom: true },
  { href: '/inventario', label: 'Inventario', short: 'Stock', icon: '📦', bottom: true },
  { href: '/reportes', label: 'Reportes', short: 'Reportes', icon: '📄', bottom: false },
];

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" onClick={() => setOpen(false)} className="shrink-0 text-lg font-bold text-aura-700">
            🌸 Aura Suite
          </Link>

          {/* Menú en computadora / tablet */}
          <nav className="hidden items-center gap-1 md:flex">
            {LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  isActive(item.href) ? 'bg-aura-100 text-aura-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Botón menú en teléfono */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Abrir menú"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 md:hidden"
          >
            <span>{open ? '✕' : '☰'}</span>
            <span>Menú</span>
          </button>
        </div>

        {/* Menú desplegable en teléfono */}
        {open && (
          <nav className="border-t border-gray-100 bg-white px-4 py-2 md:hidden">
            <ul className="space-y-1">
              {LINKS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                      isActive(item.href) ? 'bg-aura-100 text-aura-700' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      {/* Barra inferior fija estilo app móvil */}
      <nav
        aria-label="Navegación principal"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-gray-200 bg-white/95 backdrop-blur md:hidden"
      >
        {LINKS.filter((item) => item.bottom).map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium ${
                active ? 'text-aura-700' : 'text-gray-500'
              }`}
            >
              <span className="text-lg leading-none">{item.icon}</span>
              <span>{item.short}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
