// Gamificación: XP, niveles, racha diaria y medallas.

import { diasEntre } from './modelo.js';

// ---------- Niveles ----------

/** XP necesarios para pasar del nivel n al n+1 (curva creciente). */
export const xpParaSubir = (n) => Math.round(80 * Math.pow(n, 1.4) + 40);

export function nivelDe(xp) {
  let nivel = 1, resto = Math.max(0, Math.floor(xp || 0));
  while (resto >= xpParaSubir(nivel)) { resto -= xpParaSubir(nivel); nivel++; }
  const meta = xpParaSubir(nivel);
  return { nivel, enNivel: resto, meta, progreso: resto / meta };
}

// ---------- XP ----------

export const XP_MODO = { tarjeta: 4, test: 5, articulo: 5, escribir: 12, verbos: 15 };

/** XP de una respuesta: más en modos difíciles y palabras problemáticas, con bonus por aciertos seguidos. */
export function xpDeRespuesta({ modo, acierto, calificacion = 3, problematica = false, combo = 0 }) {
  if (!acierto) return 0;
  let xp = XP_MODO[modo] ?? 5;
  if (calificacion === 4) xp += 2;
  if (problematica) xp = Math.round(xp * 1.5);
  xp += Math.min(5, Math.floor(combo / 5));
  return xp;
}

// ---------- Racha ----------

/** Racha que se muestra hoy: se mantiene si el último día activo fue hoy o ayer. */
export function rachaVigente(global, hoy) {
  if (!global.ultimoDiaActivo) return 0;
  return diasEntre(global.ultimoDiaActivo, hoy) <= 1 ? global.rachaActual : 0;
}

/** Llamar cuando el día alcanza el objetivo. Devuelve true si la racha ha avanzado. */
export function sumarDiaDeRacha(global, hoy) {
  if (global.ultimoDiaActivo === hoy) return false;
  const seguido = global.ultimoDiaActivo && diasEntre(global.ultimoDiaActivo, hoy) === 1;
  global.rachaActual = seguido ? global.rachaActual + 1 : 1;
  global.rachaMaxima = Math.max(global.rachaMaxima || 0, global.rachaActual);
  global.ultimoDiaActivo = hoy;
  return true;
}

// ---------- Medallas ----------

export const MEDALLAS = [
  { id: 'primera', icono: '🌱', nombre: 'Primer paso', desc: 'Responde tu primera pregunta', ok: (c) => c.global.totalRespuestas >= 1 },
  { id: 'resp500', icono: '💪', nombre: 'Constancia', desc: '500 respuestas', ok: (c) => c.global.totalRespuestas >= 500 },
  { id: 'resp5000', icono: '🏋️', nombre: 'Incansable', desc: '5000 respuestas', ok: (c) => c.global.totalRespuestas >= 5000 },
  { id: 'dom10', icono: '🎯', nombre: 'Diez en el bolsillo', desc: '10 palabras dominadas', ok: (c) => c.dominadas >= 10 },
  { id: 'dom100', icono: '🏅', nombre: 'Centenario', desc: '100 palabras dominadas', ok: (c) => c.dominadas >= 100 },
  { id: 'dom500', icono: '🏆', nombre: 'Medio millar', desc: '500 palabras dominadas', ok: (c) => c.dominadas >= 500 },
  { id: 'dom1000', icono: '👑', nombre: 'Wortschatzkönig', desc: '1000 palabras dominadas', ok: (c) => c.dominadas >= 1000 },
  { id: 'racha3', icono: '🔥', nombre: 'En marcha', desc: '3 días de racha', ok: (c) => c.global.rachaMaxima >= 3 },
  { id: 'racha7', icono: '🔥', nombre: 'Semana redonda', desc: '7 días de racha', ok: (c) => c.global.rachaMaxima >= 7 },
  { id: 'racha30', icono: '🌋', nombre: 'Imparable', desc: '30 días de racha', ok: (c) => c.global.rachaMaxima >= 30 },
  { id: 'leccion', icono: '📗', nombre: 'Lección completa', desc: 'Domina todas las palabras de una lección', ok: (c) => c.leccionesCompletas >= 1 },
  { id: 'combo20', icono: '⚡', nombre: 'En racha', desc: '20 aciertos seguidos', ok: (c) => c.global.comboMax >= 20 },
  { id: 'crono15', icono: '⏱️', nombre: 'Rapidísimo', desc: '15 puntos en Contrarreloj', ok: (c) => c.global.recordContrarreloj >= 15 },
  { id: 'reto1', icono: '🎖️', nombre: 'Reto superado', desc: 'Completa un reto semanal', ok: (c) => c.global.retosCompletados >= 1 },
  { id: 'reto10', icono: '🥇', nombre: 'Coleccionista de retos', desc: 'Completa 10 retos semanales', ok: (c) => c.global.retosCompletados >= 10 },
  { id: 'nivel5', icono: '⭐', nombre: 'Nivel 5', desc: 'Alcanza el nivel 5', ok: (c) => nivelDe(c.global.xp).nivel >= 5 },
  { id: 'nivel10', icono: '🌟', nombre: 'Nivel 10', desc: 'Alcanza el nivel 10', ok: (c) => nivelDe(c.global.xp).nivel >= 10 },
];

/** Concede las medallas que se cumplan y devuelve las recién ganadas. c: { global, dominadas, leccionesCompletas } */
export function comprobarMedallas(c, ahora = Date.now()) {
  const nuevas = [];
  for (const m of MEDALLAS) {
    if (!c.global.medallas[m.id] && m.ok(c)) { c.global.medallas[m.id] = ahora; nuevas.push(m); }
  }
  return nuevas;
}
