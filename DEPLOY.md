# 🚀 Despliegue de Aura Suite (Fase 1)

Orden recomendado (≈ 1–2 horas la primera vez):
**GitHub → Supabase → Railway → prueba de humo → Meta (WhatsApp) → prueba real.**

Costo aproximado: Supabase gratis · Railway ~$5/mes (plan Hobby) · Meta: los mensajes de respuesta en la
ventana de 24 h no se cobran · Claude ~$0,01–0,02 por mensaje · Whisper: centavos por minuto de audio.

> 🔐 Regla de oro: los secretos (tokens, contraseñas) van **solo** en las variables de entorno de Railway y en
> tu `.env` local. Nunca en el código ni en GitHub. `.env` ya está en `.gitignore`.

---

## Paso 1 · Subir el código a GitHub
1. Crea un repositorio **privado** en github.com (ej. `aura-suite`), sin README.
2. En la carpeta `aurasuite` (el repo local ya está creado con el primer commit):
   ```bash
   git remote add origin https://github.com/TU-USUARIO/aura-suite.git
   git push -u origin main
   ```

## Paso 2 · Base de datos en Supabase
1. supabase.com → **New project** → región **East US (North Virginia)** (la más cercana a Venezuela).
   Guarda la contraseña de la base de datos.
2. **Connect** (botón arriba) → pestaña *Connection string* → elige **Session pooler** y copia la URL:
   `postgresql://postgres.xxxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres`
   > ⚠️ No uses la conexión "Direct" (`db.xxxx.supabase.co`): solo funciona por IPv6 y Railway/Render no la alcanzan.
3. *Project Settings → Database → SSL Configuration* → **Download certificate** (`prod-ca-2021.crt`).
4. En tu `backend/.env` local:
   ```
   DATABASE_URL=postgresql://postgres.xxxx:TU_PASSWORD@aws-0-us-east-1.pooler.supabase.com:5432/postgres
   DATABASE_CA_CERT="-----BEGIN CERTIFICATE-----\nMIID...\n-----END CERTIFICATE-----"
   ```
   (El certificado en una sola línea con `\n` en lugar de saltos. En PowerShell:
   `(Get-Content prod-ca-2021.crt) -join '\n'` te lo da listo para copiar.)
5. Crea las tablas: `cd backend && npm run db:migrate` → debe decir `✅ Esquema aplicado (16 categorías del sistema)`.

## Paso 3 · Llaves de IA y voz
- **Claude:** console.anthropic.com → *API Keys* → crea una → `ANTHROPIC_API_KEY`. Pon un límite de gasto mensual en *Billing → Limits*.
- **Whisper:** platform.openai.com → *API keys* (`WHISPER_MODEL=whisper-1`)
  o console.groq.com (más barato: `WHISPER_API_URL=https://api.groq.com/openai/v1/audio/transcriptions`, `WHISPER_MODEL=whisper-large-v3`).

## Paso 4 · Backend en Railway
1. railway.com → *New Project* → **Deploy from GitHub repo** → elige `aura-suite`.
2. En el servicio → *Settings*:
   - **Root Directory:** `backend` (ahí está `railway.json` con build, start y health check).
   - *Networking* → **Generate Domain** → obtienes `https://aura-suite-production-xxxx.up.railway.app`.
3. *Variables* → **Raw Editor** → pega y completa:
   ```
   NODE_ENV=production
   TIMEZONE=America/Caracas
   LLM_MODE=claude
   LLM_MODEL=claude-opus-5-5
   LLM_EFFORT=low
   ANTHROPIC_API_KEY=
   TRANSCRIPTION_MODE=whisper
   WHISPER_API_URL=https://api.openai.com/v1/audio/transcriptions
   WHISPER_API_KEY=
   WHISPER_MODEL=whisper-1
   BCV_PROVIDER=dolarapi
   DATABASE_URL=
   DATABASE_CA_CERT=
   GRAPH_API_VERSION=v23.0
   WHATSAPP_VERIFY_TOKEN=
   WHATSAPP_ACCESS_TOKEN=
   WHATSAPP_PHONE_NUMBER_ID=
   WHATSAPP_APP_SECRET=
   ENABLE_DEV_ROUTES=true
   DEV_ROUTES_TOKEN=
   ```
   - `WHATSAPP_VERIFY_TOKEN` y `DEV_ROUTES_TOKEN`: invéntalos (texto largo al azar). Genera uno con
     `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`.
   - Los 3 valores de WhatsApp los obtienes en el Paso 6; mientras tanto el servidor **no arrancará a propósito**
     (en producción exige todos los secretos). Si quieres verlo arriba antes, completa primero el Paso 6.1–6.4.

