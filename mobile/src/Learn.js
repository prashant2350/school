import React, { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { api } from './api';
import { B, Bar, Btn, C, Card, Chips, Empty, ErrorView, FadeIn, H, Loading, P, Page, Pill, tone, useLoad } from './ui';

// ── Answer key ───────────────────────────────────────────────────────────────
export function AnswerKey() {
  const list = useLoad(() => api.get('/portal/answer-keys'), []);
  const [exam, setExam] = useState(null); const [paper, setPaper] = useState(null);
  const detail = useLoad(() => (paper ? api.get(`/portal/answer-keys/${paper}`) : Promise.resolve(null)), [paper]);
  if (list.loading) return <Page><Loading /></Page>; if (list.error) return <Page><ErrorView msg={list.error} retry={list.reload} /></Page>;
  if (!list.data.length) return <Page onRefresh={list.reload}><H>Answer key</H><Card style={{ marginTop: 12 }}><Empty>No answer keys yet. Your teachers will publish them after the exams.</Empty></Card></Page>;
  if (paper) { const d = detail.data;
    return <Page>
      <TouchableOpacity onPress={() => setPaper(null)}><Text style={{ color: C.purpleD, fontWeight: '700', marginBottom: 12 }}>‹ All subjects</Text></TouchableOpacity>
      {detail.loading || !d ? <Loading /> : <><H>{d.subject}</H><P style={{ marginBottom: 12 }}>{d.exam} · {d.total_marks} marks · model answers, write in your own words</P>
        {d.questions.map((q, i) => <FadeIn key={q.id} i={i}><Card>
          <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ minWidth: 34, height: 34, borderRadius: 10, backgroundColor: C.purpleL, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontWeight: '800', color: C.purpleD }}>{q.number}</Text></View>
            <View style={{ flex: 1 }}><B style={{ lineHeight: 21 }}>{q.text}</B>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 8 }}><Pill>{q.marks} marks</Pill>{!!q.topic && <Pill color={C.muted}>{q.topic}</Pill>}{q.marks > 1 && !!q.word_limit && <Pill color={C.muted}>~{q.word_limit} words</Pill>}</View></View></View>
          <View style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#f7f8fc', borderLeftWidth: 4, borderLeftColor: C.purple }}><Text style={{ color: C.ink, lineHeight: 22 }}>{q.answer}</Text></View>
          {q.keywords.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>{q.keywords.map((k) => <View key={k} style={{ backgroundColor: '#fff4d6', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ color: '#8a5a00', fontSize: 12.5 }}>{k}</Text></View>)}</View>}
        </Card></FadeIn>)}</>}
    </Page>; }
  const exams = [...new Set(list.data.map((p) => p.exam))]; const cur = exam ?? exams[0];
  return <Page onRefresh={list.reload}><H>Answer key</H><P style={{ marginBottom: 12 }}>Choose an exam, then a subject.</P>
    <Chips options={exams} value={cur} onChange={setExam} />
    {list.data.filter((p) => p.exam === cur).map((p, i) => <FadeIn key={p.paper_id} i={i}><TouchableOpacity activeOpacity={0.85} onPress={() => setPaper(p.paper_id)}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}><Text style={{ fontSize: 26 }}>🔑</Text><View style={{ flex: 1 }}><B>{p.subject}</B><P small>Tap to see all answers</P></View><Text style={{ color: C.purple, fontSize: 22 }}>›</Text></Card></TouchableOpacity></FadeIn>)}
  </Page>;
}

