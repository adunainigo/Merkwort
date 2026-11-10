// Capa de IndexedDB. Todas las lecturas y escrituras de la app pasan por aquí.
// Palabras, estados, ajustes y agregados se mantienen también en memoria (`mem`) para que
// la interfaz responda al instante; el historial solo se consulta por índice cuando hace falta.

import { claveEstado, estadoVacio } from './modelo.js';

export const VERSION_BD = 2;
/** Almacenes con datos del usuario (se exportan, restauran y borran con "Borrar todo"). */
export const ALMACENES = ['palabras', 'estado', 'historial', 'estadisticas', 'retos', 'ajustes', 'relaciones'];
/** Copias automáticas previas a cada migración. Fuera de ALMACENES a propósito: nada las vacía salvo la poda. */
export const ALMACEN_COPIAS = 'backups';
export const MAX_COPIAS = 3;

/**
 * Migraciones: MIGRACIONES[n] lleva la base de la versión n a la n+1.
 * REGLAS (ver CLAUDE.md): sube VERSION_BD y añade una función aquí; nunca borres almacenes ni
 * datos del usuario; si cambia el formato, transforma los datos dentro de la misma migración.
 * Antes de ejecutarlas, `copiarAntesDeMigrar` guarda una copia completa en `backups`.
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
  // v1 → v2: sinónimos y antónimos, y almacén de copias automáticas. Solo añade almacenes.
  (db) => {
    if (!db.objectStoreNames.contains('relaciones')) db.createObjectStore('relaciones', { keyPath: 'id' });
    asegurarAlmacenCopias(db);
  },
];

function asegurarAlmacenCopias(db) {
  if (!db.objectStoreNames.contains(ALMACEN_COPIAS)) db.createObjectStore(ALMACEN_COPIAS, { keyPath: 'id', autoIncrement: true });
}

/**
 * Dentro de onupgradeneeded y antes de cualquier migración: lee todos los almacenes tal como
 * están y guarda la copia en `backups`, conservando las MAX_COPIAS más recientes. Las lecturas
 * se encolan antes que cualquier petición de las migraciones, así que ven los datos sin migrar.
 * Si algo falla, la transacción entera se cancela y la base se queda en la versión anterior.
 */
function copiarAntesDeMigrar(db, tx, desde, hasta) {
  asegurarAlmacenCopias(db);
  const nombres = [...db.objectStoreNames].filter((n) => n !== ALMACEN_COPIAS);
  const datos = {};
  let pendientes = nombres.length;
  const guardar = () => {
    const st = tx.objectStore(ALMACEN_COPIAS);
    st.add({ fecha: Date.now(), desdeVersion: desde, haciaVersion: hasta, datos });
    st.getAllKeys().onsuccess = (ev) => {
      const claves = ev.target.result.sort((a, b) => a - b);
      for (const k of claves.slice(0, Math.max(0, claves.length - MAX_COPIAS))) st.delete(k);
    };
  };
  if (!pendientes) { guardar(); return; }
  for (const n of nombres) {
    tx.objectStore(n).getAll().onsuccess = (ev) => {
      datos[n] = ev.target.result;
      if (--pendientes === 0) guardar();
    };
  }
}

export const AJUSTES_DEFECTO = Object.freeze({
  clave: 'ajustes', nuevasDia: 10, objetivoDiario: 20, retencion: 0.9, intervaloMax: 180,
  maxRepasosDia: 100, tamSesion: 20, vibracion: true, ultimaCopia: 0, datosCargados: false, instalado: 0,
  nivelActual: 'B1.1', revisionDatos: 1, revisionRelaciones: 0,
});

export const GLOBAL_DEFECTO = Object.freeze({
  clave: 'global', xp: 0, rachaActual: 0, rachaMaxima: 0, ultimoDiaActivo: null, medallas: {},
  recordContrarreloj: 0, partidasContrarreloj: 0, totalRespuestas: 0, comboMax: 0, retosCompletados: 0, sabidas: 0,
});

const AGREGADOS_DEFECTO = () => ({ clave: 'agregados', porDir: {}, porTipo: {}, porTema: {}, porLektion: {}, porNivel: {}, articulos: {}, tiempos: {} });

let bd = null;

/** Datos en memoria. */
export const mem = {
  palabras: new Map(), estados: new Map(), ajustes: { ...AJUSTES_DEFECTO }, global: { ...GLOBAL_DEFECTO },
  agregados: AGREGADOS_DEFECTO(), confusiones: { clave: 'confusiones', pares: {} }, dias: new Map(), relaciones: [], version: 0,
};

const prom = (req) => new Promise((ok, err) => { req.onsuccess = () => ok(req.result); req.onerror = () => err(req.error); });
const finTx = (tx) => new Promise((ok, err) => { tx.oncomplete = () => ok(); tx.onerror = () => err(tx.error); tx.onabort = () => err(tx.error || new Error('Transacción cancelada')); });

export function abrir(nombre = 'vokabeln') {
  return new Promise((ok, err) => {
    const req = indexedDB.open(nombre, VERSION_BD);
    req.onupgradeneeded = (ev) => {
      const db = req.result, tx = req.transaction;
      if (ev.oldVersion > 0) copiarAntesDeMigrar(db, tx, ev.oldVersion, VERSION_BD);
      for (let v = ev.oldVersion; v < VERSION_BD; v++) MIGRACIONES[v](db, tx);
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
  const [palabras, estados, stats, ajustes, relaciones] = await Promise.all([todos('palabras'), todos('estado'), todos('estadisticas'), todos('ajustes'), todos('relaciones')]);
  mem.relaciones = relaciones;
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

export async function guardarRelaciones(lista) {
  const tx = bd.transaction('relaciones', 'readwrite');
  for (const r of lista) tx.objectStore('relaciones').put(r);
  await finTx(tx);
  mem.relaciones = await todos('relaciones');
  mem.version++;
}

/** Copias automáticas hechas antes de migrar, de la más reciente a la más antigua (sin los datos). */
export async function listarCopiasAuto() {
  const lista = await todos(ALMACEN_COPIAS);
  return lista.map((c) => ({ id: c.id, fecha: c.fecha, desdeVersion: c.desdeVersion, haciaVersion: c.haciaVersion, palabras: (c.datos.palabras || []).length, historial: (c.datos.historial || []).length }))
    .sort((a, b) => b.fecha - a.fecha);
}

/** Restaura una copia automática. Los almacenes que no existían en esa versión quedan vacíos. */
export async function restaurarCopiaAuto(id) {
  const c = await prom(bd.transaction(ALMACEN_COPIAS).objectStore(ALMACEN_COPIAS).get(id));
  if (!c) throw new Error('Esa copia ya no existe');
  return restaurar(c.datos);
}

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
