// Planificador: decide qué se pregunta en cada sesión a partir del estado de cada palabra.
// Funciones puras: reciben los datos (Map de palabras y de estados) y devuelven la lista de preguntas.

import { claveEstado, dirsDe, esProblematicoEstado, finDia, inicioDia, MIN, UMBRAL_DESBLOQUEO, DIA } from './modelo.js';
import { recuperabilidad } from './srs.js';

/** Con más repasos pendientes que esto no se introducen palabras nuevas. */
export const LIMITE_ATRASO = 100;
/** Hueco de refuerzo con palabras problemáticas en cada sesión. */
export const HUECO_REFUERZO = 3;
/** Los pasos de aprendizaje que vencen en este margen se adelantan. */
const MARGEN_APRENDIZAJE = 20 * MIN;

export function pasaFiltros(p, f = {}) {
  if (f.lektion != null && f.lektion !== '' && String(p.lektion) !== String(f.lektion)) return false;
  if (f.tema && p.tema !== f.tema) return false;
  if (f.tipo && p.tipo !== f.tipo) return false;
  if (f.etiqueta && !(p.etiquetas || []).includes(f.etiqueta)) return false;
  return true;
}

/** Una dirección secundaria se desbloquea cuando de→es se recuerda (estabilidad ≥ 3 días) en un día posterior. */
export function desbloqueada(estados, palabraId, ahora) {
  const e = estados.get(claveEstado(palabraId, 'de-es'));
  return !!e && e.fase === 'repaso' && e.estabilidad >= UMBRAL_DESBLOQUEO
    && inicioDia(e.ultimaRevision) > inicioDia(e.primeraRevision) && e.primeraRevision < inicioDia(ahora);
}

/** Direcciones problemáticas de cada palabra: Map id → [dir]. */
export function problematicas(palabras, estados) {
  const out = new Map();
  for (const e of estados.values()) {
    if (esProblematicoEstado(e) && palabras.has(e.palabraId)) {
      if (!out.has(e.palabraId)) out.set(e.palabraId, []);
      out.get(e.palabraId).push(e.dir);
    }
  }
  return out;
}

/** Tipo de pregunta para un elemento del repaso mezclado. */
export function modoPara(dir, e, rand = Math.random) {
  if (dir === 'articulo') return 'articulo';
  if (dir === 'formas') return 'verbos';
  if (dir === 'es-de') return !e || e.fase === 'nueva' ? 'test' : 'escribir';
  if (!e || e.fase === 'nueva') return 'tarjeta';
  return rand() < 0.5 ? 'test' : 'tarjeta';
}

const parecidas = (a, b) => a.palabraId === b.palabraId
  || (a.tema && a.tema === b.tema && a.tema !== 'Palabras y expresiones útiles' && a.tema !== 'Verbos irregulares')
  || a.raiz === b.raiz;

/** Reordena lo mínimo para que no salgan seguidas dos palabras iguales, parecidas o del mismo tema. */
export function separar(items) {
  const cola = items.slice();
  const out = [];
  while (cola.length) {
    let i = 0;
    const previo = out[out.length - 1];
    if (previo) {
      const limite = Math.min(cola.length, 6);
      while (i < limite && parecidas(previo, cola[i])) i++;
      if (i === limite) i = 0;
    }
    out.push(cola.splice(i, 1)[0]);
  }
  return out;
}

/** Reparte `extra` de forma uniforme dentro de `base`. */
function intercalar(base, extra) {
  if (!extra.length) return base.slice();
  if (!base.length) return extra.slice();
  const out = [];
  const cada = Math.max(1, Math.floor(base.length / (extra.length + 1)));
  let j = 0;
  base.forEach((it, i) => {
    out.push(it);
    if ((i + 1) % cada === 0 && j < extra.length) out.push(extra[j++]);
  });
  while (j < extra.length) out.push(extra[j++]);
  return out;
}

/**
 * Arma el plan del día.
 * Devuelve { items, total, pendientes, atrasadas, nuevas, desbloqueos, refuerzo }.
 * items: los primeros `tam` elementos; total: todo lo que queda por hacer hoy.
 * Cada elemento: { palabraId, dir, origen: 'aprendizaje'|'repaso'|'nueva'|'desbloqueo'|'refuerzo', modo, r }.
 */
