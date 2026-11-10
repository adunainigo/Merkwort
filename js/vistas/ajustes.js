// Ajustes: parámetros de aprendizaje, importación, copias de seguridad, borrado y versión.

import { mem, guardarAjustes, borrarTodo, contarHistorial, listarCopiasAuto, restaurarCopiaAuto } from '../db.js';
import { resumenNiveles, pasarNivelARepaso, deshacerNivel, estadosParaNivel, cargaEstimada } from '../niveles.js';
import { importarArchivo, importarTexto, importarURL, textoResumen, exportarCopia, restaurarCopia, validarCopia } from '../import.js';
import { asegurarSemana, olvidarSemana } from '../challenges.js';
import { contextoRetos } from '../history.js';
import { fechaRelativa, compararNiveles } from '../modelo.js';
import { h, hoja, confirmar, avisar, toast, nav } from '../ui.js';

const NIVELES_MCER = ['A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2', 'B2.1', 'B2.2', 'C1.1', 'C1.2'];

function seccionNiveles() {
  const lista = resumenNiveles();
  const opciones = [...new Set([...NIVELES_MCER, ...lista.map((r) => r.nivel).filter(Boolean)])].sort(compararNiveles);
  const sel = h('select', { class: 'campo', style: { width: 'auto', minWidth: '110px' }, 'aria-label': 'Nivel que estás cursando', onchange: async () => { await guardarAjustes({ nivelActual: sel.value }); toast('Nivel actual: ' + sel.value); nav.refrescar(); } },
    opciones.map((n) => h('option', { value: n, selected: n === mem.ajustes.nivelActual }, n)));
  const filas = lista.map((r) => {
    const anterior = compararNiveles(r.nivel, mem.ajustes.nivelActual) < 0;
    const pasar = async () => {
      const prev = estadosParaNivel({ palabras: mem.palabras, estados: mem.estados, nivel: r.nivel, ahora: Date.now() });
      if (!prev.estados.length) { toast('No queda nada que pasar a repaso en ' + r.nivel); return; }
      const ok = await confirmar(`Dar ${r.nivel} por conocido`,
        `${prev.palabras} palabras pasan a repaso: no saldrán como nuevas, sino repartidas en los próximos meses (≈${cargaEstimada(prev.estados)} repasos al día) para comprobar que las sabes. ` +
        `Las ${prev.complejas} complejas 🧠 seguirán como nuevas. Las que ya habías empezado no cambian. Puedes deshacerlo mientras no las respondas.`, { ok: 'Pasar a repaso' });
      if (!ok) return;
      const res = await pasarNivelARepaso(r.nivel);
      toast(`📘 ${res.palabras} palabras de ${r.nivel} en repaso`);
      nav.refrescar();
    };
    const deshacer = async () => {
      if (!(await confirmar('Deshacer', `Las palabras de ${r.nivel} que pasaste a repaso y aún no has respondido volverán a estar como nuevas.`, { ok: 'Deshacer', peligro: true }))) return;
      const n = await deshacerNivel(r.nivel);
      toast(`${n} direcciones vuelven a nuevas`);
      nav.refrescar();
    };
    return h('div', { class: 'ajuste', style: { flexWrap: 'wrap' } },
      h('div', { class: 'crece' },
        h('div', { class: 'negrita' }, r.nivel || 'Sin nivel', r.nivel === mem.ajustes.nivelActual ? h('span', { class: 'chip nivel', style: { marginLeft: '8px' } }, 'actual') : null),
        h('div', { class: 'gris peq' }, `${r.total} palabras · ${r.nuevas} sin empezar · ${r.dominadas} dominadas · ${r.complejas} complejas 🧠`)),
      r.nivel && r.sinEmpezarFacil ? h('button', { class: 'btn' + (anterior ? ' primario' : ''), style: { minHeight: '44px' }, onclick: pasar }, 'Ya lo conozco') : null,
      r.nivel && r.sembradas ? h('button', { class: 'enlace', onclick: deshacer }, 'Deshacer') : null);
  });
  return [
    h('div', { class: 'subtitulo' }, 'Niveles'),
    h('div', { class: 'tarjeta' },
      h('div', { class: 'ajuste' }, h('div', { class: 'crece' }, h('div', { class: 'negrita' }, 'Nivel que estás cursando'), h('div', { class: 'gris peq' }, 'Sus palabras nuevas salen antes que las de otros niveles')), sel),
      filas,
      h('p', { class: 'gris peq', style: { marginTop: '6px' } }, '"Ya lo conozco" pasa a repaso las palabras de un nivel anterior que no son complejas. Las complejas (traducción corregida, palabras que se confunden o con preposición fija) siguen como nuevas.')),
  ];
}

