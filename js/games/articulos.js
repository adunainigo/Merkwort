// Modo Der · Die · Das: aparece un sustantivo y se toca su artículo.

import { mem } from '../db.js';
import { ARTICULOS } from '../modelo.js';
import { elegirParaModo } from '../scheduler.js';
import { h, toast } from '../ui.js';
import { ejecutarSesion } from './sesion.js';

/** Pinta el sustantivo y los tres botones. Reutilizado por Contrarreloj. */
export function pintarArticulo(cont, palabra, alElegir) {
  cont.appendChild(h('div', { class: 'enunciado' },
    h('div', { class: 'pista' }, '¿Der, die o das?'),
    h('div', { class: 'palabra' + (palabra.de.length > 22 ? ' larga' : '') }, palabra.de),
    h('div', { class: 'sub' }, palabra.es)));
  const fila = h('div', { class: 'articulos' });
  for (const a of ARTICULOS) {
    const b = h('button', { class: 'btn-art ' + a }, a);
    b.addEventListener('click', () => {
      if (fila.classList.contains('hecho')) return;
      fila.classList.add('hecho');
      const acierto = a === palabra.articulo;
      b.classList.add(acierto ? 'bien' : 'mal');
      if (!acierto) [...fila.children][ARTICULOS.indexOf(palabra.articulo)].classList.add('bien');
      alElegir({ acierto, articulo: a });
    });
    fila.appendChild(b);
  }
  cont.appendChild(fila);
}

export function preguntar({ cont, palabra }) {
  return new Promise((resolver) => {
    const inicio = performance.now();
    pintarArticulo(cont, palabra, ({ acierto, articulo }) => resolver({
      acierto, ms: performance.now() - inicio, articuloPuesto: articulo, respuesta: acierto ? null : articulo,
    }));
  });
}

export function iniciar(filtros = {}) {
  const items = elegirParaModo({ palabras: mem.palabras, estados: mem.estados, ahora: Date.now(), dir: 'articulo', filtros, cantidad: mem.ajustes.tamSesion })
    .map((it) => ({ ...it, modo: 'articulo' }));
  if (!items.length) { toast('No hay sustantivos con esos filtros'); return Promise.resolve(null); }
  return ejecutarSesion({ titulo: 'Der · Die · Das', items, modoJuego: 'articulos' });
}
