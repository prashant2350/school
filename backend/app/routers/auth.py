from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from app.deps import CurrentUser, DbSession
from app.models import Student, User
from app.schemas import ChangePasswordIn, LoginIn, StudentLoginIn, Token, UserOut
from app.security import (create_access_token, hash_password, login_failed, login_locked, login_ok, verify_password)

router = APIRouter(prefix="/auth", tags=["Authentication"])
LOCKED = HTTPException(status_code=429, detail="Too many failed attempts. Please try again in a few minutes.")

def authenticate(db, identifier: str, password: str):
    """identifier = email address OR faculty Employee ID (e.g. SHS-T-001)."""
    identifier = identifier.strip()
    key = f"staff:{identifier.lower()}"
    if login_locked(key):
        raise LOCKED
    if "@" in identifier:
        user = db.scalar(select(User).where(User.email == identifier.lower()))
    else:
        user = db.scalar(select(User).where(User.employee_id == identifier.upper()))
    if not user or not user.is_active or not verify_password(password, user.password_hash):
        login_failed(key)
        return None
    login_ok(key)
    return user

@router.post("/login", response_model=Token)
def login(data: LoginIn, db: DbSession):
    """Staff / admin login (email + password)."""
    user = authenticate(db, data.email, data.password)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email / employee ID or password")
    return Token(access_token=create_access_token(str(user.id), "staff"))

@router.post("/student-login", response_model=Token)
def student_login(data: StudentLoginIn, db: DbSession):
    """Student login (student ID = admission number + password)."""
    key = f"student:{data.student_id.strip().upper()}"
    if login_locked(key):
        raise LOCKED
    student = db.scalar(select(Student).where(Student.admission_no == data.student_id.strip().upper()))
    if not student or not student.is_active or not verify_password(data.password, student.password_hash):
        login_failed(key)
        raise HTTPException(status_code=401, detail="Incorrect student ID or password")
    login_ok(key)
    return Token(access_token=create_access_token(str(student.id), "student"))

@router.post("/token", response_model=Token, include_in_schema=False)
def oauth_login(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DbSession):
    user = authenticate(db, form.username, form.password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    return Token(access_token=create_access_token(str(user.id), "staff"))

@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user

@router.post("/change-password", status_code=204)
def change_password(data: ChangePasswordIn, db: DbSession, user: CurrentUser):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(data.new_password)
    user.must_change_password = False
    db.commit()
