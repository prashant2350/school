import { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Repeat2 } from 'lucide-react';
import { api, inr, type Row } from '../api';
import { Badge, Btn, Card, Confirm, Empty, ErrorBox, Field, Loading, PageHead, errMsg, useToast } from '../ui';
import { useApp } from './data';

type Choice = { action: string; target: number | '' };
const nextYearName = (y: string) => { const [a, b] = y.split('-').map(Number); return `${a + 1}-${b + 1}`; };

export default function Promotion() {
  const { meta, years, reload, go } = useApp(); const toast = useToast();
  const [from, setFrom] = useState(meta.current_year);
  const [to, setTo] = useState(years.find(y => y.name > meta.current_year)?.name ?? '');
  const [preview, setPreview] = useState<Row | null>(null);
  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false); const [summary, setSummary] = useState<Row | null>(null);
  const [onlyDues, setOnlyDues] = useState(false);

  const createYear = async () => {
    const name = nextYearName(from);
    try { await api.post('/academic-years', { name, make_current: false, copy_classes_from: from }); toast(`${name} created with the same classes as ${from}`); await reload(); setTo(name); }
    catch (e) { toast(errMsg(e), 'error'); }
  };
  const load = async () => {
    setLoading(true); setError(''); setSummary(null);
    try {
      const p = await api.get('/promotion/preview', { from_year: from, to_year: to });
      setPreview(p);
      setChoices(Object.fromEntries(p.items.map((i: Row) => [i.student_id, { action: i.already_in_to_year ? 'skip' : i.suggested_action, target: i.suggested_class_id ?? '' }])));
    } catch (e) { setError(errMsg(e)); setPreview(null); } finally { setLoading(false); }
  };
  const copyClasses = async () => { try { const r = await api.post('/academic-years/copy-classes', undefined, { from_year: from, to_year: to }); toast(`${r.created} classes added to ${to}`); await reload(); await load(); } catch (e) { toast(errMsg(e), 'error'); } };

  const set = (id: number, c: Partial<Choice>) => setChoices(p => ({ ...p, [id]: { ...p[id], ...c } }));
  const items: Row[] = useMemo(() => preview?.items ?? [], [preview]);
  const shown = onlyDues ? items.filter(i => Number(i.balance) > 0) : items;
  const counts = useMemo(() => { const c: Record<string, number> = {}; Object.values(choices).forEach(x => { c[x.action] = (c[x.action] ?? 0) + 1; }); return c; }, [choices]);
  const missingTarget = items.filter(i => choices[i.student_id]?.action === "promote" && !choices[i.student_id]?.target).length;

  const run = async () => {
    const body = { from_year: from, to_year: to, items: items.filter(i => choices[i.student_id].action !== 'skip').map(i => ({ student_id: i.student_id, action: choices[i.student_id].action, target_class_id: choices[i.student_id].target || null })) };
    try { const r = await api.post('/promotion/run', body); setSummary(r); setConfirm(false); setPreview(null); toast('Promotion completed'); await reload(); } catch (e) { toast(errMsg(e), 'error'); setConfirm(false); }
  };
  const makeCurrent = async () => { const y = years.find(x => x.name === to); if (!y) return; try { await api.post(`/academic-years/${y.id}/set-current`); await reload(); toast(`${to} is now the current academic year`); go('dashboard'); } catch (e) { toast(errMsg(e), 'error'); } };

  const sameYear = from === to;
  return <>
    <PageHead title="Year-end promotion" sub="Move last year’s students into the new academic year — promote, keep in the same class, or mark as passed out." />
    <Card title="1 · Choose years">
      <div className="row3" style={{ alignItems: 'end' }}>
        <Field label="Promote students FROM"><select value={from} onChange={e => { setFrom(e.target.value); setPreview(null); }}>{years.map(y => <option key={y.id}>{y.name}</option>)}</select></Field>
        <Field label="…INTO academic year"><select value={to} onChange={e => { setTo(e.target.value); setPreview(null); }}><option value="">Select</option>{years.filter(y => y.name !== from).map(y => <option key={y.id}>{y.name}</option>)}</select></Field>
        <div className="field"><Btn variant="ghost" onClick={createYear}>+ Create {nextYearName(from)}</Btn></div>
      </div>
      {!to && <div className="note">Create the new academic year first. Its classes are copied from {from}, so Class 9-A becomes Class 9-A next year and students can be moved up.</div>}
      <Btn onClick={load} busy={loading} disabled={!to || sameYear}><Repeat2 size={16} />Load students</Btn>
    </Card>
    {error && <ErrorBox msg={error} />}
    {loading && <Loading />}
    {summary && <Card title="Done"><div className="note" style={{ background: 'var(--green-l)', color: '#14664f' }}><CheckCircle2 size={18} /><div><b>{summary.promoted} promoted, {summary.repeated} kept in same class, {summary.passed_out} passed out, {summary.left} left.</b>{summary.skipped > 0 && ` ${summary.skipped} were already in ${to} and were skipped.`}</div></div>
      <div className="note"><span>School bus: promoted students are asked to choose their bus for {to} when they next sign in. You can see who has not chosen under <button className="link" onClick={() => go('transport')}>Transport</button>.</span></div>
      {summary.errors.length > 0 && <ErrorBox msg={`Some students were not processed: ${summary.errors.join('; ')}`} />}
      <div style={{ display: 'flex', gap: 10 }}><Btn onClick={makeCurrent}>Make {to} the current year <ArrowRight size={16} /></Btn><Btn variant="ghost" onClick={() => go('students')}>View students</Btn></div></Card>}
    {preview && <Card title={`2 · Review ${items.length} students`} actions={<label className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={onlyDues} onChange={e => setOnlyDues(e.target.checked)} />Only students with fee dues</label>}>
      {preview.missing_grades.length > 0 && <div className="note warn"><div>No class found in {to} for: <b>{preview.missing_grades.join(', ')}</b>. <button className="link" onClick={copyClasses}>Copy all classes from {from}</button> or add them under Classes & years, then reload.</div></div>}
      {items.length === 0 ? <Empty>No active students found in {from}.</Empty> : <>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <Badge tone="green">{counts.promote ?? 0} promote</Badge><Badge tone="amber">{counts.repeat ?? 0} stay in class</Badge><Badge tone="blue">{counts.passed_out ?? 0} passed out</Badge><Badge tone="gray">{counts.left ?? 0} left</Badge>{(counts.skip ?? 0) > 0 && <Badge tone="gray">{counts.skip} already done</Badge>}</div>
        <div className="table-wrap"><table><thead><tr><th>Student</th><th>Current class</th><th>Fee due</th><th>Action</th><th>New class ({to})</th></tr></thead><tbody>
          {shown.map(i => { const c = choices[i.student_id]; const need = c.action === 'promote' || c.action === 'repeat';
            return <tr key={i.student_id}><td><b>{i.name}</b><div className="muted small mono">{i.admission_no}</div></td><td>{i.class_label}</td>
              <td>{Number(i.balance) > 0 ? <span style={{ color: 'var(--red)', fontWeight: 600 }}>{inr(i.balance)}</span> : <span className="muted">—</span>}</td>
              <td>{c.action === 'skip' ? <Badge>already in {to}</Badge> : <select value={c.action} onChange={e => set(i.student_id, { action: e.target.value })} aria-label={`Action for ${i.name}`}><option value="promote">Promote</option><option value="repeat">Stay in same class</option><option value="passed_out">Passed out</option><option value="left">Left school</option></select>}</td>
              <td>{need ? <select value={c.target} onChange={e => set(i.student_id, { target: e.target.value ? Number(e.target.value) : '' })} aria-label={`New class for ${i.name}`}><option value="">{c.action === 'repeat' ? 'Same class' : 'Select class'}</option>{preview.to_year_classes.map((k: Row) => <option key={k.id} value={k.id}>{k.label}</option>)}</select> : <span className="muted">—</span>}</td></tr>; })}
        </tbody></table></div>
        <div className="modal-actions"><Btn onClick={() => setConfirm(true)} disabled={missingTarget > 0}>Review &amp; run promotion</Btn></div>
        {missingTarget > 0 && <p className="small" style={{ color: 'var(--red)', textAlign: 'right' }}>{missingTarget} students still need a new class.</p>}</>}
    </Card>}
    {confirm && <Confirm title="Run promotion?" confirmLabel="Yes, run promotion" onClose={() => setConfirm(false)} onConfirm={run}
      message={<><p>This will move students from <b>{from}</b> to <b>{to}</b>:</p><ul><li>{counts.promote ?? 0} promoted to the next class</li><li>{counts.repeat ?? 0} kept in the same class</li><li>{counts.passed_out ?? 0} marked passed out (login disabled)</li><li>{counts.left ?? 0} marked left (login disabled)</li></ul><p>Each student’s class history is kept. This cannot be undone in bulk.</p></>} />}
  </>;
}
