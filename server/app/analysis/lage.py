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
# Hub: oberes Ende des Bandes. Ueber 4 Hz gibt es keine Brettbewegung mehr, nur noch Rauschen
# und Schlaege vom Wasser — die wuerden zweimal integriert nur die Kurve verwackeln.
HUB_OBEN_HZ = 4.0
G_MS2 = 9.80665
# Unter dieser Fensterzahl ist die Frequenzaufloesung zu grob: passt das Fenster nicht mehrfach
# in den Lauf, schneidet die untere Bandgrenze das Nutzsignal mit weg.
HUB_MIN_FENSTER = 3.0


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
                   lauf_starts_ms: list[float] | None = None) -> dict:
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
    gier_rate = np.degrees(np.einsum("ij,ij->i", gyr, g_hut))
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
    def hauptfrequenz(sig: np.ndarray) -> float | None:
        s0 = sig - sig.mean()
        if len(s0) < 32:
            return None
        f = np.fft.rfftfreq(len(s0), 1.0 / rechen_hz)
        A = np.abs(np.fft.rfft(s0))
        m = (f > 0.3) & (f < 4.0)
        return round(float(f[m][np.argmax(A[m])]), 2) if m.any() else None

    # HUB-FENSTER AM PUMPTAKT AUSRICHTEN, nicht an einer festen Zahl.
    #
    # Der Hub kommt aus zweimaligem Integrieren; alles unterhalb der Bandgrenze wird dabei
    # gnadenlos verstaerkt. Ein festes 3-s-Fenster (Grenze 0,33 Hz) ist fuer Pumpen bei 1,3 Hz
    # viel zu weit: an Jans erster echter Pump-Aufnahme (#9528, 21.09.) kamen damit 52,8 cm
    # heraus, mit 1 s dagegen 20,2 cm — und nur die zweite Zahl ist physikalisch plausibel.
    # Also die Grenze auf die HAELFTE des gemessenen Takts legen: bei 1,33 Hz sind das 1,5 s.
    # Gedeckelt, damit weder ein Ausreisser noch eine fehlende Messung Unsinn ergibt.
    if hub_fenster_s is None:
        _takt = hauptfrequenz(pitch)
        hub_fenster_s = float(min(5.0, max(1.0, 2.0 / _takt))) if _takt else 3.0
        hub = hub_berechnen(a_vert, 1.0 / rechen_hz, hub_fenster_s)

    start_nicken = startlage(pitch, t, lauf_starts_ms)
    rot_vorschlag = None
    if start_nicken is not None and abs(start_nicken) >= START_SCHWELLE_GRAD:
        rot_vorschlag = 180.0 if start_nicken > 0 else 0.0
    rot_quelle = "manuell" if not auto else ("heuristik" if rot_vorschlag is not None else "keine")
    if auto and rot_vorschlag == 180.0:
        pitch, roll = -pitch, -roll
        null_p, null_r = -null_p, -null_r
        rot_wirksam = 180.0
        start_nicken = -start_nicken

    schritt = max(1, int(round(rechen_hz / ziel_hz)))
    aus = slice(None, None, schritt)


    _hub_hz = hauptfrequenz(hub) if hub is not None else None
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
        "rot_deg": rot_wirksam,
        "rot_quelle": rot_quelle,          # manuell | heuristik | keine
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
            "pitch_hz": hauptfrequenz(pitch),
            # Hub von unten nach oben, robust gegen einzelne Ausreisser (5./95. Perzentil).
            "hub_pp_cm": (round(float(np.percentile(hub, 95) - np.percentile(hub, 5)), 1)
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
