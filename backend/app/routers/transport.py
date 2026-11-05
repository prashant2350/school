"""School transport: drivers, buses, stops, and each student's bus for the year.

How the bus is chosen
  1. On admission / after promotion the student (or the office) gives a PREFERENCE: uses the bus or not,
     and a pickup stop (or a free-text pickup location).
  2. A stop belongs to exactly one bus, so picking a stop picks the bus. A typed location that matches a stop
     name is matched automatically. Anything else waits as "pending" until the office assigns it.
  3. The office can change any student's bus / stop at any time. Doing so locks it (the student can no longer
     edit it from the portal) unless the office un-ticks 'lock'.
"""
from io import BytesIO
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy import and_, func, select
from app.deps import DbSession, require_roles
from app.models import Bus, BusStop, Driver, SchoolClass, Student, StudentTransport
from app.schemas import BusIn, BusUpdate, DriverIn, DriverUpdate, StopIn, TransportAssign
from app import services

router = APIRouter(prefix="/transport", tags=["Transport"])
public_router = APIRouter(prefix="/public/transport", tags=["Public"])
STAFF = ("admin", "clerk")


# ── helpers ──────────────────────────────────────────────────────────────────
def _stops_of(db, bus_id: int) -> list[BusStop]:
    return list(db.scalars(select(BusStop).where(BusStop.bus_id == bus_id).order_by(BusStop.sequence, BusStop.id)).all())

def _seats_used(db, bus_id: int, year: str, exclude_student: int | None = None) -> int:
    stmt = (select(func.count()).select_from(StudentTransport).join(Student, Student.id == StudentTransport.student_id)
            .where(StudentTransport.bus_id == bus_id, StudentTransport.academic_year == year,
                   StudentTransport.uses_bus.is_(True), Student.is_active.is_(True)))
    if exclude_student:
        stmt = stmt.where(StudentTransport.student_id != exclude_student)
    return db.scalar(stmt) or 0

def _driver_out(d: Driver, bus_number: str | None = None) -> dict:
    return {"id": d.id, "full_name": d.full_name, "phone": d.phone, "license_no": d.license_no,
            "license_expiry": d.license_expiry, "address": d.address, "is_active": d.is_active,
            "has_photo": bool(d.photo_type), "photo_version": d.photo_version, "bus_number": bus_number}

def _bus_out(db, b: Bus, year: str) -> dict:
    d = db.get(Driver, b.driver_id) if b.driver_id else None
    return {"id": b.id, "number": b.number, "registration_no": b.registration_no, "capacity": b.capacity,
            "route_name": b.route_name, "driver_id": b.driver_id, "school_arrival_time": b.school_arrival_time,
            "school_departure_time": b.school_departure_time, "gps_device_id": b.gps_device_id, "is_active": b.is_active,
            "driver": {"id": d.id, "full_name": d.full_name, "phone": d.phone} if d else None,
            "stops": [{"id": s.id, "name": s.name, "sequence": s.sequence, "pickup_time": s.pickup_time, "drop_time": s.drop_time}
                      for s in _stops_of(db, b.id)],
            "seats_used": _seats_used(db, b.id, year)}

def match_stop(db, location: str) -> BusStop | None:
    """Match a typed pickup location to a stop on an active bus (exact name first, then 'contains')."""
    loc = " ".join(location.lower().split())
    if len(loc) < 3:
        return None
    stops = db.scalars(select(BusStop).join(Bus, Bus.id == BusStop.bus_id).where(Bus.is_active.is_(True))).all()
    for s in stops:
        if s.name.lower().strip() == loc:
            return s
    for s in stops:
        n = s.name.lower().strip()
        if len(n) >= 3 and (n in loc or loc in n):
            return s
    return None

def apply_assignment(db, student: Student, year: str, *, uses_bus: bool, pickup_location: str | None, stop_id: int | None,
                     bus_id: int | None, note: str | None, locked: bool, strict: bool, force: bool = False) -> StudentTransport:
    """Create/update the student's transport row for `year` and work out the bus.
    A full bus: office (strict=True) gets an error unless force=True; a student (strict=False) is left 'pending' for the office."""
    row = db.scalar(select(StudentTransport).where(StudentTransport.student_id == student.id, StudentTransport.academic_year == year))
    if not row:
        row = StudentTransport(student_id=student.id, academic_year=year)
        db.add(row)
    row.uses_bus = uses_bus
    row.pickup_location = (pickup_location or "").strip() or None
    row.note = (note or "").strip() or None
    row.locked = locked
    row.stop_id = row.bus_id = None
    if not uses_bus:
        return row
    stop = None
    if stop_id:
        stop = db.get(BusStop, stop_id)
        if not stop:
            raise HTTPException(status_code=422, detail="The selected stop does not exist")
        bus_id = stop.bus_id
    elif not bus_id and row.pickup_location:
        stop = match_stop(db, row.pickup_location)
        bus_id = stop.bus_id if stop else None
    if bus_id:
        bus = db.get(Bus, bus_id)
        if not bus or not bus.is_active:
            raise HTTPException(status_code=422, detail="The selected bus is not available")
        if not force and _seats_used(db, bus.id, year, student.id) >= bus.capacity:
            if strict:
                raise HTTPException(status_code=409, detail=f"Bus {bus.number} is full ({bus.capacity} seats). Pick another bus, or tick “Allow over capacity”.")
            row.note = ((row.note + " · ") if row.note else "") + f"Bus {bus.number} was full"
            return row                                  # stays pending for the office
        row.bus_id, row.stop_id = bus.id, (stop.id if stop else None)
    return row