function seccionCopiasAuto() {
  const cont = h('div', { class: 'tarjeta' }, h('p', { class: 'gris peq' }, 'Cargando…'));
  listarCopiasAuto().then((lista) => {
    while (cont.firstChild) cont.removeChild(cont.firstChild);
    cont.appendChild(h('p', { class: 'gris peq', style: { marginBottom: '6px' } }, 'Antes de cada actualización de la base de datos se guarda sola una copia completa (se conservan las 3 últimas). Si algo fuera mal tras una actualización, restáurala aquí.'));
    if (!lista.length) { cont.appendChild(h('p', { class: 'gris peq' }, 'Todavía no hay ninguna.')); return; }
    for (const c of lista) {
      cont.appendChild(h('div', { class: 'ajuste' },
        h('div', { class: 'crece' }, h('div', { class: 'negrita' }, new Date(c.fecha).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })),
          h('div', { class: 'gris peq' }, `Antes de pasar de la versión ${c.desdeVersion} a la ${c.haciaVersion} · ${c.palabras} palabras · ${c.historial} respuestas`)),
        h('button', { class: 'btn', style: { minHeight: '44px' }, onclick: async () => {
          if (!(await confirmar('Restaurar copia automática', 'Se reemplazará TODO por esta copia. Lo que hayas hecho después se perderá.', { ok: 'Restaurar', peligro: true }))) return;
          try { await restaurarCopiaAuto(c.id); olvidarSemana(); await asegurarSemana(contextoRetos); toast('Copia restaurada'); nav.refrescar(); } catch (e) { avisar('No se pudo restaurar', e.message); }
        } }, 'Restaurar')));
    }
  });
  return [h('div', { class: 'subtitulo' }, 'Copias automáticas'), cont];
}

function paso(titulo, ayuda, clave, { min, max, salto, formato = (v) => v, aValor = (v) => v, deValor = (v) => v }) {
  const valor = h('b', null, formato(mem.ajustes[clave]));
  const cambiar = async (d) => {
    const actual = aValor(mem.ajustes[clave]);
    const nuevo = Math.min(max, Math.max(min, actual + d * salto));
    if (nuevo === actual) return;
    await guardarAjustes({ [clave]: deValor(nuevo) });
    valor.textContent = formato(mem.ajustes[clave]);
  };
  return h('div', { class: 'ajuste' },
    h('div', { class: 'crece' }, h('div', { class: 'negrita' }, titulo), h('div', { class: 'gris peq' }, ayuda)),
    h('div', { class: 'paso-a-paso' },
      h('button', { class: 'btn-icono', 'aria-label': 'Menos ' + titulo, onclick: () => cambiar(-1) }, '−'), valor,
      h('button', { class: 'btn-icono', 'aria-label': 'Más ' + titulo, onclick: () => cambiar(1) }, '+')));
}

async function mostrarResultado(promesa) {
  try {
    const r = await promesa;
    await avisar('Importación terminada', textoResumen(r) + (r.errores.length ? '\n\n' + r.errores.slice(0, 5).join('\n') + (r.errores.length > 5 ? `\n… y ${r.errores.length - 5} más` : '') : ''));
    nav.refrescar();
    return true;
  } catch (e) {
    await avisar('No se pudo importar', e.message);
    return false;
  }
}

function elegirArchivo(alElegir) {
  const input = h('input', { type: 'file', accept: '.json,application/json,text/plain', style: { display: 'none' } });
  input.addEventListener('change', () => { if (input.files[0]) alElegir(input.files[0]); input.remove(); });
  document.body.appendChild(input);
  input.click();
}

