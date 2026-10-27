# Fase 2 — Conexión en tiempo real (versión 0.4.0)

Plan detallado de la fase 2 del [roadmap](../ROADMAP.md). Planeado con **xhigh**; cada paso indica
el nivel recomendado para implementarlo.

## Objetivo

Que la app reciba los cambios de la impresora **al instante** y se recupere sola de cortes, sin
que el usuario tenga que hacer nada:

- Temperaturas, progreso y estado se actualizan en menos de 1 segundo (hoy, cada 2 s).
- Si la impresora se apaga o se pierde la Wi-Fi, aparece "Reconectando…" y la app vuelve sola
  cuando la impresora responde.
- Si Klipper está en error, apagado o reiniciándose, se explica qué pasa y se ofrece
  "Reiniciar firmware" o "Reiniciar Klipper".
- Cada función aparece solo si la impresora la soporta (base para las fases siguientes).
- Menos tráfico y batería: un único canal abierto en vez de consultas cada 2 s.

## Situación actual

| Pieza | Cómo funciona hoy |
| --- | --- |
| Estado de la impresora | `usePrinterStatusPoll` consulta `/printer/objects/query` cada 2 s y se pausa con la app oculta (`src/usePrinterStatus.ts`) |
| Gráfica de temperaturas | Una muestra por consulta, más el historial inicial de `temperature_store` |
| Consola | `ControlScreen` consulta `gcode_store` cada 2,5 s |
| Después de una acción | 5 sitios llaman a `refresh()` para no esperar al siguiente ciclo |
| Errores | Solo "Desconectada" en la cabecera y un botón "Reintentar" en Inicio |
| Notificaciones en segundo plano | El servicio nativo consulta por HTTP cada 15 s (no cambia en esta fase) |
| Peticiones HTTP | Pasan por `CapacitorHttp` (nativo), así que no les afecta CORS |

## Decisiones

### D1. WebSocket para el estado y los avisos; HTTP para las acciones

Moonraker ofrece `/websocket` con JSON-RPC 2.0: te suscribes a objetos de Klipper
(`printer.objects.subscribe`) y te envía solo lo que cambia (`notify_status_update`), además de
avisos como `notify_klippy_ready`, `notify_klippy_shutdown`, `notify_klippy_disconnected`,
`notify_gcode_response`, `notify_filelist_changed` y `notify_history_changed`.

Las acciones (imprimir, pausar, temperaturas, archivos) **siguen por HTTP** como ahora. Ya
funcionan, y moverlas no aporta nada en esta fase.

### D2. En Android, el WebSocket se abre desde código nativo

Es la decisión más importante. Lo comprobé en el código de Moonraker
(`components/websockets.py` y `authorization.py`):

- Un WebSocket abierto desde el WebView lleva el encabezado `Origin: http://localhost`.
- Moonraker solo lo acepta si `cors_domains` en `moonraker.conf` incluye algo como
  `*://localhost`. Muchas instalaciones lo traen, pero **no está garantizado**, y no podemos
  pedir a cada usuario que edite la configuración de su impresora.
- Las conexiones sin `Origin` (apps nativas como Mobileraker) no pasan por esa comprobación.

Por eso:
- **Android**: un transporte nativo en Java con la librería
  [Java-WebSocket](https://github.com/TooTallNate/Java-WebSocket) (unos 150 KB, sin
  dependencias de Kotlin; OkHttp añadiría más de 1,5 MB). Envía los mensajes al JavaScript con
  eventos del plugin.
- **Navegador** (desarrollo con `npm run dev`): el `WebSocket` del navegador.
- Las dos implementaciones cumplen la misma interfaz `Transport`, así que el resto del código no
  sabe cuál usa.

### D3. Un único modelo de estado

Hoy `fetchStatus` consulta y convierte los datos en el mismo paso. Lo separamos:

1. **Objetos crudos** de Klipper (`Record<string, object>`), que se actualizan con `mergeStatus`
   porque cada aviso trae solo los campos que cambiaron. La fusión es a dos niveles (objeto →
   campo): Klipper envía cada campo cambiado completo, así que fusionar más adentro (por
   ejemplo en `print_stats.info`) podría dejar claves antiguas.
2. **`parseStatus(raw, discovered)`**, una función pura que produce el `PrinterStatus` de siempre.

