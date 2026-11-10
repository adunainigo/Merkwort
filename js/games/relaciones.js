// Juegos de sinónimos y antónimos.
// · Sinónimos: un tablero con 3–4 grupos mezclados; seleccionas las palabras que significan lo mismo.
// · Antónimos: dos columnas; tocas una palabra y luego su contrario.
// Cada ronda son 3 tableros. Las palabras de tu vocabulario que ya has empezado registran
// la respuesta en el historial (dirección de→es, modo "relacion").

import { estadoDe } from '../db.js';
import { registrarRespuesta, registrarTablero } from '../history.js';
import { relacionesEnriquecidas, pesoRelacion, tableroSinonimos, tableroAntonimos } from '../relaciones.js';
import { h, vaciar, barra, toast, confeti, vibrar, sacudir, nav } from '../ui.js';

const TABLEROS = 3;
const COLORES = ['g1', 'g2', 'g3', 'g4'];

const barajar = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/** Palabras de la relación que cuentan para el historial (de tu vocabulario y ya empezadas). */
const registrables = (ws) => ws.filter((w) => w.palabraId && estadoDe(w.palabraId, 'de-es').fase !== 'nueva');

function ficha(w, { pistas }) {
  return h('button', { class: 'ficha-rel' + (w.palabraId ? ' mia' : ''), type: 'button' },
    h('span', { class: 'de' }, w.de),
    h('span', { class: 'es' + (pistas() ? '' : ' oculta') }, w.es || ''));
}

/**
 * Lanza el juego. tipo: 'sinonimos' | 'antonimos'.
 */
