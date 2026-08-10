# Datenweg: von der Uhr bis zur Anzeige

**Zweck.** Diese Datei sagt, welche Daten mit welchen Raten, Zeitstempeln und Offsets an jeder
Station wirklich verwendet werden — belegt an echten Sessions, nicht aus dem Gedächtnis. Sie
existiert, weil dieselben drei Verwechslungen wiederholt zu Fehlbefunden geführt haben:

1. **Roh-Zeitstempel ≠ Analyse-Zeit.** Die Segment-Zeiten sind auf den Trim **re-basiert**.
2. **Index ≠ Sekunde.** GPS ist ~1 Hz, aber mit Löchern; es gibt kein gleichmäßiges Raster.
3. **Getaggte Rate ≠ echte Rate.** Die Uhr meldet 25 Hz und liefert 50 Hz.

> **Harte Regel:** kein Befund über Zeitachsen ohne Gegenprobe. Am Ende stehen fertige
> Prüf-Rezepte (§10). Wer eine Zahl nicht gegengeprüft hat, schreibt sie nicht als Tatsache.

Stand: 2026-08-10. Belegt an 1220 analysierten Sessions; Detailmessungen an Session #1814
(Wear OS, 2,5 h, 449.129 Accel-Samples, 8.181 GPS-Samples).

---

## 1. Die eine Zeitachse

Nullpunkt jeder Session ist der **Aufzeichnungsstart auf der Uhr**. Alles heißt
`*_ms` = **Millisekunden seit Session-Start**. Es gibt drei Zeitbegriffe, und sie werden
regelmäßig verwechselt:

| Begriff | Wo | Beispiel #1814 |
|---|---|---|
| **Session-ms** | Rohdaten (`gps/*.json`, `t0_ms`), `timebase.py`, `t_*_session_ms` | Lauf 9 = 5.111.308…5.188.309 |
| **Trim-re-basierte ms** | `segments_json.t_start_ms`, `accel_windows_json.t_center_ms` | Lauf 9 = 4.510.005…4.587.006 |
| **Sample-Index** | nur innerhalb von `gps.py` (`i_start`/`i_end`) | Lauf 9 = 3901…3978 |

