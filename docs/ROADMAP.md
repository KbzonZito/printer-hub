# Plan de implementación hacia la 1.0

Cada fase termina en una versión publicada con el flujo habitual: cambios en local, APK de prueba
(`npm run apk`), confirmación en el teléfono y `npm run release`. Las funciones nuevas suben la
versión menor (0.x.0) y las correcciones la de parche (0.x.y).

| Versión | Contenido | Planear | Implementar | Estado |
| --- | --- | --- | --- | --- |
| 0.2.0 | Estado actual (carpetas, colores dinámicos, presets, versiones numeradas) | — | — | Incluida en 0.4.0 |
| 0.3.0 | Bienvenida y tutorial para añadir la impresora | high | medium | Incluida en 0.4.0 |
| 0.4.0 | Conexión en tiempo real y conexión robusta | xhigh | high | Publicada |
| 0.5.0 | Excluir objetos y cola de impresión | high | high / medium | |
| 0.6.0 | Notificaciones con foto, widget y ajuste rápido | high | high | |
| 0.7.0 | Filamento (Spoolman) y estadísticas | medium | medium | |
| 0.8.0 | Malla de la cama, calibraciones, enchufes y editor de configuración | high | medium / high | |
| 0.9.0 | Vista previa del G-code y vista de todas las impresoras | xhigh | high | |
| 1.0.0-rc | Optimización, limpieza, pruebas y documentación | high | low a high | |
| 1.0.0 | Publicación tras la lista de comprobación final | — | low | |

Cada paso lleva entre corchetes el nivel de esfuerzo de Opus 5.5 recomendado para
implementarlo, por ejemplo **[medium]**. La sección siguiente explica cómo se decide.

El orden pone primero la bienvenida (es lo que ve un usuario nuevo) y después la conexión en
tiempo real, porque casi todas las funciones siguientes la aprovechan.

---

## Cómo elegir el nivel de esfuerzo

Es siempre el mismo modelo. El nivel decide cuánto piensa antes de actuar: más nivel significa
más cuidado con los casos difíciles, pero también más tiempo y más consumo. No hace un trabajo
"mejor" en lo que ya es fácil.

Hazte tres preguntas sobre la tarea:

1. **¿Está claro qué hay que hacer?** Si la tarea se describe en una frase y ya existe algo
   parecido en la app, el nivel puede ser bajo. Si hay que decidir cómo hacerlo, sube.
2. **¿Cuántas piezas se tocan a la vez?** Un archivo o una pantalla es poco. Estado compartido,
   conexión de red, código nativo de Android o varias pantallas a la vez es mucho.
3. **¿Puedo comprobar el resultado fácilmente?** Si se ve en el navegador al momento, un fallo
   se detecta enseguida. Si solo se puede probar en el teléfono, con la impresora real o en
   situaciones raras (cortes de red, segundo plano), conviene que piense más antes de escribir.

| Nivel | Cuándo usarlo | Ejemplos de este proyecto |
| --- | --- | --- |
| **low** | Cambios mecánicos y bien definidos | Textos y traducciones, un color, un icono, renombrar, quitar código muerto |
| **medium** | Funciones normales siguiendo patrones que ya existen | Una pantalla nueva parecida a otras, un ajuste más, una lista con datos de Moonraker |
| **high** | Varias piezas a la vez, decisiones de diseño, código nativo o fallos difíciles | Notificaciones nativas, animaciones delicadas, cola de impresión, planificar una fase |
| **xhigh** | Arquitectura que condiciona lo que viene después, o un fallo que no se resolvió con high | Conexión por WebSocket con reconexión, visor de G-code con buen rendimiento |
| **max** | Rara vez: cuando todo lo anterior falló o un error puede ser grave | Un fallo intermitente que nadie consigue reproducir |

**Reglas prácticas:**
- **Planear un nivel por encima de implementar.** Tu costumbre (high para planear, medium para
  implementar) es una buena base. Un buen plan hace que la implementación sea más mecánica.
- **Si tras dos intentos algo sigue fallando, sube un nivel**, en vez de insistir con el mismo.
  La barra de navegación es un ejemplo: con medium se probaron varias animaciones sin encontrar
  la causa (el ripple ensanchaba el botón). Con high desde el segundo intento probablemente se
  habría investigado la causa antes de cambiar el diseño.
- **Para depurar, sube; para repetir, baja.** Encontrar por qué falla algo pide más nivel que
  aplicar la misma corrección en varios sitios.
- **El riesgo también cuenta.** Lo que puede mover la impresora, calentar o borrar archivos
  merece un nivel más aunque parezca sencillo.

---

## Fase 1 — Bienvenida y tutorial (0.3.0)

Sustituye la pantalla actual de "Conecta tu impresora" por un asistente de varios pasos, con
indicador de progreso (puntos), botones Atrás / Siguiente y transiciones animadas.

