"""Lage des Bretts aus Beschleunigung + Drehrate: Pitch, Roll und Gierwinkel-Aenderung.

NUR sinnvoll, wenn das Geraet AM BRETT befestigt war (`sessions.placement == "board"`). In der
Tasche, in der Jacke oder am Arm misst das Handy den Fahrer und nicht das Brett — genau der
„arm-confound", an dem die Wrist-Auswertung 2026-06 schon gescheitert ist.

WARUM BEIDE SENSOREN GEBRAUCHT WERDEN
- Der Beschleunigungsmesser allein kennt die Schwerkraft und liefert damit einen ABSOLUTEN
  Neigungswinkel — aber nur im Stillstand. Beim Pumpen ist er von der Bewegung dominiert.
- Der Kreisel allein misst Dreh-RATE. Integriert man sie, laeuft der Winkel mit dem Bias weg.
- Zusammen ergaenzen sie sich: der Kreisel traegt die schnellen Aenderungen im Stroke, die
  Schwerkraft haelt den Nullpunkt fest (Komplementaerfilter).

YAW IST ANDERS. Fuer die Drehung um die Hochachse gibt es keinen Anker — ein Magnetometer
zeichnen wir nicht auf. Ein absoluter Kurs waere deshalb integrierter Drift. Was geht, ist die
AENDERUNG ueber ein kurzes Fenster: der Fehler ist im Wesentlichen Bias × Fensterlaenge, bei
einer Sekunde also rund ein Grad. Das Fenster ist damit keine Genauigkeits-, sondern eine
Was-sehe-ich-Schraube (0,1 s ≈ Momentanrate, 1 s ein Pumpzyklus, 3-5 s der ganze Carve).

DIE GIERRATE MUSS AUF DIE SCHWERKRAFT PROJIZIERT WERDEN, nicht einfach die Z-Achse des Geraets
genommen: in der Kurve ist das Brett gerollt, seine Hochachse zeigt dann nicht nach oben. Sonst
lecken Roll- und Nickrate genau dann in die Yaw-Zahl, wenn sie am interessantesten ist.

DER NULLPUNKT IST NICHT DIE RUHELAGE. Zuerst stand hier der Mittelwert ueber die ruhigsten
Abschnitte — und genau die sind die falschen: still liegt das Brett am Strand, im Auto oder auf
dem Kopf, nicht unter dem Fahrer. Ein Handy, das am Brett nach oben zeigt, wenn es angeschnallt
wird, und beim Fahren um 80° gerollt ist, bekam so eine Null aus dem Sand — im ersten Test von
Jan (20.09.) stand Roll dauerhaft bei -84°. Bezug ist deshalb die MITTLERE LAGE WAEHREND DER
LAEUFE, und zwar als Median: ein Sturz, bei dem das Brett durch die Gegend fliegt, verschiebt
einen Mittelwert, einen Median nicht. Gibt es keine erkannten Laeufe (Trockenuebung, kein GPS),
bleibt der Mittelteil des Fensters — Anfang und Ende sind auch dort das Unbrauchbare.

Der Bezug kommt aus den ROHEN Samples der Laufbereiche, nicht aus dem Rechenfenster: so bleibt
die Null dieselbe, egal ob gerade ein einzelner Lauf oder die ganze Aufnahme gezeigt wird.
Sonst spraenge der Winkel beim Umschalten zwischen den Laeufen.

DER HUB (Hoehenaenderung) IST EIN BANDBEGRENZTES ERGEBNIS, KEINE HOEHE. Aus der Lage kennen
wir die Richtung „oben"; damit laesst sich der senkrechte Anteil der Beschleunigung
herausrechnen und zweimal integrieren. Zweimal integrieren heisst aber: jeder noch so kleine
Rest-Fehler waechst quadratisch mit der Zeit — nach einer Minute ist aus 0,01 m/s² ein Fehler
von 18 Metern geworden. Absolute Hoehe ist damit ausgeschlossen, und zwar prinzipiell, nicht
aus Schlamperei.

Was BLEIBT, ist das Auf und Ab im Takt des Pumpens. Deshalb wird die doppelte Integration im
Frequenzbereich gemacht (−1/ω²) und alles Langsamere als das eingestellte Fenster verworfen:
bei 3 s also alles unter 0,33 Hz. Im durchgelassenen Band ist das Ergebnis amplitudentreu und
ohne Phasenverzug — anders als bei hintereinandergeschalteten Hochpaessen, die bei 1 Hz und
3-s-Grenze rund ein Viertel der Amplitude schlucken wuerden. Der Preis ist, dass langsames
Steigen und Sinken (ueber die Wasseroberflaeche hinaus) NICHT gemessen wird. Genau das meinte
Jan mit „es kann sich ja im Mittel ueber 3 s immer ausrichten".

WARUM DAS IM PUMPBAND TROTZDEM STIMMT: ein Lagefehler von 1° laesst rund 0,17 m/s² Schwerkraft
in die Senkrechte lecken. Bei 1 Hz wird daraus nach zweimaliger Integration (Faktor 1/ω² =
1/39,5) ein Fehler von vier Millimetern. Bei 0,1 Hz waeren es 43 cm — deswegen das Band.

ZWEI ZEITACHSEN. Accel und Gyro laufen NICHT zwingend gleich schnell: auf dem iPhone beide exakt
50 Hz mit identischen Chunk-Startzeiten, auf einem Pixel 7a dagegen 120,5 gegen 60,3 Hz (bei
angeforderten 50 — Android behandelt die Rate als Wunsch). Deshalb wird jeder Kanal aus seinen
EIGENEN `.t0`-Sidecars aufgebaut und dann auf ein gemeinsames Raster gelegt.
"""
from __future__ import annotations

import numpy as np

# Skalen des Uebertragungsformats (docs/data-format.md)
ACCEL_SCALE = 2048.0   # int16 je g
GYRO_SCALE = 1024.0    # int16 je rad/s

# Komplementaerfilter: Zeitkonstante, ab der die Schwerkraft die Fuehrung uebernimmt. 1,5 s ist
# lang genug, dass ein Pumpzyklus (rund 0,7 s) den Winkel nicht verzieht, und kurz genug, dass
# ein echter Lagewechsel nicht hinterherhinkt.
TAU_S = 1.5
# Ruhe-Erkennung fuer den Bias-Abzug und den Nullpunkt: Fenster, in denen sich fast nichts tut.
RUHE_GYRO_RADS = 0.15      # Drehrate darunter gilt als still
RUHE_ACCEL_G = 0.08        # Abweichung des Betrags von 1 g darunter gilt als still
RUHE_MIN_S = 0.5
# Nullpunkt-Bezug: Anteil des Fensters, der als „Mittelteil" gilt, wenn es keine Laeufe gibt.
MITTELTEIL = 0.6
# Ein Lauf beginnt mit dem Anschieben und endet oft im Sturz — beide Raender taugen nicht als
# Bezug. Je Seite gekuerzt, aber gedeckelt, damit von einem kurzen Lauf etwas uebrig bleibt.
LAUF_RAND_ANTEIL = 0.15
LAUF_RAND_MAX_MS = 3000.0
LAUF_REST_MIN_MS = 2000.0
# So viele Samples muss ein Bezugsbereich mindestens haben, sonst ist der Median Zufall.
BEZUG_MIN_SAMPLES = 10
# Start-Heuristik fuer die Montage-Richtung (Jan, 21.09.): „ein Start wird praktisch nie mit
# Stall beginnen koennen, man muss beim Start immer erst bergab fahren, sonst wird es ein Sturz."
# Zeigt die Rechnung am Lauf-ANFANG die Nase nach OBEN, liegt das Handy andersherum.
START_FENSTER_S = 1.0      # so lange nach dem Lauf-Start wird gemittelt
START_SCHWELLE_GRAD = 5.0  # darunter ist das Signal zu schwach fuer eine Entscheidung
# Montage-DREHUNG um die Hochachse, automatisch gesucht (s. `montage_drehung`). Nur im PUMPBAND:
# die langsame Drift beim Aufrichten des Bretts ist viel groesser als der Pumpausschlag und wuerde
# die Hauptkomponente sonst an sich ziehen.
MONTAGE_BAND_HZ = (0.6, 2.5)
MONTAGE_KLARHEIT_MIN = 3.0   # Verhaeltnis der Eigenwerte; darunter ist keine Achse zu erkennen
MONTAGE_MIN_GRAD = 10.0      # darunter lohnt das Drehen nicht, es waere nur Rauschen
MONTAGE_MIN_SAMPLES = 64     # je Laufbereich; darunter traegt er nichts zur Achse bei
MONTAGE_VORLAUF_S = 10.0     # Einschwingzeit des Filters vor dem ersten Lauf-Anfang
# Bis hierhin gelten zwei Laeufe als DIESELBE Montage (Achse mod 180). Jan, 22.09.2026:
# „innerhalb einer session wird sich das eher garnicht oder merklich stark aendern (also nur bei
# verrutschen)". Genau so sehen die Daten aus: #9528 Lauf 0 gegen die ganze Aufnahme 0,0°,
# #9535 zwischen seinen beiden Laeufen 3,0°. Das ist Rechen-Rauschen. Ein echtes Verrutschen
# waere ein Sprung, kein Driften — dazwischen gibt es nichts, was man sinnvoll mitteln koennte.
MONTAGE_GLEICH_GRAD = 25.0
# GEGENPROBE DES GIERENS AM GPS-KURS (Jan, 21.09.: „das Gieren muesste aus dem GPS-Track auch
# eindeutig ableitbar sein"). Kurs ueber Grund und Gieren sind DIESELBE Groesse, nicht ein
# Stellvertreter — damit laesst sich das Vorzeichen belegen statt herleiten.
GIER_GPS_FENSTER_S = 4.0       # Vergleichsfenster; 1 s waere bei 1-Hz-GPS fast nur Rauschen
GIER_GPS_MIN_TEMPO = 2.5       # m/s; darunter ist der Kurs aus zwei GPS-Punkten bedeutungslos
GIER_GPS_MIN_PUNKTE = 60       # Stuetzstellen auf dem Rechenraster
GIER_GPS_MIN_KURS_GRAD = 15.0  # so weit muss sich der Kurs ueberhaupt drehen (Spannweite)
GIER_GPS_MIN_R = 0.6           # erst ab dieser Korrelation wird dem Ergebnis geglaubt
# Hub: oberes Ende des Bandes. Ueber 4 Hz gibt es keine Brettbewegung mehr, nur noch Rauschen
# und Schlaege vom Wasser — die wuerden zweimal integriert nur die Kurve verwackeln.
HUB_OBEN_HZ = 4.0
G_MS2 = 9.80665
# Unter dieser Fensterzahl ist die Frequenzaufloesung zu grob: passt das Fenster nicht mehrfach
# in den Lauf, schneidet die untere Bandgrenze das Nutzsignal mit weg.
HUB_MIN_FENSTER = 3.0
# Langsamer als das pumpt niemand — darunter ist es Drift, Welle oder das Aufrichten des Bretts.
# Gilt fuer den gemeldeten Takt und fuer die Wahl des Hub-Fensters, NICHT fuer die Frage, ob der
# Hub belastbar ist (dort zaehlt, was tatsaechlich durchs Band kam).
PUMP_UNTEN_HZ = 0.5


