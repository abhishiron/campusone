export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const TOKEN_KEY = 'campusone_token';

export const tokenStore = {
  get: () => (typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY)),
  set: (t: string) => window.localStorage.setItem(TOKEN_KEY, t),
  clear: () => window.localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Server validation errors arrive as a string or a list of strings; show the first one. */
function messageFrom(body: any, fallback: string) {
  const m = body?.message;
  if (Array.isArray(m)) return m[0] || fallback;
  if (typeof m === 'string' && /File too large/i.test(m)) return 'That file is too large.';
  return typeof m === 'string' ? m : fallback;
}

async function request(path: string, init: RequestInit) {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(API_URL + path, { ...init, headers: { ...(init.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  } catch {
    throw new ApiError('Cannot reach the server. Check that the backend is running on port 4000.', 0);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/login')) {
      tokenStore.clear();
      window.location.href = '/login';
    }
    throw new ApiError(messageFrom(data, 'Something went wrong. Try again.'), res.status);
  }
  return res;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await request(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return res.json().catch(() => null) as Promise<T>;
}

/** Multipart POST for forms with files. */
export async function upload<T = any>(path: string, form: FormData): Promise<T> {
  const res = await request(path, { method: 'POST', body: form });
  return res.json() as Promise<T>;
}

/** Files need the auth header, so fetch them as a blob and open that in a new tab. */
export async function openFile(id: string) {
  const tab = window.open('', '_blank');
  try {
    const res = await request(`/files/${id}`, { method: 'GET' });
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (e) {
    tab?.close();
    throw e;
  }
}
