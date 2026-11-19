import './globals.css';
import Nav from '@/components/Nav';
import PwaRegister from '@/components/PwaRegister';

export const metadata = {
  title: 'Aura Suite · Centro de Mando',
  description: 'Finanzas, inventario, precios y reportes para emprendedoras',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Aura Suite' },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

export const viewport = {
  themeColor: '#db2777',
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="min-h-screen font-sans antialiased">
        <PwaRegister />
        <Nav />
        <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
