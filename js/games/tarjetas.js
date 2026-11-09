// Modo Tarjetas: se ve la palabra, se toca para girarla (3D) y te autoevalúas con cuatro botones.

import { mem } from '../db.js';
import { h, deConColor, toast } from '../ui.js';
import { elegirParaModo } from '../scheduler.js';
import { ejecutarSesion } from './sesion.js';

const larga = (t) => (String(t).length > 22 ? ' larga' : '');

export function preguntar({ cont, pie, item, palabra }) {
  return new Promise((resolver) => {
    const inicio = performance.now();
    const alReves = item.dir === 'es-de';
    const caraDe = () => [
      h('div', { class: 'palabra' + larga(palabra.de) }, deConColor(palabra)),
      palabra.plural ? h('div', { class: 'gris' }, 'pl. ' + palabra.plural) : null,
    ];
    const caraEs = () => [h('div', { class: 'palabra' + larga(palabra.es) }, palabra.es)];
    const detalles = [
      palabra.ejemplo ? h('div', { class: 'ejemplo' }, '„' + palabra.ejemplo.split(' | ')[0] + '“') : null,
      palabra.notas ? h('div', { class: 'notas' }, palabra.notas) : null,
    ];
    const naipe = h('div', { class: 'naipe', role: 'button', 'aria-label': 'Girar tarjeta' },
      h('div', { class: 'cara' }, h('div', { class: 'chip' }, alReves ? 'Español → alemán' : 'Alemán → español'), alReves ? caraEs() : caraDe(), h('div', { class: 'toca' }, 'Toca para girar')),
      h('div', { class: 'cara reverso' }, alReves ? caraDe() : [h('div', { class: 'gris' }, deConColor(palabra)), caraEs()], detalles));
    cont.appendChild(h('div', { class: 'escena' }, naipe));

    const notas = h('div', { class: 'notas-4' },
      [[1, 'Otra vez', 'no la sabía'], [2, 'Difícil', 'me costó'], [3, 'Bien', 'la sabía'], [4, 'Fácil', 'al instante']].map(([n, t, sub]) =>
        h('button', { class: 'nota n' + n, onclick: () => resolver({ acierto: n > 1, manual: n, ms: tiempo }) }, t, h('small', null, sub))));
    let tiempo = 0, girada = false;
    const girar = () => {
      naipe.classList.toggle('girada');
      if (girada) return;
      girada = true;
      tiempo = performance.now() - inicio;
      pie.appendChild(notas);
    };
    naipe.addEventListener('click', girar);
    pie.appendChild(h('button', { class: 'btn ancho grande', onclick: (ev) => { ev.currentTarget.remove(); girar(); } }, 'Mostrar respuesta'));
  });
}

export function iniciar(filtros = {}) {
  const items = elegirParaModo({ palabras: mem.palabras, estados: mem.estados, ahora: Date.now(), dir: 'de-es', filtros, cantidad: mem.ajustes.tamSesion })
    .map((it) => ({ ...it, modo: 'tarjeta' }));
  if (!items.length) { toast('No hay palabras con esos filtros'); return Promise.resolve(null); }
  return ejecutarSesion({ titulo: 'Tarjetas', items, modoJuego: 'tarjetas' });
}
