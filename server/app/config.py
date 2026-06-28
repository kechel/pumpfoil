"""Zentrale Konfiguration. Werte kommen aus Umgebungsvariablen (.env)."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path


class Settings:
    def __init__(self) -> None:
        # SQLite-Default für Dev; in Prod auf Postgres setzen, z. B.
        #   postgresql+psycopg://user:pass@localhost/foil
        self.database_url: str = os.environ.get(
            "DATABASE_URL", "sqlite:///./foil.sqlite3"
        )
        # JWT-Secret — in Prod MUSS dies gesetzt werden.
        self.jwt_secret: str = os.environ.get("JWT_SECRET", "dev-insecure-change-me")
        self.jwt_algorithm: str = "HS256"
        self.jwt_expire_hours: int = int(os.environ.get("JWT_EXPIRE_HOURS", "168"))

        # Verzeichnis für unveränderliche Roh-Session-Daten (ML-Enabler).
        self.data_dir: Path = Path(
            os.environ.get("DATA_DIR", "./data")
        ).resolve()

        # SMTP für E-Mails (Passwort-Reset). Leer -> Mailversand deaktiviert (Link wird
        # serverseitig geloggt). Zugangsdaten später in .env eintragen.
        self.smtp_host: str = os.environ.get("SMTP_HOST", "")
        self.smtp_port: int = int(os.environ.get("SMTP_PORT", "587"))
        self.smtp_user: str = os.environ.get("SMTP_USER", "")
        self.smtp_pass: str = os.environ.get("SMTP_PASS", "")
        self.smtp_from: str = os.environ.get("SMTP_FROM", "Pumpfoil <noreply@pumpfoil.org>")
        self.smtp_starttls: bool = os.environ.get("SMTP_STARTTLS", "1") != "0"
        # Öffentliche Basis-URL für Links in E-Mails + OAuth-Redirects.
        self.base_url: str = os.environ.get("BASE_URL", "https://pumpfoil.org").rstrip("/")
        # Optionale Alt-Domains, die per 301 auf base_url umgeleitet werden
        # (kommagetrennt). Leer -> keine Umleitung.
        self.redirect_hosts: list[str] = [
            h.strip().lower() for h in os.environ.get("REDIRECT_HOSTS", "").split(",") if h.strip()
        ]
        # Kontakt-User-Agent für OSM/Overpass-Anfragen (deren Policy verlangt eine
        # identifizierende Kontaktangabe). Bei eigenem Betrieb anpassen.
        self.osm_user_agent: str = os.environ.get(
            "OSM_USER_AGENT", "PumpfoilTracker/1.0 (+https://pumpfoil.org)"
        )

        # Web-Push (VAPID). Leer -> Push deaktiviert.
        self.vapid_public_key: str = os.environ.get("VAPID_PUBLIC_KEY", "")
        self.vapid_subject: str = os.environ.get("VAPID_SUBJECT", "mailto:noreply@pumpfoil.org")
        # pywebpush erwartet als vapid_private_key einen DATEIPFAD (PEM) – nicht den Inhalt.
        _vpk_file = os.environ.get("VAPID_PRIVATE_KEY_FILE", "")
        self.vapid_private_key: str = ""
        if _vpk_file:
            _p = Path(_vpk_file).resolve()
            if _p.is_file():
                self.vapid_private_key = str(_p)

        # OAuth-Provider: je {client_id, client_secret} aus der .env. Leer -> Provider
        # ist deaktiviert (Button erscheint nicht). Redirect-URI je Provider:
        #   {base_url}/api/auth/oauth/<provider>/callback
        self.oauth: dict[str, dict[str, str]] = {
            p: {
                "client_id": os.environ.get(f"OAUTH_{p.upper()}_CLIENT_ID", ""),
                "client_secret": os.environ.get(f"OAUTH_{p.upper()}_CLIENT_SECRET", ""),
            }
            for p in ("google", "apple", "strava", "garmin", "polar")
        }

        # Öffentliche Medien (Fotos, Profilbilder) — unter /media ausgeliefert.
        self.media_dir: Path = Path(
            os.environ.get("MEDIA_DIR", "./media")
        ).resolve()

        # Gebautes SPA (web/dist) — falls vorhanden, wird es ausgeliefert.
        self.web_dist: Path = Path(
            os.environ.get("WEB_DIST", "../web/dist")
        ).resolve()

        # Gebaute Connect-IQ-App (.prg) zum Self-Sideload-Download.
        self.app_prg: Path = Path(
            os.environ.get("APP_PRG", "../watch/bin/foil-fenix7xpro.prg")
        ).resolve()

        # Verzeichnis mit allen gebauten Geräte-.prg + catalog.json.
        self.app_builds_dir: Path = Path(
            os.environ.get("APP_BUILDS_DIR", "../watch/bin")
        ).resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()
