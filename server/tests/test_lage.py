"""Lage-Berechnung (Pitch/Roll/Gier) gegen Signale, deren Antwort vorher feststeht.

Echte Aufnahmen taugen zum Plausibilisieren, nicht zum Pruefen — bei handgewedelten Daten weiss
niemand, was herauskommen MUSS. Deshalb hier gebaute Signale mit bekannter Wahrheit.
"""
import math

import numpy as np
import pytest

from app.analysis.lage import (ACCEL_SCALE, GYRO_SCALE, MONTAGE_KLARHEIT_MIN, _bezugsrichtung,
                               aufnahme_eigenschaften, gier_gegen_gps, hauptachse, hub_berechnen,
                               kurs_aus_gps, lage_berechnen, laufbereiche,
                               montage_achse_aus_kreisel, zeitachse)


def _ruhend(n, hz, kipp_grad=0.0, achse="pitch"):
    """Stillliegendes Geraet, um `kipp_grad` geneigt: nur Schwerkraft, keine Drehrate."""
    w = math.radians(kipp_grad)
    if achse == "pitch":
        g = np.array([-math.sin(w), 0.0, math.cos(w)])
    else:
        g = np.array([0.0, math.sin(w), math.cos(w)])
    acc = np.tile(g * ACCEL_SCALE, (n, 1)).astype(np.int16)
    gyr = np.zeros((n, 3), dtype=np.int16)
    t = np.arange(n) * (1000.0 / hz)
    return acc, t, gyr, t


def test_ruhendes_geraet_hat_null_auslenkung():
    """Liegt es still, ist die Auslenkung gegen den eigenen Nullpunkt null — egal wie gekippt."""
    acc, t, gyr, tg = _ruhend(600, 50, kipp_grad=12.0)
    r = lage_berechnen(acc, t, gyr, tg, ziel_hz=20)
    # Ohne uebergebene Laufbereiche ist der Bezug der Mittelteil des Fensters — hier liegt das
    # Geraet durchgehend gleich, also faellt beides zusammen.
    assert r["ok"] and r["nullpunkt"] == "mittelteil"
    assert max(abs(x) for x in r["pitch_deg"]) < 0.5
    assert max(abs(x) for x in r["roll_deg"]) < 0.5
    assert r["kennzahlen"]["ruhe_anteil"] > 0.9


