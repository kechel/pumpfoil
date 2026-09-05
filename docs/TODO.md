# TODO & Ideen

**Einzige Quelle für offene Arbeit.** Gegen die Git-Historie abgeglichen (Stand 2026-07-13).
Erledigtes steht nicht mehr hier. Neue spontane TODOs unten unter „📥 Inbox" anhängen.

> Ersetzt die frühere `docs/IDEAS.md`-Inbox. Reine Produktideen weiter unten unter „💡 Backlog".

---

## 🚀 App-Release-Stand

- **🔲 01.09. — Feedback #119 (u406 „Bine", deutsch, iOS-App): Fitbit/Google Charge 6 einbinden?**
  Wortlaut: „Wäre es möglich, dass ihr den Fitbittracker (Google Charge 6) auch mit einbinden
  könntet, bzw. eine Schnittstelle zum Auslesen der Daten." Sie hat noch **kein Geraet und keine
  Session** — sucht gerade einen kompatiblen Tracker.
  **An der Quelle geprueft (dev.fitbit.com, 01.09.):**
  - **Ein Recorder AUF der Uhr ist unmoeglich.** Fitbits App-SDK richtet sich an die Smartwatches
    (Versa/Sense) — die **Charge 6 ist ein Tracker**, dort laufen gar keine Fremd-Apps.
  - **Der Auslese-Weg stirbt genau jetzt:** „We will be deprecating the legacy Fitbit Web API in
    **September 2026**", Verweis auf die **Google Health API**. Heute darauf zu bauen waere Bauen
    auf Sand; der Weg waere die Google Health API.
  - Und selbst dann waere es ein **Import fertiger Aktivitaeten**, keine Live-Aufnahme: die
    Charge 6 hat eingebautes GPS, gibt aber keinen 25-Hz-Accel heraus. Landet also in unserer
    `gps_only`-Klasse wie der FR55 — Laeufe werden erkannt, nur ungenauer.
  **Antwort ist raus (01.09.).**

  **🔴 NACHGEPRUEFT (01.09., Jans Frage „koennten wir denn die Google Health API einbinden?"):
  NEIN — und zwar nicht „schwierig", sondern die Daten gibt es dort nicht.**
  - **Google Health API** (`developers.google.com/health`, der Fitbit-Nachfolger, Cloud-REST):
    laut Datentypen-Seite **keine Location/Route/GPS-Daten** — „Exercise" ist nur auf
    Sitzungsebene, ohne Geodaten — und **kein Roh-Accel**. Es gibt `heart-rate` (Sample),
    `steps`/`active-minutes` (Interval), also unterhalb von Tageswerten, aber eben keine Positionen.
    **Damit ist es fuer uns wertlos:** unsere ganze Auswertung steht auf GPS-Positionen. Ohne die
    gibt es keine Strecke, keine Laeufe, kein Tempo — nur „42 Minuten, Puls 130 im Schnitt".
  - **Health Connect** (Android, auf dem Geraet) ist die ANDERE Google-Schnittstelle und kann mehr:
    `ExerciseSessionRecord` **kann eine Route tragen**, Leseberechtigung
    `android.permission.health.READ_EXERCISE_ROUTE`. Aber: **auch dort kein Roh-Accel**, es geht
    **nur auf Android** (die iPhone-Haelfte der Anfrage bleibt offen), es braucht die
    **Health-Apps-Deklaration in der Play Console** und fuer Routen eine **eigene Freigabe** — ein
    Pruefverfahren wie bei Garmin. Und ob die Fitbit-App Routen ueberhaupt dort hineinschreibt,
    ist unbelegt; ohne das bringt der ganze Weg nichts.
  - **JANS EINWAND (01.09.), und er hat recht: „nur gps ist prima, 100 mal besser als nichts".**
    Belegt an unseren eigenen Zahlen: der **FR55 laeuft in 48 von 51 Sessions als `gps_only`** —
    normale Session-Laengen, 14 % Abbrueche, also wie der Rest der Flotte. `gps_only` ist eine
    tragfaehige Klasse, kein Trostpreis. Meine Einordnung als „zweitklassig" war zu abschaetzig.
    **Das aendert die Bewertung der drei Wege — aber NICHT die der Google Health API:** die hat
    gar keine Positionen, das ist nicht „nur GPS", das ist nichts.
  - **✅ KORREKTUR (Jan, 01.09.): „fit Import haben wir doch laengst"** — stimmt, und er kann mehr
    als ich geschrieben hatte (`fitimport.py` FIT, `_fit_bytes_from_upload` auch Garmins ZIP,
    `tcximport.py` TCX UND GPX). **Und er ist NICHT die Antwort auf diese Anfragen:** „fit Import
    will keiner, das gibt es laengst, es geht um automatische anbindungen" (Jan). Der Datei-Weg
    ist also weder offen noch ein Argument — **und wird Nutzern auch nicht als Ausweg
    geschrieben** („schreib das niemanden, das sieht man prominent genug ueberall dass das geht").
  - **Es geht um AUTOMATISCHE Anbindungen. Welche Tueren sind offen?**
    2. **HealthKit auf iOS** (`HKWorkoutRoute`): dieselbe Idee, aber ohne Dateihantieren — wir
       lesen die fertige Aufnahme aus der Health-Datenbank des Telefons. **⚠️ NICHT belegt:** die
       Apple-Doku-Seite kam beim Abruf leer zurueck, die Lesbarkeit fuer Fremd-Apps ist also nur
       plausibel, nicht geprueft. **Vor jeder Planung nachlesen.**
    3. **Health Connect auf Android** (`ExerciseSessionRecord` + `READ_EXERCISE_ROUTE`): belegt,
       aber teurer — **Health-Apps-Deklaration in der Play Console plus eigene Freigabe fuer
       Routen**, und ob die Fitbit-App Routen dort hineinschreibt, konnte ich nicht belegen.
    Bei 2 und 3 gilt: **kein Roh-Accel**, alles landet als `gps_only`.
  - **Ironie, die man kennen sollte:** die Nutzerin, die gefragt hat, sitzt auf **iOS**
    (Feedback kam aus der iOS-App). Weg 3 hilft ihr also gar nicht — nur 1 oder 2.
  - **Der eigentliche Gewinn liegt nicht bei Fitbit:** Health Connect und HealthKit sind Sammel-
    stellen. Wer dort Routen schreibt (Samsung Health, Strava, Komoot, Polar Flow, Suunto, COROS),
    wird in einem Zug zur Quelle. Das ist das bessere Argument als eine einzelne Fitbit-Anfrage.
  - **JANS WUNSCH (01.09.): „wir sollten google dann so wie suunto und polar als
    Kontoverknuepfung ermoeglichen".** Das Muster ist da und billig (`api/suunto.py`,
    `api/polar.py`, `api/coros.py`, `api/strava.py` — OAuth + Push/Pull + derselbe Import).
    **ABER: heute wuerde die Verknuepfung keinen Track liefern.** Die Google Health API
    dokumentiert **keinen Location-Datentyp**; auf der Migrationsseite gibt es zwar den **Scope
    `location.readonly`**, aber in der Datentypen-Tabelle steht dazu **nichts**. Auch der
    TCX-Export der alten Fitbit-API (der GPS-Trackpunkte lieferte) hat dort **kein** Gegenstueck.
    Wir bekaemen also Exercise-Sitzungen (Start/Ende, Typ, Kennzahlen), Puls, Schritte,
    Aktivminuten — und **keine Positionen**. Ohne Positionen entsteht bei uns gar keine Session;
    das erreicht nicht einmal `gps_only`, denn auch das braucht einen Track.
    **Empfehlung: auf die Beobachtungsliste, nicht bauen — mit EINER Ausloeser-Frage:**
    „Dokumentiert die Google Health API einen Location-/Route-Datentyp?" Dass der Scope existiert,
    spricht dafuer, dass es kommen soll. Sinnvoller Zeitpunkt zum Nachsehen: nachdem die
    Abkuendigung der alten Fitbit-API (September 2026) durch ist und die neuen Dokus stehen.
    Bis dahin sind Fitbit-Nutzer NICHT blockiert — sie koennen exportieren und hochladen.
  - **Nachtrag an die Nutzerin geschickt:** in der ersten Antwort hatte ich den Import ueber die
    neue API noch als „denkbar" bezeichnet — das war zu optimistisch, und sie sucht gerade einen
    Tracker. Richtiggestellt, damit sie ihre Kaufentscheidung nicht darauf baut.

- **⏸️ 01.09. — ZURUECKGESTELLT (Jans Entscheidung): automatische Anbindung von Google/Fitbit und
  den Telefon-Gesundheitsspeichern. „das bringt dann nix, dann heben wir uns das nur als plan fuer
  irgendwann auf".** NICHT weiterverfolgen, nicht neu recherchieren — die Recherche steht unten und
  ist vollstaendig. **Was den Plan wieder aufwecken wuerde:** die Google Health API dokumentiert
  einen Location-/Route-Datentyp (heute gibt es nur den Scope `location.readonly` ohne Eintrag).
  Sinnvoller Zeitpunkt zum Nachsehen: nachdem die Abkuendigung der alten Fitbit-API (September 2026)
  durch ist und die neuen Dokus stehen.

  Die Bilanz, die zu der Entscheidung gefuehrt hat — die einzigen offenen Tueren waeren die
  Gesundheitsspeicher der Telefone: Bilanz nach der Google-Recherche, weil Jan automatische
  Anbindungen will und nicht Datei-Import:
  | Weg | Automatisch? | Track? | Stand |
  |---|---|---|---|
  | Suunto, Polar, COROS, Strava | ✅ gebaut | ✅ | teils credential-gated |
  | **Garmin Connect** | — | — | 🔴 Antragsweg ZU (17.08. geprueft) |
  | **Google Health API** (Fitbit-Nachfolger) | ✅ Muster billig | **❌ keine Positionen** | dokumentiert keinen Location-Datentyp; Scope `location.readonly` ohne Eintrag |
  | **Health Connect** (Android) | ✅ ohne Dateien | ✅ `ExerciseSessionRecord` + `READ_EXERCISE_ROUTE` | belegt; braucht Play-Health-Deklaration + eigene Routen-Freigabe; kein Accel |
  | **HealthKit** (iOS) | ✅ ohne Dateien | ✅ `HKWorkoutRoute` | ⚠️ Lesbarkeit fuer Fremd-Apps **NICHT belegt** — Apples Doku-Seiten kommen bei WebFetch LEER zurueck (JavaScript). Muss in Xcode/echter Doku nachgesehen werden |
  **Warum die Telefon-Speicher der bessere Hebel sind:** sie sind Sammelstellen. Wer dort Routen
  hineinschreibt — Samsung Health, Strava, Komoot, Polar Flow, Suunto, COROS, die Fitbit-App —
  wird in EINEM Zug zur Quelle, ohne je einen Herstellerantrag zu stellen. Genau daran scheitert
  Garmin, und genau das wuerde die Google-Verknuepfung auch nicht loesen.
  **Naechster Schritt, wenn Jan das will: iOS zuerst** — dort sitzen beide Fragesteller (Bine und
  VintZ), und es gibt keine Play-artige Freigabehuerde. Vorher die eine offene Frage klaeren:
  darf eine Fremd-App `HKWorkoutRoute` LESEN?

- **🔲 01.09. — Feedback #105 (u225 „Abe", englisch, 28.08.): ueberlappende Bildschirme nach einer
  Session auf der epix.** War mir bisher durchgegangen. Wortlaut: „I have overlapping screens after
  a session on my watch (Garmin watch pix gen 2)… It doesn't break fonctionality but still a tiny
  bug" — dazu: **„I wanted to send you a photo but I can't find where I could do that."**
  **Nachgesehen:** seine Uhr ist eine **epix 2 Pro 42 mm**, seine Session vom 28.08. lief auf
  **1.0.80**, und auch seine neueste (01.09.) laeuft noch auf 1.0.80 — er hat also weder 1.0.82
  noch 1.0.83.
  **Was ich ausschliessen kann:** der 1.0.80-Fix („Gespeichert" nicht mehr unter dem Upload-Screen)
  betrifft den VERBUNDENEN Pfad und setzt dort `stopped = false`; und `UploadView.onUpdate` macht
  `dc.clear()`, faerbt also den ganzen Schirm — ein statischer Ueberlapp kann von dort nicht kommen.
  Bleiben: die Slide-Animation (normal, kein Fehler), ein Layout-gerenderter Schirm, oder Garmins
  eigener Speichern-Dialog ueber unserem.
  **Ohne sein Foto ist alles Weitere geraten** — und das Foto konnte er am 28.08. nicht schicken,
  weil **die Feedback-Anhaenge erst am 30.08. dazukamen**. Jetzt gibt es sie. **Ihn um das Foto
  bitten** (und ihm sagen, dass 1.0.83 im Store liegt); Entwurf liegt bereit.

- **🟡 Zepp 1.0.7 ERNEUT EINGEREICHT — 01.09.2026 (Jans Meldung aus der Konsole).**
  Konsolen-Stand: **„2026.09.01 · Under Review (Can be Withdrawn)"**, darunter die Vorversion
  **„2026.08.24 · Approved"**. **KEIN neues Paket** hochgeladen — nur die Bilder ersetzt und neu
  einreichen lassen, damit es schneller geht; das neue Release (1.0.8, Buildcode 11) kommt direkt
  im Anschluss.
  Jan hat alle Bilder neu hochgeladen, **bis auf das eine, das es nur rund gibt** (s. unten).
  Das Paket meldet ueber 80 unterstuetzte Amazfit-Modelle (Falcon, T-Rex Ultra/3/3 Pro/Ultra 2,
  Cheetah/Pro/2 Pro/2 Ultra, GTR 4, GTS 4, Balance/2/2 XT/3/3 Ti/Ultra, Active/Edge/2/3 Premium/Max,
  Bip 5/6/Max, Rome) — die Liste erkennt die Konsole selbst aus dem ZAB.
  - **🔑 NEUE ERKENNTNIS von Jan: rund und eckig muessen INHALTLICH IDENTISCH sein.** Genau daran
    lag eine **frueher schon einmal** erfolgte Ablehnung — dieselben Bildschirme, einmal rund und
    einmal eckig. In der Doku steht das so nicht; es kam aus einer Ablehnung.
  - **✅ Der Ueberschuss war ein DUPLIKAT, keine fehlende Aufnahme** (Jans Korrektur, meine erste
    Schlussfolgerung war falsch): `zepp-rund-06.png` zeigte dasselbe wie `zepp-rund-01.png` —
    gemessene mittlere Pixel-Abweichung **0,02**, waehrend das naechstaehnlichste Paar der Reihe bei
    4,71 liegt. Geloescht, jetzt **7 zu 7**. Nicht umnummeriert: die Zuordnung laeuft ueber die
    Nummer (nachgeprueft, rund-01…04 und rund-07 treffen ihr eckiges Gegenstueck), eine Luecke bei
    06 ist harmlos, Umnummerieren wuerde die Paarung verschieben.

  Urspruengliche Ablehnung: **🔴 Zepp 1.0.7 ABGELEHNT — 01.09.2026 (Mail von der Zepp Open Platform).**
  Wortlaut des Grundes, vollstaendig: „Please modify the circular preview image and the square
  preview image. For reference: https://docs.zepp.com/docs/distribute/#appic".
  Es geht also **nur um die Store-Vorschaubilder**, nicht um den Code — inhaltlich ist an 1.0.7
  nichts beanstandet. **Jan: „schauen wir uns spaeter an warum"**, also noch NICHT untersucht.
  Wenn wir rangehen: die Vorgaben stehen unter dem verlinkten Anker, unsere Assets liegen in
  `brand/app-icons/` und `brand/stores/`, das App-Icon der Uhr selbst in
  `watch-zepp/assets/common.r/icon.png`. Danach neu einreichen (Buildcode hochzaehlen).
  **LIVE bleibt damit 1.0.4**; im Baum steht schon 1.0.8.
  Urspruengliche Einreichung: **26.08.2026**, Zepp-Konsole „Under Review (Can be Withdrawn)",
  appId 1118995, kostenlos, Buildcode 10. Die Vorversion 1.0.6 stand in derselben Liste mit
  „Approved" vom 24.08.
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

- **📥 05.09. — 31 Frontfluegel konnten NICHT in den Katalog, weil der Hersteller die Zahl nicht
  nennt.** `foils.span_cm` und `foils.area_cm2` sind `NOT NULL` (zu Recht: Streckung und der
  Vergleich „aehnliche Foils" rechnen mit beiden), und geraten wird nicht. Betroffen:
  **Konrad Boarding komplett** (15 Groessen — die Firma veroeffentlicht ueberhaupt keine
  Spannweiten), **AXIS Tempo** (5, Spannweite steht nur im BILD der Herstellertabelle),
  **Ensis Flow Ace** (5), **Zeeko Spitfire** (3), **Levitaz Bionic R2R** (1),
  **MFC HYDROS II FW1600** (1, Flaeche fehlt), **AXIS Spitfire 1180** (1, Flaeche fehlt).
  Die Zeilen liegen vollstaendig in `analyse/foil-recherche/`. Zwei Wege, falls das jemand
  aufloesen will: die Tabellenbilder von axisfoils.com per OCR lesen, oder bei Konrad einmal
  nachfragen. **Nicht** die Spalten nullable machen, ohne vorher zu pruefen, was in
  `community._band_filter` und der AR-Berechnung passiert, wenn die Zahl fehlt.



- **🟢 04.09. — Foil-Namen in der Foil-Statistik sind anklickbar: neue Foil-Detailseite.**
  Nutzer-Vorschlag: „I can already see the foil models in the statistics […] Why not make the
  foil model clickable, so clicking it shows all sessions recorded with that specific front
  wing?" Dazu Jan: die Community-Rekorde fuer genau dieses Foil mit drueber, aber **nur die
  Kacheln, keine Zeitfenster-Tabs**, und die Sessionliste **laedt beim Scrollen nach**.
  - **Neu:** `/foil-stats/:foilId` (`web/src/pages/FoilDetail.tsx`) — Kopf mit Name, Streckung
    und „x Sessions von y Fahrern", darunter die Rekord-Kacheln (Allzeit; bei einem einzelnen
    Fluegel waere „heute" fast immer leer), darunter **alle Sessions der COMMUNITY** mit diesem
    Foil, seitenweise (20 je Seite, IntersectionObserver mit 300 px Vorlauf wie in der
    Sessionliste).
  - **Korrektur noch am selben Tag (Jan):** zuerst standen dort nur die EIGENEN Sessions — „sonst
    sind ja 99 % der Listen fuer mich leer". Stimmt: der Vorschlag lautete „all sessions recorded
    with that specific front wing". Jetzt kommt die Liste aus dem Community-Feed
    (`/api/community/sessions?foil_id=…`), zeigt also alle Fahrer und respektiert dabei weiter
    die Sichtbarkeits-Filter von `_community()` (versteckte Konten, geloescht, gemeldet).
  - **Server brauchte KEINEN neuen Endpunkt:** `_band_filter` in `api/community.py` versteht
    jetzt zusaetzlich die Form **`foil:<id>`** = genau dieses Foil. Alle Rekord-Abfragen laufen
    ohnehin durch diese Funktion (`_record_entry`, `_time_record`, `_carve_record`) — ein
    Parameter haette drei Signaturen geaendert. Der Community-Feed und die eigene Sessionliste
    bekamen je einen `foil_id`-Filter.
  - **Gegengeprueft:** `foil:17` (Sabfoil LEVIATHAN 1550) liefert echte Rekorde von vier Fahrern;
    die Sessionliste dazu zeigt Cony_e, Beat und Tuomo (also fremde Fahrer, obwohl Jan das Foil
    nicht faehrt), und bei `foil_id=11` stehen Philipp und Jan gemischt.
  - Sechs Texte in 17 Sprachen, `docs/PAGES.md` ergaenzt.
  - **Offen (Paritaet):** Android und iOS haben die Foil-Statistik ebenfalls, dort ist der Name
    noch nicht anklickbar. Waere ein eigener Bildschirm je Plattform — lohnt sich, wenn die Seite
    im Web angenommen wird.
  - **Zweiter Vorschlag desselben Nutzers ABGELEHNT (Jan, 04.09., im Community-Chat gesagt):**
    „click on a user's name to view all of their sessions". Begruendung im Wortlaut: *„Bundling
    all sessions per person makes someone's routine too easy to read off. Doesn't seem right to
    me."* — also **keine oeffentliche Sessionliste je Nutzer**. Wichtig fuer spaeter: der Server
    KANN den Community-Feed nach Anzeigename filtern (`/api/community/sessions?name=…`), die
    Oberflaeche ruft ihn aber fest mit `name=""` auf. Das bitte so lassen; wer die Filterung
    freischaltet, baut genau das, was hier abgelehnt wurde.

- **🟢 04.09. — Foil-Band auf der Community-Seite erklaert sich jetzt selbst.** Jan: „es fehlt aber
  eine Info was dann genau die Grenzen sind, und ich weiss auch nicht welche von meinen Foils da
  dann verwendet werden." Beides lieferte der Server schon mit (`foil`, `von`/`bis`,
  `ar_von`/`ar_bis` in `/api/community/foil-bands`) — es stand nur nirgends. Jetzt eine Zeile
  unter der Auswahl, sobald ein Band gewaehlt ist, z. B. fuer Jans Konto:
  „Verglichen wird mit Foils wie deinem **Gong SIRUS XXL** — also **1700–2300 cm² · Streckung
  10,2–14,2**. Referenz ist dein Standard-Foil aus dem Profil; ohne eines dein meistgefahrenes."
  - Fehlt ein Referenz-Foil (kein Standard-Foil mit Flaeche UND Spannweite), sagt die Zeile genau
    das und wo man es setzt — vorher war die Auswahl einfach wirkungslos.
  - Grenzen kommen aus `MINE_FLAECHE_REL = 0.15` (±15 % Flaeche) und `MINE_AR_ABS = 2.0`
    (±2 Streckung), beide in `api/community.py`.
  - Dezimaltrennzeichen ueber `toLocaleString()` statt hart „,": im Englischen steht sonst 10,2
    statt 10.2. 6 Texte in 17 Sprachen.
  - **Offen (Paritaet):** Android und iOS haben denselben Band-Waehler, aber noch nicht die
    Erklaer-Zeile. Reine Textarbeit, kann mit dem naechsten Release mitgehen.

- **🟢 04.09. — Startversuche: nur beim AUTO-Zuschnitt ueber die ganze Aufnahme. Vollstaendige
  Reanalyse durch.**
  - **Regel** (Jan, 04.09.): bei einem Zuschnitt der Automatik zaehlen die Versuche ueber die
    ganze Aufnahme (die Fehlversuche liegen genau davor), bei einem MANUELLEN nur innerhalb —
    dort hat der Nutzer Autofahrten und vergessene Stopps ausdruecklich weggeschnitten. Neue
    Spalte `sessions.trim_auto`, gesetzt von `maybe_auto_trim` (true) bzw. `set_trim` (false).
  - **Bestand eingeordnet:** 1624 Sessions mit Zuschnitt → **1424 Automatik, 187 manuell**
    (erkannt daran, dass ein Auto-Zuschnitt exakt [erster Lauf −15 s, letzter +15 s] ist).
  - **Reanalyse** (Sicherung vorher: `~/foil-analysis-backups/vor-reanalyse-2026-09-04.dump`,
    129 MB, `analysis_results` + `sessions`): **2100 Sessions gerechnet, 200 geaendert, 26 min.**
    Ein Deadlock (#1232) einzeln nachgeholt, 23 Laeufe. Log:
    `~/foil-analysis-backups/reanalyse-2026-09-04.jsonl`.
    Verteilung der Aenderungen: **avg_hr 90 · pumps 93 · max_hr 76 · Laeufe 33 · Versuche 5 ·
    Pumpfoil-Einordnung 6** (5 gewinnen sie, 1 verliert sie). Der Puls-Anteil kommt vom
    Einfrier-Fix von heute, die Laeufe vom Despike-Fix.
  - **Manuell zugeschnittene Sessions blieben draussen** (Jans Vorgabe) — die 187 tragen damit
    weiter den alten Stand. Wenn du willst, koennen sie mit: die neue Regel schuetzt ihren
    Zuschnitt ja jetzt.
  - **Fuenf Sessions mit unbekannter Zuschnitt-Art** (`trim_auto` NULL, weil sie heute keine
    Laeufe haben) zaehlen jetzt weniger Versuche, z. B. #1841 14 → 1, #2089 10 → 1. Nachgemessen:
    ihre Punkte AUSSERHALB des Zuschnitts liegen **median 2–77 m vom Spot** — es sind also keine
    Heimfahrten, sondern Anlaeufe am Wasser. Bei ihnen ist der vorsichtige Weg (Zuschnitt gilt)
    strenger als noetig; ein Wort von dir und ich setze sie auf „Automatik".

- **🟢 05.09. — iOS/Apple Watch 1.1.30 (34) FREIGEGEBEN UND LIVE.** Freigabe-Mail „ready for
  distribution" am 05.09.; **an der Produktseite gegengeprueft** (apps.apple.com/de zeigt
  „Version 1.1.30", erschienen vor gut drei Stunden, Apple Watch in der Kompatibilitaet) — die
  `lookup`-API wurde bewusst nicht gefragt, die haengt nach einer frischen Freigabe nach.
  Nachgezogen: `appmeta.ios` **und** `appmeta.apple` auf 1.1.30, Changelog-Eintrag vom
  5. September, `watch-apple/project.yml` auf **1.1.31 (35)** fuer die naechste Einreichung.
  Eingereicht war sie am 04.09. 08:51 — knapp einen Tag Pruefung. Drin:
  gemerkte Kartenansicht, misslungene Startversuche auf der Karte, Rueckfall bei nicht
  verfuegbarem Farbmodus, Karte auch ohne erkannte Laeufe, „Auswahl leeren" im Vergleich,
  haengengebliebene Uploads mit `ueberholt`, Hinweis bei eingefrorener Ortung, Apple Watch
  schreibt keinen veralteten Puls mehr, fehlender Puls weiss, Handy-Recorder 2 s statt 3 s,
  Foil-Rechner mit Trefferliste erst bei Suche. **Nach der Freigabe:** `appmeta.ios` UND
  `appmeta.apple` ziehen, Changelog, `project.yml` auf 1.1.31 (35).

- **🟢 04.09. — JoLes Wear-Feedback abgearbeitet (u396, Pixel Watch 2, selbst Wear-Entwickler).**
  Vier Punkte, alle vier angefasst:
  1. **Puls setzte lange aus.** An seinen Daten nachgemessen: 59 echte Messwert-Wechsel in
     81 Minuten, Median-Abstand 2 s — aber Luecken von **29, 28 und 9 Minuten**. Wir benutzen
     `ExerciseClient` schon, hatten aber zwei Loecher: das Ergebnis von `startExerciseAsync`
     wurde nie ausgewertet (scheitert der Start — z. B. weil eine andere App eine Uebung haelt —
     fielen wir stumm auf den passiven Sensor zurueck), und der `ExerciseState` in den Updates
     wurde gar nicht gelesen (endete die Uebung, lief es stumm weiter). Jetzt: beides
     ausgewertet, dazu ein **Waechter**, der die Messung neu anfordert, wenn 2 Minuten kein Wert
     kam (hoechstens 8-mal je Aufnahme), und ein sichtbarer Hinweis „Puls passiv" auf der
     Aufnahme-Seite. **Ursache offen und bewusst nicht behauptet:** Jans Verdacht (Uhr taucht
     unter, Display nass) ist genauso plausibel wie eine fremde App — der Fix wirkt in beiden
     Faellen.
  2. **Always-on griff nicht, App ging nach ~2 min zu.** Der `AmbientLifecycleObserver` haengt
     jetzt an `MainActivity.onCreate` statt an einem Compose-`DisposableEffect` waehrend der
     Aufnahme — so verlangt es die AndroidX-Doku. Damit die App im Leerlauf trotzdem dem
     Watchface weicht, treten wir in `onEnterAmbient` freiwillig zurueck (`moveTaskToBack`).
     **Nebenbefund:** unser `targetSdk` ist **36** — auf Wear OS 6 gilt die App damit ohnehin als
     always-on (Google-Doku), auf Wear OS 5 (seine Uhr) zaehlt weiter der Beobachter.
  3. **Ongoing Activity sprang nicht zurueck.** Dem Touch-Intent fehlte `FLAG_ACTIVITY_NEW_TASK`.
     Der PendingIntent wird vom SYSTEM ausgeloest, nicht aus einer Activity heraus — ohne das
     Flag startet nichts. Ergaenzt.
  4. **Wassersperre fehlte.** Beim Pumpen schlaegt Wasser aufs Display und loest Aktionen aus.
     Jetzt ein Tropfen-Knopf oben links auf der Aufnahme-Seite; er schickt
     `com.google.android.wearable.action.ENABLE_WET_MODE` mit `relaunch_component_name`, damit
     nach dem Entsperren wieder UNSERE Aufnahme vorn steht. Von Google nicht dokumentiert, aber
     der uebliche Weg — JoLe hat den Code aus seiner eigenen App verlinkt.
  **Geht mit Wear 1.2.26 raus**, sobald Play die 1.2.25 freigegeben hat. Auf einer echten Uhr
  ist davon nichts geprueft (Emulator kann Health Services nicht, s. `imEmulator()`).

- **🟢 04.09. ERLEDIGT — „Bad experience with app": wir haben einem Pumper Motorkraft unterstellt,
  weil seine Uhr den Puls einfror.** Session #3391 (u396, Pixel Watch 2) trug diesen Titel vom
  Nutzer selbst. Kette:
  1. Die Uhr mass zeitweise keinen Puls mehr. Unsere Recorder schrieben den **letzten bekannten
     Wert in jeden GPS-Punkt** weiter — 4778 Punkte, nur 46 verschiedene Werte, der Wert 168 stand
     **1658 Sekunden am Stueck**.
  2. Die Fremdkraft-Regel (`detect_v2._fremdkraft_laeufe`) urteilt allein ueber die **Puls-Antwort**
     (Puls im Lauf minus Grundlinie davor). Bei stehendem Puls ist sie exakt **0,0 bpm** — und
     alles unter 15 gilt als „ohne eigene Kraft".
  3. Getroffen wurden **genau seine drei laengsten Laeufe** (6:51, 8:28, 16:03 — mit 527, 677 und
     1402 Pumps). Er musste sie einzeln zurueckholen.
  - **Nicht geraetespezifisch:** 18 von 167 Sessions mit Accel (**11 %**) haben >= 5 Minuten
    konstanten Puls — Wear OS, Apple Watch UND Garmin.
  - **Geprueft und verworfen:** der Pump-Rhythmus taugt NICHT als Ersatz-Signal. efoil-Laeufe
    kommen auf 1,54 Pumps/s, echte Pumpfoil-Laeufe auf 1,63 — die Verteilungen ueberlappen fast
    vollstaendig. Der Puls bleibt das einzige Signal, wie es im Code steht.
  - **Fix 1 (Server, wirkt rueckwirkend):** `_puls_lebt()` prueft vor dem Urteil, ob der Puls im
    Lauf ueberhaupt lebt (laengste Kette identischer Werte < 120 s). Steht er, wird **nicht
    geurteilt** — die Doktrin stand schon im Code, sie griff nur nicht, wenn ein Puls DA ist,
    aber steht. **Regressions-Beleg:** von 50 menschlich als Fremdkraft eingeordneten langen
    Laeufen hat **kein einziger** einen eingefrorenen Puls im Lauf, von 41 echten Pumpfoil-Laeufen
    dagegen 5 (12 %). Kostet also keinen einzigen echten Treffer.
  - **Fix 2 (Uhren):** kein veralteter Puls mehr in den Punkten. Wear (`Recorder.kt`) und Apple
    Watch (`Recorder.swift`) schreiben 0 statt eines Werts, der aelter als 10 s ist — **Zepp macht
    das laengst so** (`page/index.js`, Zeile 1909, dieselben 10 s), und **Garmin** bekommt von
    Connect IQ `null` statt eines alten Werts, dort ist nichts zu tun.
  - **Reanalysiert:** #3077 (u114) — dort war der einzige noch offene Vorschlag, der auf einem
    eingefrorenen Puls beruhte; die Session hat ihren Lauf zurueck und gilt wieder als Pumpfoil.
    #3391 ebenfalls neu gerechnet.
  - **Nutzer informiert** (DM, kurz: was das Problem war und dass wir bei eingefrorenem Puls nicht
    mehr aussortieren).
  - **Offen, kleiner:** ein eingefrorener Puls verfaelscht auch Puls-Kacheln, Zonen-Faerbung und
    das Datenfeld „Max-Puls letzter Lauf". Rueckwirkend liesse sich das mit derselben Messung
    kenntlich machen (wie `gps_frozen`) — noch nicht gebaut.

- **🟢 04.09. — COROS ist offen, ohne Partner-Vertrag: MCP-Anbindung gebaut.**
  COROS hat auf unseren Antrag vom 16.07. geantwortet: statt des klassischen Partner-Wegs gibt es
  jetzt einen **MCP-Server** — „no application or approval needed", OAuth 2.0.
  - **Selbst geprueft (04.09.):** `https://mcpeu.coros.com` veroeffentlicht seine OAuth-Metadaten
    und erlaubt **Dynamic Client Registration** (`/connect/register`). Unsere Registrierung lief
    durch → oeffentlicher Client, `token_endpoint_auth_method: none`, also **PKCE Pflicht**,
    Scopes `openid mcp.tools offline_access`. Client-ID steht in `server/.env`
    (`OAUTH_COROS_MCP_CLIENT_ID`).
  - **Wichtig fuer uns:** der Server bietet `querySportRecords` UND
    `downloadActivityFitFiles` — die **FIT-Datei** kommt also mit, damit auch die GPS-Spur.
    Kontingent **50 FIT-Dateien je Konto und Kalendertag**; unser Sync holt hoechstens 25.
  - **Gebaut:** `server/app/api/coros_mcp.py` (OAuth mit PKCE, MCP-Transport ueber JSON-RPC mit
    Sitzungs-ID, JSON *und* SSE-Antworten, `/sync` mit FIT-Import ueber `import_parsed_session`),
    Tabelle `coros_mcp_links`, Karte auf `/konten` (der MCP-Weg hat Vorrang vor dem Partner-Weg,
    `coros.py` bleibt unangetastet).
  - **Am echten Server ausgemessen (04.09., Jans Konto verknuepft):** `tools/list` liefert die
    Schemata aller 22 Werkzeuge — das IST die Spezifikation. Zwei Dinge stehen darin aber
    irrefuehrend, beide haben je einen Anlauf gekostet:
    1. **Datumsformat ist `YYYYMMDD`.** Mit `2026-06-01` antwortet der Server nicht mit einer
       Fehlermeldung, sondern mit „Tool call anomalies detected. High risk of session context
       pollution…". Das ist seine Art, ungueltige Eingaben abzulehnen — wer die Meldung sieht,
       hat einen Parameter falsch, nicht ein Kontingent gerissen.
    2. **`downloadActivityFitFiles` kann NUR je Aktivitaet** (`labelId` + `sportType`), obwohl
       sein Schema `startDate`/`endDate`/`limit` anbietet: jede Zeitraum-Form wird abgelehnt,
       eine erfundene `labelId` liefert dagegen eine echte Fehlermeldung („COROS did not return
       a FIT file URL for labelId: …"). Also erst `querySportRecords`, dann je Eintrag die Datei.
    Der Sync ist auf genau diese Form umgebaut. Gegengeprueft hat auch `queryUserInfo` und
    `queryDevices` funktioniert — die Verknuepfung steht also wirklich.
  - **Weiterhin offen, weil Daten fehlen:** Jans COROS-Konto hat keine gebundene Uhr und keine
    Aktivitaeten („No sport records found"). Die Liste kommt in **Prosa** zurueck, nicht in JSON;
    `_aktivitaeten_aus()` liest deshalb strukturiert ODER per Regex aus dem Text. **Das muss an
    einem Konto MIT Trainings gegengeprueft werden**, bevor COROS aus „wartet auf Freigabe" in
    die Liste der verfuegbaren Plattformen wandert (Uhren-Tabelle, Startseite, Banner).
  - **Region:** wir sind auf `mcpeu.coros.com` registriert (dorthin verweist `mcp.coros.com` von
    hier aus). Meldet spaeter jemand ausserhalb Europas „keine Trainings gefunden", ist das der
    erste Verdacht — dann braucht es die Registrierung je Region (`mcpus`, `mcpcn`).
  - Offen aus der Mail: fuer Webhooks/Zwei-Wege-Sync/Mehrnutzer-Zugangsdaten kommt COROS
    „in den kommenden Wochen" aktiv auf Plattformen zu — das waere der Weg zum Push statt Abruf.

- **📥 03.09. (Frédéric, Feedback android-app) — Xiaomi/Redmi als Uhr-Plattform pruefen.**
  Wortlaut (fr): ob es ein Update fuer andere Uhrenmarken gibt, er habe eine **Redmi Watch**.
  Das ist eine Luecke in der Roadmap-Betrachtung: Redmi/Xiaomi-Uhren laufen auf **HyperOS/Vela**
  (NuttX-Basis), NICHT auf Wear OS — der Zepp-Zweig (Amazfit) deckt sie also nicht ab. Zu klaeren:
  (a) welche Modelle wirklich Vela sind und welche Wear OS (die **Xiaomi Watch 2 / 2 Pro** laufen
  Wear OS — dort wuerde unsere App schon heute funktionieren); (b) ob es fuer Vela ueberhaupt ein
  oeffentliches SDK fuer Dritt-Apps gibt.
  **Jan (03.09.): direkt nach dem GPS-Thema angehen. ANTWORT IST RAUS** — ihm wurde geschrieben,
  dass wir Xiaomi „prochainement" unterstuetzen wollen. Damit haengt an der Recherche jetzt eine
  oeffentliche Zusage; wenn Vela keine Dritt-Apps zulaesst, muss er das von uns hoeren.
  **Recherche vom 03.09. (belegt, Quellen unten):**
  - **Eigene App auf der Uhr = praktisch zu.** Es gibt Vela **Quick Apps** (VelaJS, `.rpk`) und
    die noetigen Bausteine waeren da (`Geolocation`, `Sensor`, `fetch`, `uploadtask`,
    `File Storage`). ABER: **kein oeffentlicher Store und kein Review-Weg** — installiert wird
    per Sideload ueber das Debug-Menue von Mi Fitness, und den Zugang dazu gibt es laut Xiaomis
    eigener FAQ nur „ueber die Business-Gruppe", mit einer Mail-Adresse als Kontakt. Dazu:
    **Hintergrund-Ausfuehrung ist in der API-Liste nicht dokumentiert** — fuer einen Recorder,
    der mit ausgeschaltetem Bildschirm weiterlaufen muss, ist genau das die Existenzfrage. Und
    fuer die **Redmi Watch 5** sagt Xiaomis Support-Artikel, dass sie Dritt-Apps gar nicht
    unterstuetzt.
  - **Kontoverknuepfung ist der realistische Weg (Jans Idee, 03.09.).** Mi Fitness synchronisiert
    Trainings zu **Strava, Google Fit — und Suunto**. Die **Suunto-Anbindung haben wir schon
    live** (`server/app/api/suunto.py`): ein Xiaomi-Nutzer koennte seine Sessions also
    moeglicherweise **heute schon** zu uns bringen, ohne dass wir eine Zeile bauen.
    **Zu pruefen:** ob ueber diesen Weg die GPS-Spur mitkommt (Strava warnt ausdruecklich, dass
    Mi-Fitness-Aktivitaeten OHNE GPS bei ihnen ohne Distanz ankommen).
    **✅ 03.09. ANGEFRAGT:** Frederic (u417) hat per DM die Anleitung bekommen (Mi Fitness →
    Suunto verknuepfen, dann bei uns Profil → Konten verknuepfen → Suunto, dann eine Session
    fahren) samt der Bitte, das fuer uns zu testen. **Wir warten auf seine Rueckmeldung.**
    Ihm wurde dabei ehrlich gesagt, dass eine App direkt auf der Redmi Watch derzeit nicht geht.
    Nachgeschoben (Jan, 03.09.): er muss dafuer **nicht aufs Wasser** — zwei, drei Minuten
    Spaziergang reichen. Wichtig ist nur, dass es eine **Outdoor**-Aktivitaet ist; ein
    Indoor-Training hat gar keine Spur und der Test waere wertlos.
    **✅ 04.09. GETESTET — DER WEG FUNKTIONIERT.** Frederic hat den Spaziergang gemacht
    (Trelex bei Nyon, 221 m, 105 s). Ergebnis: **Mi Fitness → Suunto traegt die GPS-Spur mit**,
    88 Punkte plus Pulskurve (69–137). Damit ist Xiaomi ueber die Kontoverknuepfung
    **erledigt** — ohne dass wir je eine Uhr-App bauen muessen.
    **Gescheitert war es an UNS, nicht an der Kette.** Er meldete „0 importiert / 1 ignoriert",
    und der Grund war ein Parser-Absturz: die von Mi Fitness erzeugte FIT-Datei deklariert
    **jedes Mehr-Byte-Feld als `byte`-Array** statt als den richtigen Zahlentyp
    (`timestamp` profil-typ `date_time`, basis-typ-in-datei `byte`, Groesse 4). `fitparse`
    liefert daraufhin Tupel statt Zahlen und stirbt an
    `'>=' not supported between 'tuple' and 'int'` — die ganze Datei war unlesbar.
    Die Werte selbst sind in Ordnung, nur falsch verpackt: in der von der Datei angegebenen
    Byte-Reihenfolge (`>`) zusammengesetzt kommt exakt heraus, was Suunto meldet (221,0 m,
    Startzeit 1788531124). **Behoben** in `fitimport._reparatur_prozessor()` — eng gefasste
    Bedingung, an 16 gesunden FIT-Dateien (Garmin fenix/FR, unsere eigenen) gegengeprueft:
    **null Abweichung**, GPS-Punkte und Accel-Bytes byteweise identisch.
    Seine Session ist jetzt da: **Session 3453** (`/sessions/3453`, `detection=gps_only`,
    80,7 m nach Auto-Trim, 1 „Lauf" à 38 m bei 2,97 m/s — Schrittgeschwindigkeit, wie erwartet).
    **Zweite Beschwerde, ebenfalls berechtigt:** „und mit dieser Information kann ich nichts
    anfangen" — die Meldung nannte nur Zahlen. Der Sync gibt jetzt `reasons` heraus
    (`suunto._grund_code`: `kein_gps` · `doppelt` · `zu_kurz` · `gefiltert` · `spaeter` ·
    `fehler`), die PWA haengt sie an die Meldung an, in allen 17 Sprachen. Dabei fiel auf, dass
    der Zaehler log: `import_parsed_session` gibt bei einem Doppel-Treffer die VORHANDENE Session
    zurueck, nicht `None` — deshalb meldete der erste Lauf „2 importiert", obwohl eine Session
    ankam (einmal ueber die Liste, einmal aus der Warteschlange). Jetzt an der ID geprueft.
    **Offen:** dasselbe `reasons`-Feld fuer Polar/COROS/Strava, und die Anzeige in Android/iOS.
  - **Health Connect** (Android, unsere Handy-App): Mi Fitness schreibt dorthin. Offen, ob auch
    die `ExerciseRoute` (GPS) mitgeht — Routen brauchen zusaetzlich `READ_EXERCISE_ROUTES` und
    eine eigene Zustimmung je Session. Waere der datenschutzfreundlichste Weg (nichts verlaesst
    das Geraet ueber einen fremden Dienst) und wuerde nebenbei **viele** Uhren abdecken.
    Hinweis: das ist NICHT dasselbe wie die zurueckgestellte Google-Fit-API
    ([[google-fitbit-integration-deferred]] — die hatte keine Positionen).
  - **Sofort moeglich, ohne Bauen:** Xiaomi-Konto → Datenexport (account.xiaomi.com, „Manage Your
    Data" → Mi Fitness) und die Datei bei uns hochladen; unser FIT/GPX/TCX-Import steht.
    Ebenfalls zu pruefen, ob dort Spuren drin sind.
  - **Nicht empfohlen:** kommerzielle Aggregatoren (Spike API, Rook) — sie loesen es technisch,
    aber die Daten liefen ueber einen Dritten, das widerspricht der Datenschutz-Linie.

  Quellen: `iot.mi.com/vela/quickapp/en/guide/` + `.../features/` + `.../guide/other/faq.html`,
  `support.strava.com` „Mi Fitness and Strava", `mi.com/global/support/faq/details/KA-517372`,
  `mi.com/uk/support/article/KA-674516` (Redmi Watch 5 ohne Dritt-Apps).

  **Alte Ausgangspunkte, weiterhin gueltig:**
  - **Xiaomi Watch 2 / 2 Pro laufen Wear OS** → unsere bestehende Wear-App sollte dort laufen.
    Das waere der schnelle Teil-Erfolg und die konkrete Antwort an Nutzer mit diesen Modellen.
  - **Redmi Watch (3/4/5) und die Xiaomi-Watch-S-Reihe laufen Vela/HyperOS** (NuttX-RTOS), also
    NICHT Wear OS und auch nicht Zepp OS. Offen: ob es dafuer ein oeffentliches App-SDK und einen
    Store-Weg fuer Dritte gibt (openvela ist seit 2024 quelloffen — das heisst aber nicht, dass
    man auf ein Seriengeraet eine eigene App bekommt). **Genau das ist die Frage, an der alles
    haengt.**
  - Erst danach die Aufwandsschaetzung: der Recorder-Vertrag steht (`docs/ingest-contract.md`),
    ein neuer Zweig ist vor allem GPS + Accel + Upload.

- **🟢 03.09. ERLEDIGT — eingefrorene Ortung: Uhr warnt, Server erkennt es, Anzeige erklaert es.**
  Ausgeloest von einer Nutzer-Meldung („es misst nur Herzfrequenz, kein GPS", u418, Galaxy Watch
  Ultra). Befund: das Geraet liefert gar keine eigene Ortung, sondern wiederholt einen
  zwischengespeicherten Fix — 2491 Fixes, 71 verschiedene Positionen, eine davon 625-mal
  hintereinander, gemeldete Genauigkeit konstant 3,8 m. Gesunde Vergleichs-Session: 1306
  verschiedene Positionen auf 2702 Fixes. `gpsPoor` (hAcc > 20 m) greift dabei NICHT.
  **Nicht geraetespezifisch:** u394 hat dasselbe Muster auf einer OnePlus Watch, u145 einmal 2026.
  - **Uhr (Wear, vorbereitet fuer 1.2.26):** `RecorderService` gibt das ALTER der Messung mit
    (`elapsedRealtimeNanos`), `Recorder` zaehlt Fixes aelter als 5 s; 20 in Folge → `gpsStale`.
    Dann zeigt das Tempo-Feld „--" statt eines beruhigenden 0,0 (gpsPoor gilt mit) — **und das
    reicht nicht**: „--" liest sich wie „ich stehe ja noch am Steg" (Jan, 03.09.). Deshalb drei
    Stufen, alle drei noetig, weil man auf dem Wasser NICHT auf die Uhr schaut:
    1. **Vor dem Start:** „GPS bereit" wird nur noch gruen, wenn der Fix genau UND frisch ist
       (< 5 s). Ein zwischengespeicherter Fix meldet beste Genauigkeit und haette die Uhr sonst
       bereit gemeldet, obwohl sie gar nicht ortet. Genau hier faellt es auf, solange man noch
       am Steg steht.
    2. **Waehrend der Aufnahme:** eine GANZE rote Seite ueber allem — gross „GPS", darunter der
       Satz und „Antippen zum Wegblenden". Die Zahlen darunter sind ohnehin wertlos. Wegtippen
       laesst den schmalen gelben Balken stehen; friert die Ortung erneut ein, kommt die Seite
       wieder.
    3. **Fuehlbar:** beim Umschlagen einmal `long2`, danach alle zwei Minuten `short2`, solange
       es anhaelt. Das ist der einzige Kanal, der waehrend der Fahrt ankommt.
    **Warum das Alter und nicht „die Koordinaten aendern sich nicht":** wer am Steg steht, steht
    wirklich still — ein echter Fix wird trotzdem jede Sekunde neu GEMESSEN.
  - **Server:** `gps.eingefrorene_ortung()` misst den Anteil exakt wiederholter Positionen,
    ab 60 % gilt sie als eingefroren; Ergebnis in `metrics_json` (`gps_frozen`,
    `gps_frozen_share`). Bewusst NICHT in `data_quality` — das ist die Moderations-Spalte.
    **Validiert an 225 Sessions:** 4 Treffer bei 3 Nutzern, ALLE mit null Laeufen, kein
    Fehlalarm auf eine Session mit Laeufen.
  - **Anzeige (Web + Android + iOS):** eigener Hinweis `sd.gpsFrozen` in 17 Sprachen statt des
    allgemeinen Nur-GPS-Satzes — inkl. dem, was hilft (Handy nicht mit ans Wasser, Bluetooth aus).
    Auf iOS zusaetzlich zur `gps_only`-Bedingung gepruefte Sonderfall: die betroffenen Sessions
    haben Accel, laufen also als `detection=model`.
  - **Reanalysiert:** 3375/3388 (u418), 3314 (u394), 1659 (u145) tragen den Befund jetzt.
    3351 (9 min, 57 %) bleibt knapp darunter — Schwelle absichtlich nicht gedehnt.
  - **Offen (bewusst):** zusaetzlich `LocationManager.GPS_PROVIDER` abonnieren und echte
    GNSS-Fixes bevorzugen. Erst bauen, wenn die Messung zeigt, dass Warnung + Hinweis nicht
    reichen. **Wear-Version NICHT gebumpt** — geht mit 1.2.26 raus, sobald 1.2.25 frei ist.

- **🟢 03.09. ERLEDIGT — „mein Polar-Import ist fehlgeschlagen" war ein Analyse-Fehler, kein
  Import-Fehler.** Nutzer-Meldung im Chat (u17, 16:03). Session #3340 lag da (Saint-Maur, 3,3 km),
  stand aber auf `is_pumpfoil = False` und fehlte damit in seiner Pumpfoil-Liste.
  - **Ursache:** `detect_v2._clean_speed` war ein NACHBAU von v1s Signalaufbereitung und liess
    zwei der vier Glitch-Regeln aus — den isolierten Despike (`gps.py`, Einzel-Peak ueber beiden
    Nachbarn, damals fuer #426) und den Endpunkt-Clamp. Der Docstring behauptete „dieselben
    Regeln wie v1". Seit `DETECTOR_V2=1` (01.08.) wirkte also nur die schwaechere Kette.
  - **Am Fall gemessen:** das Polar-TCX enthaelt Sekunden wie 0,0 / 42,9 / 15,8 km/h. Roh 42,9 —
    v2-Kette 31,5 — volle Kette 22,2 km/h. Bei 31,5 lag die Session ueber dem 30-km/h-Tor der
    `gps_only`-Klassifikation (`analysis/__init__.py`) und fiel aus der Pumpfoil-Liste.
  - **Fix:** eine gemeinsame `gps.clean_speed_series()`; v1 ruft sie auf, v2 delegiert dorthin.
    Reihenfolge und Konstanten unveraendert. Regressions-Check: auf 385 von 385 juengsten
    Sessions mit GPS-Datei **bit-identisch** zur alten v1-Kette.
  - **Reanalyse (18 Sessions, gezielt):** Ist-Zustand vorher gesichert
    (`~/foil-analysis-backups/vor-despike-fix-2026-09-03.jsonl`). #3340 kippt auf Pumpfoil
    (Max 31,4 → 21,3 km/h, Laeufe 10 → 22). #1200 bleibt aussortiert — dort sind die 31,9 km/h
    echt. Die uebrigen 16 behalten ihre Einordnung, mehrere Maxima werden realistisch
    (412: 27,1 → 20,4 · 985: 25,0 → 18,6 · 625: 26,6 → 23,2). Bestenlisten unberuehrt.
  - **Merksatz fuers Nutzer-Support:** „Import fehlgeschlagen" heisst bei verknuepften Konten
    fast immer „Session ist da, aber aussortiert". Erst `is_pumpfoil` + `analysis_results.detection`
    ansehen, dann das 30-km/h-Tor gegen den 5-s-Max pruefen.

- **🟢 03.09. ERLEDIGT — Polar-Import verschluckte Fehlschlaege und machte sie unwiederholbar.**
  `polar._pull_import` warf jedes Training in `try/except: skipped += 1` und bestaetigte die
  Exercise-Transaktion am Ende **immer** (`PUT`). Ein wirklich gescheitertes Training war damit
  bei Polar als gelesen markiert und ueber `/sync` nie wieder holbar — ohne eine Zeile im Log.
  **Jetzt:** zwei getrennte Zaehler. „Uebersprungen" = es gibt nichts zu holen (Indoor ohne GPS,
  schon importiert, bewusst geloescht) → Transaktion wird bestaetigt. „Gescheitert" = wir konnten
  es nicht lesen (Netz, HTTP, kaputtes TCX) → Transaktion bleibt OFFEN, laeuft bei Polar ab und
  die Trainings kommen im naechsten Anlauf wieder. Je Fehlschlag eine `log.error`-Zeile mit
  Exercise-URL und Fehlertyp. Damit die Warteschlange nicht dauerhaft an einem unlesbaren Training
  klemmt: `polar_links.retry_count` zaehlt, nach **3** offenen Anlaeufen wird trotzdem bestaetigt
  (mit `log.error`, damit es nachvollziehbar bleibt); ein 204 („nichts Neues") setzt den Zaehler
  zurueck. `/sync` liefert zusaetzlich `failed` und `retry_pending` — die Oberflaeche zeigt weiter
  imported/skipped und bleibt unveraendert.
  **Geprueft** ohne Polar anzufassen (gefaelschtes httpx, `scratchpad/polar-test.py`): alles
  importiert → bestaetigt · ein HTTP 500 → nicht bestaetigt, Zaehler 1 · dasselbe bei Zaehler 3 →
  bestaetigt und Zaehler zurueck · Indoor ohne GPS → bestaetigt. Migration + Neustart durch,
  8 Links stehen auf 0.
  **Suunto hat das Problem nicht** (kein Transaktions-Modell, Webhook je Workout).

- **🟢 03.09. ERLEDIGT (Sichtbarkeit) — 33 haengengebliebene Uploads von 31 Nutzern, davon 30
  UNSICHTBAR.** Gefunden beim Lagebild-Check (Jan: „schauen mal, ob's neues Feedback gab oder
  irgendwas Ungewoehnliches"). Rein lesend ausgezaehlt:
  - 33 Sessions stehen auf `recording`/`live` und wurden nie fertig hochgeladen (31 verschiedene
    Nutzer; 1× Juli, 29× August, 3× September).
  - **Nur 3 liegen im 48-Stunden-Fenster** von `/api/sessions/in-progress` und erscheinen damit in
    der Upload-Karte auf Home/Sessions. **30 sind aelter** — und 27 von ihnen haben
    `is_pumpfoil = NULL`, tauchen also auch in der normalen Sessionliste NICHT auf. Der Nutzer sieht
    seine Aufnahme nirgends und kann nichts tun.
  - **16 der 33 haben >= 60 Bloecke**, also wahrscheinlich genug fuer eine Auswertung.
  - Beispiele: u421 60/112 Bloecke (Erstnutzer, seit 16 h), u354 155/801, u341 2464/10117,
    u284 3/1092, u127 235/746 (seit 137 h).
  **Zweiter Befund: die Karte sagt das Falsche.** Sie meldet „laedt hoch, aktualisiert sich gleich"
  — auch wenn seit 16 Stunden kein Block mehr angekommen ist. `ingest_chunks.received_at` gibt es,
  ein stehender Upload ist also erkennbar.
  **Vorschlag, zwei getrennte Schritte:**
  1. **Klein und ohne Risiko:** `letzter_block`/`steht_seit_s` in `/in-progress` mitgeben und die
     Karte umschreiben lassen — steht der Upload > ~30 min, heisst der Text „Upload steht: oeffne
     die App auf der Uhr (WLAN), dann laeuft er weiter" statt „gleich fertig".
  2. **Jans Entscheidung, weil es Nutzerdaten und die Pipeline beruehrt:** was mit den 30 alten
     passiert — sichtbar machen als „unvollstaendig" in der Sessionliste, und/oder die 16 mit
     genug Daten auswerten lassen. NICHT ohne OK anfassen.

  **Umgesetzt am 03.09. nach Jans Regel** („blende den Hinweis nur aus, wenn danach keine weitere
  neuere Session uebertragen wurde ... dann ist die vielleicht noch immer auf der Uhr und der
  Hinweis kann ohne Limit dauerhaft bleiben"):
  - `list_in_progress` (`server/app/api/sessions.py`): **48-Stunden-Fenster entfernt**, dafuer ein
    neues Feld `ueberholt` — wahr, wenn nach dieser Aufnahme eine andere Session desselben Nutzers
    mit Status `complete`/`analyzed` gestartet wurde. Dann hat die Uhr ihren Puffer weitergedreht,
    zu holen ist nichts mehr.
  - Karten auf allen drei Plattformen (`web/src/components/UploadProgressCard.tsx`,
    `android/.../UploadProgressCard.kt`, `watch-apple/Sources-iOS/UploadProgressCard.swift`):
    bei `ueberholt` steht statt „App auf der Uhr oeffnen" der Hinweis, dass die Aufnahme nicht mehr
    auf der Uhr liegt — mit GPS-Daten „antippen zum Auswerten", ohne Daten „in der Session loeschen".
    Zwei neue Schluessel `upload.supersededHint`/`upload.supersededEmpty` in allen 17 Sprachen.
  - **Wirkung an echten Daten gemessen:** sichtbare Upload-Karten **3 → 33** (31 Nutzer), davon
    **8 ueberholt** (u88/2152, u125/2296, u184/2291, u194/2686+2684, u226/2609, u264/1984, u354/2950)
    und **25 weiterhin von der Uhr holbar** (u341 2464/10117, u421 60/112, ...).
  - **Punkt 2 bleibt offen:** die 27 mit `is_pumpfoil = NULL` fehlen weiter in der normalen
    Sessionliste, und die 16 mit >= 60 Bloecken sind nicht ausgewertet. Beides ruehrt Nutzerdaten an
    → weiter auf Jans OK.

- **✅ 03.09. — iOS/Apple Watch 1.1.29 (33) ist FREIGEGEBEN und live.** Mail „ready for
  distribution", an der Produktseite gegengeprueft (zeigt „Version 1.1.29"). Eingereicht 02.09.
  17:55 — keine 24 Stunden Pruefung.
  **Erledigt:** `appmeta.ios` UND `appmeta.apple` auf 1.1.29, Server neu gestartet
  (`/api/app/latest?platform=ios` liefert es), Changelog-Eintrag geschrieben, PWA neu gebaut.
  `watch-apple/project.yml` steht fuer die naechste Einreichung auf **1.1.30 (34)**, beide Ziele.
  **Damit ist die Changelog-Warnung zu 1.1.28 aufgeloest** („Videos im Feed bleiben schwarz") —
  der Error-153-Fix ist ausgeliefert, samt Trefferflaeche der Kacheln und Wischen.
  **Offen bleibt nur noch Android:** Phone 1.1.25 (39) + Wear 1.2.25 (1035) sind seit 02.09. in
  Pruefung; nach „live" UND 100 % Roll-out `appmeta.android`/`appmeta.wear` setzen. Zepp 1.0.7
  weiter „Under Review".

- **✅ 02.09. — Admin-Tab „System" + Push bei Warnungen.** Jans Wunsch, nachdem `/tmp` unbemerkt
  auf 86 % gelaufen war. Server: `api/health.py` (CPU-Stichprobe, Last je Kern, Speicher/Swap,
  alle Dateisysteme, groesste Prozesse nach CPU und RSS, Dienste, die vier Zeitgeber, Units im
  Fehlerzustand, Postgres samt Verbindungen/laengster Abfrage/groesster Tabellen, Alter+Umfang des
  Backups inkl. GPG-Umschlag, OOM-Kills 24 h). Bewertung serverseitig als `warnungen`.
  **Push:** `foil-health.timer` (alle 5 Minuten, `deploy/foil-health.*`, installiert und aktiv)
  ruft `scripts/health-watch.py`. Buchfuehrung in `health_alerts` je PROBLEM-Schluessel
  (`platte:/tmp`, `speicher`, `last`, `backup:alter`, `pg:verbindungen`, `unit:<name>`, `oom`):
  Meldung beim ersten Auftreten, dann fruehestens nach 6 h erneut, bei Verschaerfung sofort, und
  EINE Entwarnung beim Verschwinden. Ende-zu-Ende belegt: 2 Warnungen -> 2 Zustellungen,
  Wiederholung sofort danach 0, Entwarnung 2, Buchfuehrung danach leer.
  Nebeneffekt: der Zeitgeber schreibt die Messpunkte, damit sind die Verlaufslinien echt.

- **🔴→✅ 02.09. — Dabei einen ECHTEN latenten Fehler gefunden: die vier uvicorn-Worker legen beim
  Start gleichzeitig die Tabellen an.** Solange sich am Schema nichts aendert, faellt das nie auf.
  Mit der neuen Tabelle `health_alerts` rannten sie ins Messer („duplicate key value … Key
  (typname, typnamespace)=(health_alerts, 2200) already exists"): **zwei Worker starben beim
  Start**, der Dienst lief danach mit 2 statt 4 Arbeitern weiter — und antwortete normal, der
  Ausfall stand nur im Journal. `init_db()` nimmt jetzt eine Postgres-Beratungssperre
  (`pg_advisory_lock`), die Worker serialisieren sich also. Danach geprueft: 0 Tracebacks beim
  Start, alle vier Worker leben. **Merke: jede kuenftige neue Tabelle haette dasselbe ausgeloest.**

- **✅ 02.09. — Nachgerechnet: durch die blockierten Suunto-Aufrufe ist NICHTS verloren.** Jans
  Frage zum Bericht („da waren doch ein paar blockierte, koennen wir nachtraeglich was holen? welche
  User waren betroffen?"). Rein lesend geprueft, in dieser Reihenfolge:
  - `suunto_pending` ist **leer**, und kein Eintrag hat je die Wiederholungsgrenze (10 Versuche)
    erreicht — solche Zeilen bleiben stehen, es gibt keine.
  - Im Server-Log (reicht zurueck bis **10.08.**) steht **keine** Kontingent-Meldung, **keine**
    verworfene Warteschlangen-Zeile und **kein** „kein verknuepfter Nutzer".
  - **Abgleich Ping gegen Datenbank:** 43 Webhook-Pings aus dem Log, je mit Kennung und Startzeit,
    gegen die Sessions der Nutzer gestellt. Fuer **alle 10 aktuell verknuepften Nutzer existiert zu
    JEDEM Ping eine Session** — keine Luecke.
  - Uebrig bleiben **5 Pings eines Suunto-Namens, der nicht mehr verknuepft ist** (29.08. bis
    02.09.); zu 4 davon gibt es nirgends in der Datenbank eine Session. Da beim Eingang kein
    „kein verknuepfter Nutzer" geloggt wurde, bestand die Verknuepfung damals. Es bleiben also zwei
    Erklaerungen: das Workout hatte kein GPS (wird still verworfen) oder Konto/Verknuepfung wurden
    danach entfernt, samt Sessions.
  **Nachholen ist dort ohnehin unmoeglich:** ohne Verknuepfung gibt es kein Token, also keinen
  Abruf. Und fuer die verknuepften Nutzer ist nichts nachzuholen, weil nichts fehlt.
  **Behoben, weil genau das die Antwort schwer gemacht hat:** endgueltige Absagen („kein gps",
  „doppelt", 403/404/410) verschwanden im Webhook-Pfad **voellig lautlos** — nicht zu unterscheiden
  von einem verlorenen Ping. Jetzt schreibt jede eine Zeile ins Log (Kennung, Grund, Nutzer-ID).
  Server neu gestartet.

- **🟡 02.09. — Zepp 1.0.7 weiter „Under Review"** (eingereicht 01.09.; die Zeile darunter zeigt
  1.0.6 als „Approved" vom 24.08.). Nichts zu tun, nur Geduld — Zepp braucht erfahrungsgemaess
  Tage, nicht Stunden. Geraeteliste der Einreichung: 85 Kennungen, von Falcon und T-Rex Ultra bis
  Balance 3 Ti, Bip 6 und Bip Max.

- **🟡 02.09. 17:55 — iOS/Apple Watch 1.1.29 (33) EINGEREICHT** („Warten auf Prüfung",
  Uebermittlungskennung `2ea86051-b581-4ac9-8048-e25f47c5c87d`, eingereicht von Jan). Live ist
  weiter 1.1.28. Nur ~1,5 Stunden nach der Freigabe von 1.1.28 — Anlass war der kaputte Player.
  **Inhalt (alle iOS-Aenderungen von heute sind drin, gepruefte Liste aus dem Git-Log):**
  Error-153-Fix am Feed-Player (falsche Eltern-Herkunft: `baseURL` war `youtube-nocookie.com`
  selbst) · neue HTML-Struktur des Players (Doctype, `<meta name=viewport>`, Stile im
  `<style>`-Block, `vh`/`vw` statt Prozent) · Trefferflaeche der Vorschaubilder (`contentShape` —
  „ab ca. der Mitte wird schon das Video eins weiter rechts geoeffnet") · Wischen wechselt das
  Video. Damit ist die Changelog-Warnung zu 1.1.28 („Videos bleiben schwarz") mit dieser Version
  erledigt.
  **Nummern-Regel, damit nichts durcheinandergeraet:** `project.yml` steht bewusst WEITER auf
  1.1.29 (33) — so entspricht der Repo-Stand genau dem, was in Pruefung ist. Die **naechste**
  Aenderung, die auf iOS ausgeliefert werden soll, hebt im SELBEN Commit auf **1.1.30 (34)**
  (beide Ziele zusammen, iPhone und Watch teilen die MARKETING_VERSION).
  **Nach der Freigabe:** Produktseite pruefen (nicht `itunes.apple.com/lookup`, s. `appmeta.py`),
  dann `appmeta.ios` UND `appmeta.apple` zusammen auf 1.1.29, dann Changelog.

- **🟡 02.09. — Android EINGEREICHT: Phone 39 (1.1.25) + Wear OS 1035 (1.2.25), voller Roll-out.**
  Jans Meldung aus der Play Console: „Schnelle Vorabprüfungen … noch maximal 14 Minuten", beide
  Spuren auf „Vollständigen Roll-out starten", dazu die **Erklärung für Gesundheits-Apps**.
  **Was wir dort erklaert haben** (fuer die naechste Einreichung wiederverwendbar):
  App-Funktion = ausschliesslich **„Aktivität und Fitness"** — nichts aus „Medizin" (zieht
  Medizinprodukt-Anforderungen nach sich) und nichts aus „Forschung am Menschen" (eigenes
  Formular). Je Berechtigung: `BODY_SENSORS` = roher Sensor (`TYPE_HEART_RATE`) als Rueckfall auf
  aelteren Uhren, `health.READ_HEART_RATE` = Wear-OS Health Services **und** Voraussetzung fuer den
  Vordergrunddienst mit Health-Typ ab Android 15/16 (ohne sie der Absturz von heute Mittag).
  Beides nur waehrend einer laufenden Aufnahme, keine Health-Connect-Anbindung, keine Weitergabe,
  keine Werbung.
  **Erstes Release mit R8** — `mapping.txt` aus `app/build/outputs/mapping/release/` aufbewahren,
  sonst sind Logcat-Ausgaben aus Emulator/Handy verschleiert (Play Console entschluesselt nur
  hochgeladene Abstuerze selbst).
  **Nach der Freigabe zu tun:** erst wenn Play „live" meldet UND der Roll-out bei 100 % steht,
  `appmeta.android` auf 1.1.25 und `appmeta.wear` auf 1.2.25 setzen, dann Changelog.
  **Inhalt:** alles von heute — R8, Bitmap-Deckel im Teilen-Dialog, Startversuche, Feed-Player
  (Error 153 + Groesse + Wischen + randlos), Spots-ANR und graues Raster, Verlaufsseite,
  Wear-FGS-Absturz, „ein Druck statt halten", Einstellungen ueber die Listen, Titel in der
  Sessionliste, streamender Datenexport.

- **✅ 02.09. — iOS/Apple Watch 1.1.28 ist LIVE, Nummern gezogen.** Freigabe-Mail + an der
  Produktseite gegengeprueft (`apps.apple.com/de/app/pumpfoil/id6783975714` zeigt „Version
  1.1.28"). `appmeta.ios` UND `appmeta.apple` stehen auf 1.1.28, Server neu gestartet,
  `/api/app/latest?platform=ios` liefert es. Changelog-Eintrag ist drin und die PWA neu gebaut.
  **Fuer die naechste Einreichung schon gestellt:** `watch-apple/project.yml` auf
  **1.1.29 (33)**, beide Ziele zusammen (iPhone + Watch teilen die MARKETING_VERSION).
  **Was in 1.1.29 drin sein wird und in 1.1.28 fehlt:** der Error-153-Fix am Feed-Player (in
  1.1.28 bleibt das Video schwarz, Ton laeuft — steht auch so im Changelog, damit niemand ratlos
  davorsitzt), der verschobene Klick auf die Vorschaubilder (`contentShape`), Wischen zum
  Wechseln, und die neue HTML-Struktur des Players.
  **Android wartet unveraendert:** Phone **1.1.25 (39)**, Wear **1.2.25 (1035)** — noch nichts
  hochgeladen, die Nummern sind also richtig, wie sie sind. Alles von heute ist drin (R8, Bitmap,
  Feed-Player, Spots-ANR, Verlaufsseite).

- **📌 02.09. — MERKE: YouTube-Embeds spielen auf der VM NICHT, egal was wir bauen.** Im
  Android-Emulator hier zeigt der Player „Sign in to confirm you're not a bot" — die VM haengt an
  einer Rechenzentrums-IP, und YouTube verlangt dort eine Anmeldung. Aufgefallen erst am Abend des
  02.09., nachdem ich einen halben Tag lang „bei mir ist es auch schwarz" als Befund behandelt
  hatte. **Das war keiner.** Rueckwirkend wertlos sind damit alle meine Aussagen der Form „hier
  spielt es auch nicht" — Jans Emulator auf dem Mac ist die einzige gueltige Quelle fuer die
  WIEDERGABE.
  **Was hier trotzdem messbar bleibt** (und heute den Fehler gefunden hat): Groessen und Layout per
  `adb logcat -s PumpfoilPlayer` — WebView-Groesse, `window.innerHeight`, `getComputedStyle` von
  `body` und iframe. Das laeuft unabhaengig davon, ob YouTube ein Bild liefert.

- **✅ 02.09. — Community-Feed: Videos spielen wieder. ZWEI echte Fehler auf demselben Weg, plus
  drei Irrwege, die hier stehen, damit sie niemand wiederholt.**
  Jans Meldung: „das Abspielen der Videos im Community-Feed geht nicht mehr, die Previews sind
  prima." Schwarze Flaeche, Durchblaettern ging, Titel und Knopf waren da.
  **Fehler 1 — YouTube lehnte ab (Error 153).** Als `baseURL` stand `youtube-nocookie.com` SELBST,
  die Elternseite war aus Sicht des Players also seine eigene Domain. Sichtbar wurde die Absage
  nie, weil sie IM iframe landet. Jetzt `https://pumpfoil.org` als Herkunft plus `origin=` im
  Embed — wie in der PWA, wo die Elternseite ohnehin unsere ist. **Dieselbe Zeile stand auch in
  iOS** und ist dort mitkorrigiert.
  **Fehler 2 — das iframe war 0 hoch.** Danach lief der Player (Ton, Dekoder, Audio-Fokus), aber
  die Flaeche blieb schwarz. Jans Beobachtung „ganz unten am Bildschirmrand eine 1px hohe Zeile,
  die sich beim Videowechsel farblich aendert" war das Video selbst. Gemessen (Debug-Log
  `PumpfoilPlayer`): WebView 1032x1954 px, Ansichtsfenster 344x651 CSS-px, `body` und iframe aber
  **0**. Behoben durch eine HTML-Struktur, die an keiner Vererbungskette haengt:
  `<meta name="viewport">`, Stile in einem `<style>`-Block, und der Player per `position:fixed`
  mit allen vier Kanten auf 0 am ANSICHTSFENSTER verankert. Lokal im Chromium gegengemessen
  (`rect [500,564]`, `body` dabei 0 — was jetzt richtig ist, das iframe ist aus dem Textfluss).
  **Drei Irrwege, alle mit Beleg widerlegt:** R8/Verschleierung (derselbe Fehler im Debug-Build
  ohne R8) · `domStorageEnabled = true` (aendert nichts) · das Dialogfenster samt
  Hardwarebeschleunigung (nicht die Ursache; die Ebene im Hauptfenster ist trotzdem geblieben, sie
  ist einfacher und die Zurueck-Taste haengt am `BackHandler`). Auch meine Prozentzeichen-Theorie
  war falsch — Jans Log zeigte das Markup unbeschadet.
  **Dazu gebaut:** Wischen wechselt das Video (Android + iOS; auf Android muss der Griff im
  `Initial`-Durchlauf abgefangen werden, weil der WebView sonst alles verschluckt), und der Player
  laedt nicht mehr bei jeder Recomposition neu.
  **Offen:** Jans Geschmacksfrage, ob der Player randlos sein soll (dann wieder ein Dialog) oder
  ob Kopf- und Fussleiste sichtbar bleiben duerfen wie jetzt.

- **✅ 02.09. — Spots-Ansicht stuerzte beim Scrollen ab: fuenf Karten ohne `onDetach()`.**
  Jan: „die Spots-Ansicht crasht beim Scrollen, vermutlich auch zu gross/lang inzwischen" — und
  auf iOS scrollt dieselbe Seite fluessig, es ist also nicht die Datenmenge. Befund: die App hat
  **fuenf** osmdroid-Karten (Spots, Verlauf, Aufnahme, Vergleich, Session-Detail) und rief bei
  KEINER `onDetach()` auf. Eine MapView haelt Kachel-Threads und einen Kachel-Cache; verwirft
  Compose die View, bleibt beides liegen — in einer scrollenden Liste legt so jedes
  Rein-und-Rausscrollen eine neue Karte an. Alle fuenf haben jetzt
  `onRelease = { it.onDetach() }`. Zusaetzlich baute die Spots-Karte bei JEDER Recomposition alle
  Pins neu (Bitmap je Buendel) und passte die Karte neu ein; jetzt nur noch bei echtem
  Datenwechsel. **Von Jan noch nicht gegengetestet.**

- **🟢 04.09. GEKLAERT + GEBAUT (Nachfolger steht, noch nicht aktiv) — 02.09.: die Suunto-API, die wir benutzen, ist als DEPRECATED markiert.** Jan hat es
  in den Berichten unter `apizone.suunto.com/reports` gesehen — die Aufrufe laufen dort unter
  **„SUUNTO WORKOUT API (DEPRECATED)"** (56 erfolgreich, 11 blockiert = das alte Wochenkontingent
  der Developer-API). Daneben steht ein zweites Produkt **„SUUNTO WORKOUT DESCRIPTION API"** mit
  0 Aufrufen — nach Namen der Nachfolger, aber ungeprueft.
  **Was wir konkret aufrufen** (`server/app/api/suunto.py`): `GET cloudapi.suunto.com/v2/workouts`
  (Liste) und `GET /v2/workout/exportFit/{key}` (FIT-Download). Genau diese zwei Wege muessen im
  Nachfolger ein Gegenstueck haben — vor allem der **FIT-Export**, denn daran haengt unser Import;
  eine reine „Description"-API mit Kennzahlen statt Rohdaten wuerde uns nichts nuetzen.
  **Kein Alarm, aber ein Termin:** die Aufrufe gehen weiter durch. Betroffen waeren **10 verknuepfte
  Konten** (Stand 02.09.).

  **04.09. — Doku besorgt, ohne Anmeldung.** Suuntos API Zone laeuft auf Azure API Management, und
  dessen Portal-Datenschnittstelle antwortet oeffentlich:
  `apizone.suunto.com/developer/apis?api-version=2022-04-01-preview` (+ `/operations` je API).
  Damit liegen alle 10 Suunto-APIs und die Operationen der neuen offen. Alles in
  **`docs/suunto-api-v3.md`** samt Abruf-Zeilen zum Nachpruefen.
  - **Der Nachfolger heisst „SUUNTO WORKOUT API" und liegt auf `/v3/workouts`** — drei
    Operationen: Liste (`GET /`), ein Workout (`GET /{workoutKey}`) und **`GET /{key}/fit`**.
    **Der FIT-Export ueberlebt also**, daran hing unser Import.
  - **v3 kann mehr als v2:** `limit`/`offset` (Seitenweise) und `filter-by-modification-time` —
    damit holt ein Sync genau das, was sich seit dem letzten Lauf geaendert hat.
  - **Ein Missverstaendnis vom 02.09. korrigiert:** die „SUUNTO WORKOUT DESCRIPTION API" ist NICHT
    der Nachfolger. Sie liegt auf `/v1/workouts` und ist damit aelter als das, was wir nutzen.
  - **Gebaut, aber NICHT aktiv** (Jans Vorgabe: erst gemeinsam pruefen): `suunto.py` kennt beide
    Wege, umgeschaltet wird ueber `SUUNTO_API_V3` in `server/.env` — ohne die Variable bleibt
    alles bei v2. Die Listen-Antwort wird defensiv gelesen (`payload`/`workouts`/`data`/nackte
    Liste), weil ihre Form fuer v3 nicht dokumentiert ist.
  - **Zum gemeinsamen Pruefen:** `GET /api/integrations/suunto/vergleich` (eingeloggt, rein lesend).
  - **✅ 04.09. AN JANS KONTO GEMESSEN — v3 ist ein Eins-zu-eins-Ersatz:** beide Versionen HTTP 200,
    **je 4 Workouts, dieselbe Huelle (`error`/`metadata`/`payload`), dieselben vier Schluessel,
    dieselben Feldnamen**, und der FIT-Download liefert ueber beide Pfade **200 mit je 330 Bytes**.
    `listen_gleich: true`. Unser Abo gilt fuer v3 also schon — kein neuer Antrag.
  - **Noch gebaut, weil v3 sich hier anders verhaelt:** v3 liefert hoechstens `limit` Workouts
    (Standard **50**), v2 kannte das nicht. Der Sync holt bei aktivem v3 daher **seitenweise**
    (100 je Seite, bis 20 Seiten). Ohne das bekaeme ein Konto mit vielen Workouts beim ersten
    Sync nur die neuesten 50.
  - **Offen und bewusst nicht gebaut:** `filter-by-modification-time=true` zusammen mit
    `since=<letzter Sync>` waere der sparsame Weg (nur holen, was sich geaendert hat). Das aendert
    die Sync-Semantik und sollte nach dem Umschalten kommen, nicht davor.
  - **NAECHSTER SCHRITT: Jans „ja" — dann `SUUNTO_API_V3=1` in `server/.env` + Neustart.**
    Rueckweg ist die Variable wieder rausnehmen.
  **Nicht ins Blaue migrieren:** erst Doku lesen, dann pruefen, ob `exportFit` im Nachfolger
  existiert. Siehe Memory `suunto-api-integration`.

- **✅ 02.09. — Suunto: Zugang zur PRODUCTION API freigegeben** (Mail „Thank you for subscribing to
  the Production API", Suunto Partnership Team, Jans Meldung). Beantragt war das seit Wochen.
  **Stand bei uns:** der Code steht und ist vollstaendig (`server/app/api/suunto.py`: OAuth,
  Workout-Liste, FIT-Export, Benachrichtigungen), und alle vier Zugangsdaten sind in `server/.env`
  **schon gesetzt** — Client-ID, Secret, Subscription-Key, Notification-Secret.
  **Deshalb die eine Frage an Jan, bevor irgendetwas gebaut wird:** die vorhandenen Werte stammen
  aus dem SANDBOX-Zugang. In der Suunto API Zone hat die Production-Subscription in der Regel einen
  **eigenen `Ocp-Apim-Subscription-Key`**, und die OAuth-App muss dort die Weiterleitung kennen:
  `https://pumpfoil.org/api/integrations/suunto/callback` (aus `BASE_URL`, exakt so, sonst
  `redirect_uri`-Mismatch — der Fall ist im Code schon mit Logausgabe vorbereitet).
  **02.09. erledigt:** Jan hat die Subscriptions nachgesehen — die Production-Subscription hat
  einen EIGENEN Schluessel (Sandbox hiess dort „Developer API"). Production-Primary steht jetzt in
  `.env`, Server neu gestartet, und der Verbindungs-Endpunkt antwortet statt 404 nun **200** mit
  einer vollstaendigen Weiterleitung: `cloudapi-oauth.suunto.com/oauth/authorize`,
  `redirect_uri=https://pumpfoil.org/api/integrations/suunto/callback`, `scope=workout`,
  `response_type=code`, Subscription-Key gesetzt. Zweite Mail bestaetigt es auch
  („Your production API subscription has just been approved! You are good to go live!").
  **Jetzt fehlt nur noch der ECHTE Durchlauf:** Jan verbindet im Profil sein Suunto-Konto. Erst
  dann ist belegt, dass Token-Tausch, Workout-Liste und FIT-Export gegen Produktion halten —
  gelaufen ist die Kette dort noch nie. Siehe Memory `suunto-api-integration`.
  Nebenbei: Suunto verweist auf Marken-/Presse-Material unter `media.suunto.com` — relevant, falls
  wir die Unterstuetzung irgendwo ankuendigen (dann aber erst nach dem echten Durchlauf).

- **✅ 02.09. — Play-Hinweis „Bitmap-Bildoptimierung": Foto im Teilen-Dialog wurde in Originalgroesse
  dekodiert.** Play zeigte das unter „Arbeitsspeichernutzung" fuer Release 38 (1.1.24) an, mit
  Fundstelle: `ShareDialog` lud das Hintergrundfoto per `BitmapFactory.decodeStream` — einmal aus
  dem Netz (erstes Session-Foto), einmal aus dem Bild-Picker. Ein 12-MP-Handyfoto sind **48 MB im
  Speicher**, fuer eine Card, die 1080x1080 gross wird. Derselbe Fehler wie beim Daten-Export.
  **Behoben:** beide Pfade gehen jetzt ueber **Coil** (war schon Abhaengigkeit) mit `size(1920)` +
  `allowHardware(false)`. Drei Nebengewinne: EXIF-Drehung wird angewandt (der Picker-Pfad ignorierte
  sie — Hochkant-Fotos lagen quer in der Card, war nie gemeldet), Netz-Fotos landen im Coil-Cache,
  und das Dekodieren blockiert nicht mehr den Hauptthread im Picker-Callback.
  Steckt in 1.1.25 (39), also im gleichen Release wie der Wear-Absturz-Fix.

- **✅ 02.09. — Play-Warnung „App-Optimierung unter dem Grenzwert" (Verschleierung 0 %): R8 ist
  jetzt AN, in beiden Modulen, und der Release-Build ist auf zwei Emulatoren durchgeklickt.**
  Ausloeser: Play meldete es fuer Release 38 (1.1.24) — unter 25 % „kann sich auf Sichtbarkeit und
  Veroeffentlichung auswirken". Ursache: `isMinifyEnabled = false` seit dem ersten Release, nie
  bewusst entschieden. Jan wollte es nicht auf ein spaeteres Release schieben („und warum nicht in
  diesem release?"), also wurde statt geraten **gemessen**.
  **Aenderung:** `isMinifyEnabled = true` + `isShrinkResources = true` +
  `proguard-android-optimize.txt` in `:app` und `:wear`. Eigene Keep-Regeln: **zwei**, nur fuer die
  zwei Wege, die hier nicht klickbar sind (Google-Login, In-App-Review) — begruendet in
  `android/app/proguard-rules.pro`.
  **Was der Durchlauf belegt (Release-Build, mit dem Debug-Key lokal signiert):**
  - *Phone (foil_pixel):* Start, News-Banner, Sessionliste, Detailansicht mit osmdroid-Karte,
    Farbmodus Puls, Pump-Marken, Kachel „Vedot/lähdöt 3/3", Teilen-Dialog inkl. Foto-Card,
    Verlaufsdiagramme, Spots-Karte mit Clustern, Foilers, Chat, Profil. Kein Absturz, keine
    Serialisierungsfehler.
  - *Die Sorge, die ich vorher hatte, ist widerlegt:* R8 benennt Enum-FELDER um, laesst die
    NAMENS-Strings aber stehen. In den Prefs stand nach dem Umschalten
    `<string name="sd_color_mode">HR</string>`, und nach einem Kaltstart war „Puls" wieder
    ausgewaehlt — `ColorMode.valueOf` funktioniert also. Waere es anders, haette es LEISE
    versagt: `runCatching` faellt auf SPEED zurueck, es haette nur ausgesehen wie „merkt sich
    die Einstellung nicht".
  - *Wear (foil_wear):* per API gepairt, Geraetekonfiguration vom Server geholt
    (`/api/devices/config?p=wear&v=1.2.25` -> 200), eigenes Datenseiten-Layout gerendert,
    **Aufnahme gestartet** — Vordergrunddienst mit `types=00000108` (Standort + Health), also
    genau wie im unverschleierten Build, keine SecurityException.
  **Was das bringt:** AAB Phone **15,3 -> 7,0 MB** (-54 %), Wear **7,5 -> 2,9 MB** (-62 %).
  **Noch offen, weil hier nicht testbar (braucht Google-Konto/Play-Store):** „Mit Google anmelden"
  und das In-App-Review-Overlay. Beide sind per Keep-Regel abgesichert; wer die Regeln spaeter
  entfernen will, muss vorher genau diese zwei Wege im Release-Build klicken.
  **Nebenwirkung fuer die Fehlersuche:** `adb logcat`-Ausgaben sind ab jetzt verschleiert
  (`a.b.a`). Die Play Console entschluesselt hochgeladene Abstuerze selbst — die Zuordnungsdatei
  liegt im AAB (`BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map`, 54 MB) und
  wird beim Upload mitgenommen. Fuer Emulator-/Handy-Logs gilt: `mapping.txt` je Release
  aufbewahren (`app/build/outputs/mapping/release/`) und mit `retrace` zurueckrechnen.


- **✅ 02.09. — Wear-Aufnahme laeuft im Emulator, und „ein Druck statt halten" ist IM FELD
  bestaetigt** (Jan: „jetzt laeuft die wear und one click stop geht auch ohne hold"). Damit ist die
  Kette einmal ganz durchgemessen: Einstellung im Profil -> `/api/devices/config` -> Uhr -> kurzer
  Druck beendet die Aufnahme. Vorher geprueft waren nur die einzelnen Glieder.
  **Noch nicht praktisch bestaetigt:** derselbe Modus auf Garmin (1.0.85 ist live), Apple Watch
  (wartet in 1.1.28) und Zepp (wartet in 1.0.7/1.0.8).

- **🔴→✅ 02.09. — ECHTER Fehler, um Haaresbreite ausgeliefert: die Wear-App stirbt beim
  Aufnahmestart auf Android 15/16.** Gefunden in Jans Emulator-Test, NACHDEM der
  Sensor-HAL-Absturz (s. Eintrag darueber) aus dem Weg war und der Crash-Puffer den zweiten,
  eigentlichen Fehler zeigte:
  ```
  SecurityException: Starting FGS with type health … targetSDK=36 requires
    allOf=true  [FOREGROUND_SERVICE_HEALTH]                      <- haben wir
    anyOf=false [ACTIVITY_RECOGNITION, HIGH_SAMPLING_RATE_SENSORS,
                 health.READ_HEART_RATE, health.READ_SKIN_TEMPERATURE, …]  <- hatten wir KEINE
  ```
  - **Ursache:** unser Dienst ist `foregroundServiceType="location|health"`. Fuer `health` verlangt
    Android 15/16 eine der oben genannten Berechtigungen — **`BODY_SENSORS` zaehlt dort NICHT
    mehr** (abgekuendigt, ersetzt durch `health.READ_HEART_RATE`). Scharf wurde das erst durch
    unseren Wechsel auf **targetSdk 36 am 30.08.** (Play-Stichtag).
  - **🍀 Beinahe im Store:** die LIVE stehende Wear **1.2.24 wurde am 26.08. eingereicht, also noch
    mit targetSdk 35** — sie ist NICHT betroffen. Die fertige **1.2.25 haette auf jeder Uhr mit
    Android 15/16 beim Druck auf START abgestuerzt.** Nur weil Jan im Emulator getestet hat, ist es
    aufgefallen — ein Feldtest auf seiner eigenen (aelteren) Uhr haette es NICHT gezeigt.
  - **Fix, drei Teile:**
    1. `health.READ_HEART_RATE` im Manifest ergaenzt (BODY_SENSORS bleibt fuer alte Uhren).
    2. `RecorderService.starteVordergrund()`: meldet `health` nur an, wenn die Puls-Berechtigung
       wirklich erteilt ist — und faengt die SecurityException ab, um dann mit `location` allein
       weiterzulaufen. **Eine Aufnahme ohne Puls ist brauchbar, eine abgestuerzte App nicht.**
    3. `pulsRecht()` als EINE Wahrheit: unter Android 15 `BODY_SENSORS`, ab 15
       `health.READ_HEART_RATE` — fuer Abfrage, Pruefung und Hinweis.
  - **Handy-App nicht betroffen:** deren Dienst ist nur `location`.
  - **🔲 Fuer Jan beim Einreichen:** Play kann beim Deklarieren von `health.READ_HEART_RATE` nach
    dem Umgang mit Gesundheitsdaten fragen (Formular). Falls ja: wir lesen den Puls nur waehrend
    der Aufnahme, speichern ihn in der Session und geben ihn an niemanden weiter.

- **🟡 02.09. — Wear-App stirbt beim Druck auf START (Jans Emulator-Test). Ablauf entkoppelt;
  die URSACHE des Prozess-Todes ist noch NICHT bewiesen.**
  - **Was das Log zeigt** (drei Mitschnitte, auch nach einem Data-Wipe): kein `FATAL EXCEPTION`,
    kein Tombstone im normalen Puffer — der Prozess endet einfach. Und zwar **genau wenn der
    Puls-Berechtigungsdialog aufgeht**: `com.android.permissioncontroller` rendert, zwei
    `WindowManager startWCT`, dann `PROCESS ENDED`. Daneben GMS mit
    `Binder transaction failure … error: -28` und „Too many transaction errors, throttling
    freezer" — das System ist am Anschlag. Host-Platte ist NICHT voll (88 GB frei auf `/`,
    5,9 GB in `/tmp`, geprueft).
  - **Was ich unabhaengig davon behoben habe (mein Konstruktionsfehler von 04./05.08.):** der
    Start hing an einer OPTIONALEN Berechtigung. Ablauf war: Start -> Puls-Dialog -> im Callback
    aufnehmen, mit dem Merker `startNachHrFrage` **nur im Speicher**. Stirbt der Prozess, waehrend
    der Dialog oben ist, ist der Startwunsch weg — ein Druck auf Start tut dann gar nichts.
    Jetzt: **Standort da -> sofort aufnehmen**, die Puls-Frage kommt DANACH, und wird sie erteilt,
    haengt der Dienst den Puls ueber `RecorderService.enableHeartRate` an die laufende Aufnahme.
    Der Standort bleibt Startkriterium (ohne Position ist die Aufnahme wertlos).
  - **✅ URSACHE GEFUNDEN, und es ist NICHT unsere App** (Tombstone aus `logcat -b crash`, 13:22):
    ```
    Cmdline: /vendor/bin/hw/android.hardware.sensors-service.multihal
    Abort message: 'activationOnChangeSensorEvent:231: unexpected sensor type: 26'
    ```
    Der SENSOR-TREIBER der Emulator-Images (`goldfish::MultihalSensors`) bricht mit `SIGABRT` ab,
    sobald ein Sensor aktiviert wird, den er nicht kennt — **Typ 26 = `WRIST_TILT_GESTURE`**.
    Health Services registriert beim Start einer Uebung genau solche Sensoren mit. Der Absturz
    trifft den Sensor-DIENST des Systems, und der reisst jeden Prozess mit, der gerade Sensoren
    nutzt — deshalb war unsere App weg, ohne eigene Exception. Mein Low-Memory-Verdacht war falsch;
    die GMS-Binder-Fehler daneben waren Folge, nicht Ursache.
  - **Fix fuer die Testbarkeit:** `startHeartRate()` ueberspringt Health Services, wenn
    `Build.HARDWARE` `ranchu`/`goldfish` ist (= jeder Android-Emulator; eine echte Uhr meldet das
    nie). Damit laesst sich die Aufnahme im Emulator wieder testen — ohne Puls, aber ohne Absturz.
    **Auf echter Uhr aendert sich NICHTS.**
  - **Merke:** ein Prozess, der ohne `FATAL EXCEPTION` verschwindet, ist oft FREMDER Absturz. Der
    Tombstone im Crash-Puffer nennt den Schuldigen (`Cmdline:`) — im Haupt-Log stand davon nichts.

- **🔴→✅ 02.09. — „Meine Daten exportieren" hat die Android-App ABGESTUERZT (Jans Test).**
  `java.lang.OutOfMemoryError: Failed to allocate a 134250504 byte allocation` in
  `Api.http` -> `readText()`.
  - **Ursache, nachgemessen:** Jans Export ist **48,2 MB** JSON (657 Sessions, je mit kompletter
    GPS-Spur). `readText()` baut daraus einen `java.lang.String` — UTF-16, also ~96 MB, und der
    StringBuilder verlangte beim Verdoppeln die 134 MB aus der Meldung. Auf einem Telefon mit
    ~200 MB Heap-Deckel ist das aussichtslos.
  - **Fix Android:** `exportMyDataToFile()` STREAMT in 64-KB-Haeppchen direkt in die Datei, kein
    String. Dazu `Accept-Encoding: gzip` — der Server komprimiert schon (GZipMiddleware,
    `main.py`), gemessen **8,6 MB statt 48,2 MB** ueber die Leitung (18 %). Achtung: wer den
    Header selbst setzt, muss auch selbst auspacken (HttpURLConnection macht es dann nicht mehr)
    — das tut die Funktion.
  - **Fix iOS (gleiche Falle, nur noch nicht aufgeschlagen):** `exportMyDataToFile()` per
    `URLSession.download` in eine Datei, danach auf `pumpfoil-export.json` umbenannt, damit das
    Teilen-Blatt einen sinnvollen Namen zeigt. Vorher waere ein `Data` mit 48 MB im Speicher
    gelandet.
  - **Fix Web:** `exportMyDataBlob()` holt den Strom als Blob. Vorher parste `req` das JSON und
    die Speicherfunktion serialisierte es wieder — dasselbe dreimal im Speicher.
  - **Merke:** jede Antwort, die pro Session eine GPS-Spur traegt, ist ein Speicher-Risiko. Wer so
    etwas neu baut: in eine Datei streamen, nicht in einen String/`Data`/JS-Objekt.

- **✅ 02.09. — Reihenfolge auf zwei Seiten umgestellt (Jans Test, Android + iOS gleich).**
  - **Profil/Uhr:** die vier Verweise (Anleitung, Garmin verbinden, Alarm, Datenfelder) stehen
    jetzt VOR der Uhren-Liste — Jan hat viele Uhren gepairt und musste an allen vorbeiscrollen.
  - **Datenseiten:** die Einstellungen (Werte farbig, Auto-Start, Aktivitaetstyp, Beenden-Modus,
    Blaettern, eigene Layouts) stehen VOR den Seiten-Saetzen, aus demselben Grund.
  - **Session-Liste:** der Titel steht jetzt als eigene Zeile direkt unter dem Datum und FETT
    (vorher klein und blass unter den Chips). In beiden Android-Listen und auf iOS.
  - **Startversuche-Schalter** aus der waagerecht scrollbaren Farbmodus-Zeile in die Zeile darunter,
    rechtsbuendig. Diese Zeile gibt es jetzt immer (vorher nur im Speed-Modus, wo die Glaettung
    steht) — sonst waere der Schalter bei Puls/Pump/Carves verschwunden.

- **✅ 02.09. — Android auf den heutigen Stand gebracht (Jan will danach releasen).** Was noch
  fehlte und jetzt drin ist:
  - **Startversuche auf der Karte** (Schalter neben den Pumps, standardmaessig an): dieselbe
    Optik wie im Web — bernstein, gestrichelt, ausserhalb des Zuschnitts duenner. Die Linien
    kommen ueber `GET /api/sessions/{id}/attempts` als fertige Punkte. **Reihenfolge:** die
    Versuche werden ZULETZT in die osmdroid-Overlay-Liste gelegt und liegen damit ueber den
    Laeufen (im Web dafuer eine eigene Karten-Ebene) — ihre Linien sind duenner, ein Lauf
    verdeckt sie sonst.
  - **Gemerkte Karten-Ansicht** (`SessionViewPrefs`, SharedPreferences): Farbmodus, Glaettung,
    Pump-Marker, Startversuche gelten ueber Sessions hinweg. Lokal wie im Web, nicht im Profil.
  - **(i) an der Leistungs-Karte:** ohne sie ist die Watt-Zahl eine Behauptung — jetzt steht dort,
    mit welchem Gewicht, welcher Geschwindigkeit und welchen Anteilen (Vortrieb + Pump-Traegheit)
    gerechnet wurde, und dass der Traegheitsanteil ohne erkannte Kadenz pauschal ist.
  - **Fehlender Schluessel gefunden:** `account.activityPumpfoil` war beim Aktivitaetstyp-Umzug
    heute Nacht benutzt, aber nie in die Android-Tabelle eingetragen — die Auswahl haette woertlich
    „account.activityPumpfoil" angezeigt. **Dieselbe Klasse Fehler wie gestern (`watchStats.hint`)
    und heute Nacht (`rec.sure`); die Gegenprobe faengt sie jedes Mal.** Jetzt: 665 benutzte
    Schluessel, keiner ohne Definition.
  - `:app:` + `:wear:compileDebugKotlin` gruen. **Version bleibt Phone 1.1.25 / Wear 1.2.25**
    (beide gebaut, nie eingereicht) — kein Bump noetig, Jan reicht diesen Stand ein.

- **🔴 02.09. — BEFUND: die Start-Erfolgsquote ist systematisch zu GUT, weil der Auto-Zuschnitt
  die Fehlversuche vor dem ersten geglueckten Start wegschneidet. ENTSCHEIDUNG VON JAN NOETIG
  (Detektor-/Pipeline-Regel).**
  - **Mechanik:** `maybe_auto_trim` (analysis/__init__.py) setzt den Zuschnitt automatisch auf
    **[erster Lauf − 15 s, letzter Lauf + 15 s]**, wenn der Nutzer keinen eigenen gesetzt hat.
    `attempt_distances` rechnet danach auf den GETRIMMTEN Punkten — alles, was vor dem ersten
    ERFOLGREICHEN Start passiert ist, faellt damit heraus. Genau das sind aber die Versuche, die
    zaehlen: wer 20-mal anschiebt und beim 21. steht, hat eine Quote von 1/21, nicht 1/1.
  - **Gemessen ueber die 40 neuesten zugeschnittenen Sessions:** 492 gespeicherte Versuche gegen
    **528** ueber die ganze Aufnahme (**+7 %**), Unterschied in **19 von 40** Sessions.
    Extremfaelle: **#3251 gespeichert 1, tatsaechlich 5** (Quote 100 % statt 20 %), #3185 18 -> 24,
    #3219 (Jans „4/4 · 100 %") in Wahrheit **4/6**.
  - **Schon erledigt (reine Anzeige, kein Pipeline-Eingriff):** die KARTE zeigt die Versuche jetzt
    ueber die ganze Aufnahme, auch die vor dem Zuschnitt (dort duenner gestrichelt, Feld
    `outside_trim`). Aussortierte Bereiche (`excluded_ranges`) bleiben draussen — die hat der
    Nutzer ausdruecklich als „nicht ich" markiert.
  - **Zweiter Fehler dabei gefunden und behoben:** der Endpunkt lieferte INDIZES in den getrimmten
    Track. Bei Sessions mit aussortierten Bereichen ruecken die Indizes auf -> die Linien lagen
    verschoben (belegt an #3157: 18 statt 14 Versuche, die Extra-Linien genau in den aussortierten
    Stellen). Er liefert jetzt fertige Koordinaten.
  - **✅ ENTSCHIEDEN UND UMGESETZT (Jan, 02.09.: „ja perfekt, dann bitte so machen").**
    `attempt_distances` bekommt jetzt die GANZE Aufnahme (ohne Zuschnitt, ohne aussortierte
    Bereiche). Bestand nachgezogen mit `scripts/backfill-start-attempts.py` — das schreibt
    AUSSCHLIESSLICH `start_attempts_json`, keine Reanalyse: Laeufe, Distanzen, Pumps, Rekorde und
    Community bleiben unberuehrt.
    - **Ergebnis:** 653 von 2117 Sessions geaendert, **22.568 -> 24.723 Versuche (+9,5 %)**.
      Median-Startquote ueber 117 Nutzer mit >= 20 Versuchen: **63 %**.
      Beispiele: #3124 1/1 -> **1/44**, #1391 1/1 -> **1/63**, #3219 4/4 -> **4/6**.
    - **Vor dem Schreiben gegengeprueft, ob wir uns Heimfahrten einfangen:** bei den fuenf
      groessten Zuwaechsen liegt der **Median-Abstand der neuen Versuche zum Spot bei 2-4 m**,
      der groesste bei 17 m, **keiner** weiter als 500 m. Es sind echte Anlaeufe am Wasser.
      Radfahren waere ausserdem EIN langes Segment, nicht 30 kurze; Autofahrten fallen ohnehin
      ueber `MAX_FOIL_SPEED` heraus.
    - **Zwei Sessions wurden WENIGER** (#3215 12->11, #1069 2->1) — beides erklaert und richtig:
      an der Schnittkante entstand vorher ein Segment, das es ohne den Schnitt nicht gibt
      (#3215: 5 s exakt am Trimm-Beginn), bzw. das Stueck laeuft hinter dem Schnitt in etwas
      Schnelleres hinein und faellt damit als Ganzes durch (#1069). Beides sind KEINE gemergten
      Sessions (Jans Vermutung) — ein FIT- und ein Suunto-Import.
    - `_OUT_VERSION` auf **3** gebumpt: die gespeicherte Zahl aendert sich, die Session selbst
      nicht — ohne den Bump saehen die betroffenen Clients ueber das ETag ewig die alte Zahl.

- **✅ 02.09. — Startversuche auf der Karte + gemerkte Karten-Ansicht (Jans Wunsch).**
  - **Schalter „Startversuche"** neben den Pumps: gestrichelte bernsteinfarbene Linien fuer die
    Anlaeufe, aus denen KEIN Lauf wurde (die geglueckten SIND die Laeufe und liegen schon auf der
    Karte). Server: neuer lesender Endpunkt `GET /api/sessions/{id}/attempts` — dieselbe Rechnung
    wie `attempt_distances` (lockeres `attempts`-Preset auf den getrimmten GPS-Punkten), aber mit
    Index-Bereichen statt nur Distanzen. **Bewusst NICHTS gespeichert:** das vorhandene
    `start_attempts_json` umzubauen haette eine Reanalyse aller 2265 Sessions verlangt — fuer eine
    reine Anzeige. Belegt an #3234: 15 Versuche, 2 Laeufe -> 13 Linien.
  - **Standardmaessig AN** (Jan). Damit das nicht bei jeder Session einen Endpunkt anstoesst, holt
    der Client die Linien nur, wenn die Session-Antwort ueberhaupt mehr Versuche als Laeufe
    ausweist — beides steht schon drin, kostet also keinen zusaetzlichen Aufruf. Der Schalter
    erscheint aus demselben Grund gar nicht erst, wenn es nichts zu zeigen gibt (z. B. #3219, 4/4).
  - **Karten-Ansicht wird gemerkt** (`web/src/lib/sessionViewPrefs.ts`, localStorage `foil_sd_view`):
    Farbmodus (Speed/Puls/Pump/Optimal/Carves), Glaettung (1/3/5 s), Pump-Marker, Startversuche.
    Beim Oeffnen der naechsten Session gilt dieselbe Ansicht. **localStorage statt Profil**, wie
    Sprache/Theme/Kartenebene: es ist eine Geraete-Ansicht, kein Konto-Wert — ein Profil-Feld
    hiesse ein Server-Aufruf je Umschaltung und dieselbe Ansicht auf Handy UND Rechner.
    **Nicht gemerkt: die Skala** (Auto/Min/Max) — die haengt an der einzelnen Session.
    Kaputte/unbekannte Werte fallen je Feld einzeln auf den Standard zurueck; der vorhandene
    Rueckfall „Modus in dieser Session nicht verfuegbar -> speed" schreibt bewusst mit.
  - **✅ 03.09. erledigt:** Android hatte das Merken schon (`SessionViewPrefs.kt`), **iOS nicht** —
    dort jetzt `@AppStorage("sd_color_mode"/"sd_smooth_win"/"sd_show_pumps"/"sd_show_attempts")`.
    Dabei zwei weitere Luecken gefunden und geschlossen: iOS zeichnete die **misslungenen
    Startversuche** gar nicht (nur die Zahl „4/20"), und **beiden** Apps fehlte der Rueckfall
    „gemerkter Farbmodus fehlt in dieser Session -> Speed" (Karte waere grau geblieben).
    Details in `docs/PARITY-AUDIT.md`, Abschnitt 03.09.

- **🔴→✅ 02.09. — DIE eigentliche Ursache fuer „4 Laeufe statt 4/4": unser ETag. Nicht der Cache,
  nicht der Service Worker.** Jan hatte das neue Bundle (`Build 2026-09-02·fd384859`) und sah es
  trotzdem nicht — das war der Beleg, dass es NICHT am Client lag.
  - **Mechanik:** `GET /api/sessions/{id}` baut sein ETag aus `updated_at` + Like-Zahl
    (`W/"<dv>-<likes>-<liked>"`). Aendert sich die SESSION nicht, bleibt das ETag gleich — der
    Server antwortet auf `If-None-Match` mit **304**, und der Browser nimmt seinen alten Rumpf.
    Ein NEUES FELD in der Antwort (`start_attempts`) erreicht diesen Client damit **nie**, egal wie
    oft er neu laedt oder die PWA aktualisiert. Meine eigenen Pruefungen liefen ins Leere, weil ein
    frischer `urllib`-Aufruf kein `If-None-Match` schickt.
  - **Fix:** `_OUT_VERSION` (Version der ANTWORT-FORM, nicht der Daten) steckt jetzt mit im ETag.
    Ein Hochzaehlen entwertet alle ETags auf einen Schlag — genau Jans Vorschlag „setz doch fuer
    alle das ETag einmal auf jetzt", nur **ohne DB-Schreiben**: `updated_at` von 2265 Sessions
    anzufassen haette auch `data_version` verschoben, an dem die nativen Caches haengen.
  - **Gegengeprueft:** altes ETag -> **200** mit `start_attempts: 4`; neues ETag -> **304**, die
    Ersparnis bleibt also.
  - **MERKE (die dritte Cache-Ebene in dieser Kette):** Bundle-Hash (Service Worker) ·
    Laufzeit-Cache-Name (`api-session-detail-v2`) · **ETag**. Wer ein Feld hinzufuegt, muss an die
    dritte denken — die beiden ersten hatte ich, und es half nichts.

- **✅ 02.09. — „4 Laeufe" statt „4/4" bei Jans #3219: es WAR der Cache (Jans Verdacht stimmte).**
  - **Server war unschuldig, nachgemessen:** `/api/sessions/3219` liefert `start_attempts = 4` bei
    4 Segmenten, die Kachel-Bedingung (Versuche >= Laeufe) ist also erfuellt.
  - **Ursache:** der Service Worker haelt `/api/sessions/<id>` als **NetworkFirst mit 30 Tagen
    Haltbarkeit** (`vite.config.ts`), und `warmMySessions()` legt die letzten 10 eigenen Sessions
    von sich aus dort ab. Eine Antwort, die VOR dem heutigen Serverstand gecacht wurde, kennt das
    neue Feld nicht — die Kachel faellt dann auf die alte Anzeige zurueck. Genau deshalb ging es
    bei anderen Sessions: die wurden frisch geholt.
  - **Fix:** Cache-Name auf `api-session-detail-v2` hochgezogen (in `vite.config.ts` UND
    `pwaCache.ts` — die beiden MUESSEN gleich lauten), plus `raeumeAlteCaches()` beim App-Start,
    das den alten Cache wirklich loescht (Workbox raeumt nur seinen Precache auf, keine
    umbenannten Laufzeit-Caches).
  - **MERKE fuer das naechste neue Feld in `/api/sessions/<id>`:** Cache-Namen hochzaehlen und den
    alten in `ALTE_CACHES` eintragen, sonst sehen genau die aktivsten Nutzer die Neuerung als
    letzte — ihre Sessions liegen ja vorgewaermt im Cache.
  - Fuer Jan sofort: einmal neu laden (der Service Worker aktiviert sich beim naechsten Start).

- **✅ 02.09. — Android Phone 1.1.24 (38) + Wear OS 1.2.24 (1034) SIND LIVE.** Play-Mail (Jans
  Weiterleitung): „Your update to Pumpfoil, created on Aug 26, 2026 at 7:26 PM GMT, is live in the
  store." Der Zeitstempel passt auf die Minute auf unsere Einreichung vom **26.08. 21:26 Berlin**
  — also genau diese beiden Tracks, beide auf vollstaendigem Roll-out. Wie erwartet EINE Mail fuer
  beide (gleiche applicationId, drittes Mal belegt).
  - **Wie ich es geprueft habe, nachdem die Play-Seite die Version nicht mehr oeffentlich nennt
    (dort ist nichts gegenzupruefen):** ueber UNSERE Daten. `device_tokens` zeigt am 02.09. bereits
    **zwei Wear-Uhren mit `app_version = 1.2.24`** — die Auslieferung laeuft also wirklich, nicht
    nur die Freigabe. Das ist der Beleg, der am 29.07. gefehlt hat, als `appmeta` verfrueht stand
    und ein Nutzer einen Update-Hinweis ins Leere bekam.
  - `appmeta.android` = **1.1.24**, `appmeta.wear` = **1.2.24**, Server neu gestartet, beide
    Endpunkte gegengeprueft. Changelog-Eintrag geschrieben (Telefon- und Uhr-Inhalt getrennt).
  - **Stand aller Plattformen jetzt:** Garmin 1.0.85 · Android 1.1.24 · Wear 1.2.24 · iOS/Apple
    1.1.27 (1.1.28 wartet auf Pruefung) · Zepp 1.0.6 (1.0.7 wartet auf Pruefung).
  - **Fertig im Baum, noch nicht eingereicht:** Phone **1.1.25** / Wear **1.2.25** — die tragen die
    heutige Arbeit (Halten/Druecken, Spot-Vergleich, Geraete aufraeumen, Datenauskunft,
    Nur-GPS-Hinweis, Aussortiert-Hinweis, Kachel Laeufe/Starts, Aktivitaetstyp-Umzug).

- **✅ 02.09. — Garmin 1.0.85 IST LIVE, Freigabe-Kette komplett abgearbeitet.** Jans Meldung aus
  dem Store: „Latest Release September 1, 2026 · Version 1.0.85 · Size 71 KB".
  **Selbst gegengeprueft** (nicht nur gemeldet): die Store-Seite nennt 1.0.85.
  1. `build-all.sh`: **129 ok, 0 fehlgeschlagen**, `catalog.json` 129 Eintraege **alle 1.0.85**,
     `partmap.json` 218 Part-Numbers. Live gegengeprueft ueber `/api/app/devices` — 129 Geraete,
     alle 1.0.85.
  2. `appmeta.garmin` auf **1.0.85** (Server neu gestartet, `/api/app/latest?platform=garmin`
     antwortet 1.0.85) -> vorhandene Uhren sehen jetzt den Update-Hinweis. **Anders als bei
     1.0.84**, das bewusst uebersprungen wurde: dort gab es fuer vorhandene Uhren nichts zu holen.
  3. Changelog-Eintrag zum 02.09. (Halten/Druecken samt Anlass, Garmin 1.0.85, Foil-Band-Fix auf
     iOS, Kachel „Laeufe/Starts", Polnisch).
  - **Nebenbei auf Jans Zuruf:** der Halbsatz „Gilt nur fuer dich" im Layouts-Hinweis ist raus —
    in allen 17 Web-Sprachen UND in den vier nativen Tabellen (17 Stellen je Plattform). Begruendung
    Jan: „das ist doch quatsch, alle einstellungen gelten nur fuer einen selber". Achtung fuer
    spaeter: `scripts/i18n-port.py` fuegt nur EIN, es aktualisiert nichts — Textaenderungen an
    vorhandenen Schluesseln muss man wie hier ueber alle vier Tabellen fahren.

- **✅ 02.09. — 1.0.85 bei Garmin eingereicht (Jan: getestet + hochgeladen), Melder informiert.**
  Jans Meldung nachts: „getestet und bei garmin hochgeladen … sollte morgen frueh (2. September 26)
  verfuegbar sein". Auf Jans ausdrueckliche Bitte habe ich **u404 im 1:1-Chat geschrieben**
  (Franzoesisch = seine Profilsprache, `bot-post.py --dm 404 --nochmal`, Nachricht 1444):
  wo die Einstellung steht (**Profil → Champs de données**, mit den exakten Wortlauten aus der
  fr-Locale), dass sie fuer alle seine Uhren gilt und schon jetzt gesetzt werden kann, dass sie auf
  der Garmin **ab 1.0.85** greift (aeltere Versionen ignorieren sie und verlangen weiter das
  Halten), dass das Halten weiterhin funktioniert, dass beim Verwerfen eine Rueckfrage kommt — und
  dass Apple Watch, Wear OS und Amazfit mit ihrem naechsten Update nachziehen.
  **`--nochmal` war noetig** (im Faden stand schon eine Antwort von mir); Jans Bitte war die
  ausdrueckliche Freigabe dafuer.
  **Offen bleibt die Kette nach der Freigabe:** `build-all.sh` → `appmeta.garmin` auf 1.0.85 →
  Changelog.

- **🟡 02.09. — Garmin 1.0.85 GEBAUT (Jan releast heute).** Inhalt: die neue Profil-Einstellung
  **„halten oder druecken"** (s. Eintrag darueber) — auf der Uhr loest im press-Modus schon ein
  kurzer Druck aus, das Halten funktioniert unveraendert weiter.
  - Store-`.iq`: `/home/jan/release-staging/garmin-1.0.85/pumpfoil-1.0.85.iq`, **13,3 MB**,
    **218 von 218 Varianten, BUILD SUCCESSFUL, 0 Fehler** (19.421 Warnungen — dieselben
    Container-Typ-Hinweise wie in jedem Build, Log daneben).
  - Test-`.prg` fuer Jans fenix 7X Pro: `Pumpfoil-fenix7xpro.prg` (97.660 B), mit `-r` gebaut,
    Dateiname wie vereinbart.
  - `Config.VERSION` 1.0.84 → **1.0.85**; Manifest unveraendert (129 Produkte).
  - **`watch/bin` NICHT angefasst, `appmeta.garmin` bleibt auf 1.0.83.**
  - **Freigabe-Kette fuer DIESE Version (anders als 1.0.84 — hier lohnt sich das Update fuer
    vorhandene Uhren):** 1. `.iq` einreichen 2. Freigabe abwarten 3. `build-all.sh` 4. `appmeta.
    garmin` auf **1.0.85** (Update-Hinweis auf den Uhren) 5. Changelog-Eintrag.
    Vorher NICHTS davon — sonst bewirbt die Website eine Version, die im Store fehlt (10.08.).

- **✅ 02.09. — Profil-Einstellung „halten oder druecken" fuer die Uhr-Aktionen, auf ALLEN vier
  Uhr-Plattformen.** Anlass: u404 meldete am 01.09., dass auf seiner Garmin der lange Druck auf
  START mit „Mann ueber Bord" belegt ist — unser Menue war damit unerreichbar; er half sich, indem
  er MOB abschaltete. Jans Vorgabe: **eine** Einstellung im Profil fuer ALLE eigenen Uhren (kein
  Geraete-Override — eine Bediengewohnheit hat der Mensch, nicht die Uhr), **Default bleibt
  `hold`**, und sie gilt fuer JEDE Stelle mit 2-s-Halten, nicht nur fuers Beenden.
  - **Server:** `settings_json.stop_mode` = `hold` (Default) | `press`, validiert im PUT, und als
    `stopMode` im Uhr-Config-Block (`/api/devices/config`) — den holen alle vier Plattformen schon.
  - **Garmin:** kurzer Druck loest beim LOSLASSEN aus (Ring laeuft trotzdem an, das Halten
    funktioniert unveraendert weiter — man bekommt einen Weg DAZU, keiner faellt weg). Dabei die
    doppelte Ausloese-Logik in `RecordDelegate` zu einer Stelle (`_ausloesen`) zusammengefuehrt,
    getrennt nach (:full) Aktions-Menue und (:lite) direkt speichern. Beide Stufen gebaut
    (fenix7 + fr55).
  - **Wear OS / Apple Watch:** `HoldButton` bzw. `HoldToStopButton` bekommen einen Tipp-Modus.
    **Verwerfen fragt dort einmal nach** (zweiter Tipp, entschaerft sich nach 4 s): das Halten war
    an der Stelle der einzige Schutz davor, eine Aufnahme mit einem Fehlgriff zu loeschen.
  - **Zepp:** der Bildschirm-Knopf war ohnehin ein Tipp; neu ist der kurze Druck auf die
    SELECT-Taste. Der Tasten-Hinweis unten sagt dann „STOPP" statt „Halten = STOPP".
    **Die Touch-Sperre bleibt bewusst auf Halten** — ein Tipp wuerde die Sperre sinnlos machen,
    genau davor schuetzt sie ja im Wasser.
  - **Einstellung sichtbar in Web (Account), Android und iOS** (Radio/Picker statt Schalter: zwei
    gleichrangige Wege, kein An/Aus), 4 Schluessel × 17 Sprachen.
  - **Beinahe-Fehler beim Bauen, festgehalten:** ich hatte auf Wear zuerst `I18n.t("rec.sure")`
    geschrieben — ein Schluessel, den es nicht gibt. Genau der Fehler, den ich am 01.09. auf
    Android gefunden hatte (dort stand woertlich „watchStats.hint" auf dem Bildschirm). Die
    Gegenprobe „benutzte gegen definierte Schluessel" faengt das; sie laeuft jetzt auch fuer die
    Uhr-Tabellen: **Wear 82 benutzt, Apple 76 benutzt, beide ohne Fehlstelle.** Statt eines neuen
    Schluessels haengt die Rueckfrage jetzt ein „?" an den vorhandenen Wortlaut.
  - `:app:` + `:wear:compileDebugKotlin` gruen, `monkeyc` fuer fenix7 + fr55 gruen, `swiftc -parse`
    gruen, `node --check` fuer Zepp gruen, `tsc --noEmit` + `npm run build` gruen. Server neu
    gestartet, `PUT stop_mode` end-to-end gegen das Bot-Konto geprueft (press/hold/Unsinn).
  - **Noch nicht bei den Nutzern:** Web ist live, die Uhr-Teile brauchen je einen Release
    (Garmin-Build, iOS/Wear/Zepp-Einreichung).

- **🔴→✅ 02.09. — POLNISCH liess sich gar nicht speichern: `SUPPORTED_LANGS` im Server kannte
  `"pl"` nicht. Gemeldet von u149 (01.09. 19:49, 1:1-Chat an mich), sofort behoben und live.**
  - **Meldung:** „There is an issue with switching to Polish. Its switch again to English, when you
    switch to other app and back to Pumpfoil app."
  - **Ursache:** Polnisch ist seit dem 25.08. in ALLEN Clients (`web/src/i18n/locales/pl.ts`,
    `I18n.LANGS`, `Loc.langs`), aber die Server-Whitelist in `auth.py` wurde nie ergaenzt. Folge:
    `_clean_lang("pl")` gab still `"en"` zurueck, das Profil speicherte Englisch. Die App zeigte
    Polnisch trotzdem sofort an (lokales `appLang`) — und beim naechsten Profil-Abruf (App aus dem
    Hintergrund zurueck, `SessionStore.profile.didSet` schreibt `appLang` neu) sprang alles auf
    Englisch. Genau das beschriebene Verhalten.
  - **Belegt statt vermutet:** in der DB hatte **KEINES der 393 Konten** `language = "pl"` — bei
    einer seit einer Woche angebotenen Sprache. Der Melder selbst steht auf `en`. (Verteilung:
    191 de, 100 en, 76 fr, 10 cs, 6 fi, 5 ru, 4 nl, 3 it, 3 gsw, 2 es, 2 pt, 1 nb.)
  - **Fix:** `"pl"` in `SUPPORTED_LANGS`, plus ein Kommentar, dass diese Liste mit den drei
    Client-Listen uebereinstimmen MUSS und was passiert, wenn nicht. Server neu gestartet.
  - **End-to-End gegengeprueft** ueber die echte API mit dem BOT-Konto (nicht Jans, s. Memory):
    `PUT language=pl` -> `pl`, `GET /api/auth/me` -> `pl`, unbekanntes `xx` faellt weiter zurueck,
    danach auf `de` zurueckgesetzt.
  - **Betroffen war nicht nur die iOS-App:** die Uhr holt ihre Sprache aus demselben Profil, ein
    polnischer Nutzer haette sie also nirgends bekommen.
  - **🔲 OFFEN fuer Jan:** Antwort an den Melder (Entwurf kann ich schreiben) — und die Frage, ob
    wir die drei Client-Listen und die Server-Whitelist maschinell gegeneinander pruefen wollen,
    damit die naechste Sprache nicht wieder nur halb ankommt.

- **✅ 01.09. — Kachel „Läufe/Starts" in der Session-Detailansicht (Jans Wunsch), mit (i).**
  Anlass: „2 Läufe" sieht nach faulem Abend aus, wenn es 15 Anläufe waren. Jans Entscheidung nach
  drei Vorschlägen: **in die vorhandene Läufe-Kachel**, Format `4/20` mit der Quote klein daneben,
  Beschriftung „Läufe/Starts", **sichtbar für alle** (konsequent — Läufe, Pumps und Puls stehen
  dort schon öffentlich).
  - **Server (additiv):** `AnalysisOut.start_attempts` = ANZAHL aus `start_attempts_json`
    (die Distanzen bleiben serverseitig, sie werden nirgends angezeigt). Bewusst NICHT vom
    Empfindlichkeits-Preset überlagert: die Versuche kommen immer aus dem festen attempts-Preset.
  - **Zwei Regeln, aus dem Bestand abgeleitet** (2265 Sessions gemessen): ohne Versuchsdaten bleibt
    es bei der alten Anzeige, und wenn MEHR Läufe als Versuche herauskommen (15 Sessions — die zwei
    Detektoren sind sich dort uneins) zeigen wir nur die Laufzahl statt eines unsinnigen „12/9".
    **Nicht gedeckelt:** die linke Zahl IST die Laufzahl der Session, sie darf nicht von der
    Lauf-Tabelle darunter abweichen. Verteilung sonst: 1127 Sessions mit mehr Versuchen als Läufen
    (Median-Quote 64 %), 681 mit Läufe == Versuche (zeigt „8/8"), 442 ohne beides.
  - **(i) erklärt es** (Jans Zusatz): links die Läufe aus dem Bewegungsmodell, rechts die Starts aus
    reinem GPS (>= 2 s über ~8 km/h, deshalb zählen Fehlversuche mit und Gehen an Land nicht), und
    dass beide Zahlen nur für den ausgewerteten Teil der Session gelten. Web: Klick öffnet einen
    Dialog (kein `title`-Tooltip — auf dem Handy unsichtbar). Android: `AlertDialog`. iOS: `.alert`.
  - **Drei Plattformen gleichzeitig**, 3 Schlüssel × 17 Sprachen über `scripts/i18n-port.py`.
    `tsc --noEmit` + `npm run build` gruen, `:app:compileDebugKotlin` gruen, `swiftc -parse` gruen.
  - **iOS 1.1.28 ist schon eingereicht (22:24), das hier ist NICHT drin** — kommt in die nächste
    Runde (Phone 1.1.25 / Wear 1.2.25 tragen es mit, beide noch nicht eingereicht).

- **✅ 01.09. — Zwei falsche Kommentare zur Empfindlichkeit korrigiert (nur Kommentare, kein
  Verhalten).** Aufgefallen bei der Untersuchung zu u228: `gps.py` behauptete
  „Community/Rekorde nutzen IMMER `normal`", `__init__.py` an anderer Stelle „kanonisch (oben)
  bleibt Standard = Community" — beides das Gegenteil dessen, was 30 Zeilen weiter oben in
  derselben Datei steht und was der Code tut.
  - **Wahrheit:** es gibt genau EINEN Analyse-Lauf, und der bekommt `_preset_kw` (die Stufe des
    Besitzers). `res_personal = res if _sens != "normal"` legt DASSELBE Ergebnis zusätzlich unter
    dem Stufen-Schlüssel ab — es ist kein zweiter, „öffentlicher" Lauf mit `normal`.
  - **Am Bestand nachgemessen:** bei **12 von 12** Sessions von Nutzern mit `light`/`attempts` sind
    die kanonischen Spalten (`num_runs`, `foiling_time_s` — genau die, die Community, Rekorde und
    Bestenlisten lesen) identisch mit `sensitivity_json[<stufe>]`. Kein Normal-Ergebnis dazwischen.
    Verteilung heute: 350 Nutzer `normal`, 33 `attempts`, 21 `light`.
  - **Wann es falsch wurde:** am **08.07.** mit `bbaa57c1` („gewähltes Preset ist die maßgebliche
    Analyse — überall, auch öffentlich"). Die Kommentare wurden damals nicht mitgezogen.
  - **Der Nutzer-Text war die ganze Zeit richtig** (`foilsens.hint`: „Gilt überall — deine Stufe
    ist die maßgebliche Auswertung, auch in Community, Rekorden und Bestenlisten"). Es war also
    reine Entwickler-Fehlinformation — die aber genau in der Frage zugeschlagen hätte, ob man
    Nutzern die Stufe als Lösung anbietet.
  - Server neu gestartet, Import und `/api/app/news` gruen.

- **✅ 02.09. 15:5x — iOS/Apple Watch 1.1.28 (32) FREIGEGEBEN** („Review of your submission has
  been completed. It is now eligible for distribution.", Jans Meldung aus App Store Connect,
  Uebermittlungskennung `6f161b72-c5b4-415f-90f0-399fa210c091`). Eingereicht 01.09. 22:24, also
  gut 17 Stunden Pruefung.
  **Noch offen, in DIESER Reihenfolge:** 1. pruefen, ob die Version wirklich im Store steht (die
  **Produktseite** `apps.apple.com/app/pumpfoil/id6783975714` ist die Wahrheit, NICHT
  `itunes.apple.com/lookup` — der Endpunkt haengt bei frischen Versionen tagelang nach, s. Notiz
  in `appmeta.py`), 2. dann `appmeta.ios` UND `appmeta.apple` ZUSAMMEN auf 1.1.28, 3. Changelog.
  **Was NICHT drin ist:** der Error-153-Fix am Social-Feed-Player (02.09.) — in 1.1.28 bleibt der
  Player im Community-Feed schwarz. Faehrt in der naechsten Einreichung mit; ein Rueckzug waere
  unverhaeltnismaessig, die Version bringt sonst alles Neue.

- **🟡 01.09. 22:24 — iOS/Apple Watch 1.1.28 (32) eingereicht (Verlauf)** („Warten auf Pruefung"; Jans
  Meldung aus App Store Connect, Uebermittlungskennung `6f161b72-c5b4-415f-90f0-399fa210c091`,
  eingereicht von Jan). Live ist weiter **1.1.27 (31)**.
  **Inhalt (12 Aenderungen seit 1.1.27, chronologisch):** GPS-Bereitschaft auf der Apple Watch
  (GPS schon im Ruhebild + Anzeige) · Spot-Listen-Korrektur · synchrones Abspielen im Vergleich ·
  Verlaufskarte je Lauf · Sessions-Listen starten mit „alle" · vergleichbare Foils (Band-Auswahl)
  fuer Rekorde und Bestenlisten · Upload-Karte auf der Session-Detailseite · Spot-Vergleich ·
  Uhren aufraeumen (ausblenden/entfernen/widerrufen) + Update-Hinweis je Uhr · Datenauskunft
  (eigene Daten exportieren) · Nur-GPS-Hinweis auf der Session · Aussortiert-Hinweis auf der
  Startseite samt Erklaerung in der Liste. **Der Band-Auswahl-Fix von 22:05 ist drin** (die
  Auswahl lud die Rekorde nicht neu) — er kam VOR der Einreichung, das passt also.
  **Nach Freigabe zu tun:** `appmeta.ios` UND `appmeta.apple` zusammen auf 1.1.28 setzen (beide,
  s. Bilanz vom 31.08.), Changelog-Eintrag, und die Release-Notes-Texte stehen im Chat vom 01.09.

- **📌 01.09. — MERKE: die persoenliche Empfindlichkeit kann Laeufe NICHT retten, die das
  Bewegungsmodell verworfen hat.** Anlass: Jan fragte zu einer Session mit nur 2 Laeufen (u228,
  Laax, 53:45), ob etwas nicht erkannt wird — und ob die Profil-Einstellung die kurzen Laeufe
  zeigen wuerde. **Beides nachgemessen, rein lesend** (`analyze_session_v2` direkt, NICHT
  `run_analysis` — das committet):
  - **Die zwei Laeufe sind die Wahrheit der Aufnahme.** In den ausgewerteten 44:34 war der Fahrer
    **61 s** ueber ~11 km/h; die zwei laengsten Phasen (17 s / 14 s) sind genau die zwei Laeufe.
    15 Startversuche, davon 13 nur 3–8 s. Der Trim (4:49 vorn, 4:24 hinten) hat nichts
    weggeschnitten: dort zusammen **1 s** ueber 11 km/h. Daten sauber (25,2 Hz gemessen,
    `exact_chunks`, `detection=model`), Foil und Puls wie in seinen anderen Sessions.
  - **Die Einstellung aendert NICHTS:** v2 mit `normal`/`light`/`attempts` liefert **je 2 Laeufe**.
    Grund: die Presets lockern nur die GPS-Schwellen (`enter_speed`, `min_segment_s`,
    `min_seg_avg_speed`), aber **mit Accel ist das On-Foil-MODELL die Quelle der Maske**
    (`detect_v2.py`: „Physik als Schranke, nicht als Detektor"). Die Modell-Maske markiert in der
    ganzen Session **21 s** on-foil (zwei Phasen: 16 s + 5 s). In den drei Grenzfaellen
    (6/6/7 s bei Ø 12–14 km/h, Fenster-Label sogar „gleiten") sagt das Modell **0 s** — und
    `_rette_keime` kann nur retten, wo ein Keim IST.
  - **Folge fuer die Kommunikation:** Nutzern mit „zu wenige Laeufe" NICHT die
    Empfindlichkeits-Einstellung als Loesung anbieten, solange die Session `detection=model` hat.
    Sie hilft nur bei GPS-only-Auswertungen und bei knapp zu kurzen/langsamen Laeufen, die das
    Modell schon erkannt hat.
  - **Nichts geschrieben** (Jans Entscheidung nach der Verifikation). `bot-post.py` hatte den
    zweiten Beitrag in denselben 1:1-Chat ohnehin von selbst abgelehnt.

- **✅ 01.09. — Dritter Durchgang: die drei letzten inhaltlichen Luecken der Apps sind zu.**
  1. **Startseiten-Hinweis „aussortiert"** (Android + iOS): ein Einzeiler, wenn FRISCH etwas nicht
     als Pumpfoilen gezaehlt wurde (`sorted_out_new`, letzte 7 Tage) — verfaellt von selbst, es
     gibt nichts wegzuklicken. Fuehrt direkt in die Aussortiert-Ansicht. Dafuer tragen die
     Profile-Modelle jetzt `sorted_out`/`sorted_out_new`.
     **Android-Detail:** die Bottom-Nav-Route `sessions` nimmt keine Argumente, und den Filter
     dauerhaft nach `MainActivity` zu hoisten waere fuer diesen einen Fall zu viel — daher
     `SessionsWunsch`, ein benannter Einmal-Wunsch, der beim Abholen geleert wird. iOS bekommt
     stattdessen `SessionsView(startFilter:)`.
  2. **Erklaerung IN der Aussortiert-Ansicht** (`sessions.otherWhy/otherAssign/otherDefault`):
     warum die Aufnahme dort liegt und dass man sie selbst einordnen darf. Genau der Satz, den es
     in der PWA nur gibt, weil ein Nutzer erst durch Nachfragen erfuhr, wo seine Session steckt.
  3. **Update-Hinweis je Uhr:** beide Apps zeigten `update_available` gar nicht an — man fuhr
     monatelang eine alte Uhr-App, ohne es zu erfahren. Bewusst mit `settings.watchUpdate` und
     NICHT `account.deviceUpdate`: letzterer endet auf „→ herunterladen", und den .prg-Download
     gibt es nur im Web (die Uhr holt sich das Update ueber ihren eigenen Store).
  - Nicht uebernommen: die Zahl am Aussortiert-Reiter (`(n)`) — Kosmetik, kein Informationsverlust.
  - `:app:` + `:wear:compileDebugKotlin` gruen, `swiftc -parse` gruen. Laeuft in **Phone 1.1.25**
    und **iOS 1.1.28** mit.

- **✅ 01.09. — Zweiter Durchgang: der Nur-GPS-Hinweis fehlte den Apps komplett.** Gefunden ueber
  den vollstaendigen Schluessel-Abgleich (1621 Web-Keys gegen 858 Android / 843 iOS; der Rest ist
  ueberwiegend zu Recht web-only: Admin 202, Layout-Editor 94, Startseite 76, Pump-Tagging,
  PWA-Installation, Kontoverknuepfungen).
  - **`sd.gpsWarning` / `sd.lowRateWarning`:** eine Session ohne (brauchbare) Beschleunigungsdaten
    zeigt keine Pumps und keine Kadenz. Die PWA sagt WARUM; Android und iOS liessen den Nutzer
    raten. Jetzt auf beiden, mit derselben Fallunterscheidung: gar kein Accel gegen zu niedrig
    getaktet (dann steht die gemessene Rate drin — der FR55-Fall). Dafuer tragen die Metrics-
    Modelle jetzt `detection` und `accel_hz_effective`, die der Server ohnehin mitliefert.
  - **Bessere Beschriftung** fuer die ausgeblendeten Uhren: `account.devicesShowHidden`
    („{n} ausgeblendete anzeigen") statt meiner improvisierten Fassung.
  - Weiter offen und bewusst nicht gebaut (nicht Parität, sondern Absicht): Pump-Tagging
    (Jan: „machen wir andermal"), Layout-Editor, Admin, FIT-Import, Kontoverknuepfungen.

- **✅ 01.09. — Paritaets-Durchgang Natives (Jans Loop-Auftrag). Vier echte Luecken gefunden und
  geschlossen; FIT-Import bewusst ausgelassen.** Geprueft wurde gegen den CODE, mit zwei Sieben:
  alle seit dem 26.08. neu in `web/de.ts` aufgenommenen Schluessel gegen die nativen Tabellen, und
  alle im Web benutzten API-Endpunkte gegen `Api.kt`/`Api.swift`. Schon nachgezogen waren
  Sync-Abspielen, Foil-Baender, Listen-Vorgabe „alle", Verlaufskarte je Lauf, Satellitenansicht,
  Feedback-Anhaenge.
  1. **Spot-Vergleich** (`SpotCompareSection.kt` / `SpotCompareView.swift`) — fehlte komplett:
     kein Modell, kein Endpunkt, keine Schluessel. Je Kennzahl der fuehrende Spot, darunter der
     gewaehlte (vorbelegt: eigener Homespot) mit Wert und Rang; acht Kennzahlen wie im Web, davon
     zwei Einzel-Rekorde mit Halter + Datum, die zu genau der Session fuehren. Sitzt wie in der
     PWA direkt unter der Karte.
  2. **Geraete aufraeumen** (`WatchScreen.kt` / `WatchView.swift`) — Natives konnten Uhren nur
     ANSEHEN und Modi setzen. Jetzt Ausblenden (reversibel), Entfernen (nur Eintraege ohne
     Session — genau die fehlgeschlagenen Pairing-Versuche) und Widerrufen, mit denselben
     Rueckfragen wie im Web. **Wichtig war die Rueckrichtung:** ohne „N ausgeblendete anzeigen"
     (`include_hidden`) waere Ausblenden auf dem Telefon eine Einbahnstrasse gewesen.
  3. **Datenauskunft** (`profile.exportData`) — beide Apps konnten das Konto LOESCHEN, aber die
     eigenen Daten nicht herausgeben. Jetzt JSON ueber das System-Teilen-Blatt (Android
     FileProvider wie beim GPX/FIT-Export, iOS `ActivityView`).
  4. **Anzeigefehler:** Android benutzte `watchStats.hint`, ohne dass der Schluessel in der
     Tabelle stand — `I18n.t` gibt dann den SCHLUESSELNAMEN zurueck, auf der Uhren-Statistik stand
     also woertlich „watchStats.hint". Gegenprobe ueber alle benutzten gegen alle definierten
     Schluessel: sonst fehlt keiner (die restlichen Treffer sind zur Laufzeit zusammengesetzt).
     Ausserdem zeigen beide Natives jetzt den vollen Hinweistext auf Foil-/Uhren-Statistik statt
     der Kurzfassung — und nicht mehr in Kleinschrift.
  - **BEWUSST NICHT gebaut: FIT/TCX/GPX-Import auf den Telefonen.** Waere machbar (Dateiwaehler +
    Multipart), aber Jan am 01.09.: „fit Import will keiner, das gibt es laengst, es geht um
    automatische anbindungen". Wenn es doch kommt, ist der Vertrag `POST /api/sessions/upload-fit`,
    Feld `file`, Antwort `SessionSummary` oder `{skipped, detail}`.
  - **Neues Werkzeug `scripts/i18n-port.py`:** traegt Schluessel aus den Web-Locales in ALLE VIER
    nativen Tabellen (`I18n.kt`, `I18nExtra.kt`, `Loc.swift`, `LocExtra.swift`, zusammen 18.600
    Zeilen). Von Hand sind das 14 Einfuegungen je Schluessel. Fehlt eine Uebersetzung im Web,
    bleibt die Luecke und die App faellt auf Englisch zurueck — lieber Luecke als geraten. Hier
    waren alle 17 Sprachen vorhanden (15 Schluessel uebertragen).
  - Alles laeuft in den fertigen, noch nicht eingereichten Versionen mit: **Phone 1.1.25,
    iOS 1.1.28**. `:app:` + `:wear:compileDebugKotlin` gruen, `swiftc -parse` gruen (Member gegen
    die Deklarationen gegengeprueft, parse allein findet das nicht).

- **✅ 01.09. — Upload-Anzeige: Detailseite zeigt dieselbe Karte wie die Uebersicht; die alte Notiz
  war im Light-Mode unlesbar.** Jans Befund an einer laufenden Testsession (Screenshot):
  „Beschleunigungsdaten werden hochgeladen … ist nicht lesbar" + „die session sollte auch die
  gleiche anzeige verwenden wie die session-uebersicht waehrend eines uploads".
  - **Ursache — die Falle ist generell:** `slate` ist per CSS-Variablen **theme-invertiert**
    (`tailwind.config.js` + `index.css`). Die Notiz hatte `text-slate-700 dark:text-brand-200`,
    also greift **slate-700 im Light-Mode** — und das ist dort `203 213 225`, ein sehr helles Grau
    auf hellem Grund. **Regel (steht schon als Kommentar in `UploadProgressCard.tsx`): EINE
    slate-Klasse pro Element, KEIN `dark:`-Variant.** Jetzt `text-slate-200` (hell im Dark, dunkel
    im Light) und `text-sm` statt `text-xs`.
  - **Gegenprobe ueber alle tsx-Dateien:** das Muster tritt sonst **nirgends** auf. Alle weiteren
    `text-slate-700/800/900/950` sitzen auf Markenflaechen (`bg-brand-400`), wo helle Schrift im
    Light-Mode gewollt ist. Sieben Stellen nutzen `slate-600` als gedaempftes Grau (Gedankenstrich,
    „nicht unterstuetzt", zwei Chat-Hinweise) — in beiden Themes sichtbar, nur kontrastarm;
    unveraendert gelassen. Zwei davon sind `text-[10px]` — Kandidat fuer die „nie winzig"-Regel,
    aber nicht Teil dieser Meldung.
  - **Gleiche Karte auf drei Plattformen:** `SessionUploadCard` (Web/Android/iOS) rendert dieselbe
    Zeile wie die Liste — Geraetename, GPS-Haken, Prozent + Teile, Fortschrittsbalken,
    Stall-Hinweis — nur **ohne Klick-/Tap-Ziel**, sie wuerde auf sich selbst fuehren. Auf iOS dazu
    die Zeile in `UploadCardRow` herausgezogen, damit Liste und Detail garantiert dasselbe zeigen.
    **Rueckfall:** ist der Upload durch und laeuft nur noch die Analyse, steht die Session nicht
    mehr in `/in-progress` — Web zeigt dann die (jetzt lesbare) schlanke Notiz, die Natives nichts.
    Android/iOS hatten auf der Detailseite bisher **gar keine** Upload-Anzeige, nur stilles Pollen.
  - Laeuft in den fertigen, noch nicht eingereichten Versionen mit: **Phone 1.1.25, iOS 1.1.28**
    (kein zusaetzlicher Bump). `tsc --noEmit` gruen, `npm run build` gruen,
    `:app:compileDebugKotlin` gruen, `swiftc -parse` gruen.

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


- **✅ 01.09. — Garmin 1.0.84 IST LIVE, Kette abgearbeitet.** Jans Meldung: „ist im store schon
  verfuegbar, gerade meine eigene fenix geupdated, geht" (Konsole: 1.0.84, intern 38, 70 KB).
  - `build-all.sh` gelaufen: **129 ok, 0 fehlgeschlagen**, `catalog.json` 129 Eintraege alle auf
    **1.0.84**, `partmap.json` **218** Part-Numbers. Live gegengeprueft ueber `/api/app/devices`.
  - **`appmeta.garmin` bewusst auf 1.0.83 gelassen** (Jans Vorgabe): kein Update-Hinweis an
    vorhandene Uhren, weil 1.0.84 fuer sie nichts aendert. Live gegengeprueft:
    `/api/app/latest?platform=garmin` gibt weiter 1.0.83.
  - **Changelog-Eintrag geschrieben** (Jan: „im changelog kannst du noch alles neue eintragen") —
    inklusive der fēnix-9-Unterstuetzung, aber mit dem ausdruecklichen Satz, dass vorhandene
    Garmin-Nutzer nichts davon haben und nicht aktualisieren muessen.
  - **⚠️ MERKE: `apps.garmin.com` hing NACH.** Die JSON-Abfrage lieferte noch 1.0.83, waehrend Jans
    eigene Uhr 1.0.84 schon zog. **Dasselbe Muster wie bei Apple heute Morgen** (dort log die
    `itunes.apple.com/lookup`-API 50 Minuten). Bei beiden Stores gilt: **die API ist gecacht, das
    echte Geraet bzw. die Produktseite ist die Wahrheit.**
  - **✅ Die ACHT NEUEN Geraete stehen schon auf der Website zum Download** (Jans Vorgabe: „die
    neuen prgs fuer die neuen modelle kannst du aber gern schon bauen und mit aufnehmen auf unsere
    seite"). Live gegengeprueft: `/api/app/devices` liefert **129** Geraete, und
    `/api/app/download/fenix947mm` bzw. `fenix843mm` antworten mit **HTTP 200** und der richtigen
    Groesse.
  - **🔑 Nur die acht neu gebaut, NICHT alle 129.** Ein voller `build-all.sh`-Lauf haette die
    vorhandenen 121 Downloads auf eine Version gehoben, die im Store noch nicht liegt — genau der
    Fehler vom 10.08. Der Katalog hat ein `version`-Feld JE Eintrag, `build-all.sh` stempelt dort
    aber pauschal EINE Version; deshalb wurde `catalog.json`/`partmap.json` gezielt neu erzeugt und
    die alten Angaben bewahrt. Stand jetzt: **121 × 1.0.83 + 8 × 1.0.84**, 218 Part-Numbers.
    (Sicherung der beiden JSON vor dem Eingriff im Scratchpad.)
  - Nach der Freigabe kann `build-all.sh` normal laufen, dann sind alle 129 auf 1.0.84.

- **🟡 01.09. — Garmin 1.0.84 GEBAUT (Details zum Paket).**
  Inhalt: **reine Geraete-Erweiterung, keine Code-Aenderung** — die acht neuen Geraete
  (fēnix 9 / 9 Pro / 9 Pro Solar in 43/47/51 mm plus die zuvor fehlende **fēnix 8 43 mm**).
  Manifest 121 → **129** Produkte, Store-Paket **218 statt 210** Gerätevarianten.
  - Store-`.iq`: `/home/jan/release-staging/garmin-1.0.84/pumpfoil-1.0.84.iq`, **13,3 MB**,
    **218 von 218 Varianten, BUILD SUCCESSFUL, 0 Fehler** (Log daneben).
  - Test-`.prg` fuer Jans fenix 7X Pro: `Pumpfoil-fenix7xpro.prg` (97 372 B), mit `-r` gebaut,
    Dateiname wie vereinbart.
  - **`watch/bin` bewusst NICHT angefasst** und **`appmeta.garmin` bleibt auf 1.0.83** — sonst
    bewirbt die Website eine Version, die im Store noch nicht liegt (Fehler vom 10.08.).
  - **🔑 ABWEICHENDE Freigabe-Kette fuer DIESE Version (Jans Vorgabe 01.09.):** „wenn die version
    freigegeben wird muessen wir das nicht auf den uhren oder der webseite bekannt geben, wer schon
    eine Uhr hat erlangt keinen Vorteil durch dieses update".
    1. `.iq` hochladen (Jan reicht am 01.09. ein) 2. Store-Freigabe abwarten
    3. **`build-all.sh`** — das MUSS laufen, sonst bekommen fēnix-9-Kaeufer keine Datei; danach
       bietet die Website **129** Downloads statt 121.
    4. **`appmeta.garmin` NICHT auf 1.0.84 bumpen** und **kein Changelog-Eintrag.**
    **Warum das genau richtig ist:** der Update-Hinweis auf der Uhr entsteht dadurch, dass die App
    ihre `Config.VERSION` mit `appmeta.garmin.latest` vergleicht (`SessionRecorder.mc`). Bleibt
    `latest` auf 1.0.83, sieht keine vorhandene Uhr einen Hinweis — richtig, denn fuer sie aendert
    1.0.84 nichts. Die Website liefert die Downloads dagegen aus `watch/bin`, also bekommen neue
    Geraete ihre Datei trotzdem. **Kein Widerspruch zum 10.08.-Fehler:** dort wurde eine Version
    BEWORBEN, die es im Store nicht gab; hier ist sie im Store und wird bewusst nicht beworben.
    5. Beim NAECHSTEN inhaltlichen Release (1.0.85+) `appmeta` normal hochziehen — dann bekommen
       alle den Hinweis, und zwar fuer etwas, das ihnen auch nuetzt.

- **🔴 01.09. NACHGEPRUEFT (Jans Frage, ob das Garmin-Connect-SDK wieder verfuegbar ist):
  UNVERAENDERT ZU. Kein Hinweis auf eine Wiedereroeffnung.**
  - `developer.garmin.com/gc-developer-program/overview/`: **kein Antrags-Link.** Ich habe ALLE
    Links der Seite auflisten lassen — nur die API-Unterseiten (Activity, Courses, Health,
    Training, Women's Health), Forum, Brand Guidelines, allgemeines Entwickler-Kontaktformular,
    Rechtstexte. Banner unveraendert: **„Stay tuned for more updates on the program"**.
  - **⚠️ FALLE: die FAQ-Seite behauptet weiter das Gegenteil.**
    `.../gc-developer-program/program-faq/` sagt „If you are interested, please request the Garmin
    Connect Developer Program and we'll quickly review your application", Pruefung in zwei
    Werktagen, keine Lizenz-/Wartungsgebuehren, nur fuer geschaeftliche Nutzung. **Das ist genau
    der Wortlaut, den meine Recherche vom 28.06. schon gefunden hatte — also vor dem Entfernen des
    Formulars.** Die FAQ ist offenbar nie mitgepflegt worden. Wer nur die FAQ liest, haelt das
    Programm fuer offen. **Entscheidend ist, ob es ein Antragsformular gibt — und das gibt es nicht.**
  - Im Connect-IQ-Ankuendigungsforum steht **nichts** zu GCDP (2026 nur fenix 9 und SDK 9.2) —
    erwartbar, es sind zwei getrennte Programme.
  - **Grenzen dieser Pruefung, damit niemand sie ueberschaetzt:** `www.garmin.com` liefert meinem
    Abruf **403** (Bot-Schutz), ich habe also nur den `developer.garmin.com`-Spiegel gesehen; und
    die **Websuche war fuer die Sitzung aufgebraucht** (200/200), ein Rundblick auf Fremdquellen
    war nicht moeglich. Geprueft ist damit die Primaerquelle, nicht die Stimmung im Netz.

- **🔲 01.09. NEBENFUND aus derselben Recherche, der uns direkt betrifft: fēnix 9 und fēnix 9 Pro
  gibt es seit dem 25.08.2026 im Connect IQ SDK Manager — wir unterstuetzen sie NICHT.**
  Belegt: `watch/manifest.xml` fuehrt **121** Geraete, `fenix9` kommt darin nicht vor, und die
  Geraete-Dateien fehlen auch lokal (`~/.Garmin/ConnectIQ/Devices/` hat als neuestes
  `fenix8pro47mm`). Neue Spitzen-Uhren, die Leute jetzt kaufen, koennen die App also nicht
  installieren.
  **Aufwand:** Geraete-Dateien ueber den SDK Manager holen (`connectiq-sdk-manager-linux.zip` ist
  ein **GUI**-Programm, kein CLI), zwei `iq:product`-Zeilen ins Manifest, dann `build-all.sh` und
  ein Store-Release. **Braucht Jans Entscheidung** (Release-Runde) — `watch/bin` ist live, also
  nicht nebenbei.

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
- **✅ GELOEST (Jan, 30.08.) — stiller Datenverlust bei vollem Uhr-Speicher.** Die Uhr warnt
  jetzt VORHER (Restzeit-Schaetzung + Warnschwellen, s. docs/WATCH-STORAGE.md). **Philipp hat es
  getestet und am See live mit Jan bestaetigt.** Der urspruengliche Befund bleibt als Beleg stehen:
  original:
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
  **✅ 03.09. — Handy-Recorder nachgezogen:** Android (`RecordScreen.kt`, 20 x 100 ms statt 30) und
  iOS (`RecordView.swift`, `minimumDuration` + Balken-Animation 2.0 statt 3.0) halten jetzt
  ebenfalls 2 s. Der Hinweistext nennt keine Sekundenzahl, es blieb also bei den Zahlen.
  **Ein Unterschied zur Uhr bleibt bewusst offen:** auf dem Handy beendet das Halten die Aufnahme
  DIREKT (kein Menü Speichern/Pausieren/Verwerfen), der Fehlgriff-Schutz ist also eine Sekunde
  kürzer geworden. Wenn das am Wasser stört: eine Zahl je Plattform zurückstellen.
  Bleibt offen für **Zepp** (dort ist es der Tasten-Langdruck; die Dauer bestimmt Zepp selbst,
  für 2 s bräuchte es eine eigene Zeitmessung über KEY_EVENT_PRESS/RELEASE).
  **Nicht zu verwechseln mit `stop_mode`** („ein Tipp statt halten", Profil): das ist auf allen
  vier Uhren gebaut — Garmin, Apple Watch (`ContentView.swift`), Wear (`MainActivity.kt`) und
  **auch Zepp** (`page/index.js`, `s.stopMode === "press"`). Auf die Handy-Recorder ist es
  bewusst NICHT übertragen: dort ist ein Fehl-Tipp auf einem grossen Touchscreen viel
  wahrscheinlicher als auf einer Uhrentaste, und die Uhr-Begründung (manche Garmin belegen den
  Langdruck mit „Mann über Bord") trifft aufs Handy nicht zu. Jans Entscheidung, falls doch.
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

- **✅ GELOEST 30.08. — Meldung „iOS 1.1.25 stuerzt beim Start ab" (uid 149).** Ursache gefunden
  und behoben: die ungueltige Karten-Region (s. Eintrag weiter unten) — es war NICHT sein Geraet
  und auch nicht die 1.1.25, sondern unsere Datenlage ab 07:55 desselben Tages. Serverseitig sofort
  entschaerft, Client-Fix in 1.1.26 (eingereicht). Der urspruengliche Befund darunter bleibt als
  Beleg stehen, weil die Messreihe (kein Totalausfall) auch kuenftig nuetzlich ist.
  Urspruenglicher Stand:
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

- **🔴 WEITER OFFEN (Stand 30.08.) — Instinct-2-Klasse zeichnet NICHTS auf.** Beim Durchgehen der
  offenen Meldungen nachgemessen: die 128-KB-Klasse (FR55 & Co.) hat sich durch den Lite-Build
  erholt — **FR55 6 von 7 brauchbar** seit dem 20.08. Die Instinct-2-Familie aber nicht:
  **1 von 9 brauchbar**, und es passiert HEUTE noch.
  | Session | Nutzer | Modell | Zeitpunkt | Version | Chunks |
  |---|---|---|---|---|---|
  | S3115 | 214 | Instinct 2X Solar | 30.08. 14:22 | 1.0.80 | **0** |
  | S3092 | 214 | Instinct 2X Solar | 30.08. 09:31 | 1.0.80 | **0** |
  | S3067 | 214 | Instinct 2X Solar | 30.08. 09:11 | 1.0.80 | **0** (haengt auf `recording`) |
  | S2839 | 142 | Instinct 2S | 24.08. 18:11 | 1.0.79 | **0** |
  | S2623/S2622 | 142 | Instinct 2S | 23.08. | 1.0.78 | **0** |
  Symptom unveraendert: Session wird am Server registriert, danach kommt kein einziger Chunk.
  Drei Starts an EINEM Tag bei uid 214 — der Nutzer merkt, dass nichts ankommt, und versucht es
  wieder. Das ist ein stiller Totalausfall fuer diese Geraete.
  **Naechster Schritt:** die betroffenen Nutzer sind bekannt (214, 142, 369) — eine gezielte
  Nachfrage („was zeigt die Uhr beim Start, kommt eine Fehlermeldung?") bringt schneller Klarheit
  als weitere Statistik. Vorher pruefen, ob 1.0.82 daran etwas geaendert hat.

- **✅ NEU 30.08. — Rekorde und Kennzahlen je Foil auf der Startseite.** Angeregt durch Nicobpys
  Feedback (29.08.), das wir zuerst als Community-Tabelle gelesen hatten; Jan wollte es persoenlich:
  alle Kacheln des Rekord-Abschnitts noch einmal **je Foil**, plus eine Gruppe „ohne Foil-Eintrag".
  - **Server:** `GET /api/sessions/stats-by-foil` (`accel_only`, `period`, `sport` wie `/stats`).
    `compute_overall_stats` hat dafuer einen `foil`-Filter bekommen (`None` = alle, `"none"` =
    ohne Eintrag, int = dieses Foil) — dieselbe Rechnung, kein zweiter Weg.
  - **Nur Foils im gewaehlten Zeitfenster** (Jan): bei „Heute" bleibt die Liste kurz, bei „Allzeit"
    steht alles da. Faellt aus der Gruppierung von selbst.
  - **Erst ab ZWEI Gruppen sichtbar** — bei einem einzigen Foil waere es eine wortgleiche
    Wiederholung. Gemessen: 189 Nutzer sehen nichts (keine Foil-Angabe), 117 haben genau ein Foil,
    **83 sehen den Block**, der groesste mit 7 Gruppen.
  - **Quersumme geprueft** (Jans Konto): Sessions 241, Laeufe 1570, Pumps 19 510 — je Foil summiert
    exakt die Gesamtzahlen der Startseite. Bei km/min 0,1 Abweichung, weil jede Gruppe einzeln
    gerundet wird.
  - Zwei neue i18n-Schluessel (`phome.byFoil`, `phome.noFoil`) in allen 17 Web-Sprachen.
  - **Reihenfolge: laengster Lauf oben** (Jan, 30.08.) — nicht nach Session-Zahl. Beim Vergleich
    zweier Fluegel ist die Frage „womit stehe ich am laengsten oben", nicht „welches habe ich
    oefter mitgenommen". Gleichstand -> mehr Sessions zuerst; „ohne Foil-Eintrag" landet dadurch
    von selbst unten.
  **Noch offen:** Android und iOS haben den Abschnitt noch nicht (Paritaet), und die Uhr braucht
  ihn nicht.

- **✅ 30.08. — „Warum steht im Profil noch ein Update-Hinweis auf 1.0.82?"** (Jan, nachdem seine
  Uhr laengst 1.0.82 hatte). Untersuchung: der Hinweis war korrekt, aber er galt den FALSCHEN
  Geraeten. Sichtbar waren nur zwei Garmin-Eintraege — die **Simulator-Kopplung** (id 735, heute
  19:47 erstellt, meldet 1.0.81) und eine **fēnix 5** (id 560, 1.0.78, zuletzt 17.08.). Seine
  echte fēnix 7X Pro (id 297, 1.0.82, 60 Sessions, zuletzt 20:56) war **ausgeblendet**.
  **Ursache:** `_auto_hide_alte` blendet beim Pairing aeltere Eintraege derselben Part-Number aus.
  Der Simulator meldet dieselbe Part-Number wie die echte Uhr (er gibt sich als fēnix 7X Pro aus)
  und hat sie damit verdraengt. Die Annahme der Regel — „der alte Token kann ohnehin nicht mehr
  benutzt werden" — stimmt hier nicht: die Uhr lief weiter.
  **Fix (`deps.current_device`):** meldet sich ein ausgeblendetes Geraet wieder, wird das
  Ausblenden aufgehoben. Ein Geraet, das spricht, ist keine Karteileiche.
  **Bestand geprueft:** im ganzen Datenbestand gibt es genau EINEN solchen Fall — Jans eigenen.
  Die Regel selbst bleibt also richtig, sie hatte nur keinen Rueckweg.
  Jans Eintrag taucht beim naechsten App-Start der Uhr von selbst wieder auf (kein DB-Eingriff).

- **✅ 30.08. — Startseite: Standard-Zeitfenster 10 Tage, mit schrittweisem Rueckfall.** Jan:
  „default sollte jetzt 10 tage sein" + „bitte schrittweise, nach 10 tagen kommen 30 tage, dann
  1 jahr, dann gesamt". Umgesetzt in `PersonalHome.tsx` (`STANDARD_ZEITRAUM`, `RUECKFALL`):
  ist das Fenster leer, wird beim ERSTEN Laden eine Stufe weiter aufgemacht — 10 T → 30 T → 1 J →
  Allzeit. Sobald jemand selbst auf einen Zeitraum tippt, steht seine Wahl (`autoRef`).
  **An allen 200 Nutzern mit Sessions durchgerechnet, wo sie landen:**
  | Fenster | Nutzer |
  |---|---|
  | 10 Tage | 101 (50,5 %) |
  | 30 Tage | 28 (14,0 %) |
  | 1 Jahr | 17 (8,5 %) |
  | Allzeit | 54 (27,0 %) |
  **Niemand mit Sessions sieht leere Kacheln.** Ohne den Rueckfall waeren es 38 % gewesen — das
  war der Anlass. Der Rueckfall macht nur so weit auf, wie noetig: wer letzte Woche gefahren ist,
  sieht letzte Woche und nicht seine Rekorde von vorletztem Sommer.

- **✅ ERLEDIGT (nachgeprueft 31.08.) — Kennzahlen je Foil in Android und iOS.** Der Eintrag stand
  hier faelschlich weiter auf OFFEN; im Code ist beides da: `HomeScreen.kt` holt `Api.statsByFoil`
  und rendert den Block ab zwei Gruppen (Z. 213/402), `HomeView.swift` genauso (Z. 456/275), beide
  mit `phome.byFoil`/`phome.noFoil` in allen Sprachen. Wer hier „offen" liest, prueft es bitte
  erst gegen den Code. Urspruengliche Notiz: Der Web-Teil ist seit 30.08.
  live und abgehakt (s. o.); die Apps fehlen. Aufwand ist klein, weil der Server die Arbeit macht:
  `GET /api/sessions/stats-by-foil` liefert die Gruppen fertig sortiert (laengster Lauf oben) samt
  Foil-Beschriftung, dazu die Regel „nur Foils im gewaehlten Zeitfenster" und „erst ab zwei
  Gruppen zeigen". Zu bauen ist je App nur: Abruf + derselbe Kachel-Block je Gruppe unter den
  bestehenden Rekorden (`HomeScreen.kt` bzw. `HomeView.swift`), zwei i18n-Schluessel
  (`phome.byFoil`, `phome.noFoil` — Web-Texte in 17 Sprachen vorhanden, App-Sprachen daraus
  ableiten). **Erst nach den laufenden Store-Pruefungen** (iOS 1.1.26, Play 1.1.24/1.2.24), sonst
  kollidiert es mit den Einreichungen. Eintrag auch in docs/PARITY-AUDIT.md.

- **📐 GEPLANT (30.08., noch NICHT gebaut) — Community-Feed aus den Social-Kanaelen der Nutzer.**
  Jans Idee: ein Feed im Community-Bereich, gespeist aus dem, was Nutzer selbst hinterlegen —
  abspielbar **auf unserer Seite** mit Weiter/Zurueck, damit man im Thema bleibt und unabhaengig
  vom Algorithmus ist. Genau ein Kanal je Nutzer, von Jan freigegeben, blockierbar.

  **Machbarkeit geprueft (das bestimmt die Form):**
  - **YouTube: ja, automatisch.** `feeds/videos.xml?channel_id=UC…` liefert die letzten 15 Videos
    als RSS, ohne Schluessel. Von dieser VM erreichbar — getestet, HTTP 200, 15 Eintraege.
    `@handle` -> `channel_id` geht ueber die Kanalseite, ABER nur mit Browser-Kennzeichner und
    `curl -L` (sonst 302/leer); der Treffer steht als `channel/UC…` im HTML, nicht als
    `"channelId"`. An `@pumpfoil-org` verifiziert -> `UCb_1b-TkdGE4kZWX17HDH9g`.
  - **Instagram: NEIN.** Offene Endpunkte 2021/22 dicht, **Basic Display API am 04.12.2024
    abgeschaltet**. Nutzer-Medien nur noch ueber Graph-API mit dessen OAuth, Business-Konto und
    Meta-App-Review. Scraping = ToS-Verstoss + Login-Wand. Einzelne Posts einbetten geht
    (`instagram.com/p/<code>/embed`), ein Kanal-Feed nicht.
  - **TikTok: wie Instagram** — oEmbed fuer Einzelvideos offen, Nutzer-Feed nur mit OAuth.

  **Entscheidungen (Jan, 30.08.):**
  - Quellen: **ausschliesslich der freigegebene YouTube-Kanal je Nutzer.** Session-Videos bleiben
    bewusst DRAUSSEN (Jan, 30.08.): „das sind ja meistens die, die man auch im social media teilt"
    — sie sind im Medien-Bereich der Community ohnehin praesent, und getrennt zu laufen erspart
    den Hinweis-/Abwahl-Mechanismus komplett.
  - **Historie: alle je gesehenen Videos werden behalten.** Der RSS-Feed zeigt nur die letzten 15;
    was wir einmal geholt haben, bleibt in `social_items` stehen und faellt nicht wieder heraus.
    Damit waechst der Feed mit der Zeit ueber das RSS-Fenster hinaus. **Grenze, die bleibt:** was
    ein Kanal VOR seiner Freigabe veroeffentlicht hat, bekommen wir nie — ausser den 15, die beim
    ersten Abholen im Fenster stehen. Es gibt keinen schluessel-freien Weg, die Upload-Liste eines
    Kanals vollstaendig zu lesen. Fruehe Freigabe = laengere Historie.
  - Einbettung: **Click-to-Load** (Vorschaubild bei uns, iframe erst auf Klick) — haelt unsere
    Bewertung „kein Cookie-Banner noetig" aufrecht.
  - Platz: Community-Bereich, **waehrend der Entwicklung ganz unten unter den Uhr-Layouts**,
    nach Jans Freigabe weiter nach oben (evtl. ueber „Medien").
  - Darstellung: **eine Zeile nebeneinander wie auf der public-Seite**, Klick -> Vollbild mit
    Weiter/Zurueck links und rechts.
  - Moderation: **Admin-Block + Melden-Knopf fuer Nutzer**.
  - Genau **ein** Kanal je Nutzer, zwei Felder: der freigegebene bleibt live, eine Aenderung liegt
    daneben und ersetzt ihn erst bei der Freigabe.

  **Vorgeschlagenes Modell:** Tabelle `social_channels` (user_id unique, url, channel_id,
  pending_url, status, blocked, Zeitstempel) + `social_items` (Quelle, user_id, platform,
  external_id UNIQUE, url, titel, thumb, published_at, blocked, reports) — `external_id` unique
  macht das stuendliche Abholen zu einem simplen Upsert: bekanntes Video wird aufgefrischt, neues
  angelegt, nichts geloescht. Genau daraus entsteht die Historie.
  Abholung per systemd-Timer stuendlich (1 Request je Kanal), Aufloesung des Handles einmalig
  bei der Freigabe.

  **Bekannte Grenzen, bewusst in Kauf genommen:** RSS liefert nur die letzten 15 Videos je Kanal
  (keine Historie) · die Handle-Aufloesung liest HTML, kann also brechen — aber sichtbar, bei der
  Freigabe, nicht still im Betrieb · geloeschte/private IG-Posts brauchen eine Ersatzkachel ·
  CSP braucht `frame-src` fuer die eingebetteten Plattformen, bevor wir sie erzwingend schalten ·
  der Feed startet duenn (nur freigegebene Kanaele, je 15 Videos) und fuellt sich mit der Zeit ·
  Age-Gate (`social_allowed=false`) muss den Feed ausblenden wie Chat und Community.

  **Reihenfolge:** (1) Modell + Profil-Feld + Admin-Freigabe, noch ohne Feed · (2) RSS-Abholung +
  Feed-Endpunkt + Zeile und Vollbild · (3) Melden/Blocken und die endgueltige Platzierung.

- **✅ GEBAUT 30.08. — Community-Social-Feed (Schritte 1–3 komplett).** Nach dem Plan oben, mit
  Jans Entscheidungen: nur YouTube-Kanaele, ein Kanal je Nutzer, Freigabe durch Jan, Historie.
  - **Server:** `social_channels` + `social_items`; `GET/PUT/DELETE /api/social/mine`,
    `GET /api/social/feed` (alle Kanaele gemischt, nach Veroeffentlichungsdatum),
    `POST /api/social/item/{id}/report`; Admin unter `/api/admin/social` (Liste, approve, reject
    mit Grund, Kanal sperren, Einzelvideo sperren).
  - **Abholung:** `scripts/social-poll.py` + `foil-social-poll.timer` (stuendlich, 5 min Streuung,
    User-Timer). Nichts wird geloescht -> Historie waechst ueber das 15er-RSS-Fenster hinaus.
  - **STOLPERSTEIN, geloest:** aus der EU leitet YouTube die Kanalseite auf `consent.youtube.com`
    um; `requests` bekam die Zustimmungsseite statt des Kanals (mit `curl` war es zufaellig
    durchgegangen — der erste Test war also truegerisch). Cookie **`SOCS=CAI`** loest es, ohne
    Login und ohne Kennung. Ohne diesen Fund haette die Freigabe jedes Mal „Kanal nicht
    auffindbar" gemeldet.
  - **Web:** `SocialFeed.tsx` (Zeile zum Wischen, Klick -> Vollbild mit Weiter/Zurueck, Pfeiltasten,
    Melden-Knopf) ganz unten auf der Community-Seite · Kanal-Feld im Profil **direkt unter dem
    Anzeigenamen** (Jan) · Admin-Tab „Social-Feed".
  - **16 neue i18n-Schluessel in allen 17 Sprachen.** Dabei zweimal in die Anfuehrungszeichen-Falle
    getappt (`d'indiquer`, `video's` zerlegten fr.ts und nl.ts) — am Ende alle Zeilen maschinell
    mit `json.dumps` neu geschrieben. **Merke: Locale-Zeilen nie per repr()/Handquoting bauen.**
  - **Ende-zu-Ende geprueft:** Eintragen -> wartend -> Freigabe (loest `@pumpfoil-org` zu
    `UCb_1b-TkdGE4kZWX17HDH9g` auf, prueft den RSS-Feed gegen) -> Abholung 15 Videos -> Feed
    liefert sie neueste zuerst. Jans eigener Kanal ist als erster eingetragen und freigegeben.
  - **FEHLER von mir, sofort korrigiert (Jan sah es an seinem Ghostery):** die Vorschaubilder
    hingen an `i.ytimg.com` — ein Drittkontakt zu Google BEIM SEITENAUFBAU, also genau das, was
    Click-to-Load verhindern soll. Der Blocker hatte recht. Es gab die Loesung im Projekt laengst:
    `GET /api/public/video-thumb/{id}` (main.py) liefert das Bild ueber unseren Server, gecacht,
    und wird von der oeffentlichen Startseite schon so benutzt — deshalb war sie dort auch nicht
    geblockt. Jetzt nutzt der Feed dieselbe Route. **Gegenprobe:** im gebauten Bundle kommt
    `ytimg.com` nicht mehr vor; die verbliebenen YouTube-Treffer sind drei `<a href>` und die
    `nocookie`-Adresse im iframe (laedt erst nach dem Klick).
    **Lehre:** bei allem, was fremde Inhalte einbindet, ZUERST suchen, wie es die oeffentliche
    Seite loest — dort ist die Datenspar-Frage schon einmal beantwortet worden.
  - **Nachtrag 30.08. (Jans Entscheidungen beim Ausprobieren):**
    · Vollbild nutzt jetzt den ganzen Schirm (92 % Hoehe, Breite minus 7rem fuer die Pfeile) —
      das Format des Videos verraet YouTube nirgends (nicht im RSS, nicht im oEmbed, das stur
      16:9 meldet, nicht am Vorschaubild: unsere Shorts haben unscharfe statt schwarzer Raender).
      Statt zu raten bekommt der Rahmen alles und der Player skaliert selbst.
    · **Voller YouTube-Player: probiert und am selben Abend wieder verworfen.** Ziel war, aus dem
      Feed heraus liken zu koennen. Ergebnis: **es kam kein Like-Knopf** — der erscheint nur bei
      YouTube-Angemeldeten mit erlaubten Dritt-Cookies (Safari/Firefox blocken die standardmaessig).
      Genau das war vorher gesagt worden; der Versuch hat es bestaetigt. Zurueckgebaut auf
      `youtube-nocookie` OHNE Einwilligungs-Schranke, CSP wieder nur nocookie, `imp.yt2` und die
      Regel in CLAUDE.md zurueckgesetzt.
      **Stattdessen:** ein auffaelliger Knopf „Auf YouTube liken" fuehrt hinaus — auf dem Handy in
      die App, wo der Nutzer angemeldet ist. Das ist der einzige Weg, der fuer JEDEN funktioniert
      und beim Creator wirklich ankommt.
      **Eigene Herzchen bei uns: von Jan ausdruecklich abgelehnt** („bringt nichts fuer den
      content creator") — Modell und Endpunkt wieder entfernt. Die leere Tabelle
      `social_item_likes` ist beim Neustart einmal angelegt worden und steht noch in der DB; sie
      stoert nicht, kann aber bei Gelegenheit weg (kein Eingriff ohne Ansage).
      **Wer es erneut erwaegt:** ein echter Like aus unserer Seite geht NUR ueber die YouTube Data
      API (`videos.rate`) mit Google-OAuth je Nutzer plus Verifizierung eines sensiblen
      Zugriffsbereichs — Wochen Antragsarbeit, und wer die Freigabe verweigert, hat wieder nichts.
    · **Dauerschleife im Player** (Jan): `loop=1` wirkt bei einem Einzelvideo nur zusammen mit
      `playlist=<id>` — ohne das zweite Feld ignoriert YouTube die Wiederholung.
    · Hinweistext nennt jetzt, dass Instagram und TikTok das nicht erlauben (17 Sprachen).
    · Vorschau-Zeile laedt in Schueben von 24 nach, sobald man ans Ende wischt.
    · **CSP nachgezogen (sofort, Jan sah `ERR_BLOCKED_BY_CSP`):** `frame-src` kannte nur
      `youtube-nocookie.com`, der volle Player wurde von unserer eigenen Richtlinie blockiert.
      Jetzt stehen beide drin — die Startseite bleibt bei nocookie, nur der Feed nutzt den vollen.
      `img-src` braucht KEINEN Google-Host, weil die Vorschaubilder ueber unseren Server laufen.
    · **Platzierung final (Jan, 30.08.):** direkt UEBER „Medien" auf der Community-Seite — also
      an dritter Stelle nach den Rekord-Kacheln. Waehrend der Entwicklung stand er ganz unten.
    · **Vorschau im Hochformat (9:16)** wie auf der oeffentlichen Startseite — „es gibt fast nur
      Shorts bei uns". Titel und Autor liegen im Bild, Play-Kreis in Marken-Cyan.
  **Noch offen:** Android/iOS (Paritaet).

- **📥 Inbox 30.08. (Jan) — Dateianhaenge im Feedback-Formular.** Nutzer sollen Screenshots/Logs
  anhaengen koennen. Grenzen gegen Missbrauch mitdenken: Dateitypen weiss-listen (Bilder + Text/
  Log, KEINE Archive/Skripte), Groesse je Datei und je Meldung, Anzahl je Meldung, Rate-Limit je
  Konto, Ablage ausserhalb des ausgelieferten Verzeichnisses mit generiertem Namen (nie der
  Originalname), Bilder serverseitig neu kodieren (entfernt eingebettete Skripte und EXIF-GPS),
  Anzeige nur im Admin. Vorbilder im Haus: Session-Fotos und Spot-Beschreibungs-Fotos.

- **⚠️ MERKEN (30.08.) — Sicherheits-Kopfzeilen frieren im Service Worker ein.** Nach der
  CSP-Aenderung sah Jan weiter `ERR_BLOCKED_BY_CSP`, obwohl der Server die neue Richtlinie
  ausliefert (per `curl` gegengeprueft: `frame-src` enthaelt beide Hosts). Ursache: der SW
  precacht `index.html` **mitsamt den Kopfzeilen von damals**. Solange er die gecachte Antwort
  ausliefert, gilt die ALTE CSP — Blocker aus- und einschalten hilft nicht, Neuladen auch nicht
  zwingend.
  **Abhilfe fuer den Nutzer:** das Banner „Neue Version verfuegbar" -> „Aktualisieren"
  (`registerType: "prompt"`, PwaStatus.tsx), oder alle Tabs schliessen und neu oeffnen.
  **Konsequenz fuer uns — und genau das ist mir passiert:** ich habe die CSP im Server geaendert
  und neu gestartet, aber den **Web-Build nicht wiederholt**. `sw.js` blieb damit unveraendert ->
  kein neuer Service Worker -> kein Update-Banner -> die Clients behielten die alte, gecachte
  `index.html` mit der alten CSP. Jan fiel es auf („das mit den Versionsupdates kam die ganze
  Zeit, nur jetzt nicht — hast du was vergessen?").
  **REGEL: nach jeder Aenderung an Sicherheits-Kopfzeilen `cd web && npm run build` ausfuehren**,
  auch wenn kein einziges Byte Frontend-Code betroffen ist. Der Build stempelt die neue Kennung
  (`version.json`, aus dem Commit) in `sw.js`, und erst dadurch holt der Client die Seite samt
  frischer Kopfzeile neu. Gegenprobe: `md5sum web/dist/sw.js` vor und nach dem Build.
  **UND: ERST committen, DANN bauen.** Die Kennung kommt aus `git rev-parse --short HEAD`
  (`vite.config.ts:buildStamp`). Wer vor dem Commit baut, stempelt den VORIGEN Stand — `sw.js`
  bleibt dann byte-gleich und es gibt kein Update-Banner, obwohl neuer Code ausgeliefert wird.
  Am 30.08. genau so passiert und am `md5sum` gesehen (unveraendert trotz Aenderung).
  **Zu ueberlegen:** Navigationen auf NetworkFirst umstellen, damit frische Kopfzeilen sofort
  gelten. Kostet einen Netzwerk-Roundtrip beim Seitenaufbau — bewusst nicht im Vorbeigehen
  geaendert, das ist eine PWA-Grundsatzentscheidung.

- **✅ GEBAUT 30.08. — Dateianhaenge im Feedback-Formular.** Jans Wunsch mit „sinnvollen Grenzen
  gegen abuse & hacking". Nutzer haengen Screenshots oder Logs an; sichtbar nur im Admin.
  **Die Grenzen, und warum sie so sind:**
  - **Weiss-Liste statt Schwarz-Liste:** Bilder (jpg/png/webp/gif/bmp/tif) und Text (txt/log/json/
    csv/ips/crash/xml/yml). Alles andere fliegt raus — `.exe`, `.zip`, `.pdf`, `.svg`, `.html`,
    `.php` gepru:eft. **`.svg` bewusst NICHT dabei**: SVG ist XML und kann Skripte tragen.
  - **Bilder werden NEU KODIERT** (`media.reencode_image`, WebP). Das ist der eigentliche Schutz,
    nicht die Endung. Belegt: ein JPEG mit `<script>alert(1)</script>` und GPS-Text im
    Kommentarfeld kam mit 60 675 Bytes rein und mit 3 126 Bytes raus — beides weg, EXIF leer,
    Kante auf 1600 begrenzt. Eine als Bild getarnte PHP-Datei: „Kein gültiges Bild".
  - **Text muss sich als UTF-8 dekodieren lassen** — was das nicht tut, ist kein Log (Binaerdatei
    im Test abgewiesen). Max. 256 KB, Bilder max. 8 MB.
  - **Hoechstens 3 Anhaenge je Meldung**, nur an die EIGENE Meldung und nur binnen 30 Minuten —
    sonst koennte man fremde oder alte Meldungen volllaufen lassen. Beides getestet, beides
    abgewiesen. Dazu ein eigenes Rate-Limit (30/h).
  - **Ablage unter `data_dir/feedback/` mit erzeugtem Namen, NICHT unter `/media`** (das wird
    statisch ausgeliefert). Abruf nur ueber `GET /api/admin/feedback/attachment/{id}`.
    Text geht mit `text/plain` UND `Content-Disposition: attachment` raus, damit ein als `.log`
    getarntes HTML im Admin-Browser nicht als Seite laeuft (`nosniff` setzt die App global).
  - **Originalname nur zur Anzeige**, entschaerft: `../../etc/passwd` -> `passwd`,
    `<script>.txt` -> `_script_.txt`, auf 120 Zeichen gekappt.
  **Zweiter Nebenbefund (Jan, direkt beim Ausprobieren):** ein `<a href>` bzw. `<img src>` auf die
  Admin-Route zeigte nur `{"detail":"Missing bearer token"}` — der Token steckt im `localStorage`
  und wird nur von unseren eigenen Aufrufen mitgeschickt, nicht von einer Browser-Navigation.
  Behoben, ohne die Route aufzuweichen: die Admin-Oberflaeche holt den Anhang **mit Token** und
  zeigt ihn aus einer **Blob-URL** (Bild als Vorschau, Text als Download); die URL wird beim
  Verlassen wieder freigegeben. Gegenprobe: ohne Token antwortet die Route weiterhin 401.
  **Nicht gemacht und warum:** den Token als Query-Parameter anzuhaengen waere der schnelle Weg
  gewesen — er landet dann aber in Verlauf, Lesezeichen und Server-Logs. Ein Blob kostet drei
  Zeilen mehr und laesst den Token, wo er hingehoert.
  **Nebenbefund, sofort behoben:** das Loeschen einer Meldung waere am Fremdschluessel
  gescheitert, sobald ein Anhang dranhaengt — beim Selbsttest sofort passiert. `delete_feedback`
  und `delete_all_feedback` raeumen jetzt Anhaenge UND Dateien mit weg (geprueft: 2 Dateien rein,
  0 nach dem Loeschen, keine Waisen auf der Platte).

- **✅ GEBAUT 30.08. — Satellitenansicht auf allen fünf Karten.** Nutzerwunsch (VintZ, ios-app,
  26.08.): „How hard is it to have satellite view option on the tracking map."
  **Antwort auf die naheliegende Frage: OpenStreetMap kann das NICHT** — das ist ein Datenprojekt,
  Luftbilder gibt es dort schlicht nicht. Es braucht einen zweiten Anbieter.
  **Gewaehlt: Esri World Imagery** (Jans Entscheidung) — sehr gute Aufloesung, kein Schluessel,
  keine Kosten, nur Namensnennung. Verworfen: Mapbox (Schluessel + Kosten ab 50 000 Aufrufen),
  Sentinel-2 cloudless (wirklich frei, aber 10 m — See ja, Steg nein), Landesluftbilder (je Land
  eigene Adressen, unsere Fahrer sind in ~30 Laendern). Restrisiko benannt: Esri sieht fuer den
  produktiven Einsatz formal ein Entwicklerkonto vor; faellt die oeffentliche Adresse je aus,
  bleibt die Strassenkarte und der Layer wird abgeschaltet.
  - **Ein gemeinsamer Helfer** (`web/src/lib/mapTiles.ts`) statt fuenf Kopien: Session-Detail,
    Spots, Vergleich, Verlauf und Labeling holen ihre Basiskarten dort. Vorher stand die
    Kachel-Adresse fuenfmal im Code — jetzt keinmal ausserhalb des Helfers (geprueft).
  - **Die Wahl gilt appweit** (`localStorage.map_layer`) und wird ueber die EBENE gemerkt, nicht
    ueber den angezeigten Namen — der ist uebersetzt und haette beim Sprachwechsel nicht gepasst.
  - Kachel-Adresse bei Esri in der Reihenfolge `z/y/x` (bei OSM `z/x/y`) — die Kacheln kommen
    (HTTP 200, 256x256 JPEG, an zwei Zoomstufen geprueft).
  - CSP `img-src` um `server.arcgisonline.com` ergaenzt.
  **Nebenbefund, mitgezogen:** die Datenschutzerklaerung erwaehnte **Karten mit keinem Wort**,
  obwohl wir seit jeher OSM-Kacheln laden und dabei IP und Kartenausschnitt an deren Server gehen.
  Jetzt ein eigener Abschnitt (`imp.map*`, de/de-AT/en): OSM immer, Esri NUR bei Umschalten.

- **✅ 31.08. — „Zwei Illmensee am selben Fleck": Einfallstor gefunden, nicht nur zusammengefuehrt.**
  Jans Meldung. In der DB gab es nur EINEN Illmensee-Spot (#18) — die Doppelung entstand in der
  KARTE. Kette, Schritt fuer Schritt:
  1. `spot_map` gruppiert nach `spot_id` und haengt fuer Sessions OHNE `spot_id` zusaetzlich eine
     Gruppe nach `place_name` an (gedacht fuer Altbestand). Es pruefte NICHT, ob zu dem Namen
     schon ein Spot existiert -> zwei Markierungen, gleicher Name, gleicher Fleck (279 + 1).
     Betroffen waren genau zwei Namen: Illmensee und Gošići.
  2. Warum haben Sessions keinen Spot? Zwei Wege sind ABSICHT: ohne erkanntes Foilen vergibt
     `assign_one` nur den Namen, und wer als Traverse zwischen zwei Spots startet, bekommt bewusst
     keinen. Drei Sessions waren aber `is_pumpfoil=True` MIT Laeufen und ohne Spot — die haetten
     zugeordnet werden muessen (nachgerechnet: jede ueberschneidet sich mit genau EINEM Spot).
  3. Ursache dafuer: `_spot_nachziehen` (am 24.08. fuer genau dieses Symptom gebaut, damals
     Pasohlávky) haengt an vier Analyse-Pfaden — aber **drei Pfade riefen es nie**:
     `reanalysis.py` (Massen-Reanalyse), `merge.py` (Sessions zusammenfuehren) und
     `admin.py` („Aussortierung ruecknehmen"). Alle drei koennen aus „keine Laeufe" ein echtes
     Foilen machen. Jetzt rufen alle drei nach.
  **Zwei Fixes:** (a) die Karte faltet eine namensgleiche Gruppe in den echten Spot ein statt eine
  zweite Markierung zu zeichnen — Illmensee steht jetzt mit 280 Sessions EINMAL da; (b) die drei
  Analyse-Pfade ziehen den Spot nach.
  **KEIN Spot wurde zusammengefuehrt** — Jans Sorge um Beschreibungen und Chat war berechtigt,
  betrifft diesen Fix aber nicht. Nachgesehen: `spots.py` migriert beim echten Merge Chat-Scope
  samt Lesezustand (Z. 231) UND Beschreibungen inkl. Fotos mit Konfliktregel (Z. 611) — das ist
  also abgedeckt.
  **Offen, Jans Entscheidung:** `repair(apply=True)` wuerde die drei Sessions zuordnen, die zwei
  namenlosen Moskau-Spots (#457/#458, 530 m auseinander, derselbe Nutzer) verschmelzen und meldet
  **fuenf Helsinki-Dubletten** zur Durchsicht (#359/#362/#357/#360/#361 -> #353). Trockenlauf
  gemacht, nichts geschrieben.

- **✅ 31.08. — Spot-Reparatur ausgefuehrt (nach Jans OK).** Ist-Zustand vorher gesichert
  (`server/data/spots-stand-vor-repair.json`: 386 Spots, 2203 Session-Zuordnungen).
  Ergebnis: die drei Sessions ohne Spot sind zugeordnet (2920 -> Illmensee, 2905/3084 -> Gošići),
  die zwei namenlosen Moskau-Spots verschmolzen (#458 -> #457), zwei Spots nachbenannt.
  **Danach: 0 Pumpfoil-Sessions ohne Spot, kein Name mehr doppelt, 230 Markierungen.**
  - **🔴 WICHTIG — die gemeldete „Helsinki-Gruppe" NICHT zusammenfuehren.** Die Reparatur hat sie
    zur Durchsicht gemeldet, und das war richtig: nachgemessen liegen sie **993 m bis 5,3 km**
    auseinander (#357 3,4 km, #360 5,3 km, #362 4,4 km von #353). Das sind verschiedene Reviere,
    die nur denselben Stadtnamen tragen — der Geocoder liefert bei fehlendem Gewaesser-/Ortsteil-
    Namen eben „Helsinki", und der Zaehler haengt „5", „7", „8" dran.
    **Das eigentliche Problem dort ist die BENENNUNG, nicht die Zahl der Spots.** Wer sie
    zusammenfuehrt, klebt fuenf echte Spots zu einem Klumpen ueber halb Helsinki.
    Richtiger Weg: bessere Namen (Gewaesser/Ortsteil), s. `spots.name_for`.

- **✅ 31.08. — iOS/Apple Watch 1.1.26 FREIGEGEBEN und live.** Freigabe-Mail „ready for
  distribution"; **selbst gegengeprueft** ueber `itunes.apple.com/lookup` in fuenf Laendern
  (de/us/nl/no/fi -> ueberall 1.1.26, `currentVersionReleaseDate` 2026-08-30T21:50:36).
  `appmeta.ios` UND `appmeta.apple` auf 1.1.26 (dasselbe Bundle, immer beide zusammen),
  Changelog-Eintrag geschrieben.
  **Der Server-Notbehelf fuer alte iOS-Clients BLEIBT** (`_alte_ios_app`/`_kappe_ausreisser` in
  `community.py`): 1.1.26 ist ausgenommen, aber wer nicht aktualisiert, wuerde ohne ihn wieder
  beim Start abstuerzen.
  **Damit sind die Paritaets-Punkte fuer iOS wieder anfassbar** (Kennzahlen je Foil, Social-Feed) —
  die naechste iOS-Runde kann sie mitnehmen.

- **✅ 31.08. — Zaehler-Spotnamen ersetzt, wo ein besserer Name in der DB lag (Jans „mach das fuer alle 21").**
  Vorlauf: die sieben Helsinki-Spots hatten schon eigene Namen bekommen (#353 Etelä-Haaga,
  #359 Meilahti, #362 Taka-Töölö, #357 Alppila, #356 Kuusisaari, #360 Kalasatama,
  #361 Etelä-Haaga 2) — ueber `rename_spot_row`, also mit Kaskade (Sessions, Chat-Scope,
  Beschreibung, Homespot).
  Danach dieselbe Behandlung fuer alle uebrigen Spots, deren Name auf eine Zaehl-Ziffer endet
  (Regex `' [0-9]{1,2}$'` — „Bremerhavener Ruderverein v. 1889" faellt korrekt durch).
  22 Kandidaten, davon 15 mit einem gespeicherten Alternativnamen (`water_name`/`area_name`).
  **12 umbenannt:** #163 Annecy 2 -> Lac d'Annecy (61 Sess) · #270 Berlin 4 -> Berlin Reinickendorf
  (15) · #237 Zollikon 2 -> Zürichsee (13) · #403 Zollikon 3 -> Zürichsee 2 (4) ·
  #128 Almere 6 -> Oostvaardersdiep (4) · #377 Papenberge 2 -> Oberhavel (2) ·
  #267 Whitehorse 2 -> Schwatka Lake (1) · #322 Praha 3 -> Intercamp Kotva (1) ·
  #274 Berlin 5 -> Wannsee (1) · #386 Tampere 2 -> Petsamo (1) · #169 Annecy 3 -> Le Fier (1) ·
  #361 Etelä-Haaga 2 -> Haaga (1).
  **Nachtrag nach Jans Durchsicht:** zwei der drei zunaechst ausgelassenen doch umbenannt, aber
  nicht mit dem rohen `area_name`, sondern nach dem Muster von #270 (Stadt + Ortsteil):
  #121 Utrecht 3 -> **Utrecht Oost** (14 Sess; "Oost" allein waere nur eine Himmelsrichtung) und
  #256 Berlin 3 -> **Berlin Scharfenberg** (1 Sess; aus "Parkplatz fuer Anlieger der Insel
  Scharfenberg" den Inselnamen genommen — der Spot liegt im Tegeler See direkt an der Insel,
  1155 m von #270 entfernt). **Weiter ausgelassen:** #316 Sogndal 3 -> "Vestland" (norwegische
  Provinz, viel zu grob; Jan konnte es auch nicht besser beurteilen).
  **Merkregel fuer den naechsten Durchgang: Gewaessernamen
  (`water_name`) sind praktisch immer brauchbar, Gebietsnamen (`area_name`) nur, wenn sie ein
  Revier oder einen Ortsteil benennen — nicht bei Himmelsrichtung, Provinz/Landkreis oder
  Infrastruktur.**
  Neun weitere Zaehler-Spots haben gar keinen Alternativnamen in der DB und bleiben wie sie
  sind (Almere 5, Sogndal 2/3, West-Terschelling 2, Techendorf 2, Whitehorse 3, Annecy 4/5,
  Zürichsee 2) — neun Stueck.
  **Kaskade nachgeprueft:** alle 14 Spots — Sessions tragen den neuen `place_name` (100 %),
  0 Reste unter den alten Namen in `sessions.place_name`, 0 alte Chat-Scopes, 0 Homespots.
  Reine DB-Arbeit, kein Code geaendert.

- **📥 Inbox 31.08. (Jan) — Synchron-Abspielen im Session-Vergleich.** Wenn zwei (oder mehr)
  verglichene Sessions **zeitgleich am selben Spot** stattgefunden haben, soll die
  Abspielfunktion nicht nur je Lauf, sondern **ueber die gesamten Sessions zeitsynchron**
  laufen — alle Teilnehmer gleichzeitig auf der Karte. Pausen, in denen **niemand** on-foil ist,
  werden uebersprungen (ohne Halt), Pausen einzelner Fahrer laufen normal mit.
  Zweck: Videos, in denen mehrere gleichzeitig auf dem Wasser sind.
  Bedingungen fuers Anbieten: zeitliche Ueberschneidung **und** gleicher Spot.

- **✅ 31.08. — Sprachdurchgang ueber alle Plattformen (Jans Auftrag), zwei echte Defekte.**
  Werkzeug dafuer: die Web-Locales sind die Quelle, daraus werden die Kotlin-/Swift-Zeilen
  erzeugt statt von Hand geschrieben — damit koennen die 17 Sprachen gar nicht mehr auseinander
  laufen. Abdeckung gemessen (de = 1612 Schluessel):

  | | en | pl | nb | nl/cs | fi | pt/ru/id | ja/zh | de-AT | gsw | fr/it/es |
  |---|---|---|---|---|---|---|---|---|---|---|
  | fehlt | 30 | 54 | 111 | 353 | 386 | 385 | 406 | 509 | 530 | 544–546 |

  **Defekt 1 — Mundarten fielen auf Englisch zurueck (behoben).** `gsw.ts` und `de-AT.ts` sagen
  im eigenen Kopf „fehlende Keys fallen auf Hochdeutsch zurueck". Der Code in
  `web/src/i18n/index.tsx` machte `DICTS[lang] ?? DICTS.en ?? DICTS.de` — also sahen Schweizer
  und oesterreichische Nutzer **rund 500 Texte auf Englisch statt auf Deutsch**. Jetzt gibt es
  eine `BRUECKE`: Mundart -> Hochsprache -> Englisch -> Deutsch.

  **Defekt 2 — zwei englische Luecken in der Uhren-Matrix (behoben).** `watches.nStrava` und
  `watches.st.nope` fehlten in `en.ts` und standen damit deutsch auf einer englischen Seite.
  Die uebrigen 30 Luecken in `en.ts` sind ausschliesslich `adm.*`/`nav.adminPending` — nur Jan
  sieht sie, deutsch ist dort richtig.

  **Kein Defekt, aber die Wahrheit:** die 350–550 fehlenden Schluessel je Sprache fallen sauber
  auf Englisch zurueck (Web, Android, iOS und Zepp alle gleich gebaut) — das ist die bewusste
  Overlay-Bauweise. Wer sie schliessen will, braucht echte Uebersetzungen, keinen Code.
  **Konkret offen und neu dazugekommen:** `imp.mapTitle`/`imp.map1`/`imp.map2`/`imp.mapApple`
  (Karten-Datenschutz) gibt es nur auf Deutsch und Englisch — 15 Sprachen sehen den Abschnitt
  auf Englisch. Ausserdem nennen die 15 uebersetzten Fassungen von `imp.map2` weiterhin eine
  Bildschirmecke („oben rechts"); in de/en ist die Ortsangabe raus, weil der Knopf in den Apps
  links sitzt.

- **✅ 31.08. — Kleinspeicher-Uhren geprueft (Jans Frage: landet dort Unnoetiges?). Antwort: nein.**
  Gemessen, nicht geschaetzt — je ein Einzelbuild pro Stufe ins Scratchpad (NICHT `build-all.sh`,
  das waere eine Veroeffentlichung, s. [[watch-bin-is-live]]); die Groessen stimmen byte-genau mit
  dem Live-Stand in `watch/bin` ueberein.

  | Stufe | Geraete | engster Fall | App | frei | belegt |
  |---|---|---|---|---|---|
  | LITE (96 KB) | 5 | descentg1 | 69 596 B | 28 708 B | 70,8 % |
  | ENG (128 KB) | 16 | venusq | ~74 000 B | 57 076 B | 56,5 % |
  | VOLL (≥512 KB) | 100 | fr255 | ~97 300 B | 427 300 B | 18,5 % |

  **Kein einziges der 121 Geraete liegt ueber 75 % Belegung.** Die ENG-Stufe vom 17.08. wirkt:
  die FR55 hatte auf 1.0.77 nur noch 26 020 B frei, jetzt sind es wieder ueber 57 000 B.

  **Code:** die Trennung ist vollstaendig. Alle Zeichen-Routinen der Wert-Grafiken sind
  `(:layouts)`, die Sprachtabelle ist `(:i18n)` vs. `StringsLite.mc`, die Menues `(:full)`.
  Wichtig und richtig: die Zonen-FARBE (`_scaleZone`, `_zoneOf`) ist bewusst NICHT gegated — die
  faerbt auch die reine Zahl, die es auf jedem Build gibt.

  **Gespeichert wird auf den sparsamen Stufen auch nichts Ueberfluessiges:** `_layoutsFromConfig`
  und `_layoutsFromCache` haben `(:nolayouts)`-Leerfassungen, es landet also kein
  `layouts_config`, kein Canary, kein Layout-Parser auf der Uhr.

  **Serverseitig ebenfalls sauber, nachgemessen an der echten Flotte:** alle 11 Uhren der
  96-KB-Klasse bekommen `layout_capable=False` und damit **0 Layout-Bytes**. Der Nutzdaten-Teil
  der `/config`-Antwort ist ueber alle Klassen gleich klein (Median ~220 B, groesster Fall 499 B
  bei 6 Foils) — da ist nichts zu holen.

  Randnotiz: `LAYOUT_MIN_ON_REQUEST` ist auf denselben Wert gesetzt wie `LAYOUT_MIN_MEMORY`
  (524288), damit ist der „auf ausdrueckliche Anforderung"-Pfad in `devices.py` derzeit tot.
  Kein Fehler, nur eine Bedingung, die nie greift.

- **📥 31.08. — Offen aus der Paritaets-Runde: Community-Social-Feed in Android und iOS.**
  Der einzige verbliebene Punkt aus `docs/PARITY-AUDIT.md`. Server (`/api/social/*`) und
  Web-Oberflaeche (`SocialFeed.tsx`) stehen; die Apps brauchen die Feed-Liste mit
  Hochformat-Karten, das Vollbild mit Weiter/Zurueck, das Kanalfeld im Profil und das Melden.

- **✅ 31.08. — Social-Feed in Android und iOS; damit ist die Paritaetsliste durch.**
  Beide Apps: Hochformat-Kacheln ueber „Neueste Medien", Vollbild mit Weiter/Zurueck, Melden,
  Knopf zu YouTube hinaus, Kanalfeld in den Einstellungen. Abgespielt wird ueber
  youtube-nocookie und erst nach dem Antippen — Android per WebView ohne DOM-Speicher und mit
  geleertem Cache beim Verlassen, iOS per WKWebView mit nicht-persistenter Datenablage.
  Dass die Kacheln hier den Player oeffnen statt der Session-Detailansicht, ist kein Bruch der
  Regel von 13.07. ([[native-video-thumb-no-direct-open]]): hinter einem Feed-Video steht keine
  Session, das Abspielen IST der Inhalt.

- **🟢 31.08. — Vorschaubilder-Leck geschlossen (aelter als der Feed).** Beim Einbau aufgefallen:
  die **oeffentliche Startseite** (`Home.tsx`) und die Session-Detailseite luden YouTube-
  Vorschaubilder weiter direkt von `img.youtube.com`. Auf der Startseite ging damit **die
  IP-Adresse jedes Besuchers an Google, bevor irgendjemand auf ein Video getippt hatte** — genau
  das, was am 30.08. fuer den Social-Feed abgestellt wurde (und was Ghostery damals angezeigt
  hat). Der Kommentar ueber der CSP behauptete schon „img-src braucht keinen Google-Host mehr",
  der Host stand aber noch drin, weil diese beiden Stellen ihn brauchten.
  Alle Stellen laufen jetzt ueber `/api/public/video-thumb` (Web, Android, iOS),
  `https://img.youtube.com` ist aus der CSP raus, Server neu gestartet und der Header geprueft.
  **Merke: eine Datenschutz-Korrektur an EINER Komponente heisst nicht, dass die Ursache weg
  ist — nach demselben Muster im ganzen Baum suchen.**

- **📥 31.08. — Uhr-Sprachen nl/fi/cs fehlen auf Wear OS und Apple Watch (Uebersetzungsaufgabe).**
  Garmin hat alle drei vollstaendig, Wear OS und Apple Watch koennen sie gar nicht — beide
  fallen dokumentiert auf die Geraetesprache und dann auf Englisch zurueck. Kein Fehler im Code,
  aber eine Ungleichheit: dieselbe Nutzerin bekommt ihre Sprache je nach Uhr oder eben nicht.
  **Geprueft, ob sich das aus dem Garmin-Bestand fuellen laesst: nur zum Teil.** Die Uhr-Texte
  tragen dort andere Schluesselnamen (`f.bpmMaxLast` vs. `f.lastRunMaxHr`); ueber den deutschen
  Text zugeordnet decken sich **32 von 84** Wear- und **28 von 81** Apple-Schluesseln. Fuer die
  restlichen zwei Drittel gibt es keine Quelle — die muessten uebersetzt werden. Nicht geraten.
  Zepp fuehrt nl/fi/cs zwar als Spalten, laesst sie aber in vielen Zeilen leer -> auch Englisch.

- **🟢 31.08. — Die Gegenprobe, die den eigentlichen Fehler fand: „liegt jeder Schluessel vor,
  den der Code BENUTZT?"** Die Abdeckungstabelle weiter oben beantwortet eine andere Frage
  („ist jede Sprache vollstaendig") und haette diese beiden nie gezeigt. Ueber alle sechs
  Plattformen gelaufen, 1352 benutzte Schluessel, zwei Treffer:
  - **Wear OS: `rec.paused` fehlte KOMPLETT** — und wird im Aufnahme-Schirm angezeigt. Die Uhr
    zeigte im Pausenzustand den rohen Schluessel **„rec.paused" auf dem Display**.
  - **Android Phone: `common.back`** fehlte und war die Vorlese-Beschriftung des Zurueck-Knopfs
    im Impressum — Screenreader lasen „common.back" vor.

  Beide Uebersetzungen sind **belegt, nicht geraten**: `rec.paused` steht in allen 15 Spalten in
  `watch/source/Strings.mc` (Garmin, laengst im Store), `common.back` in allen 17 Web-Locales.
  Mitgenommen: die Apple Watch hatte `rec.paused` nur in den 7 Grundsprachen plus nb — pt/id/ru
  aus demselben Bestand ergaenzt.
  **Stand danach: 0 fehlende Schluessel auf allen vier Compose-/SwiftUI-Zielen; Garmin und Zepp
  waren schon vollstaendig.**
  **Merke: diese Pruefung gehoert in jede Sprachrunde** — die Abdeckungszahl je Sprache sagt
  nichts darueber, ob ein Schluessel ueberhaupt existiert.

- **✅ 31.08. — nl/fi/cs auf Wear OS und Apple Watch nachgezogen; alle vier Uhren jetzt gleich.**
  Vorher konnte nur Garmin diese drei Sprachen. Wear OS und Apple Watch fielen dokumentiert auf
  die Geraetesprache und dann auf Englisch zurueck, Zepp fuehrte sie zwar als Spalten, liess sie
  aber in 37 Zellen leer.
  **Quellen in dieser Reihenfolge**, damit auf der Uhr moeglichst der Text steht, den ein Nutzer
  derselben Sprache auf einer Garmin schon kennt: (1) `watch/source/Strings.mc` ueber den
  deutschen Text — 33 Schluessel, (2) die Web-Locales ueber den deutschen Text — 6, (3) eigene
  Uebersetzung der uhrspezifischen Kurztexte — 46, mit Deutsch UND Englisch als Vorlage.
  **Stand: Wear 91 Schluessel je Sprache, Apple Watch 84, Zepp 0 leere Zellen** — jeweils
  0 fehlende und 0 doppelte, gemessen gegen die Schluessel, die der Uhr-Code wirklich aufruft.
  Serverseitig nichts zu tun: `/api/devices/config` reicht `user.language` unveraendert durch.

- **✅ 31.08. — Karten-Datenschutz in alle 17 Sprachen; die Erklaerung ist damit vollstaendig.**
  Jans Frage („ist der sonst in alle Sprachen uebersetzt oder ist der Karten-Absatz eine
  Ausnahme?") nachgemessen: **51 von 55 imp.*-Schluesseln standen in allen 17 Sprachen** — die
  einzige Luecke waren genau die vier Karten-Schluessel. Grund ist banal und nicht strukturell:
  die Satellitenansicht ging am 31.08. live, der Absatz entstand mit dem Feature auf Deutsch und
  Englisch, eine Uebersetzungsrunde gab es dazu nie. Jetzt 55 von 55 in 17 Sprachen.

- **🔴 31.08. — Zwei Fehler im Einfuege-Werkzeug fuer die iOS-Sprachdateien (behoben).**
  Beide hatten schon Schaden angerichtet, beide waren still:
  1. Die Pruefung „steht der Key schon in dieser Sprache?" lief fuer das LETZTE Teil-Literal
     einer Sprache bis zum Dateiende und traf dabei die Grundsprachen-Tabelle mit. Dadurch
     galten **fi, nl und cs auf iOS faelschlich als versorgt: 27 Schluessel** des Tages
     (Foil-Kacheln, Kartenumschalter, Feedback-Anhaenge, Social-Feed, Karten-Datenschutz)
     fehlten dort, ohne dass etwas gemeldet wurde.
  2. Dieselbe Pruefung erkannte die Grundsprachen-Tabelle nie, weil sie
     `[String: [String: String]]` ist und nicht `[String: String]`. Dort galt also JEDER
     Schluessel als fehlend und wurde erneut eingefuegt — beim Nachziehen von (1) entstanden so
     **27 doppelte Schluessel in EINEM Swift-Literal, und das bricht zur LAUFZEIT ab**
     („Fatal error: Dictionary literal contains duplicate keys").
  **Lehre: nach jedem Masseneinfuegen in Sprachdateien auf Dopplungen pruefen** — je Literal,
  mit korrekten Blockgrenzen. Ein `split()` auf den Tabellennamen zaehlt die Folgetabellen mit
  und meldet Dopplungen, die es nicht gibt (darauf bin ich einmal hereingefallen).

- **✅ 31.08. — Waisen-Tabelle `social_item_likes` geloescht (Jans Ansage).** Uebrig geblieben vom
  eigenen Like-Versuch am 30.08., der noch am selben Tag zurueckgebaut wurde. Vor dem Loeschen
  geprueft: **0 Zeilen, kein Modell in `models.py`, keine Codestelle, kein Fremdschluessel darauf**
  — und die Zeilenzahl direkt vor dem `DROP` noch einmal, statt der Messung von vorher zu trauen.
  DDL zum Wiederanlegen, falls das Thema je zurueckkommt:
  `id integer, user_id integer, item_id integer, created_at timestamptz`.
  Uebrig im Social-Bereich: `social_channels` und `social_items`.

- **✅ 31.08. — Alle fehlenden Web-Uebersetzungen nachgezogen (Jans Auftrag).** Vorher fehlten je
  Sprache 350–550 Schluessel und fielen still auf Englisch zurueck. Jetzt fehlen in **allen 16
  Sprachen nur noch Admin-Texte** — und die bleiben bewusst deutsch (Jan: „Admin-Ansicht kannst
  du aussparen, die nutze nur ich, die ist Absicht").

  | | vorher fehlend | jetzt (nur `adm.*`) |
  |---|---|---|
  | gsw / de-AT | 526 / 508 | 196 / 178 |
  | fr / it / es | 544–546 | 196 |
  | ja / zh | 406 | 89 |
  | pt / ru / id | 385 | 89 |
  | fi | 386 | 75 |
  | nl / cs | 353 | 60 |
  | nb | 111 | 55 |
  | pl | 54 | 47 |

  **Umfang: 371 nutzersichtbare Schluessel je Sprache, rund 4900 Uebersetzungen.** Schwerpunkte
  waren der Layout-Editor (106 Schluessel), die Uhr-Einstellungen im Konto (37), die Teilen-Karte
  (30), das detaillierte Setup (30) und die Spot-Beschreibungen (18).

  **Verfahren:** die Web-Locales sind die Quelle; ein Werkzeug im Scratchpad traegt nur ein, was
  in der Zieldatei WIRKLICH fehlt, und ueberschreibt nie einen vorhandenen Wert — was schon
  uebersetzt ist, hat jemand geprueft. Deshalb stehen unter den 371 je Sprache unterschiedlich
  viele echte Neuzugaenge (25–82 waren schon da).

- **📥 31.08. — Offen: dieselben 371 Schluessel in Android und iOS.** Die Apps ziehen ihre
  Uebersetzungen aus denselben Web-Locales, haben aber ihren eigenen Bestand. Der Nachzug dorthin
  ist derselbe Handgriff (`i18n_insert_kt.py` / `i18n_insert_swift.py`), nur noch nicht gemacht.

- **✅ 31.08. — Uebersetzungs-Nachzug in Android und iOS: alle vier App-Ziele in 17 Sprachen voll.**
  Nach dem Web-Durchgang zogen die Apps nach. Gemessen wird dabei NUR, was der Code wirklich
  aufruft — die Apps tragen nicht den ganzen Web-Bestand (der Layout-Editor z. B. ist Web-only).

  | Ziel | benutzte Schluessel | vorher auf Englisch | nachgetragen |
  |---|---|---|---|
  | Android Phone | 605 | 44–203 je Sprache | 1149 + 51 selbst uebersetzt |
  | Wear OS | 81 | 1–5 je Sprache | 13 |
  | iOS Phone | 570 | 45–183 je Sprache | 1162 |
  | Apple Watch | 74 | 1–8 je Sprache | 38 |

  **Quellen in dieser Reihenfolge:** Web-Locales (1102) → der jeweils ANDERE App-Bestand
  (Android↔iOS 60, Wear→Apple Watch 38) → eigene Uebersetzung fuer die 41 app-eigenen Schluessel,
  die es im Web gar nicht gibt (Handy-Recorder, Garmin-Installationshinweis) — die fehlten fast
  nur auf Finnisch.

- **🔴 31.08. — DIESELBE Blockgrenzen-Falle ein zweites Mal, diesmal in der Pruefung.**
  Beim ersten Messen meldete iOS „0 Luecken" — und das war falsch: die Ad-hoc-Pruefung schnitt
  das LETZTE Teil-Literal einer Sprache bis zum Dateiende auf und zaehlte damit die
  Grundsprachen-Tabelle mit. Genau der Fehler, den ich Stunden vorher im Einfuege-Werkzeug
  behoben hatte. Real fehlten iOS 45–183 Schluessel je Sprache.
  **Regel: Blockgrenzen in diesen Sprachdateien IMMER zeilenweise bestimmen** (von einer
  `let`/`fun`-Kopfzeile bis zur naechsten), nie ueber Klammerzaehlung und nie ueber `split()`
  auf den Tabellennamen. Beide Abkuerzungen haben hier heute je einmal ein falsches Ergebnis
  geliefert — einmal „alles doppelt", einmal „nichts fehlt".

- **🟢 31.08. — iOS-Simulator-Runde zum Social-Feed: drei Befunde, alle behoben.**
  Jans Test nach dem Nachzug. Punkte 1, 2, 3 und 5 der Liste liefen auf Anhieb (Spot-Karte
  zoomt/tippt/zurueck, Kartenumschalter, Kacheln je Foil, Feedback-Anhaenge inkl. Anzeige in der
  PWA). Drei Sachen waren offen:

  1. **Vorschaubilder blieben leer — und zwar in BEIDEN Medien-Zeilen.** Das war der Schluessel:
     an „Neueste Medien" wurde gar nichts geaendert, der einzige Eingriff in `CommunityView` ist
     die eingehaengte `SocialFeedSection`. Also konnte es nicht am Foto-Pfad liegen.
     **Ursache: ein normaler `HStack` baut ALLE Kinder sofort.** Der Feed laedt 24 Elemente, es
     starten also 24 Bildanfragen gleichzeitig; `URLSession` laesst je Host sechs Verbindungen
     zu, der Rest steht in der Schlange — und die danach gerenderte Medien-Zeile kam nicht mehr
     dran. Jetzt `LazyHStack` mit fester Hoehe (ohne die faellt ein LazyHStack in einer
     List-Zeile auf null zusammen). **Android war nie betroffen: dort steht seit dem ersten
     Entwurf ein `LazyRow` — genau dieser Unterschied hat die Ursache verraten.**
     **Merke fuer iOS: mehrere `AsyncImage` in einem eager `HStack` hungern andere Bilder
     desselben Hosts aus. In Listen und Galerien immer `LazyHStack`/`LazyVStack`.**
  2. **Vollbild klappte beim Weiterblaettern zu und wieder auf.** `fullScreenCover(item:)`
     wechselt beim Blaettern die Identitaet des Ziels, SwiftUI blendet also aus und wieder ein.
     Jetzt `isPresented` — die Praesentation bleibt stehen, nur der Inhalt wechselt.
  3. **„Finnisch nicht im Dropdown"** war keiner: es heisst **Suomi** und steht an achter Stelle.
     Bei 17 Sprachen klappt der Picker in eine eigene Liste auf.

  **Zwei falsche Faehrten, die Zeit gekostet haben und beim naechsten Mal schneller ausscheiden
  sollten:** die Log-Zeile `nw_proxy_resolver … proxy pac Evaluation error … -1003` ist im
  Simulator ueblich, auch wenn alles laeuft. Und ein Netzproblem war es nachweislich nicht — die
  API-Antworten sind NICHT cachebar (kein `cache-control`), die Feed-Daten kamen also live ueber
  das Netz. Nur die Bilder scheiterten, und die sind als einzige mit `max-age=86400` versehen.

- **🟢 31.08. — Zwei weitere iOS-Befunde aus dem Simulator, beide behoben.**
  1. **Vollbild ging beim ERSTEN Antippen kurz auf und sofort wieder zu**, beim zweiten Mal blieb
     es. Die Praesentation hing an einer `List`-ZEILE (der Section des Feeds). Wird die Liste
     beim Antippen neu layoutet, raeumt SwiftUI den Traeger der Praesentation kurz ab — und das
     Vollbild geht mit. Der Feed-Zustand liegt jetzt in `SocialFeedModell`, das `CommunityView`
     besitzt; `fullScreenCover` haengt an der `List`.
     **Merke: Praesentations-Modifier (`sheet`, `fullScreenCover`) NIE an eine List-Zeile haengen,
     immer an die Liste oder hoeher.** Das ist die dritte Variante derselben Familie an einem Tag
     — nach dem NavigationLink in der Spot-Karte und dem Doppel-Push in den Rekord-Kacheln.
  2. **Nach einem Tab-Wechsel waren die Vorschaubilder in BEIDEN Galerien wieder weg.**
     `AsyncImage` haelt nichts fest: die Ansicht wird neu gebaut, jedes Bild neu angefordert, und
     zusammen sprengen zwei Galerien plus Avatare die sechs Verbindungen, die `URLSession` je
     Host zulaesst. Neu: **`NetzBild`** (`Sources-iOS/NetzBild.swift`) mit eigenem
     Speicher-Cache (NSCache, 300 Kacheln) — beim Zurueckkommen passiert gar keine Anfrage mehr.
     Auf der Community-Seite sind jetzt ALLE Bilder darauf umgestellt (Feed, Medien, Avatare,
     Foto-/Video-Kleinbilder).

- **📥 31.08. — Offen: `AsyncImage` in den uebrigen 13 Fundstellen.** Sessions (4), Spot-
  Beschreibungen (3), Session-Detail (3), Chat, Profil, Transfer-Auswahl, Branding. Dieselbe
  Ursache trifft dort genauso, sobald viele Bilder gleichzeitig sichtbar werden. NICHT im selben
  Zug umgestellt, weil Jan gerade ein Release einreicht und die Zweig-Formen dort abweichen —
  ein Regex-Umbau haette unbemerkt Verhalten aendern koennen. Nachziehen, sobald die Meldung
  woanders auftaucht oder nach dem Release.

- **✅ 31.08. — Drei Katalog-Meldungen aus dem iOS-Feedback bearbeitet (zwei eingetragen, eine offen).**
  Quelle: Feedback #115 (u385) und #117/#118 (u404), alle ueber die iOS-App.
  - **✅ `AlpineFoil DK 1360`** (Foil, Wunsch „Alpine dk 1360"). Werte von der Produktseite
    `alpinefoil.com/en/kitefoil-windfoil-store/hydrofoil-wings/wing-dk-1360.html`: **1950 cm²,
    Spannweite 1360 mm, Chord 180 mm, AR 9.6**, ausdruecklich fuer „Pump foiling … DockStart".
    **⚠️ FALLE: die 1360 im Namen ist die SPANNWEITE in mm, NICHT die Flaeche** — anders als bei
    AlpineFoils RSX ULTRA, wo die Zahl die Flaeche ist. Wer 1360 als Flaeche eintraegt, liegt um
    Faktor 1,4 daneben. (Die Kategorie-Uebersicht nannte AR 11, die Produktseite 9.6; 9.6 stimmt
    mit 136²/1950 ueberein, also gilt die Produktseite.)
  - **✅ `AlpineFoil HA 175`** (Stabilisator, Wunsch „AlpineFoil 175"). Quelle
    `alpinefoil.com/.../pumping-dockstart/stabiliser/`: „HA 175 - High Performance, 175 cm²,
    385 mm". Dieselbe Namensfalle wie oben: „HA 65" hat dort **62 cm²**.
  - **✅ `Levitaz Stabilizer 180`** (Wunsch „Stabilizator 180"). In der Free Series belegt.
  - **✅ `Levitaz Free Series Prototype 1200` — geklaert und eingetragen (31.08. abends).** Auf
    Nachfrage im Chat: **„1200 its prototype version"**. Deshalb steht dazu nichts bei Levitaz und
    kann auch nichts dort stehen. Eingetragen mit den Nutzerzahlen (1200 cm², Spannweite 1500 mm)
    und **„Prototype" im Modellnamen**: der Foil-Katalog ist GLOBAL (die `foils`-Tabelle hat gar
    keine `user_id`, private Foils gibt es also nicht — anders als bei `stabs`), niemand soll das
    fuer einen Serienfluegel halten.
    Aus 1500 mm und 1200 cm² ergibt sich AR **18,75** statt der genannten 18,1; Levitaz misst die
    Flaeche vermutlich anders. Gespeichert sind nur die zwei harten Zahlen, dem Nutzer gesagt.
    **Nebenbefund:** `specs_estimated` steht zwar in `foils.json` (z. B. bei Moses Medusa), wird
    von `_seed_foils` aber **gar nicht gelesen** — die Spalte bleibt auf ihrem Default. Wer
    „geschaetzt" kennzeichnen will, muss das derzeit im Namen tun.
  - Urspruenglich offen war: **`Levitaz FreeSeries 1200`** (AR 18.1, Spannweite 1500 mm laut Nutzer).
    **Gibt es so nicht:** Levitaz fuehrt in BEIDEN Serien (Free und Race) nur die Frontfluegel
    **540, 680, 790, 900** — kein 1200. Ein 1200 cm² mit AR 18 waere auch ein Race-Kitefoil-Fluegel,
    kein Free-Ride-Fluegel. **Nicht geraten** (Regel: lieber Luecke als erfunden). Rueckfrage an
    den Nutzer noetig: welches Modell genau, oder ist die 1200 vielleicht die Spannweite?
  - **🔲 Kein Katalog-Thema, sondern ein WUNSCH:** derselbe Nutzer nennt „Mast 76cm 16mm".
    **Masten fuehren wir gar nicht** (es gibt nur `foils`, `stabs`, `boards`). Levitaz bietet
    76/84/96 an. Waere eine eigene Tabelle — Jans Entscheidung.
  - **Nebenbefund:** die Marke steht bei uns in zwei Schreibweisen — `AlpineFoil` (Foils, Katalog)
    und `Alpinefoil` (Stab `HA80`, privat von u369 angelegt). Der private Eintrag bleibt
    unangetastet (fremde Eintraege NIE zusammenfuehren), aber die Suche findet so nicht beides.
  - **Weg:** eingetragen ueber `server/app/data/foils.json` bzw. `stabs.json` — der Seed liest sie
    beim Start idempotent ein. `POST /api/stabs` taugt dafuer NICHT, das legt nur PRIVATE Eintraege
    an (`user_id` gesetzt, ohne Masse), und fuer Foils gibt es gar keinen Schreib-Endpunkt.
    `stabs.json` fuehrt bewusst NUR Bezeichnungen, keine Masse — die werden nirgends verrechnet.
  - **Falle beim Bearbeiten:** `json.dump(indent=1)` passt zu `foils.json`, formatiert `stabs.json`
    aber komplett um (3032 Zeilen Diff fuer zwei Eintraege). Dort als TEXT anhaengen.

- **🟢 01.09. — EINREICHUNGS-BILANZ: alles Neue ist auf den Apps, die Baeume sind fertig.**
  Jan will nach der Zepp-Ablehnung neu einreichen und vorher alles nachziehen. Durchgegangen wurden
  ALLE Commits mit Web-/Server-Anteil seit der Android/Wear-Einreichung (26.08.):
  | Neuerung | Nachgezogen? |
  |---|---|
  | Satellitenansicht, Social-Feed, Feedback-Anhaenge, nl/fi/cs | ✅ 26.–31.08. |
  | GPS-Bereitschaft (Wear + Apple Watch) | ✅ 31.08. |
  | Synchrones Abspielen im Vergleich | ✅ 31.08. (Android + iOS) |
  | Spot-Liste startet mit „alle" | ✅ 31.08. (Android + iOS) |
  | Verlaufskarte je Lauf (`runs`) | ✅ 01.09. (Android + iOS) |
  | Foil-Baender fuer Rekorde/Bestenlisten | ✅ 01.09. (Android + iOS) |
  | Zeitachse zusammengefuehrter Sessions, Garmin-Speicherfix, Layout-Grenzen | rein serverseitig bzw. Garmin — kein App-Anteil |
  | Web-Uebersetzungen (~4900 Texte) | betraf die WEB-Locales; App-Sprachen sind vollstaendig (Pruefung unten) |
  **Gegenprobe:** auf allen vier App-Zielen ist **kein einzig benutzter Textschluessel undefiniert**
  (iOS 587, Apple Watch 74, Android 631, Wear 81 — jeweils FEHLEND=0), und die fuenf neuen
  `cr.foil*`-Schluessel stehen in allen 17 Web-Locales.
  **Baumstand fuer die Einreichung:** Phone **1.1.25**, Wear **1.2.25**, iOS/Apple **1.1.28**,
  Zepp **1.0.8** (Buildcode 11). Alle Builds gruen: `:app:` + `:wear:compileDebugKotlin`,
  `swiftc -parse` ueber ALLE iOS-Dateien, `tsc --noEmit`, Web-Build.
  **Bei Zepp fehlt weiter das runde + quadratische Vorschaubild** — der Code ist fertig, die
  Ablehnung betraf nur die Store-Bilder (s. oben).

- **✅ 01.09. — „Vergleichbare Foils" fuer Community-Rekorde UND Bestenlisten (Jans Idee, Vorschlag
  bestaetigt).** Ein Dropdown hinter Zeitraum/Sportart, Web live.
  - **Die Entscheidung stand auf Messungen, nicht auf Gefuehl** (`scripts/foil-bands-check.py`,
    rein lesend, rechnet alles vier nach):
    1. Jans Beispielbaender (900–1100, 1000–1200 cm²) lagen um Faktor zwei zu niedrig — die Flotte
       faehrt **1600–2400 cm²** (81 % der Sessions), Median **1800 cm²**.
    2. **Flaeche und AR sind unabhaengig: r = −0,12.** Innerhalb 1800–2000 cm² laeuft die AR von
       4,4 bis 20,1. Nur nach Flaeche zu gruppieren wirft also Fluegel zusammen, die nichts
       miteinander zu tun haben → beides noetig, nicht eins von beiden.
    3. **Feste AR-Baender taugen nicht:** 46 / 822 / 70 / 105 Sessions. Ein Eimer, drei Kruemel.
    4. Deshalb ist das Kernstueck **`mine` = ±15 % Flaeche UND ±2 AR** um das eigene Foil:
       317–466 Sessions aus 10–25 Varianten. Ohne die AR-Bedingung 468–761 mit AR 4,4–21,0.
       Das sind gleichzeitig die von Jan gewuenschten „ueberlappenden Baender" — pro Nutzer
       gerechnet statt aus einer Liste gewaehlt, damit niemand am Rand haengt.
  - **Server:** `FOIL_BANDS` + `_band_filter()` an EINER Stelle, `foil_band`-Parameter an
    `/records` und `/leaders`, dazu **`GET /api/community/foil-bands`** mit Session- UND Fahrerzahl
    je Band. Die Oberflaeche verdrahtet damit keine Grenzen und blendet duenne Gruppen selbst aus
    (`MIN_BAND_FAHRER = 3` — ein Rekord aus zwei Fahrern ist keiner).
    **`mine` ohne eigenes Foil liefert bewusst NICHTS** (nicht heimlich alles), und faellt dadueber
    ueber die Fahrer-Schwelle von selbst aus dem Dropdown — geprueft an vier Konten.
    Referenz-Foil: Standard-Foil aus den Einstellungen, sonst das meistgefahrene.
  - **Falle, die ich dabei zugemacht habe:** der Cache-Schluessel von `_time_rows` kannte das Band
    nicht. Heute ungefaehrlich (je Request konstant), aber genau so entstehen stille Fehler, sobald
    jemand mehrere Baender in einem Aufruf rechnet. Steht jetzt im Schluessel.
  - **Nicht bei Spots und „Am besten bewertet"** (Jans Vorgabe) — dort geht es nicht um
    Vergleichbarkeit der Ausruestung. Das gewaehlte Band steht in der Bestenlisten-Ueberschrift,
    damit niemand eine Teilmenge fuer das Ganze haelt.
  - Texte in **17 Sprachen** (`cr.foilAll/foilMine/foilUnder/foilHighAspect/foilThick`); reine
    Zahlenbereiche („1600–2000 cm²") brauchen keinen Schluessel.
  - **Sessions ohne hinterlegtes Foil (36 %) fallen aus jedem Band ausser „Alle" heraus** — mit Jan
    abgesprochen („da wo nichts hinterlegt ist koennen wir auch nichts auswerten"). Deshalb steht
    die Sessionzahl in jedem Eintrag.
  - **✅ Android und iOS nachgezogen (01.09.).** Beide holen `/api/community/foil-bands`, geben
    `foil_band` an Rekorde UND Bestenlisten weiter und nennen das Band in der
    Bestenlisten-Ueberschrift. Auswahl als `DropdownMenu` (Android) bzw. `Menu` (iOS) neben dem
    Accel-Umschalter; `bandLabel` liegt je Plattform an EINER Stelle, damit Auswahl und
    Ueberschrift nicht auseinanderlaufen. Dieselbe Schwelle `MIN_BAND_FAHRER = 3`, dieselbe
    Rueckstellung auf „Alle Foils", wenn ein Band durch einen Wechsel zu duenn wird.
    Texte in 17 Sprachen auf beiden. **Zepp bleibt aussen vor** — reiner Recorder ohne
    Community-Ansicht, dort gibt es nichts nachzuziehen.

- **✅ 31.08. — Sessions-Listen starten jetzt IMMER mit „alle" statt „nur Accel" (Jans Vorgabe).**
  Betrifft alle drei Umschalter der Liste: **Meine / je Spot / Alle** — auf Web, Android und iOS.
  - **Vorher:** `has-accel` wurde abgefragt und bei „ja" auf „nur praezise" gestellt. Fuer eine
    UEBERSICHT ist das falsch: sie verschweigt still die Sessions der Mitfahrer, deren Uhr keine
    verwertbaren Beschleunigungsdaten liefert. Genau daran ist am 29.08. ein Nutzer haengengeblieben
    („14 Sessions am Spot, nach dem Klick stehen drei da") — die automatische Umschaltung von
    heute frueh hat den Fall entschaerft, aber die Vorgabe war weiter die falsche.
  - **Rekorde/Bestenlisten bleiben unveraendert** auf „nur praezise": dort zaehlt Praezision.
    Web `Home.tsx` (= Community) nutzt weiter den smarten Default; auf den Apps haben Community-
    und Startseite ohnehin eigene Umschalter und fassen `AccelDefault` gar nicht an.
  - **Web:** `useAccelDefault(smart = true)` bekam einen Schalter; `Sessions.tsx` uebergibt `false`
    (kein `has-accel`-Aufruf mehr, `resetAuto` stellt ebenfalls auf „alle").
  - **Android/iOS:** `AccelDefault.cached`/`preferred()` liefern konstant `false`, ohne Netz-Abfrage.
    Die Form bleibt, damit die Aufrufer unveraendert sind und ein Zurueckdrehen eine Zeile ist.
    **iOS-Detail:** in `SessionsView` stand der Startwert HART auf `true` und wurde erst nachtraeglich
    aus `preferred()` gesetzt — das haette beim ersten Aufbau kurz „nur praezise" gezeigt und einmal
    umsonst geladen. Jetzt direkt `false`.
  - `Api.hasAccel` wird auf den Apps dadurch nicht mehr gerufen (bewusst stehen gelassen).
  - Geprueft: `tsc --noEmit`, `:app:compileDebugKotlin`, `swiftc -parse` — alle gruen. Web live,
    Android laeuft in 1.1.25 mit, iOS in 1.1.28.

- **✅ 31.08. ERLEDIGT — Feedback #116 (Philipp): „GPS-Glitch" in der VERLAUFS-Karte, nicht in der
  Session-Karte. UNTERSUCHT — Ursache ist das Herunterrechnen, nicht die Erkennung.**
  Belegt an seiner Session **3157** (Illmensee, 31.08. vormittags).
  - **Seine Vermutung trifft nicht zu:** beide Karten nutzen **dieselbe** Server-Spur
    (`analysis_results.track_geojson`). Nirgends steckt eine Uhr-Erkennung drin.
  - **Warum die Session-Karte sauber aussieht:** `SessionDetail.tsx` zeichnet, sobald Laeufe
    erkannt sind, **nur INNERHALB der Laeufe** (`i_start..i_end` je Segment). Bei 3157 sind das
    **355 von 2087 Punkten = 17 %**. Nachgemessen: **alle 12 Schritte ueber 30 m liegen AUSSERHALB
    jedes Laufs** — sie werden also nie gezeichnet. (Nur im Rueckfall „gar keine Laeufe" zeichnet
    sie alles, dann mit 200-m-Schwelle.)
  - **Warum die Verlaufs-Animation den Ausreisser zeigt:** `SpotProgression.tsx` zeichnet die
    **komplette** Spur, jedes aufeinanderfolgende Punktepaar, **ohne jede Lueckenschwelle**.
  - **Der eigentliche Verstaerker ist `SPOT_TRACK_MAX_PTS = 150`** in `sessions.spot_tracks`:
    2087 Punkte → **stride 14**, es wird also nur **jeder 14.** Punkt gezeichnet. Gemessen an der
    so gebauten Spur: Median-Abstand **4 m**, aber zwei Strecken von **93 m und 92 m** — und die
    liegen genau bei Original-Index 1232–1260, also dort, wo die Rohspur ihre 214-m- und
    132-m-Ausreisser hat. Zwei lange Geraden mitten im Bild sehen aus wie ein Glitch.
  - **Gegenprobe, die es bestaetigt:** seine ZWEITE Session (3158) hat nur 48 Punkte → stride 1 →
    groesster Abstand 5 m, kein Artefakt. Genau deshalb faellt es ihm nur bei der ersten auf.
  - **EMPFEHLUNG, an 25 Illmensee-Sessions durchgerechnet: JE LAUF eine eigene Linie zeichnen,
    genau wie die Session-Karte.** Dann braucht es ueberhaupt keine Schwelle.
    | Verfahren | groesste gezeichnete Strecke (Median / Maximum) |
    |---|---|
    | heute: ganze Spur, stride ueber ALLE Punkte | **52 m / 124 m** |
    | Laeufe aneinandergehaengt (mein erster Gedanke — FALSCH) | **60 m / 206 m** |
    | je Lauf eine eigene Linie, stride ueber die Lauf-Punkte | **6 m / 32 m** |
    Der Mittelweg ist schlechter als heute, weil eine Gerade das Ende von Lauf 1 mit dem Anfang
    von Lauf 2 verbindet — quer ueber den See. Erst getrennte Linien je Lauf raeumen die Klasse
    strukturell weg, nicht per Schwellenwert.
    **Nebengewinn:** die 150 Punkte reichen dann fuer die Laeufe in **volle 1-Hz-Aufloesung**
    (stride 1 in 17 von 25 Sessions), wo heute jeder 14. Punkt gezeichnet wird.
    **Noetiger Rueckfall:** Sessions ohne erkannte Laeufe (GPS-only, Detektor fand nichts) weiter
    komplett zeichnen — mit grosszuegiger Schwelle wie im Session-Detail (200 m).
    **Preis:** man sieht nicht mehr, wo man gepaddelt/getrieben hat. Fuer eine
    FORTSCHRITTS-Animation ist das richtig; heute machen die Nicht-Foil-Punkte 83 % des Bildes aus.
    Die vorher hier notierte Geschwindigkeits-Schwelle ist damit hinfaellig.
  - **UMGESETZT (31.08.), auf allen drei Clients.** Server (`spot_tracks`) liefert zusaetzlich
    `runs` = je Lauf eine eigene Linie, stride nur ueber die Lauf-Punkte. **`track` bleibt
    unveraendert daneben stehen** — draussen laufen App-Versionen (Android 1.1.23, iOS 1.1.26/27),
    die nur das kennen; ein Feldwechsel haette sie sofort kaputtgemacht. Neue Clients nehmen
    `runs`, wenn es nicht leer ist, sonst `track` mit 200-m-Schwelle (GPS-only/kein Lauf erkannt).
    Nachgemessen ueber Philipps Spot, echter Endpunkt-Aufruf mit seinem Konto:
    | Session | track (heute) | runs (neu) |
    |---|---|---|
    | s3157 | 150 Punkte, groesste Strecke **93 m** | 12 Linien, 123 Punkte, **14 m** |
    | s2984 | 148 Punkte, **66 m** | 4 Linien, 110 Punkte, **12 m** |
    | s2919 | 128 Punkte, **33 m** | 5 Linien, 106 Punkte, **5 m** |
    Web live; Android/iOS laufen in **1.1.25** bzw. **1.1.28** mit. `:app:compileDebugKotlin`
    gruen, `swiftc -parse` gruen, `tsc --noEmit` gruen.

- **✅ 31.08. — iOS-Startabsturz IM FELD BESTAETIGT, vom urspruenglichen Melder.** u149 (Jacek)
  am 31.08. um 15:27: **„New version works ok"**. Er hatte den Absturz am 30.08. gemeldet, die
  Crash-Logs herausgesucht und den entscheidenden Satz geliefert („it crashed directly after
  logging in" — der Anmeldebildschirm hat gar keine Karte, also lag es an dem, was dahinter
  aufgebaut wird). Damit ist die Kette Meldung → Diagnose → Fix → Gegenprobe geschlossen.

- **✅ 31.08. — iOS/Apple Watch 1.1.27 IST LIVE, Freigabekette abgearbeitet.** Freigabe-Mail
  („ready for distribution") gegen 19 Uhr Berlin, `appmeta.ios` UND `appmeta.apple` zusammen auf
  1.1.27, Changelog-Eintrag, Server neu gestartet.
  **⚠️ METHODEN-FEHLER, den ich dabei gemacht habe — bitte nicht wiederholen:** ich habe zuerst
  `itunes.apple.com/lookup` gefragt und daraus geschlossen, der Rollout laufe noch. **Die API ist
  stark gecacht und taugt fuer eine frische Freigabe nicht.** Ein Waechter hat 50 Minuten gepollt
  (de/us/nl/no/fi): durchweg 0 von 5 auf 1.1.27, einmal kippte us kurz um und zurueck; einzig die
  cz-Storefront zeigte 1.1.27, mit `currentVersionReleaseDate` 16:44:36Z — also VOR der Mail.
  Die **Store-SEITE** (`apps.apple.com/de/app/...` und `/us/...`) zeigte da bereits „Version
  1.1.27". **Kuenftig: Produktseite pruefen**, die lookup-API nur als Bestaetigung an den Tagen
  danach. Die Vorsicht selbst war richtig (der Play-Vorfall vom 29.07. steht im Kommentar bei
  `android`) — nur das Messinstrument war falsch.

  Urspruenglicher Eintrag: **🟡 31.08. 10:01 — iOS/Apple Watch 1.1.27 (31) EINGEREICHT.**
  Jans Meldung mit den Daten aus App Store Connect: Uebermittlungskennung
  `7cbe07de-14ec-4968-b45c-460e22e91ac3`, Uebermittlungsdatum 31. Aug. 2026 um 10:01 Uhr.
  Vorgaenger 1.1.26 war seit 30.08. 21:50 UTC live, es hing also nichts in der Warteschlange.
  **Die Pruefung aus dem 13.08.-Vorfall ist bestanden:** die Versions-Zeile in App Store Connect
  lautet „1.1.27 (31)" und ist damit zeichengleich mit der `MARKETING_VERSION` aus `project.yml`
  — damals stand dort 1.0 statt 1.1 und die Pruefung musste zurueckgezogen werden.
  **`appmeta.ios`/`appmeta.apple` stehen bewusst weiter auf 1.1.26** — `latest` wird erst gesetzt,
  wenn die Freigabe bestaetigt UND ueber `itunes.apple.com/lookup` gegengeprueft ist (nicht auf
  die Mail allein verlassen, s. der Kommentar dort). Beide Schluessel dann ZUSAMMEN hochziehen,
  die Watch-App steckt im selben Bundle.

  **Inhalt von 1.1.27:**
  - Kennzahlen und Rekorde je Foil auf der Startseite; Zeitfenster startet auf 10 Tagen und
    faellt bei leerem Fenster schrittweise zurueck
  - Satellitenansicht auf allen fuenf Karten mit einem Umschalter (Spot-Karte erst ab iOS 17,
    dort sitzt als einzige SwiftUIs `Map` statt `MKMapView`)
  - Community-Social-Feed: Hochformat-Kacheln, Vollbild mit Weiter/Zurueck, Melden, Knopf zu
    YouTube, Kanalfeld in den Einstellungen
  - Dateianhaenge im Feedback (bis drei, Bilder oder Logs)
  - **Alle 17 Sprachen vollstaendig** — vorher fielen je Sprache 45 bis 183 Texte auf Englisch
    zurueck; dazu nl/fi/cs neu auf der Apple Watch
  - Karten-Abschnitt in der Datenschutzerklaerung; `<b>`-Marken werden gefettet statt gedruckt
  - **Fehlerbehebungen aus Jans Simulator-Runde:** Spot-Karte zoomt wieder und ein Tipp auf die
    leere Flaeche oeffnet keinen Spot mehr; das Vollbild des Feeds bleibt beim ersten Antippen
    stehen; Vorschaubilder verschwinden nicht mehr beim Tab-Wechsel

- **🟡 31.08. — Android/Wear/Zepp im Baum gebumpt, WEIL die Pruefung noch laeuft.**
  Jans Stand: Phone 1.1.24 (38), Wear 1.2.24 (1034) und Zepp 1.0.7 sind seit 26.08. eingereicht
  und noch nicht freigegeben. Im Baum standen bis eben **dieselben Nummern** — inzwischen sind
  aber fuenf Tage Arbeit dazugekommen (Lauf-Erkennung, API 36, Kennzahlen je Foil, Satellit,
  Feedback-Anhaenge, Social-Feed, alle 17 Sprachen, `rec.paused` auf Wear). Ein Release-Build
  haette also unter der Nummer eines anderen Inhalts gestanden.
  **Genau das ist am 13.08. schon einmal passiert** (Apple: „der Build trug bereits 1.1.24", Jan
  musste die Pruefung zurueckziehen). Deshalb jetzt vorsorglich hoch:
  **Phone 1.1.25 (39) · Wear 1.2.25 (1035) · Zepp 1.0.8 (11).**
  `appmeta` bleibt unveraendert — dort steht weiter, was WIRKLICH im Store ist (1.1.23 / 1.2.23 /
  1.0.6). Wenn die laufende Pruefung durchgeht, wandert 1.1.24/1.2.24/1.0.7 dorthin, und die
  naechste Runde geht mit den jetzt gesetzten Nummern raus.

- **🟢 31.08. — Falscher „Speicher gleich voll"-Countdown auf der Garmin behoben (Jans Meldung vom See).**
  Jan, mitten in einer Session: „grade waren's noch zwei Minuten, jetzt noch eine, jetzt noch null,
  bis der Speicher voll ist — die Session laeuft erst seit zehn Minuten und ich kann damit
  stundenlang aufnehmen."
  **Erstens, die beruhigende Antwort: die Aufnahme laeuft weiter.** `storageMinutesLeft()` wird
  ausschliesslich fuer die Anzeige und eine einmalige Warn-Vibration benutzt; nichts bricht dadurch
  ab. Echter Speichermangel kommt aus einem fehlgeschlagenen Schreibvorgang im `Uploader` und ist
  ein anderer Pfad.
  **Zweitens die Ursache — nicht die Rechnung, das Budget.** Jans fenix 7X Pro hat keine eigene
  Messung, also griff der pauschale Sammelwert `STORAGE_BUDGET_DEFAULT_KB = 200`. Bei 25 Hz sind
  das 200 × 0,9 / 11,5 KB/min = **16 Minuten Gesamtreichweite** — nach zehn Minuten ohne
  Handy-Upload rechnet die Uhr also voellig korrekt „~2 Minuten". Der Sammelwert war als
  „vorsichtig" gedacht, ist fuer eine WARNUNG aber die falsche Richtung: zu klein heisst falscher
  Alarm auf jeder Uhr, die mehr fasst. Belegt: dieselbe Uhr hat in Session #2063 schon ~279 KB
  gepuffert, ohne je „voll" zu melden.
  **Der Fix steht schon im Uhr-Code:** „-1 = unbekannt (kein Budget) — dann zeigt die Uhr NICHTS
  an, statt eine Zahl zu erfinden". Genau das unterlief der Sammelwert. Jetzt **keine Messung ->
  keine Zahl** (`STORAGE_BUDGET_UNBEKANNT = 0`). Gewarnt wird nur noch, wo die Grenze dieser Uhr
  oder dieses Modells wirklich gemessen wurde — 8 Geraete in der Flotte, 148…431 KB.
  **Serverseitig, wirkt also sofort ohne App-Update.** Betroffen war die Anzeige seit **1.0.80**
  (27.08.), NICHT erst seit 1.0.82 — wichtig fuer jede Nutzermitteilung.
  **NACHTRAG, und das ist der wichtige Teil: serverseitig allein war es NICHT zu heilen.**
  `_applyStorageBudget` in `SessionRecorder.mc` hat nur Werte > 0 uebernommen — eine 0 vom Server
  liess den alten gecachten Wert (`storagebudget_kb` im Object Store) unangetastet stehen. Jede
  Uhr, die seit 1.0.80 einmal ein `/config` geholt hat, traegt also weiter ihre 200 KB und zeigt
  den falschen Countdown, egal was der Server jetzt sagt. Beinahe haette Jans Test genau daran
  ein „nicht behoben" ergeben.
  Jetzt raeumt eine 0 den Cache (`Storage.deleteValue`), und `storageMinutesLeft()` liefert wieder
  -1 = nichts anzeigen. **Das braucht eine neue Uhr-Fassung: Garmin auf 1.0.83 gebumpt** (1.0.82
  ist live, der Baum weicht damit ab — nicht unter der alten Nummer bauen). Per Einzelbuild auf
  fenix7xpro gegengeprueft, `watch/bin` NICHT angefasst.
  **Bis 1.0.83 im Store ist, sehen betroffene Uhren die falsche Warnung weiter.** Wer sie sofort
  los sein will, muss die Uhr-App neu installieren (das leert den Object Store).
  Offen bleibt: fuer Uhren ohne Messung wissen wir die Grenze weiterhin nicht. Das ist ehrlicher
  als eine erfundene Zahl, kostet aber die Vorwarnung. Wer sie zurueckhaben will, braucht echte
  Messungen je Modell (die kommen von selbst, sobald eine Uhr einmal volllaeuft).

- **🟢 31.08. — „Apple Watch zeichnet nicht alle Laeufe auf" untersucht: es ist NICHT die Lauf-Erkennung, sondern die GPS-Anlaufzeit.**
  Nutzermeldung im Community-Chat (Apple Watch, App 1.1.25): der erste Lauf des Tages (geschaetzt
  100–150 m) fehlte, danach „die meisten, aber nicht alle". Jans Frage war die richtige — nur auf
  der Uhr oder auch serverseitig?

  **Serverseitig fehlt nichts Grosses.** Die gemeldete Session hat 11 erkannte Laeufe, alle
  deutlich ueber den Uhr-Kriterien (9–38 s, 36–178 m, Schnitt 11,8–13,0 km/h). Nicht erkannt
  bleiben nur drei kurze Stuecke von 5–11 s und 27–55 m — unterhalb der Lauf-Kriterien, also
  Absicht.

  **Zwei Hypothesen unterwegs verworfen, beide durch Nachmessen:**
  1. *„Der Re-Arm-Cooldown der alten Uhr-Fassung verschluckt Laeufe."* Falsch: von **173 Pausen
     ueber acht Sessions liegt KEINE unter 25 s**, die kuerzeste ist 33 s. Der Cooldown hat bei
     ihm nie gegriffen.
  2. *„Der erste Lauf beginnt bei Sekunde 15."* Falsch — und das war die Index/Sekunden-Falle aus
     `docs/DATA-PIPELINE.md`, in die ich selbst getappt bin: `i_start=15` ist ein **Sample-Index**.
     Der Lauf beginnt bei **Sekunde 132**.

  **Der eigentliche Befund, konsistent ueber drei Sessions:** am Session-ANFANG liefert die Apple
  Watch fast keine Positionen.
  | Session | erster Lauf ab | Samples bis dahin | Positionsrate | Luecken danach |
  |---|---|---|---|---|
  | #3152 | 132 s | 15 | alle 8,8 s | 0 s |
  | #2906 | 161 s | 15 | alle 10,7 s | 85 s |
  | #2760 |  41 s | 10 | alle 4,1 s | 25 s |

  Ein Lauf in diesem Fenster ist **nicht rekonstruierbar** — weder auf der Uhr noch im Server.
  Dazu passt der Live-Pfad im Recorder: `poor = horizontalAccuracy > 20 || speed < 0` setzt die
  Geschwindigkeit auf 0, solange die Genauigkeit schlecht ist; die Uhr sieht in dieser Zeit also
  ohnehin keinen Lauf. Die Rohposition wird zwar mitgeschrieben, aber zu duenn zum Segmentieren.

  **Vorschlag (Jans Entscheidung, Apple-Watch-Aenderung):** die Apple Watch zeigt — anders als
  Garmin („GPS ready" / „GPS searching") — **keinen GPS-Bereitschaftshinweis**. In
  `ContentView.swift` gibt es dafuer nichts. Ein Hinweis vor dem Start („GPS noch nicht bereit")
  wuerde genau diesen Verlust verhindern, ohne an der Erkennung zu drehen.
  Nebenbefund: die Lauf-Erkennungs-Angleichung vom 30.08. (Commit 3bd27df1, 19:50) kam **nach**
  der Einreichung von 1.1.26 (18:27/18:55) — sie ist also erst in **1.1.27** und nicht die
  Erklaerung fuer diese Meldung.

- **🟡 31.08. — Garmin 1.0.83 gebaut und bereitgelegt, NICHT veroeffentlicht.**
  Inhalt: eine 0 vom Server raeumt jetzt den gecachten Puffer-Wert (`storagebudget_kb`) weg —
  ohne diese Fassung bleibt der falsche „Speicher gleich voll"-Countdown auf jeder Uhr stehen,
  die seit 1.0.80 einmal ein `/config` geholt hat.
  - Test-`.prg` fuer Jans fenix 7X Pro: gebaut mit `-r`, an Jan geschickt, Dateiname wie
    vereinbart `Pumpfoil-fenix7xpro.prg`.
  - Store-`.iq`: `/home/jan/release-staging/garmin-1.0.83/pumpfoil-1.0.83.iq`, 12,8 MB,
    **210 von 210 Geraetevarianten, BUILD SUCCESSFUL, 0 Fehler.**
  - **`watch/bin` bewusst NICHT angefasst** (Stand 30.08., alle 121 Downloads weiter 1.0.82) —
    sonst wuerde die Website eine Version anbieten, die im Store noch nicht freigegeben ist.

  **Reihenfolge fuer die Freigabe (aus [[watch-bin-is-live]], am 10.08. schon einmal falsch gemacht):**
  1. `.iq` hochladen 2. Freigabe des CIQ-Stores ABWARTEN 3. erst dann `build-all.sh`
  (das veroeffentlicht die Website-Downloads sofort) 4. dann `appmeta.garmin` + Changelog.

- **✅ 31.08. — Synchrones Abspielen ist auf Android und iOS nachgezogen** (Jans Freigabe: „das
  synchrone Abspielen funktioniert jetzt gut").
  - **Die Zeitrechnung liegt je Plattform in EINER Datei** und ist Zeile fuer Zeile dieselbe wie
    im Web: `android/.../SyncPlayback.kt` und `watch-apple/Sources-iOS/SyncPlayback.swift`,
    portiert aus `web/src/lib/syncPlayback.ts`. Alle drei tragen denselben Hinweis oben: wer eine
    aendert, aendert die anderen mit. Enthalten sind Zeitachse aus den Lauf-Ankern,
    `laufZeitraeume` (mit Auswahl), `verschmelzen` (5-s-Schwelle), Spot-Gruppierung ueber
    Zusammenhangskomponenten, `zuUhrzeit` und `uebersprungenMin`.
  - **Zwei Modell-Felder mussten dazu** (`t_start_session_ms`, `t_end_session_ms`): beide Apps
    kannten nur `t_start_ms`, und DAS ist auf den Trim verschoben — damit laesst sich keine
    Uhrzeit bilden. Beide Modelle nutzen die Codable-/kotlinx-Synthese, die Felder greifen also
    ohne weiteres Zutun.
  - **Darstellung wie im Web:** je Fahrer nur der Lauf, in dem er GERADE ist, und der nur bis zur
    aktuellen Position; in der Pause wird am Ende des letzten Laufs GEPARKT (blass, hohl) statt
    weiterzugleiten; vor dem ersten Lauf ist der Fahrer nicht da; waehrend der Wiedergabe zeichnet
    nur der Abspieler. Der Index kommt aus der Zeit INNERHALB des Laufs, damit die Uhrzeit bei
    jedem Laufbeginn neu gesetzt ist. Keine Namensschilder.
  - **Punkte auf der Karte gibt es in beiden Werkzeugkaesten nicht fertig:** osmdroid bekommt einen
    `Marker` mit selbst gemaltem Bitmap-Kreis, MapKit eine eigene `FahrerPunkt`-Annotation mit
    `UIGraphicsImageRenderer`. Beide unterscheiden gefuellt (faehrt) von hohl+blass (geparkt).
  - **Texte:** `compare.syncTitle/syncWho/syncHint/syncSkipped` in **17 Sprachen** in beide Apps
    eingesetzt (iOS zusaetzlich `sd.play`/`sd.pause`, die es dort noch nicht gab; Android hatte
    sie). Quelle sind die Web-Locales, keine Handuebersetzung.
  - **`TimeFmt.hhmmss(Date, tz)` auf iOS neu** — es gab nur `hhmm`, und beim Ziehen am Regler
    zaehlen Sekunden.
  - **Falle, die dabei zugeschlagen haette:** `swiftc -parse` prueft nur Syntax. `TimeFmt.hhmmss`
    existierte gar nicht und der Parse-Lauf war trotzdem gruen — erst der Abgleich gegen die
    Deklarationen hat es gefunden (s. Memory `swift-parse-check-limits`).
  - Geprueft: `:app:compileDebugKotlin` gruen, `swiftc -parse` ueber alle geaenderten Dateien gruen.
    Laeuft in **Phone 1.1.25** und **iOS 1.1.28** mit (beide schon gebumpt, nicht eingereicht).
  - 🔲 **Offen:** Wear OS und Apple Watch bekommen das NICHT — dort gibt es keine
    Vergleichsansicht. Zepp ebenfalls nicht.

- **✅ 31.08. — Sprachpruefung gegen die WIRKLICHKEIT (nicht nur gegen den Code): keine Luecke.**
  Bisher hatte ich nur geprueft, ob jeder im Code benutzte Schluessel in den Tabellen steht
  (0 Luecken auf allen sechs Zielen). Jetzt die andere Richtung — welche Profilsprachen haben
  echte Nutzer, und deckt die jeweilige Uhr sie ab?
  - **In Benutzung sind 12 Sprachen:** de (185 Nutzer), en (99), fr (74), cs (10), fi (6), ru (5),
    nl (4), gsw (3), it (2), es (2), nb (1), pt (1). **ja, zh, id und pl nutzt derzeit NIEMAND** —
    dass die Garmin kein CJK kann, trifft also aktuell keinen einzigen Nutzer.
  - Je Sprache gegen die Plattformen geprueft, auf denen sie vorkommt: **jede ist abgedeckt.**
    fi nur auf apple+wear (beide haben fi), ru auf apple/garmin/wear (alle drei), nl/nb/gsw/it nur
    auf garmin (alle in den 15 Spalten), Zepp-Nutzer sind de/en/fr/cs (Spalten 0/3/4/12).
  - **FALSCHER ALARM meinerseits, hier festgehalten damit es niemand nachbaut:** auf Zepp
    deklariert `LANGS` 17 Sprachen, aber **kein einziges der 56 Text-Arrays hat 17 Eintraege**
    (43 haben 15, 13 haben nur 13). Das sieht nach Fehler aus, ist aber gewollt: `t()` hat die
    Kette `row[sp] || row[3] || row[0] || k`, und nb/pl kommen aus eigenen Overlays (`NB`/`PL`).
    Fehlt eine Spalte, kommt Englisch — nie „undefined". Die kurzen Zeilen sind Absicht (der
    Kommentar an `pair.gen` sagt es sogar: Garmins Wortlaut waere fuer den 300-px-Knopf zu lang).
  - **Store-Stand selbst nachgesehen** statt darauf zu warten: iOS liefert ueber
    `itunes.apple.com/lookup` in de/us/nl/no/fi einheitlich **1.1.26** (1.1.27 also weiter in
    Pruefung, `appmeta.ios` stimmt), Garmin **1.0.83** (stimmt). **Play gibt die Version nicht
    mehr her** — Google hat sie aus der Store-Seite entfernt, Android/Wear ist also nur ueber
    Jans Meldung pruefbar.

- **🟡 31.08. — Die fenix7x-Spur loest sich auf, dahinter steckt ein PRODUKT-Thema: ein Nutzer
  bekommt seit einem Monat NICHTS zu sehen.** Braucht eine Entscheidung von Jan, nichts geaendert.
  - **Technisch ist alles in Ordnung.** Die 18 „stummen" fenix7x-Sessions haben Accel bei
    gemessenen 25,0 Hz, `detection = model`, hAcc 3–4 m, Puls, Tempo — nichts fehlt. Das Tempo ist
    nur **winzig**: 3065 m in 62 min = **Ø 3 km/h**, Spitzen 14–16 km/h. Da kommt niemand aufs
    Foil, und der Detektor hat recht, wenn er nichts findet. Der einzige Ausreisser (38 km/h in
    s2719) ist ein GPS-Burst, den die Burst-Klemme ohnehin verwirft.
  - **Es sind nur zwei Nutzer**, und einer davon faellt auf: **u156 — 21 Sessions seit 30.07.,
    NULL mit einem erkannten Lauf.** Er hat von selbst die empfindlichste Stufe gesucht und
    eingeschaltet (`foil_sensitivity = attempts`) — und auch die findet in allen 16 gerechneten
    Sessions **0 Laeufe**. Jemand nutzt die App also einen Monat lang und sie zeigt ihm nie etwas.
    (u380: 5 Sessions, 1 mit Laeufen — unauffaellig.)
  - **Seine Sportart ist nie klassifiziert worden**, `sport_class = pumpfoil` steht dort nur, weil
    es der Default ist (`sport_source = default`). 3 km/h im Schnitt mit Spitzen um 15 km/h passt
    auch auf SUP/Paddeln — oder eben auf einen Anfaenger, der noch nicht gleitet.
  - **Das ist die Frage fuer Jan, nicht fuer mich** (Ansprache von Nutzern + UX):
    1. Sollen wir jemandem nach N Sessions ohne einen einzigen Lauf etwas sagen? Aus seiner Sicht
       ist die App kaputt — er hat ja sogar an den Einstellungen gedreht. Ein Hinweis in der
       Session-Ansicht („keine Laeufe erkannt; erreichtes Hoechsttempo 14 km/h — zum Gleiten
       braucht es ~20") waere ehrlich und wuerde erklaeren statt zu schweigen.
    2. Oder ist das genau der Fall, fuer den „attempts" gedacht war, und die Stufe muesste tiefer
       greifen? Dann waere es eine Detektor-Frage — und die braucht ohnehin Jans OK.
    **Nichts an einzelne Nutzer schreiben** — falls ueberhaupt, dann als allgemeine Funktion.
  - **Zwischenbilanz der ganzen Suche:** nach Instinct 2 (Abbruch, kein Detektorproblem) und
    fenix7x (echte Nicht-Foil-Aufnahmen) ist in diesem Bestand **kein systematisches Erkennungs-
    oder Uhr-Problem mehr uebrig**, das die Zahlen stuetzen wuerden. Die „ohne Laeufe"-Quoten je
    Modell sind fast durchweg kurze Test-/Standaufnahmen.

- **🔴 31.08. — Instinct-2-Befund NACHGEMESSEN und korrigiert: es ist KEIN Erkennungsproblem,
  die Uhr bricht die Sessions ab.** Die bisherige Notiz („zeichnet NICHTS auf", „nur 15 von 39
  Sessions haben Laeufe") war irrefuehrend — die Zahl stimmt, die Deutung nicht.
  - **Fordert man echte Bewegung (> 500 m gefahren, aber NULL Laeufe erkannt), bleibt bei der
    Instinct 2 genau 1 von 34 Sessions uebrig (3 %).** Die vielen „ohne Laeufe" sind schlicht
    winzige Aufnahmen: **Median-Dauer 1,5 min, Median-Strecke 123 m** — gegen 40,5 min / 3308 m
    bei der fenix 7. Es fehlen keine Laeufe; es fehlt die Session.
  - **Der eigentliche Befund: 19 von 34 Instinct-2-Sessions (56 %) haben gar kein `ended_at`** —
    sie erreichen `/complete` also nie. Zum Vergleich: fenix 7 11 %, FR55 14 %. Die Instinct 2 X
    liegt bei 4 von 5 (80 %). Das passt zur 96-KB-Klasse und zu `docs/WATCH-STORAGE.md`, nicht zu
    einem Detektor-Thema.
  - **gps_only ist NICHT die Ursache:** 30 von 34 Instinct-2-Sessions sind gps_only, aber der FR55
    ist mit 48 von 51 genauso gps_only und kommt trotzdem auf 14 % Abbrueche und normale Laengen.
  - **Nebenbefund, der die alte Statistik erklaert:** die scheinbar katastrophalen Quoten anderer
    Modelle (epix2pro51mm 94 % „ohne Laeufe", instinct3amoled50mm 91 %, descentmk2 89 %) loesen
    sich mit demselben Filter praktisch komplett auf — das waren kurze Test-/Standaufnahmen.
    Der einzige Kandidat mit nennenswerter absoluter Zahl ist **fenix7x (006-B3907-00): 18 von 90
    Sessions ueber 500 m ohne einen einzigen Lauf, bei 11 verschiedenen Nutzern** — das ist der
    naechste lohnende Faden, nicht die Instinct.
  - **Offen:** warum bricht die Instinct 2 ab? Verdacht Speicher/Puffer auf der 96-KB-Klasse.
    Braucht einen Lauf im Simulator mit dem LITE-Build; nichts davon ist aus der DB zu klaeren.

- **✅ 31.08. ERLEDIGT (Jans OK eingeholt) — zusammengefuehrte Sessions haben wieder eine echte
  Uhrzeit-Achse. `merge.py` repariert, alle 48 Bestands-Sessions neu gebaut und analysiert.**
  **Ergebnis der Regressionspruefung gegen die Sicherung:** 42 von 48 Sessions in Foil-Strecke UND
  Laufzahl **exakt unveraendert** — es haben sich nur Zeitstempel bewegt. Sechs haben
  **dazugewonnen** (s590 3→5 Laeufe, s684 4→6, s716 10→12, s1232 20→23, s1929 5→7, s2669 12→16,
  zusammen +847 m Foil-Strecke): dort hatte die kuenstliche 20-s-Naht Laeufe zerschnitten bzw. die
  Plausibilitaetspruefung beim Zusammenfuehren sie verworfen. Pumps schwanken in 24 Sessions um
  ±1–2 (die Pump-Fenster liegen auf der verschobenen Achse). Punktzahl in KEINER Session
  veraendert — das war das Abnahmekriterium.
  **Wahrheitsprobe bestanden:** Jans Lauf #7 in s3159 liegt jetzt auf **11:06:59..11:07:49**,
  Philipps #9 in s3157 auf **11:06:58..11:07:46** — eine Sekunde, wie es sein muss. Vorher lagen
  sie 16 min auseinander.
  **Sicherung** vor dem Lauf: `tmp/merge-fix-backup-20260831-1349/` (Rohdaten 37 MB, 48 Analysen,
  153 Session-Zeilen). **Werkzeuge:** `scripts/merge-timeaxis-check.py` (rein lesend),
  `scripts/merge-timeaxis-repair.py` (Trockenlauf per Default, `--scharf` schreibt).
  **Zwei Fallen, die der Trockenlauf gefunden hat, bevor etwas geschrieben wurde:**
  1. **Verschachtelte Zusammenfuehrungen.** Wird mehrfach nacheinander zusammengefuehrt, zeigt
     `merged_into` aller Beteiligten FLACH auf das Endergebnis — die Zwischenstufen stehen also
     neben ihren eigenen Teilen in derselben Liste (s1910: Punktzahl verdreifachte sich).
     Nicht am Typ entscheiden: bei s458/s741/s1723 enthaelt die Zwischenstufe Aufnahmen, die
     sonst NIRGENDS stehen — die Typ-Regel kostete dort bis zu 2453 Punkte. Entschieden wird
     jetzt ueber die ABDECKUNG (steuert sie Zeit bei, die kein anderer Teil hat?).
  2. **Monotonie-Sicherung**: ueberlappende Teile ergaeben eine ruecklaufende Achse — dann wird
     die Session ausgelassen und gemeldet, statt still Unsinn zu schreiben. Kam nicht vor.

  Urspruenglicher Befund:
  Ausloeser war Jans Befund am synchronen Abspielen. Die Wiedergabe war unschuldig — die Daten
  luegen.
  - **`merge.py` (Z. ~240):** die Teile werden hintereinandergehaengt mit
    `off_ms += len(voriger Teil) + GAP_MS (20 s)`, und jeder Teil wird von `_trimmed` vorher **auf
    0 rebased**. Der neuen Session wird aber `started_at` des ERSTEN Teils gegeben. Damit faellt
    zweierlei aus der Achse: der **wegetrimmte Kopf jedes Teils** und die **echte Pause zwischen
    den Aufnahmen** (ersetzt durch feste 20 s).
  - **Belegt an Jans Session 3159** (Teile 3153 + 3156): Merge-ms 0 ist in Wirklichkeit 10:36:11
    (Teil A ist um 593 s getrimmt), Merge-ms 464000 ist 10:49:53 (Teil B um 44 s getrimmt).
    Der Fehler ist damit **nicht konstant**: 9,9 min in Teil A, 15,9 min in Teil B.
    Die GPS-Spur deckt 41,1 min ab, die Session laeuft aber 60,5 min.
  - **Gegenprobe, die es beweist:** Jans Lauf #7 stand angezeigt auf 10:51:08, Philipps
    Gegenstueck auf 11:06:58 — 16 min auseinander, obwohl sie nachweislich zusammen gefahren
    sind. Mit der Korrektur liegt Jans Lauf #7 auf **11:06:59..11:07:49 (213 m)** und Philipps
    auf **11:06:58..11:07:46 (180 m)** — **eine Sekunde Unterschied**. Weitere Paare danach
    ebenso: 11:22:27 gegen 11:22:24, 10:53:35 gegen 10:53:44.
    Philipps Uhr geht also richtig (seine Session ist in sich stimmig: 71,6 min GPS auf 71,9 min
    Session) — es ist Jans zusammengefuehrte Session.
  - **Reichweite:** 48 zusammengefuehrte Sessions. Groesster Trim-Kopf: Session 741 mit
    **56,6 min**. Betroffen ist alles, was aus Session-ms eine UHRZEIT macht (synchrones
    Abspielen, Laufzeiten in der Detailansicht, Wetter-Abfrage). Strecken, Tempo, Pumps sind
    relativ und bleiben richtig.
  - **Vorschlag (Jans Idee: „einfach immer die Uhrzeit der GPS-Werte nehmen"), zwei Stufen:**
    1. `merge.py`: jeden Teil an seine **echte** Stelle auf der Wanduhr setzen —
       `off_ms = (teil.started_at + teil.trim_start_ms) - first_start` statt Laenge+20 s. Dann ist
       Session-ms wieder echte verstrichene Zeit und JEDER Verbraucher stimmt automatisch.
       **Achtung, analyse-relevant:** die echten Pausen ersetzen dann die kuenstlichen 20 s —
       das aendert die Lauf-Trennung an den Naehten. Deshalb erst mit Jans OK.
    2. `track_geojson.properties.t_ms` (Zeit je Trackpunkt) mitliefern. Dann muss NIE wieder ein
       Client eine Achse rekonstruieren — genau die Rekonstruktion hat hier die Fehler der
       Rohdaten sichtbar gemacht. Das ist die eigentliche Absicherung.
    3. Die 48 Sessions neu zusammenfuehren/analysieren — Datenoperation, ebenfalls nur mit OK.
  - **Ausmass gemessen (`scripts/merge-timeaxis-check.py`, rein lesend):** 48 zusammengefuehrte
    Sessions, **46 davon mit ≥ 5 min Zeitfehler**, Median **21,9 min**, Mittel 51,6 min,
    groesster Fall **s458 mit 529,9 min** (8,8 h). Das Skript zeigt je Teil, wo Merge-ms 0 bzw.
    jede Naht angezeigt wird und wo sie wirklich liegt.
  - **Der Fix in `merge.py` ist einzeilig** — statt den Versatz aufzuaddieren, jeden Teil an seine
    echte Stelle setzen:
    ```python
    # ALT: off_ms = 0 vor der Schleife, am Ende  off_ms += int(g[-1][0]) + GAP_MS
    # NEU, in der Schleife:
    off_ms = int((s.started_at - first_start).total_seconds() * 1000) + int(s.trim_start_ms or 0)
    ```
    Sicher, weil `_mergebar` ueberlappende Teile ohnehin ablehnt (`if b.started_at < _end(a)`) —
    die Versaetze sind also immer aufsteigend und die Luecken echt.
  - **Regressions-Check dazu:** nach dem Umbau je Session pruefen, dass (a) die Merge-Spanne
    gleich `letztes Ende - erster Start` ist, (b) Strecken/Pumps/Tempo je Lauf UNVERAENDERT
    bleiben (sie sind relativ), (c) nur die Zeiten wandern. Als Wahrheitsprobe die Paarung
    3159/3157 aus dem Befund oben: Jans Lauf #7 muss danach von 10:51:08 auf **11:06:59** wandern
    und damit auf Philipps #9 (11:06:58) fallen.
  - **Offene Abwaegung fuer Jan:** mit echten Luecken faellt der kuenstliche 20-s-Abstand
    (`GAP_MS`) an der Naht weg. Ist die echte Pause kuerzer als 20 s, koennte ein Lauf die Naht
    ueberbruecken — was sachlich richtig waere, aber die Lauf-Zahl an dieser Stelle aendert.

- **✅ 31.08. — „Laeuft nicht nach Uhrzeit synchronisiert" (Jan) — NACHGEMESSEN: die Uhr stimmt,
  die Darstellung log.** Jans Beispiel: Sessions **3159 (Jan, 10:26:18)** und **3157 (Philipp,
  10:29:22)**, beide Illmensee, beide als GANZE Session im Vergleich.
  - **Was ich gemessen habe, bevor ich etwas geaendert habe:** Nullpunkt je Session
    (`started_at + Session-ms` gegen `ended_at`, 7 von 8 exakt) · die rekonstruierte Achse gegen
    die echten GPS-Zeitstempel INNERHALB der Laeufe (**0 ms Abweichung** bei fuenf von sechs
    Sessions, einmal 964 ms) · `index(Laufanfang)` gegen `i_start` (**0,0 Samples**) · und die
    komplette Wiedergabe Position fuer Position nachsimuliert: streng monotone Uhrzeit, 17 aktive
    Fenster, 56 min Spanne → 9,9 min Wiedergabe, gemeinsame Laeufe um 10:51 und 11:07.
    **Ein Zeitversatz zwischen zwei Fahrern ist im Code sogar unmoeglich** — alle bekommen
    dieselbe absolute Zeit.
  - **Die echte Ursache war die Pause zwischen den Laeufen.** Stuetzpunkte fuer Index↔Uhrzeit
    gibt es nur an den Laufgrenzen; dazwischen wurde linear interpoliert. Philipps Session hat
    2087 Trackpunkte auf 2514 GPS-Samples (kraeftige Aussetzer, im Schnitt 1734 ms je Index) —
    sein Punkt glitt dadurch gemaechlich ueber den See, waehrend er in Wirklichkeit am Steg
    stand. Das sieht genau so aus, als folge die Wiedergabe einer eigenen, falschen Zeit.
  - **Jetzt:** in der Pause wird der Fahrer am Ende seines letzten Laufs GEPARKT (blass, hohl)
    statt weiterzugleiten; vor seinem ersten Lauf ist er gar nicht da. Im Lauf kommt der Index
    aus der Zeit INNERHALB dieses Laufs statt aus der globalen Achse — damit ist die Uhrzeit,
    wie von Jan gefordert, **bei jedem Laufbeginn neu gesetzt**.
  - **Zweiter Fund dabei:** die Wiedergabe ignorierte `runIdx`. Wer im Vergleich EINZELNE Laeufe
    nebeneinanderlegt, bekam trotzdem die ganzen Sessions abgespielt — Fahrer im Bild, die im
    Vergleich gar nicht standen. `syncPlan` nimmt die Auswahl jetzt entgegen (`SyncAuswahl`);
    die Zeitachse nutzt weiter ALLE Laeufe als Stuetzpunkte, nur die Zeitleiste und das
    Gezeichnete richten sich nach der Auswahl.
  - **Namensschilder entfernt** (Jan): die Farbe reicht, die Kacheln ueber der Karte sind die Legende.

- **✅ 31.08. — Synchrones Abspielen zeichnet jetzt selbst (Jans Befund: „zeigt nur den Marker").**
  Drei Punkte, alle in `CompareMap.tsx`:
  1. **Strecke nur bis zur aktuellen Position** statt der fertigen Gesamtstrecke.
  2. **Je Fahrer nur der Lauf, in dem er GERADE ist** — der Lauf wird ueber den Sample-Index
     gesucht (`i_start <= i <= i_end`), nicht ueber die Zeit. Wer zwischen zwei Laeufen treibt,
     behaelt den Marker, hat aber keine Linie.
  3. **Waehrend der Wiedergabe zeichnet nur der Abspieler** (`spielModus`): laege die volle
     Strecke darunter, waere der wachsende Lauf darin nicht zu erkennen. Bei Position 0 und
     Pause steht wieder die normale Vergleichsansicht da.
  Die Einfaerbung (Tempo/Puls/Pump/Fahrer) ist aus dem statischen Zeichner herausgeloest
  (`bahnen.farbeAn`) und wird von BEIDEN benutzt — sonst faerbt die Wiedergabe anders als die
  Karte, die man eine Sekunde vorher angesehen hat. Auch die Lueckenregel (`MAX_DRAW_GAP_M`)
  gilt in beiden, sonst zoege die Wiedergabe ueber einen GPS-Aussetzer quer durchs Bild.
  `tsc --noEmit` sauber, Build gruen, live. **Nativ nachziehen erst nach Jans Sichtung.**

- **✅ 31.08. — GPS-Bereitschaft jetzt auf ALLEN sechs Recordern (Apple Watch + Wear OS nachgezogen).**
  Ausloeser: Carl-Henriks fehlender erster Lauf. Gemessen an seiner Session — in den ersten 132 s
  kamen **15 Positionen** (eine alle 8,8 s), also ein GPS-Kaltstart; der Lauf in diesem Fenster ist
  weder auf der Uhr noch auf dem Server zu retten.
  - **Ursache war nicht nur die fehlende Anzeige:** beide Uhren schalteten CoreLocation bzw. den
    Fused-Provider **erst mit dem Druck auf START** ein. Garmin, Zepp, iPhone und Android-Handy
    waermen den Empfaenger seit jeher schon im Ruhebild vor — nur die zwei Uhren nicht.
  - **Apple Watch** (`Recorder.swift`, `ContentView.swift`): `gpsVorwaermen()` schaltet GPS beim
    Betreten des Ruhebilds ein, `gpsBereit` wird ab einem Fix mit hAcc ≤ 20 m wahr. Positionen aus
    der Vorwaermphase landen in **keinem** Puffer (`guard isRecording` in `didUpdateLocations`) —
    sonst stuenden dort Punkte mit Zeiten vor dem Sessionstart. Zeile ueber dem Start-Knopf:
    gruen „GPS bereit" / orange „GPS suchen…".
  - **Wear OS** (`MainActivity.kt`): der bisherige Auto-Start-`DisposableEffect` lief nur bei
    aktivem Auto-Start und erst nach dem 10-s-Vorlauf. Jetzt laeuft **ein** Callback immer, macht
    beides (Bereitschaft + Auto-Start-Ueberwachung) und haengt am Ruhebild.
  - **Start bleibt in beiden Faellen moeglich** — unter Baeumen oder in der Halle kommt nie ein
    Fix, und ein gesperrter Knopf waere schlimmer als eine Aufnahme ohne die ersten Meter.
  - Texte: `gps.ready` / `gps.searching` in **17 Sprachen** auf beiden Zielen, woertlich aus
    `watch/source/Strings.mc` uebernommen (ja/zh dort nicht vorhanden — neu, die Garmin kann kein
    CJK). `:wear:compileDebugKotlin` gruen, `swiftc -parse` gruen.
  - **Versionen:** Wear laeuft in der schon gebumpten **1.2.25** mit (noch nicht eingereicht).
    Apple auf **1.1.28 (32)** gebumpt, weil 1.1.27 (31) heute frueh eingereicht wurde und in
    Pruefung ist.

- **✅ 31.08. — `LAYOUT_MIN_ON_REQUEST` == `LAYOUT_MIN_MEMORY`: kein Fehler, aber eine Falle.**
  Beide stehen seit dem 17.08. auf 512 KB. Folge: die Anforderungs-Stufe im Gate
  (`_mem >= LAYOUT_MIN_ON_REQUEST and lay == 1`) ist wirkungslos, und die Begruendung
  **`off_memory_optin` kann die Oberflaeche gar nicht mehr zeigen** — der Zweig in
  `_layout_reason` ist unerreichbar. Das Verhalten ist richtig (die 128-KB-Klasse hat den
  Renderer seit der ENG-Stufe nicht mehr im Build), nur stand nirgends, dass beide Zweige
  absichtlich leer laufen. Jetzt an beiden Stellen vermerkt, **nichts geloescht**: sobald es
  wieder eine mittlere Geraeteklasse gibt, muss nur die Konstante sinken und beides lebt auf.

- **✅ 31.08. — Spot-Karte und Spot-Liste zeigten verschiedene Mengen (Nutzerfrage vom 29.08.).**
  Meldung: „locaties Meerkerk says 14 sessions, when i click it only reveals my sessions".
  **Nachgemessen:** Spot 194 hat genau 14 Sessions — 3 mit `detection = model` (sein Handy),
  11 mit `detection = gps_only` (die eines anderen Fahrers). Die Karte zaehlt mit
  `accel_only=false`, die Liste filterte mit `true` → er sah drei von vierzehn.
  - Die vorhandene Selbstkorrektur in `Sessions.tsx` (`maybeShowAll`) griff **nur bei einer
    voellig leeren Liste**. Hier war die Liste nicht leer, nur kuerzer als das Etikett versprach —
    also griff sie nie. Jetzt vergleicht sie die erste Seite: liefert „alle" mehr Gruppen als
    „nur praezise", schaltet sie um. Weiterhin **nicht gemerkt** (`setAuto` ohne `touched`) —
    verlaesst man den Spot, gilt wieder der Default aus der eigenen Uhr.
  - Derselbe Fehlertyp wie am 20.08. bei den Namens-Gruppen (s. Docstring `spot_map`): Etikett
    und Klickziel meinten verschiedene Mengen. Web ist live.
  - **Antwort an den Nutzer ist raus** (DM, auf Niederlaendisch = seine Profilsprache), auf Jans
    ausdrueckliche Bitte hin.
  - ✅ **Android + iOS nachgezogen (31.08.).** Der Fehler steckte dort in je ZWEI Ansichten:
    `SessionsScreen.kt`/`SessionsView.swift` (Spot-Tab der Sessions-Liste) und
    `SpotSessionsScreen.kt`/`SpotSessionsView.swift` (eigene Spot-Seite). Alle vier pruefen jetzt
    „liefert `alle` mehr als `nur praezise`" statt „ist die Liste leer". `:app:compileDebugKotlin`
    gruen, `swiftc -parse` gruen. Laeuft in Phone 1.1.25 / Wear 1.2.25 / iOS 1.1.28 mit.

- **✅ 31.08. — Garmin 1.0.83 IST LIVE, Freigabekette komplett abgearbeitet.**
  Jans Meldung: Store-Seite „Latest Release August 31, 2026 · Version 1.0.83 · Size 70 KB".
  **Selbst gegengeprueft** (nicht nur gemeldet): `curl https://apps.garmin.com/apps/9a2a753e-…`
  liefert `Version":"1.0.83"`.
  Reihenfolge aus [[watch-bin-is-live]] eingehalten: 1. Freigabe bestaetigt → 2. `build-all.sh`
  (**121 von 121 Geraeten ok, 0 fehlgeschlagen**, `catalog.json` 121 Eintraege, `partmap.json`
  210 Part-Numbers) → 3. `appmeta.garmin` auf 1.0.83 → 4. Changelog-Eintrag.

- **✅ 31.08. (erledigt, s. oben) — Garmin 1.0.83 EINGEREICHT** (Jans Meldung: Test-`.prg` im Simulator geprueft,
  `.iq` hochgeladen und zur Freigabe gegeben).
  **`appmeta.garmin` bleibt auf 1.0.82 und `watch/bin` bleibt unangetastet, bis die Freigabe da
  ist** — sonst bewirbt die Website eine Version, die im Store noch nicht liegt (Fehler vom
  10.08.). Nach der Freigabe: `build-all.sh`, dann `appmeta.garmin` + Changelog.
