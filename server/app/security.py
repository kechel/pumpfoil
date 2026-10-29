"""Passwort-Hashing (stdlib pbkdf2, keine native Abhängigkeit) und JWT."""
from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt

from .config import get_settings

settings = get_settings()

# 600.000 nach OWASP (Security-Review 29.10.2026, vorher 200.000). Die Runden stehen im Hash: alte Hashes
# gelten weiter und werden beim naechsten Login aufgefrischt (`needs_rehash`). Gemessen ~70 ms je Hash.
_PBKDF2_ROUNDS = 600_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, _PBKDF2_ROUNDS)
    return f"pbkdf2_sha256${_PBKDF2_ROUNDS}${salt.hex()}${dk.hex()}"


def needs_rehash(stored: str) -> bool:
    try:
        return int(stored.split("$")[1]) < _PBKDF2_ROUNDS
    except (IndexError, ValueError, AttributeError):
        return False


def verify_password(password: str, stored: str) -> bool:
    try:
        _, rounds_s, salt_hex, dk_hex = stored.split("$")
        rounds = int(rounds_s)
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), rounds
        )
        return hmac.compare_digest(dk.hex(), dk_hex)
    except (ValueError, AttributeError):
        return False


def create_access_token(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(hours=settings.jwt_expire_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> int | None:
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        return int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def token_exp(token: str) -> datetime | None:
    """Ablaufzeitpunkt eines gültigen Tokens (für Sliding-Refresh)."""
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        exp = payload.get("exp")
        return datetime.fromtimestamp(exp, tz=timezone.utc) if exp else None
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def token_iat(token: str) -> int | None:
    """Ausstellungszeitpunkt (Unix-Sekunden) eines gültigen Tokens — für per-User-Invalidierung."""
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        iat = payload.get("iat")
        return int(iat) if iat is not None else None
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def new_token(nbytes: int = 24) -> str:
    return secrets.token_urlsafe(nbytes)


def token_hash(roh: str) -> str:
    """Wie Geraete- und Reset-Tokens in der DB stehen (S-016, 29.10.2026): nur als SHA-256.

    Die Uhr schickt weiter ihr Token; verglichen wird der Hash. Ein DB- oder Backup-Leck gibt damit
    keine benutzbaren Tokens mehr preis. Ohne Salz, weil die Tokens selbst zufaellig und lang sind
    (kein Woerterbuch, das man vorrechnen koennte) — und weil sonst kein Index-Lookup ginge."""
    import hashlib
    return hashlib.sha256(roh.encode()).hexdigest()


def token_kandidaten(roh: str) -> list[str]:
    """Wonach in der DB gesucht wird: der Hash — und, nur falls die einmalige Umstellung
    (db._tokens_hashen) nicht gelaufen ist, der rohe Wert. Nach der Umstellung steht nirgends
    mehr ein roher Wert; ein geschickter Hash passt nur, wer die DB ohnehin schon hat."""
    return [token_hash(roh), roh]


def new_pairing_code() -> str:
    """6-stelliger, leicht eintippbarer Code (keine verwechselbaren Zeichen)."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(6))
