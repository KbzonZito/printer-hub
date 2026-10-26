import { useCallback } from 'react';
import { getSettings, useSettings, type Lang } from './store';

const es = {
  'tab.home': 'Inicio',
  'tab.camera': 'Cámara',
  'tab.files': 'Archivos',
  'tab.settings': 'Ajustes',

  'state.standby': 'En espera',
  'state.printing': 'Imprimiendo',
  'state.paused': 'En pausa',
  'state.complete': 'Completado',
  'state.cancelled': 'Cancelado',
  'state.error': 'Error',

  'common.back': 'Volver',
  'common.retry': 'Reintentar',
  'common.cancel': 'Cancelar',
  'common.save': 'Guardar',
  'common.delete': 'Eliminar',
  'common.apply': 'Aplicar',
  'common.saved': 'Guardado',
  'common.disconnected': 'Desconectada',

  'err.timeout': 'Tiempo de espera agotado',
  'err.unreachable': 'No se pudo conectar con la impresora',

  'onboarding.text':
    'Conecta tu Creality Hi (o cualquier impresora con Klipper + Moonraker) introduciendo su IP local. La encuentras en la pantalla de la impresora, en Ajustes → Red.',

  'home.offline': 'Sin conexión',
  'home.offlineHint': '{error}. Revisa la IP {host} y que el puerto {port} (Moonraker) esté accesible.',
  'home.connecting': 'Conectando con {name}…',
  'home.unstable': 'Conexión inestable: {error}',
  'home.firmwareRestart': 'Reiniciar firmware',
  'home.noJob': 'Sin trabajo',
  'home.layer': 'Capa {current} / {total}',
  'home.elapsed': 'Transcurrido',
  'home.remaining': 'Restante',
  'home.finish': 'Fin',
  'home.filament': 'Filamento',
  'home.slicerTotal': 'Estimado por el laminador: {time}',
  'home.etaVia': 'Cálculo: {method}',
  'home.pause': 'Pausar',
  'home.pausing': 'Pausando…',
  'home.resume': 'Reanudar',
  'home.resuming': 'Reanudando…',
  'home.cancel': 'Cancelar',
  'home.nozzle': 'Boquilla',
  'home.bed': 'Cama',
  'home.chamber': 'Recinto',
  'home.fan': 'Ventilador',
  'home.off': 'Apagado',
  'home.light': 'Luz',
  'home.home': 'Home',
  'home.homing': 'Haciendo home…',
  'home.estop': 'Paro de emergencia',
  'home.nozzleTemp': 'Temperatura de boquilla',
  'home.bedTemp': 'Temperatura de cama',
  'home.turnOff': 'Apagar',
  'home.customTemp': 'Personalizada °C',
  'home.cancelTitle': '¿Cancelar impresión?',
  'home.cancelMsg': 'El trabajo actual se detendrá y no se puede reanudar.',
  'home.cancelConfirm': 'Cancelar impresión',
  'home.canceling': 'Cancelando…',
  'home.estopTitle': '¿Paro de emergencia?',
  'home.estopMsg': 'Detiene Klipper de inmediato. Tendrás que reiniciar el firmware después.',
  'home.estopConfirm': 'Detener ahora',
  'home.estopSent': 'Paro de emergencia enviado',

  'camera.connecting': 'Conectando cámara…',
  'camera.unavailable': 'Cámara no disponible',
  'camera.reconnect': 'Reconectar',
  'camera.hint':
    'Gira el dispositivo para verla en horizontal. "Auto" prueba WebRTC de Creality (puerto 8000), las cámaras de Moonraker y MJPEG en el puerto 8080.',

  'files.search': 'Buscar archivos',
  'files.reload': 'Recargar',
  'files.upload': 'Subir G-code',
  'files.uploaded': '{name} subido',
  'files.none': 'No hay archivos en la impresora',
  'files.noResults': 'Sin resultados',
  'files.time': 'Tiempo',
  'files.layer': 'Capa',
  'files.print': 'Imprimir',
  'files.busy': 'Impresora ocupada',
  'files.started': 'Impresión iniciada',
  'files.deleteTitle': '¿Eliminar archivo?',
  'files.deleted': 'Archivo eliminado',

  'settings.printers': 'Impresoras',
  'settings.add': 'Añadir impresora',
  'settings.edit': 'Editar',
  'settings.printer': 'Impresora',
  'settings.deleteTitle': '¿Eliminar {name}?',
  'settings.app': 'Aplicación',
  'settings.language': 'Idioma',
  'settings.theme': 'Tema',
  'settings.themeSystem': 'Sistema',
  'settings.themeLight': 'Claro',
  'settings.themeDark': 'Oscuro',
  'settings.eta': 'Cálculo del tiempo restante',
  'settings.etaHint':
    'Auto combina el avance del archivo y del filamento (como Mainsail) y usa la estimación del laminador al inicio.',
  'settings.about': 'Acerca de',
  'settings.aboutText':
    'Printer Hub se conecta a impresoras con Klipper a través de Moonraker (Creality Hi, K1, K2, Sovol, Voron, Elegoo…). Necesitas estar en la misma red Wi-Fi que la impresora.',

  'eta.auto': 'Automático',
  'eta.slicer': 'Laminador',
  'eta.printer': 'Impresora (M73)',
  'eta.file': 'Avance del archivo',
  'eta.filament': 'Filamento usado',

  'form.name': 'Nombre',
  'form.host': 'IP de la impresora',
  'form.port': 'Puerto',
  'form.camera': 'Cámara',
  'form.cameraUrl': 'URL de cámara (opcional)',
  'form.test': 'Probar conexión',
  'form.cam.auto': 'Automático',
  'form.cam.webrtc': 'WebRTC (Creality)',
  'form.cam.mjpeg': 'MJPEG stream',
  'form.cam.snapshot': 'Snapshot',
};

