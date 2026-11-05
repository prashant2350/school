import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { CheckCircle2, Printer, X, AlertTriangle, Loader2 } from 'lucide-react';
import { ApiError, fetchBlob, type Row } from './api';

// ── toast ────────────────────────────────────────────────────────────────────
type ToastKind = 'ok' | 'error';
const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ msg: string; kind: ToastKind } | null>(null);
  const show = useCallback((msg: string, kind: ToastKind = 'ok') => setT({ msg, kind }), []);
  useEffect(() => { if (!t) return; const id = setTimeout(() => setT(null), 4500); return () => clearTimeout(id); }, [t]);
  return <ToastCtx.Provider value={show}>{children}
    {t && <div className={`toast toast-${t.kind}`} role="status">{t.kind === 'ok' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}<span>{t.msg}</span><button aria-label="Dismiss" onClick={() => setT(null)}><X size={15} /></button></div>}
  </ToastCtx.Provider>;
}
export const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong');

// ── data loading hook ────────────────────────────────────────────────────────
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true; setLoading(true); setError('');
    fn().then(d => { if (live) { setData(d); setLoading(false); } }).catch(e => { if (live) { setError(errMsg(e)); setLoading(false); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick(x => x + 1), setData };
}

// ── primitives ───────────────────────────────────────────────────────────────
export function Modal({ title, subtitle, onClose, children, wide, printable }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean; printable?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
    <div className={`modal ${wide ? 'modal-wide' : ''} ${printable ? 'printable' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-btn no-print" aria-label="Close" onClick={onClose}><X size={18} /></button></div>
      <div className="modal-body">{children}</div>
    </div></div>;
}

export function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}{required && <b> *</b>}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Btn({ children, variant = 'primary', busy, ...p }: { variant?: 'primary' | 'ghost' | 'danger' | 'soft'; busy?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} disabled={p.disabled || busy} className={`btn btn-${variant} ${p.className || ''}`}>{busy && <Loader2 size={15} className="spin" />}{children}</button>;
}

export const Badge = ({ tone = 'gray', children }: { tone?: 'gray' | 'green' | 'red' | 'amber' | 'purple' | 'blue'; children: ReactNode }) => <span className={`badge badge-${tone}`}>{children}</span>;

export function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return <div className="page-head"><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div><div className="page-actions">{actions}</div></div>;
}
export const Card = ({ title, actions, children, className = '' }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) =>
  <section className={`card ${className}`}>{(title || actions) && <header className="card-head"><h3>{title}</h3><div>{actions}</div></header>}{children}</section>;
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;
export const Loading = () => <div className="empty"><Loader2 className="spin" size={20} /> Loading…</div>;
export const ErrorBox = ({ msg, retry }: { msg: string; retry?: () => void }) => <div className="errorbox"><AlertTriangle size={18} /> {msg} {retry && <button className="link" onClick={retry}>Retry</button>}</div>;

export function Avatar({ name }: { name: string }) {
  const tones = ['#ffe9dc', '#ece9ff', '#dcf5ec', '#e0eefc', '#fff3cf', '#fde4ea'];
  const i = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % tones.length;
  return <span className="avatar" style={{ background: tones[i] }}>{name.split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() || '').join('')}</span>;
}

// ── credential slip: shown ONCE after a student is created / password reset ──
export function CredentialDialog({ school, creds, onClose, kind = 'student' }: { school: string; creds: { name: string; admission_no: string; temp_password: string }; onClose: () => void; kind?: 'student' | 'faculty' }) {
  const f = kind === 'faculty';
  return <Modal title={f ? 'Faculty login ready' : 'Student login created'} subtitle={`Give this slip to the ${f ? 'faculty member' : 'student/parent'}. The password is shown only once.`} onClose={onClose} printable>
    <div className="slip">
      <h3>{school}</h3>
      <p className="muted">{f ? 'Faculty Portal Login' : 'Student Portal Login'}</p>
      <dl>
        <dt>{f ? 'Faculty name' : 'Student name'}</dt><dd>{creds.name}</dd>
        <dt>{f ? 'Employee ID' : 'Student ID'}</dt><dd className="mono">{creds.admission_no}</dd>
        <dt>Temporary password</dt><dd className="mono big">{creds.temp_password}</dd>
      </dl>
      <p className="muted small">On first login you will be asked to choose a new password.</p>
    </div>
    <div className="modal-actions no-print"><Btn variant="ghost" onClick={() => window.print()}><Printer size={16} /> Print slip</Btn><Btn onClick={onClose}>Done</Btn></div>
  </Modal>;
}

export function Confirm({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onClose }: { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => Promise<void> | void; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  return <Modal title={title} onClose={onClose}>
    <div className="confirm-text">{message}</div>
    <div className="modal-actions"><Btn variant="ghost" onClick={onClose}>Cancel</Btn>
      <Btn variant={danger ? 'danger' : 'primary'} busy={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>{confirmLabel}</Btn></div>
  </Modal>;
}

export const classLabel = (k?: Row | null) => (k ? `${k.grade}-${k.section}` : '—');


/** Round photo (or initials when there is none). `src` is an object URL made from fetchBlob. */
export function PhotoAvatar({ name, src, size = 60 }: { name: string; src?: string | null; size?: number }) {
  if (!src) return <span style={{ display: 'inline-grid', width: size, height: size, fontSize: size / 3 }} className="avatar-wrap"><Avatar name={name} /></span>;
  return <img src={src} alt={name} className="photo" style={{ width: size, height: size }} />;
}

/** Weekly timetable grid. cell(dayIndex, period) returns what to show in that cell. */
export function TimetableGrid({ periods, days, cell, highlightDay }: { periods: number; days: string[]; cell: (d: number, p: number) => ReactNode; highlightDay?: number }) {
  return <div className="table-wrap"><table className="tt"><thead><tr><th>Period</th>{days.map((d, i) => <th key={d} className={i === highlightDay ? 'today' : ''}>{d}</th>)}</tr></thead>
    <tbody>{Array.from({ length: periods }, (_, p) => <tr key={p}><th>{p + 1}</th>{days.map((d, di) => <td key={d} className={di === highlightDay ? 'today' : ''}>{cell(di, p + 1) ?? <span className="muted">—</span>}</td>)}</tr>)}</tbody></table></div>;
}

/** Loads a protected image (needs the login token) and returns an object URL, or null while loading / when there is none. */
export function useBlobUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    let live = true; let made: string | null = null;
    fetchBlob(path).then(b => { if (!live) return; made = URL.createObjectURL(b); setUrl(made); }).catch(() => live && setUrl(null));
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [path]);
  return url;
}
