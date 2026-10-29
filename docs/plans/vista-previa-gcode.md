# Vista previa del G-code (versión 0.8.0)

Plan detallado del último paso de la fase 3 del [roadmap](../ROADMAP.md). Planeado con
**xhigh**; cada paso indica el nivel recomendado para implementarlo.

## Objetivo

Ver **capa a capa** qué va a imprimir un archivo, o qué está imprimiendo la impresora ahora mismo:

- Desde los detalles de un archivo: "Vista previa", con un deslizador de capas, colores por tipo
  de línea (perímetros, relleno, soportes…) y zoom con dos dedos.
- Durante una impresión, desde Inicio: "Ver capa actual". La vista sigue la capa que se imprime,
  con la parte ya hecha resaltada, la posición de la boquilla y las piezas excluidas tachadas.
- Rápido en un teléfono normal con archivos de **decenas de MB**, sin bloquear la app.
- Si el archivo ya se abrió antes, la vista aparece al instante sin volver a descargarlo.

## Situación actual

| Pieza | Cómo funciona hoy |
| --- | --- |
| Descarga de archivos | No se descargan; solo se leen metadatos (`/server/files/metadata`) y miniaturas |
| `fetch` en Android | `CapacitorHttp` lo intercepta. Las peticiones **GET** pasan por un proxy local (`/_capacitor_http_interceptor_?u=…`) que responde desde Java con el `InputStream` de la conexión |
| Estado de la impresión | `virtual_sdcard.progress`, `print_stats.info.current_layer`, `toolhead.position` y `exclude_object` ya están en la suscripción |
| Gestos de zoom | `ZoomPan` (cámara) mueve un elemento con CSS; no sirve para redibujar un lienzo nítido |
| Simulador | Responde a cualquier `/server/files/gcodes/…` con una imagen SVG (para las miniaturas); no sirve G-code real |
| Pruebas | Vitest en Node; ya se prueban funciones puras como `objects.ts` o `stats.ts` |

## Datos medidos al planear

Prueba hecha el 2026-10-29 en el Mac con un parser mínimo que lee bytes (sin convertir todo el
archivo a texto) y un G-code sintético de 50 MB al estilo de OrcaSlicer:

| Medida | Resultado |
| --- | --- |
| Velocidad de lectura | **~490 MB/s** (50 MB en ~100 ms) |
| Puntos de extrusión | 2,0 millones en 337 000 polilíneas |
| Memoria del modelo (`Float32Array`) | **~16 MB** |

En un teléfono de gama media, JavaScript es entre 5 y 10 veces más lento: **0,5–1 s para 50 MB**.
Leer el archivo no es el problema. **Lo lento es la descarga.**

### La Creality Hi real (2026-10-29, desde el Mac por Wi-Fi, solo lectura)

| Medida | Resultado |
| --- | --- |
| Archivos en la impresora | 45 G-code; el mayor de **23 MB**, la mayoría entre 1 y 10 MB |
| Velocidad de descarga | **0,3–0,9 MB/s** (23 MB en 26 s; 20 MB en 70 s). La primera respuesta llega en < 0,1 s |
| Descargas en paralelo por rangos | 1,0 MB/s frente a 0,9 MB/s con una sola: **no compensa**. El límite es la impresora (2 núcleos, 500 MB de RAM, Wi-Fi) |
| Compresión (gzip) | **No**: Moonraker envía el G-code sin comprimir |
| Rangos (`Range: bytes=…`) | **Sí** (responde 206) |
| Laminador | Creality Print V5.1 y V6.0, con el formato de OrcaSlicer |

Formato de los archivos (los tres analizados son iguales):

| Elemento | Qué hay | Consecuencia |
| --- | --- | --- |
| Capas | `;LAYER_CHANGE`, `;Z:`, `;HEIGHT:`; el encabezado trae `; total layer number: 650` | Se sabe el total de capas desde el primer KB, así que el progreso se puede mostrar en capas |
| Primera capa | Empieza en los primeros **30–70 KB** | La primera capa se ve en menos de 1 s |
| Tipos (`;TYPE:`) | Outer wall, Inner wall, Overhang wall, Sparse infill, Internal solid infill, Gap infill, Bottom surface, Top surface, Bridge, Internal Bridge, Support, Support interface, Custom | Encajan en las categorías de D6 |
| Arcos | **Muchísimos**: hasta 104 000 `G2`/`G3` con I/J en un archivo | Los arcos son imprescindibles, no un detalle |
| Números | Sin cero inicial: `E.3771`, `I-.658` | El parser debe aceptarlos |
| Extrusión | `M83` (relativa), `G92 E0` en cada capa, `;WIPE_START`/`;WIPE_END` | — |
| Objetos | `EXCLUDE_OBJECT_DEFINE` con polígono; nombres con caracteres chinos (`…喷头前壳…`) | Las posiciones deben contarse en bytes, no en caracteres (D2) |
| Herramienta y colores | `T0`; `; filament_colour = #ffffff` **al final del archivo** | Los colores por filamento se conocen al terminar la descarga |
| Comentarios | ~3 MB de los 23 MB; las miniaturas ocupan los primeros 4–5 KB | Saltar comentarios rápido importa |

