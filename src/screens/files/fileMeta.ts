import { useEffect, useRef, useState } from 'react';
import {
  fetchMetadata,
  type FileMetadata,
  type GcodeDir,
  type GcodeFile,
} from '../../api/moonraker';
import { completeMetadata, needsCompletion } from '../../api/gcodeInfo';
import { getStoredMeta, putStoredMeta } from '../../api/metaStore';
import { loadCalibration, type Calibration } from '../../estimate';
import type { Printer } from '../../store';

// File metadata (time, filament, thumbnails) for the file list and details: Moonraker's,
// completed from the file itself when it lacks them (api/gcodeInfo.ts), cached per file.

export const metaCache = new Map<string, FileMetadata>();
export const metaKey = (p: Printer, f: GcodeFile) => `${p.id}:${f.path}:${f.modified}`;

export type Item = { kind: 'dir'; dir: GcodeDir } | { kind: 'file'; file: GcodeFile };

export const GCODE_NAME = /\.(gcode|g|gco)$/i;
export const parentOf = (path: string) =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';

/**
 * Metadata of a file: from memory, then the phone (metaStore), then the printer, completed from
 * the file itself when Moonraker lacks something. `detail` reads more (big thumbnail, time).
 */
async function loadMeta(printer: Printer, file: GcodeFile, detail: boolean) {
  const key = metaKey(printer, file);
  let meta = metaCache.get(key) ?? (await getStoredMeta(key));
  const fromPrinter = !meta;
  meta ??= await fetchMetadata(printer, file.path);
  const missing = needsCompletion(meta, detail);
  if (missing) meta = await completeMetadata(printer, file.path, meta, detail, file.size);
  metaCache.set(key, meta);
  if (fromPrinter || missing) putStoredMeta(key, meta);
  return meta;
}

export function useMetadata(printer: Printer, file: GcodeFile, visible: boolean) {
  const key = metaKey(printer, file);
  const [meta, setMeta] = useState(metaCache.get(key));
  useEffect(() => {
    if (!visible || meta) return;
    let cancelled = false;
    loadMeta(printer, file, false)
      .then((m) => !cancelled && setMeta(m))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key, visible]);
  return meta;
}

export function useFileMeta(printer: Printer, file: GcodeFile | null) {
  const [meta, setMeta] = useState<FileMetadata>();
  useEffect(() => {
    if (!file) return;
    setMeta(metaCache.get(metaKey(printer, file)));
    let cancelled = false;
    loadMeta(printer, file, true)
      .then((m) => !cancelled && setMeta(m))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [file]);
  return file ? meta : undefined;
}

export function useVisible<T extends Element>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), {
      rootMargin: '200px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return [ref, visible] as const;
}

export function useCalibration(printer: Printer) {
  const [cal, setCal] = useState<Calibration | null>(null);
  useEffect(() => {
    loadCalibration(printer)
      .then(setCal)
      .catch(() => {});
  }, [printer.id]);
  return cal;
}
