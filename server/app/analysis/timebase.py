"""Erkennung v2 — Schritt 1: EINE gemessene Zeitachse (docs/detector-v2.md, Abschnitt 1).

Nullpunkt ist der Session-Start; alles hier spricht **Millisekunden seit Session-Start**.
Indizes existieren nur innerhalb dieses Moduls, sie werden nie nach außen als Anker gereicht.

Warum das ein eigenes Modul ist: in v1 wird die Accel-Zeitachse aus einer Rate GESCHÄTZT und
der Zuschnitt an einer anderen Stelle angewandt als der Ausschluss — Segmente tragen dann auf
den Trim re-basierte Zeiten, `excluded_ranges` dagegen Session-Zeiten. Dieselbe Falle hat
zweimal zugeschlagen (Aussortieren in #1232, Accel-Fenster in #1328). Hier gibt es genau eine
Achse, genau eine Stelle für Trim/Ausschluss und Session-Koordinaten bis zum Schluss.

Rangfolge für die Accel-Achse (Entwurf, Abschnitt 1):
  1. `t0_ms` je Chunk (`storage.load_accel_t0`) — die Uhr weiß, wann der Chunk begann.
  2. sonst die aus den Daten GEMESSENE Rate (samples / GPS-Dauer).
  3. Die getaggte Rate (`session.accel_hz`) ist NIE Wahrheit, nur Plausibilitätsschranke.
Die Herkunft wird mitgeschrieben (`source`), damit Zahlen von einer unsicheren Achse
gekennzeichnet statt als exakt ausgegeben werden.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

# --- Plausibilitätsschranken für die Chunk-Startzeiten ---------------------------------
# Der Ingest-Vertrag hat `t0_ms` als int mit Default 0 (schemas.py) und der Speicher legt die
# Sidecar-Datei an, sobald der Wert nicht None ist (storage.py). Ein Client, der t0_ms gar nicht
# schickt (Garmin), erzeugt damit für JEDEN Chunk eine "0" — nachgeprüft an der einzigen Session
# im Bestand, die überhaupt .t0-Dateien hat: 29 Chunks, alle 0. Die Sidecars sind also NICHT
# blind belastbar. Deshalb hier drei Prüfungen, bevor die Achse als exakt gilt:
#   (a) jeder Accel-Chunk hat eine Startzeit,
#   (b) die Startzeiten wachsen streng (lauter Nullen fällt damit raus),
#   (c) die daraus folgende Rate liegt im Plausibilitätsband um die getaggte Rate.
T0_RATE_BAND = (0.5, 2.0)      # gemessene Chunk-Rate / getaggte Rate muss hier hineinfallen
# Die Chunk-Kette darf das GPS-Ende nicht deutlich überragen — sonst zeigen die Startzeiten auf
# eine andere Zeitbasis (z. B. Uhrzeit statt Laufzeit) und sind als Session-Offset unbrauchbar.
T0_OVERRUN_TOLERANCE_MS = 60_000


@dataclass
class TimeBase:
    """Eine Session auf EINER Zeitachse. Alle *_ms sind Session-Millisekunden."""

    gps: list                       # [[t_ms, lat, lon, v_mps, hr, hacc], …] im Auswertefenster
    t_gps_ms: np.ndarray            # (Ng,) Session-ms je GPS-Sample
    accel: np.ndarray               # (Na, 3) int16 roh, im Auswertefenster
    t_accel_ms: np.ndarray          # (Na,) Session-ms je Accel-Sample
    accel_scale: int
    source: str                     # exact_chunks | measured_rate | uncertain | none
    accel_hz: float | None          # effektive Rate der Achse (None ohne Accel)
    accel_hz_tagged: float | None
    accel_hz_measured: float | None
    accel_hz_deviation: float | None  # (gemessen − getaggt) / getaggt, relativ
    window_start_ms: int            # Beginn des Auswertefensters (Trim)
    window_end_ms: int              # Ende des Auswertefensters (Trim)
    excluded_ranges: list = field(default_factory=list)   # [(a_ms, b_ms), …], Session-Koordinaten
    notes: list = field(default_factory=list)             # warum die Herkunft so ausfiel

    @property
    def has_accel(self) -> bool:
        return self.accel.shape[0] > 0

    @property
    def duration_ms(self) -> int:
        return max(int(self.window_end_ms - self.window_start_ms), 0)

    def provenance(self) -> dict:
        """Herkunfts-Block für metrics — gehört an jede Zahl, die von der Accel-Achse abhängt."""
        return {
            "time_base": self.source,
            "accel_hz": round(self.accel_hz, 3) if self.accel_hz else None,
            "accel_hz_tagged": self.accel_hz_tagged,
            "accel_hz_measured": round(self.accel_hz_measured, 3) if self.accel_hz_measured else None,
            "accel_hz_deviation": round(self.accel_hz_deviation, 4) if self.accel_hz_deviation is not None else None,
            "time_base_notes": list(self.notes),
        }


def _accel_chunk_axis(
    chunk_counts: dict[int, int], t0_by_index: dict[int, int],
    tagged_hz: float | None, gps_end_ms: float,
) -> tuple[np.ndarray | None, float | None, str]:
    """Accel-Zeitachse aus den Chunk-Startzeiten. Gibt (t_ms je Sample, mittlere Rate, Grund)
    zurück; t_ms=None heißt: die Sidecars sind nicht belastbar (Grund erklärt warum)."""
    idx = sorted(chunk_counts)
    if not idx:
        return None, None, "keine Accel-Chunks"
    fehlend = [i for i in idx if i not in t0_by_index]
    if fehlend:
        return None, None, f"{len(fehlend)} von {len(idx)} Chunks ohne t0_ms"
    t0 = np.array([float(t0_by_index[i]) for i in idx])
    if len(idx) >= 2 and not np.all(np.diff(t0) > 0):
        # Lauter Nullen (Client sendet t0_ms nicht) oder eine kaputte Reihenfolge.
        return None, None, "t0_ms nicht streng wachsend (Default-Nullen?)"
    counts = np.array([chunk_counts[i] for i in idx], dtype=float)
    # Rate je Chunk aus dem Abstand zum NÄCHSTEN Chunk; der letzte erbt die Rate des vorletzten
    # (er hat keinen Nachfolger, aus dem sich seine Dauer ergäbe).
    raten = np.empty(len(idx))
    for k in range(len(idx) - 1):
        span_s = (t0[k + 1] - t0[k]) / 1000.0
        raten[k] = counts[k] / span_s if span_s > 0 else np.nan
    raten[-1] = raten[-2] if len(idx) >= 2 else (tagged_hz or np.nan)
    if not np.isfinite(raten).all():
        return None, None, "Chunk-Raten nicht berechenbar"
    mittel = float(np.nanmedian(raten))
    if tagged_hz:
        q = mittel / tagged_hz
        if not (T0_RATE_BAND[0] <= q <= T0_RATE_BAND[1]):
            return None, None, f"Chunk-Rate {mittel:.2f} Hz außerhalb des Bandes um {tagged_hz} Hz"
    ende = t0[-1] + counts[-1] / max(raten[-1], 1e-6) * 1000.0
    if gps_end_ms > 0 and ende > gps_end_ms + T0_OVERRUN_TOLERANCE_MS:
        return None, None, "Chunk-Kette reicht über das GPS-Ende hinaus (fremde Zeitbasis?)"
    teile = [t0[k] + np.arange(int(counts[k])) / raten[k] * 1000.0 for k in range(len(idx))]
    return np.concatenate(teile) if teile else np.empty(0), mittel, "t0_ms je Chunk"


def build_timebase(
    gps: list,
    accel: np.ndarray,
    accel_scale: int,
    tagged_accel_hz: float | None,
    *,
    chunk_counts: dict[int, int] | None = None,
    t0_by_index: dict[int, int] | None = None,
    trim_start_ms: int | None = None,
    trim_end_ms: int | None = None,
    excluded_ranges: list | None = None,
) -> TimeBase:
    """Baut die Session-Zeitachse. `gps` sind die ROHEN Samples (Session-ms, ungetrimmt),
    `accel` das rohe (N,3)-int16-Array. Trim und Ausschluss wirken NUR hier."""
    gps = list(gps or [])
    accel = accel if accel is not None else np.empty((0, 3), dtype=np.int16)
    gps_end_ms = float(gps[-1][0]) if gps else 0.0
    notes: list[str] = []

    # --- Accel-Achse bestimmen (Rangfolge aus dem Entwurf) ---
    t_accel = np.empty(0)
    source = "none"
    hz_eff: float | None = None
    hz_measured: float | None = None
    if accel.shape[0] > 0:
        n = int(accel.shape[0])
        if gps_end_ms > 0:
            hz_measured = n / (gps_end_ms / 1000.0)
        t_exact, hz_chunks, grund = _accel_chunk_axis(
            chunk_counts or {}, t0_by_index or {}, tagged_accel_hz, gps_end_ms
        )
        if t_exact is not None and t_exact.size == n:
            t_accel, source, hz_eff = t_exact, "exact_chunks", hz_chunks
            notes.append(grund)
        else:
            if t_exact is not None:
                grund = f"Chunk-Achse deckt {t_exact.size} von {n} Samples ab"
            notes.append(grund)
            # Gemessene Rate NUR, wenn die Spur die Session wirklich abdeckt. Gleiche Prüfung
            # wie v1 (analysis._accel_spans_session) — bewusst kein zweiter Wahrheitsbegriff
            # neben v1, sonst ist der Vergleich der beiden Detektoren nicht mehr sauber.
            from . import _accel_spans_session   # lokal: __init__ importiert dieses Modul mit

            spans = _accel_spans_session(accel, accel_scale) if accel_scale else True
            if hz_measured and spans:
                source, hz_eff = "measured_rate", hz_measured
                notes.append(f"Rate aus den Daten gemessen ({hz_measured:.3f} Hz)")
            else:
                source = "uncertain"
                hz_eff = float(tagged_accel_hz) if tagged_accel_hz else hz_measured
                notes.append(
                    "Accel-Spur deckt die Session nicht ab -> getaggte Rate als Notbehelf"
                    if not spans else "keine belastbare Rate"
                )
            if hz_eff:
                t_accel = np.arange(n) / float(hz_eff) * 1000.0

    hz_dev = None
    if hz_measured and tagged_accel_hz:
        hz_dev = (hz_measured - float(tagged_accel_hz)) / float(tagged_accel_hz)

    # --- Trim + Ausschluss: an GENAU dieser Stelle, auf die Achse, in Session-Koordinaten ---
    lo = int(trim_start_ms) if trim_start_ms is not None else 0
    hi = int(trim_end_ms) if trim_end_ms is not None else int(gps_end_ms)
    wins = _normalize_ranges(excluded_ranges)

    def _keep(t: np.ndarray) -> np.ndarray:
        k = (t >= lo) & (t <= hi)
        for a, b in wins:
            k &= ~((t >= a) & (t <= b))
        return k

    t_gps = np.array([float(s[0]) for s in gps]) if gps else np.empty(0)
    keep_gps = _keep(t_gps) if t_gps.size else np.zeros(0, dtype=bool)
    gps_out = [gps[i] for i in np.where(keep_gps)[0]]
    t_gps_out = t_gps[keep_gps] if t_gps.size else t_gps

    if t_accel.size:
        keep_a = _keep(t_accel)
        accel_out = accel[keep_a]
        t_accel_out = t_accel[keep_a]
    else:
        accel_out = accel[0:0] if accel.shape[0] else accel
        t_accel_out = np.empty(0)

    return TimeBase(
        gps=gps_out, t_gps_ms=t_gps_out, accel=accel_out, t_accel_ms=t_accel_out,
        accel_scale=int(accel_scale or 1), source=source, accel_hz=hz_eff,
        accel_hz_tagged=float(tagged_accel_hz) if tagged_accel_hz else None,
        accel_hz_measured=hz_measured, accel_hz_deviation=hz_dev,
        window_start_ms=lo, window_end_ms=hi, excluded_ranges=wins, notes=notes,
    )


def build_timebase_for_session(session, *, gps=None, accel=None) -> TimeBase:
    """Bequemer Weg von einer DB-Session zur Achse: lädt Rohdaten + Chunk-Startzeiten und
    nimmt Trim/Ausschluss aus der Session. Liest nur, schreibt nie."""
    from .. import storage
    from . import excluded_windows

    uuid = session.session_uuid
    gps = storage.load_gps(uuid) if gps is None else gps
    accel = storage.load_accel(uuid) if accel is None else accel
    return build_timebase(
        gps, accel, session.accel_scale, session.accel_hz,
        chunk_counts=_accel_chunk_counts(uuid),
        t0_by_index=storage.load_accel_t0(uuid),
        trim_start_ms=session.trim_start_ms, trim_end_ms=session.trim_end_ms,
        excluded_ranges=excluded_windows(session),
    )


def _accel_chunk_counts(session_uuid: str) -> dict[int, int]:
    """Sample-Anzahl je Accel-Chunk aus der Dateigröße (int16 × 3 Achsen). Ohne die Größen
    lassen sich die Chunk-Startzeiten nicht auf Samples abbilden."""
    from .. import storage

    d = storage.session_dir(session_uuid) / "accel"
    if not d.exists():
        return {}
    out: dict[int, int] = {}
    for f in d.glob("*.bin"):
        try:
            out[int(f.stem)] = f.stat().st_size // 2 // 3
        except (ValueError, OSError):
            continue
    return out


def _normalize_ranges(ranges) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    for item in ranges or []:
        try:
            a, b = int(item[0]), int(item[1])
        except (TypeError, ValueError, IndexError):
            continue
        if b > a:
            out.append((max(a, 0), b))
    return sorted(out)