Puntos estimados, con los arcos convertidos a segmentos:

| Archivo | Tamaño | Capas | Puntos | Modelo |
| --- | --- | --- | --- | --- |
| block | 0,6 MB | 102 | 0,02 M | 0,1 MB |
| 8x8 MU Center Grid | 19,8 MB | 31 | ~0,9 M | ~7 MB |
| Nozzle cover | 23,2 MB | 650 | ~1,25 M con tolerancia de 0,05 mm (1,8 M con 0,02 mm) | ~10 MB |

**Conclusión:** en esta impresora, abrir un archivo grande por primera vez tarda **unos 25 s** en
completarse, y no se puede acelerar desde la app. Por eso son clave: dibujar mientras se
descarga (D2), la caché (D7) y, en el modo en vivo, empezar por la zona que se está imprimiendo
(D11).

También verifiqué en el código de Capacitor 8 (`WebViewLocalServer.handleCapacitorHttpRequest`)
que el proxy de `fetch` devuelve el `InputStream` de la conexión: la respuesta llega **por
partes**, desde el mismo origen que la app y sin CORS.

## Decisiones

### D1. Vista 2D capa a capa, no 3D (confirmado)

Confirmado por ti el 2026-10-29. Se dibuja una capa vista desde arriba, como el visor 2D de Fluidd:
- En una pantalla pequeña se entiende mejor una capa que un modelo 3D, sobre todo para revisar
  la primera capa o ver dónde va la impresión.
- Canvas 2D funciona en cualquier teléfono y usa poca memoria. Un visor 3D con WebGL necesita
  bastante más trabajo y más memoria de la GPU.
- El modelo de datos del paso G.3 (puntos por capa con su altura) sirve también para un 3D
  futuro, así que no se pierde nada. El 3D queda **fuera de alcance**.

### D2. Leer el archivo en un Web Worker, por partes y a nivel de bytes

- El parser es una clase pura (`GcodeParser`) con `push(chunk: Uint8Array)` y `finish()`. Se
  prueba en Node con Vitest y en la app corre dentro de un Web Worker, así que la interfaz
  nunca se congela.
- Trabaja sobre bytes. Solo convierte a texto las pocas líneas que lo necesitan (comentarios
  conocidos, nombres de objetos). Las líneas cortadas entre dos trozos se guardan para el
  siguiente.
- Envía las capas al hilo principal **a medida que las termina**, como `ArrayBuffer`
  transferibles (sin copiar), así que las primeras capas se ven mientras el resto se descarga.
- El worker se compila en formato clásico (`worker.format: 'iife'` en Vite) para no depender
  de que el WebView soporte workers de módulos.

### D3. Descarga con el `fetch` normal; el hilo principal pasa los trozos al worker

- En Android, `fetch` ya pasa por el proxy local de Capacitor, que entrega la respuesta por
  partes y sin CORS. En el navegador (desarrollo), el simulador permite CORS.
- **El hilo principal** lee `response.body` y pasa cada trozo al worker (`postMessage` con
  transferencia). No dependemos de que las peticiones hechas *desde* un worker también pasen
  por el proxy, algo que no está garantizado en Android.
- Con `Content-Length` se muestra el progreso: "Descargando 12,3 de 48,0 MB".
- Se puede cancelar: `AbortController` en la descarga y `worker.terminate()`.
- **Respaldo** si en el teléfono la respuesta no llega por partes (se comprueba en G.1): un
  método nativo descarga el archivo a la caché y el hilo principal lo lee con
  `Capacitor.convertFileSrc`, que también entrega el archivo por partes.

### D4. Modelo compacto por capa

Cada capa guarda:

