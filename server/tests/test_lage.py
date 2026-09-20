"""Lage-Berechnung (Pitch/Roll/Gier) gegen Signale, deren Antwort vorher feststeht.

Echte Aufnahmen taugen zum Plausibilisieren, nicht zum Pruefen — bei handgewedelten Daten weiss
niemand, was herauskommen MUSS. Deshalb hier gebaute Signale mit bekannter Wahrheit.
"""
import math

import numpy as np
import pytest

from app.analysis.lage import (ACCEL_SCALE, GYRO_SCALE, hub_berechnen, lage_berechnen,
                               laufbereiche, zeitachse)


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
    """Konstante Drehung um die Hochachse mit 90°/s -> 90° je Sekunde, 270° je drei Sekunden."""
    hz, n = 100, 1000        # 10 s
    t = np.arange(n) * (1000.0 / hz)
    acc = np.tile(np.array([0.0, 0.0, 1.0]) * ACCEL_SCALE, (n, 1)).astype(np.int16)
    rate = math.radians(90.0)
    gyr = np.tile(np.array([0.0, 0.0, rate]) * GYRO_SCALE, (n, 1)).astype(np.int16)
    for fenster, soll in ((1.0, 90.0), (3.0, 270.0)):
        r = lage_berechnen(acc, t, gyr, t, ziel_hz=20, yaw_fenster_s=fenster)
        assert r["ok"]
        # Die erste Fensterlaenge ist noch nicht gefuellt -> hinten schauen.
        gemessen = np.median(np.array(r["gier_delta_deg"])[-40:])
        assert abs(gemessen - soll) < soll * 0.05, (fenster, gemessen)


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
    assert abs(np.median(np.array(r["gier_delta_deg"])[-30:]) - 45.0) < 4.0


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
    gekippter Halterung und einer Rollbewegung von ±`wedeln_grad` um diese Lage."""
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
    r = lage_berechnen(acc, t, gyr, tg, ziel_hz=20, ref_bereiche_ms=[(von, bis)])
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
    sauber = lage_berechnen(acc, t, gyr, tg, ziel_hz=20, ref_bereiche_ms=[(von, bis)])
    # Drei Sekunden auf dem Kopf mitten in der Fahrt.
    mit = acc.copy()
    a, b = int(20 * hz), int(23 * hz)
    mit[a:b] = (np.array([0.0, 0.0, -1.0]) * ACCEL_SCALE).astype(np.int16)
    gestoert = lage_berechnen(mit, t, gyr, tg, ziel_hz=20, ref_bereiche_ms=[(von, bis)])
    assert abs(gestoert["null_roll_deg"] - sauber["null_roll_deg"]) < 2.0, (
        sauber["null_roll_deg"], gestoert["null_roll_deg"])


def test_nullpunkt_haengt_nicht_am_gezeigten_ausschnitt():
    """Ein einzelner Lauf gezeigt, Bezug aber aus allen Laeufen -> dieselbe Null.

    Sonst spraenge der Rollwinkel beim Umschalten zwischen den Laeufen.
    """
    acc, t, gyr, tg, von, bis = _strand_dann_fahrt(strand_s=10, fahrt_s=40)
    bereiche = [(von, bis)]
    ganz = lage_berechnen(acc, t, gyr, tg, ziel_hz=20, ref_bereiche_ms=bereiche)
    teil = lage_berechnen(acc, t, gyr, tg, ziel_hz=20, ref_bereiche_ms=bereiche,
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
