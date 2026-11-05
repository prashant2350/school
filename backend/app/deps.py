from typing import Annotated
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models import User, Student

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_v1_prefix}/auth/token")
DbSession = Annotated[Session, Depends(get_db)]

def _unauthorized() -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired access token",
                         headers={"WWW-Authenticate": "Bearer"})

def _decode(token: str, kind: str) -> int:
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
        if payload.get("kind", "staff") != kind:
            raise ValueError("wrong token kind")
        return int(payload.get("sub", ""))
    except (jwt.PyJWTError, TypeError, ValueError):
        raise _unauthorized()

def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: DbSession) -> User:
    user = db.get(User, _decode(token, "staff"))
    if not user or not user.is_active:
        raise _unauthorized()
    return user

def get_current_student(token: Annotated[str, Depends(oauth2_scheme)], db: DbSession) -> Student:
    student = db.get(Student, _decode(token, "student"))
    if not student or not student.is_active:
        raise _unauthorized()
    return student

CurrentUser = Annotated[User, Depends(get_current_user)]
CurrentStudent = Annotated[Student, Depends(get_current_student)]

def require_roles(*roles: str):
    def checker(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="You do not have permission to perform this action")
        return user
    return checker

def require_class_teacher_or_admin(db, user, class_id: int):
    """Attendance is taken ONCE a day, by the class teacher. Raises 403 for any other teacher."""
    from app import services
    if not services.can_take_class_attendance(db, user, class_id):
        raise HTTPException(status_code=403, detail="Only this class's class teacher (or the admin) can take its attendance")
