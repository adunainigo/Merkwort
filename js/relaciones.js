// Sinónimos y antónimos: normalización y construcción de tableros sin ambigüedades.
// Funciones puras (salvo `relacionesEnriquecidas`, que lee la memoria).

import { mem } from './db.js';
import { claveEstado } from './modelo.js';
import { recuperabilidad } from './srs.js';
import { pasaFiltros } from './scheduler.js';

export const TIPOS_RELACION = ['sinonimos', 'antonimos'];

const txt = (v) => (v == null ? null : String(v).trim() || null);

export const idRelacion = (tipo, palabras) => `${tipo}:${palabras.map((p) => p.de.toLowerCase()).sort().join('|')}`;

/** Valida y normaliza una relación del JSON. Lanza un Error comprensible. */
export function normalizarRelacion(cruda, i, origen = 'importada') {
  const donde = `Relación ${i + 1}`;
  if (!cruda || typeof cruda !== 'object') throw new Error(`${donde}: no es un objeto`);
  const tipo = String(cruda.tipo || '').toLowerCase().replace('ó', 'o');
  if (!TIPOS_RELACION.includes(tipo)) throw new Error(`${donde}: el tipo debe ser "sinonimos" o "antonimos"`);
  if (!Array.isArray(cruda.palabras)) throw new Error(`${donde}: falta la lista "palabras"`);
  const vistas = new Set();
  const palabras = [];
  for (const w of cruda.palabras) {
    const de = txt(typeof w === 'string' ? w : w && w.de);
    if (!de) throw new Error(`${donde}: hay una palabra sin "de"`);
    if (vistas.has(de.toLowerCase())) continue;
    vistas.add(de.toLowerCase());
    palabras.push({ de, es: typeof w === 'string' ? null : txt(w.es) });
  }
  if (palabras.length < 2) throw new Error(`${donde}: hacen falta al menos dos palabras`);
  if (tipo === 'antonimos' && palabras.length !== 2) throw new Error(`${donde}: un antónimo es una pareja de exactamente dos palabras`);
  return { id: idRelacion(tipo, palabras), tipo, significado: txt(cruda.significado), palabras, origen };
}

/**
 * Clases de equivalencia por sinonimia (unión de grupos que comparten palabra):
 * de → id de clase. Una palabra sin sinónimos es su propia clase.
 */
export function clasesSinonimia(relaciones) {
  const padre = new Map();
  const raiz = (x) => { while (padre.get(x) !== x) { padre.set(x, padre.get(padre.get(x))); x = padre.get(x); } return x; };
  const alta = (x) => { if (!padre.has(x)) padre.set(x, x); };
  for (const r of relaciones) {
    if (r.tipo !== 'sinonimos') continue;
    const ws = r.palabras.map((p) => p.de.toLowerCase());
    ws.forEach(alta);
    for (const w of ws.slice(1)) padre.set(raiz(w), raiz(ws[0]));
  }
  return (de) => { const k = de.toLowerCase(); return padre.has(k) ? raiz(k) : k; };
}

/** Elección ponderada sin reemplazo. */
function sacar(lista, peso, rand) {
  const total = lista.reduce((s, x) => s + peso(x), 0);
  let t = rand() * total;
  for (let i = 0; i < lista.length; i++) { t -= peso(lista[i]); if (t <= 0) return lista.splice(i, 1)[0]; }
  return lista.pop();
}

const barajar = (a, rand) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/**
 * Tablero de sinónimos: hasta `grupos` grupos de 2–3 palabras, sin palabras repetidas y
 * sin dos grupos que signifiquen lo mismo. Devuelve [{ rel, miembros }].
 */
export function tableroSinonimos(relaciones, { grupos = 4, maxPorGrupo = 3, peso = () => 1, rand = Math.random } = {}) {
  const clase = clasesSinonimia(relaciones);
  const pool = relaciones.filter((r) => r.tipo === 'sinonimos' && peso(r) > 0);
  const usadas = new Set(), clases = new Set(), out = [];
  while (out.length < grupos && pool.length) {
    const r = sacar(pool, peso, rand);
    const c = clase(r.palabras[0].de);
    const libres = r.palabras.filter((p) => !usadas.has(p.de.toLowerCase()));
    if (clases.has(c) || libres.length < 2) continue;
    const miembros = barajar(libres, rand).slice(0, maxPorGrupo);
    miembros.forEach((p) => usadas.add(p.de.toLowerCase()));
    clases.add(c);
    out.push({ rel: r, miembros });
  }
  return out;
}

/**
 * Tablero de antónimos: hasta `parejas` parejas en las que ninguna palabra es sinónima de otra
 * del tablero, para que cada palabra tenga un único contrario posible. Devuelve [{ rel, a, b }].
 */
export function tableroAntonimos(relaciones, { parejas = 5, peso = () => 1, rand = Math.random } = {}) {
  const clase = clasesSinonimia(relaciones);
  const pool = relaciones.filter((r) => r.tipo === 'antonimos' && peso(r) > 0);
  const clases = new Set(), out = [];
  while (out.length < parejas && pool.length) {
    const r = sacar(pool, peso, rand);
    const [a, b] = r.palabras;
    const ca = clase(a.de), cb = clase(b.de);
    if (clases.has(ca) || clases.has(cb) || ca === cb) continue;
    clases.add(ca); clases.add(cb);
    out.push(rand() < 0.5 ? { rel: r, a, b } : { rel: r, a: b, b: a });
  }
  return out;
}

// ---------- Datos de la app ----------

/**
 * Relaciones de la memoria con cada palabra enlazada a su entrada del vocabulario (si existe):
 * { ...rel, palabras: [{ de, es, palabraId }] }.
 */
export function relacionesEnriquecidas() {
  const porDe = new Map();
  for (const p of mem.palabras.values()) {
    const k = p.de.toLowerCase();
    if (!porDe.has(k) || p.tipo !== 'sustantivo') porDe.set(k, p);
  }
  return mem.relaciones.map((r) => ({
    ...r,
    palabras: r.palabras.map((w) => {
      const p = porDe.get(w.de.toLowerCase());
      return { de: w.de, es: w.es || (p ? p.es : ''), palabraId: p ? p.id : null, articulo: p ? p.articulo : null };
    }),
  }));
}

/**
 * Peso de una relación: más probable si contiene palabras tuyas ya empezadas y flojas.
 * Con filtros, solo valen las relaciones con alguna palabra que los cumpla (0 = excluida).
 */
export function pesoRelacion(r, { filtros = {}, ahora = Date.now() } = {}) {
  const hayFiltros = Object.keys(filtros).some((k) => filtros[k] !== '' && filtros[k] != null);
  let peso = 1, pasa = !hayFiltros;
  for (const w of r.palabras) {
    if (!w.palabraId) continue;
    const p = mem.palabras.get(w.palabraId);
    if (hayFiltros && pasaFiltros(p, filtros)) pasa = true;
    const e = mem.estados.get(claveEstado(w.palabraId, 'de-es'));
    if (e && e.fase !== 'nueva') peso += 1 + (1 - recuperabilidad(e, ahora)) * 3;
  }
  return pasa ? peso : 0;
}
