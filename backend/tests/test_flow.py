"""End-to-end smoke test:  python -m pytest -q   (needs: pip install pytest httpx2)
Uses a throw-away SQLite file so it never touches your real database."""
import os, tempfile
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ["BOOTSTRAP_ADMIN_EMAIL"] = "admin@test.com"
os.environ["BOOTSTRAP_ADMIN_PASSWORD"] = "AdminPass123"
from fastapi.testclient import TestClient
from app.main import app

P = "/api/v1"

def H(tok): return {"Authorization": f"Bearer {tok}"}

def test_full_flow():
    with TestClient(app) as c:
        tok = c.post(f"{P}/auth/login", json={"email": "admin@test.com", "password": "AdminPass123"}).json()["access_token"]
        a = H(tok)
        assert c.post(f"{P}/auth/login", json={"email": "admin@test.com", "password": "wrong"}).status_code == 401
        assert c.get(f"{P}/public/info").json()["school_name"].startswith("St. Xavier")

        # classes for 2026-2027
        # Nursery..Class 12 are pre-listed on first start
        allc = c.get(f"{P}/classes", headers=a, params={"academic_year": "2026-2027"}).json()
        assert [x["grade"] for x in allc] == ["Nursery", "LKG", "UKG"] + [f"Class {i}" for i in range(1, 13)]
        k9 = next(x for x in allc if x["grade"] == "Class 9")
        k12 = next(x for x in allc if x["grade"] == "Class 12")

        # staff accounts
        r = c.post(f"{P}/users", headers=a, json={"full_name": "T One", "email": "t@test.com", "role": "teacher", "password": "TeacherPass1"})
        assert r.status_code == 201
        t = H(c.post(f"{P}/auth/login", json={"email": "t@test.com", "password": "TeacherPass1"}).json()["access_token"])
        assert c.post(f"{P}/students", headers=t, json={"first_name": "x", "parent_name": "y", "parent_contact": "9999999999"}).status_code == 403
        tid = r.json()["id"]
        assert r.json()["employee_id"] == "SHS-T-001"
        # the admin makes T One the CLASS TEACHER of Class 9-A
        assert c.patch(f"{P}/classes/{k9['id']}", headers=a, json={"class_teacher_id": tid}).json()["class_teacher_name"] == "T One"

        # NEW ADMISSION: application -> approve -> student + credentials
        app_ = c.post(f"{P}/admissions", headers=a, json={"applicant_name": "Riya Singh", "applying_grade": "Class 9",
              "parent_name": "Ram Singh", "parent_contact": "9876543210"}).json()
        st = c.post(f"{P}/admissions/{app_['id']}/approve", headers=a, json={"class_id": k9["id"]}).json()
        assert st["admission_no"] == "SHS-2026-0001" and st["temp_password"]
        assert c.post(f"{P}/admissions/{app_['id']}/approve", headers=a, json={"class_id": k9["id"]}).status_code == 409

        # direct add + bulk import
        d = c.post(f"{P}/students", headers=a, json={"first_name": "Aman", "last_name": "Yadav", "parent_name": "P",
              "parent_contact": "9000000001", "class_id": k12["id"]}).json()
        imp = c.post(f"{P}/students/import", headers=a, json=[
            {"first_name": "Imp", "parent_name": "P", "parent_contact": "9000000002", "class_id": k9["id"]},
            {"first_name": "Dup", "parent_name": "P", "parent_contact": "9000000003", "admission_no": d["admission_no"]}]).json()
        assert imp["created"] == 1 and imp["failed"] == 1

        # STUDENT LOGIN + isolation
        r = c.post(f"{P}/auth/student-login", json={"student_id": st["admission_no"], "password": st["temp_password"]})
        assert r.status_code == 200
        s = H(r.json()["access_token"])
        me = c.get(f"{P}/portal/me", headers=s).json()
        assert me["name"] == "Riya Singh" and me["must_change_password"] is True
        assert c.get(f"{P}/students", headers=s).status_code == 401       # student token != staff
        assert c.get(f"{P}/portal/me", headers=a).status_code == 401      # staff token != student
        assert c.post(f"{P}/portal/change-password", headers=s, json={"current_password": st["temp_password"], "new_password": "NewPass1234"}).status_code == 204
        assert c.post(f"{P}/auth/student-login", json={"student_id": st["admission_no"], "password": "NewPass1234"}).status_code == 200

        # ATTENDANCE (teacher)
        sheet = c.get(f"{P}/attendance/class-sheet", headers=t, params={"class_id": k9["id"]}).json()
        assert len(sheet) == 2
        recs = [{"student_id": x["student_id"], "status": "present"} for x in sheet]
        assert c.post(f"{P}/attendance/bulk", headers=t, json={"class_id": k9["id"], "records": recs}).json()["saved"] == 2
        assert c.post(f"{P}/attendance/bulk", headers=t, json={"class_id": k9["id"], "records": recs}).status_code == 200  # re-save ok
        assert c.get(f"{P}/portal/attendance", headers=s).json()["summary"]["percentage"] == 100.0

        # FEES
        heads = c.get(f"{P}/fees/heads", headers=a).json()
        r = c.post(f"{P}/fees/dues/bulk", headers=a, json={"class_id": k9["id"], "fee_head_id": heads[0]["id"], "period": "Oct-2026", "amount_due": "1200"}).json()
        assert r["created"] == 2
        assert c.post(f"{P}/fees/dues/bulk", headers=a, json={"class_id": k9["id"], "fee_head_id": heads[0]["id"], "period": "Oct-2026", "amount_due": "1200"}).json()["created"] == 0
        assert float(c.get(f"{P}/portal/fees", headers=s).json()["balance"]) == 1200
        pay = c.post(f"{P}/fees/payments", headers=a, json={"student_id": st["id"], "amount_paid": "500", "payment_mode": "cash"}).json()
        assert float(c.get(f"{P}/portal/fees", headers=s).json()["balance"]) == 700
        assert any(x["receipt_no"] == pay["receipt_no"] and x["student_name"] == "Riya Singh" for x in c.get(f"{P}/fees/transactions", headers=a).json())
        assert len(c.get(f"{P}/fees/defaulters", headers=a).json()) == 2

        # EXAMS: admin creates -> assigned faculty uploads -> admin publishes -> student sees
        ex = c.post(f"{P}/exams", headers=a, json={"name": "Half-yearly", "class_id": k9["id"]}).json()
        sub = c.post(f"{P}/teaching/subjects", headers=a, json={"name": "Maths"}).json()
        asg = c.post(f"{P}/teaching/assignments", headers=a, json={"teacher_id": tid, "class_id": k9["id"], "subject_id": sub["id"]}).json()
        sh = c.get(f"{P}/faculty/marks/sheet", headers=t, params={"exam_id": ex["id"], "assignment_id": asg["id"]}).json()
        assert len(sh["rows"]) == 2
        r = c.post(f"{P}/faculty/marks", headers=t, json={"exam_id": ex["id"], "assignment_id": asg["id"], "max_marks": "100",
               "records": [{"student_id": x["student_id"], "marks_obtained": "80"} for x in sh["rows"]]})
        assert r.json()["saved"] == 2
        assert c.get(f"{P}/portal/results", headers=s).json() == []                       # not published yet -> hidden
        assert c.post(f"{P}/faculty/marks", headers=t, json={"exam_id": ex["id"], "assignment_id": asg["id"], "max_marks": "100",
               "records": [{"admission_no": st["admission_no"], "marks_obtained": "150"}]}).status_code == 400   # over max
        prog = c.get(f"{P}/exams/{ex['id']}/progress", headers=a).json()
        assert prog[0]["entered"] == 2 and prog[0]["students"] == 2
        assert c.patch(f"{P}/exams/{ex['id']}/status", headers=a, json={"status": "published"}).json()["status"] == "published"
        assert c.post(f"{P}/faculty/marks", headers=t, json={"exam_id": ex["id"], "assignment_id": asg["id"], "max_marks": "100",
               "records": [{"student_id": sh["rows"][0]["student_id"], "marks_obtained": "10"}]}).status_code == 409   # locked
        res = c.get(f"{P}/portal/results", headers=s).json()
        assert res[0]["percentage"] == 80.0 and res[0]["grade"] == "A"
        pdf = c.get(f"{P}/portal/results/{ex['id']}/pdf", headers=s)
        assert pdf.status_code == 200 and pdf.content[:4] == b"%PDF"

        # NOTICES
        n = c.post(f"{P}/notices", headers=a, json={"title": "Hi", "body": "Body", "audience": "students", "published": True}).json()
        assert len(c.get(f"{P}/portal/notices", headers=s).json()) == 1

        # DASHBOARD
        dash = c.get(f"{P}/dashboard/summary", headers=a).json()
        assert dash["total_students"] == 3 and dash["fees"]["defaulters"] == 2
        assert c.get(f"{P}/dashboard/summary", headers=t).json()["fees"] is None

        # YEAR-END PROMOTION
        assert c.post(f"{P}/academic-years", headers=a, json={"name": "2027-2028", "make_current": False}).status_code == 201
        c.post(f"{P}/academic-years/copy-classes", headers=a, params={"from_year": "2026-2027", "to_year": "2027-2028"})
        c.post(f"{P}/classes", headers=a, json={"grade": "Class 10", "section": "B", "academic_year": "2027-2028"})
        pv = c.get(f"{P}/promotion/preview", headers=a, params={"from_year": "2026-2027", "to_year": "2027-2028"}).json()
        assert len(pv["items"]) == 3
        by = {i["student_id"]: i for i in pv["items"]}
        assert by[d["id"]]["suggested_action"] == "passed_out"           # Class 12 leaves
        assert by[st["id"]]["suggested_class_id"] is not None            # Class 9-A -> Class 10-A
        items = [{"student_id": i["student_id"], "action": i["suggested_action"], "target_class_id": i["suggested_class_id"]} for i in pv["items"]]
        res = c.post(f"{P}/promotion/run", headers=a, json={"from_year": "2026-2027", "to_year": "2027-2028", "items": items}).json()
        assert res["promoted"] == 2 and res["passed_out"] == 1 and not res["errors"], res
        assert c.post(f"{P}/promotion/run", headers=a, json={"from_year": "2026-2027", "to_year": "2027-2028", "items": items}).json()["skipped"] == 2
        ov = c.get(f"{P}/students/{st['id']}/overview", headers=a).json()
        assert [h["class"] for h in ov["history"]] == ["Class 10-A", "Class 9-A"]
        assert c.post(f"{P}/auth/student-login", json={"student_id": d["admission_no"], "password": d["temp_password"]}).status_code == 401  # alumnus blocked

        # brute-force lock
        for _ in range(5):
            c.post(f"{P}/auth/student-login", json={"student_id": "SHS-X", "password": "bad"})
        assert c.post(f"{P}/auth/student-login", json={"student_id": "SHS-X", "password": "bad"}).status_code == 429


