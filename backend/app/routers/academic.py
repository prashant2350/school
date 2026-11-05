"""Academic years, classes-per-year, school settings, public school info, and the year-end promotion wizard."""
from io import BytesIO
import base64
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy import func, select
from app.deps import CurrentUser, DbSession, require_roles
from app.models import AcademicYear, ClassSubject, Enrollment, Setting, SchoolClass, Student, TeachingAssignment
from app.schemas import PromotionRun, SettingsIn, YearCreate, YearOut
from app import services
from app.pdfs import TEMPLATES, sample_pdf

router = APIRouter(tags=["Academic year"])

# ---------- public + settings ----------
@router.get("/public/info")
def public_info(db: DbSession):
    s = services.get_settings(db)
    return {"school_name": s["school_name"], "school_address": s["school_address"],
            "school_phone": s.get("school_phone", ""), "school_email": s.get("school_email", "")}

@router.get("/meta")
def meta(db: DbSession, user: CurrentUser):
    return {"grades": services.GRADES, "current_year": services.current_year(db), "settings": services.get_settings(db)}

@router.get("/settings")
def read_settings(db: DbSession, user: CurrentUser):
    return services.get_settings(db)

@router.put("/settings")
def write_settings(data: SettingsIn, db: DbSession, user=Depends(require_roles("admin"))):
    if data.result_template is not None and data.result_template not in TEMPLATES:
        raise HTTPException(status_code=422, detail=f"result_template must be one of {sorted(TEMPLATES)}")
    for key, value in data.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        row = db.get(Setting, key)
        if row:
            row.value = value
        else:
            db.add(Setting(key=key, value=value))
    db.commit()
    return services.get_settings(db)

# ---------- school logo + result PDF design ----------
@router.get("/public/logo", include_in_schema=False)
def public_logo(db: DbSession):
    logo = services.get_logo(db)
    if not logo:
        raise HTTPException(status_code=404, detail="No logo")
    return Response(content=logo, media_type="image/png", headers={"Cache-Control": "public, max-age=300"})

@router.post("/settings/logo", status_code=204)
async def upload_logo(db: DbSession, user=Depends(require_roles("admin")), file: UploadFile = File(...)):
    raw = await file.read(3_000_001)
    if len(raw) > 3_000_000:
        raise HTTPException(status_code=413, detail="Logo is too large (max 3 MB)")
    try:
        from PIL import Image
        img = Image.open(BytesIO(raw)).convert("RGBA")
        img.thumbnail((600, 600))
        out = BytesIO()
        img.save(out, "PNG")
    except Exception:
        raise HTTPException(status_code=422, detail="That file is not a valid image (use PNG or JPG)")
    value = base64.b64encode(out.getvalue()).decode()
    row = db.get(Setting, "school_logo")
    if row:
        row.value = value
    else:
        db.add(Setting(key="school_logo", value=value))
    db.commit()

@router.delete("/settings/logo", status_code=204)
def delete_logo(db: DbSession, user=Depends(require_roles("admin"))):
    row = db.get(Setting, "school_logo")
    if row:
        db.delete(row)
        db.commit()

