from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from app.deps import CurrentUser, DbSession, require_roles
from app.models import Enrollment, SchoolClass, Student
from app.schemas import StudentCreate, StudentCreated, StudentOut, StudentUpdate
from app import services

router = APIRouter(prefix="/students", tags=["Students"])
WRITERS = ("admin", "accountant", "clerk")

def _create(db, data: StudentCreate) -> tuple[Student, str]:
    year = services.current_year(db)
    values = data.model_dump(exclude={"admission_no"})
    admission_no = (data.admission_no or "").strip().upper() or services.next_admission_no(db, year)
    if db.scalar(select(Student.id).where(Student.admission_no == admission_no)):
        raise ValueError(f"Admission number {admission_no} already exists")
    if data.class_id and not db.get(SchoolClass, data.class_id):
        raise ValueError("Selected class does not exist")
    student = Student(admission_no=admission_no, **values)
    temp = services.issue_credentials(student)
    db.add(student)
    db.flush()
    klass = db.get(SchoolClass, student.class_id) if student.class_id else None
    services.enroll(db, student, klass.academic_year if klass else year, student.class_id, student.roll_no)
    return student, temp

@router.get("", response_model=list[StudentOut])
def list_students(db: DbSession, user: CurrentUser, q: str | None = None, class_id: int | None = None,
                  status: str | None = None, skip: int = Query(0, ge=0), limit: int = Query(200, ge=1, le=1000),
                  include_inactive: bool = False):
    stmt = select(Student)
    if status:
        stmt = stmt.where(Student.status == status)
    elif not include_inactive:
        stmt = stmt.where(Student.is_active.is_(True))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Student.first_name.ilike(like), Student.last_name.ilike(like),
                              Student.admission_no.ilike(like), Student.parent_contact.ilike(like),
                              Student.parent_name.ilike(like)))
    if class_id:
        stmt = stmt.where(Student.class_id == class_id)
    return list(db.scalars(stmt.order_by(Student.first_name, Student.last_name).offset(skip).limit(limit)).all())

@router.post("", response_model=StudentCreated, status_code=201)
def create_student(data: StudentCreate, db: DbSession, user=Depends(require_roles(*WRITERS))):
    try:
        student, temp = _create(db, data)
        db.commit()
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc))
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Admission number already exists or class is invalid")
    db.refresh(student)
    return StudentCreated.model_validate(student).model_copy(update={"temp_password": temp})

@router.post("/import")
def import_students(rows: list[StudentCreate], db: DbSession, user=Depends(require_roles("admin", "clerk"))):
    """Bulk-import (e.g. from your old Excel/CSV). Each row is saved independently; errors are reported per row."""
    results = []
    for i, row in enumerate(rows, start=1):
        try:
            with db.begin_nested():
                student, temp = _create(db, row)
            results.append({"row": i, "ok": True, "name": f"{row.first_name} {row.last_name}".strip(),
                            "admission_no": student.admission_no, "temp_password": temp})
        except (ValueError, IntegrityError) as exc:
            results.append({"row": i, "ok": False, "name": f"{row.first_name} {row.last_name}".strip(), "error": str(exc)})
    db.commit()
    return {"created": sum(r["ok"] for r in results), "failed": sum(not r["ok"] for r in results), "results": results}

@router.post("/credentials/generate-missing")
def generate_missing_credentials(db: DbSession, user=Depends(require_roles("admin"))):
    """Give a temporary password to every active student who has none yet (e.g. after a DB import)."""
    out = []
    for s in db.scalars(select(Student).where(Student.is_active.is_(True), Student.password_hash.is_(None))).all():
        out.append({"admission_no": s.admission_no, "name": f"{s.first_name} {s.last_name}".strip(),
                    "temp_password": services.issue_credentials(s)})
    db.commit()
    return out

@router.get("/{student_id}", response_model=StudentOut)
def get_student(student_id: int, db: DbSession, user: CurrentUser):
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    return student

@router.get("/{student_id}/overview")
def student_overview(student_id: int, db: DbSession, user: CurrentUser):
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    history = db.execute(select(Enrollment, SchoolClass).outerjoin(SchoolClass, SchoolClass.id == Enrollment.class_id)
                         .where(Enrollment.student_id == student_id).order_by(Enrollment.academic_year.desc())).all()
    show_fees = user.role in ("admin", "accountant", "clerk")
    return {
        "student": StudentOut.model_validate(student),
        "history": [{"academic_year": e.academic_year, "class": services.class_label(k), "result": e.result} for e, k in history],
        "attendance": services.attendance_summary(db, student_id),
        "fees": services.fee_ledger(db, student_id) if show_fees else None,
        "results": services.results_for_student(db, student_id),
    }

@router.patch("/{student_id}", response_model=StudentOut)
def update_student(student_id: int, data: StudentUpdate, db: DbSession, user=Depends(require_roles(*WRITERS))):
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    changes = data.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(student, key, value)
    if "class_id" in changes and changes["class_id"]:
        klass = db.get(SchoolClass, changes["class_id"])
        if not klass:
            raise HTTPException(status_code=422, detail="Selected class does not exist")
        services.enroll(db, student, klass.academic_year, klass.id, student.roll_no)
    db.commit()
    db.refresh(student)
    return student

@router.post("/{student_id}/reset-password")
def reset_student_password(student_id: int, db: DbSession, user=Depends(require_roles("admin", "clerk"))):
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    temp = services.issue_credentials(student)
    db.commit()
    return {"admission_no": student.admission_no, "temp_password": temp}

@router.delete("/{student_id}", status_code=204)
def archive_student(student_id: int, db: DbSession, user=Depends(require_roles(*WRITERS))):
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    student.is_active = False
    student.status = "left"
    db.commit()
