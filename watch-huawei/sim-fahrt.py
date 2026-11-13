#!/usr/bin/env python3
"""Echte Fahrt (GPX oder FIT) in den GT-/Lite-Simulator bringen (13.11.2026, Jan: „wie bekomme ich fit testdaten in den
emulator?"). Nur fuer den Sim-Modus — schreibt die GPS-Attrappe, die `./sim.sh an` nach
<linie>/entry/src/main/js/MainAbility/wearengine/sim-gps.js legt; `./sim.sh aus` / `build-all.sh` raeumen sie weg.

    ./sim.sh an [sim-konfig.json]
    ./sim-fahrt.py fahrt.gpx [--ab 600]      (oder fahrt.fit; prueft selbst, was in den Lite-Heap passt)
    -> in DevEco neu starten, START tippen: die Uhr bekommt jede Sekunde einen Fix mit dem echten Tempo

Warum nur das Tempo: Lite hat kein GPS-Tempo, die Uhr rechnet Tempo und Strecke aus den Positionen. Die Attrappe faehrt
darum mit dem echten Tempo je Sekunde geradeaus (Nordost); Laeufe, Pausen, Tempo-Farben und Strecke stimmen, die Karte
nicht. Sekunden ohne Fix (GPS-Luecke, Uhr unter Wasser) bleiben ohne Fix.
Platz: die Daten liegen im app.js-Buendel, das am 48-KB-Heap haengt. Gemessen 13.11.2026 (Release-Bau, jerry-snapshot):
200 Zeichen gehen, 300 nicht. Darum hoechstens MAX_ZEICHEN Zeichen, eines je --raster Sekunden (Mittel des Tempos,
0,5 km/h-Schritte): Raster 1 = gut 3 min sekundengenau, Raster 3 = 10 min. Andere Stelle der Fahrt mit --ab.
"""
import argparse
import math
import os
import pathlib
import subprocess
import sys
import xml.etree.ElementTree as ET
from datetime import datetime

HIER = pathlib.Path(__file__).resolve().parent
MAX_ZEICHEN = 200   # Obergrenze; was wirklich passt, prueft `snapshot_ok` (13.11.: je nach app.js 100-200 Zeichen)
CLT = pathlib.Path(os.environ.get("CLT_HOME", pathlib.Path.home() / "harmonyos/command-line-tools"))


def snapshot_ok() -> bool | None:
    """Lite-Release bauen und app.js als JerryScript-Snapshot uebersetzen (wie build-all.sh). None = Werkzeug fehlt."""
    hv, js = CLT / "bin/hvigorw", CLT / "sdk/default/openharmony/js/build-tools/ace-loader/bin/jerry-snapshot"
    if not hv.exists() or not js.exists():
        return None
    env = {**os.environ, "PATH": f"{CLT}/bin:{CLT}/tool/node/bin:" + os.environ["PATH"], "DEVECO_SDK_HOME": str(CLT / "sdk")}
    subprocess.run([str(hv), "assembleHap", "--mode", "module", "-p", "product=default", "-p", "buildMode=release",
                    "--no-daemon"], cwd=HIER / "lite", env=env, capture_output=True)
    app = HIER / "lite/entry/build/default/intermediates/loader_out_lite/default/js/MainAbility/app.js"
    return subprocess.run([str(js), "generate", "-o", os.devnull, str(app)], capture_output=True).returncode == 0
LUECKE = 33         # Zeichen „!" = keine Fix in dieser Sekunde
NULL = 35           # Zeichen „#" = 0 km/h; je Zeichen +0,5 km/h, bis „~" (126) = 45,5 km/h


def gpx_punkte(pfad):
    ns = {"g": "http://www.topografix.com/GPX/1/1"}
    root = ET.parse(pfad).getroot()
    pts = root.findall(".//g:trkpt", ns) or root.findall(".//trkpt")
    out = []
    for p in pts:
        tz = p.find("g:time", ns) if p.find("g:time", ns) is not None else p.find("time")
        if tz is None:
            continue
        t = datetime.fromisoformat(tz.text.replace("Z", "+00:00")).timestamp()
        out.append((t, float(p.get("lat")), float(p.get("lon"))))
    return out


def fit_punkte(pfad):
    try:
        from fitparse import FitFile
    except ImportError:
        sys.exit("FIT braucht fitparse (pip install fitparse) — oder vorher: gpsbabel -i garmin_fit -f x.fit -o gpx -F x.gpx")
    out = []
    for r in FitFile(str(pfad)).get_messages("record"):
        v = r.get_values()
        if v.get("position_lat") is None or v.get("timestamp") is None:
            continue
        k = 180.0 / 2 ** 31
        out.append((v["timestamp"].timestamp(), v["position_lat"] * k, v["position_long"] * k))
    return out


def meter(a, b):
    dla = math.radians(b[1] - a[1]); dlo = math.radians(b[2] - a[2]) * math.cos(math.radians(a[1]))
    return 6371000 * math.hypot(dla, dlo)


