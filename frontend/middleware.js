// Protege las páginas con la cookie de sesión de la usuaria (aura_session).
// Si no ha iniciado sesión, redirige a /login.
import { NextResponse } from 'next/server';

export function middleware(request) {
  const { pathname } = request.nextUrl;
  if (pathname === '/login' || pathname.startsWith('/api/')) return NextResponse.next();

  const hasSession = Boolean(request.cookies.get('aura_session')?.value);
  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|sw\\.js|icons/).*)'],
};
