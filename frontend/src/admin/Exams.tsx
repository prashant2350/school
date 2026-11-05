import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Save } from 'lucide-react';
import { api, fmtDate, type Row } from '../api';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Loading, Modal, PageHead, errMsg, useLoad, useToast } from '../ui';
import { useApp, useCurrentClasses } from './data';

export default function Exams() {
  const { me, meta } = useApp(); const classes = useCurrentClasses(); const toast = useToast();
  const exams = useLoad<Row[]>(() => api.get('/exams'), []);
  const [create, setCreate] = useState(false);
  const [examId, setExamId] = useState(''); const [classId, setClassId] = useState(String(classes[0]?.id ?? '')); const [subject, setSubject] = useState(''); const [max, setMax] = useState('100');
  const [rows, setRows] = useState<Row[] | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const canCreate = me.role === 'admin';
  // the subject dropdown lists only the subjects of the chosen class (set up under "Subjects & teachers")
  const subs = useLoad<Row[]>(() => (classId ? api.get('/teaching/class-subjects', { class_id: classId }) : Promise.resolve([])), [classId]);
  const [progress, setProgress] = useState<Row | null>(null);
  const setStatus = async (x: Row, status: string) => { try { await api.patch(`/exams/${x.id}/status`, { status }); toast(status === 'published' ? 'Published — students can now see these results' : 'Exam re-opened for faculty'); exams.reload(); } catch (e) { toast(errMsg(e), 'error'); } };
  const openProgress = async (x: Row) => { try { setProgress({ exam: x, rows: await api.get(`/exams/${x.id}/progress`) }); } catch (e) { toast(errMsg(e), 'error'); } };

  const load = async () => { setError(''); setRows(null); try { const r = await api.get(`/exams/${examId}/sheet`, { class_id: classId, subject: subject.trim() }); setRows(r.map((x: Row) => ({ ...x, value: x.marks_obtained ?? '' }))); if (r.find((x: Row) => x.max_marks)) setMax(r.find((x: Row) => x.max_marks).max_marks); } catch (e) { setError(errMsg(e)); } };
  useEffect(() => { setRows(null); }, [examId, classId, subject]);
  const save = async () => {
    const records = rows!.filter(r => r.value !== '' && r.value != null).map(r => ({ student_id: r.student_id, marks_obtained: r.value }));
    if (!records.length) return toast('Enter marks for at least one student', 'error');
    setBusy(true); try { const r = await api.post('/exams/marks/bulk', { exam_id: Number(examId), subject: subject.trim(), max_marks: max, records }); toast(`Saved marks for ${r.saved} students`); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return <>
    <PageHead title="Exams & marks" sub="Faculty upload marks for their own subjects. Check progress, then Publish so students can see results." actions={canCreate && <Btn onClick={() => setCreate(true)}><Plus size={16} />New exam</Btn>} />
    <Card title="Enter marks yourself (admin override)">
      <div className="row3"><Field label="Exam"><select value={examId} onChange={e => setExamId(e.target.value)}><option value="">Select exam</option>{exams.data?.map(x => <option key={x.id} value={x.id}>{x.name} ({x.academic_year})</option>)}</select></Field>
        <Field label="Class"><select value={classId} onChange={e => { setClassId(e.target.value); setSubject(''); }}>{classes.map(c => <option key={c.id} value={c.id}>{c.grade}-{c.section}</option>)}</select></Field>
        <Field label="Subject" hint={!subs.loading && !subs.data?.length ? 'This class has no subjects yet — add them under Subjects & teachers.' : undefined}><select value={subject} onChange={e => setSubject(e.target.value)} disabled={!subs.data?.length}><option value="">{subs.loading ? 'Loading…' : 'Select subject'}</option>{subs.data?.map(x => <option key={x.subject_id} value={x.name}>{x.name}</option>)}</select></Field></div>
      <div className="row3" style={{ alignItems: 'end' }}><Field label="Maximum marks"><input type="number" min="1" value={max} onChange={e => setMax(e.target.value)} /></Field><div className="field"><Btn variant="soft" onClick={load} disabled={!examId || !classId || !subject.trim()}>Load students</Btn></div></div>
      {error && <ErrorBox msg={error} />}
      {rows && (rows.length === 0 ? <Empty>No students in this class.</Empty> : <>
        <div className="table-wrap"><table><thead><tr><th>Roll</th><th>Student</th><th>Marks (out of {max})</th></tr></thead><tbody>{rows.map(r => <tr key={r.student_id}><td>{r.roll_no ?? '—'}</td><td><b>{r.name}</b><div className="muted small mono">{r.admission_no}</div></td>
          <td><input className="marks-in" type="number" min="0" max={max} step="0.5" aria-label={`Marks for ${r.name}`} value={r.value} onChange={e => setRows(rs => rs!.map(x => (x.student_id === r.student_id ? { ...x, value: e.target.value } : x)))} /></td></tr>)}</tbody></table></div>
        <div className="modal-actions"><Btn onClick={save} busy={busy}><Save size={16} />Save marks</Btn></div></>)}
    </Card>
    <Card title="All exams">{exams.loading ? <Loading /> : exams.error ? <ErrorBox msg={exams.error} retry={exams.reload} /> : !exams.data?.length ? <Empty>No exams yet.</Empty> :
      <div className="table-wrap"><table><thead><tr><th>Exam</th><th>Year</th><th>Dates</th><th>Status</th><th></th></tr></thead><tbody>{exams.data.map(x => <tr key={x.id}><td><b>{x.name}</b></td><td>{x.academic_year}</td><td>{fmtDate(x.start_date)} – {fmtDate(x.end_date)}</td>
      <td>{x.status === 'published' ? <Badge tone="green">Published</Badge> : <Badge tone="amber">Open for marks</Badge>}</td>
      <td className="right nowrap"><Btn variant="ghost" className="btn-sm" onClick={() => openProgress(x)}>Progress</Btn>{' '}{x.status === 'published' ? <Btn variant="ghost" className="btn-sm" onClick={() => setStatus(x, 'open')}>Re-open</Btn> : <Btn className="btn-sm" onClick={() => setStatus(x, 'published')}>Publish</Btn>}</td></tr>)}</tbody></table></div>}</Card>
    {progress && <Modal wide title={`Marks progress — ${progress.exam.name}`} subtitle="Publish only when every row is complete." onClose={() => setProgress(null)}>
      {progress.rows.length === 0 ? <Empty>No teacher assignments for this exam’s classes yet (Subjects & teachers).</Empty> : <div className="table-wrap"><table><thead><tr><th>Class</th><th>Subject</th><th>Teacher</th><th>Marks entered</th></tr></thead><tbody>{progress.rows.map((r: Row, i: number) => <tr key={i}><td>{r.class}</td><td>{r.subject}</td><td>{r.teacher}</td><td><Badge tone={r.entered >= r.students && r.students > 0 ? 'green' : r.entered ? 'amber' : 'red'}>{r.entered} / {r.students}</Badge></td></tr>)}</tbody></table></div>}</Modal>}
    {create && <ExamForm year={meta.current_year} onClose={() => setCreate(false)} onSaved={() => { setCreate(false); exams.reload(); }} />}
  </>;
}

function ExamForm({ year, onClose, onSaved }: { year: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast(); const [f, setF] = useState({ name: '', start_date: '', end_date: '' }); const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); try { await api.post('/exams', { name: f.name, academic_year: year, start_date: f.start_date || null, end_date: f.end_date || null }); toast('Exam created'); onSaved(); } catch (err) { toast(errMsg(err), 'error'); setBusy(false); } };
  return <Modal title="New exam" subtitle={`Academic year ${year}`} onClose={onClose}><form onSubmit={submit}>
    <Field label="Exam name" required><input required autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Half-yearly examination" /></Field>
    <div className="row2"><Field label="Start date"><input type="date" value={f.start_date} onChange={e => setF({ ...f, start_date: e.target.value })} /></Field><Field label="End date"><input type="date" value={f.end_date} onChange={e => setF({ ...f, end_date: e.target.value })} /></Field></div>
    <div className="modal-actions"><Btn type="button" variant="ghost" onClick={onClose}>Cancel</Btn><Btn type="submit" busy={busy}>Create exam</Btn></div></form></Modal>;
}
