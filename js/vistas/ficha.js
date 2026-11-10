// Ficha de una palabra: datos, estado por dirección, historial y acciones (editar, borrar, reiniciar, marcar sabida).

import { mem, estadoDe, historialDePalabra, guardarPalabras, borrarPalabra } from '../db.js';
import { dirsDe, NOMBRE_DIR, resumenPalabra, fechaRelativa, fechaCorta, esProblematicoEstado, tasaReciente, TIPOS, ARTICULOS, formasVerbo, DIA } from '../modelo.js';
import { recuperabilidad } from '../srs.js';
import { reiniciarProgreso, marcarSabida, confundidasCon } from '../history.js';
import { h, s, capa, hoja, confirmar, toast, nav, pct, barra, deConColor, NOMBRE_TIPO } from '../ui.js';

const NOMBRE_FASE = { nueva: 'Sin empezar', aprendiendo: 'Aprendiendo', repaso: 'En repaso', reaprendiendo: 'Reaprendiendo' };
const NOMBRE_MODO = { repaso: 'Repaso', tarjetas: 'Tarjetas', test: 'Test', escribir: 'Escribir', articulos: 'Der·Die·Das', contrarreloj: 'Contrarreloj', verbos: 'Verbos', refuerzo: 'Refuerzo', sinonimos: 'Sinónimos', antonimos: 'Antónimos' };

/** Línea de tiempo: un punto por respuesta (verde acierto, rojo fallo), una fila por dirección. */
function graficoHistorial(registros, dirs) {
  const ancho = 320, filaAlto = 26, alto = dirs.length * filaAlto + 18;
  const g = s('svg', { class: 'grafico', viewBox: `0 0 ${ancho} ${alto}`, role: 'img', 'aria-label': 'Historial de aciertos y fallos' });
  const t0 = registros[0].fecha, t1 = Math.max(registros[registros.length - 1].fecha, t0 + DIA);
  const x = (t) => 62 + ((t - t0) / (t1 - t0)) * (ancho - 72);
  dirs.forEach((dir, i) => {
    const y = 12 + i * filaAlto;
    g.appendChild(s('text', { x: 0, y: y + 4 }, { 'de-es': 'DE→ES', 'es-de': 'ES→DE', articulo: 'Artículo', formas: 'Formas' }[dir]));
    g.appendChild(s('line', { x1: 62, x2: ancho - 6, y1: y, y2: y, stroke: 'var(--borde)' }));
    for (const r of registros) {
      if (r.dir !== dir) continue;
      g.appendChild(s('circle', { cx: x(r.fecha), cy: y, r: 4.5, fill: r.resultado === 'acierto' ? 'var(--ok)' : 'var(--mal)', opacity: 0.85 }));
    }
  });
  g.appendChild(s('text', { x: 62, y: alto - 2 }, fechaCorta(t0)));
  g.appendChild(s('text', { x: ancho - 6, y: alto - 2, 'text-anchor': 'end' }, fechaCorta(t1)));
  return g;
}

function editar(p, alGuardar) {
  const c = (nombre, valor, attrs = {}) => h('input', { class: 'campo', name: nombre, value: valor ?? '', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', ...attrs });
  const opciones = (lista, actual, vacio) => [vacio ? h('option', { value: '' }, vacio) : null, lista.map((v) => h('option', { value: v, selected: v === actual }, NOMBRE_TIPO[v] || v))];
  const form = h('form', null,
    h('label', { class: 'etiqueta-campo' }, 'Alemán'), c('de', p.de, { required: true }),
    h('div', { class: 'rejilla' },
      h('div', null, h('label', { class: 'etiqueta-campo' }, 'Artículo'), h('select', { class: 'campo', name: 'articulo' }, opciones(ARTICULOS, p.articulo, 'Sin artículo'))),
      h('div', null, h('label', { class: 'etiqueta-campo' }, 'Tipo'), h('select', { class: 'campo', name: 'tipo' }, opciones(TIPOS, p.tipo)))),
    h('label', { class: 'etiqueta-campo' }, 'Plural'), c('plural', p.plural),
    h('label', { class: 'etiqueta-campo' }, 'Español'), c('es', p.es, { required: true }),
    h('label', { class: 'etiqueta-campo' }, 'Ejemplo'), c('ejemplo', p.ejemplo),
    h('label', { class: 'etiqueta-campo' }, 'Notas'), c('notas', p.notas),
    h('div', { class: 'rejilla' },
      h('div', null, h('label', { class: 'etiqueta-campo' }, 'Lección'), c('lektion', p.lektion, { type: 'number', inputmode: 'numeric' })),
      h('div', null, h('label', { class: 'etiqueta-campo' }, 'Tema'), c('tema', p.tema))),
    h('label', { class: 'etiqueta-campo' }, 'Etiquetas (separadas por comas)'), c('etiquetas', (p.etiquetas || []).join(', ')),
    h('label', { class: 'ajuste' }, h('span', { class: 'crece' }, 'Compleja (no pasa a repaso al dar un nivel por conocido)'), h('input', { type: 'checkbox', name: 'compleja', checked: !!p.compleja, style: { width: '24px', height: '24px' } })),
    h('label', { class: 'ajuste' }, h('span', { class: 'crece' }, 'Marcar como "por revisar"'), h('input', { type: 'checkbox', name: 'revisar', checked: !!p.revisar, style: { width: '24px', height: '24px' } })),
    h('button', { class: 'btn primario ancho', type: 'submit', style: { marginTop: '10px' } }, 'Guardar'));
  const hj = hoja('Editar palabra', form);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const d = new FormData(form);
    const txt = (k) => String(d.get(k) || '').trim() || null;
    if (!txt('de') || !txt('es')) { toast('Alemán y español son obligatorios'); return; }
    const lek = txt('lektion');
    // El identificador no cambia al editar, para conservar el progreso y el historial.
    await guardarPalabras([{
      ...p, de: txt('de'), articulo: txt('articulo'), tipo: txt('tipo') || 'otro', plural: txt('plural'), es: txt('es'), ejemplo: txt('ejemplo'), notas: txt('notas'),
      lektion: lek == null ? null : Number(lek), tema: txt('tema'), etiquetas: (txt('etiquetas') || '').split(',').map((x) => x.trim()).filter(Boolean), revisar: d.get('revisar') === 'on', compleja: d.get('compleja') === 'on', editada: Date.now(),
    }]);
    hj.cerrar();
    toast('Palabra guardada');
    alGuardar();
  });
}

