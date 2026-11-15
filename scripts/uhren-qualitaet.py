#!/usr/bin/env python3
"""Welche Uhr taugt fuer Pumpfoil? Gemessen an UNSEREN eigenen Aufzeichnungen. REIN LESEND.

    cd server && .venv/bin/python ../scripts/uhren-qualitaet.py
    cd server && .venv/bin/python ../scripts/uhren-qualitaet.py --json ../analyse/uhren.json

Nicht Herstellerangaben vergleichen, sondern was die Geraete bei uns wirklich abliefern
(Jan, 05.09.2026). Vier Kategorien, dazu ein Urteil je Modell.

NUR EIGENE AUFNAHMEN
Bewertet wird ausschliesslich, was MIT UNSERER APP aufgezeichnet wurde (Jan, 05.09.2026).
Ein importierter Garmin-FIT oder eine ueber Suunto hereingeholte Session wuerde sonst eine
Uhr bewerten, ohne dass unsere App je darauf lief — die Datei sagt nichts darueber, wie gut
UNSERE Aufzeichnung funktioniert. Zwei Sperren:
- Der Join auf `device_tokens` faellt bei Importen ohnehin durch: `fit-`, `suunto-`, `polar-`,
  `imp-` tragen keine `device_id` (nachgezaehlt am 05.09.: 480 + 294 + 41 + 86 Sessions, alle
  ohne Geraet). Trotzdem steht die Bedingung ausdruecklich in der Abfrage — sonst haengt die
  Richtigkeit daran, dass das SO BLEIBT.
- **Zusammengefuehrte Sessions (`merge-`) fliegen ebenfalls raus**, und die traegen sehr wohl
  ein Geraet: 52 Stueck, davon 20 am fēnix 7X Pro. Eine Zusammenfuehrung kann Aufnahmen von
  ZWEI Uhren enthalten (die Doppeluhr-Messungen), haengt aber an einer — die Zuordnung waere
  also falsch.

WOHER DIE MODELLE KOMMEN
`sessions.device_id` -> `device_tokens`. Garmin meldet modellgenau, Wear OS und Amazfit
meist, **Apple Watch gar nicht** — dort steht bei allen 51 Geraeten nur „Apple Watch".
Ab App 1.1.31 schickt auch die Apple Watch ihr Modell mit; bis dahin bleibt sie EINE Zeile.

DIE VIER KATEGORIEN
1. **Pump-Erkennung.** Die wichtigste. Ohne brauchbare Beschleunigung faellt die Analyse auf
   `gps_only` zurueck: Laeufe und Strecke stimmen dann noch, Pumps werden aber nicht gezaehlt.
   Gemessen wird die WIRKLICHE Rate (`accel_hz_measured`), nicht die angeforderte, und der
   Anteil Sessions, die trotzdem auf `gps_only` landeten.
2. **Ortung.** Zwei Zahlen: der Anteil Punkte, die exakt die Position ihres Vorgaengers
   tragen (die Uhr schreibt einen alten Fix weiter — auf dem Wasser bewegt man sich immer),
   und die Guete. **Die Guete ist NICHT vergleichbar zwischen den Welten:** Connect IQ
   liefert eine Stufe (`Position.Quality`, 4 = GOOD), Apple/Wear/Handy liefern Meter.
   Deshalb zwei getrennte Spalten und niemals eine gemeinsame Rangfolge daraus.
3. **Puls.** Gemessen an den **Wertwechseln je Minute**, nicht am Anteil fehlender Werte.
   Das ist entscheidend: bis 1.1.29 schrieb die Apple-App den letzten bekannten Puls in JEDEN
   Punkt (auf Wear OS derselbe Fehler von 1.2.21 bis 1.2.25). Wer den ANTEIL fehlender Werte
   misst, sieht davon nichts — 99,5 % der Apple-Punkte tragen einen Wert, er ist nur alt.
   Wertwechsel dagegen entstehen NUR, wenn wirklich neu gemessen wurde; ein weitergeschriebener
   Wert aendert sich nicht. Damit ist die Zahl von unserem Fehler unabhaengig und ueber alle
   Plattformen und App-Versionen hinweg vergleichbar.
   Zum Einordnen: Garmin 18,3 Wechsel/min (etwa alle 3 s), Apple Watch 4,4 (etwa alle 14 s).
   `PULS_TOT_PRO_MIN` markiert, ab wann eine Session als Aussetzer gilt.
4. **Speicher.** `device_tokens.storage_full_count`/`crash_count`. Bewusst nur als Hinweis:
   nur je zehn Geraete haben ueberhaupt etwas gemeldet, das traegt keine Statistik.

NEUERE APP-VERSIONEN ZAEHLEN, WO SICH DIE AUFNAHME GEAENDERT HAT (Jan, 15.10.2026)
„wenn das besser geworden ist, dann koennen wir ja jetzt die besseren Daten nehmen … die alten
Raten einfach verwerfen". Die Tabelle soll sagen, was eine Uhr HEUTE mit unserer App liefert.
Deshalb gibt es je Plattform und Kennzahl eine Grenze `AKTUELL_AB` mit belegtem Grund. Hat ein
Modell ab dort mindestens `MIN_NEU` Sessions, zaehlen nur diese, und die Zeile traegt die Version
(`accel_ab`/`puls_ab`) — die Seite zeigt sie an. Gibt es nur aeltere, zaehlen diese, und die Zeile
traegt `accel_alt`/`puls_alt`. Gemessen am 15.10. ueber 2946 Sessions: ausser den Faellen unten
liegt jede Plattform ueber alle Versionen gleich (Garmin 25 Hz von 1.0.53 bis 1.0.92, Apple 25 Hz
seit Beginn). Die 10 Hz bei einzelnen Garmin-Nutzern sind deren Einstellung „sparsam", keine
Version — dafuer gibt es bewusst keine Grenze.
Puls aus den bekannten Fehlerfassungen (`puls_verwertbar`) faellt jetzt AUCH aus den Wertwechseln
heraus: Wear 1.2.23/1.2.24 lagen bei 4 statt ~30 Wechseln/min, Apple vor 1.1.30 bei ~4 statt ~7.

ZWEI WEGE: APP UND KONTOVERKNUEPFUNG (Jan, 15.11.2026)
„wir sollten anfangen zu unterscheiden ob via app oder kontoverknuepfung, um dann bei garmin beides nebeneinander
anzeigen zu koennen". Neben den App-Aufnahmen (oben) werden Garmin-Connect-Importe (`garmin-…`, nicht aufgegangen)
GETRENNT gemessen: das Modell kommt aus `sessions.device_model` (Garmins Geraetename), auf den Namen der App-Zeile
abgebildet, wenn er passt (`gc_label`). Sie landen in `modelle_konto`, NIE in `modelle` — alte Apps lesen nur
`modelle` und zeigten sonst dasselbe Modell zweimal ohne Kennzeichen. Suunto/Polar/COROS speichern kein Modell.
Die Gueteangabe fehlt in der Garmin-Datei (Spalte bleibt leer); Puls und Beschleunigung kommen so, wie die Uhr sie
in die Datei schreibt (Puls je Sekunde, Beschleunigung nur, wenn unsere App mitlief und die Uhr sie schreibt).

VOLLSTAENDIG (15.11.2026): Anteil Sessions, die ganz ankamen — alle angekuendigten Bloecke da (nur App) und keine
GPS-Luecke ueber `LUECKE_MAX_S`. Kurze Luecken unter Wasser sind normal (Uhr am Handgelenk), minutenlange nicht:
fehlende Bloecke, voller Speicher, Energiesparen der Uhr. Gezaehlt werden nur Luecken, an deren beiden Enden der Fahrer
in Bewegung war — im Stillstand duennt die Uhr aus. Je Nutzer gemittelt (Mittel, nicht Median, s. unten).

ATTRAPPEN UND PLATZHALTER
Emulatoren (`sdk_gwear_x86_64`, Konto 38) und Simulatoren fliegen raus — dieselbe Liste wie
in `community._ist_attrappe`. Sie standen am 15.10. mit 25 Hz und 0,2 m in den Wear-Zahlen.
Genauigkeits-Platzhalter (>= 60 exakt gleiche Meter in Folge, z. B. fest 125,0 m beim OnePlus
OPWWE251) zaehlen nicht als Messung, wie seit 15.10. in der Analyse (`hacc_platzhalter_weg`).
Garmin ist davon ausgenommen: dort ist die Spalte eine Stufe 0..4, „4" am Stueck ist normal.

FAIRNESS — „ein Nutzer, eine Stimme"
Je Modell fahren oft ein oder zwei Leute die meisten Sessions. Wuerde man einfach ueber alle
Sessions mitteln, bewertet man deren Setup, nicht das Modell. Belegt am fēnix 6X Pro: ueber
Sessions gerechnet fehlte dort in 86,7 % der Faelle der Puls — das kam von EINEM Nutzer mit
77 von 85 Sessions (87,8 % ohne Puls), die anderen vier Nutzer lagen bei 0 %.
Deshalb wird zuerst je NUTZER zusammengefasst und dann ueber die Nutzer gemittelt. Modelle
unter `MIN_SESSIONS` fallen raus; bei nur einem Nutzer steht das in der Zeile.
"""
from __future__ import annotations

