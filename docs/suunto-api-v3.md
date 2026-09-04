# Suunto Workout API v3 — was wir wissen, und woher

**Stand 2026-09-04.** Die Angaben unten sind **nicht geraten**, sondern aus dem Entwickler-Portal
gezogen: die API Zone von Suunto läuft auf Azure API Management, und dessen Portal-Datenschnittstelle
antwortet **ohne Anmeldung**:

```bash
curl "https://apizone.suunto.com/developer/apis?api-version=2022-04-01-preview"
curl "https://apizone.suunto.com/developer/apis/suunto-workout-api/operations?api-version=2022-04-01-preview"
curl "https://apizone.suunto.com/developer/apis/suunto-workout-api/operations/get-workout-lists?api-version=2022-04-01-preview"
```

Die sichtbaren Doku-Seiten (`/how-to-start`, `/faq`) beschreiben nur die **alte** v2-Welt — deshalb
dieser Weg. Wer die Angaben nachprüfen will, ruft die drei Zeilen oben auf.

## Alle Suunto-APIs (10, Stand 04.09.2026)

| Anzeigename | Pfad | für uns |
|---|---|---|
| SUUNTO WORKOUT API | `/v3/workouts` | **der Nachfolger, den wir wollen** |
| SUUNTO WORKOUT API (DEPRECATED) | `/v2` | **das, was wir heute benutzen** |
| SUUNTO WORKOUT DESCRIPTION API | `/v1/workouts` | älter, nicht neuer — trotz des Namens |
| SUUNTO UPLOAD API | `/v2/upload` | Workouts zu Suunto schicken (nicht unser Fall) |
| SUUNTO AUTHORISATION API | `/` | OAuth |
| SUUNTO 247 DATA API | `/247samples` | Dauermessung (Puls/Schritte über den Tag) |
| SUUNTO DAILY ACTIVITY API | `/247` | Tageswerte |
| SUUNTO ROUTE API | `/v2/route` | Routen |
| SUUNTO GUIDES API | `/v2/guides` | Guides |
| SUUNTO POINT OF INTEREST API | `/v2/poi` | POIs |

**Wichtig gegen ein Missverständnis:** die „WORKOUT DESCRIPTION API" liegt auf `/v1` und ist damit
**älter** als das, was wir nutzen. Sie ist NICHT der Nachfolger, auch wenn sie in den Berichten
neben der deprecated-API auftaucht (Notiz vom 02.09. entsprechend korrigiert).

## v3 im Detail — drei Operationen

Basis: `https://cloudapi.suunto.com/v3/workouts`
Kopfzeilen wie bisher: `Authorization: Bearer <token>` **und** `Ocp-Apim-Subscription-Key: <key>`.

### 1. Liste — `GET /v3/workouts`

> Get list of workouts for the authenticated user.
> Beispiel: `/v3/workouts?since=1709251200000&until=1711929600000&limit=10&offset=0`

| Query | Typ | Bedeutung |
|---|---|---|
| `since` | integer | Mindest-Zeitstempel **inklusive**, epoch **Millisekunden**. Standard 0 |
| `until` | integer | Höchst-Zeitstempel **exklusive**, epoch ms. Standard: jetzt |
| `limit` | integer | Höchstzahl Workouts. **Standard 50** |
| `offset` | integer | zu überspringende Workouts. Standard 0 |
| `filter-by-modification-time` | boolean | filtert nach **Änderungszeit** (true) statt Startzeit (false) |

Antwort: `application/json` (200), Fehler 400/403.

**Das ist mehr, als v2 kann:** Seitenweises Abholen (`limit`/`offset`) und die Filterung nach
Änderungszeit. Letztere ist für einen Sync genau das Richtige — man holt, was sich seit dem letzten
Lauf geändert hat, statt jedes Mal die ganze Liste.

### 2. Ein Workout — `GET /v3/workouts/{workoutKey}`

Query `extensions`: kommagetrennte Liste zusätzlicher Datenarten im `extensions`-Array der Antwort.
Antwort `application/json`.

### 3. FIT-Datei — `GET /v3/workouts/{workoutIdOrKey}/fit`

Antwort `application/octet-stream` (200), Fehler 400/403/404. Pfad-Parameter ist der `workoutKey`.

**Damit ist die entscheidende Frage beantwortet:** der FIT-Export überlebt den Versionswechsel.
Unser Import hängt daran (`fitimport.parse_fit_bytes` → `import_parsed_session`), eine reine
Kennzahlen-API hätte uns nichts genützt.

## Unterschiede zu v2, die beim Umbau auffallen

| | v2 (heute aktiv) | v3 |
|---|---|---|
| Liste | `GET /v2/workouts` | `GET /v3/workouts` |
| FIT | `GET /v2/workout/exportFit/{key}` | `GET /v3/workouts/{key}/fit` |
| Seitenweise | nein | `limit` / `offset` |
| Nach Änderung filtern | nein | `filter-by-modification-time` |

## Womit man rechnen muss

- **Die Form der Listen-Antwort ist nicht dokumentiert.** v2 liefert `{"payload": [...]}`; unser
  Code liest deshalb `payload`/`workouts`/eine nackte Liste. Für v3 bleibt das defensiv, bis wir es
  an einem echten Konto gesehen haben.
- **Kontingent:** in den Portal-Berichten tauchten unter der v2-API blockierte Aufrufe auf (das
  Wochenkontingent der Developer-Stufe). Ob v3 andere Grenzen hat, sagt die Portal-Doku nicht.
- **Webhooks** gibt es laut API-Beschreibung unter `apizone.suunto.com/webhooks` — bisher nicht
  ausgewertet; damit könnte der Sync später von „abholen" auf „geschoben bekommen" wechseln.

## Wie es bei uns eingebaut ist

`server/app/api/suunto.py` kennt beide Wege. **Welcher gilt, entscheidet `SUUNTO_API_V3` in
`server/.env`** — ohne die Variable bleibt alles bei v2.

**🟢 Seit 04.09.2026 ist v3 aktiv** (`SUUNTO_API_V3=1`, Jans Freigabe nach dem Vergleich unten).
Rueckweg: die Zeile aus `server/.env` entfernen und neu starten; die v2-Pfade bleiben im Code.

**Vorher an zwei echten Konten gemessen** (u417, Xiaomi ueber Mi Fitness; und Jans eigenes):

| | v2 | v3 |
|---|---|---|
| Liste | 1 Workout | 1 Workout, gleicher `workoutKey` |
| Kennzahlen | 221,0 m · 105 s · avgSpeed 2,1 | identisch |
| FIT-Datei | 2436 Bytes | 2436 Bytes, **sha256 identisch** |
| durch `parse_fit_bytes` | 88 Punkte, Puls 69–137 | identisch |

Der sha256 (`06524c3c…`) ist zugleich der `content_hash` der daraus entstandenen Session 3453 —
es ist also nachweislich dieselbe Datei. `_liste_lesen` kam mit der v3-Antwort ohne Anpassung
klar. Erster Lauf ueber v3 im Betrieb: u417 `0 importiert / 1 doppelt`, Jan
`0 importiert / 3 zu kurz / 1 doppelt`. Zum Vergleichen gibt es
`GET /api/integrations/suunto/vergleich` (eingeloggt, rein lesend): der Endpunkt holt dieselbe
Liste über **beide** Versionen und sagt, wie viele Workouts jede liefert und ob die Schlüssel
übereinstimmen. Erst wenn das an einem echten Konto passt, wird umgeschaltet (Jan, 04.09.).