def _status(row: StudentTransport | None) -> str:
    if row is None:
        return "none"
    return "not_using" if not row.uses_bus else ("allotted" if row.bus_id else "pending")


# ── what a student sees (used by the student portal) ─────────────────────────
def transport_detail(db, student: Student) -> dict:
    year = services.current_year(db)
    row = db.scalar(select(StudentTransport).where(StudentTransport.student_id == student.id, StudentTransport.academic_year == year))
    out = {"academic_year": year, "needs_preference": row is None, "status": _status(row), "preference": None,
           "bus": None, "stop": None, "driver": None, "route_stops": [],
           "live": None}      # live: filled in later when the GPS trackers are installed (Bus.gps_device_id)
    if not row:
        return out
    out["preference"] = {"uses_bus": row.uses_bus, "pickup_location": row.pickup_location, "note": row.note, "locked": row.locked}
    if row.uses_bus and row.bus_id:
        bus = db.get(Bus, row.bus_id)
        stops = _stops_of(db, bus.id)
        mine = next((s for s in stops if s.id == row.stop_id), None)
        d = db.get(Driver, bus.driver_id) if bus.driver_id else None
        out.update(
            bus={"number": bus.number, "registration_no": bus.registration_no, "route_name": bus.route_name,
                 "school_arrival_time": bus.school_arrival_time, "school_departure_time": bus.school_departure_time},
            stop={"name": mine.name, "pickup_time": mine.pickup_time, "drop_time": mine.drop_time} if mine else None,
            driver={"full_name": d.full_name, "phone": d.phone, "license_no": d.license_no,
                    "has_photo": bool(d.photo_type), "photo_version": d.photo_version} if d else None,
            route_stops=[{"id": s.id, "name": s.name, "pickup_time": s.pickup_time, "drop_time": s.drop_time, "mine": s.id == row.stop_id} for s in stops])
    return out

def transport_summary(db, student: Student) -> dict | None:
    d = transport_detail(db, student)
    if d["status"] != "allotted":
        return None
    return {"bus_number": d["bus"]["number"], "stop": d["stop"]["name"] if d["stop"] else None,
            "pickup_time": d["stop"]["pickup_time"] if d["stop"] else None, "school_arrival_time": d["bus"]["school_arrival_time"]}


# ── office: overview + student allotment ─────────────────────────────────────
def _student_rows(db, year: str) -> list[dict]:
    rows = db.execute(select(Student, StudentTransport, SchoolClass)
                      .outerjoin(StudentTransport, and_(StudentTransport.student_id == Student.id, StudentTransport.academic_year == year))
                      .outerjoin(SchoolClass, SchoolClass.id == Student.class_id)
                      .where(Student.is_active.is_(True)).order_by(Student.first_name, Student.last_name)).all()
    buses = {b.id: b for b in db.scalars(select(Bus)).all()}
    stops = {s.id: s for s in db.scalars(select(BusStop)).all()}
    out = []
    for s, t, k in rows:
        out.append({"student_id": s.id, "name": f"{s.first_name} {s.last_name}".strip(), "admission_no": s.admission_no,
                    "class_label": services.class_label(k), "status": _status(t),
                    "uses_bus": t.uses_bus if t else None, "pickup_location": t.pickup_location if t else None,
                    "note": t.note if t else None, "locked": t.locked if t else False,
                    "bus_id": t.bus_id if t else None, "bus_number": buses[t.bus_id].number if t and t.bus_id in buses else None,
                    "stop_id": t.stop_id if t else None, "stop_name": stops[t.stop_id].name if t and t.stop_id in stops else None})
    return out

@router.get("/overview")
def overview(db: DbSession, user=Depends(require_roles(*STAFF))):
    rows = _student_rows(db, services.current_year(db))
    count = lambda st: sum(1 for r in rows if r["status"] == st)
    return {"buses": db.scalar(select(func.count()).select_from(Bus).where(Bus.is_active.is_(True))) or 0,
            "drivers": db.scalar(select(func.count()).select_from(Driver).where(Driver.is_active.is_(True))) or 0,
            "allotted": count("allotted"), "pending": count("pending"), "none": count("none"), "not_using": count("not_using")}

