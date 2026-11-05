import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from './api';
import { Avatar, Profile } from './Profile';
import { B, Btn, C, Card, Empty, ErrorView, FadeIn, H, Loading, P, Page, Pill, Section, Tile, fmtDate, inr, useLoad } from './ui';

// ── Home ─────────────────────────────────────────────────────────────────────
export function Home({ go }) {
  const me = useLoad(() => api.get('/portal/me'), []); const notices = useLoad(() => api.get('/portal/notices'), []);
  if (me.loading) return <Page><Loading /></Page>; if (me.error) return <Page><ErrorView msg={me.error} retry={me.reload} /></Page>;
  const m = me.data; const att = m.attendance?.percentage; const first = m.name.split(' ')[0]; const dot = [C.purple, '#2f78c4', C.green, C.red, C.amber];
  return <Page onRefresh={() => { me.reload(); notices.reload(); }}>
    <FadeIn><View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18 }}>
      <Avatar name={m.name} hasPhoto={m.has_photo} size={46} />
      <View style={{ flex: 1, marginHorizontal: 12 }}><Text numberOfLines={1} style={{ fontSize: 20, fontWeight: '800', color: C.ink, letterSpacing: -0.4 }}>Hi, {first}</Text><Text numberOfLines={1} style={{ color: C.muted, fontSize: 13 }}>{m.class} · {m.admission_no}</Text></View>
      <TouchableOpacity onPress={() => go('more', 'notices')} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 2 }}><Ionicons name="notifications-outline" size={21} color={C.ink} /></TouchableOpacity></View></FadeIn>
    <FadeIn i={1}><View style={{ backgroundColor: C.purple, borderRadius: 26, padding: 20, marginBottom: 20 }}>
      <Text style={{ color: '#ffffffcc', fontSize: 13, fontWeight: '600' }}>This year's attendance</Text>
      <Text style={{ color: '#fff', fontSize: 44, fontWeight: '900', letterSpacing: -1.5, marginVertical: 2 }}>{att != null ? `${att}%` : '—'}</Text>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <TouchableOpacity activeOpacity={0.85} onPress={() => go('more', 'fees')} style={{ flex: 1, backgroundColor: '#ffffff26', borderRadius: 16, padding: 12 }}><Text style={{ color: '#ffffffcc', fontSize: 12 }}>Fees pending</Text><Text numberOfLines={1} style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>{inr(m.balance)}</Text></TouchableOpacity>
        <TouchableOpacity activeOpacity={0.85} onPress={() => go('bus')} style={{ flex: 1, backgroundColor: '#ffffff26', borderRadius: 16, padding: 12 }}><Text style={{ color: '#ffffffcc', fontSize: 12 }}>School bus</Text><Text numberOfLines={1} style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>{m.transport ? `Bus ${m.transport.bus_number}` : 'Choose'}</Text></TouchableOpacity></View></View></FadeIn>
    <FadeIn i={2}><Section title="Quick access" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -18 }} contentContainerStyle={{ paddingHorizontal: 18 }}>
        <Tile icon="key-outline" label="Answers" onPress={() => go('answers')} /><Tile icon="stats-chart-outline" label="Progress" color="#1f9a7c" onPress={() => go('progress')} />
        <Tile icon="calendar-outline" label="Attendance" color="#2f78c4" onPress={() => go('more', 'attendance')} /><Tile icon="card-outline" label="Fees" color="#d6455d" onPress={() => go('more', 'fees')} />
        <Tile icon="document-text-outline" label="Results" color="#d99a1b" onPress={() => go('more', 'results')} /><Tile icon="person-outline" label="Profile" color="#6b7390" onPress={() => go('more', 'profile')} /></ScrollView></FadeIn>
    <FadeIn i={3}><Section title="Notices" right={<TouchableOpacity onPress={() => go('more', 'notices')}><Text style={{ color: C.purple, fontWeight: '700' }}>See all</Text></TouchableOpacity>} />
      {notices.loading ? <Loading /> : !notices.data?.length ? <Card><Empty>No notices right now.</Empty></Card> :
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -18 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 6 }}>
          {notices.data.slice(0, 6).map((n, i) => <TouchableOpacity key={n.id} activeOpacity={0.9} onPress={() => go('more', 'notices')} style={{ width: 230, marginRight: 12 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 22, padding: 16, height: 128, elevation: 2, shadowColor: '#1b2140', shadowOpacity: 0.07, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot[i % 5], marginBottom: 10 }} />
              <Text numberOfLines={2} style={{ fontSize: 15, fontWeight: '800', color: C.ink, lineHeight: 20 }}>{n.title}</Text>
              <Text numberOfLines={1} style={{ color: C.muted, fontSize: 12.5, marginTop: 'auto' }}>{fmtDate(n.created_at)}</Text></View></TouchableOpacity>)}</ScrollView>}</FadeIn>
  </Page>;
}

