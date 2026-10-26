# Printer Hub

App Android para controlar impresoras 3D con **Klipper + Moonraker** desde la red local.
Pensada para la **Creality Hi** (con root), y compatible con K1, K2, Sovol, Voron, Elegoo
y cualquier impresora que exponga Moonraker (lo mismo que usa Mobileraker).

## Funciones

- **Inicio**: estado, progreso, capa, tiempo restante, temperaturas (toca para ajustar),
  ventilador, luz, pausar / reanudar / cancelar, home y paro de emergencia.
- **Cámara**: WebRTC de Creality (puerto 8000), cámaras configuradas en Moonraker o MJPEG
  (puerto 8080). Gira el teléfono para verla en horizontal.
- **Archivos**: G-codes de la memoria de la impresora con miniatura, tiempo y filamento;
  imprimir, eliminar y subir archivos nuevos.
- **Ajustes**: varias impresoras, prueba de conexión, modo de cámara, idioma (español /
  inglés), tema claro / oscuro / sistema y método de cálculo del tiempo restante
  (automático, laminador, impresora M73, avance del archivo o filamento).
- Diseño adaptado a tablet: barra lateral y panel en dos columnas en horizontal.

## Instalar en Android

1. Abre [Releases](https://github.com/KbzonZito/printer-hub/releases) en el teléfono.
2. Descarga `printer-hub.apk` de **Última compilación** y ábrelo (acepta "instalar apps de
   origen desconocido" la primera vez).
3. Introduce la IP de la impresora (pantalla de la impresora → Red) y el puerto `7125`.

Cada push a `main` compila un APK nuevo. Para una versión numerada: `git tag v1.0.0 && git push --tags`.

## Desarrollo

```bash
npm install
npm run dev          # interfaz en el navegador
npm run android:sync # compila y copia al proyecto Android
```

En el navegador las peticiones a la impresora pueden fallar por CORS; en el APK van por
HTTP nativo (`CapacitorHttp`) y no hay ese problema. Para probar desde el navegador añade
`cors_domains: *` en la sección `[authorization]` de `moonraker.conf`.

Stack: React + TypeScript + Vite, empaquetado con Capacitor. El APK lo compila GitHub
Actions (`.github/workflows/android.yml`), así que no hace falta Android Studio.
