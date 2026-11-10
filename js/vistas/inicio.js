// Pantalla de inicio: racha, nivel, repaso de hoy, problemáticas, retos y accesos a los modos.

import { mem, diaDe } from '../db.js';
import { DIA, fechaLocal } from '../modelo.js';
import { nivelDe, rachaVigente } from '../stats.js';
import { semanaActual, semanasAnteriores } from '../challenges.js';
import { resumenGlobal } from '../history.js';
import { exportarCopia } from '../import.js';
import { h, barra, hoja, toast, nav } from '../ui.js';
import { planDeHoy, repasoDeHoy } from '../games/sesion.js';
import * as refuerzo from '../games/refuerzo.js';
import { MODOS } from './jugar.js';

export function filaReto(r) {
  return h('div', { class: 'reto' + (r.completado ? ' hecho' : '') },
    h('div', { class: 'ico' }, r.completado ? '✅' : r.icono),
    h('div', { class: 'crece', style: { flex: 1, minWidth: 0 } },
      h('div', { class: 'fila entre' }, h('span', { class: 'txt' }, r.texto), h('span', { class: 'gris peq', style: { flex: 'none' } }, `${Math.min(r.progreso, r.meta)}/${r.meta}`)),
      barra(r.progreso / r.meta, r.completado ? 'ok' : ''),
      h('div', { class: 'gris peq', style: { marginTop: '3px' } }, r.completado ? `Conseguido · +${r.xp} XP 🎖️` : `Premio: ${r.xp} XP y medalla`)));
}

async function verSemanasAnteriores() {
  const semanas = (await semanasAnteriores()).filter((s) => !semanaActual() || s.semana !== semanaActual().semana);
  hoja('Semanas anteriores', semanas.length
    ? h('div', null, semanas.map((s) => h('div', null,
      h('div', { class: 'subtitulo' }, `Semana ${s.semana.slice(6)} de ${s.semana.slice(0, 4)} · ${s.retos.filter((r) => r.completado).length}/${s.retos.length}`),
      s.retos.map(filaReto))))
    : h('p', { class: 'gris' }, 'Todavía no hay semanas anteriores. Los retos se renuevan cada lunes.'));
}

