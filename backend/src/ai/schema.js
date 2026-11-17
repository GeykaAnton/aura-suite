// ═══════════════════════════════════════════════════════════════════════
// Contrato de salida de la IA.
//   - AI_OUTPUT_JSON_SCHEMA → se envía a Claude (structured outputs): la
//     respuesta SIEMPRE es JSON válido con esta forma.
//   - AiOutputSchema (zod)  → segunda validación en nuestro lado (defensa
//     en profundidad: nunca confíes ciegamente en datos externos).
// Mantén ambos sincronizados si agregas campos.
// ═══════════════════════════════════════════════════════════════════════
import { z } from 'zod';

export const CURRENCIES = ['USD', 'VES', 'USDT', 'EUR'];
export const PAYMENT_METHODS = [
  'pago_movil', 'transferencia_bs', 'punto_de_venta', 'efectivo_bs', 'efectivo_usd',
  'zelle', 'binance_usdt', 'paypal', 'otro', 'desconocido',
];
export const INCOME_CATEGORIES = ['ventas', 'servicios', 'cobro_deuda', 'otros_ingresos'];
export const EXPENSE_CATEGORIES = [
  'insumos', 'mercancia', 'empaques', 'delivery_transporte', 'publicidad', 'servicios_basicos',
  'alquiler', 'nomina', 'comisiones', 'impuestos', 'gastos_personales', 'otros_gastos',
];
export const CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];
export const INTENTS = [
  'registrar_transacciones', 'calcular_precio', 'consultar_resumen', 'consultar_tasa', 'ayuda', 'otro',
];

const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const num = { type: 'number' };
const str = { type: 'string' };

export const AI_OUTPUT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'transactions', 'pricing', 'summary_period', 'needs_clarification', 'clarification_question', 'friendly_note'],
  properties: {
    intent: { type: 'string', enum: INTENTS },
    transactions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'type', 'amount', 'currency', 'settlement_currency', 'payment_method', 'category', 'description',
          'counterparty', 'quantity', 'unit_price', 'is_pending', 'custom_rate', 'confidence',
        ],
        properties: {
          type: { type: 'string', enum: ['ingreso', 'egreso'] },
          amount: num,                                         // monto total en la moneda de denominación
          currency: { type: 'string', enum: CURRENCIES },     // moneda en la que se EXPRESÓ el monto
          settlement_currency: { type: 'string', enum: CURRENCIES }, // moneda en la que REALMENTE se movió el dinero
          payment_method: { type: 'string', enum: PAYMENT_METHODS },
          category: { type: 'string', enum: CATEGORIES },
          description: str,
          counterparty: nullable(str),
          quantity: nullable(num),
          unit_price: nullable(num),
          is_pending: { type: 'boolean' },                     // fiado / por cobrar / por pagar
          custom_rate: nullable(num),                          // "a tasa 52" → 52
          confidence: num,                                     // 0..1
        },
      },
    },
    pricing: nullable({
      type: 'object',
      additionalProperties: false,
      required: ['product_name', 'replacement_cost', 'cost_currency', 'pack_units', 'margin_pct', 'fee_pct', 'fx_buffer_pct'],
      properties: {
        product_name: nullable(str),
        replacement_cost: num,
        cost_currency: { type: 'string', enum: CURRENCIES },
        pack_units: nullable(num),       // "la caja de 24 me cuesta 30$" → 24
        margin_pct: nullable(num),
        fee_pct: nullable(num),
        fx_buffer_pct: nullable(num),
      },
    }),
    summary_period: nullable({ type: 'string', enum: ['hoy', 'semana', 'mes'] }),
    needs_clarification: { type: 'boolean' },
    clarification_question: nullable(str),
    friendly_note: nullable(str),
  },
};

// ── Validación zod (incluye rangos que el JSON Schema de la API no soporta) ──
const Currency = z.enum(CURRENCIES);

export const AiTransactionSchema = z.object({
  type: z.enum(['ingreso', 'egreso']),
  amount: z.number().positive(),
  currency: Currency,
  settlement_currency: Currency,
  payment_method: z.enum(PAYMENT_METHODS),
  category: z.enum(CATEGORIES),
  description: z.string().max(200),
  counterparty: z.string().max(100).nullable(),
  quantity: z.number().positive().nullable(),
  unit_price: z.number().positive().nullable(),
  is_pending: z.boolean(),
  custom_rate: z.number().positive().nullable(),
  confidence: z.number().min(0).max(1),
});

export const AiOutputSchema = z.object({
  intent: z.enum(INTENTS),
  transactions: z.array(AiTransactionSchema).max(20),
  pricing: z
    .object({
      product_name: z.string().nullable(),
      replacement_cost: z.number().positive(),
      cost_currency: Currency,
      pack_units: z.number().positive().nullable(),
      margin_pct: z.number().min(0).max(95).nullable(),
      fee_pct: z.number().min(0).max(50).nullable(),
      fx_buffer_pct: z.number().min(0).max(100).nullable(),
    })
    .nullable(),
  summary_period: z.enum(['hoy', 'semana', 'mes']).nullable(),
  needs_clarification: z.boolean(),
  clarification_question: z.string().nullable(),
  friendly_note: z.string().max(300).nullable(),
});
