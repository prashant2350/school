import { useState, type FormEvent } from 'react';
import { api, type Row } from '../api';
import { Btn, Field, Modal, errMsg, useToast } from '../ui';
import { useApp, useCurrentClasses } from './data';

export default function StudentForm({ student, onClose, onSaved }: { student?: Row; onClose: () => void; onSaved: (created?: Row) => void }) {
  const toast = useToast();
  const classes = useCurrentClasses();
  const { meta } = useApp();
  const [f, setF] = useState<Row>({
    first_name: student?.first_name ?? '', last_name: student?.last_name ?? '', dob: student?.dob ?? '', gender: student?.gender ?? '',
    class_id: student?.class_id ?? '', roll_no: student?.roll_no ?? '', parent_name: student?.parent_name ?? '', mother_name: student?.mother_name ?? '',
    parent_contact: student?.parent_contact ?? '', parent_email: student?.parent_email ?? '', address: student?.address ?? '',
    blood_group: student?.blood_group ?? '', previous_school: student?.previous_school ?? '', admission_no: '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    const body: Row = { ...f };
    for (const k of ['dob', 'gender', 'roll_no', 'mother_name', 'parent_email', 'address', 'blood_group', 'previous_school']) if (body[k] === '') body[k] = null;
    body.class_id = body.class_id === '' ? null : Number(body.class_id);
    try {
      if (student) { delete body.admission_no; await api.patch(`/students/${student.id}`, body); toast('Student updated'); onSaved(); }
      else { if (!body.admission_no) delete body.admission_no; const created = await api.post('/students', body); onSaved(created); }
    } catch (err) { toast(errMsg(err), 'error'); } finally { setBusy(false); }
  };
  return <Modal wide title={student ? `Edit ${student.first_name}` : 'Add student'} subtitle={student ? student.admission_no : `Academic year ${meta.current_year}. A Student ID and login password are created automatically.`} onClose={onClose}>
    <form onSubmit={submit}>
      <div className="row2"><Field label="First name" required><input required value={f.first_name} onChange={set('first_name')} autoFocus /></Field><Field label="Last name"><input value={f.last_name} onChange={set('last_name')} /></Field></div>
      <div className="row3"><Field label="Date of birth"><input type="date" value={f.dob} onChange={set('dob')} /></Field>
        <Field label="Gender"><select value={f.gender} onChange={set('gender')}><option value="">—</option><option>Male</option><option>Female</option><option>Other</option></select></Field>
        <Field label="Blood group"><select value={f.blood_group} onChange={set('blood_group')}><option value="">—</option>{['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(b => <option key={b}>{b}</option>)}</select></Field></div>
      <div className="row3"><Field label="Class" hint={classes.length === 0 ? 'No classes for this year yet — add them under Classes & years.' : undefined}>
        <select value={f.class_id} onChange={set('class_id')}><option value="">Select class</option>{classes.map(c => <option key={c.id} value={c.id}>{c.grade}-{c.section}</option>)}</select></Field>
        <Field label="Roll no."><input value={f.roll_no} onChange={set('roll_no')} /></Field>
        {!student && <Field label="Student ID" hint="Leave blank to auto-generate"><input value={f.admission_no} onChange={set('admission_no')} placeholder="auto" /></Field>}</div>
      <div className="row2"><Field label="Father / guardian name" required><input required value={f.parent_name} onChange={set('parent_name')} /></Field><Field label="Mother's name"><input value={f.mother_name} onChange={set('mother_name')} /></Field></div>
      <div className="row2"><Field label="Parent mobile" required><input required type="tel" minLength={7} maxLength={20} value={f.parent_contact} onChange={set('parent_contact')} /></Field><Field label="Parent email"><input type="email" value={f.parent_email} onChange={set('parent_email')} /></Field></div>
      <Field label="Address"><textarea rows={2} value={f.address} onChange={set('address')} /></Field>
      <Field label="Previous school"><input value={f.previous_school} onChange={set('previous_school')} /></Field>
      <div className="modal-actions"><Btn type="button" variant="ghost" onClick={onClose}>Cancel</Btn><Btn type="submit" busy={busy}>{student ? 'Save changes' : 'Create student'}</Btn></div>
    </form>
  </Modal>;
}
