import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRateTable, convert, calcShieldedPrice, withEquivalents } from '../src/services/money.js';

const rates = buildRateTable(40); // 1 $ = 40 Bs

test('convierte USD ↔ VES sin errores de coma flotante', () => {
  assert.equal(convert(50, 'USD', 'VES', rates).toNumber(), 2000);
  assert.equal(convert(1000, 'VES', 'USD', rates).toNumber(), 25);
  assert.deepEqual(withEquivalents(0.1, 'USD', rates), { amount_usd: 0.1, amount_ves: 4 });
});

test('precio blindado: margen sobre precio, no markup', () => {
  const p = calcShieldedPrice({ replacementCost: 10, marginPct: 30 }, rates);
  assert.equal(p.price_usd, 14.29); // 10 / 0.7 = 14.2857 → redondeo hacia arriba
  assert.equal(p.price_ves, 572);   // 14.29 × 40 = 571.6 → 572
  assert.ok(p.effective_margin_pct >= 30);
});

test('precio blindado con comisión y colchón cambiario', () => {
  const p = calcShieldedPrice({ replacementCost: 10, marginPct: 30, feePct: 3, fxBufferPct: 5, roundVesTo: 10 }, rates);
  assert.equal(p.price_usd, 14.73);          // 10 / 0.7 / 0.97
  assert.equal(p.price_ves, 620);            // 14.73 × 40 × 1.05 = 618.66 → múltiplo de 10 superior
  assert.ok(p.profit_usd > 4);
});

test('costo en bolívares se normaliza a USD', () => {
  const p = calcShieldedPrice({ replacementCost: 400, costCurrency: 'VES', marginPct: 50 }, rates);
  assert.equal(p.cost_usd, 10);
  assert.equal(p.price_usd, 20);
});

test('rechaza márgenes imposibles', () => {
  assert.throws(() => calcShieldedPrice({ replacementCost: 10, marginPct: 100 }, rates));
});

test('precio de servicio: suma materiales + mano de obra antes del margen', () => {
  const p = calcShieldedPrice({ replacementCost: 3, laborUsd: 11, marginPct: 30 }, rates);
  assert.equal(p.cost_usd, 3);
  assert.equal(p.labor_usd, 11);
  assert.equal(p.price_usd, 20); // (3 + 11) / 0.7 = 20
});
