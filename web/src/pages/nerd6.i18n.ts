// Inhalte für die Nerd-Analysen Teil 6 (Pump- und Gleit-Erkennung pg-1). Von Jan am 24.10.2026 freigegeben und
// in alle 18 Sprachen übersetzt (Englisch bleibt der Rückfall; Mundarten gsw/de-AT mit eigener Färbung wie Teil 5).
// Rich-Markup: **fett**, `code`, *kursiv*, [label](/pfad). Keine geraden Anführungszeichen in Strings.
//
// INHALTSREGELN: Bilder mit Signalen/Spuren nur aus Jans eigenen Aufnahmen; andere Fahrer nur zusammengefasst
// und anonym (Fahrer A–E). Keine Namen, keine Session-Nummern Dritter, keine Orte. Zahlen aus docs/PUMP-GLEIT.md.
import type { Lang } from "../i18n";

export interface N6 {
  back: string;
  h1: string;
  subtitle: string;
  intro: string;
  problem: { h: string; p: string; li: string[] };
  truth: { h: string; p: string; cap: string; p2: string };
  physics: { h: string; p: string; li: string[]; cap: string; p2: string; li2: string[] };
  honest: { h: string; p: string; cap1: string; p2: string; li: string[]; cap2: string; p3: string };
  before: { h: string; p: string; cap: string; p2: string };
  limits: { h: string; li: string[] };
  help: { h: string; p: string; li: string[]; p2: string };
}

const en: N6 = {
  back: "← Part 5: Detection model",
  h1: "Part 6: Pumps and glides",
  subtitle: "Teaching the watch to count every pump once — and to notice when you stop pumping",
  intro:
    "Part 5 was about deciding **whether** someone is on the foil. This part is about what happens **while** they are: every pump stroke, and every moment without one. Both numbers were weaker than they looked. The pump counter sometimes counted one stroke twice and missed the next one, and a real glide detection did not exist at all. Again the phone on the board is the referee, and again the answer is mostly physics, with a deliberately small model where physics alone is not enough.",

  problem: {
    h: "What was wrong",
    p: "The old counter looks for the rhythm in the vertical wrist movement and picks one peak per stroke. Measured against the board it finds 88 % of the real pumps — not bad — but:",
    li: [
      "**It counted twice.** Sometimes two peaks a few hundredths of a second apart were both counted. On two runs that were tapped by hand from video, 5 and 7 such doubles hid exactly as many missed strokes — the total looked perfect by coincidence.",
      "**It kept counting while gliding.** Arms keep moving when the legs stop. 22 % of everything the watch counted were not real pumps; a large share of those sat in glides.",
      "**There was no glide detection.** What the app called the *longest glide* was simply the longest gap between two counted pumps. Because the counter rarely stopped, that gap was almost never a real glide — on the board-checked runs, the old glides found 0 of 64 real ones.",
    ],
  },

  truth: {
    h: "The referee: a phone on the board",
    p: "As in [Part 4](/nerd-analysen-4), a phone taped to the board records the board itself: how far it rises and falls with every stroke, and whether that stroke actually puts energy into the ride. Recorded at the same time as a watch on the wrist and aligned to a fraction of a second, it tells us for every stroke whether it happened, and for every gap whether it was a glide. 14 such sessions from 5 riders qualify: roughly 3,700 board-confirmed pumps and 64 glides.",
    cap: "One of my runs. Top: the board rising and falling — every cyan line is a stroke with energy, yellow is the glide before touchdown (red). Bottom: the wrist, with the pumps the old counter found (red dots). Notice the dots inside the glide.",
    p2: "A pump here means what the board says: a stroke that pushes energy into the ride. Small waggles while balancing do not count, and neither do the last swings of a board that is already sinking.",
  },

  physics: {
    h: "Physics instead of memorising",
    p: "With five riders, a big model would mostly learn those five people. So the pump count itself is done without any trained model, using what pumping physically is — a rhythm:",
    li: [
      "**Rhythm filter.** The candidate peaks are checked against the local rhythm of the last few strokes. Two peaks much closer than one stroke apart are one stroke — the weaker one goes. A gap of two or three strokes with a fitting, weaker peak in the middle gets that peak back: a pump that was there, just quieter.",
      "**Rhythm tracker.** A second pass follows the rhythm stroke by stroke and predicts where the next one should be. It is allowed to adapt quickly — pumping is not a metronome: riders speed up to get going and ease off on purpose. Where it finds a stroke the filter missed, the stroke is added.",
      "**Glide = rhythm breaks and energy drops.** A strong peak inside a glide stays a pump. Only weak peaks — less than 40 % of the rider’s own typical stroke in that run — are dropped when the glide model is confident.",
    ],
    cap: "Pumping is not a metronome: in this run the rhythm drifts between about 77 and 90 strokes per minute. The tracker only uses the last few strokes, so it follows.",
    p2: "The only trained part decides **gliding or pumping** for every quarter second. It is kept small on purpose:",
    li2: [
      "decision trees with **7 leaves**, nothing more,",
      "inputs normalised to the rider’s own run (strength relative to his own pumping, rhythm relative to his own rhythm), no watch model, no rider identity,",
      "no information about where in the run a moment is — the model could otherwise just learn that glides tend to come at the end,",
      "its output is smoothed with overlapping 5-second windows and a simple state model that knows that a glide lasts at least about 1.5 seconds.",
    ],
  },

  honest: {
    h: "Measured honestly",
    p: "Every number here is measured on riders the model never saw: train on four, test on the fifth, five times. Against the board, compared with the old counter:",
    cap1: "Average over 5 riders, each measured without having been in training. Right: pumps found per rider — every rider gets more of his real pumps.",
    p2: "In numbers:",
    li: [
      "**Pumps found** (within ±0.25 s): 88.5 % → 93.1 % (±0.4 s: 98 %).",
      "**Pumps that are real:** 78 % → 87 %.",
      "**Error in the pump count per run:** 17 % → 11 %.",
      "**Around changes of rhythm** (speeding up, easing off): 89 % → 95 % of the strokes found.",
      "**Glides found:** 0 % → 51 %, and 54 % of the glides it reports are real.",
      "**The hand-tapped runs:** not a single tapped pump missing — before, 4 and 6 were missing behind the doubles.",
    ],
    cap2: "Left and middle come from the first round of models, where one model decided everything (the size chosen there, 7 leaves, is the one the glide model uses now). Left: a bigger model learns its training riders better and better, but not a rider it has never seen. Middle: every additional rider still helps. Right: a small neural net on the raw signals did worse than the small tree model.",
    p3: "We also tried a small neural network on the raw signals instead of hand-picked inputs. With this little data it lost clearly. That is not a verdict on neural nets — it is a verdict on 5 riders.",
  },

  before: {
    h: "Before and after",
    p: "Two of my runs, as the app showed them until now and as the new detection sees them. Cyan dots are pumps, yellow stretches are glides.",
    cap: "Run 2: 58 → 50 pumps; the doubles are gone, and the glide at the end appears (the board says: 5.8 s). Run 4: three short glides instead of none; on the board this run had one glide of 3.6 s.",
    p2: "Across all recordings, glides now make up about 6 % of the foiling time — close to the 7 % the board measures. The run boundaries themselves are not touched; only what happens inside a run changes. A few very long glides where the speed hardly drops are not counted as glides but marked for a closer look: that is usually a wave, a pull from somewhere, or strokes the watch could not see.",
  },

  limits: {
    h: "Limits",
    li: [
      "**Five riders.** The learning curve has not flattened yet. Every rider with a phone on the board makes the glide part better.",
      "**Glides are still the hard part.** Half of the real glides are found, and every second reported glide is real. That is a start, not the end.",
      "**Carves need more data.** The board also sees turns. 42 carves in the recordings so far are far too few for their own detection — roughly 110 more from more riders would be needed.",
      "**Live since 23 October.** All recordings were recalculated; the old numbers are kept in the background, and the records follow the new ones.",
    ],
  },

  help: {
    h: "How you can help",
    p: "The most useful thing is a session with **both**: the watch on your wrist and a phone fixed to your board, recording at the same time.",
    li: [
      "Fix the phone firmly to the board (a waterproof bag and tape are enough).",
      "Start the recording on both before you go on the water, stop both at the end.",
      "Ten minutes of normal riding is plenty — including glides and the odd carve.",
    ],
    p2: "Both recordings show up in your sessions as usual; we line them up by time ourselves. If you like, tell us whether you wore the watch on your front or back hand.",
  },
};

const de: N6 = {
  back: "← Teil 5: Das Erkennungsmodell",
  h1: "Teil 6: Pumps und Gleiten",
  subtitle: "Wie die Uhr lernt, jeden Pump einmal zu zählen — und zu merken, wann du aufhörst zu pumpen",
  intro:
    "In Teil 5 ging es darum, **ob** jemand auf dem Foil ist. Hier geht es darum, was **währenddessen** passiert: jeder Pumpstoß und jeder Moment ohne. Beide Zahlen waren schwächer, als sie aussahen. Der Pump-Zähler zählte manchmal einen Stoß doppelt und verpasste dafür den nächsten, und eine echte Gleit-Erkennung gab es gar nicht. Schiedsrichter ist wieder das Handy am Brett, und die Antwort ist wieder vor allem Physik — mit einem bewusst kleinen Modell dort, wo Physik allein nicht reicht.",

  problem: {
    h: "Was falsch war",
    p: "Der bisherige Zähler sucht den Takt in der senkrechten Bewegung des Handgelenks und nimmt je Stoß einen Gipfel. Gegen das Brett gemessen findet er 88 % der echten Pumps — nicht schlecht —, aber:",
    li: [
      "**Er zählte doppelt.** Manchmal wurden zwei Gipfel im Abstand von wenigen Hundertstelsekunden beide gezählt. In zwei Läufen, die von Hand am Video getippt wurden, versteckten 5 bzw. 7 solche Doppelten genauso viele verpasste Stöße — die Summe stimmte zufällig.",
      "**Er zählte im Gleiten weiter.** Die Arme bewegen sich weiter, wenn die Beine aufhören. 22 % von allem, was die Uhr zählte, waren keine echten Pumps; ein großer Teil davon lag im Gleiten.",
      "**Eine Gleit-Erkennung gab es nicht.** Was die App *längste Gleitphase* nannte, war einfach die längste Lücke zwischen zwei gezählten Pumps. Weil der Zähler selten aufhörte, war diese Lücke fast nie echtes Gleiten — in den gegen das Brett geprüften Läufen fanden die bisherigen Gleitphasen 0 von 64 echten.",
    ],
  },

  truth: {
    h: "Der Schiedsrichter: ein Handy am Brett",
    p: "Wie in [Teil 4](/nerd-analysen-4) misst ein Handy, das am Brett klebt, das Brett selbst: wie weit es sich mit jedem Stoß hebt und senkt und ob der Stoß wirklich Energie in die Fahrt bringt. Gleichzeitig mit einer Uhr am Handgelenk aufgenommen und auf Bruchteile einer Sekunde ausgerichtet, sagt es für jeden Stoß, ob es ihn gab, und für jede Lücke, ob sie Gleiten war. 14 solche Aufnahmen von 5 Fahrern taugen dafür: rund 3.700 vom Brett bestätigte Pumps und 64 Gleitphasen.",
    cap: "Einer meiner Läufe. Oben das Brett, wie es sich hebt und senkt — jede cyanfarbene Linie ist ein Stoß mit Energie, gelb das Gleiten vor dem Aufsetzen (rot). Unten das Handgelenk mit den Pumps, die der bisherige Zähler fand (rote Punkte). Man beachte die Punkte im Gleiten.",
    p2: "Ein Pump ist hier, was das Brett sagt: ein Stoß, der Energie in die Fahrt bringt. Kleines Wackeln beim Ausbalancieren zählt nicht, die letzten Schwinger eines Bretts, das schon absinkt, auch nicht.",
  },

  physics: {
    h: "Physik statt Auswendiglernen",
    p: "Mit fünf Fahrern würde ein großes Modell vor allem diese fünf Menschen lernen. Deshalb kommt die Pumpzahl selbst ganz ohne trainiertes Modell aus — sie nutzt, was Pumpen physikalisch ist: ein Takt.",
    li: [
      "**Takt-Filter.** Die Kandidaten-Gipfel werden gegen den lokalen Takt der letzten Stöße geprüft. Zwei Gipfel, die viel näher beieinander liegen als ein Stoß, sind ein Stoß — der schwächere fällt weg. Eine Lücke von zwei oder drei Stößen mit einem passenden, schwächeren Gipfel in der Mitte bekommt diesen Gipfel zurück: ein Pump, der da war, nur leiser.",
      "**Takt-Verfolger.** Ein zweiter Durchgang folgt dem Takt Stoß für Stoß und sagt voraus, wo der nächste liegen müsste. Er darf sich schnell anpassen — Pumpen ist kein Metronom: man gibt Gas, um in Fahrt zu kommen, und wird bewusst langsamer. Wo er einen Stoß findet, den der Filter verpasst hat, kommt dieser dazu.",
      "**Gleiten = Takt reißt ab und Energie fällt.** Ein kräftiger Gipfel im Gleiten bleibt ein Pump. Nur schwache Gipfel — unter 40 % des eigenen typischen Stoßes in diesem Lauf — fallen weg, wenn das Gleit-Modell sicher ist.",
    ],
    cap: "Pumpen ist kein Metronom: in diesem Lauf schwankt der Takt zwischen etwa 77 und 90 Stößen pro Minute. Der Verfolger nutzt nur die letzten Stöße und folgt deshalb mit.",
    p2: "Der einzige trainierte Teil entscheidet für jede Viertelsekunde: **gleiten oder pumpen**. Er ist absichtlich klein:",
    li2: [
      "Entscheidungsbäume mit **7 Blättern**, mehr nicht,",
      "Eingaben relativ zum eigenen Lauf (Stärke relativ zum eigenen Pumpen, Takt relativ zum eigenen Takt), kein Uhrmodell, keine Fahrer-Kennung,",
      "keine Angabe, wo im Lauf ein Moment liegt — sonst lernt das Modell einfach, dass Gleiten meist am Ende kommt,",
      "die Ausgabe wird über überlappende 5-Sekunden-Fenster gemittelt und von einem einfachen Zustandsmodell geglättet, das weiß, dass Gleiten mindestens etwa 1,5 Sekunden dauert.",
    ],
  },

  honest: {
    h: "Ehrlich gemessen",
    p: "Jede Zahl hier ist an Fahrern gemessen, die das Modell nie gesehen hat: an vier trainiert, am fünften geprüft, fünfmal. Gegen das Brett, verglichen mit dem bisherigen Zähler:",
    cap1: "Mittel über 5 Fahrer, jeder gemessen, ohne im Training gewesen zu sein. Rechts: gefundene Pumps je Fahrer — jeder Fahrer bekommt mehr seiner echten Pumps.",
    p2: "In Zahlen:",
    li: [
      "**Gefundene Pumps** (auf ±0,25 s): 88,5 % → 93,1 % (auf ±0,4 s: 98 %).",
      "**Gezählte Pumps, die echt sind:** 78 % → 87 %.",
      "**Fehler der Pumpzahl je Lauf:** 17 % → 11 %.",
      "**Rund um Taktwechsel** (Gas geben, langsamer werden): 89 % → 95 % der Stöße gefunden.",
      "**Gefundenes Gleiten:** 0 % → 51 %, und 54 % der gemeldeten Gleitphasen sind echt.",
      "**Die von Hand getippten Läufe:** kein einziger getippter Pump fehlt — vorher fehlten 4 und 6 hinter den Doppelten.",
    ],
    cap2: "Links und Mitte stammen aus der ersten Modellrunde, in der ein Modell alles entschied (die dort gewählte Größe, 7 Blätter, nutzt das Gleit-Modell jetzt). Links: ein größeres Modell lernt seine Trainingsfahrer immer besser, einen fremden Fahrer aber nicht. Mitte: jeder weitere Fahrer hilft noch. Rechts: ein kleines neuronales Netz auf den Rohsignalen war schlechter als das kleine Baummodell.",
    p3: "Wir haben auch ein kleines neuronales Netz auf den Rohsignalen versucht statt ausgesuchter Eingaben. Mit so wenig Daten hat es klar verloren. Das ist kein Urteil über neuronale Netze — es ist ein Urteil über 5 Fahrer.",
  },

  before: {
    h: "Vorher und nachher",
    p: "Zwei meiner Läufe, wie die App sie bisher zeigte und wie die neue Erkennung sie sieht. Cyan sind Pumps, gelb ist Gleiten.",
    cap: "Lauf 2: 58 → 50 Pumps; die Doppelten sind weg, und das Gleiten am Ende taucht auf (das Brett sagt: 5,8 s). Lauf 4: drei kurze Gleitphasen statt keiner; das Brett sah in diesem Lauf eine von 3,6 s.",
    p2: "Über alle Aufnahmen macht Gleiten jetzt etwa 6 % der Foil-Zeit aus — nahe an den 7 %, die das Brett misst. Die Laufgrenzen selbst bleiben unberührt; es ändert sich nur, was in einem Lauf passiert. Ein paar sehr lange Gleitphasen, in denen das Tempo kaum fällt, zählen nicht als Gleiten, sondern werden zum genaueren Hinschauen markiert: meist ist das eine Welle, ein Zug von irgendwoher oder Stöße, die die Uhr nicht sehen konnte.",
  },

  limits: {
    h: "Grenzen",
    li: [
      "**Fünf Fahrer.** Die Lernkurve ist noch nicht flach. Jeder Fahrer mit Handy am Brett macht den Gleit-Teil besser.",
      "**Gleiten ist noch der schwere Teil.** Die Hälfte der echten Gleitphasen wird gefunden, und jede zweite gemeldete ist echt. Ein Anfang, nicht das Ende.",
      "**Carves brauchen mehr Daten.** Das Brett sieht auch Kurven. 42 Carves in den bisherigen Aufnahmen sind viel zu wenig für eine eigene Erkennung — es bräuchte grob 110 mehr, von mehr Fahrern.",
      "**Seit 23. Oktober live.** Alle Aufnahmen wurden neu gerechnet; die alten Zahlen bleiben im Hintergrund erhalten, die Rekorde folgen den neuen.",
    ],
  },

  help: {
    h: "So kannst du helfen",
    p: "Am meisten hilft eine Aufnahme mit **beidem**: die Uhr am Handgelenk und ein Handy fest am Brett, beide nehmen gleichzeitig auf.",
    li: [
      "Handy fest am Brett anbringen (eine wasserdichte Hülle und Klebeband reichen).",
      "Auf beiden die Aufnahme starten, bevor du aufs Wasser gehst, am Ende beide stoppen.",
      "Zehn Minuten normales Fahren reichen völlig — gern mit Gleiten und der einen oder anderen Kurve.",
    ],
    p2: "Beide Aufnahmen erscheinen wie gewohnt in deinen Sessions; wir legen sie selbst zeitlich übereinander. Wenn du magst, sag uns, ob du die Uhr an der vorderen oder hinteren Hand trägst.",
  },
};

