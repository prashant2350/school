import { useEffect, useState } from 'react';
import { Phone, Save } from 'lucide-react';
import { api, fmtDate, todayISO, type Row } from '../api';
import { Btn, Card, Empty, ErrorBox, Field, Loading, errMsg, useToast } from '../ui';

const OPTS = [['present', 'P', 'p'], ['absent', 'A', 'a'], ['leave', 'L', 'l'], ['half_day', 'H', 'h']] as const;

/** Taken ONCE a day, in the first period, by the class teacher. Nobody else sees this screen. */
export default function ClassAttendance({ classes, onSaved }: { classes: Row[]; onSaved: () => void }) {
  const toast = useToast();
  const [classId, setClassId] = useState(String(classes[0].id));
  const [rows, setRows] = useState<Row[] | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  useEffect(() => {
    let live = true; setRows(null); setError(''); setDirty(false);
    api.get('/attendance/class-sheet', { class_id: classId, attendance_date: todayISO() }).then(r => live && setRows(r)).catch(e => live && setError(errMsg(e)));
    return () => { live = false; };
  }, [classId]);
  const set = (id: number, status: string) => { setRows(r => r!.map(x => (x.student_id === id ? { ...x, status } : x))); setDirty(true); };
  const allPresent = () => { setRows(r => r!.map(x => ({ ...x, status: x.status ?? 'present' }))); setDirty(true); };
  const count = (s: string) => rows?.filter(r => r.status === s).length ?? 0;
  const unmarked = rows?.filter(r => !r.status).length ?? 0;
  const save = async () => {
    if (unmarked) return toast(`${unmarked} student(s) not marked. Tap "All present" first, then mark the absentees.`, 'error');
    setBusy(true);
    try { const r = await api.post('/attendance/bulk', { class_id: Number(classId), attendance_date: todayISO(), records: rows!.map(x => ({ student_id: x.student_id, status: x.status })) });
      toast(`Attendance saved for ${r.saved} students`); setDirty(false); onSaved(); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return <>
    <div style={{ marginBottom: 12 }}><h2 style={{ fontSize: 21 }}>Class attendance</h2><p className="muted" style={{ margin: '2px 0 0' }}>{fmtDate(todayISO())} · taken once, in your first period</p></div>
    {classes.length > 1 && <Field label="Class"><select value={classId} onChange={e => setClassId(e.target.value)}>{classes.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>}
    {error && <ErrorBox msg={error} />}
    {!rows ? (error ? null : <Loading />) : rows.length === 0 ? <Card><Empty>No students in this class yet.</Empty></Card> : <>
      <Card>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
          <Btn variant="soft" onClick={allPresent}>All present</Btn>
          <span className="muted small">Tap <b>A</b> for the students who are absent. P present · A absent · L leave · H half-day</span></div>
        {rows.map(r => <div key={r.student_id} className={`mark-row ${r.status === 'absent' ? 'absent' : ''}`}>
          <div className="who"><b>{r.roll_no ? `${r.roll_no}. ` : ''}{r.name}</b>
            <span className="muted small">{r.admission_no}{r.status === 'absent' && r.parent_contact ? <> · <a className="link" href={`tel:${r.parent_contact}`}><Phone size={11} style={{ verticalAlign: -1 }} /> call parent</a></> : null}</span></div>
          <div className="att-btns att-lg">{OPTS.map(([v, l, c]) => <button key={v} className={`${c} ${r.status === v ? 'on' : ''}`} aria-pressed={r.status === v} aria-label={`${v.replace('_', ' ')} for ${r.name}`} onClick={() => set(r.student_id, v)}>{l}</button>)}</div></div>)}
      </Card>
      <div className="savebar"><span className="small"><b>{count('present')}</b> present · <b style={{ color: 'var(--red)' }}>{count('absent')}</b> absent · {count('leave') + count('half_day')} leave/half{unmarked ? <> · <b style={{ color: 'var(--amber)' }}>{unmarked} unmarked</b></> : null}</span>
        <Btn onClick={save} busy={busy} disabled={!dirty && unmarked === 0}><Save size={16} />Save</Btn></div></>}
  </>;
}