function pegarTexto() {
  const area = h('textarea', { class: 'campo', placeholder: '{ "version": 1, "palabras": [ … ] }', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const hj = hoja('Pegar JSON', h('div', null, area,
    h('button', { class: 'btn primario ancho', style: { marginTop: '12px' }, onclick: async () => {
      if (!area.value.trim()) { toast('Pega primero el texto'); return; }
      if (await mostrarResultado(importarTexto(area.value))) hj.cerrar();
    } }, 'Importar')));
}

function desdeURL() {
  const campo = h('input', { class: 'campo', type: 'url', inputmode: 'url', placeholder: 'https://…/palabras.json', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const hj = hoja('Importar desde una URL', h('div', null, campo,
    h('p', { class: 'gris peq', style: { marginTop: '8px' } }, 'El servidor debe permitir el acceso desde otras webs (CORS). Los enlaces "raw" de GitHub funcionan.'),
    h('button', { class: 'btn primario ancho', style: { marginTop: '12px' }, onclick: async () => {
      if (!campo.value.trim()) { toast('Escribe la URL'); return; }
      if (await mostrarResultado(importarURL(campo.value.trim()))) hj.cerrar();
    } }, 'Descargar e importar')));
}

async function versionApp() {
  try {
    const claves = await caches.keys();
    const c = claves.filter((k) => k.startsWith('vokabeln-v')).sort((a, b) => Number(b.slice(10)) - Number(a.slice(10)))[0];
    return c ? 'versión ' + c.slice(10) : 'sin instalar (sin caché)';
  } catch (e) { return 'desconocida'; }
}

export function render(cont) {
  const a = mem.ajustes;
  const version = h('span', null, '…');
  const registros = h('span', null, '…');
  versionApp().then((v) => { version.textContent = v; });
  contarHistorial().then((n) => { registros.textContent = String(n); });
  const vib = h('input', { type: 'checkbox', checked: !!a.vibracion, style: { width: '26px', height: '26px' }, onchange: () => guardarAjustes({ vibracion: vib.checked }) });

  cont.append(
    h('h1', { class: 'titulo' }, 'Ajustes'),

    ...seccionNiveles(),
    h('div', { class: 'subtitulo' }, 'Aprendizaje'),
    h('div', { class: 'tarjeta' },
      paso('Palabras nuevas por día', 'Cuántas palabras empiezas cada día', 'nuevasDia', { min: 0, max: 50, salto: 1 }),
      paso('Objetivo diario', 'Respuestas para que el día cuente en la racha', 'objetivoDiario', { min: 5, max: 300, salto: 5 }),
      paso('Retención objetivo', 'Más alta = más repasos y menos olvidos', 'retencion', { min: 75, max: 97, salto: 1, formato: (v) => Math.round(v * 100) + ' %', aValor: (v) => Math.round(v * 100), deValor: (v) => v / 100 }),
      paso('Intervalo máximo', 'Días como mucho entre dos repasos', 'intervaloMax', { min: 30, max: 365, salto: 15, formato: (v) => v + ' d' }),
      paso('Repasos máximos al día', 'Si se acumulan, se reparten en varios días', 'maxRepasosDia', { min: 20, max: 400, salto: 10 }),
      paso('Preguntas por sesión', 'Tamaño de cada tanda', 'tamSesion', { min: 5, max: 60, salto: 5 }),
      h('label', { class: 'ajuste' }, h('div', { class: 'crece' }, h('div', { class: 'negrita' }, 'Vibración'), h('div', { class: 'gris peq' }, 'En iPhone puede no estar disponible')), vib)),

    h('div', { class: 'subtitulo' }, 'Importar vocabulario'),
    h('div', { class: 'tarjeta' },
      h('p', { class: 'gris peq', style: { marginBottom: '10px' } }, 'Las palabras nuevas se añaden y las que ya existen se actualizan sin perder su progreso ni su historial.'),
      h('div', { style: { display: 'grid', gap: '8px' } },
        h('button', { class: 'btn', onclick: () => elegirArchivo((f) => mostrarResultado(importarArchivo(f))) }, '📄 Desde un archivo'),
        h('button', { class: 'btn', onclick: pegarTexto }, '📋 Pegar texto'),
        h('button', { class: 'btn', onclick: desdeURL }, '🔗 Desde una URL'))),

    h('div', { class: 'subtitulo' }, 'Copias de seguridad'),
    h('div', { class: 'tarjeta' },
      h('p', { class: 'gris peq', style: { marginBottom: '10px' } }, a.ultimaCopia ? `Última copia: ${fechaRelativa(a.ultimaCopia)}.` : 'Aún no has hecho ninguna copia. Los datos solo viven en este teléfono.'),
      h('div', { style: { display: 'grid', gap: '8px' } },
        h('button', { class: 'btn primario', onclick: async () => {
          try { const r = await exportarCopia(); if (!r.cancelado) { toast(`💾 Copia exportada (${r.registros} respuestas)`); nav.refrescar(); } } catch (e) { avisar('No se pudo exportar', e.message); }
        } }, '💾 Exportar copia'),
        h('button', { class: 'btn', onclick: () => elegirArchivo(async (f) => {
          try {
            const txt = await f.text();
            const c = validarCopia(txt);
            if (!(await confirmar('Restaurar copia', `Se reemplazará TODO por la copia del ${new Date(c.fecha).toLocaleDateString('es-ES')} (${c.datos.palabras.length} palabras, ${(c.datos.historial || []).length} respuestas).`, { ok: 'Restaurar', peligro: true }))) return;
            await restaurarCopia(txt);
            olvidarSemana();
            await asegurarSemana(contextoRetos);
            toast('Copia restaurada');
            nav.refrescar();
          } catch (e) { avisar('No se pudo restaurar', e.message); }
        }) }, '📥 Restaurar copia'))),

    ...seccionCopiasAuto(),
    h('div', { class: 'subtitulo' }, 'Zona peligrosa'),
    h('div', { class: 'tarjeta' },
      h('button', { class: 'btn peligro ancho', onclick: async () => {
        if (!(await confirmar('Borrar todo', 'Se borrarán todas las palabras, el progreso, el historial y las estadísticas de este teléfono.', { ok: 'Continuar', peligro: true }))) return;
        if (!(await confirmar('¿Seguro del todo?', 'No se puede deshacer. Si no tienes una copia exportada, lo perderás todo.', { ok: 'Sí, borrar todo', peligro: true }))) return;
        await borrarTodo();
        await guardarAjustes({ datosCargados: true, instalado: Date.now() });
        olvidarSemana();
        await asegurarSemana(contextoRetos);
        toast('Todo borrado');
        nav.refrescar();
      } }, '🗑 Borrar todo')),

    h('p', { class: 'gris peq centro', style: { marginTop: '18px' } }, 'Vokabeln · ', version, h('br'), mem.palabras.size, ' palabras · ', registros, ' respuestas en el historial'),
  );
}
