import { useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import { api, todayISO, type Row } from '../api';
import { Badge, Card, Empty, ErrorBox, Field, Loading, errMsg } from '../ui';

/** The class teacher's own class: every student, with parent contact and today's attendance. Only class teachers see this tab. */
export default function MyClass({ classes }: { classes: Row[] }) {
  const [classId, setClassId] = useState(String(classes[0].id));
  const [rows, setRows] = useState<Row[] | null>(null); const [error, setError] = useState(''); const [q, setQ] = useState('');
  useEffect(() => {
    let live = true; setRows(null); setError('');
    api.get('/attendance/class-sheet', { class_id: classId, attendance_date: todayISO() }).then(r => live && setRows(r)).catch(e => live && setError(errMsg(e)));
    return () => { live = false; };
  }, [classId]);
  const cls = classes.find(c => String(c.id) === classId) ?? classes[0];
  const shown = (rows ?? []).filter(r => !q.trim() || `${r.name} ${r.admission_no} ${r.roll_no ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  return <>
    <div style={{ marginBottom: 12 }}><h2 style={{ fontSize: 21 }}>My class · {cls.label}</h2><p className="muted" style={{ margin: '2px 0 0' }}>You are the class teacher. {rows ? `${rows.length} students.` : ''}</p></div>
    {classes.length > 1 && <Field label="Class"><select value={classId} onChange={e => setClassId(e.target.value)}>{classes.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>}
    {error && <ErrorBox msg={error} />}
    {!rows ? (error ? null : <Loading />) : rows.length === 0 ? <Card><Empty>No students are in this class yet. The admin adds them under Students.</Empty></Card> : <>
      <input aria-label="Search students" placeholder="Search by name, ID or roll no." value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 10 }} />
      <Card>{shown.map(r => <div key={r.student_id} className="list-item" style={{ alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}><b>{r.roll_no ? `${r.roll_no}. ` : ''}{r.name}</b>
          <div className="muted small">{r.admission_no}{r.parent_name ? ` · ${r.parent_name}` : ''}</div>
          {r.parent_contact && <a className="link small" href={`tel:${r.parent_contact}`}><Phone size={11} style={{ verticalAlign: -1 }} /> {r.parent_contact}</a>}</div>
        {r.status ? <Badge tone={r.status === 'present' ? 'green' : r.status === 'absent' ? 'red' : 'amber'}>{r.status.replace('_', ' ')}</Badge> : <Badge>not marked</Badge>}</div>)}
        {!shown.length && <Empty>No student matches “{q}”.</Empty>}</Card></>}
  </>;
}
