"""Fall-Daten (Session-/Konto-IDs, Vermerke) fuer Mess-Skripte — liegen NUR lokal in lokal/<name>.json.

WARUM (27.11.2026): das Repo ist oeffentlich, eine Session-Nummer fuehrt ueber die Session-Seite zum Fahrer und
eine Konto-ID ueber /foiler/<id>. Die Skripte lesen die IDs deshalb aus dem gitignorierten Ordner `lokal/`;
den Aufbau zeigt je Skript eine `<skript>.beispiel.json` daneben (Werte erfunden).
"""
import json
import pathlib
import sys


def _wandeln(v):
    if isinstance(v, dict) and "__paare__" in v:
        return {tuple(k) if isinstance(k, list) else k: _wandeln(w) for k, w in v["__paare__"]}
    if isinstance(v, dict):
        return {int(k) if k.lstrip("-").isdigit() else k: _wandeln(w) for k, w in v.items()}
    if isinstance(v, list):
        return [tuple(x) if isinstance(x, list) else _wandeln(x) for x in v]
    return v


def laden(name: str, beispiel: str = "") -> dict:
    wurzel = next(d for d in pathlib.Path(__file__).resolve().parents if (d / ".git").exists())
    datei = wurzel / "lokal" / f"{name}.json"
    if not datei.is_file():
        sys.exit(f"{datei} fehlt — lokale Fall-Daten, nicht im Repo." + (f" Aufbau: {beispiel}" if beispiel else ""))
    return {k: _wandeln(v) for k, v in json.loads(datei.read_text()).items()}
