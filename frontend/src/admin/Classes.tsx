import { useState, type FormEvent } from 'react';
import { Check, Plus, Wand2 } from 'lucide-react';
import { api, type Row } from '../api';
import { Badge, Btn, Card, Empty, Field, PageHead, errMsg, useLoad, useToast } from '../ui';
import { useApp } from './data';

export default function Classes() {
  const { meta, years, classes, reload } = useApp(); const toast = useToast();
  const [year, setYear] = useState(meta.current_year);
  const [grade, setGrade] = useState('Class 1'); const [section, setSection] = useState('A');
  const [sections, setSections] = useState('A'); const [newYear, setNewYear] = useState(''); const [copy, setCopy] = useState('');
  const list = classes.filter(c => c.academic_year === year);
  const staff = useLoad<Row[]>(() => api.get('/users'), []);
  const teachers = (staff.data ?? []).filter(u => u.role === 'teacher' && u.is_active);
  const setTeacher = async (id: number, v: string) => { try { await api.patch(`/classes/${id}`, { class_teacher_id: v ? Number(v) : null }); toast(v ? 'Class teacher assigned' : 'Class teacher removed'); reload(); } catch (err) { toast(errMsg(err), 'error'); } };
  const addClass = async (e: FormEvent) => { e.preventDefault(); try { await api.post('/classes', { grade, section: section.trim().toUpperCase() || 'A', academic_year: year }); toast('Class added'); reload(); } catch (err) { toast(errMsg(err), 'error'); } };
  const addStandard = async () => { const secs = sections.split(/[ ,]+/).map(x => x.trim().toUpperCase()).filter(Boolean); try { const r = await api.post('/classes/standard', { academic_year: year, sections: secs.length ? secs : ['A'] }); toast(r.created ? `${r.created} classes created for ${year}` : 'All those classes already exist'); reload(); } catch (err) { toast(errMsg(err), 'error'); } };
  const addYear = async (e: FormEvent) => { e.preventDefault(); try { await api.post('/academic-years', { name: newYear, make_current: false, copy_classes_from: copy || null }); toast('Academic year added'); setNewYear(''); reload(); } catch (err) { toast(errMsg(err), 'error'); } };
  const makeCurrent = async (id: number) => { try { await api.post(`/academic-years/${id}/set-current`); toast('Current year changed'); reload(); } catch (err) { toast(errMsg(err), 'error'); } };
  return <>
    <PageHead title="Classes & academic years" sub="Set up the classes and sections for each year." />
    <div className="grid g2">
      <Card title="Academic years">
        <table><thead><tr><th>Year</th><th>Status</th><th></th></tr></thead><tbody>{years.map(y => <tr key={y.id}><td><b>{y.name}</b></td><td>{y.is_current ? <Badge tone="green">Current</Badge> : <Badge>Other</Badge>}</td><td className="right">{!y.is_current && <Btn variant="ghost" className="btn-sm" onClick={() => makeCurrent(y.id)}><Check size={14} />Make current</Btn>}</td></tr>)}</tbody></table>
        <form onSubmit={addYear} style={{ marginTop: 16 }}><div className="row2"><Field label="New year (e.g. 2027-2028)"><input required pattern="\d{4}-\d{4}" value={newYear} onChange={e => setNewYear(e.target.value)} placeholder="2027-2028" /></Field>
          <Field label="Copy classes from"><select value={copy} onChange={e => setCopy(e.target.value)}><option value="">Don’t copy</option>{years.map(y => <option key={y.id}>{y.name}</option>)}</select></Field></div><Btn type="submit"><Plus size={16} />Add year</Btn></form>
      </Card>
      <Card title="Classes" actions={<select value={year} onChange={e => setYear(e.target.value)} aria-label="Academic year" style={{ width: 'auto' }}>{years.map(y => <option key={y.id}>{y.name}</option>)}</select>}>
        {list.length === 0 ? <Empty>No classes for {year} yet.</Empty> : <>
          <p className="muted small" style={{ marginTop: 0 }}>The <b>class teacher</b> sees the class list on their faculty portal and takes the daily attendance (first period). One teacher can be class teacher of one class per year.</p>
          <div className="table-wrap" style={{ marginBottom: 16 }}><table><thead><tr><th>Class</th><th>Class teacher</th></tr></thead><tbody>{list.map(c => <tr key={c.id}><td><Badge tone="purple">{c.grade}-{c.section}</Badge></td>
            <td><select value={c.class_teacher_id ?? ''} onChange={e => setTeacher(c.id, e.target.value)} aria-label={`Class teacher of ${c.grade}-${c.section}`}><option value="">— not assigned —</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.full_name}{t.employee_id ? ` (${t.employee_id})` : ''}</option>)}</select></td></tr>)}</tbody></table></div></>}
        <div style={{ background: 'var(--purple-50, #efeefc)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <b>Quick set-up</b><p className="muted small" style={{ margin: '2px 0 10px' }}>Creates Nursery, LKG, UKG and Class 1 to Class 12 for {year}. Classes that already exist are skipped. Use “A, B” to create two sections of every class.</p>
          <div style={{ display: 'flex', gap: 8 }}><input aria-label="Sections" value={sections} onChange={e => setSections(e.target.value)} placeholder="A, B" style={{ maxWidth: 140 }} /><Btn variant="soft" onClick={addStandard}><Wand2 size={16} />Create Nursery – Class 12</Btn></div></div>
        <form onSubmit={addClass}><div className="row2"><Field label="Class"><select value={grade} onChange={e => setGrade(e.target.value)}>{meta.grades.map(g => <option key={g}>{g}</option>)}</select></Field><Field label="Section"><input required maxLength={10} value={section} onChange={e => setSection(e.target.value)} /></Field></div><Btn type="submit"><Plus size={16} />Add class to {year}</Btn></form>
      </Card>
    </div>
  </>;
}