export function abrirFicha(id) {
  const p0 = mem.palabras.get(id);
  if (!p0) return;
  const c = capa({ titulo: 'Ficha', lateral: true, alCerrar: () => nav.refrescar() });

  const pintar = () => {
    const p = mem.palabras.get(id);
    const ahora = Date.now();
    const r = resumenPalabra(p, mem.estados);
    const dirs = dirsDe(p);
    const formas = formasVerbo(p);
    const cuerpo = c.cuerpo;
    while (cuerpo.firstChild) cuerpo.removeChild(cuerpo.firstChild);

    cuerpo.appendChild(h('div', { class: 'tarjeta' },
      h('div', { class: 'fila', style: { flexWrap: 'wrap', gap: '6px', marginBottom: '8px' } },
        h('span', { class: 'chip ' + r.fase }, { nueva: 'Nueva', aprendiendo: 'Aprendiendo', repaso: 'En repaso', dominada: 'Dominada' }[r.fase]),
        r.problematica ? h('span', { class: 'chip problematica' }, '⚠️ Problemática') : null,
        h('span', { class: 'chip' }, NOMBRE_TIPO[p.tipo] || p.tipo),
        p.lektion != null ? h('span', { class: 'chip' }, 'Lektion ' + p.lektion) : null,
        p.nivel ? h('span', { class: 'chip nivel' }, p.nivel) : null,
        p.compleja ? h('span', { class: 'chip problematica' }, '🧠 Compleja') : null,
        p.revisar ? h('span', { class: 'chip aprendiendo' }, '✏️ Por revisar') : null),
      h('div', { class: 'ficha-de' }, deConColor(p)),
      p.plural ? h('div', { class: 'gris' }, 'Plural: die ' + p.plural) : null,
      h('div', { style: { fontSize: '19px', marginTop: '6px' } }, p.es),
      formas ? h('div', { style: { marginTop: '8px' } }, h('b', null, 'er ' + formas.presente), ' · ', h('b', null, formas.perfecto)) : null,
      p.ejemplo ? p.ejemplo.split(' | ').map((e) => h('div', { class: 'ejemplo gris', style: { marginTop: '8px', fontStyle: 'italic' } }, '„' + e + '“')) : null,
      p.notas ? h('div', { class: 'notas', style: { marginTop: '8px' } }, '📝 ' + p.notas) : null,
      h('div', { class: 'gris peq', style: { marginTop: '10px' } }, [p.tema, (p.etiquetas || []).join(', ')].filter(Boolean).join(' · '))));

    cuerpo.appendChild(h('div', { class: 'subtitulo' }, 'Estado por dirección'));
    cuerpo.appendChild(h('div', { class: 'tarjeta' }, dirs.map((dir) => {
      const e = estadoDe(id, dir);
      if (e.fase === 'nueva') return h('div', { class: 'dir-estado' }, h('div', { class: 'fila entre' }, h('b', null, NOMBRE_DIR[dir]), h('span', { class: 'chip' }, dir === 'de-es' ? 'Sin empezar' : '🔒 Aún no')));
      const rec = recuperabilidad(e, ahora), tasa = tasaReciente(e);
      return h('div', { class: 'dir-estado' },
        h('div', { class: 'fila entre' }, h('b', null, NOMBRE_DIR[dir]),
          h('span', { class: 'chip ' + (esProblematicoEstado(e) ? 'problematica' : e.fase === 'repaso' ? 'repaso' : 'aprendiendo') }, esProblematicoEstado(e) ? '⚠️ Problemática' : NOMBRE_FASE[e.fase])),
        h('div', { class: 'fila', style: { margin: '6px 0' } }, h('span', { class: 'gris peq', style: { flex: 'none', whiteSpace: 'nowrap' } }, `Recuerdo hoy: ${pct(rec)}`), h('div', { style: { flex: 1 } }, barra(rec, rec > 0.85 ? 'ok' : ''))),
        h('div', { class: 'gris peq' }, `Estabilidad ${e.estabilidad < 10 ? e.estabilidad.toFixed(1) : Math.round(e.estabilidad)} días · dificultad ${e.dificultad.toFixed(1)}/10`),
        h('div', { class: 'gris peq' }, `Próxima revisión: ${e.fase === 'repaso' ? fechaRelativa(e.proximaRevision, ahora) : 'en esta sesión'} · ${e.repeticiones} respuestas · ${e.fallos} olvidos${tasa != null ? ` · ${pct(tasa)} últimas ${e.ultimas.length}` : ''}`),
        e.origen === 'nivel' && !e.repeticiones ? h('div', { class: 'gris peq' }, '📘 Pasada a repaso al dar su nivel por conocido; aún sin comprobar.') : null);
    })));

    const conf = confundidasCon(id).slice(0, 4).map((x) => mem.palabras.get(x));
    if (conf.length) {
      cuerpo.appendChild(h('div', { class: 'subtitulo' }, 'La confundes con'));
      cuerpo.appendChild(h('div', { class: 'tarjeta lista-simple' }, conf.map((o) => h('button', { onclick: () => abrirFicha(o.id) }, h('span', { class: 'crece', style: { flex: 1 } }, h('b', null, deConColor(o)), h('div', { class: 'gris peq' }, o.es)), '›'))));
    }

    const zonaHist = h('div', { class: 'tarjeta' }, h('p', { class: 'gris peq' }, 'Cargando historial…'));
    cuerpo.appendChild(h('div', { class: 'subtitulo' }, 'Historial'));
    cuerpo.appendChild(zonaHist);
    historialDePalabra(id).then((regs) => {
      while (zonaHist.firstChild) zonaHist.removeChild(zonaHist.firstChild);
      if (!regs.length) { zonaHist.appendChild(h('p', { class: 'gris peq' }, 'Todavía no has respondido esta palabra.')); return; }
      regs.sort((a, b) => a.fecha - b.fecha);
      const ok = regs.filter((x) => x.resultado === 'acierto').length;
      zonaHist.appendChild(h('div', { class: 'fila entre', style: { marginBottom: '8px' } }, h('b', null, `${regs.length} respuestas`), h('span', { class: 'gris peq' }, `${pct(ok / regs.length)} de acierto`)));
      zonaHist.appendChild(graficoHistorial(regs, dirs.filter((d) => regs.some((x) => x.dir === d))));
      zonaHist.appendChild(h('div', { class: 'lista-simple', style: { marginTop: '8px' } }, regs.slice(-6).reverse().map((x) => h('div', { class: 'peq' },
        h('span', null, x.resultado === 'acierto' ? '✅' : '❌'),
        h('span', { class: 'crece', style: { flex: 1 } }, `${fechaCorta(x.fecha)} · ${NOMBRE_MODO[x.modo] || x.modo} · ${NOMBRE_DIR[x.dir]}`, x.respuesta ? h('div', { class: 'gris' }, 'Pusiste: ' + x.respuesta) : null),
        h('span', { class: 'gris' }, x.intervaloNuevo ? `→ ${x.intervaloNuevo} d` : '')))));
    });

    cuerpo.appendChild(h('div', { class: 'rejilla', style: { marginTop: '6px' } },
      h('button', { class: 'btn', onclick: () => editar(p, pintar) }, '✏️ Editar'),
      h('button', { class: 'btn', onclick: async () => {
        if (!(await confirmar('Marcar como sabida', 'Dejará de salir en los repasos durante un mes. El historial se conserva.', { ok: 'Marcar' }))) return;
        await marcarSabida(id); toast('Marcada como sabida'); pintar();
      } }, '✅ Marcar como sabida'),
      h('button', { class: 'btn', onclick: async () => {
        if (!(await confirmar('Reiniciar progreso', 'La palabra volverá a estar como nueva. El historial de respuestas se conserva.', { ok: 'Reiniciar', peligro: true }))) return;
        await reiniciarProgreso(id); toast('Progreso reiniciado'); pintar();
      } }, '↺ Reiniciar progreso'),
      h('button', { class: 'btn peligro', onclick: async () => {
        if (!(await confirmar('Borrar palabra', `¿Borrar «${p.de}» y su progreso? No se puede deshacer.`, { ok: 'Borrar', peligro: true }))) return;
        await borrarPalabra(id); toast('Palabra borrada'); c.cerrar();
      } }, '🗑 Borrar')));
  };
  pintar();
}
