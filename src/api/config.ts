import type { Printer } from '../store';
import { request } from './http';
import { baseUrl, get } from './moonraker';

// Klipper's config files (printer.cfg…) in Moonraker's "config" root.

export interface ConfigFile {
  path: string;
  modified: number;
  size: number;
  /** "rw", or "r" for files Moonraker won't let us change. */
  permissions?: string;
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export async function listConfigFiles(p: Printer): Promise<ConfigFile[]> {
  const files = await get<ConfigFile[]>(p, '/server/files/list?root=config');
  return files
    .filter((f) => /\.(cfg|conf|ini|txt|json)$/i.test(f.path) && !f.path.startsWith('.'))
    .sort((a, b) =>
      a.path === 'printer.cfg' ? -1 : b.path === 'printer.cfg' ? 1 : a.path.localeCompare(b.path),
    );
}

export async function readConfigFile(p: Printer, path: string): Promise<string> {
  const res = await request(`${baseUrl(p)}/server/files/config/${encodePath(path)}`, {
    timeout: 15000,
  });
  return res.text();
}

export async function saveConfigFile(p: Printer, path: string, text: string): Promise<void> {
  const slash = path.lastIndexOf('/');
  const form = new FormData();
  form.append('file', new File([text], path.slice(slash + 1), { type: 'text/plain' }));
  form.append('root', 'config');
  if (slash > 0) form.append('path', path.slice(0, slash));
  await request(`${baseUrl(p)}/server/files/upload`, {
    method: 'POST',
    body: form,
    timeout: 30000,
  });
}

export const canWrite = (f: ConfigFile) => !f.permissions || f.permissions.includes('w');
