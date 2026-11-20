// Autenticación sin contraseña: OTP de 6 dígitos por WhatsApp o PIN personal + tokens HMAC-SHA256.
import { createHash, createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

const secret = () => config.dashboard.token || 'dev-secret';
const b64url = (v) => Buffer.from(v).toString('base64url');

/**
 * Normaliza un número venezolano o internacional a E.164 sin '+':
 *  - "0412-187 7195" → "584121877195"
 *  - "+58 412 1877195" → "584121877195"
 */
export function normalizePhone(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('04')) digits = `58${digits.slice(1)}`;
  else if (digits.length === 10 && digits.startsWith('4')) digits = `58${digits}`;
  if (!/^\d{10,15}$/.test(digits)) return null;
  return digits;
}

export function generateOtp() {
  return String(randomInt(100000, 1000000));
}

export function hashOtp(phone, code) {
  return createHash('sha256').update(`${phone}:${code}:${secret()}`).digest('hex');
}

export function hashPin(pin) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(String(pin), salt, 32).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPin(pin, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const got = scryptSync(String(pin), salt, 32);
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export function signSessionToken(user, ttlDays = 30) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    sub: user.id,
    phone: user.whatsapp_phone,
    exp: Math.floor(Date.now() / 1000) + ttlDays * 86400,
  }));
  const sig = createHmac('sha256', secret()).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = createHmac('sha256', secret()).update(`${header}.${payload}`).digest();
  const received = Buffer.from(sig, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.sub || !data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}
