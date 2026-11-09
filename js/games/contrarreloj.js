// Modo Contrarreloj: 60 segundos de preguntas mezcladas con récord personal.
// Las respuestas actualizan el historial, pero el tiempo de respuesta no penaliza la calificación.

import { mem } from '../db.js';
import { barajar, claveEstado, dirsDe, conArticulo } from '../modelo.js';
import { pasaFiltros } from '../scheduler.js';
import { registrarRespuesta, registrarContrarreloj, sumarXp } from '../history.js';
import { h, vaciar, barra, toast, confeti, vibrar, sacudir, nav } from '../ui.js';
import { pintarTest } from './test.js';
import { pintarArticulo } from './articulos.js';

export const DURACION = 60;

/** Preguntas candidatas: direcciones ya empezadas; si hay pocas, cualquier palabra en de→es. */
function candidatas(filtros) {
  const vistas = [], todas = [];
  for (const p of mem.palabras.values()) {
    if (!pasaFiltros(p, filtros)) continue;
    todas.push({ palabraId: p.id, dir: 'de-es' });
    for (const dir of dirsDe(p)) {
      if (dir === 'formas') continue;
      const e = mem.estados.get(claveEstado(p.id, dir));
      if (e && e.fase !== 'nueva') vistas.push({ palabraId: p.id, dir });
    }
  }
  return vistas.length >= 20 ? barajar(vistas) : barajar([...vistas, ...barajar(todas).slice(0, 40)]);
}

export function iniciar(filtros = {}) {
  let cola = candidatas(filtros);
  if (cola.length < 4) { toast('Hacen falta más palabras para jugar'); return Promise.resolve(null); }
  return new Promise((resolver) => {
    let puntos = 0, fallos = 0, combo = 0, xp = 0, cerrada = false, fin = 0, reloj = null, enCurso = false;
    const tiempo = barra(1);
    const crono = h('div', { class: 'crono' }, String(DURACION));
    const marcador = h('div', { class: 'combo' }, '0');
    const cuerpo = h('div', { class: 'juego-cuerpo' });
    const el = h('section', { class: 'capa' },
      h('header', { class: 'juego-cab' }, h('button', { class: 'btn-icono', 'aria-label': 'Cerrar', onclick: () => cerrar() }, '✕'), tiempo, crono),
      cuerpo);
    document.getElementById('capas').appendChild(el);

    function cerrar() {
      if (cerrada) return;
      cerrada = true;
      clearInterval(reloj);
      el.classList.add('saliendo');
      setTimeout(() => el.remove(), 200);
      nav.refrescar();
      resolver({ puntos });
    }

    function portada() {
      cuerpo.appendChild(h('div', { class: 'resumen-fin' },
        h('div', { class: 'emoji' }, '⏱️'),
        h('h2', null, 'Contrarreloj'),
        h('p', { class: 'gris' }, `${DURACION} segundos. Cada acierto suma un punto.`),
        h('div', { class: 'dato', style: { minWidth: '140px' } }, h('b', null, mem.global.recordContrarreloj || 0), h('span', null, 'tu récord')),
        h('button', { class: 'btn primario ancho grande', onclick: empezar }, '¡Empezar!')));
    }

    function empezar() {
      fin = Date.now() + DURACION * 1000;
      el.querySelector('.juego-cab').appendChild(marcador);
      reloj = setInterval(() => {
        const queda = Math.max(0, fin - Date.now());
        tiempo.firstChild.style.width = (queda / (DURACION * 10)) + '%';
        crono.textContent = String(Math.ceil(queda / 1000));
        crono.classList.toggle('poco', queda < 10000);
        if (queda <= 0 && !enCurso) terminar();
      }, 100);
      siguiente();
    }

    function siguiente() {
      if (cerrada) return;
      if (Date.now() >= fin) return terminar();
      if (!cola.length) cola = candidatas(filtros);
      const item = cola.shift();
      const palabra = mem.palabras.get(item.palabraId);
      vaciar(cuerpo);
      const cont = h('div', { class: 'pregunta' });
      cuerpo.appendChild(cont);
      const responder = async ({ acierto, elegida, articulo }) => {
        enCurso = true;
        const modo = item.dir === 'articulo' ? 'articulo' : 'test';
        if (acierto) { puntos++; combo++; vibrar(10); } else { fallos++; combo = 0; vibrar([30, 40, 30]); sacudir(cont); }
        marcador.textContent = String(puntos);
        try {
          const reg = await registrarRespuesta({
            palabraId: palabra.id, dir: item.dir, modo, modoJuego: 'contrarreloj', acierto, sinTiempo: true, combo,
            articuloPuesto: articulo, confundidaCon: !acierto && elegida ? elegida.id : null,
            respuesta: acierto ? null : articulo || (elegida ? (item.dir === 'de-es' ? elegida.es : conArticulo(elegida)) : null),
          });
          xp += reg.xpTotal;
        } finally { enCurso = false; }
        setTimeout(siguiente, acierto ? 260 : 900);
      };
      if (item.dir === 'articulo') pintarArticulo(cont, palabra, responder);
      else pintarTest(cont, palabra, item.dir, responder);
    }

    async function terminar() {
      if (cerrada || !reloj) return;
      clearInterval(reloj); reloj = null;
      const anterior = mem.global.recordContrarreloj || 0;
      const r = await registrarContrarreloj(puntos);
      let bonus = 0;
      if (r.record && anterior > 0) { bonus = 30; await sumarXp(bonus); }
      if (r.record || r.retos.length) confeti();
      for (const reto of r.retos) toast(`🎖️ Reto completado: ${reto.texto} (+${reto.xp} XP)`, { duracion: 3500 });
      for (const m of r.medallas) toast(`${m.icono} Medalla: ${m.nombre}`, { duracion: 3200 });
      vaciar(cuerpo);
      marcador.remove();
      cuerpo.appendChild(h('div', { class: 'resumen-fin' },
        h('div', { class: 'emoji' }, r.record ? '🏆' : '⏱️'),
        h('h2', null, r.record ? '¡Nuevo récord!' : '¡Tiempo!'),
        h('div', { class: 'rejilla', style: { width: '100%', gridTemplateColumns: 'repeat(3,1fr)' } },
          h('div', { class: 'dato' }, h('b', null, puntos), h('span', null, 'puntos')),
          h('div', { class: 'dato' }, h('b', null, fallos), h('span', null, 'fallos')),
          h('div', { class: 'dato' }, h('b', null, '+' + (xp + bonus)), h('span', null, 'XP'))),
        h('p', { class: 'gris' }, r.record ? `Récord anterior: ${anterior}` : `Tu récord: ${mem.global.recordContrarreloj}`),
        h('div', { style: { width: '100%' } },
          h('button', { class: 'btn primario ancho grande', style: { marginBottom: '10px' }, onclick: () => { cerrar(); iniciar(filtros); } }, 'Otra partida'),
          h('button', { class: 'btn ancho', onclick: () => cerrar() }, 'Terminar'))));
    }

    portada();
  });
}