const deAT: N6 = {
  back: "← Teil 5: Das Erkennungsmodell",
  h1: "Teil 6: Pumps und Gleiten",
  subtitle: "Wie die Uhr lernt, jeden Pump einmal zu zählen — und zu merken, wann du aufhörst zu pumpen",
  intro:
    "In Teil 5 is’s drum gegangen, **ob** wer grad am Foil steht. Da geht’s drum, was **währenddessen** passiert: jeder Pumpstoß und jeder Moment ohne. Beide Zahlen waren schwächer, als sie ausg’schaut haben. Der Pump-Zähler hat manchmal an Stoß doppelt gezählt und dafür den nächsten verpasst, und a echte Gleit-Erkennung hat’s überhaupt ned geben. Schiedsrichter is wieder das Handy am Board, und die Antwort is wieder vor allem Physik — mit an bewusst kleinen Modell dort, wo die Physik allein ned reicht.",

  problem: {
    h: "Was falsch war",
    p: "Der bisherige Zähler sucht den Takt in der senkrechten Bewegung vom Handgelenk und nimmt pro Stoß an Gipfel. Gegen das Board g’messen findet er 88 % der echten Pumps — ned schlecht —, aber:",
    li: [
      "**Er hat doppelt gezählt.** Manchmal san zwei Gipfel im Abstand von a paar Hundertstelsekunden beide gezählt worden. In zwei Läufen, die von Hand am Video getippt worden san, haben 5 bzw. 7 solche Doppelten genauso viele verpasste Stöße versteckt — die Summe hat zufällig g’stimmt.",
      "**Er hat im Gleiten weitergezählt.** Die Arme bewegen sich weiter, wenn die Füß aufhören. 22 % von allem, was die Uhr gezählt hat, waren keine echten Pumps; a großer Teil davon is im Gleiten g’legen.",
      "**A Gleit-Erkennung hat’s ned geben.** Was die App *längste Gleitphase* g’nannt hat, war einfach die längste Lücke zwischen zwei gezählten Pumps. Weil der Zähler selten aufg’hört hat, war die Lücke fast nie echtes Gleiten — in den gegen das Board geprüften Läufen haben die bisherigen Gleitphasen 0 von 64 echten g’funden.",
    ],
  },

  truth: {
    h: "Der Schiedsrichter: a Handy am Board",
    p: "Wie in [Teil 4](/nerd-analysen-4) misst a Handy, das am Board pickt, das Board selber: wie weit es sich mit jedem Stoß hebt und senkt und ob der Stoß wirklich Energie in die Fahrt bringt. Gleichzeitig mit einer Uhr am Handgelenk aufg’nommen und auf Bruchteile von einer Sekunde ausgerichtet, sagt es für jeden Stoß, ob’s ihn geben hat, und für jede Lücke, ob sie Gleiten war. 14 solche Aufnahmen von 5 Fahrern taugen dafür: rund 3.700 vom Board bestätigte Pumps und 64 Gleitphasen.",
    cap: "Einer von meinen Läufen. Oben das Board, wie es sich hebt und senkt — jede cyanfarbene Linie is a Stoß mit Energie, gelb das Gleiten vorm Aufsetzen (rot). Unten das Handgelenk mit den Pumps, die der bisherige Zähler g’funden hat (rote Punkte). Schau auf die Punkte im Gleiten.",
    p2: "A Pump is da, was das Board sagt: a Stoß, der Energie in die Fahrt bringt. A bisserl Wackeln beim Ausbalancieren zählt ned, die letzten Schwinger von an Board, das eh schon absinkt, a ned.",
  },

  physics: {
    h: "Physik statt Auswendiglernen",
    p: "Mit fünf Fahrern tät a großes Modell vor allem diese fünf Leut lernen. Deshalb kommt die Pumpzahl selber ganz ohne trainiertes Modell aus — sie nutzt, was Pumpen physikalisch is: a Takt.",
    li: [
      "**Takt-Filter.** Die Kandidaten-Gipfel werden gegen den lokalen Takt der letzten Stöße geprüft. Zwei Gipfel, die viel näher beieinander san als a Stoß, san a Stoß — der schwächere fliegt raus. A Lücke von zwei oder drei Stößen mit an passenden, schwächeren Gipfel in der Mitten kriegt den Gipfel zurück: a Pump, der da war, nur leiser.",
      "**Takt-Verfolger.** A zweiter Durchgang folgt dem Takt Stoß für Stoß und sagt voraus, wo der nächste liegen müsst. Er darf sich schnell anpassen — Pumpen is ka Metronom: man gibt Gas, um in Fahrt zu kommen, und wird bewusst langsamer. Wo er an Stoß findet, den der Filter verpasst hat, kommt der dazu.",
      "**Gleiten = Takt reißt ab und Energie fallt.** A kräftiger Gipfel im Gleiten bleibt a Pump. Nur schwache Gipfel — unter 40 % vom eigenen typischen Stoß in dem Lauf — fliegen raus, wenn sich das Gleit-Modell sicher is.",
    ],
    cap: "Pumpen is ka Metronom: in dem Lauf schwankt der Takt zwischen etwa 77 und 90 Stößen pro Minute. Der Verfolger nutzt nur die letzten Stöße und geht deshalb mit.",
    p2: "Der einzige trainierte Teil entscheidet für jede Viertelsekunde: **gleiten oder pumpen**. Er is absichtlich klein:",
    li2: [
      "Entscheidungsbäume mit **7 Blättern**, mehr ned,",
      "Eingaben relativ zum eigenen Lauf (Stärke relativ zum eigenen Pumpen, Takt relativ zum eigenen Takt), ka Uhrmodell, ka Fahrer-Kennung,",
      "ka Angabe, wo im Lauf a Moment liegt — sonst lernt das Modell einfach, dass Gleiten meistens am Schluss kommt,",
      "die Ausgabe wird über überlappende 5-Sekunden-Fenster g’mittelt und von an einfachen Zustandsmodell g’glättet, das weiß, dass Gleiten mindestens ungefähr 1,5 Sekunden dauert.",
    ],
  },

  honest: {
    h: "Ehrlich g’messen",
    p: "Jede Zahl da is an Fahrern g’messen, die das Modell nie g’sehen hat: an vier trainiert, am fünften geprüft, fünfmal. Gegen das Board, verglichen mit dem bisherigen Zähler:",
    cap1: "Mittel über 5 Fahrer, jeder g’messen, ohne im Training g’wesen zu sein. Rechts: g’fundene Pumps pro Fahrer — jeder Fahrer kriegt mehr von seinen echten Pumps.",
    p2: "In Zahlen:",
    li: [
      "**G’fundene Pumps** (auf ±0,25 s): 88,5 % → 93,1 % (auf ±0,4 s: 98 %).",
      "**Gezählte Pumps, die echt san:** 78 % → 87 %.",
      "**Fehler der Pumpzahl pro Lauf:** 17 % → 11 %.",
      "**Rund um Taktwechsel** (Gas geben, langsamer werden): 89 % → 95 % der Stöße g’funden.",
      "**G’fundenes Gleiten:** 0 % → 51 %, und 54 % der g’meldeten Gleitphasen san echt.",
      "**Die von Hand getippten Läufe:** ka einziger getippter Pump fehlt — vorher haben 4 und 6 hinter den Doppelten g’fehlt.",
    ],
    cap2: "Links und Mitte stammen aus der ersten Modellrunde, in der a Modell alles entschieden hat (die dort g’wählte Größe, 7 Blätter, nutzt das Gleit-Modell jetzt). Links: a größeres Modell lernt seine Trainingsfahrer immer besser, an fremden Fahrer aber ned. Mitte: jeder weitere Fahrer hilft no. Rechts: a kleines neuronales Netz auf den Rohsignalen war schlechter als das kleine Baummodell.",
    p3: "Wir haben a a kleines neuronales Netz auf den Rohsignalen probiert statt ausg’suchter Eingaben. Mit so wenig Daten hat’s klar verloren. Das is ka Urteil über neuronale Netze — es is a Urteil über 5 Fahrer.",
  },

  before: {
    h: "Vorher und nachher",
    p: "Zwei von meinen Läufen, wie die App sie bisher zeigt hat und wie die neue Erkennung sie sieht. Cyan san Pumps, gelb is Gleiten.",
    cap: "Lauf 2: 58 → 50 Pumps; die Doppelten san weg, und das Gleiten am Schluss taucht auf (das Board sagt: 5,8 s). Lauf 4: drei kurze Gleitphasen statt keiner; das Board hat in dem Lauf eine von 3,6 s g’sehen.",
    p2: "Über alle Aufnahmen macht Gleiten jetzt etwa 6 % der Foil-Zeit aus — nah an den 7 %, die das Board misst. Die Laufgrenzen selber bleiben unberührt; es ändert sich nur, was in an Lauf passiert. A paar sehr lange Gleitphasen, in denen das Tempo kaum fallt, zählen ned als Gleiten, sondern werden zum genaueren Hinschauen markiert: meistens is das a Welle, a Zug von irgendwo oder Stöße, die die Uhr ned sehen hat können.",
  },

  limits: {
    h: "Grenzen",
    li: [
      "**Fünf Fahrer.** Die Lernkurve is no ned flach. Jeder Fahrer mit Handy am Board macht den Gleit-Teil besser.",
      "**Gleiten is no der schwere Teil.** Die Hälfte der echten Gleitphasen wird g’funden, und jede zweite g’meldete is echt. A Anfang, ned das Ende.",
      "**Carves brauchen mehr Daten.** Das Board sieht a Kurven. 42 Carves in den bisherigen Aufnahmen san viel zu wenig für a eigene Erkennung — es bräuchat grob 110 mehr, von mehr Fahrern.",
      "**Seit 23. Oktober live.** Alle Aufnahmen san neu g’rechnet worden; die alten Zahlen bleiben im Hintergrund erhalten, die Rekorde folgen den neuen.",
    ],
  },

  help: {
    h: "So kannst du helfen",
    p: "Am meisten hilft a Aufnahme mit **beidem**: die Uhr am Handgelenk und a Handy fest am Board, beide nehmen gleichzeitig auf.",
    li: [
      "Handy fest am Board anbringen (a wasserdichte Hülle und Klebeband reichen).",
      "Auf beiden die Aufnahme starten, bevor du aufs Wasser gehst, am Schluss beide stoppen.",
      "Zehn Minuten normales Fahren reichen völlig — gern mit Gleiten und der einen oder anderen Kurve.",
    ],
    p2: "Beide Aufnahmen erscheinen wie g’wohnt in deinen Sessions; wir legen sie selber zeitlich übereinander. Wennst magst, sag uns, ob du die Uhr an der vorderen oder hinteren Hand trägst.",
  },
};

const gsw: N6 = {
  back: "← Teil 5: S Erkennigsmodell",
  h1: "Teil 6: Pumps und Glite",
  subtitle: "Wie d Uhr lernt, jede Pump eimal z zelle — und z merke, wänn du ufhörsch z pumpe",
  intro:
    "Im Teil 5 isch es drum gange, **öb** öpper grad uf em Foil staht. Da gaht’s drum, was **derwiil** passiert: jede Pumpstoss und jede Moment ohni. Beidi Zahle sind schwächer gsi, als si usgseh händ. De Pump-Zeller hät mängisch en Stoss doppelt zellt und derfür de nächscht verpasst, und e ächti Glit-Erkennig hät’s überhaupt nöd gee. Schiidsrichter isch wider s Händy am Board, und d Antwort isch wider vor allem Physik — mit emne extra chliine Modell det, wo d Physik ellei nöd langt.",

  problem: {
    h: "Was falsch gsi isch",
    p: "De bisherig Zeller suecht de Takt i de sänkrächte Bewegig vom Handglänk und nimmt pro Stoss en Gipfel. Gäge s Board gmässe findet er 88 % vo de ächte Pumps — nöd schlächt —, aber:",
    li: [
      "**Er hät doppelt zellt.** Mängisch sind zwei Gipfel im Abstand vo es paar Hundertstelsekunde beidi zellt worde. I zwei Läuf, wo vo Hand am Video tippt worde sind, händ 5 und 7 settigi Doppleti grad gliich vill verpassti Stöss versteckt — d Summe hät zuefällig gstimmt.",
      "**Er hät im Glite wiiterzellt.** D Arm bewegit sich wiiter, wänn d Bei ufhöred. 22 % vo allem, was d Uhr zellt hät, sind kei ächti Pumps gsi; en grosse Teil dervo isch im Glite gläge.",
      "**E Glit-Erkennig hät’s nöd gee.** Was d App *längschti Glitphase* gnännt hät, isch eifach di längscht Lücke zwüsche zwei zellte Pumps gsi. Wil de Zeller sälte ufghört hät, isch die Lücke fascht nie ächts Glite gsi — i de gäge s Board prüefte Läuf händ di bisherige Glitphase 0 vo 64 ächte gfunde.",
    ],
  },

  truth: {
    h: "De Schiidsrichter: es Händy am Board",
    p: "Wie im [Teil 4](/nerd-analysen-4) misst es Händy, wo am Board chläbt, s Board sälber: wie wiit es sich mit jedem Stoss hebt und senkt und öb de Stoss würkli Energie i d Fahrt bringt. Gliichziitig mit ere Uhr am Handglänk ufgnoh und uf Bruchteil vo ere Sekunde usgrichtet, seit’s für jede Stoss, öb’s en gee hät, und für jedi Lücke, öb si Glite gsi isch. 14 settigi Ufnahme vo 5 Fahrer tauged derfür: öppe 3700 vom Board bestätigti Pumps und 64 Glitphase.",
    cap: "Eine vo mine Läuf. Obe s Board, wie’s sich hebt und senkt — jedi cyanfarbig Linie isch en Stoss mit Energie, gälb s Glite vor em Ufsetze (rot). Une s Handglänk mit de Pumps, wo de bisherig Zeller gfunde hät (roti Pünkt). Lueg uf d Pünkt im Glite.",
    p2: "En Pump isch da, was s Board seit: en Stoss, wo Energie i d Fahrt bringt. Es bitzeli Wackle bim Usbalanciere zellt nöd, und di letschte Schwinger vomne Board, wo scho absinkt, au nöd.",
  },

  physics: {
    h: "Physik statt uswändig lerne",
    p: "Mit füf Fahrer würd es grosses Modell vor allem die füf Lüüt lerne. Drum chunnt d Pumpzahl sälber ganz ohni trainierts Modell us — si bruucht, was Pumpe physikalisch isch: en Takt.",
    li: [
      "**Takt-Filter.** D Kandidate-Gipfel wärded gäge de lokal Takt vo de letschte Stöss prüeft. Zwei Gipfel, wo vill nöcher binenand sind als en Stoss, sind en Stoss — de schwächer flügt use. E Lücke vo zwei oder drü Stöss mit emne passende, schwächere Gipfel i de Mitti überchunnt dä Gipfel zrugg: en Pump, wo da gsi isch, nur liisliger.",
      "**Takt-Verfolger.** En zweite Durchgang folget em Takt Stoss für Stoss und seit voruse, wo de nächscht müesst cho. Er dörf sich schnäll aapasse — Pumpe isch kei Metronom: mer git Gas, zum in Fahrt cho, und wird extra langsamer. Wo er en Stoss findet, wo de Filter verpasst hät, chunnt dä derzue.",
      "**Glite = Takt riisst ab und Energie fallt.** En chräftige Gipfel im Glite blibt en Pump. Nur schwachi Gipfel — under 40 % vom eigete typische Stoss i dem Lauf — flüüged use, wänn s Glit-Modell sich sicher isch.",
    ],
    cap: "Pumpe isch kei Metronom: i dem Lauf schwankt de Takt zwüsche öppe 77 und 90 Stöss pro Minute. De Verfolger bruucht nur di letschte Stöss und gaht drum mit.",
    p2: "De einzig trainiert Teil entscheidet für jedi Viertelsekunde: **gleite oder pumpe**. Er isch extra chlii:",
    li2: [
      "Entscheidigsbäum mit **7 Blätter**, nöd meh,",
      "Iigabe relativ zum eigete Lauf (Stärchi relativ zum eigete Pumpe, Takt relativ zum eigete Takt), kei Uhremodell, kei Fahrer-Kennig,",
      "kei Aagab, wo im Lauf en Moment liit — suscht lernt s Modell eifach, dass Glite meischtens am Schluss chunnt,",
      "d Usgab wird über überlappendi 5-Sekunde-Fänschter gmittlet und vomne eifache Zuestandsmodell glättet, wo weiss, dass Glite mindischtens öppe 1,5 Sekunde duuret.",
    ],
  },

  honest: {
    h: "Ehrlich gmässe",
    p: "Jedi Zahl da isch a Fahrer gmässe, wo s Modell nie gseh hät: a vier trainiert, am füfte prüeft, füfmal. Gäge s Board, vergliche mit em bisherige Zeller:",
    cap1: "Mittel über 5 Fahrer, jede gmässe, ohni im Training gsi z sii. Rächts: gfundeni Pumps pro Fahrer — jede Fahrer überchunnt meh vo sine ächte Pumps.",
    p2: "I Zahle:",
    li: [
      "**Gfundeni Pumps** (uf ±0,25 s): 88,5 % → 93,1 % (uf ±0,4 s: 98 %).",
      "**Zellti Pumps, wo ächt sind:** 78 % → 87 %.",
      "**Fähler vo de Pumpzahl pro Lauf:** 17 % → 11 %.",
      "**Rund um Taktwächsel** (Gas gee, langsamer wärde): 89 % → 95 % vo de Stöss gfunde.",
      "**Gfundnigs Glite:** 0 % → 51 %, und 54 % vo de gmäldete Glitphase sind ächt.",
      "**D vo Hand tippte Läuf:** kei einzige tippte Pump fehlt — vorher händ 4 und 6 hinder de Doppelte gfehlt.",
    ],
    cap2: "Links und i de Mitti stammed us de erschte Modellrundi, wo eis Modell alles entschiede hät (d Grössi, wo det gwählt worde isch, 7 Blätter, bruucht s Glit-Modell jetzt). Links: es grössers Modell lernt sini Trainingsfahrer immer besser, en fremde Fahrer aber nöd. Mitti: jede wiiteri Fahrer hilft no. Rächts: es chliises neuronals Netz uf de Rohsignal isch schlächter gsi als s chliine Baummodell.",
    p3: "Mer händ au es chliises neuronals Netz uf de Rohsignal probiert statt usgsuechter Iigabe. Mit so wenig Date hät’s klar verlore. Das isch kei Urteil über neuronali Netz — es isch es Urteil über 5 Fahrer.",
  },

  before: {
    h: "Vorher und nachher",
    p: "Zwei vo mine Läuf, wie d App si bis jetzt zeigt hät und wie di nöi Erkennig si gseht. Cyan sind Pumps, gälb isch Glite.",
    cap: "Lauf 2: 58 → 50 Pumps; d Doppleti sind wäg, und s Glite am Schluss tauchet uf (s Board seit: 5,8 s). Lauf 4: drü churzi Glitphase statt keini; s Board hät i dem Lauf eini vo 3,6 s gseh.",
    p2: "Über alli Ufnahme macht Glite jetzt öppe 6 % vo de Foil-Ziit us — nöch a de 7 %, wo s Board misst. D Laufgränze sälber bliibed unberüehrt; es ändert sich nur, was innerhalb vomne Lauf passiert. Es paar sehr langi Glitphase, wo s Tempo chuum abenimmt, zelled nöd als Glite, sondern wärded zum gnauer Häreluege markiert: meischtens isch das e Wälle, en Zug vo irgendwo oder Stöss, wo d Uhr nöd gseh hät.",
  },

  limits: {
    h: "Gränze",
    li: [
      "**Füf Fahrer.** D Lernkurve isch no nöd flach. Jede Fahrer mit Händy am Board macht de Glit-Teil besser.",
      "**Glite isch no de schwär Teil.** D Hälfti vo de ächte Glitphase wird gfunde, und jedi zweiti gmäldeti isch ächt. En Aafang, nöd s Ändi.",
      "**Carves bruuched meh Date.** S Board gseht au Kurve. 42 Carves i de bisherige Ufnahme sind vill z wenig für e eigeti Erkennig — es bruuchti öppe 110 meh, vo meh Fahrer.",
      "**Sit em 23. Oktober live.** Alli Ufnahme sind nöi grächnet worde; di alte Zahle bliibed im Hintergrund erhalte, d Rekord folged de nöie.",
    ],
  },

  help: {
    h: "So chasch hälfe",
    p: "Am meischte hilft e Ufnahm mit **beidem**: d Uhr am Handglänk und es Händy fescht am Board, beidi nämed gliichziitig uf.",
    li: [
      "S Händy fescht am Board aabringe (e wasserdichti Hüllä und Chläbband längt).",
      "Uf beidne d Ufnahm starte, bevor du ufs Wasser gahsch, am Schluss beidi stoppe.",
      "Zäh Minute normals Fahre längt völlig — gern mit Glite und de einte oder andere Kurve.",
    ],
    p2: "Beidi Ufnahme erschiined wie gwohnt i dine Sessions; mer leged si sälber ziitlich übereinand. Wänn d magsch, säg üs, öb du d Uhr a de vordere oder hindere Hand treisch.",
  },
};

