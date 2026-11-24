#!/usr/bin/env python3
"""Echte Instrumente fuer die Musik der Media-Ansicht erzeugen (docs/MEDIA.md, Jan 24.11.2026).

    python3 scripts/media-klaenge.py            # erzeugt web/public/klaenge/ (fehlende Dateien)
    python3 scripts/media-klaenge.py --neu      # alles neu erzeugen

WARUM SO: Strudels Standard-Klaenge mischen Quellen mit unklarer Lizenz (Drum-Machine-Samples, mehrere
Soundfonts). Wir nehmen nur FluidR3_GM (Frank Wen, MIT-Lizenz; Debian-Paket `fluid-soundfont-gm`) und rendern
daraus mit fluidsynth einzelne Toene. Jan: „repo schlank halten" — die Klangdateien liegen NICHT im Repo
(web/public/klaenge/ ist in .gitignore), nur dieses Skript. Es laeuft vor jedem `npm run build` (prebuild) und
erzeugt nur, was fehlt. Ohne fluidsynth/Soundfont (z. B. in der CI) meldet es das und endet ohne Fehler —
die Media-Ansicht bietet dann nur die Synth-Klaenge an (sie prueft `klaenge/strudel.json`).

Ausgabe: je Instrument einige Toene (Abstand eine kleine Terz; Strudel verschiebt dazwischen), MP3 mono, plus
`strudel.json` (Strudel-Sample-Karte, Pfade relativ — funktioniert bei uns und per Link auf strudel.cc) und
`LICENSE.txt` mit dem Urhebervermerk, den die MIT-Lizenz verlangt.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

SF2 = Path("/usr/share/sounds/sf2/FluidR3_GM.sf2")
LIZENZ_QUELLE = Path("/usr/share/doc/fluid-soundfont-gm/copyright")
ZIEL = Path(__file__).resolve().parent.parent / "web" / "public" / "klaenge"
VERSION = 3   # 3: Spitze je Datei auf -5 dBFS normalisiert (MP3 ueberschwingt ~2 dB) (FluidR3 rendert sonst ~15 dB leiser als die Synths). Hochzaehlen, wenn sich Auswahl oder Erzeugung aendert -> alles neu

NAMEN = ["c", "eb", "gb", "a"]   # kleine Terzen

# name: (GM-Programm 0-basiert, tiefste Oktave, hoechste Oktave, Tondauer s, Ausklang s)
INSTRUMENTE: dict[str, tuple[int, int, int, float, float]] = {
    "pf_piano": (0, 2, 6, 2.5, 1.5),
    "pf_epiano": (4, 2, 5, 2.0, 1.2),
    "pf_marimba": (12, 3, 6, 1.0, 0.8),
    "pf_organ": (16, 2, 5, 3.0, 0.5),
    "pf_guitar_nylon": (24, 2, 5, 2.0, 1.0),
    "pf_guitar_steel": (25, 2, 5, 2.0, 1.0),
    "pf_guitar_electric": (27, 2, 5, 2.0, 1.0),
    "pf_bass_upright": (32, 1, 3, 1.6, 0.6),
    "pf_bass_finger": (33, 1, 3, 1.6, 0.6),
    "pf_bass_synth": (38, 1, 3, 1.2, 0.5),
    "pf_violin": (40, 3, 6, 2.5, 0.8),
    "pf_strings": (48, 2, 5, 3.5, 1.2),
    "pf_choir": (52, 3, 5, 3.5, 1.2),
    "pf_trumpet": (56, 3, 5, 2.0, 0.6),
    "pf_flute": (73, 4, 6, 2.0, 0.6),
    "pf_pad_warm": (89, 2, 5, 4.0, 1.5),
}
# Schlagzeug (GM-Kanal 10): name -> MIDI-Note
SCHLAGZEUG = {"pf_kick": 36, "pf_snare": 38, "pf_clap": 39, "pf_hat": 42, "pf_hat_open": 46,
              "pf_crash": 49, "pf_ride": 51, "pf_tom": 45, "pf_shaker": 70}


def midi_datei(pfad: Path, kanal: int, programm: int | None, note: int, dauer: float, ausklang: float) -> None:
    """Minimale MIDI-Datei (Format 0): Programmwahl, ein Ton, Ende nach dem Ausklang."""
    tpq = 480                      # Ticks je Viertel, Tempo 120 -> 960 Ticks/s
    def vlq(n: int) -> bytes:
        out = [n & 0x7F]
        n >>= 7
        while n:
            out.insert(0, (n & 0x7F) | 0x80)
            n >>= 7
        return bytes(out)
    ev = b""
    if programm is not None:
        ev += vlq(0) + bytes([0xC0 | kanal, programm])
    ev += vlq(0) + bytes([0x90 | kanal, note, 100])
    ev += vlq(int(dauer * 960)) + bytes([0x80 | kanal, note, 0])
    ev += vlq(int(ausklang * 960)) + b"\xff\x2f\x00"
    pfad.write_bytes(b"MThd" + struct.pack(">IHHH", 6, 0, 1, tpq) + b"MTrk" + struct.pack(">I", len(ev)) + ev)


def rendere(mid: Path, mp3: Path, tmp: Path) -> None:
    wav = tmp / "x.wav"
    subprocess.run(["fluidsynth", "-ni", "-q", "-R", "0", "-C", "0", "-g", "0.9", "-r", "44100",
                    "-F", str(wav), str(SF2), str(mid)], check=True, capture_output=True)
    mp3.parent.mkdir(parents=True, exist_ok=True)
    # Spitze messen -> auf -5 dBFS anheben, damit Samples und eingebaute Synths aehnlich laut sind.
    mess = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(wav), "-af", "volumedetect", "-f", "null", "-"],
                          capture_output=True, text=True).stderr
    m = re.search(r"max_volume: (-?[\d.]+) dB", mess)
    plus = max(0.0, -5.0 - float(m.group(1))) if m else 0.0
    # Stille am Anfang weg (sonst kommt jeder Ton zu spaet), mono, 96 kbit/s.
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(wav),
                    "-af", f"silenceremove=start_periods=1:start_threshold=-55dB,volume={plus:.1f}dB", "-ac", "1",
                    "-c:a", "libmp3lame", "-b:a", "96k", str(mp3)], check=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--neu", action="store_true", help="alles neu erzeugen")
    a = ap.parse_args()
    if not shutil.which("fluidsynth") or not shutil.which("ffmpeg") or not SF2.is_file():
        print("media-klaenge: fluidsynth/ffmpeg/FluidR3_GM.sf2 fehlt — keine echten Instrumente "
              "(nur Synth). Installieren: apt install fluidsynth fluid-soundfont-gm ffmpeg")
        return 0
    stand = ZIEL / ".version"
    if a.neu or not stand.is_file() or stand.read_text().strip() != str(VERSION):
        if ZIEL.exists():
            shutil.rmtree(ZIEL)   # nur unser eigener, erzeugter Ordner (in .gitignore)
    karte: dict[str, object] = {}
    neu = 0
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        for name, (prog, o1, o2, dauer, aus) in INSTRUMENTE.items():
            toene = {}
            for okt in range(o1, o2 + 1):
                for i, nn in enumerate(NAMEN):
                    midi = 12 * (okt + 1) + i * 3
                    datei = f"{name}/{nn}{okt}.mp3"
                    toene[f"{nn}{okt}"] = datei
                    if not (ZIEL / datei).is_file():
                        midi_datei(tmp / "x.mid", 0, prog, midi, dauer, aus)
                        rendere(tmp / "x.mid", ZIEL / datei, tmp)
                        neu += 1
            karte[name] = toene
        for name, note in SCHLAGZEUG.items():
            datei = f"drums/{name}.mp3"
            karte[name] = [datei]
            if not (ZIEL / datei).is_file():
                midi_datei(tmp / "x.mid", 9, None, note, 0.4, 1.4)
                rendere(tmp / "x.mid", ZIEL / datei, tmp)
                neu += 1
    (ZIEL / "strudel.json").write_text(json.dumps(karte, indent=1))
    lizenz = LIZENZ_QUELLE.read_text() if LIZENZ_QUELLE.is_file() else "FluidR3_GM, MIT License, (c) Frank Wen"
    (ZIEL / "LICENSE.txt").write_text(
        "Instrument samples rendered from the FluidR3_GM SoundFont with FluidSynth\n"
        "(scripts/media-klaenge.py in https://github.com/kechel/pumpfoil).\n\n" + lizenz)
    stand.write_text(str(VERSION))
    groesse = sum(f.stat().st_size for f in ZIEL.rglob("*") if f.is_file())
    print(f"media-klaenge: {neu} Dateien neu, {len(karte)} Klaenge, {groesse / 1e6:.1f} MB in {ZIEL}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
