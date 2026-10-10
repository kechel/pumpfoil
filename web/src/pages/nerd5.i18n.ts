// Inhalte für die Nerd-Analysen Teil 5 (die neue On-Foil-Erkennung).
//
// Geschrieben auf Englisch (Jan, 30.09.2026: „erstmal nur in einer sprache"), am selben Tag in alle
// 18 Sprachen übersetzt (Jan: „und dann den artikel in alle sprachen uebersetzen"). Englisch bleibt
// der Rückfall. Die Stufen der Empfindlichkeit tragen je Sprache die Namen aus dem Profil (foilsens.*).
// Rich-Markup in den Strings: **fett**, `code`, *kursiv*, [label](/pfad).
// Keine geraden Anführungszeichen (") in Strings — nur typografische.
//
// INHALTSREGELN: keine Namen und keine Session-Nummern anderer Fahrer (öffentliche Seite); die
// Wahrheiten sind die eigenen (Handy am Brett, Kartenprüfung, von Fahrern aussortierte Bereiche,
// Gehen/Auto) — s. Messaging-Regel der Nerd-Seiten. Zahlen aus docs/DETECTION-V3.md (30.09.2026).
import type { Lang } from "../i18n";

export interface N5 {
  back: string;
  h1: string;
  subtitle: string;
  intro: string;
  problem: { h: string; p: string; li: string[] };
  truth: { h: string; p: string; li: string[]; p2: string };
  features: { h: string; p: string; li: string[] };
  honest: { h: string; p: string; p2: string; cap: string };
  pipeline: { h: string; p: string; li: string[]; p2: string };
  watch: { h: string; p: string; cap1: string; p2: string; cap2: string; p3: string };
  result: { h: string; p: string; cap: string; li: string[] };
  failed: { h: string; p: string; li: string[] };
  status: { h: string; p: string; li: string[]; p2: string; li2: string[] };
  help: { h: string; p: string; li: string[]; p2: string };
}

const en: N5 = {
  back: "← Part 4: A phone taped to the board",
  h1: "Part 5: Detection model",
  subtitle: "A new on-foil detection, built from everything riders have told us — and where it still needs you",
  intro:
    "Everything this site counts — runs, foiling time, distance, pumps, records — starts with one decision per second: **is this person on the foil right now?** Get that wrong and every number after it is wrong too. The detection that runs today works well for most sessions, but over the last weeks riders showed us exactly where it breaks. This part is the story of rebuilding that decision from scratch, measured against every piece of truth we have, and it ends with a request: we need more sessions recorded with a watch on the wrist **and** a phone on the board at the same time.",

  problem: {
    h: "Where the old detection goes wrong",
    p:
      "The current detection combines speed limits (a run starts above one speed and ends below another) with a trained model that looks at the wrist movement. Three kinds of mistakes kept coming up:",
    li: [
      "**Runs on land.** A few seconds of brisk walking along the shore, carrying the board back to the jetty, a jog to the car — at the right speed with the arm swinging, that can pass as a run. One loop around a parking lot at 30 km/h even ended up in the speed records.",
      "**Runs next to a car drive.** Forget to stop the recording, drive home, and the first seconds of the drive can look like a run.",
      "**Slow pumpers cut short.** One rider who pumps slowly and steadily told us his runs were missing almost half. He was right: he keeps pumping at 5–10 km/h after the point where the old speed limit ends the run.",
    ],
  },

  truth: {
    h: "What we can check against",
    p:
      "A detection is only as good as what you measure it against, and the tempting shortcut — measuring the new detection against the old one — only teaches you to copy the old mistakes. So we collected every independent piece of truth we could find:",
    li: [
      "**The phone on the board** ([Part 4](/nerd-analysen-4)). Recorded at the same time as a watch on the wrist, it says second by second whether the board was being pumped — no guessing from the arm. Six rides qualify so far, two riders, about 2.5 hours.",
      "**Runs checked on the map.** Every run that lies mostly more than 60 m from water got looked at on a map: 49 recordings with runs clearly on land, 22 on narrow water that the water map misses (canals, rivers, a pool).",
      "**What riders removed themselves.** Stretches that riders took out of their own sessions — 234 minutes of it — are about as honest a label as it gets.",
      "**Recordings without any pumpfoiling.** Walks and car drives recorded with a watch, on purpose or by accident.",
      "**A rider’s own account.** The slow pumper above: we used all his runs, including the slow parts after the old cut-off, as examples of real pumping.",
    ],
    p2:
      "Every result below is measured on riders the model **never saw during training**. Five times over, one fifth of the riders is held out, the model learns from the rest, and it is judged only on the ones it has not met. Otherwise a model simply learns the people, and the numbers lie.",
  },

  features: {
    h: "What the model gets to see",
    p:
      "The old model looked at 14 numbers per second, mostly about the size of the wrist movement. The new one sees 42. The ones that mattered most:",
    li: [
      "**The three axes against gravity, separately.** The old model only saw the total size of the movement, which throws away its direction. Pumping moves the wrist up and down; balancing, walking and steering move it sideways. Split against gravity, those stop looking alike.",
      "**The rhythm.** How much of the movement sits in the pumping band (0.8–2.2 Hz), how much in the walking band (2.2–3.5 Hz), how much is vibration (5–12 Hz, road and engine), and how spiky it is.",
      "**The minute around.** The highest speed within ±60 s, and how much of that minute was faster than 40 km/h. A run right next to a car drive is suspicious by context alone.",
      "**Speed trend.** Speed rising while the arm is calm means something is still driving the board — often the legs.",
      "**How the watch is held** — more on that below, because that idea came from a rider looking at one session.",
    ],
  },

  honest: {
    h: "Not letting the model copy the old rules",
    p:
      "The biggest pile of training examples is the runs the old detection found. That is useful — most of them are real — but it carries a trap: the old run edges come from speed limits, so a model trained on them learns those speed limits back. The slow pumper made the trap visible: a model that never saw him found only a quarter of his slow pumping.",
    p2:
      "So the three seconds at the start and end of every old run no longer count as examples at all, and the independent truths (board phone, map check, riders’ own removals, the walking and driving recordings) count several times as much as a run the old detection happened to find. And then we asked whether more data would help. It would not: the model trained on 4 riders is already close, and from about **64 riders** on it does not get better at all. More sessions of the same kind are not what is missing — better truth is.",
    cap: "Learning curve: trained on 1 to 258 riders, always tested on riders it had never seen.",
  },

  pipeline: {
    h: "From a probability to runs",
    p:
      "The model gives a probability per second. Turning that into runs turned out to matter as much as the model itself. The first idea — simply use the model instead of the speed limits — produced thousands of tiny extra runs that the other truths did not confirm. What works is a chain of small, checkable steps:",
    li: [
      "**Start generous.** Take the runs the old detection finds *and* the runs found with almost no speed limit at all. Together they contain every run that could possibly be one.",
      "**Cut into confident pieces.** Split each candidate where the model is unsure, bridging short dips of a few seconds.",
      "**Judge each piece.** A piece whose average probability is too low is dropped.",
      "**Be strict with the very short ones.** A piece under 8 seconds only stays when the model is clearly sure — most short pieces are the leftovers of a walk along the shore.",
    ],
    p2:
      "The order matters more than you would think. Judging whole candidates first and cutting afterwards threw real runs away whenever a walk and a ride had merged into one long stretch; cutting first and judging each piece keeps them. And the **sensitivity setting in your profile** keeps its meaning: instead of loosening speed limits, it now makes the model thresholds more or less strict.",
  },

  watch: {
    h: "How the watch sits — an idea from the beach",
    p:
      "Looking at one session with several doubtful runs by a jetty, Jan had a hunch: *when you are on the foil, the watch sits the same way the whole time; when you walk, it does not.* We measured it across every recording where we know the answer. Compared with the same rider’s other safe runs of that session, the watch in a real run sits within **5°** of how it sat before (median). Walking and carrying on land: **72°**. Runs on land: **75°**. The phone-on-board rides confirm it independently: 3–7° while riding, 39–91° while walking to the car.",
    cap1: "The angle of the watch compared with the same rider’s other runs in that session.",
    p2:
      "The second half of the idea — walking is restless, a car is extreme — turned out the other way round, which is the fun part of measuring. Over ten seconds, walking and sitting in a car are **perfectly steady**: the arm hangs, the hands rest on the wheel. What sets a run apart is that the watch is steady in its main direction **and** keeps turning around it: about **29° per second** from the wrist rotating with every pump, against 7° per second walking or driving.",
    cap2: "Left: steadiness alone separates nothing. Right: steady and turning at the same time is what a run looks like.",
    p3:
      "Why not make it a hard rule? We tried. Riders differ too much: one pumps with a rock-steady wrist, another — with short runs — looks, by this measure, almost like somebody walking, and riders who switch stance mid-session hold the watch differently in every other run. As a rule it threw away real rides that the board phone had confirmed. As **three extra inputs for the model** it helps, and that is where it stays.",
  },

  result: {
    h: "What changes",
    p:
      "Measured over 2,648 recordings with motion data, every rider held out as described above:",
    cap: "Runs that should not be counted — old detection against new.",
    li: [
      "**Runs on land** (map check): 81 of 82 still counted → **19**. Several of the rest are GPS errors by the shore where the arm is clearly pumping, so zero is not the right target.",
      "**Short runs next to a car drive:** 25 → **1**.",
      "**Runs inside stretches riders had removed:** 73 → **24**.",
      "**Against the phone on the board:** of the seconds the watch calls on-foil, 87.2 % were → **92.2 %**. Of the seconds really on the foil it finds 93 % (before: 95 %) — a little of that is the price of cutting doubtful run edges.",
      "**The slow pumper:** 22 → **26 minutes**, and that is without the model ever having seen him.",
      "**Records:** the parking-lot loop disappears from the speed records, a run on the road next to a river from the distance and duration records.",
    ],
  },

  failed: {
    h: "What did not work",
    p: "Part of doing this honestly is writing down the dead ends:",
    li: [
      "**The model on its own, instead of the speed limits:** thousands of extra micro-runs, most of them not confirmed.",
      "**A bigger model** (twice the trees, twice the leaves): no better at all.",
      "**Cleaning the training data with the water map:** fewer land runs, but a harbour the map does not know as water cost the slow pumper his examples.",
      "**Hard rules on how the watch is held:** they catch walks, and real rides with them.",
      "**Recognising glides:** the board-phone rides contain only 31 seconds of real gliding — the riders pumped almost all the time. Not measurable yet.",
    ],
  },

  status: {
    h: "Live since 30 September 2026 — what changed",
    p:
      "Before switching it on, the complete analysis — runs, pumps, glides, records and all — ran as a regression test over every recording with motion data, next to the stored results and without changing any of them. It reproduced today’s stored numbers exactly for 2,724 of 2,743 recordings (the rest were stored with older code), so the test measured what it claimed to. Then every one of the 2,743 recordings was recalculated with the new detection:",
    li: [
      "**Runs:** 18,765 → **19,336** (+3 %) — a few land and car runs fewer, more slow continuations and short real runs.",
      "**Foiling time:** 235.9 h → **242.9 h** (+3 %). **Distance:** 3,507 km → **3,558 km**. **Pumps:** 1,340,913 → **1,375,236**.",
      "**Recordings that no longer count as pumpfoiling:** 16 — most of them runs on land confirmed on the map, the rest a handful of seconds each; 8 others now count for the first time.",
      "**Speed records:** four entries left the all-time top ten, and all four were runs on land — the parking-lot loop among them. The distance and duration records moved by seconds and metres at the run edges, nothing more.",
    ],
    p2: "What you see in your own sessions:",
    li2: [
      "**Runs set aside by the detection** are listed under the run table with the reason, and one tap brings a run back if the detection got it wrong. A run you brought back, or removed yourself, is never overruled by a later model — your decision always wins.",
      "**The sensitivity setting in your profile** now sets how strict the model is: *Standard*, *More sensitive* and *Most sensitive* keep more and more of the doubtful and short pieces. The old speed limits still apply as well, but they no longer decide on their own.",
      "**New recordings** are analysed with the new detection as soon as the upload is complete; the preliminary numbers during the upload still come from the previous detection.",
    ],
  },

  help: {
    h: "How you can help: watch and phone together",
    p:
      "The single most valuable thing for the next step is not more sessions — it is **more sessions recorded twice at once**: the watch on your wrist as always, and a phone strapped to the board recording the same ride ([Part 4](/nerd-analysen-4) shows the setup; it is one strap and a dry bag). Every such ride gives us, second by second, what the board was really doing — and today that truth comes from two riders only. Especially useful:",
    li: [
      "**Riders who pump differently** — slow and steady, with the legs, with a calm arm. Those are exactly the styles the detection sees least.",
      "**Glides.** Rides where you pump up and then glide for a few seconds before pumping again. We have almost none.",
      "**Everything around the ride.** Walking to the water, paddling out, standing at the jetty, carrying the board back — leave the recording running.",
      "**Other watches.** Every watch model moves a little differently on the wrist.",
    ],
    p2:
      "To record with the phone, switch on the phone recorder in your profile, start it on the phone and on the watch before you get on the board, and stop both afterwards. Both recordings show up in your sessions as usual; we line them up by time, so there is nothing else to do.",
  },
};

const de: N5 = {
  back: "← Teil 4: Ein Handy am Board",
  h1: "Teil 5: Erkennungsmodell",
  subtitle: "Eine neue On-Foil-Erkennung, gebaut aus allem, was Fahrer uns erzählt haben — und wo sie dich noch braucht",
  intro:
    "Alles, was diese Seite zählt — Läufe, Foil-Zeit, Strecke, Pumps, Rekorde —, beginnt mit einer Entscheidung pro Sekunde: **steht diese Person gerade auf dem Foil?** Liegt die daneben, ist jede Zahl danach auch falsch. Die Erkennung, die heute läuft, funktioniert für die meisten Sessions gut, aber in den letzten Wochen haben uns Fahrer genau gezeigt, wo sie bricht. Dieser Teil erzählt, wie wir diese Entscheidung von Grund auf neu gebaut haben, gemessen an jeder Wahrheit, die wir haben — und er endet mit einer Bitte: wir brauchen mehr Sessions, die gleichzeitig mit einer Uhr am Handgelenk **und** einem Handy am Board aufgezeichnet sind.",

  problem: {
    h: "Wo die alte Erkennung danebenliegt",
    p:
      "Die aktuelle Erkennung kombiniert Tempo-Grenzen (ein Lauf beginnt oberhalb eines Tempos und endet unterhalb eines anderen) mit einem trainierten Modell, das auf die Bewegung des Handgelenks schaut. Drei Arten von Fehlern tauchten immer wieder auf:",
    li: [
      "**Läufe an Land.** Ein paar Sekunden zügiges Gehen am Ufer, das Board zurück zum Steg tragen, ein Stück Joggen zum Auto — mit dem richtigen Tempo und schwingendem Arm kann das als Lauf durchgehen. Eine Runde über einen Parkplatz mit 30 km/h landete sogar in den Tempo-Rekorden.",
      "**Läufe direkt neben einer Autofahrt.** Aufnahme vergessen zu stoppen, nach Hause gefahren — und die ersten Sekunden der Fahrt können wie ein Lauf aussehen.",
      "**Langsame Pumper, abgeschnitten.** Ein Fahrer, der langsam und gleichmäßig pumpt, schrieb uns, dass seinen Läufen fast die Hälfte fehlt. Er hatte recht: er pumpt mit 5–10 km/h weiter, nachdem die alte Tempo-Grenze den Lauf schon beendet hat.",
    ],
  },

  truth: {
    h: "Woran wir prüfen können",
    p:
      "Eine Erkennung ist nur so gut wie das, woran man sie misst, und die verlockende Abkürzung — die neue Erkennung an der alten messen — bringt einem nur bei, die alten Fehler zu kopieren. Also haben wir jede unabhängige Wahrheit gesammelt, die wir finden konnten:",
    li: [
      "**Das Handy am Board** ([Teil 4](/nerd-analysen-4)). Gleichzeitig mit einer Uhr am Handgelenk aufgezeichnet, sagt es Sekunde für Sekunde, ob das Board gepumpt wurde — ohne Raten aus dem Arm. Bisher kommen sechs Fahrten in Frage, zwei Fahrer, etwa 2,5 Stunden.",
      "**Auf der Karte geprüfte Läufe.** Jeder Lauf, der überwiegend mehr als 60 m vom Wasser entfernt liegt, wurde auf einer Karte angeschaut: 49 Aufnahmen mit Läufen eindeutig an Land, 22 auf schmalem Wasser, das die Wasserkarte nicht kennt (Kanäle, Flüsse, ein Becken).",
      "**Was Fahrer selbst entfernt haben.** Abschnitte, die Fahrer aus ihren eigenen Sessions herausgenommen haben — 234 Minuten davon —, sind ungefähr das ehrlichste Label, das es gibt.",
      "**Aufnahmen ganz ohne Pumpfoilen.** Spaziergänge und Autofahrten, mit der Uhr aufgezeichnet, absichtlich oder aus Versehen.",
      "**Die eigene Schilderung eines Fahrers.** Der langsame Pumper von oben: wir haben alle seine Läufe, einschließlich der langsamen Teile nach der alten Grenze, als Beispiele für echtes Pumpen verwendet.",
    ],
    p2:
      "Jedes Ergebnis unten ist an Fahrern gemessen, die das Modell **beim Training nie gesehen hat**. Fünfmal hintereinander wird ein Fünftel der Fahrer zurückgehalten, das Modell lernt vom Rest und wird nur an denen beurteilt, die es nicht kennt. Sonst lernt ein Modell einfach die Leute auswendig, und die Zahlen lügen.",
  },

  features: {
    h: "Was das Modell zu sehen bekommt",
    p:
      "Das alte Modell schaute auf 14 Zahlen pro Sekunde, meist zur Stärke der Handgelenksbewegung. Das neue sieht 42. Die wichtigsten davon:",
    li: [
      "**Die drei Achsen gegen die Schwerkraft, einzeln.** Das alte Modell sah nur die Gesamtstärke der Bewegung, und damit geht ihre Richtung verloren. Pumpen bewegt das Handgelenk auf und ab; Balancieren, Gehen und Steuern bewegen es seitlich. Gegen die Schwerkraft aufgeteilt, sehen sich diese nicht mehr ähnlich.",
      "**Der Rhythmus.** Wie viel der Bewegung im Pump-Band liegt (0,8–2,2 Hz), wie viel im Geh-Band (2,2–3,5 Hz), wie viel Vibration ist (5–12 Hz, Straße und Motor) und wie spitz sie ist.",
      "**Die Minute drumherum.** Das höchste Tempo innerhalb von ±60 s und wie viel dieser Minute schneller als 40 km/h war. Ein Lauf direkt neben einer Autofahrt ist schon allein durch den Zusammenhang verdächtig.",
      "**Tempo-Verlauf.** Steigt das Tempo, während der Arm ruhig ist, treibt noch etwas das Board an — oft die Beine.",
      "**Wie die Uhr gehalten wird** — mehr dazu unten, denn diese Idee kam von einem Fahrer, der sich eine Session angeschaut hat.",
    ],
  },

  honest: {
    h: "Das Modell nicht die alten Regeln abschreiben lassen",
    p:
      "Der größte Haufen Trainingsbeispiele sind die Läufe, die die alte Erkennung gefunden hat. Das ist nützlich — die meisten davon sind echt —, hat aber eine Falle: die alten Laufgrenzen stammen aus Tempo-Grenzen, also lernt ein darauf trainiertes Modell genau diese Tempo-Grenzen zurück. Der langsame Pumper hat die Falle sichtbar gemacht: ein Modell, das ihn nie gesehen hatte, fand nur ein Viertel seines langsamen Pumpens.",
    p2:
      "Deshalb zählen die drei Sekunden am Anfang und Ende jedes alten Laufs gar nicht mehr als Beispiele, und die unabhängigen Wahrheiten (Handy am Board, Kartenprüfung, von Fahrern selbst Entferntes, die Geh- und Autofahrt-Aufnahmen) zählen ein Mehrfaches eines Laufs, den die alte Erkennung zufällig gefunden hat. Und dann haben wir gefragt, ob mehr Daten helfen würden. Würden sie nicht: das Modell, trainiert auf 4 Fahrern, ist schon nah dran, und ab etwa **64 Fahrern** wird es überhaupt nicht mehr besser. Mehr Sessions derselben Art fehlen nicht — bessere Wahrheit fehlt.",
    cap: "Lernkurve: trainiert auf 1 bis 258 Fahrern, immer getestet an Fahrern, die es nie gesehen hatte.",
  },

  pipeline: {
    h: "Von einer Wahrscheinlichkeit zu Läufen",
    p:
      "Das Modell gibt eine Wahrscheinlichkeit pro Sekunde aus. Daraus Läufe zu machen, stellte sich als genauso wichtig heraus wie das Modell selbst. Die erste Idee — einfach das Modell statt der Tempo-Grenzen nehmen — erzeugte Tausende winziger Extra-Läufe, die die anderen Wahrheiten nicht bestätigten. Was funktioniert, ist eine Kette kleiner, überprüfbarer Schritte:",
    li: [
      "**Großzügig anfangen.** Die Läufe nehmen, die die alte Erkennung findet, *und* die Läufe, die fast ganz ohne Tempo-Grenze gefunden werden. Zusammen enthalten sie jeden Lauf, der überhaupt einer sein könnte.",
      "**In sichere Stücke schneiden.** Jeden Kandidaten dort teilen, wo das Modell unsicher ist, und kurze Einbrüche von ein paar Sekunden überbrücken.",
      "**Jedes Stück beurteilen.** Ein Stück, dessen mittlere Wahrscheinlichkeit zu niedrig ist, fällt weg.",
      "**Streng mit den ganz kurzen.** Ein Stück unter 8 Sekunden bleibt nur, wenn das Modell sich klar sicher ist — die meisten kurzen Stücke sind die Reste eines Spaziergangs am Ufer.",
    ],
    p2:
      "Die Reihenfolge ist wichtiger, als man denkt. Erst ganze Kandidaten zu beurteilen und danach zu schneiden, warf echte Läufe weg, sobald ein Spaziergang und eine Fahrt zu einem langen Stück verschmolzen waren; erst schneiden und dann jedes Stück beurteilen behält sie. Und die **Erkennungs-Empfindlichkeit in deinem Profil** behält ihre Bedeutung: statt Tempo-Grenzen zu lockern, macht sie jetzt die Schwellen des Modells strenger oder lockerer.",
  },

  watch: {
    h: "Wie die Uhr sitzt — eine Idee vom Strand",
    p:
      "Beim Anschauen einer Session mit mehreren zweifelhaften Läufen an einem Steg hatte Jan eine Ahnung: *wenn du auf dem Foil bist, sitzt die Uhr die ganze Zeit gleich; wenn du gehst, nicht.* Wir haben das über jede Aufnahme gemessen, bei der wir die Antwort kennen. Verglichen mit den anderen sicheren Läufen desselben Fahrers in dieser Session sitzt die Uhr in einem echten Lauf innerhalb von **5°** so wie vorher (Median). Gehen und Tragen an Land: **72°**. Läufe an Land: **75°**. Die Fahrten mit dem Handy am Board bestätigen es unabhängig: 3–7° beim Fahren, 39–91° beim Gehen zum Auto.",
    cap1: "Der Winkel der Uhr, verglichen mit den anderen Läufen desselben Fahrers in dieser Session.",
    p2:
      "Die zweite Hälfte der Idee — Gehen ist unruhig, ein Auto extrem — stellte sich genau umgekehrt heraus, und das ist das Schöne am Messen. Über zehn Sekunden sind Gehen und Im-Auto-Sitzen **völlig ruhig**: der Arm hängt, die Hände liegen am Lenkrad. Was einen Lauf abhebt, ist, dass die Uhr in ihrer Hauptrichtung ruhig ist **und** sich trotzdem um sie dreht: etwa **29° pro Sekunde**, weil das Handgelenk bei jedem Pump mitrotiert, gegen 7° pro Sekunde beim Gehen oder Autofahren.",
    cap2: "Links: Ruhe allein trennt gar nichts. Rechts: ruhig und drehend zugleich — so sieht ein Lauf aus.",
    p3:
      "Warum keine harte Regel daraus machen? Haben wir versucht. Fahrer unterscheiden sich zu sehr: einer pumpt mit felsenfestem Handgelenk, ein anderer — mit kurzen Läufen — sieht nach diesem Maß fast aus wie jemand, der geht, und Fahrer, die mitten in der Session die Fußstellung wechseln, halten die Uhr in jedem zweiten Lauf anders. Als Regel warf es echte Fahrten weg, die das Handy am Board bestätigt hatte. Als **drei zusätzliche Eingaben für das Modell** hilft es, und dort bleibt es.",
  },

  result: {
    h: "Was sich ändert",
    p:
      "Gemessen über 2.648 Aufnahmen mit Bewegungsdaten, jeder Fahrer wie oben beschrieben zurückgehalten:",
    cap: "Läufe, die nicht gezählt werden sollten — alte Erkennung gegen neue.",
    li: [
      "**Läufe an Land** (Kartenprüfung): 81 von 82 noch gezählt → **19**. Mehrere der übrigen sind GPS-Fehler am Ufer, bei denen der Arm eindeutig pumpt — null ist also nicht das richtige Ziel.",
      "**Kurze Läufe neben einer Autofahrt:** 25 → **1**.",
      "**Läufe in Abschnitten, die Fahrer entfernt hatten:** 73 → **24**.",
      "**Gegen das Handy am Board:** von den Sekunden, die die Uhr als On-Foil wertet, stimmten 87,2 % → **92,2 %**. Von den Sekunden, die wirklich auf dem Foil waren, findet sie 93 % (vorher: 95 %) — ein bisschen davon ist der Preis dafür, zweifelhafte Laufränder abzuschneiden.",
      "**Der langsame Pumper:** 22 → **26 Minuten**, und das, ohne dass das Modell ihn je gesehen hat.",
      "**Rekorde:** die Parkplatz-Runde verschwindet aus den Tempo-Rekorden, ein Lauf auf der Straße neben einem Fluss aus den Strecken- und Dauer-Rekorden.",
    ],
  },

  failed: {
    h: "Was nicht funktioniert hat",
    p: "Zur Ehrlichkeit gehört, auch die Sackgassen aufzuschreiben:",
    li: [
      "**Das Modell allein, statt der Tempo-Grenzen:** Tausende zusätzlicher Mini-Läufe, die meisten davon nicht bestätigt.",
      "**Ein größeres Modell** (doppelt so viele Bäume, doppelt so viele Blätter): überhaupt nicht besser.",
      "**Die Trainingsdaten mit der Wasserkarte bereinigen:** weniger Land-Läufe, aber ein Hafen, den die Karte nicht als Wasser kennt, kostete den langsamen Pumper seine Beispiele.",
      "**Harte Regeln dazu, wie die Uhr gehalten wird:** sie fangen Spaziergänge — und echte Fahrten gleich mit.",
      "**Gleitphasen erkennen:** die Fahrten mit dem Handy am Board enthalten nur 31 Sekunden echtes Gleiten — die Fahrer haben fast die ganze Zeit gepumpt. Noch nicht messbar.",
    ],
  },

  status: {
    h: "Live seit 30. September 2026 — was sich geändert hat",
    p:
      "Vor dem Einschalten lief die komplette Analyse — Läufe, Pumps, Gleitphasen, Rekorde und alles — als Regressionstest über jede Aufnahme mit Bewegungsdaten, neben den gespeicherten Ergebnissen und ohne eines davon zu ändern. Sie reproduzierte die heute gespeicherten Zahlen exakt für 2.724 von 2.743 Aufnahmen (der Rest war mit älterem Code gespeichert), der Test hat also gemessen, was er behauptet. Danach wurde jede der 2.743 Aufnahmen mit der neuen Erkennung neu berechnet:",
    li: [
      "**Läufe:** 18.765 → **19.336** (+3 %) — ein paar Land- und Auto-Läufe weniger, mehr langsame Fortsetzungen und kurze echte Läufe.",
      "**Foil-Zeit:** 235,9 h → **242,9 h** (+3 %). **Strecke:** 3.507 km → **3.558 km**. **Pumps:** 1.340.913 → **1.375.236**.",
      "**Aufnahmen, die nicht mehr als Pumpfoilen zählen:** 16 — die meisten davon auf der Karte bestätigte Läufe an Land, der Rest jeweils eine Handvoll Sekunden; 8 andere zählen jetzt zum ersten Mal.",
      "**Tempo-Rekorde:** vier Einträge sind aus den ewigen Top Ten gefallen, und alle vier waren Läufe an Land — die Parkplatz-Runde darunter. Die Strecken- und Dauer-Rekorde haben sich an den Laufrändern um Sekunden und Meter verschoben, mehr nicht.",
    ],
    p2: "Was du in deinen eigenen Sessions siehst:",
    li2: [
      "**Von der Erkennung aussortierte Läufe** stehen unter der Lauf-Tabelle mit dem Grund, und ein Tipp holt einen Lauf zurück, wenn die Erkennung danebenlag. Einen Lauf, den du zurückgeholt oder selbst entfernt hast, überstimmt kein späteres Modell — deine Entscheidung gewinnt immer.",
      "**Die Erkennungs-Empfindlichkeit in deinem Profil** legt jetzt fest, wie streng das Modell ist: *Standard*, *Empfindlicher* und *Am empfindlichsten* behalten immer mehr von den zweifelhaften und kurzen Stücken. Die alten Tempo-Grenzen gelten weiterhin auch, entscheiden aber nicht mehr allein.",
      "**Neue Aufnahmen** werden mit der neuen Erkennung analysiert, sobald der Upload vollständig ist; die vorläufigen Zahlen während des Uploads kommen noch von der bisherigen Erkennung.",
    ],
  },

  help: {
    h: "Wie du helfen kannst: Uhr und Handy zusammen",
    p:
      "Das Wertvollste für den nächsten Schritt sind nicht mehr Sessions — es sind **mehr Sessions, die doppelt auf einmal aufgezeichnet sind**: die Uhr am Handgelenk wie immer und ein Handy am Board festgegurtet, das dieselbe Fahrt aufzeichnet ([Teil 4](/nerd-analysen-4) zeigt das Setup; es ist ein Gurt und ein Dry Bag). Jede solche Fahrt sagt uns Sekunde für Sekunde, was das Board wirklich gemacht hat — und heute stammt diese Wahrheit von nur zwei Fahrern. Besonders hilfreich:",
    li: [
      "**Fahrer, die anders pumpen** — langsam und gleichmäßig, mit den Beinen, mit ruhigem Arm. Genau diese Stile sieht die Erkennung am seltensten.",
      "**Gleitphasen.** Fahrten, bei denen du hochpumpst und dann ein paar Sekunden gleitest, bevor du wieder pumpst. Davon haben wir fast nichts.",
      "**Alles rund um die Fahrt.** Zum Wasser gehen, rauspaddeln, am Steg stehen, das Board zurücktragen — lass die Aufnahme einfach laufen.",
      "**Andere Uhren.** Jedes Uhrenmodell bewegt sich ein bisschen anders am Handgelenk.",
    ],
    p2:
      "Um mit dem Handy aufzuzeichnen, schalte in deinem Profil den Handy-Recorder ein, starte ihn am Handy und an der Uhr, bevor du aufs Board gehst, und stoppe danach beide. Beide Aufnahmen erscheinen wie gewohnt in deinen Sessions; wir legen sie zeitlich übereinander, du musst also sonst nichts tun.",
  },
};