import json
import os
import re
import sys
from collections import defaultdict
from statistics import median

BASIS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
MIN_SESSIONS = 8
MIN_PUNKTE = 120
PULS_STARR_PUNKTE = 60      # >= so viele gleiche Werte am Stueck = eingefroren
PULS_TOT_PRO_MIN = 1.0      # weniger als ein neuer Wert je Minute = die Messung steht
ACCEL_MIN_HZ = 15.0         # darunter reicht es nicht fuers Pump-Modell (s. analysis/__init__)
BEWEGT_MPS = 1.0            # ab hier gilt "in Bewegung" — darunter zaehlt Stillstand nicht als Fehler
HACC_PLATZHALTER_MIN = 60   # so viele exakt gleiche Meter in Folge = Platzhalter (wie analysis)
LUECKE_MAX_S = 180          # GPS-Luecke darueber = Session nicht vollstaendig (s. VOLLSTAENDIG)
MIN_NEU = 3                 # so viele Sessions ab `AKTUELL_AB` braucht ein Modell, sonst alte Daten
# Ab welcher App-Version eine Kennzahl so aufgenommen wird wie heute (s. Kopfzeile).
AKTUELL_AB = {
    # Seit 1.2.28 duennt die Wear-App selbst auf 25 Hz aus (AccelAusduenner, wie Garmin); vorher
    # kamen je Uhr 28-55 Hz roh. Die alten Raten liefert die heutige App nicht mehr.
    ("wear", "accel"): (1, 2, 28),
    # Puls: die Fehlerfassungen regelt `puls_verwertbar`; diese Grenzen sind nur fuer die Anzeige.
    ("apple", "puls"): (1, 1, 30),
    ("wear", "puls"): (1, 2, 26),
}


