import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Eye, ImagePlus, Trash2 } from 'lucide-react';
import { API_BASE, api, fetchBlob } from '../api';
import { Btn, Card, Field, PageHead, errMsg, useToast } from '../ui';
import { useApp } from './data';

const DESIGNS: [string, string, string][] = [
  ['classic', 'Classic', 'Traditional school report card. Double border, centred crest, navy table.'],
  ['modern', 'Modern', 'Colour header band, performance bars and big summary tiles.'],
  ['board', 'Board style', 'Statement of marks with maroon & gold border and marks written in words.']];

/** School logo + the design students get when they download their result PDF. */
function ResultPdf({ s, setS, isAdmin, reload }: { s: Record<string, string>; setS: (v: any) => void; isAdmin: boolean; reload: () => void }) {
  const toast = useToast(); const file = useRef<HTMLInputElement>(null);
  const [logo, setLogo] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const loadLogo = () => { fetch(`${API_BASE}/public/logo?ts=${Date.now()}`).then(r => (r.ok ? r.blob() : null)).then(b => setLogo(b ? URL.createObjectURL(b) : null)).catch(() => setLogo(null)); };
  useEffect(loadLogo, []);
  const pick = async (f?: File) => { if (!f) return; setBusy(true); try { const fd = new FormData(); fd.append('file', f); await api.upload('/settings/logo', fd); toast('Logo saved'); loadLogo(); } catch (e) { toast(errMsg(e), 'error'); } finally { setBusy(false); if (file.current) file.current.value = ''; } };
  const remove = async () => { try { await api.del('/settings/logo'); setLogo(null); toast('Logo removed'); } catch (e) { toast(errMsg(e), 'error'); } };
  const choose = async (id: string) => { setS({ ...s, result_template: id }); try { await api.put('/settings', { result_template: id }); toast('Result design saved'); reload(); } catch (e) { toast(errMsg(e), 'error'); } };
  const preview = async (id: string) => { try { const b = await fetchBlob(`/settings/result-preview?template=${id}`); window.open(URL.createObjectURL(b), '_blank'); } catch (e) { toast(errMsg(e), 'error'); } };
  return <Card title="Result PDF: logo & design">
    <p className="muted small" style={{ marginTop: 0 }}>Students download their published results as a PDF with your school logo, in the design you choose here.</p>
    <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
      <div style={{ width: 76, height: 76, borderRadius: 14, border: '1px solid var(--line, #dfe3ee)', display: 'grid', placeItems: 'center', overflow: 'hidden', background: '#fff' }}>
        {logo ? <img src={logo} alt="School logo" style={{ maxWidth: '100%', maxHeight: '100%' }} /> : <span className="muted small">No logo</span>}</div>
      {isAdmin && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input ref={file} type="file" accept="image/png,image/jpeg" hidden onChange={e => pick(e.target.files?.[0])} />
        <Btn variant="soft" busy={busy} onClick={() => file.current?.click()}><ImagePlus size={16} />{logo ? 'Change logo' : 'Upload logo'}</Btn>
        {logo && <Btn variant="ghost" onClick={remove}><Trash2 size={16} />Remove</Btn>}</div>}</div>
    <div style={{ display: 'grid', gap: 10 }}>{DESIGNS.map(([id, name, desc]) => { const on = (s.result_template || 'classic') === id;
      return <div key={id} style={{ display: 'flex', gap: 12, alignItems: 'center', border: `1.5px solid ${on ? 'var(--purple, #5a4fc9)' : 'var(--line, #dfe3ee)'}`, borderRadius: 12, padding: '10px 12px', background: on ? 'var(--purple-50, #efeefc)' : undefined }}>
        <div style={{ flex: 1, minWidth: 0 }}><b>{name}</b>{on && <> · <span style={{ color: 'var(--purple, #5a4fc9)' }}>in use</span></>}<div className="muted small">{desc}</div></div>
        <Btn variant="ghost" className="btn-sm" onClick={() => preview(id)}><Eye size={14} />Preview</Btn>
        {isAdmin && !on && <Btn className="btn-sm" onClick={() => choose(id)}>Use this</Btn>}</div>; })}</div>
  </Card>;
}

export default function Settings({ onLogout }: { onLogout: () => void }) {
  const { me, meta, reload } = useApp(); const toast = useToast();
  const [s, setS] = useState({ ...meta.settings }); const [pw, setPw] = useState({ current_password: '', new_password: '' }); const [busy, setBusy] = useState(false);
  const isAdmin = me.role === 'admin';
  const saveSchool = async (e: FormEvent) => { e.preventDefault(); try { await api.put('/settings', s); toast('School details saved'); reload(); } catch (err) { toast(errMsg(err), 'error'); } };
  const changePw = async (e: FormEvent) => { e.preventDefault(); setBusy(true); try { await api.post('/auth/change-password', pw); toast('Password changed. Please sign in again.'); setTimeout(onLogout, 1200); } catch (err) { toast(errMsg(err), 'error'); setBusy(false); } };
  return <>
    <PageHead title="Settings" />
    <div className="grid g2">
      <Card title="School details"><form onSubmit={saveSchool}><p className="muted small" style={{ marginTop: 0 }}>Shown on the login page, receipts and slips.</p>
        <Field label="School name"><input disabled={!isAdmin} value={s.school_name} onChange={e => setS({ ...s, school_name: e.target.value })} /></Field>
        <Field label="Address"><input disabled={!isAdmin} value={s.school_address} onChange={e => setS({ ...s, school_address: e.target.value })} /></Field>
        <div className="row2"><Field label="Phone"><input disabled={!isAdmin} value={s.school_phone} onChange={e => setS({ ...s, school_phone: e.target.value })} /></Field><Field label="Email"><input disabled={!isAdmin} value={s.school_email} onChange={e => setS({ ...s, school_email: e.target.value })} /></Field></div>
        <Field label="Principal"><input disabled={!isAdmin} value={s.principal_name} onChange={e => setS({ ...s, principal_name: e.target.value })} /></Field>
        {isAdmin ? <Btn type="submit">Save details</Btn> : <p className="muted small">Only the admin can change these.</p>}</form></Card>
      <ResultPdf s={s} setS={setS} isAdmin={isAdmin} reload={reload} />
      <Card title="Change my password"><form onSubmit={changePw}>
        <Field label="Current password" required><input required type="password" autoComplete="current-password" value={pw.current_password} onChange={e => setPw({ ...pw, current_password: e.target.value })} /></Field>
        <Field label="New password" required hint="At least 8 characters"><input required minLength={8} type="password" autoComplete="new-password" value={pw.new_password} onChange={e => setPw({ ...pw, new_password: e.target.value })} /></Field>
        <Btn type="submit" busy={busy}>Change password</Btn></form>
        <p className="muted small" style={{ marginTop: 16 }}>Signed in as <b>{me.email}</b> ({me.role}).</p></Card>
    </div>
  </>;
}
