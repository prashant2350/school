import { useEffect, useState, type FormEvent } from 'react';
import { BarChart3, CalendarCheck, CalendarDays, FileQuestion, CheckCircle2, ClipboardList, GraduationCap, Home, LogOut, UserRound, Users } from 'lucide-react';
import { api, fmtDate, fmtDateTime, WEEKDAYS, type Row } from '../api';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Loading, Modal, TimetableGrid, errMsg, useLoad, useToast } from '../ui';
import ClassAttendance from './ClassAttendance';
import Marks from './Marks';
import MyClass from './MyClass';
import Papers from './Papers';
import Insights from '../admin/Insights';

type Tab = 'today' | 'myclass' | 'attendance' | 'timetable' | 'marks' | 'papers' | 'insights' | 'account';

export default function FacultyShell({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('today');
  const [school, setSchool] = useState('School');
  const me = useLoad<Row>(() => api.get('/faculty/me'), []);
  useEffect(() => { api.get('/public/info').then(i => setSchool(i.school_name)).catch(() => {}); }, []);
  if (me.loading && !me.data) return <div style={{ padding: 60 }}><Loading /></div>;
  if (me.error || !me.data) return <div style={{ padding: 40, maxWidth: 520, margin: 'auto' }}><ErrorBox msg={me.error || 'Could not load'} retry={me.reload} /><button className="link" onClick={onLogout}>Back to login</button></div>;
  const m = me.data; const isCT = m.class_teacher_of.length > 0;
  // Attendance is ONLY for class teachers - other faculty never see this tab.
  const tabs: [Tab, string, any][] = [['today', 'Today', Home], ...(isCT ? [['myclass', 'My class', Users] as [Tab, string, any], ['attendance', 'Attendance', CalendarCheck] as [Tab, string, any]] : []), ['timetable', 'Timetable', CalendarDays], ['marks', 'Marks', ClipboardList], ['papers', 'Papers', FileQuestion], ['insights', 'Insights', BarChart3], ['account', 'Account', UserRound]];
  const active = tabs.some(t => t[0] === tab) ? tab : 'today';
  return <div className="fac">
    <header className="fac-top"><div className="in"><div className="brand-mark" style={{ width: 36, height: 36 }}><GraduationCap size={18} /></div>
      <div style={{ flex: 1, minWidth: 0 }}><b style={{ display: 'block', lineHeight: 1.2 }}>{school}</b><span className="muted small">Faculty portal</span></div>
      <Btn variant="ghost" className="btn-sm" onClick={onLogout}><LogOut size={14} />Sign out</Btn></div></header>
    <main className="fac-main">
      {active === 'today' && <Today m={m} go={setTab} reload={me.reload} />}
      {active === 'myclass' && <MyClass classes={m.class_teacher_of} />}
      {active === 'attendance' && <ClassAttendance classes={m.class_teacher_of} onSaved={me.reload} />}
      {active === 'timetable' && <MyTimetable />}
      {active === 'marks' && <Marks assignments={m.assignments} />}
      {active === 'papers' && <Papers />}
      {active === 'insights' && <Insights />}
      {active === 'account' && <Account m={m} />}
    </main>
    <nav className="fac-nav" aria-label="Main">{tabs.map(([k, l, I]) => <button key={k} className={active === k ? 'on' : ''} onClick={() => setTab(k)}><I size={20} />{l}</button>)}</nav>
    {m.must_change_password && <ForcePassword onDone={me.reload} />}
  </div>;
}

function Today({ m, go, reload }: { m: Row; go: (t: Tab) => void; reload: () => void }) {
  const toast = useToast(); const [busy, setBusy] = useState(false);
  const mark = async () => { setBusy(true); try { await api.post('/faculty/my-attendance'); toast('Your attendance is marked for today'); reload(); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); } };
  const sa = m.my_attendance_today;
  return <>
    <div style={{ marginBottom: 14 }}><h2 style={{ fontSize: 22 }}>Hello, {m.name.split(' ')[0]}</h2><p className="muted" style={{ margin: '2px 0 0' }}>{fmtDate(m.today)} · {m.employee_id}{m.designation ? ` · ${m.designation}` : ''}</p></div>
    {sa ? <div className="cta done"><h3><CheckCircle2 size={18} style={{ verticalAlign: -3 }} /> Your attendance: {sa.status.replace('_', ' ')}</h3><p style={{ margin: 0 }}>Marked at {sa.marked_at ? fmtDateTime(sa.marked_at) : 'today'}</p></div>
      : <div className="cta"><h3>Mark your attendance</h3><p>Tap once when you arrive. You only do this once a day.</p><button className="btn" disabled={busy} onClick={mark}>I am present today</button></div>}
    {m.class_teacher_of.map((k: Row) => <div key={k.id} className={`cta ${k.marked_today ? 'done' : ''}`}>
      <h3>{k.label} · class teacher</h3>
      <p>{k.marked_today ? `Today's attendance is taken (${k.marked_count} of ${k.students} students).` : `Attendance not taken yet · ${k.students} students. Please take it in your first period.`}</p>
      <button className="btn" onClick={() => go('attendance')}>{k.marked_today ? 'Review / edit attendance' : 'Take attendance now'}</button></div>)}
    <Card title={`Today's periods (${m.weekday})`}>{m.today_periods.length === 0 ? <Empty>{m.weekday === 'Sun' ? 'No classes on Sunday.' : 'No periods are set for you today.'}</Empty> :
      m.today_periods.map((p: Row) => <div key={p.period_no} className="period"><i>{p.period_no}</i><div><b>{p.class_label}</b><div className="muted small">{p.subject}</div></div></div>)}</Card>
    <Card title="My classes & subjects">{m.assignments.length === 0 ? <Empty>The admin has not assigned any subject to you yet.</Empty> :
      m.assignments.map((a: Row) => <div key={a.id} className="list-item"><b>{a.class_label}</b><Badge tone="purple">{a.subject}</Badge></div>)}</Card>
  </>;
}