> ¿Prefieres Render? Usa *New → Blueprint* con el `render.yaml` de la raíz (plan Starter, ~$7/mes).
> Evita el plan gratis: se duerme y el bot tardaría ~1 min en contestar.

## Paso 5 · Prueba de humo
Pon en tu `.env` local los mismos `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` y `DEV_ROUTES_TOKEN` y ejecuta:
```bash
npm run smoke -- https://TU-DOMINIO.up.railway.app
```
Debe salir todo en ✅. Prueba también la IA real:
```bash
curl -X POST https://TU-DOMINIO/dev/simulate -H "Content-Type: application/json" -H "x-dev-token: TU_DEV_TOKEN" \
  -d '{"from":"580000000000","text":"me cayó un pago móvil de 20 lucas de la señora Carmen por 2 tortas"}'
```

## Paso 6 · WhatsApp Cloud API (Meta)
1. developers.facebook.com → *My Apps* → **Create App** → tipo **Business** → agrega el producto **WhatsApp**.
2. *WhatsApp → API Setup*: Meta te da un **número de prueba** gratis. Agrega tu celular como destinatario de prueba.
   Copia el **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
3. **Token permanente** (el de la pantalla de API Setup vence en 24 h):
   business.facebook.com → *Configuración del negocio → Usuarios del sistema* → crea uno (Admin) →
   *Asignar activos* → tu app (control total) → **Generar token** con permisos `whatsapp_business_messaging`
   y `whatsapp_business_management` → `WHATSAPP_ACCESS_TOKEN`.
4. *App Settings → Basic* → **App Secret** → `WHATSAPP_APP_SECRET`.
5. Guarda las variables en Railway (se redespliega solo) y espera que el deploy quede verde.
6. *WhatsApp → Configuration → Webhook → Edit*:
   - Callback URL: `https://TU-DOMINIO.up.railway.app/webhook/whatsapp`
   - Verify token: tu `WHATSAPP_VERIFY_TOKEN` → **Verify and save**
   - En *Webhook fields* suscríbete a **messages**.
7. Desde tu celular escríbele al número de prueba: *"Gasté 20$ en insumos y cobré 50$ por Pago Móvil"*, y luego una nota de voz. 🎉

## Paso 7 · Cerrar la puerta de pruebas
Cuando todo funcione: en Railway pon `ENABLE_DEV_ROUTES=false`.

## Paso 8 · Número real (cuando pases a usuarias reales)
- *WhatsApp → API Setup → Add phone number*: usa un número que **no** esté activo en la app de WhatsApp
  (un chip nuevo de Movistar/Digitel sirve; recibe un SMS o llamada de verificación).
- Verifica tu negocio en Business Manager (*Seguridad → Verificación del negocio*) para quitar los límites
  de mensajes y que aparezca el nombre "Aura".
- Completa nombre visible, foto y descripción del perfil.

---

## Problemas comunes
| Síntoma | Causa probable |
|---|---|
| El deploy no arranca y los logs muestran `❌ ...obligatorio en producción` | Falta una variable: es intencional, el mensaje dice cuál. |
| `self-signed certificate in certificate chain` | Falta `DATABASE_CA_CERT` o se pegó con saltos de línea en vez de `\n`. |
| `ENETUNREACH` / `getaddrinfo` con la base de datos | Usaste la conexión Direct; cambia a **Session pooler**. |
| Meta dice "The callback URL or verify token couldn't be validated" | El token no coincide o el servidor no está arriba (`/health`). |
| El bot no responde pero el webhook da 200 | Revisa los logs en Railway: token de WhatsApp vencido (usa el del usuario del sistema) o tu celular no está en la lista de destinatarios de prueba. |
| Responde "se me enredó algo" | Los logs muestran el error real (llave de Claude o de Whisper inválida, sin saldo, etc.). |
