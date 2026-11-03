# Föderation — Konzept-Entwurf (Diskussionsgrundlage)

> Stand 03.11.2026, zusammengeführt aus zwei Gesprächen Jan ↔ Claude am selben Tag. Nichts hier
> ist beschlossen; die offenen Fragen unten sind der wichtigste Teil. Auslöser: Busfaktor Jan —
> der Code ist AGPL und damit unsterblich, aber Server, Schlüssel und Daten hängen an einer
> Person. Lösung: aus „der Plattform" wird „die erste Instanz".

## Ziel

Mehrere unabhängig betriebene pumpfoil-Server (pumpfoil.org, ein Partnerverband in Polen,
weitere Vereine/Verbände) auf **derselben Codebasis**, die miteinander Stats und Sessions
austauschen und sich gegenseitig absichern. Nutzer entscheiden selbst, was ihre Heimat-Instanz
mit welchen anderen Servern teilt. Fällt ein Server (oder sein Betreiber) aus, verliert niemand
seine Daten, und die Community verliert nur einen Knoten, nicht das Netz.

Nebeneffekte, die fast wichtiger sind als der Busfaktor:
- **Datenhoheit für Verbände**: polnische Daten liegen beim polnischen Verein. Starkes Argument
  gegenüber Sponsoren/Krankenkassen: keine Plattform-Abhängigkeit.
- Das AGPL-Versprechen wird eingelöst: „ihr seid mir nicht ausgeliefert" ist dann nicht mehr nur
  theoretisch (Code forken), sondern praktisch (Server wechseln). Die AGPL sorgt außerdem dafür,
  dass Betreiber ihre Änderungen veröffentlichen müssen — die Codebasis bleibt eine.

## Grundprinzipien

1. **Ein Heimserver je Nutzer.** Er nimmt die Aufnahmen an, wertet sie aus und ist für sie
   verantwortlich. Alle anderen Server sehen nur, was der Nutzer freigegeben hat.
2. **Rohdaten föderieren nie per Default.** GPS-Tracks und Accel-Chunks bleiben auf der Heimat-
   Instanz. Über die Leitung gehen abgeleitete, freigegebene Dinge: Bestenlisten-Einträge,
   Summen, Display-Name, Flagge. Ausnahme ist einzig die vom Nutzer gewählte Backup-Stufe 3, und
   die nur Ende-zu-Ende-verschlüsselt.
