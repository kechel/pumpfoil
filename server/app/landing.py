"""Eigene Landingpages fuer die Zusatz-Domains — statisches HTML, KEINE PWA.

WARUM ES DAS GIBT: neben pumpfoil.org liegen zwoelf weitere Domains (Strato, alle als A-Record
auf dieselbe Adresse). Bis 13.09.2026 leitete der Apache auf lb1 sie samt und sonders per 301
auf pumpfoil.org um. Das ist sauber, bringt aber nichts: eine Domain, die nur weiterleitet,
taucht in keiner Suche auf.

Jetzt bekommt jede Domain eine eigene, kurze Seite zu IHREM Thema — und einen klaren Weg nach
pumpfoil.org. Bewusst NICHT:
  · kein Service Worker, keine PWA, kein JavaScript. Die Apps und die Uhren sprechen
    ausschliesslich mit pumpfoil.org; eine zweite Origin mit eigenem Anmelde-Token, eigenem
    SW-Cache und nicht registrierten OAuth-Redirects waere eine Fehlerquelle ohne Nutzen.
  · kein eigenstaendiges Portal. Ab der Anmeldung ist man auf pumpfoil.org, und die Seite sagt
    das auch (Fusszeile). Doorway-Seiten, die etwas vorgeben, was dahinter nicht kommt, straft
    Google zu Recht ab.

AUFTEILUNG DER HOSTS (drei Faelle, siehe `fuer_host`):
  1. KANONISCH  -> eigene Landingpage (sieben Stueck)
  2. ALIAS      -> 301 auf die kanonische Schwester-Domain (paddle-up.org -> paddleup.org),
                   damit dieselbe Seite nicht zweimal im Index steht
  3. SCHUTZ     -> 301 auf pumpfoil.org. pump-foil.org ist nur gekauft, damit sie niemand
                   sonst hat; eine eigene Seite dafuer waere ein Duplikat der Startseite.

SPRACHE: vorerst NUR DEUTSCH. Die Uebersetzung in die 18 Sprachen kommt erst, wenn Jan mit
Aufbau und Text zufrieden ist (Ansage 13.09.2026) — sonst uebersetzt man 18 mal einen Entwurf.
Deshalb steht der Text hier direkt im Modul und nicht in den Web-Sprachdateien.
"""
from __future__ import annotations

from dataclasses import dataclass, field

ZIEL = "https://pumpfoil.org"


@dataclass(frozen=True)
class Seite:
    host: str                       # kanonischer Host, ohne Schema
    titel: str                      # <title> und og:title
    beschreibung: str               # meta description (~150 Zeichen)
    h1: str
    claim: str                      # eine Zeile unter der Ueberschrift
    absaetze: tuple[str, ...]
    bild: str                       # Datei aus web/dist (Bildschirmfoto der PWA)
    bild_alt: str


# Die drei gemeinsamen Punkte. Bewusst KURZ gehalten: je mehr Text sich die sieben Seiten
# teilen, desto eher liest Google sie als dieselbe Seite. Das Eigene steht in `absaetze`.
PUNKTE: tuple[tuple[str, str], ...] = (
    # Dieselbe Aufzaehlung wie auf der Startseite (`land.heroPlatforms`) — wer auf einer dieser
    # Domains landet, soll seine Uhr dort wiederfinden. WIE der Weg technisch aussieht (App auf
    # der Uhr, Konto verknuepfen, Import), steht auf pumpfoil.org und nicht hier.
    ("Die Uhr nimmt nur auf",
     "Garmin, Apple Watch, Wear OS, Amazfit, Polar, COROS, Suunto, Xiaomi — oder dein Handy. "
     "Starten, fahren, fertig; der Rest passiert danach."),
    ("Ausgewertet wird auf dem Server",
     "Läufe, Pumps, Kadenz, Gleitphasen, Höchst- und Durchschnittsgeschwindigkeit. Nicht "
     "geschätzt, sondern aus den Beschleunigungsdaten gerechnet."),
    ("Kostenlos, ohne Werbung, ohne Tracker",
     "Keine Cookies, keine Analytics, keine Dritt-Skripte. Der Quelltext ist offen (AGPL)."),
)


