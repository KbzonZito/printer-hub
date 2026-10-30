import { useEffect, useRef, useState } from 'react';
import {
  fetchMetadata,
  type FileMetadata,
  type GcodeDir,
  type GcodeFile,
} from '../../api/moonraker';
import { completeMetadata, needsCompletion } from '../../api/gcodeInfo';
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

export function useMetadata(printer: Printer, file: GcodeFile, visible: boolean) {
  const key = metaKey(printer, file);
  const [meta, setMeta] = useState(metaCache.get(key));
  useEffect(() => {
    if (!visible || meta) return;
    let cancelled = false;
    fetchMetadata(printer, file.path)
      .then((m) => completeMetadata(printer, file.path, m, false, file.size))
      .then((m) => {
        metaCache.set(key, m);
        if (!cancelled) setMeta(m);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key, visible]);
  return meta;
}

/** Metadata for the file open in the detail sheet. */
export function useFileMeta(printer: Printer, file: GcodeFile | null) {
  const [meta, setMeta] = useState<FileMetadata>();
  useEffect(() => {
    if (!file) return;
    const key = metaKey(printer, file);
    const cached = metaCache.get(key);
    setMeta(cached);
    // The list may have cached it with only the small thumbnail; the details want more.
    if (cached && !needsCompletion(cached, true)) return;
    let cancelled = false;
    (cached ? Promise.resolve(cached) : fetchMetadata(printer, file.path))
      .then((m) => completeMetadata(printer, file.path, m, true, file.size))
      .then((m) => {
        metaCache.set(key, m);
        if (!cancelled) setMeta(m);
      })
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
