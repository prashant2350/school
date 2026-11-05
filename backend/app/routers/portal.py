"""Everything a logged-in STUDENT may see. Always scoped to the student in the token - never takes a student id."""
from io import BytesIO
from fastapi import APIRouter, File, HTTPException, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from app.config import settings
from app.deps import CurrentStudent, DbSession
from app.models import Attendance, Notice, SchoolClass, Enrollment, Student, User
from app.routers.teaching import DAYS, assignment_rows, timetable_for_class
from app.pdfs import report_card_pdf
from app.schemas import ChangePasswordIn, ProfileIn
from app.security import hash_password, verify_password
from app import services
from app.routers import transport as tr
from app.schemas import TransportPrefIn
from app import analytics
from app.routers import insights as ins
from app.models import ExamPaper, PaperQuestion, Exam as _Exam, Subject as _Subject

router = APIRouter(prefix="/portal", tags=["Student portal"])

THEMES = {"purple", "blue", "green", "rose", "amber", "teal"}

def class_teacher_name(db, k):
    t = db.get(User, k.class_teacher_id) if k and k.class_teacher_id else None
    return t.full_name if t else None

@router.get("/me")
def me(student: CurrentStudent, db: DbSession):
    k = db.get(SchoolClass, student.class_id) if student.class_id else None
    history = db.execute(select(Enrollment, SchoolClass).outerjoin(SchoolClass, SchoolClass.id == Enrollment.class_id)
                         .where(Enrollment.student_id == student.id).order_by(Enrollment.academic_year.desc())).all()
    return {
        "id": student.id, "admission_no": student.admission_no,
        "name": f"{student.first_name} {student.last_name}".strip(), "class": services.class_label(k),
        "roll_no": student.roll_no, "dob": student.dob, "gender": student.gender, "parent_name": student.parent_name,
        "mother_name": student.mother_name, "parent_contact": student.parent_contact, "address": student.address,
        "blood_group": student.blood_group, "must_change_password": student.must_change_password,
        "email": student.email, "phone": student.phone, "bio": student.bio, "theme": student.theme or "purple",
        "has_photo": bool(student.photo_type), "class_teacher": class_teacher_name(db, k),
        "history": [{"academic_year": e.academic_year, "class": services.class_label(c), "result": e.result} for e, c in history],
        "attendance": services.attendance_summary(db, student.id),
        "balance": services.fee_ledger(db, student.id)["balance"],
        "transport": tr.transport_summary(db, student),
    }

@router.get("/attendance")
def my_attendance(student: CurrentStudent, db: DbSession):
    rows = db.scalars(select(Attendance).where(Attendance.student_id == student.id)
                      .order_by(Attendance.attendance_date.desc()).limit(180)).all()
    return {"summary": services.attendance_summary(db, student.id),
            "records": [{"date": r.attendance_date, "status": r.status, "remarks": r.remarks} for r in rows]}

@router.get("/fees")
def my_fees(student: CurrentStudent, db: DbSession):
    return services.fee_ledger(db, student.id)

@router.get("/results")
def my_results(student: CurrentStudent, db: DbSession):
    return services.results_for_student(db, student.id)

@router.get("/notices")
def my_notices(student: CurrentStudent, db: DbSession):
    rows = db.scalars(select(Notice).where(Notice.published.is_(True), Notice.audience.in_(["all", "students"]))
                      .order_by(Notice.created_at.desc()).limit(50)).all()
    return [{"id": n.id, "title": n.title, "body": n.body, "created_at": n.created_at} for n in rows]

