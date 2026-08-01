"""Automatische Sportart-Einordnung: „ist das überhaupt Pumpfoil?"

Zweck (Jan, 2026-08-01): beim Import erkennen, wenn eine Session offensichtlich KEIN Pumpfoiling
ist, den Besitzer freundlich um die richtige Zuordnung bitten und sie solange aus allen
Auswertungen heraushalten. Bei Unsicherheit wird KEINE Sportart behauptet — dann heißt es nur
„nicht Pumpfoil, bitte selbst zuordnen".

Das Urteil der Maschine ist die vierte Quelle neben `default | owner | admin` (`sport_source`),
und die schwächste: es greift NUR, solange kein Mensch geurteilt hat, und jeder Mensch überstimmt
es jederzeit. Siehe docs/sport-classification.md.

## Woher die Grenzwerte kommen (gemessen 2026-08-01, read-only über den ganzen Bestand)

Grundlage sind die **32 menschlich beurteilten Sessions** (`sport_source in (owner, admin)`) gegen
eine Kontrollgruppe unbeurteilter Sessions **derselben Nutzer** — also Leute, die die Funktion
kennen und ihre Wing-/Efoil-Sessions bereits markiert haben; was sie NICHT markiert haben, ist
glaubwürdig Pumpfoil.

| belegt (n) | längster Lauf | Ø-Tempo der Läufe | Puls-Antwort |
|---|---|---|---|
| efoil (10) | 305–599 s | 15,3–17,8 km/h | −26 … −3, nie positiv |
| wingfoil (12) | 135–1177 s | Median 20,3 km/h | −14 … +22 |
| wake (4) | 357–1630 s | Median 13,0 km/h | −3 … +39 |
| surf_downwind (2) | 351–721 s | Median 20,7 km/h | +10 … +17 |
| **Pumpfoil** (4 bestätigt + 469 Kontrolle) | **Median 46 s** | Median 14,4 km/h | +17 |

Über 5658 gespeicherte Pumpfoil-Läufe: Median-Laufdauer **27 s**, p90 74 s, p99 220 s. Läufe über
10 min gibt es 10 (0,18 %), Läufe ab 20 km/h 24 (0,42 %), beides zugleich **einen einzigen**.

Zwei Gruppen mussten aus der Kontrolle heraus, beide sind eigene Befunde: **user 135** (172 von 186
Sessions stehen auf Pumpfoil, Profil sagt Wingfoil — die Kontrollgruppe war mit genau dem verseucht,
wonach gesucht wird) und **41 iOS-Simulator-Sessions** im Raum Cupertino (synthetische Spur,
konstant 12,8 km/h).

Trefferquote der Regel unten auf dieser Grundlage: **17 von 28** belegten Nicht-Pumpfoil-Sessions
erkannt (61 %) bei **1 Fehlalarm unter 301** Kontroll-Sessions (0,33 %) — und dieser eine Treffer
(#251: Ø 18,5 km/h, max 36,5, Puls −4) sieht selbst nicht nach Pumpfoil aus. Die bewusst gewählte
vorsichtige Variante: eine falsch markierte echte Rekordfahrt ärgert mehr, als eine übersehene
Wing-Session schadet. Die schärfere Schwelle (Dauer allein ab 300 s) hätte 93 % erkannt, aber
2,1 % Fehlalarm.

Nicht erkannt werden dadurch vor allem Sessions **ohne Puls** (fünf der zehn efoil-Fälle) und
solche mit echtem Pulsanstieg (Wake mit +39). Das ist gewollt: lieber übersehen als falsch
beschuldigen.
"""
from __future__ import annotations

import numpy as np

# --- Grenzwerte, jeder mit Messung (s. Kopf) ----------------------------------------------------
# Ein Pumpfoil-Lauf dauert im Median 27 s, p99 = 220 s. 240 s liegt darüber und unter dem kürzesten
# belegten Nicht-Pumpfoil-Lauf, der mit Puls einhergeht.
MIN_LANGER_LAUF_S = 240.0
# Puls-Antwort: bestätigte Autofahrten lagen bei −1 … +13 bpm, echte Pumpfoil-Läufe bei +26 … +70.
# +15 trennt beide Wolken; darüber glauben wir dem Nutzer die Anstrengung.
MAX_PULS_ANTWORT = 15.0
# Ohne Puls entscheidet nur das Tempo: Pumpfoil-Läufe liegen im Median bei 13,4 km/h (p99 18,6),
# Wing/Downwind bei 20+. 19,0 liegt in der Lücke.
MIN_TEMPO_OHNE_PULS_KMH = 19.0
# Motorisiert: konstant mittleres Tempo bei fallendem Puls. Alle 10 belegten efoil-Sessions liegen
# in 15,3–17,8 km/h; kein einziger Wing-Fall mit fallendem Puls liegt unter 19,4 km/h.
MOTOR_TEMPO_KMH = (14.0, 19.0)
MOTOR_MAX_PULS = 0.0
# Zusätzliche Schranke fürs Motor-Urteil: die 10 belegten efoil-Sessions erreichen in der Spitze
# 20,0–26,2 km/h. Alles deutlich darüber ist kein E-Foil, auch wenn Mitteltempo und Puls passen —
# ohne diese Schranke bekäme der einzige gemessene Fehlalarm (#251, Spitze 36,5) sogar eine Klasse
# angehängt statt nur ein Fragezeichen.
MOTOR_MAX_SPITZE_KMH = 30.0