const fr: N6 = {
  back: "← Partie 5 : Le modèle de détection",
  h1: "Partie 6 : Pumps et glisse",
  subtitle: "Apprendre à la montre à compter chaque pump une seule fois — et à remarquer quand tu arrêtes de pumper",
  intro:
    "La partie 5 portait sur la question de savoir **si** quelqu’un est sur le foil. Celle-ci porte sur ce qui se passe **pendant** : chaque coup de pump, et chaque instant sans. Les deux chiffres étaient plus faibles qu’ils n’en avaient l’air. Le compteur comptait parfois un coup deux fois et ratait le suivant, et une vraie détection de la glisse n’existait pas du tout. L’arbitre est de nouveau le téléphone sur la planche, et la réponse est de nouveau surtout de la physique, avec un modèle volontairement petit là où la physique seule ne suffit pas.",

  problem: {
    h: "Ce qui n’allait pas",
    p: "L’ancien compteur cherche le rythme dans le mouvement vertical du poignet et prend un pic par coup. Mesuré contre la planche, il trouve 88 % des vrais pumps — pas mal — mais :",
    li: [
      "**Il comptait double.** Parfois deux pics à quelques centièmes de seconde d’écart étaient comptés tous les deux. Sur deux runs marqués à la main sur vidéo, 5 et 7 doublons de ce genre cachaient exactement autant de coups ratés — le total tombait juste par hasard.",
      "**Il continuait de compter pendant la glisse.** Les bras bougent encore quand les jambes s’arrêtent. 22 % de tout ce que la montre comptait n’étaient pas de vrais pumps ; une bonne partie se trouvait dans les phases de glisse.",
      "**Il n’y avait pas de détection de la glisse.** Ce que l’app appelait *plus longue glisse* n’était que le plus long écart entre deux pumps comptés. Comme le compteur s’arrêtait rarement, cet écart n’était presque jamais une vraie glisse — sur les runs vérifiés avec la planche, les anciennes glisses en trouvaient 0 sur 64.",
    ],
  },

  truth: {
    h: "L’arbitre : un téléphone sur la planche",
    p: "Comme dans la [partie 4](/nerd-analysen-4), un téléphone fixé sur la planche mesure la planche elle-même : de combien elle monte et descend à chaque coup, et si ce coup apporte vraiment de l’énergie à la ride. Enregistré en même temps qu’une montre au poignet et aligné à une fraction de seconde près, il nous dit pour chaque coup s’il a eu lieu, et pour chaque écart s’il s’agissait d’une glisse. 14 sessions de ce type, de 5 riders, s’y prêtent : environ 3 700 pumps confirmés par la planche et 64 glisses.",
    cap: "Un de mes runs. En haut : la planche qui monte et descend — chaque ligne cyan est un coup avec énergie, en jaune la glisse avant le touchdown (rouge). En bas : le poignet, avec les pumps trouvés par l’ancien compteur (points rouges). Regarde les points dans la glisse.",
    p2: "Un pump, ici, c’est ce que dit la planche : un coup qui pousse de l’énergie dans la ride. Les petits mouvements d’équilibre ne comptent pas, pas plus que les dernières oscillations d’une planche qui s’enfonce déjà.",
  },

  physics: {
    h: "De la physique plutôt que du par-cœur",
    p: "Avec cinq riders, un gros modèle apprendrait surtout ces cinq personnes. Le comptage des pumps se fait donc sans aucun modèle entraîné, en utilisant ce qu’est physiquement le pumping — un rythme :",
    li: [
      "**Filtre de rythme.** Les pics candidats sont comparés au rythme local des derniers coups. Deux pics bien plus proches qu’un coup n’en forment qu’un — le plus faible disparaît. Un trou de deux ou trois coups avec, au milieu, un pic plus faible au bon endroit récupère ce pic : un pump qui était là, juste plus discret.",
      "**Suivi du rythme.** Un second passage suit le rythme coup par coup et prédit où devrait tomber le suivant. Il a le droit de s’adapter vite — le pumping n’est pas un métronome : on accélère pour démarrer et on ralentit exprès. Là où il trouve un coup que le filtre a raté, ce coup est ajouté.",
      "**Glisse = le rythme se rompt et l’énergie chute.** Un pic fort pendant une glisse reste un pump. Seuls les pics faibles — moins de 40 % du coup typique du rider dans ce run — sont retirés quand le modèle de glisse est sûr de lui.",
    ],
    cap: "Le pumping n’est pas un métronome : dans ce run, le rythme varie entre environ 77 et 90 coups par minute. Le suivi n’utilise que les derniers coups, il suit donc.",
    p2: "La seule partie entraînée décide pour chaque quart de seconde : **glisse ou pump**. Elle reste volontairement petite :",
    li2: [
      "des arbres de décision à **7 feuilles**, pas plus,",
      "des entrées relatives au run du rider (force relative à son propre pumping, rythme relatif à son propre rythme), pas de modèle de montre, pas d’identité du rider,",
      "aucune information sur l’endroit du run où se situe un instant — sinon le modèle apprendrait simplement que les glisses arrivent plutôt à la fin,",
      "sa sortie est lissée par des fenêtres de 5 secondes qui se chevauchent et par un modèle d’états simple qui sait qu’une glisse dure au moins environ 1,5 seconde.",
    ],
  },

  honest: {
    h: "Mesuré honnêtement",
    p: "Chaque chiffre ici est mesuré sur des riders que le modèle n’a jamais vus : entraîné sur quatre, testé sur le cinquième, cinq fois. Contre la planche, comparé à l’ancien compteur :",
    cap1: "Moyenne sur 5 riders, chacun mesuré sans avoir fait partie de l’entraînement. À droite : pumps trouvés par rider — chaque rider retrouve davantage de ses vrais pumps.",
    p2: "En chiffres :",
    li: [
      "**Pumps trouvés** (à ±0,25 s) : 88,5 % → 93,1 % (à ±0,4 s : 98 %).",
      "**Pumps comptés qui sont réels :** 78 % → 87 %.",
      "**Erreur sur le nombre de pumps par run :** 17 % → 11 %.",
      "**Autour des changements de rythme** (accélérer, ralentir) : 89 % → 95 % des coups trouvés.",
      "**Glisses trouvées :** 0 % → 51 %, et 54 % des glisses signalées sont réelles.",
      "**Les runs marqués à la main :** pas un seul pump marqué ne manque — avant, il en manquait 4 et 6 derrière les doublons.",
    ],
    cap2: "La gauche et le milieu viennent du premier tour de modèles, où un seul modèle décidait de tout (la taille choisie là, 7 feuilles, est celle qu’utilise maintenant le modèle de glisse). À gauche : un modèle plus gros apprend de mieux en mieux ses riders d’entraînement, mais pas un rider inconnu. Au milieu : chaque rider supplémentaire aide encore. À droite : un petit réseau de neurones sur les signaux bruts a fait moins bien que le petit modèle à arbres.",
    p3: "Nous avons aussi essayé un petit réseau de neurones sur les signaux bruts au lieu d’entrées choisies à la main. Avec si peu de données, il a nettement perdu. Ce n’est pas un verdict sur les réseaux de neurones — c’est un verdict sur 5 riders.",
  },

  before: {
    h: "Avant et après",
    p: "Deux de mes runs, tels que l’app les montrait jusqu’ici et tels que les voit la nouvelle détection. Les points cyan sont des pumps, les tronçons jaunes des glisses.",
    cap: "Run 2 : 58 → 50 pumps ; les doublons ont disparu et la glisse de la fin apparaît (la planche dit : 5,8 s). Run 4 : trois courtes glisses au lieu d’aucune ; sur la planche, ce run avait une glisse de 3,6 s.",
    p2: "Sur l’ensemble des enregistrements, la glisse représente maintenant environ 6 % du temps sur le foil — proche des 7 % mesurés par la planche. Les limites des runs ne bougent pas ; seul ce qui se passe à l’intérieur d’un run change. Quelques glisses très longues pendant lesquelles la vitesse baisse à peine ne comptent pas comme glisse mais sont signalées pour un examen plus attentif : c’est généralement une vague, une traction venue d’ailleurs ou des coups que la montre ne pouvait pas voir.",
  },

  limits: {
    h: "Limites",
    li: [
      "**Cinq riders.** La courbe d’apprentissage n’est pas encore plate. Chaque rider avec un téléphone sur la planche améliore la partie glisse.",
      "**La glisse reste la partie difficile.** La moitié des vraies glisses est trouvée, et une glisse signalée sur deux est réelle. C’est un début, pas une fin.",
      "**Les carves demandent plus de données.** La planche voit aussi les virages. 42 carves dans les enregistrements actuels, c’est bien trop peu pour une détection à part — il en faudrait environ 110 de plus, venant de plus de riders.",
      "**En ligne depuis le 23 octobre.** Tous les enregistrements ont été recalculés ; les anciens chiffres sont conservés en arrière-plan, et les records suivent les nouveaux.",
    ],
  },

  help: {
    h: "Comment tu peux aider",
    p: "Le plus utile est une session avec **les deux** : la montre au poignet et un téléphone fixé sur la planche, qui enregistrent en même temps.",
    li: [
      "Fixe solidement le téléphone sur la planche (une pochette étanche et du ruban adhésif suffisent).",
      "Lance l’enregistrement sur les deux avant d’aller sur l’eau, arrête les deux à la fin.",
      "Dix minutes de ride normale suffisent largement — glisses et quelques carves compris.",
    ],
    p2: "Les deux enregistrements apparaissent comme d’habitude dans tes sessions ; nous les alignons nous-mêmes dans le temps. Si tu veux, dis-nous si tu portais la montre à la main avant ou arrière.",
  },
};

const it: N6 = {
  back: "← Parte 5: Il modello di rilevamento",
  h1: "Parte 6: Pump e planata",
  subtitle: "Insegnare all’orologio a contare ogni pump una volta sola — e ad accorgersi di quando smetti di pompare",
  intro:
    "La parte 5 parlava di decidere **se** qualcuno è sul foil. Questa parla di ciò che succede **mentre** lo è: ogni colpo di pump e ogni momento senza. Entrambi i numeri erano più deboli di quanto sembrassero. Il contatore a volte contava un colpo due volte e saltava il successivo, e un vero rilevamento della planata non esisteva affatto. L’arbitro è di nuovo il telefono sulla tavola, e la risposta è di nuovo soprattutto fisica, con un modello volutamente piccolo dove la fisica da sola non basta.",

  problem: {
    h: "Cosa non andava",
    p: "Il vecchio contatore cerca il ritmo nel movimento verticale del polso e prende un picco per colpo. Misurato contro la tavola trova l’88 % dei pump reali — niente male — ma:",
    li: [
      "**Contava doppio.** A volte due picchi a pochi centesimi di secondo l’uno dall’altro venivano contati entrambi. In due run marcati a mano dal video, 5 e 7 doppioni di questo tipo nascondevano esattamente altrettanti colpi persi — il totale tornava per caso.",
      "**Continuava a contare in planata.** Le braccia si muovono ancora quando le gambe si fermano. Il 22 % di tutto ciò che l’orologio contava non erano pump reali; una buona parte stava nelle planate.",
      "**Non c’era un rilevamento della planata.** Quella che l’app chiamava *planata più lunga* era semplicemente il buco più lungo tra due pump contati. Poiché il contatore si fermava di rado, quel buco non era quasi mai una vera planata — nei run verificati con la tavola, le vecchie planate ne trovavano 0 su 64.",
    ],
  },

  truth: {
    h: "L’arbitro: un telefono sulla tavola",
    p: "Come nella [parte 4](/nerd-analysen-4), un telefono fissato alla tavola misura la tavola stessa: quanto sale e scende a ogni colpo, e se quel colpo porta davvero energia nella corsa. Registrato insieme a un orologio al polso e allineato a una frazione di secondo, ci dice per ogni colpo se c’è stato, e per ogni buco se era una planata. Vanno bene 14 sessioni di questo tipo, di 5 rider: circa 3.700 pump confermati dalla tavola e 64 planate.",
    cap: "Uno dei miei run. In alto: la tavola che sale e scende — ogni linea ciano è un colpo con energia, in giallo la planata prima del touchdown (rosso). In basso: il polso, con i pump trovati dal vecchio contatore (punti rossi). Guarda i punti dentro la planata.",
    p2: "Qui un pump è ciò che dice la tavola: un colpo che spinge energia nella corsa. I piccoli movimenti di equilibrio non contano, e nemmeno le ultime oscillazioni di una tavola che sta già affondando.",
  },

  physics: {
    h: "Fisica invece di imparare a memoria",
    p: "Con cinque rider un modello grande imparerebbe soprattutto quelle cinque persone. Per questo il conteggio dei pump avviene senza alcun modello addestrato, usando ciò che il pumping è fisicamente — un ritmo:",
    li: [
      "**Filtro del ritmo.** I picchi candidati vengono confrontati con il ritmo locale degli ultimi colpi. Due picchi molto più vicini di un colpo sono un colpo solo — il più debole se ne va. Un buco di due o tre colpi con al centro un picco più debole al posto giusto si riprende quel picco: un pump che c’era, solo più piano.",
      "**Inseguitore del ritmo.** Un secondo passaggio segue il ritmo colpo per colpo e prevede dove dovrebbe cadere il prossimo. Può adattarsi in fretta — il pumping non è un metronomo: si accelera per partire e si rallenta di proposito. Dove trova un colpo che il filtro ha perso, lo aggiunge.",
      "**Planata = il ritmo si interrompe e l’energia cala.** Un picco forte dentro una planata resta un pump. Solo i picchi deboli — meno del 40 % del colpo tipico del rider in quel run — vengono tolti quando il modello di planata è sicuro.",
    ],
    cap: "Il pumping non è un metronomo: in questo run il ritmo oscilla tra circa 77 e 90 colpi al minuto. L’inseguitore usa solo gli ultimi colpi, quindi segue.",
    p2: "L’unica parte addestrata decide per ogni quarto di secondo: **planata o pump**. È tenuta piccola di proposito:",
    li2: [
      "alberi di decisione con **7 foglie**, niente di più,",
      "ingressi relativi al run del rider (forza relativa al suo pumping, ritmo relativo al suo ritmo), nessun modello di orologio, nessuna identità del rider,",
      "nessuna informazione su dove si trovi un istante nel run — altrimenti il modello imparerebbe solo che le planate tendono a stare alla fine,",
      "la sua uscita viene smussata con finestre di 5 secondi sovrapposte e con un semplice modello a stati che sa che una planata dura almeno circa 1,5 secondi.",
    ],
  },

  honest: {
    h: "Misurato onestamente",
    p: "Ogni numero qui è misurato su rider che il modello non ha mai visto: addestrato su quattro, provato sul quinto, cinque volte. Contro la tavola, confrontato con il vecchio contatore:",
    cap1: "Media su 5 rider, ciascuno misurato senza essere stato nell’addestramento. A destra: pump trovati per rider — ogni rider ritrova più dei suoi pump reali.",
    p2: "In numeri:",
    li: [
      "**Pump trovati** (entro ±0,25 s): 88,5 % → 93,1 % (±0,4 s: 98 %).",
      "**Pump contati che sono reali:** 78 % → 87 %.",
      "**Errore sul numero di pump per run:** 17 % → 11 %.",
      "**Attorno ai cambi di ritmo** (accelerare, rallentare): 89 % → 95 % dei colpi trovati.",
      "**Planate trovate:** 0 % → 51 %, e il 54 % delle planate segnalate è reale.",
      "**I run marcati a mano:** non manca nemmeno un pump marcato — prima ne mancavano 4 e 6 dietro i doppioni.",
    ],
    cap2: "Sinistra e centro vengono dal primo giro di modelli, in cui un solo modello decideva tutto (la dimensione scelta lì, 7 foglie, è quella che usa ora il modello di planata). A sinistra: un modello più grande impara sempre meglio i suoi rider di addestramento, ma non un rider mai visto. Al centro: ogni rider in più aiuta ancora. A destra: una piccola rete neurale sui segnali grezzi è andata peggio del piccolo modello ad alberi.",
    p3: "Abbiamo provato anche una piccola rete neurale sui segnali grezzi invece di ingressi scelti a mano. Con così pochi dati ha perso nettamente. Non è un giudizio sulle reti neurali — è un giudizio su 5 rider.",
  },

  before: {
    h: "Prima e dopo",
    p: "Due dei miei run, come li mostrava finora l’app e come li vede il nuovo rilevamento. I punti ciano sono pump, i tratti gialli planate.",
    cap: "Run 2: 58 → 50 pump; i doppioni sono spariti e compare la planata alla fine (la tavola dice: 5,8 s). Run 4: tre brevi planate invece di nessuna; sulla tavola questo run aveva una planata di 3,6 s.",
    p2: "Su tutte le registrazioni la planata è ora circa il 6 % del tempo sul foil — vicino al 7 % che misura la tavola. I confini dei run non vengono toccati; cambia solo ciò che succede dentro un run. Alcune planate molto lunghe in cui la velocità quasi non cala non contano come planata ma vengono segnalate per un controllo: di solito è un’onda, una spinta da qualche parte o colpi che l’orologio non poteva vedere.",
  },

  limits: {
    h: "Limiti",
    li: [
      "**Cinque rider.** La curva di apprendimento non si è ancora appiattita. Ogni rider con un telefono sulla tavola migliora la parte della planata.",
      "**La planata resta la parte difficile.** Metà delle planate reali viene trovata, e una planata segnalata su due è reale. È un inizio, non la fine.",
      "**I carve hanno bisogno di più dati.** La tavola vede anche le curve. 42 carve nelle registrazioni finora sono troppo pochi per un rilevamento a sé — ne servirebbero circa 110 in più, da più rider.",
      "**Online dal 23 ottobre.** Tutte le registrazioni sono state ricalcolate; i vecchi numeri restano conservati sullo sfondo, e i record seguono i nuovi.",
    ],
  },

  help: {
    h: "Come puoi aiutare",
    p: "La cosa più utile è una sessione con **entrambi**: l’orologio al polso e un telefono fissato alla tavola, che registrano nello stesso momento.",
    li: [
      "Fissa bene il telefono alla tavola (bastano una custodia impermeabile e del nastro).",
      "Avvia la registrazione su entrambi prima di entrare in acqua, fermali entrambi alla fine.",
      "Dieci minuti di uscita normale bastano e avanzano — planate e qualche carve compresi.",
    ],
    p2: "Entrambe le registrazioni compaiono come sempre nelle tue sessioni; le allineiamo noi nel tempo. Se ti va, dicci se portavi l’orologio sulla mano davanti o dietro.",
  },
};

const es: N6 = {
  back: "← Parte 5: El modelo de detección",
  h1: "Parte 6: Pumps y planeo",
  subtitle: "Enseñar al reloj a contar cada pump una sola vez — y a notar cuándo dejas de pumpear",
  intro:
    "La parte 5 trataba de decidir **si** alguien está sobre el foil. Esta trata de lo que pasa **mientras** lo está: cada golpe de pump y cada momento sin él. Ambas cifras eran más flojas de lo que parecían. El contador a veces contaba un golpe dos veces y se saltaba el siguiente, y una detección real del planeo no existía en absoluto. El árbitro vuelve a ser el móvil en la tabla, y la respuesta vuelve a ser sobre todo física, con un modelo deliberadamente pequeño donde la física sola no basta.",

  problem: {
    h: "Qué estaba mal",
    p: "El contador anterior busca el ritmo en el movimiento vertical de la muñeca y toma un pico por golpe. Medido contra la tabla encuentra el 88 % de los pumps reales — nada mal — pero:",
    li: [
      "**Contaba doble.** A veces se contaban dos picos separados por unas centésimas de segundo. En dos recorridos marcados a mano sobre vídeo, 5 y 7 de esos dobles escondían exactamente otros tantos golpes perdidos — el total cuadraba por casualidad.",
      "**Seguía contando durante el planeo.** Los brazos se siguen moviendo cuando las piernas paran. El 22 % de todo lo que contaba el reloj no eran pumps reales; buena parte estaba en el planeo.",
      "**No había detección del planeo.** Lo que la app llamaba *planeo más largo* era simplemente el hueco más largo entre dos pumps contados. Como el contador rara vez paraba, ese hueco casi nunca era un planeo real — en los recorridos comprobados con la tabla, los planeos antiguos encontraban 0 de 64.",
    ],
  },

  truth: {
    h: "El árbitro: un móvil en la tabla",
    p: "Como en la [parte 4](/nerd-analysen-4), un móvil pegado a la tabla mide la tabla misma: cuánto sube y baja con cada golpe, y si ese golpe aporta realmente energía al recorrido. Grabado a la vez que un reloj en la muñeca y alineado a una fracción de segundo, nos dice para cada golpe si ocurrió, y para cada hueco si fue planeo. Sirven 14 sesiones así, de 5 riders: unos 3.700 pumps confirmados por la tabla y 64 planeos.",
    cap: "Uno de mis recorridos. Arriba: la tabla subiendo y bajando — cada línea cian es un golpe con energía, en amarillo el planeo antes del touchdown (rojo). Abajo: la muñeca, con los pumps que encontró el contador anterior (puntos rojos). Fíjate en los puntos dentro del planeo.",
    p2: "Aquí un pump es lo que dice la tabla: un golpe que empuja energía al recorrido. Los pequeños movimientos para mantener el equilibrio no cuentan, ni tampoco los últimos vaivenes de una tabla que ya se hunde.",
  },

  physics: {
    h: "Física en lugar de memorizar",
    p: "Con cinco riders, un modelo grande aprendería sobre todo a esas cinco personas. Por eso el recuento de pumps se hace sin ningún modelo entrenado, usando lo que el pumping es físicamente — un ritmo:",
    li: [
      "**Filtro de ritmo.** Los picos candidatos se comparan con el ritmo local de los últimos golpes. Dos picos mucho más cercanos que un golpe son un solo golpe — el más débil se va. Un hueco de dos o tres golpes con un pico más débil en el sitio adecuado en medio recupera ese pico: un pump que estaba ahí, solo más flojo.",
      "**Seguidor de ritmo.** Una segunda pasada sigue el ritmo golpe a golpe y predice dónde debería caer el siguiente. Puede adaptarse rápido — el pumping no es un metrónomo: se acelera para arrancar y se afloja a propósito. Donde encuentra un golpe que el filtro perdió, lo añade.",
      "**Planeo = el ritmo se rompe y la energía cae.** Un pico fuerte dentro de un planeo sigue siendo un pump. Solo los picos débiles — menos del 40 % del golpe típico del rider en ese recorrido — se quitan cuando el modelo de planeo está seguro.",
    ],
    cap: "El pumping no es un metrónomo: en este recorrido el ritmo varía entre unos 77 y 90 golpes por minuto. El seguidor solo usa los últimos golpes, así que acompaña.",
    p2: "La única parte entrenada decide para cada cuarto de segundo: **planeo o pump**. Se mantiene pequeña a propósito:",
    li2: [
      "árboles de decisión con **7 hojas**, nada más,",
      "entradas relativas al propio recorrido del rider (fuerza relativa a su propio pumping, ritmo relativo a su propio ritmo), sin modelo de reloj, sin identidad del rider,",
      "ninguna información sobre en qué parte del recorrido está un instante — si no, el modelo aprendería sin más que el planeo suele llegar al final,",
      "su salida se suaviza con ventanas de 5 segundos solapadas y con un modelo de estados sencillo que sabe que un planeo dura al menos 1,5 segundos aproximadamente.",
    ],
  },

  honest: {
    h: "Medido con honestidad",
    p: "Cada cifra aquí se mide con riders que el modelo nunca vio: entrenado con cuatro, probado con el quinto, cinco veces. Contra la tabla, comparado con el contador anterior:",
    cap1: "Media de 5 riders, cada uno medido sin haber estado en el entrenamiento. A la derecha: pumps encontrados por rider — cada rider recupera más de sus pumps reales.",
    p2: "En cifras:",
    li: [
      "**Pumps encontrados** (a ±0,25 s): 88,5 % → 93,1 % (a ±0,4 s: 98 %).",
      "**Pumps contados que son reales:** 78 % → 87 %.",
      "**Error en el número de pumps por recorrido:** 17 % → 11 %.",
      "**Alrededor de los cambios de ritmo** (acelerar, aflojar): 89 % → 95 % de los golpes encontrados.",
      "**Planeos encontrados:** 0 % → 51 %, y el 54 % de los planeos que señala son reales.",
      "**Los recorridos marcados a mano:** no falta ni un solo pump marcado — antes faltaban 4 y 6 detrás de los dobles.",
    ],
    cap2: "Izquierda y centro vienen de la primera ronda de modelos, en la que un solo modelo decidía todo (el tamaño elegido allí, 7 hojas, es el que usa ahora el modelo de planeo). Izquierda: un modelo más grande aprende cada vez mejor a sus riders de entrenamiento, pero no a un rider que nunca ha visto. Centro: cada rider más sigue ayudando. Derecha: una pequeña red neuronal sobre las señales brutas lo hizo peor que el pequeño modelo de árboles.",
    p3: "También probamos una pequeña red neuronal sobre las señales brutas en lugar de entradas elegidas a mano. Con tan pocos datos perdió claramente. No es un veredicto sobre las redes neuronales — es un veredicto sobre 5 riders.",
  },

  before: {
    h: "Antes y después",
    p: "Dos de mis recorridos, tal como los mostraba la app hasta ahora y tal como los ve la nueva detección. Los puntos cian son pumps, los tramos amarillos planeos.",
    cap: "Recorrido 2: 58 → 50 pumps; los dobles desaparecen y aparece el planeo del final (la tabla dice: 5,8 s). Recorrido 4: tres planeos cortos en lugar de ninguno; en la tabla este recorrido tuvo un planeo de 3,6 s.",
    p2: "En todas las grabaciones, el planeo supone ahora alrededor del 6 % del tiempo sobre el foil — cerca del 7 % que mide la tabla. Los límites de los recorridos no se tocan; solo cambia lo que pasa dentro de un recorrido. Algunos planeos muy largos en los que la velocidad apenas baja no cuentan como planeo, sino que se marcan para mirarlos con más detalle: suele ser una ola, un tirón de algún sitio o golpes que el reloj no podía ver.",
  },

  limits: {
    h: "Límites",
    li: [
      "**Cinco riders.** La curva de aprendizaje aún no se ha aplanado. Cada rider con un móvil en la tabla mejora la parte del planeo.",
      "**El planeo sigue siendo la parte difícil.** Se encuentra la mitad de los planeos reales, y uno de cada dos planeos señalados es real. Es un comienzo, no el final.",
      "**Los carves necesitan más datos.** La tabla también ve los giros. 42 carves en las grabaciones hasta ahora son demasiado pocos para una detección propia — harían falta unos 110 más, de más riders.",
      "**En marcha desde el 23 de octubre.** Todas las grabaciones se han recalculado; las cifras antiguas se conservan en segundo plano y los récords siguen a las nuevas.",
    ],
  },

  help: {
    h: "Cómo puedes ayudar",
    p: "Lo más útil es una sesión con **ambos**: el reloj en la muñeca y un móvil fijado a la tabla, grabando a la vez.",
    li: [
      "Fija bien el móvil a la tabla (basta una funda estanca y cinta).",
      "Inicia la grabación en ambos antes de entrar al agua y detén ambos al final.",
      "Diez minutos de salida normal son más que suficientes — con planeos y algún que otro carve.",
    ],
    p2: "Ambas grabaciones aparecen como siempre en tus sesiones; nosotros las alineamos en el tiempo. Si quieres, dinos si llevabas el reloj en la mano delantera o en la trasera.",
  },
};

