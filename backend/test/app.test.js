// API del panel web: autenticación por token, resumen, transacciones, inventario.
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.LLM_MODE = 'mock';
process.env.TRANSCRIPTION_MODE = 'mock';
process.env.BCV_PROVIDER = 'manual';
process.env.BCV_MANUAL_RATE = '40';
process.env.ENABLE_DEV_ROUTES = 'true';
process.env.DASHBOARD_TOKEN = 'token-panel-de-prueba';

const { buildApp } = await import('../src/app.js');
const { MemoryRepository } = await import('../src/db/repository.js');

const repo = new MemoryRepository();
const app = await buildApp({ repo, logger: false });
const H = { 'x-dashboard-token': 'token-panel-de-prueba' };

test('sin token → 401', async () => {
  assert.equal((await app.inject({ method: 'GET', url: '/api/app/summary' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'GET', url: '/api/app/summary', headers: { 'x-dashboard-token': 'malo' } })).statusCode, 401);
});

test('sin usuarias → 404 con mensaje claro', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/app/summary', headers: H });
  assert.equal(res.statusCode, 404);
});

test('resumen, lista, serie y borrado lógico', async () => {
  await app.inject({
    method: 'POST', url: '/dev/simulate',
    payload: { from: '584141111111', text: 'Gasté 20$ en insumos y cobré 50$ en bolívares por Pago Móvil' },
  });

  const s = (await app.inject({ method: 'GET', url: '/api/app/summary?period=mes', headers: H })).json();
  assert.equal(s.summary.ingresos_usd, 50);
  assert.equal(s.summary.egresos_usd, 20);
  assert.equal(s.summary.expense_by_category.insumos, 20);
  assert.equal(s.health.status, 'verde');
  assert.equal(s.rate.rate, 40);

  const list = (await app.inject({ method: 'GET', url: '/api/app/transactions?type=egreso', headers: H })).json();
  assert.equal(list.total, 1);
  assert.equal(list.rows[0].category_slug, 'insumos');

  const series = (await app.inject({ method: 'GET', url: '/api/app/series?days=7', headers: H })).json();
  assert.equal(series.length, 7);
  assert.equal(series.at(-1).ingresos_usd, 50);

  const del = await app.inject({ method: 'DELETE', url: `/api/app/transactions/${list.rows[0].id}`, headers: H });
  assert.equal(del.statusCode, 204);
  const after = (await app.inject({ method: 'GET', url: '/api/app/summary?period=mes', headers: H })).json();
  assert.equal(after.summary.egresos_usd, 0);
});

test('inventario: crear, duplicado, editar, borrar', async () => {
  const body = { name: 'Harina', unit: 'kg', replacement_cost: 1.5, stock_qty: 10, min_stock_qty: 3 };
  const created = await app.inject({ method: 'POST', url: '/api/app/products', headers: H, payload: body });
  assert.equal(created.statusCode, 201);
  const id = created.json().id;

  assert.equal((await app.inject({ method: 'POST', url: '/api/app/products', headers: H, payload: body })).statusCode, 409);

  const upd = await app.inject({ method: 'PATCH', url: `/api/app/products/${id}`, headers: H, payload: { stock_qty: 2 } });
  assert.equal(upd.json().stock_qty, 2);

  assert.equal((await app.inject({ method: 'DELETE', url: `/api/app/products/${id}`, headers: H })).statusCode, 204);
  assert.equal((await app.inject({ method: 'GET', url: '/api/app/products', headers: H })).json().length, 0);
});

test('metas de ahorro: crear, abonar, borrar', async () => {
  const created = await app.inject({
    method: 'POST', url: '/api/app/goals', headers: H,
    payload: { name: 'Vitrina nueva', target_amount: 300, saved_amount: 50, target_date: '2026-12-31' },
  });
  assert.equal(created.statusCode, 201);
  const id = created.json().id;

  const upd = await app.inject({ method: 'PATCH', url: `/api/app/goals/${id}`, headers: H, payload: { saved_amount: 120 } });
  assert.equal(upd.json().saved_amount, 120);
  assert.equal((await app.inject({ method: 'GET', url: '/api/app/goals', headers: H })).json().length, 1);

  assert.equal((await app.inject({ method: 'DELETE', url: `/api/app/goals/${id}`, headers: H })).statusCode, 204);
  assert.equal((await app.inject({ method: 'GET', url: '/api/app/goals', headers: H })).json().length, 0);
});

test('multiusuaria: cada usuaria ve solo sus datos con su sesión', async () => {
  const { signSessionToken } = await import('../src/services/auth.js');
  const amiga = await repo.findOrCreateUser('584149999999', 'Amiga');
  const tokenAmiga = signSessionToken(amiga);

  // La amiga aún no tiene transacciones (aunque la usuaria 1 sí tiene)
  const resAmiga = await app.inject({
    method: 'GET', url: '/api/app/summary?period=mes',
    headers: { ...H, authorization: `Bearer ${tokenAmiga}` },
  });
  assert.equal(resAmiga.statusCode, 200);
  assert.equal(resAmiga.json().summary.count, 0);

  // La amiga puede crear su propia meta sin mezclarla
  await app.inject({
    method: 'POST', url: '/api/app/goals',
    headers: { ...H, authorization: `Bearer ${tokenAmiga}` },
    payload: { name: 'Meta de amiga', target_amount: 100 },
  });
  assert.equal((await app.inject({ method: 'GET', url: '/api/app/goals', headers: H })).json().length, 0);
  assert.equal((await app.inject({ method: 'GET', url: '/api/app/goals', headers: { ...H, authorization: `Bearer ${tokenAmiga}` } })).json().length, 1);

  // Token inválido → 401
  assert.equal((await app.inject({ method: 'GET', url: '/api/app/me', headers: { ...H, authorization: 'Bearer invalido' } })).statusCode, 401);
});

test('login con número + PIN: crear PIN y validar PIN incorrecto', async () => {
  const s1 = (await app.inject({ method: 'POST', url: '/api/auth/pin-status', headers: H, payload: { phone: '0412-5551234' } })).json();
  assert.equal(s1.phone, '584125551234');
  assert.equal(s1.hasPin, false);

  const crear = await app.inject({ method: 'POST', url: '/api/auth/login-pin', headers: H, payload: { phone: '04125551234', pin: '2468' } });
  assert.equal(crear.statusCode, 200);
  assert.ok(crear.json().token);

  const s2 = (await app.inject({ method: 'POST', url: '/api/auth/pin-status', headers: H, payload: { phone: '584125551234' } })).json();
  assert.equal(s2.hasPin, true);

  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login-pin', headers: H, payload: { phone: '04125551234', pin: '0000' } })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login-pin', headers: H, payload: { phone: '04125551234', pin: '2468' } })).statusCode, 200);
});