def env_laden() -> None:
    import pathlib
    for z in pathlib.Path(os.path.join(BASIS, "server/.env")).read_text().splitlines():
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", z.strip())
        if m:
            os.environ.setdefault(m.group(1), m.group(2).strip().strip('"').strip("'"))


def version(v: str | None) -> tuple:
    """'1.2.23' -> (1,2,23); Unbekanntes wird zu (0,0,0)."""
    if not v:
        return (0, 0, 0)
    teile = re.findall(r"\d+", v)[:3]
    return tuple(int(t) for t in teile) + (0,) * (3 - len(teile))


def puls_verwertbar(plattform: str, v: str | None) -> bool:
    """Darf diese Session in die Puls-Spalte? (s. Kategorie 3 in der Kopfzeile)"""
    n = version(v)
    if plattform == "apple":
        return n >= (1, 1, 30)          # der Fix; bis 1.1.29 schrieb die App alte Werte mit
    if plattform == "wear":
        return n < (1, 2, 21) or n >= (1, 2, 26)
    return True                          # Garmin/Amazfit: nie betroffen


def _norm(name: str) -> str:
    n = re.sub(r"[®™]", "", name or "").replace("ē", "e").replace("Ē", "E").lower()
    n = re.sub(r"^garmin\s+", "", n.strip())
    return re.sub(r"\s+", " ", n).strip()


