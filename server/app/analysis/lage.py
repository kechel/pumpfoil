"""Lage des Bretts aus Beschleunigung + Drehrate: Pitch, Roll und Gierwinkel-Aenderung.

NUR sinnvoll, wenn das Geraet AM BRETT befestigt war (`sessions.placement == "board"`). In der
Tasche, in der Jacke oder am Arm misst das Handy den Fahrer und nicht das Brett — genau der
„arm-confound", an dem die Wrist-Auswertung 2026-06 schon gescheitert ist.

WARUM BEIDE SENSOREN GEBRAUCHT WERDEN
- Der Beschleunigungsmesser allein kennt die Schwerkraft und liefert damit einen ABSOLUTEN
  Neigungswinkel — aber nur im Stillstand. Beim Pumpen ist er von der Bewegung dominiert.
- Der Kreisel allein misst Dreh-RATE. Integriert man sie, laeuft der Winkel mit dem Bias weg.
- Zusammen ergaenzen sie sich: der Kreisel traegt die schnellen Aenderungen im Stroke, die
  Schwerkraft haelt den Nullpunkt fest (Komplementaerfilter).

YAW IST ANDERS. Fuer die Drehung um die Hochachse gibt es keinen Anker — ein Magnetometer
zeichnen wir nicht auf. Ein absoluter Kurs waere deshalb integrierter Drift. Was geht, ist die
AENDERUNG ueber ein kurzes Fenster: der Fehler ist im Wesentlichen Bias × Fensterlaenge, bei
einer Sekunde also rund ein Grad. Das Fenster ist damit keine Genauigkeits-, sondern eine
Was-sehe-ich-Schraube (0,1 s ≈ Momentanrate, 1 s ein Pumpzyklus, 3-5 s der ganze Carve).

DIE GIERRATE MUSS AUF DIE SCHWERKRAFT PROJIZIERT WERDEN, nicht einfach die Z-Achse des Geraets
genommen: in der Kurve ist das Brett gerollt, seine Hochachse zeigt dann nicht nach oben. Sonst
lecken Roll- und Nickrate genau dann in die Yaw-Zahl, wenn sie am interessantesten ist.

ZWEI ZEITACHSEN. Accel und Gyro laufen NICHT zwingend gleich schnell: auf dem iPhone beide exakt
50 Hz mit identischen Chunk-Startzeiten, auf einem Pixel 7a dagegen 120,5 gegen 60,3 Hz (bei
angeforderten 50 — Android behandelt die Rate als Wunsch). Deshalb wird jeder Kanal aus seinen
EIGENEN `.t0`-Sidecars aufgebaut und dann auf ein gemeinsames Raster gelegt.
"""
from __future__ import annotations

import numpy as np

# Skalen des Uebertragungsformats (docs/data-format.md)
ACCEL_SCALE = 2048.0   # int16 je g
GYRO_SCALE = 1024.0    # int16 je rad/s

# Komplementaerfilter: Zeitkonstante, ab der die Schwerkraft die Fuehrung uebernimmt. 1,5 s ist
# lang genug, dass ein Pumpzyklus (rund 0,7 s) den Winkel nicht verzieht, und kurz genug, dass
# ein echter Lagewechsel nicht hinterherhinkt.
TAU_S = 1.5
# Ruhe-Erkennung fuer den Bias-Abzug und den Nullpunkt: Fenster, in denen sich fast nichts tut.
RUHE_GYRO_RADS = 0.15      # Drehrate darunter gilt als still
RUHE_ACCEL_G = 0.08        # Abweichung des Betrags von 1 g darunter gilt als still
RUHE_MIN_S = 0.5


