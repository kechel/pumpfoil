# Föderation — Konzept-Entwurf (Diskussionsgrundlage)

> Stand 03.11.2026, Entwurf aus dem Abend-Gespräch Jan ↔ Claude. Nichts hier ist
> beschlossen; der Fragenkatalog unten ist der wichtigste Teil. Auslöser: Busfaktor
> Jan — Code ist AGPL und damit unsterblich, aber Server, Schlüssel und Daten hängen
> an einer Person. Lösung: aus „der Plattform" wird „die erste Instanz".

## Ziel

Mehrere unabhängig betriebene pumpfoil-Server (z. B. pumpfoil.org, Oleks
PSP/Polen, weitere Vereine/Verbände), die miteinander kommunizieren. Nutzer
entscheiden selbst, was ihre Heimat-Instanz mit welchen anderen Servern teilt.
Fällt ein Server (oder sein Betreiber) aus, verliert niemand seine Daten und
die Community verliert nur einen Knoten, nicht das Netz.

Nebeneffekte, die fast wichtiger sind als der Busfaktor:
- **Datenhoheit für Verbände**: polnische Daten liegen beim polnischen Verein.
  Starkes Argument gegenüber Sponsoren/Krankenkassen: keine Plattform-Abhängigkeit.
- AGPL-Versprechen wird eingelöst: „ihr seid mir nicht ausgeliefert" ist dann
  nicht mehr nur theoretisch (Code forken), sondern praktisch (Server wechseln).

## Grundprinzipien

1. **Rohdaten föderieren nie per Default.** GPS-Tracks und Accel-Chunks bleiben
   auf der Heimat-Instanz. Über die Leitung gehen abgeleitete, freigegebene
   Dinge: Bestenlisten-Einträge, Summen, Display-Name, Flagge. Ausnahme ist
   einzig die vom Nutzer gewählte Backup-Stufe 3 (s. u.), und die nur E2E-verschlüsselt.
