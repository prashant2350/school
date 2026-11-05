import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { api, todayISO, type Row } from '../api';
import { Btn, Card, Empty, ErrorBox, Field, Loading, PageHead, errMsg, useToast } from '../ui';
import { useCurrentClasses } from './data';

const OPTS = [['present', 'P', 'p'], ['absent', 'A', 'a'], ['half_day', 'H', 'h'], ['leave', 'L', 'l']] as const;

export default function Attendance() {
  const classes = useCurrentClasses(); const toast = useToast();
  const [classId, setClassId] = useState(String(classes[0]?.id ?? '')); const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState<Row[] | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!classId) return; let live = true; setRows(null); setError(''); setDirty(false);
    api.get('/attendance/class-sheet', { class_id: classId, attendance_date: date }).then(r => live && setRows(r)).catch(e => live && setError(errMsg(e)));
    return () => { live = false; };
  }, [classId, date]);
  const set = (id: number, status: string) => { setRows(r => r!.map(x => (x.student_id === id ? { ...x, status } : x))); setDirty(true); };
  const all = (status: string) => { setRows(r => r!.map(x => ({ ...x, status }))); setDirty(true); };
  const save = async () => {
    const records = rows!.filter(r => r.status).map(r => ({ student_id: r.student_id, status: r.status }));
    if (!records.length) return toast('Mark at least one student first', 'error');
    setBusy(true); try { const r = await api.post('/attendance/bulk', { class_id: Number(classId), attendance_date: date, records }); toast(`Attendance saved for ${r.saved} students`); setDirty(false); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  const count = (s: string) => rows?.filter(r => r.status === s).length ?? 0;
  return <>
    <PageHead title="Attendance" sub="Class teachers take attendance from their own portal each morning. Use this page to take or correct any class or past date." />
    <Card>
      <div className="toolbar"><Field label="Class"><select value={classId} onChange={e => setClassId(e.target.value)}>{classes.length === 0 && <option value="">No classes</option>}{classes.map(c => <option key={c.id} value={c.id}>{c.grade}-{c.section}</option>)}</select></Field>
        <Field label="Date"><input type="date" max={todayISO()} value={date} onChange={e => setDate(e.target.value)} /></Field></div>
      {error && <ErrorBox msg={error} />}
      {!classId ? <Empty>Add classes first (Classes & years).</Empty> : !rows ? (error ? null : <Loading />) : rows.length === 0 ? <Empty>No students in this class.</Empty> : <>
        <div className="toolbar"><Btn variant="soft" className="btn-sm" onClick={() => all('present')}>Mark all present</Btn><span className="muted small">Present {count('present')} · Absent {count('absent')} · Half-day {count('half_day')} · Leave {count('leave')} · Unmarked {rows.filter(r => !r.status).length}</span></div>
        <div className="table-wrap"><table><thead><tr><th>Roll</th><th>Student</th><th>Status <span className="muted" style={{ textTransform: 'none' }}>(P present · A absent · H half-day · L leave)</span></th></tr></thead><tbody>
          {rows.map(r => <tr key={r.student_id}><td>{r.roll_no ?? '—'}</td><td><b>{r.name}</b><div className="muted small mono">{r.admission_no}</div></td>
            <td><div className="att-btns">{OPTS.map(([v, l, c]) => <button key={v} className={`${c} ${r.status === v ? 'on' : ''}`} aria-pressed={r.status === v} title={v.replace('_', ' ')} aria-label={`${v.replace('_', ' ')} for ${r.name}`} onClick={() => set(r.student_id, v)}>{l}</button>)}</div></td></tr>)}
        </tbody></table></div>
        <div className="modal-actions"><Btn onClick={save} busy={busy} disabled={!dirty}><Save size={16} />Save attendance</Btn></div></>}
    </Card>
  </>;
}
