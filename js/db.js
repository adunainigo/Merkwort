// Capa de IndexedDB. Todas las lecturas y escrituras de la app pasan por aquí.
// Palabras, estados, ajustes y agregados se mantienen también en memoria (`mem`) para que
// la interfaz responda al instante; el historial solo se consulta por índice cuando hace falta.

import { claveEstado, estadoVacio } from './modelo.js';

export const VERSION_BD = 1;
export const ALMACENES = ['palabras', 'estado', 'historial', 'estadisticas', 'retos', 'ajustes'];

/**
 * Migraciones: MIGRACIONES[n] lleva la base de la versión n a la n+1.
 * Para cambiar el esquema, añade una función y sube VERSION_BD.
 */
const MIGRACIONES = [
  (db) => {
    db.createObjectStore('palabras', { keyPath: 'id' });
    const est = db.createObjectStore('estado', { keyPath: 'clave' });
    est.createIndex('palabraId', 'palabraId');
    const his = db.createObjectStore('historial', { keyPath: 'n', autoIncrement: true });
    his.createIndex('palabraId', 'palabraId');
    his.createIndex('fecha', 'fecha');
    db.createObjectStore('estadisticas', { keyPath: 'clave' });
    db.createObjectStore('retos', { keyPath: 'semana' });
    db.createObjectStore('ajustes', { keyPath: 'clave' });
  },
];

export const AJUSTES_DEFECTO = Object.freeze({
  clave: 'ajustes', nuevasDia: 10, objetivoDiario: 20, retencion: 0.9, intervaloMax: 180,
  maxRepasosDia: 100, tamSesion: 20, vibracion: true, ultimaCopia: 0, datosCargados: false, instalado: 0,
});

export const GLOBAL_DEFECTO = Object.freeze({
  clave: 'global', xp: 0, rachaActual: 0, rachaMaxima: 0, ultimoDiaActivo: null, medallas: {},
  recordContrarreloj: 0, partidasContrarreloj: 0, totalRespuestas: 0, comboMax: 0, retosCompletados: 0, sabidas: 0,
});

const AGREGADOS_DEFECTO = () => ({ clave: 'agregados', porDir: {}, porTipo: {}, porTema: {}, porLektion: {}, articulos: {}, tiempos: {} });

let bd = null;

/** Datos en memoria. */
export const mem = {
  palabras: new Map(), estados: new Map(), ajustes: { ...AJUSTES_DEFECTO }, global: { ...GLOBAL_DEFECTO },
  agregados: AGREGADOS_DEFECTO(), confusiones: { clave: 'confusiones', pares: {} }, dias: new Map(), version: 0,
};

const prom = (req) => new Promise((ok, err) => { req.onsuccess = () => ok(req.result); req.onerror = () => err(req.error); });
const finTx = (tx) => new Promise((ok, err) => { tx.oncomplete = () => ok(); tx.onerror = () => err(tx.error); tx.onabort = () => err(tx.error || new Error('Transacción cancelada')); });

export function abrir(nombre = 'vokabeln') {
  return new Promise((ok, err) => {
    const req = indexedDB.open(nombre, VERSION_BD);
    req.onupgradeneeded = (ev) => {
      for (let v = ev.oldVersion; v < VERSION_BD; v++) MIGRACIONES[v](req.result, req.transaction);
    };
    req.onsuccess = () => { bd = req.result; bd.onversionchange = () => bd.close(); ok(bd); };
    req.onerror = () => err(req.error);
    req.onblocked = () => err(new Error('La base de datos está bloqueada por otra pestaña'));
  });
}

export function cerrar() { if (bd) bd.close(); bd = null; }

export function eliminarBase(nombre) {
  cerrar();
  return new Promise((ok, err) => { const r = indexedDB.deleteDatabase(nombre); r.onsuccess = () => ok(); r.onerror = () => err(r.error); r.onblocked = () => ok(); });
}

const todos = (almacen) => prom(bd.transaction(almacen).objectStore(almacen).getAll());

/** Carga en memoria todo lo necesario para trabajar. */
export async function cargar() {
  const [palabras, estados, stats, ajustes] = await Promise.all([todos('palabras'), todos('estado'), todos('estadisticas'), todos('ajustes')]);
  mem.palabras = new Map(palabras.map((p) => [p.id, p]));
  mem.estados = new Map(estados.map((e) => [e.clave, e]));
  mem.ajustes = { ...AJUSTES_DEFECTO, ...(ajustes.find((a) => a.clave === 'ajustes') || {}) };
  mem.global = { ...GLOBAL_DEFECTO, medallas: {} };
  mem.agregados = AGREGADOS_DEFECTO();
  mem.confusiones = { clave: 'confusiones', pares: {} };
  mem.dias = new Map();
  for (const s of stats) {
    if (s.clave === 'global') mem.global = { ...GLOBAL_DEFECTO, ...s, medallas: { ...(s.medallas || {}) } };
    else if (s.clave === 'agregados') mem.agregados = { ...AGREGADOS_DEFECTO(), ...s };
    else if (s.clave === 'confusiones') mem.confusiones = s;
    else if (s.clave.startsWith('dia:')) mem.dias.set(s.fecha, s);
  }
  mem.version++;
  return mem;
}

