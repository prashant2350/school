from decimal import Decimal
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from app.database import get_db
from app.deps import CurrentUser, DbSession, require_roles
from app import services
from app.models import FeeHead, FeeTransaction, Student, StudentFeeDue, User, SchoolClass
from app.schemas import BulkDuesIn, FeeHeadCreate, FeeHeadOut, FeeDueCreate, FeeDueOut, FeePaymentIn, FeeTransactionOut

router = APIRouter(prefix="/fees", tags=["Fees"])
MODES = {"cash", "upi", "net_banking", "card", "cheque"}

@router.get("/heads", response_model=list[FeeHeadOut])
def list_fee_heads(db: DbSession, user: CurrentUser):
    return list(db.scalars(select(FeeHead).where(FeeHead.is_active.is_(True)).order_by(FeeHead.name)).all())

@router.post("/heads", response_model=FeeHeadOut, status_code=201)
def create_fee_head(data: FeeHeadCreate, db: Session = Depends(get_db),
                    user=Depends(require_roles("admin", "accountant"))):
    row = FeeHead(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.get("/dues", response_model=list[FeeDueOut])
def list_dues(db: DbSession, user: CurrentUser, student_id: int | None = None):
    stmt = select(StudentFeeDue).where(StudentFeeDue.is_active.is_(True))
    if student_id:
        stmt = stmt.where(StudentFeeDue.student_id == student_id)
    return list(db.scalars(stmt.order_by(StudentFeeDue.due_date)).all())

@router.post("/dues", response_model=FeeDueOut, status_code=201)
def create_due(data: FeeDueCreate, db: Session = Depends(get_db),
               user=Depends(require_roles("admin", "accountant"))):
    if not db.get(Student, data.student_id) or not db.get(FeeHead, data.fee_head_id):
        raise HTTPException(status_code=404, detail="Student or fee head not found")
    row = StudentFeeDue(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.get("/transactions", response_model=list[FeeTransactionOut])
def list_transactions(student_id: int | None = None, db: Session = Depends(get_db),
                      user=Depends(require_roles("admin", "accountant", "clerk"))):
    stmt = select(FeeTransaction, Student, User).join(Student, Student.id == FeeTransaction.student_id) \
        .join(User, User.id == FeeTransaction.collected_by).order_by(FeeTransaction.paid_at.desc())
    if student_id:
        stmt = stmt.where(FeeTransaction.student_id == student_id)
    out = []
    for t, st, u in db.execute(stmt.limit(300)).all():
        item = FeeTransactionOut.model_validate(t)
        item.student_name, item.admission_no, item.collected_by_name = f"{st.first_name} {st.last_name}".strip(), st.admission_no, u.full_name
        out.append(item)
    return out

@router.post("/payments", response_model=FeeTransactionOut, status_code=201)
def record_payment(data: FeePaymentIn, db: Session = Depends(get_db),
                   user=Depends(require_roles("admin", "accountant", "clerk"))):
    if data.payment_mode.lower() not in MODES:
        raise HTTPException(status_code=422, detail=f"payment_mode must be one of {sorted(MODES)}")
    student = db.get(Student, data.student_id)
    if not student or not student.is_active:
        raise HTTPException(status_code=404, detail="Active student not found")
    row = FeeTransaction(
        receipt_no=f"VD-{uuid4().hex[:10].upper()}",
        student_id=data.student_id, amount_paid=data.amount_paid, discount=data.discount,
        payment_mode=data.payment_mode.lower(), reference_note=data.reference_note, collected_by=user.id
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.get("/summary")
def fee_summary(db: Session = Depends(get_db), user=Depends(require_roles("admin", "accountant"))):
    collected = db.scalar(select(func.coalesce(func.sum(FeeTransaction.amount_paid), 0))) or 0
    dues = db.scalar(select(func.coalesce(func.sum(StudentFeeDue.amount_due - StudentFeeDue.discount), 0)).where(StudentFeeDue.is_active.is_(True))) or 0
    return {"total_collected": str(collected), "net_scheduled_dues": str(dues), "currency": "INR"}


@router.post("/dues/bulk")
def bulk_dues(data: BulkDuesIn, db: DbSession, user=Depends(require_roles("admin", "accountant"))):
    """Charge one fee head to every active student of a class (e.g. 'Tuition Fee, Oct-2026, 1200')."""
    if not db.get(SchoolClass, data.class_id) or not db.get(FeeHead, data.fee_head_id):
        raise HTTPException(status_code=404, detail="Class or fee head not found")
    created = skipped = 0
    for s in db.scalars(select(Student).where(Student.class_id == data.class_id, Student.is_active.is_(True))).all():
        exists = db.scalar(select(StudentFeeDue.id).where(StudentFeeDue.student_id == s.id,
                           StudentFeeDue.fee_head_id == data.fee_head_id, StudentFeeDue.period == data.period))
        if exists:
            skipped += 1
            continue
        db.add(StudentFeeDue(student_id=s.id, fee_head_id=data.fee_head_id, period=data.period,
                             amount_due=data.amount_due, due_date=data.due_date))
        created += 1
    db.commit()
    return {"created": created, "skipped_existing": skipped}

@router.get("/ledger/{student_id}")
def ledger(student_id: int, db: DbSession, user=Depends(require_roles("admin", "accountant", "clerk"))):
    return services.fee_ledger(db, student_id)

@router.get("/defaulters")
def defaulters(db: DbSession, user=Depends(require_roles("admin", "accountant", "clerk"))):
    balances = {sid: b for sid, b in services.fee_balances(db).items() if b > 0}
    if not balances:
        return []
    rows = db.execute(select(Student, SchoolClass).outerjoin(SchoolClass, SchoolClass.id == Student.class_id)
                      .where(Student.id.in_(list(balances)), Student.is_active.is_(True))).all()
    out = [{"student_id": s.id, "admission_no": s.admission_no, "name": f"{s.first_name} {s.last_name}".strip(),
            "class": services.class_label(k), "parent_contact": s.parent_contact, "balance": str(balances[s.id])}
           for s, k in rows]
    return sorted(out, key=lambda r: -float(r["balance"]))