const deAT: N5 = {
  back: "← Teil 4: Ein Handy am Board",
  h1: "Teil 5: Erkennungsmodell",
  subtitle: "A neue On-Foil-Erkennung, gebaut aus allem, was uns Fahrer erzählt haben — und wo sie di no braucht",
  intro:
    "Alles, was diese Seite zählt — Läufe, Foil-Zeit, Strecke, Pumps, Rekorde —, fangt mit einer Entscheidung pro Sekunde an: **steht der oder die grad am Foil?** Liegt die daneben, is jede Zahl danach a falsch. Die Erkennung, die heut läuft, passt für die meisten Sessions eh gut, aber in den letzten Wochen haben uns Fahrer ganz genau gezeigt, wo sie auslasst. In diesem Teil geht’s drum, wie wir diese Entscheidung von Grund auf neu gebaut haben, gemessen an jeder Wahrheit, die wir haben — und am Schluss steht a Bitte: wir brauchen mehr Sessions, die gleichzeitig mit einer Uhr am Handgelenk **und** einem Handy am Board aufgezeichnet san.",

  problem: {
    h: "Wo die alte Erkennung danebenhaut",
    p:
      "Die aktuelle Erkennung kombiniert Tempo-Grenzen (a Lauf fangt über einem Tempo an und hört unter einem anderen auf) mit einem trainierten Modell, das sich die Bewegung vom Handgelenk anschaut. Drei Arten von Fehlern san immer wieder aufgetaucht:",
    li: [
      "**Läufe an Land.** A paar Sekunden flott am Ufer gehen, das Board zurück zum Steg tragen, a kurzes Stück zum Auto laufen — mit dem richtigen Tempo und schwingendem Arm kann das als Lauf durchgehen. A Runde über an Parkplatz mit 30 km/h is sogar in den Tempo-Rekorden g’landet.",
      "**Läufe gleich neben einer Autofahrt.** Aufnahme vergessen abzudrehen, heimgefahren — und die ersten Sekunden von der Fahrt können wie a Lauf ausschauen.",
      "**Langsame Pumper, abgeschnitten.** A Fahrer, der langsam und gleichmäßig pumpt, hat uns g’schrieben, dass seinen Läufen fast die Hälfte fehlt. Er hat recht g’habt: er pumpt mit 5–10 km/h weiter, wenn die alte Tempo-Grenze den Lauf schon beendet hat.",
    ],
  },

  truth: {
    h: "Woran wir’s prüfen können",
    p:
      "A Erkennung is nur so gut wie das, woran man sie misst, und die verlockende Abkürzung — die neue Erkennung an der alten messen — bringt einem nur bei, die alten Fehler abzuschreiben. Also haben wir jede unabhängige Wahrheit z’sammengetragen, die wir finden haben können:",
    li: [
      "**Das Handy am Board** ([Teil 4](/nerd-analysen-4)). Gleichzeitig mit einer Uhr am Handgelenk aufgezeichnet, sagt’s Sekunde für Sekunde, ob das Board gepumpt worden is — ohne Raten aus dem Arm. Bis jetzt kommen sechs Fahrten in Frage, zwei Fahrer, ungefähr 2,5 Stunden.",
      "**Auf der Karte geprüfte Läufe.** Jeder Lauf, der großteils mehr als 60 m vom Wasser weg liegt, is auf einer Karte ang’schaut worden: 49 Aufnahmen mit Läufen eindeutig an Land, 22 auf schmalem Wasser, das die Wasserkarte ned kennt (Kanäle, Flüsse, a Becken).",
      "**Was Fahrer selber rausgenommen haben.** Abschnitte, die Fahrer aus ihren eigenen Sessions rausgenommen haben — 234 Minuten davon —, san ungefähr das ehrlichste Label, das es gibt.",
      "**Aufnahmen ganz ohne Pumpfoilen.** Spaziergänge und Autofahrten, mit der Uhr aufgezeichnet, absichtlich oder aus Versehen.",
      "**Was a Fahrer selber erzählt hat.** Der langsame Pumper von oben: wir haben alle seine Läufe, samt den langsamen Teilen nach der alten Grenze, als Beispiele für echtes Pumpen hergenommen.",
    ],
    p2:
      "Jedes Ergebnis unten is an Fahrern gemessen, die das Modell **beim Training nie g’sehen hat**. Fünfmal hintereinander wird a Fünftel der Fahrer z’ruckg’halten, das Modell lernt vom Rest und wird nur an denen beurteilt, die’s ned kennt. Sonst lernt a Modell einfach die Leut auswendig, und die Zahlen lügen.",
  },

  features: {
    h: "Was das Modell zum Anschauen kriegt",
    p:
      "Das alte Modell hat sich 14 Zahlen pro Sekunde ang’schaut, meistens zur Stärke von der Handgelenksbewegung. Das neue sieht 42. Die wichtigsten davon:",
    li: [
      "**Die drei Achsen gegen die Schwerkraft, einzeln.** Das alte Modell hat nur die Gesamtstärke von der Bewegung g’sehen, und damit is ihre Richtung weg. Pumpen bewegt das Handgelenk auf und ab; Balancieren, Gehen und Lenken bewegen’s seitlich. Gegen die Schwerkraft aufgeteilt, schauen sich die ned mehr ähnlich.",
      "**Der Rhythmus.** Wie viel von der Bewegung im Pump-Band liegt (0,8–2,2 Hz), wie viel im Geh-Band (2,2–3,5 Hz), wie viel Vibration is (5–12 Hz, Straße und Motor) und wie spitz sie is.",
      "**Die Minute rundherum.** Das höchste Tempo innerhalb von ±60 s und wie viel von dieser Minute schneller als 40 km/h war. A Lauf gleich neben einer Autofahrt is schon allein vom Zusammenhang her verdächtig.",
      "**Tempo-Verlauf.** Geht das Tempo rauf, während der Arm ruhig is, treibt no was das Board an — oft die Haxen.",
      "**Wie die Uhr g’halten wird** — mehr dazu weiter unten, weil die Idee von einem Fahrer kommen is, der sich a Session ang’schaut hat.",
    ],
  },

  honest: {
    h: "Das Modell ned die alten Regeln abschreiben lassen",
    p:
      "Der größte Haufen Trainingsbeispiele san die Läufe, die die alte Erkennung g’funden hat. Das is nützlich — die meisten davon san echt —, hat aber an Haken: die alten Laufgrenzen kommen aus Tempo-Grenzen, also lernt a Modell, das darauf trainiert is, genau diese Tempo-Grenzen wieder zurück. Der langsame Pumper hat die Falle sichtbar g’macht: a Modell, das ihn nie g’sehen hat, hat nur a Viertel von seinem langsamen Pumpen g’funden.",
    p2:
      "Deswegen zählen die drei Sekunden am Anfang und am Ende von jedem alten Lauf gar ned mehr als Beispiele, und die unabhängigen Wahrheiten (Handy am Board, Kartenprüfung, was Fahrer selber rausgenommen haben, die Geh- und Autofahrt-Aufnahmen) zählen a Mehrfaches von einem Lauf, den die alte Erkennung zufällig g’funden hat. Und dann haben wir uns g’fragt, ob mehr Daten was bringen würden. Tät’s ned: das Modell, trainiert auf 4 Fahrern, is schon nah dran, und ab ungefähr **64 Fahrern** wird’s überhaupt ned mehr besser. Mehr Sessions von der gleichen Sorte fehlen ned — bessere Wahrheit fehlt.",
    cap: "Lernkurve: trainiert auf 1 bis 258 Fahrern, immer getestet an Fahrern, die’s nie g’sehen hat.",
  },

  pipeline: {
    h: "Von einer Wahrscheinlichkeit zu Läufen",
    p:
      "Das Modell gibt a Wahrscheinlichkeit pro Sekunde aus. Daraus Läufe zu machen, hat sich als genauso wichtig herausg’stellt wie das Modell selber. Die erste Idee — einfach das Modell statt der Tempo-Grenzen hernehmen — hat tausende winzige Extra-Läufe produziert, die die anderen Wahrheiten ned bestätigt haben. Was funktioniert, is a Kette aus kleinen, überprüfbaren Schritten:",
    li: [
      "**Großzügig anfangen.** Die Läufe nehmen, die die alte Erkennung findet, *und* die Läufe, die fast ganz ohne Tempo-Grenze g’funden werden. Z’sammen enthalten die jeden Lauf, der überhaupt einer sein könnt.",
      "**In sichere Stückerl schneiden.** Jeden Kandidaten dort teilen, wo das Modell unsicher is, und kurze Einbrüche von a paar Sekunden überbrücken.",
      "**Jedes Stückerl beurteilen.** A Stückerl, dessen mittlere Wahrscheinlichkeit zu niedrig is, fliegt raus.",
      "**Streng mit den ganz kurzen.** A Stückerl unter 8 Sekunden bleibt nur, wenn sich das Modell klar sicher is — die meisten kurzen Stückerl san die Reste von einem Spaziergang am Ufer.",
    ],
    p2:
      "Die Reihenfolge is wichtiger, als man glaubt. Zuerst ganze Kandidaten beurteilen und dann schneiden hat echte Läufe wegg’schmissen, sobald a Spaziergang und a Fahrt zu einem langen Stück z’sammengewachsen waren; zuerst schneiden und dann jedes Stückerl beurteilen behalt sie. Und die **Erkennungs-Empfindlichkeit in deinem Profil** behält ihre Bedeutung: statt Tempo-Grenzen zu lockern, macht sie jetzt die Schwellen vom Modell strenger oder lockerer.",
  },

  watch: {
    h: "Wie die Uhr sitzt — a Idee vom Strand",
    p:
      "Beim Anschauen von einer Session mit mehreren zweifelhaften Läufen bei einem Steg hat der Jan a Ahnung g’habt: *wennst am Foil bist, sitzt die Uhr die ganze Zeit gleich; wennst gehst, ned.* Wir haben das über jede Aufnahme g’messen, wo wir die Antwort kennen. Verglichen mit den anderen sicheren Läufen vom selben Fahrer in dieser Session sitzt die Uhr in einem echten Lauf innerhalb von **5°** so wie vorher (Median). Gehen und Tragen an Land: **72°**. Läufe an Land: **75°**. Die Fahrten mit dem Handy am Board bestätigen’s unabhängig: 3–7° beim Fahren, 39–91° beim Gehen zum Auto.",
    cap1: "Der Winkel von der Uhr, verglichen mit den anderen Läufen vom selben Fahrer in dieser Session.",
    p2:
      "Die zweite Hälfte von der Idee — Gehen is unruhig, a Auto extrem — hat sich genau umgekehrt herausg’stellt, und das is das Leiwande am Messen. Über zehn Sekunden san Gehen und im Auto Sitzen **völlig ruhig**: der Arm hängt, die Händ liegen am Lenkrad. Was einen Lauf abhebt, is, dass die Uhr in ihrer Hauptrichtung ruhig is **und** sich trotzdem um sie dreht: ungefähr **29° pro Sekunde**, weil sich das Handgelenk bei jedem Pump mitdreht, gegen 7° pro Sekunde beim Gehen oder Autofahren.",
    cap2: "Links: Ruhe allein trennt gar nix. Rechts: ruhig und drehend zugleich — so schaut a Lauf aus.",
    p3:
      "Warum ka harte Regel draus machen? Haben wir probiert. Die Fahrer san zu verschieden: einer pumpt mit bombenfestem Handgelenk, a anderer — mit kurzen Läufen — schaut nach diesem Maß fast aus wie wer, der geht, und Fahrer, die mitten in der Session die Fußstellung wechseln, halten die Uhr in jedem zweiten Lauf anders. Als Regel hat’s echte Fahrten wegg’schmissen, die das Handy am Board bestätigt hat. Als **drei zusätzliche Eingaben fürs Modell** hilft’s, und dort bleibt’s.",
  },

  result: {
    h: "Was sich ändert",
    p:
      "G’messen über 2.648 Aufnahmen mit Bewegungsdaten, jeder Fahrer wie oben beschrieben z’ruckg’halten:",
    cap: "Läufe, die ned zählen sollten — alte Erkennung gegen neue.",
    li: [
      "**Läufe an Land** (Kartenprüfung): 81 von 82 no gezählt → **19**. Mehrere von den übrigen san GPS-Fehler am Ufer, wo der Arm eindeutig pumpt — null is also ned das richtige Ziel.",
      "**Kurze Läufe neben einer Autofahrt:** 25 → **1**.",
      "**Läufe in Abschnitten, die Fahrer rausgenommen haben:** 73 → **24**.",
      "**Gegen das Handy am Board:** von den Sekunden, die die Uhr als On-Foil wertet, haben 87,2 % g’stimmt → **92,2 %**. Von den Sekunden, die wirklich am Foil waren, findet sie 93 % (vorher: 95 %) — a bissl davon is der Preis dafür, dass zweifelhafte Laufränder abg’schnitten werden.",
      "**Der langsame Pumper:** 22 → **26 Minuten**, und das, ohne dass ihn das Modell je g’sehen hat.",
      "**Rekorde:** die Parkplatz-Runde verschwindet aus den Tempo-Rekorden, a Lauf auf der Straße neben einem Fluss aus den Strecken- und Dauer-Rekorden.",
    ],
  },

  failed: {
    h: "Was ned funktioniert hat",
    p: "Zur Ehrlichkeit g’hört, dass man a die Sackgassen aufschreibt:",
    li: [
      "**Das Modell allein, statt der Tempo-Grenzen:** tausende zusätzliche Mini-Läufe, die meisten davon ned bestätigt.",
      "**A größeres Modell** (doppelt so viele Bäume, doppelt so viele Blätter): überhaupt ned besser.",
      "**Die Trainingsdaten mit der Wasserkarte putzen:** weniger Land-Läufe, aber a Hafen, den die Karte ned als Wasser kennt, hat den langsamen Pumper seine Beispiele gekostet.",
      "**Harte Regeln, wie die Uhr g’halten wird:** die erwischen Spaziergänge — und echte Fahrten gleich mit.",
      "**Gleitphasen erkennen:** die Fahrten mit dem Handy am Board haben nur 31 Sekunden echtes Gleiten drin — die Fahrer haben fast die ganze Zeit gepumpt. No ned messbar.",
    ],
  },

  status: {
    h: "Live seit 30. September 2026 — was sich geändert hat",
    p:
      "Vorm Einschalten is die komplette Analyse — Läufe, Pumps, Gleitphasen, Rekorde und alles — als Regressionstest über jede Aufnahme mit Bewegungsdaten g’laufen, neben den g’speicherten Ergebnissen und ohne eins davon anzugreifen. Sie hat die heut g’speicherten Zahlen exakt für 2.724 von 2.743 Aufnahmen reproduziert (der Rest war mit älterem Code g’speichert), der Test hat also g’messen, was er behauptet. Danach is jede von den 2.743 Aufnahmen mit der neuen Erkennung neu berechnet worden:",
    li: [
      "**Läufe:** 18.765 → **19.336** (+3 %) — a paar Land- und Auto-Läufe weniger, mehr langsame Fortsetzungen und kurze echte Läufe.",
      "**Foil-Zeit:** 235,9 h → **242,9 h** (+3 %). **Strecke:** 3.507 km → **3.558 km**. **Pumps:** 1.340.913 → **1.375.236**.",
      "**Aufnahmen, die ned mehr als Pumpfoilen zählen:** 16 — die meisten davon auf der Karte bestätigte Läufe an Land, der Rest jeweils a Handvoll Sekunden; 8 andere zählen jetzt zum ersten Mal.",
      "**Tempo-Rekorde:** vier Einträge san aus den ewigen Top Ten g’fallen, und alle vier waren Läufe an Land — die Parkplatz-Runde a dabei. Die Strecken- und Dauer-Rekorde haben sich an den Laufrändern um Sekunden und Meter verschoben, mehr ned.",
    ],
    p2: "Was du in deinen eigenen Sessions siehst:",
    li2: [
      "**Von der Erkennung aussortierte Läufe** stehen unter der Lauf-Tabelle mit dem Grund, und a Tipp holt an Lauf zurück, wenn die Erkennung danebeng’legen is. An Lauf, den du zurückg’holt oder selber rausgenommen hast, überstimmt ka späteres Modell — deine Entscheidung g’winnt immer.",
      "**Die Erkennungs-Empfindlichkeit in deinem Profil** legt jetzt fest, wie streng das Modell is: *Standard*, *Empfindlicher* und *Am empfindlichsten* behalten immer mehr von den zweifelhaften und kurzen Stückerln. Die alten Tempo-Grenzen gelten a weiterhin, entscheiden aber ned mehr allein.",
      "**Neue Aufnahmen** werden mit der neuen Erkennung analysiert, sobald der Upload komplett is; die vorläufigen Zahlen während vom Upload kommen no von der bisherigen Erkennung.",
    ],
  },

  help: {
    h: "Wie du helfen kannst: Uhr und Handy z’sammen",
    p:
      "Das Wertvollste für den nächsten Schritt san ned mehr Sessions — es san **mehr Sessions, die doppelt auf einmal aufgezeichnet san**: die Uhr am Handgelenk wie immer und a Handy am Board festgegurtet, das die gleiche Fahrt aufzeichnet ([Teil 4](/nerd-analysen-4) zeigt das Setup; es is a Gurt und a Dry Bag). Jede solche Fahrt sagt uns Sekunde für Sekunde, was das Board wirklich g’macht hat — und heut kommt diese Wahrheit von nur zwei Fahrern. Besonders hilfreich:",
    li: [
      "**Fahrer, die anders pumpen** — langsam und gleichmäßig, mit den Haxen, mit ruhigem Arm. Genau diese Stile sieht die Erkennung am seltensten.",
      "**Gleitphasen.** Fahrten, wo du raufpumpst und dann a paar Sekunden gleitest, bevor du wieder pumpst. Davon haben wir fast nix.",
      "**Alles rund um die Fahrt.** Zum Wasser gehen, rauspaddeln, am Steg stehen, das Board zurücktragen — lass die Aufnahme einfach laufen.",
      "**Andere Uhren.** Jedes Uhrenmodell bewegt sich a bissl anders am Handgelenk.",
    ],
    p2:
      "Zum Aufzeichnen mit dem Handy schaltest in deinem Profil den Handy-Recorder ein, startest ihn am Handy und an der Uhr, bevor du aufs Board gehst, und stoppst danach beide. Beide Aufnahmen tauchen wie gewohnt in deinen Sessions auf; wir legen sie zeitlich übereinander, du musst also sonst nix tun.",
  },
};

const gsw: N5 = {
  back: "← Teil 4: E Händy am Board",
  h1: "Teil 5: Erkennigsmodell",
  subtitle: "E nöii On-Foil-Erkennig, baut us allem, wo üs Fahrer verzellt händ — und wo si di no bruucht",
  intro:
    "Alles, wo die Siite zellt — Läuf, Foil-Ziit, Strecki, Pumps, Rekord —, fangt mit ere Entscheidig pro Sekunde aa: **staht die Person grad uf em Foil?** Liit die dernäbe, isch jedi Zahl dänach au falsch. D Erkennig, wo hüt lauft, funktioniert für di meischte Sessions guet, aber i de letschte Wuche händ üs Fahrer ganz gnau zeigt, wo si versait. I dem Teil gahts drum, wie mer die Entscheidig vo Grund uf nöi baut händ, gmässe a jedere Wahrheit, wo mer händ — und am Schluss staht e Bitt: mer bruuched meh Sessions, wo gliichziitig mit ere Uhr am Handglänk **und** emne Händy am Board ufgnoh worde sind.",

  problem: {
    h: "Wo di alt Erkennig dernäbe liit",
    p:
      "D aktuell Erkennig kombiniert Tempo-Gränze (en Lauf fangt über eim Tempo aa und hört under emne andere uf) mit emne trainierte Modell, wo d Bewegig vom Handglänk aaluegt. Drü Arte vo Fähler sind immer wider cho:",
    li: [
      "**Läuf a Land.** Es paar Sekunde zügig am Ufer lauffe, s Board zrugg zum Steg träge, es Stück zum Auto seckle — mit em richtige Tempo und em schwingende Arm chan das als Lauf duregah. E Rundi über en Parkplatz mit 30 km/h isch sogar i de Tempo-Rekord glandet.",
      "**Läuf grad näbe ere Autofahrt.** D Ufnahm vergässe z stoppe, heigfahre — und di erschte Sekunde vo de Fahrt chönd uusgseh wie en Lauf.",
      "**Langsami Pumper, abgschnitte.** En Fahrer, wo langsam und gliichmässig pumpt, hät üs gschribe, dass sine Läuf fascht d Hälfti fehlt. Er hät rächt gha: er pumpt mit 5–10 km/h wiiter, wänn di alt Tempo-Gränze de Lauf scho beändet hät.",
    ],
  },

  truth: {
    h: "Wo mer dra chönd prüefe",
    p:
      "E Erkennig isch nume so guet wie das, wo mer si dra misst, und di verlockend Abchürzig — di nöi Erkennig a de alte mässe — bringt eim nume bi, di alte Fähler abzschriibe. Drum händ mer jedi unabhängigi Wahrheit gsammlet, wo mer händ chöne finde:",
    li: [
      "**S Händy am Board** ([Teil 4](/nerd-analysen-4)). Gliichziitig mit ere Uhr am Handglänk ufgnoh, seits Sekunde für Sekunde, öb s Board pumpt worde isch — ohni us em Arm z rate. Bis jetzt chömed sächs Fahrte in Frag, zwei Fahrer, öppe 2,5 Stund.",
      "**Uf de Charte prüefti Läuf.** Jede Lauf, wo gröschteteils meh als 60 m vom Wasser wäg liit, isch uf ere Charte aagluegt worde: 49 Ufnahme mit Läuf klar a Land, 22 uf schmalem Wasser, wo d Wassercharte nöd kännt (Kanäl, Flüss, es Becki).",
      "**Was Fahrer sälber usegnoh händ.** Abschnitt, wo Fahrer us ihrne eigene Sessions usegnoh händ — 234 Minute devo —, sind öppe s ehrlichschte Label, wos git.",
      "**Ufnahme ganz ohni Pumpfoile.** Spaziergäng und Autofahrte, mit de Uhr ufgnoh, mit Absicht oder us Versehe.",
      "**Was en Fahrer sälber verzellt hät.** De langsam Pumper vo obe: mer händ all sini Läuf, samt de langsame Teil nach de alte Gränze, als Biispiil für ächts Pumpe gnoh.",
    ],
    p2:
      "Jedes Resultat undedra isch a Fahrer gmässe, wo s Modell **bim Training nie gseh hät**. Föifmal hinderenand wird es Föiftel vo de Fahrer zruggbhalte, s Modell lärnt vom Räscht und wird nume a dene beurteilt, wos nöd kännt. Susch lärnt es Modell eifach d Lüüt uswändig, und d Zahle lüüged.",
  },

  features: {
    h: "Was s Modell z gseh überchunnt",
    p:
      "S alt Modell hät 14 Zahle pro Sekunde aagluegt, meischtens zur Stärchi vo de Handglänk-Bewegig. S nöi gseht 42. Di wichtigschte devo:",
    li: [
      "**Di drü Achse gäge d Schwärchraft, einzeln.** S alt Modell hät nume d Gsamtstärchi vo de Bewegig gseh, und dänn isch ihri Richtig wäg. Pumpe bewegt s Handglänk uf und ab; balanciere, lauffe und stüüre bewegeds sitlich. Gäge d Schwärchraft ufteilt, gsehnd die sich nüme ähnlich.",
      "**De Rhythmus.** Wie vill vo de Bewegig im Pump-Band liit (0,8–2,2 Hz), wie vill im Lauf-Band (2,2–3,5 Hz), wie vill Vibration isch (5–12 Hz, Strass und Motor) und wie spitzig si isch.",
      "**D Minute ringsum.** S höchscht Tempo innerhalb vo ±60 s und wie vill vo dere Minute schnäller als 40 km/h gsi isch. En Lauf grad näbe ere Autofahrt isch scho nume vom Zämehang här verdächtig.",
      "**Tempo-Verlauf.** Gaht s Tempo ufe, während de Arm ruhig isch, tribt no öppis s Board aa — hüüfig d Bei.",
      "**Wie d Uhr ghalte wird** — meh dezue wiiter unde, will die Idee vo emne Fahrer cho isch, wo sich e Session aagluegt hät.",
    ],
  },

  honest: {
    h: "S Modell nöd di alte Regle lah abschriibe",
    p:
      "De gröscht Huufe Trainingsbiispiil sind d Läuf, wo di alt Erkennig gfunde hät. Das isch nützlich — di meischte devo sind ächt —, hät aber en Haagge: di alte Laufgränze chömed vo Tempo-Gränze, also lärnt es Modell, wo druf trainiert isch, gnau die Tempo-Gränze wider zrugg. De langsam Pumper hät d Falle sichtbar gmacht: es Modell, won en nie gseh hät, hät nume es Viertel vo sim langsame Pumpe gfunde.",
    p2:
      "Drum zelled di drü Sekunde am Aafang und am Änd vo jedem alte Lauf gar nüme als Biispiil, und di unabhängige Wahrheite (Händy am Board, Charte-Prüefig, was Fahrer sälber usegnoh händ, d Lauf- und Autofahrt-Ufnahme) zelled es Mehrfachs vo emne Lauf, wo di alt Erkennig zuefällig gfunde hät. Und dänn händ mer gfrööget, öb meh Date öppis brächtid. Nei: s Modell, trainiert uf 4 Fahrer, isch scho nöch dra, und ab öppe **64 Fahrer** wirds überhaupt nüme besser. Meh Sessions vo de gliiche Sorte fehled nöd — besseri Wahrheit fehlt.",
    cap: "Lärnkurve: trainiert uf 1 bis 258 Fahrer, immer teschtet a Fahrer, wos nie gseh hät.",
  },

  pipeline: {
    h: "Vo ere Wahrschinlichkeit zu Läuf",
    p:
      "S Modell git e Wahrschinlichkeit pro Sekunde us. Drus Läuf z mache, hät sich als gnau so wichtig usegstellt wie s Modell sälber. Di erscht Idee — eifach s Modell statt de Tempo-Gränze näh — hät tuusigi winzigi Extra-Läuf produziert, wo di andere Wahrheite nöd bestätigt händ. Was funktioniert, isch e Chetti us chliine, prüefbare Schritt:",
    li: [
      "**Grosszügig aafange.** D Läuf näh, wo di alt Erkennig findet, *und* d Läuf, wo fascht ganz ohni Tempo-Gränze gfunde wärded. Zäme händ die jede Lauf drin, wo überhaupt eine chönnt sii.",
      "**In sicheri Stückli schniide.** Jede Kandidat det teile, wo s Modell unsicher isch, und churzi Iibrüch vo es paar Sekunde überbrugge.",
      "**Jedes Stückli beurteile.** Es Stückli, wo d mittler Wahrschinlichkeit z tüüf isch, flüügt use.",
      "**Sträng mit de ganz churze.** Es Stückli under 8 Sekunde blibt nume, wänn sich s Modell klar sicher isch — di meischte churze Stückli sind d Räscht vo emne Spaziergang am Ufer.",
    ],
    p2:
      "D Riiefolg isch wichtiger, als mer meint. Zerscht ganzi Kandidate beurteile und dänn schniide hät ächti Läuf wäggrüehrt, sobald en Spaziergang und e Fahrt zu eim lange Stück zämegwachse gsi sind; zerscht schniide und dänn jedes Stückli beurteile bhaltet si. Und d **Erkennigs-Empfindlichkeit i dim Profil** bhaltet iri Bedüütig: statt Tempo-Gränze z lockere, macht si jetzt d Schwälle vom Modell strenger oder lockerer.",
  },

  watch: {
    h: "Wie d Uhr sitzt — e Idee vom Strand",
    p:
      "Bim Aaluege vo ere Session mit mehrere zwiifelhafte Läuf bi emne Steg hät de Jan e Ahnig gha: *wänn du uf em Foil bisch, sitzt d Uhr di ganz Ziit gliich; wänn du lauffsch, nöd.* Mer händ das über jedi Ufnahm gmässe, wo mer d Antwort kännd. Im Vergliich mit de andere sichere Läuf vom gliiche Fahrer i dere Session sitzt d Uhr imne ächte Lauf innerhalb vo **5°** so wie vorher (Median). Lauffe und Träge a Land: **72°**. Läuf a Land: **75°**. D Fahrte mit em Händy am Board bestätigeds unabhängig: 3–7° bim Fahre, 39–91° bim Lauffe zum Auto.",
    cap1: "De Winkel vo de Uhr, verglichen mit de andere Läuf vom gliiche Fahrer i dere Session.",
    p2:
      "Di zweit Hälfti vo de Idee — Lauffe isch unruhig, es Auto extrem — hät sich grad umgekehrt usegstellt, und das isch s Schöne am Mässe. Über zäh Sekunde sind Lauffe und im Auto Sitze **völlig ruhig**: de Arm hanget, d Händ liged am Stüür. Was en Lauf abhebt, isch, dass d Uhr i ihrer Hauptrichtig ruhig isch **und** sich trotzdem um si dreiht: öppe **29° pro Sekunde**, will s Handglänk bi jedem Pump mitdreiht, gäge 7° pro Sekunde bim Lauffe oder Autofahre.",
    cap2: "Links: Rueh ellei trännt gar nüüt. Rächts: ruhig und dreiend gliichziitig — so gseht en Lauf us.",
    p3:
      "Werum kei harti Regle drus mache? Händ mer probiert. D Fahrer sind z verschiede: eine pumpt mit emne bockstarche Handglänk, en andere — mit churze Läuf — gseht nach dem Mass fascht us wie öpper, wo lauft, und Fahrer, wo mitten i de Session d Fuessstellig wächsled, händ d Uhr i jedem zweite Lauf andersch. Als Regle hät si ächti Fahrte wäggrüehrt, wo s Händy am Board bestätigt hät. Als **drü zuesätzlichi Iigabe fürs Modell** hilft si, und det blibt si.",
  },

  result: {
    h: "Was sich änderet",
    p:
      "Gmässe über 2.648 Ufnahme mit Bewegigsdate, jede Fahrer wie obe beschribe zruggbhalte:",
    cap: "Läuf, wo nöd sötted zelle — alti Erkennig gäge nöii.",
    li: [
      "**Läuf a Land** (Charte-Prüefig): 81 vo 82 no zellt → **19**. Mehreri vo de übrige sind GPS-Fähler am Ufer, wo de Arm klar pumpt — null isch also nöd s richtig Ziil.",
      "**Churzi Läuf näbe ere Autofahrt:** 25 → **1**.",
      "**Läuf i Abschnitt, wo Fahrer usegnoh gha händ:** 73 → **24**.",
      "**Gäge s Händy am Board:** vo de Sekunde, wo d Uhr als On-Foil wärtet, händ 87,2 % gstimmt → **92,2 %**. Vo de Sekunde, wo würkli uf em Foil gsi sind, findet si 93 % (vorher: 95 %) — es bitzeli devo isch de Priis defür, dass zwiifelhafti Laufränder abgschnitte wärded.",
      "**De langsam Pumper:** 22 → **26 Minute**, und das, ohni dass s Modell en je gseh hät.",
      "**Rekord:** d Parkplatz-Rundi verschwindet us de Tempo-Rekord, en Lauf uf de Strass näbe emne Fluss us de Strecki- und Düür-Rekord.",
    ],
  },

  failed: {
    h: "Was nöd funktioniert hät",
    p: "Zur Ehrlichkeit ghört, dass mer au d Sackgasse ufschribt:",
    li: [
      "**S Modell ellei, statt de Tempo-Gränze:** tuusigi zuesätzlichi Mini-Läuf, di meischte devo nöd bestätigt.",
      "**Es grössers Modell** (doppelt so vill Bäum, doppelt so vill Blätter): überhaupt nöd besser.",
      "**D Trainingsdate mit de Wassercharte putze:** weniger Land-Läuf, aber en Hafe, wo d Charte nöd als Wasser kännt, hät de langsam Pumper sini Biispiil koschtet.",
      "**Harti Regle, wie d Uhr ghalte wird:** die verwütsched Spaziergäng — und ächti Fahrte grad mit.",
      "**Gleitphase erkänne:** d Fahrte mit em Händy am Board händ nume 31 Sekunde ächts Gleite drin — d Fahrer händ fascht di ganz Ziit pumpt. No nöd mässbar.",
    ],
  },

  status: {
    h: "Live sit em 30. Septämber 2026 — was sich gänderet hät",
    p:
      "Vor em Iischalte isch di komplett Analyse — Läuf, Pumps, Gleitphase, Rekord und alles — als Regressionstescht über jedi Ufnahm mit Bewegigsdate gloffe, näbe de gspeicherete Resultat und ohni eis devo aazrüehre. Si hät di hüt gspeicherete Zahle exakt für 2.724 vo 2.743 Ufnahme reproduziert (de Räscht isch mit älterem Code gspeicheret gsi), de Tescht hät also gmässe, was er behauptet. Dänach isch jedi vo de 2.743 Ufnahme mit de nöie Erkennig nöi berächnet worde:",
    li: [
      "**Läuf:** 18.765 → **19.336** (+3 %) — es paar Land- und Auto-Läuf weniger, meh langsami Fortsetzige und churzi ächti Läuf.",
      "**Foil-Ziit:** 235,9 h → **242,9 h** (+3 %). **Strecki:** 3.507 km → **3.558 km**. **Pumps:** 1.340.913 → **1.375.236**.",
      "**Ufnahme, wo nüme als Pumpfoile zelled:** 16 — di meischte devo uf de Charte bestätigti Läuf a Land, de Räscht je es Handvoll Sekunde; 8 anderi zelled jetzt zum erste Mal.",
      "**Tempo-Rekord:** vier Iiträg sind us de ewige Top Ten gheit, und alli vier sind Läuf a Land gsi — d Parkplatz-Rundi au dezue. D Strecki- und Düür-Rekord händ sich a de Laufränder um Sekunde und Meter verschobe, meh nöd.",
    ],
    p2: "Was du i dine eigene Sessions gsehsch:",
    li2: [
      "**Vo de Erkennig ussortierti Läuf** stönd under de Lauf-Tabälle mit em Grund, und en Tipp holt en Lauf zrugg, wänn d Erkennig dernäbe glääge isch. En Lauf, wo du zrugggholt oder sälber usegnoh häsch, überstimmt kei spöters Modell — dini Entscheidig gwünnt immer.",
      "**D Erkennigs-Empfindlichkeit i dim Profil** leit jetzt fescht, wie sträng s Modell isch: *Standard*, *Empfindlicher* und *Am empfindlichste* bhalted immer meh vo de zwiifelhafte und churze Stückli. Di alte Tempo-Gränze gälted au wiiterhin, entscheided aber nüme ellei.",
      "**Nöii Ufnahme** wärded mit de nöie Erkennig analysiert, sobald de Upload fertig isch; di vorläufige Zahle während em Upload chömed no vo de bisherige Erkennig.",
    ],
  },

  help: {
    h: "Wie du chasch hälfe: Uhr und Händy zäme",
    p:
      "S Wärtvollscht für de nächscht Schritt sind nöd meh Sessions — es sind **meh Sessions, wo doppelt uf eimal ufgnoh worde sind**: d Uhr am Handglänk wie immer und es Händy am Board feschtgurtet, wo di gliich Fahrt ufnimmt ([Teil 4](/nerd-analysen-4) zeigt s Setup; es isch en Gurt und en Dry Bag). Jedi settig Fahrt seit üs Sekunde für Sekunde, was s Board würkli gmacht hät — und hüt chunnt die Wahrheit vo nume zwei Fahrer. Bsunders hilfriich:",
    li: [
      "**Fahrer, wo andersch pumped** — langsam und gliichmässig, mit de Bei, mit ruhigem Arm. Gnau die Stil gseht d Erkennig am sältenschte.",
      "**Gleitphase.** Fahrte, wo du ufepumpsch und dänn es paar Sekunde gleitisch, bevor du wider pumpsch. Devo händ mer fascht nüüt.",
      "**Alles rund um d Fahrt.** Zum Wasser lauffe, usepaddle, am Steg staa, s Board zruggträge — lass d Ufnahm eifach laufe.",
      "**Anderi Uhre.** Jedes Uhremodell bewegt sich es bitzeli andersch am Handglänk.",
    ],
    p2:
      "Zum mit em Händy ufneh, schalt i dim Profil de Händy-Recorder ii, start en am Händy und a de Uhr, bevor du ufs Board gahsch, und stopp dänach beidi. Beidi Ufnahme tauched wie gwohnt i dine Sessions uf; mer leged si ziitlich übereinand, du muesch also susch nüüt mache.",
  },
};

