import { tr } from '../i18n';

// Small fetch wrapper. On Android, Capacitor routes fetch() through native HTTP
// (see capacitor.config.ts), so requests to the printer skip browser CORS checks.

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: BodyInit;
  headers?: Record<string, string>;
  timeout?: number;
}

export async function request(url: string, opts: RequestOptions = {}): Promise<Response> {
  const { method = 'GET', body, headers, timeout = 8000 } = opts;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The native bridge may ignore AbortSignal, so race against a timer too.
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new HttpError(tr('err.timeout')));
    }, timeout);
  });
  try {
    const res = await Promise.race([
      fetch(url, { method, body, headers, signal: controller.signal }),
      timeoutPromise,
    ]);
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const data = await res.json();
        detail = data?.error?.message ?? detail;
      } catch {
        /* body was not JSON */
      }
      throw new HttpError(detail || `HTTP ${res.status}`, res.status);
    }
    return res;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(tr('err.unreachable'));
  } finally {
    clearTimeout(timer);
  }
}

export async function requestJson<T>(url: string, opts?: RequestOptions): Promise<T> {
  const res = await request(url, opts);
  return (await res.json()) as T;
}
