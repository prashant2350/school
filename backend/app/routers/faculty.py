"""Everything a logged-in FACULTY member (role = teacher) uses, plus the admin's view of faculty attendance."""
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from app.deps import CurrentUser, DbSession, require_roles
from app.models import (Attendance, Exam, ExamMark, SchoolClass, StaffAttendance, Student, Subject,
                        TeachingAssignment, TimetableSlot, User)
from app.schemas import FacultyMarksIn, StaffAttendanceIn
from app.routers.teaching import DAYS, assignment_rows
from app.config import settings
from app import services

router = APIRouter(prefix="/faculty", tags=["Faculty"])
Teacher = Depends(require_roles("teacher"))
Admin = Depends(require_roles("admin"))
STAFF_STATUS = {"present", "half_day", "leave", "absent"}

def _my_timetable(db, user_id: int) -> list[dict]:
    rows = db.execute(select(TimetableSlot, TeachingAssignment, Subject, SchoolClass)
                      .join(TeachingAssignment, TeachingAssignment.id == TimetableSlot.assignment_id)
                      .join(Subject, Subject.id == TeachingAssignment.subject_id)
                      .join(SchoolClass, SchoolClass.id == TimetableSlot.class_id)
                      .where(TeachingAssignment.teacher_id == user_id, SchoolClass.academic_year == services.current_year(db))
                      .order_by(TimetableSlot.weekday, TimetableSlot.period_no)).all()
    return [{"weekday": t.weekday, "period_no": t.period_no, "class_id": k.id, "class_label": services.class_label(k),
             "subject": s.name, "assignment_id": a.id} for t, a, s, k in rows]

@router.get("/me")
def me(db: DbSession, user=Teacher):
    today = date.today()
    mine = services.teacher_classes(db, user.id)
    class_teacher_of = []
    for k in mine:
        total = db.scalar(select(func.count()).select_from(Student).where(Student.class_id == k.id, Student.is_active.is_(True))) or 0
        marked = db.scalar(select(func.count()).select_from(Attendance).where(Attendance.class_id == k.id, Attendance.attendance_date == today)) or 0
        class_teacher_of.append({"id": k.id, "label": services.class_label(k), "students": total, "marked_today": marked > 0, "marked_count": marked})
    tt = _my_timetable(db, user.id)
    sa = db.scalar(select(StaffAttendance).where(StaffAttendance.user_id == user.id, StaffAttendance.attendance_date == today))
    return {
        "id": user.id, "name": user.full_name, "employee_id": user.employee_id, "designation": user.designation,
        "must_change_password": user.must_change_password, "today": today.isoformat(), "weekday": DAYS[today.weekday()] if today.weekday() < 6 else "Sun",
        "class_teacher_of": class_teacher_of,
        "assignments": assignment_rows(db, teacher_id=user.id),
        "today_periods": [x for x in tt if x["weekday"] == today.weekday()],
        "my_attendance_today": {"status": sa.status, "marked_at": sa.marked_at.isoformat() if sa.marked_at else None} if sa else None,
    }

@router.get("/timetable")
def my_timetable(db: DbSession, user=Teacher):
    return {"periods": settings.periods_per_day, "days": DAYS, "slots": _my_timetable(db, user.id)}

# ── my own attendance: ONE button, once a day ────────────────────────────────
@router.post("/my-attendance")
def mark_my_attendance(db: DbSession, user=Teacher):
    today = date.today()
    row = db.scalar(select(StaffAttendance).where(StaffAttendance.user_id == user.id, StaffAttendance.attendance_date == today))
    if not row:
        row = StaffAttendance(user_id=user.id, attendance_date=today, status="present")
        db.add(row)
        db.commit()
        db.refresh(row)
    return {"status": row.status, "marked_at": row.marked_at.isoformat() if row.marked_at else None}

@router.get("/my-attendance")
def my_attendance(db: DbSession, user=Teacher):
    since = date.today() - timedelta(days=90)
    rows = db.scalars(select(StaffAttendance).where(StaffAttendance.user_id == user.id, StaffAttendance.attendance_date >= since)
                      .order_by(StaffAttendance.attendance_date.desc())).all()
    month = [r for r in rows if r.attendance_date.strftime("%Y-%m") == date.today().strftime("%Y-%m")]
    return {"month_present": sum(1 for r in month if r.status == "present") + 0.5 * sum(1 for r in month if r.status == "half_day"),
            "records": [{"date": r.attendance_date.isoformat(), "status": r.status,
                         "marked_at": r.marked_at.isoformat() if r.marked_at else None} for r in rows]}

# ── marks: only for the class + subject the admin assigned to this teacher ──
def _my_assignment(db, user, assignment_id: int) -> TeachingAssignment:
    a = db.get(TeachingAssignment, assignment_id)
    if not a or a.teacher_id != user.id:
        raise HTTPException(status_code=403, detail="You are not assigned to teach this subject to this class")
    return a

@router.get("/exams")
def exams_for_marks(db: DbSession, user=Teacher):
    """Exams that are open for mark entry, in the current academic year."""
    rows = db.scalars(select(Exam).where(Exam.status == "open", Exam.academic_year == services.current_year(db))
                      .order_by(Exam.start_date.desc(), Exam.id.desc())).all()
    return [{"id": e.id, "name": e.name, "academic_year": e.academic_year, "class_id": e.class_id} for e in rows]

