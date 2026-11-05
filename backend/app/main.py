import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, select, text
from app.config import settings
from app.database import Base, SessionLocal, engine
from app.models import User, FeeHead, AcademicYear, SchoolClass, Setting
from app.security import hash_password
from app.routers import (auth, students, classes, attendance, fees, notices, exams, admissions, academic, users, portal,
                         dashboard, faculty, teaching, transport, gallery, papers, insights)
from app import services

def upgrade_old_database():
    """Dev convenience: if you already have a local database from an older version, add any columns
    the models now have but the tables don't (new tables are made by create_all). Production uses Alembic."""
    insp = inspect(engine)
    for table in Base.metadata.sorted_tables:
        if not insp.has_table(table.name):
            continue
        existing = {c["name"] for c in insp.get_columns(table.name)}
        for col in table.columns:
            if col.name in existing:
                continue
            ddl = f"ALTER TABLE {table.name} ADD COLUMN {col.name} {col.type.compile(engine.dialect)}"
            default = col.default.arg if col.default is not None and getattr(col.default, "is_scalar", False) else None
            if isinstance(default, bool):
                ddl += f" DEFAULT {'TRUE' if default else 'FALSE'}"
            elif isinstance(default, (int, float)):
                ddl += f" DEFAULT {default}"
            elif isinstance(default, str):
                ddl += " DEFAULT '" + default.replace("'", "''") + "'"
            with engine.begin() as conn:
                conn.execute(text(ddl))

def warn_if_unsafe():
    log = logging.getLogger("uvicorn.error")
    if settings.jwt_secret_key.startswith("replace-this"):
        log.warning("SECURITY: JWT_SECRET_KEY is still the default. Set a long random value in backend/.env before real use.")
    if settings.bootstrap_admin_password == "ChangeMe123!":
        log.warning("SECURITY: BOOTSTRAP_ADMIN_PASSWORD is still the default. Change it in backend/.env (before the first run).")

def seed_logo(db):
    """First start: use frontend/public/logo.png as the school logo (website, login page and report-card PDFs)."""
    import base64
    from io import BytesIO
    if db.get(Setting, "school_logo"):
        return
    f = Path(__file__).resolve().parents[2] / "frontend" / "public" / "logo.png"
    if not f.is_file():
        return
    try:
        from PIL import Image
        img = Image.open(f).convert("RGBA")
        img.thumbnail((600, 600))
        out = BytesIO()
        img.save(out, "PNG")
        db.add(Setting(key="school_logo", value=base64.b64encode(out.getvalue()).decode()))
        db.commit()
    except Exception:
        logging.getLogger("uvicorn.error").warning("Could not load frontend/public/logo.png as the school logo")

def bootstrap():
    # Convenient local-development bootstrap. Use Alembic migrations for production releases.
    if settings.auto_create_tables:
        Base.metadata.create_all(bind=engine)
        upgrade_old_database()
    with SessionLocal() as db:
        email = settings.bootstrap_admin_email.lower()
        existing = db.scalar(select(User).where(User.email == email))
        if not existing:
            db.add(User(
                full_name=settings.bootstrap_admin_name, email=email,
                password_hash=hash_password(settings.bootstrap_admin_password),
                role="admin", is_active=True
            ))
        for name in ("Tuition Fee", "Examination Fee", "Computer Fee", "Transport Fee"):
            if not db.scalar(select(FeeHead).where(FeeHead.name == name)):
                db.add(FeeHead(name=name))
        if not db.scalar(select(AcademicYear)):
            db.add(AcademicYear(name=settings.current_academic_year, is_current=True))
        db.commit()
        if not db.scalar(select(SchoolClass.id)):      # brand-new school: list Nursery, LKG, UKG, Class 1-12 (section A)
            services.ensure_standard_classes(db, services.current_year(db), ["A"])
        seed_logo(db)
        services.backfill_class_subjects(db)
        services.ensure_enrollments(db)

@asynccontextmanager
async def lifespan(app: FastAPI):
    warn_if_unsafe()
    bootstrap()
    yield

app = FastAPI(
    title=settings.app_name,
    description="School ERP API for students, attendance, fees, examinations and notices.",
    version="1.0.0",
    lifespan=lifespan
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admissions.public_router, prefix=settings.api_v1_prefix)
app.include_router(transport.public_router, prefix=settings.api_v1_prefix)
for router in (auth.router, students.router, classes.router, attendance.router, fees.router, notices.router, exams.router,
               admissions.router, academic.router, users.router, portal.router, dashboard.router,
               faculty.router, teaching.router, transport.router, gallery.router, papers.router, insights.router):
    app.include_router(router, prefix=settings.api_v1_prefix)

@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok", "service": "vidyadesk-api"}

# One-server mode: if you ran `npm run build` in frontend/, FastAPI serves the website too (open http://127.0.0.1:8000).
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.is_dir():
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=DIST, html=True), name="site")
else:
    @app.get("/", include_in_schema=False)
    def root():
        return {"service": settings.app_name, "docs": "/docs", "health": "/health"}
