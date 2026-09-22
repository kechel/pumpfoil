// Inhalte für die Nerd-Analysen Teil 4 (Handy am Brett).
//
// NUR ENGLISCH, bewusst (Jan, 22.09.2026: „erstmal nur auf englisch"). Die Seite fällt für
// jede andere Sprache auf `en` zurück — das ist ehrlicher als eine maschinelle Übersetzung,
// die niemand gegengelesen hat, und die Struktur nimmt weitere Sprachen ohne Umbau auf.
// Rich-Markup in den Strings: **fett**, `code`, *kursiv*, [label](/pfad).
// Keine geraden Anführungszeichen (") in Strings — nur typografische.
import type { Lang } from "../i18n";

export interface N4 {
  back: string;
  h1: string;
  subtitle: string;
  intro: string;
  why: { h: string; p: string; p2: string; cap: string };
  setup: { h: string; p: string; capDeck: string; capRail: string };
  what: { h: string; p: string; li: string[]; cap: string; capTiles: string };
  mount: { h: string; p: string; p2: string; cap: string };
  heave: { h: string; p: string; p2: string; cap: string };
  found: { h: string; p: string; li: string[] };
  limits: { h: string; p: string; li: string[] };
  videorun: { h: string; p: string; cap: string };
  next: { h: string; p: string };
}

const en: N4 = {
  back: "← Part 3: The dual-watch measurement",
  h1: "Part 4: A phone taped to the board",
  subtitle: "What we can measure once the sensor stops riding on a wrist",
  intro:
    "Every number this site shows about pumping comes, in the end, from a sensor strapped to somebody's arm. That arm does its own thing: it swings, it braces, it reaches out for balance. For three parts of this series we worked around that. In September 2026 we stopped working around it and **taped a phone to the board** — GPS, accelerometer and gyroscope, 50 samples a second, bolted to the thing we actually want to know about. This part is what came out.",

  why: {
    h: "What the wrist can and cannot give",
    p:
      "The first surprise was a negative one, and it is worth stating plainly because we expected the opposite. We put the board recording next to a **Garmin on the wrist from the same ride, two minutes apart**, and compared what each sensor sees in the frequency domain. If the wrist were hopeless, the pump rhythm would be a smear there and a spike on the board.",
    p2:
      "It is a spike on **both**. Same peak, same 1.40 Hz, same height. The wrist finds the pumping cadence perfectly well — which is exactly why our pump counter works at all: on this ride the board recording counted **103 pumps** and the watch **106**, within three of each other. So the board is not needed to hear the rhythm. What it gives is something the wrist can never give: **the attitude of the board itself** — how far the nose dips, how far it rolls, how far the whole thing rises and falls. An arm cannot report that, no matter how good the sensor on it is.",
    cap: "Same ride, two sensors, 20 seconds of the longest run each. Both see 1.40 Hz.",
  },

  setup: {
    h: "The rig, such as it is",
    p:
      "There is no mount, no case, no bracket. The phone goes in a dry bag, the dry bag goes under a strap across the deck, and the strap goes tight enough that the phone cannot shift while the board is being thrown around. Total cost: one strap. The entire point is that this has to be something anyone can repeat on a Tuesday evening, because the data is only worth having if it can be collected more than once.",
    capDeck: "The whole setup: dry bag under a strap, across the deck, ahead of the mast.",
    capRail: "Strapped down and checked before the run — a phone that moves mid-ride ruins the recording.",
  },

  what: {
    h: "What a phone on the board records",
    p:
      "The phone writes the same upload format as every watch we support, plus one channel none of the watches have: **the gyroscope**. That extra channel is what makes the rest possible — a gyroscope measures rotation directly, without having to guess which part of a measured acceleration was gravity and which was movement. From the three raw streams we derive three angles and one distance:",
    li: [
      "**Pitch** — the nose going up and down. This *is* the pump stroke; everything else is secondary.",
      "**Roll** — the board leaning left and right. Carving, and the little corrections between strokes.",
      "**Yaw** — the heading change. Cross-checked against the GPS track, because both measure the same thing and must agree.",
      "**Heave** — how far the board actually rises and falls, in centimetres, from integrating the vertical acceleration twice.",
    ],
    cap: "One run, 28 seconds. The pitch trace is the pumping; the heave below it is the same rhythm, in centimetres.",
    capTiles: "The same three angles as the site shows them, live along the track.",
  },

  mount: {
    h: "The problem nobody warned us about: which way is the phone taped?",
    p:
      "A phone has no idea how it is stuck to a board. Tape it lengthwise and pitch is pitch. Tape it across and what the phone calls pitch is the board rolling. Tape it diagonally — which happened on the very first real ride — and a pure pitch oscillation shows up as **71 % pitch and 71 % roll at the same time**. Asking the rider to specify it works exactly until somebody re-tapes a wet phone with cold fingers.",
    p2:
      "So we let the data answer. Pumping is a rotation about the board’s transverse axis, and a gyroscope measures rotation directly. Rotate the measured signal through every possible mounting angle and ask where the pitch oscillation in the pump band (0.6–2.5 Hz) is strongest — that direction is the transverse axis. The picture below is that sweep for two rides: one phone taped across the board, one taped diagonally. Two rides, two clean peaks, no input from anyone. What the sweep cannot decide is nose-forward versus nose-backward, because that is the same axis; the first second of the run settles it, since a run starts with the nose dipping down.",
    cap: "Pitch energy in the pump band against the assumed mounting rotation. The peak is the answer.",
  },

  heave: {
    h: "Heave, and why the number needs a caveat",
    p:
      "How far does a board actually move up and down while you pump? Integrating acceleration twice gives an answer in centimetres, and it is the kind of number that looks authoritative and is quietly fragile. Anything slower than the band you keep gets amplified by the square of its period — a small drift at the low end comes out as metres of imaginary heave.",
    p2:
      "The levelling window sets that lower edge, and it is not a free parameter. Ask for the same run with a 1-second window and you get 18 cm; ask with 5 seconds and you get 33 cm, for the identical ride. We therefore derive the window from the **measured cadence** of that run — here 1.38 Hz, so 1.45 seconds — and we mark the number as unreliable whenever the motion sits too close to the edge. The honest reading of this chart is not *the heave is 20 cm*; it is *the heave is 20 cm when you define heave as the motion at pumping speed*.",
    cap: "The same run, the same data, six different levelling windows: 18 cm to 33 cm.",
  },

  found: {
    h: "What four rides have already told us",
    p:
      "This is a small pile of data — four board recordings — so these are observations, not laws. They are, however, the first numbers we have that describe the board rather than the rider.",
    li: [
      "**The mounting is found automatically and it is stable.** Across two runs of one ride the detected angle varied by 3°, which is computation noise, not the phone moving. Between rides it varied by exactly as much as the tape did.",
      "**Cadence is remarkably steady.** 1.38 and 1.39 Hz in two runs of one ride; 1.45 Hz on another. Pumping looks less like effort and more like a resonance somebody has found.",
      "**Heave is around 20 cm** at that cadence, measured bottom to top, with the caveat above.",
      "**Pitch swings about ±19°, roll about ±10°** in a clean run — the board is doing far more pitching than rolling, which is what the whole detection approach assumes and had never actually checked.",
    ],
  },

  limits: {
    h: "What this does not yet prove",
    p: "The list of things we cannot claim is longer than the list of things we can, and it should stay that way until the data grows:",
    li: [
      "**Four rides, one rider, one board, one lake.** Nothing here is validated across riders, and our pump counting is still calibrated on a single person — see [Part 3](/nerd-analysen-3) for how thin that ground is.",
      "**Glide detection still does not exist.** The number we show as longest glide is the longest gap between two *detected* pumps, which is not the same thing and never was.",
      "**Nobody rides with a phone taped to their board.** This is a measuring instrument, not a feature. Its job is to produce the truth that the watch on your wrist is measured against.",
    ],
  },

  videorun: {
    h: "The ride itself",
    p: "The explainer for this setup, filmed at the lake: what goes on the board, how it is fixed, and what comes back.",
    cap: "Phone on the board: GPS, gyroscope and acceleration, measured directly.",
  },

  next: {
    h: "Where this goes",
    p:
      "The point of a measuring instrument is to be pointed at something. The board data gives us, for the first time, a ground truth for two questions we have only ever estimated: **is this stroke a pump**, and **when did the board stop flying**. Both are counted on the wrist today and calibrated on one person. How that counting works is [Part 2](/nerd-analysen-2); how well it holds up against a second sensor is [Part 3](/nerd-analysen-3).",
  },
};

// Eine Sprache, absichtlich. Alle Sprachen zeigen `en`, bis jemand übersetzt und gegenliest.

const cs: N4 = {
  "back": "← Část 3: Měření se dvěma hodinkami",
  "h1": "Část 4: Telefon přilepený na prkno",
  "subtitle": "Co si můžeme změřit, jakmile senzor neseděl na zápěstí",
  "intro": "Každé číslo, které tento web ukazuje o pumpování, pochází nakonec ze senzoru přivázaného na něčí zápěstí. To zápěstí dělá svoje: kývá, tuhnout, natahuje se pro rovnováhu. Tři části dlouho jsme to obcházeli. V září 2026 jsme přestali a **přilepili jsme telefon na prkno** — GPS, akcelerometr a gyroskop, 50 vzorků za sekundu, připevněno k věci, kterou opravdu chceme znát. Tato část je to, co z toho vyšlo.",
  "why": {
    "h": "Co zápěstí může a nemůže",
    "p": "První překvapení bylo negativní a stojí za to to říci jasně, protože jsme očekávali opak. Dali jsme **Garmin na zápěstí vedle stejné jízdy, dvě minuty od sebe** a porovnali jsme, co každý senzor vidí ve frekvenční doméně. Kdyby bylo zápěstí beznadějné, byl by rytmus pumpování tam rozmazaný a na prkně ostrý.",
    "p2": "Je to ostrý **na obojím**. Stejný vrchol, stejných 1,40 Hz, stejná výška. Zápěstí najde rytmus pumpování dokonale — což je přesně důvod, proč náš čítač pumpů vůbec funguje: na této jízdě senzor na prkně spočítal **103 pumpů** a hodinky **106**, v rozmezí tří od sebe. Takže prkno není potřebné k slyšení rytmu. Ono dává něco, co zápěstí nikdy nemůže dát: **polohu samotného prkna** — jak daleko nos klesá, jak daleko se nakláníí, jak daleko se celá věc zvedá a spouští. Zápěstí to nemůže hlásit, bez ohledu na to jak dobrý senzor je.",
    "cap": "Stejná jízda, dva senzory, 20 sekund nejdelší jízdy každý. Oba vidí 1,40 Hz."
  },
  "what": {
    "h": "Co si telefon na prkně zaznamenává",
    "p": "Telefon zapisuje stejný formát nahrávky jako každé hodinky, která podporujeme, plus jeden kanál, který žádné hodinky nemají: **gyroskop**. Tento dodatečný kanál je to, co zbytek umožňuje — gyroskop měří rotaci přímo, bez toho aby se muselo hádat jaká část měřeného zrychlení je gravitace a jaká pohyb. Ze tří surových proudů odvozujeme tři úhly a jednu vzdálenost:",
    "li": [
      "**Pitch** — nos nahoru a dolů. Toto *je* tah pumpování; všechno ostatní je druhotné.",
      "**Roll** — prkno se klonící vlevo a vpravo. Carving a malé korekce mezi údery.",
      "**Yaw** — změna kurzu. Křížem ověřeno proti GPS trati, protože oboje měří totéž a musí se shodovat.",
      "**Heave** — jak daleko se prkno skutečně zvedá a spouští, v centimetrech, integrací vertikálního zrychlení dvakrát."
    ],
    "cap": "Jedna jízda, 28 sekund. Pitch křivka je pumpování; heave pod ní je stejný rytmus, v centimetrech.",
    "capTiles": "Stejné tři úhly, jak je web ukazuje, naživo podél trasy."
  },
  "mount": {
    "h": "Problém, varoval nás nikdo: kterým způsobem byl telefon přilepený?",
    "p": "Telefon neví, jak je na prkno přilepený. Přilepte ho podélně a pitch je pitch. Přilepte ho příčně a to, co telefon nazývá pitchem, je prkno, které se nakláníí. Přilepte ho diagonálně — což se stalo na úplně první skutečné jízdě — a čistá pitch-oscilace se objeví jako **71 % pitch a 71 % roll současně**. Požádání jezdce aby to určil funguje přesně až do chvíle, kdy někdo znovu přilepí mokrý telefon chladnými prsty.",
    "p2": "Takže necháme data odpovídat. Pumpování je rotace kolem příčné osy prkna, a gyroskop měří rotaci přímo. Otočte měřený signál přes všechny možné úhly montáže a zeptejte se kde je pitch-oscilace v pumpovacím pásmu (0,6–2,5 Hz) nejsilnější — ten směr je příčná osa. Obrázek níže je ten průchod pro dvě jízdy: jeden telefon přilepený příčně na prkno, jeden diagonálně. Dvě jízdy, dva čisté huippy, žádný vstup od nikoho. Co průchod nemůže určit je nos-vpřed versus nos-vzad, protože to je stejná osa; prvních pár sekund jízdy to vyřeší, protože jízda začíná nosem, který klesá dolů.",
    "cap": "Pitch-energie v pumpovacím pásmu proti předpokládané rotaci montáže. Vrchol je odpověď."
  },
  "heave": {
    "h": "Heave a proč číslo vyžaduje upozornění",
    "p": "Jak daleko se prkno skutečně zvedá a spouští, když pumpujete? Dvojí integrace zrychlení dává odpověď v centimetrech, a je to druh čísla, který vypadá autoritativně a je tiše křehký. Cokoli pomalejší než pásmo, které držíte, se zesílí druhou mocninou jeho periody — malý drift na spodním konci vyjde jako metry imaginárního heave.",
    "p2": "Okno vyrovnání nastavuje tuto dolní hranici a není to volný parametr. Požádejte stejnou jízdu s oknem 1 sekundy a dostanete 18 cm; požádejte s 5 sekundami a dostanete 33 cm, pro stejnou jízdu. Okno tedy odvozujeme ze **změ možné kadence** té jízdy — zde 1,38 Hz, takže 1,45 sekundy — a číslo označíme jako nespolehlivé, když se pohyb nachází příliš blízko hrany. Čestné čtení tohoto grafu není *heave je 20 cm*; je to *heave je 20 cm když definujete heave jako pohyb na pumpovací rychlosti*.",
    "cap": "Stejná jízda, stejná data, šest různých oken vyrovnání: 18 cm až 33 cm."
  },
  "found": {
    "h": "Co čtyři jízdy nám již řekly",
    "p": "Toto je malá hromada údajů — čtyři záznamy na prkně — takže to jsou pozorování, ne zákony. Jsou to však první čísla, která máme popisující prkno spíše než jezdce.",
    "li": [
      "**Montáž se nalezne automaticky a je stabilní.** Během dvou jízd z jedné stezky se zjištěný úhel lišil o 3°, což je výpočetní šum, ne pohyb telefonu. Mezi jízdami se lišilo přesně tolik co páska.",
      "**Kadence je nápadně stabilní.** 1,38 a 1,39 Hz ve dvou jízdách z jedné stezky; 1,45 Hz na jiné. Pumpování vypadá méně jako úsilí a více jako rezonance, kterou si někdo našel.",
      "**Heave je kolem 20 cm** v té kadenci, měřeno zespod nahoru, s upozorněním výše.",
      "**Pitch se pohybuje kolem ±19°, roll kolem ±10°** v čisté jízdě — prkno dělá mnohem více pitchování než rolování, což je přesně to, co celý detekční přístup předpokládá a nikdy to opravdu nekontroloval."
    ]
  },
  "limits": {
    "h": "Cos to zatím neprokazuje",
    "p": "Seznam věcí, které nemůžeme tvrdit, je delší než seznam věcí, které můžeme, a měl by takto zůstat dokud data nerostou:",
    "li": [
      "**Čtyři jízdy, jeden jezdec, jedno prkno, jedno jezero.** Nic zde není ověřeno mezi jezdci a náš čítač pumpů je stále kalibrován na jednu osobu — podívejte se na [Část 3](/nerd-analysen-3) jak tenký je ten základ.",
      "**Detekce klouzání ještě neexistuje.** Číslo, které ukazujeme jako nejdelší klouzání, je největší mezera mezi dvěma *detekovanými* pumpami, což není totéž a nikdy nebylo.",
      "**Nikdo nejezdí s telefonem přilepeným na své prkno.** Toto je měřicí přístroj, ne funkce. Jeho úkolem je vytvořit pravdu, proti které se měří hodinky na tvém zápěstí."
    ]
  },
  "videorun": {
    "h": "Samotná jízda",
    "p": "Vysvětlení pro toto nastavení, natočené u jezera: co jde na prkno, jak je to připevněno a co se vrací.",
    "cap": "Telefon na prkně: GPS, gyroskop a zrychlení, měřeno přímo."
  },
  "next": {
    "h": "Kde to jde dál",
    "p": "Smysl měřicího přístroje je na něco ukazovat. Data z prkna nám dávají poprvé základní pravdu pro dvě otázky, které jsme pouze odhadovali: **je to pumpnutí**, a **kdy přestalo prkno létat**. Oboje se počítají na zápěstí dnes a je to kalibrováno na jednu osobu. Jak funguje počítání je [Část 2](/nerd-analysen-2); jak dobře se to drží proti druhému senzoru je [Část 3](/nerd-analysen-3)."
  },
  "setup": {
    "h": "Výstroj, jaká je",
    "p": "Není žádná montáž, žádný obal, žádný držák. Telefon jde do voděodolného pytlíku, voděodolný pytlík jde pod pásek přes desku a pásek se utáhne natolik, aby se telefon nemohl pohybovat, když se prkno motá. Celkové náklady: jeden pásek. Celý smysl je, že to musí být něco, co si každý může zopakovat v úterý večer, protože údaje jsou cenné jen tehdy, když je lze sbírat více než jednou.",
    "capDeck": "Celá výstroj: voděodolný pytlík pod páskem, přes desku, před stožárem.",
    "capRail": "Upevněno a zkontrolováno před jízdou — telefon, který se během jízdy pohybuje, zničí záznam."
  }
};


