import './globals.css';
import Nav from '@/components/Nav';

export const metadata = {
  title: 'Aura Suite · Centro de Mando',
  description: 'Finanzas, inventario, precios y reportes para emprendedoras',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="min-h-screen font-sans antialiased">
        <Nav />
        <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