Tanto la consulta periódica como el WebSocket alimentan los objetos crudos, así que las pantallas
reciben exactamente el mismo `PrinterStatus` que hoy.

### D4. Si el WebSocket falla, se vuelve a la consulta periódica

Si el WebSocket no conecta tres veces seguidas pero HTTP sí responde, la app pasa a consultar
cada 2 s (el comportamiento actual) y reintenta el WebSocket cada 60 s. El usuario no nota
nada. En "Acerca de" se muestra el modo: "Tiempo real" o "Consulta periódica".

### D5. Suscribirse solo a los campos necesarios

Con `null` (todos los campos), `toolhead.estimated_print_time` y otros cambian sin parar y
generarían avisos constantes. La suscripción pide solo lo que usa `parseStatus`, por ejemplo
`toolhead: ["homed_axes", "position"]`.

### D6. Ritmo de actualización controlado

- Klipper puede enviar cambios cada 250 ms. La interfaz se actualiza **como mucho 4 veces por
  segundo**, agrupando los cambios.
- La gráfica toma **una muestra por segundo** del último estado (no una por mensaje). El
  historial inicial de `temperature_store` se mantiene, pero ahora a 1 s por muestra.

### D7. Un gestor de conexiones por impresora

Esta fase solo abre la conexión de la impresora activa, pero el gestor
(`ConnectionManager`) guarda una conexión por id de impresora. Así, la vista de "todas las
impresoras" (0.9.0) no obliga a rehacerlo.

### D8. Ciclo de vida en Android

- Con la app en segundo plano, el WebSocket se cierra a los 30 s (Android puede matarlo de todas
  formas). Al volver se reabre al instante y se pide el estado completo.
- El servicio de notificaciones sigue consultando por HTTP cada 15 s. Usar el WebSocket en el
  servicio se valorará en la fase 0.6.0 (avisos) midiendo la batería.

## Arquitectura

```
src/connection/
  transport.ts          Interfaz Transport + WebTransport (WebSocket del navegador)
  nativeTransport.ts    Transporte de Android (eventos del plugin PrinterMonitor)
  jsonrpc.ts            Peticiones con id y timeout; reparte los avisos
  statusModel.ts        mergeStatus, parseStatus, lista de suscripción (D3, D5)
  capabilities.ts       Qué soporta la impresora (componentes de Moonraker y objetos de Klipper)
  PrinterConnection.ts  Máquina de estados, reconexión, vigilancia, consulta periódica de respaldo
  manager.ts            Una conexión por impresora (D7)
  hooks.ts              useConnection, usePrinterStatus, useCapabilities, useGcodeLog, useTempHistory
android/.../NativeSocket.java   Envoltorio de Java-WebSocket usado por PrinterMonitorPlugin
```

Flujo de datos:

```
Klipper ─▶ Moonraker ─(WebSocket)─▶ Transport ─▶ JsonRpc ─▶ PrinterConnection
                                                              │  objetos crudos + mergeStatus
                                                              │  parseStatus (≤ 4/s)
                                                              ▼
                                                 manager ─▶ hooks ─▶ pantallas
```

`usePrinterStatus()` mantiene su forma actual (`status`, `error`, `connected`, `tempHistory`,
`refresh`) para que las pantallas no cambien. `refresh()` pasa a pedir un
`printer.objects.query` puntual.

## Máquina de estados de la conexión

| Estado | Significado | Qué ve el usuario |
| --- | --- | --- |
| `connecting` | Abriendo el WebSocket por primera vez | Cargando |
| `waitingKlippy` | Moonraker responde, pero Klipper está en `startup` (se repite `server.info` cada 2 s) | "Klipper se está iniciando…" |
| `ready` | Suscrito y recibiendo cambios | Normal |
| `klippyError` | Klipper en `error` o `shutdown`, o `disconnected` | Pantalla con el `state_message` y los botones de reinicio |
| `reconnecting` | Se perdió la conexión; reintento N dentro de X s | Banner "Reconectando…" con "Reintentar ahora" |
| `polling` | Respaldo por HTTP (D4) | Normal |
| `paused` | App en segundo plano | — |

Arranque, según la secuencia que recomienda la documentación de Moonraker:

1. Abrir `/websocket`.
2. `server.connection.identify` (nombre, versión, tipo `mobile`). Si falla, se continúa: las
   versiones antiguas de Moonraker pueden no tenerlo.
