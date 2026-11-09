// Modo Escribir: se escribe la palabra en alemán. Botones ä ö ü ß sobre el teclado,
// se aceptan ae/oe/ue/ss y, en los sustantivos, se pide también el artículo.

import { mem } from '../db.js';
import { compararAleman, claveTexto, conArticulo, ARTICULOS } from '../modelo.js';
import { elegirParaModo } from '../scheduler.js';
import { h, sacudir, toast } from '../ui.js';
import { NOMBRE_TIPO } from '../ui.js';
import { ejecutarSesion } from './sesion.js';

let indice = { version: -1, mapa: null };

/** Busca si lo escrito es otra palabra del vocabulario (para registrar confusiones). */
export function palabraEscrita(texto, exceptoId) {
  if (indice.version !== mem.version || !indice.mapa) {
    const mapa = new Map();
    for (const p of mem.palabras.values()) mapa.set(claveTexto(p.de), p.id);
    indice = { version: mem.version, mapa };
  }
  let clave = claveTexto(texto);
  let id = indice.mapa.get(clave);
  if (!id) { clave = clave.replace(/^(der|die|das) /, ''); id = indice.mapa.get(clave); }
  return id && id !== exceptoId ? id : null;
}

/** Fila de teclas ä ö ü ß que escriben en el campo activo. */
export function teclasAlemanas(campoActivo) {
  return h('div', { class: 'teclas' }, ['ä', 'ö', 'ü', 'ß'].map((c) => {
    const b = h('button', { class: 'tecla', type: 'button', 'aria-label': 'Insertar ' + c }, c);
    // pointerdown + preventDefault: el campo no pierde el foco y el teclado no se cierra.
    b.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      const campo = campoActivo();
      if (!campo || campo.disabled) return;
      const a = campo.selectionStart ?? campo.value.length, z = campo.selectionEnd ?? a;
      const letra = a === 0 && campo.dataset.mayus === '1' && c !== 'ß' ? c.toUpperCase() : c;
      campo.value = campo.value.slice(0, a) + letra + campo.value.slice(z);
      campo.focus();
      campo.setSelectionRange(a + 1, a + 1);
    });
    return b;
  }));
}

export const campoAleman = (attrs = {}) => h('input', {
  class: 'entrada-de', type: 'text', lang: 'de', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done', ...attrs,
});

export function preguntar({ cont, item, palabra }) {
  return new Promise((resolver) => {
    const inicio = performance.now();
    const pideArticulo = palabra.tipo === 'sustantivo' && ARTICULOS.includes(palabra.articulo);
    let articulo = null, hecho = false;

    cont.appendChild(h('div', { class: 'enunciado' },
      h('div', { class: 'pista' }, `Escribe en alemán · ${NOMBRE_TIPO[palabra.tipo] || ''}`),
      h('div', { class: 'palabra' + (palabra.es.length > 22 ? ' larga' : '') }, palabra.es)));

    const chips = pideArticulo ? h('div', { class: 'articulos arriba', style: { marginBottom: '10px' } },
      ARTICULOS.map((a) => h('button', { class: `btn-art peq ${a}`, type: 'button', onclick: (ev) => {
        articulo = a;
        [...chips.children].forEach((x) => x.classList.toggle('elegido', x === ev.currentTarget));
        campo.focus();
      } }, a))) : null;
    const campo = campoAleman({ placeholder: pideArticulo ? 'Sustantivo…' : 'Respuesta…', 'data-mayus': pideArticulo ? '1' : '0' });
    const comprobar = () => {
      if (hecho) return;
      const texto = campo.value.trim();
      if (!texto) { sacudir(campo); campo.focus(); return; }
      if (pideArticulo && !articulo) {
        // Si escribió el artículo delante ("der Flohmarkt"), se toma de ahí.
        const m = texto.match(/^(der|die|das)\s+(.+)$/i);
        if (m) { articulo = m[1].toLowerCase(); campo.value = m[2]; } else { sacudir(chips); toast('Elige también el artículo'); return; }
      }
      hecho = true;
      const escrito = campo.value.trim();
      const cmp = compararAleman(escrito, palabra.de, { sustantivo: palabra.tipo === 'sustantivo' });
      campo.disabled = true;
      campo.classList.add(cmp.ok ? 'bien' : 'mal');
      campo.blur();
      const res = {
        acierto: cmp.ok, casi: cmp.casi, mayuscula: cmp.mayuscula, ms: performance.now() - inicio,
        respuesta: (pideArticulo && articulo ? articulo + ' ' : '') + escrito, correcta: conArticulo(palabra),
        confundidaCon: cmp.ok ? null : palabraEscrita(escrito, palabra.id),
      };
      if (pideArticulo) {
        const bien = articulo === palabra.articulo;
        res.extras = [{ dir: 'articulo', modo: 'articulo', acierto: bien, articuloPuesto: articulo, respuesta: articulo }];
        res.avisoArticulo = cmp.ok && !bien;
        [...chips.children].forEach((x) => { if (x.textContent === palabra.articulo) x.classList.add('elegido'); });
      }
      if (res.confundidaCon) {
        const otra = mem.palabras.get(res.confundidaCon);
        res.notaFallo = `«${otra.de}» significa «${otra.es}».`;
      }
      resolver(res);
    };
    campo.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); comprobar(); } });
    const boton = h('button', { class: 'btn primario ancho grande', type: 'button', onclick: comprobar }, 'Comprobar');
    cont.append(...[chips, campo, teclasAlemanas(() => campo), boton].filter(Boolean));
    setTimeout(() => { try { campo.focus({ preventScroll: true }); } catch (e) { /* sin foco */ } }, 250);
  });
}

export function iniciar(filtros = {}) {
  const items = elegirParaModo({ palabras: mem.palabras, estados: mem.estados, ahora: Date.now(), dir: 'es-de', filtros, cantidad: 12 })
    .map((it) => ({ ...it, modo: 'escribir' }));
  if (!items.length) { toast('No hay palabras con esos filtros'); return Promise.resolve(null); }
  return ejecutarSesion({ titulo: 'Escribir', items, modoJuego: 'escribir' });
}
