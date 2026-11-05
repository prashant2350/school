import { useState, type FormEvent } from 'react';
import { Layers, Plus, Trash2, X } from 'lucide-react';
import { api, type Row } from '../api';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Loading, Modal, PageHead, errMsg, useLoad, useToast } from '../ui';
import { useCurrentClasses } from './data';

/** 1) which subjects each class studies  2) which teacher teaches each one.
 *  This drives the faculty portal, the student's "My teachers" page, and who may upload marks. */
export default function Teaching() {
  const toast = useToast(); const classes = useCurrentClasses();
  const subjects = useLoad<Row[]>(() => api.get('/teaching/subjects'), []);
  const staff = useLoad<Row[]>(() => api.get('/users'), []);
  const [classId, setClassId] = useState(String(classes[0]?.id ?? ''));
  const cs = useLoad<Row[]>(() => (classId ? api.get('/teaching/class-subjects', { class_id: classId }) : Promise.resolve([])), [classId]);
  const [name, setName] = useState(''); const [code, setCode] = useState('');
  const [pick, setPick] = useState(''); const [bulk, setBulk] = useState(false);
  const teachers = (staff.data ?? []).filter(u => u.role === 'teacher' && u.is_active);
  const label = (c: Row) => `${c.grade}-${c.section}`;
  const notInClass = (subjects.data ?? []).filter(s => !(cs.data ?? []).some(x => x.subject_id === s.id));

  const addSubject = async (e: FormEvent) => { e.preventDefault(); try { await api.post('/teaching/subjects', { name, code: code || null }); setName(''); setCode(''); toast('Subject created'); subjects.reload(); } catch (err) { toast(errMsg(err), 'error'); } };
  const delSubject = async (id: number) => { try { await api.del(`/teaching/subjects/${id}`); subjects.reload(); } catch (err) { toast(errMsg(err), 'error'); } };
  const addToClass = async () => { if (!pick) return; try { await api.post('/teaching/class-subjects', { subject_id: Number(pick), class_ids: [Number(classId)] }); setPick(''); toast('Subject added to this class'); cs.reload(); } catch (err) { toast(errMsg(err), 'error'); } };
  const removeFromClass = async (s: Row) => { if (!confirm(`Remove ${s.name} from this class? Its teacher assignment and timetable periods for this class are removed too.`)) return; try { await api.del(`/teaching/class-subjects/${classId}/${s.subject_id}`); cs.reload(); } catch (err) { toast(errMsg(err), 'error'); } };
  const setTeacher = async (s: Row, teacherId: string) => {
    try { if (!teacherId) { if (s.assignment_id) await api.del(`/teaching/assignments/${s.assignment_id}`); } else await api.post('/teaching/assignments', { teacher_id: Number(teacherId), class_id: Number(classId), subject_id: s.subject_id }); toast('Saved'); cs.reload(); }
    catch (err) { toast(errMsg(err), 'error'); }
  };

  return <>
    <PageHead title="Subjects & teachers" sub="Choose the subjects each class studies, then the teacher for each subject." actions={<Btn onClick={() => setBulk(true)} disabled={!classes.length}><Layers size={16} />Add a subject to many classes</Btn>} />
    <div className="grid g-main">
      <Card title="This class’s subjects" actions={<select aria-label="Class" value={classId} onChange={e => setClassId(e.target.value)} style={{ width: 'auto' }}>{classes.map(c => <option key={c.id} value={c.id}>{label(c)}</option>)}</select>}>
        {!classes.length ? <Empty>Create classes first (Classes & years).</Empty> : cs.loading || staff.loading ? <Loading /> : cs.error ? <ErrorBox msg={cs.error} retry={cs.reload} /> : <>
          {!cs.data?.length ? <Empty>No subjects for this class yet. Add one below, or use “Add a subject to many classes”.</Empty> :
            <div className="table-wrap"><table><thead><tr><th>Subject</th><th>Teacher</th><th></th></tr></thead><tbody>{cs.data.map(s =>
              <tr key={s.subject_id}><td><b>{s.name}</b></td>
                <td><select value={s.teacher_id ?? ''} onChange={e => setTeacher(s, e.target.value)} aria-label={`Teacher for ${s.name}`}><option value="">— no teacher yet —</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}{t.employee_id ? ` (${t.employee_id})` : ''}</option>)}</select></td>
                <td className="right"><button className="icon-btn" aria-label={`Remove ${s.name} from this class`} onClick={() => removeFromClass(s)}><X size={16} /></button></td></tr>)}</tbody></table></div>}
          {!teachers.length && !!cs.data?.length && <p className="muted small">Add faculty accounts first (Staff accounts, role: teacher) to choose teachers.</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <select aria-label="Subject to add" value={pick} onChange={e => setPick(e.target.value)} style={{ flex: 1 }}><option value="">Add a subject to {label(classes.find(c => String(c.id) === classId) ?? { grade: '', section: '' })}…</option>{notInClass.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <Btn onClick={addToClass} disabled={!pick}><Plus size={16} />Add</Btn></div>
          {!subjects.data?.length && <p className="muted small">No subjects exist yet. Create some on the right, or type a new one in “Add a subject to many classes”.</p>}
        </>}
      </Card>
      <Card title="All subjects">
        <form onSubmit={addSubject}><Field label="New subject name" required><input required value={name} onChange={e => setName(e.target.value)} placeholder="Mathematics" /></Field>
          <Field label="Code (optional)"><input value={code} onChange={e => setCode(e.target.value)} placeholder="MATH" maxLength={20} /></Field><Btn type="submit" variant="soft"><Plus size={16} />Create subject</Btn></form>
        <div style={{ marginTop: 16 }}>{subjects.data?.map(s => <div key={s.id} className="list-item"><span>{s.name} {s.code && <Badge>{s.code}</Badge>}</span><button className="icon-btn" aria-label={`Delete ${s.name}`} onClick={() => delSubject(s.id)}><Trash2 size={16} /></button></div>)}</div>
      </Card>
    </div>
    {bulk && <BulkModal classes={classes} subjects={subjects.data ?? []} onClose={() => setBulk(false)} onDone={() => { setBulk(false); subjects.reload(); cs.reload(); }} />}
  </>;
}

