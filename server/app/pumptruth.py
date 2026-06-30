"""Vergleich mehrerer Tap-Durchläufe (Takes) desselben Laufs.

Beim Taggen ist der absolute Startzeitpunkt schwer exakt zu treffen (Video↔Wiedergabe-Sync),
und jeder Tastendruck hat eine Reaktions-Latenz. Mehrere Durchläufe desselben Laufs lassen sich
daher nur nach Entfernen eines KONSTANTEN Offsets je Take sinnvoll vergleichen. Dieser Offset
wird per Kreuzkorrelation der (gauß-verschmierten) Tap-Folgen gegen einen Referenz-Take bestimmt.

Ergebnis: je Take Offset + Rest-Jitter gegen die Referenz, sowie ein robuster Konsens
(Median je geclustertem Pump, der in der Mehrheit der Takes vorkommt) als Ground Truth.
"""
from __future__ import annotations

import numpy as np

BIN_MS = 50           # Auflösung der Korrelations-Folge
SMOOTH_MS = 150       # Gauß-Breite (≈ Reaktions-/Tap-Streuung)
MAX_SHIFT_MS = 4000   # max. gesuchter Offset zwischen zwei Takes
MATCH_TOL_MS = 400    # Toleranz, ab der zwei Taps als „derselbe Pump" gelten
CLUSTER_MS = 350      # Konsens-Clustering: Taps näher als das = ein Pump


def _smeared(times_ms: np.ndarray, lo: int, hi: int) -> np.ndarray:
    """Tap-Zeitpunkte -> gauß-verschmierte Folge über [lo,hi] in BIN_MS-Schritten."""
    n = max(int((hi - lo) / BIN_MS) + 1, 1)
    sig = np.zeros(n)
    for t in times_ms:
        b = int(round((t - lo) / BIN_MS))
        if 0 <= b < n:
            sig[b] += 1.0
    sd = max(SMOOTH_MS / BIN_MS, 1.0)
    k = int(round(sd * 4))
    x = np.arange(-k, k + 1)
    g = np.exp(-0.5 * (x / sd) ** 2)
    return np.convolve(sig, g / g.sum(), mode="same")


def _shift(sig: np.ndarray, k: int) -> np.ndarray:
    """sig um k Bins verschieben (k>0 = nach rechts/später), Ränder mit 0 auffüllen."""
    out = np.roll(sig, k)
    if k > 0:
        out[:k] = 0
    elif k < 0:
        out[k:] = 0
    return out


def _best_offset(ref: np.ndarray, other: np.ndarray, lo: int, hi: int) -> int:
    """Konstanter Offset (ms), um den `other` SPÄTER liegt als `ref`. (other - offset) ≈ ref.
    Per Kreuzkorrelation der verschmierten Folgen bestimmt."""
    a, b = _smeared(ref, lo, hi), _smeared(other, lo, hi)
    if a.sum() == 0 or b.sum() == 0:
        return 0
    max_shift = int(MAX_SHIFT_MS / BIN_MS)
    best, best_corr = 0, -1.0
    for sbins in range(-max_shift, max_shift + 1):
        # other um -offset verschieben (offset abziehen) und mit ref korrelieren
        c = float(np.dot(a, _shift(b, -sbins)))
        if c > best_corr:
            best_corr, best = c, sbins
    return best * BIN_MS


def _match_jitter(ref: np.ndarray, shifted: np.ndarray) -> tuple[int, float]:
    """Nach Ausrichtung: Anzahl Treffer + Rest-Jitter (Std der Treffer-Differenzen, ms)."""
    if ref.size == 0 or shifted.size == 0:
        return 0, 0.0
    diffs = []
    for t in shifted:
        j = int(np.argmin(np.abs(ref - t)))
        d = t - ref[j]
        if abs(d) <= MATCH_TOL_MS:
            diffs.append(d)
    if not diffs:
        return 0, 0.0
    return len(diffs), float(np.std(diffs))


def compare_takes(takes: list[dict]) -> dict:
    """takes: [{"take": k, "times_ms": [...]}, ...] -> Vergleichs-Report.

    Referenz = Take mit den meisten Taps. Andere Takes werden per Kreuzkorrelation darauf
    ausgerichtet; je Take Offset+Jitter+Treffer. Konsens = geclusterte, mehrheitlich
    bestätigte Pumps (auf Referenz-Zeitbasis) -> robuste Ground Truth."""
    valid = [t for t in takes if t.get("times_ms")]
    if not valid:
        return {"takes": [], "consensus_ms": [], "n_takes": 0}
    ref_take = max(valid, key=lambda t: len(t["times_ms"]))
    ref = np.sort(np.asarray(ref_take["times_ms"], dtype=float))
    all_ms = np.concatenate([np.asarray(t["times_ms"], dtype=float) for t in valid])
    lo, hi = int(all_ms.min()) - 1000, int(all_ms.max()) + 1000

    aligned_pool: list[float] = []   # alle Taps auf Referenz-Zeitbasis (für den Konsens)
    report = []
    for t in valid:
        cur = np.sort(np.asarray(t["times_ms"], dtype=float))
        is_ref = t["take"] == ref_take["take"]
        off = 0 if is_ref else _best_offset(ref, cur, lo, hi)
        shifted = cur - off
        matched, jitter = (cur.size, 0.0) if is_ref else _match_jitter(ref, shifted)
        aligned_pool.extend(shifted.tolist())
        report.append({
            "take": int(t["take"]),
            "n": int(cur.size),
            "offset_ms": int(off),
            "matched": int(matched),
            "jitter_ms": round(jitter, 1),
            "is_ref": is_ref,
        })

    # Konsens: gepoolte (ausgerichtete) Taps clustern; ein Cluster zählt, wenn er von der
    # Mehrheit der Takes bestätigt wird. Konsens-Zeit = Median des Clusters.
    pool = np.sort(np.asarray(aligned_pool, dtype=float))
    n_takes = len(valid)
    need = (n_takes // 2) + 1
    consensus: list[int] = []
    if pool.size:
        cluster = [pool[0]]
        clusters = []
        for x in pool[1:]:
            if x - cluster[-1] <= CLUSTER_MS:
                cluster.append(x)
            else:
                clusters.append(cluster)
                cluster = [x]
        clusters.append(cluster)
        for c in clusters:
            if len(c) >= need:
                consensus.append(int(round(float(np.median(c)))))

    # Auswertungs-Fenster: erst ab dem ersten getappten Pump (Synchronpunkt/GPS-Knick) bis zum
    # letzten. Davor/danach ist NICHT getappt (≠ „keine Pumps") -> für spätere Detektor-vs-
    # Wahrheit-Auswertung + Training nur dieses Fenster als gelabelt behandeln.
    window = [int(pool.min()), int(pool.max())] if pool.size else None

    return {
        "n_takes": n_takes,
        "ref_take": int(ref_take["take"]),
        "takes": report,
        "consensus_ms": consensus,
        "consensus_n": len(consensus),
        "window_ms": window,
    }
