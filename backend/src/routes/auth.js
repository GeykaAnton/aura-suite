// Rutas de autenticación por WhatsApp (código de 6 dígitos → token de sesión).
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config.js';
import { sendText } from '../services/whatsapp.js';
import { generateOtp, hashOtp, hashPin, normalizePhone, signSessionToken, verifyPin } from '../services/auth.js';

/** @param {import('fastify').FastifyInstance} app */
export default async function authRoutes(app, { repo }) {
  const expected = Buffer.from(config.dashboard.token);

  app.addHook('onRequest', async (req, reply) => {
    const got = Buffer.from(String(req.headers['x-dashboard-token'] ?? ''));
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) {
      return reply.code(401).send({ error: 'No autorizado' });
    }
  });

  app.post('/api/auth/request-code', async (req, reply) => {
    const phone = normalizePhone(req.body?.phone);
    if (!phone) return reply.code(400).send({ error: 'Escribe un número de WhatsApp válido (ej: 0412 1877195).' });

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await repo.createLoginCode(phone, hashOtp(phone, code), expiresAt);

    try {
      await sendText(phone, `🔐 Tu código para entrar a *Aura Suite* es: *${code}*\n\nVálido por 10 minutos.`, req.log);
    } catch (err) {
      req.log.warn({ err, phone }, 'No se pudo enviar código OTP por WhatsApp');
      return reply.code(502).send({
        error: 'No pude enviar el código a ese WhatsApp. Verifica el número o asegúrate de que esté agregado en Meta si estás en modo prueba.',
      });
    }

    return { ok: true, phone };
  });

  app.post('/api/auth/verify-code', async (req, reply) => {
    const phone = normalizePhone(req.body?.phone);
    const code = String(req.body?.code ?? '').trim();
    if (!phone || !/^\d{6}$/.test(code)) {
      return reply.code(400).send({ error: 'Ingresa tu número y el código de 6 dígitos.' });
    }

    const ok = await repo.verifyLoginCode(phone, hashOtp(phone, code));
    if (!ok) return reply.code(401).send({ error: 'Código incorrecto o vencido. Pide uno nuevo.' });

    const user = await repo.findOrCreateUser(phone);
    const token = signSessionToken(user);
    return {
      token,
      user: {
        id: user.id,
        phone: user.whatsapp_phone,
        display_name: user.display_name,
        business_name: user.business_name,
      },
    };
  });

  app.post('/api/auth/pin-status', async (req, reply) => {
    const phone = normalizePhone(req.body?.phone);
    if (!phone) return reply.code(400).send({ error: 'Escribe un número de WhatsApp válido (ej: 0412 1877195).' });
    const user = await repo.findUserByPhone(phone);
    return { phone, hasPin: Boolean(user?.pin_hash) };
  });

  app.post('/api/auth/login-pin', async (req, reply) => {
    const phone = normalizePhone(req.body?.phone);
    const pin = String(req.body?.pin ?? '').trim();
    if (!phone || !/^\d{4,8}$/.test(pin)) {
      return reply.code(400).send({ error: 'Ingresa tu número y un PIN de 4 a 8 dígitos.' });
    }

    const user = await repo.findOrCreateUser(phone);
    if (!user.pin_hash) {
      await repo.setUserPin(user.id, hashPin(pin));
    } else if (!verifyPin(pin, user.pin_hash)) {
      return reply.code(401).send({ error: 'PIN incorrecto. Intenta de nuevo.' });
    }

    const token = signSessionToken(user);
    return {
      token,
      user: {
        id: user.id,
        phone: user.whatsapp_phone,
        display_name: user.display_name,
        business_name: user.business_name,
      },
    };
  });
}
