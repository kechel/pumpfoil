"""Session-Export als GPX und FIT — Download der EIGENEN Session (Web-Buttons in der Detailseite).

Warum selbst kodieren: `fitparse` (unsere FIT-Abhaengigkeit) kann nur LESEN. Ein Encoder waere eine
weitere Abhaengigkeit fuer eine Datei, deren Aufbau vollstaendig dokumentiert ist — hier sind es
~120 Zeilen, und wir kontrollieren, welche Messages drinstehen. Gegengeprueft wird das Ergebnis
nicht durch Zusehen, sondern durch Rueckimport mit fitparse (siehe scripts/export-check.py):
Punktzahl, Koordinaten, Zeitachse und Puls muessen exakt wieder herauskommen.

Was exportiert wird — bewusst DAS, WAS DIE SESSION ZEIGT:
  * Trim UND aussortierte Zeitbereiche sind angewandt (dieselbe Achse wie die Analyse, ueber
    `build_timebase_for_session`). Wer die Autofahrt nach Hause weggeschnitten hat, will sie auch
    nicht in Strava haben. Umkehrbar ist das jederzeit — die Rohdaten bleiben unberuehrt.
  * Distanz laeuft NICHT ueber eine Luecke hinweg: nach einem Sprung > `_LUECKE_S` (Ausschluss oder
    GPS-Ausfall) beginnt ein neues Segment und die Strecke zaehlt weiter, ohne die Luftlinie
    dazwischen mitzurechnen. Sonst erfindet eine ausgeschnittene Heimfahrt Kilometer.
  * KEIN Accel: GPX und FIT-`record` sind 1-Hz-Formate. Die rohe Beschleunigung ist unser
    Eigenformat und gehoert nicht in eine Track-Datei.
"""
from __future__ import annotations

import math
import struct
from datetime import datetime, timedelta, timezone
from xml.sax.saxutils import escape, quoteattr

# Ab dieser Luecke zwischen zwei GPS-Punkten gilt der Track als unterbrochen: neues <trkseg>,
# und die Distanz zaehlt ohne die Luftlinie weiter. 30 s ist grosszuegig gegen normale
# GPS-Ausfaelle (1 Hz, einzelne fehlende Sekunden) und trifft jeden echten Ausschnitt.
_LUECKE_S = 30.0

# FIT-Zeitstempel = Sekunden seit 1989-12-31 00:00 UTC (uint32).
_FIT_EPOCH = datetime(1989, 12, 31, tzinfo=timezone.utc)
# FIT-Positionen in Semicircles: 2^31 entspricht 180 Grad.
_SEMI_PRO_GRAD = 2 ** 31 / 180.0

# sport-String der Session -> FIT-Sport-Enum. Unsere eigenen Aufnahmen tragen "pumpfoil"; dafuer
# gibt es in FIT (und damit in Garmin Connect/Strava) keinen Wert — surfing (38) ist der naechste
# echte Wassersport-Eintrag und wird von den Importeuren sinnvoll angezeigt. Alle uebrigen Namen
# stammen ohnehin aus FIT-Importen und behalten ihren Enum-Wert. Unbekanntes wird NICHT geraten,
# sondern generic (0) — lieber unspezifisch als falsch einsortiert.
_FIT_SPORT = {
    "pumpfoil": 38, "surfing": 38, "generic": 0, "running": 1, "cycling": 2, "swimming": 5,
    "training": 10, "walking": 11, "cross_country_skiing": 12, "alpine_skiing": 13,
    "snowboarding": 14, "rowing": 15, "hiking": 17, "paddling": 19, "inline_skating": 30,
    "sailing": 32, "ice_skating": 33, "stand_up_paddleboarding": 37, "wakeboarding": 39,
    "water_skiing": 40, "kayaking": 41, "rafting": 42, "windsurfing": 43, "kitesurfing": 44,
}


# ---------------------------------------------------------------- Aufbereitung

class Punkt:
    """Ein Trackpunkt, fertig fuer beide Formate."""

    __slots__ = ("t", "lat", "lon", "v", "hr", "dist_m", "neu")

    def __init__(self, t: datetime, lat: float, lon: float, v: float | None,
                 hr: int | None, dist_m: float, neu: bool):
        self.t = t; self.lat = lat; self.lon = lon
        self.v = v; self.hr = hr; self.dist_m = dist_m
        self.neu = neu          # erster Punkt eines Segments (nach Luecke/Ausschnitt)