const deAT: N4 = {
  "back": "← Teil 3: Die Doppeluhr-Messung",
  "h1": "Teil 4: Ein Handy am Board",
  "subtitle": "Was wir messen, wenn der Sensor vom Handgelenk runter ans Board kommt",
  "intro": "Jede Zahl auf dieser Seite über das Pumpen kommt letztlich von einem Sensor am Handgelenk. Das Handgelenk macht sein eigenes Ding: es schwingt, es stützt ab, es streckt sich zur Balance aus. Drei Teile dieser Serie haben wir darum herum gebaut. Im September 2026 haben wir damit aufgehört und **ein Handy ans Board geklebt** — GPS, Beschleunigungssensor und Gyroskop, 50 Samples pro Sekunde, festgeklebt an dem Ding, das wir eigentlich verstehen wollen. Das ist, was dabei heraus kam.",
  "why": {
    "h": "Was das Handgelenk kann und nicht kann",
    "p": "Die erste Überraschung war eine negative, und sie ist wert, klar ausgesprochen zu werden, weil wir das Gegenteil erwartet haben. Wir haben den Board-Recorder neben einer **Garmin am Handgelenk aus derselben Fahrt, zwei Minuten Abstand**, aufgezeichnet und verglichen, was jeder Sensor im Frequenzbereich sieht. Wenn das Handgelenk hoffnungslos wäre, würde der Pump-Rhythmus dort ein Schmier-Bereich sein und hier ein Peak.",
    "p2": "Es ist ein Peak auf **beiden**. Gleicher Peak, gleiche 1,40 Hz, gleiche Höhe. Das Handgelenk findet die Pump-Kadenz völlig einwandfrei — genau deswegen funktioniert unser Pump-Zähler überhaupt: bei dieser Fahrt zählte der Board-Recorder **103 Pumps** und die Uhr **106**, mit drei Differenz. Das Board ist also nicht nötig, um den Rhythmus zu hören. Was es gibt, ist etwas, das das Handgelenk nie geben kann: **die Haltung des Boards selbst** — wie weit die Spitze eintaucht, wie weit es sich neigt, wie weit das Ganze auf und ab geht. Ein Arm kann das nicht melden, egal wie gut der Sensor auf ihm ist.",
    "cap": "Gleiche Fahrt, zwei Sensoren, je 20 Sekunden des längsten Laufs. Beide sehen 1,40 Hz."
  },
  "setup": {
    "h": "Das Rig, wie es ist",
    "p": "Es gibt keine Halterung, kein Gehäuse, keine Klammer. Das Handy kommt in einen Dry Bag, der Dry Bag kommt unter einen Gurt über das Deck, und der Gurt wird so straff, dass sich das Handy nicht bewegt, während das Board herumgeworfen wird. Gesamtkosten: ein Gurt. Der ganze Punkt ist, dass das etwas sein muss, das jeder an einem Dienstagabend wiederholen kann, weil die Daten nur wert sind, wenn sie mehr als einmal gesammelt werden können.",
    "capDeck": "Das komplette Setup: Dry Bag unter einem Gurt, über das Deck, vor dem Mast.",
    "capRail": "Festgegurtet und vor dem Lauf überprüft — ein Handy, das sich während der Fahrt bewegt, ruiniert die Aufzeichnung."
  },
  "what": {
    "h": "Was ein Handy am Board aufzeichnet",
    "p": "Das Handy schreibt dasselbe Upload-Format wie jede Uhr, die wir unterstützen, plus einen Kanal, den keine Uhr hat: **das Gyroskop**. Der Extra-Kanal ist das, was den Rest möglich macht — ein Gyroskop misst Rotation direkt, ohne raten zu müssen, welcher Teil einer gemessenen Beschleunigung Schwerkraft ist und welcher Bewegung. Aus den drei rohen Strömen leiten wir drei Winkel und eine Entfernung ab:",
    "li": [
      "**Pitch** — die Spitze geht auf und ab. Das *ist* der Pump-Schlag; alles andere ist Nebensache.",
      "**Roll** — das Board lehnt sich links und rechts. Kurvenfahrt und die kleinen Korrektionen zwischen Schlägen.",
      "**Yaw** — die Richtungsänderung. Abgeglichen gegen die GPS-Spur, weil beide dasselbe messen und übereinstimmen müssen.",
      "**Heave** — wie weit das Board tatsächlich auf und ab geht, in Zentimetern, aus zweifacher Integration der vertikalen Beschleunigung."
    ],
    "cap": "Ein Lauf, 28 Sekunden. Die Pitch-Spur ist das Pumpen; das Heave darunter ist derselbe Rhythmus, in Zentimetern.",
    "capTiles": "Die gleichen drei Winkel, wie die Seite sie zeigt, live entlang der Spur."
  },
  "mount": {
    "h": "Das Problem, vor dem uns niemand gewarnt hat: welche Richtung ist das Handy geklebt?",
    "p": "Ein Handy hat keine Ahnung, wie es auf einem Board festgeklebt ist. Kleb es längs und Pitch ist Pitch. Kleb es quer und was das Handy Pitch nennt, ist das Board, das sich neigt. Kleb es diagonal — was beim ersten echten Lauf passiert ist — und eine reine Pitch-Oszillation taucht auf als **71 % Pitch und 71 % Roll gleichzeitig**. Den Fahrer bitten, es anzugeben, funktioniert genau so lange, bis jemand ein nasses Handy mit kalten Fingern neu beklebt.",
    "p2": "Also lassen wir die Daten antworten. Pumpen ist eine Rotation um die Querachse des Boards, und ein Gyroskop misst Rotation direkt. Dreh das gemessene Signal durch jeden möglichen Befestigungswinkel und frag, wo die Pitch-Oszillation im Pump-Band (0,6–2,5 Hz) am stärksten ist — die Richtung ist die Querachse. Das Bild unten ist dieser Durchsatz für zwei Fahrten: ein Handy quer aufs Board geklebt, eines diagonal. Zwei Fahrten, zwei saubere Peaks, kein Input von irgendjemand. Was der Durchsatz nicht unterscheiden kann, ist Spitze-voraus gegen Spitze-zurück, weil das dieselbe Achse ist; die erste Sekunde des Laufs klärt es, weil ein Lauf mit der Spitze nach unten anfängt.",
    "cap": "Pitch-Energie im Pump-Band gegen die angenommene Befestigungs-Rotation. Der Peak ist die Antwort."
  },
  "heave": {
    "h": "Heave, und warum die Zahl einen Vorbehalt braucht",
    "p": "Wie weit bewegt sich ein Board tatsächlich auf und ab, während du pumpst? Zweifache Integration der Beschleunigung gibt eine Antwort in Zentimetern, und sie ist die Art von Zahl, die autoritativ aussieht und still zerbrechlich ist. Alles, das langsamer ist als das Band, das du hältst, wird um das Quadrat seiner Periode verstärkt — ein kleine Drift am unteren Ende kommt als Meter aus imaginärem Heave heraus.",
    "p2": "Das Ausgleichs-Fenster setzt diese untere Kante, und es ist kein freier Parameter. Frag nach demselben Lauf mit einem 1-Sekunden-Fenster und du bekommst 18 cm; frag mit 5 Sekunden und du bekommst 33 cm, für die identische Fahrt. Wir leiten das Fenster daher aus der **gemessenen Kadenz** dieses Laufs ab — hier 1,38 Hz, also 1,45 Sekunden — und wir kennzeichnen die Zahl als unzuverlässig, wann immer die Bewegung zu nah an der Kante sitzt. Die ehrliche Lesart dieses Diagramms ist nicht *das Heave ist 20 cm*; es ist *das Heave ist 20 cm, wenn du Heave als die Bewegung bei Pump-Geschwindigkeit definierst*.",
    "cap": "Derselbe Lauf, dieselben Daten, sechs verschiedene Ausgleichs-Fenster: 18 cm bis 33 cm."
  },
  "found": {
    "h": "Was vier Fahrten uns schon erzählt haben",
    "p": "Das ist ein kleiner Haufen von Daten — vier Board-Aufzeichnungen — also sind das Beobachtungen, nicht Gesetze. Sie sind aber die ersten Zahlen, die wir haben, die das Board beschreiben, nicht den Fahrer.",
    "li": [
      "**Die Befestigung wird automatisch gefunden und ist stabil.** Über zwei Läufe einer Fahrt variierte der erkannte Winkel um 3°, das ist Rechenrauschen, nicht das Handy, das sich bewegt. Zwischen Fahrten variierte es um genau so viel wie das Klebeband.",
      "**Kadenz ist bemerkenswert stabil.** 1,38 und 1,39 Hz in zwei Läufen einer Fahrt; 1,45 Hz bei einer anderen. Pumpen sieht weniger nach Anstrengung aus und mehr nach einer Resonanz, die jemand gefunden hat.",
      "**Heave ist um die 20 cm** bei dieser Kadenz, gemessen von unten bis oben, mit dem Vorbehalt oben.",
      "**Pitch schwingt etwa ±19°, Roll etwa ±10°** in einem sauberen Lauf — das Board macht viel mehr Pitching als Rolling, das ist genau das, was der ganze Erkennungs-Ansatz annimmt und nie wirklich überprüft hat."
    ]
  },
  "limits": {
    "h": "Was das noch nicht beweist",
    "p": "Die Liste der Dinge, die wir nicht behaupten können, ist länger als die Liste der Dinge, die wir können, und sie sollte so bleiben, bis die Daten wachsen:",
    "li": [
      "**Vier Fahrten, ein Fahrer, ein Board, ein See.** Nichts hier ist über Fahrer validiert, und unsere Pump-Zählung ist immer noch auf einer Person geeicht — siehe [Teil 3](/nerd-analysen-3) für wie dünn dieser Grund ist.",
      "**Gleit-Erkennung existiert immer noch nicht.** Die Zahl, die wir als längste Gleitphase zeigen, ist die längste Lücke zwischen zwei *erkannten* Pumps, das ist nicht dasselbe und war nie so.",
      "**Niemand fährt mit einem Handy, das ans Board geklebt ist.** Das ist ein Messinstrument, kein Feature. Seine Aufgabe ist es, die Wahrheit zu produzieren, gegen die der Sensor auf deinem Handgelenk gemessen wird."
    ]
  },
  "videorun": {
    "h": "Die Fahrt selbst",
    "p": "Die Erklärung für dieses Setup, gefilmt am See: was ans Board kommt, wie es befestigt wird, und was rauskommt.",
    "cap": "Handy am Board: GPS, Gyroskop und Beschleunigung, direkt gemessen."
  },
  "next": {
    "h": "Wo das hingeht",
    "p": "Der Sinn eines Messinstruments ist, auf etwas gerichtet zu werden. Die Board-Daten geben uns zum ersten Mal eine Grundwahrheit für zwei Fragen, die wir nur geschätzt haben: **ist dieser Schlag ein Pump**, und **wann ist das Board aufgehört zu fliegen**. Beides wird heute am Handgelenk gezählt und auf einer Person geeicht. Wie diese Zählung funktioniert, ist [Teil 2](/nerd-analysen-2); wie gut sie gegen einen zweiten Sensor hält, ist [Teil 3](/nerd-analysen-3)."
  }
};


const de: N4 = {
  "back": "← Teil 3: Die Doppeluhr-Messung",
  "h1": "Teil 4: Ein Handy am Board",
  "subtitle": "Was wir messen, wenn der Sensor vom Handgelenk runter ans Board kommt",
  "intro": "Jede Zahl auf dieser Seite über das Pumpen kommt letztlich von einem Sensor am Handgelenk. Das Handgelenk macht sein eigenes Ding: es schwingt, es stützt ab, es streckt sich zur Balance aus. Drei Teile dieser Serie haben wir darum herum gebaut. Im September 2026 haben wir damit aufgehört und **ein Handy ans Board geklebt** — GPS, Beschleunigungssensor und Gyroskop, 50 Samples pro Sekunde, festgeklebt an dem Ding, das wir eigentlich verstehen wollen. Das ist, was dabei heraus kam.",
  "why": {
    "h": "Was das Handgelenk kann und nicht kann",
    "p": "Die erste Überraschung war eine negative, und sie ist wert, klar ausgesprochen zu werden, weil wir das Gegenteil erwartet haben. Wir haben den Board-Recorder neben einer **Garmin am Handgelenk aus derselben Fahrt, zwei Minuten Abstand**, aufgezeichnet und verglichen, was jeder Sensor im Frequenzbereich sieht. Wenn das Handgelenk hoffnungslos wäre, würde der Pump-Rhythmus dort ein Schmier-Bereich sein und hier ein Peak.",
    "p2": "Es ist ein Peak auf **beiden**. Gleicher Peak, gleiche 1,40 Hz, gleiche Höhe. Das Handgelenk findet die Pump-Kadenz völlig einwandfrei — genau deswegen funktioniert unser Pump-Zähler überhaupt: bei dieser Fahrt zählte der Board-Recorder **103 Pumps** und die Uhr **106**, mit drei Differenz. Das Board ist also nicht nötig, um den Rhythmus zu hören. Was es gibt, ist etwas, das das Handgelenk nie geben kann: **die Einstellung des Boards selbst** — wie weit die Spitze eintaucht, wie weit es sich neigt, wie weit das Ganze auf und ab geht. Ein Arm kann das nicht melden, egal wie gut der Sensor auf ihm ist.",
    "cap": "Gleiche Fahrt, zwei Sensoren, je 20 Sekunden des längsten Laufs. Beide sehen 1,40 Hz."
  },
  "setup": {
    "h": "Das Rig, wie es ist",
    "p": "Es gibt keine Halterung, kein Gehäuse, keine Klammer. Das Handy kommt in einen Dry Bag, der Dry Bag kommt unter einen Gurt über das Deck, und der Gurt wird so straff, dass sich das Handy nicht bewegt, während das Board herumgeworfen wird. Gesamtkosten: ein Gurt. Der ganze Punkt ist, dass das etwas sein muss, das jeder an einem Dienstagabend wiederholen kann, weil die Daten nur wert sind, wenn sie mehr als einmal gesammelt werden können.",
    "capDeck": "Das komplette Setup: Dry Bag unter einem Gurt, über das Deck, vor dem Mast.",
    "capRail": "Festgegurtet und vor dem Lauf überprüft — ein Handy, das sich während der Fahrt bewegt, ruiniert die Aufzeichnung."
  },
  "what": {
    "h": "Was ein Handy am Board aufzeichnet",
    "p": "Das Handy schreibt dasselbe Upload-Format wie jede Uhr, die wir unterstützen, plus einen Kanal, den keine Uhr hat: **das Gyroskop**. Der Extra-Kanal ist das, was den Rest möglich macht — ein Gyroskop misst Rotation direkt, ohne raten zu müssen, welcher Teil einer gemessenen Beschleunigung Schwerkraft ist und welcher Bewegung. Aus den drei rohen Strömen leiten wir drei Winkel und eine Entfernung ab:",
    "li": [
      "**Pitch** — die Spitze geht auf und ab. Das *ist* der Pump-Schlag; alles andere ist Nebensache.",
      "**Roll** — das Board lehnt sich links und rechts. Kurvenfahrt und die kleinen Korrektionen zwischen Schlägen.",
      "**Yaw** — die Richtungsänderung. Abgeglichen gegen die GPS-Spur, weil beide dasselbe messen und übereinstimmen müssen.",
      "**Heave** — wie weit das Board tatsächlich auf und ab geht, in Zentimetern, aus zweifacher Integration der vertikalen Beschleunigung."
    ],
    "cap": "Ein Lauf, 28 Sekunden. Die Pitch-Spur ist das Pumpen; das Heave darunter ist derselbe Rhythmus, in Zentimetern.",
    "capTiles": "Die gleichen drei Winkel, wie die Seite sie zeigt, live entlang der Spur."
  },
  "mount": {
    "h": "Das Problem, vor dem uns niemand gewarnt hat: welche Richtung ist das Handy geklebt?",
    "p": "Ein Handy hat keine Ahnung, wie es auf einem Board festklebt. Kleb es längslaufen und Pitch ist Pitch. Kleb es quer und was das Handy Pitch nennt, ist das Board, das sich neigt. Kleb es diagonal — was beim ersten echten Lauf passiert ist — und eine reine Pitch-Oszillation taucht auf als **71 % Pitch und 71 % Roll gleichzeitig**. Den Fahrer bitten, es anzugeben, funktioniert genau so lange, bis jemand ein nasses Handy mit kalten Fingern neu beklebt.",
    "p2": "Also lassen wir die Daten antworten. Pumpen ist eine Rotation um die Querachse des Boards, und ein Gyroskop misst Rotation direkt. Dreh das gemessene Signal durch jeden möglichen Befestigungswinkel und frag, wo die Pitch-Oszillation im Pump-Band (0,6–2,5 Hz) am stärksten ist — die Richtung ist die Querachse. Das Bild unten ist dieser Durchsatz für zwei Fahrten: ein Handy quer aufs Board geklebt, eines diagonal. Zwei Fahrten, zwei saubere Peaks, kein Input von irgendjemand. Was der Durchsatz nicht unterscheiden kann, ist Spitze-voraus gegen Spitze-zurück, weil das dieselbe Achse ist; die erste Sekunde des Laufs klärt es, weil ein Lauf mit der Spitze nach unten anfängt.",
    "cap": "Pitch-Energie im Pump-Band gegen die angenommene Befestigungs-Rotation. Der Peak ist die Antwort."
  },
  "heave": {
    "h": "Heave, und warum die Zahl einen Vorbehalt braucht",
    "p": "Wie weit bewegt sich ein Board tatsächlich auf und ab, während du pumpst? Zweifache Integration der Beschleunigung gibt eine Antwort in Zentimetern, und sie ist die Art von Zahl, die autoritativ aussieht und still zerbrechlich ist. Alles, das langsamer ist als das Band, das du hältst, wird um das Quadrat seiner Periode verstärkt — ein kleine Drift am unteren Ende kommt als Meter aus imaginärem Heave heraus.",
    "p2": "Das Ausgleichs-Fenster setzt diese untere Kante, und es ist kein freier Parameter. Frag nach demselben Lauf mit einem 1-Sekunden-Fenster und du bekommst 18 cm; frag mit 5 Sekunden und du bekommst 33 cm, für die identische Fahrt. Wir leiten das Fenster daher aus der **gemessenen Kadenz** dieses Laufs ab — hier 1,38 Hz, also 1,45 Sekunden — und wir kennzeichnen die Zahl als unzuverlässig, wann immer die Bewegung zu nah an der Kante sitzt. Die ehrliche Lesart dieses Diagramms ist nicht *das Heave ist 20 cm*; es ist *das Heave ist 20 cm, wenn du Heave als die Bewegung bei Pump-Geschwindigkeit definierst*.",
    "cap": "Derselbe Lauf, dieselben Daten, sechs verschiedene Ausgleichs-Fenster: 18 cm bis 33 cm."
  },
  "found": {
    "h": "Was vier Fahrten uns schon erzählt haben",
    "p": "Das ist ein kleiner Haufen von Daten — vier Board-Aufzeichnungen — also sind das Beobachtungen, nicht Gesetze. Sie sind aber die ersten Zahlen, die wir haben, die das Board beschreiben, nicht den Fahrer.",
    "li": [
      "**Die Befestigung wird automatisch gefunden und ist stabil.** Über zwei Läufe einer Fahrt variierte der erkannte Winkel um 3°, das ist Rechenrauschen, nicht das Handy, das sich bewegt. Zwischen Fahrten variierte es um genau so viel wie das Klebeband.",
      "**Kadenz ist bemerkenswert stabil.** 1,38 und 1,39 Hz in zwei Läufen einer Fahrt; 1,45 Hz bei einer anderen. Pumpen sieht weniger nach Anstrengung aus und mehr nach einer Resonanz, die jemand gefunden hat.",
      "**Heave ist um die 20 cm** bei dieser Kadenz, gemessen von unten bis oben, mit dem Vorbehalt oben.",
      "**Pitch schwingt etwa ±19°, Roll etwa ±10°** in einem sauberen Lauf — das Board macht viel mehr Pitching als Rolling, das ist genau das, was der ganze Erkennungs-Ansatz annimmt und nie wirklich überprüft hat."
    ]
  },
  "limits": {
    "h": "Was das noch nicht beweist",
    "p": "Die Liste der Dinge, die wir nicht behaupten können, ist länger als die Liste der Dinge, die wir können, und sie sollte so bleiben, bis die Daten wachsen:",
    "li": [
      "**Vier Fahrten, ein Fahrer, ein Board, ein See.** Nichts hier ist über Fahrer validiert, und unsere Pump-Zählung ist immer noch auf einer Person geeicht — siehe [Teil 3](/nerd-analysen-3) für wie dünn dieser Grund ist.",
      "**Gleit-Erkennung existiert immer noch nicht.** Die Zahl, die wir als längste Gleitphase zeigen, ist die längste Lücke zwischen zwei *erkannten* Pumps, das ist nicht dasselbe und war nie so.",
      "**Niemand fährt mit einem Handy, das ans Board geklebt ist.** Das ist ein Messinstrument, kein Feature. Seine Aufgabe ist es, die Wahrheit zu produzieren, gegen die der Sensor auf deinem Handgelenk gemessen wird."
    ]
  },
  "videorun": {
    "h": "Die Fahrt selbst",
    "p": "Die Erklärung für dieses Setup, gefilmt am See: was ans Board kommt, wie es befestigt wird, und was rauskommt.",
    "cap": "Handy am Board: GPS, Gyroskop und Beschleunigung, direkt gemessen."
  },
  "next": {
    "h": "Wo das hingeht",
    "p": "Der Sinn eines Messinstruments ist, auf etwas gerichtet zu werden. Die Board-Daten geben uns zum ersten Mal eine Grundwahrheit für zwei Fragen, die wir nur geschätzt haben: **ist dieser Schlag ein Pump**, und **wann ist das Board aufgehört zu fliegen**. Beides wird heute am Handgelenk gezählt und auf einer Person geeicht. Wie diese Zählung funktioniert, ist [Teil 2](/nerd-analysen-2); wie gut sie gegen einen zweiten Sensor hält, ist [Teil 3](/nerd-analysen-3)."
  }
};


