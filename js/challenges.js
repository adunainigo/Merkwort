// Retos semanales (lunes a domingo, hora local). Cada lunes se generan tres a partir de
// plantillas, ajustados a la actividad reciente y a los puntos débiles.

import { semanaISO } from './modelo.js';
import { leerRetos, guardarRetos, todosRetos } from './db.js';

const redondear = (n, paso = 5) => Math.max(paso, Math.round(n / paso) * paso);

/**
 * Plantillas. `peso(ctx)` indica cuánto conviene el reto (0 = no aplica);
 * `crear(ctx)` devuelve { meta, texto, xp, base }.
 * ctx: { repasosSemana, dominadasSemana, problematicas, tasaArticulos, sustantivosVistos,
 *        tasaEsDe, escritasSemana, record, xpSemana, diasActivos, vistas }
 */
export const PLANTILLAS = [
  {
    tipo: 'repasos', evento: 'respuesta', icono: '📚', peso: () => 2,
    crear: (c) => { const meta = redondear(Math.max(60, c.repasosSemana * 1.15), 10); return { meta, texto: `Responde ${meta} preguntas`, xp: 80 }; },
  },
  {
    tipo: 'dominar', evento: 'dominada', icono: '🎯', peso: (c) => (c.vistas >= 10 ? 3 : 0),
    crear: (c) => { const meta = redondear(Math.min(40, Math.max(5, c.dominadasSemana * 1.2))); return { meta, texto: `Domina ${meta} palabras`, xp: 120 }; },
  },
  {
    tipo: 'problematicas', evento: 'problematicaResuelta', icono: '🩹', peso: (c) => (c.problematicas >= 3 ? 4 + Math.min(4, c.problematicas / 5) : 0),
    crear: (c) => { const meta = Math.max(3, Math.min(10, Math.round(c.problematicas / 2))); return { meta, texto: `Saca ${meta} palabras de la lista de problemáticas`, xp: 120 }; },
  },
  {
    tipo: 'articulos', evento: 'articuloOk', icono: '🎨',
    peso: (c) => (c.sustantivosVistos < 5 ? 0 : c.tasaArticulos != null && c.tasaArticulos < 0.8 ? 5 : 2),
    crear: (c) => { const meta = c.tasaArticulos != null && c.tasaArticulos < 0.8 ? 40 : 30; return { meta, texto: `Acierta ${meta} artículos en Der · Die · Das`, xp: 90 }; },
  },
  {
    tipo: 'escribir', evento: 'escritaOk', icono: '✍️',
    peso: (c) => (c.vistas < 10 ? 0 : c.tasaEsDe != null && c.tasaEsDe < 0.75 ? 5 : 2),
    crear: (c) => { const meta = redondear(Math.max(20, c.escritasSemana * 1.2)); return { meta, texto: `Escribe bien ${meta} palabras en alemán`, xp: 110 }; },
  },
  {
    tipo: 'racha', evento: 'diaCumplido', icono: '🔥', peso: (c) => (c.diasActivos < 5 ? 4 : 2),
    crear: (c) => { const meta = Math.min(7, Math.max(3, c.diasActivos + 1)); return { meta, texto: `Cumple tu objetivo diario ${meta} días`, xp: 100 }; },
  },
  {
    tipo: 'record', evento: 'contrarreloj', icono: '⏱️', peso: (c) => (c.vistas >= 15 ? 2 : 0),
    crear: (c) => (c.record > 0
      ? { meta: c.record + 1, texto: `Supera tu récord en Contrarreloj (${c.record})`, xp: 100, maximo: true }
      : { meta: 8, texto: 'Consigue 8 puntos en Contrarreloj', xp: 80, maximo: true }),
  },
  {
    tipo: 'xp', evento: 'xp', icono: '✨', peso: () => 1.5,
    crear: (c) => { const meta = redondear(Math.max(300, c.xpSemana * 1.1), 50); return { meta, texto: `Gana ${meta} XP`, xp: 70 }; },
  },
];

/** Elige tres retos distintos, con más probabilidad para los que atacan puntos débiles. */
export function generarRetos(ctx, rand = Math.random) {
  const c = {
    repasosSemana: 0, dominadasSemana: 0, problematicas: 0, tasaArticulos: null, sustantivosVistos: 0,
    tasaEsDe: null, escritasSemana: 0, record: 0, xpSemana: 0, diasActivos: 0, vistas: 0, ...ctx,
  };
  const candidatas = PLANTILLAS.map((p) => ({ p, peso: p.peso(c) })).filter((x) => x.peso > 0);
  const elegidas = [];
  while (elegidas.length < 3 && candidatas.length) {
    const total = candidatas.reduce((s, x) => s + x.peso, 0);
    let tiro = rand() * total, i = 0;
    while (i < candidatas.length - 1 && tiro >= candidatas[i].peso) { tiro -= candidatas[i].peso; i++; }
    elegidas.push(candidatas.splice(i, 1)[0].p);
  }
  return elegidas.map((p) => ({ tipo: p.tipo, evento: p.evento, icono: p.icono, progreso: 0, completado: false, ...p.crear(c) }));
}

/**
 * Aplica un evento a los retos de la semana. Los retos `maximo` guardan el mejor valor;
 * el resto acumulan. Devuelve los retos que se acaban de completar.
 */
export function aplicarEvento(semana, evento, cantidad = 1, ahora = Date.now()) {
  const hechos = [];
  for (const r of semana.retos) {
    if (r.completado || r.evento !== evento) continue;
    r.progreso = r.maximo ? Math.max(r.progreso, cantidad) : r.progreso + cantidad;
    if (r.progreso >= r.meta) { r.progreso = r.meta; r.completado = true; r.fecha = ahora; hechos.push(r); }
  }
  return hechos;
}

// ---------- Persistencia ----------

let actual = null;

export const semanaActual = () => actual;

/** Carga los retos de esta semana o los genera si es la primera vez que se abre desde el lunes. */
export async function asegurarSemana(ctxFn, ahora = Date.now()) {
  const semana = semanaISO(ahora);
  if (actual && actual.semana === semana) return actual;
  actual = await leerRetos(semana);
  if (!actual) {
    actual = { semana, creado: ahora, retos: generarRetos(ctxFn()) };
    await guardarRetos(actual);
  }
  return actual;
}

export const olvidarSemana = () => { actual = null; };

/** Registra varios eventos [{evento, cantidad}] y devuelve los retos completados. */
export async function registrarEventos(eventos, ahora = Date.now()) {
  if (!actual || actual.semana !== semanaISO(ahora)) return [];
  const hechos = [];
  let cambio = false;
  for (const ev of eventos) {
    const antes = actual.retos.map((r) => r.progreso).join();
    hechos.push(...aplicarEvento(actual, ev.evento, ev.cantidad ?? 1, ahora));
    if (antes !== actual.retos.map((r) => r.progreso).join()) cambio = true;
  }
  if (cambio) await guardarRetos(actual);
  return hechos;
}

export async function semanasAnteriores() {
  const todas = await todosRetos();
  return todas.sort((a, b) => (a.semana < b.semana ? 1 : -1));
}
