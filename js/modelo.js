// Utilidades puras compartidas: identificadores, fechas, comparación de texto y predicados
// sobre el estado de aprendizaje. Nada aquí toca el DOM ni la base de datos.

export const DIA = 86400000;
export const MIN = 60000;

export const DIRS = ['de-es', 'es-de', 'articulo', 'formas'];
export const NOMBRE_DIR = { 'de-es': 'Alemán → español', 'es-de': 'Español → alemán', articulo: 'Artículo', formas: 'Formas del verbo' };
export const TIPOS = ['sustantivo', 'verbo', 'adjetivo', 'adverbio', 'expresion', 'otro'];
export const ARTICULOS = ['der', 'die', 'das'];

// ---------- Niveles (MCER) ----------

/** Ordena niveles "A2.2" < "B1.1" < "B1.2"; sin nivel al final. */
export function compararNiveles(a, b) {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return String(a).localeCompare(String(b), 'es', { numeric: true });
}

/** Clave de lección única entre niveles: "A2.2|3". */
export const claveLeccion = (p) => `${p.nivel || ''}|${p.lektion}`;

/** "A2.2 · Lektion 3" a partir de la clave. */
export function nombreLeccion(clave, conNivel = true) {
  const [nivel, lek] = String(clave).split('|');
  const l = lek === 'null' || lek === '' ? 'Sin lección' : 'Lektion ' + lek;
  return conNivel && nivel ? `${nivel} · ${l}` : l;
}

/** Estabilidad (días) a partir de la cual una dirección cuenta como dominada. */
export const UMBRAL_DOMINADA = 21;
/** Estabilidad de de→es que desbloquea el resto de direcciones. */
export const UMBRAL_DESBLOQUEO = 3;

// ---------- Identificadores ----------

export function idPalabra(p) {
  const de = String(p.de || '').toLowerCase().replace(/\s+/g, '');
  return `${de}|${p.articulo || '-'}|${p.tipo || 'otro'}`;
}

export const claveEstado = (palabraId, dir) => `${palabraId}#${dir}`;

/** Direcciones que aplican a una palabra. */
export function dirsDe(p) {
  const d = ['de-es', 'es-de'];
  if (p.tipo === 'sustantivo' && ARTICULOS.includes(p.articulo)) d.push('articulo');
  if (formasVerbo(p)) d.push('formas');
  return d;
}

/** Direcciones que cuentan para considerar una palabra dominada. */
export const dirsDominio = (p) => dirsDe(p).filter((d) => d !== 'formas');

export function estadoVacio(palabraId, dir) {
  return {
    clave: claveEstado(palabraId, dir), palabraId, dir, fase: 'nueva',
    estabilidad: 0, dificultad: 0, proximaRevision: 0, ultimaRevision: 0, primeraRevision: 0,
    repeticiones: 0, fallos: 0, aciertosSeguidos: 0, paso: 0, intervalo: 0, ultimas: [], ultimoFallo: 0,
  };
}

// ---------- Predicados de estado ----------

export const esDominadoEstado = (e) => !!e && e.fase === 'repaso' && e.estabilidad >= UMBRAL_DOMINADA;

/** Problemática: ≥4 olvidos sin haberse recuperado (5 aciertos seguidos) o <60 % en las últimas 10. */
export function esProblematicoEstado(e) {
  if (!e || e.fase === 'nueva') return false;
  if (e.fallos >= 4 && e.aciertosSeguidos < 5) return true;
  const u = e.ultimas || [];
  if (u.length >= 5) {
    const ok = u.reduce((a, b) => a + b, 0);
    if (ok / u.length < 0.6) return true;
  }
  return false;
}

export function tasaReciente(e) {
  const u = (e && e.ultimas) || [];
  return u.length ? u.reduce((a, b) => a + b, 0) / u.length : null;
}

/** Estado global de una palabra a partir de un Map clave→estado. */
export function resumenPalabra(p, estados) {
  const dirs = dirsDe(p);
  const es = dirs.map((d) => estados.get(claveEstado(p.id, d)));
  const principal = es[0];
  const vista = !!principal && principal.fase !== 'nueva';
  const dominada = dirsDominio(p).every((d) => esDominadoEstado(estados.get(claveEstado(p.id, d))));
  const problematica = es.some(esProblematicoEstado);
  const aprendiendo = es.some((e) => e && (e.fase === 'aprendiendo' || e.fase === 'reaprendiendo'));
  let fase = 'nueva';
  if (dominada) fase = 'dominada';
  else if (!vista) fase = 'nueva';
  else if (aprendiendo) fase = 'aprendiendo';
  else fase = 'repaso';
  return { fase, dominada, problematica, vista };
}

// ---------- Fechas ----------

const p2 = (n) => String(n).padStart(2, '0');

/** Fecha local AAAA-MM-DD. */
export function fechaLocal(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}