const fr: N5 = {
  back: "← Partie 4 : Un téléphone collé à la planche",
  h1: "Partie 5 : Modèle de détection",
  subtitle: "Une nouvelle détection on-foil, construite à partir de tout ce que les riders nous ont appris — et là où elle a encore besoin de toi",
  intro:
    "Tout ce que ce site compte — runs, temps sur le foil, distance, pumps, records — part d'une seule décision par seconde : **cette personne est-elle sur le foil en ce moment ?** Si cette décision est fausse, chaque nombre qui en découle l'est aussi. La détection actuelle marche bien pour la plupart des sessions, mais ces dernières semaines des riders nous ont montré exactement où elle casse. Cette partie raconte comment nous avons reconstruit cette décision de zéro, mesurée contre chaque élément de vérité dont nous disposons, et elle se termine par une demande : nous avons besoin de plus de sessions enregistrées avec une montre au poignet **et** un téléphone sur la planche en même temps.",

  problem: {
    h: "Là où l'ancienne détection se trompe",
    p:
      "La détection actuelle combine des seuils de vitesse (un run commence au-dessus d'une vitesse et se termine en dessous d'une autre) avec un modèle entraîné qui regarde le mouvement du poignet. Trois types d'erreurs revenaient sans cesse :",
    li: [
      "**Des runs sur la terre ferme.** Quelques secondes de marche rapide le long de la rive, la planche ramenée au ponton, un petit trot jusqu'à la voiture — à la bonne vitesse et avec le bras qui balance, ça peut passer pour un run. Un tour de parking à 30 km/h a même fini dans les records de vitesse.",
      "**Des runs à côté d'un trajet en voiture.** On oublie d'arrêter l'enregistrement, on rentre en voiture, et les premières secondes du trajet peuvent ressembler à un run.",
      "**Les pompeurs lents coupés trop tôt.** Un rider qui pompe lentement et régulièrement nous a dit qu'il manquait presque la moitié de ses runs. Il avait raison : il continue de pomper à 5–10 km/h au-delà du point où l'ancien seuil de vitesse termine le run.",
    ],
  },

  truth: {
    h: "Contre quoi nous pouvons vérifier",
    p:
      "Une détection ne vaut que ce contre quoi on la mesure, et le raccourci tentant — mesurer la nouvelle détection contre l'ancienne — n'apprend qu'à recopier les anciennes erreurs. Nous avons donc rassemblé chaque élément de vérité indépendant que nous avons pu trouver :",
    li: [
      "**Le téléphone sur la planche** ([Partie 4](/nerd-analysen-4)). Enregistré en même temps qu'une montre au poignet, il dit seconde par seconde si la planche était pompée — sans rien deviner à partir du bras. Six sessions remplissent les conditions pour l'instant, deux riders, environ 2,5 heures.",
      "**Des runs vérifiés sur la carte.** Chaque run situé en grande partie à plus de 60 m de l'eau a été examiné sur une carte : 49 enregistrements avec des runs clairement sur la terre ferme, 22 sur des eaux étroites que la carte de l'eau ne connaît pas (canaux, rivières, une piscine).",
      "**Ce que les riders ont eux-mêmes retiré.** Les passages que des riders ont enlevés de leurs propres sessions — 234 minutes au total — sont à peu près l'étiquette la plus honnête qui soit.",
      "**Des enregistrements sans aucun pumpfoil.** Des marches et des trajets en voiture enregistrés avec une montre, exprès ou par accident.",
      "**Le témoignage d'un rider.** Le pompeur lent ci-dessus : nous avons utilisé tous ses runs, y compris les parties lentes après l'ancienne coupure, comme exemples de vrai pump.",
    ],
    p2:
      "Chaque résultat ci-dessous est mesuré sur des riders que le modèle **n'a jamais vus pendant l'entraînement**. Cinq fois de suite, un cinquième des riders est mis de côté, le modèle apprend sur les autres, et il n'est jugé que sur ceux qu'il n'a pas rencontrés. Sinon un modèle apprend tout simplement les personnes, et les chiffres mentent.",
  },

  features: {
    h: "Ce que le modèle a le droit de voir",
    p:
      "L'ancien modèle regardait 14 nombres par seconde, surtout sur l'ampleur du mouvement du poignet. Le nouveau en voit 42. Ceux qui ont le plus compté :",
    li: [
      "**Les trois axes par rapport à la gravité, séparément.** L'ancien modèle ne voyait que l'ampleur totale du mouvement, ce qui jette sa direction. Pomper fait monter et descendre le poignet ; l'équilibre, la marche et le pilotage le déplacent latéralement. Séparés par rapport à la gravité, ces mouvements cessent de se ressembler.",
      "**Le rythme.** Quelle part du mouvement se trouve dans la bande de pump (0,8–2,2 Hz), quelle part dans la bande de marche (2,2–3,5 Hz), quelle part est de la vibration (5–12 Hz, route et moteur), et à quel point il est saccadé.",
      "**La minute autour.** La vitesse la plus élevée dans ±60 s, et quelle part de cette minute était au-dessus de 40 km/h. Un run juste à côté d'un trajet en voiture est suspect par le seul contexte.",
      "**La tendance de vitesse.** Une vitesse qui monte alors que le bras est calme signifie que quelque chose continue de propulser la planche — souvent les jambes.",
      "**La façon dont la montre est tenue** — nous y revenons plus bas, parce que cette idée est venue d'un rider qui regardait une session.",
    ],
  },

  honest: {
    h: "Empêcher le modèle de recopier les anciennes règles",
    p:
      "La plus grosse pile d'exemples d'entraînement, ce sont les runs que l'ancienne détection a trouvés. C'est utile — la plupart sont réels — mais il y a un piège : les bords des anciens runs viennent des seuils de vitesse, donc un modèle entraîné dessus réapprend ces seuils de vitesse. Le pompeur lent a rendu le piège visible : un modèle qui ne l'avait jamais vu ne trouvait qu'un quart de son pump lent.",
    p2:
      "Du coup, les trois secondes au début et à la fin de chaque ancien run ne comptent plus du tout comme exemples, et les vérités indépendantes (téléphone sur la planche, vérification sur la carte, retraits faits par les riders eux-mêmes, enregistrements de marche et de voiture) comptent plusieurs fois plus qu'un run que l'ancienne détection a trouvé par hasard. Puis nous nous sommes demandé si plus de données aideraient. Non : le modèle entraîné sur 4 riders est déjà proche, et à partir d'environ **64 riders** il ne s'améliore plus du tout. Ce qui manque, ce ne sont pas davantage de sessions du même genre — c'est une meilleure vérité.",
    cap: "Courbe d'apprentissage : entraîné sur 1 à 258 riders, toujours testé sur des riders qu'il n'avait jamais vus.",
  },

  pipeline: {
    h: "D'une probabilité à des runs",
    p:
      "Le modèle donne une probabilité par seconde. Transformer ça en runs s'est révélé aussi important que le modèle lui-même. La première idée — utiliser simplement le modèle à la place des seuils de vitesse — a produit des milliers de minuscules runs supplémentaires que les autres vérités ne confirmaient pas. Ce qui marche, c'est une chaîne de petites étapes vérifiables :",
    li: [
      "**Commencer large.** Prendre les runs que l'ancienne détection trouve *et* ceux trouvés avec presque aucun seuil de vitesse. Ensemble, ils contiennent chaque run qui pourrait en être un.",
      "**Découper en morceaux sûrs.** Couper chaque candidat là où le modèle hésite, en enjambant les courtes baisses de quelques secondes.",
      "**Juger chaque morceau.** Un morceau dont la probabilité moyenne est trop basse est écarté.",
      "**Être strict avec les très courts.** Un morceau de moins de 8 secondes ne reste que si le modèle est clairement sûr — la plupart des morceaux courts sont les restes d'une marche le long de la rive.",
    ],
    p2:
      "L'ordre compte plus qu'on ne le croirait. Juger d'abord les candidats entiers puis découper jetait de vrais runs chaque fois qu'une marche et une session s'étaient fondues en un seul long passage ; découper d'abord et juger chaque morceau les garde. Et le **réglage de sensibilité dans ton profil** garde son sens : au lieu d'assouplir les seuils de vitesse, il rend désormais les seuils du modèle plus ou moins stricts.",
  },

  watch: {
    h: "Comment la montre est posée — une idée venue de la plage",
    p:
      "En regardant une session avec plusieurs runs douteux près d'un ponton, Jan a eu une intuition : *quand tu es sur le foil, la montre reste orientée pareil tout le temps ; quand tu marches, non.* Nous l'avons mesuré sur chaque enregistrement dont nous connaissons la réponse. Comparée aux autres runs sûrs du même rider dans cette session, la montre dans un vrai run reste à **5°** près de sa position d'avant (médiane). Marche et portage sur la terre ferme : **72°**. Runs sur la terre ferme : **75°**. Les sessions avec téléphone sur la planche le confirment de façon indépendante : 3–7° en ridant, 39–91° en marchant jusqu'à la voiture.",
    cap1: "L'angle de la montre comparé aux autres runs du même rider dans cette session.",
    p2:
      "La deuxième moitié de l'idée — la marche est agitée, une voiture est extrême — s'est révélée être l'inverse, et c'est tout le plaisir de mesurer. Sur dix secondes, la marche et la position assise en voiture sont **parfaitement stables** : le bras pend, les mains reposent sur le volant. Ce qui distingue un run, c'est que la montre est stable dans sa direction principale **et** continue de tourner autour : environ **29° par seconde** parce que le poignet pivote à chaque pump, contre 7° par seconde en marchant ou en conduisant.",
    cap2: "À gauche : la stabilité seule ne sépare rien. À droite : stable et en rotation en même temps, voilà à quoi ressemble un run.",
    p3:
      "Pourquoi ne pas en faire une règle stricte ? Nous avons essayé. Les riders diffèrent trop : l'un pompe avec un poignet parfaitement immobile, un autre — avec des runs courts — ressemble, selon cette mesure, presque à quelqu'un qui marche, et les riders qui changent de pied en cours de session tiennent la montre différemment un run sur deux. En tant que règle, ça jetait de vraies sessions que le téléphone sur la planche avait confirmées. En tant que **trois entrées supplémentaires pour le modèle**, ça aide, et c'est là que ça reste.",
  },

  result: {
    h: "Ce qui change",
    p:
      "Mesuré sur 2 648 enregistrements avec données de mouvement, chaque rider mis de côté comme décrit plus haut :",
    cap: "Runs qui ne devraient pas être comptés — ancienne détection contre nouvelle.",
    li: [
      "**Runs sur la terre ferme** (vérification sur la carte) : 81 sur 82 encore comptés → **19**. Plusieurs des restants sont des erreurs GPS près de la rive où le bras pompe clairement, donc zéro n'est pas le bon objectif.",
      "**Runs courts à côté d'un trajet en voiture :** 25 → **1**.",
      "**Runs dans des passages que les riders avaient retirés :** 73 → **24**.",
      "**Contre le téléphone sur la planche :** des secondes que la montre déclare on-foil, 87,2 % l'étaient → **92,2 %**. Des secondes réellement sur le foil, elle en trouve 93 % (avant : 95 %) — une petite partie de ça est le prix de la coupe des bords de run douteux.",
      "**Le pompeur lent :** 22 → **26 minutes**, et ce sans que le modèle l'ait jamais vu.",
      "**Records :** le tour de parking disparaît des records de vitesse, un run sur la route à côté d'une rivière des records de distance et de durée.",
    ],
  },

  failed: {
    h: "Ce qui n'a pas marché",
    p: "Faire ça honnêtement, c'est aussi noter les impasses :",
    li: [
      "**Le modèle seul, à la place des seuils de vitesse :** des milliers de micro-runs supplémentaires, la plupart non confirmés.",
      "**Un modèle plus gros** (deux fois plus d'arbres, deux fois plus de feuilles) : pas mieux du tout.",
      "**Nettoyer les données d'entraînement avec la carte de l'eau :** moins de runs sur la terre ferme, mais un port que la carte ne connaît pas comme de l'eau a coûté ses exemples au pompeur lent.",
      "**Des règles strictes sur la façon dont la montre est tenue :** elles attrapent les marches, et de vraies sessions avec.",
      "**Reconnaître les glisses :** les sessions avec téléphone sur la planche ne contiennent que 31 secondes de vraie glisse — les riders ont pompé presque tout le temps. Pas encore mesurable.",
    ],
  },

  status: {
    h: "En ligne depuis le 30 septembre 2026 — ce qui a changé",
    p:
      "Avant de l'activer, l'analyse complète — runs, pumps, glisses, records et tout le reste — a tourné comme test de régression sur chaque enregistrement avec données de mouvement, à côté des résultats stockés et sans en modifier aucun. Elle a reproduit exactement les chiffres stockés actuels pour 2 724 des 2 743 enregistrements (les autres avaient été stockés avec du code plus ancien), donc le test mesurait bien ce qu'il prétendait mesurer. Ensuite, chacun des 2 743 enregistrements a été recalculé avec la nouvelle détection :",
    li: [
      "**Runs :** 18 765 → **19 336** (+3 %) — quelques runs sur la terre ferme et en voiture en moins, davantage de prolongations lentes et de vrais runs courts.",
      "**Temps sur le foil :** 235,9 h → **242,9 h** (+3 %). **Distance :** 3 507 km → **3 558 km**. **Pumps :** 1 340 913 → **1 375 236**.",
      "**Enregistrements qui ne comptent plus comme pumpfoil :** 16 — la plupart des runs sur la terre ferme confirmés sur la carte, le reste quelques secondes chacun ; 8 autres comptent désormais pour la première fois.",
      "**Records de vitesse :** quatre entrées ont quitté le top dix de tous les temps, et toutes les quatre étaient des runs sur la terre ferme — dont le tour de parking. Les records de distance et de durée ont bougé de quelques secondes et quelques mètres aux bords des runs, rien de plus.",
    ],
    p2: "Ce que tu vois dans tes propres sessions :",
    li2: [
      "**Les runs écartés par la détection** sont listés sous le tableau des runs avec la raison, et un seul tap ramène un run si la détection s'est trompée. Un run que tu as ramené, ou retiré toi-même, n'est jamais contredit par un modèle ultérieur — ta décision l'emporte toujours.",
      "**Le réglage de sensibilité dans ton profil** fixe désormais à quel point le modèle est strict : *Standard*, *Plus sensible* et *Le plus sensible* gardent de plus en plus de morceaux douteux et courts. Les anciens seuils de vitesse s'appliquent toujours aussi, mais ils ne décident plus seuls.",
      "**Les nouveaux enregistrements** sont analysés avec la nouvelle détection dès que l'upload est terminé ; les chiffres provisoires pendant l'upload viennent encore de la détection précédente.",
    ],
  },

  help: {
    h: "Comment tu peux aider : montre et téléphone ensemble",
    p:
      "La chose la plus précieuse pour la prochaine étape, ce n'est pas plus de sessions — c'est **plus de sessions enregistrées deux fois à la fois** : la montre au poignet comme toujours, et un téléphone sanglé sur la planche qui enregistre la même session ([Partie 4](/nerd-analysen-4) montre le montage ; c'est une sangle et un sac étanche). Chacune de ces sessions nous dit, seconde par seconde, ce que la planche faisait vraiment — et aujourd'hui cette vérité ne vient que de deux riders. Particulièrement utile :",
    li: [
      "**Des riders qui pompent autrement** — lentement et régulièrement, avec les jambes, avec un bras calme. Ce sont exactement les styles que la détection voit le moins.",
      "**Des glisses.** Des sessions où tu prends de la vitesse en pompant puis glisses quelques secondes avant de pomper à nouveau. Nous n'en avons presque aucune.",
      "**Tout ce qui entoure la session.** Marcher jusqu'à l'eau, ramer vers le large, attendre au ponton, ramener la planche — laisse l'enregistrement tourner.",
      "**D'autres montres.** Chaque modèle de montre bouge un peu différemment au poignet.",
    ],
    p2:
      "Pour enregistrer avec le téléphone, active l'enregistreur téléphone dans ton profil, démarre-le sur le téléphone et sur la montre avant de monter sur la planche, et arrête les deux ensuite. Les deux enregistrements apparaissent dans tes sessions comme d'habitude ; nous les alignons dans le temps, il n'y a donc rien d'autre à faire.",
  },
};

const it: N5 = {
  back: "← Parte 4: Un telefono incollato alla tavola",
  h1: "Parte 5: Modello di rilevamento",
  subtitle: "Un nuovo rilevamento on-foil, costruito su tutto ciò che i rider ci hanno raccontato — e dove ha ancora bisogno di te",
  intro:
    "Tutto ciò che questo sito conta — run, tempo sul foil, distanza, pump, record — parte da una sola decisione al secondo: **questa persona è sul foil in questo momento?** Se quella decisione è sbagliata, lo è anche ogni numero che ne segue. Il rilevamento attuale funziona bene per la maggior parte delle sessioni, ma nelle ultime settimane i rider ci hanno mostrato esattamente dove si rompe. Questa parte racconta come abbiamo ricostruito quella decisione da zero, misurata contro ogni pezzo di verità che abbiamo, e si chiude con una richiesta: ci servono più sessioni registrate con un orologio al polso **e** un telefono sulla tavola contemporaneamente.",

  problem: {
    h: "Dove sbaglia il vecchio rilevamento",
    p:
      "Il rilevamento attuale combina limiti di velocità (un run inizia sopra una velocità e finisce sotto un'altra) con un modello addestrato che guarda il movimento del polso. Tre tipi di errore tornavano di continuo:",
    li: [
      "**Run sulla terraferma.** Qualche secondo di camminata svelta lungo la riva, la tavola riportata al pontile, una corsetta fino alla macchina — alla velocità giusta e con il braccio che oscilla, può passare per un run. Un giro in un parcheggio a 30 km/h è persino finito nei record di velocità.",
      "**Run accanto a un tragitto in auto.** Ti dimentichi di fermare la registrazione, torni a casa in macchina, e i primi secondi del tragitto possono sembrare un run.",
      "**Pompatori lenti tagliati corti.** Un rider che pompa in modo lento e costante ci ha detto che ai suoi run mancava quasi la metà. Aveva ragione: continua a pompare a 5–10 km/h oltre il punto in cui il vecchio limite di velocità chiude il run.",
    ],
  },

  truth: {
    h: "Contro cosa possiamo verificare",
    p:
      "Un rilevamento è buono solo quanto ciò contro cui lo misuri, e la scorciatoia allettante — misurare il nuovo rilevamento contro il vecchio — insegna solo a copiare i vecchi errori. Così abbiamo raccolto ogni pezzo di verità indipendente che siamo riusciti a trovare:",
    li: [
      "**Il telefono sulla tavola** ([Parte 4](/nerd-analysen-4)). Registrato insieme a un orologio al polso, dice secondo per secondo se la tavola veniva pompata — senza indovinare dal braccio. Per ora sei uscite soddisfano i requisiti, due rider, circa 2,5 ore.",
      "**Run controllati sulla mappa.** Ogni run che si trova per lo più a più di 60 m dall'acqua è stato guardato su una mappa: 49 registrazioni con run chiaramente sulla terraferma, 22 su acque strette che la mappa dell'acqua non conosce (canali, fiumi, una piscina).",
      "**Ciò che i rider hanno tolto da soli.** I tratti che i rider hanno rimosso dalle proprie sessioni — 234 minuti in tutto — sono un'etichetta onesta quanto può esserlo.",
      "**Registrazioni senza alcun pumpfoil.** Camminate e tragitti in auto registrati con un orologio, di proposito o per sbaglio.",
      "**Il racconto di un rider.** Il pompatore lento di cui sopra: abbiamo usato tutti i suoi run, comprese le parti lente dopo il vecchio taglio, come esempi di vero pump.",
    ],
    p2:
      "Ogni risultato qui sotto è misurato su rider che il modello **non ha mai visto durante l'addestramento**. Per cinque volte, un quinto dei rider viene tenuto da parte, il modello impara dagli altri e viene giudicato solo su quelli che non ha incontrato. Altrimenti un modello impara semplicemente le persone, e i numeri mentono.",
  },

  features: {
    h: "Cosa può vedere il modello",
    p:
      "Il vecchio modello guardava 14 numeri al secondo, per lo più sull'ampiezza del movimento del polso. Quello nuovo ne vede 42. Quelli che contavano di più:",
    li: [
      "**I tre assi rispetto alla gravità, separatamente.** Il vecchio modello vedeva solo l'ampiezza totale del movimento, che ne butta via la direzione. Pompare muove il polso su e giù; stare in equilibrio, camminare e sterzare lo muovono di lato. Separati rispetto alla gravità, smettono di sembrare uguali.",
      "**Il ritmo.** Quanta parte del movimento sta nella banda di pump (0,8–2,2 Hz), quanta nella banda della camminata (2,2–3,5 Hz), quanta è vibrazione (5–12 Hz, strada e motore), e quanto è a scatti.",
      "**Il minuto attorno.** La velocità più alta entro ±60 s, e quanta parte di quel minuto era sopra i 40 km/h. Un run proprio accanto a un tragitto in auto è sospetto già per il contesto.",
      "**Andamento della velocità.** Velocità in aumento mentre il braccio è calmo significa che qualcosa sta ancora spingendo la tavola — spesso le gambe.",
      "**Come è tenuto l'orologio** — ne parliamo più sotto, perché quell'idea è venuta da un rider che guardava una sessione.",
    ],
  },

  honest: {
    h: "Non lasciare che il modello copi le vecchie regole",
    p:
      "Il mucchio più grande di esempi di addestramento sono i run trovati dal vecchio rilevamento. È utile — la maggior parte sono veri — ma nasconde una trappola: i bordi dei vecchi run vengono dai limiti di velocità, quindi un modello addestrato su di essi reimpara quei limiti di velocità. Il pompatore lento ha reso visibile la trappola: un modello che non l'aveva mai visto trovava solo un quarto del suo pump lento.",
    p2:
      "Perciò i tre secondi all'inizio e alla fine di ogni vecchio run non contano più affatto come esempi, e le verità indipendenti (telefono sulla tavola, controllo sulla mappa, rimozioni fatte dai rider stessi, le registrazioni di camminate e tragitti in auto) contano parecchie volte più di un run che il vecchio rilevamento ha trovato per caso. Poi ci siamo chiesti se più dati aiuterebbero. No: il modello addestrato su 4 rider è già vicino, e da circa **64 rider** in su non migliora affatto. Non mancano altre sessioni dello stesso tipo — manca una verità migliore.",
    cap: "Curva di apprendimento: addestrato su 1 fino a 258 rider, sempre testato su rider mai visti prima.",
  },

  pipeline: {
    h: "Da una probabilità ai run",
    p:
      "Il modello dà una probabilità al secondo. Trasformarla in run si è rivelato importante quanto il modello stesso. La prima idea — usare semplicemente il modello al posto dei limiti di velocità — ha prodotto migliaia di minuscoli run in più che le altre verità non confermavano. Ciò che funziona è una catena di piccoli passi verificabili:",
    li: [
      "**Partire larghi.** Prendere i run che trova il vecchio rilevamento *e* quelli trovati quasi senza limite di velocità. Insieme contengono ogni run che potrebbe esserlo.",
      "**Tagliare in pezzi sicuri.** Dividere ogni candidato dove il modello è incerto, scavalcando brevi cali di pochi secondi.",
      "**Giudicare ogni pezzo.** Un pezzo con probabilità media troppo bassa viene scartato.",
      "**Essere severi con quelli molto corti.** Un pezzo sotto gli 8 secondi resta solo se il modello è chiaramente sicuro — la maggior parte dei pezzi corti sono i resti di una camminata lungo la riva.",
    ],
    p2:
      "L'ordine conta più di quanto si pensi. Giudicare prima i candidati interi e tagliare dopo buttava via run veri ogni volta che una camminata e un'uscita si erano fuse in un unico lungo tratto; tagliare prima e giudicare ogni pezzo li conserva. E l'**impostazione di sensibilità nel tuo profilo** mantiene il suo significato: invece di allentare i limiti di velocità, ora rende le soglie del modello più o meno severe.",
  },

  watch: {
    h: "Come sta l'orologio — un'idea dalla spiaggia",
    p:
      "Guardando una sessione con diversi run dubbi vicino a un pontile, Jan ha avuto un'intuizione: *quando sei sul foil, l'orologio sta sempre nello stesso modo; quando cammini, no.* L'abbiamo misurato su ogni registrazione di cui conosciamo la risposta. Rispetto agli altri run sicuri dello stesso rider in quella sessione, l'orologio in un run vero resta entro **5°** da come stava prima (mediana). Camminare e trasportare sulla terraferma: **72°**. Run sulla terraferma: **75°**. Le uscite con il telefono sulla tavola lo confermano in modo indipendente: 3–7° in navigazione, 39–91° camminando verso la macchina.",
    cap1: "L'angolo dell'orologio rispetto agli altri run dello stesso rider in quella sessione.",
    p2:
      "La seconda metà dell'idea — camminare è irrequieto, un'auto è estrema — si è rivelata al contrario, ed è il bello di misurare. Su dieci secondi, camminare e stare seduti in macchina sono **perfettamente stabili**: il braccio pende, le mani poggiano sul volante. Ciò che distingue un run è che l'orologio è stabile nella sua direzione principale **e** continua a ruotarci attorno: circa **29° al secondo** perché il polso ruota a ogni pump, contro 7° al secondo camminando o guidando.",
    cap2: "A sinistra: la sola stabilità non separa nulla. A destra: stabile e in rotazione allo stesso tempo, ecco com'è un run.",
    p3:
      "Perché non farne una regola rigida? Ci abbiamo provato. I rider sono troppo diversi: uno pompa con un polso fermo come una roccia, un altro — con run corti — secondo questa misura sembra quasi uno che cammina, e i rider che cambiano piede a metà sessione tengono l'orologio in modo diverso un run sì e uno no. Come regola buttava via uscite vere che il telefono sulla tavola aveva confermato. Come **tre input in più per il modello** aiuta, ed è lì che resta.",
  },

  result: {
    h: "Cosa cambia",
    p:
      "Misurato su 2.648 registrazioni con dati di movimento, ogni rider tenuto da parte come descritto sopra:",
    cap: "Run che non dovrebbero essere contati — vecchio rilevamento contro nuovo.",
    li: [
      "**Run sulla terraferma** (controllo sulla mappa): 81 su 82 ancora contati → **19**. Diversi dei restanti sono errori GPS vicino alla riva dove il braccio sta chiaramente pompando, quindi zero non è l'obiettivo giusto.",
      "**Run corti accanto a un tragitto in auto:** 25 → **1**.",
      "**Run dentro tratti che i rider avevano rimosso:** 73 → **24**.",
      "**Contro il telefono sulla tavola:** dei secondi che l'orologio dichiara on-foil, l'87,2 % lo erano → **92,2 %**. Dei secondi davvero sul foil ne trova il 93 % (prima: 95 %) — una piccola parte è il prezzo del taglio dei bordi dubbi dei run.",
      "**Il pompatore lento:** 22 → **26 minuti**, e senza che il modello l'abbia mai visto.",
      "**Record:** il giro del parcheggio sparisce dai record di velocità, un run sulla strada accanto a un fiume dai record di distanza e di durata.",
    ],
  },

  failed: {
    h: "Cosa non ha funzionato",
    p: "Fare questo lavoro onestamente significa anche annotare i vicoli ciechi:",
    li: [
      "**Il modello da solo, al posto dei limiti di velocità:** migliaia di micro-run in più, la maggior parte non confermati.",
      "**Un modello più grande** (il doppio degli alberi, il doppio delle foglie): per niente migliore.",
      "**Ripulire i dati di addestramento con la mappa dell'acqua:** meno run sulla terraferma, ma un porto che la mappa non conosce come acqua è costato al pompatore lento i suoi esempi.",
      "**Regole rigide su come è tenuto l'orologio:** prendono le camminate, e insieme a loro uscite vere.",
      "**Riconoscere le planate:** le uscite con il telefono sulla tavola contengono solo 31 secondi di vera planata — i rider hanno pompato quasi tutto il tempo. Non ancora misurabile.",
    ],
  },

  status: {
    h: "Attivo dal 30 settembre 2026 — cosa è cambiato",
    p:
      "Prima di attivarla, l'analisi completa — run, pump, planate, record e tutto il resto — è girata come test di regressione su ogni registrazione con dati di movimento, accanto ai risultati salvati e senza modificarne nessuno. Ha riprodotto esattamente i numeri salvati di oggi per 2.724 delle 2.743 registrazioni (le altre erano state salvate con codice più vecchio), quindi il test misurava ciò che dichiarava. Poi ognuna delle 2.743 registrazioni è stata ricalcolata con il nuovo rilevamento:",
    li: [
      "**Run:** 18.765 → **19.336** (+3 %) — qualche run sulla terraferma e in auto in meno, più prosecuzioni lente e run corti veri.",
      "**Tempo sul foil:** 235,9 h → **242,9 h** (+3 %). **Distanza:** 3.507 km → **3.558 km**. **Pump:** 1.340.913 → **1.375.236**.",
      "**Registrazioni che non contano più come pumpfoil:** 16 — la maggior parte run sulla terraferma confermati sulla mappa, il resto pochi secondi ciascuna; altre 8 ora contano per la prima volta.",
      "**Record di velocità:** quattro voci hanno lasciato la top ten di sempre, e tutte e quattro erano run sulla terraferma — tra cui il giro del parcheggio. I record di distanza e durata si sono spostati di secondi e metri ai bordi dei run, niente di più.",
    ],
    p2: "Cosa vedi nelle tue sessioni:",
    li2: [
      "**I run messi da parte dal rilevamento** sono elencati sotto la tabella dei run con il motivo, e un tocco riporta indietro un run se il rilevamento ha sbagliato. Un run che hai riportato indietro, o rimosso tu stesso, non viene mai scavalcato da un modello successivo — la tua decisione vince sempre.",
      "**L'impostazione di sensibilità nel tuo profilo** ora stabilisce quanto è severo il modello: *Standard*, *Più sensibile* e *Massima sensibilità* conservano sempre più pezzi dubbi e corti. Anche i vecchi limiti di velocità valgono ancora, ma non decidono più da soli.",
      "**Le nuove registrazioni** vengono analizzate con il nuovo rilevamento appena l'upload è completo; i numeri provvisori durante l'upload vengono ancora dal rilevamento precedente.",
    ],
  },

  help: {
    h: "Come puoi aiutare: orologio e telefono insieme",
    p:
      "La cosa più preziosa per il prossimo passo non sono più sessioni — sono **più sessioni registrate due volte insieme**: l'orologio al polso come sempre, e un telefono legato alla tavola che registra la stessa uscita ([Parte 4](/nerd-analysen-4) mostra il setup; è una cinghia e una borsa stagna). Ognuna di queste uscite ci dice, secondo per secondo, cosa stava facendo davvero la tavola — e oggi quella verità viene da due soli rider. Particolarmente utili:",
    li: [
      "**Rider che pompano in modo diverso** — lento e costante, con le gambe, con il braccio calmo. Sono esattamente gli stili che il rilevamento vede meno.",
      "**Planate.** Uscite in cui prendi velocità pompando e poi plani per qualche secondo prima di pompare di nuovo. Non ne abbiamo quasi nessuna.",
      "**Tutto ciò che sta attorno all'uscita.** Camminare verso l'acqua, remare al largo, stare fermi al pontile, riportare indietro la tavola — lascia andare la registrazione.",
      "**Altri orologi.** Ogni modello di orologio si muove un po' diversamente al polso.",
    ],
    p2:
      "Per registrare con il telefono, attiva il registratore telefono nel tuo profilo, avvialo sul telefono e sull'orologio prima di salire sulla tavola, e ferma entrambi dopo. Entrambe le registrazioni compaiono nelle tue sessioni come sempre; le allineiamo nel tempo, quindi non c'è altro da fare.",
  },
};

const es: N5 = {
  back: "← Parte 4: Un móvil pegado a la tabla",
  h1: "Parte 5: Modelo de detección",
  subtitle: "Una nueva detección on-foil, construida con todo lo que nos han contado los riders — y dónde todavía te necesita",
  intro:
    "Todo lo que este sitio cuenta — runs, tiempo en el foil, distancia, pumps, récords — empieza con una sola decisión por segundo: **¿está esta persona en el foil ahora mismo?** Si esa decisión falla, cada número que viene después también falla. La detección actual funciona bien en la mayoría de las sesiones, pero en las últimas semanas los riders nos mostraron exactamente dónde se rompe. Esta parte cuenta cómo reconstruimos esa decisión desde cero, medida contra cada pieza de verdad que tenemos, y termina con una petición: necesitamos más sesiones grabadas con un reloj en la muñeca **y** un móvil en la tabla al mismo tiempo.",

  problem: {
    h: "Dónde se equivoca la detección antigua",
    p:
      "La detección actual combina límites de velocidad (un run empieza por encima de una velocidad y termina por debajo de otra) con un modelo entrenado que observa el movimiento de la muñeca. Tres tipos de errores aparecían una y otra vez:",
    li: [
      "**Runs en tierra.** Unos segundos caminando a buen ritmo por la orilla, llevando la tabla de vuelta al embarcadero, un trote hasta el coche — a la velocidad adecuada y con el brazo balanceándose, eso puede pasar por un run. Una vuelta por un aparcamiento a 30 km/h llegó incluso a los récords de velocidad.",
      "**Runs junto a un trayecto en coche.** Te olvidas de parar la grabación, vuelves a casa en coche, y los primeros segundos del trayecto pueden parecer un run.",
      "**Pumpers lentos cortados antes de tiempo.** Un rider que bombea de forma lenta y constante nos dijo que a sus runs les faltaba casi la mitad. Tenía razón: sigue bombeando a 5–10 km/h más allá del punto en que el antiguo límite de velocidad termina el run.",
    ],
  },

  truth: {
    h: "Contra qué podemos comprobar",
    p:
      "Una detección es tan buena como aquello contra lo que la mides, y el atajo tentador — medir la detección nueva contra la antigua — solo enseña a copiar los errores antiguos. Así que reunimos cada pieza de verdad independiente que pudimos encontrar:",
    li: [
      "**El móvil en la tabla** ([Parte 4](/nerd-analysen-4)). Grabado a la vez que un reloj en la muñeca, dice segundo a segundo si se estaba bombeando la tabla — sin adivinar nada a partir del brazo. Por ahora cumplen los requisitos seis salidas, dos riders, unas 2,5 horas.",
      "**Runs revisados en el mapa.** Cada run que queda mayormente a más de 60 m del agua se revisó en un mapa: 49 grabaciones con runs claramente en tierra, 22 en aguas estrechas que el mapa de agua no recoge (canales, ríos, una piscina).",
      "**Lo que los propios riders quitaron.** Los tramos que los riders sacaron de sus propias sesiones — 234 minutos en total — son una etiqueta tan honesta como puede haberla.",
      "**Grabaciones sin nada de pumpfoil.** Paseos y trayectos en coche grabados con un reloj, a propósito o por accidente.",
      "**El relato de un rider.** El pumper lento de arriba: usamos todos sus runs, incluidas las partes lentas después del antiguo corte, como ejemplos de pump real.",
    ],
    p2:
      "Cada resultado de abajo está medido en riders que el modelo **nunca vio durante el entrenamiento**. Cinco veces seguidas se aparta una quinta parte de los riders, el modelo aprende del resto y se le juzga solo con los que no conoce. Si no, un modelo simplemente aprende a las personas, y los números mienten.",
  },

  features: {
    h: "Lo que el modelo llega a ver",
    p:
      "El modelo antiguo miraba 14 números por segundo, sobre todo del tamaño del movimiento de la muñeca. El nuevo ve 42. Los que más importaron:",
    li: [
      "**Los tres ejes respecto a la gravedad, por separado.** El modelo antiguo solo veía el tamaño total del movimiento, lo que tira a la basura su dirección. Bombear mueve la muñeca arriba y abajo; equilibrarse, caminar y dirigir la mueven hacia los lados. Separados respecto a la gravedad, dejan de parecerse.",
      "**El ritmo.** Cuánto del movimiento está en la banda de pump (0,8–2,2 Hz), cuánto en la banda de caminar (2,2–3,5 Hz), cuánto es vibración (5–12 Hz, carretera y motor), y lo brusco que es.",
      "**El minuto alrededor.** La velocidad más alta dentro de ±60 s, y cuánto de ese minuto fue más rápido que 40 km/h. Un run justo al lado de un trayecto en coche es sospechoso solo por el contexto.",
      "**Tendencia de velocidad.** Velocidad que sube mientras el brazo está tranquilo significa que algo sigue impulsando la tabla — a menudo las piernas.",
      "**Cómo se lleva el reloj** — más sobre eso abajo, porque esa idea vino de un rider mirando una sesión.",
    ],
  },

  honest: {
    h: "Que el modelo no copie las reglas antiguas",
    p:
      "El montón más grande de ejemplos de entrenamiento son los runs que encontró la detección antigua. Es útil — la mayoría son reales — pero lleva una trampa: los bordes de los runs antiguos salen de los límites de velocidad, así que un modelo entrenado con ellos vuelve a aprender esos límites de velocidad. El pumper lento hizo visible la trampa: un modelo que nunca lo había visto encontraba solo una cuarta parte de su pump lento.",
    p2:
      "Por eso los tres segundos al principio y al final de cada run antiguo ya no cuentan en absoluto como ejemplos, y las verdades independientes (móvil en la tabla, revisión en el mapa, lo que quitaron los propios riders, las grabaciones caminando y en coche) cuentan varias veces más que un run que la detección antigua encontró por casualidad. Y luego nos preguntamos si más datos ayudarían. No: el modelo entrenado con 4 riders ya se acerca, y a partir de unos **64 riders** no mejora nada. No faltan más sesiones del mismo tipo — falta mejor verdad.",
    cap: "Curva de aprendizaje: entrenado con 1 a 258 riders, siempre evaluado con riders que nunca había visto.",
  },

  pipeline: {
    h: "De una probabilidad a runs",
    p:
      "El modelo da una probabilidad por segundo. Convertir eso en runs resultó tan importante como el propio modelo. La primera idea — usar simplemente el modelo en lugar de los límites de velocidad — produjo miles de runs extra diminutos que las otras verdades no confirmaban. Lo que funciona es una cadena de pasos pequeños y comprobables:",
    li: [
      "**Empezar generoso.** Tomar los runs que encuentra la detección antigua *y* los encontrados casi sin límite de velocidad. Juntos contienen todo run que podría serlo.",
      "**Cortar en piezas seguras.** Dividir cada candidato donde el modelo duda, salvando bajadas cortas de unos pocos segundos.",
      "**Juzgar cada pieza.** Una pieza cuya probabilidad media es demasiado baja se descarta.",
      "**Ser estricto con las muy cortas.** Una pieza de menos de 8 segundos solo se queda si el modelo está claramente seguro — la mayoría de las piezas cortas son restos de un paseo por la orilla.",
    ],
    p2:
      "El orden importa más de lo que parece. Juzgar primero los candidatos enteros y cortar después tiraba runs reales cada vez que un paseo y una salida se habían fundido en un único tramo largo; cortar primero y juzgar cada pieza los conserva. Y el **ajuste de sensibilidad de tu perfil** conserva su sentido: en lugar de aflojar los límites de velocidad, ahora hace más o menos estrictos los umbrales del modelo.",
  },

  watch: {
    h: "Cómo está el reloj — una idea desde la playa",
    p:
      "Mirando una sesión con varios runs dudosos junto a un embarcadero, Jan tuvo una corazonada: *cuando estás en el foil, el reloj está colocado igual todo el rato; cuando caminas, no.* Lo medimos en cada grabación de la que conocemos la respuesta. Comparado con los demás runs seguros del mismo rider en esa sesión, el reloj en un run real queda a menos de **5°** de como estaba antes (mediana). Caminar y cargar en tierra: **72°**. Runs en tierra: **75°**. Las salidas con móvil en la tabla lo confirman de forma independiente: 3–7° navegando, 39–91° caminando hacia el coche.",
    cap1: "El ángulo del reloj comparado con los demás runs del mismo rider en esa sesión.",
    p2:
      "La segunda mitad de la idea — caminar es inquieto, un coche es extremo — resultó ser al revés, que es lo divertido de medir. En diez segundos, caminar e ir sentado en un coche son **perfectamente estables**: el brazo cuelga, las manos descansan en el volante. Lo que distingue a un run es que el reloj está estable en su dirección principal **y** sigue girando alrededor de ella: unos **29° por segundo** porque la muñeca rota con cada pump, frente a 7° por segundo caminando o conduciendo.",
    cap2: "Izquierda: la estabilidad sola no separa nada. Derecha: estable y girando a la vez, así es un run.",
    p3:
      "¿Por qué no convertirlo en una regla fija? Lo intentamos. Los riders son demasiado distintos: uno bombea con la muñeca firme como una roca, otro — con runs cortos — parece, según esta medida, casi alguien caminando, y los riders que cambian de pie a mitad de sesión llevan el reloj distinto cada dos runs. Como regla tiraba salidas reales que el móvil en la tabla había confirmado. Como **tres entradas extra para el modelo** ayuda, y ahí se queda.",
  },

  result: {
    h: "Qué cambia",
    p:
      "Medido en 2.648 grabaciones con datos de movimiento, cada rider apartado como se describe arriba:",
    cap: "Runs que no deberían contarse — detección antigua frente a nueva.",
    li: [
      "**Runs en tierra** (revisión en el mapa): 81 de 82 aún contados → **19**. Varios de los restantes son errores de GPS junto a la orilla donde el brazo claramente está bombeando, así que cero no es el objetivo correcto.",
      "**Runs cortos junto a un trayecto en coche:** 25 → **1**.",
      "**Runs dentro de tramos que los riders habían quitado:** 73 → **24**.",
      "**Frente al móvil en la tabla:** de los segundos que el reloj considera on-foil, lo eran el 87,2 % → **92,2 %**. De los segundos realmente en el foil encuentra el 93 % (antes: 95 %) — una pequeña parte de eso es el precio de recortar bordes dudosos de los runs.",
      "**El pumper lento:** 22 → **26 minutos**, y eso sin que el modelo lo haya visto nunca.",
      "**Récords:** la vuelta al aparcamiento desaparece de los récords de velocidad, y un run por la carretera junto a un río de los récords de distancia y duración.",
    ],
  },

  failed: {
    h: "Lo que no funcionó",
    p: "Hacer esto con honestidad incluye apuntar los callejones sin salida:",
    li: [
      "**El modelo solo, en lugar de los límites de velocidad:** miles de micro-runs extra, la mayoría sin confirmar.",
      "**Un modelo más grande** (el doble de árboles, el doble de hojas): nada mejor.",
      "**Limpiar los datos de entrenamiento con el mapa de agua:** menos runs en tierra, pero un puerto que el mapa no reconoce como agua le costó al pumper lento sus ejemplos.",
      "**Reglas fijas sobre cómo se lleva el reloj:** atrapan los paseos, y con ellos salidas reales.",
      "**Reconocer planeos:** las salidas con móvil en la tabla contienen solo 31 segundos de planeo real — los riders bombearon casi todo el tiempo. Aún no se puede medir.",
    ],
  },

  status: {
    h: "Activa desde el 30 de septiembre de 2026 — qué ha cambiado",
    p:
      "Antes de activarla, el análisis completo — runs, pumps, planeos, récords y todo lo demás — se ejecutó como test de regresión sobre cada grabación con datos de movimiento, junto a los resultados guardados y sin cambiar ninguno. Reprodujo exactamente los números guardados de hoy en 2.724 de 2.743 grabaciones (el resto se guardaron con código más antiguo), así que el test medía lo que decía medir. Después, cada una de las 2.743 grabaciones se recalculó con la nueva detección:",
    li: [
      "**Runs:** 18.765 → **19.336** (+3 %) — unos pocos runs en tierra y en coche menos, más continuaciones lentas y runs cortos reales.",
      "**Tiempo en el foil:** 235,9 h → **242,9 h** (+3 %). **Distancia:** 3.507 km → **3.558 km**. **Pumps:** 1.340.913 → **1.375.236**.",
      "**Grabaciones que ya no cuentan como pumpfoil:** 16 — la mayoría runs en tierra confirmados en el mapa, el resto un puñado de segundos cada una; otras 8 cuentan ahora por primera vez.",
      "**Récords de velocidad:** cuatro entradas salieron del top diez de todos los tiempos, y las cuatro eran runs en tierra — entre ellas la vuelta al aparcamiento. Los récords de distancia y duración se movieron segundos y metros en los bordes de los runs, nada más.",
    ],
    p2: "Lo que ves en tus propias sesiones:",
    li2: [
      "**Los runs apartados por la detección** aparecen bajo la tabla de runs con el motivo, y un toque recupera un run si la detección se equivocó. Un run que recuperaste, o que quitaste tú, nunca lo anula un modelo posterior — tu decisión siempre gana.",
      "**El ajuste de sensibilidad de tu perfil** ahora fija lo estricto que es el modelo: *Estándar*, *Más sensible* y *Máxima sensibilidad* conservan cada vez más piezas dudosas y cortas. Los antiguos límites de velocidad también siguen aplicándose, pero ya no deciden por sí solos.",
      "**Las grabaciones nuevas** se analizan con la nueva detección en cuanto termina la subida; los números provisionales durante la subida siguen viniendo de la detección anterior.",
    ],
  },

  help: {
    h: "Cómo puedes ayudar: reloj y móvil a la vez",
    p:
      "Lo más valioso para el siguiente paso no son más sesiones — son **más sesiones grabadas dos veces a la vez**: el reloj en tu muñeca como siempre, y un móvil sujeto a la tabla grabando la misma salida ([Parte 4](/nerd-analysen-4) muestra el setup; es una correa y una bolsa estanca). Cada una de esas salidas nos dice, segundo a segundo, lo que la tabla hacía realmente — y hoy esa verdad viene de solo dos riders. Especialmente útil:",
    li: [
      "**Riders que bombean de otra manera** — lento y constante, con las piernas, con el brazo tranquilo. Son justo los estilos que la detección ve menos.",
      "**Planeos.** Salidas en las que tomas velocidad bombeando y luego planeas unos segundos antes de volver a bombear. Casi no tenemos ninguna.",
      "**Todo lo que rodea a la salida.** Caminar hasta el agua, remar hacia fuera, esperar en el embarcadero, llevar la tabla de vuelta — deja la grabación en marcha.",
      "**Otros relojes.** Cada modelo de reloj se mueve un poco distinto en la muñeca.",
    ],
    p2:
      "Para grabar con el móvil, activa el grabador de móvil en tu perfil, inícialo en el móvil y en el reloj antes de subirte a la tabla, y para ambos después. Las dos grabaciones aparecen en tus sesiones como siempre; las alineamos por tiempo, así que no hay que hacer nada más.",
  },
};

