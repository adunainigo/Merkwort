// Niveles del curso (A2.2, B1.1…): resumen por nivel y "pasar un nivel a repaso".
// `estadosParaNivel` es pura; las funciones async guardan a través de db.js.

import { mem, guardarEstados, borrarEstados } from './db.js';
import { claveEstado, dirsDe, estadoVacio, inicioDia, sumarDias, compararNiveles, resumenPalabra, DIA } from './modelo.js';

/**
 * Parámetros de la siembra por dirección: el repaso se reparte entre el día 1 y `dias`,
 * y la estabilidad inicial es la distancia hasta ese repaso, con un tope por debajo del umbral
 * de "dominada" (21 días): la palabra solo cuenta como dominada cuando la aciertas de verdad.
 * Producir (es→de) se comprueba antes que reconocer (de→es). El reparto largo (hasta el
 * intervalo máximo) mantiene la carga en unos 20 repasos diarios más.
 */
export const SIEMBRA = {
  'de-es': { dias: 180, tope: 20 },
  'es-de': { dias: 150, tope: 15 },
  articulo: { dias: 180, tope: 18 },
  formas: { dias: 120, tope: 10 },
};

/**
 * Estados nuevos para dar por conocidas las palabras de un nivel (salvo las complejas).
 * Nunca toca direcciones que ya tengan progreso.
 * Devuelve { estados, palabras, complejas, yaEmpezadas }.
 */
export function estadosParaNivel({ palabras, estados, nivel, ahora, rand = Math.random }) {
  const out = { estados: [], palabras: 0, complejas: 0, yaEmpezadas: 0 };
  const hoy0 = inicioDia(ahora);
  for (const p of palabras.values()) {
    if (p.nivel !== nivel) continue;
    if (p.compleja) { out.complejas++; continue; }
    let nuevas = 0;
    for (const dir of dirsDe(p)) {
      const e = estados.get(claveEstado(p.id, dir));
      if (e && e.fase !== 'nueva') continue;
      const { dias, tope } = SIEMBRA[dir];
      const d = 1 + Math.floor(rand() * dias);
      out.estados.push({
        ...estadoVacio(p.id, dir), fase: 'repaso', origen: 'nivel',
        estabilidad: Math.max(1, Math.min(d, tope)), dificultad: 5,
        // Fechas de "ayer" para que no cuenten como palabras nuevas de hoy.
        ultimaRevision: ahora, primeraRevision: hoy0 - 1,
        proximaRevision: sumarDias(hoy0, d), intervalo: d,
      });
      nuevas++;
    }
    if (nuevas) out.palabras++; else out.yaEmpezadas++;
  }
  return out;
}

/** Resumen de cada nivel presente en el vocabulario, ordenado. */
export function resumenNiveles() {
  const m = new Map();
  for (const p of mem.palabras.values()) {
    const k = p.nivel || '';
    const r = m.get(k) || { nivel: k, total: 0, nuevas: 0, dominadas: 0, complejas: 0, sembradas: 0, sinEmpezarFacil: 0 };
    const s = resumenPalabra(p, mem.estados);
    r.total++;
    if (s.dominada) r.dominadas++;
    if (s.fase === 'nueva') { r.nuevas++; if (!p.compleja) r.sinEmpezarFacil++; }
    if (p.compleja) r.complejas++;
    if (dirsDe(p).some((d) => { const e = mem.estados.get(claveEstado(p.id, d)); return e && e.origen === 'nivel' && !e.repeticiones; })) r.sembradas++;
    m.set(k, r);
  }
  return [...m.values()].sort((a, b) => compararNiveles(a.nivel, b.nivel));
}

/** Pasa a repaso todas las palabras no complejas del nivel. */
export async function pasarNivelARepaso(nivel, ahora = Date.now()) {
  const r = estadosParaNivel({ palabras: mem.palabras, estados: mem.estados, nivel, ahora });
  if (r.estados.length) await guardarEstados(r.estados);
  return r;
}

/** Deshace la siembra en las direcciones que aún no se han respondido nunca. */
export async function deshacerNivel(nivel) {
  const claves = [];
  for (const e of mem.estados.values()) {
    const p = mem.palabras.get(e.palabraId);
    if (p && p.nivel === nivel && e.origen === 'nivel' && !e.repeticiones) claves.push(e.clave);
  }
  if (claves.length) await borrarEstados(claves);
  return claves.length;
}

/** Repasos por día que añade la siembra (media en el periodo de reparto). */
export function cargaEstimada(estados) {
  if (!estados.length) return 0;
  const ultimo = Math.max(...estados.map((e) => e.proximaRevision));
  const dias = Math.max(1, Math.round((ultimo - Math.min(...estados.map((e) => e.ultimaRevision))) / DIA));
  return Math.round(estados.length / dias);
}