@router.post("/change-password", status_code=204)
def change_password(data: ChangePasswordIn, student: CurrentStudent, db: DbSession):
    if not verify_password(data.current_password, student.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    student.password_hash = hash_password(data.new_password)
    student.must_change_password = False
    db.commit()


@router.get("/teachers")
def my_teachers(student: CurrentStudent, db: DbSession):
    """Who teaches this student which subject, and the class timetable (period numbers)."""
    if not student.class_id:
        return {"class_teacher": None, "subjects": [], "periods": settings.periods_per_day, "days": DAYS, "slots": []}
    k = db.get(SchoolClass, student.class_id)
    slots = timetable_for_class(db, student.class_id)
    subjects = []
    for a in assignment_rows(db, class_id=student.class_id):
        mine = [f"{DAYS[x['weekday']]} P{x['period_no']}" for x in slots if x["assignment_id"] == a["id"]]
        t = db.get(User, a["teacher_id"])
        subjects.append({"subject": a["subject"], "teacher": a["teacher"], "teacher_phone": t.phone_number if t else None, "periods": mine})
    return {"class_teacher": class_teacher_name(db, k), "class": services.class_label(k), "subjects": subjects,
            "periods": settings.periods_per_day, "days": DAYS, "slots": slots,
            "attendance": services.attendance_summary(db, student.id)}

@router.patch("/profile")
def update_profile(data: ProfileIn, student: CurrentStudent, db: DbSession):
    """The student can edit only these fields. Name, class, date of birth etc. stay with the school office."""
    changes = data.model_dump(exclude_unset=True)
    if "theme" in changes and changes["theme"] not in THEMES:
        raise HTTPException(status_code=422, detail=f"theme must be one of {sorted(THEMES)}")
    for k, v in changes.items():
        setattr(student, k, (v.strip() or None) if isinstance(v, str) and k != "theme" else v)
    db.commit()
    return {"ok": True}

@router.post("/photo", status_code=204)
async def upload_photo(student: CurrentStudent, db: DbSession, file: UploadFile = File(...)):
    raw = await file.read(8_000_001)
    if len(raw) > 8_000_000:
        raise HTTPException(status_code=413, detail="Photo is too large (max 8 MB)")
    try:
        from PIL import Image, ImageOps
        img = ImageOps.exif_transpose(Image.open(BytesIO(raw))).convert("RGB")
        img.thumbnail((360, 360))
        out = BytesIO()
        img.save(out, "JPEG", quality=85)
    except Exception:
        raise HTTPException(status_code=422, detail="That file is not a valid photo (use JPG or PNG)")
    student.photo, student.photo_type = out.getvalue(), "image/jpeg"
    db.commit()

class PhotoJson(BaseModel):
    image: str                      # the picture as base64 text


@router.post("/photo-json", status_code=204)
def upload_photo_json(data: PhotoJson, student: CurrentStudent, db: DbSession):
    """Same as /photo, but the picture arrives as base64 inside JSON. More reliable from the mobile app."""
    import base64
    try:
        raw = base64.b64decode(data.image.split(",")[-1])
    except Exception:
        raise HTTPException(status_code=422, detail="That is not a valid photo")
    if len(raw) > 8_000_000:
        raise HTTPException(status_code=413, detail="Photo is too large (max 8 MB)")
    try:
        from PIL import Image, ImageOps
        img = ImageOps.exif_transpose(Image.open(BytesIO(raw))).convert("RGB")
        img.thumbnail((360, 360))
        out = BytesIO()
        img.save(out, "JPEG", quality=85)
    except Exception:
        raise HTTPException(status_code=422, detail="That file is not a valid photo (use JPG or PNG)")
    student.photo, student.photo_type = out.getvalue(), "image/jpeg"
    db.commit()


@router.delete("/photo", status_code=204)
def remove_photo(student: CurrentStudent, db: DbSession):
    student.photo, student.photo_type = None, None
    db.commit()

@router.get("/photo")
def get_photo(student: CurrentStudent):
    if not student.photo_type:
        raise HTTPException(status_code=404, detail="No photo")
    return Response(content=student.photo, media_type=student.photo_type, headers={"Cache-Control": "private, max-age=300"})

@router.get("/results/{exam_id}/pdf")
def result_pdf(exam_id: int, student: CurrentStudent, db: DbSession):
    res = services.results_for_student(db, student.id, exam_id=exam_id)
    if not res:
        raise HTTPException(status_code=404, detail="Result not published yet")
    k = db.get(SchoolClass, student.class_id) if student.class_id else None
    info = {"name": f"{student.first_name} {student.last_name}".strip(), "admission_no": student.admission_no,
            "class": services.class_label(k), "roll_no": student.roll_no, "parent_name": student.parent_name,
            "dob": student.dob.strftime("%d %b %Y") if student.dob else None}
    school = services.get_settings(db)
    pdf = report_card_pdf(school, info, res[0], services.attendance_summary(db, student.id)["percentage"], student.photo,
                          logo=services.get_logo(db), template=school.get("result_template") or "classic")
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="report-card-{student.admission_no}-{exam_id}.pdf"'})


# ── school bus ───────────────────────────────────────────────────────────────
@router.get("/transport")
def my_transport(student: CurrentStudent, db: DbSession):
    """The student's bus for this academic year: bus, driver, stop and estimated times. needs_preference = not chosen yet."""
    return tr.transport_detail(db, student)

@router.put("/transport/preference")
def set_transport_preference(data: TransportPrefIn, student: CurrentStudent, db: DbSession):
    """The student picks a stop (the stop decides the bus) or types a pickup location (the office allots it)."""
    year = services.current_year(db)
    existing = db.scalar(select(tr.StudentTransport).where(tr.StudentTransport.student_id == student.id, tr.StudentTransport.academic_year == year))
    if existing and existing.locked:
        raise HTTPException(status_code=409, detail="The school office has set your bus. Please contact the office to change it.")
    if data.uses_bus and not (data.stop_id or (data.pickup_location or "").strip()):
        raise HTTPException(status_code=422, detail="Choose your pickup stop, or type your pickup location")
    tr.apply_assignment(db, student, year, uses_bus=data.uses_bus, pickup_location=data.pickup_location, stop_id=data.stop_id,
                        bus_id=None, note=data.note, locked=False, strict=False)
    db.commit()
    return tr.transport_detail(db, student)

@router.get("/transport/driver-photo")
def my_driver_photo(student: CurrentStudent, db: DbSession):
    row = db.scalar(select(tr.StudentTransport).where(tr.StudentTransport.student_id == student.id,
                                                       tr.StudentTransport.academic_year == services.current_year(db)))
    bus = db.get(tr.Bus, row.bus_id) if row and row.bus_id else None
    d = db.get(tr.Driver, bus.driver_id) if bus and bus.driver_id else None
    if not d or not d.photo_type:
        raise HTTPException(status_code=404, detail="No photo")
    return Response(content=d.photo, media_type=d.photo_type, headers={"Cache-Control": "private, max-age=300"})


# ── answer keys + progress analysis ──────────────────────────────────────────
@router.get("/answer-keys")
def answer_keys(student: CurrentStudent, db: DbSession):
    """Published answer keys for the student's class, newest exam first."""
    if not student.class_id:
        return []
    rows = db.execute(select(ExamPaper, _Exam, _Subject).join(_Exam, _Exam.id == ExamPaper.exam_id).join(_Subject, _Subject.id == ExamPaper.subject_id)
                      .where(ExamPaper.class_id == student.class_id, ExamPaper.status == "published")
                      .order_by(_Exam.start_date.desc(), _Exam.id.desc(), _Subject.name)).all()
    return [{"paper_id": p.id, "exam_id": e.id, "exam": e.name, "subject": s.name} for p, e, s in rows]

@router.get("/answer-keys/{paper_id}")
def answer_key(paper_id: int, student: CurrentStudent, db: DbSession):
    p = db.get(ExamPaper, paper_id)
    if not p or p.status != "published" or p.class_id != student.class_id:
        raise HTTPException(status_code=404, detail="This answer key is not available")
    e, s = db.get(_Exam, p.exam_id), db.get(_Subject, p.subject_id)
    qs = db.scalars(select(PaperQuestion).where(PaperQuestion.paper_id == p.id).order_by(PaperQuestion.sort, PaperQuestion.id)).all()
    return {"exam": e.name, "subject": s.name, "total_marks": sum(q.marks for q in qs),
            "questions": [{"id": q.id, "number": q.number, "text": q.text, "marks": q.marks, "topic": q.topic, "word_limit": q.word_limit,
                           "keywords": [k.strip() for k in q.keywords.split(",") if k.strip()], "answer": q.answer or q.ai_answer} for q in qs]}

@router.get("/analysis")
def my_analysis(student: CurrentStudent, db: DbSession):
    """Topic-wise strengths and weak areas from every published exam. 'summary' is the AI's friendly version (null until generated)."""
    a = analytics.student_analysis(db, student)
    summary, stale = ins.student_summary(db, student, a)
    return {**a, "summary": summary, "summary_stale": stale}

@router.post("/analysis/summary")
def make_my_summary(student: CurrentStudent, db: DbSession):
    """Ask Gemini for the summary. It is only regenerated when new marks have arrived, so pressing it again is free."""
    a = analytics.student_analysis(db, student)
    summary, stale = ins.student_summary(db, student, a, refresh=True)
    return {"summary": summary, "summary_stale": stale}