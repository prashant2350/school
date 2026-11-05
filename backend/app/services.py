"""Shared business logic used by several routers. Keep DB-agnostic (SQLAlchemy only)."""
from decimal import Decimal
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.config import settings
from app.models import (AcademicYear, Attendance, Enrollment, ExamMark, Exam, FeeTransaction, SchoolClass,
                        Setting, Student, StudentFeeDue, FeeHead)
from app.security import generate_temp_password, hash_password

GRADES = ["Nursery", "LKG", "UKG"] + [f"Class {i}" for i in range(1, 13)]
SETTING_KEYS = ("school_name", "school_address", "school_phone", "school_email", "principal_name", "result_template")

def next_grade(grade: str) -> str | None:
    """Class 9 -> Class 10. Returns None for the last grade (Class 12) or unknown names."""
    if grade not in GRADES:
        return None
    i = GRADES.index(grade)
    return GRADES[i + 1] if i + 1 < len(GRADES) else None

def grade_rank(grade: str) -> int:
    return GRADES.index(grade) if grade in GRADES else len(GRADES)

def ensure_standard_classes(db: Session, year: str, sections: list[str]) -> int:
    """Create Nursery, LKG, UKG, Class 1..12 for `year` in each section. Existing ones are left alone."""
    made = 0
    for grade in GRADES:
        for sec in sections:
            if not db.scalar(select(SchoolClass.id).where(SchoolClass.grade == grade, SchoolClass.section == sec,
                                                           SchoolClass.academic_year == year)):
                db.add(SchoolClass(grade=grade, section=sec, academic_year=year))
                made += 1
    db.commit()
    return made

def backfill_class_subjects(db: Session) -> None:
    """Every subject that has a teacher must also be in its class's subject list (older databases)."""
    from app.models import ClassSubject, TeachingAssignment
    have = {(c.class_id, c.subject_id) for c in db.scalars(select(ClassSubject)).all()}
    for a in db.scalars(select(TeachingAssignment)).all():
        if (a.class_id, a.subject_id) not in have:
            db.add(ClassSubject(class_id=a.class_id, subject_id=a.subject_id))
    db.commit()

def current_year(db: Session) -> str:
    row = db.scalar(select(AcademicYear).where(AcademicYear.is_current.is_(True)))
    return row.name if row else settings.current_academic_year

def get_logo(db: Session) -> bytes | None:
    """The school logo (PNG) uploaded in Settings, or None."""
    import base64
    row = db.get(Setting, "school_logo")
    return base64.b64decode(row.value) if row and row.value else None

def get_settings(db: Session) -> dict:
    stored = {s.key: s.value for s in db.scalars(select(Setting)).all()}
    defaults = {"school_name": settings.school_name, "school_address": settings.school_address,
                "school_phone": "", "school_email": "", "principal_name": "", "result_template": "classic"}
    return {k: stored.get(k, defaults[k]) for k in SETTING_KEYS}

def next_admission_no(db: Session, year_name: str) -> str:
    start = year_name.split("-")[0]
    prefix = f"{settings.admission_prefix}-{start}-"
    count = db.scalar(select(func.count()).select_from(Student).where(Student.admission_no.like(prefix + "%"))) or 0
    n = count + 1
    while db.scalar(select(Student.id).where(Student.admission_no == f"{prefix}{n:04d}")):
        n += 1
    return f"{prefix}{n:04d}"

def issue_credentials(student: Student) -> str:
    temp = generate_temp_password()
    student.password_hash = hash_password(temp)
    student.must_change_password = True
    return temp

def enroll(db: Session, student: Student, year_name: str, class_id: int | None, roll_no: str | None = None) -> Enrollment:
    row = db.scalar(select(Enrollment).where(Enrollment.student_id == student.id, Enrollment.academic_year == year_name))
    if row:
        row.class_id, row.roll_no = class_id, roll_no
    else:
        row = Enrollment(student_id=student.id, academic_year=year_name, class_id=class_id, roll_no=roll_no)
        db.add(row)
    return row

def ensure_enrollments(db: Session) -> None:
    """Make sure every active student with a class has an enrollment row for that class's year."""
    rows = db.execute(select(Student, SchoolClass).join(SchoolClass, Student.class_id == SchoolClass.id)
                      .where(Student.is_active.is_(True))).all()
    for student, klass in rows:
        exists = db.scalar(select(Enrollment.id).where(Enrollment.student_id == student.id,
                                                       Enrollment.academic_year == klass.academic_year))
        if not exists:
            db.add(Enrollment(student_id=student.id, academic_year=klass.academic_year,
                              class_id=klass.id, roll_no=student.roll_no))
    db.commit()

def class_label(k: SchoolClass | None) -> str:
    return f"{k.grade}-{k.section}" if k else "—"

