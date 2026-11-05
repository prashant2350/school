import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const C = { purple: '#6f63e0', purpleD: '#4e43b8', purpleL: '#efedfd', ink: '#1b2140', muted: '#6b7390', line: '#e7e9f3', bg: '#f6f7fb', white: '#fff', green: '#1f9a7c', amber: '#d99a1b', red: '#d6455d' };
export const tone = (p) => (p == null ? '#c3c9da' : p >= 75 ? C.green : p >= 55 ? C.amber : C.red);

export function useLoad(fn, deps = []) {
  const [state, set] = useState({ data: null, loading: true, error: '' });
  const run = useCallback(async () => {
    set((s) => ({ ...s, loading: true, error: '' }));
    try { set({ data: await fn(), loading: false, error: '' }); } catch (e) { set({ data: null, loading: false, error: e.message }); }
  }, deps); // eslint-disable-line
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run, setData: (d) => set((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

/** Slides + fades its children in, one after another (pass the list index as i). */
export function FadeIn({ i = 0, children, style }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(v, { toValue: 1, duration: 450, delay: Math.min(i, 8) * 70, useNativeDriver: true }).start(); }, []); // eslint-disable-line
  return <Animated.View style={[{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }, style]}>{children}</Animated.View>;
}

export function Page({ children, onRefresh, refreshing = false, bottom = 28 }) {
  return <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: bottom }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
    refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.purple} /> : undefined}>{children}</ScrollView>;
}
export const Card = ({ title, right, children, style }) => (
  <View style={[s.card, style]}>{(title || right) && <View style={s.cardHead}><Text style={s.cardTitle} numberOfLines={1}>{title}</Text>{right}</View>}{children}</View>);
export const H = ({ children, style }) => <Text style={[s.h, style]}>{children}</Text>;
export const P = ({ children, style, small }) => <Text style={[{ color: C.muted, fontSize: small ? 12.5 : 14.5, lineHeight: small ? 18 : 21 }, style]}>{children}</Text>;
export const B = ({ children, style }) => <Text style={[{ color: C.ink, fontWeight: '700', fontSize: 15 }, style]}>{children}</Text>;
export const Pill = ({ children, color = C.purple }) => <View style={{ backgroundColor: color + '1f', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }}><Text style={{ color, fontWeight: '700', fontSize: 12 }}>{children}</Text></View>;

export function Btn({ children, onPress, busy, kind = 'primary', disabled, style }) {
  const bg = kind === 'primary' ? C.purple : kind === 'soft' ? C.purpleL : 'transparent';
  const fg = kind === 'primary' ? '#fff' : C.purpleD;
  return <TouchableOpacity activeOpacity={0.8} disabled={busy || disabled} onPress={onPress} style={[s.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : 1 }, style]}>
    {busy ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '700', fontSize: 15 }}>{children}</Text>}</TouchableOpacity>;
}
export function Field({ label, value, onChangeText, ...p }) {
  return <View style={{ marginBottom: 12 }}>{label && <Text style={s.label}>{label}</Text>}<TextInput style={s.input} value={value} onChangeText={onChangeText} placeholderTextColor="#a3a9bf" autoCapitalize="none" {...p} /></View>;
}
export function Chips({ options, value, onChange }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>{options.map((o) => <TouchableOpacity key={o} onPress={() => onChange(o)} style={[s.chip, value === o && { backgroundColor: C.purple, borderColor: C.purple }]}><Text style={{ color: value === o ? '#fff' : C.ink, fontWeight: '600' }}>{o}</Text></TouchableOpacity>)}</View>;
}
export function Bar({ pct, mark }) {
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(w, { toValue: pct || 0, duration: 900, useNativeDriver: false }).start(); }, [pct]); // eslint-disable-line
  return <View style={s.track}><Animated.View style={{ height: '100%', borderRadius: 8, backgroundColor: tone(pct), width: w.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) }} />
    {mark != null && <View style={{ position: 'absolute', top: -3, left: `${mark}%`, width: 3, height: 16, borderRadius: 2, backgroundColor: C.ink, opacity: 0.5 }} />}</View>;
}
export const Loading = () => <View style={{ padding: 40 }}><ActivityIndicator color={C.purple} size="large" /></View>;
export const ErrorView = ({ msg, retry }) => <View style={[s.card, { alignItems: 'center' }]}><Text style={{ color: C.red, textAlign: 'center', marginBottom: 10 }}>{msg}</Text>{retry && <Btn kind="soft" onPress={retry}>Try again</Btn>}</View>;
export const Empty = ({ children }) => <Text style={{ color: C.muted, textAlign: 'center', padding: 18 }}>{children}</Text>;
export const Screen = ({ children }) => <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top']}>{children}</SafeAreaView>;
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtTime = (t) => { if (!t) return '—'; const [h, m] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
export const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');

const s = StyleSheet.create({
  card: { backgroundColor: C.white, borderRadius: 22, padding: 16, marginBottom: 14, shadowColor: '#1b2140', shadowOpacity: 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: C.ink, flexShrink: 1, letterSpacing: -0.2 },
  h: { fontSize: 26, fontWeight: '800', color: C.ink, letterSpacing: -0.6 },
  btn: { borderRadius: 16, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '700', color: C.ink, marginBottom: 5 },
  input: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.ink },
  chip: { borderWidth: 1.5, borderColor: C.line, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#fff' },
  track: { height: 10, borderRadius: 8, backgroundColor: '#eef0f7', marginVertical: 6 },
});

import { Ionicons } from '@expo/vector-icons';
/** Round-cornered quick-action tile: icon on a tinted square, one-line label underneath. */
export function Tile({ icon, label, color = C.purple, onPress }) {
  return <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={{ width: 74, alignItems: 'center', marginRight: 8 }}>
    <View style={{ width: 62, height: 62, borderRadius: 20, backgroundColor: color + '1c', alignItems: 'center', justifyContent: 'center' }}><Ionicons name={icon} size={27} color={color} /></View>
    <Text numberOfLines={1} style={{ marginTop: 7, fontSize: 12, fontWeight: '600', color: C.ink }}>{label}</Text></TouchableOpacity>;
}
export const Section = ({ title, right }) => <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 12 }}>
  <Text style={{ fontSize: 19, fontWeight: '800', color: C.ink, letterSpacing: -0.3 }}>{title}</Text>{right}</View>;