const nl: N5 = {
  back: "← Deel 4: Een telefoon op de board geplakt",
  h1: "Deel 5: Het herkenningsmodel",
  subtitle: "Een nieuwe on-foil-herkenning, gebouwd op alles wat riders ons verteld hebben — en waar ze jou nog nodig heeft",
  intro:
    "Alles wat deze site telt — runs, foiltijd, afstand, pompen, records — begint met één beslissing per seconde: **staat deze persoon nu op de foil?** Zit die fout, dan is elk getal daarna ook fout. De herkenning die vandaag draait werkt goed voor de meeste sessies, maar de afgelopen weken lieten riders ons precies zien waar ze faalt. Dit deel is het verhaal van hoe we die beslissing vanaf nul opnieuw hebben gebouwd, gemeten tegen elk stukje waarheid dat we hebben, en het eindigt met een verzoek: we hebben meer sessies nodig die tegelijk met een horloge om de pols **én** een telefoon op de board zijn opgenomen.",

  problem: {
    h: "Waar de oude herkenning de fout in gaat",
    p:
      "De huidige herkenning combineert snelheidsgrenzen (een run begint boven de ene snelheid en eindigt onder een andere) met een getraind model dat naar de polsbeweging kijkt. Drie soorten fouten kwamen steeds terug:",
    li: [
      "**Runs op het land.** Een paar seconden stevig wandelen langs de oever, de board terugdragen naar de steiger, een stukje joggen naar de auto — met de juiste snelheid en een zwaaiende arm kan dat voor een run doorgaan. Eén rondje over een parkeerplaats met 30 km/h belandde zelfs in de snelheidsrecords.",
      "**Runs naast een autorit.** Vergeet de opname te stoppen, rijd naar huis, en de eerste seconden van de rit kunnen op een run lijken.",
      "**Langzame pompers ingekort.** Een rider die langzaam en gelijkmatig pompt, vertelde ons dat bijna de helft van zijn runs ontbrak. Hij had gelijk: hij blijft pompen met 5–10 km/h, voorbij het punt waar de oude snelheidsgrens de run beëindigt.",
    ],
  },

  truth: {
    h: "Waartegen we kunnen controleren",
    p:
      "Een herkenning is maar zo goed als datgene waartegen je haar meet, en de verleidelijke kortere weg — de nieuwe herkenning tegen de oude meten — leert je alleen de oude fouten na te doen. Dus verzamelden we elk onafhankelijk stukje waarheid dat we konden vinden:",
    li: [
      "**De telefoon op de board** ([Deel 4](/nerd-analysen-4)). Tegelijk opgenomen met een horloge om de pols, zegt hij seconde voor seconde of er op de board gepompt werd — zonder gissen vanuit de arm. Tot nu toe komen zes ritten in aanmerking, twee riders, ongeveer 2,5 uur.",
      "**Runs gecontroleerd op de kaart.** Elke run die grotendeels meer dan 60 m van het water ligt, is op een kaart bekeken: 49 opnames met runs die duidelijk op het land liggen, 22 op smal water dat de waterkaart mist (kanalen, rivieren, een zwembad).",
      "**Wat riders zelf verwijderd hebben.** Stukken die riders uit hun eigen sessies hebben gehaald — samen 234 minuten — zijn ongeveer het eerlijkste label dat er bestaat.",
      "**Opnames zonder enig pumpfoilen.** Wandelingen en autoritten die met een horloge zijn opgenomen, expres of per ongeluk.",
      "**Het eigen verhaal van een rider.** De langzame pomper hierboven: we gebruikten al zijn runs, inclusief de langzame stukken na de oude afkapgrens, als voorbeelden van echt pompen.",
    ],
    p2:
      "Elk resultaat hieronder is gemeten op riders die het model **tijdens de training nooit gezien heeft**. Vijf keer achter elkaar wordt een vijfde van de riders apart gehouden, leert het model van de rest, en wordt het alleen beoordeeld op degenen die het niet kent. Anders leert een model gewoon de mensen uit het hoofd, en liegen de getallen.",
  },

  features: {
    h: "Wat het model te zien krijgt",
    p:
      "Het oude model keek naar 14 getallen per seconde, vooral over hoe groot de polsbeweging is. Het nieuwe ziet er 42. Deze deden er het meest toe:",
    li: [
      "**De drie assen ten opzichte van de zwaartekracht, afzonderlijk.** Het oude model zag alleen de totale grootte van de beweging, en gooide daarmee de richting weg. Pompen beweegt de pols op en neer; balanceren, lopen en sturen bewegen hem zijwaarts. Gesplitst ten opzichte van de zwaartekracht lijken die niet meer op elkaar.",
      "**Het ritme.** Hoeveel van de beweging in de pompband zit (0,8–2,2 Hz), hoeveel in de loopband (2,2–3,5 Hz), hoeveel trilling is (5–12 Hz, weg en motor), en hoe piekerig ze is.",
      "**De minuut eromheen.** De hoogste snelheid binnen ±60 s, en hoeveel van die minuut sneller was dan 40 km/h. Een run vlak naast een autorit is alleen al door de context verdacht.",
      "**Snelheidsverloop.** Een stijgende snelheid terwijl de arm rustig is, betekent dat iets anders de board nog aandrijft — vaak de benen.",
      "**Hoe het horloge zit** — daarover hieronder meer, want dat idee kwam van een rider die naar één sessie keek.",
    ],
  },

  honest: {
    h: "Het model de oude regels niet laten nadoen",
    p:
      "De grootste stapel trainingsvoorbeelden zijn de runs die de oude herkenning vond. Dat is nuttig — de meeste zijn echt — maar er zit een valkuil in: de oude runranden komen uit snelheidsgrenzen, dus een model dat erop getraind wordt, leert die snelheidsgrenzen terug. De langzame pomper maakte de valkuil zichtbaar: een model dat hem nooit gezien had, vond maar een kwart van zijn langzame pompen.",
    p2:
      "Daarom tellen de drie seconden aan het begin en eind van elke oude run helemaal niet meer als voorbeeld, en tellen de onafhankelijke waarheden (telefoon op de board, kaartcontrole, wat riders zelf verwijderden, de wandel- en rij-opnames) meerdere keren zo zwaar als een run die de oude herkenning toevallig vond. En toen vroegen we ons af of meer data zou helpen. Dat doet het niet: het model dat op 4 riders getraind is, zit er al dicht bij, en vanaf ongeveer **64 riders** wordt het helemaal niet beter meer. Wat ontbreekt zijn niet meer sessies van dezelfde soort — het is betere waarheid.",
    cap: "Leercurve: getraind op 1 tot 258 riders, altijd getest op riders die het nooit gezien had.",
  },

  pipeline: {
    h: "Van een kans naar runs",
    p:
      "Het model geeft een kans per seconde. Daar runs van maken bleek net zo belangrijk als het model zelf. Het eerste idee — gewoon het model gebruiken in plaats van de snelheidsgrenzen — leverde duizenden piepkleine extra runs op die de andere waarheden niet bevestigden. Wat werkt, is een keten van kleine, controleerbare stappen:",
    li: [
      "**Ruim beginnen.** Neem de runs die de oude herkenning vindt *en* de runs die je vindt met vrijwel geen snelheidsgrens. Samen bevatten ze elke run die er mogelijk een zou kunnen zijn.",
      "**In zekere stukken knippen.** Splits elke kandidaat waar het model twijfelt, en overbrug korte dipjes van een paar seconden.",
      "**Elk stuk beoordelen.** Een stuk met een te lage gemiddelde kans valt weg.",
      "**Streng zijn met de heel korte.** Een stuk korter dan 8 seconden blijft alleen als het model duidelijk zeker is — de meeste korte stukken zijn restjes van een wandeling langs de oever.",
    ],
    p2:
      "De volgorde doet er meer toe dan je zou denken. Eerst hele kandidaten beoordelen en daarna knippen gooide echte runs weg zodra een wandeling en een rit tot één lang stuk waren samengesmolten; eerst knippen en dan elk stuk beoordelen houdt ze. En de **gevoeligheidsinstelling in je profiel** houdt haar betekenis: in plaats van snelheidsgrenzen losser te maken, maakt ze nu de drempels van het model strenger of ruimer.",
  },

  watch: {
    h: "Hoe het horloge zit — een idee van het strand",
    p:
      "Bij het bekijken van één sessie met meerdere twijfelachtige runs bij een steiger kreeg Jan een ingeving: *als je op de foil staat, zit het horloge de hele tijd op dezelfde manier; als je loopt, niet.* We hebben het gemeten over elke opname waarvan we het antwoord kennen. Vergeleken met de andere zekere runs van dezelfde rider in die sessie zit het horloge in een echte run binnen **5°** van hoe het ervoor zat (mediaan). Lopen en dragen op het land: **72°**. Runs op het land: **75°**. De ritten met de telefoon op de board bevestigen het onafhankelijk: 3–7° tijdens het rijden, 39–91° tijdens het lopen naar de auto.",
    cap1: "De hoek van het horloge vergeleken met de andere runs van dezelfde rider in die sessie.",
    p2:
      "De tweede helft van het idee — lopen is onrustig, een auto is extreem — bleek precies andersom te zijn, en dat is het leuke aan meten. Over tien seconden zijn lopen en in een auto zitten **volkomen stabiel**: de arm hangt, de handen rusten op het stuur. Wat een run onderscheidt, is dat het horloge stabiel is in zijn hoofdrichting **én** daaromheen blijft draaien: ongeveer **29° per seconde** doordat de pols bij elke pomp meedraait, tegenover 7° per seconde bij lopen of rijden.",
    cap2: "Links: stabiliteit alleen onderscheidt niets. Rechts: tegelijk stabiel en draaiend — zo ziet een run eruit.",
    p3:
      "Waarom er geen harde regel van maken? Dat hebben we geprobeerd. Riders verschillen te veel: de een pompt met een pols zo stil als een rots, een ander — met korte runs — lijkt volgens deze maat bijna op iemand die loopt, en riders die midden in een sessie van stand wisselen, houden het horloge bij elke andere run anders. Als regel gooide het echte ritten weg die de telefoon op de board had bevestigd. Als **drie extra invoerwaarden voor het model** helpt het, en daar blijft het.",
  },

  result: {
    h: "Wat er verandert",
    p:
      "Gemeten over 2.648 opnames met bewegingsdata, met elke rider apart gehouden zoals hierboven beschreven:",
    cap: "Runs die niet geteld zouden moeten worden — oude herkenning tegen nieuwe.",
    li: [
      "**Runs op het land** (kaartcontrole): 81 van 82 nog geteld → **19**. Een aantal van de rest zijn GPS-fouten aan de oever waar de arm duidelijk pompt, dus nul is niet het juiste doel.",
      "**Korte runs naast een autorit:** 25 → **1**.",
      "**Runs binnen stukken die riders verwijderd hadden:** 73 → **24**.",
      "**Tegen de telefoon op de board:** van de seconden die het horloge on-foil noemt, klopte 87,2 % → **92,2 %**. Van de seconden die echt op de foil waren, vindt het 93 % (eerder: 95 %) — een beetje daarvan is de prijs van het wegknippen van twijfelachtige runranden.",
      "**De langzame pomper:** 22 → **26 minuten**, en dat zonder dat het model hem ooit gezien heeft.",
      "**Records:** het rondje over de parkeerplaats verdwijnt uit de snelheidsrecords, een run op de weg naast een rivier uit de afstands- en duurrecords.",
    ],
  },

  failed: {
    h: "Wat niet werkte",
    p: "Wie dit eerlijk wil doen, schrijft ook de doodlopende wegen op:",
    li: [
      "**Het model alleen, in plaats van de snelheidsgrenzen:** duizenden extra mini-runs, de meeste niet bevestigd.",
      "**Een groter model** (twee keer zoveel bomen, twee keer zoveel bladeren): helemaal niet beter.",
      "**De trainingsdata opschonen met de waterkaart:** minder landruns, maar een haven die de kaart niet als water kent, kostte de langzame pomper zijn voorbeelden.",
      "**Harde regels over hoe het horloge gehouden wordt:** die vangen wandelingen, en echte ritten erbij.",
      "**Glijden herkennen:** de ritten met de telefoon op de board bevatten maar 31 seconden echt glijden — de riders pompten bijna de hele tijd. Nog niet meetbaar.",
    ],
  },

  status: {
    h: "Live sinds 30 september 2026 — wat er veranderd is",
    p:
      "Voordat we haar aanzetten, draaide de complete analyse — runs, pompen, glides, records en alles — als regressietest over elke opname met bewegingsdata, naast de opgeslagen resultaten en zonder er één te veranderen. Ze reproduceerde de opgeslagen getallen van vandaag exact voor 2.724 van 2.743 opnames (de rest was met oudere code opgeslagen), dus de test mat wat hij beweerde te meten. Daarna werd elk van de 2.743 opnames opnieuw berekend met de nieuwe herkenning:",
    li: [
      "**Runs:** 18.765 → **19.336** (+3 %) — een paar land- en autoruns minder, meer langzame voortzettingen en korte echte runs.",
      "**Foiltijd:** 235,9 u → **242,9 u** (+3 %). **Afstand:** 3.507 km → **3.558 km**. **Pompen:** 1.340.913 → **1.375.236**.",
      "**Opnames die niet meer als pumpfoilen tellen:** 16 — de meeste runs op het land die op de kaart bevestigd zijn, de rest elk een handvol seconden; 8 andere tellen nu voor het eerst mee.",
      "**Snelheidsrecords:** vier inzendingen verdwenen uit de top tien aller tijden, en alle vier waren runs op het land — het rondje over de parkeerplaats ertussen. De afstands- en duurrecords verschoven met seconden en meters aan de runranden, meer niet.",
    ],
    p2: "Wat je in je eigen sessies ziet:",
    li2: [
      "**Runs die de herkenning opzij heeft gezet** staan onder de runtabel met de reden, en met één tik haal je een run terug als de herkenning het mis had. Een run die je teruggehaald of zelf verwijderd hebt, wordt nooit door een later model overruled — jouw beslissing wint altijd.",
      "**De gevoeligheidsinstelling in je profiel** bepaalt nu hoe streng het model is: *Standaard*, *Gevoeliger* en *Meest gevoelig* houden steeds meer van de twijfelachtige en korte stukken. De oude snelheidsgrenzen gelden ook nog, maar ze beslissen niet meer alleen.",
      "**Nieuwe opnames** worden met de nieuwe herkenning geanalyseerd zodra de upload compleet is; de voorlopige getallen tijdens de upload komen nog van de vorige herkenning.",
    ],
  },

  help: {
    h: "Hoe je kunt helpen: horloge en telefoon samen",
    p:
      "Het waardevolste voor de volgende stap zijn niet meer sessies — het zijn **meer sessies die twee keer tegelijk zijn opgenomen**: het horloge om je pols zoals altijd, en een telefoon vastgebonden op de board die dezelfde rit opneemt ([Deel 4](/nerd-analysen-4) laat de opstelling zien; het is één band en een drybag). Elke zo’n rit geeft ons seconde voor seconde wat de board echt deed — en vandaag komt die waarheid van maar twee riders. Vooral nuttig:",
    li: [
      "**Riders die anders pompen** — langzaam en gelijkmatig, met de benen, met een rustige arm. Dat zijn precies de stijlen die de herkenning het minst ziet.",
      "**Glides.** Ritten waarin je oppompt en dan een paar seconden glijdt voordat je weer pompt. Daar hebben we er bijna geen van.",
      "**Alles rond de rit.** Naar het water lopen, uitpeddelen, op de steiger staan, de board terugdragen — laat de opname gewoon doorlopen.",
      "**Andere horloges.** Elk horlogemodel beweegt net iets anders om de pols.",
    ],
    p2:
      "Om met de telefoon op te nemen, zet je de telefoon-recorder aan in je profiel, start je hem op de telefoon en op het horloge voordat je op de board stapt, en stop je beide daarna. Beide opnames verschijnen zoals gewoonlijk in je sessies; wij leggen ze op tijd naast elkaar, dus je hoeft verder niets te doen.",
  },
};

const nb: N5 = {
  back: "← Del 4: En mobil tapet på brettet",
  h1: "Del 5: Gjenkjenningsmodellen",
  subtitle: "En ny on-foil-gjenkjenning, bygget på alt riderne har fortalt oss — og der den fortsatt trenger deg",
  intro:
    "Alt denne nettsiden teller — turer, foiletid, distanse, pumps, rekorder — begynner med én avgjørelse per sekund: **er denne personen på foilen akkurat nå?** Tar man feil der, blir hvert tall etterpå også feil. Gjenkjenningen som kjører i dag fungerer godt for de fleste økter, men de siste ukene har riderne vist oss nøyaktig hvor den svikter. Denne delen er historien om hvordan vi bygde den avgjørelsen opp på nytt fra bunnen av, målt mot hver eneste bit sannhet vi har, og den ender med en bønn: vi trenger flere økter tatt opp med en klokke på håndleddet **og** en mobil på brettet samtidig.",

  problem: {
    h: "Der den gamle gjenkjenningen tar feil",
    p:
      "Dagens gjenkjenning kombinerer fartsgrenser (en tur starter over én fart og slutter under en annen) med en trent modell som ser på håndleddsbevegelsen. Tre typer feil dukket opp igjen og igjen:",
    li: [
      "**Turer på land.** Noen sekunder rask gange langs stranda, brettet båret tilbake til brygga, en jogg til bilen — med riktig fart og en svingende arm kan det gå for en tur. En runde rundt en parkeringsplass i 30 km/h havnet til og med i fartsrekordene.",
      "**Turer ved siden av en biltur.** Glem å stoppe opptaket, kjør hjem, og de første sekundene av bilturen kan se ut som en tur.",
      "**Sakte pumpere kuttet av.** En rider som pumper sakte og jevnt, fortalte oss at nesten halvparten av turene hans manglet. Han hadde rett: han fortsetter å pumpe i 5–10 km/h etter punktet der den gamle fartsgrensen avslutter turen.",
    ],
  },

  truth: {
    h: "Hva vi kan sjekke mot",
    p:
      "En gjenkjenning er bare så god som det du måler den mot, og den fristende snarveien — å måle den nye gjenkjenningen mot den gamle — lærer deg bare å kopiere de gamle feilene. Så vi samlet hver uavhengig bit sannhet vi kunne finne:",
    li: [
      "**Mobilen på brettet** ([Del 4](/nerd-analysen-4)). Tatt opp samtidig med en klokke på håndleddet sier den sekund for sekund om brettet ble pumpet — uten å gjette ut fra armen. Seks turer holder mål så langt, to ridere, omtrent 2,5 timer.",
      "**Turer sjekket på kartet.** Hver tur som for det meste ligger mer enn 60 m fra vann, ble sett på i et kart: 49 opptak med turer tydelig på land, 22 på smalt vann som vannkartet ikke fanger (kanaler, elver, et basseng).",
      "**Det riderne fjernet selv.** Strekk som riderne har tatt ut av sine egne økter — 234 minutter til sammen — er omtrent så ærlig en merkelapp som det går an å få.",
      "**Opptak uten noe pumpfoiling.** Gåturer og bilturer tatt opp med en klokke, med vilje eller ved et uhell.",
      "**En riders egen beretning.** Den sakte pumperen ovenfor: vi brukte alle turene hans, også de sakte delene etter den gamle grensen, som eksempler på ekte pumping.",
    ],
    p2:
      "Hvert resultat nedenfor er målt på ridere modellen **aldri så under treningen**. Fem ganger på rad holdes en femtedel av riderne utenfor, modellen lærer av resten, og den bedømmes bare på dem den ikke har møtt. Ellers lærer en modell rett og slett personene, og tallene lyver.",
  },

  features: {
    h: "Hva modellen får se",
    p:
      "Den gamle modellen så på 14 tall per sekund, mest om hvor stor håndleddsbevegelsen var. Den nye ser 42. De som betydde mest:",
    li: [
      "**De tre aksene mot tyngdekraften, hver for seg.** Den gamle modellen så bare den totale størrelsen på bevegelsen, og kastet dermed retningen. Pumping beveger håndleddet opp og ned; balansering, gange og styring beveger det sidelengs. Delt opp mot tyngdekraften slutter de å ligne på hverandre.",
      "**Rytmen.** Hvor mye av bevegelsen som ligger i pumpebåndet (0,8–2,2 Hz), hvor mye i gangbåndet (2,2–3,5 Hz), hvor mye som er vibrasjon (5–12 Hz, vei og motor), og hvor taggete den er.",
      "**Minuttet rundt.** Høyeste fart innenfor ±60 s, og hvor mye av det minuttet som gikk fortere enn 40 km/h. En tur rett ved siden av en biltur er mistenkelig bare ut fra sammenhengen.",
      "**Fartsutvikling.** Stigende fart mens armen er rolig betyr at noe fortsatt driver brettet — ofte beina.",
      "**Hvordan klokka sitter** — mer om det nedenfor, fordi den ideen kom fra en rider som så på én økt.",
    ],
  },

  honest: {
    h: "Ikke la modellen kopiere de gamle reglene",
    p:
      "Den største haugen med treningseksempler er turene den gamle gjenkjenningen fant. Det er nyttig — de fleste er ekte — men det skjuler en felle: de gamle turkantene kommer fra fartsgrenser, så en modell trent på dem lærer de fartsgrensene tilbake. Den sakte pumperen gjorde fellen synlig: en modell som aldri hadde sett ham, fant bare en fjerdedel av den sakte pumpingen hans.",
    p2:
      "Derfor teller de tre sekundene i starten og slutten av hver gamle tur ikke lenger som eksempler i det hele tatt, og de uavhengige sannhetene (mobilen på brettet, kartsjekken, ridernes egne fjerninger, gå- og kjøreopptakene) teller flere ganger så mye som en tur den gamle gjenkjenningen tilfeldigvis fant. Og så spurte vi om mer data ville hjelpe. Det ville det ikke: modellen trent på 4 ridere er allerede nær, og fra omtrent **64 ridere** blir den ikke bedre i det hele tatt. Det som mangler er ikke flere økter av samme slag — det er bedre sannhet.",
    cap: "Læringskurve: trent på 1 til 258 ridere, alltid testet på ridere den aldri hadde sett.",
  },

  pipeline: {
    h: "Fra en sannsynlighet til turer",
    p:
      "Modellen gir en sannsynlighet per sekund. Å gjøre det om til turer viste seg å bety like mye som selve modellen. Den første ideen — rett og slett bruke modellen i stedet for fartsgrensene — ga tusenvis av bitte små ekstra turer som de andre sannhetene ikke bekreftet. Det som fungerer, er en kjede av små, sjekkbare steg:",
    li: [
      "**Start raust.** Ta turene den gamle gjenkjenningen finner *og* turene man finner nesten uten fartsgrense i det hele tatt. Til sammen inneholder de hver tur som i det hele tatt kan være en.",
      "**Klipp i sikre biter.** Del hver kandidat der modellen er usikker, og bygg bro over korte dupper på noen sekunder.",
      "**Vurder hver bit.** En bit med for lav gjennomsnittlig sannsynlighet faller bort.",
      "**Vær streng med de helt korte.** En bit under 8 sekunder blir bare værende når modellen er tydelig sikker — de fleste korte bitene er rester av en gåtur langs stranda.",
    ],
    p2:
      "Rekkefølgen betyr mer enn man skulle tro. Å vurdere hele kandidater først og klippe etterpå kastet ekte turer hver gang en gåtur og en tur hadde smeltet sammen til ett langt strekk; å klippe først og vurdere hver bit beholder dem. Og **følsomhetsinnstillingen i profilen din** beholder betydningen sin: i stedet for å løsne på fartsgrensene gjør den nå modellens terskler strengere eller mildere.",
  },

  watch: {
    h: "Hvordan klokka sitter — en idé fra stranda",
    p:
      "Mens han så på én økt med flere tvilsomme turer ved en brygge, fikk Jan en anelse: *når du er på foilen, sitter klokka likt hele tiden; når du går, gjør den ikke det.* Vi målte det over hvert opptak der vi kjenner svaret. Sammenlignet med den samme riderens andre sikre turer i den økta sitter klokka i en ekte tur innenfor **5°** av hvordan den satt før (median). Gange og bæring på land: **72°**. Turer på land: **75°**. Turene med mobil på brettet bekrefter det uavhengig: 3–7° under kjøring, 39–91° på vei til bilen.",
    cap1: "Vinkelen på klokka sammenlignet med den samme riderens andre turer i den økta.",
    p2:
      "Den andre halvdelen av ideen — gange er urolig, en bil er ekstrem — viste seg å være omvendt, og det er det morsomme med å måle. Over ti sekunder er gange og det å sitte i en bil **helt stødig**: armen henger, hendene hviler på rattet. Det som skiller en tur ut, er at klokka er stødig i hovedretningen sin **og** fortsetter å dreie rundt den: omtrent **29° per sekund** fordi håndleddet roterer med hvert pump, mot 7° per sekund ved gange eller kjøring.",
    cap2: "Venstre: stødighet alene skiller ingenting. Høyre: stødig og dreiende samtidig — slik ser en tur ut.",
    p3:
      "Hvorfor ikke gjøre det til en fast regel? Vi prøvde. Ridere er for forskjellige: én pumper med et bunnstødig håndledd, en annen — med korte turer — ser etter dette målet nesten ut som en som går, og ridere som bytter stance midt i økta holder klokka forskjellig annenhver tur. Som regel kastet det ekte turer som mobilen på brettet hadde bekreftet. Som **tre ekstra innganger til modellen** hjelper det, og der blir det.",
  },

  result: {
    h: "Hva som endrer seg",
    p:
      "Målt over 2 648 opptak med bevegelsesdata, med hver rider holdt utenfor slik det er beskrevet ovenfor:",
    cap: "Turer som ikke burde telles — gammel gjenkjenning mot ny.",
    li: [
      "**Turer på land** (kartsjekk): 81 av 82 fortsatt talt → **19**. Flere av de resterende er GPS-feil ved stranda der armen tydelig pumper, så null er ikke det riktige målet.",
      "**Korte turer ved siden av en biltur:** 25 → **1**.",
      "**Turer inne i strekk riderne hadde fjernet:** 73 → **24**.",
      "**Mot mobilen på brettet:** av sekundene klokka kaller on-foil stemte 87,2 % → **92,2 %**. Av sekundene som virkelig var på foilen, finner den 93 % (før: 95 %) — litt av det er prisen for å klippe bort tvilsomme turkanter.",
      "**Den sakte pumperen:** 22 → **26 minutter**, og det uten at modellen noen gang har sett ham.",
      "**Rekorder:** parkeringsplass-runden forsvinner fra fartsrekordene, en tur på veien langs en elv fra distanse- og varighetsrekordene.",
    ],
  },

  failed: {
    h: "Hva som ikke fungerte",
    p: "Å gjøre dette ærlig betyr også å skrive ned blindveiene:",
    li: [
      "**Modellen alene, i stedet for fartsgrensene:** tusenvis av ekstra mikroturer, de fleste ikke bekreftet.",
      "**En større modell** (dobbelt så mange trær, dobbelt så mange blader): ikke bedre i det hele tatt.",
      "**Rense treningsdataene med vannkartet:** færre landturer, men en havn kartet ikke kjenner som vann kostet den sakte pumperen eksemplene hans.",
      "**Faste regler for hvordan klokka holdes:** de fanger gåturer, og ekte turer sammen med dem.",
      "**Gjenkjenne glid:** turene med mobil på brettet inneholder bare 31 sekunder ekte gliding — riderne pumpet nesten hele tiden. Ikke målbart ennå.",
    ],
  },

  status: {
    h: "Live siden 30. september 2026 — hva som er endret",
    p:
      "Før vi slo den på, kjørte hele analysen — turer, pumps, glid, rekorder og alt — som regresjonstest over hvert opptak med bevegelsesdata, ved siden av de lagrede resultatene og uten å endre noen av dem. Den gjenskapte dagens lagrede tall nøyaktig for 2 724 av 2 743 opptak (resten var lagret med eldre kode), så testen målte det den sa den målte. Deretter ble hvert av de 2 743 opptakene regnet ut på nytt med den nye gjenkjenningen:",
    li: [
      "**Turer:** 18 765 → **19 336** (+3 %) — noen færre land- og bilturer, flere sakte fortsettelser og korte ekte turer.",
      "**Foiletid:** 235,9 t → **242,9 t** (+3 %). **Distanse:** 3 507 km → **3 558 km**. **Pumps:** 1 340 913 → **1 375 236**.",
      "**Opptak som ikke lenger teller som pumpfoiling:** 16 — de fleste av dem turer på land bekreftet på kartet, resten en håndfull sekunder hver; 8 andre teller nå for første gang.",
      "**Fartsrekorder:** fire oppføringer forsvant fra topp ti gjennom tidene, og alle fire var turer på land — parkeringsplass-runden blant dem. Distanse- og varighetsrekordene flyttet seg med sekunder og meter ved turkantene, ikke mer.",
    ],
    p2: "Det du ser i dine egne økter:",
    li2: [
      "**Turer gjenkjenningen har lagt til side** står under turtabellen med årsaken, og ett trykk henter en tur tilbake hvis gjenkjenningen tok feil. En tur du har hentet tilbake, eller fjernet selv, blir aldri overstyrt av en senere modell — din avgjørelse vinner alltid.",
      "**Følsomhetsinnstillingen i profilen din** bestemmer nå hvor streng modellen er: *Standard*, *Mer følsom* og *Mest følsom* beholder mer og mer av de tvilsomme og korte bitene. De gamle fartsgrensene gjelder fortsatt også, men de avgjør ikke lenger alene.",
      "**Nye opptak** analyseres med den nye gjenkjenningen så snart opplastingen er ferdig; de foreløpige tallene under opplastingen kommer fortsatt fra den forrige gjenkjenningen.",
    ],
  },

  help: {
    h: "Slik kan du hjelpe: klokke og mobil sammen",
    p:
      "Det mest verdifulle for neste steg er ikke flere økter — det er **flere økter tatt opp to ganger samtidig**: klokka på håndleddet som alltid, og en mobil festet på brettet som tar opp samme tur ([Del 4](/nerd-analysen-4) viser oppsettet; det er én rem og en drybag). Hver slik tur gir oss, sekund for sekund, hva brettet egentlig gjorde — og i dag kommer den sannheten fra bare to ridere. Særlig nyttig:",
    li: [
      "**Ridere som pumper annerledes** — sakte og jevnt, med beina, med rolig arm. Det er nettopp de stilene gjenkjenningen ser minst av.",
      "**Glid.** Turer der du pumper opp og så glir noen sekunder før du pumper igjen. Vi har nesten ingen.",
      "**Alt rundt turen.** Gå til vannet, padle ut, stå på brygga, bære brettet tilbake — la opptaket gå.",
      "**Andre klokker.** Hver klokkemodell beveger seg litt annerledes på håndleddet.",
    ],
    p2:
      "For å ta opp med mobilen slår du på mobil-opptakeren i profilen din, starter den på mobilen og på klokka før du går på brettet, og stopper begge etterpå. Begge opptakene dukker opp i øktene dine som vanlig; vi kobler dem sammen etter klokkeslett, så det er ikke noe mer du trenger å gjøre.",
  },
};