const pt: N6 = {
  back: "← Parte 5: O modelo de detecção",
  h1: "Parte 6: Pumps e planeio",
  subtitle: "Ensinando o relógio a contar cada pump uma vez só — e a perceber quando você para de pumpar",
  intro:
    "A parte 5 tratava de decidir **se** alguém está no foil. Esta trata do que acontece **enquanto** está: cada golpe de pump e cada momento sem ele. Os dois números eram mais fracos do que pareciam. O contador às vezes contava um golpe duas vezes e perdia o seguinte, e uma detecção real de planeio simplesmente não existia. O juiz volta a ser o celular na prancha, e a resposta volta a ser principalmente física, com um modelo propositalmente pequeno onde a física sozinha não basta.",

  problem: {
    h: "O que estava errado",
    p: "O contador antigo procura o ritmo no movimento vertical do pulso e escolhe um pico por golpe. Medido contra a prancha, encontra 88 % dos pumps reais — nada mal — mas:",
    li: [
      "**Contava em dobro.** Às vezes dois picos a poucos centésimos de segundo um do outro eram contados. Em duas voltas marcadas à mão no vídeo, 5 e 7 desses duplos escondiam exatamente o mesmo número de golpes perdidos — o total batia por acaso.",
      "**Continuava contando no planeio.** Os braços continuam se mexendo quando as pernas param. 22 % de tudo o que o relógio contava não eram pumps reais; boa parte estava nos planeios.",
      "**Não havia detecção de planeio.** O que o app chamava de *planeio mais longo* era só o maior intervalo entre dois pumps contados. Como o contador quase nunca parava, esse intervalo quase nunca era um planeio de verdade — nas voltas conferidas com a prancha, os planeios antigos encontravam 0 de 64.",
    ],
  },

  truth: {
    h: "O juiz: um celular na prancha",
    p: "Como na [parte 4](/nerd-analysen-4), um celular preso à prancha mede a própria prancha: quanto ela sobe e desce a cada golpe, e se esse golpe realmente coloca energia na volta. Gravado junto com um relógio no pulso e alinhado a uma fração de segundo, ele diz para cada golpe se aconteceu, e para cada intervalo se foi planeio. Servem 14 sessões assim, de 5 riders: cerca de 3.700 pumps confirmados pela prancha e 64 planeios.",
    cap: "Uma das minhas voltas. Em cima: a prancha subindo e descendo — cada linha ciano é um golpe com energia, em amarelo o planeio antes do touchdown (vermelho). Embaixo: o pulso, com os pumps que o contador antigo encontrou (pontos vermelhos). Repare nos pontos dentro do planeio.",
    p2: "Aqui um pump é o que a prancha diz: um golpe que empurra energia para a volta. Pequenos balanços para se equilibrar não contam, e nem as últimas oscilações de uma prancha que já está afundando.",
  },

  physics: {
    h: "Física em vez de decorar",
    p: "Com cinco riders, um modelo grande aprenderia principalmente essas cinco pessoas. Por isso a contagem de pumps é feita sem nenhum modelo treinado, usando o que o pumping é fisicamente — um ritmo:",
    li: [
      "**Filtro de ritmo.** Os picos candidatos são comparados ao ritmo local dos últimos golpes. Dois picos muito mais próximos que um golpe são um golpe só — o mais fraco sai. Um buraco de dois ou três golpes com um pico mais fraco no lugar certo no meio recupera esse pico: um pump que estava lá, só mais fraco.",
      "**Seguidor de ritmo.** Uma segunda passada segue o ritmo golpe a golpe e prevê onde deveria cair o próximo. Ele pode se adaptar rápido — pumping não é metrônomo: a gente acelera para sair e diminui de propósito. Onde ele encontra um golpe que o filtro perdeu, o golpe é acrescentado.",
      "**Planeio = o ritmo se quebra e a energia cai.** Um pico forte dentro de um planeio continua sendo pump. Só picos fracos — menos de 40 % do golpe típico do rider naquela volta — saem quando o modelo de planeio tem certeza.",
    ],
    cap: "Pumping não é metrônomo: nesta volta o ritmo varia entre cerca de 77 e 90 golpes por minuto. O seguidor usa só os últimos golpes, então acompanha.",
    p2: "A única parte treinada decide para cada quarto de segundo: **planeio ou pump**. Ela é pequena de propósito:",
    li2: [
      "árvores de decisão com **7 folhas**, nada mais,",
      "entradas relativas à própria volta do rider (força relativa ao próprio pumping, ritmo relativo ao próprio ritmo), sem modelo de relógio, sem identidade do rider,",
      "nenhuma informação sobre em que ponto da volta está um instante — senão o modelo aprenderia só que planeios costumam vir no final,",
      "a saída é suavizada com janelas de 5 segundos sobrepostas e com um modelo de estados simples que sabe que um planeio dura pelo menos uns 1,5 segundo.",
    ],
  },

  honest: {
    h: "Medido com honestidade",
    p: "Cada número aqui é medido em riders que o modelo nunca viu: treinado com quatro, testado no quinto, cinco vezes. Contra a prancha, comparado com o contador antigo:",
    cap1: "Média de 5 riders, cada um medido sem ter participado do treino. À direita: pumps encontrados por rider — todo rider recupera mais dos seus pumps reais.",
    p2: "Em números:",
    li: [
      "**Pumps encontrados** (em ±0,25 s): 88,5 % → 93,1 % (±0,4 s: 98 %).",
      "**Pumps contados que são reais:** 78 % → 87 %.",
      "**Erro na contagem de pumps por volta:** 17 % → 11 %.",
      "**Em torno das mudanças de ritmo** (acelerar, diminuir): 89 % → 95 % dos golpes encontrados.",
      "**Planeios encontrados:** 0 % → 51 %, e 54 % dos planeios apontados são reais.",
      "**As voltas marcadas à mão:** não falta nenhum pump marcado — antes faltavam 4 e 6 por trás dos duplos.",
    ],
    cap2: "Esquerda e meio vêm da primeira rodada de modelos, em que um único modelo decidia tudo (o tamanho escolhido ali, 7 folhas, é o que o modelo de planeio usa agora). Esquerda: um modelo maior aprende cada vez melhor os riders do treino, mas não um rider que nunca viu. Meio: cada rider a mais ainda ajuda. Direita: uma pequena rede neural sobre os sinais brutos foi pior que o pequeno modelo de árvores.",
    p3: "Também testamos uma pequena rede neural sobre os sinais brutos em vez de entradas escolhidas à mão. Com tão poucos dados, ela perdeu feio. Isso não é um veredicto sobre redes neurais — é um veredicto sobre 5 riders.",
  },

  before: {
    h: "Antes e depois",
    p: "Duas das minhas voltas, como o app mostrava até agora e como a nova detecção as vê. Pontos ciano são pumps, trechos amarelos são planeios.",
    cap: "Volta 2: 58 → 50 pumps; os duplos somem e aparece o planeio do final (a prancha diz: 5,8 s). Volta 4: três planeios curtos em vez de nenhum; na prancha esta volta teve um planeio de 3,6 s.",
    p2: "Em todas as gravações, o planeio agora é cerca de 6 % do tempo no foil — perto dos 7 % que a prancha mede. Os limites das voltas não mudam; só muda o que acontece dentro de uma volta. Alguns planeios muito longos em que a velocidade quase não cai não contam como planeio, mas são marcados para uma olhada mais de perto: geralmente é uma onda, um puxão de algum lugar ou golpes que o relógio não conseguia ver.",
  },

  limits: {
    h: "Limites",
    li: [
      "**Cinco riders.** A curva de aprendizado ainda não se achatou. Cada rider com celular na prancha melhora a parte do planeio.",
      "**O planeio ainda é a parte difícil.** Metade dos planeios reais é encontrada, e um em cada dois planeios apontados é real. É um começo, não o fim.",
      "**Carves precisam de mais dados.** A prancha também vê as curvas. 42 carves nas gravações até agora são pouquíssimos para uma detecção própria — seriam necessários uns 110 a mais, de mais riders.",
      "**No ar desde 23 de outubro.** Todas as gravações foram recalculadas; os números antigos continuam guardados em segundo plano, e os recordes seguem os novos.",
    ],
  },

  help: {
    h: "Como você pode ajudar",
    p: "O mais útil é uma sessão com **os dois**: o relógio no pulso e um celular preso à prancha, gravando ao mesmo tempo.",
    li: [
      "Prenda bem o celular na prancha (uma capa à prova d’água e fita adesiva bastam).",
      "Inicie a gravação nos dois antes de entrar na água e pare os dois no final.",
      "Dez minutos de volta normal já bastam — com planeios e uma ou outra curva.",
    ],
    p2: "As duas gravações aparecem normalmente nas suas sessões; nós mesmos as alinhamos no tempo. Se quiser, conte para a gente se usava o relógio na mão da frente ou de trás.",
  },
};

const ptPT: N6 = {
  back: "← Parte 5: O modelo de deteção",
  h1: "Parte 6: Pumps e planeio",
  subtitle: "Ensinar o relógio a contar cada pump uma única vez — e a perceber quando paras de bombear",
  intro:
    "A parte 5 tratava de decidir **se** alguém está no foil. Esta trata do que acontece **enquanto** está: cada golpe de pump e cada momento sem ele. Ambos os números eram mais fracos do que pareciam. O contador por vezes contava um golpe duas vezes e falhava o seguinte, e uma verdadeira deteção do planeio simplesmente não existia. O árbitro volta a ser o telemóvel na prancha, e a resposta volta a ser sobretudo física, com um modelo deliberadamente pequeno onde a física sozinha não chega.",

  problem: {
    h: "O que estava mal",
    p: "O contador antigo procura o ritmo no movimento vertical do pulso e escolhe um pico por golpe. Medido contra a prancha, encontra 88 % dos pumps reais — nada mau — mas:",
    li: [
      "**Contava a dobrar.** Por vezes dois picos a poucos centésimos de segundo um do outro eram ambos contados. Em duas voltas marcadas à mão no vídeo, 5 e 7 desses duplicados escondiam exatamente o mesmo número de golpes falhados — o total batia certo por acaso.",
      "**Continuava a contar durante o planeio.** Os braços continuam a mexer-se quando as pernas param. 22 % de tudo o que o relógio contava não eram pumps reais; boa parte estava nos planeios.",
      "**Não havia deteção do planeio.** Aquilo a que a app chamava *planeio mais longo* era apenas o maior intervalo entre dois pumps contados. Como o contador raramente parava, esse intervalo quase nunca era um verdadeiro planeio — nas voltas verificadas com a prancha, os planeios antigos encontravam 0 de 64.",
    ],
  },

  truth: {
    h: "O árbitro: um telemóvel na prancha",
    p: "Como na [parte 4](/nerd-analysen-4), um telemóvel preso à prancha mede a própria prancha: quanto sobe e desce a cada golpe, e se esse golpe põe realmente energia na volta. Gravado ao mesmo tempo que um relógio no pulso e alinhado a uma fração de segundo, diz-nos para cada golpe se aconteceu, e para cada intervalo se foi planeio. Servem 14 sessões destas, de 5 riders: cerca de 3700 pumps confirmados pela prancha e 64 planeios.",
    cap: "Uma das minhas voltas. Em cima: a prancha a subir e a descer — cada linha ciano é um golpe com energia, a amarelo o planeio antes do touchdown (vermelho). Em baixo: o pulso, com os pumps que o contador antigo encontrou (pontos vermelhos). Repara nos pontos dentro do planeio.",
    p2: "Aqui um pump é o que a prancha diz: um golpe que empurra energia para a volta. Pequenos movimentos de equilíbrio não contam, nem as últimas oscilações de uma prancha que já está a afundar.",
  },

  physics: {
    h: "Física em vez de decorar",
    p: "Com cinco riders, um modelo grande aprenderia sobretudo essas cinco pessoas. Por isso a contagem de pumps é feita sem qualquer modelo treinado, usando aquilo que o pumping é fisicamente — um ritmo:",
    li: [
      "**Filtro de ritmo.** Os picos candidatos são comparados com o ritmo local dos últimos golpes. Dois picos muito mais próximos do que um golpe são um só golpe — o mais fraco sai. Um buraco de dois ou três golpes com um pico mais fraco no sítio certo ao meio recupera esse pico: um pump que lá estava, só mais fraco.",
      "**Seguidor de ritmo.** Uma segunda passagem segue o ritmo golpe a golpe e prevê onde deveria cair o seguinte. Pode adaptar-se depressa — o pumping não é um metrónomo: acelera-se para arrancar e abranda-se de propósito. Onde encontra um golpe que o filtro falhou, acrescenta-o.",
      "**Planeio = o ritmo quebra e a energia cai.** Um pico forte dentro de um planeio continua a ser pump. Só picos fracos — menos de 40 % do golpe típico do rider nessa volta — saem quando o modelo de planeio tem a certeza.",
    ],
    cap: "O pumping não é um metrónomo: nesta volta o ritmo varia entre cerca de 77 e 90 golpes por minuto. O seguidor só usa os últimos golpes, por isso acompanha.",
    p2: "A única parte treinada decide para cada quarto de segundo: **planeio ou pump**. É mantida pequena de propósito:",
    li2: [
      "árvores de decisão com **7 folhas**, nada mais,",
      "entradas relativas à própria volta do rider (força relativa ao próprio pumping, ritmo relativo ao próprio ritmo), sem modelo de relógio, sem identidade do rider,",
      "nenhuma informação sobre em que ponto da volta está um instante — caso contrário o modelo aprenderia apenas que o planeio costuma vir no fim,",
      "a saída é suavizada com janelas de 5 segundos sobrepostas e por um modelo de estados simples que sabe que um planeio dura pelo menos cerca de 1,5 segundos.",
    ],
  },

  honest: {
    h: "Medido com honestidade",
    p: "Cada número aqui é medido em riders que o modelo nunca viu: treinado com quatro, testado no quinto, cinco vezes. Contra a prancha, em comparação com o contador antigo:",
    cap1: "Média de 5 riders, cada um medido sem ter estado no treino. À direita: pumps encontrados por rider — cada rider recupera mais dos seus pumps reais.",
    p2: "Em números:",
    li: [
      "**Pumps encontrados** (a ±0,25 s): 88,5 % → 93,1 % (a ±0,4 s: 98 %).",
      "**Pumps contados que são reais:** 78 % → 87 %.",
      "**Erro na contagem de pumps por volta:** 17 % → 11 %.",
      "**À volta das mudanças de ritmo** (acelerar, abrandar): 89 % → 95 % dos golpes encontrados.",
      "**Planeios encontrados:** 0 % → 51 %, e 54 % dos planeios assinalados são reais.",
      "**As voltas marcadas à mão:** não falta um único pump marcado — antes faltavam 4 e 6 escondidos atrás dos duplicados.",
    ],
    cap2: "A esquerda e o meio vêm da primeira ronda de modelos, em que um único modelo decidia tudo (o tamanho aí escolhido, 7 folhas, é o que o modelo de planeio usa agora). Esquerda: um modelo maior aprende cada vez melhor os riders do treino, mas não um rider que nunca viu. Meio: cada rider a mais continua a ajudar. Direita: uma pequena rede neuronal sobre os sinais em bruto saiu-se pior do que o pequeno modelo de árvores.",
    p3: "Também experimentámos uma pequena rede neuronal sobre os sinais em bruto em vez de entradas escolhidas à mão. Com tão poucos dados, perdeu claramente. Não é um veredicto sobre redes neuronais — é um veredicto sobre 5 riders.",
  },

  before: {
    h: "Antes e depois",
    p: "Duas das minhas voltas, tal como a app as mostrava até agora e tal como a nova deteção as vê. Pontos ciano são pumps, troços amarelos são planeios.",
    cap: "Volta 2: 58 → 50 pumps; os duplicados desaparecem e surge o planeio do fim (a prancha diz: 5,8 s). Volta 4: três planeios curtos em vez de nenhum; na prancha esta volta teve um planeio de 3,6 s.",
    p2: "Em todas as gravações, o planeio representa agora cerca de 6 % do tempo no foil — perto dos 7 % que a prancha mede. Os limites das voltas não mudam; só muda o que acontece dentro de uma volta. Alguns planeios muito longos em que a velocidade quase não desce não contam como planeio, mas são assinalados para uma análise mais atenta: normalmente é uma onda, um puxão de algum lado ou golpes que o relógio não conseguia ver.",
  },

  limits: {
    h: "Limites",
    li: [
      "**Cinco riders.** A curva de aprendizagem ainda não estabilizou. Cada rider com telemóvel na prancha melhora a parte do planeio.",
      "**O planeio continua a ser a parte difícil.** Metade dos planeios reais é encontrada, e um em cada dois planeios assinalados é real. É um começo, não o fim.",
      "**Os carves precisam de mais dados.** A prancha também vê as curvas. 42 carves nas gravações até agora são demasiado poucos para uma deteção própria — seriam precisos cerca de 110 a mais, de mais riders.",
      "**Em funcionamento desde 23 de outubro.** Todas as gravações foram recalculadas; os números antigos ficam guardados em segundo plano, e os recordes seguem os novos.",
    ],
  },

  help: {
    h: "Como podes ajudar",
    p: "O mais útil é uma sessão com **os dois**: o relógio no pulso e um telemóvel preso à prancha, a gravar ao mesmo tempo.",
    li: [
      "Prende bem o telemóvel à prancha (uma bolsa estanque e fita adesiva chegam).",
      "Inicia a gravação nos dois antes de entrares na água e para os dois no fim.",
      "Dez minutos de volta normal chegam bem — com planeios e uma ou outra curva.",
    ],
    p2: "As duas gravações aparecem como de costume nas tuas sessões; nós alinhamo-las no tempo. Se quiseres, diz-nos se usavas o relógio na mão da frente ou de trás.",
  },
};

