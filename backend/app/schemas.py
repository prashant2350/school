from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, EmailStr, Field

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    email: str
    role: str
    is_active: bool
    employee_id: str | None = None
    designation: str | None = None
    must_change_password: bool = False

class LoginIn(BaseModel):
    email: str = Field(min_length=1)   # an email address OR a faculty Employee ID (e.g. SHS-T-001)
    password: str = Field(min_length=1)

class StudentBase(BaseModel):
    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = ""
    dob: date | None = None
    gender: str | None = None
    address: str | None = None
    parent_name: str = Field(min_length=1, max_length=160)
    parent_contact: str = Field(min_length=7, max_length=20)
    parent_email: EmailStr | None = None
    class_id: int | None = None
    roll_no: str | None = None
    mother_name: str | None = None
    blood_group: str | None = None
    previous_school: str | None = None
    enrollment_date: date = Field(default_factory=date.today)
    is_active: bool = True

class StudentCreate(StudentBase):
    admission_no: str | None = Field(default=None, max_length=40)  # leave empty to auto-generate
class StudentUpdate(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    dob: date | None = None
    gender: str | None = None
    address: str | None = None
    parent_name: str | None = None
    parent_contact: str | None = None
    parent_email: EmailStr | None = None
    class_id: int | None = None
    roll_no: str | None = None
    mother_name: str | None = None
    blood_group: str | None = None
    previous_school: str | None = None
    is_active: bool | None = None

class StudentOut(StudentBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    admission_no: str
    status: str = "active"
    must_change_password: bool = True
    created_at: datetime

class StudentCreated(StudentOut):
    temp_password: str | None = None  # shown ONCE; only the hash is stored

class ClassCreate(BaseModel):
    grade: str
    section: str = "A"
    academic_year: str = "2026-2027"
    class_teacher_id: int | None = None
class ClassOut(ClassCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    class_teacher_name: str | None = None
class ClassUpdate(BaseModel):
    class_teacher_id: int | None = None

class AttendanceIn(BaseModel):
    student_id: int
    attendance_date: date = Field(default_factory=date.today)
    status: str
    remarks: str | None = None
class AttendanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    student_id: int
    class_id: int | None
    attendance_date: date
    status: str
    marked_by: int
    remarks: str | None

class FeeHeadCreate(BaseModel):
    name: str
    description: str | None = None
class FeeHeadOut(FeeHeadCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_active: bool

class FeeDueCreate(BaseModel):
    student_id: int
    fee_head_id: int
    period: str
    amount_due: Decimal = Field(gt=0)
    discount: Decimal = Field(default=Decimal("0.00"), ge=0)
    due_date: date | None = None
class FeeDueOut(FeeDueCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_active: bool

class FeePaymentIn(BaseModel):
    student_id: int
    amount_paid: Decimal = Field(gt=0)
    discount: Decimal = Field(default=Decimal("0.00"), ge=0)
    payment_mode: str
    reference_note: str | None = None
class FeeTransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    student_name: str | None = None
    admission_no: str | None = None
    collected_by_name: str | None = None
    receipt_no: str
    student_id: int
    amount_paid: Decimal
    discount: Decimal
    payment_mode: str
    reference_note: str | None
    collected_by: int
    paid_at: datetime

class NoticeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    body: str = Field(min_length=1)
    audience: str = "all"
    published: bool = False
class NoticeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    body: str
    audience: str
    published: bool
    created_by: int
    created_at: datetime

class ExamCreate(BaseModel):
    name: str
    academic_year: str = "2026-2027"
    class_id: int | None = None
    start_date: date | None = None
    end_date: date | None = None
class ExamOut(ExamCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    status: str = "open"
class ExamStatusIn(BaseModel):
    status: str   # draft | open | published
class MarkCreate(BaseModel):
    exam_id: int
    student_id: int
    subject: str
    max_marks: Decimal = Field(gt=0)
    marks_obtained: Decimal = Field(ge=0)
    remarks: str | None = None
class MarkOut(MarkCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int


class StudentLoginIn(BaseModel):
    student_id: str = Field(min_length=1)   # the admission number, e.g. SHS-2026-0001
    password: str = Field(min_length=1)

class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=100)

class StaffCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    email: EmailStr | None = None            # optional for faculty who sign in with their Employee ID
    phone_number: str | None = None
    role: str = "teacher"
    employee_id: str | None = Field(default=None, max_length=40)   # blank = auto (SHS-T-001...) for teachers
    designation: str | None = Field(default=None, max_length=80)
    password: str | None = Field(default=None, min_length=8, max_length=100)   # blank = auto-generate a temporary one
class StaffUpdate(BaseModel):
    full_name: str | None = None
    phone_number: str | None = None
    role: str | None = None
    is_active: bool | None = None
    designation: str | None = None
class StaffOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    email: str
    phone_number: str | None
    role: str
    is_active: bool
    employee_id: str | None = None
    designation: str | None = None
class StaffCreated(StaffOut):
    temp_password: str | None = None   # shown ONCE
class ResetPasswordIn(BaseModel):
    new_password: str | None = Field(default=None, min_length=8, max_length=100)   # blank = auto-generate

class AdmissionCreate(BaseModel):
    academic_year: str | None = None
    applicant_name: str = Field(min_length=2, max_length=160)
    dob: date | None = None
    gender: str | None = None
    applying_grade: str
    parent_name: str = Field(min_length=1, max_length=160)
    parent_contact: str = Field(min_length=7, max_length=20)
    parent_email: EmailStr | None = None
    address: str | None = None
    previous_school: str | None = None
class PublicApply(BaseModel):
    applicant_name: str = Field(min_length=2, max_length=160)
    dob: date | None = None
    gender: str | None = None
    applying_grade: str
    parent_name: str = Field(min_length=1, max_length=160)
    parent_contact: str = Field(min_length=7, max_length=20)
    parent_email: EmailStr | None = None
    address: str | None = Field(default=None, max_length=500)
    previous_school: str | None = Field(default=None, max_length=200)
    website: str = ""   # honeypot: real people never see or fill this

class AdmissionOut(AdmissionCreate):
    model_config = ConfigDict(from_attributes=True)
    id: int
    academic_year: str
    status: str
    remarks: str | None
    student_id: int | None
    created_at: datetime
class AdmissionApprove(BaseModel):
    class_id: int
    roll_no: str | None = None
class AdmissionReject(BaseModel):
    remarks: str | None = None

class YearCreate(BaseModel):
    name: str = Field(pattern=r"^\d{4}-\d{4}$")   # 2027-2028
    make_current: bool = False
    copy_classes_from: str | None = None
class YearOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    is_current: bool

class PromotionItem(BaseModel):
    student_id: int
    action: str                      # promote | repeat | passed_out | left
    target_class_id: int | None = None
class PromotionRun(BaseModel):
    from_year: str
    to_year: str
    items: list[PromotionItem]

class BulkAttendanceRecord(BaseModel):
    student_id: int
    status: str
    remarks: str | None = None
class BulkAttendanceIn(BaseModel):
    class_id: int
    attendance_date: date = Field(default_factory=date.today)
    records: list[BulkAttendanceRecord]

class BulkMarkRecord(BaseModel):
    student_id: int
    marks_obtained: Decimal = Field(ge=0)
    remarks: str | None = None
class BulkMarksIn(BaseModel):
    exam_id: int
    subject: str = Field(min_length=1, max_length=100)
    max_marks: Decimal = Field(gt=0)
    records: list[BulkMarkRecord]

class BulkDuesIn(BaseModel):
    class_id: int
    fee_head_id: int
    period: str
    amount_due: Decimal = Field(gt=0)
    due_date: date | None = None

class SettingsIn(BaseModel):
    school_name: str | None = None
    school_address: str | None = None
    school_phone: str | None = None
    school_email: str | None = None
    principal_name: str | None = None
    result_template: str | None = None   # classic | modern | board


# ── faculty / teaching ───────────────────────────────────────────────────────
class SubjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    code: str | None = Field(default=None, max_length=20)

class AssignmentIn(BaseModel):
    teacher_id: int
    class_id: int
    subject_id: int

class SlotIn(BaseModel):
    weekday: int = Field(ge=0, le=5)
    period_no: int = Field(ge=1, le=12)
    assignment_id: int
class TimetableIn(BaseModel):
    class_id: int
    slots: list[SlotIn]

class FacultyMarkRecord(BaseModel):
    student_id: int | None = None
    admission_no: str | None = None     # CSV uploads use the Student ID instead of the database id
    marks_obtained: Decimal = Field(ge=0)
    remarks: str | None = None
class FacultyMarksIn(BaseModel):
    exam_id: int
    assignment_id: int
    max_marks: Decimal = Field(gt=0)
    records: list[FacultyMarkRecord]

class StaffAttendanceIn(BaseModel):
    user_id: int
    attendance_date: date = Field(default_factory=date.today)
    status: str

class ProfileIn(BaseModel):
    phone: str | None = Field(default=None, max_length=20)
    email: EmailStr | None = None
    address: str | None = Field(default=None, max_length=500)
    bio: str | None = Field(default=None, max_length=300)
    theme: str | None = None


class StandardClassesIn(BaseModel):
    academic_year: str | None = None
    sections: list[str] = Field(default_factory=lambda: ["A"], min_length=1, max_length=10)

class ClassSubjectsIn(BaseModel):
    """Add ONE subject to MANY classes. Give an existing subject_id, or a new subject_name."""
    subject_id: int | None = None
    subject_name: str | None = Field(default=None, max_length=100)
    code: str | None = Field(default=None, max_length=20)
    class_ids: list[int] = Field(min_length=1)


# ── Transport ────────────────────────────────────────────────────────────────
import re as _re
from pydantic import field_validator as _fv

def _hhmm(v):
    if v in (None, ""):
        return None
    if not _re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", str(v)):
        raise ValueError("Use the time as HH:MM, for example 07:45")
    return str(v)

class DriverIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    phone: str = Field(min_length=7, max_length=20)
    license_no: str = Field(min_length=3, max_length=40)
    license_expiry: date | None = None
    address: str | None = None
    is_active: bool = True

class DriverUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=160)
    phone: str | None = Field(default=None, min_length=7, max_length=20)
    license_no: str | None = Field(default=None, min_length=3, max_length=40)
    license_expiry: date | None = None
    address: str | None = None
    is_active: bool | None = None

class StopIn(BaseModel):
    id: int | None = None                  # present = keep/rename this stop, absent = new stop
    name: str = Field(min_length=1, max_length=160)
    pickup_time: str | None = None
    drop_time: str | None = None

    @_fv("pickup_time", "drop_time", mode="before")
    @classmethod
    def check_times(cls, v):
        return _hhmm(v)

class BusIn(BaseModel):
    number: str = Field(min_length=1, max_length=30)
    registration_no: str | None = Field(default=None, max_length=30)
    capacity: int = Field(default=40, ge=1, le=200)
    route_name: str = Field(default="", max_length=160)
    driver_id: int | None = None
    school_arrival_time: str | None = None
    school_departure_time: str | None = None
    gps_device_id: str | None = Field(default=None, max_length=60)
    is_active: bool = True

    @_fv("school_arrival_time", "school_departure_time", mode="before")
    @classmethod
    def check_times(cls, v):
        return _hhmm(v)

class BusUpdate(BaseModel):
    number: str | None = Field(default=None, min_length=1, max_length=30)
    registration_no: str | None = Field(default=None, max_length=30)
    capacity: int | None = Field(default=None, ge=1, le=200)
    route_name: str | None = Field(default=None, max_length=160)
    driver_id: int | None = None
    school_arrival_time: str | None = None
    school_departure_time: str | None = None
    gps_device_id: str | None = Field(default=None, max_length=60)
    is_active: bool | None = None

    @_fv("school_arrival_time", "school_departure_time", mode="before")
    @classmethod
    def check_times(cls, v):
        return _hhmm(v)

class TransportAssign(BaseModel):
    """Set by the school office (admin / clerk). Choosing a stop also picks that stop's bus."""
    uses_bus: bool = True
    pickup_location: str | None = Field(default=None, max_length=255)
    stop_id: int | None = None
    bus_id: int | None = None
    note: str | None = Field(default=None, max_length=255)
    lock: bool = True            # True = the student can no longer change it from the portal
    force: bool = False          # True = allow more students than the bus has seats

class TransportPrefIn(BaseModel):
    """Sent by the student from the portal."""
    uses_bus: bool
    pickup_location: str | None = Field(default=None, max_length=255)
    stop_id: int | None = None
    note: str | None = Field(default=None, max_length=255)
