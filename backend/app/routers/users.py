from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from app.deps import CurrentUser, DbSession, require_roles
from app.models import User
from app.config import settings
from app.schemas import ResetPasswordIn, StaffCreate, StaffCreated, StaffOut, StaffUpdate
from app.security import generate_temp_password, hash_password

router = APIRouter(prefix="/users", tags=["Staff accounts"])
ROLES = {"admin", "teacher", "accountant", "clerk"}

@router.get("", response_model=list[StaffOut])
def list_staff(db: DbSession, user: CurrentUser):
    return list(db.scalars(select(User).order_by(User.full_name)).all())

def _next_employee_id(db) -> str:
    prefix = f"{settings.admission_prefix}-T-"
    n = (db.scalar(select(func.count()).select_from(User).where(User.employee_id.like(prefix + "%"))) or 0) + 1
    while db.scalar(select(User.id).where(User.employee_id == f"{prefix}{n:03d}")):
        n += 1
    return f"{prefix}{n:03d}"

@router.post("", response_model=StaffCreated, status_code=201)
def create_staff(data: StaffCreate, db: DbSession, user=Depends(require_roles("admin"))):
    if data.role not in ROLES:
        raise HTTPException(status_code=422, detail=f"role must be one of {sorted(ROLES)}")
    emp = (data.employee_id or "").strip().upper() or (_next_employee_id(db) if data.role == "teacher" else None)
    if emp and db.scalar(select(User.id).where(User.employee_id == emp)):
        raise HTTPException(status_code=409, detail=f"Employee ID {emp} is already used")
    if data.email:
        email = data.email.lower()
    elif emp:
        email = f"{emp.lower()}@staff.invalid"     # placeholder - this person signs in with the Employee ID
    else:
        raise HTTPException(status_code=422, detail="Email is required for this role")
    temp = None if data.password else generate_temp_password()
    row = User(full_name=data.full_name, email=email, phone_number=data.phone_number, role=data.role,
               employee_id=emp, designation=data.designation,
               password_hash=hash_password(data.password or temp),
               must_change_password=(data.role == "teacher" or temp is not None))
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A staff account with that email already exists")
    db.refresh(row)
    return StaffCreated.model_validate(row, from_attributes=True).model_copy(update={"temp_password": temp})

@router.patch("/{user_id}", response_model=StaffOut)
def update_staff(user_id: int, data: StaffUpdate, db: DbSession, admin=Depends(require_roles("admin"))):
    row = db.get(User, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="Staff member not found")
    changes = data.model_dump(exclude_unset=True)
    if row.id == admin.id and (changes.get("is_active") is False or ("role" in changes and changes["role"] != "admin")):
        raise HTTPException(status_code=400, detail="You cannot deactivate or demote your own account")
    if "role" in changes and changes["role"] not in ROLES:
        raise HTTPException(status_code=422, detail=f"role must be one of {sorted(ROLES)}")
    for k, v in changes.items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row

@router.post("/{user_id}/reset-password")
def reset_staff_password(user_id: int, data: ResetPasswordIn, db: DbSession, admin=Depends(require_roles("admin"))):
    """Leave new_password empty to auto-generate one (returned once). The person must change it at next sign-in."""
    row = db.get(User, user_id)
    if not row:
        raise HTTPException(status_code=404, detail="Staff member not found")
    temp = None if data.new_password else generate_temp_password()
    row.password_hash = hash_password(data.new_password or temp)
    row.must_change_password = row.id != admin.id
    db.commit()
    return {"temp_password": temp}
