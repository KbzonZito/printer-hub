import type { Printer } from '../store';
import { get, post } from './moonraker';

// Spoolman through Moonraker: https://moonraker.readthedocs.io/en/latest/web_api/#spoolman-apis

export interface Spool {
  id: number;
  remaining_weight?: number;
  used_weight?: number;
  archived?: boolean;
  filament: {
    id: number;
    name?: string;
    material?: string;
    color_hex?: string;
    weight?: number;
    vendor?: { name?: string };
  };
}

export const fetchActiveSpoolId = async (p: Printer) =>
  (await get<{ spool_id: number | null }>(p, '/server/spoolman/spool_id')).spool_id;

export const setActiveSpool = (p: Printer, id: number | null) =>
  post(p, `/server/spoolman/spool_id${id != null ? `?spool_id=${id}` : ''}`);

/** Calls Spoolman's own API through Moonraker's proxy. */
async function proxy<T>(p: Printer, path: string): Promise<T> {
  const res = await post<{ response: T; error: { message?: string } | null }>(
    p,
    `/server/spoolman/proxy?request_method=GET&path=${encodeURIComponent(path)}&use_v2_response=true`,
  );
  if (res.error) throw new Error(res.error.message ?? 'Spoolman');
  return res.response;
}

export const listSpools = (p: Printer) => proxy<Spool[]>(p, '/v1/spool');

export function spoolLabel(s: Spool) {
  const f = s.filament;
  return [f.vendor?.name, f.name].filter(Boolean).join(' ') || `#${s.id}`;
}
