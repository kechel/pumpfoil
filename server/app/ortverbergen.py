"""„Ort verbergen": die Spur bleibt, der Ort wird versetzt.

Jan, 25.09.2026: „Ich würde ja gern trotzdem den GPS-Track anzeigen, allerdings muss der halt
irgendwie repositioniert werden … irgendwo mitten auf dem Ozean. Dass es klar ist, dass man da
nicht wirklich pumpen war … Die Strecke, die man gefahren ist, muss ja nicht privat sein. Ich
glaube, es ging hauptsächlich um den Ort."

**Warum versetzen und nicht verunschaerfen.** Ein Radius oder ein Rauschen laesst offen, wie weit
daneben die Anzeige liegt — der Leser raetselt, ob die Strecke noch stimmt, und der Besitzer
raetselt, wie gut er geschuetzt ist. Eine Versetzung beantwortet beides: die Form und alle
Laengen bleiben exakt, der Ort ist erkennbar keiner.

**Warum Point Nemo.** Der ozeanische Pol der Unzugaenglichkeit, 2.688 km von jeder Kueste. Wer die
Koordinate nachschlaegt, sieht sofort, dass sie ein Platzhalter ist; die Kartenkacheln zeigen
leeres Blau, es gibt also auch keine Umgebung, die etwas verriete.

**Warum in Metern und nicht in Grad.** Ein Grad Laenge misst bei 54° Nord 65 km, bei 48° Sued
74 km. Wer Koordinaten einfach addiert, streckt die Spur um 14 % und macht aus einem 400-m-Lauf
456 m — die Zahlen in der Anzeige stuenden dann im Widerspruch zur gezeichneten Strecke. Deshalb:
die Spur relativ zu ihrem eigenen Mittelpunkt in Meter umrechnen und am Zielort neu projizieren.

**WO DAS BENUTZT WIRD.** Ausschliesslich am AUSGANG, kurz bevor Koordinaten den Server verlassen.
Gespeichert bleibt die Wahrheit — sonst braechen Spot-Zuordnung, Wetter und Reanalyse, und der
Schalter waere nicht mehr umkehrbar.

**AUCH FUER DEN BESITZER SELBST** (Jan, 25.09.2026): „wenn du die Location verbirgst, dann siehst
du auch selber, dass du an Point Nemo gesetzt bist. Das ist doch eine super Verifikation. Dann
sieht man sich selber an Point Nemo und weiss: so darf auch jeder andere sehen."

Das ist der Grund, aus dem hier NICHT nach Betrachter unterschieden wird — und es ist der bessere
Entwurf. Ein Schutz, den man selbst nie zu Gesicht bekommt, muss geglaubt werden; dieser hier
zeigt sich. Wer nachsehen will, wo es wirklich war, legt den Schalter um; die Daten sind
unveraendert da.
"""
from __future__ import annotations

import math

# Point Nemo. Die Koordinate ist die ueblich zitierte des ozeanischen Pols der Unzugaenglichkeit.
NEMO_LAT = -48.876667
NEMO_LON = -123.393333

# So heisst der Ort in der Anzeige. Der Zusatz („Position verborgen") ist UEBERSETZT und kommt
# aus der Oberflaeche — hier steht nur der Name, damit er in jeder Sprache derselbe bleibt.
NEMO_NAME = "Point Nemo"

_ERDRADIUS_M = 6_371_000.0


def _mittelpunkt(punkte: list[tuple[float, float]]) -> tuple[float, float]:
    """Einfacher Schwerpunkt. Fuer eine Aufnahme von wenigen Kilometern genau genug — die
    Kruemmung der Erde spielt auf dieser Laenge keine Rolle."""
    return (sum(p[0] for p in punkte) / len(punkte),
            sum(p[1] for p in punkte) / len(punkte))