2. **Der Nutzer wählt, nicht der Server.** Jede Weitergabe ist eine explizite
   Einwilligung je Stufe, je Ziel (Server-Liste oder Region, z. B. „nur EU").
3. **Jede Instanz ist eigener Verantwortlicher** (DSGVO). Kein gemeinsames
   Nutzerkonto-Backend, keine zentrale Datenbank.
4. **Instanzen vertrauen sich auf Instanz-Ebene, nicht pro Nutzer.** Eine
   Instanz signiert, was sie einspeist. Liefert sie Unfug (Fantasie-Rekorde),
   fliegt die Instanz aus der Föderation — nicht einzelne Nutzer.
5. **Protokoll aus der Praxis destillieren, nicht auf Vorrat entwerfen**
   (Gall's Law): v1 besteht aus genau zwei real existierenden Servern.

## Die drei Freigabe-Stufen (je Nutzer, je Ziel-Server/-Region)

| Stufe | Inhalt | Zweck |
|---|---|---|
| 1 | Stats + Display-Name (+ Flagge, Profilbild optional) | globale/fremde Bestenlisten, Events über Instanzen hinweg |
| 2 | zusätzlich Session-Details (Segmente, Kennzahlen, Karte sofern freigegeben) | volles Community-Erlebnis auf Partner-Instanzen |
| 3 | Full Backup inkl. Raw Chunks, **Ende-zu-Ende-verschlüsselt** | persönliche Replikation: jeder Nutzer löst seinen eigenen Busfaktor per Checkbox |

Zu Stufe 3: Der Backup-Server speichert nur verschlüsselte Blöcke, lesen kann
sie allein der Nutzer (Schlüssel bleibt beim Nutzer/auf seinen Geräten —
Verlust-Szenario dokumentieren!). Dadurch ist auch ein Server außerhalb der EU
als Backup-Ziel unkritisch und die Einwilligungstexte bleiben kurz.

## Identität & Idempotenz (tragende Wand Nr. 1)

- **Session-IDs würfelt die Uhr** (UUID bei Aufnahmestart), nicht der Server.
  Jeder Chunk-Upload ist idempotent (Session-UUID + Chunk-Index als Schlüssel).
  Nur so sind Failover, Nachsync und Zusammenführen ohne Doppelzählung möglich.
  `docs/ingest-contract.md` ist die Vorlage; es fehlt v. a. der
  herkunftsunabhängige Schlüssel.
- **Nutzer-Identität instanzübergreifend** nach Fediverse-Muster:
  `@olek@pspumpfoil.pl`. Umzug/Zweitkonto braucht eine Dubletten-Regel
  (offene Frage unten).

## Uhren-Failover (tragende Wand Nr. 2)

Nutzer pflegt eine persönliche Server-Liste (Heimat + Fallbacks). Ist der
Heimat-Server beim Upload nicht erreichbar, probiert die Uhr automatisch
Server 2, dann 3. Lehre vom 13.09.: der Aufnahme-/Upload-Pfad ist der
gefährlichste — Failover macht ihn redundant. Voraussetzung ist die
Idempotenz oben, sonst erzeugt jeder Failover Dubletten. Nachsync zur
Heimat-Instanz, sobald wieder erreichbar.

Achtung Aufwand: Failover-Logik muss je Plattform (Connect IQ, Wear, Apple,
Handys) einzeln getestet werden — nicht unterschätzen, 78 Garmin-Geräte.

## Betreiber-Manifest & Verzeichnis (tragende Wand Nr. 3)

Jede Instanz veröffentlicht ein Manifest: Betreiber (Name/Rechtsform), Standort/
Region, akzeptierte Stufen, angebotene Sportarten, eigene Konfiguration
(Layout/Anzeige je Instanz ist deren Sache). pumpfoil.org (oder ein neutrales
Repo) führt ein Verzeichnis der Instanzen — wie beim Event-Disclaimer gilt:
keine Garantie, aber nachprüfbare Behauptungen mit Namen darunter.
„EU-only" als Nutzerwahl stützt sich auf diese Selbstauskünfte.

## Ausbaustufen

- **v0 (jetzt):** dieses Konzept zerpflücken; Olek lesen lassen.
- **v1:** zwei Server (pumpfoil.org + eine PSP-/Test-Instanz), nur Stufe 1,
  Session-UUIDs + idempotenter Upload, minimaler Austausch-Vertrag als
  Markdown (`federation-contract.md`, analog `ingest-contract.md`),
  zusammengeführte Bestenliste. **Damit ist der Busfaktor für die
  Community-Ebene bereits gelöst.**
- **v2:** Stufe 2, Betreiber-Manifest + Verzeichnis, Events über Instanzen.
- **v3:** Stufe 3 (E2E-Backup), Uhren-Failover, Regionen-Auswahl.
- **v4+:** Spots als gemeinsames Gut, Umzug zwischen Instanzen, Moderations-
  Föderation (Kommentare!).

## Offene Fragen (nur Jan / Jan+Olek entscheidbar)

1. **Spots:** gemeinsames Weltgut aller Instanzen oder je Instanz eigene?
   (Vermutlich das schwerste Einzelstück des ganzen Vorhabens — Dubletten,
   Bearbeitungsrechte, Privacy-Radien.)
2. **Dubletten-Regel:** derselbe Mensch auf zwei Instanzen — zusammenführen,
   verbieten, egal?
3. **Rekord-/Anti-Cheat-Vertrauen:** reicht Instanz-Signatur + Rauswurf-Drohung,
   oder brauchen globale Rekorde eine Nachprüfbarkeit (Rohdaten-Einsicht auf
   Anfrage)?
4. **Kommentare/Chat über Instanzen:** föderieren oder bewusst lokal lassen?
   (Moderationsaufwand wächst mit Föderation erheblich.)
5. **Name/Marke:** darf jede Instanz „pumpfoil" heißen? Verzeichnis-Aufnahme
   an Bedingungen knüpfen (Manifest, Mindest-Datenschutz)?
6. **Wer hostet das Verzeichnis**, wenn pumpfoil.org der Busfaktor war?
   (Kandidat: Git-Repo statt Server — stirbt nicht mit einer VM.)
7. **Stufe-3-Schlüsselverlust:** Wiederherstellungspfad oder bewusst „weg ist weg"?