const es: N4 = {
  "back": "← Parte 3: La medición con dos relojes",
  "h1": "Parte 4: Un móvil pegado a la tabla",
  "subtitle": "Qué se puede medir una vez que el sensor deja la muñeca",
  "intro": "Cada número que este sitio muestra sobre propulsión viene, en última instancia, de un sensor atado a un brazo. Ese brazo hace lo suyo: se balancea, se tensa, se extiende para mantener el equilibrio. Durante tres partes de esta serie hemos trabajado alrededor de eso. En septiembre de 2026 dejamos de hacerlo y **pegamos un móvil a la tabla** — GPS, acelerómetro y giroscopio, 50 muestras por segundo, atornillado a la cosa que realmente queremos medir. Esto es lo que salió de ahí.",
  "why": {
    "h": "Lo que la muñeca puede y no puede dar",
    "p": "La primera sorpresa fue negativa, y vale la pena decirlo claramente porque esperábamos lo contrario. Pusimos la grabación de tabla junto a un **Garmin en la muñeca del mismo run, dos minutos de intervalo**, y comparamos lo que cada sensor ve en el dominio frecuencial. Si la muñeca fuera inútil, el ritmo de pump sería ruido allí y un pico en la tabla.",
    "p2": "Es un pico en **ambos**. El mismo pico, los mismos 1,40 Hz, la misma altura. La muñeca encuentra el ritmo de pump perfectamente bien — que es exactamente por qué nuestro contador de pump funciona en absoluto: en este run la grabación de tabla contó **103 pumps** y el reloj **106**, dentro de tres. Así que la tabla no es necesaria para escuchar el ritmo. Lo que da es algo que la muñeca nunca puede dar: **la actitud de la tabla misma** — cuánto baja la proa, cuánto se inclina, cuánto sube y baja todo. Un brazo no puede informar de eso, sin importar lo bueno que sea el sensor.",
    "cap": "Mismo run, dos sensores, 20 segundos del más largo run cada uno. Ambos ven 1,40 Hz."
  },
  "setup": {
    "h": "El rig, tal como es",
    "p": "No hay soporte, no hay funda, no hay abrazadera. El móvil entra en una bolsa estanca, la bolsa estanca va bajo una correa a través de la cubierta, y la correa se aprieta lo suficiente para que el móvil no se mueva mientras la tabla es arrojada. Costo total: una correa. Todo el punto es que tiene que ser algo que cualquiera pueda repetir un martes por la noche, porque los datos solo merecen ser recopilados si se pueden recopilar más de una vez.",
    "capDeck": "El setup completo: bolsa estanca bajo una correa, a través de la cubierta, por delante del mástil.",
    "capRail": "Asegurado y comprobado antes del run — un móvil que se mueve en mitad del run arruina la grabación."
  },
  "what": {
    "h": "Lo que registra un móvil en la tabla",
    "p": "El móvil escribe el mismo formato de carga que todos los relojes que soportamos, más un canal que ninguno de los relojes tiene: **el giroscopio**. Ese canal extra es lo que hace posible el resto — un giroscopio mide rotación directamente, sin tener que adivinar qué parte de una aceleración medida era gravedad y cuál era movimiento. De los tres flujos crudos derivamos tres ángulos y una distancia:",
    "li": [
      "**Cabeceo** — la proa que sube y baja. Esto *es* el golpe de pump; todo lo demás es secundario.",
      "**Balanceo** — la tabla que se inclina izquierda y derecha. Carving, y las pequeñas correcciones entre golpes.",
      "**Guiñada** — el cambio de rumbo. Verificado contra la traza GPS, porque ambos miden lo mismo y deben coincidir.",
      "**Heave** — cuánto sube y baja la tabla realmente, en centímetros, integrando la aceleración vertical dos veces."
    ],
    "cap": "Un run, 28 segundos. La traza de cabeceo es la propulsión; el heave debajo es el mismo ritmo, en centímetros.",
    "capTiles": "Los mismos tres ángulos como los muestra el sitio, en directo a lo largo de la traza."
  },
  "mount": {
    "h": "El problema que nadie nos advirtió: ¿de qué manera está pegado el móvil?",
    "p": "Un móvil no tiene idea de cómo está pegado a una tabla. Pégalo a lo largo y el cabeceo es cabeceo. Pégalo transversalmente y lo que el móvil llama cabeceo es la tabla inclinándose. Pégalo diagonalmente — lo que pasó en el primer run real — y una oscilación de cabeceo puro aparece como **71% cabeceo y 71% balanceo simultáneamente**. Pedir al rider que lo especifique funciona exactamente hasta que alguien repega un móvil mojado con dedos congelados.",
    "p2": "Así que dejamos que los datos respondan. La propulsión es una rotación sobre el eje transversal de la tabla, y un giroscopio mide rotación directamente. Rota la señal medida a través de cada ángulo de montaje posible y pregunta dónde la oscilación de cabeceo en la banda de pump (0,6–2,5 Hz) es más fuerte — esa dirección es el eje transversal. La imagen debajo es ese barrido para dos run: un móvil pegado transversalmente a la tabla, uno pegado diagonalmente. Dos run, dos picos limpios, ninguna intervención de nadie. Lo que el barrido no puede decidir es proa hacia adelante o proa hacia atrás, porque es el mismo eje; el primer segundo del run lo decide, ya que un run comienza con la proa bajando.",
    "cap": "Energía de cabeceo en la banda de pump contra la rotación de montaje asumida. El pico es la respuesta."
  },
  "heave": {
    "h": "Heave, y por qué el número necesita una advertencia",
    "p": "¿Cuánto sube y baja una tabla realmente mientras bombeas? Integrar la aceleración dos veces da una respuesta en centímetros, y es el tipo de número que se ve autoritario y es tranquilamente frágil. Todo lo más lento que la banda que mantienes se amplifica por el cuadrado de su período — una pequeña deriva en el extremo bajo sale como metros de heave imaginario.",
    "p2": "La ventana de nivelación establece ese borde inferior, y no es un parámetro libre. Pide el mismo run con una ventana de 1 segundo y obtienes 18 cm; pide con 5 segundos y obtienes 33 cm, para el run idéntico. Por lo tanto, derivamos la ventana de la **cadencia medida** de ese run — aquí 1,38 Hz, así 1,45 segundos — y marcamos el número como poco confiable cuando el movimiento se sienta demasiado cerca del borde. La lectura honesta de este gráfico no es *el heave es 20 cm*; es *el heave es 20 cm cuando defines heave como el movimiento a velocidad de pump*.",
    "cap": "El mismo run, los mismos datos, seis ventanas de nivelación diferentes: 18 cm a 33 cm."
  },
  "found": {
    "h": "Lo que cuatro run ya nos han dicho",
    "p": "Este es un pequeño montón de datos — cuatro grabaciones de tabla — así que estas son observaciones, no leyes. Sin embargo, son los primeros números que tenemos que describen la tabla en lugar del rider.",
    "li": [
      "**El montaje se encuentra automáticamente y es estable.** A lo largo de dos run de un run el ángulo detectado varió 3°, que es ruido computacional, no el móvil moviéndose. Entre run varió exactamente tanto como la cinta lo hizo.",
      "**La cadencia es notablemente constante.** 1,38 y 1,39 Hz en dos run de un run; 1,45 Hz en otro. La propulsión se parece menos a un esfuerzo y más a una resonancia que alguien ha encontrado.",
      "**El heave está alrededor de 20 cm** a esa cadencia, medido de abajo a arriba, con la advertencia anterior.",
      "**El cabeceo oscila alrededor de ±19°, el balanceo alrededor de ±10°** en un run limpio — la tabla está haciendo mucho más cabeceo que balanceo, que es exactamente lo que todo el enfoque detector asume y nunca había verificado realmente."
    ]
  },
  "limits": {
    "h": "Lo que esto aún no prueba",
    "p": "La lista de cosas que no podemos pretender es más larga que la lista de cosas que podemos, y debería mantenerse así hasta que los datos crezcan:",
    "li": [
      "**Cuatro run, un rider, una tabla, un lago.** Nada aquí se valida entre riders, y nuestro conteo de pump sigue siendo calibrado en una sola persona — ver [Parte 3](/nerd-analysen-3) para cuán frágil es ese terreno.",
      "**La detección de planeo aún no existe.** El número que mostramos como el planeo más largo es la brecha más larga entre dos pump *detectados*, lo que no es lo mismo y nunca lo fue.",
      "**Nadie hace un run con un móvil pegado a su tabla.** Esto es un instrumento de medición, no una característica. Su trabajo es producir la verdad contra la que se mide el reloj en tu muñeca."
    ]
  },
  "videorun": {
    "h": "El run mismo",
    "p": "La explicación de este setup, filmada en el lago: qué va en la tabla, cómo se fija, y qué vuelve.",
    "cap": "Móvil en la tabla: GPS, giroscopio y aceleración, medidos directamente."
  },
  "next": {
    "h": "Adónde va esto",
    "p": "El punto de un instrumento de medición es apuntarlo a algo. Los datos de tabla nos dan, por primera vez, una verdad del terreno para dos preguntas que solo hemos estimado: **este golpe es un pump**, y **cuándo dejó de volar la tabla**. Ambos se cuentan en la muñeca hoy y se calibran en una persona. Cómo funciona ese conteo es [Parte 2](/nerd-analysen-2); cómo se sostiene contra un segundo sensor es [Parte 3](/nerd-analysen-3)."
  }
};


const fi: N4 = {
  "back": "← Osa 3: Kahden kellon mittaus",
  "h1": "Osa 4: Puhelin teipattuna lautaan",
  "subtitle": "Mitä pystymme mittaamaan, kun sensori ei enää ratsasta rannetta",
  "intro": "Kaikki luvut, jotka tämä sivusto näyttää pumppauksesta, tulevat lopulta jollekulle ranteeseen sidotusta sensorista. Ranne tekee omansa: se heiluu, se jäykistyy, se ojentuu tasapainon vuoksi. Kolmen osan ajan kiertelemme sen ympärillä. Syyskuussa 2026 lakkasimme kiertämästä ja **teivasimme puhelimen lautaan** — GPS, kiihtyvyysanturi ja gyroskooppi, 50 näytettä sekunnissa, kiinnitetty siihen mitä oikeasti haluamme tietää. Tämä osa on se, mitä siitä tuli.",
  "why": {
    "h": "Mitä ranne voi ja mitä ei",
    "p": "Ensimmäinen yllätys oli kielteinen, ja se kannattaa sanoa selvästi, koska odotimme päinvastoin. Pantiin **Garmin rannetta vastaan samalta vedolta, kahden minuutin välillä** ja verrattiin, mitä kukin sensori näkee taajuusalueella. Jos ranne olisi ollut hopea, pumppaustahti olisi ollut sumea ja lauta teräväksi.",
    "p2": "Se on teräväksi **molemmilla**. Sama huippu, sama 1,40 Hz, sama korkeus. Ranne löytää pumppauskadenssiin täydellisesti — mikä on juuri se, miksi pumppauslaskijamme toimii ylipäätään: tällä vedolla lauta-anturi laski **103 pumppausta** ja kello **106**, kolmen sisällä toisistaan. Joten lautaa ei tarvita rytmin kuulemiseen. Mitä se antaa, on jotain mitä ranne ei voi koskaan antaa: **lautaitse itse** — kuinka paljon nenä laskeutuu, kuinka paljon se kallistuu, kuinka paljon koko lauta nousee ja laskeutuu. Ranne ei voi kertoa sitä, riippumatta siitä kuinka hyvä sensori siihen on.",
    "cap": "Sama veto, kaksi sensoria, 20 sekuntia pisimmästä juoksusta kukin. Molemmat näkevät 1,40 Hz:iä."
  },
  "what": {
    "h": "Mitä puhelin lautalla tallentaa",
    "p": "Puhelin kirjoittaa saman latausmuodon kuin jokainen tuottama kello, plus yksi kanava jota kellot eivät omaa: **gyroskooppi**. Tämä ylimääräinen kanava on se, joka tekee lopusta mahdollista — gyroskooppi mittaa rotaatiota suoraan, ilman että täytyy arvata mikä mitatusta kiihtyvyydestä on painoa ja mikä liikettä. Kolmesta raa'asta virtasta johdamme kolme kulmaa ja yhden etäisyyden:",
    "li": [
      "**Pitch** — nenä ylös ja alas. Tämä *on* pumppaustahti; kaikki muu on toissijaista.",
      "**Roll** — lauta viistoon vasemmalle ja oikealle. Carving ja pienet korjaukset iskujen välillä.",
      "**Yaw** — suunnanmuutos. Ristiintarkistettu GPS-rataa vastaan, koska molemmat mittaavat samaa ja niiden täytyy sopia yhteen.",
      "**Heave** — kuinka paljon lauta todella nousee ja laskeutuu, senttimetreissä, integroimalla pystysuora kiihtyvyys kahdesti."
    ],
    "cap": "Yksi juoksu, 28 sekuntia. Pitch-käyrä on pumppatusta; heave alla on sama tahti, senttimetreissä.",
    "capTiles": "Samat kolme kulmaa kuin sivusto näyttää ne, elävänä radan varrella."
  },
  "mount": {
    "h": "Ongelma jota kukaan ei varoittanut: mihin suuntaan puhelin teipattiin?",
    "p": "Puhelimella ei ole mitään hajua miten se on kiinnitetty lautaan. Teippaa se pituussuunnassa ja pitch on pitch. Teippaa se poikittain ja se mitä puhelin kutsuu pitchiksi on lauta kallistelemassa. Teippaa se diagonaaliin — mikä tapahtui aivan ensimmäisellä oikealla vedolla — ja puhtaasti pitch-oskillaatio näkyy **71 % pitchinä ja 71 % rollinä samalla hetkellä**. Ajaa ratsastajaa määrittämään se toimii juuri siihen asti kunnes joku uudelleenteipaaa märän puhelimen kylmillä sormilla.",
    "p2": "Joten päästämme datan vastata. Pumppataus on rotaatio lautaa poikittaisen akselin ympärillä, ja gyroskooppi mittaa rotaatiota suoraan. Kierrä mitattu signaali jokaisen mahdollisen kiinnityskulman läpi ja kysy missä pitch-oskillaatio pumppauskaistalossa (0,6–2,5 Hz) on vahvinta — tuo suunta on poikittainen akseli. Kuva alla on tuo pyyhintä kahdelta vedolla: yksi puhelin teipattuna lautaan poikittain, yksi diagonaaliin. Kaksi vetoa, kaksi puhdasta huippua, ei ketään panosta. Mitä pyyhintä ei voi päättää on nenä eteenpäin vai nenä taaksepäin, koska se on sama akseli; ensimmäinen sekunti vedosta ratkaisee sen, koska veto alkaa nenän laskeutuessa alas.",
    "cap": "Pitch-energia pumppauskaistalossa versus oletettu kiinnitysrotaatio. Huippu on vastaus."
  },
  "heave": {
    "h": "Heave, ja miksi lukuun tarvitaan varoitus",
    "p": "Kuinka paljon lauta todella liikkuu ylös ja alas kun pumppatat? Kiihtyvyyden kaksinkertainen integrointi antaa vastauksen senttimetreissä, ja se on sellanen luku joka näyttää auktoritatiiviselta ja on hiljaa hauras. Mikä tahansa hitaampi kuin kaista jota pidät, vahvistuu sen jakson neliöllä — pieni liuku alimpäana tulee ulos metreissä kuviteltavaa heavea.",
    "p2": "Tasointtiikkuna asettaa tämän alarajan, eikä se ole vapaa parametri. Kysy samaa vetoa 1 sekunnin ikkunalla ja saat 18 cm; kysy 5 sekuntin ikkunalla ja saat 33 cm, samalle vedolle. Johdamme siis ikkunan mitatusta **vedosta** — tässä 1,38 Hz, joten 1,45 sekuntia — ja merkitsemme luvun epäluotettavaksi milloin tahansa liike istuu liian lähellä reunaa. Rehellinen lukeminen tästä kaaviosta ei ole *heave on 20 cm*; se on *heave on 20 cm kun määrität heavea pumppausnopeudella olevaksi liikkeeksi*.",
    "cap": "Sama veto, sama data, kuusi eri tasoitusikkunaa: 18 cm:stä 33 cm:iin."
  },
  "found": {
    "h": "Mitä neljä vetoa on jo kertoneet meille",
    "p": "Tämä on pieni datakasa — neljä lautaennätystä — joten nämä ovat huomioita, ei lakeja. Ne ovat kuitenkin ensimmäiset luvut jotka kuvaavat lautaa eikä ratsastajaa.",
    "li": [
      "**Kiinnitys löydetään automaattisesti ja se on vakaa.** Kahden juoksun välillä yhdestä vedosta havaittu kulma vaihteli 3°:llä, mikä on laskentakohinaa, ei puhelimen liikettä. Vetojen välillä se vaihteli täsmälleen yhtä paljon kuin teippi.",
      "**Kadenssi on huomattavan vakaa.** 1,38 ja 1,39 Hz kahdessa juoksusa yhdestä vedosta; 1,45 Hz toiselta. Pumppataus näyttää vähemmän ponnistukselta ja enemmän resonanssista jonka joku on löytänyt.",
      "**Heave on noin 20 cm** tuolla kadensilla, mitattuna alhaalta ylös, edellä olevan varoituksen kera.",
      "**Pitch heilahtelee noin ±19°, roll noin ±10°** puhtaassa vedossa — lauta tekee paljon enemmän pitchausta kuin rolli, mikä on se jonka koko tutka-lähestyminen olettaa ja ei ole koskaan oikeasti tarkistettu."
    ]
  },
  "limits": {
    "h": "Mitä tämä ei vielä osoita",
    "p": "Lista asioista joita emme voi väittää on pidempi kuin lista asioista joita voimme, ja sen pitäisi pysyä niin kunnes data kasvaa:",
    "li": [
      "**Neljä vetoa, yksi ratsastaja, yksi lauta, yksi järvi.** Mitään täällä ei ole vahvistettu ratsastajien yli, ja pumppauslaskijamme on vielä kalibroitu yhden henkilön mukaan — katso [Osa 3](/nerd-analysen-3) kuinka ohut se pohja on.",
      "**Liukudetektio ei vielä ole olemassa.** Luku jonka näytämme pisimmäksi liukuna on pisin rako kahden *havaitun* pumppauksen välillä, mikä ei ole sama asia eikä ole koskaan ollut.",
      "**Kukaan ei aja puhelimen kanssa teipattuna lautaan.** Tämä on mittausväline, ei ominaisuus. Sen työ on tuottaa totuus jota ranteen kello mitataan vastaan."
    ]
  },
  "videorun": {
    "h": "Veto itse",
    "p": "Selitys tälle asetelmalle, filmattu järvellä: mitä lautalle menee, miten se kiinnitetään ja mitä takaisin tulee.",
    "cap": "Puhelin lautalla: GPS, gyroskooppi ja kiihtyvyys, mitattu suoraan."
  },
  "next": {
    "h": "Minne tämä menee",
    "p": "Mittausvälineen pointti on osoittaa se johonkin. Lautadata antaa meille ensimmäistä kertaa totuuden kahdelle kysymykselle joita olemme vain arvioineet: **onko tämä isku pumpputusta**, ja **milloin lauta lopetti lentämisen**. Molemmat lasketaan rannella tänään ja kalibroitu yhdelle henkilölle. Miten laskenta toimii on [Osa 2](/nerd-analysen-2); kuinka hyvin se kestää toista sensoria vastaan on [Osa 3](/nerd-analysen-3)."
  },
  "setup": {
    "h": "Välineet, sellaisenaan",
    "p": "Ei kiinnikettä, ei koteloa, ei kannaketta. Puhelin menee kuivaan laukkuun, kuiva laukku menee vyön alle poikittain kannen yli, ja vyö kiristetään niin tiukasti, että puhelin ei voi liikkua kun lautaa heitetään ympäriinsä. Kokonaiskustannus: yksi vyö. Koko pointti on, että tämän täytyy olla jotain mitä kuka tahansa voi toistaa keskiviikkoiltana, koska data on arvokas vain jos se voidaan kerätä enemmän kuin kerran.",
    "capDeck": "Koko välineistö: kuiva laukku vyön alla, kannen poikki, mastojen edessä.",
    "capRail": "Kiinnitetty ja tarkistettu ennen juoksua — puhelin joka liikkuu juoksun aikana pilaa tallenteen."
  }
};


const fr: N4 = {
  "back": "← Partie 3 : La mesure à deux montres",
  "h1": "Partie 4 : Un téléphone collé à la planche",
  "subtitle": "Ce qu'on peut mesurer une fois que le capteur n'est plus au poignet",
  "intro": "Chaque nombre que ce site affiche sur la propulsion vient en fin de compte d'un capteur attaché à un bras. Ce bras fait son propre truc : il se balance, il fléchit, il s'étend pour se rattraper. Pendant trois parties de cette série nous avons contourné ça. En septembre 2026 nous avons arrêté de le contourner et **collé un téléphone à la planche** — GPS, accéléromètre et gyroscope, 50 échantillons par seconde, boulonné à la chose qu'on veut vraiment mesurer. Voici ce qui en est sorti.",
  "why": {
    "h": "Ce que le poignet peut et ne peut pas donner",
    "p": "La première surprise a été une mauvaise — et ça vaut la peine de l'énoncer clairement parce qu'on attendait le contraire. Nous avons mis l'enregistreur de planche à côté d'une **Garmin au poignet du même run, deux minutes d'intervalle**, et comparé ce que chaque capteur voit dans le domaine fréquentiel. Si le poignet était inutile, le rythme de pump serait un bruit là et un pic à la planche.",
    "p2": "C'est un pic sur **les deux**. Même pic, même 1,40 Hz, même amplitude. Le poignet trouve la cadence de pump parfaitement bien — ce qui est exactement pourquoi notre compteur de pump marche du tout : sur ce run l'enregistreur de planche a compté **103 pumps** et la montre **106**, à trois d'écart. Donc la planche n'est pas nécessaire pour entendre le rythme. Ce qu'elle donne c'est quelque chose que le poignet ne peut jamais donner : **l'assiette de la planche elle-même** — de combien le nez s'enfonce, de combien elle bascule, de combien le truc entier monte et descend. Un bras ne peut pas rapporter ça, peu importe la qualité du capteur dessus.",
    "cap": "Même run, deux capteurs, 20 secondes du plus long run chacun. Les deux voient 1,40 Hz."
  },
  "setup": {
    "h": "Le montage, tel quel",
    "p": "Il n'y a pas de monture, pas de boîtier, pas de support. Le téléphone rentre dans un sac étanche, le sac étanche rentre sous une sangle à travers le pont, et la sangle se resserre assez pour que le téléphone ne bouge pas pendant que la planche est secouée. Coût total : une sangle. Tout le point c'est que ça doit être quelque chose que n'importe qui peut refaire un mardi soir, parce que les données ne valent la peine d'être collectées que si c'est possible plus d'une fois.",
    "capDeck": "Le setup complet : sac étanche sous une sangle, à travers le pont, devant le mât.",
    "capRail": "Sanglé et vérifié avant le run — un téléphone qui bouge en cours de run ruine l'enregistrement."
  },
  "what": {
    "h": "Ce qu'un téléphone sur la planche enregistre",
    "p": "Le téléphone écrit le même format d'upload que chaque montre qu'on supporte, plus un canal que les montres n'ont pas : **le gyroscope**. Ce canal supplémentaire c'est ce qui rend le reste possible — un gyroscope mesure la rotation directement, sans avoir à deviner quelle partie d'une accélération mesurée c'est la gravité et quelle partie c'est le mouvement. Des trois flux bruts nous tirons trois angles et une distance :",
    "li": [
      "**Tangage** — le nez qui monte et descend. C'*est* le coup de pump ; tout le reste est secondaire.",
      "**Roulis** — la planche qui bascule à gauche et à droite. Carving, et les petites corrections entre coups.",
      "**Lacet** — le changement de cap. Contre-vérifié par la trace GPS, parce que les deux mesurent la même chose et doivent être d'accord.",
      "**Heave** — de combien la planche monte et descend vraiment, en centimètres, en intégrant deux fois l'accélération verticale."
    ],
    "cap": "Un run, 28 secondes. La trace de tangage c'est la propulsion ; le heave dessous c'est le même rythme, en centimètres.",
    "capTiles": "Les trois mêmes angles que le site les affiche, en direct le long de la trace."
  },
  "mount": {
    "h": "Le problème que personne ne nous a prévenu : dans quel sens est collé le téléphone ?",
    "p": "Un téléphone n'a aucune idée de comment il est collé à une planche. Colle-le dans le sens de la longueur et le tangage c'est le tangage. Colle-le en travers et ce que le téléphone appelle tangage c'est la planche qui bascule. Colle-le en diagonale — ce qui est arrivé au tout premier vrai run — et une oscillation de tangage pur se voit comme **71 % tangage et 71 % roulis en même temps**. Demander au rider de le spécifier marche exactement jusqu'à ce que quelqu'un recollasse un téléphone mouillé avec des doigts gelés.",
    "p2": "Donc on laisse les données répondre. La propulsion c'est une rotation autour de l'axe transversal de la planche, et un gyroscope mesure la rotation directement. Tourne le signal mesuré à travers tous les angles de montage possibles et cherche où l'oscillation de tangage dans la bande de propulsion (0,6–2,5 Hz) est la plus forte — c'est la direction l'axe transversal. L'image dessous c'est ce balayage pour deux runs : un téléphone collé en travers de la planche, un collé en diagonale. Deux runs, deux pics nets, aucune intervention de personne. Ce que le balayage ne peut pas décider c'est nez en avant ou nez en arrière, parce que c'est le même axe ; la première seconde du run le décide, parce qu'un run commence avec le nez qui s'enfonce.",
    "cap": "Énergie de tangage dans la bande de propulsion contre la rotation supposée de montage. Le pic c'est la réponse."
  },
  "heave": {
    "h": "Heave, et pourquoi le nombre a besoin d'une réserve",
    "p": "De combien une planche monte et descend vraiment pendant que tu pompes ? Intégrer l'accélération deux fois donne une réponse en centimètres, et c'est le genre de nombre qui a l'air d'autorité et qui est tranquillement fragile. Tout ce qui est plus lent que la bande que tu gardes s'amplifie par le carré de sa période — une petite dérive à l'extrémité basse sort comme des mètres de heave imaginaire.",
    "p2": "La fenêtre de nivellement fixe cette limite inférieure, et ça n'est pas un paramètre libre. Demande le même run avec une fenêtre de 1 seconde et tu obtiens 18 cm ; demande avec 5 secondes et tu obtiens 33 cm, pour le même run. Nous tirons donc la fenêtre de la **cadence mesurée** de ce run — ici 1,38 Hz, donc 1,45 secondes — et nous marquons le nombre comme peu fiable quand le mouvement s'assoit trop près du bord. La lecture honnête de ce graphique ce n'est pas *le heave est 20 cm* ; c'est *le heave est 20 cm quand tu définis le heave comme le mouvement à la vitesse de propulsion*.",
    "cap": "Le même run, les mêmes données, six fenêtres de nivellement différentes : 18 cm à 33 cm."
  },
  "found": {
    "h": "Ce que quatre runs nous ont déjà dit",
    "p": "C'est une petite pile de données — quatre enregistrements de planche — donc ce sont des observations, pas des lois. Elles sont cependant les premiers nombres qu'on a qui décrivent la planche plutôt que le rider.",
    "li": [
      "**Le montage se trouve automatiquement et il est stable.** Sur deux runs d'un run l'angle détecté a varié de 3°, ce qui est du bruit de calcul, pas du téléphone qui bouge. Entre les runs ça a varié d'exactement autant que la colle l'a fait.",
      "**La cadence est remarquablement stable.** 1,38 et 1,39 Hz sur deux runs d'un run ; 1,45 Hz sur un autre. La propulsion ressemble moins à un effort et plus à une résonance que quelqu'un a trouvée.",
      "**Le heave est autour de 20 cm** à cette cadence, mesuré de bas en haut, avec la réserve ci-dessus.",
      "**Le tangage s'oscille d'environ ±19°, le roulis d'environ ±10°** dans un run net — la planche fait beaucoup plus de tangage que de roulis, ce que toute l'approche détecteur suppose et n'avait jamais vraiment vérifiée."
    ]
  },
  "limits": {
    "h": "Ce que ça ne prouve pas encore",
    "p": "La liste des choses qu'on ne peut pas prétendre est plus longue que la liste des choses qu'on peut, et ça devrait rester comme ça jusqu'à ce que les données augmentent :",
    "li": [
      "**Quatre runs, un rider, une planche, un lac.** Rien ici n'est validé sur différents riders, et notre comptage de pump est toujours étalonné sur une seule personne — voir [Partie 3](/nerd-analysen-3) pour combien cette base est fine.",
      "**La détection de glisse n'existe toujours pas.** Le nombre qu'on affiche comme la plus longue glisse c'est le plus long écart entre deux *pumps détectées*, ce qui n'est pas la même chose et ne l'a jamais été.",
      "**Personne ne fait un run avec un téléphone collé à sa planche.** C'est un instrument de mesure, pas une fonctionnalité. Son rôle c'est de produire la vérité contre laquelle la montre à ton poignet se mesure."
    ]
  },
  "videorun": {
    "h": "Le run lui-même",
    "p": "L'explication de ce setup, filmée au lac : ce qui va sur la planche, comment c'est fixé, et ce qui en revient.",
    "cap": "Téléphone sur la planche : GPS, gyroscope et accélération, mesurés directement."
  },
  "next": {
    "h": "Où ça va",
    "p": "Le point d'un instrument de mesure c'est de l'orienter sur quelque chose. Les données de planche nous donnent, pour la première fois, une vérité au sol pour deux questions qu'on n'a jamais qu'estimées : **ce coup c'est un pump**, et **quand la planche a arrêté de voler**. Les deux sont comptés au poignet aujourd'hui et étalonnés sur une personne. Comment ce comptage marche c'est [Partie 2](/nerd-analysen-2) ; comment bien il tient contre un deuxième capteur c'est [Partie 3](/nerd-analysen-3)."
  }
};


