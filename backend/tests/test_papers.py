"""Question paper -> AI answer key -> question marks -> analysis. Gemini is replaced by fakes, so no key or internet is needed."""
import os, tempfile
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ["BOOTSTRAP_ADMIN_EMAIL"] = "admin@test.com"
os.environ["BOOTSTRAP_ADMIN_PASSWORD"] = "AdminPass123"
from fastapi.testclient import TestClient
from app import ai
from app.main import app

P = "/api/v1"
def H(t): return {"Authorization": f"Bearer {t}"}

def test_paper_flow(monkeypatch):
    monkeypatch.setattr(ai.settings, "gemini_api_key", "fake")
    monkeypatch.setattr(ai, "extract_questions", lambda pdf, subj, cls: [
        {"number": "1", "text": "Define photosynthesis", "marks": 2.0, "topic": "Photosynthesis", "keywords": "chlorophyll, light"},
        {"number": "2", "text": "Name the powerhouse of the cell", "marks": 1.0, "topic": "Cell", "keywords": "mitochondria"}])
    monkeypatch.setattr(ai, "generate_answer", lambda text, marks, words, kw, subj, cls: f"MODEL ANSWER to: {text}")
    monkeypatch.setattr(ai, "summarize_student", lambda payload: {"headline": "Good effort", "strengths": ["Cell"], "weak_areas": [], "study_plan": [], "encouragement": "Keep going"})
    with TestClient(app) as c:
        a = H(c.post(f"{P}/auth/login", json={"email": "admin@test.com", "password": "AdminPass123"}).json()["access_token"])
        k = c.post(f"{P}/classes", headers=a, json={"grade": "Class 8", "section": "P", "academic_year": "2026-2027"}).json()
        c.post(f"{P}/teaching/class-subjects", headers=a, json={"subject_name": "Science", "class_ids": [k["id"]]})
        sub = [s for s in c.get(f"{P}/teaching/subjects", headers=a).json() if s["name"] == "Science"][0]
        ex = c.post(f"{P}/exams", headers=a, json={"name": "Half Yearly", "academic_year": "2026-2027", "class_id": k["id"]}).json()
        s = c.post(f"{P}/students", headers=a, json={"first_name": "Riya", "parent_name": "P", "parent_contact": "9000000022", "class_id": k["id"]}).json()
        st = H(c.post(f"{P}/auth/student-login", json={"student_id": s["admission_no"], "password": s["temp_password"]}).json()["access_token"])

        opts = c.get(f"{P}/papers/options", headers=a).json()
        assert any(x["subject"] == "Science" for x in opts["choices"])
        bad = c.post(f"{P}/papers", headers=a, data={"exam_id": ex["id"], "class_id": k["id"], "subject_id": sub["id"]}, files={"file": ("x.pdf", b"not a pdf", "application/pdf")})
        assert bad.status_code == 422
        r = c.post(f"{P}/papers", headers=a, data={"exam_id": ex["id"], "class_id": k["id"], "subject_id": sub["id"]}, files={"file": ("paper.pdf", b"%PDF-1.4 fake", "application/pdf")})
        assert r.status_code == 201
        paper = c.get(f"{P}/papers/{r.json()['id']}", headers=a).json()
        assert paper["gen_status"] == "idle" and len(paper["questions"]) == 2 and paper["questions"][0]["word_limit"] == 50
        assert c.post(f"{P}/papers", headers=a, data={"exam_id": ex["id"], "class_id": k["id"], "subject_id": sub["id"]}, files={"file": ("p.pdf", b"%PDF-1", "application/pdf")}).status_code == 409

        q1, q2 = paper["questions"]
        assert c.patch(f"{P}/papers/questions/{q1['id']}", headers=a, json={"marks": 5, "word_limit": 150, "keywords": "chlorophyll, sunlight, glucose"}).json()["marks"] == 5
        assert c.post(f"{P}/papers/{paper['id']}/publish", headers=a).status_code == 422             # no answers yet
        assert c.post(f"{P}/papers/{paper['id']}/generate", headers=a).status_code == 200
        paper = c.get(f"{P}/papers/{paper['id']}", headers=a).json()
        assert paper["gen_status"] == "done" and paper["answered"] == 2
        assert c.get(f"{P}/portal/answer-keys", headers=st).json() == []                                # not published yet
        c.patch(f"{P}/papers/questions/{q2['id']}", headers=a, json={"answer": "Mitochondria (teacher edit)"})
        assert c.post(f"{P}/papers/{paper['id']}/publish", headers=a).json()["status"] == "published"
        keys = c.get(f"{P}/portal/answer-keys", headers=st).json()
        key = c.get(f"{P}/portal/answer-keys/{keys[0]['paper_id']}", headers=st).json()
        assert key["questions"][1]["answer"].startswith("Mitochondria") and key["questions"][0]["keywords"][0] == "chlorophyll"

        # marks per question; marks above the maximum are refused; totals flow into the normal marks sheet
        grid = c.get(f"{P}/papers/{paper['id']}/marks", headers=a).json()
        assert len(grid["students"]) == 1
        assert c.put(f"{P}/papers/{paper['id']}/marks", headers=a, json={"records": [{"student_id": s["id"], "question_id": q1["id"], "marks": 9}]}).status_code == 422
        assert c.put(f"{P}/papers/{paper['id']}/marks", headers=a, json={"records": [{"student_id": s["id"], "question_id": q1["id"], "marks": 2}, {"student_id": s["id"], "question_id": q2["id"], "marks": 1}]}).status_code == 200
        assert c.get(f"{P}/portal/analysis", headers=st).json()["has_data"] is False                    # exam not published -> nothing shown
        c.patch(f"{P}/exams/{ex['id']}/status", headers=a, json={"status": "published"})
        an = c.get(f"{P}/portal/analysis", headers=st).json()
        assert an["has_data"] and {t["topic"] for t in an["topics"]} == {"Photosynthesis", "Cell"} and an["summary"] is None
        sm = c.post(f"{P}/portal/analysis/summary", headers=st).json()
        assert sm["summary"]["headline"] == "Good effort"
        assert c.get(f"{P}/portal/results", headers=st).json()[0]["subjects"][0]["marks_obtained"] in ("3", "3.00")
        cl = c.get(f"{P}/insights/class/{k['id']}", headers=a).json()
        assert cl["with_data"] == 1 and cl["average"] == 50.0
        assert c.get(f"{P}/insights/student/{s['id']}", headers=a).json()["summary"]["headline"] == "Good effort"
        assert c.get(f"{P}/papers", headers=st).status_code == 401                                      # students cannot use staff endpoints
