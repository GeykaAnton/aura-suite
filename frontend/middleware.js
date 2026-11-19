// Contraseña opcional para toda la web (Basic Auth). Se activa con ACCESS_PASSWORD.
// Es una protección simple de una sola clave, NO un login de usuarias.
import { NextResponse } from 'next/server';

export function middleware(request) {
  const password = process.env.ACCESS_PASSWORD;
  if (!password) return NextResponse.next();

  const header = request.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    try {
      const [, pass] = atob(header.slice(6)).split(/:(.*)/s);
      if (pass === password) return NextResponse.next();
    } catch {}
  }
  return new NextResponse('Acceso restringido', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Aura Suite", charset="UTF-8"' },
  });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
