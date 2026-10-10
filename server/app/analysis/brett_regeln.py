"""Regeln statt Modell fuer Handy-am-Brett: pump / gleiten / aus je Lauf (10.10.2026, mit Jan).

Am Brett misst das Handy die Physik direkt — Hub, Nicken, Tempo. Deshalb braucht es hier kein
Modell, sondern ein paar erklaerbare Regeln, die fuer jeden Lauf gleich sind. Uebernommen aus
`scripts/v3/brett_labels.py` (dort an 17 Paaren mit Uhr geprueft), hier als reine Funktion, die
nichts liest und nichts schreibt.

Definition, je Abtastschritt:
  pump     Hub-Zyklus (Gipfel -> Gipfel im Hub 0,5-3 Hz), der ENERGIE hineinbringt: die Kopplung
           mean(schnelles Nicken x Hubgeschwindigkeit) liegt ueber 0,3 des Medians der Zyklen
           desselben Laufs. Das trennt echte Pumps (auch kleine „bis zum Steg") von Nachschwingen
           und Ausgleichsbewegungen. Jan: „bringt keine Energie ins System -> kein Pump, sondern
           gleiten". Gemessen an Jans Laeufen: Fahrt-Zyklen 93 % mit Energie, schwache Endzyklen
           17 %, Treiben 0 %.
  gleiten  auf dem Foil ohne Energie: vom Laufstart bis zum Aufsetzen, ausser pump.
  aus      sonst.
Aufsetzen = erster ECHTER GPS-Punkt (Vorgaenger <= 1,5 s) ab Laufende - 15 s unter
max(8 km/h, 0,6 x Fahrt-Tempo), minus 0,7 s Doppler-Nachlauf; ohne solchen Punkt das erkannte Ende.

Grenzen: eine Naeherung, keine Leistungsmessung; relativ zum eigenen Pumpen im selben Lauf; setzt
eine feste Montage voraus. Die Montage-Kennzahlen (`montage`) werden mitgeliefert, aber noch nicht
als Schranke benutzt — sie trennen bisher nur im Vergleich, nicht per fester Schwelle.
"""
from __future__ import annotations

import numpy as np

HZ = 25.0
REGEL_VERSION = "brett-regeln-1"
ENERGIE_ANTEIL = 0.3          # Zyklus zaehlt als Pump ab 0,3 x Median-Kopplung des Laufs
MIN_ZYKLEN = 5                # weniger Zyklen im Lauf: kein Median, keine Pump-Aussage
MAX_ZYKLUS_MS = 1600          # laengere Gipfel-Abstaende sind kein Pumpzyklus mehr
AUFSETZ_MIN_KMH = 8.0
AUFSETZ_ANTEIL = 0.6
DOPPLER_NACHLAUF_MS = 700


def _band(x: np.ndarray, lo: float, hi: float) -> np.ndarray:
    X = np.fft.rfft(x - np.mean(x))
    f = np.fft.rfftfreq(x.size, 1 / HZ)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, n=x.size)


def aufsetzen_ms(gps: np.ndarray, a: float, b: float) -> tuple[float, str]:
    """Zeitpunkt des Aufsetzens (Session-ms) und Quelle ("gps" | "lauf")."""
    if gps.size == 0:
        return b, "lauf"
    gt, gv = gps[:, 0], np.nan_to_num(gps[:, 3]) * 3.6
    fahrt = (gt >= a + 3000) & (gt <= b - 5000)
    if fahrt.sum() < 5:
        return b, "lauf"
    grenze = max(AUFSETZ_MIN_KMH, AUFSETZ_ANTEIL * float(np.median(gv[fahrt])))
    for i in np.where((gt >= b - 15000) & (gt <= b + 10000))[0]:
        if gv[i] < grenze and i > 0 and gt[i] - gt[i - 1] <= 1500:
            return float(gt[i] - DOPPLER_NACHLAUF_MS), "gps"
    return b, "lauf"


