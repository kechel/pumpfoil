# Tempo-Verteilung — Plan und Stand

Anregung aus einer Nutzermeldung im Chat (23./24.11.2026): eine Verteilungskurve des Tempos je Session, je Foil eines
Fahrers und je Foil über alle Fahrer — „gives a better idea of the usable range you can expect". Jan, 24.11.: Home ›
Stats › neuer Reiter; Plan abgesegnet („so machen nach deiner empfehlung").

## Was es zeigt (eigene Note, keine Kopie)

- **Nur Zeit auf dem Foil**, in Sekunden je 0,5 km/h — innerhalb der Läufe; Paddeln, Laufen, Liegen zählen nicht.
- **Gleiten getrennt** (pg-1): der dunklere Teil jedes Balkens ist der Anteil in erkannten Gleitphasen. Hochgerechnet
  je Stufe über die Läufe, für die Gleiten bekannt ist (`g_basis`). Die Erkennung findet etwa die Hälfte der echten
  Gleitphasen — der Hinweis unter dem Diagramm sagt das.
- **Nutzbarer Bereich**: Band 10.–90. Perzentil, Strich am Median; als Satz darunter.
- **Vergleich** als Stufenlinie: ein anderes eigenes Foil oder alle Fahrer auf dem gewählten Foil.
- Nur Anteile auf der y-Achse (Reihen mit sehr verschiedener Fahrzeit bleiben vergleichbar); Sekunden im Tooltip.
- Stufen: 0,5 km/h gespeichert; angezeigt in 0,5 erst ab 2 h Fahrzeit und ohne Vergleich, sonst 1 km/h.

## Umsetzung

| Teil | Wo |
|---|---|
| Rechnen je Session | `server/app/analysis/tempo_hist.py` — `{"v":1,"a":[80],"g":[80]\|null}`, ~350 Byte |
| Cache | `analysis_results.tempo_hist_json`; `run_analysis` und `pumpgleit.stufe` setzen ihn zurück (wie `low_end_json`) |
| Nachrechnen | in den Abrufen (höchstens 300 je Aufruf) und `scripts/tempo-hist-nachtragen.py --echt` (Bestand) |
| API | `GET /api/tempo/eigen?period&foil_id&spot_id&sport`, `GET /api/tempo/foil/{id}` (`server/app/api/tempo.py`) |
| Web | `web/src/components/TempoVerteilung.tsx` (Diagramm), `TempoBereich.tsx` (Home › Stats › Tempo) |

**Index ist nicht Sekunde** (DATA-PIPELINE, Falle 2): GPS hat Löcher (gemessen: 39-s-Lauf mit 12 Punkten). Jeder Punkt
eines Laufs zählt `duration_s / (i_end - i_start)` Sekunden. Geprüft an 300 Sessions: Summe = `foiling_time_s`.

**Community je Foil:** erst ab 3 Fahrern (wie die öffentliche Foil-Tabelle), nur als Summe. Je Fahrer erst auf Anteile
normiert, dann gemittelt — sonst bestimmt der Fahrer mit den meisten Stunden die Kurve. Ausgabe in Promille, keine
Sekunden, keine Einzelwerte. 10 min gecacht.

**Gleiten hängt am Anzeige-Schalter nicht:** verwendet wird `pg_glides`, wo `pg_pumps` gesetzt ist (pg-1 ist in Prod an).

## Stand

| Schritt | Stand |
|---|---|
| 1. Spalte, Rechnen, API, Home › Stats › Tempo | ✅ 24.11.2026 live (Web) |
| Bestand nachtragen (`tempo-hist-nachtragen.py --echt`, ~22.000 Analysen) | offen — Jan startet (die Abrufe füllen bis dahin selbst nach) |
| 2. Session-Details: Streifen je Session / je Lauf | offen |
| 3. Community › Foil-Stats › Foil: alle Fahrer + eigene Kurve | offen (API steht schon: `/api/tempo/foil/{id}`) |
| Native Apps (Parität) | offen |
| Übersetzungen außer de/en/de-AT/gsw | offen (fallen auf Englisch zurück) |

Ideen für später: eigenes Low End (analysis/lowend.py) als Markierung; Vergleich zweier Zeiträume.