const nl: N6 = {
  back: "← Deel 5: Het detectiemodel",
  h1: "Deel 6: Pumps en glijden",
  subtitle: "Het horloge leren elke pump één keer te tellen — en te merken wanneer je stopt met pumpen",
  intro:
    "Deel 5 ging over de vraag **of** iemand op de foil staat. Dit deel gaat over wat er **intussen** gebeurt: elke pumpslag en elk moment zonder. Beide getallen waren zwakker dan ze leken. De teller telde soms één slag dubbel en miste dan de volgende, en een echte glijdetectie bestond helemaal niet. Scheidsrechter is weer de telefoon op het board, en het antwoord is weer vooral natuurkunde, met een bewust klein model waar natuurkunde alleen niet genoeg is.",

  problem: {
    h: "Wat er mis was",
    p: "De oude teller zoekt het ritme in de verticale beweging van de pols en kiest één piek per slag. Gemeten tegen het board vindt hij 88 % van de echte pumps — niet slecht — maar:",
    li: [
      "**Hij telde dubbel.** Soms werden twee pieken op een paar honderdsten van een seconde allebei geteld. In twee runs die met de hand op video zijn getikt, verstopten 5 en 7 van zulke dubbelen precies evenveel gemiste slagen — het totaal klopte toevallig.",
      "**Hij telde door tijdens het glijden.** De armen bewegen nog als de benen stoppen. 22 % van alles wat het horloge telde waren geen echte pumps; een groot deel daarvan lag in het glijden.",
      "**Er was geen glijdetectie.** Wat de app de *langste glijfase* noemde, was gewoon het langste gat tussen twee getelde pumps. Omdat de teller zelden stopte, was dat gat bijna nooit echt glijden — in de tegen het board gecontroleerde runs vonden de oude glijfases 0 van de 64 echte.",
    ],
  },

  truth: {
    h: "De scheidsrechter: een telefoon op het board",
    p: "Net als in [deel 4](/nerd-analysen-4) meet een telefoon die op het board vastzit het board zelf: hoe ver het bij elke slag stijgt en daalt, en of die slag echt energie in de rit stopt. Tegelijk opgenomen met een horloge om de pols en tot op een fractie van een seconde uitgelijnd, vertelt hij voor elke slag of hij er was, en voor elk gat of het glijden was. 14 zulke sessies van 5 riders zijn bruikbaar: zo’n 3.700 door het board bevestigde pumps en 64 glijfases.",
    cap: "Een van mijn runs. Boven: het board dat stijgt en daalt — elke cyaan lijn is een slag met energie, geel is het glijden vóór de touchdown (rood). Onder: de pols, met de pumps die de oude teller vond (rode punten). Let op de punten in het glijden.",
    p2: "Een pump is hier wat het board zegt: een slag die energie in de rit duwt. Kleine bewegingen om in balans te blijven tellen niet mee, en de laatste slingers van een board dat al wegzakt ook niet.",
  },

  physics: {
    h: "Natuurkunde in plaats van uit het hoofd leren",
    p: "Met vijf riders zou een groot model vooral die vijf mensen leren. Daarom gebeurt het tellen van pumps zonder enig getraind model, met wat pumpen natuurkundig is — een ritme:",
    li: [
      "**Ritmefilter.** De kandidaat-pieken worden getoetst aan het lokale ritme van de laatste slagen. Twee pieken die veel dichter bij elkaar liggen dan één slag zijn één slag — de zwakkere verdwijnt. Een gat van twee of drie slagen met een passende, zwakkere piek in het midden krijgt die piek terug: een pump die er was, alleen zachter.",
      "**Ritmevolger.** Een tweede ronde volgt het ritme slag voor slag en voorspelt waar de volgende zou moeten vallen. Hij mag zich snel aanpassen — pumpen is geen metronoom: je versnelt om op gang te komen en neemt bewust gas terug. Waar hij een slag vindt die het filter miste, wordt die toegevoegd.",
      "**Glijden = het ritme breekt en de energie zakt.** Een sterke piek in een glijfase blijft een pump. Alleen zwakke pieken — minder dan 40 % van de eigen typische slag van de rider in die run — vallen weg als het glijmodel zeker is.",
    ],
    cap: "Pumpen is geen metronoom: in deze run schommelt het ritme tussen ongeveer 77 en 90 slagen per minuut. De volger gebruikt alleen de laatste slagen en gaat dus mee.",
    p2: "Het enige getrainde deel beslist voor elke kwart seconde: **glijden of pumpen**. Het is bewust klein gehouden:",
    li2: [
      "beslisbomen met **7 bladeren**, meer niet,",
      "invoer relatief aan de eigen run van de rider (kracht ten opzichte van het eigen pumpen, ritme ten opzichte van het eigen ritme), geen horlogemodel, geen identiteit van de rider,",
      "geen informatie over waar in de run een moment ligt — anders leert het model gewoon dat glijden meestal aan het eind komt,",
      "de uitvoer wordt gladgestreken met overlappende vensters van 5 seconden en met een eenvoudig toestandsmodel dat weet dat glijden minstens zo’n 1,5 seconde duurt.",
    ],
  },

  honest: {
    h: "Eerlijk gemeten",
    p: "Elk getal hier is gemeten op riders die het model nooit heeft gezien: getraind op vier, getest op de vijfde, vijf keer. Tegen het board, vergeleken met de oude teller:",
    cap1: "Gemiddelde over 5 riders, elk gemeten zonder in de training te hebben gezeten. Rechts: gevonden pumps per rider — elke rider krijgt meer van zijn echte pumps terug.",
    p2: "In cijfers:",
    li: [
      "**Gevonden pumps** (binnen ±0,25 s): 88,5 % → 93,1 % (±0,4 s: 98 %).",
      "**Getelde pumps die echt zijn:** 78 % → 87 %.",
      "**Fout in het aantal pumps per run:** 17 % → 11 %.",
      "**Rond ritmewisselingen** (versnellen, gas terugnemen): 89 % → 95 % van de slagen gevonden.",
      "**Gevonden glijfases:** 0 % → 51 %, en 54 % van de gemelde glijfases is echt.",
      "**De met de hand getikte runs:** er ontbreekt geen enkele getikte pump — eerder ontbraken er 4 en 6 achter de dubbelen.",
    ],
    cap2: "Links en midden komen uit de eerste ronde modellen, waarin één model alles besliste (de daar gekozen grootte, 7 bladeren, gebruikt het glijmodel nu). Links: een groter model leert zijn trainingsriders steeds beter, maar geen rider die het nooit zag. Midden: elke extra rider helpt nog. Rechts: een klein neuraal netwerk op de ruwe signalen deed het slechter dan het kleine boommodel.",
    p3: "We hebben ook een klein neuraal netwerk op de ruwe signalen geprobeerd in plaats van met de hand gekozen invoer. Met zo weinig data verloor het duidelijk. Dat is geen oordeel over neurale netwerken — het is een oordeel over 5 riders.",
  },

  before: {
    h: "Voor en na",
    p: "Twee van mijn runs, zoals de app ze tot nu toe liet zien en zoals de nieuwe detectie ze ziet. Cyaan punten zijn pumps, gele stukken zijn glijfases.",
    cap: "Run 2: 58 → 50 pumps; de dubbelen zijn weg en het glijden aan het eind verschijnt (het board zegt: 5,8 s). Run 4: drie korte glijfases in plaats van geen; op het board had deze run één glijfase van 3,6 s.",
    p2: "Over alle opnames is glijden nu ongeveer 6 % van de foiltijd — dicht bij de 7 % die het board meet. De grenzen van de runs blijven onaangeroerd; alleen wat er binnen een run gebeurt verandert. Een paar heel lange glijfases waarin de snelheid nauwelijks zakt, tellen niet als glijden maar worden gemarkeerd om beter te bekijken: meestal is dat een golf, een trekkracht van ergens of slagen die het horloge niet kon zien.",
  },

  limits: {
    h: "Grenzen",
    li: [
      "**Vijf riders.** De leercurve is nog niet vlak. Elke rider met een telefoon op het board maakt het glijdeel beter.",
      "**Glijden is nog het moeilijke deel.** De helft van de echte glijfases wordt gevonden, en elke tweede gemelde is echt. Een begin, niet het eind.",
      "**Carves hebben meer data nodig.** Het board ziet ook bochten. 42 carves in de opnames tot nu toe zijn veel te weinig voor een eigen detectie — er zouden er zo’n 110 meer nodig zijn, van meer riders.",
      "**Live sinds 23 oktober.** Alle opnames zijn opnieuw berekend; de oude getallen blijven op de achtergrond bewaard, en de records volgen de nieuwe.",
    ],
  },

  help: {
    h: "Zo kun je helpen",
    p: "Het nuttigst is een sessie met **allebei**: het horloge om je pols en een telefoon vast op je board, die tegelijk opnemen.",
    li: [
      "Maak de telefoon stevig vast aan het board (een waterdicht hoesje en tape zijn genoeg).",
      "Start de opname op allebei voordat je het water op gaat, en stop ze allebei aan het eind.",
      "Tien minuten gewoon rijden is ruim genoeg — met glijden en af en toe een carve.",
    ],
    p2: "Beide opnames verschijnen zoals gewoonlijk in je sessies; wij leggen ze zelf in de tijd op elkaar. Als je wilt, laat ons weten of je het horloge om je voorste of achterste hand droeg.",
  },
};

const nb: N6 = {
  back: "← Del 5: Gjenkjenningsmodellen",
  h1: "Del 6: Pump og gli",
  subtitle: "Slik lærer klokka å telle hvert pump én gang — og merke når du slutter å pumpe",
  intro:
    "Del 5 handlet om å avgjøre **om** noen er på foilen. Denne delen handler om hva som skjer **mens** de er det: hvert pumpetak og hvert øyeblikk uten. Begge tallene var svakere enn de så ut. Telleren telte av og til ett tak to ganger og bommet på det neste, og en ekte glidegjenkjenning fantes ikke i det hele tatt. Dommeren er igjen telefonen på brettet, og svaret er igjen for det meste fysikk, med en bevisst liten modell der fysikken alene ikke strekker til.",

  problem: {
    h: "Hva som var galt",
    p: "Den gamle telleren leter etter rytmen i håndleddets loddrette bevegelse og velger én topp per tak. Målt mot brettet finner den 88 % av de ekte pumpene — ikke dårlig — men:",
    li: [
      "**Den telte dobbelt.** Noen ganger ble to topper med noen hundredels sekunds mellomrom begge telt. I to turer som ble merket for hånd fra video, skjulte 5 og 7 slike dobbelttellinger nøyaktig like mange tapte tak — summen stemte tilfeldigvis.",
      "**Den telte videre mens du gled.** Armene beveger seg fortsatt når beina stopper. 22 % av alt klokka telte var ikke ekte pump; en stor del av dem lå i glidet.",
      "**Det fantes ingen glidegjenkjenning.** Det appen kalte *lengste gli* var rett og slett det lengste hullet mellom to telte pump. Fordi telleren sjelden stoppet, var det hullet nesten aldri ekte gli — i turene som ble sjekket mot brettet, fant de gamle glidene 0 av 64 ekte.",
    ],
  },

  truth: {
    h: "Dommeren: en telefon på brettet",
    p: "Som i [del 4](/nerd-analysen-4) måler en telefon teipet til brettet selve brettet: hvor mye det hever og senker seg for hvert tak, og om taket faktisk tilfører energi. Tatt opp samtidig med en klokke på håndleddet og justert til en brøkdel av et sekund, forteller den for hvert tak om det skjedde, og for hvert hull om det var gli. 14 slike økter fra 5 ryttere kan brukes: rundt 3 700 pump bekreftet av brettet og 64 glid.",
    cap: "En av turene mine. Øverst: brettet som hever og senker seg — hver cyan strek er et tak med energi, gult er glidet før touchdown (rødt). Nederst: håndleddet, med pumpene den gamle telleren fant (røde prikker). Legg merke til prikkene i glidet.",
    p2: "Et pump er her det brettet sier: et tak som dytter energi inn i turen. Små vrikk for å holde balansen teller ikke, og heller ikke de siste svingningene til et brett som allerede synker.",
  },

  physics: {
    h: "Fysikk i stedet for pugging",
    p: "Med fem ryttere ville en stor modell for det meste lære seg de fem personene. Derfor gjøres pumpetellingen uten noen trent modell, ut fra hva pumping fysisk er — en rytme:",
    li: [
      "**Rytmefilter.** Kandidattoppene sjekkes mot den lokale rytmen til de siste takene. To topper som ligger mye tettere enn ett tak, er ett tak — den svakeste forsvinner. Et hull på to eller tre tak med en passende, svakere topp i midten får toppen tilbake: et pump som var der, bare roligere.",
      "**Rytmefølger.** En andre gjennomgang følger rytmen tak for tak og spår hvor det neste burde komme. Den får tilpasse seg raskt — pumping er ingen metronom: man gir gass for å komme i gang og roer bevisst ned. Der den finner et tak filteret bommet på, legges det til.",
      "**Gli = rytmen brytes og energien faller.** En kraftig topp i et gli forblir et pump. Bare svake topper — under 40 % av rytterens eget typiske tak i den turen — fjernes når glidemodellen er sikker.",
    ],
    cap: "Pumping er ingen metronom: i denne turen varierer rytmen mellom omtrent 77 og 90 tak i minuttet. Følgeren bruker bare de siste takene, og henger derfor med.",
    p2: "Den eneste trente delen avgjør for hvert kvarte sekund: **gli eller pump**. Den er bevisst holdt liten:",
    li2: [
      "beslutningstrær med **7 blader**, ikke mer,",
      "inndata i forhold til rytterens egen tur (styrke i forhold til egen pumping, rytme i forhold til egen rytme), ingen klokkemodell, ingen rytteridentitet,",
      "ingen informasjon om hvor i turen et øyeblikk ligger — ellers ville modellen bare lære at gli gjerne kommer på slutten,",
      "utdataene glattes med overlappende 5-sekunders vinduer og en enkel tilstandsmodell som vet at et gli varer minst rundt 1,5 sekunder.",
    ],
  },

  honest: {
    h: "Ærlig målt",
    p: "Hvert tall her er målt på ryttere modellen aldri har sett: trent på fire, testet på den femte, fem ganger. Mot brettet, sammenlignet med den gamle telleren:",
    cap1: "Snitt over 5 ryttere, hver målt uten å ha vært med i treningen. Til høyre: funne pump per rytter — hver rytter får flere av sine ekte pump.",
    p2: "I tall:",
    li: [
      "**Funne pump** (innenfor ±0,25 s): 88,5 % → 93,1 % (±0,4 s: 98 %).",
      "**Telte pump som er ekte:** 78 % → 87 %.",
      "**Feil i antall pump per tur:** 17 % → 11 %.",
      "**Rundt rytmeskifter** (gi gass, roe ned): 89 % → 95 % av takene funnet.",
      "**Funne glid:** 0 % → 51 %, og 54 % av glidene den melder er ekte.",
      "**Turene merket for hånd:** ikke ett eneste merket pump mangler — før manglet 4 og 6 bak dobbelttellingene.",
    ],
    cap2: "Venstre og midten kommer fra den første modellrunden, der én modell avgjorde alt (størrelsen valgt der, 7 blader, er den glidemodellen bruker nå). Venstre: en større modell lærer treningsrytterne sine stadig bedre, men ikke en rytter den aldri har sett. Midten: hver ekstra rytter hjelper fortsatt. Høyre: et lite nevralt nett på råsignalene gjorde det dårligere enn den lille tremodellen.",
    p3: "Vi prøvde også et lite nevralt nett på råsignalene i stedet for håndplukkede inndata. Med så lite data tapte det klart. Det er ingen dom over nevrale nett — det er en dom over 5 ryttere.",
  },

  before: {
    h: "Før og etter",
    p: "To av turene mine, slik appen viste dem til nå og slik den nye gjenkjenningen ser dem. Cyan prikker er pump, gule strekk er gli.",
    cap: "Tur 2: 58 → 50 pump; dobbelttellingene er borte, og glidet på slutten dukker opp (brettet sier: 5,8 s). Tur 4: tre korte glid i stedet for ingen; på brettet hadde denne turen ett gli på 3,6 s.",
    p2: "Over alle opptak utgjør gli nå omtrent 6 % av foiltiden — nær de 7 % brettet måler. Grensene for turene røres ikke; bare det som skjer inne i en tur endres. Noen svært lange glid der farten nesten ikke faller, telles ikke som gli, men merkes for en nærmere titt: som regel er det en bølge, et drag fra et sted eller tak klokka ikke kunne se.",
  },

  limits: {
    h: "Begrensninger",
    li: [
      "**Fem ryttere.** Læringskurven har ikke flatet ut ennå. Hver rytter med telefon på brettet gjør glidedelen bedre.",
      "**Gli er fortsatt den vanskelige delen.** Halvparten av de ekte glidene blir funnet, og hvert andre meldte gli er ekte. En start, ikke slutten.",
      "**Carves trenger mer data.** Brettet ser også svinger. 42 carves i opptakene så langt er altfor få til en egen gjenkjenning — det trengs rundt 110 til, fra flere ryttere.",
      "**Live siden 23. oktober.** Alle opptak er regnet på nytt; de gamle tallene tas vare på i bakgrunnen, og rekordene følger de nye.",
    ],
  },

  help: {
    h: "Slik kan du hjelpe",
    p: "Det mest nyttige er en økt med **begge**: klokka på håndleddet og en telefon festet til brettet, som tar opp samtidig.",
    li: [
      "Fest telefonen godt til brettet (et vanntett etui og teip holder).",
      "Start opptaket på begge før du går på vannet, og stopp begge til slutt.",
      "Ti minutter vanlig kjøring er mer enn nok — gjerne med gli og en og annen carve.",
    ],
    p2: "Begge opptakene dukker opp i øktene dine som vanlig; vi legger dem oppå hverandre i tid selv. Hvis du vil, fortell oss om du hadde klokka på fremre eller bakre hånd.",
  },
};

