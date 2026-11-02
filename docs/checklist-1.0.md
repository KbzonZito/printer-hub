# Lista de comprobación de la 1.0

La versión 1.0 se publica cuando todo esto está comprobado **en el teléfono** (las pruebas
automáticas y el simulador no cubren el hardware real). Marca cada punto al probarlo.

## Instalación

- [ ] Instalación limpia desde el APK de la release (sin la app instalada antes): bienvenida,
      idioma, apariencia, notificaciones y añadir la impresora.
- [ ] Actualización encima de la versión anterior: se conservan impresoras, ajustes y vistas
      previas guardadas.
- [ ] Copia de la clave de firma (`~/.config/printer-hub/release.p12` y `signing.env`) guardada
      fuera del Mac. Sin ella, ninguna versión futura se podrá instalar como actualización.

## Dispositivos y apariencia

- [ ] Teléfono y, si es posible, tablet (la barra lateral en pantallas anchas).
- [ ] Android 10 a 16 (o los que tengas a mano; las funciones de Android 16 se degradan solas).
- [ ] Tema claro, oscuro y del sistema; color del dispositivo y al menos dos colores fijos.
- [ ] Español e inglés.
- [ ] Tamaño de letra del sistema grande (hasta 130 %): nada se corta.

## Impresora (Creality Hi y, si es posible, otra con Klipper)

- [ ] Inicio: temperaturas, ventilador, luz, pausa / reanudar / cancelar, paro de emergencia.
- [ ] Imprimir un archivo; ver el progreso, la capa y el tiempo restante.
- [ ] Notificaciones con la app cerrada: progreso, terminado (con foto o miniatura), primera capa.
- [ ] Widget y ajuste rápido.
- [ ] Cámara a pantalla completa con zoom y captura.
- [ ] Archivos: carpetas, mover, renombrar, subir, cola, miniaturas y detalles.
- [ ] Vista previa del G-code de un archivo grande, y "Ver capa actual" durante una impresión.
- [ ] Excluir un objeto en una placa con varias piezas.
- [ ] Control: mover ejes, extruir, macros, consola, malla de la cama.
- [ ] Apagar la impresora y volver a encenderla: "Reconectando…" y vuelve sola.

## Desde la 0.9 (R8 reduce el código de Android)

R8 puede romper en el APK cosas que en el navegador funcionan. Comprobar especialmente:

- [ ] La app abre y conecta (WebSocket nativo).
- [ ] Permiso de notificaciones, notificación de progreso y aviso al terminar.
- [ ] Compartir un G-code a la app, compartir una captura de la cámara y exportar la copia de
      seguridad (Guardar en…).
- [ ] Vibración al pausar, barra de estado al abrir la cámara, gesto atrás.
- [ ] Widget y ajuste rápido.

## Publicación

- [ ] `npm run check` sin errores.
- [ ] CHANGELOG con la sección de la 1.0.
- [ ] README con capturas y licencia.
- [ ] `npm run release -- 1.0.0` y comprobar el APK de la release (versión 1.0.0, firma correcta).
