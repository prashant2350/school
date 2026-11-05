import { useRef, useState, type FormEvent } from 'react';
import { Bus, ChevronDown, ChevronUp, Pencil, Phone, Plus, Trash2, Upload, UserCheck, Users, X } from 'lucide-react';
import { api, fmtDate, fmtTime, shrinkImage, type Row } from '../api';
import { Badge, Btn, Card, Confirm, Empty, ErrorBox, Field, Loading, Modal, PageHead, PhotoAvatar, errMsg, useBlobUrl, useLoad, useToast } from '../ui';
import { useApp } from './data';

type Tab = 'students' | 'buses' | 'drivers';
const STATUS: Record<string, [string, 'green' | 'amber' | 'gray' | 'red']> = { allotted: ['Bus allotted', 'green'], pending: ['Waiting for bus', 'amber'], none: ['Not chosen yet', 'red'], not_using: ['Not using bus', 'gray'] };

export default function Transport() {
  const { me } = useApp(); const admin = me.role === 'admin';
  const [tab, setTab] = useState<Tab>('students');
  const ov = useLoad<Row>(() => api.get('/transport/overview'), []);
  const buses = useLoad<Row[]>(() => api.get('/transport/buses'), []);
  const drivers = useLoad<Row[]>(() => api.get('/transport/drivers'), []);
  const refresh = () => { ov.reload(); buses.reload(); drivers.reload(); };
  const o = ov.data;
  return <>
    <PageHead title="Transport" sub="Buses, drivers and every student's bus for this academic year." />
    {o && <div className="grid g4" style={{ marginBottom: 20 }}>
      <div className="stat"><div className="ico t-purple"><Bus size={22} /></div><div><b>{o.buses}</b><span>Active buses · {o.drivers} drivers</span></div></div>
      <div className="stat"><div className="ico t-green"><UserCheck size={22} /></div><div><b>{o.allotted}</b><span>Students with a bus</span></div></div>
      <div className="stat"><div className="ico t-amber"><Users size={22} /></div><div><b>{o.pending}</b><span>Waiting for a bus</span></div></div>
      <div className="stat"><div className="ico t-red"><Users size={22} /></div><div><b>{o.none}</b><span>Have not chosen yet</span></div></div></div>}
    <Card><div className="tabs">{([['students', 'Student allotment'], ['buses', 'Buses & routes'], ['drivers', 'Drivers']] as const).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'students' && <StudentsTab buses={buses.data ?? []} onChanged={refresh} />}
      {tab === 'buses' && <BusesTab buses={buses} drivers={drivers.data ?? []} admin={admin} onChanged={refresh} />}
      {tab === 'drivers' && <DriversTab drivers={drivers} admin={admin} onChanged={refresh} />}
    </Card>
  </>;
}