export type MessageKey = keyof typeof es;

const en: Record<MessageKey, string> = {
  'tab.home': 'Home',
  'tab.camera': 'Camera',
  'tab.files': 'Files',
  'tab.settings': 'Settings',

  'state.standby': 'Standby',
  'state.printing': 'Printing',
  'state.paused': 'Paused',
  'state.complete': 'Complete',
  'state.cancelled': 'Cancelled',
  'state.error': 'Error',

  'common.back': 'Back',
  'common.retry': 'Retry',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.apply': 'Apply',
  'common.saved': 'Saved',
  'common.disconnected': 'Disconnected',

  'err.timeout': 'Request timed out',
  'err.unreachable': 'Could not reach the printer',

  'onboarding.text':
    'Connect your Creality Hi (or any Klipper + Moonraker printer) by entering its local IP. You can find it on the printer screen under Settings → Network.',

  'home.offline': 'Offline',
  'home.offlineHint': '{error}. Check the IP {host} and that port {port} (Moonraker) is reachable.',
  'home.connecting': 'Connecting to {name}…',
  'home.unstable': 'Unstable connection: {error}',
  'home.firmwareRestart': 'Firmware restart',
  'home.noJob': 'No job',
  'home.layer': 'Layer {current} / {total}',
  'home.elapsed': 'Elapsed',
  'home.remaining': 'Remaining',
  'home.finish': 'Finish',
  'home.filament': 'Filament',
  'home.slicerTotal': 'Slicer estimate: {time}',
  'home.etaVia': 'Method: {method}',
  'home.pause': 'Pause',
  'home.pausing': 'Pausing…',
  'home.resume': 'Resume',
  'home.resuming': 'Resuming…',
  'home.cancel': 'Cancel',
  'home.nozzle': 'Nozzle',
  'home.bed': 'Bed',
  'home.chamber': 'Chamber',
  'home.fan': 'Fan',
  'home.off': 'Off',
  'home.light': 'Light',
  'home.home': 'Home',
  'home.homing': 'Homing…',
  'home.estop': 'Emergency stop',
  'home.nozzleTemp': 'Nozzle temperature',
  'home.bedTemp': 'Bed temperature',
  'home.turnOff': 'Off',
  'home.customTemp': 'Custom °C',
  'home.cancelTitle': 'Cancel print?',
  'home.cancelMsg': 'The current job will stop and cannot be resumed.',
  'home.cancelConfirm': 'Cancel print',
  'home.canceling': 'Cancelling…',
  'home.estopTitle': 'Emergency stop?',
  'home.estopMsg': 'Halts Klipper immediately. You will need a firmware restart afterwards.',
  'home.estopConfirm': 'Stop now',
  'home.estopSent': 'Emergency stop sent',

  'camera.connecting': 'Connecting camera…',
  'camera.unavailable': 'Camera unavailable',
  'camera.reconnect': 'Reconnect',
  'camera.hint':
    'Rotate the device for landscape. "Auto" tries Creality WebRTC (port 8000), Moonraker webcams and MJPEG on port 8080.',

  'files.search': 'Search files',
  'files.reload': 'Reload',
  'files.upload': 'Upload G-code',
  'files.uploaded': '{name} uploaded',
  'files.none': 'No files on the printer',
  'files.noResults': 'No results',
  'files.time': 'Time',
  'files.layer': 'Layer',
  'files.print': 'Print',
  'files.busy': 'Printer busy',
  'files.started': 'Print started',
  'files.deleteTitle': 'Delete file?',
  'files.deleted': 'File deleted',

  'settings.printers': 'Printers',
  'settings.add': 'Add printer',
  'settings.edit': 'Edit',
  'settings.printer': 'Printer',
  'settings.deleteTitle': 'Delete {name}?',
  'settings.app': 'App',
  'settings.language': 'Language',
  'settings.theme': 'Theme',
  'settings.themeSystem': 'System',
  'settings.themeLight': 'Light',
  'settings.themeDark': 'Dark',
  'settings.eta': 'Remaining time estimate',
  'settings.etaHint':
    'Auto blends file and filament progress (like Mainsail) and uses the slicer estimate at the start.',
  'settings.about': 'About',
  'settings.aboutText':
    'Printer Hub connects to Klipper printers through Moonraker (Creality Hi, K1, K2, Sovol, Voron, Elegoo…). Your device must be on the same Wi-Fi network as the printer.',

  'eta.auto': 'Automatic',
  'eta.slicer': 'Slicer',
  'eta.printer': 'Printer (M73)',
  'eta.file': 'File progress',
  'eta.filament': 'Filament used',

  'form.name': 'Name',
  'form.host': 'Printer IP',
  'form.port': 'Port',
  'form.camera': 'Camera',
  'form.cameraUrl': 'Camera URL (optional)',
  'form.test': 'Test connection',
  'form.cam.auto': 'Automatic',
  'form.cam.webrtc': 'WebRTC (Creality)',
  'form.cam.mjpeg': 'MJPEG stream',
  'form.cam.snapshot': 'Snapshot',
};

const messages: Record<Lang, Record<MessageKey, string>> = { es, en };

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

function format(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  const text = messages[lang][key] ?? es[key];
  return vars ? text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')) : text;
}

/** For code outside React; reads the language at call time. */
export const tr: Translate = (key, vars) => format(getSettings().lang, key, vars);

export function useT(): Translate {
  const { lang } = useSettings().settings;
  return useCallback((key, vars) => format(lang, key, vars), [lang]);
}

export function useLang(): Lang {
  return useSettings().settings.lang;
}
