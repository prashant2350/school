import { useMemo, useRef, useState } from 'react';
import { Download, KeyRound, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { api, downloadCsv, fmtDate, fullName, inr, parseCsv, type Row } from '../api';
import { Avatar, Badge, Btn, Card, CredentialDialog, Confirm, Empty, ErrorBox, Loading, Modal, PageHead, errMsg, useLoad, useToast } from '../ui';
import { useApp, useCurrentClasses } from './data';
import StudentForm from './StudentForm';

const statusTone = (s: string) => (s === 'active' ? 'green' : s === 'passed_out' ? 'blue' : 'gray');

export default function Students() {
  const { me, classes, meta } = useApp();
  const current = useCurrentClasses();
  const [q, setQ] = useState(''); const [classId, setClassId] = useState(''); const [status, setStatus] = useState('active');
  const [form, setForm] = useState<{ student?: Row } | null>(null);
  const [view, setView] = useState<number | null>(null);
  const [creds, setCreds] = useState<Row | null>(null);
  const [importing, setImporting] = useState(false);
  const canWrite = ['admin', 'clerk', 'accountant'].includes(me.role);
  const { data, loading, error, reload } = useLoad<Row[]>(() => api.get('/students', { q: q || undefined, class_id: classId || undefined, status, limit: 1000 }), [q, classId, status]);
  const classMap = useMemo(() => Object.fromEntries(classes.map(c => [c.id, `${c.grade}-${c.section}`])), [classes]);

  const exportCsv = () => data && downloadCsv('students.csv', data.map(s => ({ student_id: s.admission_no, name: fullName(s), class: classMap[s.class_id] ?? '', roll_no: s.roll_no, gender: s.gender, dob: s.dob, parent: s.parent_name, mobile: s.parent_contact, address: s.address, status: s.status })));

  return <>
    <PageHead title="Students" sub={`${data?.length ?? '…'} shown`} actions={canWrite && <>
      <Btn variant="ghost" onClick={exportCsv} disabled={!data?.length}><Download size={16} />Export</Btn>
      {['admin', 'clerk'].includes(me.role) && <Btn variant="ghost" onClick={() => setImporting(true)}><Upload size={16} />Import CSV</Btn>}
      <Btn onClick={() => setForm({})}><Plus size={16} />Add student</Btn></>} />
    <Card>
      <div className="toolbar">
        <div className="grow" style={{ position: 'relative' }}><Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#9aa2b8' }} /><input style={{ paddingLeft: 36, width: '100%' }} placeholder="Search name, student ID, parent, mobile…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search students" /></div>
        <select value={classId} onChange={e => setClassId(e.target.value)} aria-label="Class"><option value="">All classes</option>{current.map(c => <option key={c.id} value={c.id}>{c.grade}-{c.section}</option>)}</select>
        <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Status"><option value="active">Active</option><option value="passed_out">Passed out</option><option value="left">Left</option></select>
      </div>
      {loading ? <Loading /> : error ? <ErrorBox msg={error} retry={reload} /> : !data?.length ? <Empty>{q || classId ? 'No students match your search.' : 'No students yet. Use “Add student” or “Import CSV”.'}</Empty> :
        <div className="table-wrap"><table><thead><tr><th>Student</th><th>Student ID</th><th>Class</th><th>Parent</th><th>Mobile</th><th>Status</th></tr></thead><tbody>
          {data.map(s => <tr key={s.id} className="clickable" onClick={() => setView(s.id)}>
            <td><div className="person"><Avatar name={fullName(s)} /><div><b>{fullName(s)}</b><small>{s.gender ?? ''}</small></div></div></td>
            <td className="mono">{s.admission_no}</td><td>{classMap[s.class_id] ?? '—'}{s.roll_no ? <span className="muted"> · #{s.roll_no}</span> : null}</td>
            <td>{s.parent_name}</td><td>{s.parent_contact}</td><td><Badge tone={statusTone(s.status)}>{s.status.replace('_', ' ')}</Badge></td></tr>)}
        </tbody></table></div>}
    </Card>
    {form && <StudentForm student={form.student} onClose={() => setForm(null)} onSaved={created => { setForm(null); reload(); if (created) setCreds({ name: fullName(created), admission_no: created.admission_no, temp_password: created.temp_password }); }} />}
    {creds && <CredentialDialog school={meta.settings.school_name} creds={creds as any} onClose={() => setCreds(null)} />}
    {view !== null && <StudentDetail id={view} canWrite={canWrite} onClose={() => setView(null)} onEdit={s => { setView(null); setForm({ student: s }); }} onChanged={reload} onCreds={c => { setCreds(c); }} />}
    {importing && <ImportDialog onClose={() => setImporting(false)} onDone={() => { reload(); }} />}
    
  </>;
}

function StudentDetail({ id, canWrite, onClose, onEdit, onChanged, onCreds }: { id: number; canWrite: boolean; onClose: () => void; onEdit: (s: Row) => void; onChanged: () => void; onCreds: (c: Row) => void }) {
  const { me } = useApp(); const toast = useToast();
  const { data, loading, error } = useLoad(() => api.get(`/students/${id}/overview`), [id]);
  const [confirm, setConfirm] = useState<'reset' | 'archive' | null>(null);
  const [tab, setTab] = useState<'profile' | 'fees' | 'results'>('profile');
  if (loading || error || !data) return <Modal title="Student" onClose={onClose}>{loading ? <Loading /> : <ErrorBox msg={error} />}</Modal>;
  const s = data.student; const name = fullName(s);
  return <Modal wide title={name} subtitle={`${s.admission_no} · ${s.status.replace('_', ' ')}`} onClose={onClose}>
    <div className="tabs">{(['profile', ...(data.fees ? ['fees'] : []), 'results'] as const).map(t => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t as any)}>{t === 'profile' ? 'Profile' : t === 'fees' ? 'Fees' : 'Results'}</button>)}</div>
    {tab === 'profile' && <>
      <dl className="kv"><dt>Date of birth</dt><dd>{fmtDate(s.dob)}</dd><dt>Gender</dt><dd>{s.gender ?? '—'}</dd><dt>Blood group</dt><dd>{s.blood_group ?? '—'}</dd>
        <dt>Father / guardian</dt><dd>{s.parent_name}</dd><dt>Mother</dt><dd>{s.mother_name ?? '—'}</dd><dt>Mobile</dt><dd>{s.parent_contact}</dd><dt>Email</dt><dd>{s.parent_email ?? '—'}</dd>
        <dt>Address</dt><dd>{s.address ?? '—'}</dd><dt>Previous school</dt><dd>{s.previous_school ?? '—'}</dd>
        <dt>Attendance</dt><dd>{data.attendance.percentage == null ? 'No records yet' : `${data.attendance.percentage}% (${data.attendance.present} present / ${data.attendance.total_days} days)`}</dd></dl>
      <h3 style={{ margin: '20px 0 8px', fontSize: 15 }}>Class history</h3>
      <table><thead><tr><th>Academic year</th><th>Class</th><th>Result</th></tr></thead><tbody>{data.history.map((h: Row) => <tr key={h.academic_year}><td>{h.academic_year}</td><td>{h.class}</td><td><Badge tone={h.result === 'studying' ? 'purple' : 'gray'}>{h.result.replace('_', ' ')}</Badge></td></tr>)}</tbody></table>
    </>}
    {tab === 'fees' && data.fees && <>
      <p style={{ fontSize: 17 }}>Outstanding balance: <b style={{ color: Number(data.fees.balance) > 0 ? 'var(--red)' : 'var(--green)' }}>{inr(data.fees.balance)}</b></p>
      <h3 style={{ fontSize: 15 }}>Dues</h3>{data.fees.dues.length === 0 ? <Empty>No dues generated.</Empty> : <table><thead><tr><th>Fee</th><th>Period</th><th>Due date</th><th className="right">Amount</th></tr></thead><tbody>{data.fees.dues.map((d: Row) => <tr key={d.id}><td>{d.fee_head}</td><td>{d.period}</td><td>{fmtDate(d.due_date)}</td><td className="right">{inr(Number(d.amount_due) - Number(d.discount))}</td></tr>)}</tbody></table>}
      <h3 style={{ fontSize: 15, marginTop: 18 }}>Payments</h3>{data.fees.payments.length === 0 ? <Empty>No payments yet.</Empty> : <table><thead><tr><th>Receipt</th><th>Mode</th><th className="right">Paid</th></tr></thead><tbody>{data.fees.payments.map((p: Row) => <tr key={p.receipt_no}><td className="mono">{p.receipt_no}</td><td>{p.payment_mode}</td><td className="right">{inr(p.amount_paid)}</td></tr>)}</tbody></table>}
    </>}
    {tab === 'results' && (data.results.length === 0 ? <Empty>No marks entered yet.</Empty> : data.results.map((r: Row) => <div className="exam-card" key={r.exam_id}>
      <div className="list-item" style={{ paddingTop: 0 }}><b>{r.exam} <span className="muted">({r.academic_year})</span></b><Badge tone="purple">{r.total}/{r.max} · {r.percentage}%</Badge></div>
      <table><tbody>{r.subjects.map((x: Row) => <tr key={x.subject}><td>{x.subject}</td><td className="right">{x.marks_obtained} / {x.max_marks}</td></tr>)}</tbody></table></div>))}
    {canWrite && <div className="modal-actions">
      {['admin', 'clerk'].includes(me.role) && <Btn variant="ghost" onClick={() => setConfirm('reset')}><KeyRound size={15} />Reset password</Btn>}
      <Btn variant="ghost" onClick={() => onEdit(s)}><Pencil size={15} />Edit</Btn>
      {s.is_active && <Btn variant="danger" onClick={() => setConfirm('archive')}><Trash2 size={15} />Archive</Btn>}</div>}
    {confirm === 'reset' && <Confirm title="Reset password?" message={<>A new temporary password will be created for <b>{name}</b>. The old password stops working immediately.</>} confirmLabel="Reset password"
      onClose={() => setConfirm(null)} onConfirm={async () => { try { const r = await api.post(`/students/${id}/reset-password`); setConfirm(null); onCreds({ name, admission_no: r.admission_no, temp_password: r.temp_password }); onClose(); } catch (e) { toast(errMsg(e), 'error'); } }} />}
    {confirm === 'archive' && <Confirm danger title="Archive student?" message={<><b>{name}</b> will be marked as “left” and can no longer log in. Their records (fees, marks, attendance) are kept.</>} confirmLabel="Archive"
      onClose={() => setConfirm(null)} onConfirm={async () => { try { await api.del(`/students/${id}`); toast('Student archived'); onChanged(); onClose(); } catch (e) { toast(errMsg(e), 'error'); } }} />}
  </Modal>;
}

