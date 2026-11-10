// Registro de respuestas y estadísticas. Cada respuesta genera un registro de historial
// (que nunca se borra) y actualiza de forma incremental los agregados, de modo que ninguna
// pantalla necesita recorrer el historial completo.

import {
  mem, estadoDe, diaDe, guardarRespuesta, guardarEstados, borrarEstados, historialDesde,
} from './db.js';
import {
  claveEstado, dirsDe, dirsDominio, esProblematicoEstado, estadoVacio, fechaLocal, resumenPalabra,
  inicioDia, sumarDias, DIA, ARTICULOS, lunesDe, claveLeccion,
} from './modelo.js';
import { siguiente, calificar, aplazarAManana, estadoSabido, recuperabilidad } from './srs.js';
import { xpDeRespuesta, sumarDiaDeRacha, comprobarMedallas, nivelDe } from './stats.js';
import { registrarEventos } from './challenges.js';

const sumar = (obj, clave, acierto) => {
  const k = String(clave ?? '—');
  const x = obj[k] || (obj[k] = { ok: 0, total: 0 });
  x.total++; if (acierto) x.ok++;
};

const opcionesSrs = () => ({ retencion: mem.ajustes.retencion, intervaloMax: mem.ajustes.intervaloMax });

// ---------- Resumen global (con caché por versión de los datos) ----------

let cache = { version: -1, valor: null };

/** Recuento de palabras por fase, lecciones completas y lista de problemáticas. */
export function resumenGlobal() {
  if (cache.version === mem.version) return cache.valor;
  const r = { total: 0, nuevas: 0, aprendiendo: 0, repaso: 0, dominadas: 0, problematicas: [], vistas: 0, sustantivosVistos: 0, leccionesCompletas: 0 };
  const lecciones = new Map();
  for (const p of mem.palabras.values()) {
    const s = resumenPalabra(p, mem.estados);
    r.total++;
    r[s.fase === 'dominada' ? 'dominadas' : s.fase === 'nueva' ? 'nuevas' : s.fase]++;
    if (s.vista) { r.vistas++; if (p.tipo === 'sustantivo') r.sustantivosVistos++; }
    if (s.problematica) r.problematicas.push(p.id);
    if (p.lektion != null) {
      const l = lecciones.get(p.lektion) || { n: 0, dom: 0 };
      l.n++; if (s.dominada) l.dom++;
      lecciones.set(p.lektion, l);
    }
  }
  for (const l of lecciones.values()) if (l.n > 0 && l.dom === l.n) r.leccionesCompletas++;
  cache = { version: mem.version, valor: r };
  return r;
}

const contextoMedallas = () => {
  const r = resumenGlobal();
  return { global: mem.global, dominadas: r.dominadas, leccionesCompletas: r.leccionesCompletas };
};

// ---------- Registrar una respuesta ----------

/**
 * Registra una respuesta en cualquier modo de juego.
 * r: { palabraId, dir, modo, acierto, ms, respuesta, casi, sinTiempo, manual, confundidaCon, articuloPuesto, combo, ahora }
 * Devuelve { calificacion, antes, despues, xp, medallas, retos, subeNivel, problematica, rachaNueva }.
 */
