# Creality Hi: qué expone Moonraker

Revisión de solo lectura hecha el 2026-10-27 contra la impresora del autor (`192.168.1.177`)
para el paso 2.1 de la [fase 2](fase-2-tiempo-real.md).

## Servidor

| Dato | Valor |
| --- | --- |
| Hostname | `Creality Hi-737B` |
| Moonraker | Versión `?` (fork de Creality), API `1.0.5` (antigua) |
| Klipper | `09faed31-dirty` (fork de Creality) |
| Interfaz web | Fluidd en el puerto 4408 |
| `cors_domains` | `*.local`, `*.lan`, `*://app.fluidd.xyz` (**sin `localhost`**) |
| `trusted_clients` | Todas las redes privadas (192.168.0.0/16, 10.0.0.0/8…) |
| `force_logins` | No |

**Componentes:** `klippy_connection`, `websockets`, `file_manager`, `proc_stats`, `job_state`,
**`job_queue`**, `webcam`, `authorization`, `history`, `octoprint_compat`, `announcements`,
`machine` y otros internos. **No tiene** `timelapse`, `spoolman` ni `power`.

**Raíces de archivos:** `config`, `logs`, `gcodes`, `config_examples`, `docs` (sin `timelapse`).

**Webcams en Moonraker:** ninguna. La cámara es el WebRTC propio de Creality (puerto 8000),
que la app ya usa.

## WebSocket

| Prueba | Resultado |
| --- | --- |
| Con `Origin: http://localhost` (lo que envía el WebView) | **403**: rechazado por `cors_domains` |
| Sin `Origin` (conexión nativa) | Conecta. `server.connection.identify` funciona, `printer.objects.subscribe` devuelve el estado y llegan unos 3 `notify_status_update` y 1 `notify_proc_stat_update` por segundo |

Esto **confirma la decisión D2**: en Android la conexión debe abrirse desde código nativo.

## Objetos de Klipper relevantes

| Objeto | Para qué sirve | Fase |
| --- | --- | --- |
| `exclude_object` | Excluir piezas durante la impresión | 0.5.0 |
| `bed_mesh` | Mapa de la cama | 0.8.0 |
| `output_pin LED` | Luz (ya detectada por la app) | — |
| `output_pin fan0`, `output_pin fanp0`, `output_pin board_fan`, `heater_fan hotend_fan` | Ventiladores. **No existe el objeto `fan`** | 2.8 |
| `fan_feedback` | RPM de 5 ventiladores (`fan0_speed`…) | — |
| `box`, `filament_rack` | Sistema multicolor CFS de Creality: estado, materiales, colores y longitud restante por bobina | Idea futura |
| `filament_switch_sensor filament_sensor` (…`_5`) | Sensores de filamento | Idea futura |
| `motion_report` | Velocidad real del cabezal | Idea futura |
| `z_tilt`, `probe`, `prtouch_v3`, `axis_twist_compensation` | Calibraciones | 0.8.0 |
| Macros `PAUSE`, `RESUME`, `CANCEL_PRINT`, `M106`, `M600`, `LOAD_MATERIAL`, `QUIT_MATERIAL`… | Creality redefine varios G-code estándar como macros | — |
| `temperature_sensor mcu_temp` | Temperatura de la placa. No hay sensor de recinto | — |

## Consecuencias para la app

1. **Error actual:** el ventilador de pieza siempre aparece al 0 % en la Creality Hi, porque la app
   lee el objeto `fan`, que esta impresora no tiene. El ventilador de pieza es
   `output_pin fan0` (valor de 0 a 1). Se corrige en el paso 2.8, detectando el objeto del
   ventilador igual que la luz.
2. La pestaña **Timelapse** debe ocultarse en esta impresora (no hay componente `timelapse`):
   paso 2.8.
3. La **cola de impresión** (0.5.0) es posible: `job_queue` está activo.
4. **Excluir objetos** (0.5.0) y el **mapa de la cama** (0.8.0) son posibles.
5. **Spoolman** y los **enchufes inteligentes** no están disponibles de serie. En la fase 0.7.0
   tendría más sentido mostrar el **CFS** (objeto `box`): materiales, colores y filamento restante.
6. El Moonraker es antiguo (API 1.0.5): conviene no depender de métodos JSON-RPC recientes y
   tratar cualquier error de `identify` como no grave, como ya prevé el plan.

## Descarga de archivos (2026-10-29)

Medido desde el Mac por Wi-Fi, en modo solo lectura, para la
[vista previa del G-code](vista-previa-gcode.md):

| Dato | Valor |
| --- | --- |
| Velocidad | 0,3–0,9 MB/s (23 MB en 26 s) |
| Descargas en paralelo | No mejoran (1,0 MB/s en total) |
| gzip | No |
| Rangos (`Range`) | Sí (206) |
| Recursos de la impresora | 2 núcleos, ~500 MB de RAM, CPU al ~35 % en reposo |
| Laminador de los archivos | Creality Print V5.1 / V6.0 (formato de OrcaSlicer, con muchos arcos `G2`/`G3`) |
