import { useState, type FormEvent } from 'react';
import { Check, Plus, UserPlus, X } from 'lucide-react';
import { api, fmtDate, fullName, type Row } from '../api';
import { Badge, Btn, Card, CredentialDialog, Empty, ErrorBox, Field, Loading, Modal, PageHead, errMsg, useLoad, useToast } from '../ui';
import { useApp, useCurrentClasses } from './data';
import StudentForm from './StudentForm';

export default function Admissions() {
  const { meta } = useApp(); const toast = useToast();
  const [tab, setTab] = useState('pending');
  const [newApp, setNewApp] = useState(false); const [direct, setDirect] = useState(false);
  const [approve, setApprove] = useState<Row | null>(null); const [reject, setReject] = useState<Row | null>(null);
  const [creds, setCreds] = useState<Row | null>(null);
  const { data, loading, error, reload } = useLoad<Row[]>(() => api.get('/admissions', { status: tab }), [tab]);
  return <>
    <PageHead title="New admissions" sub={`Applications for ${meta.current_year}. Approving one creates the student record and login.`} actions={<>
      <Btn variant="ghost" onClick={() => setDirect(true)}><UserPlus size={16} />Admit directly</Btn><Btn onClick={() => setNewApp(true)}><Plus size={16} />New application</Btn></>} />
    <Card>
      <div className="tabs">{['pending', 'approved', 'rejected'].map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)} style={{ textTransform: 'capitalize' }}>{t}</button>)}</div>
      {loading ? <Loading /> : error ? <ErrorBox msg={error} retry={reload} /> : !data?.length ? <Empty>No {tab} applications.</Empty> :
        <div className="table-wrap"><table><thead><tr><th>Applicant</th><th>Applying for</th><th>Parent</th><th>Mobile</th><th>Applied</th><th></th></tr></thead><tbody>
          {data.map(a => <tr key={a.id}><td><b>{a.applicant_name}</b><div className="muted small">{a.previous_school ? `From ${a.previous_school}` : ''}</div></td><td>{a.applying_grade}</td><td>{a.parent_name}</td><td>{a.parent_contact}</td><td>{fmtDate(a.created_at)}</td>
            <td className="right nowrap">{a.status === 'pending' ? <><Btn variant="soft" className="btn-sm" onClick={() => setApprove(a)}><Check size={14} />Approve</Btn>{' '}<Btn variant="ghost" className="btn-sm" onClick={() => setReject(a)}><X size={14} />Reject</Btn></> : <Badge tone={a.status === 'approved' ? 'green' : 'red'}>{a.status}</Badge>}</td></tr>)}
        </tbody></table></div>}
    </Card>
    {newApp && <ApplicationForm onClose={() => setNewApp(false)} onSaved={() => { setNewApp(false); setTab('pending'); reload(); toast('Application saved'); }} />}
    {direct && <StudentForm onClose={() => setDirect(false)} onSaved={c => { setDirect(false); if (c) setCreds({ name: fullName(c), admission_no: c.admission_no, temp_password: c.temp_password }); }} />}
    {approve && <ApproveDialog app={approve} onClose={() => setApprove(null)} onDone={s => { setApprove(null); reload(); setCreds({ name: fullName(s), admission_no: s.admission_no, temp_password: s.temp_password }); }} />}
    {reject && <RejectDialog app={reject} onClose={() => setReject(null)} onDone={() => { setReject(null); reload(); toast('Application rejected'); }} />}
    {creds && <CredentialDialog school={meta.settings.school_name} creds={creds as any} onClose={() => setCreds(null)} />}
  </>;
}

function ApplicationForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { meta } = useApp(); const toast = useToast(); const [busy, setBusy] = useState(false);
  const [f, setF] = useState<Row>({ applicant_name: '', dob: '', gender: '', applying_grade: 'Class 1', parent_name: '', parent_contact: '', parent_email: '', address: '', previous_school: '' });
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); const b = { ...f }; for (const k of ['dob', 'gender', 'parent_email', 'address', 'previous_school']) if (!b[k]) b[k] = null;
    try { await api.post('/admissions', b); onSaved(); } catch (err) { toast(errMsg(err), 'error'); } finally { setBusy(false); } };
  return <Modal title="New admission application" subtitle={`Academic year ${meta.current_year}`} onClose={onClose}>
    <form onSubmit={submit}>
      <Field label="Applicant's full name" required><input required autoFocus value={f.applicant_name} onChange={set('applicant_name')} /></Field>
      <div className="row3"><Field label="Date of birth"><input type="date" value={f.dob} onChange={set('dob')} /></Field><Field label="Gender"><select value={f.gender} onChange={set('gender')}><option value="">—</option><option>Male</option><option>Female</option><option>Other</option></select></Field>
        <Field label="Applying for" required><select value={f.applying_grade} onChange={set('applying_grade')}>{meta.grades.map(g => <option key={g}>{g}</option>)}</select></Field></div>
      <div className="row2"><Field label="Parent / guardian" required><input required value={f.parent_name} onChange={set('parent_name')} /></Field><Field label="Mobile" required><input required type="tel" minLength={7} value={f.parent_contact} onChange={set('parent_contact')} /></Field></div>
      <Field label="Parent email"><input type="email" value={f.parent_email} onChange={set('parent_email')} /></Field>
      <Field label="Address"><textarea rows={2} value={f.address} onChange={set('address')} /></Field>
      <Field label="Previous school"><input value={f.previous_school} onChange={set('previous_school')} /></Field>
      <div className="modal-actions"><Btn type="button" variant="ghost" onClick={onClose}>Cancel</Btn><Btn type="submit" busy={busy}>Save application</Btn></div>
    </form></Modal>;
}

function ApproveDialog({ app, onClose, onDone }: { app: Row; onClose: () => void; onDone: (s: Row) => void }) {
  const classes = useCurrentClasses(); const toast = useToast(); const [busy, setBusy] = useState(false);
  const match = classes.filter(c => c.grade === app.applying_grade);
  const [classId, setClassId] = useState<string>(String(match[0]?.id ?? '')); const [roll, setRoll] = useState('');
  const [bus, setBus] = useState(''); const [pickup, setPickup] = useState('');
  const go = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const s = await api.post(`/admissions/${app.id}/approve`, { class_id: Number(classId), roll_no: roll || null });
      if (bus) {   // optional bus preference taken at admission; the student can still change it from the portal until the office locks it
        try { await api.put(`/transport/students/${s.id}`, { uses_bus: bus === 'yes', pickup_location: bus === 'yes' ? pickup : null, lock: false }); }
        catch (e2) { toast(`Student admitted, but the bus preference was not saved: ${errMsg(e2)}`, 'error'); }
      }
      onDone(s);
    } catch (err) { toast(errMsg(err), 'error'); setBusy(false); }
  };
  return <Modal title={`Admit ${app.applicant_name}`} subtitle={`Applied for ${app.applying_grade}`} onClose={onClose}>
    <form onSubmit={go}>
      {match.length === 0 && <div className="note warn">No “{app.applying_grade}” class exists for this year. Pick another class, or add it under Classes & years.</div>}
      <Field label="Assign to class" required><select required value={classId} onChange={e => setClassId(e.target.value)}><option value="">Select class</option>{classes.map(c => <option key={c.id} value={c.id}>{c.grade}-{c.section}</option>)}</select></Field>
      <Field label="Roll no."><input value={roll} onChange={e => setRoll(e.target.value)} /></Field>
      <Field label="School bus" hint="Optional. If left blank, the student is asked on their first login."><select value={bus} onChange={e => setBus(e.target.value)}><option value="">Decide later</option><option value="yes">Will use the school bus</option><option value="no">Will not use the bus</option></select></Field>
      {bus === 'yes' && <Field label="Pickup location" required hint="The office picks the bus from this, or the student chooses a stop themselves."><input required value={pickup} onChange={e => setPickup(e.target.value)} maxLength={255} /></Field>}
      <div className="note">A Student ID and temporary password are created automatically.</div>
      <div className="modal-actions"><Btn type="button" variant="ghost" onClick={onClose}>Cancel</Btn><Btn type="submit" busy={busy} disabled={!classId}>Admit student</Btn></div>
    </form></Modal>;
}

function RejectDialog({ app, onClose, onDone }: { app: Row; onClose: () => void; onDone: () => void }) {
  const toast = useToast(); const [r, setR] = useState(''); const [busy, setBusy] = useState(false);
  return <Modal title={`Reject ${app.applicant_name}?`} onClose={onClose}>
    <Field label="Reason (optional)"><input value={r} onChange={e => setR(e.target.value)} /></Field>
    <div className="modal-actions"><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="danger" busy={busy} onClick={async () => { setBusy(true); try { await api.post(`/admissions/${app.id}/reject`, { remarks: r || null }); onDone(); } catch (e) { toast(errMsg(e), 'error'); setBusy(false); } }}>Reject</Btn></div></Modal>;
}
