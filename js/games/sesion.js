// Ejecutor de sesiones: muestra las preguntas una a una, registra cada respuesta,
// repite dentro de la sesión lo que está en fase de aprendizaje y enseña el resumen final.

import { mem, estadoDe, diaDe } from '../db.js';
import { MIN, claveEstado, conArticulo, fechaLocal, formasVerbo, diferencias, NOMBRE_DIR } from '../modelo.js';
import { registrarRespuesta, aplazar } from '../history.js';
import { armarSesion, modoPara } from '../scheduler.js';
import { h, vaciar, barra, toast, confeti, vibrar, sacudir, xpFlotante, nav, claseArt } from '../ui.js';
import * as tarjetas from './tarjetas.js';
import * as test from './test.js';
import * as escribir from './escribir.js';
import * as articulos from './articulos.js';
import * as verbos from './verbos.js';

const MODOS = { tarjeta: tarjetas, test, escribir, articulo: articulos, verbos };
const ETIQUETA_ORIGEN = { nueva: '✨ Nueva', desbloqueo: '🔓 Nueva dirección', refuerzo: '🩹 Refuerzo', aprendizaje: '🔁 Otra vez', contraste: '⚖️ Contraste' };

/** Texto de la solución correcta de un elemento. */
export function solucionDe(palabra, item) {
  if (item.dir === 'de-es') return palabra.es;
  if (item.dir === 'articulo') return conArticulo(palabra);
  if (item.dir === 'formas') { const f = formasVerbo(palabra); return f ? `${f.presente}, ${f.perfecto}` : palabra.de; }
  return conArticulo(palabra);
}

/** Ayuda adicional para palabras problemáticas: artículo en color, ejemplo y notas. */
export function ayudaExtra(palabra) {
  const partes = [];
  if (palabra.articulo) partes.push(h('div', null, h('b', { class: claseArt(palabra.articulo) }, palabra.articulo), ' ', palabra.de, palabra.plural ? ` · pl. ${palabra.plural}` : ''));
  partes.push(h('div', null, '= ', palabra.es));
  if (palabra.ejemplo) partes.push(h('div', { class: 'ejemplo' }, '„' + palabra.ejemplo.split(' | ')[0] + '“'));
  if (palabra.notas) partes.push(h('div', { class: 'gris' }, palabra.notas));
  return h('div', { class: 'ayuda' }, partes);
}

/**
 * Lanza una sesión.
 * o: { titulo, items, modoJuego, masItems } — masItems() devuelve otra tanda para "Seguir".
 * Resuelve con { hechas, aciertos, fallos, xp } al cerrar.
 */
