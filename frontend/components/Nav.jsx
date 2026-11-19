'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  ['/', 'Resumen'],
  ['/transacciones', 'Transacciones'],
  ['/precios', 'Precios'],
  ['/inventario', 'Inventario'],
  ['/reportes', 'Reportes'],
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="shrink-0 text-lg font-bold text-aura-700">🌸 Aura Suite</Link>
        <nav className="flex gap-1 overflow-x-auto">
          {LINKS.map(([href, text]) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  active ? 'bg-aura-100 text-aura-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {text}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