def zeitachse(t0_ms: dict[int, int], laengen: dict[int, int]) -> np.ndarray:
    """Zeitachse in ms aus den Chunk-Startzeiten, gleichmaessig INNERHALB jedes Chunks.

    Genau das Verfahren, das `timebase.py` fuer den Accel benutzt (`exact_chunks`): die Dauer
    eines Chunks ergibt sich aus dem Abstand zum naechsten Start, nicht aus einer angesagten
    Rate. Fuer den LETZTEN Chunk gibt es keinen Nachfolger — dort wird die Rate des vorletzten
    fortgeschrieben.
    """
    idx = sorted(set(t0_ms) & set(laengen))
    if not idx:
        return np.empty(0)
    stuecke = []
    letzte_dt = None
    for k, i in enumerate(idx):
        n = laengen[i]
        if n <= 0:
            continue
        if k + 1 < len(idx):
            dauer = t0_ms[idx[k + 1]] - t0_ms[i]
            if dauer > 0:
                letzte_dt = dauer / n
        dt = letzte_dt if letzte_dt else 20.0     # 50 Hz als letzter Rueckfall
        stuecke.append(t0_ms[i] + np.arange(n) * dt)
    return np.concatenate(stuecke) if stuecke else np.empty(0)


def _wickel(grad: np.ndarray | float):
    """Winkel auf (-180, 180] bringen.

    NOETIG, weil der Komplementaerfilter sonst ueber den Sprung hinauslaeuft: `arctan2` liefert
    Roll in (-180, 180], die integrierte Drehrate kennt diese Grenze nicht. Ohne das Wickeln kam
    in einer echten Aufnahme (#9423, Handy in der Tasche) ein Roll von 257° heraus — der Filter
    hat am Sprung in die falsche Richtung zurueckgezogen, statt den kuerzeren Weg zu nehmen.
    """
    return (np.asarray(grad) + 180.0) % 360.0 - 180.0


def _tiefpass(werte: np.ndarray, t_s: np.ndarray, tau: float) -> np.ndarray:
    """Exponentielle Glaettung auf einer UNGLEICHMAESSIGEN Zeitachse (Spalten einzeln)."""
    aus = np.empty_like(werte)
    aus[0] = werte[0]
    dt = np.diff(t_s, prepend=t_s[0])
    for i in range(1, len(werte)):
        a = 1.0 - np.exp(-max(dt[i], 1e-6) / tau)
        aus[i] = aus[i - 1] + a * (werte[i] - aus[i - 1])
    return aus


def ruhe_maske(acc_g: np.ndarray, gyr: np.ndarray) -> np.ndarray:
    """Wo liegt das Geraet praktisch still? Grundlage fuer Bias-Abzug und Nullpunkt."""
    betrag = np.linalg.norm(acc_g, axis=1)
    return (np.abs(betrag - 1.0) < RUHE_ACCEL_G) & (np.linalg.norm(gyr, axis=1) < RUHE_GYRO_RADS)


