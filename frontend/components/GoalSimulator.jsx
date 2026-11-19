'use client';
import { useState } from 'react';
import { usd } from '@/lib/format';

export default function GoalSimulator({ monthlyNetUsd = 0 }) {
  const [target, setTarget] = useState(300);
  const [saved, setSaved] = useState(50);
  const [weeks, setWeeks] = useState(8);
  const [unitProfit, setUnitProfit] = useState(5);

  const missing = Math.max(0, target - saved);
  const perWeek = weeks > 0 ? missing / weeks : missing;
  const perDay = perWeek / 7;
  const extraUnitsPerWeek = unitProfit > 0 ? Math.ceil(perWeek / unitProfit) : 0;
  const weeklyNet = monthlyNetUsd > 0 ? monthlyNetUsd / 4.3 : 0;
  const shareOfNet = weeklyNet > 0 ? Math.min(100, Math.round((perWeek / weeklyNet) * 100)) : null;

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="font-semibold text-gray-900">Simulador de metas</h2>
        <p className="text-xs text-gray-500">Mueve los controles para ver cuánto necesitas apartar o vender para lograr tu objetivo.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs text-gray-600">
          Meta total: <b>{usd(target)}</b>
          <input className="mt-1 w-full accent-aura-600" type="range" min="50" max="2000" step="25" value={target} onChange={(e) => setTarget(Number(e.target.value))} />
        </label>
        <label className="text-xs text-gray-600">
          Ya tienes ahorrado: <b>{usd(saved)}</b>
          <input className="mt-1 w-full accent-aura-600" type="range" min="0" max={target} step="10" value={Math.min(saved, target)} onChange={(e) => setSaved(Number(e.target.value))} />
        </label>
        <label className="text-xs text-gray-600">
          Plazo: <b>{weeks} semanas</b>
          <input className="mt-1 w-full accent-aura-600" type="range" min="1" max="52" step="1" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} />
        </label>
        <label className="text-xs text-gray-600">
          Ganancia por cada producto vendido: <b>{usd(unitProfit)}</b>
          <input className="mt-1 w-full accent-aura-600" type="range" min="1" max="50" step="1" value={unitProfit} onChange={(e) => setUnitProfit(Number(e.target.value))} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl bg-aura-50 p-3">
          <p className="text-xs text-gray-500">Te falta</p>
          <p className="text-lg font-bold text-aura-700">{usd(missing)}</p>
        </div>
        <div className="rounded-xl bg-stone-50 p-3">
          <p className="text-xs text-gray-500">Apartar por semana</p>
          <p className="text-lg font-bold text-gray-900">{usd(perWeek)}</p>
        </div>
        <div className="rounded-xl bg-stone-50 p-3">
          <p className="text-xs text-gray-500">Apartar por día</p>
          <p className="text-lg font-bold text-gray-900">{usd(perDay)}</p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-3">
          <p className="text-xs text-gray-500">Ventas extra / sem</p>
          <p className="text-lg font-bold text-emerald-700">{extraUnitsPerWeek} unid.</p>
        </div>
      </div>

      {shareOfNet !== null && (
        <p className="text-xs text-gray-600">
          Con tu ritmo actual (~{usd(weeklyNet)}/semana de ganancia libre), esta meta representa el <b>{shareOfNet}%</b> de tu ganancia semanal.
        </p>
      )}
    </div>
  );
}
