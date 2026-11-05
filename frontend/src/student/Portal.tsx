import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BarChart3, Bell, Bus, KeyRound, CalendarCheck, ChevronDown, Download, FileText, GraduationCap, Home, LogOut, Megaphone, Menu, Trash2, Upload, UserRound, Users, Wallet } from 'lucide-react';
import { api, downloadFile, fetchBlob, fmtDate, fmtDateTime, fmtTime, inr, shrinkImage, WEEKDAYS, type Row } from '../api';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Loading, Modal, PhotoAvatar, TimetableGrid, errMsg, useLoad, useToast } from '../ui';
import TransportTab from './Transport';
import AnswerKey from './AnswerKey';
import Progress from './Progress';

const TABS = [['home', 'Home', Home], ['teachers', 'My teachers', Users], ['transport', 'School bus', Bus], ['attendance', 'Attendance', CalendarCheck], ['fees', 'Fees', Wallet], ['answers', 'Answer key', KeyRound], ['progress', 'My progress', BarChart3], ['results', 'Results', FileText], ['notices', 'Notices', Megaphone], ['profile', 'Profile', UserRound]] as const;
type Tab = typeof TABS[number][0];
const tone = (s: string) => (s === 'present' ? 'green' : s === 'absent' ? 'red' : s === 'half_day' ? 'amber' : 'blue');