const gsw: N4 = {
  "back": "← Teil 3: D Doppel-Uhr-Mässig",
  "h1": "Teil 4: E Händy am Board",
  "subtitle": "Was mer mässe, wenn de Sensor vum Handglänk abe ans Board chunnt",
  "intro": "Jedi Zahl uf dere Siite über s Pumpe chunnt letschtendig vo nere Sensor am Handglänk. S Handglänk macht sii eigens Ding: es schwingt, es stützt ab, es streckt sich zur Balance us. Drü Tëil vo dere Serie hend mer dorum ume baut. Im September 2026 hend mer demit ufghört und **e Händy ans Board chlebt** — GPS, Beschleunigings-Sensor und Gyroskop, 50 Samples pro Sekunde, feschtchlebt a däm Ding, das mer würklich verstah wönd. Das isch, was debii herus choo isch.",
  "why": {
    "h": "Was s Handglänk chan und nöd chan",
    "p": "D erschti Überraschig isch e negative gsi, und si isch wërt, klar usgsproche z wärde, wil mer s Gegeteil erwartet hend. Mer hend de Board-Recorder näben ere **Garmin am Handglänk us dersëlbe Fahrt, zwei Minute Abstand**, ufzeichnet und vergliche, was jede Sensor im Frequänz-Bëreich gseht. Wenn s Handglänk hoffnigsloos wär gsi, würd de Pump-Rhythmus dört e Schmier-Bëreich si und da ne Peak.",
    "p2": "Es isch ne Peak uf **beide**. Gliicher Peak, gliichi 1,40 Hz, gliichi Höchi. S Handglänk findt d Pump-Kadänz völlig äinwandfrei — genau deswëge funktioniert üse Pump-Zëller öberhaupt: bi dere Fahrt zellti de Board-Recorder **103 Pumps** und d Uhr **106**, mit drü Differänz. S Board isch also nöd nötig, zum de Rhythmus z hörä. Was s gibt, isch öppis, das s Handglänk ni gä chan: **d Iischtellig vom Board selber** — wie witt d Spitz iitaucht, wie witt s sich nëigt, wie witt s Ganze ufe und abe gaat. E Arm chan das nöd mälde,egal wie guet de Sensor druf isch.",
    "cap": "Gliichi Fahrt, zwei Sensore, jede 20 Sekunde vum längschte Lauf. Bedi gsehed 1,40 Hz."
  },
  "setup": {
    "h": "S Rig, wis isch",
    "p": "Es git kei Halterig, kei Ghüse, kei Chlammer. S Händy chunnt in ne Dry Bag, de Dry Bag chunnt under ne Gurt über s Deck, und de Gurt wird so schtraff, dass sich s Händy nöd bewegt, während s Board ume gworfe wird. Gesamtchöschte: e Gurt. De ganz Punkt isch, dass das öppis si muss, wo jede a nere Dienschtig-Abig chana widerholekan, wil d Date nuur wert hend, wenn si meh as eimal gsammlet wärde chönd.",
    "capDeck": "S komplëtt Setup: Dry Bag under nere Gurt, über s Deck, vor em Mascht.",
    "capRail": "Feschtgurtet und vor em Lauf überprüeft — e Händy, wo sich während de Fahrt bewegt, ruiniert d Ufzeichnig."
  },
  "what": {
    "h": "Was e Händy am Board ufzeichnet",
    "p": "S Händy schribt dasselbe Upload-Format wie jedi Uhr, wo mer unterstütze, plus ne Kanal, de kei Uhr het: **s Gyroskop**. De Extra-Kanal isch das, was de Räscht möglich macht — e Gyroskop misst Rotatioon diräkt, ohni z rate, wälch Teil vo nere gmässne Beschleunigung Schwärkraft isch und wälch Bewegig. Us de drü rohe Ströme lëited mer drü Winkel und e Entfärnig ab:",
    "li": [
      "**Pitch** — d Spitz gaat ufe und abe. Das *isch* de Pump-Schlag; alles anders isch Nëbsach.",
      "**Roll** — s Board lehnt sich links und rächts. Kurvefart und d chlini Korrektioone zwüsche Schläge.",
      "**Yaw** — d Richtigs-Änderig. Abggliche gäge d GPS-Spur, wil bedi dasselbe mässe und übäriischtemme mönd.",
      "**Heave** — wie witt s Board würklich ufe und abe gaat, in Zentimeträ, us zweifacher Integratioon vo de vertikale Beschleunigung."
    ],
    "cap": "E Lauf, 28 Sekunde. D Pitch-Spur isch s Pumpe; s Heave dunter isch dersëlb Rhythmus, in Zentimeträ.",
    "capTiles": "D gliiche drü Winkel, wie d Siite si zeigt, live entlang de Spur."
  },
  "mount": {
    "h": "S Problem, vor däm üs niemä gwärnt het: wälchi Richttig isch s Händy chlebt?",
    "p": "E Händy het kei Ahnig, wie s uf nere Board feschtchlebt isch. Kleb s längsläufig und Pitch isch Pitch. Kleb s quër und was s Händy Pitch nënnt, isch s Board, das sich nëigt. Kleb s diagonal — was bim erscht echte Lauf passiert isch — und e reeini Pitch-Oszillatioon taucht uf as **71 % Pitch und 71 % Roll gliichzitig**. De Fahrer bitte, es aazgä, funktioniert genau so lang, bis öpper e nassas Händy mit kältä Fingere nöi chlebt.",
    "p2": "Also loond mer d Date antworte. Pumpe isch e Rotatioon um d Querachse vum Board, und e Gyroskop misst Rotatioon diräkt. Dreh s gmässne Signal dure jede mögliche Befestigigs-Winkel und frag, wo d Pitch-Oszillatioon im Pump-Band (0,6–2,5 Hz) am stärkschte isch — d Richttig isch d Querachse. S Bild drunter isch dä Durchsatz für zwei Fahrte: e Händy quër uffs Board chlebt, eis diagonal. Zwei Fahrte, zwei suuberi Peaks, kei Input vo öppem. Was de Durchsatz nöd underscheide chan, isch Spitz-vorus gäge Spitz-zrugg, wil das dieselb Achse isch; d erschti Sekunde vum Lauf klart's, wil e Lauf mit de Spitz na abe afangt.",
    "cap": "Pitch-Energii im Pump-Band gäge d aagnommi Befestigigs-Rotatioon. De Peak isch d Antworte."
  },
  "heave": {
    "h": "Heave, und worum d Zahl ne Vorbehalt bruucht",
    "p": "Wie witt bewegt sich e Board würklich ufe und abe, während d pumpsch? Zweifach Integratioon vo de Beschleunigung gibt ne Antworte in Zentimeträ, und si isch d Art vo Zahl, wo autoritativ usluegt und still zärbräch isch. Alles, das längsamer isch as s Band, das d hesch, wird um s Quadrat si Période verstärkt — ne chlii Drift am untere Ändi chunnt as Meter us imaginärem Heave heraus.",
    "p2": "S Usgliich-Fënster setzt die untri Kant, und es isch kei freeii Paramëter. Frag na de gliiche Lauf mit nere 1-Sekunde-Fënschter und d becho 18 cm; frag mit 5 Sekunde und d becho 33 cm, för die identisch Fahrt. Mer lëited s Fënschter deswëge us de **gmässne Kadänz** vum Lauf ab — da 1,38 Hz, also 1,45 Sekunde — und mer kënzeichne d Zahl as unzuverlässig, wenn d Bewegig z nah a de Kant sitzt. D ehrlich Lesart vo däm Diagramm isch nöd *s Heave isch 20 cm*; es isch *s Heave isch 20 cm, wenn d Heave as d Bewegig bi Pump-Gschwindigkeit definiersch*.",
    "cap": "Dersëlb Lauf, dieselbe Date, sächs verschiedeni Usgliich-Fënschter: 18 cm bis 33 cm."
  },
  "found": {
    "h": "Was vier Fahrte üs scho verzellt hend",
    "p": "Das isch ne chlii Haufe vo Date — vier Board-Ufzeichnunge — also sind das Beobachtunge, nöd Gsetze. Si sind aber d erschte Zahle, wo mer hend, wo s Board beschriibe, nöd de Fahrer.",
    "li": [
      "**D Befeschtiging wird automatisch gfunde und isch stabil.** Über zwei Läuf vo nere Fahrt variierte de erkannt Winkel um 3°, das isch Räch-Ruschelä, nöd s Händy, das sich bewegt. Zwüsche Fahrte variierte es um genau so vill wie s Chlëbband.",
      "**Kadänz isch bemerkenswert stabil.** 1,38 und 1,39 Hz in zwei Läuf vo nere Fahrt; 1,45 Hz bi nere andere. Pumpe luegt weniger na Aschträngig us und meh na ne Resonänz, wo öpper gfunde het.",
      "**Heave isch öppe 20 cm** bi dere Kadänz, gmässe vo unta bis obe, mit de Vorbehalt obe.",
      "**Pitch schwingt öppe ±19°, Roll öppe ±10°** in nere suubere Fahrt — s Board macht vil meh Pitching as Rolling, das isch genau das, was de ganz Erkennigs-Ansatz aannimmt und nie würklich überprüeft het."
    ]
  },
  "limits": {
    "h": "Was das no nöd bewiist",
    "p": "D Lischt vo de Ding, wo mer nöd behaupte chönd, isch länger as d Lischt vo de Ding, wo mer chönd, und si söll so blïbe, bis d Date wachse:",
    "li": [
      "**Vier Fahrte, e Fahrer, e Board, e Sëe.** Nüt da isch über Fahrer validiert, und üsi Pump-Zëllig isch immer no uf nere Persoon ggicht — gsee [Teil 3](/nerd-analysen-3) för wie dün dä Grund isch.",
      "**Glëit-Erkennig existiert immer no nöd.** D Zahl, wo mer as längschti Glëitfaas zëige, isch d längschti Lück zwüsche zwei *erkannte* Pumps, das isch nöd dasselb und isch nie so gsi.",
      "**Niemä fahrt mit nere Händy, wo ans Board chlebt isch.** Das isch e Mess-Istrumänt, kei Feature. Sini Aufgab isch es, d Wahrheit z produzirä, gäge wo de Sensor uf dine Handglänk gmässe wird."
    ]
  },
  "videorun": {
    "h": "D Fahrt selber",
    "p": "D Erklär för diis Setup, gfilmt am Sëe: was ans Board chunnt, wie s befeschtigt wird, und was use chunnt.",
    "cap": "Händy am Board: GPS, Gyroskop und Beschleunigung, diräkt gmässe."
  },
  "next": {
    "h": "Wo das hinegaat",
    "p": "De Sinn vom ne Mess-Istrumänt isch, uf öppis grychtet z si. D Board-Date gend üs zum erschte Mol ne Grundwahrheit för zwei Frage, wo mer nuur gschätzt hend: **isch dä Schlag e Pump**, und **wann het s Board ufghört z fliige**. Bedes wird hüt am Handglänk gzellt und uf nere Persoon ggicht. Wie disi Zëllig funktioniert, isch [Teil 2](/nerd-analysen-2); wie guet si gäge ne zweite Sensor hallet, isch [Teil 3](/nerd-analysen-3)."
  }
};


const id: N4 = {
  "back": "← Bagian 3: Pengukuran dual-watch",
  "h1": "Bagian 4: Ponsel yang ditempel ke papan",
  "subtitle": "Apa yang bisa kami ukur setelah sensor berhenti naik di pergelangan tangan",
  "intro": "Setiap angka yang ditunjukkan situs ini tentang memompa pada akhirnya berasal dari sensor yang terikat di lengan seseorang. Lengan itu melakukan hal-halnya sendiri: berayun, menopang, menjangkau untuk menyeimbangkan. Selama tiga bagian serial ini kami bekerja di sekitarnya. Di September 2026 kami berhenti bekerja di sekitarnya dan **menempel ponsel ke papan** — GPS, akselerometer dan giroskop, 50 sampel per detik, baut ke hal yang benar-benar ingin kami ketahui. Bagian ini adalah apa yang keluar.",
  "why": {
    "h": "Apa yang pergelangan tangan bisa dan tidak bisa berikan",
    "p": "Kejutan pertama adalah negatif, dan layak dinyatakan dengan jelas karena kami mengharapkan yang sebaliknya. Kami meletakkan papan merekam di sebelah **Garmin di pergelangan tangan dari lari yang sama, dua menit terpisah**, dan membandingkan apa yang setiap sensor lihat dalam domain frekuensi. Jika pergelangan tangan tidak ada harapan, ritme pompa akan menjadi smear di sana dan puncak di papan.",
    "p2": "Ini adalah puncak di **keduanya**. Puncak yang sama, 1,40 Hz yang sama, tinggi yang sama. Pergelangan tangan menemukan kadence pompa dengan sempurna — yang persis mengapa penghitung pompa kami bekerja sama sekali: pada lari ini rekaman papan menghitung **103 pompa** dan jam tangan **106**, dalam tiga dari satu sama lain. Jadi papan tidak diperlukan untuk mendengar ritme. Apa yang diberikannya adalah sesuatu yang tidak bisa pernah diberikan oleh pergelangan tangan: **sikap papan itu sendiri** — seberapa jauh hidung menyelam, seberapa jauh ia berguling, seberapa jauh seluruh hal naik dan turun. Lengan tidak dapat melaporkan itu, tidak peduli seberapa bagus sensor di atasnya.",
    "cap": "Lari yang sama, dua sensor, 20 detik dari lari terpanjang masing-masing. Keduanya melihat 1,40 Hz."
  },
  "setup": {
    "h": "Rig-nya, seperti yang ada",
    "p": "Tidak ada mount, tidak ada case, tidak ada bracket. Ponsel masuk dalam dry bag, dry bag masuk di bawah tali melintang dek, dan tali cukup ketat sehingga ponsel tidak dapat bergeser saat papan dilempar ke sana-sini. Biaya total: satu tali. Poin seluruhnya adalah bahwa ini harus menjadi sesuatu yang dapat diulang siapa pun pada malam Selasa, karena data hanya berharga jika dapat dikumpulkan lebih dari sekali.",
    "capDeck": "Seluruh penyiapan: dry bag di bawah tali, melintang dek, di depan mast.",
    "capRail": "Terikat dan diperiksa sebelum lari — ponsel yang bergerak saat berkendara merusak rekaman."
  },
  "what": {
    "h": "Apa yang merekam ponsel di papan",
    "p": "Ponsel menulis format upload yang sama seperti setiap jam tangan yang kami dukung, plus satu saluran yang tidak dimiliki jam tangan mana pun: **giroskop**. Saluran ekstra itu adalah apa yang membuat sisanya mungkin — giroskop mengukur rotasi langsung, tanpa harus menebak bagian mana dari akselerasi terukur yang gravitasi dan mana yang bergerak. Dari tiga aliran mentah kami menurunkan tiga sudut dan satu jarak:",
    "li": [
      "**Pitch** — hidung naik dan turun. Ini *adalah* goresan pompa; semuanya lain sekunder.",
      "**Roll** — papan miring kiri dan kanan. Carving, dan koreksi kecil antara stroke.",
      "**Yaw** — perubahan heading. Silang-periksa terhadap jejak GPS, karena keduanya mengukur hal yang sama dan harus setuju.",
      "**Heave** — seberapa jauh papan benar-benar naik dan turun, dalam sentimeter, dari mengintegrasikan akselerasi vertikal dua kali."
    ],
    "cap": "Satu lari, 28 detik. Jejak pitch adalah pemompaan; heave di bawahnya adalah ritme yang sama, dalam sentimeter.",
    "capTiles": "Ketiga sudut yang sama seperti yang ditunjukkan situs, langsung sepanjang trek."
  },
  "mount": {
    "h": "Masalah yang tidak ada yang memperingatkan kami tentang: ponsel ditempel bagaimana?",
    "p": "Ponsel tidak tahu bagaimana ia menempel pada papan. Tempel memanjang dan pitch adalah pitch. Tempel melintang dan apa yang disebut pitch ponsel adalah papan berguling. Tempel diagonal — yang terjadi pada lari nyata pertama — dan osilasi pitch murni muncul sebagai **71% pitch dan 71% roll pada waktu yang sama**. Meminta pengendara untuk menentukan itu bekerja persis sampai seseorang menempel ulang ponsel basah dengan jari dingin.",
    "p2": "Jadi kami biarkan data menjawab. Memompa adalah rotasi tentang sumbu melintang papan, dan giroskop mengukur rotasi langsung. Putar sinyal yang diukur melalui setiap sudut pemasangan yang mungkin dan tanyakan di mana osilasi pitch dalam band pompa (0,6–2,5 Hz) paling kuat — arah itu adalah sumbu melintang. Gambar di bawah adalah sapuan itu untuk dua lari: satu ponsel menempel melintang papan, satu menempel diagonal. Dua lari, dua puncak bersih, tidak ada masukan dari siapa pun. Apa yang tidak bisa ditetapkan sapuan adalah hidung-maju versus hidung-mundur, karena itu adalah sumbu yang sama; detik pertama lari menyelesaikannya, karena lari dimulai dengan hidung menyelam.",
    "cap": "Energi pitch dalam band pompa terhadap rotasi pemasangan yang diasumsikan. Puncaknya adalah jawabannya."
  },
  "heave": {
    "h": "Heave, dan mengapa angka itu membutuhkan kalimat peringatan",
    "p": "Seberapa jauh papan benar-benar bergerak naik dan turun saat Anda memompa? Mengintegrasikan akselerasi dua kali memberikan jawaban dalam sentimeter, dan ini adalah jenis angka yang terlihat otoritatif dan diam-diam rapuh. Apa pun yang lebih lambat dari band yang Anda simpan diamplifikasi oleh kuadrat periodenya — drift kecil di ujung rendah keluar sebagai meter heave imajiner.",
    "p2": "Jendela leveling menetapkan tepi itu, dan itu bukan parameter gratis. Minta lari yang sama dengan jendela 1-detik dan Anda mendapatkan 18 cm; minta dengan 5 detik dan Anda mendapatkan 33 cm, untuk lari yang identik. Kami karena itu menurunkan jendela dari **kadence yang diukur** lari itu — di sini 1,38 Hz, jadi 1,45 detik — dan kami menandai angka sebagai tidak dapat diandalkan setiap kali gerakan terlalu dekat dengan tepi. Pembacaan jujur bagan ini bukan *heave adalah 20 cm*; ini *heave adalah 20 cm ketika Anda mendefinisikan heave sebagai gerakan pada kecepatan pompa*.",
    "cap": "Lari yang sama, data yang sama, enam jendela leveling yang berbeda: 18 cm hingga 33 cm."
  },
  "found": {
    "h": "Apa empat lari sudah beritahu kami",
    "p": "Ini adalah tumpukan data kecil — empat rekaman papan — jadi ini pengamatan, bukan hukum. Namun, ini adalah angka-angka pertama yang kami miliki yang menggambarkan papan bukan pengendara.",
    "li": [
      "**Pemasangan ditemukan secara otomatis dan stabil.** Di seluruh dua lari dari satu sesi sudut yang terdeteksi bervariasi 3°, yang merupakan kebisingan komputasi, bukan ponsel bergerak. Antara sesi itu bervariasi tepat sebanyak pita yang melakukannya.",
      "**Kadence sangat stabil.** 1,38 dan 1,39 Hz dalam dua lari dari satu lari; 1,45 Hz di sisi lain. Pemompaan terlihat kurang seperti usaha dan lebih seperti resonansi yang ditemukan seseorang.",
      "**Heave sekitar 20 cm** pada kadence itu, diukur bawah ke atas, dengan kalimat peringatan di atas.",
      "**Pitch berosilasi tentang ±19°, roll tentang ±10°** dalam lari yang bersih — papan melakukan jauh lebih banyak pitch daripada rolling, yang merupakan apa yang diasumsikan seluruh pendekatan deteksi dan tidak pernah benar-benar diperiksa."
    ]
  },
  "limits": {
    "h": "Apa yang belum dibuktikan",
    "p": "Daftar hal yang tidak dapat kami klaim lebih panjang daripada daftar hal yang dapat kami, dan harus tetap begitu sampai data tumbuh:",
    "li": [
      "**Empat lari, satu pengendara, satu papan, satu danau.** Apa pun di sini belum divalidasi di seluruh pengendara, dan penghitungan pompa kami masih dikalibrasi pada satu orang — lihat [Bagian 3](/nerd-analysen-3) untuk seberapa tipis tanah itu.",
      "**Deteksi glide masih tidak ada.** Angka yang kami tampilkan sebagai glide terpanjang adalah celah terpanjang antara dua pompa *terdeteksi*, yang bukan hal yang sama dan tidak pernah ada.",
      "**Tidak ada yang naik dengan ponsel yang ditempel ke papan mereka.** Ini adalah instrumen pengukur, bukan fitur. Tugasnya adalah menghasilkan kebenaran yang diukur sensor di pergelangan tangan Anda terhadapnya."
    ]
  },
  "videorun": {
    "h": "Lari itu sendiri",
    "p": "Penjelasnya untuk penyiapan ini, difilmkan di danau: apa yang masuk ke papan, cara diperbaiki, dan apa yang kembali.",
    "cap": "Ponsel di papan: GPS, giroskop dan akselerasi, diukur langsung."
  },
  "next": {
    "h": "Ke mana ini pergi",
    "p": "Poin instrumen pengukur adalah ditunjukkan pada sesuatu. Data papan memberikan kami, untuk pertama kalinya, kebenaran dasar untuk dua pertanyaan yang hanya pernah kami estimasi: **apakah goresan ini pompa**, dan **kapan papan berhenti terbang**. Keduanya dihitung di pergelangan tangan hari ini dan dikalibrasi pada satu orang. Cara penghitungan itu bekerja adalah [Bagian 2](/nerd-analysen-2); seberapa baik itu bertahan terhadap sensor kedua adalah [Bagian 3](/nerd-analysen-3)."
  }
};


