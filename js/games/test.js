// Modo Test: cuatro opciones, en ambas direcciones. Las opciones falsas son, a ser posible,
// del mismo tipo y tema, y se priorizan las palabras con las que se suele confundir.

import { mem } from '../db.js';
import { barajar, conArticulo } from '../modelo.js';
import { confundidasCon } from '../history.js';
import { elegirParaModo } from '../scheduler.js';
import { h, deConColor, toast } from '../ui.js';
import { ejecutarSesion } from './sesion.js';

const textoOpcion = (p, dir) => (dir === 'de-es' ? p.es : conArticulo(p));

/** Acepciones de una traducción: "terminar (estudios), acabar" → ["terminar", "acabar"]. */
export function significados(es) {
  return String(es || '').toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[,;/]/).map((x) => x.replace(/[.!?¿¡]/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** Devuelve las palabras que se muestran como opciones (la correcta incluida), ya barajadas. */
export function opcionesPara(palabra, dir, { n = 4, rand = Math.random, forzar = [] } = {}) {
  const usados = new Set([palabra.de.toLowerCase(), ...significados(palabra.es)]);
  const elegidas = [];
  const probar = (p) => {
    if (!p || p.id === palabra.id || elegidas.length >= n - 1) return;
    // Se descartan sinónimos (misma traducción) para que solo haya una opción válida.
    const claves = [p.de.toLowerCase(), ...significados(p.es)];
    if (claves.some((c) => usados.has(c))) return;
    claves.forEach((c) => usados.add(c));
    elegidas.push(p);
  };
  for (const id of [...forzar, ...confundidasCon(palabra.id)]) probar(mem.palabras.get(id));
  if (elegidas.length < n - 1) {
    const mismoTema = [], mismoTipo = [], resto = [];
    for (const p of mem.palabras.values()) {
      if (p.id === palabra.id) continue;
      if (p.tipo === palabra.tipo && p.tema === palabra.tema) mismoTema.push(p);
      else if (p.tipo === palabra.tipo) mismoTipo.push(p);
      else resto.push(p);
    }
    // Uno o dos del mismo tema y el resto del mismo tipo: parecidas pero no imposibles.
    for (const p of barajar(mismoTema, rand).slice(0, 2)) probar(p);
    for (const p of barajar(mismoTipo, rand).slice(0, 12)) probar(p);
    for (const p of barajar(mismoTema, rand)) probar(p);
    for (const p of barajar(resto, rand).slice(0, 12)) probar(p);
  }
  return barajar([palabra, ...elegidas], rand);
}

/** Pinta el enunciado y las opciones. Reutilizado por Contrarreloj. */
export function pintarTest(cont, palabra, dir, alElegir, opts = {}) {
  const opciones = opcionesPara(palabra, dir, opts);
  cont.appendChild(h('div', { class: 'enunciado' },
    h('div', { class: 'pista' }, dir === 'de-es' ? '¿Qué significa?' : '¿Cómo se dice en alemán?'),
    h('div', { class: 'palabra' + ((dir === 'de-es' ? palabra.de : palabra.es).length > 22 ? ' larga' : '') }, dir === 'de-es' ? deConColor(palabra) : palabra.es)));
  const lista = h('div', { class: 'opciones' });
  for (const op of opciones) {
    const b = h('button', { class: 'opcion' }, dir === 'de-es' ? op.es : deConColor(op));
    b.addEventListener('click', () => {
      if (lista.classList.contains('hecho')) return;
      lista.classList.add('hecho');
      const acierto = op.id === palabra.id;
      b.classList.add(acierto ? 'bien' : 'mal');
      if (!acierto) [...lista.children][opciones.indexOf(palabra)].classList.add('bien');
      alElegir({ acierto, elegida: op });
    });
    lista.appendChild(b);
  }
  cont.appendChild(lista);
}

export function preguntar({ cont, item, palabra }) {
  return new Promise((resolver) => {
    const inicio = performance.now();
    pintarTest(cont, palabra, item.dir, ({ acierto, elegida }) => {
      resolver({
        acierto, ms: performance.now() - inicio,
        respuesta: acierto ? null : (item.dir === 'de-es' ? elegida.es : conArticulo(elegida)),
        confundidaCon: acierto ? null : elegida.id,
      });
    }, { forzar: item.contraste ? [item.contraste] : [] });
  });
}

export function iniciar(filtros = {}) {
  const base = { palabras: mem.palabras, estados: mem.estados, ahora: Date.now(), filtros };
  const n = mem.ajustes.tamSesion;
  const inversas = elegirParaModo({ ...base, dir: 'es-de', cantidad: Math.floor(n / 2), permitirNuevas: false });
  const ya = new Set(inversas.map((x) => x.palabraId));
  const directas = elegirParaModo({ ...base, dir: 'de-es', cantidad: n }).filter((x) => !ya.has(x.palabraId)).slice(0, n - inversas.length);
  const items = barajar([...inversas, ...directas]).map((it) => ({ ...it, modo: 'test' }));
  if (!items.length) { toast('No hay palabras con esos filtros'); return Promise.resolve(null); }
  return ejecutarSesion({ titulo: 'Test', items, modoJuego: 'test' });
}