export function iniciar(tipo, filtros = {}) {
  const rels = relacionesEnriquecidas().filter((r) => r.tipo === tipo);
  const peso = (r) => pesoRelacion(r, { filtros });
  const construir = () => (tipo === 'sinonimos' ? tableroSinonimos(rels, { grupos: 4, peso }) : tableroAntonimos(rels, { parejas: 5, peso }));
  const prueba = construir();
  if (prueba.length < (tipo === 'sinonimos' ? 2 : 3)) {
    toast(rels.length ? 'No hay suficientes palabras relacionadas con esos filtros' : 'Todavía no hay sinónimos ni antónimos cargados');
    return Promise.resolve(null);
  }

  return new Promise((resolver) => {
    const tot = { tableros: 0, errores: 0, xp: 0 };
    let n = 0, cerrada = false, pistasUsadas = false;
    const progreso = barra(0);
    const info = h('div', { class: 'combo' });
    const cuerpo = h('div', { class: 'juego-cuerpo' });
    const pie = h('div', { class: 'juego-pie' });
    const el = h('section', { class: 'capa' },
      h('header', { class: 'juego-cab' }, h('button', { class: 'btn-icono', 'aria-label': 'Cerrar', onclick: () => cerrar() }, '✕'), progreso, info),
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

    /** Registra el resultado de las palabras de un grupo/pareja ya resuelto. */
    async function registrar(ws, dudosas) {
      for (const w of registrables(ws)) {
        const acierto = !dudosas.has(w.de);
        const r = await registrarRespuesta({ palabraId: w.palabraId, dir: 'de-es', modo: 'relacion', modoJuego: tipo, acierto, sinTiempo: true, casi: acierto && pistasUsadas });
        tot.xp += r.xpTotal;
        for (const reto of r.retos) { confeti(); toast(`🎖️ Reto completado: ${reto.texto} (+${reto.xp} XP)`, { duracion: 3500 }); }
        for (const m of r.medallas) toast(`${m.icono} Medalla: ${m.nombre}`, { duracion: 3200 });
      }
    }

    async function tableroHecho(errores) {
      tot.tableros++;
      const retos = await registrarTablero({ errores });
      tot.xp += errores ? 8 : 15;
      for (const reto of retos) { tot.xp += reto.xp; confeti(); toast(`🎖️ Reto completado: ${reto.texto} (+${reto.xp} XP)`, { duracion: 3500 }); }
      vibrar(20);
      if (!errores) confeti(40);
      vaciar(pie);
      const ultimo = n >= TABLEROS;
      pie.appendChild(h('div', { class: 'respuesta bien' },
        h('div', { class: 'cab' }, h('span', null, errores ? `¡Resuelto! (${errores} ${errores === 1 ? 'error' : 'errores'})` : '¡Perfecto, sin errores!'), h('span', null, `+${errores ? 8 : 15} XP`)),
        h('button', { class: 'btn primario ancho', onclick: () => (ultimo ? fin() : siguiente()) }, ultimo ? 'Ver resumen' : 'Siguiente tablero')));
    }

    function cabecera(errores) {
      progreso.firstChild.style.width = (n / TABLEROS) * 100 + '%';
      info.textContent = errores ? '✗ ' + errores : '';
    }

    function botonPistas(alCambiar) {
      const b = h('button', { class: 'btn borde', type: 'button', style: { minHeight: '44px', flex: 1 } }, '👀 Ver traducción');
      b.addEventListener('click', () => {
        const visible = !b.dataset.visible;
        b.dataset.visible = visible ? '1' : '';
        if (visible) pistasUsadas = true; // con pista, los aciertos cuentan como "Difícil"
        b.textContent = visible ? '🙈 Ocultar traducción' : '👀 Ver traducción';
        alCambiar(visible);
      });
      return b;
    }

    // ---------- Sinónimos ----------
    function jugarSinonimos(grupos) {
      let errores = 0, verPistas = false, resueltos = 0;
      const dudosas = new Set();
      const sel = new Set();
      const zonaHechos = h('div', { class: 'grupos-hechos' });
      const rejilla = h('div', { class: 'rejilla-rel' });
      const fichas = [];
      grupos.forEach((g, gi) => g.miembros.forEach((w) => fichas.push({ w, gi })));
      const comprobar = h('button', { class: 'btn primario', type: 'button', style: { flex: 1.4 }, disabled: true }, 'Comprobar');
      const nombres = h('p', { class: 'gris peq centro' }, `Agrupa las palabras que significan lo mismo · ${grupos.length} grupos de 2 o 3`);

      const pintarFichas = () => {
        vaciar(rejilla);
        for (const f of fichas) {
          if (f.hecha) continue;
          const b = ficha(f.w, { pistas: () => verPistas });
          b.classList.toggle('elegida', sel.has(f));
          b.addEventListener('click', () => {
            if (sel.has(f)) sel.delete(f); else sel.add(f);
            b.classList.toggle('elegida', sel.has(f));
            comprobar.disabled = sel.size < 2;
          });
          f.el = b;
          rejilla.appendChild(b);
        }
        comprobar.disabled = sel.size < 2;
      };

      const resolver = async (gi) => {
        const g = grupos[gi];
        for (const f of fichas) if (f.gi === gi) { f.hecha = true; sel.delete(f); }
        resueltos++;
        zonaHechos.appendChild(h('div', { class: 'grupo-hecho ' + COLORES[resueltos - 1] },
          h('div', { class: 'tit' }, '= ' + (g.rel.significado || g.miembros[0].es)),
          h('div', { class: 'ws' }, g.miembros.map((w) => h('span', null, h('b', null, w.de), h('small', null, w.es))))));
        pintarFichas();
        await registrar(g.miembros, dudosas);
        const quedan = grupos.map((_, i) => i).filter((i) => fichas.some((f) => f.gi === i && !f.hecha));
        if (quedan.length === 1) { await resolver(quedan[0]); return; }
        if (!quedan.length) { vaciar(rejilla); await tableroHecho(errores); }
      };

      comprobar.addEventListener('click', async () => {
        const elegidas = [...sel];
        if (elegidas.length < 2) return;
        const gi = elegidas[0].gi;
        const mismo = elegidas.every((f) => f.gi === gi);
        const total = fichas.filter((f) => f.gi === gi && !f.hecha).length;
        if (mismo && elegidas.length === total) { vibrar(15); await resolver(gi); return; }
        if (mismo) { toast('¡Van juntas! Pero falta alguna más de ese grupo'); return; }
        errores++; tot.errores++;
        elegidas.forEach((f) => { dudosas.add(f.w.de); sacudir(f.el); });
        vibrar([40, 60, 40]);
        cabecera(errores);
        // La pista "una de ellas sobra" ayuda a no repetir el mismo intento.
        const cuenta = {};
        elegidas.forEach((f) => { cuenta[f.gi] = (cuenta[f.gi] || 0) + 1; });
        if (elegidas.length >= 3 && Math.max(...Object.values(cuenta)) === elegidas.length - 1) toast('Casi: sobra una');
        sel.clear();
        setTimeout(pintarFichas, 400);
      });

      cuerpo.append(nombres, zonaHechos, rejilla);
      pie.appendChild(h('div', { class: 'fila', style: { gap: '10px' } },
        botonPistas((v) => { verPistas = v; pintarFichas(); }),
        comprobar));
      fichas.splice(0, fichas.length, ...barajar(fichas));
      pintarFichas();
    }

    // ---------- Antónimos ----------
    function jugarAntonimos(parejas) {
      let errores = 0, verPistas = false, hechas = 0, elegida = null;
      const dudosas = new Set();
      const izq = h('div', { class: 'columna-rel' }), der = h('div', { class: 'columna-rel' });
      const items = [];
      parejas.forEach((p, i) => { items.push({ w: p.a, i, lado: 'a' }); items.push({ w: p.b, i, lado: 'b' }); });

      const pintar = () => {
        vaciar(izq); vaciar(der);
        const lados = { a: barajarFijo(items.filter((x) => x.lado === 'a')), b: barajarFijo(items.filter((x) => x.lado === 'b')) };
        for (const lado of ['a', 'b']) {
          for (const it of lados[lado]) {
            const b = ficha(it.w, { pistas: () => verPistas || it.hecha });
            if (it.hecha) b.classList.add('hecha', COLORES[it.color % 4]);
            if (elegida === it) b.classList.add('elegida');
            b.addEventListener('click', () => tocar(it));
            it.el = b;
            (lado === 'a' ? izq : der).appendChild(b);
          }
        }
      };
      const orden = new Map();
      const barajarFijo = (lista) => {
        for (const x of lista) if (!orden.has(x)) orden.set(x, Math.random());
        return lista.slice().sort((x, y) => orden.get(x) - orden.get(y));
      };

      const tocar = async (it) => {
        if (it.hecha) return;
        if (!elegida || elegida.lado === it.lado) { elegida = elegida === it ? null : it; pintar(); return; }
        const a = elegida, b = it;
        elegida = null;
        if (a.i === b.i) {
          a.hecha = b.hecha = true; a.color = b.color = hechas; hechas++;
          vibrar(15);
          pintar();
          await registrar([a.w, b.w], dudosas);
          if (hechas === parejas.length) await tableroHecho(errores);
          return;
        }
        errores++; tot.errores++;
        // Ambas palabras quedan marcadas: no sabías el contrario de ninguna de las dos.
        dudosas.add(a.w.de); dudosas.add(b.w.de);
        sacudir(a.el); sacudir(b.el);
        vibrar([40, 60, 40]);
        cabecera(errores);
        setTimeout(pintar, 400);
      };

      cuerpo.append(h('p', { class: 'gris peq centro' }, 'Une cada palabra con su contrario'), h('div', { class: 'columnas-rel' }, izq, der));
      pie.appendChild(h('div', { class: 'fila' }, botonPistas((v) => { verPistas = v; pintar(); })));
      pintar();
    }

    function siguiente() {
      if (cerrada) return;
      n++;
      pistasUsadas = false;
      vaciar(cuerpo); vaciar(pie);
      cabecera(0);
      const tablero = n === 1 ? prueba : construir();
      cuerpo.appendChild(h('h2', { class: 'centro', style: { fontSize: '20px', fontWeight: 800, margin: '4px 0 2px' } },
        `${tipo === 'sinonimos' ? 'Sinónimos' : 'Antónimos'} · tablero ${n} de ${TABLEROS}`));
      if (tipo === 'sinonimos') jugarSinonimos(tablero); else jugarAntonimos(tablero);
    }

    function fin() {
      progreso.firstChild.style.width = '100%';
      vaciar(cuerpo); vaciar(pie);
      cuerpo.appendChild(h('div', { class: 'resumen-fin' },
        h('div', { class: 'emoji' }, tot.errores ? '🧩' : '🏆'),
        h('h2', null, tot.errores ? '¡Ronda terminada!' : '¡Ronda perfecta!'),
        h('div', { class: 'rejilla', style: { width: '100%', gridTemplateColumns: 'repeat(3,1fr)' } },
          h('div', { class: 'dato' }, h('b', null, tot.tableros), h('span', null, 'tableros')),
          h('div', { class: 'dato' }, h('b', null, tot.errores), h('span', null, 'errores')),
          h('div', { class: 'dato' }, h('b', null, '+' + tot.xp), h('span', null, 'XP'))),
        h('p', { class: 'gris peq' }, 'Las palabras de tu vocabulario que ya habías empezado actualizan su repaso.'),
        h('div', { style: { width: '100%' } },
          h('button', { class: 'btn primario ancho grande', style: { marginBottom: '10px' }, onclick: () => { cerrar(); iniciar(tipo, filtros); } }, 'Otra ronda'),
          h('button', { class: 'btn ancho', onclick: () => cerrar() }, 'Terminar'))));
    }

    siguiente();
  });
}