def gc_label(device_model: str, app_labels: list) -> str:
    """Garmins Geraetename („Garmin fenix 7 Pro") -> Name der App-Zeile („fēnix® 7 Pro"), damit beide Wege unter
    EINEM Modell stehen. Verglichen wird der erste Teil des App-Namens (vor „ / "): erst genau, dann als Anfang mit
    Gehaeusegroesse („fenix 8" -> „fēnix® 8 47mm / …"), aber nur bei genau einem Treffer. Sonst Garmins Name ohne „Garmin "."""
    n = _norm(device_model)
    erst = {lab: _norm(lab.split(" / ")[0]) for lab in app_labels}
    genau = [lab for lab, k in erst.items() if k == n]
    if len(genau) == 1:
        return genau[0]
    # Nur eine Gehaeusegroesse darf folgen („fenix 8" -> „fēnix® 8 47mm"), sonst waere „Venu 2" die „Venu 2 Plus".
    anfang = [lab for lab, k in erst.items() if re.match(re.escape(n) + r" \d+ ?mm\b", k)]
    if len(anfang) == 1:
        return anfang[0]
    return re.sub(r"^Garmin\s+", "", (device_model or "").strip())


def ohne_platzhalter(werte: list) -> list:
    """Abschnitte mit >= HACC_PLATZHALTER_MIN exakt gleichen Werten in Folge entfernen."""
    raus, i, n = [], 0, len(werte)
    while i < n:
        j = i
        while j + 1 < n and werte[j + 1] == werte[i]:
            j += 1
        if j - i + 1 < HACC_PLATZHALTER_MIN:
            raus.extend(werte[i:j + 1])
        i = j + 1
    return raus