def versetzen(punkte: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Eine Folge von (lat, lon) nach Point Nemo versetzen — formtreu und laengentreu.

    Der Mittelpunkt der Spur landet auf Point Nemo; jeder Punkt behaelt seinen Abstand und seine
    Richtung zum Mittelpunkt, in Metern gerechnet. Norden bleibt Norden: gedreht wird NICHT.
    Eine Drehung wuerde zwar noch schwerer rueckrechenbar, aber sie wuerde auch die Beziehung
    zwischen Spur und Windrichtung zerstoeren, und die ist fuer den Besitzer interessant.

    EHRLICH GESAGT: das schuetzt vor dem beilaeufigen Blick, nicht vor einem entschlossenen
    Menschen. Wer die Form einer Spur mit einer Kuestenlinie abgleicht, kann einen bekannten Spot
    wiederfinden. Genau deshalb heisst der Schalter „Ort verbergen" und nicht „anonym".
    """
    if not punkte:
        return []
    m_lat, m_lon = _mittelpunkt(punkte)
    # Meter je Grad am HERKUNFTSORT …
    m_je_grad_lat = math.pi * _ERDRADIUS_M / 180.0
    m_je_grad_lon_quelle = m_je_grad_lat * math.cos(math.radians(m_lat))
    # … und am ZIELORT. Nur der Laengen-Massstab unterscheidet sich (Breitengrade sind ueberall
    # gleich lang), und genau der ist die Falle.
    m_je_grad_lon_ziel = m_je_grad_lat * math.cos(math.radians(NEMO_LAT))
    aus = []
    for lat, lon in punkte:
        dy_m = (lat - m_lat) * m_je_grad_lat
        dx_m = (lon - m_lon) * m_je_grad_lon_quelle
        aus.append((NEMO_LAT + dy_m / m_je_grad_lat,
                    NEMO_LON + dx_m / m_je_grad_lon_ziel))
    return aus


def versetze_punkt(lat: float | None, lon: float | None,
                   bezug: tuple[float, float] | None = None) -> tuple[float | None, float | None]:
    """Einen EINZELNEN Punkt versetzen — z. B. die Startposition einer Aufnahme.

    `bezug` ist der Mittelpunkt, der auf Point Nemo abgebildet wird. Ohne ihn wird der Punkt
    selbst zum Mittelpunkt und landet exakt auf Point Nemo. Den Bezug mitzugeben ist wichtig,
    wenn mehrere Punkte DERSELBEN Aufnahme versetzt werden: sonst faellt alles auf denselben
    Fleck und die Abstaende sind weg.
    """
    if lat is None or lon is None:
        return (None, None)
    if bezug is None:
        return (NEMO_LAT, NEMO_LON)
    return versetzen([(lat, lon)] + [bezug])[0]


def ist_verborgen(session, profil_verbirgt: bool) -> bool:
    """Gilt „Ort verbergen" fuer DIESE Aufnahme?

    Drei Zustaende, und die Reihenfolge ist die ganze Logik: die Aufnahme entscheidet, wenn sie
    sich festgelegt hat; sonst gilt das Profil. `None` heisst ausdruecklich „ich habe mich nicht
    festgelegt" und nicht „nein" — nur deshalb erreicht eine spaetere Aenderung im Profil auch
    alles, was schon hochgeladen ist.
    """
    eigen = getattr(session, "ort_sichtbarkeit", None)
    if eigen == "hide":
        return True
    if eigen == "show":
        return False
    return bool(profil_verbirgt)


def profil_verbirgt(user) -> bool:
    """Liest `hide_location` aus den Einstellungen des Besitzers.

    Bewusst hier und nicht ueber `settings._merged`: das wuerde einen Import-Kreis schliessen
    (settings -> models -> …), und gebraucht wird genau ein Wahrheitswert. Fehlt die Einstellung,
    gilt „nein" — dieselbe Vorgabe wie in `settings.DEFAULTS`.
    """
    import json
    if user is None:
        return False
    try:
        return bool((json.loads(user.settings_json) if user.settings_json else {})
                    .get("hide_location", False))
    except (ValueError, TypeError):
        return False


def _koordinaten_sammeln(knoten, aus: list) -> None:
    """Alle [lon, lat]-Paare in einer GeoJSON-Struktur einsammeln (rekursiv)."""
    if isinstance(knoten, dict):
        for schluessel, wert in knoten.items():
            if schluessel == "coordinates":
                _koordinaten_sammeln(wert, aus)
            elif schluessel in ("features", "geometry", "geometries"):
                _koordinaten_sammeln(wert, aus)
    elif isinstance(knoten, list):
        if (len(knoten) >= 2 and isinstance(knoten[0], (int, float))
                and isinstance(knoten[1], (int, float))):
            aus.append(knoten)
        else:
            for k in knoten:
                _koordinaten_sammeln(k, aus)


def geojson_versetzen(gj):
    """Eine GeoJSON-Struktur nach Point Nemo versetzen — formtreu, in Metern gerechnet.

    Arbeitet auf einer Kopie und laeuft ueber die Struktur, statt ein festes Format anzunehmen:
    unsere Spuren sind LineStrings, aber ein FeatureCollection mit mehreren Teilen soll hier
    nicht still durchrutschen. GeoJSON speichert [LON, LAT] — in dieser Reihenfolge, und genau
    das ist die Stelle, an der man sich vertut.
    """
    import copy
    if not gj:
        return gj
    kopie = copy.deepcopy(gj)
    paare: list = []
    _koordinaten_sammeln(kopie, paare)
    if not paare:
        return kopie
    # [lon, lat] -> (lat, lon) und zurueck.
    versetzt = versetzen([(p[1], p[0]) for p in paare])
    for paar, (lat, lon) in zip(paare, versetzt):
        paar[0], paar[1] = lon, lat
    return kopie
