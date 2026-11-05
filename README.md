# VidyaDesk — School ERP for Sanjeevius High School, Padrauna

Everything below is built and working: staff login, **faculty login with Employee ID (class teacher / subject teacher portal)**, student login, new admissions (staff-entered **and** a public online form), year-end promotion, students, classes & years, attendance, fees, exams & marks, notices, staff accounts, settings, and a student portal.

## 1. Run it (Windows PowerShell)

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env        # then edit .env (see "Before real use")
cd ..\frontend
npm install
npm run build                      # makes frontend\dist
cd ..\backend
uvicorn app.main:app --reload
```

Open **http://127.0.0.1:8000** — the website and the API run on that one address. API docs: `/docs`.

For front-end development with hot reload, run `npm run dev` in `frontend/` (http://localhost:5173) while uvicorn runs; it talks to the API at `127.0.0.1:8000` automatically.

First login: the admin in `backend/.env` (`BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`, default `admin@example.com` / `ChangeMe123!`).

## 2. First-day checklist (as admin)
1. **Settings** → school name, address, phone, principal.
2. **Classes & years** → create classes (e.g. Class 6-A) for the current year.
3. **Staff accounts** → add teachers / accountant / clerk.
4. **Students** → *Add student* or *Import CSV* (template inside). Each student gets a **Student ID** (`SHS-2026-0001`) and a temporary password; hand these out. Students must change it at first login.
5. **Fees** → add fee heads, then generate dues for a class in bulk.

## 2b. Faculty set-up (admin does this once per year)
**Classes are pre-listed:** on first start the app creates Nursery, LKG, UKG and Class 1 to Class 12 (section A) for the current year. Need more sections? *Classes & years → Quick set-up* → type `A, B` → *Create Nursery – Class 12* (existing classes are skipped).

1. **Staff accounts** → add each teacher (role *teacher*). They get an Employee ID (`SHS-T-001`) and a temporary password. They must change it at first login.
2. **Classes & years** → in the class list, pick the **Class teacher** from the dropdown on each class row. Only that teacher sees the class list and the *Attendance* tab.
3. **Subjects & teachers** → choose a class and add its subjects, then pick the teacher for each subject. To give one subject to many classes at once (e.g. Mathematics to Class 1-10), press **Add a subject to many classes**, tick the classes (or use the quick buttons *Class 1–5*, *Class 9–10* ...) and save. When you create next year's classes with *Copy classes from*, the subjects and teachers are copied too.
4. **Timetable** → fill the weekly grid (period numbers). It is shown on the faculty and student portals.

**Attendance rule (as in a real school):** attendance is taken **once a day, in the first period, by the class teacher, on a phone**. Subject teachers never take attendance and never see that tab. Every faculty member marks **their own** attendance with one button (*I am present today*); the admin can see and correct it under *Faculty attendance*.

**Results:** admin creates an exam (status *open*) → each subject teacher enters or uploads marks only for their own class and subject → admin checks *progress* and sets the exam to **published** → students see marks (and can download a **PDF report card**). Published exams are locked.

**Result PDF with your logo:** *Settings → Result PDF: logo & design* → upload the school logo (PNG or JPG, a square-ish image works best), then choose a design: **Classic**, **Modern** or **Board style**. *Preview* opens a sample in each design with your real logo. Students then download this PDF from *Results → PDF* (only for exams the admin has published). Add the principal's name in *School details* so it prints on the PDF. To add a fourth design, copy one `_build_...` function in `backend/app/pdfs.py` and register it in `TEMPLATES`.

**Upgrading an older local database:** the app adds the new columns/tables automatically when it starts (SQLite). With PostgreSQL run `alembic upgrade head`.

## 2c. When the admin adds a student — does it reach the database?
Yes. There is no separate step. *Students → Add student* (or *Admit directly*, *Import CSV*, or approving an online application) calls the API, which **writes a row to the `students` table** in whatever `DATABASE_URL` points to, plus an `enrollments` row for the year. The same button creates the Student ID and temporary password (the password is stored only as a hash and shown once). The student can sign in immediately. To check: open the database (SQLite file `backend/vidyadesk.db`, or PostgreSQL) and run `SELECT admission_no, first_name FROM students;`.

## 3. Who uses what
| Page / URL | Who | Notes |
|---|---|---|
| `/` sign-in (tabs: Admin/Staff, Student) | everyone | Staff use email; students use Student ID |
| `/#/apply` | parents, no login | Public admission form → lands in *New admissions → Pending* |
| Admin panel | admin, clerk, accountant, teacher | Menu items are shown by role |
| Faculty portal (`/`, Admin/Staff tab, use Employee ID) | teachers | Class teachers: mark class attendance. Everyone: own attendance, timetable, upload marks for own subject |
| Student portal | students | Attendance, fees & receipts, results (printable), notices, profile |