3. **Der Nutzer wählt, nicht der Server.** Jede Weitergabe ist eine ausdrückliche Einwilligung je
   Stufe und je Ziel (einzelne Server oder Region, z. B. „nur EU"). Standard ist Stufe 0.
4. **Jede Instanz ist eigener Verantwortlicher** (DSGVO). Kein gemeinsames Nutzerkonto-Backend,
   keine zentrale Datenbank.
5. **Instanzen vertrauen sich auf Instanz-Ebene, nicht pro Nutzer.** Eine Instanz signiert, was
   sie einspeist. Liefert sie Unfug (Fantasie-Rekorde), fliegt die Instanz aus der Föderation —
   nicht einzelne Nutzer. Das Werkzeug dafür ist die Sperrliste (s. Serverliste).
6. **Löschen breitet sich aus.** Was eine Instanz weitergegeben hat, muss sie auch zurückholen
   können (Löschmarken, s. u.). Folgt aus „DSGVO-Löschung ist absolut".
7. **Protokoll aus der Praxis destillieren, nicht auf Vorrat entwerfen** (Gall's Law): v1 besteht
   aus genau zwei real existierenden Servern.

## Die Freigabe-Stufen (je Nutzer, je Ziel-Server/-Region)

| Stufe | Inhalt | Zweck |
|---|---|---|
| 0 | nichts (Standard) | – |
| 1 | Stats + Display-Name (+ Flagge, Profilbild optional) | globale/fremde Bestenlisten, Teams und Events über Instanzen hinweg |
| 2 | zusätzlich Session-Details (Läufe, Kennzahlen, Karte sofern freigegeben) — keine Rohdaten, keine Medien | volles Community-Erlebnis auf Partner-Instanzen |
| 3 | Full Backup inkl. Raw Chunks, Medien, Ausrüstung, **Ende-zu-Ende-verschlüsselt** | persönliche Replikation: jeder Nutzer löst seinen eigenen Busfaktor per Checkbox |

Die bestehenden Privatsphäre-Schalter gelten weiter **innerhalb** einer Stufe: wer die Karte auf
der eigenen Instanz verbirgt, verbirgt sie auch bei Stufe 2 auf Partner-Instanzen. Eine
Partner-Instanz zeigt nie mehr als die Heimat.

### Stufe 3 im Detail

- Der Nutzer hat ein **eigenes Schlüsselpaar**. Der öffentliche Schlüssel liegt auf der
  Heimat-Instanz, der private nur beim Nutzer (Passphrase-geschützt, im Browser/auf dem Handy
  entsperrt). Die Heimat **verschlüsselt an den öffentlichen Schlüssel** und schiebt die Blöcke
  zum Backup-Server — sie kann verschlüsseln, ohne selbst später lesen zu müssen; der
  Backup-Server kann gar nicht lesen.
- Folge: auch ein Server außerhalb der EU ist als Backup-Ziel unkritisch, und weil der
  Backup-Server nichts lesen kann, ist er eher Speicherdienst als Verarbeiter — die
  Einwilligungstexte bleiben kurz. (**Juristisch prüfen**, ob das ohne AV-Vertrag trägt.)
- **Wiederherstellung = Umzug:** Nutzer entsperrt den Schlüssel, die neue Heimat zieht die Blöcke,
  entschlüsselt im Client bzw. mit dem kurz übergebenen Schlüssel und rechnet die Analyse neu.
  Der vorhandene Weg für Session-Übertragungen ist die Vorlage.
- Ein E2E-Backup ist **kein Hot-Standby**: der Backup-Server kann daraus nichts anzeigen und
  nichts auswerten. Für die Verfügbarkeit des Uploads ist das Failover da (s. u.).
- Schlüsselverlust: s. offene Fragen.

## Löschmarken

- Löscht ein Nutzer eine Session, sein Konto oder senkt er eine Stufe, schickt die Heimat an jeden
  Empfänger eine signierte Löschmarke (`{was, nutzer, seit}`).
- Jeder Empfänger muss bestätigen; die Heimat führt Buch, wer bestätigt hat, und wiederholt
  unbestätigte Marken. Eine Instanz, die dauerhaft nicht bestätigt, ist ein Fall für die
  Sperrliste.
- Löschmarken bleiben stehen (Tombstones), damit ein später nachlaufender Abgleich die Daten nicht
  wieder einspielt.

## Identität & Idempotenz (tragende Wand Nr. 1)

- **Session-IDs würfelt die Uhr**, nicht der Server — **das gibt es schon**: `session_uuid` im
  Ingest-Vertrag (`docs/ingest-contract.md`), idempotent über Session-UUID + Chunk-Index, Resume
  inklusive, in `sessions.session_uuid` unique. Was für die Föderation fehlt:
  - Garmin erzeugt die UUID als `<Unix-Sekunden>-<Math.rand()>` (`watch/source/SessionRecorder.mc`,
    `_genUuid`). Für einen Server reicht das; über viele Instanzen und Jahre sollte es ein echter
    128-bit-Zufall werden (`Cryptography` bietet keinen Zufallsgenerator, aber mehrere
    `Math.rand()`-Werte plus Gerätenummer reichen praktisch). Alle anderen Plattformen prüfen.
  - Kollisionsregel instanzübergreifend: gleiche UUID mit anderem Nutzer = Fehler, nie
    zusammenführen.
- **Nutzer-Identität instanzübergreifend** nach Fediverse-Muster: `@fahrer@verein.example`. Intern
  bleiben die fortlaufenden Zahlen-IDs; dazu kommt eine Herkunftsspalte. Fremde Nutzer liegen als
  **Schatten-Einträge** vor (Anzeigename, Heimat, freigegebene Stufe) — darauf können Teams,
  Bestenlisten und Freunde zeigen, ohne dass es ein Konto ist.
- Umzug/Zweitkonto braucht eine Dubletten-Regel (offene Frage unten).

## Serverliste: signiert, in die Apps eingebaut (tragende Wand Nr. 2)

Jan, 03.11.: „die uhren sollten schon fix immer mal beim naechsten update die akzeptierten
serverlisten erhalten … es muss aber auch blacklists geben und signierte updates von
serverlisten".

Es gibt **eine** Liste, die Apps und Server gleichermaßen lesen. Sie ist zugleich das
Verzeichnis der Instanzen (s. Manifest):

```
{ "v": 17, "ausgestellt": "2026-11-03T…Z",
  "server":   [{ "id": "pumpfoil.org", "url": "https://pumpfoil.org", "key": "<Instanz-Schlüssel>",
                 "rolle": ["root", "heim"], "region": "EU" }, …],
  "gesperrt": [{ "id": "…", "key": "…", "seit": "…", "grund": "…" }],
  "sig": "…" }
```

- **Eingebaut:** jede App-Version bringt die Liste ihres Release-Stands mit und den öffentlichen
  **Wurzelschlüssel**. So schnell ändert sich die Liste nicht; das nächste Update zieht sie nach.
- **Wurzelschlüssel offline**, gesichert wie der Garmin-Schlüssel (GPG, s. `deploy/backup-secrets.sh`).
  Später „2 von 3" (Jan + Partner-Betreiber), damit kein Betreiber allein Listen ausstellt — und
  damit der Busfaktor nicht in den Wurzelschlüssel wandert.
- **Nachträge zwischen Releases:** die App holt gelegentlich die Liste von **jedem** Root aus ihrer
  Liste und übernimmt die höchste gültige Version.
- **Kein Zurückdrehen:** nur eine höhere `v` gilt. Ein alter, signierter Stand kann keine Sperre
  aufheben.
- **Sperren schlagen alles**, auch die eingebaute Liste — ohne App-Release. Die Sperrliste wächst
  nur; „entsperren" heißt neu eintragen mit neuem Schlüssel.
- **Wirkung einer Sperre:** die App pairt nicht mehr mit dem Server und lädt nichts mehr dorthin;
  eine dort gepairte Uhr meldet „Server gesperrt, neu koppeln", statt stumm weiterzuladen
  (Regel: nie stumm scheitern). Die übrigen Server stellen den Austausch mit ihm ein.
- **Pairing:** der Code bzw. der Root nennt der App die Heimat; die App nimmt sie **nur an, wenn sie
  in ihrer gültigen Liste steht**, und merkt sich die Basis-URL. Heute steht sie fest im Code
  (`watch/source/Config.mc` `baseUrl()`, ebenso Android/Apple) — das wird zur gespeicherten
  Einstellung mit pumpfoil.org als Vorgabe.
- **Eine App je Store**, keine eigenen Store-Einträge je Verein (fünf Plattformen × Reviews ×
  Konten je Betreiber wären nicht zu stemmen).

### Wer kann die Signatur prüfen?

| Plattform | Signatur prüfen | Stand |
|---|---|---|
| Server, Web | Ed25519, problemlos | – |
| Android, Wear OS, iOS, watchOS | Ed25519 eingebaut (Tink/BouncyCastle bzw. CryptoKit) | – |
| Zepp OS, Huawei (JS) | kleine Ed25519-Bibliothek (tweetnacl o. ä.) | Huawei Lite: 48 KB Heap, eng |
| **Garmin Connect IQ** | **nein** | `Toybox.Cryptography` (SDK 9.3.0) hat nur AES, SHA-256, HMAC/CMAC und ECDH secp224r1/secp256r1 — keine Signaturprüfung. ECDSA in Monkey C nachbauen ist für die Low-Mem-Geräte zu langsam und zu groß. |

Für Garmin zwei Wege:
1. **Vertrauen über TLS (Start):** die Uhr holt Nachträge nur von Roots aus ihrer eingebauten
   Liste, per HTTPS — das Zertifikat prüft das Handy (Garmin-Anfragen laufen über Connect).
   Lücke: ein übernommener Root könnte Garmin-Uhren eine falsche Liste geben. Begrenzt, weil die
   Roots wenige und von uns betrieben sind.
2. **Hash-basierte Signatur (später):** WOTS+ mit Merkle-Baum braucht nur SHA-256, das die Uhr
   nativ kann. Prüfung = einige hundert Hash-Aufrufe, Signatur ~2–3 KB, ein Schlüssel reicht für
   z. B. 1024 Listenversionen (Jahrzehnte). Danach kann auch ein übernommener Root nichts mehr
   fälschen. Auf der Lite-Variante (96 KB) erst messen.

## Uhren-Failover (tragende Wand Nr. 3)

Der Nutzer wählt aus der gültigen Serverliste seine Heimat plus Fallbacks. Ist die Heimat beim
Upload nicht erreichbar, probiert die Uhr Server 2, dann 3. Lehre vom 13.09.: der
Aufnahme-/Upload-Pfad ist der gefährlichste — Failover macht ihn redundant.

- Voraussetzung ist die Idempotenz oben, sonst erzeugt jeder Failover Dubletten.
- Der Fallback **speichert nur und reicht weiter** (Store-and-forward): er wertet nicht aus,
  zeigt nichts an und schiebt die Chunks zur Heimat, sobald die wieder erreichbar ist; danach
  löscht er sie. Weil dabei Rohdaten unverschlüsselt bei einem anderen Betreiber liegen, braucht
  das eine eigene Einwilligung („Fallback-Server dürfen meine Aufnahme zwischenspeichern").
- Aufwand nicht unterschätzen: Failover je Plattform (Connect IQ, Wear, Apple, Handys, Zepp,
  Huawei) einzeln testen, auf Garmin über alle Geräteklassen. Und jede Änderung am Upload-Pfad
  ist ein Store-Release auf allen Plattformen — deshalb kommt das spät.

## Instanz-Konfiguration: gleicher Code, andere Instanz

Taugt schon für pumpfoil.org allein und ist darum der risikoärmste Einstieg. Eine Konfiguration
(Datei + Admin-Tab), die der Server unter `/api/app/instanz` an Web und Apps ausliefert:

- **Sportarten:** welche aufgenommen und angezeigt werden (offene Frage: andere ablehnen oder nur
  ausblenden?).
- **Funktionsschalter:** Menüpunkte/Seiten (Chat, Spots, Teams, Nerd-Analysen, Ausrüstung,
  Rekorde …) und welche Details die Session-Seite zeigt. Web, Android und iOS bauen ihre Menüs
  danach; die Uhren-Apps bleiben dünne Recorder und sind kaum betroffen.
- **Erscheinungsbild:** Name, Logo, Akzentfarbe, Sprachen, Startseiten-Texte, News-Banner (gibt es
  schon DB-getrieben).
- **Recht & Betrieb:** Impressum und Datenschutzerklärung **je Betreiber** (Pflicht),
  Registrierung offen/geschlossen/auf Einladung, Standard-Privatsphäre, Partner-Instanzen.
- Der eigentliche Aufwand ist das Aufräumen: vieles ist heute fest verdrahtet und wandert nach
  und nach hinter Schalter. Regel dabei: **Vorgabe = heutiges Verhalten von pumpfoil.org**, damit
  hier nichts kippt.

## Betreiber-Manifest & Verzeichnis

Jede Instanz veröffentlicht ein Manifest: Betreiber (Name/Rechtsform), Standort/Region,
akzeptierte Stufen, angebotene Sportarten, Auswertungsstand (s. u.), Kontakt. Das Verzeichnis
der Instanzen **ist die signierte Serverliste** — veröffentlicht in einem Git-Repo (stirbt nicht
mit einer VM) und von jedem Root ausgeliefert. Wie beim Event-Disclaimer gilt: keine Garantie,
aber nachprüfbare Behauptungen mit Namen darunter. „EU-only" als Nutzerwahl stützt sich auf
diese Selbstauskünfte.

## Vergleichbarkeit der Zahlen

Jede Instanz wertet selbst aus. Laufen zwei Instanzen auf verschiedenem Stand der Analyse, sind
ihre Pumpzahlen und Gleitphasen nicht vergleichbar (s. `docs/PIPELINE-KARTE.md`).
- Jeder Stufe-1/2-Eintrag trägt `algo_version` und die Zeit-/Erkennungs-Felder
  (`detection`, `time_base`) mit.
- Gemeinsame Bestenlisten vergleichen nur Einträge desselben Auswertungsstands; reine GPS-Werte
  (Strecke, Dauer, Geschwindigkeit) sind robuster und können früher gemeinsam laufen.
- Daraus folgt eine Betriebsregel: Partner-Instanzen ziehen Updates zeitnah nach. Deployt ein
  Betreiber selbst, muss das Austauschprotokoll von Anfang an streng versioniert sein
  (`/fed/v1/…`), und eine Instanz nennt im Manifest, welche Versionen sie spricht.

## Protokoll (Skizze)

Bewusst kein ActivityPub: es passt schlecht zu Bestenlisten und Rohdaten und kostet viel für
wenig. Stattdessen ein kleiner, versionierter Vertrag als Markdown (`docs/federation-contract.md`,
analog `ingest-contract.md`):
- Jede Instanz hat ein Schlüsselpaar (in der Serverliste); jede Anfrage zwischen Instanzen ist
  signiert.
- Abgleich per Abruf-Feed: `GET /fed/v1/changes?since=<cursor>` liefert Einträge und Löschmarken
  für den anfragenden Partner, gefiltert nach den Freigaben der Nutzer. Abruf statt Push, damit
  eine ausgefallene Instanz nichts verpasst — sie holt beim nächsten Mal nach.
- Stufe 3 getrennt: `PUT /fed/v1/backup/<nutzer>/<block>` mit verschlüsselten Blöcken.

## Fallen

- **Chat, DMs, Feed** über Instanzen: am Anfang bewusst lokal. Moderation, Spam, Zuständigkeit.
- **Sicherheit beim Partner:** unsere Standards (Backups nur für den Betreiber lesbar,
  verschlüsselte Plattform-Tokens, keine Cookies/kein Tracking) müssen dort genauso gelten —
  Bedingung für die Aufnahme ins Verzeichnis.
- **Kontoverknüpfungen (Polar, Suunto, COROS):** die API-Zugänge sind auf pumpfoil.org
  registriert. Eine andere Instanz bräuchte eigene Zugänge oder importiert gar nicht.
- **Store-Apps:** jede Änderung an Pairing/Upload dauert auf manchen Plattformen Wochen. Deshalb
  serverseitig so viel wie möglich vorher fertig haben.

## Ausbaustufen

- **v0 (jetzt):** dieses Konzept zerpflücken; Partner-Betreiber lesen lassen.
- **v1:** Instanz-Konfiguration (auch für pumpfoil.org allein nützlich), Test-Instanz auf der VM
  mit eigener DB.
- **v2:** zwei Server (pumpfoil.org + Partner-/Test-Instanz), Instanz-Schlüssel, signierte
  Serverliste (erst nur serverseitig), **nur Stufe 1**, Austausch-Vertrag, zusammengeführte
  Bestenliste. **Damit ist der Busfaktor für die Community-Ebene bereits gelöst.**
- **v3:** Stufe 2, Manifest + Verzeichnis im Git-Repo, Teams/Events über Instanzen.
- **v4:** Apps: Heimat aus der eingebauten Liste beim Pairing, Nachträge/Sperren, echte
  128-bit-UUIDs — ein Release je Plattform.
- **v5:** Stufe 3 (E2E-Backup) + Umzug zwischen Instanzen, Uhren-Failover, Regionen-Auswahl,
  Löschmarken für Rohdaten.
- **v6+:** Spots als gemeinsames Gut, Moderations-Föderation (Kommentare!), hash-basierte
  Signatur auf Garmin.

## Offene Fragen (nur Jan / Jan + Partner entscheidbar)

1. **Spots:** gemeinsames Weltgut aller Instanzen oder je Instanz eigene? (Vermutlich das
   schwerste Einzelstück — Dubletten, Bearbeitungsrechte, Privacy-Radien.)
2. **Dubletten-Regel:** derselbe Mensch auf zwei Instanzen — zusammenführen, verbieten, egal?
   (Vorschlag: genau eine Heimat, Wechsel nur per Umzug.)
3. **Rekord-/Anti-Cheat-Vertrauen:** reicht Instanz-Signatur + Sperrliste, oder brauchen globale
   Rekorde eine Nachprüfbarkeit (Rohdaten-Einsicht auf Anfrage)?
4. **Kommentare/Chat über Instanzen:** föderieren oder bewusst lokal lassen?
5. **Name/Marke:** darf jede Instanz „pumpfoil" heißen? Aufnahme ins Verzeichnis an Bedingungen
   knüpfen (Manifest, Mindest-Datenschutz)?
6. **Wurzelschlüssel:** von Anfang an „2 von 3" oder erst einer (Jan) und später teilen?
7. **Stufe-3-Schlüsselverlust:** Wiederherstellungspfad oder bewusst „weg ist weg"?
8. **Bestenlisten:** eine globale über alle Instanzen, oder jede Instanz ihre eigene und die
   globale als Zusatz?
9. **Sportfilter:** lässt eine Instanz nur Pumpfoil zu — andere Sportarten ablehnen oder nur
   ausblenden?
10. **Wer deployt bei Partnern:** wir (Versionssprünge einfach) oder der Verein selbst (strenge
    Versionierung ab Tag 1)?
