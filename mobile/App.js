import React, { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api, boot, logout, onSessionExpired } from './src/api';
import { Apply, Login, Welcome } from './src/Auth';
import Bus from './src/Bus';
import { AnswerKey, Progress } from './src/Learn';
import { Home, More } from './src/More';
import { ForcePassword } from './src/Profile';
import { C, Loading, Screen } from './src/ui';

const TABS = [['home', 'Home', 'home'], ['answers', 'Answers', 'key'], ['progress', 'Progress', 'stats-chart'], ['bus', 'Bus', 'bus'], ['more', 'More', 'menu']];

function NavBar({ tab, go }) {
  const inset = useSafeAreaInsets();
  return <View style={[s.bar, { paddingBottom: Math.max(inset.bottom, 8) }]}>{TABS.map(([k, l, ic]) => { const on = tab === k;
    return <TouchableOpacity key={k} style={s.tab} activeOpacity={0.7} onPress={() => go(k)} accessibilityRole="button" accessibilityLabel={l}>
      <View style={[s.line, on && { backgroundColor: C.purple }]} />
      <Ionicons name={on ? ic : `${ic}-outline`} size={25} color={on ? C.purple : '#8a90a6'} />
      <Text numberOfLines={1} style={{ fontSize: 11, marginTop: 3, fontWeight: on ? '800' : '500', color: on ? C.purple : '#8a90a6' }}>{l}</Text></TouchableOpacity>; })}</View>;
}

export default function App() {
  const [ready, setReady] = useState(false); const [authed, setAuthed] = useState(false); const [needPw, setNeedPw] = useState(false);
  const [screen, setScreen] = useState('welcome'); const [tab, setTab] = useState('home'); const [sub, setSub] = useState(null);
  useEffect(() => { onSessionExpired(() => { setAuthed(false); setScreen('login'); }); boot().then((ok) => { setAuthed(ok); setReady(true); }); }, []);
  useEffect(() => { if (authed) api.get('/portal/me').then((m) => setNeedPw(!!m.must_change_password)).catch(() => {}); }, [authed]);
  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!authed) { if (screen !== 'welcome') { setScreen('welcome'); return true; } return false; }
      if (sub) { setSub(null); return true; } if (tab !== 'home') { setTab('home'); return true; } return false;
    });
    return () => h.remove();
  }, [authed, screen, sub, tab]);
  const go = (t, sb = null) => { setTab(t); setSub(sb); };
  const signOut = async () => { await logout(); setAuthed(false); setNeedPw(false); setScreen('welcome'); setTab('home'); setSub(null); };
  let body;
  if (!ready) body = <Screen><Loading /></Screen>;
  else if (!authed) body = screen === 'login' ? <Login go={setScreen} onDone={() => { setAuthed(true); go('home'); }} /> : screen === 'apply' ? <Apply go={setScreen} /> : <Welcome go={setScreen} />;
  else if (needPw) body = <ForcePassword onDone={() => setNeedPw(false)} />;
  else body = <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>
    <View style={{ flex: 1 }}>
      {tab === 'home' && <Home go={go} />}{tab === 'answers' && <AnswerKey />}{tab === 'progress' && <Progress />}{tab === 'bus' && <Bus />}{tab === 'more' && <More sub={sub} setSub={setSub} onLogout={signOut} />}</View>
    <NavBar tab={tab} go={go} />
  </SafeAreaView>;
  return <SafeAreaProvider><StatusBar style="dark" />{body}</SafeAreaProvider>;
}
const s = StyleSheet.create({ bar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#dfe2ee', paddingTop: 0 }, tab: { flex: 1, alignItems: 'center', paddingBottom: 2 }, line: { width: 26, height: 3, borderRadius: 2, backgroundColor: 'transparent', marginBottom: 8 } });