def test_statische_neigung_wird_als_winkel_erkannt():
    """Erst 8 s flach, dann 8 s um 20° gekippt -> der UNTERSCHIED betraegt 20°.

    Geprueft wird die Differenz zweier EINGESCHWUNGENER Abschnitte, nicht der Absolutwert: der
    Nullpunkt liegt bewusst im Mittelteil des Fensters, und der ist hier per Konstruktion
    irgendwo zwischen beiden Lagen. Und nicht ueber die Rampe mitteln — der Filter braucht ein
    paar Sekunden, das ist gewollt (er soll ja nicht jedem Pumpstoss folgen).
    """
    hz = 50
    a1, _, g1, _ = _ruhend(400, hz, 0.0)
    a2, _, g2, _ = _ruhend(400, hz, 20.0)
    acc = np.vstack([a1, a2]); gyr = np.vstack([g1, g2])
    t = np.arange(len(acc)) * (1000.0 / hz)
    r = lage_berechnen(acc, t, gyr, t, ziel_hz=20)
    assert r["ok"]
    p = np.array(r["pitch_deg"]); n = len(p)
    flach = p[n // 2 - 20:n // 2].mean()     # letzte Sekunde vor dem Kippen
    gekippt = p[-20:].mean()                 # letzte Sekunde danach
    assert 19.0 < abs(gekippt - flach) < 21.0, (flach, gekippt)


def test_gierrate_wird_ueber_das_fenster_integriert():
    """Konstante Drehung mit 90°/s -> 90° je Sekunde, 270° je drei Sekunden. NEGATIV gezaehlt.

    Eine positive Drehrate um die Geraete-Z-Achse ist im Rechtssystem eine LINKSdrehung. Nach
    aussen gilt „positiv = nach rechts" (s. `aufnahme_eigenschaften`), also kommt hier -90° je
    Sekunde heraus. Wer diesen Test kippen sieht, hat die Konvention angefasst.
    """
    hz, n = 100, 1000        # 10 s
    t = np.arange(n) * (1000.0 / hz)
    acc = np.tile(np.array([0.0, 0.0, 1.0]) * ACCEL_SCALE, (n, 1)).astype(np.int16)
    rate = math.radians(90.0)
    gyr = np.tile(np.array([0.0, 0.0, rate]) * GYRO_SCALE, (n, 1)).astype(np.int16)
    for fenster, soll in ((1.0, -90.0), (3.0, -270.0)):
        r = lage_berechnen(acc, t, gyr, t, ziel_hz=20, yaw_fenster_s=fenster)
        assert r["ok"]
        # Die erste Fensterlaenge ist noch nicht gefuellt -> hinten schauen.
        gemessen = np.median(np.array(r["gier_delta_deg"])[-40:])
        assert abs(gemessen - soll) < abs(soll) * 0.05, (fenster, gemessen)


def test_gierrate_wird_auf_die_schwerkraft_projiziert():
    """Gerollt liegendes Geraet: eine Drehung um die WELT-Hochachse zaehlt, eine um die
    Geraete-Z-Achse nicht. Ohne die Projektion waere es genau andersherum."""
    hz, n = 100, 600
    t = np.arange(n) * (1000.0 / hz)
    # 90° gerollt: Schwerkraft liegt auf der Geraete-Y-Achse.
    acc = np.tile(np.array([0.0, 1.0, 0.0]) * ACCEL_SCALE, (n, 1)).astype(np.int16)
    rate = math.radians(60.0)
    dreh_um_welt_hoch = np.tile(np.array([0.0, rate, 0.0]) * GYRO_SCALE, (n, 1)).astype(np.int16)
    dreh_um_geraete_z = np.tile(np.array([0.0, 0.0, rate]) * GYRO_SCALE, (n, 1)).astype(np.int16)

    r1 = lage_berechnen(acc, t, dreh_um_welt_hoch, t, ziel_hz=20, yaw_fenster_s=1.0)
    r2 = lage_berechnen(acc, t, dreh_um_geraete_z, t, ziel_hz=20, yaw_fenster_s=1.0)
    gier1 = abs(np.median(np.array(r1["gier_delta_deg"])[-40:]))
    gier2 = abs(np.median(np.array(r2["gier_delta_deg"])[-40:]))
    assert gier1 > 50.0, gier1          # zaehlt als Gieren
    assert gier2 < 10.0, gier2          # zaehlt NICHT als Gieren


def test_verschiedene_raten_je_kanal():
    """Android-Fall: Accel 120 Hz, Gyro 60 Hz. Beide Achsen werden getrennt aufgebaut."""
    dauer = 8.0
    ta = np.arange(int(dauer * 120)) * (1000.0 / 120)
    tg = np.arange(int(dauer * 60)) * (1000.0 / 60)
    acc = np.tile(np.array([0.0, 0.0, 1.0]) * ACCEL_SCALE, (len(ta), 1)).astype(np.int16)
    rate = math.radians(45.0)
    gyr = np.tile(np.array([0.0, 0.0, rate]) * GYRO_SCALE, (len(tg), 1)).astype(np.int16)
    r = lage_berechnen(acc, ta, gyr, tg, ziel_hz=20, yaw_fenster_s=1.0)
    assert r["ok"]
    assert r["quelle_hz"]["accel"] > 100 and 55 < r["quelle_hz"]["gyro"] < 65
    assert abs(np.median(np.array(r["gier_delta_deg"])[-30:]) + 45.0) < 4.0   # links = negativ


def test_ohne_gyro_kommt_trotzdem_pitch_und_roll():
    """Alte Aufnahmen haben keinen Kreisel — dann traegt die Schwerkraft allein."""
    acc, t, _, _ = _ruhend(400, 50, kipp_grad=15.0)
    r = lage_berechnen(acc, t, np.empty((0, 3)), np.empty(0), ziel_hz=20)
    assert r["ok"] and r["hat_gyro"] is False
    assert max(abs(x) for x in r["gier_delta_deg"]) == 0.0


def test_zu_kurz_wird_abgelehnt():
    acc, t, gyr, tg = _ruhend(20, 50)
    assert lage_berechnen(acc, t, gyr, tg)["ok"] is False


def test_zeitachse_aus_chunk_startzeiten():
    """Die Achse kommt aus den `.t0`-Sidecars, nicht aus einer angesagten Rate."""
    t = zeitachse({0: 0, 1: 1000, 2: 2000}, {0: 50, 1: 50, 2: 50})
    assert len(t) == 150
    assert t[0] == 0 and abs(t[50] - 1000) < 1e-6
    assert abs((t[1] - t[0]) - 20.0) < 1e-6      # 50 Samples je 1000 ms = 20 ms


# --- Nullpunkt: der Bezug ist die Fahrt, nicht die Ruhe -------------------------------------
# Anlass ist ein echter Befund von Jan (20.09.2026): Roll stand dauerhaft bei -84°, weil der
# Nullpunkt aus den RUHIGSTEN Abschnitten kam — und still liegt das Brett am Strand, nicht
# unter dem Fahrer.

def _strand_dann_fahrt(hz=50, strand_s=20, fahrt_s=40, montage_roll=80.0, wedeln_grad=10.0):
    """Erst liegt das Brett flach am Strand, dann wird gefahren — mit um `montage_roll`
    gekippter Halterung und einer Rollbewegung von ±`wedeln_grad` um diese Lage.

    Die Tests darunter geben ausdruecklich `rot_deg=0.0` mit, schalten die Montage-Automatik
    also ab. Grund: das Signal hier ist ein reines ROLLEN — fuer `montage_drehung` sieht das
    aus wie ein quer montiertes Handy, und sie wuerde es pflichtgemaess um 90° drehen. Gemeint
    ist hier aber der NULLPUNKT, nicht die Montage; die beiden Fragen gehoeren getrennt.
    """
    n_s, n_f = int(strand_s * hz), int(fahrt_s * hz)
    strand = np.tile(np.array([0.0, 0.0, 1.0]) * ACCEL_SCALE, (n_s, 1))
    tf = np.arange(n_f) / hz
    w = np.radians(montage_roll + wedeln_grad * np.sin(2 * np.pi * 1.2 * tf))
    fahrt = np.column_stack([np.zeros(n_f), np.sin(w), np.cos(w)]) * ACCEL_SCALE
    acc = np.vstack([strand, fahrt]).astype(np.int16)
    gyr = np.zeros((n_s + n_f, 3), dtype=np.int16)
    t = np.arange(len(acc)) * (1000.0 / hz)
    return acc, t, gyr, t, strand_s * 1000.0, (strand_s + fahrt_s) * 1000.0


def test_nullpunkt_kommt_aus_den_laeufen_nicht_aus_der_ruhe():
    """Genau Jans Fall: 20 s am Strand, dann 40 s Fahrt mit um 80° gekippter Halterung.

    Der Bezug muss die FAHRT sein — sonst zeigt Roll die 80° der Halterung an, statt der
    Bewegung um sie herum.
    """
    acc, t, gyr, tg, von, bis = _strand_dann_fahrt()
    r = lage_berechnen(acc, t, gyr, tg, ziel_hz=20, ref_bereiche_ms=[(von, bis)], rot_deg=0.0)
    assert r["ok"] and r["nullpunkt"] == "laeufe"
    assert abs(r["null_roll_deg"] - 80.0) < 3.0, r["null_roll_deg"]
    # Waehrend der Fahrt bleibt nur das Wedeln uebrig, nicht der Montagewinkel. Gemessen an den
    # letzten 10 s: direkt nach dem Ablegen laeuft der Filter noch von der Strandlage hoch
    # (TAU_S = 1,5 s), und ueber diese Rampe zu mitteln waere der Fehler, vor dem
    # `test_statische_neigung_wird_als_winkel_erkannt` schon warnt.
    roll = np.array(r["roll_deg"])[-200:]
    assert abs(roll).max() < 15.0, abs(roll).max()


def test_ohne_bezug_kippt_der_nullpunkt_in_die_ruhelage():
    """Gegenprobe zum vorigen Test: OHNE Laufbereiche zieht die lange Strandphase die Null.

    Der Test haelt fest, warum der Endpunkt die Laufbereiche mitgeben MUSS — nicht, dass das
    Verhalten ohne sie richtig waere.
    """
    acc, t, gyr, tg, von, bis = _strand_dann_fahrt(strand_s=40, fahrt_s=20)
    r = lage_berechnen(acc, t, gyr, tg, ziel_hz=20)
    assert r["ok"] and r["nullpunkt"] == "mittelteil"
    assert abs(r["null_roll_deg"]) < 40.0, r["null_roll_deg"]


def test_sturz_verschiebt_den_nullpunkt_nicht():
    """Median statt Mittelwert: 3 s wildes Ueberschlagen in 40 s Fahrt aendern den Bezug kaum."""
    hz = 50
    acc, t, gyr, tg, von, bis = _strand_dann_fahrt(hz=hz, strand_s=0, fahrt_s=40)
    sauber = lage_berechnen(acc, t, gyr, tg, ziel_hz=20, ref_bereiche_ms=[(von, bis)], rot_deg=0.0)
    # Drei Sekunden auf dem Kopf mitten in der Fahrt.
    mit = acc.copy()
    a, b = int(20 * hz), int(23 * hz)
    mit[a:b] = (np.array([0.0, 0.0, -1.0]) * ACCEL_SCALE).astype(np.int16)
    gestoert = lage_berechnen(mit, t, gyr, tg, ziel_hz=20, ref_bereiche_ms=[(von, bis)], rot_deg=0.0)
    assert abs(gestoert["null_roll_deg"] - sauber["null_roll_deg"]) < 2.0, (
        sauber["null_roll_deg"], gestoert["null_roll_deg"])


def test_nullpunkt_haengt_nicht_am_gezeigten_ausschnitt():
    """Ein einzelner Lauf gezeigt, Bezug aber aus allen Laeufen -> dieselbe Null.

    Sonst spraenge der Rollwinkel beim Umschalten zwischen den Laeufen.
    """
    acc, t, gyr, tg, von, bis = _strand_dann_fahrt(strand_s=10, fahrt_s=40)
    bereiche = [(von, bis)]
    ganz = lage_berechnen(acc, t, gyr, tg, ziel_hz=20, ref_bereiche_ms=bereiche, rot_deg=0.0)
    teil = lage_berechnen(acc, t, gyr, tg, ziel_hz=20, ref_bereiche_ms=bereiche, rot_deg=0.0,
                          t_von_ms=von + 5000, t_bis_ms=von + 20000)
    assert abs(ganz["null_roll_deg"] - teil["null_roll_deg"]) < 0.01


def test_laufbereiche_kuerzt_die_raender_und_rechnet_den_trim_ein():
    """Start und Sturz gehoeren nicht in den Bezug; der Trim-Offset muss wieder drauf."""
    # 100 s Lauf, re-based auf den Trim -> mit 5 s Trim liegt er bei 5..105 s.
    (a, b), = laufbereiche([{"t_start_ms": 0, "t_end_ms": 100_000}], trim_offset_ms=5000)
    assert (a, b) == (5000 + 3000, 105_000 - 3000)      # je 3 s Deckel, nicht 15 %
    # Kurzer Lauf: 15 % je Seite.
    (a, b), = laufbereiche([{"t_start_ms": 0, "t_end_ms": 10_000}])
    assert (a, b) == (1500, 8500)
    # Zu kurz zum Kuerzen -> unveraendert, statt nichts uebrig zu lassen.
    assert laufbereiche([{"t_start_ms": 0, "t_end_ms": 2500}]) == [(0.0, 2500.0)]
    # `t_*_session_ms` traegt die Session-ms schon fertig, der Offset darf NICHT nochmal drauf.
    (a, b), = laufbereiche([{"t_start_ms": 0, "t_end_ms": 10_000,
                             "t_start_session_ms": 60_000, "t_end_session_ms": 70_000}],
                           trim_offset_ms=5000)
    assert (a, b) == (61_500, 68_500)


# --- Hub: zweimal integrieren, aber nur im Band ----------------------------------------------

def _senkrechte_schwingung(amplitude_m, f_hz, dauer_s, hz=50.0):
    """Beschleunigung einer reinen Auf-/Ab-Schwingung: z = A·sin(ωt) -> z̈ = -A·ω²·sin(ωt)."""
    t = np.arange(int(dauer_s * hz)) / hz
    w = 2 * math.pi * f_hz
    return -amplitude_m * w ** 2 * np.sin(w * t), 1.0 / hz


@pytest.mark.parametrize("fenster", [1.0, 3.0, 5.0, 10.0])
def test_hub_gibt_die_amplitude_unabhaengig_vom_fenster_zurueck(fenster):
    """12 cm Hub bei 1 Hz müssen 12 cm bleiben — das Fenster ist eine Bandgrenze, kein Regler.

    Der Test hat einen echten Fehler gefunden: ein zusaetzlicher Abzug der Ausgleichsgeraden
    liess die Amplitude bei 5-s-Fenster auf 16,2 cm steigen. Bei einem fast-periodischen Signal
    findet die Gerade eine Steigung, und die Rampe landet genau dort, wo 1/ω² am staerksten
    verstaerkt.
    """
    a, dt = _senkrechte_schwingung(0.12, 1.0, 30.0)
    z = hub_berechnen(a, dt, fenster)
    assert z is not None
    assert 11.5 < np.abs(z).max() < 12.5, np.abs(z).max()


def test_hub_verwirft_versatz_und_langsames():
    """Ein konstanter Messfehler und eine Bewegung unterhalb des Bandes duerfen nichts ergeben.

    Das ist die Eigenschaft, die den Ansatz ueberhaupt tragfaehig macht: zweimal integrieren
    laesst jeden Versatz quadratisch weglaufen — 0,01 m/s² werden in einer Minute zu 18 m.
    """
    a, dt = _senkrechte_schwingung(0.12, 1.0, 30.0)
    assert np.abs(hub_berechnen(np.full(len(a), 0.3), dt, 3.0)).max() < 0.1
    langsam, dt2 = _senkrechte_schwingung(0.20, 0.05, 30.0)     # 20 s Periode, 20 cm
    assert np.abs(hub_berechnen(langsam, dt2, 3.0)).max() < 1.0


def test_hub_lehnt_zu_kurze_stuecke_ab():
    """Passt das Fenster nicht mehrfach in den Lauf, schneidet die Bandgrenze das Nutzsignal mit
    weg — dann lieber nichts liefern als eine Kurve, die nur aus der Grenze besteht."""
    a, dt = _senkrechte_schwingung(0.12, 1.0, 4.0)
    assert hub_berechnen(a, dt, 3.0) is None


def test_hub_steht_in_der_lage_antwort():
    """Ende zu Ende: gekipptes Geraet, das auf und ab schwingt -> der Hub landet im Ergebnis.

    Gekippt ist wichtig: die Senkrechte kommt aus der berechneten LAGE, nicht aus der z-Achse
    des Geraets. Läge das Handy quer, wäre z waagerecht und der Hub steckte in x oder y.
    """
    hz, n, kipp = 50.0, 2000, 25.0
    t = np.arange(n) / hz
    w = 2 * math.pi * 1.0
    a_vert_g = -0.10 * w ** 2 * np.sin(w * t) / 9.80665       # 10 cm Hub, in g
    k = math.radians(kipp)
    # Schwerkraft + senkrechte Beschleunigung, beides in den gekippten Geraetachsen.
    oben = np.array([-math.sin(k), 0.0, math.cos(k)])
    acc = ((1.0 + a_vert_g)[:, None] * oben) * ACCEL_SCALE
    tms = t * 1000.0
    r = lage_berechnen(acc.astype(np.int16), tms, np.zeros((n, 3), dtype=np.int16), tms,
                       ziel_hz=20, hub_fenster_s=3.0)
    assert r["ok"] and r["hub_cm"] is not None
    hub = np.array(r["hub_cm"])
    assert 8.0 < np.abs(hub).max() < 12.0, np.abs(hub).max()
    assert r["kennzahlen"]["hub_pp_cm"] > 12.0                # Spitze-Spitze rund 20 cm


# --- Ausrichtung um die Senkrechte -----------------------------------------------------------
# Jans Frage (20.09.): „was ist, wenn das Handy um die Senkrechte um 45 Grad gedreht liegt?"
# Der Nullpunkt hilft dort nicht — er faengt Neigung ab, nicht verdrehte Mess-ACHSEN.

def test_hauptachse_findet_eine_eingebaute_drehung_wieder():
    """Eine Nick-Schwingung, kuenstlich um 45° verdreht -> die Hauptachse wandert um 45° mit."""
    t = np.arange(2000) / 50.0
    nick = 8.0 * np.sin(2 * np.pi * 1.0 * t) + 0.4 * np.random.default_rng(7).standard_normal(len(t))
    roll = 0.4 * np.random.default_rng(8).standard_normal(len(t))
    gerade, klar = hauptachse(nick, roll)
    assert abs(gerade) < 5.0, gerade          # laengs: fast reines Nicken (0° nach dem Falten)
    assert klar > 5.0, klar                   # und das eindeutig

    w = math.radians(45)
    c, sn = math.cos(w), math.sin(w)
    gedreht, klar2 = hauptachse(nick * c - roll * sn, nick * sn + roll * c)
    # Das Ergebnis ist eine Achse auf (-90, 90] — 45° und -135° waeren dieselbe Lage.
    assert abs(gedreht - 45.0) < 5.0, gedreht
    assert klar2 > 5.0


def test_hauptachse_sagt_es_wenn_es_keine_vorzugsrichtung_gibt():
    """Rundes Gewackel ohne Vorzugsrichtung -> Klarheit nahe 1, der Winkel ist dann bedeutungslos."""
    rng = np.random.default_rng(11)
    _, klar = hauptachse(rng.standard_normal(2000), rng.standard_normal(2000))
    assert klar < 1.5, klar


# --- Gieren gegen den GPS-Kurs ----------------------------------------------------------------
# Jan, 21.09.2026: „das Gieren muesste aus dem GPS-Track auch eindeutig ableitbar sein." Stimmt —
# Kurs ueber Grund und Gieren sind DIESELBE Groesse. Damit ist das Vorzeichen messbar, statt aus
# der Zeichnung geraten zu werden (womit es am 21.09. schon einmal falsch herum landete).

def _slalom(gespiegelt=False, hz=50.0, dauer_s=60.0, tempo=4.0, rate=25.0, periode_s=20.0):
    """Ein Slalom mit bekanntem Kurs: Spur und Kreisel aus derselben Wahrheit gebaut.

    `gespiegelt` stellt eine Plattform nach, die ihren Kreisel andersherum schreibt — der Fall,
    den die Gegenprobe abfangen soll, ohne dass es jemandem auffallen muesste.
    """
    t = np.arange(int(dauer_s * hz)) / hz
    w = rate * np.sin(2 * np.pi * t / periode_s)          # °/s, positiv = nach rechts
    kurs = np.cumsum(w) / hz                              # Kompasskurs, im Uhrzeigersinn
    kr = np.radians(kurs)
    x = np.cumsum(tempo * np.sin(kr)) / hz                # Ost
    y = np.cumsum(tempo * np.cos(kr)) / hz                # Nord
    la0, lo0 = 47.86, 9.38
    la = la0 + y / 110540.0
    lo = lo0 + x / (111320.0 * math.cos(math.radians(la0)))
    schritt = int(hz)                                     # die Spur kommt mit 1 Hz
    gps = [[float(t[i] * 1000), float(la[i]), float(lo[i]), 0.0, 0, 5.0]
           for i in range(0, len(t), schritt)]
    acc = np.tile(np.array([0.0, 0.0, 1.0]) * ACCEL_SCALE, (len(t), 1)).astype(np.int16)
    # Eine Rechtskurve dreht im Uhrzeigersinn, also NEGATIV um die Welt-Hochachse.
    vz = 1.0 if gespiegelt else -1.0
    gyr = np.zeros((len(t), 3))
    gyr[:, 2] = vz * np.radians(w) * GYRO_SCALE
    return acc, t * 1000.0, gyr.astype(np.int16), t * 1000.0, gps, kurs


def test_gieren_zaehlt_rechtsherum_positiv():
    """Rechtskurve = positiv, wie der Kurs ueber Grund und wie das Rollen."""
    acc, ta, gyr, tg, gps, _ = _slalom()
    r = lage_berechnen(acc, ta, gyr, tg, ziel_hz=20.0, yaw_fenster_s=4.0,
                       ref_bereiche_ms=[(3000.0, 58000.0)], gps=gps)
    assert r["ok"] and r["gier_umgekehrt"] is False
    g = r["gier_gps"]
    assert g is not None and g["r"] > 0.9 and 0.8 < g["steigung"] < 1.3, g


def test_gespiegelter_kreisel_wird_am_track_erwischt():
    """Schreibt eine Plattform den Kreisel andersherum, dreht die Gegenprobe es zurueck."""
    acc, ta, gyr, tg, gps, kurs = _slalom(gespiegelt=True)
    r = lage_berechnen(acc, ta, gyr, tg, ziel_hz=20.0, yaw_fenster_s=4.0,
                       ref_bereiche_ms=[(3000.0, 58000.0)], gps=gps)
    assert r["gier_umgekehrt"] is True, r["gier_gps"]
    # ... und hinterher laeuft das Gieren wieder mit dem Kurs mit.
    t = np.array(r["t_ms"])
    k = np.interp(t, ta, kurs)
    n = int(4.0 * 20)
    d = np.full(len(t), np.nan)
    d[n:] = k[n:] - k[:-n]
    m = np.isfinite(d) & (t > 8000) & (t < 58000)
    assert np.polyfit(d[m], np.array(r["gier_delta_deg"])[m], 1)[0] > 0.8


def test_gegenprobe_schweigt_wenn_niemand_eine_kurve_faehrt():
    """Geradeausfahrt: kein Kurswechsel, also keine Aussage — und KEIN geratenes Vorzeichen."""
    acc, ta, gyr, tg, gps, _ = _slalom(rate=0.0)
    assert gier_gegen_gps(np.arange(0, 60000, 50.0), np.zeros(1200), 4.0,
                          gps, [(3000.0, 58000.0)]) is None


def test_kurs_aus_gps_zeigt_nach_norden_und_osten():
    """Nordfahrt = 0°, Ostfahrt = 90°: Kompasskurs, nicht mathematischer Winkel."""
    t = np.arange(20) * 1000.0
    nord = [[float(x), 47.86 + i * 4.0 / 110540.0, 9.38, 0.0, 0, 5.0] for i, x in enumerate(t)]
    ost = [[float(x), 47.86, 9.38 + i * 4.0 / (111320.0 * math.cos(math.radians(47.86))),
            0.0, 0, 5.0] for i, x in enumerate(t)]
    for spur, soll in ((nord, 0.0), (ost, 90.0)):
        _, kurs, tempo = kurs_aus_gps(spur)
        assert abs(np.median(kurs) - soll) < 2.0, (soll, np.median(kurs))
        assert abs(np.median(tempo) - 4.0) < 0.2, np.median(tempo)


# --- Montage-DREHUNG um die Hochachse, automatisch --------------------------------------------
# Jan hat das Handy an zwei Nachmittagen dreimal verschieden aufs Brett geklebt: laengs (#9484),
# quer (#9528), diagonal (#9535). Vierteldrehungen von Hand reichen dafuer nicht — 45° laesst
# sich mit 0/90/180/270 gar nicht geraderuecken.

def _pumpstrecke(psi_grad, hz=50.0, dauer_s=50.0, ab_s=5.0, takt_hz=1.3, amp=8.0,
                 tauch=25.0, tauch_s=0.5):
    """Eine Pump-Strecke, aufgenommen von einem um `psi_grad` verdreht montierten Geraet.

    Das Brett nickt (reine Nick-Schwingung um `takt_hz`) und taucht am Lauf-Anfang die Nase
    weg — beides zusammen ist genau das, woran sich die Automatik ausrichtet: die Schwingung
    gibt die ACHSE, das Wegtauchen die RICHTUNG. Der Kreisel ist konsistent mitgerechnet, sonst
    wuerde der Komplementaerfilter die 1,3 Hz wegdaempfen und der Test misst nur noch sich selbst.
    """
    t = np.arange(int(dauer_s * hz)) / hz
    tl = np.clip(t - ab_s, 0.0, None)
    an = (t >= ab_s).astype(float)
    # Wegtauchen als Stossfunktion: bei 0 stetig, Minimum nach `tauch_s` — ein Sprung waere im
    # Kreisel nicht abgebildet und der Filter muesste ihn erst einholen.
    theta = an * (amp * np.sin(2 * np.pi * takt_hz * tl) - tauch * (tl / tauch_s) * np.exp(1 - tl / tauch_s))
    d_theta = an * (amp * 2 * np.pi * takt_hz * np.cos(2 * np.pi * takt_hz * tl)
                    - tauch / tauch_s * np.exp(1 - tl / tauch_s) * (1 - tl / tauch_s))
    th, dth = np.radians(theta), np.radians(d_theta)
    p = math.radians(psi_grad)
    cp, sp = math.cos(p), math.sin(p)
    # Weltoben und Drehratenvektor im GERAETE-System: Brett = Rz(psi) · Geraet.
    acc = np.column_stack([-np.sin(th) * cp, np.sin(th) * sp, np.cos(th)]) * ACCEL_SCALE
    gyr = np.column_stack([dth * sp, dth * cp, np.zeros_like(dth)]) * GYRO_SCALE
    t_ms = t * 1000.0
    return acc.astype(np.int16), t_ms, gyr.astype(np.int16), t_ms, theta


@pytest.mark.parametrize("psi", [0, 45, 90, 135, 180, 225, 270, 315])
def test_montage_drehung_wird_aus_dem_pumptakt_gefunden(psi):
    """Egal wie das Handy liegt — das Nicken des BRETTS kommt heraus, nicht das des Handys."""
    acc, t, gyr, tg, soll = _pumpstrecke(psi)
    r = lage_berechnen(acc, t, gyr, tg, ziel_hz=50.0,
                       ref_bereiche_ms=[(8000.0, 45000.0)], lauf_starts_ms=[5000.0])
    assert r["ok"]
    assert (r["rot_deg"] - psi) % 360 < 1.0 or (psi - r["rot_deg"]) % 360 < 1.0, r["rot_deg"]
    tt = np.array(r["t_ms"])
    m = (tt >= 10000) & (tt <= 45000)
    fehler = np.array(r["pitch_deg"])[m] - np.interp(tt, t, soll)[m]
    assert np.sqrt(np.mean(fehler ** 2)) < 2.0, np.sqrt(np.mean(fehler ** 2))
    # Und im Rollen darf davon nichts uebrig bleiben.
    assert np.abs(np.array(r["roll_deg"])[m]).max() < 2.0
    # Am Lauf-Anfang taucht die Nase weg — negativ, in JEDER Montage.
    assert r["start_nicken_deg"] < -10.0, r["start_nicken_deg"]


def test_montage_achse_kommt_aus_der_drehrate():
    """Die Achse wird direkt aus dem Kreisel bestimmt, nicht aus den gefilterten Winkeln.

    Jan, 21.09.2026: „das Nicken doch auch aus dem Gyro oder etwa nicht?" — der Kreisel misst die
    Nickschwingung unmittelbar, ohne Komplementaerfilter und ohne geschaetzten Bezug dazwischen.
    An seinen Aufnahmen kam dasselbe heraus (0,9° bzw. 1,1° Abstand), aber doppelt bis viermal so
    klar: 14,5 statt 7,4 (#9535) und 20,8 statt 6,9 (#9528).
    """
    acc, ta, gyr, tg, _ = _pumpstrecke(45)
    ref = [(8000.0, 45000.0)]
    achse, klar = montage_achse_aus_kreisel(gyr, tg, _bezugsrichtung(acc, ta, ref), ref)
    assert abs(achse - 45.0) < 3.0, achse
    assert klar > MONTAGE_KLARHEIT_MIN, klar


def test_ohne_kreisel_bleibt_der_umweg_ueber_die_winkel():
    """Altbestand ohne Drehrate: dieselbe Achse, nur unschaerfer — aber sie kommt heraus."""
    acc, ta, gyr, tg, _ = _pumpstrecke(45)
    e = lage_berechnen(acc, ta, np.zeros_like(gyr), tg, ziel_hz=50.0,
                       ref_bereiche_ms=[(8000.0, 45000.0)], lauf_starts_ms=[5000.0])
    assert e["ok"]
    # Ohne Kreisel traegt die Schwerkraft allein; die Richtung findet sie trotzdem.
    assert abs((e["rot_deg"] - 45.0 + 180) % 360 - 180) < 12.0, e["rot_deg"]


def test_montage_drehung_haengt_nicht_am_gezeigten_ausschnitt():
    """Zwei Laeufe, einzeln gezeigt -> dieselbe Drehung.

    An #9484 entschied sich Lauf 0 fuer 0° und Lauf 1 fuer 180°, dasselbe Handy in derselben
    Aufnahme: die Richtungs-Heuristik sah nur den Ausschnitt. Seit 21.09. laeuft die Suche ueber
    ALLE Laufbereiche, so wie der Nullpunkt auch.
    """
    acc, t, gyr, tg, _ = _pumpstrecke(225)
    bereiche, starts = [(8000.0, 22000.0), (30000.0, 45000.0)], [5000.0, 28000.0]
    ganz = lage_berechnen(acc, t, gyr, tg, ziel_hz=50.0,
                          ref_bereiche_ms=bereiche, lauf_starts_ms=starts)
    for von, bis in bereiche:
        teil = lage_berechnen(acc, t, gyr, tg, ziel_hz=50.0, t_von_ms=von - 5000, t_bis_ms=bis,
                              ref_bereiche_ms=bereiche, lauf_starts_ms=starts)
        assert teil["rot_deg"] == ganz["rot_deg"], (von, teil["rot_deg"], ganz["rot_deg"])


def test_montage_drehung_bleibt_aus_wenn_es_nichts_zu_sehen_gibt():
    """Ohne Vorzugsrichtung wird NICHT gedreht — lieber ungedreht als zufaellig gedreht."""
    rng = np.random.default_rng(3)
    n = 2500
    acc = np.column_stack([rng.standard_normal(n) * 0.02, rng.standard_normal(n) * 0.02,
                           np.ones(n)]) * ACCEL_SCALE
    t = np.arange(n) * 20.0
    e = aufnahme_eigenschaften(acc.astype(np.int16), t, np.zeros((n, 3), dtype=np.int16), t,
                               [(2000.0, 45000.0)], None)
    assert e["rot_deg"] == 0.0 and e["quelle"] == "keine", e


# --- Montagewinkel: als DREHUNG verrechnen, nicht als Abzug -----------------------------------
# Jans Befund vom 21.09.: auf dem Steg stand das Brett kopfueber und nachweislich waagerecht.
# Die Anzeige zeigte richtig Rollen -177,6°, aber +28,7° Nicken — das Doppelte der 16,5°, mit
# denen das Handy schraeg auf dem Brett klebte.

def _mit_montagewinkel(kipp_grad, n, hz, kopfueber):
    """Geraet um `kipp_grad` schief auf dem Brett; Brett waagerecht, aufrecht oder auf dem Kopf."""
    k = math.radians(kipp_grad)
    oben = np.array([-math.sin(k), 0.0, math.cos(k)])      # Weltoben in Geraetekoordinaten
    if kopfueber:
        oben = -oben                                       # Brett gedreht -> Oben spiegelt sich
    acc = np.tile(oben * ACCEL_SCALE, (n, 1)).astype(np.int16)
    t = np.arange(n) * (1000.0 / hz)
    return acc, t, np.zeros((n, 3), dtype=np.int16), t


def test_montagewinkel_faellt_auch_kopfueber_heraus():
    """Waagerechtes Brett heisst 0° Nicken — aufrecht WIE auf dem Kopf.

    Der frueher verwendete Abzug des Nullpunkts als ZAHL leistet das nicht: kippt das Brett,
    kehrt sich die gemessene Neigung mit um, und aus „16,5 abziehen" wird „16,5 dazu". Genau
    das ergab an #9484 die +28,7° auf dem Steg. Mit der Drehung bleibt nichts uebrig.
    """
    hz, n, kipp = 50.0, 1500, 16.5
    for kopfueber in (False, True):
        acc, t, gyr, tg = _mit_montagewinkel(kipp, n, hz, kopfueber)
        # Bezug aus einem "Lauf" in der aufrechten Lage — so wie es die Pipeline macht.
        ref_acc, ref_t, _, _ = _mit_montagewinkel(kipp, n, hz, False)
        r = lage_berechnen(np.vstack([ref_acc, acc]),
                           np.concatenate([ref_t, ref_t[-1] + 1000 + t]),
                           np.zeros((2 * n, 3), dtype=np.int16),
                           np.concatenate([ref_t, ref_t[-1] + 1000 + t]),
                           ziel_hz=20, ref_bereiche_ms=[(0.0, float(ref_t[-1]))])
        assert r["ok"]
        # Der Montagewinkel selbst wird als Auskunft gemeldet ...
        assert abs(r["null_pitch_deg"] - kipp) < 1.0, r["null_pitch_deg"]
        # ... und darf im Ergebnis NICHT mehr auftauchen. Zweite Haelfte = die zu pruefende Lage.
        p = np.array(r["pitch_deg"])[len(r["pitch_deg"]) // 2 + 40:]
        assert abs(p).max() < 4.0, (kopfueber, abs(p).max())
