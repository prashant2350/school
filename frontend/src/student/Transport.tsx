import { useState, type FormEvent } from 'react';
import { Bus, Clock, MapPin, Navigation, Pencil, Phone, ShieldCheck } from 'lucide-react';
import { api, fmtTime, type Row } from '../api';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Loading, PhotoAvatar, errMsg, useBlobUrl, useLoad, useToast } from '../ui';

/** The student's "School bus" page: choose a pickup stop once a year, then see bus, driver and timings. */
export default function TransportTab() {
  const { data, loading, error, reload, setData } = useLoad<Row>(() => api.get('/portal/transport'), []);
  const [editing, setEditing] = useState(false);
  const driverPhoto = useBlobUrl(data?.driver?.has_photo ? `/portal/transport/driver-photo?v=${data.driver.photo_version}` : null);
  if (loading) return <Loading />; if (error || !data) return <ErrorBox msg={error} retry={reload} />;
  const pref = data.preference;
  if (data.needs_preference || editing) return <PreferenceForm year={data.academic_year} first={data.needs_preference} current={pref}
    onCancel={data.needs_preference ? undefined : () => setEditing(false)} onSaved={d => { setData(d); setEditing(false); }} />;
  const change = !pref.locked && <Btn variant="ghost" className="btn-sm" onClick={() => setEditing(true)}><Pencil size={14} />Change</Btn>;

  if (!pref.uses_bus) return <Card title="School bus" actions={change}><Empty><Bus size={18} />You are not using the school bus this year.</Empty>
    {pref.locked && <p className="muted small" style={{ textAlign: 'center' }}>To change this, please contact the school office.</p>}</Card>;

  if (data.status === 'pending') return <Card title="School bus" actions={<>{<Badge tone="amber">Waiting for the school office</Badge>} {change}</>}>
    <div className="note"><Clock size={16} /><span>Your request is with the school office. They will choose the bus for <b>{pref.pickup_location || 'your pickup point'}</b> and it will show up here.</span></div>
    {pref.note && <p className="muted small">{pref.note}</p>}</Card>;

  const { bus, stop, driver } = data;
  return <>
    <Card title="Your school bus" actions={<>{pref.locked && <Badge tone="gray">Set by school office</Badge>} {change}</>}>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="busplate"><Bus size={26} />{bus.number}</span>
        <div><b style={{ fontSize: 17 }}>{bus.route_name || 'School bus'}</b>{bus.registration_no && <div className="muted small mono">{bus.registration_no}</div>}</div>
      </div>
      <div className="etas">
        <div className="eta"><span>Bus reaches {stop ? stop.name : 'your stop'}</span><b>{fmtTime(stop?.pickup_time)}</b></div>
        <div className="eta"><span>Bus reaches school</span><b>{fmtTime(bus.school_arrival_time)}</b></div>
        <div className="eta"><span>Back at your stop (afternoon)</span><b>{fmtTime(stop?.drop_time)}</b></div>
      </div>
      <p className="muted small" style={{ margin: 0 }}>These are estimated times. Please be at your stop a few minutes early.{bus.school_departure_time && <> The bus leaves school at about {fmtTime(bus.school_departure_time)}.</>}</p>
    </Card>
    {driver && <Card title="Driver"><div className="drv"><PhotoAvatar name={driver.full_name} src={driverPhoto} size={72} />
      <div><b style={{ fontSize: 17 }}>{driver.full_name}</b><div className="muted small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><ShieldCheck size={14} />Licence {driver.license_no}</div>
        <a className="btn btn-soft btn-sm" style={{ marginTop: 8, textDecoration: 'none' }} href={`tel:${driver.phone}`}><Phone size={14} />{driver.phone}</a></div></div></Card>}
    <Card title="Route and stops"><ul className="route">{data.route_stops.map((s: Row) => <li key={s.id} className={s.mine ? 'mine' : ''}><span><MapPin size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{s.name}{s.mine && ' (your stop)'}</span><span className="muted small nowrap">{fmtTime(s.pickup_time)}</span></li>)}
      <li><span><b>{`School`}</b></span><span className="muted small nowrap">{fmtTime(bus.school_arrival_time)}</span></li></ul></Card>
    <Card title="Live bus location"><div className="live"><Navigation size={22} /><p style={{ margin: '6px 0 0' }}>Live tracking is coming soon. Once the school fits GPS in the buses, you will see where your bus is right here.</p></div></Card>
  </>;
}

function PreferenceForm({ year, first, current, onCancel, onSaved }: { year: string; first: boolean; current: Row | null; onCancel?: () => void; onSaved: (d: Row) => void }) {
  const toast = useToast(); const [busy, setBusy] = useState(false);
  const stops = useLoad<Row[]>(() => api.get('/public/transport/stops'), []);
  const [uses, setUses] = useState<boolean>(current?.uses_bus ?? true);
  const [stopId, setStopId] = useState('');
  const [loc, setLoc] = useState<string>(current?.pickup_location ?? '');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { onSaved(await api.put('/portal/transport/preference', { uses_bus: uses, stop_id: uses && stopId ? Number(stopId) : null, pickup_location: uses ? loc || null : null })); toast('Bus preference saved'); }
    catch (err) { toast(errMsg(err), 'error'); } finally { setBusy(false); }
  };
  return <Card title={first ? `Choose your school bus for ${year}` : 'Change bus preference'}>
    <form onSubmit={submit}>
      {first && <div className="note"><Bus size={16} /><span>Tell the school whether you will use the school bus this year and where you will be picked up. Choosing a stop gives you its bus straight away.</span></div>}
      <div className="seg" role="tablist" style={{ marginBottom: 16 }}>
        <button type="button" className={uses ? 'on' : ''} onClick={() => setUses(true)}>I will use the bus</button>
        <button type="button" className={!uses ? 'on' : ''} onClick={() => setUses(false)}>I will not use the bus</button></div>
      {uses && <>
        {stops.loading ? <Loading /> : <Field label="Pickup stop" hint={stops.data?.length ? 'The stop decides your bus.' : 'No bus stops have been added yet — type your pickup location below.'}>
          <select value={stopId} onChange={e => setStopId(e.target.value)}><option value="">My stop is not in this list</option>
            {stops.data?.map(b => <optgroup key={b.bus_id} label={`Bus ${b.bus_number}${b.route_name ? ` · ${b.route_name}` : ''}`}>{b.stops.map((s: Row) => <option key={s.id} value={s.id}>{s.name}{s.pickup_time ? ` — ${fmtTime(s.pickup_time)}` : ''}</option>)}</optgroup>)}</select></Field>}
        <Field label={stopId ? 'Landmark near your home (optional)' : 'Your pickup location'} required={!stopId} hint="For example: near Hanuman Mandir, Kasia Road"><input value={loc} required={!stopId} onChange={e => setLoc(e.target.value)} maxLength={255} /></Field></>}
      <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>{onCancel && <Btn type="button" variant="ghost" onClick={onCancel}>Cancel</Btn>}<Btn type="submit" busy={busy}>Save preference</Btn></div>
    </form></Card>;
}
