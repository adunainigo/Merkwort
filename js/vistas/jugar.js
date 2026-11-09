// Pantalla Jugar: todos los modos de juego, con filtros opcionales para la sesión.

import { mem } from '../db.js';
import { h, filtrosComunes, nav } from '../ui.js';
import { resumenGlobal } from '../history.js';
import { repasoDeHoy } from '../games/sesion.js';
import * as tarjetas from '../games/tarjetas.js';
import * as test from '../games/test.js';
import * as escribir from '../games/escribir.js';
import * as articulos from '../games/articulos.js';
import * as contrarreloj from '../games/contrarreloj.js';
import * as verbos from '../games/verbos.js';
import * as refuerzo from '../games/refuerzo.js';

export const MODOS = [
  { id: 'tarjetas', ico: '🃏', nom: 'Tarjetas', des: 'Gira la tarjeta y evalúate', ir: (f) => tarjetas.iniciar(f) },
  { id: 'test', ico: '✅', nom: 'Test', des: 'Cuatro opciones, en ambas direcciones', ir: (f) => test.iniciar(f) },
  { id: 'escribir', ico: '✍️', nom: 'Escribir', des: 'Escribe la palabra en alemán', ir: (f) => escribir.iniciar(f) },
  { id: 'articulos', ico: '🎨', nom: 'Der · Die · Das', des: 'Toca el artículo correcto', ir: (f) => articulos.iniciar(f) },
  { id: 'contrarreloj', ico: '⏱️', nom: 'Contrarreloj', des: '60 segundos de preguntas mezcladas', ir: (f) => contrarreloj.iniciar(f) },
  { id: 'verbos', ico: '🔀', nom: 'Verbos irregulares', des: 'Presente y perfecto: fährt, ist gefahren', ir: (f) => verbos.iniciar(f) },
  { id: 'refuerzo', ico: '🩹', nom: 'Refuerzo', des: 'Tus palabras problemáticas y confusiones', ir: () => refuerzo.iniciar() },
];

/** Filtros de sesión; se conservan mientras la app esté abierta. */
export const filtros = {};

export function render(cont) {
  const hayFiltros = () => Object.keys(filtros).length > 0;
  const soloProbl = h('button', {
    class: 'btn' + (filtros.soloProblematicas ? ' primario' : ' borde'), style: { minHeight: '40px', borderRadius: '99px', flex: 'none', fontSize: '14px', padding: '6px 14px' },
    onclick: () => { if (filtros.soloProblematicas) delete filtros.soloProblematicas; else filtros.soloProblematicas = true; nav.refrescar(); },
  }, '⚠️ Solo problemáticas');
  const r = resumenGlobal();

  cont.appendChild(h('div', null,
    h('h1', { class: 'titulo' }, 'Jugar'),
    h('div', { class: 'filtros' }, filtrosComunes(filtros, () => nav.refrescar()), soloProbl),
    hayFiltros() ? h('div', { class: 'fila entre', style: { marginBottom: '8px' } },
      h('span', { class: 'gris peq' }, 'Los filtros se aplican a la sesión'),
      h('button', { class: 'enlace', onclick: () => { for (const k of Object.keys(filtros)) delete filtros[k]; nav.refrescar(); } }, 'Quitar filtros')) : null,
    h('button', { class: 'modo modo-fila', onclick: () => repasoDeHoy({ ...filtros }) },
      h('span', { class: 'ico', style: { background: 'linear-gradient(135deg,var(--primario),var(--primario-2))' } }, '📅'),
      h('span', { class: 'crece' }, h('div', { class: 'nom' }, hayFiltros() ? 'Repaso con filtros' : 'Repaso de hoy'), h('div', { class: 'des' }, 'Lo que toca según tu historial, con preguntas mezcladas'))),
    MODOS.map((m) => h('button', { class: 'modo modo-fila', onclick: () => m.ir({ ...filtros }) },
      h('span', { class: 'ico' }, m.ico),
      h('span', { class: 'crece' }, h('div', { class: 'nom' }, m.nom), h('div', { class: 'des' }, m.des)),
      m.id === 'refuerzo' && r.problematicas.length ? h('span', { class: 'chip problematica' }, r.problematicas.length) : null,
      m.id === 'contrarreloj' && mem.global.recordContrarreloj ? h('span', { class: 'chip' }, '🏆 ' + mem.global.recordContrarreloj) : null)),
  ));
}
