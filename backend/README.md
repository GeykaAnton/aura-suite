# Aura Suite · Backend (Fase 1)

## Arranque rápido (sin llaves, 2 minutos)

```bash
cd backend
npm install
cp .env.example .env      # en modo mock funciona tal cual
npm test                  # 10 pruebas: dinero, flujo completo, webhook
npm run dev               # http://localhost:3000
```

Simular un mensaje de WhatsApp:

```bash
curl -X POST http://localhost:3000/dev/simulate -H "Content-Type: application/json" \
  -d '{"from":"584141234567","text":"Gasté 20$ en insumos y cobré 50$ en bolívares por Pago Móvil"}'

# Nota de voz simulada (en modo mock se usa el texto como "transcripción")
curl -X POST http://localhost:3000/dev/simulate -H "Content-Type: application/json" \
  -d '{"from":"584141234567","type":"audio","simulated_transcription":"vendí 36 dólares en tortas por zelle"}'
```

Respuesta (resumida) con la tasa BCV real del 17/11/2026:

```json
{
  "status": "procesado",
  "exchange_rate": { "source": "BCV", "rate": 915.7476, "effective_date": "2026-11-17", "stale": false },
  "intent": "registrar_transacciones",
  "transactions": [
    { "type": "egreso",  "amount": 20, "currency": "USD", "settlement_currency": "USD",
      "category_slug": "insumos", "amount_usd": 20, "amount_ves": 18314.95, "rate_used": 915.7476 },
    { "type": "ingreso", "amount": 50, "currency": "USD", "settlement_currency": "VES",
      "payment_method": "pago_movil", "category_slug": "ventas", "amount_usd": 50, "amount_ves": 45787.38 }
  ],
  "reply": "✅ *¡Anotado!*\n🔴 Gasto: *$20,00* (Bs. 18.314,95) · Insumos\n🟢 Ingreso: *$50,00* (Bs. 45.787,38) vía Pago Móvil · Ventas\n\nBalance de este mensaje: *+$30,00*\nTasa BCV: Bs. 915,75"
}
```

> El parser **mock** es un conjunto de reglas para probar el flujo gratis. Para entender lenguaje natural de verdad (jerga, notas de voz desordenadas) activa Claude: `LLM_MODE=claude` + `ANTHROPIC_API_KEY`.

## Endpoints

| Método | Ruta | Uso |
|---|---|---|
| GET | `/webhook/whatsapp` | Verificación del webhook (Meta) |
| POST | `/webhook/whatsapp` | Mensajes entrantes (firma HMAC verificada) |
| POST | `/dev/simulate` | Simulador: texto, audio o payload real de Meta. Devuelve el JSON completo |
| GET | `/api/rates/bcv` | Tasa BCV del día |
| POST | `/api/pricing/calculate` | Precio blindado `{replacement_cost, pack_units, margin_pct, fee_pct, fx_buffer_pct}` |
| GET | `/health` | Estado |

## Pasar a modo real

1. **Base de datos (Supabase):** crea un proyecto, copia la *connection string* en `DATABASE_URL` y ejecuta `npm run db:migrate`.
2. **IA:** `LLM_MODE=claude`, `ANTHROPIC_API_KEY=...`. Modelo por defecto: `claude-opus-5-5` con `effort: low`, y se cambia con `LLM_MODEL`. Costo aproximado: ~$0,01–0,02 por mensaje (precio de lista: $4 por millón de tokens de entrada y $20 por millón de salida). Está activado el *fallback* automático del servidor: si el modelo declina un mensaje por error, la API lo reintenta con otro modelo.
3. **Whisper:** `TRANSCRIPTION_MODE=whisper`, `WHISPER_API_KEY`. Para Groq cambia `WHISPER_API_URL` y `WHISPER_MODEL` (ver `.env.example`).
4. **WhatsApp (Meta):**
   1. En developers.facebook.com crea una app de tipo *Business* y agrega el producto **WhatsApp**.
   2. Copia el **Phone Number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
   3. Crea un *System User* en Business Manager con permiso `whatsapp_business_messaging` y genera un token permanente → `WHATSAPP_ACCESS_TOKEN`.
   4. En *App Settings → Basic* copia el **App Secret** → `WHATSAPP_APP_SECRET`.
   5. Despliega el backend con HTTPS (Railway/Render) o, para pruebas locales, usa `ngrok http 3000`.
   6. En *WhatsApp → Configuration → Webhook* usa la URL `https://TU-DOMINIO/webhook/whatsapp` y el token `WHATSAPP_VERIFY_TOKEN`, y suscríbete al campo **messages**.
5. **Producción:** `ENABLE_DEV_ROUTES=false`.

## Decisiones de diseño importantes

- **La IA extrae, el backend calcula.** El modelo devuelve JSON validado dos veces (JSON Schema en la API y zod en el backend), y `money.js` hace las cuentas con `Decimal`.
- **Tasa congelada por transacción.** Si cambias la tasa mañana, los reportes de ayer no cambian.
- **Idempotencia.** Meta reintenta webhooks; `inbound_messages.wa_message_id` es `UNIQUE`.
- **Respuesta 200 inmediata** al webhook y procesamiento en segundo plano. En Fase 2 conviene una cola (pg-boss) para no perder mensajes si el servidor reinicia.
- **Prompt de sistema estable** (`src/ai/systemPrompt.js`): la fecha y la tasa van en el mensaje de usuario para que el prompt se pueda cachear.
- **Proveedor de tasa:** `dolarapi` (verificado hoy) con respaldo de scraping de bcv.org.ve y tasa manual. Revisa periódicamente que sigan respondiendo.