// ── students ─────────────────────────────────────────────────────────────────
function StudentsTab({ buses, onChanged }: { buses: Row[]; onChanged: () => void }) {
  const [status, setStatus] = useState('attention'); const [q, setQ] = useState(''); const [bus, setBus] = useState('');
  const [edit, setEdit] = useState<Row | null>(null);
  const { data, loading, error, reload } = useLoad<Row[]>(() => api.get('/transport/students', { status: status === 'all' ? '' : status, q, bus_id: bus }), [status, q, bus]);
  return <>
    <div className="toolbar">
      <select value={status} onChange={e => setStatus(e.target.value)} aria-label="Show"><option value="attention">Needs attention</option><option value="allotted">Bus allotted</option><option value="not_using">Not using bus</option><option value="all">All students</option></select>
      <select value={bus} onChange={e => setBus(e.target.value)} aria-label="Bus"><option value="">Any bus</option>{buses.map(b => <option key={b.id} value={b.id}>Bus {b.number}</option>)}</select>
      <input className="grow" placeholder="Search name or student ID" value={q} onChange={e => setQ(e.target.value)} /></div>
    {status === 'attention' && <div className="note"><Bus size={16} /><span>Students who have not chosen a bus yet, or chose a pickup point that is not on any route. After promotion, everyone appears here until they choose for the new year.</span></div>}
    {loading ? <Loading /> : error ? <ErrorBox msg={error} retry={reload} /> : !data?.length ? <Empty>No students in this list.</Empty> :
      <div className="table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>Pickup request</th><th>Bus &amp; stop</th><th>Status</th><th></th></tr></thead><tbody>
        {data.map(r => { const [label, tone] = STATUS[r.status];
          return <tr key={r.student_id}><td><b>{r.name}</b><div className="muted small mono">{r.admission_no}</div></td><td>{r.class_label}</td>
            <td>{r.pickup_location || <span className="muted">—</span>}{r.note && <div className="muted small">{r.note}</div>}</td>
            <td>{r.bus_number ? <><b>Bus {r.bus_number}</b><div className="muted small">{r.stop_name || 'No stop chosen'}</div></> : <span className="muted">—</span>}</td>
            <td><Badge tone={tone}>{label}</Badge>{r.locked && <div className="muted small">Set by office</div>}</td>
            <td className="right"><Btn variant="soft" className="btn-sm" onClick={() => setEdit(r)}>{r.status === 'allotted' ? 'Change' : 'Allot bus'}</Btn></td></tr>; })}</tbody></table></div>}
    {edit && <AssignDialog row={edit} buses={buses} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); onChanged(); }} />}
  </>;
}

