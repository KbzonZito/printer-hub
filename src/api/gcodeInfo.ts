import { parseHead, parseTail } from '../gcode/slicerInfo';
import type { Printer } from '../store';
import { request } from './http';
import { gcodeFileUrl, type FileMetadata } from './moonraker';

// Fills in what Moonraker's metadata lacks (thumbnails, time, slicer…) from the file's own first
// and last kilobytes, fetched with HTTP ranges. Needed on the Creality Hi, whose Moonraker
// returns "Unknown" for Creality Print files.

/** Enough for the 96×96 thumbnail in the file list. */
const LIST_HEAD = 8 * 1024;
/** Header with the large thumbnail, for the file details. */
const DETAIL_HEAD = 64 * 1024;
/** Slicer summary and settings at the end of the file. */
const TAIL = 128 * 1024;

async function fetchRange(p: Printer, path: string, range: string): Promise<string> {
  const res = await request(gcodeFileUrl(p, path), { headers: { Range: range }, timeout: 15000 });
  return res.text();
}

const unknownSlicer = (m: FileMetadata) => !m.slicer || /^unknown$/i.test(m.slicer);

/** Whether completing would add something. */
export function needsCompletion(m: FileMetadata, detail: boolean) {
  if (m.completed === 'detail' || (m.completed === 'list' && !detail)) return false;
  const noThumb = !m.thumbnails?.length && !m.thumbnail_data;
  return detail ? noThumb || unknownSlicer(m) || !m.estimated_time : noThumb;
}

/**
 * `detail` reads more (large thumbnail and the end of the file) for the file details sheet;
 * without it, only the small thumbnail for the list.
 */
export async function completeMetadata(
  p: Printer,
  path: string,
  meta: FileMetadata,
  detail: boolean,
  /** File size: the tail is asked as "bytes=start-", which browsers allow without a CORS
   * preflight (unlike "bytes=-N"). */
  size?: number,
): Promise<FileMetadata> {
  if (!needsCompletion(meta, detail)) return meta;
  const out: FileMetadata = { ...meta, completed: detail ? 'detail' : 'list' };
  try {
    const head = parseHead(
      await fetchRange(p, path, `bytes=0-${(detail ? DETAIL_HEAD : LIST_HEAD) - 1}`),
    );
    if (!out.thumbnails?.length) {
      const best = head.thumbnails[head.thumbnails.length - 1];
      if (best) out.thumbnail_data = best.url;
    }
    if (unknownSlicer(out) && head.slicer) out.slicer = head.slicer;
    if (detail && (!out.estimated_time || !out.filament_total)) {
      const total = size || meta.size || 0;
      const tail = parseTail(await fetchRange(p, path, `bytes=${Math.max(0, total - TAIL)}-`));
      out.estimated_time ||= tail.estimatedTime ?? undefined;
      out.filament_total ||= tail.filamentMm ?? undefined;
      out.filament_weight_total ||= tail.filamentG ?? undefined;
      out.filament_type ||= tail.filamentType ?? undefined;
      out.first_layer_extr_temp ||= tail.nozzleTemp ?? undefined;
      out.first_layer_bed_temp ||= tail.bedTemp ?? undefined;
      out.printer_model ||= tail.printerModel ?? undefined;
    }
  } catch {
    /* ranges unsupported or the file is gone: keep what Moonraker gave */
  }
  return out;
}
