# Vokabeln — instrucciones para Claude

PWA de vocabulario alemán (HTML + CSS + JS sin compilar, GitHub Pages). Todos los datos del usuario viven en IndexedDB en su iPhone y no hay copia en ningún servidor: perderlos es irreversible. Ver README.md para la arquitectura.

## Reglas de seguridad de datos (obligatorias)

1. **`sw.js` solo puede borrar entradas de Cache Storage.** Nunca debe abrir, modificar ni borrar IndexedDB (ni `indexedDB.deleteDatabase`, ni nada parecido).
2. **Cambios en la estructura de IndexedDB:** siempre subiendo `VERSION_BD` en `js/db.js` y añadiendo una migración a `MIGRACIONES` (se ejecuta en `onupgradeneeded`) que **conserve todos los datos existentes**. Prohibido borrar almacenes (`deleteObjectStore`) o índices que contengan datos del usuario; si hay que reestructurar, se copian los datos al nuevo formato dentro de la misma migración.
3. **Copia automática antes de migrar:** antes de ejecutar cualquier migración, guardar una copia completa de los datos en un almacén `backups`, conservando solo las 3 últimas, y ofrecer restaurarla desde Ajustes si algo falla.
   - Este mecanismo **aún no está implementado** (la base sigue en la versión 1, sin migraciones reales). Debe implementarse en la primera migración (v1 → v2), que creará también el almacén `backups`.
   - `backups` no debe incluirse en `ALMACENES`, para que "Borrar todo", "Restaurar copia" y la exportación no lo vacíen ni lo dupliquen.

Excepción: "Borrar todo" en Ajustes (con doble confirmación) y "Restaurar copia" (con confirmación) vacían los datos porque el usuario lo pide expresamente. `eliminarBase` solo se usa en `tests.html` con la base `vokabeln-pruebas`.

## Otras convenciones

- Interfaz en español; contenido en alemán.
- Sin dependencias externas ni paso de compilación; rutas relativas.
- Al publicar cambios: subir `CACHE` en `sw.js` (`vokabeln-vN`) y añadir los archivos nuevos a `ARCHIVOS`.
- Las pruebas están en `tests.html` y deben pasar antes de hacer commit.
