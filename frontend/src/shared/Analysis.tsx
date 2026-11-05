import { useEffect, useState } from 'react';
import { Lightbulb, RefreshCw, Sparkles, Target, TrendingUp } from 'lucide-react';
import type { Row } from '../api';
import { Btn, Card, Empty } from '../ui';

const tone = (p: number | null) => (p == null ? '#c3c9da' : p >= 75 ? '#1f9a7c' : p >= 55 ? '#d99a1b' : '#d6455d');

/** Animated bar. `mark` draws a tick for the class average. */
function Bar({ pct, mark }: { pct: number | null; mark?: number | null }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(pct ?? 0), 60); return () => clearTimeout(t); }, [pct]);
  return <div className="tbar" role="img" aria-label={`${pct ?? 0} percent`}><i style={{ width: `${w}%`, background: tone(pct) }} />{mark != null && <b style={{ left: `${mark}%` }} title={`Class average ${mark}%`} />}</div>;
}

function Spark({ points }: { points: Row[] }) {
  const v = points.filter(p => p.pct != null);
  if (v.length < 2) return <span className="muted small">{v.length ? `${v[0].pct}% so far` : '—'}</span>;
  const W = 120, H = 34, step = W / (v.length - 1);
  const d = v.map((p, i) => `${i * step},${H - 4 - (p.pct / 100) * (H - 8)}`).join(' ');
  return <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Trend"><polyline points={d} fill="none" stroke="var(--purple)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    {v.map((p, i) => <circle key={i} cx={i * step} cy={H - 4 - (p.pct / 100) * (H - 8)} r="3.4" fill="#fff" stroke="var(--purple)" strokeWidth="2"><title>{p.exam}: {p.pct}%</title></circle>)}</svg>;
}

/** Shared by the student's "My progress" page and the admin / teacher view of one student. */
export default function AnalysisView({ a, onGenerate, busy, who = 'you' }: { a: Row; onGenerate?: () => void; busy?: boolean; who?: string }) {
  if (!a.has_data) return <Card><Empty>No analysis yet. It appears once the teacher has entered question-wise marks and the admin has published the exam results.</Empty></Card>;
  const s = a.summary; const bySubject: Record<string, Row[]> = {};
  a.topics.forEach((t: Row) => { (bySubject[t.subject] ??= []).push(t); });
  return <>
    <Card title="Your mentor's summary" actions={onGenerate && s && a.summary_stale && <Btn variant="soft" className="btn-sm" busy={busy} onClick={onGenerate}><RefreshCw size={14} />Update</Btn>}>
      {!s ? (busy ? <div className="ai-load"><Sparkles size={18} /><span>Reading {who === 'you' ? 'your' : 'the'} marks and writing a summary…</span><i /><i /><i /></div>
        : <div className="live"><Sparkles size={20} /><p style={{ margin: '6px 0 10px' }}>Get a short AI summary of what is going well and what to practise next.</p>{onGenerate && <Btn onClick={onGenerate}><Sparkles size={16} />Create summary</Btn>}</div>)
        : <div className="ai-sum">
          <p className="ai-head">{s.headline}</p>
          {!!s.strengths?.length && <><h4><TrendingUp size={15} />Going well</h4><ul>{s.strengths.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></>}
          {!!s.weak_areas?.length && <><h4><Target size={15} />Needs more practice</h4><ul>{s.weak_areas.map((w: Row, i: number) => <li key={i}><b>{w.topic}</b> — {w.advice}</li>)}</ul></>}
          {!!s.study_plan?.length && <><h4><Lightbulb size={15} />This week</h4><ol>{s.study_plan.map((x: string, i: number) => <li key={i}>{x}</li>)}</ol></>}
          {s.encouragement && <p className="ai-enc">{s.encouragement}</p>}
          <p className="muted small" style={{ margin: '10px 0 0' }}>Written by AI from the marks below. Your teacher is the best guide.</p></div>}
    </Card>

    <div className="grid g2">
      <Card title="Strong topics">{a.strong.length ? a.strong.map((t: Row) => <div key={t.subject + t.topic} className="trow"><span><b>{t.topic}</b><small className="muted"> {t.subject}</small></span><b style={{ color: tone(t.pct) }}>{t.pct}%</b></div>) : <Empty>Keep going — strong topics (75%+) will show here.</Empty>}</Card>
      <Card title="Focus on these">{a.weak.length ? a.weak.map((t: Row) => <div key={t.subject + t.topic} className="trow"><span><b>{t.topic}</b><small className="muted"> {t.subject}</small></span><b style={{ color: tone(t.pct) }}>{t.pct}%</b></div>) : <Empty>No weak topics. Well done!</Empty>}</Card>
    </div>

    <Card title="Topic by topic" actions={<span className="muted small">▏ = class average</span>}>
      {Object.entries(bySubject).map(([subj, ts]) => <div key={subj} style={{ marginBottom: 14 }}><h4 className="tsub">{subj}</h4>
        {ts.map(t => <div key={t.topic} className="tline"><div className="tname"><span>{t.topic}</span><b style={{ color: tone(t.pct) }}>{t.pct ?? '—'}%</b></div><Bar pct={t.pct} mark={t.class_pct} />
          <div className="muted small">{t.scored} of {t.possible} marks · {t.questions} question{t.questions > 1 ? 's' : ''}</div></div>)}</div>)}
    </Card>

    {a.trend.some((t: Row) => t.points.length > 1) && <Card title="Progress over exams">{a.trend.map((t: Row) => <div key={t.subject} className="trow"><b>{t.subject}</b><Spark points={t.points} /></div>)}</Card>}

    <Card title="Question by question">{a.exams.map((e: Row) => <details key={e.exam_id} className="qd" open={e === a.exams[0]}><summary><b>{e.exam}</b><span className="muted small">{e.pct}% overall</span></summary>
      {e.subjects.map((s: Row) => <div key={s.subject} style={{ margin: '10px 0' }}><div className="tname"><b>{s.subject}</b><span style={{ color: tone(s.pct) }}>{s.scored}/{s.possible}</span></div>
        <div className="qchips">{s.questions.map((q: Row, i: number) => <span key={i} className="qchip" style={{ borderColor: tone(q.pct), background: `${tone(q.pct)}18` }} title={q.topic}><b>Q{q.number}</b> {q.scored}/{q.marks}</span>)}</div></div>)}</details>)}</Card>
  </>;
}