const fi: N6 = {
  back: "← Osa 5: Tunnistusmalli",
  h1: "Osa 6: Pumppaukset ja liuku",
  subtitle: "Kello oppii laskemaan jokaisen pumppauksen kerran — ja huomaamaan, kun lopetat pumppaamisen",
  intro:
    "Osa 5 käsitteli sitä, **onko** joku foililla. Tämä osa käsittelee sitä, mitä tapahtuu **sillä aikaa**: jokaista pumppausvetoa ja jokaista hetkeä ilman sitä. Molemmat luvut olivat heikompia kuin miltä ne näyttivät. Laskuri laski joskus yhden vedon kahdesti ja ohitti seuraavan, eikä oikeaa liu’un tunnistusta ollut lainkaan. Erotuomarina on taas laudalla oleva puhelin, ja vastaus on taas enimmäkseen fysiikkaa — tarkoituksella pienellä mallilla siellä, missä fysiikka ei yksin riitä.",

  problem: {
    h: "Mikä oli vialla",
    p: "Vanha laskuri etsii rytmiä ranteen pystysuuntaisesta liikkeestä ja valitsee yhden huipun vetoa kohden. Lautaa vasten mitattuna se löytää 88 % oikeista pumppauksista — ei huono — mutta:",
    li: [
      "**Se laski tuplana.** Joskus kaksi muutaman sadasosasekunnin päässä toisistaan olevaa huippua laskettiin molemmat. Kahdessa videolta käsin merkityssä ajossa 5 ja 7 tällaista tuplaa kätki täsmälleen yhtä monta ohitettua vetoa — summa osui kohdalleen sattumalta.",
      "**Se jatkoi laskemista liu’un aikana.** Kädet liikkuvat yhä, kun jalat pysähtyvät. 22 % kaikesta, minkä kello laski, ei ollut oikeita pumppauksia; suuri osa niistä osui liukuun.",
      "**Liu’un tunnistusta ei ollut.** Se, mitä sovellus kutsui *pisimmäksi liu’uksi*, oli vain pisin väli kahden lasketun pumppauksen välillä. Koska laskuri pysähtyi harvoin, väli oli lähes koskaan oikea liuku — lautaa vasten tarkistetuissa ajoissa vanhat liu’ut löysivät 0 oikeasta 64:stä.",
    ],
  },

  truth: {
    h: "Erotuomari: puhelin laudalla",
    p: "Kuten [osassa 4](/nerd-analysen-4), laudalle teipattu puhelin mittaa itse lautaa: kuinka paljon se nousee ja laskee jokaisella vedolla ja tuoko veto todella energiaa ajoon. Kun se tallennetaan samaan aikaan ranteen kellon kanssa ja kohdistetaan sekunnin murto-osan tarkkuudella, se kertoo jokaisesta vedosta, tapahtuiko se, ja jokaisesta välistä, oliko se liukua. Tähän kelpaa 14 tällaista sessiota 5 ajajalta: noin 3 700 laudan vahvistamaa pumppausta ja 64 liukua.",
    cap: "Yksi ajoistani. Ylhäällä lauta nousemassa ja laskemassa — jokainen syaani viiva on energiaa tuova veto, keltainen on liuku ennen touchdownia (punainen). Alhaalla ranne ja vanhan laskurin löytämät pumppaukset (punaiset pisteet). Huomaa pisteet liu’un sisällä.",
    p2: "Pumppaus tarkoittaa tässä sitä, mitä lauta sanoo: vetoa, joka työntää energiaa ajoon. Pienet tasapainoliikkeet eivät lasketa, eivätkä myöskään jo uppoavan laudan viimeiset heilahdukset.",
  },

  physics: {
    h: "Fysiikkaa ulkoa opettelun sijaan",
    p: "Viidellä ajajalla iso malli oppisi lähinnä nuo viisi ihmistä. Siksi pumppausten laskenta tehdään ilman koulutettua mallia sen avulla, mitä pumppaus fysikaalisesti on — rytmi:",
    li: [
      "**Rytmisuodatin.** Ehdokashuippuja verrataan viimeisten vetojen paikalliseen rytmiin. Kaksi huippua, jotka ovat paljon lähempänä kuin yksi veto, ovat yksi veto — heikompi poistuu. Kahden tai kolmen vedon aukko, jonka keskellä on sopiva heikompi huippu, saa sen huipun takaisin: pumppaus, joka oli siellä, vain hiljaisempana.",
      "**Rytminseuraaja.** Toinen kierros seuraa rytmiä veto vedolta ja ennustaa, missä seuraavan pitäisi olla. Se saa mukautua nopeasti — pumppaus ei ole metronomi: vauhtia kiihdytetään lähtiessä ja hidastetaan tarkoituksella. Kun se löytää vedon, jonka suodatin ohitti, veto lisätään.",
      "**Liuku = rytmi katkeaa ja energia laskee.** Voimakas huippu liu’un sisällä pysyy pumppauksena. Vain heikot huiput — alle 40 % ajajan omasta tyypillisestä vedosta siinä ajossa — poistetaan, kun liukumalli on varma.",
    ],
    cap: "Pumppaus ei ole metronomi: tässä ajossa rytmi vaihtelee noin 77:n ja 90 vedon välillä minuutissa. Seuraaja käyttää vain viimeisiä vetoja ja pysyy siksi mukana.",
    p2: "Ainoa koulutettu osa päättää jokaiselle neljännessekunnille: **liuku vai pumppaus**. Se on pidetty tarkoituksella pienenä:",
    li2: [
      "päätöspuut, joissa on **7 lehteä**, ei enempää,",
      "syötteet suhteessa ajajan omaan ajoon (voima suhteessa omaan pumppaukseen, rytmi suhteessa omaan rytmiin), ei kellomallia, ei ajajan tunnistetta,",
      "ei tietoa siitä, missä kohtaa ajoa hetki on — muuten malli oppisi vain, että liuku tulee yleensä lopussa,",
      "tulos tasoitetaan päällekkäisillä 5 sekunnin ikkunoilla ja yksinkertaisella tilamallilla, joka tietää liu’un kestävän vähintään noin 1,5 sekuntia.",
    ],
  },

  honest: {
    h: "Rehellisesti mitattu",
    p: "Jokainen luku tässä on mitattu ajajilla, joita malli ei ole koskaan nähnyt: koulutus neljällä, testi viidennellä, viisi kertaa. Lautaa vasten, verrattuna vanhaan laskuriin:",
    cap1: "Keskiarvo 5 ajajasta, jokainen mitattu ilman, että hän oli mukana koulutuksessa. Oikealla: löydetyt pumppaukset ajajittain — jokainen ajaja saa enemmän oikeista pumppauksistaan.",
    p2: "Lukuina:",
    li: [
      "**Löydetyt pumppaukset** (±0,25 s): 88,5 % → 93,1 % (±0,4 s: 98 %).",
      "**Lasketut pumppaukset, jotka ovat oikeita:** 78 % → 87 %.",
      "**Pumppausmäärän virhe ajoa kohden:** 17 % → 11 %.",
      "**Rytminvaihdosten ympärillä** (kiihdytys, hidastus): 89 % → 95 % vedoista löydetty.",
      "**Löydetyt liu’ut:** 0 % → 51 %, ja 54 % ilmoitetuista liu’uista on oikeita.",
      "**Käsin merkityt ajot:** yksikään merkitty pumppaus ei puutu — ennen tuplien takana puuttui 4 ja 6.",
    ],
    cap2: "Vasen ja keskimmäinen ovat ensimmäiseltä mallikierrokselta, jolla yksi malli päätti kaikesta (siellä valittu koko, 7 lehteä, on se, jota liukumalli nyt käyttää). Vasemmalla: isompi malli oppii koulutusajajansa yhä paremmin, mutta ei ajajaa, jota se ei ole nähnyt. Keskellä: jokainen lisäajaja auttaa yhä. Oikealla: pieni neuroverkko raakasignaaleilla pärjäsi huonommin kuin pieni puumalli.",
    p3: "Kokeilimme myös pientä neuroverkkoa raakasignaaleilla käsin valittujen syötteiden sijaan. Näin vähällä datalla se hävisi selvästi. Se ei ole tuomio neuroverkoista — se on tuomio viidestä ajajasta.",
  },

  before: {
    h: "Ennen ja jälkeen",
    p: "Kaksi ajoistani sellaisina kuin sovellus ne tähän asti näytti ja sellaisina kuin uusi tunnistus ne näkee. Syaanit pisteet ovat pumppauksia, keltaiset pätkät liukuja.",
    cap: "Ajo 2: 58 → 50 pumppausta; tuplat ovat poissa ja lopun liuku ilmestyy (lauta sanoo: 5,8 s). Ajo 4: kolme lyhyttä liukua, kun ennen ei yhtään; laudalla tässä ajossa oli yksi 3,6 s liuku.",
    p2: "Kaikissa tallenteissa liuku on nyt noin 6 % foiliajasta — lähellä laudan mittaamaa 7 %:a. Ajojen rajoihin ei kosketa; vain se, mitä ajon sisällä tapahtuu, muuttuu. Muutamaa hyvin pitkää liukua, joissa vauhti tuskin laskee, ei lasketa liuuksi, vaan ne merkitään tarkempaa katsomista varten: yleensä kyse on aallosta, jostain tulevasta vedosta tai vedoista, joita kello ei nähnyt.",
  },

  limits: {
    h: "Rajat",
    li: [
      "**Viisi ajajaa.** Oppimiskäyrä ei ole vielä tasaantunut. Jokainen ajaja, jolla on puhelin laudalla, parantaa liukuosaa.",
      "**Liuku on yhä vaikea osa.** Puolet oikeista liu’uista löydetään, ja joka toinen ilmoitettu liuku on oikea. Alku, ei loppu.",
      "**Carvet tarvitsevat lisää dataa.** Lauta näkee myös käännökset. 42 carvea tähänastisissa tallenteissa on aivan liian vähän omaan tunnistukseen — tarvittaisiin noin 110 lisää, useammalta ajajalta.",
      "**Käytössä 23. lokakuuta alkaen.** Kaikki tallenteet on laskettu uudelleen; vanhat luvut säilyvät taustalla, ja ennätykset seuraavat uusia.",
    ],
  },

  help: {
    h: "Näin voit auttaa",
    p: "Hyödyllisin on sessio, jossa on **molemmat**: kello ranteessa ja puhelin kiinnitettynä lautaan, ja molemmat tallentavat samaan aikaan.",
    li: [
      "Kiinnitä puhelin tukevasti lautaan (vedenpitävä pussi ja teippi riittävät).",
      "Käynnistä tallennus molemmissa ennen kuin menet veteen, ja pysäytä molemmat lopuksi.",
      "Kymmenen minuuttia tavallista ajoa riittää hyvin — liukuineen ja satunnaisine carveineen.",
    ],
    p2: "Molemmat tallenteet näkyvät sessioissasi tavalliseen tapaan; kohdistamme ne aikaan itse. Jos haluat, kerro meille, pidätkö kelloa etu- vai takakädessä.",
  },
};

const cs: N6 = {
  back: "← Část 5: Model rozpoznávání",
  h1: "Část 6: Pumpy a klouzání",
  subtitle: "Jak hodinky učíme počítat každou pumpu jen jednou — a poznat, kdy přestaneš pumpovat",
  intro:
    "Část 5 řešila, **zda** je někdo na foilu. Tahle část řeší, co se děje **mezitím**: každý záběr pumpy a každou chvíli bez něj. Obě čísla byla slabší, než vypadala. Počítadlo občas započítalo jeden záběr dvakrát a další vynechalo, a skutečné rozpoznávání klouzání vůbec neexistovalo. Rozhodčím je opět telefon na prkně a odpovědí je opět hlavně fyzika — s úmyslně malým modelem tam, kde fyzika sama nestačí.",

  problem: {
    h: "Co bylo špatně",
    p: "Staré počítadlo hledá rytmus ve svislém pohybu zápěstí a na každý záběr vybere jeden vrchol. Měřeno proti prknu najde 88 % skutečných pump — není to zlé — ale:",
    li: [
      "**Počítalo dvakrát.** Někdy se započítaly oba vrcholy vzdálené jen pár setin sekundy. Ve dvou jízdách ručně označených z videa skrývalo 5 a 7 takových zdvojení přesně stejný počet vynechaných záběrů — součet seděl náhodou.",
      "**Počítalo i během klouzání.** Ruce se hýbou dál, když nohy přestanou. 22 % všeho, co hodinky napočítaly, nebyly skutečné pumpy; velká část z nich ležela v klouzání.",
      "**Rozpoznávání klouzání neexistovalo.** To, čemu aplikace říkala *nejdelší klouzání*, byla jen nejdelší mezera mezi dvěma započítanými pumpami. Protože počítadlo se zastavilo jen zřídka, ta mezera téměř nikdy nebyla skutečné klouzání — v jízdách ověřených proti prknu našla stará klouzání 0 ze 64 skutečných.",
    ],
  },

  truth: {
    h: "Rozhodčí: telefon na prkně",
    p: "Stejně jako v [části 4](/nerd-analysen-4) měří telefon přilepený k prknu samotné prkno: o kolik se při každém záběru zvedne a klesne a zda ten záběr skutečně dodá jízdě energii. Nahraný současně s hodinkami na zápěstí a srovnaný na zlomek sekundy nám u každého záběru řekne, zda proběhl, a u každé mezery, zda šlo o klouzání. Použít lze 14 takových sessions od 5 jezdců: zhruba 3 700 pump potvrzených prknem a 64 klouzání.",
    cap: "Jedna z mých jízd. Nahoře prkno, jak se zvedá a klesá — každá azurová čára je záběr s energií, žlutě klouzání před dosednutím (červeně). Dole zápěstí s pumpami, které našlo staré počítadlo (červené tečky). Všimni si teček uvnitř klouzání.",
    p2: "Pumpa tu znamená to, co říká prkno: záběr, který dodá jízdě energii. Drobné pohyby při vyrovnávání se nepočítají, stejně jako poslední zhoupnutí prkna, které už klesá.",
  },

  physics: {
    h: "Fyzika místo učení nazpaměť",
    p: "S pěti jezdci by se velký model naučil hlavně těch pět lidí. Proto se pumpy počítají bez jakéhokoli trénovaného modelu, podle toho, čím pumpování fyzikálně je — rytmem:",
    li: [
      "**Rytmický filtr.** Kandidátské vrcholy se porovnají s místním rytmem posledních záběrů. Dva vrcholy mnohem blíž než jeden záběr jsou jeden záběr — slabší odpadne. Mezera dvou nebo tří záběrů s vhodným slabším vrcholem uprostřed tento vrchol dostane zpět: pumpa, která tam byla, jen tišší.",
      "**Sledovač rytmu.** Druhý průchod sleduje rytmus záběr po záběru a předpovídá, kde by měl být další. Smí se rychle přizpůsobit — pumpování není metronom: na rozjezd se přidá a záměrně se zvolní. Kde najde záběr, který filtr vynechal, přidá ho.",
      "**Klouzání = rytmus se přeruší a energie klesne.** Silný vrchol uprostřed klouzání zůstává pumpou. Odstraní se jen slabé vrcholy — pod 40 % jezdcova vlastního typického záběru v té jízdě — když si je model klouzání jistý.",
    ],
    cap: "Pumpování není metronom: v této jízdě kolísá rytmus zhruba mezi 77 a 90 záběry za minutu. Sledovač používá jen poslední záběry, a proto drží krok.",
    p2: "Jediná trénovaná část rozhoduje pro každou čtvrtsekundu: **klouzání, nebo pumpování**. Je záměrně malá:",
    li2: [
      "rozhodovací stromy se **7 listy**, nic víc,",
      "vstupy vztažené k jezdcově vlastní jízdě (síla vůči vlastnímu pumpování, rytmus vůči vlastnímu rytmu), žádný model hodinek, žádná identita jezdce,",
      "žádná informace o tom, kde v jízdě daná chvíle leží — jinak by se model prostě naučil, že klouzání bývá na konci,",
      "výstup se vyhlazuje překrývajícími se pětisekundovými okny a jednoduchým stavovým modelem, který ví, že klouzání trvá alespoň zhruba 1,5 sekundy.",
    ],
  },

  honest: {
    h: "Poctivě změřeno",
    p: "Každé číslo tu je změřené na jezdcích, které model nikdy neviděl: trénink na čtyřech, test na pátém, pětkrát. Proti prknu, ve srovnání se starým počítadlem:",
    cap1: "Průměr přes 5 jezdců, každý změřen, aniž byl v tréninku. Vpravo: nalezené pumpy po jezdcích — každý jezdec dostane víc svých skutečných pump.",
    p2: "V číslech:",
    li: [
      "**Nalezené pumpy** (v rozmezí ±0,25 s): 88,5 % → 93,1 % (±0,4 s: 98 %).",
      "**Započítané pumpy, které jsou skutečné:** 78 % → 87 %.",
      "**Chyba počtu pump na jízdu:** 17 % → 11 %.",
      "**Kolem změn rytmu** (přidat, zvolnit): 89 % → 95 % nalezených záběrů.",
      "**Nalezená klouzání:** 0 % → 51 %, a 54 % ohlášených klouzání je skutečných.",
      "**Ručně označené jízdy:** nechybí jediná označená pumpa — dřív jich za zdvojeními chybělo 4 a 6.",
    ],
    cap2: "Vlevo a uprostřed jsou výsledky z prvního kola modelů, kdy o všem rozhodoval jeden model (tam zvolená velikost, 7 listů, je ta, kterou nyní používá model klouzání). Vlevo: větší model se své tréninkové jezdce učí čím dál lépe, ale jezdce, kterého nikdy neviděl, ne. Uprostřed: každý další jezdec stále pomáhá. Vpravo: malá neuronová síť na surových signálech dopadla hůř než malý stromový model.",
    p3: "Zkusili jsme také malou neuronovou síť na surových signálech místo ručně vybraných vstupů. S tak malým množstvím dat jasně prohrála. Není to verdikt nad neuronovými sítěmi — je to verdikt nad 5 jezdci.",
  },

  before: {
    h: "Před a po",
    p: "Dvě z mých jízd, jak je aplikace dosud ukazovala a jak je vidí nové rozpoznávání. Azurové tečky jsou pumpy, žluté úseky klouzání.",
    cap: "Jízda 2: 58 → 50 pump; zdvojení zmizela a objeví se klouzání na konci (prkno říká: 5,8 s). Jízda 4: tři krátká klouzání místo žádného; na prkně měla tato jízda jedno klouzání o délce 3,6 s.",
    p2: "Napříč všemi nahrávkami teď klouzání tvoří asi 6 % času na foilu — blízko 7 %, které měří prkno. Hranic jízd se to nedotkne; mění se jen to, co se děje uvnitř jízdy. Několik velmi dlouhých klouzání, při nichž rychlost téměř neklesá, se nepočítá jako klouzání, ale označí se k bližšímu pohledu: obvykle jde o vlnu, tah odněkud nebo záběry, které hodinky nemohly zachytit.",
  },

  limits: {
    h: "Meze",
    li: [
      "**Pět jezdců.** Křivka učení se ještě nezploštila. Každý jezdec s telefonem na prkně zlepší část o klouzání.",
      "**Klouzání je stále tou těžkou částí.** Najde se polovina skutečných klouzání a každé druhé ohlášené je skutečné. Začátek, ne konec.",
      "**Carvy potřebují víc dat.** Prkno vidí i oblouky. 42 carvů v dosavadních nahrávkách je na vlastní rozpoznávání příliš málo — bylo by jich potřeba zhruba o 110 víc, od více jezdců.",
      "**V provozu od 23. října.** Všechny nahrávky byly přepočítány; stará čísla zůstávají uložena na pozadí a rekordy se řídí novými.",
    ],
  },

  help: {
    h: "Jak můžeš pomoct",
    p: "Nejvíc pomůže session s **obojím**: hodinky na zápěstí a telefon pevně na prkně, obojí nahrává současně.",
    li: [
      "Připevni telefon pevně k prknu (stačí vodotěsné pouzdro a lepicí páska).",
      "Spusť nahrávání na obou ještě před vstupem do vody a na konci obě zastav.",
      "Deset minut běžného ježdění bohatě stačí — i s klouzáním a občasným carvem.",
    ],
    p2: "Obě nahrávky se objeví ve tvých sessions jako obvykle; časově je srovnáme sami. Jestli chceš, napiš nám, zda jsi měl hodinky na přední, nebo zadní ruce.",
  },
};

