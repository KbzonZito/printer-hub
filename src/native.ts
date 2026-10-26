import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

// Native Android pieces (android/app/src/main/java/.../PrinterMonitorPlugin.java).

export interface SharedFile {
  name?: string;
  path?: string;
  size?: number;
}

interface PrinterMonitorPlugin {
  configure(opts: { host?: string; port?: number; name?: string; lang?: string }): Promise<void>;
  startMonitor(): Promise<void>;
  stopMonitor(): Promise<void>;
  requestNotifications(): Promise<{ granted: boolean }>;
  updateWidget(opts: {
    state: string;
    klippy: string;
    filename: string;
    progress: number;
    printDuration: number;
  }): Promise<void>;
  getLocalIp(): Promise<{ ip?: string }>;
  getSystemColor(): Promise<{ color?: string }>;
  openUrl(opts: { url: string }): Promise<void>;
  shareText(opts: { text: string }): Promise<void>;
  takeSharedFile(): Promise<SharedFile>;
  addListener(event: 'sharedFile', fn: (file: SharedFile) => void): Promise<PluginListenerHandle>;
}

export const isNative = Capacitor.isNativePlatform();

export const PrinterMonitor = registerPlugin<PrinterMonitorPlugin>('PrinterMonitor');

/** Reads a shared file copied to the app cache into a File for upload. */
export async function readSharedFile(file: SharedFile): Promise<File> {
  const res = await fetch(Capacitor.convertFileSrc(file.path!));
  const blob = await res.blob();
  return new File([blob], file.name ?? 'shared.gcode');
}

/** Opens a link outside the app (system browser on Android). */
export function openExternal(url: string) {
  if (isNative) PrinterMonitor.openUrl({ url }).catch(() => {});
  else window.open(url, '_blank', 'noopener');
}

export async function shareText(text: string) {
  if (isNative) return PrinterMonitor.shareText({ text });
  if (navigator.share) return navigator.share({ text }).catch(() => {});
  await navigator.clipboard?.writeText(text);
}
