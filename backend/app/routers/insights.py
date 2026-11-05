"""Performance analysis for staff: one student, or a whole class. Numbers come from analytics.py; AI only writes the summary."""
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from app import ai, analytics, services
from app.deps import DbSession, require_roles
from app.models import SchoolClass, Student, StudentInsight, TeachingAssignment

router = APIRouter(prefix="/insights", tags=["Insights"])
Staff = Depends(require_roles("admin", "teacher"))

def _can_view(db, user, class_id: int) -> bool:
    if user.role == "admin":
        return True
    k = db.get(SchoolClass, class_id)
    return bool(k and (k.class_teacher_id == user.id or db.scalar(
        select(TeachingAssignment.id).where(TeachingAssignment.teacher_id == user.id, TeachingAssignment.class_id == class_id))))

def student_summary(db, student: Student, analysis: dict, refresh: bool = False) -> tuple[dict | None, bool]:
    """(summary, is_stale). Gemini is only called when new marks have arrived since the saved summary."""
    sig = analytics.signature(db, student.id)
    row = db.scalar(select(StudentInsight).where(StudentInsight.student_id == student.id))
    if row and (row.signature == sig or not refresh):
        return json.loads(row.summary), row.signature != sig
    if not refresh or not analysis["has_data"]:
        return None, False
    try:
        data = ai.summarize_student(analytics.ai_payload(analysis))
    except ai.AIError as e:
        raise HTTPException(status_code=503, detail=str(e))
    if row:
        row.signature, row.summary = sig, json.dumps(data)
    else:
        db.add(StudentInsight(student_id=student.id, signature=sig, summary=json.dumps(data)))
    db.commit()
    return data, False

@router.get("/classes")
def classes(db: DbSession, user=Staff):
    year = services.current_year(db)
    stmt = select(SchoolClass).where(SchoolClass.academic_year == year).order_by(SchoolClass.grade, SchoolClass.section)
    if user.role != "admin":
        mine = select(TeachingAssignment.class_id).where(TeachingAssignment.teacher_id == user.id)
        stmt = stmt.where(or_(SchoolClass.class_teacher_id == user.id, SchoolClass.id.in_(mine)))
    return [{"id": k.id, "label": services.class_label(k)} for k in db.scalars(stmt).all()]

@router.get("/class/{class_id}")
def class_view(class_id: int, db: DbSession, user=Staff):
    if not db.get(SchoolClass, class_id):
        raise HTTPException(status_code=404, detail="Class not found")
    if not _can_view(db, user, class_id):
        raise HTTPException(status_code=403, detail="You can only view classes you teach")
    return analytics.class_analysis(db, class_id)

@router.post("/class/{class_id}/summary")
def class_summary(class_id: int, db: DbSession, user=Staff):
    if not db.get(SchoolClass, class_id):
        raise HTTPException(status_code=404, detail="Class not found")
    if not _can_view(db, user, class_id):
        raise HTTPException(status_code=403, detail="You can only view classes you teach")
    a = analytics.class_analysis(db, class_id)
    if not a["with_data"]:
        raise HTTPException(status_code=422, detail="No question-wise marks have been entered for this class yet")
    try:
        return ai.summarize_class({"class": a["class_label"], "average_pct": a["average"], "students_with_data": a["with_data"], "at_risk_students": len(a["at_risk"]),
                                   "subjects": a["subjects"], "weakest_topics": a["topics"][:8], "strongest_topics": a["topics"][-4:]})
    except ai.AIError as e:
        raise HTTPException(status_code=503, detail=str(e))

@router.get("/student/{student_id}")
def student_view(student_id: int, db: DbSession, user=Staff):
    s = db.get(Student, student_id)
    if not s:
        raise HTTPException(status_code=404, detail="Student not found")
    if not s.class_id or not _can_view(db, user, s.class_id):
        raise HTTPException(status_code=403, detail="You can only view students of classes you teach")
    a = analytics.student_analysis(db, s)
    summary, stale = student_summary(db, s, a)
    return {**a, "name": f"{s.first_name} {s.last_name}".strip(), "class_label": services.class_label(db.get(SchoolClass, s.class_id)),
            "summary": summary, "summary_stale": stale}

@router.post("/student/{student_id}/summary")
def student_summary_refresh(student_id: int, db: DbSession, user=Staff):
    s = db.get(Student, student_id)
    if not s or not s.class_id or not _can_view(db, user, s.class_id):
        raise HTTPException(status_code=403, detail="You can only view students of classes you teach")
    a = analytics.student_analysis(db, s)
    summary, stale = student_summary(db, s, a, refresh=True)
    return {"summary": summary, "summary_stale": stale}
