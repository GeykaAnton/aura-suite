import { NextResponse } from 'next/server';

export async function POST() {
  const out = NextResponse.json({ ok: true });
  out.cookies.set('aura_session', '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return out;
}
