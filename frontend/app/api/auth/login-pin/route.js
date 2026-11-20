import { NextResponse } from 'next/server';

export async function POST(request) {
  const base = process.env.BACKEND_URL;
  const token = process.env.DASHBOARD_TOKEN;
  if (!base || !token) return NextResponse.json({ error: 'Falta configuración del servidor' }, { status: 500 });

  const body = await request.text();
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/auth/login-pin`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dashboard-token': token },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json(data, { status: res.status });

    const out = NextResponse.json({ ok: true, user: data.user });
    out.cookies.set('aura_session', data.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
    return out;
  } catch {
    return NextResponse.json({ error: 'No se pudo conectar con el servidor.' }, { status: 502 });
  }
}