SEITEN: tuple[Seite, ...] = (
    Seite(
        host="foilers.org",
        titel="foilers.org — Foilen aufzeichnen und auswerten",
        beschreibung="Foil-Sessions mit der Sportuhr aufzeichnen und ehrlich auswerten: "
                     "Läufe, Pumps, Gleitphasen, Geschwindigkeit. Kostenlos und ohne Tracker.",
        h1="Foilen, in Zahlen",
        claim="Egal auf welchem Board: Wer foilt, will wissen, wie lange er oben war.",
        absaetze=(
            "Foilen ist inzwischen ein gutes Dutzend Sportarten mit einem gemeinsamen Kern — "
            "das Board verlässt das Wasser, und ab da trägt der Flügel. Ob der Antrieb aus "
            "der Dünung kommt, aus dem Wing, aus einem Schirm, aus dem Kite oder nur aus den "
            "eigenen Beinen: der Moment, in dem es leise wird, ist überall derselbe.",
            "Was allen fehlt, ist eine ehrliche Auswertung. Eine normale Sportuhr zählt "
            "Kilometer und Herzschläge, aber keinen einzigen Pump und keine Gleitphase — im "
            "Zweifel erkennt sie die Session gar nicht als Sport. pumpfoil.org macht genau "
            "das: aufzeichnen auf der Uhr, rechnen auf dem Server.",
        ),
        bild="landing-track.webp",
        bild_alt="Aufgezeichnete Foil-Session mit Karte und Geschwindigkeitsverlauf",
    ),
    Seite(
        host="paddleup.org",
        titel="paddle up — den Start aufs Foil messbar machen",
        beschreibung="Paddle up: paddeln, bis der Flügel trägt. Jeder Lauf einzeln "
                     "aufgezeichnet — Startzeit, Dauer, Geschwindigkeit. Mit jeder Sportuhr.",
        h1="Paddle up",
        claim="Der schwerste Teil ist der Anfang.",
        absaetze=(
            "Paddle up heißt: paddeln, bis der Flügel trägt. Auf dem SUP, im Downwinder, "
            "vor der Welle — bis dahin ist es Arbeit, danach ist es fliegen. Wer das übt, "
            "merkt schnell, dass zwischen „fast“ und „oben“ nur ein paar Sekunden und ein "
            "paar Zehntel Knoten liegen.",
            "Genau diese Sekunden verschwinden in jeder normalen Aufzeichnung. pumpfoil.org "
            "schneidet die Session stattdessen in einzelne Läufe: wann ein Lauf beginnt, wie "
            "lange er trägt, wie schnell du im Schnitt und in der Spitze warst. Nach ein paar "
            "Wochen sieht man, was das Training wirklich gebracht hat — statt „ging heute "
            "besser“.",
        ),
        bild="landing-sessions.webp",
        bild_alt="Session in einzelne Läufe zerlegt, je Lauf Dauer und Geschwindigkeit",
    ),
    Seite(
        host="supfoil.org",
        titel="SUP-Foil — Sessions aufzeichnen und auswerten",
        beschreibung="SUP-Foilen mit der Sportuhr aufzeichnen: Läufe, Pumps, Gleitzeit und "
                     "Geschwindigkeit, ausgewertet auf dem Server. Kostenlos, ohne Tracker.",
        h1="SUP-Foil",
        claim="Ein Paddel, ein Flügel, eine Dünung.",
        absaetze=(
            "SUP-Foilen ist der direkteste Weg aufs Foil: Board, Paddel, Wasser. Keine Leine, "
            "kein Segel, kein Motor. Die Welle muss dafür nicht groß sein — eine Bootswelle, "
            "eine flache Dünung oder eine Windwelle reicht, wenn der Absprung sitzt und die "
            "ersten Pumps sauber kommen.",
            "Und danach fängt die eigentliche Frage an: wie lange hält man den Lauf? "
            "pumpfoil.org zählt die Pumps aus den Beschleunigungsdaten der Uhr, misst die "
            "Kadenz und zeigt, wie viel von der Zeit im Wasser wirklich getragene Zeit war.",
        ),
        bild="landing-stats.webp",
        bild_alt="Auswertung einer SUP-Foil-Session mit Pumps und Kadenz",
    ),
    Seite(
        host="wake-thief.org",
        titel="Wake Thieving — fremde Wellen, eigene Runde",
        beschreibung="Wake Thieving: die Welle eines fremden Boots mitnehmen und ohne Leine "
                     "weiterpumpen. Jede Runde einzeln aufgezeichnet und ausgewertet.",
        h1="Wake thief",
        claim="Fremde Wellen, eigene Runde.",
        absaetze=(
            "Jedes Boot, jede Fähre, jeder Frachter lässt eine Welle liegen. Wer foilt, kann "
            "sie sich nehmen: vom Steg oder aus dem Wasser in die nachlaufenden Wellen "
            "starten, einmal anschieben lassen und dann im eigenen Rhythmus weiterfahren, "
            "bis die nächste kommt. Ohne Leine, ohne Zug — darin liegt der ganze Reiz. Die "
            "Szene nennt es Wake Thieving.",
            "Das kostet niemanden etwas: die Welle wäre sonst am Ufer verlaufen. Und weil "
            "der Antrieb nur ein Anstoß ist, ist fast alles danach Eigenleistung.",
            "Wie weit man von einer geklauten Welle tatsächlich kommt, schätzt man im Wasser "
            "regelmäßig falsch. pumpfoil.org legt die Zahlen daneben: jeder Lauf mit Dauer, "
            "Strecke und längster Gleitphase, dazu die Pump-Kadenz, die ihn getragen hat.",
        ),
        bild="landing-records.webp",
        bild_alt="Bestwerte einer Session: längster Lauf, längste Gleitphase, Höchstgeschwindigkeit",
    ),
    Seite(
        host="downwind-foil.org",
        titel="Downwind-Foil — Strecke, Dünung, Auswertung",
        beschreibung="Downwind-Sessions aufzeichnen: wie viel der Strecke wirklich getragen "
                     "war, wo die Läufe abrissen, wie schnell es lief. Mit jeder Sportuhr.",
        h1="Downwind-Foil",
        claim="Mit dem Wind, über die Dünung, so weit es geht.",
        absaetze=(
            "Downwind heißt: Start oben, Ziel weit unten, dazwischen die Dünung. Der Antrieb "
            "kommt aus dem Wasser und nicht aus dem Material — man liest die Wellen, verbindet "
            "sie und pumpt die Lücken dazwischen zu. Eine gute Runde ist eine, in der man die "
            "Lücken gar nicht gemerkt hat.",
            "Auf der Karte sieht eine Downwind-Strecke hinterher immer gleich aus. "
            "Interessant ist, was dazwischen passiert ist: wie viel der Strecke getragen war, "
            "wo ein Lauf abgerissen ist und wie lange die längste Gleitphase gehalten hat. "
            "pumpfoil.org rechnet das aus der Aufzeichnung heraus.",
        ),
        bild="landing-history.webp",
        bild_alt="Verlauf mehrerer Downwind-Sessions über Wochen",
    ),
    Seite(
        host="parawing.org",
        titel="Parawing, Pocketwing, Lowkite — Sessions auswerten",
        beschreibung="Parawing, Pocketwing, Lowkite, Parakite — ein Gerät, viele Namen. Sessions "
                     "mit der Sportuhr aufzeichnen: Läufe, Pumps, Gleitphasen, Geschwindigkeit.",
        h1="Parawing",
        claim="Parawing, Pocketwing, Lowkite — viele Namen, ein Gerät.",
        absaetze=(
            "Der Antrieb, der in die Hosentasche passt: ein Tuchflügel ohne Gestänge, kein "
            "Schlauch, keine Streben, "
            "zusammengelegt kaum größer als eine Jacke. Geflogen wird er an kurzen Leinen — das "
            "ist näher am Kite als am Wing. Und wenn das Board läuft, wandert der Schirm "
            "weg: ab da ist es reines, ungetriebenes Foilen.",
            "Der Gedanke dahinter steckt schon im Namen Lowkite, den Gong für seine Schirme "
            "benutzt: je besser der Flügel trägt, desto weniger Zug braucht es. Ein kleines "
            "Tuch reicht zum Anschieben, den Rest machen Dünung und Beine — und man ist bei "
            "Bedingungen unterwegs, bei denen andere noch am Strand aufbauen.",
            "Weil der Antrieb wechselt, wird die Auswertung interessant: welcher Teil der "
            "Session war angeschoben, welcher getragen, und wie lange hielten die Läufe "
            "ohne Zug? pumpfoil.org zerlegt die Aufzeichnung in genau diese Abschnitte.",
        ),
        bild="landing-spots.webp",
        bild_alt="Spot-Karte mit aufgezeichneten Sessions",
    ),
)

