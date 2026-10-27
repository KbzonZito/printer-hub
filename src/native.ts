import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

// Native Android pieces (android/app/src/main/java/.../PrinterMonitorPlugin.java).

export interface SharedFile {
  name?: string;
  path?: string;
  size?: number;
}

export interface SocketEvent {
  id: string;
  type: 'open' | 'message' | 'close';
  data?: string;
  code?: number;
  reason?: string;
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
  shareImage(opts: { data?: string; url?: string; name: string }): Promise<void>;
  saveFile(opts: { name: string; text: string; mime?: string }): Promise<{ saved: boolean }>;
  takeSharedFile(): Promise<SharedFile>;
  addListener(event: 'sharedFile', fn: (file: SharedFile) => void): Promise<PluginListenerHandle>;
  addListener(event: 'socketEvent', fn: (e: SocketEvent) => void): Promise<PluginListenerHandle>;
  socketOpen(opts: { id: string; url: string }): Promise<void>;
  socketSend(opts: { id: string; data: string }): Promise<void>;
  socketClose(opts: { id: string }): Promise<void>;
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function download(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.rel = 'noopener';
  a.target = '_blank';
  a.click();
}

/** Shares an image (a JPEG, or the URL of one) through the share sheet; downloads it on the web. */
export async function shareImage(image: Blob | string, name: string) {
  if (isNative) {
    return typeof image === 'string'
      ? PrinterMonitor.shareImage({ url: image, name })
      : PrinterMonitor.shareImage({ data: await blobToBase64(image), name });
  }
  if (typeof image === 'string') return download(image, name);
  const file = new File([image], name, { type: image.type });
  if (navigator.canShare?.({ files: [file] })) {
    return navigator.share({ files: [file] }).catch(() => {});
  }
  const url = URL.createObjectURL(image);
  download(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Saves a text file where the user chooses. Resolves false if they cancelled. */
export async function saveTextFile(name: string, text: string, mime = 'application/json') {
  if (isNative) return (await PrinterMonitor.saveFile({ name, text, mime })).saved;
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  download(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
