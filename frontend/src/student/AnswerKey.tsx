import { useState } from 'react';
import { BookOpenCheck, ChevronLeft, KeyRound } from 'lucide-react';
import { api, type Row } from '../api';
import { Badge, Card, Empty, ErrorBox, Loading, useLoad } from '../ui';

/** Model answers the teacher has reviewed and published. Pick the exam, then the subject. */
export default function AnswerKey() {
  const list = useLoad<Row[]>(() => api.get('/portal/answer-keys'), []);
  const [exam, setExam] = useState<string | null>(null); const [paper, setPaper] = useState<number | null>(null);
  const detail = useLoad<Row | null>(() => (paper ? api.get(`/portal/answer-keys/${paper}`) : Promise.resolve(null)), [paper]);
  if (list.loading) return <Loading />; if (list.error || !list.data) return <ErrorBox msg={list.error} retry={list.reload} />;
  if (!list.data.length) return <Card><Empty><KeyRound size={18} />No answer keys yet. Your teachers will publish them after the exams.</Empty></Card>;
  const exams = Array.from(new Set(list.data.map(p => p.exam)));
  if (paper) {
    const d = detail.data;
    return <>
      <button className="link" style={{ display: 'inline-flex', gap: 5, alignItems: 'center', marginBottom: 12 }} onClick={() => setPaper(null)}><ChevronLeft size={16} />Back</button>
      {detail.loading || !d ? <Loading /> : <>
        <div className="note"><BookOpenCheck size={16} /><span><b>{d.subject}</b> · {d.exam} · {d.total_marks} marks. These are model answers — write in your own words in the exam.</span></div>
        {d.questions.map((q: Row, i: number) => <article className="akq" key={q.id} style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}>
          <div className="qhead"><span className="qn">{q.number}</span><div style={{ flex: 1 }}><b style={{ lineHeight: 1.5 }}>{q.text}</b>
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}><Badge tone="purple">{q.marks} marks</Badge>{q.topic && <Badge>{q.topic}</Badge>}{q.word_limit && q.marks > 1 && <Badge tone="gray">~{q.word_limit} words</Badge>}</div></div></div>
          <p className="ans">{q.answer}</p>
          {q.keywords.length > 0 && <div><span className="muted small">Keywords: </span>{q.keywords.map((k: string) => <span className="kw" key={k}>{k}</span>)}</div>}
        </article>)}</>}
    </>;
  }
  return <>
    <div style={{ marginBottom: 14 }}><h2 style={{ fontSize: 21, margin: 0 }}>Answer key</h2><p className="muted" style={{ margin: '2px 0 0' }}>Choose an exam, then a subject.</p></div>
    <div className="seg" style={{ marginBottom: 16, flexWrap: 'wrap' }}>{exams.map(e => <button key={e} className={(exam ?? exams[0]) === e ? 'on' : ''} onClick={() => setExam(e)}>{e}</button>)}</div>
    <div className="grid g3">{list.data.filter(p => p.exam === (exam ?? exams[0])).map(p => <button key={p.paper_id} className="keycard" onClick={() => setPaper(p.paper_id)}><KeyRound size={22} /><b>{p.subject}</b><span className="muted small">View answers</span></button>)}</div>
  </>;
}