@router.get("/settings/result-preview")
def result_preview(db: DbSession, template: str = "classic", user=Depends(require_roles("admin"))):
    """A sample report card in the chosen design, using your real school details and logo."""
    if template not in TEMPLATES:
        raise HTTPException(status_code=422, detail=f"template must be one of {sorted(TEMPLATES)}")
    return Response(content=sample_pdf(services.get_settings(db), template, services.get_logo(db)), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="sample-{template}.pdf"'})

@router.get("/settings/result-templates")
def result_templates(user: CurrentUser):
    return [{"id": k, "name": v} for k, v in TEMPLATES.items()]

# ---------- academic years ----------
@router.get("/academic-years", response_model=list[YearOut])
def list_years(db: DbSession, user: CurrentUser):
    return list(db.scalars(select(AcademicYear).order_by(AcademicYear.name.desc())).all())

@router.post("/academic-years", response_model=YearOut, status_code=201)
def create_year(data: YearCreate, db: DbSession, user=Depends(require_roles("admin"))):
    if db.scalar(select(AcademicYear.id).where(AcademicYear.name == data.name)):
        raise HTTPException(status_code=409, detail="That academic year already exists")
    if data.make_current:
        for y in db.scalars(select(AcademicYear)).all():
            y.is_current = False
    year = AcademicYear(name=data.name, is_current=data.make_current)
    db.add(year)
    if data.copy_classes_from:
        _copy_classes(db, data.copy_classes_from, data.name)
    db.commit()
    db.refresh(year)
    return year

@router.post("/academic-years/{year_id}/set-current", response_model=YearOut)
def set_current_year(year_id: int, db: DbSession, user=Depends(require_roles("admin"))):
    year = db.get(AcademicYear, year_id)
    if not year:
        raise HTTPException(status_code=404, detail="Academic year not found")
    for y in db.scalars(select(AcademicYear)).all():
        y.is_current = y.id == year_id
    db.commit()
    db.refresh(year)
    return year

def _copy_classes(db, from_year: str, to_year: str) -> int:
    n = 0
    for k in db.scalars(select(SchoolClass).where(SchoolClass.academic_year == from_year)).all():
        if not db.scalar(select(SchoolClass.id).where(SchoolClass.grade == k.grade, SchoolClass.section == k.section,
                                                       SchoolClass.academic_year == to_year)):
            db.add(SchoolClass(grade=k.grade, section=k.section, academic_year=to_year, class_teacher_id=k.class_teacher_id))
            n += 1
    db.flush()
    # carry over each class's subject list and its teachers, so the admin does not set them up again every year
    for old in db.scalars(select(SchoolClass).where(SchoolClass.academic_year == from_year)).all():
        new = db.scalar(select(SchoolClass).where(SchoolClass.grade == old.grade, SchoolClass.section == old.section,
                                                   SchoolClass.academic_year == to_year))
        if not new or db.scalar(select(ClassSubject.id).where(ClassSubject.class_id == new.id)):
            continue
        for cs in db.scalars(select(ClassSubject).where(ClassSubject.class_id == old.id)).all():
            db.add(ClassSubject(class_id=new.id, subject_id=cs.subject_id))
        for a in db.scalars(select(TeachingAssignment).where(TeachingAssignment.class_id == old.id)).all():
            db.add(TeachingAssignment(class_id=new.id, subject_id=a.subject_id, teacher_id=a.teacher_id))
    return n

@router.post("/academic-years/copy-classes")
def copy_classes(from_year: str, to_year: str, db: DbSession, user=Depends(require_roles("admin"))):
    n = _copy_classes(db, from_year, to_year)
    db.commit()
    return {"created": n}

# ---------- year-end promotion ----------
def _target_class(db, to_year: str, grade: str, section: str):
    ks = db.scalars(select(SchoolClass).where(SchoolClass.academic_year == to_year, SchoolClass.grade == grade)
                    .order_by(SchoolClass.section)).all()
    for k in ks:
        if k.section == section:
            return k
    return ks[0] if ks else None

@router.get("/promotion/preview")
def promotion_preview(from_year: str, to_year: str, db: DbSession, user=Depends(require_roles("admin", "clerk"))):
    """Lists every student studying in `from_year` with a suggested action for `to_year`."""
    services.ensure_enrollments(db)
    rows = db.execute(
        select(Student, Enrollment, SchoolClass)
        .join(Enrollment, Enrollment.student_id == Student.id)
        .outerjoin(SchoolClass, SchoolClass.id == Enrollment.class_id)
        .where(Enrollment.academic_year == from_year, Student.is_active.is_(True))
        .order_by(SchoolClass.grade, SchoolClass.section, Student.first_name)).all()
    done = set(db.scalars(select(Enrollment.student_id).where(Enrollment.academic_year == to_year)).all())
    balances = services.fee_balances(db, [s.id for s, _, _ in rows])
    items, missing = [], set()
    for s, e, k in rows:
        action, target = "promote", None
        if k is None:
            action = "promote"
        else:
            ng = services.next_grade(k.grade)
            if ng is None and k.grade == services.GRADES[-1]:
                action = "passed_out"
            elif ng:
                t = _target_class(db, to_year, ng, k.section)
                target = t.id if t else None
                if not t:
                    missing.add(ng)
        items.append({"student_id": s.id, "admission_no": s.admission_no, "name": f"{s.first_name} {s.last_name}".strip(),
                      "class_id": k.id if k else None, "class_label": services.class_label(k), "roll_no": e.roll_no,
                      "balance": str(balances.get(s.id, 0)), "already_in_to_year": s.id in done,
                      "suggested_action": action, "suggested_class_id": target})
    classes = db.scalars(select(SchoolClass).where(SchoolClass.academic_year == to_year)
                         .order_by(SchoolClass.grade, SchoolClass.section)).all()
    return {"items": items, "to_year_classes": [{"id": c.id, "label": services.class_label(c)} for c in classes],
            "missing_grades": sorted(missing)}

@router.post("/promotion/run")
def promotion_run(data: PromotionRun, db: DbSession, user=Depends(require_roles("admin"))):
    if data.from_year == data.to_year:
        raise HTTPException(status_code=422, detail="from_year and to_year must be different")
    if not db.scalar(select(AcademicYear.id).where(AcademicYear.name == data.to_year)):
        raise HTTPException(status_code=422, detail="Create the new academic year first")
    summary = {"promoted": 0, "repeated": 0, "passed_out": 0, "left": 0, "skipped": 0, "errors": []}
    for item in data.items:
        student = db.get(Student, item.student_id)
        old = db.scalar(select(Enrollment).where(Enrollment.student_id == item.student_id,
                                                  Enrollment.academic_year == data.from_year))
        if not student or not old:
            summary["errors"].append(f"Student {item.student_id}: no enrollment in {data.from_year}")
            continue
        if db.scalar(select(Enrollment.id).where(Enrollment.student_id == item.student_id, Enrollment.academic_year == data.to_year)):
            summary["skipped"] += 1
            continue
        if item.action in ("promote", "repeat"):
            target = db.get(SchoolClass, item.target_class_id) if item.target_class_id else None
            if item.action == "repeat" and not target and old.class_id:
                oc = db.get(SchoolClass, old.class_id)
                target = _target_class(db, data.to_year, oc.grade, oc.section)
            if not target or target.academic_year != data.to_year:
                summary["errors"].append(f"{student.admission_no}: choose a class in {data.to_year}")
                continue
            old.result = "promoted" if item.action == "promote" else "repeated"
            db.add(Enrollment(student_id=student.id, academic_year=data.to_year, class_id=target.id, result="studying"))
            student.class_id, student.roll_no = target.id, None
            summary["promoted" if item.action == "promote" else "repeated"] += 1
        elif item.action in ("passed_out", "left"):
            old.result = item.action
            student.is_active, student.status = False, item.action
            summary[item.action] += 1
        else:
            summary["errors"].append(f"{student.admission_no}: unknown action {item.action}")
    db.commit()
    return summary
