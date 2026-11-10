// Estadísticas: resumen, previsión, actividad, puntos débiles, rankings, confusiones y medallas.
// Todo sale de los datos en memoria y de los agregados incrementales; no se recorre el historial.

import { mem, diaDe } from '../db.js';
import { DIA, fechaLocal, fechaRelativa, inicioDia, sumarDias, NOMBRE_DIR, resumenPalabra, compararNiveles, nombreLeccion } from '../modelo.js';
import { resumenNiveles } from '../niveles.js';
import { prevision } from '../scheduler.js';
import { MEDALLAS, nivelDe } from '../stats.js';
import { resumenGlobal, retencionReal, rankingProblematicas, rankingMejores, confusionesFrecuentes, patronArticulos, sumaDias } from '../history.js';
import { h, barra, pct, graficoBarras, graficoColumnas, mapaCalor, deConColor, nav, NOMBRE_TIPO } from '../ui.js';
import * as refuerzo from '../games/refuerzo.js';

function tasas(titulo, objeto, { nombre = (k) => k, orden = 'peor', max = 8, min = 3 } = {}) {
  let filas = Object.entries(objeto || {}).filter(([, v]) => v.total >= min).map(([k, v]) => ({ k, tasa: v.ok / v.total, total: v.total }));
  if (!filas.length) return null;
  if (orden === 'peor') filas.sort((a, b) => a.tasa - b.tasa); else if (orden === 'clave') filas.sort((a, b) => compararNiveles(a.k.split('|')[0], b.k.split('|')[0]) || Number(a.k.split('|').pop()) - Number(b.k.split('|').pop()));
  const total = filas.length;
  filas = filas.slice(0, max);
  return h('div', { class: 'tarjeta' },
    h('div', { class: 'fila entre', style: { marginBottom: '4px' } }, h('b', null, titulo), total > max ? h('span', { class: 'gris peq' }, `los ${max} más flojos de ${total}`) : null),
    filas.map((f) => h('div', { class: 'tasa-fila' },
      h('span', { class: 'corta' }, nombre(f.k)), barra(f.tasa, f.tasa >= 0.85 ? 'ok' : ''), h('span', { class: 'pct' }, pct(f.tasa)))));
}