const TEMPLATE = 'first_name,last_name,dob,gender,class,roll_no,parent_name,mother_name,parent_contact,parent_email,address,blood_group,previous_school\nAarav,Singh,2012-05-14,Male,Class 6-A,12,Rajesh Singh,Sunita Singh,9876543210,,Padrauna,B+,\n';

function ImportDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const classes = useCurrentClasses(); const toast = useToast(); const file = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null); const [result, setResult] = useState<Row | null>(null); const [busy, setBusy] = useState(false);
  const byLabel = Object.fromEntries(classes.map(c => [`${c.grade}-${c.section}`.toLowerCase().replace(/\s/g, ''), c.id]));
  const load = async (f?: File) => { if (!f) return; setRows(parseCsv(await f.text())); setResult(null); };
  const build = (r: Row) => ({ first_name: r.first_name, last_name: r.last_name || '', dob: r.dob || null, gender: r.gender || null, class_id: byLabel[(r.class || '').toLowerCase().replace(/\s/g, '')] ?? null, roll_no: r.roll_no || null,
    parent_name: r.parent_name, mother_name: r.mother_name || null, parent_contact: r.parent_contact, parent_email: r.parent_email || null, address: r.address || null, blood_group: r.blood_group || null, previous_school: r.previous_school || null, admission_no: r.student_id || r.admission_no || null });
  const unmatched = rows?.filter(r => r.class && !byLabel[r.class.toLowerCase().replace(/\s/g, '')]).length ?? 0;
  const run = async () => { if (!rows) return; setBusy(true); try { const r = await api.post('/students/import', rows.map(build)); setResult(r); onDone(); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); } };
  return <Modal wide title="Import students from CSV" subtitle="Bring in your existing student list. Each student gets a Student ID and a temporary password." onClose={onClose}>
    {!result && <>
      <div className="note">Required columns: <b>first_name, parent_name, parent_contact</b>. Class must match an existing class of this year, e.g. “Class 6-A”.&nbsp;<button className="link" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' })); a.download = 'students-template.csv'; a.click(); }}>Download template</button></div>
      <input ref={file} type="file" accept=".csv,text/csv" onChange={e => load(e.target.files?.[0])} />
      {rows && <p>{rows.length} rows found. {unmatched > 0 && <span style={{ color: 'var(--amber)' }}>{unmatched} rows have a class that doesn’t exist — they’ll be imported without a class.</span>}</p>}
      <div className="modal-actions"><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn onClick={run} busy={busy} disabled={!rows?.length}>Import {rows?.length ?? 0} students</Btn></div></>}
    {result && <>
      <p><b>{result.created}</b> imported, <b style={{ color: result.failed ? 'var(--red)' : undefined }}>{result.failed}</b> failed.</p>
      <div className="note warn">Temporary passwords are shown only now. Download the list and hand them out; students must change them at first login.</div>
      <div className="table-wrap" style={{ maxHeight: 260 }}><table><thead><tr><th>#</th><th>Name</th><th>Student ID</th><th>Password / error</th></tr></thead><tbody>
        {result.results.map((r: Row) => <tr key={r.row}><td>{r.row}</td><td>{r.name}</td><td className="mono">{r.admission_no ?? '—'}</td><td className="mono" style={{ color: r.ok ? undefined : 'var(--red)' }}>{r.ok ? r.temp_password : r.error}</td></tr>)}</tbody></table></div>
      <div className="modal-actions"><Btn variant="ghost" onClick={() => downloadCsv('student-logins.csv', result.results.filter((r: Row) => r.ok), ['name', 'admission_no', 'temp_password'])}><Download size={15} />Download logins (CSV)</Btn><Btn onClick={onClose}>Done</Btn></div></>}
  </Modal>;
}