def test_public_apply():
    with TestClient(app) as c:
        body = {"applicant_name": "Neha Verma", "applying_grade": "Class 3", "parent_name": "Suresh Verma", "parent_contact": "9811122233"}
        r = c.post(f"{P}/public/apply", json=body)               # no login needed
        assert r.status_code == 201 and r.json()["reference"].startswith("APP-")
        assert c.post(f"{P}/public/apply", json={**body, "applying_grade": "Class 99"}).status_code == 422
        assert c.post(f"{P}/public/apply", json={**body, "website": "spam"}).json()["reference"] == "0"   # honeypot: silently dropped
        tok = c.post(f"{P}/auth/login", json={"email": "admin@test.com", "password": "AdminPass123"}).json()["access_token"]
        pend = c.get(f"{P}/admissions", headers=H(tok), params={"status": "pending"}).json()
        assert [a["applicant_name"] for a in pend].count("Neha Verma") == 1   # shows up for staff
        for _ in range(6):
            last = c.post(f"{P}/public/apply", json=body)
        assert last.status_code == 429                              # rate limit


def test_faculty_rules():
    with TestClient(app) as c:
        a = H(c.post(f"{P}/auth/login", json={"email": "admin@test.com", "password": "AdminPass123"}).json()["access_token"])
        k = c.post(f"{P}/classes", headers=a, json={"grade": "Class 6", "section": "B", "academic_year": "2026-2027"}).json()
        k2 = c.post(f"{P}/classes", headers=a, json={"grade": "Class 7", "section": "B", "academic_year": "2026-2027"}).json()
        # faculty accounts: auto Employee ID + one-time temporary password, forced change
        f1 = c.post(f"{P}/users", headers=a, json={"full_name": "Asha Verma", "role": "teacher"}).json()
        f2 = c.post(f"{P}/users", headers=a, json={"full_name": "Ravi Kumar", "role": "teacher"}).json()
        assert f1["employee_id"].startswith("SHS-T-") and f1["temp_password"] and f1["email"].endswith("@staff.invalid")
        r = c.post(f"{P}/auth/login", json={"email": f1["employee_id"].lower(), "password": f1["temp_password"]})   # sign in with Employee ID
        assert r.status_code == 200
        t1, t2 = H(r.json()["access_token"]), H(c.post(f"{P}/auth/login", json={"email": f2["employee_id"], "password": f2["temp_password"]}).json()["access_token"])
        assert c.get(f"{P}/auth/me", headers=t1).json()["must_change_password"] is True
        assert c.post(f"{P}/auth/change-password", headers=t1, json={"current_password": f1["temp_password"], "new_password": "NewFaculty123"}).status_code == 204
        assert c.get(f"{P}/auth/me", headers=t1).json()["must_change_password"] is False

        # a student in 6-B
        st = c.post(f"{P}/students", headers=a, json={"first_name": "Mohit", "parent_name": "P", "parent_contact": "9000000011", "class_id": k["id"]}).json()

        # class teacher rules: only the assigned class teacher sees the list / takes attendance
        assert c.get(f"{P}/attendance/class-sheet", headers=t1, params={"class_id": k["id"]}).status_code == 403
        assert c.patch(f"{P}/classes/{k['id']}", headers=a, json={"class_teacher_id": f1["id"]}).status_code == 200
        assert c.patch(f"{P}/classes/{k2['id']}", headers=a, json={"class_teacher_id": f1["id"]}).status_code == 409   # one class per teacher
        sheet = c.get(f"{P}/attendance/class-sheet", headers=t1, params={"class_id": k["id"]}).json()
        assert [x["name"] for x in sheet] == ["Mohit"]
        recs = [{"student_id": sheet[0]["student_id"], "status": "absent"}]
        assert c.post(f"{P}/attendance/bulk", headers=t2, json={"class_id": k["id"], "records": recs}).status_code == 403   # other teacher
        assert c.post(f"{P}/attendance/bulk", headers=t1, json={"class_id": k["id"], "records": recs}).json()["saved"] == 1
        assert c.post(f"{P}/attendance/bulk", headers=t1, json={"class_id": k["id"], "attendance_date": "2020-01-01", "records": recs}).status_code == 403   # past day = admin only
        assert c.post(f"{P}/attendance/bulk", headers=a, json={"class_id": k["id"], "attendance_date": "2020-01-01", "records": recs}).status_code == 200
        me = c.get(f"{P}/faculty/me", headers=t1).json()
        assert me["class_teacher_of"][0]["label"] == "Class 6-B" and me["class_teacher_of"][0]["marked_today"] is True
        assert c.get(f"{P}/faculty/me", headers=a).status_code == 403                    # admin is not a faculty member

        # faculty's own attendance: ONE button
        assert c.post(f"{P}/faculty/my-attendance", headers=t1).json()["status"] == "present"
        assert c.post(f"{P}/faculty/my-attendance", headers=t1).json()["status"] == "present"   # idempotent
        day = c.get(f"{P}/faculty/attendance", headers=a).json()
        got = {x["name"]: x["status"] for x in day}
        assert got["Asha Verma"] == "present" and got["Ravi Kumar"] is None
        assert c.put(f"{P}/faculty/attendance", headers=a, json={"user_id": f2["id"], "status": "leave"}).status_code == 200

        # marks: a teacher who is not assigned cannot touch another's subject
        sub = c.post(f"{P}/teaching/subjects", headers=a, json={"name": "Science"}).json()
        asg = c.post(f"{P}/teaching/assignments", headers=a, json={"teacher_id": f1["id"], "class_id": k["id"], "subject_id": sub["id"]}).json()
        ex = c.post(f"{P}/exams", headers=a, json={"name": "Unit test", "class_id": k["id"]}).json()
        body = {"exam_id": ex["id"], "assignment_id": asg["id"], "max_marks": "50", "records": [{"admission_no": st["admission_no"], "marks_obtained": "41"}]}
        assert c.post(f"{P}/faculty/marks", headers=t2, json=body).status_code == 403
        assert c.post(f"{P}/faculty/marks", headers=t1, json=body).json()["saved"] == 1      # CSV style (by Student ID)

        # timetable: a teacher cannot be in two classes in the same period
        asg2 = c.post(f"{P}/teaching/assignments", headers=a, json={"teacher_id": f1["id"], "class_id": k2["id"], "subject_id": sub["id"]}).json()
        assert c.put(f"{P}/teaching/timetable", headers=a, json={"class_id": k["id"], "slots": [{"weekday": 0, "period_no": 1, "assignment_id": asg["id"]}]}).status_code == 200
        assert c.put(f"{P}/teaching/timetable", headers=a, json={"class_id": k2["id"], "slots": [{"weekday": 0, "period_no": 1, "assignment_id": asg2["id"]}]}).status_code == 409
        assert c.put(f"{P}/teaching/timetable", headers=a, json={"class_id": k2["id"], "slots": [{"weekday": 0, "period_no": 2, "assignment_id": asg2["id"]}]}).status_code == 200

        # student: My teachers + profile + photo
        s = H(c.post(f"{P}/auth/student-login", json={"student_id": st["admission_no"], "password": st["temp_password"]}).json()["access_token"])
        tch = c.get(f"{P}/portal/teachers", headers=s).json()
        assert tch["class_teacher"] == "Asha Verma" and tch["subjects"][0]["subject"] == "Science" and tch["subjects"][0]["periods"] == ["Mon P1"]
        assert c.patch(f"{P}/portal/profile", headers=s, json={"phone": "9123456789", "theme": "teal", "bio": "I like chess"}).status_code == 200
        assert c.patch(f"{P}/portal/profile", headers=s, json={"theme": "neon"}).status_code == 422
        import io
        from PIL import Image
        buf = io.BytesIO(); Image.new("RGB", (600, 400), "red").save(buf, "PNG")
        assert c.post(f"{P}/portal/photo", headers=s, files={"file": ("me.png", buf.getvalue(), "image/png")}).status_code == 204
        assert c.get(f"{P}/portal/photo", headers=s).headers["content-type"] == "image/jpeg"
        assert c.post(f"{P}/portal/photo", headers=s, files={"file": ("x.png", b"not an image", "image/png")}).status_code == 422
        me = c.get(f"{P}/portal/me", headers=s).json()
        assert me["theme"] == "teal" and me["has_photo"] and me["phone"] == "9123456789"


