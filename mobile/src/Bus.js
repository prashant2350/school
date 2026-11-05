import React, { useState } from 'react';
import { Image, Text, TouchableOpacity, View, Linking } from 'react-native';
import { api, authHeaders, getBase } from './api';
import { B, Btn, C, Card, Chips, Empty, ErrorView, Field, H, Loading, P, Page, Pill, fmtTime, useLoad } from './ui';

export default function Bus() {
  const { data: d, loading, error, reload, setData } = useLoad(() => api.get('/portal/transport'), []);
  const [edit, setEdit] = useState(false);
  if (loading) return <Page><Loading /></Page>; if (error || !d) return <Page><ErrorView msg={error} retry={reload} /></Page>;
  if (d.needs_preference || edit) return <Pref d={d} onSaved={(x) => { setData(x); setEdit(false); }} onCancel={d.needs_preference ? null : () => setEdit(false)} />;
  const pref = d.preference; const change = !pref.locked && <TouchableOpacity onPress={() => setEdit(true)}><Text style={{ color: C.purpleD, fontWeight: '700' }}>Change</Text></TouchableOpacity>;
  if (!pref.uses_bus) return <Page onRefresh={reload}><H>School bus</H><Card style={{ marginTop: 12 }} right={change}><Empty>You are not using the school bus this year.</Empty></Card></Page>;
  if (d.status === 'pending') return <Page onRefresh={reload}><H>School bus</H><Card style={{ marginTop: 12 }} title="Waiting for the school office" right={change}><P>The office will choose the bus for {pref.pickup_location || 'your pickup point'}. It will appear here.</P></Card></Page>;
  const { bus, stop, driver } = d;
  return <Page onRefresh={reload}><H>School bus</H>
    <Card style={{ marginTop: 12 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
      <View style={{ backgroundColor: '#f1c232', borderWidth: 3, borderColor: '#2a1d00', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 8 }}><Text style={{ fontSize: 28, fontWeight: '900', color: '#2a1d00' }}>{bus.number}</Text></View>
      <View style={{ flex: 1 }}><B>{bus.route_name || 'School bus'}</B>{!!bus.registration_no && <P small>{bus.registration_no}</P>}</View>{change}</View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        <Eta label="Your stop" v={fmtTime(stop?.pickup_time)} /><Eta label="School" v={fmtTime(bus.school_arrival_time)} /><Eta label="Back home" v={fmtTime(stop?.drop_time)} /></View>
      <P small style={{ marginTop: 10 }}>These are estimated times. Please be at your stop a few minutes early.</P></Card>
    {driver && <Card title="Driver"><View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
      {driver.has_photo ? <Image source={{ uri: `${getBase()}/portal/transport/driver-photo?v=${driver.photo_version}`, headers: authHeaders() }} style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: C.line }} />
        : <View style={{ width: 70, height: 70, borderRadius: 35, backgroundColor: C.purpleL, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 26 }}>🧑‍✈️</Text></View>}
      <View style={{ flex: 1 }}><B>{driver.full_name}</B><P small>Licence {driver.license_no}</P><View style={{ marginTop: 8, alignSelf: 'flex-start' }}><Btn kind="soft" onPress={() => Linking.openURL(`tel:${driver.phone}`)}>📞 {driver.phone}</Btn></View></View></View></Card>}
    <Card title="Route and stops">{d.route_stops.map((s) => <View key={s.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}>
      <Text style={{ color: s.mine ? C.purpleD : C.ink, fontWeight: s.mine ? '800' : '500' }}>📍 {s.name}{s.mine ? ' (your stop)' : ''}</Text><P small>{fmtTime(s.pickup_time)}</P></View>)}</Card>
    <Card title="Live bus location"><P style={{ textAlign: 'center' }}>🛰️ Live tracking is coming soon. Once the school fits GPS in the buses, you will see where your bus is right here.</P></Card>
  </Page>;
}
const Eta = ({ label, v }) => <View style={{ flex: 1, backgroundColor: C.purpleL, borderRadius: 14, padding: 10 }}><Text style={{ fontSize: 12, color: C.muted }} numberOfLines={1}>{label}</Text><Text style={{ fontSize: 17, fontWeight: '800', color: C.purpleD, marginTop: 2 }}>{v}</Text></View>;

function Pref({ d, onSaved, onCancel }) {
  const stops = useLoad(() => api.get('/public/transport/stops'), []);
  const [uses, setUses] = useState(d.preference?.uses_bus ?? true); const [stopId, setStopId] = useState(null); const [loc, setLoc] = useState(d.preference?.pickup_location || '');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const save = async () => { setBusy(true); setErr(''); try { onSaved(await api.put('/portal/transport/preference', { uses_bus: uses, stop_id: uses ? stopId : null, pickup_location: uses ? loc || null : null })); } catch (e) { setErr(e.message); setBusy(false); } };
  return <Page><H>{onCancel ? 'Change bus preference' : `Choose your school bus for ${d.academic_year}`}</H>
    <P style={{ marginVertical: 10 }}>Tell the school whether you will use the bus and where you will be picked up. Choosing a stop gives you its bus straight away.</P>
    <Chips options={['I will use the bus', 'I will not use the bus']} value={uses ? 'I will use the bus' : 'I will not use the bus'} onChange={(v) => setUses(v === 'I will use the bus')} />
    {uses && <>{stops.loading ? <Loading /> : (stops.data || []).map((b) => <Card key={b.bus_id} title={`Bus ${b.bus_number}${b.route_name ? ' · ' + b.route_name : ''}`}>
      {b.stops.map((s) => <TouchableOpacity key={s.id} onPress={() => setStopId(stopId === s.id ? null : s.id)} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <Text style={{ color: stopId === s.id ? C.purpleD : C.ink, fontWeight: stopId === s.id ? '800' : '500' }}>{stopId === s.id ? '● ' : '○ '}{s.name}</Text><P small>{fmtTime(s.pickup_time)}</P></TouchableOpacity>)}</Card>)}
      <Field label={stopId ? 'Landmark near your home (optional)' : 'My stop is not listed — pickup location'} value={loc} onChangeText={setLoc} autoCapitalize="sentences" /></>}
    {!!err && <Text style={{ color: C.red, marginBottom: 10 }}>{err}</Text>}
    <View style={{ gap: 10 }}><Btn busy={busy} disabled={uses && !stopId && !loc.trim()} onPress={save}>Save preference</Btn>{onCancel && <Btn kind="soft" onPress={onCancel}>Cancel</Btn>}</View></Page>;
}
