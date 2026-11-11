import pathlib, sys
from playwright.sync_api import sync_playwright
hier = pathlib.Path(sys.argv[1]).resolve(); out = pathlib.Path(sys.argv[2]); out.mkdir(exist_ok=True)
for f in out.glob("*.png"): f.unlink()
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1080, "height": 480})
    for weiss in (0, 1):
        for st in range(1, 5):
            pg.goto(f"file://{hier}?stufe={st}" + ("&weiss=1" if weiss else "")); pg.wait_for_timeout(300)
            pg.locator("#b").screenshot(path=str(out / f"flying-sprint-{st}-{'weiss' if weiss else 'transparent'}.png"), omit_background=not weiss)
    b.close()
print(sorted(x.name for x in out.iterdir()))