3. `server.info`: según `klippy_state`, ir a `ready`, `waitingKlippy` o `klippyError`.
4. Con Klipper listo: `printer.objects.list` (capacidades y objetos opcionales),
   `printer.info` y `printer.objects.subscribe` con la lista de D5. La respuesta trae el estado
   completo inicial.
5. Con `notify_klippy_disconnected` se vuelve al paso 3. Con `notify_klippy_ready`, al paso 4.

Reconexión:
- Esperas de 1, 2, 4, 8 y 15 s (máximo), con un poco de azar para no sincronizar reintentos.
- Se reintenta al instante al volver a la app y con "Reintentar ahora".
- **Vigilancia**: Moonraker envía `notify_proc_stat_update` cada segundo. Si pasan 8 s sin ningún
  mensaje, se envía `server.info`; sin respuesta en 4 s, se da la conexión por muerta y se
  reconecta. Así se detectan las conexiones "zombi" que Android no cierra.

## Pasos

Cada paso termina con la app funcionando (commit local) y su criterio de aceptación.

### 2.1 Verificar la impresora real — **low** ✅

Resultado en [creality-hi.md](creality-hi.md): la impresora rechaza el `Origin` del WebView
(403) y acepta la conexión nativa, lo que confirma D2.

Con la IP de tu Creality Hi, desde el Mac (sin tocar la impresora):
- `GET /server/info`: versión de Moonraker, `api_version` y lista de componentes (`job_queue`,
  `timelapse`, `spoolman`, `power`…).
- `GET /server/config`: valores de `cors_domains` y `trusted_clients`.
- `GET /printer/objects/list`: `exclude_object`, `bed_mesh`, LEDs y sensores.
- Una conexión WebSocket de prueba con y sin `Origin: http://localhost`.

**Resultado:** una nota en `docs/plans/creality-hi.md` con lo que expone la impresora. Confirma D2
y adelanta información para las fases 0.5–0.8.

### 2.2 Moonraker simulado en el repositorio — **medium** ✅
Pasar el servidor de pruebas que uso ahora a `scripts/mock-moonraker.mjs` (con `ws` como
dependencia de desarrollo) y añadir:
- WebSocket con JSON-RPC: `identify`, `server.info`, `printer.info`, `objects.list`,
  `objects.subscribe`, y avisos cada 250 ms y cada 1 s (`proc_stat`).
- Escenarios elegibles con una variable: `normal`, `klippy-startup` (10 s y luego listo),
  `shutdown`, `drop` (corta la conexión cada 30 s), `silent` (deja de enviar sin cerrar),
  `reject-origin` (rechaza con 403 si hay `Origin`) y `slow` (respuestas con 2 s de retraso).
- `npm run mock` para arrancarlo.

**Acepta:** la app actual sigue funcionando contra el simulador, y cada escenario se puede
reproducir.

### 2.3 Modelo de estado y primeras pruebas automáticas — **medium** ✅
- Crear `statusModel.ts`: `mergeStatus`, `parseStatus` (movida desde `fetchStatus`) y la lista de
  suscripción. `fetchStatus` pasa a usar `parseStatus`.
- Añadir **Vitest** con pruebas de `mergeStatus` (cambios parciales, arrays, valores `null`) y de
  `parseStatus` (impresora sin cámara ni luz, imprimiendo, en error).

**Acepta:** `npm test` en verde, y la app se comporta igual que antes (sigue con la consulta
periódica).

### 2.4 Cliente JSON-RPC y transporte del navegador — **high**
- La interfaz `Transport`: `open`, `send`, `close`, y los eventos `message`, `open` y
  `close(code, reason)`.
- `WebTransport` sobre el `WebSocket` del navegador.
- `JsonRpc`: ids crecientes, promesas con timeout (10 s), errores de JSON-RPC como excepciones
  y reparto de avisos por método. Todas las peticiones pendientes fallan si se cierra el
  transporte.
- Pruebas con Vitest y un transporte falso.

**Acepta:** pruebas de petición y respuesta, timeout, error y cierre con peticiones pendientes.

### 2.5 Transporte nativo de Android — **high**
- Añadir `org.java-websocket:Java-WebSocket` a `android/app/build.gradle`.
- `NativeSocket.java`: abrir, enviar y cerrar por id de conexión, en un hilo propio, sin enviar
  `Origin`.
