# Vokabeln

App para aprender vocabulario de alemán en el iPhone, sin App Store. Es una PWA: archivos estáticos (HTML, CSS y JavaScript sin compilar) que se alojan gratis en GitHub Pages y se instalan desde Safari. No hay servidor ni nube: **todos los datos viven en el teléfono** (IndexedDB) y la app funciona sin conexión.

- Interfaz en español, contenido en alemán.
- Incluye `data/vokabeln.json` (1247 palabras, nivel A2.2, lecciones 1–12 y verbos irregulares), que se carga solo la primera vez.
- Repetición espaciada con FSRS-5, historial completo de respuestas, nueve modos de juego (incluidos sinónimos y antónimos), estadísticas, XP, racha y retos semanales.
- Vocabulario clasificado por nivel (A2.2, B1.1…) y en 11 temas generales.

## 1. Subir la app a GitHub Pages

1. Entra en [github.com](https://github.com) y crea un repositorio nuevo (botón **New**). Ponle un nombre, por ejemplo `vokabeln`, y márcalo como **Public** (GitHub Pages gratis solo funciona con repositorios públicos).
2. Sube todos los archivos de esta carpeta tal cual, respetando las subcarpetas (`css/`, `js/`, `icons/`, `data/`…). Desde la web: **Add file → Upload files**, arrastra todo y pulsa **Commit changes**. Desde el ordenador:
   ```bash
   git remote add origin https://github.com/TU_USUARIO/vokabeln.git
   ```
   ```bash
   git push -u origin main
   ```
3. En el repositorio, ve a **Settings → Pages**. En *Build and deployment* elige **Source: Deploy from a branch**, rama **main**, carpeta **/ (root)** y pulsa **Save**.
4. Espera uno o dos minutos. La app estará en `https://TU_USUARIO.github.io/vokabeln/`.

No hay paso de compilación: lo que subes es lo que se sirve. Todas las rutas son relativas, así que funciona en cualquier subdirectorio.

## 2. Instalarla en el iPhone

1. Abre la dirección de la app en **Safari** (tiene que ser Safari).
2. Pulsa el botón **Compartir** (el cuadrado con la flecha hacia arriba).
3. Elige **Añadir a pantalla de inicio** y confirma.
4. Abre la app desde el icono nuevo. La primera vez carga el vocabulario; a partir de ahí funciona sin conexión.

Importante: la app instalada guarda sus datos por separado de Safari. Usa siempre el icono de la pantalla de inicio y **exporta una copia de seguridad de vez en cuando** (Ajustes → Exportar copia). Si borras el icono, iOS borra también los datos.

## 3. Publicar una actualización

La app guarda todos sus archivos en una caché del teléfono, así que tras cambiar algo hay que avisarle de que hay versión nueva:

1. Haz los cambios que quieras en los archivos.
2. Abre `sw.js` y **sube el número de versión de la caché**: `const CACHE = 'vokabeln-v1';` → `'vokabeln-v2'`, y así sucesivamente.
3. Si has añadido archivos nuevos (por ejemplo otro `.js`), añádelos también a la lista `ARCHIVOS` de `sw.js`.
4. Sube los cambios a GitHub (rama `main`).
5. La próxima vez que abras la app aparecerá el aviso **"Hay una actualización, toca para recargar"**. Al tocarlo se activa la versión nueva y se borra la caché anterior. Tus datos no se tocan.

Si no subes el número de versión, el teléfono seguirá usando los archivos antiguos.

## 4. Formato JSON de importación

En **Ajustes → Importar vocabulario** puedes importar desde un archivo, pegando el texto o desde una URL. El formato es el mismo que el de `data/vokabeln.json`:

```json
{
  "version": 1,
  "nivel": "A2.2",
  "palabras": [
    {
      "de": "Flohmarkt",
      "articulo": "der",
      "plural": "Flohmärkte",
      "es": "mercadillo (de segunda mano)",
      "tipo": "sustantivo",
      "nivel": "A2.2",
      "lektion": 1,
      "tema": "Tiempo libre",
      "lote": "Lektion 1",
      "ejemplo": "Am Samstag gehen wir auf den Flohmarkt.",
      "notas": null,
      "etiquetas": [],
      "revisar": false
    }
  ]
}
```

| Campo | Obligatorio | Valores |
|---|---|---|
| `de` | sí | la palabra en alemán |
| `es` | sí | la traducción |
| `articulo` | no | `der`, `die`, `das` o `null` |
| `tipo` | no | `sustantivo`, `verbo`, `adjetivo`, `adverbio`, `expresion`, `otro` (por defecto `otro`) |
| `plural`, `nivel`, `tema`, `lote`, `ejemplo`, `notas` | no | texto o `null`. `ejemplo` admite varios separados por ` \| ` |
| `lektion` | no | número o `null` |
| `etiquetas` | no | lista de textos, p. ej. `["verbo irregular"]` |
| `revisar` | no | `true` si conviene revisar la traducción |
| `compleja` | no | `true` si la palabra es difícil aunque sea de un nivel que ya conoces (no pasa a repaso con "Ya lo conozco") |

**Nivel.** Pon el nivel de cada archivo en `"nivel"` (arriba del todo o en cada palabra), con el formato `A2.2`, `B1.1`, `B1.2`… Las lecciones se distinguen por nivel: la Lektion 3 de B1.1 no se mezcla con la Lektion 3 de A2.2.

**Temas.** Para que no vuelvan a multiplicarse, usa siempre uno de estos 11:

| Tema | Qué incluye |
|---|---|
| Familia, relaciones y fiestas | familia, etapas de la vida, vecinos, celebraciones, ayudar a otros |
| Sentimientos y opiniones | emociones, dar la opinión, consejos, propuestas |
| Estudios y aprendizaje | colegio, universidad, exámenes, aprender, presentaciones |
| Trabajo y profesiones | profesiones, buscar trabajo, el día a día en el trabajo |
| Ocio, cultura y deporte | tiempo libre, deporte, cine, música, arte, excursiones |
| Medios y comunicación | aparatos, internet, noticias, teléfono |
| Casa, hogar y animales | vivienda, mudanzas, medidas, energía en casa, animales |
| Ciudad, transporte y viajes | ciudad, coche, tren, avión, tráfico, viajes, restaurantes y hoteles |
| Trámites y servicios | administración, banco, policía, atención al cliente |
| Palabras útiles | palabras y expresiones generales, conectores, comparaciones |
| Verbos irregulares | la lista de verbos irregulares |

**Sinónimos y antónimos (opcional).** Puedes añadir una lista `relaciones` al mismo archivo (o en un archivo que solo tenga `relaciones`):

```json
{
  "version": 1,
  "nivel": "B1.1",
  "palabras": [ … ],
  "relaciones": [
    { "tipo": "sinonimos", "significado": "empezar", "palabras": [ { "de": "anfangen", "es": "empezar" }, { "de": "beginnen", "es": "comenzar" } ] },
    { "tipo": "antonimos", "palabras": [ { "de": "billig", "es": "barato" }, { "de": "teuer", "es": "caro" } ] }
  ]
}
```

- `sinonimos`: dos o más palabras que significan lo mismo. Cada palabra solo debería estar en un grupo de sinónimos.
- `antonimos`: exactamente dos palabras contrarias.
- `es` es opcional si la palabra ya está en tu vocabulario. Las palabras que no estén en él también valen como fichas del juego, pero no tienen repaso propio.

**Instrucción para la IA que genera los archivos.** Puedes copiarle esto:

> Usa el formato JSON de Vokabeln. Pon `"nivel": "B1.1"` (o el que corresponda). En `tema` usa solo uno de estos: Familia, relaciones y fiestas · Sentimientos y opiniones · Estudios y aprendizaje · Trabajo y profesiones · Ocio, cultura y deporte · Medios y comunicación · Casa, hogar y animales · Ciudad, transporte y viajes · Trámites y servicios · Palabras útiles · Verbos irregulares. Marca `"compleja": true` en las palabras con régimen preposicional o de caso, en las que se confunden fácilmente con otras y en las que tengan una traducción corregida. Añade una lista `relaciones` con los grupos de sinónimos y las parejas de antónimos que aparezcan en la lección, completándolos con palabras básicas si hace falta.

Reglas:

- El identificador de cada palabra es `de` (en minúsculas y sin espacios) + `articulo` + `tipo`.
- Las palabras nuevas se añaden. Las que ya existen actualizan sus textos y **conservan todo su progreso e historial**.
- Al terminar se muestra un resumen: "12 nuevas, 3 actualizadas, 1 con error". Las palabras con error se saltan y el resto se importa.
- Un sustantivo sin artículo (p. ej. "Jura") se importa igual, pero no sale en Der · Die · Das.
- Para el modo Verbos irregulares, las formas se leen de `notas` con este patrón: `er fährt, ist gefahren` (el "er" es opcional y puede haber más notas separadas por `;`).
- Desde una URL, el servidor tiene que permitir el acceso desde otras webs (CORS). Los enlaces "raw" de GitHub funcionan.

Las **copias de seguridad** (Ajustes → Exportar copia) son otro archivo distinto: contienen palabras, progreso, historial completo, estadísticas y retos, y se recuperan con "Restaurar copia", que reemplaza todo.

## 5. Cómo decide la app qué preguntarte

**Cada palabra tiene una "memoria" por dirección.** Reconocer *Flohmarkt* (alemán → español), saber decirlo (español → alemán) y recordar que es *der* (artículo) son cosas distintas, y cada una tiene su propio estado. Los verbos irregulares tienen además una cuarta, la de sus formas.

**Para cada una, la app estima cuánto tardarás en olvidarla.** Usa el algoritmo FSRS, el mismo que Anki. Guarda dos números: la *estabilidad* (cuántos días aguanta la palabra en tu memoria) y la *dificultad* (de 1 a 10). Con ellos calcula la probabilidad de que te acuerdes hoy y programa el siguiente repaso para el día en que esa probabilidad baje al 90 % (configurable). Si aciertas, la estabilidad crece y el siguiente repaso se aleja; si fallas, se acorta mucho. El intervalo máximo es de 180 días, y se añade un poco de azar para que no se junten todos los repasos el mismo día.

**La nota de cada respuesta se deduce sola**, sin preguntarte:

| Nota | Cuándo |
|---|---|
| 1 · Otra vez | fallo |
| 2 · Difícil | acierto lento (más del doble de tu tiempo medio) o escrito con un error de diéresis aceptado |
| 3 · Bien | acierto normal |
| 4 · Fácil | acierto rápido escribiendo |

El test de cuatro opciones y Der · Die · Das nunca dan "Fácil", porque acertar ahí es más sencillo. En Contrarreloj el tiempo no cuenta. En Tarjetas te evalúas tú con los cuatro botones.

**Niveles.** En Ajustes → Niveles eliges el nivel que estás cursando (por defecto B1.1); sus palabras nuevas salen antes que las de otros niveles. Para un nivel anterior que ya conoces, "Ya lo conozco" pasa sus palabras a repaso en vez de presentarlas como nuevas. Esos repasos se reparten en los próximos meses, unos 17 al día, y sirven para comprobar que de verdad las sabes. Una palabra pasada así no cuenta como dominada hasta que la aciertas. Se exceptúan las palabras marcadas como **complejas** 🧠, que siguen como nuevas: las de traducción corregida, las que se confunden con otra y las que llevan preposición fija (*sich interessieren für*, *stolz auf*…). Puedes marcar o desmarcar cualquier palabra como compleja desde su ficha, y "Deshacer" devuelve a nuevas las que todavía no hayas respondido.

**Una palabra nueva o fallada se repite en la misma sesión**, al cabo de 1 y 10 minutos aproximadamente, hasta que la aciertas. Solo entonces pasa a intervalos de días. Si fallas la misma tres veces seguidas, sale de la sesión y vuelve mañana.

**El "Repaso de hoy" se arma así:**

1. Primero lo que toca hoy, empezando por lo que estás más cerca de olvidar.
2. Hasta 10 palabras nuevas al día, por orden de lección. Si tienes más de 100 repasos pendientes, no entran nuevas hasta que bajes la cola.
3. Un hueco de refuerzo con hasta 3 palabras problemáticas, aunque no les toque.

Las preguntas se mezclan y se evita que salgan seguidas dos palabras del mismo tema o parecidas. Si un día no estudias, los atrasos no caen todos de golpe: se atienden como mucho 100 repasos al día (configurable), empezando por los más urgentes.

**Las direcciones se desbloquean en orden.** Una palabra empieza en alemán → español. Cuando la aciertas en un día posterior al que la aprendiste y su estabilidad es de al menos 3 días, se desbloquean español → alemán (escribiendo), el artículo y, en los verbos irregulares, las formas. Entran como mucho 10 direcciones nuevas al día.

**Dominada**: una palabra lo está cuando alemán → español, español → alemán y el artículo tienen todas una estabilidad de 21 días o más.

**Problemática**: una palabra con 4 olvidos o más después de haberla aprendido, o con menos del 60 % de acierto en sus últimas 10 respuestas (con un mínimo de 5). Se marca con ⚠️, da más XP, muestra más ayuda cuando la fallas (ejemplo, notas y artículo en su color) y tiene su propia sesión de Refuerzo. Deja de serlo cuando su acierto reciente se recupera y encadenas 5 aciertos seguidos.

**Sinónimos y antónimos.** En "Agrupa sinónimos" aparecen 3 o 4 grupos mezclados y juntas los que significan lo mismo. En "Une antónimos" emparejas cada palabra con su contrario. Los tableros nunca mezclan sinónimos que se presten a confusión: por ejemplo, *leicht/schwer* y *einfach/kompliziert* no salen a la vez, porque *leicht* y *einfach* son sinónimos. Salen antes las relaciones que incluyen palabras tuyas ya empezadas y flojas. Cada palabra de tu vocabulario que ya hayas empezado registra un acierto o un fallo en reconocimiento (alemán → español). Si usas la pista de traducción, el acierto cuenta como "Difícil".

**Confusiones**: si al escribir pones otra palabra de tu vocabulario, o en el test eliges una opción equivocada, la app guarda la pareja. Esas palabras aparecerán como opciones falsas la una de la otra, y las parejas que confundes dos veces o más salen juntas en el modo Refuerzo. También detecta si fallas sobre todo una pareja de artículos (por ejemplo *die* y *das*) y te pone más sustantivos de esos géneros.

Con los ajustes por defecto, la simulación de `tests.html` (60 días seguidos con un 85 % de acierto) da unas 115 respuestas al día de media, unos 17 minutos, con 600 palabras empezadas. Si además das A2 por conocido, sube a unas 140 al día, unos 21 minutos. Hacia el segundo mes se llega a los 100 repasos diarios y algunos días no entran palabras nuevas. Si se te hace mucho, baja las palabras nuevas por día o sube los repasos máximos.

## 6. Desarrollo y pruebas

No hace falta instalar nada. Para probar en el ordenador:

```bash
python3 -m http.server 8000
```

- App: `http://localhost:8000/`
- Pruebas: `http://localhost:8000/tests.html`. Cubren el algoritmo, el planificador, la importación, los retos y la simulación de 60 días.

Estructura:

| Archivo | Qué hace |
|---|---|
| `index.html`, `manifest.json`, `sw.js` | página, manifiesto de la PWA y service worker ("cache first") |
| `js/app.js` | arranque y navegación |
| `js/db.js` | IndexedDB, con migraciones versionadas |
| `js/modelo.js` | utilidades puras: identificadores, fechas, comparación de texto |
| `js/srs.js` | FSRS-5 y calificación automática (funciones puras) |
| `js/scheduler.js` | arma las sesiones |
| `js/history.js` | registro de respuestas, agregados y palabras problemáticas |
| `js/stats.js`, `js/challenges.js` | XP, niveles, racha, medallas y retos semanales |
| `js/import.js` | importación, revisiones del vocabulario incluido y copias de seguridad |
| `js/niveles.js` | niveles: "Ya lo conozco" y su deshacer |
| `js/relaciones.js` | sinónimos y antónimos: validación y tableros sin ambigüedades |
| `js/games/` | un archivo por modo de juego, más `sesion.js`, que los ejecuta |
| `js/vistas/` | las pantallas |
| `tools/generar-iconos.mjs` | regenera los iconos PNG (solo para desarrollo) |

Para cambiar el esquema de la base de datos, añade una función a `MIGRACIONES` en `js/db.js` y sube `VERSION_BD`. Antes de migrar, la app guarda sola una copia completa en el almacén `backups` (conserva las 3 últimas), que se puede restaurar en Ajustes → Copias automáticas. Las reglas completas están en `CLAUDE.md`.

El vocabulario incluido lleva un número `revision`. Si lo cambias, por ejemplo para reorganizar temas, súbelo: al actualizar, la app aplicará los campos `tema` y `compleja` a las palabras ya instaladas sin tocar el progreso. Las palabras que hayas editado a mano no se tocan. Lo mismo vale para `data/relaciones.json`.
