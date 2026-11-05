import { useState } from 'react';
import { api, fmtDateTime, todayISO, type Row } from '../api';
import { Badge, Card, Empty, ErrorBox, Field, Loading, PageHead, errMsg, useLoad, useToast } from '../ui';

const OPTS = [['present', 'Present'], ['half_day', 'Half day'], ['leave', 'Leave'], ['absent', 'Absent']];

/** Faculty mark themselves present from their portal (one button). The admin can see everyone and correct any day here. */
export default function FacultyAttendance() {
  const toast = useToast(); const [date, setDate] = useState(todayISO());
  const { data, loading, error, reload } = useLoad<Row[]>(() => api.get('/faculty/attendance', { attendance_date: date }), [date]);
  const set = async (userId: number, status: string) => { try { await api.put('/faculty/attendance', { user_id: userId, attendance_date: date, status }); reload(); } catch (e) { toast(errMsg(e), 'error'); } };
  const present = data?.filter(r => r.status === 'present' || r.status === 'half_day').length ?? 0;
  return <>
    <PageHead title="Faculty attendance" sub="Faculty mark themselves present once a day from their portal. You can correct any day." />
    <Card actions={data && <Badge tone="green">{present} of {data.length} present</Badge>}>
      <div className="toolbar"><Field label="Date"><input type="date" max={todayISO()} value={date} onChange={e => setDate(e.target.value)} /></Field></div>
      {loading ? <Loading /> : error ? <ErrorBox msg={error} retry={reload} /> : !data?.length ? <Empty>No faculty accounts yet (Staff accounts, role: teacher).</Empty> :
        <div className="table-wrap"><table><thead><tr><th>Faculty</th><th>Employee ID</th><th>Marked at</th><th>Status</th></tr></thead><tbody>{data.map(r => <tr key={r.user_id}>
          <td><b>{r.name}</b>{r.designation && <div className="muted small">{r.designation}</div>}</td><td className="mono">{r.employee_id ?? '—'}</td><td className="muted small">{r.marked_at ? fmtDateTime(r.marked_at) : '—'}</td>
          <td><select value={r.status ?? ''} onChange={e => e.target.value && set(r.user_id, e.target.value)} aria-label={`Status for ${r.name}`} style={{ width: 'auto' }}><option value="">Not marked</option>{OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td></tr>)}</tbody></table></div>}
    </Card>
  </>;
}
