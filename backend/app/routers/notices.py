from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.database import get_db
from app.deps import CurrentUser, DbSession, require_roles
from app.models import Notice
from app.schemas import NoticeCreate, NoticeOut

router = APIRouter(prefix="/notices", tags=["Notices"])

@router.get("", response_model=list[NoticeOut])
def list_notices(db: DbSession, user: CurrentUser, published_only: bool = False):
    stmt = select(Notice).order_by(Notice.created_at.desc())
    if published_only or user.role in {"student", "parent"}:
        stmt = stmt.where(Notice.published.is_(True))
    return list(db.scalars(stmt.limit(100)).all())

@router.post("", response_model=NoticeOut, status_code=201)
def create_notice(data: NoticeCreate, db: Session = Depends(get_db),
                  user=Depends(require_roles("admin", "teacher"))):
    row = Notice(**data.model_dump(), created_by=user.id)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.patch("/{notice_id}/publish", response_model=NoticeOut)
def publish_notice(notice_id: int, db: Session = Depends(get_db),
                   user=Depends(require_roles("admin"))):
    row = db.get(Notice, notice_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notice not found")
    row.published = True
    db.commit()
    db.refresh(row)
    return row


@router.delete("/{notice_id}", status_code=204)
def delete_notice(notice_id: int, db: DbSession, user=Depends(require_roles("admin"))):
    row = db.get(Notice, notice_id)
    if not row:
        raise HTTPException(status_code=404, detail="Notice not found")
    db.delete(row)
    db.commit()
