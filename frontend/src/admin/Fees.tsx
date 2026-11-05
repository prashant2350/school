import { useState, type FormEvent } from 'react';
import { Download, Plus, Printer, Wallet } from 'lucide-react';
import { api, downloadCsv, fmtDateTime, inr, todayISO, type Row } from '../api';
import { Badge, Btn, Card, Empty, ErrorBox, Field, Loading, Modal, PageHead, errMsg, useLoad, useToast } from '../ui';
import { useApp, useCurrentClasses } from './data';

export default function Fees() {
  const { me } = useApp();
  const [tab, setTab] = useState('collect');
  const canDues = ['admin', 'accountant'].includes(me.role);
  return <>
    <PageHead title="Fees" sub="Collect payments, issue receipts, charge dues and follow up on pending fees." />
    <div className="tabs">{[['collect', 'Collect & receipts'], ...(canDues ? [['dues', 'Charge dues']] : []), ['defaulters', 'Pending fees']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === 'collect' && <Collect />}{tab === 'dues' && <Dues />}{tab === 'defaulters' && <Defaulters />}
  </>;
}

function Collect() {
  const toast = useToast(); const { meta } = useApp();
  const [form, setForm] = useState(false); const [receipt, setReceipt] = useState<Row | null>(null);
  const { data, loading, error, reload } = useLoad<Row[]>(() => api.get('/fees/transactions'), []);
  return <Card title="Recent transactions" actions={<><Btn variant="ghost" disabled={!data?.length} onClick={() => data && downloadCsv('fee-transactions.csv', data.map(t => ({ receipt: t.receipt_no, date: t.paid_at, student: t.student_name, student_id: t.admission_no, amount: t.amount_paid, discount: t.discount, mode: t.payment_mode, note: t.reference_note, collected_by: t.collected_by_name })))}><Download size={16} />Export</Btn><Btn onClick={() => setForm(true)}><Wallet size={16} />Collect payment</Btn></>}>
    {loading ? <Loading /> : error ? <ErrorBox msg={error} retry={reload} /> : !data?.length ? <Empty>No payments recorded yet.</Empty> :
      <div className="table-wrap"><table><thead><tr><th>Receipt</th><th>Student</th><th>Date</th><th>Mode</th><th className="right">Amount</th><th></th></tr></thead><tbody>
        {data.map(t => <tr key={t.id}><td className="mono">{t.receipt_no}</td><td><b>{t.student_name}</b><div className="muted small mono">{t.admission_no}</div></td><td>{fmtDateTime(t.paid_at)}</td><td><Badge tone="blue">{t.payment_mode}</Badge></td><td className="right"><b>{inr(t.amount_paid)}</b></td>
          <td className="right"><Btn variant="ghost" className="btn-sm" onClick={() => setReceipt(t)}><Printer size={14} />Receipt</Btn></td></tr>)}</tbody></table></div>}
    {form && <PaymentForm onClose={() => setForm(false)} onSaved={async (p: Row) => { setForm(false); toast('Payment recorded'); await reload(); const all = await api.get('/fees/transactions'); setReceipt(all.find((x: Row) => x.receipt_no === p.receipt_no) ?? p); }} />}
    {receipt && <Modal title="Fee receipt" onClose={() => setReceipt(null)} printable>
      <div className="slip"><h3>{meta.settings.school_name}</h3><p className="muted small">{meta.settings.school_address}{meta.settings.school_phone ? ` · ${meta.settings.school_phone}` : ''}</p>
        <dl><dt>Receipt no.</dt><dd className="mono">{receipt.receipt_no}</dd><dt>Date</dt><dd>{fmtDateTime(receipt.paid_at)}</dd><dt>Student</dt><dd>{receipt.student_name}</dd><dt>Student ID</dt><dd className="mono">{receipt.admission_no}</dd>
          <dt>Payment mode</dt><dd style={{ textTransform: 'capitalize' }}>{receipt.payment_mode}</dd>{Number(receipt.discount) > 0 && <><dt>Discount</dt><dd>{inr(receipt.discount)}</dd></>}{receipt.reference_note && <><dt>Note</dt><dd>{receipt.reference_note}</dd></>}
          <dt>Amount paid</dt><dd className="big">{inr(receipt.amount_paid)}</dd><dt>Received by</dt><dd>{receipt.collected_by_name}</dd></dl></div>
      <div className="modal-actions no-print"><Btn variant="ghost" onClick={() => window.print()}><Printer size={16} />Print</Btn><Btn onClick={() => setReceipt(null)}>Close</Btn></div></Modal>}
  </Card>;
}

function PaymentForm({ onClose, onSaved }: { onClose: () => void; onSaved: (p: Row) => void }) {
  const toast = useToast(); const [q, setQ] = useState(''); const [pick, setPick] = useState<Row | null>(null); const [found, setFound] = useState<Row[]>([]);
  const [bal, setBal] = useState<string | null>(null); const [f, setF] = useState({ amount_paid: '', discount: '0', payment_mode: 'cash', reference_note: '' }); const [busy, setBusy] = useState(false);
  const search = async (v: string) => { setQ(v); setPick(null); setBal(null); if (v.trim().length < 2) return setFound([]); try { setFound(await api.get('/students', { q: v, limit: 8 })); } catch { setFound([]); } };
  const choose = async (s: Row) => { setPick(s); setFound([]); setQ(`${s.first_name} ${s.last_name} (${s.admission_no})`); try { const l = await api.get(`/fees/ledger/${s.id}`); setBal(l.balance); setF(x => ({ ...x, amount_paid: Number(l.balance) > 0 ? String(l.balance) : '' })); } catch { /* ignore */ } };
  const submit = async (e: FormEvent) => { e.preventDefault(); if (!pick) return toast('Search and select a student first', 'error'); setBusy(true);
    try { onSaved(await api.post('/fees/payments', { student_id: pick.id, amount_paid: f.amount_paid, discount: f.discount || '0', payment_mode: f.payment_mode, reference_note: f.reference_note || null })); } catch (err) { toast(errMsg(err), 'error'); setBusy(false); } };
  return <Modal title="Collect payment" subtitle="Records a cash/UPI/cheque payment taken at the school office." onClose={onClose}>
    <form onSubmit={submit}>
      <Field label="Student" required hint="Type name, student ID or parent mobile"><input autoFocus value={q} onChange={e => search(e.target.value)} placeholder="Search student…" />
        {found.length > 0 && <div style={{ border: '1px solid var(--line)', borderRadius: 10, marginTop: 4 }}>{found.map(s => <button type="button" key={s.id} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'space-between', border: 0, borderRadius: 0 }} onClick={() => choose(s)}><span>{s.first_name} {s.last_name}</span><span className="muted mono small">{s.admission_no}</span></button>)}</div>}</Field>
      {bal !== null && <div className={`note ${Number(bal) > 0 ? 'warn' : ''}`}>Outstanding balance: <b>{inr(bal)}</b></div>}
      <div className="row2"><Field label="Amount (₹)" required><input required type="number" min="0.01" step="0.01" value={f.amount_paid} onChange={e => setF({ ...f, amount_paid: e.target.value })} /></Field><Field label="Discount / concession (₹)"><input type="number" min="0" step="0.01" value={f.discount} onChange={e => setF({ ...f, discount: e.target.value })} /></Field></div>
      <div className="row2"><Field label="Payment mode"><select value={f.payment_mode} onChange={e => setF({ ...f, payment_mode: e.target.value })}>{['cash', 'upi', 'cheque', 'card', 'net_banking'].map(m => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}</select></Field><Field label="Note / reference"><input value={f.reference_note} onChange={e => setF({ ...f, reference_note: e.target.value })} placeholder="UPI ref, cheque no…" /></Field></div>
      <div className="modal-actions"><Btn type="button" variant="ghost" onClick={onClose}>Cancel</Btn><Btn type="submit" busy={busy} disabled={!pick}>Record payment</Btn></div>
    </form></Modal>;
}

