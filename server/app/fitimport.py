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
                if self._unlesbar(fd):
                    continue
                self._zusammensetzen(fd, gross)
            super().run_message_processor(data_message)

        def _unlesbar(self, fd) -> bool:
            """Feld, das die Datei SCHMALER deklariert, als sein Typ breit ist -> None.

            Gegenstueck zu `_zusammensetzen`: dort passt die Breite exakt und die Werte sind
            nur falsch verpackt, hier fehlen schlicht Bytes. Aus 1 Byte laesst sich kein
            uint32 rekonstruieren — jeder Wert waere geraten. Lieber ein leeres Feld als eine
            erfundene Zahl: bei `timestamp` wuerde geraten die ganze Session auf eine falsche
            Uhrzeit legen, und das faellt niemandem auf. Faellt das Feld weg, greifen die
            vorhandenen Wege (Zeit fehlt -> Datei wird mit klarer Begruendung abgelehnt).
            """
            fdef, feld = fd.field_def, fd.field
            if fdef is None or feld is None or fdef.base_type.name != "byte":
                return False
            bt = getattr(feld, "base_type", None)
            # Genau die Lage, die `_toleranter_fitfile` hinterlaesst: als `byte` gelesen, weil
            # die Datei WENIGER Bytes vorsieht, als der Typ laut Profil braucht. Ein gesundes
            # `byte`-Feld ist nie schmaler als sein Profiltyp, ein Xiaomi-Feld nie schmaler
            # als exakt eine Typbreite — deshalb trifft das nur den kaputten Fall.
            if bt is None or bt.size <= fdef.size:
                return False
            fd.raw_value, fd.value = None, None
            return True

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


# --- Toleranz gegen kaputte Feld-BREITEN (COROS PACE 3) ---------------------------------
# Belegt am 06.09.2026 an einem echten Training von Nutzer u277 (erster COROS-Import
# ueberhaupt): der Sync brach mit
#
#   Unreadable FIT file: Invalid field size 1 for type 'uint32' (expected a multiple of 4)
#
# ab. Anders als bei Xiaomi (s. oben) stimmt hier nicht die Verpackung nicht, sondern die
# BREITE: die Datei deklariert ein Feld mit 1 Byte, dessen Basistyp 4 Byte breit ist.
# `fitparse` wirft daraufhin schon beim DEFINITIONSSATZ — bevor irgendein Datenprozessor
# laeuft. Ein Prozessor kann das also nicht mehr auffangen, es muss hier passieren.
#
# `fitparse` selbst sieht den Ausweg vor und laesst ihn nur offen (Kommentar an der Stelle:
# "we could fall back to byte encoding if there's any examples in the wild"). Das Beispiel
# aus der Wildnis liegt jetzt vor, also gehen wir diesen Weg: das Feld wird als `byte`
# gelesen. Entscheidend ist, dass die GROESSE unveraendert bleibt — sie schiebt den
# Lesezeiger weiter, der Rest der Nachricht bleibt dadurch exakt in der Spur. Verloren geht
# nur dieses eine Feld — der Prozessor oben erkennt die Lage und leert es, statt aus einem
# Byte eine Zahl zu erfinden.
_TOLERANT = None


def _toleranter_fitfile():
    """FitFile-Variante, die kaputte Feld-Breiten ueberliest statt die Datei abzulehnen."""
    global _TOLERANT
    if _TOLERANT is not None:
        return _TOLERANT

    import fitparse
    from fitparse.records import BASE_TYPES, BASE_TYPE_BYTE

    class BreitenTolerant(fitparse.FitFile):
        def _parse_definition_message(self, header):
            # Die Original-Methode wird NICHT nachgebaut (45 Zeilen Fremdcode, die veralten).
            # Stattdessen wird waehrend ihres Laufs das Lesen der Feld-Tripel abgefangen:
            # def_num, Groesse und Basistyp stehen in genau diesen drei Bytes, und nur dort
            # ist beides gleichzeitig bekannt. Passt die Groesse nicht zum Basistyp, geben wir
            # `byte` zurueck — Groesse unveraendert, Lesezeiger bleibt in der Spur.
            echt = self._read_struct

            def mit_blick(fmt, *a, **kw):
                wert = echt(fmt, *a, **kw)
                if fmt == "3B":
                    def_num, groesse, basis = wert
                    bt = BASE_TYPES.get(basis, BASE_TYPE_BYTE)
                    if groesse % bt.size:
                        return (def_num, groesse, BASE_TYPE_BYTE.identifier)
                return wert

            self._read_struct = mit_blick
            try:
                return super()._parse_definition_message(header)
            finally:
                del self._read_struct

    _TOLERANT = BreitenTolerant
    return _TOLERANT


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


