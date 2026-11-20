'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState('phone'); // 'phone' | 'pin' | 'code'
  const [hasPin, setHasPin] = useState(false);
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function checkPhone(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/pin-status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Número inválido.');
      setPhone(data.phone);
      setHasPin(Boolean(data.hasPin));
      setStep('pin');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function loginPin(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/login-pin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, pin }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'PIN incorrecto.');
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function requestWhatsappCode() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/request-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'No pude enviar el código.');
      setStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Código incorrecto.');
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[75vh] max-w-md flex-col justify-center">
      <div className="card space-y-5 p-6 sm:p-7">
        <div className="text-center">
          <p className="text-3xl">🌸</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Aura Suite</h1>
          <p className="mt-1 text-sm text-gray-500">
            {step === 'phone' && 'Entra con tu número de WhatsApp para ver solo tus movimientos y metas.'}
            {step === 'pin' && (hasPin ? `Ingresa tu PIN para +${phone}.` : `Primera vez con +${phone}: crea un PIN de 4 a 6 dígitos para entrar.`)}
            {step === 'code' && `Te enviamos un código de 6 dígitos al +${phone} por WhatsApp.`}
          </p>
        </div>

        {step === 'phone' && (
          <form onSubmit={checkPhone} className="space-y-4">
            <label className="block text-xs font-medium text-gray-600">
              Tu número de WhatsApp
              <input
                className="input mt-1 text-base"
                type="tel"
                required
                placeholder="Ej: 0412 1877195"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus
              />
            </label>
            <button className="btn w-full py-2.5" disabled={busy}>
              {busy ? 'Revisando…' : 'Continuar'}
            </button>
          </form>
        )}

        {step === 'pin' && (
          <form onSubmit={loginPin} className="space-y-4">
            <label className="block text-xs font-medium text-gray-600">
              {hasPin ? 'Tu PIN' : 'Crea tu PIN (4 a 6 dígitos)'}
              <input
                className="input mt-1 text-center text-2xl font-bold tracking-[0.4em]"
                type="password"
                inputMode="numeric"
                maxLength={8}
                required
                placeholder="••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                autoFocus
              />
            </label>
            <button className="btn w-full py-2.5" disabled={busy || pin.length < 4}>
              {busy ? 'Entrando…' : hasPin ? 'Entrar a Aura Suite' : 'Crear PIN y entrar'}
            </button>
            <div className="flex flex-col gap-1.5 text-center">
              <button
                type="button"
                onClick={() => { setStep('phone'); setPin(''); setError(null); }}
                className="text-xs text-gray-500 underline"
              >
                Cambiar número
              </button>
              {hasPin && (
                <button type="button" onClick={requestWhatsappCode} disabled={busy} className="text-xs text-aura-700 underline">
                  ¿Olvidaste tu PIN? Entrar con código por WhatsApp
                </button>
              )}
            </div>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={verifyCode} className="space-y-4">
            <label className="block text-xs font-medium text-gray-600">
              Código de 6 dígitos
              <input
                className="input mt-1 text-center text-xl font-bold tracking-[0.35em]"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
              />
            </label>
            <button className="btn w-full py-2.5" disabled={busy || code.length !== 6}>
              {busy ? 'Verificando…' : 'Entrar a Aura Suite'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('pin'); setCode(''); setError(null); }}
              className="w-full text-center text-xs text-gray-500 underline"
            >
              Volver al PIN
            </button>
          </form>
        )}

        {error && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
        )}
      </div>
    </div>
  );
}
