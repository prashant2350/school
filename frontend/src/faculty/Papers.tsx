import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, FileText, Loader2, Plus, RefreshCw, Save, Sparkles, Trash2, Upload } from 'lucide-react';
import { api, fetchBlob, type Row } from '../api';
import { Badge, Btn, Card, Confirm, Empty, ErrorBox, Field, Loading, errMsg, useLoad, useToast } from '../ui';

const busyState = (p: Row) => p.gen_status === 'extracting' || p.gen_status === 'generating';

/** Question papers: upload PDF -> AI reads it -> review -> AI writes answers -> publish. Used by teachers (own subjects) and the admin. */
export default function Papers() {
  const [open, setOpen] = useState<number | null>(null);
  return open ? <PaperDetail id={open} onBack={() => setOpen(null)} /> : <PaperList onOpen={setOpen} />;
}

function PaperList({ onOpen }: { onOpen: (id: number) => void }) {
  const toast = useToast(); const file = useRef<HTMLInputElement>(null);
  const opts = useLoad<Row>(() => api.get('/papers/options'), []); const list = useLoad<Row[]>(() => api.get('/papers'), []);
  const [exam, setExam] = useState(''); const [choice, setChoice] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (list.data?.some(busyState)) { const t = setInterval(list.reload, 3000); return () => clearInterval(t); } }, [list.data]);   // eslint-disable-line
  const choices: Row[] = opts.data?.choices ?? [];
  const sel = choices[Number(choice)]; const exams: Row[] = (opts.data?.exams ?? []).filter((e: Row) => !sel || !e.class_id || e.class_id === sel.class_id);
  const upload = async (f?: File) => {
    if (!f || !sel || !exam) return; setBusy(true);
    try { const fd = new FormData(); fd.append('exam_id', exam); fd.append('class_id', String(sel.class_id)); fd.append('subject_id', String(sel.subject_id)); fd.append('file', f);
      const p = await api.upload('/papers', fd); toast('Paper uploaded. The AI is reading the questions…'); onOpen(p.id); }
    catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); if (file.current) file.current.value = ''; }
  };
  return <>
    <div style={{ marginBottom: 12 }}><h2 style={{ fontSize: 21, margin: 0 }}>Question papers</h2><p className="muted" style={{ margin: '2px 0 0' }}>Upload an exam paper as PDF. The AI reads the questions and writes the answer key; you check it before students see it.</p></div>
    <Card title="Upload a question paper">
      {opts.error && <ErrorBox msg={opts.error} retry={opts.reload} />}
      {!opts.loading && !choices.length ? <Empty>No class or subject is assigned to you yet. Ask the admin.</Empty> : <>
        <div className="row2"><Field label="Class & subject"><select value={choice} onChange={e => { setChoice(e.target.value); setExam(''); }}><option value="">Select</option>{choices.map((c, i) => <option key={i} value={i}>{c.class_label} · {c.subject}</option>)}</select></Field>
          <Field label="Exam"><select value={exam} onChange={e => setExam(e.target.value)} disabled={!sel}><option value="">{sel ? 'Select exam' : 'Choose class first'}</option>{exams.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field></div>
        <Btn busy={busy} disabled={!sel || !exam} onClick={() => file.current?.click()}><Upload size={16} />Choose PDF and upload</Btn>
        <input ref={file} type="file" accept="application/pdf" hidden onChange={e => upload(e.target.files?.[0])} /></>}
    </Card>
    <Card title="Uploaded papers">{list.loading ? <Loading /> : list.error ? <ErrorBox msg={list.error} retry={list.reload} /> : !list.data?.length ? <Empty>No papers yet.</Empty> :
      list.data.map(p => <button key={p.id} className="list-item" style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, font: 'inherit' }} onClick={() => onOpen(p.id)}>
        <div><b>{p.subject} · {p.class_label}</b><div className="muted small">{p.exam} · {p.questions_count} questions · {p.total_marks} marks</div></div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{busyState(p) && <Badge tone="amber"><Loader2 size={12} className="spin" /> AI working</Badge>}{p.gen_status === 'error' && <Badge tone="red">Problem</Badge>}
          <Badge tone={p.status === 'published' ? 'green' : 'gray'}>{p.status === 'published' ? 'Published' : 'Draft'}</Badge></div></button>)}</Card>
  </>;
}

function PaperDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const toast = useToast(); const { data: p, loading, error, reload } = useLoad<Row>(() => api.get(`/papers/${id}`), [id]);
  const [tab, setTab] = useState<'q' | 'm'>('q'); const [del, setDel] = useState(false); const [busy, setBusy] = useState('');
  useEffect(() => { if (p && busyState(p)) { const t = setInterval(reload, 2500); return () => clearInterval(t); } }, [p]);   // eslint-disable-line
  if (loading && !p) return <Loading />; if (error || !p) return <ErrorBox msg={error} retry={reload} />;
  const run = async (key: string, fn: () => Promise<any>, ok?: string) => { setBusy(key); try { await fn(); if (ok) toast(ok); reload(); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(''); } };
  const working = busyState(p); const published = p.status === 'published';
  const viewPdf = async () => { try { window.open(URL.createObjectURL(await fetchBlob(`/papers/${id}/pdf`)), '_blank'); } catch (e) { toast(errMsg(e), 'error'); } };
  return <>
    <button className="link" style={{ display: 'inline-flex', gap: 5, alignItems: 'center', marginBottom: 10 }} onClick={onBack}><ArrowLeft size={16} />All papers</button>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
      <div><h2 style={{ fontSize: 21, margin: 0 }}>{p.subject} · {p.class_label}</h2><p className="muted" style={{ margin: '2px 0 0' }}>{p.exam} · {p.questions_count} questions · {p.total_marks} marks</p></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'start' }}><Btn variant="ghost" className="btn-sm" onClick={viewPdf}><FileText size={14} />View PDF</Btn><Btn variant="ghost" className="btn-sm" onClick={() => setDel(true)}><Trash2 size={14} />Delete</Btn></div></div>

    {working && <div className="note"><Loader2 size={16} className="spin" /><span>{p.gen_status === 'extracting' ? 'The AI is reading your question paper…' : `The AI is writing answers… ${p.answered} of ${p.questions_count} done.`} You can leave this page open; it updates by itself.</span></div>}
    {p.gen_error && <div className="note warn">{p.gen_error}</div>}
    {!working && p.gen_status === 'error' && !p.questions_count && <Card><Empty>Reading the PDF failed. Delete this paper and upload it again, or try a clearer PDF.</Empty></Card>}

    <div className="tabs"><button className={tab === 'q' ? 'on' : ''} onClick={() => setTab('q')}>Questions & answers</button><button className={tab === 'm' ? 'on' : ''} onClick={() => setTab('m')} disabled={!p.questions_count}>Enter marks</button></div>
    {tab === 'q' && <>
      <Card><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn busy={busy === 'gen'} disabled={working || !p.questions_count} onClick={() => run('gen', () => api.post(`/papers/${id}/generate`), 'The AI started writing answers')}><Sparkles size={16} />{p.answered ? 'Write missing answers' : 'Generate answers'}</Btn>
        {p.answered > 0 && !published && <Btn variant="ghost" busy={busy === 'regen'} disabled={working} onClick={() => run('regen', () => api.post(`/papers/${id}/generate`, undefined, { only_missing: 'false' }), 'Rewriting all answers')}><RefreshCw size={16} />Rewrite all</Btn>}
        {published ? <Btn variant="soft" busy={busy === 'pub'} onClick={() => run('pub', () => api.post(`/papers/${id}/unpublish`), 'Answer key hidden from students')}>Unpublish</Btn>
          : <Btn variant="soft" busy={busy === 'pub'} disabled={working || p.answered < p.questions_count || !p.questions_count} onClick={() => run('pub', () => api.post(`/papers/${id}/publish`), 'Answer key is now visible to students')}>Publish to students</Btn>}
        <Btn variant="ghost" onClick={() => run('add', () => api.post(`/papers/${id}/questions`, { text: 'New question', marks: 1 }))}><Plus size={16} />Add question</Btn></div>
        <p className="muted small" style={{ margin: '10px 0 0' }}>Check each question's marks, word limit and keywords first — the answers are written to match them. Read every answer before publishing: AI can make mistakes.</p></Card>
      {p.questions.map((q: Row) => <QuestionCard key={`${q.id}-${q.ai_answer?.length}-${q.answer?.length}`} q={q} locked={working} onChange={reload} />)}
    </>}
    {tab === 'm' && <MarksGrid paperId={id} />}
    {del && <Confirm title="Delete this paper?" danger confirmLabel="Delete paper" onClose={() => setDel(false)} message={<p>The questions, answers and the question-wise marks entered for this paper will be removed. Students' normal exam totals stay.</p>}
      onConfirm={async () => { try { await api.del(`/papers/${id}`); onBack(); } catch (e) { toast(errMsg(e), 'error'); setDel(false); } }} />}
  </>;
}

