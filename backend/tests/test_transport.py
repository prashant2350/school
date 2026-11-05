"""Transport + gallery smoke test.   python -m pytest -q"""
import os, tempfile
os.environ["DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"
os.environ["BOOTSTRAP_ADMIN_EMAIL"] = "admin@test.com"
os.environ["BOOTSTRAP_ADMIN_PASSWORD"] = "AdminPass123"
from io import BytesIO
from fastapi.testclient import TestClient
from app.main import app

P = "/api/v1"
def H(tok): return {"Authorization": f"Bearer {tok}"}

def _student(c, a, name):
    k = c.get(f"{P}/classes", headers=a, params={"academic_year": "2026-2027"}).json()[5]
    s = c.post(f"{P}/students", headers=a, json={"first_name": name, "parent_name": "P", "parent_contact": "9000000011", "class_id": k["id"]}).json()
    tok = c.post(f"{P}/auth/student-login", json={"student_id": s["admission_no"], "password": s["temp_password"]}).json()["access_token"]
    return s, H(tok)

def test_transport_flow():
    with TestClient(app) as c:
        a = H(c.post(f"{P}/auth/login", json={"email": "admin@test.com", "password": "AdminPass123"}).json()["access_token"])
        d = c.post(f"{P}/transport/drivers", headers=a, json={"full_name": "Ramesh Kumar", "phone": "9876500000", "license_no": "UP57-2020-1234"}).json()
        bus = c.post(f"{P}/transport/buses", headers=a, json={"number": "07", "capacity": 1, "route_name": "Station Road", "driver_id": d["id"], "school_arrival_time": "07:50"}).json()
        assert c.post(f"{P}/transport/buses", headers=a, json={"number": "07"}).status_code == 409           # duplicate number
        assert c.post(f"{P}/transport/buses", headers=a, json={"number": "08", "driver_id": d["id"]}).status_code == 409   # driver already on bus 07
        assert c.post(f"{P}/transport/buses", headers=a, json={"number": "09", "school_arrival_time": "7.50"}).status_code == 422
        bus = c.put(f"{P}/transport/buses/{bus['id']}/stops", headers=a, json=[
            {"name": "Railway Station", "pickup_time": "07:05", "drop_time": "15:40"}, {"name": "Darbar Road", "pickup_time": "07:30", "drop_time": "15:15"}]).json()
        st_station, st_darbar = bus["stops"]

        s1, t1 = _student(c, a, "Asha")
        s2, t2 = _student(c, a, "Bilal")
        assert c.get(f"{P}/portal/transport", headers=t1).json()["needs_preference"] is True

        # student picks a stop -> bus allotted automatically, with the estimated times
        r = c.put(f"{P}/portal/transport/preference", headers=t1, json={"uses_bus": True, "stop_id": st_station["id"]}).json()
        assert r["status"] == "allotted" and r["bus"]["number"] == "07" and r["stop"]["pickup_time"] == "07:05"
        assert r["bus"]["school_arrival_time"] == "07:50" and r["driver"]["full_name"] == "Ramesh Kumar"
        assert c.get(f"{P}/portal/me", headers=t1).json()["transport"]["bus_number"] == "07"

        # a typed location that matches a stop name is matched too - but bus 07 has 1 seat, so it stays pending
        r = c.put(f"{P}/portal/transport/preference", headers=t2, json={"uses_bus": True, "pickup_location": "near darbar road chauraha"}).json()
        assert r["status"] == "pending" and r["bus"] is None
        # office: full bus is refused unless forced
        assert c.put(f"{P}/transport/students/{s2['id']}", headers=a, json={"stop_id": st_darbar["id"]}).status_code == 409
        r = c.put(f"{P}/transport/students/{s2['id']}", headers=a, json={"stop_id": st_darbar["id"], "force": True}).json()
        assert r["status"] == "allotted"
        # the office locked it, so the student can no longer change it
        assert c.put(f"{P}/portal/transport/preference", headers=t2, json={"uses_bus": False}).status_code == 409

        ov = c.get(f"{P}/transport/overview", headers=a).json()
        assert ov["buses"] == 1 and ov["allotted"] == 2
        # a stop in use can't be dropped; a bus with students can't be deleted
        assert c.put(f"{P}/transport/buses/{bus['id']}/stops", headers=a, json=[{"id": st_station["id"], "name": "Railway Station"}]).status_code == 409
        assert c.delete(f"{P}/transport/buses/{bus['id']}", headers=a).status_code == 409
        assert c.get(f"{P}/public/transport/summary").json()["buses"] == 1
        assert c.get(f"{P}/transport/students", headers=t1).status_code == 401      # student token can't use office endpoints

def test_gallery():
    from PIL import Image
    buf = BytesIO(); Image.new("RGB", (900, 600), (30, 60, 140)).save(buf, "PNG")
    with TestClient(app) as c:
        a = H(c.post(f"{P}/auth/login", json={"email": "admin@test.com", "password": "AdminPass123"}).json()["access_token"])
        assert c.post(f"{P}/gallery", files={"file": ("x.png", buf.getvalue(), "image/png")}, data={"title": "Assembly", "category": "Events"}).status_code == 401
        r = c.post(f"{P}/gallery", headers=a, files={"file": ("x.png", buf.getvalue(), "image/png")}, data={"title": "Assembly", "category": "Events"})
        assert r.status_code == 201
        pid = r.json()["id"]
        assert c.get(f"{P}/public/gallery").json()["photos"][0]["title"] == "Assembly"
        assert c.get(f"{P}/public/gallery/{pid}/thumb").headers["content-type"] == "image/jpeg"
        assert c.delete(f"{P}/gallery/{pid}", headers=a).status_code == 204