export function inicioDia(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const finDia = (ms) => inicioDia(ms) + DIA - 1;

/** Suma días naturales respetando cambios de hora. */
export function sumarDias(ms, n) {
  const d = new Date(ms);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function diasEntre(aISO, bISO) {
  const a = new Date(aISO + 'T12:00:00'), b = new Date(bISO + 'T12:00:00');
  return Math.round((b - a) / DIA);
}

/** Semana ISO (lunes a domingo, hora local): "2026-W46". */
export function semanaISO(ms) {
  const d = new Date(ms);
  d.setHours(12, 0, 0, 0);
  const dia = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - dia + 3); // jueves de esa semana
  const anio = d.getFullYear();
  const ene4 = new Date(anio, 0, 4, 12);
  const sem = 1 + Math.round(((d - ene4) / DIA - 3 + ((ene4.getDay() + 6) % 7)) / 7);
  return `${anio}-W${p2(sem)}`;
}

export function lunesDe(ms) {
  const d = new Date(inicioDia(ms));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function fechaCorta(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

/** "hoy", "mañana", "en 5 días", "hace 3 días". */
export function fechaRelativa(ms, ahora = Date.now()) {
  if (!ms) return '—';
  const d = Math.round((inicioDia(ms) - inicioDia(ahora)) / DIA);
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d === -1) return 'ayer';
  if (d > 1) return d < 60 ? `en ${d} días` : `en ${Math.round(d / 30)} meses`;
  return -d < 60 ? `hace ${-d} días` : `hace ${Math.round(-d / 30)} meses`;
}

// ---------- Texto ----------

const limpiar = (s) => String(s || '').normalize('NFC').replace(/[.,;:!?¿¡…"„“”«»]/g, ' ').replace(/\s+/g, ' ').trim();
const plegar = (s) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
const sinPuntos = (s) => s.toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
  .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');

/** Clave normalizada para buscar una respuesta en el vocabulario (detección de confusiones). */
export const claveTexto = (s) => plegar(limpiar(s));

/** Variantes aceptadas de una solución: alternativas con "/" y texto entre paréntesis opcional. */
export function variantes(correcta) {
  const out = new Set();
  const base = String(correcta || '');
  const partes = base.includes(' / ') ? base.split(' / ') : [base];
  for (const parte of partes) {
    out.add(limpiar(parte.replace(/[()]/g, '')));
    out.add(limpiar(parte.replace(/\([^)]*\)/g, '')));
    // "bäckt/backt" → dos variantes palabra a palabra
    if (/\S\/\S/.test(parte)) {
      const m = parte.match(/^(.*?)(\S+)\/(\S+)(.*)$/);
      if (m) { out.add(limpiar(m[1] + m[2] + m[4])); out.add(limpiar(m[1] + m[3] + m[4])); }
    }
  }
  out.delete('');
  return [...out];
}

/**
 * Compara una respuesta escrita con la solución en alemán.
 * ok: válida · casi: aceptada con error de umlaut (cuenta como "Difícil") ·
 * mayuscula: aviso de que el sustantivo debía ir en mayúscula.
 */
export function compararAleman(respuesta, correcta, { sustantivo = false } = {}) {
  const r = limpiar(respuesta);
  const vs = variantes(correcta);
  if (!r) return { ok: false, casi: false, mayuscula: false };
  const res = (extra) => ({ ok: true, casi: false, mayuscula: false, ...extra });
  const minusculaInicial = sustantivo && /^[a-zäöü]/.test(r);
  for (const v of vs) if (r === v) return res();
  for (const v of vs) if (r.toLowerCase() === v.toLowerCase()) return res({ mayuscula: minusculaInicial });
  for (const v of vs) if (plegar(r) === plegar(v)) return res({ mayuscula: minusculaInicial });
  for (const v of vs) if (sinPuntos(r) === sinPuntos(v)) return res({ casi: true, mayuscula: minusculaInicial });
  return { ok: false, casi: false, mayuscula: false };
}

/** Diferencias carácter a carácter (LCS). Devuelve tramos [{t, ok}] sobre la solución correcta. */
export function diferencias(respuesta, correcta) {
  const a = String(respuesta || ''), b = String(correcta || '');
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  const eq = (i, j) => a[i].toLowerCase() === b[j].toLowerCase();
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    L[i][j] = eq(i, j) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  }
  const out = [];
  const push = (t, ok) => { const u = out[out.length - 1]; if (u && u.ok === ok) u.t += t; else out.push({ t, ok }); };
  let i = 0, j = 0;
  while (j < m) {
    if (i < n && eq(i, j)) { push(b[j], true); i++; j++; }
    else if (i < n && L[i + 1][j] >= L[i][j + 1]) i++;
    else { push(b[j], false); j++; }
  }
  return out;
}

// ---------- Verbos ----------

/** Extrae {presente, perfecto} de las notas ("er fährt, ist gefahren"). null si no hay formas. */
export function formasVerbo(p) {
  if (!p || p.tipo !== 'verbo' || !p.notas) return null;
  for (const seg of String(p.notas).split(';')) {
    const m = seg.trim().match(/^(?:(?:er|sie|es|man)(?:\/sie(?:\/es)?)?\s+)?(\S.*?),\s*((?:hat|ist)(?:\/(?:hat|ist))?\s+\S.*)$/);
    if (m && !/[:=«]/.test(m[1])) return { presente: m[1].trim(), perfecto: m[2].trim() };
  }
  return null;
}

// ---------- Varios ----------

/** Generador pseudoaleatorio con semilla (mulberry32) para pruebas reproducibles. */
export function crearRand(semilla = 1) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function barajar(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Texto alemán para mostrar: con artículo en los sustantivos. */
export const conArticulo = (p) => (p.articulo ? `${p.articulo} ${p.de}` : p.de);
