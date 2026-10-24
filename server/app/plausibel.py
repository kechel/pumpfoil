"""Plausibilitaets-Regeln fuer ausgelieferte Session-Zahlen (24.10.2026, Jan nach #18978: „mach doch mal ein paar
plausibilitaets-tests fuer solche werte").

Anlass: „Ø Tempo Fahrt" 43,6 km/h bei 24,3 km/h Hoechsttempo — jede Zahl fuer sich sah harmlos aus, erst der
Vergleich zweier Zahlen zeigte den Fehler. Darum hier Regeln ZWISCHEN Zahlen derselben Antwort. Nur lesend, keine
Abhaengigkeit von der DB: `pruefen(analysis)` nimmt das `analysis`-Objekt von GET /api/sessions/{id} (als dict) und
gibt die verletzten Regeln als Text zurueck (leer = plausibel).

Benutzt von tests/test_plausibel.py (synthetische Sessions ueber die echte API) und scripts/plausibel-bestand.py
(Stichprobe aus der echten DB).
"""
from __future__ import annotations

TOL_MPS = 0.15          # Rundung der gespeicherten Tempi (2 Nachkommastellen) + Glaettung
# Strecke kommt aus den GPS-Positionen, Tempo aus dem Doppler: an beiden Enden eines Laufs liegen ein paar Meter
# Positions-Rauschen (Bestand 24.10.: 4-s-Lauf #18965 mit 24 m bei 3,44 m/s Hoechsttempo). Je Lauf diese Meter frei.
RAND_M = 15.0
MAX_KADENZ_HZ = 4.0     # schneller pumpt niemand; darueber zaehlt etwas doppelt


def _zahl(x):
    return float(x) if isinstance(x, (int, float)) else None


def pruefen(a: dict | None, dauer_ms: float | None = None) -> list[str]:
    if not a:
        return []
    f: list[str] = []
    gesamt_m, foil_m = _zahl(a.get("total_distance_m")), _zahl(a.get("foiling_distance_m"))
    foil_s, vmax = _zahl(a.get("foiling_time_s")), _zahl(a.get("max_speed_mps"))
    if gesamt_m is not None and foil_m is not None and foil_m > gesamt_m * 1.01 + 5:
        f.append(f"Foil-Strecke {foil_m:.0f} m > Gesamtstrecke {gesamt_m:.0f} m")
    if foil_s is not None and foil_s < 0:
        f.append(f"Foil-Zeit negativ ({foil_s})")
    if foil_s is not None and dauer_ms and foil_s > dauer_ms / 1000.0 + 1:
        f.append(f"Foil-Zeit {foil_s:.0f} s > Aufnahmedauer {dauer_ms / 1000:.0f} s")
    n_laeufe = max(len(a.get("segments") or []), 1)
    if foil_s and foil_m is not None and vmax is not None and foil_m > (vmax + TOL_MPS) * foil_s * 1.15 + RAND_M * n_laeufe:
        f.append(f"Foil-Schnitt {foil_m / foil_s * 3.6:.1f} km/h > Hoechsttempo {vmax * 3.6:.1f} km/h")
    pc, kad = a.get("pump_count"), _zahl(a.get("avg_cadence_hz"))
    if isinstance(pc, int) and pc < 0:
        f.append(f"Pumpzahl negativ ({pc})")
    if kad is not None and not 0 <= kad <= MAX_KADENZ_HZ:
        f.append(f"Kadenz {kad} Hz unplausibel")

    m = a.get("metrics") or {}
    avg5, max5 = _zahl(m.get("avg_speed_mps")), _zahl(m.get("max_speed_5s_mps"))
    if avg5 is not None and max5 is not None and avg5 > max5 + TOL_MPS:
        f.append(f"Schnitt {avg5 * 3.6:.1f} km/h > 5-s-Hoechsttempo {max5 * 3.6:.1f} km/h")

    # je Lauf
    for i, g in enumerate(a.get("segments") or []):
        d, s = _zahl(g.get("duration_s")), _zahl(g.get("distance_m"))
        av, mx = _zahl(g.get("avg_speed_mps")), _zahl(g.get("max_speed_mps"))
        if d is not None and d <= 0:
            f.append(f"Lauf {i}: Dauer {d} s")
        if av is not None and mx is not None and av > mx + TOL_MPS:
            f.append(f"Lauf {i}: Schnitt {av * 3.6:.1f} > Hoechst {mx * 3.6:.1f} km/h")
        if d and s is not None and mx is not None and s > (mx + TOL_MPS) * d * 1.15 + RAND_M:
            f.append(f"Lauf {i}: Strecke/Dauer {s / d * 3.6:.1f} km/h > Hoechst {mx * 3.6:.1f} km/h")
        p, hz = g.get("pumps"), _zahl(g.get("avg_pump_hz"))
        if isinstance(p, int) and p < 0:
            f.append(f"Lauf {i}: Pumps negativ")
        if hz is not None and not 0 <= hz <= MAX_KADENZ_HZ:
            f.append(f"Lauf {i}: Kadenz {hz} Hz")
        lg = _zahl(g.get("longest_glide_s"))
        if d and lg is not None and lg > d + 15.5:     # Gleiten darf bis 5 s in den Puffer, Obergrenze 15 s
            f.append(f"Lauf {i}: laengste Gleitphase {lg} s > Laufdauer {d} s")

    # ganze Fahrt (Wind/Motor/Welle)
    sz = a.get("sport_zahlen") or {}
    track = a.get("track_geojson") or {}
    sp = [v for v in ((track.get("properties") or {}).get("speeds_mps") or []) if isinstance(v, (int, float))]
    vspur = max(sp) if sp else None
    obergrenze = max(x for x in (vspur, vmax, max5) if x is not None) if any(
        x is not None for x in (vspur, vmax, max5)) else None
    t = _zahl(sz.get("tempo_kmh"))
    if t is not None and obergrenze is not None and t > obergrenze * 3.6 + 0.5:
        f.append(f"Ø Tempo Fahrt {t:.1f} km/h > Hoechsttempo der Spur {obergrenze * 3.6:.1f} km/h")
    fa = _zahl(sz.get("foil_anteil"))
    if fa is not None and not 0 <= fa <= 1:
        f.append(f"On-Foil-Anteil {fa}")
    fz = _zahl(sz.get("fahrzeit_s"))
    if fz is not None and dauer_ms and fz > dauer_ms / 1000.0 * 1.05 + 60:
        f.append(f"Fahrzeit {fz:.0f} s > Aufnahmedauer {dauer_ms / 1000:.0f} s")
    for k, fa_ in enumerate(sz.get("fahrten") or []):
        dauer, strecke = _zahl(fa_.get("dauer_s")), _zahl(fa_.get("strecke_m"))
        if dauer and strecke is not None and obergrenze is not None and strecke / dauer > obergrenze + TOL_MPS:
            f.append(f"Fahrt {k}: {strecke / dauer * 3.6:.1f} km/h > Hoechsttempo {obergrenze * 3.6:.1f} km/h")
    return f
