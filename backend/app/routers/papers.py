"""Question papers: teacher uploads the PDF -> Gemini reads the questions -> teacher reviews marks / word limit / keywords ->
Gemini writes the answer key -> teacher edits and publishes it to students. Also question-wise marks entry (feeds the analysis)."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from decimal import Decimal
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from app import ai, services
from app.database import SessionLocal
from app.deps import DbSession, require_roles
from app.models import (ClassSubject, Exam, ExamMark, ExamPaper, PaperQuestion, QuestionMark, SchoolClass, Student, Subject, TeachingAssignment)

router = APIRouter(prefix="/papers", tags=["Question papers"])
Staff = Depends(require_roles("admin", "teacher"))
MAX_PDF = 15_000_000


# ── access ───────────────────────────────────────────────────────────────────
def can_manage(db, user, class_id: int, subject_id: int) -> bool:
    """Admin: any paper. Teacher: only the class + subject the admin assigned to them."""
    if user.role == "admin":
        return True
    return bool(db.scalar(select(TeachingAssignment.id).where(TeachingAssignment.teacher_id == user.id,
                                                              TeachingAssignment.class_id == class_id, TeachingAssignment.subject_id == subject_id)))

def _paper(db, user, paper_id: int) -> ExamPaper:
    p = db.get(ExamPaper, paper_id)
    if not p:
        raise HTTPException(status_code=404, detail="Question paper not found")
    if not can_manage(db, user, p.class_id, p.subject_id):
        raise HTTPException(status_code=403, detail="This paper belongs to another teacher's class or subject")
    return p

def _question(db, user, qid: int) -> tuple[PaperQuestion, ExamPaper]:
    q = db.get(PaperQuestion, qid)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    return q, _paper(db, user, q.paper_id)

def _q_out(q: PaperQuestion) -> dict:
    return {"id": q.id, "number": q.number, "text": q.text, "marks": q.marks, "word_limit": q.word_limit, "keywords": q.keywords,
            "topic": q.topic, "ai_answer": q.ai_answer, "answer": q.answer, "ai_status": q.ai_status}

def _questions(db, paper_id: int) -> list[PaperQuestion]:
    return list(db.scalars(select(PaperQuestion).where(PaperQuestion.paper_id == paper_id).order_by(PaperQuestion.sort, PaperQuestion.id)).all())

def _paper_out(db, p: ExamPaper, with_questions: bool = False) -> dict:
    qs = _questions(db, p.id)
    exam, k, s = db.get(Exam, p.exam_id), db.get(SchoolClass, p.class_id), db.get(Subject, p.subject_id)
    out = {"id": p.id, "exam_id": p.exam_id, "exam": exam.name if exam else "", "exam_status": exam.status if exam else "", "class_id": p.class_id,
           "class_label": services.class_label(k), "subject_id": p.subject_id, "subject": s.name if s else "", "status": p.status,
           "gen_status": p.gen_status, "gen_error": p.gen_error, "pdf_name": p.pdf_name, "created_at": p.created_at,
           "questions_count": len(qs), "answered": sum(1 for q in qs if (q.answer or q.ai_answer)), "total_marks": sum(q.marks for q in qs)}
    if with_questions:
        out["questions"] = [_q_out(q) for q in qs]
    return out


# ── background jobs (own DB session; the request has already returned) ───────
def _fail(paper_id: int, msg: str):
    db = SessionLocal()
    try:
        p = db.get(ExamPaper, paper_id)
        if p:
            p.gen_status, p.gen_error = "error", msg[:500]
            db.commit()
    finally:
        db.close()

def _job_extract(paper_id: int):
    db = SessionLocal()
    try:
        p = db.get(ExamPaper, paper_id)
        subj, k = db.get(Subject, p.subject_id), db.get(SchoolClass, p.class_id)
        found = ai.extract_questions(p.pdf, subj.name, services.class_label(k))
        for i, q in enumerate(found, 1):
            db.add(PaperQuestion(paper_id=p.id, sort=i, number=q["number"], text=q["text"], marks=q["marks"], word_limit=ai.default_words(q["marks"]),
                                 keywords=q["keywords"], topic=q["topic"]))
        p.gen_status, p.gen_error = "idle", None
        db.commit()
    except ai.AIError as e:
        db.rollback(); _fail(paper_id, str(e))
    except Exception as e:                                           # never leave the paper stuck on "extracting"
        db.rollback(); _fail(paper_id, f"Unexpected error while reading the PDF: {e}")
    finally:
        db.close()

def _job_generate(paper_id: int, only_missing: bool):
    db = SessionLocal()
    try:
        p = db.get(ExamPaper, paper_id)
        subj, k = db.get(Subject, p.subject_id).name, services.class_label(db.get(SchoolClass, p.class_id))
        todo = [q for q in _questions(db, paper_id) if not (only_missing and q.ai_answer and q.ai_status == "done")]
        jobs = {q.id: (q.text, q.marks, q.word_limit or ai.default_words(q.marks), q.keywords) for q in todo}
        failed, last_err = 0, ""
        with ThreadPoolExecutor(max_workers=3) as pool:             # 3 questions at a time; only this thread writes to the database
            futs = {pool.submit(ai.generate_answer, t, m, w, kw, subj, k): qid for qid, (t, m, w, kw) in jobs.items()}
            for f in as_completed(futs):
                q = db.get(PaperQuestion, futs[f])
                try:
                    q.ai_answer, q.ai_status = f.result(), "done"
                except Exception as e:
                    q.ai_status, failed, last_err = "error", failed + 1, str(e)
                db.commit()
        p = db.get(ExamPaper, paper_id)
        p.gen_status = "done"
        p.gen_error = f"{failed} question(s) failed: {last_err}. Press “Generate answers” again to retry them." if failed else None
        db.commit()
    except Exception as e:
        db.rollback(); _fail(paper_id, f"Unexpected error: {e}")
    finally:
        db.close()


# ── list / options ───────────────────────────────────────────────────────────
@router.get("/options")
def options(db: DbSession, user=Staff):
    """Class+subject choices (teacher: own assignments, admin: every class subject) and the exams of this year."""
    year = services.current_year(db)
    if user.role == "admin":
        rows = db.execute(select(ClassSubject, SchoolClass, Subject).join(SchoolClass, SchoolClass.id == ClassSubject.class_id)
                          .join(Subject, Subject.id == ClassSubject.subject_id).where(SchoolClass.academic_year == year)
                          .order_by(SchoolClass.grade, SchoolClass.section, Subject.name)).all()
        pairs = [(k, s) for _, k, s in rows]
    else:
        rows = db.execute(select(TeachingAssignment, SchoolClass, Subject).join(SchoolClass, SchoolClass.id == TeachingAssignment.class_id)
                          .join(Subject, Subject.id == TeachingAssignment.subject_id)
                          .where(TeachingAssignment.teacher_id == user.id, SchoolClass.academic_year == year)
                          .order_by(SchoolClass.grade, SchoolClass.section, Subject.name)).all()
        pairs = [(k, s) for _, k, s in rows]
    exams = db.scalars(select(Exam).where(Exam.academic_year == year).order_by(Exam.start_date.desc(), Exam.id.desc())).all()
    return {"choices": [{"class_id": k.id, "class_label": services.class_label(k), "subject_id": s.id, "subject": s.name} for k, s in pairs],
            "exams": [{"id": e.id, "name": e.name, "class_id": e.class_id, "status": e.status} for e in exams]}

@router.get("")
def list_papers(db: DbSession, user=Staff, exam_id: int | None = None):
    stmt = select(ExamPaper).order_by(ExamPaper.created_at.desc())
    if exam_id:
        stmt = stmt.where(ExamPaper.exam_id == exam_id)
    return [_paper_out(db, p) for p in db.scalars(stmt.limit(300)).all() if can_manage(db, user, p.class_id, p.subject_id)]

@router.get("/{paper_id}")
def get_paper(paper_id: int, db: DbSession, user=Staff):
    return _paper_out(db, _paper(db, user, paper_id), with_questions=True)

@router.get("/{paper_id}/pdf")
def download_pdf(paper_id: int, db: DbSession, user=Staff):
    p = _paper(db, user, paper_id)
    return Response(content=p.pdf, media_type="application/pdf", headers={"Content-Disposition": f'inline; filename="{p.pdf_name or "paper.pdf"}"'})


# ── upload + AI ──────────────────────────────────────────────────────────────
@router.post("", status_code=201)
async def upload_paper(bg: BackgroundTasks, db: DbSession, user=Staff, exam_id: int = Form(...), class_id: int = Form(...),
                       subject_id: int = Form(...), file: UploadFile = File(...)):
    if not can_manage(db, user, class_id, subject_id):
        raise HTTPException(status_code=403, detail="You can only upload papers for the class and subject assigned to you")
    exam = db.get(Exam, exam_id)
    if not exam or (exam.class_id and exam.class_id != class_id):
        raise HTTPException(status_code=422, detail="This exam is not for the selected class")
    if db.scalar(select(ExamPaper.id).where(ExamPaper.exam_id == exam_id, ExamPaper.class_id == class_id, ExamPaper.subject_id == subject_id)):
        raise HTTPException(status_code=409, detail="A paper is already uploaded for this exam, class and subject. Open it, or delete it first.")
    raw = await file.read(MAX_PDF + 1)
    if len(raw) > MAX_PDF:
        raise HTTPException(status_code=413, detail="The PDF is larger than 15 MB. Please compress it and try again.")
    if not raw.startswith(b"%PDF"):
        raise HTTPException(status_code=422, detail="Please upload a PDF file")
    if not ai.settings.gemini_api_key:
        raise HTTPException(status_code=503, detail="Gemini is not set up yet. Put GEMINI_API_KEY in backend/.env and restart the server.")
    p = ExamPaper(exam_id=exam_id, class_id=class_id, subject_id=subject_id, teacher_id=user.id, pdf=raw, pdf_name=(file.filename or "paper.pdf")[:200],
                  gen_status="extracting")
    db.add(p)
    db.commit()
    bg.add_task(_job_extract, p.id)
    return _paper_out(db, p)

@router.post("/{paper_id}/generate")
def generate(paper_id: int, bg: BackgroundTasks, db: DbSession, user=Staff, only_missing: bool = True):
    p = _paper(db, user, paper_id)
    if p.gen_status in ("extracting", "generating"):
        raise HTTPException(status_code=409, detail="The AI is still working on this paper")
    if not _questions(db, p.id):
        raise HTTPException(status_code=422, detail="This paper has no questions yet")
    if p.status == "published" and not only_missing:
        raise HTTPException(status_code=409, detail="Unpublish the answer key before regenerating everything")
    p.gen_status, p.gen_error = "generating", None
    db.commit()
    bg.add_task(_job_generate, p.id, only_missing)
    return _paper_out(db, p)

@router.post("/questions/{qid}/regenerate")
def regenerate_one(qid: int, db: DbSession, user=Staff):
    q, p = _question(db, user, qid)
    subj, k = db.get(Subject, p.subject_id).name, services.class_label(db.get(SchoolClass, p.class_id))
    try:
        q.ai_answer = ai.generate_answer(q.text, q.marks, q.word_limit or ai.default_words(q.marks), q.keywords, subj, k)
    except ai.AIError as e:
        raise HTTPException(status_code=503, detail=str(e))
    q.ai_status, q.answer = "done", None                       # a fresh AI answer replaces any older hand edit
    db.commit()
    return _q_out(q)

@router.post("/{paper_id}/publish")
def publish(paper_id: int, db: DbSession, user=Staff):
    p = _paper(db, user, paper_id)
    qs = _questions(db, p.id)
    if not qs or any(not (q.answer or q.ai_answer) for q in qs):
        raise HTTPException(status_code=422, detail="Every question needs an answer before the key can be published")
    p.status = "published"
    db.commit()
    return _paper_out(db, p)

@router.post("/{paper_id}/unpublish")
def unpublish(paper_id: int, db: DbSession, user=Staff):
    p = _paper(db, user, paper_id)
    p.status = "draft"
    db.commit()
    return _paper_out(db, p)

@router.delete("/{paper_id}", status_code=204)
def delete_paper(paper_id: int, db: DbSession, user=Staff):
    p = _paper(db, user, paper_id)
    if p.gen_status in ("extracting", "generating"):
        raise HTTPException(status_code=409, detail="The AI is still working on this paper. Try again in a minute.")
    qids = [q.id for q in _questions(db, p.id)]
    if qids:
        db.execute(delete(QuestionMark).where(QuestionMark.question_id.in_(qids)))
        db.execute(delete(PaperQuestion).where(PaperQuestion.paper_id == p.id))
    db.delete(p)
    db.commit()


# ── edit questions ───────────────────────────────────────────────────────────
class QuestionEdit(BaseModel):
    number: str | None = Field(default=None, max_length=12)
    text: str | None = Field(default=None, min_length=1)
    marks: float | None = Field(default=None, gt=0, le=100)
    word_limit: int | None = Field(default=None, ge=1, le=2000)
    keywords: str | None = None
    topic: str | None = Field(default=None, max_length=120)
    answer: str | None = None

@router.patch("/questions/{qid}")
def edit_question(qid: int, data: QuestionEdit, db: DbSession, user=Staff):
    q, p = _question(db, user, qid)
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(q, k, v)
    if "answer" in data.model_fields_set and not (data.answer or "").strip():
        q.answer = None                                          # empty = go back to the AI answer
    db.commit()
    return _q_out(q)

@router.post("/{paper_id}/questions", status_code=201)
def add_question(paper_id: int, data: QuestionEdit, db: DbSession, user=Staff):
    p = _paper(db, user, paper_id)
    n = db.scalar(select(func.max(PaperQuestion.sort)).where(PaperQuestion.paper_id == p.id)) or 0
    marks = data.marks or 1
    q = PaperQuestion(paper_id=p.id, sort=n + 1, number=data.number or str(n + 1), text=(data.text or "New question").strip(), marks=marks,
                      word_limit=data.word_limit or ai.default_words(marks), keywords=data.keywords or "", topic=data.topic or "")
    db.add(q)
    db.commit()
    return _q_out(q)

@router.delete("/questions/{qid}", status_code=204)
def delete_question(qid: int, db: DbSession, user=Staff):
    q, p = _question(db, user, qid)
    db.execute(delete(QuestionMark).where(QuestionMark.question_id == qid))
    db.delete(q)
    db.commit()


# ── question-wise marks (feeds the analysis) ─────────────────────────────────
@router.get("/{paper_id}/marks")
def marks_grid(paper_id: int, db: DbSession, user=Staff):
    p = _paper(db, user, paper_id)
    exam = db.get(Exam, p.exam_id)
    qs = _questions(db, p.id)
    studs = db.scalars(select(Student).where(Student.class_id == p.class_id, Student.is_active.is_(True)).order_by(Student.roll_no, Student.first_name)).all()
    have: dict[int, dict[int, float]] = {}
    if qs:
        for m in db.scalars(select(QuestionMark).where(QuestionMark.question_id.in_([q.id for q in qs]))).all():
            have.setdefault(m.student_id, {})[m.question_id] = m.marks
    return {"locked": exam.status == "published" and user.role != "admin", "exam": exam.name, "exam_status": exam.status,
            "questions": [{"id": q.id, "number": q.number, "marks": q.marks, "topic": q.topic} for q in qs],
            "students": [{"student_id": s.id, "name": f"{s.first_name} {s.last_name}".strip(), "admission_no": s.admission_no, "roll_no": s.roll_no,
                          "marks": have.get(s.id, {})} for s in studs]}

class MarkCell(BaseModel):
    student_id: int
    question_id: int
    marks: float | None = None          # None = clear the cell

class MarksIn(BaseModel):
    records: list[MarkCell]

@router.put("/{paper_id}/marks")
def save_marks(paper_id: int, data: MarksIn, db: DbSession, user=Staff):
    p = _paper(db, user, paper_id)
    exam = db.get(Exam, p.exam_id)
    if exam.status == "published" and user.role != "admin":
        raise HTTPException(status_code=403, detail="This exam's results are published and locked. Ask the admin for corrections.")
    qs = {q.id: q for q in _questions(db, p.id)}
    ids = set(db.scalars(select(Student.id).where(Student.class_id == p.class_id, Student.is_active.is_(True))).all())
    touched: set[int] = set()
    for r in data.records:
        q = qs.get(r.question_id)
        if not q or r.student_id not in ids:
            raise HTTPException(status_code=422, detail="A mark refers to a question or student that is not part of this paper")
        if r.marks is not None and not (0 <= r.marks <= q.marks):
            raise HTTPException(status_code=422, detail=f"Question {q.number}: marks must be between 0 and {q.marks:g}")
        row = db.scalar(select(QuestionMark).where(QuestionMark.question_id == q.id, QuestionMark.student_id == r.student_id))
        if r.marks is None:
            if row:
                db.delete(row)
        elif row:
            row.marks = r.marks
        else:
            db.add(QuestionMark(question_id=q.id, student_id=r.student_id, marks=r.marks))
        touched.add(r.student_id)
    db.flush()
    # keep the normal exam marks sheet in step: subject total = sum of the question marks
    subj = db.get(Subject, p.subject_id)
    max_total = Decimal(str(round(sum(q.marks for q in qs.values()), 2)))
    for sid in touched:
        total = db.scalar(select(func.sum(QuestionMark.marks)).where(QuestionMark.student_id == sid, QuestionMark.question_id.in_(list(qs)))) or 0
        has = db.scalar(select(func.count()).select_from(QuestionMark).where(QuestionMark.student_id == sid, QuestionMark.question_id.in_(list(qs)))) or 0
        em = db.scalar(select(ExamMark).where(ExamMark.exam_id == p.exam_id, ExamMark.student_id == sid, ExamMark.subject == subj.name))
        if not has:
            continue
        if em:
            em.max_marks, em.marks_obtained, em.entered_by, em.subject_id = max_total, Decimal(str(round(total, 2))), user.id, subj.id
        else:
            db.add(ExamMark(exam_id=p.exam_id, student_id=sid, subject=subj.name, subject_id=subj.id, max_marks=max_total,
                            marks_obtained=Decimal(str(round(total, 2))), entered_by=user.id))
    db.commit()
    return {"saved": len(data.records), "students": len(touched)}