function Dues() {
  const classes = useCurrentClasses(); const toast = useToast();
  const heads = useLoad<Row[]>(() => api.get('/fees/heads'), []);
  const [f, setF] = useState({ class_id: '', fee_head_id: '', period: '', amount_due: '', due_date: '' }); const [busy, setBusy] = useState(false); const [newHead, setNewHead] = useState('');
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true);
    try { const r = await api.post('/fees/dues/bulk', { class_id: Number(f.class_id), fee_head_id: Number(f.fee_head_id), period: f.period, amount_due: f.amount_due, due_date: f.due_date || null }); toast(`Charged ${r.created} students${r.skipped_existing ? ` (${r.skipped_existing} already had it)` : ''}`); } catch (err) { toast(errMsg(err), 'error'); } finally { setBusy(false); } };
  const addHead = async (e: FormEvent) => { e.preventDefault(); try { await api.post('/fees/heads', { name: newHead }); setNewHead(''); heads.reload(); toast('Fee type added'); } catch (err) { toast(errMsg(err), 'error'); } };
  return <div className="grid g2">
    <Card title="Charge a fee to a whole class"><form onSubmit={submit}>
      <Field label="Class" required><select required value={f.class_id} onChange={e => setF({ ...f, class_id: e.target.value })}><option value="">Select class</option>{classes.map(c => <option key={c.id} value={c.id}>{c.grade}-{c.section}</option>)}</select></Field>
      <Field label="Fee type" required><select required value={f.fee_head_id} onChange={e => setF({ ...f, fee_head_id: e.target.value })}><option value="">Select</option>{heads.data?.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></Field>
      <div className="row2"><Field label="Period" required hint="e.g. Oct-2026 or Term 1"><input required value={f.period} onChange={e => setF({ ...f, period: e.target.value })} /></Field><Field label="Amount per student (₹)" required><input required type="number" min="1" step="0.01" value={f.amount_due} onChange={e => setF({ ...f, amount_due: e.target.value })} /></Field></div>
      <Field label="Due date"><input type="date" min={todayISO()} value={f.due_date} onChange={e => setF({ ...f, due_date: e.target.value })} /></Field>
      <Btn type="submit" busy={busy}><Plus size={16} />Charge class</Btn></form></Card>
    <Card title="Fee types"><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>{heads.data?.map(h => <Badge key={h.id} tone="purple">{h.name}</Badge>)}</div>
      <form onSubmit={addHead} style={{ display: 'flex', gap: 8 }}><input required placeholder="e.g. Library Fee" value={newHead} onChange={e => setNewHead(e.target.value)} /><Btn type="submit">Add</Btn></form></Card>
  </div>;
}

function Defaulters() {
  const { data, loading, error, reload } = useLoad<Row[]>(() => api.get('/fees/defaulters'), []);
  const total = data?.reduce((a, r) => a + Number(r.balance), 0) ?? 0;
  return <Card title={data ? `${data.length} students · ${inr(total)} pending` : 'Pending fees'} actions={<Btn variant="ghost" disabled={!data?.length} onClick={() => data && downloadCsv('pending-fees.csv', data, ['admission_no', 'name', 'class', 'parent_contact', 'balance'])}><Download size={16} />Export</Btn>}>
    {loading ? <Loading /> : error ? <ErrorBox msg={error} retry={reload} /> : !data?.length ? <Empty>No pending fees 🎉</Empty> :
      <div className="table-wrap"><table><thead><tr><th>Student</th><th>Class</th><th>Parent mobile</th><th className="right">Pending</th></tr></thead><tbody>{data.map(r => <tr key={r.student_id}><td><b>{r.name}</b><div className="muted small mono">{r.admission_no}</div></td><td>{r.class}</td><td>{r.parent_contact}</td><td className="right" style={{ color: 'var(--red)', fontWeight: 700 }}>{inr(r.balance)}</td></tr>)}</tbody></table></div>}
  </Card>;
}