| Campo | Tipo | Para qué |
| --- | --- | --- |
| `z`, `height` | número | Altura de la capa y su grosor |
| `start`, `end` | byte del archivo | Saber en qué capa está la impresora (`file_position`) |
| `points` | `Float32Array` (x, y) | Puntos de las líneas con extrusión, polilíneas una tras otra |
| `polyStart` | `Uint32Array` | Dónde empieza cada polilínea en `points` |
| `polyOffset` | `Uint32Array` | Byte del archivo donde empieza cada polilínea (para el modo en vivo) |
| `polyKind` | `Uint8Array` | Tipo de línea (ver D6) |
| `polyTool` | `Uint8Array` | Herramienta o filamento (`T0`…`T3`, por ejemplo con el CFS de Creality) |
| `polyObject` | `Uint16Array` | Objeto de `EXCLUDE_OBJECT_START` (0 = ninguno) |
| `travel` | `Float32Array` (x1, y1, x2, y2) | Desplazamientos sin extruir (se pueden mostrar u ocultar) |

Una polilínea termina cuando hay un desplazamiento o cambia el tipo, la herramienta o el objeto.
Para ahorrar memoria, se descartan los puntos a menos de 0,02 mm del anterior, y los arcos se
convierten en segmentos con un error máximo de **0,05 mm**: menos de un píxel incluso con el zoom
al máximo, y un 30 % menos de puntos que con 0,02 mm en los archivos reales. Si en el teléfono
la memoria supera el presupuesto (ver "Objetivos medibles"), se pasa a `Uint16` con precisión de
0,01 mm. Eso reduce la memoria a la mitad y está previsto, pero no se hace de entrada.

Además del modelo por capa, un **resumen** del archivo: número de capas, límites, objetos (de
`EXCLUDE_OBJECT_DEFINE`), herramientas y sus colores (`; filament_colour = …`), laminador y
tipos de línea presentes.

### D5. Detección de capas, de más a menos fiable

1. Comentarios del laminador: `;LAYER_CHANGE` + `;Z:` + `;HEIGHT:` (OrcaSlicer, PrusaSlicer,
   Creality Print, Bambu Studio) o `;LAYER:n` (Cura). Se decide cuál usar con lo que aparezca
   primero.
2. Si no hay comentarios: empieza capa nueva cuando hay **extrusión** a una Z más alta que la
   capa actual. Así un "Z hop" (subir para desplazarse y volver a bajar) no cuenta como capa,
   porque no extruye.
3. Modo jarrón (Z que sube sin parar): si el método 2 produce capas de menos de 0,05 mm, se
   agrupan por la altura de capa del encabezado (`layer_height`), o por 0,2 mm si no aparece.

### D6. Tipos de línea y colores

Los nombres de `;TYPE:` cambian entre laminadores, así que se agrupan en 8 categorías:

| Categoría | OrcaSlicer / Creality Print | PrusaSlicer | Cura |
| --- | --- | --- | --- |
| Perímetro exterior | Outer wall | External perimeter | WALL-OUTER |
| Perímetro interior | Inner wall, Overhang wall | Perimeter, Overhang perimeter | WALL-INNER |
| Relleno | Sparse infill | Internal infill | FILL |
| Sólido | Internal solid infill, Solid infill, Top surface, Bottom surface, Bridge, Gap infill, Ironing | Solid infill, Top solid infill, Bridge infill, Gap fill, Ironing | SKIN |
| Soporte | Support, Support interface, Support transition | Support material, Support material interface | SUPPORT, SUPPORT-INTERFACE |
| Falda y borde | Skirt, Brim | Skirt/Brim | SKIRT |
| Torre de purga | Prime tower | Wipe tower | PRIME-TOWER |
| Otros | Cualquier otro, o sin `;TYPE:` | | |

Los colores son una paleta fija de 8 tonos, distinguibles entre sí y con buen contraste en
claro y en oscuro. Se comprueban con una prueba automática, como las paletas de la app.
`Custom` (el G-code de inicio) va a "Otros" e `Internal Bridge` a "Sólido".

Hay un segundo modo, **"Por filamento"**, que usa los colores de `filament_colour`. Solo
aparece si el archivo usa más de una herramienta (impresión multicolor con el CFS). Tú no
imprimes en varios colores, pero otros usuarios sí, así que se incluye con **prioridad
secundaria**: si la sesión 2 se alarga, pasa a una versión posterior. Como `filament_colour`
está al final del archivo, hasta que termina la descarga se usan colores provisionales.

### D7. Caché del modelo ya leído (IndexedDB)

- Clave: impresora + ruta + fecha de modificación + tamaño + versión del parser. Si el archivo
  cambia o el parser se actualiza, se vuelve a leer.
