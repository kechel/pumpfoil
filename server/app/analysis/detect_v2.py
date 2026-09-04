"""Erkennung v2 — Schritt 3: Label je Fenster, Läufe aus der Label-Folge.

docs/detector-v2.md, Abschnitte 2 + 3. Aufbau:

  Zeitachse (timebase) -> Fenster-Merkmale (windows) -> Label je Fenster (hier)
  -> Läufe durch Segmentieren der Label-Folge.

Was v2 gegenüber v1 wirklich ändert, ist die HERKUNFT der Maske: v1 setzt sie sample-weise
aus dem ML-Modell bzw. der Speed-State-Machine, v2 aus einer Fenster-Label-Folge in
Session-Koordinaten. Die bewährte Nachbearbeitung von v1 (Segmentieren an GPS-Lücken,
Mindestdauer, Ø-Untergrenze, Zusammenführen ohne echten Stopp, Ränder verlängern,
Drift-Reparatur, Physik-Gate) wird BEWUSST wiederverwendet statt nachgebaut — sonst
vergleicht der Regressionslauf zwei Signalaufbereitungen statt zweier Erkennungen, und
jede Abweichung wäre nicht mehr zuordenbar.

Puls und Wasser entscheiden hier NICHT mit (Entwurf: erst später als Bestätigung). Beide
werden nur als Felder mitgeliefert.
"""
from __future__ import annotations

import json
import os

import numpy as np

from ..ml.pumps import MIN_RMS as PUMP_MIN_RMS_G   # 0,05 g — Begründung unten bei den Schwellen
from ..ml.pumps import PUMP_BAND_RATIO             # 0,45  — dito
from . import gps as v1
from .geo import step_distances_m
from .timebase import TimeBase, build_timebase_for_session
from .windows import HOP_MS, WINDOW_MS, window_grid

ALGO_VERSION = "v2-windows-1"

PUMPEN, GLEITEN, RUHE, FREMDKRAFT = "pumpen", "gleiten", "ruhe", "fremdkraft"
FOIL_LABELS = (PUMPEN, GLEITEN)


# --- Schwellen ------------------------------------------------------------------------
# Grundsatz aus dem Auftrag: jede Zahl hat entweder einen v1-Vorgänger oder eine Messung.
#
# Aus v1 unverändert übernommen (gps.py): ENTER_SPEED 2,8 / EXIT_SPEED 2,5 / MAX_FOIL_SPEED 7,0 /
# MOVE_FLOOR_MPS 2,0 / MAX_HACC 15 / GAP_SPLIT_S 15 / MIN_SEGMENT_S 5 / MIN_SEG_AVG_SPEED 2,8 /
# NOSTOP_SPEED 1,5 / RUN_MAX_PLAUSIBLE_KMH 40. Sie werden weiter unten direkt aus gps.py gelesen,
# damit es sie nur EINMAL im Baum gibt.
#
# Die Dwell-Zeiten von v1 (ENTER_DWELL_S / EXIT_DWELL_S, je 3 s) haben in v2 keine Entsprechung
# mehr: das kleinste Entscheidungsobjekt ist ein 10-s-Fenster, ein Zustandswechsel setzt also
# ohnehin ≥ 10 s Evidenz voraus — mehr als v1 verlangt.
#
# NEU in v2, jeweils gemessen (Messungen im Bericht, alle read-only über den Bestand):
#
# 1) Gerade-Fahrt als Fremdkraft-Kriterium. Die im Entwurf genannte „Wucht" (Accel-RMS) trennt
#    auf dem beschrifteten Material NICHT: der Zug in #1328 liegt bei 0,29 g / 0,13 g, ein
#    echter Lauf derselben Session bei 0,05 g — Gipfeligkeit ebenso überlappend (Zug 13,3 gegen
#    echter Lauf 6,0). Was trennt, ist die Spurgeometrie: ein Fahrzeug hält minutenlang Kurs,
#    ein Foil-Fahrer nicht. Gemessen als längste zusammenhängende Strecke mit einer mittleren
#    Kursänderung unter STRAIGHT_MAX_DEG je GPS-Schritt:
#       Transport (6 beschriftete Abschnitte): 40 / 75 / 100 / 115 / 125 / 175 s
#       echte Läufe (8 beschriftete Abschnitte):  5 / 5 / 10 / 10 / 10 / 10 / 15 / 15 s
#    ACHTUNG — DIESE TRENNUNG HÄLT NICHT (nachgemessen 01.08. an weiteren Fällen mit bekanntem
#    Urteil): der von Jan als echt bestätigte Lauf #658 fährt 132 / 106 / 98 s geradeaus, die
#    bestätigte Autofahrt #1255 nur 35 / 33 / 32 s. Auf einem Ruderbecken ist die lange Gerade
#    der Normalfall. Die Zahlen oben stammten aus einer Handvoll ausgewählter Abschnitte.
#    Die Geometrie entscheidet deshalb NICHTS mehr — sie wird nur je Lauf als `gerade_anteil`
#    mitgeschrieben. Fremdkraft entscheidet `_fremdkraft_laeufe` je LAUF über die Puls-Antwort
#    gegen eine echte Ruhe-Grundlinie (dort die vollständige Messung: 55 von 73 belegten
#    Fremdkraft-Läufen erkannt, und die Geometrie zusätzlich zu fordern macht es schlechter).
STRAIGHT_MAX_DEG = 4.0     # mittlere |Kursänderung| je GPS-Schritt — nur noch beschreibend
STRAIGHT_MIN_S = 30        # historisch (die widerlegte Regel); bleibt für die Nachvollziehbarkeit
#
# 2) Pumpen gegen Gleiten. Beides sind On-Foil-Zustände und beide tragen einen Lauf — die
#    Unterscheidung ist beschreibend, nicht entscheidend. Deshalb bewusst die schon bestehenden,
#    an echten Pump-Daten kalibrierten Werte aus ml/pumps.py (classify_windows) statt neuer:
#    PUMP_BAND_RATIO 0,45 und MIN_RMS 0,05 g (oben importiert).


def detector_v2_enabled() -> bool:
    """Schalter aus der Umgebung. Default AUS — v1 bleibt Standard, bis der Vergleich vorliegt."""
    return os.environ.get("DETECTOR_V2", "").strip().lower() in ("1", "true", "yes", "on")