1. **[medium] Bienvenida**: logo, nombre, frase corta y botón "Empezar". Fondo con el color dinámico.
2. **[low] Apariencia**: idioma (detectado del sistema), tema claro / oscuro / sistema, color y estilo
   de paleta. Los cambios se ven al momento en la propia pantalla. Reutiliza `AppearancePrefs`.
3. **[medium] Notificaciones** (solo Android): explica para qué sirven y pide el permiso. Se puede omitir.
4. **[low] Requisitos**: qué necesita la impresora (Klipper + Moonraker, misma Wi-Fi; en la Creality Hi,
   root activado) con un enlace a la ayuda.
5. **[medium] Añadir impresora**, con dos caminos:
   - **Buscar en la red**: escanea, muestra las encontradas y se elige una.
   - **Manual**: explica dónde ver la IP en la pantalla de la Creality Hi (Ajustes → Red) con una
     ilustración, y pide IP y puerto.
   Después prueba la conexión, detecta la cámara y propone un nombre (el hostname).
6. **[low] Listo**: resumen y 3 consejos rápidos (tocar las temperaturas, deslizar en archivos, el
   widget).

Detalles **[medium]**:
- El asistente se puede reabrir desde Ajustes ("Ver tutorial") y "Añadir impresora" usa los
  pasos 4 y 5.
- Si se cierra a medias, se recuerda el paso.
- Archivos nuevos: `src/onboarding/` (un componente por paso y el contenedor con el estado).

## Fase 2 — Conexión en tiempo real (0.4.0)

Base técnica para todo lo demás. Cambia cómo llegan los datos a todas las pantallas, por eso
conviene planearla con **xhigh**.

**Plan detallado:** [plans/fase-2-tiempo-real.md](plans/fase-2-tiempo-real.md) (11 pasos con su
nivel, arquitectura, máquina de estados, pruebas y riesgos).

- **[xhigh] WebSocket de Moonraker** (`/websocket`, `printer.objects.subscribe`) en lugar de consultar
  cada 2 segundos: datos al instante, menos batería y menos tráfico. Si el WebSocket falla,
  vuelve a la consulta periódica.
- **[medium] Detección de capacidades**: leer `/server/info` (componentes como `job_queue`, `spoolman`,
  `power`, `timelapse`) y `printer.objects.list`. Cada función solo aparece si la impresora la
  soporta. Es importante porque el Moonraker de Creality puede ser antiguo o venir recortado.
- **[high] Conexión robusta**: banner de "Reconectando…" con reintentos crecientes, y pantalla clara
  cuando Klipper está en error o apagado, con el mensaje y los botones "Reiniciar firmware" y
  "Reiniciar Klipper".

## Fase 3 — Funciones nuevas

### 0.5.0 — Durante la impresión
- **[high] Excluir objetos**: mapa de la cama con los contornos de cada pieza (objeto
  `exclude_object` de Klipper). Al tocar una pieza se pide confirmación y se excluye con
  `EXCLUDE_OBJECT`. Las piezas excluidas aparecen tachadas. Requiere que el laminador marque los
  objetos (Creality Print y OrcaSlicer lo hacen). Es high por la geometría (convertir las
  coordenadas de la cama al dibujo) y porque un error excluye la pieza equivocada.
- **[medium] Cola de impresión** (`/server/job_queue/*`): "Añadir a la cola" desde un archivo, una
  pestaña "Cola" en Archivos para reordenar o quitar, e iniciar / pausar la cola.

### 0.6.0 — Avisos
- **[high] Notificación con foto** al terminar, pausar o fallar, con una captura de la cámara
  (BigPicture).
- **[medium]** Aviso opcional al terminar la **primera capa**.
- **[high] Progreso en vivo** en la notificación (estilo de Android 16 cuando esté disponible).
- **[medium] Widget** con los colores dinámicos y un tamaño grande con miniatura.
- **[high] Ajuste rápido** (Quick Settings tile) con el progreso; al tocarlo abre la app.

### 0.7.0 — Filamento y estadísticas
- **[medium] Spoolman** (si está instalado): bobina activa, peso restante y cambiar de bobina. Antes de
  imprimir, aviso si no queda filamento suficiente.
- **[low] Coste** por impresión (precio por kg configurable por material, en los presets).
- **[medium] Estadísticas**: horas, filamento y número de impresiones por semana / mes, tasa de éxito y
  gráficas sencillas (a partir del historial).

### 0.8.0 — Mantenimiento
- **[medium] Malla de la cama**: mapa de calor del `bed_mesh` con la diferencia máxima, y botón para
  calibrar.
- **[high] Asistentes de calibración** guiados, cada uno con confirmación: PID de boquilla y cama,
  Z offset, input shaper (si hay acelerómetro).
- **[medium] Enchufes inteligentes** (`/machine/device_power`): encender / apagar y apagado automático al
  terminar y enfriar.
