// Repetición espaciada con FSRS-5 (Free Spaced Repetition Scheduler).
// Todo son funciones puras: reciben un estado y devuelven uno nuevo, sin tocar DOM ni base de datos.
// Para cambiar de algoritmo basta con sustituir `siguiente` y `recuperabilidad`.

import { DIA, MIN, inicioDia, sumarDias } from './modelo.js';

/** Parámetros por defecto publicados de FSRS-5. */
export const W = Object.freeze([
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192,
  1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
]);
export const DECAY = -0.5;
export const FACTOR = 19 / 81;
const S_MIN = 0.01, S_MAX = 36500;

/** Pasos (minutos) dentro de la sesión antes de pasar a intervalos de días. */
export const PASOS_APRENDER = [1, 10];
export const PASOS_REAPRENDER = [10];

export const OPCIONES = Object.freeze({ retencion: 0.9, intervaloMax: 180, fuzz: true });

const limitar = (x, a, b) => Math.min(Math.max(x, a), b);

// ---------- Fórmulas FSRS ----------

/** Probabilidad de recordar tras t días con estabilidad s. */
export const curvaOlvido = (t, s) => Math.pow(1 + (FACTOR * t) / s, DECAY);

export const estabilidadInicial = (g, w = W) => Math.max(w[g - 1], 0.1);
const dificultadBruta = (g, w) => w[4] - Math.exp((g - 1) * w[5]) + 1;
export const dificultadInicial = (g, w = W) => limitar(dificultadBruta(g, w), 1, 10);

export function siguienteDificultad(d, g, w = W) {
  const delta = -w[6] * (g - 3);
  const amortiguada = d + (delta * (10 - d)) / 9;
  return limitar(w[7] * dificultadInicial(4, w) + (1 - w[7]) * amortiguada, 1, 10);
}

export function estabilidadAcierto(d, s, r, g, w = W) {
  const dificil = g === 2 ? w[15] : 1;
  const facil = g === 4 ? w[16] : 1;
  return limitar(s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - r) * w[10]) - 1) * dificil * facil), S_MIN, S_MAX);
}

export function estabilidadOlvido(d, s, r, w = W) {
  const nueva = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]);
  const tope = s / Math.exp(w[17] * w[18]);
  return limitar(Math.min(nueva, tope), S_MIN, S_MAX);
}

/** Repaso el mismo día (pasos de aprendizaje). */
export const estabilidadCortoPlazo = (s, g, w = W) => limitar(s * Math.exp(w[17] * (g - 3 + w[18])), S_MIN, S_MAX);

/** Días hasta que la recuperabilidad baja a la retención objetivo. */
export function intervaloIdeal(s, retencion = 0.9) {
  return (s / FACTOR) * (Math.pow(retencion, 1 / DECAY) - 1);
}

function conFuzz(dias, max, rand) {
  if (dias < 3) return dias;
  const margen = Math.max(1, Math.round(dias * 0.08));
  const d = dias + Math.floor(rand() * (2 * margen + 1)) - margen;
  return limitar(d, 2, max);
}

export function intervaloDias(s, o = {}, rand = Math.random) {
  const max = o.intervaloMax ?? OPCIONES.intervaloMax;
  const dias = limitar(Math.round(intervaloIdeal(s, o.retencion ?? OPCIONES.retencion)), 1, max);
  return (o.fuzz ?? OPCIONES.fuzz) ? conFuzz(dias, max, rand) : dias;
}

// ---------- Interfaz del planificador de memoria ----------

/** Probabilidad estimada de recordar ahora (0 si la palabra es nueva). */
export function recuperabilidad(e, ahora) {
  if (!e || e.fase === 'nueva' || !e.estabilidad || !e.ultimaRevision) return 0;
  const t = Math.max(0, (ahora - e.ultimaRevision) / DIA);
  return curvaOlvido(t, e.estabilidad);
}

/**
 * Aplica una calificación (1 Otra vez, 2 Difícil, 3 Bien, 4 Fácil) y devuelve el nuevo estado.
 * o: { retencion, intervaloMax, fuzz, rand, w }
 */
