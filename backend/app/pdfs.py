"""Report-card PDFs with the school logo. Built on the server so they look the same on every phone and computer.

Three designs (the admin picks one in Settings -> Result PDF):
  classic - traditional school report card: double border, centred crest, formal black-and-navy table
  modern  - colour header band, photo card, performance bars and big summary tiles
  board   - "Statement of Marks" in the style of board mark-sheets: maroon & gold border, marks in words

To add a design: write one function `_build_<name>(...)` below and add it to TEMPLATES / _BUILDERS."""
from datetime import date
from decimal import Decimal
from io import BytesIO
from reportlab.graphics.shapes import Circle, Drawing, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.platypus import HRFlowable, Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

TEMPLATES = {
    "classic": "Classic school report card",
    "modern": "Modern colour card",
    "board": "Board-style statement of marks",
}
W, H = A4
GRADE_KEY = "A+ 90-100   |   A 80-89   |   B+ 70-79   |   B 60-69   |   C 50-59   |   D 40-49   |   E below 40"

def _safe(text) -> str:
    """The built-in PDF fonts handle English/Latin text. Replace anything else so the file never fails."""
    return str(text or "").encode("latin-1", "replace").decode("latin-1").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def _plain(text) -> str:
    """Same, for plain table cells (no markup escaping)."""
    return str(text or "").encode("latin-1", "replace").decode("latin-1")

_ONES = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen",
         "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