function QuestionCard({ q, locked, onChange }: { q: Row; locked: boolean; onChange: () => void }) {
  const toast = useToast(); const [f, setF] = useState({ text: q.text, marks: String(q.marks), word_limit: String(q.word_limit ?? ''), keywords: q.keywords, topic: q.topic, answer: q.answer ?? q.ai_answer ?? '' });
  const [busy, setBusy] = useState(''); const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const dirty = f.text !== q.text || f.marks !== String(q.marks) || f.word_limit !== String(q.word_limit ?? '') || f.keywords !== q.keywords || f.topic !== q.topic || f.answer !== (q.answer ?? q.ai_answer ?? '');
  const save = async () => { setBusy('save'); try { await api.patch(`/papers/questions/${q.id}`, { text: f.text, marks: Number(f.marks), word_limit: f.word_limit ? Number(f.word_limit) : null, keywords: f.keywords, topic: f.topic,
    ...(f.answer !== (q.answer ?? q.ai_answer ?? '') ? { answer: f.answer } : {}) }); toast('Saved'); onChange(); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(''); } };
  const regen = async () => { setBusy('regen'); try { await api.post(`/papers/questions/${q.id}/regenerate`); onChange(); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(''); } };
  const remove = async () => { try { await api.del(`/papers/questions/${q.id}`); onChange(); } catch (e) { toast(errMsg(e), 'error'); } };
  return <div className={`pq ${q.ai_status === 'done' ? 'done' : q.ai_status === 'error' ? 'err' : ''}`}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}><Badge tone="purple">Q{q.number}</Badge>{q.ai_status === 'error' && <Badge tone="red">Answer failed</Badge>}<span style={{ flex: 1 }} />
      <button className="icon-btn" aria-label="Delete question" onClick={remove} disabled={locked}><Trash2 size={16} /></button></div>
    <textarea aria-label="Question" value={f.text} onChange={set('text')} />
    <div className="row4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10, margin: '10px 0' }}>
      <Field label="Marks"><input type="number" min="0.5" step="0.5" value={f.marks} onChange={set('marks')} /></Field>
      <Field label="Answer words"><input type="number" min="1" value={f.word_limit} onChange={set('word_limit')} /></Field>
      <Field label="Topic"><input value={f.topic} onChange={set('topic')} /></Field>
      <Field label="Keywords to include"><input value={f.keywords} onChange={set('keywords')} placeholder="comma, separated" /></Field></div>
    <Field label="Model answer" hint="Edit it freely. Students see exactly this.">{q.ai_status === 'pending' && !f.answer && !locked ? <p className="muted small" style={{ margin: 0 }}>Not written yet — press “Generate answers”.</p> : null}<textarea style={{ minHeight: 110 }} value={f.answer} onChange={set('answer')} /></Field>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Btn className="btn-sm" busy={busy === 'save'} disabled={!dirty || locked} onClick={save}><Save size={14} />Save changes</Btn>
      <Btn variant="ghost" className="btn-sm" busy={busy === 'regen'} disabled={locked || dirty} onClick={regen}><Sparkles size={14} />Rewrite this answer</Btn></div>
  </div>;
}

function MarksGrid({ paperId }: { paperId: number }) {
  const toast = useToast(); const { data, loading, error, reload } = useLoad<Row>(() => api.get(`/papers/${paperId}/marks`), [paperId]);
  const [vals, setVals] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) { const v: Record<string, string> = {}; data.students.forEach((s: Row) => Object.entries(s.marks).forEach(([q, m]) => { v[`${s.student_id}:${q}`] = String(m); })); setVals(v); } }, [data]);
  if (loading) return <Loading />; if (error || !data) return <ErrorBox msg={error} retry={reload} />;
  const save = async () => {
    const records: Row[] = []; data.students.forEach((s: Row) => data.questions.forEach((q: Row) => { const k = `${s.student_id}:${q.id}`; const was = s.marks[q.id]; const now = vals[k];
      if (now !== undefined && now !== '' && Number(now) !== was) records.push({ student_id: s.student_id, question_id: q.id, marks: Number(now) });
      if ((now === undefined || now === '') && was !== undefined) records.push({ student_id: s.student_id, question_id: q.id, marks: null }); }));
    if (!records.length) return toast('Nothing changed');
    setBusy(true); try { const r = await api.put(`/papers/${paperId}/marks`, { records }); toast(`Saved marks for ${r.students} student(s)`); reload(); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); }
  };
  return <Card title="Marks for each question" actions={!data.locked && <Btn busy={busy} onClick={save}><Save size={16} />Save marks</Btn>}>
    <div className="note"><span>These marks power each student's topic analysis, and add up to the subject total in the normal results. Leave a box empty if the student did not attempt it and you do not want it counted.</span></div>
    {data.locked && <div className="note warn">Results are published and locked. Ask the admin for corrections.</div>}
    {!data.students.length ? <Empty>No students in this class.</Empty> : <div className="mgrid"><table><thead><tr><th>Student</th>{data.questions.map((q: Row) => <th key={q.id} title={q.topic}>Q{q.number}<div className="muted small">/{q.marks}</div></th>)}</tr></thead><tbody>
      {data.students.map((s: Row) => <tr key={s.student_id}><td><b>{s.roll_no ? `${s.roll_no}. ` : ''}{s.name}</b></td>{data.questions.map((q: Row) => <td key={q.id}>
        <input type="number" inputMode="decimal" min="0" max={q.marks} step="0.5" disabled={data.locked} aria-label={`${s.name} question ${q.number}`} value={vals[`${s.student_id}:${q.id}`] ?? ''}
          onChange={e => setVals(v => ({ ...v, [`${s.student_id}:${q.id}`]: e.target.value }))} /></td>)}</tr>)}</tbody></table></div>}
  </Card>;
}
