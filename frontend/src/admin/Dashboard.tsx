import { CalendarCheck, Clock, IndianRupee, TrendingDown, Users, UserPlus, Repeat2, Wallet } from 'lucide-react';
import { api, fmtDateTime, inr } from '../api';
import { Card, Empty, ErrorBox, Loading, PageHead, useLoad } from '../ui';
import { useApp } from './data';

export default function Dashboard() {
  const { me, meta, go } = useApp();
  const { data: d, loading, error, reload } = useLoad(() => api.get('/dashboard/summary'), []);
  if (loading) return <Loading />;
  if (error || !d) return <ErrorBox msg={error} retry={reload} />;
  const max = Math.max(1, ...d.classes.map((c: any) => c.count));
  const can = (...r: string[]) => r.includes(me.role);
  return <>
    <PageHead title={`Hello, ${me.full_name}`} sub={`${meta.settings.school_name} · Academic year ${d.school_year}`} />
    <div className="grid g4" style={{ marginBottom: 20 }}>
      <div className="stat"><div className="ico t-purple"><Users size={22} /></div><div><b>{d.total_students}</b><span>Active students</span></div></div>
      <div className="stat"><div className="ico t-green"><CalendarCheck size={22} /></div><div><b>{d.attendance_today.percentage == null ? '—' : `${d.attendance_today.percentage}%`}</b><span>Attendance today ({d.attendance_today.marked} marked)</span></div></div>
      {d.fees ? <>
        <div className="stat"><div className="ico t-blue"><IndianRupee size={22} /></div><div><b>{inr(d.fees.collected_this_month)}</b><span>Collected this month</span></div></div>
        <div className="stat"><div className="ico t-red"><TrendingDown size={22} /></div><div><b>{inr(d.fees.outstanding)}</b><span>Outstanding · {d.fees.defaulters} students</span></div></div>
      </> : <>
        <div className="stat"><div className="ico t-amber"><UserPlus size={22} /></div><div><b>{d.new_this_year}</b><span>New admissions this year</span></div></div>
        <div className="stat"><div className="ico t-blue"><Clock size={22} /></div><div><b>{d.pending_applications}</b><span>Pending applications</span></div></div>
      </>}
    </div>
    <Card title="Quick actions"><div className="quick">
      {can('admin', 'clerk', 'accountant') && <button onClick={() => go('admissions')}><UserPlus size={20} color="#6f63e0" />New admission{d.pending_applications > 0 && <small className="muted">{d.pending_applications} pending</small>}</button>}
      {can('admin', 'teacher') && <button onClick={() => go('attendance')}><CalendarCheck size={20} color="#1f9a7c" />Mark attendance</button>}
      {can('admin', 'accountant', 'clerk') && <button onClick={() => go('fees')}><Wallet size={20} color="#2f78c4" />Collect fee</button>}
      {can('admin', 'clerk') && <button onClick={() => go('promotion')}><Repeat2 size={20} color="#c27a12" />Year-end promotion</button>}
    </div></Card>
    <div className="grid g-main">
      <Card title="Students per class">
        {d.classes.length === 0 ? <Empty>No students yet. Add classes, then admit students.</Empty> :
          <div className="bars">{d.classes.map((c: any) => <div className="bar" key={c.label}><span>{c.label}</span><div><i style={{ width: `${(c.count / max) * 100}%` }} /></div><b>{c.count}</b></div>)}</div>}
      </Card>
      <div>
        {d.fees && <Card title="Recent payments">{d.fees.recent.length === 0 ? <Empty>No payments yet.</Empty> : d.fees.recent.map((p: any) =>
          <div className="list-item" key={p.receipt_no}><div><b>{p.student}</b><div className="muted small">{p.receipt_no} · {p.mode} · {fmtDateTime(p.paid_at)}</div></div><b>{inr(p.amount)}</b></div>)}</Card>}
        <Card title="Latest notices">{d.notices.length === 0 ? <Empty>No published notices.</Empty> : d.notices.map((n: any) =>
          <div className="list-item" key={n.id}><b>{n.title}</b><span className="muted small nowrap">{fmtDateTime(n.created_at)}</span></div>)}</Card>
      </div>
    </div>
  </>;
}