// ---------- Lecturas ----------

export const estadoDe = (palabraId, dir) => mem.estados.get(claveEstado(palabraId, dir)) || estadoVacio(palabraId, dir);

export const diaVacio = (fecha) => ({ clave: 'dia:' + fecha, fecha, repasadas: 0, aciertos: 0, fallos: 0, xp: 0, ms: 0, nuevas: 0, maduras: 0, madurasOk: 0, dominadas: 0 });
export const diaDe = (fecha) => mem.dias.get(fecha) || diaVacio(fecha);

export function historialDePalabra(palabraId) {
  return prom(bd.transaction('historial').objectStore('historial').index('palabraId').getAll(palabraId));
}

export function historialDesde(ms) {
  return prom(bd.transaction('historial').objectStore('historial').index('fecha').getAll(IDBKeyRange.lowerBound(ms)));
}

export const contarHistorial = () => prom(bd.transaction('historial').objectStore('historial').count());

export const leerRetos = (semana) => prom(bd.transaction('retos').objectStore('retos').get(semana));
export const todosRetos = () => todos('retos');

// ---------- Escrituras ----------

/**
 * Guarda de forma atómica el resultado de una respuesta: estado, registro de historial,
 * resumen del día, estadísticas globales, agregados y confusiones.
 */
export async function guardarRespuesta({ estados = [], registros = [], dia, guardarGlobal = true }) {
  const tx = bd.transaction(['estado', 'historial', 'estadisticas'], 'readwrite');
  for (const e of estados) { mem.estados.set(e.clave, e); tx.objectStore('estado').put(e); }
  for (const r of registros) tx.objectStore('historial').add(r);
  const st = tx.objectStore('estadisticas');
  if (dia) { mem.dias.set(dia.fecha, dia); st.put(dia); }
  if (guardarGlobal) { st.put(mem.global); st.put(mem.agregados); st.put(mem.confusiones); }
  mem.version++;
  return finTx(tx);
}

export async function guardarEstados(lista) {
  const tx = bd.transaction('estado', 'readwrite');
  for (const e of lista) { mem.estados.set(e.clave, e); tx.objectStore('estado').put(e); }
  mem.version++;
  return finTx(tx);
}

export async function borrarEstados(claves) {
  const tx = bd.transaction('estado', 'readwrite');
  for (const c of claves) { mem.estados.delete(c); tx.objectStore('estado').delete(c); }
  mem.version++;
  return finTx(tx);
}

export async function guardarPalabras(lista) {
  const tx = bd.transaction('palabras', 'readwrite');
  for (const p of lista) { mem.palabras.set(p.id, p); tx.objectStore('palabras').put(p); }
  mem.version++;
  return finTx(tx);
}

/** Borra una palabra y su progreso. El historial se conserva (nunca se borra nada de él). */
export async function borrarPalabra(id) {
  const tx = bd.transaction(['palabras', 'estado'], 'readwrite');
  tx.objectStore('palabras').delete(id);
  mem.palabras.delete(id);
  for (const clave of [...mem.estados.keys()]) {
    if (mem.estados.get(clave).palabraId === id) { mem.estados.delete(clave); tx.objectStore('estado').delete(clave); }
  }
  mem.version++;
  return finTx(tx);
}

export async function guardarAjustes(cambios = {}) {
  Object.assign(mem.ajustes, cambios, { clave: 'ajustes' });
  const tx = bd.transaction('ajustes', 'readwrite');
  tx.objectStore('ajustes').put(mem.ajustes);
  return finTx(tx);
}

export async function guardarGlobal() {
  const tx = bd.transaction('estadisticas', 'readwrite');
  tx.objectStore('estadisticas').put(mem.global);
  return finTx(tx);
}

export async function guardarRetos(semana) {
  const tx = bd.transaction('retos', 'readwrite');
  tx.objectStore('retos').put(semana);
  return finTx(tx);
}

// ---------- Copia completa ----------

export async function volcar() {
  const out = {};
  for (const a of ALMACENES) out[a] = await todos(a);
  return out;
}

/** Sustituye todo el contenido de la base por el de una copia. */
export async function restaurar(datos) {
  const tx = bd.transaction(ALMACENES, 'readwrite');
  for (const a of ALMACENES) {
    const st = tx.objectStore(a);
    st.clear();
    for (const fila of datos[a] || []) st.put(fila);
  }
  await finTx(tx);
  return cargar();
}

export async function borrarTodo() {
  const tx = bd.transaction(ALMACENES, 'readwrite');
  for (const a of ALMACENES) tx.objectStore(a).clear();
  await finTx(tx);
  return cargar();
}
