import { useEffect, useRef, useState } from 'react';
import type { PrinterStatus } from './api/moonraker';
import { isNative, PrinterMonitor, type SharedFile } from './native';
import type { Printer, Settings } from './store';

const WIDGET_INTERVAL_MS = 30_000;

/**
 * Keeps the native side in sync with the app: the printer the monitor service and
 * widget should poll, starting the monitor when a print is running, and widget refreshes.
 */
export function useNativeSync(
  printer: Printer | null,
  status: PrinterStatus | null,
  settings: Settings,
) {
  const lastWidget = useRef({ at: 0, state: '' });

  useEffect(() => {
    if (!isNative) return;
    PrinterMonitor.configure(
      printer
        ? { host: printer.host, port: printer.port, name: printer.name, lang: settings.lang }
        : {},
    ).catch(() => {});
  }, [printer?.host, printer?.port, printer?.name, settings.lang]);

  const printing = status?.state === 'printing' || status?.state === 'paused';
  useEffect(() => {
    if (!isNative || !printing || !settings.notify) return;
    PrinterMonitor.requestNotifications()
      .then(({ granted }) => {
        if (granted) return PrinterMonitor.startMonitor();
      })
      .catch(() => {});
  }, [printing, settings.notify, printer?.id]);

  useEffect(() => {
    if (!isNative || !status) return;
    const now = Date.now();
    const prev = lastWidget.current;
    if (prev.state === status.state && now - prev.at < WIDGET_INTERVAL_MS) return;
    lastWidget.current = { at: now, state: status.state };
    PrinterMonitor.updateWidget({
      state: status.state,
      klippy: status.klippyState,
      filename: status.filename,
      progress: status.progress,
      printDuration: status.printDuration,
    }).catch(() => {});
  }, [status]);
}

/** G-code files shared to the app from other apps (Android share sheet / "open with"). */
export function useSharedFiles(): [SharedFile | null, () => void] {
  const [file, setFile] = useState<SharedFile | null>(null);
  useEffect(() => {
    if (!isNative) return;
    PrinterMonitor.takeSharedFile()
      .then((f) => f.path && setFile(f))
      .catch(() => {});
    const handle = PrinterMonitor.addListener('sharedFile', (f) => {
      setFile(f);
      PrinterMonitor.takeSharedFile().catch(() => {});
    });
    return () => {
      handle.then((h) => h.remove());
    };
  }, []);
  return [file, () => setFile(null)];
}
