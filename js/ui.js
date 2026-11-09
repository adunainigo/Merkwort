// Utilidades de interfaz: creación de nodos, capas, avisos, diálogos, confeti y gráficos SVG.

import { mem } from './db.js';

/** Navegación: app.js rellena estas funciones al arrancar. */
export const nav = { ir() {}, refrescar() {}, abrirFicha() {} };

const SVG_NS = 'http://www.w3.org/2000/svg';

function poner(el, attrs, hijos) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const meter = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(meter);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  hijos.forEach(meter);
  return el;
}

/** h('div', {class:'x', onclick}, hijos…) */
export const h = (tag, attrs, ...hijos) => poner(document.createElement(tag), attrs, hijos);
export const s = (tag, attrs, ...hijos) => poner(document.createElementNS(SVG_NS, tag), attrs, hijos);
export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const vaciar = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

export const pct = (x) => (x == null || Number.isNaN(x) ? '—' : Math.round(x * 100) + ' %');
export const claseArt = (a) => (a ? 'art-' + a : '');

/** Palabra alemana con el artículo en su color. */
export function deConColor(p, conArt = true) {
  if (!p.articulo || !conArt) return h('span', null, p.de);
  return h('span', null, h('span', { class: claseArt(p.articulo) }, p.articulo + ' '), p.de);
}

export function barra(valor, clase = '') {
  return h('div', { class: 'barra ' + clase }, h('i', { style: { width: Math.round(Math.max(0, Math.min(1, valor || 0)) * 100) + '%' } }));
}

// ---------- Vibración y animaciones ----------

export function vibrar(patron) {
  try { if (mem.ajustes.vibracion && navigator.vibrate) navigator.vibrate(patron); } catch (e) { /* iOS no lo soporta */ }
}

export function sacudir(el) {
  if (!el) return;
  el.classList.remove('sacude');
  void el.offsetWidth;
  el.classList.add('sacude');
}

export function confeti(cantidad = 70) {
  const cont = h('div', { class: 'confeti' });
  const colores = ['#6c4cf1', '#f06aa6', '#f5a524', '#1fa971', '#2f7fe6', '#e5484d'];
  for (let i = 0; i < cantidad; i++) {
    cont.appendChild(h('i', { style: {
      left: Math.random() * 100 + '%', background: colores[i % colores.length],
      animationDuration: 1.4 + Math.random() * 1.4 + 's', animationDelay: Math.random() * 0.4 + 's',
    } }));
    cont.lastChild.style.setProperty('--dx', (Math.random() * 160 - 80) + 'px');
    cont.lastChild.style.setProperty('--giro', (Math.random() * 900 - 450) + 'deg');
  }
  document.body.appendChild(cont);
  setTimeout(() => cont.remove(), 3400);
}