- Se guarda el modelo (los `ArrayBuffer`), no el G-code, porque ocupa menos y abre al instante.
- Límite de 150 MB en total; al pasarse, se borran los menos usados.
- Abrir un archivo guardado tarda menos de 0,5 s, y el modo en vivo de una impresión larga no
  vuelve a descargar nada.

### D8. Modo en vivo durante la impresión

- Se añaden `file_position` y `file_size` a la suscripción de `virtual_sdcard`. Cambian al mismo
  ritmo que `progress`, así que no aumenta el tráfico de forma apreciable.
- **Capa actual**: la que contiene `file_position` (entre `start` y `end`). Es más fiable que
  `current_layer`, que depende de que el laminador lo indique.
- **Dentro de la capa**: las polilíneas cuyo `polyOffset` es menor que `file_position` se
  dibujan como hechas; el resto, atenuadas.
- **Boquilla**: un punto en `toolhead.position` (X, Y).
- Klipper lee el archivo un poco antes de ejecutarlo (unos segundos de margen), así que lo
  "hecho" puede ir ligeramente por delante. Es suficiente para ver dónde va la impresión.
- **Seguir la capa actual** está activado por defecto. Si mueves el deslizador, se desactiva y
  aparece "Volver a la capa actual".
- Las piezas de `excluded_objects` se dibujan tachadas (polilíneas con ese `polyObject`).

### D9. Dibujo con Canvas 2D y un gesto de zoom compartido

- Un `<canvas>` del tamaño de la pantalla, multiplicado por `devicePixelRatio` para que se vea
  nítido.
- Transformación mundo → pantalla con el eje Y invertido (lo de atrás de la cama arriba), como
  el mapa de objetos (`objects.ts`).
- Se extrae la matemática de `ZoomPan` a un hook `usePanZoom` que devuelve
  `{ scale, x, y }` y los manejadores de los gestos. La cámara sigue usándolo con CSS y el visor
  redibuja el lienzo con esa transformación, así que se ve nítido a cualquier zoom.
- Por cada capa se preparan `Path2D` por categoría y se guardan, de modo que mover o hacer zoom
  solo vuelve a aplicar la transformación y redibuja.
- El grosor de línea es el ancho de extrusión real (~0,42 mm) en la escala actual, con un mínimo
  de 1 px.
- Orden de dibujo: cama y cuadrícula de 10 mm, capa anterior atenuada, capa actual por
  categoría, desplazamientos (si están activados), piezas excluidas y boquilla (en vivo).

### D10. Límites de tamaño

- Más de 50 MB: aviso con el tiempo estimado de descarga antes de empezar (a ~0,9 MB/s, casi un
  minuto en la Creality Hi).
- Más de 300 MB: no se abre, con un mensaje claro.

### D11. En el modo en vivo, primero la zona que se está imprimiendo

Durante una impresión de un archivo que no está en la caché, esperar 25 s para ver la capa actual
es demasiado. Como Moonraker admite rangos:

1. Se descargan los primeros 64 KB (encabezado, `M83`/`G90` y objetos) y unos **3 MB alrededor
   de `file_position`** (~3 s). El parser empieza a dibujar desde el primer `;LAYER_CHANGE` de
   ese tramo, con el estado del encabezado. En Creality Print X e Y son absolutas y E relativa,
   así que se puede empezar a mitad del archivo.
2. Se muestra la capa actual en cuanto está.
3. Después se descarga el archivo completo desde el principio (unos 3 MB de más, a cambio de
   mucha menos complejidad) y el modelo completo sustituye al parcial. Ese es el que se guarda
   en la caché.

Si el archivo usa posiciones relativas (`G91`) en el tramo, se descarta el atajo y se espera al
archivo completo.

## Arquitectura

```
                     hilo principal                              │ Web Worker
                                                                 │
FileDetails ─┐                                                   │
Dashboard ───┼─▶ GcodeViewer ─▶ useGcodeModel(printer, file) ────┼─▶ worker.ts
(en vivo)    │      │               │  1. caché IndexedDB?       │     └─ GcodeParser
             │      │               │  2. fetch(url) por partes ─┼──▶   push(chunk) / finish()
             │      │               │     postMessage(chunk) ───▶│     ◀── capas (transferidas)
             │      │               │  3. guardar en la caché    │
             │      ▼               ▼                            │
             │  LayerCanvas ◀── modelo { resumen, capas[] }      │
             │   (Canvas 2D,                                     │
             │    usePanZoom)                                    │
             └─ estado en vivo: file_position, toolhead.position, excluded_objects
```

Archivos nuevos (en `src/gcode/`):

