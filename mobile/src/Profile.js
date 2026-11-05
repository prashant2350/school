import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { api, authHeaders, getBase } from './api';
import { B, Btn, C, Card, ErrorView, Field, H, Loading, P, Page, Screen, fmtDate, useLoad } from './ui';

/** Round profile picture (the student's photo, or their initial). Change v to force a fresh download. */
export function Avatar({ name = '?', hasPhoto, size = 46, v = 0 }) {
  const [bad, setBad] = useState(false);
  if (hasPhoto && !bad) return <Image source={{ uri: `${getBase()}/portal/photo?v=${v}`, headers: authHeaders() }} onError={() => setBad(true)} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.line }} />;
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.purple, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.4 }}>{(name[0] || '?').toUpperCase()}</Text></View>;
}

export function Profile({ back }) {
  const l = useLoad(() => api.get('/portal/me'), []);
  if (l.loading) return <Page>{back}<Loading /></Page>;
  if (l.error) return <Page>{back}<ErrorView msg={l.error} retry={l.reload} /></Page>;
  return <ProfileForm m={l.data} back={back} reload={l.reload} />;
}

function ProfileForm({ m, back, reload }) {
  const [f, setF] = useState({ phone: m.phone ?? '', email: m.email ?? '', address: m.address ?? '', bio: m.bio ?? '' });
  const [busy, setBusy] = useState(''); const [msg, setMsg] = useState(''); const [err, setErr] = useState(''); const [v, setV] = useState(Date.now());
  const set = (k) => (t) => setF({ ...f, [k]: t });
  const run = async (key, fn, ok) => { setBusy(key); setMsg(''); setErr(''); try { await fn(); setMsg(ok); await reload(); } catch (e) { setErr(e.message); } finally { setBusy(''); } };

  const pick = () => run('photo', async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.4, base64: true });
    if (r.canceled) throw new Error('No photo chosen');
    const a = r.assets[0];
    if (!a.base64) throw new Error('Could not read the photo. Please try another one.');
    await api.post('/portal/photo-json', { image: a.base64 });
    setV(Date.now());
  }, 'Photo updated');
  const removePhoto = () => run('photo', async () => { await api.del('/portal/photo'); setV(Date.now()); }, 'Photo removed');
  const save = () => run('save', () => api.patch('/portal/profile', { phone: f.phone, email: f.email || null, address: f.address, bio: f.bio }), 'Profile saved');

  return <Page>{back}
    <View style={{ alignItems: 'center', marginBottom: 16 }}>
      <Avatar name={m.name} hasPhoto={m.has_photo} size={104} v={v} />
      <H style={{ marginTop: 12, fontSize: 22 }}>{m.name}</H><P>{m.class} · {m.admission_no}</P>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <Btn kind="soft" busy={busy === 'photo'} onPress={pick}>{m.has_photo ? 'Change photo' : 'Add photo'}</Btn>
        {m.has_photo && <Btn kind="soft" disabled={busy === 'photo'} onPress={removePhoto}>Remove</Btn>}</View></View>
    {!!msg && <Text style={{ color: C.green, fontWeight: '700', textAlign: 'center', marginBottom: 10 }}>{msg}</Text>}
    {!!err && <Text style={{ color: C.red, textAlign: 'center', marginBottom: 10 }}>{err}</Text>}
    <Card title="My details">
      <Field label="Mobile number" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" maxLength={20} />
      <Field label="Email" value={f.email} onChangeText={set('email')} keyboardType="email-address" />
      <Field label="Address" value={f.address} onChangeText={set('address')} multiline autoCapitalize="sentences" />
      <Field label="About me" value={f.bio} onChangeText={set('bio')} maxLength={300} autoCapitalize="sentences" placeholder="I love cricket and maths" />
      <Btn busy={busy === 'save'} onPress={save}>Save changes</Btn></Card>
    <Card title="School records (set by the school office)">
      {[['Class', m.class], ['Roll no.', m.roll_no], ['Date of birth', fmtDate(m.dob)], ['Father / guardian', m.parent_name], ['Mother', m.mother_name], ['Contact', m.parent_contact], ['Class teacher', m.class_teacher]]
        .filter(([, x]) => x && x !== '—').map(([k, x]) => <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line }}><P small>{k}</P><B style={{ fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{String(x)}</B></View>)}</Card>
    <PasswordCard />
  </Page>;
}

function PasswordCard() {
  const [f, setF] = useState({ current: '', next: '', again: '' }); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  const save = async () => {
    setMsg(''); setErr('');
    if (f.next.length < 8) return setErr('New password must be at least 8 characters');
    if (f.next !== f.again) return setErr('The two new passwords do not match');
    setBusy(true);
    try { await api.post('/portal/change-password', { current_password: f.current, new_password: f.next }); setMsg('Password changed'); setF({ current: '', next: '', again: '' }); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return <Card title="Change password">
    {!!msg && <Text style={{ color: C.green, fontWeight: '700', marginBottom: 8 }}>{msg}</Text>}{!!err && <Text style={{ color: C.red, marginBottom: 8 }}>{err}</Text>}
    <Field label="Current password" value={f.current} onChangeText={(t) => setF({ ...f, current: t })} secureTextEntry />
    <Field label="New password (8+ characters)" value={f.next} onChangeText={(t) => setF({ ...f, next: t })} secureTextEntry />
    <Field label="Confirm new password" value={f.again} onChangeText={(t) => setF({ ...f, again: t })} secureTextEntry />
    <Btn kind="soft" busy={busy} disabled={!f.current || !f.next} onPress={save}>Change password</Btn></Card>;
}

/** Shown right after the first login with the temporary password. The student cannot skip it. */
export function ForcePassword({ onDone }) {
  const [f, setF] = useState({ current: '', next: '', again: '' }); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const save = async () => {
    setErr('');
    if (f.next.length < 8) return setErr('New password must be at least 8 characters');
    if (f.next !== f.again) return setErr('The two new passwords do not match');
    setBusy(true);
    try { await api.post('/portal/change-password', { current_password: f.current, new_password: f.next }); onDone(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return <Screen><Page>
    <H style={{ marginTop: 20 }}>Set your own password</H><P style={{ marginVertical: 10 }}>For your safety, please replace the temporary password the school gave you.</P>
    {!!err && <Text style={{ color: C.red, marginBottom: 10 }}>{err}</Text>}
    <Field label="Temporary password" value={f.current} onChangeText={(t) => setF({ ...f, current: t })} secureTextEntry />
    <Field label="New password (8+ characters)" value={f.next} onChangeText={(t) => setF({ ...f, next: t })} secureTextEntry />
    <Field label="Confirm new password" value={f.again} onChangeText={(t) => setF({ ...f, again: t })} secureTextEntry />
    <Btn busy={busy} disabled={!f.current || !f.next} onPress={save}>Save and continue</Btn></Page></Screen>;
}