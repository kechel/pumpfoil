# TODO & Ideen

**Einzige Quelle für offene Arbeit.** Gegen die Git-Historie abgeglichen (Stand 2026-07-13).
Erledigtes steht nicht mehr hier. Neue spontane TODOs unten unter „📥 Inbox" anhängen.

> Ersetzt die frühere `docs/IDEAS.md`-Inbox. Reine Produktideen weiter unten unter „💡 Backlog".

---

## 🚀 App-Release-Stand

- **🟡 Zepp 1.0.7 EINGEREICHT — 26.08.2026 (Jans Meldung), Zepp-Konsole: „Under Review
  (Can be Withdrawn)".** appId 1118995, kostenlos, Buildcode 10. Die Vorversion 1.0.6 steht in
  derselben Liste mit „Approved" vom 24.08.
  Inhalt: Wert-Grafiken in eigenen Layouts (auf Zepp ueber CANVAS + drawPoly statt ARC —
  Geraetebefund aus @elmanu13s PR: ARC zeichnet auf der T-Rex 3 runde Enden), Puls-Zonen aus dem
  Profil (`hrZones`/`speedScale` mussten dafuer erst in die App-Side-Whitelist, sie fielen vorher
  still raus), gesaeuberter Max-Speed + Lauf-Zusammenfuehrung, Touch-Sperre per 2-s-Druck auf dem
  Schirm loesbar, Distanz-Einheit ins Label (war als einzige Plattform im Wert), und die
  Selbstheilung des Layout-Renderers protokolliert jetzt ihren Grund.
  **Reichweite (erstmals dokumentiert): 83 Geraete-Quellen, 34 Modellnamen** — von Falcon,
  T-Rex Ultra/3/3 Pro, Balance/2/2 XT/3/3 Ti/Ultra, Cheetah-Reihe, GTR 4, Active/Active 2/3 bis zu
  den eckigen (GTS 4, Bip 5/6/Max, Cheetah Square, Active 2 Square, „Rome"). Unser `app.json`
  nennt bewusst KEINE festen Geraete-Nummern, sondern nur die zwei Formfaktoren
  (`st:"r"` 480 px, `st:"s"` 390 px) — deshalb deckt ein Paket beide Bauformen ab.
  **Falle aus dem Test (26.08.):** die Geraete-Auswahl in `zeus dev` muss zur laufenden
  Simulator-Instanz passen. Jan baute fuer „T-Rex 3 Pro (48mm)" (Quellen 10551552…), der Simulator
  war eine normale T-Rex 3 (8716544) — das Paket liess sich nicht installieren, die Uhr behielt
  1.0.5, und alle daraus gezogenen Schluesse ueber die neuen Layouts waren wertlos. Erkennbar am
  Server-Log (`v=1.0.5` im Config-Aufruf) und an der Versionszeile auf dem Startbildschirm.

- **🟢 Garmin 1.0.80 LIVE — CIQ-Store FREIGEGEBEN (26.08., zweites Release an diesem Tag).**
  Jans Meldung: Store-Seite „Latest Release August 26, 2026 · Version 1.0.80 · Size 64 KB"
  (1.0.79 stand am selben Vormittag mit 63 KB dort — der KB-Sprung ist der ENG-Build mit den
  neuen Regeln, gemessen fr55 65 116 -> 65 740 B). Vorher im Emulator von Jan getestet,
  **danach aus dem Store auf seine ECHTE fenix installiert und getestet (26.08., 21:29): „geht"**
  — damit ist die ganze Kette einmal auf Hardware gelaufen, nicht nur im Simulator.
  Inhalt: gesaeuberter Max-Speed (Burst-Klemme + 32-km/h-Deckel), Lauf-Zusammenfuehrung ohne
  echten Stopp, `expected_chunks` im Upload, „Gespeichert" nicht mehr doppelt und mit
  10-s-Ablauf. Kette komplett: `watch/bin` auf 1.0.80 (121/121), `.iq` 210/210 an Jan,
  `appmeta.garmin` = 1.0.80 (geprueft ueber `/api/app/latest?platform=garmin`),
  Changelog-Eintrag steht.

- **🟡 Android Phone 1.1.24 (38) + Wear OS 1.2.24 (1034) EINGEREICHT — 26.08.2026, ~21:30 Uhr
  (Jans Meldung).** Play-Konsole: Vorabpruefungen laufen („noch maximal 14 Minuten"), danach geht
  es automatisch in die Ueberpruefung. Beide Tracks auf **vollstaendigen Roll-out** gestellt
  (Produktion 38/1.1.24, Produktion Wear OS 1034/1.2.24).
  **Merke fuer die Freigabe:** Play schickt EINE Mail fuer beide Tracks (gleiche applicationId
  `org.pumpfoil.app`) — zweimal belegt, s. Memory `submission-log`. Die Mail nennt keine
  Versionsnummer, nur den Zeitpunkt der Einreichung; erst eintragen, wenn Freigabe DA und
  Roll-out bei 100 % ist (am 29.07. stand `appmeta` verfrueht auf einer Version, die Play noch
  gar nicht auslieferte — ein Nutzer bekam einen Update-Hinweis ins Leere).
  Inhalt wie bei iOS: Wert-Grafiken in der Layout-Vorschau + Puls-Zonen im Profil, GPX-/FIT-
  Download, Spot-Beschreibungen, Spot-Label mit Gewaesser, AR-Badges, Katalog-Suche,
  Trainingskurve; auf der Uhr zusaetzlich Always-on-Ansicht, BACK wird waehrend der Aufnahme
  verschluckt, `expected_chunks`, Live-Distanz ohne Zuwachs im Stand, gesaeuberter Max-Speed,
  Lauf-Zusammenfuehrung.

- **🟢 iOS + Apple Watch 1.1.25 (29) LIVE — freigegeben 27.08.2026** („Review of your
  submission has been completed. It is now eligible for distribution", Jans Meldung).
  Eingereicht 26.08. 21:25 Uhr, Uebermittlungskennung `a9cf1407-1369-4d4b-815d-6525abffede6`.
  **Gegengeprueft statt geglaubt:** `itunes.apple.com/lookup?id=6783975714` in de/us/nl/no/fi
  liefert ueberall **1.1.25**, `currentVersionReleaseDate 2026-08-27T16:35:34Z` — also wirklich
  ausgeliefert, nicht nur freigegeben. `appmeta` daraufhin auf 1.1.25 gesetzt, und zwar in BEIDEN
  Schluesseln (`ios` UND `apple`): ein Bundle = iPhone-App und Watch-App mit einer
  MARKETING_VERSION aus `project.yml`. Server neu gestartet, `/api/app/latest` fuer beide geprueft.
  Inhalt: Wert-Grafiken in der Layout-Vorschau + Puls-Zonen im Profil, GPX-/FIT-Download der
  eigenen Session, Spot-Beschreibungen inkl. Auswahl aus Session-Fotos, Spot-Knopf und
  Spot-Label mit Gewaesser, AR in den Foil-Badges, Katalog-Suche unabhaengig von der
  Wortstellung, Trainingskurve; auf der Uhr zusaetzlich `expected_chunks` im Upload,
  Live-Distanz ohne Zuwachs im Stand, gesaeuberter Max-Speed und die Lauf-Zusammenfuehrung.
  **Noch NICHT eingereicht:** Phone 1.1.24/38 + Wear 1.2.24/1034 (Play), Zepp 1.0.7,
  Garmin 1.0.80 (`.iq` liegt bei Jan).

- **🟢 Garmin 1.0.79 LIVE — CIQ-Store FREIGEGEBEN (26.08.), Kette komplett.** Jans Meldung
  26.08. nachmittags: Store-Seite „Latest Release August 26, 2026 · Version 1.0.79 · Size 63 KB",
  aus dem Store auf seine ECHTE Uhr installiert und getestet — „funktioniert". Vorher im Emulator
  mit seinem eigenen Testlayout geprueft (fenix7xpro, `.prg` von mir geliefert).
  Inhalt: **Wert-Grafiken in eigenen Layouts** — Rand-Grafik (`typ 8`; rund Ringsegment, eckig
  Rahmensegment, entschieden aus der Displayform) und Balken (`typ 9`), Fuellstand auf der Skala
  des Feldes, Farbe optional nach Puls-Zone. Zonen aus dem Profil ueber `/devices/config`
  (`hrZones` + `speedScale`), auf der Uhr gecacht. **Nur Voll-Builds:** alles hinter `(:layouts)`,
  LITE (96 KB) und ENG (128 KB) kompilieren es nicht mit; die Skalen-Uebernahme wurde ebenfalls
  dorthin gezogen (**-384 B** fuer die kleinen Builds, gemessen an fr55 und instinct2).
  Kette: `watch/bin` auf 1.0.79 (121/121 ok, ueber `/api/app/devices` verifiziert) ·
  `.iq` gebaut (210/210 Geraete, 11,05 MB, md5 `e673a25da654`) + Store-Notizen (deu/eng) an Jan ·
  `appmeta.garmin` = 1.0.79 · Changelog-Eintrag steht.
  **Danach nur noch server-seitig:** Z1-Untergrenze im Zonen-Vorschlag auf feste 60 bpm (Jan);
  die Rueckfall-Konstanten in den Clients folgen dem Vorschlag ABSICHTLICH nicht, sonst braeuchte
  jede Voreinstellung ein Uhr-Release. Das ausgelieferte 1.0.79 bleibt damit gueltig.

- **🟢 Garmin 1.0.78 LIVE — CIQ-Store FREIGEGEBEN (17.08.), Kette komplett.** Von Jan aus dem
  Store auf seine echte Uhr aktualisiert und getestet („geht"). `appmeta garmin` = 1.0.78 gesetzt,
  Changelog-Eintrag geschrieben. Inhalt: die neue **ENG-Build-Stufe** fuer die 16 Uhren der 128-KB-Klasse, die
  ueber Wochen still gar nichts mehr aufgezeichnet haben (Befund + Messungen weiter unten unter
  „speicherarme Garmin-Uhren"). Commits `078c4b5` (Stufe) + `4622b89` (7 fehlende Strings).
  Store-Seite von der VM aus NICHT pruefbar (JS-gerendert, WebFetch sieht nur die Huelle) — Jans
  Mail ist die Quelle.
  Verifiziert vor der Veroeffentlichung: alle 121 Geraete in ein temporaeres Verzeichnis gebaut,
  **105 byte-identisch** zu 1.0.77 (alle VOLL- und LITE-Uhren), genau die 16 ENG-Geraete je
  ~41,7 kB kleiner. Danach `build-all.sh` 121/121 gruen, Katalog auf 1.0.78, Store-Paket
  `bin/pumpfoil-1.0.78.iq` (210 Geraete-Builds, 11,2 MB) an Jan geliefert.
  Freier Speicher jetzt: FR55 24 884 -> 66 228 B · fenix 5/6 ~24 000 -> ~65 500 B ·
  Venu Sq 22 996 -> 64 340 B · Instinct 3 Solar / Instinct E 45 396 -> 75 876 B.
  **Jans Feldtest bestanden (17.08.):** fenix 5 UND FR55 haben je eine Session aufgezeichnet und
  hochgeladen (#2301 mit 1 Lauf/33 Pumps, #2303 mit 135 m — beide mit angekommenen Chunks, genau
  das Modell, das vorher bei 1/9 stand). Uebersetzungen auf der fenix 5 gegengeprueft.
  Getestet wurde die ENG-Stufe; der String-Fix danach ist rein additiv (7 Literale, +384 B).
  **Folge, bewusst in Kauf genommen:** Jans fenix 5 faellt als Layout-Testgeraet weg
  (`LAYOUT_MIN_ON_REQUEST` 131072 -> 524288), und auf den 16 ENG-Uhren sind die Texte Englisch.
  Release-Satz fuer den Store (195 Zeichen, Jan gewaehlt): „Watches with little memory (fēnix 5/6,
  Forerunner 55/245/645/935, Venu Sq, vívoactive 3, Enduro, Instinct 3/E) record reliably again.
  The app is far smaller there; its texts are English on those."

- **Stand 16.08. abends: VIER Einreichungen offen — alles wartet auf Freigabe-Mails.**
  | Plattform | Version | wo | Inhalt |
  |---|---|---|---|
  | ~~Garmin~~ | **1.0.77 LIVE seit 16.08.** | CIQ-Store, Store-Seite bestaetigt Version 1.0.77 / 106 KB | Lauf-Canary + GNSS-Stufe je Uhr. `appmeta garmin` gesetzt und per `/api/app/latest` geprueft, Changelog steht. **ERLEDIGT.** |
  | ~~Zepp~~ | **1.0.6 LIVE seit 24.08.** (1.0.5 ging nie live) | Zepp-Store, `appmeta zepp` gesetzt | Roh-Accel (verlaesst gps_only), Zuverlaessigkeit/Tasten aus PR #1, `target` 3.6, Modellmeldung, GPS-Sprung-Gate + die 1.0.6-Fixes. **ERLEDIGT.** |
  | Wear OS | **1.2.22** / 1032 | Play, Produktion (Wear OS) | Puls aktiv ueber Health Services + sichtbarer Hinweis, wenn keiner ankommt |
  | Android Phone | **1.1.21** / 35 | Play, Produktion | unveraendert aus dem Batch vom 10.08. |
  **NACH der jeweiligen Freigabe-Mail ohne Rueckfrage setzen:** `appmeta garmin` = 1.0.77 ·
  `zepp` = **die Nummer AUS DER MAIL** (bei 1.0.3 stand dort die Version vor dem Release-Bump) ·
  `wear` = 1.2.22 · `android` = 1.1.21. Danach je ein Changelog-Eintrag.
  Die Direkt-Downloads liefern Garmin 1.0.77 schon jetzt (`watch/bin` ist live, unabhaengig vom Store).

- **Stand 13.08. abends: Garmin 1.0.76 LIVE** (CIQ-Store, Store-Seite „Latest Release August 13,
  2026, Version 1.0.76, Size 102 KB"). **Garmin gibt inzwischen automatisch frei** (Jan) — die
  Freigabe kam Minuten nach dem Upload, es lohnt also nicht mehr, auf eine Pruefung zu warten.
  Inhalt: voller Uhr-Speicher nicht mehr stumm (`storageDropped`-Zaehler, Warnung vor dem Start
  „erst hochladen!", rote Warnung waehrend der Aufnahme) + Upload waehrend der PAUSE
  (`Uploader.setActiveSession` haelt die laufende Session draussen). `appmeta.garmin` = 1.0.76,
  per `/api/app/latest` geprueft; 121 Direkt-Downloads auf 1.0.76. Changelog-Eintrag steht.
  **OFFEN: der Pausen-Upload ist ungetestet** — ob Garmin in der Pause ueberhaupt sendet, steht in
  keiner Doku. Scheitert es, scheitert es still (Backoff). Ein kurzer Test auf Jans Uhr wuerde die
  Frage beantworten: Wegwerf-Session aufnehmen, nicht hochladen, zweite starten, pausieren.
- **Stand 13.08.: Garmin 1.0.75 LIVE** (CIQ-Store, gleicher Tag freigegeben — Store-Seite
  „Latest Release August 13, 2026, Version 1.0.75, Size 100 KB"). Inhalt: beste vom Geraet
  unterstuetzte GNSS-Stufe statt des SDK-Standards GPS-allein (`enableGps()` mit Rueckfallkette +
  2-Minuten-Wachhund). `appmeta.garmin` gesetzt und per `/api/app/latest?platform=garmin` geprueft;
  `build-all.sh` gelaufen, alle 121 Direkt-Downloads liefern 1.0.75; Store-Paket
  `bin/pumpfoil-1.0.75.iq` (210 Geraete-Builds) an Jan geliefert. Changelog-Eintrag steht.
  **OFFEN: Wirkung messen** — GPS-Abdeckung derselben Nutzer/Spots vor/nach 1.0.75.
- **Apple 1.1.22 (26) LIVE im App Store 13.08.** (Freigabe-Mail "eligible for distribution",
  Submission `b4f15707-ca03-4b84-affe-d25248342ca1`). Die Mail sagt selbst "up to 24 hours",
  deshalb GEGENGEPRUEFT statt geglaubt: `itunes.apple.com/lookup?id=6783975714` in de/us/nl/no/fi
  liefert ueberall 1.1.22, `currentVersionReleaseDate` 2026-08-13T19:38:52Z. Danach `appmeta`
  gesetzt — **BEIDE Schluessel**, `ios` (iPhone-App) und `apple` (Watch-App): eine Einreichung, ein
  Bundle, eine MARKETING_VERSION. Per `/api/app/latest` fuer beide geprueft. Changelog sagt jetzt
  "in the App Store today" statt "arrives with the next app update".
  Inhalt: `BestForNavigation` + `activityType = .fitness` auf Watch und iPhone.
- **Stand 06.08.: Garmin 1.0.73 LIVE** (CIQ-Store, gleicher Tag freigegeben — Store-Seite
  „Latest Release August 6, 2026, Version 1.0.73, 98 KB"). Inhalt: Pausen-Menue (START in der
  Pause oeffnet Fortsetzen/Abbrechen/Ende & speichern, ohne Vorauswahl und ohne Stop-Ring) +
  Norwegisch als 14. Sprachspalte. `appmeta.garmin` gesetzt und per `/api/app/latest` geprueft;
  `build-all.sh` gelaufen, alle **121 Direkt-Downloads** liefern 1.0.73 (Katalog geprueft).
  Speicher gemessen: engstes Geraet Venu Sq 77,9 % (28,3 KB Luft), Lite-Uhren ±0 Bytes.
  Changelog-Eintrag steht (Pausen-Menue + Norwegisch).
- **Zepp 1.0.4 FREIGEGEBEN 06.08.** („The application Pumpfoil (1.0.4) … approved and added to
  the ZEPP app store"). `appmeta.zepp` = 1.0.4, per `/api/app/latest` geprueft; Changelog-Eintrag
  steht (eigene Datenseiten, „App offen lassen", Anzahl wartender Sessions, Foil je Session).
  Diesmal nannte die Mail wirklich 1.0.4 — **Regel bleibt: immer die Nummer AUS DER MAIL nehmen**,
  bei 1.0.3 war es die Version vor dem Release-Bump.
  **ERLEDIGT/ENTFAELLT: Store-Adresse fuer Zepp** — es gibt keine (Jan, 07.08.). Die App ist nur
  ueber die Zepp-Handy-App erreichbar, die auf `/uhr` verlinkt ist; `store_url` bleibt daher
  dauerhaft leer, der Uhr-Hinweis nennt nur die Version.
  **Weiter offen:** Wear 1.2.20/1030 + Phone 1.1.20/34 in der Play-Pruefung; gebaut und wartend:
  Wear 1.2.21/1031 (Token-Heilung) und Phone 1.1.21/35 (Teilen-Dialog-Scroll) — beide wuerden die
  norwegischen App-Texte mitnehmen. iOS/Watch brauchen fuer Norwegisch noch einen Bump (1.1.22),
  Zepp ebenso (1.0.5). **Beide Zepp-Punkte sind mit 1.0.5 erledigt (16.08.):** Norwegisch war
  schon mit `adadbfd` mitgekommen (`LANGS` enthaelt `nb`, Overlay vorhanden) — der Eintrag hier
  war veraltet; das GPS-Qualitaets-Gate ist jetzt gebaut (s. Inbox).
- **Stand 05.08. abend — Befund „Standort-Berechtigung scheitert stumm" (Wear + Apple).**
  Nutzerfeedback („works with my phone, not with my watch", Galaxy Watch 7): Uhr war
  installiert, gepairt, lud hoch — aber **4 von 6 Wear-Sessions hatten 0 GPS-Punkte** bei
  1000+ Accel-Chunks (eine 3,6 h, eine 2,2 h). Ursache: `RecorderService.startLocation()`
  verschluckte die `SecurityException` bei fehlender `ACCESS_FINE_LOCATION` -> Aufnahme lief
  stumm ohne Strecke weiter. Der Erst-Dialog fragt Standort mit ab, verwarf aber das Ergebnis,
  ein einmaliges Ablehnen war damit endgueltig und unsichtbar. Gleiche Fehlerklasse wie der
  Puls-Fix (PeterH), nur folgenschwerer. **Nebenbefund:** `minSdk 30` = Wear OS 3, seine alte
  Galaxy Watch 4 haette laufen muessen — der Neukauf war unnoetig; unsere Angabe
  („Wear OS 3+") war korrekt, die Anleitung sagte aber nicht, dass die Uhren-App **auf der
  Uhr** installiert wird (Phone+Wear teilen die applicationId).
  - **FREIGEGEBEN 09.08. (Play-Mail "is live in the store"): Wear 1.2.20/1030 + Phone Android
    1.1.20/34.** Eingereicht 05.08. abend, Release im Console am 05.08. 15:06 GMT erstellt.
    `appmeta` gesetzt: android 1.1.20, wear 1.2.20 (per `/api/app/latest?platform=android`
    verifiziert; die Uhr-Endpunkte brauchen ein Geraetetoken, Wert direkt aus `_APP_META`
    geprueft). Changelog-Eintrag steht. **Nicht** die 1.1.21/35 bzw. 1.2.21/1031 eintragen —
    die sind danach gebaut und noch nicht eingereicht.
  - **Wear 1.2.20/1030 + Phone 1.1.20/34 gebaut** (beide kompiliert): Standort ist harte
    Startvoraussetzung (fehlt sie -> fragen, bei „Nein" NICHT starten, roter Hinweis mit
    Tipp-Aktion; nach endgueltigem Ablehnen direkt in die System-Einstellungen), Warnung wenn
    die Ortung systemweit aus ist (Start bleibt erlaubt), „Ohne GPS gespeichert"-Hinweis im
    Post-Stop-Screen, und dort kein „Gespeichert" mehr nach *Verwerfen*. Ausserdem:
    Companion-Pairing ueberschreibt kein funktionierendes Token mehr (s. u.).
  - **iOS/Watch 1.1.21 FREIGEGEBEN 05.08.** (Apple: „eligible for distribution", Submission
    2e0f43f1, eingereicht 17:07 — Pruefung an EINEM Abend durch). `appmeta.ios` + `appmeta.apple`
    stehen auf 1.1.21, per `/api/app/latest` verifiziert; Store-Propagation bis 24 h. Die um
    11:17 eingereichte 1.1.20/24 wurde nie ausgeliefert (durch 1.1.21 ersetzt, das den
    Standort-Fix zusaetzlich enthaelt). Changelog-Eintrag steht. **Offen:** Wear 1.2.20/1030 +
    Phone 1.1.20/34 in der Play-Pruefung, Zepp 1.0.4 weiter in Pruefung, und der gebaute
    Wear-Nachzug 1.2.21/1031 (Token-Heilung bei Config-401) wartet auf Jans Einreichung.
  - **iOS/Watch 1.1.21/25 gebaut (nur Code, Jans Xcode):** Apple Watch hatte dieselbe Luecke —
    Freigabe wurde angefragt, der Status aber nie geprueft. Jetzt `locDenied` (Start gesperrt,
    roter Hinweis) + `locReduced` („nur ungefaehr" -> Warnung). **Offen:** derselbe Fix fehlt
    noch im iPhone-Recorder (`Sources-iOS/PhoneRecorder.swift`) — Beta, gated, nicht beworben.
  - **Pairing-Bug (gefunden beim Nachsehen):** `WatchSync.pushPairing` schob bei jedem
    App-Vordergrund ein *gecachtes* `mintedWearToken` mit frischem Zeitstempel; die Uhr
    uebernahm jeden Push. Dadurch lebten zwei frische Code-Pairings des Nutzers (14:00, 14:15)
    je 3 Sekunden, danach lief alles wieder ueber das alte Token vom 12.07. -> „Neu verbinden"
    /Konto wechseln wirkte wirkungslos, die Geraeteliste fuellt sich mit Phantom-Eintraegen.
    Fix: Push uebernimmt nur, wenn die Uhr **kein** Token hat oder selbst eines angefordert hat
    (401-Recovery, `WearLink.wantsToken`); `ts` nur noch bei `force` -> unveraenderter Inhalt
    loest kein Ereignis mehr aus. **Offen (DB, nur nach Jans OK):** die 2 Phantom-Token-Zeilen
    aus der Geraeteliste des Nutzers raeumen.
  - **Web LIVE:** Anleitung Schritt 1 heisst jetzt „App auf der Uhr installieren" + Hinweis,
    dass der Play Store am Handy die Handy-App liefert (alle 15 Sprachen).
- **Stand 05.08. mittag: Garmin 1.0.72 LIVE** (gleicher Tag freigegeben; appmeta gesetzt;
  auf Jans echter Uhr feldverifiziert inkl. erster exact_chunks-Zeitachse via t0_ms).
  **Wear 1.2.19/1029 EINGEREICHT** (Puls-Fix + GPS-Gate) — durch 1.2.20 ueberholt.
  **iOS/Watch 1.1.20/24 EINGEREICHT** (11:17, GPS-Gate + Dropdown-Fix) — durch 1.1.21 ueberholt.
  **Zepp 1.0.4 weiter in Pruefung.** Nach Freigaben appmeta bumpen: wear 1.2.19/1.2.20 ·
  ios/apple 1.1.20/1.1.21 · zepp 1.0.4. Historie:
- **EINGEREICHT 01.08. (Jan): Garmin 1.0.71 (CIQ-Store) + Zepp 1.0.4 (Zepp-Konsole).**
  `appmeta` bleibt bis zur FREIGABE auf garmin 1.0.69 / zepp 1.0.3 (Tom-Petr-Lehre: nie die
  eingereichte Version hinterlegen). Nach Freigabe: `appmeta.garmin` -> 1.0.71,
  `appmeta.zepp` -> 1.0.4 (Store-URL fuer Zepp weiterhin unbekannt/leer). Die Website liefert
  Garmin 1.0.71 als Direkt-Download schon seit dem Build. **ALLE Plattformen eingereicht
  (01.08. abend):** iOS/Watch 1.1.19/23 (Zurueck-Fix verifiziert), Android 1.1.18/32 +
  Wear 1.2.18/1028 (Play Produktion, voller Roll-out, in Pruefung). Nach den Freigaben je
  Plattform `appmeta` bumpen: garmin 1.0.71 · zepp 1.0.4 · ios 1.1.19 · android 1.1.18 ·
  wear 1.2.18.

- **LIVE-STAND 2026-07-30** (loest die frueheren Stand-Zeilen weiter unten ab; `appmeta` ist auf
  genau diese Werte gesetzt): **Garmin 1.0.69** im CIQ-Store freigegeben (29.7., auf Jans Uhr aus dem
  Store getestet), **iOS + Apple Watch 1.1.18** von Apple freigegeben (29.7.), **Android Phone 1.1.17/31
  + Wear 1.2.17/1027** seit 31.7. im Play Store live (beide Tracks „Aktiv", 177 Laender, kein
  gestaffelter Roll-out) — `appmeta` steht jetzt auf diesen Werten.
  **Lehre daraus, gilt weiter:** vom 29. bis 31.7. stand in `appmeta` schon die EINGEREICHTE Version.
  Ein Nutzer mit 1.1.14 bekam dadurch einen Update-Hinweis, den Play nicht einloesen konnte. Also:
  erst hochsetzen, wenn die Freigabe da ist UND der Roll-out nicht gestaffelt laeuft. **Zepp 1.0.3 seit 31.7. im Zepp-Store freigegeben** (`appmeta.zepp` = 1.0.3).
  Achtung: freigegeben ist **1.0.3**, nicht 1.0.4 — eingereicht war der Stand VOR dem
  Release-Bump vom 28.7. Im Repo stehen `app.json` und `APP_VERSION` jetzt auf **1.0.4**, das ist
  der naechste, noch nicht eingereichte Build (enthaelt u. a. die durchgelassene `foil_id` und
  die App-Version pro Session). Nach Build + Freigabe `appmeta` auf 1.0.4 ziehen.
  Offen: **Store-Adresse fuer Zepp** (`store_url` ist leer, die App liegt im Zepp-Telefon-Store,
  eine Web-Adresse ist mir nicht bekannt) — ohne sie hat der Update-Hinweis auf der Uhr kein Ziel.

- **Naechste App-Runde: Aussortieren nachziehen.** In der PWA live seit 30.7.: einzelne Laeufe und
  freie Zeitbereiche aus der Auswertung nehmen (`excluded_ranges`, `POST …/runs/exclude` mit
  `run_index` ODER `start_ms`+`end_ms`, `POST …/runs/include`). Fehlt in Android + iOS; auf den Uhren
  bewusst nicht (Korrektur der Auswertung im Nachhinein). Ebenfalls offen fuer beide Apps: das
  Katalog-Kennzeichen „Masse abgeleitet" und der „Fehlt im Katalog?"-Weg zum Feedback. Tabelle:
  `docs/PARITY-AUDIT.md`, Abschnitt „Stand 2026-07-30".

- **ERLEDIGT 2026-07-28 — gemeinsames Release aller Apps (Historie).**
  Versionen im Repo gesetzt: **Android Phone 1.1.17/31**, **Wear 1.2.17/1027**, **iOS + Apple Watch
  1.1.18/22**, **Zepp 1.0.4/7**. Garmin bleibt bei 1.0.68 (unberührt).
  Dabei Phone und Wear auf dasselbe `x` (17) gebracht — das Schema will das (Memory
  `android-version-scheme`), tatsächlich waren sie auf 14 bzw. 16 auseinandergelaufen. Keine Version
  geht zurück; für die Phone-App ist es ein Sprung um drei Schritte.
  `appmeta` NICHT angefasst — erst nach Golive, das macht Jan.
  **Offen auf Jans Seite:** `xcodegen generate` (drei neue Dateien: `SportClass.swift`,
  `SetupView.swift`, `WatchLayoutRender.swift`), Xcode-Build/Archive, Zepp-Build auf dem Mac
  (Zeus CLI), signierte Releases + Store-Uploads, Changelog-Einträge zum Golive.
  **Für Zepp fehlt ein `appmeta`-Eintrag**, sonst bleibt der neue Update-Hinweis dort leer.
  Was portiert wurde und wie es verifiziert ist: `docs/PARITY-AUDIT.md`, Abschnitt „Stand 2026-07-28".

- **Zepp: die drei Rückstände sind ERLEDIGT (31.07., `38eadc2` + `04e7fb4`).** i18n (41 Strings,
  15 Sprachen, Wortlaut aus Garmin/Wear statt selbst übersetzt), Lauf-/Foil-Erkennung (Parameter
  wörtlich aus `SessionRecorder.mc`/`Recorder.kt`, 3-s-Median als fehlendes Geschwindigkeitsfenster)
  und der Layout-Renderer (widget-basiert, alle sechs Fallen aus `watch-layout-wire-format` beachtet).
  Offen bleibt bewusst: `pausePages` (Zepp hat kein manuelles Pausieren), schräge Linien (Zepp
  zeichnet nur Rechtecke), `setting/index.js` in der Handy-App (keine belegbare Sprachquelle).
  **Jan muss im Zeus-Simulator prüfen** — Prüfreihenfolge steht in `watch-zepp/README.md`, kritisch
  ist der Widget-Aufräumer bei mehrfachem Seitenwechsel.

- ~~**Zepp: drei Rückstände** (historisch, erledigt)~~, Reihenfolge war zwingend:
  1. **i18n-Mechanismus** — `page/i18n/en-US.po` ist noch das leere Beispiel-Gerüst, ~40 deutsche
     Strings stehen hart im Code. Ohne i18n lässt sich Elementtyp 2 (übersetztes Feld-Label) nicht
     spezifikationstreu zeichnen.
  2. **Lauf-/Foil-Erkennung** — es gibt nur `screen: idle|recording|summary`, kein `isFoiling`.
     Vorlage: `android/wear/.../Recorder.kt:90-121` (Hysterese 10/9 km/h, Dwell 4/3 s, Re-Arm 25 s).
     Auf Zepp fehlt zusätzlich ein Geschwindigkeitsfenster, es gibt nur `s.cur`.
  3. **Element-Renderer** — `hmUI` ist widget-basiert (`createWidget`/`deleteWidget`/`setProperty`),
     es gibt kein `dc`/`onUpdate`. Muster für dynamisches Erzeugen/Löschen existiert zweimal im Code
     (`_buildFoilBtns`/`_clearFoilBtns`, `showBar`/`hideBar`), Größen über `px()`. Außerdem die
     `views.length + 2`-Seitenarithmetik an vier Stellen anpassen.
  Hier ist nur `node --check` als Prüfung möglich; gebaut wird auf Jans Mac.

- **Wear + Apple Watch: strenger Zustandsring (`browse_all_pages = false`) fehlt.** Beide nutzen einen
  linearen Pager mit fester Seitenarithmetik; je Zustand wechselnde Seitenzahlen sind ein Umbau, der
  ohne Gerätetest riskant ist. Zudem gibt es dort kein manuelles Pausieren, `pause_pages` hätte also
  gar keinen Auslöser. Heute gilt: alle Datenseiten blätterbar, Übersicht zeigt Lauf-Ende/Pause.

- **LIVE (Stand 2026-07-22):** iOS 1.1.15 (App Store 19.7.), Android Phone 1.1.13, Wear 1.2.14/1024
  (22.7.), Garmin 1.0.60 (CIQ). `appmeta`: ios=1.1.15, android=1.1.13, garmin.latest=1.0.60.
- **Garmin 1.0.65 LIVE im CIQ-Store (2026-07-26)**, `appmeta.garmin.latest` = 1.0.65 gesetzt — OOM-Härtung unter Dauerlast: auf Uhren
  mit ≤128 KB schreibt der Recorder Accel-Chunks mit 750 statt 1500 Samples (halber RAM-Peak beim
  Aufnehmen UND beim Upload). Anlass: die fenix 5 eines Nutzers crashte über lange Sessions/große Uploads mit
  1.0.64. Jans Simulator-Test mit 1.0.65 lief durch, mit 1.0.64 reproduzierte er den Crash.
  **Website liefert 1.0.65 bereits aus** (121 Geräte gebaut, Katalog auf 1.0.65) → Sideload-Gegentest
  möglich. Update-Hinweis auf Alt-Uhren damit scharf. NICHT enthalten: konfigurierbare Pausen-Ansicht (Garmin-
  Client fehlt noch, jetzt unblocked) und die erweiterten Layouts (F2 P2).
- **Garmin 1.0.62 LIVE (2026-07-24, CIQ)** — GPS-first-Upload + nl/fi/cs on-watch. `garmin.latest`=1.0.62
  gesetzt (Update-Hinweis für Alt-Uhren scharf). **Android Phone 1.1.14 in Play-Prüfung**, **iOS 1.1.16**
  kompiliert (nach `xcodegen generate` für UploadProgressCard.swift) — Jan released beide. Nach deren
  Golive: `appmeta` android→1.1.14 / ios→1.1.16 nachziehen. Inhalt: Live-Upload-Karte + GPS-first.
  Details: Memory `watch-apps-release-state`.

## 🩹 Polish / kleine Baustellen
- **Verlauf-Karte abhärten:** osmdroid-Spot-Animation in der Scroll-Liste → am Emulator ANR bei
  schnellem Scrollen (echte Geräte ok). Idee: Karte erst auf Tap initialisieren statt beim Scrollen.
- **Sub-Screen-Header cyan:** Uhr/Datenseiten/Verknüpfte-Konten nutzen Material-`TopAppBar` (nicht
  cyan) — nur die 7 Haupt-Tabs haben die Marken-Leiste.
- **Off-Foil-Screen (nativ):** nur die 3 Feld-Selektoren, ohne den runden Uhr-Preview-Mock der PWA.
- **Update-Hinweis für ungepairte Alt-Uhr-Apps** (Henne-Ei): der Web-Update-Banner hängt am
  gepairten Gerät; eine noch nie gepairte Alt-App sieht keinen Hinweis. Generischen Store-Update-
  Hinweis erwägen. (war `todo-update-hint-unpaired`)
- ~~Garmin CIQ-Store-Listing „Pump Foil" → „Pumpfoil"~~ — ERLEDIGT: Store zeigt „Pumpfoil – Track
  Every Pump" (Titel + App-Name), kein „Pump Foil" mehr (bestätigt 2026-07-22).
- **Muttersprachler-Review** der Übersetzungen fr/it/es/fi (best-effort erzeugt).

## 🔌 Integrationen (credential-gated / extern)
- **COROS** — Workout-Push-Import gebaut + live, aber credential-gated; aktiv erst nach Freigabe.
- **Amazfit/Zepp** — ✅ **APPROVED & LIVE im Zepp/Amazfit Store** (2026-07-21 bestätigt): Pumpfoil v1.0.2
  (appId 1118995, ~40 Geräte inkl. Balance 2). Server nimmt Zepp-Uploads schon an (`platform=zepp`). Offen:
  Verifikation auf echter Amazfit (bisher nur Sim), 25-Hz-Accel (Zepp-API unklar → aktuell gps_only),
  bewerben (Banner-Amazfit-Subline jetzt freigebbar). Memory `zepp-recorder`.
- **Polar nativer BLE-Recorder — ZURÜCKGESTELLT (2026-07-15).** Kein On-Watch-App-Store bei Polar →
  Roh-Accel nur via Handy-BLE-SDK (Offline-Recording: Handy startet + holt ab → viel Reibung). Nutzen
  ggü. dem live AccessLink-Import = nur Pumps, bei hohem Aufwand/Hardware-Unsicherheit. Erst wieder,
  wenn Polar-Nutzer konkret nach Pumps fragen. Beta-Gerüst bleibt versteckt. Details: Memory `polar-recorder-plan`.
- (Suunto ✅ live, Polar ✅ AccessLink live, Garmin-FIT-Import wartet auf Garmins Formular.)

## 💡 Backlog (Produktideen — bewusst später)

- **Forum** (Threads/Antworten/Zitieren/Bilder, Bereiche, Spot-Kopplung) — Entwurf liegt in
  [`docs/FORUM.md`](FORUM.md) (Feature-Liste, Architektur, Phasen, 5 offene Entscheidungen,
  u. a. „öffentlich lesbar?"). Nur Planung, nichts gebaut; wartet auf Jans Entscheidungen.
- [x] **Komplettes Setup statt nur Front-Foil** — ERLEDIGT: Stabilizer, Mastlänge, Shim und Board je
  einzeln, mit Standard im Profil und Override je Session. Web + Server waren schon da; 2026-07-28 auf
  Android (`bbc766c`, `8065078`) und iOS (`83f3d89`) nachgezogen. Fuselage/Tail bleibt offen (kein
  Server-Feld) — als eigene Idee behandeln, falls jemand danach fragt.
- **Garmin-Datenseiten-UX aufräumen** (Feedback Tom 2026-07-20): Screen-Konfiguration verwirrend
  („weiß nicht wo ich bin"; Hinzufügen ersetzte den On-Foil-Screen durch 1/2/3), Feldbezeichnungen
  unklar (was heißt welcher Wert) — FoilMotion sei übersichtlicher. On-Watch/Web-Konfig-UX überdenken.
- **Session pausieren (Garmin)** (Feedback Tom 2026-07-20) — Aufnahme pausieren/fortsetzen können.
- [x] **Chat: Daumen-hoch für Beiträge** — ERLEDIGT: Server war fertig, Web hatte es; 2026-07-28 auf
  Android (`ecbefb3`) und iOS (`dc47149`) nachgezogen (Daumen unter dem Avatar, Zähler, abschaltbar).
- **Pumps/min über die Web-Detail hinaus** (Feedback Tom + Laurent) — Toggle Hz↔Pumps/min gibt's jetzt
  in der Web-Session-Detail; ggf. auch in Apps/Listen/Community anbieten. (Web-Detail erledigt 2026-07-20.)
- **Upload-Speed Garmin→pumpfoil.org** (Feedback Tom 2026-07-20): dauert „ewig" vs. Garmin-Sync —
  Chunk-Upload-Durchsatz/Parallelität prüfen. (R&D; BLE-Limit beachten.)
- **Pump-Kadenz auch in Pumps/Minute** (Feedback Laurent 2026-07-20) — zusätzlich zur Hz-Anzeige
  (×60). Kleine Anzeige-Ergänzung (Web/Apps/Nerd-Seiten); `avg_cadence_hz` liegt vor.
- [x] **Start-Erfolgsquote** — ERLEDIGT 2026-07-22 (Laurent): statt Fehlstart-Erkennung aus dem
  Rohsignal (unzuverlässig — Analyse zeigte das) pragmatisch per **Lauf-Distanz-Schwelle** (Jans
  Idee): erkannter Lauf < Schwelle = Startversuch, darüber = Erfolg. Home-Sektion unten, 5 Zeitfenster,
  Schwelle einstellbar (Default 20 m). Rein aus vorhandenen Distanzen, kein Reanalyze, persönlich
  (nicht Community-Rekorde). Endpoint `/api/community/start-success`.
- **Carves in der Karte** — ✅ LIVE 2026-07-21 (read-only, nur Anzeige): „Carves"-Modus in der Web-
  Session-Karte. Enge Turns (GPS-Kurs, ≥90°, Radius <12 m) grün→gelb→rot nach Kurvenlage (v²/r aus GPS),
  feine Catmull-Rom-Bögen, Zähler nach Grad-Bucket. Rein GPS (kein Accel). NICHT in Rekorde/Stats.
  Memory `turn-carve-detection-rnd`. **Offen:** Community-Feedback zu Miss/Over-Detection abwarten
  (Jan postet Ankündigung); Params (`step_m/rate_deg/min_rot/max_radius_m`) ggf. nachtunen; App-Port.
- **Turns/große Runden als EIGENES Feature** (Feedback Laurent, FoilMotion-inspiriert) — weite Turns
  getrennt von Carves: eigene Statistik + Rekorde (L/R-Zähler, Netto-Rotation, Vorzugsrichtung, Loops)
  aus GPS-Kurs (evtl. Gyro via FIT). Carves sind bewusst nur die engen (<12 m). R&D/Detektor → Jans OK.
- **„Wer foilt jetzt gerade?"** — laufende Sessions live (braucht Live-Upload während der Session +
  Privacy-Opt-in). Groß.
- **Kommentar-Auto-Übersetzung** in die Sprache des Lesers (auf Knopfdruck, Übersetzungen cachen).
- **Foil je *Lauf*** (per-Run-Foil + per-Run-Watt) — braucht Lauf-Foil-/Labeling-Ablage.
- **Foil-DB** — Abdeckung ist gut (393 Foils/24 Marken, alle großen Pump-Marken). **Takuma** war die
  einzige echte Lücke (Takoon≠Takuma, Google verwechselt sie) → **2026-07-22 ergänzt**: Kujira 1
  (750/980/1095/1210/1440) + Kujira II (650–1400), Fläche belegt, Spannweite tw. geschätzt, Dicke
  geschätzt+markiert. Ansonsten **on-demand**: fehlendes Foil meldet ein Nutzer → 2-Min-Nachtrag.
- ⏸ **Video direkt in der App aufnehmen** + self-hosten — zurückgestellt (YouTube-Link reicht;
  Transkodierung/Storage/Moderation = XL).
- **Paddle-Up-Support** (Idee 2026-07-19, Anlass: FoilMotion-FIT von Markus, Illmensee): Paddle-Up =
  Pumpfoilen, aber Startgeschwindigkeit wird liegend/kniend mit Paddel im Wasser aufgebaut (statt
  Absprung). Die **Startsequenz ist krasses, sehr charakteristisches Paddeln** → gut erkennbar; als
  eigenen Phasentyp erkennen: **Strokes bis zum Abheben zählen, Abhebe-Geschwindigkeit**, Zeit/Strokes
  bis on-foil. **Ab on-foil greift unser jetziges Pump-Modell** (nur die Start-/Anpaddel-Phase braucht
  eigene Logik). Detektor-/Modell-Arbeit → Jans OK; nicht jetzt.

- **„Pumpen für einen guten Zweck" — Sponsoren-Aktionen** (Idee 2026-07-19): lokale Firmen sponsern
  pro Pump an einem nahegelegenen Spot/See einen Betrag (z. B. 1 Cent/Pump) für einen selbstgewählten
  Zweck. Zeitlich begrenzte Aktionen mit eigener Landingpage/Werbung je Kampagne. Sponsoren
  **registrieren sich selbst** und tragen ein: Zeitraum, Geld pro Pump, Spot(s), Zweck. Banner
  selbst hochladen **oder** generieren lassen (KI-Aufruf) **oder** von uns vorgeschlagene Bilder
  verwenden. Beispiele: „Pumpen für Afrika", „Pumpen für den neuen Spielplatz im Kindergarten in
  Hintertupfingen". Groß (Self-Service-Portal + Kampagnen-Modell + Pump-Zählung je Spot/Zeitraum +
  Landingpages + Banner-Generierung + ggf. Zahlungs-/Nachweis-Fluss). Nur Idee, nicht umsetzen.
  - **Missbrauchsschutz (Kern der Zählbarkeit):** nur Pumps zählen, die **direkt mit einer unserer
    nativen Apps aufgezeichnet UND übertragen** wurden (kein FIT-/Fremd-Import, keine reinen
    GPS-only-Sessions) und **echte Accel-Daten** haben (Pump-Erkennung aus Beschleunigung, nicht
    schätzbar/fälschbar). Ggf. weitere Measures nötig: geräte-/session-gebundene Herkunft (Device-Token),
    Plausibilitäts-/Physik-Gates (wie beim Unecht-Verdacht), Rate-/Dedup-Schutz, evtl. Spot-Geofence
    (Pump muss am gesponserten Spot passiert sein). Sponsor-Geld hängt an gezählten Pumps → Zählung
    muss manipulationssicher sein.

## 🔬 R&D
- **Phone-Placement-Modell (Vergleich, unkritisch):** Erste echte Phone-Session (#646, Jeroen,
  Samsung A55) läuft mit dem Wrist-Modell einwandfrei (detection=model, 508 Pumps @ 1,5 Hz,
  plausibel; Accel effektiv 125 Hz statt getaggter 50 — Ratenerkennung fängt das). Eigenes
  Modell je `placement=phone` erst **zum Vergleich trainieren, wenn 10+ Handy-Sessions von
  unterschiedlichen Fahrern** da sind (2026-07-19, Jans Einschätzung). Nebenbeobachtung:
  Android-Recorder könnte on-device auf Zielrate resampeln (2,5× Upload-Volumen).
- **Board-/Foil-IMU → echte Pump-Technik-Analytik.** Wrist-GPS reicht nicht (Null-Test bestanden nicht);
  Jan sammelt 2-Uhren-Daten (Fußgelenk/Board/Foil, 25-Hz-Accel). Auswertung serverseitig, sobald
  Session-IDs + Uhr-Positionen vorliegen. Später evtl. 6-Achsen-Gyro-Logger am Mast. (Details:
  Memory `board-imu-experiment`, `docs/nerd`-Seiten.)
- **Pump-Zähler kalibrieren** (unter-erkennt ~2× lt. Label-App-Wahrheit) — Jans OK offen; physisch
  erst via X5-Rig. (Memory `pump-groundtruth`.)

## 🗒️ Doku-Hygiene
- [x] **`docs/PARITY-AUDIT.md` aktualisiert** (2026-07-22): war schon auf 07-13 gepflegt (fast volle
  Web-Parität); jetzt 10 Sprachen, Carve-Ansicht (Web-only) + öffentl. Teilen-Link ergänzt, **Amazfit/Zepp
  als 4. Recorder** mit Feature-Rückstand (kein Accel/Pumps, keine Lokalisierung) aufgenommen.

---

## 📤 Einreichungs-Protokoll

**Vorgabe Jan (18.08.): jede Einreichungs-Mitteilung von ihm wird hier mit ZEITPUNKT vermerkt.**
Grund: im Repo laesst sich sonst nicht nachsehen, ob etwas hochgeladen wurde — `appmeta` kennt nur
FREIGEGEBENE Versionen. Ohne diese Liste bleibt bei „habe ich das nicht schon hochgeladen?" nur
Raten, und eine verbrauchte Build-Nummer (App Store Connect verbraucht sie schon beim Upload, auch
fuer TestFlight; Play genauso einen versionCode) kostet eine Runde.

Neueste zuerst. Zeit = wann Jan es hier gemeldet hat (Europe/Berlin), nicht der Klick im Store.

**Beobachtung Wear OS (23.08.):** live ist immer noch **1.2.20** — Code vom 05.08., im Store seit
09.08. Der Wear-Track ist damit faktisch seit dem **10.08.** in der Pruefung: damals ging 1.2.21/1031
raus, ersetzt am 18.08. durch 1.2.23/1033 (dazwischen 1.2.22). Ein neuer Upload auf denselben Track
ERSETZT die laufende Pruefung, die Wartezeit beginnt also von vorne. Folge: solange wir waehrend der
Pruefung weiter bumpen, bleiben die Nutzer auf 1.2.20 stehen. **Regel daraus: einen Wear-Build in der
Pruefung nur ersetzen, wenn der Ersatz einen ECHTEN Fehler behebt** — Verbesserungen sammeln und in
die naechste Runde nehmen. Wear-Freigaben dauern ohnehin laenger als Phone (eigene Pruefung).
Was die Nutzer dadurch noch nicht haben: Token-Heilung bei Config-401 (1.2.21), Puls aktiv ueber
Health Services (1.2.22), Datenfeld 21 „Max-Puls letzter Lauf", Norwegisch.
Nicht betroffen: das automatische Pairing per Data Layer steckt schon in 1.2.20 — ein neuer Nutzer
kann mit der Store-Version normal aufnehmen (siehe den Meldungs-Befund oben in der Inbox).

| Gemeldet | Ziel | Version | Ergebnis |
|---|---|---|---|
| 2026-08-18 15:47 | iOS + Apple Watch | 1.1.24 (28) | ✅ **FREIGEGEBEN**, Mail 19.08. 06:26 („ready for distribution"). LIVE gegengeprueft ueber itunes.apple.com/lookup in de/us/nl/no/fi → 1.1.24, ausgeliefert seit 2026-08-18T23:51:11Z. `appmeta ios` + `apple` gesetzt, Changelog geschrieben. Uebermittlung `257c320a-…`; ersetzte die 15:44er unter der falschen Versions-Zeile „1.0.24" |
| 2026-08-18 15:38 | Wear OS (Play) | 1.2.23 (1033) | ✅ **FREIGEGEBEN**, Play-Mail 25.08.: Your update to Pumpfoil, created on Aug 18, 2026 at 1:38 PM GMT, is live in the store (13:38 GMT = 15:38 Berlin = genau diese Einreichung). Die Mail nennt KEINE Versionsnummer und keinen Track — wie am 09.08. deckt eine Mail beide ab (gleiche applicationId). `appmeta` gesetzt, Changelog geschrieben. **Sieben Tage Pruefung** |
| 2026-08-18 15:38 | Android Phone (Play) | 1.1.23 (37) | ✅ **FREIGEGEBEN**, Play-Mail 25.08.: Your update to Pumpfoil, created on Aug 18, 2026 at 1:38 PM GMT, is live in the store (13:38 GMT = 15:38 Berlin = genau diese Einreichung). Die Mail nennt KEINE Versionsnummer und keinen Track — wie am 09.08. deckt eine Mail beide ab (gleiche applicationId). `appmeta` gesetzt, Changelog geschrieben. **Sieben Tage Pruefung** |
| 2026-08-18 13:26 | Zepp | 1.0.6 (code 9) | ✅ **FREIGEGEBEN**, Mail 24.08. 12:08 (Wortlaut: The application Pumpfoil (1.0.6) you submitted has been approved and added to the ZEPP app store). `appmeta zepp` = 1.0.6 gesetzt und per `/api/app/latest?platform=zepp` geprueft, Changelog geschrieben. Sechs Tage Pruefung |
| 2026-08-18 (vormittags) | Zepp | 1.0.5 (code 8) | 🔴 ABGELEHNT — Nickname „zepp" + eckige Vorschaubilder; beides erledigt, Nachfolger 1.0.6 |
| 2026-08-17 | Garmin | 1.0.78 | ✅ FREIGEGEBEN am 17.08., von Jan aus dem Store auf die eigene Uhr aktualisiert und getestet |
| 2026-08-13 | iOS + Apple Watch | 1.1.22 (26) | ✅ LIVE 13.08. 19:38 UTC (gegengeprueft ueber itunes.apple.com/lookup in 5 Laendern) |
| 2026-08-06 | Zepp | 1.0.4 | ✅ FREIGEGEBEN 06.08. |

**Noch NICHT eingereicht** (gebaut/gebumpt, liegt bei Jan): nichts mehr — alle drei sind draussen.

### 🟢 Apple 18.08.: falsche Versions-Zeile, in drei Minuten behoben
Die Uebermittlung um 15:44 lief unter **„iOS 1.0.24"**, waehrend `project.yml` in beiden Targets
**1.1.24 / 28** sagt. Das war nicht kosmetisch: live ist 1.1.22, und `1.0.24 < 1.1.22` — im Store
stuende eine kleinere Nummer als bisher, und der Update-Hinweis brichte, weil er seit dem 18.08.
stellenweise numerisch vergleicht (`istNeuer`, derselbe Fix wie bei Zepp): mit
`appmeta apple = 1.0.24` wuerde die Apple Watch **nie** auf das Update hinweisen.

Ursache war die von Hand angelegte Versions-Zeile in App Store Connect (1.0 statt 1.1) — **nicht**
der Build: der trug bereits 1.1.24. Jan hat die Pruefung zurueckgezogen, die Version korrigiert und
um 15:47 neu eingereicht; **Build 28 blieb nutzbar**, kein neuer Build noetig.

**Merke fuer kuenftige Apple-Releases:** nach dem Upload einmal gegenpruefen, dass die Versions-Zeile
in App Store Connect ZEICHENGLEICH der `MARKETING_VERSION` aus `project.yml` entspricht. Solange der
Status „Warten auf Pruefung" ist, kostet ein Zurueckziehen nichts — nach der Freigabe waere die
kleinere Nummer im Store und muesste mit einer weiteren Version geheilt werden.

## 📥 Inbox

- **🔴 VORFALL: `build-all.sh` hat den LIVE-Ordner `watch/bin` ueberschrieben (30.08.).**
  Beim Messen des Speicherbedarfs der polnischen Sprachspalte habe ich `./build-all.sh` gestartet —
  das Skript schreibt nach `watch/bin`, und der Ordner wird pro Request ausgeliefert
  (`/api/app/download/<id>`). **111 von 121 `.prg` wurden mit einem UNVEROEFFENTLICHTEN Stand
  ueberschrieben, weiter unter der Versionsnummer 1.0.80.** Dauer bis zur Wiederherstellung
  ~15 Minuten. Der Connect-IQ-Store war nicht betroffen (eigener Vertriebsweg).
  - **Wiederhergestellt und BEWIESEN:** Worktree auf `66cdc9d0` (den Commit vor den
    Aenderungen dieser Woche, Config = 1.0.80), alle 121 Geraete neu gebaut, dann gegen die
    **10 nicht ueberschriebenen** Live-Dateien geprueft — **byte-identisch**. Danach kopiert und
    jede der 121 Dateien erneut gegen den Neubau verglichen: 0 Abweichungen. `catalog.json` war
    nie angefasst worden. Download ueber die API gegengeprueft.
  - **Ursache meinerseits:** die Memory sagt ausdruecklich „alle Geraete INS SCRATCHPAD bauen,
    NIE nach `watch/bin`" — ich habe trotzdem das Skript genommen, weil es bequemer war. Richtig
    ist `monkeyc -o <scratchpad>/<device>.prg` je Geraet.
  - **Zweite Falle dabei:** `pkill -f build-all.sh` hat meine EIGENE Befehlszeile mitgetroffen
    (steht so in [[multiuser-vm-command-traps]]) — der Abbruch kam dadurch verzoegert.

- **🟢 Polnisch ist jetzt auf ALLEN sieben Zielen (30.08.).** Web 1534 · Android 805 ·
  iOS 784 · Garmin 103 · Wear OS 90 · Apple Watch 84 · Zepp 59.
  - Uebersetzt wurde nur EINMAL je Text: 1534 im Web, danach 221 app-eigene und 57 uhr-eigene
    englische Quelltexte (entdoppelt). Alles andere ist ueber den englischen Text zugeordnet
    worden — damit lautet derselbe Satz nirgends anders.
  - **Speicher gemessen statt geschaetzt** (Rezept aus [[norwegian-language]], diesmal korrekt ins
    Scratchpad): Instinct 2, FR 55, fenix 5, Venu Sq **+0 Byte** — die LITE- und ENG-Builds
    schliessen das Sprachmodul aus und laufen auf `StringsLite` (Englisch). Nur die vollen Builds
    zahlen: fenix 7X Pro 94 956 -> **97 004 (+2 KB)**, 12 % von 786 KB. Schlechtester Fall bleibt
    die Instinct 2 mit 70 % — unveraendert durch Polnisch.
  - **Nebenbefunde, mit erledigt:** Norwegisch fehlte in den Sprachauswahlen von Android und iOS
    (auf iOS gar nicht waehlbar) und in Garmins `_systemIdx` (norwegische Uhr bekam Englisch,
    obwohl die Spalte seit dem 06.08. da ist). Beides zusammen mit `pl` nachgezogen.

- **🟢 Anleitung jetzt auch in den nativen Apps (28.08.).** Jans Frage „hatten wir das auf
  den Nativen einfach gar nicht?" — nachgezaehlt: **Web 98 `guide.*`-Schluessel, Android 0,
  iOS 0.** Der Tab „Anleitung" existierte nur in `Account.tsx`; die Apps hatten im Uhr-Bereich
  ausschliesslich den Verbinden-Bildschirm, der voraussetzt, dass die App schon auf der Uhr ist.
  - **Uebernommen: 39 Schluessel** — `guide.g.*` (Weg auf die Garmin), `guide.pair.*` (verbinden,
    umziehen, trennen) und `guide.sync.*` („wann laedt die Uhr hoch?", die haeufigste
    Supportfrage: Session fehlt, liegt aber noch auf der Uhr). **Nicht neu uebersetzt, sondern aus
    den Web-Locales kopiert** — sie liegen dort in allen 17 Sprachen, damit kann ein Satz nirgends
    unterschiedlich lauten. Je App 7 Sprachen in der Haupttabelle + 6 Overlays = 13.
  - **Neue Bildschirme:** `GuideScreen.kt` und `GuideView.swift`, erreichbar als **erster Eintrag**
    im Uhr-Bereich (ueber dem Verbinden-Eintrag) — wer die Uhr noch nicht eingerichtet hat,
    braucht zuerst den Weg dorthin.
  - Geprueft: alle benutzten Schluessel aufloesbar (Skript ueber `I18n.t(...)`/`Loc.t(...)`),
    Android und iOS haben denselben Satz von 39, Overlays je 234 Eintraege = 39 x 6.
    `:app:compileDebugKotlin` gruen, `swiftc -parse` gruen. `guide.pick` war zwischenzeitlich
    drin, wieder entfernt: „Waehle deine Plattform" passt nicht zu einem Bildschirm ohne
    Plattform-Auswahl.
  - **Noch nicht uebernommen** (bewusst): Screenshot-Strecke `guide.cap.*` (20), die Wege fuer
    Apple/Wear/Zepp (`guide.a.*`, `guide.w.*`, `guide.z.*`, 24) und `guide.settings.*` (9).
    Die lohnen erst, wenn die Bilder mitkommen bzw. wenn jemand danach fragt.

- **🟢 Android-App sagte nicht, WOHER die Garmin-App kommt (Feedback 27.08., franzoesisch).**
  „Franchement je n'arrive pas a installer l'application sur ma garmin" — geschrieben **aus der
  Android-App heraus** (Feedback-url `android-app`), Konto am selben Tag angelegt, 0 Sessions.
  Kein Nutzerfehler, sondern eine Luecke bei uns: der Garmin-Bildschirm der App beginnt mit
  „Pumpfoil auf der Uhr oeffnen (nicht starten) → MENU halten → Verbinden" — er setzt also
  voraus, dass die Uhr-App schon da ist. **Wie sie dorthin kommt, stand nirgends**, und bei
  Garmin kommt sie eben NICHT aus dem Play Store, sondern aus dem **Connect IQ Store** ueber die
  Garmin-Connect-App. Die Web-App erklaert das laengst (`guide.g.*` mit Store-Knopf) — die
  Android-App hatte **null** `guide.*`-Schluessel.
  **Gebaut:** Karte „Zuerst: App auf die Uhr" ganz oben auf dem Garmin-Bildschirm, mit Knopf in
  den Connect IQ Store (dieselbe URL wie `ConnectIqButton.tsx`). Texte in 13 Sprachen
  (7 in `I18n.kt` + 6 Overlays inkl. Franzoesisch, das der Melder sieht).
  **iOS hatte dieselbe Luecke** — geprueft und mit erledigt: `GarminPairView` beginnt jetzt
  ebenfalls mit einem `installSection` (Link in den Connect IQ Store), Texte in denselben
  13 Sprachen (`Loc.swift` 7 + 6 Overlays). In der GESAMTEN iOS-App gab es vorher keinen einzigen
  Connect-IQ-Verweis. `swiftc -parse` gruen.
  **Melder ist beantwortet** (28.08., Nachricht 1322 in `dm:230-372`, franzoesisch, aus meinem
  Konto — auf Jans ausdrueckliche Ansage): Store-Link, der komplette Weg bis zum Code, und der
  Hinweis, dass die Erklaerung in der App mit dem naechsten Update kommt.

- **🟢 Suunto: Vorfilter + Nachholen bei erschoepftem Kontingent (28.08.).** Ausloeser war
  Jans Frage nach den Sessions je Fahrer. Gemessen: 9 Fahrer, 235 Importe, aktuell **75 Sessions
  in 7 Tagen** (8,3 je Fahrer und Woche) — und **nur 59 % davon sind ueberhaupt Pumpfoil**
  (139 von 235). Wir haben also jedes GPS-Workout geladen, analysiert und 41 % wieder aussortiert.
  Rechnung gegen das Developer-Kontingent (200 Aufrufe/Woche fuer ALLE Nutzer zusammen):
  78 Importe x 2 Aufrufe + ~63 Token-Refreshes = **~219 von 200** — wir liefen also drueber, und
  ein 403 „Out of call volume quota" liess den Webhook-Ping ins Leere laufen (Suunto schickt ihn
  NICHT erneut, einen periodischen Sync gibt es nicht).
  - **Vorfilter `_vorfilter(wo)`** aus den Metadaten des Pings — greift, BEVOR ein Aufruf faellig
    wird: Dauer < 60 s, Distanz > 60 km, oder Schnitt > 30 km/h ueber mehr als 10 Minuten
    (Auto/Rad/Boot). Bewusst OHNE Sportart-Zuordnung: welche `activityId` jemand fuers Foilen
    benutzt, ist nicht vorhersagbar (unsere COROS-Anleitung empfiehlt „Speedsurfing"). Fehlt ein
    Feld, wird geladen — lieber ein Download zu viel als eine verlorene Session.
  - **Grenze nachgezogen, weil gemessen:** mit den zuerst gewaehlten 30 km haette der Filter
    rueckwirkend **14 echte Pumpfoil-Sessions (10 %) abgelehnt**. Mit 60 km sind es 0 Pumpfoil und
    27 % der Nicht-Pumpfoil. (Die Distanz war fuer den Test aus `avg_speed_mps` x Dauer
    rekonstruiert — `metrics_json` fuehrt keine Gesamtdistanz —, faellt dadurch eher zu hoch aus.)
  - **Warteschlange `suunto_pending`** (Modell + Tabelle): scheitert ein Import an 403/HTTP,
    landet der Workout-Key dort statt verloren zu gehen. Nachgeholt wird opportunistisch — bei
    jedem naechsten Webhook-Ping und bei jedem `/sync`, gedeckelt auf 5 je Lauf, und beim
    naechsten 403 bricht der Durchlauf ab. Es gibt bewusst keinen Scheduler; das haengt sich an
    das, was ohnehin passiert.
  - `/sync` antwortet jetzt zusaetzlich mit `filtered` und `pending`.
  - **Nachtrag 28.08., an den echten Luecken gemessen.** Im Journal stehen alle 65 Webhook-Pings
    seit dem 28.07.; abgeglichen mit den Sessions (ueber Nutzer + Zeitnaehe, die `session_uuid`
    traegt den Workout-Key leider nicht): **48 mit Session, 6 ohne, 11 von inzwischen
    entkoppelten Konten** (fuer die gibt es ohne Token nichts zu holen). Die sechs ueber die neue
    Warteschlange nachgeholt — und dabei gelernt, dass beide Ursachen ENDGUELTIG sind:
    einmal „kein gps" (Suunto liefert die Datei, sie enthaelt keine Position) und fuenfmal ein
    nacktes `403 Forbidden` — **nicht** die Kontingent-Meldung. Letzteres trat bei EINEM Nutzer an
    fuenf Workouts auf, waehrend ein anderes Workout desselben Nutzers durchlief: also eine
    Eigenschaft des einzelnen Workouts, nicht des Zugangs.
    -> `ENDGUELTIG`-Liste eingebaut: „kein gps", „doppelt", 403/404/410 fliegen sofort aus der
    Warteschlange, statt zehnmal Kontingent zu verbrennen. Wiederholt wird nur, was sich aendern
    kann (Kontingent, 5xx, Netzfehler). Warteschlange ist danach wieder leer.
    **Es ging also nichts verloren, was zu holen gewesen waere.**

- **🟡 Suunto: Production API haengt am Content-Formular (Mail vom 28.08.).** Suunto meldet
  sich von sich aus: die Production-Subscription ist abonniert, aber „we have not yet been able to
  confirm whether your integration is ready to be published" — freigegeben wird erst nach dem
  Partner-Content-Formular (`survey.alchemer.eu/s3/90553909`). Genau der Schritt, der in der Memory
  als erwartbar notiert war.
  **Vorbereitet:** fertige Antworten zum Kopieren (Kurz-/Langbeschreibung EN, technische Angaben,
  Plattform-/Sprachliste, Asset-Pfade) im Scratchpad, an Jan geschickt. Firma/Kontakt/Marketing-Mail
  fuellt Jan aus, eingereicht wird von ihm — ich reiche nichts extern ein.
  **Danach:** neuer Subscription Key -> `OAUTH_SUUNTO_SUBSCRIPTION_KEY` in `server/.env`,
  `foil-server` neu starten, einmal verknuepfen + importieren testen. Developer-Key erst danach
  wegwerfen (er ist der nachweislich funktionierende Zugang). Motiv: Developer-Limits sind
  10 Aufrufe/Minute und 200 pro Woche fuer ALLE Nutzer zusammen.

- **🟢 Audit „fremde Daten mit eigenen Werten gerechnet" — alles gefixt (27.08.).** Nach dem
  Leistungs-Fehler gezielt nach derselben Fehlerklasse gesucht: wo fliesst eine Einstellung des
  BETRACHTERS in die Darstellung fremder Daten ein, obwohl die des BESITZERS gelten muesste?
  Sieben Befunde, fuenf echte Fehler — alle behoben:
  1. **Vergleich (`Compare.tsx`, `CompareScreen.kt`, `CompareView.swift`)** — der ganze Korb wurde
     mit EINEM Gewicht gerechnet, dem des Betrachters. Ausgerechnet auf der Seite, deren Zweck der
     Fremdvergleich ist (sie schaltet bei zwei Fahrern selbst in den Fahrer-Modus). Jetzt je
     Session das Gewicht ihres Fahrers.
  2. **Karten-Farbmodus „Optimal" (`CompareMap.tsx`)** — die optimale Geschwindigkeit haengt ueber
     die Stall-Geschwindigkeit an der Wurzel des Gewichts. Mit dem eigenen gerechnet erschien der
     Track eines leichteren Fahrers durchgehend blau („zu langsam"), der eines schwereren rot,
     inklusive falscher Zahl in der Legende.
  3. **Rueckfall-Loch:** hatte der Besitzer einer fremden Session kein Gewicht hinterlegt, fiel die
     Rechnung wieder auf das eigene Profil zurueck — dieselbe fremde Session zeigte bei zwei
     Betrachtern zwei Leistungen. Jetzt: fremde Session ohne Angabe -> Standardwert, nie das eigene.
  4. **`FoilPowerStat` holte sein Gewicht selbst** (Falle fuer den naechsten Aufrufer) — Prop ist
     jetzt Pflicht, das Selbst-Nachladen ist raus.
  5. **Server, Admin-Pfad:** `_save_excluded` und `keep_powered_run` gaben `_session_out` ohne
     `owned=` zurueck -> Default `owned=True` -> Lauf-Liste im Empfindlichkeits-Preset des
     BESITZERS, waehrend der Klick ueber die kanonische Liste aufgeloest wird. Ein Admin, der an
     einer fremden Session einen Lauf aussortiert, haette danach eine andere Nummerierung gesehen
     und beim naechsten Klick den falschen Lauf getroffen. Jetzt `owned=(s.user_id == user.id)`.
  - **EINE Regel statt drei Rueckfall-Ketten:** `riderWeightFor()` (`web/src/lib/foilPhysics.ts`)
    mit den Spiegeln `FoilPhysics.gewichtFuer` in Kotlin und Swift. Reihenfolge ueberall gleich:
    Gewicht des Besitzers > (fremd: Standardwert) > eigenes Profil > Standardwert.
  - **Geprueft und ausdruecklich NICHT betroffen:** Puls-/Geschwindigkeits-Zonen (werden nie auf
    fremde Sessions angewandt; der Farbmodus „Puls" nimmt die Messwerte der Session selbst),
    `foil_sensitivity` ausserhalb von Punkt 5 (klemmt bei `owned=False` hart auf „normal"),
    `_resolve_foil`/`_resolve_setup` (Standard des Besitzers), Rekorde/Bestenlisten
    (`viewer_id` nur fuer Sichtbarkeit), Zeitzone (Spot der Session), Foil-Rechner (eigenes
    Werkzeug). Anzeige-Vorlieben des Betrachters — Sprache, Theme, Einheit hz/ppm, Zeitformat,
    manuelle Speed-Farbskala — bleiben bewusst beim Betrachter.

- **🟢 Theoretische Leistung: Teilen-Link rechnete mit anderem Gewicht (27.08., Meldung
  PeterH + von Jan reproduziert).** „Am PC 208 W, hinter dem Teilen-Link im Handy-Chrome 291 W,
  alle anderen Werte identisch." Jans eigene Session: **227 W eingeloggt, 243 W hinter dem Link.**
  - **Ursache gefunden:** `FoilPowerStat` (`components/FoilPower.tsx`) holte das Fahrergewicht
    IMMER selbst per `api.getSettings()`. Auf dem oeffentlichen Link gibt es keinen Login -> 401 ->
    `catch` faellt auf `DEFAULT_RIDER` (**95 kg** Fahrer + 10 kg Ausruestung). Es sind also
    dieselben Daten, nur eine andere Annahme. Verhaeltnis passt exakt: bei ~88 kg
    Fahrergewicht 1,07 (Jan), bei ~66 kg 1,40 (PeterH) — nachgerechnet mit der echten
    `computeFoilPowerAtSpeed`.
  - **Nebenbefund:** auf derselben Seite waren ZWEI Gewichte im Umlauf — die Kachel holte das
    Profil, die Lauf-Tabelle (`powerFor` in `SessionDetail`) nahm im Public-Modus bewusst den
    Standardwert. Ein eingeloggter Besitzer, der seinen eigenen Teilen-Link oeffnete, sah oben
    seine Zahl und in der Tabelle die Standard-Zahl.
  - **Gebaut:** Gewicht kommt jetzt als Prop von der Seite (`weightKg`), die Kachel holt es nur
    noch, wenn kein Aufrufer es mitgibt -> eine Quelle je Seite, und der sinnlose 401 auf dem
    oeffentlichen Link entfaellt. Die Rechengrundlage bleibt im **(i)-Tooltip**
    der Kachel (`power.tip`: Foil, Ø-Speed, Gesamtgewicht, Vortrieb/Pump-Traegheit). Ich hatte sie
    zwischenzeitlich als sichtbare Zeile unter die Kacheln gesetzt — zurueckgenommen (Jan, 27.08.:
    „das muss doch nicht noch extra zur Schau getragen werden"). Sie war nur sinnvoll, solange mit
    dem Standardgewicht gerechnet wurde und die Zahl dadurch unerklaerlich war; jetzt stimmt sie.
  - **ENTSCHIEDEN (Jan, 27.08.): das Gewicht des BESITZERS benutzen** — „das ist doch die
    Entscheidung des Nutzers genau diese Daten zu teilen, da kann man doch viel mehr entnehmen als
    nur das Gewicht, aus dem Pulsverlauf und den Lauflaengen". Stimmt: der Teilen-Payload enthaelt
    ohnehin den vollen Pulsverlauf. Umgesetzt: `SessionOut.owner_weight_kg` (`_owner_weight_kg`,
    liest `settings_json.weight_kg`, plausibel 20…300 kg) — **nur in der Einzelansicht**, in Listen
    bleibt das Feld leer (`slim=True`), dort gibt es keine Leistungsanzeige und ein Profil-Lookup
    je Zeile waere ein N+1. Im Web hat es Vorrang vor dem eigenen Profil und dem Standardwert.
  - **Damit nebenbei mitgefixt:** die Session eines ANDEREN wurde bisher mit dem Gewicht des
    Betrachters gerechnet — auch eingeloggt in der Community war die Zahl also falsch, nur ist es
    dort niemandem aufgefallen, weil es keine zweite Ansicht zum Vergleichen gab.

- **🟢 Eigene Session bearbeiten: Liste zeigt es sofort (27.08.).** Jans Befund: Foil, Stab
  oder Beschriftung geaendert -> in der Session-Liste erst nach einem Reload zu sehen.
  - **Ursache:** `/sessions` liest beim Zurueckkommen aus einem Modul-Cache (`listCache` in
    `Sessions.tsx`), den die Liste beim Wegnavigieren SELBST wieder fuellt. Der
    Hintergrund-Abgleich `revalidateHead` mischt aber nur **neue** IDs ein und fasst bekannte
    Eintraege bewusst nicht an — eine bearbeitete Session blieb also alt stehen, bis ein echter
    Reload die Map leerte. `PersonalHome` hat keinen Cache, dort war es immer sofort sichtbar.
  - **Fix:** neues `updateCachedSession(fresh)` (`Sessions.tsx`) legt die Antwort des Speicherns
    ueber den alten Eintrag — in den eigenen Listen und in den Community-/Spot-Gruppen (dort ein
    anderer Typ, `CommunitySession`, deshalb nur die bearbeitbaren Felder). In `SessionDetail`
    laeuft jetzt JEDES Speichern ueber ein `uebernehmen()`: Foil/Stab/Mast/Shim/Board,
    Beschriftung, Sportart/Datenqualitaet, Trim/Zeitbereich, Lauf aussortieren.
  - **Bewusst NICHT `invalidateSessionListCache()`**: das wirft den ganzen Cache weg — und damit
    die Scrollposition, zu der man nach dem Zurueck aus dem Detail gerade wollte. Wer nur sein
    Foil aendert, soll nicht oben in der Liste landen. Beim Lauf-Aussortieren stand genau das
    vorher drin und ist jetzt auch dort der gezielte Weg.
  - **Zusaetzlich** zieht `revalidateHead` bekannte Eintraege mit (`{...alt, ...frisch}`), damit
    auch eine Aenderung aus einem anderen Tab, Geraet oder aus den nativen Apps ankommt.
  - Moeglich, weil `PATCH /sessions/{id}/meta` bereits die vollstaendige Session zurueckgibt
    (`response_model=SessionOut`, derselbe Serializer wie die Liste) — kein zusaetzlicher
    Roundtrip noetig.
  - **Offen, kleiner Rest:** `pwaCache.warmMySessions()` fuellt den Service-Worker-Cache
    `api-session-detail` und ueberspringt alles, was schon drin liegt — eine bearbeitete Session
    hat dort also eine veraltete Antwort. Online faellt das nicht auf (NetworkFirst), offline
    schon. Waere ein `cache.delete` beim Speichern.

- **🟢 Speicher-Restzeit + Vorwarnung auf der Garmin-Uhr (27.08., Wunsch von Philipp).**
  „Wieviel Speicherplatz noch verfuegbar ist, fuer wie lange der voraussichtlich durchhaelt
  (entsprechend GPS-only oder gewaehlter Accel-Frequenz), ggf. vorab eine Warnung."
  - **Abfragen geht NICHT:** Connect IQ hat kein `freeStorage`, `System.getSystemStats()` ist RAM.
    Also gerechnet — Verbrauch exakt aus der Chunk-Geometrie (11,5 / 6,1 / 2,5 KB/min fuer
    25 Hz / 10 Hz / nur GPS), Kapazitaet **aus den Meldungen der Flotte gelernt**: laeuft der Store
    voll, schickt die Uhr ihr Puffervolumen mit, der Server merkt es sich je Geraet und Modell und
    gibt es als `storageBudgetKb` zurueck. 7 von 628 Uhren haben je gemeldet: **148–431 KB**, und
    die Grenze folgt NICHT dem RAM (fenix 5X mit 1,25 MB lief bei 180 KB voll, Venu Sq mit 128 KB
    erst bei 431) — es gibt also kein Modell-Schema, nur Messwerte. Rueckfall 200 KB.
  - **Daraus die Reichweite ohne Handy:** Instinct 2 / FR55 ~14 min bei 25 Hz, ~26 min bei 10 Hz,
    ~63 min nur GPS; Venu Sq 37/71/172 min. Das erklaert den Support-Fall vom 13.08.
    (54-min-Session, ein einziger Lauf).
  - **Angezeigt:** Startscreen (nur ohne Handy) in der Statuszeile — „GPS bereit · 25 Hz ·
    ~14 min Puffer", die Restzeit steht in der Wichtigkeit VOR dem Hz-Label. Waehrend der Aufnahme
    orange Vorwarnung unten + einmalige Vibration: „~12 min bis Speicher voll – beenden & syncen".
  - **Schwelle relativ** (`storageWarnMinutes`): 15 min, aber hoechstens 60 % der Gesamtreichweite,
    mindestens 3 min — sonst stuende die Warnung auf einer 158-KB-Uhr bei 25 Hz (12 min gesamt) ab
    der ersten Sekunde. Ergibt 7–15 min Vorwarnzeit je Geraet und Modus.
  - **Still, wenn ein Handy in Reichweite ist** (Puffer laeuft laufend leer) — Ausnahme unter
    3 Minuten, denn dann laeuft er offensichtlich NICHT leer (verbundenes Handy ohne Internet ist
    am Wasser haeufig). Ohne Budget: gar keine Anzeige statt einer erfundenen Zahl.
  - Neue Texte `err.storageSoon` + `start.bufferMin` in 14 Sprachen (+ StringsLite).
    Doku: [`docs/WATCH-STORAGE.md`](WATCH-STORAGE.md), verlinkt in `CLAUDE.md`.
  - **Bewusst nur Garmin** (Jans Entscheidung): Wear/watchOS/Zepp schreiben in echten
    Dateispeicher (Gigabytes) und koennten ihn sogar abfragen — dort ist es kein Thema. Ebenfalls
    zurueckgestellt: eigene Datenfelder „Speicher frei %" / „Restzeit" (waeren neue Feld-IDs in
    allen fuenf Renderern + Layout-Editor + 15 Sprachen).
  - **Instinct-2-Build jetzt 69,2 KB** (live 63,4; heute insgesamt +5,8 KB). Bei 96 KB
    Arbeitsspeicher im Simulator auf die Speicheranzeige schauen.

- **🟢 Farbskalen vereinheitlicht + im Profil einstellbar + dokumentiert (27.08.).**
  Jans Frage: „woher nimmt er die Farbskala?" — Antwort war: aus DREI verschiedenen Quellen.
  Die ZAHL hatte fest verdrahtete Stufen (Speed 12/16/20 km/h, Puls 120/150/170 bpm, seit dem
  ersten Commit ohne Herleitung), die WERT-GRAFIK nahm die Puls-Zonen aus dem Profil und fuer
  Speed die ALARM-Spanne, Wear hatte davor sogar einen stufenlosen HSV-Verlauf. Bei Standard
  8–25 km/h lagen die Grafik-Grenzen bei 8/11,4/14,8/18,2/21,6 -> **15 km/h = gruene Zahl und
  gelber Ring auf derselben Seite.**
  - **Neu `settings.speed_zones`** (sechs Grenzen, 1…80 km/h) genau wie `hr_zones`, mit
    `_clean_speed_zones` + `speed_zones_default`: 8 km/h bis zum **90.-Perzentil der
    Session-Maxima** (nicht das absolute Maximum — ein Doppler-Ausreisser wuerde die Skala
    dauerhaft verziehen), in fuenf gleiche Stufen. Rueckfall `[8,12,16,20,24,28]` — die ersten drei
    Grenzen sind bewusst die alten festen Stufen, ohne Einstellung sieht also nichts anders aus.
    Gemessen: 95 von 189 Nutzern mit Sessions bekommen einen eigenen Vorschlag (Obergrenzen 17–27).
  - **Zahl UND Grafik** nehmen jetzt dieselben Zonen — auf allen fuenf Renderern (Garmin, Wear,
    Apple, Zepp, PWA-Vorschau). `/api/devices/config` liefert `speedZones`; `speedScale` bleibt als
    abgeleitete Spanne `[z0,z5]` drin, damit **Garmin 1.0.80 im Store** unveraendert weiterfuellt.
  - **Einstellbar im Profil auf allen drei Oberflaechen:** Web (`ZonesCard.tsx` — aus `HrZones.tsx`
    verallgemeinert, EINE Karte, zweimal benutzt), iPhone (`SettingsView.spZonenSection`),
    Android (`SettingsScreen.ZonenBlock`, der Puls-Block ist jetzt derselbe Baustein).
    i18n `spz.*` in de/en/nb (Web), 7 Sprachen + nb-Overlay (iOS/Android).
  - **Garmin-Besonderheit:** die Skalen haengen NICHT mehr an `(:layouts)`. Die kleinen Uhren
    (96/128 KB) zeichnen keine Layouts, faerben aber die Zahl — sie haetten sonst weiter feste
    Stufen benutzt, waehrend das Profil etwas anderes anzeigt. Kostet ~800 Byte.
  - **Dokumentiert:** neue [`docs/COLOR-ZONES.md`](COLOR-ZONES.md) (Zonen, Farben, Vorschlags-
    Formeln, Abgrenzung zum Alarm, Code-Stellen je Plattform, drei Fallen), verlinkt in `CLAUDE.md`.
    Changelog-Eintrag 27.08. steht.
  - **Alarm bleibt getrennt:** `speed_min`/`speed_max` sind Zielfenster, nicht Farbskala.
  - Geprueft: Reinigung/Vorschlag als Fallliste (7 Faelle), Uhr-Config-Ableitung, `npm run build`
    (live), `:app:` + `:wear:compileDebugKotlin`, `swiftc -parse` (5 Dateien), Zepp-Modulcheck,
    Garmin-Builds instinct2/fenix5/fr55/fenix7xpro.
  - **Instinct-2-Build jetzt 67,6 KB** (live: 63,4) — mit den Umbruch-Aenderungen von heute
    zusammen +4,2 KB. Bei 96 KB Arbeitsspeicher im Simulator auf die Speicheranzeige schauen.
  - Versionen NICHT gebumpt (Wear/Phone/iOS/Zepp haengen in Pruefung, Garmin 1.0.80 ist Store-Stand).

- **🟢 Wear: App verschwand hinters Watchface (Nutzermeldung Instagram, 27.08.).** „After
  some time the app minimizes and the watch shows the default watchface instead of the app. The app
  continues to record the track in background" (Samsung Galaxy Watch, Akku-Optimierung war aus).
  Kein Datenverlust — der Foreground-Service lief weiter, nur die Ansicht war weg.
  - **Hauptursache ist bereits behoben, aber noch nicht draussen:** Always-on/Ambient
    (`AmbientLifecycleObserver`, `AmbientRecordingScreen`) steckt in **Wear 1.2.24**, die seit
    26.08. bei Google in Pruefung ist. Live ist **1.2.23** — genau die Version ohne Ambient. Der
    Melder faehrt also die letzte Fassung vor dem Fix.
  - **Zusaetzlich gebaut (27.08.), weil Ambient nicht alle Faelle abdeckt:** schaltet der Nutzer
    „Always-on Display" in den Systemeinstellungen aus, drueckt die Seitentaste oder kommt ein
    Anruf, landet man trotzdem auf dem Watchface — und hatte dann KEINEN Weg zurueck ausser dem
    App-Starter. Jetzt:
    `RecorderService` haengt einen `contentIntent` an die Benachrichtigung und meldet eine
    **`OngoingActivity`** an (`androidx.wear:wear-ongoing:1.0.0`) -> waehrend der Aufnahme sitzt
    ein Chip auf dem Watchface, ein Tipp fuehrt zurueck in die laufende Activity
    (`SINGLE_TOP | REORDER_TO_FRONT`, keine zweite Instanz).
    Dasselbe Loch gab es beim **Handy-Recorder** (Benachrichtigung ohne `contentIntent`) — auch
    dort nachgezogen.
  - **Version:** NICHT gebumpt. Wear 1.2.24 und Phone 1.1.24 sind in Pruefung; diese Aenderung
    geht mit der naechsten Runde raus (dann 1.2.25 / 1.1.25). Vor dem Bauen gegen `appmeta`
    pruefen, s. Regel oben.
  - **Antwort an den Melder: Entwurf liegt bei Jan** (Instagram-DM, englisch) — ich poste nichts
    selbst.

- **🟢 Klassische Datenseiten passen sich der Displaygroesse an (27.08.).** Jans Meldung:
  „die Standardscreens sind auf kleineren Displays noch zu gross". Nachgemessen aus den
  SDK-Geraetedateien (`~/.Garmin/ConnectIQ/Devices/*/simulator.json`, die Font-Dateinamen
  enthalten die Pixelgroesse) — **die Garmin-Fonts skalieren NICHT mit dem Display**:

  | Geraet | Display | numberMedium | xtiny | Zahl in % der Hoehe |
  |---|---|---|---|---|
  | fenix 7X Pro | 280 px | 39 | 13 | 14 % |
  | Instinct 2 | 176 px | 32 | 15 | 18 % |
  | Forerunner 55 | 208 px | 44 | 13 | 21 % |

  Auf der klassischen Drei-Feld-Seite gilt `halbe Zahl + Abstand + Beschriftung <= Slot`. Das war
  auf **33 von 107 auswertbaren Geraeten verletzt** (Ueberstand 0,3–5,2 px): Instinct 2/2X/2S/3/E,
  Descent G1, fenix 5/5S/5X(+)/Chronos, fr935/645/55/45, Swim 2, vivoactive/3, epix (Gen 1),
  Approach S60, D2-Reihe. Fix in `watch/source/RecordView.mc`: die Uhr **misst** jetzt
  (`getTextWidthInPixels`/`getFontHeight`) statt nach Feldanzahl zu raten —
  `_usableWidth` (auf runden Displays die **Sehne** auf Feldhoehe, nicht der Durchmesser),
  `_fitFont` (hoechster passender Font, nicht der erste — die Reihenfolge numberMild > large
  stimmt z. B. auf der Instinct 2 nicht) und ein echtes Hoehenbudget fuer den Wert, das Abstand
  und Beschriftung abzieht. Auf grossen Uhren aendert sich dadurch nichts.
  Gleiche Idee nachgezogen: **Wear** `AutoFitText` (schrumpft in 8-%-Schritten bis 55 %,
  die 60.sp waren fest verdrahtet) und **Apple Watch** `minimumScaleFactor` (0,5 Wert / 0,7
  Label; 40–49 mm plus Systemtextgroesse). **Zepp braucht nichts** — dort ist die Geometrie
  ueber `px()` schon proportional zur Displaygroesse.
  Gebaut/geprueft: instinct2, fenix5, fr55, venusq, fenix7xpro (alle drei Speicherstufen),
  `:wear:compileDebugKotlin` gruen, `swiftc -parse` gruen. **`watch/bin` bewusst NICHT neu
  gebaut** (ist live, und 1.0.80 ist der Store-Stand) -> geht mit der naechsten Release-Runde raus.

- **🟢 Lange Hinweiszeilen: umgebrochen statt abgeschnitten (27.08.).** Aus derselben
  Messung: nicht die Zahlen, sondern die uebersetzten Ein-Zeilen-Hinweise (alle `FONT_XTINY`)
  liefen ueber den Rand — `err.storageFull` auf der Instinct 2 mit 160 %, auf der fenix-5-Reihe
  mit 203 % der Displaybreite (dort ist `xtiny` **26 px bei 240 px Display**; auf Englisch, also
  auch in der ENG-Stufe: „Storage full – upload first" = 158 %). Kleinere Schrift ist auf Garmin
  keine Option — `FONT_XTINY` IST der kleinste Textfont. Also:
  - `_umbrechen`/`_drawWrap` in `RecordView.mc`: greedy Wortumbruch, bis zu 3 Zeilen, gemessen
    gegen die **Sehne auf der jeweiligen Hoehe** (unten am Rand ist eine runde Uhr nur noch einen
    Bruchteil so breit). `nachOben` fuer Zeilen, die am unteren Rand kleben.
  - `_zusammen`: Statuszeilen werden nach WICHTIGKEIT gebaut („GPS bereit" · Auto-Start · 25 Hz) —
    Teile fallen weg, wenn sie nicht mehr in die Zeile passen, statt die Zeile umzubrechen oder
    an beiden Enden abzuschneiden (so war es bisher auf jeder kleinen Uhr).
  - **Start- und Gespeichert-Screen fliessen** jetzt (Cursor + gemessene Zeilenhoehen) statt auf
    festen Bruchteilen zu sitzen. Die alten Anker lagen teils 10 px auseinander bei 19 px
    Zeilenhoehe — Hinweis und Foil-Zeile ueberlappten sich auf 176 px schon ohne Umbruch.
  - **Wenn es eng wird, entscheidet die Wichtigkeit**, nicht die Zeichenreihenfolge: auf dem
    Gespeichert-Screen faellt zuerst die Version, dann die Upload-Info — „START = neue Aufnahme"
    bleibt. Auf dem Startscreen faellt zuerst die Foil-Zeile, dann der DOWN-, dann der
    MENU-Hinweis; die START-Zeile bleibt immer.
  - **`klein` = wenige ZEILEN, nicht wenige Pixel**: `h < 13 * getFontHeight(XTINY)`. Die fenix 5
    hat 240 px, fasst wegen ihres 26-px-Fonts aber nur 7 Zeilen — weniger als die 176-px-Instinct-2
    (8,8). Auf solchen Uhren ruecken Titelband und Inhalt zusammen und die Version entfaellt.
  Nachgerechnet fuer 176/208/240/280/454 px, jeweils Normalfall und Warnfall (wartende Uploads +
  „erst hochladen"): keine Zeile mehr ausserhalb des Displays, keine Ueberlappung.
  **Speicher:** der Instinct-2-Build waechst dadurch von 63,4 auf 66,9 KB (+3,4 KB) — bei 96 KB
  Arbeitsspeicher bitte im Simulator kurz auf die Speicheranzeige schauen.


- **🟡 Versionen fuer die naechste Store-Runde gebumpt (26.08.) — Jan baut und testet.**
  Garmin **1.0.80** (gebaut, `watch/bin` live) · Phone **1.1.24/38** · Wear **1.2.24/1034** ·
  iOS + Apple Watch **1.1.25/29** · Zepp **1.0.7** (app.json `code` 9 -> **10**, `APP_VERSION` in
  `page/index.js` mitgezogen — die beiden Stellen sind schon einmal auseinandergelaufen, dann
  meldete die Uhr die alte Version). **Caveat Zepp-Buildcode:** El Manus korrigiertes
  1.0.6-Feldtest-Paket benutzt in seinem PR ebenfalls die 10. Unser Store-Stand ist code 9, also
  ist 10 der naechste freie — sollte die Zepp-Konsole sie ablehnen (weil dort schon ein Build 10
  liegt), auf 11 gehen.

  **Regel (Jan, 26.08.): Versionsnummern zaehlen RELEASES, nicht Builds.** Zwischenstaende zum
  Testen bekommen KEINE eigene Nummer. Ich hatte Garmin waehrend des Testens auf 1.0.81 und
  1.0.82 hochgezogen — zurueckgesetzt auf 1.0.80, dem naechsten Schritt nach dem Store-Stand
  1.0.79. Gegengeprueft gegen `appmeta` (die einzige Quelle dafuer, was WIRKLICH freigegeben ist):
  jede Plattform steht jetzt genau EINEN Schritt ueber ihrem Live-Stand — Garmin 1.0.79 -> 1.0.80,
  Phone 1.1.23 -> 1.1.24/38, Wear 1.2.23 -> 1.2.24/1034, iOS 1.1.24 -> 1.1.25/29,
  Zepp 1.0.6 -> 1.0.7.
  Inhalt dieser Runde: Wert-Grafiken in Layouts + Puls-Zonen, Spot-Beschreibungen und Spot-Label,
  AR-Badges, Katalog-Suche, GPX-/FIT-Download nativ, `expected_chunks`, Wear-Always-on,
  Wear verschluckt BACK, Live-Distanz ohne Stand-Zuwachs, gesaeuberter Max-Speed + Lauf-Merge.
  **Noch offen:** `appmeta` erst nach der jeweiligen Freigabe hochsetzen (Garmin steht auf 1.0.79
  = Store-Stand), Changelog-Eintrag zur Freigabe, `.iq` fuer 1.0.80 bauen, wenn Jan einreicht.

- **🟢 Umgesetzt (26.08.): Max-Speed gesaeubert + Laeufe ohne Stopp zusammengefuehrt, auf ALLEN
  sechs Recordern** (Garmin, Wear, Apple Watch, Zepp, Android-Handy, iOS-Handy).
  Erwartete Wirkung aus der Simulation unten: Max-Abweichung zum Server im Mittel **+9,4 -> +3,1
  km/h**, schlimmster Fall **+164 -> +17,4 km/h**; Lauf-Differenz Median **+1 -> 0**.
  Drei Aenderungen je Recorder:
  (a) **Burst-Klemme + 32-km/h-Deckel** fuer den Hoechstwert (Session UND Lauf). Der gesaeuberte
  Wert wird pro Fix **einmal** berechnet (`spdMaxClean`) — beim ersten Anlauf hatte ich ihn zweimal
  gerechnet, was den 15-s-Ring mit Doppel-Eintraegen auf ein 7,5-s-Fenster verkuerzt haette.
  Die Anzeige des MOMENTANwerts bleibt roh: dort ist ein Ausreisser nach einer Sekunde weg, im
  Maximum bliebe er die ganze Session stehen.
  (b) **3-s-MEDIAN statt Mittel** auf Wear, Apple Watch und beiden Handys — Garmin, Zepp und der
  Server rechnen schon mit Median.
  (c) **Lauf-Zusammenfuehrung**: ein neuer Lauf zaehlt nur nach einem echten Stopp (Speed unter
  1,5 m/s seit dem letzten Lauf-Ende), wie `_merge_no_stop` serverseitig. Die Lauf-KENNZAHLEN
  (letzter Lauf) bleiben wie bisher das letzte Bruchstueck — nur der Zaehler folgt dem Server.
  Garmin auf **1.0.80** gebumpt und gebaut; Groesse im ENG-Build (fr55) 65 116 -> 65 740 B (+624).
  Im Wear-Emulator gegengeprueft: 20 Fixes a 5 m (18 km/h) + ein 250-m-Sprung (≈900 km/h) ->
  Aufnahme laeuft weiter, **1 Lauf** (der Burst hat ihn nicht zerrissen), kein Absturz.
  NICHT umgesetzt (bewusst): Pumps auf der Uhr zaehlen — der Server-Zaehler unter-erkennt selbst
  ~2x, eine dritte abweichende Zahl macht es schlimmer.

- **🔎 Was koennte die UHR von der Server-Erkennung billig uebernehmen? An 119 echten Sessions
  simuliert (26.08., read-only, `scratchpad/uhr_sim3.py`).** Die Uhr-Logik (Hysterese 2,8/2,5 m/s,
  Dwell 4/3 s, 25 s Cooldown, 3-s-Fenster) gegen das Server-Ergebnis derselben Sessions gerechnet:

  | Kennzahl | heute (Uhr − Server) | mit den zwei Regeln unten |
  |---|---|---|
  | Max-Speed | Mittel **+9,4 km/h**, Median +1,8, schlimmster Fall **+164 km/h** | Mittel **+3,1**, Median +1,5, schlimmster **+17,4** |
  | Sessions mit Max > 5 km/h zu hoch | 36 von 119 | 26 von 119 |
  | Laeufe | Mittel +2,9, Median +1, Spanne −4…+44 | Mittel +2,6, Median **0**, Spanne −7…+44 |

  **LOHNT (billig, grosse Wirkung): Max-Speed saeubern.** Zwei Regeln, die der Server hat und die
  eine Uhr genauso kann — ein Ringpuffer von 15 Werten bei 1 Hz und zwei Vergleiche:
  (1) **Burst-Klemme**: liegt ein Wert mehr als 5 m/s ueber dem 15-s-Median UND absolut ueber
  28 km/h, gilt der Median (`BURST_MARGIN_MPS`/`BURST_ABS_MIN_MPS` in `analysis/gps.py`).
  (2) **Plausibilitaets-Deckel 32 km/h** (`RUN_MAX_PLAUSIBLE_KMH`): darueber ist es kein Pumpfoil,
  sondern ein Doppler-Glitch oder eine Bootsfahrt — nicht als Rekord zaehlen.
  Konkrete Faelle aus dem Bestand: Session 2830 zeigte auf der Uhr **103 km/h** (Server 15,0),
  Session 2847 **51 km/h** (Server 21,1). Genau diese Zahl sehen Nutzer als „Max" und vergleichen
  sie mit der Website.
  **LOHNT WENIG: Lauf-Zaehler.** Der Server merged Laeufe, zwischen denen es KEINEN echten Stopp
  gab (`_merge_no_stop`, Speed nie unter `NOSTOP_SPEED` = 1,5 m/s — ohne Zeitfenster). Die Uhr kann
  das mit einer Variablen nachbilden (kleinster Speed seit Lauf-Ende); bringt aber nur Median
  +1 -> 0, der Rest der Differenz kommt vom **Accel-Modell** und den Rand-Verlaengerungen
  (`_extend_starts_back`/`_extend_ends_forward`) — das ist nicht portierbar.
  **LOHNT NICHT: Pumps auf der Uhr zaehlen.** Der Server-Zaehler unter-erkennt ohnehin ~2x
  (Memory `pump-groundtruth`); eine dritte Zahl, die von beiden abweicht, macht es nur schlimmer.
  **Nebenbefund: Wear, Apple und die Handys nehmen ein 3-s-MITTEL, Garmin und Zepp einen
  3-s-MEDIAN** (wie der Server, `SMOOTH_WINDOW_S` + `_running_median`). Der Median ist gegen
  Einzel-Ausreisser robuster; in der Simulation aendert er die Lauf-Zahl kaum, ist aber die
  richtige Vereinheitlichung, wenn wir die Max-Regeln ohnehin anfassen.

- **🟢 Zwei der drei Befunde aus dem dritten Zepp-PR-Durchgang sind erledigt (26.08.).**
  **Stand-Schwelle fuer die Live-Distanz** in allen vier betroffenen Recordern (Wear, Apple Watch,
  Android-Handy, iOS-Handy): addiert wird nur noch, wenn der Fix brauchbar ist (Genauigkeit
  <= 20 m) UND Bewegung vorliegt — entschieden auf dem DOPPLER-Wert (> 0,5 m/s), weil der
  unabhaengig vom Positions-Zittern ist; liefert das Geraet keine Geschwindigkeit (jetzt als -1
  durchgereicht statt als 0, sonst nicht von echtem Stillstand zu unterscheiden), gilt eine
  Mindest-Verschiebung von 1,5 m je Fix. **BACK waehrend der Aufnahme** verschluckt Wear jetzt
  auch (`BackHandler(enabled = s.recording)`), wie Handy und Garmin schon.
  **Im Wear-Emulator gemessen** (AVD `foil_wear`, Wear OS 4): 30 gejitterte Fixes (+-1,5 m ueber
  59 s) -> **0 m** Distanz (vorher waeren daraus ~45 m geworden); danach 12 Fixes je 5 m ->
  **63 m** (erwartet ~60). Zurueck-Taste UND Randwisch lassen die Aufnahme-Ansicht stehen,
  `topResumedActivity` bleibt unsere Activity.
  Offen bleibt aus dem Durchgang nur Punkt 3 (bewegte Test-GPS-Spur fuer Wear/Apple).

- **🔎 Dritter Durchgang durch El Manus Zepp-PR — diesmal im CODE, nicht im Changelog (26.08.).
  Drei Befunde, Punkt 1 + 2 sind mit dem Eintrag oben erledigt:**

  1. **Live-Distanz laeuft im Stand weiter — auf Wear, Apple Watch UND beiden Handy-Recordern.**
     Alle vier summieren `distM += haversine(vorher, jetzt)` bei JEDEM Fix, ohne das
     Qualitaets-Gate, das direkt darueber fuer Anzeige/Max/Lauf-Erkennung schon existiert
     (`poor = accuracyM > 20` -> `sp = 0`). Die Lauf-Erkennung ist also geschuetzt, die Distanz
     nicht. El Manu hat dasselbe auf Zepp ueber ein 5-s-Netto-Verschiebungsfenster geloest — bei
     uns geht es einfacher, weil wir Genauigkeit UND Doppler-Geschwindigkeit haben (Zepp hat
     beides nicht).
     Gemessen an 400 echten Sessions (read-only, `scratchpad/wander.py`): die naive
     Punkt-zu-Punkt-Summe liegt bis zu **+53 %** (#2478: 13 794 m gegen 9 003 m analysiert) bzw.
     **+71 %** (#2558, Handy mit 26 044 Punkten) ueber der Server-Distanz. Ein Teil davon ist
     legitim (Trim/aussortierte Bereiche fehlen serverseitig), der Mechanismus ist aber am Code
     belegt. Betroffen ist nur die ANZEIGE auf der Uhr und die dort gezeigte Lauf-Distanz — die
     Rohdaten und damit die Auswertung bleiben unberuehrt.
     Vorschlag: Distanz nur addieren, wenn der Fix nicht `poor` ist UND die gemessene
     Geschwindigkeit ueber einem Standschwellwert liegt (ca. 0,5 m/s).
  2. **Wear OS verschluckt BACK waehrend der Aufnahme NICHT.** Der Handy-Recorder tut es
     (`RecordScreen.kt:108`, `BackHandler(enabled = st.recording)`), Garmin auch
     (`RecordDelegate.onBack`), El Manu hat es auf Zepp nachgezogen — auf Wear fehlt es. Ein
     Wisch nach rechts (auf nassem Schirm schnell passiert) verlaesst mitten in der Session die
     Aufnahme-Ansicht. Die Aufnahme selbst laeuft im Foreground-Service weiter, aber der Nutzer
     steht vor dem Watchface. Zwei Zeilen.
  3. **Testwerkzeug: synthetische GPS-Spur.** Er hat `DEV_FAKE_GPS` (im eingereichten Build aus).
     Unser `DemoReceiver` auf Wear injiziert nur STATISCHE Werte — damit laesst sich die
     Lauf-Erkennung und alles, was von Bewegung abhaengt, im Emulator nicht pruefen. Eine
     bewegte Demo-Spur waere fuer Wear und Apple ein echtes Werkzeug (die Ambient-Ansicht habe
     ich mit statischen Werten geprueft, mehr gab das Vorhandene nicht her).

  Nicht uebertragbar (geprueft): Touch-Sperre + Tastenbedienung (auf Wear/Apple darf man im
  Aufzeichnen wischen, das ist dort Absicht), Zepp-Zonen-API, Ring-Reihenfolge, T-Rex-Layouts,
  Icon-Groessen, Chunk-Groessen (Garmin liegt weit darueber), Auto-Start-Abschaltung.

- **🟢 Beide Funde aus dem Zepp-PR nachgezogen (26.08.).**
  **(a) `expected_chunks` schicken jetzt ALLE fuenf Recorder** — Garmin (`Uploader._startSession`,
  nur wenn die Aufnahme abgeschlossen ist), Wear, Apple Watch, Android-Handy, iOS-Handy (dort je
  `chunkFiles.size` vor `startSession`). Damit steht `sessions.expected_chunks` und
  `sessions.py:199` liefert `upload_total` — Web und Apps zeigen „x von y" statt eines
  unbestimmten Balkens. **Wichtige Einschraenkung, bewusst so:** bei einer LAUFENDEN Aufnahme wird
  die Zahl NICHT gesendet, sie waere zu klein und der Fortschritt lief ueber sein eigenes Ziel
  hinaus. Garmin-Version dafuer auf **1.0.80** gebumpt und gebaut (121/121, watch/bin ist live;
  `appmeta` bleibt auf 1.0.79 = Store-Stand, es gibt also keinen falschen Update-Hinweis).
  **(b) Wear OS hat jetzt eine Always-on-Ansicht.** `AmbientLifecycleObserver` (neu:
  `androidx.wear:wear:1.3.0`), angemeldet NUR waehrend der Aufnahme und danach wieder abgemeldet —
  eine dauerhaft ambient-faehige App bliebe auch im Leerlauf gedimmt auf dem Schirm statt dem
  Watchface zu weichen. Die Ambient-Ansicht ist schwarz, nur helle Schrift, keine Flaechen, keine
  Farben (Einbrennen + Strom), Inhalt bewusst auf drei Zahlen begrenzt (Tempo 3-s-Mittel, Dauer
  des Laufs, Distanz) und verschiebt sich im Minutentakt, wenn die Uhr Einbrenn-Schutz verlangt.
  **Im Wear-Emulator belegt** (neues AVD `foil_wear`, Wear OS 4 / API 34, 384×384): Demo-Aufnahme
  per `DemoReceiver`, `screen_off_timeout` auf 5 s, Screenshot nach dem Dimmen zeigt die
  Ambient-Ansicht (Log: `AmbientTaskStackManager: Timer org.pumpfoil.app/...MainActivity started!`),
  Weckdruck bringt die volle Ansicht zurueck.
  **Fallen dabei, fuer das naechste Mal:** der Test-Broadcast
  `com.google.android.wearable.action.ENTER_AMBIENT` wirkt NUR auf die alte
  `WearableActivity`/`AmbientModeSupport`-API — mit `AmbientLifecycleObserver` kommt der Zustand
  aus dem gebundenen `AmbientService`, also muss man den Schirm wirklich dimmen lassen. Und die
  Seitentaste (`keyevent 26`) ist auf Wear die HOME-Taste: sie fuehrt zum Watchface und sagt
  nichts ueber Ambient.

- **🟢 GPX-/FIT-Download der Session jetzt auch in Android und iOS (26.08.).** Letzte
  Paritaets-Luecke der Woche geschlossen: EIN Knopf mit Auswahlmenue (in der Kopfzeile ist kein
  Platz fuer zwei), Datei in den Cache bzw. das temporaere Verzeichnis, dann ans System-Teilen —
  ein Browser-Download gibt es auf dem Handy nicht. Dateiname wie der Server
  (`pumpfoil-<Datum in der Zeitzone der Aufnahme>-<id>.<endung>`), MIME getrennt
  (`application/vnd.ant.fit` / `application/gpx+xml`). Besitzer-Pruefung macht der SERVER
  (`_owned`), der Knopf blendet sich nur zusaetzlich aus — gegen eine fremde Session geprueft: 404.
  NICHT end-to-end geprueft (Bot-Konto hat keine eigenen Sessions, auf Jans Konto teste ich nicht);
  der Endpunkt selbst ist seit 21.08. per `scripts/export-check.py` verifiziert.

- **🔎 Review von El Manus Zepp-PR #3 — was daraus fuer UNS uebrig ist (26.08.).** Zweiter
  Durchgang, diesmal auf der Suche nach uebertragbaren Ideen (der erste war der Merge-Review).
  Zwei Funde sind echte Luecken bei uns, zwei Punkte sind bewusst anders, der Rest ist
  Zepp-Kosmetik:

  1. **`expected_chunks` schickt KEIN Recorder von uns** — Garmin, Wear, Apple und der
     Handy-Recorder: 0 Treffer. Der Server kann es seit Phase 3 (`sessions.expected_chunks`,
     `SessionStartIn.expected_chunks`), und `sessions.py:199` liefert es als `upload_total` an die
     Oberflaeche. Weil es nie ankommt, steht dort NULL und alle Clients zeigen einen unbestimmten
     Balken statt „12 von 30". Beim Draining einer gequeueten Session ist die Zahl exakt bekannt
     (die Zaehler `na_`/`ng_` stehen im Store) — also klein nachzurichten, betrifft aber den
     Upload-Pfad und damit ein Uhr-Release. **Frage an Jan: mit der naechsten Runde mitnehmen?**
  2. **Wear OS hat keine Always-on-/Ambient-Ansicht.** El Manu haelt auf Zepp den Schirm im Lauf
     wach (60-s-Fenster, alle 10 s erneuert). Garmin braucht das nicht (MIP/Systemverhalten),
     Apple laeuft in der `HKWorkoutSession` und bleibt vorn — aber auf Wear gibt es weder
     `AmbientLifecycleObserver` noch `OngoingActivity` (nur der Foreground-Service mit
     `setOngoing(true)`). Heisst: Handgelenk heben mitten im Lauf zeigt das Watchface, nicht die
     Zahlen. Das ist eine echte Luecke, aber eine Akku-Entscheidung → **Jans Aufruf**, und im
     Wear-Emulator zu pruefen.
  3. Bewusst anders: **Upload-Chunk-Groessen.** Sein „GPS 10 -> 20 Punkte, Accel 128 -> 256
     Samples" holt Zepp nur auf; Garmin liegt bei 1500 Accel-Samples (60 s) und 120 GPS-Punkten
     (120 s), also weit darueber. Nichts zu uebernehmen.
  4. Bewusst anders: **Auto-Start.** Er schaltet den geschwindigkeitsbasierten Start auf Zepp AB,
     weil Reisen unbeabsichtigte Aufnahmen erzeugte. Bei uns ist er ein Nutzerschalter und viel
     enger gefasst: 2,8 m/s ueber 4 s, NUR auf dem Startbildschirm und erst 10 s nach dem
     Betreten (`AUTO_START_MPS/DWELL/LEAD`). Kein Handlungsbedarf, aber der Befund ist notiert.
  5. Schon uebernommen: die **Canvas-statt-ARC-Erkenntnis** („ARC always renders rounded stroke
     caps on the T-Rex 3") steckt in unseren Wert-Grafiken, s. Eintrag oben.
  6. Rest ist Zepp-spezifisch (T-Rex-3-Layouts, Batterie-Anzeige, Icon-Groessen, Ring-Reihenfolge,
     Zepp-Zonen-API) oder betrifft nur seinen Fork.

- **🟢 Wert-Grafiken in Layouts + Puls-Zonen im Profil (26.08.).** Aus El Manus Zepp-PR uebernommen,
  aber GENERISCH gebaut (Jans Wunsch): zwei neue Layout-Elemente — `typ 8` Rand-Grafik (Start +
  Laenge auf dem Display-UMFANG ab 12 Uhr im Uhrzeigersinn, Dicke 1-4) und `typ 9` Balken (Mitte,
  Breite, Dicke). Beide zeigen den Fuellstand eines Feldes auf seiner Skala, `flags` Bit 0 faerbt
  nach Zone. Nur Felder MIT Skala erlaubt (`SCALED_FIELDS` in `layouts.py`: Puls 2/8/9/21,
  Geschwindigkeit 1/5/6/7/18/19) — der Server weist alles andere ab (geprueft: Feld 20 fiel raus,
  Dicke 9 auf 4 gekappt, Laenge 50 auf 125 = 1/8 Umfang gehoben).
  **Rund vs. eckig entscheidet der RENDERER** aus der echten Displayform, nicht der Autor: ein
  Layout, keine zwei Varianten. Fertig in PWA-Editor + Vorschau, Android-/iOS-Vorschau und auf allen
  vier Uhr-Plattformen.
  **Nur die grossen Builds (Jans Vorgabe 26.08.):** auf Garmin liegt alles hinter `(:layouts)`,
  LITE (96 KB) und ENG (128 KB) kompilieren den Code gar nicht mit; der Server liefert diesen Uhren
  ohnehin keine Layouts (Gating >= 512 KB). Wear/Apple/Zepp haben kein Speicher-Tier.
  **Puls-Zonen:** neu im Profil einstellbar (`settings.hr_zones`, sechs steigende Grenzen), ohne
  eigene Einstellung liefert der Server einen Vorschlag aus dem hoechsten je gemessenen Puls des
  Nutzers (klassischer 50/60/70/80/90/100-%-Schnitt; 141 Nutzer haben Pulsdaten, 190 als Rueckfall).
  `/api/devices/config` traegt `hrZones` + `speedScale`; Garmin cacht beides
  (`hrzones_config`/`speedscale_config`). **Bewusst NICHT** `UserProfile.getHeartRateZones` (Garmin)
  bzw. `Workout.getUserHrZoneSettings` (Zepp OS 4.2): Wear OS und watchOS haben keine Zonen-API, die
  Zahl muss also ohnehin vom Server kommen — dann aus EINER Quelle, sonst faerbt dieselbe Grafik je
  Uhr anders.
  **Nachgehaertet am 26.08. (zwei Befunde aus Quellen statt Annahmen):**
  (a) SDK-Doku `Toybox.Graphics.Dc.drawArc`: "0 degrees: 3 o'clock ... 90 degrees: 12 o'clock",
  Parameter werden gegen Null gekappt, und **gleiche Start-/Endwinkel zeichnen den VOLLEN Kreis**.
  Ein winziger Fuellstand (0,3 Grad) haette damit den ganzen Ring gefuellt -> jetzt erst ab 1 Grad
  zeichnen, Vollrunden bewusst als Vollkreis, Winkel auf [0,360) normalisiert.
  (b) **Zepp laeuft nicht mehr ueber das ARC-Widget, sondern ueber CANVAS + drawPoly.** Grund ist
  ein Geraetebefund aus @elmanu13s PR #3: "ARC always renders rounded stroke caps on the T-Rex 3" —
  ein Randsegment haette runde Enden bekommen. Nebeneffekte, die wir mitnehmen: EIN Widget statt
  vieler (kein Loeschen/Neuanlegen pro Sekunde, damit auch kein Z-Order-Problem mit dem Text) und
  dieselbe Zeichenweise fuer rund und eckig.
  Rand-Parameter nachgerechnet: p (0 = 12 Uhr, im Uhrzeigersinn) trifft in Web/Apps
  (`cx + r*cos(2*pi*p - pi/2)`, y nach unten) und Garmin (Grad `90 - 360*p`) fuer p = 0/0.25/0.5/0.75
  denselben Punkt.
  **Offen:** (1) Optik am Handgelenk hat niemand gesehen — Garmin 1.0.79 ist gebaut und sideloadbar.
  Der **CIQ-Simulator laeuft auf dieser VM NICHT**: er braucht `libwebkit2gtk-4.0.so.37` (libsoup2),
  Debian 13 hat nur 4.1 (libsoup3), und beides im selben Prozess bricht ab
  ("libsoup2 symbols detected"). Ersatz war eine PNG-Vorschau aus derselben Mathematik.
  (2) Android/iOS sind gebaut, aber nicht eingereicht — warten auf die naechste Store-Runde.
  Commits `092015d8` (Server + PWA), `c9bdf794` (Apps), `afd7c1b9` (Uhren).

- **🟢 Spot-Zahl: EINE Quelle fuer Banner und Spots-Seite + zwei unsichtbare Spots (26.08., 2. Runde).**
  Jan bestand zu Recht darauf, dass zwei sichtbare Zahlen fuer dasselbe Ding gleich sein muessen
  (Banner 198, Seite 203). Jetzt zaehlt `community_stats` mit `_spot_anzahl()` GENAU die Gruppen,
  die `spot_map` zeichnet — gleiche Gruppierung (`spot_id`), gleiche Koordinaten-Bedingung, gleiche
  Sportart-Basis (`sport="all"`: die Karte ist Uebersicht ueber alle Aufnahmen, man springt von
  jedem Marker in die Sessions-Liste). Sessions/Pumps im Banner bleiben Pumpfoil; „353 Pumpfoiler"
  sind ohnehin alle registrierten Nutzer.
  **Dabei zwei Spots gefunden, die es nirgends gab:** 339 (Haines Borough, Alaska, seit 17.08.) und
  373 (Einfeld, seit 21.08.) haben KEINEN Namen — `name_for` verlangt Ortschaft/Venue/Gewaesser, ein
  Bezirk/County faellt durch, und `spot_map` filterte namenlose Gruppen per `namen.get(sid)` still
  weg. Drei gueltige Sessions von zwei Nutzern, ohne Ortsangabe und ohne Marker. Zwei Fixes:
  (1) Anzeige faellt auf Gewaesser/Ortslage zurueck (kein DB-Schreiben), (2) `name_pending_spots`
  nimmt `area_name` als letzten Rueckfall — greift beim naechsten Wartungslauf
  (`dubletten_zusammenfuehren(apply=True)`), **noch nicht gelaufen, Jan fragen**.
  Beide Zahlen stehen jetzt auf **205**.

- **🟡 Spot-Zahl im Community-Banner: nach spot_id statt nach Namen (26.08., erste Runde — ersetzt durch die 2. Runde oben).** Jans Befund: Banner
  „196 Spots", `/spots` zeigt „(203)". Zwei Ursachen, eine davon ein Fehler: der Banner zaehlte
  `distinct place_name` — ein Spot, dessen Sessions noch keinen Ortsnamen haben, fehlte dadurch ganz
  (real 2 Stueck), und ein umbenannter Spot haette doppelt gezaehlt, solange alte Sessions den alten
  Namen tragen. Zaehlt jetzt `spot_id` (Sessions ohne `spot_id` behalten ihre Namensgruppe) -> 198.
  Der Rest ist ABSICHT und kein Fehler: die Karte zeigt auch Spots, an denen nur andere Sportarten
  aufgezeichnet wurden (7 Stueck: Velden efoil/foildrive, Zollikon 2 wakethief, 5x wingfoil), der
  Banner zaehlt nur Pumpfoil. Falls Jan das anders will: `spot-map` mit `sport=pumpfoil` aufrufen.

- **🟢 Ort + Spot: Ursache abgestellt, Bestand nachgezogen, Waisen-Spots weg (26.08.).**
  **Ursache:** `place_lat`/`place_name` entstanden NUR beim Oeffnen der Detailansicht
  (`GET /api/sessions/{id}` plante den Geocode-Task). Wer nur die Liste ansah, bekam nie einen Ort —
  und ohne `place_lat` gibt es keinen Spot, keinen Marker, kein Spot-Wetter, keinen Spot-Chat, keine
  Beschreibung. Beweis am Muster: Jan oeffnet alles und hatte 1 von 238 ohne Ort, andere Nutzer
  75-93 % ihrer eigenen. Jetzt laeuft der Task direkt nach der Analyse — im Ingest-Pfad
  (`_analyze_in_background`) und im Import-Pfad (`import_parsed_session`).
  **Bestand:** 102 gueltige Sessions nachgezogen, alle bekamen Ort UND Spot (0 Fehler, 0 Zeitlimits).
  **Jans Vorgabe dabei (26.08.): „keine aussortierten oder geloeschten sessions mit reinziehen."**
  Mein erster Lauf hatte alle 639 ortslosen genommen, davon 423 aussortierte — abgebrochen, und die
  **102 bereits gesetzten Koordinaten aussortierter Sessions wieder auf NULL** gesetzt (eindeutig
  erkennbar: Koordinate ohne Namen, denn Stufe 1 setzt nur Koordinaten). Filter jetzt im Skript.
  **Neue Regel im Code, ebenfalls Jans Vorgabe:** aussortierte und geloeschte Sessions erzeugen
  keine Spots (war beim ANLEGEN schon so) — und beim nachtraeglichen Aussortieren/Loeschen wird der
  Spot geloescht, wenn keine gueltige Session mehr an ihm haengt: `_spot_aufraeumen()` in
  `api/sessions.py`, eingehaengt in eigenes Loeschen, Admin-Loeschen, Admin-Aussortieren und in den
  Nach-Analyse-Haken (der Detektor kann `is_pumpfoil` auch selbst auf False drehen).
  Zwei Schutzregeln: Spots MIT Spot-Beschreibung bleiben stehen (fremde Inhalte loeschen wir nicht
  wegen einer Umklassifizierung), und die verbliebenen (ungueltigen) Sessions werden vorher
  losgekoppelt, sonst haelt der Fremdschluessel die Zeile.
  **Bestand bereinigt:** 5 Waisen-Spots ohne gueltige Session geloescht (Moliets-et-Maâ,
  Aix-en-Provence, Burgweiler, Louvie-Juzon, Silkeborg 2) — 0 Waisen.
  **Und die letzten 5 Nachzuegler zugeordnet:** gueltige Sessions MIT Laeufen, die eine Koordinate
  hatten, aber keinen Spot — die hatte mein Nachtrag nicht erfasst, weil er auf FEHLENDE Koordinaten
  gefiltert hat. Drei fielen in vorhandene Spots (West-Terschelling 2, Annecy 2, Silkeborg), zwei
  haben eigene bekommen (Velsen-Noord, Kiruna kommun). Bei #2753 stand `place_name` noch auf dem
  inzwischen geloeschten „Silkeborg 2"; jetzt zeigt sie auf „Silkeborg", wo auch die Nachbar-Session
  liegt.
  **Stand danach: 219 aktive Spots, 0 Dubletten-Kandidaten (Mitte ODER Steg <= 100 m), 0 Waisen,
  0 gueltige Sessions ohne Ort, 0 gueltige Sessions mit Laeufen ohne Spot.**
  **⚠️ Eigener Fehler, der Aufraeumen noetig machte:** mein „zurueckgerollter" Test von
  `_spot_aufraeumen` hat Daten in die DB geschrieben — die Funktion **committet intern**, damit war
  der Rollback wirkungslos. 2 Test-Spots, 4 Test-Sessions und 1 Test-Beschreibung sind entstanden
  und wurden sofort geloescht (gegengeprueft: 0 Reste). **Lehre: Helfer, die selbst committen,
  lassen sich nicht per Transaktions-Rollback testen** — dafuer braucht es eine eigene DB oder ein
  Savepoint-Muster.

- **🟢 Alt-Kategorie „wake" ist aus dem Community-Dropdown verschwunden (25.08.).** Jans Frage
  („warum ist die noch immer da, ist das noch referenziert?"): ja, absichtlich — `SPORTS_LEGACY`
  haelt sie sichtbar, damit Altbestaende bei der Aufteilung vom 05.08. (`wakethief` / `towed` /
  `surf_wave`) nicht stumm aus jeder Kategorie fallen. Der Eintrag kam also nicht aus dem Code,
  sondern aus DREI Sessions, die ihn noch trugen.
  **Belege fuer die Zuordnung** (alle drei desselben Nutzers, alle am selben Spot #96 „Senden"):
  er hat eine spaetere Session dort **selbst** auf `wakethief` gesetzt (`sport_source = owner`) und
  seine Standard-Sportart steht ebenfalls darauf; die Lauf-Profile zeigen kurze Laeufe neben
  einzelnen sehr langen (1637 s / 6,4 km bzw. 3736 s / 13,2 km bei ~13 km/h) — die Signatur einer
  mitgenommenen Schiffswelle, nicht von Eigenleistung (46 km gepumpt waere absurd, zwei der drei
  haben gar keine Accel-Daten) und nicht von `towed` (zu langsam).
  **Gemacht:** die drei ueber `PUT /api/sessions/{id}/classification` als Admin auf `wakethief`
  gesetzt (bewusst ueber den Endpunkt, nicht per SQL — Validierung, `sport_source`, Protokoll).
  **Geprueft:** `/api/community/sports` listet `wake` nicht mehr, das Dropdown hat jetzt fuenf
  Eintraege (pumpfoil, wingfoil, wakethief, efoil, foildrive); `wakethief` ist von 21 auf 25
  Sessions gewachsen. `SPORTS_LEGACY` bleibt im Code stehen — es kostet nichts und faengt den
  naechsten Umbenennungs-Fall ab.
  **Keine Nachricht an den Nutzer** (Jan, 25.08.: „das ist doch unsinn") — die Zuordnung entspricht
  seiner eigenen.

- **🟢 Play-Freigabe da (25.08.): Phone 1.1.23/37 + Wear 1.2.23/1033 sind LIVE.** Sieben Tage
  Pruefung. `appmeta android` = 1.1.23 und `appmeta wear` = 1.2.23 gesetzt (per
  `/api/app/latest?platform=android` geprueft), Changelog-Eintrag geschrieben, Einreichungs-
  Protokoll auf ✅.
  **Von Jan bestaetigt (25.08.): beide Tracks sind live.** Damit ist die Regel zweimal belegt
  (09.08. und 25.08.): bei Play kommt fuer Phone UND Wear **eine einzige Mail**, sie nennt weder
  Version noch Track, sondern nur den Zeitpunkt der Einreichung („created on … at … GMT", GMT ->
  Berlin umrechnen). Der Zeitpunkt ist der Schluessel zur Zuordnung — deshalb steht er im
  Einreichungs-Protokoll. Nicht mehr nachfragen, sondern beide `appmeta`-Schluessel setzen.
  **Damit ist die Play-Warteschlange frei**, und der ganze Stapel aus der Zwischenzeit kann in die
  naechste Runde: Spot-Beschreibungen (lesen/schreiben/Fotos, inkl. Auswahl aus Session-Fotos),
  Knopf „Spot-Sessions & Beschreibung" im Session-Detail, Spot-Zusatz (Gewaesser/Steg) in Titel und
  Auswahl, AR in den Foil-Badges. **Vor dem naechsten Einreichen Versionen bumpen** (Phone 1.1.24,
  Wear 1.2.24) — und dann nicht mehr ersetzen, solange die Pruefung laeuft.

- **🟢 Diktat: „Bearbeiten" liess das Eingabefeld leer (Jans Meldung 25.08.).** Der Weg lief
  ausschliesslich ueber `rec.onend`: `endWith("edit")` setzte nur eine Absicht und rief `stop()`,
  und erst das Ende-Ereignis schrieb den Text mit `onChange` ins Feld. Beides ist bei der
  Web-Speech-API nicht garantiert — nach `stop()` muss kein Ende mehr kommen (besonders wenn die
  Erkennung gerade zwischen zwei Sessions neu startet, unser Auto-Restart mit
  `continuous = false`), und wenn es kommt, koennen `finalRef`/`sessFinalRef` schon leer sein.
  **Jetzt uebergibt `endWith("edit")` den Text SOFORT** — Quelle ist `preview`, also genau der
  Text, den der Nutzer im Vollbild sieht, plus der vorher im Feld stehende. `onend` schreibt danach
  nicht mehr (Merker `uebergebenRef`), sonst haette es das gefuellte Feld wieder leeren koennen.
  „Uebernehmen" (senden), „Abbrechen" und „Nochmal" bleiben unveraendert.
  **NACHTRAG — die EIGENTLICHE Ursache (Jans zweite Meldung: „der Chatraum wird auch
  geschlossen"):** beides war EIN Fehler. Der Chat legt auf Touch-Geraeten eigene History-Marker
  (eine Ebene je UI-Stufe: Liste, Raum) und schliesst beim `popstate` eine Ebene. Das
  Diktier-Vollbild legt ueber `useCloseOnBack` einen WEITEREN Marker und raeumt ihn beim Schliessen
  per `history.back()` ab — und dieses `back()` konnte der Chat-Handler nicht von einer Wisch-Geste
  unterscheiden. Er schloss also den Raum, die Chat-Komponente wurde ausgehaengt, und der gerade
  uebergebene Text ging mit ihrem State verloren. Deshalb half der erste Fix (sofort uebergeben)
  nicht: das Feld war nicht leer, es war weg.
  **Behoben mit `web/src/lib/selfPop.ts`:** wer selbst `history.back()`/`go()` ruft, meldet es
  vorher an; alle unsere popstate-Handler ignorieren so ein Ereignis. Zuruckgesetzt wird NACH dem
  Ereignis-Durchlauf (einmaliger Listener + `setTimeout`), damit ALLE Handler denselben Stand sehen
  und nicht nur der erste. Eingebaut in `useCloseOnBack` (Anmelden + eigener Handler) und im
  `DmWidget` (ignoriert fremde Selbst-Pops). Gilt damit auch fuer Galerie, Teilen-Dialog,
  Vollbild-Karte usw. UEBER einem Chat.
  **Nicht browsergetestet:** auf dieser VM gibt es keine Sprach-API und kein Test-DOM (kein jsdom
  im Projekt, und dafuer wollte ich keine Abhaengigkeit hinzufuegen).

- **🔍 Review von El Manus Zepp-Pull-Request (PR #3) — NICHT gemerged (Jans Vorgabe 25.08.).**
  `watch-zepp` only, 19 Dateien, +1656/-213 (davon `page/index.js` +1434). Ausserhalb von
  `watch-zepp` aendert er nichts. Er selbst schreibt „keep this pull request as a draft" und hat
  **4 von 7 Feldtest-Punkten offen** (Ring R1/R2/R3, R3 oeffnet bei Lauf, R3 bleibt hell, voller
  Upload mit Lauferkennung). Im Chat (23.08.) kuendigte er ausserdem weitere Fixes an.
  **Muss vor einem Merge geklaert werden:**
  1. **Versions-Kollision:** er setzt `code 10, name 1.0.6` — unser **1.0.6 (code 9) ist seit
     24.08. im Zepp-Store freigegeben**. Zwei verschiedene Builds unter derselben Nummer; muss
     1.0.7 werden, sonst luegt auch `appmeta zepp`.
  2. **Emoji-Regel:** das 🔒 auf dem Touch-Sperr-Schild ist wieder drin (`page/index.js:942`) —
     genau das haben wir am 18.08. entfernt.
  3. **`t0_ms: req.t0_ms || 0`** in `app-side/index.js`: fehlt der Wert, behauptet die 0 eine
     EXAKTE Chunk-Startzeit (der Server schreibt bei not-None ein Sidecar und baut daraus die
     Achse). Besser das Feld weglassen und den Server schaetzen lassen.
  4. **Auto-Start wird bewusst ignoriert** (Kommentar in `page/index.js:813`) — Abweichung von
     Wear/Garmin und von der Server-Einstellung. Produktentscheidung Jans; wenn so, sollte die
     Einstellung fuer Zepp nicht als aktiv erscheinen.
  **Uebernehmen fuer ALLE Uhren (die eigentliche Ausbeute):**
  - **GPS-Ruhe-Gate**: Netto-Bewegung ueber ein Fenster statt Punkt-zu-Punkt, und wiederholte
    identische Koordinaten NICHT als Null-Speed in den 3-s-Median. Genau die Fehlerklasse, die
    ThermikDreher gemeldet hat („erster Lauf 7 km/h Ø") und die auf Garmin belegt ist (Nutzervideo,
    100 km/h im Stehen am Steg).
  - **Start erst mit GPS-Fix** (Knopf grau bis Fix, Vibration + Ton bei Fix) — haette Idahobies
    Fall entschaerft.
  - **Upload:** BLE-Chunk fruh bestaetigen, in eine begrenzte Queue legen, Handy→Server parallel,
    COMPLETE erst nach allen Requests. Korrigiert unsere Annahme „Zepp sequenziell, parallel bringt
    nichts" (Memory `upload-parallelization` praezisiert).
  - **Accel inkrementell auf die Platte + Resume**, und die Datei loeschen, wenn keine GPS-Punkte
    dazu existieren (keine Waisen nach einem Neustart in den ersten Sekunden).
  - **Puls-Zonen des Nutzers** (`Workout.getUserHrZoneSettings`, 5 Zonen) fuer einen Ring —
    sauber abgesichert (Capability-Pruefung, Plausibilitaet, Fallback auf feste Grenzen). Garmin
    kann Zonen ueber `UserProfile` auch; ThermikDreher hat genau danach gefragt.
  **PR #2** (ein Zeile, `fr.ts`: „Mes" → „Les miennes"): plausibel, aber es ist ein TAB-Label in
  der Kurzform — vorher im Web ansehen, ob die Leiste auf dem Telefon nicht bricht.

- **🟢 Vier Meldungen aus dem Chat-/Feedback-Durchgang abgearbeitet (25.08.).**
  1. **Detailansicht zeigte alte Werte** (Alex, 20.08.: „13 runs in der Uebersicht, 12 wenn ich die
     Session oeffne"). Ursache: die Session-Detailantwort baut ihr ETag aus `sessions.updated_at`,
     und `run_analysis` hat den Stempel NICHT gesetzt — nach einer Reanalyse kam also „304 – nicht
     geaendert" und der Client zeigte seinen alten Stand, waehrend die frisch gerechnete Liste die
     neuen Zahlen hatte. `run_analysis` stempelt jetzt `updated_at` (eine Zeile am Ende, aendert
     nichts an der Analyse; deckt ALLE Pfade ab — Upload, Reanalyse, Merge, Massenlauf).
  2. **Aussortierte Sessions verfaelschten die Verlaufskurven** (PeterH, 16.08.: „wird aber in
     meiner Historie gezaehlt"). `/api/sessions/history` filtert jetzt `is_pumpfoil.isnot(False)`,
     wie schon `my_spots`/`spot_tracks`. Geprueft: zwei Nutzer mit 58 bzw. 51 aussortierten
     Sessions haben davon 0 in der Kurve.
  3. **Spot-Auswahlfeld: eigene Spots zuerst** (Philipp, 22.08.) — zwei Gruppen („Meine Spots" /
     „Weitere Spots"); ohne eigene Spots bleibt es die einfache Liste. Und **„Aussortiert" schaltet
     auf „alle"**, weil aussortierte Sessions meist keine Accel-Laeufe haben und die Liste sonst
     leer aussieht (sein zweiter Punkt).
  4. **Streckung (AR) in den Foil-Badges** (ThermikDreher) — ueberall, wo wir belastbare Masse
     haben: Web (`lib/foilLabel.ts`: Session-Detail, eigene + fremde Listen, Profil-Unterzeile),
     Android (`foilLabel()` in Models.kt, eigene + Community-Zeilen), iOS (`foilLabel()` in
     Models.swift, beide Chip-Texte). Fehlt Flaeche oder Spannweite, bleibt die AR weg. Der Server
     liefert `aspect_ratio` dafuer jetzt auch in den Community-Zeilen mit.
  **Noch offen aus dem Durchgang:** Antworten an Alex und Beat (Jan gefragt); Beats zweiter Punkt
  („Uhr zeigt 0.06 als Laufzeit") ist mit unseren Formaten nicht erklaerbar — die Dauer wird als
  „1:06" gesetzt, Distanzen unter 1 km in ganzen Metern; dafuer braeuchte es ein Foto. Sessions
  nach aehnlichen Laeufen/AR filtern: Jan will die UX vorher ueberlegen. El Manus Pull Request
  (T-Rex-Fassung) anschauen — Zepp 1.0.6 ist inzwischen freigegeben.

- **🟢 „Entwicklung am Spot" (/verlauf): zwei gemeldete Fehler behoben (25.08.).** Meldung eines
  Nutzers vom 22.08.
  1. **Ansicht blieb leer, wenn man einen anderen Spot waehlte.** Beim Wechsel setzt die Komponente
     `tracks` auf null und zeigt den Spinner — dabei verschwindet der Karten-Container aus dem DOM,
     waehrend `mapObj` noch auf die alte Leaflet-Karte zeigt. Die wurde danach weiterbenutzt und
     zeichnete in ein Element, das nicht mehr in der Seite haengt. Behoben: die Karte wird
     weggeworfen und neu gebaut, sobald ihr Container nicht mehr der aktuelle ist
     (`getContainer() !== mapRef.current`).
  2. **Aussortierte Session stand weiter in der Spot-Liste** („Burgweiler (1)"): `my_spots` zaehlte
     ALLE Sessions mit `place_name`. Jetzt `is_pumpfoil.isnot(False)` — NULL bleibt drin (noch nicht
     klassifiziert, gehoert dem Nutzer weiterhin), GPS-only ebenfalls (Sensorik, nicht Sportart).
     Dieselbe Bedingung in `spot_tracks`, sonst laeuft die Animation ueber aussortierte Spuren.
  Geprueft auf dem Konto des Melders (nur lesend): Spot-Liste von 4 auf 3 Eintraege, Burgweiler
  weg, die anderen liefern weiter ihre 25 bzw. 2 Spuren.

- **🟢 Spot-Dubletten: zweiter Mechanismus gefunden und geschlossen (24.08.).** Jans Meldung
  („Pasohlávky doppelt, im Dropdown zwei fast gleiche Namen"). Es war NICHT der Anlege-Wettlauf vom
  20.08. — der Fix haelt (195 Spots, kein Paar unter 100 m, keine doppelten Namen). Zwei andere
  Ursachen:
  1. **Session ohne Spot-Zuordnung** (#2669, Pumpfoil, 12 Laeufe): die Karte zeichnet Sessions ohne
     `spot_id` als eigene Namensgruppe -> derselbe Name, zweiter Marker. **Ursache:** `assign_one`
     lief AUSSCHLIESSLICH im Geocode-Hintergrundtask, und der stieg aus, sobald `place_name` gesetzt
     war. Bei GPS-first-Upload oder noch offener Klassifikation ist die Session in der ersten Runde
     weder `is_pumpfoil` noch hat sie Laeufe — `assign_one` vergibt dann nur den NAMEN und setzt
     `spot_id=None`. Danach ordnet niemand mehr zu, auch keine Reanalyse (`run_analysis` ruft
     `assign_one` gar nicht). **Behoben:** `_spot_nachziehen()` in `api/sessions.py` nach JEDER
     Analyse (Reanalyse, Trim, Lauf-Ausschluss, Zurueckholen) plus der Geocode-Task, der jetzt bei
     schon gesetztem Namen trotzdem die Zuordnung versucht.
  2. **Zwei Spots am SELBEN Steg** („Tienhoven" und „Loosdrecht", Marker 32 m auseinander): die
     Session startet 40 m neben den anderen, ihr TRACK liegt aber in einem anderen Teil des Sees ->
     Polygone ueberschneiden sich nicht, Polygonmitten 2,6 km auseinander. Mein 100-m-Check ueber
     `spots.lat/lon` konnte das nicht sehen; die KARTE zeichnet das Mittel der Session-STARTPUNKTE.
     **Behoben:** `steg_punkt()` in `spots.py`, und die Dubletten-Suche vergleicht jetzt BEIDES —
     Polygonmitte und Steg.
  **Nebenbefund, latenter Fehler:** `_m_to_wkt`/`_wkt_to_m` konnten nur ein einzelnes Polygon. Zwei
  DISJUNKTE Spots zusammenzufuehren (genau dieser Fall) endete in
  `AttributeError: 'MultiPolygon' object has no attribute 'exterior'` — der Admin-Merge zweier sich
  nicht beruehrender Spots hat also noch nie funktioniert. Jetzt MultiPolygon-faehig, Rundlauf
  geprueft. Bewusst KEINE konvexe Huelle: die wuerde den Zwischenraum einschliessen und beim
  naechsten Zuordnen fremde Spots verschlucken.
  **Bestand bereinigt** (Jans OK): Loosdrecht #365 -> Tienhoven #113 (1 Session), #2669 -> Spot 75.
  **Geprueft danach:** 175 Marker, keine doppelten Namen, kein Marker ohne `spot_id`, kein Paar
  unter 500 m; Dubletten-Trockenlauf mit dem neuen Steg-Kriterium findet nichts mehr.
  **Zaehler-Namen** („Berlin 3/4/5", „Annecy 2/3", „Almere 5/6" …): Karte, Tooltip und beide
  Spot-Auswahlfelder zeigen eine zweite Zeile — Gewaesser, sonst ein Unterscheidungs-Label.
  Das Gewaesser fehlte bei 17 von 21 dieser Spots (Overpass antwortet dieser VM oft nicht), deshalb
  neu `spots.area_name` (+ Migration): **das benannte Objekt am Spot-Mittelpunkt** (Steg,
  Faehranleger, Marina, Badestelle — also die Stelle, an der man ins Wasser geht), sonst der
  **Stadtteil**. Quelle ist Nominatim (`places.lookup_area_nominatim`, zwei Stufen, 1,1 s Abstand);
  bewusst NICHT im Spot-NAMEN — die „Paris-Lektion" in `places.py` gilt weiter, als Zusatzzeile ist
  ein Mikro-Objekt aber genau richtig.
  Nachtrag gelaufen (125 Spots, ~2,5 min): **116 von 197 Spots haben jetzt ein Label**, nur 8 haben
  weder Gewaesser noch Label; 148 von 177 Markern zeigen eine zweite Zeile.
  Zwei Labels werden bei der Anzeige unterdrueckt, weil sie nichts unterscheiden: identisch mit dem
  Spot-Namen, und derselbe Namensstamm mit Zahl (Prags Stadtteil heisst „Praha 5" und laese sich
  neben unserem Zaehler-Spot „Praha 3" wie eine dritte Spot-Nummer).
  Beispiele: „Berlin 3 · Parkplatz für Anlieger der Insel Scharfenberg", „Berlin 4 · Berlin
  Reinickendorf" (Faehranleger), „Berlin 5 · Wannsee", „Annecy 2 · Lac d'Annecy", „Annecy 3 · Le
  Fier", „Papenberge · Havel" / „Papenberge 2 · Oberhavel".
  **Titel ergaenzt (Jan, 25.08.: „ja bitte auch in den titel"):** die Ueberschrift der
  Sessions-Ansicht zeigt den Zusatz jetzt hinter dem Namen, kleiner und ruhiger gesetzt
  („Sessions · Berlin 3 · Berlin Reinickendorf") — und nur, wenn er nicht der Name selbst ist.
  **Apps nachgezogen (25.08.):** `SpotMapItem` traegt das Feld jetzt auf beiden Seiten
  (`water`, optional -> alte Server brechen nichts). Android: Zusatz im Titel der Sessions-Ansicht,
  im Spot-Dropdown als zweite Zeile und im Titel von `SpotSessionsScreen`. iOS: dasselbe in
  `SessionsView` (Titel + Auswahlmenue) und `SpotSessionsView`. Weggelassen wird der Zusatz, wenn er
  dem Spot-Namen entspricht — dieselbe Regel wie im Web (die Unterdrueckung gleicher Namensstaemme,
  „Praha 5" neben „Praha 3", macht schon der Server).
  `:app:compileDebugKotlin` gruen, alle `Sources-iOS/*.swift` geparst.
  **KEIN Versions-Bump** (Jan, 25.08.): Phone 1.1.23 und Wear 1.2.23 liegen in der Play-Pruefung,
  das geht in die naechste Runde.

- **🟢 Spot-Beschreibungen LIVE im Web (Nutzerwunsch, geplant + gebaut am 24.08.).** Je Nutzer EIN
  Textblock + bis zu 10 Fotos pro Spot; andere koennen nicht ueberschreiben, nur selbst aktualisieren
  oder loeschen. Mehrere Beschreibungen stehen im Spot untereinander, je Nutzer ein eigener
  Abschnitt, mit Herzchen bewertbar; Datum der letzten Aktualisierung dabei.
  **Entschieden (Jans Linie, damit es nicht neu verhandelt wird):**
  - **KEINE eigene Spot-Seite** — der Block kommt in die vorhandene Ansicht `/sessions?spot=<id>`,
    und zwar **zwischen Wetter und Session-Liste** (`Sessions.tsx`, heute Zeile 270/271).
  - **Kein Overengineering:** keine Struktur-Tags (Start-Art o. ae.), keine Spracherkennung, kein
    Sprachfeld, kein Titelbild, keine Marker-Kennzeichnung auf der Karte, keine
    Bearbeitungshistorie, keine Kommentare unter den Beschreibungen (dafuer gibt es den Spot-Chat —
    Beschreibung = dauerhaft, Chat = Unterhaltung).
  - **Schreibrecht:** mindestens eine eigene, nicht geloeschte Session an diesem Spot, UNABHAENGIG
    von Sportart und Analyse. Einmal berechtigt, bleibt berechtigt (Session spaeter geloescht →
    Beschreibung bleibt, sonst verschwindet Wissen).
  - **Fotos:** neu hochladen ODER ein vorhandenes eigenes Session-Foto uebernehmen; jeder sortiert
    seine EIGENEN Fotos. Gleiche Pipeline wie Session-Fotos (`media.save_image`, 12 MB, Thumbs).
  - **Moderation von Anfang an:** „unangemessen"-Melden wie bei Sessions (EINE neue Meldung blendet
    aus, `mod_ok` schuetzt, Ruecknahme blendet nie automatisch wieder ein), blockierte Nutzer
    ausgeblendet, `social_allowed=False` darf nicht schreiben.
  - **Konto-Loeschung + Datenexport muessen die neuen Tabellen mitnehmen** (die Liste in
    `api/auth.py:299` ist explizit — neue Tabellen fallen sonst stumm durch, und DSGVO-Loeschung ist
    absolut).
  - **Spot-Merge:** `_merge_spot_rows` haengt bisher nur Sessions um. Beschreibungen muessen mit,
    und bei `UNIQUE(user_id, spot_id)` kollidieren zwei Beschreibungen desselben Nutzers →
    **neuere gewinnt**, Fotos beider bis zum Limit uebernehmen.
  - **Sortierung:** eigene Beschreibung oben, dann nach Herzchen, dann nach Datum. Nur Herzchen,
    keine Sterne, keine Downvotes.
  - **Filter „nur mit Beschreibung"** in der Spots-Ansicht (Jans Wunsch) + ein Satz Haftungshinweis
    (Community-Info, keine Gewaehr) + dezenter Anstoss fuer Leute mit Sessions dort ohne
    Beschreibung (ohne Aufforderung bleibt so ein Feature leer — Beleg: der „fehlt im
    Katalog?"-Link hat jeden Katalog-Neuzugang gebracht).
  **Umgesetzt (Web live, Server aktiv):** `server/app/api/spotnotes.py` (neu, 9 Endpunkte),
  vier Tabellen (`spot_notes`, `spot_note_photos`, `spot_note_likes`, `spot_note_votes`),
  `web/src/components/SpotNotes.tsx` in `/sessions?spot=<id>` zwischen Wetter und Liste, Filter
  „nur mit Beschreibung" auf der Spots-Karte, Admin-Moderation im Spots-Tab, i18n de+en.
  **Gegen die laufende API geprueft** (Testkonto, danach restlos aufgeraeumt): 24 Pruefpunkte gruen
  — Schreibrecht (fremdes Konto 403, `can_write=false`), Speichern, Foto-Upload, Uebernahme eines
  Session-Fotos als KOPIE, Sortierung, Herzchen an/aus, eigene Meldung 400, fremde Meldung blendet
  aus, Melder sieht sie nicht mehr, Besitzer schon, Ueberarbeiten macht wieder sichtbar,
  `spot-map` zaehlt `notes`, Datenexport enthaelt sie, Loeschen laesst keine Reste (DB und
  Mediendateien). Der Spot-Merge zusaetzlich in einer zurueckgerollten Transaktion geprueft:
  konfliktfrei umgezogen, bei Kollision gewinnt die neuere Fassung, Fotos bis zum Limit (9+1),
  keine Waisen.
  **Zwei Befunde beim Bauen:** (a) `autoflush=False` (db.py) — `db.delete(kind)` bleibt haengen,
  waehrend das anschliessende `db.delete(eltern)` beim Commit zuerst laufen kann; der Fremdschluessel
  schlug zu (HTTP 500, belegt). Kinder jetzt per Bulk-DELETE + `flush()` VOR dem Elternteil.
  (b) Der Light-Mode-Waechter im Build hat 18 doppelt gekippte slate-Klassen gefunden — die
  Projektregel „slate nur mit der Dark-Zahl" gilt auch fuer neue Komponenten.
  **Android + iOS nachgezogen (24.08., nach Jans Test „funktioniert wunderbar"):** nicht nur Lesen
  und Liken, sondern der volle Umfang — eigener Textblock anlegen/aendern/loeschen, Foto hochladen
  (dieselbe Verkleinerung wie Session-Fotos), Foto loeschen, fremde melden. Neue Dateien:
  `android/.../SpotNotesSection.kt`, `watch-apple/Sources-iOS/SpotNotesView.swift`; eingehaengt in
  der jeweiligen Sessions-Ansicht direkt hinter dem Spot-Wetter, genau wie im Web.
  Bearbeiten laeuft dort als Dialog/Sheet, nicht inline: der Abschnitt sitzt in einer scrollenden
  Liste, ein Textfeld darin verschwindet beim Tippen unter der Tastatur.
  `:app:compileDebugKotlin` gruen; iOS mit **wieder installiertem swiftc** (`/home/jan/swift`,
  Swift 6.0.3, Debian-12-Build) ueber ALLE `Sources-iOS/*.swift` geparst — Parse prueft nur
  Syntax, deshalb alle benutzten Member einzeln gegen die Deklarationen abgeglichen
  (`Loc.t`, `AvatarView(name:url:size:)`, `Api.mediaURL`, `downscaleJPEG`, PhotosPicker-Muster
  aus `SessionDetailView`).
  **Nachgereicht 25.08.: „Aus meinen Session-Fotos" gibt es jetzt AUCH in beiden Apps.** Meine
  urspruengliche Begruendung („auf dem Telefon ist der Bildwaehler einen Fingertipp entfernt") war
  falsch, Jans Einwand trifft: auf dem Telefon liegen tausende Bilder, und genau drei davon
  gehoeren zu diesem Spot — die kurze, richtige Liste ist der ganze Punkt. Android: Dialog mit
  Foto-Gitter, iOS: Sheet mit `LazyVGrid`; beide ueber `GET …/my-session-photos` +
  `POST …/photos/from-session`. **Weiterhin nur im Web:** das Umsortieren der eigenen Fotos (dafuer
  braeuchte es in den Apps einen eigenen Foto-Bearbeiten-Modus); das Loeschkreuz am Bild bleibt
  dort deshalb sichtbar.
  **Nachgereicht am selben Tag (Jans Wuensche beim Ausprobieren):**
  1. **Knopf „Spot-Sessions & Beschreibung"** in der Session-Detailansicht neben dem Spot-Chat —
     Web als `<Link>` auf `/sessions?spot=<id>` (mit `place_name` als Rueckfall), Android als
     Toolbar-Knopf auf die vorhandene Route `spot/<name>` (`SpotSessionsScreen`), iOS als
     `NavigationLink` auf `SpotSessionsView`. Kein Age-Gate: das ist keine Unterhaltung.
  2. **Beschreibungen auch in der Spot-Ansicht der Apps** (`SpotSessionsScreen` /
     `SpotSessionsView`), oberhalb der Session-Liste.
  3. **🐛 Foto-Vollbild war im Beschreibungs-Block eingesperrt** (Jans Meldung). Ursache ist eine
     allgemeine Falle: unsere `Card` traegt `backdrop-blur`, und `backdrop-filter` macht ein Element
     zum Bezugsrahmen fuer `position: fixed` — der Vollbild-Layer wurde damit auf die Kartengroesse
     begrenzt. Behoben, indem `Lightbox` (und die Foto-Auswahl) per `createPortal` am `body` haengen;
     das hilft jeder kuenftigen Verwendung, nicht nur hier. Hinweis dazu steht an `Card` in `ui.tsx`.
  4. **🐛 Beschreibungen waeren in BEIDEN Apps nie erschienen**: dort ist `spot` der NAME (die
     Auswahl arbeitet namensbasiert), die Beschreibungen haengen aber an der `spot_id` — mein
     `toIntOrNull()`/`Int(spot)` war immer null. Jetzt wird der Name einmal ueber `spot-map`
     aufgeloest. Im Web trat das nicht auf, weil der Parameter dort die id ist.
  5. **Ansicht und Bearbeiten getrennt** (Jan, 24.08.): im Ruhezustand steht im eigenen Abschnitt
     nur die Beschreibung plus EIN Knopf. „Foto hinzufuegen", „Aus meinen Session-Fotos",
     „Loeschen" und der Foto-Zaehler erscheinen erst beim Bearbeiten; die Fotos zeigen ihr
     Loeschkreuz und die Sortier-Pfeile ebenfalls nur dort. **Nur Web** — die Apps hatten das
     Problem nicht: dort stehen im Ruhezustand zwei Knoepfe (Bearbeiten, Foto hinzufuegen),
     Loeschen sitzt im Bearbeiten-Dialog und die Uebernahme aus Session-Fotos gibt es dort nicht.
     Das Loeschkreuz am Foto bleibt in den Apps sichtbar, weil es dort der einzige Weg ist.
  6. **Bearbeiten-Knopf oben rechts, links vom Herzchen** (Jan, 24.08., aus Platzgruenden): im
     eigenen Abschnitt sitzt er als Symbol in der Kopfzeile, die Knopfzeile unter dem Text
     entfaellt damit ganz. Ohne eigene Beschreibung gibt es keine Kopfzeile — dort bleibt der
     beschriftete Knopf unter dem Anstoss-Text stehen.
  **Offen:** Versionen NICHT gebumpt — Phone 1.1.23 und Wear 1.2.23 liegen in der Play-Pruefung, das
  Feature geht in die naechste Runde (Regel: einen Build in der Pruefung nur ersetzen, wenn er einen
  echten Fehler behebt). Uebersetzungen: de/en gepflegt, fr/it/es sinngemaess, Rest faellt auf
  Englisch.

- **🟢 Katalog-Suche war von der Wortstellung abhaengig — behoben (24.08.).** Ausloeser: Meldung
  ueber „fehlt im Katalog?" aus der iOS-App, „Axis png 1300 v2". **Der Fluegel stand drin** — als
  `AXIS` / `PNG V2` / `1300`, eingetragen am 15.08. (Commit `43e823a2`, damals ebenfalls auf
  Nutzerwunsch). Gesucht wurde aber mit EINEM `LIKE`/`contains` ueber den ganzen Suchtext je Feld,
  und „png 1300 v2" steht in keinem einzelnen Feld: der Nutzer haette **unsere Wortstellung erraten**
  muessen, um sein eigenes Material zu finden. „png 1300", „1300 png v2", „axis 1300" — alles nichts.
  Das ist nicht nur unbequem: wer sein Teil nicht findet, legt einen privaten Eintrag an — genau die
  belegte Ursache der Katalog-Dopplungen vom 17.08. (4 von 7 Dubletten).
  **Behoben an allen neun Stellen**, wortweise Suche (jedes Wort muss vorkommen, Reihenfolge egal),
  eine Fassung je Plattform mit gegenseitigem Verweis:
  `server/app/gearsearch.py` (Foils + Stabs, inkl. `aliases`) · `web/src/lib/gearSearch.ts`
  (Foils, Rechner, Setup) · `android/.../Models.kt` (dieselben drei Screens) ·
  `watch-apple/Sources-iOS/Models.swift` (FoilsView, Rechner, Setup).
  Geprueft gegen die laufende API: „Axis png 1300 v2" -> genau 1 Treffer (`AXIS PNG V2 1300`),
  „png 1300" -> 2 (V1 + V2), „1300 png v2" -> 1, Unsinn -> 0; Stabs ebenso („375 kraken",
  „SDW/375"). Web-Build gruen, Android `:app:compileDebugKotlin` gruen.
  **Nicht geprueft:** iOS — auf der VM ist **kein swiftc mehr installiert** (Memory
  `swift-linux-parse-check` ist insoweit veraltet). Die drei Aufrufstellen sind einzeilig und
  formgleich zu Android/Web; der Helfer nutzt bewusst `String($0)` statt der Substring, damit es
  dieselbe `contains`-Ueberladung ist, die der bisherige Code schon benutzte. Trotzdem: erster
  Xcode-Build ist der eigentliche Test.
  Antwort an den Melder ist raus (aus meinem Konto, Katalog-Ausnahme): der Fluegel ist da, unter
  „PNG V2", und die Suche findet ab jetzt auch seine Schreibweise.

- **⏸️ ZURUECKGESTELLT — neuer Nutzer findet keinen Weg zur Aufnahme (Meldung 23.08. aus der Android-App).** Wortlaut:
  „Is there a START button for manual recording? I'm a beginner and can only 10-20 pumps. I used the
  app today for the first time and set it to auto-start recording, but none of my session was
  recorded." Nachgesehen (rein lesend, DB + Zugriffslog):
  - **Null Sessions, null Ingest-Aufrufe.** Nichts wurde aussortiert oder verworfen — es ist nie
    etwas angekommen. Serverseitig sichtbar sind nur zwei Browse-Sitzungen (10 min am ersten Abend,
    ~70 min am zweiten), beide aus der Handy-App.
  - **Sein einziges „Geraet" ist ein Wear-Token, das die Handy-App SELBST erzeugt hat**
    (`WatchSync.pushPairing` mintet bei jedem App-Start mit Login ein Token, auch wenn gar keine Uhr
    da ist — `MainActivity.onCreate`). `last_seen_at`, `platform` und `app_version` sind NULL, unsere
    Wear-App hat also nie mit dem Server gesprochen. Ein Geraete-Eintrag beweist damit NICHT, dass
    der Nutzer eine Uhr hat — bei Support-Faellen nicht darauf verlassen.
  - Er war gruendlich in den Einstellungen (Foil, Gewicht, Empfindlichkeit auf „attempts", ppm) und
    hat zweimal „meine Uhren" sowie Polar/COROS/Suunto geoeffnet — er SUCHT den Aufnahmeweg.
  **Die drei Luecken, die das erzeugen:**
  1. **Kein Start-Knopf ohne Extra-Schalter.** „Record on Phone" haengt am lokalen Toggle
     `phone_rec_enabled` (Profil, Default AUS) — ohne ihn hat die Startseite keinen Aufnahme-Knopf.
     Genau die Frage des Nutzers.
  2. **„Auto-Start" steht in den UHR-Einstellungen** (`settings.auto_start`, Default AN) und liest
     sich wie „die App nimmt jetzt auf". Ohne Uhr-App passiert nichts. Auf der Wear-Uhr gilt
     zusaetzlich: nur waehrend der Startbildschirm der Uhr-App im Vordergrund ist, 10 s Vorlauf,
     dann 4 s durchgehend ≥ 10 km/h — fuer einen Anfaenger mit 10-20 Pumps womoeglich nie erreicht.
  3. **Leerer Zustand sagt nichts.** Bei null Sessions steht nur „Keine Sessions"
     (`sessions.empty`) — kein Hinweis, dass man dafuer die Uhr-App braucht oder den
     Handy-Recorder einschalten kann.
  **Vorschlag:** leerer Zustand mit Anleitung (welche Uhr? Uhr-App installieren/pairen · oder
  Handy-Aufnahme einschalten) + am Auto-Start-Schalter dazusagen, dass er nur fuer eine gekoppelte
  Uhr gilt.
  **ENTSCHEIDUNG Jan (23.08.): nichts aendern, abwarten** — „die Uhr ist doch gut so, ein einziger
  Nutzer der etwas nicht verstanden hat". Also KEINE Umbauten an leerem Zustand, Auto-Start-Text
  oder Aufnahme-Einstieg auf Verdacht. Der Befund bleibt hier als BELEG stehen: kommt eine zweite
  Meldung derselben Art, ist die Ursache schon nachgewiesen und die Loesung skizziert. Wer hier
  „🔴" erwartet, hat eine alte Fassung gelesen.
  Antwort an den Nutzer ist raus (23.08., 1:1-Chat aus meinem Konto, Nachricht 1224): nichts
  verloren, Rueckfrage welche Uhr, dann die drei Wege (Wear-App AUF der Uhr installieren · Garmin
  ueber Connect IQ · sonst „Record on Phone" im Profil). Seine Antwort steht noch aus.

- **⏸️ Handy-Aufnahmen laden nur hoch, wenn der Aufnahme-Bildschirm geoeffnet wird** (`Recorder.drain`
  wird ausschliesslich in `RecordScreen` aufgerufen). Wer aufnimmt, die App schliesst und danach nur
  Startseite/Community oeffnet, hat unsichtbar wartende Daten. Beim Uhr-Upload haben wir dieselbe
  Falle mit einem deutlichen Hinweis entschaerft („App offen lassen"), hier fehlt beides: Drain beim
  App-Start und ein Hinweis auf wartende Aufnahmen. Aufgefallen bei der Meldung oben — und mit ihr
  zurueckgestellt (Jan, 23.08.: erst abwarten). Anders als der Punkt darueber ist das aber kein
  Verstaendnisproblem, sondern eine echte Falle im Code; wenn je jemand „meine Handy-Aufnahme fehlt"
  meldet, hier zuerst nachsehen.

- **🟢 Session als GPX oder FIT herunterladen (21.08., Jans Wunsch).** Zwei Knoepfe in der
  Aktionszeile der Session-Detailseite, nur bei EIGENEN Sessions (`_owned` -> fremde geben 404,
  auch fuer Admins; ohne Token 401). Server: `server/app/export_track.py` (neu) +
  `GET /api/sessions/{id}/export.gpx|.fit`. Web: `api.sessionExport` holt die Datei per fetch +
  Blob, weil der Endpunkt den Token im HEADER verlangt — ein `<a href>` wuerde ihn in die URL und
  damit in Browser-History und Proxy-Logs schreiben. Dateiname kommt vom Server
  (`pumpfoil-<datum>-<id>.gpx`).
  **Entscheidungen, damit sie nicht neu verhandelt werden:**
  - **FIT selbst kodiert** (~120 Zeilen), keine neue Abhaengigkeit: `fitparse` kann nur lesen.
    Enthalten sind die fuenf Messages, die Garmin Connect/Strava als *Aktivitaet* akzeptieren
    (`file_id`, `record`, `lap`, `session`, `activity`); Hersteller-ID **255 = development**, wir
    geben uns nicht als Garmin aus.
  - **Export = was die Session ZEIGT**: Trim und aussortierte Bereiche sind angewandt (dieselbe
    Achse wie die Analyse ueber `build_timebase_for_session`). Wer die Heimfahrt weggeschnitten
    hat, will sie nicht in Strava. Die Distanz laeuft nicht ueber eine Luecke > 30 s hinweg,
    sonst erfindet ein ausgeschnittenes Stueck Kilometer; dort beginnt ein neues `<trkseg>`.
  - **Kein Accel** in den Dateien: GPX und FIT-`record` sind 1-Hz-Formate.
  - **Speed im GPX** steht in unserem eigenen Namensraum `pf:speed` — GPX 1.1 hat kein
    Speed-Feld und die Garmin-TrackPointExtension v1 laut Schema auch nicht. Puls dagegen in
    `gpxtpx:hr`, das lesen alle Werkzeuge. FIT hat Speed regulaer.
  - **FIT-Sportart:** `pumpfoil` -> `surfing` (38), es gibt keinen Pumpfoil-Wert; bekannte
    FIT-Namen behalten ihren Enum, Unbekanntes wird `generic` (0) statt geraten.
  **Geprueft** (`scripts/export-check.py`, rein lesend, 4 Sessions verschiedener Bauart):
  Punktzahl, Segmente, Koordinaten, Puls, Zeitachse und Strecke kommen exakt wieder heraus
  (Rueckimport mit `fitparse`, FIT-Koordinaten auf 0,0 Grad Abweichung). Zusaetzlich mit einem
  FREMDEN Werkzeug gegengelesen: `gpsbabel` liest beide Dateien und findet dieselben 4948 Punkte
  inkl. Puls (und im FIT auch Speed). CRC-Pruefung ist wirksam — ein absichtlich gekipptes Byte
  wird erkannt.
  **Offen:** (a) echter Upload-Test nach Garmin Connect/Strava — kann nur Jan machen; (b) Android
  und iOS haben die Knoepfe nicht (in `docs/PARITY-AUDIT.md` als ❌ eingetragen); (c) i18n nur
  de+en, Rest fällt auf Englisch (die Knopf-Beschriftung ist ohnehin „GPX"/„FIT").

- **🟢 Spot-Dubletten zusammengefuehrt + Anlege-Wettlauf abgestellt (20.08., Jans Auftrag).**
  Ausloeser: Meldung eines Nutzers im Community-Chat („when I click spot on the map I expect to see who is
  pumping on that spot, now I see randomly person") — von Jan nicht reproduzierbar. Zwei Ursachen,
  beide belegt:
  1. **Marker lagen uebereinander.** Kreise mit 9 px Radius ohne Clustering; beim Oeffnen zoomt die
     Karte per `fitBounds` auf ganz Europa (Zoom 4-5), dort ueberdeckten sich **144 von 174**
     Markern. Neun Haeufchen lagen auf DERSELBEN Koordinate (bis zu 7 Zeilen: „Gošići"; 6x
     „Kołczewo" auf 17 m; 4x „Helsinki" auf 50 m). Leaflet zeichnet in Array-Reihenfolge — die kam
     aus einem `GROUP BY` ohne `ORDER BY`, der Klick traf also einen beliebigen Nachbar-Spot.
  2. **Tooltip und Klick meinten Verschiedenes.** `spot-map` gruppierte nach `place_name`, gab als
     Ziel aber `max(spot_id)` -> bei 19 von 174 Markern lieferte der Klick eine andere Menge.
     Krassester Fall: eine einzelne Session mit dem Alt-Namen „Kaukajärvi 3" war ein EIGENER Marker
     (Tooltip 1) und fuehrte in den Spot „Kaukajärvi" mit 52 Sessions.

  **Ursache der Dubletten: Wettlauf der Worker.** Bei einem Sammel-Upload analysiert jeder
  uvicorn-Worker eine Session, alle sehen „hier ist noch kein Spot" und legen einen an. Belegt an
  Helsinki (vier Sessions eines Nutzers, analysiert 10:42:59-10:43:17 -> vier Spots) und Kołczewo
  (vier Sessions in 53 s). Der vorhandene Aufraeumer griff nicht, weil `_auto_mergeable` bei
  VERSCHIEDENEN Namen verweigert — und `_unique_name` hatte den Verlierern des Wettlaufs genau das
  verpasst („Kołczewo 4", „Kołczewo 5"). Die Eindeutigkeits-Nummerierung hebelte also die
  Dubletten-Erkennung aus, die sie schuetzen sollte.

  **Gebaut:** `DUBLETTE_M = 100` + `namensstamm()` (Zaehl-Suffix 2-49 ab, „Bremerhavener Ruderverein
  v. 1889" bleibt heil) · `dubletten_zusammenfuehren()` als eigener Durchgang (Schritt 0 in
  `repair`) — bewusst NICHT im Polygon-Pfad, dort haengen Spots ueber die gepufferten Tracks bis zu
  1 km weit zusammen und die Suffix-Toleranz haette neun „Helsinki"-Spots ueber ~4 km verschmolzen ·
  Anlege-Sperre in `assign_one` (`pg_advisory_xact_lock` auf gerundete Koordinate) plus
  Naehe-Pruefung danach als eigentlicher Riegel · `spot-map` gruppiert jetzt nach `spot_id` und
  nimmt den Namen aus der Spot-Zeile · `_merge_spot_rows` zieht einen uebernommenen Namen auch an
  die EIGENEN Sessions des Ziels (Fall: Spot mit 5 Sessions ohne Ortsangabe neben der Waise
  „Gošići") · Trockenlauf von `repair` Schritt 4 fuehrt `taken` jetzt mit, sonst zeigte er zwei
  Umbenennungen auf denselben Namen an, die der Apply gar nicht macht.

  **Ergebnis:** 301 -> 214 aktive Spots (87 eingezogen, 12 Sessions umgehaengt), Marker 174 -> 162.
  Unter 100 m liegen nur noch die zwei Review-Faelle. Die Grenze ist unkritisch: 50 m ergibt EXAKT
  dieselben 65 Gruppen, 200 m eine mehr — 39 der 65 hatten 0 m Abstand.

- **🟢 Spot-Aufraeumen abgeschlossen (20.08., Jan: „alles zusammenfuehren sinnvoll was
  zusammengehoert"). 301 -> 165 Marker, Tooltip == Klick bei ALLEN.**
  Die drei offenen Entscheidungen sind entschieden und angewandt:
  - `Tizzano` <- `Cala Longa` (7 m): Ziel Tizzano, weil `name_for` den ORT vor die Venue stellt
    („Locals benennen Spots nach dem Ort") — und Tizzano hatte mehr Sessions.
  - `Neckarsteinach` <- `Neuhof` (0 m): beide 'town', je 1 Session; Neckarsteinach ist der Ort am
    Neckar, Neuhof der Weiler gegenueber.
  - `Spandauer See` <- `Berlin 6` + `Salsa Plattform` (124 m, Polygone ueberlappen, dasselbe
    Gewaesser): hier gewinnt bewusst NICHT der Ortsname — „Berlin 6" ist ein
    Eindeutigkeits-Suffix auf einer Millionenstadt und sagt niemandem etwas.
  - 38 Zaehl-Suffixe umbenannt (`Annecy 2` -> `Annecy` usw.), 34 Waisen geloescht, 10 Sessions mit
    veraltetem `place_name` auf ihren Spot-Namen gezogen. Die 18 verbliebenen Suffix-Namen sind
    berechtigt: dort ist der Grundname von einem ANDEREN aktiven Spot besetzt.
  Stand: 172 aktive Spot-Zeilen, 165 Marker, 0 doppelte Namen, 0 Sessions auf einem
  zusammengefuehrten Spot, 0 Sessions mit Lauf ohne Spot, 0 Namens-Abweichungen.
  Zuletzt noch gefunden und behoben: `spot-map` zaehlte nur Pumpfoil, alle drei Clients navigieren
  vom Marker aber mit `sport=all` weiter — die Tooltip-Zahl war bei sechs Markern kleiner als das
  Klick-Ergebnis (Bönigen 7 gegen 13). Jetzt zaehlt die Karte dasselbe, was der Klick zeigt:
  **bei allen 165 Markern stimmen Tooltip und Klick ueberein** (gegen die API geprueft).

- **❌ NICHT zusammengefuehrt (mit Absicht): die sechs „Helsinki"-Spots.** Sie haengen nur ueber die
  um 500 m gepufferten Tracks aneinander, liegen aber **1 bis 6 km** auseinander (verschiedene
  Buchten) — echte, getrennte Spots. Ihr Problem ist der NAME: der Geocoder fand nur die Stadt,
  also heissen sie „Helsinki 4/5/7/8/9/10" und kein Mensch weiss, welcher welcher ist. Kein
  Gewaessername vorhanden (`water_name` ist bei allen leer). Das waere ein eigenes Thema:
  bessere Namen fuer Spots in Grossstaedten (Stadtteil/Bucht statt Stadt + Nummer).

- **❌ VERWORFEN (Jan, 20.08.): zwei Kartenwuensche eines Nutzers.** „Spots in der Umgebung der aktuellen
  Position" und „Filter nach Land" kommen NICHT. Begruendung Jan: auf der Karte kann man einfach
  hineinzoomen und findet nahegelegene Spots so schon — beides braucht es nicht. Nicht erneut
  vorschlagen.
  Ebenfalls bestaetigt: Spots, die nur ueber die gepufferten Tracks zusammenhaengen (bis ~1 km
  Abstand, Fall „Helsinki"), bleiben getrennt — „das ist so richtig wie du es gemacht hast".

- **🟢 Fehlende Laeufe: Keim-Rettung im Detektor gebaut (19.08., Jans OK).** Ausloeser war die
  Meldung eines Nutzers zu #2430 — ein Lauf, den GPS *und* Accel zeigen (28 s / 94 m bei 11,6 km/h, sieben
  Fenster mit 2-Hz-Rhythmus), fehlte in der Auswertung. **Nicht** die Geschwindigkeits-Schwellen:
  die GPS-Segmentierung findet ihn auf allen drei Stufen, und der Melder stand ohnehin auf der
  lockersten. Ursache: mit Accel ist das On-Foil-Modell die Quelle des Keims, es hatte dort genau
  EINE Sekunde gefeuert, und `_segments_from_mask` verwirft alles unter `min_segment_s` **bevor**
  verlaengert wird. Neu rettet `_rette_keime` so einen Keim, wenn 30 s zusammenhaengende
  Foil-Fenster mit mindestens einem Pump-Fenster ihn unabhaengig belegen — und nur dort, wo das
  Modell zu kurz war (bestehende Laeufe werden nicht groesser).
  Gemessen ueber alle 1609 Accel-Sessions: **7 Sessions veraendert (0,4 %), 8 Laeufe dazu, 0
  verloren, Foil-Zeit +0,03 %, keine Bestleistung und kein Rekord bewegt.** Herleitung, die drei
  gemessenen Schwellen-Varianten und die zwei verworfenen Alternativen: `docs/detector-v2.md`
  Abschnitt 8, Kurzhinweis in `docs/DATA-PIPELINE.md` Abschnitt 6.
  **Offen daraus:** zwei der acht geretteten Laeufe (#1619, #913) liegen in Abschnitten, in denen
  die Position viel schneller springt als das Doppler-Signal sagt (27 bzw. 40 km/h gegen 14 bzw.
  24) — GPS-Streuung, die in beiden Sessions auch die *bestehenden* Laeufe aufblaeht. Das ist ein
  eigener Befund (GPS-Qualitaet), bewusst nicht mit einem weiteren Detektor-Knopf erschlagen.

- **⚠️ FALLE bei Reanalyse-Skripten: `DETECTOR_V2` muss wirklich im Env stehen.** Heute passiert und
  repariert: mein `.env`-Parser matchte Schluessel mit `[A-Z_]+`, also NICHT `DETECTOR_V2` (Ziffer!).
  Folge: `detector_v2_enabled()` war False, `run_analysis` nahm den **v1-Pfad** und hat sieben
  Sessions mit v1-Ergebnissen ueberschrieben — ohne Fehlermeldung, die Zahlen sehen nur „etwas
  anders" aus. Erkennbar an `analysis_results.algo_version`. Danach mit korrekt geladenem Env
  erneut gerechnet, alle sieben stimmen jetzt Zahl fuer Zahl mit der Vorab-Messung ueberein.
  **Regel:** in jedem Ad-hoc-Skript, das `run_analysis` aufruft, Schluessel mit `[A-Z0-9_]+` parsen
  (oder wie `scripts/reanalyse-alle.py` schlicht an `=` splitten — das Repo-Skript ist korrekt) und
  vor dem Schreiben `detector_v2_enabled()` pruefen.

- **🔎 Laeufe mit Dauer 0 s bei 113-472 m (#2456).** Beim Regressionsvergleich aufgefallen: drei
  Segmente mit `t_start == t_end`, aber dreistelliger Distanz. Da stimmt etwas an der Achse oder an
  der Distanz-Summierung nicht. Noch nicht untersucht, betrifft die Keim-Rettung nicht.

- **📐 REGEL (Jan, 19.08.): gleiche Geometrie + eigene offizielle Produktlinie = EIGENER Eintrag.**
  Auch wenn Spannweite, Flaeche und Dicke identisch sind. Wortlaut Jan zur Gong-Atmo-Serie:
  „vielleicht in den zahlen zum teil identisch, aber andere Bauart … die nutzer wollen natuerlich
  ihre richtige Bezeichnung sehen und eintragen, sowas dann bitte ‚doppelt' anlegen, es ist schon
  ein anderes produkt."
  Betrifft u. a. Gong Atmo gegen die Vorgaenger-V3, Sabfoil `Razor PRO` gegen `Razor Pro Finish`,
  `Blade 700` gegen `Blackbird Blade 700`.
  **Abzugrenzen von echten Dopplungen** (17.08. entfernt): dort wiederholte der Modellname nur die
  Groesse — `LEVIATHAN BLACKBIRD THE 1350` war dasselbe Produkt wie `LEVIATHAN BLACKBIRD` 1350, EIN
  Produkt mit zwei Namen. Zwei PRODUKTE bleiben zwei Zeilen, ein Produkt mit zwei Namen wird eins.


- **🟢 Gong vollstaendig nachgezogen (19.08., `ccda7ffe`): 68 → 192 Zeilen, Katalog 723 → 847.**
  Der Agent hat den Shopify-Feed komplett gezogen (2890 Produkte) und die Frontfluegel auf **zwei
  unabhaengigen Wegen** aufgezaehlt — Titel-Sweep und die vier Kategorieseiten, Differenz null.
  **Gong ist die erste Marke mit echten Dicken je Groesse** (V3 in mm, V2 in cm, dazu Wurzeltiefe
  und bei V2 das Volumen) → diese 73 V3-Zeilen tragen **kein** Schaetz-Kennzeichen.
  Fehlende Groessen in den 15 alten Reihen: **keine**, alle 15 gegen den Shop geprueft.
  **Unsere 41 ATMO-Zeilen sind belegt**, obwohl Gong fuer ATMO keine Geometrie publiziert: die
  Spannweiten stimmen exakt mit denen, die Gong in seine **Artikelnummern** codiert (unabhaengig
  gefunden), und `TRAIL V3 ATMO PERF` ist Zeile fuer Zeile identisch mit Trail V3 — so wie es die
  eine ATMO-Groesse belegt, fuer die Gong doch Daten liefert. Nichts zu korrigieren.

- **🟡 Gong: 87 ATMO-Groessen fehlen weiter, weil Gong keine Flaeche veroeffentlicht.**
  Betrifft 17 Produkte: Curve/Fluid/Veloce/Ascent/X-Over V3 Atmo **Perf Series** · Curve/Fluid V3
  Atmo **Team** · Veloce Free Fly + Veloce Light Wind V3 Atmo Team · Ypra Race Micro / Freestyle
  Micro / Slalom / Surf Fast / Surf Carve / Surf-Freestyle V3 Atmo **Pro Team**.
  Aus dem Artikelnummer-Muster liesse sich die **Spannweite** ablesen (in 31 von 31 pruefbaren
  Zeilen stimmig), die **Flaeche** aber nicht — und `area_cm2` ist NOT NULL. **Ein Weg waere
  belastbar:** die **Perf Series** ist groessenweise identisch mit dem 2025er V3-Gegenstueck
  (doppelt belegt: SKU-Spannweiten stimmen, und die eine publizierte ATMO-Zeile Trail V3 Atmo Perf
  XL = 135 cm/1940 cm² ist genau Trail V3 XL). Damit liessen sich ~30 Perf-Zeilen mit
  `specs_estimated` uebernehmen. Team/Pro-Team haben eigene Werte → bleiben offen.
  Ebenfalls offen, weil auf Gongs Seite gar keine Werte stehen: Ypra Surf V2 / Surf-Freestyle V2 /
  Pro Ypra Surf V2 (Flaeche fehlt) · Fluid V2 Black · Pro Ypra Slalom V2 Black · Fluid-T V1 Black ·
  Allvator Kite Front Wing V1 · Veloce HDW V3 **M** (dreimal nachgeprueft, Gong laesst es leer) ·
  Pro Fluid H V2 **4XL** + Fluid H V2 Black 4XL (Spannweite fehlt) · Curve V2 **S/XXL** ·
  Pro Ypra Race V2 **S**.

- **⚠️ Fehler in Gongs eigenen Daten (nicht unsere):** `Ypra Surf-Freestyle V3` — das Streckungs-FELD
  nennt 5,1–6,1, nachgerechnet sind es 6,8–7,5, **und Gongs eigener Beschreibungstext auf derselben
  Seite sagt „ranging from 6.8 on the larger sizes to 7.6 on the smallest"**. Das Feld ist falsch,
  nicht die Geometrie → Spannweite/Flaeche uebernommen, AR-Feld verworfen. Ebenso `X-Over V2 XXL`:
  Extrados-Flaeche 1101 cm² ist kleiner als die projizierte (2023 cm²) — offensichtlich falsch.

- **📎 Gong-Definitionen, fuer kuenftige Runden festgehalten:** Streckung = Spannweite²/Flaeche
  (woertlich „Wingspan²/surface area ratio"; Spannweite/Wurzeltiefe wuerde 22 % daneben liegen) ·
  bei den alten **V2 nennt Gong DREI Flaechen** (projiziert / Extrados / „felt"), die publizierte
  Streckung passt auf die **projizierte** — die fuehren wir. Beispiel Curve H V2 XXL: 115²/1566 =
  8,44 = publizierte 8,4; mit der „felt"-Flaeche 1600 waeren es 8,27.
  **„Rise" und „Allvator Fluid" gibt es im Gong-Shop nicht mehr** (Altbestand bei uns, passt zu
  Romans Meldung „old Gong Rise XL") · **„Ghost" existiert bei Gong ueberhaupt nicht** ·
  „Pulse" ist bei Gong ein **Handwing**, „Lemon" ein **Boardshape** — nie als Fluegel anlegen.
- **🟢 Katalog-Umfang geklaert (19.08.), ohne Rueckfrage: es kommt ALLES rein, was ein Hersteller
  aktuell als Frontfluegel fuehrt** — auch Race, Surf, Anfaenger. Praezedenzfall steht in den Daten:
  der Katalog enthaelt schon **29 Fluegel unter 600 cm²**, darunter die komplette Starboard-SLX-
  Race-Reihe ab 365 cm², plus einen Lift-Surf-Fluegel. Er war also nie auf pumpbare Groessen
  begrenzt — es ist ein Material-Katalog, in dem Leute eintragen, was sie besitzen.

- **🟢 Hersteller-Recherche ausgewertet und eingetragen (19.08.): Katalog 536 → 723 Fluegel,
  29 → 42 Marken.** Sieben Rechercheagenten, danach jede Zeile selbst gegengerechnet.
  - **+160 Zeilen in bekannten Marken** (`6c1c1f4d`): drei Serien, die es bei uns gar nicht gab —
    Cabrinhas **UNION**-Plattform (Prestige/Whippit/Rebound, ersetzt beim Hersteller die Fusion-
    Reihe), Unifoils **Aggression** und **Quest**, Lifts **Vario**, Takumas **Kujira Helium**,
    Duotones **Crest / Carve 3.0 / Blitz**.
  - **+27 Zeilen in 13 neuen Marken** (`8854ebbe`), alle mit ausdruecklichem Pump-/Dockstart-
    Fluegel: CORE (CFS Pulse, woertlich „Pumpfoil Front Wing"), GA Foils, RRD, Cloud IX, Horue,
    Liquid Force, TAAROA, Konrad Boarding, AlpineFoil, MFC, Aeromod, Zeeko, Delta.
  - **F-Ones 24 „belegte" Dicken sind eine Formel** und jetzt als Schaetzung gekennzeichnet: ihr
    Dickenverhaeltnis streut ueber EAGLE, EAGLE X, PHANTOM und SEVEN SEAS — Streckungen 5,9 bis
    12,5 — um **0,03 Prozentpunkte**. Damit sind **66 % des Katalogs gekennzeichnete Schaetzungen**;
    die frueher genannten 51 % waren zu guenstig gerechnet.
  - **Korrigiert:** Unifoil Progression 200 Spannweite 103,7 → 101,0 cm (zwei Herstellerangaben
    stuetzen sich gegenseitig: 101²/1290 = 7,91 = publizierte Streckung 7,9).
  - **Zwei Meldungen widerlegt:** „Reedins Dicken sind Wurzeltiefe/10" (unsere Werte sind 11,5–12,0 %
    der mittleren Fluegeltiefe, also normale Profildicken; die Naehe zu Wurzeltiefe/10 folgt daraus,
    dass Profile um 10 % dick sind) und „4 von 5 Takuma-Kujira-Spannweiten falsch" (unsere Streckungen
    steigen gleichmaessig 6,91 → 8,10 parallel zur bestaetigten Kujira-II-Reihe, die des Melders
    springen; sein eigener Neufund Kujira 500 passt unter unsere Zahlen, nicht unter seine).

- **🟢 Moses und Sabfoil: beide Marken bleiben, gleiche Werte darunter (20.08., Jans Entscheidung:
  „wenn Moses und sabfoil identisch sind, aber unter unterschiedlichen Markennamen verkauft werden,
  dann sollen einfach beide in unserem Katalog stehen und unter der Haube die gleichen Werte
  verwenden").** Daraus folgt die Regel: **wo Spannweite UND Flaeche gleich sind, muss die Dicke
  gleich sein** — und zwar OHNE Median, denn ein Mittelwert waere eine dritte Zahl, die kein
  Hersteller veroeffentlicht hat. Wo die Zahlen auseinandergingen, hat die Reihen-Konsistenz
  entschieden. 9 Zeilen angepasst (JSON + DB, Ist-Zustand gesichert):
  | Fall | vorher | jetzt | Grund |
  |---|---|---|---|
  | Razor 820/825 (82,0 cm / 746 cm²) | 15,3 / 16,0 | **16,0** | die RAZOR-PRO-Reihe steigt monoton (14,1 · 15,3 · 16,0 · 16,8 · 16,8 · 17,0); die 15,3 stammte aus den als geschaetzt gekennzeichneten PRO-FINISH-Zeilen |
  | Razor 880/875 (88,0 cm / 843 cm²) | 17,8 / 16,8 | **16,8** | 17,8 mm waere dicker als der 107,5-cm-Fluegel (17,0) und bricht dieselbe Reihe |
  | Medusa 899 (89,9 cm / 1383 cm²) | 21,6 / 24,0 | **24,0** | Dickenverhaeltnis 15,6 % liegt genau in der MEDUSA-Reihe (15,5 · 15,7 · 15,6 · 14,8); mit 21,6 waeren es 14,0 % |
  | Razor Pro 975 | 16,77 / 16,8 | **16,8** | 16,77 war unsere Rundung, Sabfoil schreibt 16,8 |
  | Blade 700, Razor 780 | Kennzeichen „geschaetzt" | **belegt** | Zahl war identisch, nur das Kennzeichen stand auf einer Seite falsch |
  **Moses Medusa 790** hatte Streckung 4,08 gegen 5,55-5,84 der Reihe — das war kein Fluegel dieser
  Serie. Sie traegt jetzt die Geometrie der Sabfoil MEDUSA 799 (79,9 cm / 1100 cm²), behaelt das
  Etikett „790" (so kennt es der Moses-Besitzer), bekommt „799" als Alias und ist als **abgeleitet**
  gekennzeichnet: dass 790 und 799 dasselbe Teil sind, ist unsere Zuordnung, keine Herstellerangabe.
  Belegt am 20.08. an der Produktseite `razor-pro-1075`: Sabfoil veroeffentlicht „Front Wing -
  Maximum Thickness" (17 mm) und „Surface" (1061 cm²) — unsere Zeile stimmt auf den Punkt.
  **Nicht weiterverfolgen** (Jan, 20.08.: „so lassen, falls jemand etwas nutzt was wir nicht haben
  kann er das ja melden"): Moses `Onda 633` und `Onda 1000 HA` haben bei Sabfoil kein Gegenstueck
  (Onda ist eine reine Moses-Linie), und die alten Sabfoil-Reihen MEDUSA 699/799/899/999 sowie
  RAZOR PRO FINISH fuehrt der Hersteller nicht mehr — unsere Zahlen dort sind Bestandsdaten ohne
  Abgleichmoeglichkeit. Der Weg fuer Luecken ist der „fehlt im Katalog?"-Link unter der Geraeteliste;
  so ist jeder Neuzugang der letzten Runden entstanden. Also keine Vorrats-Recherche mehr auf
  Verdacht.

- **🟢 Katalog: unbekannte Profildicke darf jetzt eine Luecke sein (20.08., Jans Entscheidung
  „einfach leer lassen halt wenn unbekannt").** `foils.thickness_mm` ist nullable (Migration in
  `db.py`), und die 27 Zeilen, deren Dicke nur aus einem MARKEN-FREMDEN Bandmedian kam
  (13 Marken ohne jeden eigenen Anker), stehen jetzt auf leer statt auf einer erfundenen Zahl —
  nachgerechnet war das die schwaechste Ableitung im Katalog (r = 0,30 bei 3,14 pp Streuung).
  Die uebrigen 518 geschaetzten Dicken bleiben: sie stammen aus der eigenen Baureihe der Marke
  und sind gekennzeichnet.
  **Wichtig am Vertrag:** auf der Leitung bleibt es **0**, nicht `null`. Die ausgelieferten Apps
  wuerden an einem `null` in diesem Feld zerbrechen (Android: `Double` mit Default -> kotlinx
  wirft bei explizitem null; iOS: nicht-optionales `Double` -> JSONDecoder wirft) — und zwar die
  GANZE Katalog-Antwort, nicht nur die Zeile. 0 = unbekannt ist ohnehin schon die Konvention bei
  `span_cm`/`area_cm2`. Beide Apps sind trotzdem null-tolerant gemacht (`coerceInputValues` bzw.
  `Double?`), damit ein spaeterer Vertragswechsel nicht wieder daran haengt.
  Verbraucher geprueft: der Rechner (Web/Android/iOS) filtert Fluegel ohne Dicke ohnehin aus,
  `alarm_speeds` liefert jetzt (0,0) statt stillschweigend mit 0 mm weiterzurechnen, und die
  Uhr-Foil-Liste faellt in diesem Fall auf die manuellen Alarmgrenzen des Nutzers zurueck
  (sonst haette dort „0–0 km/h" gestanden — `effThresholds` liest die Zahlen ungeprueft).
  Die Katalog-Liste zeigt „– mm" statt „0 mm".

- **⚠️ Import-Falle, von zwei Recherchen unabhaengig belegt: „aspect ratio" ist nicht immer
  Spannweite²/Flaeche.** GoFoil NL, MFC und Takuma (Kujira Gen 1) publizieren
  **Spannweite / WURZELTIEFE** (MFC FW1600: 3,43 statt 4,52 → 32 % Abweichung). Kein Datenfehler,
  eine andere Definition — die AR-Spalte muss **je Marke** geprueft werden, sonst mischen wir zwei
  Kennzahlen in ein Feld. Ebenso: wo ueberhaupt eine Chord angegeben ist, ist es die **Wurzeltiefe**;
  keine der ueber 20 geprueften Marken veroeffentlicht eine mittlere Fluegeltiefe — und **keine
  einzige die Profildicke**.

- **⚠️ Namens-Verwechslungsfallen im Katalog** (nie als neue Marke anlegen): „Phantom" ist eine
  Fluegelfamilie von **F-One** UND eine Marke (**Phantom Watersports**) · „Progression" ist eine
  Reihe von **Unifoil** UND von **Delta** · „Kujira" = Takuma · „Onda" = Sabfoil · „Katana" ist bei
  Unifoil ein **MAST**, kein Fluegel · „Foilco" = Praegefolien fuer die Druckindustrie.
  Als Haendler/Boardshaper entlarvt (ueber das Shopify-`vendor`-Feld): Cedrus (= Unifoil),
  Amos Shapes (= Lift), Tabou (= GA), Aqua Foils, Appletree, Kalama, Notox, Sunova, JP, Goya,
  Quatro, Ocean Rodeo, Foilmount, Manera, Mystic.

- **🟡 Offen: 14 Marken mit Pump-Fluegel, deren Werte nur als BILD vorliegen** oder die gar keine
  Spec-Tabelle haben — deshalb nicht aufgenommen: NeilPryde (Swift HA) · NSP/Airwave · SIC Maui ·
  Signature/SPG (Albatross, „flat water pumping", gar keine Tabelle) · AK Durable Supply (Plasma,
  nur Flaechen) · FLITELab · Phantom Watersports · Eleveight · **Sroka** (vier Groessen mit Werten,
  aber die Modellnamen der Pump-Reihe sind unklar) · F4 (Einheit der Groessenangabe fehlt) ·
  Stinger · Aztron · Mikeslab (nichts ueber 950 cm²) · Triton (baut **Monowings** — Flaeche enthaelt
  den Stab, nicht mit Frontfluegeln vergleichbar). Brauchen je eine URL, die Jan abruft, oder eine
  Direktanfrage beim Hersteller.

- **🟢 METHODE (Jan, 19.08.): „schau dir die Bilder doch mal an, kannst du die nicht lesen?" —
  Herstellergrafiken sind LESBAR, „liegt nur als Bild vor" ist keine Endstation.** Die sieben
  Rechercheagenten haben genau dort abgebrochen. Herunterladen, den Textblock automatisch finden
  (helle Schrift im dunklen Fluegel), stark vergroessern und lesen loest Faelle, die vorher offen
  blieben. **Drei Stellen pruefen, die die Agenten uebersehen haben:** (1) auf den Fluegel GEDRUCKTE
  Spezifikationen — AXIS und Lift machen das; (2) `<table>` im Produktseiten-HTML (Cabrinha, Unifoil)
  — im Shopify-`products.json` fehlt sie; (3) serverseitig gerenderte Spec-Bloecke in aufklappbaren
  Bereichen (Lift). **Und der stärkste Hebel: die IMPERIAL-Umrechnung des Herstellers.** Sie ist eine
  unabhaengige Rechnung — wo metrisch und imperial auseinanderlaufen, ist die metrische Zahl der
  Zifferndreher (bei AXIS zweimal belegt).

- **🟢 ERLEDIGT 19.08. mit gelesenen Grafiken — vier der offenen Punkte:**
  - **AXIS ART V2 819: unsere 674 cm² sind richtig** (`de0751db`). AXIS druckt „647cm² (104.4in²)"
    auf den Fluegel, aber 104,4 in² = 674 cm². Der Melder hatte AXIS' Druckfehler abgeschrieben.
  - **AXIS ART V2 999 → 1026 und 1099 → 1197 cm²** korrigiert; AXIS' Website-Text liegt bei DREI
    von fuenf Groessen neben der gedruckten Spezifikation. Damit auch meine eigene Aenderung von
    heute Morgen (1099 auf 1220) korrigiert — sie stuetzte sich auf den Website-Text.
  - **Lift Florence 71 X aufgenommen** (`4c606d30`), 97 cm / 458 cm². Lifts publizierte Streckung
    16,8 ist die falsche Zahl; Flaeche und Spannweite sind je doppelt belegt.
  - **Unifoil Vyper 150 aufgenommen**, 74,9 cm / 968 cm² — die Spannweite folgt aus Flaeche und
    Streckung, die „140 mm" der Seite sind falsch.

- **🟡 Offen, brauchen weiter einen Blick von Jan:** Gong Ypra Race Micro 620 vs. 630 cm² (nur als
  ATMO gefuehrt, dafuer veroeffentlicht Gong ohnehin keine Geometrie) · Cabrinha X1600/X1950
  (dokumentiert Cabrinha nicht mehr, unsere Zahlen haben derzeit keine Herstellerquelle; ein
  Archivstand von 2023 wuerde es klaeren) · Slingshots ueberwiegend abgekuendigte Palette ·
  Ketos (falls inzwischen echte Dicken publiziert werden, sollten unsere 16 Formelwerte weichen).

- **🔴 NeilPryde veroeffentlicht die Spannweiten NICHT — geprueft, nicht vermutet.** Der Bericht
  sagte „Tabellen nur als Bild". Es gibt aber gar keine: kein Spec-Block auf der Produktseite,
  keine `<table>` im HTML, und auf den Fluegel gedruckt steht nur der Modellname („GLIDE SWIFT 8").
  Die Groessen 750/1000/1250 sind Flaechen in cm², ohne Spannweite ist keine Zeile moeglich.
  Bliebe eine Direktanfrage beim Hersteller.


- **🟢 Alle Foil-Meldungen aus dem Feedback abgearbeitet (19.08.). Katalog 533 → 536.**
  Sieben Meldungen mit Katalog-Bezug (die achte, #44 Tom Petr, ist eine Sportart-Frage, kein Foil).
  **Pflichtpruefung 1 (brand UND model absuchen) hat FUENF von sieben als bereits vorhanden
  entlarvt** — es wurde also fast nichts angelegt, sondern nachgesehen:

  | Meldung | Befund |
  |---|---|
  | #87 Abe: „the entire axis PNG v2 line is missing" | ✅ stimmte — **3 Zeilen angelegt** |
  | #79 Nathan: North Sonar P2050 | war da (`North \| Sonar P \| P2050`, 140 cm/2050 cm²) |
  | #76 (#229): Axis Fireball 1750 | war da (175 cm/1525 cm²/20,3 mm) |
  | #78 Roman: Gong Rise XL | war da (90 cm/1844 cm²/35 mm) |
  | #67 AntoineD: Marke AFS | war da — 31 Zeilen, am 05.08. auf genau diese Meldung hin angelegt |
  | #39 Eric F: Sabfoil Blackbird 1400/1350/1077 | alle drei da |
  | #77 Lukas: Armstrong APF + UHA | beide Reihen **vollstaendig** |

  **Was neu ist: AXIS PNG V2 1200 / 1300 / 1400.** Quelle: die offizielle Axis-Seite fuehrt die
  Tabelle nur als BILD, ein Haendler (foilit.de) gibt sie in Textform wieder. **Gegen sich selbst
  geprueft** ueber die Streckung (Spannweite²/Flaeche): 7,99 / 10,36 / 10,97 gegen angegebene
  8,00 / 10,36 / 10,99 — stimmig. Werte: 120 cm/1803 cm², 130 cm/1632 cm², 140 cm/1786 cm².
  **Dicke veroeffentlicht Axis nicht** → aus dem Dickenverhaeltnis der vorhandenen PNG-V1-Reihe
  abgeleitet (Median **11,7 %** der MITTLEREN Fluegeltiefe) und als `thickness_estimated`
  gekennzeichnet: 17,5 / 14,6 / 14,9 mm. **Falle dabei:** der Haendler nennt zusaetzlich 195 bzw.
  168 mm „chord" — das ist die WURZELtiefe. Damit gerechnet kaeme man auf 19-23 mm und laege
  deutlich daneben.
  Eingetragen ueber `app/data/foils.json` + Serverneustart (der Seeder ist idempotent), NICHT per
  Hand-INSERT — sonst fehlten die Zeilen einem frisch aufgesetzten System.

  **Belege statt Namensaehnlichkeit** (Pflichtpruefung 4): Erics `WL1400-BB` am Hersteller
  nachgeschlagen — Sabfoils eigene Tabelle sagt Leviathan Blackbird 1400, 1380 mm/1549 cm²/18 mm,
  exakt unsere Zeile. Armstrong APF (3 Groessen) und UHA (7 Groessen) gegen die Herstellerangaben
  abgeglichen, alle Spannweiten decken sich.

  **Alle sieben Melder informiert** (kurz, in ihrer Sprache — AntoineD auf Franzoesisch), aus dem
  Assistenten-Konto, je EINE Nachricht, mit Doppel-Antwort-Sperre gegengeprueft.
  Roman ist gefragt, ob die Werte zu seinem ALTEN Rise XL passen; falls nicht, kommt die aeltere
  Generation als eigene Zeile dazu.

  **🔴 Offen und wiederholenswert:** eine systematische Runde „alle Hersteller nach neuen Modellen
  absuchen" gab es NIE — dokumentiert sind nur markenbezogene Runden (AFS/Duotone 05.08., +35) und
  die Dopplungs-Bereinigung (17.08., -8). Genau deshalb rutscht so etwas wie PNG V2 durch, bis es
  jemand meldet. Waere als eigener, geplanter Durchgang aufzusetzen.

- **🟢 BEHOBEN (19.08.): Datenfeld 21 wurde beim Speichern still zu Feld 20.** Gemeldet von
  ThermikDreher im Chat (18.08. 21:56): „immer wenn ich speichere wechselt der Wert zu Anzahl Runs".
  Ursache in `layouts.py._clean_element`: ein `_clamp(…, 0, 20)` VOR der Gueltigkeitspruefung. Beim
  Einbau von Feld 21 wurde `VALID_FIELD_IDS` erweitert, diese Klemme aber uebersehen — jede 21 wurde
  zu 20, und 20 ist „Laeufe (Anzahl)". Belegt: von 30 Layouts in der DB enthielt **kein einziges**
  Feld 21. Fix: nicht klemmen, unbekannte ID verwerfen (eine unbekannte auf eine GUELTIGE zu ziehen
  heisst, dem Nutzer ein anderes Feld unterzuschieben).
  **Nicht reparierbar:** gespeicherte 20er lassen sich nicht zurueckrechnen — eine bewusst gewaehlte
  20 sieht aus wie eine verstuemmelte 21. Betroffene (Layouts, die seit dem 17.08. gespeichert
  wurden) muessen das Feld einmal neu setzen.

- **💡 Drei Wuensche von ThermikDreher (#267), 18.08. abends.** Er hat auch das Datenfeld gefunden,
  seine Meldungen sind bisher alle belastbar gewesen.
  1. **Vergleich von Pumpfrequenz und Speed**, um Pumptechniken zu vergleichen — „weil das ja
     foilabhaengig ist".
  2. **Graph UNTER der Karte**, umschaltbar Speed/Puls, fuer den angeklickten Lauf; im Autoplay ein
     Balken, der mitlaeuft und Karte und Kurve verbindet. Ihn interessiert konkret, WIE der Puls
     beim Pumpen steigt. 🔴 **Das ist NICHT dasselbe wie die Einfaerbung der Karte nach Puls**
     (Jans Antwort 19.08. 07:05): die zeigt, WO welcher Puls war, nicht den zeitlichen Verlauf.
  3. **Fremde Tracks am selben Spot** einblenden, auf den Start synchronisiert — Vorbild XContest
     beim Gleitschirmfliegen (dort wird automatisch gezeigt, wer zeitgleich unterwegs war). Er sagt
     selbst: gleichzeitig fahren ergibt beim Pumpen wenig Sinn, aber „schnell schauen koennen, wie
     andere an dem Spot fahren" schon. Beispiel:
     https://www.xcontest.org/world/en/flights/detail:leachim/27.6.2026/09:32

- **📻 Suunto-Wartender: S J (#276)** trackt im Spot-Chat Kirchentellinsfurt mit einer **Suunto im
  SUP-Modus**, „leider nicht optimal, aber eine bessere Loesung hab ich gerade nicht" (18.08.).
  Konkreter Interessent fuer die Suunto-Anbindung (memory `suunto-api-integration`, live aber
  credential-gated). Spot-Hinweis von ihm nebenbei: im Uferbereich nur gerade tief genug, er hat
  sich den Fluegel bei Starts zerkratzt.

- **🟢 Die drei nach dem Paritaets-Port gemeldeten Punkte sind erledigt (18.08.).**
  1. **Lauf-Tabelle iOS + Android**: waagerecht scrollbar, alle 13 PWA-Spalten. Es fehlten
     Startuhrzeit, Min im Fenster, Leistung, Distanz/Pump, Ø Pump, Pump max/min und laengste
     Gleitphase. **Der Server liefert die Felder seit je** — die Clients haben sie nur nicht
     gelesen (`min_speed_mps`, `max_pump_hz`, `min_pump_hz`, `t_start_ms`, `max/min_1s/3s/5s`
     fehlten im Segment-Modell). Feste Spaltenbreiten statt Gewichte, weil bei Scroll Kopf und
     Zellen sonst auseinanderlaufen. Watt rechnet dieselbe Formel wie `powerFor` in der PWA.
     🔴 **`sd.col*` gab es auf iOS GAR NICHT** → `Loc.t` gibt dann den Key zurueck, die Spalte
     stand woertlich als „sd.colMaxHr" da (dasselbe Muster wie `hist.spotAnim`). 13 Keys x 16
     Sprachen aus den PWA-Locales erzeugt; auf iOS in EIGENE Bloecke, weil die bestehenden laut
     ihrer Kommentare am Type-Checker-Limit stehen.
  2. **Push-Schalter „Neue Chat-Nachrichten"** in iOS + Android. Dabei ein groesserer Fehler
     gefunden: beide kannten nur drei der vier `notify_prefs` und schickten beim Speichern genau
     diese drei — `notify_prefs` wird serverseitig als GANZES ersetzt. **Ein Speichern in der App
     hat die im Web gesetzte Chat-Einstellung still geloescht.** Wear OS nicht betroffen.
  3. **Versionen NACHGEBUMPT (18.08.): iOS/Watch 1.1.24/28, Phone 1.1.23/37, Wear 1.2.23/1033.**
     Zuerst hatte ich „kein Bump noetig" geschrieben, weil 1.1.23/27 usw. in keinem Store sind.
     Jan fragte dann, ob er Apple nicht schon hochgeladen habe. **Im Sitzungsprotokoll steht keine
     solche Meldung** (durchsucht: nur „fr55 getestet und hochgeladen" = Garmin-Sideload, die
     Zepp-Ablehnung und „ist submitted" fuer Zepp 1.0.6) — es kann also aus einer FRUEHEREN Sitzung
     stammen. Trotzdem gebumpt, weil **App Store Connect eine Build-Nummer schon beim Upload
     verbraucht, auch fuer TestFlight, und Play genauso einen versionCode**.
     Die Rechnung ist einseitig: ein Bump kostet nichts, eine verbrannte Nummer kostet eine Runde.
     Bei Apple gleich auch die MARKETING_VERSION hoch, weil sich der Inhalt seit 1.1.23 wirklich
     geaendert hat (Vergleich je Lauf, 15 Kennzahlen, Vollbild-Karte). Phone-x und Wear-x bleiben
     gleich (Schema, s. memory android-version-scheme).
     **Merke:** im Repo laesst sich NICHT sehen, ob etwas hochgeladen wurde — `appmeta` kennt nur
     FREIGEGEBENE Versionen. Bei Zweifel immer bumpen.
  **Nachgezogen (18.08.):** der **Vergleich je LAUF** ist jetzt auch nativ drin. Beide CompareStores
  halten `CompareRef(sessionId, runIdx?)` als LISTE (Reihenfolge = Farbzuordnung, dieselbe Session
  darf zweimal drin liegen), erste Spalte der Lauf-Tabelle legt einzelne Laeufe ein, und Karte,
  Lauf-Liste, Chips und die Android-Kennzahlen-Tabelle rechnen je Eintrag. Zusammenfuehren ist bei
  Lauf-Eintraegen gesperrt (wie `mergeableIds`). Zwei bewusste Verhaltensaenderungen: Farbe haengt
  am Eintrag statt an der Session, und die Eintraege werden NICHT mehr nach Datum sortiert, sondern
  behalten die Korb-Reihenfolge (so macht es die PWA).
  **Bleibt offen:** die PWA-Vergleichstabelle zeigt **14 Kennzahlen**, Android **6** und iOS **keine**
  (dort nur Chips + Lauf-Liste). Aeltere, eigene Luecke — haengt nicht an der Lauf-Granularitaet.


- **🟢 Zepp 1.0.6 EINGEREICHT (18.08.).** Nach der Ablehnung von 1.0.5 kam
  beim Nachtesten im Simulator eine Kette echter Fehler heraus — alle gefixt, `app.json` code 9 /
  name 1.0.6:
  - **Status-Bar auf ECKIGEN Geraeten** (64 px, Text = `appName`, deckend, grau/linksbuendig) hat den
    eigenen Titel verdeckt, die Versionszeile angeschnitten und ein Siebtel des Schirms gekostet.
    Jetzt `setStatusBarVisible(false)` aus `@zos/ui` (API_LEVEL 2.0, wir verlangen 3.0; nur eckig,
    auf rund wirft der Aufruf → try/catch). Eckiges Layout rechnet wieder mit voller Hoehe.
  - **Titel cyan** (#22d3ee) auf beiden Formen.
  - **Update-Hinweis verglich mit `!==`** → jeder Unterschied loeste ihn aus, auch ein AELTERER
    Store-Stand: ein Dev-Build riet zum Downgrade („v1.0.6 → 1.0.4"). Jetzt `istNeuer()` wie Garmin
    (`_versionNewer`), Wear und Apple. **Nur Zepp war betroffen**, 9 Testfaelle gruen.
  - **Runde Seitenanzeige lag ausserhalb des Kreises**: Einzug 70 → rechte Kante x 410, der Kreis
    laesst auf der Schrift-Oberkante (y 40) nur bis x 373 → stand als „1/" da. Einzug jetzt 120.
  - **Touch-Sperre ist einstellbar** statt hart an (Jan: „die Uhr ist ja nicht immer nass", Apple/Wear
    lassen wischen). Fuenfter Menue-Knopf, dreistufig wie die Layouts, persistiert, greift sofort.
    Automatisch haengt an `getDeviceInfo().keyNumber`: nur ab DREI Tasten, weil wir SELECT (lang =
    Stop) und UP/DOWN (lang = Touch 10 s frei) brauchen. 🔴 **Neuer i18n-Key `menu.touchLock` in 16
    Sprachen braucht Jans Review** — nicht aus vorhandenen Uebersetzungen abgeleitet, es gibt keine.
  - **Emoji 🔒 raus** (Projektregel), stattdessen zwei Textzeilen mit dem Ausweg.
  Von Jan im Simulator gegengetestet und eingereicht. Release-Notes decken 1.0.4 → 1.0.6 ab
  (1.0.5 ging nie live): Beschleunigung, GPS-Plausibilitaet, Max-Puls-Datenfeld, umschaltbare
  Sperre, Layout-Fixes eckig.
  **🟢 FREIGEGEBEN 24.08. 12:08** (die Zepp-Mail nennt 1.0.6). `appmeta zepp` = 1.0.6 gesetzt, Server
  neu gestartet, `/api/app/latest?platform=zepp` liefert 1.0.6, Changelog-Eintrag geschrieben. Damit
  bekommen Amazfit-Uhren ERSTMALS die Roh-Beschleunigung — sie verlassen `gps_only`, es gibt dort ab
  jetzt also Pump-Erkennung statt nur GPS-Laeufe (1.0.5 hatte das schon, ging aber nie live).
  Weiter offen bleibt nur der i18n-Review von `menu.touchLock` (16 Sprachen, siehe oben).

- **🟢 Zepp-Store-Vorschauen: erledigt.** 1.0.6 ist eingereicht und im Review, es fehlen keine
  Bilder mehr (Jan, 20.08.). Der frühere Eintrag „zwei Bilder nachzuschiessen" war veraltet.

- **🟢 Zepp 1.0.5 war ABGELEHNT (18.08.) — beide Gruende erledigt, Nachfolger 1.0.6 eingereicht.**
  1. **Entwickler-Nickname war „zepp"** — Zepp ist ihre Marke und darf nicht als Drittanbieter-Name
     stehen. **Von Jan erledigt**, Nickname jetzt „Pumpfoil" (Account 7085610668).
  2. **Vorschaubilder fuer ECKIGE Geraete** entsprechen nicht der Vorgabe. Nachgemessen statt
     geraten (PIL, `screenshots/watch/zepp/store360/`):
     | Satz | Groesse | Hintergrund | Inhalt |
     |---|---|---|---|
     | `rund/` (11) | 360×360 | **transparent** ✓ | 354×354 zentriert, 3 px Rand ✓ |
     | `eckig/` (11) | 360×360 | **DECKEND — kein einziges transparentes Pixel** ✗ | 360×360 randlos ✗ |
     Die Vorgabe (docs.zepp.com/docs/distribute): **360×360 PNG mit TRANSPARENTEM Hintergrund** fuer
     beide Formen; bei runden Geraeten randlos, bei eckigen **volle Hoehe mit gleichem Rand links und
     rechts**. Unsere eckigen Bilder verletzen beides.
     Dazu: sie unterscheiden sich von den runden nur um 16/255 im Mittel — es ist derselbe Inhalt mit
     eckigem Hintergrund, **kein echter Screenshot eines eckigen Geraets**.
  **Was fehlt:** Screenshots aus dem Simulator fuer ein ECKIGES Geraet. Simulator nur auf Jans Mac
  (memory `zepp-simulator-setup`). Jans Simulator-Gerät ist **384×432** (Screenshot war 768×864 = 2×) —
  `app.json` deklariert `dw: 390`, das ist die **Design**-Breite, nicht die Displaygroesse. Gebraucht
  werden **11 Rohbilder als exakter Display-Auszug** (Screenshot-Funktion des Simulators,
  **kein Fenster-Mitschnitt**), dieselben Screens wie im runden Satz.
  **Zuschneiden ist dann ein Aufruf:** `python3 scripts/zepp-store-previews.py <roh-verzeichnis> 384x432`
  → Hoehe auf 360, mittig auf transparente 360×360-Leinwand = 320×360 mit 20 px Rand je Seite. Die
  Groesse ist Pflichtargument und wird exakt geprueft, damit nicht wieder etwas Falsches still durchlaeuft.

  **🔴 Zuschnitt aus den vorhandenen Rohbildern ist NICHT moeglich — und mein erster Versuch war falsch
  (18.08., zurueckgenommen in `360d68f`).** Die alten Rohbilder (1184×1240) sind Fenster-Mitschnitte
  eines **runden** Geraets. Mein Skript hat die Bildform ueber den **Alphakanal** bestimmt; die Rohbilder
  sind aber komplett deckend, also war die gemessene „Inhalts"-Box immer die ganze Leinwand → **beide
  Saetze wurden 1:1 gestaucht statt zugeschnitten**, auch die runden, die Zepp schon abgenommen hatte
  (Pixel-Diff: 11/11 veraendert). Alle 22 Bilder sind wieder im Originalzustand. Die Neufassung des
  Skripts rechnet nur noch und **bricht bei Seitenverhaeltnis ≠ 390:450 ab**, statt still zu verzerren.
  **KEIN Code-Problem:** die App selbst wurde nicht beanstandet, 1.0.5 kann unveraendert erneut
  eingereicht werden, sobald Nickname (erledigt) und Bilder stimmen.


- **🟢 Update-Hinweis ist jetzt sauber plattformgetrennt (18.08.).** Vorgabe Jan: „ein garmin update
  darf nicht auf zepp oder apple die Meldung ausloesen."
  **Befund (nachgesehen, nicht angenommen — und meine erste Annahme war falsch):** die Auswahl war
  schon je Plattform getrennt (`_APP_META[plat]["latest"]`), aber `plat` faellt auf `"garmin"`
  zurueck. Der Rueckfall existiert aus einem guten Grund: **nur die Garmin-App schickt kein `p=`** —
  Wear, Apple und Zepp senden alle drei ihre Plattform mit (alle vier Clients geprueft; mein erster
  Grep hatte bei Apple die separat gebaute Query uebersehen und mich zur falschen Aussage verleitet,
  Apple melde sich nicht).
  Das Loch war also nicht Apple, sondern **jede Anfrage ohne `p` an einem Token ohne `platform`**:
  im Bestand 20 aktive Tokens (u. a. 4 Apple-Watch-Tokens). Dass noch keine Falschmeldung auftrat,
  war Zufall — Apples 1.1.x ist numerisch hoeher als Garmins 1.0.x. Beim naechsten Schema-Wechsel
  waere es aufgefallen.
  **Fix:** `_plat_fuer_hinweis()` trennt die Frage vom Layout-Gate-`plat` (dort bleibt der
  Garmin-Rueckfall bewusst konservativ). Reihenfolge: gemeldetes `p` → `device.platform` →
  `"garmin"` NUR wenn eine **Part-Number** vorliegt (die liefert ausschliesslich Connect IQ) → sonst
  LEER = kein Hinweis. Damit behalten alte Garmin-Tokens ohne `platform` ihren Hinweis, und keine
  fremde Plattform kann je die Garmin-Version vorgehalten bekommen.
  Gemessen am aktiven Bestand: Garmin 125 → 105, „kein Hinweis" 0 → 20; apple/wear/zepp unveraendert.
  Fuenf Faelle als Funktionstest durchgerechnet (Garmin ohne platform mit pn, Apple mit und ohne `p`,
  voellig unbekannt, Zepp wo `p` die pn-Verwechslung schlaegt) — alle richtig.


- **🟢 Paritaets-Rueckstand der Handy-Apps ABGEARBEITET (17.08.) — Release-reif.** Alle NEUN Punkte
  aus `docs/PARITY-AUDIT.md` sind in Android UND iOS drin:
  1 `colorByValue` + `auto_start` · 2 GNSS-Stufe je Uhr · 3 Hilfetexte an den Uhr-Einstellungen ·
  4 Layout-Vorschau + Community-Galerie · 5 Hoechstpuls je Lauf · 6 Trainingskurve ·
  7 Rekorde nach Sportart · 8 Zeitraum wirkt auf die Rekorde · 9 Carves-Kachel.
  **Bewusst NICHT portiert:** der Layout-EDITOR bleibt Web-only (Entscheidung Jan: „das macht man
  eh nur am pc") — die Apps verlinken dorthin und koennen Layouts ansehen, auswaehlen und kopieren.
  Ebenfalls nicht: Leaflet-Tastenfix und OAuth/Service-Worker (beides Web-Infrastruktur) sowie der
  Aussortiert-Leerzustand, den es nativ gar nicht gibt.
  **Verifiziert:** `:app:compileDebugKotlin` und `:wear:compileDebugKotlin` gruen, ALLE Swift-Dateien
  (Sources-iOS + Sources) mit `~/swift-6.1 -parse` geprueft, und je Aenderung die Member gegen die
  Deklarationen abgeglichen — der Parse allein findet solche Fehler nicht.
  **Drei Sachen fielen dabei auf und sind mitgefixt**, keine reinen Portierungen:
  - Der **„Nur GPS"-Warnhinweis fehlte BEIDEN Apps** komplett, obwohl die PWA ihn zeigt. Man konnte
    also Pump-Zaehler, Kadenz und Gleitphasen abschalten, ohne es zu erfahren.
  - **Amazfit uebernimmt den Aufzeichnungsmodus gar nicht** (`watch-zepp/app-side/index.js` reicht
    nur language/latestVersion/pauseView/layoutsOn/layouts/pages durch) — der Regler stand dort
    wirkungslos in der Oberflaeche. Steht jetzt ehrlich dran. **OFFEN: entweder Zepp liest ihn
    kuenftig mit (El Manu arbeitet daran), oder der Regler wird dort ausgeblendet.**
  - Androids `autoStart` in `RecordScreen.kt` ist `phone_autostart`, also der HANDY-Recorder — nicht
    die Uhr-Einstellung. Wer nur nach dem Namen sucht, haelt sie faelschlich fuer vorhanden.
  **VERSIONEN SIND GEBUMPT (18.08.), Jan baut/signiert/laedt hoch:**
  | Ziel | neu | vorher | Anmerkung |
  |---|---|---|---|
  | Android Phone | **1.1.22 / 36** | 1.1.21 / 35 | 1.1.21 liegt bei Play in der Pruefung, dieselbe Nummer geht nicht zweimal |
  | iOS + Apple Watch | **1.1.23 / 27** | 1.1.22 / 26 | EINE MARKETING_VERSION fuer beide Targets (Watch steckt im iOS-Bundle), beide Stellen in `project.yml` gesetzt |
  | Wear OS | **unveraendert 1.2.22 / 1032** | — | KEIN Bump: die Paritaetsarbeit hat `android/wear/` nicht angefasst (nur `android/app/`). Ein neuer Code auf identischem Binaerstand waere nur Pruefaufwand. 1.2.22 wartet ohnehin noch auf Freigabe |
  | Apple Watch (Code) | unveraendert | — | `watch-apple/Sources/` unberuehrt; die Version steigt nur mit, weil sie im iOS-Bundle liegt |
  Nebeneffekt beim Phone-Bump: das „x" des Versionsschemas (Phone 1.1.x / Wear 1.2.x, laut
  `build.gradle.kts` gemeinsam hochzuzaehlen) stimmt mit 22/22 wieder zusammen — es war auf 21/22
  verrutscht, weil Wear zwischendurch einen eigenen Bump bekam.
  Alter Stand des Punktes: Versionen bumpen und einreichen. Achtung, es liegen bereits
  ungereichte Staende: Android 1.1.21 und Wear 1.2.22 warten noch auf Freigabe — die neuen Aenderungen
  brauchen also einen weiteren Bump darueber.


- **🟢 Garmins Daten-API (GCDP) nimmt keine neuen Antraege an — uns trifft es nicht, aber eine
  Planungsannahme ist damit tot.** (17.08., Anlass: Artikel von Momentum vom 15.07.2026, den Jan
  durchgegeben hat.) Kern des Artikels: das **Garmin Connect Developer Program** (die Schnittstelle,
  die Aktivitaets- und Gesundheitsdaten aus Garmin Connect in ein eigenes Backend liefert) hat das
  Antragsformular entfernt, ohne Reopening-Datum und ohne Warteliste. **Connect IQ ist ein ANDERES
  Programm und offen** — der Artikel betont selbst, dass die beiden dauernd verwechselt werden.
  **Selbst nachgeprueft (nicht dem Anbieter-Blog geglaubt, der Integrationsdienste verkauft):**
  `developer.garmin.com/gc-developer-program/overview/` hat heute kein Antragsformular und sagt nur
  „Stay tuned for more updates on the program". Der Befund haelt also auch einen Monat spaeter.
  **Was das fuer uns heisst — praktisch nichts, und das ist kein Zufall:**
  - Unsere Uhr-App laeuft ueber **Connect IQ** (121 Geraete, Store-Releases laufen normal, 1.0.78
    heute freigegeben). Davon ist nichts betroffen.
  - Der **manuelle FIT-Upload** (`POST /api/sessions/upload-fit`) braucht kein Garmin-Programm:
    Nutzer koennen aus Garmin Connect exportieren und hochladen. Bleibt offen.
  - Wir **versprechen nichts Gesperrtes** (geprueft): Garmin steht in `SupportedPlatforms.tsx` nur
    unter `watch.avail` und in `WatchMatrix.tsx` als `status: "avail"` ueber Connect IQ — NICHT in
    der Konto-/Import-Gruppe zu Polar/Suunto/COROS. Da war also nichts zurueckzudrehen (anders als
    bei Suunto, s. o.).
  **Was tot ist:** die zurueckgestellte Idee „Garmin-Konto verknuepfen und Aktivitaeten automatisch
  importieren" (memory `garmin-connect-integration-deferred`). Meine Recherche vom 28.06. hatte dort
  **„Approval nur ~2 Werktage"** notiert — das gilt nicht mehr, es gibt keinen Antragsweg. Die
  Memory ist entsprechend korrigiert, damit das niemand mehr als „schnell machbar" einplant. Das
  `oauth.py`-Geruest (Garmin-Slots + Redirect-URI) bleibt liegen, wie bei Strava/COROS — nichts
  loeschen.
  **Bestaetigt im Rueckblick die Architektur-Entscheidung:** der Uhr-Direktupload war nie der
  Umweg, sondern der bessere Weg (volle 25-Hz-int16-Accel; ueber die API kaeme fuer FREMDE
  Aktivitaeten ohnehin nur GPS). Wer auf die API gesetzt haette, staende jetzt ohne Datenweg da.
  **Merke fuer kuenftige Plattformen:** Zugang ist ein Planungsrisiko, nicht nur Integrationsaufwand
  — genau der Fall, den wir bei COROS (beantragt, wartet) und Suunto (zurueckgedreht) schon haben.

- **🟢 Update-Hinweis per 1:1-DM an 36 Nutzer verschickt (17.08., von Jan freigegeben).** Aus dem
  Bot-Konto (230), in der Sprache des Nutzers (en 15 · de 9 · fr 7 · it 2 · nl 1 · cs 1 · gsw 1),
  mit der jeweils installierten Version im Text, damit es nicht wie Massenpost wirkt. Inhalt: 1.0.78
  ist im Store, wir aktualisieren in dieser fruehen Phase oft, und die neueste Version behebt, dass
  Uhren mit wenig Speicher teilweise gar nichts mehr aufgezeichnet haben. Abschluss: das Motto
  „Have fun, keep pumping!" (unuebersetzt, in allen Sprachen).
  Empfaenger = Nutzer mit aktiver Garmin-Uhr (30 Tage), deren BESTE Uhr > 14 Tage hinterher ist;
  Test- und gesperrte Konten raus. **36, nicht 38** — die 38 aus der Messung waren Geraete, hier ist
  nach Personen entdoppelt.
  Nachgeprueft: 36 erreicht, **0 doppelt**, keiner fehlt, keiner zusaetzlich.
  **Stolperstein fuers naechste Mal (Memory `bulk-dm-rate-limits`):** der erste Anlauf rief
  `scripts/bot-post.py` je Empfaenger auf — das Skript loggt sich **pro Aufruf neu ein** und lief
  nach 10 Nachrichten ins **Login**-Limit (`rate_limit(10, 300, "login")`, pro IP, Fehlversuche
  zaehlen mit), nicht ins Chat-Limit. Nur 5 kamen an; der korrigierte Versender lief dann in die
  Sperre, die sein Vorgaenger hinterlassen hatte. Loesung: eigenes Skript, EIN Login, 13 s Abstand
  (haelt `RATE_TIERS = [(5, 10), (30, 300)]`), Backoff bei 429, und die schon Belieferten aus
  `chat_messages` abziehen statt aus einer festen Liste.

- **🟡 Garmin-Update-Verhalten gemessen (17.08.): die Mehrheit aktualisiert NIE, und genau das
  bremst jeden Fix aus.** Frage von Jan. Zwei Quellen: `device_tokens.app_version` (Ist-Stand) und
  `sessions.app_version` (Historie — jede Aufnahme traegt ihre Version).
  Bestand: **90 aktive Uhren** (nicht widerrufen, nicht ausgeblendet), 54 in 7 Tagen gesehen, 85 in
  30 Tagen. Von den 85 aktiven:
  | Abstand zur jeweils neuesten Version | Uhren |
  |---|---|
  | aktuell (0–1 Tage) | 3 (3 %) |
  | fast aktuell (2–4 Tage) | 19 (22 %) |
  | 1–2 Wochen alt | 25 (29 %) |
  | **aelter als 2 Wochen** | **38 (44 %)** |
  **43 der 90 Uhren stehen unter 1.0.73** — also ohne die Low-Mem- und Speicher-voll-Korrekturen.
  Die aeltesten aktiv gesehenen: 1.0.53 (u79, 14.08.), 1.0.51 (u46, 04.08.), 1.0.60 (u74, 16.08.).
  **Der Kern: von 67 Uhren mit Session-Historie haben nur 26 (38 %) ueberhaupt je die Version
  gewechselt.** Das ist kein langsamer Roll-out, sondern „einmal installiert, nie wieder angefasst".
  Wenn sie wechseln, gehen sie zuegig (Median 2 Tage bis zur ersten Session auf der neuen Version).
  ACHTUNG bei dieser Zahl: `sessions.app_version` faellt auf `device_tokens.app_version` zurueck,
  wenn die Uhr keine mitschickt (`ingest.py:82`) — daher ein unmoeglicher Ausreisser von -14 Tagen.
  Der Median ist belastbar, die Extremwerte nicht.
  **Was das KONKRET kostet, heute gemessen: von den 9 aktiven Uhren der ENG-Klasse hat genau EINE
  1.0.78 — und das ist Jans Testuhr.** Die 8 Nutzer, deren Uhren nachweislich nichts aufzeichnen,
  haben den Fix nicht. Zwei davon (u41, zwei fenix 5) stehen seit 06.07. auf 1.0.51 und sind
  vermutlich ganz weg. Bei der LITE-Klasse: 0 von 6 auf 1.0.78.
  **Immerhin greift der Mechanismus jetzt:** alle diese Uhren sind GEPAIRT, und `appmeta.garmin`
  steht seit heute auf 1.0.78 — die Uhr vergleicht selbst gegen `Config.VERSION` und zeigt
  „Update im Store" beim naechsten App-Start. Es braucht also nichts Neues, nur Geduld.
  **Zu ueberlegen (Jan):** (a) bei einer Uhr, die MESSBAR ausfaellt (0 brauchbare Sessions in Folge)
  reicht ein dezenter Hinweis womoeglich nicht — dort waere ein deutlicher Hinweis in der PWA
  gerechtfertigt („deine Uhr zeichnet nichts auf, es gibt ein Update dafuer"). (b) Die 8 betroffenen
  Nutzer sind namentlich bekannt und koennten per DM angeschrieben werden (NICHT per Banner).
  Skripte liegen unter `scratchpad/garmin_versions.py` + `eng_class_versions.py` (rein lesend).

- **🟡 CIQ-Store-Reviews vom 17.08. (drei, von Jan durchgegeben) — einer davon ist ein Befund.**
  - **Franz, 15.08., 1.0.76, „Tracking funktioniert sehr gut, leider verbraucht die App bei mir
    extrem viel Akku".** Das ist der **erste Feldbeleg fuer die Akkukosten von 1.0.75** (13.08.,
    beste unterstuetzte GNSS-Stufe = Mehrband L1+L5 ueber alle Systeme statt GPS allein). Genau das
    stand als „Kostet Akku -> Jans Entscheidung, evtl. als Einstellung" offen; das Datum passt
    (Umstellung 13.08., Review 15.08.).
    **Die Einstellung EXISTIERT schon** und niemand kennt sie: `Account.tsx` hat je Uhr eine
    GNSS-Auswahl mit vier Stufen (alle Systeme / ohne zweites Band / GPS + ein System / nur GPS),
    `PUT /api/devices/{id}/gnss-mode`, in allen 16 Sprachen uebersetzt. Voreinstellung ist `best`.
    Zu entscheiden (Jan): (a) bleibt `best` die Voreinstellung, obwohl sie Akku kostet, oder wird
    `l1` der Standard? (b) der Schalter muesste dort auftauchen, wo man ihn sucht — heute steht er
    im Konto, nicht bei der Aufnahme. Ohne Messung nicht raten: **`gnss_mode` ist bei allen 115
    Garmin-Uhren NULL**, also hat noch niemand umgestellt — es gibt keine Vergleichsgruppe.
    **(c) Franz selbst bleibt unbeantwortet — abgeschlossen, nicht wieder aufgreifen** (Jan,
    17.08.): in der Nutzer-Tabelle gibt es keinen „Franz" (die zwei entfernten Treffer `Fanch`
    und `Fräse` sind andere Leute, und bei einer persoenlichen Nachricht wird nicht geraten, wer
    gemeint sein koennte), CIQ-Store-Rezensenten sind nicht mit unseren Konten verknuepft, und im
    Store kann Jan nicht auf Rezensionen antworten. Ein Antworttext lag vor, ist damit hinfaellig.
    **Was bleibt, ist NICHT sein Fall, sondern die Auffindbarkeit:** die Einstellung existiert und
    kennt sie niemand. Dieselbe Meldung wird wiederkommen. Kleinster nuetzlicher Schritt waere ein
    Changelog-Absatz, der die zwei Akku-Hebel benennt — GNSS „ohne zweites Frequenzband" (groesster
    Hebel) und Aufzeichnung „sparsam" = 10 Hz statt 25 Hz (gemessen: Pump-Zaehler -0,4 %,
    On-Foil-Maske 99,9 % identisch, s. 8-Hz-Schwelle vom 13.08.) — und ausdruecklich davon abraet,
    „nur GPS" zu waehlen, weil das Pump-Zaehler, Kadenz und Gleitphasen komplett wegwirft.
    Ungebaut, wartet auf Jans OK.
  - **Nutzer, 31.07., 1.0.69 (polnisch), 1 Stern Abzug fuer „brak rejestracji wszystkich prób,
    również tych bardzo krótkich. Nawet po to, aby policzyć skuteczność startów"** = es werden
    nicht ALLE Startversuche erfasst, auch die ganz kurzen, „schon allein um die Erfolgsquote der
    Starts zu berechnen". Genau das gibt es schon zweimal: die Empfindlichkeit `attempts`
    (`users.foil_sensitivity`, s. per-user-detection-sensitivity) und `start_attempts_json` in
    `analysis_results`. **Also kein Feature-Bau, sondern ein Sichtbarkeitsproblem** — pruefen, ob
    die Startversuche in der PWA ueberhaupt angezeigt werden und ob die Empfindlichkeit dort
    auffindbar ist. Sein zweiter Punkt („Synchronizacja utknęła na poziomie zegarka, ale dało się ją
    wznowić") ist der bekannte Upload-Stau, seit 1.0.71+ mit Hinweisen adressiert.
  - **Lucas Schraa, 03.08., 1.0.71:** rein positiv („Läufe werden sehr zuverlässig erkannt"), keine
    Aufgabe. Notiert als Gegenprobe zum Detektor-Stand.

- **🟢 Katalog aufgeraeumt 17.08. — 8 Zeilen weg, alle mit Beleg, 0 Sessions betroffen.**
  Ausloeser waren 10 privat angelegte Stabs (= 10x „mein Teil fehlt"). Pflichtpruefung 1 (brand UND
  model absuchen) hat 7 davon als bereits vorhanden entlarvt:
  `Code 150AR`/`135R` -> `Code Foils | AR Series`/`R Series` · `Indiana Monobloc Stabilizer Condor S
  Tail XXS` -> `Indiana | Foil MB Stabilizer | Condor S Tail XXS` (MB = Monobloc) ·
  `Armstrong Pamp 202` -> `Armstrong | Tail Wing | Pump 202` (Tippfehler) ·
  `Armstrong APF 1675` -> steht in **foils** (span 120,2 / 1675 cm²), war also die falsche Kategorie ·
  `Sabfoil SDW/360` + `SDW 375` -> `Sabfoil | Downwind Kraken | 360`/`375`.
  Die Sabfoil-Faelle NICHT ueber Namensaehnlichkeit zugeordnet, sondern am Hersteller belegt: die
  offizielle Stabilizer-Uebersicht fuehrt `SDW/360 (Kraken)`, `SDW/375 (Kraken)`, `SDW375/BB
  (Blackbird)` — SDW ist der Produktcode, Kraken/Blackbird die Bauweise.
  Dazu **eine** echte Foil-Dopplung: `Sabfoil LEVIATHAN BLACKBIRD THE 1350` = `LEVIATHAN BLACKBIRD`
  (1350) — identisch in Spannweite, Flaeche UND Dicke (135 / 1864 / 21), der Modellname wiederholt
  nur die Groesse. Auch aus `app/data/foils.json` entfernt, sonst legt der Seeder sie beim naechsten
  Serverstart neu an (nach Neustart gegengeprueft: 533 Foils, Zeile bleibt weg).
  Ist-Zustand vor dem Loeschen gesichert: `scratchpad/katalog-loeschungen-2026-08-17.json`.
  Stand: **533 Foils · 312 Stabs (4 privat)**.
  **NICHT zusammengefuehrt, obwohl die Geometrie gleich ist** (verschiedene Produkte, kein Beleg
  fuer „dasselbe"): `AFS ENDURO 1100` vs. `PURE HA 1100` · `Lift 110 High Aspect X` vs. `Lift
  Florence 110 X` · `TAKOON H-GLIDE 1050` vs. `FLOW 1050`.
  **OFFEN, weil die Quelle nichts hergab** (Luecke stehen lassen statt raten):
  - `Gong TRAIL L/XL/XXL` vs. `TRAIL V3 ATMO PERF` und `ULTRA TRAIL 4XL` vs. `ULTRA TRAIL V3 ATMO`
    — gleiche Geometrie, aber „V3 ATMO" ist eine Bauweise/Generation. Die alten Zeilen tragen 3/85/
    105/15 Sessions, die V3-Zeilen null. Braucht eine Herstellerseite; gong-galaxy.com antwortet
    weiter mit HTTP 429. Erst dann entscheiden: zusammenfuehren oder als Bauweisen belassen.
  - Drei private Stabs bleiben bewusst stehen, weil nicht belegbar: `Takoon Foil Stab Glide 160`
    (Takoon zeigt nur die 220 + die Glide-HA-Reihe) · `Sabfoil 375DW / 130` (375DW passt zum
    Downwind-Stab, die Groesse 130 nicht dazu) · `ketos 105 / 30` (`Pump Knife 105` existiert, die
    „30" ist unklar — Shim? Tail?). Nutzer behalten ihren privaten Eintrag, so ist es gedacht.
  **💡 Muster dahinter:** 4 der 7 Dopplungen entstanden, weil Nutzer den **offiziellen
  Produktcode** eintippen (SDW/375, 150AR, „Monobloc") und wir den Marketing-Namen fuehren. Ein
  Alias-Feld im Katalog (durchsuchbar, nicht angezeigt) wuerde diese ganze Klasse abstellen —
  **🟢 GEBAUT 19.08.** Spalte `aliases` auf foils UND stabs, „|"-getrennt, in der q-Suche und im
  lokalen Filter der Weboberflaeche, mitgeliefert aber nirgends angezeigt. **Die Seeder tragen
  Aliase auch auf VORHANDENE Zeilen nach** (`foils.json`/`stabs.json` = Quelle der Wahrheit) — ohne
  das kaemen sie nur bei Neuzugaengen an, also genau dort nicht, wo sie gebraucht werden. Bei Stabs
  nur auf Katalog-Zeilen, private Eintraege bleiben unangetastet.
  Gepflegt sind nur belegte Faelle: `SDW/360`+`SDW/375` (Sabfoil Downwind Kraken), `Monobloc`
  (Indiana Foil MB Stabilizer, 7 Zeilen), `WL1400/BB` (Sabfoil Leviathan Blackbird 1400, heute am
  Hersteller nachgeschlagen). **Kein** Alias fuer die Code-Foils-Stabs: dort IST der Produktcode
  schon die Groesse (`150AR`, `135R`), die Groessensuche findet sie bereits.
  Weitere Aliase einfach in die JSON eintragen und den Server neu starten — kein Code noetig.
- **🔴 STILLER DATENVERLUST bei vollem Uhr-Speicher (Instinct 2) — belegt 13.08., ZWEI Nutzer.**
  Meldung Nathan: „session on August 11th, all the data were uploaded but only one of the runs is
  being displayed". Stimmt beides — die Uhr hat alles hochgeladen, was sie noch HATTE, der Rest war
  vorher auf der Uhr verloren. Kette, Schritt fuer Schritt belegt:
  1. Session #1917 (54 min) hat auf dem Server **einen** Chunk mit 65 GPS-Samples = die letzten 74 s.
     Die Uhr selbst meldete beim Abschluss `total_chunks=1` — sie hatte nicht mehr.
  2. Warum: die VORIGE Session #1916 (52 min, 26 Chunks) lag noch unhochgeladen auf der Uhr.
     Aufnahme #1916 endete 11.08. 06:13, ihre Chunks kamen erst **12.08. 01:49-02:13** an — 19,6 h
     spaeter. #1917 wurde dazwischen aufgenommen (00:37-01:31), also in einen belegten Speicher.
  3. `_flushGps` verwirft bei vollem Store den Puffer (`_gpsBuf = []`) und erhoeht den Chunk-Index
     NICHT — deshalb hat der einzige ueberlebende Chunk Index 0 und traegt die letzten Sekunden.
     Der Nutzer erfaehrt davon waehrend der Aufnahme **nichts**.
  4. Die Uhr hat es gemeldet: `device_tokens#462` hat **2x storage_full, max 158 KB**, letzte
     12.08. 02:03 — genau im Fenster. Ein zweiter Instinct-2-Nutzer (u264, schon auf 1.0.75) hat
     heute 20:19 dasselbe gemeldet. Kein Einzelfall.
  5. Sein Upload-Muster erklaert den Rueckstau: Verzug bis zum ersten Chunk 1005 und 1176 Minuten,
     dann 24 Chunks in 116 min mit 9 Pausen > 60 s (max 56 min). Die Uhr laedt nur bei offener App.
  **Nicht rettbar** — die Daten sind nie auf der Uhr gelandet.
  **Was wir aendern sollten (Uhr, waere 1.0.76):**
  - Beim START einer Aufnahme warnen, wenn Sessions warten UND der Store knapp ist: „erst
    hochladen, sonst gehen Daten verloren". Lieber eine Warnung als eine halbe Session.
  - Waehrend der Aufnahme sichtbar machen, WENN verworfen wird (heute stumm) — der `storageFull`-
    Weg samt Server-Meldung existiert schon, es fehlt die Anzeige im Aufnahme-Screen.
  - Zusammen denken mit „Upload in der Pause" (s. u.): das ist derselbe Engpass.
  **Sofort-Rat an Nathan (ohne Update):** nach der Session die App oeffnen und warten, bis die Zeile
  „x wartet auf Upload" verschwunden ist, BEVOR die naechste Aufnahme startet.
  Nebenbefund, damit es keine Verwirrung gibt: seine Session #1916 (52 min, 0 Laeufe, 79 m) ist
  KEIN Verlust — GPS-Qualitaet durchgehend 4, aber 12x14 m Bewegung und 0 km/h. Eine vergessene
  laufende Aufnahme.
- **🟢 Der 10-Hz-Modus kostete die Pump-Statistik — BEHOBEN 13.08. (`5cd77bd`, live).** Meldung Roman 13.08.: 10-Hz-Modus
  gewaehlt, danach "no pump count or the other derived data". Ursache: `MODEL_MIN_ACCEL_HZ = 15.0`
  in `analysis/__init__.py` -> `detection = gps_only`, also kein Pump-Zaehler, keine Kadenz, keine
  Gleitphasen, kein On-Foil-Modell. Die Schwelle wurde wegen der FR55 gesetzt, die 25 Hz meldet und
  real 2,5 Hz liefert — sie trifft aber auch saubere 10-Hz-Aufnahmen.
  **Gemessen (rein lesend, 20 Sessions mit >50 Pumps, dieselbe Code-Strecke):** auf 10 Hz
  heruntergerechnet weicht der Pump-Zaehler um **-0,4 % in der Summe** ab (schlechteste Session
  5 %), die On-Foil-Maske ist zu **99,9 %** identisch. Unter 8 Hz wird es schlechter (5 Hz: +9 %,
  schlechteste 25 %; 2,5 Hz: -14 %, schlechteste 36 % — dort liegt Nyquist bei 1,25 Hz, mitten im
  Pump-Band 0,8-2,0 Hz). Gegenprobe an ECHTEN 10-Hz-Daten: Romans #1929 (gemessen 9,68 Hz) ergibt
  137 Pumps = **83 Pumps/min**, genau im ueblichen Band (80-100).
  Die Schwelle arbeitet auf der GEMESSENEN Rate, deshalb bleiben die 21 FR55-Sessions mit real
  2,5 Hz weiter draussen. Regressions-Check: 9 von 580 Kandidaten aendern sich, 3 wie gewollt.
  Umgesetzt: Schwelle 8.0, betroffene Sessions neu gerechnet, Rekord-Schnappschuss nachgezogen
  (gps_only fiel wegen `accel_only` aus Rekorden/Bestenlisten — seine Sessions zaehlen jetzt mit).
  „Nur GPS" sagt jetzt an der Auswahl, was es kostet (16 Sprachen); bei 10 Hz eruebrigt sich der
  Hinweis, weil dort nichts mehr verloren geht.
- **🔴 FALLE, WICHTIG: `run_analysis` committet SELBST (Zeile 618).** Ein `db.rollback()` nach
  dem Aufruf ist wirkungslos. Mein "Trockenlauf" zur 8-Hz-Schwelle hat dadurch 580 Sessions auf
  `status='live'` gekippt (aus Listen/Community gefallen) und die 6 Sessions ohne Rohdaten erneut
  ueberschrieben. Beides aus dem 03:30-Backup repariert, id-genau protokolliert
  (`scratchpad/ids-live.txt`), Vollabgleich gegen das Backup danach sauber.
  **Konsequenz: es gibt keinen lesenden Trockenlauf ueber `run_analysis`.** Entweder die Funktion
  aufteilen (rechnen / persistieren) oder gegen eine Kopie der DB pruefen.
- **🟡 Verschluckte Rekord-Benachrichtigung.** `run_record_snapshot(do_push=False)` zieht den
  Snapshot-Stand hoch, pusht aber nur die Events des EIGENEN Laufs -> die 12 Events von Session
  #1967 (echte Spot-Rekorde von heute) werden sonst nie gemeldet. Nachsende-Skript liegt bereit
  (`scratchpad/r28.py`), braucht Jans OK (verschickt eine Nutzer-Benachrichtigung).
- **🟡 Langer Aufenthalt am Steg fuellt den Uhr-Speicher (Roman, 13.08.).** Er war 2/3 der Session
  nicht selbst am Foilen, nach ~2 h fiel die App auf „IQ!" und meldete spaeter voll gelaufenen
  Speicher. Bestaetigt: `pause()` schaltet GPS UND Accel-Listener ab und flusht die Puffer, die
  Zeitbasis ueberspringt die Pause — seine Strategie (nur fuer eigene Starts fortsetzen) ist also
  genau richtig und spart 1:1. Seine Rohdaten kamen vollstaendig an (100 % / 96,8 %). Die
  Abbruch-Serie vom 10.08. (vier Sessions mit 0 Chunks in 25 min) war die Speicher-voll-Falle,
  die 1.0.74 behoben hat — die URSACHE bleibt: Garmin verbietet Uebertragung *waehrend* der
  Aktivitaet, also sammelt sich alles an (25 Hz = ~210 B/s = 1,4 MB in 2 h; 10 Hz = ~120 B/s).
  **💡 IDEE (Jan 13.08.: „ist aber ne gute idee"), ungebaut: in der PAUSE hochladen.** `pause()` ruft
  schon `_fitSession.stop()`, die Aktivitaet laeuft also nicht mehr — womoeglich erlaubt Garmin die
  Uebertragung dann. Waere die eigentliche Loesung fuer lange Sessions mit viel Steg-Zeit.
  Was heute im Weg steht (nachgelesen, nicht geraten): Aufnahme-Start ruft
  `Uploader.setRecording(true)` (`SessionRecorder.mc:934`) -> Retry-Timer gestoppt und `syncAll()`
  steigt sofort aus (`Uploader.mc:172`). Freigegeben wird nur bei Stopp (949) und Verwerfen (973),
  **`pause()` gibt es nicht frei**. `_registerSession()` schreibt nur lokal, kein Netz.
  Zwei Stufen:
  1. **Billig (3 Zeilen, klaert die offene Frage):** in `pause()` `setRecording(false)` +
     `watch().reset()` + `syncAll()`, in `resume()` wieder `setRecording(true)`. Damit gehen die
     ANDEREN wartenden Sessions raus -> beantwortet „sendet die Uhr in der Pause ueberhaupt?".
     **Sperre noetig:** die laufende Session steht ab dem Start im `sessions`-Index; ein Upload
     wuerde sie mit `/complete` abschliessen -> halbe Session analysiert + „Session ausgewertet"-Push
     mitten in der Pause.
  2. **Der eigentliche Nutzen (echte Arbeit):** die LAUFENDE Session teilweise leeren — Chunks
     senden, NICHT abschliessen, bestaetigte lokal loeschen. Erst das schafft Platz fuer die Session,
     die gerade laeuft. Server kann das schon (Registrieren/Chunks/Abschliessen sind getrennt), der
     Uhr fehlt der Modus.
  Ablauf, wenn es gebaut wird: Test-`.prg` fuer die fēnix 7X Pro an Jan, Wegwerf-Session, erst danach
  eine neue `.iq` (waere 1.0.76). Ohne Feldtest kein Release — ob Garmin in der Pause sendet, steht
  in keiner Doku.
  Nebenbefund: **Instinct 3 Solar 45/50mm hat nur 128 KB RAM** (die AMOLED-Variante 768 KB) und
  bekommt trotzdem den vollen Build (47 KB Luft). 18 Geraete haben unter 40 KB Luft, die engsten
  (Venu Sq, Enduro, fēnix 6/6S, FR245/645/935) nur 25-27 KB.
- **🔴 „Mir fehlen Laeufe" ist FAST IMMER fehlendes GPS, nicht der Detektor** (belegt 13.08. an zwei
  unabhaengigen Meldungen). Korpus: von **1090 h aufgezeichneter Zeit haben 271 h (25 %) keine
  Position** — Abdeckung im Median: Garmin 79 %, Wear 87 %, Apple 93 %. In den Luecken kann kein Lauf
  entstehen, weil Laufe/Distanz/Tempo aus GPS kommen; der Accel laeuft dabei nachweislich lueckenlos
  weiter (Session #1968: 95 375 Samples = exakt 25 Hz, Anker alle 60 s ohne Jitter, aber 15,9 von
  63,6 min ohne Position in 17 Aussetzern, 8 davon mit Pump-Aktivitaet im Accel). Gegenbeweis zum
  Detektor: die Reanalyse vom 10.08. liess die Lauf-Zahl in **1224 von 1238** Sessions unveraendert
  (nur die 6 Sessions ohne Rohdaten fielen auf 0 und sind restauriert), und in #1968 wurde **jede**
  Episode >= 12 km/h zu einem Lauf (11 von 12 ab 10 km/h). Drei Ansaetze, Reihenfolge = Nutzen:
  - **(a) Ehrlich anzeigen** statt raten lassen: GPS-Abdeckung je Session („74 % · 16 min ohne
    Position") mit Hinweis, dass Laeufe in diesen Luecken nicht zaehlen. Spalte `data_quality` ist da.
  - **🟢 (b) ERLEDIGT 13.08. (`3a528f8`, Garmin 1.0.75 live, Apple im Code): beste GNSS-Stufe.**
    Rueckfallkette ueber `hasConfigurationSupport` (L1+L5-Alle-Systeme -> L1-Alle-Systeme ->
    Zwei-System -> Standard), SAT_IQ bewusst nicht (Sparmodus). Wachhund: kommt binnen 2 min kein
    Positions-Event, zurueck auf den Standardaufruf. Apple: `BestForNavigation` + `.fitness`.
    Wear nutzt schon FusedLocation/HIGH_ACCURACY, Zepp bietet keine Optionen.
    **OFFEN: Wirkung messen** — GPS-Abdeckung derselben Nutzer/Spots vor/nach 1.0.75 vergleichen
    (Skript-Muster in der Untersuchung vom 13.08.: Samples je eigener GPS-Zeitspanne). Erst danach
    ueber den CIQ-Store-Submit entscheiden.
  - ~~**(b) Garmin: GNSS-Konfiguration anfordern.**~~ `Position.enableLocationEvents` bekommt bei uns nur
    `LOCATION_CONTINUOUS` -> laut SDK ist der Standard **CONSTELLATION_GPS, also GPS allein**, obwohl
    fēnix 7X Pro & Co. Mehrband/Alle-Systeme koennen. Umstellen auf die beste unterstuetzte Stufe
    (`hasConfigurationSupport`: SAT_IQ / GPS_GLONASS_GALILEO_BEIDOU_L1_L5 / …_L1 / GPS) mit
    Rueckfall. Erklaert, warum die Apple Watch am selben Handgelenk 93 % schafft. Kostet Akku ->
    Jans Entscheidung, evtl. als Einstellung.
  - **(c) Handy-Recorder:** roher `GPS_PROVIDER` -> `FusedLocationProviderClient`. Betroffener
    Nutzer: 32 % ohne Position, Genauigkeit im Median 12 m (bis 50 m), Doppler-Spitzen bis 116 km/h;
    ein anderes Handy im Korpus schafft 100 %. Ohne Messung nicht sicher besser — erst pruefen.
  - **(d) R&D:** Pumpen in GPS-Luecken separat und klar benannt ausgeben (Fenster liegen vor), aber
    NICHT als Lauf mit Distanz/Tempo.
- **🟢 Paralleles Zusammenfuehren baute mehrere Kopien — BEHOBEN 13.08.** (`e7c02f4`). Der Merge
  dauert wie die Reanalyse (~100 s bei 3 h); kam dieselbe Anfrage in dieser Zeit erneut, sah sie die
  Quellen als „noch nicht gemergt" (offene Transaktion) und rechnete alles ein zweites Mal. Ein
  Nutzer hat so am 11.08. drei identische 20-MB-Sessions erzeugt (Anfragen 20:08:18/20:08:44/20:09:39,
  erster Commit 20:09:57). Jetzt werden die Quellzeilen gesperrt und DANACH neu bewertet -> die
  zweite Anfrage liefert das Ergebnis der ersten. **Die 2 Waisen-Sessions (#1908, #1909): ERLEDIGT
  17.08.** Genau wie die schon korrekt behandelte #1907 auf `deleted=true, merged_into=1910` gesetzt
  — kein Hart-Loeschen, damit die Zeilen als Herkunft der Zusammenfuehrung erhalten bleiben.
  Vorher geprueft (Assertion vor dem UPDATE): an beiden hing nichts — kein Rekord-Event, kein Like,
  kein Video, kein Foto, keine Uebertragung. Ist-Zustand gesichert in
  `scratchpad/waisen-sessions-2026-08-17.json`.
  Wirkung bei Nutzer 48: 11 -> **9 Sessions**, 44,5 -> **30,8 km**, jetzt 50 Laeufe / 2742 Pumps
  (die zwei Kopien trugen je 6855 m / 10 Laeufe / 589 Pumps).
- **🟢 Erneutes Pairing legte Geraete-Duplikate an — BEHOBEN 12.08.** (Ausblenden + automatisches
  Aufraeumen). Zwei Stufen: `POST /api/devices/{id}/hide` (Nutzer kann jeden Eintrag ausblenden,
  reversibel, 16 Sprachen) und `_hide_replaced_siblings` im Config-Aufruf, das den EINDEUTIGEN Fall
  selbst aufraeumt: gleicher Nutzer, gleiche Part-Number, alter Eintrag seit dem Pairing des neuen
  nicht mehr gesehen. Im Bestand betraf das 21 Zeilen bei 9 Nutzern; sie werden ausgeblendet, sobald
  die jeweilige Uhr das naechste Mal die App startet — kein Massen-Schreibvorgang noetig. Genau ein
  aktiv genutzter Eintrag (#297) blieb dabei korrekt stehen, weil er nach dem neueren Pairing noch
  gesehen wurde. Auf dem Bot-Konto ende-zu-ende getestet (Ausblenden, Schutzfall, Aufraeumen).
  OFFEN bleibt nur der Grenzfall: zwei BAUGLEICHE Uhren, von denen eine lange nicht benutzt wird —
  die wird ausgeblendet und muss von Hand wieder eingeblendet werden. Bewusst so: reversibel, und
  ohne Geraete-Seriennummer (die Connect IQ nicht liefert) nicht unterscheidbar.
  Alter Stand: (Nutzerfeedback 11./12.08., zweiter Melder nach Eric am 07.08.). `devices.py:680`
  erzeugt beim Einloesen des Codes immer eine neue `DeviceToken`-Zeile; der „Remove"-Knopf
  (`Account.tsx:274`) erscheint nur bei `sessions === 0`. Ein Nutzer hat dadurch **5 Eintraege fuer
  EINE physische Instinct 2**: zwei leere (loeschbar) und drei mit 6/4/11 Sessions (blockiert, fuer
  immer in der Liste).
  Beim Pairing ist die Part-Number noch nicht bekannt (`PairIn` hat nur code+label), ein Abgleich
  geht also erst beim ersten `/devices/config`. Zwei denkbare Wege: (a) wenn dieselbe Part-Number
  beim selben Nutzer schon existiert, die alte Zeile als ersetzt markieren/zusammenfuehren;
  (b) „Remove" auch mit Sessions erlauben und diese auf den aktuellen Eintrag desselben Modells
  umhaengen (nicht auf NULL, sonst geht die Plattform-Zuordnung fuer Statistiken verloren).
  Braucht Jans Entscheidung.
- **Upload-Verhalten auf Garmin ist erklaert, kein Fehler** (gemessen an `ingest_chunks.received_at`,
  Nutzer 125): erster Chunk kam **19,5 h** nach Aufnahme-Ende, dann 26 Chunks in 24 min; eine andere
  Session brauchte 116 min mit einer 56-min-Luecke. Ursachen: (1) Connect IQ hat keinen
  Hintergrund-Upload, die Warteschlange laeuft nur bei offener App (`Uploader.mc:70`); (2) nach
  `BACKOFF = [3, 10, 30]` Sekunden wartet die Uhr nur noch auf eine neue Verbindung, kein Timer mehr
  — daher „ein Lauf auf einmal". Nutzer ist informiert; in `docs/DATA-PIPELINE.md` §3.1 steht es.
  KEIN Handlungsbedarf, ausser man wollte das Warten sichtbarer machen.
- **🟢 Accel-Zeitachse repariert (§9.1 + §9.2), Bestand reanalysiert — ERLEDIGT 10.08.**
  Belegt in [`docs/DATA-PIPELINE.md`](DATA-PIPELINE.md) §9.1/§9.2. Zwei Fixes:
  1. `timebase.py`: die Bandpruefung verwarf eine KORREKTE `t0_ms`-Achse, weil sie sie mit der
     GETAGGTEN Rate verglich (50,19/25 = 2,0076, 0,4 % ueber der Schranke 2.0). Jetzt 4.0 + absolute
     Plausibilitaet. A/B ueber 222 Sessions mit `t0`-Sidecars: 200 unveraendert, 7 kippen zur exakten
     Achse, keine verliert sie.
  2. `analysis/__init__.py`: `run_analysis` baute sich eine ZWEITE Achse (Durchschnittsrate +
     Index-Arithmetik) und ignorierte `timebase.py`. Jetzt kommt die Achse von dort und der Accel
     liegt auf einem exakt gleichmaessigen Raster -> die Annahme `index = t · hz`, auf der VIER
     Stellen beruhen (Foiling-Maske, Pump-Fenster, ML-Features, Impulse), ist wahr statt geflickt.
     `metrics_json.accel_axis` schreibt je Session mit, worauf wirklich gerechnet wurde.
  - Wirkung an #1814 (der Auslöser): Lauf 9 `longest_glide_s` **45,04 s -> 1,57 s**, Pumps 42 -> 120,
    Kadenz 0,545 -> 1,558 Hz. Ueber alle 16 Laeufe max. 1,1–1,9 s Gleitphase = plausibel.
  - Regression (100 Sessions, je 25 pro Achsen-Sorte): `none` 25/25 unveraendert, `measured_rate`
    20/25, `uncertain` 23/25 (Reste = Raster-Rundung, ±0…3 Pumps), `exact_chunks` 13/25 geaendert
    (echte Korrektur). **Nirgends aendert sich die Zahl der Laeufe oder die Pumpfoil-Einstufung.**
  - **ERLEDIGT 10.08.:** Server neu gestartet · Bestand reanalysiert (1219 bewertet, 241 geaendert,
    0 Fehler; `exact_chunks` median +2 Pumps, `measured_rate` nur ±5 = Raster-Rundung, `none`
    unberuehrt; NIRGENDS aendern sich Laufzahl oder Pumpfoil-Einstufung) · Changelog-Eintrag steht.
    Sicherung: `foil-analysis-backups/analysis_results-vor-achsen-fix-2026-08-10.dump` (65 MB).
    Unmoegliche Gleitphasen (>=5 s) im Bestand: 8 -> 6; behoben genau dort, wo `t0_ms` vorlag.
  - **PANNE dabei, behoben:** der erste Reanalyse-Lauf hat 6 Sessions ohne Rohdaten auf der Platte
    (Verzeichnis fehlt, `total_chunks=1`, alle Nutzer 159) mit leeren Ergebnissen ueberschrieben ->
    11/5/9/17/24/11 Laeufe weg, `is_pumpfoil` auf false. Aus dem pg_dump zurueckgestellt und Feld
    fuer Feld verifiziert. `scripts/reanalyse-alle.py` ueberspringt jetzt Sessions ohne
    GPS-Rohdaten (103 im Bestand) — ein leeres Ergebnis ist NIE eine Verbesserung.
  - **ERLEDIGT 10.08.: dem Melder geantwortet** (aus dem Assistenten-Konto, eigener 1:1-Thread).
    Alle vier seiner Sessions liegen jetzt unter 2 s Gleitphase. Er hat am 10.08. 21:41 bestaetigt
    und einen nuetzlichen Nebenbefund geliefert: nach einer Reanalyse zeigt der BROWSER-CACHE noch
    die alten Werte, erst Shift+F5 raeumt auf -> bei der naechsten Massen-Reanalyse in den
    Changelog-Eintrag schreiben.
  - Offen bleibt §9.3: Chunk-Dauer wird ueber Pausen geschmiert (deshalb bleibt die untere
    Bandgrenze bei 0,5; #1579 liegt 203 s daneben).
- **🟢 Zusammenfuehren zerstoerte die Accel-Zeitanker — BEHOBEN 10.08.** (`docs/DATA-PIPELINE.md`
  §9.5). `merge.py` legte die Teile an `off_ms/1000 · hz` mit `hz = accel_hz` = der
  GETAGGTEN Rate. Liefert die Uhr das Doppelte (Wear/Apple), sind die Offsets um Faktor 2 falsch und
  die Teile ueberschreiben sich; danach wird alles als EIN Chunk ohne `t0`-Sidecar geschrieben.
  -> zusammengefuehrte Sessions koennen `exact_chunks` nie erreichen, die §9.2-Reparatur greift bei
  ihnen nicht. Belegt an #1596 (aus #1593+#1595): ein Chunk, keine Sidecars, 25,019 Hz gemessen,
  14,35 s Gleitphase bleibt — waehrend die drei nicht zusammengefuehrten Sessions derselben Uhr auf
  1,59–1,91 s fielen. Fix: `_trimmed_mit_achse` schneidet ueber die echte Achse zu,
  `_save_accel_mit_ankern` schreibt Chunks MIT `t0_ms`. Bestand mit
  `scripts/repariere-merges.py` nachgezogen: **30 von 33 repariert**, 3 uebersprungen (den Teilen
  fehlen die Accel-Rohdaten: #590, #684, #716). #1596 danach 14,35 s -> 1,85 s, Pumps 1019 -> 1257.
  Bei #1596 kamen 584.544 Samples zusammen — vorher landeten davon nur ~200.000 im Ergebnis.
  OFFEN dazu: die 3 nicht reparierbaren Sessions bleiben, wie sie sind.
- **Garmin 1.0.74 LIVE im CIQ-Store 10.08.** Store-Seite: „Latest Release August 10, 2026,
  Version 1.0.74, Size 100 KB". Release-Kette ERLEDIGT: `watch/bin` auf 1.0.74 (121/121,
  ueber /api/app/devices verifiziert), `appmeta.garmin` = 1.0.74, Changelog-Eintrag steht. Inhalt: voller Uhr-Speicher beendet die App nicht
  mehr mit „IQ!" (jeder Storage-Write ueber geschuetzte Helfer, auch Uploader + Config.setString),
  Grund im Start-Screen sichtbar, Upload-Rueckstau als VOLUMEN statt Anzahl (`15 warten auf Upload ·
  4 MB`), Start-Canary fuer Abstuerze beim App-Start, Meldung „Store voll" mit Volumen an den Server
  (lernt die echte Grenze je Modell). Im Emulator von Jan verifiziert: 5 erzwungene Fehlschlaege in
  Folge, kein Absturz, Hinweis sichtbar, eine Meldung mit kb=5035.
  - `.iq` gebaut (210/210 Geraete, 11,2 MB), von Jan hochgeladen; Store-Notizen (deu/eng) geliefert
  - **`watch/bin` steht bewusst auf 1.0.73**, die 121 fertigen 1.0.74-Builds liegen unter
    `/home/jan/release-staging/garmin-1.0.74/`. NACH der Freigabe: zurueckkopieren, dann
    `appmeta.garmin` = 1.0.74 + Changelog. Reihenfolge siehe Memory `watch-bin-is-live`.
- **Android Phone 1.1.21/35 + Wear 1.2.21/1031 EINGEREICHT 10.08. (Jan).** Play-Konsole:
  Produktion **35 (1.1.21)** und Produktion (Wear OS) **1031 (1.2.21)**, beide mit
  „Vollstaendigen Roll-out starten" — also 100 %, kein Staffeln. Vorabpruefungen liefen.
  **UEBERHOLT am 16.08.: Wear ist jetzt 1.2.22/1032** (Puls ueber Health Services, s. Inbox),
  von Jan am 16.08. eingereicht — Play zeigt beide Tracks zusammen: Produktion **35 (1.1.21)** und
  Produktion (Wear OS) **1032 (1.2.22)**, beide 100 % Roll-out. Wichtig fuer naechstes Mal: die neue
  Wear-Version hat die haengende 1031 abgeloest, **ohne dass die Phone-Einreichung 35 dabei verloren
  ging** — Verwerfen des Batches war nicht noetig, es reichte, im Wear-Track ein neues Release
  anzulegen. Das
  Review von 1031 hing seit dem 10.08. — sechs Tage gegen ~drei bei der Runde davor (1.2.20/1.1.20
  am 06.08. eingereicht, „is live"-Mail 09.08., Phone und Wear am selben Tag). 1031 geht damit nicht
  mehr live; sein Inhalt steckt vollstaendig in 1032 (geprueft: `a8adef2` ist Vorfahre von HEAD).
  NACH der „is live"-Mail ohne Rueckfrage setzen: `appmeta android` = 1.1.21, **`wear` = 1.2.22**
  (NICHT 1.2.21 — die Version wird nie freigegeben), danach Changelog. (Die Zahlen sind hier
  festgehalten, damit die Freigabe kein Nachfragen
  braucht — Anlass: die appmeta-Regel „nur eintragen was FREIGEGEBEN ist und 100 % Roll-out".)
  (Der befuerchtete Fall „Batch verwerfen nimmt Phone 1.1.21/35 mit raus" ist damit nicht
  eingetreten und war auch nicht noetig.)
  Vorher geprueft: Baum clean, kein
  Cleartext-Hack in den Manifesten, Versionscodes ueber dem Live-Stand (34->35, 1030->1031), beide
  Module frisch kompiliert (33/33 Tasks, BUILD SUCCESSFUL). Inhalt gegenueber 1.1.20/1.2.20:
  Teilen-Dialog scrollt wieder bis zur Schaltflaeche, Wear-Token heilt bei Config-401, NORWEGISCH
  erstmals in den Apps, Aktivitaetsarten wakethief/towed/surf_wave getrennt. Signiertes AAB +
  Play-Upload: nur Jan.
 (spontane TODOs — hier anhängen, später einsortieren)

- [ ] **Höchstgeschwindigkeit als Rekord ist durch Autofahrt-Reste verfälscht** (Befund 06.08.,
      Jan: „muss ich mir im Detail später anschauen"). Die Bestenliste führt aktuell:
      #1619 mit **73,0 km/h** (Химки; die Uhr lief während 209 km Autofahrt mit — der Auto-Trim hat
      das Wasser-Fenster korrekt gefunden, aber IM Fenster stehen noch 214 Punkte über 30 km/h)
      und #913 mit **61,6 km/h** (gleiches Muster, 94 Punkte). Realistisch geht es ab Platz 3 mit
      34,1 km/h weiter. Ursache: `max_speed_mps` wird über ALLE Samples im Trim-Fenster gebildet;
      die Physik-Schranke `MAX_FOIL_SPEED` wirkt nur auf die Lauf-Erkennung, nicht auf diese
      Kennzahl. **Vorschlag:** Höchstgeschwindigkeit nur aus Samples INNERHALB erkannter Läufe
      bilden — das ist auch inhaltlich, was der Rekord behauptet („schnellster Moment auf dem
      Foil"), und immun gegen Fahrt-Reste, ohne an der Erkennung zu drehen. Vor jeder Umstellung:
      über alle Sessions read-only durchrechnen, wie viele Werte sich ändern und um wie viel, und
      die größten Abweichungen vorlegen (Detektor-Änderung -> nur mit Jans OK, s.
      [[never-touch-db-unasked]]-Regel im CLAUDE.md). Sofort-Abhilfe ohne Code: den Fahrt-Teil per
      `excluded_ranges` aus den beiden Sessions nehmen (Besitzer oder Admin).

- [ ] **Eigener Bereich fürs Wellen-Abfahren („chasing cruise boats", Nutzerwunsch 05.08.).**
      Anlass: eine Session wurde als Fremdkraft aussortiert, und der Fahrer erklaerte selbst,
      dass er die Welle eines Ausflugsschiffs mitgenommen hat. Der Detektor lag damit RICHTIG
      (Puls-Antwort +13 bpm, Kurve flach ~105 auf der Welle, erst am Ende 160 beim Pumpen) —
      **kein Erkennungsfehler.** Die Session ist jetzt als `wake` („Wake / boat", Admin)
      klassifiziert und neu gerechnet: 1 Lauf, 358 s, 1783 m; erscheint unter `sport=wake` und
      in „was ist neu", **nicht** in Pumpfoil-Rekorden/Vergleichen. Genau das wollte der Fahrer
      („feel bad to share it in pumpfoiling because then the comparison is not correct").
      **ERLEDIGT 05.08.: Kategorien aufgeteilt** (Jans Vorgabe, `docs/sport-classification.md`) —
      aus dem Sammelbecken `wake` wurden drei: `wakethief` (Welle eines fremden Boots, teilweise
      Eigenleistung), `towed` (am Seil geschleppt, keine) und `surf_wave` (Ozeanwelle am Strand).
      Server + PWA live, Labels in 15 Sprachen, Android/iOS im Code (kommen mit dem naechsten
      Release), #1571 auf `wakethief` migriert.
      Eigene Rekorde/Ranglisten/Spots je Kategorie gibt es **schon** (Jans Hinweis, geprueft):
      Sportart-Auswahl in `/community` (`Home.tsx`), gefuettert von `GET /api/community/sports`,
      die nur Kategorien mit mindestens einem Lauf anbietet — `wakethief` steht dort seit der
      Migration automatisch drin. Es fehlt also NICHTS an Sichtbarkeit; frueher stand hier
      faelschlich das Gegenteil.
      Drei Altbestand-Sessions eines Nutzers bleiben auf der stillgelegten `wake` — **bewusst
      nichts tun** (Jan 05.08.: „lass einfach so, das koennen die User selber machen oder sonst
      halt egal"), weil niemand mehr weiss, was sie waren, und Raten hier nichts bringt. Der
      Besitzer kann sie jederzeit selbst umstellen (geprueft: keine Meldung, keine offene
      Zuordnungsfrage -> freie Wahl trotz `sport_source=admin`). Damit sie in der Zwischenzeit
      nicht stumm aus den Kategorie-Ansichten fallen, zaehlt `community_sports` jetzt
      `SPORTS_LEGACY` mit; die Alt-Kategorie verschwindet von selbst, sobald die letzte Session
      umsortiert ist.
- [ ] **Fremdkraft-Regel: Median der zweiten Laufhaelfte ist empfindlich gegen traege
      Handgelenk-Pulsmessung.** Bei gemischten Laeufen (erst Welle, dann selbst pumpen) druecken
      die flachen Minuten den Median unter die Schwelle (Fall oben: +13 gegen MAX_PULS_ANTWORT 15,
      obwohl der Puls am Ende auf 160 ging). Ein robusteres Maß (max. Anstieg oder hohes
      Perzentil im Lauf) waere zu pruefen — ABER erst gegen die 218 belegten Fremdkraft-Laeufe
      messen, mit denen die Regel kalibriert ist (heute 55/73 Treffer bei 2 Fehlern): ein
      Perzentil-Maß koennte echte Schleppfahrten durchlassen, bei denen der Puls am Ende kurz
      hochgeht. Nur mit Jans OK + Regressionslauf.

- [ ] **Foil-Katalog: offene Punkte aus der AFS-/Duotone-Runde (05.08., LIVE ergaenzt: +35).**
      Eingetragen: Duotone `WHIZZ SLS` 850/1000/1200/1450 (Nutzerwunsch 1200+1450) und die
      Marke `AFS` mit ULTRA, ENDURO (+GLT 1600), EVO, EVO HA, SILK, SILK V2, PURE, PURE HA,
      FLYER. Bewusst offen geblieben:
      - **Duotone veroeffentlicht keine Profildicke** fuer Whizz -> aus mittlerer Fluegeltiefe
        mit t/c 17,2 % geschaetzt (genau die Streckung der vorhandenen Duotone-SLS-Zeilen) und
        `thickness_estimated` gesetzt. Falls Duotone je Zahlen nennt: ersetzen + Flag entfernen.
      - **AFS PURE / PURE HA: zwei widersprechende offizielle Generationen** (Fuselink vs.
        Performer, z. B. PURE 700 span 820 vs. 750 mm). Eingetragen sind die **Fuselink**-Werte
        (aktuelle Seite); wer ein aelteres Performer hat, bekommt eine zu grosse Spannweite.
      - **AFS EVO: Label vs. Flaeche** — Einzelkarten nennen 1240/1440/1640 cm², die
        Sammeltabelle 1250/1450/1650. Eingetragen sind die Tabellenwerte (passen zum Namen).
      - **AFS ULTRA 750** hat zwei offizielle Geometrien (Front-Wing-Seite span 106 cm / AR 15
        vs. Fuselink-Seite 102,4 cm / AR 14) — eingetragen ist die Front-Wing-Seite.
      - **AFS PURE RACE 560 nicht eingetragen**: Dicke unveroeffentlicht („–", nur T/C 10–12 %),
        Race-Fluegel, fuer Pumpfoil kaum relevant. AFS **PERFORMER**-Frontfluegel ebenfalls nicht:
        nicht mehr im offiziellen Katalog (durch EVO ersetzt).
      - Kein Hersteller (weder AFS noch Duotone) sagt, ob die Flaechen **projiziert oder
        abgewickelt** gemessen sind — gilt fuer den ganzen Katalog, nicht nur diese Zeilen.
      - Nutzerhinweis „AFS Blackbird" waere falsch: `Blackbird` ist bei AFS eine **Board**-Linie,
        der Blackbird-Frontfluegel ist **Sabfoil**. Nicht anlegen.

- [ ] **Wear/Android: BODY_SENSORS wird ab SDK 36 ersetzt** (Android 16: granulare
      `android.permission.health.READ_HEART_RATE`). Beim naechsten Pflicht-targetSdk-Bump der
      Play-Vorgaben MUSS die Puls-Berechtigung mit umgestellt werden (Manifest + Runtime-Anfrage
      + Hinweistext), sonst steht die naechste Uhren-Generation wieder ohne Puls da —
      derselbe stille Ausfall wie der Xiaomi-Fall vom 03.08.

- [x] **ERLEDIGT 01.08. — Ungepairt-/Upload-Hinweise auf allen 4 Uhr-Plattformen.**
      Garmin 1.0.71 (gebaut, Website liefert es; CIQ-Store-Einreichung offen -> appmeta bleibt
      1.0.69): Start-Screen orange „Nicht verbunden · MENU" bzw. „N warten auf Upload",
      Gespeichert-Screen „App offen lassen!" solange Uebertragung laeuft. Wear + Apple Watch:
      „App offen lassen!" unter dem Upload-Fortschritt (Rest existierte). Zepp (fuer 1.0.4,
      Jans Mac-Build): Code direkt auf Seite 1, setWakeUpRelaunch gegen das Beenden bei
      Display-Aus, Upload-Hinweis + „N offen" auf dem Start-Screen.
      NEU dazu: Garmin sendet t0_ms je Accel-Chunk (exakte Zeitachse, docs/detector-v2.md
      Schritt 2 erledigt); Server-Ingest nimmt t0_ms nur noch an, wenn wirklich gesendet.
      **Noch offen aus diesem Komplex:** Update-Hinweis fuer UNGEPAIRTE Apps (oeffentlicher
      Versions-Check, naechste Garmin-Runde — alten Apps kann keine neue Version helfen).

- [x] **ERLEDIGT 01.08. — Auto-Sportart-Hinweis + Fremdkraft-Rueckholung in Android + iOS**
      (beide kompiliert bzw. geparst + Member-verifiziert; Release/Store wie immer Jan).
      Urspruenglicher Eintrag:
- [ ] ~~**Auto-Sportart-Hinweis in Android + iOS nachziehen**~~ (seit 01.08. live in der PWA, Jan:
      „für die nativen Apps mit aufnehmen in die To-do-Liste, aber jetzt erst mal in der PWA").
      Server liefert das Nötige schon: `sport_source == "auto"` und `sport_auto`
      (`{hinweis, grund, merkmale}`) in jeder Session-Ausgabe für Besitzer/Admin. Zu bauen ist nur
      die Anzeige — Vorbild `web/src/pages/SessionDetail.tsx` (Kasten mit `cls.autoAsk` bzw.
      `cls.autoSetAs` + Begründungszeile aus den Messwerten). **Den Text in der App bauen, nicht das
      `grund`-Feld anzeigen** — das ist deutsch. Widerspruchsknopf beim reinen Maschinen-Urteil
      ausblenden (der Besitzer darf direkt „Pumpfoil" wählen, Umweg über den Admin entfällt).
      Schlüssel `cls.autoAsk`/`cls.autoSetAs`/`cls.autoWhy`/`cls.autoWhyPulse` liegen in allen 15
      Sprachen in `web/src/i18n/locales/`.

### Stand 01.08.2026 — erster Zepp-Feldtest (Amazfit T-Rex 3), 4 Befunde

Ein Nutzer hat die Store-Version **1.0.3** auf einer T-Rex 3 im Wasser getestet und vier Punkte
gemeldet. Einordnung vorweg: das ist der **erste echte Feldtest der Zepp-App überhaupt** — bis dahin
gab es **keinen einzigen erfolgreichen Upload von einem Zepp-Gerät**, auch nicht von den eigenen
Testgeräten (7 Pairings, 0 Sessions). Entsprechend ist alles hier Erstkontakt-Material.

1. **Pairing-Code nicht auffindbar.** *Web-Teil erledigt 01.08.:* `account.claimHelp`/`claimReq`
   beschrieben nur den Garmin-Weg („MENU halten") und wurden für alle vier Plattformen neu gefasst
   (15 Sprachen). *Uhr-Teil offen:* der Code entsteht erst, wenn man auf dem Start-Screen nach links
   auf Seite 2/4 wischt (`watch-zepp/page/index.js:365`) — auf Seite 1 steht ungepairt nur
   „Nicht verbunden · → Verbinden". Vorschlag: ungepairt den Code direkt auf Seite 1 erzeugen und
   anzeigen, statt nur hinzuweisen.
2. **UI halb deutsch und zu klein.** Das Halb-Deutsch ist in **1.0.4 erledigt** (Wörterbuch mit
   fr-Spalte), nur eben nicht veröffentlicht — er lief auf 1.0.3, das war hartcodiert deutsch.
   „Zu klein" ist **ungeklärt**: die T-Rex 3 hat 480×480, also exakt die Designbasis, an der
   Skalierung liegt es nicht. Beim nächsten Bericht nachfragen, welche Zeile gemeint war.
3. **App verlässt sich während der Aufnahme** (kam zum Steg zurück, Uhr zeigte das Zifferblatt).
   Verdacht: wir rufen **`@zos/display` nirgends** auf — weder `setWakeUpRelaunch` noch
   `setPageBrightTime`, also genau den Mechanismus, mit dem Zepp-Apps ein Bildschirm-Aus überleben.
   Auf der Balance 2 prüfbar. Daten überleben den Abbruch (`recoverActive()` → `pending`), aber der
   Nutzer merkt es nicht — dieselbe Produktlücke wie beim Vordergrund-Upload oben.
4. **Echte Zepp-Aktivität → Strava: Zusage muss zurückgenommen werden.** Im DM stand „nächste
   Version"; belegt ist das Gegenteil (`watch-zepp/README.md`, Abschnitt „geprüft, nicht möglich").
   Einziger dokumentierter Weg ist eine **Workout Extension**, und die gibt es nur auf sechs
   Geräten — **T-Rex 3 ist dabei, die Balance 2 nicht**. Der Melder bietet Mitarbeit an und hat
   T-Rex 3 + Mac, also genau die Kombination, die dem Projekt fehlt.

Ebenfalls weiter offen: `watch-zepp/setting/index.js` (Einstellungsseite in der Zepp-Handy-App) ist
noch deutsch — dort gibt es keine belegbare Sprachquelle.

- [ ] **Upload nur im Vordergrund: dritter Nutzer, gleiches Muster — das ist kein Einzelfall mehr.**
      Belege: Garmin-Store-Bewertung 01.08. („Synchronizacja utknęła", 4/5) — Session vom 31.07.
      13:33-15:35 kam erst um **21:20** an, also 5 h 45 min nach dem Ende, vollstaendig (4,9 km,
      10 Laeufe). Davor ein iPhone-Nutzer („erst zwei Tage spaeter synchronisiert", eine Aufnahme
      hing 24,8 h) und der Fall, der zur App-Versions-Erfassung gefuehrt hat.
      Technisch ist es die bekannte Grenze (Connect IQ laedt nur im Vordergrund, Wiederaufnahme beim
      naechsten Oeffnen), Daten gehen nicht verloren. Das PRODUKT-Problem ist, dass der Nutzer es
      nicht weiss: er stoppt, die Uhr geht aufs Zifferblatt, und in der App fehlt die Session.
      Moeglichkeiten: (a) beim Stoppen deutlich sagen „Uebertragung laeuft — App offen lassen" statt
      nur einen Fortschritt zu zeigen; (b) beim naechsten App-Start prominent „X Aufnahmen warten auf
      Uebertragung"; (c) im Handy-/Web-Konto anzeigen, dass eine Uhr noch nicht abgeliefert hat.
      (a) und (b) sind billig und wuerden alle drei Meldungen erledigt haben.

### Stand 01.08.2026 — Transport im Lauf (Zug/Auto) automatisch erkennen?

- [ ] **ERKENNUNG v2: Physik abbilden statt annehmen — Entwurf liegt in
      [`docs/detector-v2.md`](detector-v2.md), wartet auf Abnahme.** Jans Vorgabe: nichts annehmen,
      alles messen oder nachrechnen (Session-Start ist bekannt, Raten aus den Daten, Nutzer-Setting
      beachten, Offsets richtig), ueberlappende Zeitfenster mit mehreren Medianen, Puls als langsamer
      Bestaetiger, Wasser als Ground Truth wo moeglich — und das Ganze **hinter einem Schalter mit
      Regressionsvergleich**, bevor entschieden wird.
      Erledigt als Grundlage (01.08., `8b6e38f`): Accel-`t0_ms` wird serverseitig gesichert
      (`load_accel_t0()`), Overpass ueber Spiegel mit Trennung „Fehlschlag" / „nichts gefunden".

- [x] **Wasserflaeche wird am FALSCHEN Ort nachgeschlagen — BEHOBEN 10./11.08.**
      Nachschlagepunkt jetzt aus den bewegten Samples (Band 1–8 m/s, `_water_lookup_point`) statt
      dem Median ALLER Punkte. Bei #1328: 2290 m vom Spot -> 458 m; bei 13 weiteren Sessions
      wandert der Punkt nur 0–50 m (gleiche Rasterzelle, kein Kollateralschaden). Das Teilen-Bild
      hatte denselben Fehler mit eigener Logik — dort wird die Silhouette jetzt GEPRUEFT statt
      geraten (`_wasser_silhouette`, unter 20 % Track-Ueberdeckung wird nichts gezeichnet): vorher
      lag bei 122 von 509 Bildern der Track zu ~0 % im blauen Bereich, jetzt 371 belegte Bilder.
      Details + Belege: [`docs/DATA-PIPELINE.md`](DATA-PIPELINE.md) §9.6.
- [ ] **OVERPASS IST GESPERRT — Wasserflaechen und Ufer-Namen kommen seit unbekannter Zeit nicht mehr
      an.** Von dieser VM: `overpass-api.de` IPv4 -> **Connection refused** (unsere IP ist dort
      offenbar gesperrt, wir haben pro Session angefragt), IPv6 -> keine Route (VM hat kein IPv6).
      Nominatim, Google, Suunto, COROS und GitHub sind erreichbar, der Spiegel
      `overpass.kumi.systems` antwortet per IPv4 normal. Folgen:
      1. `lookup_water_rings` liefert immer None -> `_clip_ends_to_water` hat fuer neue Spots nie
         Daten, das Wasser-Kriterium ist toter Code.
      2. **Fehlversuche werden als „kein Wasser" gecacht**: `_water_rings_cached` schreibt bei
         Fehlschlag `rings_json=""`, und das heisst dauerhaft „hier ist kein Wasser". Cache-Stand:
         **443 Eintraege, 384 davon als „kein Wasser"**.
      3. `lookup_shore_name` nutzt denselben Dienst -> neue Spots bekommen schlechtere/keine Namen.
      ERLEDIGT: Spiegel-Liste (01.08., `8b6e38f`) — Overpass ist darueber wieder erreichbar
      (17–27 s je Abruf), die IP-Sperre ist kein Thema mehr. Fehlschlaege werden nicht mehr als
      „kein Wasser" gecacht, und die 384 vergifteten Zeilen werden beim naechsten Zugriff EINMAL neu
      nachgeschlagen und ueberschrieben — **ohne Loeschen**, das OK brauchte es dadurch nicht.
      OFFEN und BEWUSST SO (Entscheidung Jan, 11.08.): grosse Seen bleiben aussen vor, weil OSM sie
      als Relation fuehrt und die Way-Abfrage sie nie findet (Bodensee = Relation 1156846, 84
      Mitglieder, 16.396 Punkte, >2 min Abruf). Begruendung + Belege in
      [`docs/DATA-PIPELINE.md`](DATA-PIPELINE.md) §9.6. Falls es je wichtig wird: nicht Overpass,
      sondern eine fertige vereinfachte Geometrie fuer die ~20 relevanten Seen.
      Alter Plan (nicht mehr verfolgt):
      „ist der Lauf auf dem Wasser?" als Signal testen — es ist das einzige, das den von Jan
      bestaetigten Fall #890 (echter Lauf, Puls-Anstieg -5) richtig einordnen kann.
- [ ] **RAHMENDATEN PRO NUTZER (Jans Richtung, 01.08.) — gemessen, tragfaehig aber nur mit
      gepruefter Referenz.** Idee: Ruhepuls und Pump-Puls sind individuell, also die Schwelle pro
      Nutzer aus seiner Historie lernen (Puls zwischen den Laeufen = Erholung, Puls in kurzen Laeufen
      = Pumpen). Messung (`<scratchpad>/rahmendaten.py`, 48 Nutzer mit Puls, 5819 Laeufe):
      * Schwelle = Ruhe + 40 % der persoenlichen Spanne ordnet die 4 bestaetigten Autofahrten richtig
        ein und die Rekord-Laeufe (#622/#1031, Puls 148/166 gegen Schwelle 116) auch.
      * ABER: bei user 95 ist die Spanne **negativ** (Ruhe 133, „Pump" 120) — seine 46 Sessions sind
        alle unbestaetigt als pumpfoil geführt, die Grundlinie lernt also von Fremdsportarten und
        Autofahrten. Die 4 Treffer waren Zufall, nicht Koennen.
      * user 133 (#890, von Jan als ECHT bestaetigt): Spanne **-1** -> Schwelle 121, sein echter Lauf
        mit Puls 116 waere FALSCH als Transport markiert.
      * ~~Kern: nur 7 von 34 Nutzern zeigen >= 15 bpm Spanne~~ — **ZURUECKGEZOGEN 01.08., war ein
        Artefakt meiner Metrik** (Jans Einwand: „das muesste bei allen hochgehen"). Er hatte recht.
        Drei Fehler: (1) die Pulsspitze kommt NACH dem Lauf und wurde als „Ruhe" gezaehlt;
        (2) Mittelwert UEBER den Lauf statt der Antwort danach; (3) die Ruhe-Menge enthielt die
        Erholungsphase. Gemessener Verlauf um kurze Laeufe (25-70 s): u2 119 -> **137 bei +60 s**
        (252 Laeufe), u73 107 -> **159 bei +40 s** (41 Laeufe), u135 102 -> 114 bei +50 s.
      * **Richtige Metrik (7 von 7 beschrifteten Faellen korrekt):** Median(2. Laufhaelfte bis
        Ende+30 s) minus Median(90 s davor), Werte <= 40 bpm als Sensor-Aussetzer verwerfen.
        Ergebnis: Autofahrten -1 / +4 / +13, echte Laeufe +26 / +35 / +57 / +70 — Schwelle um +20.
        **Auch #890 (Jans Gegenbeispiel) ist damit richtig** (+26), woran alle frueheren Varianten
        scheiterten. Extremwerte (Spitze minus Minimum) taugen NICHT: Sensor-Aussetzer liefern
        50-bpm-Minima, dann wird jede Autofahrt zur „Anstrengung".
      * Bewegungskurve: ~~mit diesen Daten nicht belegbar, Streuung zwischen echten Laeufen zu
        gross~~ — **die Messung war UNGUELTIG**: #1328 hat 5,7 % Accel-Ratenabweichung (getaggt 25,
        abgeleitet 23,57 Hz), das sind bei Minute 100 **6,1 Minuten Versatz** — meine Fenster lagen
        nicht auf den Laeufen. #1232 und #622 sind dagegen exakt synchron (0,0 %).
      * **Auf den SYNCHRONEN Sessions trennt die Amplitude klar** (Faktor 33): belegte Autofahrt
        (#1232) RMS **0,037 g**, Wakethief (geschoben) 0,744 g, echtes Pumpen (#622 Rekord-Lauf)
        **1,220 g**. Die FREQUENZ trennt NICHT: Auto-Gipfel 1,63 Hz, Pumpen 1,54 Hz — beide mitten im
        Band (Fahrbahn-/Motorresonanz liegt zufaellig dort). Jans Instinkt „Bewegung trennt" war also
        richtig, seine Verfeinerung „andere Frequenz" bestaetigt sich nicht.
      * **Damit ist der Accel-Raten-Fehler das Nadeloehr** (eigener TODO-Punkt, 42 Sessions > 15 %
        Abweichung): solange die Zeitachse nicht stimmt, ist jede Accel-Aussage in diesen Sessions
        wertlos — auch Pump-Zahlen und Gleitphasen. Erst fixen, dann Accel als Signal nutzen.
      Konsequenzen fuer den Bau: (1) Referenz NUR aus unabhaengig belegten Pump-Laeufen (Accel-Kadenz
      plausibel, Hin-und-Zurueck-Geometrie, Session von einem MENSCHEN als pumpfoil bestaetigt, nicht
      `sport_source=default`); (2) **Brauchbarkeits-Test pro Nutzer**: keine Spanne -> kein Urteil
      (statt selbstbewussten Unsinns); (3) Puls nur fuer Laeufe ab ~2-3 min — kurze kann er nicht
      bewerten, was passt, weil der Transport-Fall der lange ist.
      Zweiter Teil von Jans Idee, unabhaengig und robuster (kein Sensor noetig): **Start-Region pro
      Nutzer lernen** — Orte seiner bestaetigten Sessions; ein Lauf, der den gewohnten Bereich
      verlaesst, ist auffaellig. Jans Warnung mit aufnehmen: wer wirklich woanders pumpt, muss ohne
      Reibung durchkommen -> vorschlagen, nie entscheiden.
- [ ] **Puls-Anstieg als Signal — gemessen, taugt NUR in Kombination.** Pumpen kostet Puls,
      Transport nicht. Metrik: Ø-Puls im Lauf minus Median-Puls AUSSERHALB aller Laeufe derselben
      Session (absolute Werte sind individuell). Messung ueber 5701 Laeufe mit brauchbarem Puls
      (Skript `<scratchpad>/puls_regel.py`, Rohdaten `puls_regel.json`):
      * Puls ALLEIN ist nicht trennscharf: „Dauer > 120 s und Anstieg < 10 bpm" trifft 201 Laeufe in
        75 Sessions, darunter viele mit Geradheit 0,01-0,20 — also Hin-und-Zurueck am Spot.
      * Erst die KOMBINATION trennt: Dauer > 120 s **und** Anstieg < 10 bpm **und** Geradheit > 0,7
        ergibt **22 Laeufe in 17 Sessions**. Gegenprobe: von 72 langen Laeufen MIT Anstieg >= 25 bpm
        sind nur 5 gerade — und die sind 126-267 s bei 14-16 km/h mit +31 bis +46 bpm, also echte
        Einfach-Strecken mit Anstrengung.
      * Muster: schnell + gerade + muehelos (20-25 km/h, Anstieg <= 9) gegen langsamer + gerade +
        anstrengend (14-16 km/h, Anstieg >= 31).
      * Grenzen: **83 Sessions haben gar keinen Puls** (v. a. FIT-Importe) -> Regel greift dort nie;
        sie trennt Transport nicht von Wing/Kite/Tow, sagt nur „keine Pump-Anstrengung".
      Vorschlag: als Kennzeichnung + Ein-Tipp-Angebot an den Besitzer, nicht als stiller Schnitt.
      **Von Jan gepruefte Stichprobe (01.08.):** von 5 Kandidaten (ohne user 135) waren 4 echte
      Autofahrten und **1 Fehltreffer** — #890 Lauf 0 (133 s, 509 m, Ø 14,0, gerade 0,81, Puls 116 bei
      Ruhe 121): eine echte Fahrt „einmal in die andere Richtung". Auch eine Normierung auf den
      eigenen Pulsbereich der Session hilft dort NICHT (#890 liegt bei 0,19 im Bereich, eine
      Autofahrt bei 0,51 — die Reihenfolge kippt). Damit ist belegt: **Puls kann diese Entscheidung
      nicht tragen**, in keiner Normierung.
      Ausserdem: **13 der 17 Kandidaten-Sessions gehoeren user 135**, dessen Profil auf Wingfoil steht,
      waehrend 172 von 186 Sessions noch als pumpfoil klassifiziert sind — die Regel findet dort keine
      Transporte, sondern eine bekannte, offene Klassifikations-Baustelle. Vor der naechsten Messung
      also erst user 135 umstellen.
- [ ] **Groesserer Befund aus derselben Messung: die langen Laeufe im Bestand sind ueberwiegend kein
      Pumpen.** Median-Puls-Anstieg bei Laeufen > 300 s: **+3 bpm** bei Ø 21,5 km/h; bei 30-120 s
      dagegen +7 bis +11 bei Ø 14,7 km/h. Der aktuelle Rekord „laengster Lauf" (#622, 648 s,
      14,6 km/h, +37 bpm) ist echt, aber viele lange Laeufe darunter sind vermutlich falsch
      klassifizierte Sportarten. Eigenes Thema, groesser als die Transport-Frage.
- [ ] **Transport-Abschnitte erkennen und VORSCHLAGEN (nicht automatisch trimmen).** Befund #1328:
      Zugfahrt als Lauf gezaehlt (414 s, 2812 m, Ø 23,3 km/h) — der Ø-Gate entgangen, weil die Grenze
      bei 25,2 km/h liegt. Drei Erkennungswege gemessen und VERWORFEN:
      (a) Tempo allein — echte Pumpfoil-Laeufe erreichen 25,1 km/h;
      (b) gerade Linie + Tempo (Ø>18, Geradheit>0,7) — trifft **210 Laeufe in 85 Sessions**,
          darunter als `surf_downwind` klassifizierte: ein Downwinder IST schnell und gerade;
      (c) Armbewegung (bei Auto/Wake das gute Signal) — in #1328 hat der Transport 0,291 g, ein
          echter 644-s-Pump-Lauf nur 0,185 g, ein weiterer 0,082 g. Trennt nicht.
      Vorschlag deshalb: verdaechtige Fenster markieren (schnell + gerade + endet weit weg vom Spot,
      kommt nicht zurueck) und dem Besitzer einen Ein-Tipp-Vorschlag zum Aussortieren zeigen — der
      Mechanismus (`excluded_ranges`) existiert. Entscheidung beim Menschen, funktioniert fuer Zug,
      Auto, Bus und Faehre gleich. **Braucht Jans OK.**
- [x] **#1328 manuell erledigt (01.08.):** Lauf 3 ausgesortiert (Fenster 6094184-6510069 ms) und
      wieder als `pumpfoil` zugeordnet (`sport_source=admin`, `pumpfoil_override=True`).
      6 -> 5 Laeufe, Foil 1226 -> 812 s, Strecke 9471 -> 6655 m, bester Lauf 2812 -> 2344 m (damit
      unter dem Rekord von 2626 m), Session-Max 29,8 -> 25,5 km/h.

### Stand 31.07.2026 — Detektor-Korrekturen (angewendet) + neuer Befund

- [ ] **Zepp: echte Aktivitaet aufzeichnen (Nutzer ZUGESAGT, 31.07.).** Unsere Amazfit-App bindet nur
      UI/Storage/Device/Interaction/BLE/Sensoren ein und laeuft als `appType: "app"` — sie erzeugt
      also KEINE Zepp-Aktivitaet, damit landet auch nichts in Zepp und nichts bei Strava. Ein Nutzer
      hat genau danach gefragt ("est-ce que ça va quand même enregistrer une session normale qui se
      synchronisera avec Strava"), Jan hat es fuer das naechste Release zugesagt. Bei Garmin machen
      wir es richtig (`ActivityRecording.createSession` mit Name "Pumpfoil", s.
      `watch/source/SessionRecorder.mc:812`) — auf Zepp braucht es das Gegenstueck:
      `appType: "workout"` bzw. die Workout-API, plus Pruefung, ob parallel zu unserer eigenen
      Aufzeichnung moeglich. Nur auf Jans Mac testbar (Zeus-Simulator).

- [x] **Drei Fehlerklassen an den Lauf-Grenzen behoben** (Commit `7b8da61`, alle 1261 Sessions neu
      analysiert, 0 Fehler): Drift-Kappung traf die Rueckfahrt zum Steg (jetzt Form-Kriterium:
      Drift ist gerade + konstant, Geradheit >= 0,97 und Streuung <= 0,25 m/s); kurzer Einbruch der
      Uhr-Geschwindigkeit trennt keinen Lauf mehr, wenn die Position widerspricht (Foil-Band oder
      <=5 s Aufsetzen); GPS-Genauigkeit gilt jetzt auch im Modell-Pfad und fuer die
      Session-Hoechstgeschwindigkeit. Merge laeuft ein zweites Mal NACH dem Verlaengern der Raender.
      Bilanz: 237 Sessions geaendert, davon 232 gewinnen; Pumpfoil +17 s je Session, laengster
      Pumpfoil-Lauf unveraendert (1398 s). Snapshot vorher:
      `server/data/analysis-snapshots/2026-07-31_vor-detektor-fixes.jsonl.gz`.
      Rekorde: Top-Speed wechselte von der Sturz-Session (28,2) auf 27,4 km/h; sonst nur
      Kleinstaenderungen.
- [ ] **Accel-Rate: abgeleitete Rate liegt teils weit UEBER der getaggten.** 42 echte Sessions
      (GPS > 5 min) mit Faktor > 1,15, und die Faktoren sind glatt: 4,00 (25 -> 100 Hz, 11x),
      3,90 (8x), 2,50 (4x), 2,00 (9x), dazu #42 mit Faktor 15,78. Die Heuristik in `run_analysis`
      wurde fuer den UMGEKEHRTEN Fall gebaut (FR55: real weniger als getaggt) und hat nach oben
      keine Bremse. Folge: Pump-Zeitpunkte landen falsch -> Kadenz und Gleitphasen stimmen nicht.
      Sichtbares Symptom: der Gleit-Rekord steht bei **36,7 s** (#1245, getaggt 50 Hz, abgeleitet
      74,31 Hz) — bei 163 Pumps im selben Lauf und klarem Pump-Signal am Handgelenk. Bei #1245
      deckt die GPS-Spur die Session vollstaendig ab (Wanduhr = GPS-Dauer), es fehlen also keine
      GPS-Punkte. **Vor einem Fix klaeren:** liefern die Uhren wirklich ein Vielfaches der
      angekuendigten Rate, oder kommen Chunks doppelt an? Danach entweder die Rate nach oben
      kappen (eine Zeile) oder Duplikate verwerfen. Betrifft Pump-Zahlen aller 42 Sessions.

### Stand 30.07.2026 — Aussortieren, Katalog, Detektor

- [x] **App-Version pro Session** (`sessions.app_version`): Angabe des Clients, sonst die letzte vom
      Geraet gemeldete Version. Alle fuenf Recorder schicken sie beim Aufnahmestart mit; Garmin war
      ueber den Config-Abruf schon abgedeckt. Anlass: eine Meldung „Session erst zwei Tage spaeter
      da" liess sich nicht beantworten, weil unbekannt war, welche Version lief. Kein Backfill fuer
      Altbestand (die Geraeteversion von heute ist nicht die von damals).
- [ ] **Update-Hinweis Android: Play selbst fragen statt appmeta zu glauben.** Nutzerbefund 30.07.:
      „app says update 1.1.17 available, I have 1.1.14 but update button just opens google play and
      does not offer nor start update." Zwei Ursachen: (a) `latest` in `appmeta.py` wurde am Tag der
      EINREICHUNG auf 1.1.17 gesetzt — steht die Freigabe noch aus oder laeuft der Roll-out
      gestaffelt, zeigt Play nur „Oeffnen"; die Regel im Kopf derselben Datei sagt ausdruecklich
      „NUR auf eine WIRKLICH FREIGEGEBENE Version". (b) Der Knopf kann ein Update technisch nicht
      anstossen, er oeffnet nur die Store-Seite.
      Saubere Loesung: **Play-In-App-Update-API** (`com.google.android.play:app-update-ktx`) —
      `appUpdateInfo` sagt, ob Play fuer DIESES Geraet ueberhaupt ein Update hat (damit kann der
      Hinweis nicht mehr luegen), `startUpdateFlowForResult` (FLEXIBLE) laedt und installiert in der
      App. **Braucht Jans OK** (neue Google-Abhaengigkeit + Release). Zwischenzeitlich: `latest` erst
      setzen, wenn der Roll-out bei 100 % ist. Gleiches Muster fuer Wear (1.2.17).
- [ ] **Android-Handy-App meldet Plattform/Version nicht ans Geraete-Token.** Die iPhone-App pingt
      jetzt einmal pro Lauf `/api/devices/config?p=ios&v=…`, damit ihr Token in der Geraeteliste
      Version + „zuletzt gesehen" zeigt. Auf Android fehlt das noch (eine Zeile) — dort steht das
      Handy-Token ohne Plattform und Version in der Liste.
- [ ] **Zepp: Nutzer-Feedback offen** — „Upload nicht automatisch / nur Sessions mit mindestens einem
      Lauf" (gilt fuer alle Recorder, Produktentscheidung: Verwerfen-Dialog nach dem Stopp ODER
      Schalter „nicht automatisch hochladen").

- [x] **Ø-Regel gegen Autofahrten**: ein Lauf muss auch im DURCHSCHNITT unter der Foil-Grenze
      bleiben, nicht nur in der Spitze (`_gate_implausible_runs` in `analysis/gps.py`). Befund war
      eine Session mit vergessener Stopp-Taste (Fahrt zwischen zwei Spots als „sehr guter Lauf").
      Alle Sessions neu analysiert; Bestenlisten vorher/nachher verglichen (kein Rekord ist
      unberechtigt weggefallen, nur der Gleit-Rekord hat gewechselt).
- [x] **Laeufe und freie Zeitbereiche aussortieren** (`excluded_ranges`): Lauf-Tabelle + Zuschnitt-
      Panel in der PWA, Besitzer oder Admin, Neuanalyse, umkehrbar. Der Fenster-Weg war noetig, weil
      eine Autofahrt nach der Ø-Regel gar kein Lauf mehr ist und es sonst keinen Griff dafuer gaebe.
- [x] **Lauf-Nummer traf beim Admin den falschen Lauf** (`_shown_runs` nahm immer das
      Empfindlichkeits-Preset des Besitzers, der Admin sieht aber die kanonischen Laeufe).
- [x] **Ketos im Foil-Katalog** (16 Eintraege) + zweites Kennzeichen „Masse abgeleitet"
      (`specs_estimated`), wenn der Hersteller nur einen Teil der Zahlen veroeffentlicht.
- [x] **„Fehlt im Katalog?" -> Feedback mit einem Klick** unter Foil- und Stab-Liste. Zweimal musste
      ein Nutzer deswegen schreiben; die Liste sagte nirgends, dass man nachtragen lassen kann.

Offen daraus:
- [ ] **Doppler-Einbruch zerschneidet einen Lauf.** `_merge_no_stop` entscheidet „echter Stopp?"
      allein an der geglaetteten Doppler-Geschwindigkeit der Uhr. Faellt die durch Messrauschen
      unter `NOSTOP_SPEED` (1,5 m/s), waehrend die aus der POSITION gerechnete Geschwindigkeit
      weiter ueber der Foil-Grenze liegt, wird ein Lauf faelschlich getrennt. Befund: #1232, drei
      Doppler-Samples (3,3/16,8/4,9 km/h in 3 s), Position durchgehend 6-14 km/h, Doppler-Minimum
      1,36 gegen Schwelle 1,50 -> 129 s + 907 s statt einem Lauf.
      Umfang gemessen (alle 1195 Sessions, 5493 Nahtstellen): **25 Nahtstellen in 11 Sessions**;
      11 davon in zwei Sessions eines Nutzers, dessen Uhr einen unzuverlaessigen Doppler liefert
      (#1131: 24 Schnipsel statt 13 Laeufe).
      Kandidat-Fix: Doppler-Einbruch zaehlt nicht als Stopp, wenn die Positions-Geschwindigkeit die
      ganze Luecke ueber >= `EXIT_SPEED` bleibt (derselbe Realitaets-Check, den die Pipeline schon
      nutzt). Trockenlauf ohne DB-Schreibzugriff: 11 Sessions aendern sich, 7 Kontroll-Sessions
      unveraendert. **NOCH NICHT FERTIG** - zwei ungeklaerte Nebenwirkungen: in #584 wandert das
      Ende des zusammengefuehrten Laufs von 747 s auf 730 s (`_extend_ends_forward` laeuft NACH dem
      Mergen), in #642 verschwindet ein 8-s-Lauf. **Detektor-Aenderung, braucht Jans OK.**
      Skript: `<scratchpad>/trockenlauf.py`, Messung `<scratchpad>/nahtstellen.json`.
- [x] **Aussortieren in Android + iOS nachgezogen** (`2483c3a` / `0698b3c`) — Android kompiliert,
      iOS nur syntaxgeprueft, Jans Xcode-Build ist das Gate. Nebenbei gefixt: die Zuschnitt-Regler
      starteten in beiden Apps immer bei 0…Dauer (in der PWA beim gespeicherten Zuschnitt), womit
      "Bereich aussortieren" ungezogen die ganze Session vorgeschlagen haette.
- [ ] **Ketos KOBUN + Karve Freefly: Spannweite/Flaeche sind abgeleitet**, nicht vom Hersteller.
      Beim Hersteller nachfragen und die Kennzeichnung dann entfernen.
- [ ] **Kennzeichen „Masse abgeleitet" auch in Android + iOS** anzeigen (PWA hat es).

- **FIT-Import: `accel_hz` behauptet 25 Hz, obwohl keine Accel-Daten dabei sind.** In
  `sessions.py:317` steht `accel_hz = parsed["accel_hz"] or 25`; Suunto-FITs (und andere ohne
  Rohbeschleunigung) liefern 0, gespeichert wird dann 25. Die Auswertung macht es richtig
  (`detection=gps_only`, keine Pumps — sie bestimmt die echte Rate aus den Daten), nur der
  gespeicherte Wert lügt und führt bei späteren Auswertungen „welche Plattform liefert Accel?"
  in die Irre. Vorschlag: `NULL` statt 25, vorher prüfen, wo auf `accel_hz` verlassen wird.
  Betrifft alle FIT-Wege (manueller Upload, Suunto, Polar), nicht nur Suunto. Befund 2026-07-28
  an den ersten echten Suunto-Importen (#1007–#1009).

### Stand 29.07.2026 — Uhr-Layouts, Kadenz-Einheit, Type-Checker

- [x] **Layout-Renderer Wear + Apple Watch**: Seiten-Drahtformat (getaggte Listen, nicht IDs),
      Größenstufen aus der Simulator-Messung statt geschätzt (waren 32–56 % zu groß), exakte Palette,
      Fett nur für Werte, REC mit Text, randloses Zeichnen, kein doppelter Seiten-Indikator,
      Geschwindigkeitsfarbe in vier Stufen wie Garmin. Am Wear-Emulator gegen die PWA-Vorschau
      ausgemessen (≤ 1 % Abweichung) und von Jan auf beiden Uhren bestätigt.
- [x] **Halten zum Stoppen/Verwerfen**: 3 s → 2 s auf Wear und Apple Watch (inkl. Labels in 12 Sprachen).
- [x] **Einheit der Lauf-Distanz** gehört ins Label, nicht in den Wert (Wear/Apple; Garmin war schon richtig).
- [x] **Melde-Knöpfe für fremde Sessions** sichtbar in der Aktionszeile auf Android und iOS
      (waren nur im Overflow-/Flaggen-Menü), mit Zählern und Zuständen wie in der PWA.
- [x] **Kadenz-Einheit Hz oder Pumps/min** pro Nutzer: Server, PWA (live), Android, iOS.
- [x] **iOS/Watch Type-Checker**: Diagnose-Schwelle auf 100 ms, große SwiftUI-Ausdrücke zerlegt
      (Watch: größter Block 202 → 31 Zeilen). Ziel: kein Block über ~40 Zeilen.
- [x] **project.yml**: Version kam doppelt vor (Settings 1.1.18/22, Info.plist 1.1.17/21 — die plist
      gewinnt) → Archiv wäre als bereits veröffentlichte Version gebaut worden. Jetzt referenziert
      die plist die Build-Settings.

Offen daraus:
- [ ] **Pausen-Seiten (`pausePages`) auf Wear und Apple Watch** — hängen an der manuellen Pause,
      die es auf beiden Uhren noch nicht gibt.
- [ ] **Strenger Zustandsring** (`browse_all_pages=false`) auf Wear und Apple Watch.
- [ ] **Icon-Satz für den Layout-Editor** (Nutzerwunsch „Font Awesome"): die eingebauten
      Garmin-Fonts haben keine Symbol-Glyphen, der Editor warnt schon davor
      (`undisplayableChars`). Machbar als eingebetteter Bitmap-Font + neuer Elementtyp „Icon",
      auf Wear/Apple native gezeichnet. Nur `:full`-Builds. **Braucht Jans Go.**
- [ ] **Falsch erkannter Kurz-Lauf** (Nutzer-Meldung zu einer Session mit 6 Läufen): Kandidat-Regel
      „Dauer < 10 s UND Spitze < 13 km/h" trifft 9,1 % aller 4635 Läufe, alle ≤ 9 s; **23 Sessions
      verlieren dabei alle Läufe** → vorher stichprobenartig prüfen. Eine reine Spitzen-Schwelle
      wäre falsch (bei 13 km/h fielen 19,6 % weg, inkl. eines 145-s-Laufs). **Detektor-Änderung,
      braucht Jans OK.**
- [ ] **Layout-Vorschau in den Handy-Apps**: Android und iOS zeigen eine Layout-Seite nur als Namen.
      Der Renderer von Wear/Apple ließe sich dafür nachnutzen.

  `sessions.py:317` steht `accel_hz = parsed["accel_hz"] or 25`; Suunto-FITs (und andere ohne
  Rohbeschleunigung) liefern 0, gespeichert wird dann 25. Die Auswertung macht es richtig
  (`detection=gps_only`, keine Pumps — sie bestimmt die echte Rate aus den Daten), nur der
  gespeicherte Wert lügt und führt bei späteren Auswertungen „welche Plattform liefert Accel?"
  in die Irre. Vorschlag: `NULL` statt 25, vorher prüfen, wo auf `accel_hz` verlassen wird.
  Betrifft alle FIT-Wege (manueller Upload, Suunto, Polar), nicht nur Suunto. Befund 2026-07-28
  an den ersten echten Suunto-Importen (#1007–#1009).
- **Suunto/Polar-Import: `device_model` bleibt leer.** Bei Suunto steht kein Gerät in der Session,
  obwohl die Info vorliegt: die Webhook-Benachrichtigung liefert `gear.name` (z. B. „Suunto
  Vertical"), im FIT steckt zusätzlich eine Geräte-Kennung. Nur Kosmetik, aber sichtbar.
- **Suunto-Portal: Icon (300×300) + Image (1135 px) nicht gesetzt** — für die Darstellung der App
  in der Suunto-App. Passende Vorlagen liegen in `brand/`, Größen daraus erzeugbar (nur Jan kann
  im Portal hochladen).
- **Halten zum Stoppen: 2 s statt 3 s — auf den ANDEREN Plattformen nachziehen** (Jan 2026-07-27:
  „ebenso spaeter auf allen anderen uhren und handy-recorder wenn wir da alles uebernehmen, das aber
  erstmal notieren"). Garmin ist ERLEDIGT (`SessionRecorder.STOP_HOLD_MS = 2000`, ab 1.0.68). Begründung:
  seit es das Menü Speichern/Pausieren/Verwerfen gibt, beendet das Halten die Aufnahme nicht mehr selbst
  — ein Fehlgriff ist harmlos, 3 s fühlten sich am Wasser unnötig lang an.
  **Auf Apple Watch und Wear OS gibt es das gar nicht** (Jan, 2026-07-27): dort wischt man erst auf
  einen Stopp-Screen, es gibt kein Halten mit Ring. Also NICHTS zu ändern — nicht danach suchen.
  Bleibt offen für: **Handy-Recorder** (Android/iOS, falls dort ein Halten existiert) und **Zepp**
  (dort ist es der neue Tasten-Langdruck; die Dauer bestimmt Zepp selbst, für 2 s bräuchte es eine
  eigene Zeitmessung über KEY_EVENT_PRESS/RELEASE).
- **Standard-Sportart im Profil** (Jan 2026-07-27: „im profil ein einfaches auswahlfeld als welche
  sportart zukuenftige sessions als ‚default' eingestellt werden sollen … ist ja wie mein
  default-foil … aber das wirklich nicht mehr heute"). Nur Web/Server, KEINE Uhr-Änderung nötig:
  Settings-Key (z. B. `default_sport_class`) + Auswahlfeld neben dem Standard-Foil, und beim
  Session-Anlegen (`import_parsed_session`) als `sport_class` übernehmen. Damit lädt z. B. ein
  Wingfoiler direkt in die richtige Kategorie hoch und muss nichts nachträglich zuordnen.
  Später ggf. auch je Uhr wählbar (wie das Foil beim Start) — das braucht dann eine Uhr-Version.
  Kategorien + Regeln: [`docs/sport-classification.md`](sport-classification.md).
- **Sessions klassifizieren („nicht Pumpfoil") — Design steht, Umsetzung offen** (Jan 2026-07-27).
  Vollständiges Konzept: [`docs/sport-classification.md`](sport-classification.md). Kern: zwei Achsen
  (`sport` = andere Sportart, darf eigene Rekorde begründen · `data_quality` = Müll, zählt nirgends),
  Melden durch Besitzer (mit Kategorie) und Fremde (nur „bitte klassifizieren"), **Wirkung erst ab
  2 unabhängigen Meldern**, Einspruch des Besitzers, Admin-Entscheidung mit `admin_locked`.
  Zwei Fallen, die im Doc stehen: `is_pumpfoil` gehört dem DETEKTOR (Reanalyse überschreibt es) und
  `flagged` ist die Moderation für unangemessene Inhalte — beides darf die Klassifikation nicht
  benutzen. Stufe 2: Rekorde/Stats/Spots je Sportart.
- **Eigene Uhr-Screens auf die anderen Plattformen** (Jan 2026-07-27: „die custom-screens ziehen wir
  dann spaeter nach, heute nicht"). Garmin kann es seit 1.0.66/1.0.67 (Renderer + F3-Zustandsmaschine);
  Server und PWA sind plattformneutral — `/api/devices/config` liefert `pages`/`offFoilPages`/
  `pausePages`/`browseAll` an JEDE Uhr, die Elemente sind reine Zahlen-Arrays. Zu bauen ist also nur je
  ein Renderer: **Zepp/Amazfit** (`watch-zepp/page/index.js`, Widgets statt dc-Zeichnen — dort ist
  das Tasten-Update gerade im Review), **Wear OS** (`android/wear`, Compose Canvas) und
  **Apple Watch** (`watch-apple/Sources`, SwiftUI Canvas).
  **TOR (Jan 2026-07-27): erst nachziehen, wenn Garmin-F3 im ECHTEN Einsatz bewährt ist** — „erstmal
  garmin fertig machen und testen, nachziehen dann sobald das gut funktioniert und im einsatz war."
  Also nicht parallel bauen: die Zustandsmaschine ist frisch, und ein Modellfehler wäre sonst dreimal
  einzusammeln. Reihenfolge danach nach Nutzerzahl.
  Design + Elementformat: `docs/setup-and-watch-layouts.md` (F2/F3).
- **Suunto: Frist bis 2026-08-03 — dann aus Banner + Uhr-Tabelle entfernen** (Jans Entscheidung
  2026-07-27: „wenns in einer woche nicht geht nehmen wir aber suunto wieder raus aus dem banner &
  /uhr tabelle"). Hintergrund: Suuntos Token-Endpunkt liefert seit ~19.07. für ALLE Nutzer 401,
  unsere Seite ist lückenlos geprüft und korrekt; Production-API-Antrag steht seit 26.07. auf
  „Submitted". Bis dahin steht ein Störungshinweis in der Suunto-Karte (`settings.suunto.broken`).
  **Wenn bis 03.08. keine Freigabe/kein Fix:** Suunto so darstellen, wie es ist — nicht als
  verfügbare Integration bewerben. Zwei Stellen:
  1. `web/src/components/SupportedPlatforms.tsx` → `GROUPS.account`: „Suunto" von `avail` nach
     `pending` (die Menü-Subzeilen zeigen dann „Wartet auf Freigabe: COROS, Suunto").
  2. `web/src/components/WatchMatrix.tsx` (Tab Kompatibilität, `/uhr`) → Suunto-Zeile `status:
     "import"` → `"planned"` (Konto-Logo/Verknüpfen-Link entfällt damit).
  Der Code der Integration bleibt liegen (wie Strava/COROS), nichts löschen. Zurückdrehen, sobald
  eine Verknüpfung wieder durchläuft. Details + Beweislage: Memory `suunto-api-integration`.
- **Stab-Katalog: Nacharbeiten** (2026-07-26): Grundausbau ERLEDIGT — **152 Bezeichnungen über
  24 Marken** in `server/app/data/stabs.json` (Arbeitsliste = die Marken der Foil-DB). Bewusst nur
  Marke/Modell/Größe, keine Maße. Offene Feinarbeit, jeweils weil die Quelle nicht hergab:
  (0) **Gong**: weitere Stab-Modelle (Curve, Curve H, Fluid H, Veloce H, X-Over, Fast …) fehlen —
  gong-galaxy.com antwortet auf jeden Abruf mit HTTP 429. Größen NICHT aus dem Gedächtnis ergänzen:
  „Stab Trail" gibt es laut Herstellerseite in **L/XL/XXL** (S/M hatte ich fälschlich geseedet).
  (a) **Duotone** R, C, C (OG), PX (OG), Aero Stabilizer C, Monobloc-Tail S/PX D/LAB — Namen stehen
  auf der Übersicht, Größen je Produktseite nachholen. (b) **Armstrong** CF300/Dart 140/Speed 180/
  Flow 235/Surf 205/Flying V 200 nur über Händler-A+-Übersichten belegt (armstrongfoils.com gab
  404/429) → gegenprüfen. (c) **Starboard** nur RAZR 220/250 (Produktübersicht 404). (d) **Lift**
  außer 33 Carve/38 Surf V2/38 Glide V2 nur über Händler. (e) **Moses** ohne Herstellerquelle je
  Größe (Seite ECONNRESET). (f) **TAKOON** Monobloc Carve + weitere Glide-Größen. (g) **Ensis**
  komplett offen — es ließ sich kein eigener Stabilizer-Produktname mit Größen finden (nur „265 cm²
  Stabilizer" als Set-Bestandteil). Lücken sind unkritisch: fehlende Bezeichnungen legen Nutzer
  über `POST /api/stabs` privat selbst an, und gute private Einträge übernehmen wir global.
- **Web-Bundle per Code-Splitting verkleinern** (2026-07-26): `dist/assets/index-*.js` liegt bei
  ~2,0 MB (gzip ~660 kB) und hat die Workbox-Precache-Grenze von 2 MiB gerissen (Build-Abbruch).
  Grenze in `web/vite.config.ts` auf 5 MiB hochgezogen — die eigentliche Lösung sind Lazy-Routes
  (`React.lazy` für Admin/Nerd-Seiten/Karten) bzw. `manualChunks` für Leaflet/Charts.
- **Detailed Setup (Stab/Mast/Shim/Board) + Advanced Watch-Layouts** (2026-07-26, Design-Runde Jan):
  Zwei geplante Features, Design vollständig festgehalten in
  [`docs/setup-and-watch-layouts.md`](setup-and-watch-layouts.md) — Datenmodell, Constraints
  (Apple-Decoder, Garmin-Fonts, Speicher-Tiers), dreistufiges Sicherheitsnetz (On-Watch-Schalter +
  Canary-Selbstheilung + Server-Kill-Switch), Phasen P0–P3. **P0 ist ein kleiner Vorab-Gewinn:**
  `pauseView` im einfachen 3-Slot-System konfigurierbar machen (heute auf allen 4 Plattformen
  hartcodiert). **F2 P2 (Garmin) fertig gebaut 2026-07-26, wartet auf Jans Sim-Tests:** Server
  liefert Layouts (Gating ≥512 KB), Renderer hinter `(:full)`, Sicherheitsnetz komplett
  (On-Watch-Schalter, Canary, selbstlernender Kill-Switch je Modell), Font-Faktoren aus dem SDK
  gemessen. Version 1.0.66 (nicht eingereicht), Testpakete für fr255s + fenix7xpro geliefert.
  Stand 2026-07-26: **P0 erledigt** (bis auf Garmin-Client), **F1 erledigt** (Server +
  `/setup` + `FoilSelect` + Stab-Bezeichnungen inkl. eigener privater Einträge), **F2 P1 erledigt**
  (Tabelle + API, `/layouts`, Editor `/layouts/:id`, Galerie `/layouts/community`, Changelog).
  **Offen: F2 P2** = Garmin-Renderer + dreistufiges Sicherheitsnetz (On-Watch-Schalter, Canary,
  Server-Kill-Switch) + Geräte-Gating — braucht Jans Simulator-Tests. Danach P3 (Wear + Apple).
  Kleinkram dazu: `memoryLimit` in `build-all.sh`-Katalog aufnehmen (Einzeiler, fürs Gating), die
  2 Katalog-Einträge mit `w/h = null` reparieren, Apple/Wear sollen ihre Displaymaße beim
  Config-Abruf melden (`DeviceToken.screen_w/h/shape`).
- **fenix5/128-KB unter Dauerlast: OOM bei langer Session + großem Upload** (2026-07-25, Feld-Feedback
  Nutzer-Meldung, fenix 5, App 1.0.64): NICHT der (gefixte) Startup-OOM. Voller Modus crasht über eine aktive
  Session (Accel-Chunk ~12 KB base64 + HTTP/JSON peaken auf 128 KB); GPS-only lief laut Melder deutlich
  stabiler. 1,5-h-Session wurde mehrfach unterbrochen/neu gestartet (vermutl. OOM-Crash+Relaunch bzw.
  Object-Store voll); großer Upload lädt nicht + App-Öffnen crasht (Resume-Peak). Puffer flushen ok
  (GPS 120 s/Accel 60 s), Upload liest Chunks einzeln — also Peak, nicht Leak. **Optionen:** (A) 128-KB-
  Tier auf GPS-only bevorzugen/erzwingen (wie 96 KB, `SessionRecorder._isLowMem`-Schwelle hoch) —
  zuverlässig, verliert aber Pump für 16 Geräte; (B) Voll-Modus härten (kleinere ACCEL_CHUNK_SAMPLES →
  kleinerer Upload-Peak, aggressiveres Flush, Upload-Peak senken) — behält Pump, mehr Aufwand +
  geräteweites Risiko. Braucht Sim-Profiling + lange Repro (nur Jans Mac). Interim-Workaround: FIT aus
  Garmin exportieren → manuell hochladen. Siehe [[garmin-instinct2-lowmem]].
- **Garmin-Lite-App (96-KB-Uhren) polieren** (2026-07-25, Jan): Lite-Build (Instinct-2-Klasse,
  `excludeAnnotations`) läuft + released (1.0.64), aber UX grob: (a) **Display „sehr grob"** auf
  Instinct 176×176 — RecordView-Layout/Fonts für den kleinen Screen tunen (Screenshot vom Sim zum
  Diagnostizieren); (b) **leerer Screen nach Beenden/Upload** (kein Crash, BACK kommt zurück) — der
  Lite-Stop-Flow (`RecordDelegate.onHoldTick (:lite)` → `_rec.stop()` + `_showUploadIfConnected()`)
  zeigt nach dem Upload einen leeren View statt des „Gespeichert"/Idle-Screens; RecordView-Post-Stop-
  Zeichnung im Lite prüfen. Sim läuft nur auf Jans Mac (Details [[garmin-instinct2-lowmem]]).
- **Ground-Truth-Store für Detektor-Verbesserung über Zeit** (2026-07-24, Jan): Nutzer-Feedback wie
  Nutzer-Idee (Sohn filmt ALLE Versuche eines Tages mit Zeiten → Video-Wahrheit der echten Lauf-Start/-Enden)
  systematisch als Ground Truth speichern und damit BEIDE Erkennungen verbessern: (a) die **Uhr-Live-
  Heuristik** (Garmin `SessionRecorder._updateRun`, RUN_ENTER/EXIT — zählt Auslauf < 9 km/h mit → Dauer
  zu lang; Tom bestätigt: SERVER korrekt, nur UHR falsch), (b) den **Server-Detektor** (foil_status →
  foil_model). Vorhandene Infra zum Andocken: `labels`-Tabelle, `pump_truth`, `foil_status.json` +
  `scripts/train_foil_model.py`/`eval_foilstatus.py`, `analyse/`. To do (R&D, Jans OK + Regression):
  Format/Workflow, um pro Session „echte Läufe = [t0–t1,…]" (aus Video) abzulegen + gegen Uhr/Server
  zu evaluieren. **Session eines Nutzers (#881: 3 echte Läufe) + Video:** https://photos.app.goo.gl/2jeUWnUEddbAxgR59
  (von der VM NICHT abrufbar → Zeiten müsste Jan extrahieren/eintragen). Erste konkrete Nutzung: Uhr-
  Run-Exit-Schwelle/Backdating gegen die Video-Zeiten kalibrieren (statt blind — s. 20%-Slow-Rider-Risiko).

- **Upload-Progress / Live-Session prominent (Home + Sessions)** (2026-07-24, Jan): eine noch nicht
  analysierte Session (Status `recording`) taucht heute NIRGENDS auf — die Liste filtert auf
  is_pumpfoil=True. Ziel: prominente Karte GANZ OBEN auf Home + Sessions „Session lädt hoch — GPS ✓,
  N Chunks" mit früher Vorschau, sobald GPS da ist (das interessiert den Nutzer am meisten). Phasen:
  **(1) ✅ erledigt 2026-07-24:** `GET /api/sessions/in-progress` (recording/live des Users, 48h,
  upload_received/total, gps/accel_received, has_gps). **(2) ✅ Web + Android + iOS** (2026-07-24): UploadProgressCard
  auf Home (PersonalHome) + Sessions, Poll 4s/20s, GPS ✓/Chunks/Balken/Stall-Hinweis, Klick→Detail;
  Detail-Screen pollt bei recording/live → 4a lädt seamless nach. NICHT in Community. Versionen sind
  BEREITS gebumpt über den letzten Release (Phone 1.1.14>1.1.13 / Wear 1.2.15>1.2.14 / iOS 1.1.16>1.1.15
  / Garmin 1.0.62>1.0.60, 1.0.61 übersprungen) → heutige Features landen in diesen Versionen, KEIN
  weiterer Bump nötig. Offen: iOS Xcode-Build durch Jan; native fr/it/es/gsw ok, übrige via en-Fallback. **(3) offen (Upload-Pfad, Gerätetest):** Clients senden
  `expected_chunks` beim /session-Start → exakter %-Balken. **(4) ✅ 4a/4b/4c umgesetzt+deployed 2026-07-24
  (server+web, Gerätetest für den Uhr-seitigen Nachzügler-Fall noch offen).** Kernidee: nichts setzt
  eine In-Progress-Session mehr HART auf complete/analyzed → Uhr wirft nichts weg, späte Accel-Daten
  integrieren sich beim späteren regulären /complete. Details:**
  (4a) **Detail-View triggert Analyse:** öffnet man die Detailseite einer In-Progress-Session mit
  vorhandener GPS, soll eine gps_only-Analyse seamless getriggert + nachgeladen werden (heute zeigt
  Detail NICHTS, obwohl GPS da ist).
  (4b) **Nachzügler-Daten integrieren:** kommen zu einer bereits abgeschlossenen/analysierten Session
  später weitere Chunks (Accel), müssen sie integriert + neu analysiert werden (Vervollständigung).
  Ist-Zustand: `ingest.upload_chunk` SPEICHERT späte Chunks (kein Status-Check), stößt aber KEINE
  Re-Analyse an; UND die Uhr räumt lokal auf, sobald `/status` „complete" liefert (onStatus→_cleanup)
  → die restlichen Accel-Chunks werden NIE gesendet. Beide Enden müssen angefasst werden: Server
  re-analysiert bei neuen Chunks; Uhr darf erst löschen, wenn WIRKLICH alles hochgeladen ist (nicht
  schon bei „complete").
  (4c) **Manuelles Finalize** (Button „ohne weitere Daten abschließen") ist die Nutzer-getriggerte
  Sofort-Variante — ✅ gebaut (POST /finalize), aber Wechselwirkung mit 4b beachten (nach Finalize
  räumt die Uhr die Accel weg → dann keine Vervollständigung mehr möglich; ggf. Finalize NICHT als
  hartes „complete" für die Uhr melden).
  Stufe-A-Servergerüst (expected_chunks-Spalte, SessionOut.upload_*) lag schon dormant (Commit
  f9e1f15). Jan-Entscheid: mit Phase 1+2 (sichere Zone) gestartet; 3/4 brauchen Upload-Pfad-
  Gerätetest bzw. Detektor-OK+Regression.
- **Garmin i18n: nl/fi/cs** (2026-07-24) — ✅ **ERLEDIGT**: nl/fi/cs als Spalten 10/11/12 in
  `watch/source/Strings.mc` ergänzt (alle 82 Keys, KI-Übersetzung), `_idxForCode` + `_systemIdx`
  (LANGUAGE_DUT/FIN/CES) + Spaltenkommentar aktualisiert; Spaltenzahl-Check (jede Zeile exakt 13) +
  Compile fenix7xpro/fr55/fenix5 ok. Stale „Fallback: de"-Kommentar ebenfalls korrigiert.
  **OFFEN:** (a) Muttersprachler-Review der nl/fi/cs-Strings (wie bei den anderen KI-Sprachen);
  (b) **Glyph-Check auf echter Uhr/Sim** — cs-Diakritika (ř/ů/ě) könnten in manchen Built-in-Fonts
  fehlen (Tofu); fi (ä/ö) + nl unkritisch. Bei Tofu: betroffene Zeichen meiden/transliterieren.
- **Wear Discard-Screens fehlen** (2026-07-24, Jan, TODO für später): beim Testen der Wear sind die
  neuen Discard-Screens nicht zu finden. Geplant war: je EIN zusätzlicher Screen weiter LINKS **vor**
  dem Stopp-Screen sowie einer weiter RECHTS **hinter** dem Stopp-Screen — am Anfang & Ende der
  Aufnahme-Navigation (Verwerfen-Bestätigung). War Teil der TODOs der abgebrochenen Session. Bei
  **Apple Watch (+ ggf. Garmin) verifizieren**, ob das dort ähnlich gelöst werden sollte / gelöst ist.
- **Natives-Parität-Runde 2026-07-23 (autonomer /loop) — Stand:** ✅ Carve-Anzeige + Tages-Gruppierung
  in Android (compile ok) + iOS (parse ok); ✅ 5 Sprachen pt/ja/zh/ru/id in Android/iOS/Web + Garmin
  pt/id/ru (ja/zh CJK-Glyph-blockiert); ✅ Versionen gebumpt (Phone 1.1.14/30, Wear 1.2.15/1025,
  iOS 1.1.16/20, Garmin 1.0.61); ✅ Android im Emulator visuell verifiziert (Sprachen).
  **Fortsetzung 2026-07-24 (autonomer /loop):** ✅ Apple-Watch Recorder-Status-Strings i18n
  (rec.saving/rec.saved, Commit 95ceef6); ✅ (e) geprüft → **gegenstandslos**: der Foilers-Tab
  (CommunityView/Screen) hat keinen chronologischen Session-Feed zum Gruppieren (nur Stats/Rekorde/
  Medien/„Best bewertet"=Like-Ranking/Spots); der eigentliche Alle-Feed liegt im Sessions-Tab
  (Scope.ALL) und gruppiert bereits (beide Apps rufen `sessions-grouped`). OFFEN:
  (a) **Uploader GPS-first Client-Reorder** — ✅ **Garmin erledigt in v1.0.62** (2026-07-24, Commit,
  Uploader._advance() Phasen :start→:gps→:accel→:final; Compile fenix7xpro ok; Gerätetest durch Jan
  vor CIQ-Release ausstehend). ✅ **Android+Wear erledigt** (2026-07-24, Commit: parallele Uploader,
  chunkFiles GPS-first sortiert via neuem chunkKind()-Datei-Kopf-Read; :app/:wear compile ok;
  Gerätetest ausstehend). ✅ **Apple erledigt** (2026-07-24, Watch Sources/ + iPhone Sources-iOS/:
  kind in Dateinamen chunk-<index>-<kind>.json + chunkKind(), chunkFiles GPS-first sortiert;
  Swift-Parse ok; Xcode-Build+Gerätetest durch Jan). **(a) damit code-seitig auf ALLEN Plattformen
  fertig** — bleibt: Gerätetests (Garmin real durch Jan bestätigt via Session 869; Android/Wear/Apple
  offen); Server+Web waren schon GPS-first (dormant);
  (b) **Stufe B Teil-Accel-Upload** erst
  datenbasiert verifizieren (Task #17: Läufe/Puffer/Start-Erkennung); (c) **Zepp-i18n** (keine Infra,
  0 Nutzer); (d) iOS/Apple xcodegen+Xcode-Build durch Jan. Details Memory [[watch-apps-release-state]].
- **5 neue Sprachen in Apps + Review** (2026-07-23): Web live in pt/ja/zh/ru/id (15 total).
  Offen: (a) Android/iOS-Overlay wie fi/nl/cs nachziehen; (b) Muttersprachler-Review aller 5
  (KI-Übersetzung). pt-Flagge = 🇧🇷 (Brasilien).
- **Tages-Gruppierung in Apps** (2026-07-23): Web bündelt im Alle-Feed + an Spots die Sessions eines
  Nutzers pro Tag/Spot zu einer aufklappbaren Kachel (Server `GET /api/community/sessions-grouped`,
  rein anzeige-seitig, ändert keine Rekorde). Android/iOS nutzen weiter die flache Liste → dort
  nachziehen (gleicher Endpoint). Bei sehr großem Feed später Python-Voll-Scan (Cap 6000) durch eine
  echte Gruppen-Paginierung/Materialisierung ersetzen.
- **Amazfit-Rollout** (2026-07-21, nach Store-Approval): erledigt = /uhr-Tabelle (Zepp-App-Badges),
  Plattform-Subline, Changelog, YouTube-Banner (SUBLINE + volle Breite), Meta/OG/noscript, **Landing**
  (Karussell je Plattform + Amazfit-Screenshots + `watchBody`/`f1Body` in 10 Sprachen), **Pairing-Guide**
  (Amazfit-Sektion, `guide.z.*` in 10 Sprachen). Nebenbei: Landing-Uhr-Sektion auf auto-rotierende
  Karusselle umgebaut, Garmin-Screenshots v1.0.24→v1.0.44 aktualisiert. OFFEN nur noch: (a) Verifikation
  auf echter Amazfit (Balance 2, bisher nur Sim); (b) 25-Hz-Accel (Zepp-API unklar → aktuell gps_only);
  (c) Banner-Bild auf YouTube hochladen (Jan). Memory `zepp-recorder`.
- **Aufnahme nicht automatisch hochladen / Save-Discard** (Feedback 2026-07-19): „session started auto,
  stopped → auto-uploaded. Every other activity has save/discard." Wunsch: (a) optional NICHT automatisch
  hochladen bzw. Save/Discard-Abfrage nach dem Stopp, ODER (b) nur Sessions mit ≥1 erkanntem Lauf hoch-
  laden. Betrifft Garmin-Watch-UX (Monkey C) + evtl. Phone-Recorder. Abwägen: Auto-Upload ist bewusst
  reibungsarm; ggf. Opt-in-Setting „vor Upload fragen". Claude kann Watch bauen.
- ~~Sabfoil-Foils ergänzen (Nutzer-Wunsch 2026-07-13)~~ — schon drin (`foils.json`: LEVIATHAN BLACKBIRD 1400/
  „THE 1350", BLACKBIRD RAZOR 1077). Kein TODO.
- [x] **Max-Speed: Rand-GPS-Spike killen** — ERLEDIGT 2026-07-21: Speed-Rekord war schon 3-s-Max, aber
  ein Doppler-Spike auf dem ERSTEN/LETZTEN GPS-Punkt setzte den Rekord (Median-Filter am Rand blind,
  `mode="edge"`). Fix: Endpunkte gegen Innen-Median clampen (nur runter). Regression: 7/647 Sessions,
  alle Reduktionen (S555 31,8→18,9 etc.), alle 7 reanalysiert + persistiert. Changelog-Eintrag live.
  OFFEN bleibt der separate **Positions-Ausreißer-Filter** (5000-km-Sprünge, verfälscht Distanz) →
  eigener Inbox-Punkt unten.
- **Android: Stats pro Lauf + Foil in Community** (Feedback Tom 2026-07-20): (a) in der Session-Detail
  der App zeigt „einen Lauf auswählen" weiter die Gesamt-Stats (kein Puls/Kadenz je Lauf) — Web kann's,
  App nicht → Parität. (b) In der Community-Liste der App fehlt das benutzte Foil (Web zeigt es). Beides
  Android(/iOS)-Port.
- [x] **Uhr-Sprache + Default Englisch** — ERLEDIGT 2026-07-21 (Feedback Laurent): Ursache war der
  harte `de`-Default in der ganzen Kette (`User.language` default, `_clean_lang`, Web-i18n-Fallback,
  `/config`). Umgestellt auf **Englisch als Default** (deutsche Browser/Geräte bleiben per Detection
  Deutsch). `/api/devices/config` sendet bei ungesetzter Sprache jetzt `""` → Uhr weicht auf
  `System.getDeviceSettings().systemLanguage` aus (Mapping+EN-Fallback in `Strings.mc` existierte
  schon; kein Uhr-Rebuild). Bestehende Nutzer mit explizitem „de" unberührt.
- **FIT-Import: record-Level-IMU (accel_xyz/gyro_xyz/mag_xyz) lesen** (Befund 2026-07-19, FoilMotion-FIT
  von Markus). Aktuell liest `fitimport.parse_fit_bytes` Accel nur aus `accelerometer_data`-Messages
  (SensorLogging). FoilMotion & Co. schreiben die IMU aber als **Developer-Felder pro `record`** →
  unser Import wertet solche FITs als **GPS-only** (kein Pump-Modell!), obwohl volle 25-Hz-Daten drin
  sind. TODO: `accel_xyz` (sint8, ×64 mg, 75 Werte = 25 Hz × 3 Achsen interleaved) extrahieren →
  in unser int16-Format (2048/g) wandeln (Faktor ≈ ×131,072) → als Accel-Chunks ablegen, dann läuft
  unsere Pump-Erkennung. Bonus als Ground Truth/Training: `gyro_xyz` (×16 °/s, 25 Hz — neuer Kanal!),
  `mag_xyz` (×16 mGauss, 5 Hz), `foil_status`/`water_detected` pro record, `run_pumps`/`run_pump_rate`
  je lap, `total_pumps`/`total_on_foil`/`total_off_foil` je session. Import-/Detektor-Änderung → Jans OK.
  Verwandt: [[board-imu-experiment]] (Gyro!), `pump-groundtruth`.
- **fenix 5 → Sparsam-Default beim Pairing** (2026-07-19, WARTET auf Nutzer-Bestätigung): Melder
  (fenix 5, FW 25.00, Part 006-B2697-00) crasht beim Session-Start mit IQ!-Logo — 128-KB-Klasse
  wie FR55; Session #719 war 25-Hz-getaggt aber gps_only (Accel kam nie an). Nutzer testet gerade
  `lite`. Bestätigt sich das: fenix-5-Familie in `_LOW_ACCEL_MODEL_HINTS` (server/app/api/devices.py)
  aufnehmen → record_mode wird beim Pairing automatisch auf lite gekappt (wie FR55). Dabei prüfen,
  welche 5er-Varianten (5/5S/5X, Plus?) betroffen sind — Speicherlimits je Device-File checken.
- [x] **GPS-Positions-Ausreißer filtern** — ERLEDIGT 2026-07-21: `_repair_spikes` fing schon innere
  Einzelpunkt-Spikes (kam nach der Notiz) → keine Session hatte verfälschte Distanz. Restlücke
  geschlossen: neuer `_fill_invalid_coords`-Vorfilter ersetzt ungültige Koords (|lat|>90/|lon|>180,
  z.B. (180,180)-Sentinel) durch den nächsten gültigen Nachbarn — auch am ERSTEN/LETZTEN Punkt +
  aufeinanderfolgend (S591-Randpunkt). Regression: 0 Distanz-Änderungen; S591 reanalysiert.
- [x] **Spot-Ortszeit in die Apps** — ERLEDIGT 2026-07-18: Android (TimeFmt.kt, 7 Modelle + alle
  Session-Screens inkl. Compare) + iOS (TimeFmt.swift, 7 Structs + Listen/Detail/Rekorde/Compare).
  Bewusst Betrachter-Zeit geblieben: Chat, Wetter, Verlauf-Chartachsen; Transfers ohne Server-tz.
- [x] **Neue Rekord-Kacheln in die Apps** — ERLEDIGT 2026-07-19: Android + iOS zeigen alle 11
  (inkl. Early Bird/Night Owl in Spot-Ortszeit, mod-24h); i18n row+fi+nl beidseitig.
- [x] **Niederländisch (nl) in die Apps portieren** — ERLEDIGT 2026-07-18 (6e8cfea): Overlays
  Android (545 Keys) + iOS (526 Keys), Picker „Nederlands", Diktat nl-NL (+ fi-FI-Diktat-Fix).
  Wear bleibt bei 7 Sprachen (nl→de), wie fi. OFFEN nur: Muttersprachler-Review nl (+ fr/it/es/fi).
- [x] **Mehrere Videos pro Session: App-Parität** — ERLEDIGT 2026-07-18 (Android + iOS: Video-Liste
  im Medien-Grid, Verlinken/Löschen über die neuen `/videos`-Endpoints, Fallback alter Server).
- **Feature-Flags systematisch statt Sammel-`beta`** (2026-07-16): aktuell liefert der Server
  `profile.beta=true` hart für alle → jeder ist Betatester (öffnete Phone-Recorder ohne Release).
  `beta` ist damit vorerst **nicht** für echte, nicht-öffentliche Beta-Features nutzbar. Reihenfolge
  zum Wieder-Freibekommen (WICHTIG, sonst verschwindet der Recorder bei allen):
  1. [x] **ERLEDIGT 2026-07-18:** Phone-Recorder hängt in Android+iOS NICHT mehr an `beta` (nur noch
     lokaler Toggle `phone_rec_enabled`; „(Beta)"-Label entfernt). Kommt mit Android 1.1.13/iOS 1.1.15.
  2. Warten, bis praktisch alle dieses Update haben (~4 Wochen nach Golive).
  3. Erst dann `beta=false` für alle setzen und `beta` (bzw. je Feature ein eigenes Flag) für echte
     private Beta-Features + gezielte Tester (`BETA_USER_IDS`) wiederverwenden.
  Siehe Memory `beta-flag-public`.
- **Gleitphasen-Rekord „mit Weiterfahrt"** (Nutzer-Feedback #29, 2026-07-16 gemerkt): Glides mitten
  im Lauf getrennt von End-Glides werten (der End-Glide vor dem Absteigen ist eh immer der längste).
  R&D/Detektor → Jans OK nötig. Nicht jetzt.
- **Partielle Accel-Daten** (Nutzer-Feedback #34, FR55): Session hat Accel bis ~Sek. 650, danach nichts —
  Analyse behandelt alles als accel-los. Abschnittsweise Behandlung = Detektor-Änderung, Jans OK.
  Verwandt: fr55-accel-truncation Ebene 2. Für später gemerkt (2026-07-16).
- ~~Läufe zusammenführen (Nutzer-Feedback #14/18/20)~~ — laut Jan durch die mehrfachen Detektor-Verbesserungen
  (Re-Arm-Cooldown, End-Verlängerung, NOSTOP) vermutlich obsolet.
- **Öffentliche Session-Teilen-Links** (Community-Wunsch Dominik/Pixelfoil, 2026-07-15): unguessbarer
  Token-Link → vollständige Session-Detailseite ohne Login/Registrierung. Spec (Jan, festgelegt):
  - **Nur für EIGENE Sessions** erzeugbar; `share_token` je Session (nullable), vom Besitzer erzeugbar +
    **widerrufbar**. Öffentliche read-only Route `/s/<token>` (Web) + Server-Endpoint ohne Auth, der NUR
    diese eine Session über den Token liefert (kein Zugriff auf Liste/Community/andere Konten).
  - **Alles sichtbar, KEINE Optionen/Teil-Verbergen:** Puls, Pumps, Position, Track/Karte, Segmente,
    Bilder (Preview **und** Fullscreen — `/media` ist eh öffentlich, Zufalls-UUID), YouTube (click-to-load),
    Bezeichnung/Caption, Besitzer-Name + Profilbild, Spot, Datum, Stats.
  - **Owner-only Aktionen im öffentlichen View AUSBLENDEN:** Editieren (Caption/YouTube), Foil setzen,
    Trimmen, Labeln/Pump-Tap, Löschen, Zusammenführen/Auflösen, Übertragen, Melden/Vote, Like-Button,
    Vergleich-Hinzufügen, Foto-Upload/-Löschen, Spot-Chat-Button, Rohdaten/Labeling-Zugriff.
  - **Prüfen:** `device_model`/`device_label` (interne Fehlersuche-Felder) im öffentlichen Payload
    besser WEGLASSEN — sind keine „Ride-Daten". Sonst nichts tracken, kein Dritt-Skript.
  - Server additiv (neue Spalte + 1 Endpoint), Web = bestehende Detailansicht read-only rendern; Teilen-
    Button in Apps später nachziehen. Jan erwägt es (noch nicht „bau's").

- **🟢 Wear OS: Puls kommt auf manchen Uhren NIE an — GEBAUT als 1.2.22/1032, wartet auf Jans Upload.**
  Meldung u171 (Xiaomi Watch 2 Pro) 15.08.: „wird die Herzfrequenz immer noch nicht ausgelesen …
  wobei es einen Abend kurz funktioniert hat". Belegt (rein lesend ueber alle Wear-Sessions,
  `app_version like '1.2.%'`, n=64):
  | Nutzer | Uhr | Sessions | davon mit Puls |
  |---|---|---|---|
  | u171 | **Xiaomi Watch 2 Pro** | 11 | **0** |
  | u188 | SM-L300 (Galaxy Watch) | 8 | 4 |
  | u55 | SM-L300 | 6 | 3 |
  | u262 / u145 / u210 / u36 / u258 / u239 / u93 / u47 / u78 | Samsung + Pixel | je 1-10 | **alle vollstaendig** |
  (u6/u2 = Emulator, 0 Puls, erwartbar.) Also **geraeteabhaengig**, kein genereller Bug — und bei
  Samsung **teilweise**, was die Ursache verraet.
  **Ursache (Code):** `RecorderService.registerSensors()` haengt sich mit
  `sensors.registerListener(TYPE_HEART_RATE, SENSOR_DELAY_NORMAL)` an den ROHEN Android-Sensor.
  Das ist auf Wear OS 3+ ein Mitlesen dessen, was das System ohnehin gerade misst — es **schaltet
  die PPG-LED nicht ein**. Wo die Dauermessung der Uhr an ist (Pixel/Samsung-Standard), kommen
  Werte; wo der Hersteller sparsam misst (Xiaomi), kommt stunden-lang nichts, und „einen Abend kurz"
  = eine zufaellige Hintergrund-Stichprobe fiel in die Aufnahme. Die Samsung-Nutzer mit 4/8 bzw. 3/6
  sind derselbe Effekt.
  **Fix:** `androidx.health.services.client` — `MeasureClient.registerMeasureCallback(
  DataType.HEART_RATE_BPM, …)` (oder `ExerciseClient`) fordert die Messung aktiv an; das ist der von
  Google fuer Wear OS 3+ vorgesehene Weg. SensorManager als Fallback stehen lassen. Manifest passt
  schon (`BODY_SENSORS`, `FOREGROUND_SERVICE_HEALTH`, `foregroundServiceType="location|health"`).
  **Zusaetzlich (Regel „Berechtigungen/Sensoren nie stumm scheitern"):** kam in der ganzen Aufnahme
  **kein einziger** Puls-Wert an, sagt der Screen nach dem Stopp das jetzt (`rec.hrNone`, amber,
  13 Sprachen) — parallel zu `rec.noGpsSaved`. Der Hinweis aus 1.2.19 (`cc88e1c`) deckt nur die
  *fehlende Berechtigung* ab und greift bei u171 gerade nicht: die ist erteilt, der Sensor schweigt.
  **UMGESETZT 16.08. als Wear 1.2.22/1032** (1.2.21/1031 lag beim Fund schon in der Play-Pruefung):
  - `RecorderService.startHeartRate()`: `ExerciseClient` mit `ExerciseType.WORKOUT` und nur
    `HEART_RATE_BPM` (GPS macht weiter Fused, Auto-Pause aus). Scheitert es (keine Health Services,
    andere App haelt eine Uebung, kein Sensor), bleibt der rohe Sensor -> nie schlechter als vorher.
    Solange Health Services liefert, hat es Vorrang, sonst wuerde ein alter passiv mitgelesener
    Wert den frischen ueberschreiben.
  - `Recorder.State.hrSamples` zaehlt die angekommenen Werte — Grundlage fuer den Hinweis.
  - **Zwei Abhaengigkeits-Fallen, beide gemessen statt geraten:** `androidx.health:health-services-client:1.0.0`
    zieht guava nur zur LAUFZEIT nach, deshalb fehlt `ListenableFuture` sonst im Compile-Classpath.
    Der naheliegende Umweg ueber `com.google.guava:listenablefuture:1.0` scheitert an
    `checkDebugDuplicateClasses` (guava enthaelt dieselbe Klasse). Richtig ist
    `implementation("com.google.guava:guava:31.1-android")` — genau die Version, die health-services
    selbst mitbringt. Gegenprobe, welche guava-Klassen wirklich gebraucht werden (aus dem AAR
    gegrept): `Futures`, `SettableFuture`, `MoreExecutors`, `Preconditions`, `Function`,
    `FutureCallback`, `ListenableFuture` — guava rauswerfen und nur den Stub liefern geht also NICHT.
  - **Preis: Release-AAB 5,82 -> 7,17 MB (+1,35 MB, +23 %)** — das ist die Zahl, die zaehlt
    (`:wear:bundleRelease`, gemessen gegen einen sauberen Worktree auf dem Stand davor). Das
    unsignierte Release-APK waechst 15,97 -> 19,38 MB, aber hochgeladen wird das Bundle. `isMinifyEnabled = false` im Release-Block ist der Grund, dass guava ungeschrumpft
    mitfaehrt — R8 einzuschalten wuerde das Meiste zurueckholen, ist aber nichts, was ohne Test auf
    einer echten Uhr in eine Einreichung gehoert. Eigener Punkt weiter unten.
  - Verifiziert: `:wear:compileDebugKotlin`, `:wear:assembleDebug` und **`:wear:bundleRelease`**
    gruen (der Upload-Weg ist also frei). Nur `assembleRelease` scheitert an `lintVitalRelease`
    (`InvalidFragmentVersionForActivityResult`, weil `play-services-location`
    `androidx.fragment:1.1.0` mitbringt) — das ist **VORHER schon so** (im Worktree auf dem Stand
    davor identisch nachgestellt) und betrifft das Bundle nicht.
  **Zweitwirkung:** ohne Puls ist `analysis/sportauto.py` blind — die
  Regel faellt dann auf „Tempo >= 19 km/h" zurueck, und Pumpfoil-Tempo erreicht das nie. Genau
  deshalb lief die Skate-Session u171/#2149 (naechster Punkt) unbeanstandet als Pumpfoil durch,
  obwohl ihr laengster „Lauf" 743 s hatte (Schwelle 240 s).

- **🟡 Erkennung kann Skateboard nicht von Pumpfoil trennen — belegt an u171/#2149 (15.08.).**
  Meldung: „Ich war eine Runde skaten und habe die App testweise laufen lassen … in die restlichen
  Daten dichtet das Model dann Pumps rein. Theoretisch muesste ich ewig lange Glides haben aber die
  Kadenz wird immer noch mit 83 AVG Pump angegeben." **Stimmt** — gemessen, rein lesend:
  #2149 (Penny-Board, „Hoenow 2"): 26,3 km, **47 Laeufe**, 5925 s Foil-Zeit, **8173 Pumps**,
  Kadenz 1,379 Hz = **83 ppm**, laengster Lauf 743 s. 2636 von 3805 Accel-Fenstern = `pump`.
  Ein 532-s-Stueck wurde als Fremdkraft vorgeschlagen (er hat es per „behalten" zurueckgeholt,
  `fremdkraft_keep=[[703853,1235836]]`) — das ist das „ein paar Runs als Powered Ride" aus seiner
  Meldung. Der Rest lief als Pumpen durch.
  **Warum es nicht auffaellt — der Vergleich mit SEINEN echten Foil-Sessions ist das Problem:**
  | | #2149 Skate | #2135 Foil | #2006 Foil | #1814 Foil |
  |---|---|---|---|---|
  | Kadenz | 1,38 Hz | 1,52 | 1,52 | 1,56 |
  | Median dom_freq der Pump-Fenster | 1,50 Hz | 1,25 | 1,25 | 1,50 |
  | RMS der Pump-Fenster (Median) | 0,261 g | 0,161 | 0,167 | 0,196 |
  | Ø-Tempo | 3,65 m/s | 3,75 | 3,61 | 3,58 |
  | laengste Gleitphase je Lauf (Median) | 1,72 s | 1,42 | 1,29 | 1,31 |
  Das Skaten liegt in **jedem** Merkmal innerhalb seiner echten Pumpfoil-Sessions — bei der
  Amplitude sogar **darueber**. Auf Handgelenk-Accel + GPS ist das dieselbe Klasse Problem wie
  Wing/Wake/Wakethief (s. Memory `detector-negative-examples`): abschiessen laesst sich das nur
  ueber Kontext, nicht ueber das Bewegungssignal.
  Seine Erwartung „ewig lange Glides" geht ins Leere, weil `longest_glide_s` die laengste Luecke
  zwischen zwei ERKANNTEN Pumps ist (docs/DATA-PIPELINE.md) — beim Rollen erkennt das Modell
  weiter Pumps, also wird die Luecke nie lang.
  **Kandidaten (nichts davon ohne Jans OK):**
  1. **Wasser-Gate**: `place_water` ist bei allen drei Sessions `NULL` — der Wasserflaechen-Check
     laeuft dort gar nicht. Ein Landspot als weiches Signal (Hinweis, nicht Ausschluss) waere die
     einzige Trennung, die hier ueberhaupt greift.
  2. `sportauto`-Regel „langer Lauf ohne Puls" schaerfen — braucht aber zuerst den Puls (Punkt oben).
  3. Nichts tun und es als bekannte Grenze dokumentieren: Peter hat die Session selbst korrekt auf
     `sport_class='other'` + `data_quality='test'` gesetzt, sie faellt aus allen Auswertungen raus.
     Das System hat also funktioniert — nur eben erst durch den Menschen.

- **🟡 Wear-Release laeuft ohne R8 (`isMinifyEnabled = false`) — kostet jetzt messbar Groesse.**
  Aufgefallen beim Puls-Fix (s. o.): guava faehrt ungeschrumpft mit, Release-AAB 5,82 -> 7,17 MB
  (unsigniertes APK 15,97 -> 19,38 MB).
  Mit R8 waere davon fast nichts noetig (health-services braucht 7 guava-Klassen). Nicht ohne Test
  auf einer echten Uhr einschalten — die App baut JSON von Hand (`org.json`), Compose/AndroidX
  bringen ihre Keep-Regeln selbst mit, das Risiko ist ueberschaubar, aber ein R8-Schaden faellt
  erst zur Laufzeit auf. Vorschlag: nach dem naechsten Release einmal mit `isMinifyEnabled = true`
  bauen, auf Jans Uhr durchspielen (Aufnahme, Pairing, Upload, Layouts), dann dauerhaft an.
  Nebenbefund aus derselben Messung: `:wear:assembleRelease` scheitert am Lint-Check
  `InvalidFragmentVersionForActivityResult` (`play-services-location` bringt `androidx.fragment:1.1.0`,
  gebraucht wird >= 1.3.0). Besteht schon vor dem Puls-Fix; Fix waere ein expliziter
  `androidx.fragment:fragment:1.8.x`-Eintrag.

- **🟢 Lauf-Canary: jeder Absturz meldet sich jetzt — Garmin 1.0.77, live.** Anlass 16.08.: einem
  Nutzer ist die **Forerunner 55 mit „IQ!" abgestuerzt** (er hat es Jan am Spot erzaehlt, danach auf
  „nur GPS" umgestellt). Bei uns kam davon **nichts** an. Nachgesehen, rein lesend:
  `layout_canary_count` und `storage_full_count` stehen bei seiner Uhr auf 0 — und bei **allen zwoelf
  Forerunner 55 im Bestand**. Kein Zufall, sondern der Bau: die beiden bestehenden Marken decken je
  einen engen Fall ab (Layout anwenden, Layout waehrend der Aufnahme) und sind ausserdem `(:full)`.
  Im Lite-Build der speicherarmen Uhren — also genau dort, wo Abstuerze am wahrscheinlichsten sind —
  gab es ueberhaupt keine Selbstmeldung. Wir waren blind fuer die haeufigste Absturzklasse.
  **Gebaut statt eines dritten Sonderfalls: eine generische Marke.** `run_canary` liegt vom App-Start
  bis zum sauberen Ende und traegt die PHASE (1 App-Start · 2 Leerlauf · 3 Aufnahme · 4 Upload).
  `FoilApp.onStop` loescht sie; stirbt die App vorher, liegt sie beim naechsten Start noch da und
  geht mit dem naechsten `/config` als `?crash=<phase>` raus. Geschrieben wird nur beim
  PHASENWECHSEL — ein paar Storage-Writes pro Lauf, keiner pro Frame. Kein `(:full)`, gilt also auch
  im Lite-Build. Server: `device_tokens.crash_count/crash_phase/crash_at`, entprellt wie `sf`
  (ein App-Start schickt zwei Config-Abrufe mit demselben Flag), in der Geraeteliste ausgegeben.
  **Bewusst NUR Diagnose** — anders als der Layout-Canary haengt keine Abschaltung daran. Eine Uhr,
  die `onStop` nicht zuverlaessig ruft, wuerde sich sonst selbst Funktionen abklemmen; erst wenn die
  Zahlen ueber mehrere Wochen plausibel aussehen, darf man daraus etwas ableiten.
  Verifiziert: `build-all.sh` 121/121 gruen (beide Varianten), Migration gelaufen, Endpunkt-SQL
  gegen eine leere Zeilenmenge geprueft. **Uhr ist damit sofort live** (`watch/bin`), Store-Paket
  fuer Jan bei Bedarf. Aussagekraeftig wird es erst, wenn genug Uhren auf 1.0.77 sind.
  **Offen:** erste Auswertung in ~2 Wochen — welche Modelle melden, in welcher Phase. Und die Frage
  an den Nutzer, ob sein Absturz auf der alten 1.0.60 passierte: der Low-Memory-Fix fuer genau diese
  Geraeteklasse (FR55/245/645/935, fenix 5/6, Instinct 3/E) kam mit **1.0.65**, seine Session davor
  lief auf **1.0.60** — dann waere „nur GPS" gar nicht noetig gewesen.

- **🔴 VERDACHT: speicherarme Garmin-Uhren liefern seit Mitte August nichts Brauchbares mehr.**
  Aufgefallen 16.08. beim Nachgehen der FR55-Absturzmeldung. Anteil brauchbarer Sessions (>100 m)
  je Modell, **ab 13.08.**, nur Modelle mit mindestens 3 Sessions:
  | Modell | brauchbar |
  |---|---|
  | Instinct 2 / Solar / Dual Power | **0 / 5 (0 %)** |
  | Forerunner 55 | **1 / 9 (11 %)** |
  | Instinct 3 Solar | 2 / 6 (33 %) |
  | Forerunner 945 | 3 / 6 (50 %) |
  | Forerunner 265 | 5 / 8 (62 %) |
  | Forerunner 745 | 2 / 3 (67 %) |
  | fenix 7X Pro | 6 / 8 (75 %) |
  | fenix 7X / tactix 7 | 12 / 15 (80 %) |
  | fenix 7 / quatix 7 | 8 / 9 (89 %) |
  | fenix 6X Pro · 6S Pro · FR970 · fenix 8 | **je 100 %** |
  Ein sauberer Verlauf entlang der Geraeteklasse — unten 0 %, oben 100 %.
  **Dieselben Geraete liefen VORHER:** Philipps FR55 13 von 16 brauchbar (Ø 645 m, 14.-29.07.),
  Tatus FR55 5 von 6 (Ø 1276 m), Nathans Instinct 2 4 von 8 (10.-12.08.). Es ist also kein
  „die Uhren koennen das noch nie", sondern eine Verschlechterung.
  **Symptom:** Session wird am Server registriert, dann kommt nichts mehr — 0 bis 1 Chunk, keine
  Abschlussmeldung, und der Nutzer startet kurz darauf erneut (Philipp 15.08.: fuenf Starts in
  einer Stunde, alle leer). Das passt zu einem Absturz UNMITTELBAR nach dem Start und deckt sich
  mit dem, was Philipp am Spot erzaehlt hat („IQ!").
  **Was NICHT die Ursache ist:** der Aufnahmemodus. Die beiden auffaelligsten Geraete stehen auf
  „nur GPS", die beiden anderen auf „full" — es trifft alle vier. Die Umstellung auf GPS-only war
  die Reaktion der Nutzer auf das Problem, nicht sein Ausloeser.
  **NACHGEMESSEN 17.08. — es sind ZWEI Ursachen, und die eine ist belegt.** Der Verdacht „1.0.75"
  ist damit vom Tisch; die GNSS-Stufe ist unschuldig.

  **(A) Die 128-KB-Klasse ist aus dem Speicher gewachsen — das ist die Regression.**
  Nachgebaut wurde die FR55 aus acht alten Staenden (Worktree, `watch/bin` unangetastet):
  | Version | Build | frei von 131 072 B |
  |---|---|---|
  | 1.0.60 | 58 508 B | **72 564 B (55 %)** |
  | 1.0.65 | 85 596 B | 45 476 B |
  | 1.0.70 | 95 276 B | 35 796 B |
  | 1.0.73 | 100 236 B | 30 836 B |
  | 1.0.75 | 102 748 B | 28 324 B |
  | 1.0.77 | 105 052 B | **26 020 B (20 %)** |
  Der volle Build hat sich seit 1.0.60 fast **verdoppelt**, der freie Heap ist auf ein Drittel
  gefallen. Kein einzelner Commit, sondern das stetige Wachstum — deshalb passte kein Datum.
  **Der saubere Einzelbeleg:** Geraet #136 (FR55, u5) ist dieselbe physische Uhr durchgehend —
  Juli 13 von 16 Sessions brauchbar · 14.08. auf 1.0.60 noch 1 von 1 (18 Chunks, 412 m) · ab
  15.08. auf 1.0.76 **0 von 6**, davon drei ganz ohne Session-Ende, fuenf Starts in einer Stunde.
  Gleiche Uhr, gleicher Nutzer, 24 Stunden Abstand, einziger Unterschied die Version.
  **Die ganze Klasse ist betroffen, nicht nur die FR55.** 13 Geraete haengen bei 131 072 B auf dem
  VOLLEN Build mit 23–25 kB Luft (am engsten Venu Sq 22 996 B, dann Enduro, fenix 6/6S, FR245/645/
  935, fenix 5/5S, vivoactive 3, FR55). Von den 7 aktiv gepairten Uhren dieser Klasse haben **4 in
  ihrem ganzen Leben null Sessions** produziert (2x fenix 5, fenix 6, Venu Sq — letztere noch am
  16.08. gesehen), die drei FR55 liefern seit Mitte August nichts mehr. Ein stiller Totalausfall.
  **Gegenprobe Lite-Build (gemessen, nicht geschaetzt):** fr55 60 956 B → **70 116 B frei**,
  venusq 62 844 → 68 228, fenix6 61 852 → 69 220. Das ist ziemlich genau der Stand von 1.0.60,
  der nachweislich lief.

  **(B) Die Instinct-2-Klasse ist ein ANDERES Problem — nicht Codegroesse.** Der Lite-Build hat sie
  geschuetzt: 1.0.60 58 796 B → 1.0.77 61 244 B, die Luft blieb bei 37–40 kB. Sie war auch schon im
  Juli schlecht (1 von 7 brauchbar, 23.07.–11.08.) — also keine Regression, sondern Dauerzustand.
  Zwei der drei Geraete melden `storage_full` (#507 3x/148 kB, #462 2x/158 kB) → das ist der
  bekannte Speicher-voll-/Rueckstau-Fall oben, nicht dieser hier. Instinct 3 Solar liegt dazwischen
  (46 kB frei, 25 % brauchbar) und braucht eigene Daten.

  **Was der Fix kostet — Entscheidung Jan.** Lite fuer die 128-KB-Klasse streicht Pausen-/Aktions-
  Menue, die 13-Sprachen-Tabelle (faellt auf Englisch) und den Layout-Renderer. Der Renderer ist
  dort ohnehin nur auf ausdrueckliche Anforderung aktiv (`LAYOUT_MIN_ON_REQUEST` = 131 072, bewusst
  so wegen Jans fenix 5) — der Kommentar in `devices.py:242` nennt diese Klasse schon selbst
  „die Absturz-anfaellige". Sauberer waere eine DRITTE Stufe: nur den Renderer und die
  Sprachtabelle ausschliessen, Menues behalten. Dazu muessten die heute gemeinsamen `(:full)`-
  Annotationen aufgeteilt werden (z. B. `(:layouts)` + `(:i18n)`) — echte Arbeit, aber ohne
  sichtbaren Funktionsverlust. **Nicht ohne Jans OK bauen:** jeder `build-all.sh`-Lauf ist sofort
  live (121 Direkt-Downloads).

  Der Lauf-Canary aus 1.0.77 bleibt trotzdem der Gegenbeweis — er nennt die PHASE. Stand 17.08.:
  erst **2 von 115** Garmin-Uhren sind auf 1.0.77, **0 Meldungen**. Aussagekraeftig in ~2 Wochen.
  Betroffene Nutzer sind bekannt — eine gezielte Nachfrage bringt schneller Klarheit als Statistik.

- **🟢 GNSS-Stufe je Uhr einstellbar (Garmin 1.0.77) — Jans Vorgabe 16.08.: „mehr Satelliten
  kosten Akku".** Seit 1.0.75 fordert die Uhr die BESTE unterstuetzte Stufe an; am 13.08. war das
  bewusst ohne Akku-Abwaegung entschieden („auf jeden Fall die best moegliche GPS-Erkennung").
  Alle Systeme gleichzeitig kosten aber spuerbar Strom, und die Abwaegung haengt am Geraet und am
  Fahrer — eine Instinct mit 20 h Laufzeit ist etwas anderes als eine fenix 8. Deshalb jetzt
  einstellbar **je Uhr**, genau wie der Aufzeichnungsmodus, mit unveraenderter Voreinstellung.
  Vier Stufen (`device_tokens.gnss_mode`, NULL = `best`):
  | Wert | was angefordert wird |
  |---|---|
  | `best` | ganze Kette inkl. zweitem Band L1+L5 — Voreinstellung, Verhalten seit 1.0.75 |
  | `l1` | alle Systeme, aber ohne L5 (das zweite Band ist der groesste Einzelposten) |
  | `two` | GPS + EIN weiteres System |
  | `gps` | GPS allein (SDK-Standard, sparsamste Stufe) |
  Die Rueckfallkette bleibt in jeder Stufe erhalten: lehnt das Geraet die gewuenschte Stufe ab,
  geht es nach unten weiter bis zum ueberall gueltigen Standardaufruf. Eingestellt wird ein
  OBERES LIMIT, keine Garantie — auf einer Uhr, die nur GPS+GLONASS kann, ist `best` genau das.
  Weg wie beim Aufzeichnungsmodus: `PUT /api/devices/<id>/gnss-mode`, Auslieferung ueber
  `/config` als `gnssMode`, Auswahl im Konto unter „Uhren" (nur Garmin — nur dort waehlt die App
  die Stufe selbst). Aenderung greift **sofort**, nicht erst beim naechsten Start: der naechste
  Config-Abruf ruft `enableGps()` neu. Uhren vor 1.0.77 ignorieren den Schluessel.
  Verifiziert: `build-all.sh` 121/121, `npm run build` gruen (der Light-Mode-Waechter hat einen
  doppelt gekippten slate-Ton in meiner neuen Zeile gefunden — behoben), Migration gelaufen,
  Geraeteliste liefert `gnss_mode` (an Philipps FR55 read-only geprueft: `best`).
  **Offen:** Was die Stufen wirklich an Akku sparen, wissen wir NICHT — dafuer fehlt uns jede
  Messung, die Uhr meldet keinen Ladestand. Die Texte behaupten deshalb nur „mehr Systeme =
  mehr Akku", keine Prozentzahlen. Wer es genau wissen will, muss zwei gleiche Sessions fahren.

- **🟢 Zusammenfuehren erzeugte Waisen-Dubletten bei Doppelklick — BEHOBEN 13.08. (`e7c02f4`), 16.08. am Bestand nachgeprueft.**
  Meldung Jeroen 13.08. („i am missing a lot of runs"). Kein Datenverlust, aber ein echter Fehler.
  Belegt, rein lesend:
  | Session | uuid | Laeufe | Distanz | Stand |
  |---|---|---|---|---|
  | #1900 | d1438197… | 2 | 864 m | deleted, `merged_into=1910` |
  | #1907 | 25e4ab87… | 8 | 5991 m | deleted, `merged_into=1910` |
  | #1908 | **merge-**fd442679 | 10 | 6855 m | lebt, `merged_into=NULL` |
  | #1909 | **merge-**bb4fb74d | 10 | 6855 m | lebt, `merged_into=NULL` |
  | #1910 | **merge-**68d39593 | 10 | 6855 m | lebt, `merged_into=NULL` |
  Zeitstempel der drei: 20:08:18, 20:08:44, 20:09:39 — er hat dreimal geklickt, weil nichts zu
  passieren schien. **Jeder Klick legt eine neue Ergebnis-Session an**, und die Quellen zeigen am
  Ende nur auf die LETZTE. #1908 und #1909 sind damit Waisen: vollstaendige Kopien, auf die nichts
  mehr verweist und die kein Aufraeumen je findet. Fuer den Nutzer sieht es aus, als seien seine
  beiden Originale verschwunden und stattdessen dreimal dasselbe da — genau seine Meldung.
  **Der Fix war schon da — ich hatte ihn beim Schreiben dieses Punktes uebersehen.** `e7c02f4`
  (13.08.) sperrt die Quellzeilen mit `FOR UPDATE` und liefert dem zweiten Aufruf das Ergebnis des
  ersten; die Ursache (der zweite Aufruf sah die Quellen noch als "nicht gemergt", weil die erste
  Transaktion ueber die ganze Reanalyse offen ist) steht dort im Docstring, samt genau dieser drei
  Zeitstempel. Es gibt hier also KEINEN Code mehr zu reparieren.
  **Gegenprobe am Bestand (16.08., rein lesend):** 54 Merge-Sessions insgesamt, davon **genau 2
  Waisen** — #1908 und #1909, beide von u48, beide vom 11.08., also VOR dem Fix. **Null Waisen
  nach dem 13.08.** Der Fix haelt.
  **Offen bleibt nur der Altbestand:** die beiden Kopien leben (`is_pumpfoil`, `data_quality=ok`,
  `detection=model`) und zaehlen dreifach in Bestenlisten und Statistik — u48 steht dort mit 9
  Sessions / 70 Laeufen / 3920 Pumps statt mit 7 / ~50 / ~2600. Einen Rekord haelt keine davon
  (bester Lauf 269 m, 5,09 m/s). **NICHT angefasst:** es sind seine Daten. Er ist informiert und
  kann selbst zwei loeschen (Antwort 16.08. unter meinem Konto); fremde Sessions ungefragt
  aufzuraeumen waere seine Entscheidung, nicht unsere.

- **🟢 Karte schluckte Tasten auf der ganzen Seite — BEHOBEN 17.08.** Meldung PeterH (Firefox, PC):
  nach einem Klick auf einen Spot in der Kartenansicht liessen sich im Chat **`-` `_` `+` `*` `6` `&`
  und die Pfeiltasten** nicht mehr tippen; Einfuegen ging weiter, ein Reload half, und die Ziffern
  des Num-Blocks funktionierten auch. Zusaetzlich reagierte die **`6` nicht mehr fuer die
  Lauf-Auswahl** einer Session. Eine praezisere Fehlermeldung kann man kaum bekommen.
  **Ursache:** Leaflets Tastatur-Handler registriert seinen `keydown`-Listener am **`document`**
  (bei Fokus auf dem Kartencontainer) und entfernt ihn erst beim Blur. Beim Unmount feuert kein
  Blur — und **keine unserer fuenf Karten hat die Leaflet-Instanz je zerstoert** (`Spots`,
  `Labeling`, `CompareMap`, `SpotProgression`, `SessionDetail`, alle ohne `map.remove()`). Der tote
  Listener lebte weiter und verschluckte seine Tasten ueberall, auch in Eingabefeldern.
  Peters Tastenliste ist der Fingerabdruck: Leaflet hat `zoomIn [187,107,61,171]`,
  `zoomOut [189,109,54,173]` und die Pfeile — das sind auf deutscher Tastatur die drei Tasten
  `-`, `+`, `6`, und mit Shift werden daraus genau `_`, `*`, `&`. Die **54 ist die Ziffer 6**
  (Leaflet fuehrt sie fuer AZERTY-Layouts als Zoom-raus), daher auch die kaputte Lauf-Auswahl.
  **Fix:** in allen fuenf Komponenten ein Unmount-Effekt, der `map.remove()` ruft. Kette
  nachgeprueft: `remove()` -> `_clearHandlers()` -> `handler.disable()` -> `removeHooks()` ->
  entfernt den `document`-Listener. `npm run build` gruen, damit sofort live.
  Nebenbei behoben: die Karten waren auch ein Speicherleck — jede Navigation liess eine komplette
  Leaflet-Instanz samt Tile-Layer zurueck.

- **🟢 Puls/Trainings-Wuensche (ThermikDreher, 15.08.) — zwei umgesetzt, einer bewusst NICHT.**
  Er wollte vier Dinge: Max-Puls je Lauf, Puls-Verlauf mit eigenen Zonen, Vergleich mit Fahrern
  auf aehnlichem Setup, und (aus den Uhr-Datenfeldern) den Max-Puls des letzten Laufs.
  - **Max-Puls je Lauf: LIVE 17.08.** Reine Anzeige — der Track traegt den Puls je Punkt schon,
    `i_start`/`i_end` sind Indizes darauf. `v2_hr_bpm` im Segment ist der MITTELWERT, nicht das
    Maximum (143 gegen 155 im belegten Fall).
  - **Trainingskurve LIVE 17.08.**: Hoechstpuls nach 1/2/5 Minuten Lauf ueber die Sessions.
    Jans Umdeutung des Setup-Vergleichs und der Kern der Sache — die Anstrengung haengt an der
    DAUER, kaum am Foil, also ist die Lauf-Dauer die ehrliche Achse. 81 Nutzer haben genug Puls.
  - **Vergleichs-VORSCHLAEGE: verworfen (Jan, 17.08.).** „brauchen wir garnicht durch die anderen
    dinge" — man kann manuell vergleichen, hat den eigenen Verlauf, und eigene wie fremde Sessions
    lassen sich schon gegenueberstellen. NICHT bauen, auch nicht als „waere doch nett".
    Moegliche Fortsetzung, wenn die Praxis es zeigt: Vergleich einzelner LAEUFE statt ganzer
    Sessions — Jan testet erst.
  - **Puls-Verlauf mit eigenen Zonen: OFFEN**, wartet auf eine Entscheidung. Die Frage ist nur, wie
    die Zonen reinkommen: fuenf Grenzwerte im Profil eintragen oder aus einem Maximalpuls ableiten.
    Datenlage ist vollstaendig da (Puls je GPS-Punkt, 1705 Sessions).
  - **Max-Puls des letzten Laufs als UHR-Datenfeld: OFFEN.** Die Uhren fuehren die Werte des
    letzten Laufs schon (Dauer, Distanz, Ø/Max-Speed) — ein `lastRunMaxHr` waere dieselbe Mechanik
    je Plattform plus ein Feld-Eintrag. Garmin und Wear koennte ich bauen, Apple nur als Code,
    Zepp liegt gerade in der Pruefung.

- **🟡 Nach den Uhr-Releases: Hinweis am Datenfeld 21 wieder entfernen.** Das Feld „Letzter Lauf:
  Max Puls" steht seit 17.08. im Layout-Editor und ist serverseitig erlaubt, die Uhren-Seite kommt
  aber erst mit dem naechsten Release je Plattform (Garmin ist im Direkt-Download schon drin, Wear
  mit dem naechsten Bump, Apple mit Jans Xcode-Build, Zepp mit 1.0.6 — 1.0.5 liegt in der Pruefung).
  Solange steht „(neue Uhr-Version)" im Namen; sobald alle vier live sind, den Zusatz streichen.
  **Aeltere Uhren stuerzen dabei NICHT ab** — das war Jans ausdrueckliche Sorge und ist geprueft:
  jede der vier Plattformen hat einen Rueckfall fuer unbekannte Feld-IDs (Garmin `value = "--"`,
  Wear `else -> "—"`, Apple `default: return ("—", "")` samt Standardfarbe, Zepp `default:
  return ["–", ""]`). Ein Layout mit Feld 21 zeigt auf einer alten Uhr also einen Strich, sonst
  nichts. Merke fuer kuenftige Felder: dieser Rueckfall ist die Bedingung dafuer, dass ein neues
  Feld VOR dem Uhr-Release in den Editor darf.

- **✅ ERLEDIGT 30.08. — Foil-Statistik: laengster Lauf je Foil.** Nutzerwunsch ueber das
  Feedback-Formular der Android-App (30.08., englisch): „displaying the best time and distance for
  each different foil". Die weiteste Strecke stand schon drin (`best_distance_m`), die Zeit fehlte —
  obwohl `analysis_results.best_duration_s` seit jeher gefuellt ist (3020 von 3020 Ergebnissen).
  Jetzt `max(best_duration_s)` je Foil im Aggregat `GET /api/community/foil-stats`, als sortierbare
  Spalte im Web und als Kennzahl in Android + iOS. Label ueber den vorhandenen Schluessel
  `rec.longestRun` — in allen 17 Web-Sprachen und in beiden Apps schon uebersetzt, **keine neue
  Uebersetzung noetig**. Anzeige `m:ss` wie in den Rekord-Kacheln (erst runden, sonst „6:60").
  In den Apps stehen Strecke und Zeit als Paar in einer eigenen Zeile — zu zweit bleibt Platz fuer
  lange Labels (ru/ja), zu dritt waere es auf 360-dp-Geraeten gebrochen.
  **Noch offen (klein):** `foilStats.colTopSpeed` liegt seit laengerem uebersetzt in allen 17
  Sprachen, wird aber nirgends benutzt — die Uhren-Statistik zeigt `best_speed_mps`, die
  Foil-Statistik nicht. Entweder die Spalte nachziehen oder den Schluessel entfernen.

- **🟡 OFFEN 30.08. — Meldung „iOS 1.1.25 stuerzt beim Start ab" (EIN Nutzer, uid 149).**
  Chat global:main, 30.08. 13:24: „The new version 1.1.25 of the app crash on start on iPhone".
  **Kein Hinweis auf einen Totalausfall** — geprueft (alles nur lesend):
  - 1.1.25 ist seit **27.08. ~20:35** im Feld (uid 354 wechselte binnen 13 Minuten 1.1.24 -> 1.1.25).
  - **Die iPhone-App LIEF nachweislich auf 1.1.25:** Session 3045 (uid 357) wurde am **29.08. 15:30
    mit `platform=ios`, `app_version=1.1.25`** aufgezeichnet und hochgeladen — der Handy-Recorder
    kann nicht aufnehmen, wenn die App beim Start abstuerzt.
  - 9 Konten haben die Apple-Watch-App aus dem 1.1.25-Bundle, 5 davon heute aktiv; heute 6
    Uhr-Sessions von 1.1.25-Geraeten. Uploads je Plattform ueber 14 Tage ohne Einbruch.
  - Keine 5xx heute (letzte am 29.08., eine); keine Tracebacks zum Zeitpunkt der Meldung.
  - Startpfad-Code (RootView/HomeView/SessionStore.bootstrap) ist zwischen 1.1.24 und 1.1.25
    **unveraendert**; alle Startabrufe sind `try?` (Decode-Fehler -> nil, kein Absturz).
    Age-Gate/DeclaredAgeRange steckt schon seit 13.07. in ausgelieferten Builds.
  **Naechster Schritt (nur Jan moeglich):** App Store Connect -> Xcode Organizer -> Crashes zeigt,
  ob es EIN Geraet ist oder viele; parallel den Melder um das Crash-Log bitten (Einstellungen ->
  Datenschutz & Sicherheit -> Analyse & Verbesserungen -> Analysedaten -> „Pumpfoil-…ips") plus
  iPhone-Modell und iOS-Version. Erster Selbsttest fuer ihn: App loeschen + neu installieren
  (lokaler Cache/Keychain-Zustand).
  **Nebenbefund:** `watch-apple/project.yml` fuehrt das Watch-Target als **1.1.24**, im Feld meldet
  die ausgelieferte Uhren-App aber **1.1.25** — das Archiv wurde also mit einer hoeheren Nummer
  gebaut als im Repo steht. Vor der naechsten Einreichung angleichen, sonst lehnt App Store
  Connect die Build-Nummer ab.

- **✅ URSACHE GEFUNDEN + gefixt (Code) 30.08. — iOS-Absturz ist ein Watchdog-Kill, kein Crash.**
  Jacek hat sein Crash-Log geschickt (`Pumpfoil-2026-08-20-111547.ips`). Inhalt eindeutig:
  `EXC_CRASH (SIGKILL)`, FRONTBOARD-Grund **`0x8BADF00D` — „scene-update watchdog transgression:
  exhausted real (wall clock) time allowance of 10.00 seconds"**. Hauptthread stand in
  `LazyLayoutViewCache.updatePrefetchPhases` -> `LazySubviewPlacements.updateValue()`, also in
  einem SwiftUI-Layout-Durchgang. **iOS hat die App abgeschossen, weil EIN Layout zehn Sekunden
  brauchte** — kein Programmierfehler-Absturz, sondern zu viel Arbeit am Stueck.
  Randdaten: iPhone 16 Pro, iOS 26.6, **App 1.1.24** (nicht 1.1.25 — er hatte kein neueres Log),
  gestartet 11:08:31, abgeschossen 11:15:44 im Hintergrund. Systemsprache des Geraets: pl.
  Zeitlicher Zusammenhang: um 11:17/11:19 schrieb er im Chat ueber die **Spot-Karte** — er war
  also genau dort.
  **Ursache:** `MainTabView.tabPages` ist ein `ZStack`, der **alle sieben Tabs sofort baut**
  (nur per `opacity` versteckt). Beim Kaltstart entstanden damit sieben Bildschirme auf einmal,
  darunter `SpotsView` mit einer MapKit-Karte, die **je Spot eine eigene SwiftUI-`MapAnnotation`
  mit `NavigationLink`** anlegt — aktuell **231 Stueck** (`GET /api/community/spot-map`) — plus die
  `.task`-Ladevorgaenge jedes Tabs. Das erklaert beide Meldungen: den Kill im Betrieb und
  „stuerzt beim Start ab".
  **Fix (RootView.swift):** ein Tab wird erst beim ersten Oeffnen gebaut (`besucht`-Set). Am
  Verhalten aendert das nichts — `selectTab()` zaehlt `resetTokens` hoch, ein Tab wurde also
  ohnehin bei jedem Antippen frisch gebaut. Nur der Startbildschirm liegt jetzt beim Start im
  Speicher statt sieben. **Jan muss bauen (Xcode).**
  **Zweiter Teil, auf Jans Vorschlag gleich mit erledigt: Spots werden jetzt gebuendelt** (iOS +
  Android), wie es das Web seit dem 20.08. macht — dieselbe Regel auf allen dreien: Abstand in
  Pixeln beim aktuellen Zoom, die sessionstaerksten Spots zuerst als Anker (deterministisch),
  Tippen auf ein Buendel zoomt hinein statt eine Zufallsauswahl zu treffen.
  - **iOS** (`SpotsView.swift`): zusaetzlich auf den sichtbaren Ausschnitt gefiltert, weil dort
    jede Annotation eine gehostete SwiftUI-View ist. Schwelle 38 Punkt statt 26 wie im Web —
    unsere Pins sind 30 Punkt breit, mit 26 wuerden sie sich noch beruehren. **An den echten 231
    Spots durchgerechnet: hoechstens 23 Pins auf jeder Zoomstufe** (Europa-Ansicht 23 statt 39
    bei Schwelle 26, Startansicht 7 statt 231).
  - **Android** (`SpotsScreen.kt`): osmdroid zeichnet Bitmaps statt Views, dort ging es also nicht
    um Tempo, sondern um denselben UX-Fehler — der Tipp landete im zuletzt gezeichneten Nachbarn.
    Buendelung ueber die Web-Mercator-Weltpixel (dieselbe Rechnung wie Leaflets `project()`),
    Neuberechnung beim Zoomen ueber einen `DelayedMapListener`. Kompiliert.
  - Das Web bleibt unveraendert (Schwelle 26 passt dort zu 18-px-Kreisen).

- **🔴 AKUT + behoben 30.08. — iOS stuerzte beim Start ab: ungueltige Karten-Region.**
  Jans Simulator-Lauf lieferte den echten Fehler:
  `NSInvalidArgumentException — Invalid Region <center:+17.98,+2.27 span:+139.90,+384.58>`.
  MapKit wirft ab **180°/360°** eine NSException; die ist **nicht abfangbar**, die App endet sofort.
  `SpotsView.fitRegion` legt auf die Bounding-Box aller Spots **40 % Rand**: erlaubt sind damit
  257,1° Spreizung — mehr nicht.
  **Ausgeloest hat es EINE Session:** die erste aus Japan (三浦市, `spot_id` 450, hochgeladen
  **30.08. 07:55**). Damit reichen unsere Spots von Whitehorse/Haines (−135,1°) bis 139,6° Ost =
  **274,7°** -> ×1,4 = **384,6°**. Tags zuvor waren es 250,9° -> 351,3°, also **keine 9° unter der
  Kante**. Jaceks Meldung „stuerzt beim Start ab" kam 13:24 desselben Tages — es war nie sein
  Geraet, es war unsere Datenlage. Und weil die ausgelieferten Versionen beim Start ALLE Tabs
  bauen, traf es jeden eingeloggten iOS-Nutzer, auch ohne den Spots-Tab je zu oeffnen.
  **Zwei Fixes:**
  1. **Client (1.1.26):** `sichereRegion()` in `SpotsView.swift` kappt jede Spanne auf 170°/350°;
     alle vier Kartenstellen laufen jetzt darueber (Spots, Vergleich, Verlauf, Session-Detail).
     Der Vergleich hatte dieselbe Falle — zwei Sessions von verschiedenen Kontinenten.
  2. **Server (sofort live, `_alte_ios_app`/`_kappe_ausreisser` in `community.py`):** Clients mit
     `X-Pumpfoil-Client: ios/<1.1.26` bekommen von `/api/community/spot-map` die aeussersten
     Spots weggelassen, bis die Box wieder passt — Seite mit den wenigsten Sessions zuerst, bei
     Gleichstand die, die die Spreizung wirklich verkleinert (an einem Ende koennen mehrere Spots
     dicht liegen: Whitehorse/Haines bringen 0,04°, der Ausreisser 24°). **Aktuell faellt genau
     EIN Spot weg (三浦市), 230 von 231, Region 351,3°.** Web und Android bekommen unveraendert
     alles.
     Gekappt werden **fremde Spots vor eigenen**: der Ausreisser ist oft der eigene (der Fahrer
     aus Miura sitzt selbst auf 1.1.25), und ihm wuerde sonst als Einzigem sein eigener Spot
     fehlen. Fuer ihn faellt stattdessen die andere Seite weg (8 Spots an der nordamerikanischen
     Westkueste), Region 331,4° — gueltig. Geprueft fuer **alle 387 Konten: kein einziges** bekommt
     eine ungueltige Region.
     **Bleibt stehen** — ab 1.1.26 ist die App ausgenommen (bekommt alle 231 Spots und kappt
     selbst), fuer aeltere Installationen ist der Notbehelf aber der einzige Schutz. Wegnehmen
     erst, wenn keine iOS-Version unter 1.1.26 mehr im Feld ist (`device_tokens`, `platform`
     `ios`/`apple`). Kostet einen Header-Vergleich.
  **Merke:** Kartenregionen nie ungeprueft aus Nutzerdaten bauen — die Grenze faellt erst auf,
  wenn jemand auf einem neuen Kontinent faehrt.

- **✅ 30.08. — Android/Wear auf Ziel-API 36 (Android 16).** Play-Meldung an Jan: ab **31.08.2026**
  werden nur noch Updates angenommen, die hoechstens ein Jahr hinter der neuesten Android-Version
  liegen; unser Stand war 35. Die gerade eingereichte Runde geht noch durch, die naechste waere
  abgelehnt worden. `compileSdk`/`targetSdk` = 36 in `:app` und `:wear`, **AGP 8.5.2 -> 8.9.2**
  (8.5 baut compileSdk 36 zwar, warnt aber „recommend using a newer AGP"; 8.9.2 laeuft mit dem
  vorhandenen Gradle 9.0-milestone-1 und Kotlin 1.9.24 durch). SDK-Plattform 36 + Build-Tools
  36.0.0 auf der VM installiert. Beide Module gebaut, im fertigen Paket steht `targetSdkVersion:'36'`.
  **Verhaltensaenderungen von Android 16 durchgegangen:** Edge-to-Edge wird ab 36 erzwungen — wir
  rufen `enableEdgeToEdge()` ohnehin schon auf; Ausrichtungs-Sperren werden auf grossen Displays
  ignoriert — wir setzen kein `screenOrientation`; Predictive Back ist Standard — Compose-
  `BackHandler` traegt das mit; 16-KB-Seitengroesse betrifft nur native Bibliotheken — wir haben
  keine (`.so`-Suche im APK leer).
  **Fuer Jan:** in Android Studio **Android 16 (API 36)** + **Build-Tools 36** nachinstallieren,
  sonst baut das signierte Release nicht. API 37 bewusst NICHT — jede weitere Stufe braechte neue
  Verhaltensaenderungen, und 36 erfuellt die Regel.

- **🟡 30.08. 18:55 — iOS 1.1.26 (30) EINGEREICHT** (Jans Meldung; „Warten auf Pruefung",
  Uebermittlungskennung c1663e12-070d-4c24-b31a-fa4469eda7aa). Inhalt: Startabsturz behoben
  (ungueltige Karten-Region, s. o.), Tabs erst beim Oeffnen, Spot-Buendelung, Polnisch,
  Uhr-Anleitung, Geschwindigkeits-Zonen im Profil, laengster Lauf je Foil, Leistung fremder
  Sessions mit dem Gewicht des Besitzers. Uhren-Teil: Polnisch, Zonen-Farben, Schriftmessung.
  Nach der Freigabe: `appmeta` auf 1.1.26 setzen + Changelog-Eintrag.

- **✅ 30.08. — Release-Bau gegen API 36 vorgeprueft; dabei EIN echter Fehler auf der Uhr.**
  `bundleRelease` (das, was Jan in Android Studio baut) scheiterte an einem Lint-Fehler, den der
  Debug-Bau nicht zeigt: `InvalidFragmentVersionForActivityResult` — „Upgrade Fragment version to
  at least 1.3.0". Zweimal aufgetreten, mit unterschiedlicher Bedeutung:
  - **`:app` = Fehlalarm.** Aufgeloest wurde ohnehin 1.5.7; im Graphen steht ueber eine Transitive
    aber noch `fragment:1.0.0`, und der Lint liest die Version VOR der Aufloesung. Behoben, indem
    `androidx.fragment:fragment:1.5.7` explizit deklariert ist — keine Verhaltensaenderung, und
    die Pruefung bleibt scharf (statt sie abzuschalten).
  - **`:wear` = echter Befund.** Das Uhr-Modul loeste tatsaechlich auf **1.2.4** auf, also unter
    der Grenze. `MainActivity` holt genau darueber die Berechtigungen
    (`registerForActivityResult(RequestMultiplePermissions())`), und die alten Fragment-Versionen
    riefen `super.onRequestPermissionsResult()` **nicht** auf und benutzten ungueltige
    Request-Codes. Das ist dieselbe Fehlerklasse wie der Befund vom 05.08. („Standort-Berechtigung
    scheitert stumm", 4 von 6 Wear-Sessions ohne GPS-Punkte) — dort war unser eigener Code die
    belegte Ursache, aber diese Bibliotheksversion konnte es nicht besser machen. Jetzt 1.5.7.
  Alle vier Varianten gebaut: `app-release.aab` 15,1 MB, `wear-release.aab` 7,5 MB, beide Debug-
  APKs ebenfalls. **Merke: `assembleDebug` beweist nichts ueber den Release** — Lint laeuft nur
  beim Release-Bau, und er bricht ab, nicht warnt.

- **✅ 30.08. — Lauf-Erkennung auf den Uhren an den Server angeglichen (alle sechs Recorder).**
  Anlass: Cornelia (Cony_e) hat nach JEDER Fahrt ihre Uhr fotografiert, sieben Bilder plus zwei
  App-Ansichten — die Messreihe, die uns bisher fehlte. Eine Simulation der Uhr-Logik auf ihren
  echten GPS-Daten (S3079/S3081, 30.08., fēnix 7X, App 1.0.78) trifft ihre Fotos auf **1–2 Meter**
  genau, damit ist die Diagnose belegt und nicht geraten. Drei Ursachen:
  1. **Der 25-s-Re-Arm-Cooldown fraß den Rest des Laufs.** Bricht der Speed kurz ein (Touchdown),
     endet der Lauf — und danach ist die Uhr 25 s taub, obwohl längst weitergefahren wird. Ihr
     09:01-Lauf: Uhr 66 m/20 s, Server 144 m/41 s. In den Daten direkt sichtbar: die Lücken
     zwischen den Bruchstücken sind **27 s** — die Cooldown-Dauer.
     *Fix:* Sperre greift nur noch nach einem ECHTEN Stopp (Minimum unter 1,5 m/s). Dafür musste
     das Minimum **auch während des Cooldowns** mitlaufen — vorher schaute die Uhr genau dann weg,
     wenn sich ein Stopp zeigt.
  2. **1.0.80 verschmolz nur den Zähler, nicht die Anzeige.** `_runIstFortsetzung` übersprang
     `_runCount++`, aber `_lastRunDistM`/`_lastRunDurMs` wurden weiter mit dem Bruchstück
     überschrieben. Ihre Beschwerde wäre also auch nach dem Update geblieben.
     *Fix:* bei einer Fortsetzung wird der Start des vorigen Laufs übernommen (`_lastRunStartMs`/
     `_lastRunStartDist`), Maximum und Max-Puls ebenfalls -> die Anzeige zeigt den GANZEN Lauf.
  3. **Kein Mindest-Lauf.** 7 m in 6 s standen als „letzter Lauf" auf dem Display.
     *Fix:* unter 5 s oder unter Ø 2,0 m/s zählt nicht (Server: `MIN_SEGMENT_S` 5 s,
     `MOVE_FLOOR_MPS` 2,0). **Nicht** die Server-2,8 genommen — die hätte einen echten 140-m-Lauf
     mit Ø 2,75 m/s verworfen (an ihren Daten gemessen).
  **Ergebnis an ihren zwei Sessions:** Median-Abweichung vom Server **von 33 % auf 6 %**.
  S3079 Uhr neu 201/67 · 131/42 · 164/57 gegen Server 191/57 · 144/41 · 176/56 · 27/8.
  Ein Fall wird schlechter (81-m-Lauf -> 132 m überverschmolzen), zwei kurze Läufe findet die Uhr
  weiter nicht — das ist die Grenze ohne Beschleunigungs-Modell.
  **Wichtig fürs Verständnis:** die Schwellen sind auf beiden Seiten IDENTISCH (2,8 rein / 2,5
  raus). Der Unterschied war nie die Erkennung, sondern das Drumherum — der Server hat keinen
  Cooldown, sondern prüft im Nachhinein, ob je ein echter Stopp dazwischen lag.
  Umgesetzt in: `watch/source/SessionRecorder.mc`, `android/wear/.../Recorder.kt`,
  `android/app/.../Recorder.kt`, `watch-apple/Sources/Recorder.swift`,
  `watch-apple/Sources-iOS/PhoneRecorder.swift`, `watch-zepp/page/index.js`.
  Garmin auf **1.0.81** gebumpt; Test-`.prg` (fēnix 7X Pro) an Jan, `.iq` fürs Store-Paket gebaut.

- **Nachtrag 30.08. — Plausibilitaetspruefung beim Zusammenfuehren.** Jans Simulator-Test zeigte
  „letzter Lauf: 14 709,6 m in 0:42" (1260 km/h). Untersuchung der hochgeladenen Session S3142:
  die Simulator-Daten sind in sich widerspruechlich — drei GPS-Punkte tragen **20 037 500 m/s**
  (ein Sentinel: der halbe Erdumfang, Mercator-Konstante), und die 485 Punkte ergeben ueber 639 s
  nur **590 m** Strecke, waehrend die Speed-Reihe ~50 s Foiling behauptet. Der Kilometerzaehler der
  Uhr ist dort eine dritte, unabhaengige Quelle. Auf echter Hardware nicht reproduzierbar.
  Trotzdem eingebaut (alle sechs Recorder): eine Fortsetzung wird nur akzeptiert, wenn die Strecke
  seit dem urspruenglichen Start plausibel bleibt (max. 32 km/h im Mittel — dieselbe Grenze wie
  beim Max-Speed). Springt der Zaehler, faengt ein neuer Lauf an, statt die Luecke zu erben.
  **Was in derselben Session funktioniert hat:** Uhr 1 Lauf / 16,2 km/h max gegen Server 1 Lauf /
  16,1 km/h — die Max-Speed-Saeuberung hat den 72-Millionen-km/h-Ausreisser sauber geschluckt.
  **Offen (Jans Entscheidung):** den Sentinel schon beim Aufzeichnen kappen, statt ihn hochzuladen.
  Der Server neutralisiert ihn (>90 km/h -> Median), aber in den Rohdaten steht dauerhaft Unsinn.
  **Reihenfolge (Jan, 30.08.):** erst Garmin einreichen; iOS und Play liegen in Pruefung und
  koennen die neue Lauf-Logik fruehestens nach ihrer Freigabe nachziehen.

- **🟡 30.08. — Garmin 1.0.82 EINGEREICHT** (Jans Meldung; Store-Seite: „Erste Version 2. Juli 2026,
  Aktuelle Version 30. August 2026, Version 1.0.82 (Intern: 36), Groesse 70 KB").
  Inhalt: die an den Server angeglichene Lauf-Erkennung (Cooldown nur nach echtem Stopp,
  Fortsetzung verlaengert den Lauf statt ihn zu ersetzen, Mindestlauf 5 s / 2,0 m/s) plus die
  Plausibilitaetspruefung beim Zusammenfuehren.
  **Sonderfall 1.0.81:** die ging versehentlich in den Store (Jan hatte auf Abbrechen gedrueckt),
  ist dort LIVE und enthaelt die Plausibilitaetspruefung noch NICHT. 1.0.82 ersetzt sie.
  **Stand jetzt:** Store 1.0.81 · `watch/bin` 1.0.80 · `appmeta.garmin.latest` 1.0.80.
  `appmeta` bewusst NICHT auf 1.0.81 gesetzt — 1.0.82 kommt unmittelbar, sonst aktualisieren die
  Nutzer zweimal an einem Tag. Nach der Freigabe der 1.0.82 in dieser Reihenfolge: `build-all.sh`
  -> `appmeta.garmin` -> Changelog -> Antwort an Cornelia (Entwurf liegt bereit).
  **Nuetzlich, selbst pruefbar:** die im Store veroeffentlichte Version steht in der Store-Seite
  und laesst sich von der VM abfragen —
  `curl -s https://apps.garmin.com/apps/9a2a753e-b52f-4587-aee4-900caf5cb351 | grep -o 'Version":"[0-9.]*"'`
  liefert derzeit `1.0.81`. Damit muss man auf die Freigabe nicht warten, sondern kann sie messen.

- **✅ ENTSCHIEDEN 30.08. — Sentinel NICHT im Recorder kappen.** Frage war, ob wir den
  20 037 500-m/s-Wert schon beim Aufzeichnen abfangen. Antwort aus den Rohdaten (alle 132 305
  GPS-Dateien, 3 GB, gescannt):
  - **Der Sentinel kommt in 13 Sessions vor — ausnahmslos Jans, ausnahmslos Simulator, alle
    bereits geloescht.** Kein einziger anderer Nutzer, keine einzige echte Fahrt. In zweien sind
    auch die POSITIONEN betroffen (S367: 118 000 km Rohstrecke) — der Wert ist die
    Mercator-Konstante, der halbe Erdumfang, also ein Platzhalter des Simulators.
  - **Echte GPS-Glitches gibt es aber sehr wohl: 58 Sessions, 27 verschiedene Nutzer**, 91 bis
    402 km/h, auf allen Plattformen (32 ohne Geraet, 15 Wear, 7 Apple, 4 Garmin) — die bekannten
    Doppler-Bursts.
  - **In KEINER dieser 58 Sessions hat der Glitch den ausgewerteten Max-Speed erreicht** (0 von 58
    ueber 32 km/h). Die Saeuberung im Server faengt sie vollstaendig ab, die auf der Uhr ebenso.
  **Warum trotzdem nicht kappen:** die Rohdaten sind unser Beweismittel. Genau daran liess sich
  heute belegen, dass der 72-Mio-km/h-Wert vom Simulator kommt und nicht von der Uhr — haette der
  Recorder ihn stillschweigend geglaettet, waere die Unterscheidung unmoeglich gewesen. Gesaeubert
  wird in der Auswertung und in der Anzeige, nicht in der Aufzeichnung.