export default function Portal({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('home'); const [open, setOpen] = useState(false);
  const [school, setSchool] = useState('School');
  const me = useLoad<Row>(() => api.get('/portal/me'), []);
  useEffect(() => { api.get('/public/info').then(i => setSchool(i.school_name)).catch(() => {}); }, []);
  const [photo, setPhoto] = useState<string | null>(null);
  const hasPhoto = me.data?.has_photo;
  useEffect(() => { let url: string | null = null; if (!hasPhoto) { setPhoto(null); return; } fetchBlob('/portal/photo').then(b => { url = URL.createObjectURL(b); setPhoto(url); }).catch(() => setPhoto(null)); return () => { if (url) URL.revokeObjectURL(url); }; }, [hasPhoto, me.data?.id]);
  if (me.loading && !me.data) return <div style={{ padding: 60 }}><Loading /></div>;
  if (me.error || !me.data) return <div style={{ padding: 40, maxWidth: 520, margin: 'auto' }}><ErrorBox msg={me.error} retry={me.reload} /><button className="link" onClick={onLogout}>Back to login</button></div>;
  const m = me.data;
  const idx = Math.max(0, TABS.findIndex(t => t[0] === tab));
  const choose = (k: Tab, e: React.MouseEvent<HTMLButtonElement>) => {
    const b = e.currentTarget; const r = b.getBoundingClientRect(); const dot = document.createElement('span');
    dot.className = 'ripple'; dot.style.left = `${e.clientX - r.left}px`; dot.style.top = `${e.clientY - r.top}px`;
    b.appendChild(dot); setTimeout(() => dot.remove(), 650);
    setTab(k); setOpen(false); window.scrollTo({ top: 0 });
  };
  return <div className={`theme-${m.theme || 'purple'} pshell`}>
    <aside className={`pside ${open ? 'open' : ''}`} aria-label="Student menu">
      <div className="pside-brand"><span className="plogo"><img src="/logo.png" alt="" /></span><b>{school}</b></div>
      <nav className="pnav" aria-label="Student sections">
        <i className="pnav-pill" style={{ transform: `translateY(${idx * 54}px)` }} aria-hidden="true" />
        {TABS.map(([k, l, I]) => <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={e => choose(k, e)}><span className="pico"><I size={19} /></span><span>{l}</span></button>)}
      </nav>
      <div className="pside-foot"><PhotoAvatar name={m.name} src={photo} size={38} /><div className="who"><b>{m.name}</b><span>{m.class}</span></div>
        <button className="icon-btn" aria-label="Sign out" title="Sign out" onClick={onLogout}><LogOut size={18} /></button></div>
    </aside>
    {open && <div className="pscrim" onClick={() => setOpen(false)} />}
    <div className="pbody">
      <div className="ptop-m"><button className="icon-btn" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={22} /></button><img src="/logo.png" alt="" width={30} height={30} /><b>{school}</b></div>
      <main className="portal-main" key={tab}>
        {tab === 'home' && <Home_ m={m} go={setTab} photo={photo} />}{tab === 'teachers' && <Teachers />}{tab === 'transport' && <TransportTab />}{tab === 'answers' && <AnswerKey />}{tab === 'progress' && <Progress />}{tab === 'attendance' && <Att />}{tab === 'fees' && <Fees_ />}{tab === 'results' && <Results m={m} />}{tab === 'notices' && <Notices_ />}{tab === 'profile' && <Profile m={m} photo={photo} reload={me.reload} />}
      </main>
    </div>
    {m.must_change_password && <ForcePassword onDone={me.reload} />}
  </div>;
}

function Home_({ m, go, photo }: { m: Row; go: (t: Tab) => void; photo: string | null }) {
  const notices = useLoad<Row[]>(() => api.get('/portal/notices'), []);
  return <>
    <div className="hero"><PhotoAvatar name={m.name} src={photo} size={64} /><div><h2>Hello, {m.name.split(' ')[0]}!</h2><p>{m.class} · Student ID {m.admission_no}{m.roll_no ? ` · Roll ${m.roll_no}` : ''}</p>{m.class_teacher && <p>Class teacher: {m.class_teacher}</p>}{m.bio && <p style={{ fontStyle: 'italic' }}>“{m.bio}”</p>}</div></div>
    <div className="grid g3" style={{ marginBottom: 20 }}>
      <div className="stat" role="button" onClick={() => go('attendance')} style={{ cursor: 'pointer' }}><div className="ico t-green"><CalendarCheck size={22} /></div><div><b>{m.attendance.percentage == null ? '—' : `${m.attendance.percentage}%`}</b><span>Attendance ({m.attendance.total_days} days)</span></div></div>
      <div className="stat" role="button" onClick={() => go('fees')} style={{ cursor: 'pointer' }}><div className="ico t-red"><Wallet size={22} /></div><div><b>{inr(m.balance)}</b><span>{Number(m.balance) > 0 ? 'Fees pending' : 'No fees pending'}</span></div></div>
      <div className="stat"><div className="ico t-purple"><GraduationCap size={22} /></div><div><b>{m.class}</b><span>Current class</span></div></div>
    </div>
    {m.transport && <div className="note" role="button" onClick={() => go('transport')} style={{ cursor: 'pointer' }}><Bus size={16} /><span>Your bus is <b>Bus {m.transport.bus_number}</b>{m.transport.pickup_time && <> · it reaches {m.transport.stop ?? 'your stop'} at about <b>{fmtTime(m.transport.pickup_time)}</b></>}{m.transport.school_arrival_time && <> and school at <b>{fmtTime(m.transport.school_arrival_time)}</b></>}.</span></div>}
    <Card title="Latest notices" actions={<button className="link" onClick={() => go('notices')}>View all</button>}>{notices.loading ? <Loading /> : !notices.data?.length ? <Empty>No notices right now.</Empty> : <div className="nlist">{notices.data.slice(0, 3).map((n, i) => <NoticeCard key={n.id} n={n} i={i} />)}</div>}</Card>
  </>;
}

function Att() {
  const { data, loading, error, reload } = useLoad(() => api.get('/portal/attendance'), []);
  if (loading) return <Loading />; if (error || !data) return <ErrorBox msg={error} retry={reload} />;
  const s = data.summary;
  return <><div className="grid g4" style={{ marginBottom: 20 }}>{[['Percentage', s.percentage == null ? '—' : `${s.percentage}%`], ['Present', s.present], ['Absent', s.absent], ['Leave / half-day', s.leave + s.half_day]].map(([l, v]) => <div className="stat" key={l as string}><div><b>{v}</b><span>{l}</span></div></div>)}</div>
    <Card title="Daily record">{data.records.length === 0 ? <Empty>No attendance recorded yet.</Empty> : <div className="table-wrap"><table><thead><tr><th>Date</th><th>Status</th><th>Remarks</th></tr></thead><tbody>{data.records.map((r: Row) => <tr key={r.date}><td>{fmtDate(r.date)}</td><td><Badge tone={tone(r.status)}>{r.status.replace('_', ' ')}</Badge></td><td>{r.remarks ?? ''}</td></tr>)}</tbody></table></div>}</Card></>;
}

function Fees_() {
  const { data, loading, error, reload } = useLoad(() => api.get('/portal/fees'), []);
  if (loading) return <Loading />; if (error || !data) return <ErrorBox msg={error} retry={reload} />;
  return <><div className="stat" style={{ marginBottom: 20 }}><div className={`ico ${Number(data.balance) > 0 ? 't-red' : 't-green'}`}><Wallet size={22} /></div><div><b>{inr(data.balance)}</b><span>{Number(data.balance) > 0 ? 'Total pending — please pay at the school office' : 'All fees are clear'}</span></div></div>
    <Card title="Fees charged">{data.dues.length === 0 ? <Empty>No fees charged yet.</Empty> : <div className="table-wrap"><table><thead><tr><th>Fee</th><th>Period</th><th>Due date</th><th className="right">Amount</th></tr></thead><tbody>{data.dues.map((d: Row) => <tr key={d.id}><td>{d.fee_head}</td><td>{d.period}</td><td>{fmtDate(d.due_date)}</td><td className="right">{inr(Number(d.amount_due) - Number(d.discount))}</td></tr>)}</tbody></table></div>}</Card>
    <Card title="Payments & receipts">{data.payments.length === 0 ? <Empty>No payments yet.</Empty> : <div className="table-wrap"><table><thead><tr><th>Receipt</th><th>Date</th><th>Mode</th><th className="right">Paid</th></tr></thead><tbody>{data.payments.map((p: Row) => <tr key={p.receipt_no}><td className="mono">{p.receipt_no}</td><td>{fmtDateTime(p.paid_at)}</td><td style={{ textTransform: 'capitalize' }}>{p.payment_mode}</td><td className="right">{inr(p.amount_paid)}</td></tr>)}</tbody></table></div>}</Card></>;
}

function Results({ m }: { m: Row }) {
  const toast = useToast(); const [busy, setBusy] = useState<number | null>(null);
  const { data, loading, error, reload } = useLoad<Row[]>(() => api.get('/portal/results'), []);
  if (loading) return <Loading />; if (error || !data) return <ErrorBox msg={error} retry={reload} />;
  if (!data.length) return <Card><Empty>No results published yet. They appear here as soon as the school publishes them.</Empty></Card>;
  const pdf = async (r: Row) => { setBusy(r.exam_id); try { await downloadFile(`/portal/results/${r.exam_id}/pdf`, `report-card-${m.admission_no}-${r.exam_id}.pdf`); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(null); } };
  return <>{data.map(r => <Card key={r.exam_id} title={`${r.exam} · ${r.academic_year}`} actions={<><Badge tone="purple">{r.total}/{r.max} · {r.percentage}% · Grade {r.grade}</Badge> <Btn className="btn-sm" busy={busy === r.exam_id} onClick={() => pdf(r)}><Download size={14} />Download PDF</Btn></>}>
    <div className="table-wrap"><table><thead><tr><th>Subject</th><th className="right">Marks</th><th className="right">Out of</th><th className="right">Grade</th></tr></thead><tbody>{r.subjects.map((x: Row) => <tr key={x.subject}><td>{x.subject}</td><td className="right"><b>{x.marks_obtained}</b></td><td className="right">{x.max_marks}</td><td className="right">{x.grade}</td></tr>)}</tbody></table></div></Card>)}</>;
}

function Teachers() {
  const { data, loading, error, reload } = useLoad<Row>(() => api.get('/portal/teachers'), []);
  if (loading) return <Loading />; if (error || !data) return <ErrorBox msg={error} retry={reload} />;
  const today = new Date().getDay() - 1;
  return <>
    <Card title={`My teachers · ${data.class ?? ''}`} actions={data.class_teacher && <Badge tone="purple">Class teacher: {data.class_teacher}</Badge>}>
      {!data.subjects.length ? <Empty>Your teachers will be listed here once the school sets up your class.</Empty> :
        <div className="table-wrap"><table><thead><tr><th>Subject</th><th>Teacher</th><th>Periods</th></tr></thead><tbody>{data.subjects.map((x: Row) => <tr key={x.subject}><td><b>{x.subject}</b></td><td>{x.teacher}{x.teacher_phone && <div className="muted small">{x.teacher_phone}</div>}</td><td className="muted small">{x.periods.join(', ') || '—'}</td></tr>)}</tbody></table></div>}
    </Card>
    {data.attendance && <div className="note"><CalendarCheck size={16} />Attendance is taken once a day by your class teacher. Your overall attendance: <b>{data.attendance.percentage == null ? '—' : `${data.attendance.percentage}%`}</b> ({data.attendance.present} of {data.attendance.total_days} days present).</div>}
    {data.slots.length > 0 && <Card title="Class timetable"><TimetableGrid periods={data.periods} days={WEEKDAYS} highlightDay={today} cell={(d, p) => { const s = data.slots.find((x: Row) => x.weekday === d && x.period_no === p); return s ? <><b>{s.subject}</b><small>{s.teacher}</small></> : null; }} /></Card>}
  </>;
}

const NCOL = ['#6f63e0', '#2f78c4', '#1f9a7c', '#d6455d', '#c27a12'];
const ago = (iso: string) => { const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d < 7 ? `${d} days ago` : fmtDate(iso); };

/** One notice: slides in, shows a colour accent and a "New" tag, and opens smoothly when the text is long. */
function NoticeCard({ n, i }: { n: Row; i: number }) {
  const [open, setOpen] = useState(false);
  const long = n.body.length > 120 || n.body.includes('\n');
  const isNew = Date.now() - new Date(n.created_at).getTime() < 3 * 86400000;
  const c = NCOL[i % NCOL.length];
  return <article className={`ncard ${open ? 'open' : ''}`} style={{ ['--nc' as string]: c, animationDelay: `${i * 70}ms` }}>
    <button className="nhead" aria-expanded={long ? open : undefined} disabled={!long} onClick={() => setOpen(!open)}>
      <span className="nbell"><Bell size={18} /></span>
      <span className="nmain"><b>{n.title}</b>{!open && <span className="nprev">{n.body}</span>}</span>
      <span className="nmeta">{isNew && <span className="nnew">New</span>}<span className="muted small nowrap" title={fmtDateTime(n.created_at)}>{ago(n.created_at)}</span></span>
      {long && <ChevronDown className="nchev" size={18} />}
    </button>
    <div className="nfull"><div><p>{n.body}</p></div></div>
  </article>;
}

function Notices_() {
  const { data, loading, error, reload } = useLoad<Row[]>(() => api.get('/portal/notices'), []);
  if (loading) return <Loading />; if (error || !data) return <ErrorBox msg={error} retry={reload} />;
  return !data.length ? <Card><Empty>No notices right now.</Empty></Card> : <div className="nlist">{data.map((n, i) => <NoticeCard key={n.id} n={n} i={i} />)}</div>;
}

const THEMES: [string, string][] = [['purple', '#6f63e0'], ['blue', '#2f78c4'], ['green', '#1f9a7c'], ['teal', '#0f8b9d'], ['amber', '#c27a12'], ['rose', '#d6455d']];

function Profile({ m, photo, reload }: { m: Row; photo: string | null; reload: () => void }) {
  const toast = useToast(); const file = useRef<HTMLInputElement>(null);
  const [pw, setPw] = useState(false); const [busy, setBusy] = useState(false); const [photoBusy, setPhotoBusy] = useState(false);
  const [f, setF] = useState({ phone: m.phone ?? '', email: m.email ?? '', address: m.address ?? '', bio: m.bio ?? '' });
  const save = async (e: FormEvent) => { e.preventDefault(); setBusy(true); try { await api.patch('/portal/profile', { phone: f.phone, email: f.email || null, address: f.address, bio: f.bio }); toast('Profile saved'); reload(); } catch (err) { toast(errMsg(err), 'error'); } finally { setBusy(false); } };
  const theme = async (t: string) => { try { await api.patch('/portal/profile', { theme: t }); reload(); } catch (err) { toast(errMsg(err), 'error'); } };
  const pick = async (file_?: File) => { if (!file_) return; setPhotoBusy(true); try { const blob = await shrinkImage(file_); const fd = new FormData(); fd.append('file', blob, 'photo.jpg'); await api.upload('/portal/photo', fd); toast('Photo updated'); reload(); } catch (err) { toast(errMsg(err), 'error'); } finally { setPhotoBusy(false); if (file.current) file.current.value = ''; } };
  const removePhoto = async () => { try { await api.del('/portal/photo'); reload(); } catch (err) { toast(errMsg(err), 'error'); } };
  return <>
    <Card title="My profile" actions={<Btn variant="ghost" onClick={() => setPw(true)}>Change password</Btn>}>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <PhotoAvatar name={m.name} src={photo} size={84} />
        <div><b style={{ fontSize: 18 }}>{m.name}</b><div className="muted small">{m.class} · {m.admission_no}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}><Btn variant="soft" className="btn-sm" busy={photoBusy} onClick={() => file.current?.click()}><Upload size={14} />{photo ? 'Change photo' : 'Add photo'}</Btn>{photo && <Btn variant="ghost" className="btn-sm" onClick={removePhoto}><Trash2 size={14} />Remove</Btn>}</div>
          <input ref={file} type="file" accept="image/*" hidden onChange={e => pick(e.target.files?.[0])} /></div></div>
      <form onSubmit={save}>
        <div className="row2"><Field label="My mobile number"><input type="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} maxLength={20} /></Field><Field label="My email"><input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field></div>
        <Field label="Address"><textarea rows={2} value={f.address} onChange={e => setF({ ...f, address: e.target.value })} maxLength={500} /></Field>
        <Field label="About me" hint="A short line shown on your home page (max 300 characters)"><input value={f.bio} onChange={e => setF({ ...f, bio: e.target.value })} maxLength={300} placeholder="I love cricket and maths" /></Field>
        <Btn type="submit" busy={busy}>Save changes</Btn></form>
    </Card>
    <Card title="Portal colour"><div className="swatches">{THEMES.map(([k, c]) => <button key={k} className={`swatch ${(m.theme || 'purple') === k ? 'on' : ''}`} style={{ background: c }} aria-label={`${k} theme`} aria-pressed={(m.theme || 'purple') === k} onClick={() => theme(k)} />)}</div></Card>
    <Card title="School records"><dl className="kv"><dt>Student ID</dt><dd className="mono">{m.admission_no}</dd><dt>Class</dt><dd>{m.class}{m.roll_no ? ` · Roll ${m.roll_no}` : ''}</dd><dt>Class teacher</dt><dd>{m.class_teacher ?? '—'}</dd><dt>Date of birth</dt><dd>{fmtDate(m.dob)}</dd><dt>Gender</dt><dd>{m.gender ?? '—'}</dd><dt>Blood group</dt><dd>{m.blood_group ?? '—'}</dd>
      <dt>School bus</dt><dd>{m.transport ? `Bus ${m.transport.bus_number}${m.transport.stop ? ` · ${m.transport.stop}` : ''}${m.transport.pickup_time ? ` · pickup ${fmtTime(m.transport.pickup_time)}` : ''}` : 'Not allotted'}</dd><dt>Father / guardian</dt><dd>{m.parent_name}</dd><dt>Mother</dt><dd>{m.mother_name ?? '—'}</dd><dt>Parent mobile</dt><dd>{m.parent_contact}</dd></dl>
      <p className="muted small" style={{ marginBottom: 0 }}>Name, class, date of birth and parent details are kept by the school office. Ask them if something needs correcting.</p></Card>
    <Card title="Class history"><table><thead><tr><th>Academic year</th><th>Class</th><th>Result</th></tr></thead><tbody>{m.history.map((h: Row) => <tr key={h.academic_year}><td>{h.academic_year}</td><td>{h.class}</td><td><Badge tone={h.result === 'studying' ? 'purple' : 'gray'}>{h.result.replace('_', ' ')}</Badge></td></tr>)}</tbody></table></Card>
    {pw && <PasswordForm onClose={() => setPw(false)} onDone={() => setPw(false)} />}</>;
}