- **[medium] Editor de configuración**: abrir `printer.cfg` y otros archivos de config, editar, guardar y
  reiniciar el firmware. Se avisa antes de guardar.

### 0.9.0 — Vista general
- **[high] Vista previa del G-code** capa a capa, de un archivo o de la impresión en curso (con la capa
  actual resaltada). El G-code se procesa en un web worker para no bloquear la app. Planear con
  **xhigh**: archivos de decenas de MB en un teléfono obligan a pensar bien el rendimiento.
- **[high] Todas las impresoras**: si hay más de una, una pantalla con el estado, el progreso y la
  cámara de cada una.

## Fase 4 — Mejoras propias

**Hecha** (pendiente de publicar en la próxima versión; está en `[Unreleased]` del CHANGELOG).

- **[medium] Gesto atrás de Android**: cierra primero el panel abierto, sube de carpeta en Archivos y
  solo después vuelve a Inicio.
- **[medium] Deslizar para recargar** en Archivos, Historial y Timelapses.
- **[low] Vibración sutil** (Capacitor Haptics) al pausar, cancelar o en el paro de emergencia.
- **[medium] Zoom con dos dedos** en la cámara a pantalla completa, y una captura que se pueda compartir.
- **[low] Icono temático** de Android 13+ (monocromo) y pantalla de inicio con el color dinámico.
- **[medium] Copia de seguridad de los ajustes**: exportar / importar impresoras, presets y apariencia en
  un archivo.
- **[low] Acceso desde fuera de casa**: guía en la ayuda para usar Tailscale o similar (sin cambios en
  la app).
- **[medium] Accesibilidad**: etiquetas en todos los botones de icono, contraste revisado, textos que
  respeten el tamaño de letra del sistema y áreas táctiles de al menos 48 px.

## Fase 5 — Optimización y limpieza para la 1.0

### Código
- **[medium]** Dividir los archivos grandes: `FileBrowser.tsx` (864 líneas), `SettingsScreen.tsx` (747) y
  `styles.css` (más de 2000 líneas, que pasaría a un CSS por pantalla o componente).
- **[low]** Eliminar código muerto: reglas CSS que quedaron de las barras anteriores, claves de traducción
  sin usar (`settings.app`…) y exports que ya no se usan. Un script en CI detecta claves de
  traducción sin uso o que falten en un idioma.
- **[medium]** Unificar patrones repetidos: carga con error y reintento, listas vacías, hojas de confirmación.

### Calidad
- **[low] ESLint + Prettier** con comprobación en CI.
- **[medium] Pruebas unitarias** (Vitest) de la lógica: tiempos restantes (`eta.ts`), estimaciones
  (`estimate.ts`), formatos, paletas y lectura de respuestas de Moonraker.
- **[high] Pruebas de extremo a extremo** (Playwright) contra un Moonraker simulado que pasa a formar
  parte del repositorio (`scripts/mock-moonraker.mjs`): bienvenida, añadir impresora, archivos,
  carpetas e imprimir.
- **[low] Error boundary**: si una pantalla falla, se muestra un aviso con "Reintentar" en vez de una
  pantalla en blanco.

### Rendimiento
- **[medium]** Cargar cada pantalla solo al abrirla (`React.lazy`) para que la app arranque antes. El paquete
  JS pesa ahora unos 400 kB.
- **[medium]** Listas virtualizadas para carpetas con cientos de archivos, y caché de miniaturas.
- **[high]** Android: activar R8 (minify y shrinkResources) con sus reglas para Capacitor, y corregir la API
  obsoleta que avisa el compilador en `PrinterMonitorPlugin`. Es high porque R8 puede romper en
  tiempo de ejecución el código que Capacitor usa por reflexión, y solo se nota en el APK.
- **[high]** Revisar el consumo de batería del servicio de notificaciones (intervalo adaptativo: más lento
  cuando falta mucho para terminar).

### Publicación
- **[low]** README con capturas de pantalla, licencia (propongo MIT) y nota de privacidad (la app solo
  habla con tu impresora en tu red y no envía datos a terceros).
- **[low] Lista de comprobación de la 1.0** (la prueba la haces tú en el teléfono):
  - Instalación limpia y actualización desde la versión anterior.
  - Teléfono y tablet; Android 10 a 16.
  - Claro / oscuro, español / inglés y varios colores.
  - Creality Hi y, si es posible, otra impresora con Klipper.
  - Copia de seguridad de la clave de firma comprobada.

---

## Puntos por confirmar

- Qué expone exactamente el Moonraker de tu Creality Hi (versión, `exclude_object`,
  `job_queue`, cámara). La fase 2 lo detecta, pero conviene revisarlo pronto con la impresora
  real.
- Si usas o quieres instalar Spoolman, o si basta con controlar el filamento desde la app.
- Si alguna fase es prioritaria para ti y conviene adelantarla.