# --- Signalaufbereitung ----------------------------------------------------------------

def _clean_speed(speed: np.ndarray, gps_hz: int) -> np.ndarray:
    """Signalaufbereitung == v1. Bewusst nur ein Aufruf: hier stand bis 03.09. ein Nachbau,
    dem zwei der vier Glitch-Regeln fehlten (isolierter Despike + Endpunkt-Clamp). Die
    Begruendung und der Fall, an dem es aufgefallen ist, stehen an `clean_speed_series`."""
    return v1.clean_speed_series(speed, gps_hz)


# --- Label je Fenster ------------------------------------------------------------------

def label_windows(wins: list[dict], enter_speed: float, exit_speed: float, puls=None) -> list[dict]:
    """Vergibt `label` je Fenster und schreibt in `why` mit, welche Signale es getragen haben.

    Physik als Schranke (Entwurf Abschnitt 3):
      • Vortrieb heißt Speed IM Band UND echte Positionsbewegung — ein Speed-Feld allein
        genügt nicht (Zurückschwimmen, Dropout, Pumpen auf der Stelle melden Tempo).
      • Über der Bandgrenze (MAX_FOIL_SPEED) ist es kein Pumpfoilen mehr, sondern Antrieb.
      • Pumpen ist ein Rhythmus: Gipfel im Pump-Band mit genug Bandanteil und Amplitude.
    """
    for w in wins:
        vd, vp = w.get("v_dop_mps"), w.get("v_pos_mps")
        why: list[str] = []
        if vd is None or vp is None:
            w["label"], w["why"] = RUHE, ["kein GPS"]
            continue
        if vd > v1.MAX_FOIL_SPEED:
            w["label"], w["why"] = FREMDKRAFT, [f"v={vd * 3.6:.1f} km/h über der Bandgrenze"]
            continue
        # Genauigkeit: eine unbrauchbare Position ist kein Vortriebs-Beleg (v1: MAX_HACC).
        hacc = w.get("hacc_m")
        if hacc is not None and hacc > v1.MAX_HACC:
            w["label"], w["why"] = RUHE, [f"hAcc {hacc:.0f} m"]
            continue
        if vd < exit_speed or vp < v1.MOVE_FLOOR_MPS:
            w["label"], w["why"] = RUHE, [f"v={vd * 3.6:.1f}/{vp * 3.6:.1f} km/h unter dem Floor"]
            continue
        why.append(f"Vortrieb {vd * 3.6:.1f} km/h (Position {vp * 3.6:.1f})")
        rms, ratio, dom = w.get("rms_g"), w.get("band_ratio"), w.get("dom_hz")
        rhythmisch = (
            rms is not None and ratio is not None and dom is not None
            and rms >= PUMP_MIN_RMS_G and ratio >= PUMP_BAND_RATIO
        )
        if rhythmisch:
            why.append(f"Rhythmus {dom:.2f} Hz, RMS {rms:.3f} g, Bandanteil {ratio:.2f}")
        w["label"] = PUMPEN if rhythmisch else GLEITEN
        w["why"] = why
    # _mark_powered_straights wird NICHT mehr aufgerufen: die Geraden-Regel ist widerlegt
    # (s. dort — der echte Lauf #658 faehrt laenger geradeaus als die bestaetigte Autofahrt
    # #1255, und sie zusaetzlich zu fordern verschlechtert das Ergebnis messbar). Fremdkraft
    # entscheidet jetzt `_fremdkraft_laeufe` je LAUF. Was hier bleibt, ist die Physik-Schranke
    # aus v1: ueber MAX_FOIL_SPEED traegt kein Foil mehr, das ist Antrieb.
    return wins


def _mark_powered_straights(wins: list[dict], puls=None) -> None:
    """Minutenlange Geradeausfahrt = Fremdkraft (Auto/Zug/Schleppen) — ABER nur, wenn der Puls
    nicht widerspricht.

    Warum der Vorbehalt: die Geraden-Länge allein trennt NICHT. Gemessen an vier Fällen mit
    bekanntem Urteil (01.08.):

        #658  echter Lauf (Jans Urteil)   Geraden 132 / 106 / 98 s
        #1328 Zug (belegt)                Geraden 269 / 197 / 133 s
        #1255 Autofahrt (belegt)          Geraden  35 /  33 /  32 s
        #622  echter Rekordlauf           Geraden  72 /  46 /  35 s

    Der echte Lauf fährt länger geradeaus als die bestätigte Autofahrt — auf einem Ruderbecken
    (Vaires-sur-Marne) ist eine 2-km-Gerade eben der Normalfall. Die ursprüngliche Messung, die
    diese Schwelle trug („Transport 40–175 s, echte Läufe 5–15 s"), stammte aus einer Handvoll
    ausgewählter Abschnitte und hält über die breitere Menge nicht.

    Der Puls trennt zuverlässig — aber NUR auf Lauf-/Session-Ebene (`sportauto`: Fremdkraft
    −1…+13 bpm, echte Arbeit +26…+70), nicht auf der Ebene eines 30-s-Abschnitts. Zwei Gründe,
    beide gemessen: innerhalb eines laufenden Laufs vergleicht die Antwort erhöht mit erhöht
    (Vorlauf-Fenster liegt selbst im Lauf), und der ABSOLUTE Pegel taugt auch nicht — in den
    bestätigten Autofahrten liegt der Puls in den Geraden bis zu +43 über der Ruhe-Grundlinie,
    weil er nach dem Foilen noch erhöht ist (#1255: −12/+2/+26/+43/+37 gegen Grundlinie 60).

    Das Veto unten ist deshalb nur eine TEIL-Lösung: es holt den klaren Fall zurück (#658
    powered_share 0,197 -> 0,091), ohne die Autofahrten nennenswert zu entlasten (#1255 0,477 ->
    0,426). Die saubere Lösung ist, die Fremdkraft-Entscheidung NACH der Segmentierung je LAUF zu
    treffen — dort ist die Vorlauf-Grundlinie echte Ruhe und die Messung belastbar. Das ist der
    nächste Umbau an v2; solange er aussteht, bleibt die Geometrie beschreibend (powered_share)
    und v2 abgeschaltet.

    `puls(t_start_ms, t_end_ms) -> float | None` liefert die Antwort für einen Zeitraum.
    Wirkt nur auf Fenster, die überhaupt Vortrieb tragen — eine Gerade im Stillstand ist
    keine Fahrt, sondern GPS-Rauschen."""
    from .sportauto import MAX_PULS_ANTWORT
    n = len(wins)
    i = 0
    while i < n:
        cr = wins[i].get("course_rate_deg")
        if wins[i].get("label") not in FOIL_LABELS or cr is None or cr >= STRAIGHT_MAX_DEG:
            i += 1
            continue
        j = i
        while (j < n and wins[j].get("label") in FOIL_LABELS
               and wins[j].get("course_rate_deg") is not None
               and wins[j]["course_rate_deg"] < STRAIGHT_MAX_DEG):
            j += 1
        dauer_ms = wins[j - 1]["t_end_ms"] - wins[i]["t_start_ms"]
        if dauer_ms >= STRAIGHT_MIN_S * 1000:
            pa = puls(wins[i]["t_start_ms"], wins[j - 1]["t_end_ms"]) if puls else None
            if pa is not None and pa >= MAX_PULS_ANTWORT:
                i = j                       # Puls ist mitgegangen -> das war Arbeit, kein Motor
                continue
            for k in range(i, j):
                wins[k]["label"] = FREMDKRAFT
                wins[k]["why"] = [f"{dauer_ms / 1000:.0f} s geradeaus "
                                  f"(<{STRAIGHT_MAX_DEG:.0f}°/Schritt)"]
        i = j


