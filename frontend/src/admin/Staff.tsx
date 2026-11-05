import { useState, type FormEvent } from 'react';
import { KeyRound, Plus } from 'lucide-react';
import { api, type Row } from '../api';
import { Avatar, Badge, Btn, Card, CredentialDialog, ErrorBox, Field, Loading, Modal, PageHead, errMsg, useLoad, useToast } from '../ui';
import { useApp } from './data';

const ROLES = [['teacher', 'Teacher / Faculty — own portal'], ['admin', 'Admin — full access'], ['accountant', 'Accountant — fees'], ['clerk', 'Clerk — admissions & fees']];
const shownEmail = (e: string) => (e.endsWith('@staff.invalid') ? '—' : e);

export default function Staff() {
  const { me, meta } = useApp(); const toast = useToast(); const [form, setForm] = useState(false); const [reset, setReset] = useState<Row | null>(null); const [creds, setCreds] = useState<Row | null>(null);
  const { data, loading, error, reload } = useLoad<Row[]>(() => api.get('/users'), []);
  const patch = async (u: Row, body: Row) => { try { await api.patch(`/users/${u.id}`, body); reload(); } catch (e) { toast(errMsg(e), 'error'); } };
  return <>
    <PageHead title="Staff accounts" sub="Faculty sign in with their Employee ID and get their own portal. Other staff use the admin panel." actions={<Btn onClick={() => setForm(true)}><Plus size={16} />Add staff</Btn>} />
    <Card>{loading ? <Loading /> : error ? <ErrorBox msg={error} retry={reload} /> :
      <div className="table-wrap"><table><thead><tr><th>Name</th><th>Employee ID</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead><tbody>
        {data!.map(u => <tr key={u.id}><td><div className="person"><Avatar name={u.full_name} /><div><b>{u.full_name}</b>{u.designation && <small>{u.designation}</small>}</div></div></td><td className="mono">{u.employee_id ?? '—'}</td><td>{shownEmail(u.email)}</td>
          <td><select value={u.role} disabled={u.id === me.id} onChange={e => patch(u, { role: e.target.value })} aria-label={`Role for ${u.full_name}`} style={{ width: 'auto' }}>{ROLES.map(([v]) => <option key={v}>{v}</option>)}</select></td>
          <td>{u.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Disabled</Badge>}</td>
          <td className="right nowrap"><Btn variant="ghost" className="btn-sm" onClick={() => setReset(u)}><KeyRound size={14} />Reset password</Btn>{' '}{u.id !== me.id && <Btn variant="ghost" className="btn-sm" onClick={() => patch(u, { is_active: !u.is_active })}>{u.is_active ? 'Disable' : 'Enable'}</Btn>}</td></tr>)}</tbody></table></div>}</Card>
    {form && <StaffForm onClose={() => setForm(false)} onSaved={r => { setForm(false); reload(); if (r.temp_password) setCreds({ name: r.full_name, admission_no: r.employee_id ?? r.email, temp_password: r.temp_password }); else toast('Staff account created'); }} />}
    {reset && <ResetForm user={reset} onClose={() => setReset(null)} onTemp={t => { setCreds({ name: reset.full_name, admission_no: reset.employee_id ?? reset.email, temp_password: t }); setReset(null); }} />}
    {creds && <CredentialDialog kind="faculty" school={meta.settings.school_name} creds={creds as any} onClose={() => setCreds(null)} />}
  </>;
}

function StaffForm({ onClose, onSaved }: { onClose: () => void; onSaved: (r: Row) => void }) {
  const toast = useToast(); const [busy, setBusy] = useState(false); const [f, setF] = useState({ full_name: '', email: '', phone_number: '', role: 'teacher', designation: '', employee_id: '', password: '' });
  const teacher = f.role === 'teacher';
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true);
    try { onSaved(await api.post('/users', { full_name: f.full_name, email: f.email || null, phone_number: f.phone_number || null, role: f.role, designation: f.designation || null, employee_id: f.employee_id || null, password: f.password || null })); }
    catch (err) { toast(errMsg(err), 'error'); setBusy(false); } };
  return <Modal title="Add staff member" onClose={onClose}><form onSubmit={submit}>
    <Field label="Full name" required><input required autoFocus value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} /></Field>
    <Field label="Role"><select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
    <div className="row2"><Field label={teacher ? 'Email (optional)' : 'Email (login)'} required={!teacher}><input required={!teacher} type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field><Field label="Mobile"><input type="tel" value={f.phone_number} onChange={e => setF({ ...f, phone_number: e.target.value })} /></Field></div>
    {teacher && <div className="row2"><Field label="Employee ID" hint="Leave blank to auto-create (SHS-T-001…)"><input value={f.employee_id} onChange={e => setF({ ...f, employee_id: e.target.value })} /></Field><Field label="Designation"><input value={f.designation} onChange={e => setF({ ...f, designation: e.target.value })} placeholder="PGT Maths" /></Field></div>}
    <Field label="Initial password" hint="Leave blank to auto-generate a temporary password (recommended). They must change it at first sign-in."><input minLength={8} value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></Field>
    <div className="modal-actions"><Btn type="button" variant="ghost" onClick={onClose}>Cancel</Btn><Btn type="submit" busy={busy}>Create account</Btn></div></form></Modal>;
}

function ResetForm({ user, onClose, onTemp }: { user: Row; onClose: () => void; onTemp: (t: string) => void }) {
  const toast = useToast(); const [pw, setPw] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); try { const r = await api.post(`/users/${user.id}/reset-password`, { new_password: pw || null }); if (r.temp_password) onTemp(r.temp_password); else { toast('Password changed'); onClose(); } } catch (err) { toast(errMsg(err), 'error'); setBusy(false); } };
  return <Modal title={`Reset password — ${user.full_name}`} onClose={onClose}><form onSubmit={submit}><Field label="New password" hint="Leave blank to auto-generate a temporary one. They must change it at next sign-in."><input minLength={8} autoFocus value={pw} onChange={e => setPw(e.target.value)} /></Field>
    <div className="modal-actions"><Btn type="button" variant="ghost" onClick={onClose}>Cancel</Btn><Btn type="submit" busy={busy}>Reset password</Btn></div></form></Modal>;
}
