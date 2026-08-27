# Uhr-Puffer: wie lange die Uhr ohne Handy aufnehmen kann

Warum die Garmin-App eine Restzeit anzeigt und vorwarnt, woher die Zahlen kommen und wo die
Grenzen der Schätzung liegen.

## Das Problem

Die Uhr schreibt Roh-Chunks (GPS + Accel) in den Connect-IQ-**Object Store** und lädt sie hoch,
sobald das Handy in Reichweite ist. Ohne Handy wächst der Puffer, bis der Store voll ist — dann
**verwerfen `_flushGps`/`_flushAccel` die Daten** und der Rest der Session ist roh nicht mehr
vorhanden. Ein Nutzer hatte danach eine 54-Minuten-Session mit einem einzigen erkannten Lauf
(13.08., Instinct 2) und konnte sich das nicht erklären.

## Warum es geschätzt und nicht gemessen ist

**Connect IQ hat keine Auskunft über den freien Object Store.** `System.getSystemStats()` liefert
nur RAM (`totalMemory`/`freeMemory`), ein `freeStorage` existiert nicht. Also:

- **Verbrauch** = exakt bekannt aus der Chunk-Geometrie (dieselbe Rechnung wie `Uploader.pendingKb`):
  9 KB je Accel-Chunk (1500 Samples × 3 Achsen × 2 B) und 5 KB je GPS-Chunk (120 Samples bei 1 Hz).

  | Modus | KB/min | pro Stunde |
  |---|---|---|
  | full (25 Hz) | 11,5 | 0,67 MB |
  | lite (10 Hz) | 6,1 | 0,36 MB |
  | nur GPS | 2,5 | 0,15 MB |

- **Kapazität** = gemessen, von der Flotte gelernt. Läuft der Store voll, schickt die Uhr ihr
  Puffervolumen mit (`sf=1&kb=…` beim Config-Abruf); der Server merkt es sich je Gerät
  (`device_tokens.storage_full_kb`). Stand 27.08. haben **7 von 628 gepairten Uhren** je gemeldet:

  | Modell | voll bei | RAM des Geräts |
  |---|---|---|
  | Venu Sq | 431 KB | 128 KB |
  | Forerunner 935 | 241 KB | 128 KB |
  | fēnix 5X | 180 KB | **1,25 MB** |
  | Instinct 2S | 167 KB | 96 KB |
  | Instinct 2 · Forerunner 55 | 158 KB | 96 / 128 KB |

  **Die Grenze folgt NICHT dem RAM** — die fēnix 5X mit 1,25 MB lief bei 180 KB voll, die Venu Sq
  mit 128 KB erst bei 431. Es gibt also kein Modell-Schema, an dem man rechnen könnte; nur
  Messwerte.

## Wie das Budget zustande kommt

`GET /api/devices/config` → `storageBudgetKb`, in dieser Reihenfolge (`_storage_budget_kb`):

1. **Eigene Messung** dieser Uhr (`storage_full_kb`) — für dieses Gerät die Wahrheit.
2. **Minimum der Meldungen desselben Modells** (part_number) — die vorsichtigste bekannte Zahl.
3. **Sammelwert 200 KB** (`STORAGE_BUDGET_DEFAULT_KB`), wenn zu diesem Modell noch nie etwas
   gemeldet wurde.

Die Uhr cacht den Wert (`storagebudget_kb`), damit die Anzeige auch offline stimmt. Geschlossener
Kreis: messen → melden → Server merkt sich → kommt als Budget zurück. Nur Garmin — Wear OS,
watchOS und Zepp schreiben in echten Dateispeicher (Gigabytes) und können ihn selbst abfragen.

## Was die Uhr anzeigt

- **Startscreen**, nur ohne Handy in Reichweite: die Reichweite als Teil der Statuszeile, z. B.
  `GPS bereit · 25 Hz · ~14 min Puffer`. Sie steht in der Wichtigkeit **vor** dem Hz-Label — auf
  einer schmalen Uhr fällt lieber „25 Hz" weg als die Restzeit (s. `_zusammen`).
- **Während der Aufnahme**: orange Vorwarnung unten, `~12 min bis Speicher voll – beenden & syncen`,
  einmalige Vibration beim Unterschreiten. Sie ersetzt nicht die rote Meldung, wenn schon Daten
  verloren gehen (`err.dataLost`) — die sticht.

Die **Schwelle ist relativ** (`storageWarnMinutes`): 15 Minuten, aber höchstens 60 % der
Gesamtreichweite, mindestens 3 Minuten. Sonst stünde die Warnung auf einer 158-KB-Uhr im
25-Hz-Modus (12 min Gesamtreichweite) ab der ersten Sekunde:

| Budget | full (25 Hz) | lite (10 Hz) | nur GPS |
|---|---|---|---|
| 158 KB | 12 min gesamt → Warnung ab 7 min | 23 → ab 14 | 57 → ab 15 |
| 431 KB | 34 min gesamt → Warnung ab 15 min | 64 → ab 15 | 155 → ab 15 |

## Wann NICHTS angezeigt wird

- **Handy in Reichweite** — dann laufen die Chunks laufend hoch, der Puffer bleibt klein, eine
  Restzeit wäre schlicht falsch. Ausnahme: unter 3 Minuten wird trotzdem gewarnt, denn dann läuft
  der Puffer offensichtlich nicht leer (verbundenes Handy ohne Internet ist am Wasser häufig).
- **Budget unbekannt** (`storageBudgetKb == 0`, z. B. vor dem ersten Config-Abruf) — dann steht da
  nichts, statt eine erfundene Zahl.

## Genauigkeit — was die Zahl NICHT ist

Keine Tankuhr. `pendingKb()` schätzt (~±30 %, bewusst ohne eigene Byte-Buchhaltung: die bräuchte
zusätzliche Schreibzugriffe, und genau Schreiben scheitert bei vollem Speicher), und das Budget ist
ein Messwert von anderen Uhren, wenn die eigene noch nie voll war. Deshalb überall Tilde („~14 min")
und 10 % Sicherheitsabstand auf das Budget. Sie soll „reicht noch für den Nachmittag" von „reicht
noch für einen Lauf" unterscheiden.

## Code

| Was | Wo |
|---|---|
| Budget je Uhr | `server/app/api/devices.py` (`_storage_budget_kb`, `STORAGE_BUDGET_DEFAULT_KB`) |
| Meldung „Store war voll" | `server/app/api/devices.py` (`sf`/`kb`, entprellt) · `watch/source/Uploader.mc` (`_storageFull`, `storage_full_kb`) |
| Verbrauch + Restzeit | `watch/source/SessionRecorder.mc` (`kbPerMin`, `storageMinutesLeft`, `storageWarnMinutes`, `storageBudgetKb`) |
| Puffervolumen | `watch/source/Uploader.mc` (`pendingKb`, `pendingKbCached` — 30-s-Cache) |
| Anzeige | `watch/source/RecordView.mc` (`_drawStorageWarn`, Startscreen-Statuszeile) |
| Texte | `Strings.mc` / `StringsLite.mc`: `err.storageSoon`, `start.bufferMin` |
