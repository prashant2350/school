import * as SecureStore from 'expo-secure-store';
import { DEFAULT_API } from './config';

let base = DEFAULT_API; let token = null; let onExpired = () => {};
export const getBase = () => base;
export const getToken = () => token;
export const authHeaders = () => (token ? { Authorization: `Bearer ${token}` } : {});
export const onSessionExpired = (fn) => { onExpired = fn; };

export async function boot() {
  base = (await SecureStore.getItemAsync('api')) || DEFAULT_API;
  token = await SecureStore.getItemAsync('token');
  return !!token;
}
export async function setBase(url) { base = url.trim().replace(/\/+$/, ''); await SecureStore.setItemAsync('api', base); }
export async function logout() { token = null; await SecureStore.deleteItemAsync('token'); }

const message = (data, status) => {
  const d = data && data.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map((x) => (x.msg || '').replace('Value error, ', '')).filter(Boolean).join('. ') || 'Please check the form';
  return `Something went wrong (${status})`;
};

async function request(method, path, body, params) {
  const qs = params ? '?' + Object.entries(params).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&') : '';
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;   // file upload: let fetch set the multipart header itself
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), isForm ? 60000 : 30000);
  let res;
  try {
    res = await fetch(base + path + qs, {
      method, signal: ctrl.signal,
      headers: isForm ? { ...authHeaders() } : { 'Content-Type': 'application/json', ...authHeaders() },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch (e) {
    throw new Error(`Cannot reach the school server at ${base} [${e && e.message ? e.message : 'network error'}]. Check the address in Server settings, that the backend is running with --host 0.0.0.0, and that the phone is on the same Wi-Fi.`);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) { await logout(); onExpired(); throw new Error('Your session expired. Please sign in again.'); }
    throw new Error(message(data, res.status));
  }
  return data;
}
export const api = {
  get: (p, params) => request('GET', p, undefined, params),
  post: (p, b) => request('POST', p, b ?? {}),
  put: (p, b) => request('PUT', p, b),
  patch: (p, b) => request('PATCH', p, b),
  del: (p) => request('DELETE', p),
  upload: (p, form) => request('POST', p, form),
};
export async function login(studentId, password) {
  const r = await request('POST', '/auth/student-login', { student_id: studentId.trim(), password });
  token = r.access_token; await SecureStore.setItemAsync('token', token);
}