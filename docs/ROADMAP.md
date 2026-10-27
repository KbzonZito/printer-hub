# Plan de implementación hacia la 1.0

Cada fase termina en una versión publicada con el flujo habitual: cambios en local, APK de prueba
(`npm run apk`), confirmación en el teléfono y `npm run release`. Las funciones nuevas suben la
versión menor (0.x.0) y las correcciones la de parche (0.x.y).

| Versión | Contenido | Estado |
| --- | --- | --- |
| 0.2.0 | Estado actual (carpetas, colores dinámicos, presets, versiones numeradas) | Pendiente de tu prueba |
| 0.3.0 | Bienvenida y tutorial para añadir la impresora | |
| 0.4.0 | Conexión en tiempo real y conexión robusta | |
| 0.5.0 | Excluir objetos y cola de impresión | |
| 0.6.0 | Notificaciones con foto, widget y ajuste rápido | |
| 0.7.0 | Filamento (Spoolman) y estadísticas | |
| 0.8.0 | Malla de la cama, calibraciones, enchufes y editor de configuración | |
| 0.9.0 | Vista previa del G-code y vista de todas las impresoras | |
| 1.0.0-rc | Optimización, limpieza, pruebas y documentación | |
| 1.0.0 | Publicación tras la lista de comprobación final | |

El orden pone primero la bienvenida (es lo que ve un usuario nuevo) y después la conexión en
tiempo real, porque casi todas las funciones siguientes la aprovechan.

---

## Fase 1 — Bienvenida y tutorial (0.3.0)

Sustituye la pantalla actual de "Conecta tu impresora" por un asistente de varios pasos, con
indicador de progreso (puntos), botones Atrás / Siguiente y transiciones animadas.

1. **Bienvenida**: logo, nombre, frase corta y botón "Empezar". Fondo con el color dinámico.
2. **Apariencia**: idioma (detectado del sistema), tema claro / oscuro / sistema, color y estilo
   de paleta. Los cambios se ven al momento en la propia pantalla.
3. **Notificaciones** (solo Android): explica para qué sirven y pide el permiso. Se puede omitir.
4. **Requisitos**: qué necesita la impresora (Klipper + Moonraker, misma Wi-Fi; en la Creality Hi,
   root activado) con un enlace a la ayuda.
5. **Añadir impresora**, con dos caminos:
   - **Buscar en la red**: escanea, muestra las encontradas y se elige una.
   - **Manual**: explica dónde ver la IP en la pantalla de la Creality Hi (Ajustes → Red) con una
     ilustración, y pide IP y puerto.
   Después prueba la conexión, detecta la cámara y propone un nombre (el hostname).
6. **Listo**: resumen y 3 consejos rápidos (tocar las temperaturas, deslizar en archivos, el
   widget).

Detalles:
- El asistente se puede reabrir desde Ajustes ("Ver tutorial") y "Añadir impresora" usa los
  pasos 4 y 5.
- Si se cierra a medias, se recuerda el paso.
- Archivos nuevos: `src/onboarding/` (un componente por paso y el contenedor con el estado).

## Fase 2 — Conexión en tiempo real (0.4.0)

Base técnica para todo lo demás.

- **WebSocket de Moonraker** (`/websocket`, `printer.objects.subscribe`) en lugar de consultar
  cada 2 segundos: datos al instante, menos batería y menos tráfico. Si el WebSocket falla,
  vuelve a la consulta periódica.
- **Detección de capacidades**: leer `/server/info` (componentes como `job_queue`, `spoolman`,
  `power`, `timelapse`) y `printer.objects.list`. Cada función solo aparece si la impresora la
  soporta. Es importante porque el Moonraker de Creality puede ser antiguo o venir recortado.
- **Conexión robusta**: banner de "Reconectando…" con reintentos crecientes, y pantalla clara
  cuando Klipper está en error o apagado, con el mensaje y los botones "Reiniciar firmware" y
  "Reiniciar Klipper".

## Fase 3 — Funciones nuevas

### 0.5.0 — Durante la impresión
- **Excluir objetos**: mapa de la cama con los contornos de cada pieza (objeto
  `exclude_object` de Klipper). Al tocar una pieza se pide confirmación y se excluye con
  `EXCLUDE_OBJECT`. Las piezas excluidas aparecen tachadas. Requiere que el laminador marque los
  objetos (Creality Print y OrcaSlicer lo hacen).
- **Cola de impresión** (`/server/job_queue/*`): "Añadir a la cola" desde un archivo, una
  pestaña "Cola" en Archivos para reordenar o quitar, e iniciar / pausar la cola.

### 0.6.0 — Avisos
- **Notificación con foto** al terminar, pausar o fallar, con una captura de la cámara
  (BigPicture).
