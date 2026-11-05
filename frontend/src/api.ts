// ─────────────────────────────────────────────────────────────────────────────
// API client. The ONLY place that knows the backend address.
// Change it in frontend/.env.local  →  VITE_API_BASE_URL=https://your-server/api/v1
// ─────────────────────────────────────────────────────────────────────────────
export const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://127.0.0.1:8000/api/v1' : '/api/v1');

export type Kind = 'staff' | 'student';
export type Session = { token: string; kind: Kind; role?: string };
export type Row = Record<string, any>;

const KEY = 'sjs_session';
// sessionStorage: login ends when the browser tab closes (safer on shared school computers).
export const getSession = (): Session | null => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; } };
export const setSession = (s: Session) => { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } };
export const clearSession = () => { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } };

export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

function messageFrom(body: any, status: number): string {
  const d = body?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((e: any) => `${(e.loc || []).slice(1).join('.')}: ${e.msg}`).join('; ');
  return `Request failed (${status})`;
}

async function request<T = any>(method: string, path: string, body?: unknown, params?: Record<string, any>): Promise<T> {
  const qs = params ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
  const session = getSession();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}${qs}`, {
      method,
      headers: { ...(body !== undefined && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(session ? { Authorization: `Bearer ${session.token}` } : {}) },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Cannot reach the server. Is the backend running?', 0);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && session && !path.startsWith('/auth/')) { clearSession(); window.dispatchEvent(new Event('auth-expired')); }
    throw new ApiError(messageFrom(data, res.status), res.status);
  }
  return data as T;
}

export const api = {
  get: <T = any>(p: string, params?: Record<string, any>) => request<T>('GET', p, undefined, params),
  post: <T = any>(p: string, b?: unknown, params?: Record<string, any>) => request<T>('POST', p, b ?? {}, params),
  patch: <T = any>(p: string, b: unknown) => request<T>('PATCH', p, b),
  put: <T = any>(p: string, b: unknown) => request<T>('PUT', p, b),
  upload: <T = any>(p: string, form: FormData) => request<T>('POST', p, form),
  del: <T = any>(p: string) => request<T>('DELETE', p),
};

// ── small helpers shared by pages ────────────────────────────────────────────
export const inr = (v: string | number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(Number(v || 0));
export const fmtDate = (v?: string | null) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
export const fmtDateTime = (v?: string | null) => (v ? new Date(v.endsWith('Z') || v.includes('+') ? v : v + 'Z').toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const fullName = (s: Row) => `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim();
export const todayISO = () => new Date().toISOString().slice(0, 10);

export function downloadCsv(filename: string, rows: Row[], columns?: string[]) {
  const cols = columns ?? Object.keys(rows[0] ?? {});
  const esc = (v: any) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}

export function parseCsv(text: string): Row[] {
  const rows: string[][] = []; let cur: string[] = []; let cell = ''; let q = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { cur.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; cur.push(cell); cell = ''; if (cur.some(c => c.trim() !== '')) rows.push(cur); cur = []; }
    else cell += ch;
  }
  cur.push(cell); if (cur.some(c => c.trim() !== '')) rows.push(cur);
  const [head, ...body] = rows;
  if (!head) return [];
  const keys = head.map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return body.map(r => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

/** Fetch a protected file (PDF / photo) with the login token and return it as a Blob. */
export async function fetchBlob(path: string): Promise<Blob> {
  const session = getSession();
  let res: Response;
  try { res = await fetch(`${API_BASE}${path}`, { headers: session ? { Authorization: `Bearer ${session.token}` } : {} }); }
  catch { throw new ApiError('Cannot reach the server. Is the backend running?', 0); }
  if (!res.ok) { const d = await res.json().catch(() => null); throw new ApiError(messageFrom(d, res.status), res.status); }
  return res.blob();
}
export async function downloadFile(path: string, filename: string) {
  const url = URL.createObjectURL(await fetchBlob(path));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
/** Shrink a picked photo in the browser before upload (keeps uploads small and fast on mobile data). */
export function shrinkImage(file: File, max = 360): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => { const r = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); c.toBlob(b => (b ? resolve(b) : reject(new Error('Could not read that photo'))), 'image/jpeg', 0.85); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a valid photo')); };
    img.src = url;
  });
}
/** "07:05" -> "7:05 AM" (times are stored as 24-hour HH:MM). */
export const fmtTime = (t?: string | null) => { if (!t) return '—'; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
/** Public gallery picture URL (no login needed). */
export const galleryUrl = (id: number, kind: 'image' | 'thumb') => `${API_BASE}/public/gallery/${id}/${kind}`;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
