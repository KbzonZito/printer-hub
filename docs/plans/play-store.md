# Publicar en Google Play

Plan para dejar Printer Hub listo para Google Play antes de crear la cuenta de desarrollador,
con las opciones para cobrar (freemium, pago único o suscripción). Cada paso indica el nivel
recomendado para implementarlo. Los requisitos de Google cambian seguido: revisar las fechas en
la ayuda de Play Console antes de cada fase (esto se escribió el 2026-11-04).

## Resumen

| Fase | Qué                                      | Necesita la cuenta | Duración aprox.                       |
| ---- | ---------------------------------------- | ------------------ | ------------------------------------- |
| A    | Cambios en la app y material de la ficha | No                 | 2–3 semanas de trabajo                |
| B    | Crear y verificar la cuenta              | Sí                 | unos días (verificación de identidad) |
| C    | Prueba interna y prueba cerrada          | Sí                 | 14 días como mínimo                   |
| D    | Producción y lanzamiento                 | Sí                 | hasta ~7 días de revisión             |

La fase A se puede hacer completa ahora. Lo que más tarda después es la prueba cerrada
obligatoria, así que conviene **reunir los testers antes de crear la cuenta**.

## Situación actual

| Pieza                    | Hoy                                                       | Para Play                                                                                          |
| ------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Formato                  | APK firmado en GitHub Actions                             | Play exige **AAB** (Android App Bundle)                                                            |
| Target API               | 36 (Android 16)                                           | Es lo que exige Play desde el 31-08-2026: cumple                                                   |
| Servicio en primer plano | `specialUse` (vigilar la impresión)                       | Requiere declaración en Play Console con justificación y video                                     |
| Tráfico HTTP sin cifrar  | `usesCleartextTraffic="true"` (Moonraker en la red local) | Permitido; explicarlo si lo preguntan                                                              |
| Donaciones               | Botón de Ko-fi en Acerca de                               | **No permitido** fuera de EE. UU.: hay que quitarlo en la versión de Play                          |
| Probar sin impresora     | Imposible: la app necesita Moonraker                      | El revisor de Google y el informe previo al lanzamiento no tienen impresora: **riesgo de rechazo** |
| Datos personales         | Ninguno sale del teléfono                                 | Formulario de Seguridad de los datos: "no recopila ni comparte"                                    |
| Política de privacidad   | Una sección del README                                    | Play pide una URL pública propia                                                                   |

## Modelos de cobro

**Decisión (2026-11-04):** versión de GitHub gratis y completa con propinas por Ko-fi;
Google Play con **freemium y Pro de pago único** (opción 2). El modo de prueba (paso 2) se
adelantó y ya está en la versión de GitHub.

La app es MIT: cualquiera puede compilarla con todo desbloqueado. No es un problema real (casi
nadie que instala desde Play compila apps), pero condiciona qué modelo es honesto y cuál
molesta a la comunidad de Klipper, que está acostumbrada a herramientas gratis (Mainsail,
Fluidd) y a apps con modelo "supporter".

### Opción 0: gratis con propinas

Gratis y completa en Play, con compras de "café" dentro de la app (Play Billing) en lugar de
Ko-fi.

- A favor: la más simple después de la opción 1, sin enojar a nadie, máxima cantidad de
  descargas.
- En contra: los ingresos dependen de la buena voluntad (normalmente menos del 1 % de usuarios).

### Opción 1: app de pago en Play, gratis en GitHub

Precio fijo (por ejemplo US$ 3,99) en Play; el APK de GitHub sigue gratis y completo.

