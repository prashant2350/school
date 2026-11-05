import { useEffect, useRef, useState } from 'react';
import { Download, Lock, Save, Upload } from 'lucide-react';
import { api, downloadCsv, parseCsv, type Row } from '../api';
import { Btn, Card, Empty, ErrorBox, Field, errMsg, useLoad, useToast } from '../ui';

/** Faculty enter (or upload) marks ONLY for the class + subject the admin assigned to them. */
export default function Marks({ assignments }: { assignments: Row[] }) {
  const toast = useToast(); const file = useRef<HTMLInputElement>(null);
  const exams = useLoad<Row[]>(() => api.get('/faculty/exams'), []);
  const [examId, setExamId] = useState(''); const [aid, setAid] = useState(String(assignments[0]?.id ?? '')); const [max, setMax] = useState('100');
  const [sheet, setSheet] = useState<Row | null>(null); const [rows, setRows] = useState<Row[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false);
  useEffect(() => { setSheet(null); }, [examId, aid]);
  if (!assignments.length) return <Card><Empty>The admin has not assigned any class or subject to you yet, so there are no marks to enter.</Empty></Card>;
  const asg = assignments.find(a => String(a.id) === aid);

  const load = async () => { setLoading(true); setError(''); try { const r = await api.get('/faculty/marks/sheet', { exam_id: examId, assignment_id: aid }); setSheet(r); setRows(r.rows.map((x: Row) => ({ ...x, value: x.marks_obtained ?? '' }))); if (r.max_marks) setMax(String(Number(r.max_marks))); } catch (e) { setError(errMsg(e)); } finally { setLoading(false); } };
  const save = async () => {
    const records = rows.filter(r => r.value !== '' && r.value != null).map(r => ({ student_id: r.student_id, marks_obtained: r.value }));
    if (!records.length) return toast('Enter marks for at least one student', 'error');
    setBusy(true); try { const r = await api.post('/faculty/marks', { exam_id: Number(examId), assignment_id: Number(aid), max_marks: max, records }); toast(`Saved marks for ${r.saved} students`); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  const template = () => downloadCsv(`marks-${asg?.class_label}-${asg?.subject}.csv`.replace(/\s+/g, '_'), rows.map(r => ({ student_id: r.admission_no, name: r.name, marks: r.value })));
  const onFile = async (f?: File) => {
    if (!f) return; const parsed = parseCsv(await f.text()); const unknown: string[] = []; let hit = 0;
    const next = rows.map(r => ({ ...r })); const idx = new Map(next.map(r => [String(r.admission_no).toUpperCase(), r]));
    for (const p of parsed) { const id = String(p.student_id || p.admission_no || p.id || '').toUpperCase(); const mk = p.marks ?? p.marks_obtained ?? ''; if (!id) continue; const row = idx.get(id); if (!row) { unknown.push(id); continue; } if (mk !== '') { row.value = mk; hit++; } }
    setRows(next); if (file.current) file.current.value = '';
    toast(`Loaded ${hit} marks from the file. Check them, then press Save.${unknown.length ? ` Not in this class: ${unknown.slice(0, 3).join(', ')}${unknown.length > 3 ? '…' : ''}` : ''}`, unknown.length ? 'error' : 'ok');
  };
  return <>
    <div style={{ marginBottom: 12 }}><h2 style={{ fontSize: 21 }}>Upload marks</h2><p className="muted" style={{ margin: '2px 0 0' }}>Only your own classes and subjects. Students see marks after the admin publishes the exam.</p></div>
    <Card>
      {exams.error && <ErrorBox msg={exams.error} retry={exams.reload} />}
      <Field label="Exam"><select value={examId} onChange={e => setExamId(e.target.value)}><option value="">{exams.loading ? 'Loading…' : exams.data?.length ? 'Select exam' : 'No exam is open for marks right now'}</option>{exams.data?.map(x => <option key={x.id} value={x.id}>{x.name} ({x.academic_year})</option>)}</select></Field>
      <Field label="Class & subject"><select value={aid} onChange={e => setAid(e.target.value)}>{assignments.map(a => <option key={a.id} value={a.id}>{a.class_label} · {a.subject}</option>)}</select></Field>
      <div className="row2" style={{ alignItems: 'end' }}><Field label="Maximum marks"><input type="number" min="1" value={max} onChange={e => setMax(e.target.value)} /></Field><div className="field"><Btn variant="soft" onClick={load} busy={loading} disabled={!examId || !aid}>Load students</Btn></div></div>
    </Card>
    {error && <ErrorBox msg={error} />}
    {sheet && (sheet.locked ? <div className="note warn"><Lock size={16} />This exam is published and locked. Ask the admin if a correction is needed.</div> : null)}
    {sheet && (rows.length === 0 ? <Card><Empty>No students in this class.</Empty></Card> : <Card title={`${asg?.class_label} · ${sheet.subject}`} actions={!sheet.locked && <>
      <Btn variant="ghost" className="btn-sm" onClick={template}><Download size={14} />Template</Btn>{' '}<Btn variant="ghost" className="btn-sm" onClick={() => file.current?.click()}><Upload size={14} />Upload CSV</Btn>
      <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={e => onFile(e.target.files?.[0])} /></>}>
      {rows.map(r => <div key={r.student_id} className="mark-row"><div className="who"><b>{r.roll_no ? `${r.roll_no}. ` : ''}{r.name}</b><span className="muted small mono">{r.admission_no}</span></div>
        <input className="marks-in" type="number" inputMode="decimal" min="0" max={max} step="0.5" disabled={sheet.locked} aria-label={`Marks for ${r.name}`} value={r.value} placeholder={`/${max}`} onChange={e => setRows(rs => rs.map(x => (x.student_id === r.student_id ? { ...x, value: e.target.value } : x)))} /></div>)}
      {!sheet.locked && <div className="modal-actions"><Btn onClick={save} busy={busy}><Save size={16} />Save marks</Btn></div>}</Card>)}
  </>;
}