function MyTimetable() {
  const { data, loading, error, reload } = useLoad<Row>(() => api.get('/faculty/timetable'), []);
  if (loading) return <Loading />; if (error || !data) return <ErrorBox msg={error} retry={reload} />;
  const today = new Date().getDay() - 1;
  return <Card title="My weekly timetable">{data.slots.length === 0 ? <Empty>Your timetable has not been set yet.</Empty> :
    <TimetableGrid periods={data.periods} days={WEEKDAYS} highlightDay={today} cell={(d, p) => { const s = data.slots.find((x: Row) => x.weekday === d && x.period_no === p); return s ? <><b>{s.class_label}</b><small>{s.subject}</small></> : null; }} />}</Card>;
}

function Account({ m }: { m: Row }) {
  const att = useLoad<Row>(() => api.get('/faculty/my-attendance'), []);
  const [pw, setPw] = useState(false);
  return <>
    <Card title="My details" actions={<Btn variant="ghost" onClick={() => setPw(true)}>Change password</Btn>}>
      <dl className="kv"><dt>Name</dt><dd>{m.name}</dd><dt>Employee ID</dt><dd className="mono">{m.employee_id ?? '—'}</dd><dt>Designation</dt><dd>{m.designation ?? '—'}</dd></dl></Card>
    <Card title="My attendance" actions={att.data && <Badge tone="green">{att.data.month_present} days this month</Badge>}>
      {att.loading ? <Loading /> : !att.data?.records.length ? <Empty>No attendance marked yet.</Empty> :
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Status</th></tr></thead><tbody>{att.data.records.slice(0, 31).map((r: Row) => <tr key={r.date}><td>{fmtDate(r.date)}</td><td><Badge tone={r.status === 'present' ? 'green' : r.status === 'absent' ? 'red' : 'amber'}>{r.status.replace('_', ' ')}</Badge></td></tr>)}</tbody></table></div>}</Card>
    {pw && <PasswordForm onClose={() => setPw(false)} onDone={() => setPw(false)} />}
  </>;
}

function PasswordForm({ onClose, onDone, forced }: { onClose?: () => void; onDone: () => void; forced?: boolean }) {
  const toast = useToast(); const [f, setF] = useState({ current_password: '', new_password: '', confirm: '' }); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); if (f.new_password !== f.confirm) return toast('New passwords do not match', 'error'); setBusy(true);
    try { await api.post('/auth/change-password', { current_password: f.current_password, new_password: f.new_password }); toast('Password changed'); onDone(); } catch (err) { toast(errMsg(err), 'error'); setBusy(false); } };
  return <Modal title={forced ? 'Choose a new password' : 'Change password'} subtitle={forced ? 'Replace the temporary password the school gave you.' : undefined} onClose={onClose ?? (() => {})}>
    <form onSubmit={submit}><Field label="Current (temporary) password" required><input required type="password" autoComplete="current-password" autoFocus value={f.current_password} onChange={e => setF({ ...f, current_password: e.target.value })} /></Field>
      <Field label="New password" required hint="At least 8 characters"><input required minLength={8} type="password" autoComplete="new-password" value={f.new_password} onChange={e => setF({ ...f, new_password: e.target.value })} /></Field>
      <Field label="Confirm new password" required><input required type="password" autoComplete="new-password" value={f.confirm} onChange={e => setF({ ...f, confirm: e.target.value })} /></Field>
      <div className="modal-actions">{!forced && <Btn type="button" variant="ghost" onClick={onClose}>Cancel</Btn>}<Btn type="submit" busy={busy}>Save password</Btn></div></form></Modal>;
}
const ForcePassword = ({ onDone }: { onDone: () => void }) => <PasswordForm forced onDone={onDone} />;