def _ernten(fit) -> tuple[list, list, str, object, Exception | None]:
    """Nachrichten einsammeln — und behalten, was gelesen wurde, wenn der Strom mittendrin abreisst.

    Warum das wichtig ist: eine FIT-Datei wird von vorn nach hinten gelesen, die Trackpunkte
    stehen der Reihe nach drin. Bricht das Lesen bei 60 % ab, sind die ersten 60 % der Fahrt
    trotzdem vollstaendig da. Vorher lag die ganze Schleife in EINEM try/except — ein Fehler am
    Ende der Datei hat auch den Anfang weggeworfen. Das trifft genau die Faelle, die am ehesten
    vorkommen: leerer Akku mitten in der Session, abgebrochener Sync, Muell hinter dem Dateiende.
    """
    records, accel_msgs = [], []
    sport = "pumpfoil"
    # Dateiart aus `file_id.type` mitnehmen. Ohne die kann man einem Nutzer nicht sagen, WARUM
    # eine formal gültige FIT-Datei nichts hergibt: eine Tagesaufzeichnung (Schritte/Stress,
    # type=monitoring_b) enthält gar keine `record`-Messages. Genau das kam als „wird nicht als
    # FIT-Datei erkannt" zurück, was in die falsche Richtung führt.
    fit_type = None
    strom = fit.get_messages()
    abbruch: Exception | None = None
    while True:
        try:
            msg = next(strom)
        except StopIteration:
            break
        except Exception as exc:      # Datei zu Ende, CRC falsch, Muell dahinter -> aufhoeren
            abbruch = exc
            break
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
    return records, accel_msgs, sport, fit_type, abbruch


def parse_fit_bytes(data: bytes) -> dict:
    """Parst FIT-Bytes. Rückgabe-Dict: gps_samples, accel_bytes, accel_hz, started_at, sport.

    Gibt zusaetzlich `abbruch` zurueck: die Begruendung, falls die Datei nur bis zu einer
    bestimmten Stelle gelesen werden konnte (sonst None). Der Import laeuft trotzdem — mit dem,
    was da ist.
    """
    # Zweimal probieren: erst streng, dann ohne Pruefsumme. Die Pruefsumme sagt „an dieser Datei
    # hat sich etwas veraendert" — sie sagt nicht, dass die Messwerte unbrauchbar sind, und
    # etliche Schreiber setzen sie schlicht falsch oder auf 0. Eine ganze Session deswegen
    # wegzuwerfen ist die schlechtere der beiden Antworten; unplausible Punkte fischt die
    # Analyse ohnehin heraus. Streng bleibt der erste Versuch, damit gesunde Dateien unveraendert
    # denselben Weg nehmen wie bisher.
    letzter: Exception | None = None
    for pruefsumme in (True, False):
        try:
            fit = _toleranter_fitfile()(data, data_processor=_reparatur_prozessor(),
                                        check_crc=pruefsumme)
        except Exception as exc:          # Kopf unlesbar -> gar keine FIT-Datei
            letzter = exc
            continue
        records, accel_msgs, sport, fit_type, abbruch = _ernten(fit)
        if abbruch is None or records or accel_msgs:
            break
        letzter = abbruch
    else:
        raise ValueError(f"Unreadable FIT file: {letzter}")
    if abbruch is not None and not (records or accel_msgs):
        raise ValueError(f"Unreadable FIT file: {abbruch}")
    abbruch_text = f"{type(abbruch).__name__}: {abbruch}" if abbruch else None

    # Zeitbasis NUR aus den GPS-Record-Zeitstempeln. Accel-Zeitstempel (SensorLogger)
    # sind teils unzuverlässig/konstant (z. B. alle == Aktivitäts-Start), würden t0
    # verfälschen -> riesiger t_ms-Versatz + Accel/GPS-Fehlalignment. Nur wenn es gar
    # keine Records gibt, als Notnagel die Accel-Zeit nehmen.
    times = [t for t in (_record_time(r) for r in records) if t]
    if not times:
        a0 = _accel_msg_time(accel_msgs[0]) if accel_msgs else None
        if a0 is None:
            return {"gps_samples": [], "accel_bytes": b"", "accel_hz": 0, "started_at": None,
                    "sport": sport, "fit_type": fit_type, "record_count": len(records),
                    "abbruch": abbruch_text}
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
        # Gesetzt, wenn die Datei nur bis zu einer Stelle lesbar war (abgebrochene Aufzeichnung,
        # falsche Pruefsumme, Muell hinter dem Ende). Der Import laeuft trotzdem — hiermit kann
        # der Aufrufer es protokollieren, statt dass es unbemerkt bleibt.
        "abbruch": abbruch_text,
    }
