from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.deps import CurrentUser, DbSession, require_roles
from app.models import SchoolClass, User
from app.schemas import ClassCreate, ClassOut, ClassUpdate, StandardClassesIn
from app import services

router = APIRouter(prefix="/classes", tags=["Classes"])

def _out(k: SchoolClass, names: dict[int, str]) -> ClassOut:
    return ClassOut.model_validate(k, from_attributes=True).model_copy(update={"class_teacher_name": names.get(k.class_teacher_id)})

@router.get("", response_model=list[ClassOut])
def list_classes(db: DbSession, user: CurrentUser, academic_year: str | None = None):
    stmt = select(SchoolClass).order_by(SchoolClass.academic_year.desc(), SchoolClass.grade, SchoolClass.section)
    if academic_year:
        stmt = stmt.where(SchoolClass.academic_year == academic_year)
    names = {u.id: u.full_name for u in db.scalars(select(User)).all()}
    rows = sorted(db.scalars(stmt).all(), key=lambda k: (-int(k.academic_year[:4] or 0) if k.academic_year[:4].isdigit() else 0,
                                                          services.grade_rank(k.grade), k.section))
    return [_out(k, names) for k in rows]

@router.post("/standard")
def add_standard_classes(data: StandardClassesIn, db: DbSession, user=Depends(require_roles("admin"))):
    """One click: Nursery, LKG, UKG and Class 1-12 for a year, in the given sections (existing ones are skipped)."""
    year = data.academic_year or services.current_year(db)
    sections = [x.strip().upper() for x in data.sections if x.strip()] or ["A"]
    made = services.ensure_standard_classes(db, year, sections)
    return {"created": made, "academic_year": year}

@router.post("", response_model=ClassOut, status_code=201)
def create_class(data: ClassCreate, db: DbSession, user=Depends(require_roles("admin"))):
    row = SchoolClass(**data.model_dump())
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="That class, section and academic year already exist")
    return _out(row, {})

@router.patch("/{class_id}", response_model=ClassOut)
def set_class_teacher(class_id: int, data: ClassUpdate, db: DbSession, user=Depends(require_roles("admin"))):
    """Admin picks the CLASS TEACHER of a class. That teacher alone sees the class list and takes its daily attendance."""
    k = db.get(SchoolClass, class_id)
    if not k:
        raise HTTPException(status_code=404, detail="Class not found")
    teacher = None
    if data.class_teacher_id is not None:
        teacher = db.get(User, data.class_teacher_id)
        if not teacher or teacher.role != "teacher" or not teacher.is_active:
            raise HTTPException(status_code=422, detail="Choose an active faculty member (role: teacher)")
        other = db.scalar(select(SchoolClass).where(SchoolClass.class_teacher_id == teacher.id,
                                                     SchoolClass.academic_year == k.academic_year, SchoolClass.id != k.id))
        if other:
            raise HTTPException(status_code=409, detail=f"{teacher.full_name} is already class teacher of {other.grade}-{other.section}")
    k.class_teacher_id = data.class_teacher_id
    db.commit()
    db.refresh(k)
    return _out(k, {teacher.id: teacher.full_name} if teacher else {})