## 4. Every year
- **New admissions**: parents apply at `/#/apply` (or staff click *New application* / *Admit directly*). *Approve* creates the student + login.
- **Existing students**: **Year-end promotion** → create next academic year (copies classes) → *Load students* → review (promote / repeat / passed out / left) → *Run*. Class history is kept per year.

## 5. Where things live (so you know where to change them)
```
backend/app/
  config.py        all settings, read from backend/.env      <- DATABASE_URL lives here
  database.py      the ONE place that connects to the database
  models.py        every table (students, fees, attendance...)
  routers/         one file per feature (students.py, fees.py, admissions.py ...)
  services.py      shared logic (IDs, promotion, balances)
  security.py      password hashing, tokens, login lockout, rate limit
  deps.py          "who is logged in" + role checks
backend/migrations/  Alembic (database version history)
frontend/src/
  api.ts           the ONLY file that knows the server address
  Login.tsx  Apply.tsx  student/Portal.tsx  admin/*.tsx (one file per admin page)
```

## 6. Adding / changing the database later  ← read this
The app currently stores everything in a local file `backend/vidyadesk.db` (SQLite). That is fine for trying it out and for a single computer. For the school's real, shared use, move to **PostgreSQL**. Nothing in the code changes — only configuration.

**Step 1 — create the database** (on your server, once)
```sql
CREATE USER vidyadesk WITH PASSWORD 'a-strong-password';
CREATE DATABASE vidyadesk OWNER vidyadesk;
```
Managed options (Neon, Supabase, AWS RDS, DigitalOcean) work the same: they give you a connection string.

**Step 2 — point the app at it.** In `backend/.env`:
```env
DATABASE_URL=postgresql+psycopg://vidyadesk:a-strong-password@localhost:5432/vidyadesk
AUTO_CREATE_TABLES=false
```
If the password has symbols like `@ # /`, URL-encode them (`@` → `%40`).

**Step 3 — create the tables with Alembic**
```powershell
cd backend
alembic upgrade head
```
Then start uvicorn. The first start creates the admin account from `.env`.

**When you later change `models.py`** (add a column/table):
```powershell
alembic revision --autogenerate -m "add transport route to students"
alembic upgrade head
```

**Moving existing SQLite data to PostgreSQL**: export Students via *Students → Export* / *Import CSV* for the student list; for everything else (fees, marks) ask me for a one-time copy script — don't copy files by hand.

**Backups (important):** schedule `pg_dump vidyadesk > backup.sql` daily and keep copies off the server. Test a restore once.

