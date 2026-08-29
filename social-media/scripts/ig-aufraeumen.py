#!/usr/bin/env python3
"""ig-aufraeumen.py — die Instagram-Rückholung in die richtigen Ordner räumen.

`ig-match.py` lädt die eigenen Instagram-Videos herunter, um ihnen über den
Bildinhalt eine Nummer zu geben. Ein Teil davon liegt danach doppelt vor: die
Fassung ist längst als shorts-mit-musik/instagram/<NNN>-….mp4 im Bestand.

Dieses Skript räumt auf — aber nur gegen Beweis:

* **Löschen** nur, wenn die lokale Fassung *nachweislich dieselbe Datei* ist.
  Geprüft wird SHA-256; erst wenn der abweicht, zusätzlich Bild UND Ton.
  Der Tonvergleich ist der Punkt, an dem man sich sonst vertut: der Bild-Hash
  arbeitet auf Graustufen, zwei Fassungen mit verschiedener Musik sind darin
  identisch — und genau die andere Tonspur war der Grund, die Videos
  überhaupt zurückzuholen.
* **Verschieben** in shorts-mit-musik/instagram/, wenn es zu der Nummer dort
  noch nichts gibt.
* **Liegen lassen**, was keiner Nummer zuzuordnen war.

    ./ig-aufraeumen.py --dry-run   # nur zeigen, was passieren würde
    ./ig-aufraeumen.py             # ausführen

Ohne --dry-run wird gelöscht. Das ist gewollt, aber es ist eine Einbahnstraße:
vorher einmal --dry-run lesen.
"""
import argparse
import array
import hashlib
import importlib.util
import json
import math
import re
import shutil
import subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("igm", HERE / "ig-match.py")
igm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(igm)

BASE = igm.BASE
DL = BASE / "ig-rueckholung"
IG_DIR = BASE / "shorts-mit-musik" / "instagram"
NUM = re.compile(r"^(\d{1,3})-")
VIDEO_OK = 12.0     # Bildabstand, ab dem zwei Dateien dasselbe Video zeigen
# Korrelation der Lautstaerke-Huellkurve. Gemessen an Kontrollpaaren:
# dieselbe Datei 1,000 · dieselbe Musik nach Instagram-Rekompression 0,89-0,997 ·
# verschiedene Videos -0,20 bis 0,25. Dazwischen ist viel Luft.
AUDIO_OK = 0.80


