// Importación de vocabulario (archivo, texto pegado o URL) y copias de seguridad.

import { idPalabra, TIPOS, ARTICULOS, fechaLocal } from './modelo.js';
import { mem, guardarPalabras, guardarAjustes, volcar, restaurar, VERSION_BD, ALMACENES } from './db.js';

const texto = (v) => (v == null ? null : String(v).trim() || null);

/** Valida y normaliza una palabra del JSON. Lanza un Error con un mensaje comprensible. */
export function normalizarPalabra(cruda, i) {
  const donde = `Palabra ${i + 1}`;
  if (!cruda || typeof cruda !== 'object' || Array.isArray(cruda)) throw new Error(`${donde}: no es un objeto`);
  const de = texto(cruda.de), es = texto(cruda.es);
  if (!de) throw new Error(`${donde}: falta el campo "de" (la palabra en alemán)`);
  if (!es) throw new Error(`${donde} («${de}»): falta el campo "es" (la traducción)`);
  let articulo = texto(cruda.articulo);
  if (articulo) {
    articulo = articulo.toLowerCase();
    if (!ARTICULOS.includes(articulo)) throw new Error(`${donde} («${de}»): el artículo "${cruda.articulo}" no es der, die ni das`);
  }
  let tipo = (texto(cruda.tipo) || 'otro').toLowerCase().replace('expresión', 'expresion');
  if (!TIPOS.includes(tipo)) tipo = 'otro';
  const lek = cruda.lektion == null || cruda.lektion === '' ? null : Number(cruda.lektion);
  const etiquetas = Array.isArray(cruda.etiquetas) ? cruda.etiquetas.map((x) => String(x).trim()).filter(Boolean) : [];
  const p = {
    de, articulo, plural: texto(cruda.plural), es, tipo, nivel: texto(cruda.nivel),
    lektion: Number.isFinite(lek) ? lek : null, tema: texto(cruda.tema), lote: texto(cruda.lote),
    ejemplo: texto(cruda.ejemplo), notas: texto(cruda.notas), etiquetas, revisar: cruda.revisar === true,
  };
  p.id = idPalabra(p);
  return p;
}

/** Convierte texto en el objeto de importación, con errores legibles. */
export function leerJSON(txt) {
  let datos;
  try { datos = JSON.parse(String(txt).replace(/^﻿/, '')); } catch (e) {
    throw new Error('El texto no es un JSON válido: ' + e.message);
  }
  if (Array.isArray(datos)) datos = { palabras: datos };
  if (!datos || typeof datos !== 'object') throw new Error('El JSON debe ser un objeto con una lista "palabras"');
  if (!Array.isArray(datos.palabras)) {
    if (datos.tipo === 'copia-vokabeln') throw new Error('Este archivo es una copia de seguridad: usa "Restaurar copia"');
    throw new Error('Falta la lista "palabras" en el JSON');
  }
  return datos;
}

/**
 * Fusiona una importación con las palabras existentes (función pura).
 * Las nuevas se añaden; las existentes actualizan sus campos de texto y conservan
 * id y fechaAlta (el progreso y el historial viven en otros almacenes y no se tocan).
 * Devuelve { guardar, nuevas, actualizadas, sinCambios, errores }.
 */
export function fusionar(existentes, datos, ahora = Date.now()) {
  const res = { guardar: [], nuevas: 0, actualizadas: 0, sinCambios: 0, errores: [] };
  const vistos = new Map();
  datos.palabras.forEach((cruda, i) => {
    let p;
    try { p = normalizarPalabra({ nivel: datos.nivel, ...cruda }, i); } catch (e) { res.errores.push(e.message); return; }
    const previa = vistos.get(p.id) || existentes.get(p.id);
    if (!previa) { p.fechaAlta = ahora; res.nuevas++; res.guardar.push(p); vistos.set(p.id, p); return; }
    const fusionada = { ...previa, ...p, fechaAlta: previa.fechaAlta };
    if (JSON.stringify(fusionada) === JSON.stringify(previa)) { res.sinCambios++; return; }
    if (vistos.has(p.id)) res.guardar[res.guardar.indexOf(previa)] = fusionada; else { res.actualizadas++; res.guardar.push(fusionada); }
    vistos.set(p.id, fusionada);
  });
  return res;
}

export function textoResumen(r) {
  const partes = [`${r.nuevas} ${r.nuevas === 1 ? 'nueva' : 'nuevas'}`, `${r.actualizadas} ${r.actualizadas === 1 ? 'actualizada' : 'actualizadas'}`];
  if (r.sinCambios) partes.push(`${r.sinCambios} sin cambios`);
  partes.push(`${r.errores.length} con error`);
  return partes.join(', ');
}

/** Importa desde un texto JSON y guarda en la base. */
export async function importarTexto(txt) {
  const r = fusionar(mem.palabras, leerJSON(txt));
  if (r.guardar.length) await guardarPalabras(r.guardar);
  return r;
}

export async function importarArchivo(archivo) {
  return importarTexto(await archivo.text());
}

export async function importarURL(url) {
  let resp;
  try { resp = await fetch(url, { cache: 'no-store' }); } catch (e) {
    throw new Error('No se pudo descargar la URL (¿sin conexión o el servidor no permite el acceso?)');
  }
  if (!resp.ok) throw new Error(`La URL respondió con el error ${resp.status}`);
  return importarTexto(await resp.text());
}

/** Carga data/vokabeln.json la primera vez que se abre la app. */
export async function cargaInicial() {
  if (mem.ajustes.datosCargados) return null;
  const r = await importarURL('data/vokabeln.json');
  await guardarAjustes({ datosCargados: true, instalado: mem.ajustes.instalado || Date.now() });
  return r;
}

// ---------- Copias de seguridad ----------

export async function crearCopia(ahora = Date.now()) {
  const datos = await volcar();
  return { tipo: 'copia-vokabeln', version: VERSION_BD, fecha: new Date(ahora).toISOString(), datos };
}

/** Descarga o comparte la copia completa. En iOS usa la hoja de compartir si acepta archivos. */
export async function exportarCopia(ahora = Date.now()) {
  const copia = await crearCopia(ahora);
  const nombre = `vokabeln-copia-${fechaLocal(ahora)}.json`;
  const blob = new Blob([JSON.stringify(copia)], { type: 'application/json' });
  let hecho = false;
  try {
    const archivo = new File([blob], nombre, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
      await navigator.share({ files: [archivo], title: 'Copia de Vokabeln' });
      hecho = true;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return { cancelado: true };
  }
  if (!hecho) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }
  await guardarAjustes({ ultimaCopia: ahora });
  return { nombre, registros: copia.datos.historial.length };
}

export function validarCopia(txt) {
  let c;
  try { c = JSON.parse(String(txt).replace(/^﻿/, '')); } catch (e) { throw new Error('El archivo no es un JSON válido'); }
  if (!c || c.tipo !== 'copia-vokabeln' || !c.datos) throw new Error('El archivo no es una copia de seguridad de Vokabeln');
  if (c.version > VERSION_BD) throw new Error('La copia es de una versión más nueva de la app. Actualiza la app primero.');
  for (const a of ALMACENES) if (c.datos[a] != null && !Array.isArray(c.datos[a])) throw new Error(`La copia está dañada (${a})`);
  if (!Array.isArray(c.datos.palabras)) throw new Error('La copia no contiene palabras');
  return c;
}

export async function restaurarCopia(txt) {
  const c = validarCopia(txt);
  await restaurar(c.datos);
  return { palabras: c.datos.palabras.length, historial: (c.datos.historial || []).length, fecha: c.fecha };
}