@router.get("/students")
def list_students(db: DbSession, user=Depends(require_roles(*STAFF)), status: str | None = None, q: str | None = None,
                  bus_id: int | None = None):
    """status: attention (= pending + no answer yet) | allotted | pending | none | not_using"""
    rows = _student_rows(db, services.current_year(db))
    if status == "attention":
        rows = [r for r in rows if r["status"] in ("pending", "none")]
    elif status:
        rows = [r for r in rows if r["status"] == status]
    if bus_id:
        rows = [r for r in rows if r["bus_id"] == bus_id]
    if q:
        n = q.strip().lower()
        rows = [r for r in rows if n in r["name"].lower() or n in r["admission_no"].lower()]
    return rows[:500]

@router.put("/students/{student_id}")
def assign_student(student_id: int, data: TransportAssign, db: DbSession, user=Depends(require_roles(*STAFF))):
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if data.uses_bus and not (data.stop_id or data.bus_id or (data.pickup_location or "").strip()):
        raise HTTPException(status_code=422, detail="Choose a bus or stop, or type the pickup location")
    apply_assignment(db, student, services.current_year(db), uses_bus=data.uses_bus, pickup_location=data.pickup_location,
                     stop_id=data.stop_id, bus_id=data.bus_id, note=data.note, locked=data.lock, strict=True, force=data.force)
    db.commit()
    return transport_detail(db, student)


# ── office: drivers ──────────────────────────────────────────────────────────
@router.get("/drivers")
def list_drivers(db: DbSession, user=Depends(require_roles(*STAFF))):
    numbers = {b.driver_id: b.number for b in db.scalars(select(Bus).where(Bus.driver_id.is_not(None))).all()}
    return [_driver_out(d, numbers.get(d.id)) for d in db.scalars(select(Driver).order_by(Driver.full_name)).all()]

@router.post("/drivers", status_code=201)
def add_driver(data: DriverIn, db: DbSession, user=Depends(require_roles("admin"))):
    d = Driver(**data.model_dump())
    db.add(d)
    db.commit()
    return _driver_out(d)

