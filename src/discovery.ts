import { probeMoonraker } from './api/moonraker';
import { isNative, PrinterMonitor } from './native';

export interface Found {
  host: string;
  name: string;
}

/** The /24 subnet to scan, from the device's Wi-Fi address when available. */
export async function localSubnet(): Promise<string> {
  if (isNative) {
    const { ip } = await PrinterMonitor.getLocalIp().catch(() => ({ ip: undefined }));
    if (ip) return ip.split('.').slice(0, 3).join('.');
  }
  return '192.168.1';
}

/** Probes every address in the subnet for Moonraker on port 7125. */
export async function scanNetwork(
  subnet: string,
  onFound: (f: Found) => void,
  onProgress: (fraction: number) => void,
  isCancelled: () => boolean,
): Promise<void> {
  const hosts = Array.from({ length: 254 }, (_, i) => `${subnet}.${i + 1}`);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < hosts.length && !isCancelled()) {
      const host = hosts[next++];
      const name = await probeMoonraker(host);
      if (name && !isCancelled()) onFound({ host, name });
      onProgress(++done / hosts.length);
    }
  };
  await Promise.all(Array.from({ length: 32 }, worker));
}