# Puls-Antwort = Median(2. Laufhälfte bis Ende+30 s) − Median(90 s davor). Der Nachlauf ist nötig,
# weil der Puls dem Aufwand hinterherhinkt — ohne ihn misst man den Anstieg systematisch zu klein
# (dieser Fehler hat mich am 01.08. schon einmal zu einer falschen Aussage verleitet).
NACHLAUF_MS = 30_000
VORLAUF_MS = 90_000
MIN_PULS_WERTE = 5


def puls_antwort(gps_samples: list, t_start_ms: float, t_end_ms: float) -> float | None:
    """Wie stark der Puls auf diesen Lauf geantwortet hat, in bpm. None ohne brauchbaren Puls.

    `gps_samples` und die Zeiten müssen auf derselben Achse liegen (in `run_analysis` ist das die
    auf den Trim-Beginn re-basierte Session-Zeit — dieselbe Basis wie `segment['t_start_ms']`).
    """
    if not gps_samples:
        return None
    t = np.array([float(s[0]) for s in gps_samples])
    hr = np.array([float(s[4]) if len(s) > 4 and s[4] else np.nan for s in gps_samples])
    if np.isnan(hr).all():
        return None
    mitte = t_start_ms + (t_end_ms - t_start_ms) / 2.0
    nach = hr[(t >= mitte) & (t <= t_end_ms + NACHLAUF_MS)]
    vor = hr[(t >= t_start_ms - VORLAUF_MS) & (t < t_start_ms)]
    nach = nach[~np.isnan(nach)]
    vor = vor[~np.isnan(vor)]
    if nach.size < MIN_PULS_WERTE or vor.size < MIN_PULS_WERTE:
        return None
    return float(np.median(nach) - np.median(vor))


def einordnen(segments: list, gps_samples: list) -> dict | None:
    """Urteil der Maschine über eine fertig analysierte Session.

    Rückgabe `None` = sieht nach Pumpfoil aus, nichts zu tun. Sonst ein Wörterbuch:
      `sport_class`  gesetzte Sportart oder None (= keine Behauptung, nur „nicht Pumpfoil")
      `hinweis`      Schlüssel für den Text an den Nutzer
      `grund`        Klartext-Begründung mit den gemessenen Werten (Admin/Doku/Support)
      `merkmale`     die Zahlen, auf denen das Urteil beruht
    """
    if not segments:
        return None
    dauern = np.array([float(q.get("duration_s") or 0.0) for q in segments])
    tempi = np.array([float(q.get("avg_speed_mps") or 0.0) * 3.6 for q in segments])
    i = int(np.argmax(dauern))
    laengster = float(dauern[i])
    if laengster < MIN_LANGER_LAUF_S:
        return None                      # kürzer als 240 s -> unauffällig, kein Urteil

    lauf = segments[i]
    puls = puls_antwort(gps_samples, float(lauf.get("t_start_ms") or 0.0),
                        float(lauf.get("t_end_ms") or 0.0))
    tempo_med = float(np.median(tempi)) if tempi.size else 0.0
    spitze = max((float(q.get("max_speed_mps") or 0.0) * 3.6 for q in segments), default=0.0)
    merkmale = {"laengster_lauf_s": round(laengster, 1), "tempo_median_kmh": round(tempo_med, 1),
                "spitze_kmh": round(spitze, 1),
                "puls_antwort_bpm": None if puls is None else round(puls, 1),
                "laeufe": len(segments)}

    if puls is not None:
        if puls >= MAX_PULS_ANTWORT:
            # Langer Lauf, aber der Puls ist mitgegangen -> das war Arbeit. Kein Urteil.
            return None
        if (puls <= MOTOR_MAX_PULS and MOTOR_TEMPO_KMH[0] <= tempo_med < MOTOR_TEMPO_KMH[1]
                and spitze < MOTOR_MAX_SPITZE_KMH):
            return {"sport_class": "efoil", "hinweis": "auto.motor", "merkmale": merkmale,
                    "grund": (f"Längster Lauf {laengster:.0f} s bei konstant {tempo_med:.1f} km/h, "
                              f"Puls-Antwort {puls:+.0f} bpm (fällt) — Signatur eines Motors "
                              f"(alle 10 belegten efoil-Sessions liegen in 15,3–17,8 km/h mit "
                              f"fallendem Puls).")}
        return {"sport_class": None, "hinweis": "auto.unklar", "merkmale": merkmale,
                "grund": (f"Längster Lauf {laengster:.0f} s (Pumpfoil-Median 27 s, p99 220 s) bei "
                          f"{tempo_med:.1f} km/h, Puls-Antwort nur {puls:+.0f} bpm — so lange ohne "
                          f"Pulsanstieg zu gleiten passt nicht zum Pumpen.")}

    # Ohne Puls bleibt nur das Tempo, und das muss dann deutlich sein.
    if tempo_med >= MIN_TEMPO_OHNE_PULS_KMH:
        return {"sport_class": None, "hinweis": "auto.unklar", "merkmale": merkmale,
                "grund": (f"Längster Lauf {laengster:.0f} s bei {tempo_med:.1f} km/h im Mittel, "
                          f"kein Puls aufgezeichnet — über 19 km/h liegen nur 0,4 % aller "
                          f"Pumpfoil-Läufe.")}
    return None
