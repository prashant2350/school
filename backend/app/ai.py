"""Google Gemini helper. Every AI feature goes through here, so the API key stays on the server.

Uses plain HTTPS (no extra package). Set GEMINI_API_KEY (and optionally GEMINI_MODEL) in backend/.env.
Student privacy: prompts only ever contain question text, topics and marks - never names, photos or phone numbers.
"""
import base64
import json
import re
import time
import urllib.error
import urllib.request
from app.config import settings

class AIError(Exception):
    """Something went wrong talking to Gemini. The message is safe to show to the teacher."""

def default_words(marks: float) -> int:
    """Suggested answer length for a question of this many marks (the teacher can change it)."""
    return {1: 25, 2: 50, 3: 80, 4: 120, 5: 150}.get(int(round(marks)), max(25, int(marks * 28)))

def _call(parts: list[dict], system: str | None = None, temperature: float = 0.3, json_out: bool = True, timeout: int = 180) -> str:
    if not settings.gemini_api_key:
        raise AIError("Gemini is not set up. Put GEMINI_API_KEY=your-key in backend/.env and restart the server.")
    body: dict = {"contents": [{"role": "user", "parts": parts}], "generationConfig": {"temperature": temperature}}
    if json_out:
        body["generationConfig"]["responseMimeType"] = "application/json"
    if system:
        body["systemInstruction"] = {"parts": [{"text": system}]}
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent"
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "x-goog-api-key": settings.gemini_api_key})
    last = "unknown error"
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = json.loads(r.read())
            cands = data.get("candidates") or []
            if not cands:
                raise AIError("Gemini returned no answer (the content may have been blocked). Try again.")
            text = "".join(p.get("text", "") for p in cands[0].get("content", {}).get("parts", []))
            if not text.strip():
                raise AIError("Gemini returned an empty answer. Try again.")
            return text
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = json.loads(e.read()).get("error", {}).get("message", "")
            except Exception:
                pass
            last = f"Gemini error {e.code}: {detail or e.reason}"
            if e.code in (429, 500, 503) and attempt < 2:
                time.sleep(2 * (attempt + 1) ** 2)       # 2s, 8s
                continue
            if e.code in (400, 403) and "API key" in detail:
                last = "Gemini rejected the API key. Check GEMINI_API_KEY in backend/.env."
            raise AIError(last)
        except (urllib.error.URLError, TimeoutError) as e:
            last = f"Could not reach Gemini ({getattr(e, 'reason', e)}). Check the internet connection."
            if attempt < 2:
                time.sleep(2)
                continue
            raise AIError(last)
    raise AIError(last)

def _json(text: str):
    t = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        raise AIError("Gemini's reply could not be read. Please try again.")

# ── 1. read a question paper PDF ─────────────────────────────────────────────
def extract_questions(pdf: bytes, subject: str, class_label: str) -> list[dict]:
    prompt = f"""This PDF is a school question paper for Class {class_label}, subject: {subject}.
List EVERY question in order. If a question has parts (a), (b) make each part its own item (number like "5a").
Return a JSON array. Each item: {{"number": "1", "text": "full question text, including options for MCQs", "marks": <number, read from the paper; if not printed use your best guess>,
"topic": "the specific chapter/topic this tests, 2-4 words", "keywords": ["3-6 key terms a correct answer must contain"]}}.
Do not answer the questions. Do not invent questions that are not in the paper."""
    out = _json(_call([{"inline_data": {"mime_type": "application/pdf", "data": base64.b64encode(pdf).decode()}}, {"text": prompt}], temperature=0.1))
    items = out if isinstance(out, list) else out.get("questions", []) if isinstance(out, dict) else []
    res = []
    for i, q in enumerate(items, 1):
        if not isinstance(q, dict) or not str(q.get("text", "")).strip():
            continue
        try:
            marks = float(q.get("marks") or 1)
        except (TypeError, ValueError):
            marks = 1.0
        kws = q.get("keywords") or []
        res.append({"number": str(q.get("number") or i)[:12], "text": str(q["text"]).strip(), "marks": max(marks, 0.5),
                    "topic": str(q.get("topic") or "")[:120], "keywords": ", ".join(str(k) for k in kws) if isinstance(kws, list) else str(kws)})
    if not res:
        raise AIError("No questions could be found in this PDF. Is it a clear question paper? You can also add questions by hand.")
    return res

# ── 2. model answer for one question ─────────────────────────────────────────
def generate_answer(text: str, marks: float, words: int, keywords: str, subject: str, class_label: str) -> str:
    kw = f"Make sure the answer naturally uses these keywords: {keywords}." if keywords.strip() else ""
    prompt = f"""You are an experienced {subject} teacher writing the model answer key for Class {class_label} students (CBSE/UP Board style).
Question ({marks:g} marks): {text}

Write the model answer in about {words} words. {kw}
Rules: if it is an objective question (MCQ, fill in the blank, true/false, one word) give just the correct answer and one line of reason.
For maths/science show the working step by step. Use simple language a student of this class understands.
Do not mention that you are an AI. Return JSON: {{"answer": "..."}}"""
    out = _json(_call([{"text": prompt}], temperature=0.3))
    ans = out.get("answer") if isinstance(out, dict) else None
    if not ans or not str(ans).strip():
        raise AIError("Gemini gave no answer for this question.")
    return str(ans).strip()

# ── 3. performance summaries (numbers in, words out) ─────────────────────────
def summarize_student(payload: dict) -> dict:
    prompt = f"""You are a kind, encouraging school mentor. Below are a student's marks by topic (pct = percent scored, class_pct = class average for the same topic)
and the trend across exams. Write a short, honest summary for the STUDENT (age 8-17) in simple English.
Return JSON: {{"headline": "one friendly sentence", "strengths": ["2-3 short points naming topics"],
"weak_areas": [{{"topic": "...", "advice": "one practical tip"}}], "study_plan": ["3 specific things to do this week"], "encouragement": "one warm sentence"}}.
Only mention topics that appear in the data. Do not invent marks.
DATA: {json.dumps(payload)}"""
    out = _json(_call([{"text": prompt}], temperature=0.4))
    if not isinstance(out, dict):
        raise AIError("Could not read Gemini's summary. Try again.")
    return out

def summarize_class(payload: dict) -> dict:
    prompt = f"""You advise a school principal. Below is a class's performance by subject and topic (pct = class average percent) and the number of students at risk.
Return JSON: {{"headline": "one sentence", "observations": ["3-4 plain observations with topic names and numbers"],
"actions": ["3-4 concrete actions for teachers, e.g. revision class on X"]}}. Use only the data given.
DATA: {json.dumps(payload)}"""
    out = _json(_call([{"text": prompt}], temperature=0.3))
    if not isinstance(out, dict):
        raise AIError("Could not read Gemini's summary. Try again.")
    return out