export function siguiente(e, g, ahora, o = {}) {
  const w = o.w || W, rand = o.rand || Math.random;
  const n = { ...e, ultimas: [...(e.ultimas || []), g === 1 ? 0 : 1].slice(-10) };
  const fase = e.fase || 'nueva';
  n.repeticiones = (e.repeticiones || 0) + 1;
  n.ultimaRevision = ahora;
  if (!e.primeraRevision) n.primeraRevision = ahora;
  n.aciertosSeguidos = g === 1 ? 0 : (e.aciertosSeguidos || 0) + 1;
  if (g === 1) n.ultimoFallo = ahora;

  const graduar = () => {
    const dias = intervaloDias(n.estabilidad, o, rand);
    n.fase = 'repaso'; n.paso = 0; n.intervalo = dias;
    n.proximaRevision = sumarDias(inicioDia(ahora), dias);
  };
  const paso = (pasos, i) => {
    n.paso = i; n.intervalo = 0;
    let min = pasos[i];
    if (g === 2) min = i === 0 && pasos.length > 1 ? (pasos[0] + pasos[1]) / 2 : pasos[i] * 1.5;
    n.proximaRevision = ahora + min * MIN;
  };

  if (fase === 'nueva') {
    n.estabilidad = estabilidadInicial(g, w);
    n.dificultad = dificultadInicial(g, w);
    n.fallos = 0;
    if (g === 4) graduar();
    else { n.fase = 'aprendiendo'; paso(PASOS_APRENDER, g === 3 ? 1 : 0); }
  } else if (fase === 'aprendiendo' || fase === 'reaprendiendo') {
    const pasos = fase === 'aprendiendo' ? PASOS_APRENDER : PASOS_REAPRENDER;
    n.dificultad = siguienteDificultad(e.dificultad, g, w);
    n.estabilidad = estabilidadCortoPlazo(e.estabilidad, g, w);
    const actual = Math.min(e.paso || 0, pasos.length - 1);
    const i = g === 1 ? 0 : g === 2 ? actual : g === 3 ? actual + 1 : pasos.length;
    if (i >= pasos.length) graduar(); else paso(pasos, i);
  } else {
    const t = Math.max(0, (ahora - e.ultimaRevision) / DIA);
    const r = curvaOlvido(t, e.estabilidad);
    n.dificultad = siguienteDificultad(e.dificultad, g, w);
    if (g === 1) {
      n.estabilidad = estabilidadOlvido(e.dificultad, e.estabilidad, r, w);
      n.fallos = (e.fallos || 0) + 1;
      n.fase = 'reaprendiendo';
      paso(PASOS_REAPRENDER, 0);
    } else {
      n.estabilidad = estabilidadAcierto(e.dificultad, e.estabilidad, r, g, w);
      graduar();
    }
  }
  return n;
}

/** Saca una palabra atascada de la sesión: vuelve mañana. */
export function aplazarAManana(e, ahora) {
  return { ...e, proximaRevision: sumarDias(inicioDia(ahora), 1), intervalo: 1 };
}

/** Estado de una palabra marcada manualmente como sabida. */
export function estadoSabido(e, ahora, o = {}) {
  const s = Math.max(e.estabilidad || 0, 30);
  const dias = Math.min(30, o.intervaloMax ?? OPCIONES.intervaloMax);
  return {
    ...e, fase: 'repaso', estabilidad: s, dificultad: e.dificultad || 5, paso: 0, intervalo: dias,
    ultimaRevision: ahora, primeraRevision: e.primeraRevision || ahora, proximaRevision: sumarDias(inicioDia(ahora), dias),
  };
}

// ---------- Calificación automática ----------

export const MODOS_FACILES = ['test', 'articulo'];
export const MODOS_ESCRITOS = ['escribir', 'verbos'];
/** Tiempo medio de partida (ms) hasta tener datos propios. */
export const TIEMPO_BASE = { test: 5000, articulo: 3500, escribir: 12000, verbos: 20000, tarjeta: 6000 };

/**
 * Calificación 1–4 a partir del modo de juego y del tiempo de respuesta.
 * r: { acierto, modo, ms, mediaMs, casi, sinTiempo, manual }
 */
export function calificar(r) {
  if (r.manual) return limitar(r.manual, 1, 4);
  if (!r.acierto) return 1;
  if (r.casi) return 2;
  const facil = MODOS_FACILES.includes(r.modo);
  if (r.sinTiempo || !r.ms) return 3;
  const media = r.mediaMs || TIEMPO_BASE[r.modo] || 6000;
  if (r.ms > 2 * media) return 2;
  if (r.ms < 0.6 * media && !facil) return 4;
  return 3;
}