- A favor: **no hay que programar compras**. Modelo común y bien visto en apps libres ("pagas
  por la comodidad de Play y por apoyar el proyecto").
- En contra: muchas menos descargas (la gente no paga sin probar), sin reseñas al principio, y
  los testers de la prueba cerrada tendrían que comprarla salvo que los agregues como
  "testers de licencia".

### Opción 2: freemium con Pro de pago único (recomendada)

Gratis en Play con lo esencial; **Printer Hub Pro** se desbloquea con una sola compra
(por ejemplo US$ 4,99, con precios locales que Play ajusta por país). Se suman propinas
opcionales.

- A favor: la gente prueba gratis, y quien la usa todos los días paga una vez. Encaja con una
  app sin servidor: no hay costo mensual que justifique una suscripción.
- En contra: hay que programar compras, el muro de pago y los bloqueos (fase A, pasos 6 a 8).

### Opción 3: freemium con suscripción

Pro por suscripción (por ejemplo US$ 1,49/mes o US$ 9,99/año), opcionalmente también con una
compra "de por vida".

- A favor: ingresos recurrentes; Play cobra solo 15 % en suscripciones desde el primer día.
- En contra: **difícil de justificar** en una app que funciona solo en tu red y no tiene
  servidor. Tiene sentido solo si más adelante se agrega algo con costo mensual, como
  notificaciones push por internet sin VPN o acceso remoto a través de un relé propio.
  Sin eso, en esta comunidad suele traer malas reseñas.

### Qué sería gratis y qué Pro (opciones 2 y 3)

Regla: **nunca bloquear la seguridad** (parada de emergencia, pausar, cancelar) ni lo básico
para imprimir. Pro es comodidad y extras.

| Gratis                                           | Pro                                                                       |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| Una impresora                                    | Varias impresoras y la vista de todas                                     |
| Estado, temperaturas, ventiladores, luz, cámara  | Cámara a pantalla completa con capturas                                   |
| Pausar, reanudar, cancelar, parada de emergencia | —                                                                         |
| Control: ejes, macros, consola                   | Editor de configuración                                                   |
| Archivos: navegar, subir, imprimir, detalles     | Vista previa del G-code y vista en vivo de la capa                        |
| Notificación al terminar, pausar o fallar        | Foto en la notificación, aviso de primera capa, progreso en vivo          |
| Historial                                        | Estadísticas, costo por impresión, timelapses                             |
| —                                                | Widget y mosaico de ajustes rápidos                                       |
| —                                                | Spoolman, enchufes inteligentes con apagado automático, cola de impresión |
| Calibraciones guiadas                            | —                                                                         |
| Tema claro u oscuro                              | Colores Material You y estilos de paleta                                  |

Es una propuesta: se decide antes de implementar el paso 8. Una prueba de Pro gratis por
7 días (contada en el teléfono) ayuda a que la gente descubra lo que paga.

### Qué hacer con la versión de GitHub

Recomendación: **seguir gratis y completa** (sin bloqueos ni compras), con Ko-fi. Se compila
como un "sabor" distinto del de Play desde el mismo código (paso 1). Así se respeta a quien ya
la usa y Obtainium sigue funcionando.

### Comisiones de Google

- Compras únicas y propinas: 15 % del primer millón de dólares al año (hay que inscribirse en
  el programa de 15 % desde Play Console; si no, es 30 %).
- Suscripciones: 15 %.
- Impuestos: Play retiene o cobra IVA en muchos países; tú declaras tus ingresos según tu país.

## Fase A: preparación (sin cuenta)

### 1. Dos sabores de la app: GitHub y Play (medium)

- Gradle: `productFlavors { github {} play {} }` con el **mismo paquete**
  (`com.kbzonzito.printerhub`), para que se pueda pasar de una a otra.
- Vite: `--mode play` define `VITE_STORE=play`; un módulo `src/store-flavor.ts` expone
  `isPlay`.
- GitHub: Ko-fi y todo desbloqueado. Play: sin Ko-fi, con compras (pasos 6 a 8).
- CI: `assembleGithubRelease` para la release de GitHub como hoy, y `bundlePlayRelease` para
  el AAB de Play, subido como artefacto de la ejecución.
- `npm run apk` sigue construyendo el sabor de GitHub; `npm run apk -- --play` para probar el
  de Play.

### 2. Modo demo (high) — hecho en la versión 1.1.0

Imprescindible: el revisor de Google y el informe previo al lanzamiento abren la app sin
impresora. Si solo ven "No se pudo conectar", la pueden rechazar por funcionalidad rota.

- En el asistente inicial: **"Probar sin impresora"**. Agrega una impresora "Demo" que vive
  dentro de la app.
- Implementación: un transporte falso que responde como Moonraker (JSON-RPC y HTTP) desde
  JavaScript, reutilizando la lógica del simulador (`scripts/mock-moonraker.mjs`): una
  impresión en curso que avanza, temperaturas, archivos con miniaturas y un G-code real
  pequeño para la vista previa.
- Sirve también para sacar las capturas de la ficha y para que un usuario pruebe la app antes
  de conectar la suya.
- En "Acceso a la app" de Play Console: "La app controla impresoras Klipper en la red local.
  Para probarla sin impresora, toque _Probar sin impresora_ en la primera pantalla".

### 3. Política de privacidad pública (low)

- `docs/privacy.md` en español e inglés: qué datos maneja (ninguno sale del teléfono), qué
  hace Google Play con las compras, contacto.
- URL pública: activar GitHub Pages en el repo o usar la página del archivo en GitHub.
- Correo de contacto público para la ficha (puede ser uno nuevo solo para la app).

### 4. Material de la ficha (low a medium; las capturas son tuyas)

| Elemento             | Requisito                    | Nota                                                                                    |
| -------------------- | ---------------------------- | --------------------------------------------------------------------------------------- |
| Nombre               | hasta 30 caracteres          | "Printer Hub for Klipper" o similar; revisar que no exista otra app con el mismo nombre |
| Descripción corta    | hasta 80 caracteres          | en inglés y español                                                                     |
| Descripción completa | hasta 4000 caracteres        | sacada de las funciones del README; terminar con "No afiliada a Creality ni a Klipper"  |
| Icono                | 512 × 512 PNG                | se genera del icono actual                                                              |
| Gráfico de funciones | 1024 × 500                   | se diseña aparte                                                                        |
| Capturas de teléfono | entre 2 y 8                  | las mismas del README; mejor con el modo demo                                           |
| Capturas de tablet   | 7" y 10"                     | opcionales, pero sin ellas la app aparece menos en tablets                              |
| Video                | YouTube, opcional            | sirve también para la declaración del servicio en primer plano                          |
| Categoría            | Herramientas o Productividad |                                                                                         |

No usar logos de Creality, Klipper ni de otras marcas en el icono o las capturas.

### 5. Formularios de Play Console preparados (low)

Escribir las respuestas en este documento para copiarlas el día que exista la cuenta:

- **Seguridad de los datos:** no recopila ni comparte datos (las compras las procesa Google).
- **Clasificación de contenido (IARC):** utilidad, sin violencia ni contenido de usuarios:
  apta para todo público.
- **Público objetivo:** mayores de 13 o de 18 años (no marcar niños: activa la política de
  Familias).
- **Anuncios:** no tiene.
- **Servicio en primer plano `specialUse`:** texto que explique que vigila una impresión de
  varias horas para avisar si falla, y un video corto mostrando la notificación.
- **Permisos:** notificaciones (avisos de impresión), notificaciones promovidas (progreso en
  vivo en Android 16).

### 6. Compras con Play Billing (high)

- Plugin nativo propio en Java con **Play Billing Library 8 o posterior** (la 8 es el mínimo
  exigido desde el 31-08-2026). Se descartan RevenueCat y servicios similares: agregan un SDK
  de terceros que recopila datos, lo que obliga a cambiar el formulario de privacidad.
- Productos: `pro_lifetime` (único, no consumible) y propinas `tip_small`, `tip_medium`,
  `tip_large` (consumibles). Con la opción 3: `pro_monthly` y `pro_yearly`.
- Confirmar (acknowledge) cada compra: si no se confirma en 3 días, Google la reembolsa.
- Restaurar: consultar las compras al abrir la app y con un botón "Restaurar compras".
- Guardar el estado de Pro en el teléfono para que funcione sin internet.
- Sin servidor propio: la verificación se hace en el teléfono. Es suficiente para una app de
  este tamaño.

### 7. Muro de pago (medium)

- Hoja "Printer Hub Pro" con la lista de lo que incluye, el precio que entrega Play (ya en la
  moneda del usuario) y "Restaurar compras".
- Se abre desde Ajustes y al tocar algo bloqueado; nunca como ventana al iniciar la app.
- Las propinas reemplazan a Ko-fi en Acerca de.

### 8. Bloqueos de funciones (medium)

- Hook `usePro()` y un componente `<ProGate>` que muestra un candado y abre el muro de pago.
- Aplicarlo según la tabla acordada. En el sabor de GitHub, `usePro()` siempre es verdadero.
- Qué pasa si alguien tiene varias impresoras y no compra: siguen guardadas, pero solo se usa
  una.
- Pruebas: Vitest para la lógica de bloqueo y e2e de "gratis contra Pro".

### 9. Detalles extra (low, opcionales)

- Pedir una reseña dentro de la app (In-App Review API) después de varias impresiones
  terminadas, sin insistir.
- Insignia "Disponible en Google Play" en el README cuando esté publicada.

### 10. Testers para la prueba cerrada (tú)

Las cuentas personales nuevas necesitan **12 testers activos durante 14 días seguidos** antes
de publicar en producción, y se cumple por cada app nueva.

- Juntar al menos 15 cuentas de Gmail (por si alguien se retira): amigos, familia, un post en
  r/klippers o r/Creality, grupos de Discord de Creality Hi o K1.
- Lo ideal es que la usen de verdad: Google revisa que la prueba haya sido real.
- Alternativa: una cuenta de **organización** está exenta de esta regla, pero necesita un
  número D-U-N-S de una empresa registrada (es gratis y tarda semanas).

## Fase B: cuenta de desarrollador

1. Crear la cuenta en **https://play.google.com/console/signup**: pago único de US$ 25 con
   tarjeta.
2. Elegir tipo: **personal** (lo normal para ti) u organización.
3. Verificación de identidad con documento, y verificación del teléfono y del correo. Google
   también pide confirmar el acceso a un dispositivo Android real desde la app Play Console.
4. Datos públicos de desarrollador: nombre, correo de contacto y sitio web (puede ser el repo).
5. Si vas a cobrar: crear el **perfil de pagos** (cuenta de comerciante) con datos fiscales y
   cuenta bancaria. Revisar que tu país esté en la lista de países con comerciantes de Play.
   Si vendes, Google puede mostrar tu dirección en la ficha: considera una dirección
   comercial.
6. **Firma de la app (decisión importante):** en Play App Signing, subir la **clave actual**
   (`~/.config/printer-hub/release.p12`) en lugar de dejar que Google cree una nueva. Así la
   versión de GitHub y la de Play tienen la misma firma y la gente puede pasar de una a otra
   sin desinstalar. Si Google crea la clave, las dos versiones quedan incompatibles.
7. **Verificación de desarrollador:** registrar el paquete `com.kbzonzito.printerhub` y la
   clave de firma. Afecta también al APK de GitHub: desde el 30-09-2026 los teléfonos
   certificados en Brasil, Indonesia, Singapur y Tailandia solo instalan apps de
   desarrolladores verificados, y Google planea extenderlo a todo el mundo en 2027. Con la
   cuenta de Play se hace desde Play Console.
8. Inscribirse en el programa de comisión del 15 %.

## Fase C: pruebas

1. **Prueba interna:** subir el AAB y probar el sabor de Play en tu teléfono con cuentas de
   prueba de licencia (compras sin cobro real). Revisar el informe previo al lanzamiento:
   Google abre la app en dispositivos reales; con el modo demo debería navegarla sin errores.
2. **Prueba cerrada:** invitar a los testers (lista de correos o un grupo de Google) y mantener
   la pista activa **14 días seguidos**. Pausarla reinicia la cuenta.
3. Corregir lo que reporten y subir versiones nuevas a la misma pista sin detenerla.
4. Al terminar, pedir acceso a producción: Google hace preguntas sobre la prueba (cuántos la
   usaron, qué cambió).

## Fase D: lanzamiento

1. Configurar países, precios de Pro (Play sugiere precios locales) y la ficha en inglés y
   español.
2. Publicar en producción con **lanzamiento gradual** (20 % → 50 % → 100 %) por si aparece un
   error.
3. Revisión de Google: normalmente horas o pocos días; la primera puede tardar hasta ~7 días.
4. Seguir los fallos y ANR en **Android vitals** (gratis, sin agregar ningún SDK) y responder
   las reseñas.
5. Opcional: subir a Play automáticamente desde GitHub Actions al publicar una versión, con una
   cuenta de servicio de Google guardada como secreto del repo (eso lo configuras tú).
6. Actualizar el README: insignia de Play, Obtainium para quien prefiera GitHub.

## Lista de cosas que faltan y quién las hace

| Pendiente                                                         | Quién                              |
| ----------------------------------------------------------------- | ---------------------------------- |
| Sabores GitHub y Play, AAB en CI                                  | Claude                             |
| Modo demo                                                         | Claude                             |
| Plugin de compras, muro de pago y bloqueos (si se elige freemium) | Claude                             |
| Política de privacidad y textos de la ficha (inglés y español)    | Claude escribe, tú revisas         |
| Icono 512 y gráfico de funciones                                  | Claude genera, tú apruebas         |
| Capturas de teléfono y tablet                                     | Tú (con el modo demo es más fácil) |
| Decidir modelo de cobro, precio y qué es Pro                      | Tú                                 |
| Correo de contacto público                                        | Tú                                 |
| Juntar 12–15 testers                                              | Tú                                 |
| Respaldo de la clave de firma fuera del Mac                       | Tú, **antes de subirla a Google**  |
| Crear la cuenta, verificar identidad, perfil de pagos             | Tú                                 |
| Video para la declaración del servicio en primer plano            | Tú (o Claude con el emulador)      |

## Orden recomendado

1. Decidir el modelo de cobro y la tabla Gratis/Pro.
2. Pasos 1 (sabores) y 2 (modo demo): sirven para cualquier modelo.
3. Pasos 3, 4 y 5 (privacidad, ficha, formularios) mientras juntas testers.
4. Pasos 6 a 8 si se elige freemium.
5. Crear la cuenta (fase B) cuando todo lo anterior esté listo y probado en tu teléfono.
6. Fases C y D.
