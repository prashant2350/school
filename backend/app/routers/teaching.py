"""Admin setup for teaching: subjects, who teaches what to which class, and the weekly timetable."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from app.config import settings
from app.deps import CurrentUser, DbSession, require_roles
from app.models import ClassSubject, SchoolClass, Subject, TeachingAssignment, TimetableSlot, User
from app.schemas import AssignmentIn, ClassSubjectsIn, SubjectIn, TimetableIn
from app import services

router = APIRouter(prefix="/teaching", tags=["Teaching setup"])
DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

# ── subjects ─────────────────────────────────────────────────────────────────
@router.get("/subjects")
def list_subjects(db: DbSession, user: CurrentUser):
    return [{"id": s.id, "name": s.name, "code": s.code} for s in db.scalars(select(Subject).order_by(Subject.name)).all()]

@router.post("/subjects", status_code=201)
def add_subject(data: SubjectIn, db: DbSession, user=Depends(require_roles("admin"))):
    s = Subject(name=data.name.strip(), code=(data.code or "").strip() or None)
    db.add(s)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="That subject already exists")
    return {"id": s.id, "name": s.name, "code": s.code}

@router.delete("/subjects/{subject_id}", status_code=204)
def delete_subject(subject_id: int, db: DbSession, user=Depends(require_roles("admin"))):
    s = db.get(Subject, subject_id)
    if not s:
        raise HTTPException(status_code=404, detail="Subject not found")
    if db.scalar(select(ClassSubject.id).where(ClassSubject.subject_id == subject_id)):
        raise HTTPException(status_code=409, detail="This subject is used by one or more classes. Remove it from those classes first.")
    db.delete(s)
    db.commit()

# ── subjects of each class (set by the admin, no teacher needed yet) ─────────
@router.get("/class-subjects")
def class_subjects(class_id: int, db: DbSession, user: CurrentUser):
    """The subjects a class studies, each with its teacher (if one is assigned)."""
    rows = db.execute(select(ClassSubject, Subject).join(Subject, Subject.id == ClassSubject.subject_id)
                      .where(ClassSubject.class_id == class_id).order_by(Subject.name)).all()
    asg = {a.subject_id: a for a in db.scalars(select(TeachingAssignment).where(TeachingAssignment.class_id == class_id)).all()}
    names = {u.id: u.full_name for u in db.scalars(select(User)).all()}
    return [{"subject_id": s.id, "name": s.name, "code": s.code, "assignment_id": asg[s.id].id if s.id in asg else None,
             "teacher_id": asg[s.id].teacher_id if s.id in asg else None,
             "teacher": names.get(asg[s.id].teacher_id) if s.id in asg else None} for _, s in rows]

@router.post("/class-subjects", status_code=201)
def add_subject_to_classes(data: ClassSubjectsIn, db: DbSession, user=Depends(require_roles("admin"))):
    """The common button: add one subject (existing or brand new) to as many classes as you tick."""
    if data.subject_id:
        subject = db.get(Subject, data.subject_id)
        if not subject:
            raise HTTPException(status_code=404, detail="Subject not found")
    else:
        name = (data.subject_name or "").strip()
        if not name:
            raise HTTPException(status_code=422, detail="Choose a subject or type a new subject name")
        subject = db.scalar(select(Subject).where(func.lower(Subject.name) == name.lower()))
        if not subject:
            subject = Subject(name=name, code=(data.code or "").strip() or None)
            db.add(subject)
            db.flush()
    added = already = 0
    for cid in dict.fromkeys(data.class_ids):
        if not db.get(SchoolClass, cid):
            raise HTTPException(status_code=404, detail=f"Class {cid} not found")
        if db.scalar(select(ClassSubject.id).where(ClassSubject.class_id == cid, ClassSubject.subject_id == subject.id)):
            already += 1
        else:
            db.add(ClassSubject(class_id=cid, subject_id=subject.id))
            added += 1
    db.commit()
    return {"subject_id": subject.id, "subject": subject.name, "added": added, "already_had": already}

@router.delete("/class-subjects/{class_id}/{subject_id}", status_code=204)
def remove_subject_from_class(class_id: int, subject_id: int, db: DbSession, user=Depends(require_roles("admin"))):
    row = db.scalar(select(ClassSubject).where(ClassSubject.class_id == class_id, ClassSubject.subject_id == subject_id))
    if not row:
        raise HTTPException(status_code=404, detail="That class does not have this subject")
    a = db.scalar(select(TeachingAssignment).where(TeachingAssignment.class_id == class_id, TeachingAssignment.subject_id == subject_id))
    if a:
        for slot in db.scalars(select(TimetableSlot).where(TimetableSlot.assignment_id == a.id)).all():
            db.delete(slot)
        db.delete(a)
    db.delete(row)
    db.commit()

# ── assignments: teacher + class + subject ───────────────────────────────────
def assignment_rows(db, class_id: int | None = None, teacher_id: int | None = None) -> list[dict]:
    q = select(TeachingAssignment, SchoolClass, Subject, User) \
        .join(SchoolClass, SchoolClass.id == TeachingAssignment.class_id) \
        .join(Subject, Subject.id == TeachingAssignment.subject_id) \
        .join(User, User.id == TeachingAssignment.teacher_id)
    if class_id:
        q = q.where(TeachingAssignment.class_id == class_id)
    if teacher_id:
        q = q.where(TeachingAssignment.teacher_id == teacher_id)
    rows = db.execute(q.order_by(SchoolClass.grade, SchoolClass.section, Subject.name)).all()
    return [{"id": a.id, "class_id": k.id, "class_label": services.class_label(k), "academic_year": k.academic_year,
             "subject_id": s.id, "subject": s.name, "teacher_id": u.id, "teacher": u.full_name,
             "employee_id": u.employee_id} for a, k, s, u in rows]

@router.get("/assignments")
def list_assignments(db: DbSession, user: CurrentUser, class_id: int | None = None, teacher_id: int | None = None):
    return assignment_rows(db, class_id, teacher_id)

@router.post("/assignments", status_code=201)
def assign(data: AssignmentIn, db: DbSession, user=Depends(require_roles("admin"))):
    """Give a class's subject to a teacher. If that class+subject already has a teacher, it is changed."""
    teacher = db.get(User, data.teacher_id)
    if not teacher or teacher.role != "teacher" or not teacher.is_active:
        raise HTTPException(status_code=422, detail="Choose an active faculty member (role: teacher)")
    if not db.get(SchoolClass, data.class_id) or not db.get(Subject, data.subject_id):
        raise HTTPException(status_code=404, detail="Class or subject not found")
    if not db.scalar(select(ClassSubject.id).where(ClassSubject.class_id == data.class_id, ClassSubject.subject_id == data.subject_id)):
        db.add(ClassSubject(class_id=data.class_id, subject_id=data.subject_id))
    row = db.scalar(select(TeachingAssignment).where(TeachingAssignment.class_id == data.class_id,
                                                      TeachingAssignment.subject_id == data.subject_id))
    if row:
        row.teacher_id = data.teacher_id
    else:
        row = TeachingAssignment(**data.model_dump())
        db.add(row)
    db.commit()
    return {"id": row.id}