const it: N4 = {
  "back": "← Parte 3: La misura con due orologi",
  "h1": "Parte 4: Un telefono incollato alla tavola",
  "subtitle": "Cosa si può misurare una volta che il sensore non è più al polso",
  "intro": "Ogni numero che questo sito mostra sulla propulsione viene, alla fine, da un sensore legato a un braccio. Quel braccio fa il suo: oscilla, si irrigidisce, si protende per l'equilibrio. Per tre parti di questa serie abbiamo lavorato attorno a quello. A settembre 2026 abbiamo smesso di lavorare attorno e **incollato un telefono alla tavola** — GPS, accelerometro e giroscopio, 50 campioni al secondo, bullonato alla cosa che veramente vogliamo misurare. Ecco cosa ne è venuto.",
  "why": {
    "h": "Cosa il polso può e non può dare",
    "p": "La prima sorpresa è stata negativa, e vale la pena dirlo chiaramente perché ci aspettavamo il contrario. Abbiamo messo la registrazione della tavola accanto a un **Garmin al polso dallo stesso run, due minuti di distanza**, e confrontato cosa ogni sensore vede nel dominio della frequenza. Se il polso fosse inutile, il ritmo di pump sarebbe un brusio lì e un picco sulla tavola.",
    "p2": "È un picco su **entrambi**. Stesso picco, stessi 1,40 Hz, stessa altezza. Il polso trova il ritmo di pump perfettamente bene — il che è esattamente perché il nostro pump counter funziona affatto: su questo run la registrazione della tavola ha contato **103 pump** e l'orologio **106**, entro tre. Quindi la tavola non è necessaria per sentire il ritmo. Quello che dà è qualcosa che il polso non può mai dare: **l'assetto della tavola stessa** — di quanto il naso si immerge, di quanto si inclina, di quanto il tutto sale e scende. Un braccio non può riferire quello, non importa quanto buono sia il sensore.",
    "cap": "Stesso run, due sensori, 20 secondi del più lungo run ciascuno. Entrambi vedono 1,40 Hz."
  },
  "setup": {
    "h": "L'attrezzatura, così com'è",
    "p": "Non c'è montatura, non c'è astuccio, non c'è staffa. Il telefono va in una borsa stagna, la borsa stagna va sotto una cinghia attraverso il ponte, e la cinghia si stringe abbastanza affinché il telefono non si muova mentre la tavola viene gettata in giro. Costo totale: una cinghia. L'intero punto è che deve essere qualcosa che chiunque può ripetere un martedì sera, perché i dati meritano di essere raccolti solo se possono essere raccolti più di una volta.",
    "capDeck": "L'intero setup: borsa stagna sotto una cinghia, attraverso il ponte, davanti all'albero.",
    "capRail": "Ancorato e controllato prima del run — un telefono che si muove durante il run rovina la registrazione."
  },
  "what": {
    "h": "Cosa registra un telefono sulla tavola",
    "p": "Il telefono scrive lo stesso formato di upload di ogni orologio che supportiamo, più un canale che nessuno degli orologi ha: **il giroscopio**. Quel canale extra è quello che rende il resto possibile — un giroscopio misura la rotazione direttamente, senza dover indovinare quale parte di un'accelerazione misurata sia gravità e quale sia movimento. Dai tre flussi grezzi deriviamo tre angoli e una distanza:",
    "li": [
      "**Beccheggio** — il naso che sale e scende. Questo *è* il colpo di pump; tutto il resto è secondario.",
      "**Rollio** — la tavola che si inclina sinistra e destra. Carving, e le piccole correzioni tra i colpi.",
      "**Imbardata** — il cambio di rotta. Verificato in croce dalla traccia GPS, perché entrambi misurano la stessa cosa e devono essere d'accordo.",
      "**Heave** — di quanto la tavola veramente sale e scende, in centimetri, integrando l'accelerazione verticale due volte."
    ],
    "cap": "Un run, 28 secondi. La traccia di beccheggio è la propulsione; l'heave sotto è lo stesso ritmo, in centimetri.",
    "capTiles": "Gli stessi tre angoli come il sito li mostra, dal vivo lungo la traccia."
  },
  "mount": {
    "h": "Il problema di cui nessuno ci ha avvertito: in che modo il telefono è incollato?",
    "p": "Un telefono non ha idea di come sia attaccato a una tavola. Incollalo in lunghezza e il beccheggio è beccheggio. Incollalo di traverso e quello che il telefono chiama beccheggio è la tavola che si inclina. Incollalo diagonalmente — il che è accaduto al primo vero run — e una pura oscillazione di beccheggio appare come **71% beccheggio e 71% rollio contemporaneamente**. Chiedere al rider di specificarlo funziona esattamente finché qualcuno non ricolla un telefono bagnato con dita fredde.",
    "p2": "Quindi lasciamo che i dati rispondano. La propulsione è una rotazione attorno all'asse trasversale della tavola, e un giroscopio misura la rotazione direttamente. Ruota il segnale misurato attraverso ogni possibile angolo di montaggio e chiedi dove l'oscillazione di beccheggio nella banda di pump (0,6–2,5 Hz) è più forte — quella direzione è l'asse trasversale. L'immagine sotto è quella scansione per due run: un telefono incollato di traverso alla tavola, uno incollato diagonalmente. Due run, due picchi puliti, nessun input da nessuno. Quello che la scansione non può decidere è naso in avanti contro naso indietro, perché è lo stesso asse; il primo secondo del run lo decide, poiché un run inizia con il naso che si immerge.",
    "cap": "Energia di beccheggio nella banda di pump contro la rotazione di montaggio assunta. Il picco è la risposta."
  },
  "heave": {
    "h": "Heave, e perché il numero ha bisogno di un avvertimento",
    "p": "Di quanto una tavola veramente sale e scende mentre pompi? Integrare l'accelerazione due volte dà una risposta in centimetri, ed è il genere di numero che sembra autorevole ed è tranquillamente fragile. Tutto quello che è più lento della banda che tieni viene amplificato dal quadrato del suo periodo — una piccola deriva all'estremità bassa esce come metri di heave immaginario.",
    "p2": "La finestra di livellamento imposta quel bordo inferiore, e non è un parametro libero. Chiedi lo stesso run con una finestra di 1 secondo e ottieni 18 cm; chiedi con 5 secondi e ottieni 33 cm, per il run identico. Perciò deriviamo la finestra dalla **cadenza misurata** di quel run — qui 1,38 Hz, quindi 1,45 secondi — e contrassegniamo il numero come inaffidabile quando il movimento si siede troppo vicino al bordo. La lettura onesta di questo grafico non è *l'heave è 20 cm*; è *l'heave è 20 cm quando definisci heave come il movimento alla velocità di pump*.",
    "cap": "Lo stesso run, gli stessi dati, sei diverse finestre di livellamento: 18 cm a 33 cm."
  },
  "found": {
    "h": "Cosa quattro run ci hanno già detto",
    "p": "Questo è un piccolo mucchio di dati — quattro registrazioni della tavola — quindi queste sono osservazioni, non leggi. Sono, però, i primi numeri che abbiamo che descrivono la tavola piuttosto che il rider.",
    "li": [
      "**Il montaggio si trova automaticamente ed è stabile.** Su due run di un run l'angolo rilevato è variato di 3°, il che è rumore computazionale, non il telefono che si muove. Tra i run è variato esattamente di quanto il nastro ha fatto.",
      "**La cadenza è notevolmente costante.** 1,38 e 1,39 Hz su due run di un run; 1,45 Hz su un altro. La propulsione sembra meno uno sforzo e più una risonanza che qualcuno ha trovato.",
      "**L'heave è intorno a 20 cm** a quella cadenza, misurato da basso a alto, con l'avvertimento di sopra.",
      "**Il beccheggio oscilla circa ±19°, il rollio circa ±10°** in un run pulito — la tavola sta facendo molti più beccheggi che rollii, il che è esattamente quello che tutto l'approccio rilevatore assume e non aveva mai veramente controllato."
    ]
  },
  "limits": {
    "h": "Quello che questo ancora non prova",
    "p": "L'elenco delle cose che non possiamo pretendere è più lungo dell'elenco delle cose che possiamo, e dovrebbe rimanere così finché i dati non crescono:",
    "li": [
      "**Quattro run, un rider, una tavola, un lago.** Niente qui è validato tra rider diversi, e il nostro pump counting è ancora calibrato su una sola persona — vedi [Parte 3](/nerd-analysen-3) per quanto sottile sia quel terreno.",
      "**La rilevazione di planata ancora non esiste.** Il numero che mostriamo come la più lunga planata è il divario più lungo tra due pump *rilevate*, il che non è la stessa cosa e non lo è mai stato.",
      "**Nessuno fa un run con un telefono incollato alla sua tavola.** Questo è uno strumento di misura, non una funzionalità. Il suo lavoro è produrre la verità contro cui l'orologio al tuo polso viene misurato."
    ]
  },
  "videorun": {
    "h": "Il run stesso",
    "p": "L'esplicazione per questo setup, filmata al lago: cosa va sulla tavola, come è fissato, e cosa torna indietro.",
    "cap": "Telefono sulla tavola: GPS, giroscopio e accelerazione, misurati direttamente."
  },
  "next": {
    "h": "Dove va questo",
    "p": "Il punto di uno strumento di misura è puntarlo a qualcosa. I dati della tavola ci danno, per la prima volta, una verità di base per due domande che abbiamo solo stimato: **questo colpo è un pump**, e **quando la tavola ha smesso di volare**. Entrambi sono contati al polso oggi e calibrati su una persona. Come funziona questo conteggio è [Parte 2](/nerd-analysen-2); quanto bene regge contro un secondo sensore è [Parte 3](/nerd-analysen-3)."
  }
};


const ja: N4 = {
  "back": "← パート3：デュアルウォッチ計測",
  "h1": "パート4：ボードに貼り付けられた携帯電話",
  "subtitle": "センサーがリスト上ライドするのをやめるとき何を計測できるか",
  "intro": "このサイトが示すポンピングについてのすべての数字は、結局のところ、誰かの腕に縛られたセンサーから来ます。その腕が自分自身のことをします：揺れ、支える、バランス用に手を伸ばします。このシリーズの3つのパートで、私たちはそれを回避して働きました。2026年9月、私たちは回避するのをやめて、**ボードに携帯を貼り付けた** — GPS、加速度計、ジャイロスコープ、秒ごと50サンプル、本当に知りたい物に固定。これはどう出たかです。",
  "why": {
    "h": "リストが何を与え何を与えられないか",
    "p": "最初のサプライズはネガティブで、私たちが反対を期待したから説明する価値があります。ボード記録を2分離れた**同じライドからリスト上Garmin**の横に置き、周波数領域で各センサーが何を見るか比較。リストが絶望的なら、ポンプリズムはスメアとボード上スパイク。",
    "p2": "**両方**スパイク。同じピーク、同じ1.40 Hz、同じ高さ。リストはポンピングケイデンスを完璧に見つける — これは正確にポンプカウンターが最初に機能する理由：このライドではボード記録が**103ポンプ**、ウォッチが**106**、互いに3以内。だからボードは必要リズム聞く。それが与えるものは何か、リストが決して与えられる：**ボード自体の姿勢** — 鼻がどこまで下げるか、どこまで転べるか、全体物がどこまで上下するか。腕は無関係にレポート、どんなに良いセンサーであれ。",
    "cap": "同じライド、2つのセンサー、各20秒最長ラン。両方1.40 Hzを見る。"
  },
  "setup": {
    "h": "そのリグ、今のところ",
    "p": "マウント、ケース、ブラケットはありません。携帯はドライバッグに、ドライバッグはデッキを横切るストラップの下に、ストラップはボードが投げられている間、携帯がシフトできないほど引き締まっています。全コスト：1つのストラップ。全体的なポイントはこれが火曜の夜に誰でも繰り返すことができることである必要があり、データは1回以上収集できるなら価値があるからです。",
    "capDeck": "全セットアップ：ドライバッグはストラップの下、デッキを横切って、マストの前。",
    "capRail": "実行前に固定・確認 — 走行中に動く携帯は記録を台無しにします。"
  },
  "what": {
    "h": "ボード上の携帯が記録するもの",
    "p": "携帯は各ウォッチが対応するのと同じアップロード形式を書きますが、ウォッチが持たない1つのチャネル：**ジャイロスコープ**。その追加チャネルが何が可能かを作る — ジャイロは直接回転を計測、測定加速度のどの部分が重力でどれが動きか推測する必要なし。3つの生ストリームから私たちは3つの角と1つの距離を導出：",
    "li": [
      "**ピッチ** — 鼻が上下。これ*は*ポンプストロークです；他はすべて副次的。",
      "**ロール** — ボード左右に傾く。カービング、そしてストロークの小さな修正。",
      "**ヤー** — 見出し変更。GPSトラックに対してクロスチェック、両方が同じ物を計測し同意する必要があるから。",
      "**ヘーブ** — ボードが本当にどこまで上下するか、センチメートル、垂直加速度を2回統合から。"
    ],
    "cap": "1つのラン、28秒。ピッチトレースはポンピング；下のヘーブは同じリズム、センチメートルで。",
    "capTiles": "サイトが表示する同じ3つの角、トラックに沿って生で。"
  },
  "mount": {
    "h": "誰も警告しなかった問題：携帯はどう貼り付けられるか？",
    "p": "携帯はボード上にどう貼られるか考えがありません。縦に貼ったらピッチはピッチ。横に貼ったら携帯が呼ぶものはボード転がります。斜めに貼ったら — 最初の本当のライドで起きた — 純粋ピッチ振動が**同時に71%ピッチと71%ロール**として現れます。ライダーにそれを指定するよう頼む、正確に誰かが冷たい指で湿った携帯を再貼るまで機能。",
    "p2": "だからデータに答えさせます。ポンプはボードの横軸の周りの回転で、ジャイロは直接回転を計測。すべての可能な取付け角通して測定シグナルを回転し、ポンプバンド（0.6～2.5 Hz）でのピッチ振動が最も強い場所を求めます — その方向が横軸。下の画は2つのライドのためにその掃除：ボード横に貼った1つ携帯、斜めに貼ったもの。2つのライド、2つのクリーンなピーク、誰からの入力なし。掃除が決定できないものは鼻前方対後方、同じ軸だから；ランが始まってから最初の秒が落ち着く、鼻が下げ始まるから。",
    "cap": "ポンプバンドでのピッチエネルギー対仮定取付け回転。ピークが答え。"
  },
  "heave": {
    "h": "ヘーブ、そして数が注意が必要な理由",
    "p": "ボードはポンプ中どこまで実際に上下移動するか？加速度を2回統合するとセンチメートルでの答えをもたらし、権威あって見える種類の数で静かに脆い。遅いもの保つバンドより何かが周期の平方で増幅 — 低エンドでの小さなドリフトは想像ヘーブのメートルとして出ます。",
    "p2": "レベリングウィンドウがその下端を設定し、自由パラメータではありません。同じラン1秒ウィンドウで求めたら18 cm；5秒で求めたら33 cm、同じライド。したがって私たちはウィンドウを**その走ったケイデンス**から導出 — ここ1.38 Hz、したがって1.45秒 — そして動きが端に近く座るときいつでも数を信頼できないでマーク。この図のホネスト読みは*ヘーブが20 cm*ではない；それは*ポンピング速度での動きとしてヘーブを定義したとき、ヘーブが20 cm*です。",
    "cap": "同じラン、同じデータ、6つの異なるレベリングウィンドウ：18 cmから33 cm。"
  },
  "found": {
    "h": "4つのライドが既に私たちに伝えたもの",
    "p": "これはデータの小さいパイル — 4つのボード記録 — だからこれは観察で、法則ではありません。しかし、それらはライダーではなくボードを記述する最初の数字です。",
    "li": [
      "**取付けは自動的に見つかり安定です。** 1つのライドの2つのランで検出角が3°で変わりました、計算ノイズで、携帯が動いていません。ライド間、テープがした正確にはるかに変わりました。",
      "**ケイデンスは特に安定です。** 1つのライドの2つのランで1.38と1.39 Hz；別のもの1.45 Hz。ポンピングは努力より少なく共鳴見え誰か見つけた。",
      "**ヘーブは約20 cm**その周波数で、上への測定底、上記注意と。",
      "**ピッチは±19°、ロール約±10°**クリーンランで — ボードははるかに多くピッチしています転がるより、それはすべての検出のアプローチが仮定し決して実際にチェックしたこと。"
    ]
  },
  "limits": {
    "h": "これはまだ何を証明しません",
    "p": "我々が主張できない物のリストは我々が主張できるものより長く、データが増えるまでそのように留まるべき：",
    "li": [
      "**4つのライド、1つのライダー、1つのボード、1つの湖。** ここは何ライダーで検証されず、ポンプカウントはまだ1人で較正 — [パート3](/nerd-analysen-3)でどれほど薄いその地面が見てください。",
      "**グライド検出はまだ存在しません。** 数私たちは最長グライドとして見せるのは2つの*検出された*ポンプ間の最長ギャップで、同じ物ではなく決してありました。",
      "**誰もボード貼りポンで乗りません。** これは計測器、機能ではありません。その仕事は真実を生産することリスト上ウォッチが対して計測される。"
    ]
  },
  "videorun": {
    "h": "ライド自体",
    "p": "このセットアップ説明、湖で撮影：ボード上に何が来るか、どう固定されるか、何が帰ってくるか。",
    "cap": "ボード上の携帯：GPS、ジャイロスコープ、加速度、直接計測。"
  },
  "next": {
    "h": "これがどこへ行くか",
    "p": "計測器の要点はそれを何かで指すことです。ボードデータは最初に私たちに地面真実をもたらすこれまで推定しただけ2つの質問に：**これはストロークポンプか**、そして**ボードはいつフライを停止したか**。両方がリスト上カウントされ1人で較正。そのカウント機能方法は[パート2](/nerd-analysen-2)；2番目のセンサーに対してどれほどよく保つかは[パート3](/nerd-analysen-3)。"
  }
};


