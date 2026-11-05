import { useEffect, useState } from 'react';
import { AlertTriangle, Sparkles, Users } from 'lucide-react';
import { api, type Row } from '../api';
import AnalysisView from '../shared/Analysis';
import { Badge, Btn, Card, Empty, ErrorBox, Loading, Modal, errMsg, useLoad, useToast } from '../ui';

const tone = (p: number | null) => (p == null ? '#c3c9da' : p >= 75 ? '#1f9a7c' : p >= 55 ? '#d99a1b' : '#d6455d');
function Bars({ rows }: { rows: { label: string; pct: number | null }[] }) {
  return <>{rows.map(r => <div className="cbar" key={r.label}><span title={r.label}>{r.label}</span><div className="tbar"><i style={{ width: `${r.pct ?? 0}%`, background: tone(r.pct) }} /></div><b style={{ color: tone(r.pct) }}>{r.pct ?? '—'}%</b></div>)}</>;
}

/** Class performance for admin and teachers: which subjects and topics the class is weak in, and which students are falling behind. */
export default function Insights() {
  const toast = useToast(); const classes = useLoad<Row[]>(() => api.get('/insights/classes'), []);
  const [cid, setCid] = useState(''); const [ai, setAi] = useState<Row | null>(null); const [aiBusy, setAiBusy] = useState(false); const [student, setStudent] = useState<Row | null>(null);
  useEffect(() => { if (!cid && classes.data?.length) setCid(String(classes.data[0].id)); }, [classes.data]);   // eslint-disable-line
  const cls = useLoad<Row | null>(() => (cid ? api.get(`/insights/class/${cid}`) : Promise.resolve(null)), [cid]);
  useEffect(() => setAi(null), [cid]);
  const summary = async () => { setAiBusy(true); try { setAi(await api.post(`/insights/class/${cid}/summary`)); } catch (e) { toast(errMsg(e), 'error'); } finally { setAiBusy(false); } };
  const open = async (s: Row) => { try { setStudent({ ...(await api.get(`/insights/student/${s.student_id}`)), id: s.student_id }); } catch (e) { toast(errMsg(e), 'error'); } };
  const c = cls.data;
  return <>
    <div style={{ marginBottom: 12 }}><h2 style={{ fontSize: 21, margin: 0 }}>Performance insights</h2><p className="muted" style={{ margin: '2px 0 0' }}>Built from question-wise marks of published exams.</p></div>
    <Card><div className="toolbar" style={{ marginBottom: 0 }}><select value={cid} onChange={e => setCid(e.target.value)} aria-label="Class">{!classes.data?.length && <option value="">No classes</option>}{classes.data?.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}</select></div></Card>
    {cls.loading ? <Loading /> : cls.error ? <ErrorBox msg={cls.error} retry={cls.reload} /> : !c ? null : !c.with_data ? <Card><Empty>No question-wise marks yet for this class. Teachers add them under Question papers → Enter marks, and results must be published.</Empty></Card> : <>
      <div className="grid g4" style={{ marginBottom: 16 }}>
        <div className="stat"><div><b style={{ color: tone(c.average) }}>{c.average}%</b><span>Class average</span></div></div>
        <div className="stat"><div className="ico t-purple"><Users size={22} /></div><div><b>{c.with_data}/{c.students}</b><span>Students with data</span></div></div>
        <div className="stat"><div className="ico t-red"><AlertTriangle size={22} /></div><div><b>{c.at_risk.length}</b><span>Below 40%</span></div></div>
        <div className="stat"><div><b>{c.topics[0]?.topic ?? '—'}</b><span>Weakest topic</span></div></div></div>
      <Card title="AI summary for this class" actions={<Btn variant="soft" className="btn-sm" busy={aiBusy} onClick={summary}><Sparkles size={14} />{ai ? 'Refresh' : 'Create summary'}</Btn>}>
        {!ai ? <p className="muted" style={{ margin: 0 }}>Press “Create summary” for a plain-language reading of where this class is strong, where it is weak, and what to do about it.</p> :
          <div className="ai-sum"><p className="ai-head">{ai.headline}</p><h4>What we see</h4><ul>{ai.observations?.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul><h4>Suggested actions</h4><ul>{ai.actions?.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></div>}</Card>
      <div className="grid g2">
        <Card title="Subjects"><Bars rows={c.subjects.map((s: Row) => ({ label: s.subject, pct: s.pct }))} /></Card>
        <Card title="Weakest topics (whole class)"><Bars rows={c.topics.slice(0, 8).map((t: Row) => ({ label: `${t.topic} · ${t.subject}`, pct: t.pct }))} /></Card></div>
      <Card title="Students — lowest first">
        <div className="table-wrap"><table><thead><tr><th>Student</th><th>Overall</th><th>Struggling with</th></tr></thead><tbody>
          {c.student_list.map((s: Row) => <tr key={s.student_id} style={{ cursor: 'pointer' }} onClick={() => open(s)}><td><b>{s.name}</b><div className="muted small mono">{s.admission_no}</div></td>
            <td>{s.pct == null ? <span className="muted">No data</span> : <Badge tone={s.pct >= 75 ? 'green' : s.pct >= 40 ? 'amber' : 'red'}>{s.pct}%</Badge>}</td>
            <td>{s.weak_topics.length ? s.weak_topics.join(', ') : <span className="muted">—</span>}</td></tr>)}</tbody></table></div></Card></>}
    {student && <Modal wide title={student.name} subtitle={`${student.class_label} · performance`} onClose={() => setStudent(null)}>
      <div style={{ maxHeight: '70vh', overflow: 'auto' }}><AnalysisView a={student} who="the student" onGenerate={async () => { try { const r = await api.post(`/insights/student/${student.id}/summary`); setStudent((p: Row) => ({ ...p, ...r })); } catch (e) { toast(errMsg(e), 'error'); } }} /></div></Modal>}
  </>;
}