def messen(samples: list, plattform: str = "garmin") -> dict | None:
    if len(samples) < MIN_PUNKTE:
        return None
    n = len(samples)
    ohne_puls = kette = laengste = doppelt = bewegt = 0
    letzter_puls = None
    letzte_pos = None
    haccs = []
    for s in samples:
        hr = s[4] if len(s) > 4 else None
        if not hr:
            ohne_puls += 1
            kette, letzter_puls = 0, None
        else:
            kette = kette + 1 if hr == letzter_puls else 0
            laengste = max(laengste, kette)
            letzter_puls = hr
        # Stehende Ortung NUR in Bewegung zaehlen. Wer am Ufer steht, liefert voellig zu Recht
        # denselben Punkt — ohne diese Bedingung misst die Spalte die Pausen des Fahrers statt
        # das Verhalten der Uhr, und derselbe Hersteller landete zwischen 0,1 % und 41 %.
        pos = (s[1], s[2])
        tempo = s[3] if len(s) > 3 and isinstance(s[3], (int, float)) else None
        if letzte_pos is not None and tempo is not None and tempo > BEWEGT_MPS:
            bewegt += 1
            if pos == letzte_pos:
                doppelt += 1
        letzte_pos = pos
        h = s[5] if len(s) > 5 else None
        if isinstance(h, (int, float)) and h > 0:
            haccs.append(float(h))
    # Wertwechsel je Minute: die einzige Puls-Zahl, die UNSER Padding nicht verfaelscht
    # (s. Kategorie 3). Nur ueber die Punkte, die ueberhaupt einen Wert tragen.
    if plattform != "garmin":               # Garmin: Stufe 0..4, kein Meterwert
        haccs = ohne_platzhalter(haccs)
    werte = [s[4] for s in samples if len(s) > 4 and s[4]]
    dauer_min = max(1.0, (samples[-1][0] - samples[0][0]) / 60000.0)
    wechsel = sum(1 for a, b in zip(werte, werte[1:]) if a != b) / dauer_min if werte else 0.0
    # Nur Luecken MITTEN IN DER FAHRT (an beiden Enden > BEWEGT_MPS): im Stillstand duennt die Uhr aus oder liegt
    # unter Wasser, alle Bloecke kamen an (geprueft 15.11.2026 an Forerunner 945, Instinct 3, fēnix 6 Pro).
    def _v(x):
        return x[3] if len(x) > 3 and isinstance(x[3], (int, float)) else 0.0
    luecke = max((b[0] - a[0] for a, b in zip(samples, samples[1:]) if _v(a) > BEWEGT_MPS and _v(b) > BEWEGT_MPS),
                 default=0) / 1000.0
    return {"punkte": n, "dauer_s": max(1.0, (samples[-1][0] - samples[0][0]) / 1000.0), "luecke_max_s": luecke,
            "puls_wechsel": wechsel if werte else None,
            "puls_fehlt": ohne_puls / n, "puls_starr": laengste,
            "ortung_steht": (doppelt / bewegt) if bewegt >= 60 else None,
            "hacc": median(haccs) if haccs else None,
            "guete_gut": (sum(1 for h in haccs if h >= 4) / len(haccs)) if haccs else None}