export function render(cont) {
  const ahora = Date.now();
  const hoy = fechaLocal(ahora);
  const g = mem.global, nv = nivelDe(g.xp), dia = diaDe(hoy);
  const racha = rachaVigente(g, hoy);
  const plan = planDeHoy();
  const res = resumenGlobal();
  const objetivo = mem.ajustes.objetivoDiario;

  cont.appendChild(h('div', { class: 'heroe' },
    h('div', { class: 'fila entre' },
      h('div', null, h('div', { class: 'etq' }, 'Guten Tag 👋'), h('div', { style: { fontSize: '24px', fontWeight: 800 } }, 'Vokabeln')),
      h('div', { class: 'fila', style: { gap: '6px' } },
        mem.ajustes.nivelActual ? h('div', { class: 'pastilla', title: 'Nivel que estás cursando' }, '📘 ', mem.ajustes.nivelActual) : null,
        h('div', { class: 'pastilla', title: 'Racha diaria' }, '🔥 ', racha))),
    h('div', { class: 'fila', style: { marginTop: '16px', alignItems: 'flex-end' } },
      h('div', null, h('div', { class: 'etq' }, 'Nivel XP'), h('div', { class: 'cifra' }, nv.nivel)),
      h('div', { class: 'crece', style: { flex: 1 } },
        h('div', { class: 'fila entre etq', style: { marginBottom: '5px' } }, h('span', null, `${g.xp} XP`), h('span', null, `${nv.enNivel}/${nv.meta}`)),
        barra(nv.progreso))),
    h('div', { style: { marginTop: '14px' } },
      h('div', { class: 'fila entre etq', style: { marginBottom: '5px' } },
        h('span', null, dia.repasadas >= objetivo ? '✅ Objetivo de hoy cumplido' : 'Objetivo de hoy'), h('span', null, `${Math.min(dia.repasadas, 9999)}/${objetivo}`)),
      barra(dia.repasadas / objetivo))));

  // Repaso de hoy
  const n = plan.total;
  const detalle = [];
  if (plan.repasos + plan.aprendizaje) detalle.push(`${plan.repasos + plan.aprendizaje} repasos`);
  if (plan.nuevas) detalle.push(`${plan.nuevas} nuevas`);
  if (plan.desbloqueos) detalle.push(`${plan.desbloqueos} direcciones nuevas`);
  if (plan.refuerzo) detalle.push(`${plan.refuerzo} de refuerzo`);
  cont.appendChild(h('button', { class: 'btn-repaso' + (n ? '' : ' hecho'), onclick: () => (n ? repasoDeHoy() : nav.ir('jugar')) },
    h('span', { class: 'n' }, n ? n : '✓'),
    h('span', { class: 'crece', style: { flex: 1 } },
      h('div', { class: 't' }, n ? `Repaso de hoy (${n})` : '¡Todo al día!'),
      h('div', { class: 'gris peq' }, n ? detalle.join(' · ') : (res.total ? 'Vuelve mañana o practica con cualquier modo' : 'Importa vocabulario desde Ajustes'))),
    h('span', { style: { fontSize: '22px', color: 'var(--primario)' } }, '›')));
  if (plan.hayAtasco) {
    cont.appendChild(h('div', { class: 'aviso-caja' }, '🧹', h('span', null, `Tienes ${plan.pendientes} repasos pendientes. Hasta que bajen de 100 no entran palabras nuevas, y se reparten en varios días.`)));
  }

  // Problemáticas
  if (res.problematicas.length) {
    cont.appendChild(h('button', { class: 'tarjeta fila', style: { width: '100%', textAlign: 'left' }, onclick: () => refuerzo.iniciar() },
      h('span', { style: { fontSize: '26px' } }, '⚠️'),
      h('span', { class: 'crece', style: { flex: 1 } },
        h('div', { class: 'negrita' }, `${res.problematicas.length} ${res.problematicas.length === 1 ? 'palabra problemática' : 'palabras problemáticas'}`),
        h('div', { class: 'gris peq' }, 'Toca para una sesión de refuerzo')),
      h('span', { class: 'chip problematica' }, 'Refuerzo ›')));
  }

  // Recordatorio de copia de seguridad
  const ultima = mem.ajustes.ultimaCopia || mem.ajustes.instalado || ahora;
  if (ahora - ultima > 14 * DIA && g.totalRespuestas > 0) {
    cont.appendChild(h('div', { class: 'aviso-caja' }, '💾',
      h('span', { class: 'crece', style: { flex: 1 } }, mem.ajustes.ultimaCopia ? `Tu última copia es de hace ${Math.floor((ahora - ultima) / DIA)} días.` : 'Aún no has hecho ninguna copia de seguridad.'),
      h('button', { class: 'enlace', onclick: async () => {
        try { const r = await exportarCopia(); if (!r.cancelado) { toast('💾 Copia exportada'); nav.refrescar(); } } catch (e) { toast('No se pudo exportar: ' + e.message); }
      } }, 'Exportar')));
  }

  // Retos de la semana
  const semana = semanaActual();
  if (semana) {
    cont.appendChild(h('div', { class: 'fila entre' }, h('div', { class: 'subtitulo' }, 'Retos de la semana'), h('button', { class: 'enlace peq', onclick: verSemanasAnteriores }, 'Anteriores')));
    cont.appendChild(h('div', { class: 'tarjeta' }, semana.retos.map(filaReto)));
  }

  // Modos de juego
  cont.appendChild(h('div', { class: 'subtitulo' }, 'Modos de juego'));
  cont.appendChild(h('div', { class: 'rejilla' }, MODOS.map((m) => h('button', { class: 'modo', onclick: () => m.ir({}) },
    h('span', { class: 'ico' }, m.ico), h('span', { class: 'nom' }, m.nom), h('span', { class: 'des' }, m.des)))));

  cont.appendChild(h('p', { class: 'gris peq centro', style: { marginTop: '18px' } },
    `${res.total} palabras · ${res.dominadas} dominadas · ${res.nuevas} por empezar`));
}