export function armarSesion({ palabras, estados, ahora, ajustes = {}, repasosHoy = 0, filtros = {}, rand = Math.random, tam }) {
  const nuevasDia = ajustes.nuevasDia ?? 10;
  const maxRepasos = ajustes.maxRepasosDia ?? 100;
  const tamano = tam ?? ajustes.tamSesion ?? 20;
  const hoy0 = inicioDia(ahora), hoyFin = finDia(ahora);
  const probl = problematicas(palabras, estados);
  const soloProbl = !!filtros.soloProblematicas;

  const item = (p, dir, origen, e) => ({
    palabraId: p.id, dir, origen, tema: p.tema, raiz: p.de.toLowerCase().slice(0, 5),
    r: recuperabilidad(e, ahora), modo: modoPara(dir, e, rand),
  });

  const aprendizaje = [], repasos = [], nuevas = [], desbloqueos = [], enPlan = new Set();
  let nuevasHoy = 0, desbloqueosHoy = 0, atrasadas = 0;

  // Lo ya empezado hoy cuenta para el cupo diario aunque esté fuera del filtro.
  for (const e of estados.values()) {
    if (e.primeraRevision >= hoy0) { if (e.dir === 'de-es') nuevasHoy++; else desbloqueosHoy++; }
  }

  let orden = 0;
  for (const p of palabras.values()) {
    orden++;
    if (!pasaFiltros(p, filtros)) continue;
    if (soloProbl && !probl.has(p.id)) continue;
    const abierta = desbloqueada(estados, p.id, ahora);
    for (const dir of dirsDe(p)) {
      const e = estados.get(claveEstado(p.id, dir));
      if (!e || e.fase === 'nueva') {
        if (dir === 'de-es') nuevas.push({ p, dir, orden });
        else if (abierta) desbloqueos.push({ p, dir, orden, s: estados.get(claveEstado(p.id, 'de-es')).estabilidad });
        continue;
      }
      if (e.fase === 'repaso') {
        if (e.proximaRevision <= hoyFin) {
          if (e.proximaRevision < hoy0) atrasadas++;
          repasos.push(item(p, dir, 'repaso', e));
        }
      } else if (e.proximaRevision <= ahora + MARGEN_APRENDIZAJE) {
        const it = item(p, dir, 'aprendizaje', e);
        it.vence = e.proximaRevision;
        aprendizaje.push(it);
      } else if (e.proximaRevision <= hoyFin) {
        // paso pendiente para más tarde hoy: cuenta como pendiente pero no entra aún
      }
    }
  }

  // 1. Repasos que tocan, de menor a mayor recuperabilidad (primero lo que está a punto de olvidarse).
  repasos.sort((a, b) => a.r - b.r);
  aprendizaje.sort((a, b) => a.vence - b.vence);
  const pendientes = repasos.length;
  // Los atrasos se reparten: cada día se atiende como mucho `maxRepasosDia`, empezando por lo más urgente.
  const cupoRepasos = Math.max(0, maxRepasos - repasosHoy);
  const repasosHoyLista = repasos.slice(0, cupoRepasos);

  // 2. Palabras nuevas (si la cola no está desbordada) y direcciones recién desbloqueadas.
  const hayAtasco = pendientes > LIMITE_ATRASO;
  const porLeccion = (a, b) => (a.p.lektion ?? 999) - (b.p.lektion ?? 999) || a.orden - b.orden;
  nuevas.sort(porLeccion);
  desbloqueos.sort((a, b) => b.s - a.s || a.orden - b.orden);
  const cupoNuevas = hayAtasco || soloProbl ? 0 : Math.max(0, nuevasDia - nuevasHoy);
  const cupoDesbl = hayAtasco ? 0 : Math.max(0, nuevasDia - desbloqueosHoy);
  const nuevasLista = nuevas.slice(0, cupoNuevas).map((x) => item(x.p, x.dir, 'nueva', null));
  const desblLista = desbloqueos.slice(0, cupoDesbl).map((x) => item(x.p, x.dir, 'desbloqueo', null));

  for (const it of [...aprendizaje, ...repasosHoyLista, ...nuevasLista, ...desblLista]) enPlan.add(claveEstado(it.palabraId, it.dir));

  // 3. Hueco de refuerzo: palabras problemáticas aunque no les toque.
  const refuerzo = [];
  if (!soloProbl) {
    for (const [id, dirs] of probl) {
      const p = palabras.get(id);
      if (!pasaFiltros(p, filtros)) continue;
      for (const dir of dirs) {
        const clave = claveEstado(id, dir);
        const e = estados.get(clave);
        if (enPlan.has(clave) || e.ultimaRevision >= hoy0) continue;
        refuerzo.push(item(p, dir, 'refuerzo', e));
      }
    }
    refuerzo.sort((a, b) => a.r - b.r);
    refuerzo.length = Math.min(refuerzo.length, HUECO_REFUERZO);
  }

  let cuerpo = intercalar(repasosHoyLista, [...nuevasLista, ...desblLista]);
  cuerpo = intercalar(cuerpo, refuerzo);
  const plan = [...aprendizaje, ...cuerpo];
  const items = separar(plan.slice(0, tamano));

  return {
    items, total: plan.length, pendientes, atrasadas, hayAtasco,
    nuevas: nuevasLista.length, desbloqueos: desblLista.length, refuerzo: refuerzo.length,
    repasos: repasosHoyLista.length, aprendizaje: aprendizaje.length, problematicas: probl.size,
  };
}

/** Repasos previstos para los próximos `dias` días (hoy incluye lo atrasado). */
export function prevision(estados, ahora, dias = 7) {
  const out = new Array(dias).fill(0);
  const hoy0 = inicioDia(ahora);
  for (const e of estados.values()) {
    if (e.fase === 'nueva' || !e.proximaRevision) continue;
    const d = Math.max(0, Math.floor((inicioDia(e.proximaRevision) - hoy0 + DIA / 2) / DIA));
    if (d < dias) out[d]++;
  }
  return out;
}

/**
 * Elementos para un modo de juego libre en una dirección concreta:
 * primero lo que toca, luego lo más flojo y, por último, palabras sin empezar.
 */
export function elegirParaModo({ palabras, estados, ahora, dir, filtros = {}, cantidad = 15, rand = Math.random, permitirNuevas = true }) {
  const probl = filtros.soloProblematicas ? problematicas(palabras, estados) : null;
  const vistas = [], sinVer = [];
  for (const p of palabras.values()) {
    if (!pasaFiltros(p, filtros) || !dirsDe(p).includes(dir)) continue;
    if (probl && !probl.has(p.id)) continue;
    const e = estados.get(claveEstado(p.id, dir));
    const it = { palabraId: p.id, dir, tema: p.tema, raiz: p.de.toLowerCase().slice(0, 5), origen: 'libre' };
    if (!e || e.fase === 'nueva') { it.r = 0; sinVer.push(it); } else { it.r = recuperabilidad(e, ahora) + rand() * 0.02; vistas.push(it); }
  }
  vistas.sort((a, b) => a.r - b.r);
  const out = vistas.slice(0, cantidad);
  if (permitirNuevas && out.length < cantidad) out.push(...sinVer.slice(0, cantidad - out.length));
  return separar(out);
}