@router.delete("/assignments/{assignment_id}", status_code=204)
def unassign(assignment_id: int, db: DbSession, user=Depends(require_roles("admin"))):
    row = db.get(TeachingAssignment, assignment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Assignment not found")
    for slot in db.scalars(select(TimetableSlot).where(TimetableSlot.assignment_id == assignment_id)).all():
        db.delete(slot)
    db.delete(row)
    db.commit()

# ── timetable ────────────────────────────────────────────────────────────────
def timetable_for_class(db, class_id: int) -> list[dict]:
    rows = db.execute(select(TimetableSlot, TeachingAssignment, Subject, User)
                      .join(TeachingAssignment, TeachingAssignment.id == TimetableSlot.assignment_id)
                      .join(Subject, Subject.id == TeachingAssignment.subject_id)
                      .join(User, User.id == TeachingAssignment.teacher_id)
                      .where(TimetableSlot.class_id == class_id)
                      .order_by(TimetableSlot.weekday, TimetableSlot.period_no)).all()
    return [{"weekday": t.weekday, "period_no": t.period_no, "assignment_id": a.id, "subject": s.name,
             "teacher_id": u.id, "teacher": u.full_name} for t, a, s, u in rows]

@router.get("/timetable")
def get_timetable(class_id: int, db: DbSession, user: CurrentUser):
    return {"periods": settings.periods_per_day, "days": DAYS, "slots": timetable_for_class(db, class_id)}

@router.put("/timetable")
def save_timetable(data: TimetableIn, db: DbSession, user=Depends(require_roles("admin"))):
    """Replace a class's whole timetable. Refuses if a teacher would be in two classes in the same period."""
    if not db.get(SchoolClass, data.class_id):
        raise HTTPException(status_code=404, detail="Class not found")
    seen, clashes = set(), []
    for sl in data.slots:
        if sl.period_no > settings.periods_per_day:
            raise HTTPException(status_code=422, detail=f"Period {sl.period_no} is beyond the {settings.periods_per_day} periods per day")
        if (sl.weekday, sl.period_no) in seen:
            raise HTTPException(status_code=422, detail="Two entries for the same day and period")
        seen.add((sl.weekday, sl.period_no))
        a = db.get(TeachingAssignment, sl.assignment_id)
        if not a or a.class_id != data.class_id:
            raise HTTPException(status_code=422, detail="Each period must use a teacher assigned to this class")
        other = db.execute(select(SchoolClass, User).join(TeachingAssignment, TeachingAssignment.class_id == SchoolClass.id)
                           .join(TimetableSlot, TimetableSlot.assignment_id == TeachingAssignment.id)
                           .join(User, User.id == TeachingAssignment.teacher_id)
                           .where(TeachingAssignment.teacher_id == a.teacher_id, TimetableSlot.weekday == sl.weekday,
                                  TimetableSlot.period_no == sl.period_no, TimetableSlot.class_id != data.class_id)).first()
        if other:
            clashes.append(f"{other[1].full_name} already teaches {services.class_label(other[0])} on {DAYS[sl.weekday]} period {sl.period_no}")
    if clashes:
        raise HTTPException(status_code=409, detail="; ".join(clashes[:4]))
    for old in db.scalars(select(TimetableSlot).where(TimetableSlot.class_id == data.class_id)).all():
        db.delete(old)
    db.flush()
    for sl in data.slots:
        db.add(TimetableSlot(class_id=data.class_id, weekday=sl.weekday, period_no=sl.period_no, assignment_id=sl.assignment_id))
    db.commit()
    return {"saved": len(data.slots)}
