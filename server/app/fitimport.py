"""FIT-Datei-Import: vorhandene Aktivitäten (.fit) in unser Roh-Format wandeln.

Übernimmt record-Messages (GPS/Speed/Puls @ ~1 Hz) UND — falls vorhanden —
accelerometer_data-Messages (rohe Beschleunigung, via SensorLogging; sowohl unsere
eigene App als auch andere Apps schreiben das ins FIT). Beides auf eine gemeinsame
Zeitachse (t0 = frühester Zeitstempel) gelegt, damit die Pump-Maske (Accel ∩ Foiling)
zeitlich passt.

Geräteunabhängige IQ-Felder wie foil_status werden NICHT vorausgesetzt (app-spezifisch).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import numpy as np

# Semicircles -> Grad (FIT-Positionsformat).
_SEMI_TO_DEG = 180.0 / (2 ** 31)
# calibrated_accel ist in milli-g -> g; unser int16-Format skaliert mit 2048 pro g.
ACCEL_SCALE = 2048
_MG_TO_INT16 = ACCEL_SCALE / 1000.0


# --- Reparatur kaputter Feld-Deklarationen (Xiaomi / Mi Fitness ueber Suunto) -------------
# Belegt am 04.09.2026 an einer echten Datei aus der Kette Redmi Watch -> Mi Fitness ->
# Suunto -> unser Import (Nutzer u417). Diese Schreiber deklarieren JEDES Mehr-Byte-Feld als
# `byte` mit Groesse N, statt als den richtigen Zahlentyp:
#
#   timestamp      profil-typ=date_time  basis-typ-in-datei=byte  groesse=4
#   position_lat   profil-typ=sint32     basis-typ-in-datei=byte  groesse=4
#
# `fitparse` liest daraus folgerichtig ein Byte-ARRAY und liefert Tupel statt Zahlen; der
# eingebaute Typ-Prozessor stirbt dann an `'>=' not supported between 'tuple' and 'int'`, und
# die ganze Datei war fuer uns unlesbar — 0 importiert / 1 ignoriert, ohne erkennbaren Grund.
#
# Die WERTE sind in Ordnung, nur falsch verpackt: in der von der Datei selbst angegebenen
# Byte-Reihenfolge (hier `>`) zusammengesetzt kommt genau heraus, was Suunto in der
# Zusammenfassung nennt (221,0 m; Startzeit 1788531124). Deshalb wird hier nachtraeglich
# zusammengesetzt statt die Datei abzulehnen.
#
# Die Bedingung ist eng gefasst, damit gesunde Dateien unberuehrt bleiben: NUR wenn die Datei
# `byte` sagt, das Profil an dieser Stelle einen mehrere Byte breiten ZAHLEN-Typ vorsieht und
# die Groesse exakt dessen Breite ist. Felder, die laut Profil wirklich `byte` sind (rohe
# Datenbloecke), und echte Arrays (z. B. `calibrated_accel_x`) fallen nicht darunter.
_REPARATUR = None


def _reparatur_prozessor():
    """Datenprozessor, der byte-verpackte Zahlenfelder wieder zusammensetzt (s. Kommentar oben)."""
    global _REPARATUR
    if _REPARATUR is not None:
        return _REPARATUR()

    from fitparse.processors import FitFileDataProcessor

    class ByteArrayReparatur(FitFileDataProcessor):
        def run_type_processor(self, field_data):
            try:
                super().run_type_processor(field_data)
            except TypeError:
                # Tupel statt Zahl — die Reparatur laeuft in `run_message_processor`, dort ist
                # die Byte-Reihenfolge der Nachricht bekannt. Hier nur nicht daran sterben.
                if not isinstance(field_data.value, tuple):
                    raise

        def run_message_processor(self, data_message):
            gross = data_message.def_mesg.endian == ">"
            for fd in data_message.fields:
                self._zusammensetzen(fd, gross)
            super().run_message_processor(data_message)

        def _zusammensetzen(self, fd, gross: bool) -> None:
            fdef, feld = fd.field_def, fd.field
            if fdef is None or feld is None or not isinstance(fd.raw_value, tuple):
                return
            if fdef.base_type.name != "byte":
                return
            bt = feld.base_type
            # Nur Zahlentypen, und nur bei exakt passender Breite (s. Kommentar oben).
            if bt.name == "byte" or bt.size < 2 or bt.size != len(fd.raw_value) or fdef.size != bt.size:
                return
            try:
                bs = bytes(int(b) & 0xFF for b in fd.raw_value)
            except (TypeError, ValueError):
                return
            roh = int.from_bytes(bs, "big" if gross else "little",
                                 signed=bt.name.startswith("sint"))
            if bt.parse:
                roh = bt.parse(roh)          # FIT-Marker „kein Wert" -> None
            wert = feld.render(roh)
            # Skalierung/Offset wie in `fitparse.FitFile._apply_scale_offset`.
            if isinstance(wert, (int, float)) and not isinstance(wert, bool):
                if feld.scale:
                    wert = float(wert) / feld.scale
                if feld.offset:
                    wert = wert - feld.offset
            fd.raw_value, fd.value = roh, wert
            # Jetzt greifen die eingebauten Prozessoren wieder (date_time -> datetime usw.).
            super_self = super()
            super_self.run_type_processor(fd)
            super_self.run_field_processor(fd)
            super_self.run_unit_processor(fd)

    _REPARATUR = ByteArrayReparatur
    return _REPARATUR()


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _record_time(r: dict) -> datetime | None:
    t = r.get("timestamp")
    return _aware(t) if t is not None else None


def _accel_msg_time(m: dict) -> datetime | None:
    t = m.get("timestamp")
    if t is None:
        return None
    t = _aware(t)
    tms = m.get("timestamp_ms")
    return t + timedelta(milliseconds=tms) if tms is not None else t


def gps_from_records(records: list[dict], t0: datetime) -> list:
    """record-Dicts -> gps_samples [t_ms, lat, lon, speed, hr, hacc], relativ zu t0.
    Nur Records mit gültiger Position."""
    samples = []
    for r in records:
        lat_s = r.get("position_lat")
        lon_s = r.get("position_long")
        ts = _record_time(r)
        if lat_s is None or lon_s is None or ts is None:
            continue
        speed = r.get("enhanced_speed")
        if speed is None:
            speed = r.get("speed")
        if speed is None:
            speed = r.get("gps_speed")
        hr = r.get("heart_rate")
        hacc = r.get("gps_accuracy")
        samples.append([
            int((ts - t0).total_seconds() * 1000),
            float(lat_s * _SEMI_TO_DEG),
            float(lon_s * _SEMI_TO_DEG),
            float(speed) if speed is not None else None,
            int(hr) if hr is not None else None,
            float(hacc) if hacc is not None else None,
        ])
    return samples


def accel_from_messages(accel_msgs: list[dict]) -> tuple[bytes, int]:
    """accelerometer_data-Dicts -> (int16-LE-Bytes interleaved x,y,z, geschätzte Hz).
    calibrated_accel_* sind Arrays je Message (milli-g)."""
    xs, ys, zs = [], [], []
    for m in accel_msgs:
        ax = m.get("calibrated_accel_x")
        ay = m.get("calibrated_accel_y")
        az = m.get("calibrated_accel_z")
        if ax is None or ay is None or az is None:
            continue
        if not isinstance(ax, (list, tuple)):
            ax, ay, az = [ax], [ay], [az]
        n = min(len(ax), len(ay), len(az))
        xs.extend(ax[:n]); ys.extend(ay[:n]); zs.extend(az[:n])
    if not xs:
        return b"", 0

    arr = np.empty((len(xs), 3), dtype=np.float64)
    arr[:, 0] = xs; arr[:, 1] = ys; arr[:, 2] = zs
    # mg -> int16 (skaliert), NaNs -> 0, clip auf int16-Bereich.
    arr = np.nan_to_num(arr) * _MG_TO_INT16
    inter = np.clip(arr, -32768, 32767).astype("<i2").reshape(-1)

    span_s = 0.0
    first, last = _accel_msg_time(accel_msgs[0]), _accel_msg_time(accel_msgs[-1])
    if first and last:
        span_s = (last - first).total_seconds()
    hz = int(round(len(xs) / span_s)) if span_s > 0 else 25
    # Plausibilität: bei unzuverlässigen FIT-Zeitstempeln (z. B. SensorLogger, span~0)
    # käme ein absurder Wert raus (z. B. 16675 Hz) -> auf 25 Hz (App-Default) zurückfallen.
    # Reale Garmin-Accel-Raten reichen bis 100 Hz (fēnix höchste Stufe), daher Obergrenze
    # großzügig (nur echt absurde Werte verwerfen), sonst würde die Analyse falsch alignen.
    if hz < 5 or hz > 200:
        hz = 25
    return inter.tobytes(), hz


def parse_fit_bytes(data: bytes) -> dict:
    """Parst FIT-Bytes. Rückgabe-Dict: gps_samples, accel_bytes, accel_hz, started_at, sport."""
    import fitparse

    try:
        fit = fitparse.FitFile(data, data_processor=_reparatur_prozessor())
        records, accel_msgs = [], []
        sport = "pumpfoil"
        # Dateiart aus `file_id.type` mitnehmen. Ohne die kann man einem Nutzer nicht sagen, WARUM
        # eine formal gültige FIT-Datei nichts hergibt: eine Tagesaufzeichnung (Schritte/Stress,
        # type=monitoring_b) enthält gar keine `record`-Messages. Genau das kam als „wird nicht als
        # FIT-Datei erkannt" zurück, was in die falsche Richtung führt.
        fit_type = None
        for msg in fit.get_messages():
            if msg.name == "file_id":
                fit_type = {d.name: d.value for d in msg}.get("type")
            if msg.name == "record":
                records.append({d.name: d.value for d in msg})
            elif msg.name == "accelerometer_data":
                accel_msgs.append({d.name: d.value for d in msg})
            elif msg.name in ("sport", "session"):
                # `sport`-Nachricht ODER die Sportart in der `session`-Nachricht. Letztere war
                # bis 05.09.2026 uebersehen — und genau dort steht sie bei SUUNTO: deren Dateien
                # haben ueberhaupt keine `sport`-Nachricht, nur `session.sport`. Folge: JEDE
                # Suunto-Session kam mit der Voreinstellung „pumpfoil" herein, auch wenn in der
                # Datei „sailing" stand (belegt an Session 3501). Die `sport`-Nachricht bleibt
                # vorrangig, weil sie die speziellere Angabe ist.
                if msg.name == "session" and sport != "pumpfoil":
                    continue
                vals = {d.name: d.value for d in msg}
                sp = vals.get("sport")
                sub = vals.get("sub_sport")
                # 'generic' ist nichtssagend -> dann das aussagekräftigere sub_sport nehmen
                # (z.B. Pump-Foiling kommt oft als generic/open_water -> "open_water";
                #  Surfen/Laufen/Radfahren stehen direkt in sport).
                if sp and sp != "generic":
                    sport = str(sp)
                elif sub:
                    sport = str(sub)
                elif sp:
                    sport = str(sp)
    except Exception as exc:
        raise ValueError(f"Unreadable FIT file: {exc}") from exc

    # Zeitbasis NUR aus den GPS-Record-Zeitstempeln. Accel-Zeitstempel (SensorLogger)
    # sind teils unzuverlässig/konstant (z. B. alle == Aktivitäts-Start), würden t0
    # verfälschen -> riesiger t_ms-Versatz + Accel/GPS-Fehlalignment. Nur wenn es gar
    # keine Records gibt, als Notnagel die Accel-Zeit nehmen.
    times = [t for t in (_record_time(r) for r in records) if t]
    if not times:
        a0 = _accel_msg_time(accel_msgs[0]) if accel_msgs else None
        if a0 is None:
            return {"gps_samples": [], "accel_bytes": b"", "accel_hz": 0, "started_at": None,
                    "sport": sport, "fit_type": fit_type, "record_count": len(records)}
        times = [a0]
    t0 = min(times)

    gps_samples = gps_from_records(records, t0)
    accel_bytes, accel_hz = accel_from_messages(accel_msgs)
    # foil_status (Developer-Feld anderer Apps) parallel zu gps_samples — NUR als
    # optionale Ground-Truth fürs Training, falls vorhanden. Gleiche Filterung wie gps.
    foil_status = [
        r.get("foil_status")
        for r in records
        if r.get("position_lat") is not None
        and r.get("position_long") is not None
        and r.get("timestamp") is not None
    ]
    return {
        # Dateiart + Anzahl der Track-Punkte: erlaubt dem Aufrufer eine KONKRETE Fehlermeldung,
        # statt „keine GPS-Daten" für zwei völlig verschiedene Ursachen.
        "fit_type": fit_type,
        "record_count": len(records),
        "gps_samples": gps_samples,
        "accel_bytes": accel_bytes,
        "accel_hz": accel_hz,
        "started_at": t0,
        "sport": sport,
        "foil_status": foil_status,
    }