const fi: N5 = {
  back: "← Osa 4: Puhelin teipattuna lautaan",
  h1: "Osa 5: Tunnistusmalli",
  subtitle: "Uusi on-foil-tunnistus, rakennettu kaikesta, mitä ajajat ovat meille kertoneet — ja siitä, missä se yhä tarvitsee sinua",
  intro:
    "Kaikki, mitä tämä sivusto laskee — vedot, foilausaika, matka, pumppaukset, ennätykset — alkaa yhdestä päätöksestä sekunnissa: **onko tämä ihminen foililla juuri nyt?** Jos se menee pieleen, jokainen sen jälkeinen luku menee myös pieleen. Tänään käytössä oleva tunnistus toimii hyvin useimmissa sessioissa, mutta viime viikkoina ajajat näyttivät meille tarkalleen, missä se pettää. Tämä osa kertoo, miten rakensimme tuon päätöksen alusta asti uudelleen, mitattuna jokaista hallussamme olevaa totuuden palaa vasten, ja se päättyy pyyntöön: tarvitsemme lisää sessioita, jotka on tallennettu samaan aikaan kellolla ranteessa **ja** puhelimella laudalla.",

  problem: {
    h: "Missä vanha tunnistus menee pieleen",
    p:
      "Nykyinen tunnistus yhdistää nopeusrajat (veto alkaa yhden nopeuden yläpuolella ja päättyy toisen alapuolella) koulutettuun malliin, joka katsoo ranteen liikettä. Kolmenlaisia virheitä toistui yhä uudelleen:",
    li: [
      "**Vedot maalla.** Muutama sekunti reipasta kävelyä rantaa pitkin, lauta kannettuna takaisin laiturille, hölkkä autolle — oikealla nopeudella ja käsi heiluen se voi mennä vedosta. Yksi kierros parkkipaikan ympäri 30 km/h:n vauhdilla päätyi jopa nopeusennätyksiin.",
      "**Vedot automatkan vieressä.** Unohda pysäyttää tallennus, aja kotiin, ja automatkan ensimmäiset sekunnit voivat näyttää vedolta.",
      "**Hitaat pumppaajat katkaistuina.** Eräs hitaasti ja tasaisesti pumppaava ajaja kertoi, että hänen vedoistaan puuttui lähes puolet. Hän oli oikeassa: hän jatkaa pumppaamista 5–10 km/h:n vauhdilla vielä sen kohdan jälkeen, jossa vanha nopeusraja päättää vedon.",
    ],
  },

  truth: {
    h: "Mitä vasten voimme tarkistaa",
    p:
      "Tunnistus on vain niin hyvä kuin se, mitä vasten sitä mitataan, ja houkutteleva oikotie — uuden tunnistuksen mittaaminen vanhaa vasten — opettaa vain kopioimaan vanhat virheet. Siksi keräsimme jokaisen riippumattoman totuuden palan, jonka löysimme:",
    li: [
      "**Puhelin laudalla** ([Osa 4](/nerd-analysen-4)). Kun se tallennetaan samaan aikaan kuin ranteessa oleva kello, se kertoo sekunti sekunnilta, pumpattiinko lautaa — ilman arvailua käsivarren perusteella. Tähän mennessä kelpaa kuusi ajoa, kaksi ajajaa, noin 2,5 tuntia.",
      "**Kartalta tarkistetut vedot.** Jokainen veto, joka on enimmäkseen yli 60 m:n päässä vedestä, katsottiin kartalta: 49 tallennusta, joissa vedot ovat selvästi maalla, 22 kapealla vedellä, jota vesikartta ei tunne (kanavat, joet, uima-allas).",
      "**Mitä ajajat poistivat itse.** Pätkät, jotka ajajat ovat ottaneet pois omista sessioistaan — yhteensä 234 minuuttia — ovat suunnilleen niin rehellinen merkintä kuin olla voi.",
      "**Tallennukset ilman pumpfoilausta.** Kellolla tallennetut kävelyt ja automatkat, tahallaan tai vahingossa.",
      "**Ajajan oma kertomus.** Yllä mainittu hidas pumppaaja: käytimme kaikkia hänen vetojaan, myös hitaita osuuksia vanhan katkaisukohdan jälkeen, esimerkkeinä oikeasta pumppauksesta.",
    ],
    p2:
      "Jokainen alla oleva tulos on mitattu ajajilla, joita malli **ei nähnyt koskaan koulutuksen aikana**. Viisi kertaa peräkkäin viidesosa ajajista pidetään sivussa, malli oppii lopuista, ja sitä arvioidaan vain niillä, joita se ei ole tavannut. Muuten malli yksinkertaisesti opettelee ihmiset ulkoa, ja luvut valehtelevat.",
  },

  features: {
    h: "Mitä malli saa nähdä",
    p:
      "Vanha malli katsoi 14 lukua sekunnissa, lähinnä ranteen liikkeen suuruudesta. Uusi näkee 42. Eniten merkitsivät nämä:",
    li: [
      "**Kolme akselia painovoimaa vasten, erikseen.** Vanha malli näki vain liikkeen kokonaissuuruuden, jolloin sen suunta heitettiin pois. Pumppaus liikuttaa rannetta ylös ja alas; tasapainoilu, kävely ja ohjaus liikuttavat sitä sivuttain. Painovoimaa vasten eroteltuina ne lakkaavat näyttämästä samalta.",
      "**Rytmi.** Kuinka paljon liikkeestä on pumppauskaistalla (0,8–2,2 Hz), kuinka paljon kävelykaistalla (2,2–3,5 Hz), kuinka paljon on tärinää (5–12 Hz, tie ja moottori), ja kuinka piikikästä se on.",
      "**Ympäröivä minuutti.** Suurin nopeus ±60 s:n sisällä, ja kuinka suuri osa tuosta minuutista oli nopeampaa kuin 40 km/h. Veto aivan automatkan vieressä on epäilyttävä jo pelkän asiayhteyden perusteella.",
      "**Nopeuden suunta.** Nouseva nopeus käsivarren ollessa rauhallinen tarkoittaa, että jokin muu vie lautaa yhä eteenpäin — usein jalat.",
      "**Miten kello on asettunut** — siitä lisää alempana, koska ajatus tuli ajajalta, joka katsoi yhtä sessiota.",
    ],
  },

  honest: {
    h: "Ei anneta mallin kopioida vanhoja sääntöjä",
    p:
      "Suurin kasa koulutusesimerkkejä on vanhan tunnistuksen löytämät vedot. Se on hyödyllistä — useimmat niistä ovat aitoja — mutta siinä on ansa: vanhojen vetojen reunat tulevat nopeusrajoista, joten niillä koulutettu malli oppii nuo nopeusrajat takaisin. Hidas pumppaaja teki ansan näkyväksi: malli, joka ei ollut koskaan nähnyt häntä, löysi vain neljänneksen hänen hitaasta pumppauksestaan.",
    p2:
      "Siksi kunkin vanhan vedon alun ja lopun kolme sekuntia eivät enää kelpaa esimerkeiksi lainkaan, ja riippumattomat totuudet (puhelin laudalla, karttatarkistus, ajajien omat poistot, kävely- ja ajotallennukset) painavat moninkertaisesti niin paljon kuin veto, jonka vanha tunnistus sattui löytämään. Ja sitten kysyimme, auttaisiko lisädata. Ei auttaisi: 4 ajajalla koulutettu malli on jo lähellä, ja noin **64 ajajasta** eteenpäin se ei parane lainkaan. Puuttumassa ei ole lisää samanlaisia sessioita — vaan parempaa totuutta.",
    cap: "Oppimiskäyrä: koulutettu 1–258 ajajalla, testattu aina ajajilla, joita se ei ollut koskaan nähnyt.",
  },

  pipeline: {
    h: "Todennäköisyydestä vetoihin",
    p:
      "Malli antaa todennäköisyyden sekuntia kohden. Sen muuttaminen vedoiksi osoittautui yhtä tärkeäksi kuin itse malli. Ensimmäinen ajatus — käyttää yksinkertaisesti mallia nopeusrajojen sijaan — tuotti tuhansia pikkuruisia ylimääräisiä vetoja, joita muut totuudet eivät vahvistaneet. Toimiva ratkaisu on ketju pieniä, tarkistettavia vaiheita:",
    li: [
      "**Aloita avokätisesti.** Ota vedot, jotka vanha tunnistus löytää, *ja* vedot, jotka löytyvät lähes ilman nopeusrajaa. Yhdessä ne sisältävät jokaisen vedon, joka ylipäätään voisi olla sellainen.",
      "**Leikkaa varmoiksi paloiksi.** Jaa jokainen ehdokas kohdista, joissa malli on epävarma, ja silloita muutaman sekunnin lyhyet notkahdukset.",
      "**Arvioi jokainen pala.** Pala, jonka keskimääräinen todennäköisyys on liian matala, pudotetaan pois.",
      "**Ole tiukka aivan lyhyiden kanssa.** Alle 8 sekunnin pala jää vain, jos malli on selvästi varma — useimmat lyhyet palat ovat rantakävelyn jäänteitä.",
    ],
    p2:
      "Järjestys merkitsee enemmän kuin luulisi. Kun kokonaiset ehdokkaat arvioitiin ensin ja leikattiin vasta sitten, aitoja vetoja heitettiin pois aina, kun kävely ja ajo olivat sulautuneet yhdeksi pitkäksi pätkäksi; kun ensin leikataan ja sitten arvioidaan jokainen pala, ne säilyvät. Ja **profiilisi herkkyysasetus** säilyttää merkityksensä: nopeusrajojen löysäämisen sijaan se nyt tekee mallin kynnysarvoista tiukempia tai väljempiä.",
  },

  watch: {
    h: "Miten kello on asettunut — ajatus rannalta",
    p:
      "Katsoessaan yhtä sessiota, jossa oli useita epäilyttäviä vetoja laiturin luona, Janilla heräsi aavistus: *kun olet foililla, kello on koko ajan samassa asennossa; kun kävelet, ei ole.* Mittasimme sen jokaisesta tallennuksesta, jonka vastauksen tiedämme. Verrattuna saman ajajan muihin varmoihin vetoihin samassa sessiossa kello on aidossa vedossa **5°:n** sisällä siitä, miten se oli aiemmin (mediaani). Kävely ja kantaminen maalla: **72°**. Vedot maalla: **75°**. Puhelin laudalla -ajot vahvistavat sen riippumattomasti: 3–7° ajon aikana, 39–91° autolle kävellessä.",
    cap1: "Kellon kulma verrattuna saman ajajan muihin vetoihin samassa sessiossa.",
    p2:
      "Ajatuksen toinen puolisko — kävely on levotonta, auto äärimmäinen — osoittautui toisin päin, ja juuri se on mittaamisessa hauskaa. Kymmenen sekunnin ajalta kävely ja autossa istuminen ovat **täysin vakaita**: käsi roikkuu, kädet lepäävät ratilla. Vedon erottaa se, että kello on vakaa pääsuunnassaan **ja** kiertyy jatkuvasti sen ympäri: noin **29° sekunnissa**, kun ranne kiertyy jokaisen pumppauksen mukana, verrattuna 7° sekunnissa kävellessä tai ajaessa.",
    cap2: "Vasemmalla: pelkkä vakaus ei erottele mitään. Oikealla: vakaa ja kiertyvä samaan aikaan — tältä veto näyttää.",
    p3:
      "Miksi siitä ei tehdä ehdotonta sääntöä? Yritimme. Ajajat eroavat liikaa: yksi pumppaa kalliovakaalla ranteella, toinen — lyhyillä vedoilla — näyttää tällä mittarilla lähes kävelijältä, ja ajajat, jotka vaihtavat asentoa kesken session, pitävät kelloa eri tavalla joka toisessa vedossa. Sääntönä se heitti pois aitoja ajoja, jotka laudalla ollut puhelin oli vahvistanut. **Kolmena lisäsyötteenä mallille** se auttaa, ja siihen se jää.",
  },

  result: {
    h: "Mikä muuttuu",
    p:
      "Mitattu 2 648 liikedatallisesta tallennuksesta, jokainen ajaja sivussa pidettynä kuten yllä kuvattiin:",
    cap: "Vedot, joita ei pitäisi laskea — vanha tunnistus uutta vastaan.",
    li: [
      "**Vedot maalla** (karttatarkistus): 81/82 yhä laskettuna → **19**. Useat jäljelle jääneistä ovat rannan GPS-virheitä, joissa käsi selvästi pumppaa, joten nolla ei ole oikea tavoite.",
      "**Lyhyet vedot automatkan vieressä:** 25 → **1**.",
      "**Vedot pätkissä, jotka ajajat olivat poistaneet:** 73 → **24**.",
      "**Laudalla olevaa puhelinta vasten:** niistä sekunneista, jotka kello nimeää on-foil-sekunneiksi, 87,2 % oli oikein → **92,2 %**. Todella foililla olleista sekunneista se löytää 93 % (ennen: 95 %) — hieman siitä on hinta epäilyttävien vetojen reunojen leikkaamisesta.",
      "**Hidas pumppaaja:** 22 → **26 minuuttia**, ja se ilman, että malli olisi koskaan nähnyt häntä.",
      "**Ennätykset:** parkkipaikkakierros katoaa nopeusennätyksistä, joen vieressä tiellä ajettu veto matka- ja kestoennätyksistä.",
    ],
  },

  failed: {
    h: "Mikä ei toiminut",
    p: "Rehellisyyteen kuuluu myös umpikujien kirjaaminen:",
    li: [
      "**Malli yksinään nopeusrajojen sijaan:** tuhansia ylimääräisiä minivetoja, useimmat vahvistamattomia.",
      "**Isompi malli** (kaksi kertaa enemmän puita, kaksi kertaa enemmän lehtiä): ei yhtään parempi.",
      "**Koulutusdatan siivoaminen vesikartalla:** vähemmän maavetoja, mutta satama, jota kartta ei tunne vedeksi, vei hitaalta pumppaajalta hänen esimerkkinsä.",
      "**Ehdottomat säännöt kellon asennosta:** ne nappaavat kävelyt, ja aidot ajot niiden mukana.",
      "**Liukujen tunnistaminen:** puhelin laudalla -ajoissa on vain 31 sekuntia aitoa liukua — ajajat pumppasivat lähes koko ajan. Ei vielä mitattavissa.",
    ],
  },

  status: {
    h: "Käytössä 30. syyskuuta 2026 alkaen — mikä muuttui",
    p:
      "Ennen käyttöönottoa koko analyysi — vedot, pumppaukset, liu’ut, ennätykset ja kaikki — ajettiin regressiotestinä jokaisen liikedatallisen tallennuksen yli, tallennettujen tulosten rinnalla ja muuttamatta yhtäkään niistä. Se toisti tämän päivän tallennetut luvut tarkalleen 2 724 tallennuksessa 2 743:sta (loput oli tallennettu vanhemmalla koodilla), joten testi mittasi sitä, mitä se väitti mittaavansa. Sitten jokainen 2 743 tallennuksesta laskettiin uudelleen uudella tunnistuksella:",
    li: [
      "**Vedot:** 18 765 → **19 336** (+3 %) — muutama maa- ja autoveto vähemmän, enemmän hitaita jatkoja ja lyhyitä aitoja vetoja.",
      "**Foilausaika:** 235,9 h → **242,9 h** (+3 %). **Matka:** 3 507 km → **3 558 km**. **Pumppaukset:** 1 340 913 → **1 375 236**.",
      "**Tallennukset, joita ei enää lasketa pumpfoilaukseksi:** 16 — useimmat niistä kartalta vahvistettuja vetoja maalla, loput kukin kourallinen sekunteja; 8 muuta lasketaan nyt ensimmäistä kertaa.",
      "**Nopeusennätykset:** neljä merkintää putosi kaikkien aikojen kymmenen parhaan listalta, ja kaikki neljä olivat vetoja maalla — parkkipaikkakierros mukaan lukien. Matka- ja kestoennätykset siirtyivät sekunteja ja metrejä vetojen reunoilla, ei enempää.",
    ],
    p2: "Mitä näet omissa sessioissasi:",
    li2: [
      "**Tunnistuksen sivuun laittamat vedot** näkyvät vetotaulukon alla syineen, ja yksi napautus palauttaa vedon, jos tunnistus erehtyi. Vetoa, jonka olet palauttanut tai poistanut itse, myöhempi malli ei koskaan kumoa — sinun päätöksesi voittaa aina.",
      "**Profiilisi herkkyysasetus** määrää nyt, kuinka tiukka malli on: *Vakio*, *Herkempi* ja *Herkin* säilyttävät yhä enemmän epäilyttäviä ja lyhyitä paloja. Vanhat nopeusrajat ovat yhä voimassa, mutta ne eivät enää päätä yksin.",
      "**Uudet tallennukset** analysoidaan uudella tunnistuksella heti, kun lataus on valmis; latauksen aikaiset alustavat luvut tulevat yhä edellisestä tunnistuksesta.",
    ],
  },

  help: {
    h: "Näin voit auttaa: kello ja puhelin yhdessä",
    p:
      "Arvokkainta seuraavaa vaihetta varten eivät ole lisäsessiot — vaan **lisää sessioita, jotka on tallennettu kahdesti yhtä aikaa**: kello ranteessa kuten aina, ja lautaan kiinnitetty puhelin tallentamassa saman ajon ([Osa 4](/nerd-analysen-4) näyttää järjestelyn; se on yksi hihna ja kuivapussi). Jokainen tällainen ajo kertoo meille sekunti sekunnilta, mitä lauta oikeasti teki — ja tänään tuo totuus tulee vain kahdelta ajajalta. Erityisen hyödyllisiä:",
    li: [
      "**Ajajat, jotka pumppaavat eri tavalla** — hitaasti ja tasaisesti, jaloilla, rauhallisella kädellä. Juuri näitä tyylejä tunnistus näkee vähiten.",
      "**Liu’ut.** Ajot, joissa pumppaat vauhtia ja liu’ut sitten muutaman sekunnin ennen kuin pumppaat taas. Niitä meillä ei ole juuri lainkaan.",
      "**Kaikki ajon ympärillä.** Kävely vedelle, melominen ulos, seisominen laiturilla, laudan kantaminen takaisin — anna tallennuksen olla päällä.",
      "**Muut kellot.** Jokainen kellomalli liikkuu ranteessa hieman eri tavalla.",
    ],
    p2:
      "Tallentaaksesi puhelimella kytke profiilissasi puhelintallennin päälle, käynnistä se puhelimessa ja kellossa ennen kuin nouset laudalle, ja pysäytä molemmat jälkeenpäin. Molemmat tallennukset näkyvät sessioissasi tavalliseen tapaan; kohdistamme ne ajan perusteella, joten sinun ei tarvitse tehdä mitään muuta.",
  },
};

const cs: N5 = {
  back: "← Část 4: Telefon přilepený na prkno",
  h1: "Část 5: Model detekce",
  subtitle: "Nová detekce jízdy na foilu, postavená ze všeho, co nám jezdci řekli — a kde vás ještě potřebuje",
  intro:
    "Všechno, co tento web počítá — jízdy, čas na foilu, vzdálenost, pumpy, rekordy — začíná jedním rozhodnutím za sekundu: **je tento člověk právě teď na foilu?** Když je toto rozhodnutí špatně, je špatně i každé číslo za ním. Detekce, která běží dnes, funguje u většiny záznamů dobře, ale jezdci nám v posledních týdnech ukázali přesně, kde selhává. Tato část vypráví, jak jsme to rozhodnutí postavili znovu od nuly, změřené proti každému kousku pravdy, který máme — a končí prosbou: potřebujeme víc záznamů pořízených s hodinkami na zápěstí **a** telefonem na prkně zároveň.",

  problem: {
    h: "Kde stará detekce chybuje",
    p:
      "Současná detekce kombinuje rychlostní meze (jízda začíná nad jednou rychlostí a končí pod jinou) s natrénovaným modelem, který se dívá na pohyb zápěstí. Opakovaně se objevovaly tři druhy chyb:",
    li: [
      "**Jízdy na souši.** Pár sekund svižné chůze po břehu, nesení prkna zpátky k molu, poklus k autu — ve správné rychlosti a s mávající rukou to může projít jako jízda. Jedno kolečko po parkovišti ve 30 km/h se dokonce dostalo do rychlostních rekordů.",
      "**Jízdy hned vedle jízdy autem.** Zapomenete ukončit záznam, jedete domů a první sekundy cesty mohou vypadat jako jízda.",
      "**Pomalí pumpaři přijdou o kus.** Jeden jezdec, který pumpuje pomalu a vytrvale, nám napsal, že jeho jízdám chybí skoro polovina. Měl pravdu: pumpuje dál v 5–10 km/h i po bodě, kde stará rychlostní mez jízdu ukončí.",
    ],
  },

  truth: {
    h: "Proti čemu můžeme kontrolovat",
    p:
      "Detekce je jen tak dobrá jako to, proti čemu ji měříte, a lákavá zkratka — měřit novou detekci proti staré — vás jen naučí kopírovat staré chyby. Sesbírali jsme proto každý nezávislý kousek pravdy, který jsme našli:",
    li: [
      "**Telefon na prkně** ([Část 4](/nerd-analysen-4)). Nahrává současně s hodinkami na zápěstí a říká sekundu po sekundě, jestli se na prkně pumpovalo — žádné hádání z ruky. Zatím se hodí šest jízd, dva jezdci, asi 2,5 hodiny.",
      "**Jízdy zkontrolované na mapě.** Každou jízdu, která leží z větší části víc než 60 m od vody, jsme si prohlédli na mapě: 49 záznamů s jízdami jasně na souši, 22 na úzké vodě, kterou mapa vod nezná (kanály, řeky, bazén).",
      "**Co jezdci sami vyřadili.** Úseky, které jezdci vyřadili ze svých vlastních záznamů — celkem 234 minut —, jsou asi to nejpoctivější označení, jaké existuje.",
      "**Záznamy bez jakéhokoli pumpfoilingu.** Procházky a jízdy autem zaznamenané hodinkami, schválně nebo omylem.",
      "**Vlastní popis jezdce.** Výše zmíněný pomalý pumpař: všechny jeho jízdy, včetně pomalých částí po starém ukončení, jsme použili jako příklady skutečného pumpování.",
    ],
    p2:
      "Každý výsledek níže je měřený na jezdcích, které model **během tréninku nikdy neviděl**. Pětkrát po sobě se jedna pětina jezdců odloží stranou, model se učí na zbytku a hodnotí se jen na těch, které nepoznal. Jinak se model prostě naučí lidi a čísla lžou.",
  },

  features: {
    h: "Co model dostane vidět",
    p:
      "Starý model se díval na 14 čísel za sekundu, většinou o velikosti pohybu zápěstí. Nový jich vidí 42. Nejvíc záleželo na těchto:",
    li: [
      "**Tři osy vůči gravitaci, každá zvlášť.** Starý model viděl jen celkovou velikost pohybu, a tím zahodil jeho směr. Při pumpování se zápěstí pohybuje nahoru a dolů; při balancování, chůzi a řízení do stran. Rozdělené vůči gravitaci si přestanou být podobné.",
      "**Rytmus.** Kolik pohybu leží v pásmu pumpování (0,8–2,2 Hz), kolik v pásmu chůze (2,2–3,5 Hz), kolik jsou vibrace (5–12 Hz, silnice a motor) a jak je špičatý.",
      "**Minuta kolem.** Nejvyšší rychlost v rozmezí ±60 s a jaká část té minuty byla rychlejší než 40 km/h. Jízda hned vedle jízdy autem je podezřelá už jen kvůli souvislostem.",
      "**Trend rychlosti.** Rychlost, která roste, zatímco je ruka klidná, znamená, že prkno ještě něco pohání — často nohy.",
      "**Jak hodinky sedí** — o tom víc níže, protože ten nápad přišel od jezdce, který se díval na jeden záznam.",
    ],
  },

  honest: {
    h: "Nenechat model opsat stará pravidla",
    p:
      "Největší hromada trénovacích příkladů jsou jízdy, které našla stará detekce. To je užitečné — většina z nich je skutečná —, ale skrývá to past: staré hranice jízd pocházejí z rychlostních mezí, takže model natrénovaný na nich se ty rychlostní meze naučí zpátky. Pomalý pumpař tu past zviditelnil: model, který ho nikdy neviděl, našel jen čtvrtinu jeho pomalého pumpování.",
    p2:
      "Proto tři sekundy na začátku a na konci každé staré jízdy už vůbec nepočítáme jako příklady, a nezávislé pravdy (telefon na prkně, kontrola na mapě, vyřazení samotnými jezdci, záznamy chůze a jízdy autem) váží několikrát víc než jízda, kterou stará detekce náhodou našla. A pak jsme se zeptali, jestli by pomohlo víc dat. Nepomohlo by: model natrénovaný na 4 jezdcích je už blízko a od zhruba **64 jezdců** se už vůbec nezlepšuje. Nechybí další záznamy stejného druhu — chybí lepší pravda.",
    cap: "Křivka učení: trénováno na 1 až 258 jezdcích, testováno vždy na jezdcích, které model nikdy neviděl.",
  },

  pipeline: {
    h: "Od pravděpodobnosti k jízdám",
    p:
      "Model dává pravděpodobnost pro každou sekundu. Ukázalo se, že převést ji na jízdy je stejně důležité jako model samotný. První nápad — prostě použít model místo rychlostních mezí — vytvořil tisíce drobných jízd navíc, které ostatní pravdy nepotvrdily. Funguje řetězec malých, ověřitelných kroků:",
    li: [
      "**Začít velkoryse.** Vezmeme jízdy, které najde stará detekce, *a* jízdy nalezené skoro bez rychlostní meze. Dohromady obsahují každou jízdu, která by jí vůbec mohla být.",
      "**Rozřezat na jisté kusy.** Každého kandidáta rozdělíme tam, kde si model není jistý, a krátké propady o pár sekundách přemostíme.",
      "**Posoudit každý kus.** Kus, jehož průměrná pravděpodobnost je příliš nízká, vypadne.",
      "**Přísně na ty úplně krátké.** Kus kratší než 8 sekund zůstane jen tehdy, když si je model jasně jistý — většina krátkých kusů jsou zbytky procházky po břehu.",
    ],
    p2:
      "Na pořadí záleží víc, než by se zdálo. Když jsme nejdřív posuzovali celé kandidáty a řezali až potom, zahodili jsme skutečné jízdy pokaždé, když chůze a jízda splynuly do jednoho dlouhého úseku; když nejdřív řežeme a pak posoudíme každý kus, zůstanou. A **nastavení citlivosti ve vašem profilu** si zachovává svůj význam: místo uvolňování rychlostních mezí teď dělá prahy modelu přísnějšími nebo mírnějšími.",
  },

  watch: {
    h: "Jak hodinky sedí — nápad z pláže",
    p:
      "Při pohledu na jeden záznam s několika pochybnými jízdami u mola dostal Jan tušení: *když jste na foilu, hodinky sedí celou dobu stejně; když jdete, tak ne.* Změřili jsme to na každém záznamu, u kterého známe odpověď. Ve srovnání s ostatními jistými jízdami téhož jezdce v tomtéž záznamu sedí hodinky ve skutečné jízdě do **5°** od toho, jak seděly předtím (medián). Chůze a nesení na souši: **72°**. Jízdy na souši: **75°**. Jízdy s telefonem na prkně to potvrzují nezávisle: 3–7° při jízdě, 39–91° při chůzi k autu.",
    cap1: "Úhel hodinek ve srovnání s ostatními jízdami téhož jezdce v tomtéž záznamu.",
    p2:
      "Druhá polovina nápadu — chůze je neklidná, auto je extrémní — vyšla přesně obráceně, a to je na měření to zábavné. Během deseti sekund jsou chůze i sezení v autě **dokonale klidné**: ruka visí, ruce leží na volantu. Jízdu odlišuje to, že hodinky jsou klidné ve svém hlavním směru **a** zároveň se kolem něj stále otáčejí: asi **29° za sekundu** od zápěstí, které se otočí s každou pumpou, oproti 7° za sekundu při chůzi nebo jízdě autem.",
    cap2: "Vlevo: klid sám o sobě neodliší nic. Vpravo: klidné a zároveň otáčející se — tak vypadá jízda.",
    p3:
      "Proč z toho neudělat pevné pravidlo? Zkusili jsme to. Jezdci se liší příliš: jeden pumpuje se zápěstím pevným jako skála, jiný — s krátkými jízdami — vypadá podle tohoto měřítka skoro jako někdo, kdo jde, a jezdci, kteří během záznamu mění postoj, drží hodinky v každé druhé jízdě jinak. Jako pravidlo to zahazovalo skutečné jízdy, které telefon na prkně potvrdil. Jako **tři další vstupy pro model** to pomáhá, a tam to také zůstane.",
  },

  result: {
    h: "Co se změní",
    p:
      "Měřeno na 2 648 záznamech s pohybovými daty, s každým jezdcem odloženým stranou, jak je popsáno výše:",
    cap: "Jízdy, které by se neměly počítat — stará detekce proti nové.",
    li: [
      "**Jízdy na souši** (kontrola na mapě): 81 z 82 se stále počítalo → **19**. Několik zbývajících jsou chyby GPS u břehu, kde ruka jasně pumpuje, takže nula není správný cíl.",
      "**Krátké jízdy vedle jízdy autem:** 25 → **1**.",
      "**Jízdy uvnitř úseků, které jezdci vyřadili:** 73 → **24**.",
      "**Proti telefonu na prkně:** ze sekund, které hodinky označí jako na foilu, jich skutečně na foilu bylo 87,2 % → **92,2 %**. Ze sekund skutečně na foilu jich najde 93 % (dříve: 95 %) — trochu z toho je cena za odříznutí pochybných okrajů jízd.",
      "**Pomalý pumpař:** 22 → **26 minut**, a to aniž by ho model kdy viděl.",
      "**Rekordy:** kolečko po parkovišti zmizí z rychlostních rekordů, jízda po silnici vedle řeky z rekordů vzdálenosti a délky.",
    ],
  },

  failed: {
    h: "Co nefungovalo",
    p: "K poctivé práci patří zapsat i slepé uličky:",
    li: [
      "**Samotný model místo rychlostních mezí:** tisíce mikrojízd navíc, většina z nich nepotvrzená.",
      "**Větší model** (dvakrát víc stromů, dvakrát víc listů): vůbec ne lepší.",
      "**Čištění trénovacích dat pomocí mapy vod:** méně jízd na souši, ale přístav, který mapa jako vodu nezná, stál pomalého pumpaře jeho příklady.",
      "**Pevná pravidla pro to, jak hodinky sedí:** zachytí procházky, a s nimi i skutečné jízdy.",
      "**Rozpoznávání klouzání:** jízdy s telefonem na prkně obsahují jen 31 sekund skutečného klouzání — jezdci pumpovali skoro pořád. Zatím se to nedá změřit.",
    ],
  },

  status: {
    h: "V provozu od 30. září 2026 — co se změnilo",
    p:
      "Před zapnutím proběhla celá analýza — jízdy, pumpy, klouzání, rekordy a vše ostatní — jako regresní test nad každým záznamem s pohybovými daty, vedle uložených výsledků a bez změny kteréhokoli z nich. U 2 724 z 2 743 záznamů přesně zopakovala dnešní uložená čísla (zbytek byl uložen starším kódem), takže test měřil to, co tvrdil. Pak bylo všech 2 743 záznamů přepočítáno novou detekcí:",
    li: [
      "**Jízdy:** 18 765 → **19 336** (+3 %) — o pár jízd na souši a v autě méně, víc pomalých pokračování a krátkých skutečných jízd.",
      "**Čas na foilu:** 235,9 h → **242,9 h** (+3 %). **Vzdálenost:** 3 507 km → **3 558 km**. **Pumpy:** 1 340 913 → **1 375 236**.",
      "**Záznamy, které se už nepočítají jako pumpfoiling:** 16 — většina z nich jízdy na souši potvrzené na mapě, zbytek po pár sekundách; 8 dalších se nyní počítá poprvé.",
      "**Rychlostní rekordy:** čtyři záznamy opustily celkovou první desítku a všechny čtyři byly jízdy na souši — mezi nimi i kolečko po parkovišti. Rekordy vzdálenosti a délky se posunuly o sekundy a metry na okrajích jízd, nic víc.",
    ],
    p2: "Co uvidíte ve svých vlastních záznamech:",
    li2: [
      "**Jízdy, které detekce odložila stranou,** jsou uvedené pod tabulkou jízd i s důvodem a jedním klepnutím jízdu vrátíte, pokud se detekce spletla. Jízdu, kterou jste vrátili nebo sami vyřadili, pozdější model nikdy nepřehlasuje — vaše rozhodnutí vždy vyhrává.",
      "**Nastavení citlivosti ve vašem profilu** teď určuje, jak přísný je model: *Standard*, *Citlivější* a *Nejcitlivější* ponechávají čím dál víc pochybných a krátkých kusů. Staré rychlostní meze platí dál také, ale už nerozhodují samy.",
      "**Nové záznamy** se analyzují novou detekcí, jakmile je nahrávání dokončené; předběžná čísla během nahrávání pocházejí ještě z předchozí detekce.",
    ],
  },

  help: {
    h: "Jak můžete pomoct: hodinky a telefon zároveň",
    p:
      "Nejcennější věc pro další krok nejsou další záznamy — jsou to **další záznamy pořízené dvakrát najednou**: hodinky na zápěstí jako vždy a telefon připevněný na prkně, který nahrává tutéž jízdu ([Část 4](/nerd-analysen-4) ukazuje sestavu; je to jeden popruh a vodotěsný vak). Každá taková jízda nám sekundu po sekundě řekne, co prkno skutečně dělalo — a dnes ta pravda pochází jen od dvou jezdců. Obzvlášť užitečné:",
    li: [
      "**Jezdci, kteří pumpují jinak** — pomalu a vytrvale, nohama, s klidnou rukou. Přesně tyto styly detekce vidí nejméně.",
      "**Klouzání.** Jízdy, kdy se napumpujete a pak pár sekund kloužete, než začnete znovu pumpovat. Nemáme skoro žádné.",
      "**Všechno kolem jízdy.** Chůze k vodě, pádlování ven, stání u mola, nesení prkna zpátky — nechte záznam běžet.",
      "**Jiné hodinky.** Každý model hodinek se na zápěstí pohybuje trochu jinak.",
    ],
    p2:
      "Pro nahrávání telefonem zapněte v profilu „Recorder v telefonu“, spusťte ho na telefonu i na hodinkách, než si stoupnete na prkno, a potom obojí zastavte. Oba záznamy se jako obvykle objeví ve vašich záznamech; spárujeme je podle času, takže už nemusíte dělat nic dalšího.",
  },
};