def _hav_m(la1: float, lo1: float, la2: float, lo2: float) -> float:
    p1 = math.radians(la1); p2 = math.radians(la2)
    dp = p2 - p1; dl = math.radians(lo2 - lo1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371000.0 * math.asin(min(1.0, math.sqrt(max(a, 0.0))))


def punkte(gps: list, started_at: datetime) -> list[Punkt]:
    """GPS-Rohzeilen [t_ms, lat, lon, v_mps, hr, hacc] -> Trackpunkte mit Uhrzeit und Distanz.

    Zeilen ohne Position fallen weg (eine trkpt/record-Zeile OHNE Koordinate ist in beiden
    Formaten wertlos). `started_at` ist der Session-Start; t_ms ist der Offset dazu.
    """
    t0 = started_at if started_at.tzinfo else started_at.replace(tzinfo=timezone.utc)
    out: list[Punkt] = []
    dist = 0.0
    vor: Punkt | None = None
    for r in gps:
        if len(r) < 3 or r[1] is None or r[2] is None:
            continue
        try:
            t_ms = int(r[0]); lat = float(r[1]); lon = float(r[2])
        except (TypeError, ValueError):
            continue
        if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
            continue
        v = float(r[3]) if len(r) > 3 and r[3] is not None else None
        hr = int(r[4]) if len(r) > 4 and r[4] is not None and 0 < int(r[4]) < 255 else None
        t = t0 + timedelta(milliseconds=t_ms)
        neu = vor is None or (t - vor.t).total_seconds() > _LUECKE_S
        if not neu and vor is not None:
            dist += _hav_m(vor.lat, vor.lon, lat, lon)
        p = Punkt(t, lat, lon, v, hr, dist, neu)
        out.append(p)
        vor = p
    return out


def dateiname(session, endung: str) -> str:
    """pumpfoil-<datum>-<id>.<endung> — Datum in der Zeitzone der Aufnahme, wenn bekannt."""
    t = session.started_at
    if t is not None and t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    tz = getattr(session, "tz", None)
    if t is not None and tz:
        try:
            from zoneinfo import ZoneInfo
            t = t.astimezone(ZoneInfo(tz))
        except Exception:      # unbekannte Zone -> UTC-Datum, nur der Dateiname haengt dran
            pass
    tag = t.strftime("%Y-%m-%d") if t is not None else "session"
    return f"pumpfoil-{tag}-{session.id}.{endung}"


# ---------------------------------------------------------------- GPX

def gpx_bytes(session, pts: list[Punkt]) -> bytes:
    """GPX 1.1. Puls in der Garmin-TrackPointExtension (v1) — das lesen alle Werkzeuge.

    Die gemessene (Doppler-)Geschwindigkeit steht in unserem EIGENEN Namensraum `pf:speed`:
    GPX 1.1 kennt kein Speed-Feld, und die v1-TrackPointExtension enthaelt es laut Schema
    ebenfalls nicht — sie dort hineinzuschreiben waere formal falsch. Werkzeuge, die den
    Namensraum nicht kennen, ignorieren das Element (so ist `extensions` gedacht) und rechnen
    die Geschwindigkeit wie ueblich aus Zeit und Strecke.
    """
    name = (getattr(session, "caption", None) or getattr(session, "place_name", None)
            or "Pumpfoil Session")
    sport = getattr(session, "sport", None) or "pumpfoil"
    L: list[str] = []
    L.append('<?xml version="1.0" encoding="UTF-8"?>')
    L.append('<gpx version="1.1" creator="Pumpfoil.org"'
             ' xmlns="http://www.topografix.com/GPX/1/1"'
             ' xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"'
             ' xmlns:pf="https://pumpfoil.org/xmlschemas/track/v1">')
    if pts:
        L.append(f"  <metadata><name>{escape(name)}</name>"
                 f"<time>{_iso(pts[0].t)}</time></metadata>")
    L.append(f"  <trk><name>{escape(name)}</name><type>{escape(sport)}</type>")
    offen = False
    for p in pts:
        if p.neu:
            if offen:
                L.append("    </trkseg>")
            L.append("    <trkseg>")
            offen = True
        ext = ""
        if p.hr is not None:
            ext += f"<gpxtpx:TrackPointExtension><gpxtpx:hr>{p.hr}</gpxtpx:hr></gpxtpx:TrackPointExtension>"
        if p.v is not None:
            ext += f"<pf:speed>{p.v:.3f}</pf:speed>"
        L.append(f'      <trkpt lat="{p.lat:.7f}" lon="{p.lon:.7f}"><time>{_iso(p.t)}</time>'
                 + (f"<extensions>{ext}</extensions>" if ext else "")
                 + "</trkpt>")
    if offen:
        L.append("    </trkseg>")
    L.append("  </trk>")
    L.append("</gpx>")
    return ("\n".join(L) + "\n").encode("utf-8")


def _iso(t: datetime) -> str:
    """UTC mit Millisekunden — unsere GPS-Zeitstempel liegen nicht auf ganzen Sekunden."""
    u = t.astimezone(timezone.utc)
    return u.strftime("%Y-%m-%dT%H:%M:%S.") + f"{u.microsecond // 1000:03d}Z"


# ---------------------------------------------------------------- FIT

# Basistypen: Name -> (FIT-Basistyp-Byte, struct-Format, Ungueltig-Wert).
_BT: dict[str, tuple[int, str, int]] = {
    "enum":   (0x00, "B", 0xFF),
    "uint8":  (0x02, "B", 0xFF),
    "uint16": (0x84, "H", 0xFFFF),
    "uint32": (0x86, "I", 0xFFFFFFFF),
    "sint32": (0x85, "i", 0x7FFFFFFF),
    "uint32z": (0x8C, "I", 0),
}

_F_FILE_ID = [(0, "enum"), (1, "uint16"), (2, "uint16"), (3, "uint32z"), (4, "uint32")]
_F_RECORD = [(253, "uint32"), (0, "sint32"), (1, "sint32"), (5, "uint32"), (6, "uint16"), (3, "uint8")]
_F_LAP = [(254, "uint16"), (253, "uint32"), (2, "uint32"), (7, "uint32"), (8, "uint32"),
          (9, "uint32"), (0, "enum"), (1, "enum")]
_F_SESSION = [(254, "uint16"), (253, "uint32"), (2, "uint32"), (7, "uint32"), (8, "uint32"),
              (9, "uint32"), (5, "enum"), (6, "enum"), (25, "uint16"), (26, "uint16"),
              (14, "uint16"), (15, "uint16"), (16, "uint8"), (17, "uint8"), (0, "enum"), (1, "enum")]
_F_ACTIVITY = [(253, "uint32"), (15, "uint32"), (1, "uint16"), (2, "enum"), (3, "enum"),
               (4, "enum"), (5, "uint32")]


def _def_msg(local: int, global_num: int, felder: list[tuple[int, str]]) -> bytes:
    out = bytearray([0x40 | (local & 0x0F), 0x00, 0x00])     # Header, reserved, Architektur=LE
    out += struct.pack("<H", global_num)
    out.append(len(felder))
    for num, typ in felder:
        base, fmt, _ = _BT[typ]
        out += bytes([num, struct.calcsize(fmt), base])
    return bytes(out)


def _data_msg(local: int, felder: list[tuple[int, str]], werte: list) -> bytes:
    out = bytearray([local & 0x0F])
    for (_, typ), v in zip(felder, werte):
        base, fmt, ungueltig = _BT[typ]
        out += struct.pack("<" + fmt, ungueltig if v is None else int(v))
    return bytes(out)


_CRC_TAB = (0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
            0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400)


def _crc16(data: bytes, crc: int = 0) -> int:
    """FIT-CRC (nibble-Tabelle, wie im FIT-Protokoll beschrieben)."""
    for b in data:
        tmp = _CRC_TAB[crc & 0xF]
        crc = (crc >> 4) & 0x0FFF
        crc = crc ^ tmp ^ _CRC_TAB[b & 0xF]
        tmp = _CRC_TAB[crc & 0xF]
        crc = (crc >> 4) & 0x0FFF
        crc = crc ^ tmp ^ _CRC_TAB[(b >> 4) & 0xF]
    return crc & 0xFFFF


def _fit_ts(t: datetime) -> int:
    return int((t.astimezone(timezone.utc) - _FIT_EPOCH).total_seconds())


def fit_bytes(session, pts: list[Punkt]) -> bytes:
    """Aktivitaets-FIT mit file_id + record + lap + session + activity.

    Genau diese fuenf Message-Typen sind das Minimum, das Garmin Connect und Strava als
    Aktivitaet (nicht als Rohdatei) annehmen. Hersteller-ID 255 = "development" — wir geben uns
    nicht als Garmin aus. Zeitstempel sind in FIT ganze Sekunden: faellt mehr als ein Punkt in
    dieselbe Sekunde (Rate leicht ueber 1 Hz), bleibt der erste stehen, sonst haette die Datei
    doppelte Zeitpunkte.
    """
    ganz: list[Punkt] = []
    letzte_sek = None
    for p in pts:
        s = _fit_ts(p.t)
        if s == letzte_sek:
            continue
        letzte_sek = s
        ganz.append(p)

    body = bytearray()
    body += _def_msg(0, 0, _F_FILE_ID)
    jetzt = _fit_ts(ganz[0].t if ganz else datetime.now(timezone.utc))
    # type=4 (activity), manufacturer=255 (development), product=1, serial=0 (unbekannt)
    body += _data_msg(0, _F_FILE_ID, [4, 255, 1, 0, jetzt])

    body += _def_msg(1, 20, _F_RECORD)
    for p in ganz:
        body += _data_msg(1, _F_RECORD, [
            _fit_ts(p.t),
            int(round(p.lat * _SEMI_PRO_GRAD)),
            int(round(p.lon * _SEMI_PRO_GRAD)),
            int(round(p.dist_m * 100.0)),
            None if p.v is None else max(0, min(0xFFFE, int(round(p.v * 1000.0)))),
            p.hr,
        ])

    t_start = ganz[0].t if ganz else (session.started_at or datetime.now(timezone.utc))
    t_ende = ganz[-1].t if ganz else t_start
    dauer_ms = int(max(0.0, (t_ende - t_start).total_seconds()) * 1000)
    strecke_cm = int(round((ganz[-1].dist_m if ganz else 0.0) * 100.0))
    sport = _FIT_SPORT.get((getattr(session, "sport", None) or "pumpfoil"), 0)
    speeds = [p.v for p in ganz if p.v is not None]
    hrs = [p.hr for p in ganz if p.hr is not None]
    v_avg = int(round(sum(speeds) / len(speeds) * 1000)) if speeds else None
    v_max = int(round(max(speeds) * 1000)) if speeds else None

    body += _def_msg(2, 19, _F_LAP)
    # event=9 (lap), event_type=1 (stop)
    body += _data_msg(2, _F_LAP, [0, _fit_ts(t_ende), _fit_ts(t_start), dauer_ms, dauer_ms,
                                 strecke_cm, 9, 1])

    body += _def_msg(3, 18, _F_SESSION)
    # event=8 (session), event_type=1 (stop); first_lap_index=0, num_laps=1
    body += _data_msg(3, _F_SESSION, [0, _fit_ts(t_ende), _fit_ts(t_start), dauer_ms, dauer_ms,
                                      strecke_cm, sport, 0, 0, 1, v_avg, v_max,
                                      int(round(sum(hrs) / len(hrs))) if hrs else None,
                                      max(hrs) if hrs else None, 8, 1])

    body += _def_msg(4, 34, _F_ACTIVITY)
    # type=0 (manual), event=26 (activity), event_type=1 (stop); local_timestamp = UTC
    body += _data_msg(4, _F_ACTIVITY, [_fit_ts(t_ende), dauer_ms, 1, 0, 26, 1, _fit_ts(t_ende)])

    kopf = bytearray()
    kopf += bytes([14, 0x20])                    # Header-Laenge, Protokoll 2.0
    kopf += struct.pack("<H", 2140)              # Profil-Version 21.40
    kopf += struct.pack("<I", len(body))
    kopf += b".FIT"
    kopf += struct.pack("<H", _crc16(bytes(kopf)))
    datei = bytes(kopf) + bytes(body)
    return datei + struct.pack("<H", _crc16(datei))
