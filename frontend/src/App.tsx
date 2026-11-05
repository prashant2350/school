import { useEffect, useState } from 'react';
import { clearSession, getSession, type Session } from './api';
import Login from './Login';
import Apply from './Apply';
import AdminShell from './admin/Shell';
import Portal from './student/Portal';
import FacultyShell from './faculty/Shell';
import Home from './site/Home';
import About from './site/About';
import Gallery from './site/Gallery';
import { useToast } from './ui';

export default function App() {
  const [session, setSession] = useState<Session | null>(getSession());
  const toast = useToast();
  useEffect(() => {
    const expired = () => { setSession(null); toast('Your session expired. Please sign in again.', 'error'); };
    window.addEventListener('auth-expired', expired);
    return () => window.removeEventListener('auth-expired', expired);
  }, [toast]);
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => { const h = () => { setHash(window.location.hash); window.scrollTo(0, 0); }; window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  const logout = () => { clearSession(); setSession(null); window.location.hash = ''; };

  if (!session) {
    // Public website:  #/ (home)  #/about  #/gallery  #/apply  ·  Sign-in:  #/login  #/login/student  #/login/staff
    const route = hash.replace(/^#\/?/, '').split('?')[0];
    if (route === '') return <Home />;
    if (route === 'about') return <About />;
    if (route === 'gallery') return <Gallery />;
    if (route.startsWith('apply')) return <Apply />;
    return <Login onLogin={setSession} initialMode={route === 'login/student' ? 'student' : 'staff'} />;
  }
  if (session.kind === 'student') return <Portal onLogout={logout} />;
  return session.role === 'teacher' ? <FacultyShell onLogout={logout} /> : <AdminShell onLogout={logout} />;
}
