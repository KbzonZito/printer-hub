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
Leer el archivo no es el problema. **Lo lento será la descarga** por la Wi-Fi de la impresora
(probablemente 2–5 MB/s, es decir, 10–25 s para 50 MB). Se mide de verdad en el paso G.1.

También verifiqué en el código de Capacitor 8 (`WebViewLocalServer.handleCapacitorHttpRequest`)
que el proxy de `fetch` devuelve el `InputStream` de la conexión: la respuesta llega **por
partes**, desde el mismo origen que la app y sin CORS.

## Decisiones

### D1. Vista 2D capa a capa, no 3D

Se dibuja una capa vista desde arriba, como el visor 2D de Fluidd:
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
Para ahorrar memoria, se descartan los puntos a menos de 0,02 mm del anterior. Si en el teléfono
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
claro y en oscuro. Se comprueban con una prueba automática, como las paletas de la app. Hay un
segundo modo, **"Por filamento"**, que usa los colores de `filament_colour`. Solo aparece si el
archivo usa más de una herramienta (impresión multicolor con el CFS).

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

- Más de 100 MB: aviso con el tiempo estimado de descarga antes de empezar.
- Más de 300 MB: no se abre, con un mensaje claro.

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

### G.1 Medir en el teléfono lo que no se puede medir aquí — **high**

Es el riesgo más grande del plan, así que se comprueba lo primero, con la versión mínima del
visor de la sesión 1:

- Que en el APK la respuesta del proxy llega por partes: el primer trozo debe llegar mucho
  antes que el último.
- La velocidad real de descarga desde la Creality Hi.
- La velocidad de lectura en tu teléfono con un archivo real.

El visor tiene un panel de información ("Descarga: 48 MB a 3,1 MB/s · Lectura: 0,9 s · 2,0 M
puntos"), útil también después. Con una captura de ese panel tengo los números. Si la respuesta
no llega por partes, se implementa el respaldo de D3 antes de seguir.

### G.2 El simulador sirve G-code real — **medium**

- `scripts/gen-gcode.mjs` genera G-code al estilo de OrcaSlicer: `;LAYER_CHANGE`, `;TYPE:`,
  `EXCLUDE_OBJECT_DEFINE`/`START`/`END`, arcos `G2`/`G3`, Z hop, retracciones, cambios de
  herramienta y bloques de miniatura. Parte del generador de la prueba de rendimiento.
- El simulador sirve G-code para las rutas `.gcode`, con `Content-Length` y un poco de espera
  entre trozos para imitar la Wi-Fi. Las miniaturas siguen siendo SVG.
- Se añade `pruebas/grande_50mb.gcode` a la lista de archivos del simulador.

### G.3 El parser — **high**

`GcodeParser` según D2, D4 y D5. Debe manejar:

- `G0`/`G1` con X, Y, Z, E y F; `G2`/`G3` con I/J o R, convertidos a segmentos con un error
  máximo de 0,02 mm.
- `G90`/`G91` (posición absoluta o relativa) y `M82`/`M83` (extrusión absoluta o relativa).
- `G92` (sobre todo `G92 E0`) y `G28`.
- Retracciones: E negativo y `G10`/`G11`, que no dibujan nada.
- `T<n>`, `EXCLUDE_OBJECT_*`, `SET_PRINT_STATS_INFO`, `;TYPE:`, los comentarios de capa y los
  datos del encabezado y del final (`layer_height`, `filament_colour`).
- Saltar rápido los comentarios largos (miniaturas en base64) y las líneas que no mueven nada.
- Comentarios al final de una línea (`G1 X10 ; comentario`) y líneas en minúsculas.

Pruebas con fragmentos escritos a mano para cada caso, y con archivos reales de la carpeta
`src/gcode/fixtures/` (ver "Qué necesito de ti").

### G.4 Worker, descarga y caché — **high**

- `worker.ts` y su protocolo: `chunk` y `end` hacia el worker; `layers`, `progress`, `done` y
  `error` de vuelta.
- `useGcodeModel`: primero la caché; si no está, `fetch` por partes enviando los trozos al
  worker; al terminar, guarda el modelo en la caché. Muestra el progreso de la descarga y las
  capas listas, y se puede cancelar.
- `cache.ts` con el límite y el borrado de D7.
- Se configura Vite para el worker (`worker.format: 'iife'`).

### G.5 Dibujo de la capa — **high**

- `usePanZoom`, extraído de `ZoomPan`. Hay que comprobar que la cámara sigue igual: zoom, doble
  toque y el botón de quitar el zoom.
- `render.ts` según D9, con `Path2D` guardados por capa y categoría.
- Paleta de D6 con su prueba de contraste.

### G.6 El visor — **medium**

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

### G.7 Modo en vivo — **high**

D8 completo:
- `file_position` y `file_size` en la suscripción;
- búsqueda de la capa por byte, con pruebas;
- parte hecha y parte pendiente dentro de la capa;
- boquilla;
- seguir la capa actual y el botón para volver a ella;
- piezas excluidas tachadas.

### G.8 Puntos de entrada — **medium**

- Detalles del archivo: botón "Vista previa".
- Inicio, durante una impresión: "Ver capa actual", junto a "Objetos".
- Opcional, si sobra tiempo: tocar una pieza en el visor durante la impresión para excluirla, con
  la misma confirmación del mapa de objetos.

### G.9 Pruebas y rendimiento — **medium**

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

## Objetivos medibles

| Medida | Objetivo en el teléfono |
| --- | --- |
| Velocidad de lectura | ≥ 40 MB/s (en el Mac, ~490 MB/s) |
| Primera capa visible | ≤ 1,5 s después de que empiece a llegar el archivo |
| Memoria del modelo de 50 MB | ≤ 25 MB |
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
| La Wi-Fi de la impresora es lenta | Dibujar mientras se descarga, caché del modelo y velocidad visible en el panel |
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

## Qué necesito de ti para empezar

1. **Un G-code real de tu Creality Hi** laminado con Creality Print. Si puede ser, uno pequeño y
   otro grande (más de 30 MB). Si prefieres, cuando la impresora esté encendida puedo descargar
   uno de sus archivos en modo solo lectura: dime cuál.
2. **¿Te basta la vista 2D capa a capa?** Es mi recomendación (D1). Si para ti es importante el
   3D, lo planteo como una versión aparte.
3. **¿Usas el CFS para imprimir en varios colores?** Si es así, el modo "Por filamento" pasa a
   ser prioritario.