const nb: N4 = {
  "back": "← Del 3: Dobbelt-klokke-målingen",
  "h1": "Del 4: En mobil tapet på brettet",
  "subtitle": "Hva vi kan måle når sensoren slutter å ride på håndleddet",
  "intro": "Hvert tall denne nettsiden viser om pumping kommer til sist fra en sensor festa på noens arm. Den armen gjør sitt eget: den svinger, den støtter, den strekker seg for balanse. I tre deler av serien jobbet vi rundt det. I september 2026 sluttet vi å jobbe rundt det og **tapte en mobil på brettet** — GPS, akselerometer og gyroskop, 50 samples i sekunden, boltet på det vi faktisk vil vite om. Det er det som kom ut.",
  "why": {
    "h": "Hva håndleddet kan og ikke kan gi",
    "p": "Den første overraskelsen var en negativ, og det er verdt å si tydelig fordi vi forventet det motsatte. Vi la brett-opptaket ved siden av en **Garmin på håndleddet fra samme tur, to minutter fra hverandre**, og sammenlignet hva hver sensor ser i frekvensdomenet. Hvis håndleddet var håpløst, ville pump-rytmen være en utsmøring der og en spike på brettet.",
    "p2": "Det er en spike på **begge**. Samme topp, samme 1,40 Hz, samme høyde. Håndleddet finner pump-kadensen perfekt bra — som er nøyaktig hvorfor vår pump-teller fungerer i det hele tatt: på denne turen telte brett-opptaket **103 pumps** og klokken **106**, tre fra hverandre. Så brettet er ikke nødvendig for å høre rytmen. Det det gir er noe håndleddet aldri kan gi: **holdningen av brettet selv** — hvor langt nesen dyppes, hvor langt det ruller, hvor langt hele tingen stiger og faller. En arm kan ikke rapportere det, uansett hvor god sensoren på den er.",
    "cap": "Samme tur, to sensorer, 20 sekunder av den lengste turen hver. Begge ser 1,40 Hz."
  },
  "setup": {
    "h": "Riggen, slik den er",
    "p": "Det finnes ingen montering, ingen kasse, ingen holder. Mobilen går i en drybag, drybagen går under en rem på tvers av decket, og remen strammes så tett at mobilen ikke kan bevege seg mens brettet kastes rundt. Totalkostnad: en rem. Hele poenget er at dette må være noe hvem som helst kan gjøre på en tirsdags kveld, fordi dataene er bare verdt å ha hvis de kan samles inn mer enn en gang.",
    "capDeck": "Hele oppsettet: drybag under en rem, på tvers av decket, foran masten.",
    "capRail": "Festet ned og sjekket før turen — en mobil som beveger seg under kjøringen ødelegger opptaket."
  },
  "what": {
    "h": "Hva en mobil på brettet registrerer",
    "p": "Mobilen skriver samme opplastings-format som hver klokke vi støtter, pluss ett kanalet ingen av klokken har: **gyroskopet**. Den ekstra kanalen er det som gjør resten mulig — et gyroskop måler rotasjon direkte, uten å måtte gjette hvilken del av en målt akselerasjon som var tyngdekraft og hvilken som var bevegelse. Fra de tre råstrømmene avleder vi tre vinkler og ett mål:",
    "li": [
      "**Pitch** — nesen går opp og ned. Dette *er* pump-slaget; alt annet er sekundært.",
      "**Roll** — brettet lener seg venstre og høyre. Carving og de små korreksjonene mellom slag.",
      "**Yaw** — kursendringen. Kryss-sjekket mot GPS-sporet, fordi begge måler det samme og må stemme.",
      "**Heave** — hvor langt brettet faktisk stiger og faller, i centimeter, fra å integrere vertikal akselerasjon to ganger."
    ],
    "cap": "En tur, 28 sekunder. Pitch-sporet er pumpingen; heave under det er samme rytmen, i centimeter.",
    "capTiles": "De samme tre vinklene slik nettsiden viser dem, live langs sporet."
  },
  "mount": {
    "h": "Problemet ingen advarte oss om: hvilken vei er mobilen tapet?",
    "p": "En mobil aner ikke hvordan den er klistret fast på et brett. Tape den lengderetningen og pitch er pitch. Tape den på tvers og det mobilen kaller pitch er brettet som ruller. Tape den diagonalt — som skjedde på første virkelige tur — og en ren pitch-oscillasjon vises som **71 % pitch og 71 % roll samtidig**. Å spørre rytteren å spesifisere det fungerer helt til noen retaper en våt mobil med kaldt finger.",
    "p2": "Så vi lot dataene svare. Pumping er en rotasjon om brettet sin tverrkaksakse, og et gyroskop måler rotasjon direkte. Roter den målte signalen gjennom hver mulig monteringsvinkel og spør hvor pitch-oscillasjonen i pump-båndet (0,6–2,5 Hz) er sterkest — den retningen er tverrakselen. Bildet under er den sveipen for to turer: en mobil tapet på tvers av brettet, en tapet diagonalt. To turer, to rene topper, ingen inndata fra noen. Det sveipen ikke kan avgjøre er nese-fremover kontra nese-bakover, fordi det er samme akselen; det første sekundet av turen avgjør det, siden en tur starter med nesen dypet ned.",
    "cap": "Pitch-energi i pump-båndet mot antatt monteringsrotasjon. Toppen er svaret."
  },
  "heave": {
    "h": "Heave, og hvorfor tallet trenger et forbehold",
    "p": "Hvor langt beveger brettet seg faktisk opp og ned mens du pumper? Å integrere akselerasjon to ganger gir et svar i centimeter, og det er det slags tall som ser autoritativt ut og er stille skjørt. Alt saktere enn båndet du holder får forsterket ved kvadratet av sin periode — en liten drift ved den lave enden kommer ut som meter av imaginær heave.",
    "p2": "Utjevningsvinduen setter den nedre kanten, og det er ikke en fri parameter. Spør om samme tur med et 1-sekunders vindu og du får 18 cm; spør med 5 sekunder og du får 33 cm, for den identiske turen. Vi avleder derfor vinduen fra den **målte kadensen** av den turen — her 1,38 Hz, så 1,45 sekunder — og vi merker tallet som upålitelig når bevegelsen sitter for tett på kanten. Den ærlige lesningen av dette diagrammet er ikke *heave er 20 cm*; det er *heave er 20 cm når du definerer heave som bevegelsen ved pump-hastighet*.",
    "cap": "Den samme turen, de samme dataene, seks forskjellige utjevningsvinduer: 18 cm til 33 cm."
  },
  "found": {
    "h": "Hva fire turer allerede har fortalt oss",
    "p": "Det er en liten haug data — fire brett-opptak — så det er observasjoner, ikke lover. De er likevel de første tallene vi har som beskriver brettet i stedenfor rytteren.",
    "li": [
      "**Monteringen finnes automatisk og den er stabil.** Over to turer av en dag varierte den oppdagde vinkelen med 3°, som er beregningstøy, ikke mobilen som beveger seg. Mellom dager varierte det nøyaktig så mye som tapen gjorde.",
      "**Kadensen er bemerkelsesverdig stabil.** 1,38 og 1,39 Hz i to turer av en dag; 1,45 Hz på en annen. Pumping ser mindre ut som innsats og mer som en resonans noen har funnet.",
      "**Heave er omkring 20 cm** ved den kadensen, målt bunn til topp, med forbehold over.",
      "**Pitch svinger omkring ±19°, roll omkring ±10°** i en ren tur — brettet gjør langt mer pitching enn rolling, som er det hele detekterings-tilnærmingen antar og aldri faktisk sjekket."
    ]
  },
  "limits": {
    "h": "Hva dette ennå ikke beviser",
    "p": "Listen over ting vi ikke kan hevde er lengre enn listen over ting vi kan, og den skal bli sånn til dataene vokser:",
    "li": [
      "**Fire turer, en rytter, ett brett, en sjø.** Ingenting her er validert på tvers av rytterne, og vår pump-telling er fortsatt kalibrert på en enkelt person — se [Del 3](/nerd-analysen-3) for hvor tynt det grunnet er.",
      "**Glide-gjenkjenning eksisterer fortsatt ikke.** Tallet vi viser som lengste glide er det lengste gapet mellom to *gjenkjente* pumps, som ikke er det samme og var aldri det.",
      "**Ingen rider med en mobil tapet på sitt brett.** Det er et måleinstrument, ikke en funksjon. Jobben er å produsere sannheten som klokken på håndleddet ditt måles mot."
    ]
  },
  "videorun": {
    "h": "Turen selv",
    "p": "Forklaringen for dette oppsettet, filmet ved sjøen: hva som går på brettet, hvordan det blir festet, og hva som kommer tilbake.",
    "cap": "Mobil på brettet: GPS, gyroskop og akselerasjon, målt direkte."
  },
  "next": {
    "h": "Hvor det går",
    "p": "Poenget med et måleinstrument er å peke det på noe. Brett-dataene gir oss, for første gang, en ground truth for to spørsmål vi bare noen gang har estimert: **er dette slaget en pump**, og **når sluttet brettet å fly**. Begge telles på håndleddet i dag og kalibrert på en person. Hvordan den tellingen fungerer er [Del 2](/nerd-analysen-2); hvor bra det holder seg mot en annen sensor er [Del 3](/nerd-analysen-3)."
  }
};


const nl: N4 = {
  "back": "← Deel 3: De dubbel-horloge-meting",
  "h1": "Deel 4: Een telefoon op de board geplakt",
  "subtitle": "Wat we kunnen meten zodra de sensor niet meer op een pols zit",
  "intro": "Elk getal dat deze site over pompen toont, komt uiteindelijk van een sensor die om iemands pols vastzit. Die pols doet zijn eigen ding: hij zwaait, hij stijft af, hij steekt uit voor balans. Drie delen lang hebben we eromheen gewerkt. In september 2026 stopten we ermee en **plakten een telefoon op de board** — GPS, versnellingsmeter en gyroscoop, 50 monsters per seconde, vastgezet aan het ding waar we werkelijk iets over willen weten. Dit deel is wat daar uitkwam.",
  "why": {
    "h": "Wat de pols wel en niet kan",
    "p": "De eerste verrassing was een negatieve, en het loont om dat duidelijk uit te spreken omdat we het tegenovergestelde verwachtten. We zetten een **Garmin om de pols naast een van dezelfde run, twee minuten uit elkaar** en vergeleken wat elke sensor in het frequentiedomein ziet. Als de pols hopeloos zou zijn, zou de pompritme daar een wazig streep zijn en op de board een piek.",
    "p2": "Het is een piek op **allebei**. Dezelfde piek, dezelfde 1,40 Hz, dezelfde hoogte. De pols vindt het pompritme perfect — wat precies is waarom onze pompenteller überhaupt werkt: op deze run telde de boardsensor **103 pompen** en het horloge **106**, binnen drie van elkaar. De board is dus niet nodig om het ritme te horen. Wat het geeft is iets wat de pols nooit kan geven: **de houding van de board zelf** — hoe ver de neus duikt, hoe ver hij helt, hoe ver het hele ding op en neer gaat. Een pols kan dat niet rapporteren, hoe goed de sensor ook is.",
    "cap": "Dezelfde run, twee sensoren, 20 seconden van de langste sprint elk. Beide zien 1,40 Hz."
  },
  "what": {
    "h": "Wat een telefoon op de board opneemt",
    "p": "De telefoon schrijft dezelfde uploadformaat als elk horloge dat we ondersteunen, plus één kanaal dat geen enkel horloge heeft: **de gyroscoop**. Dat extra kanaal is wat de rest mogelijk maakt — een gyroscoop meet rotatie direct, zonder te moeten gissen welk deel van gemeten versnelling zwaartekracht is en welk beweging. Uit drie ruwe stromen leiden we drie hoeken en één afstand af:",
    "li": [
      "**Pitch** — de neus omhoog en omlaag. Dit *is* het pompslag; al het andere is secundair.",
      "**Roll** — de board links en rechts hellend. Carving en kleine correcties tussen slagen.",
      "**Yaw** — de koersverandering. Kruisgecontroleerd tegen het GPS-spoor, omdat beide hetzelfde meten en het eens moeten zijn.",
      "**Heave** — hoe ver de board werkelijk omhoog en omlaag gaat, in centimeters, door de verticale versnelling twee keer te integreren."
    ],
    "cap": "Eén sprint, 28 seconden. De pitch-curve is het pompen; de heave eronder is hetzelfde ritme, in centimeters.",
    "capTiles": "Dezelfde drie hoeken zoals de site ze toont, live langs het spoor."
  },
  "mount": {
    "h": "Het probleem waarvan niemand ons waarschuwde: in welke richting zat de telefoon geplakt?",
    "p": "Een telefoon weet niet hoe hij op een board zit geplakt. Plak hem lengterichting en pitch is pitch. Plak hem dwars en wat de telefoon pitch noemt is de board die helt. Plak hem diagonaal — wat gebeurde op de allereerste echte sprint — en een zuivere pitch-oscillatie komt tevoorschijn als **71 % pitch en 71 % roll tegelijk**. De rij vragen of hij het aangeeft werkt precies totdat iemand een natte telefoon met koude vingers opnieuw plakt.",
    "p2": "Dus laten we de data antwoorden. Pompen is een rotatie rond de dwarssas van de board, en een gyroscoop meet rotatie direct. Roteer het gemeten signaal door elke mogelijke montagehoek en vraag waar de pitch-oscillatie in de pompband (0,6–2,5 Hz) het sterkst is — die richting is de dwarssas. De afbeelding hieronder is die sweep voor twee sprints: één telefoon dwars op de board geplakt, één diagonaal. Twee sprints, twee schone pieken, geen invoer van iemand. Wat de sweep niet kan bepalen is neus-vooruit versus neus-achteruit, omdat dat dezelfde as is; de eerste seconde van de sprint bepaalt het, omdat een sprint begint met de neus die omlaag duikt.",
    "cap": "Pitch-energie in de pompband tegen de veronderstelde montagerotatie. De piek is het antwoord."
  },
  "heave": {
    "h": "Heave, en waarom het getal een voorbehoud nodig heeft",
    "p": "Hoe ver gaat een board werkelijk omhoog en omlaag terwijl je pompt? Versnelling twee keer integreren geeft een antwoord in centimeters, en het is het soort getal dat gezaghebbend lijkt en stiekem fragiel is. Alles langzamer dan de band die je houdt wordt versterkt met het kwadraat van zijn periode — een kleine drift aan de onderkant komt eruit als meters denkbeeldige heave.",
    "p2": "Het niveau-venster stelt die ondergrens in, en het is geen vrije parameter. Vraag dezelfde sprint met een 1-seconde-venster en je krijgt 18 cm; vraag met 5 seconden en je krijgt 33 cm, voor dezelfde sprint. We leiden dus het venster af van de **gemeten cadans** van die sprint — hier 1,38 Hz, dus 1,45 seconden — en we markeren het getal als onbetrouwbaar wanneer de beweging te dicht bij de rand zit. Het eerlijke lezen van deze grafiek is niet *de heave is 20 cm*; het is *de heave is 20 cm als je heave definieert als de beweging op pompsnelheid*.",
    "cap": "Dezelfde sprint, dezelfde gegevens, zes verschillende nivel-vensters: 18 cm tot 33 cm."
  },
  "found": {
    "h": "Wat vier sprints ons al hebben verteld",
    "p": "Dit is een klein stapeltje gegevens — vier boardopnamen — dus dit zijn waarnemingen, geen wetten. Ze zijn echter de eerste getallen die we hebben die de board beschrijven in plaats van de rij.",
    "li": [
      "**De montage wordt automatisch gevonden en is stabiel.** Over twee sprints van één ride varieerde de gedetecteerde hoek met 3°, wat computationele ruis is, niet dat de telefoon beweegt. Tussen rides varieerde het met precies zoveel als de tape.",
      "**Cadans is opmerkelijk stabiel.** 1,38 en 1,39 Hz in twee sprints van één ride; 1,45 Hz op een andere. Pompen lijkt minder op inspanning en meer op een resonantie die iemand heeft gevonden.",
      "**Heave is ongeveer 20 cm** op die cadans, gemeten van onder naar boven, met het voorbehoud hierboven.",
      "**Pitch schommelt ongeveer ±19°, roll ongeveer ±10°** in een schone sprint — de board doet veel meer pitchen dan rollen, wat precies is wat de hele detectiebenadering aanneemt en nooit echt heeft gecontroleerd."
    ]
  },
  "limits": {
    "h": "Wat dit nog niet bewijst",
    "p": "De lijst met dingen die we niet kunnen claimen is langer dan de lijst met dingen die we kunnen, en dat moet zo blijven totdat de gegevens groeien:",
    "li": [
      "**Vier sprints, één rij, één board, één meer.** Niets hier is gevalideerd over rijen heen, en onze pompenteller is nog steeds afgestemd op één persoon — zie [Deel 3](/nerd-analysen-3) voor hoe dun die basis is.",
      "**Glijdetectie bestaat nog niet.** Het getal dat we als langste glijding tonen is de langste kloof tussen twee *gedetecteerde* pompen, wat niet hetzelfde is en nooit was.",
      "**Niemand rijdt met een telefoon op hun board geplakt.** Dit is een meetinstrument, geen feature. Zijn taak is de waarheid voortbrengen waartegen het horloge op je pols wordt gemeten."
    ]
  },
  "videorun": {
    "h": "De sprint zelf",
    "p": "De uitleg voor deze opstelling, gefilmd bij het meer: wat op de board gaat, hoe het wordt vastgezet en wat terugkomt.",
    "cap": "Telefoon op de board: GPS, gyroscoop en versnelling, direct gemeten."
  },
  "next": {
    "h": "Waar dit heen gaat",
    "p": "Het punt van een meetinstrument is erop wijzen. De boardgegevens geven ons voor het eerst basistijden voor twee vragen die we alleen hebben geschat: **is dit een pomping**, en **wanneer stopte de board met vliegen**. Beide worden vandaag op de pols geteld en afgestemd op één persoon. Hoe die telwerk werkt is [Deel 2](/nerd-analysen-2); hoe goed het standhoudt tegen een tweede sensor is [Deel 3](/nerd-analysen-3)."
  },
  "setup": {
    "h": "De opstelling, zoals die is",
    "p": "Er is geen mount, geen case, geen beugel. De telefoon gaat in een drybag, de drybag gaat onder een riem over het dek, en de riem wordt aangetrokken zodat de telefoon niet kan verschuiven terwijl het board wordt rondgegooid. Totale kosten: één riem. Het hele punt is dat dit iets moet zijn wat iedereen op een dinsdagavond kan herhalen, want de gegevens zijn alleen de moeite waard als ze meer dan eens kunnen worden verzameld.",
    "capDeck": "De hele opstelling: drybag onder een riem, over het dek, voor de mast.",
    "capRail": "Vastgezet en gecontroleerd voor de sprint — een telefoon die mid-run verschuift, vergooit de opname."
  }
};


