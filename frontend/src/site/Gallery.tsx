import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Images, X } from 'lucide-react';
import { api, galleryUrl, type Row } from '../api';
import SiteLayout, { Reveal } from './Layout';
import { SITE } from './siteData';

export default function Gallery() {
  const [photos, setPhotos] = useState<Row[] | null>(null); const [err, setErr] = useState(false);
  const [cat, setCat] = useState('All'); const [view, setView] = useState<number | null>(null);
  useEffect(() => { api.get('/public/gallery').then(r => setPhotos(r.photos)).catch(() => { setErr(true); setPhotos([]); }); }, []);
  const cats = useMemo(() => ['All', ...Array.from(new Set((photos ?? []).map(p => p.category)))], [photos]);
  const shown = useMemo(() => (photos ?? []).filter(p => cat === 'All' || p.category === cat), [photos, cat]);
  useEffect(() => {
    if (view === null) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setView(null); if (e.key === 'ArrowRight') setView(v => (v === null ? v : (v + 1) % shown.length)); if (e.key === 'ArrowLeft') setView(v => (v === null ? v : (v - 1 + shown.length) % shown.length)); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [view, shown.length]);
  const cur = view === null ? null : shown[view];
  return <SiteLayout current="gallery">
    <section className="page-hero"><Reveal><h1>Photo gallery</h1><p>Life at {SITE.name}</p></Reveal></section>
    <section className="sec">
      {photos === null ? <p className="sec-p">Loading photos…</p> : photos.length === 0 ? <div className="gal-empty"><Images size={36} /><h3>{err ? 'Photos could not be loaded' : 'Photos are coming soon'}</h3><p>{err ? 'Please check your connection and try again.' : 'The school will add pictures of events, sports and campus life here.'}</p></div> : <>
        <div className="chips" role="tablist">{cats.map(c => <button key={c} role="tab" aria-selected={cat === c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}</div>
        <div className="masonry">{shown.map((p, i) => <button key={p.id} className="shot" onClick={() => setView(i)} aria-label={`Open photo${p.title ? `: ${p.title}` : ''}`}>
          <img src={galleryUrl(p.id, 'thumb')} alt={p.title || p.category} loading="lazy" />{p.title && <span>{p.title}</span>}</button>)}</div></>}
    </section>
    {cur && <div className="lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer" onMouseDown={e => e.target === e.currentTarget && setView(null)}>
      <button className="lb-x" aria-label="Close" onClick={() => setView(null)}><X size={24} /></button>
      {shown.length > 1 && <button className="lb-nav lb-prev" aria-label="Previous photo" onClick={() => setView((view! - 1 + shown.length) % shown.length)}><ChevronLeft size={28} /></button>}
      <figure key={cur.id}><img src={galleryUrl(cur.id, 'image')} alt={cur.title || cur.category} /><figcaption>{cur.title || cur.category}<small>{view! + 1} of {shown.length}</small></figcaption></figure>
      {shown.length > 1 && <button className="lb-nav lb-next" aria-label="Next photo" onClick={() => setView((view! + 1) % shown.length)}><ChevronRight size={28} /></button>}
    </div>}
  </SiteLayout>;
}