export function render(cont) {
  const ahora = Date.now();
  const r = resumenGlobal();
  const ret = retencionReal(30, ahora);
  const mes = sumaDias(ahora - 29 * DIA, ahora);
  const g = mem.global;

  cont.appendChild(h('h1', { class: 'titulo' }, 'Estadísticas'));

  if (!g.totalRespuestas) {
    cont.appendChild(h('div', { class: 'aviso-caja' }, '📈', h('span', null, 'Aquí verás tu progreso en cuanto empieces a repasar.')));
  }

  // Resumen
  cont.appendChild(h('div', { class: 'rejilla-4' },
    h('div', { class: 'dato' }, h('b', null, r.nuevas), h('span', null, 'nuevas')),
    h('div', { class: 'dato' }, h('b', { style: { color: 'var(--aviso)' } }, r.aprendiendo), h('span', null, 'aprendiendo')),
    h('div', { class: 'dato' }, h('b', { style: { color: 'var(--primario)' } }, r.repaso), h('span', null, 'en repaso')),
    h('div', { class: 'dato' }, h('b', { style: { color: 'var(--ok)' } }, r.dominadas), h('span', null, 'dominadas'))));
  cont.appendChild(h('div', { class: 'tarjeta', style: { marginTop: '10px' } },
    barra(r.total ? r.dominadas / r.total : 0, 'ok'),
    h('div', { class: 'gris peq', style: { marginTop: '6px' } }, `${r.dominadas} de ${r.total} palabras dominadas (${pct(r.total ? r.dominadas / r.total : 0)})`)));
  cont.appendChild(h('div', { class: 'rejilla', style: { gridTemplateColumns: 'repeat(3,1fr)' } },
    h('div', { class: 'dato' }, h('b', null, pct(ret.tasa)), h('span', null, 'retención real 30 d')),
    h('div', { class: 'dato' }, h('b', null, mes.repasadas), h('span', null, 'respuestas 30 d')),
    h('div', { class: 'dato' }, h('b', null, Math.round(mes.ms / 60000)), h('span', null, 'minutos 30 d'))));
  cont.appendChild(h('p', { class: 'gris peq', style: { margin: '8px 4px 0' } },
    `Retención real: ${ret.total ? `${ret.ok} de ${ret.total} repasos acertados` : 'aún sin repasos de palabras aprendidas'}. Objetivo: ${pct(mem.ajustes.retencion)}. Nivel ${nivelDe(g.xp).nivel} · ${g.xp} XP · racha máxima ${g.rachaMaxima} días.`));

  // Progreso por nivel
  const niveles = resumenNiveles();
  if (niveles.length) {
    cont.appendChild(h('div', { class: 'subtitulo' }, 'Por nivel'));
    cont.appendChild(h('div', { class: 'tarjeta' }, niveles.map((n) => h('div', { class: 'tasa-fila' },
      h('span', { class: 'corta' }, h('b', null, n.nivel || 'Sin nivel'), n.nivel === mem.ajustes.nivelActual ? ' ·  actual' : ''),
      barra(n.total ? n.dominadas / n.total : 0, 'ok'),
      h('span', { class: 'pct' }, pct(n.total ? n.dominadas / n.total : 0)))),
    h('p', { class: 'gris peq', style: { marginTop: '4px' } }, 'Porcentaje de palabras dominadas de cada nivel.')));
  }

  // Previsión
  const prev = prevision(mem.estados, ahora, 7);
  cont.appendChild(h('div', { class: 'subtitulo' }, 'Repasos previstos (7 días)'));
  cont.appendChild(h('div', { class: 'tarjeta' }, graficoColumnas(prev.map((valor, i) => ({
    valor, etiqueta: i === 0 ? 'hoy' : new Date(sumarDias(ahora, i)).toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', ''),
  })))));

  // Actividad
  cont.appendChild(h('div', { class: 'subtitulo' }, 'Actividad'));
  const dias14 = [];
  for (let i = 13; i >= 0; i--) {
    const t = sumarDias(inicioDia(ahora), -i);
    const d = diaDe(fechaLocal(t));
    dias14.push({ ok: d.aciertos, mal: d.fallos, etiqueta: i % 2 === 1 ? '' : String(new Date(t).getDate()) });
  }
  cont.appendChild(h('div', { class: 'tarjeta' },
    mapaCalor((t) => diaDe(fechaLocal(t)).repasadas, { hoy: ahora }),
    h('div', { class: 'gris peq', style: { margin: '10px 0 6px' } }, 'Aciertos y fallos, últimos 14 días'),
    graficoBarras(dias14)));

  // Puntos débiles
  const ag = mem.agregados;
  const bloques = [
    tasas('Acierto por dirección', ag.porDir, { nombre: (k) => NOMBRE_DIR[k] || k, min: 1 }),
    tasas('Acierto por tipo de palabra', ag.porTipo, { nombre: (k) => NOMBRE_TIPO[k] || k }),
    tasas('Acierto por nivel', ag.porNivel, { nombre: (k) => (k === 'sin' ? 'Sin nivel' : k), orden: 'clave', min: 1 }),
    tasas('Acierto por lección', ag.porLektion, { nombre: (k) => (k.includes('|') ? nombreLeccion(k, new Set([...mem.palabras.values()].map((p) => p.nivel)).size > 1) : k === 'sin' ? 'Sin lección' : 'Lektion ' + k), orden: 'clave', max: 24 }),
    tasas('Acierto por tema', ag.porTema, { min: 5 }),
  ].filter(Boolean);
  if (bloques.length) { cont.appendChild(h('div', { class: 'subtitulo' }, 'Puntos débiles')); cont.append(...bloques); }

  const patron = patronArticulos();
  if (patron) {
    cont.appendChild(h('div', { class: 'aviso-caja' }, '🎨', h('span', null, 'Sueles confundir ',
      h('b', { class: 'art-' + patron.a }, patron.a), ' y ', h('b', { class: 'art-' + patron.b }, patron.b),
      ` (${patron.fallos} fallos, ${pct(patron.proporcion)} de tus errores de artículo). El modo Refuerzo te pondrá sustantivos de esos géneros.`)));
  }

  // Las que más fallo
  const peores = rankingProblematicas();
  cont.appendChild(h('div', { class: 'fila entre' }, h('div', { class: 'subtitulo' }, `Las que más fallo (${peores.length})`),
    peores.length ? h('button', { class: 'enlace peq', onclick: () => refuerzo.iniciar() }, 'Refuerzo ›') : null));
  cont.appendChild(h('div', { class: 'tarjeta lista-simple' }, peores.length
    ? peores.slice(0, 12).map((x) => h('button', { onclick: () => nav.abrirFicha(x.palabra.id) },
      h('span', null, '⚠️'),
      h('span', { class: 'crece', style: { flex: 1, minWidth: 0 } }, h('b', { class: 'corta' }, deConColor(x.palabra)),
        h('div', { class: 'gris peq corta' }, `${x.palabra.es} · ${x.fallos} olvidos · último fallo ${fechaRelativa(x.ultimoFallo, ahora)}`)),
      h('span', { class: 'chip problematica' }, pct(x.tasa))))
    : h('p', { class: 'gris peq' }, 'Ninguna palabra problemática. Una palabra lo es con 4 olvidos o menos del 60 % de acierto en sus últimas 10 respuestas.')));

  // Confusiones
  const conf = confusionesFrecuentes().slice(0, 8);
  if (conf.length) {
    cont.appendChild(h('div', { class: 'subtitulo' }, 'Confusiones más frecuentes'));
    cont.appendChild(h('div', { class: 'tarjeta lista-simple' }, conf.map((c) => h('button', { onclick: () => nav.abrirFicha(c.correcta.id) },
      h('span', { class: 'crece', style: { flex: 1, minWidth: 0 } },
        h('div', null, 'Sueles poner ', h('b', null, c.puesta.de), ' cuando es ', h('b', null, c.correcta.de)),
        h('div', { class: 'gris peq corta' }, `${c.puesta.es}  ≠  ${c.correcta.es}`)),
      h('span', { class: 'chip' }, '×' + c.n)))));
  }

  // Las que más acierto
  const mejores = rankingMejores(10);
  if (mejores.length) {
    cont.appendChild(h('div', { class: 'subtitulo' }, 'Las que más acierto'));
    cont.appendChild(h('div', { class: 'tarjeta lista-simple' }, mejores.map((x) => h('button', { onclick: () => nav.abrirFicha(x.palabra.id) },
      h('span', null, resumenPalabra(x.palabra, mem.estados).dominada ? '🏅' : '👍'),
      h('span', { class: 'crece', style: { flex: 1, minWidth: 0 } }, h('b', { class: 'corta' }, deConColor(x.palabra)), h('div', { class: 'gris peq corta' }, x.palabra.es)),
      h('span', { class: 'gris peq', style: { textAlign: 'right', flex: 'none' } }, `${Math.round(x.propia)} d`, h('div', null, `racha ${x.racha}`))))));
  }

  // Medallas
  cont.appendChild(h('div', { class: 'subtitulo' }, `Medallas (${Object.keys(g.medallas).length}/${MEDALLAS.length})`));
  cont.appendChild(h('div', { class: 'tarjeta' }, h('div', { class: 'medallas' }, MEDALLAS.map((m) =>
    h('div', { class: 'medalla' + (g.medallas[m.id] ? ' ganada' : ''), title: m.desc }, h('div', { class: 'ico' }, m.icono), m.nombre, h('div', { class: 'gris', style: { fontWeight: 400 } }, m.desc)))),
    g.retosCompletados ? h('p', { class: 'gris peq centro', style: { marginTop: '12px' } }, `🎖️ ${g.retosCompletados} retos semanales completados`) : null));
}