def _words(n: int) -> str:
    if n < 20:
        return _ONES[n]
    if n < 100:
        return _TENS[n // 10] + (" " + _ONES[n % 10] if n % 10 else "")
    if n < 1000:
        return _ONES[n // 100] + " Hundred" + (" " + _words(n % 100) if n % 100 else "")
    return _words(n // 1000) + " Thousand" + (" " + _words(n % 1000) if n % 1000 else "")

def marks_in_words(value) -> str:
    """'88.50' -> 'Eighty Eight Point Five'"""
    d = Decimal(str(value))
    whole = int(d)
    out = _words(whole)
    frac = format(d.normalize(), "f").split(".")[1] if "." in format(d.normalize(), "f") else ""
    return out + (" Point " + " ".join(_ONES[int(c)] for c in frac) if frac else "")

def _num(v) -> str:
    """'88.00' -> '88', '88.50' -> '88.5' (cleaner on a printed card)"""
    d = Decimal(str(v))
    return format(d.normalize(), "f")

def _logo_flowable(logo: bytes | None, size: float, school_name: str, colour):
    """The uploaded logo, or a neat initial-letter badge if none has been uploaded yet."""
    if logo:
        try:
            ir = ImageReader(BytesIO(logo))
            iw, ih = ir.getSize()
            k = size / max(iw, ih)                       # fit inside a size x size box, keep the proportions
            return Image(BytesIO(logo), width=iw * k, height=ih * k)
        except Exception:
            pass
    d = Drawing(size, size)
    d.add(Circle(size / 2, size / 2, size / 2 - 1, fillColor=colour, strokeColor=colour))
    d.add(String(size / 2, size / 2 - size * 0.17, (school_name or "S")[:1].upper(), textAnchor="middle", fontName="Helvetica-Bold",
                 fontSize=size * 0.52, fillColor=colors.white))
    return d

def _draw_logo(c, logo: bytes | None, x, y, size, school_name: str, colour):
    """Same thing, drawn straight on the page canvas (used by the header band of the modern design)."""
    if logo:
        try:
            c.drawImage(ImageReader(BytesIO(logo)), x, y, width=size, height=size, preserveAspectRatio=True, mask="auto")
            return
        except Exception:
            pass
    c.setFillColor(colour)
    c.circle(x + size / 2, y + size / 2, size / 2, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", size * 0.52)
    c.drawCentredString(x + size / 2, y + size * 0.3, (school_name or "S")[:1].upper())

def _photo(photo: bytes | None, w=24 * mm, h=29 * mm):
    if not photo:
        return None
    try:
        return Image(ImageReader(BytesIO(photo)), width=w, height=h)
    except Exception:
        return None

def _contact(school: dict) -> str:
    return "  |  ".join(x for x in [school.get("school_address"), school.get("school_phone"), school.get("school_email")] if x)

def _pairs(student: dict) -> list[tuple[str, str]]:
    return [("Student's name", student["name"]), ("Student ID", student["admission_no"]), ("Class", student["class"]),
            ("Roll no.", student.get("roll_no") or "-"), ("Date of birth", student.get("dob") or "-"),
            ("Father / guardian", student.get("parent_name") or "-")]

def _summary(result: dict, attendance_pct):
    pct = f"{result['percentage']}%" if result.get("percentage") is not None else "-"
    att = f"{attendance_pct}%" if attendance_pct is not None else "-"
    return pct, (result.get("grade") or "-"), att

def _rows(result: dict) -> list[dict]:
    return result["subjects"]

def _pct(sub: dict) -> float:
    try:
        return max(0.0, min(100.0, float(sub["marks_obtained"]) * 100 / float(sub["max_marks"])))
    except Exception:
        return 0.0

def _foot(student, result, style):
    return Paragraph(f"Ref: {_safe(student['admission_no'])}/{result['exam_id']} &nbsp;&middot;&nbsp; Generated on {date.today():%d %b %Y} from the school portal. "
                     f"This is a computer-generated report.", style)

def _sig_row(labels: list[str], navy, total_w=174 * mm):
    n = len(labels)
    t = Table([[""] * n, labels], colWidths=[total_w / n] * n, rowHeights=[20 * mm, None])
    t.setStyle(TableStyle([("LINEABOVE", (0, 1), (-1, 1), .6, navy), ("FONTSIZE", (0, 0), (-1, -1), 9), ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                           ("TEXTCOLOR", (0, 0), (-1, -1), navy), ("LEFTPADDING", (0, 1), (-1, 1), 6), ("RIGHTPADDING", (0, 1), (-1, 1), 6),
                           ("LINEBEFORE", (1, 1), (-1, 1), 12, colors.white)]))
    return t

def _doc(buf, student, school, **margins):
    return SimpleDocTemplate(buf, pagesize=A4, title=f"Report card - {student['name']}", author=school.get("school_name", ""),
                             leftMargin=margins.get("l", 18 * mm), rightMargin=margins.get("r", 18 * mm),
                             topMargin=margins.get("t", 14 * mm), bottomMargin=margins.get("b", 16 * mm))

# ═════════════════════════════ 1. CLASSIC ═══════════════════════════════════
def _build_classic(school, student, result, att, photo, logo) -> bytes:
    NAVY, LINE = colors.HexColor("#1f3a5f"), colors.HexColor("#9aa6b8")
    buf = BytesIO(); doc = _doc(buf, student, school, l=20 * mm, r=20 * mm, t=17 * mm, b=18 * mm)
    ss = getSampleStyleSheet()
    name = ParagraphStyle("n", parent=ss["Title"], fontName="Times-Bold", fontSize=22, textColor=NAVY, leading=26, spaceAfter=2)
    sub = ParagraphStyle("s", parent=ss["Normal"], alignment=TA_CENTER, fontSize=9.5, textColor=colors.HexColor("#444"), leading=13)
    title = ParagraphStyle("t", parent=ss["Normal"], alignment=TA_CENTER, fontName="Times-Bold", fontSize=15, textColor=NAVY, spaceBefore=10, spaceAfter=5, leading=19)
    body = ParagraphStyle("b", parent=ss["Normal"], fontName="Times-Roman", fontSize=11, leading=15)
    small = ParagraphStyle("sm", parent=sub, fontSize=8, textColor=colors.HexColor("#666"))

    def frame(c, _d):
        c.saveState(); c.setStrokeColor(NAVY); c.setLineWidth(1.8); c.rect(9 * mm, 9 * mm, W - 18 * mm, H - 18 * mm)
        c.setLineWidth(.5); c.rect(11.2 * mm, 11.2 * mm, W - 22.4 * mm, H - 22.4 * mm); c.restoreState()

    head = Table([[_logo_flowable(logo, 24 * mm, school.get("school_name"), NAVY),
                   [Paragraph(_safe(school.get("school_name")), name), Paragraph(_safe(_contact(school)), sub)], ""]],
                 colWidths=[28 * mm, 114 * mm, 28 * mm])
    head.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (0, 0), 0)]))
    el = [head, Spacer(1, 4), HRFlowable(width="100%", thickness=1.6, color=NAVY, spaceAfter=2), HRFlowable(width="100%", thickness=.5, color=NAVY),
          Paragraph("REPORT CARD", title), Paragraph(f"{_safe(result['exam']).upper()} &nbsp;|&nbsp; SESSION {_safe(result['academic_year'])}", sub), Spacer(1, 12)]

    p = _pairs(student)
    info = [[Paragraph(f"<b>{a}</b>", body), Paragraph(f": {_safe(b)}", body), Paragraph(f"<b>{c}</b>", body), Paragraph(f": {_safe(d)}", body)]
            for (a, b), (c, d) in zip(p[0::2], p[1::2])]
    left = Table(info, colWidths=[32 * mm, 50 * mm, 32 * mm, 26 * mm] if photo else [34 * mm, 54 * mm, 34 * mm, 48 * mm])
    left.setStyle(TableStyle([("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4), ("LINEBELOW", (0, 0), (-1, -1), .3, LINE)]))
    ph = _photo(photo)
    el.append(Table([[left, ph]], colWidths=[140 * mm, 30 * mm], style=[("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]) if ph else left)
    el.append(Spacer(1, 14))

    data = [["Sl.", "Subject", "Maximum marks", "Marks obtained", "Grade"]]
    data += [[str(i), _plain(s["subject"]), _num(s["max_marks"]), _num(s["marks_obtained"]), s.get("grade") or "-"] for i, s in enumerate(_rows(result), 1)]
    data.append(["", "TOTAL", _num(result["max"]), _num(result["total"]), result.get("grade") or "-"])
    last = len(data) - 1
    tb = Table(data, colWidths=[12 * mm, 62 * mm, 32 * mm, 34 * mm, 30 * mm], repeatRows=1)
    tb.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), NAVY), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTNAME", (0, 0), (-1, 0), "Times-Bold"),
                            ("FONTNAME", (0, 1), (-1, -1), "Times-Roman"), ("FONTNAME", (0, last), (-1, last), "Times-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 11),
                            ("ALIGN", (0, 0), (0, -1), "CENTER"), ("ALIGN", (2, 0), (-1, -1), "CENTER"), ("GRID", (0, 0), (-1, -1), .6, colors.HexColor("#333")),
                            ("BACKGROUND", (0, last), (-1, last), colors.HexColor("#e8edf5")), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    pct, grade, attp = _summary(result, att)
    strip = Table([[Paragraph(f"<b>Percentage :</b> {pct}", body), Paragraph(f"<b>Overall grade :</b> {_safe(grade)}", body), Paragraph(f"<b>Attendance :</b> {attp}", body)]],
                  colWidths=[56 * mm, 56 * mm, 58 * mm])
    strip.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), .8, NAVY), ("INNERGRID", (0, 0), (-1, -1), .3, LINE), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    el += [tb, Spacer(1, 12), strip, Spacer(1, 8), Paragraph(f"Grading scale: {GRADE_KEY}", small), Spacer(1, 26),
           _sig_row(["Class Teacher", "Parent's signature", f"Principal{(' - ' + school['principal_name']) if school.get('principal_name') else ''}"], NAVY, 170 * mm),
           Spacer(1, 14), _foot(student, result, small)]
    doc.build(el, onFirstPage=frame, onLaterPages=frame)
    return buf.getvalue()

# ═════════════════════════════ 2. MODERN ════════════════════════════════════
def _build_modern(school, student, result, att, photo, logo) -> bytes:
    INDIGO, SOFT, INK, LINE = colors.HexColor("#4b43b8"), colors.HexColor("#f3f2fd"), colors.HexColor("#1f2740"), colors.HexColor("#e2e5f0")
    buf = BytesIO(); doc = _doc(buf, student, school, l=18 * mm, r=18 * mm, t=50 * mm, b=16 * mm)
    ss = getSampleStyleSheet()
    body = ParagraphStyle("b", parent=ss["Normal"], fontName="Helvetica", fontSize=10, textColor=INK, leading=14)
    lab = ParagraphStyle("l", parent=body, fontSize=8, textColor=colors.HexColor("#7a829c"), leading=10)
    h = ParagraphStyle("h", parent=ss["Normal"], fontName="Helvetica-Bold", fontSize=19, textColor=INK, leading=23)
    small = ParagraphStyle("sm", parent=body, fontSize=8, textColor=colors.HexColor("#7a829c"), alignment=TA_CENTER)

    def band(c, _d):
        c.saveState(); c.setFillColor(INDIGO); c.rect(0, H - 42 * mm, W, 42 * mm, stroke=0, fill=1)
        c.setFillColor(colors.HexColor("#8f86f5")); c.rect(0, H - 45 * mm, W, 3 * mm, stroke=0, fill=1)
        c.setFillColor(colors.white); c.roundRect(18 * mm, H - 35 * mm, 27 * mm, 27 * mm, 4 * mm, stroke=0, fill=1)
        _draw_logo(c, logo, 20 * mm, H - 33 * mm, 23 * mm, school.get("school_name"), INDIGO)
        c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 20); c.drawString(52 * mm, H - 21 * mm, (school.get("school_name") or "")[:46].encode("latin-1", "replace").decode("latin-1"))
        c.setFont("Helvetica", 8.5); c.setFillColor(colors.HexColor("#dcd9ff"))
        c.drawString(52 * mm, H - 28 * mm, _contact(school)[:100].encode("latin-1", "replace").decode("latin-1")); c.restoreState()

    el = [Table([[Paragraph("Report Card", h), Paragraph(f"<para alignment='right'><font color='#4b43b8'><b>{_safe(result['exam'])}</b></font><br/>"
                                                         f"<font size=9 color='#7a829c'>Academic year {_safe(result['academic_year'])}</font></para>", body)]],
                colWidths=[84 * mm, 90 * mm], style=[("VALIGN", (0, 0), (-1, -1), "BOTTOM"), ("LEFTPADDING", (0, 0), (0, 0), 0), ("RIGHTPADDING", (-1, 0), (-1, 0), 0)]),
          Spacer(1, 10)]
    cells = [[Paragraph(a.upper(), lab), Paragraph(f"<b>{_safe(b)}</b>", body)] for a, b in _pairs(student)]
    grid = Table([[cells[0], cells[1], cells[2]], [cells[3], cells[4], cells[5]]], colWidths=[40 * mm if photo else 52 * mm] * 3)
    grid.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    ph = _photo(photo, 22 * mm, 27 * mm)
    card = Table([[grid, ph or ""]], colWidths=[142 * mm, 28 * mm] if ph else [170 * mm, 0.1 * mm])
    card.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), SOFT), ("BOX", (0, 0), (-1, -1), .6, LINE), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                              ("LEFTPADDING", (0, 0), (-1, -1), 10), ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    el += [card, Spacer(1, 14)]

    def bar(pct):
        d = Drawing(44 * mm, 4 * mm); d.add(Rect(0, 0, 44 * mm, 4 * mm, fillColor=colors.HexColor("#e7e9f3"), strokeColor=None, rx=2, ry=2))
        col = colors.HexColor("#1f9d6e") if pct >= 60 else colors.HexColor("#e0952b") if pct >= 40 else colors.HexColor("#d64560")
        if pct > 0:
            d.add(Rect(0, 0, 44 * mm * pct / 100, 4 * mm, fillColor=col, strokeColor=None, rx=2, ry=2))
        return d
    data = [["SUBJECT", "MAX", "OBTAINED", "GRADE", "PERFORMANCE"]]
    data += [[_plain(s["subject"]), _num(s["max_marks"]), _num(s["marks_obtained"]), s.get("grade") or "-", bar(_pct(s))] for s in _rows(result)]
    data.append(["Total", _num(result["max"]), _num(result["total"]), result.get("grade") or "-", bar(float(result["percentage"] or 0))])
    last = len(data) - 1
    tb = Table(data, colWidths=[56 * mm, 20 * mm, 26 * mm, 20 * mm, 48 * mm], repeatRows=1)
    tb.setStyle(TableStyle([("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, 0), 8), ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#7a829c")),
                            ("LINEBELOW", (0, 0), (-1, 0), 1.2, INDIGO), ("FONTSIZE", (0, 1), (-1, -1), 10.5), ("TEXTCOLOR", (0, 1), (-1, -1), INK),
                            ("FONTNAME", (0, last), (-1, last), "Helvetica-Bold"), ("BACKGROUND", (0, last), (-1, last), SOFT),
                            ("LINEBELOW", (0, 1), (-1, last - 1), .4, LINE), ("ALIGN", (1, 0), (3, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                            ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
    pct, grade, attp = _summary(result, att)
    tile = lambda big, cap: [Paragraph(f"<para alignment='center'><font size=20 color='#4b43b8'><b>{_safe(big)}</b></font><br/><font size=8 color='#7a829c'>{cap}</font></para>", body)]
    tiles = Table([[tile(pct, "PERCENTAGE")[0], tile(grade, "OVERALL GRADE")[0], tile(attp, "ATTENDANCE")[0]]], colWidths=[56 * mm] * 3)
    tiles.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), SOFT), ("BOX", (0, 0), (-1, -1), .6, LINE), ("INNERGRID", (0, 0), (-1, -1), .6, colors.white),
                               ("TOPPADDING", (0, 0), (-1, -1), 10), ("BOTTOMPADDING", (0, 0), (-1, -1), 10)]))
    el += [tb, Spacer(1, 14), tiles, Spacer(1, 6), Paragraph(f"Grading: {GRADE_KEY}", small), Spacer(1, 22),
           _sig_row(["Class Teacher", f"Principal{(' - ' + school['principal_name']) if school.get('principal_name') else ''}"], INK), Spacer(1, 12), _foot(student, result, small)]
    doc.build(el, onFirstPage=band, onLaterPages=band)
    return buf.getvalue()

# ═════════════════════════════ 3. BOARD STYLE ═══════════════════════════════
def _build_board(school, student, result, att, photo, logo) -> bytes:
    MAROON, GOLD = colors.HexColor("#7b1e1e"), colors.HexColor("#b08d3c")
    buf = BytesIO(); doc = _doc(buf, student, school, l=22 * mm, r=22 * mm, t=20 * mm, b=20 * mm)
    ss = getSampleStyleSheet()
    nm = ParagraphStyle("n", parent=ss["Title"], fontName="Times-Bold", fontSize=22, textColor=MAROON, leading=26, spaceAfter=2, wordSpace=1)
    sub = ParagraphStyle("s", parent=ss["Normal"], alignment=TA_CENTER, fontName="Times-Roman", fontSize=10, textColor=colors.HexColor("#444"), leading=13)
    ttl = ParagraphStyle("t", parent=ss["Normal"], alignment=TA_CENTER, fontName="Times-Bold", fontSize=18, textColor=MAROON, spaceBefore=10, spaceAfter=2, leading=22)
    body = ParagraphStyle("b", parent=ss["Normal"], fontName="Times-Roman", fontSize=11.5, leading=19, alignment=TA_JUSTIFY)
    cell = ParagraphStyle("c", parent=body, fontSize=10.5, leading=13, alignment=0)
    small = ParagraphStyle("sm", parent=sub, fontSize=8, textColor=colors.HexColor("#666"))

    def frame(c, _d):
        c.saveState(); c.setStrokeColor(MAROON); c.setLineWidth(2.4); c.rect(9 * mm, 9 * mm, W - 18 * mm, H - 18 * mm)
        c.setStrokeColor(GOLD); c.setLineWidth(.9); c.rect(12 * mm, 12 * mm, W - 24 * mm, H - 24 * mm)
        c.setFillColor(GOLD)
        for x, y in [(12, 12), (W / mm - 12, 12), (12, H / mm - 12), (W / mm - 12, H / mm - 12)]:
            c.rect(x * mm - 1.6 * mm, y * mm - 1.6 * mm, 3.2 * mm, 3.2 * mm, stroke=0, fill=1)
        c.restoreState()

    logo_t = Table([[_logo_flowable(logo, 26 * mm, school.get("school_name"), MAROON)]], colWidths=[166 * mm])
    logo_t.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER")]))
    el = [logo_t, Spacer(1, 4), Paragraph(_safe(school.get("school_name")).upper(), nm), Paragraph(_safe(_contact(school)), sub), Spacer(1, 6),
          HRFlowable(width="100%", thickness=1.6, color=GOLD, spaceAfter=1), HRFlowable(width="100%", thickness=.5, color=MAROON),
          Paragraph("STATEMENT OF MARKS", ttl), Paragraph(f"{_safe(result['exam']).upper()} &nbsp;&middot;&nbsp; SESSION {_safe(result['academic_year'])}", sub), Spacer(1, 12)]
    para = (f"This is to certify that <b>{_safe(student['name']).upper()}</b>, ward of <b>{_safe(student.get('parent_name') or '-')}</b>, "
            f"Student ID <b>{_safe(student['admission_no'])}</b>, Roll No. <b>{_safe(student.get('roll_no') or '-')}</b>, of <b>{_safe(student['class'])}</b>"
            f"{', born on <b>' + _safe(student['dob']) + '</b>' if student.get('dob') else ''}, appeared in the <b>{_safe(result['exam'])}</b> "
            f"for the academic session <b>{_safe(result['academic_year'])}</b> and secured the marks given below.")
    ph = _photo(photo, 24 * mm, 29 * mm)
    el.append(Table([[Paragraph(para, body), ph]], colWidths=[138 * mm, 28 * mm], style=[("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]) if ph else Paragraph(para, body))
    el.append(Spacer(1, 12))
    data = [["Sl.", "Subject", "Max.", "Marks obtained", "Marks in words", "Grade"]]
    data += [[str(i), Paragraph(_safe(s["subject"]), cell), _num(s["max_marks"]), _num(s["marks_obtained"]), Paragraph(marks_in_words(s["marks_obtained"]), cell), s.get("grade") or "-"]
             for i, s in enumerate(_rows(result), 1)]
    data.append(["", Paragraph("<b>TOTAL</b>", cell), _num(result["max"]), _num(result["total"]), Paragraph(f"<b>{marks_in_words(result['total'])}</b>", cell), result.get("grade") or "-"])
    last = len(data) - 1
    tb = Table(data, colWidths=[10 * mm, 36 * mm, 16 * mm, 30 * mm, 54 * mm, 20 * mm], repeatRows=1)
    tb.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), MAROON), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTNAME", (0, 0), (-1, 0), "Times-Bold"),
                            ("FONTNAME", (0, 1), (-1, -1), "Times-Roman"), ("FONTNAME", (0, last), (-1, last), "Times-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 10.5),
                            ("ALIGN", (0, 0), (0, -1), "CENTER"), ("ALIGN", (2, 0), (3, -1), "CENTER"), ("ALIGN", (5, 0), (5, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                            ("GRID", (0, 0), (-1, -1), .6, GOLD), ("BOX", (0, 0), (-1, -1), 1.2, MAROON), ("BACKGROUND", (0, last), (-1, last), colors.HexColor("#f6efe0")),
                            ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    pct, grade, attp = _summary(result, att)
    res = Table([[Paragraph(f"<b>Percentage:</b> {pct}", cell), Paragraph(f"<b>Overall grade:</b> {_safe(grade)}", cell), Paragraph(f"<b>Attendance:</b> {attp}", cell)]],
                colWidths=[55 * mm] * 3)
    res.setStyle(TableStyle([("BOX", (0, 0), (-1, -1), .8, MAROON), ("LINEBEFORE", (1, 0), (-1, -1), .4, GOLD), ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    el += [tb, Spacer(1, 12), res, Spacer(1, 8), Paragraph(f"Grading scale: {GRADE_KEY}", small), Spacer(1, 10),
           Paragraph(f"Date of issue: {date.today():%d %B %Y}", ParagraphStyle("d", parent=cell, fontSize=10)), Spacer(1, 4),
           _sig_row(["Class Teacher", f"Principal{(' - ' + school['principal_name']) if school.get('principal_name') else ''}"], MAROON, 166 * mm), Spacer(1, 12), _foot(student, result, small)]
    doc.build(el, onFirstPage=frame, onLaterPages=frame)
    return buf.getvalue()

_BUILDERS = {"classic": _build_classic, "modern": _build_modern, "board": _build_board}

def report_card_pdf(school: dict, student: dict, result: dict, attendance_pct: float | None, photo: bytes | None = None,
                    logo: bytes | None = None, template: str = "classic") -> bytes:
    return _BUILDERS.get(template, _build_classic)(school, student, result, attendance_pct, photo, logo)

def sample_pdf(school: dict, template: str, logo: bytes | None = None) -> bytes:
    """A made-up example (clearly marked SAMPLE) so the admin can compare the designs before choosing one."""
    subs = [("English", 100, 86), ("Hindi", 100, 91), ("Mathematics", 100, 78), ("Science", 100, 84), ("Social Science", 100, 73), ("Computer", 50, 46)]
    rows = []
    from app.services import grade_for
    for n, mx, ob in subs:
        rows.append({"subject": n, "max_marks": str(mx), "marks_obtained": str(ob), "remarks": None, "grade": grade_for(ob * 100 / mx)})
    total, mx = sum(o for _, _, o in subs), sum(m for _, m, _ in subs)
    pct = round(total * 100 / mx, 1)
    res = {"exam_id": 0, "exam": "Half Yearly Examination (SAMPLE)", "academic_year": "2026-2027", "subjects": rows, "total": str(total), "max": str(mx),
           "percentage": pct, "grade": grade_for(pct)}
    stu = {"name": "Sample Student", "admission_no": "SHS-2026-0000", "class": "Class 9-A", "roll_no": "12", "parent_name": "Sample Parent", "dob": "05 Mar 2012"}
    return report_card_pdf(school, stu, res, 94.5, None, logo, template)
