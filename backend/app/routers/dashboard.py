from datetime import date, datetime, timezone
from fastapi import APIRouter
from sqlalchemy import func, select
from app.deps import CurrentUser, DbSession
from app.models import AdmissionApplication, Attendance, FeeTransaction, Notice, SchoolClass, Student
from app import services

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("/summary")
def summary(db: DbSession, user: CurrentUser):
    active = Student.is_active.is_(True)
    total = db.scalar(select(func.count()).select_from(Student).where(active)) or 0
    by_class = db.execute(select(SchoolClass.grade, SchoolClass.section, func.count(Student.id))
                          .join(Student, Student.class_id == SchoolClass.id).where(active)
                          .group_by(SchoolClass.grade, SchoolClass.section)
                          .order_by(SchoolClass.grade, SchoolClass.section)).all()
    today = date.today()
    att = dict(db.execute(select(Attendance.status, func.count()).where(Attendance.attendance_date == today)
                          .group_by(Attendance.status)).all())
    marked = sum(att.values())
    out = {
        "school_year": services.current_year(db), "total_students": total,
        "new_this_year": db.scalar(select(func.count()).select_from(AdmissionApplication).where(
            AdmissionApplication.status == "approved", AdmissionApplication.academic_year == services.current_year(db))) or 0,
        "pending_applications": db.scalar(select(func.count()).select_from(AdmissionApplication)
                                          .where(AdmissionApplication.status == "pending")) or 0,
        "classes": [{"label": f"{g}-{s}", "count": c} for g, s, c in by_class],
        "attendance_today": {"marked": marked, "present": att.get("present", 0), "absent": att.get("absent", 0),
                             "percentage": round((att.get("present", 0) + att.get("half_day", 0) * .5) * 100 / marked, 1) if marked else None},
        "notices": [{"id": n.id, "title": n.title, "created_at": n.created_at}
                    for n in db.scalars(select(Notice).where(Notice.published.is_(True)).order_by(Notice.created_at.desc()).limit(4)).all()],
        "fees": None,
    }
    if user.role in ("admin", "accountant", "clerk"):
        month_start = datetime(today.year, today.month, 1, tzinfo=timezone.utc)
        collected = db.scalar(select(func.coalesce(func.sum(FeeTransaction.amount_paid), 0))
                              .where(FeeTransaction.paid_at >= month_start)) or 0
        balances = services.fee_balances(db)
        outstanding = sum(v for v in balances.values() if v > 0)
        recent = db.execute(select(FeeTransaction, Student).join(Student, Student.id == FeeTransaction.student_id)
                            .order_by(FeeTransaction.paid_at.desc()).limit(6)).all()
        out["fees"] = {"collected_this_month": str(collected), "outstanding": str(outstanding),
                       "defaulters": sum(1 for v in balances.values() if v > 0),
                       "recent": [{"receipt_no": t.receipt_no, "student": f"{s.first_name} {s.last_name}".strip(),
                                   "amount": str(t.amount_paid), "mode": t.payment_mode, "paid_at": t.paid_at} for t, s in recent]}
    return out
