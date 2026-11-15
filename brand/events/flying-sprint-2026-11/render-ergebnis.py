"""Endstand-Overlays (1080x480) fuer Shorts aus ergebnis.html.

    python render-ergebnis.py <zielordner> [--stand "PROVISIONAL"] [--d "TEXT · *BETONT*"]

Ohne --d: „<Teilnehmende> RIDERS · THANK YOU!“ mit der Zahl der Eventseite (summen.aktive).

Liest die Top 3 je Bestenliste (100 m, 1 Minute) aus der oeffentlichen Event-API und rendert je transparent + weiss:
Titel, 100 m, 1 Minute. Namen und Werte stehen nur in den PNGs, nie im Repo.
"""
import json, pathlib, sys, urllib.parse, urllib.request
from playwright.sync_api import sync_playwright

API = "http://localhost:8090/api/public/teams/pumpfoil/events/11?mix=1&sprint=1"
hier = pathlib.Path(__file__).resolve().parent / "ergebnis.html"
out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
stand = sys.argv[sys.argv.index("--stand") + 1] if "--stand" in sys.argv else "FINAL RESULTS"
d = sys.argv[sys.argv.index("--d") + 1] if "--d" in sys.argv else ""

ev = json.load(urllib.request.urlopen(API, timeout=30))["event"]
tafeln = {}
for t in ev["tafeln"]:
    tafeln.setdefault(t.get("kennzahl"), t)
def top3(kz):
    return [f"{z['name']}|{z['value'] * 3.6:.1f}" for z in tafeln[kz]["zeilen"][:3]]
n = (ev.get("summen") or {}).get("aktive") or 0      # Teilnehmende wie auf der Eventseite („Participants")
if not d and n:
    d = f"{n} RIDERS · *THANK YOU!*"

bilder = {
    "1-titel": {"art": "titel", "k": stand, "tag": "THE WINNERS", **({"d": d} if d else {})},
    "2-100m": {"art": "tafel", "kz": "100 m", "k": f"FLYING SPRINT · {stand.split()[0]}",
               **{f"p{i + 1}": v for i, v in enumerate(top3("sprint_100m"))}},
    "3-1min": {"art": "tafel", "kz": "1 MINUTE", "k": f"FLYING SPRINT · {stand.split()[0]}",
               **{f"p{i + 1}": v for i, v in enumerate(top3("sprint_60s"))}},
}
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1080, "height": 480})
    for name, par in bilder.items():
        for weiss in (0, 1):
            qs = urllib.parse.urlencode({**par, **({"weiss": 1} if weiss else {})})
            pg.goto(f"file://{hier}?{qs}"); pg.wait_for_timeout(300)
            pg.locator("#b").screenshot(path=str(out / f"endstand-{name}-{'weiss' if weiss else 'transparent'}.png"),
                                        omit_background=not weiss)
    b.close()
print(f"{n} Teilnehmende;", sorted(x.name for x in out.iterdir()))