def zeitachse(t0_ms: dict[int, int], laengen: dict[int, int]) -> np.ndarray:
    """Zeitachse in ms aus den Chunk-Startzeiten, gleichmaessig INNERHALB jedes Chunks.

    Genau das Verfahren, das `timebase.py` fuer den Accel benutzt (`exact_chunks`): die Dauer
    eines Chunks ergibt sich aus dem Abstand zum naechsten Start, nicht aus einer angesagten
    Rate. Fuer den LETZTEN Chunk gibt es keinen Nachfolger — dort wird die Rate des vorletzten
    fortgeschrieben.
    """
    idx = sorted(set(t0_ms) & set(laengen))
    if not idx:
        return np.empty(0)
    stuecke = []
    letzte_dt = None
    for k, i in enumerate(idx):
        n = laengen[i]
        if n <= 0:
            continue
        if k + 1 < len(idx):
            dauer = t0_ms[idx[k + 1]] - t0_ms[i]
            if dauer > 0:
                letzte_dt = dauer / n
        dt = letzte_dt if letzte_dt else 20.0     # 50 Hz als letzter Rueckfall
        stuecke.append(t0_ms[i] + np.arange(n) * dt)
    return np.concatenate(stuecke) if stuecke else np.empty(0)


def _wickel(grad: np.ndarray | float):
    """Winkel auf (-180, 180] bringen.

    NOETIG, weil der Komplementaerfilter sonst ueber den Sprung hinauslaeuft: `arctan2` liefert
    Roll in (-180, 180], die integrierte Drehrate kennt diese Grenze nicht. Ohne das Wickeln kam
    in einer echten Aufnahme (#9423, Handy in der Tasche) ein Roll von 257° heraus — der Filter
    hat am Sprung in die falsche Richtung zurueckgezogen, statt den kuerzeren Weg zu nehmen.
    """
    return (np.asarray(grad) + 180.0) % 360.0 - 180.0


def _tiefpass(werte: np.ndarray, t_s: np.ndarray, tau: float) -> np.ndarray:
    """Exponentielle Glaettung auf einer UNGLEICHMAESSIGEN Zeitachse (Spalten einzeln)."""
    aus = np.empty_like(werte)
    aus[0] = werte[0]
    dt = np.diff(t_s, prepend=t_s[0])
    for i in range(1, len(werte)):
        a = 1.0 - np.exp(-max(dt[i], 1e-6) / tau)
        aus[i] = aus[i - 1] + a * (werte[i] - aus[i - 1])
    return aus


def ruhe_maske(acc_g: np.ndarray, gyr: np.ndarray) -> np.ndarray:
    """Wo liegt das Geraet praktisch still? Grundlage fuer Bias-Abzug und Nullpunkt."""
    betrag = np.linalg.norm(acc_g, axis=1)
    return (np.abs(betrag - 1.0) < RUHE_ACCEL_G) & (np.linalg.norm(gyr, axis=1) < RUHE_GYRO_RADS)


def laufbereiche(segmente: list[dict], trim_offset_ms: int = 0) -> list[tuple[float, float]]:
    """Zeitbereiche der erkannten Laeufe in SESSION-ms, an den Raendern gekuerzt.

    Die gespeicherten Segmente sind auf den Trim re-based (docs/DATA-PIPELINE.md) — ohne den
    Offset liegt das Fenster daneben. `t_*_session_ms` traegt die Session-ms schon fertig.
    """
    aus: list[tuple[float, float]] = []
    for g in segmente:
        try:
            a = float(g.get("t_start_session_ms", float(g["t_start_ms"]) + trim_offset_ms))
            b = float(g.get("t_end_session_ms", float(g["t_end_ms"]) + trim_offset_ms))
        except (KeyError, TypeError, ValueError):
            continue
        if b <= a:
            continue
        rand = min(LAUF_RAND_ANTEIL * (b - a), LAUF_RAND_MAX_MS)
        if (b - a) - 2 * rand >= LAUF_REST_MIN_MS:
            a, b = a + rand, b - rand
        aus.append((a, b))
    return aus


def _bezugsrichtung(acc_raw: np.ndarray, t_ms: np.ndarray,
                    bereiche: list[tuple[float, float]]) -> np.ndarray | None:
    """Mittlere Schwerkraftrichtung in den Bereichen — komponentenweiser MEDIAN.

    Median der normierten Vektoren statt Mittelwert der Winkel: er kennt keinen ±180°-Sprung
    (deshalb auch kein `_wickel` noetig) und ein Sturz zieht ihn nicht weg. Fuer die Richtung
    reicht das; eine echte geometrische Mediane braucht es dafuer nicht.
    """
    if not bereiche or len(acc_raw) == 0:
        return None
    m = np.zeros(len(t_ms), dtype=bool)
    for a, b in bereiche:
        m |= (t_ms >= a) & (t_ms <= b)
    if m.sum() < BEZUG_MIN_SAMPLES:
        return None
    v = acc_raw[m] / ACCEL_SCALE
    v = v / np.clip(np.linalg.norm(v, axis=1, keepdims=True), 1e-6, None)
    med = np.median(v, axis=0)
    n = np.linalg.norm(med)
    return med / n if n > 1e-6 else None


def _pitch_roll(v: np.ndarray) -> tuple[float, float]:
    """Nick- und Rollwinkel einer Schwerkraftrichtung. Eine Stelle fuer beide Verwendungen."""
    return (float(np.degrees(np.arctan2(-v[0], np.hypot(v[1], v[2])))),
            float(np.degrees(np.arctan2(v[1], v[2]))))


def _bandmaske(f: np.ndarray, unten: float, oben: float) -> np.ndarray:
    """Durchlassband mit WEICHEN Raendern.

    Eine harte Kante im Frequenzbereich klingelt im Zeitbereich — das saehe wie eine Schwingung
    aus, die es nicht gibt. Deshalb an beiden Enden ein Kosinus-Uebergang statt einer Stufe.
    """
    m = np.ones(len(f))
    m[f <= 0] = 0.0
    unterer = (f > 0) & (f < unten)
    m[unterer] = 0.5 - 0.5 * np.cos(np.pi * np.clip((f[unterer] - unten / 2) / (unten / 2), 0, 1))
    oberer = f > oben
    m[oberer] = 0.5 + 0.5 * np.cos(np.pi * np.clip((f[oberer] - oben) / (0.5 * oben), 0, 1))
    return m


def hub_berechnen(a_vert_ms2: np.ndarray, dt_s: float, fenster_s: float) -> np.ndarray | None:
    """Senkrechte Auslenkung in ZENTIMETERN aus der senkrechten Beschleunigung.

    Zweimal integrieren heisst im Frequenzbereich: mit −1/ω² multiplizieren. Zusammen mit der
    Bandmaske ist das exakt und ohne Phasenverzug — der Zeitbereich braucht dafuer drei
    Hochpaesse hintereinander und bezahlt sie mit Amplitude (s. Kopfkommentar).

    None, wenn das Stueck zu kurz fuer das gewuenschte Fenster ist — lieber nichts zeigen als
    eine Kurve, die nur aus der Bandgrenze besteht.
    """
    n = len(a_vert_ms2)
    dauer = n * dt_s
    if n < 32 or dauer < HUB_MIN_FENSTER * fenster_s:
        return None
    # NUR den Mittelwert abziehen — KEINE Ausgleichsgerade. Der Versuch, zusaetzlich einen
    # linearen Trend zu entfernen, hat genau das Gegenteil bewirkt: bei einem fast-periodischen
    # Signal (29,98 statt 30 Zyklen im Fenster) findet die Ausgleichsgerade eine Steigung, und
    # die abgezogene Rampe hat ihre Energie dort, wo 1/ω² am staerksten verstaerkt. Nachgemessen
    # an einer reinen 1-Hz-Schwingung: im Band 0,2-0,4 Hz vorher 2·10⁻¹², nach dem Trendabzug 41
    # — die zurueckgerechnete Amplitude stieg dadurch bei 5-s-Fenster von 12,0 auf 16,2 cm.
    # Was tiefe Frequenzen angeht, ist die Bandmaske zustaendig, und die kann es besser.
    x = a_vert_ms2 - a_vert_ms2.mean()
    F = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, dt_s)
    w = 2 * np.pi * f
    H = np.zeros_like(F)
    nz = f > 0
    H[nz] = -F[nz] / (w[nz] ** 2)
    z = np.fft.irfft(H * _bandmaske(f, 1.0 / fenster_s, HUB_OBEN_HZ), n)
    return z * 100.0