const pl: N6 = {
  back: "← Część 5: Model rozpoznawania",
  h1: "Część 6: Pompy i ślizg",
  subtitle: "Jak uczymy zegarek liczyć każdą pompę tylko raz — i zauważać, kiedy przestajesz pompować",
  intro:
    "Część 5 dotyczyła tego, **czy** ktoś jest na foilu. Ta część dotyczy tego, co dzieje się **w tym czasie**: każdego ruchu pompy i każdej chwili bez niego. Obie liczby były słabsze, niż wyglądały. Licznik czasem liczył jeden ruch podwójnie, a następny pomijał, a prawdziwego rozpoznawania ślizgu w ogóle nie było. Sędzią znów jest telefon na desce, a odpowiedzią znów jest głównie fizyka — z celowo małym modelem tam, gdzie sama fizyka nie wystarcza.",

  problem: {
    h: "Co było nie tak",
    p: "Stary licznik szuka rytmu w pionowym ruchu nadgarstka i wybiera jeden szczyt na ruch. Mierzony względem deski znajduje 88 % prawdziwych pomp — nieźle — ale:",
    li: [
      "**Liczył podwójnie.** Czasem liczone były oba szczyty oddalone o kilka setnych sekundy. W dwóch przejazdach oznaczonych ręcznie na wideo 5 i 7 takich podwójnych ukrywało dokładnie tyle samo pominiętych ruchów — suma zgadzała się przypadkiem.",
      "**Liczył dalej podczas ślizgu.** Ręce poruszają się dalej, gdy nogi przestają. 22 % wszystkiego, co policzył zegarek, nie było prawdziwymi pompami; duża część z nich wypadała w ślizgu.",
      "**Nie było rozpoznawania ślizgu.** To, co aplikacja nazywała *najdłuższym ślizgiem*, było po prostu najdłuższą przerwą między dwiema policzonymi pompami. Ponieważ licznik rzadko się zatrzymywał, ta przerwa prawie nigdy nie była prawdziwym ślizgiem — w przejazdach sprawdzonych względem deski stare ślizgi znalazły 0 z 64 prawdziwych.",
    ],
  },

  truth: {
    h: "Sędzia: telefon na desce",
    p: "Tak jak w [części 4](/nerd-analysen-4), telefon przyklejony do deski mierzy samą deskę: o ile unosi się i opada przy każdym ruchu i czy ten ruch naprawdę dodaje jeździe energii. Nagrany jednocześnie z zegarkiem na nadgarstku i wyrównany co do ułamka sekundy, mówi nam dla każdego ruchu, czy był, a dla każdej przerwy, czy był to ślizg. Nadaje się do tego 14 takich sesji od 5 riderów: około 3700 pomp potwierdzonych przez deskę i 64 ślizgi.",
    cap: "Jeden z moich przejazdów. U góry deska unosząca się i opadająca — każda cyjanowa linia to ruch z energią, na żółto ślizg przed przyziemieniem (czerwone). Na dole nadgarstek z pompami znalezionymi przez stary licznik (czerwone kropki). Zwróć uwagę na kropki w ślizgu.",
    p2: "Pompa oznacza tu to, co mówi deska: ruch, który wpycha energię w jazdę. Drobne ruchy przy łapaniu równowagi się nie liczą, podobnie jak ostatnie wahnięcia deski, która już tonie.",
  },

  physics: {
    h: "Fizyka zamiast uczenia się na pamięć",
    p: "Przy pięciu riderach duży model nauczyłby się głównie tych pięciu osób. Dlatego pompy liczone są bez żadnego trenowanego modelu, na podstawie tego, czym pompowanie jest fizycznie — rytmem:",
    li: [
      "**Filtr rytmu.** Kandydackie szczyty porównywane są z lokalnym rytmem ostatnich ruchów. Dwa szczyty znacznie bliżej niż jeden ruch to jeden ruch — słabszy odpada. Przerwa długości dwóch lub trzech ruchów z pasującym, słabszym szczytem pośrodku odzyskuje ten szczyt: pompa, która była, tylko cichsza.",
      "**Śledzenie rytmu.** Drugie przejście śledzi rytm ruch po ruchu i przewiduje, gdzie powinien wypaść następny. Może szybko się dostosowywać — pompowanie to nie metronom: przyspiesza się, żeby ruszyć, i celowo zwalnia. Gdy znajdzie ruch, który filtr pominął, zostaje on dodany.",
      "**Ślizg = rytm się urywa i energia spada.** Silny szczyt w ślizgu pozostaje pompą. Usuwane są tylko słabe szczyty — poniżej 40 % własnego typowego ruchu ridera w tym przejeździe — gdy model ślizgu jest pewny.",
    ],
    cap: "Pompowanie to nie metronom: w tym przejeździe rytm waha się mniej więcej między 77 a 90 ruchami na minutę. Śledzenie używa tylko ostatnich ruchów, więc nadąża.",
    p2: "Jedyna trenowana część decyduje dla każdej ćwierćsekundy: **ślizg czy pompowanie**. Celowo jest mała:",
    li2: [
      "drzewa decyzyjne z **7 liśćmi**, nic więcej,",
      "wejścia odniesione do własnego przejazdu ridera (siła względem własnego pompowania, rytm względem własnego rytmu), bez modelu zegarka, bez tożsamości ridera,",
      "brak informacji, w którym miejscu przejazdu leży dana chwila — inaczej model nauczyłby się po prostu, że ślizg zwykle jest na końcu,",
      "wynik wygładzany jest nakładającymi się oknami 5-sekundowymi i prostym modelem stanów, który wie, że ślizg trwa co najmniej około 1,5 sekundy.",
    ],
  },

  honest: {
    h: "Uczciwie zmierzone",
    p: "Każda liczba tutaj jest zmierzona na riderach, których model nigdy nie widział: trening na czterech, test na piątym, pięć razy. Względem deski, w porównaniu ze starym licznikiem:",
    cap1: "Średnia z 5 riderów, każdy zmierzony bez udziału w treningu. Po prawej: znalezione pompy dla każdego ridera — każdy rider odzyskuje więcej swoich prawdziwych pomp.",
    p2: "W liczbach:",
    li: [
      "**Znalezione pompy** (w granicach ±0,25 s): 88,5 % → 93,1 % (±0,4 s: 98 %).",
      "**Policzone pompy, które są prawdziwe:** 78 % → 87 %.",
      "**Błąd liczby pomp na przejazd:** 17 % → 11 %.",
      "**Wokół zmian rytmu** (przyspieszanie, zwalnianie): 89 % → 95 % znalezionych ruchów.",
      "**Znalezione ślizgi:** 0 % → 51 %, a 54 % zgłoszonych ślizgów jest prawdziwych.",
      "**Przejazdy oznaczone ręcznie:** nie brakuje ani jednej oznaczonej pompy — wcześniej za podwójnymi brakowało 4 i 6.",
    ],
    cap2: "Lewa i środkowa część pochodzą z pierwszej rundy modeli, w której jeden model decydował o wszystkim (wybrany tam rozmiar, 7 liści, to ten, którego używa teraz model ślizgu). Po lewej: większy model coraz lepiej uczy się swoich riderów treningowych, ale nie ridera, którego nigdy nie widział. Pośrodku: każdy kolejny rider wciąż pomaga. Po prawej: mała sieć neuronowa na surowych sygnałach wypadła gorzej niż mały model drzewiasty.",
    p3: "Wypróbowaliśmy też małą sieć neuronową na surowych sygnałach zamiast ręcznie dobranych wejść. Przy tak małej ilości danych wyraźnie przegrała. To nie wyrok na sieci neuronowe — to wyrok na 5 riderów.",
  },

  before: {
    h: "Przed i po",
    p: "Dwa z moich przejazdów, tak jak aplikacja pokazywała je dotąd i jak widzi je nowe rozpoznawanie. Cyjanowe kropki to pompy, żółte odcinki to ślizgi.",
    cap: "Przejazd 2: 58 → 50 pomp; podwójne zniknęły, a pojawia się ślizg na końcu (deska mówi: 5,8 s). Przejazd 4: trzy krótkie ślizgi zamiast żadnego; na desce ten przejazd miał jeden ślizg trwający 3,6 s.",
    p2: "We wszystkich nagraniach ślizg stanowi teraz około 6 % czasu na foilu — blisko 7 %, które mierzy deska. Granice przejazdów pozostają nietknięte; zmienia się tylko to, co dzieje się wewnątrz przejazdu. Kilka bardzo długich ślizgów, w których prędkość prawie nie spada, nie liczy się jako ślizg, lecz zostaje oznaczonych do dokładniejszego obejrzenia: zwykle to fala, ciąg z jakiegoś źródła albo ruchy, których zegarek nie mógł zobaczyć.",
  },

  limits: {
    h: "Ograniczenia",
    li: [
      "**Pięciu riderów.** Krzywa uczenia się jeszcze się nie spłaszczyła. Każdy rider z telefonem na desce poprawia część o ślizgu.",
      "**Ślizg wciąż jest trudną częścią.** Znajdowana jest połowa prawdziwych ślizgów, a co drugi zgłoszony jest prawdziwy. To początek, nie koniec.",
      "**Carvy potrzebują więcej danych.** Deska widzi też skręty. 42 carvy w dotychczasowych nagraniach to zdecydowanie za mało na osobne rozpoznawanie — potrzeba by ich około 110 więcej, od większej liczby riderów.",
      "**Działa od 23 października.** Wszystkie nagrania zostały przeliczone; stare liczby są zachowane w tle, a rekordy idą za nowymi.",
    ],
  },

  help: {
    h: "Jak możesz pomóc",
    p: "Najbardziej pomaga sesja z **obydwoma**: zegarek na nadgarstku i telefon przymocowany do deski, oba nagrywają jednocześnie.",
    li: [
      "Przymocuj telefon solidnie do deski (wystarczy wodoszczelne etui i taśma).",
      "Uruchom nagrywanie na obu, zanim wejdziesz do wody, a na koniec zatrzymaj oba.",
      "Dziesięć minut zwykłej jazdy w zupełności wystarczy — razem ze ślizgami i jakimś carvem.",
    ],
    p2: "Oba nagrania pojawiają się jak zwykle w twoich sesjach; sami nakładamy je na siebie w czasie. Jeśli chcesz, daj nam znać, czy nosiłeś zegarek na przedniej, czy tylnej ręce.",
  },
};

const ru: N6 = {
  back: "← Часть 5: Модель распознавания",
  h1: "Часть 6: Пампы и глайд",
  subtitle: "Как мы учим часы считать каждый памп ровно один раз — и замечать, когда ты перестаёшь пампить",
  intro:
    "Часть 5 была о том, **стоит ли** человек на фойле. Эта часть — о том, что происходит **в это время**: о каждом пампе и о каждом моменте без него. Оба числа были слабее, чем казались. Счётчик иногда считал один памп дважды и пропускал следующий, а настоящего распознавания глайда не было вовсе. Судья — снова телефон на доске, и ответ — снова в основном физика, с намеренно маленькой моделью там, где одной физики мало.",

  problem: {
    h: "Что было не так",
    p: "Старый счётчик ищет ритм в вертикальном движении запястья и берёт один пик на каждый памп. При сравнении с доской он находит 88 % настоящих пампов — неплохо — но:",
    li: [
      "**Он считал дважды.** Иногда засчитывались оба пика, разделённые сотыми долями секунды. В двух заездах, размеченных вручную по видео, 5 и 7 таких дублей скрывали ровно столько же пропущенных пампов — сумма сошлась случайно.",
      "**Он продолжал считать во время глайда.** Руки продолжают двигаться, когда ноги останавливаются. 22 % всего, что насчитали часы, не были настоящими пампами; большая часть из них приходилась на глайд.",
      "**Распознавания глайда не было.** То, что приложение называло *самым длинным глайдом*, было просто самым длинным промежутком между двумя засчитанными пампами. Поскольку счётчик редко останавливался, этот промежуток почти никогда не был настоящим глайдом — в заездах, проверенных по доске, старые глайды нашли 0 из 64 настоящих.",
    ],
  },

  truth: {
    h: "Судья: телефон на доске",
    p: "Как и в [части 4](/nerd-analysen-4), телефон, закреплённый на доске, измеряет саму доску: насколько она поднимается и опускается при каждом пампе и действительно ли этот памп добавляет энергии. Записанный одновременно с часами на запястье и выровненный с точностью до доли секунды, он говорит нам о каждом пампе, был ли он, а о каждом промежутке — был ли это глайд. Подходят 14 таких сессий от 5 райдеров: около 3700 пампов, подтверждённых доской, и 64 глайда.",
    cap: "Один из моих заездов. Сверху доска, которая поднимается и опускается: каждая бирюзовая линия — памп с энергией, жёлтым — глайд перед касанием (красное). Снизу запястье с пампами, которые нашёл старый счётчик (красные точки). Обрати внимание на точки внутри глайда.",
    p2: "Памп здесь — это то, что говорит доска: движение, которое добавляет энергии. Мелкие движения для равновесия не считаются, как и последние покачивания доски, которая уже проседает.",
  },

  physics: {
    h: "Физика вместо заучивания",
    p: "С пятью райдерами большая модель выучила бы в основном этих пятерых. Поэтому пампы считаются вообще без обученной модели, исходя из того, чем пампинг является физически, — ритма:",
    li: [
      "**Фильтр ритма.** Пики-кандидаты сверяются с локальным ритмом последних пампов. Два пика намного ближе, чем один памп, — это один памп: более слабый убирается. Пропуск в два-три пампа с подходящим, более слабым пиком посередине получает этот пик обратно: памп, который был, только тише.",
      "**Отслеживание ритма.** Второй проход следует за ритмом памп за пампом и предсказывает, где должен быть следующий. Ему разрешено быстро подстраиваться — пампинг не метроном: на старте разгоняются, а потом сознательно сбавляют. Если он находит памп, пропущенный фильтром, тот добавляется.",
      "**Глайд = ритм обрывается и энергия падает.** Сильный пик внутри глайда остаётся пампом. Убираются только слабые пики — меньше 40 % собственного типичного пампа райдера в этом заезде, — когда модель глайда уверена.",
    ],
    cap: "Пампинг не метроном: в этом заезде ритм гуляет примерно от 77 до 90 пампов в минуту. Отслеживание использует только последние пампы и поэтому успевает за ним.",
    p2: "Единственная обученная часть решает для каждой четверти секунды: **глайд или памп**. Она намеренно маленькая:",
    li2: [
      "деревья решений с **7 листьями**, не больше,",
      "входные данные относительно собственного заезда райдера (сила относительно его собственного пампинга, ритм относительно его собственного ритма), без модели часов, без идентичности райдера,",
      "никакой информации о том, в каком месте заезда находится момент, — иначе модель просто выучила бы, что глайд обычно бывает в конце,",
      "результат сглаживается перекрывающимися 5-секундными окнами и простой моделью состояний, которая знает, что глайд длится не меньше примерно 1,5 секунды.",
    ],
  },

  honest: {
    h: "Честно измерено",
    p: "Каждое число здесь измерено на райдерах, которых модель никогда не видела: обучение на четырёх, проверка на пятом, пять раз. По доске, в сравнении со старым счётчиком:",
    cap1: "Среднее по 5 райдерам, каждый измерен без участия в обучении. Справа: найденные пампы по райдерам — каждый райдер получает больше своих настоящих пампов.",
    p2: "В цифрах:",
    li: [
      "**Найденные пампы** (в пределах ±0,25 с): 88,5 % → 93,1 % (±0,4 с: 98 %).",
      "**Засчитанные пампы, которые настоящие:** 78 % → 87 %.",
      "**Ошибка числа пампов на заезд:** 17 % → 11 %.",
      "**Вокруг смены ритма** (разгон, сбавить): 89 % → 95 % найденных пампов.",
      "**Найденные глайды:** 0 % → 51 %, и 54 % отмеченных глайдов настоящие.",
      "**Заезды, размеченные вручную:** не пропущен ни один размеченный памп — раньше за дублями терялось 4 и 6.",
    ],
    cap2: "Левый и средний графики — из первого раунда моделей, где одна модель решала всё (выбранный там размер, 7 листьев, использует теперь модель глайда). Слева: модель покрупнее всё лучше выучивает своих тренировочных райдеров, но не райдера, которого никогда не видела. В центре: каждый дополнительный райдер всё ещё помогает. Справа: маленькая нейросеть на сырых сигналах показала себя хуже, чем маленькая модель на деревьях.",
    p3: "Мы также попробовали маленькую нейросеть на сырых сигналах вместо подобранных вручную входов. При таком малом объёме данных она явно проиграла. Это не приговор нейросетям — это приговор пяти райдерам.",
  },

  before: {
    h: "До и после",
    p: "Два моих заезда — так, как их до сих пор показывало приложение, и так, как их видит новое распознавание. Бирюзовые точки — пампы, жёлтые участки — глайд.",
    cap: "Заезд 2: 58 → 50 пампов; дубли исчезли, и появился глайд в конце (доска говорит: 5,8 с). Заезд 4: три коротких глайда вместо ни одного; по доске в этом заезде был один глайд на 3,6 с.",
    p2: "По всем записям глайд теперь составляет около 6 % времени на фойле — близко к 7 %, которые измеряет доска. Границы заездов не трогаются; меняется только то, что происходит внутри заезда. Несколько очень длинных глайдов, во время которых скорость почти не падает, не считаются глайдом, а помечаются для более внимательного просмотра: обычно это волна, тяга откуда-то или пампы, которых часы не могли увидеть.",
  },

  limits: {
    h: "Ограничения",
    li: [
      "**Пять райдеров.** Кривая обучения ещё не вышла на плато. Каждый райдер с телефоном на доске делает часть про глайд лучше.",
      "**Глайд всё ещё самая трудная часть.** Находится половина настоящих глайдов, и каждый второй отмеченный глайд настоящий. Это начало, а не конец.",
      "**Карвам нужно больше данных.** Доска видит и повороты. 42 карва в имеющихся записях — слишком мало для отдельного распознавания: понадобилось бы ещё примерно 110, от большего числа райдеров.",
      "**Работает с 23 октября.** Все записи пересчитаны; старые числа сохраняются в фоне, а рекорды следуют новым.",
    ],
  },

  help: {
    h: "Как ты можешь помочь",
    p: "Полезнее всего сессия **с обоими**: часы на запястье и телефон, закреплённый на доске, записывают одновременно.",
    li: [
      "Надёжно закрепи телефон на доске (достаточно водонепроницаемого чехла и скотча).",
      "Запусти запись на обоих до того, как выйдешь на воду, и останови обе в конце.",
      "Десяти минут обычного катания вполне достаточно — с глайдами и парой карвов.",
    ],
    p2: "Обе записи, как обычно, появятся в твоих сессиях; мы сами совместим их по времени. Если хочешь, сообщи нам, на передней или задней руке ты носил часы.",
  },
};

const id: N6 = {
  back: "← Bagian 5: Model deteksi",
  h1: "Bagian 6: Pump dan meluncur",
  subtitle: "Mengajari jam menghitung setiap pump sekali saja — dan menyadari kapan kamu berhenti memompa",
  intro:
    "Bagian 5 membahas **apakah** seseorang sedang berada di atas foil. Bagian ini membahas apa yang terjadi **selama** itu: setiap gerakan pump dan setiap momen tanpanya. Kedua angka itu lebih lemah daripada kelihatannya. Penghitung kadang menghitung satu gerakan dua kali lalu melewatkan yang berikutnya, dan deteksi meluncur yang sebenarnya sama sekali belum ada. Wasitnya lagi-lagi ponsel di papan, dan jawabannya lagi-lagi sebagian besar fisika — dengan model yang sengaja dibuat kecil di bagian yang tidak cukup ditangani fisika saja.",

  problem: {
    h: "Apa yang salah",
    p: "Penghitung lama mencari ritme pada gerakan vertikal pergelangan tangan dan memilih satu puncak per gerakan. Diukur terhadap papan, ia menemukan 88 % pump yang sebenarnya — lumayan — tetapi:",
    li: [
      "**Ia menghitung ganda.** Kadang dua puncak yang hanya terpaut beberapa perseratus detik sama-sama dihitung. Pada dua run yang ditandai manual dari video, 5 dan 7 hitungan ganda seperti itu menyembunyikan tepat sebanyak itu gerakan yang terlewat — totalnya cocok hanya kebetulan.",
      "**Ia terus menghitung saat meluncur.** Lengan tetap bergerak ketika kaki berhenti. 22 % dari semua yang dihitung jam bukan pump sungguhan; sebagian besar berada di fase meluncur.",
      "**Tidak ada deteksi meluncur.** Yang disebut aplikasi *meluncur terlama* hanyalah jeda terpanjang di antara dua pump yang dihitung. Karena penghitung jarang berhenti, jeda itu hampir tidak pernah benar-benar meluncur — pada run yang dicek dengan papan, fase meluncur lama menemukan 0 dari 64 yang sebenarnya.",
    ],
  },

  truth: {
    h: "Wasitnya: ponsel di papan",
    p: "Seperti di [bagian 4](/nerd-analysen-4), ponsel yang ditempel ke papan mengukur papan itu sendiri: seberapa jauh ia naik dan turun di setiap gerakan, dan apakah gerakan itu benar-benar menambah energi. Direkam bersamaan dengan jam di pergelangan dan diselaraskan hingga sepersekian detik, ia memberi tahu untuk setiap gerakan apakah gerakan itu terjadi, dan untuk setiap jeda apakah itu fase meluncur. Ada 14 sesi seperti ini dari 5 rider yang memenuhi syarat: sekitar 3.700 pump yang dikonfirmasi papan dan 64 fase meluncur.",
    cap: "Salah satu run saya. Atas: papan yang naik dan turun — setiap garis sian adalah gerakan dengan energi, kuning adalah fase meluncur sebelum touchdown (merah). Bawah: pergelangan tangan, dengan pump yang ditemukan penghitung lama (titik merah). Perhatikan titik-titik di dalam fase meluncur.",
    p2: "Pump di sini berarti apa yang dikatakan papan: gerakan yang mendorong energi ke dalam run. Goyangan kecil untuk menjaga keseimbangan tidak dihitung, begitu pula ayunan terakhir papan yang sudah mulai tenggelam.",
  },

  physics: {
    h: "Fisika, bukan menghafal",
    p: "Dengan lima rider, model besar sebagian besar hanya akan menghafal lima orang itu. Karena itu jumlah pump dihitung tanpa model terlatih apa pun, memakai apa yang secara fisik adalah pumping — sebuah ritme:",
    li: [
      "**Filter ritme.** Puncak kandidat dicek terhadap ritme lokal beberapa gerakan terakhir. Dua puncak yang jauh lebih dekat daripada satu gerakan adalah satu gerakan — yang lebih lemah dibuang. Celah dua atau tiga gerakan dengan puncak yang lebih lemah tapi pas di tengahnya mendapatkan puncak itu kembali: pump yang memang ada, hanya lebih pelan.",
      "**Pelacak ritme.** Putaran kedua mengikuti ritme gerakan demi gerakan dan memprediksi di mana gerakan berikutnya seharusnya. Ia boleh beradaptasi cepat — pumping bukan metronom: rider mempercepat untuk mulai melaju dan sengaja memperlambat. Jika ia menemukan gerakan yang terlewat oleh filter, gerakan itu ditambahkan.",
      "**Meluncur = ritme putus dan energi turun.** Puncak yang kuat di dalam fase meluncur tetap dihitung pump. Hanya puncak lemah — kurang dari 40 % gerakan khas rider itu sendiri di run tersebut — yang dibuang saat model meluncur yakin.",
    ],
    cap: "Pumping bukan metronom: di run ini ritmenya berubah-ubah antara sekitar 77 dan 90 gerakan per menit. Pelacak hanya memakai beberapa gerakan terakhir, jadi ia tetap mengikuti.",
    p2: "Satu-satunya bagian yang dilatih memutuskan untuk setiap seperempat detik: **meluncur atau memompa**. Bagian ini sengaja dibuat kecil:",
    li2: [
      "pohon keputusan dengan **7 daun**, tidak lebih,",
      "input dinormalkan terhadap run rider itu sendiri (kekuatan relatif terhadap pumping-nya sendiri, ritme relatif terhadap ritmenya sendiri), tanpa model jam, tanpa identitas rider,",
      "tanpa informasi di bagian mana sebuah momen berada dalam run — kalau tidak, model hanya akan belajar bahwa meluncur biasanya terjadi di akhir,",
      "keluarannya dihaluskan dengan jendela 5 detik yang saling tumpang tindih dan model keadaan sederhana yang tahu bahwa fase meluncur berlangsung setidaknya sekitar 1,5 detik.",
    ],
  },

  honest: {
    h: "Diukur dengan jujur",
    p: "Setiap angka di sini diukur pada rider yang belum pernah dilihat model: dilatih dengan empat, diuji pada yang kelima, lima kali. Terhadap papan, dibandingkan dengan penghitung lama:",
    cap1: "Rata-rata dari 5 rider, masing-masing diukur tanpa pernah ikut pelatihan. Kanan: pump yang ditemukan per rider — setiap rider mendapatkan lebih banyak pump aslinya.",
    p2: "Dalam angka:",
    li: [
      "**Pump yang ditemukan** (dalam ±0,25 dtk): 88,5 % → 93,1 % (±0,4 dtk: 98 %).",
      "**Pump terhitung yang memang nyata:** 78 % → 87 %.",
      "**Kesalahan jumlah pump per run:** 17 % → 11 %.",
      "**Di sekitar perubahan ritme** (mempercepat, memperlambat): 89 % → 95 % gerakan ditemukan.",
      "**Fase meluncur yang ditemukan:** 0 % → 51 %, dan 54 % fase meluncur yang dilaporkan memang nyata.",
      "**Run yang ditandai manual:** tidak ada satu pun pump bertanda yang hilang — sebelumnya 4 dan 6 hilang di balik hitungan ganda.",
    ],
    cap2: "Grafik kiri dan tengah berasal dari putaran model pertama, ketika satu model memutuskan segalanya (ukuran yang dipilih di sana, 7 daun, adalah yang sekarang dipakai model meluncur). Kiri: model yang lebih besar makin baik mempelajari rider latihannya, tetapi tidak untuk rider yang belum pernah dilihatnya. Tengah: setiap rider tambahan masih membantu. Kanan: jaringan saraf kecil pada sinyal mentah hasilnya lebih buruk daripada model pohon kecil.",
    p3: "Kami juga mencoba jaringan saraf kecil pada sinyal mentah sebagai pengganti input pilihan tangan. Dengan data sesedikit ini ia jelas kalah. Itu bukan vonis atas jaringan saraf — itu vonis atas 5 rider.",
  },

  before: {
    h: "Sebelum dan sesudah",
    p: "Dua run saya, seperti yang ditampilkan aplikasi selama ini dan seperti yang dilihat deteksi baru. Titik sian adalah pump, ruas kuning adalah fase meluncur.",
    cap: "Run 2: 58 → 50 pump; hitungan ganda hilang, dan fase meluncur di akhir muncul (papan bilang: 5,8 dtk). Run 4: tiga fase meluncur pendek, padahal sebelumnya tidak ada; di papan run ini punya satu fase meluncur 3,6 dtk.",
    p2: "Di semua rekaman, fase meluncur kini sekitar 6 % dari waktu di atas foil — dekat dengan 7 % yang diukur papan. Batas run sendiri tidak disentuh; yang berubah hanya apa yang terjadi di dalam run. Beberapa fase meluncur yang sangat panjang, saat kecepatan hampir tidak turun, tidak dihitung sebagai meluncur tetapi ditandai untuk dilihat lebih teliti: biasanya itu ombak, tarikan dari suatu tempat, atau gerakan yang tidak bisa dilihat jam.",
  },

  limits: {
    h: "Batasan",
    li: [
      "**Lima rider.** Kurva belajarnya belum mendatar. Setiap rider dengan ponsel di papan membuat bagian meluncur makin baik.",
      "**Meluncur masih bagian yang sulit.** Separuh fase meluncur sebenarnya ditemukan, dan satu dari dua yang dilaporkan memang nyata. Ini awal, bukan akhir.",
      "**Carve butuh lebih banyak data.** Papan juga melihat belokan. 42 carve dalam rekaman sejauh ini terlalu sedikit untuk deteksi tersendiri — dibutuhkan sekitar 110 lagi, dari lebih banyak rider.",
      "**Aktif sejak 23 Oktober.** Semua rekaman sudah dihitung ulang; angka lama tetap disimpan di latar belakang, dan rekor mengikuti angka baru.",
    ],
  },

  help: {
    h: "Cara kamu bisa membantu",
    p: "Yang paling berguna adalah sesi dengan **keduanya**: jam di pergelangan dan ponsel yang terpasang di papan, merekam bersamaan.",
    li: [
      "Pasang ponsel dengan kuat di papan (kantong tahan air dan selotip sudah cukup).",
      "Mulai rekaman di keduanya sebelum turun ke air, dan hentikan keduanya di akhir.",
      "Sepuluh menit riding biasa sudah lebih dari cukup — termasuk fase meluncur dan sesekali carve.",
    ],
    p2: "Kedua rekaman muncul di sesimu seperti biasa; kami sendiri yang menyelaraskannya berdasarkan waktu. Kalau mau, beri tahu kami apakah kamu memakai jam di tangan depan atau belakang.",
  },
};