| Archivo | Contenido |
| --- | --- |
| `parser.ts` | `GcodeParser` (puro, se prueba en Node) |
| `kinds.ts` | Categorías de línea, mapeo de `;TYPE:` y paleta |
| `model.ts` | Tipos `GcodeModel`, `GcodeLayer`, `GcodeSummary` y la búsqueda de la capa por byte |
| `worker.ts` | Envoltorio del parser en el worker y protocolo de mensajes |
| `cache.ts` | Caché en IndexedDB con límite de tamaño |
| `useGcodeModel.ts` | Hook: caché → descarga → worker → modelo, con progreso y cancelación |
| `render.ts` | Dibujo de una capa en un `CanvasRenderingContext2D` (función pura sobre el contexto) |
| `../components/GcodeViewer.tsx` | Visor a pantalla completa |
| `../usePanZoom.ts` | Matemática de los gestos, compartida con `ZoomPan` |

## Pasos

### G.1 Medir en el teléfono lo que no se puede medir aquí — **high** ✅

Ya medido desde el Mac (ver "La Creality Hi real"): la velocidad de descarga, los rangos, la
falta de gzip y el formato de Creality Print. Falta comprobar **en el teléfono**, con la versión
mínima del visor de la sesión 1, que es el riesgo más grande del plan:

- Que en el APK la respuesta del proxy llega por partes: el primer trozo debe llegar mucho
  antes que el último.
- Que la velocidad desde el teléfono es parecida a la del Mac (~0,9 MB/s).
- La velocidad de lectura en tu teléfono con "Nozzle cover" (23 MB).

