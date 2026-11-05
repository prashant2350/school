"""Performance analysis from question-wise marks. All numbers are calculated here (exact, free);
the AI is only used afterwards to put them into friendly words."""
from collections import defaultdict
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.models import Exam, ExamPaper, PaperQuestion, QuestionMark, SchoolClass, Student, Subject
from app import services

def _pct(scored: float, possible: float) -> float | None:
    return round(scored * 100 / possible, 1) if possible else None

def _rows(db: Session, student_ids: list[int]):
    """(mark, question, paper, exam, subject) for PUBLISHED exams only - students never see analysis of unpublished results."""
    if not student_ids:
        return []
    return db.execute(select(QuestionMark, PaperQuestion, ExamPaper, Exam, Subject)
                      .join(PaperQuestion, PaperQuestion.id == QuestionMark.question_id)
                      .join(ExamPaper, ExamPaper.id == PaperQuestion.paper_id)
                      .join(Exam, Exam.id == ExamPaper.exam_id)
                      .join(Subject, Subject.id == ExamPaper.subject_id)
                      .where(QuestionMark.student_id.in_(student_ids), Exam.status == "published")).all()

def _topic_totals(rows) -> dict[tuple[str, str], list[float]]:
    t: dict[tuple[str, str], list[float]] = defaultdict(lambda: [0.0, 0.0, 0])
    for m, q, p, e, s in rows:
        k = (s.name, (q.topic or "General").strip() or "General")
        t[k][0] += m.marks; t[k][1] += q.marks; t[k][2] += 1
    return t

def signature(db: Session, student_id: int) -> str:
    rows = _rows(db, [student_id])
    return f"{len(rows)}-{round(sum(r[0].marks for r in rows), 2)}"

def student_analysis(db: Session, student: Student) -> dict:
    mine = _rows(db, [student.id])
    peers = [x for x in db.scalars(select(Student.id).where(Student.class_id == student.class_id, Student.is_active.is_(True))).all()] if student.class_id else [student.id]
    class_t = _topic_totals(_rows(db, peers))
    topics = []
    for (subj, topic), (sc, pos, n) in _topic_totals(mine).items():
        c = class_t.get((subj, topic))
        topics.append({"subject": subj, "topic": topic, "scored": round(sc, 1), "possible": round(pos, 1), "pct": _pct(sc, pos),
                       "class_pct": _pct(c[0], c[1]) if c else None, "questions": int(n)})
    topics.sort(key=lambda x: (x["pct"] is None, x["pct"]))
    # per exam -> per subject -> per question
    exams: dict[int, dict] = {}
    for m, q, p, e, s in sorted(mine, key=lambda r: (r[3].start_date or r[3].id, r[3].id, r[4].name, r[1].sort)):
        ex = exams.setdefault(e.id, {"exam_id": e.id, "exam": e.name, "date": e.start_date, "subjects": {}})
        sub = ex["subjects"].setdefault(s.name, {"subject": s.name, "scored": 0.0, "possible": 0.0, "questions": []})
        sub["scored"] += m.marks; sub["possible"] += q.marks
        sub["questions"].append({"number": q.number, "topic": q.topic, "marks": q.marks, "scored": m.marks, "pct": _pct(m.marks, q.marks)})
    exam_list = []
    for ex in exams.values():
        subs = [{**s, "scored": round(s["scored"], 1), "possible": round(s["possible"], 1), "pct": _pct(s["scored"], s["possible"])} for s in ex["subjects"].values()]
        sc, pos = sum(s["scored"] for s in subs), sum(s["possible"] for s in subs)
        exam_list.append({"exam_id": ex["exam_id"], "exam": ex["exam"], "date": ex["date"], "subjects": subs, "pct": _pct(sc, pos)})
    exam_list.sort(key=lambda x: (str(x["date"] or ""), x["exam_id"]))          # oldest -> newest = the trend line
    trend: dict[str, list] = defaultdict(list)
    for ex in exam_list:
        for s in ex["subjects"]:
            trend[s["subject"]].append({"exam": ex["exam"], "pct": s["pct"]})
    rated = [t for t in topics if t["pct"] is not None]
    return {"has_data": bool(mine), "topics": topics, "exams": list(reversed(exam_list)), "trend": [{"subject": k, "points": v} for k, v in trend.items()],
            "strong": [t for t in reversed(rated) if t["pct"] >= 75][:5], "weak": [t for t in rated if t["pct"] < 55][:6]}

def ai_payload(a: dict) -> dict:
    """What is sent to Gemini: marks and topics only, no personal details."""
    return {"topics": [{k: t[k] for k in ("subject", "topic", "pct", "class_pct")} for t in a["topics"]],
            "trend": a["trend"], "exams": [{"exam": e["exam"], "pct": e["pct"]} for e in reversed(a["exams"])]}

def class_analysis(db: Session, class_id: int) -> dict:
    k = db.get(SchoolClass, class_id)
    studs = list(db.scalars(select(Student).where(Student.class_id == class_id, Student.is_active.is_(True)).order_by(Student.first_name)).all())
    rows = _rows(db, [s.id for s in studs])
    by_student: dict[int, list] = defaultdict(list)
    for r in rows:
        by_student[r[0].student_id].append(r)
    subj: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])
    for m, q, p, e, s in rows:
        subj[s.name][0] += m.marks; subj[s.name][1] += q.marks
    topics = [{"subject": s, "topic": t, "pct": _pct(v[0], v[1]), "possible": round(v[1], 1)} for (s, t), v in _topic_totals(rows).items()]
    topics.sort(key=lambda x: (x["pct"] is None, x["pct"]))
    out = []
    for st in studs:
        rs = by_student.get(st.id, [])
        tt = _topic_totals(rs)
        weak = sorted([(v[0] / v[1], k2) for k2, v in tt.items() if v[1]], key=lambda x: x[0])[:3]
        out.append({"student_id": st.id, "name": f"{st.first_name} {st.last_name}".strip(), "admission_no": st.admission_no, "roll_no": st.roll_no,
                    "pct": _pct(sum(r[0].marks for r in rs), sum(r[1].marks for r in rs)), "weak_topics": [f"{s} · {t}" for (p_, (s, t)) in weak if p_ < 0.55]})
    out.sort(key=lambda x: (x["pct"] is None, x["pct"]))
    rated = [s for s in out if s["pct"] is not None]
    return {"class_id": class_id, "class_label": services.class_label(k), "students": len(studs), "with_data": len(rated),
            "average": round(sum(s["pct"] for s in rated) / len(rated), 1) if rated else None,
            "subjects": sorted([{"subject": s, "pct": _pct(v[0], v[1])} for s, v in subj.items()], key=lambda x: x["pct"] or 0),
            "topics": topics, "at_risk": [s for s in rated if s["pct"] < 40], "student_list": out}
