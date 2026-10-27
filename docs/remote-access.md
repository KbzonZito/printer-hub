# Access your printer from outside home

Printer Hub talks to the printer directly on your local network. It doesn't use any cloud
service, so when you leave home the printer can't be reached. The safest way to change that is a
private VPN such as [Tailscale](https://tailscale.com) (free for personal use). Don't open
Moonraker's port on your router: anyone on the internet could control the printer.

## Option 1: a subnet router at home (recommended)

You don't need to install anything on the printer, and the app keeps using the same IP.

1. On a device that is always on at home (a Raspberry Pi, a NAS, a PC…), install Tailscale and
   share your home network with it as a
   [subnet router](https://tailscale.com/kb/1019/subnets), for example:

   ```
   sudo tailscale up --advertise-routes=192.168.1.0/24
   ```

   Use your own network: if the printer is `192.168.1.177`, the network is `192.168.1.0/24`.
2. In the Tailscale admin console, approve the route for that device.
3. Install Tailscale on your phone and sign in with the same account.

When the VPN is on, Printer Hub reaches the printer with its usual IP, at home or away.

## Option 2: Tailscale on the printer

If the printer runs a full Linux (Raspberry Pi with Klipper, Sovol, some rooted Creality
printers), you can install Tailscale on it and add a second printer in the app with its
Tailscale address (`100.x.y.z`). On the Creality Hi this needs root and isn't officially
supported.

## What works remotely

- Status, temperatures, controls, files, history and notifications: yes.
- Camera: MJPEG cameras work. Creality's WebRTC camera (port 8000) may not connect over a VPN,
  because it negotiates with local addresses; if it fails, try the MJPEG or Snapshot mode in
  the Camera tab.
- Network discovery only searches your current Wi-Fi, so add the printer by IP.

---

# Acceso desde fuera de casa

Printer Hub habla con la impresora directamente en tu red local, sin servicios en la nube, así
que fuera de casa no la alcanza. La forma más segura de cambiarlo es una VPN privada como
[Tailscale](https://tailscale.com) (gratis para uso personal). No abras el puerto de Moonraker
en el router: cualquiera en internet podría controlar la impresora.

## Opción 1: un "subnet router" en casa (recomendada)

No hace falta instalar nada en la impresora y la app sigue usando la misma IP.

1. En un aparato que esté siempre encendido en casa (Raspberry Pi, NAS, PC…), instala Tailscale
   y comparte tu red como [subnet router](https://tailscale.com/kb/1019/subnets), por ejemplo:

   ```
   sudo tailscale up --advertise-routes=192.168.1.0/24
   ```

   Usa tu red: si la impresora es `192.168.1.177`, la red es `192.168.1.0/24`.
2. En la consola de Tailscale, aprueba la ruta de ese aparato.
3. Instala Tailscale en el teléfono e inicia sesión con la misma cuenta.

Con la VPN activada, Printer Hub llega a la impresora con su IP de siempre, estés donde estés.

## Opción 2: Tailscale en la impresora

Si la impresora tiene un Linux completo (Raspberry Pi con Klipper, Sovol, algunas Creality con
root), puedes instalar Tailscale en ella y añadir en la app otra impresora con su dirección de
Tailscale (`100.x.y.z`). En la Creality Hi necesita root y no está soportado oficialmente.

## Qué funciona a distancia

- Estado, temperaturas, controles, archivos, historial y notificaciones: sí.
- Cámara: las MJPEG funcionan. La cámara WebRTC de Creality (puerto 8000) puede no conectar a
  través de la VPN porque negocia con direcciones locales; si falla, prueba el modo MJPEG o
  Snapshot en la pestaña Cámara.
- La búsqueda de impresoras solo mira tu Wi-Fi actual, así que añádela por IP.
