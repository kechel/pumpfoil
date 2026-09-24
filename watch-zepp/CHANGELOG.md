# Zepp OS changelog

This changelog covers the Zepp OS watch app only.

> **1.0.6 to 1.0.8 were reconstructed from git on 2026-09-07** — this file had been left at 1.0.5
> while three releases went out, and the release notes in `server/app/api/appmeta.py` had drifted
> into a mix of two versions because of it. The cuts are the version bumps in `app.json`: 1.0.6 in
> `3ff50081` (18 Aug), 1.0.7 in `bedb67dc` (26 Aug, 20:15), 1.0.8 in `08b69443` (31 Aug). One
> commit sits on the fence: `b07ae4e1` (distance unit, 26 Aug 22:41) landed after the 1.0.7 bump
> and possibly after the upload — it is listed under 1.0.7. **Keep this file current with every
> bump**, then nobody has to dig through commits again.

## 1.0.12 — gebaut am 21.09.2026, NOCH NICHT eingereicht

**Der Bildschirm bleibt waehrend der Aufnahme wach.** Das ist der wichtige Punkt dieser Fassung.
Beim Start setzt die App die Bildschirmzeit auf den Zepp-Hoechstwert (~24 Tage) — aber nur EINMAL,
und Zepp verliert oder kappt diesen Wert nach einer Weile still. Der Leerlauf-Pfad frischt ihn
seit dem T-Rex-3-Feldtest alle 20 Sekunden nach; der Aufnahme-Pfad hat dieselbe Behandlung nie
bekommen, weil `heartbeat()` bei laufender Aufnahme in der ersten Zeile ausgestiegen ist. Dann
geht der Bildschirm aus und Zepp raeumt die App rund zehn Sekunden spaeter weg. Gemeldet von
u352 (GTR 4): „Nach circa 4,5 Minuten kommt dann das Ziffernblatt und anschliessend, wenn ich die
App wieder reinwill, ist sie beendet."
**Was es NICHT loest:** die System-Tastensperre der Uhr. Die schaltet den Bildschirm selbst ab,
und dagegen kommt eine Mini-App nicht an — das ist ein eigener Fall (s. `docs/TODO.md`).

**Die Absturzmeldung haelt jetzt durch, bis sie angekommen ist.** Im Emulator-Testlauf vom
23.09. fiel auf, dass sie genau dann verlorenging, wenn sie am wichtigsten ist: der Merker wurde
beim LESEN geloescht, also bevor der Server ihn hatte. Scheitert die Meldung danach — auf dieser
Plattform der Normalfall, weil das Handy nicht in Reichweite ist —, lebte die Auskunft nur noch
im Arbeitsspeicher, und der naechste App-Start ueberschrieb sie mit seiner eigenen. Gemessen:
Abbruch mitten in der Aufnahme, Neustart ohne Handy-Verbindung, und gemeldet wurde am Ende
„Leerlauf" statt „Aufnahme". Jetzt bleibt die Meldung liegen, bis der Server geantwortet hat, und
ueberlebt dabei auch ein sauberes Beenden. Faellt ein zweiter Abbruch an, bevor der erste
gemeldet ist, gewinnt der erste — er hat die Kette angefangen.

**Und der Speicherstand vom Abbruch kommt jetzt wirklich mit.** Derselbe Programmteil loeschte
ihn eine Zeile zu frueh, sodass immer der aktuelle Wert gemeldet wurde statt des Werts von
damals. Damit war die einzige Frage, fuer die gemessen wird — wie nah stand die App am Limit —
gar nicht zu beantworten.

**Die App meldet jetzt, wenn sie nicht sauber beendet wurde.** Garmin tut das seit Wochen, die
Amazfit-App hatte so etwas nie — deshalb stand in unseren Daten `crash_count = 0`, auch bei einem
Nutzer, dessen Uhr sich waehrend eines Uploads dreimal neu gestartet hat (gemeldet per Mail,
22.09.). Wir waren also genau bei dem Fehlerbild blind, das auf dieser Plattform am haeufigsten
auftritt. Die Meldung ist rein diagnostisch und schaltet nichts ab; sie sagt nur, in welcher Phase
es passiert ist (Start, Leerlauf, Aufnahme, Upload).