def hauptachse(pitch: np.ndarray, roll: np.ndarray) -> tuple[float, float]:
    """Um welchen Winkel liegt das Geraet um die SENKRECHTE gedreht? Plus: wie klar ist das?

    NUR DIAGNOSE, es wird nichts damit gerechnet — aber die Zahl beantwortet die Frage, die
    beim ersten echten Lauf ansteht: liegt das Handy laengs, quer oder diagonal auf dem Brett?

    Der Nullpunkt hilft hier NICHT. Er faengt ab, wie das Geraet GENEIGT ist; eine Drehung um die
    Senkrechte dreht dagegen die Mess-ACHSEN, und das kann kein Versatz heilen. Liegt das Handy
    45° diagonal, zeigt ein reines Nicken des Bretts zu je rund 71 % als Nicken UND als Rollen.

    Zu finden ist es trotzdem ohne GPS: Pumpen ist im Kern eine NICK-Schwingung. Die Richtung,
    in der die Neigung am staerksten schwingt, ist also die Nickachse des Bretts. Das ist die
    Hauptkomponente der Punktwolke (Nicken, Rollen) — nachgerechnet an einer Aufnahme, in die
    45° hineingedreht wurden: gefunden wurden -45,0°.

    Das Ergebnis ist eine ACHSE, keine Richtung — der Eigenvektor zeigt beliebig in die eine oder
    andere Haelfte. Darum auf (-90°, 90°] gefaltet: 0° = laengs, ±90° = quer, dazwischen
    diagonal. Die verbleibende 180°-Zweideutigkeit (Nase vorn oder hinten) dreht nur das
    VORZEICHEN des Nickens und braucht das GPS. Und die Annahme „Nicken dominiert" gilt fuer eine
    Pump-Strecke — beim Carven nicht. `klarheit` sagt, wie sehr man der Zahl trauen darf.
    """
    X = np.column_stack([pitch - pitch.mean(), roll - roll.mean()])
    if len(X) < 8:
        return 0.0, 0.0
    w, v = np.linalg.eigh(np.cov(X.T))
    haupt = v[:, int(np.argmax(w))]
    winkel = float(np.degrees(np.arctan2(haupt[1], haupt[0])))
    winkel = (winkel + 90.0) % 180.0 - 90.0        # Achse, nicht Richtung -> auf (-90, 90]
    klarheit = float(max(w) / max(min(w), 1e-9))
    return round(winkel, 1), round(min(klarheit, 999.0), 1)


