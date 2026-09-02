"""System-Gesundheit für den Admin-Bereich: CPU, Speicher, Platten, Prozesse, Dienste, Postgres.

Zweck (Jans Wunsch, 02.09.): auf EINEN Blick erkennen, wenn etwas langsam zuläuft (Platte, DB,
Backups zu alt) oder gerade akut Last macht (Lastmittel, ein Prozess, viele DB-Verbindungen).

Drei Entscheidungen, die den Rest erklären:

* **Keine neue Abhängigkeit.** Alles kommt aus `/proc`, `os.statvfs`, `ps`, `systemctl`,
  `journalctl` und Postgres selbst. `psutil` wäre bequemer, aber eine Server-Abhängigkeit für
  einen Admin-Bildschirm ist es nicht wert.
* **Nichts darf den Bildschirm kippen.** Jeder Block steckt in seinem eigenen `try`; fällt einer
  aus, fehlt genau seine Karte und der Rest steht. Unterprozesse laufen mit Zeitlimit.
* **Verlauf statt nur Momentaufnahme.** „Läuft langsam voll" sieht man nicht an einer Zahl.
  Deshalb schreibt jeder Aufruf höchstens EINE Stichprobe pro Minute in `system_samples` und
  liefert die letzten Tage mit zurück — genug für eine Verlaufslinie, ohne Zeitreihen-Datenbank.

Lesend, ausser den Stichproben. Keine Aktionen, keine Geheimnisse: Umgebungsvariablen werden
NICHT ausgegeben, Prozesse nur mit Name (nicht mit Befehlszeile, da stehen Tokens drin).
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import time
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from .deps import current_admin

router = APIRouter(prefix="/api/admin/health", tags=["admin"])

# Schwellen. Bewusst hier oben und nicht im Frontend: die Bewertung gehört dorthin, wo die Zahl
# entsteht, sonst bewerten PWA, Android und iOS irgendwann unterschiedlich.
PLATTE_GELB, PLATTE_ROT = 75.0, 90.0
SPEICHER_GELB, SPEICHER_ROT = 85.0, 93.0
LAST_JE_KERN_GELB, LAST_JE_KERN_ROT = 1.5, 3.0
BACKUP_GELB_H, BACKUP_ROT_H = 30.0, 50.0          # täglich 03:30 -> nach 30 h ist eines ausgefallen
SAMPLE_ABSTAND_S = 60
SAMPLE_BEHALTEN_TAGE = 14

# Diese Dienste interessieren wirklich. Alles andere findet die Fehlerliste (`--failed`).
# apache2 steht hier ABSICHTLICH NICHT: der Reverse-Proxy laeuft auf einer SEPARATEN VM
# (s. CLAUDE.md). Lokal waere er dauerhaft „inactive" — eine Warnlampe, die nie etwas bedeutet,
# ist schlimmer als keine.
DIENSTE = ["foil-server", "postgresql"]
TIMER = ["foil-backup-latest.timer", "foil-backup-snapshot.timer", "srv-backup-latest.timer",
         "foil-records.timer"]
BACKUP_PFAD = "/opt/foil/backups/pumpfoil.org/latest-backup"


def _lauf(*args: str, timeout: float = 4.0) -> str:
    """Unterprozess lesen. Fehler sind hier normal (Dienst fehlt, Rechte) -> leerer String."""
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return r.stdout or ""
    except Exception:  # noqa: BLE001 — ein fehlendes Werkzeug darf die Seite nicht kosten
        return ""


def _proc_datei(pfad: str) -> str:
    try:
        with open(pfad, encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


def _cpu_modell() -> str:
    for zeile in _proc_datei("/proc/cpuinfo").splitlines():
        if zeile.startswith("model name"):
            return zeile.split(":", 1)[1].strip()
    return ""


def _cpu_auslastung(dauer: float = 0.12) -> float | None:
    """Auslastung in Prozent über eine kurze Stichprobe aus /proc/stat.

    Zwei Messungen mit Pause: die Alternative wäre der Mittelwert seit dem Systemstart, und der
    ist für „macht gerade jemand Last?" wertlos.
    """
    def lies() -> tuple[int, int] | None:
        for zeile in _proc_datei("/proc/stat").splitlines():
            if zeile.startswith("cpu "):
                t = [int(x) for x in zeile.split()[1:]]
                gesamt = sum(t)
                untaetig = t[3] + (t[4] if len(t) > 4 else 0)   # idle + iowait
                return gesamt, untaetig
        return None

    a = lies()
    if a is None:
        return None
    time.sleep(dauer)
    b = lies()
    if b is None or b[0] == a[0]:
        return None
    return round((1 - (b[1] - a[1]) / (b[0] - a[0])) * 100, 1)


def _speicher() -> dict:
    werte: dict[str, int] = {}
    for zeile in _proc_datei("/proc/meminfo").splitlines():
        teile = zeile.split(":")
        if len(teile) == 2:
            zahl = teile[1].strip().split()
            if zahl and zahl[0].isdigit():
                werte[teile[0]] = int(zahl[0]) * 1024        # kB -> Bytes
    total = werte.get("MemTotal", 0)
    verfuegbar = werte.get("MemAvailable", 0)
    swap_total = werte.get("SwapTotal", 0)
    swap_frei = werte.get("SwapFree", 0)
    return {
        "total": total,
        "verfuegbar": verfuegbar,
        # „benutzt" heisst hier: NICHT verfügbar. Die Rohzahl `MemFree` erschreckt nur, weil Linux
        # freien Speicher als Cache benutzt — der ist bei Bedarf sofort wieder da.
        "benutzt": max(total - verfuegbar, 0),
        "prozent": round((total - verfuegbar) / total * 100, 1) if total else None,
        "cached": werte.get("Cached", 0),
        "puffer": werte.get("Buffers", 0),
        "swap_total": swap_total,
        "swap_benutzt": max(swap_total - swap_frei, 0),
        "swap_prozent": round((swap_total - swap_frei) / swap_total * 100, 1) if swap_total else None,
    }


def _platten() -> list[dict]:
    """Alle echten Dateisysteme aus /proc/mounts, ohne die virtuellen (proc, sysfs, cgroup …)."""
    echte = {"ext2", "ext3", "ext4", "xfs", "btrfs", "zfs", "f2fs", "vfat", "ntfs", "overlay"}
    gesehen: set[str] = set()
    out: list[dict] = []
    for zeile in _proc_datei("/proc/mounts").splitlines():
        t = zeile.split()
        if len(t) < 3 or t[2] not in echte:
            continue
        geraet, pfad = t[0], t[1].replace("\\040", " ")
        if pfad in gesehen:
            continue
        gesehen.add(pfad)
        try:
            s = os.statvfs(pfad)
        except OSError:
            continue
        total = s.f_blocks * s.f_frsize
        if total < 64 * 1024 * 1024:      # Winzlinge (Boot-Häppchen, Snap-Loops) interessieren nicht
            continue
        frei = s.f_bavail * s.f_frsize
        benutzt = total - s.f_bfree * s.f_frsize
        out.append({
            "pfad": pfad, "geraet": geraet, "typ": t[2],
            "total": total, "benutzt": benutzt, "frei": frei,
            "prozent": round(benutzt / total * 100, 1) if total else None,
        })
    out.sort(key=lambda d: -(d["prozent"] or 0))
    return out


def _prozesse(limit: int = 8) -> dict:
    """Die grössten Verbraucher, je nach CPU und nach Speicher.

    Bewusst OHNE Befehlszeile (`comm` statt `args`): in Befehlszeilen stehen Tokens und Pfade,
    und dieser Bildschirm soll nichts ausplaudern, was er nicht braucht.
    """
    roh = _lauf("ps", "-eo", "pid,user:16,pcpu,pmem,rss,etimes,comm", "--sort=-pcpu")
    zeilen = [z for z in roh.splitlines()[1:] if z.strip()]
    liste: list[dict] = []
    for z in zeilen:
        t = z.split(None, 6)
        if len(t) < 7:
            continue
        try:
            liste.append({"pid": int(t[0]), "nutzer": t[1], "cpu": float(t[2]),
                          "mem": float(t[3]), "rss": int(t[4]) * 1024,
                          "laufzeit_s": int(t[5]), "name": t[6].strip()})
        except ValueError:
            continue
    nach_cpu = liste[:limit]
    nach_mem = sorted(liste, key=lambda d: -d["rss"])[:limit]
    return {"anzahl": len(liste), "nach_cpu": nach_cpu, "nach_speicher": nach_mem}


def _dienste() -> list[dict]:
    out = []
    for name in DIENSTE:
        zustand = (_lauf("systemctl", "is-active", name).strip() or "unbekannt")
        seit = ""
        if zustand == "active":
            seit = _lauf("systemctl", "show", "-p", "ActiveEnterTimestamp", "--value", name).strip()
        out.append({"name": name, "zustand": zustand, "seit": seit})
    return out


def _timer() -> list[dict]:
    """Letzter und nächster Lauf je Timer — daran sieht man ausgefallene Backups sofort."""
    out = []
    roh = _lauf("systemctl", "list-timers", "--all", "--no-pager", "--output=json", timeout=6.0)
    daten = {}
    if roh.strip().startswith("["):
        import json as _json
        try:
            for e in _json.loads(roh):
                daten[e.get("unit", "")] = e
        except ValueError:
            daten = {}
    for name in TIMER:
        e = daten.get(name) or {}
        out.append({
            "name": name,
            "zustand": (_lauf("systemctl", "is-active", name).strip() or "unbekannt"),
            # systemd liefert Mikrosekunden seit Epoche; 0/None = nie gelaufen.
            "letzte": int(e["last"] / 1_000_000) if e.get("last") else None,
            "naechste": int(e["next"] / 1_000_000) if e.get("next") else None,
        })
    return out


def _fehlerhafte_units() -> list[str]:
    roh = _lauf("systemctl", "list-units", "--failed", "--no-legend", "--plain", "--no-pager")
    return [z.split()[0] for z in roh.splitlines() if z.strip()][:10]


def _postgres(db: Session) -> dict:
    d: dict = {}
    try:
        d["groesse"] = int(db.execute(text("select pg_database_size(current_database())")).scalar() or 0)
        d["verbindungen"] = int(db.execute(text("select count(*) from pg_stat_activity")).scalar() or 0)
        d["max_verbindungen"] = int(db.execute(text("show max_connections")).scalar() or 0)
        d["aktive_abfragen"] = int(db.execute(text(
            "select count(*) from pg_stat_activity where state = 'active' and pid <> pg_backend_pid()"
        )).scalar() or 0)
        # Länge der ältesten laufenden Abfrage — eine hängende Abfrage ist die haeufigste Ursache
        # dafuer, dass „alles langsam" ist.
        d["laengste_abfrage_s"] = int(db.execute(text(
            "select coalesce(max(extract(epoch from (now() - query_start))), 0)::int "
            "from pg_stat_activity where state = 'active' and pid <> pg_backend_pid()"
        )).scalar() or 0)
        d["tabellen"] = [
            {"name": r[0], "bytes": int(r[1])}
            for r in db.execute(text(
                "select relname, pg_total_relation_size(c.oid) from pg_class c "
                "join pg_namespace n on n.oid = c.relnamespace "
                "where n.nspname = 'public' and c.relkind = 'r' "
                "order by pg_total_relation_size(c.oid) desc limit 8"))
        ]
    except Exception as e:  # noqa: BLE001
        d["fehler"] = type(e).__name__
    return d


def _backups() -> dict:
    d: dict = {"pfad": BACKUP_PFAD}
    try:
        st = os.stat(BACKUP_PFAD)
        d["stand"] = int(st.st_mtime)
        d["alter_h"] = round((time.time() - st.st_mtime) / 3600, 1)
        gesamt = 0
        for wurzel, _dirs, dateien in os.walk(BACKUP_PFAD):
            for n in dateien:
                try:
                    gesamt += os.stat(os.path.join(wurzel, n)).st_size
                except OSError:
                    pass
        d["bytes"] = gesamt
        # Der GPG-Umschlag mit den Zugangsdaten faehrt in der Pull-Kette mit — fehlt er, ist das
        # ein stiller Ausfall (s. deploy/backup-secrets.sh).
        d["secrets_da"] = os.path.exists(os.path.join(BACKUP_PFAD, "secrets.tar.gz.gpg"))
    except OSError as e:
        d["fehler"] = e.strerror or "nicht lesbar"
    return d


def _oom_vorfaelle() -> int | None:
    """Wie oft systemd-oomd in 24 h zugeschlagen hat. Sagt mehr als jede Speicherzahl."""
    roh = _lauf("journalctl", "-u", "systemd-oomd", "--since", "-24h", "--no-pager", timeout=6.0)
    if not roh:
        return None
    return sum(1 for z in roh.splitlines() if "Killed" in z or "killed" in z)


def _stichprobe(db: Session, cpu: float | None, sp: dict, platten: list[dict], last1: float | None) -> None:
    """Höchstens eine Stichprobe pro Minute, damit vier Worker beim Pollen nicht vier schreiben."""
    try:
        letzte = db.query(models.SystemSample).order_by(models.SystemSample.id.desc()).first()
        if letzte and letzte.created_at:
            alter = (datetime.now(timezone.utc) - letzte.created_at).total_seconds()
            if alter < SAMPLE_ABSTAND_S:
                return
        wurzel = next((p["prozent"] for p in platten if p["pfad"] == "/"), None)
        tmp = next((p["prozent"] for p in platten if p["pfad"] == "/tmp"), None)
        db.add(models.SystemSample(cpu_prozent=cpu, speicher_prozent=sp.get("prozent"),
                                   swap_prozent=sp.get("swap_prozent"), last1=last1,
                                   platte_root_prozent=wurzel, platte_tmp_prozent=tmp))
        grenze = datetime.now(timezone.utc) - timedelta(days=SAMPLE_BEHALTEN_TAGE)
        db.query(models.SystemSample).filter(models.SystemSample.created_at < grenze).delete()
        db.commit()
    except Exception:  # noqa: BLE001 — Messwerte sind nie einen Fehler wert
        db.rollback()


def _warnungen(cpu: float | None, sp: dict, platten: list[dict], last: list[float] | None,
               kerne: int, pg: dict, backup: dict, fehler: list[str], oom: int | None) -> list[dict]:
    """Die Bewertung — damit oben steht, was JETZT wichtig ist, statt in Karten zu suchen."""
    w: list[dict] = []

    def add(stufe: str, schluessel: str, text_: str) -> None:
        # Der Schluessel identifiziert das PROBLEM, nicht den Wortlaut: „/tmp zu 91 % voll" und
        # „/tmp zu 93 % voll" sind dasselbe Problem und duerfen nicht zweimal melden.
        w.append({"stufe": stufe, "schluessel": schluessel, "text": text_})

    for p in platten:
        pr = p["prozent"] or 0
        frei_gb = p["frei"] / 1024**3
        if pr >= PLATTE_ROT:
            add("rot", f"platte:{p['pfad']}", f"{p['pfad']} ist zu {pr:.0f} % voll (nur {frei_gb:.1f} GB frei)")
        elif pr >= PLATTE_GELB:
            add("gelb", f"platte:{p['pfad']}", f"{p['pfad']} ist zu {pr:.0f} % voll ({frei_gb:.1f} GB frei)")
    if sp.get("prozent") is not None:
        if sp["prozent"] >= SPEICHER_ROT:
            add("rot", "speicher", f"Arbeitsspeicher zu {sp['prozent']:.0f} % belegt")
        elif sp["prozent"] >= SPEICHER_GELB:
            add("gelb", "speicher", f"Arbeitsspeicher zu {sp['prozent']:.0f} % belegt")
    if sp.get("swap_prozent") and sp["swap_prozent"] >= 50:
        add("gelb", "swap", f"Swap zu {sp['swap_prozent']:.0f} % benutzt — das System weicht auf Platte aus")
    if last and kerne:
        je_kern = last[0] / kerne
        if je_kern >= LAST_JE_KERN_ROT:
            add("rot", "last", f"Lastmittel {last[0]:.1f} bei {kerne} Kernen ({je_kern:.1f} je Kern)")
        elif je_kern >= LAST_JE_KERN_GELB:
            add("gelb", "last", f"Lastmittel {last[0]:.1f} bei {kerne} Kernen ({je_kern:.1f} je Kern)")
    if backup.get("alter_h") is not None:
        if backup["alter_h"] >= BACKUP_ROT_H:
            add("rot", "backup:alter", f"Letztes Backup ist {backup['alter_h']:.0f} h alt")
        elif backup["alter_h"] >= BACKUP_GELB_H:
            add("gelb", "backup:alter", f"Letztes Backup ist {backup['alter_h']:.0f} h alt")
    if backup.get("secrets_da") is False:
        add("gelb", "backup:secrets", "Im Backup fehlt der verschlüsselte Umschlag mit den Zugangsdaten")
    if pg.get("verbindungen") and pg.get("max_verbindungen"):
        anteil = pg["verbindungen"] / pg["max_verbindungen"] * 100
        if anteil >= 80:
            add("rot", "pg:verbindungen", f"Postgres: {pg['verbindungen']} von {pg['max_verbindungen']} Verbindungen belegt")
        elif anteil >= 60:
            add("gelb", "pg:verbindungen", f"Postgres: {pg['verbindungen']} von {pg['max_verbindungen']} Verbindungen belegt")
    if pg.get("laengste_abfrage_s", 0) >= 60:
        add("gelb", "pg:abfrage", f"Eine Postgres-Abfrage läuft seit {pg['laengste_abfrage_s']} s")
    for u in fehler:
        add("rot", f"unit:{u}", f"Dienst im Fehlerzustand: {u}")
    if oom:
        add("rot", "oom", f"systemd-oomd hat in 24 h {oom} Prozess(e) beendet — Speicher war knapp")
    return w


# Wie lange ein bestehendes Problem schweigt, bevor es erneut meldet. Sechs Stunden, weil eine
# volle Platte nicht alle fuenf Minuten mitgeteilt werden muss, ein ueber Nacht gewachsenes
# Problem aber am Morgen wieder auf dem Schirm sein soll.
WIEDERHOLUNG_H = 6.0


def melde(db: Session, warnungen: list[dict]) -> int:
    """Neue/anhaltende Warnungen als Push an die Admins, und einmal Entwarnung beim Verschwinden.

    Bewusst NICHT an `push.wants()` gebunden: das sind Betriebsmeldungen an Admins, und einen
    passenden Schalter gibt es in der Oberflaeche nicht — er wuerde hier stumm mitschalten.

    Rueckgabe: Anzahl verschickter Meldungen (fuer das Log des Zeitgebers).
    """
    from ..push import send_push   # spaet importiert: der Bildschirm soll ohne Push funktionieren

    jetzt = datetime.now(timezone.utc)
    admins = [u.id for u in db.query(models.User).filter(models.User.is_admin.is_(True)).all()]
    if not admins:
        return 0
    aktuell = {w["schluessel"]: w for w in warnungen if w.get("schluessel")}
    bekannt = {a.schluessel: a for a in db.query(models.HealthAlert).all()}
    geschickt = 0

    def push(titel: str, text_: str) -> None:
        nonlocal geschickt
        for uid in admins:
            geschickt += send_push(db, uid, titel, text_, "/admin?tab=system")

    for sch, w in aktuell.items():
        a = bekannt.get(sch)
        symbol = "🔴" if w["stufe"] == "rot" else "🟠"
        if a is None:
            db.add(models.HealthAlert(schluessel=sch, stufe=w["stufe"], text=w["text"][:300],
                                      seit=jetzt, letzte_meldung=jetzt))
            push(f"{symbol} Pumpfoil-Server", w["text"])
        else:
            verschaerft = a.stufe != "rot" and w["stufe"] == "rot"
            alt_genug = (a.letzte_meldung is None
                         or (jetzt - a.letzte_meldung).total_seconds() >= WIEDERHOLUNG_H * 3600)
            a.stufe, a.text = w["stufe"], w["text"][:300]
            if verschaerft or alt_genug:
                seit_h = (jetzt - a.seit).total_seconds() / 3600
                zusatz = "" if verschaerft else f" (seit {seit_h:.0f} h)"
                a.letzte_meldung = jetzt
                push(f"{symbol} Pumpfoil-Server", w["text"] + zusatz)

    for sch, a in bekannt.items():
        if sch not in aktuell:
            push("🟢 Pumpfoil-Server", f"Wieder im Rahmen: {a.text}")
            db.delete(a)

    db.commit()
    return geschickt


def sammle(db: Session) -> dict:
    """Alles messen. Getrennt vom Endpunkt, damit der Zeitgeber (scripts/health-watch.py)
    genau dieselben Zahlen und dieselbe Bewertung benutzt wie der Bildschirm."""
    kerne = os.cpu_count() or 1
    try:
        last = list(os.getloadavg())
    except OSError:
        last = None

    cpu = _cpu_auslastung()
    sp = _speicher()
    platten = _platten()
    pg = _postgres(db)
    backup = _backups()
    fehler = _fehlerhafte_units()
    oom = _oom_vorfaelle()

    _stichprobe(db, cpu, sp, platten, last[0] if last else None)
    verlauf = []
    try:
        rows = (db.query(models.SystemSample)
                .order_by(models.SystemSample.id.desc()).limit(2000).all())
        verlauf = [{
            "t": int(r.created_at.timestamp()) if r.created_at else None,
            "cpu": r.cpu_prozent, "speicher": r.speicher_prozent, "swap": r.swap_prozent,
            "last1": r.last1, "root": r.platte_root_prozent, "tmp": r.platte_tmp_prozent,
        } for r in reversed(rows)]
    except Exception:  # noqa: BLE001
        verlauf = []

    uptime = 0.0
    try:
        uptime = float(_proc_datei("/proc/uptime").split()[0])
    except (ValueError, IndexError):
        pass

    return {
        "zeit": int(time.time()),
        "system": {
            "kernel": os.uname().release,
            "rechner": os.uname().nodename,
            "kerne": kerne,
            "cpu_modell": _cpu_modell(),
            "uptime_s": int(uptime),
        },
        "cpu": {"auslastung": cpu, "last": last, "last_je_kern": round(last[0] / kerne, 2) if last else None},
        "speicher": sp,
        "platten": platten,
        "prozesse": _prozesse(),
        "dienste": _dienste(),
        "timer": _timer(),
        "fehlerhafte_units": fehler,
        "postgres": pg,
        "backup": backup,
        "oom_24h": oom,
        "medien_bytes": _verzeichnis_groesse(os.path.join(os.getcwd(), "media")),
        "warnungen": _warnungen(cpu, sp, platten, last, kerne, pg, backup, fehler, oom),
        "verlauf": verlauf,
    }


@router.get("")
def system_health(_a: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> dict:
    """Momentaufnahme + Verlauf fuer den Admin-Bildschirm.

    Meldet nebenbei auch: wer hinschaut, loest dieselbe Pruefung aus wie der Zeitgeber. Doppelte
    Push-Nachrichten kann das nicht geben, dagegen steht die Buchfuehrung in `melde`.
    """
    d = sammle(db)
    try:
        melde(db, d["warnungen"])
    except Exception:  # noqa: BLE001 — eine gescheiterte Meldung darf den Bildschirm nicht kosten
        db.rollback()
    return d


def _verzeichnis_groesse(pfad: str, budget_s: float = 0.4) -> int | None:
    """Grösse eines Verzeichnisses mit ZEITLIMIT.

    Der Medienordner kann viele Tausend Dateien haben, und ein Admin-Bildschirm darf davon nicht
    hängen. Läuft das Budget ab, kommt `None` zurück (die Karte zeigt dann „—" statt einer Zahl,
    die nur halb gezählt ist).
    """
    ende = time.monotonic() + budget_s
    gesamt = 0
    try:
        for wurzel, _dirs, dateien in os.walk(pfad):
            for n in dateien:
                try:
                    gesamt += os.stat(os.path.join(wurzel, n)).st_size
                except OSError:
                    pass
            if time.monotonic() > ende:
                return None
    except OSError:
        return None
    return gesamt