export async function registrarRespuesta(r) {
  const ahora = r.ahora ?? Date.now();
  const p = mem.palabras.get(r.palabraId);
  if (!p) throw new Error('Palabra desconocida: ' + r.palabraId);
  const antes = estadoDe(p.id, r.dir);
  const resumenAntes = resumenPalabra(p, mem.estados);
  const media = mem.agregados.tiempos[r.modo]?.media;
  const calificacion = calificar({ ...r, mediaMs: media });
  const despues = siguiente(antes, calificacion, ahora, opcionesSrs());

  const registro = {
    palabraId: p.id, dir: r.dir, fecha: ahora, modo: r.modoJuego || r.modo, resultado: r.acierto ? 'acierto' : 'fallo',
    calificacion, ms: Math.round(r.ms || 0), respuesta: r.acierto ? null : (r.respuesta ?? null),
    intervaloPrevio: antes.intervalo || 0, intervaloNuevo: despues.intervalo || 0,
  };

  // Agregados incrementales
  const ag = mem.agregados;
  sumar(ag.porDir, r.dir, r.acierto);
  sumar(ag.porTipo, p.tipo, r.acierto);
  sumar(ag.porTema, p.tema, r.acierto);
  sumar(ag.porLektion, claveLeccion(p), r.acierto);
  sumar(ag.porNivel, p.nivel || 'sin', r.acierto);
  if (r.dir === 'articulo' && r.articuloPuesto && ARTICULOS.includes(p.articulo)) {
    const fila = ag.articulos[p.articulo] || (ag.articulos[p.articulo] = { der: 0, die: 0, das: 0 });
    fila[r.articuloPuesto] = (fila[r.articuloPuesto] || 0) + 1;
  }
  if (r.acierto && r.ms > 0 && !r.sinTiempo && !r.manual) {
    const t = ag.tiempos[r.modo] || (ag.tiempos[r.modo] = { media: r.ms, n: 0 });
    t.n++;
    t.media = t.n < 8 ? t.media + (r.ms - t.media) / t.n : t.media * 0.92 + r.ms * 0.08;
  }
  if (!r.acierto && r.confundidaCon && r.confundidaCon !== p.id) {
    const k = `${p.id}>${r.confundidaCon}`;
    const par = mem.confusiones.pares[k] || (mem.confusiones.pares[k] = { n: 0, ultima: 0 });
    par.n++; par.ultima = ahora;
  }

  // Resumen del día
  const hoy = fechaLocal(ahora);
  const dia = { ...diaDe(hoy) };
  dia.repasadas++;
  if (r.acierto) dia.aciertos++; else dia.fallos++;
  dia.ms += Math.min(Math.max(r.ms || 0, 0), 60000);
  if (antes.fase === 'nueva' && r.dir === 'de-es') dia.nuevas++;
  if (antes.fase === 'repaso') { dia.maduras++; if (r.acierto) dia.madurasOk++; }

  // XP y eventos de retos
  const eraProblematica = esProblematicoEstado(antes);
  const xp = xpDeRespuesta({ modo: r.modo, acierto: r.acierto, calificacion, problematica: resumenAntes.problematica, combo: r.combo || 0 });
  const g = mem.global;
  const nivelAntes = nivelDeXp(g.xp);
  g.totalRespuestas++;
  if (r.acierto) g.comboMax = Math.max(g.comboMax || 0, (r.combo || 0) + 1);

  mem.estados.set(despues.clave, despues);
  const resumenDespues = resumenPalabra(p, mem.estados);
  const eventos = [{ evento: 'respuesta' }];
  if (r.acierto && r.dir === 'articulo') eventos.push({ evento: 'articuloOk' });
  if (r.acierto && (r.modo === 'escribir' || r.modo === 'verbos')) eventos.push({ evento: 'escritaOk' });
  if (!resumenAntes.dominada && resumenDespues.dominada) { eventos.push({ evento: 'dominada' }); dia.dominadas++; }
  if (resumenAntes.problematica && !resumenDespues.problematica) eventos.push({ evento: 'problematicaResuelta' });

  let rachaNueva = false;
  if (dia.repasadas >= mem.ajustes.objetivoDiario && g.ultimoDiaActivo !== hoy) {
    rachaNueva = sumarDiaDeRacha(g, hoy);
    if (rachaNueva) eventos.push({ evento: 'diaCumplido' });
  }
  if (xp > 0) eventos.push({ evento: 'xp', cantidad: xp });

  const retos = await registrarEventos(eventos, ahora);
  let xpTotal = xp;
  for (const reto of retos) { xpTotal += reto.xp; g.retosCompletados = (g.retosCompletados || 0) + 1; }
  g.xp += xpTotal;
  dia.xp += xpTotal;

  await guardarRespuesta({ estados: [despues], registros: [registro], dia });
  const medallas = comprobarMedallas(contextoMedallas(), ahora);
  if (medallas.length) await guardarRespuesta({});

  return {
    calificacion, antes, despues, xp, xpTotal, medallas, retos, rachaNueva,
    subeNivel: nivelDeXp(g.xp) > nivelAntes ? nivelDeXp(g.xp) : 0,
    problematica: resumenAntes.problematica || eraProblematica || esProblematicoEstado(despues),
  };
}

const nivelDeXp = (xp) => nivelDe(xp).nivel;

/**
 * Recalcula desde el historial los agregados que dependen de los datos de cada palabra
 * (tema, nivel, tipo y lección), p. ej. tras reorganizar los temas. Se hace una sola vez.
 */
export async function recalcularAgregados() {
  const ag = mem.agregados;
  ag.porTema = {}; ag.porNivel = {}; ag.porTipo = {}; ag.porLektion = {};
  for (const r of await historialDesde(0)) {
    const p = mem.palabras.get(r.palabraId);
    if (!p) continue;
    const ok = r.resultado === 'acierto';
    sumar(ag.porTema, p.tema, ok); sumar(ag.porNivel, p.nivel || 'sin', ok);
    sumar(ag.porTipo, p.tipo, ok); sumar(ag.porLektion, claveLeccion(p), ok);
  }
  await guardarRespuesta({});
}