KANONISCH: dict[str, Seite] = {s.host: s for s in SEITEN}

# Schreibvarianten derselben Domain. Sie zeigen auf die kanonische Schwester, damit nicht
# zweimal derselbe Text im Index steht. Die Richtung ist eine reine Festlegung — sie laesst
# sich hier in einer Zeile drehen, solange keine der beiden beworben wird.
ALIASSE: dict[str, str] = {
    "paddle-up.org": "paddleup.org",
    "sup-foil.org": "supfoil.org",
    # Richtung hier bewusst mit Bindestrich als kanonisch (Jan, 13.09.2026): "wake-thief"
    # ist optisch klar von der Marke "Wake Thief" / @wakethief getrennt, trifft die
    # Suchabsicht („wake thief" mit Leerzeichen) aber genauso. Bei allen anderen Paaren
    # traegt die Variante OHNE Bindestrich die Seite.
    "wakethief.org": "wake-thief.org",
    # wake-thieving.org am 13.09.2026 dazugekauft — der Name der TECHNIK, und damit
    # eigentlich der beste Kandidat fuer die Hauptdomain (die Seite heisst ohnehin
    # „Wake Thieving"). Steht hier vorerst NUR als Weiterleitung: der Proxy auf lb1 kennt
    # sie noch nicht, und ein Umschwenken wuerde die laufende Seite auf eine tote Adresse
    # schicken. Sobald lb1 sie durchreicht, ist der Tausch zwei Zeilen — s. Seite unten.
    "wake-thieving.org": "wake-thief.org",
    "parawingfoil.org": "parawing.org",
    # Lowkite, Parawing und Parakite sind dasselbe (Jan, 13.09.2026) — also EINE
    # Seite. Zwei Domains mit demselben Text waeren fuer Google eine Dublette und
    # wuerden sich gegenseitig verdraengen. Die drei Namen stehen dafuer sichtbar
    # im Text von parawing.org, damit man sie dort auch findet.
    "lowkitefoil.org": "parawing.org",
}

