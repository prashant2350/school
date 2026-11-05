import { useEffect, useState } from 'react';
import { Bus, Clock, MapPin } from 'lucide-react';
import { api, type Row } from '../api';
import SiteLayout, { Reveal } from './Layout';
import { LABS, ROOMS, SITE } from './siteData';

export default function About() {
  const [t, setT] = useState<{ buses: number; routes: Row[] } | null>(null);
  useEffect(() => { api.get('/public/transport/summary').then(setT).catch(() => {}); }, []);
  return <SiteLayout current="about">
    <section className="page-hero"><Reveal><h1>About {SITE.name}</h1><p>{SITE.tagline} · {SITE.town}</p></Reveal></section>
    <section className="sec narrow">
      <Reveal>{SITE.about.map((p, i) => <p className="lead" key={i}>{p}</p>)}</Reveal>
      <Reveal delay={80}><div className="facts">
        <div><b>{SITE.tagline}</b><span>Classes taught</span></div>
        {SITE.established && <div><b>{SITE.established}</b><span>Established</span></div>}
        {t && t.buses > 0 && <div><b>{t.buses}</b><span>School {t.buses === 1 ? 'bus' : 'buses'}</span></div>}
        <div><b>{SITE.motto}</b><span>Our motto</span></div>
      </div></Reveal>
    </section>

    <section className="sec"><Reveal><h2 className="sec-h">Laboratories</h2></Reveal>
      <div className="cards">{LABS.map((x, i) => <Reveal key={x.name} delay={i * 70}><div className="info"><span className="tile-ico"><x.icon size={22} /></span><h3>{x.name}</h3><p>{x.text}</p></div></Reveal>)}</div></section>

    <section className="sec"><Reveal><h2 className="sec-h">Rooms &amp; facilities</h2></Reveal>
      <div className="cards">{ROOMS.map((x, i) => <Reveal key={x.name} delay={(i % 4) * 70}><div className="info"><span className="tile-ico"><x.icon size={22} /></span><h3>{x.name}</h3><p>{x.text}</p></div></Reveal>)}</div></section>

    <section className="sec"><Reveal><h2 className="sec-h">School buses</h2>
      <p className="sec-p">{t && t.buses > 0 ? `Our ${t.buses} ${t.buses === 1 ? 'bus runs' : 'buses run'} on the routes below. Students choose their pickup stop after admission, and see their bus number, driver and timings in their portal.` : 'Bus routes will be listed here once the school adds them.'}</p></Reveal>
      <div className="cards">{t?.routes.map((r, i) => <Reveal key={r.bus} delay={(i % 4) * 70}><div className="info bus">
        <span className="plate-no"><Bus size={16} />Bus {r.bus}</span><h3>{r.route || 'Route'}</h3>
        <ul>{r.stops.slice(0, 6).map((s: string) => <li key={s}><MapPin size={13} />{s}</li>)}{r.stops.length > 6 && <li className="more"><Clock size={13} />and {r.stops.length - 6} more stops</li>}</ul></div></Reveal>)}</div></section>
  </SiteLayout>;
}