def test_new_student_is_saved_in_the_database():
    """Proves 'add student' writes to the real database (not memory)."""
    import sqlite3
    with TestClient(app) as c:
        a = H(c.post(f"{P}/auth/login", json={"email": "admin@test.com", "password": "AdminPass123"}).json()["access_token"])
        st = c.post(f"{P}/students", headers=a, json={"first_name": "Dbcheck", "parent_name": "P", "parent_contact": "9000000099"}).json()
    con = sqlite3.connect(os.environ["DATABASE_URL"].replace("sqlite:///", ""))
    row = con.execute("select admission_no, first_name, password_hash from students where admission_no=?", (st["admission_no"],)).fetchone()
    assert row and row[1] == "Dbcheck" and row[2] and row[2] != st["temp_password"]     # stored, password hashed


def test_class_subjects_bulk_and_listing():
    with TestClient(app) as c:
        a = H(c.post(f"{P}/auth/login", json={"email": "admin@test.com", "password": "AdminPass123"}).json()["access_token"])
        # one click adds section B for every class; running it again creates nothing
        r = c.post(f"{P}/classes/standard", headers=a, json={"sections": ["A", "B"]}).json()
        assert 10 <= r["created"] <= 15 and c.post(f"{P}/classes/standard", headers=a, json={"sections": ["A", "B"]}).json()["created"] == 0
        classes = c.get(f"{P}/classes", headers=a, params={"academic_year": "2026-2027"}).json()
        ids = [k["id"] for k in classes if k["grade"] in ("Class 9", "Class 10")]
        assert len(ids) >= 4
        # the common button: one NEW subject -> many classes
        r = c.post(f"{P}/teaching/class-subjects", headers=a, json={"subject_name": "Bulk Hindi", "class_ids": ids}).json()
        assert r["added"] == len(ids) and r["already_had"] == 0
        r2 = c.post(f"{P}/teaching/class-subjects", headers=a, json={"subject_id": r["subject_id"], "class_ids": ids}).json()
        assert r2["added"] == 0 and r2["already_had"] == len(ids)
        assert "Bulk Hindi" in [x["name"] for x in c.get(f"{P}/teaching/class-subjects", headers=a, params={"class_id": ids[0]}).json()]
        # a teacher can be assigned afterwards; removing the subject from the class removes the assignment too
        t = c.post(f"{P}/users", headers=a, json={"full_name": "Bulk Teacher", "role": "teacher"}).json()
        assert c.post(f"{P}/teaching/assignments", headers=a, json={"teacher_id": t["id"], "class_id": ids[0], "subject_id": r["subject_id"]}).status_code == 201
        row = next(x for x in c.get(f"{P}/teaching/class-subjects", headers=a, params={"class_id": ids[0]}).json() if x["name"] == "Bulk Hindi")
        assert row["teacher"] == "Bulk Teacher"
        assert c.delete(f"{P}/teaching/class-subjects/{ids[0]}/{r['subject_id']}", headers=a).status_code == 204
        assert "Bulk Hindi" not in [x["name"] for x in c.get(f"{P}/teaching/class-subjects", headers=a, params={"class_id": ids[0]}).json()]
        assert c.delete(f"{P}/teaching/subjects/{r['subject_id']}", headers=a).status_code == 409   # still used by other classes