# Reine Schutz-Domains: gekauft, damit sie niemand anders hat. Eine eigene Seite waere ein
# Duplikat der Startseite — also weiter 301 auf pumpfoil.org.
SCHUTZ: frozenset[str] = frozenset({"pump-foil.org"})

# Alles, was dieses Modul beansprucht. Was hier nicht drinsteht, laesst die Middleware in
# Ruhe — pumpfoil.org selbst darf davon nie beruehrt werden.
ALLE_HOSTS: frozenset[str] = frozenset(KANONISCH) | frozenset(ALIASSE) | SCHUTZ

# Dateien aus web/dist, die auf einer Landing-Domain ausgeliefert werden duerfen. Bewusst eine
# Positivliste: alles andere (sw.js, manifest.webmanifest, index.html, /assets/*) gehoert zur
# PWA und hat auf diesen Hosts nichts zu suchen.
ASSETS: frozenset[str] = frozenset(
    {"favicon-32.png", "favicon-16.png", "apple-touch-icon.png", "wordmark-h-dark.png"}
    | {s.bild for s in SEITEN}
)


def fuer_host(host: str) -> tuple[str, object] | None:
    """Was mit diesem Host passieren soll.

    ("seite", Seite)      -> eigene Landingpage
    ("umleiten", "<url>") -> 301 dorthin (Schema + Host, ohne Pfad)
    None                  -> nicht unsere Sache, normal weiterreichen

    `www.` wird IMMER auf die nackte Domain umgeleitet, nie selbst ausgeliefert: sonst stuende
    dieselbe Seite zweimal im Index. (Jan legt die www-Eintraege am 13.09.2026 bei Strato an;
    bis dahin loest www fuer die neuen Domains gar nicht auf.)
    """
    h = (host or "").split(":")[0].lower()
    www = h.startswith("www.")
    if www:
        h = h[4:]
    if h not in ALLE_HOSTS:
        return None                                   # auch www.pumpfoil.org faellt hier raus
    if h in SCHUTZ:
        return ("umleiten", ZIEL)
    if h in ALIASSE:
        return ("umleiten", f"https://{ALIASSE[h]}")
    if www:
        return ("umleiten", f"https://{h}")
    return ("seite", KANONISCH[h])