@router.get("/marks/sheet")
def marks_sheet(exam_id: int, assignment_id: int, db: DbSession, user=Teacher):
    a = _my_assignment(db, user, assignment_id)
    exam = db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    subject = db.get(Subject, a.subject_id)
    students = db.scalars(select(Student).where(Student.class_id == a.class_id, Student.is_active.is_(True))
                          .order_by(Student.roll_no, Student.first_name)).all()
    saved = {m.student_id: m for m in db.scalars(select(ExamMark).where(ExamMark.exam_id == exam_id, ExamMark.subject == subject.name)).all()}
    max_marks = next((str(m.max_marks) for m in saved.values()), None)
    return {"locked": exam.status != "open", "subject": subject.name, "max_marks": max_marks,
            "rows": [{"student_id": s.id, "admission_no": s.admission_no, "name": f"{s.first_name} {s.last_name}".strip(),
                      "roll_no": s.roll_no, "marks_obtained": str(saved[s.id].marks_obtained) if s.id in saved else None} for s in students]}

@router.post("/marks")
def save_marks(data: FacultyMarksIn, db: DbSession, user=Teacher):
    """Save (or CSV-upload) marks for one exam + one class + one subject. All-or-nothing: if any row is wrong, nothing is saved."""
    a = _my_assignment(db, user, data.assignment_id)
    exam = db.get(Exam, data.exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    if exam.status != "open":
        raise HTTPException(status_code=409, detail="This exam is locked. Ask the admin if a correction is needed.")
    if exam.class_id and exam.class_id != a.class_id:
        raise HTTPException(status_code=422, detail="This exam is not for that class")
    subject = db.get(Subject, a.subject_id)
    roster = {s.id: s for s in db.scalars(select(Student).where(Student.class_id == a.class_id, Student.is_active.is_(True))).all()}
    by_adm = {s.admission_no: s for s in roster.values()}
    errors, resolved = [], {}
    for i, r in enumerate(data.records, start=1):
        s = roster.get(r.student_id) if r.student_id else by_adm.get((r.admission_no or "").strip().upper())
        if not s:
            errors.append(f"Row {i}: student {(r.admission_no or r.student_id)!s} is not in this class")
        elif r.marks_obtained > data.max_marks:
            errors.append(f"Row {i}: {s.admission_no} has {r.marks_obtained}, more than the maximum {data.max_marks}")
        else:
            resolved[s.id] = r
    if errors:
        raise HTTPException(status_code=400, detail=" | ".join(errors[:5]) + (f" … and {len(errors) - 5} more" if len(errors) > 5 else ""))
    for sid, r in resolved.items():
        row = db.scalar(select(ExamMark).where(ExamMark.exam_id == exam.id, ExamMark.student_id == sid, ExamMark.subject == subject.name))
        if row:
            row.marks_obtained, row.max_marks, row.remarks, row.entered_by, row.subject_id = r.marks_obtained, data.max_marks, r.remarks, user.id, subject.id
        else:
            db.add(ExamMark(exam_id=exam.id, student_id=sid, subject=subject.name, subject_id=subject.id, max_marks=data.max_marks,
                            marks_obtained=r.marks_obtained, remarks=r.remarks, entered_by=user.id))
    db.commit()
    return {"saved": len(resolved)}

# ── admin: faculty attendance ────────────────────────────────────────────────
@router.get("/attendance")
def faculty_attendance(db: DbSession, user=Admin, attendance_date: date = Query(default_factory=date.today)):
    teachers = db.scalars(select(User).where(User.role == "teacher", User.is_active.is_(True)).order_by(User.full_name)).all()
    saved = {r.user_id: r for r in db.scalars(select(StaffAttendance).where(StaffAttendance.attendance_date == attendance_date)).all()}
    return [{"user_id": t.id, "name": t.full_name, "employee_id": t.employee_id, "designation": t.designation,
             "status": saved[t.id].status if t.id in saved else None,
             "marked_at": saved[t.id].marked_at.isoformat() if t.id in saved and saved[t.id].marked_at else None} for t in teachers]

@router.put("/attendance")
def set_faculty_attendance(data: StaffAttendanceIn, db: DbSession, user=Admin):
    if data.status not in STAFF_STATUS:
        raise HTTPException(status_code=422, detail=f"status must be one of {sorted(STAFF_STATUS)}")
    if data.attendance_date > date.today():
        raise HTTPException(status_code=422, detail="Cannot mark a future date")
    t = db.get(User, data.user_id)
    if not t or t.role != "teacher":
        raise HTTPException(status_code=404, detail="Faculty member not found")
    row = db.scalar(select(StaffAttendance).where(StaffAttendance.user_id == t.id, StaffAttendance.attendance_date == data.attendance_date))
    if row:
        row.status, row.marked_by = data.status, user.id
    else:
        db.add(StaffAttendance(user_id=t.id, attendance_date=data.attendance_date, status=data.status, marked_by=user.id))
    db.commit()
    return {"ok": True}
