import { useState, type FormEvent } from 'react';
import { Plus, Send, Trash2 } from 'lucide-react';
import { api, fmtDateTime, type Row } from '../api';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Loading, Modal, PageHead, errMsg, useLoad, useToast } from '../ui';
import { useApp } from './data';

export default function Notices() {
  const { me } = useApp(); const toast = useToast(); const [form, setForm] = useState(false);
  const { data, loading, error, reload } = useLoad<Row[]>(() => api.get('/notices'), []);
  const isAdmin = me.role === 'admin';
  return <>
    <PageHead title="Notices" sub="Published notices appear on the student portal." actions={['admin', 'teacher'].includes(me.role) && <Btn onClick={() => setForm(true)}><Plus size={16} />New notice</Btn>} />
    {loading ? <Loading /> : error ? <ErrorBox msg={error} retry={reload} /> : !data?.length ? <Card><Empty>No notices yet.</Empty></Card> : data.map(n => <Card key={n.id}>
      <div className="card-head"><div><h3>{n.title}</h3><span className="muted small">{fmtDateTime(n.created_at)} · for {n.audience}</span></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{n.published ? <Badge tone="green">Published</Badge> : <><Badge tone="amber">Draft</Badge>{isAdmin && <Btn variant="soft" className="btn-sm" onClick={async () => { try { await api.patch(`/notices/${n.id}/publish`, {}); toast('Notice published'); reload(); } catch (e) { toast(errMsg(e), 'error'); } }}><Send size={14} />Publish</Btn>}</>}
          {isAdmin && <button className="icon-btn" aria-label="Delete notice" onClick={async () => { if (!confirm('Delete this notice?')) return; try { await api.del(`/notices/${n.id}`); reload(); } catch (e) { toast(errMsg(e), 'error'); } }}><Trash2 size={16} /></button>}</div></div>
      <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{n.body}</p></Card>)}
    {form && <NoticeForm onClose={() => setForm(false)} onSaved={() => { setForm(false); reload(); }} />}
  </>;
}

function NoticeForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { me } = useApp(); const toast = useToast(); const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ title: '', body: '', audience: 'all', published: me.role === 'admin' });
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); try { await api.post('/notices', { ...f, published: me.role === 'admin' ? f.published : false }); toast(f.published ? 'Notice published' : 'Notice saved as draft'); onSaved(); } catch (err) { toast(errMsg(err), 'error'); setBusy(false); } };
  return <Modal title="New notice" onClose={onClose}><form onSubmit={submit}>
    <Field label="Title" required><input required autoFocus value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
    <Field label="Message" required><textarea required rows={5} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} /></Field>
    <Field label="Audience"><select value={f.audience} onChange={e => setF({ ...f, audience: e.target.value })}><option value="all">Everyone</option><option value="students">Students</option><option value="teachers">Teachers</option></select></Field>
    {me.role === 'admin' ? <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={f.published} onChange={e => setF({ ...f, published: e.target.checked })} />Publish immediately</label> : <div className="note">Teachers’ notices are saved as drafts for the admin to publish.</div>}
    <div className="modal-actions"><Btn type="button" variant="ghost" onClick={onClose}>Cancel</Btn><Btn type="submit" busy={busy}>Save notice</Btn></div></form></Modal>;
}
