"""Public photo gallery. Anyone can view; only the admin uploads or deletes."""
from io import BytesIO
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from sqlalchemy import select
from app.deps import DbSession, require_roles
from app.models import GalleryPhoto

router = APIRouter(tags=["Gallery"])
CATEGORIES = ["Campus", "Events", "Sports", "Annual Day", "Classrooms", "Labs", "Buses"]

def _out(p: GalleryPhoto) -> dict:
    return {"id": p.id, "title": p.title, "category": p.category, "created_at": p.created_at}

@router.get("/public/gallery")
def public_gallery(db: DbSession, category: str | None = None):
    stmt = select(GalleryPhoto).order_by(GalleryPhoto.created_at.desc(), GalleryPhoto.id.desc())
    if category:
        stmt = stmt.where(GalleryPhoto.category == category)
    return {"categories": CATEGORIES, "photos": [_out(p) for p in db.scalars(stmt.limit(300)).all()]}

@router.get("/public/gallery/{photo_id}/{kind}", include_in_schema=False)
def gallery_image(photo_id: int, kind: str, db: DbSession):
    if kind not in ("image", "thumb"):
        raise HTTPException(status_code=404, detail="Not found")
    p = db.get(GalleryPhoto, photo_id)
    if not p:
        raise HTTPException(status_code=404, detail="Photo not found")
    return Response(content=p.image if kind == "image" else p.thumb, media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=86400"})

@router.post("/gallery", status_code=201)
async def upload_photo(db: DbSession, user=Depends(require_roles("admin")), file: UploadFile = File(...),
                       title: str = Form(""), category: str = Form("Campus")):
    raw = await file.read(8_000_001)
    if len(raw) > 8_000_000:
        raise HTTPException(status_code=413, detail="Photo is too large (max 8 MB)")
    try:
        from PIL import Image, ImageOps
        img = ImageOps.exif_transpose(Image.open(BytesIO(raw))).convert("RGB")
        big, small = BytesIO(), BytesIO()
        full = img.copy(); full.thumbnail((1800, 1800)); full.save(big, "JPEG", quality=84, optimize=True)
        img.thumbnail((520, 520)); img.save(small, "JPEG", quality=80, optimize=True)
    except Exception:
        raise HTTPException(status_code=422, detail="That file is not a valid photo (use JPG or PNG)")
    p = GalleryPhoto(title=title.strip()[:160], category=(category.strip() or "Campus")[:40], image=big.getvalue(), thumb=small.getvalue())
    db.add(p)
    db.commit()
    return _out(p)

@router.patch("/gallery/{photo_id}")
def edit_photo(photo_id: int, db: DbSession, user=Depends(require_roles("admin")), title: str | None = Form(None), category: str | None = Form(None)):
    p = db.get(GalleryPhoto, photo_id)
    if not p:
        raise HTTPException(status_code=404, detail="Photo not found")
    if title is not None:
        p.title = title.strip()[:160]
    if category:
        p.category = category.strip()[:40]
    db.commit()
    return _out(p)

@router.delete("/gallery/{photo_id}", status_code=204)
def delete_photo(photo_id: int, db: DbSession, user=Depends(require_roles("admin"))):
    p = db.get(GalleryPhoto, photo_id)
    if not p:
        raise HTTPException(status_code=404, detail="Photo not found")
    db.delete(p)
    db.commit()
