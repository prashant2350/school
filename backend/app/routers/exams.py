from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.database import get_db
from app.deps import CurrentUser, DbSession, require_roles
from app.models import ClassSubject, Student, Exam, ExamMark, SchoolClass, Subject, TeachingAssignment, User
from app.schemas import BulkMarksIn, ExamCreate, ExamOut, ExamStatusIn, MarkCreate, MarkOut
from app import services

router = APIRouter(prefix="/exams", tags=["Examinations"])

@router.get("", response_model=list[ExamOut])
def list_exams(db: DbSession, user: CurrentUser):
    return list(db.scalars(select(Exam).order_by(Exam.start_date.desc())).all())

@router.post("", response_model=ExamOut, status_code=201)
def create_exam(data: ExamCreate, db: Session = Depends(get_db),
                user=Depends(require_roles("admin"))):
    row = Exam(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.post("/marks", response_model=MarkOut, status_code=201)
def enter_mark(data: MarkCreate, db: Session = Depends(get_db),
               user=Depends(require_roles("admin"))):
    if data.marks_obtained > data.max_marks:
        raise HTTPException(status_code=422, detail="marks_obtained cannot exceed max_marks")
    row = ExamMark(**data.model_dump())
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A mark for this student, exam and subject already exists")
    return row

@router.get("/{exam_id}/marks", response_model=list[MarkOut])
def list_marks(exam_id: int, db: DbSession, user=Depends(require_roles("admin"))):
    return list(db.scalars(select(ExamMark).where(ExamMark.exam_id == exam_id).order_by(ExamMark.student_id)).all())


@router.get("/{exam_id}/sheet")
def marks_sheet(exam_id: int, class_id: int, subject: str, db: DbSession, user=Depends(require_roles("admin"))):
    """Students of a class with any marks already saved for this exam + subject."""
    students = db.scalars(select(Student).where(Student.class_id == class_id, Student.is_active.is_(True))
                          .order_by(Student.roll_no, Student.first_name)).all()
    saved = {m.student_id: m for m in db.scalars(select(ExamMark).where(ExamMark.exam_id == exam_id, ExamMark.subject == subject)).all()}
    return [{"student_id": s.id, "admission_no": s.admission_no, "name": f"{s.first_name} {s.last_name}".strip(),
             "roll_no": s.roll_no, "marks_obtained": str(saved[s.id].marks_obtained) if s.id in saved else None,
             "max_marks": str(saved[s.id].max_marks) if s.id in saved else None} for s in students]

@router.post("/marks/bulk")
def bulk_marks(data: BulkMarksIn, db: DbSession, user=Depends(require_roles("admin"))):
    if not db.get(Exam, data.exam_id):
        raise HTTPException(status_code=404, detail="Exam not found")
    for r in data.records:
        if r.marks_obtained > data.max_marks:
            raise HTTPException(status_code=422, detail=f"Marks for student {r.student_id} exceed the maximum")
        row = db.scalar(select(ExamMark).where(ExamMark.exam_id == data.exam_id, ExamMark.student_id == r.student_id,
                                                ExamMark.subject == data.subject))
        if row:
            row.marks_obtained, row.max_marks, row.remarks, row.entered_by = r.marks_obtained, data.max_marks, r.remarks, user.id
        else:
            db.add(ExamMark(exam_id=data.exam_id, student_id=r.student_id, subject=data.subject,
                            max_marks=data.max_marks, marks_obtained=r.marks_obtained, remarks=r.remarks, entered_by=user.id))
    db.commit()
    return {"saved": len(data.records)}


STATUSES = {"draft", "open", "published"}

@router.patch("/{exam_id}/status", response_model=ExamOut)
def set_exam_status(exam_id: int, data: ExamStatusIn, db: DbSession, user=Depends(require_roles("admin"))):
    """open = faculty can enter marks.  published = locked + visible to students.  draft = hidden and locked."""
    if data.status not in STATUSES:
        raise HTTPException(status_code=422, detail=f"status must be one of {sorted(STATUSES)}")
    exam = db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    exam.status = data.status
    db.commit()
    db.refresh(exam)
    return exam

@router.get("/{exam_id}/progress")
def exam_progress(exam_id: int, db: DbSession, user=Depends(require_roles("admin"))):
    """For each (class, subject, teacher): how many students have marks. Check this before publishing."""
    exam = db.get(Exam, exam_id)
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    q = select(ClassSubject, SchoolClass, Subject).join(SchoolClass, SchoolClass.id == ClassSubject.class_id) \
        .join(Subject, Subject.id == ClassSubject.subject_id).where(SchoolClass.academic_year == exam.academic_year)
    if exam.class_id:
        q = q.where(SchoolClass.id == exam.class_id)
    names = {u.id: u.full_name for u in db.scalars(select(User)).all()}
    asg = {(x.class_id, x.subject_id): x.teacher_id for x in db.scalars(select(TeachingAssignment)).all()}
    out = []
    for cs, k, sub in sorted(db.execute(q).all(), key=lambda r: (services.grade_rank(r[1].grade), r[1].section, r[2].name)):
        total = db.scalar(select(func.count()).select_from(Student).where(Student.class_id == k.id, Student.is_active.is_(True))) or 0
        done = db.scalar(select(func.count()).select_from(ExamMark).join(Student, Student.id == ExamMark.student_id)
                         .where(ExamMark.exam_id == exam.id, ExamMark.subject == sub.name, Student.class_id == k.id)) or 0
        out.append({"class": services.class_label(k), "subject": sub.name, "teacher": names.get(asg.get((k.id, sub.id))) or "— no teacher —",
                    "entered": done, "students": total})
    return out