export function xpFlotante(xp, cerca) {
  if (!xp) return;
  const r = (cerca || document.body).getBoundingClientRect();
  const el = h('div', { class: 'xp-flota', style: { left: r.left + r.width / 2 - 20 + 'px', top: r.top - 6 + 'px' } }, `+${xp} XP`);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

// ---------- Avisos ----------

export function toast(mensaje, { duracion = 2600, alTocar = null } = {}) {
  const cont = $('#avisos');
  const el = h('div', { class: 'toast', role: 'status' }, mensaje);
  const quitar = () => { el.classList.add('fuera'); setTimeout(() => el.remove(), 260); };
  el.addEventListener('click', () => { if (alTocar) alTocar(); quitar(); });
  cont.appendChild(el);
  if (duracion > 0) setTimeout(quitar, duracion);
  return quitar;
}

// ---------- Capas ----------

/** Pantalla completa por encima de la app. Devuelve { el, cuerpo, cerrar }. */
export function capa({ titulo = '', lateral = false, alCerrar = null, cabecera = true } = {}) {
  const cuerpo = h('div', { class: 'capa-cuerpo' });
  const el = h('section', { class: 'capa' + (lateral ? ' lateral' : '') });
  let cerrada = false;
  const cerrar = () => {
    if (cerrada) return;
    cerrada = true;
    el.classList.add('saliendo');
    setTimeout(() => el.remove(), 200);
    if (alCerrar) alCerrar();
  };
  if (cabecera) {
    el.appendChild(h('header', { class: 'capa-cab' },
      h('button', { class: 'btn-icono', 'aria-label': 'Volver', onclick: cerrar }, lateral ? '‹' : '✕'),
      h('h2', { class: 'corta' }, titulo)));
  }
  el.appendChild(cuerpo);
  $('#capas').appendChild(el);
  return { el, cuerpo, cerrar };
}

/** Hoja inferior. Devuelve { el, cerrar }. */
export function hoja(titulo, contenido) {
  const panel = h('div', { class: 'hoja' }, titulo ? h('h3', null, titulo) : null, contenido);
  const velo = h('div', { class: 'velo' }, panel);
  const cerrar = () => velo.remove();
  velo.addEventListener('click', (ev) => { if (ev.target === velo) cerrar(); });
  document.body.appendChild(velo);
  return { el: panel, cerrar };
}

/** Diálogo de confirmación. Resuelve true/false. */
export function confirmar(titulo, texto, { ok = 'Aceptar', cancelar = 'Cancelar', peligro = false } = {}) {
  return new Promise((resolver) => {
    const fin = (v) => { velo.remove(); resolver(v); };
    const velo = h('div', { class: 'velo medio' },
      h('div', { class: 'dialogo', role: 'alertdialog' },
        h('h3', null, titulo), h('p', { class: 'gris' }, texto),
        h('div', { class: 'botones' },
          cancelar ? h('button', { class: 'btn', onclick: () => fin(false) }, cancelar) : null,
          h('button', { class: 'btn ' + (peligro ? 'peligro' : 'primario'), onclick: () => fin(true) }, ok))));
    document.body.appendChild(velo);
  });
}

export const avisar = (titulo, texto) => confirmar(titulo, texto, { cancelar: null, ok: 'Entendido' });

// ---------- Selectores de filtro ----------

/** <select> con una opción vacía ("Todas…") y la lista de valores. */
export function selector(etiqueta, valores, actual, alCambiar, { clase = 'campo' } = {}) {
  const sel = h('select', { class: clase + (actual ? ' puesto' : ''), 'aria-label': etiqueta, onchange: () => { sel.classList.toggle('puesto', !!sel.value); alCambiar(sel.value); } },
    h('option', { value: '' }, etiqueta),
    valores.map((v) => {
      const [valor, texto] = Array.isArray(v) ? v : [v, v];
      return h('option', { value: valor, selected: String(valor) === String(actual ?? '') }, texto);
    }));
  return sel;
}

/** Valores distintos de un campo del vocabulario, para los filtros. */
export function valoresDe(campo) {
  const set = new Set();
  for (const p of mem.palabras.values()) {
    const v = p[campo];
    if (Array.isArray(v)) v.forEach((x) => set.add(x)); else if (v != null && v !== '') set.add(v);
  }
  return [...set].sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'es')));
}

export const NOMBRE_TIPO = { sustantivo: 'Sustantivo', verbo: 'Verbo', adjetivo: 'Adjetivo', adverbio: 'Adverbio', expresion: 'Expresión', otro: 'Otro' };

/** Fila de filtros comunes (lección, tema, tipo, etiqueta). `f` se modifica en el sitio. */
export function filtrosComunes(f, alCambiar) {
  const set = (k) => (v) => { if (v === '') delete f[k]; else f[k] = v; alCambiar(); };
  return [
    selector('Lección', valoresDe('lektion').map((l) => [l, 'Lektion ' + l]), f.lektion, set('lektion')),
    selector('Tema', valoresDe('tema'), f.tema, set('tema')),
    selector('Tipo', valoresDe('tipo').map((t) => [t, NOMBRE_TIPO[t] || t]), f.tipo, set('tipo')),
    selector('Etiqueta', valoresDe('etiquetas'), f.etiqueta, set('etiqueta')),
  ];
}

// ---------- Gráficos SVG ----------

