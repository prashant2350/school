import { useEffect, useState } from 'react';
import { BookOpen, Bus, ChevronRight, GraduationCap, Images, Instagram, LogIn, Phone, School, ShieldCheck, UserPlus } from 'lucide-react';
import { api } from '../api';
import SiteLayout, { Reveal, useSchoolInfo } from './Layout';
import { SITE } from './siteData';

const RING = `DISCIPLINE & JUSTICE ✦ ${SITE.name.toUpperCase()} ✦ ${SITE.town.toUpperCase().replace(', ', ' ✦ ')} ✦ `;
const MOTES = Array.from({ length: 16 }, (_, i) => ({ left: (i * 37 + 11) % 100, size: 3 + ((i * 7) % 5), dur: 14 + ((i * 5) % 11), delay: -((i * 3) % 14) }));

function Scales() {
  return <svg className="scales" viewBox="0 0 220 190" role="img" aria-label="Scales of justice">
    <line x1="110" y1="30" x2="110" y2="170" /><path d="M78 172h64M92 172c2-8 34-8 36 0" />
    <circle cx="110" cy="28" r="6" className="fill" />
    <g className="beam"><line x1="28" y1="44" x2="192" y2="44" />
      <g className="pan pan-l"><path d="M28 44L8 108M28 44l20 64M8 108h40" /><path d="M4 108c4 22 40 22 48 0z" className="fill" /></g>
      <g className="pan pan-r"><path d="M192 44l-20 64M192 44l20 64M172 108h40" /><path d="M168 108c4 22 40 22 48 0z" className="fill" /></g></g>
  </svg>;
}

export default function Home() {
  const info = useSchoolInfo(); const [buses, setBuses] = useState<number | null>(null);
  useEffect(() => { api.get('/public/transport/summary').then(r => setBuses(r.buses)).catch(() => {}); }, []);
  const words = SITE.name.split(' ');
  const soc = SITE.social;
  return <SiteLayout current="" bare>
    <section className="hero">
      {MOTES.map((m, i) => <i key={i} className="mote" style={{ left: `${m.left}%`, width: m.size, height: m.size, animationDuration: `${m.dur}s`, animationDelay: `${m.delay}s` }} />)}
      <div className="hero-in">
        <div className="crest">
          <svg className="ring" viewBox="0 0 400 400" aria-hidden="true"><defs><path id="ringpath" d="M200,200 m-172,0 a172,172 0 1,1 344,0 a172,172 0 1,1 -344,0" /></defs>
            <text><textPath href="#ringpath" textLength="1070" lengthAdjust="spacing">{RING}</textPath></text></svg>
          <div className="plate"><img src="/logo.png" alt={`${SITE.name} crest`} /></div>
        </div>
        <h1 className="hero-name" aria-label={SITE.name}>{words.map((w, i) => <span key={i} style={{ animationDelay: `${0.55 + i * 0.12}s` }} aria-hidden="true">{w}</span>)}</h1>
        <p className="hero-sub">{info.school_address}</p>
        <p className="hero-motto">{SITE.motto}</p>
        <div className="hero-cta">
          <a className="sbtn sbtn-gold" href="#/login"><LogIn size={18} />ERP login</a>
          <a className="sbtn sbtn-glass" href="#/apply"><UserPlus size={18} />Apply for admission</a>
        </div>
      </div>
      <svg className="hero-edge" viewBox="0 0 1440 70" preserveAspectRatio="none" aria-hidden="true"><path d="M0 70V34C240 0 480 0 720 22s480 30 720 4v44z" /></svg>
    </section>

    <section className="sec">
      <Reveal><h2 className="sec-h">Everything in one place</h2><p className="sec-p">Sign in to the school portal, look through our photos, or learn about the school.</p></Reveal>
      <div className="tiles">
        <Reveal className="tile-wide"><div className="tile tile-erp">
          <span className="tile-ico"><ShieldCheck size={26} /></span>
          <div><h3>ERP login</h3><p>Attendance, fees, results, school bus details and notices — one login for each person.</p>
            <div className="tile-btns"><a className="sbtn sbtn-solid" href="#/login/student"><GraduationCap size={17} />Student login</a><a className="sbtn sbtn-outline" href="#/login/staff"><School size={17} />Faculty &amp; admin login</a></div></div>
        </div></Reveal>
        <Reveal delay={80}><a className="tile" href="#/gallery"><span className="tile-ico"><Images size={24} /></span><h3>Photo gallery</h3><p>Events, sports, annual day and campus life.</p><span className="tile-go">View photos<ChevronRight size={16} /></span></a></Reveal>
        <Reveal delay={140}><a className="tile" href="#/about"><span className="tile-ico"><BookOpen size={24} /></span><h3>About our school</h3><p>Our labs, rooms, facilities and school buses.</p><span className="tile-go">Read more<ChevronRight size={16} /></span></a></Reveal>
        <Reveal delay={200}><a className="tile" href="#/apply"><span className="tile-ico"><UserPlus size={24} /></span><h3>Admissions</h3><p>Apply online. The school office will call you.</p><span className="tile-go">Apply now<ChevronRight size={16} /></span></a></Reveal>
        <Reveal delay={260}><a className="tile" href="#/about"><span className="tile-ico"><Bus size={24} /></span><h3>School transport</h3><p>{buses ? `${buses} buses on ${buses === 1 ? 'one route' : 'our routes'}, with stops and timings.` : 'Bus routes, stops and timings.'}</p><span className="tile-go">See routes<ChevronRight size={16} /></span></a></Reveal>
        {info.school_phone && <Reveal delay={320}><a className="tile" href={`tel:${info.school_phone}`}><span className="tile-ico"><Phone size={24} /></span><h3>Call the school office</h3><p>{info.school_phone}</p><span className="tile-go">Call now<ChevronRight size={16} /></span></a></Reveal>}
        {soc.instagram && <Reveal delay={380}><a className="tile" href={soc.instagram} target="_blank" rel="noreferrer"><span className="tile-ico"><Instagram size={24} /></span><h3>Follow us on Instagram</h3><p>Daily moments from school.</p><span className="tile-go">Open Instagram<ChevronRight size={16} /></span></a></Reveal>}
      </div>
    </section>

    <section className="motto">
      <Reveal className="motto-in"><Scales /><div><h2>{SITE.motto}</h2><p>{SITE.principalNote}</p></div></Reveal>
    </section>
  </SiteLayout>;
}
