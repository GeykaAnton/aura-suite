'use client';
import { useState } from 'react';

export default function WhatsappShareCard({ title = 'Mensaje listo para WhatsApp', text, subtitle }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;

  return (
    <div className="card">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={copy} className="btn-ghost text-xs">
            {copied ? '✅ ¡Copiado!' : '📋 Copiar'}
          </button>
          <a href={waUrl} target="_blank" rel="noopener noreferrer" className="btn text-xs">
            💬 Enviar por WhatsApp
          </a>
        </div>
      </div>
      <pre className="whitespace-pre-wrap rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5 font-sans text-sm leading-relaxed text-gray-800">
        {text}
      </pre>
    </div>
  );
}