/** Barras apiladas de aciertos (verde) y fallos (rojo) por día. datos: [{ etiqueta, ok, mal }] */
export function graficoBarras(datos, { alto = 120 } = {}) {
  const ancho = 320, base = alto - 16, max = Math.max(4, ...datos.map((d) => d.ok + d.mal));
  const paso = ancho / datos.length, w = Math.max(3, paso * 0.7);
  const g = s('svg', { class: 'grafico', viewBox: `0 0 ${ancho} ${alto}`, role: 'img', 'aria-label': 'Aciertos y fallos por día' });
  g.appendChild(s('line', { x1: 0, x2: ancho, y1: base + 0.5, y2: base + 0.5, stroke: 'var(--borde)' }));
  datos.forEach((d, i) => {
    const x = i * paso + (paso - w) / 2;
    const hOk = (d.ok / max) * (base - 6), hMal = (d.mal / max) * (base - 6);
    if (d.ok) g.appendChild(s('rect', { x, y: base - hOk, width: w, height: hOk, rx: 2, fill: 'var(--ok)' }));
    if (d.mal) g.appendChild(s('rect', { x, y: base - hOk - hMal, width: w, height: hMal, rx: 2, fill: 'var(--mal)' }));
    if (d.etiqueta) g.appendChild(s('text', { x: x + w / 2, y: alto - 3, 'text-anchor': 'middle' }, d.etiqueta));
  });
  g.appendChild(s('text', { x: 2, y: 9 }, String(max)));
  return g;
}

/** Barras simples con el valor encima. datos: [{ etiqueta, valor }] */
export function graficoColumnas(datos, { alto = 110, color = 'var(--primario)' } = {}) {
  const ancho = 320, base = alto - 16, max = Math.max(1, ...datos.map((d) => d.valor));
  const paso = ancho / datos.length, w = paso * 0.62;
  const g = s('svg', { class: 'grafico', viewBox: `0 0 ${ancho} ${alto}`, role: 'img' });
  datos.forEach((d, i) => {
    const x = i * paso + (paso - w) / 2, hh = Math.max(2, (d.valor / max) * (base - 18));
    g.appendChild(s('rect', { x, y: base - hh, width: w, height: hh, rx: 5, fill: color, opacity: d.valor ? 1 : 0.25 }));
    g.appendChild(s('text', { x: x + w / 2, y: base - hh - 4, 'text-anchor': 'middle', style: 'font-weight:700' }, String(d.valor)));
    g.appendChild(s('text', { x: x + w / 2, y: alto - 3, 'text-anchor': 'middle' }, d.etiqueta));
  });
  return g;
}

/** Calendario de actividad: columnas = semanas, filas = lunes…domingo. dias: Map fecha → nº de respuestas. */
export function mapaCalor(valorDe, { semanas = 18, hoy = Date.now() } = {}) {
  const lado = 14, hueco = 3, ancho = semanas * (lado + hueco) + 16, alto = 7 * (lado + hueco) + 14;
  const g = s('svg', { class: 'grafico', viewBox: `0 0 ${ancho} ${alto}`, role: 'img', 'aria-label': 'Calendario de actividad' });
  const fin = new Date(hoy); fin.setHours(12, 0, 0, 0);
  const diaSemana = (fin.getDay() + 6) % 7;
  const inicio = new Date(fin); inicio.setDate(fin.getDate() - diaSemana - (semanas - 1) * 7);
  ['L', 'X', 'V', 'D'].forEach((t, i) => g.appendChild(s('text', { x: 0, y: 14 + [0, 2, 4, 6][i] * (lado + hueco) + 11 }, t)));
  let mesPrevio = -1;
  for (let sem = 0; sem < semanas; sem++) {
    for (let d = 0; d < 7; d++) {
      const f = new Date(inicio); f.setDate(inicio.getDate() + sem * 7 + d);
      if (f > fin) continue;
      const v = valorDe(f.getTime());
      const nivel = v <= 0 ? 0 : v < 10 ? 0.3 : v < 30 ? 0.55 : v < 60 ? 0.8 : 1;
      g.appendChild(s('rect', {
        x: 16 + sem * (lado + hueco), y: 14 + d * (lado + hueco), width: lado, height: lado, rx: 4,
        fill: nivel ? 'var(--primario)' : 'var(--tarjeta-2)', opacity: nivel || 1,
      }));
      if (d === 0 && f.getMonth() !== mesPrevio) {
        mesPrevio = f.getMonth();
        g.appendChild(s('text', { x: 16 + sem * (lado + hueco), y: 9 }, f.toLocaleDateString('es-ES', { month: 'short' })));
      }
    }
  }
  return g;
}
