from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import (
    Boolean, Date, DateTime, Float, ForeignKey, Integer, LargeBinary, Numeric, String, Text,
    UniqueConstraint, func
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(160))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="teacher", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    # Faculty login ID (e.g. SHS-T-001). Staff can sign in with this OR their email.
    employee_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    designation: Mapped[str | None] = mapped_column(String(80), nullable=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)

class SchoolClass(Base):
    __tablename__ = "classes"
    __table_args__ = (UniqueConstraint("grade", "section", "academic_year", name="uq_class_section_year"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    grade: Mapped[str] = mapped_column(String(40), index=True)
    section: Mapped[str] = mapped_column(String(10), default="A")
    academic_year: Mapped[str] = mapped_column(String(20), default="2026-2027")
    class_teacher_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    students: Mapped[list["Student"]] = relationship(back_populates="school_class")

class Student(Base):
    __tablename__ = "students"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    admission_no: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    first_name: Mapped[str] = mapped_column(String(80), index=True)
    last_name: Mapped[str] = mapped_column(String(80), default="")
    dob: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    parent_name: Mapped[str] = mapped_column(String(160))
    parent_contact: Mapped[str] = mapped_column(String(20), index=True)
    parent_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    class_id: Mapped[int | None] = mapped_column(ForeignKey("classes.id"), nullable=True, index=True)
    roll_no: Mapped[str | None] = mapped_column(String(20), nullable=True)
    mother_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    blood_group: Mapped[str | None] = mapped_column(String(10), nullable=True)
    previous_school: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Self-service profile (student can edit these from the portal)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    bio: Mapped[str | None] = mapped_column(String(300), nullable=True)
    theme: Mapped[str] = mapped_column(String(20), default="purple")
    photo: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True, deferred=True)
    photo_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # Student-portal login: admission_no + password. Hash only, never the password itself.
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=True)
    # active | passed_out | left
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    enrollment_date: Mapped[date] = mapped_column(Date, default=date.today)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    school_class: Mapped[SchoolClass | None] = relationship(back_populates="students")
    fee_transactions: Mapped[list["FeeTransaction"]] = relationship(back_populates="student")

