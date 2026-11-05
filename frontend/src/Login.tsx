import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, BookOpenCheck, Eye, EyeOff, GraduationCap, ShieldCheck, Wallet } from 'lucide-react';
import { api, clearSession, setSession, type Session } from './api';
import { Btn, ErrorBox, Field, errMsg } from './ui';

export default function Login({ onLogin, initialMode = 'staff' }: { onLogin: (s: Session) => void; initialMode?: 'staff' | 'student' }) {
  const [mode, setMode] = useState<'staff' | 'student'>(initialMode);
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [school, setSchool] = useState({ school_name: "St. Xavier's High School", school_address: 'Darbar Road, Padrauna, Kushinagar' });

  useEffect(() => { api.get('/public/info').then(setSchool).catch(() => {}); }, []);
  useEffect(() => { setId(''); setPw(''); setError(''); }, [mode]);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = mode === 'staff'
        ? await api.post('/auth/login', { email: id.trim(), password: pw })
        : await api.post('/auth/student-login', { student_id: id.trim(), password: pw });
      let s: Session = { token: r.access_token, kind: mode };
      if (mode === 'staff') { setSession(s); const u = await api.get('/auth/me'); s = { ...s, role: u.role }; }   // role decides: admin panel or faculty portal
      setSession(s); onLogin(s);
    } catch (err) { clearSession(); setError(errMsg(err)); } finally { setBusy(false); }
  };

  return <div className="login">
    <aside className="login-art">
      <a className="brand" href="#/" style={{ padding: 0, textDecoration: 'none' }}><span className="login-logo"><img src="/logo.png" alt="" /></span>
        <div><strong style={{ color: '#fff' }}>{school.school_name}</strong><span style={{ color: 'rgba(255,255,255,.8)' }}>{school.school_address}</span></div></a>
      <div><h1>One school portal for students, parents and staff.</h1><p style={{ marginTop: 14 }}>Attendance, fees, results, school bus details and notices — with a private login for every student and every faculty member.</p></div>
      <ul><li><ShieldCheck size={18} /> Password-protected for staff and students</li><li><Wallet size={18} /> Fee receipts and dues tracking</li><li><BookOpenCheck size={18} /> Attendance and report cards online</li></ul>
    </aside>
    <main className="login-form">
      <form className="login-box" onSubmit={submit}>
        <a className="link" href="#/" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginBottom: 18 }}><ArrowLeft size={15} />Back to home</a>
        <h2>Welcome back</h2><p className="muted" style={{ margin: 0 }}>Sign in to continue to {school.school_name}.</p>
        <div className="seg" role="tablist"><button type="button" role="tab" aria-selected={mode === 'staff'} className={mode === 'staff' ? 'on' : ''} onClick={() => setMode('staff')}><ShieldCheck size={14} style={{ verticalAlign: -2 }} /> Admin / Faculty</button>
          <button type="button" role="tab" aria-selected={mode === 'student'} className={mode === 'student' ? 'on' : ''} onClick={() => setMode('student')}><GraduationCap size={14} style={{ verticalAlign: -2 }} /> Student</button></div>
        {error && <ErrorBox msg={error} />}
        <Field label={mode === 'staff' ? 'Email or Employee ID' : 'Student ID'} hint={mode === 'student' ? 'Your admission number, e.g. SHS-2026-0001' : 'Faculty: use your Employee ID, e.g. SHS-T-001'}>
          <input autoFocus required type="text" autoCapitalize="off" autoComplete="username" value={id} onChange={e => setId(e.target.value)} placeholder={mode === 'staff' ? 'SHS-T-001 or you@school.com' : 'SHS-2026-0001'} /></Field>
        <Field label="Password"><div className="pw"><input required type={show ? 'text' : 'password'} autoComplete="current-password" value={pw} onChange={e => setPw(e.target.value)} />
          <button type="button" className="icon-btn" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></Field>
        <Btn type="submit" busy={busy}>Sign in</Btn>
        <p className="muted small" style={{ marginTop: 16 }}>New admission? <a className="link" href="#/apply">Apply online</a></p>
        <p className="muted small" style={{ marginTop: 8 }}>{mode === 'student' ? 'Forgot your password? Ask the school office to reset it.' : 'Forgot your password? Ask the school administrator to reset it.'}</p>
      </form>
    </main>
  </div>;
}
