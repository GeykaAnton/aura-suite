// Prueba de punta a punta en modo mock (sin red, sin IA, sin BD).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

process.env.LLM_MODE = 'mock';
process.env.TRANSCRIPTION_MODE = 'mock';
process.env.BCV_PROVIDER = 'manual';
process.env.BCV_MANUAL_RATE = '40';
process.env.ENABLE_DEV_ROUTES = 'true';
process.env.WHATSAPP_APP_SECRET = 'secreto-de-prueba';
process.env.WHATSAPP_VERIFY_TOKEN = 'token-prueba';

const { buildApp } = await import('../src/app.js');
const { MemoryRepository } = await import('../src/db/repository.js');

const repo = new MemoryRepository();
const app = await buildApp({ repo, logger: false });

test('texto: "Gasté 20$ en insumos y cobré 50$ en bolívares por Pago Móvil"', async () => {
  const res = await app.inject({
    method: 'POST', url: '/dev/simulate',
    payload: { from: '584141111111', text: 'Gasté 20$ en insumos y cobré 50$ en bolívares por Pago Móvil' },
  });
  const body = res.json();
  assert.equal(res.statusCode, 200);
  assert.equal(body.intent, 'registrar_transacciones');
  assert.equal(body.transactions.length, 2);

  const [gasto, cobro] = body.transactions;
  assert.equal(gasto.type, 'egreso');
  assert.equal(gasto.category_slug, 'insumos');
  assert.equal(gasto.amount_ves, 800);

  assert.equal(cobro.type, 'ingreso');
  assert.equal(cobro.currency, 'USD');
  assert.equal(cobro.settlement_currency, 'VES');
  assert.equal(cobro.payment_method, 'pago_movil');
  assert.equal(cobro.amount_ves, 2000);
  assert.match(body.reply, /Anotado/);
});

test('nota de voz simulada + resumen del día', async () => {
  await app.inject({
    method: 'POST', url: '/dev/simulate',
    payload: { from: '584142222222', type: 'audio', simulated_transcription: 'vendí 30 dólares en efectivo' },
  });
  const res = await app.inject({ method: 'POST', url: '/dev/simulate', payload: { from: '584142222222', text: 'resumen de hoy' } });
  const body = res.json();
  assert.equal(body.intent, 'consultar_resumen');
  assert.equal(body.summary.ingresos_usd, 30);
});

test('idempotencia: el mismo wa_message_id no se registra dos veces', async () => {
  const payload = { from: '584143333333', text: 'gasté 5$ en empaques', wa_message_id: 'wamid.REPETIDO' };
  await app.inject({ method: 'POST', url: '/dev/simulate', payload });
  const res = await app.inject({ method: 'POST', url: '/dev/simulate', payload });
  assert.equal(res.json().status, 'duplicado');
});

test('webhook: verificación GET y rechazo de firma inválida', async () => {
  const ok = await app.inject({ method: 'GET', url: '/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=token-prueba&hub.challenge=123' });
  assert.equal(ok.body, '123');

  const bad = await app.inject({ method: 'POST', url: '/webhook/whatsapp', payload: { entry: [] }, headers: { 'x-hub-signature-256': 'sha256=00' } });
  assert.equal(bad.statusCode, 401);

  const raw = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
  const sig = 'sha256=' + createHmac('sha256', 'secreto-de-prueba').update(raw).digest('hex');
  const good = await app.inject({ method: 'POST', url: '/webhook/whatsapp', payload: raw, headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig } });
  assert.equal(good.statusCode, 200);
});

test('calculadora de precio blindado vía API', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/pricing/calculate', payload: { replacement_cost: 120, pack_units: 10, margin_pct: 40 } });
  const p = res.json();
  assert.equal(p.cost_usd, 12);
  assert.equal(p.price_usd, 20);
  assert.equal(p.price_ves, 800);
});
