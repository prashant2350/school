import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { api, WEEKDAYS, type Row } from '../api';
import { Btn, Card, Empty, ErrorBox, Loading, PageHead, errMsg, useLoad, useToast } from '../ui';
import { useCurrentClasses } from './data';

/** Weekly timetable per class. A teacher cannot be put in two classes in the same period (the server checks). */
export default function Timetable() {
  const toast = useToast(); const classes = useCurrentClasses(); const [classId, setClassId] = useState(String(classes[0]?.id ?? ''));
  const asg = useLoad<Row[]>(() => (classId ? api.get('/teaching/assignments', { class_id: classId }) : Promise.resolve([])), [classId]);
  const tt = useLoad<Row>(() => (classId ? api.get('/teaching/timetable', { class_id: classId }) : Promise.resolve(null as any)), [classId]);
  const [grid, setGrid] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  useEffect(() => { if (tt.data) setGrid(Object.fromEntries(tt.data.slots.map((s: Row) => [`${s.weekday}-${s.period_no}`, String(s.assignment_id)]))); setErr(''); }, [tt.data]);
  const save = async () => {
    setBusy(true); setErr('');
    try { const slots = Object.entries(grid).filter(([, v]) => v).map(([k, v]) => { const [d, p] = k.split('-').map(Number); return { weekday: d, period_no: p, assignment_id: Number(v) }; });
      await api.put('/teaching/timetable', { class_id: Number(classId), slots }); toast('Timetable saved'); tt.reload(); } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  const periods = tt.data?.periods ?? 8;
  return <>
    <PageHead title="Timetable" sub="Pick a teacher/subject for each period. Students and faculty see this on their portals." actions={<Btn onClick={save} busy={busy} disabled={!classId}><Save size={16} />Save timetable</Btn>} />
    <Card title="Class" actions={<select aria-label="Class" value={classId} onChange={e => setClassId(e.target.value)} style={{ width: 'auto' }}>{classes.map(c => <option key={c.id} value={c.id}>{c.grade}-{c.section}</option>)}</select>}>
      {err && <ErrorBox msg={err} />}
      {!classes.length ? <Empty>Create classes first.</Empty> : tt.loading || asg.loading ? <Loading /> : !asg.data?.length ? <Empty>Assign subjects to teachers for this class first (Subjects & teachers).</Empty> :
        <div className="table-wrap"><table className="tt"><thead><tr><th>Period</th>{WEEKDAYS.map(d => <th key={d}>{d}</th>)}</tr></thead><tbody>
          {Array.from({ length: periods }, (_, i) => i + 1).map(p => <tr key={p}><th>{p}</th>{WEEKDAYS.map((d, di) => <td key={d}>
            <select aria-label={`${d} period ${p}`} value={grid[`${di}-${p}`] ?? ''} onChange={e => setGrid(g => ({ ...g, [`${di}-${p}`]: e.target.value }))} style={{ minWidth: 110, fontSize: 13, padding: '6px 6px' }}>
              <option value="">—</option>{asg.data!.map(a => <option key={a.id} value={a.id}>{a.subject} · {a.teacher.split(' ')[0]}</option>)}</select></td>)}</tr>)}</tbody></table></div>}
    </Card>
  </>;
}
