# 🌸 Aura Suite

Ecosistema financiero para mujeres emprendedoras en Venezuela:

| Componente | Qué hace | Fase |
|---|---|---|
| **Aura en WhatsApp** | Registra gastos/ventas por texto o nota de voz, convierte a tasa BCV, calcula precios blindados | 1 |
| **Centro de Mando (Web)** | Finanzas, inventario, calculadora de precios, reportes PDF/Excel | 2 |
| **Copiloto de Bolsillo (PWA)** | Registro rápido en la calle, metas de ahorro | 3 |

---

## 1. Arquitectura recomendada (para una sola desarrolladora)

El criterio: **pocas piezas, todo en JavaScript, servicios gestionados, costo casi cero al inicio.**

```
            ┌──────────────┐   webhook    ┌─────────────────────────────────────────┐
 Usuaria ──►│  WhatsApp    │─────────────►│  Backend Node.js 22 + Fastify            │
  (voz/     │  Cloud API   │◄─────────────│                                          │
  texto)    │   (Meta)     │   respuesta  │  pipeline.js                             │
            └──────────────┘              │   ├─ whatsapp.js   (firma, media, envío) │
                                          │   ├─ transcription (Whisper)  ──────────►│── OpenAI / Groq
 Web App (Next.js) ──── REST /api ───────►│   ├─ bcvRate.js    (tasa + caché) ──────►│── dolarapi / bcv.org.ve
 PWA móvil       ──── REST /api ─────────►│   ├─ ai/claudeParser (extrae JSON) ─────►│── Claude API
                                          │   ├─ money.js      (CALCULA, Decimal)    │
                                          │   └─ repository.js (datos)               │
                                          └───────────────┬──────────────────────────┘
                                                          ▼
                                          PostgreSQL (Supabase) + Auth + Storage
```

| Capa | Elección | Por qué |
|---|---|---|
| Backend | **Node.js 22 + Fastify 5** (JavaScript ESM) | Un solo lenguaje en todo el stack (backend, web y PWA). Fastify es rápido y simple. |
| Base de datos | **PostgreSQL en Supabase** | `NUMERIC` exacto para dinero, plan gratis, y trae **Auth** (login web) y **Storage** (facturas, Fase 2). |
| WhatsApp | **WhatsApp Cloud API** oficial de Meta (sin intermediarios) | Sin costo de BSP, y las respuestas dentro de la ventana de 24 h que abre la usuaria no se cobran (revisa la política vigente de Meta). |
| Transcripción | **Whisper** vía API compatible con OpenAI (OpenAI `whisper-1` o Groq `whisper-large-v3`) | Se cambia de proveedor con 2 variables de entorno. |
| IA | **Claude Opus 5.5** con *structured outputs* | Devuelve JSON garantizado con el esquema; entiende bien el español coloquial. |
| Matemática | **decimal.js** en el backend | La IA **nunca** calcula dinero: extrae datos y el backend calcula. |
| Hosting backend | **Railway / Render / Fly.io** | Servidor siempre encendido (el webhook procesa en segundo plano). |
| Web + PWA | **Next.js en Vercel** (Fase 2) → la misma app como **PWA** (Fase 3) | Un solo código para escritorio y móvil. Expo/React Native solo si luego necesitas funciones nativas. |

### Retos venezolanos y cómo los resuelve el diseño

| Reto | Solución |
|---|---|
| Doble moneda (USD y Bs) | Cada transacción guarda monto original + `currency` (en qué se expresó) + `settlement_currency` (en qué entró el dinero) + tasa congelada + equivalentes USD y VES. |
| "Cobré 50$ en Bs por Pago Móvil" | `currency=USD`, `settlement_currency=VES`. El reporte en $ es real y el monto en Bs concilia con el banco. |
| La tasa cambia a diario | Tabla `exchange_rates` con histórico; el historial nunca se recalcula con la tasa de hoy. |
| bcv.org.ve se cae o falla su SSL | Proveedores en cascada → caché → última tasa conocida marcada `stale` (el bot avisa). |
| Devaluación al reponer | **Precio blindado**: costo de *reposición*, margen sobre precio, comisión y colchón cambiario. |
| Jerga ("lucas", "bolos", "palo", "fiado") | Está en el prompt de sistema. Las ventas fiadas quedan `pendiente` (por cobrar) y no cuentan como caja. |
| Conectividad inestable | WhatsApp ya es el canal que funciona con poca señal; la PWA tendrá modo offline (Fase 3). |

---

## 2. Plan de desarrollo por fases (MVP)

### Fase 1: El Núcleo (este repositorio) · ~4–6 semanas
- [x] Webhook de WhatsApp (verificación, firma HMAC, idempotencia)
- [x] Texto + notas de voz (Whisper)
- [x] Tasa BCV diaria con caché y respaldo
- [x] IA que extrae transacciones, cálculo de precios, resumen y tasa
- [x] Precio blindado (`/api/pricing/calculate`)
- [x] Esquema SQL multimoneda
- [ ] Desplegar en Railway/Render + Supabase y conectar el número real
- [ ] Comando "deshacer/corregir" (borrado lógico del último registro)
- [ ] Cola de trabajos (pg-boss) en lugar de `setImmediate`
- [ ] Onboarding por WhatsApp: nombre del negocio y margen por defecto
- [ ] Prueba con 5–10 emprendedoras reales; guardar sus mensajes (con permiso) como set de evaluación de la IA

**Criterio de salida:** 10 usuarias registran movimientos 5 días seguidos y la IA acierta en ≥95 % de los montos.

### Fase 2: Centro de Mando Web · ~6–8 semanas
- Next.js + Supabase Auth (login por código vía WhatsApp o email)
- Dashboard: ingresos/egresos en $ y Bs, por categoría, por medio de pago
- Inventario: productos con costo de reposición, stock y alertas de stock mínimo
- Calculadora de precio blindado con lista de precios exportable (para enviar a clientas)
- Cuentas por cobrar (fiados) con recordatorio por WhatsApp
- Exportar reportes PDF/Excel
- Bot: "vendí 3 tortas" → descuenta inventario

### Fase 3: Copiloto de Bolsillo (PWA) · ~4 semanas
- La web instalable como PWA, con registro rápido en 2 toques
- Modo offline (IndexedDB) con sincronización al recuperar señal
- Metas de ahorro en $ con progreso ("me faltan $120 para el horno")
- Notificaciones push: resumen diario y alertas de tasa

### Fase 4: Crecimiento
- Foto de factura → transacción (visión de Claude)
- Planes de pago (premium), multi-negocio, acceso para contadora
- Tasa paralela opcional, IGTF automático en cobros en divisas

---

## 3. Estructura del repositorio

```
aurasuite/
├── README.md                 ← este archivo (arquitectura + plan)
└── backend/
    ├── db/schema.sql         ← esquema PostgreSQL multimoneda
    ├── scripts/migrate.js
    ├── src/
    │   ├── server.js / app.js / config.js
    │   ├── routes/           ← whatsappWebhook, api, dev (simulador)
    │   ├── services/         ← pipeline, whatsapp, transcription, bcvRate, money, replyFormatter
    │   ├── ai/               ← systemPrompt, schema, claudeParser, mockParser
    │   ├── db/repository.js  ← memoria / PostgreSQL
    │   └── utils/dates.js
    └── test/                 ← node:test (dinero + flujo completo)
```

Guía de arranque local: **[backend/README.md](backend/README.md)** · Despliegue paso a paso: **[DEPLOY.md](DEPLOY.md)**.
