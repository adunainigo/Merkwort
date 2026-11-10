// Arranque de la app y navegación entre pantallas.

import { abrir, cargar, mem, guardarAjustes } from './db.js';
import { cargaInicial, actualizarDatosIncluidos } from './import.js';
import { asegurarSemana } from './challenges.js';
import { contextoRetos } from './history.js';
import { h, s, $, vaciar, nav, toast } from './ui.js';
import * as inicio from './vistas/inicio.js';
import * as jugar from './vistas/jugar.js';
import * as biblioteca from './vistas/biblioteca.js';
import * as estadisticas from './vistas/estadisticas.js';
import * as ajustes from './vistas/ajustes.js';
import { abrirFicha } from './vistas/ficha.js';

const VISTAS = { inicio, jugar, biblioteca, estadisticas, ajustes };
const PESTANAS = [
  ['inicio', 'Inicio', ['M3 11l9-8 9 8', 'M5 10v10h5v-6h4v6h5V10']],
  ['jugar', 'Jugar', ['M6 4l14 8-14 8z']],
  ['biblioteca', 'Biblioteca', ['M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z', 'M4 21a2 2 0 012-2h13', 'M9 7h6']],
  ['estadisticas', 'Estadísticas', ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M21 20H3']],
  ['ajustes', 'Ajustes', ['M12 15a3 3 0 100-6 3 3 0 000 6z', 'M19 12a7 7 0 00-.1-1.3l2-1.5-2-3.4-2.3.9a7 7 0 00-2.2-1.3L14 3h-4l-.4 2.4a7 7 0 00-2.2 1.3l-2.3-.9-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .9.1 1.3l-2 1.5 2 3.4 2.3-.9a7 7 0 002.2 1.3L10 21h4l.4-2.4a7 7 0 002.2-1.3l2.3.9 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z']],
];

let actual = 'inicio';

function pintar({ animar = true, conservarScroll = false } = {}) {
  const vista = $('#vista');
  const scroll = vista.scrollTop;
  vaciar(vista);
  const pantalla = h('div', { class: 'pantalla', style: animar ? null : { animation: 'none' } });
  vista.appendChild(pantalla);
  VISTAS[actual].render(pantalla);
  vista.scrollTop = conservarScroll ? scroll : 0;
  for (const b of $('#pestanas').children) b.classList.toggle('activa', b.dataset.vista === actual);
}

function ir(nombre) {
  if (!VISTAS[nombre]) return;
  const misma = nombre === actual;
  actual = nombre;
  pintar({ animar: !misma });
}

function pintarPestanas() {
  const barra = vaciar($('#pestanas'));
  barra.hidden = false;
  for (const [id, nombre, trazos] of PESTANAS) {
    barra.appendChild(h('button', { class: 'pestana', 'data-vista': id, 'aria-label': nombre, onclick: () => ir(id) },
      s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, trazos.map((d) => s('path', { d }))), nombre));
  }
}

nav.ir = ir;
nav.refrescar = () => pintar({ animar: false, conservarScroll: true });
nav.abrirFicha = abrirFicha;

// ---------- Service worker y actualizaciones ----------

async function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const habiaControlador = !!navigator.serviceWorker.controller;
    const reg = await navigator.serviceWorker.register('sw.js');
    let avisado = false;
    const avisar = (sw) => {
      if (avisado) return;
      avisado = true;
      toast('✨ Hay una actualización, toca para recargar', { duracion: 0, alTocar: () => sw.postMessage('activar') });
    };
    if (reg.waiting && habiaControlador) avisar(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener('statechange', () => { if (sw.state === 'installed' && navigator.serviceWorker.controller) avisar(sw); });
    });
    let recargando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!habiaControlador || recargando) return;
      recargando = true;
      location.reload();
    });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  } catch (e) {
    console.warn('No se pudo registrar el service worker', e);
  }
}

// ---------- Arranque ----------

async function arrancar() {
  const texto = $('#arranque-texto');
  try {
    await abrir();
    await cargar();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    if (!mem.ajustes.datosCargados) {
      if (texto) texto.textContent = 'Preparando tu vocabulario…';
      try {
        const r = await cargaInicial();
        if (r) setTimeout(() => toast(`📚 ${r.nuevas} palabras cargadas`), 400);
      } catch (e) {
        if (!mem.ajustes.instalado) await guardarAjustes({ instalado: Date.now() });
        setTimeout(() => toast('No se pudo cargar el vocabulario inicial. Impórtalo desde Ajustes.', { duracion: 5000 }), 400);
      }
    }
    const rev = await actualizarDatosIncluidos();
    if (rev.palabras) setTimeout(() => toast(`🗂️ Vocabulario reorganizado (${rev.palabras} palabras)`), 900);
    await asegurarSemana(contextoRetos);
    pintarPestanas();
    pintar();
    registrarSW();
    let ultimoDia = new Date().toDateString();
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState !== 'visible') return;
      await asegurarSemana(contextoRetos);
      const hoy = new Date().toDateString();
      // Al volver otro día se repinta para actualizar repasos, racha y retos.
      if (hoy !== ultimoDia && !$('#capas').children.length) { ultimoDia = hoy; nav.refrescar(); }
    });
  } catch (e) {
    console.error(e);
    vaciar($('#vista')).appendChild(h('div', { class: 'arranque' },
      h('div', { class: 'arranque-logo' }, '!'),
      h('p', { class: 'centro' }, 'No se pudo abrir la base de datos.'),
      h('p', { class: 'centro peq' }, String((e && e.message) || e)),
      h('button', { class: 'btn primario', onclick: () => location.reload() }, 'Reintentar')));
  }
}

arrancar();