/** The common button: one subject -> every class you tick. */
function BulkModal({ classes, subjects, onClose, onDone }: { classes: Row[]; subjects: Row[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [subjectId, setSubjectId] = useState(''); const [newName, setNewName] = useState('');
  const [sel, setSel] = useState<Set<number>>(new Set()); const [busy, setBusy] = useState(false);
  const toggle = (id: number) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pickWhere = (f: (c: Row) => boolean) => setSel(new Set(classes.filter(f).map(c => c.id)));
  const num = (c: Row) => { const m = /Class (\d+)/.exec(c.grade); return m ? Number(m[1]) : 0; };
  const presets: [string, (c: Row) => boolean][] = [
    ['All classes', () => true], ['Nursery–UKG', c => ['Nursery', 'LKG', 'UKG'].includes(c.grade)], ['Class 1–5', c => num(c) >= 1 && num(c) <= 5],
    ['Class 6–8', c => num(c) >= 6 && num(c) <= 8], ['Class 9–10', c => num(c) >= 9 && num(c) <= 10], ['Class 11–12', c => num(c) >= 11], ['Clear', () => false]];
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!subjectId && !newName.trim()) return toast('Choose a subject or type a new one', 'error');
    if (!sel.size) return toast('Tick at least one class', 'error');
    setBusy(true);
    try { const r = await api.post('/teaching/class-subjects', { subject_id: subjectId ? Number(subjectId) : null, subject_name: subjectId ? null : newName.trim(), class_ids: [...sel] });
      toast(`${r.subject} added to ${r.added} class${r.added === 1 ? '' : 'es'}${r.already_had ? ` (${r.already_had} already had it)` : ''}`); onDone(); }
    catch (err) { toast(errMsg(err), 'error'); setBusy(false); }
  };
  return <Modal wide title="Add a subject to many classes" subtitle="Pick the subject, tick the classes that study it, and save once." onClose={onClose}>
    <form onSubmit={submit}>
      <div className="row2"><Field label="Existing subject"><select value={subjectId} onChange={e => { setSubjectId(e.target.value); if (e.target.value) setNewName(''); }}><option value="">— or type a new one →</option>{subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="New subject name"><input value={newName} disabled={!!subjectId} onChange={e => setNewName(e.target.value)} placeholder="e.g. Computer Science" /></Field></div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 10px' }}>{presets.map(([l, f]) => <Btn key={l} type="button" variant="ghost" className="btn-sm" onClick={() => pickWhere(f)}>{l}</Btn>)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 8, maxHeight: 280, overflow: 'auto', padding: 2 }}>
        {classes.map(c => <label key={c.id} className="chk" style={{ display: 'flex', gap: 8, alignItems: 'center', border: '1px solid var(--line, #dfe3ee)', borderRadius: 10, padding: '8px 10px', whiteSpace: 'nowrap', cursor: 'pointer', background: sel.has(c.id) ? 'var(--purple-50, #efeefc)' : undefined }}>
          <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} /><span>{c.grade}-{c.section}</span></label>)}</div>
      <div className="modal-actions"><span className="muted small" style={{ marginRight: 'auto' }}>{sel.size} class{sel.size === 1 ? '' : 'es'} selected</span><Btn type="button" variant="ghost" onClick={onClose}>Cancel</Btn><Btn type="submit" busy={busy}>Add to selected classes</Btn></div>
    </form></Modal>;
}