/** Tablero de sinónimos/antónimos resuelto: XP extra y progreso de retos. */
export async function registrarTablero({ errores = 0 } = {}, ahora = Date.now()) {
  return sumarXp(errores ? 8 : 15, ahora, [{ evento: 'tableroOk' }]);
}

/** XP extra (récord de Contrarreloj, etc.). */
export async function sumarXp(cantidad, ahora = Date.now(), eventos = []) {
  const hoy = fechaLocal(ahora);
  const dia = { ...diaDe(hoy) };
  dia.xp += cantidad;
  mem.global.xp += cantidad;
  const retos = await registrarEventos([{ evento: 'xp', cantidad }, ...eventos], ahora);
  for (const reto of retos) { mem.global.xp += reto.xp; dia.xp += reto.xp; mem.global.retosCompletados++; }
  await guardarRespuesta({ dia });
  return retos;
}

/** Resultado de una partida de Contrarreloj. Devuelve { record, retos, medallas }. */
export async function registrarContrarreloj(puntos, ahora = Date.now()) {
  const g = mem.global;
  const record = puntos > (g.recordContrarreloj || 0);
  g.partidasContrarreloj = (g.partidasContrarreloj || 0) + 1;
  if (record) g.recordContrarreloj = puntos;
  const retos = await registrarEventos([{ evento: 'contrarreloj', cantidad: puntos }], ahora);
  for (const reto of retos) { g.xp += reto.xp; g.retosCompletados++; }
  const medallas = comprobarMedallas(contextoMedallas(), ahora);
  await guardarRespuesta({});
  return { record, retos, medallas };
}

// ---------- Acciones sobre el progreso ----------

/** Tres fallos seguidos en una sesión: fuera de la sesión y vuelve mañana. */
export async function aplazar(palabraId, dir, ahora = Date.now()) {
  const e = estadoDe(palabraId, dir);
  if (e.fase === 'nueva') return;
  await guardarEstados([aplazarAManana(e, ahora)]);
}

export async function reiniciarProgreso(palabraId) {
  const p = mem.palabras.get(palabraId);
  await borrarEstados(dirsDe(p).map((d) => claveEstado(palabraId, d)));
}

export async function marcarSabida(palabraId, ahora = Date.now()) {
  const p = mem.palabras.get(palabraId);
  const lista = dirsDominio(p).map((d) => estadoSabido(mem.estados.get(claveEstado(palabraId, d)) || estadoVacio(palabraId, d), ahora, opcionesSrs()));
  await guardarEstados(lista);
}

// ---------- Consultas para estadísticas ----------

/** Retención real: porcentaje de repasos (palabras ya aprendidas) acertados en los últimos `dias` días. */
export function retencionReal(dias = 30, ahora = Date.now()) {
  let ok = 0, total = 0;
  const desde = fechaLocal(sumarDias(inicioDia(ahora), -dias + 1));
  for (const d of mem.dias.values()) if (d.fecha >= desde) { ok += d.madurasOk || 0; total += d.maduras || 0; }
  return { ok, total, tasa: total ? ok / total : null };
}

/** Suma de los resúmenes diarios entre dos instantes. */
export function sumaDias(desdeMs, hastaMs) {
  const a = fechaLocal(desdeMs), b = fechaLocal(hastaMs);
  const s = { repasadas: 0, aciertos: 0, fallos: 0, xp: 0, ms: 0, dominadas: 0, activos: 0 };
  for (const d of mem.dias.values()) {
    if (d.fecha < a || d.fecha > b) continue;
    s.repasadas += d.repasadas; s.aciertos += d.aciertos; s.fallos += d.fallos; s.xp += d.xp; s.ms += d.ms; s.dominadas += d.dominadas || 0;
    if (d.repasadas >= mem.ajustes.objetivoDiario) s.activos++;
  }
  return s;
}

/** Ranking de palabras problemáticas con tasa de acierto, fallos y último fallo. */
export function rankingProblematicas() {
  const out = [];
  for (const id of resumenGlobal().problematicas) {
    const p = mem.palabras.get(id);
    let ok = 0, n = 0, fallos = 0, ultimo = 0;
    for (const d of dirsDe(p)) {
      const e = mem.estados.get(claveEstado(id, d));
      if (!e) continue;
      const u = e.ultimas || [];
      ok += u.reduce((a, b) => a + b, 0); n += u.length; fallos += e.fallos || 0; ultimo = Math.max(ultimo, e.ultimoFallo || 0);
    }
    out.push({ palabra: p, tasa: n ? ok / n : 0, fallos, ultimoFallo: ultimo });
  }
  return out.sort((a, b) => a.tasa - b.tasa || b.fallos - a.fallos);
}