## 7. Before real use (security)
- In `backend/.env` set a long random `JWT_SECRET_KEY` and a strong `BOOTSTRAP_ADMIN_PASSWORD` **before the first run** (the app warns at startup if you didn't). Generate a key: `python -c "import secrets;print(secrets.token_urlsafe(48))"`.
- Serve over **HTTPS** (Caddy or nginx in front of uvicorn) — passwords must never travel over plain HTTP on the internet.
- Set `CORS_ORIGINS` to your real website address.
- Logins lock for 15 minutes after 5 wrong attempts; the public form is rate-limited (5/hour per device) with a spam trap. These counters are in memory — if you run several server processes, move them to Redis.

## 8. Not included (honest list)
Online fee payment (UPI/cards), SMS/WhatsApp sending, parent logins separate from the student's, transport and library modules. Ask and they can be added.

## 9. Tests
```powershell
cd backend; pip install pytest httpx2; python -m pytest -q
```


---
## What's new: public website, school bus module, new student menu

**Public website** (shown to everyone before login): `#/` Home · `#/about` · `#/gallery` · `#/apply` · `#/login`
- School name, crest and the ERP login buttons are on the home page. The crest is `frontend/public/logo.png` (replace the file to change it; it is also used for report-card PDFs on first start).
- Text for About (labs, rooms, facts, Instagram/Facebook links) lives in ONE file: `frontend/src/site/siteData.ts`. The labs/rooms there are sample text — replace with real ones.
- **Uploading photos later:** sign in as admin → **Photo gallery** → pick a category → **Choose photos** (many at once is fine). They appear on the website immediately. Delete from the same page.

**Transport** (admin / clerk → *Transport*)
- *Drivers*: photo, mobile, licence number and validity (warns 30 days before expiry).
- *Buses & routes*: bus number, plate, seats, driver, route, school arrival/leaving time and pickup stops with morning and afternoon times.
- *Student allotment*: every student picks (or the office picks) bus use + pickup stop for the **academic year**. A stop belongs to one bus, so choosing the stop allots the bus. A typed location that matches a stop name is matched automatically; otherwise it waits under "Needs attention". The office can change any student at any time (this locks it unless un-ticked). Full buses are refused unless "Allow over capacity" is ticked.
- On **admission** the approve dialog has an optional bus preference; after **promotion** nobody has a record for the new year, so each student is asked again on next login and the office sees them under "Needs attention".
- Student portal → **School bus**: bus number, driver (photo, phone, licence), stop, estimated arrival at the stop, at school, and back in the afternoon, plus the full route. A "live location" card is a placeholder: `buses.gps_device_id` is already in the database for the GPS phase.

**Student portal** now has a vertical left menu (sliding highlight, ripple on click; slide-in drawer on phones).

**Upgrading an existing install:** pull the code, `alembic upgrade head` (adds migration `0004`) or just restart in dev (tables are auto-created), then `cd frontend && npm install && npm run build`.


---
## AI answer keys, performance analysis and the mobile app

### Quick test (about 10 minutes)
1. **Get a Gemini key** (free): https://aistudio.google.com/apikey → copy the key.
2. **Backend**
   ```
   cd backend
   python -m venv .venv && source .venv/bin/activate        # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   cp .env.example .env                                      # then edit .env: set GEMINI_API_KEY=your-key
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
   Admin login = `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` from `.env` (defaults: admin@example.com / ChangeMe123!). Tests (no key needed, Gemini is faked): `python -m pytest -q`.
3. **Website / admin / teacher / student web portal**
   ```
   cd frontend && npm install && npm run dev        # http://localhost:5173
   ```
4. **Mobile app** (install the *Expo Go* app on your phone; phone and computer on the same Wi-Fi)
   ```
   cd mobile
   npm install
   npx expo install --fix          # aligns package versions with your Expo Go
   npx expo start
   ```
   Scan the QR code with Expo Go. On the first screen open **Server settings** and enter `http://<your-computer-IP>:8000/api/v1`
   (find the IP with `ipconfig` / `ifconfig`; it looks like 192.168.1.10). Windows may ask to allow Python through the firewall: allow it.

### Walk-through to see every feature
1. Admin → Classes: make a class; Teaching setup: add a subject (e.g. Science) to it and assign a teacher; Students: add a student (note the Student ID + temp password); Exams: create an exam for that class.
2. Teacher (or admin) → **Question papers** → pick class·subject and exam → upload a question-paper **PDF** → wait ~20 s while Gemini reads it.
3. Check each question's **marks, answer words, topic and keywords**, press **Generate answers**, read/edit them, press **Publish to students**.
4. Student (web or mobile) → **Answer key** → exam → subject. Answers appear.
5. Teacher → paper → **Enter marks** → type each student's marks per question → Save. (Totals also fill the normal marks sheet.)
6. Admin → Exams → set the exam to **published**.
7. Student → **My progress**: topic bars (with class average tick), strong/weak topics, question-by-question chips and an AI mentor summary (created automatically the first time).
8. Admin → **Performance**: pick a class → averages by subject, weakest topics, students at risk (click a student to see their full analysis), **Create summary** for an AI reading of the class.
9. Mobile Welcome screen → **New admission / apply now** → the application appears in Admin → Admissions.

### Good to know
- Teachers can only upload for the class + subject assigned to them; the admin can do any.
- Students see an answer key only after the teacher publishes it, and analysis only for exams whose results are published.
- Only question text, topics and marks are sent to Gemini: no names, photos or phone numbers.
- Scanned/handwritten question papers work too (Gemini reads the PDF pages). If extraction misses a question, use **Add question**.
- AI answers can be wrong. The flow forces a teacher to review before publishing. Keep it that way.
- Change the model with `GEMINI_MODEL` in `.env` if Google retires the default one.
- Mobile build for the Play Store later: `npx eas build -p android` (needs a free Expo account).
