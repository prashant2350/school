# VidyaDesk backend (FastAPI)

See the top-level `README.md` for setup, the database guide and the security checklist.

- Docs while running: http://127.0.0.1:8000/docs
- Roles: `admin`, `accountant`, `clerk`, `teacher` (staff, email login) and students (Student ID login). Staff and student tokens are not interchangeable.
- Public endpoints (no login): `GET /api/v1/public/info`, `GET /api/v1/public/grades`, `POST /api/v1/public/apply`.
- Migrations: `alembic upgrade head` / `alembic revision --autogenerate -m "message"`.