// ── My progress ──────────────────────────────────────────────────────────────
export function Progress() {
  const { data: a, loading, error, reload, setData } = useLoad(() => api.get('/portal/analysis'), []);
  const [busy, setBusy] = useState(false); const [tried, setTried] = useState(false); const [msg, setMsg] = useState('');
  const make = async () => { setBusy(true); setMsg(''); try { const r = await api.post('/portal/analysis/summary'); setData((d) => ({ ...d, ...r })); } catch (e) { setMsg(e.message); } finally { setBusy(false); } };
  useEffect(() => { if (a && a.has_data && !a.summary && !tried) { setTried(true); make(); } }, [a]); // eslint-disable-line
  if (loading) return <Page><Loading /></Page>; if (error) return <Page><ErrorView msg={error} retry={reload} /></Page>;
  if (!a.has_data) return <Page onRefresh={reload}><H>My progress</H><Card style={{ marginTop: 12 }}><Empty>No analysis yet. It appears once your teacher has entered question-wise marks and the exam results are published.</Empty></Card></Page>;
  const s = a.summary; const by = {}; a.topics.forEach((t) => { (by[t.subject] = by[t.subject] || []).push(t); });
  return <Page onRefresh={reload}>
    <H>My progress</H><P style={{ marginBottom: 12 }}>How you are doing, topic by topic.</P>
    <FadeIn><Card title="✨ Mentor's summary">
      {!s ? (busy ? <P>Reading your marks and writing a summary…</P> : <><P style={{ marginBottom: 10 }}>{msg || 'Get a short AI summary of what is going well and what to practise next.'}</P><Btn onPress={make}>Create summary</Btn></>) : <>
        <Text style={{ fontSize: 17, fontWeight: '800', color: C.ink, lineHeight: 24 }}>{s.headline}</Text>
        {!!s.strengths?.length && <Sec t="📈 Going well" items={s.strengths} />}
        {!!s.weak_areas?.length && <Sec t="🎯 Needs more practice" items={s.weak_areas.map((w) => `${w.topic} — ${w.advice}`)} />}
        {!!s.study_plan?.length && <Sec t="💡 This week" items={s.study_plan} numbered />}
        {!!s.encouragement && <View style={{ marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: C.purpleL }}><Text style={{ color: C.purpleD, fontWeight: '700' }}>{s.encouragement}</Text></View>}
        {a.summary_stale && <View style={{ marginTop: 10 }}><Btn kind="soft" busy={busy} onPress={make}>Update with new marks</Btn></View>}</>}
    </Card></FadeIn>
    <FadeIn i={1}><Card title="Focus on these">{a.weak.length ? a.weak.map((t) => <Row key={t.subject + t.topic} t={t} />) : <Empty>No weak topics. Well done!</Empty>}</Card></FadeIn>
    <FadeIn i={2}><Card title="Strong topics">{a.strong.length ? a.strong.map((t) => <Row key={t.subject + t.topic} t={t} />) : <Empty>Strong topics (75%+) will show here.</Empty>}</Card></FadeIn>
    <FadeIn i={3}><Card title="Topic by topic" right={<P small>▏= class avg</P>}>
      {Object.entries(by).map(([subj, ts]) => <View key={subj} style={{ marginBottom: 12 }}><Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1, color: C.muted, textTransform: 'uppercase' }}>{subj}</Text>
        {ts.map((t) => <View key={t.topic} style={{ marginTop: 8 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><B style={{ fontWeight: '600' }}>{t.topic}</B><Text style={{ color: tone(t.pct), fontWeight: '800' }}>{t.pct}%</Text></View>
          <Bar pct={t.pct} mark={t.class_pct} /><P small>{t.scored} of {t.possible} marks</P></View>)}</View>)}</Card></FadeIn>
    <FadeIn i={4}><Card title="Question by question">{a.exams.map((e) => <View key={e.exam_id} style={{ marginBottom: 12 }}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><B>{e.exam}</B><P small>{e.pct}% overall</P></View>
      {e.subjects.map((sub) => <View key={sub.subject} style={{ marginTop: 8 }}><P small style={{ fontWeight: '700' }}>{sub.subject} · {sub.scored}/{sub.possible}</P>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>{sub.questions.map((q, i) => <View key={i} style={{ borderWidth: 1.5, borderColor: tone(q.pct), backgroundColor: tone(q.pct) + '18', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 }}><Text style={{ fontSize: 12.5, color: C.ink }}><Text style={{ fontWeight: '800' }}>Q{q.number}</Text> {q.scored}/{q.marks}</Text></View>)}</View></View>)}</View>)}</Card></FadeIn>
  </Page>;
}
const Row = ({ t }) => <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}><View style={{ flex: 1 }}><B style={{ fontWeight: '600' }}>{t.topic}</B><P small>{t.subject}</P></View><Text style={{ color: tone(t.pct), fontWeight: '800', fontSize: 16 }}>{t.pct}%</Text></View>;
const Sec = ({ t, items, numbered }) => <View style={{ marginTop: 14 }}><Text style={{ fontWeight: '800', color: C.purpleD, marginBottom: 4 }}>{t}</Text>{items.map((x, i) => <Text key={i} style={{ color: C.ink, lineHeight: 22 }}>{numbered ? `${i + 1}. ` : '• '}{x}</Text>)}</View>;