def tempo_je_sekunde(pts):
    """Liste km/h je Sekunde ab dem ersten Punkt; None = keine Fix in dieser Sekunde."""
    pts = sorted(pts)
    t0 = pts[0][0]
    n = int(pts[-1][0] - t0) + 1
    out = [None] * n
    for a, b in zip(pts, pts[1:]):
        dt = b[0] - a[0]
        if dt <= 0:
            continue
        kmh = meter(a, b) / dt * 3.6
        for s in range(int(a[0] - t0) + 1, int(b[0] - t0) + 1):
            out[s] = kmh if dt <= 3 else None       # ueber 3 s ohne Fix: Luecke wie draussen
    out[0] = out[1] if n > 1 else 0.0
    return out


def kodieren(kmh):
    return "".join(chr(LUECKE) if v is None else chr(NULL + min(91, max(0, round(v * 2)))) for v in kmh)


VORLAGE = """/* sim-fahrt.py: {quelle}, {n} s ab {ab} s — NUR Simulator (./sim.sh aus raeumt das weg) */
var V = "{daten}", R = {r};
var uhr = 0, lat = 52.5, lon = 13.4, t = 0;
export default {{
  subscribe: function (o) {{
    clearInterval(uhr); t = 0;
    uhr = setInterval(function () {{
      var c = V.charCodeAt(Math.floor(t / R) % V.length); t++;
      if (c === 33) return;
      var v = (c - 35) / 7.2;
      lat += v * 0.7071 / 111320;
      lon += v * 0.7071 / (111320 * Math.cos(lat * Math.PI / 180));
      if (o.success) o.success({{ latitude: lat, longitude: lon, accuracy: 4, time: Date.now() }});
    }}, 1000);
    console.info("Pumpfoil SIM: echte Fahrt, " + V.length * R + " s");
  }},
  unsubscribe: function () {{ clearInterval(uhr); uhr = 0; }}
}};
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("datei")
    ap.add_argument("--ab", type=int, default=0, help="Sekunden ab Beginn der Datei")
    ap.add_argument("--raster", type=int, default=1, help="mindestens so viele Sekunden je Zeichen (sonst automatisch)")
    a = ap.parse_args()
    p = pathlib.Path(a.datei)
    pts = fit_punkte(p) if p.suffix.lower() == ".fit" else gpx_punkte(p)
    if len(pts) < 10:
        sys.exit(f"{p}: zu wenig Punkte mit Zeit ({len(pts)})")
    alle = tempo_je_sekunde(pts)
    ziele = [HIER / l / "entry/src/main/js/MainAbility/wearengine" for l in ("lite", "wearable")]
    ziele = [z for z in ziele if (z / "sim.js").exists()]
    if not ziele:
        sys.exit("Simulator ist AUS — erst ./sim.sh an")
    gesamt = len(alle) - a.ab
    zeichen = MAX_ZEICHEN
    while True:
        # Raster so, dass die Fahrt in `zeichen` Zeichen passt (mind. --raster); je Zeichen das Mittel der Sekunden,
        # ohne Fix nur, wenn das ganze Fenster ohne Fix war
        r = max(a.raster, -(-gesamt // zeichen))
        kmh = alle[a.ab:a.ab + zeichen * r]
        fenster = [kmh[i:i + r] for i in range(0, len(kmh), r)]
        daten = kodieren([None if all(v is None for v in f) else
                          sum(v for v in f if v is not None) / sum(1 for v in f if v is not None) for f in fenster])
        for z in ziele:
            (z / "sim-gps.js").write_text(VORLAGE.format(quelle=p.name, n=len(kmh), ab=a.ab, r=r,
                                                           daten=daten.replace("\\", "\\\\")))
        ok = snapshot_ok()
        if ok is None:
            print("Hinweis: HarmonyOS-Werkzeug fehlt — nicht geprueft, ob die Seite laedt (CLT_HOME)"); break
        if ok:
            break
        if zeichen <= 30:
            sys.exit("Passt nicht mehr in den Lite-Heap — app.js ist zu voll")
        zeichen = int(zeichen * 0.8)
    fahrt = [v for v in kmh if v is not None]
    print(f"{len(kmh)} s in {len(daten)} Zeichen (Raster {r} s) geschrieben ({sum(1 for v in kmh if v is None)} s ohne Fix, max {max(fahrt):.1f} km/h, "
          f"ueber 10 km/h: {sum(1 for v in fahrt if v > 10)} s) -> {', '.join(str(z.relative_to(HIER)) for z in ziele)}")
    if len(alle) > a.ab + MAX_ZEICHEN * r:
        print(f"Hinweis: Fahrt ist {len(alle)} s lang — nur {len(kmh)} s ab {a.ab} s (Heap der Lite-Uhren). Andere Stelle: --ab")


if __name__ == "__main__":
    main()