def sha(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        while chunk := f.read(1 << 20):
            h.update(chunk)
    return h.hexdigest()


def envelope(path: Path) -> list:
    """Grobe Lautstaerke-Huellkurve, 10 Werte je Sekunde. Reicht, um
    verschiedene Musik zu erkennen, ohne den Ton wirklich zu dekodieren."""
    try:
        out = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path),
                              "-ac", "1", "-ar", "800", "-f", "s16le", "-"],
                             capture_output=True, timeout=180).stdout
    except (OSError, subprocess.TimeoutExpired):
        return []
    a = array.array("h")
    a.frombytes(out[:len(out) // 2 * 2])
    step = 80
    return [sum(abs(v) for v in a[i:i + step]) / step
            for i in range(0, len(a) - step, step)]


def audio_corr(a: list, b: list):
    """Pearson-Korrelation der Huellkurven. Der Mittelwert-Abstand taugt hier
    nicht: Instagram rekomprimiert kraeftig (lokale Dateien sind 4-10x groesser),
    das verschiebt die Pegel, ohne dass die Musik eine andere waere."""
    n = min(len(a), len(b))
    if n < 10:
        return None
    a, b = a[:n], b[:n]
    ma, mb = sum(a) / n, sum(b) / n
    va = math.sqrt(sum((x - ma) ** 2 for x in a))
    vb = math.sqrt(sum((y - mb) ** 2 for y in b))
    if not va or not vb:
        return None
    return sum((x - ma) * (y - mb) for x, y in zip(a, b)) / (va * vb)


def local_by_number() -> dict:
    out = {}
    for p in sorted(IG_DIR.iterdir()):
        m = NUM.match(p.name)
        if m and p.is_file():
            out.setdefault(int(m.group(1)), []).append(p)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    if not DL.is_dir():
        print(f"{DL} gibt es nicht — nichts zu tun.")
        return
    mapping = json.loads((BASE / ".ig-numbers.json").read_text()) \
        if (BASE / ".ig-numbers.json").is_file() else {}
    by_file = {f"ig-{v['timestamp'][:10]}-{k}.mp4": v["number"] for k, v in mapping.items()}
    local = local_by_number()
    renders = igm.local_renders()
    cache = igm.load_cache()

    dupes, moves, keep, unsure = [], [], [], []
    for p in sorted(DL.glob("*.mp4")):
        num = by_file.get(p.name)
        if num is None:
            # Kein Eintrag aus dem Bild-Matching — vielleicht ein Video, dessen
            # Nummer schon aus der Caption bekannt war (Selbsttest-Download).
            g, dv, second = igm.best_match(igm.hashes_for(p, cache), renders, cache)
            num = g if dv <= VIDEO_OK else None
        if num is None:
            unsure.append(p)
            continue
        # Geloescht wird nur gegen Beweis, und der haengt nicht an der Nummer:
        # gesucht ist irgendeine lokale Datei mit nachweislich gleichem Inhalt.
        # Selbst eine falsch geratene Nummer kann so nichts kaputt machen.
        cands = local.get(num, []) or []
        same = None
        for c in cands:
            if c.stat().st_size == p.stat().st_size and sha(c) == sha(p):
                same = (c, "bytegleich")
                break
        if not same:
            for c in cands:
                dv = igm.distance(igm.hashes_for(p, cache), igm.hashes_for(c, cache))
                r = audio_corr(envelope(p), envelope(c))
                if dv <= VIDEO_OK and r is not None and r >= AUDIO_OK:
                    same = (c, f"Bild {dv:.1f} / Ton r={r:.3f}")
                    break
        if same:
            dupes.append((p, num, same[0], same[1]))
        elif not cands:
            moves.append((p, num))
        else:
            keep.append((p, num, "lokale Fassung ist inhaltlich eine andere"))

    igm.CACHE_FILE.write_text(json.dumps(cache))
    mb = lambda ps: sum(x.stat().st_size for x in ps) / 1048576

    print(f"{len(dupes)} doppelt (löschen) · {len(moves)} fehlen in instagram/ "
          f"(verschieben) · {len(keep)} abweichend (behalten) · "
          f"{len(unsure)} ohne Nummer (behalten)\n")
    if moves:
        print("verschieben nach shorts-mit-musik/instagram/:")
        for p, n in moves:
            print(f"   {n:03d}  {p.name}")
    if keep:
        print("\nbehalten — lokale Fassung ist NICHT dieselbe Datei:")
        for p, n, why in keep:
            print(f"   {n:03d}  {p.name}  ({why})")
    if unsure:
        print(f"\nbehalten — keiner Nummer zuzuordnen ({mb(unsure):.0f} MB):")
        for p in unsure:
            print(f"        {p.name}")
    print(f"\nlöschen: {len(dupes)} Dateien, {mb([d[0] for d in dupes]):.0f} MB "
          f"(jede mit lokalem Gegenstück belegt)")

    if a.dry_run:
        print("\n--dry-run: nichts verändert.")
        return
    for p, n in moves:
        target = IG_DIR / f"{n:03d}-Pumpfoil-instagram-{p.stem.split('-', 1)[1]}.mp4"
        shutil.move(str(p), target)
        print(f"  verschoben: {target.name}")
    for p, n, c, why in dupes:
        p.unlink()
    print(f"  gelöscht: {len(dupes)} doppelte Dateien")
    rest = list(DL.glob("*.mp4"))
    print(f"\n{DL.name}/ enthält noch {len(rest)} Dateien ({mb(rest):.0f} MB)")


if __name__ == "__main__":
    main()
