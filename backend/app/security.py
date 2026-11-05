from datetime import datetime, timedelta, timezone
import secrets, string, time
import jwt
from pwdlib import PasswordHash
from app.config import settings

password_hash = PasswordHash.recommended()

def hash_password(password: str) -> str:
    return password_hash.hash(password)

def verify_password(password: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    return password_hash.verify(password, hashed)

def create_access_token(subject: str, kind: str = "staff") -> str:
    """kind = 'staff' (users table) or 'student' (students table). The two are never interchangeable."""
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode({"sub": subject, "kind": kind, "exp": expires}, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

def generate_temp_password(length: int = 8) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"  # no look-alike chars
    return "".join(secrets.choice(alphabet) for _ in range(length))

# --- very small in-memory brute-force guard (per login id). Use Redis when you run >1 server process. ---
_failures: dict[str, list[float]] = {}

def login_locked(key: str) -> bool:
    window = settings.login_lock_minutes * 60
    now = time.time()
    recent = [t for t in _failures.get(key, []) if now - t < window]
    _failures[key] = recent
    return len(recent) >= settings.login_max_attempts

def login_failed(key: str) -> None:
    _failures.setdefault(key, []).append(time.time())

def login_ok(key: str) -> None:
    _failures.pop(key, None)


_hits: dict[str, list[float]] = {}

def rate_limited(key: str, max_hits: int, window_seconds: int) -> bool:
    """Counts a hit and returns True when `key` exceeded `max_hits` within the window (in-memory; use Redis for >1 process)."""
    now = time.time()
    recent = [t for t in _hits.get(key, []) if now - t < window_seconds]
    recent.append(now)
    _hits[key] = recent
    return len(recent) > max_hits
