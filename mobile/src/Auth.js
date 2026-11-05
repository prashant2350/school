import React, { useEffect, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { api, getBase, login, setBase } from './api';
import { SCHOOL } from './config';
import { B, Btn, C, Chips, Field, H, P, Screen } from './ui';

const logo = require('../assets/icon.png');

export function Welcome({ go }) {
  const [server, setServer] = useState(false); const [url, setUrl] = useState(getBase());
  return <Screen><ScrollView contentContainerStyle={{ padding: 24, alignItems: 'center', paddingTop: 50 }}>
    <View style={{ width: 150, height: 150, borderRadius: 75, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 5, borderColor: '#e8c36a', elevation: 6 }}>
      <Image source={logo} style={{ width: 118, height: 118 }} resizeMode="contain" /></View>
    <H style={{ marginTop: 22, textAlign: 'center' }}>{SCHOOL}</H>
    <P style={{ textAlign: 'center', marginTop: 4, fontStyle: 'italic' }}>Discipline & Justice</P>
    <View style={{ width: '100%', marginTop: 36, gap: 12 }}>
      <Btn onPress={() => go('login')}>Student login</Btn>
      <Btn kind="soft" onPress={() => go('apply')}>New admission / apply now</Btn></View>
    <TouchableOpacity onPress={() => setServer(!server)} style={{ marginTop: 30 }}><Text style={{ color: C.muted, textDecorationLine: 'underline' }}>Server settings</Text></TouchableOpacity>
    {server && <View style={{ width: '100%', marginTop: 12 }}><Field label="School server address" value={url} onChangeText={setUrl} keyboardType="url" />
      <P small style={{ marginBottom: 8 }}>For testing: http://YOUR-COMPUTER-IP:8000/api/v1 (phone and computer on the same Wi-Fi).</P>
      <Btn kind="soft" onPress={async () => { await setBase(url); setServer(false); }}>Save address</Btn></View>}
  </ScrollView></Screen>;
}

export function Login({ go, onDone }) {
  const [id, setId] = useState(''); const [pw, setPw] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const submit = async () => { setBusy(true); setErr(''); try { await login(id, pw); onDone(); } catch (e) { setErr(e.message); setBusy(false); } };
  return <Screen><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}><ScrollView contentContainerStyle={{ padding: 24 }} keyboardShouldPersistTaps="handled">
    <TouchableOpacity onPress={() => go('welcome')}><Text style={{ color: C.purpleD, fontWeight: '700', marginBottom: 18 }}>‹ Back</Text></TouchableOpacity>
    <H>Welcome back</H><P style={{ marginBottom: 20 }}>Sign in with your Student ID and password given by the school.</P>
    {!!err && <Text style={{ color: C.red, marginBottom: 12 }}>{err}</Text>}
    <Field label="Student ID" value={id} onChangeText={setId} autoCapitalize="characters" placeholder="SHS-2026-0001" />
    <Field label="Password" value={pw} onChangeText={setPw} secureTextEntry />
    <Btn busy={busy} disabled={!id || !pw} onPress={submit}>Sign in</Btn>
  </ScrollView></KeyboardAvoidingView></Screen>;
}

export function Apply({ go }) {
  const [grades, setGrades] = useState([]);
  const [f, setF] = useState({ applicant_name: '', dob: '', gender: '', applying_grade: '', parent_name: '', parent_contact: '', parent_email: '', address: '', previous_school: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [ref, setRef] = useState('');
  useEffect(() => { api.get('/public/grades').then(setGrades).catch(() => {}); }, []);
  const set = (k) => (v) => setF({ ...f, [k]: v });
  const submit = async () => {
    setBusy(true); setErr('');
    try { const body = { ...f }; for (const k of ['dob', 'gender', 'parent_email', 'address', 'previous_school']) if (!body[k]) body[k] = null; setRef((await api.post('/public/apply', body)).reference); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  if (ref) return <Screen><View style={{ flex: 1, padding: 30, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ fontSize: 56 }}>✅</Text><H style={{ marginTop: 10 }}>Application received</H>
    <P style={{ textAlign: 'center', marginVertical: 12 }}>Your reference number is <B>{ref}</B>. The school office will call you on the mobile number you gave.</P>
    <Btn onPress={() => go('welcome')} style={{ alignSelf: 'stretch' }}>Done</Btn></View></Screen>;
  return <Screen><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}><ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
    <TouchableOpacity onPress={() => go('welcome')}><Text style={{ color: C.purpleD, fontWeight: '700', marginBottom: 14 }}>‹ Back</Text></TouchableOpacity>
    <H>Apply for admission</H><P style={{ marginBottom: 18 }}>Fill in the child's details. The school office will review it and call you. This is not a confirmed admission.</P>
    {!!err && <Text style={{ color: C.red, marginBottom: 12 }}>{err}</Text>}
    <Field label="Child's full name *" value={f.applicant_name} onChangeText={set('applicant_name')} autoCapitalize="words" />
    <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink, marginBottom: 6 }}>Applying for class *</Text><Chips options={grades} value={f.applying_grade} onChange={set('applying_grade')} />
    <Field label="Date of birth (YYYY-MM-DD)" value={f.dob} onChangeText={set('dob')} placeholder="2018-06-24" keyboardType="numbers-and-punctuation" />
    <Text style={{ fontSize: 13, fontWeight: '700', color: C.ink, marginBottom: 6 }}>Gender</Text><Chips options={['Male', 'Female', 'Other']} value={f.gender} onChange={set('gender')} />
    <Field label="Father / guardian name *" value={f.parent_name} onChangeText={set('parent_name')} autoCapitalize="words" />
    <Field label="Mobile number *" value={f.parent_contact} onChangeText={set('parent_contact')} keyboardType="phone-pad" />
    <Field label="Email (optional)" value={f.parent_email} onChangeText={set('parent_email')} keyboardType="email-address" />
    <Field label="Address" value={f.address} onChangeText={set('address')} />
    <Field label="Previous school (if any)" value={f.previous_school} onChangeText={set('previous_school')} />
    <Btn busy={busy} disabled={!f.applicant_name || !f.applying_grade || !f.parent_name || f.parent_contact.length < 7} onPress={submit}>Submit application</Btn>
  </ScrollView></KeyboardAvoidingView></Screen>;
}
