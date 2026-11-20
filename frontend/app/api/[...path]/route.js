// Proxy hacia el backend. Adjunta la sesión de la usuaria (cookie HttpOnly) y el token de servidor.
const ALLOWED = [/^app\//, /^rates\/bcv$/, /^pricing\/calculate$/];

async function forward(request, { params }) {
  const { path } = await params;
  const joined = path.join('/');
  if (!ALLOWED.some((re) => re.test(joined))) {
    return Response.json({ error: 'Ruta no permitida' }, { status: 404 });
  }

  const base = process.env.BACKEND_URL;
  const token = process.env.DASHBOARD_TOKEN;
  if (!base || !token) {
    return Response.json({ error: 'Faltan BACKEND_URL o DASHBOARD_TOKEN en el servidor del frontend' }, { status: 500 });
  }

  const session = request.cookies.get('aura_session')?.value;
  if (joined.startsWith('app/') && !session) {
    return Response.json({ error: 'Inicia sesión para continuar.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const target = `${base.replace(/\/$/, '')}/api/${joined}${url.search}`;
  const hasBody = !['GET', 'HEAD', 'DELETE'].includes(request.method);

  try {
    const res = await fetch(target, {
      method: request.method,
      headers: {
        'x-dashboard-token': token,
        ...(session ? { authorization: `Bearer ${session}` } : {}),
        ...(hasBody ? { 'content-type': 'application/json' } : {}),
      },
      body: hasBody ? await request.text() : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(25000),
    });
    return new Response(res.status === 204 ? null : res.body, {
      status: res.status,
      headers: { 'content-type': res.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' },
    });
  } catch {
    return Response.json({ error: 'No se pudo conectar con el servidor. Intenta de nuevo.' }, { status: 502 });
  }
}

export { forward as GET, forward as POST, forward as PATCH, forward as DELETE };