- Métodos del plugin `PrinterMonitor`: `socketOpen`, `socketSend` y `socketClose`. Eventos
  `socketMessage`, `socketOpen` y `socketClose`.
- `nativeTransport.ts` implementa `Transport` sobre esos métodos. Se elige automáticamente con
  `isNative`.

**Acepta:** en el APK de prueba la consola registra la conexión. Solo se puede comprobar en el
teléfono, por eso va en high.

### 2.6 `PrinterConnection`: la máquina de estados — **high** (xhigh si falla dos veces)
Implementar todo lo de la sección anterior: arranque, suscripción, `mergeStatus` de los avisos,
estados de Klipper, reconexión con esperas, vigilancia, ciclo de vida de la app (`appStateChange`
de Capacitor), respaldo por consulta periódica (D4) y emisión agrupada (≤ 4/s, D6).

**Acepta:** contra el simulador se cumplen todos los escenarios de 2.2 (ver "Pruebas"). Es la
pieza más delicada: conviene implementarla en una sesión dedicada y con el simulador en marcha.

### 2.7 Integración con las pantallas — **medium**
- `manager.ts` y `hooks.ts`.
- `App.tsx` usa el gestor en lugar de `usePrinterStatusPoll`.
- `StatusContext` desaparece y `usePrinterStatus()` mantiene la misma forma.
- Muestreo de temperaturas a 1 s y semilla de `temperature_store` a 1 s.
- Borrar `usePrinterStatusPoll` y el código que ya no se use.

**Acepta:** todas las pantallas funcionan igual o mejor. En el navegador, la gráfica avanza cada
segundo y los cambios de temperatura del simulador se ven en menos de 1 s.

### 2.8 Detección de capacidades — **medium**
- `capabilities.ts`: componentes de `server.info` y objetos de `printer.objects.list`,
  guardados por impresora y refrescados con `notify_klippy_ready`.
- `useCapabilities()`.
- Primer uso: la pestaña Timelapse solo aparece si existe el componente `timelapse`. La luz y el
  recinto ya dependen de los objetos descubiertos.
- **Ventilador:** detectar el objeto del ventilador de pieza (`fan` o, como en la Creality Hi,
  `output_pin fan0`) igual que la luz. Hoy la Hi muestra siempre 0 % porque no tiene `fan`.

**Acepta:** sin `timelapse` en el simulador, la pestaña no aparece.

### 2.9 Interfaz de conexión — **medium**
- **Banner** bajo la cabecera: "Reconectando… (intento N)" con "Reintentar ahora". Aparece solo
  si el corte dura más de 2 s, para que no parpadee.
- **Pantalla de estado de Klipper** en lugar del contenido de Inicio y Control:
  - "Iniciando…" con un indicador de carga.
  - Error o apagado: el `state_message` y los botones "Reiniciar firmware"
    (`/printer/firmware_restart`) y "Reiniciar Klipper" (`/printer/restart`), ambos con
    confirmación.
  - "Klipper no está conectado": explicación y "Reiniciar Klipper".
- Punto de la cabecera: verde (listo), ámbar (Klipper no listo o reconectando), rojo (sin
  conexión).
- Los botones que mueven o calientan la impresora se desactivan si no está `ready`.
- En "Acerca de": "Conexión: Tiempo real / Consulta periódica".
- Textos en español e inglés.

**Acepta:** cada escenario del simulador muestra la interfaz correcta.

### 2.10 Avisos en lugar de consultas — **medium**
- **Consola**: `notify_gcode_response` añade líneas al momento. Al abrirla se cargan las
  últimas 60 de `gcode_store`, y se deja de consultar cada 2,5 s.
- **Archivos**: `notify_filelist_changed` recarga la carpeta abierta (por ejemplo, al subir un
  archivo desde el laminador).
- **Historial**: `notify_history_changed` lo actualiza.

**Acepta:** al enviar un G-code, la respuesta aparece sin retraso, y un archivo subido desde
fuera aparece solo.

### 2.11 Cierre de la versión — **medium**
- Recorrer la lista de pruebas en el navegador con el simulador.
- Actualizar el CHANGELOG, generar el APK de prueba y hacer las pruebas en el teléfono
  (abajo).