const pl: N5 = {
  back: "← Część 4: Telefon przyklejony taśmą do deski",
  h1: "Część 5: Model wykrywania",
  subtitle: "Nowe wykrywanie jazdy na foilu, zbudowane ze wszystkiego, co powiedzieli nam riderzy — i tam, gdzie wciąż potrzebuje Ciebie",
  intro:
    "Wszystko, co liczy ta strona — przejazdy, czas na foilu, dystans, pompowania, rekordy — zaczyna się od jednej decyzji na sekundę: **czy ta osoba jest właśnie teraz na foilu?** Jeśli ta decyzja jest błędna, błędna jest też każda liczba po niej. Wykrywanie, które działa dziś, sprawdza się dobrze w większości sesji, ale w ostatnich tygodniach riderzy pokazali nam dokładnie, gdzie zawodzi. Ta część opowiada, jak zbudowaliśmy tę decyzję od zera, mierząc ją względem każdego kawałka prawdy, jaki mamy — i kończy się prośbą: potrzebujemy więcej sesji nagranych jednocześnie z zegarkiem na nadgarstku **i** telefonem na desce.",

  problem: {
    h: "Gdzie stare wykrywanie się myli",
    p:
      "Obecne wykrywanie łączy progi prędkości (przejazd zaczyna się powyżej jednej prędkości i kończy poniżej innej) z wytrenowanym modelem, który patrzy na ruch nadgarstka. Wciąż powracały trzy rodzaje błędów:",
    li: [
      "**Przejazdy na lądzie.** Kilka sekund żwawego marszu brzegiem, niesienie deski z powrotem na pomost, trucht do samochodu — przy odpowiedniej prędkości i machającej ręce może to przejść za przejazd. Jedno kółko po parkingu z prędkością 30 km/h trafiło nawet do rekordów prędkości.",
      "**Przejazdy tuż obok jazdy samochodem.** Zapominasz zatrzymać nagrywanie, jedziesz do domu, a pierwsze sekundy jazdy mogą wyglądać jak przejazd.",
      "**Wolni pompujący obcięci.** Jeden rider, który pompuje wolno i równo, napisał nam, że jego przejazdom brakuje prawie połowy. Miał rację: pompuje dalej przy 5–10 km/h po punkcie, w którym stary próg prędkości kończy przejazd.",
    ],
  },

  truth: {
    h: "Z czym możemy porównać",
    p:
      "Wykrywanie jest tylko tak dobre jak to, względem czego je mierzysz, a kusący skrót — mierzenie nowego wykrywania względem starego — uczy tylko kopiować stare błędy. Zebraliśmy więc każdy niezależny kawałek prawdy, jaki udało się znaleźć:",
    li: [
      "**Telefon na desce** ([Część 4](/nerd-analysen-4)). Nagrywany równocześnie z zegarkiem na nadgarstku, mówi sekunda po sekundzie, czy deska była pompowana — bez zgadywania z ręki. Na razie kwalifikuje się sześć jazd, dwóch riderów, około 2,5 godziny.",
      "**Przejazdy sprawdzone na mapie.** Każdy przejazd, który w większości leży dalej niż 60 m od wody, obejrzeliśmy na mapie: 49 nagrań z przejazdami wyraźnie na lądzie, 22 na wąskiej wodzie, której mapa wód nie zna (kanały, rzeki, basen).",
      "**Co riderzy sami usunęli.** Odcinki, które riderzy wycięli z własnych sesji — łącznie 234 minuty —, to chyba najuczciwsza etykieta, jaka istnieje.",
      "**Nagrania bez żadnego pumpfoilingu.** Spacery i jazdy samochodem nagrane zegarkiem, celowo lub przez przypadek.",
      "**Relacja samego ridera.** Wspomniany wolny pompujący: wszystkie jego przejazdy, łącznie z wolnymi fragmentami po starym obcięciu, wykorzystaliśmy jako przykłady prawdziwego pompowania.",
    ],
    p2:
      "Każdy wynik poniżej jest zmierzony na riderach, których model **nigdy nie widział podczas treningu**. Pięć razy z rzędu jedna piąta riderów zostaje odłożona na bok, model uczy się na reszcie i jest oceniany tylko na tych, których nie poznał. W przeciwnym razie model po prostu uczy się ludzi, a liczby kłamią.",
  },

  features: {
    h: "Co model widzi",
    p:
      "Stary model patrzył na 14 liczb na sekundę, głównie o wielkości ruchu nadgarstka. Nowy widzi 42. Najważniejsze okazały się te:",
    li: [
      "**Trzy osie względem grawitacji, osobno.** Stary model widział tylko całkowitą wielkość ruchu, co wyrzuca jego kierunek. Pompowanie porusza nadgarstkiem w górę i w dół; balansowanie, chodzenie i sterowanie — na boki. Rozdzielone względem grawitacji przestają być do siebie podobne.",
      "**Rytm.** Ile ruchu leży w paśmie pompowania (0,8–2,2 Hz), ile w paśmie chodzenia (2,2–3,5 Hz), ile to wibracje (5–12 Hz, droga i silnik) i jak bardzo jest szpiczasty.",
      "**Minuta dookoła.** Najwyższa prędkość w obrębie ±60 s i jaka część tej minuty była szybsza niż 40 km/h. Przejazd tuż obok jazdy samochodem jest podejrzany już przez sam kontekst.",
      "**Trend prędkości.** Rosnąca prędkość przy spokojnej ręce oznacza, że coś wciąż napędza deskę — często nogi.",
      "**Jak trzymany jest zegarek** — więcej o tym niżej, bo ten pomysł wyszedł od ridera oglądającego jedną sesję.",
    ],
  },

  honest: {
    h: "Nie pozwolić modelowi przepisać starych reguł",
    p:
      "Największa sterta przykładów treningowych to przejazdy znalezione przez stare wykrywanie. To przydatne — większość z nich jest prawdziwa —, ale kryje pułapkę: stare granice przejazdów pochodzą z progów prędkości, więc model wytrenowany na nich uczy się tych progów z powrotem. Wolny pompujący uwidocznił tę pułapkę: model, który go nigdy nie widział, znalazł tylko ćwierć jego wolnego pompowania.",
    p2:
      "Dlatego trzy sekundy na początku i na końcu każdego starego przejazdu w ogóle nie liczą się już jako przykłady, a niezależne prawdy (telefon na desce, sprawdzenie na mapie, usunięcia przez samych riderów, nagrania chodzenia i jazdy samochodem) ważą kilka razy więcej niż przejazd, który stare wykrywanie akurat znalazło. A potem zapytaliśmy, czy pomogłoby więcej danych. Nie pomogłoby: model wytrenowany na 4 riderach jest już blisko, a od około **64 riderów** nie poprawia się wcale. Nie brakuje kolejnych sesji tego samego rodzaju — brakuje lepszej prawdy.",
    cap: "Krzywa uczenia: trenowany na 1 do 258 riderach, zawsze testowany na riderach, których nigdy nie widział.",
  },

  pipeline: {
    h: "Od prawdopodobieństwa do przejazdów",
    p:
      "Model podaje prawdopodobieństwo dla każdej sekundy. Okazało się, że zamiana go na przejazdy jest równie ważna jak sam model. Pierwszy pomysł — po prostu użyć modelu zamiast progów prędkości — dał tysiące maleńkich dodatkowych przejazdów, których pozostałe prawdy nie potwierdziły. Działa łańcuch małych, sprawdzalnych kroków:",
    li: [
      "**Zacząć hojnie.** Bierzemy przejazdy, które znajduje stare wykrywanie, *i* przejazdy znalezione niemal bez progu prędkości. Razem zawierają każdy przejazd, który w ogóle mógłby nim być.",
      "**Pociąć na pewne kawałki.** Każdego kandydata dzielimy tam, gdzie model nie jest pewny, mostkując krótkie spadki trwające kilka sekund.",
      "**Ocenić każdy kawałek.** Kawałek, którego średnie prawdopodobieństwo jest za niskie, odpada.",
      "**Surowo z tymi bardzo krótkimi.** Kawałek krótszy niż 8 sekund zostaje tylko wtedy, gdy model jest wyraźnie pewny — większość krótkich kawałków to resztki spaceru brzegiem.",
    ],
    p2:
      "Kolejność ma większe znaczenie, niż można by pomyśleć. Ocenianie najpierw całych kandydatów, a cięcie dopiero potem wyrzucało prawdziwe przejazdy za każdym razem, gdy spacer i jazda zlały się w jeden długi odcinek; najpierw cięcie, a potem ocena każdego kawałka je zachowuje. A **ustawienie czułości w Twoim profilu** zachowuje swoje znaczenie: zamiast luzować progi prędkości, teraz czyni progi modelu bardziej lub mniej surowymi.",
  },

  watch: {
    h: "Jak siedzi zegarek — pomysł z plaży",
    p:
      "Oglądając jedną sesję z kilkoma wątpliwymi przejazdami przy pomoście, Jan miał przeczucie: *gdy jesteś na foilu, zegarek siedzi cały czas tak samo; gdy idziesz, już nie.* Zmierzyliśmy to na każdym nagraniu, dla którego znamy odpowiedź. W porównaniu z innymi pewnymi przejazdami tego samego ridera w tej sesji zegarek w prawdziwym przejeździe siedzi w granicach **5°** od tego, jak siedział wcześniej (mediana). Chodzenie i noszenie na lądzie: **72°**. Przejazdy na lądzie: **75°**. Jazdy z telefonem na desce potwierdzają to niezależnie: 3–7° podczas jazdy, 39–91° podczas drogi do samochodu.",
    cap1: "Kąt zegarka w porównaniu z innymi przejazdami tego samego ridera w tej sesji.",
    p2:
      "Druga połowa pomysłu — chodzenie jest niespokojne, samochód jest ekstremalny — wyszła dokładnie na odwrót, i to jest właśnie frajda z mierzenia. W ciągu dziesięciu sekund chodzenie i siedzenie w samochodzie są **idealnie spokojne**: ręka wisi, dłonie leżą na kierownicy. Przejazd wyróżnia to, że zegarek jest spokojny w swoim głównym kierunku **i** stale się wokół niego obraca: około **29° na sekundę** od nadgarstka obracającego się przy każdym pompowaniu, wobec 7° na sekundę przy chodzeniu lub jeździe samochodem.",
    cap2: "Z lewej: sam spokój niczego nie rozdziela. Z prawej: spokojny i jednocześnie obracający się — tak wygląda przejazd.",
    p3:
      "Dlaczego nie zrobić z tego sztywnej reguły? Próbowaliśmy. Riderzy różnią się za bardzo: jeden pompuje z nadgarstkiem stabilnym jak skała, inny — z krótkimi przejazdami — wygląda według tej miary prawie jak ktoś, kto idzie, a riderzy, którzy w trakcie sesji zmieniają stance, trzymają zegarek inaczej w co drugim przejeździe. Jako reguła wyrzucało to prawdziwe jazdy, które telefon na desce potwierdził. Jako **trzy dodatkowe wejścia dla modelu** pomaga, i tam zostaje.",
  },

  result: {
    h: "Co się zmienia",
    p:
      "Zmierzone na 2 648 nagraniach z danymi ruchu, z każdym riderem odłożonym na bok, jak opisano wyżej:",
    cap: "Przejazdy, które nie powinny być liczone — stare wykrywanie wobec nowego.",
    li: [
      "**Przejazdy na lądzie** (sprawdzenie na mapie): 81 z 82 wciąż liczonych → **19**. Kilka z pozostałych to błędy GPS przy brzegu, gdzie ręka wyraźnie pompuje, więc zero nie jest właściwym celem.",
      "**Krótkie przejazdy obok jazdy samochodem:** 25 → **1**.",
      "**Przejazdy wewnątrz odcinków usuniętych przez riderów:** 73 → **24**.",
      "**Względem telefonu na desce:** z sekund, które zegarek uznaje za jazdę na foilu, prawdziwych było 87,2 % → **92,2 %**. Z sekund naprawdę na foilu znajduje 93 % (wcześniej: 95 %) — trochę z tego to cena za obcinanie wątpliwych krawędzi przejazdów.",
      "**Wolny pompujący:** 22 → **26 minut**, i to bez tego, żeby model go kiedykolwiek widział.",
      "**Rekordy:** kółko po parkingu znika z rekordów prędkości, przejazd po drodze obok rzeki — z rekordów dystansu i czasu trwania.",
    ],
  },

  failed: {
    h: "Co nie zadziałało",
    p: "Do uczciwej pracy należy też zapisanie ślepych uliczek:",
    li: [
      "**Sam model zamiast progów prędkości:** tysiące dodatkowych mikroprzejazdów, większość z nich niepotwierdzona.",
      "**Większy model** (dwa razy więcej drzew, dwa razy więcej liści): wcale nie lepszy.",
      "**Czyszczenie danych treningowych mapą wód:** mniej przejazdów na lądzie, ale port, którego mapa nie zna jako wody, kosztował wolnego pompującego jego przykłady.",
      "**Sztywne reguły co do tego, jak trzymany jest zegarek:** łapią spacery, a razem z nimi prawdziwe jazdy.",
      "**Rozpoznawanie ślizgów:** jazdy z telefonem na desce zawierają tylko 31 sekund prawdziwego ślizgu — riderzy pompowali prawie cały czas. Na razie nie da się tego zmierzyć.",
    ],
  },

  status: {
    h: "Działa od 30 września 2026 — co się zmieniło",
    p:
      "Przed włączeniem cała analiza — przejazdy, pompowania, ślizgi, rekordy i wszystko inne — przeszła jako test regresyjny przez każde nagranie z danymi ruchu, obok zapisanych wyników i bez zmieniania żadnego z nich. Dokładnie odtworzyła dzisiejsze zapisane liczby dla 2 724 z 2 743 nagrań (reszta została zapisana starszym kodem), więc test mierzył to, co deklarował. Potem wszystkie 2 743 nagrania przeliczono nowym wykrywaniem:",
    li: [
      "**Przejazdy:** 18 765 → **19 336** (+3 %) — kilka przejazdów na lądzie i w samochodzie mniej, więcej wolnych kontynuacji i krótkich prawdziwych przejazdów.",
      "**Czas na foilu:** 235,9 h → **242,9 h** (+3 %). **Dystans:** 3 507 km → **3 558 km**. **Pompowania:** 1 340 913 → **1 375 236**.",
      "**Nagrania, które nie liczą się już jako pumpfoiling:** 16 — większość z nich to przejazdy na lądzie potwierdzone na mapie, reszta po kilka sekund; 8 innych liczy się teraz po raz pierwszy.",
      "**Rekordy prędkości:** cztery wpisy wypadły z pierwszej dziesiątki wszech czasów i wszystkie cztery były przejazdami na lądzie — wśród nich kółko po parkingu. Rekordy dystansu i czasu trwania przesunęły się o sekundy i metry na krawędziach przejazdów, nic więcej.",
    ],
    p2: "Co zobaczysz we własnych sesjach:",
    li2: [
      "**Przejazdy odłożone przez wykrywanie** są wypisane pod tabelą przejazdów razem z powodem, a jedno dotknięcie przywraca przejazd, jeśli wykrywanie się pomyliło. Przejazdu, który przywróciłeś albo sam usunąłeś, późniejszy model nigdy nie uchyli — Twoja decyzja zawsze wygrywa.",
      "**Ustawienie czułości w Twoim profilu** określa teraz, jak surowy jest model: *Standard*, *Czulsze* i *Najczulsze* zachowują coraz więcej wątpliwych i krótkich kawałków. Stare progi prędkości nadal obowiązują, ale już nie decydują same.",
      "**Nowe nagrania** są analizowane nowym wykrywaniem, gdy tylko przesyłanie się zakończy; wstępne liczby w trakcie przesyłania pochodzą jeszcze z poprzedniego wykrywania.",
    ],
  },

  help: {
    h: "Jak możesz pomóc: zegarek i telefon razem",
    p:
      "Najcenniejszą rzeczą dla następnego kroku nie są kolejne sesje — są to **kolejne sesje nagrane dwa razy naraz**: zegarek na nadgarstku jak zawsze i telefon przypięty do deski, nagrywający tę samą jazdę ([Część 4](/nerd-analysen-4) pokazuje zestaw; to jeden pasek i worek wodoszczelny). Każda taka jazda mówi nam sekunda po sekundzie, co naprawdę robiła deska — a dziś ta prawda pochodzi tylko od dwóch riderów. Szczególnie przydatne:",
    li: [
      "**Riderzy, którzy pompują inaczej** — wolno i równo, nogami, ze spokojną ręką. To właśnie style, które wykrywanie widzi najrzadziej.",
      "**Ślizgi.** Jazdy, w których się rozpompowujesz, a potem przez kilka sekund ślizgasz, zanim znów zaczniesz pompować. Nie mamy ich prawie wcale.",
      "**Wszystko wokół jazdy.** Chodzenie do wody, wypływanie, stanie na pomoście, niesienie deski z powrotem — zostaw nagrywanie włączone.",
      "**Inne zegarki.** Każdy model zegarka porusza się na nadgarstku trochę inaczej.",
    ],
    p2:
      "Aby nagrywać telefonem, włącz w swoim profilu „Nagrywanie telefonem“, uruchom go na telefonie i na zegarku, zanim wejdziesz na deskę, a potem zatrzymaj oba. Oba nagrania pojawią się jak zwykle w Twoich sesjach; dopasowujemy je po czasie, więc nie musisz robić nic więcej.",
  },
};

const ru: N5 = {
  back: "← Часть 4: Телефон приклеен к доске",
  h1: "Часть 5: Модель распознавания",
  subtitle: "Новое распознавание езды на фойле, построенное из всего, что нам рассказали райдеры, — и там, где оно всё ещё нуждается в вас",
  intro:
    "Всё, что считает этот сайт, — заезды, время на фойле, дистанция, пампы, рекорды — начинается с одного решения на каждую секунду: **находится ли этот человек прямо сейчас на фойле?** Если это решение неверно, неверно и каждое число после него. Распознавание, которое работает сегодня, хорошо справляется с большинством сессий, но за последние недели райдеры точно показали нам, где оно ломается. Эта часть — история о том, как мы заново построили это решение с нуля, проверяя его по каждому кусочку правды, который у нас есть, и заканчивается она просьбой: нам нужно больше сессий, записанных одновременно с часами на запястье **и** телефоном на доске.",

  problem: {
    h: "Где ошибается старое распознавание",
    p:
      "Нынешнее распознавание сочетает пороги скорости (заезд начинается выше одной скорости и заканчивается ниже другой) с обученной моделью, которая смотрит на движение запястья. Снова и снова встречались три вида ошибок:",
    li: [
      "**Заезды на суше.** Несколько секунд быстрой ходьбы вдоль берега, доска, которую несут обратно к пирсу, пробежка к машине — при подходящей скорости и размахивающей руке это может сойти за заезд. Один круг по парковке на 30 км/ч даже попал в рекорды скорости.",
      "**Заезды рядом с поездкой на машине.** Забыли остановить запись, поехали домой — и первые секунды поездки могут выглядеть как заезд.",
      "**Медленных пампёров обрезает.** Один райдер, который пампит медленно и ровно, написал нам, что у его заездов не хватает почти половины. Он был прав: он продолжает пампить на 5–10 км/ч после точки, где старый порог скорости заканчивает заезд.",
    ],
  },

  truth: {
    h: "С чем мы можем сверяться",
    p:
      "Распознавание хорошо ровно настолько, насколько хорошо то, с чем его сравнивают, а соблазнительный короткий путь — сравнивать новое распознавание со старым — учит лишь копировать старые ошибки. Поэтому мы собрали каждый независимый кусочек правды, который смогли найти:",
    li: [
      "**Телефон на доске** ([Часть 4](/nerd-analysen-4)). Записанный одновременно с часами на запястье, он секунда за секундой говорит, пампили ли доску, — никаких догадок по руке. Пока подходят шесть заездов, два райдера, около 2,5 часа.",
      "**Заезды, проверенные на карте.** Каждый заезд, который в основном лежит дальше 60 м от воды, мы просмотрели на карте: 49 записей с заездами явно на суше, 22 — на узкой воде, которую карта водоёмов не знает (каналы, реки, бассейн).",
      "**То, что райдеры убрали сами.** Отрезки, которые райдеры исключили из своих собственных сессий, — всего 234 минуты, — это, пожалуй, самая честная разметка, какая бывает.",
      "**Записи вообще без пампфойлинга.** Прогулки и поездки на машине, записанные часами, намеренно или случайно.",
      "**Рассказ самого райдера.** Упомянутый выше медленный пампёр: все его заезды, включая медленные части после старого обреза, мы использовали как примеры настоящего пампинга.",
    ],
    p2:
      "Каждый результат ниже измерен на райдерах, которых модель **ни разу не видела во время обучения**. Пять раз подряд одна пятая райдеров откладывается в сторону, модель учится на остальных и оценивается только на тех, с кем не встречалась. Иначе модель просто выучивает людей, и числа лгут.",
  },

  features: {
    h: "Что видит модель",
    p:
      "Старая модель смотрела на 14 чисел в секунду, в основном о величине движения запястья. Новая видит 42. Важнее всего оказались эти:",
    li: [
      "**Три оси относительно гравитации, по отдельности.** Старая модель видела только общую величину движения, а это выбрасывает его направление. При пампинге запястье движется вверх и вниз; при балансировке, ходьбе и рулении — в стороны. Разложенные относительно гравитации, они перестают быть похожими.",
      "**Ритм.** Какая доля движения лежит в полосе пампинга (0,8–2,2 Hz), какая — в полосе ходьбы (2,2–3,5 Hz), сколько приходится на вибрацию (5–12 Hz, дорога и двигатель) и насколько оно пиковое.",
      "**Минута вокруг.** Наибольшая скорость в пределах ±60 с и какая часть этой минуты была быстрее 40 км/ч. Заезд прямо рядом с поездкой на машине подозрителен уже по контексту.",
      "**Тренд скорости.** Скорость растёт, а рука спокойна — значит, что-то всё ещё двигает доску, часто ноги.",
      "**Как сидят часы** — об этом подробнее ниже, потому что эта идея пришла от райдера, смотревшего одну сессию.",
    ],
  },

  honest: {
    h: "Не дать модели списать старые правила",
    p:
      "Самая большая куча обучающих примеров — это заезды, найденные старым распознаванием. Это полезно — большинство из них настоящие, — но таит ловушку: старые границы заездов происходят из порогов скорости, так что модель, обученная на них, выучивает эти пороги обратно. Медленный пампёр сделал ловушку видимой: модель, которая его никогда не видела, нашла лишь четверть его медленного пампинга.",
    p2:
      "Поэтому три секунды в начале и в конце каждого старого заезда вообще больше не считаются примерами, а независимые правды (телефон на доске, проверка по карте, исключения самих райдеров, записи ходьбы и поездок на машине) весят в несколько раз больше, чем заезд, который старое распознавание случайно нашло. А потом мы спросили, помогло бы больше данных. Не помогло бы: модель, обученная на 4 райдерах, уже близка к цели, а начиная примерно с **64 райдеров** она не становится лучше вовсе. Не хватает не новых сессий того же рода — не хватает лучшей правды.",
    cap: "Кривая обучения: обучение на 1–258 райдерах, проверка всегда на райдерах, которых модель никогда не видела.",
  },

  pipeline: {
    h: "От вероятности к заездам",
    p:
      "Модель выдаёт вероятность для каждой секунды. Оказалось, что превратить её в заезды так же важно, как сама модель. Первая идея — просто использовать модель вместо порогов скорости — дала тысячи крошечных лишних заездов, которые другие правды не подтвердили. Работает цепочка маленьких проверяемых шагов:",
    li: [
      "**Начать щедро.** Берём заезды, которые находит старое распознавание, *и* заезды, найденные почти без порога скорости. Вместе они содержат каждый заезд, который вообще мог бы им быть.",
      "**Разрезать на уверенные куски.** Каждого кандидата делим там, где модель не уверена, перекрывая короткие провалы в несколько секунд.",
      "**Оценить каждый кусок.** Кусок, средняя вероятность которого слишком низка, отбрасывается.",
      "**Строго с совсем короткими.** Кусок короче 8 секунд остаётся, только если модель явно уверена, — большинство коротких кусков оказываются остатками прогулки вдоль берега.",
    ],
    p2:
      "Порядок важнее, чем можно подумать. Если сначала оценивать целых кандидатов, а резать потом, настоящие заезды выбрасывались всякий раз, когда прогулка и езда сливались в один длинный отрезок; если сначала резать, а потом оценивать каждый кусок, они сохраняются. А **настройка чувствительности в вашем профиле** сохраняет свой смысл: вместо того чтобы ослаблять пороги скорости, она теперь делает пороги модели строже или мягче.",
  },

  watch: {
    h: "Как сидят часы — идея с пляжа",
    p:
      "Глядя на одну сессию с несколькими сомнительными заездами у пирса, Ян заподозрил: *когда ты на фойле, часы всё время сидят одинаково; когда идёшь — нет.* Мы измерили это на каждой записи, для которой знаем ответ. По сравнению с другими надёжными заездами того же райдера в этой сессии часы в настоящем заезде сидят в пределах **5°** от того, как сидели до этого (медиана). Ходьба и переноска на суше: **72°**. Заезды на суше: **75°**. Заезды с телефоном на доске подтверждают это независимо: 3–7° во время езды, 39–91° по дороге к машине.",
    cap1: "Угол часов по сравнению с другими заездами того же райдера в этой сессии.",
    p2:
      "Вторая половина идеи — ходьба беспокойна, машина экстремальна — оказалась ровно наоборот, и в этом весь интерес измерений. За десять секунд ходьба и сидение в машине **совершенно спокойны**: рука висит, кисти лежат на руле. Заезд отличается тем, что часы спокойны в своём основном направлении **и** при этом постоянно вращаются вокруг него: около **29° в секунду** от запястья, которое поворачивается с каждым пампом, против 7° в секунду при ходьбе или поездке на машине.",
    cap2: "Слева: одно лишь спокойствие ничего не разделяет. Справа: спокойно и одновременно вращаясь — так выглядит заезд.",
    p3:
      "Почему не сделать из этого жёсткое правило? Мы пробовали. Райдеры слишком разные: один пампит с запястьем твёрдым как скала, другой — с короткими заездами — по этой мере выглядит почти как идущий человек, а райдеры, меняющие стойку посреди сессии, держат часы по-другому в каждом втором заезде. Как правило это выбрасывало настоящие заезды, которые подтвердил телефон на доске. Как **три дополнительных входа для модели** это помогает — там оно и остаётся.",
  },

  result: {
    h: "Что меняется",
    p:
      "Измерено на 2 648 записях с данными движения, каждый райдер отложен в сторону, как описано выше:",
    cap: "Заезды, которые не должны засчитываться, — старое распознавание против нового.",
    li: [
      "**Заезды на суше** (проверка по карте): 81 из 82 всё ещё засчитывались → **19**. Несколько оставшихся — это ошибки GPS у берега, где рука явно пампит, так что ноль — не правильная цель.",
      "**Короткие заезды рядом с поездкой на машине:** 25 → **1**.",
      "**Заезды внутри отрезков, которые райдеры исключили:** 73 → **24**.",
      "**Против телефона на доске:** из секунд, которые часы считают ездой на фойле, настоящими были 87,2 % → **92,2 %**. Из секунд, действительно проведённых на фойле, находится 93 % (раньше: 95 %) — немного из этого является ценой за обрезку сомнительных краёв заездов.",
      "**Медленный пампёр:** 22 → **26 минут**, и это при том, что модель его ни разу не видела.",
      "**Рекорды:** круг по парковке исчезает из рекордов скорости, заезд по дороге вдоль реки — из рекордов дистанции и длительности.",
    ],
  },

  failed: {
    h: "Что не сработало",
    p: "Честная работа включает и запись тупиков:",
    li: [
      "**Модель сама по себе вместо порогов скорости:** тысячи лишних микрозаездов, большинство из них не подтверждены.",
      "**Модель побольше** (вдвое больше деревьев, вдвое больше листьев): ничуть не лучше.",
      "**Очистка обучающих данных по карте водоёмов:** меньше заездов на суше, но гавань, которую карта не знает как воду, стоила медленному пампёру его примеров.",
      "**Жёсткие правила о том, как сидят часы:** ловят прогулки, а вместе с ними и настоящие заезды.",
      "**Распознавание глайда:** заезды с телефоном на доске содержат лишь 31 секунду настоящего глайда — райдеры пампили почти всё время. Пока это не измерить.",
    ],
  },

  status: {
    h: "Работает с 30 сентября 2026 — что изменилось",
    p:
      "Перед включением весь анализ — заезды, пампы, глайды, рекорды и всё прочее — прошёл как регрессионный тест по каждой записи с данными движения, рядом с сохранёнными результатами и не меняя ни одного из них. Он в точности воспроизвёл сегодняшние сохранённые числа для 2 724 из 2 743 записей (остальные были сохранены более старым кодом), так что тест измерял то, что заявлял. Затем все 2 743 записи были пересчитаны новым распознаванием:",
    li: [
      "**Заезды:** 18 765 → **19 336** (+3 %) — на несколько заездов на суше и в машине меньше, больше медленных продолжений и коротких настоящих заездов.",
      "**Время на фойле:** 235,9 ч → **242,9 ч** (+3 %). **Дистанция:** 3 507 км → **3 558 км**. **Пампы:** 1 340 913 → **1 375 236**.",
      "**Записи, которые больше не считаются пампфойлингом:** 16 — большинство из них заезды на суше, подтверждённые на карте, остальные — по нескольку секунд каждая; ещё 8 теперь учитываются впервые.",
      "**Рекорды скорости:** четыре записи покинули первую десятку за всё время, и все четыре были заездами на суше — среди них круг по парковке. Рекорды дистанции и длительности сдвинулись на секунды и метры по краям заездов, не более того.",
    ],
    p2: "Что вы видите в своих собственных сессиях:",
    li2: [
      "**Заезды, отложенные распознаванием,** перечислены под таблицей заездов вместе с причиной, и одно касание возвращает заезд, если распознавание ошиблось. Заезд, который вы вернули или убрали сами, более поздняя модель никогда не переопределит — ваше решение всегда побеждает.",
      "**Настройка чувствительности в вашем профиле** теперь задаёт, насколько строга модель: *Стандарт*, *Более чувствительно* и *Максимально чувствительно* оставляют всё больше сомнительных и коротких кусков. Старые пороги скорости тоже по-прежнему действуют, но больше не решают в одиночку.",
      "**Новые записи** анализируются новым распознаванием, как только загрузка завершена; предварительные числа во время загрузки всё ещё берутся из предыдущего распознавания.",
    ],
  },

  help: {
    h: "Как вы можете помочь: часы и телефон вместе",
    p:
      "Самое ценное для следующего шага — не больше сессий, а **больше сессий, записанных дважды одновременно**: часы на запястье, как всегда, и телефон, пристёгнутый к доске и записывающий тот же заезд ([Часть 4](/nerd-analysen-4) показывает установку; это один ремень и драй-мешок). Каждый такой заезд говорит нам секунда за секундой, что на самом деле делала доска, — а сегодня эта правда идёт только от двух райдеров. Особенно полезно:",
    li: [
      "**Райдеры, которые пампят иначе** — медленно и ровно, ногами, со спокойной рукой. Именно эти стили распознавание видит меньше всего.",
      "**Глайды.** Заезды, где вы разгоняетесь пампингом, а потом несколько секунд скользите, прежде чем снова пампить. У нас их почти нет.",
      "**Всё вокруг заезда.** Путь к воде, выгребание, стояние у пирса, переноска доски обратно — оставьте запись включённой.",
      "**Другие часы.** Каждая модель часов движется на запястье немного по-своему.",
    ],
    p2:
      "Чтобы записывать телефоном, включите в профиле «Запись с телефона», запустите её на телефоне и на часах до того, как встанете на доску, и после остановите обе. Обе записи, как обычно, появятся в ваших сессиях; мы сопоставляем их по времени, так что больше ничего делать не нужно.",
  },
};

