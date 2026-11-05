import { useRef, useState } from 'react';
import { Images, Trash2, Upload } from 'lucide-react';
import { api, galleryUrl, shrinkImage, type Row } from '../api';
import { Btn, Card, Confirm, Empty, ErrorBox, Field, Loading, PageHead, errMsg, useLoad, useToast } from '../ui';

export default function Gallery() {
  const toast = useToast(); const file = useRef<HTMLInputElement>(null);
  const { data, loading, error, reload } = useLoad<Row>(() => api.get('/public/gallery'), []);
  const [category, setCategory] = useState('Events'); const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(''); const [del, setDel] = useState<Row | null>(null);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return; setBusy(true); let ok = 0;
    for (let i = 0; i < files.length; i++) {
      setProgress(`Uploading ${i + 1} of ${files.length}…`);
      try { const fd = new FormData(); fd.append('file', await shrinkImage(files[i], 1800), 'photo.jpg'); fd.append('category', category); fd.append('title', files.length === 1 ? title : ''); await api.upload('/gallery', fd); ok++; }
      catch (e) { toast(`${files[i].name}: ${errMsg(e)}`, 'error'); }
    }
    setBusy(false); setProgress(''); setTitle(''); if (file.current) file.current.value = ''; if (ok) { toast(`${ok} photo${ok > 1 ? 's' : ''} added to the website`); reload(); }
  };
  return <>
    <PageHead title="Photo gallery" sub="Pictures added here appear on the school website straight away." />
    <Card title="Add photos">
      <div className="row3"><Field label="Category" hint="Pick one, or type a new one"><input list="gal-cats" value={category} onChange={e => setCategory(e.target.value)} maxLength={40} /><datalist id="gal-cats">{(data?.categories ?? []).map((c: string) => <option key={c} value={c} />)}</datalist></Field>
        <Field label="Caption (optional)" hint="Used when you add one photo"><input value={title} onChange={e => setTitle(e.target.value)} maxLength={160} /></Field>
        <div className="field"><span className="field-label">Photos</span><Btn busy={busy} onClick={() => file.current?.click()} disabled={!category.trim()}><Upload size={16} />Choose photos</Btn><input ref={file} type="file" accept="image/*" multiple hidden onChange={e => upload(e.target.files)} /></div></div>
      {progress && <p className="muted small">{progress}</p>}
      <div className="note">You can select many photos at once. They are resized automatically, so phone photos are fine.</div>
    </Card>
    <Card title={`On the website${data ? ` (${data.photos.length})` : ''}`}>
      {loading ? <Loading /> : error || !data ? <ErrorBox msg={error} retry={reload} /> : !data.photos.length ? <Empty><Images size={18} />No photos yet.</Empty> :
        <div className="gal-admin">{data.photos.map((p: Row) => <figure key={p.id}><img src={galleryUrl(p.id, 'thumb')} alt={p.title || p.category} loading="lazy" /><figcaption><b>{p.category}</b>{p.title && <div className="muted">{p.title}</div>}</figcaption>
          <button className="icon-btn" aria-label="Delete photo" onClick={() => setDel(p)}><Trash2 size={16} /></button></figure>)}</div>}
    </Card>
    {del && <Confirm title="Delete this photo?" danger confirmLabel="Delete photo" onClose={() => setDel(null)} message={<p>It will be removed from the website.</p>}
      onConfirm={async () => { try { await api.del(`/gallery/${del.id}`); setDel(null); reload(); toast('Photo deleted'); } catch (e) { toast(errMsg(e), 'error'); setDel(null); } }} />}
  </>;
}
