import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Facebook, Instagram, LogIn, Mail, MapPin, Menu, Phone, X, Youtube } from 'lucide-react';
import { api } from '../api';
import { SITE } from './siteData';

export type SchoolInfo = { school_name: string; school_address: string; school_phone?: string; school_email?: string };
export function useSchoolInfo(): SchoolInfo {
  const [info, setInfo] = useState<SchoolInfo>({ school_name: SITE.name, school_address: `Darbar Road, ${SITE.town}, Uttar Pradesh 274304` });
  useEffect(() => { api.get('/public/info').then(setInfo).catch(() => {}); }, []);
  return info;
}

/** Fades a block in once, when it scrolls into view. */
export function Reveal({ children, className = '', delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null); const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (!('IntersectionObserver' in window)) { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { threshold: 0.12 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={ref} className={`rv ${on ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

const LINKS = [['', 'Home'], ['about', 'About school'], ['gallery', 'Photo gallery'], ['apply', 'Admissions']] as const;

export default function SiteLayout({ current, children, bare }: { current: string; children: ReactNode; bare?: boolean }) {
  const info = useSchoolInfo(); const [open, setOpen] = useState(false); const [solid, setSolid] = useState(false);
  useEffect(() => { const f = () => setSolid(window.scrollY > 24); f(); window.addEventListener('scroll', f, { passive: true }); return () => window.removeEventListener('scroll', f); }, []);
  useEffect(() => setOpen(false), [current]);
  const soc = SITE.social;
  return <div className="site">
    <header className={`snav ${solid || !bare ? 'solid' : ''} ${open ? 'open' : ''}`}>
      <div className="snav-in">
        <a className="snav-brand" href="#/" aria-label={`${SITE.name} home`}><img src="/logo.png" alt="" /><span>{SITE.name}</span></a>
        <nav aria-label="Website" className="snav-links">
          {LINKS.map(([k, l]) => <a key={k} href={`#/${k}`} className={current === k ? 'on' : ''}>{l}</a>)}
          <a className="snav-cta" href="#/login"><LogIn size={16} />ERP login</a>
        </nav>
        <button className="snav-burger" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={22} /> : <Menu size={22} />}</button>
      </div>
    </header>
    {children}
    <footer className="sfoot">
      <div className="sfoot-in">
        <div className="sfoot-brand"><img src="/logo.png" alt="" /><div><b>{info.school_name}</b><span>{SITE.motto}</span></div></div>
        <address>
          <p><MapPin size={16} />{info.school_address}</p>
          {info.school_phone && <p><Phone size={16} /><a href={`tel:${info.school_phone}`}>{info.school_phone}</a></p>}
          {info.school_email && <p><Mail size={16} /><a href={`mailto:${info.school_email}`}>{info.school_email}</a></p>}
        </address>
        <div className="sfoot-links">
          {LINKS.map(([k, l]) => <a key={k} href={`#/${k}`}>{l}</a>)}<a href="#/login">ERP login</a>
          <div className="soc">
            {soc.instagram && <a href={soc.instagram} target="_blank" rel="noreferrer" aria-label="Instagram"><Instagram size={18} /></a>}
            {soc.facebook && <a href={soc.facebook} target="_blank" rel="noreferrer" aria-label="Facebook"><Facebook size={18} /></a>}
            {soc.youtube && <a href={soc.youtube} target="_blank" rel="noreferrer" aria-label="YouTube"><Youtube size={18} /></a>}
          </div>
        </div>
      </div>
      <p className="sfoot-copy">© {new Date().getFullYear()} {info.school_name}</p>
    </footer>
  </div>;
}
