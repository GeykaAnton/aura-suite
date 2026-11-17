// Prueba de humo contra un servidor desplegado.
//   npm run smoke -- https://tu-app.up.railway.app
// Usa WHATSAPP_VERIFY_TOKEN y WHATSAPP_APP_SECRET de tu .env (los mismos del servidor).
import { createHmac, randomUUID } from 'node:crypto';

const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
const { WHATSAPP_VERIFY_TOKEN: verifyToken, WHATSAPP_APP_SECRET: appSecret, DEV_ROUTES_TOKEN: devToken } = process.env;
let failures = 0;

async function check(name, fn) {
  try {
    const detail = await fn();
    console.log(`✅ ${name}${detail ? ` → ${detail}` : ''}`);
  } catch (err) {
    failures++;
    console.log(`❌ ${name} → ${err.message}`);
  }
}

await check('GET /health', async () => {
  const r = await fetch(`${base}/health`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return JSON.stringify(await r.json());
});

await check('GET /api/rates/bcv', async () => {
  const r = await fetch(`${base}/api/rates/bcv`);
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return `Bs. ${j.rate} (${j.effective_date}, ${j.provider}${j.stale ? ', DESACTUALIZADA' : ''})`;
});

await check('Verificación de webhook (como Meta)', async () => {
  if (!verifyToken) throw new Error('falta WHATSAPP_VERIFY_TOKEN en tu .env local');
  const r = await fetch(`${base}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=aura123`);
  const body = await r.text();
  if (body !== 'aura123') throw new Error(`HTTP ${r.status}, respuesta: ${body}`);
});

await check('Webhook rechaza firmas falsas', async () => {
  const r = await fetch(`${base}/webhook/whatsapp`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=00' }, body: '{}',
  });
  if (r.status !== 401) throw new Error(`esperaba 401, recibí ${r.status} (¿falta WHATSAPP_APP_SECRET en el servidor?)`);
});

await check('Webhook acepta firma válida (evento vacío, no envía nada)', async () => {
  if (!appSecret) throw new Error('falta WHATSAPP_APP_SECRET en tu .env local');
  const raw = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
  const sig = 'sha256=' + createHmac('sha256', appSecret).update(raw).digest('hex');
  const r = await fetch(`${base}/webhook/whatsapp`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sig }, body: raw });
  if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
});

if (devToken) {
  await check('POST /dev/simulate (registra un gasto de prueba de $1 en la BD)', async () => {
    const r = await fetch(`${base}/dev/simulate`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-token': devToken },
      body: JSON.stringify({ from: '580000000000', name: 'Prueba de humo', wa_message_id: `smoke-${randomUUID()}`, text: 'gasté 1$ en empaques' }),
    });
    const j = await r.json();
    if (j.status !== 'procesado') throw new Error(JSON.stringify(j));
    return `intent=${j.intent}, transacciones=${j.transactions.length}`;
  });
}

console.log(failures ? `\n${failures} verificación(es) fallaron.` : '\n🎉 Todo bien. Ya puedes registrar la URL en Meta.');
process.exit(failures ? 1 : 0);