- Aviso opcional al terminar la **primera capa**.
- **Progreso en vivo** en la notificación (estilo de Android 16 cuando esté disponible).
- **Widget** con los colores dinámicos y un tamaño grande con miniatura.
- **Ajuste rápido** (Quick Settings tile) con el progreso; al tocarlo abre la app.

### 0.7.0 — Filamento y estadísticas
- **Spoolman** (si está instalado): bobina activa, peso restante y cambiar de bobina. Antes de
  imprimir, aviso si no queda filamento suficiente.
- **Coste** por impresión (precio por kg configurable por material, en los presets).
- **Estadísticas**: horas, filamento y número de impresiones por semana / mes, tasa de éxito y
  gráficas sencillas (a partir del historial).

### 0.8.0 — Mantenimiento
- **Malla de la cama**: mapa de calor del `bed_mesh` con la diferencia máxima, y botón para
  calibrar.
- **Asistentes de calibración** guiados, cada uno con confirmación: PID de boquilla y cama,
  Z offset, input shaper (si hay acelerómetro).
- **Enchufes inteligentes** (`/machine/device_power`): encender / apagar y apagado automático al
  terminar y enfriar.
- **Editor de configuración**: abrir `printer.cfg` y otros archivos de config, editar, guardar y
  reiniciar el firmware. Se avisa antes de guardar.

### 0.9.0 — Vista general
- **Vista previa del G-code** capa a capa, de un archivo o de la impresión en curso (con la capa
  actual resaltada). El G-code se procesa en un web worker para no bloquear la app.
- **Todas las impresoras**: si hay más de una, una pantalla con el estado, el progreso y la
  cámara de cada una.

## Fase 4 — Mejoras propias

Se reparten entre las versiones anteriores según encajen:

- **Gesto atrás de Android**: cierra primero el panel abierto, sube de carpeta en Archivos y
  solo después vuelve a Inicio.
- **Deslizar para recargar** en Archivos, Historial y Timelapses.
- **Vibración sutil** (Capacitor Haptics) al pausar, cancelar o en el paro de emergencia.
- **Zoom con dos dedos** en la cámara a pantalla completa, y una captura que se pueda compartir.
- **Icono temático** de Android 13+ (monocromo) y pantalla de inicio con el color dinámico.
- **Copia de seguridad de los ajustes**: exportar / importar impresoras, presets y apariencia en
  un archivo.
- **Acceso desde fuera de casa**: guía en la ayuda para usar Tailscale o similar (sin cambios en
  la app).
- **Accesibilidad**: etiquetas en todos los botones de icono, contraste revisado, textos que
  respeten el tamaño de letra del sistema y áreas táctiles de al menos 48 px.

## Fase 5 — Optimización y limpieza para la 1.0

### Código
- Dividir los archivos grandes: `FileBrowser.tsx` (864 líneas), `SettingsScreen.tsx` (747) y
  `styles.css` (más de 2000 líneas, que pasaría a un CSS por pantalla o componente).
- Eliminar código muerto: reglas CSS que quedaron de las barras anteriores, claves de traducción
  sin usar (`settings.app`…) y exports que ya no se usan. Un script en CI detecta claves de
  traducción sin uso o que falten en un idioma.
- Unificar patrones repetidos: carga con error y reintento, listas vacías, hojas de confirmación.

### Calidad
- **ESLint + Prettier** con comprobación en CI.
- **Pruebas unitarias** (Vitest) de la lógica: tiempos restantes (`eta.ts`), estimaciones
  (`estimate.ts`), formatos, paletas y lectura de respuestas de Moonraker.
- **Pruebas de extremo a extremo** (Playwright) contra un Moonraker simulado que pasa a formar
  parte del repositorio (`scripts/mock-moonraker.mjs`): bienvenida, añadir impresora, archivos,
  carpetas e imprimir.
- **Error boundary**: si una pantalla falla, se muestra un aviso con "Reintentar" en vez de una
  pantalla en blanco.

### Rendimiento
- Cargar cada pantalla solo al abrirla (`React.lazy`) para que la app arranque antes. El paquete
  JS pesa ahora unos 400 kB.
- Listas virtualizadas para carpetas con cientos de archivos, y caché de miniaturas.
- Android: activar R8 (minify y shrinkResources) con sus reglas para Capacitor, y corregir la API
  obsoleta que avisa el compilador en `PrinterMonitorPlugin`.
- Revisar el consumo de batería del servicio de notificaciones (intervalo adaptativo: más lento
  cuando falta mucho para terminar).

### Publicación
- README con capturas de pantalla, licencia (propongo MIT) y nota de privacidad (la app solo
  habla con tu impresora en tu red y no envía datos a terceros).
- **Lista de comprobación de la 1.0**:
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
