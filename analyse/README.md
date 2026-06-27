# Foil-Mast-IMU vs. Wrist — Dual-Watch-Experiment (2026-06-27)

Explorative Auswertung von **gleichzeitig** aufgezeichneten Pumpfoil-Läufen mit
zwei Garmin-Uhren auf unserer Recorder-App. Ziel: herausfinden, was aus einer am
**Foil-Mast** montierten Uhr (direkte Foil-Bewegung) gegenüber der **Handgelenk**-Uhr
herauszuholen ist — Pump-Kadenz, Foil-Lage, Vortriebs-Surge etc.

Siehe Memory `board-imu-experiment`. **Nur lokal/explorativ — nichts davon geht auf die Website.**

## Setup
- **fenix** (Jans Konto, user 2): am **Handgelenk**, 25 Hz Accel, gutes GPS.
- **FR55** (Philipps Konto, user 5): am **Foil-Mast, unter Wasser**, **über Kopf**
  montiert, **Start-Knopf (rechts) in Fahrtrichtung**. 10 Hz Accel (Modus „Sparsam").
  **Kein brauchbares GPS** (Satellitensignal kommt unter Wasser nicht durch).

## Zeit-Sync
Die Session-UUID beginnt mit der **Unix-Startzeit** der Uhr (`<unix>-<rand>`). Beide
Uhren haben synchronisierte Systemzeit → beide Accel-Streams lassen sich **absolut**
ausrichten (Sample i bei `start_unix + i/hz`). Feinabgleich zusätzlich per
Kreuzkorrelation des Accel-Betrags.

## Datenskalierung (wichtig)
Garmin liefert Accel in **milli-g**; unsere Uhr speichert die Rohwerte direkt, deklariert
in der Meta aber fälschlich `accel_scale=2048`. Physikalisch korrekt ist **÷1000 = g**
(Ruhe ≈ 1 g). Hier durchgehend ÷1000 verwendet. → **TODO**: accel_scale-Bug auf der
Uhr/Server fixen (betrifft auch die Server-Pump-Analyse-Skalierung).

## Session-Paare (heute nach 19:00)
| Paar | Zeit | fenix (Wrist) | FR55 (Mast) | fenix-Foiling |
|------|------|---------------|-------------|----------------|
| 1 | 19:58 | 307 | 312 | 1 Lauf, 111 m, 16,8 km/h |
| 2 | 20:10 | 308 | 313 | 0 Läufe (Jan nicht gefoilt — evtl. Fremdfahrer) |
| 3 | 20:26 | 309 | 314 | 1 Lauf, 168 m, 18,7 km/h |
| 4 | 20:38 | 310 | 315 | 1 Lauf, 162 m, 17,0 km/h |
| 5 | 20:53 | 311 | 316 | 1 Lauf, 169 m, 16,6 km/h |

FR55-GPS überall ~0 (unter Wasser) — Matching daher über die Zeit/Accel.

## Skripte
- `lib.py` — lädt Accel (÷1000 g) + GPS direkt aus `server/data/<uuid>/`.
- `01_overview.py` — Timeline je Paar: Accel-Betrag Mast vs. Wrist + fenix-GPS-Speed.
- `02_pump_spectrum.py` — Pump-Frequenz (Welch-PSD / Spektrogramm) Mast vs. Wrist im Foiling-Fenster.
- `03_orientation.py` — Foil-Lage (Pitch/Roll aus Gravitation) am Mast über die Zeit.
- Ausgaben → `out/`.

## Findings
Siehe `FINDINGS.md` (wird beim Durchlauf gefüllt).