- Con tu confirmación: `npm run release -- 0.4.0`.

### Orden y sesiones

```
2.1 ─┐
2.2 ─┼─▶ 2.4 ─▶ 2.6 ─▶ 2.7 ─▶ 2.8 ─┐
2.3 ─┘    └──▶ 2.5 ──────────┘      ├─▶ 2.11
                                 2.9 ┤
                                2.10 ┘
```

Sugerencia de sesiones, para practicar con los niveles:
- **Sesión 1 (medium)**: 2.1, 2.2, 2.3. Preparación, sin cambios visibles.
- **Sesión 2 (high)**: 2.4, 2.5, 2.6. El núcleo.
- **Sesión 3 (medium)**: 2.7, 2.8, 2.9, 2.10. Integración e interfaz.
- **Sesión 4 (medium)**: 2.11. Pruebas y APK.

## Pruebas

### Automáticas (Vitest)
`mergeStatus`, `parseStatus`, `JsonRpc` (respuestas, timeouts, cierres), el cálculo de esperas de
reconexión y las transiciones de la máquina de estados con un transporte y un reloj falsos.

### En el navegador, contra el simulador
| Escenario | Resultado esperado |
| --- | --- |
| `normal` | Datos en menos de 1 s; gráfica a 1 muestra/s; como mucho 4 renderizados/s |
| `klippy-startup` | "Iniciando…" y luego normal, sin recargar |
| `shutdown` | Pantalla de error con el mensaje; "Reiniciar firmware" la recupera |
| `drop` | Banner en ≤ 2 s; reconecta sola; los datos vuelven completos |
| `silent` | La vigilancia lo detecta en ≤ 12 s y reconecta |
| `reject-origin` | Tres intentos fallidos y luego consulta periódica, sin errores visibles |
| `slow` | La app sigue respondiendo; ninguna acción se queda colgada |
| Cambiar de impresora | Se cierra una conexión y se abre la otra; no se mezclan datos |

### En el teléfono, con la Creality Hi (tú)
1. Con la impresora en reposo, calentar la cama: la temperatura sube de forma fluida.
2. Durante una impresión: el progreso y la capa se actualizan sin saltos.
3. Apagar la impresora: aparece "Reconectando…". Encenderla: vuelve sola.
4. Activar el modo avión 30 s y desactivarlo: vuelve sola.
5. Enviar `FIRMWARE_RESTART` desde la consola: "Iniciando…" y luego normal.
6. Dejar la app en segundo plano 10 minutos y volver: datos al día en ≤ 2 s.
7. Consola: enviar `M115` y ver la respuesta al momento.
8. Las notificaciones al terminar una impresión siguen funcionando (no cambian en esta fase).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Moonraker rechaza el `Origin` del WebView | D2: transporte nativo en Android. En el navegador, respaldo por consulta periódica |
| El Moonraker de Creality es antiguo o está recortado | Paso 2.1 primero; `identify` opcional; capacidades detectadas; respaldo por consulta periódica |
| Conexiones "zombi" tras cambiar de red | Vigilancia con `proc_stat` y `server.info` |
| Errores al fusionar cambios parciales | `mergeStatus` con pruebas; `refresh()` y cada reconexión piden el estado completo |
| Demasiados renderizados | Emisión agrupada ≤ 4/s; suscripción con campos concretos |
| Moonraker pide autenticación (`force_logins`, cliente no confiable) | Fuera de alcance en esta fase. Hoy HTTP funciona sin clave, así que el teléfono ya es de confianza. Se detecta y se muestra un mensaje claro |
| El transporte nativo solo se prueba en el teléfono | Interfaz común con el del navegador; la lógica se prueba con el simulador y queda solo el envoltorio nativo |

## Fuera de alcance

- Mover las acciones de HTTP a JSON-RPC.
- WebSocket en el servicio de notificaciones (se valorará en 0.6.0).
- Usuarios y contraseñas o API keys de Moonraker.
- Conexiones simultáneas a varias impresoras (el gestor ya lo permite, pero se usará en 0.9.0).

## Qué necesito de ti para empezar

- La **IP de tu Creality Hi** (y que el Mac esté en la misma Wi-Fi) para el paso 2.1. Solo hago
  lecturas: `server/info`, `server/config`, `objects/list` y una conexión WebSocket de prueba.