def montage(t: np.ndarray, pitch: np.ndarray, roll: np.ndarray, laeufe: list[tuple[float, float]]) -> dict:
    """Kennzahlen fuer „fest am Brett", NUR innerhalb der Laeufe (dazwischen treibt das Brett
    beliebig). Nick-Anteil der Drehung im Pump-Band und Streuung der mittleren Lage von Lauf zu Lauf."""
    nick, lagen = [], []
    for a, b in laeufe:
        m = (t >= a) & (t <= b)
        if m.sum() < 2 * HZ:
            continue
        p, r = _band(pitch[m], 0.5, 3.0), _band(roll[m], 0.5, 3.0)
        e = float(np.sum(p ** 2) + np.sum(r ** 2))
        if e > 0:
            nick.append(float(np.sum(p ** 2)) / e)
        lagen.append((float(np.median(pitch[m])), float(np.median(roll[m]))))
    streuung = None
    if len(lagen) >= 2:
        arr = np.asarray(lagen)
        streuung = float(np.median(np.hypot(*(arr - np.median(arr, axis=0)).T)))
    return {"nick_anteil": round(float(np.median(nick)), 3) if nick else None,
            "lage_streuung_grad": round(streuung, 1) if streuung is not None else None}


def je_lauf(t: np.ndarray, hub_cm: np.ndarray, pitch_deg: np.ndarray, gps: np.ndarray,
            laeufe: list[tuple[float, float]]) -> tuple[np.ndarray, list[dict]]:
    """Labels (0 aus, 1 gleiten, 2 pump) je Abtastschritt und Kennzahlen je Lauf.

    `t` in Session-ms, gleichmaessig mit HZ; `laeufe` als (Start, Ende) in Session-ms;
    `gps` wie `storage.load_gps` (t_ms, lat, lon, Tempo m/s, ...)."""
    hub = np.nan_to_num(np.asarray(hub_cm, float))
    pitch = np.nan_to_num(np.asarray(pitch_deg, float))
    gps = np.asarray(gps, float) if len(gps) else np.empty((0, 4))
    lab = np.zeros(t.size, dtype=np.int8)
    aus: list[dict] = []
    if t.size < 2 * HZ:
        return lab, [{"ok": False} for _ in laeufe]
    from scipy.signal import find_peaks
    hb = _band(hub, 0.5, 3.0)
    pf = _band(pitch, 0.5, 3.0)
    vz = np.gradient(hb) * HZ
    pk, _ = find_peaks(hb, prominence=0.5, distance=int(0.35 * HZ))
    dt = 1.0 / HZ
    for a, b in laeufe:
        td, quelle = aufsetzen_ms(gps, a, b)
        ia, itd = np.searchsorted(t, a), np.searchsorted(t, td)
        lab[ia:itd] = 1
        zyklen = [(pk[i], pk[i + 1], float(np.mean(pf[pk[i]:pk[i + 1]] * vz[pk[i]:pk[i + 1]])))
                  for i in range(len(pk) - 1)
                  if a <= t[pk[i]] and t[pk[i + 1]] <= td and t[pk[i + 1]] - t[pk[i]] <= MAX_ZYKLUS_MS]
        pumps = 0
        if len(zyklen) >= MIN_ZYKLEN:
            wref = float(np.median([w for _, _, w in zyklen]))
            sg = np.sign(wref) or 1.0
            for p0, p1, w in zyklen:
                if wref != 0 and sg * w / abs(wref) > ENERGIE_ANTEIL:
                    lab[p0:p1] = 2
                    pumps += 1
        stueck = lab[ia:itd]
        aus.append({
            "ok": len(zyklen) >= MIN_ZYKLEN,
            "aufsetzen_ms": round(td), "aufsetzen_quelle": quelle,
            "zyklen": len(zyklen), "pumps": pumps,
            "pump_s": round(float(np.sum(stueck == 2) * dt), 1),
            "gleit_s": round(float(np.sum(stueck == 1) * dt), 1),
        })
    return lab, aus
