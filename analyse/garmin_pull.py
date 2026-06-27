"""Eigene Garmin-Aktivitäten als Original-FIT ziehen (inoffiziell, garminconnect-Lib).

NUR für Jans eigenes Konto / R&D — NICHT der Produkt-Weg (s. Ende der Datei).
Login per Env (Passwort nur beim ersten Mal nötig, danach Token-Cache):
    GARMIN_EMAIL=...  GARMIN_PASSWORD=...  python3 garmin_pull.py [anzahl]
MFA (falls aktiv) wird interaktiv abgefragt. Tokens landen in ./.garmintokens (gitignored).
FITs -> ./fits_garmin/ (gitignored). Enthalten via unserer Connect-IQ-App den SensorLogging-Accel.

Venv: ../.venv-garmin (garminconnect 0.3.6).
"""
import io
import os
import sys
import zipfile
from pathlib import Path

from garminconnect import Garmin

HERE = Path(__file__).parent
TOKENS = str(HERE / ".garmintokens")
OUT = HERE / "fits_garmin"
OUT.mkdir(exist_ok=True)


def connect():
    """Token-Cache nutzen; sonst mit Passwort (+ MFA) einloggen und Tokens sichern."""
    email = os.environ.get("GARMIN_EMAIL")
    pw = os.environ.get("GARMIN_PASSWORD")
    g = Garmin(email=email, password=pw, prompt_mfa=lambda: input("MFA-Code: ").strip())
    try:
        g.login(tokenstore=TOKENS)            # vorhandene Tokens wiederverwenden
    except Exception:
        g.login()                              # frischer Login (Passwort/MFA)
        g.garth.dump(TOKENS) if hasattr(g, "garth") else None
    return g


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    g = connect()
    acts = g.get_activities(0, n)
    print(f"{len(acts)} Aktivitäten geladen.")
    for a in acts:
        aid = a["activityId"]
        name = (a.get("activityName") or "").replace("/", "_")
        atype = a.get("activityType", {}).get("typeKey", "?")
        start = a.get("startTimeLocal", "?")
        raw = g.download_activity(aid, dl_fmt=Garmin.ActivityDownloadFormat.ORIGINAL)
        # ORIGINAL = ZIP mit der .fit
        wrote = []
        try:
            with zipfile.ZipFile(io.BytesIO(raw)) as z:
                for nm in z.namelist():
                    if nm.lower().endswith(".fit"):
                        p = OUT / f"{aid}_{nm}"
                        p.write_bytes(z.read(nm)); wrote.append(p.name)
        except zipfile.BadZipFile:
            p = OUT / f"{aid}.fit"; p.write_bytes(raw); wrote.append(p.name)
        print(f"  {start}  {atype:12s}  {aid}  -> {', '.join(wrote)}")
    print(f"\nFITs in {OUT}  —  Import z. B. über das normale FIT-Upload der Webseite,")
    print("oder direkt mit server/app/fitimport.parse_fit_bytes().")


if __name__ == "__main__":
    main()