def main() -> None:
    env_laden()
    sys.path.insert(0, os.path.join(BASIS, "server"))
    from sqlalchemy import create_engine, text
    from app import storage
    from app.api.community import _ist_attrappe

    eng = create_engine(os.environ["DATABASE_URL"])
    with eng.connect() as c:
        zeilen = c.execute(text("""
            SELECT s.session_uuid, s.user_id, s.app_version, dt.platform, dt.label,
                   a.metrics_json, a.detection, 'app' AS weg,
                   coalesce(s.expected_chunks, s.total_chunks) AS soll,
                   (SELECT count(*) FROM ingest_chunks ic WHERE ic.session_id = s.id) AS haben
            FROM sessions s
            JOIN device_tokens dt ON dt.id = s.device_id
            LEFT JOIN analysis_results a ON a.session_id = s.id
            WHERE s.deleted = false AND dt.platform IS NOT NULL
              -- s. „NUR EIGENE AUFNAHMEN" in der Kopfzeile
              AND s.session_uuid NOT LIKE 'fit-%'
              AND s.session_uuid NOT LIKE 'imp-%'
              AND s.session_uuid NOT LIKE 'suunto-%'
              AND s.session_uuid NOT LIKE 'polar-%'
              AND s.session_uuid NOT LIKE 'coros-%'
              AND s.session_uuid NOT LIKE 'strava-%'
              AND s.session_uuid NOT LIKE 'merge-%'
              AND s.session_uuid NOT LIKE 'garmin-%'
        """)).fetchall()
        app_labels = [r[0] for r in c.execute(text(
            "SELECT DISTINCT label FROM device_tokens WHERE platform = 'garmin' AND label IS NOT NULL"))]
        # Garmin Connect (s. „ZWEI WEGE"): nur die Datei, die als Session steht (aufgegangene sind Teil einer anderen).
        zeilen += [(u, uid, None, "garmin", gc_label(dm, app_labels), m, d, "gc", None, None) for u, uid, dm, m, d in c.execute(text("""
            SELECT s.session_uuid, s.user_id, s.device_model, a.metrics_json, a.detection
            FROM sessions s LEFT JOIN analysis_results a ON a.session_id = s.id
            WHERE s.deleted = false AND s.merged_into IS NULL AND s.session_uuid LIKE 'garmin-%'
              AND coalesce(s.device_model, '') NOT IN ('', 'Garmin')
        """)).fetchall()]
        warn = {(r[0], r[1] or "?"): (r[2], r[3]) for r in c.execute(text("""
            SELECT platform, label, sum(coalesce(storage_full_count,0)),
                   sum(coalesce(crash_count,0))
            FROM device_tokens WHERE platform IS NOT NULL GROUP BY 1,2"""))}

    # (Modell, Nutzer) -> Sessions. Erst je Nutzer zusammenfassen, dann ueber die Nutzer
    # mitteln — s. „ein Nutzer, eine Stimme" in der Kopfzeile.
    je_nutzer: dict[tuple, list] = defaultdict(list)
    print(f"{len(zeilen)} Sessions mit bekanntem Geraet — messe …", file=sys.stderr)
    for i, (uuid, uid, appv, plattform, label, metrics, detection, weg, soll, haben) in enumerate(zeilen):
        if i and i % 300 == 0:
            print(f"   {i} …", file=sys.stderr)
        if _ist_attrappe(label):                # Emulator/Simulator, s. Kopfzeile
            continue
        try:
            w = messen(storage.load_gps(uuid), plattform)
        except Exception:                       # noqa: BLE001
            continue
        if w is None:
            continue
        m = metrics if isinstance(metrics, dict) else (json.loads(metrics) if metrics else {})
        w["accel_hz"] = m.get("accel_hz_measured")
        w["gps_only"] = (detection == "gps_only")
        # Anteil mit brauchbarer Beschleunigung — unabhaengig davon, ob die Session als Pumpfoil erkannt wurde
        # (`gps_only` zaehlt nur erkannte; ueber Garmin Connect kommen viele andere Sportarten mit).
        w["mit_accel"] = w["accel_hz"] is not None and w["accel_hz"] >= ACCEL_MIN_HZ
        w["puls_zaehlt"] = puls_verwertbar(plattform, appv)
        w["version"] = version(appv)
        w["vollstaendig"] = (not soll or (haben or 0) >= soll) and w["luecke_max_s"] <= LUECKE_MAX_S
        je_nutzer[(plattform, (label or "?").strip(), weg, uid)].append(w)

    # Stufe 0: je Modell und Kennzahl entscheiden, ob die neueren Versionen reichen (s. Kopfzeile).
    alle_je_modell: dict[tuple, list] = defaultdict(list)
    for (plattform, label, weg, uid), L in je_nutzer.items():
        alle_je_modell[(plattform, label, weg)].extend(L)
    stand: dict[tuple, dict] = {}
    for (plattform, label, weg), L in alle_je_modell.items():
        st = {}
        for art, feld in (("accel", "accel_hz"), ("puls", "puls_wechsel")):
            ab = AKTUELL_AB.get((plattform, art))
            basis = [w for w in L if w[feld] is not None and (art != "puls" or w["puls_zaehlt"])]
            if ab is None or not basis:
                st[art] = (None, False)
            elif sum(1 for w in basis if w["version"] >= ab) >= MIN_NEU:
                st[art] = (ab, False)
            else:
                st[art] = (None, True)              # nur aeltere Daten
        stand[(plattform, label, weg)] = st

    def nimmt(plattform, label, weg, art, w) -> bool:
        ab, _ = stand[(plattform, label, weg)][art]
        return ab is None or w["version"] >= ab

    # Stufe 1: je Nutzer und Modell einen Wert je Kennzahl.
    je_modell: dict[tuple, list] = defaultdict(list)
    for (plattform, label, weg, uid), L in je_nutzer.items():
        def med(feld, filt=lambda w: True):
            werte = [w[feld] for w in L if filt(w) and w[feld] is not None]
            return median(werte) if werte else None
        puls = [w for w in L if w["puls_zaehlt"] and nimmt(plattform, label, weg, "puls", w)]
        je_modell[(plattform, label, weg)].append({
            "sessions": len(L),
            "stunden": sum(w["dauer_s"] for w in L) / 3600.0,
            "accel_hz": med("accel_hz", lambda w: nimmt(plattform, label, weg, "accel", w)),
            "gps_only": sum(1 for w in L if w["gps_only"]) / len(L),
            "vollstaendig": sum(1 for w in L if w["vollstaendig"]) / len(L),
            "mit_accel": sum(1 for w in L if w["mit_accel"]) / len(L),
            "ortung_steht": med("ortung_steht"),
            "guete_gut": med("guete_gut"),
            "hacc": med("hacc"),
            "puls_sessions": len(puls),
            "puls_wechsel": (median(x) if (x := [w["puls_wechsel"] for w in puls
                                                 if w["puls_wechsel"] is not None]) else None),
            "puls_tot": (sum(1 for w in puls if (w["puls_wechsel"] or 0) < PULS_TOT_PRO_MIN) / len(puls)
                         if puls else None),
            "puls_fehlt": (median(w["puls_fehlt"] for w in puls) if puls else None),
            "puls_starr": (sum(1 for w in puls if w["puls_starr"] >= PULS_STARR_PUNKTE) / len(puls)
                           if puls else None),
        })

    def ueber_nutzer(N, feld):
        werte = [n[feld] for n in N if n.get(feld) is not None]
        return median(werte) if werte else None

    aus = []
    for (plattform, label, weg), N in je_modell.items():
        L = N                                   # eine Zeile je NUTZER, nicht je Session
        if sum(n["sessions"] for n in N) < MIN_SESSIONS:
            continue
        voll, crash = warn.get((plattform, label), (0, 0)) if weg == "app" else (0, 0)
        st = stand[(plattform, label, weg)]
        g = ueber_nutzer(N, "guete_gut")
        h = ueber_nutzer(N, "hacc")
        pf = ueber_nutzer(N, "puls_fehlt")
        pw = ueber_nutzer(N, "puls_wechsel")
        pt = ueber_nutzer(N, "puls_tot")
        ps = ueber_nutzer(N, "puls_starr")
        o = ueber_nutzer(N, "ortung_steht")
        hz = ueber_nutzer(N, "accel_hz")
        aus.append({
            "plattform": plattform, "modell": label, "weg": weg,
            "sessions": sum(n["sessions"] for n in N), "nutzer": len(N),
            "stunden": round(sum(n["stunden"] for n in N), 1),
            "accel_hz": round(hz, 1) if hz else None,
            "gps_only": round((ueber_nutzer(N, "gps_only") or 0) * 100, 1),
            # MITTEL statt Median ueber die Nutzer: der Median steht fast ueberall auf 100 % und verdeckt genau die
            # Nutzer, bei denen etwas fehlt — und um die geht es in dieser Spalte.
            "vollstaendig": round(sum(n["vollstaendig"] for n in N) / len(N) * 100, 1),
            "mit_accel": round(sum(n["mit_accel"] for n in N) / len(N) * 100, 1),
            "ortung_steht": round(o * 100, 1) if o is not None else None,
            "guete_gut": round(g * 100, 1) if plattform == "garmin" and g is not None else None,
            "hacc_m": round(h, 1) if plattform != "garmin" and h is not None else None,
            "puls_sessions": sum(n["puls_sessions"] for n in N),
            "puls_fehlt": round(pf * 100, 1) if pf is not None else None,
            "puls_wechsel": round(pw, 1) if pw is not None else None,
            "puls_tot": round(pt * 100, 1) if pt is not None else None,
            "puls_starr": round(ps * 100, 1) if ps is not None else None,
            "speicher_voll": voll, "abstuerze": crash,
            # Woher die Zahl kommt (s. „NEUERE APP-VERSIONEN" oben): ab welcher Version gezaehlt
            # wurde, oder dass es nur Aufnahmen aus aelteren Versionen gibt.
            "accel_ab": ".".join(map(str, st["accel"][0])) if st["accel"][0] else None,
            "accel_alt": st["accel"][1],
            "puls_ab": ".".join(map(str, st["puls"][0])) if st["puls"][0] else None,
            "puls_alt": st["puls"][1],
        })

    # Urteil: die Pump-Erkennung entscheidet — dafuer ist die App da.
    for r in aus:
        if r["accel_hz"] is None or r["gps_only"] >= 50:
            r["urteil"] = "nur GPS"
        elif r["accel_hz"] < ACCEL_MIN_HZ:
            r["urteil"] = "nur GPS"
        elif r["gps_only"] >= 10 or (r["ortung_steht"] or 0) >= 10:
            r["urteil"] = "mit Abstrichen"
        else:
            r["urteil"] = "empfohlen"
    rang = {"empfohlen": 0, "mit Abstrichen": 1, "nur GPS": 2}
    aus.sort(key=lambda r: (rang[r["urteil"]], -r["sessions"]))

    if "--json" in sys.argv:
        ziel = sys.argv[sys.argv.index("--json") + 1]
        # Stand und Datenbasis MIT hineinschreiben: die Seite zeigt beides an, damit man weiss,
        # worauf die Aussage beruht und wie alt sie ist (Jan, 05.09.2026). Der Snapshot wird
        # alle paar Wochen neu erzeugt — ohne Datum waere nicht erkennbar, ob das noch gilt.
        import datetime
        app = [r for r in aus if r["weg"] == "app"]
        paket = {
            "stand": datetime.date.today().isoformat(),
            "sessions": sum(r["sessions"] for r in aus),
            "nutzer": sum(r["nutzer"] for r in aus),
            "stunden": round(sum(r["stunden"] for r in aus)),
            "modelle": app,                                           # alte Apps: nur diese Liste
            "modelle_konto": [r for r in aus if r["weg"] != "app"],   # s. „ZWEI WEGE"
        }
        open(ziel, "w").write(json.dumps(paket, ensure_ascii=False, indent=1))
        print(f"geschrieben: {ziel} — Stand {paket['stand']}, "
              f"{paket['sessions']} Sessions, {paket['stunden']} Stunden")
        return

    kopf = (f"{'Urteil':15s} {'Modell':34s} {'Sess':>5s} {'Nutz':>4s} {'Accel':>8s} "
            f"{'gps-only':>9s} {'Ortung steht':>13s} {'Guete/hacc':>11s} {'Puls fehlt':>11s} "
            f"{'Puls starr':>11s}")
    print(kopf); print("-" * len(kopf))
    for r in aus:
        g = (f"{r['guete_gut']:.0f}% GOOD" if r["guete_gut"] is not None
             else (f"{r['hacc_m']:.1f} m" if r["hacc_m"] is not None else "–"))
        pf = f"{r['puls_wechsel']:.1f}" if r["puls_wechsel"] is not None else "–"
        ps = f"{r['puls_tot']:.1f}%" if r["puls_tot"] is not None else "–"
        print(f"{r['urteil']:15s} {(('[GC] ' if r['weg'] != 'app' else '') + r['modell'])[:34]:34s} {r['sessions']:5d} {r['nutzer']:4d} "
              f"{(str(r['accel_hz']) + ' Hz' if r['accel_hz'] else '–'):>8s} {r['gps_only']:8.1f}% "
              f"{(f'{r["ortung_steht"]:.1f}%' if r["ortung_steht"] is not None else '–'):>13s} "
              f"{g:>11s} {pf:>9s} {ps:>9s}")


if __name__ == "__main__":
    main()