El visor tiene un panel de información ("Descarga: 48 MB a 3,1 MB/s · Lectura: 0,9 s · 2,0 M
puntos"), útil también después. Con una captura de ese panel tengo los números. Si la respuesta
no llega por partes, se implementa el respaldo de D3 antes de seguir.

### G.2 El simulador sirve G-code real — **medium** ✅

- `scripts/gen-gcode.mjs` genera G-code al estilo de OrcaSlicer: `;LAYER_CHANGE`, `;TYPE:`,
  `EXCLUDE_OBJECT_DEFINE`/`START`/`END`, arcos `G2`/`G3`, Z hop, retracciones, cambios de
  herramienta y bloques de miniatura. Parte del generador de la prueba de rendimiento.
- El simulador sirve G-code para las rutas `.gcode`, con `Content-Length`, rangos
  (`Range`/206) y un límite de ~0,9 MB/s para imitar a la Creality Hi. Las miniaturas siguen
  siendo SVG.
- El generador imita el formato real de Creality Print: números sin cero inicial, arcos I/J
  abundantes, `;WIPE_START`, `G92 E0` por capa y `filament_colour` al final.
- Se añade `pruebas/grande_50mb.gcode` a la lista de archivos del simulador.

### G.3 El parser — **high** ✅

`GcodeParser` según D2, D4 y D5. Debe manejar:

- `G0`/`G1` con X, Y, Z, E y F; `G2`/`G3` con I/J o R, convertidos a segmentos con un error
  máximo de 0,05 mm.
- Números sin cero inicial (`.377`, `-.658`) y nombres de objeto con caracteres no ASCII.
- El encabezado de Creality Print (`; total layer number`, `; max_z_height`) para mostrar el
  progreso en capas desde el principio.
- Empezar a mitad de un archivo con un estado inicial dado (para D11).
- `G90`/`G91` (posición absoluta o relativa) y `M82`/`M83` (extrusión absoluta o relativa).
- `G92` (sobre todo `G92 E0`) y `G28`.
- Retracciones: E negativo y `G10`/`G11`, que no dibujan nada.
- `T<n>`, `EXCLUDE_OBJECT_*`, `SET_PRINT_STATS_INFO`, `;TYPE:`, los comentarios de capa y los
  datos del encabezado y del final (`layer_height`, `filament_colour`).
- Saltar rápido los comentarios largos (miniaturas en base64) y las líneas que no mueven nada.
- Comentarios al final de una línea (`G1 X10 ; comentario`) y líneas en minúsculas.

Pruebas con fragmentos escritos a mano para cada caso, y con un archivo real de Creality Print
en `src/gcode/fixtures/creality-print-block.gcode`. Los archivos grandes de la impresora no se
suben al repositorio: la prueba de rendimiento los usa si están en una carpeta local y, si no,
genera unos sintéticos.

### G.4 Worker, descarga y caché — **high** ✅

- `worker.ts` y su protocolo: `chunk` y `end` hacia el worker; `layers`, `progress`, `done` y
  `error` de vuelta.
- `useGcodeModel`: primero la caché; si no está, `fetch` por partes enviando los trozos al
  worker; al terminar, guarda el modelo en la caché. Muestra el progreso de la descarga y las
  capas listas, y se puede cancelar.
- `cache.ts` con el límite y el borrado de D7.
- Se configura Vite para el worker (`worker.format: 'iife'`).

### G.5 Dibujo de la capa — **high** ✅

- `usePanZoom`, extraído de `ZoomPan`. Hay que comprobar que la cámara sigue igual: zoom, doble
  toque y el botón de quitar el zoom.
- `render.ts` según D9, con `Path2D` guardados por capa y categoría.
- Paleta de D6 con su prueba de contraste.

### G.6 El visor — **medium** ✅

- Pantalla completa (como el visor de la cámara), con el gesto atrás y la barra de estado
  oculta en Android.
- Abajo:
  - deslizador de capas con botones ‹ › y el texto "Capa 87 de 240 · Z 17,40 mm";
  - interruptores "Desplazamientos" y "Capa anterior";
  - modo de color "Por tipo / Por filamento";
  - leyenda de colores.
- Mientras carga: progreso de la descarga y las capas disponibles hasta el momento.
- Errores: sin conexión, no es un G-code, archivo demasiado grande, sin movimientos.
- Panel de información (G.1).
- Accesibilidad: el deslizador con su etiqueta y el texto de la capa anunciado al cambiar.

### G.7 Modo en vivo — **high** ✅

D8 y D11 completos:
- `file_position` y `file_size` en la suscripción;
- primero el tramo alrededor de `file_position` y después el archivo completo;
- búsqueda de la capa por byte, con pruebas;
- parte hecha y parte pendiente dentro de la capa;
- boquilla;
- seguir la capa actual y el botón para volver a ella;
- piezas excluidas tachadas.

### G.8 Puntos de entrada — **medium** ✅ (sin el opcional de excluir tocando en el visor)

- Detalles del archivo: botón "Vista previa".
- Inicio, durante una impresión: "Ver capa actual", junto a "Objetos".
- Opcional, si sobra tiempo: tocar una pieza en el visor durante la impresión para excluirla, con
  la misma confirmación del mapa de objetos.

### G.9 Pruebas y rendimiento — **medium** ✅

- `npm run bench:gcode`: genera 10, 50 y 150 MB y mide la velocidad de lectura y la memoria del
  modelo, para detectar si un cambio la empeora.
- Pruebas en el navegador contra el simulador (abajo).

### G.10 Cierre de la versión — **low**

CHANGELOG, README, roadmap y APK de prueba. Con tu confirmación: `npm run release -- 0.8.0`.

### Orden y sesiones

```
G.2 ─┐
G.3 ─┼─▶ G.4 ─▶ G.5 ─▶ G.1 (teléfono) ─▶ G.6 ─▶ G.7 ─▶ G.8 ─▶ G.9 ─▶ G.10
     │                     │
     │                     └─ si la descarga no llega por partes: respaldo de D3
```

- **Sesión 1 (high)**: G.2, G.3, G.4 y una versión mínima de G.5. Termina con un APK de prueba
  para G.1: abrir un archivo real de la Hi y mandarme la captura del panel de información.
- **Sesión 2 (high)**: G.5 completo y G.6. El visor terminado.
- **Sesión 3 (high)**: G.7, G.8, G.9 y G.10. Modo en vivo, integración y publicación.

Si algo de la sesión 1 falla dos veces (sobre todo la descarga por partes en Android), conviene
subir a **xhigh** para investigar la causa antes de cambiar el diseño.

## Resultados de la sesión 1 (2026-10-29)

Medido en el Mac con `npm run bench:gcode`:

| Archivo | Tamaño | Lectura | Puntos | Memoria del modelo |
| --- | --- | --- | --- | --- |
| Nozzle cover (real) | 23,2 MB | **82 ms (281 MB/s)** | 0,66 M | **6,8 MB** |
| 8x8 MU Center Grid (real) | 19,8 MB | 63 ms (315 MB/s) | 0,49 M | 5,6 MB |
| block (real) | 0,6 MB | 2 ms | 0,01 M | 0,1 MB |
| Sintético de 50 MB | 53,3 MB | 301 ms (177 MB/s) | 5,0 M | 60 MB (el generador es más denso que un archivo real) |

- **Lección:** la primera versión leía a 64 MB/s. Un perfil de CPU mostró que el 77 % del tiempo
  se iba en buscar `;` (comentario al final de la línea) con `indexOf`, que recorría el resto del
  trozo en cada línea. Limitado a la línea, la lectura es 4–5 veces más rápida. Medir antes de
  optimizar: la primera sospecha (crear un array por número) no cambiaba nada.
- En el navegador contra el simulador (a 0,9 MB/s): las capas aparecen mientras se descarga;
  volver a abrir desde la caché tarda **22 ms**; cancelar a mitad no deja errores.
- **G.1 en el teléfono** ("Nozzle cover", 22,1 MB, desde la Creality Hi):

  | Medida | Resultado |
  | --- | --- |
  | Primer dato | **91 ms** |
  | Partes recibidas | **5 831** (de ~4 KB): la descarga llega por partes en Android, sin plan B |
  | Descarga | 33 s (0,7 MB/s) |
  | Lectura | 1,1 s (21,9 MB/s), durante la descarga |
  | Modelo | 650 capas, 0,66 M puntos, 6,5 MB |

  La lectura quedó por debajo del objetivo de 40 MB/s por el coste fijo de enviar al worker
  5 831 partes pequeñas. Ahora se agrupan en bloques de 64 KB (~350 mensajes). Como la lectura
  ocurre mientras se descarga, no cambia lo que se ve.
- **Almacenamiento**: a petición tuya, Ajustes tiene una sección con el espacio que ocupan
  las vistas previas guardadas, un botón para borrarlas y un borrado automático de las que no se
  abren en 1 semana o 1 mes (por defecto), o nunca. El "borrar caché" de Android no las elimina
  porque están en IndexedDB.

## Resultados de la sesión 2 (2026-10-29)

- **Zoom**: `usePanZoom` (extraído de `ZoomPan`, con pruebas de que el punto bajo los dedos no
  se mueve) hasta 20×, doble toque 3× y rueda del ratón. El lienzo se redibuja a cada escala,
  así que las líneas siguen nítidas. La cámara sigue igual.
- **Paleta**: colores nuevos con prueba automática: todos contrastan ≥ 3:1 con la cama y se
  distinguen entre sí (ΔE ≥ 20). Los colores de filamento demasiado oscuros se aclaran.
- **Visor**: interruptores "Capa anterior" y "Desplazamientos" (líneas discontinuas), modo
  "Por filamento" cuando hay varias herramientas (con `filament_colour`), leyenda según el modo y
  flechas del teclado.
- **Detalles del archivo** (no estaba en el plan): el Moonraker de la Hi no lee los archivos de
  Creality Print (laminador "Unknown", sin miniatura ni tiempo). La app pide los primeros KB
  (miniaturas y laminador) y los últimos 128 KB (tiempo, filamento, temperaturas) con rangos
  HTTP y completa lo que falta. En la lista solo pide 8 KB, para la miniatura pequeña. El final
  se pide como `bytes=inicio-`, que los navegadores permiten sin consulta CORS previa (a
  diferencia de `bytes=-N`).

## Resultados de la sesión 3 (2026-10-29)

- **Modo en vivo** ("Ver capa actual" en Inicio, durante una impresión): sigue la capa por
  `file_position`, dibuja lo hecho a todo color y lo pendiente atenuado, la boquilla en
  `toolhead.position` y las piezas excluidas en gris discontinuo. Al mover el deslizador deja de
  seguir y aparece "Volver a la capa actual".
- **D11 medido** con el simulador a 0,9 MB/s, imprimiendo un archivo de 50 MB al 60 %: la capa
  actual aparece a los **3,0 s** (descargando desde el principio tardaría más de 30 s).
- **Ajuste respecto al plan:** el atajo solo se usa si la impresión va más allá de los primeros
  4 MB del archivo. Antes de eso, descargar desde el principio llega antes (medido: 1,8 s frente
  a 3,5 s para un archivo de 4 MB al 36 %). El tramo es de 1,5 MB antes y 0,75 MB después de la
  posición (la capa actual y lo que queda de ella).
- `GcodeParser.seek()` con prueba: a mitad de tu archivo real dibuja lo mismo que leyéndolo
  entero.
- Simulador: `MOCK_PRINT` y `MOCK_PROGRESS` para imprimir otro archivo desde otro punto; los
  objetos de `exclude_object` coinciden con los del G-code generado y la boquilla sigue sus
  movimientos.
- Queda fuera (opcional en G.8): excluir una pieza tocándola en el visor. El mapa de objetos ya
  lo hace.

## Objetivos medibles

| Medida | Objetivo en el teléfono |
| --- | --- |
| Velocidad de lectura | ≥ 40 MB/s (en el Mac, ~490 MB/s) |
| Primera capa visible | ≤ 1,5 s después de abrir (empieza en los primeros 70 KB) |
| Capa actual en el modo en vivo, sin caché | ≤ 5 s (D11) |
| Archivo completo de 23 MB desde la Creality Hi | ~25 s; no depende de la app (~0,9 MB/s) |
| Memoria del modelo de "Nozzle cover" (23 MB) | ≤ 15 MB; para 50 MB, ≤ 25 MB |
| Cambiar de capa | < 16 ms con capas de 20 000 puntos |
| Mover y hacer zoom | Fluido, sin saltos (60 fps) |
| Abrir desde la caché | < 0,5 s |

## Pruebas

### Automáticas (Vitest)
- Parser: cada caso de G.3 con fragmentos pequeños; capas con y sin comentarios; Z hop; modo
  jarrón; arcos; extrusión relativa y absoluta; `G92`; objetos; herramientas.
- Líneas cortadas entre trozos: el mismo archivo partido en trozos de 1, 7 y 64 KB debe dar el
  mismo modelo.
- Archivos reales de `fixtures/`: número de capas y objetos esperados.
- Búsqueda de la capa por `file_position` y paleta (contraste).

### En el navegador, contra el simulador
| Caso | Resultado esperado |
| --- | --- |
| Archivo pequeño | La vista aparece en < 1 s; el deslizador recorre todas las capas |
| Archivo de 50 MB | Las primeras capas aparecen mientras se descarga; la app sigue respondiendo |
| Abrir otra vez | Al instante, desde la caché |
| Cancelar a mitad | Se detienen la descarga y el worker; sin errores |
| Durante una impresión | Sigue la capa; la parte hecha avanza; la boquilla se mueve |
| Excluir un objeto | Aparece tachado en el visor |
| Zoom y desplazamiento | Nítido a cualquier zoom; la cámara sigue funcionando igual |

### En el teléfono, con la Creality Hi (tú)
1. Abrir la vista previa de un archivo grande y enviarme la captura del panel de información (G.1).
2. Recorrer las capas con el deslizador, hacer zoom y moverse.
3. Durante una impresión: "Ver capa actual" sigue la impresión.
4. Si usas el CFS: un archivo multicolor en modo "Por filamento".
5. Cerrar y volver a abrir el mismo archivo: al instante.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| En Android la respuesta del proxy no llega por partes, sino entera al final | Se comprueba primero (G.1); respaldo de D3 (descarga nativa a la caché) |
| La Wi-Fi de la impresora es lenta (medido: 0,3–0,9 MB/s) | Dibujar mientras se descarga, caché del modelo, tramo prioritario en el modo en vivo (D11) y velocidad visible en el panel. Ni el paralelo ni el gzip ayudan (medido) |
| Poca memoria en teléfonos modestos | Modelo compacto, puntos casi repetidos descartados, `Uint16` previsto y límite de 300 MB |
| Cada laminador escribe distinto | Detección de capas en tres niveles; fragmentos de Orca, Prusa y Cura en las pruebas; archivo real de Creality Print |
| `file_position` va un poco por delante de la boquilla | Se acepta; la boquilla se dibuja desde `toolhead.position` |
| Descargar un archivo grande mientras imprime carga la Creality Hi | Fluidd y Mainsail hacen lo mismo; con la caché solo se descarga una vez. Se vigila en G.1 |
| El WebView no soporta workers de módulos | Worker en formato clásico (`iife`) |
| Las purgas de las macros (`PRINT_START`) no están en el archivo | No se dibujan; es lo esperado (Fluidd hace igual) |

## Fuera de alcance

- Vista 3D (WebGL). El modelo ya guarda la altura de cada capa por si se hace después.
- Editar el G-code o laminar desde la app.
- Tiempo estimado por capa (se podría calcular a partir de las velocidades F en el futuro).
- Simular la impresión movimiento a movimiento dentro de una capa.

## Respuestas (2026-10-29)

1. **Archivos reales**: revisados en la impresora (solo lectura). Analicé tres ("block", 0,6 MB;
   "8x8 MU - Center Grid", 19,8 MB; "Nozzle cover", 23,2 MB), y el plan ya refleja su formato.
2. **Vista 2D**: confirmada (D1).
3. **Varios colores**: no los usas, pero se mantiene "Por filamento" para otros usuarios, con
   prioridad secundaria (D6).

4. **Archivo de prueba**: aceptaste incluir "block" en el repositorio. Está en
   `src/gcode/fixtures/creality-print-block.gcode`.

Ya no falta nada para empezar la sesión 1.
