import type { FileMetadata } from './moonraker';

// File metadata and thumbnails kept between app starts (IndexedDB), so the file list shows
// times and pictures at once instead of asking the printer again, which matters on the
// Creality Hi: its thumbnails are read from the files themselves (gcodeInfo.ts). Keys
// include the file's modified time, so a changed file is read again. Least recently used
// entries go first above MAX_ENTRIES.

const DB = 'printer-hub-meta';
const STORE = 'meta';
const MAX_ENTRIES = 3000;

interface Entry {
  key: string;
  meta: FileMetadata;
  used: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getStoredMeta(key: string): Promise<FileMetadata | null> {
  try {
    const db = await open();
    const entry = await done(
      db.transaction(STORE).objectStore(STORE).get(key) as IDBRequest<Entry | undefined>,
    );
    return entry?.meta ?? null;
  } catch {
    return null;
  }
}

let puts = 0;
export async function putStoredMeta(key: string, meta: FileMetadata): Promise<void> {
  try {
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ key, meta, used: Date.now() } satisfies Entry);
    // Trim now and then, not on every write.
    if (++puts % 50 === 0) {
      const all = await done(tx.objectStore(STORE).getAll() as IDBRequest<Entry[]>);
      all
        .sort((a, b) => a.used - b.used)
        .slice(0, Math.max(0, all.length - MAX_ENTRIES))
        .forEach((e) => tx.objectStore(STORE).delete(e.key));
    }
  } catch {
    /* storage unavailable: it's only a cache */
  }
}

/** Entries and approximate size (Settings → Storage). */
export async function metaUsage(): Promise<{ count: number; bytes: number }> {
  try {
    const db = await open();
    const all = await done(
      db.transaction(STORE).objectStore(STORE).getAll() as IDBRequest<Entry[]>,
    );
    return { count: all.length, bytes: all.reduce((s, e) => s + JSON.stringify(e.meta).length, 0) };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

export async function clearStoredMeta(): Promise<void> {
  try {
    const db = await open();
    await done(db.transaction(STORE, 'readwrite').objectStore(STORE).clear());
  } catch {
    /* nothing to clear */
  }
}
