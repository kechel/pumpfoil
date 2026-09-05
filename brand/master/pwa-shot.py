"""Session-Ausschnitt fuer die Store-Grafik: Kennzahlen + Karte, ohne Kopfbereich."""
import pathlib
from playwright.sync_api import sync_playwright

SP = "/tmp/claude-1000/-home-jan-garmin-connect-iq/5d5edd71-5c14-412e-821b-fc2b44016839/scratchpad"
TOK = pathlib.Path(f"{SP}/tok.txt").read_text().strip()

with sync_playwright() as p:
    b = p.chromium.launch(args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 600, "height": 1336}, device_scale_factor=2, locale="de-DE")
    pg = ctx.new_page()
    pg.goto("http://localhost:8090/", wait_until="domcontentloaded")
    pg.evaluate("t => localStorage.setItem('foil_jwt', t)", TOK)
    pg.evaluate("localStorage.setItem('theme','dark')")
    pg.goto("http://localhost:8090/sessions/8", wait_until="networkidle")
    pg.wait_for_timeout(6000)
    # Ohne Kopfbereich: kein Profilbild, kein Name — es geht um das Produkt, nicht um die Person.
    pg.evaluate("window.scrollTo(0, 560)")
    pg.wait_for_timeout(2500)
    # Die Karte passt sich beim Laden an die Spur an, laesst dabei aber viel Rand — auf einer
    # Store-Grafik ist die Spur nur noch daumennagelgross. Ein Zoomschritt hinein macht sie
    # zum Hauptmotiv. Zweimal waere zu viel, dann faellt der aeussere Bogen heraus.
    try:
        pg.get_by_role("button", name="Zoom in").click()
        pg.wait_for_timeout(2000)
    except Exception:
        print("Hinweis: Zoom-Knopf nicht gefunden — Karte bleibt wie geladen")
    pg.screenshot(path=f"{SP}/pwa-session-2.png")
    print("gespeichert")
    b.close()
