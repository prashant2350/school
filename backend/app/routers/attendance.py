"""STUDENT attendance - taken ONCE a day, in the first period, by the CLASS TEACHER.
Other subject teachers never take attendance. The admin can take / correct any class and any past date."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from app.deps import CurrentUser, DbSession, require_class_teacher_or_admin, require_roles
from app.models import Attendance, Student, SchoolClass
from app.schemas import AttendanceIn, AttendanceOut, BulkAttendanceIn

router = APIRouter(prefix="/attendance", tags=["Attendance"])
VALID = {"present", "absent", "half_day", "leave"}

def _check_date(user, d: date):
    if d > date.today():
        raise HTTPException(status_code=422, detail="Attendance cannot be marked for a future date")
    if user.role != "admin" and d != date.today():
        raise HTTPException(status_code=403, detail="Class teachers can take attendance for today only. Ask the admin to correct an earlier day.")

@router.get("", response_model=list[AttendanceOut])
def list_attendance(db: DbSession, user: CurrentUser,
                    attendance_date: date = Query(default_factory=date.today), class_id: int | None = None):
    if user.role != "admin":
        if not class_id:
            raise HTTPException(status_code=403, detail="Choose your class")
        require_class_teacher_or_admin(db, user, class_id)
    stmt = select(Attendance).where(Attendance.attendance_date == attendance_date)
    if class_id:
        stmt = stmt.where(Attendance.class_id == class_id)
    return list(db.scalars(stmt.order_by(Attendance.student_id)).all())

@router.post("", response_model=AttendanceOut, status_code=201)
def mark_attendance(data: AttendanceIn, db: DbSession, user=Depends(require_roles("admin"))):
    if data.status not in VALID:
        raise HTTPException(status_code=422, detail=f"status must be one of {sorted(VALID)}")
    student = db.get(Student, data.student_id)
    if not student or not student.is_active:
        raise HTTPException(status_code=404, detail="Active student not found")
    _check_date(user, data.attendance_date)
    row = db.scalar(select(Attendance).where(Attendance.student_id == student.id, Attendance.attendance_date == data.attendance_date))
    if row:
        raise HTTPException(status_code=409, detail="Attendance already exists for this student and date")
    row = Attendance(student_id=student.id, class_id=student.class_id, attendance_date=data.attendance_date,
                     status=data.status, marked_by=user.id, remarks=data.remarks)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.patch("/{attendance_id}", response_model=AttendanceOut)
def update_attendance(attendance_id: int, status: str, db: DbSession, user=Depends(require_roles("admin"))):
    if status not in VALID:
        raise HTTPException(status_code=422, detail=f"status must be one of {sorted(VALID)}")
    row = db.get(Attendance, attendance_id)
    if not row:
        raise HTTPException(status_code=404, detail="Attendance record not found")
    row.status = status
    row.marked_by = user.id
    db.commit()
    db.refresh(row)
    return row

@router.get("/class-sheet")
def class_sheet(class_id: int, db: DbSession, user: CurrentUser, attendance_date: date = Query(default_factory=date.today)):
    """All students of a class + the status already saved for that date. Class teacher (own class) or admin only."""
    require_class_teacher_or_admin(db, user, class_id)
    students = db.scalars(select(Student).where(Student.class_id == class_id, Student.is_active.is_(True))
                          .order_by(Student.roll_no, Student.first_name)).all()
    saved = {a.student_id: a for a in db.scalars(select(Attendance).where(
        Attendance.class_id == class_id, Attendance.attendance_date == attendance_date)).all()}
    return [{"student_id": s.id, "admission_no": s.admission_no, "name": f"{s.first_name} {s.last_name}".strip(),
             "roll_no": s.roll_no, "parent_name": s.parent_name, "parent_contact": s.parent_contact,
             "status": saved[s.id].status if s.id in saved else None,
             "remarks": saved[s.id].remarks if s.id in saved else None} for s in students]

@router.post("/bulk")
def bulk_attendance(data: BulkAttendanceIn, db: DbSession, user: CurrentUser):
    """Save a whole class for one day. Re-saving the same day updates instead of failing."""
    if not db.get(SchoolClass, data.class_id):
        raise HTTPException(status_code=404, detail="Class not found")
    require_class_teacher_or_admin(db, user, data.class_id)
    _check_date(user, data.attendance_date)
    saved = 0
    for r in data.records:
        if r.status not in VALID:
            raise HTTPException(status_code=422, detail=f"status must be one of {sorted(VALID)}")
        student = db.get(Student, r.student_id)
        if not student or student.class_id != data.class_id:
            raise HTTPException(status_code=422, detail=f"Student {r.student_id} is not in this class")
        row = db.scalar(select(Attendance).where(Attendance.student_id == r.student_id,
                                                  Attendance.attendance_date == data.attendance_date))
        if row:
            row.status, row.remarks, row.marked_by, row.class_id = r.status, r.remarks, user.id, data.class_id
        else:
            db.add(Attendance(student_id=r.student_id, class_id=data.class_id, attendance_date=data.attendance_date,
                              status=r.status, marked_by=user.id, remarks=r.remarks))
        saved += 1
    db.commit()
    return {"saved": saved}