function PasswordForm({ onClose, onDone, forced }: { onClose?: () => void; onDone: () => void; forced?: boolean }) {
  const toast = useToast(); const [f, setF] = useState({ current_password: '', new_password: '', confirm: '' }); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); if (f.new_password !== f.confirm) return toast('New passwords do not match', 'error'); setBusy(true);
    try { await api.post('/portal/change-password', { current_password: f.current_password, new_password: f.new_password }); toast('Password changed'); onDone(); } catch (err) { toast(errMsg(err), 'error'); setBusy(false); } };
  return <Modal title={forced ? 'Choose a new password' : 'Change password'} subtitle={forced ? 'For your safety, replace the temporary password given by the school.' : undefined} onClose={onClose ?? (() => {})}>
    <form onSubmit={submit}><Field label="Current (temporary) password" required><input required type="password" autoComplete="current-password" autoFocus value={f.current_password} onChange={e => setF({ ...f, current_password: e.target.value })} /></Field>
      <Field label="New password" required hint="At least 8 characters"><input required minLength={8} type="password" autoComplete="new-password" value={f.new_password} onChange={e => setF({ ...f, new_password: e.target.value })} /></Field>
      <Field label="Confirm new password" required><input required type="password" autoComplete="new-password" value={f.confirm} onChange={e => setF({ ...f, confirm: e.target.value })} /></Field>
      <div className="modal-actions">{!forced && <Btn type="button" variant="ghost" onClick={onClose}>Cancel</Btn>}<Btn type="submit" busy={busy}>Save password</Btn></div></form></Modal>;
}
const ForcePassword = ({ onDone }: { onDone: () => void }) => <PasswordForm forced onDone={onDone} />;
