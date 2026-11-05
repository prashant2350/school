import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { api } from './api';
import { Btn, ErrorBox, Field, errMsg } from './ui';

// Public admission form (no login). Submissions land in Admin → New admissions → Pending.
export default function Apply() {
  const [grades, setGrades] = useState<string[]>([]);
  const [school, setSchool] = useState({ school_name: "St. Xavier's High School", school_address: 'Darbar Road, Padrauna, Kushinagar' });
  const [f, setF] = useState({ applicant_name: '', dob: '', gender: '', applying_grade: '', parent_name: '', parent_contact: '', parent_email: '', address: '', previous_school: '', website: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState('');
  useEffect(() => { api.get('/public/grades').then(setGrades).catch(() => {}); api.get('/public/info').then(setSchool).catch(() => {}); }, []);
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const body: Record<string, unknown> = { ...f }; for (const k of ['dob', 'gender', 'parent_email', 'address', 'previous_school']) if (!body[k]) body[k] = null;
      const r = await api.post('/public/apply', body); setDone(r.reference);
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  const back = <a className="link" href="#/" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><ArrowLeft size={15} />Back to home</a>;
  return <div className="login-form" style={{ minHeight: '100vh', alignItems: 'flex-start', padding: '32px 16px' }}>
    <div className="login-box" style={{ maxWidth: 640 }}>
      {back}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '18px 0 6px' }}><img src="/logo.png" alt="" width={44} height={44} style={{ objectFit: 'contain' }} /><div><h2 style={{ margin: 0 }}>Apply for admission</h2><span className="muted small">{school.school_name} · {school.school_address}</span></div></div>
      {done ? <div style={{ textAlign: 'center', padding: '28px 0' }}><CheckCircle2 size={48} color="var(--green)" /><h3>Application received</h3>
        <p>Your reference number is <b className="mono">{done}</b>. The school office will contact you on the mobile number you gave.</p>{back}</div> :
        <form onSubmit={submit}>
          <p className="muted small">Fill in the child’s details. The school office will review the application and call you. This is not a confirmed admission.</p>
          {error && <ErrorBox msg={error} />}
          <Field label="Child’s full name" required><input required minLength={2} value={f.applicant_name} onChange={set('applicant_name')} /></Field>
          <div className="row2"><Field label="Applying for class" required><select required value={f.applying_grade} onChange={set('applying_grade')}><option value="">Select…</option>{grades.map(g => <option key={g}>{g}</option>)}</select></Field>
            <Field label="Date of birth"><input type="date" value={f.dob} onChange={set('dob')} /></Field></div>
          <Field label="Gender"><select value={f.gender} onChange={set('gender')}><option value="">Select…</option><option>Male</option><option>Female</option><option>Other</option></select></Field>
          <div className="row2"><Field label="Father / guardian name" required><input required value={f.parent_name} onChange={set('parent_name')} /></Field>
            <Field label="Mobile number" required><input required type="tel" minLength={7} maxLength={20} value={f.parent_contact} onChange={set('parent_contact')} /></Field></div>
          <Field label="Email (optional)"><input type="email" value={f.parent_email} onChange={set('parent_email')} /></Field>
          <Field label="Address"><input value={f.address} onChange={set('address')} /></Field>
          <Field label="Previous school (if any)"><input value={f.previous_school} onChange={set('previous_school')} /></Field>
          <input aria-hidden tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} style={{ position: 'absolute', left: '-9999px', height: 0, width: 0, opacity: 0 }} />
          <Btn type="submit" busy={busy}>Submit application</Btn>
        </form>}
    </div>
  </div>;
}