**Die Uhr verliert viel weniger GPS-Punkte.** Bisher fragte die App einmal pro Sekunde nach der
Position und verwarf alles, was der Sensor in genau diesem Augenblick nicht als gueltig meldete.
Nachgemessen an neun Aufnahmen ueber fuenf Minuten, ueber fuenf Uhrenmodelle hinweg: dabei gingen
**48 bis 87 Prozent der Aufnahmezeit** verloren — die Ortung lieferte im Mittel nur vier Sekunden
am Stueck, dann zwanzig Sekunden nichts. Andere Uhren liefern in derselben Zeit das Vierfache.
Jetzt meldet der Sensor seine Position selbst, sobald er eine hat, und die App merkt sie sich
kurz. Eine echte Funkluecke bleibt weiterhin eine Luecke — erfunden wird nichts.

**Und sie misst dabei ihren eigenen Speicherverbrauch.** Ein Nutzer berichtete, seine Uhr habe
sich waehrend eines Uploads dreimal neu gestartet — ob die App dabei am Speicherlimit stand oder
aus einem ganz anderen Grund starb, konnten wir nicht sagen, weil wir keine einzige Zahl dazu
hatten. Jetzt meldet die Uhr ihren Hoechststand mit; auf Geraeten, die das nicht koennen (aeltere
Zepp-OS-Fassungen), bleibt es wie bisher.

**„Code erzeugen" sagt jetzt, wenn es nicht geklappt hat — und woran es lag.** Vorher passierte
auf den Knopf gar nichts: der Fehler lief ins Leere, und auf dem Bildschirm stand weiter
„pumpfoil.org → eingeben", als waere alles in Ordnung. Das ist der ERSTE Bildschirm, den ein
neuer Nutzer sieht; wer dort drueckt und nichts passiert, haelt die App fuer kaputt. Jetzt steht
dort entweder „Kein Telefon" oder „Server nicht erreichbar" — zwei Ursachen, gegen die man
Verschiedenes tun kann. Der zweite Fall war bisher voellig unsichtbar: die Uhr prueft die
Bluetooth-Kopplung, nicht den Weg ins Netz dahinter; steht die Kopplung und das Handy hat kein
Internet, meldete sie „verbunden" und schwieg. Dazu wartet der Knopf jetzt hoechstens 12 Sekunden
auf eine Antwort. Vorher wartete er UNBEGRENZT: die Uhren-Seite des Zepp-Bausatzes kennt gar
keine Zeitgrenze, und wenn die Handy-Seite nicht antwortet, kommt schlicht nie etwas zurueck —
weder Erfolg noch Fehler. Jede Meldung, die daran haengt, war damit unerreichbar.

**Die eigenen Bildschirme sind jetzt auch ohne Handy da.** Bisher kamen nach jedem App-Start die
Standard-Seiten, bis eine Verbindung zustande kam — am Wasser also fast immer, denn das Handy
liegt im Auto. Aufgezeichnet wurde trotzdem alles, es sah nur aus wie eine fremde App. Jetzt
merkt sich die Uhr das ganze Profil: eigene Seiten, Ansichten, Foils, Alarmschwellen, Puls- und
Geschwindigkeitszonen. Die Sprache konnte sie das schon, der Rest fehlte. Garmin, Wear OS und
Apple Watch machen es laengst so.

**Aufnahme pausieren — und das Bisherige geht schon hoch.** Auf dem Stopp-Bildschirm haelt ein
kurzer Druck die Aufnahme an, ein weiterer setzt sie fort; das Halten beendet sie wie bisher. In
der Pause schickt die Uhr, was sie hat, und auf dem Handy sind die Laeufe bis dahin schon zu
sehen. Die Pausen fehlen in der Fahrzeit und stehen trotzdem in der Auswertung. Garmin kann das
seit Laengerem.

**Eine Aufnahme laesst sich verwerfen, ohne sie zu speichern.** Ganz links und ganz rechts, hinter
dem Stopp-Bildschirm. Der erste Tipper fragt nach, der zweite verwirft — ein Tipper allein
loescht nichts.