def lage_berechnen(acc_raw: np.ndarray, t_acc_ms: np.ndarray,
                   gyr_raw: np.ndarray, t_gyr_ms: np.ndarray,
                   *, ziel_hz: float = 20.0, yaw_fenster_s: float = 1.0,
                   t_von_ms: float | None = None, t_bis_ms: float | None = None) -> dict:
    """Pitch/Roll (absolut, in Grad) und Gierwinkel-Aenderung je Fenster (Grad).

    `acc_raw`/`gyr_raw` sind die int16-Rohwerte, `t_*_ms` die zugehoerigen Zeitachsen. Das
    Ergebnis liegt auf einem gemeinsamen Raster von `ziel_hz`.
    """
    if len(acc_raw) < 4 or len(t_acc_ms) != len(acc_raw):
        return {"ok": False, "grund": "keine Beschleunigungsdaten"}
    hat_gyro = len(gyr_raw) >= 4 and len(t_gyr_ms) == len(gyr_raw)

    von = max(t_acc_ms[0], t_gyr_ms[0]) if hat_gyro else t_acc_ms[0]
    bis = min(t_acc_ms[-1], t_gyr_ms[-1]) if hat_gyro else t_acc_ms[-1]
    if t_von_ms is not None:
        von = max(von, t_von_ms)
    if t_bis_ms is not None:
        bis = min(bis, t_bis_ms)
    if bis - von < 1000:
        return {"ok": False, "grund": "Zeitfenster zu kurz"}

    # Gemeinsames Raster. Gerechnet wird auf der NATIVEN Rate des schnelleren Kanals, nicht auf
    # der Anzeige-Aufloesung: der Pixel 7a liefert 120,5 Hz Accel und 60,3 Hz Gyro, und wer die
    # Drehrate auf 50 Hz herunterrechnet, bevor er sie integriert, verliert genau die schnellen
    # Drehungen, um die es geht. Nach oben gedeckelt, damit ein exotisches Geraet die Rechnung
    # nicht sprengt; nach unten, damit eine langsame Quelle trotzdem glatt bleibt.
    def _quellrate(t_ms: np.ndarray) -> float:
        if len(t_ms) < 2 or t_ms[-1] <= t_ms[0]:
            return 0.0
        return (len(t_ms) - 1) * 1000.0 / (t_ms[-1] - t_ms[0])
    quell_hz = max(_quellrate(t_acc_ms), _quellrate(t_gyr_ms) if hat_gyro else 0.0)
    rechen_hz = float(min(200.0, max(ziel_hz, 50.0, quell_hz)))
    t = np.arange(von, bis, 1000.0 / rechen_hz)
    if len(t) < 4:
        return {"ok": False, "grund": "Zeitfenster zu kurz"}

    acc = np.column_stack([np.interp(t, t_acc_ms, acc_raw[:, j] / ACCEL_SCALE) for j in range(3)])
    if hat_gyro:
        gyr = np.column_stack([np.interp(t, t_gyr_ms, gyr_raw[:, j] / GYRO_SCALE) for j in range(3)])
    else:
        gyr = np.zeros_like(acc)

    t_s = t / 1000.0
    still = ruhe_maske(acc, gyr)
    # Bias aus den Ruhephasen. Ohne ihn laeuft die Gier-Integration mit rund 1°/s weg.
    bias = gyr[still].mean(axis=0) if still.sum() > RUHE_MIN_S * rechen_hz else np.zeros(3)
    gyr = gyr - bias

    # Schwerkraftrichtung fuer die GIER-PROJEKTION: dort wird eine ruhige Achse gebraucht,
    # also geglaettet.
    g_vec = _tiefpass(acc, t_s, TAU_S)
    g_hut = g_vec / np.clip(np.linalg.norm(g_vec, axis=1, keepdims=True), 1e-6, None)

    # Pitch/Roll dagegen aus dem ROHEN Beschleunigungsvektor. Zuerst stand hier der geglaettete —
    # das waren ZWEI hintereinandergeschaltete Traegheiten mit je TAU_S, und ein Neigungssprung
    # von 20° brauchte dadurch acht Sekunden statt drei. Das Glaetten ist Aufgabe des
    # Komplementaerfilters selbst: er nimmt je Schritt nur (1-alpha) des Messwerts, das IST der
    # Tiefpass. Nachgerechnet an einem Sprungsignal: vorher 15,0° nach 4 s, jetzt 18,9°.
    a_norm = acc / np.clip(np.linalg.norm(acc, axis=1, keepdims=True), 1e-6, None)
    pitch_a = np.degrees(np.arctan2(-a_norm[:, 0], np.hypot(a_norm[:, 1], a_norm[:, 2])))
    roll_a = np.degrees(np.arctan2(a_norm[:, 1], a_norm[:, 2]))

    # Komplementaerfilter: Kreisel treibt, Schwerkraft zieht zurueck.
    dt = np.diff(t_s, prepend=t_s[0])
    alpha = np.exp(-dt / TAU_S)
    pitch = np.empty(len(t)); roll = np.empty(len(t))
    pitch[0], roll[0] = pitch_a[0], roll_a[0]
    p_rate = np.degrees(gyr[:, 1])
    r_rate = np.degrees(gyr[:, 0])
    for i in range(1, len(t)):
        # Ueber die DIFFERENZ mischen, nicht ueber die Absolutwerte: nur so nimmt der Filter am
        # ±180°-Sprung den kurzen Weg (s. `_wickel`).
        p_vor = pitch[i - 1] + p_rate[i] * dt[i]
        r_vor = roll[i - 1] + r_rate[i] * dt[i]
        pitch[i] = _wickel(p_vor + (1 - alpha[i]) * _wickel(pitch_a[i] - p_vor))
        roll[i] = _wickel(r_vor + (1 - alpha[i]) * _wickel(roll_a[i] - r_vor))

    # Gierrate = Drehratenvektor auf die Schwerkraft projiziert (s. Kopfkommentar).
    gier_rate = np.degrees(np.einsum("ij,ij->i", gyr, g_hut))
    # Aenderung ueber das gleitende Fenster: Integral, dann Differenz zweier Stuetzstellen.
    integral = np.concatenate([[0.0], np.cumsum(gier_rate[1:] * dt[1:])])
    schritte = max(1, int(round(yaw_fenster_s * rechen_hz)))
    gier_delta = np.zeros(len(t))
    gier_delta[schritte:] = integral[schritte:] - integral[:-schritte]

    # Nullpunkt: eine Ruhephase ist genauer, der Mittelwert immer verfuegbar.
    def _mittel_winkel(w: np.ndarray) -> float:
        """Mittelwert von WINKELN — ueber den Einheitskreis, nicht arithmetisch. Sonst liegt der
        Nullpunkt von Werten um ±180° herum bei 0 statt bei 180."""
        return float(np.degrees(np.arctan2(np.sin(np.radians(w)).mean(),
                                           np.cos(np.radians(w)).mean())))
    if still.sum() > RUHE_MIN_S * rechen_hz:
        null_p, null_r, null_quelle = _mittel_winkel(pitch[still]), _mittel_winkel(roll[still]), "ruhe"
    else:
        null_p, null_r, null_quelle = _mittel_winkel(pitch), _mittel_winkel(roll), "mittelwert"
    pitch = _wickel(pitch - null_p)
    roll = _wickel(roll - null_r)

    schritt = max(1, int(round(rechen_hz / ziel_hz)))
    aus = slice(None, None, schritt)

    def hauptfrequenz(sig: np.ndarray) -> float | None:
        s0 = sig - sig.mean()
        if len(s0) < 32:
            return None
        f = np.fft.rfftfreq(len(s0), 1.0 / rechen_hz)
        A = np.abs(np.fft.rfft(s0))
        m = (f > 0.3) & (f < 4.0)
        return round(float(f[m][np.argmax(A[m])]), 2) if m.any() else None

    return {
        "ok": True,
        "hz": round(rechen_hz / schritt, 2),
        "rechen_hz": round(rechen_hz, 1),
        # float() ausdruecklich: numpy-Typen serialisiert FastAPI nicht.
        "quelle_hz": {"accel": round(float(_quellrate(t_acc_ms)), 1),
                      "gyro": round(float(_quellrate(t_gyr_ms)), 1) if hat_gyro else None},
        "yaw_fenster_s": yaw_fenster_s,
        "nullpunkt": null_quelle,
        "hat_gyro": bool(hat_gyro),
        "t_ms": [round(float(x)) for x in t[aus]],
        "pitch_deg": [round(float(x), 2) for x in pitch[aus]],
        "roll_deg": [round(float(x), 2) for x in roll[aus]],
        "gier_delta_deg": [round(float(x), 2) for x in gier_delta[aus]],
        "kennzahlen": {
            "pitch_amplitude_deg": round(float(np.percentile(np.abs(pitch), 95)), 1),
            "roll_amplitude_deg": round(float(np.percentile(np.abs(roll), 95)), 1),
            "gier_rms_deg_s": round(float(np.sqrt(np.mean(gier_rate ** 2))), 1),
            "pitch_hz": hauptfrequenz(pitch),
            "ruhe_anteil": round(float(still.mean()), 3),
            "bias_abgezogen": bool(still.sum() > RUHE_MIN_S * rechen_hz),
        },
    }
