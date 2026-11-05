"""New-admission workflow: enquiry/application -> approve (creates the student + login) or reject."""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from app.deps import CurrentUser, DbSession, require_roles
from app.models import AdmissionApplication, SchoolClass, Student
from app.schemas import PublicApply, AdmissionApprove, AdmissionCreate, AdmissionOut, AdmissionReject, StudentCreate, StudentCreated
from app.routers.students import _create
from app import services
from app.security import rate_limited

router = APIRouter(prefix="/admissions", tags=["Admissions"])
STAFF = ("admin", "clerk", "accountant")

@router.get("", response_model=list[AdmissionOut])
def list_applications(db: DbSession, user=Depends(require_roles(*STAFF)), status: str | None = None,
                      academic_year: str | None = None):
    stmt = select(AdmissionApplication).order_by(AdmissionApplication.created_at.desc())
    if status:
        stmt = stmt.where(AdmissionApplication.status == status)
    if academic_year:
        stmt = stmt.where(AdmissionApplication.academic_year == academic_year)
    return list(db.scalars(stmt.limit(500)).all())

@router.post("", response_model=AdmissionOut, status_code=201)
def create_application(data: AdmissionCreate, db: DbSession, user=Depends(require_roles(*STAFF))):
    values = data.model_dump()
    values["academic_year"] = values["academic_year"] or services.current_year(db)
    row = AdmissionApplication(**values)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.post("/{application_id}/approve", response_model=StudentCreated)
def approve_application(application_id: int, data: AdmissionApprove, db: DbSession,
                        user=Depends(require_roles(*STAFF))):
    app = db.get(AdmissionApplication, application_id)
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if app.status != "pending":
        raise HTTPException(status_code=409, detail=f"Application is already {app.status}")
    if not db.get(SchoolClass, data.class_id):
        raise HTTPException(status_code=422, detail="Selected class does not exist")
    first, _, last = app.applicant_name.strip().partition(" ")
    try:
        student, temp = _create(db, StudentCreate(
            first_name=first, last_name=last, dob=app.dob, gender=app.gender, address=app.address,
            parent_name=app.parent_name, parent_contact=app.parent_contact, parent_email=app.parent_email,
            class_id=data.class_id, roll_no=data.roll_no, previous_school=app.previous_school))
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc))
    app.status, app.student_id = "approved", student.id
    db.commit()
    db.refresh(student)
    return StudentCreated.model_validate(student).model_copy(update={"temp_password": temp})

@router.post("/{application_id}/reject", response_model=AdmissionOut)
def reject_application(application_id: int, data: AdmissionReject, db: DbSession,
                       user=Depends(require_roles(*STAFF))):
    app = db.get(AdmissionApplication, application_id)
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if app.status != "pending":
        raise HTTPException(status_code=409, detail=f"Application is already {app.status}")
    app.status, app.remarks = "rejected", data.remarks
    db.commit()
    db.refresh(app)
    return app


# ---------- public (no login): parents apply online; staff see it under New admissions > Pending ----------
public_router = APIRouter(prefix="/public", tags=["Public"])

@public_router.get("/grades")
def public_grades():
    return services.GRADES

@public_router.post("/apply", status_code=201)
def public_apply(data: PublicApply, request: Request, db: DbSession):
    """Anyone can submit an application. Protected by a hidden honeypot field and a per-IP rate limit."""
    if data.website:                        # bots fill the hidden field; pretend success
        return {"ok": True, "reference": "0"}
    ip = request.client.host if request.client else "unknown"
    if rate_limited(f"apply:{ip}", max_hits=5, window_seconds=3600):
        raise HTTPException(status_code=429, detail="Too many applications from this device. Please try later or call the school.")
    if data.applying_grade not in services.GRADES:
        raise HTTPException(status_code=422, detail="Please choose a valid class")
    values = data.model_dump(exclude={"website"})
    row = AdmissionApplication(academic_year=services.current_year(db), **values)
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"ok": True, "reference": f"APP-{row.id:05d}"}