@router.patch("/drivers/{driver_id}")
def edit_driver(driver_id: int, data: DriverUpdate, db: DbSession, user=Depends(require_roles("admin"))):
    d = db.get(Driver, driver_id)
    if not d:
        raise HTTPException(status_code=404, detail="Driver not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(d, k, v)
    db.commit()
    return _driver_out(d)

@router.delete("/drivers/{driver_id}", status_code=204)
def delete_driver(driver_id: int, db: DbSession, user=Depends(require_roles("admin"))):
    d = db.get(Driver, driver_id)
    if not d:
        raise HTTPException(status_code=404, detail="Driver not found")
    bus = db.scalar(select(Bus).where(Bus.driver_id == driver_id))
    if bus:
        raise HTTPException(status_code=409, detail=f"{d.full_name} drives Bus {bus.number}. Give that bus another driver first.")
    db.delete(d)
    db.commit()

@router.post("/drivers/{driver_id}/photo", status_code=204)
async def upload_driver_photo(driver_id: int, db: DbSession, user=Depends(require_roles("admin")), file: UploadFile = File(...)):
    d = db.get(Driver, driver_id)
    if not d:
        raise HTTPException(status_code=404, detail="Driver not found")
    raw = await file.read(2_000_001)
    if len(raw) > 2_000_000:
        raise HTTPException(status_code=413, detail="Photo is too large (max 2 MB)")
    try:
        from PIL import Image, ImageOps
        img = ImageOps.exif_transpose(Image.open(BytesIO(raw))).convert("RGB")
        img.thumbnail((480, 480))
        out = BytesIO()
        img.save(out, "JPEG", quality=85)
    except Exception:
        raise HTTPException(status_code=422, detail="That file is not a valid photo (use JPG or PNG)")
    d.photo, d.photo_type, d.photo_version = out.getvalue(), "image/jpeg", (d.photo_version or 0) + 1
    db.commit()

@router.get("/drivers/{driver_id}/photo")
def driver_photo(driver_id: int, db: DbSession, user=Depends(require_roles(*STAFF))):
    d = db.get(Driver, driver_id)
    if not d or not d.photo_type:
        raise HTTPException(status_code=404, detail="No photo")
    return Response(content=d.photo, media_type=d.photo_type, headers={"Cache-Control": "private, max-age=300"})


# ── office: buses and their stops ────────────────────────────────────────────
def _check_driver(db, driver_id, bus_id=None):
    if not driver_id:
        return
    if not db.get(Driver, driver_id):
        raise HTTPException(status_code=422, detail="Selected driver does not exist")
    other = db.scalar(select(Bus).where(Bus.driver_id == driver_id, Bus.id != (bus_id or 0)))
    if other:
        raise HTTPException(status_code=409, detail=f"That driver is already assigned to Bus {other.number}")

@router.get("/buses")
def list_buses(db: DbSession, user=Depends(require_roles(*STAFF))):
    year = services.current_year(db)
    return [_bus_out(db, b, year) for b in db.scalars(select(Bus).order_by(Bus.number)).all()]

@router.post("/buses", status_code=201)
def add_bus(data: BusIn, db: DbSession, user=Depends(require_roles("admin"))):
    data.number = data.number.strip()
    if db.scalar(select(Bus.id).where(func.lower(Bus.number) == data.number.lower())):
        raise HTTPException(status_code=409, detail=f"Bus {data.number} already exists")
    _check_driver(db, data.driver_id)
    b = Bus(**data.model_dump())
    db.add(b)
    db.commit()
    return _bus_out(db, b, services.current_year(db))

@router.patch("/buses/{bus_id}")
def edit_bus(bus_id: int, data: BusUpdate, db: DbSession, user=Depends(require_roles("admin"))):
    b = db.get(Bus, bus_id)
    if not b:
        raise HTTPException(status_code=404, detail="Bus not found")
    changes = data.model_dump(exclude_unset=True)
    if changes.get("number") and changes["number"].strip().lower() != b.number.lower():
        if db.scalar(select(Bus.id).where(func.lower(Bus.number) == changes["number"].strip().lower())):
            raise HTTPException(status_code=409, detail=f"Bus {changes['number']} already exists")
    if "driver_id" in changes:
        _check_driver(db, changes["driver_id"], bus_id)
    for k, v in changes.items():
        setattr(b, k, v.strip() if isinstance(v, str) and k == "number" else v)
    db.commit()
    return _bus_out(db, b, services.current_year(db))

@router.delete("/buses/{bus_id}", status_code=204)
def delete_bus(bus_id: int, db: DbSession, user=Depends(require_roles("admin"))):
    b = db.get(Bus, bus_id)
    if not b:
        raise HTTPException(status_code=404, detail="Bus not found")
    if db.scalar(select(func.count()).select_from(StudentTransport).where(StudentTransport.bus_id == bus_id)):
        raise HTTPException(status_code=409, detail="Students are (or were) allotted to this bus. Mark it inactive instead of deleting it.")
    for s in _stops_of(db, bus_id):
        db.delete(s)
    db.delete(b)
    db.commit()

@router.put("/buses/{bus_id}/stops")
def set_stops(bus_id: int, items: list[StopIn], db: DbSession, user=Depends(require_roles("admin"))):
    """Replace the bus's whole stop list, in route order. Stops with an id are kept (and renamed/retimed)."""
    b = db.get(Bus, bus_id)
    if not b:
        raise HTTPException(status_code=404, detail="Bus not found")
    names = [i.name.strip().lower() for i in items]
    if len(set(names)) != len(names):
        raise HTTPException(status_code=422, detail="Two stops on this bus have the same name")
    existing = {s.id: s for s in _stops_of(db, bus_id)}
    kept: set[int] = set()
    for order, it in enumerate(items, start=1):
        if it.id and it.id in existing:
            s = existing[it.id]
            kept.add(s.id)
        else:
            s = BusStop(bus_id=bus_id)
            db.add(s)
        s.name, s.sequence, s.pickup_time, s.drop_time = it.name.strip(), order, it.pickup_time, it.drop_time
    for sid, s in existing.items():
        if sid in kept:
            continue
        n = db.scalar(select(func.count()).select_from(StudentTransport).where(StudentTransport.stop_id == sid)) or 0
        if n:
            raise HTTPException(status_code=409, detail=f"{n} student(s) use the stop “{s.name}”. Move them to another stop first.")
        db.delete(s)
    db.commit()
    return _bus_out(db, b, services.current_year(db))


# ── public (no login): the preference form and the About page need the list of stops ──
@public_router.get("/stops")
def public_stops(db: DbSession):
    out = []
    for b in db.scalars(select(Bus).where(Bus.is_active.is_(True)).order_by(Bus.number)).all():
        out.append({"bus_id": b.id, "bus_number": b.number, "route_name": b.route_name,
                    "stops": [{"id": s.id, "name": s.name, "pickup_time": s.pickup_time} for s in _stops_of(db, b.id)]})
    return out

@public_router.get("/summary")
def public_summary(db: DbSession):
    buses = db.scalars(select(Bus).where(Bus.is_active.is_(True)).order_by(Bus.number)).all()
    return {"buses": len(buses), "routes": [{"bus": b.number, "route": b.route_name, "stops": [s.name for s in _stops_of(db, b.id)]} for b in buses]}
