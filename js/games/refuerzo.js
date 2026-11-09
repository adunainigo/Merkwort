// Modo Refuerzo: sesión solo con palabras problemáticas, parejas que se confunden
// (ejercicio de contraste) y, si hay un patrón de error con los artículos, sustantivos de esos géneros.

import { mem } from '../db.js';
import { claveEstado, dirsDe, esProblematicoEstado } from '../modelo.js';
import { recuperabilidad } from '../srs.js';
import { resumenGlobal, confusionesFrecuentes, patronArticulos, sustantivosDeGenero } from '../history.js';
import { modoPara, separar } from '../scheduler.js';
import { toast } from '../ui.js';
import { ejecutarSesion } from './sesion.js';

/** Construye los elementos de la sesión de refuerzo (función separada para poder probarla). */
export function armarRefuerzo({ maximo = 20, ahora = Date.now() } = {}) {
  const items = [], ya = new Set();
  const meter = (it) => { const k = claveEstado(it.palabraId, it.dir) + (it.contraste || ''); if (!ya.has(k)) { ya.add(k); items.push(it); } };

  // 1. Palabras problemáticas, en la dirección que falla, de menor a mayor recuperabilidad.
  const probl = [];
  for (const id of resumenGlobal().problematicas) {
    const p = mem.palabras.get(id);
    for (const dir of dirsDe(p)) {
      const e = mem.estados.get(claveEstado(id, dir));
      if (esProblematicoEstado(e)) probl.push({ palabraId: id, dir, origen: 'refuerzo', tema: p.tema, raiz: p.de.slice(0, 5), r: recuperabilidad(e, ahora), modo: modoPara(dir, e) });
    }
  }
  probl.sort((a, b) => a.r - b.r).slice(0, Math.max(6, maximo - 8)).forEach(meter);

  // 2. Parejas que se confunden a menudo: salen juntas, cada una con la otra entre las opciones.
  const contraste = [];
  for (const c of confusionesFrecuentes(2).slice(0, 4)) {
    const dir = mem.estados.has(claveEstado(c.correcta.id, 'es-de')) ? 'es-de' : 'de-es';
    contraste.push({ palabraId: c.correcta.id, dir, modo: 'test', origen: 'contraste', contraste: c.puesta.id, fijo: true });
    contraste.push({ palabraId: c.puesta.id, dir, modo: 'test', origen: 'contraste', contraste: c.correcta.id, fijo: true });
  }

  // 3. Patrón de error con los artículos (p. ej. die/das).
  const patron = patronArticulos();
  const articulos = patron
    ? sustantivosDeGenero([patron.a, patron.b], 6, ahora).map((p) => ({ palabraId: p.id, dir: 'articulo', modo: 'articulo', origen: 'refuerzo', tema: p.tema, raiz: p.de.slice(0, 5), fijo: true }))
    : [];

  const base = separar([...items, ...articulos.filter((a) => !ya.has(claveEstado(a.palabraId, a.dir)))]);
  // Las parejas de contraste van seguidas, intercaladas tras el primer tercio.
  const corte = Math.min(base.length, Math.ceil(base.length / 3));
  return [...base.slice(0, corte), ...contraste, ...base.slice(corte)].slice(0, maximo + contraste.length);
}

export function iniciar() {
  const items = armarRefuerzo();
  if (!items.length) { toast('🎉 No tienes palabras problemáticas ahora mismo'); return Promise.resolve(null); }
  return ejecutarSesion({ titulo: 'Refuerzo', items, modoJuego: 'refuerzo' });
}