def fee_balances(db: Session, student_ids: list[int] | None = None) -> dict[int, Decimal]:
    """balance = scheduled dues (net of discount) - payments - discount given at payment time."""
    dues_q = select(StudentFeeDue.student_id, func.sum(StudentFeeDue.amount_due - StudentFeeDue.discount)) \
        .where(StudentFeeDue.is_active.is_(True)).group_by(StudentFeeDue.student_id)
    paid_q = select(FeeTransaction.student_id, func.sum(FeeTransaction.amount_paid + FeeTransaction.discount)) \
        .group_by(FeeTransaction.student_id)
    if student_ids is not None:
        dues_q = dues_q.where(StudentFeeDue.student_id.in_(student_ids))
        paid_q = paid_q.where(FeeTransaction.student_id.in_(student_ids))
    dues = {sid: Decimal(v or 0) for sid, v in db.execute(dues_q).all()}
    paid = {sid: Decimal(v or 0) for sid, v in db.execute(paid_q).all()}
    out = {}
    for sid in set(dues) | set(paid) | set(student_ids or []):
        out[sid] = dues.get(sid, Decimal(0)) - paid.get(sid, Decimal(0))
    return out

def fee_ledger(db: Session, student_id: int) -> dict:
    dues = db.execute(select(StudentFeeDue, FeeHead.name).join(FeeHead, FeeHead.id == StudentFeeDue.fee_head_id)
                      .where(StudentFeeDue.student_id == student_id, StudentFeeDue.is_active.is_(True))
                      .order_by(StudentFeeDue.due_date, StudentFeeDue.id)).all()
    txns = db.scalars(select(FeeTransaction).where(FeeTransaction.student_id == student_id)
                      .order_by(FeeTransaction.paid_at.desc())).all()
    balance = fee_balances(db, [student_id]).get(student_id, Decimal(0))
    return {
        "balance": str(balance),
        "dues": [{"id": d.id, "fee_head": name, "period": d.period, "amount_due": str(d.amount_due),
                  "discount": str(d.discount), "due_date": d.due_date.isoformat() if d.due_date else None}
                 for d, name in dues],
        "payments": [{"receipt_no": t.receipt_no, "amount_paid": str(t.amount_paid), "discount": str(t.discount),
                      "payment_mode": t.payment_mode, "reference_note": t.reference_note,
                      "paid_at": t.paid_at.isoformat() if t.paid_at else None} for t in txns],
    }

def attendance_summary(db: Session, student_id: int) -> dict:
    counts = dict(db.execute(select(Attendance.status, func.count()).where(Attendance.student_id == student_id)
                             .group_by(Attendance.status)).all())
    total = sum(counts.values())
    attended = counts.get("present", 0) + counts.get("half_day", 0) * 0.5
    return {"total_days": total, "present": counts.get("present", 0), "absent": counts.get("absent", 0),
            "half_day": counts.get("half_day", 0), "leave": counts.get("leave", 0),
            "percentage": round(attended * 100 / total, 1) if total else None}

GRADE_SCALE = [(90, "A+"), (80, "A"), (70, "B+"), (60, "B"), (50, "C"), (40, "D")]   # below 40 = "E". Change here.

def grade_for(pct: float | None) -> str | None:
    if pct is None:
        return None
    for floor, g in GRADE_SCALE:
        if pct >= floor:
            return g
    return "E"

def results_for_student(db: Session, student_id: int, exam_id: int | None = None) -> list[dict]:
    """Only PUBLISHED exams are returned - students never see marks the admin has not published."""
    q = select(ExamMark, Exam).join(Exam, Exam.id == ExamMark.exam_id) \
        .where(ExamMark.student_id == student_id, Exam.status == "published")
    if exam_id is not None:
        q = q.where(Exam.id == exam_id)
    rows = db.execute(q.order_by(Exam.start_date.desc(), Exam.id.desc(), ExamMark.subject)).all()
    grouped: dict[int, dict] = {}
    for mark, exam in rows:
        g = grouped.setdefault(exam.id, {"exam_id": exam.id, "exam": exam.name, "academic_year": exam.academic_year,
                                         "subjects": [], "total": Decimal(0), "max": Decimal(0)})
        pct = float(mark.marks_obtained) * 100 / float(mark.max_marks) if mark.max_marks else None
        g["subjects"].append({"subject": mark.subject, "max_marks": str(mark.max_marks),
                              "marks_obtained": str(mark.marks_obtained), "remarks": mark.remarks, "grade": grade_for(pct)})
        g["total"] += mark.marks_obtained
        g["max"] += mark.max_marks
    out = []
    for g in grouped.values():
        pct = round(float(g["total"]) * 100 / float(g["max"]), 1) if g["max"] else None
        out.append({**g, "total": str(g["total"]), "max": str(g["max"]), "percentage": pct, "grade": grade_for(pct)})
    return out

# ── faculty helpers ──────────────────────────────────────────────────────────
def teacher_classes(db: Session, user_id: int) -> list[SchoolClass]:
    """Classes of the CURRENT year for which this person is the class teacher."""
    return list(db.scalars(select(SchoolClass).where(SchoolClass.class_teacher_id == user_id,
                                                     SchoolClass.academic_year == current_year(db))
                           .order_by(SchoolClass.grade, SchoolClass.section)).all())

def can_take_class_attendance(db: Session, user, class_id: int) -> bool:
    """Admin: any class.  Teacher: only the class they are class teacher of.  Everyone else: no."""
    if user.role == "admin":
        return True
    if user.role != "teacher":
        return False
    k = db.get(SchoolClass, class_id)
    return bool(k and k.class_teacher_id == user.id)