// ── More menu ────────────────────────────────────────────────────────────────
export function More({ sub, setSub, onLogout }) {
  const back = <TouchableOpacity onPress={() => setSub(null)}><Text style={{ color: C.purpleD, fontWeight: '700', marginBottom: 12 }}>‹ More</Text></TouchableOpacity>;
  if (sub === 'attendance') return <Attendance back={back} />; if (sub === 'fees') return <Fees back={back} />;
  if (sub === 'results') return <Results back={back} />; if (sub === 'notices') return <Notices back={back} />; if (sub === 'profile') return <Profile back={back} />;
  const items = [['attendance', 'calendar-outline', 'Attendance', '#2f78c4'], ['fees', 'card-outline', 'Fees', '#d6455d'], ['results', 'document-text-outline', 'Results', '#d99a1b'], ['notices', 'notifications-outline', 'Notices', '#6f63e0'], ['profile', 'person-outline', 'My profile', '#6b7390']];
  return <Page><H style={{ marginBottom: 12 }}>More</H>{items.map(([k, ic, l, col], i) => <FadeIn key={k} i={i}><TouchableOpacity activeOpacity={0.85} onPress={() => setSub(k)}><Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
    <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: col + '1c', alignItems: 'center', justifyContent: 'center' }}><Ionicons name={ic} size={22} color={col} /></View><B style={{ flex: 1 }}>{l}</B><Ionicons name="chevron-forward" size={18} color={C.muted} /></Card></TouchableOpacity></FadeIn>)}
    <Btn kind="soft" onPress={onLogout} style={{ marginTop: 10 }}>Sign out</Btn></Page>;
}

function Wrap({ back, load, children }) {
  if (load.loading) return <Page>{back}<Loading /></Page>; if (load.error) return <Page>{back}<ErrorView msg={load.error} retry={load.reload} /></Page>;
  return <Page onRefresh={load.reload}>{back}{children(load.data)}</Page>;
}

function Attendance({ back }) {
  const l = useLoad(() => api.get('/portal/attendance'), []);
  return <Wrap back={back} load={l}>{(d) => <><H style={{ marginBottom: 10 }}>Attendance</H><Card><Text style={{ fontSize: 32, fontWeight: '900', color: d.summary.percentage >= 75 ? C.green : C.red }}>{d.summary.percentage ?? '—'}%</Text><P small>Present {d.summary.present} · Absent {d.summary.absent} of {d.summary.total_days} days</P></Card>
    <Card title="Recent days">{!d.records.length ? <Empty>No records yet.</Empty> : d.records.slice(0, 40).map((r, i) => <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.line }}><Text style={{ color: C.ink }}>{fmtDate(r.date)}</Text><Pill color={r.status === 'present' ? C.green : r.status === 'absent' ? C.red : C.amber}>{r.status.replace('_', ' ')}</Pill></View>)}</Card></>}</Wrap>;
}

function Fees({ back }) {
  const l = useLoad(() => api.get('/portal/fees'), []);
  return <Wrap back={back} load={l}>{(d) => <><H style={{ marginBottom: 10 }}>Fees</H><Card><Text style={{ fontSize: 30, fontWeight: '900', color: Number(d.balance) > 0 ? C.red : C.green }}>{inr(d.balance)}</Text><P small>{Number(d.balance) > 0 ? 'Pending — please pay at the school office' : 'All fees are clear'}</P></Card>
    <Card title="Fees charged">{!d.dues.length ? <Empty>No fees charged yet.</Empty> : d.dues.map((x) => <View key={x.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}><View><B style={{ fontWeight: '600' }}>{x.fee_head}</B><P small>{x.period} · due {fmtDate(x.due_date)}</P></View><B>{inr(Number(x.amount_due) - Number(x.discount))}</B></View>)}</Card>
    <Card title="Payments">{!d.payments.length ? <Empty>No payments yet.</Empty> : d.payments.map((x) => <View key={x.receipt_no} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}><View><B style={{ fontWeight: '600' }}>{x.receipt_no}</B><P small>{fmtDate(x.paid_at)} · {x.payment_mode}</P></View><B style={{ color: C.green }}>{inr(x.amount_paid)}</B></View>)}</Card></>}</Wrap>;
}

function Results({ back }) {
  const l = useLoad(() => api.get('/portal/results'), []);
  return <Wrap back={back} load={l}>{(d) => <><H style={{ marginBottom: 10 }}>Results</H>{!d.length ? <Card><Empty>No results published yet.</Empty></Card> : d.map((e) => <Card key={e.exam_id} title={e.exam} right={<Pill>{e.percentage}% · {e.grade}</Pill>}>
    {e.subjects.map((s) => <View key={s.subject} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.line }}><Text style={{ color: C.ink }}>{s.subject}</Text><B>{Number(s.marks_obtained)}/{Number(s.max_marks)} <Text style={{ color: C.muted }}>({s.grade})</Text></B></View>)}</Card>)}</>}</Wrap>;
}

function Notices({ back }) {
  const l = useLoad(() => api.get('/portal/notices'), []); const [open, setOpen] = useState(null); const cols = [C.purple, '#2f78c4', C.green, C.red, C.amber];
  return <Wrap back={back} load={l}>{(d) => <><H style={{ marginBottom: 10 }}>Notices</H>{!d.length ? <Card><Empty>No notices right now.</Empty></Card> : d.map((n, i) => <FadeIn key={n.id} i={i}><TouchableOpacity activeOpacity={0.85} onPress={() => setOpen(open === n.id ? null : n.id)}>
    <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.line, borderLeftWidth: 5, borderLeftColor: cols[i % 5] }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><B style={{ flex: 1 }}>{n.title}</B><P small>{fmtDate(n.created_at)}</P></View>
      <Text numberOfLines={open === n.id ? undefined : 2} style={{ color: C.muted, marginTop: 6, lineHeight: 21 }}>{n.body}</Text></View></TouchableOpacity></FadeIn>)}</>}</Wrap>;
}