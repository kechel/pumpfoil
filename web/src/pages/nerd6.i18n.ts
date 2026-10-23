// Inhalte für die Nerd-Analysen Teil 6 (Pump- und Gleit-Erkennung pg-1) — ENTWURF zum Gegenlesen (23.10.2026).
//
// Vorerst nur Deutsch und Englisch; die übrigen Sprachen erst nach Jans Freigabe (bis dahin Rückfall Englisch).
// Rich-Markup: **fett**, `code`, *kursiv*, [label](/pfad). Keine geraden Anführungszeichen in Strings.
//
// INHALTSREGELN: Bilder mit Signalen/Spuren nur aus Jans eigenen Aufnahmen; andere Fahrer nur zusammengefasst
// und anonym (Fahrer A–E). Keine Namen, keine Session-Nummern Dritter, keine Orte. Zahlen aus docs/PUMP-GLEIT.md.
import type { Lang } from "../i18n";

export interface N6 {
  entwurf: string;
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
  entwurf: "Draft — not linked yet, numbers and wording may still change.",
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
    cap2: "Left: a bigger model learns its training riders better and better, but not a rider it has never seen. Middle: every additional rider still helps. Right: a small neural net on the raw signals did worse than the small tree model.",
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
      "**Not live yet.** The new detection runs as a preview. It will only replace the old counter after more checks.",
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
  entwurf: "Entwurf — noch nicht verlinkt, Zahlen und Formulierungen können sich noch ändern.",
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
    cap2: "Links: ein größeres Modell lernt seine Trainingsfahrer immer besser, einen fremden Fahrer aber nicht. Mitte: jeder weitere Fahrer hilft noch. Rechts: ein kleines neuronales Netz auf den Rohsignalen war schlechter als das kleine Baummodell.",
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
      "**Noch nicht live.** Die neue Erkennung läuft als Vorschau. Sie ersetzt den bisherigen Zähler erst nach weiteren Prüfungen.",
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

export const NERD6: Partial<Record<Lang, N6>> = { en, de };
