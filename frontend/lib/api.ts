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
  return typeof m === 'string' ? m : fallback;
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = tokenStore.get();
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check that the backend is running on port 4000.', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/login')) {
      tokenStore.clear();
      window.location.href = '/login';
    }
    throw new ApiError(messageFrom(data, 'Something went wrong. Try again.'), res.status);
  }
  return data as T;
}