const pt: N5 = {
  back: "← Parte 4: Um celular preso à prancha com fita",
  h1: "Parte 5: Modelo de detecção",
  subtitle: "Uma nova detecção on-foil, construída com tudo o que os riders nos contaram — e onde ela ainda precisa de você",
  intro:
    "Tudo o que este site conta — voltas, tempo de foil, distância, pumps, recordes — começa com uma decisão por segundo: **essa pessoa está no foil agora?** Se essa decisão erra, todo número que vem depois também erra. A detecção que roda hoje funciona bem para a maioria das sessões, mas nas últimas semanas os riders nos mostraram exatamente onde ela falha. Esta parte conta como reconstruímos essa decisão do zero, medida contra cada pedaço de verdade que temos, e termina com um pedido: precisamos de mais sessões gravadas com um relógio no pulso **e** um celular na prancha ao mesmo tempo.",

  problem: {
    h: "Onde a detecção antiga erra",
    p:
      "A detecção atual combina limites de velocidade (uma volta começa acima de uma velocidade e termina abaixo de outra) com um modelo treinado que observa o movimento do pulso. Três tipos de erro apareciam sempre:",
    li: [
      "**Voltas em terra.** Alguns segundos de caminhada rápida pela margem, carregando a prancha de volta ao píer, uma corridinha até o carro — na velocidade certa e com o braço balançando, isso pode passar por uma volta. Uma volta num estacionamento a 30 km/h chegou até aos recordes de velocidade.",
      "**Voltas ao lado de um trajeto de carro.** Esqueça de parar a gravação, dirija para casa, e os primeiros segundos do trajeto podem parecer uma volta.",
      "**Quem bombeia devagar perde parte da volta.** Um rider que bombeia de forma lenta e constante nos contou que faltava quase metade das voltas dele. Ele tinha razão: ele continua bombeando a 5–10 km/h depois do ponto em que o limite de velocidade antigo encerra a volta.",
    ],
  },

  truth: {
    h: "Contra o que podemos conferir",
    p:
      "Uma detecção só é tão boa quanto aquilo contra o que ela é medida, e o atalho tentador — medir a nova detecção contra a antiga — só ensina a copiar os erros antigos. Por isso reunimos cada pedaço independente de verdade que conseguimos encontrar:",
    li: [
      "**O celular na prancha** ([Parte 4](/nerd-analysen-4)). Gravado ao mesmo tempo que um relógio no pulso, ele diz segundo a segundo se a prancha estava sendo bombeada — sem adivinhar pelo braço. Até agora seis passeios se qualificam, de dois riders, cerca de 2,5 horas.",
      "**Voltas conferidas no mapa.** Cada volta que fica na maior parte a mais de 60 m da água foi olhada num mapa: 49 gravações com voltas claramente em terra, 22 em águas estreitas que o mapa de água não conhece (canais, rios, uma piscina).",
      "**O que os próprios riders removeram.** Trechos que os riders tiraram das próprias sessões — 234 minutos no total — são um rótulo tão honesto quanto possível.",
      "**Gravações sem nenhum pumpfoil.** Caminhadas e trajetos de carro gravados com um relógio, de propósito ou por acidente.",
      "**O relato do próprio rider.** O rider que bombeia devagar, lá de cima: usamos todas as voltas dele, incluindo as partes lentas depois do corte antigo, como exemplos de pumping real.",
    ],
    p2:
      "Cada resultado abaixo é medido em riders que o modelo **nunca viu durante o treino**. Cinco vezes seguidas, um quinto dos riders fica de fora, o modelo aprende com o resto e é avaliado só nos que ele não conhece. Do contrário, um modelo simplesmente aprende as pessoas, e os números mentem.",
  },

  features: {
    h: "O que o modelo consegue ver",
    p:
      "O modelo antigo olhava 14 números por segundo, a maioria sobre o tamanho do movimento do pulso. O novo vê 42. Os que mais importaram:",
    li: [
      "**Os três eixos em relação à gravidade, separadamente.** O modelo antigo só via o tamanho total do movimento, o que joga fora a direção dele. O pumping move o pulso para cima e para baixo; equilibrar, caminhar e dirigir o movem para os lados. Separados em relação à gravidade, eles deixam de parecer iguais.",
      "**O ritmo.** Quanto do movimento fica na faixa de pump (0,8–2,2 Hz), quanto na faixa de caminhada (2,2–3,5 Hz), quanto é vibração (5–12 Hz, estrada e motor), e quão pontiagudo ele é.",
      "**O minuto ao redor.** A velocidade máxima dentro de ±60 s, e quanto daquele minuto foi mais rápido que 40 km/h. Uma volta logo ao lado de um trajeto de carro já é suspeita só pelo contexto.",
      "**Tendência de velocidade.** Velocidade subindo enquanto o braço está calmo significa que algo ainda está impulsionando a prancha — muitas vezes as pernas.",
      "**Como o relógio está posicionado** — mais sobre isso abaixo, porque essa ideia veio de um rider olhando uma única sessão.",
    ],
  },

  honest: {
    h: "Não deixar o modelo copiar as regras antigas",
    p:
      "A maior pilha de exemplos de treino são as voltas que a detecção antiga encontrou. Isso é útil — a maioria delas é real —, mas tem uma armadilha: as bordas das voltas antigas vêm de limites de velocidade, então um modelo treinado com elas reaprende esses limites de velocidade. O rider que bombeia devagar deixou a armadilha visível: um modelo que nunca o viu encontrou só um quarto do pumping lento dele.",
    p2:
      "Por isso os três segundos no início e no fim de cada volta antiga não contam mais como exemplo, e as verdades independentes (celular na prancha, conferência no mapa, remoções dos próprios riders, as gravações de caminhada e de carro) contam várias vezes mais do que uma volta que a detecção antiga por acaso encontrou. E aí perguntamos se mais dados ajudariam. Não ajudariam: o modelo treinado com 4 riders já chega perto, e a partir de uns **64 riders** ele não melhora mais nada. O que falta não são mais sessões do mesmo tipo — é uma verdade melhor.",
    cap: "Curva de aprendizado: treinado com 1 a 258 riders, sempre testado em riders que ele nunca tinha visto.",
  },

  pipeline: {
    h: "De uma probabilidade a voltas",
    p:
      "O modelo dá uma probabilidade por segundo. Transformar isso em voltas acabou importando tanto quanto o próprio modelo. A primeira ideia — simplesmente usar o modelo no lugar dos limites de velocidade — gerou milhares de voltinhas extras que as outras verdades não confirmaram. O que funciona é uma cadeia de passos pequenos e verificáveis:",
    li: [
      "**Começar generoso.** Pegar as voltas que a detecção antiga encontra *e* as voltas encontradas quase sem limite de velocidade. Juntas, elas contêm toda volta que possivelmente possa ser uma.",
      "**Cortar em pedaços confiáveis.** Dividir cada candidata onde o modelo está inseguro, fazendo ponte sobre quedas curtas de poucos segundos.",
      "**Julgar cada pedaço.** Um pedaço cuja probabilidade média é baixa demais é descartado.",
      "**Ser rigoroso com os muito curtos.** Um pedaço com menos de 8 segundos só fica quando o modelo tem clara certeza — a maioria dos pedaços curtos é resto de uma caminhada pela margem.",
    ],
    p2:
      "A ordem importa mais do que você imaginaria. Julgar primeiro as candidatas inteiras e cortar depois jogava fora voltas reais sempre que uma caminhada e um passeio tinham se fundido num trecho longo; cortar primeiro e julgar cada pedaço as mantém. E a **configuração de sensibilidade no seu perfil** continua com seu sentido: em vez de afrouxar limites de velocidade, agora ela deixa os limiares do modelo mais ou menos rigorosos.",
  },

  watch: {
    h: "Como o relógio fica — uma ideia da praia",
    p:
      "Olhando uma sessão com várias voltas duvidosas perto de um píer, o Jan teve um palpite: *quando você está no foil, o relógio fica do mesmo jeito o tempo todo; quando você caminha, não.* Medimos isso em todas as gravações em que sabemos a resposta. Comparado com as outras voltas seguras do mesmo rider naquela sessão, o relógio numa volta real fica a até **5°** da posição que tinha antes (mediana). Caminhando e carregando em terra: **72°**. Voltas em terra: **75°**. Os passeios com celular na prancha confirmam isso de forma independente: 3–7° durante o passeio, 39–91° caminhando até o carro.",
    cap1: "O ângulo do relógio comparado com as outras voltas do mesmo rider naquela sessão.",
    p2:
      "A segunda metade da ideia — caminhar é inquieto, um carro é extremo — acabou sendo o contrário, e essa é a parte divertida de medir. Em dez segundos, caminhar e ficar sentado num carro são **perfeitamente estáveis**: o braço fica pendurado, as mãos descansam no volante. O que diferencia uma volta é que o relógio fica estável na direção principal **e** continua girando em torno dela: cerca de **29° por segundo** do pulso girando a cada pump, contra 7° por segundo caminhando ou dirigindo.",
    cap2: "Esquerda: estabilidade sozinha não separa nada. Direita: estável e girando ao mesmo tempo é a cara de uma volta.",
    p3:
      "Por que não transformar isso numa regra rígida? Tentamos. Os riders variam demais: um bombeia com o pulso firme como uma rocha, outro — com voltas curtas — parece, por essa medida, quase alguém caminhando, e riders que trocam de base no meio da sessão seguram o relógio de um jeito diferente a cada duas voltas. Como regra, ela jogava fora passeios reais que o celular na prancha tinha confirmado. Como **três entradas extras para o modelo**, ela ajuda, e é aí que fica.",
  },

  result: {
    h: "O que muda",
    p:
      "Medido em 2.648 gravações com dados de movimento, cada rider deixado de fora como descrito acima:",
    cap: "Voltas que não deveriam ser contadas — detecção antiga contra a nova.",
    li: [
      "**Voltas em terra** (conferência no mapa): 81 de 82 ainda contadas → **19**. Várias das restantes são erros de GPS perto da margem em que o braço está claramente bombeando, então zero não é a meta certa.",
      "**Voltas curtas ao lado de um trajeto de carro:** 25 → **1**.",
      "**Voltas dentro de trechos que os riders tinham removido:** 73 → **24**.",
      "**Contra o celular na prancha:** dos segundos que o relógio chama de on-foil, 87,2 % eram → **92,2 %**. Dos segundos realmente no foil, ele encontra 93 % (antes: 95 %) — um pouco disso é o preço de cortar bordas de volta duvidosas.",
      "**O rider que bombeia devagar:** 22 → **26 minutos**, e isso sem o modelo nunca tê-lo visto.",
      "**Recordes:** a volta no estacionamento some dos recordes de velocidade, e uma volta na estrada ao lado de um rio some dos recordes de distância e de duração.",
    ],
  },

  failed: {
    h: "O que não funcionou",
    p: "Parte de fazer isso com honestidade é anotar os becos sem saída:",
    li: [
      "**O modelo sozinho, no lugar dos limites de velocidade:** milhares de microvoltas extras, a maioria não confirmada.",
      "**Um modelo maior** (o dobro de árvores, o dobro de folhas): nem um pouco melhor.",
      "**Limpar os dados de treino com o mapa de água:** menos voltas em terra, mas um porto que o mapa não conhece como água custou ao rider que bombeia devagar os exemplos dele.",
      "**Regras rígidas sobre como o relógio é segurado:** pegam caminhadas, e passeios reais junto.",
      "**Reconhecer glides:** os passeios com celular na prancha contêm só 31 segundos de glide real — os riders bombearam quase o tempo todo. Ainda não dá para medir.",
    ],
  },

  status: {
    h: "No ar desde 30 de setembro de 2026 — o que mudou",
    p:
      "Antes de ligar, a análise completa — voltas, pumps, glides, recordes e tudo mais — rodou como teste de regressão sobre todas as gravações com dados de movimento, ao lado dos resultados armazenados e sem alterar nenhum deles. Ela reproduziu exatamente os números armazenados de hoje para 2.724 de 2.743 gravações (o resto foi armazenado com código mais antigo), então o teste mediu o que dizia medir. Depois, cada uma das 2.743 gravações foi recalculada com a nova detecção:",
    li: [
      "**Voltas:** 18.765 → **19.336** (+3 %) — algumas voltas em terra e de carro a menos, mais continuações lentas e voltas curtas reais.",
      "**Tempo de foil:** 235,9 h → **242,9 h** (+3 %). **Distância:** 3.507 km → **3.558 km**. **Pumps:** 1.340.913 → **1.375.236**.",
      "**Gravações que não contam mais como pumpfoil:** 16 — a maioria voltas em terra confirmadas no mapa, o resto um punhado de segundos cada; outras 8 passam a contar pela primeira vez.",
      "**Recordes de velocidade:** quatro entradas saíram do top 10 de todos os tempos, e as quatro eram voltas em terra — a volta no estacionamento entre elas. Os recordes de distância e de duração mudaram segundos e metros nas bordas das voltas, nada mais.",
    ],
    p2: "O que você vê nas suas próprias sessões:",
    li2: [
      "**Voltas deixadas de lado pela detecção** aparecem abaixo da tabela de voltas com o motivo, e um toque traz a volta de volta se a detecção errou. Uma volta que você trouxe de volta, ou que você mesmo removeu, nunca é sobrescrita por um modelo posterior — a sua decisão sempre vence.",
      "**A configuração de sensibilidade no seu perfil** agora define quão rigoroso o modelo é: *Padrão*, *Mais sensível* e *Mais sensível de todos* mantêm cada vez mais pedaços duvidosos e curtos. Os limites de velocidade antigos continuam valendo, mas já não decidem sozinhos.",
      "**Gravações novas** são analisadas com a nova detecção assim que o upload termina; os números preliminares durante o upload ainda vêm da detecção anterior.",
    ],
  },

  help: {
    h: "Como você pode ajudar: relógio e celular juntos",
    p:
      "A coisa mais valiosa para o próximo passo não são mais sessões — são **mais sessões gravadas duas vezes ao mesmo tempo**: o relógio no pulso como sempre, e um celular preso na prancha gravando o mesmo passeio (a [Parte 4](/nerd-analysen-4) mostra o setup; é uma cinta e uma bolsa estanque). Cada passeio assim nos dá, segundo a segundo, o que a prancha estava realmente fazendo — e hoje essa verdade vem de apenas dois riders. Especialmente úteis:",
    li: [
      "**Riders que bombeiam de outro jeito** — devagar e constante, com as pernas, com o braço calmo. São exatamente os estilos que a detecção menos vê.",
      "**Glides.** Passeios em que você ganha velocidade bombeando e depois desliza alguns segundos antes de bombear de novo. Não temos quase nenhum.",
      "**Tudo em volta do passeio.** Caminhar até a água, remar para fora, ficar parado no píer, carregar a prancha de volta — deixe a gravação rodando.",
      "**Outros relógios.** Cada modelo de relógio se move um pouco diferente no pulso.",
    ],
    p2:
      "Para gravar com o celular, ative o gravador do celular no seu perfil, inicie a gravação no celular e no relógio antes de subir na prancha, e pare as duas depois. As duas gravações aparecem nas suas sessões como sempre; nós as alinhamos pelo horário, então não há mais nada a fazer.",
  },
};

const ptPT: N5 = {
  back: "← Parte 4: Um telemóvel colado à prancha",
  h1: "Parte 5: Modelo de deteção",
  subtitle: "Uma nova deteção on-foil, construída com tudo o que os riders nos contaram — e onde ainda precisa de ti",
  intro:
    "Tudo o que este site conta — voltas, tempo de foil, distância, pumps, recordes — começa com uma decisão por segundo: **esta pessoa está no foil neste momento?** Se essa decisão falha, todos os números que vêm a seguir falham também. A deteção que corre hoje funciona bem para a maioria das sessões, mas nas últimas semanas os riders mostraram-nos exatamente onde ela falha. Esta parte conta como reconstruímos essa decisão de raiz, medida contra cada pedaço de verdade que temos, e termina com um pedido: precisamos de mais sessões gravadas com um relógio no pulso **e** um telemóvel na prancha ao mesmo tempo.",

  problem: {
    h: "Onde a deteção antiga se engana",
    p:
      "A deteção atual combina limites de velocidade (uma volta começa acima de uma velocidade e termina abaixo de outra) com um modelo treinado que observa o movimento do pulso. Havia três tipos de erro que apareciam sempre:",
    li: [
      "**Voltas em terra.** Uns segundos a andar depressa pela margem, a levar a prancha de volta ao pontão, uma corrida até ao carro — à velocidade certa e com o braço a balançar, isso pode passar por uma volta. Uma volta num parque de estacionamento a 30 km/h chegou mesmo aos recordes de velocidade.",
      "**Voltas junto a uma viagem de carro.** Esqueces-te de parar a gravação, conduzes para casa, e os primeiros segundos da viagem podem parecer uma volta.",
      "**Quem bombeia devagar fica com as voltas cortadas.** Um rider que bombeia de forma lenta e constante contou-nos que lhe faltava quase metade das voltas. Tinha razão: continua a bombear a 5–10 km/h depois do ponto em que o limite de velocidade antigo termina a volta.",
    ],
  },

  truth: {
    h: "Contra o que podemos verificar",
    p:
      "Uma deteção só é tão boa quanto aquilo contra o qual é medida, e o atalho tentador — medir a nova deteção contra a antiga — só ensina a copiar os erros antigos. Por isso reunimos cada pedaço independente de verdade que conseguimos encontrar:",
    li: [
      "**O telemóvel na prancha** ([Parte 4](/nerd-analysen-4)). Gravado ao mesmo tempo que um relógio no pulso, diz segundo a segundo se a prancha estava a ser bombeada — sem adivinhar a partir do braço. Até agora qualificam-se seis saídas, de dois riders, cerca de 2,5 horas.",
      "**Voltas verificadas no mapa.** Cada volta que fica sobretudo a mais de 60 m da água foi vista num mapa: 49 gravações com voltas claramente em terra, 22 em águas estreitas que o mapa de água não conhece (canais, rios, uma piscina).",
      "**O que os próprios riders removeram.** Troços que os riders tiraram das suas próprias sessões — 234 minutos ao todo — são um rótulo tão honesto quanto possível.",
      "**Gravações sem pumpfoil nenhum.** Caminhadas e viagens de carro gravadas com um relógio, de propósito ou por engano.",
      "**O relato do próprio rider.** O rider que bombeia devagar, lá de cima: usámos todas as voltas dele, incluindo as partes lentas depois do corte antigo, como exemplos de pumping real.",
    ],
    p2:
      "Cada resultado abaixo é medido em riders que o modelo **nunca viu durante o treino**. Cinco vezes seguidas, um quinto dos riders fica de fora, o modelo aprende com o resto e é avaliado apenas nos que não conhece. Caso contrário, um modelo limita-se a aprender as pessoas, e os números mentem.",
  },

  features: {
    h: "O que o modelo consegue ver",
    p:
      "O modelo antigo olhava para 14 números por segundo, a maioria sobre o tamanho do movimento do pulso. O novo vê 42. Os que mais contaram:",
    li: [
      "**Os três eixos em relação à gravidade, em separado.** O modelo antigo só via o tamanho total do movimento, o que deita fora a sua direção. O pumping move o pulso para cima e para baixo; equilibrar, andar e conduzir movem-no para os lados. Separados em relação à gravidade, deixam de parecer iguais.",
      "**O ritmo.** Quanto do movimento está na banda de pump (0,8–2,2 Hz), quanto na banda de marcha (2,2–3,5 Hz), quanto é vibração (5–12 Hz, estrada e motor), e quão aos picos ele é.",
      "**O minuto à volta.** A velocidade máxima dentro de ±60 s, e quanto desse minuto foi mais rápido do que 40 km/h. Uma volta mesmo ao lado de uma viagem de carro já é suspeita só pelo contexto.",
      "**Tendência da velocidade.** Velocidade a subir com o braço calmo significa que algo continua a impulsionar a prancha — muitas vezes as pernas.",
      "**Como o relógio está posicionado** — mais sobre isso abaixo, porque essa ideia veio de um rider a olhar para uma única sessão.",
    ],
  },

  honest: {
    h: "Não deixar o modelo copiar as regras antigas",
    p:
      "A maior pilha de exemplos de treino são as voltas que a deteção antiga encontrou. Isso é útil — a maioria é real —, mas traz uma armadilha: os limites das voltas antigas vêm de limites de velocidade, por isso um modelo treinado com elas volta a aprender esses limites de velocidade. O rider que bombeia devagar tornou a armadilha visível: um modelo que nunca o viu encontrou apenas um quarto do pumping lento dele.",
    p2:
      "Por isso os três segundos no início e no fim de cada volta antiga deixaram de contar como exemplo, e as verdades independentes (telemóvel na prancha, verificação no mapa, remoções feitas pelos próprios riders, as gravações a andar e de carro) contam várias vezes mais do que uma volta que a deteção antiga calhou encontrar. E depois perguntámos se mais dados ajudariam. Não ajudariam: o modelo treinado com 4 riders já fica perto, e a partir de uns **64 riders** não melhora mesmo nada. O que falta não são mais sessões do mesmo tipo — é uma verdade melhor.",
    cap: "Curva de aprendizagem: treinado com 1 a 258 riders, sempre testado em riders que nunca tinha visto.",
  },

  pipeline: {
    h: "De uma probabilidade a voltas",
    p:
      "O modelo dá uma probabilidade por segundo. Transformar isso em voltas revelou-se tão importante como o próprio modelo. A primeira ideia — usar simplesmente o modelo em vez dos limites de velocidade — produziu milhares de pequenas voltas extra que as outras verdades não confirmaram. O que funciona é uma cadeia de passos pequenos e verificáveis:",
    li: [
      "**Começar generoso.** Pegar nas voltas que a deteção antiga encontra *e* nas voltas encontradas quase sem limite de velocidade. Juntas, contêm todas as voltas que possam de facto ser uma.",
      "**Cortar em pedaços seguros.** Dividir cada candidata onde o modelo está inseguro, fazendo a ponte sobre quebras curtas de poucos segundos.",
      "**Avaliar cada pedaço.** Um pedaço cuja probabilidade média é demasiado baixa é descartado.",
      "**Ser exigente com os muito curtos.** Um pedaço com menos de 8 segundos só fica se o modelo tiver clara certeza — a maioria dos pedaços curtos são restos de uma caminhada pela margem.",
    ],
    p2:
      "A ordem conta mais do que se pensaria. Avaliar primeiro as candidatas inteiras e cortar depois deitava fora voltas reais sempre que uma caminhada e uma saída se tinham fundido num troço longo; cortar primeiro e avaliar cada pedaço mantém-nas. E a **definição de sensibilidade no teu perfil** mantém o seu significado: em vez de alargar limites de velocidade, agora torna os limiares do modelo mais ou menos exigentes.",
  },

  watch: {
    h: "Como o relógio assenta — uma ideia da praia",
    p:
      "Ao olhar para uma sessão com várias voltas duvidosas junto a um pontão, o Jan teve um palpite: *quando estás no foil, o relógio fica sempre na mesma posição; quando andas, não.* Medimo-lo em todas as gravações em que sabemos a resposta. Comparado com as outras voltas seguras do mesmo rider nessa sessão, o relógio numa volta real fica a menos de **5°** da posição que tinha antes (mediana). A andar e a carregar em terra: **72°**. Voltas em terra: **75°**. As saídas com telemóvel na prancha confirmam-no de forma independente: 3–7° durante a saída, 39–91° a caminhar até ao carro.",
    cap1: "O ângulo do relógio comparado com as outras voltas do mesmo rider nessa sessão.",
    p2:
      "A segunda metade da ideia — andar é irrequieto, um carro é extremo — revelou-se ao contrário, e essa é a parte divertida de medir. Ao longo de dez segundos, andar e estar sentado num carro são **perfeitamente estáveis**: o braço fica pendurado, as mãos descansam no volante. O que distingue uma volta é que o relógio fica estável na direção principal **e** continua a rodar em torno dela: cerca de **29° por segundo** do pulso a rodar a cada pump, contra 7° por segundo a andar ou a conduzir.",
    cap2: "Esquerda: a estabilidade sozinha não separa nada. Direita: estável e a rodar ao mesmo tempo é o aspeto de uma volta.",
    p3:
      "Porque não fazer disto uma regra rígida? Tentámos. Os riders são demasiado diferentes: um bombeia com o pulso firme como uma rocha, outro — com voltas curtas — parece, por esta medida, quase alguém a andar, e os riders que trocam de base a meio da sessão seguram o relógio de forma diferente de duas em duas voltas. Como regra, deitava fora saídas reais que o telemóvel na prancha tinha confirmado. Como **três entradas extra para o modelo** ajuda, e é aí que fica.",
  },

  result: {
    h: "O que muda",
    p:
      "Medido em 2.648 gravações com dados de movimento, cada rider deixado de fora como descrito acima:",
    cap: "Voltas que não deviam ser contadas — deteção antiga contra a nova.",
    li: [
      "**Voltas em terra** (verificação no mapa): 81 de 82 ainda contadas → **19**. Várias das restantes são erros de GPS junto à margem em que o braço está claramente a bombear, por isso zero não é o objetivo certo.",
      "**Voltas curtas junto a uma viagem de carro:** 25 → **1**.",
      "**Voltas dentro de troços que os riders tinham removido:** 73 → **24**.",
      "**Contra o telemóvel na prancha:** dos segundos que o relógio considera on-foil, 87,2 % eram → **92,2 %**. Dos segundos realmente no foil encontra 93 % (antes: 95 %) — um pouco disso é o preço de cortar limites de volta duvidosos.",
      "**O rider que bombeia devagar:** 22 → **26 minutos**, e isto sem o modelo alguma vez o ter visto.",
      "**Recordes:** a volta no parque de estacionamento desaparece dos recordes de velocidade, e uma volta na estrada junto a um rio desaparece dos recordes de distância e de duração.",
    ],
  },

  failed: {
    h: "O que não funcionou",
    p: "Parte de fazer isto com honestidade é registar os becos sem saída:",
    li: [
      "**O modelo sozinho, em vez dos limites de velocidade:** milhares de microvoltas extra, a maioria não confirmada.",
      "**Um modelo maior** (o dobro das árvores, o dobro das folhas): nada melhor.",
      "**Limpar os dados de treino com o mapa de água:** menos voltas em terra, mas um porto que o mapa não conhece como água custou ao rider que bombeia devagar os seus exemplos.",
      "**Regras rígidas sobre como se segura o relógio:** apanham caminhadas, e saídas reais com elas.",
      "**Reconhecer glides:** as saídas com telemóvel na prancha contêm apenas 31 segundos de glide real — os riders bombearam quase o tempo todo. Ainda não é mensurável.",
    ],
  },

  status: {
    h: "Ativo desde 30 de setembro de 2026 — o que mudou",
    p:
      "Antes de a ligar, a análise completa — voltas, pumps, glides, recordes e tudo o resto — correu como teste de regressão sobre todas as gravações com dados de movimento, ao lado dos resultados guardados e sem alterar nenhum deles. Reproduziu exatamente os números guardados de hoje em 2.724 de 2.743 gravações (as restantes foram guardadas com código mais antigo), por isso o teste mediu o que dizia medir. Depois, cada uma das 2.743 gravações foi recalculada com a nova deteção:",
    li: [
      "**Voltas:** 18.765 → **19.336** (+3 %) — algumas voltas em terra e de carro a menos, mais continuações lentas e voltas curtas reais.",
      "**Tempo de foil:** 235,9 h → **242,9 h** (+3 %). **Distância:** 3.507 km → **3.558 km**. **Pumps:** 1.340.913 → **1.375.236**.",
      "**Gravações que deixaram de contar como pumpfoil:** 16 — a maioria voltas em terra confirmadas no mapa, as restantes uma mão-cheia de segundos cada; outras 8 passam a contar pela primeira vez.",
      "**Recordes de velocidade:** quatro entradas saíram do top 10 de sempre, e as quatro eram voltas em terra — a volta no parque de estacionamento entre elas. Os recordes de distância e de duração mudaram segundos e metros nos limites das voltas, nada mais.",
    ],
    p2: "O que vês nas tuas próprias sessões:",
    li2: [
      "**Voltas postas de parte pela deteção** aparecem por baixo da tabela de voltas com o motivo, e um toque recupera uma volta se a deteção se enganou. Uma volta que recuperaste, ou que tu próprio removeste, nunca é anulada por um modelo posterior — a tua decisão ganha sempre.",
      "**A definição de sensibilidade no teu perfil** define agora quão exigente o modelo é: *Padrão*, *Mais sensível* e *Mais sensível de todos* mantêm cada vez mais pedaços duvidosos e curtos. Os limites de velocidade antigos continuam a aplicar-se, mas já não decidem sozinhos.",
      "**Gravações novas** são analisadas com a nova deteção assim que o upload termina; os números provisórios durante o upload ainda vêm da deteção anterior.",
    ],
  },

  help: {
    h: "Como podes ajudar: relógio e telemóvel juntos",
    p:
      "A coisa mais valiosa para o próximo passo não são mais sessões — são **mais sessões gravadas duas vezes ao mesmo tempo**: o relógio no pulso como sempre, e um telemóvel preso à prancha a gravar a mesma saída (a [Parte 4](/nerd-analysen-4) mostra o equipamento; é uma fita e um saco estanque). Cada saída assim dá-nos, segundo a segundo, o que a prancha estava realmente a fazer — e hoje essa verdade vem de apenas dois riders. Especialmente úteis:",
    li: [
      "**Riders que bombeiam de outra forma** — devagar e constante, com as pernas, com o braço calmo. São exatamente os estilos que a deteção menos vê.",
      "**Glides.** Saídas em que ganhas velocidade a bombear e depois deslizas uns segundos antes de voltar a bombear. Quase não temos nenhuma.",
      "**Tudo à volta da saída.** Caminhar até à água, remar para fora, ficar parado no pontão, levar a prancha de volta — deixa a gravação a correr.",
      "**Outros relógios.** Cada modelo de relógio mexe-se de forma um pouco diferente no pulso.",
    ],
    p2:
      "Para gravar com o telemóvel, ativa a gravação pelo telemóvel no teu perfil, inicia-a no telemóvel e no relógio antes de subires para a prancha, e para as duas depois. As duas gravações aparecem nas tuas sessões como de costume; alinhamo-las pela hora, por isso não há mais nada a fazer.",
  },
};

const id: N5 = {
  back: "← Bagian 4: Ponsel yang ditempel ke papan",
  h1: "Bagian 5: Model deteksi",
  subtitle: "Deteksi on-foil baru, dibangun dari semua yang diceritakan para rider kepada kami — dan di mana ia masih membutuhkanmu",
  intro:
    "Semua yang dihitung situs ini — run, waktu foiling, jarak, pump, rekor — berawal dari satu keputusan per detik: **apakah orang ini sedang di atas foil saat ini?** Kalau keputusan itu salah, setiap angka sesudahnya ikut salah. Deteksi yang berjalan hari ini bekerja baik untuk sebagian besar sesi, tetapi dalam beberapa minggu terakhir para rider menunjukkan kepada kami persis di mana ia gagal. Bagian ini menceritakan bagaimana kami membangun ulang keputusan itu dari nol, diukur terhadap setiap kebenaran yang kami miliki, dan diakhiri dengan sebuah permintaan: kami butuh lebih banyak sesi yang direkam dengan jam tangan di pergelangan **dan** ponsel di papan sekaligus.",

  problem: {
    h: "Di mana deteksi lama keliru",
    p:
      "Deteksi saat ini menggabungkan batas kecepatan (sebuah run dimulai di atas satu kecepatan dan berakhir di bawah kecepatan lain) dengan model terlatih yang mengamati gerakan pergelangan tangan. Tiga jenis kesalahan terus muncul:",
    li: [
      "**Run di darat.** Beberapa detik berjalan cepat di tepi air, membawa papan kembali ke dermaga, lari kecil ke mobil — pada kecepatan yang pas dengan lengan berayun, itu bisa lolos sebagai run. Satu putaran di tempat parkir dengan 30 km/h bahkan sampai masuk rekor kecepatan.",
      "**Run di samping perjalanan mobil.** Lupa menghentikan rekaman, menyetir pulang, dan detik-detik pertama perjalanan itu bisa terlihat seperti run.",
      "**Pemompa lambat terpotong.** Seorang rider yang memompa pelan dan stabil memberi tahu kami bahwa runnya hilang hampir separuh. Ia benar: ia terus memompa pada 5–10 km/h setelah titik di mana batas kecepatan lama mengakhiri run.",
    ],
  },

  truth: {
    h: "Terhadap apa kami bisa memeriksa",
    p:
      "Sebuah deteksi hanya sebaik tolok ukurnya, dan jalan pintas yang menggoda — mengukur deteksi baru terhadap yang lama — hanya mengajarkan cara menyalin kesalahan lama. Karena itu kami mengumpulkan setiap kebenaran independen yang bisa kami temukan:",
    li: [
      "**Ponsel di papan** ([Bagian 4](/nerd-analysen-4)). Direkam bersamaan dengan jam tangan di pergelangan, ia memberi tahu detik demi detik apakah papan sedang dipompa — tanpa menebak dari lengan. Sejauh ini enam sesi memenuhi syarat, dari dua rider, sekitar 2,5 jam.",
      "**Run yang diperiksa di peta.** Setiap run yang sebagian besar berada lebih dari 60 m dari air dilihat di peta: 49 rekaman dengan run yang jelas di darat, 22 di perairan sempit yang tidak dikenal peta air (kanal, sungai, sebuah kolam renang).",
      "**Apa yang dihapus rider sendiri.** Bagian yang dikeluarkan rider dari sesi mereka sendiri — total 234 menit — adalah label yang hampir paling jujur.",
      "**Rekaman tanpa pumpfoil sama sekali.** Jalan kaki dan perjalanan mobil yang direkam dengan jam tangan, sengaja maupun tidak.",
      "**Kesaksian seorang rider.** Si pemompa lambat di atas: kami memakai semua runnya, termasuk bagian lambat setelah batas potong lama, sebagai contoh pumping yang nyata.",
    ],
    p2:
      "Setiap hasil di bawah diukur pada rider yang **tidak pernah dilihat model selama pelatihan**. Lima kali berturut-turut, seperlima rider disisihkan, model belajar dari sisanya, dan dinilai hanya pada rider yang belum pernah ia temui. Kalau tidak, model hanya menghafal orangnya, dan angkanya berbohong.",
  },

  features: {
    h: "Apa yang bisa dilihat model",
    p:
      "Model lama melihat 14 angka per detik, kebanyakan tentang besarnya gerakan pergelangan tangan. Model baru melihat 42. Yang paling berpengaruh:",
    li: [
      "**Tiga sumbu terhadap gravitasi, secara terpisah.** Model lama hanya melihat besar total gerakan, yang membuang arahnya. Pumping menggerakkan pergelangan naik-turun; menjaga keseimbangan, berjalan dan menyetir menggerakkannya ke samping. Dipisahkan terhadap gravitasi, keduanya tidak lagi terlihat mirip.",
      "**Ritme.** Seberapa banyak gerakan berada di pita pump (0,8–2,2 Hz), seberapa banyak di pita jalan kaki (2,2–3,5 Hz), seberapa banyak getaran (5–12 Hz, jalan dan mesin), dan seberapa runcing gerakannya.",
      "**Semenit di sekitarnya.** Kecepatan tertinggi dalam ±60 s, dan seberapa banyak dari menit itu yang lebih cepat dari 40 km/h. Run tepat di samping perjalanan mobil sudah mencurigakan dari konteksnya saja.",
      "**Tren kecepatan.** Kecepatan naik sementara lengan tenang berarti ada sesuatu yang masih mendorong papan — sering kali kaki.",
      "**Cara jam tangan terpasang** — lebih lanjut di bawah, karena ide itu datang dari seorang rider yang melihat satu sesi.",
    ],
  },

  honest: {
    h: "Tidak membiarkan model menyalin aturan lama",
    p:
      "Tumpukan contoh pelatihan terbesar adalah run yang ditemukan deteksi lama. Itu berguna — kebanyakan memang nyata — tetapi ada jebakannya: tepi run lama berasal dari batas kecepatan, jadi model yang dilatih dengannya mempelajari kembali batas kecepatan itu. Si pemompa lambat membuat jebakan itu terlihat: model yang tidak pernah melihatnya hanya menemukan seperempat dari pumping lambatnya.",
    p2:
      "Karena itu tiga detik di awal dan akhir setiap run lama tidak lagi dihitung sebagai contoh sama sekali, dan kebenaran independen (ponsel di papan, pemeriksaan peta, penghapusan oleh rider sendiri, rekaman jalan kaki dan mobil) dihitung beberapa kali lipat dibanding run yang kebetulan ditemukan deteksi lama. Lalu kami bertanya apakah lebih banyak data akan membantu. Tidak: model yang dilatih dengan 4 rider sudah mendekati, dan mulai sekitar **64 rider** ia tidak membaik sama sekali. Yang kurang bukan lebih banyak sesi dari jenis yang sama — melainkan kebenaran yang lebih baik.",
    cap: "Kurva belajar: dilatih dengan 1 hingga 258 rider, selalu diuji pada rider yang belum pernah dilihatnya.",
  },

  pipeline: {
    h: "Dari probabilitas menjadi run",
    p:
      "Model memberikan probabilitas per detik. Mengubahnya menjadi run ternyata sama pentingnya dengan model itu sendiri. Ide pertama — cukup pakai model sebagai ganti batas kecepatan — menghasilkan ribuan run kecil tambahan yang tidak dikonfirmasi kebenaran lainnya. Yang berhasil adalah rangkaian langkah kecil yang bisa diperiksa:",
    li: [
      "**Mulai dengan murah hati.** Ambil run yang ditemukan deteksi lama *dan* run yang ditemukan hampir tanpa batas kecepatan. Bersama-sama, keduanya memuat setiap run yang mungkin memang run.",
      "**Potong menjadi bagian yang meyakinkan.** Pecah setiap kandidat di tempat model ragu, dengan menjembatani penurunan singkat beberapa detik.",
      "**Nilai setiap bagian.** Bagian yang probabilitas rata-ratanya terlalu rendah dibuang.",
      "**Tegas terhadap yang sangat pendek.** Bagian di bawah 8 detik hanya dipertahankan bila model jelas yakin — kebanyakan bagian pendek adalah sisa jalan kaki di tepi air.",
    ],
    p2:
      "Urutannya lebih penting daripada yang kamu kira. Menilai kandidat utuh dulu lalu memotong belakangan membuang run nyata setiap kali jalan kaki dan sesi di air telah menyatu menjadi satu bentangan panjang; memotong dulu lalu menilai tiap bagian mempertahankannya. Dan **pengaturan sensitivitas di profilmu** tetap bermakna: alih-alih melonggarkan batas kecepatan, kini ia membuat ambang model lebih atau kurang ketat.",
  },

  watch: {
    h: "Cara jam tangan terpasang — ide dari pantai",
    p:
      "Saat melihat satu sesi dengan beberapa run meragukan di dekat dermaga, Jan punya firasat: *saat kamu di atas foil, posisi jam tangan sama terus; saat kamu berjalan, tidak.* Kami mengukurnya di semua rekaman yang jawabannya kami ketahui. Dibandingkan dengan run aman lain dari rider yang sama di sesi itu, jam tangan dalam run nyata berada dalam **5°** dari posisinya sebelumnya (median). Berjalan dan membawa papan di darat: **72°**. Run di darat: **75°**. Sesi dengan ponsel di papan mengonfirmasinya secara independen: 3–7° saat berkendara, 39–91° saat berjalan ke mobil.",
    cap1: "Sudut jam tangan dibandingkan dengan run lain dari rider yang sama di sesi itu.",
    p2:
      "Separuh kedua ide itu — berjalan itu gelisah, mobil itu ekstrem — ternyata justru kebalikannya, dan itulah serunya mengukur. Selama sepuluh detik, berjalan dan duduk di mobil **sangat stabil**: lengan menggantung, tangan bertumpu di setir. Yang membedakan sebuah run adalah jam tangan stabil pada arah utamanya **dan** terus berputar di sekitarnya: sekitar **29° per detik** dari pergelangan yang berputar di setiap pump, dibanding 7° per detik saat berjalan atau menyetir.",
    cap2: "Kiri: kestabilan saja tidak memisahkan apa pun. Kanan: stabil sekaligus berputar — begitulah rupa sebuah run.",
    p3:
      "Kenapa tidak dijadikan aturan keras? Sudah kami coba. Rider terlalu berbeda-beda: yang satu memompa dengan pergelangan sekokoh batu, yang lain — dengan run pendek — menurut ukuran ini hampir terlihat seperti orang berjalan, dan rider yang berganti kuda-kuda di tengah sesi memegang jam tangan berbeda di setiap run berikutnya. Sebagai aturan, ia membuang sesi nyata yang sudah dikonfirmasi ponsel di papan. Sebagai **tiga masukan tambahan untuk model**, ia membantu, dan di situlah ia tetap berada.",
  },

  result: {
    h: "Apa yang berubah",
    p:
      "Diukur pada 2.648 rekaman dengan data gerak, setiap rider disisihkan seperti dijelaskan di atas:",
    cap: "Run yang seharusnya tidak dihitung — deteksi lama dibandingkan yang baru.",
    li: [
      "**Run di darat** (pemeriksaan peta): 81 dari 82 masih dihitung → **19**. Beberapa sisanya adalah kesalahan GPS di tepi air di mana lengan jelas sedang memompa, jadi nol bukan target yang tepat.",
      "**Run pendek di samping perjalanan mobil:** 25 → **1**.",
      "**Run di dalam bagian yang sudah dihapus rider:** 73 → **24**.",
      "**Terhadap ponsel di papan:** dari detik-detik yang disebut on-foil oleh jam tangan, 87,2 % benar → **92,2 %**. Dari detik yang benar-benar di atas foil, ia menemukan 93 % (sebelumnya: 95 %) — sedikit dari itu adalah harga memotong tepi run yang meragukan.",
      "**Si pemompa lambat:** 22 → **26 menit**, dan itu tanpa model pernah melihatnya.",
      "**Rekor:** putaran tempat parkir hilang dari rekor kecepatan, dan sebuah run di jalan samping sungai hilang dari rekor jarak dan durasi.",
    ],
  },

  failed: {
    h: "Apa yang tidak berhasil",
    p: "Bagian dari mengerjakan ini dengan jujur adalah mencatat jalan buntunya:",
    li: [
      "**Model saja, sebagai ganti batas kecepatan:** ribuan run mikro tambahan, sebagian besar tidak terkonfirmasi.",
      "**Model yang lebih besar** (dua kali pohon, dua kali daun): sama sekali tidak lebih baik.",
      "**Membersihkan data pelatihan dengan peta air:** lebih sedikit run di darat, tetapi sebuah pelabuhan yang tidak dikenal peta sebagai air membuat si pemompa lambat kehilangan contoh-contohnya.",
      "**Aturan keras tentang cara jam tangan dipegang:** menangkap jalan kaki, dan sesi nyata ikut terbawa.",
      "**Mengenali glide:** sesi dengan ponsel di papan hanya berisi 31 detik glide nyata — para rider memompa hampir sepanjang waktu. Belum bisa diukur.",
    ],
  },

  status: {
    h: "Aktif sejak 30 September 2026 — apa yang berubah",
    p:
      "Sebelum dinyalakan, analisis lengkap — run, pump, glide, rekor, semuanya — dijalankan sebagai uji regresi atas setiap rekaman dengan data gerak, berdampingan dengan hasil tersimpan dan tanpa mengubah satu pun. Hasilnya mereproduksi angka tersimpan hari ini secara persis untuk 2.724 dari 2.743 rekaman (sisanya disimpan dengan kode yang lebih lama), jadi uji itu mengukur apa yang diklaimnya. Lalu setiap satu dari 2.743 rekaman dihitung ulang dengan deteksi baru:",
    li: [
      "**Run:** 18.765 → **19.336** (+3 %) — sedikit lebih sedikit run di darat dan di mobil, lebih banyak kelanjutan lambat dan run pendek yang nyata.",
      "**Waktu foiling:** 235,9 h → **242,9 h** (+3 %). **Jarak:** 3.507 km → **3.558 km**. **Pump:** 1.340.913 → **1.375.236**.",
      "**Rekaman yang tidak lagi dihitung sebagai pumpfoil:** 16 — kebanyakan run di darat yang dikonfirmasi di peta, sisanya masing-masing hanya beberapa detik; 8 lainnya kini dihitung untuk pertama kalinya.",
      "**Rekor kecepatan:** empat entri keluar dari sepuluh besar sepanjang masa, dan keempatnya adalah run di darat — putaran tempat parkir termasuk di antaranya. Rekor jarak dan durasi bergeser beberapa detik dan meter di tepi run, tidak lebih.",
    ],
    p2: "Yang kamu lihat di sesimu sendiri:",
    li2: [
      "**Run yang disisihkan oleh deteksi** tercantum di bawah tabel run beserta alasannya, dan satu ketukan mengembalikan run jika deteksi salah. Run yang kamu kembalikan, atau yang kamu hapus sendiri, tidak pernah ditimpa oleh model berikutnya — keputusanmu selalu menang.",
      "**Pengaturan sensitivitas di profilmu** kini menentukan seberapa ketat model: *Standar*, *Lebih sensitif* dan *Paling sensitif* mempertahankan makin banyak bagian yang meragukan dan pendek. Batas kecepatan lama tetap berlaku, tetapi tidak lagi memutuskan sendirian.",
      "**Rekaman baru** dianalisis dengan deteksi baru begitu upload selesai; angka sementara selama upload masih berasal dari deteksi sebelumnya.",
    ],
  },

  help: {
    h: "Cara kamu bisa membantu: jam tangan dan ponsel bersamaan",
    p:
      "Hal paling berharga untuk langkah berikutnya bukan lebih banyak sesi — melainkan **lebih banyak sesi yang direkam dua kali sekaligus**: jam tangan di pergelanganmu seperti biasa, dan ponsel diikat ke papan merekam sesi yang sama ([Bagian 4](/nerd-analysen-4) menunjukkan penyiapannya; cukup satu tali dan satu dry bag). Setiap sesi seperti itu memberi kami, detik demi detik, apa yang sebenarnya dilakukan papan — dan hari ini kebenaran itu hanya berasal dari dua rider. Terutama berguna:",
    li: [
      "**Rider yang memompa dengan cara berbeda** — pelan dan stabil, dengan kaki, dengan lengan tenang. Justru gaya-gaya itulah yang paling jarang dilihat deteksi.",
      "**Glide.** Sesi di mana kamu memompa untuk naik lalu meluncur beberapa detik sebelum memompa lagi. Kami hampir tidak punya sama sekali.",
      "**Semua yang ada di sekitar sesi.** Berjalan ke air, mendayung keluar, berdiri di dermaga, membawa papan kembali — biarkan rekaman tetap berjalan.",
      "**Jam tangan lain.** Setiap model jam tangan bergerak sedikit berbeda di pergelangan.",
    ],
    p2:
      "Untuk merekam dengan ponsel, aktifkan perekam ponsel di profilmu, mulai rekaman di ponsel dan di jam tangan sebelum naik ke papan, lalu hentikan keduanya sesudahnya. Kedua rekaman muncul di sesimu seperti biasa; kami menyelaraskannya berdasarkan waktu, jadi tidak ada lagi yang perlu dilakukan.",
  },
};