export function ejecutarSesion({ titulo = 'Sesión', items, modoJuego = 'repaso', masItems = null }) {
  return new Promise((resolver) => {
    let cola = items.slice();
    const tot = { hechas: 0, aciertos: 0, fallos: 0, xp: 0, medallas: [], retos: [], nivel: 0, aplazadas: 0 };
    let combo = 0, cerrada = false;
    const fallosSeguidos = new Map();

    const progreso = barra(0);
    const elCombo = h('div', { class: 'combo' });
    const cuerpo = h('div', { class: 'juego-cuerpo' });
    const pie = h('div', { class: 'juego-pie' });
    const el = h('section', { class: 'capa' },
      h('header', { class: 'juego-cab' },
        h('button', { class: 'btn-icono', 'aria-label': 'Cerrar', onclick: () => cerrar() }, '✕'), progreso, elCombo),
      cuerpo, pie);
    document.getElementById('capas').appendChild(el);

    function cerrar() {
      if (cerrada) return;
      cerrada = true;
      el.classList.add('saliendo');
      setTimeout(() => el.remove(), 200);
      nav.refrescar();
      resolver(tot);
    }

    function pintarCabecera() {
      const total = tot.hechas + cola.length;
      progreso.firstChild.style.width = (total ? (tot.hechas / total) * 100 : 100) + '%';
      elCombo.textContent = combo >= 3 ? `🔥 ${combo}` : '';
    }

    async function siguiente() {
      if (cerrada) return;
      vaciar(pie);
      if (!cola.length) return fin();
      const item = cola.shift();
      const palabra = mem.palabras.get(item.palabraId);
      if (!palabra) return siguiente();
      const estado = estadoDe(item.palabraId, item.dir);
      pintarCabecera();
      vaciar(cuerpo);
      const cont = h('div', { class: 'pregunta' });
      if (ETIQUETA_ORIGEN[item.origen]) cont.appendChild(h('span', { class: 'chip origen' }, ETIQUETA_ORIGEN[item.origen]));
      cuerpo.appendChild(cont);
      cuerpo.scrollTop = 0;

      const res = await MODOS[item.modo].preguntar({ cont, pie, item, palabra, estado });
      if (cerrada) return;

      const reg = await registrarRespuesta({
        palabraId: palabra.id, dir: item.dir, modo: item.modo, modoJuego, acierto: res.acierto, ms: res.ms, respuesta: res.respuesta,
        casi: res.casi, manual: res.manual, confundidaCon: res.confundidaCon, articuloPuesto: res.articuloPuesto, combo,
      });
      let xp = reg.xpTotal;
      const eventos = [reg];
      for (const extra of res.extras || []) {
        const r2 = await registrarRespuesta({ palabraId: palabra.id, modo: item.modo, modoJuego, combo, sinTiempo: true, ...extra });
        xp += r2.xpTotal;
        eventos.push(r2);
      }
      tot.hechas++; tot.xp += xp;
      if (res.acierto) { tot.aciertos++; combo++; } else { tot.fallos++; combo = 0; }
      for (const ev of eventos) {
        tot.medallas.push(...ev.medallas); tot.retos.push(...ev.retos);
        if (ev.subeNivel) tot.nivel = ev.subeNivel;
        for (const reto of ev.retos) { confeti(); toast(`🎖️ Reto completado: ${reto.texto} (+${reto.xp} XP)`, { duracion: 3500 }); }
        for (const m of ev.medallas) toast(`${m.icono} Medalla: ${m.nombre}`, { duracion: 3200 });
        if (ev.subeNivel) { confeti(40); toast(`⭐ ¡Nivel ${ev.subeNivel}!`); }
        if (ev.rachaNueva) toast(`🔥 Objetivo de hoy cumplido · racha de ${mem.global.rachaActual}`);
      }

      // Repetición dentro de la sesión mientras esté en aprendizaje.
      const e = reg.despues, clave = claveEstado(palabra.id, item.dir);
      let aplazada = false;
      if (!res.acierto) {
        const n = (fallosSeguidos.get(clave) || 0) + 1;
        fallosSeguidos.set(clave, n);
        if (n >= 3) {
          await aplazar(palabra.id, item.dir);
          cola = cola.filter((x) => !(x.palabraId === palabra.id && x.dir === item.dir));
          tot.aplazadas++; aplazada = true;
        }
      } else fallosSeguidos.delete(clave);
      const enAprendizaje = e.fase === 'aprendiendo' || e.fase === 'reaprendiendo';
      if (!aplazada && enAprendizaje && e.proximaRevision - Date.now() <= 15 * MIN && !cola.some((x) => x.palabraId === palabra.id && x.dir === item.dir)) {
        const pos = Math.min(cola.length, e.proximaRevision - Date.now() <= 2 * MIN ? 3 : 7);
        const modo = item.origen === 'libre' || item.fijo ? item.modo : modoPara(item.dir, e);
        cola.splice(pos, 0, { ...item, modo, origen: item.origen === 'libre' ? 'libre' : 'aprendizaje' });
      }
      pintarCabecera();

      if (res.acierto) vibrar(12); else { vibrar([40, 60, 40]); sacudir(cont); }
      await respuestaVisual({ item, palabra, res, reg, xp, aplazada });
      siguiente();
    }

    /** Panel inferior con el resultado. En los aciertos avanza solo; en los fallos espera a "Continuar". */
    function respuestaVisual({ item, palabra, res, reg, xp, aplazada }) {
      return new Promise((ok) => {
        if (cerrada) return ok();
        if (res.manual) { xpFlotante(xp, pie); return setTimeout(ok, 120); }
        vaciar(pie);
        const avisos = [];
        if (res.mayuscula) avisos.push(h('div', { class: 'peq' }, 'Ojo: los sustantivos van con mayúscula → ', h('b', null, palabra.de)));
        if (res.casi) avisos.push(h('div', { class: 'peq' }, 'Casi: cuidado con la diéresis → ', h('b', null, res.correcta || palabra.de)));
        if (res.avisoArticulo) avisos.push(h('div', { class: 'peq' }, 'La palabra está bien, pero el artículo es ', h('b', { class: claseArt(palabra.articulo) }, palabra.articulo)));
        let caja;
        if (res.acierto) {
          const suave = avisos.length > 0;
          caja = h('div', { class: 'respuesta ' + (suave ? 'casi' : 'bien') },
            h('div', { class: 'cab' }, h('span', null, suave ? '👍 Vale' : ['¡Muy bien!', '¡Correcto!', 'Genau!', 'Super!', 'Richtig!'][Math.floor(Math.random() * 5)]), h('span', null, xp ? `+${xp} XP` : '')),
            avisos);
          pie.appendChild(caja);
          const t = setTimeout(ok, suave ? 2200 : 800);
          caja.addEventListener('click', () => { clearTimeout(t); ok(); });
          return;
        }
        const sol = res.correcta || solucionDe(palabra, item);
        const conDif = res.respuesta && (item.modo === 'escribir' || item.modo === 'verbos') && !res.sinDiferencias;
        caja = h('div', { class: 'respuesta mal' },
          h('div', { class: 'cab' }, h('span', null, 'Respuesta correcta'), h('span', { class: 'gris peq' }, NOMBRE_DIR[item.dir] || '')),
          h('div', { class: 'sol dif' }, conDif ? diferencias(res.respuesta, sol).map((t) => (t.ok ? t.t : h('b', null, t.t))) : sol),
          res.respuesta && conDif ? h('div', { class: 'gris peq' }, 'Tú: ', res.respuesta) : null,
          res.notaFallo ? h('div', { class: 'peq' }, res.notaFallo) : null,
          reg.problematica ? ayudaExtra(palabra) : (item.dir !== 'de-es' && item.modo !== 'articulo' ? h('div', { class: 'gris peq' }, '= ' + palabra.es) : null),
          aplazada ? h('div', { class: 'ayuda' }, '😮‍💨 Tres fallos seguidos: la dejamos para mañana.') : null,
          h('button', { class: 'btn primario ancho', onclick: () => ok() }, 'Continuar'));
        pie.appendChild(caja);
      });
    }

    function fin() {
      pintarCabecera();
      vaciar(cuerpo); vaciar(pie);
      const tasa = tot.hechas ? tot.aciertos / tot.hechas : 0;
      const emoji = !tot.hechas ? '👋' : tasa >= 0.9 ? '🎉' : tasa >= 0.7 ? '💪' : '🌱';
      if (tot.hechas && tasa >= 0.9) confeti(50);
      const hoy = diaDe(fechaLocal(Date.now()));
      const botones = h('div', { style: { width: '100%' } });
      cuerpo.appendChild(h('div', { class: 'resumen-fin' },
        h('div', { class: 'emoji' }, emoji),
        h('h2', null, !tot.hechas ? 'Nada pendiente' : tasa >= 0.9 ? '¡Sesión redonda!' : '¡Sesión terminada!'),
        h('div', { class: 'rejilla', style: { width: '100%', gridTemplateColumns: 'repeat(3,1fr)' } },
          h('div', { class: 'dato' }, h('b', null, tot.aciertos), h('span', null, 'aciertos')),
          h('div', { class: 'dato' }, h('b', null, tot.fallos), h('span', null, 'fallos')),
          h('div', { class: 'dato' }, h('b', null, '+' + tot.xp), h('span', null, 'XP'))),
        h('p', { class: 'gris' }, `Hoy llevas ${hoy.repasadas} de ${mem.ajustes.objetivoDiario} respuestas.`),
        tot.aplazadas ? h('p', { class: 'gris peq' }, `${tot.aplazadas} palabra(s) se quedan para mañana.`) : null,
        tot.medallas.length ? h('p', null, tot.medallas.map((m) => `${m.icono} ${m.nombre}`).join(' · ')) : null,
        botones));
      const mas = masItems ? masItems() : [];
      if (mas.length) {
        botones.appendChild(h('button', { class: 'btn primario ancho grande', style: { marginBottom: '10px' }, onclick: () => { cola = mas; siguiente(); } }, `Seguir (${mas.length} más)`));
      }
      botones.appendChild(h('button', { class: 'btn ancho' + (mas.length ? '' : ' primario grande'), onclick: () => cerrar() }, 'Terminar'));
    }

    siguiente();
  });
}

/** "Repaso de hoy": sesión mezclada que arma el planificador. */
export function repasoDeHoy(filtros = {}) {
  const plan = () => armarSesion({
    palabras: mem.palabras, estados: mem.estados, ahora: Date.now(), ajustes: mem.ajustes,
    repasosHoy: diaDe(fechaLocal(Date.now())).maduras || 0, filtros,
  });
  const primero = plan();
  if (!primero.items.length) { toast(Object.keys(filtros).length ? 'No hay nada pendiente con esos filtros' : '🎉 ¡Todo al día! Vuelve mañana o juega a lo que quieras.'); return Promise.resolve(null); }
  return ejecutarSesion({ titulo: 'Repaso de hoy', items: primero.items, modoJuego: 'repaso', masItems: () => plan().items });
}

/** Resumen del plan de hoy para la pantalla de inicio. */
export function planDeHoy() {
  return armarSesion({
    palabras: mem.palabras, estados: mem.estados, ahora: Date.now(), ajustes: mem.ajustes,
    repasosHoy: diaDe(fechaLocal(Date.now())).maduras || 0,
  });
}