def test_result_pdf_designs_and_logo():
    from io import BytesIO
    from PIL import Image
    with TestClient(app) as c:
        a = H(c.post(f"{P}/auth/login", json={"email": "admin@test.com", "password": "AdminPass123"}).json()["access_token"])
        assert c.get(f"{P}/public/logo").status_code == 404                                   # no logo yet -> placeholder badge is used
        png = BytesIO(); Image.new("RGB", (300, 200), (30, 60, 120)).save(png, "PNG")          # a non-square logo
        assert c.post(f"{P}/settings/logo", headers=a, files={"file": ("logo.png", png.getvalue(), "image/png")}).status_code == 204
        assert c.get(f"{P}/public/logo").headers["content-type"] == "image/png"
        assert c.post(f"{P}/settings/logo", headers=a, files={"file": ("x.png", b"not an image", "image/png")}).status_code == 422
        assert c.put(f"{P}/settings", headers=a, json={"result_template": "fancy"}).status_code == 422
        for t in ("classic", "modern", "board"):
            r = c.get(f"{P}/settings/result-preview", headers=a, params={"template": t})
            assert r.status_code == 200 and r.content[:4] == b"%PDF" and len(r.content) > 2500, t
        # a student downloads in the design the admin chose
        cls = next(k for k in c.get(f"{P}/classes", headers=a).json() if k["grade"] == "Class 3")
        st = c.post(f"{P}/students", headers=a, json={"first_name": "Pdf", "parent_name": "P", "parent_contact": "9111111111", "class_id": cls["id"]}).json()
        ex = c.post(f"{P}/exams", headers=a, json={"name": "PDF Test Exam", "class_id": cls["id"]}).json()
        c.post(f"{P}/exams/marks/bulk", headers=a, json={"exam_id": ex["id"], "subject": "Arts & Crafts", "max_marks": 50, "records": [{"student_id": st["id"], "marks_obtained": 44.5}]})
        c.patch(f"{P}/exams/{ex['id']}/status", headers=a, json={"status": "published"})
        s = H(c.post(f"{P}/auth/student-login", json={"student_id": st["admission_no"], "password": st["temp_password"]}).json()["access_token"])
        sizes = {}
        for t in ("classic", "modern", "board"):
            assert c.put(f"{P}/settings", headers=a, json={"result_template": t}).json()["result_template"] == t
            r = c.get(f"{P}/portal/results/{ex['id']}/pdf", headers=s)
            assert r.status_code == 200 and r.content[:4] == b"%PDF", t
            sizes[t] = len(r.content)
        assert len(set(sizes.values())) == 3                                                    # three genuinely different layouts
        assert c.delete(f"{P}/settings/logo", headers=a).status_code == 204
        assert c.get(f"{P}/public/logo").status_code == 404
        assert c.get(f"{P}/portal/results/{ex['id']}/pdf", headers=s).status_code == 200        # still works with the fallback badge
        assert c.get(f"{P}/settings/result-preview", headers=s).status_code == 401              # students cannot use the admin preview