const ja: N5 = {
  back: "← パート4：ボードに貼り付けられた携帯電話",
  h1: "パート5：検出モデル",
  subtitle: "ライダーの皆さんから教わったすべてをもとに作った新しいオンフォイル検出 — そして、まだ皆さんの力が必要なところ",
  intro:
    "このサイトが数えるすべて — ラン、フォイル時間、距離、ポンプ、記録 — は、毎秒ひとつの判断から始まります：**この人はいまフォイルに乗っているか？** ここを誤れば、その後のすべての数字も誤ります。現在の検出はほとんどのセッションでうまく機能していますが、この数週間でライダーの皆さんが、それがどこで破綻するかを正確に示してくれました。このパートは、その判断を手元にあるあらゆる真実と照らし合わせながら一から作り直した話であり、最後にひとつお願いがあります：手首にウォッチ、**そして**ボードに携帯を付けて同時に記録したセッションが、もっと必要です。",

  problem: {
    h: "従来の検出がどこで間違えるか",
    p:
      "現在の検出は、速度の閾値（ある速度を超えるとランが始まり、別の速度を下回ると終わる）と、手首の動きを見る学習済みモデルを組み合わせています。繰り返し現れた誤りは3種類です：",
    li: [
      "**陸上のラン。** 岸沿いを数秒早歩きする、ボードを桟橋まで運んで戻る、車までジョギングする — ちょうどいい速度で腕を振っていれば、それがランとして通ってしまうことがあります。駐車場を30 km/hで一周したものが、速度記録にまで載ってしまいました。",
      "**車での移動の隣のラン。** 記録を止め忘れて車で帰宅すると、走り出しの最初の数秒がランのように見えることがあります。",
      "**ゆっくりポンプする人のランが途中で切れる。** ゆっくり一定のリズムでポンプするあるライダーが、自分のランのほぼ半分が欠けていると教えてくれました。その通りでした：彼は、従来の速度閾値がランを終わらせる地点を過ぎても、5–10 km/hでポンプを続けているのです。",
    ],
  },

  truth: {
    h: "何と照らし合わせられるか",
    p:
      "検出の良さは、何と比べて測るかで決まります。そして手っ取り早い近道 — 新しい検出を古い検出と比べる — は、古い誤りを真似ることを教えるだけです。そこで、見つけられる限りの独立した真実を集めました：",
    li: [
      "**ボード上の携帯**（[パート4](/nerd-analysen-4)）。手首のウォッチと同時に記録すると、ボードがポンプされていたかどうかを秒ごとに教えてくれます — 腕から推測する必要はありません。これまでに条件を満たすのは6回のライド、ライダー2人、約2.5時間です。",
      "**地図で確認したラン。** 大部分が水から60 m以上離れているランはすべて地図で確認しました：明らかに陸上のランを含む記録が49件、水域マップが拾えない狭い水域（運河、川、プール）のものが22件。",
      "**ライダー自身が除外したもの。** ライダーが自分のセッションから取り除いた区間 — 合計234分 — は、これ以上ないほど正直なラベルです。",
      "**パンプフォイルを含まない記録。** 意図的に、あるいはうっかりウォッチで記録した散歩や車での移動。",
      "**ライダー本人の証言。** 上のゆっくりポンプするライダーです：従来の打ち切り以降のゆっくりした部分も含め、彼のランをすべて本物のポンプの例として使いました。",
    ],
    p2:
      "以下の結果はすべて、モデルが**学習中に一度も見ていない**ライダーで測ったものです。5回にわたって、ライダーの5分の1を取り分け、残りでモデルを学習させ、まだ会ったことのないライダーだけで評価します。そうしないと、モデルは単に人を覚えてしまい、数字が嘘をつきます。",
  },

  features: {
    h: "モデルが見るもの",
    p:
      "従来のモデルは毎秒14個の数値を見ており、そのほとんどは手首の動きの大きさに関するものでした。新しいモデルは42個を見ます。特に効いたのは次のものです：",
    li: [
      "**重力に対する3軸を別々に。** 従来のモデルは動きの総量しか見ておらず、その方向を捨てていました。ポンプは手首を上下に動かし、バランス・歩行・操作は横に動かします。重力に対して分解すると、それらは似て見えなくなります。",
      "**リズム。** 動きのうちどれだけがポンプ帯域（0.8–2.2 Hz）にあり、どれだけが歩行帯域（2.2–3.5 Hz）にあり、どれだけが振動（5–12 Hz、路面とエンジン）なのか、そしてどれだけ尖っているか。",
      "**前後1分。** ±60 s以内の最高速度と、その1分のうち40 km/hを超えていた割合。車での移動のすぐ隣にあるランは、文脈だけで怪しいのです。",
      "**速度の傾向。** 腕が落ち着いているのに速度が上がっているなら、何かがまだボードを進めている — 多くの場合は脚です。",
      "**ウォッチの向き** — これについては下で詳しく。このアイデアは、あるライダーがひとつのセッションを見ていて生まれたものだからです。",
    ],
  },

  honest: {
    h: "モデルに古いルールを真似させない",
    p:
      "学習例のいちばん大きな山は、従来の検出が見つけたランです。役に立ちます — ほとんどは本物です — が、罠があります：従来のランの境界は速度閾値から来ているので、それで学習したモデルはその速度閾値を学び直してしまいます。ゆっくりポンプするライダーがこの罠を浮き彫りにしました：彼を一度も見ていないモデルは、彼のゆっくりしたポンプの4分の1しか見つけられませんでした。",
    p2:
      "そこで、従来の各ランの始まりと終わりの3秒は、もはや学習例として一切数えず、独立した真実（ボードの携帯、地図確認、ライダー自身の除外、歩行と車移動の記録）は、従来の検出がたまたま見つけたランの何倍もの重みで数えます。そして、データを増やせば良くなるかを確かめました。答えはノーです：ライダー4人で学習したモデルですでに近く、**64人**あたりからはまったく良くなりません。足りないのは同じ種類のセッションではなく — より良い真実です。",
    cap: "学習曲線：1人から258人のライダーで学習し、常に一度も見ていないライダーでテスト。",
  },

  pipeline: {
    h: "確率からランへ",
    p:
      "モデルは秒ごとに確率を出します。それをランに変える部分が、モデル自体と同じくらい重要だとわかりました。最初のアイデア — 速度閾値の代わりに単純にモデルを使う — は、他の真実が裏付けない小さな余分のランを何千も生み出しました。うまくいくのは、小さく検証可能なステップの連鎖です：",
    li: [
      "**寛大に始める。** 従来の検出が見つけるランと、速度閾値をほぼなくして見つかるランの*両方*を取ります。合わせれば、ランでありうるものはすべて含まれます。",
      "**確信の持てる断片に切る。** 各候補をモデルが迷うところで分割し、数秒の短い落ち込みはつなぎます。",
      "**断片ごとに判定する。** 平均確率が低すぎる断片は捨てます。",
      "**ごく短いものには厳しく。** 8秒未満の断片は、モデルが明らかに確信しているときだけ残ります — 短い断片の多くは岸沿いを歩いた名残です。",
    ],
    p2:
      "順序は思った以上に重要です。先に候補全体を判定してから切ると、歩行とライドがひとつの長い区間に融合したときに本物のランが捨てられていました。先に切って断片ごとに判定すれば、それらは残ります。そして**プロフィールの感度設定**はその意味を保ちます：速度閾値を緩めるのではなく、モデルの閾値を厳しくしたり緩くしたりするようになりました。",
  },

  watch: {
    h: "ウォッチの向き — ビーチで生まれたアイデア",
    p:
      "桟橋近くの疑わしいランがいくつかあるセッションを見ていて、Janはある勘を持ちました：*フォイルに乗っているときはウォッチがずっと同じ向きにあり、歩いているときはそうではない。* 答えがわかっているすべての記録でそれを測りました。同じセッションでの同じライダーの他の確実なランと比べると、本物のランでのウォッチの向きは、それまでの向きから**5°**以内（中央値）。陸上での歩行や運搬：**72°**。陸上のラン：**75°**。ボード上の携帯のライドが独立にこれを裏付けます：乗っている間は3–7°、車まで歩く間は39–91°。",
    cap1: "同じセッションでの同じライダーの他のランと比べたウォッチの角度。",
    p2:
      "アイデアの後半 — 歩行は落ち着きがなく、車は極端 — は逆でした。それこそが計測の面白いところです。10秒間で見ると、歩行も車に座っているのも**完全に安定**しています：腕は垂れ下がり、手はハンドルの上で休んでいます。ランを際立たせるのは、ウォッチが主方向では安定している**うえに**その周りで回り続けることです：ポンプのたびに手首が回転して**毎秒約29°**、歩行や運転では毎秒7°です。",
    cap2: "左：安定性だけでは何も分けられない。右：安定していて同時に回っている、それがランの姿。",
    p3:
      "なぜ厳格なルールにしないのか？試しました。ライダーの差が大きすぎるのです：あるライダーは手首が岩のように安定してポンプし、別のライダーは — 短いランでは — この尺度で見るとほとんど歩いている人のようで、セッション途中でスタンスを変えるライダーは、1本おきにウォッチの持ち方が違います。ルールとしては、ボードの携帯が確認した本物のライドを捨ててしまいました。**モデルへの3つの追加入力**としては役に立つので、そこに留めています。",
  },

  result: {
    h: "何が変わるか",
    p:
      "動きデータのある2,648件の記録で、上で述べたように各ライダーを取り分けて測定：",
    cap: "数えるべきでないラン — 従来の検出と新しい検出の比較。",
    li: [
      "**陸上のラン**（地図確認）：82件中81件がまだ数えられていた → **19**。残りのいくつかは、腕が明らかにポンプしている岸辺でのGPS誤差なので、ゼロが正しい目標ではありません。",
      "**車での移動の隣の短いラン：** 25 → **1**。",
      "**ライダーが除外した区間内のラン：** 73 → **24**。",
      "**ボード上の携帯との比較：** ウォッチがオンフォイルと判定した秒のうち、正しかったのは87.2 % → **92.2 %**。本当にフォイルに乗っていた秒のうち93 %を見つけます（以前：95 %）— その一部は、疑わしいランの境界を切り落とす代償です。",
      "**ゆっくりポンプするライダー：** 22 → **26分**。しかもモデルは彼を一度も見ていません。",
      "**記録：** 駐車場の一周は速度記録から消え、川沿いの道路でのランは距離と時間の記録から消えます。",
    ],
  },

  failed: {
    h: "うまくいかなかったこと",
    p: "正直にやるということには、行き止まりを書き残すことも含まれます：",
    li: [
      "**速度閾値の代わりにモデル単独で：** 何千もの余分なマイクロランが生まれ、そのほとんどは裏付けられませんでした。",
      "**より大きなモデル**（木を2倍、葉を2倍）：まったく良くなりませんでした。",
      "**水域マップで学習データを掃除：** 陸上のランは減りましたが、マップが水域と認識していない港のせいで、ゆっくりポンプするライダーの例が失われました。",
      "**ウォッチの持ち方に関する厳格なルール：** 歩行は捕まえますが、本物のライドも一緒に捕まえてしまいます。",
      "**グライドの認識：** ボード上の携帯のライドには本物のグライドが31秒しか含まれていません — ライダーはほぼずっとポンプしていました。まだ測定できません。",
    ],
  },

  status: {
    h: "2026年9月30日から稼働中 — 変わったこと",
    p:
      "有効にする前に、分析の全体 — ラン、ポンプ、グライド、記録などすべて — を、動きデータのあるすべての記録に対する回帰テストとして、保存済みの結果と並べて、どれも変更せずに走らせました。2,743件のうち2,724件で現在保存されている数字を正確に再現した（残りは古いコードで保存されたもの）ので、このテストは主張どおりのものを測っていたことになります。その後、2,743件の記録すべてを新しい検出で再計算しました：",
    li: [
      "**ラン：** 18,765 → **19,336**（+3 %）— 陸上や車のランが少し減り、ゆっくりした続きと短い本物のランが増えました。",
      "**フォイル時間：** 235.9 h → **242.9 h**（+3 %）。**距離：** 3,507 km → **3,558 km**。**ポンプ：** 1,340,913 → **1,375,236**。",
      "**パンプフォイルとして数えられなくなった記録：** 16件 — ほとんどは地図で確認された陸上のランで、残りはそれぞれ数秒程度です。一方、8件が初めてカウントされるようになりました。",
      "**速度記録：** 歴代トップ10から4件が外れ、4件とも陸上のランでした — 駐車場の一周もその中に。距離と時間の記録は、ランの境界で数秒・数メートル動いただけで、それ以上ではありません。",
    ],
    p2: "自分のセッションで目にすること：",
    li2: [
      "**検出が除外したラン**は、ランの表の下に理由とともに一覧表示され、検出が間違えていればワンタップでランを戻せます。あなたが戻したラン、あるいは自分で除外したランは、後のモデルに覆されることはありません — あなたの判断が常に優先されます。",
      "**プロフィールの感度設定**は、モデルがどれだけ厳しいかを決めるようになりました：*標準*、*高感度*、*最高感度*の順に、疑わしい断片や短い断片をより多く残します。従来の速度閾値も引き続き適用されますが、もはやそれだけで決めることはありません。",
      "**新しい記録**は、アップロードが完了するとすぐに新しい検出で分析されます。アップロード中の暫定的な数字は、まだ以前の検出によるものです。",
    ],
  },

  help: {
    h: "協力のお願い：ウォッチと携帯を一緒に",
    p:
      "次のステップで最も価値があるのは、セッションを増やすことではありません — **同時に二重で記録したセッションを増やすこと**です：いつも通り手首にウォッチ、そしてボードに携帯を固定して同じライドを記録します（セットアップは[パート4](/nerd-analysen-4)で紹介しています。ストラップ1本とドライバッグだけです）。そうしたライドのひとつひとつが、ボードが本当に何をしていたかを秒ごとに教えてくれます — そして今日、その真実はライダー2人からしか来ていません。特に役立つのは：",
    li: [
      "**違うポンプの仕方をするライダー** — ゆっくり一定に、脚で、腕を落ち着かせて。まさに検出がいちばん見ていないスタイルです。",
      "**グライド。** ポンプで上がってから、数秒グライドし、またポンプするライド。ほとんどありません。",
      "**ライドの前後すべて。** 水辺まで歩く、パドルで出る、桟橋に立つ、ボードを運んで戻る — 記録は回しっぱなしにしてください。",
      "**ほかのウォッチ。** ウォッチのモデルごとに、手首での動き方が少しずつ違います。",
    ],
    p2:
      "携帯で記録するには、プロフィールで携帯レコーダーをオンにし、ボードに乗る前に携帯とウォッチの両方で記録を開始し、終わったら両方を停止します。両方の記録はいつも通りセッションに表示されます。時刻で並べて合わせるので、ほかにやることはありません。",
  },
};

const zh: N5 = {
  back: "← 第4部分：手机胶带贴在板上",
  h1: "第5部分：检测模型",
  subtitle: "一套新的上翼检测，建立在骑手们告诉我们的一切之上 — 以及它仍然需要你的地方",
  intro:
    "这个网站统计的一切 — 航段、上翼时间、距离、泵动、纪录 — 都始于每秒一个判断：**这个人此刻是否在水翼上？** 这一步错了，后面的每个数字也都会错。目前运行的检测在大多数会话中表现良好，但过去几周，骑手们准确地向我们指出了它在哪里失灵。这一部分讲的是如何从零开始重建这个判断，并用我们掌握的每一份真相去衡量它；结尾有一个请求：我们需要更多同时在手腕上戴手表**并**在板上放手机录制的会话。",

  problem: {
    h: "旧检测错在哪里",
    p:
      "当前的检测把速度阈值（高于某个速度航段开始，低于另一个速度航段结束）与一个观察手腕动作的训练模型结合起来。反复出现的错误有三类：",
    li: [
      "**陆地上的航段。** 沿岸快走几秒、把板扛回栈桥、小跑到车旁 — 只要速度合适、手臂在摆动，就可能被当成一个航段。有一次在停车场以 30 km/h 绕了一圈，甚至进了速度纪录。",
      "**紧挨着开车的航段。** 忘了停止录制就开车回家，开车的最初几秒可能看起来像一个航段。",
      "**慢速泵动者的航段被截短。** 一位泵动缓慢而稳定的骑手告诉我们，他的航段几乎少了一半。他说得对：在旧速度阈值结束航段的那个点之后，他仍以 5–10 km/h 继续泵动。",
    ],
  },

  truth: {
    h: "我们可以拿什么来对照",
    p:
      "检测的好坏取决于你用什么来衡量它，而那条诱人的捷径 — 用旧检测来衡量新检测 — 只会教它照抄旧错误。所以我们收集了能找到的每一份独立真相：",
    li: [
      "**板上的手机**（[第4部分](/nerd-analysen-4)）。与手腕上的手表同时录制，它逐秒告诉我们板是否在被泵动 — 无需从手臂去猜。目前符合条件的有六次骑行、两位骑手，约 2.5 小时。",
      "**在地图上核对的航段。** 每个大部分距水超过 60 m 的航段都在地图上查看过：49 条录制含有明显在陆地上的航段，22 条位于水域地图遗漏的狭窄水面（运河、河流、一个泳池）。",
      "**骑手自己删除的部分。** 骑手从自己的会话中剔除的片段 — 共 234 分钟 — 几乎是最诚实的标签。",
      "**完全没有泵动水翼的录制。** 有意或无意用手表录下的散步和开车。",
      "**骑手本人的说法。** 就是上面那位慢速泵动者：我们把他的所有航段，包括旧截断点之后的慢速部分，都作为真实泵动的样例。",
    ],
    p2:
      "下面的每个结果都是在模型**训练期间从未见过**的骑手上测得的。重复五次：留出五分之一的骑手，模型从其余骑手学习，只用它没见过的那些来评判。否则模型只是学会了认人，数字就会说谎。",
  },

  features: {
    h: "模型能看到什么",
    p:
      "旧模型每秒看 14 个数，大多关于手腕动作的幅度。新模型看 42 个。最重要的几个：",
    li: [
      "**相对重力的三个轴，分开看。** 旧模型只看动作的总幅度，丢掉了方向。泵动让手腕上下移动；保持平衡、走路和转向让它横向移动。按重力方向拆开后，它们就不再相像。",
      "**节奏。** 动作中有多少落在泵动频带（0.8–2.2 Hz），多少落在走路频带（2.2–3.5 Hz），多少是振动（5–12 Hz，路面和发动机），以及它有多尖锐。",
      "**前后一分钟。** ±60 s 内的最高速度，以及这一分钟里有多少时间快于 40 km/h。紧挨着开车的航段，仅凭上下文就很可疑。",
      "**速度趋势。** 手臂平静而速度上升，说明还有别的东西在推动板 — 往往是腿。",
      "**手表的朝向** — 下面会详细讲，因为这个想法来自一位骑手在查看一次会话时。",
    ],
  },

  honest: {
    h: "不让模型照抄旧规则",
    p:
      "最大的一堆训练样例是旧检测找到的航段。这很有用 — 其中大多数是真的 — 但有个陷阱：旧航段的边界来自速度阈值，所以用它们训练的模型会把这些速度阈值重新学回来。慢速泵动者让这个陷阱显形：一个从未见过他的模型，只找到了他四分之一的慢速泵动。",
    p2:
      "因此，每个旧航段开头和结尾的三秒不再算作样例，而那些独立真相（板上手机、地图核对、骑手自己的删除、走路和开车的录制）的权重是旧检测碰巧找到的航段的好几倍。然后我们问：更多数据会有帮助吗？不会：用 4 位骑手训练的模型已经很接近，而从大约 **64 位骑手**起就完全不再变好。缺的不是更多同类会话 — 而是更好的真相。",
    cap: "学习曲线：用 1 到 258 位骑手训练，始终在从未见过的骑手上测试。",
  },

  pipeline: {
    h: "从概率到航段",
    p:
      "模型给出每秒一个概率。事实证明，把它变成航段与模型本身同样重要。第一个想法 — 直接用模型代替速度阈值 — 产生了成千上万个其他真相无法证实的微小额外航段。有效的是一连串小而可检验的步骤：",
    li: [
      "**起点宽松。** 取旧检测找到的航段，*以及*几乎不设速度阈值时找到的航段。两者合起来包含了一切可能是航段的东西。",
      "**切成有把握的片段。** 在模型不确定的地方拆分每个候选，跨过几秒的短暂低谷。",
      "**逐段评判。** 平均概率过低的片段被丢弃。",
      "**对极短的片段从严。** 不到 8 秒的片段只有在模型明显确定时才保留 — 大多数短片段是沿岸走路的残余。",
    ],
    p2:
      "顺序比你想象的更重要。先评判整个候选再切分，每当走路和骑行合并成一段长片段时，真实的航段就会被丢掉；先切分再逐段评判则能保住它们。而**个人资料中的灵敏度设置**保持原有含义：它不再放宽速度阈值，而是让模型阈值更严或更松。",
  },

  watch: {
    h: "手表如何佩戴 — 来自海滩的想法",
    p:
      "在查看一次栈桥旁有几个可疑航段的会话时，Jan 有了一个直觉：*在水翼上时，手表一直保持同样的朝向；走路时则不然。* 我们在所有已知答案的录制上测量了它。与同一骑手在该会话中其他可靠航段相比，真实航段中手表的朝向与之前相差在 **5°** 以内（中位数）。陆地上走路和扛板：**72°**。陆地上的航段：**75°**。板上手机的骑行独立地证实了这一点：骑行时 3–7°，走向车时 39–91°。",
    cap1: "手表角度，与同一骑手在该会话中的其他航段相比。",
    p2:
      "想法的后半部分 — 走路不安稳、开车很极端 — 结果恰恰相反，这正是测量的乐趣所在。在十秒内，走路和坐在车里都**非常稳定**：手臂下垂，双手搭在方向盘上。让航段与众不同的是，手表在主方向上稳定，**同时**又不断绕它转动：每次泵动手腕都会旋转，约**每秒 29°**，而走路或开车时为每秒 7°。",
    cap2: "左：仅凭稳定性什么也区分不了。右：既稳定又在转动，这才是航段的样子。",
    p3:
      "为什么不把它做成硬规则？我们试过。骑手之间差异太大：有人泵动时手腕稳如磐石，另一位 — 航段较短 — 按这个尺度看几乎像在走路，而会话中途换站姿的骑手每隔一个航段手表的持握方式都不同。作为规则，它丢掉了板上手机已确认的真实骑行。作为**模型的三个额外输入**，它有帮助，于是就留在那里。",
  },

  result: {
    h: "有什么变化",
    p:
      "在 2,648 条带运动数据的录制上测量，每位骑手都按上述方式留出：",
    cap: "不应被计入的航段 — 旧检测对比新检测。",
    li: [
      "**陆地上的航段**（地图核对）：82 个中有 81 个仍被计入 → **19**。剩下的其中几个是岸边的 GPS 误差，而手臂显然在泵动，所以零并不是正确的目标。",
      "**紧挨着开车的短航段：** 25 → **1**。",
      "**位于骑手已删除片段内的航段：** 73 → **24**。",
      "**对照板上的手机：** 手表判为上翼的秒数中，正确的比例从 87.2 % → **92.2 %**。在真正上翼的秒数中，它找到 93 %（之前：95 %）— 其中一小部分是切掉可疑航段边缘的代价。",
      "**慢速泵动者：** 22 → **26 分钟**，而且模型从未见过他。",
      "**纪录：** 停车场那一圈从速度纪录中消失，一段在河边公路上的航段从距离和时长纪录中消失。",
    ],
  },

  failed: {
    h: "哪些没有成功",
    p: "诚实地做这件事，也包括把死胡同写下来：",
    li: [
      "**单用模型代替速度阈值：** 成千上万个额外的微型航段，大多数得不到证实。",
      "**更大的模型**（树加倍，叶加倍）：完全没有变好。",
      "**用水域地图清洗训练数据：** 陆地航段少了，但一个地图不认为是水域的港口让慢速泵动者丢掉了他的样例。",
      "**关于手表持握方式的硬规则：** 它们能抓住走路，也把真实骑行一起抓走了。",
      "**识别滑行：** 板上手机的骑行中只有 31 秒真正的滑行 — 骑手几乎一直在泵动。暂时无法测量。",
    ],
  },

  status: {
    h: "自 2026 年 9 月 30 日起上线 — 有什么变化",
    p:
      "在启用之前，完整的分析 — 航段、泵动、滑行、纪录等等 — 作为回归测试在每条带运动数据的录制上运行，与已存储的结果并排比较，且不改动其中任何一个。它在 2,743 条中的 2,724 条上精确复现了当前存储的数字（其余是用旧代码存储的），所以这个测试确实测量了它声称要测的东西。然后，全部 2,743 条录制都用新检测重新计算：",
    li: [
      "**航段：** 18,765 → **19,336**（+3 %）— 陆地和开车的航段少了几个，慢速延续和短的真实航段多了。",
      "**上翼时间：** 235.9 h → **242.9 h**（+3 %）。**距离：** 3,507 km → **3,558 km**。**泵动：** 1,340,913 → **1,375,236**。",
      "**不再算作泵动水翼的录制：** 16 条 — 大多是地图上确认在陆地上的航段，其余每条只有几秒；另有 8 条记录首次被计入。",
      "**速度纪录：** 四条记录跌出了历史前十，四条全是陆地上的航段 — 停车场那一圈也在其中。距离和时长纪录只在航段边缘移动了几秒和几米，仅此而已。",
    ],
    p2: "你在自己的会话中会看到：",
    li2: [
      "**被检测排除的航段**列在航段表下方并附有原因，如果检测判断错了，点一下就能恢复该航段。你恢复的航段或你自己删除的航段，永远不会被后来的模型推翻 — 你的决定永远优先。",
      "**个人资料中的灵敏度设置**现在决定模型有多严格：*标准*、*较灵敏* 和 *最灵敏* 依次保留越来越多可疑和短小的片段。旧的速度阈值仍然适用，但不再单独做决定。",
      "**新的录制**在上传完成后立即用新检测分析；上传过程中的初步数字仍来自之前的检测。",
    ],
  },

  help: {
    h: "你可以如何帮忙：手表和手机一起",
    p:
      "下一步最有价值的不是更多会话 — 而是**更多同时录制两份的会话**：手腕上照常戴着手表，板上绑一部手机录制同一次骑行（[第4部分](/nerd-analysen-4)展示了设置方法；只需一条带子和一个干袋）。每一次这样的骑行都逐秒告诉我们板真正在做什么 — 而如今这份真相只来自两位骑手。特别有用的是：",
    li: [
      "**泵动方式不同的骑手** — 缓慢而稳定、用腿、手臂平静。这些正是检测见得最少的风格。",
      "**滑行。** 泵起来之后滑行几秒再继续泵动的骑行。我们几乎没有。",
      "**骑行前后的一切。** 走向水边、划出去、站在栈桥上、把板扛回来 — 让录制一直开着。",
      "**其他手表。** 每种手表型号在手腕上的动作都略有不同。",
    ],
    p2:
      "要用手机录制，请在个人资料中打开手机录制器，在上板之前在手机和手表上都开始录制，结束后两者都停止。两份录制都会照常出现在你的会话中；我们按时间把它们对齐，所以你无需再做别的。",
  },
};

export const NERD5: Partial<Record<Lang, N5>> = { en, de, "de-AT": deAT, gsw, fr, it, es, nl, nb, fi, cs, pl, ru, pt, "pt-PT": ptPT, id, ja, zh };