/** Palabras más sólidas: mayor estabilidad y racha de aciertos. */
export function rankingMejores(n = 10) {
  const out = [];
  for (const p of mem.palabras.values()) {
    const e = mem.estados.get(claveEstado(p.id, 'de-es'));
    if (!e || e.fase !== 'repaso') continue;
    let estab = Infinity, racha = Infinity;
    for (const d of dirsDominio(p)) {
      const x = mem.estados.get(claveEstado(p.id, d));
      estab = Math.min(estab, x && x.fase !== 'nueva' ? x.estabilidad : 0);
      racha = Math.min(racha, x ? x.aciertosSeguidos : 0);
    }
    out.push({ palabra: p, estabilidad: Math.max(estab, 0) || e.estabilidad, racha: racha || e.aciertosSeguidos, propia: e.estabilidad });
  }
  return out.sort((a, b) => b.estabilidad - a.estabilidad || b.racha - a.racha || b.propia - a.propia).slice(0, n);
}

/** Confusiones más frecuentes: [{ correcta, puesta, n, ultima }]. */
export function confusionesFrecuentes(min = 1) {
  const out = [];
  for (const [k, v] of Object.entries(mem.confusiones.pares)) {
    const [a, b] = k.split('>');
    const correcta = mem.palabras.get(a), puesta = mem.palabras.get(b);
    if (correcta && puesta && v.n >= min) out.push({ correcta, puesta, n: v.n, ultima: v.ultima });
  }
  return out.sort((x, y) => y.n - x.n || y.ultima - x.ultima);
}

/** Ids de las palabras con las que se suele confundir una dada (en ambos sentidos). */
export function confundidasCon(palabraId) {
  const out = new Map();
  for (const [k, v] of Object.entries(mem.confusiones.pares)) {
    const [a, b] = k.split('>');
    if (a === palabraId && mem.palabras.has(b)) out.set(b, (out.get(b) || 0) + v.n);
    if (b === palabraId && mem.palabras.has(a)) out.set(a, (out.get(a) || 0) + v.n);
  }
  return [...out.entries()].sort((x, y) => y[1] - x[1]).map((x) => x[0]);
}

/**
 * Patrón de error en los artículos. Devuelve la pareja de géneros que más se confunde
 * ({ a, b, fallos, tasa }) o null si no hay un patrón claro.
 */
export function patronArticulos() {
  const m = mem.agregados.articulos || {};
  let total = 0, fallosTotales = 0;
  const pares = {};
  for (const real of ARTICULOS) for (const puesto of ARTICULOS) {
    const n = (m[real] && m[real][puesto]) || 0;
    total += n;
    if (real !== puesto && n) { fallosTotales += n; const k = [real, puesto].sort().join('/'); pares[k] = (pares[k] || 0) + n; }
  }
  if (fallosTotales < 5) return null;
  const [k, fallos] = Object.entries(pares).sort((x, y) => y[1] - x[1])[0];
  if (fallos / fallosTotales < 0.45) return null;
  const [a, b] = k.split('/');
  return { a, b, fallos, proporcion: fallos / fallosTotales, total };
}

/** Sustantivos ya vistos de los géneros indicados, de menor a mayor recuperabilidad. */
export function sustantivosDeGenero(generos, cantidad, ahora = Date.now()) {
  const out = [];
  for (const p of mem.palabras.values()) {
    if (p.tipo !== 'sustantivo' || !generos.includes(p.articulo)) continue;
    const e = mem.estados.get(claveEstado(p.id, 'articulo')) || mem.estados.get(claveEstado(p.id, 'de-es'));
    if (!e || e.fase === 'nueva') continue;
    out.push({ p, r: recuperabilidad(e, ahora) });
  }
  return out.sort((a, b) => a.r - b.r).slice(0, cantidad).map((x) => x.p);
}

/** Datos de actividad reciente y puntos débiles para generar los retos de la semana. */
export function contextoRetos(ahora = Date.now()) {
  const lunes = lunesDe(ahora);
  const pasada = sumaDias(lunes - 7 * DIA + DIA / 2, lunes - DIA / 2);
  const r = resumenGlobal();
  const tasa = (x) => (x && x.total >= 10 ? x.ok / x.total : null);
  const ag = mem.agregados;
  return {
    repasosSemana: pasada.repasadas, dominadasSemana: pasada.dominadas, xpSemana: pasada.xp, diasActivos: pasada.activos,
    problematicas: r.problematicas.length, vistas: r.vistas, sustantivosVistos: r.sustantivosVistos,
    tasaArticulos: tasa(ag.porDir.articulo), tasaEsDe: tasa(ag.porDir['es-de']),
    escritasSemana: Math.round(pasada.aciertos * 0.3), record: mem.global.recordContrarreloj || 0,
    relaciones: mem.relaciones.length,
  };
}
