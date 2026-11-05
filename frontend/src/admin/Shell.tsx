import { useEffect, useState } from 'react';
import { BarChart3, BookOpen, Bus, FileQuestion, CalendarCheck, CalendarDays, ClipboardList, GraduationCap, Images, Library, UserCheck, LayoutDashboard, LogOut, Megaphone, Menu, Repeat2, Settings as Cog, UserPlus, Users, UserCog, Wallet } from 'lucide-react';
import { api } from '../api';
import { Avatar, ErrorBox, Loading, useLoad } from '../ui';
import { DataCtx } from './data';
import Dashboard from './Dashboard';
import Students from './Students';
import Admissions from './Admissions';
import Promotion from './Promotion';
import Classes from './Classes';
import Attendance from './Attendance';
import Fees from './Fees';
import Exams from './Exams';
import Notices from './Notices';
import Staff from './Staff';
import Teaching from './Teaching';
import Timetable from './Timetable';
import FacultyAttendance from './FacultyAttendance';
import Settings from './Settings';
import Transport from './Transport';
import Gallery from './Gallery';
import Insights from './Insights';
import Papers from '../faculty/Papers';

type Item = { path: string; label: string; icon: any; roles: string[]; section?: string; el: () => JSX.Element };
const ALL = ['admin', 'teacher', 'accountant', 'clerk'];
const ITEMS: Item[] = [
  { path: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ALL, el: () => <Dashboard /> },
  { path: 'students', label: 'Students', icon: Users, roles: ALL, section: 'People', el: () => <Students /> },
  { path: 'admissions', label: 'New admissions', icon: UserPlus, roles: ['admin', 'clerk', 'accountant'], el: () => <Admissions /> },
  { path: 'promotion', label: 'Year-end promotion', icon: Repeat2, roles: ['admin', 'clerk'], el: () => <Promotion /> },
  { path: 'attendance', label: 'Attendance', icon: CalendarCheck, roles: ['admin'], section: 'Daily work', el: () => <Attendance /> },
  { path: 'faculty-attendance', label: 'Faculty attendance', icon: UserCheck, roles: ['admin'], el: () => <FacultyAttendance /> },
  { path: 'fees', label: 'Fees', icon: Wallet, roles: ['admin', 'accountant', 'clerk'], el: () => <Fees /> },
  { path: 'papers', label: 'Question papers', icon: FileQuestion, roles: ['admin'], el: () => <Papers /> },
  { path: 'insights', label: 'Performance', icon: BarChart3, roles: ['admin'], el: () => <Insights /> },
  { path: 'transport', label: 'Transport', icon: Bus, roles: ['admin', 'clerk'], el: () => <Transport /> },
  { path: 'exams', label: 'Exams & marks', icon: ClipboardList, roles: ['admin'], el: () => <Exams /> },
  { path: 'notices', label: 'Notices', icon: Megaphone, roles: ALL, el: () => <Notices /> },
  { path: 'classes', label: 'Classes & years', icon: BookOpen, roles: ['admin'], section: 'Administration', el: () => <Classes /> },
  { path: 'gallery', label: 'Photo gallery', icon: Images, roles: ['admin'], el: () => <Gallery /> },
  { path: 'staff', label: 'Staff accounts', icon: UserCog, roles: ['admin'], el: () => <Staff /> },
  { path: 'teaching', label: 'Subjects & teachers', icon: Library, roles: ['admin'], el: () => <Teaching /> },
  { path: 'timetable', label: 'Timetable', icon: CalendarDays, roles: ['admin'], el: () => <Timetable /> },
  { path: 'settings', label: 'Settings', icon: Cog, roles: ALL, el: () => <Settings onLogout={() => {}} /> },
];

const routeFromHash = () => window.location.hash.replace(/^#\/?/, '').split('?')[0] || 'dashboard';

export default function AdminShell({ onLogout }: { onLogout: () => void }) {
  const [route, setRoute] = useState(routeFromHash());
  const [open, setOpen] = useState(false);
  const boot = useLoad(async () => {
    const [me, meta, classes, years] = await Promise.all([api.get('/auth/me'), api.get('/meta'), api.get('/classes'), api.get('/academic-years')]);
    return { me, meta, classes, years };
  }, []);

  useEffect(() => { const h = () => { setRoute(routeFromHash()); setOpen(false); window.scrollTo(0, 0); }; window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);

  if (boot.loading) return <div style={{ padding: 60 }}><Loading /></div>;
  if (boot.error || !boot.data) return <div style={{ padding: 40, maxWidth: 520, margin: 'auto' }}><ErrorBox msg={boot.error || 'Could not load'} retry={boot.reload} /><button className="link" onClick={onLogout}>Back to login</button></div>;

  const { me, meta, classes, years } = boot.data;
  const allowed = ITEMS.filter(i => i.roles.includes(me.role));
  const active = allowed.find(i => i.path === route) ?? allowed[0];
  const data = { me, meta, classes, years, reload: boot.reload, go: (p: string) => { window.location.hash = `#/${p}`; } };
  let lastSection = '';

  return <DataCtx.Provider value={data}>
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand"><span className="plogo"><img src="/logo.png" alt="" /></span><div><strong>{meta.settings.school_name}</strong><span>School ERP · {meta.current_year}</span></div></div>
        <nav className="nav" aria-label="Main">
          {allowed.map(i => { const head = i.section && i.section !== lastSection ? i.section : null; if (i.section) lastSection = i.section;
            return <span key={i.path} style={{ display: 'contents' }}>{head && <div className="sep">{head}</div>}
              <a href={`#/${i.path}`} className={active.path === i.path ? 'active' : ''} aria-current={active.path === i.path ? 'page' : undefined}><i.icon size={18} />{i.label}</a></span>; })}
        </nav>
        <div className="side-foot"><Avatar name={me.full_name} /><div className="who"><b>{me.full_name}</b><span>{me.role}</span></div>
          <button className="icon-btn" aria-label="Sign out" title="Sign out" onClick={onLogout}><LogOut size={18} /></button></div>
      </aside>
      <div style={{ minWidth: 0 }}>
        <div className="topbar-m"><button className="icon-btn" aria-label="Menu" onClick={() => setOpen(!open)}><Menu size={22} /></button><GraduationCap size={20} color="#6f63e0" /><b>{meta.settings.school_name}</b></div>
        <main className="main" key={active.path}>{active.path === 'settings' ? <Settings onLogout={onLogout} /> : active.el()}</main>
      </div>
    </div>
  </DataCtx.Provider>;
}