class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (UniqueConstraint("student_id", "attendance_date", name="uq_attendance_student_day"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    class_id: Mapped[int | None] = mapped_column(ForeignKey("classes.id"), nullable=True)
    attendance_date: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(20))
    marked_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    remarks: Mapped[str | None] = mapped_column(String(255), nullable=True)

class FeeHead(Base):
    __tablename__ = "fee_heads"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

class StudentFeeDue(Base):
    __tablename__ = "student_fee_dues"
    __table_args__ = (UniqueConstraint("student_id", "fee_head_id", "period", name="uq_student_fee_period"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    fee_head_id: Mapped[int] = mapped_column(ForeignKey("fee_heads.id"))
    period: Mapped[str] = mapped_column(String(30), index=True)  # e.g. 2026-10 or Term 1
    amount_due: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    discount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"))
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

class FeeTransaction(Base):
    __tablename__ = "fee_transactions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    receipt_no: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    discount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0.00"))
    payment_mode: Mapped[str] = mapped_column(String(30))
    reference_note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    collected_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    student: Mapped[Student] = relationship(back_populates="fee_transactions")

class Exam(Base):
    __tablename__ = "examinations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    academic_year: Mapped[str] = mapped_column(String(20), default="2026-2027")
    class_id: Mapped[int | None] = mapped_column(ForeignKey("classes.id"), nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # open = faculty can enter marks, students cannot see them;  published = locked, visible to students
    status: Mapped[str] = mapped_column(String(20), default="open")

class ExamMark(Base):
    __tablename__ = "exam_marks"
    __table_args__ = (UniqueConstraint("exam_id", "student_id", "subject", name="uq_exam_student_subject"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("examinations.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    subject: Mapped[str] = mapped_column(String(100))
    max_marks: Mapped[Decimal] = mapped_column(Numeric(7, 2))
    marks_obtained: Mapped[Decimal] = mapped_column(Numeric(7, 2))
    remarks: Mapped[str | None] = mapped_column(String(255), nullable=True)
    subject_id: Mapped[int | None] = mapped_column(ForeignKey("subjects.id"), nullable=True)
    entered_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)

class Notice(Base):
    __tablename__ = "notices"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(180))
    body: Mapped[str] = mapped_column(Text)
    audience: Mapped[str] = mapped_column(String(30), default="all")
    published: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AcademicYear(Base):
    __tablename__ = "academic_years"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(20), unique=True)  # e.g. 2026-2027
    is_current: Mapped[bool] = mapped_column(Boolean, default=False)

class Enrollment(Base):
    """One row per student per academic year: the class history of a student."""
    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("student_id", "academic_year", name="uq_enrollment_student_year"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    academic_year: Mapped[str] = mapped_column(String(20), index=True)
    class_id: Mapped[int | None] = mapped_column(ForeignKey("classes.id"), nullable=True)
    roll_no: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # studying | promoted | repeated | passed_out | left
    result: Mapped[str] = mapped_column(String(20), default="studying")

class AdmissionApplication(Base):
    __tablename__ = "admission_applications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    academic_year: Mapped[str] = mapped_column(String(20), index=True)
    applicant_name: Mapped[str] = mapped_column(String(160))
    dob: Mapped[date | None] = mapped_column(Date, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    applying_grade: Mapped[str] = mapped_column(String(40))
    parent_name: Mapped[str] = mapped_column(String(160))
    parent_contact: Mapped[str] = mapped_column(String(20))
    parent_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    previous_school: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # pending | approved | rejected
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    remarks: Mapped[str | None] = mapped_column(String(255), nullable=True)
    student_id: Mapped[int | None] = mapped_column(ForeignKey("students.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class Setting(Base):
    """Simple key/value store for school profile (name, address, phone, logo text...)."""
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")


# ── Faculty / teaching ───────────────────────────────────────────────────────
class Subject(Base):
    __tablename__ = "subjects"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    code: Mapped[str | None] = mapped_column(String(20), nullable=True)

class TeachingAssignment(Base):
    """Which teacher teaches which subject to which class. Drives the faculty portal,
    the student's 'My teachers' page and who is allowed to upload marks."""
    __tablename__ = "teaching_assignments"
    __table_args__ = (UniqueConstraint("class_id", "subject_id", name="uq_class_subject"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id"), index=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))

class ClassSubject(Base):
    """A subject that a class studies (set by the admin). The teacher is chosen separately in TeachingAssignment,
    so a subject can exist for a class before any teacher is assigned."""
    __tablename__ = "class_subjects"
    __table_args__ = (UniqueConstraint("class_id", "subject_id", name="uq_class_subject_list"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id"), index=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"), index=True)

class TimetableSlot(Base):
    """One cell of a class timetable. weekday: 0=Monday ... 5=Saturday."""
    __tablename__ = "timetable_slots"
    __table_args__ = (UniqueConstraint("class_id", "weekday", "period_no", name="uq_slot"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id"), index=True)
    weekday: Mapped[int] = mapped_column(Integer)
    period_no: Mapped[int] = mapped_column(Integer)
    assignment_id: Mapped[int] = mapped_column(ForeignKey("teaching_assignments.id"))

class StaffAttendance(Base):
    """A faculty member's own attendance - one row per person per day."""
    __tablename__ = "staff_attendance"
    __table_args__ = (UniqueConstraint("user_id", "attendance_date", name="uq_staff_day"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    attendance_date: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(20), default="present")   # present | half_day | leave | absent
    marked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    marked_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)  # set when the admin edits it


# ── School transport ─────────────────────────────────────────────────────────
class Driver(Base):
    __tablename__ = "drivers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(160))
    phone: Mapped[str] = mapped_column(String(20))
    license_no: Mapped[str] = mapped_column(String(40), index=True)
    license_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True, deferred=True)
    photo_type: Mapped[str | None] = mapped_column(String(30), nullable=True)
    photo_version: Mapped[int] = mapped_column(Integer, default=0)     # bumped on every upload so browsers refetch
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class Bus(Base):
    __tablename__ = "buses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    number: Mapped[str] = mapped_column(String(30), unique=True, index=True)       # what parents see, e.g. "07"
    registration_no: Mapped[str | None] = mapped_column(String(30), nullable=True)  # number plate
    capacity: Mapped[int] = mapped_column(Integer, default=40)
    route_name: Mapped[str] = mapped_column(String(160), default="")
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("drivers.id"), nullable=True)
    school_arrival_time: Mapped[str | None] = mapped_column(String(5), nullable=True)    # "HH:MM" - reaches school
    school_departure_time: Mapped[str | None] = mapped_column(String(5), nullable=True)  # "HH:MM" - leaves school
    gps_device_id: Mapped[str | None] = mapped_column(String(60), nullable=True)         # reserved for the future GPS tracker
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

class BusStop(Base):
    """A pickup point on a bus's route. pickup_time = estimated arrival at the stop in the morning,
    drop_time = estimated arrival back at the stop in the afternoon."""
    __tablename__ = "bus_stops"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bus_id: Mapped[int] = mapped_column(ForeignKey("buses.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    sequence: Mapped[int] = mapped_column(Integer, default=1)
    pickup_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    drop_time: Mapped[str | None] = mapped_column(String(5), nullable=True)

class StudentTransport(Base):
    """A student's bus choice for ONE academic year. A new year (after promotion) has no row yet,
    so the student is asked again. locked = the school office set it; the student can no longer change it."""
    __tablename__ = "student_transport"
    __table_args__ = (UniqueConstraint("student_id", "academic_year", name="uq_transport_student_year"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    academic_year: Mapped[str] = mapped_column(String(20), index=True)
    uses_bus: Mapped[bool] = mapped_column(Boolean, default=True)
    pickup_location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stop_id: Mapped[int | None] = mapped_column(ForeignKey("bus_stops.id"), nullable=True)
    bus_id: Mapped[int | None] = mapped_column(ForeignKey("buses.id"), nullable=True, index=True)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    locked: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


# ── Public photo gallery ─────────────────────────────────────────────────────
class GalleryPhoto(Base):
    __tablename__ = "gallery_photos"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(160), default="")
    category: Mapped[str] = mapped_column(String(40), default="Campus", index=True)
    image: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)
    thumb: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ── Question papers, AI answer keys, question-wise marks ────────────────────
class ExamPaper(Base):
    """The question paper a teacher uploads for ONE exam + class + subject."""
    __tablename__ = "exam_papers"
    __table_args__ = (UniqueConstraint("exam_id", "class_id", "subject_id", name="uq_paper_exam_class_subject"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    exam_id: Mapped[int] = mapped_column(ForeignKey("examinations.id"), index=True)
    class_id: Mapped[int] = mapped_column(ForeignKey("classes.id"), index=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))
    teacher_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    pdf: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True, deferred=True)
    pdf_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")        # draft | published (answer key visible to students)
    gen_status: Mapped[str] = mapped_column(String(20), default="idle")     # idle | extracting | generating | done | error
    gen_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class PaperQuestion(Base):
    __tablename__ = "paper_questions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    paper_id: Mapped[int] = mapped_column(ForeignKey("exam_papers.id"), index=True)
    sort: Mapped[int] = mapped_column(Integer, default=0)
    number: Mapped[str] = mapped_column(String(12), default="")
    text: Mapped[str] = mapped_column(Text)
    marks: Mapped[float] = mapped_column(Float, default=1)
    word_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    keywords: Mapped[str] = mapped_column(Text, default="")              # comma separated
    topic: Mapped[str] = mapped_column(String(120), default="")
    ai_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)      # teacher-edited answer; shown to students instead of ai_answer
    ai_status: Mapped[str] = mapped_column(String(12), default="pending")  # pending | done | error

class QuestionMark(Base):
    """Marks one student got on one question - the raw data behind the performance analysis."""
    __tablename__ = "question_marks"
    __table_args__ = (UniqueConstraint("question_id", "student_id", name="uq_qmark"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    question_id: Mapped[int] = mapped_column(ForeignKey("paper_questions.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), index=True)
    marks: Mapped[float] = mapped_column(Float, default=0)

class StudentInsight(Base):
    """Cached AI summary for a student. signature changes whenever new question marks arrive, which makes the summary stale."""
    __tablename__ = "student_insights"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("students.id"), unique=True, index=True)
    signature: Mapped[str] = mapped_column(String(60))
    summary: Mapped[str] = mapped_column(Text)       # JSON
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