def robots(host: str) -> str:
    return ("User-agent: *\n"
            "Disallow: /api/\n"
            "Allow: /\n"
            f"\nSitemap: https://{host}/sitemap.xml\n")


def sitemap(host: str) -> str:
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f"  <url>\n    <loc>https://{host}/</loc>\n"
            "    <changefreq>monthly</changefreq>\n    <priority>1.0</priority>\n  </url>\n"
            "</urlset>\n")


_CSS = """
:root{--bg:#020617;--fg:#f8fafc;--dim:#94a3b8;--cyan:#22d3ee;--line:#1e293b;--card:#0b1220}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);
  font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
a{color:var(--cyan)}
.wrap{max-width:44rem;margin:0 auto;padding:0 1.25rem}
header{padding:1.5rem 0;border-bottom:1px solid var(--line)}
header img{height:28px;width:auto;display:block}
h1{font-size:2.35rem;line-height:1.12;letter-spacing:-.02em;margin:2.5rem 0 .5rem}
.claim{color:var(--cyan);font-size:1.15rem;margin:0 0 1.75rem}
p{margin:0 0 1.1rem}
figure{margin:2rem 0}
figure img{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:12px}
figcaption{color:var(--dim);font-size:.9rem;margin-top:.6rem}
h2{font-size:1.25rem;margin:2.5rem 0 1rem}
ul{list-style:none;padding:0;margin:0}
li{border:1px solid var(--line);background:var(--card);border-radius:12px;
  padding:1rem 1.1rem;margin-bottom:.75rem}
li b{display:block;margin-bottom:.25rem}
li span{color:var(--dim)}
.cta{display:block;margin:2.5rem 0 1rem;padding:1rem;text-align:center;
  background:var(--cyan);color:#020617;font-weight:700;font-size:1.05rem;
  border-radius:12px;text-decoration:none}
.cta-sub{color:var(--dim);text-align:center;margin:0 0 3rem;font-size:.95rem}
footer{border-top:1px solid var(--line);padding:1.5rem 0 3rem;color:var(--dim);font-size:.9rem}
footer a{margin-right:1rem}
@media (max-width:480px){h1{font-size:1.9rem}}
"""


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def html(s: Seite) -> str:
    """Die ganze Seite als ein Stueck HTML — kein JavaScript, keine externen Dateien."""
    basis = f"https://{s.host}"
    absaetze = "\n    ".join(f"<p>{_esc(a)}</p>" for a in s.absaetze)
    punkte = "\n      ".join(
        f"<li><b>{_esc(t)}</b><span>{_esc(d)}</span></li>" for t, d in PUNKTE)
    return f"""<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_esc(s.titel)}</title>
<meta name="description" content="{_esc(s.beschreibung)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="{basis}/">
<link rel="icon" href="/favicon-32.png" sizes="32x32">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{s.host}">
<meta property="og:url" content="{basis}/">
<meta property="og:title" content="{_esc(s.titel)}">
<meta property="og:description" content="{_esc(s.beschreibung)}">
<meta property="og:image" content="{basis}/{s.bild}">
<meta name="twitter:card" content="summary_large_image">
<style>{_CSS}</style>
</head>
<body>
<header><div class="wrap">
  <a href="{ZIEL}/"><img src="/wordmark-h-dark.png" alt="pumpfoil.org"></a>
</div></header>

<main class="wrap">
  <h1>{_esc(s.h1)}</h1>
  <p class="claim">{_esc(s.claim)}</p>
  {absaetze}

  <figure>
    <img src="/{s.bild}" alt="{_esc(s.bild_alt)}" loading="lazy">
    <figcaption>{_esc(s.bild_alt)}</figcaption>
  </figure>

  <h2>Wie das läuft</h2>
  <ul>
      {punkte}
  </ul>

  <a class="cta" href="{ZIEL}/">Zu pumpfoil.org</a>
  <p class="cta-sub">Anmelden, Uhr verbinden, aufzeichnen. Dauert ein paar Minuten.</p>
</main>

<footer><div class="wrap">
  <p>{s.host} gehört zu <a href="{ZIEL}/">pumpfoil.org</a> — dort liegt die App, dort sind
  die Sessions, dort meldet man sich an. Diese Seite ist nur die Tür.</p>
  <p><a href="{ZIEL}/impressum">Impressum</a><a href="{ZIEL}/impressum">Datenschutz</a></p>
</div></footer>
</body>
</html>
"""
