# Vokabeln — instrucciones para Claude

PWA de vocabulario alemán (HTML + CSS + JS sin compilar, GitHub Pages). Todos los datos del usuario viven en IndexedDB en su iPhone y no hay copia en ningún servidor: perderlos es irreversible. Ver README.md para la arquitectura.

## Reglas de seguridad de datos (obligatorias)

1. **`sw.js` solo puede borrar entradas de Cache Storage.** Nunca debe abrir, modificar ni borrar IndexedDB (ni `indexedDB.deleteDatabase`, ni nada parecido).
2. **Cambios en la estructura de IndexedDB:** siempre subiendo `VERSION_BD` en `js/db.js` y añadiendo una migración a `MIGRACIONES` (se ejecuta en `onupgradeneeded`) que **conserve todos los datos existentes**. Prohibido borrar almacenes (`deleteObjectStore`) o índices que contengan datos del usuario; si hay que reestructurar, se copian los datos al nuevo formato dentro de la misma migración.
3. **Copia automática antes de migrar:** antes de ejecutar cualquier migración, guardar una copia completa de los datos en un almacén `backups`, conservando solo las 3 últimas, y ofrecer restaurarla desde Ajustes si algo falla.
   - Implementado en `js/db.js` (`copiarAntesDeMigrar`, se ejecuta en `onupgradeneeded` cuando `oldVersion > 0`); restauración en Ajustes → Copias automáticas. Probado en `tests.html` (migración v1 → v2).
   - `backups` está fuera de `ALMACENES` a propósito, para que "Borrar todo", "Restaurar copia" y la exportación no lo vacíen ni lo dupliquen. Mantenlo así.
4. **Datos incluidos (`data/*.json`)**: los cambios llegan a las instalaciones existentes subiendo `revision`. Solo se actualizan los campos de `CAMPOS_REVISION` (`js/import.js`), nunca en palabras con `editada`, y nunca se borran palabras ni progreso.

Excepción: "Borrar todo" en Ajustes (con doble confirmación) y "Restaurar copia" (con confirmación) vacían los datos porque el usuario lo pide expresamente. `eliminarBase` solo se usa en `tests.html`, con las bases de prueba `vokabeln-pruebas` y `vokabeln-migracion`.

## Otras convenciones

- Interfaz en español; contenido en alemán.
- Sin dependencias externas ni paso de compilación; rutas relativas.
- Al publicar cambios: subir `CACHE` en `sw.js` (`vokabeln-vN`) y añadir los archivos nuevos a `ARCHIVOS`.
- Las pruebas están en `tests.html` y deben pasar antes de hacer commit.
- Temas: solo los 11 de la tabla del README. Niveles con formato `A2.2`, `B1.1`…
