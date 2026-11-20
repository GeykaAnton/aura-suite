import { NextResponse } from 'next/server';

export async function POST(request) {
  const base = process.env.BACKEND_URL;
  const token = process.env.DASHBOARD_TOKEN;
  if (!base || !token) return NextResponse.json({ error: 'Falta configuración del servidor' }, { status: 500 });

  const body = await request.text();
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/auth/request-code`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dashboard-token': token },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ error: 'No se pudo conectar con el servidor.' }, { status: 502 });
  }
}