Umrechnung: `Session-ms = re-basierte ms + sessions.trim_start_ms` (bei #1814: + 601.303 ms).

Alle drei Zahlen für denselben Lauf sind verschieden. **Wer sie gleichsetzt, misst am falschen
Ort** — genau das ist bei der Untersuchung von #1814 passiert (dreimal, bis die Gegenprobe kam).

---

## 2. Upload-Vertrag (Server-Sicht)

`server/app/api/ingest.py` + `schemas.py`. Ergänzt `docs/data-format.md` (Client-Sicht) und
`docs/ingest-contract.md` (wie eine neue Plattform Recorder wird).

**Session anmelden** — `POST /api/ingest/session`, `SessionStartIn`:

| Feld | Default | Bedeutung |
|---|---|---|
| `gps_hz` | `1` | **nominale** GPS-Rate. In allen 1220 Sessions `1`. Nur Rechengröße für Fensterbreiten, nie Wahrheit. |
| `accel_hz` | `25` | **angeforderte** Accel-Rate. Nie Wahrheit (§5). |
| `accel_scale` | `2048` | int16-Einheiten pro g. In allen Sessions `2048`. |
| `expected_chunks` | – | für Resume/Fortschritt |

**Chunk hochladen** — `POST /api/ingest/session/{uuid}/chunk`, `ChunkIn`:

| Feld | Bedeutung |
|---|---|
| `index` | Chunk-Nummer. Eindeutigkeit ist **(session, kind, index)** — der Vertrag erlaubt getrennte Zähler je Sorte. |
| `kind` | `"gps"` \| `"accel"` |
| `data` | GPS: Liste von Samples. Accel: base64-int16 (s. §4) |
| `t0_ms` | **optional** — Session-ms des ersten Samples im Chunk. Der einzige belastbare Zeitanker für Accel. |

Idempotent: gleiche `(session, kind, index)` überschreibt → Resume kostet keine Daten.

---

## 3. Was die Plattformen wirklich schicken

Gemessen über alle nicht gelöschten Sessions:

| Plattform | Sessions | getaggt `accel_hz` | Chunk-Nummerierung | `t0_ms` |
|---|---|---|---|---|
| garmin | 522 | 25 (493), 10 (28, Lite-Modus), 100 (1) | **getrennt/lückig** je Sorte | ab 1.0.71/72 ja |
| wear | 57 | 25 | **gemeinsamer** Zähler | ab 1.2.16 ja |
| apple | 61 | 25 | **gemeinsamer** Zähler | ab 1.1.18 ja |
| (Gerät gelöscht/alt) | 588 | 25 / 50 / 100 | gemischt | meist nein |

Zwei Konsequenzen, die man kennen muss:

- **Der gemeinsame Zähler (nur wear/apple) datiert Accel-Chunks über die GPS-Nachbarn.** Weil die
  Nummern verschränkt sind (bei #1814 Accel 915 + GPS 851 = Nummern 0…1765 lückenlos), tragen die
  GPS-Chunks echte Zeitstempel für die Accel-Chunks daneben. Bei #1814 stimmt das auf 4,5 s mit
  `t0_ms` überein — brauchbare unabhängige Gegenprobe. **Für Garmin funktioniert das nicht.**
- **`accel_hz` ist eine Anforderung, keine Messung.** Garmin/Wear bekommen
  `sampleRate => 25` gesetzt (`watch/source/SessionRecorder.mc:25`, `ACCEL_HZ = 25`), das Gerät
  liefert aber die nächstliegende unterstützte Rate. Bei #1814 (Wear) waren es **50,21 Hz**.

---

## 4. Was auf der Platte liegt

`server/data/<session_uuid>/`:

| Pfad | Format |
|---|---|
| `accel/<index>.bin` | int16 **little endian**, 3 Achsen **verschränkt** (x,y,z,x,y,z…). Samples = Dateigröße / 6. Einheit: Rohwert / `accel_scale` = g |
| `accel/<index>.t0` | Sidecar mit `t0_ms`, **nur wenn der Client es geschickt hat** |
| `gps/<index>.json` | JSON-Liste von Samples (s. u.) |

**GPS-Sample = `[t_ms, lat, lon, speed_mps, hr_bpm, h_acc_m]`** — 6 Felder, bei #1814 in allen
8.181 Samples vollständig (kein `null`). Beispiel:
`[5111308, 52.4887182, 13.4816761, 3.13, 0, 9.94]`

- `t_ms` = **Session-ms**, nicht Uhrzeit, nicht Unix-Zeit.
- `speed_mps` = **von der Uhr gemeldet** (Doppler). Wird bevorzugt benutzt (§6).
- `hr_bpm` = **0, wenn kein Puls aufgezeichnet wurde** (bei #1814 durchgehend 0). Das ist kein
  Fehler in den Daten, aber `detect_v2`s Fremdkraft-Erkennung über die Pulsantwort kann dann nichts
  entscheiden.
- `h_acc_m` = horizontale Genauigkeit (bei #1814 3,8…122 m).

**GPS hat Löcher.** #1814: 8.181 Samples auf 9.086 s Spanne → **905 Sekunden ohne Fix**. Ein
Sample-Abstand ist also *typisch* ~1 s, aber nicht garantiert. Deshalb ist jede Rechnung
„Index × 1 s" falsch.

---

## 5. Die Accel-Zeitachse — die gefährlichste Stelle

`server/app/analysis/timebase.py`. Accel-Samples tragen **keine eigenen Zeitstempel**; die Achse
wird gebaut. Rangfolge:

1. **`exact_chunks`** — `t0_ms` je Chunk. Die einzige gemessene Variante. 193 Sessions.
2. **`measured_rate`** — eine *einzige* Rate `n / gps_end_ms`, Sample 0 bei t = 0. **458 Sessions.**
3. **`uncertain`** — getaggte Rate als Notbehelf. 52 Sessions.
4. **`none`** — kein Accel. 517 Sessions.

Die Herkunft steht in **jeder** Session unter `analysis_results.metrics_json`:
`time_base`, `accel_hz`, `accel_hz_tagged`, `accel_hz_measured`, `accel_hz_deviation`,
`time_base_notes`. **Diese Felder zuerst lesen, bevor man eine Zahl glaubt, die vom Accel abhängt.**

Variante 1 wird verworfen, wenn eine von vier Prüfungen fällt (Zähler über alle Sessions):

| Grund | Sessions | Bewertung |
|---|---|---|
| `N von N Chunks ohne t0_ms` | 489 | korrekt — alte Clients |
| `t0_ms nicht streng wachsend` | 10 | korrekt — Default-Nullen |
| **`Chunk-Rate X Hz außerhalb des Bandes um Y Hz`** | **10** | **Fehler, s. §9.1** |
| `Chunk-Kette reicht über das GPS-Ende hinaus` | 1 | korrekt — fremde Zeitbasis |

Die Summe 489 + 10 + 10 + 1 = 510 ist genau `measured_rate` (458) + `uncertain` (52) — die
Aufstellung ist also vollständig, es gibt keinen weiteren Verwerfungsgrund.

**Was `measured_rate` unterstellt** (und bei #1814 falsch ist):

- die Accel-Spur beginnt bei Session-ms 0,
- sie ist **lückenlos**,
- sie hat **eine konstante Rate**,
- `gps_end_ms` (Zeitstempel des letzten GPS-Samples) sei die Dauer der Spur — der GPS-Vorlauf bis
  zum ersten Fix (bei #1814 **72,4 s**) wird also mitgerechnet.

---

## 6. GPS-Auswertung

`server/app/analysis/gps.py`, Eintritt `analyze_gps(samples, gps_hz=1, …)`.

**Es gibt kein Resampling.** Gerechnet wird direkt auf der Sample-Liste; `gps_hz` dient nur dazu,
Sekunden in Sample-Anzahlen umzurechnen (Median-Fenster, Dwell-Zeiten). Bei Löchern in der Spur
deckt ein „15-s-Fenster" also mehr als 15 echte Sekunden ab — bekannte Ungenauigkeit, keine
Wahrheitsverletzung.

Reihenfolge (`gps.py:228`…):
1. Koordinaten säubern: `_fill_invalid_coords` (180/180-Sentinels), `_repair_spikes`.
2. Schrittdistanzen; Einzelschritte über `OUTLIER_STEP_M` (~>90 km/h in 1 s) zählen **nicht**.
3. **Geschwindigkeit**: `speed = where(isnan(speed_raw), speed_from_pos, speed_raw)` — das
   **gemeldete** Feld hat Vorrang, Position/Zeit ist nur Ersatz für fehlende Werte.
4. Glitch-Filter: Werte über `GLITCH_SPEED_MPS` → 15-s-Median.
5. Doppler-Burst-Filter (relativ **und** absolut, 2026-07-04) → 15-s-Median.
6. Maske (Modell oder Heuristik) → Segmente → Nachbearbeitung (`_merge_no_stop`,
   `_repair_deadreckoning`, `_trim_fall_tail`, `_extend_ends_forward`).

**Segment-Felder** (`analysis_results.segments_json`, 41 Felder):
`i_start`/`i_end` = Sample-Index · `t_start_ms`/`t_end_ms` = **trim-re-basiert** ·
`t_start_session_ms`/`t_end_session_ms` = **Session-ms** · `distance_m`, `max_speed_mps`,
`pumps`, `num_glides`, `longest_glide_s`, …

`longest_glide_s` ist die **längste Lücke zwischen zwei erkannten Pumps** innerhalb des Laufs —
keine gemessene Gleitphase. Bei #1814/Lauf 9: 42 Pumps, 43 Glides, längste Lücke 45,04 s.
Ein hoher Wert heißt deshalb primär: *hier wurden Pumps nicht erkannt*.

---

## 7. Accel-Fenster

`windows.py` → `analysis_results.accel_windows_json`. Bei #1814: 4.196 Fenster, **2-s-Raster**
(Median-Abstand exakt 2,00 s), `t_center_ms` auf der **trim-re-basierten** Achse
(2,0 s … 8.385,0 s bei einer Trim-Dauer von 8.388 s).

Je Fenster: `rms`, `dom_freq`, `band_power_ratio`, `spectral_entropy`, `label`
(`pumpen` | `gleiten` | `ruhe`), `i_start`/`i_end`.

Segmente und Accel-Fenster liegen damit auf **derselben** Skala — hier ist kein Achsenbruch.
Der Bruch sitzt eine Stufe früher, beim Bau der Accel-Achse (§5).

---

## 8. Analyse-Ergebnis in der DB

`analysis_results`: `metrics_json` (inkl. Herkunftsblock §5), `segments_json`,
`accel_windows_json`, `track_geojson`, `sensitivity_json`, `start_attempts_json`.
`sessions` trägt die Aufzeichnungs-Metadaten (`gps_hz`, `accel_hz`, `accel_scale`,
`trim_start_ms`, `trim_end_ms`, `excluded_ranges`, `app_version`, …).

---

## 9. Bekannte Defekte

### 9.1 Die richtige Achse wird wegen der falschen Rate verworfen  🔴 offen

`timebase.py:34` `T0_RATE_BAND = (0.5, 2.0)` prüft die aus `t0_ms` gewonnene Chunk-Rate gegen die
**getaggte** Rate — obwohl das Modul im eigenen Docstring festhält, die getaggte Rate sei
„NIE Wahrheit". Bei #1814: 50,19 / 25 = **2,0076** → 0,4 % über der Schranke → die exakte Achse
(alle 915 `t0`-Sidecars vorhanden, streng wachsend, Median-Abstand 10,01 s) wird verworfen.

Folge über die Ersatzachse (`measured_rate`, 49,041 Hz statt echt 50,21 Hz):

| Session-Sekunde | 646 | 1949 | 3902 | 5207 | 7156 | 7810 | 9151 |
|---|---|---|---|---|---|---|---|
| Versatz der Accel-Achse | +20 s | +50 s | +95 s | **+123 s** | **+171 s** | −28 s | +5 s |

Der Sprung bei ~7,2 ks kommt dazu: dort fällt die Uhr für ~380 s auf **25 Hz** (43 Chunks mit ~250
statt ~502 Samples, zusammen −213 s Daten). Eine einzige Durchschnittsrate kann eine Spur mit
wechselnder Rate grundsätzlich nicht abbilden.

**Nachweis am Lauf 9** (Session 5.111,3–5.188,3 s), rms je 10-s-Scheibe:

| | 5111 | 5121 | 5131 | 5141 | 5151 | 5161 | 5171 |
|---|---|---|---|---|---|---|---|
| echte Achse (g) | 0,64 | 0,62 | 1,32 | 0,92 | 0,59 | 0,65 | 0,70 |
| Pipeline-Achse (g) | 0,03 | 0,02 | 0,02 | 0,01 | 0,007 | 0,16 | 0,13 |

Es wurde also durchgehend gepumpt (0,77 g über den Lauf), gelesen wurde ein Stillstand 124 s
daneben. Deshalb „hören die Pumps mitten im Lauf auf" und es erscheint eine 45-s-Gleitphase.
GPS ist dabei einwandfrei: 77 Samples, gemeldete 3,1–4,8 m/s, 285,7 m in 77 s.

**Betroffen: 10 Sessions** (wear 4, apple 2, garmin 1, ohne Gerät 3) — die mit einem
`accel_hz_deviation` nahe ±100 %.

*Vorgeschlagener Fix* (Änderung an der Analyse-Pipeline braucht Jans OK): die `t0`-Achse **nicht**
gegen die getaggte Rate prüfen. Die tragenden Prüfungen bleiben (`t0_ms` überall vorhanden, streng
wachsend, Kette überragt das GPS-Ende nicht) — die Bandprüfung sollte nur noch Unsinn abfangen
(z. B. Faktor >10), nicht einen um 2× falschen Tag.

### 9.2 `hz_measured` rechnet den GPS-Vorlauf als Datendauer mit  🟠 offen

`timebase.py:144` `hz_measured = n / (gps_end_ms / 1000.0)` benutzt den **Zeitstempel** des letzten
GPS-Samples als Dauer. Der Vorlauf bis zum ersten Fix (bei #1814 72,4 s) gehört aber nicht zur
Spur. Richtiger Nenner wäre `gps_end_ms − gps_start_ms`. Wirkt auf alle **458**
`measured_rate`-Sessions; Größe des Fehlers = Vorlauf / Gesamtdauer (bei #1814 0,8 %, was am Ende
72 s Drift ergibt).

---

## 10. Prüf-Rezepte

**(a) Herkunft der Zeitachse einer Session** — immer der erste Schritt:

```bash
cd /home/jan/garmin-connect-iq/server && .venv/bin/python -c "
import os,json; env=dict(l.split('=',1) for l in open('.env') if '=' in l and not l.startswith('#'))
os.environ['DATABASE_URL']=env['DATABASE_URL'].strip().strip('\"')
from sqlalchemy import create_engine,text
with create_engine(os.environ['DATABASE_URL']).connect() as c:
    m=json.loads(c.execute(text('select metrics_json from analysis_results where session_id=1814')).scalar())
    print({k:m.get(k) for k in ('time_base','accel_hz','accel_hz_tagged','accel_hz_measured','accel_hz_deviation','time_base_notes')})"
```

**(b) Lauf-Zeit richtig umrechnen** (re-basiert → Session): `t_start_session_ms` nehmen. Wenn das
Feld fehlt: `t_start_ms + sessions.trim_start_ms`.

**(c) Echte Accel-Rate aus den Dateien** (unabhängig von jedem Tag):

```bash
cd /home/jan/garmin-connect-iq/server/data/<uuid> && python3 -c "
import os,re,json,numpy as np
c=[os.path.getsize(f'accel/{f}')//6 for f in os.listdir('accel') if f.endswith('.bin')]
g=[]
for f in os.listdir('gps'):
    a=json.load(open('gps/'+f)); g += [s[0] for s in (a if isinstance(a,list) else a['data'])]
print('Samples',sum(c),'GPS-Spanne s',(max(g)-min(g))/1000,'-> Rate',sum(c)/((max(g)-min(g))/1000))"
```

**(d) Fällt die Accel-Aktivität mit den Läufen zusammen?** Kreuzkorrelation von „im Lauf" (GPS)
gegen `rms` (Accel-Fenster) über ±300 s. Ein Maximum bei **0 s** heißt: Achse stimmt. Jede andere
Lage ist ein Zeitversatz — bei #1814 lag das Maximum je Viertel bei −57/−118/−140/+25 s.

**(e) Nie die Uhr-Rate glauben.** `sessions.accel_hz` ist die *Anforderung* der App. Die echte Rate
steht in `metrics_json.accel_hz_measured` bzw. folgt aus (c).

---

## 11. Noch nicht belegt (offen)

Diese Abschnitte fehlen bewusst, statt geraten zu werden:

- **Recorder je Plattform im Detail**: Garmin (`watch/`) ist angelesen (`ACCEL_HZ = 25`,
  `ACCEL_HZ_LITE = 10`, `t0_ms` über `_accelT0`), aber Wear (`android/wear`), Apple
  (`watch-apple/Sources`) und Zepp (`watch-zepp/`) sind noch nicht gegen den Code belegt:
  welche Sensor-API, welche angeforderte und welche gelieferte Rate, woher `t0_ms` kommt,
  was bei Pausen/Throttling passiert (bei #1814 der Abfall auf 25 Hz — Ursache unbekannt).
- **Profil-Einstellung der Aufzeichnung**: `record_mode` (`normal`/`lite`) — Wirkung auf Rate
  und GPS-only ist für Garmin belegt, für die anderen Plattformen nicht.
- **Handy-als-Recorder** (`phone_rec_enabled`) — Rate/Zeitstempel ungeprüft.
- **Ältere Modelle / GPS-only**: `<15 Hz → gps_only` ist als Regel bekannt, aber die
  Schwellen-Herkunft ist hier nicht dokumentiert.
- **FIT-Import**: Zeitbasis, Raten und Offsets ungeprüft.
- **Anzeigeschicht**: welche API-Felder Web/Android/iOS je Kennzahl zeigen, und wo gerundet wird.