**Die Touch-Sperre schnappt nicht mehr zu, waehrend man blaettert.** Sie zaehlt jetzt bei jeder
Wischbewegung von vorn.

**Die Uhr vibriert an den Strecken- und Zeitmarken aus dem Profil.**

**Ein ausgegrauter Start-Knopf sagt jetzt, warum.** Wartet auf GPS, oder ein Upload laeuft noch.
Vorher passierte auf Antippen gar nichts, was sich wie eine kaputte App liest.

**Die Datenseiten zeigen die Laufzeit der Aufnahme.** Sie blenden den Stop-Knopf absichtlich aus
und sahen ohne laufende Uhr genauso aus wie der Startbildschirm — ein Fahrer hielt die App fuer
verloren, waehrend sie in Wirklichkeit aufnahm.

## 1.0.11 — 2026-09-21 (freigegeben)

**1.0.9 und 1.0.10 kamen nie beim Nutzer an** — dreimal in Folge scheiterte die Einreichung an
den Store-Vorschaubildern. 1.0.10 wurde am 19.09. zurueckgezogen und mit korrigierten Bildern als
1.0.11 neu eingereicht; freigegeben am 21.09., nach zwei Tagen.

**Diese Fassung traegt die beiden Fehler, an denen die Amazfit-Uhren praktisch unbrauchbar
waren:** ein Tastendruck beendete die laufende Aufnahme, und lange Uploads starben an „Out of
Memory", weil die ganze Aufnahme beim Senden im Speicher lag (gemeldet bei Block 108 von 2341).

**Dazu:** Puls-Alarm, unterscheidbare Alarmmuster, Sparmodus/GPS-only, die sichtbare Tastensperre,
das Foil auf dem Startbildschirm, Alarm-Schwellen unabhaengig vom Foil, und fehlende
Chunk-Startzeiten werden fortgeschrieben statt neu gerechnet.

**Ein Beinahe-Unfall, der hier stehen bleiben soll:** 1.0.11 war schon einmal eingereicht und
musste zurueckgezogen werden, weil `DEV_FAKE_GPS` auf `true` stand. Seitdem kann der Build den
Schalter nicht mehr mitnehmen (`8429b139`), und `npm run dev` raeumt ihn beim Beenden weg.

## 1.0.10 — 2026-09-13

**1.0.9 wurde nie ausgeliefert.** Sie lag beim Zepp-Store im Review, als Cesar (GitHub #4,
mesarpe) meldete, dass der Upload bei ihm weiterhin mit „Out of Memory" abbricht — bei Block
**108 von 2341**. Jan hat 1.0.9 deshalb zurueckgezogen; ihr gesamter Inhalt geht mit 1.0.10 raus
(siehe den Abschnitt darunter), plus die drei Punkte hier.

