// Modo Verbos irregulares: con el infinitivo, escribir la 3.ª persona del presente y el perfecto.
// Las formas salen del campo `notas` ("er fährt, ist gefahren").

import { mem } from '../db.js';
import { compararAleman, formasVerbo } from '../modelo.js';
import { elegirParaModo } from '../scheduler.js';
import { h, sacudir, toast } from '../ui.js';
import { ejecutarSesion } from './sesion.js';
import { campoAleman, teclasAlemanas } from './escribir.js';

export function preguntar({ cont, palabra }) {
  return new Promise((resolver) => {
    const inicio = performance.now();
    const formas = formasVerbo(palabra);
    let hecho = false, activo = null;
    cont.appendChild(h('div', { class: 'enunciado' },
      h('div', { class: 'pista' }, 'Verbo irregular'),
      h('div', { class: 'palabra' }, palabra.de),
      h('div', { class: 'sub' }, palabra.es)));
    const presente = campoAleman({ placeholder: 'er/sie/es …', 'aria-label': 'Tercera persona del presente', enterkeyhint: 'next' });
    const perfecto = campoAleman({ placeholder: 'hat/ist + Partizip', 'aria-label': 'Perfecto' });
    activo = presente;
    presente.addEventListener('focus', () => { activo = presente; });
    perfecto.addEventListener('focus', () => { activo = perfecto; });
    const comprobar = () => {
      if (hecho) return;
      if (!presente.value.trim()) { sacudir(presente); presente.focus(); return; }
      if (!perfecto.value.trim()) { sacudir(perfecto); perfecto.focus(); return; }
      hecho = true;
      const quitarSujeto = (t) => t.trim().replace(/^(er|sie|es)\s+/i, '');
      const c1 = compararAleman(quitarSujeto(presente.value), formas.presente);
      const c2 = compararAleman(quitarSujeto(perfecto.value), formas.perfecto);
      presente.disabled = perfecto.disabled = true;
      presente.classList.add(c1.ok ? 'bien' : 'mal');
      perfecto.classList.add(c2.ok ? 'bien' : 'mal');
      document.activeElement && document.activeElement.blur();
      resolver({
        acierto: c1.ok && c2.ok, casi: c1.casi || c2.casi, ms: performance.now() - inicio,
        respuesta: `${quitarSujeto(presente.value)}, ${quitarSujeto(perfecto.value)}`,
        correcta: `${formas.presente}, ${formas.perfecto}`,
      });
    };
    presente.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); perfecto.focus(); } });
    perfecto.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); comprobar(); } });
    cont.append(
      h('label', { class: 'etiqueta-campo' }, 'Presente (3.ª persona)'), presente,
      h('label', { class: 'etiqueta-campo' }, 'Perfecto'), perfecto,
      teclasAlemanas(() => activo),
      h('button', { class: 'btn primario ancho grande', type: 'button', onclick: comprobar }, 'Comprobar'));
    setTimeout(() => { try { presente.focus({ preventScroll: true }); } catch (e) { /* sin foco */ } }, 250);
  });
}

export function iniciar(filtros = {}) {
  const items = elegirParaModo({ palabras: mem.palabras, estados: mem.estados, ahora: Date.now(), dir: 'formas', filtros, cantidad: 10 })
    .map((it) => ({ ...it, modo: 'verbos' }));
  if (!items.length) { toast('No hay verbos irregulares con esos filtros'); return Promise.resolve(null); }
  return ejecutarSesion({ titulo: 'Verbos irregulares', items, modoJuego: 'verbos' });
}