# --- Läufe aus der Label-Folge ----------------------------------------------------------

def gerade_je_sample(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """Pro GPS-Sample: liegt es auf einer Geraden (|Kursänderung| <= STRAIGHT_MAX_DEG)?

    Nur noch BESCHREIBEND — die Geometrie entscheidet nichts mehr (s. `_fremdkraft_laeufe`)."""
    n = lat.size
    out = np.zeros(n, dtype=bool)
    ok = ~np.isnan(lat) & ~np.isnan(lon)
    if ok.sum() < 6 or n < 4:
        return out
    mx = 111320.0 * np.cos(np.radians(float(np.nanmedian(lat))))
    X, Y = lon * mx, lat * 111320.0
    kurs = np.degrees(np.arctan2(np.diff(Y), np.diff(X)))
    d = np.abs((np.diff(kurs) + 180) % 360 - 180)
    out[2:] = d <= STRAIGHT_MAX_DEG
    return out


# Ab wann ein gleichbleibender Puls kein Messwert mehr ist, sondern ein stehengebliebener.
# 120 s sind grosszuegig: ein echter Puls schwankt im Sekundentakt um ein paar Schlaege, selbst
# im gleichmaessigen Zug. Gemessen am Bestand (04.09.): 18 von 167 Sessions mit Accel haben
# mindestens 5 Minuten konstanten Puls — auf Wear OS, Apple Watch UND Garmin gleichermassen.
PULS_EINGEFROREN_S = 120.0


def _puls_lebt(t: np.ndarray, hr: np.ndarray) -> bool:
    """Ist der Puls in diesem Fenster gemessen — oder steht er?

    **Warum das hier entscheidend ist.** Die Fremdkraft-Regel urteilt allein ueber die
    Puls-ANTWORT (Puls im Lauf minus Grundlinie davor). Bleibt der Sensor stehen, schreiben
    unsere Recorder den letzten bekannten Wert in jeden GPS-Punkt weiter — die Antwort ist dann
    exakt 0,0 bpm, und der Lauf gilt als „ohne eigene Kraft". Genau so ist es einem Nutzer am
    03.09. passiert: seine drei LAENGSTEN Laeufe (6:51, 8:28, 16:03 mit 527, 677 und 1402 Pumps)
    wurden abgetrennt, weil sein Puls 1658 Sekunden am Stueck auf 168 stand. Er musste sie von
    Hand zurueckholen und betitelte die Session mit „Bad experience with app".

    **Was es kostet, gemessen am belegten Vergleichssatz (04.09.):** von 50 menschlich als
    Fremdkraft eingeordneten langen Laeufen hat **kein einziger** einen eingefrorenen Puls im
    Lauf — von 41 echten Pumpfoil-Laeufen dagegen 5 (12 %). Diese Pruefung kostet also keinen
    einzigen echten Treffer und entschaerft nur Fehlanschuldigungen.

    Das ist dieselbe Doktrin, die oben schon steht („ohne brauchbaren Puls wird NICHT
    geurteilt") — sie griff nur nicht, wenn ein Puls DA ist, aber steht.
    """
    ok = ~np.isnan(hr) & (hr > 0)
    if int(ok.sum()) < 30:
        return False                      # zu duenn -> lieber nicht urteilen
    werte, zeit = hr[ok], t[ok]
    wechsel = np.flatnonzero(np.diff(werte) != 0)
    grenzen = np.concatenate(([0], wechsel + 1, [werte.size - 1]))
    laengste = 0.0
    for i in range(grenzen.size - 1):
        a_i, b_i = int(grenzen[i]), int(grenzen[i + 1])
        laengste = max(laengste, float(zeit[b_i] - zeit[a_i]) / 1000.0)
    return laengste < PULS_EINGEFROREN_S


def _fremdkraft_laeufe(segments: list, t_ms: np.ndarray, hr: np.ndarray,
                       gerade: np.ndarray, keep: list | None = None) -> tuple[list, list]:
    """Trennt Läufe ab, die keine eigene Kraft gekostet haben (Auto, Zug, Schleppen, Motor).

    WARUM JE LAUF und nicht je Fenster: der Puls ist das einzige Signal, das in allen geprüften
    Fällen getrennt hat — aber nur mit einer echten Ruhe-Grundlinie. Auf Fenster-Ebene gibt es die
    nicht (das Vorlauf-Fenster liegt selbst im Lauf, und der absolute Pegel hängt nach dem Foilen
    noch nach: in den bestätigten Autofahrten bis +43 über der Ruhe). Ein Lauf hat dagegen ein
    Davor, das außerhalb aller Läufe liegt — dort ist die Grundlinie belastbar.

    Gemessen (01.08., 218 belegte Fremdkraft-Läufe gegen 1879 Pumpfoil-Läufe; Labels aus den 28
    menschlich eingeordneten Nicht-Pumpfoil-Sessions, den 11 Einzel-Urteilen in
    `data/ground-truth/runs.json` und einer Kontrollgruppe ohne user 135 und ohne die
    Simulator-Sessions). Nur bei LANGEN Läufen (>= 240 s) fällt überhaupt eine Entscheidung; dort:

        Merkmal            Fremdkraft (73)   Pumpfoil (7)
        Geraden-Anteil          0,4              0,3       -> trennt NICHT
        Ø-Tempo                19,6             18,0       -> trennt kaum
        Puls-Antwort           +5              +27         -> trennt

    Regel `Puls-Antwort < MAX_PULS_ANTWORT`: **55 von 73** Fremdkraft-Läufen erkannt, 2 von 7
    Pumpfoil-Läufen getroffen — und diese zwei sind beide aus #251, einer Session, die selbst nicht
    nach Pumpfoil aussieht (Ø 18,3 km/h, Spitze 36,5, Puls −3/−7). Die Geometrie zusätzlich zu
    fordern macht es messbar SCHLECHTER (54 statt 55 Treffer bei gleichen Fehlern) — deshalb ist
    `gerade` hier nur noch eine mitgeschriebene Kennzahl.

    Ohne brauchbaren Puls wird NICHT geurteilt: dann fehlt das einzige belastbare Signal.
    """
    from .sportauto import MAX_PULS_ANTWORT, MIN_LANGER_LAUF_S, NACHLAUF_MS, VORLAUF_MS

    if not segments:
        return segments, []
    drin = np.zeros(t_ms.size, dtype=bool)
    for q in segments:
        drin |= (t_ms >= q["t_start_ms"]) & (t_ms <= q["t_end_ms"])
    ruhe_pool = hr[~drin & ~np.isnan(hr)]
    ruhe = float(np.median(ruhe_pool)) if ruhe_pool.size >= 10 else None

    behalten, fremd = [], []
    for q in segments:
        a, b = float(q["t_start_ms"]), float(q["t_end_ms"])
        sel = (t_ms >= a) & (t_ms <= b)
        q["gerade_anteil"] = round(float(gerade[sel].mean()), 3) if sel.any() else None
        if q["duration_s"] < MIN_LANGER_LAUF_S:
            behalten.append(q)
            continue
        # Vom Besitzer zurückgeholt („der zählt doch") -> nicht mehr beurteilen. Fenster in
        # Session-ms, gleiche Basis wie t_ms hier; Überlappung genügt (die Lauf-Grenzen können
        # sich durch eine Neuanalyse leicht verschieben, das Fenster stammt vom alten Lauf).
        if keep and any(ka < b and kb > a for ka, kb in keep):
            behalten.append(q)
            continue
        # Steht der Puls, gibt es kein Signal — dann wird nicht geurteilt (s. `_puls_lebt`).
        if not _puls_lebt(t_ms[sel], hr[sel]):
            q["puls_eingefroren"] = True
            behalten.append(q)
            continue
        # Grundlinie: die 90 s vor dem Lauf, aber NUR Samples außerhalb aller Läufe. Fehlt das,
        # nimmt die Ruhe der ganzen Session ihren Platz ein.
        vor = hr[(t_ms >= a - VORLAUF_MS) & (t_ms < a) & ~drin]
        vor = vor[~np.isnan(vor)]
        basis = float(np.median(vor)) if vor.size >= 5 else ruhe
        nach = hr[(t_ms >= a + (b - a) / 2) & (t_ms <= b + NACHLAUF_MS)]
        nach = nach[~np.isnan(nach)]
        antwort = (float(np.median(nach)) - basis) if (nach.size >= 5 and basis is not None) else None
        q["puls_antwort_bpm"] = None if antwort is None else round(antwort, 1)
        if antwort is not None and antwort < MAX_PULS_ANTWORT:
            fremd.append({
                "t_start_ms": int(a), "t_end_ms": int(b),
                "dauer_s": round(float(q["duration_s"]), 1),
                "kmh": round(float((q.get("avg_speed_mps") or 0) * 3.6), 1),
                "gerade_anteil": q["gerade_anteil"],
                "puls_antwort_bpm": round(antwort, 1),
                "grund": (f"{q['duration_s']:.0f} s am Stück bei "
                          f"{(q.get('avg_speed_mps') or 0) * 3.6:.1f} km/h, Puls-Antwort nur "
                          f"{antwort:+.0f} bpm gegen die Ruhe davor"),
            })
        else:
            behalten.append(q)
    return behalten, fremd


def model_mask_on_timebase(tb: TimeBase):
    """Die trainierte On-Foil-Maske (`foil_rf.pkl`), aber auf DIESER Zeitachse ausgerichtet.

    Warum das hier stehen muss: `extract_features` greift pro GPS-Sample per
    `index = t_ms/1000 * accel_hz` in die Accel-Spur — die Annahme „gleichmässige Rate ab t=0"
    ist genau die, die v2 abschaffen soll. Statt das Modell neu zu bauen, bekommt es eine Spur,
    für die die Annahme WAHR ist: die echten Sample-Zeiten (`tb.t_accel_ms`) werden auf ein
    gleichmässiges Raster der Achsen-Rate abgetastet. Fehlt Accel, gibt es keine Maske (None) —
    dann entscheidet v2 wie bisher allein aus den Fenstern.
    """
    if not tb.has_accel or not tb.accel_hz:
        return None
    from .foil_model import predict_foiling_mask

    off = float(tb.window_start_ms)
    n = int(round((tb.window_end_ms - off) / 1000.0 * tb.accel_hz)) + 1
    if n < 2:
        return None
    ziel = off + np.arange(n, dtype=float) / tb.accel_hz * 1000.0
    idx = np.clip(np.searchsorted(tb.t_accel_ms, ziel), 0, tb.accel.shape[0] - 1)
    raster = tb.accel[idx]
    # GPS auf denselben Nullpunkt, damit t_ms und Raster-Index dieselbe Achse meinen. Lücken aus
    # ausgeschlossenen Bereichen bleiben Lücken — die Zuordnung stimmt trotzdem, weil die Zeiten
    # echt sind (in v1 war das nur zufällig richtig, solange nichts ausgeschlossen war).
    gps0 = [[g[0] - off] + list(g[1:]) for g in tb.gps]
    return predict_foiling_mask(gps0, raster, tb.accel_hz, tb.accel_scale)


# --- Keim-Rettung (19.08.2026) ----------------------------------------------------------
# Befund an #2430 (Nutzermeldung): ein Lauf, den BEIDE Quellen zeigen — 28 s / 94 m bei 11,6 km/h
# im GPS, dazu 7 Fenster am Stueck mit sauberem 2-Hz-Pumprhythmus (RMS 0,26-0,79 g) — fehlte in
# der Auswertung. Ursache liegt nicht an den Geschwindigkeits-Schwellen (die reine GPS-
# Segmentierung findet ihn auf ALLEN drei Empfindlichkeitsstufen, auch auf „Standard"), sondern
# eine Stufe hoeher: mit Accel ist das On-Foil-Modell die Quelle des Keims, und es hat dort genau
# EINE Sekunde gefeuert. Ein Keim muss aber `min_segment_s` Samples lang sein (_segments_from_mask
# filtert VOR dem Verlaengern) — eine einzelne Sekunde faellt darunter, der Lauf entsteht also gar
# nicht erst und kann durch _extend_starts_back/_extend_ends_forward auch nicht mehr wachsen.
# Zum Vergleich: Lauf 4 derselben Session wurde aus sechs verstreuten Modell-Sekunden zu 80 s.
#
# Die Rettung nimmt NICHTS weg und vergroessert NICHTS, was schon erkannt wird: sie greift genau
# dort, wo das Modell gezuckt hat, aber zu kurz fuer einen Keim — und nur, wenn die Fenster
# ringsherum den Lauf unabhaengig belegen. Damit gilt weiter „Physik als Schranke, Modell als
# Ausloeser" (docs/detector-v2.md, Abschnitt 3): ohne Modell-Sekunde passiert nichts, ohne
# Fenster-Beleg auch nicht. In #2430 bleibt deshalb eine zweite Foil-Strecke (20 s, 2085-2105 s)
# draussen — dort hat das Modell null Mal gefeuert.
#
# Gemessen ueber ALLE 1609 Sessions mit Accel (11 391 Laeufe, 153,8 h) vor dem Einbau:
#   7 Sessions veraendert (0,4 %) · 8 Laeufe dazu (Median 20 s) · 0 verloren · Foil-Zeit +0,03 % ·
#   kein einziger laengster/weitester Lauf einer Session veraendert -> keine Bestleistung, kein
#   Rekord bewegt sich. Die betroffenen Sessions: 2430, 2132, 2033, 1619, 941, 913, 876.
# Verworfene Alternativen, beide durchgerechnet: die Keim-Mindestlaenge einfach auf 1 zu setzen
# verschiebt 34 % aller Sessions und legt 762 Laeufe dazu (Median 8 s) — das waere eine andere
# Erkennung, keine Fehlerkorrektur. Und die Strecke IMMER als Keim zu nehmen (auch wo das Modell
# schon genug hatte) verlaengert bestehende, richtige Laeufe um im Median 1 %, im Extremfall 34 %.
BELEG_MIN_MS = 30_000     # Mindest-Spanne der Fenster-Strecke, die einen Ein-Sekunden-Keim traegt.
# 30 s ist gemessen, nicht geraten: bei 20 s kommen 155 statt 8 Laeufe dazu, ueberwiegend
# 5-9-Sekunden-Fragmente; bei 45 s faellt der belegte Fall #2430 selbst heraus (seine Strecke
# spannt 40 s). Wichtig zum Lesen der Zahl: ein Fenster ist 10 s breit (Hop 5 s), die Spanne einer
# Strecke liegt also rund 10 s ueber der Aktivitaet darin — 30 s Spanne heisst ~20 s Pumpen.


def _laengste_kette(maske: np.ndarray) -> int:
    """Laengste zusammenhaengende True-Kette (in Samples)."""
    if not maske.any():
        return 0
    rand = np.flatnonzero(np.diff(np.concatenate(([0], maske.astype(np.int8), [0]))))
    return int((rand[1::2] - rand[::2]).max())


def _rette_keime(modell: np.ndarray, wins: list[dict], t_ms: np.ndarray,
                 min_segment_s: float, gps_hz: int) -> np.ndarray:
    """Ein zu kurzer Modell-Keim zaehlt, wenn die Fenster ihn tragen. Begruendung oben.

    Bedingungen, alle drei noetig: die Strecke aus zusammenhaengenden Foil-Fenstern spannt
    mindestens BELEG_MIN_MS, sie enthaelt mindestens ein PUMPEN-Fenster (Rhythmus, nicht nur
    Tempo), und das Modell hat darin gefeuert — aber kuerzer als die Mindestdauer, sonst macht
    der normale Weg den Lauf ohnehin und wir fassen ihn nicht an."""
    n_min = max(int(round(min_segment_s * gps_hz)), 1)
    fill = max(int(round(v1.GAP_FILL_S * gps_hz)), 1)
    zusatz = np.zeros(modell.size, dtype=bool)
    i, n = 0, len(wins)
    while i < n:
        if wins[i]["label"] not in FOIL_LABELS:
            i += 1
            continue
        j = i
        while j < n and wins[j]["label"] in FOIL_LABELS:
            j += 1
        a, b = wins[i]["t_start_ms"], wins[j - 1]["t_end_ms"]
        if (b - a) >= BELEG_MIN_MS and any(w["label"] == PUMPEN for w in wins[i:j]):
            drin = (t_ms >= a) & (t_ms <= b)
            if drin.size == modell.size and (modell & drin).any() \
                    and _laengste_kette(v1._close_gaps(modell & drin, fill)) < n_min:
                zusatz |= drin
        i = j
    return modell | zusatz


def detect_v2(
    tb: TimeBase, gps_hz: int = 1,
    enter_speed: float = v1.ENTER_SPEED, exit_speed: float = v1.EXIT_SPEED,
    min_segment_s: float = v1.MIN_SEGMENT_S, min_seg_avg_speed: float = v1.MIN_SEG_AVG_SPEED,
    use_model: bool = True, keep_windows: list | None = None, judge_fremdkraft: bool = True,
) -> dict:
    """Rechnet die Erkennung v2 auf einer fertigen Zeitachse. Alle Zeiten im Ergebnis sind
    SESSION-Millisekunden. Schreibt nichts, liest nichts nach."""
    gps = tb.gps
    if len(gps) < 2:
        return _leeres_ergebnis(tb)

    t_ms = tb.t_gps_ms.astype(float)
    lat = np.array([float(s[1]) for s in gps])
    lon = np.array([float(s[2]) for s in gps])
    hr = np.array([float(s[4]) if len(s) > 4 and s[4] is not None else np.nan for s in gps])
    hacc = np.array([float(s[5]) if len(s) > 5 and s[5] is not None else np.nan for s in gps])
    speed_raw = np.array([float(s[3]) if len(s) > 3 and s[3] is not None else np.nan for s in gps])

    lat, lon = v1._fill_invalid_coords(lat, lon)
    lat, lon = v1._repair_spikes(lat, lon)
    step = step_distances_m(lat, lon)
    step = np.where(step > v1.OUTLIER_STEP_M, 0.0, step)

    dt = np.diff(t_ms, prepend=t_ms[0]) / 1000.0
    dt = np.where(dt <= 0, 1.0 / max(gps_hz, 1), dt)
    speed_from_pos = step / dt
    speed = _clean_speed(np.where(np.isnan(speed_raw), speed_from_pos, speed_raw), gps_hz)

    win = max(int(round(v1.SMOOTH_WINDOW_S * gps_hz)), 1)
    speed_s = v1._running_median(speed, win)
    speed5 = v1._running_median(speed, max(int(round(5 * gps_hz)), 1))
    pos_speed_s = v1._running_median(speed_from_pos, win)
    quality_ok = np.isnan(hacc) | (hacc <= v1.MAX_HACC)

    # Puls-Veto gegen die Geraden-Regel (s. _mark_powered_straights): dieselbe Messung wie in
    # `sportauto`, auf derselben Achse — tb.gps traegt Session-ms, die Fenster ebenso.
    from .sportauto import puls_antwort

    wins = label_windows(window_grid(tb), enter_speed, exit_speed,
                         puls=lambda a, b: puls_antwort(tb.gps, a, b))

    # Fenster-Label -> Sample-Maske. Ein Sample gehört zu einem Lauf, wenn es in mindestens
    # einem Foil-Fenster liegt; die Überlappung von 50 % macht die Ränder weich statt hart.
    mask = np.zeros(t_ms.size, dtype=bool)
    for w in wins:
        if w["label"] in FOIL_LABELS:
            mask |= (t_ms >= w["t_start_ms"]) & (t_ms <= w["t_end_ms"])
    # Veto PRO SAMPLE, nicht pro Fenster: über der Bandgrenze trägt kein Foil (v1: MAX_FOIL_SPEED).
    # Aus dem Fenster-Label übernommen war das viel zu grob — ein einzelner Wert über der Grenze
    # schlug ein ganzes 10-s-Fenster (plus Überlappung) heraus und zerlegte damit schnelle Sessions:
    # #1196 (Wing, bis 36 km/h) fiel so von 11 auf 89 Läufe, der längste von 1226 s auf 133 s.
    # v1 prüft dieselbe Grenze sample-weise; genau das tut v2 jetzt auch.
    veto = speed_s > v1.MAX_FOIL_SPEED
    # Wo es Accel gibt, ist das trainierte On-Foil-Modell die QUELLE der Maske — die Fenster sind
    # nur die Schranke (Fremdkraft-Veto). Genau so steht es im Entwurf: „Physik als Schranke, nicht
    # als Detektor" (docs/detector-v2.md, Abschnitt 3). Der erste v2-Bau hat das Modell ganz
    # weggelassen und allein aus Fenstern entschieden; über den Bestand gemessen hat das die
    # Laufzahl systematisch aufgebläht und `model`-Sessions Foil-Zeit geschenkt.
    # Verundet man beides (Fenster UND Modell), wird es zu streng — zwei Detektoren zu schneiden
    # verliert jeden Lauf, über den sie uneins sind (gemessen an #1310: 113 s -> 46 s).
    modell = model_mask_on_timebase(tb) if use_model else None
    if modell is not None and modell.size == mask.size:
        # Kurze Modell-Lücken schließen wie in v1 (gps.py:331) — eine Gleitpause zerteilt keinen
        # Lauf. Ohne das zerfällt die Maske und die Bruchstücke fallen unter MIN_SEGMENT_S:
        # gemessen an #1310 kostet das allein 11 Läufe -> 4 und 113 s -> 46 s.
        # Zu kurze Modell-Keime retten, wo die Fenster den Lauf unabhaengig belegen (s. oben).
        modell = _rette_keime(modell, wins, t_ms, min_segment_s, gps_hz)
        mask = v1._close_gaps(modell, max(int(round(v1.GAP_FILL_S * gps_hz)), 1))
    else:
        # OHNE Accel (gps_only) nimmt v2 dieselbe Heuristik wie v1 statt der Fenster-Labels.
        # Grund, gemessen über den Bestand: die Fenster-Maske zerlegt genau diese Sessions
        # systematisch — #1196 ging von 11 auf 89 Läufe, der längste Lauf von 1226 s auf 133 s.
        # Für die Fenster-Maske gibt es kein einziges Label als Beleg, für v1s Automaten (Speed-Band
        # + Glätte + Dwell) die gesamte bisherige Praxis. v2 ändert damit bei gps_only NICHT mehr,
        # WIE on-foil erkannt wird, sondern nur, was danach als Fremdkraft abgetrennt wird — und
        # genau das war der Auftrag. Die Fenster bleiben als Merkmale und für das Veto erhalten.
        cv = v1._running_cv(speed_s, win)
        mask = v1._heuristic_mask(speed_s, cv, quality_ok, gps_hz, enter_speed, exit_speed)
    mask &= ~veto
    # Dieselben physischen Böden wie v1 (gps.py): unter EXIT_SPEED trägt kein Foil, eine
    # unbrauchbare Position ist wertlos, und ohne echte Positionsbewegung gibt es keinen Vortrieb.
    mask &= (speed_s >= exit_speed) & quality_ok & (pos_speed_s >= v1.MOVE_FLOOR_MPS)

    speeds = {"1": speed, "3": speed_s, "5": speed5}
    segments = v1._segments_from_mask(mask, t_ms, gps_hz, step, speeds,
                                      min_segment_s, min_seg_avg_speed)
    # Nachbearbeitung WORTGLEICH wie v1 — mit den echten Geschwindigkeiten.
    # Ursprünglich standen hier künstlich auf 0 gesetzte Werte an den Veto-Stellen, damit kein Lauf
    # über eine Autofahrt hinwegwächst. Das ist überflüssig, seit die Fremdkraft je LAUF entschieden
    # wird — und es war schädlich: die Nullen verhinderten das Zusammenführen an jeder Stelle über
    # der Bandgrenze und zerlegten schnelle Sessions noch weiter (#1196: 89 -> 207 Läufe).
    segments = v1._merge_no_stop(segments, speed_s, t_ms, step, speeds, gps_hz, pos_speed_s=pos_speed_s)
    segments = v1._extend_starts_back(segments, speed_s, t_ms, step, speeds, enter_speed)
    segments = v1._extend_ends_forward(segments, speed_s, t_ms, step, speeds, exit_speed)
    segments = v1._merge_no_stop(segments, speed_s, t_ms, step, speeds, gps_hz, pos_speed_s=pos_speed_s)
    segments = v1._repair_deadreckoning(segments, lat, lon, t_ms, step, speeds, gps_hz)
    segments = v1._trim_fall_tail(segments, lat, lon, t_ms, step, speeds, gps_hz)
    segments, n_gated = v1._gate_implausible_runs(segments)

    # Fremdkraft-Entscheidung JE LAUF — erst hier, nicht im Fenster-Raster (Begründung in
    # `_fremdkraft_laeufe`). Vorgeschlagen, nicht verhängt: die betroffenen Läufe verlassen die
    # Auswertung, stehen aber vollständig in `metrics["fremdkraft_laeufe"]` samt Messwerten.
    if judge_fremdkraft:
        segments, fremd_laeufe = _fremdkraft_laeufe(segments, t_ms, hr, gerade_je_sample(lat, lon),
                                                    keep=keep_windows)
    else:
        # Session ist menschlich einer anderen Sportart zugeordnet -> Fremdkraft-Frage ist
        # beantwortet, alle Laeufe zaehlen fuer IHRE Sportart.
        fremd_laeufe = []

    mask = np.zeros(t_ms.size, dtype=bool)
    for seg in segments:
        mask[seg["i_start"]: seg["i_end"] + 1] = True

    for seg in segments:
        seg["end_type"], seg["end_decel_mps2"] = v1._classify_end(seg["i_end"], speed_s, step, gps_hz)
        st = seg.pop("_start_t_exact", None)
        st = float(t_ms[seg["i_start"]]) if st is None else st
        seg["start_pt"] = v1._interp_lonlat(t_ms, lat, lon, st)
        ie = seg["i_end"]
        seg["end_pt"] = [round(float(lon[ie]), 6), round(float(lat[ie]), 6)]
        _annotate_run(seg, wins)

    total_distance = float(step.sum())
    foiling_distance = float(step[mask].sum())
    foiling_time = float(sum(s["t_end_ms"] - s["t_start_ms"] for s in segments) / 1000.0)
    # Hoechstgeschwindigkeit NUR aus den erkannten LAEUFEN: der 3-s-Wert je Lauf, der ohnehin
    # schon berechnet und in der Lauf-Liste angezeigt wird. Vorher war es das schnellste
    # Einzel-Sample im ganzen Trim-Fenster — damit standen Autofahrt-Reste in der Bestenliste
    # (gemessen 07.08.: #1619 mit 73 km/h und #913 mit 61,6, waehrend der schnellste ECHTE Lauf
    # im gesamten Bestand bei 28,9 km/h liegt). Die Kennzahl bedeutet jetzt „schnellste drei
    # Sekunden auf dem Foil": robust gegen Einzel-Spitzen und immun gegen alles ausserhalb der
    # Laeufe. Die Segmente sind hier bereits durch _gate_implausible_runs gelaufen — ein
    # verworfener Lauf kann das Maximum also nicht mehr setzen.
    max_speed = max((float(s.get("max_speed_mps") or 0.0) for s in segments), default=0.0)

    def _stat(arr, fn, nd=2):
        a = arr[mask]
        a = a[~np.isnan(a)]
        return round(float(fn(a)), nd) if a.size else None

    hr_valid = hr[~np.isnan(hr)]
    metrics = {
        "num_segments": len(segments),
        "gated_runs": n_gated,
        "avg_hr": int(round(float(hr_valid.mean()))) if hr_valid.size else None,
        "max_hr": int(np.nanmax(hr)) if hr_valid.size else None,
        "avg_speed_mps": _stat(speed_s, np.mean),
        "max_speed_5s_mps": _stat(speed5, np.max),
        "min_speed_5s_mps": _stat(speed5, np.min),
        "longest_segment_s": round(max((s["duration_s"] for s in segments), default=0.0), 1),
        "farthest_segment_m": round(max((s["distance_m"] for s in segments), default=0.0), 1),
        "num_windows": len(wins),
        "window_labels": {k: sum(1 for w in wins if w["label"] == k)
                          for k in (PUMPEN, GLEITEN, RUHE, FREMDKRAFT)},
        # Anteil Fremdkraft an allen Fenstern MIT Vortrieb. Rein beschreibend (entscheidet nichts),
        # trennt aber auf dem beschrifteten Material die transport-lastigen Sessions sauber von
        # den echten: gemessen 48 % / 49 % / 40 % (Autofahrt bzw. Zug) gegen 0-12 % bei den
        # echten Sessions. Taugt als Kandidat für die Admin-Verdachtsliste.
        "powered_share": _powered_share(segments, fremd_laeufe),
        # Vorschlag, keine Entscheidung: was v2 für Fremdkraft hält, wandert NICHT still in die
        # Daten (Entwurf, „Was NICHT gemacht wird"), sondern wird als Fenster angeboten.
        "powered_ranges_ms": [[f["t_start_ms"], f["t_end_ms"]] for f in fremd_laeufe],
        # Die abgetrennten Laeufe vollstaendig mit Messwerten und Begruendung — Grundlage
        # fuer einen Vorschlag an den Nutzer und fuer die Admin-Sicht.
        "fremdkraft_laeufe": fremd_laeufe,
    }
    metrics.update(tb.provenance())

    coords = [[float(lo), float(la)] for la, lo in zip(lat, lon)]
    speeds_by_win = {w: [round(float(v), 2) for v in np.nan_to_num(speeds[w])] for w in ("1", "3", "5")}
    hrs = [int(v) if not np.isnan(v) else None for v in hr]
    return {
        "algo_version": ALGO_VERSION,
        "total_distance_m": round(total_distance, 1),
        "foiling_distance_m": round(foiling_distance, 1),
        "foiling_time_s": round(foiling_time, 1),
        "max_speed_mps": round(max_speed, 2),
        "track_geojson": v1._track_geojson(coords, speeds_by_win, hrs),
        "segments": segments,
        "metrics": metrics,
        "windows": wins,
    }


def _annotate_run(seg: dict, wins: list[dict]) -> None:
    """Je Lauf mitschreiben, welche Fenster ihn tragen und welche Signale ausschlaggebend
    waren — das ist der Punkt der Fenster-Architektur: die Entscheidung bleibt nachvollziehbar."""
    tragend = [w for w in wins
               if w["label"] in FOIL_LABELS
               and w["t_end_ms"] > seg["t_start_ms"] and w["t_start_ms"] < seg["t_end_ms"]]
    seg["v2_windows"] = [w["i"] for w in tragend]
    seg["v2_labels"] = {PUMPEN: sum(1 for w in tragend if w["label"] == PUMPEN),
                        GLEITEN: sum(1 for w in tragend if w["label"] == GLEITEN)}
    seg["v2_why"] = sorted({g for w in tragend for g in (w.get("why") or [])})[:4]
    # Beifang, nicht Entscheider (Entwurf Abschnitt 3): Puls + Kursänderung je Lauf.
    hrs = [w["hr_bpm"] for w in tragend if w.get("hr_bpm") is not None]
    crs = [w["course_rate_deg"] for w in tragend if w.get("course_rate_deg") is not None]
    seg["v2_hr_bpm"] = round(float(np.median(hrs)), 1) if hrs else None
    seg["v2_course_rate_deg"] = round(float(np.median(crs)), 2) if crs else None


def _powered_share(segments: list, fremd: list) -> float | None:
    """Anteil der Fremdkraft an der gesamten Fahrzeit (behaltene Laeufe + abgetrennte).

    Rein beschreibend, entscheidet nichts — taugt aber als Verdachtsmass fuer die Admin-Sicht.
    Seit dem Umbau auf die Lauf-Ebene zaehlt SEKUNDEN, nicht Fenster: eine Zahl, die sich mit der
    angezeigten Foil-Zeit deckt, ist nachvollziehbarer als eine Fensterquote."""
    fremd_s = sum(f["dauer_s"] for f in fremd)
    gesamt = sum(float(q.get("duration_s") or 0.0) for q in segments) + fremd_s
    if gesamt <= 0:
        return None
    return round(fremd_s / gesamt, 3)


def _leeres_ergebnis(tb: TimeBase) -> dict:
    m = {"num_segments": 0, "gated_runs": 0, "num_windows": 0,
         "window_labels": {}, "powered_ranges_ms": []}
    m.update(tb.provenance())
    return {
        "algo_version": ALGO_VERSION, "total_distance_m": 0.0, "foiling_distance_m": 0.0,
        "foiling_time_s": 0.0, "max_speed_mps": 0.0, "track_geojson": v1._track_geojson([]),
        "segments": [], "metrics": m, "windows": [],
    }


# --- Einstieg für die Analyse-Pipeline ---------------------------------------------------

def analyze_session_v2(session, *, gps=None, accel=None, rebase: bool = True,
                       judge_fremdkraft: bool = True, **preset) -> dict:
    """v2 für eine DB-Session: baut die Zeitachse selbst (Trim + Ausschluss inklusive) und
    liefert das Ergebnis im Format von `analyze_gps`.

    `rebase=True` verschiebt die Segment-Zeiten am Schluss auf die v1-Konvention (0 = Trim-Start),
    weil alles Nachgelagerte in der Pipeline (Pump-Fenster, gespeicherte Segmente, Anzeige) diese
    Basis erwartet. Das ist das EINZIGE Zugeständnis an die alte Rechnung — die Wahrheit in
    Session-Koordinaten bleibt je Lauf als `t_start_session_ms`/`t_end_session_ms` erhalten.
    Der Vergleichs-Harness ruft mit `rebase=False` auf und bleibt damit durchgehend in
    Session-Koordinaten."""
    tb = build_timebase_for_session(session, gps=gps, accel=accel)
    # Zurückgeholte Fremdkraft-Läufe (Session-ms, wie excluded_ranges): kaputtes JSON darf die
    # Analyse nie scheitern lassen -> defensiv parsen.
    keep = []
    try:
        for item in (json.loads(session.fremdkraft_keep) if getattr(session, "fremdkraft_keep", None) else []):
            a, b = int(item[0]), int(item[1])
            if b > a:
                keep.append((a, b))
    except (ValueError, TypeError, IndexError):
        keep = []
    res = detect_v2(tb, gps_hz=session.gps_hz or 1, keep_windows=keep or None,
                    judge_fremdkraft=judge_fremdkraft, **preset)
    for seg in res["segments"]:
        seg["t_start_session_ms"] = int(seg["t_start_ms"])
        seg["t_end_session_ms"] = int(seg["t_end_ms"])
    if rebase and tb.window_start_ms:
        off = int(tb.window_start_ms)
        for seg in res["segments"]:
            seg["t_start_ms"] = int(seg["t_start_ms"]) - off
            seg["t_end_ms"] = int(seg["t_end_ms"]) - off
    res["timebase"] = tb
    return res
