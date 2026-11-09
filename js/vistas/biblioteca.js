// Biblioteca: lista de palabras con buscador y filtros. Al tocar una palabra se abre su ficha.

import { mem } from '../db.js';
import { resumenPalabra } from '../modelo.js';
import { pasaFiltros } from '../scheduler.js';
import { h, vaciar, selector, filtrosComunes, nav } from '../ui.js';

const filtros = {};
let busqueda = '';
const TANDA = 60;

const NOMBRE_FASE = { nueva: 'Nueva', aprendiendo: 'Aprendiendo', repaso: 'En repaso', dominada: 'Dominada' };

const plano = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function filtrar() {
  const q = plano(busqueda.trim());
  const out = [];
  for (const p of mem.palabras.values()) {
    if (!pasaFiltros(p, filtros)) continue;
    if (filtros.revisar && !p.revisar) continue;
    if (q && !plano(p.de).includes(q) && !plano(p.es).includes(q)) continue;
    const r = resumenPalabra(p, mem.estados);
    if (filtros.estado === 'problematica' ? !r.problematica : filtros.estado && r.fase !== filtros.estado) continue;
    out.push({ p, r });
  }
  return out;
}

export function filaPalabra(p, r, extra = null) {
  return h('button', { class: 'palabra-fila', onclick: () => nav.abrirFicha(p.id) },
    h('span', { class: 'punto ' + (p.articulo || '') }),
    h('span', { class: 'crece', style: { flex: 1, minWidth: 0 } },
      h('div', { class: 'de corta' }, p.articulo ? h('span', { class: 'art-' + p.articulo }, p.articulo + ' ') : null, p.de, p.revisar ? ' ✏️' : ''),
      h('div', { class: 'es corta' }, p.es)),
    extra,
    r && r.problematica ? h('span', { title: 'Problemática' }, '⚠️') : null,
    r ? h('span', { class: 'chip ' + r.fase }, NOMBRE_FASE[r.fase]) : null);
}

export function render(cont) {
  const lista = h('div');
  const contador = h('div', { class: 'gris peq', style: { margin: '2px 4px 6px' } });
  let resultados = [], pintadas = 0, centinela = null, observador = null;

  const pintarMas = () => {
    const hasta = Math.min(resultados.length, pintadas + TANDA);
    const frag = document.createDocumentFragment();
    for (; pintadas < hasta; pintadas++) frag.appendChild(filaPalabra(resultados[pintadas].p, resultados[pintadas].r));
    lista.insertBefore(frag, centinela);
    if (pintadas >= resultados.length && observador) observador.disconnect();
  };
  const actualizar = () => {
    resultados = filtrar();
    pintadas = 0;
    vaciar(lista);
    if (observador) observador.disconnect();
    contador.textContent = `${resultados.length} ${resultados.length === 1 ? 'palabra' : 'palabras'}`;
    if (!resultados.length) { lista.appendChild(h('p', { class: 'gris centro', style: { padding: '30px 0' } }, mem.palabras.size ? 'Ninguna palabra coincide.' : 'Aún no hay palabras. Importa tu vocabulario desde Ajustes.')); return; }
    centinela = h('div', { style: { height: '1px' } });
    lista.appendChild(centinela);
    pintarMas();
    if ('IntersectionObserver' in window) {
      observador = new IntersectionObserver((ent) => { if (ent.some((e) => e.isIntersecting)) pintarMas(); }, { root: document.getElementById('vista'), rootMargin: '600px' });
      observador.observe(centinela);
    } else while (pintadas < resultados.length) pintarMas();
  };

  const buscador = h('input', { class: 'campo', type: 'search', placeholder: '🔍 Buscar en alemán o español', value: busqueda, autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'search' });
  let espera = null;
  buscador.addEventListener('input', () => { busqueda = buscador.value; clearTimeout(espera); espera = setTimeout(actualizar, 120); });
  const set = (k) => (v) => { if (v === '') delete filtros[k]; else filtros[k] = v; actualizar(); };

  cont.append(
    h('h1', { class: 'titulo' }, 'Biblioteca'),
    buscador,
    h('div', { class: 'filtros', style: { marginTop: '10px' } },
      selector('Estado', [['nueva', 'Nuevas'], ['aprendiendo', 'Aprendiendo'], ['repaso', 'En repaso'], ['dominada', 'Dominadas'], ['problematica', 'Problemáticas']], filtros.estado, set('estado')),
      filtrosComunes(filtros, actualizar),
      selector('Revisión', [['1', 'Por revisar ✏️']], filtros.revisar, set('revisar'))),
    contador, lista);
  actualizar();
}