const ptPT: N4 = {
  "back": "← Parte 3: A medição de dupla relógio",
  "h1": "Parte 4: Um telemóvel colado à prancha",
  "subtitle": "O que conseguimos medir quando o sensor deixa de estar no pulso",
  "intro": "Cada número que este site mostra sobre bombeio vem, no fim, de um sensor preso ao braço. Esse braço faz a sua coisa própria: balanço, travagem, alcance para equilíbrio. Durante três partes desta série trabalhámos em volta disso. Em setembro de 2026 parámos de trabalhar em volta e **colámos um telemóvel à prancha** — GPS, acelerómetro e giroscópio, 50 amostras por segundo, pregado àquilo que realmente queremos saber. Esta parte é o que veio de lá.",
  "why": {
    "h": "O que o pulso consegue e não consegue dar",
    "p": "A primeira surpresa foi uma negativa e merece ser dita claramente porque esperávamos o oposto. Colocámos a gravação de prancha ao lado de um **Garmin no pulso da mesma anda, dois minutos depois**, e compárámos o que cada sensor vê no domínio de frequência. Se o pulso fosse inútil, o ritmo de bombeio seria um borrão lá e um pico na prancha.",
    "p2": "É um pico em **ambos**. Mesmo pico, mesmos 1,40 Hz, mesma altura. O pulso encontra a cadência de bombeio perfeitamente bem — que é exatamente porque o nosso contador de bombeio funciona: nesta anda a gravação de prancha contou **103 bombeios** e o relógio **106**, dentro de três um do outro. Portanto a prancha não é necessária para ouvir o ritmo. O que dá é algo que o pulso nunca pode dar: **a postura da prancha propriamente dita** — quanto o nariz desce, quanto ela inclina, quanto a coisa toda sobe e desce. Um braço não consegue relatar isto, não importa quão bom seja o sensor nele.",
    "cap": "Mesma anda, dois sensores, 20 segundos da sessão mais longa cada. Ambos veem 1,40 Hz."
  },
  "setup": {
    "h": "O equipamento, tal como é",
    "p": "Não há suporte, não há caixa, não há bracket. O telemóvel vai num saco seco, o saco seco fica sob uma fita atravessando o convés, e a fita aperta-se com força suficiente para que o telemóvel não se mova enquanto a prancha está a ser atirada para o ar. Custo total: uma fita. O ponto inteiro é que isto tem de ser algo que qualquer um consiga repetir numa terça-feira à noite, porque os dados só valem a pena recolher se forem coletados mais de uma vez.",
    "capDeck": "Todo o equipamento: saco seco sob uma fita, atravessando o convés, à frente do mastro.",
    "capRail": "Preso com fita e verificado antes da anda — um telemóvel que se move durante a anda estraga a gravação."
  },
  "what": {
    "h": "O que um telemóvel na prancha grava",
    "p": "O telemóvel escreve o mesmo formato de upload que cada relógio que suportamos, mais um canal que nenhum relógio tem: **o giroscópio**. Esse canal extra é o que torna o resto possível — um giroscópio mede rotação diretamente, sem ter de adivinhar qual parte de uma aceleração medida era gravidade e qual era movimento. Dos três fluxos brutos derivamos três ângulos e uma distância:",
    "li": [
      "**Inclinação** — o nariz a subir e descer. Isto *é* o golpe de bombeio; tudo mais é secundário.",
      "**Inclinação lateral** — a prancha a inclinar esquerda e direita. Curva e pequenas correções entre golpes.",
      "**Guinada** — mudança de curso. Verificada contra a pista de GPS, porque ambas medem a mesma coisa e devem concordar.",
      "**Heave** — quanto a prancha realmente sobe e desce, em centímetros, a partir de integração dupla da aceleração vertical."
    ],
    "cap": "Uma sessão, 28 segundos. O traço de inclinação é o bombeio; o heave abaixo é o mesmo ritmo, em centímetros.",
    "capTiles": "Os mesmos três ângulos como o site os mostra, ao vivo ao longo do percurso."
  },
  "mount": {
    "h": "O problema que ninguém nos avisou: em que direção o telemóvel é colado?",
    "p": "Um telemóvel não tem ideia como fica preso a uma prancha. Cola-o ao comprido e inclinação é inclinação. Cola-o ao largo e o que o telemóvel chama inclinação é a prancha a inclinar. Cola-o diagonalmente — o que aconteceu na primeira anda real — e uma oscilação de inclinação pura aparece como **71% inclinação e 71% inclinação lateral ao mesmo tempo**. Pedir ao surfista para especificar funciona exatamente até alguém re-colar um telemóvel molhado com dedos frios.",
    "p2": "Portanto deixámos os dados responder. Bombeio é rotação sobre o eixo transversal da prancha, e um giroscópio mede rotação diretamente. Roda o sinal medido em todos os ângulos de montagem possíveis e pergunta onde a oscilação de inclinação na banda de bombeio (0,6–2,5 Hz) é mais forte — essa direção é o eixo transversal. A imagem abaixo é esse varrimento para duas andas: um telemóvel colado ao largo da prancha, um colado diagonalmente. Duas andas, dois picos limpos, nenhuma entrada de ninguém. O que o varrimento não consegue decidir é nariz-para-frente contra nariz-para-trás, porque é o mesmo eixo; o primeiro segundo da anda o resolve, já que uma anda começa com o nariz a descer.",
    "cap": "Energia de inclinação na banda de bombeio contra a rotação de montagem assumida. O pico é a resposta."
  },
  "heave": {
    "h": "Heave, e porque o número precisa de uma caverna",
    "p": "Quanto é que uma prancha realmente sobe e desce enquanto bombeia? Integrar aceleração duas vezes dá uma resposta em centímetros, e é o tipo de número que parece autoritário e é silenciosamente frágil. Tudo mais lento que a banda que mantém é amplificado pelo quadrado do seu período — uma pequena deriva na extremidade baixa sai como metros de heave imaginário.",
    "p2": "A janela de nivelação define essa borda baixa, e não é um parâmetro livre. Peça a mesma anda com janela de 1-segundo e obtém 18 cm; peça com 5 segundos e obtém 33 cm, para a mesma anda. Portanto derivamos a janela da **cadência medida** dessa anda — aqui 1,38 Hz, portanto 1,45 segundos — e marcamos o número como não fiável sempre que o movimento fica muito perto da borda. A leitura honesta deste gráfico não é *o heave é 20 cm*; é *o heave é 20 cm quando defines heave como o movimento à velocidade de bombeio*.",
    "cap": "A mesma anda, os mesmos dados, seis janelas de nivelação diferentes: 18 cm a 33 cm."
  },
  "found": {
    "h": "O que quatro andas já nos disseram",
    "p": "Isto é uma pequena pilha de dados — quatro gravações de prancha — portanto estas são observações, não leis. Mas são, no entanto, os primeiros números que temos que descrevem a prancha e não o surfista.",
    "li": [
      "**A montagem é encontrada automaticamente e é estável.** Em duas andas de uma sessão o ângulo detetado variou em 3°, que é ruído computacional, não o telemóvel a mover-se. Entre andas variou por exatamente quanto a fita foi.",
      "**Cadência é notavelmente constante.** 1,38 e 1,39 Hz em duas andas de uma sessão; 1,45 Hz noutra. Bombeio parece menos esforço e mais uma ressonância que alguém encontrou.",
      "**Heave fica à volta de 20 cm** nessa cadência, medido de baixo a cima, com a caverna acima.",
      "**Inclinação oscila uns ±19°, inclinação lateral uns ±10°** numa anda limpa — a prancha está a fazer muito mais inclinação que inclinação lateral, o que é o que toda a abordagem de deteção assume e nunca tinha verificado realmente."
    ]
  },
  "limits": {
    "h": "O que isto ainda não prova",
    "p": "A lista de coisas que não conseguimos afirmar é mais longa que a lista de coisas que conseguimos, e deve ficar assim enquanto os dados crescem:",
    "li": [
      "**Quatro andas, um surfista, uma prancha, um lago.** Nada aqui é validado entre surfistas, e a nossa contagem de bombeio ainda é calibrada numa pessoa — vê [Parte 3](/nerd-analysen-3) para quão fino é o chão.",
      "**Deteção de planagem ainda não existe.** O número que mostramos como planagem mais longa é a lacuna mais longa entre dois *bombeios detetados*, que não é a mesma coisa e nunca foi.",
      "**Ninguém anda com um telemóvel colado à prancha.** Isto é um instrumento de medição, não uma característica. O seu trabalho é produzir a verdade contra que o relógio no teu pulso é medido."
    ]
  },
  "videorun": {
    "h": "A anda propriamente",
    "p": "O explicador para este equipamento, filmado no lago: o que vai na prancha, como é fixado, e o que volta.",
    "cap": "Telemóvel na prancha: GPS, giroscópio e aceleração, medidos diretamente."
  },
  "next": {
    "h": "Para onde isto vai",
    "p": "O ponto de um instrumento de medição é ser apontado para algo. Os dados de prancha dão-nos, pela primeira vez, verdade fundamental para duas perguntas que apenas estimámos: **é este golpe um bombeio**, e **quando a prancha parou de voar**. Ambas são contadas no pulso hoje e calibradas numa pessoa. Como funciona essa contagem é [Parte 2](/nerd-analysen-2); como fica contra um segundo sensor é [Parte 3](/nerd-analysen-3)."
  }
};


const pt: N4 = {
  "back": "← Parte 3: A medição dual-relógio",
  "h1": "Parte 4: Um Celular Fita na Prancha",
  "subtitle": "O que conseguimos medir quando o sensor para de estar no pulso",
  "intro": "Cada número que este site mostra sobre bombeio vem, no final das contas, de um sensor preso ao braço de alguém. Esse braço faz suas próprias coisas: balança, se equilibra, se estende para manter o equilíbrio. Por três partes desta série trabalhamos contornando isso. Em setembro de 2026 paramos de contornar e **fitamos um celular na prancha** — GPS, acelerómetro e giroscópio, 50 amostras por segundo, preso à coisa que realmente queremos saber. Esta parte é o que saiu.",
  "why": {
    "h": "O Que o Pulso Consegue e Não Consegue Dar",
    "p": "A primeira surpresa foi uma negativa, e vale a pena afirmá-la claramente porque esperávamos o oposto. Colocamos a gravação de prancha ao lado de um **Garmin no pulso do mesmo passeio, dois minutos de diferença**, e comparamos o que cada sensor vê no domínio de frequência. Se o pulso fosse sem esperança, o ritmo de pump seria um borrão lá e um spike na prancha.",
    "p2": "É um spike em **ambos**. Mesmo peak, mesmos 1,40 Hz, mesma altura. O pulso encontra perfeitamente a cadência de bombeio — que é exatamente por que nosso contador de pump funciona: neste passeio a gravação de prancha contou **103 pumps** e o relógio **106**, dentro de três uma da outra. Então a prancha não é necessária para ouvir o ritmo. O que dá é algo que o pulso nunca pode dar: **a atitude da prancha em si** — quão longe o nariz mergulha, quão longe ele rola, quão longe tudo se eleva e cai. Um braço não consegue relatar isso, não importa quão bom o sensor nele seja.",
    "cap": "Mesmo passeio, dois sensores, 20 segundos do maior lauf cada. Ambos veem 1,40 Hz."
  },
  "what": {
    "h": "O Que um Celular na Prancha Grava",
    "p": "O celular escreve o mesmo formato de upload como cada relógio que suportamos, mais um canal que nenhum dos relógios tem: **o giroscópio**. Esse canal extra é o que faz o resto possível — um giroscópio mede rotação diretamente, sem ter que adivinhar qual parte de uma aceleração medida foi gravidade e qual foi movimento. Dos três fluxos brutos derivamos três ângulos e uma distância:",
    "li": [
      "**Pitch** — o nariz subindo e descendo. Isso *é* o acidente de pump; tudo mais é secundário.",
      "**Roll** — a prancha inclinando esquerda e direita. Carving e as pequenas correções entre strokes.",
      "**Yaw** — a mudança de rumo. Verificado cruzadamente contra a trilha GPS, porque ambos medem a mesma coisa e devem concordar.",
      "**Heave** — quão longe a prancha realmente sobe e desce, em centímetros, de integrar a aceleração vertical duas vezes."
    ],
    "cap": "Um lauf, 28 segundos. O traço de pitch é o bombeio; o heave abaixo dele é o mesmo ritmo, em centímetros.",
    "capTiles": "Os mesmos três ângulos que o site mostra ao vivo ao longo do percurso."
  },
  "mount": {
    "h": "O Problema Que Ninguém Nos Avistou: De Qual Forma o Celular Está Fitado?",
    "p": "Um celular não tem ideia de como está preso a uma prancha. Tape-o longitudinalmente e pitch é pitch. Tape-o atravessado e o que o celular chama pitch é a prancha rolando. Tape-o diagonalmente — o que aconteceu no primeiríssimo passeio real — e uma pura oscilação de pitch aparece como **71 % pitch e 71 % roll ao mesmo tempo**. Pedir ao ciclista para especificar funciona exatamente até alguém re-fitar um celular molhado com dedos frios.",
    "p2": "Então deixamos os dados responder. Bombeio é uma rotação sobre o eixo transversal da prancha, e um giroscópio mede rotação diretamente. Rotacione o sinal medido por todo ângulo de montagem possível e pergunte onde a oscilação de pitch na faixa de pump (0,6–2,5 Hz) é mais forte — essa direção é o eixo transversal. A imagem abaixo é esse varre para dois passeios: um celular fitado através da prancha, um fitado diagonalmente. Dois passeios, dois picos limpos, nenhuma entrada de ninguém. O que o varre não consegue decidir é nariz-para-frente versus nariz-para-trás, porque isso é o mesmo eixo; o primeiro segundo do lauf o decide, já que um lauf começa com o nariz mergulhando.",
    "cap": "Energia de pitch na faixa de pump contra a rotação de montagem assumida. O pico é a resposta."
  },
  "heave": {
    "h": "Heave, e Por Que o Número Precisa de Uma Ressalva",
    "p": "Quão longe uma prancha realmente se move para cima e para baixo enquanto você bombeia? Integrar aceleração duas vezes dá uma resposta em centímetros, e é o tipo de número que parece autoritário e é silenciosamente frágil. Qualquer coisa mais lenta que a faixa que você mantém fica amplificada pelo quadrado de seu período — uma pequena deriva na borda baixa sai como metros de heave imaginário.",
    "p2": "A janela de nivelamento define essa borda inferior, e não é um parâmetro livre. Peça pelo mesmo lauf com janela de 1 segundo e você obtém 18 cm; peça com 5 segundos e obtém 33 cm, para o passeio idêntico. Portanto derivamos a janela da **cadência medida** daquele lauf — aqui 1,38 Hz, então 1,45 segundos — e marcamos o número como não confiável sempre que o movimento fica muito perto da borda. A leitura honesta deste gráfico não é *o heave é 20 cm*; é *o heave é 20 cm quando você define heave como o movimento em velocidade de bombeio*.",
    "cap": "O mesmo lauf, os mesmos dados, seis janelas de nivelamento diferentes: 18 cm a 33 cm."
  },
  "found": {
    "h": "O Que Quatro Passeios Já Nos Disseram",
    "p": "É uma pequena pilha de dados — quatro gravações de prancha — então essas são observações, não leis. Elas são, no entanto, os primeiros números que temos que descrevem a prancha em vez do ciclista.",
    "li": [
      "**A montagem é encontrada automaticamente e é estável.** Entre dois laufs de um passeio o ângulo detectado variou por 3°, que é ruído de computação, não o celular se movimentando. Entre passeios variou exatamente tanto quanto a fita fez.",
      "**Cadência é notavelmente estável.** 1,38 e 1,39 Hz em dois laufs de um passeio; 1,45 Hz em outro. Bombeio parece menos como esforço e mais como uma ressonância que alguém encontrou.",
      "**Heave fica em torno de 20 cm** naquela cadência, medido de baixo para cima, com a ressalva acima.",
      "**Pitch oscila cerca de ±19°, roll cerca de ±10°** num lauf limpo — a prancha está fazendo muito mais pitch do que roll, o que é exatamente o que toda abordagem de detecção assume e nunca realmente verificou."
    ]
  },
  "limits": {
    "h": "O Que Isto Ainda Não Prova",
    "p": "A lista de coisas que não podemos reivindicar é mais longa que a lista de coisas que conseguimos, e deve permanecer assim até os dados crescerem:",
    "li": [
      "**Quatro passeios, um ciclista, uma prancha, um lago.** Nada aqui é validado entre ciclistas, e nossa contagem de pump ainda é calibrada em uma pessoa — veja [Parte 3](/nerd-analysen-3) para quão fino é aquele solo.",
      "**Detecção de glide ainda não existe.** O número que mostramos como glide mais longo é a lacuna mais longa entre dois pumps *detectados*, o que não é a mesma coisa e nunca foi.",
      "**Ninguém anda com um celular fitado na sua prancha.** Isto é um instrumento de medição, não um recurso. Seu trabalho é produzir a verdade contra a qual o relógio no seu pulso é medido."
    ]
  },
  "videorun": {
    "h": "O Próprio Passeio",
    "p": "O explicador para este setup, filmado no lago: o que vai na prancha, como é fixo e o que volta.",
    "cap": "Celular na prancha: GPS, giroscópio e aceleração, medido diretamente."
  },
  "next": {
    "h": "Para Onde Isso Vai",
    "p": "O ponto de um instrumento de medição é apontá-lo para algo. Os dados da prancha nos dão, pela primeira vez, uma verdade fundamental para duas perguntas que apenas estimamos: **esse stroke é um pump**, e **quando a prancha parou de voar**. Ambos são contados no pulso hoje e calibrados em uma pessoa. Como essa contagem funciona é [Parte 2](/nerd-analysen-2); quão bem isso funciona contra um segundo sensor é [Parte 3](/nerd-analysen-3)."
  },
  "setup": {
    "h": "O rig, tal como é",
    "p": "Não há montagem, nenhum case, nenhum suporte. O celular vai numa bolsa seca, a bolsa seca fica embaixo de um cinto cruzando o deck, e o cinto fica tão apertado que o celular não consegue se mover enquanto a prancha está sendo jogada por aí. Custo total: um cinto. O ponto inteiro é que isso tem que ser algo que qualquer um consiga repetir numa terça à noite, porque os dados só valem a pena se puderem ser coletados mais de uma vez.",
    "capDeck": "O setup completo: bolsa seca embaixo de um cinto, atravessando o deck, à frente do mastro.",
    "capRail": "Preso e checado antes do lauf — um celular que se move durante o lauf estraga a gravação."
  }
};


const ru: N4 = {
  "back": "← Часть 3: Двойные часы",
  "h1": "Часть 4: Телефон приклеен к доске",
  "subtitle": "Что мы можем измерить когда датчик перестаёт ездить на запястье",
  "intro": "Каждое число на этом сайте о Pumping происходит в конце концов от датчика привязанного к чьей-то руке. Та рука делает свои дела: машет, упирается, тянется для баланса. Три части этой серии мы работали вокруг этого. В сентябре 2026 мы перестали работать вокруг и **приклеили телефон к доске** — GPS, акселерометр и гироскоп, 50 samples в секунду, болтами прикреплено к вещи которую мы хотим знать. Эта часть то что вышло.",
  "why": {
    "h": "Что запястье может и не может дать",
    "p": "Первый сюрприз был отрицательный, и стоит высказать его прямо потому что мы ждали противоположного. Мы положили доска-запись рядом с **Garmin на запястье с того же лауна, два минуты спустя**, и сравнили что каждый датчик видит в частотной области. Если запястье бесполезно, ритм Pump был бы там размазан и шпиль на доске.",
    "p2": "Это шпиль на **обоих**. Тот же пик, тот же 1.40 Hz, одинаковая высота. Запястье находит Pump-кадансию идеально хорошо — что ровно почему наш счётчик Pump вообще работает: в этом лауне доска-запись насчитала **103 Pump** и часы **106**, в пределах трёх друг от друга. Таким образом доска не нужна чтобы слышать ритм. Что она даёт это то что запястье никогда не может дать: **положение самой доски** — как далеко носик опускается, как далеко он крены, как далеко целое поднимается и падает. Рука не может это сообщить, неважно как хороший датчик на ней.",
    "cap": "Один лаун, два датчика, 20 секунд самого длинного лауна каждый. Оба видят 1.40 Hz."
  },
  "setup": {
    "h": "Рига, такая какая она есть",
    "p": "Нет крепления, нет корпуса, нет скобки. Телефон идёт в драй-мешок, драй-мешок идёт под ремень поперёк деки, и ремень затягивается достаточно плотно чтобы телефон не мог сместиться когда доска выполняет акробатику. Полная стоимость: один ремень. Весь смысл в том что это должно быть что-то что каждый может повторить вечером во вторник, потому что данные стоят иметь только если их можно собрать больше одного раза.",
    "capDeck": "Вся установка: драй-мешок под ремнём, поперёк деки, впереди мачты.",
    "capRail": "Стянут и проверен перед лауном — телефон который движется посередине лауна портит запись."
  },
  "what": {
    "h": "Что телефон на доске записывает",
    "p": "Телефон пишет тот же формат загрузки что каждые часы которые мы поддерживаем, плюс один канал который ни одни часы не имеют: **гироскоп**. Этот дополнительный канал это то что делает остальное возможным — гироскоп измеряет поворот напрямую, без необходимости угадывать какая часть измеренного ускорения была гравитация и какая была движение. Из трёх сырых потоков мы выводим три угла и одно расстояние:",
    "li": [
      "**Pitch** — носик вверх и вниз. Это *есть* Pump-ход; всё остальное вторично.",
      "**Roll** — доска кренится влево и вправо. Карвинг, и маленькие коррекции между ходами.",
      "**Yaw** — изменение курса. Перепроверено против GPS-пути, потому что оба измеряют одно и то же и должны согласиться.",
      "**Heave** — как далеко доска на самом деле поднимается и падает, в сантиметрах, из интегрирования вертикального ускорения дважды."
    ],
    "cap": "Один лаун, 28 секунд. Pitch-трасса это Pumping; heave ниже это тот же ритм, в сантиметрах.",
    "capTiles": "Те же три угла как сайт их показывает, живые вдоль трека."
  },
  "mount": {
    "h": "Проблема которую никто не предупредил нас: какой стороной приклеен телефон?",
    "p": "Телефон не имеет идеи как он приклеен к доске. Приклей его вдоль и pitch это pitch. Приклей его поперёк и что телефон называет pitch это доска-roll. Приклей его диагонально — что произошло на самом первом реальном лауне — и чистая pitch-осцилляция показывается как **71 % pitch и 71 % roll в одно и то же время**. Просить гонщика указать это работает ровно до пока кто-то не переклеит мокрый телефон с холодными пальцами.",
    "p2": "Таким образом мы позволили данным ответить. Pumping это поворот вокруг поперечной оси доски, и гироскоп измеряет поворот напрямую. Поворни измеренный сигнал через каждый возможный угол монтажа и спроси где pitch-осцилляция в Pump-диапазоне (0.6–2.5 Hz) самая сильная — то направление это поперечная ось. Картинка внизу это тот развёртка для двух лаунов: один телефон приклеен поперёк доски, один приклеен диагонально. Два лауна, два чистых пика, никаких входных данных от кого-либо. Что развёртка не может решить это носик-вперёд против носик-назад, потому что это одна и та же ось; первая секунда лауна решает, так как лаун начинается с опускания носика.",
    "cap": "Pitch-энергия в Pump-диапазоне против предполагаемого монтажного поворота. Пик это ответ."
  },
  "heave": {
    "h": "Heave, и почему число нуждается в оговорке",
    "p": "Как далеко доска на самом деле движется вверх и вниз когда ты Pump? Интегрирование ускорения дважды даёт ответ в сантиметрах, и это вид числа что выглядит авторитетным и тихо хрупкое. Всё медленнее чем диапазон который ты держишь получает усилено квадратом его периода — малый дрейф на низком конце выходит как метры воображаемого heave.",
    "p2": "Окно выравнивания устанавливает этот нижний край, и это не свободный параметр. Спроси за тот же лаун с 1-секундным окном и получишь 18 cm; спроси с 5 секунд и получишь 33 cm, для одного и того же лауна. Мы таким образом выводим окно из **измеренной кадансии** того лауна — здесь 1.38 Hz, таким образом 1.45 секунды — и мы отмечаем число как ненадёжное когда движение сидит слишком близко к краю. Честное чтение этой диаграммы не *heave это 20 cm*; это *heave это 20 cm когда определяешь heave как движение на Pump-скорости*.",
    "cap": "Тот же лаун, те же данные, шесть разных окон выравнивания: 18 cm до 33 cm."
  },
  "found": {
    "h": "Что четыре лауна уже рассказали нам",
    "p": "Это маленькая кучка данных — четыре доска-записи — таким образом это наблюдения, не законы. Они однако первые числа которые мы имеем что описывают доску вместо гонщика.",
    "li": [
      "**Монтаж найден автоматически и он стабилен.** Через два лауна одного лауна обнаруженный угол варьировался на 3°, что это вычислительный шум, не телефон движется. Между лаунами он варьировался ровно столько сколько лента сделала.",
      "**Кадансия очень стабильна.** 1.38 и 1.39 Hz в двух лаунах одного лауна; 1.45 Hz на другом. Pumping выглядит менее как усилие и более как резонанс кто-то нашёл.",
      "**Heave около 20 cm** на той кадансии, измеренные низ к верхушке, с оговоркой выше.",
      "**Pitch колеблется около ±19°, roll около ±10°** в чистом лауне — доска делает намного более pitch чем roll, что это всё что подход детекции предполагает и никогда на самом деле не проверял."
    ]
  },
  "limits": {
    "h": "Что это всё еще не доказывает",
    "p": "Список вещей которые мы не можем требовать длиннее чем список вещей которые можем, и он должен оставаться так до данные растут:",
    "li": [
      "**Четыре лауна, один гонщик, одна доска, одно озеро.** Ничто здесь не валидировано через гонщиков, и наш Pump-подсчёт ещё откалиброван на одного человека — см. [Часть 3](/nerd-analysen-3) как тонкая та земля.",
      "**Глайд-детекция всё ещё не существует.** Число которое мы показываем как самый длинный глайд это самая длинная щель между двумя *обнаруженными* Pumps, что это не одно и то же и никогда не было.",
      "**Никто не катается с телефоном приклеенным к их доске.** Это измерительный инструмент, не функция. Его работа это произвести истину что часы на твоём запястье измеряются против."
    ]
  },
  "videorun": {
    "h": "Сам лаун",
    "p": "Объяснитель для этой установки, снято у озера: что идёт на доску, как это фиксируется, и что возвращается.",
    "cap": "Телефон на доске: GPS, гироскоп и ускорение, измеренные напрямую."
  },
  "next": {
    "h": "Где это идёт",
    "p": "Смысл измерительного инструмента в том чтобы быть указанным на что-то. Доска-данные дают нам, в первый раз, основную истину для двух вопросов которые мы только когда-либо оценивали: **это ход Pump**, и **когда доска перестала летать**. Оба считаются на запястье сегодня и откалиброваны на одного человека. Как этот подсчёт работает это [Часть 2](/nerd-analysen-2); как хорошо это выдерживает против второго датчика это [Часть 3](/nerd-analysen-3)."
  }
};