const ja: N6 = {
  back: "← パート5：検出モデル",
  h1: "パート6：パンプとグライド",
  subtitle: "すべてのパンプを一回ずつ数え、パンプをやめた瞬間に気づけるよう時計を育てる",
  intro:
    "パート5では、その人がフォイルに**乗っているかどうか**を判断する話をしました。今回はその**間に**起きること、つまり一回一回のパンプと、パンプしていない瞬間の話です。どちらの数字も見た目より弱いものでした。カウンターはときどき一回のパンプを二度数えて次を取りこぼし、本当のグライド検出はそもそも存在しませんでした。審判は今回もボード上のスマホ、答えも今回も主に物理です。物理だけでは足りないところにだけ、あえて小さなモデルを使います。",

  problem: {
    h: "何がまずかったのか",
    p: "これまでのカウンターは手首の上下の動きからリズムを探し、一回のパンプにつき一つのピークを選びます。ボードと比べると本物のパンプの88 %を見つけます — 悪くはありません — ですが:",
    li: [
      "**二重に数えていた。** 数百分の一秒しか離れていない二つのピークを両方数えることがありました。動画を見ながら手でタップした二本のランでは、こうした二重カウントが5個と7個あり、ちょうど同じ数の取りこぼしを隠していました — 合計が合っていたのは偶然です。",
      "**グライド中も数え続けていた。** 脚が止まっても腕は動き続けます。時計が数えたもののうち22 %は本物のパンプではなく、その多くがグライド中にありました。",
      "**グライド検出がなかった。** アプリが*最長グライド*と呼んでいたものは、数えた二つのパンプの間の最長のすき間にすぎませんでした。カウンターはめったに止まらないので、そのすき間が本物のグライドであることはほとんどありませんでした — ボードで確認したランでは、旧グライドは本物の64個のうち0個しか当てていません。",
    ],
  },

  truth: {
    h: "審判：ボード上のスマホ",
    p: "[パート4](/nerd-analysen-4)と同じく、ボードに貼り付けたスマホがボードそのものを測ります。パンプのたびにどれだけ上下するか、そしてそのパンプが本当に推進力を生んでいるか。手首の時計と同時に記録し、一秒未満の精度で揃えると、一回一回のパンプが実際にあったか、すき間がグライドだったかがわかります。条件を満たすのは5人のライダーによる14セッション:ボードで確認されたパンプ約3,700回とグライド64回です。",
    cap: "私のランのひとつ。上:上下するボード — 水色の線はエネルギーのあるパンプ、黄色はタッチダウン(赤)前のグライド。下:手首と、旧カウンターが見つけたパンプ(赤い点)。グライドの中にある点に注目してください。",
    p2: "ここでいうパンプはボードが示すもの、つまりライドにエネルギーを送り込む動きです。バランスを取る小さな揺れは数えませんし、すでに沈みかけているボードの最後の揺れも数えません。",
  },

  physics: {
    h: "丸暗記ではなく物理で",
    p: "ライダーが5人だと、大きなモデルはその5人を覚えるだけになりがちです。そこでパンプの数え上げには学習済みモデルを一切使わず、パンプの物理的な正体であるリズムを使います:",
    li: [
      "**リズムフィルター。** 候補のピークを直近数回のパンプの局所的なリズムと照らし合わせます。一回分よりずっと近い二つのピークは一回のパンプ — 弱い方を外します。二〜三回分のすき間の真ん中にちょうどよい弱めのピークがあれば、それを戻します:そこにあったけれど小さかったパンプです。",
      "**リズムトラッカー。** 二回目の処理ではリズムを一回ずつ追い、次のパンプが来るはずの位置を予測します。素早く適応してよいことにしています — パンプはメトロノームではありません:走り出しでは速め、意図的にゆるめることもあります。フィルターが取りこぼしたパンプを見つけたら追加します。",
      "**グライド = リズムが途切れ、エネルギーが落ちる。** グライド中でも強いピークはパンプのままです。グライドモデルが確信しているときに外すのは、そのランでのライダー自身の典型的なパンプの40 %未満という弱いピークだけです。",
    ],
    cap: "パンプはメトロノームではありません:このランではリズムが毎分およそ77〜90回の間で揺れています。トラッカーは直近の数回だけを使うので、きちんとついていきます。",
    p2: "学習するのは、0.25秒ごとに**グライドかパンプか**を判断する部分だけです。あえて小さくしています:",
    li2: [
      "葉が**7枚**の決定木、それ以上はなし、",
      "入力はライダー自身のランに対する相対値(自分のパンプに対する強さ、自分のリズムに対するリズム)、時計の機種もライダーの識別情報も使わない、",
      "その瞬間がランのどこにあるかという情報も使わない — 使うと、グライドは最後に来やすいということを覚えるだけになるため、",
      "出力は重なり合う5秒の窓と、グライドが少なくとも約1.5秒続くことを知っている簡単な状態モデルでなめらかにします。",
    ],
  },

  honest: {
    h: "正直に測る",
    p: "ここに出てくる数字はすべて、モデルが一度も見ていないライダーで測ったものです:4人で学習し、5人目でテスト、それを5回。ボードを基準に、旧カウンターと比べると:",
    cap1: "5人のライダーの平均、各ライダーは学習に含めずに測定。右:ライダーごとの検出パンプ — どのライダーも本物のパンプがより多く見つかります。",
    p2: "数字で見ると:",
    li: [
      "**見つかったパンプ**(±0.25秒以内):88.5 % → 93.1 %(±0.4秒:98 %)。",
      "**数えたパンプのうち本物:** 78 % → 87 %。",
      "**ランごとのパンプ数の誤差:** 17 % → 11 %。",
      "**リズムが変わる前後**(加速、ゆるめる):見つかったパンプ 89 % → 95 %。",
      "**見つかったグライド:** 0 % → 51 %、報告したグライドの54 %が本物。",
      "**手でタップしたラン:** タップしたパンプはひとつも欠けていません — 以前は二重カウントの陰で4個と6個が欠けていました。",
    ],
    cap2: "左と中央は、ひとつのモデルがすべてを判断していた最初のモデル検討のものです(そこで選んだ大きさ、葉7枚が、いまのグライドモデルの大きさです)。左:大きいモデルほど学習したライダーはよく覚えますが、見たことのないライダーには効きません。中央:ライダーが一人増えるごとにまだ良くなります。右:生信号を使った小さなニューラルネットは、小さな決定木モデルより悪い結果でした。",
    p3: "手で選んだ入力の代わりに、生信号に小さなニューラルネットを使う方法も試しました。これほどデータが少ないと、はっきり負けました。これはニューラルネットへの判定ではなく、5人という人数への判定です。",
  },

  before: {
    h: "ビフォー・アフター",
    p: "私のランを二本、これまでアプリが表示していた形と、新しい検出が見る形で並べました。水色の点がパンプ、黄色の区間がグライドです。",
    cap: "ラン2:58 → 50パンプ。二重カウントが消え、最後のグライドが現れます(ボードでは5.8秒)。ラン4:グライドなしから短いグライド三つに。ボードではこのランに3.6秒のグライドがひとつありました。",
    p2: "全記録を通して、グライドはいまフォイル時間の約6 %です — ボードが測る7 %に近い数字です。ランの区切りそのものは変えず、ランの中で起きることだけが変わります。速度がほとんど落ちない非常に長いグライドはグライドとして数えず、詳しく見るための印を付けます:たいていは波、どこかからの引き、あるいは時計に見えなかったパンプです。",
  },

  limits: {
    h: "限界",
    li: [
      "**ライダーは5人。** 学習曲線はまだ頭打ちになっていません。ボードにスマホを付けたライダーが一人増えるたびに、グライドの部分が良くなります。",
      "**グライドはまだ難しい部分。** 本物のグライドの半分が見つかり、報告したグライドの二つに一つが本物です。これは始まりで、終わりではありません。",
      "**カービングにはもっとデータが必要。** ボードはターンも捉えます。これまでの記録にあるカービングは42回で、独自の検出には少なすぎます — より多くのライダーから、あと約110回必要です。",
      "**10月23日から本番稼働。** すべての記録を再計算しました。古い数字は裏で保存され、記録(レコード)は新しい数字に従います。",
    ],
  },

  help: {
    h: "あなたにできること",
    p: "いちばん役に立つのは、**両方**を使ったセッションです:手首の時計と、ボードに固定したスマホで同時に記録します。",
    li: [
      "スマホをボードにしっかり固定する(防水ケースとテープで十分です)。",
      "水に入る前に両方で記録を開始し、最後に両方を止める。",
      "普通に10分乗れば十分です — グライドや時々のカービングも含めて。",
    ],
    p2: "どちらの記録もいつも通りあなたのセッションに表示されます。時間合わせはこちらで行います。よければ、時計を前の手と後ろの手のどちらに着けていたか教えてください。",
  },
};

const zh: N6 = {
  back: "← 第5部分：检测模型",
  h1: "第6部分：泵动与滑翔",
  subtitle: "教手表把每一次泵动只数一次——并察觉你什么时候停止泵动",
  intro:
    "第5部分讲的是判断一个人**是否**在水翼上。这一部分讲的是**在此期间**发生了什么：每一次泵动，以及每一个没有泵动的瞬间。这两个数字都比看起来的要弱。计数器有时会把一次泵动数两遍，又漏掉下一次，而真正的滑翔检测根本不存在。裁判仍然是板上的手机，答案也仍然主要是物理——只在物理不够用的地方，才用一个刻意做小的模型。",

  problem: {
    h: "哪里出了问题",
    p: "原来的计数器在手腕的上下运动中寻找节奏，每次泵动取一个峰值。与板子对比，它能找到88 %的真实泵动——还不错——但是：",
    li: [
      "**它会重复计数。** 有时两个只相隔百分之几秒的峰值都被计入。在两趟根据视频手动标记的滑行中，分别有5个和7个这样的重复计数，恰好掩盖了同样数量的漏数——总数对得上纯属巧合。",
      "**滑翔时它还在继续数。** 腿停下来时手臂还在动。手表数到的所有泵动中有22 %并不是真实泵动，其中很大一部分出现在滑翔中。",
      "**没有滑翔检测。** 应用里所谓的*最长滑翔*，其实只是两次被计数的泵动之间最长的间隔。由于计数器很少停下，这个间隔几乎从来不是真正的滑翔——在用板子核对过的各趟中，旧的滑翔在64次真实滑翔中一次也没找到。",
    ],
  },

  truth: {
    h: "裁判：板上的手机",
    p: "和[第4部分](/nerd-analysen-4)一样，固定在板上的手机测量的是板子本身：每次泵动时板子上下起伏多少，以及这次泵动是否真的为前进注入了能量。它与手腕上的手表同时记录，并对齐到不到一秒的精度，能告诉我们每一次泵动是否发生过、每一个间隔是否是滑翔。符合条件的有来自5位骑手的14次会话：约3,700次经板子确认的泵动和64次滑翔。",
    cap: "我的一趟滑行。上：板子的起伏——每条青色线是一次带能量的泵动，黄色是落水(红色)前的滑翔。下：手腕，以及旧计数器找到的泵动(红点)。注意滑翔中的那些点。",
    p2: "这里的泵动指的是板子所说的：把能量注入前进的动作。保持平衡时的小晃动不算，已经开始下沉的板子最后几下摆动也不算。",
  },

  physics: {
    h: "用物理，而不是死记硬背",
    p: "只有五位骑手时，大模型主要只会记住这五个人。所以泵动计数完全不用训练模型，而是利用泵动在物理上的本质——节奏：",
    li: [
      "**节奏过滤器。** 把候选峰值与最近几次泵动的局部节奏对比。两个峰值的距离远小于一次泵动时，就算作一次——较弱的那个去掉。如果某个两三次泵动长的空缺中间正好有一个合适但较弱的峰值，就把它找回来：那是一次确实存在、只是更轻的泵动。",
      "**节奏跟踪器。** 第二遍逐次跟随节奏，预测下一次泵动应该出现的位置。它可以快速调整——泵动不是节拍器：起步时会加快，也会有意放慢。凡是它找到而过滤器漏掉的泵动，都会补上。",
      "**滑翔 = 节奏中断、能量下降。** 滑翔中强的峰值仍算泵动。只有当滑翔模型很确定时，才去掉弱峰值——低于该骑手在这一趟中典型泵动的40 %。",
    ],
    cap: "泵动不是节拍器：在这一趟中，节奏在每分钟约77到90次之间变化。跟踪器只看最近几次泵动，所以能跟得上。",
    p2: "唯一经过训练的部分，每四分之一秒判断一次：**滑翔还是泵动**。它被刻意做得很小：",
    li2: [
      "决策树只有**7片叶子**，不再更多，",
      "输入都相对于骑手自己的这一趟(力度相对于自己的泵动，节奏相对于自己的节奏)，不使用手表型号，也不使用骑手身份，",
      "不提供某一时刻处在这一趟的哪个位置的信息——否则模型只会学到滑翔通常出现在末尾，",
      "输出先用相互重叠的5秒窗口平滑，再交给一个简单的状态模型，它知道一次滑翔至少持续约1.5秒。",
    ],
  },

  honest: {
    h: "诚实地测量",
    p: "这里的每个数字都是在模型从未见过的骑手身上测得的：用四人训练，用第五人测试，共五轮。以板子为准，与旧计数器相比：",
    cap1: "5位骑手的平均值，每位都是在未参与训练的情况下测量。右：每位骑手找到的泵动——每位骑手都找回了更多自己真实的泵动。",
    p2: "具体数字：",
    li: [
      "**找到的泵动**(±0.25秒内)：88.5 % → 93.1 %(±0.4秒：98 %)。",
      "**计入的泵动中真实的：** 78 % → 87 %。",
      "**每趟泵动次数的误差：** 17 % → 11 %。",
      "**节奏变化前后**(加速、放慢)：找到的泵动 89 % → 95 %。",
      "**找到的滑翔：** 0 % → 51 %，报告的滑翔中54 %是真实的。",
      "**手动标记的各趟：** 没有漏掉任何一个标记的泵动——之前在重复计数背后漏掉了4个和6个。",
    ],
    cap2: "左图和中图来自第一轮模型，当时由一个模型决定一切(那里选定的大小——7片叶子——就是现在滑翔模型所用的)。左：更大的模型对训练骑手学得越来越好，但对从未见过的骑手没有帮助。中：每多一位骑手仍然有帮助。右：基于原始信号的小型神经网络比小型决策树模型表现更差。",
    p3: "我们还试过用小型神经网络处理原始信号，代替人工挑选的输入。数据这么少，它明显输了。这不是对神经网络的判决——而是对只有5位骑手的判决。",
  },

  before: {
    h: "前后对比",
    p: "我的两趟滑行，分别是应用之前的显示方式和新检测看到的样子。青色点是泵动，黄色路段是滑翔。",
    cap: "第2趟：58 → 50次泵动；重复计数消失了，末尾的滑翔出现了(板子显示：5.8秒)。第4趟：从没有滑翔变成三段短滑翔；按板子的记录，这一趟有一次3.6秒的滑翔。",
    p2: "在所有记录中，滑翔现在约占水翼时间的6 %——接近板子测得的7 %。每一趟的边界本身不变，变化的只是一趟内部发生的事。少数速度几乎不下降的超长滑翔不计为滑翔，而是标记出来以便仔细查看：通常是波浪、来自某处的牵引，或手表看不到的泵动。",
  },

  limits: {
    h: "局限",
    li: [
      "**只有五位骑手。** 学习曲线还没有走平。每多一位在板上装手机的骑手，滑翔部分就会更好。",
      "**滑翔仍是难点。** 能找到一半的真实滑翔，报告的滑翔中每两个有一个是真实的。这是开始，不是结束。",
      "**转弯需要更多数据。** 板子也能看到转弯。目前记录中只有42次转弯，远不够单独检测——还需要来自更多骑手的约110次。",
      "**10月23日起上线。** 所有记录都已重新计算；旧数字保留在后台，纪录以新数字为准。",
    ],
  },

  help: {
    h: "你可以怎样帮忙",
    p: "最有用的是**两者兼备**的会话：手腕上的手表和固定在板上的手机，同时记录。",
    li: [
      "把手机牢牢固定在板上(防水袋加胶带就够了)。",
      "下水前在两台设备上都开始记录，结束时两台都停止。",
      "正常滑十分钟就足够了——包括滑翔和偶尔的转弯。",
    ],
    p2: "两份记录会照常出现在你的会话中；我们会自己按时间把它们对齐。如果愿意，告诉我们你把手表戴在前手还是后手。",
  },
};

export const NERD6: Partial<Record<Lang, N6>> = { en, de, "de-AT": deAT, gsw, fr, it, es, nl, nb, fi, cs, pl, ru, pt, "pt-PT": ptPT, id, ja, zh };