def kurs_aus_gps(gps: list | None) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Kurs ueber Grund (Grad, 0 = Nord, im Uhrzeigersinn) + Tempo aus der GPS-Spur.

    `gps` ist die Rohliste aus `storage.load_gps`: [t_ms, lat, lon, speed, hr, h_acc]. Das
    Tempo-Feld wird NICHT benutzt — es ist bei Android durchgaengig 0 (an #9535 geprueft);
    gerechnet wird aus den Positionen. Der Kurs kommt entwickelt (`unwrap`) zurueck, sonst
    springt eine Nordfahrt staendig um 360°.
    """
    if not gps or len(gps) < 4:
        return np.empty(0), np.empty(0), np.empty(0)
    t = np.array([r[0] for r in gps], dtype=float)
    la = np.array([r[1] for r in gps], dtype=float)
    lo = np.array([r[2] for r in gps], dtype=float)
    if not np.all(np.diff(t) > 0):
        ord_ = np.argsort(t)
        t, la, lo = t[ord_], la[ord_], lo[ord_]
        behalt = np.concatenate([[True], np.diff(t) > 0])
        t, la, lo = t[behalt], la[behalt], lo[behalt]
        if len(t) < 4:
            return np.empty(0), np.empty(0), np.empty(0)
    # Lokale Meter reichen: ueber einen Lauf sind das ein paar hundert Meter, die Kruemmung der
    # Erde traegt dort nichts bei.
    x = (lo - lo.mean()) * 111320.0 * np.cos(np.radians(la.mean()))
    y = (la - la.mean()) * 110540.0
    dx = np.gradient(x, t / 1000.0)
    dy = np.gradient(y, t / 1000.0)
    return t, np.degrees(np.unwrap(np.arctan2(dx, dy))), np.hypot(dx, dy)


def gier_gegen_gps(t_ms: np.ndarray, gier_delta_deg: np.ndarray, fenster_s: float,
                   gps: list | None,
                   ref_bereiche_ms: list[tuple[float, float]]) -> dict | None:
    """Vergleicht unser Gieren mit der Kursaenderung aus dem Track. None, wenn zu duenn.

    WOZU: das Vorzeichen des Gierens laesst sich nicht aus der Zeichnung ablesen und nicht aus
    der Physik raten — wohl aber MESSEN. Faehrt man eine Rechtskurve, waechst der Kurs ueber
    Grund; dreht unsere Zahl dabei in die andere Richtung, ist sie gespiegelt.

    Verglichen wird die Aenderung ueber DASSELBE Fenster, an denselben Zeitpunkten, und nur dort,
    wo der Kurs ueberhaupt etwas bedeutet: im Lauf und oberhalb von `GIER_GPS_MIN_TEMPO`. Die
    Steigung liegt nicht bei genau 1 — das Brett dreht sich beim Carven staerker, als die Spur es
    zeigt (Drift), und 1-Hz-GPS verschmiert schnelle Kurven. Das VORZEICHEN ist die Aussage, der
    Betrag nur ein Plausibilitaetsmass.
    """
    t_gps, kurs, tempo = kurs_aus_gps(gps)
    if len(t_gps) < 4 or len(t_ms) < 8:
        return None
    hz = (len(t_ms) - 1) * 1000.0 / max(t_ms[-1] - t_ms[0], 1e-9)
    n = int(round(fenster_s * hz))
    if n < 1 or n >= len(t_ms):
        return None
    k_bei = np.interp(t_ms, t_gps, kurs)
    v_bei = np.interp(t_ms, t_gps, tempo)
    d_kurs = np.full(len(t_ms), np.nan)
    d_kurs[n:] = k_bei[n:] - k_bei[:-n]
    m = np.zeros(len(t_ms), dtype=bool)
    for a, b in ref_bereiche_ms:
        # Das GANZE Fenster muss im Lauf liegen, nicht nur sein Ende — sonst vergleicht man
        # eine Kursaenderung vom Anschieben mit einem Gieren aus der Fahrt.
        m |= (t_ms >= a + fenster_s * 1000.0) & (t_ms <= b)
    m &= np.isfinite(d_kurs) & (v_bei > GIER_GPS_MIN_TEMPO)
    if m.sum() < GIER_GPS_MIN_PUNKTE:
        return None
    A, B = d_kurs[m], np.asarray(gier_delta_deg, dtype=float)[m]
    spanne = float(A.max() - A.min())
    if spanne < GIER_GPS_MIN_KURS_GRAD or A.std() < 1e-6 or B.std() < 1e-6:
        return None
    return {"n": int(m.sum()),
            "kurs_spanne_deg": round(spanne, 1),
            "steigung": round(float(np.polyfit(A, B, 1)[0]), 2),
            "r": round(float(np.corrcoef(A, B)[0, 1]), 3)}


def _bandpass(x: np.ndarray, hz: float, lo: float, hi: float) -> np.ndarray:
    """Nur das Band zwischen `lo` und `hi` behalten. Ueber die FFT, also ohne Phasenverzug."""
    n = len(x)
    if n < 8 or hz <= 0:
        return x - x.mean()
    f = np.fft.rfftfreq(n, 1.0 / hz)
    X = np.fft.rfft(x - x.mean())
    X[(f < lo) | (f > hi)] = 0.0
    return np.fft.irfft(X, n)


def montage_achse_aus_kreisel(gyr_raw: np.ndarray, t_gyr_ms: np.ndarray,
                          bezug: np.ndarray | None,
                          ref_bereiche_ms: list[tuple[float, float]]) -> tuple[float, float]:
    """Montage-Achse DIREKT aus der Drehrate. Liefert (Winkel, Klarheit), Winkel auf (-90, 90].

    Jan, 21.09.2026: „das Nicken doch auch aus dem Gyro oder etwa nicht?" — richtig, und damit
    braucht die Achse den Umweg ueber den Komplementaerfilter gar nicht. Pumpen ist eine
    Nickschwingung, also eine DREHUNG um die Querachse des Bretts, und genau die misst der
    Kreisel unmittelbar. Die Richtung, in der die waagerechte Drehrate im Pumpband am staerksten
    schwingt, ist die Querachse; `hauptachse` findet sie als Hauptkomponente.

    WARUM DAS BESSER IST ALS UEBER DIE WINKEL: der Umweg kostet jeden Fehler des Filters — die
    Schwerkraftrichtung ist beim Pumpen von der Bewegung dominiert, der Bezug ist geschaetzt, und
    beides faerbt auf die Winkel ab. Die Drehrate hat davon nichts. Nachgemessen an Jans beiden
    Aufnahmen: dasselbe Ergebnis auf 0,9° bzw. 1,1° genau, aber mit 14,5 statt 7,4 (#9535) und
    20,8 statt 6,9 (#9528) doppelt bis viermal so klar aus dem Rauschen gehoben.

    Die Kanaele kommen in derselben Zuordnung wie in `lage_berechnen` (Nickrate = y, Rollrate =
    x), damit der Winkel dieselbe Bedeutung hat wie der aus `hauptachse(pitch, roll)`.

    `bezug` ist die mittlere Schwerkraftrichtung waehrend der Laeufe; sie richtet „waagerecht"
    aus, bevor projiziert wird. Ohne sie wuerde bei einem stark geneigt klebenden Geraet ein Teil
    des GIERENS in die Querachse lecken. None = ungedreht nehmen.
    """
    if len(gyr_raw) < 8 or len(t_gyr_ms) != len(gyr_raw) or not ref_bereiche_ms:
        return 0.0, 0.0
    hz = (len(t_gyr_ms) - 1) * 1000.0 / max(t_gyr_ms[-1] - t_gyr_ms[0], 1e-9)
    if hz < 2 * MONTAGE_BAND_HZ[1]:      # unter Nyquist des Pumpbands ist nichts zu holen
        return 0.0, 0.0
    g = gyr_raw / GYRO_SCALE
    if bezug is not None:
        g = g @ _dreh_auf_oben(bezug).T
    lo, hi = MONTAGE_BAND_HZ
    nick, roll = [], []
    for a, b in ref_bereiche_ms:
        m = (t_gyr_ms >= a) & (t_gyr_ms <= b)
        if m.sum() < MONTAGE_MIN_SAMPLES:
            continue
        # Je Laufbereich einzeln gefiltert, dann aneinandergehaengt — der Sprung zwischen zwei
        # Laeufen ist kein Signal (s. `aufnahme_eigenschaften`).
        nick.append(_bandpass(g[m, 1], hz, lo, hi))
        roll.append(_bandpass(g[m, 0], hz, lo, hi))
    if not nick:
        return 0.0, 0.0
    return hauptachse(np.concatenate(nick), np.concatenate(roll))


def aufnahme_eigenschaften(acc_raw: np.ndarray, t_acc_ms: np.ndarray,
                           gyr_raw: np.ndarray, t_gyr_ms: np.ndarray,
                           ref_bereiche_ms: list[tuple[float, float]],
                           lauf_starts_ms: list[float] | None,
                           gps: list | None = None,
                           rot_vorgabe: float | None = None) -> dict:
    """Alles, was zur AUFNAHME gehoert und nicht zum gezeigten Ausschnitt.

    Liefert `rot_deg` (Montage-Drehung um die Hochachse), `klarheit`, `quelle` und `gier_vz`
    (+1/-1, Gegenprobe des Gierens am GPS-Kurs) samt den Zahlen dahinter in `gier_gps`.

    WARUM EIN EIGENER DURCHGANG: wie das Handy auf dem Brett klebt, ist eine Eigenschaft der
    AUFNAHME — so wie der Nullpunkt. Rechnet man es aus dem gerade gezeigten Ausschnitt, steht
    das Brett je nach ausgewaehltem Lauf anders im Bild. An #9484 belegt: Lauf 0 entschied sich
    fuer 0°, Lauf 1 fuer 180°, dasselbe Handy in derselben Aufnahme.

    DIE MONTAGE-DREHUNG war bis 21.09. Handarbeit: ein Admin stellte je Aufnahme 0/90/180/270
    ein. Jan hat das Handy an zwei Nachmittagen dreimal verschieden angeklebt — quer (#9528),
    diagonal (#9535) — und diagonal laesst sich mit Vierteldrehungen gar nicht geraderuecken:
    bei 45° zeigt ein reines Nicken des Bretts zu je rund 71 % als Nicken UND als Rollen.
    Gesucht wird in zwei Schritten:

    1. DIE ACHSE — aus der DREHRATE, nicht aus den Winkeln (s. `montage_achse_aus_kreisel`). Pumpen
       ist eine Nickschwingung, also eine Drehung um die Querachse, und die misst der Kreisel
       unmittelbar. Nur im PUMPBAND gesucht: ueber einen ganzen Lauf ist die langsame Drift
       (Aufrichten, Welle, Kurve) um ein Vielfaches groesser als der Pumpausschlag und zoege die
       Hauptkomponente zu sich. Ohne Kreisel (Altbestand) bleibt der Umweg ueber die fertigen
       Winkel — dasselbe Verfahren, nur unschaerfer.
    2. DIE RICHTUNG. Die Achse ist auf (-90°, 90°] gefaltet, sie weiss nicht, ob die Nase vorn
       oder hinten liegt. Das entscheidet die Start-Heuristik (s. `START_SCHWELLE_GRAD`): am
       Lauf-Anfang faehrt man bergab. Sie wird NACH der Achsen-Drehung gerechnet, denn erst dann
       ist „Nicken" wirklich das Nicken des Bretts.

    DAS GIEREN wird am Track gegengeprueft (s. `gier_gegen_gps`). Die Rechnung liefert es im
    Rechtssystem, also positiv nach LINKS; nach aussen gilt die Flieger-Konvention „positiv =
    nach rechts", passend zum Rollen (positiv = nach rechts) und zum Kurs ueber Grund. Weil das
    eine Eigenschaft des UEBERTRAGUNGSFORMATS ist und nicht der Aufnahme, ist das fest
    eingebaut — die Gegenprobe kehrt es nur um, wenn eine Aufnahme dem DEUTLICH widerspricht
    (`GIER_GPS_MIN_R`). Genau das faengt eine kuenftige Plattform ab, die ihren Kreisel
    spiegelverkehrt schreibt, ohne dass es jemandem auffallen muesste.
    """
    leer = {"rot_deg": 0.0 if rot_vorgabe is None else float(rot_vorgabe),
            "klarheit": None, "quelle": "manuell" if rot_vorgabe is not None else "keine",
            "gier_vz": 1, "gier_gps": None}
    if not ref_bereiche_ms:
        return leer
    starts = [float(x) for x in (lauf_starts_ms or [])]
    von = min([a for a, _ in ref_bereiche_ms] + starts)
    bis = max(b for _, b in ref_bereiche_ms)
    # Vorlauf, damit der Komplementaerfilter eingeschwungen ist, bevor der erste Lauf anfaengt:
    # faengt das Fenster GENAU am Lauf-Start an, ist die erste Sekunde der Einschwingvorgang und
    # nicht die Lage (an #9535 gemessen: -19,0° statt -6,1°) — und genau die erste Sekunde ist
    # es, auf die sich die Start-Heuristik stuetzt.
    von -= MONTAGE_VORLAUF_S * 1000.0

    def _pass(rot: float) -> dict:
        # `_roh=True`: das sind die Durchgaenge, die die Eigenschaften erst SUCHEN — sie duerfen
        # nicht zurueckrufen. Das Gier-Fenster ist hier das der GPS-Gegenprobe, nicht das der
        # Anzeige; auf Nicken und Rollen hat es keinen Einfluss.
        return lage_berechnen(acc_raw, t_acc_ms, gyr_raw, t_gyr_ms, ziel_hz=20.0,
                              yaw_fenster_s=GIER_GPS_FENSTER_S,
                              t_von_ms=von, t_bis_ms=bis, ref_bereiche_ms=ref_bereiche_ms,
                              rot_deg=rot, _roh=True)

    # Die Achse braucht keinen Durchgang: sie kommt direkt aus der Drehrate. Der Bezug ist
    # derselbe wie in `lage_berechnen`, damit „waagerecht" dasselbe heisst.
    bezug = _bezugsrichtung(acc_raw, t_acc_ms, ref_bereiche_ms)
    achse, klarheit = montage_achse_aus_kreisel(gyr_raw, t_gyr_ms, bezug, ref_bereiche_ms)

    erg = _pass(0.0 if rot_vorgabe is None else float(rot_vorgabe))
    if not erg.get("ok"):
        return leer

    # --- Gieren gegen den Track. Unabhaengig von der Montage: eine Drehung um die Hochachse
    #     laesst das Gieren unberuehrt, deshalb zaehlt hier schon der erste Durchgang.
    gps_pruef = gier_gegen_gps(np.asarray(erg["t_ms"], dtype=float),
                               np.asarray(erg["gier_delta_deg"], dtype=float),
                               GIER_GPS_FENSTER_S, gps, ref_bereiche_ms)
    gier_vz = 1
    if gps_pruef and abs(gps_pruef["r"]) >= GIER_GPS_MIN_R and gps_pruef["steigung"] < 0:
        gier_vz = -1

    if rot_vorgabe is not None:
        return {"rot_deg": float(rot_vorgabe), "klarheit": None, "quelle": "manuell",
                "gier_vz": gier_vz, "gier_gps": gps_pruef}

    t = np.asarray(erg["t_ms"], dtype=float)
    pitch = np.asarray(erg["pitch_deg"], dtype=float)
    if klarheit < MONTAGE_KLARHEIT_MIN:
        # RUECKFALL ohne (brauchbaren) Kreisel: dieselbe Hauptkomponente, aber auf den fertigen
        # Winkeln. Kostet jeden Fehler des Filters und ist entsprechend unschaerfer — an Jans
        # Aufnahmen Klarheit 7 statt 15-21 — aber fuer eine Aufnahme ohne Drehrate ist es das
        # Einzige, was es gibt.
        hz = float(erg["hz"])
        lo, hi = MONTAGE_BAND_HZ
        stueck_p, stueck_r = [], []
        roll = np.asarray(erg["roll_deg"], dtype=float)
        for a, b in ref_bereiche_ms:
            m = (t >= a) & (t <= b)
            if m.sum() < MONTAGE_MIN_SAMPLES:
                continue
            stueck_p.append(_bandpass(pitch[m], hz, lo, hi))
            stueck_r.append(_bandpass(roll[m], hz, lo, hi))
        if stueck_p:
            achse, klarheit = hauptachse(np.concatenate(stueck_p), np.concatenate(stueck_r))

    rot = 0.0
    teile = []
    if klarheit >= MONTAGE_KLARHEIT_MIN and abs(achse) >= MONTAGE_MIN_GRAD:
        rot = float(achse)
        teile.append("achse")
        erg = _pass(rot)
        if not erg.get("ok"):
            return leer
        t = np.asarray(erg["t_ms"], dtype=float)
        pitch = np.asarray(erg["pitch_deg"], dtype=float)

    start_nicken = startlage(pitch, t, starts or None)
    if start_nicken is not None and abs(start_nicken) >= START_SCHWELLE_GRAD:
        teile.append("heuristik")
        if start_nicken > 0:
            rot = (rot + 180.0) % 360.0
    return {"rot_deg": round(rot, 1), "klarheit": klarheit,
            "quelle": "+".join(teile) or "keine",
            "gier_vz": gier_vz, "gier_gps": gps_pruef}


def startlage(pitch: np.ndarray, t_ms: np.ndarray,
              lauf_starts_ms: list[float] | None) -> float | None:
    """Mittleres Nicken in der ersten Sekunde der Laeufe. None, wenn es keine Laeufe gibt.

    Grundlage der Richtungs-Heuristik (s. `START_FENSTER_S`): am Anfang eines Laufs faehrt man
    BERGAB — anders kommt man nicht auf Geschwindigkeit, mit der Nase nach oben endet es im
    Sturz. Kommt hier ein deutlich POSITIVER Wert heraus, ist nicht die Physik falsch, sondern
    die Blickrichtung: das Handy liegt um 180° gedreht auf dem Brett.

    Je Lauf gemittelt und dann ueber die Laeufe, nicht ueber alle Samples zusammen — sonst
    bestimmt der laengste Lauf das Ergebnis allein.
    """
    if not lauf_starts_ms:
        return None
    werte = []
    for a in lauf_starts_ms:
        m = (t_ms >= a) & (t_ms <= a + START_FENSTER_S * 1000.0)
        if m.sum() >= 3:
            werte.append(float(pitch[m].mean()))
    return float(np.mean(werte)) if werte else None


def _dreh_auf_oben(bezug: np.ndarray) -> np.ndarray:
    """Kleinste Drehung, die `bezug` auf (0,0,1) legt — Rodrigues.

    WARUM ES EINE DREHUNG SEIN MUSS und kein Abzug: Nick- und Rollwinkel sind keine Groessen,
    die man einzeln verrechnen darf. Zieht man den Montagewinkel als ZAHL ab, stimmt das nur,
    solange das Brett aufrecht liegt. Kippt es auf den Kopf, kehrt sich die gemessene Neigung
    mit um, und aus „16,5° abziehen" wird „16,5° dazu" — der Fehler verdoppelt sich.

    Belegt an #9484 (Jan, 21.09.): auf dem Steg stand das Brett kopfueber und nachweislich
    waagerecht. Die Anzeige zeigte richtig Rollen -177,6°, aber **+28,7° Nicken** — das Doppelte
    der 16,5°, mit denen das Handy schraeg auf dem Brett klebte. Nach der Drehung bleibt davon
    nichts.

    Der Sonderfall `bezug ≈ -z` (Handy mit dem Display nach unten montiert) hat keine eindeutige
    Achse; dort tut es jede senkrechte, genommen wird die x-Achse.
    """
    z = np.array([0.0, 0.0, 1.0])
    a = bezug / max(float(np.linalg.norm(bezug)), 1e-9)
    c = float(np.dot(a, z))
    if c > 1.0 - 1e-9:
        return np.eye(3)
    if c < -1.0 + 1e-9:
        return np.diag([1.0, -1.0, -1.0])      # 180° um x
    v = np.cross(a, z)
    K = np.array([[0.0, -v[2], v[1]], [v[2], 0.0, -v[0]], [-v[1], v[0], 0.0]])
    return np.eye(3) + K + K @ K * (1.0 / (1.0 + c))


def lage_berechnen(acc_raw: np.ndarray, t_acc_ms: np.ndarray,
                   gyr_raw: np.ndarray, t_gyr_ms: np.ndarray,
                   *, ziel_hz: float = 20.0, yaw_fenster_s: float = 1.0,
                   t_von_ms: float | None = None, t_bis_ms: float | None = None,
                   ref_bereiche_ms: list[tuple[float, float]] | None = None,
                   hub_fenster_s: float | None = None, rot_deg: float | None = None,
                   lauf_starts_ms: list[float] | None = None,
                   gps: list | None = None, _roh: bool = False) -> dict:
    """Pitch/Roll (absolut, in Grad) und Gierwinkel-Aenderung je Fenster (Grad).

    `acc_raw`/`gyr_raw` sind die int16-Rohwerte, `t_*_ms` die zugehoerigen Zeitachsen. Das
    Ergebnis liegt auf einem gemeinsamen Raster von `ziel_hz`.
    """
    if len(acc_raw) < 4 or len(t_acc_ms) != len(acc_raw):
        return {"ok": False, "grund": "keine Beschleunigungsdaten"}
    hat_gyro = len(gyr_raw) >= 4 and len(t_gyr_ms) == len(gyr_raw)

    von = max(t_acc_ms[0], t_gyr_ms[0]) if hat_gyro else t_acc_ms[0]
    bis = min(t_acc_ms[-1], t_gyr_ms[-1]) if hat_gyro else t_acc_ms[-1]
    if t_von_ms is not None:
        von = max(von, t_von_ms)
    if t_bis_ms is not None:
        bis = min(bis, t_bis_ms)
    if bis - von < 1000:
        return {"ok": False, "grund": "Zeitfenster zu kurz"}

    # Gemeinsames Raster. Gerechnet wird auf der NATIVEN Rate des schnelleren Kanals, nicht auf
    # der Anzeige-Aufloesung: der Pixel 7a liefert 120,5 Hz Accel und 60,3 Hz Gyro, und wer die
    # Drehrate auf 50 Hz herunterrechnet, bevor er sie integriert, verliert genau die schnellen
    # Drehungen, um die es geht. Nach oben gedeckelt, damit ein exotisches Geraet die Rechnung
    # nicht sprengt; nach unten, damit eine langsame Quelle trotzdem glatt bleibt.
    def _quellrate(t_ms: np.ndarray) -> float:
        if len(t_ms) < 2 or t_ms[-1] <= t_ms[0]:
            return 0.0
        return (len(t_ms) - 1) * 1000.0 / (t_ms[-1] - t_ms[0])
    quell_hz = max(_quellrate(t_acc_ms), _quellrate(t_gyr_ms) if hat_gyro else 0.0)
    rechen_hz = float(min(200.0, max(ziel_hz, 50.0, quell_hz)))
    t = np.arange(von, bis, 1000.0 / rechen_hz)
    if len(t) < 4:
        return {"ok": False, "grund": "Zeitfenster zu kurz"}

    acc = np.column_stack([np.interp(t, t_acc_ms, acc_raw[:, j] / ACCEL_SCALE) for j in range(3)])
    if hat_gyro:
        gyr = np.column_stack([np.interp(t, t_gyr_ms, gyr_raw[:, j] / GYRO_SCALE) for j in range(3)])
    else:
        gyr = np.zeros_like(acc)

    # MONTAGE-DREHUNG um die Hochachse (s. `models.Session.attitude_rot_deg`). Gedreht wird die
    # Messung, nicht das Ergebnis: danach rechnet alles weiter, als laege das Geraet laengs mit
    # der Nase nach vorn. Bei 180° laeuft es auf „x und y umdrehen" hinaus, genau das Noetige,
    # wenn das Handy andersherum auf dem Brett klebt.
    # None = automatisch. Fuer die Rechnung zunaechst ungedreht; die 0-gegen-180-Frage laesst
    # sich danach exakt am Ergebnis entscheiden, weil eine 180°-Drehung um die Hochachse nichts
    # weiter tut, als Nicken und Rollen umzukehren (Gieren und Hub bleiben, wie sie sind).
    auto = rot_deg is None
    rot_wirksam = 0.0 if auto else float(rot_deg)
    achse_klarheit = None
    rot_quelle = "manuell"
    gier_vz, gier_gps = 1, None
    if not _roh:
        # Montage-Drehung und Gier-Vorzeichen kommen ueber ALLE Laufbereiche und sind damit
        # unabhaengig vom gezeigten Ausschnitt (s. `aufnahme_eigenschaften`). `_roh` markiert
        # die Durchgaenge, die genau das erst ermitteln.
        _eig = aufnahme_eigenschaften(acc_raw, t_acc_ms, gyr_raw, t_gyr_ms,
                                      ref_bereiche_ms or [], lauf_starts_ms, gps,
                                      rot_vorgabe=None if auto else float(rot_deg))
        gier_vz, gier_gps = _eig["gier_vz"], _eig["gier_gps"]
        if auto:
            rot_wirksam = _eig["rot_deg"]
            achse_klarheit, rot_quelle = _eig["klarheit"], _eig["quelle"]
    if rot_wirksam:
        w = np.radians(rot_wirksam)
        c, sn = np.cos(w), np.sin(w)
        for v in (acc, gyr):
            x, y = v[:, 0].copy(), v[:, 1].copy()
            v[:, 0] = x * c - y * sn
            v[:, 1] = x * sn + y * c

    # BEZUG ALS DREHUNG statt als Abzug (s. `_dreh_auf_oben`). Er kommt aus den ROHEN Samples der
    # Laufbereiche und muss die Montage-Drehung von oben mitgemacht haben, sonst zeigt er in eine
    # andere Richtung als die Messung.
    bezug = _bezugsrichtung(acc_raw, t_acc_ms, ref_bereiche_ms or [])
    null_quelle = "laeufe"
    if bezug is None:
        # Kein Lauf erkannt: der Mittelteil des Fensters. Aufbauen und Einpacken liegen aussen,
        # der Sturz meist am Ende — was bleibt, ist das Brauchbarste ohne Erkennung.
        rand = (1.0 - MITTELTEIL) / 2.0 * (bis - von)
        bezug = _bezugsrichtung(acc_raw, t_acc_ms, [(von + rand, bis - rand)])
        null_quelle = "mittelteil"
    if bezug is None:
        bezug = acc.mean(axis=0)
        bezug = bezug / max(float(np.linalg.norm(bezug)), 1e-9)
        null_quelle = "fenster"
    if rot_wirksam:
        _w = np.radians(rot_wirksam); _c, _s = np.cos(_w), np.sin(_w)
        bezug = np.array([bezug[0] * _c - bezug[1] * _s, bezug[0] * _s + bezug[1] * _c, bezug[2]])
    null_p, null_r = _pitch_roll(bezug)     # nur Auskunft: wie schief das Geraet auf dem Brett klebt
    _R = _dreh_auf_oben(bezug)
    acc = acc @ _R.T
    gyr = gyr @ _R.T

    t_s = t / 1000.0
    still = ruhe_maske(acc, gyr)
    # Bias aus den Ruhephasen. Ohne ihn laeuft die Gier-Integration mit rund 1°/s weg.
    bias = gyr[still].mean(axis=0) if still.sum() > RUHE_MIN_S * rechen_hz else np.zeros(3)
    gyr = gyr - bias

    # Schwerkraftrichtung fuer die GIER-PROJEKTION: dort wird eine ruhige Achse gebraucht,
    # also geglaettet.
    g_vec = _tiefpass(acc, t_s, TAU_S)
    g_hut = g_vec / np.clip(np.linalg.norm(g_vec, axis=1, keepdims=True), 1e-6, None)

    # Pitch/Roll dagegen aus dem ROHEN Beschleunigungsvektor. Zuerst stand hier der geglaettete —
    # das waren ZWEI hintereinandergeschaltete Traegheiten mit je TAU_S, und ein Neigungssprung
    # von 20° brauchte dadurch acht Sekunden statt drei. Das Glaetten ist Aufgabe des
    # Komplementaerfilters selbst: er nimmt je Schritt nur (1-alpha) des Messwerts, das IST der
    # Tiefpass. Nachgerechnet an einem Sprungsignal: vorher 15,0° nach 4 s, jetzt 18,9°.
    a_norm = acc / np.clip(np.linalg.norm(acc, axis=1, keepdims=True), 1e-6, None)
    pitch_a = np.degrees(np.arctan2(-a_norm[:, 0], np.hypot(a_norm[:, 1], a_norm[:, 2])))
    roll_a = np.degrees(np.arctan2(a_norm[:, 1], a_norm[:, 2]))
    # Dieselbe Rechnung wie `_pitch_roll`, nur vektorisiert — bewusst nebeneinander: ueber
    # 400.000 Samples ist die Schleifenvariante keine Option.

    # Komplementaerfilter: Kreisel treibt, Schwerkraft zieht zurueck.
    dt = np.diff(t_s, prepend=t_s[0])
    alpha = np.exp(-dt / TAU_S)
    pitch = np.empty(len(t)); roll = np.empty(len(t))
    pitch[0], roll[0] = pitch_a[0], roll_a[0]
    p_rate = np.degrees(gyr[:, 1])
    r_rate = np.degrees(gyr[:, 0])
    for i in range(1, len(t)):
        # Ueber die DIFFERENZ mischen, nicht ueber die Absolutwerte: nur so nimmt der Filter am
        # ±180°-Sprung den kurzen Weg (s. `_wickel`).
        p_vor = pitch[i - 1] + p_rate[i] * dt[i]
        r_vor = roll[i - 1] + r_rate[i] * dt[i]
        pitch[i] = _wickel(p_vor + (1 - alpha[i]) * _wickel(pitch_a[i] - p_vor))
        roll[i] = _wickel(r_vor + (1 - alpha[i]) * _wickel(roll_a[i] - r_vor))

    # Senkrechte Beschleunigung fuer den Hub. Die Richtung „oben" kommt aus der GEFILTERTEN
    # Lage, nicht aus dem tiefpassgefilterten Beschleunigungsvektor: waehrend des Pumpens ist
    # der rohe Vektor von der Bewegung dominiert, der Filter traegt dagegen den Kreisel mit.
    # Hier stehen pitch/roll noch OHNE Nullpunkt, sind also die absolute Lage gegen die
    # Schwerkraft — genau das, was die Projektion braucht.
    pr, rr = np.radians(pitch), np.radians(roll)
    oben = np.column_stack([-np.sin(pr), np.cos(pr) * np.sin(rr), np.cos(pr) * np.cos(rr)])
    # Der Beschleunigungsmesser liest im Stillstand +1 g entlang „oben" — der bleibt abzuziehen.
    a_vert = (np.einsum("ij,ij->i", acc, oben) - 1.0) * G_MS2
    # Erster Durchgang mit dem Vorgabewert; steht `hub_fenster_s` auf None, wird er unten
    # anhand des gemessenen Pumptakts noch einmal gerechnet.
    hub = hub_berechnen(a_vert, 1.0 / rechen_hz, hub_fenster_s or 3.0)

    # Gierrate = Drehratenvektor auf die Schwerkraft projiziert (s. Kopfkommentar).
    # VORZEICHEN: die Projektion liefert das Rechtssystem, also positiv nach LINKS. Nach aussen
    # gilt „positiv = nach RECHTS" — dieselbe Richtung wie beim Rollen (positiv = nach rechts)
    # und wie beim Kurs ueber Grund, der im Uhrzeigersinn waechst. Belegt am GPS: ueber #9528
    # und #9535 lag die Steigung Gieren/Kursaenderung vor dieser Umkehr bei -0,7 bis -1,1
    # (r bis -0,85), also spiegelverkehrt. `gier_vz` kann das je Aufnahme noch einmal umkehren,
    # falls eine Plattform ihren Kreisel andersherum schreibt (s. `aufnahme_eigenschaften`).
    gier_rate = -gier_vz * np.degrees(np.einsum("ij,ij->i", gyr, g_hut))
    # Aenderung ueber das gleitende Fenster: Integral, dann Differenz zweier Stuetzstellen.
    integral = np.concatenate([[0.0], np.cumsum(gier_rate[1:] * dt[1:])])
    schritte = max(1, int(round(yaw_fenster_s * rechen_hz)))
    gier_delta = np.zeros(len(t))
    gier_delta[schritte:] = integral[schritte:] - integral[:-schritte]

    # KEIN Abzug des Nullpunkts mehr — er steckt seit 21.09. als DREHUNG in `acc`/`gyr`
    # (s. `_dreh_auf_oben` weiter oben). `null_p`/`null_r` stehen nur noch als Auskunft.

    # Richtungs-Heuristik. Erst HIER, weil sie den fertigen, auf den Nullpunkt bezogenen Winkel
    # braucht. Das Umkehren ist exakt und nicht genaehert: eine 180°-Drehung um die Hochachse
    # negiert Nicken und Rollen, sonst nichts.
    def hauptfrequenz(sig: np.ndarray, unten: float = 0.3, oben: float = 4.0) -> float | None:
        s0 = sig - sig.mean()
        if len(s0) < 32:
            return None
        f = np.fft.rfftfreq(len(s0), 1.0 / rechen_hz)
        A = np.abs(np.fft.rfft(s0))
        m = (f > unten) & (f < oben)
        return round(float(f[m][np.argmax(A[m])]), 2) if m.any() else None

    # HUB-FENSTER AM PUMPTAKT AUSRICHTEN, nicht an einer festen Zahl.
    #
    # Der Hub kommt aus zweimaligem Integrieren; alles unterhalb der Bandgrenze wird dabei
    # gnadenlos verstaerkt. Ein festes 3-s-Fenster (Grenze 0,33 Hz) ist fuer Pumpen bei 1,3 Hz
    # viel zu weit: an Jans erster echter Pump-Aufnahme (#9528, 21.09.) kamen damit 52,8 cm
    # heraus, mit 1 s dagegen 20,2 cm — und nur die zweite Zahl ist physikalisch plausibel.
    # Also die Grenze auf die HAELFTE des gemessenen Takts legen: bei 1,33 Hz sind das 1,5 s.
    # Gedeckelt, damit weder ein Ausreisser noch eine fehlende Messung Unsinn ergibt.
    # GEMESSEN WIRD IM LAUF, NICHT IM GEZEIGTEN AUSSCHNITT (Jan, 22.09.2026: „erscheint nur wenn
    # ich 'all' anzeige, nicht wenn ich einen Lauf auswaehle").
    #
    # Der Pumptakt ist eine Eigenschaft des FAHRENS — dasselbe Prinzip, nach dem schon der
    # Nullpunkt und die Montage-Drehung aus den Laufbereichen kommen und nicht aus dem Bild.
    # Ueber die ganze Aufnahme gerechnet gewinnt das, was dazwischen passiert: Rauspaddeln,
    # Stehen, Zuruecklaufen. An #9535 (25 min, 2 Laeufe) nachgemessen:
    #
    #     ganze Aufnahme   Takt 0,58 Hz -> Fenster 3,45 s -> Hub 15,9 cm bei 0,30 Hz  UNSICHER
    #     Lauf 0           Takt 1,41 Hz -> Fenster 1,42 s -> Hub 18,1 cm bei 1,41 Hz  sicher
    #     Lauf 1           Takt 1,38 Hz -> Fenster 1,45 s -> Hub 19,5 cm bei 1,38 Hz  sicher
    #
    # Die Warnung hatte also recht — ueber die ganze Aufnahme WAR die Zahl wertlos. Nur war das
    # keine Eigenschaft der Fahrt, sondern der Fragestellung: 25 Minuten Hub zu mitteln, von
    # denen 21 nicht gefahren wurden, ergibt keine Groesse, die jemand wissen will. Deshalb
    # messen wir jetzt auf den Laufbereichen INNERHALB des Fensters; gezeichnet wird weiter alles.
    #
    # Liegt kein Laufbereich im Fenster (Aufnahme ohne erkannten Lauf), bleibt es beim ganzen
    # Ausschnitt — dann ist die Warnung wieder das, wofuer sie gedacht war.
    _lauf_maske = np.zeros(len(t), dtype=bool)
    for _a, _b in (ref_bereiche_ms or []):
        _lauf_maske |= (t >= _a) & (t <= _b)
    # Fuer die FFT ein zusammenhaengendes Stueck — der Sprung zwischen zwei Laeufen waere ein
    # Signal, das niemand gefahren ist. Genommen wird der laengste Lauf im Fenster.
    _laengster = None
    for _a, _b in (ref_bereiche_ms or []):
        _m = (t >= _a) & (t <= _b)
        if _m.sum() >= 32 and (_laengster is None or _m.sum() > _laengster.sum()):
            _laengster = _m
    _takt_sig = pitch[_laengster] if _laengster is not None else pitch
    _hub_maske = _lauf_maske if _lauf_maske.sum() >= 32 else np.ones(len(t), dtype=bool)

    if hub_fenster_s is None:
        # AUS DEM PUMPBAND, nicht aus dem ganzen Spektrum. Ueber einem engen Ausschnitt ist die
        # groesste Amplitude im Nicken oft die langsame Drift und nicht das Pumpen: an Lauf 2 von
        # #9535 fand die Suche ab 0,3 Hz genau die 0,3 Hz, das Fenster lief in den Deckel (5 s)
        # und der Hub kam mit 37 cm statt 21 cm heraus. Mit der unteren Grenze bei PUMP_UNTEN_HZ
        # bleibt nur uebrig, was ueberhaupt ein Pumptakt sein kann.
        _takt = hauptfrequenz(_takt_sig, unten=PUMP_UNTEN_HZ)
        hub_fenster_s = float(min(5.0, max(1.0, 2.0 / _takt))) if _takt else 3.0
        hub = hub_berechnen(a_vert, 1.0 / rechen_hz, hub_fenster_s)

    # Nur noch Auskunft: die Drehung ist oben schon angewandt, das Nicken am Lauf-Anfang sollte
    # jetzt negativ sein (bergab). Bleibt es positiv, hat die Heuristik nicht gegriffen — meist,
    # weil im Fenster gar kein Lauf-Anfang liegt.
    start_nicken = startlage(pitch, t, lauf_starts_ms)

    schritt = max(1, int(round(rechen_hz / ziel_hz)))
    aus = slice(None, None, schritt)


    _hub_hz = hauptfrequenz(hub[_laengster] if _laengster is not None else hub) \
        if hub is not None else None
    # NUR ueber die Laufbereiche, nie ueber die ganze Aufnahme: ein Ueberschlag am Ende
    # ueberstimmt das Pumpen um Groessenordnungen. An #9484 belegt — ganze Aufnahme -86,1°
    # (Klarheit 19,5, in Wahrheit der Sturz), nur die Laeufe +14,0° (Klarheit 367).
    if ref_bereiche_ms:
        _m = np.zeros(len(t), dtype=bool)
        for _a, _b in ref_bereiche_ms:
            _m |= (t >= _a) & (t <= _b)
        _achse, _klar = hauptachse(pitch[_m], roll[_m]) if _m.sum() >= 8 else hauptachse(pitch, roll)
    else:
        _achse, _klar = hauptachse(pitch, roll)
    return {
        "ok": True,
        "hz": round(rechen_hz / schritt, 2),
        "rechen_hz": round(rechen_hz, 1),
        # float() ausdruecklich: numpy-Typen serialisiert FastAPI nicht.
        "quelle_hz": {"accel": round(float(_quellrate(t_acc_ms)), 1),
                      "gyro": round(float(_quellrate(t_gyr_ms)), 1) if hat_gyro else None},
        "yaw_fenster_s": yaw_fenster_s,
        "nullpunkt": null_quelle,
        "rot_deg": round(rot_wirksam, 1),
        # manuell | achse | heuristik | achse+heuristik | keine
        "rot_quelle": rot_quelle,
        # Wie deutlich die Pump-Achse aus dem Rauschen ragt (Eigenwert-Verhaeltnis). None, wenn
        # gar nicht gesucht wurde (manuelle Vorgabe).
        "rot_klarheit": achse_klarheit,
        # Gegenprobe des Gierens am GPS-Kurs: {n, kurs_spanne_deg, steigung, r}. Die Steigung
        # sollte positiv sein (beide drehen gleich herum); None, wenn zu wenig Kurven im Lauf
        # liegen oder keine Spur da ist. `gier_umgekehrt` sagt, ob sie das Vorzeichen gedreht hat.
        "gier_gps": gier_gps,
        "gier_umgekehrt": gier_vz < 0,
        # Mittleres Nicken in der ersten Sekunde der Laeufe, NACH der Drehung. Sollte negativ
        # sein (bergab); ein positiver Wert heisst, dass die Heuristik nicht greifen konnte.
        "start_nicken_deg": None if start_nicken is None else round(start_nicken, 1),
        "null_pitch_deg": round(null_p, 2),
        "null_roll_deg": round(null_r, 2),
        "hat_gyro": bool(hat_gyro),
        "t_ms": [round(float(x)) for x in t[aus]],
        "pitch_deg": [round(float(x), 2) for x in pitch[aus]],
        "roll_deg": [round(float(x), 2) for x in roll[aus]],
        "gier_delta_deg": [round(float(x), 2) for x in gier_delta[aus]],
        "hub_cm": [round(float(x), 1) for x in hub[aus]] if hub is not None else None,
        "hub_fenster_s": hub_fenster_s,
        "kennzahlen": {
            "pitch_amplitude_deg": round(float(np.percentile(np.abs(pitch), 95)), 1),
            "roll_amplitude_deg": round(float(np.percentile(np.abs(roll), 95)), 1),
            "gier_rms_deg_s": round(float(np.sqrt(np.mean(gier_rate ** 2))), 1),
            "pitch_hz": hauptfrequenz(_takt_sig, unten=PUMP_UNTEN_HZ),
            # Hub von unten nach oben, robust gegen einzelne Ausreisser (5./95. Perzentil).
            # Auf den Laufbereichen, nicht auf dem ganzen Bild (s. `_hub_maske` oben).
            "hub_pp_cm": (round(float(np.percentile(hub[_hub_maske], 95)
                                      - np.percentile(hub[_hub_maske], 5)), 1)
                          if hub is not None else None),
            "hub_hz": _hub_hz,
            # Liegt die Bewegung zu dicht an der unteren Bandgrenze, ist die Zahl WERTLOS — und
            # zwar ohne dass man es ihr ansieht. Belegt an Jans Aufnahme 9473 (0,32 Hz von Hand
            # gewedelt): 12,9 cm bei 1-s-Fenster, 41,7 bei 3 s, 147,4 bei 5 s, 333,4 bei 8 s.
            # Das Handy hat sich nie 3,3 m bewegt — das ist die 1/ω²-Verstaerkung, die dicht an
            # der Grenze jeden Rest hochzieht.
            #
            # FAKTOR 1,5, nicht 2 (korrigiert 21.09. an der ersten echten Pump-Aufnahme #9528):
            # seit das Fenster selbst dem Pumptakt folgt (2/Takt), liegt die Bandgrenze per
            # Konstruktion bei der Haelfte des Takts — ein Faktor 2 haette dann JEDE Aufnahme
            # als unsicher gemeldet, auch die saubere. Bei #9528 (Takt 1,48 Hz, Fenster 1,35 s,
            # Hub bei 1,33 Hz) ist der Abstand zur Grenze 1,8-fach, und die 22,8 cm sind
            # physikalisch plausibel.
            "hub_sicher": bool(_hub_hz is not None and _hub_hz >= 1.5 / hub_fenster_s),
            # Wie das Geraet um die Senkrechte gedreht liegt — s. `hauptachse`. Reine Diagnose:
            # nahe 0° oder 180° heisst laengs, nahe ±90° quer, dazwischen diagonal.
            "ausrichtung_deg": _achse, "ausrichtung_klarheit": _klar,
            "ruhe_anteil": round(float(still.mean()), 3),
            "bias_abgezogen": bool(still.sum() > RUHE_MIN_S * rechen_hz),
        },
    }


def montage_je_lauf(acc_raw: np.ndarray, t_acc_ms: np.ndarray,
                    gyr_raw: np.ndarray, t_gyr_ms: np.ndarray,
                    ref_bereiche_ms: list[tuple[float, float]],
                    lauf_starts_ms: list[float] | None = None,
                    gps: list | None = None,
                    rot_vorgabe: float | None = None) -> dict:
    """NUR die Montage-Drehung je Lauf — ohne die teuren Kennzahlen.

    Herausgeloest am 23.09.2026, weil nicht nur die Lauf-Tabelle sie braucht, sondern auch die
    Lage-ANSICHT: die rechnete bis dahin immer mit der Drehung der ganzen Aufnahme, und wenn die
    nicht zu bestimmen war, mit gar keiner. Siehe `_lage_antwort`.

    -> {"je_lauf": [...], "ganze": {...}, "gruppe_rot_deg": float|None}
       `gruppe_rot_deg` ist die Drehung der groessten zusammengehoerigen Montage-Gruppe, also
       „so lag das Handy die meiste Zeit". Sie ist der beste Einzelwert fuer eine Ansicht, die
       sich auf EINEN festlegen muss — und ehrlicher als 0°, was hiesse „laengs, Nase vorn".

    Je Lauf ein vollstaendiger eigener Durchgang — inklusive eigener Montage-Drehung.

    WARUM JE LAUF NEU GERECHNET (Jan, 22.09.2026): „ich denke das handy koennte zwischen den
    laeufen auch ,verrutschen' oder eine andere ausrichtung haben, korrekt waere schon das je
    lauf neu zu rechnen." Stimmt — Klebeband auf nassem Brett, und zwischen zwei Laeufen liegt
    ein Sturz oder das Tragen zum Steg. Eine Drehung, die aus der ganzen Aufnahme gemittelt ist,
    wuerde ein echtes Verrutschen glattbuegeln und BEIDE Laeufe falsch zeigen.

    WAS DABEI ZU BEACHTEN IST, gemessen an den drei Aufnahmen mit Kreisel:

        #9528  ganze Aufnahme 269,4°   Lauf 0 269,4°                    (Klarheit 20,8)
        #9535  ganze Aufnahme 133,2°   Lauf 0 134,5°  Lauf 1 131,5°     (11,1 / 20,1)
        #9484  ganze Aufnahme 190,1°   Lauf 0  20,5°  Lauf 1 180,0°     ( 7,5 / 19,8)

    Die ACHSE ist stabil, wo das Signal klar ist: identisch bei #9528, 3° Unterschied bei #9535.
    Das ist Rechen-Rauschen, kein Verrutschen. Die 170° bei #9484 sind dagegen NICHT die Achse
    (20,5° gegen 1,3°, also 19° auseinander), sondern die 180°-Frage „Nase vorn oder hinten" —
    und die entscheidet die Start-Heuristik aus der ersten Sekunde des Laufs. Bei Lauf 1 hat sie
    gar nicht gegriffen (Quelle „heuristik" ohne Achse).

    Deshalb: die Achse kommt je Lauf aus dem Kreisel dieses Laufs, solange sie klar genug ist
    (`MONTAGE_KLARHEIT_MIN`); sonst faellt der Lauf auf die Drehung der ganzen Aufnahme zurueck.
    Die gefundene Drehung steht mit in der Antwort, damit ein echtes Verrutschen SICHTBAR wird
    statt stillschweigend eingerechnet — und ein Fehlgriff ebenso.

    Eine feste Vorgabe (`rot_vorgabe`, von Hand gesetzt) gilt fuer alle Laeufe: wer sie setzt,
    sagt damit, wie das Geraet lag.
    """
    if not ref_bereiche_ms:
        return {"je_lauf": [], "ganze": None, "gruppe_rot_deg": None}
    # Bezugswert ueber ALLE Laeufe — Rueckfall fuer Laeufe ohne eigenes klares Signal.
    ganze = aufnahme_eigenschaften(acc_raw, t_acc_ms, gyr_raw, t_gyr_ms, ref_bereiche_ms,
                                   lauf_starts_ms, gps=gps, rot_vorgabe=rot_vorgabe)
    starts = [float(x) for x in (lauf_starts_ms or [])]

    # --- Schritt 1: je Lauf die eigene Drehung suchen -----------------------------------------
    eigen: list[dict] = []
    for i, (a, b) in enumerate(ref_bereiche_ms):
        e = aufnahme_eigenschaften(acc_raw, t_acc_ms, gyr_raw, t_gyr_ms, [(a, b)],
                                   [starts[i]] if i < len(starts) else None,
                                   gps=gps, rot_vorgabe=rot_vorgabe)
        klar = e.get("klarheit")
        eigen.append({
            "rot": float(e["rot_deg"]),
            # Die ACHSE ohne die Richtungsfrage: eine 180°-Drehung ist dieselbe Achse.
            "achse": float(e["rot_deg"]) % 180.0,
            "klar": klar,
            "quelle": e["quelle"],
            # Hat die Start-Heuristik in DIESEM Lauf ueberhaupt gegriffen?
            "richtung_gemessen": "heuristik" in (e["quelle"] or ""),
            "brauchbar": klar is not None and klar >= MONTAGE_KLARHEIT_MIN,
        })

    # --- Schritt 2: gleiche Montage zusammenfassen --------------------------------------------
    # Jans Vorgabe: innerhalb einer Session aendert sich die Montage gar nicht oder deutlich.
    # Also: der klarste Lauf gibt die Achse vor, alle Laeufe in Reichweite bekommen GENAU DIESE
    # Achse (das 3°-Rauschen zwischen zwei Laeufen ist keine Information). Wer weit daneben
    # liegt, ist verrutscht — oder falsch erkannt; beides bleibt sichtbar, statt gemittelt zu
    # werden. Der Abstand wird auf dem Kreis mod 180 gemessen, sonst waeren 179° und 1° „weit".
    def _abstand(x: float, y: float) -> float:
        d = abs(x - y) % 180.0
        return min(d, 180.0 - d)

    klarste = max((e for e in eigen if e["brauchbar"]), key=lambda e: e["klar"], default=None)
    if klarste is not None and rot_vorgabe is None:
        gruppe = [e for e in eigen if e["brauchbar"]
                  and _abstand(e["achse"], klarste["achse"]) <= MONTAGE_GLEICH_GRAD]
        # Klarheitsgewichtetes Mittel der Gruppe, um den Kreis herum gerechnet.
        gew = np.array([e["klar"] for e in gruppe], dtype=float)
        win = np.radians(2.0 * np.array([e["achse"] for e in gruppe], dtype=float))
        achse_gem = float(np.degrees(np.arctan2((gew * np.sin(win)).sum(),
                                                (gew * np.cos(win)).sum())) / 2.0) % 180.0
    else:
        gruppe, achse_gem = [], None

    # --- Schritt 3: Richtung. Wo die Start-Heuristik nicht gegriffen hat, gilt die Mehrheit ----
    # Ist bei diesem Lauf die Achse um 180° gedreht worden? NICHT ueber `_abstand` pruefen: der
    # rechnet mod 180, und genau dort ist 180° dasselbe wie 0°. Gefragt ist der Abstand auf dem
    # VOLLEN Kreis zwischen der gefundenen Drehung und ihrer eigenen Achse.
    def _ist_gedreht(e: dict) -> bool:
        return abs(((e["rot"] - e["achse"]) % 360.0) - 180.0) < 90.0

    # EINE Richtung fuer die ganze Gruppe, gewichtet nach Klarheit. Begruendung wie bei der
    # Achse: dasselbe Handy dreht sich zwischen zwei Laeufen nicht um 180°, ohne dass sich die
    # Achse mitbewegt. An #9484 ist genau das der Fall — Lauf 0 sagt „nicht gedreht" (Klarheit
    # 7,5), Lauf 1 sagt „gedreht" (19,8), die Achsen liegen 19° auseinander, sind also dieselbe.
    # Eine der beiden Start-Heuristiken irrt; die klarere gewinnt, und die ueberstimmte wird
    # gekennzeichnet statt stillschweigend umgebogen.
    gemessen = [e for e in eigen if e["richtung_gemessen"] and e["brauchbar"]]
    mehrheit = None
    if gemessen:
        dafuer = sum(e["klar"] for e in gemessen if _ist_gedreht(e))
        gesamt = sum(e["klar"] for e in gemessen)
        mehrheit = dafuer * 2 > gesamt

    aus: list[dict] = []
    for i, e in enumerate(eigen):
        verrutscht = False
        strittig = False
        if rot_vorgabe is not None:
            rot, quelle = float(rot_vorgabe), "manuell"
        elif achse_gem is None or not e["brauchbar"]:
            rot, quelle = float(ganze["rot_deg"]), "geerbt"
        elif e in gruppe:
            # Gemeinsame Achse; die Richtung aus dem Lauf selbst, sonst aus der Mehrheit.
            gedreht = bool(mehrheit) if mehrheit is not None else _ist_gedreht(e)
            rot = (achse_gem + 180.0) % 360.0 if gedreht else achse_gem
            strittig = e["richtung_gemessen"] and _ist_gedreht(e) != gedreht
            quelle = ("achse+mehrheit" if not e["richtung_gemessen"] or strittig
                      else e["quelle"])
        else:
            rot, quelle, verrutscht = e["rot"], e["quelle"], True
        aus.append({
            "lauf": i,
            "rot_deg": round(rot % 360.0, 1),
            "rot_klarheit": e["klar"],
            "rot_eigen": bool(quelle not in ("geerbt", "manuell")),
            "rot_quelle": quelle,
            # Dieser Lauf passt NICHT zur Montage der uebrigen — Handy gedreht, verrutscht oder
            # Fehlgriff. Bewusst nicht stillschweigend eingeebnet.
            "rot_verrutscht": verrutscht,
            # Die Start-Heuristik dieses Laufs sagte das Gegenteil und wurde von der klareren
            # Mehrheit ueberstimmt. Kein Fehler, aber eine Stelle, an der man hinschauen darf.
            "rot_strittig": strittig,
        })
    # Die Drehung der GROESSTEN Gruppe: so lag das Handy die meiste Zeit. Fuer eine Ansicht, die
    # sich auf einen Wert festlegen muss, ist das der ehrlichste — und wenn die Montage nie
    # wechselte, ist es ohnehin derselbe wie der der ganzen Aufnahme.
    gruppe_rot = None
    if gruppe:
        _in_gruppe = [x for x, e in zip(aus, eigen) if e in gruppe and not x["rot_verrutscht"]]
        if _in_gruppe:
            gruppe_rot = max(_in_gruppe, key=lambda x: x["rot_klarheit"] or 0.0)["rot_deg"]
    return {"je_lauf": aus, "ganze": ganze, "gruppe_rot_deg": gruppe_rot}


def kennzahlen_je_lauf(acc_raw: np.ndarray, t_acc_ms: np.ndarray,
                       gyr_raw: np.ndarray, t_gyr_ms: np.ndarray,
                       ref_bereiche_ms: list[tuple[float, float]],
                       lauf_starts_ms: list[float] | None = None,
                       gps: list | None = None,
                       rot_vorgabe: float | None = None) -> list[dict]:
    """Je Lauf ein vollstaendiger eigener Durchgang, mit der Drehung aus `montage_je_lauf`."""
    montagen = montage_je_lauf(acc_raw, t_acc_ms, gyr_raw, t_gyr_ms, ref_bereiche_ms,
                               lauf_starts_ms, gps=gps, rot_vorgabe=rot_vorgabe)["je_lauf"]
    aus: list[dict] = []
    for (a, b), m in zip(ref_bereiche_ms, montagen):
        erg = lage_berechnen(acc_raw, t_acc_ms, gyr_raw, t_gyr_ms, ziel_hz=20.0,
                             t_von_ms=a, t_bis_ms=b, ref_bereiche_ms=[(a, b)],
                             rot_deg=float(m["rot_deg"]), _roh=True)
        if not erg.get("ok"):
            aus.append({"lauf": m["lauf"], "ok": False})
            continue
        k = erg["kennzahlen"]
        aus.append({
            **m, "ok": True,
            "pitch_amplitude_deg": k["pitch_amplitude_deg"],
            "roll_amplitude_deg": k["roll_amplitude_deg"],
            "gier_rms_deg_s": k["gier_rms_deg_s"],
            "pitch_hz": k["pitch_hz"],
            "hub_fenster_s": round(float(erg["hub_fenster_s"]), 1),
            "hub_pp_cm": k["hub_pp_cm"],
            "hub_hz": k["hub_hz"],
            "hub_sicher": k["hub_sicher"],
        })
    return aus