const zh: N4 = {
  "back": "← 第3部分：双表测量",
  "h1": "第4部分：手机胶带贴在板上",
  "subtitle": "传感器停止骑在手腕上后我们能测量什么",
  "intro": "这个网站显示的关于泵动的每一个数字最终来自绑在某人手臂上的传感器。那只手臂做它自己的事：它摇摆，它支撑，它伸出以获得平衡。在这个系列的三个部分中，我们绕过它。在2026年9月，我们停止了绕过它，**在板上胶带贴了一个手机** — GPS、加速度计和陀螺仪，每秒50个样本，螺栓固定在我们实际想要知道的东西。这部分是出来的。",
  "why": {
    "h": "手腕能和不能给什么",
    "p": "第一个惊喜是负面的，值得明确陈述，因为我们期望相反。我们将板记录放在同一骑行中的**Garmin手腕**旁边，相隔两分钟，并比较了每个传感器在频率域中看到的内容。如果手腕是无望的，泵动节奏在那里会是涂抹，在板上会是尖刺。",
    "p2": "它是一个尖刺**在两者上**。相同的峰值、相同的1.40 Hz、相同的高度。手腕完美地找到泵动频率 — 这正是为什么我们的泵动计数器在所有地方工作的原因：在这次骑行中，板记录计数**103泵**，手表**106**，彼此三个之内。所以板不是必需的去听节奏。它给的是手腕永远无法给的东西：**板本身的姿态** — 机头下沉多远，滚转多远，整个东西上升和下降多远。一只手臂无法报告，无论上面的传感器有多好。",
    "cap": "同一骑行，两个传感器，每个最长运行的20秒。两者都看到1.40 Hz。"
  },
  "setup": {
    "h": "整个设置，就这样",
    "p": "没有支架，没有外壳，没有卡箍。手机放在干袋中，干袋放在跨越甲板的带子下面，带子拉紧到足以防止手机在板被甩来甩去时移位。总成本：一条带子。整个要点是这必须是任何人都可以在周二晚上重复的事情，因为数据只有在能收集多次时才值得拥有。",
    "capDeck": "整个设置：干袋在带子下面，跨越甲板，桅杆前面。",
    "capRail": "在运行前绑紧并检查 — 在骑行中移动的手机会毁坏录音。"
  },
  "what": {
    "h": "手机在板上记录什么",
    "p": "手机写与我们支持的每个表相同的上传格式，加上没有表有的一个通道：**陀螺仪**。这个额外通道是使其余部分成为可能的 — 陀螺仪直接测量旋转，不必猜测测量加速度的哪部分是重力，哪部分是运动。从三个原始流我们派生三个角度和一个距离：",
    "li": [
      "**俯仰** — 机头上下。这*是*泵动笔划；其他一切都是次要的。",
      "**滚转** — 板向左右倾斜。转弯，以及笔划之间的小更正。",
      "**偏航** — 航向变化。对照GPS轨迹交叉检查，因为两者测量相同的东西并必须同意。",
      "**升沉** — 板实际上上升和下降多远，以厘米为单位，通过两次整合竖直加速度。"
    ],
    "cap": "一次运行，28秒。俯仰轨迹是泵动；下面的升沉是相同的节奏，以厘米为单位。",
    "capTiles": "与网站显示的三个角度相同，沿着轨迹实时显示。"
  },
  "mount": {
    "h": "没有人警告我们的问题：手机是如何胶带贴的？",
    "p": "手机不知道它如何贴在板上。纵向胶带它，俯仰就是俯仰。横向胶带它，手机称之为俯仰的是板滚转。斜着胶带它 — 这发生在非常第一次真实骑行 — 并且一个纯俯仰振荡显示为**71%俯仰和71%滚转同时**。要求骑手指定它工作准确，直到某人用冷手指重新胶带一个湿手机。",
    "p2": "所以我们让数据回答。泵动是围绕板的横向轴的旋转，陀螺仪直接测量旋转。将测量的信号旋转通过每个可能的安装角并询问泵动频带中的俯仰振荡（0.6–2.5 Hz）最强 — 那个方向是横向轴。下面的图片是那次扫描两次骑行：一个手机胶带贴横过板，一个斜着。两次骑行，两个干净的峰值，没有来自任何人的输入。扫描无法决定的是机头向前对向后，因为这是相同的轴；运行的第一秒定位它，因为运行以机头下沉开始。",
    "cap": "泵动频带中的俯仰能量对抗假定的安装旋转。峰值是答案。"
  },
  "heave": {
    "h": "升沉，以及为什么这个数字需要一个警告",
    "p": "板在你泵动时实际上上升和下降多远？两次整合加速度给出厘米的答案，它是看起来权威的那种数字，并且安静地脆弱。低于你保持的频带的任何东西被其周期的平方放大 — 低端的小漂移出现为升沉的米数。",
    "p2": "水平窗口设置那个下边缘，它不是一个自由参数。对相同的运行用1秒窗口询问你得到18厘米；对5秒要求你得到33厘米，对于相同的骑行。因此我们从该运行的**测量频率**派生窗口 — 这里1.38 Hz，所以1.45秒 — 并且我们标记数字为不可靠，无论何时运动太接近边缘。这个图表的诚实读数不是*升沉是20厘米*；它是*升沉是20厘米当你定义升沉为泵动速度处的运动时*。",
    "cap": "相同的运行，相同的数据，六个不同的水平窗口：18厘米到33厘米。"
  },
  "found": {
    "h": "四次骑行已经告诉我们什么",
    "p": "这是一小堆数据 — 四个板记录 — 所以这些是观察，不是规律。然而，它们是我们有的第一个描述板而不是骑手的数字。",
    "li": [
      "**安装被自动找到并且它是稳定的。**在一次骑行的两次运行中，检测的角度相差3°，这是计算噪声，不是手机移动。在骑行之间，它恰好变化得和胶带一样多。",
      "**频率惊人地稳定。**一次骑行中两次运行的1.38和1.39 Hz；另一次的1.45 Hz。泵动看起来不像努力，更像某人已经找到的共鸣。",
      "**升沉约20厘米**在那个频率，底部到顶部测量，有上面的警告。",
      "**俯仰摇晃约±19°，滚转约±10°**在干净的运行中 — 板做的远多俯仰而不是滚转，这正是整个检测方法假设的并且从未真的检查过。"
    ]
  },
  "limits": {
    "h": "这还不能证明什么",
    "p": "无法声称的事物列表比能声称的列表更长，直到数据增长它应该保持这样：",
    "li": [
      "**四次骑行，一个骑手，一个板，一个湖。**这里没有什么在骑手中被验证，我们的泵动计数仍然在单个人上校准 — 看[第3部分](/nerd-analysen-3)了解那个地面多薄。",
      "**滑行检测仍然不存在。**我们显示为最长滑行的数字是两个*检测到的*泵动之间的最长间隙，这不是同一个东西，从不是。",
      "**没有人骑手机胶带贴在他们的板上。**这是一个测量仪器，不是一个特性。它的工作是产生手腕上的表被测量的真相。"
    ]
  },
  "videorun": {
    "h": "骑行本身",
    "p": "这个设置的解释器，在湖边拍摄：什么进入板，它是如何固定的，以及什么回来。",
    "cap": "手机在板上：GPS、陀螺仪和加速度，直接测量。"
  },
  "next": {
    "h": "这去哪里",
    "p": "测量仪器的要点是指向某个东西。板数据给我们，第一次，两个问题的地面真相，我们只估计过：**这次笔划是否是泵动**，**板何时停止飞行**。两者都在手腕上今天计数并在单个人上校准。那个计数如何工作是[第2部分](/nerd-analysen-2)；它对第二个传感器的坚持有多好是[第3部分](/nerd-analysen-3)。"
  }
};


const pl: N4 = {
  "back": "← Część 3: Pomiar z dwoma zegarkami",
  "h1": "Część 4: Telefon zalepiony na desce",
  "subtitle": "Co możemy zmierzyć, gdy sensor przestaje jeździć na nadgarstku",
  "intro": "Każdy numer, który ta strona pokazuje o pompowaniu, pochodzi, ostatecznie, z sensora przywiązanego komuś do ramienia. To ramię robi swoje: huśta się, wspiera się, wyciąga się w równowagę. Przez trzy części tej serii pracowaliśmy wokół tego. We wrześniu 2026 przestaliśmy pracować wokół tego i **zalepiliśmy telefon na desce** — GPS, akcelerometr i żyroskop, 50 próbek na sekundę, przybolcowane do rzeczy, którą chcemy naprawdę znać. Ta część to co z tego wyszło.",
  "why": {
    "h": "Co nadgarstek może i czego nie może dać",
    "p": "Pierwsza niespodzianka była ujemna i warta wyraźnego wyznaczenia, ponieważ spodziewaliśmy się wbrew. Położyliśmy recording deszy obok **Garmina na nadgarstku z tej samej jazdy, dwie minuty osobno**, i porównaliśmy to, co każdy sensor widzi w domenie częstotliwości. Gdyby nadgarstek był beznadziejny, rytm pompowania byłby rozmyciem tam i pikiem na desce.",
    "p2": "To jest pik na **obu**. Ten sam pik, ten sam 1.40 Hz, ta sama wysokość. Nadgarstek znajduje rytm pompowania idealnie dobrze — co jest dokładnie dlaczego nasz licznik pompowania w ogóle działa: na tej jeździe recording deszy liczył **103 pompowania** a zegarek **106**, w obrębie trzech siebie. Tak że deska nie jest potrzebna do słuchania rytmu. To, co daje, to coś, czego nadgarstek nigdy nie może dać: **orientacja samej deszy** — jak daleko nos się chyla, jak daleko się przechyla, jak daleko całe się unosi i opada. Ramię nie może tego raportować, bez względu na to, jak dobry sensor na nim jest.",
    "cap": "Ta sama jazda, dwa sensory, po 20 sekund najdłuższego biegu. Oba widzą 1.40 Hz."
  },
  "setup": {
    "h": "Rig, taki jaki jest",
    "p": "Nie ma montażu, nie ma etui, nie ma wspornika. Telefon idzie w torbę na sucho, torba na sucho idzie pod pasem przez pokład, i pas idzie wystarczająco mocno, że telefon nie może się przesunąć, gdy deska jest rzucana wokół. Całkowity koszt: jeden pas. Cały sens jest taki, że to musi być coś, co każdy może powtórzyć we wtorek wieczorem, ponieważ dane są warte posiadania tylko, jeśli mogą być zebrane więcej niż raz.",
    "capDeck": "Cały setup: torba na sucho pod pasem, przez pokład, przed masztem.",
    "capRail": "Zaciśnięty i sprawdzony przed jazdą — telefon, który się porusza w trakcie jazdy, niszczy nagrywanie."
  },
  "what": {
    "h": "Co telefon na desce nagrywa",
    "p": "Telefon pisze ten sam format przesyłania co każdy zegarek, który wspieramy, plus jeden kanał, który żaden zegarek nie ma: **żyroskop**. Ten dodatkowy kanał to to, co sprawia, że reszta jest możliwa — żyroskop mierzy obrót bezpośrednio, bez konieczności zgadywania, która część zmierzonego przyspieszenia to grawitacja, a która to ruch. Z trzech surowych strumieni wyprowadzamy trzy kąty i jedną odległość:",
    "li": [
      "**Pitch** — nos idzie w górę i w dół. To *jest* skok pompowania; wszystko inne jest drugorzędne.",
      "**Roll** — deska przechyla się w lewo i prawo. Carving i małe korekty między skokami.",
      "**Yaw** — zmiana kursu. Krzyżowa sprawdzian względem ścieżki GPS, ponieważ obie mierzą to samo i muszą się zgadzać.",
      "**Heave** — jak daleko deska naprawdę się unosi i opada, w centymetrach, z integracji pionowego przyspieszenia dwa razy."
    ],
    "cap": "Jeden przebieg, 28 sekund. Ślad pitch to pompowanie; heave poniżej to ten sam rytm, w centymetrach.",
    "capTiles": "Te same trzy kąty, które strona pokazuje, na żywo wzdłuż ścieżki."
  },
  "mount": {
    "h": "Problem, o którym nikt nas nie ostrzegał: w którą stronę telefon jest zalepiony?",
    "p": "Telefon nie wie, jak jest przyklejony do dechy. Zalepij wzdłużnie i pitch to pitch. Zalepij poprzecz i to, co telefon nazywa pitch, to deska się przechyla. Zalepij po skosie — co się stało na bardzo pierwszej rzeczywistej jeździe — i czysty oscylacja pitch pojawia się jako **71% pitch i 71% roll jednocześnie**. Prosić jeźdźca, aby go określił, działa dokładnie dopóki ktoś nie zalepni na nowo mokry telefon z zimnych palców.",
    "p2": "Tak pozwalamy danym odpowiedzieć. Pompowanie jest rotacją wokół poprzecznej osi deszy, a żyroskop mierzy obrót bezpośrednio. Obróć zmierzony sygnał przez każdy możliwy kąt montażu i spytaj, gdzie oscylacja pitch w pasie pompowania (0.6–2.5 Hz) jest najsilniejsza — ten kierunek jest poprzeczną osią. Zdjęcie poniżej to ten przesiew dla dwóch jazd: jeden telefon zalepiony poprzecz deskę, jeden zalepiony po skosie. Dwie jazdy, dwa czyste piki, żaden wkład od nikogo. To, czego przesiew nie może zdecydować, to nos-do-przodu kontra nos-do-tyłu, ponieważ to ta sama oś; pierwsza sekunda jazdy to ustawia, ponieważ jazda zaczyna się od nosa pochylającego się w dół.",
    "cap": "Energia pitch w pasie pompowania względem założonego obrotu montażu. Pik to odpowiedź."
  },
  "heave": {
    "h": "Heave i dlaczego liczba potrzebuje zastrzeżenia",
    "p": "Jak daleko naprawdę deska się unosi i opada, gdy pompujesz? Integracja przyspieszenia dwa razy daje odpowiedź w centymetrach i jest to rodzaj liczby, który wygląda autorytatywnie i jest cicho kruchy. Wszystko wolniejsze niż pasmo, które przechowujesz, jest amplifikowane przez kwadrat jego okresu — mały dryft na niskim końcu wylatuje jako metry wymyślonego heave.",
    "p2": "Okno wyliczające ustawia ten dolny krawędź, i to nie jest wolny parametr. Poproś o ten sam przebieg z oknem 1-sekundowym a dostajesz 18 cm; poproś z 5 sekund a dostajesz 33 cm, na tej samej jeździe. Dlatego wyprowadzamy okno z **zmierzonej kadencji** tego przebiegu — tutaj 1.38 Hz, tak 1.45 sekundy — i oznaczamy liczbę jako niewiarygodną, ilekroć ruch siedzi zbyt blisko krawędzi. Uczciwe czytanie tego wykresu nie jest *heave to 20 cm*; to *heave to 20 cm, gdy definiujesz heave jako ruch przy prędkości pompowania*.",
    "cap": "Ten sam przebieg, te same dane, sześć różnych okien wyliczających: 18 cm na 33 cm."
  },
  "found": {
    "h": "Co cztery jazdy już nam powiedziały",
    "p": "To jest mała sterta danych — cztery recording desz — więc to są obserwacje, nie prawa. Są jednak pierwsze liczby, które mamy, które opisują deskę zamiast jeźdźca.",
    "li": [
      "**Montaż jest znajduje się automatycznie i jest stabilny.** Przez dwa przebieg jednej jazdy wykryty kąt różnił się o 3°, co jest szumem obliczeń, nie telefon się porusza. Między jazdami różnił się dokładnie tyle, ile taśma.",
      "**Kadencja jest niezwykle stała.** 1.38 i 1.39 Hz w dwóch przebiegów jednej jazdy; 1.45 Hz na innej. Pompowanie wygląda mniej jak wysiłek i bardziej jak rezonancja, którą ktoś znalazł.",
      "**Heave to około 20 cm** przy tej kadencji, mierzone od dna do góry, z zastrzeżeniem powyżej.",
      "**Pitch oscyluje około ±19°, roll około ±10°** w czystej jeździe — deska robi znacznie więcej pitchu niż rollu, co to, co całe podejście detekcji zakłada i nigdy faktycznie nie sprawdzało."
    ]
  },
  "limits": {
    "h": "Co to jeszcze nie dowodzi",
    "p": "Lista rzeczy, których nie możemy twierdzić, jest dłuższa niż lista rzeczy, które możemy, i powinno to pozostać tak, dopóki dane rosną:",
    "li": [
      "**Cztery jazdy, jeden jeźdźca, jedna deska, jedno jezioro.** Nic tutaj nie jest sprawdzane między jeźdźcami i nasze liczenie pompowania wciąż jest kalibrowane na jedną osobę — zobacz [Część 3](/nerd-analysen-3), jak cienkie to podłoże jest.",
      "**Detekcja szybowania wciąż nie istnieje.** Liczba, którą pokazujemy jako najdłuższe szybowanie, to najdłuższa luka między dwoma *wykrytymi* pompowaniami, co nie jest tym samym i nigdy nie było.",
      "**Nikt nie jeździ z telefonem zalepioną na desce.** To jest instrument pomiarowy, nie funkcja. Jego zadaniem jest wytwarzanie prawdy, względem której zegarek na twoim nadgarstku jest mierzony."
    ]
  },
  "videorun": {
    "h": "Sama jazda",
    "p": "Wyjaśniacz dla tego setupu, nagrany nad jeziorem: co idzie na deskę, jak się to naprawia, i co wraca.",
    "cap": "Telefon na desce: GPS, żyroskop i przyspieszenie, zmierzone bezpośrednio."
  },
  "next": {
    "h": "Gdzie to idzie",
    "p": "Sens instrumentu pomiarowego to wskazywanie na coś. Dane deszy dają nam, po raz pierwszy, podstawową prawdę dla dwóch pytań, które tylko kiedykolwiek oszacowaliśmy: **czy to skok to pompowanie**, i **kiedy deska przestała latać**. Oba są liczone na nadgarstku dzisiaj i kalibrowane na jedną osobę. Jak to liczenie działa to [Część 2](/nerd-analysen-2); jak dobrze się trzyma względem drugiego sensora to [Część 3](/nerd-analysen-3)."
  }
};

export const NERD4: Partial<Record<Lang, N4>> = { pl, zh, ru, pt, "pt-PT": ptPT, nl, nb, ja, it, id, gsw, fr, fi, es, de, "de-AT": deAT, cs, en };