**Ein abgebrochener Upload macht jetzt dort weiter, wo er stehen geblieben ist.** Das ist der
wichtigere der beiden Punkte. Bis hierher begann JEDER Versuch wieder bei Block 0 — zehn
Neustarts haetten zehnmal dieselben 108 Bloecke geschickt und waeren nie weitergekommen. Cesar
hatte genau das im Ticket beschrieben („the transfer seemed to restart from zero despite partial
completion"), wir hatten es nur nicht gelesen.

Die Uhr merkt sich jetzt je Session, wie viele GPS- und Accel-Bloecke der Server bestaetigt hat,
und setzt dort auf. Verfahren von der Garmin-Uhr uebernommen (`_sa`/`_sg` in `Uploader.mc`),
GETRENNT nach Art — die Zepp-Uhr nummeriert beide Arten ab 0, das Feld `received_chunks` des
Servers waere hier also mehrdeutig (Wear und Apple Watch duerfen es benutzen, die fuehren EINEN
Zaehler ueber beide Arten). Der Stand steht unter einem eigenen, winzigen Schluessel und nicht im
`pending`-Block: den anzufassen hiesse, ihn zu parsen und neu zu schreiben, mitten im Upload.

Durchgerechnet mit Cesars Zahlen: selbst wenn die Uhr weiterhin alle 108 Bloecke stirbt, sind
seine 2339 Bloecke nach 24 Versuchen vollstaendig oben, ohne eine einzige Luecke.

**Der Upload gibt Speicher frei, waehrend er laeuft.** Bisher hielt er die ganze Aufnahme bis zum
Schluss. `flushPending()` parst die komplette Warteschlange per `JSON.parse` in den Speicher —
bei zwei Stunden Aufnahme sind das rund 7200 GPS-Punkte und damit gut 1,2 MB, die liegen, BEVOR
der erste Block rausgeht. Cesar stirbt bei Block 108, also nicht am Parsen selbst, sondern kurz
danach: der Muell der ersten hundert Requests gibt den Rest. Gesendete Punkte werden jetzt sofort
freigegeben, der Verbrauch sinkt also waehrend des Uploads, statt zu stehen. Ungefaehrlich, weil
`list` nur eine Parse-Kopie ist — der persistente Stand wird erst bei `removePending` angefasst,
und ein abgebrochener Upload liest beim naechsten Versuch frisch.

**Die Bloecke haengen nicht mehr als Promise-Kette aneinander.** `sendGpsChunk` gab die Promise
des naechsten Blocks zurueck, womit Ebene 0 offen blieb, bis die letzte fertig war. Gemessen sind
das rund 225 Byte je Ebene — bei 108 Ebenen also keine 25 KB und damit NICHT die Ursache, wie
zwischendurch vermutet. Die Schleife bleibt trotzdem: sie ist sparsamer, der Aufrufstapel waechst
nicht mit, und Fehler werden weiter sauber durchgereicht.

**Der Fortschritt wird nur noch bei jedem Prozentsprung neu gezeichnet.** Vorher lief bei jedem
Block ein voller Bildaufbau: 2341 Neuzeichnungen fuer 100 sichtbare Zustaende. Das kostete
Rechenzeit, die dem Aufraeumen fehlte.

**Die GPS-Spur liegt jetzt in einer Datei, nicht mehr im Speicher.** Das war der eigentliche
Grund fuer den Speichermangel. `persistActive()` schrieb bei jedem zehnten Punkt die KOMPLETTE
Aufnahme neu als JSON weg — nach zwei Stunden 287 KB, alle zehn Sekunden, zusammen ueber 100 MB
in den Flash; und beim Upload parste `flushPending()` denselben Klotz als Objektgraph zurueck,
gut 1,2 MB, bevor der erste Block rausging.

Jetzt haengt die Spur wie die Beschleunigungsdaten als feste Saetze an einer Binaerdatei (18 Byte
je Punkt: t_ms, lat, lon, Geschwindigkeit, Puls, Genauigkeit) und wird blockweise zurueckgelesen.
Zwei Stunden sind damit 45 KB Datei statt 287 KB JSON alle zehn Sekunden, und im Speicher liegt
immer nur EIN Block. Wear und Apple machen es seit jeher so (je Block eine Datei) und hatten das
Problem deshalb nie.

Die hochgeladenen Zahlen aendern sich dadurch NICHT: die Rundungen sind dieselben wie bisher beim
Erzeugen des Punktes. Nachgerechnet mit Randwerten (Suedhalbkugel, Westlaenge, beide negativ,
327 km/h, Datumsgrenze) und ueber 2543 Punkte blockweise — Byte fuer Byte dasselbe JSON.

**Beide Dateien werden nur zum Schreiben geoeffnet und sofort wieder geschlossen.** Zepp OS
vertraegt offenbar keine zweite gleichzeitig offene Datei — belegt im Emulator am 13.09.2026 in
zwei Stufen: zuerst hielt die neue GPS-Datei dauerhaft offen, und dann schrieb JEDE Aufnahme
genau einen Block, bei GPS wie beim Accelerometer (drei Sessions in Folge exakt 10 Punkte und
exakt 128 Samples, waehrend dieselbe Fassung ohne GPS-Datei 27 Punkte ueber drei Bloecke
schrieb). Nach dem Umbau der GPS-Seite lief diese sauber durch — 65 Bloecke, 650 Punkte, keine
Luecke —, der Accelerometer aber schrieb weiter nur seinen ersten Block: 7,5 Sekunden in einer
Aufnahme von 13 Minuten. Die Reihenfolge passt genau, Accel schreibt zuerst (nach 7,5 s), GPS
zum ersten Mal nach 12,6 s, und ab da war Schluss.

Jetzt oeffnen beide nur fuer den einzelnen Schreibvorgang und schreiben an einer
AUSDRUECKLICHEN Position, statt auf einen Dateizeiger zu vertrauen. Damit ist nie mehr als eine
Datei gleichzeitig offen. Der Accelerometer hatte seine Datei jahrelang dauerhaft offen, und das
ging gut — solange es die einzige war.

**Eine wiederhergestellte Aufnahme behaelt ihre genaue Zeitachse.** Der Server baut die
Accel-Zeitachse aus den Startzeiten der einzelnen Bloecke — das ist die belastbare Variante; die
Ersatzvariante (eine mittlere Rate ueber alles) lag am 10.08. schon einmal 124 Sekunden daneben.
Nach einem Absturz fehlen die letzten ein, zwei Startzeiten, weil die Kopfdaten nur alle zehn
GPS-Punkte geschrieben werden. Sie wurden bisher aus der mittleren Rate ab Null nachgerechnet —
und landeten damit HINTER dem letzten echten Wert. Ein einziger Rueckschritt genuegt, und der
Server verwirft die exakte Achse komplett.

Belegt an einer 17-Minuten-Session: genau der letzte von 142 Eintraegen fehlte, gemessen
1 010 254 ms, aus der Formel 1 002 667 ms — 7,6 Sekunden rueckwaerts. Jetzt wird der letzte
bekannte Wert fortgeschrieben statt neu gerechnet.

**Aufnahmen von vor 1.0.10 gehen weiter hoch.** Wer eine haengende Session in der Warteschlange
hat — Cesar zum Beispiel — traegt sie dort noch als Array. Der alte Weg bleibt deshalb erhalten,
und `recoverActive` versteht beide Formate. Faellt das Anlegen der Datei aus, zeichnet die Uhr
wie vorher in den Speicher auf, statt gar nicht aufzuzeichnen.

Die Laenge der Aufnahme steht nach einem Absturz im letzten Satz der Datei und nicht mehr in den
Kopfdaten — die werden nur alle zehn Punkte geschrieben, das Ende laege sonst bis zu neun
Sekunden zu frueh.

## 1.0.9 — 2026-09-13

**Die Aufnahme überlebt jetzt einen Tastendruck.** Bis hierher konnte ein einziger Druck auf die
Taste — oder eine Wischgeste, die wir nicht kannten — die App beenden und die laufende Aufnahme
mitnehmen.

Die Ursache lag an drei Stellen im selben Muster: unser Tasten- und Gesten-Callback gab `false`
zurück, wenn es mit einer Eingabe nichts anzufangen wusste. Bei Zepp heisst `false` aber nicht
„nichts tun", sondern „das System soll es behandeln" — und das System schliesst die App. Während
einer Aufnahme wird deshalb ab jetzt JEDE Eingabe konsumiert; das gilt auch für den Fehlerfall im
Callback, der vorher ebenfalls auf `false` fiel.

Gemeldet von einem Nutzer mit einer **Amazfit Active 2 (Round)** am 13.09.2026: „if a button is
pressed it exits the app straight away. Accidental presses are quite easy." Diese Uhr hat genau
eine Taste, deren Code keiner unserer vier Konstanten entspricht — damit fiel jeder Druck in den
`return false`-Zweig.

Das passt auf den Bestand: von 21 Amazfit-Aufnahmen waren nur 4 brauchbar, bei den übrigen kamen
eine Handvoll Datenpakete an und dann nichts mehr. Derselbe Melder hatte sechs Fehlversuche.

**Und ein Tastendruck zeigt jetzt den Stopp-Bildschirm**, statt sichtbar nichts zu tun. So
verhalten sich die eingebauten Zepp-Aktivitäten auch: der Druck beendet nichts, er macht nur
sichtbar, wo das Beenden liegt. Bleibt er unbeantwortet, kommt nach **fünf Sekunden** von selbst
die Seite zurück, die vorher zu sehen war — ein Fehlgriff ist damit spurlos weg, statt den Rest
der Fahrt stehen zu bleiben. Wer in der Zeit selbst weiterblättert, behält die Kontrolle: dann
springt nichts mehr zurück. Vorgeschlagen vom selben Melder.

Beendet wird eine Aufnahme weiterhin über langes SELECT (oder kurzes, wenn im Profil so
eingestellt) und über den Stopp-Bildschirm.

**Aufgeräumt:** auf den Datenseiten steht nicht mehr „Halten = STOPP" in der Statuszeile. Der
Hinweis stand dort auf jeder Seite, obwohl er sich nie ändert; jetzt zeigt die Zeile nur noch den
GPS-Zustand und ob gerade ein Lauf läuft. Auf dem Stopp-Bildschirm bleibt er.

## 1.0.8 — 2026-08-31

Built and version-bumped; goes to the store right after 1.0.7 clears review.

### Colours and zones

- Take speed zones from the profile, the same way heart-rate zones already work. There used to be
  three different scales for the same thing: the number on the watch had hard-wired steps
  (12/16/20 km/h) with no derivation, while the value graphic already used the profile.

### Controls

- Honour the profile setting for stopping a recording, so a single press works instead of a long
  press. Prompted by a rider whose watch has "man overboard" on the long press, which made our menu
  unreachable. Default stays "hold".

### Run detection

- Match the server's run detection: the 25-second re-arm cooldown no longer blocks blindly after a
  short drop in speed. Verified against a rider's photo series — a simulation of the watch logic on
  her real GPS data lands within one to two metres of the photos.
- Merge two runs only when the resulting distance is plausible. A session with sentinel speeds
  (three points at 20,037,500 m/s) had produced "last run 14,709.6 m in 0:42".

### Languages

- Dutch, Finnish and Czech. They existed as columns before but were left empty in 37 cells.
- Polish, as an overlay rather than a 17th column.

## 1.0.7 — 2026-08-26

Submitted 26 August, rejected 1 September **for the store preview images only** (nothing about the
app), images replaced and resubmitted the same day. Everything below therefore reaches users with
this round, not the previous one.

### Value graphics on the watch

- Draw the two new layout elements: edge graphic and bar, filled on the field's own scale, colour
  optionally by zone. A ring segment on round watches, a frame segment on square ones — decided
  from the device's real display shape, not from the layout.
- Draw them on Canvas instead of the previous approach, after the round/square shapes turned out
  to be unreliable otherwise.
- Pass heart-rate zones and the speed scale through the phone side at all: both were missing from
  its whitelist, so the watch never received them. That is why the on-foil layout (the one with the
  graphics) stayed blank on a Balance 2 while the off-foil layout drew fine.
- Say in the log why the self-healing step kicked in, instead of just doing it.

### Controls

- Let a finger reopen the touch lock. It used to hand control back only through the hardware
  buttons — in the simulator there are none, and with thick gloves on real hardware it is the same
  trap.

### Numbers that users compare with the website

- Clean up the top speed. Measured against the server on 119 real sessions, the watch maximum was
  on average 9.4 km/h too high and in the worst case 164 km/h (one session showed 103 km/h where
  15.0 was analysed).
- Merge runs that never really stopped, instead of counting them twice.
- Put the distance unit in the label instead of into the value, like Garmin, Wear OS and iOS
  already do — "90 m" above its own label read as a contradiction.

## 1.0.6 — 2026-08-18

Approved 24 August, live in the Zepp App Store.

### Square watches

- Lay out around the system bar that Zepp OS draws on square devices, and switch it off where the
  API allows it (`setStatusBarVisible(false)`, square only — on round watches the call throws).
  That bar is 64 px tall, opaque, and filled with `appName` from `app.json`: it hid our own title,
  clipped the version line and cost a seventh of the screen.
- Title in brand cyan, test text and emoji removed.

### Round watches

- Fix the page indicator: "1/4" sat outside the visible circle and was cut diagonally, showing as
  "1/". Measured in the raw image (light pixels to device x 407, circle ends at 391) and the indent
  recomputed for three text heights.

### Update hint

- Compare store versions digit by digit instead of with `!==`. Any difference used to trigger the
  hint, including an older store version — a development build ahead of the store recommended a
  downgrade. Garmin, Wear OS and Apple Watch had compared numerically all along; only Zepp did not.

### Settings and data

- Make the touch lock configurable.
- Data field 21: maximum heart rate of the last run. The session maximum existed already; per run
  is new.
- Rename the app from "zepp" to "pumpfoil".

## 1.0.5 — 2026-08-16

### Recording reliability

- Keep the app awake for up to five minutes while idle, pairing, or browsing screens.
- Keep the app awake for the full duration of an active recording and restore the normal timeout afterward.
- Preserve and recover an interrupted active recording through Zepp OS wake-up relaunch support.
- Block session start until a valid GPS fix is available.
- Show a dimmed start button while waiting for GPS and turn it green when GPS is ready.
- Signal GPS readiness with vibration and, when enabled by the watch settings, a short buzzer sound.

### Physical controls and water protection

- Use UP and DOWN to navigate backward and forward through screens.
- Use SELECT to start a recording from the main screen.
- Lock the touchscreen automatically during recording to prevent water-triggered actions.
- Show a lock indicator when a blocked touch or short button press is detected.
- Temporarily unlock touch for ten seconds with a long press on UP or DOWN.
- Stop and save with a long press on SELECT.
- Consume BACK while recording so an accidental press cannot exit the app and lose the session.

### Sensor and session data

- Request the correct Zepp OS heart-rate permission.
- Read continuous heart-rate values through the supported sensor callback and include them in session statistics and GPS samples.
- Record raw three-axis acceleration through the official Zepp OS accelerometer API while a session is active.
- Convert Zepp's cm/s² values to the shared signed int16 format with 2048 units per g.
- Measure and report the effective accelerometer callback rate for each session instead of assuming a fixed frequency.
- Derive speed from consecutive GPS coordinates because Zepp OS Geolocation does not expose the previously assumed speed method.
- Reject implausible derived speeds (position jumps) so a single bad fix can no longer inflate the
  live speed, the session maximum, the distance, the alarm or run detection. Uploaded samples are
  unchanged — the gate only affects what the watch shows and decides.
- Restore run detection and the last-run time and distance values using the computed speed.
- Add diagnostic logs for heart-rate activation and detected run starts and ends.
- Report the watch model (`getDeviceInfo`) when pairing and on every config call, so support
  requests can be tied to an actual device instead of a generic "Amazfit".

### Upload stability

- Persist acceleration progressively to a binary file instead of retaining a full session in JavaScript memory or LocalStorage.
- Upload 128-sample acceleration blocks sequentially as `int16-b64` with per-block timestamps.
- Retain the binary file across interrupted uploads or app restarts and delete it only after confirmed completion.
- Ensure only one pending-session upload worker can run at a time.
- Upload sessions and GPS chunks sequentially to prevent duplicate concurrent transfers and erratic progress values.
- Create GPS chunks on demand instead of retaining every chunk in memory.
- Keep the app awake for the entire upload and resume the normal idle timeout afterward.
- Pause background configuration requests while an upload owns the BLE request queue.
- Add upload lifecycle diagnostics.

### Interface and localization

- Increase font sizes throughout the watch app and settings page.
- Reposition fields, labels, status text, page numbers, buttons, and settings controls for round and square displays.
- Improve the T-Rex 3 round-screen layout so enlarged text remains inside the safe display area.
- Normalize stored and server-provided language codes, including BCP-47 variants, Norwegian variants, and Swiss/Austrian German variants.
- Preserve the selected profile language across launches so the watch UI also uses it offline.

### Platform metadata

- Update the Zepp app version from 1.0.4 to 1.0.5 (build code 8).
- Target Zepp OS API 4.0 while retaining compatibility with API 3.0.
