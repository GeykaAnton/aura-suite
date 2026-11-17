// Fechas siempre en la zona horaria de la usuaria (Venezuela = UTC-4, sin horario de verano).

/** 'YYYY-MM-DD' de hoy en la zona dada. */
export function todayInTz(timeZone = 'America/Caracas', date = new Date()) {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Inicio (UTC) del período 'hoy' | 'semana' | 'mes' en hora de Caracas (UTC-4 fijo). */
export function periodStart(period, now = new Date()) {
  const offsetMs = 4 * 60 * 60 * 1000; // Venezuela no tiene horario de verano
  const local = new Date(now.getTime() - offsetMs);
  local.setUTCHours(0, 0, 0, 0);
  if (period === 'semana') {
    const dow = (local.getUTCDay() + 6) % 7; // lunes = 0
    local.setUTCDate(local.getUTCDate() - dow);
  } else if (period === 'mes') {
    local.setUTCDate(1);
  }
  return new Date(local.getTime() + offsetMs);
}
