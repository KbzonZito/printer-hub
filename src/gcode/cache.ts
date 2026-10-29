import { layerBytes, type GcodeLayer, type GcodeSummary } from './model';

// Parsed models in IndexedDB, so a file opens instantly the second time (the Creality Hi
// serves files at ~0.9 MB/s). Least recently used models go first above LIMIT. See D7.

const DB = 'printer-hub-gcode';
const MODELS = 'models';
const META = 'meta';
const LIMIT = 150e6;

export interface CachedModel {
  summary: GcodeSummary;
  layers: GcodeLayer[];
  /** Figures of the download that produced it (useGcodeModel's LoadStats). */
  stats?: Record<string, unknown>;
}

interface Meta {
  key: string;
  size: number;
  used: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(MODELS);
      req.result.createObjectStore(META, { keyPath: 'key' });
    };
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

export async function getModel(key: string): Promise<CachedModel | null> {
  try {
    const db = await open();
    const tx = db.transaction([MODELS, META], 'readwrite');
    const model = await done(
      tx.objectStore(MODELS).get(key) as IDBRequest<CachedModel | undefined>,
    );
    if (!model) return null;
    const meta = await done(tx.objectStore(META).get(key) as IDBRequest<Meta | undefined>);
    if (meta) tx.objectStore(META).put({ ...meta, used: Date.now() });
    return model;
  } catch {
    return null; // storage unavailable: just download again
  }
}

export async function putModel(key: string, model: CachedModel): Promise<void> {
  try {
    const size = model.layers.reduce((s, l) => s + layerBytes(l), 0);
    if (size > LIMIT) return;
    const db = await open();
    const tx = db.transaction([MODELS, META], 'readwrite');
    tx.objectStore(MODELS).put(model, key);
    tx.objectStore(META).put({ key, size, used: Date.now() } satisfies Meta);
    const all = await done(tx.objectStore(META).getAll() as IDBRequest<Meta[]>);
    let total = all.reduce((s, m) => s + m.size, 0);
    for (const m of all.sort((a, b) => a.used - b.used)) {
      if (total <= LIMIT) break;
      if (m.key === key) continue;
      tx.objectStore(MODELS).delete(m.key);
      tx.objectStore(META).delete(m.key);
      total -= m.size;
    }
  } catch {
    /* storage full or unavailable: the model just isn't kept */
  }
}

/** Forgets one model ("Download again"). */
export async function deleteModel(key: string): Promise<void> {
  try {
    const db = await open();
    const tx = db.transaction([MODELS, META], 'readwrite');
    tx.objectStore(MODELS).delete(key);
    tx.objectStore(META).delete(key);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* nothing to delete */
  }
}