function AssignDialog({ row, buses, onClose, onSaved }: { row: Row; buses: Row[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast(); const [busy, setBusy] = useState(false);
  const [uses, setUses] = useState<boolean>(row.uses_bus ?? true); const [busId, setBusId] = useState<string>(row.bus_id ? String(row.bus_id) : '');
  const [stopId, setStopId] = useState<string>(row.stop_id ? String(row.stop_id) : ''); const [loc, setLoc] = useState<string>(row.pickup_location ?? '');
  const [lock, setLock] = useState(true); const [force, setForce] = useState(false);
  const bus = buses.find(b => String(b.id) === busId);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await api.put(`/transport/students/${row.student_id}`, { uses_bus: uses, bus_id: uses && busId ? Number(busId) : null, stop_id: uses && stopId ? Number(stopId) : null, pickup_location: uses ? loc || null : null, lock, force }); toast('Transport saved'); onSaved(); }
    catch (err) { toast(errMsg(err), 'error'); setBusy(false); }
  };
  return <Modal title={`Bus for ${row.name}`} subtitle={`${row.class_label} · ${row.admission_no}`} onClose={onClose}>
    <form onSubmit={submit}>
      <div className="seg" style={{ marginBottom: 14 }}><button type="button" className={uses ? 'on' : ''} onClick={() => setUses(true)}>Uses the bus</button><button type="button" className={!uses ? 'on' : ''} onClick={() => setUses(false)}>No bus</button></div>
      {uses && <>
        {row.pickup_location && <div className="note">The student asked to be picked up at: <b>{row.pickup_location}</b></div>}
        <Field label="Bus" required hint="Changing the bus clears the stop below."><select required={!loc.trim()} value={busId} onChange={e => { setBusId(e.target.value); setStopId(''); }}><option value="">Select bus</option>
          {buses.filter(b => b.is_active || String(b.id) === busId).map(b => <option key={b.id} value={b.id}>Bus {b.number}{b.route_name ? ` · ${b.route_name}` : ''} ({b.seats_used}/{b.capacity} seats)</option>)}</select></Field>
        <Field label="Pickup stop" hint="The stop gives the student their pickup time."><select value={stopId} disabled={!bus} onChange={e => setStopId(e.target.value)}><option value="">No stop chosen</option>
          {bus?.stops.map((s: Row) => <option key={s.id} value={s.id}>{s.name}{s.pickup_time ? ` — ${fmtTime(s.pickup_time)}` : ''}</option>)}</select></Field>
        <Field label="Pickup location (as written)"><input value={loc} onChange={e => setLoc(e.target.value)} maxLength={255} /></Field>
        {bus && bus.seats_used >= bus.capacity && !(row.bus_id === bus.id) && <label className="small" style={{ display: 'flex', gap: 8, marginBottom: 10 }}><input type="checkbox" style={{ width: 'auto' }} checked={force} onChange={e => setForce(e.target.checked)} />Bus {bus.number} is full. Allow over capacity.</label>}
      </>}
      <label className="small" style={{ display: 'flex', gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={lock} onChange={e => setLock(e.target.checked)} />Lock — the student cannot change this from the portal</label>
      <div className="modal-actions"><Btn type="button" variant="ghost" onClick={onClose}>Cancel</Btn><Btn type="submit" busy={busy}>Save</Btn></div>
    </form></Modal>;
}

// ── buses ────────────────────────────────────────────────────────────────────
function BusesTab({ buses, drivers, admin, onChanged }: { buses: ReturnType<typeof useLoad<Row[]>>; drivers: Row[]; admin: boolean; onChanged: () => void }) {
  const toast = useToast(); const [edit, setEdit] = useState<Row | 'new' | null>(null); const [del, setDel] = useState<Row | null>(null);
  if (buses.loading) return <Loading />; if (buses.error) return <ErrorBox msg={buses.error} retry={buses.reload} />;
  return <>
    {admin && <div className="toolbar"><Btn onClick={() => setEdit('new')}><Plus size={16} />Add bus</Btn></div>}
    {!buses.data?.length ? <Empty>No buses yet. {admin ? 'Add your first bus, then its route stops.' : ''}</Empty> :
      <div className="grid g2">{buses.data.map(b => { const pct = Math.min(100, Math.round(b.seats_used / b.capacity * 100));
        return <div className="exam-card" key={b.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
            <div><span className="busplate" style={{ fontSize: 20, padding: '6px 14px' }}>{b.number}</span> {!b.is_active && <Badge tone="gray">Inactive</Badge>}
              <div style={{ marginTop: 8 }}><b>{b.route_name || 'No route name'}</b>{b.registration_no && <span className="muted small mono"> · {b.registration_no}</span>}</div></div>
            {admin && <div style={{ display: 'flex', gap: 4 }}><button className="icon-btn" aria-label={`Edit bus ${b.number}`} onClick={() => setEdit(b)}><Pencil size={16} /></button><button className="icon-btn" aria-label={`Delete bus ${b.number}`} onClick={() => setDel(b)}><Trash2 size={16} /></button></div>}</div>
          <p className="small" style={{ margin: '10px 0 4px' }}>Driver: {b.driver ? <b>{b.driver.full_name}</b> : <span className="muted">not assigned</span>}{b.driver && <span className="muted"> · {b.driver.phone}</span>}</p>
          <p className="small muted" style={{ margin: '0 0 8px' }}>Reaches school {fmtTime(b.school_arrival_time)} · leaves {fmtTime(b.school_departure_time)}</p>
          <div className={`seatbar ${pct >= 100 ? 'full' : ''}`}><i style={{ width: `${pct}%` }} /></div><div className="muted small" style={{ margin: '4px 0 8px' }}>{b.seats_used} of {b.capacity} seats used</div>
          <div>{b.stops.length ? b.stops.map((s: Row) => <span className="chip" key={s.id}>{s.name} <small className="muted">{fmtTime(s.pickup_time)}</small></span>) : <span className="muted small">No stops yet</span>}</div>
        </div>; })}</div>}
    {edit && <BusForm bus={edit === 'new' ? null : edit} drivers={drivers} buses={buses.data ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); onChanged(); toast('Bus saved'); }} />}
    {del && <Confirm title={`Delete Bus ${del.number}?`} danger confirmLabel="Delete bus" onClose={() => setDel(null)} message={<p>This removes the bus and its stops. If students have ever been allotted to it, mark it inactive instead.</p>}
      onConfirm={async () => { try { await api.del(`/transport/buses/${del.id}`); setDel(null); onChanged(); toast('Bus deleted'); } catch (e) { toast(errMsg(e), 'error'); setDel(null); } }} />}
  </>;
}

type StopRow = { id?: number; name: string; pickup_time: string; drop_time: string };
function BusForm({ bus, drivers, buses, onClose, onSaved }: { bus: Row | null; drivers: Row[]; buses: Row[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast(); const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ number: bus?.number ?? '', registration_no: bus?.registration_no ?? '', capacity: String(bus?.capacity ?? 40), route_name: bus?.route_name ?? '', driver_id: bus?.driver_id ? String(bus.driver_id) : '',
    school_arrival_time: bus?.school_arrival_time ?? '', school_departure_time: bus?.school_departure_time ?? '', is_active: bus?.is_active ?? true });
  const [stops, setStops] = useState<StopRow[]>((bus?.stops ?? []).map((s: Row) => ({ id: s.id, name: s.name, pickup_time: s.pickup_time ?? '', drop_time: s.drop_time ?? '' })));
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const setStop = (i: number, c: Partial<StopRow>) => setStops(p => p.map((s, j) => (j === i ? { ...s, ...c } : s)));
  const move = (i: number, d: number) => setStops(p => { const n = [...p]; const j = i + d; if (j < 0 || j >= n.length) return p; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const takenDrivers = new Set(buses.filter(b => b.id !== bus?.id && b.driver_id).map(b => b.driver_id));
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    const body = { number: f.number.trim(), registration_no: f.registration_no.trim() || null, capacity: Number(f.capacity), route_name: f.route_name.trim(), driver_id: f.driver_id ? Number(f.driver_id) : null,
      school_arrival_time: f.school_arrival_time || null, school_departure_time: f.school_departure_time || null, is_active: f.is_active };
    try {
      const saved = bus ? await api.patch(`/transport/buses/${bus.id}`, body) : await api.post('/transport/buses', body);
      await api.put(`/transport/buses/${saved.id}/stops`, stops.filter(s => s.name.trim()).map(s => ({ id: s.id ?? null, name: s.name.trim(), pickup_time: s.pickup_time || null, drop_time: s.drop_time || null })));
      onSaved();
    } catch (err) { toast(errMsg(err), 'error'); setBusy(false); }
  };
  return <Modal wide title={bus ? `Edit Bus ${bus.number}` : 'Add bus'} onClose={onClose}>
    <form onSubmit={submit}>
      <div className="row3"><Field label="Bus number" required hint="What parents see, e.g. 07"><input required value={f.number} onChange={set('number')} maxLength={30} /></Field>
        <Field label="Number plate"><input value={f.registration_no} onChange={set('registration_no')} placeholder="UP57 AB 1234" /></Field>
        <Field label="Seats" required><input required type="number" min={1} max={200} value={f.capacity} onChange={set('capacity')} /></Field></div>
      <div className="row2"><Field label="Route name"><input value={f.route_name} onChange={set('route_name')} placeholder="Station Road – Darbar Road" /></Field>
        <Field label="Driver"><select value={f.driver_id} onChange={set('driver_id')}><option value="">No driver yet</option>{drivers.filter(d => d.is_active && !takenDrivers.has(d.id)).map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select></Field></div>
      <div className="row3"><Field label="Reaches school at"><input type="time" value={f.school_arrival_time} onChange={set('school_arrival_time')} /></Field>
        <Field label="Leaves school at"><input type="time" value={f.school_departure_time} onChange={set('school_departure_time')} /></Field>
        <Field label="Status"><select value={f.is_active ? '1' : '0'} onChange={e => setF({ ...f, is_active: e.target.value === '1' })}><option value="1">Running</option><option value="0">Inactive</option></select></Field></div>
      <h3 style={{ fontSize: 15, margin: '6px 0 8px' }}>Pickup stops, in route order</h3>
      <p className="muted small" style={{ marginTop: 0 }}>Morning time = when the bus reaches the stop. Afternoon time = when it drops students back there. Students are shown these as estimates.</p>
      {stops.map((s, i) => <div className="stoprow" key={s.id ?? `n${i}`}>
        <input aria-label={`Stop ${i + 1} name`} placeholder="Stop name" value={s.name} onChange={e => setStop(i, { name: e.target.value })} />
        <input aria-label="Morning time" type="time" value={s.pickup_time} onChange={e => setStop(i, { pickup_time: e.target.value })} />
        <input aria-label="Afternoon time" type="time" value={s.drop_time} onChange={e => setStop(i, { drop_time: e.target.value })} />
        <div style={{ display: 'flex' }}><button type="button" className="icon-btn" aria-label="Move up" onClick={() => move(i, -1)}><ChevronUp size={16} /></button><button type="button" className="icon-btn" aria-label="Move down" onClick={() => move(i, 1)}><ChevronDown size={16} /></button>
          <button type="button" className="icon-btn" aria-label="Remove stop" onClick={() => setStops(p => p.filter((_, j) => j !== i))}><X size={16} /></button></div></div>)}
      <Btn type="button" variant="ghost" className="btn-sm" onClick={() => setStops(p => [...p, { name: '', pickup_time: '', drop_time: '' }])}><Plus size={14} />Add stop</Btn>
      <div className="modal-actions"><Btn type="button" variant="ghost" onClick={onClose}>Cancel</Btn><Btn type="submit" busy={busy}>Save bus</Btn></div>
    </form></Modal>;
}

// ── drivers ──────────────────────────────────────────────────────────────────
const expiry = (d?: string | null): [string, 'green' | 'amber' | 'red'] | null => {
  if (!d) return null; const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  return days < 0 ? ['Licence expired', 'red'] : days <= 30 ? [`Licence expires in ${days} days`, 'amber'] : null;
};
export function DriverPhoto({ d, size = 64 }: { d: Row; size?: number }) {
  const url = useBlobUrl(d.has_photo ? `/transport/drivers/${d.id}/photo?v=${d.photo_version}` : null);
  return <PhotoAvatar name={d.full_name} src={url} size={size} />;
}

function DriversTab({ drivers, admin, onChanged }: { drivers: ReturnType<typeof useLoad<Row[]>>; admin: boolean; onChanged: () => void }) {
  const toast = useToast(); const [edit, setEdit] = useState<Row | 'new' | null>(null); const [del, setDel] = useState<Row | null>(null);
  if (drivers.loading) return <Loading />; if (drivers.error) return <ErrorBox msg={drivers.error} retry={drivers.reload} />;
  return <>
    {admin && <div className="toolbar"><Btn onClick={() => setEdit('new')}><Plus size={16} />Add driver</Btn></div>}
    {!drivers.data?.length ? <Empty>No drivers yet.</Empty> : <div className="grid g3">{drivers.data.map(d => { const ex = expiry(d.license_expiry);
      return <div className="exam-card drvcard" key={d.id}><DriverPhoto d={d} size={64} />
        <div style={{ flex: 1, minWidth: 0 }}><b>{d.full_name}</b> {!d.is_active && <Badge tone="gray">Inactive</Badge>}
          <div className="small"><Phone size={12} style={{ verticalAlign: -1 }} /> {d.phone}</div>
          <div className="muted small mono">{d.license_no}{d.license_expiry ? ` · valid till ${fmtDate(d.license_expiry)}` : ''}</div>
          <div style={{ marginTop: 4 }}>{d.bus_number ? <Badge tone="purple">Bus {d.bus_number}</Badge> : <Badge>No bus</Badge>} {ex && <Badge tone={ex[1]}>{ex[0]}</Badge>}</div></div>
        {admin && <div style={{ display: 'flex', flexDirection: 'column' }}><button className="icon-btn" aria-label={`Edit ${d.full_name}`} onClick={() => setEdit(d)}><Pencil size={16} /></button><button className="icon-btn" aria-label={`Delete ${d.full_name}`} onClick={() => setDel(d)}><Trash2 size={16} /></button></div>}</div>; })}</div>}
    {edit && <DriverForm driver={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); onChanged(); toast('Driver saved'); }} />}
    {del && <Confirm title={`Delete ${del.full_name}?`} danger confirmLabel="Delete driver" onClose={() => setDel(null)} message={<p>This removes the driver profile. A driver who is assigned to a bus cannot be deleted.</p>}
      onConfirm={async () => { try { await api.del(`/transport/drivers/${del.id}`); setDel(null); onChanged(); toast('Driver deleted'); } catch (e) { toast(errMsg(e), 'error'); setDel(null); } }} />}
  </>;
}

function DriverForm({ driver, onClose, onSaved }: { driver: Row | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast(); const [busy, setBusy] = useState(false); const file = useRef<HTMLInputElement>(null); const [picked, setPicked] = useState<File | null>(null);
  const [f, setF] = useState({ full_name: driver?.full_name ?? '', phone: driver?.phone ?? '', license_no: driver?.license_no ?? '', license_expiry: driver?.license_expiry ?? '', address: driver?.address ?? '', is_active: driver?.is_active ?? true });
  const set = (k: string) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    const body = { ...f, license_expiry: f.license_expiry || null, address: f.address.trim() || null };
    try {
      const saved = driver ? await api.patch(`/transport/drivers/${driver.id}`, body) : await api.post('/transport/drivers', body);
      if (picked) { const fd = new FormData(); fd.append('file', await shrinkImage(picked, 480), 'driver.jpg'); await api.upload(`/transport/drivers/${saved.id}/photo`, fd); }
      onSaved();
    } catch (err) { toast(errMsg(err), 'error'); setBusy(false); }
  };
  return <Modal title={driver ? 'Edit driver' : 'Add driver'} onClose={onClose}>
    <form onSubmit={submit}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
        {picked ? <img className="photo" style={{ width: 72, height: 72, border: '3px solid var(--line)' }} src={URL.createObjectURL(picked)} alt="New driver photo" /> : driver ? <DriverPhoto d={driver} size={72} /> : <PhotoAvatar name={f.full_name || 'Driver'} size={72} />}
        <div><Btn type="button" variant="soft" className="btn-sm" onClick={() => file.current?.click()}><Upload size={14} />{driver?.has_photo || picked ? 'Change photo' : 'Add photo'}</Btn><input ref={file} type="file" accept="image/*" hidden onChange={e => setPicked(e.target.files?.[0] ?? null)} /></div></div>
      <Field label="Full name" required><input required autoFocus value={f.full_name} onChange={set('full_name')} /></Field>
      <div className="row2"><Field label="Mobile number" required><input required type="tel" minLength={7} maxLength={20} value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Driving licence number" required><input required minLength={3} value={f.license_no} onChange={set('license_no')} /></Field></div>
      <div className="row2"><Field label="Licence valid till"><input type="date" value={f.license_expiry} onChange={set('license_expiry')} /></Field>
        <Field label="Status"><select value={f.is_active ? '1' : '0'} onChange={e => setF({ ...f, is_active: e.target.value === '1' })}><option value="1">Working</option><option value="0">Inactive</option></select></Field></div>
      <Field label="Address"><textarea rows={2} value={f.address} onChange={set('address')} /></Field>
      <div className="modal-actions"><Btn type="button" variant="ghost" onClick={onClose}>Cancel</Btn><Btn type="submit" busy={busy}>Save driver</Btn></div>
    </form></Modal>;
}
