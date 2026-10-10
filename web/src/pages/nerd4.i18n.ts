// Inhalte für die Nerd-Analysen Teil 4 (Handy am Brett).
//
// Am 22.09.2026 zuerst nur Englisch („erstmal nur auf englisch"), danach in alle 18 Sprachen
// übersetzt; am 10.10.2026 alle Fassungen gegen `en` gegengelesen und neu gefasst (Jan: „macht das
// ordentlich") — Begriffe wie in src/i18n/locales, de-AT und gsw als echte Mundart.
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
  rules: { h: string; p: string; li: string[]; p2: string };
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

  rules: {
    h: "From measuring to counting: pumps, glides and touchdown",
    p: "Once the board reports its own motion, counting on the board no longer needs the wrist counter. Since **10 October 2026**, every recording with the phone on the board is counted by four simple rules that anyone can check:",
    li: [
      "**A pump is a stroke that puts energy in.** Every up-and-down of the board in the pump band (0.5–3 Hz) is one cycle. It counts as a pump only if the nose pitches in step with the vertical motion — technically, if the mean product of fast pitch and heave velocity over the cycle exceeds 30 % of the median of that run. Fading oscillations after the last stroke and small balance corrections move the board too, but they put no energy in.",
      "**The run ends at touchdown.** That is the first clean GPS point in the last 15 seconds of a run below max(8 km/h, 60 % of the run's cruising speed), minus 0.7 s for the lag of GPS speed. Touchdown can only shorten a run, never extend it.",
      "**Glide is flying without pumping.** Stretches without a pump of 1.5 to 15 seconds count as glide — the same rule the session map already used to show glides. The run-up before the first pump does not count, the end of the run does, and a stretch with missing motion data does not count at all.",
      "**Too short to judge stays as it was.** A run with fewer than five cycles has no meaningful median, so it keeps the count of the wrist counter.",
    ],
    p2: "Across the 20 board recordings of six riders we had on that day, the rules count **14 % fewer pumps** than the wrist counter, and glides make up **about 8 % of foiling time**. Most real glides last 2 to 6 seconds; the longest was 11.9 s, on a ride where the phone had been turned between runs — the rules assume a firmly fixed phone, and a phone that shifts produces glides that never happened. The old values stay stored next to the new ones, so every change can be traced back.",
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
      "**Glide time is measured on the board only.** On the wrist, the number we show as longest glide is still the longest gap between two *detected* pumps, which is not the same thing.",
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


const cs: N4 = {
  "back": "← Část 3: Měření se dvěma hodinkami",
  "h1": "Část 4: Telefon přilepený na prkno",
  "subtitle": "Co můžeme změřit, jakmile senzor přestane jezdit na zápěstí",
  "intro": "Každé číslo o pumpování, které tento web ukazuje, pochází nakonec ze senzoru připevněného k něčí ruce. A ta ruka si dělá, co chce: kmitá, zpevňuje se, natahuje se pro rovnováhu. Tři díly této série jsme tenhle problém obcházeli. V září 2026 jsme ho obcházet přestali a **přilepili jsme telefon na prkno** — GPS, akcelerometr a gyroskop, 50 vzorků za sekundu, pevně spojené s tím, co nás doopravdy zajímá. Tento díl ukazuje, co z toho vzešlo.",
  "why": {
    "h": "Co zápěstí dokáže říct a co ne",
    "p": "První překvapení bylo negativní a stojí za to ho říct naplno, protože jsme čekali opak. Položili jsme záznam z prkna vedle záznamu z **Garminu na zápěstí ze stejné vyjížďky, posunutého o dvě minuty**, a porovnali, co který senzor vidí ve frekvenční oblasti. Kdyby bylo zápěstí beznadějné, byl by rytmus pumpování tam rozmazaný hrbol a na prkně ostrý vrchol.",
    "p2": "Ostrý vrchol je na **obou**. Stejný vrchol, stejných 1,40 Hz, stejná výška. Zápěstí najde kadenci pumpování bez potíží — a právě proto naše počítadlo pumpnutí vůbec funguje: na této vyjížďce napočítal záznam z prkna **103 pumpnutí** a hodinky **106**, rozdíl jen tři. Na zachycení rytmu tedy prkno potřeba není. Dává ale něco, co zápěstí nikdy dát nemůže: **polohu samotného prkna** — jak moc se špička noří, jak moc se prkno naklání do strany, jak moc se celé zvedá a klesá. Ruka tohle sdělit nedokáže, ať je na ní senzor sebelepší.",
    "cap": "Stejná vyjížďka, dva senzory, z každého 20 sekund nejdelší jízdy. Oba vidí 1,40 Hz."
  },
  "what": {
    "h": "Co telefon na prkně zaznamenává",
    "p": "Telefon zapisuje stejný formát nahrávání jako všechny hodinky, které podporujeme, plus jeden kanál, který žádné hodinky nemají: **gyroskop**. Právě tento kanál navíc umožňuje všechno ostatní — gyroskop měří otáčení přímo a nemusí hádat, jaká část naměřeného zrychlení byla gravitace a jaká pohyb. Ze tří surových datových toků odvozujeme tři úhly a jednu vzdálenost:",
    "li": [
      "**Klopení (pitch)** — špička jde nahoru a dolů. To *je* samotný pohyb pumpování; všechno ostatní je vedlejší.",
      "**Klonění (roll)** — prkno se naklání doleva a doprava. Carving a drobné korekce mezi pumpnutími.",
      "**Zatáčení (yaw)** — změna kurzu. Ověřuje se proti stopě GPS, protože obojí měří totéž a musí se to shodovat.",
      "**Zdvih (heave)** — jak moc se prkno skutečně zvedá a klesá, v centimetrech, z dvojí integrace svislého zrychlení."
    ],
    "cap": "Jedna jízda, 28 sekund. Křivka klopení je pumpování; zdvih pod ní je tentýž rytmus v centimetrech.",
    "capTiles": "Tytéž tři úhly, jak je web ukazuje, živě podél trasy."
  },
  "mount": {
    "h": "Problém, před kterým nás nikdo nevaroval: jak je telefon vlastně přilepený?",
    "p": "Telefon netuší, jak je na prkně přilepený. Přilepte ho podélně a klopení je klopení. Přilepte ho napříč a to, co telefon považuje za klopení, je ve skutečnosti klonění prkna. Přilepte ho šikmo — přesně to se stalo hned při první skutečné vyjížďce — a čisté kmitání v klopení se objeví jako **71 % klopení a 71 % klonění současně**. Žádat jezdce, aby orientaci zadal, funguje přesně do chvíle, kdy někdo zkřehlými prsty znovu přilepí mokrý telefon.",
    "p2": "Necháme tedy odpovědět data. Pumpování je otáčení kolem příčné osy prkna a gyroskop měří otáčení přímo. Naměřený signál se výpočtem natočí do všech možných úhlů upevnění a hledá se, kde je kmitání klopení v pásmu pumpování (0,6–2,5 Hz) nejsilnější — tento směr je příčná osa. Obrázek níže ukazuje takové prohledání pro dvě vyjížďky: jeden telefon přilepený napříč, druhý šikmo. Dvě vyjížďky, dva čisté vrcholy, a nikdo nemusel nic zadávat. Co prohledání rozhodnout nedokáže, je, zda špička míří dopředu, nebo dozadu, protože jde o tutéž osu; to rozhodne první sekunda jízdy, protože každá jízda začíná tím, že se špička skloní dolů.",
    "cap": "Energie klopení v pásmu pumpování v závislosti na předpokládaném úhlu upevnění. Vrchol je odpověď."
  },
  "heave": {
    "h": "Zdvih a proč to číslo potřebuje výhradu",
    "p": "Jak moc se prkno při pumpování skutečně pohybuje nahoru a dolů? Dvojí integrace zrychlení dá odpověď v centimetrech a je to přesně ten druh čísla, který vypadá důvěryhodně, a přitom je potichu křehký. Všechno, co je pomalejší než ponechané pásmo, se zesílí úměrně druhé mocnině své periody — malý drift na spodním okraji se promění v metry smyšleného zdvihu.",
    "p2": "Dolní hranici určuje vyrovnávací okno a není to volně volitelný parametr. Spočítejte tutéž jízdu s oknem 1 sekunda a vyjde 18 cm; s oknem 5 sekund vyjde 33 cm — pro úplně stejnou vyjížďku. Proto okno odvozujeme z **naměřené kadence** dané jízdy — tady 1,38 Hz, tedy 1,45 sekundy — a číslo označíme jako nespolehlivé, kdykoli je pohyb příliš blízko této hranice. Poctivé čtení tohoto grafu tedy nezní *zdvih je 20 cm*, ale *zdvih je 20 cm, pokud zdvihem rozumíme pohyb v tempu pumpování*.",
    "cap": "Stejná jízda, stejná data, šest různých vyrovnávacích oken: od 18 cm do 33 cm."
  },
  "rules": {
    "h": "Od měření k počítání: pumpnutí, klouzání a dosednutí",
    "p": "Jakmile prkno hlásí vlastní pohyb, počítání na prkně už nepotřebuje počítadlo ze zápěstí. Od **10. října 2026** se každý záznam s telefonem na prkně počítá podle čtyř jednoduchých pravidel, která si může ověřit každý:",
    "li": [
      "**Pumpnutí je pohyb, který dodává energii.** Každý pohyb prkna nahoru a dolů v pásmu pumpování (0,5–3 Hz) je jeden cyklus. Jako pumpnutí se počítá jen tehdy, když špička kývá v taktu se svislým pohybem — technicky: když průměrný součin rychlého klopení a rychlosti zdvihu přes cyklus přesáhne 30 % mediánu dané jízdy. Doznívající kmity po posledním pumpnutí a drobné vyrovnávací pohyby prknem také hýbou, ale žádnou energii nedodávají.",
      "**Jízda končí dosednutím.** To je první čistý bod GPS v posledních 15 sekundách jízdy pod max(8 km/h, 60 % cestovní rychlosti jízdy), mínus 0,7 s za zpoždění rychlosti z GPS. Dosednutí může jízdu jen zkrátit, nikdy prodloužit.",
      "**Klouzání je létání bez pumpování.** Úseky bez pumpnutí dlouhé 1,5 až 15 sekund se počítají jako klouzání — stejné pravidlo, podle kterého už mapa vyjížďky klouzání ukazovala. Rozjezd před prvním pumpnutím se nepočítá, konec jízdy ano, a úsek s chybějícími daty o pohybu se nepočítá vůbec.",
      "**Co je příliš krátké na posouzení, zůstává, jak bylo.** Jízda s méně než pěti cykly nemá smysluplný medián, a proto si ponechá počet z počítadla na zápěstí."
    ],
    "p2": "Na 20 záznamech z prkna od šesti jezdců, které jsme ten den měli, napočítají pravidla **o 14 % méně pumpnutí** než počítadlo na zápěstí a klouzání tvoří **asi 8 % času na foilu**. Většina skutečných klouzání trvá 2 až 6 sekund; nejdelší trvalo 11,9 s, při vyjížďce, kdy byl telefon mezi jízdami pootočen — pravidla předpokládají pevně uchycený telefon a telefon, který se posune, vytváří klouzání, která se nikdy nestala. Staré hodnoty zůstávají uložené vedle nových, takže každou změnu lze zpětně dohledat."
  },
  "found": {
    "h": "Co nám čtyři vyjížďky už prozradily",
    "p": "Je to malá hrstka dat — čtyři záznamy z prkna — takže jde o pozorování, ne o zákony. Jsou to ale první čísla, která máme a která popisují prkno, a ne jezdce.",
    "li": [
      "**Orientace upevnění se najde automaticky a je stabilní.** Ve dvou jízdách jedné vyjížďky se zjištěný úhel lišil o 3° — to je šum výpočtu, ne posunutý telefon. Mezi vyjížďkami se lišil přesně o tolik, o kolik jinak ležela páska.",
      "**Kadence je pozoruhodně stálá.** 1,38 a 1,39 Hz ve dvou jízdách jedné vyjížďky; 1,45 Hz při jiné. Pumpování vypadá méně jako námaha a spíš jako rezonance, kterou někdo našel.",
      "**Zdvih je kolem 20 cm** při této kadenci, měřeno od nejnižšího bodu k nejvyššímu, s výhradou uvedenou výše.",
      "**Klopení kmitá zhruba o ±19°, klonění zhruba o ±10°** v čisté jízdě — prkno se tedy klopí mnohem víc, než se kloní. Přesně to předpokládá celý přístup k rozpoznávání, a nikdo to dosud doopravdy neověřil."
    ]
  },
  "limits": {
    "h": "Co to zatím nedokazuje",
    "p": "Seznam toho, co tvrdit nemůžeme, je delší než seznam toho, co tvrdit můžeme — a tak by to mělo zůstat, dokud nebude víc dat:",
    "li": [
      "**Čtyři vyjížďky, jeden jezdec, jedno prkno, jedno jezero.** Nic z toho není ověřeno na dalších jezdcích a naše počítání pumpnutí je stále kalibrované na jediné osobě — jak tenký je to základ, ukazuje [Část 3](/nerd-analysen-3).",
      "**Doba klouzání se měří jen na prkně.** Na zápěstí je číslo, které ukazujeme jako nejdelší klouzání, stále nejdelší mezera mezi dvěma *rozpoznanými* pumpnutími, a to není totéž.",
      "**Nikdo nejezdí s telefonem přilepeným na prkně.** Je to měřicí přístroj, ne funkce. Jeho úkolem je dodat pravdu, se kterou se porovnávají hodinky na tvém zápěstí."
    ]
  },
  "videorun": {
    "h": "Samotná vyjížďka",
    "p": "Video vysvětlující tuto výbavu, natočené u jezera: co se dává na prkno, jak se to připevní a co z toho vzejde.",
    "cap": "Telefon na prkně: GPS, gyroskop a zrychlení, měřeno přímo."
  },
  "next": {
    "h": "Kam to vede",
    "p": "Měřicí přístroj je tu od toho, aby se na něco zamířil. Data z prkna nám poprvé dávají referenci pro dvě otázky, které jsme dosud mohli jen odhadovat: **je tento pohyb pumpnutí** a **kdy prkno přestalo létat**. Obojí se dnes počítá na zápěstí a je kalibrované na jedné osobě. Jak toto počítání funguje, popisuje [Část 2](/nerd-analysen-2); jak obstojí proti druhému senzoru, [Část 3](/nerd-analysen-3)."
  },
  "setup": {
    "h": "Výbava, pokud se tomu tak dá říkat",
    "p": "Žádný držák, žádné pouzdro, žádná svorka. Telefon jde do vodotěsného vaku, vak pod popruh přes palubu prkna a popruh se utáhne tak pevně, aby se telefon nemohl posunout, ani když to s prknem hází. Celkové náklady: jeden popruh. Celý smysl je v tom, aby to kdokoli mohl zopakovat v obyčejný úterní večer, protože data mají cenu jen tehdy, když se dají nasbírat víc než jednou.",
    "capDeck": "Celá výbava: vodotěsný vak pod popruhem, napříč přes palubu, před stěžněm.",
    "capRail": "Upnuto a zkontrolováno před jízdou — telefon, který se uprostřed vyjížďky pohne, zkazí záznam."
  }
};


const deAT: N4 = {
  "back": "← Teil 3: Die Doppeluhr-Messung",
  "h1": "Teil 4: Ein Handy am Board",
  "subtitle": "Was wir messen können, sobald der Sensor nimmer am Handgelenk mitfährt",
  "intro": "Jede Zahl, die diese Seite übers Pumpen anzeigt, kommt am End’ von einem Sensor am Arm von irgendwem. Und der Arm macht halt, was er will: Er schwingt, er spannt sich an, er greift zum Ausbalancieren in die Luft. Drei Teile lang haben wir um das herumgewurschtelt. Im September 2026 war damit Schluss, und wir haben **ein Handy aufs Board gepickt** — GPS, Beschleunigungssensor und Gyroskop, 50 Messwerte in der Sekunde, fix verbunden mit dem, worum’s uns eigentlich geht. Was dabei herausgekommen ist, steht in diesem Teil.",
  "why": {
    "h": "Was das Handgelenk hergibt und was nicht",
    "p": "Die erste Überraschung war eine negative, und die gehört klar ausgesprochen, weil wir uns eigentlich das Gegenteil erwartet haben. Wir haben die Board-Aufnahme neben eine **Garmin am Handgelenk aus derselben Fahrt, zwei Minuten versetzt,** gelegt und angeschaut, was jeder der zwei Sensoren im Frequenzbereich sieht. Wär das Handgelenk hoffnungslos, dann wär der Pump-Rhythmus dort ein verschmierter Hügel und am Board ein scharfer Peak.",
    "p2": "Er ist aber auf **beiden** ein scharfer Peak. Derselbe Peak, dieselben 1,40 Hz, dieselbe Höhe. Das Handgelenk findet die Pump-Kadenz eh tadellos — genau deswegen funktioniert unser Pump-Zähler überhaupt: Bei dieser Fahrt hat die Board-Aufnahme **103 Pumps** gezählt und die Uhr **106**, grad einmal drei auseinander. Um den Rhythmus zu hören, braucht’s das Board also nicht. Was es liefert, kann das Handgelenk nie liefern: **die Lage vom Board selber** — wie weit die Nase abtaucht, wie weit das Board zur Seite kippt, wie weit das Ganze rauf- und runtergeht. Ein Arm kann das halt nicht melden, ganz wurscht, wie gut der Sensor drauf ist.",
    "cap": "Dieselbe Fahrt, zwei Sensoren, jeweils 20 Sekunden aus dem längsten Lauf. Beide sehen 1,40 Hz."
  },
  "setup": {
    "h": "Der Aufbau, wenn man den so nennen will",
    "p": "Es gibt keine Halterung, kein Gehäuse, keine Klammer. Das Handy kommt in ein wasserdichtes Sackerl, das Sackerl unter einen Gurt quer übers Deck, und der Gurt wird so fest zugezogen, dass das Handy nicht verrutschen kann, auch wenn’s das Board ordentlich herumhaut. Gesamtkosten: ein Gurt. Der ganze Sinn dahinter: Das muss jeder an einem Dienstag nach der Hackn nachmachen können — weil die Daten nur was wert sind, wenn man sie öfter als einmal sammeln kann.",
    "capDeck": "Der ganze Aufbau: wasserdichtes Sackerl unter einem Gurt, quer übers Deck, vor dem Mast.",
    "capRail": "Festgezurrt und vor dem Lauf kontrolliert — ein Handy, das sich während der Fahrt bewegt, macht die ganze Aufnahme hin."
  },
  "what": {
    "h": "Was ein Handy am Board aufzeichnet",
    "p": "Das Handy schreibt dasselbe Upload-Format wie jede Uhr, die wir unterstützen, und dazu einen Kanal, den keine von den Uhren hat: **das Gyroskop**. Erst dieser zusätzliche Kanal macht den Rest möglich — ein Gyroskop misst Drehung direkt und muss nicht raten, welcher Teil von einer gemessenen Beschleunigung Schwerkraft war und welcher Bewegung. Aus den drei Rohdatenströmen rechnen wir drei Winkel und eine Strecke heraus:",
    "li": [
      "**Nicken (Pitch)** — die Nase geht rauf und runter. Das *ist* die Pumpbewegung; alles andere ist Nebensache.",
      "**Rollen (Roll)** — das Board legt sich nach links und rechts. Carven und die kleinen Korrekturen zwischen den Pumps.",
      "**Gieren (Yaw)** — die Richtungsänderung. Mit der GPS-Spur abgeglichen, weil beide dasselbe messen und zusammenpassen müssen.",
      "**Hub (Heave)** — wie weit sich das Board wirklich hebt und senkt, in Zentimetern, aus der zweifachen Integration der vertikalen Beschleunigung."
    ],
    "cap": "Ein Lauf, 28 Sekunden. Die Nick-Kurve ist das Pumpen; der Hub darunter ist derselbe Rhythmus, in Zentimetern.",
    "capTiles": "Dieselben drei Winkel, so wie die Seite sie anzeigt, live entlang der Strecke."
  },
  "mount": {
    "h": "Das Problem, vor dem uns keiner gewarnt hat: Wie herum pickt das Handy?",
    "p": "Ein Handy hat keine Ahnung, wie es auf einem Board pickt. Pickst du es längs drauf, ist Nicken Nicken. Pickst du es quer drauf, ist das, was das Handy für Nicken hält, in Wahrheit das Rollen vom Board. Pickst du es schräg drauf — genau so passiert bei der allerersten echten Fahrt —, dann schaut eine reine Nickschwingung aus wie **71 % Nicken und 71 % Rollen gleichzeitig**. Den Fahrer bitten, dass er das angibt, geht sich genau so lang aus, bis wer ein nasses Handy mit kalten Fingern neu anpickt.",
    "p2": "Also lassen wir die Daten antworten. Pumpen ist eine Drehung um die Querachse vom Board, und ein Gyroskop misst Drehung direkt. Man dreht das gemessene Signal rechnerisch durch jeden möglichen Einbauwinkel und schaut, wo die Nickschwingung im Pump-Band (0,6–2,5 Hz) am stärksten ist — diese Richtung ist die Querachse. Das Bild unten zeigt diesen Durchlauf für zwei Fahrten: ein Handy quer aufs Board gepickt, eines schräg. Zwei Fahrten, zwei saubere Peaks, ohne dass irgendwer was angeben hat müssen — gesessen. Was der Durchlauf nicht entscheiden kann, ist Nase vorn oder Nase hinten, weil das dieselbe Achse ist; das klärt die erste Sekunde vom Lauf, weil jeder Lauf damit anfängt, dass die Nase runtergeht.",
    "cap": "Nick-Energie im Pump-Band über dem angenommenen Einbauwinkel. Der Peak ist die Antwort."
  },
  "heave": {
    "h": "Der Hub — und warum die Zahl einen Vorbehalt braucht",
    "p": "Wie weit bewegt sich ein Board beim Pumpen wirklich rauf und runter? Wenn man die Beschleunigung zweimal integriert, kriegt man eine Antwort in Zentimetern, und das ist genau so eine Zahl, die verlässlich ausschaut und heimlich ziemlich wackelig ist. Alles, was langsamer ist als das Band, das man behält, wird mit dem Quadrat von seiner Periode verstärkt — ein bissl Drift am unteren Ende wird zu Metern an eingebildetem Hub.",
    "p2": "Das Ausgleichsfenster legt diese untere Grenze fest, und das kann man sich nicht frei aussuchen. Rechnet man denselben Lauf mit einem 1-Sekunden-Fenster, kommen 18 cm heraus; mit 5 Sekunden sind’s 33 cm — für haargenau dieselbe Fahrt. Deswegen leiten wir das Fenster aus der **gemessenen Kadenz** vom Lauf ab — da 1,38 Hz, also 1,45 Sekunden — und markieren die Zahl als unzuverlässig, sobald die Bewegung zu nah an dieser Grenze liegt. Ehrlich gelesen sagt die Grafik nicht *der Hub ist 20 cm*, sondern *der Hub ist 20 cm, wenn man Hub als die Bewegung im Pump-Tempo definiert*.",
    "cap": "Derselbe Lauf, dieselben Daten, sechs verschiedene Ausgleichsfenster: 18 cm bis 33 cm."
  },
  "rules": {
    "h": "Vom Messen zum Zählen: Pumps, Gleiten und Aufsetzen",
    "p": "Sobald das Board seine eigene Bewegung meldet, braucht das Zählen am Board den Handgelenk-Zähler nimmer. Seit dem **10. Oktober 2026** wird jede Aufnahme mit Handy am Board nach vier einfachen Regeln gezählt, die jeder selber nachprüfen kann:",
    "li": [
      "**Ein Pump ist eine Bewegung, die Energie hineinsteckt.** Jedes Auf und Ab vom Board im Pump-Band (0,5–3 Hz) ist ein Zyklus. Als Pump zählt der aber nur, wenn die Nase im Takt von der Vertikalbewegung nickt — technisch: wenn das mittlere Produkt aus schneller Nickbewegung und Hubgeschwindigkeit über den Zyklus mehr als 30 % vom Median dieses Laufs ausmacht. Das Ausschwingen nach dem letzten Pump und kleine Ausgleichsbewegungen bewegen das Board zwar auch, stecken aber keine Energie hinein.",
      "**Der Lauf ist beim Aufsetzen aus.** Das ist der erste saubere GPS-Punkt in den letzten 15 Sekunden von einem Lauf unter max(8 km/h, 60 % vom Reisetempo dieses Laufs), minus 0,7 s, weil die GPS-Geschwindigkeit nachhinkt. Das Aufsetzen kann einen Lauf nur kürzer machen, nie länger.",
      "**Gleiten ist Fliegen ohne Pumpen.** Stückerl ohne Pump von 1,5 bis 15 Sekunden zählen als Gleiten — dieselbe Regel, nach der die Session-Karte die Gleitphasen eh schon bisher angezeigt hat. Der Anlauf vor dem ersten Pump zählt nicht, das Ende vom Lauf schon, und ein Stückerl, wo Bewegungsdaten fehlen, zählt überhaupt nicht.",
      "**Wo sich kein Urteil ausgeht, bleibt alles, wie’s war.** Ein Lauf mit weniger als fünf Zyklen hat keinen aussagekräftigen Median und behält drum die Zahl vom Handgelenk-Zähler."
    ],
    "p2": "Über die 20 Board-Aufnahmen von sechs Fahrern, die wir an dem Tag gehabt haben, zählen die Regeln **14 % weniger Pumps** als der Handgelenk-Zähler, und Gleiten macht **ungefähr 8 % von der Foil-Zeit** aus. Die meisten echten Gleitphasen dauern 2 bis 6 Sekunden; die längste hat 11,9 s gedauert, und zwar bei einer Fahrt, bei der das Handy zwischen zwei Läufen verdreht worden ist — die Regeln gehen von einem fix sitzenden Handy aus, und ein Handy, das verrutscht, erfindet Gleitphasen, die’s nie gegeben hat. Die alten Werte bleiben neben den neuen gespeichert, damit man jede Änderung zurückverfolgen kann."
  },
  "found": {
    "h": "Was uns vier Fahrten schon verraten haben",
    "p": "Das ist ein kleines Häufchen Daten — vier Board-Aufnahmen —, also sind das Beobachtungen und keine Gesetze. Es sind aber die ersten Zahlen, die das Board beschreiben und nicht den Fahrer.",
    "li": [
      "**Die Einbaulage wird automatisch gefunden, und sie ist stabil.** Über zwei Läufe von einer Fahrt hat der erkannte Winkel um 3° geschwankt — Rechenrauschen, kein verrutschtes Handy. Zwischen den Fahrten hat er genau um so viel geschwankt, wie das Tixo anders gepickt hat.",
      "**Die Kadenz ist bemerkenswert gleichmäßig.** 1,38 und 1,39 Hz in zwei Läufen von einer Fahrt; 1,45 Hz bei einer anderen. Pumpen schaut weniger nach Anstrengung aus als nach einer Resonanz, die wer gefunden hat.",
      "**Der Hub liegt bei rund 20 cm** bei dieser Kadenz, gemessen von ganz unten bis ganz oben, mit dem Vorbehalt von vorhin.",
      "**Das Nicken pendelt um etwa ±19°, das Rollen um etwa ±10°** in einem sauberen Lauf — das Board nickt also viel mehr, als es rollt. Genau davon geht der ganze Erkennungsansatz aus, und nachgeschaut hat das bis jetzt keiner."
    ]
  },
  "limits": {
    "h": "Was das noch nicht beweist",
    "p": "Die Liste von dem, was wir nicht behaupten können, ist länger als die Liste von dem, was wir behaupten können — und so soll’s auch bleiben, bis mehr Daten da sind:",
    "li": [
      "**Vier Fahrten, ein Fahrer, ein Board, ein See.** Nichts davon ist über mehrere Fahrer bestätigt, und unsere Pump-Zählung ist immer noch an einer einzigen Person geeicht — wie dünn das Eis da ist, steht in [Teil 3](/nerd-analysen-3).",
      "**Die Gleitzeit wird nur am Board gemessen.** Am Handgelenk ist die Zahl, die wir als längste Gleitphase anzeigen, weiterhin die längste Lücke zwischen zwei *erkannten* Pumps — und das ist halt nicht dasselbe.",
      "**Kein Mensch fährt mit einem aufs Board gepickten Handy herum.** Das ist ein Messinstrument, keine Funktion. Seine Aufgabe ist, die Wahrheit zu liefern, an der die Uhr an deinem Handgelenk gemessen wird."
    ]
  },
  "videorun": {
    "h": "Die Fahrt selber",
    "p": "Das Erklärvideo zu diesem Aufbau, gedreht am See: was aufs Board kommt, wie’s befestigt wird und was dabei herauskommt.",
    "cap": "Handy am Board: GPS, Gyroskop und Beschleunigung, direkt gemessen."
  },
  "next": {
    "h": "Wo das hinführt",
    "p": "Ein Messinstrument ist dazu da, dass man’s auf was richtet. Die Board-Daten liefern uns zum ersten Mal eine Referenz für zwei Fragen, die wir bis jetzt immer nur geschätzt haben: **ist diese Bewegung ein Pump**, und **wann hat das Board zu fliegen aufgehört**. Beides wird heute am Handgelenk gezählt und ist an einer einzigen Person geeicht. Wie diese Zählung funktioniert, steht in [Teil 2](/nerd-analysen-2); wie gut sie sich gegen einen zweiten Sensor hält, in [Teil 3](/nerd-analysen-3)."
  }
};


const de: N4 = {
  "back": "← Teil 3: Die Doppeluhr-Messung",
  "h1": "Teil 4: Ein Handy am Board",
  "subtitle": "Was wir messen können, sobald der Sensor nicht mehr am Handgelenk mitfährt",
  "intro": "Jede Zahl, die diese Seite übers Pumpen zeigt, stammt letztlich von einem Sensor am Arm von irgendwem. Und dieser Arm macht, was er will: Er schwingt, er spannt sich an, er greift zum Ausbalancieren in die Luft. Drei Teile dieser Serie lang haben wir uns um dieses Problem herumgearbeitet. Im September 2026 haben wir damit aufgehört und **ein Handy aufs Board geklebt** — GPS, Beschleunigungssensor und Gyroskop, 50 Messwerte pro Sekunde, fest verbunden mit dem, worum es uns eigentlich geht. Dieser Teil zeigt, was dabei herausgekommen ist.",
  "why": {
    "h": "Was das Handgelenk liefern kann und was nicht",
    "p": "Die erste Überraschung war eine negative, und es lohnt sich, sie klar auszusprechen, weil wir das Gegenteil erwartet hatten. Wir haben die Board-Aufnahme neben eine **Garmin am Handgelenk aus derselben Fahrt, zwei Minuten versetzt,** gelegt und verglichen, was jeder der beiden Sensoren im Frequenzbereich sieht. Wäre das Handgelenk hoffnungslos, wäre der Pump-Rhythmus dort ein verschmierter Hügel und am Board ein scharfer Peak.",
    "p2": "Er ist auf **beiden** ein scharfer Peak. Derselbe Peak, dieselben 1,40 Hz, dieselbe Höhe. Das Handgelenk findet die Pump-Kadenz ganz problemlos — genau deshalb funktioniert unser Pump-Zähler überhaupt: Bei dieser Fahrt zählte die Board-Aufnahme **103 Pumps** und die Uhr **106**, nur drei auseinander. Um den Rhythmus zu hören, braucht es das Board also nicht. Es liefert etwas, das das Handgelenk nie liefern kann: **die Lage des Boards selbst** — wie weit die Nase abtaucht, wie weit das Board zur Seite kippt, wie weit sich das Ganze hebt und senkt. Ein Arm kann das nicht melden, egal wie gut der Sensor daran ist.",
    "cap": "Dieselbe Fahrt, zwei Sensoren, jeweils 20 Sekunden aus dem längsten Lauf. Beide sehen 1,40 Hz."
  },
  "setup": {
    "h": "Der Aufbau, wenn man ihn so nennen will",
    "p": "Es gibt keine Halterung, kein Gehäuse, keine Klammer. Das Handy kommt in einen Dry Bag, der Dry Bag unter einen Gurt quer übers Deck, und der Gurt wird so fest gezogen, dass das Handy nicht verrutschen kann, während das Board herumgeworfen wird. Gesamtkosten: ein Gurt. Der ganze Sinn ist, dass das jeder an einem Dienstagabend nachmachen kann — denn die Daten sind nur etwas wert, wenn man sie mehr als einmal sammeln kann.",
    "capDeck": "Der ganze Aufbau: Dry Bag unter einem Gurt, quer übers Deck, vor dem Mast.",
    "capRail": "Festgezurrt und vor dem Lauf kontrolliert — ein Handy, das sich während der Fahrt bewegt, macht die Aufnahme unbrauchbar."
  },
  "what": {
    "h": "Was ein Handy am Board aufzeichnet",
    "p": "Das Handy schreibt dasselbe Upload-Format wie jede Uhr, die wir unterstützen, plus einen Kanal, den keine der Uhren hat: **das Gyroskop**. Erst dieser zusätzliche Kanal macht den Rest möglich — ein Gyroskop misst Drehung direkt, ohne raten zu müssen, welcher Teil einer gemessenen Beschleunigung Schwerkraft war und welcher Bewegung. Aus den drei Rohdatenströmen leiten wir drei Winkel und eine Strecke ab:",
    "li": [
      "**Nicken (Pitch)** — die Nase geht hoch und runter. Das *ist* die Pumpbewegung; alles andere ist zweitrangig.",
      "**Rollen (Roll)** — das Board neigt sich nach links und rechts. Carven und die kleinen Korrekturen zwischen den Pumps.",
      "**Gieren (Yaw)** — die Richtungsänderung. Mit der GPS-Spur abgeglichen, weil beide dasselbe messen und übereinstimmen müssen.",
      "**Hub (Heave)** — wie weit sich das Board tatsächlich hebt und senkt, in Zentimetern, durch zweifache Integration der vertikalen Beschleunigung."
    ],
    "cap": "Ein Lauf, 28 Sekunden. Die Nick-Kurve ist das Pumpen; der Hub darunter ist derselbe Rhythmus, in Zentimetern.",
    "capTiles": "Dieselben drei Winkel, wie die Seite sie zeigt, live entlang der Strecke."
  },
  "mount": {
    "h": "Das Problem, vor dem uns niemand gewarnt hat: Wie herum klebt das Handy?",
    "p": "Ein Handy weiß nicht, wie es auf einem Board klebt. Klebt man es längs, ist Nicken Nicken. Klebt man es quer, ist das, was das Handy für Nicken hält, in Wahrheit das Rollen des Boards. Klebt man es schräg — so geschehen bei der allerersten echten Fahrt —, erscheint eine reine Nickschwingung als **71 % Nicken und 71 % Rollen gleichzeitig**. Den Fahrer zu bitten, das anzugeben, funktioniert genau so lange, bis jemand ein nasses Handy mit kalten Fingern neu festklebt.",
    "p2": "Also lassen wir die Daten antworten. Pumpen ist eine Drehung um die Querachse des Boards, und ein Gyroskop misst Drehung direkt. Man dreht das gemessene Signal rechnerisch durch jeden möglichen Einbauwinkel und fragt, wo die Nickschwingung im Pump-Band (0,6–2,5 Hz) am stärksten ist — diese Richtung ist die Querachse. Das Bild unten zeigt diesen Durchlauf für zwei Fahrten: ein Handy quer aufs Board geklebt, eines schräg. Zwei Fahrten, zwei saubere Peaks, ohne dass irgendwer etwas angeben musste. Was der Durchlauf nicht entscheiden kann, ist Nase vorn oder Nase hinten, denn das ist dieselbe Achse; das klärt die erste Sekunde des Laufs, weil jeder Lauf damit beginnt, dass die Nase nach unten geht.",
    "cap": "Nick-Energie im Pump-Band über dem angenommenen Einbauwinkel. Der Peak ist die Antwort."
  },
  "heave": {
    "h": "Der Hub — und warum die Zahl einen Vorbehalt braucht",
    "p": "Wie weit bewegt sich ein Board beim Pumpen tatsächlich auf und ab? Die Beschleunigung zweimal zu integrieren liefert eine Antwort in Zentimetern, und es ist genau die Art Zahl, die verlässlich aussieht und insgeheim zerbrechlich ist. Alles, was langsamer ist als das Band, das man behält, wird mit dem Quadrat seiner Periode verstärkt — eine kleine Drift am unteren Ende wird zu Metern eingebildeten Hubs.",
    "p2": "Das Ausgleichsfenster legt diese untere Grenze fest, und es ist kein frei wählbarer Parameter. Rechnet man denselben Lauf mit einem 1-Sekunden-Fenster, kommen 18 cm heraus; mit 5 Sekunden sind es 33 cm — für exakt dieselbe Fahrt. Deshalb leiten wir das Fenster aus der **gemessenen Kadenz** des Laufs ab — hier 1,38 Hz, also 1,45 Sekunden — und markieren die Zahl als unzuverlässig, sobald die Bewegung zu nah an dieser Grenze liegt. Ehrlich gelesen sagt diese Grafik nicht *der Hub beträgt 20 cm*, sondern *der Hub beträgt 20 cm, wenn man Hub als die Bewegung im Pump-Tempo definiert*.",
    "cap": "Derselbe Lauf, dieselben Daten, sechs verschiedene Ausgleichsfenster: 18 cm bis 33 cm."
  },
  "rules": {
    "h": "Vom Messen zum Zählen: Pumps, Gleiten und Aufsetzen",
    "p": "Sobald das Board seine eigene Bewegung meldet, braucht das Zählen am Board den Handgelenk-Zähler nicht mehr. Seit dem **10. Oktober 2026** wird jede Aufnahme mit Handy am Board nach vier einfachen Regeln gezählt, die jeder nachprüfen kann:",
    "li": [
      "**Ein Pump ist eine Bewegung, die Energie hineinsteckt.** Jedes Auf und Ab des Boards im Pump-Band (0,5–3 Hz) ist ein Zyklus. Als Pump zählt er nur, wenn die Nase im Takt der Vertikalbewegung nickt — technisch: wenn das mittlere Produkt aus schneller Nickbewegung und Hubgeschwindigkeit über den Zyklus mehr als 30 % des Medians dieses Laufs beträgt. Ausschwingen nach dem letzten Pump und kleine Ausgleichsbewegungen bewegen das Board zwar auch, stecken aber keine Energie hinein.",
      "**Der Lauf endet beim Aufsetzen.** Das ist der erste saubere GPS-Punkt in den letzten 15 Sekunden eines Laufs unter max(8 km/h, 60 % des Reisetempos dieses Laufs), minus 0,7 s für die Verzögerung der GPS-Geschwindigkeit. Das Aufsetzen kann einen Lauf nur kürzen, nie verlängern.",
      "**Gleiten ist Fliegen ohne Pumpen.** Abschnitte ohne Pump von 1,5 bis 15 Sekunden zählen als Gleiten — dieselbe Regel, nach der die Session-Karte Gleitphasen schon bisher angezeigt hat. Der Anlauf vor dem ersten Pump zählt nicht, das Ende des Laufs schon, und ein Abschnitt mit fehlenden Bewegungsdaten zählt gar nicht.",
      "**Was zu kurz zum Beurteilen ist, bleibt, wie es war.** Ein Lauf mit weniger als fünf Zyklen hat keinen aussagekräftigen Median und behält deshalb die Zahl des Handgelenk-Zählers."
    ],
    "p2": "Über die 20 Board-Aufnahmen von sechs Fahrern, die wir an diesem Tag hatten, zählen die Regeln **14 % weniger Pumps** als der Handgelenk-Zähler, und Gleiten macht **etwa 8 % der Foil-Zeit** aus. Die meisten echten Gleitphasen dauern 2 bis 6 Sekunden; die längste dauerte 11,9 s, und zwar bei einer Fahrt, bei der das Handy zwischen zwei Läufen verdreht worden war — die Regeln setzen ein fest sitzendes Handy voraus, und ein Handy, das verrutscht, erzeugt Gleitphasen, die es nie gab. Die alten Werte bleiben neben den neuen gespeichert, sodass sich jede Änderung zurückverfolgen lässt."
  },
  "found": {
    "h": "Was uns vier Fahrten schon verraten haben",
    "p": "Das ist ein kleiner Datenhaufen — vier Board-Aufnahmen —, also sind das Beobachtungen, keine Gesetze. Es sind aber die ersten Zahlen, die das Board beschreiben statt den Fahrer.",
    "li": [
      "**Die Einbaulage wird automatisch gefunden, und sie ist stabil.** Über zwei Läufe einer Fahrt schwankte der erkannte Winkel um 3° — Rechenrauschen, kein verrutschtes Handy. Zwischen den Fahrten schwankte er genau um so viel, wie das Klebeband anders saß.",
      "**Die Kadenz ist bemerkenswert gleichmäßig.** 1,38 und 1,39 Hz in zwei Läufen einer Fahrt; 1,45 Hz bei einer anderen. Pumpen wirkt weniger wie Anstrengung als wie eine Resonanz, die jemand gefunden hat.",
      "**Der Hub liegt bei rund 20 cm** bei dieser Kadenz, gemessen von ganz unten bis ganz oben, mit dem Vorbehalt von oben.",
      "**Das Nicken pendelt um etwa ±19°, das Rollen um etwa ±10°** in einem sauberen Lauf — das Board nickt also weit mehr, als es rollt. Genau davon geht der ganze Erkennungsansatz aus, und überprüft hatte das bisher nie jemand."
    ]
  },
  "limits": {
    "h": "Was das noch nicht beweist",
    "p": "Die Liste dessen, was wir nicht behaupten können, ist länger als die Liste dessen, was wir behaupten können — und so soll es bleiben, bis mehr Daten da sind:",
    "li": [
      "**Vier Fahrten, ein Fahrer, ein Board, ein See.** Nichts davon ist über mehrere Fahrer bestätigt, und unsere Pump-Zählung ist immer noch an einer einzigen Person geeicht — wie dünn dieser Boden ist, steht in [Teil 3](/nerd-analysen-3).",
      "**Gleitzeit wird nur am Board gemessen.** Am Handgelenk ist die Zahl, die wir als längste Gleitphase zeigen, weiterhin die längste Lücke zwischen zwei *erkannten* Pumps — und das ist nicht dasselbe.",
      "**Niemand fährt mit einem Handy, das aufs Board geklebt ist.** Das ist ein Messinstrument, keine Funktion. Seine Aufgabe ist, die Wahrheit zu liefern, an der die Uhr an deinem Handgelenk gemessen wird."
    ]
  },
  "videorun": {
    "h": "Die Fahrt selbst",
    "p": "Das Erklärvideo zu diesem Aufbau, gedreht am See: was aufs Board kommt, wie es befestigt wird und was dabei herauskommt.",
    "cap": "Handy am Board: GPS, Gyroskop und Beschleunigung, direkt gemessen."
  },
  "next": {
    "h": "Wohin das führt",
    "p": "Ein Messinstrument ist dazu da, auf etwas gerichtet zu werden. Die Board-Daten liefern uns zum ersten Mal eine Referenz für zwei Fragen, die wir bisher immer nur geschätzt haben: **ist diese Bewegung ein Pump**, und **wann hat das Board aufgehört zu fliegen**. Beides wird heute am Handgelenk gezählt und ist an einer einzigen Person geeicht. Wie diese Zählung funktioniert, steht in [Teil 2](/nerd-analysen-2); wie gut sie sich gegen einen zweiten Sensor hält, in [Teil 3](/nerd-analysen-3)."
  }
};


const es: N4 = {
  "back": "← Parte 3: La medición con dos relojes",
  "h1": "Parte 4: Un móvil pegado a la tabla",
  "subtitle": "Lo que podemos medir cuando el sensor deja de ir en una muñeca",
  "intro": "Cada número que este sitio muestra sobre el bombeo procede, al final, de un sensor sujeto al brazo de alguien. Y ese brazo va a su aire: se balancea, se pone rígido, se estira para mantener el equilibrio. Durante tres partes de esta serie hemos ido sorteando ese problema. En septiembre de 2026 dejamos de sortearlo y **pegamos un móvil a la tabla** — GPS, acelerómetro y giroscopio, 50 muestras por segundo, fijado a lo que de verdad queremos conocer. Esta parte cuenta lo que salió.",
  "why": {
    "h": "Lo que la muñeca puede dar y lo que no",
    "p": "La primera sorpresa fue negativa, y merece decirse sin rodeos porque esperábamos lo contrario. Pusimos la grabación de la tabla junto a la de un **Garmin en la muñeca de la misma salida, con dos minutos de diferencia**, y comparamos lo que ve cada sensor en el dominio de la frecuencia. Si la muñeca no sirviera, el ritmo de bombeo sería ahí una mancha difusa y en la tabla un pico nítido.",
    "p2": "Es un pico nítido en **los dos**. El mismo pico, los mismos 1,40 Hz, la misma altura. La muñeca encuentra la cadencia de bombeo sin ningún problema — y precisamente por eso funciona nuestro contador de pumps: en esta salida la grabación de la tabla contó **103 pumps** y el reloj **106**, apenas tres de diferencia. Así que la tabla no hace falta para oír el ritmo. Lo que aporta es algo que la muñeca nunca podrá dar: **la actitud de la propia tabla** — cuánto baja la punta, cuánto se inclina hacia los lados, cuánto sube y baja el conjunto. Un brazo no puede contar eso, por bueno que sea el sensor que lleve.",
    "cap": "Misma salida, dos sensores, 20 segundos del run más largo en cada uno. Ambos ven 1,40 Hz."
  },
  "setup": {
    "h": "El montaje, por llamarlo de alguna manera",
    "p": "No hay soporte, ni funda, ni abrazadera. El móvil va en una bolsa estanca, la bolsa va bajo una cincha que cruza el deck, y la cincha se aprieta lo bastante para que el móvil no se desplace mientras la tabla recibe golpes por todos lados. Coste total: una cincha. La gracia es que cualquiera pueda repetirlo un martes por la tarde, porque los datos solo valen algo si se pueden recoger más de una vez.",
    "capDeck": "Todo el montaje: bolsa estanca bajo una cincha, cruzando el deck, por delante del mástil.",
    "capRail": "Bien sujeto y revisado antes del run — un móvil que se mueve a mitad de la salida estropea la grabación."
  },
  "what": {
    "h": "Lo que registra un móvil sobre la tabla",
    "p": "El móvil escribe el mismo formato de subida que todos los relojes que admitimos, más un canal que ningún reloj tiene: **el giroscopio**. Ese canal extra es lo que hace posible todo lo demás — un giroscopio mide la rotación directamente, sin tener que adivinar qué parte de una aceleración medida era gravedad y cuál era movimiento. De los tres flujos en bruto obtenemos tres ángulos y una distancia:",
    "li": [
      "**Cabeceo (pitch)** — la punta que sube y baja. Esto *es* el movimiento de bombeo; todo lo demás es secundario.",
      "**Alabeo (roll)** — la tabla que se inclina a izquierda y derecha. El carving y las pequeñas correcciones entre pumps.",
      "**Guiñada (yaw)** — el cambio de rumbo. Contrastada con la traza GPS, porque ambas miden lo mismo y tienen que coincidir.",
      "**Arfada (heave)** — cuánto sube y baja realmente la tabla, en centímetros, integrando dos veces la aceleración vertical."
    ],
    "cap": "Un run, 28 segundos. La curva de cabeceo es el bombeo; la arfada debajo es el mismo ritmo, en centímetros.",
    "capTiles": "Los mismos tres ángulos tal como los muestra el sitio, en directo a lo largo del recorrido."
  },
  "mount": {
    "h": "El problema del que nadie nos avisó: ¿en qué sentido está pegado el móvil?",
    "p": "Un móvil no tiene ni idea de cómo está pegado a una tabla. Pégalo a lo largo y el cabeceo es cabeceo. Pégalo de través y lo que el móvil llama cabeceo es en realidad el alabeo de la tabla. Pégalo en diagonal — lo que ocurrió en la primerísima salida real — y una oscilación de cabeceo pura aparece como **71 % de cabeceo y 71 % de alabeo a la vez**. Pedir al rider que lo indique funciona justo hasta que alguien vuelve a pegar un móvil mojado con los dedos helados.",
    "p2": "Así que dejamos que respondan los datos. El bombeo es una rotación alrededor del eje transversal de la tabla, y un giroscopio mide la rotación directamente. Se gira la señal medida por todos los ángulos de montaje posibles y se busca dónde es más fuerte la oscilación de cabeceo en la banda de bombeo (0,6–2,5 Hz) — esa dirección es el eje transversal. La imagen de abajo muestra ese barrido para dos salidas: un móvil pegado de través y otro en diagonal. Dos salidas, dos picos limpios, sin que nadie tuviera que indicar nada. Lo que el barrido no puede decidir es si la punta mira hacia delante o hacia atrás, porque es el mismo eje; eso lo resuelve el primer segundo del run, ya que todo run empieza con la punta bajando.",
    "cap": "Energía de cabeceo en la banda de bombeo frente a la rotación de montaje supuesta. El pico es la respuesta."
  },
  "heave": {
    "h": "La arfada, y por qué la cifra necesita una advertencia",
    "p": "¿Cuánto sube y baja realmente una tabla mientras bombeas? Integrar dos veces la aceleración da una respuesta en centímetros, y es el tipo de cifra que parece fiable y en el fondo es frágil. Todo lo que sea más lento que la banda que conservas se amplifica con el cuadrado de su período — una pequeña deriva en el extremo bajo acaba convertida en metros de arfada imaginaria.",
    "p2": "La ventana de nivelado fija ese límite inferior, y no es un parámetro que se pueda elegir libremente. Calcula el mismo run con una ventana de 1 segundo y salen 18 cm; con 5 segundos salen 33 cm, para exactamente la misma salida. Por eso derivamos la ventana de la **cadencia medida** de ese run — aquí 1,38 Hz, es decir, 1,45 segundos — y marcamos la cifra como poco fiable cuando el movimiento queda demasiado cerca de ese límite. La lectura honesta de este gráfico no es *la arfada es de 20 cm*, sino *la arfada es de 20 cm si se define como el movimiento a ritmo de bombeo*.",
    "cap": "El mismo run, los mismos datos, seis ventanas de nivelado distintas: de 18 cm a 33 cm."
  },
  "rules": {
    "h": "De medir a contar: pumps, planeo y toque con el agua",
    "p": "En cuanto la tabla informa de su propio movimiento, contar en la tabla ya no necesita el contador de la muñeca. Desde el **10 de octubre de 2026**, cada grabación con el móvil en la tabla se cuenta con cuatro reglas sencillas que cualquiera puede comprobar:",
    "li": [
      "**Un pump es un movimiento que aporta energía.** Cada subida y bajada de la tabla en la banda de bombeo (0,5–3 Hz) es un ciclo. Cuenta como pump solo si la punta cabecea al compás del movimiento vertical — técnicamente, si el producto medio del cabeceo rápido y la velocidad de arfada a lo largo del ciclo supera el 30 % de la mediana de ese run. Las oscilaciones que se apagan tras el último pump y las pequeñas correcciones de equilibrio también mueven la tabla, pero no aportan energía.",
      "**El run termina al tocar el agua.** Es el primer punto GPS limpio en los últimos 15 segundos de un run por debajo de max(8 km/h, 60 % de la velocidad de crucero del run), menos 0,7 s por el retraso de la velocidad GPS. El toque con el agua solo puede acortar un run, nunca alargarlo.",
      "**Planear es volar sin bombear.** Los tramos sin pump de 1,5 a 15 segundos cuentan como planeo — la misma regla con la que el mapa de la sesión ya mostraba los planeos. El arranque antes del primer pump no cuenta, el final del run sí, y un tramo sin datos de movimiento no cuenta en absoluto.",
      "**Lo que es demasiado corto para juzgar se queda como estaba.** Un run con menos de cinco ciclos no tiene una mediana con sentido, así que conserva el recuento del contador de la muñeca."
    ],
    "p2": "En las 20 grabaciones de tabla de seis riders que teníamos ese día, las reglas cuentan **un 14 % menos de pumps** que el contador de la muñeca, y el planeo supone **alrededor del 8 % del tiempo de foil**. La mayoría de los planeos reales duran de 2 a 6 segundos; el más largo fue de 11,9 s, en una salida en la que el móvil se había girado entre runs — las reglas dan por hecho un móvil bien fijado, y un móvil que se desplaza produce planeos que nunca ocurrieron. Los valores antiguos siguen guardados junto a los nuevos, así que cada cambio se puede rastrear."
  },
  "found": {
    "h": "Lo que ya nos han contado cuatro salidas",
    "p": "Es un montón pequeño de datos — cuatro grabaciones de tabla —, así que son observaciones, no leyes. Aun así, son los primeros números que tenemos que describen la tabla y no al rider.",
    "li": [
      "**La orientación del montaje se detecta automáticamente y es estable.** En dos runs de una misma salida, el ángulo detectado varió 3°, lo que es ruido de cálculo, no un móvil que se mueve. Entre salidas varió exactamente lo mismo que la cinta.",
      "**La cadencia es sorprendentemente constante.** 1,38 y 1,39 Hz en dos runs de una misma salida; 1,45 Hz en otra. Bombear se parece menos a un esfuerzo y más a una resonancia que alguien ha encontrado.",
      "**La arfada ronda los 20 cm** a esa cadencia, medida de abajo arriba, con la advertencia de antes.",
      "**El cabeceo oscila unos ±19° y el alabeo unos ±10°** en un run limpio — la tabla cabecea mucho más de lo que alabea, que es justo lo que da por supuesto todo el método de detección y nunca se había comprobado de verdad."
    ]
  },
  "limits": {
    "h": "Lo que esto todavía no demuestra",
    "p": "La lista de cosas que no podemos afirmar es más larga que la de las que sí, y así debe seguir hasta que haya más datos:",
    "li": [
      "**Cuatro salidas, un rider, una tabla, un lago.** Nada de esto está validado con otros riders, y nuestro recuento de pumps sigue calibrado en una sola persona — en la [Parte 3](/nerd-analysen-3) se ve lo endeble que es esa base.",
      "**El tiempo de planeo solo se mide en la tabla.** En la muñeca, la cifra que mostramos como planeo más largo sigue siendo el hueco más largo entre dos pumps *detectados*, que no es lo mismo.",
      "**Nadie sale a navegar con un móvil pegado a la tabla.** Es un instrumento de medida, no una función. Su trabajo es producir la referencia con la que se compara el reloj que llevas en la muñeca."
    ]
  },
  "videorun": {
    "h": "La salida en sí",
    "p": "El vídeo explicativo de este montaje, grabado en el lago: qué va en la tabla, cómo se sujeta y qué se obtiene.",
    "cap": "Móvil en la tabla: GPS, giroscopio y aceleración, medidos directamente."
  },
  "next": {
    "h": "Hacia dónde va esto",
    "p": "Un instrumento de medida está para apuntarlo a algo. Los datos de la tabla nos dan, por primera vez, una referencia real para dos preguntas que hasta ahora solo habíamos estimado: **este movimiento es un pump**, y **cuándo dejó de volar la tabla**. Hoy ambas cosas se cuentan en la muñeca y están calibradas en una sola persona. Cómo funciona ese recuento está en la [Parte 2](/nerd-analysen-2); qué tal aguanta frente a un segundo sensor, en la [Parte 3](/nerd-analysen-3)."
  }
};


const fi: N4 = {
  "back": "← Osa 3: Kahden kellon mittaus",
  "h1": "Osa 4: Puhelin teipattuna lautaan",
  "subtitle": "Mitä voimme mitata, kun anturi ei enää kulje ranteessa",
  "intro": "Jokainen luku, jonka tämä sivusto näyttää pumppaamisesta, tulee lopulta jonkun käsivarteen kiinnitetystä anturista. Ja se käsivarsi elää omaa elämäänsä: se heiluu, se jännittyy, se kurottaa tasapainoa hakiessaan. Tämän sarjan kolmessa osassa kiersimme ongelmaa. Syyskuussa 2026 lopetimme kiertelyn ja **teippasimme puhelimen lautaan** — GPS, kiihtyvyysanturi ja gyroskooppi, 50 näytettä sekunnissa, kiinni juuri siinä, mistä oikeasti haluamme tietää. Tämä osa kertoo, mitä siitä seurasi.",
  "why": {
    "h": "Mitä ranne pystyy kertomaan ja mitä ei",
    "p": "Ensimmäinen yllätys oli kielteinen, ja se kannattaa sanoa suoraan, koska odotimme päinvastaista. Asetimme lautatallenteen rinnalle **samalta sessiolta ranteessa olleen Garminin tallenteen, kahden minuutin päästä toisistaan**, ja vertasimme, mitä kumpikin anturi näkee taajuustasossa. Jos ranne olisi toivoton, pumppausrytmi näkyisi siinä sumeana kumpuna ja laudalla terävänä piikkinä.",
    "p2": "Se on terävä piikki **molemmissa**. Sama piikki, sama 1,40 Hz, sama korkeus. Ranne löytää pumppauskadenssin aivan hyvin — ja juuri siksi pumppauslaskurimme ylipäätään toimii: tällä sessiolla lautatallenne laski **103 pumppausta** ja kello **106**, eroa vain kolme. Lautaa ei siis tarvita rytmin kuulemiseen. Se antaa jotain, mitä ranne ei voi koskaan antaa: **itse laudan asennon** — kuinka paljon keula painuu, kuinka paljon lauta kallistuu, kuinka paljon koko kokonaisuus nousee ja laskee. Käsivarsi ei voi kertoa sitä, oli siinä kuinka hyvä anturi tahansa.",
    "cap": "Sama sessio, kaksi anturia, kummastakin 20 sekuntia pisimmästä lenkistä. Molemmat näkevät 1,40 Hz."
  },
  "what": {
    "h": "Mitä laudalla oleva puhelin tallentaa",
    "p": "Puhelin kirjoittaa saman latausmuodon kuin jokainen tukemamme kello, ja lisäksi yhden kanavan, jota yhdessäkään kellossa ei ole: **gyroskoopin**. Juuri tämä lisäkanava tekee kaiken muun mahdolliseksi — gyroskooppi mittaa pyörimistä suoraan, eikä sen tarvitse arvata, mikä osa mitatusta kiihtyvyydestä oli painovoimaa ja mikä liikettä. Kolmesta raakadatavirrasta johdamme kolme kulmaa ja yhden matkan:",
    "li": [
      "**Nyökkäys (pitch)** — keula nousee ja laskee. Tämä *on* pumppausliike; kaikki muu on toissijaista.",
      "**Kallistus (roll)** — lauta kallistuu vasemmalle ja oikealle. Carvaus ja pienet korjaukset pumppausten välissä.",
      "**Kääntyminen (yaw)** — suunnan muutos. Tarkistettu GPS-jälkeä vasten, koska molemmat mittaavat samaa asiaa ja niiden täytyy täsmätä.",
      "**Nousu (heave)** — kuinka paljon lauta oikeasti nousee ja laskee, senttimetreinä, integroimalla pystysuuntainen kiihtyvyys kahdesti."
    ],
    "cap": "Yksi lenkki, 28 sekuntia. Nyökkäyskäyrä on pumppausta; sen alla oleva nousu on sama rytmi senttimetreinä.",
    "capTiles": "Samat kolme kulmaa niin kuin sivusto ne näyttää, livenä reitin varrella."
  },
  "mount": {
    "h": "Ongelma, josta kukaan ei varoittanut: mihin suuntaan puhelin on teipattu?",
    "p": "Puhelin ei tiedä, miten se on kiinni laudassa. Teippaa se pitkittäin, ja nyökkäys on nyökkäystä. Teippaa se poikittain, ja se, mitä puhelin pitää nyökkäyksenä, onkin laudan kallistusta. Teippaa se vinoon — kuten kävi aivan ensimmäisellä oikealla sessiolla — ja puhdas nyökkäysvärähtely näkyy **71 % nyökkäyksenä ja 71 % kallistuksena yhtä aikaa**. Foilaajan pyytäminen ilmoittamaan asento toimii täsmälleen siihen asti, kunnes joku teippaa märän puhelimen uudelleen kohmeisilla sormilla.",
    "p2": "Annamme siis datan vastata. Pumppaus on pyörimistä laudan poikittaisakselin ympäri, ja gyroskooppi mittaa pyörimistä suoraan. Mitattua signaalia kierretään laskennallisesti jokaisen mahdollisen kiinnityskulman läpi ja katsotaan, missä nyökkäysvärähtely pumppauskaistalla (0,6–2,5 Hz) on voimakkain — se suunta on poikittaisakseli. Alla oleva kuva näyttää tämän pyyhkäisyn kahdelta sessiolta: yksi puhelin teipattuna poikittain, toinen vinoon. Kaksi sessiota, kaksi puhdasta piikkiä, eikä kenenkään tarvinnut ilmoittaa mitään. Pyyhkäisy ei pysty ratkaisemaan, osoittaako keula eteen vai taakse, koska akseli on sama; sen ratkaisee lenkin ensimmäinen sekunti, sillä lenkki alkaa aina keulan painumisella alas.",
    "cap": "Nyökkäysenergia pumppauskaistalla oletetun kiinnityskulman funktiona. Piikki on vastaus."
  },
  "heave": {
    "h": "Nousu, ja miksi luku tarvitsee varauksen",
    "p": "Kuinka paljon lauta oikeasti liikkuu ylös ja alas, kun pumppaat? Kiihtyvyyden integroiminen kahdesti antaa vastauksen senttimetreinä, ja se on juuri sellainen luku, joka näyttää luotettavalta mutta on salaa hauras. Kaikki, mikä on hitaampaa kuin säilytettävä kaista, vahvistuu jaksonsa neliöllä — pieni ryömintä alapäässä muuttuu metreiksi kuviteltua nousua.",
    "p2": "Tasausikkuna määrää tämän alarajan, eikä se ole vapaasti valittava parametri. Laske sama lenkki 1 sekunnin ikkunalla, niin saat 18 cm; 5 sekunnin ikkunalla saat 33 cm — täsmälleen samasta sessiosta. Siksi johdamme ikkunan lenkin **mitatusta kadenssista** — tässä 1,38 Hz, eli 1,45 sekuntia — ja merkitsemme luvun epäluotettavaksi aina, kun liike on liian lähellä rajaa. Rehellisesti luettuna kaavio ei kerro, että *nousu on 20 cm*, vaan että *nousu on 20 cm, kun nousu määritellään pumppausrytmissä tapahtuvaksi liikkeeksi*.",
    "cap": "Sama lenkki, sama data, kuusi eri tasausikkunaa: 18 cm – 33 cm."
  },
  "rules": {
    "h": "Mittaamisesta laskemiseen: pumppaukset, liu'ut ja laskeutuminen",
    "p": "Kun lauta kertoo oman liikkeensä, laudalla laskeminen ei enää tarvitse rannelaskuria. **10. lokakuuta 2026** alkaen jokainen tallenne, jossa puhelin on laudalla, lasketaan neljällä yksinkertaisella säännöllä, jotka kuka tahansa voi tarkistaa:",
    "li": [
      "**Pumppaus on liike, joka tuo energiaa.** Jokainen laudan ylös–alas-liike pumppauskaistalla (0,5–3 Hz) on yksi sykli. Se lasketaan pumppaukseksi vain, jos keula nyökkää pystyliikkeen tahdissa — teknisesti: jos nopean nyökkäyksen ja nousunopeuden tulon keskiarvo syklin aikana ylittää 30 % kyseisen lenkin mediaanista. Viimeisen pumppauksen jälkeen vaimenevat heilahdukset ja pienet tasapainokorjaukset liikuttavat lautaa nekin, mutta eivät tuo energiaa.",
      "**Lenkki päättyy laskeutumiseen.** Se on ensimmäinen puhdas GPS-piste lenkin viimeisten 15 sekunnin aikana, jossa nopeus on alle max(8 km/h, 60 % lenkin matkanopeudesta), miinus 0,7 s GPS-nopeuden viiveen vuoksi. Laskeutuminen voi vain lyhentää lenkkiä, ei koskaan pidentää sitä.",
      "**Liuku on lentämistä ilman pumppausta.** 1,5–15 sekunnin jaksot ilman pumppausta lasketaan liu'uksi — sama sääntö, jolla sessiokartta on jo tähänkin asti näyttänyt liu'ut. Vauhdinotto ennen ensimmäistä pumppausta ei kuulu liukuun, lenkin loppu kuuluu, eikä jaksoa, josta liikedata puuttuu, lasketa lainkaan.",
      "**Liian lyhyt arvioitavaksi jää ennalleen.** Lenkillä, jossa on alle viisi sykliä, ei ole mielekästä mediaania, joten se säilyttää rannelaskurin luvun."
    ],
    "p2": "Sinä päivänä meillä olleissa kuuden foilaajan 20 lautatallenteessa säännöt laskevat **14 % vähemmän pumppauksia** kuin rannelaskuri, ja liu'ut muodostavat **noin 8 % foilausajasta**. Useimmat todelliset liu'ut kestävät 2–6 sekuntia; pisin kesti 11,9 s sessiolla, jolla puhelin oli käännetty lenkkien välissä — säännöt olettavat tukevasti kiinnitetyn puhelimen, ja liikkuva puhelin tuottaa liukuja, joita ei koskaan tapahtunut. Vanhat arvot säilyvät tallessa uusien rinnalla, joten jokainen muutos voidaan jäljittää."
  },
  "found": {
    "h": "Mitä neljä sessiota on jo kertonut",
    "p": "Tämä on pieni kasa dataa — neljä lautatallennetta — joten kyse on havainnoista, ei laeista. Ne ovat kuitenkin ensimmäiset luvut, jotka kuvaavat lautaa eivätkä foilaajaa.",
    "li": [
      "**Kiinnitysasento löytyy automaattisesti, ja se on vakaa.** Saman session kahdessa lenkissä tunnistettu kulma vaihteli 3°, mikä on laskennan kohinaa, ei puhelimen liikettä. Sessioiden välillä se vaihteli täsmälleen yhtä paljon kuin teippauskin.",
      "**Kadenssi on huomattavan tasainen.** 1,38 ja 1,39 Hz saman session kahdessa lenkissä; 1,45 Hz toisella sessiolla. Pumppaus näyttää vähemmän ponnistelulta ja enemmän resonanssilta, jonka joku on löytänyt.",
      "**Nousu on noin 20 cm** tällä kadenssilla, mitattuna alimmasta kohdasta ylimpään, edellä mainitulla varauksella.",
      "**Nyökkäys heilahtelee noin ±19°, kallistus noin ±10°** puhtaalla lenkillä — lauta siis nyökkää paljon enemmän kuin kallistuu. Juuri tähän koko tunnistusmenetelmä perustuu, eikä sitä ollut koskaan oikeasti tarkistettu."
    ]
  },
  "limits": {
    "h": "Mitä tämä ei vielä todista",
    "p": "Lista asioista, joita emme voi väittää, on pidempi kuin lista asioista, joita voimme — ja niin sen pitää pysyä, kunnes dataa on enemmän:",
    "li": [
      "**Neljä sessiota, yksi foilaaja, yksi lauta, yksi järvi.** Mitään tästä ei ole vahvistettu eri foilaajilla, ja pumppauslaskurimme on yhä kalibroitu yhden ihmisen mukaan — [osasta 3](/nerd-analysen-3) näet, kuinka ohut tämä pohja on.",
      "**Liukuaika mitataan vain laudalla.** Ranteessa luku, jonka näytämme pisimpänä liukuna, on edelleen pisin väli kahden *tunnistetun* pumppauksen välillä — eikä se ole sama asia.",
      "**Kukaan ei foilaa puhelin teipattuna lautaan.** Tämä on mittalaite, ei ominaisuus. Sen tehtävä on tuottaa totuus, johon ranteessasi olevaa kelloa verrataan."
    ]
  },
  "videorun": {
    "h": "Itse sessio",
    "p": "Selitysvideo tästä viritelmästä, kuvattu järvellä: mitä laudalle laitetaan, miten se kiinnitetään ja mitä siitä saadaan.",
    "cap": "Puhelin laudalla: GPS, gyroskooppi ja kiihtyvyys, suoraan mitattuna."
  },
  "next": {
    "h": "Mihin tämä johtaa",
    "p": "Mittalaitteen tarkoitus on, että se suunnataan johonkin. Lautadata antaa meille ensimmäistä kertaa vertailukohdan kahteen kysymykseen, joita olemme tähän asti vain arvioineet: **onko tämä liike pumppaus** ja **milloin lauta lakkasi lentämästä**. Molemmat lasketaan nykyään ranteesta, ja molemmat on kalibroitu yhden ihmisen mukaan. Miten laskenta toimii, kerrotaan [osassa 2](/nerd-analysen-2); kuinka hyvin se kestää vertailun toiseen anturiin, [osassa 3](/nerd-analysen-3)."
  },
  "setup": {
    "h": "Viritelmä, jos sitä siksi voi kutsua",
    "p": "Ei telinettä, ei koteloa, ei kiinnikettä. Puhelin menee vedenpitävään pussiin, pussi hihnan alle poikittain kannen yli, ja hihna kiristetään niin tiukalle, ettei puhelin pääse liikkumaan, vaikka lautaa paiskotaan. Kokonaiskustannus: yksi hihna. Koko ajatus on, että kuka tahansa voi toistaa tämän tavallisena tiistai-iltana, sillä data on arvokasta vain, jos sitä voi kerätä useammin kuin kerran.",
    "capDeck": "Koko viritelmä: vedenpitävä pussi hihnan alla, poikittain kannen yli, maston edessä.",
    "capRail": "Kiristetty ja tarkistettu ennen lenkkiä — kesken session liikkuva puhelin pilaa tallenteen."
  }
};


const fr: N4 = {
  "back": "← Partie 3 : La mesure à deux montres",
  "h1": "Partie 4 : Un téléphone collé à la planche",
  "subtitle": "Ce qu’on peut mesurer dès que le capteur ne voyage plus sur un poignet",
  "intro": "Chaque chiffre que ce site affiche sur le pumping vient, au bout du compte, d’un capteur attaché au bras de quelqu’un. Et ce bras n’en fait qu’à sa tête : il se balance, il se raidit, il se tend pour garder l’équilibre. Pendant trois volets de cette série, nous avons contourné le problème. En septembre 2026, nous avons arrêté de le contourner et **collé un téléphone sur la planche** — GPS, accéléromètre et gyroscope, 50 mesures par seconde, solidaire de ce que nous voulons vraiment connaître. Ce volet raconte ce qui en est sorti.",
  "why": {
    "h": "Ce que le poignet peut donner, et ce qu’il ne peut pas",
    "p": "La première surprise a été négative, et elle mérite d’être dite clairement, parce que nous attendions le contraire. Nous avons mis l’enregistrement de la planche à côté de celui d’une **Garmin au poignet pendant la même session, à deux minutes d’écart**, et comparé ce que chaque capteur voit dans le domaine fréquentiel. Si le poignet était sans espoir, le rythme du pumping y serait une bosse floue et, sur la planche, un pic net.",
    "p2": "C’est un pic net sur **les deux**. Même pic, mêmes 1,40 Hz, même hauteur. Le poignet trouve très bien la cadence de pumping — et c’est justement pour ça que notre compteur de pumps fonctionne : sur cette session, l’enregistrement de la planche a compté **103 pumps** et la montre **106**, à trois près. La planche n’est donc pas nécessaire pour entendre le rythme. Ce qu’elle apporte, le poignet ne pourra jamais l’apporter : **l’assiette de la planche elle-même** — de combien le nez plonge, de combien elle se penche sur le côté, de combien l’ensemble monte et descend. Un bras ne peut pas dire ça, quelle que soit la qualité du capteur qu’il porte.",
    "cap": "Même session, deux capteurs, 20 secondes du plus long run pour chacun. Les deux voient 1,40 Hz."
  },
  "setup": {
    "h": "Le montage, si on peut l’appeler ainsi",
    "p": "Pas de support, pas de boîtier, pas de fixation. Le téléphone va dans un sac étanche, le sac étanche sous une sangle passée en travers du pont, et la sangle est assez serrée pour que le téléphone ne puisse pas bouger pendant que la planche est secouée dans tous les sens. Coût total : une sangle. Tout l’intérêt, c’est que n’importe qui puisse le refaire un mardi soir, parce que les données n’ont de valeur que si on peut les recueillir plus d’une fois.",
    "capDeck": "Tout le montage : sac étanche sous une sangle, en travers du pont, devant le mât.",
    "capRail": "Sanglé et vérifié avant le run — un téléphone qui bouge en pleine session ruine l’enregistrement."
  },
  "what": {
    "h": "Ce qu’enregistre un téléphone sur la planche",
    "p": "Le téléphone écrit le même format d’envoi que toutes les montres que nous prenons en charge, plus un canal qu’aucune montre n’a : **le gyroscope**. C’est ce canal supplémentaire qui rend tout le reste possible — un gyroscope mesure directement la rotation, sans devoir deviner quelle part d’une accélération mesurée était la gravité et quelle part le mouvement. Des trois flux bruts, nous tirons trois angles et une distance :",
    "li": [
      "**Tangage (pitch)** — le nez qui monte et descend. C’*est* le geste de pumping ; tout le reste est secondaire.",
      "**Roulis (roll)** — la planche qui se penche à gauche et à droite. Le carving, et les petites corrections entre les pumps.",
      "**Lacet (yaw)** — le changement de cap. Recoupé avec la trace GPS, parce que les deux mesurent la même chose et doivent concorder.",
      "**Pilonnement (heave)** — de combien la planche monte et descend réellement, en centimètres, en intégrant deux fois l’accélération verticale."
    ],
    "cap": "Un run, 28 secondes. La courbe de tangage, c’est le pumping ; le pilonnement en dessous, c’est le même rythme, en centimètres.",
    "capTiles": "Les trois mêmes angles, tels que le site les affiche, en direct le long du parcours."
  },
  "mount": {
    "h": "Le problème dont personne ne nous avait prévenus : dans quel sens le téléphone est-il collé ?",
    "p": "Un téléphone n’a aucune idée de la façon dont il est collé sur une planche. Colle-le dans la longueur, et le tangage est bien du tangage. Colle-le en travers, et ce que le téléphone prend pour du tangage est en réalité le roulis de la planche. Colle-le en diagonale — ce qui est arrivé dès la toute première vraie session — et un tangage pur apparaît comme **71 % de tangage et 71 % de roulis en même temps**. Demander au rider de l’indiquer fonctionne exactement jusqu’au jour où quelqu’un recolle un téléphone mouillé avec les doigts gelés.",
    "p2": "Alors nous laissons les données répondre. Le pumping est une rotation autour de l’axe transversal de la planche, et un gyroscope mesure directement la rotation. On fait tourner le signal mesuré à travers tous les angles de montage possibles et on cherche où l’oscillation de tangage dans la bande de pumping (0,6–2,5 Hz) est la plus forte — cette direction est l’axe transversal. L’image ci-dessous montre ce balayage pour deux sessions : un téléphone collé en travers de la planche, l’autre en diagonale. Deux sessions, deux pics nets, sans que personne ait rien à indiquer. Ce que le balayage ne peut pas trancher, c’est nez vers l’avant ou nez vers l’arrière, car c’est le même axe ; la première seconde du run règle la question, puisqu’un run commence toujours par le nez qui plonge.",
    "cap": "Énergie de tangage dans la bande de pumping en fonction de l’angle de montage supposé. Le pic est la réponse."
  },
  "heave": {
    "h": "Le pilonnement, et pourquoi ce chiffre exige une réserve",
    "p": "De combien une planche monte-t-elle et descend-elle vraiment pendant que tu pompes ? Intégrer deux fois l’accélération donne une réponse en centimètres, et c’est exactement le genre de chiffre qui a l’air sûr de lui et qui est discrètement fragile. Tout ce qui est plus lent que la bande qu’on conserve est amplifié par le carré de sa période — une petite dérive à l’extrémité basse se transforme en mètres de pilonnement imaginaire.",
    "p2": "La fenêtre de mise à niveau fixe cette limite basse, et ce n’est pas un paramètre libre. Calcule le même run avec une fenêtre de 1 seconde et tu obtiens 18 cm ; avec 5 secondes, tu obtiens 33 cm, pour exactement la même session. Nous dérivons donc la fenêtre de la **cadence mesurée** du run — ici 1,38 Hz, soit 1,45 seconde — et nous signalons le chiffre comme peu fiable dès que le mouvement se trouve trop près de cette limite. La lecture honnête de ce graphique n’est pas *le pilonnement fait 20 cm* ; c’est *le pilonnement fait 20 cm si l’on définit le pilonnement comme le mouvement au rythme du pumping*.",
    "cap": "Le même run, les mêmes données, six fenêtres de mise à niveau différentes : de 18 cm à 33 cm."
  },
  "rules": {
    "h": "De la mesure au comptage : pumps, glisse et retour à l’eau",
    "p": "Dès que la planche rapporte son propre mouvement, le comptage sur la planche n’a plus besoin du compteur au poignet. Depuis le **10 octobre 2026**, chaque enregistrement avec le téléphone sur la planche est compté selon quatre règles simples que chacun peut vérifier :",
    "li": [
      "**Un pump est un geste qui apporte de l’énergie.** Chaque montée et descente de la planche dans la bande de pumping (0,5–3 Hz) est un cycle. Il ne compte comme pump que si le nez tangue en rythme avec le mouvement vertical — techniquement, si le produit moyen du tangage rapide et de la vitesse de pilonnement sur le cycle dépasse 30 % de la médiane de ce run. Les oscillations qui s’éteignent après le dernier pump et les petites corrections d’équilibre font aussi bouger la planche, mais n’apportent pas d’énergie.",
      "**Le run se termine au retour à l’eau.** C’est le premier point GPS propre, dans les 15 dernières secondes d’un run, en dessous de max(8 km/h, 60 % de la vitesse de croisière du run), moins 0,7 s pour le retard de la vitesse GPS. Le retour à l’eau peut seulement raccourcir un run, jamais l’allonger.",
      "**La glisse, c’est voler sans pomper.** Les passages sans pump de 1,5 à 15 secondes comptent comme glisse — la même règle que celle que la carte de session utilisait déjà pour afficher les glisses. L’élan avant le premier pump ne compte pas, la fin du run si, et un passage sans données de mouvement ne compte pas du tout.",
      "**Ce qui est trop court pour être jugé reste comme avant.** Un run de moins de cinq cycles n’a pas de médiane qui ait un sens ; il garde donc le comptage du compteur au poignet."
    ],
    "p2": "Sur les 20 enregistrements de planche de six riders dont nous disposions ce jour-là, les règles comptent **14 % de pumps en moins** que le compteur au poignet, et la glisse représente **environ 8 % du temps de foil**. La plupart des vraies glisses durent 2 à 6 secondes ; la plus longue a duré 11,9 s, lors d’une session où le téléphone avait été tourné entre deux runs — les règles supposent un téléphone fermement fixé, et un téléphone qui bouge produit des glisses qui n’ont jamais eu lieu. Les anciennes valeurs restent enregistrées à côté des nouvelles, de sorte que chaque changement reste traçable."
  },
  "found": {
    "h": "Ce que quatre sessions nous ont déjà appris",
    "p": "C’est un petit tas de données — quatre enregistrements de planche —, donc ce sont des observations, pas des lois. Ce sont toutefois les premiers chiffres dont nous disposons qui décrivent la planche plutôt que le rider.",
    "li": [
      "**L’orientation du montage est trouvée automatiquement, et elle est stable.** Sur deux runs d’une même session, l’angle détecté a varié de 3° — du bruit de calcul, pas un téléphone qui bouge. D’une session à l’autre, il a varié exactement autant que la position du ruban adhésif.",
      "**La cadence est remarquablement régulière.** 1,38 et 1,39 Hz sur deux runs d’une même session ; 1,45 Hz sur une autre. Le pumping ressemble moins à un effort qu’à une résonance que quelqu’un aurait trouvée.",
      "**Le pilonnement tourne autour de 20 cm** à cette cadence, mesuré du point bas au point haut, avec la réserve exprimée plus haut.",
      "**Le tangage oscille d’environ ±19°, le roulis d’environ ±10°** sur un run propre — la planche tangue donc bien plus qu’elle ne roule. C’est exactement ce que suppose toute l’approche de détection, et personne ne l’avait jamais vraiment vérifié."
    ]
  },
  "limits": {
    "h": "Ce que cela ne prouve pas encore",
    "p": "La liste de ce que nous ne pouvons pas affirmer est plus longue que celle de ce que nous pouvons affirmer, et elle doit le rester tant que les données n’auront pas grossi :",
    "li": [
      "**Quatre sessions, un rider, une planche, un lac.** Rien ici n’est validé sur plusieurs riders, et notre comptage de pumps est toujours étalonné sur une seule personne — voir la [Partie 3](/nerd-analysen-3) pour mesurer à quel point cette base est mince.",
      "**Le temps de glisse n’est mesuré que sur la planche.** Au poignet, le chiffre que nous affichons comme plus longue glisse reste le plus long écart entre deux pumps *détectés*, ce qui n’est pas la même chose.",
      "**Personne ne ride avec un téléphone collé sur sa planche.** C’est un instrument de mesure, pas une fonctionnalité. Son rôle est de produire la référence à laquelle on compare la montre à ton poignet."
    ]
  },
  "videorun": {
    "h": "La session elle-même",
    "p": "La vidéo explicative de ce montage, tournée au lac : ce qu’on met sur la planche, comment c’est fixé et ce qu’on en retire.",
    "cap": "Téléphone sur la planche : GPS, gyroscope et accélération, mesurés directement."
  },
  "next": {
    "h": "Et ensuite",
    "p": "Un instrument de mesure n’a de sens que si on le pointe vers quelque chose. Les données de la planche nous donnent, pour la première fois, une référence fiable pour deux questions que nous n’avions jamais fait qu’estimer : **ce geste est-il un pump**, et **quand la planche a-t-elle cessé de voler**. Les deux sont aujourd’hui comptés au poignet et étalonnés sur une seule personne. Le fonctionnement de ce comptage est expliqué dans la [Partie 2](/nerd-analysen-2) ; sa tenue face à un second capteur, dans la [Partie 3](/nerd-analysen-3)."
  }
};


const gsw: N4 = {
  "back": "← Teil 3: D Doppel-Uhr-Mässig",
  "h1": "Teil 4: E Händy am Board",
  "subtitle": "Was mer chönd mässe, sobald de Sensor nüme am Handglänk mitfahrt",
  "intro": "Jedi Zahl, wo die Siite übers Pumpe zeigt, chunnt am Änd vomene Sensor am Arm vo irgendöpperem. Und dä Arm macht, was er will: Er schwingt, er spannt sich aa, er langet zum Uusbalanciere i d Luft. Drü Teil lang händ mer um das Problem umegschaffet. Im September 2026 händ mer demit ufghört und **es Händy ufs Board klebt** — GPS, Beschleunigungssensor und Gyroskop, 50 Mässwärt pro Sekunde, fescht verbunde mit dem, wo’s eus eigentlich drum gaht. I dem Teil staht, was dabii usecho isch.",
  "why": {
    "h": "Was s Handglänk cha liefere und was nöd",
    "p": "Di erscht Überraschig isch e negativi gsi, und mer sägeds grad use, wil mer s Gägeteil erwartet händ. Mer händ d Board-Ufnahm näbe e **Garmin am Handglänk us de gliiche Fahrt, zwei Minute verschobe,** gleit und vergliche, was jede vo de beide Sensore im Frequänzbereich gseht. Wär s Handglänk hoffnigslos, dänn wär de Pump-Rhythmus det en verschmierte Hügel und am Board en scharfe Peak.",
    "p2": "Er isch aber uf **beidne** en scharfe Peak. De gliich Peak, di gliiche 1,40 Hz, di gliich Höchi. S Handglänk findet d Pump-Kadänz ganz problemlos — genau drum funktioniert euse Pump-Zähler überhaupt: Bi dere Fahrt hät d Board-Ufnahm **103 Pumps** zellt und d Uhr **106**, nur drü usenand. Zum de Rhythmus ghöre bruuchts s Board also nöd. Es liefert öppis, wo s Handglänk nie cha liefere: **d Lag vom Board sälber** — wie wiit d Nase abtaucht, wie wiit s Board uf d Siite kippt, wie wiit sich s Ganze hebt und senkt. En Arm cha das nöd mälde, ganz egal wie guet de Sensor dra isch.",
    "cap": "Gliichi Fahrt, zwei Sensore, je 20 Sekunde us em längschte Lauf. Beidi gsehnd 1,40 Hz."
  },
  "setup": {
    "h": "De Ufbau, wänn mer dem so wott säge",
    "p": "Es git kei Halterig, kei Ghüüs, kei Chlammere. S Händy chunnt in en Dry Bag, de Dry Bag under en Gurt quer übers Deck, und de Gurt wird so fescht aazoge, dass s Händy nöd cha verrutsche, au wänn s Board umegworfe wird. Chöschte total: ein Gurt. De ganz Sinn isch, dass das jede amene Ziischtigabig cha nachemache — will d Date nume öppis wärt sind, wänn mer s meh als eimal cha sammle.",
    "capDeck": "De ganz Ufbau: Dry Bag under emne Gurt, quer übers Deck, vor em Mascht.",
    "capRail": "Feschtzurrt und vor em Lauf kontrolliert — es Händy, wo sich während de Fahrt bewegt, macht d Ufnahm kaputt."
  },
  "what": {
    "h": "Was es Händy am Board ufzeichnet",
    "p": "S Händy schriibt s gliiche Upload-Format wie jedi Uhr, wo mer unterstützed, und dezue en Kanal, wo kei vo de Uhre hät: **s Gyroskop**. Erscht dä zuesätzlich Kanal macht de Räscht möglich — es Gyroskop misst Drehig diräkt und mues nöd rate, wele Teil vonere gmässne Beschleunigung Schwerchraft gsi isch und wele Bewegig. Us de drü Rohdateströöm leited mer drü Winkel und ei Strecki ab:",
    "li": [
      "**Nicke (Pitch)** — d Nase gaht ufe und abe. Das *isch* d Pumpbewegig; alles anderi isch Näbesach.",
      "**Rolle (Roll)** — s Board leit sich nach links und rächts. Carve und di chliine Korrekture zwüsche de Pumps.",
      "**Giere (Yaw)** — d Richtigsänderig. Mit de GPS-Spur abgliche, wil beidi s Gliiche mässed und überiistimme müend.",
      "**Hub (Heave)** — wie wiit sich s Board würkli hebt und senkt, in Zentimeter, us de zweifache Integration vo de vertikale Beschleunigung."
    ],
    "cap": "Ein Lauf, 28 Sekunde. D Nick-Kurve isch s Pumpe; de Hub drunder isch de gliich Rhythmus, in Zentimeter.",
    "capTiles": "Di gliiche drü Winkel, wie d Siite sie zeigt, live entlang de Strecki."
  },
  "mount": {
    "h": "S Problem, wo eus niemer devor gwarnt hät: Wie ume klebt s Händy?",
    "p": "Es Händy hät kei Ahnig, wie’s uf emne Board klebt. Klebsch es längs druf, isch Nicke Nicke. Klebsch es quer druf, isch das, wo s Händy für Nicke haltet, in Wahrheit s Rolle vom Board. Klebsch es schräg druf — genau so passiert bi de allererschte richtige Fahrt —, dänn chunnt e reini Nickschwingig als **71 % Nicke und 71 % Rolle gliichziitig** use. De Fahrer bitte, dass er’s aagit, funktioniert genau so lang, bis öpper es nasses Händy mit chalte Finger neu aaklebt.",
    "p2": "Also lönd mer d Date antworte. Pumpe isch e Drehig um d Querachse vom Board, und es Gyroskop misst Drehig diräkt. Mer drähed s gmässne Signal rächnerisch dur jede möglich Iibauwinkel und lueged, wo d Nickschwingig im Pump-Band (0,6–2,5 Hz) am stärchschte isch — die Richtig isch d Querachse. S Bild unde zeigt dä Durchlauf für zwei Fahrte: eis Händy quer ufs Board klebt, eis schräg. Zwei Fahrte, zwei suuberi Peaks, ohni dass öpper öppis hät müese aagä. Was de Durchlauf nöd cha entscheide, isch Nase vorne oder Nase hine, will das di gliich Achse isch; das klärt di erscht Sekunde vom Lauf, will jede Lauf demit aafangt, dass d Nase abegaht.",
    "cap": "Nick-Energie im Pump-Band über em aagnoone Iibauwinkel. De Peak isch d Antwort."
  },
  "heave": {
    "h": "De Hub — und worum d Zahl en Vorbehalt bruucht",
    "p": "Wie wiit bewegt sich es Board bim Pumpe würkli ufe und abe? Wänn mer d Beschleunigung zweimal integriert, überchunnt mer e Antwort in Zentimeter, und das isch genau die Art Zahl, wo zueverlässig uusgseht und heimlich ganz fragil isch. Alles, wo langsamer isch als s Band, wo mer bhaltet, wird mit em Quadrat vo sinere Periode verstärkt — es bitzli Drift am undere Änd wird zu Meter vo iibildetem Hub.",
    "p2": "S Uusgliichsfänschter leit die under Gränze fescht, und das cha mer nöd frei wähle. Rächnet mer de gliich Lauf mit emne 1-Sekunde-Fänschter, chömed 18 cm use; mit 5 Sekunde sinds 33 cm — für exakt di gliich Fahrt. Drum leited mer s Fänschter us de **gmässne Kadänz** vom Lauf ab — da 1,38 Hz, also 1,45 Sekunde — und markiered d Zahl als unzueverlässig, sobald d Bewegig z nöch a dere Gränze liit. Ehrlich gläse seit die Grafik nöd *de Hub isch 20 cm*, sondern *de Hub isch 20 cm, wänn mer Hub als d Bewegig im Pump-Tempo definiert*.",
    "cap": "De gliich Lauf, di gliiche Date, sächs verschideni Uusgliichsfänschter: 18 cm bis 33 cm."
  },
  "rules": {
    "h": "Vom Mässe zum Zelle: Pumps, Glite und Ufsetze",
    "p": "Sobald s Board sini eigeti Bewegig mäldet, bruucht s Zelle am Board de Handglänk-Zähler nüme. Sit em **10. Oktober 2026** wird jedi Ufnahm mit em Händy am Board nach vier eifache Regle zellt, wo jede sälber cha nacheprüefe:",
    "li": [
      "**En Pump isch e Bewegig, wo Energie inesteckt.** Jedes Uf und Ab vom Board im Pump-Band (0,5–3 Hz) isch en Zyklus. Als Pump zellt er aber nur, wänn d Nase im Takt vo de Vertikalbewegig nickt — technisch: wänn s mittleri Produkt us schnällem Nicke und Hubgschwindigkeit über de Zyklus meh als 30 % vom Median vo dem Lauf uusmacht. S Uusschwinge nach em letschte Pump und chliini Uusgliichsbewegige bewegid s Board zwar au, stecked aber kei Energie ine.",
      "**De Lauf hört bim Ufsetze uf.** Das isch de erscht suuber GPS-Punkt i de letschte 15 Sekunde vomene Lauf under max(8 km/h, 60 % vom Reisetempo vo dem Lauf), minus 0,7 s, will d GPS-Gschwindigkeit hinedrii isch. S Ufsetze cha en Lauf nur chürzer mache, nie länger.",
      "**Glite isch Flüüge ohni Pumpe.** Abschnitt ohni Pump vo 1,5 bis 15 Sekunde zelled als Glite — di gliich Regle, nach dere d Session-Charte d Gleitphase scho bis jetzt aazeigt hät. De Aalauf vor em erschte Pump zellt nöd, s Änd vom Lauf scho, und en Abschnitt, wo Bewegigsdate fähled, zellt gar nöd.",
      "**Was z churz isch zum Beurteile, bliibt, wie’s gsi isch.** En Lauf mit weniger als füf Zykle hät kein sinnvolle Median und bhaltet drum d Zahl vom Handglänk-Zähler."
    ],
    "p2": "Über di 20 Board-Ufnahme vo sächs Fahrer, wo mer a dem Tag gha händ, zelled d Regle **14 % weniger Pumps** als de Handglänk-Zähler, und s Glite macht **öppe 8 % vo de Foil-Ziit** us. Di meischte echte Gleitphase dured 2 bis 6 Sekunde; di längscht hät 11,9 s dauret, und zwar bi nere Fahrt, wo s Händy zwüsche zwei Läuf verdräht worde isch — d Regle gönd vomene fescht sitzende Händy us, und es Händy, wo verrutscht, erfindet Gleitphase, wo’s nie gä hät. Di alte Wärt bliibed näbe de neue gspeicheret, so dass mer jedi Änderig cha zruggverfolge."
  },
  "found": {
    "h": "Was eus vier Fahrte scho verrate händ",
    "p": "Das isch es chliises Hüüfeli Date — vier Board-Ufnahme —, also sind das Beobachtige und kei Gsetz. Es sind aber di erschte Zahle, wo s Board beschriibed statt de Fahrer.",
    "li": [
      "**D Iibaulag wird automatisch gfunde, und si isch stabil.** Über zwei Läuf vo einere Fahrt hät de erkannt Winkel um 3° gschwankt — Rächeruusche, kei verrutschts Händy. Zwüsche de Fahrte hät er genau um so vill gschwankt, wie s Chläbband anders gsässe isch.",
      "**D Kadänz isch bemerkenswert gliichmässig.** 1,38 und 1,39 Hz i zwei Läuf vo einere Fahrt; 1,45 Hz bi nere andere. Pumpe gseht weniger nach Aasträngig us als nach ere Resonanz, wo öpper gfunde hät.",
      "**De Hub liit bi öppe 20 cm** bi dere Kadänz, gmässe vo ganz unde bis ganz obe, mit em Vorbehalt vo vorhär.",
      "**S Nicke pendlet um öppe ±19°, s Rolle um öppe ±10°** imene suubere Lauf — s Board nickt also vill meh, als es rollt. Genau devo gaht de ganz Erkennigsaasatz us, und überprüeft hät das bis jetzt nie öpper."
    ]
  },
  "limits": {
    "h": "Was das no nöd bewiist",
    "p": "D Lischte vo dem, wo mer nöd chönd behaupte, isch länger als d Lischte vo dem, wo mer chönd behaupte — und so söll’s au bliibe, bis meh Date da sind:",
    "li": [
      "**Vier Fahrte, ein Fahrer, eis Board, ein See.** Nüüt devo isch über mehreri Fahrer bestätigt, und eusi Pump-Zellig isch immer no uf einere einzige Person kalibriert — wie dünn dä Bode isch, staht in [Teil 3](/nerd-analysen-3).",
      "**D Gleitziit wird nur am Board gmässe.** Am Handglänk isch d Zahl, wo mer als längschti Gleitphase aazeiged, wiiterhin di längscht Lücke zwüsche zwei *erkannte* Pumps — und das isch nöd s Gliiche.",
      "**Niemer fahrt mit emne Händy, wo ufs Board klebt isch.** Das isch es Mässinstrumänt, kei Funktion. Sini Ufgab isch, d Wahrheit z liefere, a dere d Uhr a dim Handglänk gmässe wird."
    ]
  },
  "videorun": {
    "h": "D Fahrt sälber",
    "p": "S Erklärvideo zu dem Ufbau, gfilmt am See: was ufs Board chunnt, wie’s befestiget wird und was dabii usechunnt.",
    "cap": "Händy am Board: GPS, Gyroskop und Beschleunigung, diräkt gmässe."
  },
  "next": {
    "h": "Wo das anefüehrt",
    "p": "Es Mässinstrumänt isch defür da, dass mer’s uf öppis richtet. D Board-Date liefered eus zum erschte Mal e Referenz für zwei Frage, wo mer bis jetzt immer nur gschätzt händ: **isch die Bewegig en Pump**, und **wänn hät s Board ufghört z flüüge**. Beides wird hüt am Handglänk zellt und isch uf einere einzige Person kalibriert. Wie die Zellig funktioniert, staht in [Teil 2](/nerd-analysen-2); wie guet si gäge en zweite Sensor standhaltet, in [Teil 3](/nerd-analysen-3)."
  }
};


const id: N4 = {
  "back": "← Bagian 3: Pengukuran dual-watch",
  "h1": "Bagian 4: Ponsel yang ditempel ke papan",
  "subtitle": "Apa yang bisa kami ukur begitu sensornya tidak lagi ikut di pergelangan tangan",
  "intro": "Setiap angka tentang pumping yang ditampilkan situs ini pada akhirnya berasal dari sensor yang diikat di lengan seseorang. Dan lengan itu bergerak semaunya sendiri: berayun, menegang, terentang mencari keseimbangan. Selama tiga bagian seri ini kami mengakali masalah itu. Pada September 2026 kami berhenti mengakalinya dan **menempelkan ponsel ke papan** — GPS, akselerometer, dan giroskop, 50 sampel per detik, terpasang mati pada benda yang sebenarnya ingin kami ketahui. Bagian ini berisi apa yang kami dapatkan.",
  "why": {
    "h": "Apa yang bisa dan tidak bisa diberikan pergelangan tangan",
    "p": "Kejutan pertama justru negatif, dan perlu dikatakan terus terang karena kami mengharapkan yang sebaliknya. Kami menyandingkan rekaman papan dengan rekaman **Garmin di pergelangan tangan dari sesi yang sama, berselang dua menit**, lalu membandingkan apa yang dilihat masing-masing sensor dalam domain frekuensi. Seandainya pergelangan tangan tidak bisa diandalkan, ritme pumping di sana akan berupa gundukan kabur, sedangkan di papan berupa puncak yang tajam.",
    "p2": "Ternyata puncaknya tajam di **keduanya**. Puncak yang sama, 1,40 Hz yang sama, tinggi yang sama. Pergelangan tangan menemukan kadens pumping dengan sangat baik — dan justru karena itulah penghitung pump kami bisa bekerja: pada sesi ini rekaman papan menghitung **103 pump** dan jam tangan **106**, selisih hanya tiga. Jadi papan tidak diperlukan untuk menangkap ritmenya. Yang diberikan papan adalah sesuatu yang tidak akan pernah bisa diberikan pergelangan tangan: **posisi papan itu sendiri** — seberapa dalam hidung papan menukik, seberapa jauh papan miring ke samping, seberapa tinggi seluruh papan naik dan turun. Lengan tidak bisa melaporkan hal itu, sebagus apa pun sensor yang dipasang di sana.",
    "cap": "Sesi yang sama, dua sensor, masing-masing 20 detik dari run terpanjang. Keduanya melihat 1,40 Hz."
  },
  "setup": {
    "h": "Perlengkapannya, kalau bisa disebut begitu",
    "p": "Tidak ada dudukan, tidak ada casing, tidak ada braket. Ponsel masuk ke dry bag, dry bag diselipkan di bawah tali yang melintang di atas dek, dan tali itu dikencangkan sampai ponsel tidak bisa bergeser meskipun papan terbanting ke sana kemari. Total biaya: satu tali. Intinya, ini harus bisa diulang siapa saja pada suatu Selasa malam, karena data baru berharga kalau bisa dikumpulkan lebih dari sekali.",
    "capDeck": "Seluruh perlengkapan: dry bag di bawah tali, melintang di atas dek, di depan mast.",
    "capRail": "Diikat erat dan diperiksa sebelum run — ponsel yang bergeser di tengah sesi merusak rekaman."
  },
  "what": {
    "h": "Apa yang direkam ponsel di atas papan",
    "p": "Ponsel menulis format unggahan yang sama dengan semua jam tangan yang kami dukung, ditambah satu kanal yang tidak dimiliki jam tangan mana pun: **giroskop**. Kanal tambahan inilah yang membuat sisanya mungkin — giroskop mengukur rotasi secara langsung, tanpa perlu menebak bagian mana dari percepatan terukur yang berasal dari gravitasi dan bagian mana dari gerakan. Dari tiga aliran data mentah itu kami menurunkan tiga sudut dan satu jarak:",
    "li": [
      "**Angguk (pitch)** — hidung papan naik dan turun. Inilah gerakan pump yang *sebenarnya*; yang lain hanya pelengkap.",
      "**Guling (roll)** — papan miring ke kiri dan ke kanan. Carving, dan koreksi-koreksi kecil di antara pump.",
      "**Geleng (yaw)** — perubahan arah hadap. Dicocokkan dengan jejak GPS, karena keduanya mengukur hal yang sama dan harus sesuai.",
      "**Naik-turun (heave)** — seberapa jauh papan benar-benar naik dan turun, dalam sentimeter, dari integrasi ganda percepatan vertikal."
    ],
    "cap": "Satu run, 28 detik. Kurva angguk adalah pumping-nya; naik-turun di bawahnya adalah ritme yang sama, dalam sentimeter.",
    "capTiles": "Tiga sudut yang sama seperti yang ditampilkan situs, langsung di sepanjang lintasan."
  },
  "mount": {
    "h": "Masalah yang tidak pernah diperingatkan siapa pun: ponselnya ditempel menghadap ke mana?",
    "p": "Ponsel tidak tahu bagaimana ia menempel di papan. Tempel memanjang, maka angguk tetap angguk. Tempel melintang, maka yang dianggap ponsel sebagai angguk sebenarnya adalah papan yang berguling. Tempel diagonal — seperti yang terjadi pada sesi sungguhan yang paling pertama — maka osilasi angguk murni muncul sebagai **71 % angguk dan 71 % guling sekaligus**. Meminta rider mengisinya sendiri hanya berhasil sampai seseorang menempel ulang ponsel yang basah dengan jari yang kedinginan.",
    "p2": "Jadi kami biarkan datanya yang menjawab. Pumping adalah rotasi terhadap sumbu melintang papan, dan giroskop mengukur rotasi secara langsung. Sinyal terukur diputar secara matematis melalui setiap sudut pemasangan yang mungkin, lalu dicari di mana osilasi angguk dalam pita pump (0,6–2,5 Hz) paling kuat — arah itulah sumbu melintangnya. Gambar di bawah menunjukkan penyapuan itu untuk dua sesi: satu ponsel ditempel melintang, satu lagi diagonal. Dua sesi, dua puncak yang bersih, tanpa perlu masukan dari siapa pun. Yang tidak bisa diputuskan oleh penyapuan ini adalah apakah hidung papan menghadap ke depan atau ke belakang, karena itu sumbu yang sama; detik pertama run yang menentukannya, sebab setiap run dimulai dengan hidung papan menukik ke bawah.",
    "cap": "Energi angguk dalam pita pump terhadap sudut pemasangan yang diasumsikan. Puncaknya adalah jawabannya."
  },
  "heave": {
    "h": "Naik-turun, dan mengapa angkanya perlu catatan",
    "p": "Seberapa jauh papan sebenarnya bergerak naik dan turun saat kamu memompa? Mengintegrasikan percepatan dua kali menghasilkan jawaban dalam sentimeter, dan itu jenis angka yang tampak meyakinkan padahal diam-diam rapuh. Apa pun yang lebih lambat daripada pita yang dipertahankan akan diperkuat sebesar kuadrat periodenya — drift kecil di ujung bawah bisa berubah menjadi naik-turun khayalan bermeter-meter.",
    "p2": "Jendela perataan menentukan batas bawah itu, dan nilainya tidak bisa dipilih sesuka hati. Hitung run yang sama dengan jendela 1 detik dan hasilnya 18 cm; dengan 5 detik hasilnya 33 cm — untuk sesi yang persis sama. Karena itu kami menurunkan jendelanya dari **kadens terukur** run tersebut — di sini 1,38 Hz, jadi 1,45 detik — dan menandai angkanya tidak andal setiap kali gerakannya terlalu dekat dengan batas itu. Cara jujur membaca grafik ini bukan *naik-turunnya 20 cm*, melainkan *naik-turunnya 20 cm jika naik-turun didefinisikan sebagai gerakan pada tempo pumping*.",
    "cap": "Run yang sama, data yang sama, enam jendela perataan berbeda: 18 cm sampai 33 cm."
  },
  "rules": {
    "h": "Dari mengukur ke menghitung: pump, glide, dan menyentuh air",
    "p": "Begitu papan melaporkan gerakannya sendiri, penghitungan di papan tidak lagi membutuhkan penghitung di pergelangan tangan. Sejak **10 Oktober 2026**, setiap rekaman dengan ponsel di papan dihitung dengan empat aturan sederhana yang bisa diperiksa siapa saja:",
    "li": [
      "**Pump adalah gerakan yang memasukkan energi.** Setiap naik-turun papan dalam pita pump (0,5–3 Hz) adalah satu siklus. Siklus itu baru dihitung sebagai pump jika hidung papan mengangguk seirama dengan gerakan vertikal — secara teknis, jika rata-rata hasil kali angguk cepat dan kecepatan naik-turun sepanjang siklus melebihi 30 % dari median run tersebut. Osilasi yang meredup setelah pump terakhir dan koreksi keseimbangan kecil juga menggerakkan papan, tetapi tidak memasukkan energi.",
      "**Run berakhir saat papan menyentuh air.** Itu adalah titik GPS bersih pertama dalam 15 detik terakhir sebuah run yang kecepatannya di bawah max(8 km/h, 60 % dari kecepatan jelajah run itu), dikurangi 0,7 s untuk keterlambatan kecepatan GPS. Titik sentuh air hanya bisa memperpendek run, tidak pernah memperpanjangnya.",
      "**Glide adalah terbang tanpa memompa.** Bagian tanpa pump selama 1,5 hingga 15 detik dihitung sebagai glide — aturan yang sama yang sudah dipakai peta sesi untuk menampilkan glide. Ancang-ancang sebelum pump pertama tidak dihitung, akhir run dihitung, dan bagian dengan data gerak yang hilang tidak dihitung sama sekali.",
      "**Yang terlalu pendek untuk dinilai tetap seperti semula.** Run dengan kurang dari lima siklus tidak punya median yang bermakna, jadi tetap memakai hitungan dari penghitung pergelangan tangan."
    ],
    "p2": "Dari 20 rekaman papan milik enam rider yang kami punya hari itu, aturan ini menghitung **14 % lebih sedikit pump** daripada penghitung pergelangan tangan, dan glide mengisi **sekitar 8 % waktu foiling**. Sebagian besar glide sungguhan berlangsung 2 hingga 6 detik; yang terpanjang 11,9 s, pada sesi di mana ponselnya sempat terputar di antara dua run — aturan ini mengandaikan ponsel terpasang kuat, dan ponsel yang bergeser menghasilkan glide yang tidak pernah terjadi. Nilai lama tetap disimpan di samping nilai baru, sehingga setiap perubahan bisa ditelusuri."
  },
  "found": {
    "h": "Apa yang sudah kami pelajari dari empat sesi",
    "p": "Ini tumpukan data yang kecil — empat rekaman papan — jadi ini pengamatan, bukan hukum. Meski begitu, inilah angka-angka pertama yang kami punya yang menggambarkan papannya, bukan ridernya.",
    "li": [
      "**Arah pemasangan ditemukan otomatis, dan hasilnya stabil.** Pada dua run dari satu sesi, sudut yang terdeteksi bervariasi 3° — itu derau perhitungan, bukan ponsel yang bergeser. Antar sesi, sudutnya bervariasi persis sebesar perbedaan cara selotipnya ditempel.",
      "**Kadensnya sangat stabil.** 1,38 dan 1,39 Hz pada dua run dari satu sesi; 1,45 Hz pada sesi lain. Pumping lebih mirip resonansi yang sudah ditemukan seseorang daripada sebuah usaha keras.",
      "**Naik-turunnya sekitar 20 cm** pada kadens itu, diukur dari titik terendah sampai tertinggi, dengan catatan di atas.",
      "**Angguk berayun sekitar ±19°, guling sekitar ±10°** pada run yang bersih — papan jauh lebih banyak mengangguk daripada berguling. Itulah persis yang diasumsikan seluruh pendekatan deteksi kami, dan belum pernah benar-benar diperiksa."
    ]
  },
  "limits": {
    "h": "Apa yang belum dibuktikan oleh ini",
    "p": "Daftar hal yang tidak bisa kami klaim lebih panjang daripada daftar hal yang bisa, dan memang harus tetap begitu sampai datanya bertambah:",
    "li": [
      "**Empat sesi, satu rider, satu papan, satu danau.** Belum ada yang divalidasi pada rider lain, dan penghitungan pump kami masih dikalibrasi pada satu orang saja — lihat [Bagian 3](/nerd-analysen-3) untuk melihat betapa tipisnya pijakan itu.",
      "**Waktu glide hanya diukur di papan.** Di pergelangan tangan, angka yang kami tampilkan sebagai glide terpanjang masih merupakan jeda terpanjang di antara dua pump yang *terdeteksi*, dan itu bukan hal yang sama.",
      "**Tidak ada yang foiling dengan ponsel tertempel di papannya.** Ini alat ukur, bukan fitur. Tugasnya adalah menghasilkan kebenaran yang menjadi patokan untuk mengukur jam tangan di pergelanganmu."
    ]
  },
  "videorun": {
    "h": "Sesinya sendiri",
    "p": "Video penjelasan perlengkapan ini, direkam di danau: apa yang dipasang di papan, bagaimana memasangnya, dan apa hasilnya.",
    "cap": "Ponsel di papan: GPS, giroskop, dan percepatan, diukur langsung."
  },
  "next": {
    "h": "Ke mana arahnya",
    "p": "Alat ukur ada untuk diarahkan pada sesuatu. Data papan memberi kami, untuk pertama kalinya, patokan kebenaran untuk dua pertanyaan yang selama ini hanya bisa kami perkirakan: **apakah gerakan ini sebuah pump**, dan **kapan papan berhenti terbang**. Keduanya saat ini dihitung di pergelangan tangan dan dikalibrasi pada satu orang. Cara kerja penghitungan itu ada di [Bagian 2](/nerd-analysen-2); seberapa baik hasilnya dibandingkan sensor kedua ada di [Bagian 3](/nerd-analysen-3)."
  }
};


const it: N4 = {
  "back": "← Parte 3: La misura con due orologi",
  "h1": "Parte 4: Un telefono incollato alla tavola",
  "subtitle": "Cosa possiamo misurare quando il sensore smette di viaggiare su un polso",
  "intro": "Ogni numero sul pumping che questo sito mostra viene, in fondo, da un sensore legato al braccio di qualcuno. E quel braccio fa di testa sua: oscilla, si irrigidisce, si allunga per cercare l’equilibrio. Per tre puntate di questa serie abbiamo aggirato il problema. A settembre 2026 abbiamo smesso di aggirarlo e **abbiamo incollato un telefono alla tavola** — GPS, accelerometro e giroscopio, 50 campioni al secondo, solidale con la cosa che vogliamo davvero conoscere. Questa parte racconta cosa ne è venuto fuori.",
  "why": {
    "h": "Cosa può dare il polso e cosa no",
    "p": "La prima sorpresa è stata negativa, e vale la pena dirlo chiaramente, perché ci aspettavamo il contrario. Abbiamo messo la registrazione della tavola accanto a quella di un **Garmin al polso nella stessa sessione, a due minuti di distanza**, e confrontato quello che ciascun sensore vede nel dominio della frequenza. Se il polso fosse senza speranza, il ritmo del pumping lì sarebbe una gobba sfocata e sulla tavola un picco netto.",
    "p2": "È un picco netto su **entrambi**. Stesso picco, stessi 1,40 Hz, stessa altezza. Il polso trova benissimo la cadenza del pumping — ed è proprio per questo che il nostro contapump funziona: in questa sessione la registrazione della tavola ha contato **103 pump** e l’orologio **106**, appena tre di differenza. Quindi la tavola non serve per sentire il ritmo. Quello che dà è qualcosa che il polso non potrà mai dare: **l’assetto della tavola stessa** — quanto scende la punta, quanto la tavola si inclina di lato, quanto l’insieme sale e scende. Un braccio non può riferirlo, per quanto buono sia il sensore che porta.",
    "cap": "Stessa sessione, due sensori, 20 secondi del run più lungo per ciascuno. Entrambi vedono 1,40 Hz."
  },
  "setup": {
    "h": "L’attrezzatura, se così si può chiamare",
    "p": "Nessun supporto, nessuna custodia, nessuna staffa. Il telefono va in una sacca stagna, la sacca stagna sotto una cinghia che attraversa il deck, e la cinghia viene stretta abbastanza da impedire al telefono di spostarsi mentre la tavola viene sballottata. Costo totale: una cinghia. Il senso di tutto è che chiunque possa rifarlo un martedì sera, perché i dati valgono qualcosa solo se si possono raccogliere più di una volta.",
    "capDeck": "Tutta l’attrezzatura: sacca stagna sotto una cinghia, di traverso sul deck, davanti al mast.",
    "capRail": "Fissato e controllato prima del run — un telefono che si muove durante la sessione rovina la registrazione."
  },
  "what": {
    "h": "Cosa registra un telefono sulla tavola",
    "p": "Il telefono scrive lo stesso formato di caricamento di tutti gli orologi che supportiamo, più un canale che nessun orologio ha: **il giroscopio**. È questo canale in più a rendere possibile tutto il resto — un giroscopio misura direttamente la rotazione, senza dover indovinare quale parte di un’accelerazione misurata fosse gravità e quale movimento. Dai tre flussi grezzi ricaviamo tre angoli e una distanza:",
    "li": [
      "**Beccheggio (pitch)** — la punta che sale e scende. Questo *è* il gesto del pumping; tutto il resto è secondario.",
      "**Rollio (roll)** — la tavola che si inclina a sinistra e a destra. Il carving e le piccole correzioni tra un pump e l’altro.",
      "**Imbardata (yaw)** — il cambio di direzione. Confrontata con la traccia GPS, perché entrambe misurano la stessa cosa e devono coincidere.",
      "**Sollevamento (heave)** — di quanto la tavola sale e scende davvero, in centimetri, integrando due volte l’accelerazione verticale."
    ],
    "cap": "Un run, 28 secondi. La curva del beccheggio è il pumping; il sollevamento sotto è lo stesso ritmo, in centimetri.",
    "capTiles": "Gli stessi tre angoli come li mostra il sito, in diretta lungo il percorso."
  },
  "mount": {
    "h": "Il problema di cui nessuno ci aveva avvertito: in che verso è incollato il telefono?",
    "p": "Un telefono non ha idea di come sia incollato a una tavola. Incollalo per il lungo e il beccheggio è beccheggio. Incollalo di traverso e quello che il telefono chiama beccheggio è in realtà il rollio della tavola. Incollalo in diagonale — com’è successo proprio alla primissima sessione vera — e un beccheggio puro appare come **71 % di beccheggio e 71 % di rollio insieme**. Chiedere al rider di indicarlo funziona esattamente finché qualcuno non reincolla un telefono bagnato con le dita gelate.",
    "p2": "Così lasciamo rispondere i dati. Il pumping è una rotazione attorno all’asse trasversale della tavola, e un giroscopio misura direttamente la rotazione. Si ruota il segnale misurato attraverso tutti i possibili angoli di montaggio e si cerca dove l’oscillazione di beccheggio nella banda del pumping (0,6–2,5 Hz) è più forte — quella direzione è l’asse trasversale. L’immagine qui sotto mostra questa scansione per due sessioni: un telefono incollato di traverso, l’altro in diagonale. Due sessioni, due picchi netti, senza che nessuno dovesse indicare nulla. Quello che la scansione non può stabilire è se la punta guarda avanti o indietro, perché l’asse è lo stesso; lo decide il primo secondo del run, dato che ogni run comincia con la punta che scende.",
    "cap": "Energia di beccheggio nella banda del pumping rispetto all’angolo di montaggio ipotizzato. Il picco è la risposta."
  },
  "heave": {
    "h": "Il sollevamento, e perché il numero va preso con cautela",
    "p": "Di quanto sale e scende davvero una tavola mentre pompi? Integrare due volte l’accelerazione dà una risposta in centimetri, ed è esattamente il tipo di numero che sembra autorevole e sotto sotto è fragile. Tutto ciò che è più lento della banda che si conserva viene amplificato del quadrato del suo periodo — una piccola deriva all’estremo basso diventa metri di sollevamento immaginario.",
    "p2": "La finestra di livellamento fissa quel limite inferiore, e non è un parametro libero. Calcola lo stesso run con una finestra di 1 secondo e ottieni 18 cm; con 5 secondi ottieni 33 cm, per la stessa identica sessione. Per questo ricaviamo la finestra dalla **cadenza misurata** di quel run — qui 1,38 Hz, quindi 1,45 secondi — e segnaliamo il numero come inaffidabile ogni volta che il movimento si trova troppo vicino a quel limite. La lettura onesta di questo grafico non è *il sollevamento è di 20 cm*, ma *il sollevamento è di 20 cm se lo si definisce come il movimento al ritmo del pumping*.",
    "cap": "Lo stesso run, gli stessi dati, sei finestre di livellamento diverse: da 18 cm a 33 cm."
  },
  "rules": {
    "h": "Dal misurare al contare: pump, planata e ritorno in acqua",
    "p": "Una volta che la tavola riporta il proprio movimento, il conteggio sulla tavola non ha più bisogno del contatore al polso. Dal **10 ottobre 2026**, ogni registrazione con il telefono sulla tavola viene contata con quattro regole semplici che chiunque può verificare:",
    "li": [
      "**Un pump è un gesto che immette energia.** Ogni salita e discesa della tavola nella banda del pumping (0,5–3 Hz) è un ciclo. Conta come pump solo se la punta beccheggia a tempo con il movimento verticale — tecnicamente, se il prodotto medio tra beccheggio rapido e velocità di sollevamento sul ciclo supera il 30 % della mediana di quel run. Le oscillazioni che si smorzano dopo l’ultimo pump e le piccole correzioni di equilibrio muovono anch’esse la tavola, ma non immettono energia.",
      "**Il run finisce al ritorno in acqua.** È il primo punto GPS pulito negli ultimi 15 secondi di un run sotto max(8 km/h, 60 % della velocità di crociera del run), meno 0,7 s per il ritardo della velocità GPS. Il ritorno in acqua può solo accorciare un run, mai allungarlo.",
      "**Planare è volare senza pompare.** I tratti senza pump da 1,5 a 15 secondi contano come planata — la stessa regola con cui la mappa della sessione mostrava già le planate. La rincorsa prima del primo pump non conta, la fine del run sì, e un tratto con dati di movimento mancanti non conta affatto.",
      "**Ciò che è troppo corto per essere giudicato resta com’era.** Un run con meno di cinque cicli non ha una mediana sensata, quindi mantiene il conteggio del contatore al polso."
    ],
    "p2": "Sulle 20 registrazioni della tavola di sei rider che avevamo quel giorno, le regole contano **il 14 % di pump in meno** rispetto al contatore al polso, e la planata costituisce **circa l’8 % del tempo in foil**. La maggior parte delle planate reali dura da 2 a 6 secondi; la più lunga è stata di 11,9 s, in una sessione in cui il telefono era stato girato tra un run e l’altro — le regole presuppongono un telefono fissato saldamente, e un telefono che si sposta produce planate mai avvenute. I vecchi valori restano salvati accanto ai nuovi, così ogni modifica resta tracciabile."
  },
  "found": {
    "h": "Cosa ci hanno già detto quattro sessioni",
    "p": "È un mucchietto di dati — quattro registrazioni della tavola —, quindi sono osservazioni, non leggi. Sono però i primi numeri che abbiamo che descrivono la tavola anziché il rider.",
    "li": [
      "**L’orientamento del montaggio viene trovato automaticamente, ed è stabile.** In due run della stessa sessione l’angolo rilevato è variato di 3° — rumore di calcolo, non un telefono che si sposta. Da una sessione all’altra è variato esattamente quanto il nastro adesivo.",
      "**La cadenza è sorprendentemente regolare.** 1,38 e 1,39 Hz in due run della stessa sessione; 1,45 Hz in un’altra. Il pumping somiglia meno a uno sforzo e più a una risonanza che qualcuno ha trovato.",
      "**Il sollevamento è di circa 20 cm** a quella cadenza, misurato dal punto più basso al più alto, con la cautela detta sopra.",
      "**Il beccheggio oscilla di circa ±19°, il rollio di circa ±10°** in un run pulito — la tavola beccheggia molto più di quanto rolli. È esattamente ciò che presuppone tutto il metodo di rilevamento, e nessuno l’aveva mai verificato davvero."
    ]
  },
  "limits": {
    "h": "Cosa questo non dimostra ancora",
    "p": "L’elenco delle cose che non possiamo affermare è più lungo di quello delle cose che possiamo, e deve restare così finché i dati non cresceranno:",
    "li": [
      "**Quattro sessioni, un rider, una tavola, un lago.** Niente di tutto questo è validato su più rider, e il nostro conteggio dei pump è ancora calibrato su una sola persona — nella [Parte 3](/nerd-analysen-3) si vede quanto sia sottile quel terreno.",
      "**Il tempo di planata si misura solo sulla tavola.** Al polso, il numero che mostriamo come planata più lunga resta l’intervallo più lungo tra due pump *rilevati*, che non è la stessa cosa.",
      "**Nessuno va in foil con un telefono incollato alla tavola.** È uno strumento di misura, non una funzione. Il suo compito è produrre il riferimento con cui si misura l’orologio che hai al polso."
    ]
  },
  "videorun": {
    "h": "La sessione vera e propria",
    "p": "Il video che spiega questa attrezzatura, girato al lago: cosa va sulla tavola, come si fissa e cosa se ne ricava.",
    "cap": "Telefono sulla tavola: GPS, giroscopio e accelerazione, misurati direttamente."
  },
  "next": {
    "h": "Dove porta tutto questo",
    "p": "Uno strumento di misura serve a essere puntato su qualcosa. I dati della tavola ci danno, per la prima volta, un riferimento certo per due domande a cui finora abbiamo solo dato stime: **questo gesto è un pump**, e **quando la tavola ha smesso di volare**. Oggi entrambe le cose vengono contate al polso e sono calibrate su una sola persona. Come funziona questo conteggio è spiegato nella [Parte 2](/nerd-analysen-2); quanto regge al confronto con un secondo sensore, nella [Parte 3](/nerd-analysen-3)."
  }
};


const ja: N4 = {
  "back": "← パート3：デュアルウォッチ計測",
  "h1": "パート4：ボードに貼り付けられた携帯電話",
  "subtitle": "センサーが手首を離れたら、何が測れるのか",
  "intro": "このサイトがポンピングについて表示している数字は、突き詰めればすべて、誰かの腕に着けたセンサーから来ています。そしてその腕は勝手に動きます。振れるし、力んで固まるし、バランスを取ろうと伸びもします。このシリーズの3つのパートでは、その問題をなんとか回避してきました。2026年9月、私たちは回避するのをやめ、**ボードにスマホを貼り付けました** — GPS、加速度センサー、ジャイロスコープ、毎秒50サンプル。本当に知りたい対象そのものに固定したのです。このパートでは、そこから何が分かったかを紹介します。",
  "why": {
    "h": "手首で分かること、分からないこと",
    "p": "最初の驚きは期待を裏切るものでした。私たちは逆の結果を予想していたので、はっきり書いておく価値があります。ボードの記録を、**同じセッションで手首に着けたGarminの記録（2分ずれ）**と並べ、それぞれのセンサーが周波数領域で何を捉えているかを比べました。もし手首がまったく当てにならないなら、ポンプのリズムは手首側ではぼやけた山になり、ボード側では鋭いピークになるはずです。",
    "p2": "ところが、**どちらも**鋭いピークでした。同じピーク、同じ1.40 Hz、同じ高さです。手首はポンピングのケイデンスをきちんと捉えています — だからこそ、私たちのポンプカウンターはそもそも機能するのです。このセッションでは、ボードの記録が**103ポンプ**、ウォッチが**106ポンプ**を数え、差はわずか3でした。つまり、リズムを捉えるだけならボードは必要ありません。ボードが与えてくれるのは、手首には決して得られないもの、**ボードそのものの姿勢**です — ノーズがどれだけ沈むか、ボードが左右にどれだけ傾くか、全体がどれだけ上下するか。腕に着けたセンサーがどれほど優秀でも、それは分かりません。",
    "cap": "同じセッション、2つのセンサー、それぞれ最長ランから20秒。どちらも1.40 Hzを捉えています。"
  },
  "setup": {
    "h": "装備と呼べるほどのものでもない装備",
    "p": "マウントも、ケースも、ブラケットもありません。スマホを防水バッグに入れ、そのバッグをデッキを横切るストラップの下に挟み、ボードがどれだけ揺さぶられてもスマホがずれないくらいストラップをきつく締めます。費用はストラップ1本だけ。肝心なのは、誰でも平日の夜に再現できることです。データは、一度きりでなく何度も集められてこそ価値があるからです。",
    "capDeck": "装備のすべて：防水バッグをストラップで固定、デッキを横切って、マストの前方に。",
    "capRail": "ランの前に固定と確認 — セッション中にスマホが動くと記録が台無しになります。"
  },
  "what": {
    "h": "ボード上のスマホが記録するもの",
    "p": "スマホは、私たちが対応しているすべてのウォッチと同じアップロード形式で書き込みますが、どのウォッチにもないチャンネルが1つ加わります。**ジャイロスコープ**です。この追加チャンネルこそが、ほかのすべてを可能にします — ジャイロスコープは回転を直接測るので、測った加速度のどこまでが重力でどこからが動きなのかを推測する必要がありません。3つの生データから、3つの角度と1つの距離を導き出します。",
    "li": [
      "**ピッチ（pitch）** — ノーズの上下。これこそが*ポンプの動きそのもの*で、ほかはすべて二の次です。",
      "**ロール（roll）** — ボードの左右の傾き。カービングや、ポンプの合間の小さな修正です。",
      "**ヨー（yaw）** — 向きの変化。GPSの軌跡と照合します。どちらも同じものを測っているので、一致しなければなりません。",
      "**上下動（heave）** — ボードが実際にどれだけ上下するか。垂直方向の加速度を2回積分して、センチメートル単位で求めます。"
    ],
    "cap": "1本のラン、28秒。ピッチの波形がポンピングで、その下の上下動は同じリズムをセンチメートルで表したものです。",
    "capTiles": "サイトに表示されるのと同じ3つの角度を、コースに沿ってリアルタイムで。"
  },
  "mount": {
    "h": "誰も教えてくれなかった問題：スマホはどの向きに貼られているのか",
    "p": "スマホは、自分がボードにどう貼られているかを知りません。縦に貼ればピッチはピッチです。横に貼れば、スマホがピッチだと思っているものは、実はボードのロールです。斜めに貼ると — まさに最初の本番セッションで起きたことですが — 純粋なピッチの振動が**ピッチ71%、ロール71%が同時に**起きているように見えます。ライダーに向きを入力してもらう方法は、誰かが冷えた指で濡れたスマホを貼り直すまでしか通用しません。",
    "p2": "そこで、データに答えさせることにしました。ポンピングはボードの横軸まわりの回転で、ジャイロスコープは回転を直接測ります。測定した信号を、取り付け角度の候補すべてについて計算上で回転させ、ポンプ帯域（0.6～2.5 Hz）のピッチ振動が最も強くなる向きを探します — その向きが横軸です。下の図は、2つのセッションでこの探索を行った結果です。1台はボードに横向きに、もう1台は斜めに貼ってありました。2つのセッションで2つのきれいなピーク、誰も何も入力していません。この探索で決められないのは、ノーズが前向きか後ろ向きかです。同じ軸だからです。これはランの最初の1秒で決まります。ランは必ずノーズが下がるところから始まるからです。",
    "cap": "想定した取り付け角度ごとの、ポンプ帯域のピッチエネルギー。ピークが答えです。"
  },
  "heave": {
    "h": "上下動と、その数字に但し書きが必要な理由",
    "p": "ポンピング中、ボードは実際にどれだけ上下しているのでしょうか。加速度を2回積分すればセンチメートル単位の答えが出ますが、これはいかにも確かそうに見えて、実はもろい種類の数字です。残す帯域より遅い成分はすべて、周期の2乗で増幅されます — 低い側のわずかなドリフトが、何メートルもの架空の上下動になってしまうのです。",
    "p2": "その下限を決めるのがならし窓で、これは自由に選べるパラメータではありません。同じランを1秒の窓で計算すると18 cm、5秒の窓なら33 cm — まったく同じセッションなのに、です。そこで私たちは、窓をそのランの**実測ケイデンス**から決めています — ここでは1.38 Hzなので1.45秒です。そして動きがこの下限に近すぎるときは、その数字を信頼できないものとして表示します。このグラフの正直な読み方は*上下動は20 cm*ではなく、*上下動をポンピングの速さの動きと定義するなら、上下動は20 cm*です。",
    "cap": "同じラン、同じデータ、6通りのならし窓：18 cmから33 cmまで。"
  },
  "rules": {
    "h": "計測からカウントへ：ポンプ、グライド、着水",
    "p": "ボードが自分の動きを報告するようになれば、ボード上のカウントに手首のカウンターはもう必要ありません。**2026年10月10日**から、ボードにスマホを付けたすべての記録は、誰でも確認できる4つの単純なルールでカウントされています。",
    "li": [
      "**ポンプとは、エネルギーを注ぎ込む動きです。** ポンプ帯域（0.5～3 Hz）でのボードの上下1回が1サイクルです。それがポンプとして数えられるのは、ノーズが上下動と同期してピッチするときだけです — 技術的には、サイクル全体での速いピッチと上下動速度の積の平均が、そのランの中央値の30%を超える場合です。最後のポンプの後に減衰していく揺れや小さなバランス修正もボードを動かしますが、エネルギーは注ぎ込みません。",
      "**ランは着水で終わります。** 着水とは、ランの最後の15秒の中で max(8 km/h, ランの巡航速度の60%) を下回る最初のきれいなGPS点から、GPS速度の遅れの分として0.7 sを引いた時点です。着水はランを短くすることはあっても、長くすることはありません。",
      "**グライドとは、ポンプせずに飛ぶことです。** ポンプのない1.5～15秒の区間をグライドとして数えます — セッションマップがグライドを表示するのにすでに使っていたのと同じルールです。最初のポンプ前の助走は数えず、ランの終わりは数え、動きのデータが欠けた区間はまったく数えません。",
      "**判断するには短すぎるものは、そのままです。** サイクルが5つ未満のランには意味のある中央値がないため、手首のカウンターの値をそのまま使います。"
    ],
    "p2": "その日に手元にあった6人のライダーの20件のボード記録で、ルールは手首のカウンターより**14%少ないポンプ**を数え、グライドは**フォイル時間の約8%**を占めました。実際のグライドの大半は2～6秒です。最長は11.9 sで、ランの合間にスマホの向きが変わってしまったセッションでのものでした — ルールはスマホがしっかり固定されていることを前提としており、ずれるスマホは実際には起きていないグライドを生み出します。古い値は新しい値と並べて保存してあるので、すべての変更を後からたどれます。"
  },
  "found": {
    "h": "4回のセッションから、すでに分かったこと",
    "p": "データはまだわずか — ボード記録4件 — なので、これは法則ではなく観察です。それでも、ライダーではなくボードそのものを表す、私たちにとって初めての数字です。",
    "li": [
      "**取り付けの向きは自動で見つかり、しかも安定しています。** 同じセッションの2本のランで、検出された角度の差は3°でした。これは計算上のノイズで、スマホが動いたわけではありません。セッション間では、テープの貼り方が違った分だけ、ちょうどその分だけ変わりました。",
      "**ケイデンスは驚くほど一定です。** 同じセッションの2本のランで1.38 Hzと1.39 Hz、別のセッションで1.45 Hz。ポンピングは力仕事というより、誰かが見つけた共振のように見えます。",
      "**上下動は約20 cm**（このケイデンスで、一番下から一番上まで。上で述べた但し書き付き）。",
      "**ピッチは約±19°、ロールは約±10°**（きれいなランの場合）— ボードはロールよりはるかに大きくピッチしています。検出の考え方全体がこれを前提にしていましたが、実際に確かめたことは一度もありませんでした。"
    ]
  },
  "limits": {
    "h": "これでまだ証明されていないこと",
    "p": "私たちが主張できないことのリストは、主張できることのリストより長く、データが増えるまではそのままであるべきです。",
    "li": [
      "**4回のセッション、1人のライダー、1枚のボード、1つの湖。** ここにあるものは、複数のライダーではまだ何も検証されていません。また、私たちのポンプカウントはいまだに1人だけで較正されています — その土台がどれほど薄いかは[パート3](/nerd-analysen-3)をご覧ください。",
      "**グライド時間を測れるのはボード上だけです。** 手首では、最長グライドとして表示している数字は今も2つの*検出された*ポンプの間の最長の間隔であり、同じものではありません。",
      "**ボードにスマホを貼って乗る人はいません。** これは計測器であって、機能ではありません。その役割は、あなたの手首のウォッチを測るための基準となる真実を作り出すことです。"
    ]
  },
  "videorun": {
    "h": "セッションの様子",
    "p": "この装備の解説動画、湖で撮影：ボードに何を載せ、どう固定し、何が得られるのか。",
    "cap": "ボード上のスマホ：GPS、ジャイロスコープ、加速度を直接計測。"
  },
  "next": {
    "h": "この先へ",
    "p": "計測器は、何かに向けてこそ意味があります。ボードのデータによって、私たちはこれまで推定するしかなかった2つの問いに、初めて基準となる答えを得ました。**この動きはポンプなのか**、そして**ボードはいつ飛ぶのをやめたのか**。どちらも現在は手首でカウントされ、1人だけで較正されています。そのカウントの仕組みは[パート2](/nerd-analysen-2)で、2つ目のセンサーと比べてどれほど持ちこたえるかは[パート3](/nerd-analysen-3)で紹介しています。"
  }
};


const nb: N4 = {
  "back": "← Del 3: Dobbelt-klokke-målingen",
  "h1": "Del 4: En mobil tapet på brettet",
  "subtitle": "Hva vi kan måle når sensoren ikke lenger sitter på et håndledd",
  "intro": "Hvert eneste tall denne siden viser om pumping, kommer til syvende og sist fra en sensor festet på armen til noen. Og den armen gjør som den vil: Den svinger, den spenner seg, den strekker seg ut for å holde balansen. Gjennom tre deler av denne serien har vi jobbet oss rundt det. I september 2026 sluttet vi med det og **tapet en mobil på brettet** — GPS, akselerometer og gyroskop, 50 målinger i sekundet, fast forbundet med det vi faktisk vil vite noe om. Denne delen handler om hva det ga.",
  "why": {
    "h": "Hva håndleddet kan gi, og hva det ikke kan",
    "p": "Den første overraskelsen var en negativ en, og den fortjener å sies rett ut, for vi ventet det motsatte. Vi la brettopptaket ved siden av opptaket fra **en Garmin på håndleddet fra samme økt, to minutter forskjøvet**, og sammenlignet hva hver sensor ser i frekvensdomenet. Hvis håndleddet var håpløst, ville pumperytmen vært en utflytende kul der og en skarp topp på brettet.",
    "p2": "Det er en skarp topp på **begge**. Samme topp, samme 1,40 Hz, samme høyde. Håndleddet finner pumpekadensen helt fint — og det er nettopp derfor pumpetelleren vår i det hele tatt fungerer: På denne økten telte brettopptaket **103 pumper** og klokka **106**, bare tre i forskjell. Brettet trengs altså ikke for å høre rytmen. Det det gir, er noe håndleddet aldri kan gi: **stillingen til selve brettet** — hvor langt nesen dykker, hvor langt brettet krenger, hvor langt det hele hever og senker seg. En arm kan ikke fortelle det, uansett hvor god sensoren på den er.",
    "cap": "Samme økt, to sensorer, 20 sekunder av det lengste runnet fra hver. Begge ser 1,40 Hz."
  },
  "setup": {
    "h": "Riggen, om man kan kalle den det",
    "p": "Det finnes ingen holder, intet deksel, ingen brakett. Mobilen går i en drybag, drybagen under en stropp på tvers av dekket, og stroppen strammes så hardt at mobilen ikke kan forskyve seg mens brettet blir kastet rundt. Totalkostnad: én stropp. Hele poenget er at hvem som helst skal kunne gjøre dette en vanlig tirsdagskveld, for dataene er bare verdt noe hvis de kan samles inn mer enn én gang.",
    "capDeck": "Hele oppsettet: drybag under en stropp, på tvers av dekket, foran masten.",
    "capRail": "Stroppet fast og sjekket før runnet — en mobil som flytter seg underveis, ødelegger opptaket."
  },
  "what": {
    "h": "Hva en mobil på brettet registrerer",
    "p": "Mobilen skriver det samme opplastingsformatet som alle klokkene vi støtter, pluss én kanal som ingen av klokkene har: **gyroskopet**. Det er denne ekstra kanalen som gjør resten mulig — et gyroskop måler rotasjon direkte, uten å måtte gjette hvilken del av en målt akselerasjon som var tyngdekraft og hvilken som var bevegelse. Fra de tre rå datastrømmene utleder vi tre vinkler og én avstand:",
    "li": [
      "**Stamping (pitch)** — nesen som går opp og ned. Dette *er* pumpebevegelsen; alt annet er sekundært.",
      "**Rulling (roll)** — brettet som krenger mot venstre og høyre. Carving, og de små korreksjonene mellom pumpene.",
      "**Gir (yaw)** — kursendringen. Kontrollert mot GPS-sporet, fordi begge måler det samme og må stemme overens.",
      "**Hiv (heave)** — hvor langt brettet faktisk hever og senker seg, i centimeter, ved å integrere den vertikale akselerasjonen to ganger."
    ],
    "cap": "Ett run, 28 sekunder. Stampingskurven er pumpingen; hivet under er den samme rytmen, i centimeter.",
    "capTiles": "De samme tre vinklene slik siden viser dem, live langs sporet."
  },
  "mount": {
    "h": "Problemet ingen advarte oss om: Hvilken vei er mobilen tapet?",
    "p": "En mobil aner ikke hvordan den sitter på et brett. Tape den på langs, så er stamping stamping. Tape den på tvers, så er det mobilen kaller stamping egentlig brettet som ruller. Tape den på skrå — som skjedde aller første gang vi var ute på ordentlig — så dukker en ren stampingssvingning opp som **71 % stamping og 71 % rulling samtidig**. Å be foileren oppgi retningen fungerer helt til noen taper fast en våt mobil på nytt med iskalde fingre.",
    "p2": "Så vi lar dataene svare. Pumping er en rotasjon om brettets tverrakse, og et gyroskop måler rotasjon direkte. Man roterer det målte signalet gjennom alle mulige monteringsvinkler og ser hvor stampingssvingningen i pumpebåndet (0,6–2,5 Hz) er sterkest — den retningen er tverraksen. Bildet under viser dette søket for to økter: én mobil tapet på tvers av brettet, én på skrå. To økter, to rene topper, uten at noen trengte å oppgi noe. Det søket ikke kan avgjøre, er nese forover eller nese bakover, fordi det er samme akse; det avgjør det første sekundet av runnet, siden et run alltid starter med at nesen dykker.",
    "cap": "Stampingsenergi i pumpebåndet mot antatt monteringsvinkel. Toppen er svaret."
  },
  "heave": {
    "h": "Hivet, og hvorfor tallet trenger et forbehold",
    "p": "Hvor langt beveger et brett seg egentlig opp og ned mens du pumper? Å integrere akselerasjonen to ganger gir et svar i centimeter, og det er akkurat den typen tall som ser autoritativt ut, men i det stille er skjørt. Alt som er langsommere enn båndet man beholder, forsterkes med kvadratet av sin periode — en liten drift i den nedre enden blir til meter med innbilt hiv.",
    "p2": "Utjevningsvinduet bestemmer denne nedre grensen, og det er ikke en fri parameter. Regn ut det samme runnet med et vindu på 1 sekund, og du får 18 cm; med 5 sekunder får du 33 cm — for nøyaktig den samme økten. Derfor utleder vi vinduet fra den **målte kadensen** i runnet — her 1,38 Hz, altså 1,45 sekunder — og merker tallet som upålitelig når bevegelsen ligger for nær grensen. Den ærlige lesningen av dette diagrammet er ikke *hivet er 20 cm*, men *hivet er 20 cm hvis man definerer hiv som bevegelsen i pumpetakt*.",
    "cap": "Det samme runnet, de samme dataene, seks ulike utjevningsvinduer: 18 cm til 33 cm."
  },
  "rules": {
    "h": "Fra måling til telling: pumper, glid og landing",
    "p": "Så snart brettet rapporterer sin egen bevegelse, trenger tellingen på brettet ikke lenger håndleddstelleren. Siden **10. oktober 2026** telles hvert opptak med mobil på brettet etter fire enkle regler som alle kan etterprøve:",
    "li": [
      "**En pumpe er en bevegelse som tilfører energi.** Hvert opp og ned av brettet i pumpebåndet (0,5–3 Hz) er én syklus. Den teller som pumpe bare hvis nesen stamper i takt med den vertikale bevegelsen — teknisk: hvis gjennomsnittet av produktet av rask stamping og hivhastighet over syklusen overstiger 30 % av medianen for det runnet. Utdøende svingninger etter siste pumpe og små balansekorreksjoner beveger også brettet, men tilfører ingen energi.",
      "**Runnet slutter ved landing.** Det er det første rene GPS-punktet i de siste 15 sekundene av et run under max(8 km/h, 60 % av runnets marsjfart), minus 0,7 s for forsinkelsen i GPS-hastigheten. Landingen kan bare forkorte et run, aldri forlenge det.",
      "**Glid er flyging uten pumping.** Strekk uten pumpe på 1,5 til 15 sekunder teller som glid — samme regel som øktkartet allerede brukte for å vise glid. Tilløpet før første pumpe teller ikke, slutten av runnet gjør det, og et strekk med manglende bevegelsesdata teller ikke i det hele tatt.",
      "**Det som er for kort til å vurderes, blir som før.** Et run med færre enn fem sykluser har ingen meningsfull median og beholder derfor tallet fra håndleddstelleren."
    ],
    "p2": "Over de 20 brettopptakene fra seks foilere som vi hadde den dagen, teller reglene **14 % færre pumper** enn håndleddstelleren, og glid utgjør **omtrent 8 % av foiletiden**. De fleste ekte glid varer 2 til 6 sekunder; det lengste var på 11,9 s, på en økt der mobilen hadde blitt vridd mellom to runs — reglene forutsetter en fast montert mobil, og en mobil som forskyver seg, gir glid som aldri skjedde. De gamle verdiene blir lagret ved siden av de nye, slik at hver endring kan spores."
  },
  "found": {
    "h": "Hva fire økter allerede har fortalt oss",
    "p": "Dette er en liten haug med data — fire brettopptak — så det er observasjoner, ikke lover. Men det er de første tallene vi har som beskriver brettet i stedet for foileren.",
    "li": [
      "**Monteringen finnes automatisk, og den er stabil.** Over to runs i samme økt varierte den detekterte vinkelen med 3° — beregningsstøy, ikke en mobil som flyttet seg. Mellom øktene varierte den nøyaktig så mye som tapen gjorde.",
      "**Kadensen er bemerkelsesverdig jevn.** 1,38 og 1,39 Hz i to runs i samme økt; 1,45 Hz på en annen. Pumping ser mindre ut som anstrengelse og mer som en resonans noen har funnet.",
      "**Hivet ligger rundt 20 cm** ved den kadensen, målt fra bunn til topp, med forbeholdet over.",
      "**Stampingen svinger omtrent ±19°, rullingen omtrent ±10°** i et rent run — brettet stamper altså langt mer enn det ruller. Det er nettopp dette hele deteksjonsmetoden forutsetter, og ingen hadde noen gang faktisk sjekket det."
    ]
  },
  "limits": {
    "h": "Hva dette ennå ikke beviser",
    "p": "Listen over det vi ikke kan påstå, er lengre enn listen over det vi kan påstå, og slik skal det være til vi har mer data:",
    "li": [
      "**Fire økter, én foiler, ett brett, én innsjø.** Ingenting her er validert på andre foilere, og pumpetellingen vår er fortsatt kalibrert på én enkelt person — se [Del 3](/nerd-analysen-3) for hvor tynt det grunnlaget er.",
      "**Glidetid måles bare på brettet.** På håndleddet er tallet vi viser som lengste glid fortsatt det lengste mellomrommet mellom to *gjenkjente* pumper, og det er ikke det samme.",
      "**Ingen foiler med en mobil tapet på brettet.** Dette er et måleinstrument, ikke en funksjon. Jobben dets er å levere fasiten som klokka på håndleddet ditt måles mot."
    ]
  },
  "videorun": {
    "h": "Selve økten",
    "p": "Forklaringsvideoen for dette oppsettet, filmet ved innsjøen: hva som kommer på brettet, hvordan det festes, og hva man får ut av det.",
    "cap": "Mobil på brettet: GPS, gyroskop og akselerasjon, målt direkte."
  },
  "next": {
    "h": "Hvor dette leder",
    "p": "Et måleinstrument er til for å rettes mot noe. Brettdataene gir oss for første gang en fasit for to spørsmål vi hittil bare har kunnet anslå: **er denne bevegelsen en pumpe**, og **når sluttet brettet å fly**. Begge telles i dag på håndleddet og er kalibrert på én person. Hvordan den tellingen fungerer, står i [Del 2](/nerd-analysen-2); hvor godt den holder mot en annen sensor, i [Del 3](/nerd-analysen-3)."
  }
};


const nl: N4 = {
  "back": "← Deel 3: De dubbel-horloge-meting",
  "h1": "Deel 4: Een telefoon op de board geplakt",
  "subtitle": "Wat we kunnen meten zodra de sensor niet meer op een pols meerijdt",
  "intro": "Elk getal dat deze site over pumpen laat zien, komt uiteindelijk van een sensor die aan iemands arm vastzit. En die arm doet zijn eigen ding: hij zwaait, hij spant zich aan, hij reikt naar buiten om in balans te blijven. Drie delen van deze serie lang hebben we daaromheen gewerkt. In september 2026 zijn we daarmee gestopt en hebben we **een telefoon op de board geplakt** — GPS, versnellingsmeter en gyroscoop, 50 metingen per seconde, vast verbonden met het ding waar we eigenlijk iets over willen weten. Dit deel laat zien wat dat heeft opgeleverd.",
  "why": {
    "h": "Wat de pols wel en niet kan leveren",
    "p": "De eerste verrassing was een negatieve, en die verdient het om helder te worden uitgesproken, want we verwachtten het omgekeerde. We legden de boardopname naast die van een **Garmin om de pols tijdens dezelfde sessie, twee minuten verschoven**, en vergeleken wat elke sensor in het frequentiedomein ziet. Als de pols hopeloos was, zou het pumpritme daar een vage bult zijn en op de board een scherpe piek.",
    "p2": "Het is een scherpe piek op **allebei**. Dezelfde piek, dezelfde 1,40 Hz, dezelfde hoogte. De pols vindt de pumpcadans prima — en precies daarom werkt onze pumpteller überhaupt: in deze sessie telde de boardopname **103 pumps** en het horloge **106**, slechts drie verschil. De board is dus niet nodig om het ritme te horen. Wat hij wel levert, kan de pols nooit leveren: **de stand van de board zelf** — hoe ver de neus duikt, hoe ver de board opzij helt, hoe ver het geheel op en neer gaat. Een arm kan dat niet doorgeven, hoe goed de sensor eraan ook is.",
    "cap": "Dezelfde sessie, twee sensoren, telkens 20 seconden uit de langste run. Beide zien 1,40 Hz."
  },
  "what": {
    "h": "Wat een telefoon op de board vastlegt",
    "p": "De telefoon schrijft hetzelfde uploadformaat als elk horloge dat we ondersteunen, plus één kanaal dat geen enkel horloge heeft: **de gyroscoop**. Dat extra kanaal maakt al het andere mogelijk — een gyroscoop meet rotatie rechtstreeks, zonder te hoeven raden welk deel van een gemeten versnelling zwaartekracht was en welk deel beweging. Uit de drie ruwe datastromen leiden we drie hoeken en één afstand af:",
    "li": [
      "**Stampen (pitch)** — de neus die omhoog en omlaag gaat. Dit *is* de pumpbeweging; al het andere is bijzaak.",
      "**Rollen (roll)** — de board die naar links en rechts helt. Carven, en de kleine correcties tussen de pumps.",
      "**Gieren (yaw)** — de koersverandering. Gecontroleerd aan de hand van het GPS-spoor, omdat beide hetzelfde meten en moeten kloppen.",
      "**Dompen (heave)** — hoe ver de board echt omhoog en omlaag gaat, in centimeters, door de verticale versnelling twee keer te integreren."
    ],
    "cap": "Eén run, 28 seconden. De stampcurve is het pumpen; het dompen eronder is hetzelfde ritme, in centimeters.",
    "capTiles": "Dezelfde drie hoeken zoals de site ze toont, live langs de route."
  },
  "mount": {
    "h": "Het probleem waar niemand ons voor waarschuwde: hoe zit de telefoon erop geplakt?",
    "p": "Een telefoon heeft geen idee hoe hij op een board geplakt zit. Plak hem in de lengte, en stampen is stampen. Plak hem dwars, en wat de telefoon stampen noemt, is in werkelijkheid het rollen van de board. Plak hem schuin — wat er gebeurde bij de allereerste echte sessie — en een zuivere stampbeweging verschijnt als **71 % stampen en 71 % rollen tegelijk**. De rider vragen om het op te geven werkt precies tot iemand met koude vingers een natte telefoon opnieuw vastplakt.",
    "p2": "Dus laten we de data antwoorden. Pumpen is een rotatie om de dwarsas van de board, en een gyroscoop meet rotatie rechtstreeks. Je draait het gemeten signaal rekenkundig door elke mogelijke montagehoek en kijkt waar de stampbeweging in de pumpband (0,6–2,5 Hz) het sterkst is — die richting is de dwarsas. De afbeelding hieronder toont die zoektocht voor twee sessies: één telefoon dwars op de board geplakt, één schuin. Twee sessies, twee schone pieken, zonder dat iemand iets hoefde op te geven. Wat deze zoektocht niet kan beslissen, is neus naar voren of neus naar achteren, omdat dat dezelfde as is; dat beslist de eerste seconde van de run, want een run begint altijd met de neus die omlaag duikt.",
    "cap": "Stampenergie in de pumpband tegen de aangenomen montagehoek. De piek is het antwoord."
  },
  "heave": {
    "h": "Dompen, en waarom het getal een kanttekening nodig heeft",
    "p": "Hoe ver gaat een board echt op en neer terwijl je pumpt? De versnelling twee keer integreren geeft een antwoord in centimeters, en dat is precies het soort getal dat betrouwbaar oogt en stiekem broos is. Alles wat trager is dan de band die je overhoudt, wordt versterkt met het kwadraat van zijn periode — een kleine drift aan de onderkant wordt meters denkbeeldig dompen.",
    "p2": "Het nivelleervenster bepaalt die ondergrens, en het is geen vrij te kiezen parameter. Reken dezelfde run door met een venster van 1 seconde en je krijgt 18 cm; met 5 seconden krijg je 33 cm — voor exact dezelfde sessie. Daarom leiden we het venster af van de **gemeten cadans** van die run — hier 1,38 Hz, dus 1,45 seconden — en markeren we het getal als onbetrouwbaar zodra de beweging te dicht bij die grens ligt. Eerlijk gelezen zegt deze grafiek niet *het dompen is 20 cm*, maar *het dompen is 20 cm als je dompen definieert als de beweging op pumptempo*.",
    "cap": "Dezelfde run, dezelfde data, zes verschillende nivelleervensters: 18 cm tot 33 cm."
  },
  "rules": {
    "h": "Van meten naar tellen: pumps, glides en neerkomen",
    "p": "Zodra de board zijn eigen beweging doorgeeft, heeft het tellen op de board de polsteller niet meer nodig. Sinds **10 oktober 2026** wordt elke opname met de telefoon op de board geteld volgens vier eenvoudige regels die iedereen kan nagaan:",
    "li": [
      "**Een pump is een beweging die energie toevoegt.** Elk op en neer van de board in de pumpband (0,5–3 Hz) is één cyclus. Die telt alleen als pump als de neus in de maat van de verticale beweging knikt — technisch: als het gemiddelde product van snel stampen en dompsnelheid over de cyclus meer is dan 30 % van de mediaan van die run. Uitdovende schommelingen na de laatste pump en kleine balanscorrecties bewegen de board ook, maar voegen geen energie toe.",
      "**De run eindigt bij het neerkomen.** Dat is het eerste schone GPS-punt in de laatste 15 seconden van een run onder max(8 km/h, 60 % van de kruissnelheid van de run), min 0,7 s voor de vertraging van de GPS-snelheid. Het neerkomen kan een run alleen inkorten, nooit verlengen.",
      "**Gliden is vliegen zonder pumpen.** Stukken zonder pump van 1,5 tot 15 seconden tellen als glide — dezelfde regel waarmee de sessiekaart glijfases al liet zien. De aanloop voor de eerste pump telt niet, het einde van de run wel, en een stuk met ontbrekende bewegingsdata telt helemaal niet.",
      "**Wat te kort is om te beoordelen, blijft zoals het was.** Een run met minder dan vijf cycli heeft geen zinvolle mediaan en houdt daarom de telling van de polsteller."
    ],
    "p2": "Over de 20 boardopnames van zes riders die we die dag hadden, tellen de regels **14 % minder pumps** dan de polsteller, en glides maken **ongeveer 8 % van de foiltijd** uit. De meeste echte glides duren 2 tot 6 seconden; de langste duurde 11,9 s, in een sessie waarin de telefoon tussen twee runs was verdraaid — de regels gaan uit van een stevig vastzittende telefoon, en een telefoon die verschuift, levert glides op die nooit hebben plaatsgevonden. De oude waarden blijven naast de nieuwe bewaard, zodat elke wijziging terug te volgen is."
  },
  "found": {
    "h": "Wat vier sessies ons al hebben verteld",
    "p": "Dit is een klein stapeltje data — vier boardopnames — dus het gaat om waarnemingen, niet om wetten. Het zijn wel de eerste getallen die we hebben die de board beschrijven in plaats van de rider.",
    "li": [
      "**De montagerichting wordt automatisch gevonden, en die is stabiel.** Over twee runs van één sessie varieerde de gedetecteerde hoek met 3° — rekenruis, geen telefoon die verschoof. Tussen de sessies varieerde hij precies zoveel als de tape anders zat.",
      "**De cadans is opvallend constant.** 1,38 en 1,39 Hz in twee runs van één sessie; 1,45 Hz in een andere. Pumpen lijkt minder op inspanning en meer op een resonantie die iemand heeft gevonden.",
      "**Het dompen ligt rond 20 cm** bij die cadans, gemeten van laagste tot hoogste punt, met de kanttekening van hierboven.",
      "**Het stampen schommelt ongeveer ±19°, het rollen ongeveer ±10°** in een schone run — de board stampt dus veel meer dan hij rolt. Precies dat neemt de hele detectieaanpak aan, en niemand had het ooit echt gecontroleerd."
    ]
  },
  "limits": {
    "h": "Wat dit nog niet bewijst",
    "p": "De lijst van wat we niet kunnen beweren is langer dan de lijst van wat we wel kunnen beweren, en zo moet het blijven tot er meer data is:",
    "li": [
      "**Vier sessies, één rider, één board, één meer.** Niets hiervan is gevalideerd over meerdere riders, en onze pumptelling is nog steeds afgesteld op één enkele persoon — zie [Deel 3](/nerd-analysen-3) voor hoe dun die basis is.",
      "**Glijtijd wordt alleen op de board gemeten.** Op de pols is het getal dat we als langste glijfase tonen nog steeds het langste gat tussen twee *gedetecteerde* pumps, en dat is niet hetzelfde.",
      "**Niemand foilt met een telefoon op zijn board geplakt.** Dit is een meetinstrument, geen functie. Het moet de waarheid leveren waaraan het horloge om je pols wordt afgemeten."
    ]
  },
  "videorun": {
    "h": "De sessie zelf",
    "p": "De uitlegvideo bij deze opstelling, gefilmd bij het meer: wat er op de board gaat, hoe het wordt vastgezet en wat het oplevert.",
    "cap": "Telefoon op de board: GPS, gyroscoop en versnelling, rechtstreeks gemeten."
  },
  "next": {
    "h": "Waar dit naartoe gaat",
    "p": "Een meetinstrument is er om ergens op gericht te worden. De boarddata geven ons voor het eerst een referentie voor twee vragen die we tot nu toe alleen hebben geschat: **is deze beweging een pump**, en **wanneer hield de board op met vliegen**. Beide worden vandaag op de pols geteld en zijn afgesteld op één persoon. Hoe die telling werkt, staat in [Deel 2](/nerd-analysen-2); hoe goed ze standhoudt tegenover een tweede sensor, in [Deel 3](/nerd-analysen-3)."
  },
  "setup": {
    "h": "De opstelling, als je het zo mag noemen",
    "p": "Er is geen houder, geen behuizing, geen beugel. De telefoon gaat in een drybag, de drybag onder een spanband dwars over het deck, en de spanband wordt zo strak aangetrokken dat de telefoon niet kan verschuiven terwijl de board alle kanten op wordt gegooid. Totale kosten: één spanband. Het hele idee is dat iedereen dit op een gewone dinsdagavond moet kunnen nadoen, want de data zijn alleen iets waard als je ze meer dan één keer kunt verzamelen.",
    "capDeck": "De hele opstelling: drybag onder een spanband, dwars over het deck, voor de mast.",
    "capRail": "Vastgesjord en gecontroleerd voor de run — een telefoon die halverwege de sessie verschuift, verpest de opname."
  }
};


const ptPT: N4 = {
  "back": "← Parte 3: A medição com dois relógios",
  "h1": "Parte 4: Um telemóvel colado à prancha",
  "subtitle": "O que conseguimos medir quando o sensor deixa de andar no pulso",
  "intro": "Cada número sobre pumping que este site mostra vem, no fim de contas, de um sensor preso ao braço de alguém. E esse braço faz o que lhe apetece: balança, fica rígido, estica-se à procura de equilíbrio. Ao longo de três partes desta série, contornámos esse problema. Em setembro de 2026 deixámos de o contornar e **colámos um telemóvel à prancha** — GPS, acelerómetro e giroscópio, 50 amostras por segundo, fixo àquilo que realmente queremos conhecer. Esta parte conta o que daí resultou.",
  "why": {
    "h": "O que o pulso consegue dar e o que não consegue",
    "p": "A primeira surpresa foi negativa, e vale a pena dizê-lo com todas as letras, porque esperávamos o contrário. Pusemos a gravação da prancha ao lado da de um **Garmin no pulso durante a mesma sessão, com dois minutos de diferença**, e comparámos o que cada sensor vê no domínio da frequência. Se o pulso fosse um caso perdido, o ritmo do pumping apareceria aí como uma mancha difusa e, na prancha, como um pico nítido.",
    "p2": "É um pico nítido em **ambos**. O mesmo pico, os mesmos 1,40 Hz, a mesma altura. O pulso encontra a cadência do pumping sem qualquer problema — e é precisamente por isso que o nosso contador de pumps funciona: nesta sessão, a gravação da prancha contou **103 pumps** e o relógio **106**, apenas três de diferença. Portanto, a prancha não é necessária para ouvir o ritmo. O que ela dá é algo que o pulso nunca poderá dar: **a atitude da própria prancha** — quanto o bico mergulha, quanto a prancha se inclina para o lado, quanto o conjunto sobe e desce. Um braço não consegue dizer isso, por melhor que seja o sensor que lá está.",
    "cap": "Mesma sessão, dois sensores, 20 segundos da volta mais longa em cada um. Ambos veem 1,40 Hz."
  },
  "setup": {
    "h": "O equipamento, se é que se lhe pode chamar assim",
    "p": "Não há suporte, nem capa, nem braçadeira. O telemóvel vai num saco estanque, o saco vai debaixo de uma cinta que atravessa o deck, e a cinta é apertada o suficiente para o telemóvel não sair do sítio enquanto a prancha é sacudida para todos os lados. Custo total: uma cinta. A ideia é que qualquer pessoa o consiga repetir numa terça-feira à noite, porque os dados só valem alguma coisa se puderem ser recolhidos mais do que uma vez.",
    "capDeck": "Todo o equipamento: saco estanque debaixo de uma cinta, a atravessar o deck, à frente do mastro.",
    "capRail": "Bem preso e verificado antes da volta — um telemóvel que se mexe a meio da sessão estraga a gravação."
  },
  "what": {
    "h": "O que um telemóvel na prancha regista",
    "p": "O telemóvel grava no mesmo formato de envio de todos os relógios que suportamos, mais um canal que nenhum relógio tem: **o giroscópio**. É esse canal extra que torna todo o resto possível — um giroscópio mede a rotação diretamente, sem ter de adivinhar que parte de uma aceleração medida era gravidade e que parte era movimento. Dos três fluxos em bruto, obtemos três ângulos e uma distância:",
    "li": [
      "**Arfagem (pitch)** — o bico a subir e a descer. Isto *é* o movimento do pump; tudo o resto é secundário.",
      "**Rolamento (roll)** — a prancha a inclinar-se para a esquerda e para a direita. O carving e as pequenas correções entre pumps.",
      "**Guinada (yaw)** — a mudança de rumo. Confrontada com o traçado GPS, porque ambos medem a mesma coisa e têm de coincidir.",
      "**Elevação (heave)** — quanto a prancha sobe e desce realmente, em centímetros, integrando duas vezes a aceleração vertical."
    ],
    "cap": "Uma volta, 28 segundos. A curva de arfagem é o pumping; a elevação por baixo é o mesmo ritmo, em centímetros.",
    "capTiles": "Os mesmos três ângulos tal como o site os mostra, em direto ao longo do percurso."
  },
  "mount": {
    "h": "O problema de que ninguém nos avisou: para que lado está colado o telemóvel?",
    "p": "Um telemóvel não faz ideia de como está colado a uma prancha. Cola-o ao comprido e a arfagem é arfagem. Cola-o atravessado e aquilo a que o telemóvel chama arfagem é, na verdade, o rolamento da prancha. Cola-o na diagonal — o que aconteceu logo na primeiríssima sessão a sério — e uma arfagem pura aparece como **71 % de arfagem e 71 % de rolamento ao mesmo tempo**. Pedir ao rider que o indique funciona exatamente até alguém voltar a colar um telemóvel molhado com os dedos gelados.",
    "p2": "Por isso, deixamos os dados responder. O pumping é uma rotação em torno do eixo transversal da prancha, e um giroscópio mede a rotação diretamente. Roda-se o sinal medido, por cálculo, por todos os ângulos de montagem possíveis e procura-se onde a oscilação de arfagem na banda do pumping (0,6–2,5 Hz) é mais forte — essa direção é o eixo transversal. A imagem abaixo mostra esse varrimento para duas sessões: um telemóvel colado atravessado na prancha, outro na diagonal. Duas sessões, dois picos limpos, sem que ninguém tivesse de indicar nada. O que o varrimento não consegue decidir é se o bico aponta para a frente ou para trás, porque o eixo é o mesmo; isso resolve-o o primeiro segundo da volta, já que todas as voltas começam com o bico a descer.",
    "cap": "Energia de arfagem na banda do pumping em função do ângulo de montagem suposto. O pico é a resposta."
  },
  "heave": {
    "h": "A elevação, e porque é que o número precisa de uma ressalva",
    "p": "Quanto é que uma prancha sobe e desce realmente enquanto bombeias? Integrar a aceleração duas vezes dá uma resposta em centímetros, e é exatamente o tipo de número que parece fiável e, no fundo, é frágil. Tudo o que for mais lento do que a banda que se mantém é amplificado pelo quadrado do seu período — uma pequena deriva no extremo de baixo transforma-se em metros de elevação imaginária.",
    "p2": "A janela de nivelamento define esse limite inferior, e não é um parâmetro livre. Calcula a mesma volta com uma janela de 1 segundo e obténs 18 cm; com 5 segundos, obténs 33 cm — para exatamente a mesma sessão. Por isso derivamos a janela da **cadência medida** dessa volta — aqui 1,38 Hz, ou seja, 1,45 segundos — e assinalamos o número como pouco fiável sempre que o movimento fica demasiado perto desse limite. A leitura honesta deste gráfico não é *a elevação é de 20 cm*, mas sim *a elevação é de 20 cm se definirmos elevação como o movimento ao ritmo do pumping*.",
    "cap": "A mesma volta, os mesmos dados, seis janelas de nivelamento diferentes: de 18 cm a 33 cm."
  },
  "rules": {
    "h": "De medir a contar: pumps, planeio e toque na água",
    "p": "Assim que a prancha reporta o seu próprio movimento, a contagem na prancha deixa de precisar do contador do pulso. Desde **10 de outubro de 2026**, cada gravação com o telemóvel na prancha é contada por quatro regras simples que qualquer pessoa pode verificar:",
    "li": [
      "**Um pump é um movimento que introduz energia.** Cada subida e descida da prancha na banda do pumping (0,5–3 Hz) é um ciclo. Só conta como pump se o bico arfar ao ritmo do movimento vertical — tecnicamente, se o produto médio da arfagem rápida pela velocidade de elevação ao longo do ciclo ultrapassar 30 % da mediana dessa volta. As oscilações que se extinguem depois do último pump e as pequenas correções de equilíbrio também mexem a prancha, mas não introduzem energia.",
      "**A volta termina no toque na água.** É o primeiro ponto GPS limpo nos últimos 15 segundos de uma volta abaixo de max(8 km/h, 60 % da velocidade de cruzeiro da volta), menos 0,7 s pelo atraso da velocidade GPS. O toque na água só pode encurtar uma volta, nunca prolongá-la.",
      "**Planeio é voar sem bombear.** Troços sem pump de 1,5 a 15 segundos contam como planeio — a mesma regra com que o mapa da sessão já mostrava os planeios. O arranque antes do primeiro pump não conta, o fim da volta conta, e um troço com dados de movimento em falta não conta de todo.",
      "**O que é curto demais para avaliar fica como estava.** Uma volta com menos de cinco ciclos não tem uma mediana com sentido, por isso mantém a contagem do contador do pulso."
    ],
    "p2": "Nas 20 gravações de prancha de seis riders que tínhamos nesse dia, as regras contam **menos 14 % de pumps** do que o contador do pulso, e o planeio representa **cerca de 8 % do tempo de foil**. A maioria dos planeios reais dura 2 a 6 segundos; o mais longo foi de 11,9 s, numa sessão em que o telemóvel tinha sido rodado entre duas voltas — as regras pressupõem um telemóvel bem fixo, e um telemóvel que se desloca produz planeios que nunca aconteceram. Os valores antigos ficam guardados ao lado dos novos, para que cada alteração possa ser rastreada."
  },
  "found": {
    "h": "O que quatro sessões já nos disseram",
    "p": "É uma pequena pilha de dados — quatro gravações de prancha —, portanto são observações, não leis. Ainda assim, são os primeiros números que temos que descrevem a prancha e não o rider.",
    "li": [
      "**A orientação da montagem é encontrada automaticamente e é estável.** Em duas voltas da mesma sessão, o ângulo detetado variou 3° — ruído de cálculo, não um telemóvel a mexer-se. Entre sessões, variou exatamente tanto quanto a posição da fita-cola.",
      "**A cadência é notavelmente constante.** 1,38 e 1,39 Hz em duas voltas da mesma sessão; 1,45 Hz noutra. O pumping parece menos um esforço e mais uma ressonância que alguém encontrou.",
      "**A elevação ronda os 20 cm** nessa cadência, medida do ponto mais baixo ao mais alto, com a ressalva feita acima.",
      "**A arfagem oscila cerca de ±19° e o rolamento cerca de ±10°** numa volta limpa — a prancha arfa muito mais do que rola. É exatamente isso que todo o método de deteção pressupõe, e ninguém o tinha alguma vez verificado a sério."
    ]
  },
  "limits": {
    "h": "O que isto ainda não prova",
    "p": "A lista do que não podemos afirmar é mais longa do que a lista do que podemos, e deve continuar assim até termos mais dados:",
    "li": [
      "**Quatro sessões, um rider, uma prancha, um lago.** Nada disto está validado com outros riders, e a nossa contagem de pumps continua calibrada numa única pessoa — vê na [Parte 3](/nerd-analysen-3) como essa base é frágil.",
      "**O tempo de planeio só é medido na prancha.** No pulso, o número que mostramos como planeio mais longo continua a ser o maior intervalo entre dois pumps *detetados*, o que não é a mesma coisa.",
      "**Ninguém faz foil com um telemóvel colado à prancha.** Isto é um instrumento de medição, não uma funcionalidade. A sua função é produzir a referência com que se mede o relógio que tens no pulso."
    ]
  },
  "videorun": {
    "h": "A sessão propriamente dita",
    "p": "O vídeo explicativo deste equipamento, filmado no lago: o que vai na prancha, como é preso e o que se obtém.",
    "cap": "Telemóvel na prancha: GPS, giroscópio e aceleração, medidos diretamente."
  },
  "next": {
    "h": "Para onde isto vai",
    "p": "Um instrumento de medição existe para ser apontado a alguma coisa. Os dados da prancha dão-nos, pela primeira vez, uma referência fiável para duas perguntas que até agora só conseguíamos estimar: **este movimento é um pump**, e **quando é que a prancha deixou de voar**. Hoje, ambas são contadas no pulso e calibradas numa única pessoa. Como funciona essa contagem está na [Parte 2](/nerd-analysen-2); como se aguenta face a um segundo sensor, na [Parte 3](/nerd-analysen-3)."
  }
};


const pt: N4 = {
  "back": "← Parte 3: A medição dual-relógio",
  "h1": "Parte 4: Um celular preso à prancha com fita",
  "subtitle": "O que conseguimos medir quando o sensor deixa de ir no pulso",
  "intro": "Cada número sobre pumping que este site mostra vem, no fim das contas, de um sensor preso ao braço de alguém. E esse braço faz o que quer: balança, fica rígido, se estica para buscar equilíbrio. Durante três partes desta série, contornamos esse problema. Em setembro de 2026 paramos de contornar e **prendemos um celular na prancha com fita** — GPS, acelerômetro e giroscópio, 50 amostras por segundo, fixo naquilo que realmente queremos conhecer. Esta parte conta o que saiu disso.",
  "why": {
    "h": "O que o pulso consegue dar e o que não consegue",
    "p": "A primeira surpresa foi negativa, e vale dizer isso com todas as letras, porque esperávamos o contrário. Colocamos a gravação da prancha ao lado da de um **Garmin no pulso na mesma sessão, com dois minutos de diferença**, e comparamos o que cada sensor enxerga no domínio da frequência. Se o pulso fosse um caso perdido, o ritmo do pumping apareceria ali como uma mancha difusa e, na prancha, como um pico nítido.",
    "p2": "É um pico nítido nos **dois**. O mesmo pico, os mesmos 1,40 Hz, a mesma altura. O pulso encontra a cadência do pumping sem problema nenhum — e é justamente por isso que o nosso contador de pumps funciona: nesta sessão, a gravação da prancha contou **103 pumps** e o relógio **106**, só três de diferença. Ou seja, a prancha não é necessária para ouvir o ritmo. O que ela oferece é algo que o pulso nunca vai conseguir dar: **a atitude da própria prancha** — quanto o bico afunda, quanto a prancha se inclina para o lado, quanto o conjunto sobe e desce. Um braço não consegue informar isso, por melhor que seja o sensor nele.",
    "cap": "Mesma sessão, dois sensores, 20 segundos da volta mais longa em cada um. Os dois enxergam 1,40 Hz."
  },
  "what": {
    "h": "O que um celular na prancha registra",
    "p": "O celular grava no mesmo formato de upload de todos os relógios que suportamos, mais um canal que nenhum relógio tem: **o giroscópio**. É esse canal extra que torna todo o resto possível — um giroscópio mede rotação diretamente, sem precisar adivinhar que parte de uma aceleração medida era gravidade e que parte era movimento. Dos três fluxos brutos, extraímos três ângulos e uma distância:",
    "li": [
      "**Arfagem (pitch)** — o bico subindo e descendo. Isso *é* o movimento do pump; todo o resto é secundário.",
      "**Rolagem (roll)** — a prancha inclinando para a esquerda e para a direita. O carving e as pequenas correções entre um pump e outro.",
      "**Guinada (yaw)** — a mudança de direção. Conferida com o traçado do GPS, porque os dois medem a mesma coisa e precisam bater.",
      "**Elevação (heave)** — quanto a prancha realmente sobe e desce, em centímetros, integrando duas vezes a aceleração vertical."
    ],
    "cap": "Uma volta, 28 segundos. A curva de arfagem é o pumping; a elevação logo abaixo é o mesmo ritmo, em centímetros.",
    "capTiles": "Os mesmos três ângulos como o site os mostra, ao vivo ao longo do percurso."
  },
  "mount": {
    "h": "O problema que ninguém nos avisou: para que lado o celular está preso?",
    "p": "Um celular não faz ideia de como está preso a uma prancha. Prenda no sentido do comprimento e arfagem é arfagem. Prenda atravessado e o que o celular chama de arfagem é, na verdade, a rolagem da prancha. Prenda na diagonal — o que aconteceu logo na primeiríssima sessão de verdade — e uma arfagem pura aparece como **71 % de arfagem e 71 % de rolagem ao mesmo tempo**. Pedir ao rider que informe isso funciona exatamente até alguém prender de novo um celular molhado com os dedos congelados.",
    "p2": "Então deixamos os dados responderem. O pumping é uma rotação em torno do eixo transversal da prancha, e um giroscópio mede rotação diretamente. O sinal medido é girado matematicamente por todos os ângulos de montagem possíveis, procurando onde a oscilação de arfagem na faixa do pumping (0,6–2,5 Hz) é mais forte — essa direção é o eixo transversal. A imagem abaixo mostra essa varredura para duas sessões: um celular preso atravessado na prancha, outro na diagonal. Duas sessões, dois picos limpos, sem ninguém precisar informar nada. O que a varredura não consegue decidir é se o bico aponta para a frente ou para trás, porque o eixo é o mesmo; quem resolve é o primeiro segundo da volta, já que toda volta começa com o bico descendo.",
    "cap": "Energia de arfagem na faixa do pumping em função do ângulo de montagem suposto. O pico é a resposta."
  },
  "heave": {
    "h": "A elevação, e por que o número precisa de uma ressalva",
    "p": "Quanto uma prancha realmente sobe e desce enquanto você bombeia? Integrar a aceleração duas vezes dá uma resposta em centímetros, e é exatamente o tipo de número que parece confiável e, por baixo, é frágil. Tudo o que for mais lento que a faixa que você mantém é amplificado pelo quadrado do seu período — uma pequena deriva na ponta de baixo vira metros de elevação imaginária.",
    "p2": "A janela de nivelamento define esse limite inferior, e ela não é um parâmetro livre. Calcule a mesma volta com uma janela de 1 segundo e você obtém 18 cm; com 5 segundos, obtém 33 cm — para exatamente a mesma sessão. Por isso derivamos a janela da **cadência medida** daquela volta — aqui 1,38 Hz, ou seja, 1,45 segundo — e marcamos o número como pouco confiável sempre que o movimento fica perto demais desse limite. A leitura honesta deste gráfico não é *a elevação é de 20 cm*, e sim *a elevação é de 20 cm se você definir elevação como o movimento no ritmo do pumping*.",
    "cap": "A mesma volta, os mesmos dados, seis janelas de nivelamento diferentes: de 18 cm a 33 cm."
  },
  "rules": {
    "h": "De medir a contar: pumps, planeio e toque na água",
    "p": "Assim que a prancha informa o próprio movimento, a contagem na prancha não precisa mais do contador do pulso. Desde **10 de outubro de 2026**, cada gravação com o celular na prancha é contada por quatro regras simples que qualquer pessoa pode conferir:",
    "li": [
      "**Um pump é um movimento que coloca energia.** Cada subida e descida da prancha na faixa do pumping (0,5–3 Hz) é um ciclo. Ele só conta como pump se o bico arfar no ritmo do movimento vertical — tecnicamente, se o produto médio da arfagem rápida pela velocidade de elevação ao longo do ciclo passar de 30 % da mediana daquela volta. Oscilações que vão morrendo depois do último pump e pequenas correções de equilíbrio também mexem a prancha, mas não colocam energia.",
      "**A volta termina no toque na água.** É o primeiro ponto GPS limpo nos últimos 15 segundos de uma volta abaixo de max(8 km/h, 60 % da velocidade de cruzeiro da volta), menos 0,7 s pelo atraso da velocidade do GPS. O toque na água só pode encurtar uma volta, nunca alongá-la.",
      "**Planeio é voar sem bombear.** Trechos sem pump de 1,5 a 15 segundos contam como planeio — a mesma regra com que o mapa da sessão já mostrava os planeios. A arrancada antes do primeiro pump não conta, o fim da volta conta, e um trecho com dados de movimento faltando não conta de jeito nenhum.",
      "**O que é curto demais para julgar fica como estava.** Uma volta com menos de cinco ciclos não tem uma mediana que faça sentido, então mantém a contagem do contador do pulso."
    ],
    "p2": "Nas 20 gravações de prancha de seis riders que tínhamos naquele dia, as regras contam **14 % menos pumps** que o contador do pulso, e o planeio representa **cerca de 8 % do tempo de foil**. A maioria dos planeios reais dura de 2 a 6 segundos; o mais longo foi de 11,9 s, numa sessão em que o celular tinha sido girado entre duas voltas — as regras pressupõem um celular bem fixado, e um celular que se desloca produz planeios que nunca aconteceram. Os valores antigos continuam salvos ao lado dos novos, para que toda mudança possa ser rastreada."
  },
  "found": {
    "h": "O que quatro sessões já nos contaram",
    "p": "É uma pilha pequena de dados — quatro gravações de prancha —, então são observações, não leis. Ainda assim, são os primeiros números que temos que descrevem a prancha e não o rider.",
    "li": [
      "**A orientação da montagem é encontrada automaticamente e é estável.** Em duas voltas da mesma sessão, o ângulo detectado variou 3° — ruído de cálculo, não um celular se mexendo. Entre sessões, variou exatamente o quanto a fita mudou de posição.",
      "**A cadência é surpreendentemente constante.** 1,38 e 1,39 Hz em duas voltas da mesma sessão; 1,45 Hz em outra. O pumping parece menos um esforço e mais uma ressonância que alguém encontrou.",
      "**A elevação fica em torno de 20 cm** nessa cadência, medida do ponto mais baixo ao mais alto, com a ressalva feita acima.",
      "**A arfagem oscila cerca de ±19° e a rolagem cerca de ±10°** numa volta limpa — a prancha arfa muito mais do que rola. É exatamente o que todo o método de detecção pressupõe, e ninguém nunca tinha conferido de verdade."
    ]
  },
  "limits": {
    "h": "O que isto ainda não prova",
    "p": "A lista do que não podemos afirmar é mais longa que a lista do que podemos, e deve continuar assim até termos mais dados:",
    "li": [
      "**Quatro sessões, um rider, uma prancha, um lago.** Nada disso foi validado com outros riders, e a nossa contagem de pumps ainda é calibrada em uma única pessoa — veja na [Parte 3](/nerd-analysen-3) como essa base é frágil.",
      "**O tempo de planeio só é medido na prancha.** No pulso, o número que mostramos como planeio mais longo ainda é o maior intervalo entre dois pumps *detectados*, o que não é a mesma coisa.",
      "**Ninguém faz foil com um celular preso na prancha.** Isto é um instrumento de medição, não um recurso. A função dele é produzir a referência contra a qual o relógio no seu pulso é medido."
    ]
  },
  "videorun": {
    "h": "A sessão em si",
    "p": "O vídeo explicativo deste setup, gravado no lago: o que vai na prancha, como é preso e o que se obtém.",
    "cap": "Celular na prancha: GPS, giroscópio e aceleração, medidos diretamente."
  },
  "next": {
    "h": "Para onde isso vai",
    "p": "Um instrumento de medição existe para ser apontado para alguma coisa. Os dados da prancha nos dão, pela primeira vez, uma referência confiável para duas perguntas que até agora só conseguíamos estimar: **este movimento é um pump**, e **quando a prancha parou de voar**. Hoje as duas coisas são contadas no pulso e calibradas em uma única pessoa. Como essa contagem funciona está na [Parte 2](/nerd-analysen-2); como ela se sai contra um segundo sensor, na [Parte 3](/nerd-analysen-3)."
  },
  "setup": {
    "h": "O equipamento, se é que dá para chamar assim",
    "p": "Não tem suporte, nem capa, nem presilha. O celular vai numa bolsa estanque, a bolsa vai embaixo de uma cinta atravessada no deck, e a cinta é apertada o suficiente para o celular não sair do lugar enquanto a prancha é sacudida para todo lado. Custo total: uma cinta. A graça é que qualquer pessoa consiga repetir isso numa terça à noite, porque os dados só valem alguma coisa se puderem ser coletados mais de uma vez.",
    "capDeck": "O setup completo: bolsa estanque embaixo de uma cinta, atravessada no deck, à frente do mastro.",
    "capRail": "Preso e conferido antes da volta — um celular que se mexe no meio da sessão estraga a gravação."
  }
};


const ru: N4 = {
  "back": "← Часть 3: Двойные часы",
  "h1": "Часть 4: Телефон приклеен к доске",
  "subtitle": "Что можно измерить, когда датчик больше не сидит на запястье",
  "intro": "Каждая цифра о помпинге, которую показывает этот сайт, в конечном счёте берётся с датчика, закреплённого у кого-то на руке. А рука живёт своей жизнью: она раскачивается, напрягается, вытягивается, чтобы удержать равновесие. Три части этой серии мы обходили эту проблему стороной. В сентябре 2026 года мы перестали её обходить и **приклеили телефон к доске** — GPS, акселерометр и гироскоп, 50 измерений в секунду, жёстко связанные с тем, что нас на самом деле интересует. Эта часть — о том, что из этого вышло.",
  "why": {
    "h": "Что запястье может дать, а что нет",
    "p": "Первый сюрприз оказался отрицательным, и о нём стоит сказать прямо, потому что мы ожидали обратного. Мы положили запись с доски рядом с записью **Garmin на запястье из той же сессии, со сдвигом в две минуты**, и сравнили, что каждый датчик видит в частотной области. Если бы запястье было безнадёжным, ритм помпинга выглядел бы там размытым бугром, а на доске — острым пиком.",
    "p2": "Острый пик есть на **обоих**. Тот же пик, те же 1,40 Hz, та же высота. Запястье прекрасно находит каденс помпинга — именно поэтому наш счётчик пампов вообще работает: в этой сессии запись с доски насчитала **103 пампа**, а часы — **106**, разница всего три. Значит, чтобы услышать ритм, доска не нужна. Она даёт то, чего запястье не даст никогда: **положение самой доски** — насколько опускается нос, насколько доска кренится вбок, насколько всё это поднимается и опускается. Рука не может об этом сообщить, каким бы хорошим ни был датчик на ней.",
    "cap": "Одна сессия, два датчика, по 20 секунд самого длинного заезда. Оба видят 1,40 Hz."
  },
  "setup": {
    "h": "Снаряжение, если его можно так назвать",
    "p": "Никакого крепления, никакого чехла, никакого кронштейна. Телефон кладётся в гермомешок, гермомешок — под ремень поперёк деки, и ремень затягивается так туго, чтобы телефон не сдвинулся, пока доску швыряет из стороны в сторону. Общая стоимость: один ремень. Весь смысл в том, чтобы это мог повторить кто угодно в обычный вторник вечером, потому что данные чего-то стоят, только если их можно собрать больше одного раза.",
    "capDeck": "Всё снаряжение: гермомешок под ремнём, поперёк деки, перед мачтой.",
    "capRail": "Затянуто и проверено перед заездом — телефон, который сдвигается посреди сессии, портит запись."
  },
  "what": {
    "h": "Что записывает телефон на доске",
    "p": "Телефон пишет данные в том же формате загрузки, что и все поддерживаемые нами часы, плюс один канал, которого нет ни у одних часов: **гироскоп**. Именно этот дополнительный канал делает возможным всё остальное — гироскоп измеряет вращение напрямую, и не нужно гадать, какая часть измеренного ускорения была силой тяжести, а какая — движением. Из трёх сырых потоков данных мы получаем три угла и одно расстояние:",
    "li": [
      "**Тангаж (pitch)** — нос поднимается и опускается. Это и *есть* движение пампа; всё остальное вторично.",
      "**Крен (roll)** — доска наклоняется влево и вправо. Карвинг и мелкие поправки между пампами.",
      "**Рыскание (yaw)** — изменение курса. Сверяется с GPS-треком, потому что оба измеряют одно и то же и должны совпадать.",
      "**Ход (heave)** — насколько доска на самом деле поднимается и опускается, в сантиметрах, путём двойного интегрирования вертикального ускорения."
    ],
    "cap": "Один заезд, 28 секунд. Кривая тангажа — это помпинг; ход под ней — тот же ритм в сантиметрах.",
    "capTiles": "Те же три угла, как их показывает сайт, в реальном времени вдоль трека."
  },
  "mount": {
    "h": "Проблема, о которой нас никто не предупредил: как именно приклеен телефон?",
    "p": "Телефон понятия не имеет, как он приклеен к доске. Приклей его вдоль — и тангаж будет тангажом. Приклей поперёк — и то, что телефон считает тангажом, на самом деле окажется креном доски. Приклей по диагонали — как и случилось в самой первой настоящей сессии — и чистое колебание по тангажу проявится как **71 % тангажа и 71 % крена одновременно**. Просить райдера указывать ориентацию работает ровно до тех пор, пока кто-нибудь не переклеит мокрый телефон замёрзшими пальцами.",
    "p2": "Поэтому мы даём ответить данным. Помпинг — это вращение вокруг поперечной оси доски, а гироскоп измеряет вращение напрямую. Измеренный сигнал математически поворачивают на все возможные углы установки и ищут, где колебание тангажа в полосе помпинга (0,6–2,5 Hz) сильнее всего — это направление и есть поперечная ось. На картинке ниже показан такой перебор для двух сессий: один телефон приклеен поперёк доски, другой по диагонали. Две сессии, два чистых пика, и никому не пришлось ничего указывать. Чего перебор решить не может, так это смотрит нос вперёд или назад, потому что ось та же самая; это решает первая секунда заезда, ведь любой заезд начинается с того, что нос опускается.",
    "cap": "Энергия тангажа в полосе помпинга в зависимости от предполагаемого угла установки. Пик — это ответ."
  },
  "heave": {
    "h": "Ход, и почему к этой цифре нужна оговорка",
    "p": "Насколько доска на самом деле поднимается и опускается, когда ты качаешь? Двойное интегрирование ускорения даёт ответ в сантиметрах, и это ровно тот тип цифры, которая выглядит солидно, а на деле хрупка. Всё, что медленнее сохраняемой полосы, усиливается пропорционально квадрату своего периода — небольшой дрейф на нижнем краю превращается в метры воображаемого хода.",
    "p2": "Окно выравнивания задаёт эту нижнюю границу, и это не свободный параметр. Посчитай тот же заезд с окном в 1 секунду — получишь 18 cm; с окном в 5 секунд — 33 cm, для одной и той же сессии. Поэтому мы выводим окно из **измеренного каденса** заезда — здесь 1,38 Hz, то есть 1,45 секунды — и помечаем цифру как ненадёжную, когда движение оказывается слишком близко к этой границе. Честное прочтение этого графика — не *ход равен 20 cm*, а *ход равен 20 cm, если понимать под ходом движение в темпе помпинга*.",
    "cap": "Тот же заезд, те же данные, шесть разных окон выравнивания: от 18 cm до 33 cm."
  },
  "rules": {
    "h": "От измерения к подсчёту: пампы, глайды и касание воды",
    "p": "Как только доска сама сообщает о своём движении, подсчёту на доске больше не нужен счётчик на запястье. С **10 октября 2026 года** каждая запись с телефоном на доске считается по четырём простым правилам, которые может проверить каждый:",
    "li": [
      "**Памп — это движение, которое добавляет энергию.** Каждое движение доски вверх и вниз в полосе помпинга (0,5–3 Hz) — это один цикл. Пампом он считается, только если нос качается в такт вертикальному движению — технически: если среднее произведение быстрого тангажа и скорости хода за цикл превышает 30 % медианы этого заезда. Затухающие колебания после последнего пампа и мелкие поправки равновесия тоже двигают доску, но энергии не добавляют.",
      "**Заезд заканчивается касанием воды.** Это первая чистая GPS-точка в последних 15 секундах заезда ниже max(8 km/h, 60 % крейсерской скорости заезда), минус 0,7 s на запаздывание GPS-скорости. Касание может только укоротить заезд, но никогда не удлинить.",
      "**Глайд — это полёт без помпинга.** Отрезки без пампа длиной от 1,5 до 15 секунд считаются глайдом — то же правило, по которому карта сессии уже показывала глайды. Разгон до первого пампа не считается, конец заезда считается, а отрезок с отсутствующими данными о движении не считается вовсе.",
      "**Слишком короткое для оценки остаётся как было.** У заезда менее чем с пятью циклами нет осмысленной медианы, поэтому он сохраняет значение счётчика на запястье."
    ],
    "p2": "На 20 записях с доски от шести райдеров, которые были у нас в тот день, правила насчитывают **на 14 % меньше пампов**, чем счётчик на запястье, а глайды составляют **около 8 % времени на фойле**. Большинство настоящих глайдов длится от 2 до 6 секунд; самый длинный длился 11,9 s — в сессии, где телефон повернули между заездами: правила предполагают надёжно закреплённый телефон, а телефон, который сдвигается, создаёт глайды, которых никогда не было. Старые значения хранятся рядом с новыми, так что каждое изменение можно отследить."
  },
  "found": {
    "h": "Что нам уже рассказали четыре сессии",
    "p": "Это небольшая горстка данных — четыре записи с доски, — так что это наблюдения, а не законы. Но это первые цифры, которые описывают доску, а не райдера.",
    "li": [
      "**Ориентация крепления находится автоматически и она стабильна.** В двух заездах одной сессии найденный угол отличался на 3° — это вычислительный шум, а не сдвиг телефона. Между сессиями он менялся ровно настолько, насколько иначе лежал скотч.",
      "**Каденс удивительно ровный.** 1,38 и 1,39 Hz в двух заездах одной сессии; 1,45 Hz в другой. Помпинг похож не столько на усилие, сколько на резонанс, который кто-то нашёл.",
      "**Ход — около 20 cm** при этом каденсе, от нижней точки до верхней, с оговоркой выше.",
      "**Тангаж колеблется примерно на ±19°, крен — примерно на ±10°** в чистом заезде — то есть доска качается по тангажу гораздо сильнее, чем кренится. Именно на этом допущении построен весь метод распознавания, и до сих пор его никто по-настоящему не проверял."
    ]
  },
  "limits": {
    "h": "Чего это пока не доказывает",
    "p": "Список того, что мы не можем утверждать, длиннее списка того, что можем, и так и должно оставаться, пока данных не станет больше:",
    "li": [
      "**Четыре сессии, один райдер, одна доска, одно озеро.** Ничто здесь не проверено на других райдерах, а наш подсчёт пампов по-прежнему откалиброван на одном человеке — насколько это шаткая основа, смотри в [Части 3](/nerd-analysen-3).",
      "**Время глайдов измеряется только на доске.** На запястье цифра, которую мы показываем как самый длинный глайд, по-прежнему остаётся самым длинным промежутком между двумя *распознанными* пампами, а это не одно и то же.",
      "**Никто не катается с телефоном, приклеенным к доске.** Это измерительный инструмент, а не функция. Его задача — дать эталон, с которым сверяются часы у тебя на запястье."
    ]
  },
  "videorun": {
    "h": "Сама сессия",
    "p": "Видео с объяснением этого снаряжения, снятое на озере: что крепится на доску, как это закрепить и что в итоге получается.",
    "cap": "Телефон на доске: GPS, гироскоп и ускорение, измеренные напрямую."
  },
  "next": {
    "h": "Что дальше",
    "p": "Измерительный инструмент нужен, чтобы направить его на что-то. Данные с доски впервые дают нам эталон для двух вопросов, на которые мы до сих пор отвечали только приблизительно: **является ли это движение пампом** и **когда доска перестала лететь**. Сегодня и то и другое считается на запястье и откалибровано на одном человеке. Как устроен этот подсчёт — в [Части 2](/nerd-analysen-2); насколько хорошо он выдерживает сравнение со вторым датчиком — в [Части 3](/nerd-analysen-3)."
  }
};


const zh: N4 = {
  "back": "← 第3部分：双表测量",
  "h1": "第4部分：手机胶带贴在板上",
  "subtitle": "传感器一旦离开手腕，我们能测到什么",
  "intro": "本站显示的每一个泵动数字，归根结底都来自绑在某人手臂上的传感器。而手臂有它自己的想法：它会摆动，会绷紧，会为了保持平衡而伸出去。在这个系列的前三部分里，我们一直在绕开这个问题。2026年9月，我们不再绕开，**把一部手机贴在了板上** — GPS、加速度计和陀螺仪，每秒50个采样，牢牢固定在我们真正想了解的东西上。这一部分讲的就是由此得到的结果。",
  "why": {
    "h": "手腕能提供什么，不能提供什么",
    "p": "第一个意外是个反面的意外，值得直说，因为我们原本预期的恰恰相反。我们把板上的记录和**同一次出水中手腕上Garmin的记录（相隔两分钟）**放在一起，比较两个传感器在频域中各自看到什么。如果手腕毫无用处，泵动节奏在手腕那边应该是一团模糊的鼓包，而在板上是一个尖锐的峰。",
    "p2": "结果**两边**都是尖锐的峰。同样的峰，同样的1.40 Hz，同样的高度。手腕完全能找准泵动频率 — 这正是我们的泵动计数器能够工作的原因：这次出水中，板上记录数到**103次泵动**，手表数到**106次**，只差三次。所以，要听出节奏并不需要板。板提供的是手腕永远给不了的东西：**板本身的姿态** — 板头下压多少，板向侧面倾斜多少，整体上下起伏多少。无论手臂上的传感器多好，手臂都报告不了这些。",
    "cap": "同一次出水，两个传感器，各取最长航段中的20秒。两者都看到1.40 Hz。"
  },
  "setup": {
    "h": "所谓的装备",
    "p": "没有支架，没有外壳，没有夹具。手机装进防水袋，防水袋压在横跨板面的绑带下面，绑带拉得足够紧，即使板被甩来甩去，手机也不会移位。总成本：一条绑带。关键在于任何人都能在某个周二晚上照着做一遍，因为数据只有能反复采集才有价值。",
    "capDeck": "全部装备：防水袋压在绑带下，横跨板面，位于桅杆前方。",
    "capRail": "出发前绑紧并检查 — 出水途中移动的手机会毁掉整段记录。"
  },
  "what": {
    "h": "板上的手机记录什么",
    "p": "手机写入的上传格式与我们支持的所有手表相同，另外多一个任何手表都没有的通道：**陀螺仪**。正是这个额外通道让其余一切成为可能 — 陀螺仪直接测量旋转，不必去猜测量到的加速度中哪部分是重力、哪部分是运动。我们从三路原始数据中推导出三个角度和一个距离：",
    "li": [
      "**俯仰（pitch）** — 板头上下。这*就是*泵动动作本身；其他一切都是次要的。",
      "**侧倾（roll）** — 板向左右倾斜。刻滑转弯，以及两次泵动之间的小幅修正。",
      "**偏航（yaw）** — 方向变化。与GPS轨迹相互核对，因为两者测的是同一件事，必须吻合。",
      "**起伏（heave）** — 板实际上下移动多少，以厘米计，由竖直加速度两次积分得到。"
    ],
    "cap": "一个航段，28秒。俯仰曲线就是泵动；下面的起伏是同一节奏，以厘米表示。",
    "capTiles": "与网站上显示的同样三个角度，沿轨迹实时显示。"
  },
  "mount": {
    "h": "没人提醒过我们的问题：手机是朝哪个方向贴的？",
    "p": "手机并不知道自己是怎么贴在板上的。顺着板贴，俯仰就是俯仰。横着贴，手机以为的俯仰其实是板的侧倾。斜着贴 — 第一次正式出水时就是这样 — 一个纯粹的俯仰振荡会显示为**71%俯仰加71%侧倾同时发生**。让骑手自己填写方向，只能撑到有人用冻僵的手指重新贴上湿漉漉的手机为止。",
    "p2": "所以我们让数据来回答。泵动是绕板横轴的旋转，而陀螺仪直接测量旋转。把测得的信号在计算中依次旋转到每一个可能的安装角度，找出泵动频带（0.6–2.5 Hz）内俯仰振荡最强的方向 — 那个方向就是横轴。下图是两次出水的这种扫描：一部手机横贴在板上，另一部斜贴。两次出水，两个干净的峰，不需要任何人输入任何信息。扫描无法判断的是板头朝前还是朝后，因为那是同一根轴；这由航段的第一秒决定，因为每个航段都是从板头下压开始的。",
    "cap": "泵动频带内的俯仰能量随假定安装角度的变化。峰值就是答案。"
  },
  "heave": {
    "h": "起伏，以及为什么这个数字需要附加说明",
    "p": "泵动时，板实际上下移动多少？把加速度积分两次可以得到一个以厘米为单位的答案，而这恰恰是那种看起来很权威、实际上很脆弱的数字。任何比所保留频带更慢的成分，都会按其周期的平方被放大 — 低频端的一点点漂移，就会变成好几米虚构的起伏。",
    "p2": "校平窗口决定了这个下限，而它不是可以随意选择的参数。同一个航段用1秒窗口计算得到18厘米，用5秒窗口则得到33厘米 — 而这是完全相同的一次出水。因此我们根据该航段**测得的泵动频率**来确定窗口 — 这里是1.38 Hz，即1.45秒 — 并且只要运动太靠近这个下限，就把该数字标记为不可靠。这张图的诚实读法不是*起伏为20厘米*，而是*如果把起伏定义为泵动节奏下的运动，那么起伏为20厘米*。",
    "cap": "同一航段，同一组数据，六种不同的校平窗口：18厘米到33厘米。"
  },
  "rules": {
    "h": "从测量到计数：泵动、滑行和触水",
    "p": "一旦板能报告自身的运动，板上的计数就不再需要手腕计数器。自**2026年10月10日**起，每条手机在板上的记录都按四条任何人都能核查的简单规则计数：",
    "li": [
      "**泵动是一次注入能量的动作。**板在泵动频带（0.5–3 Hz）内的每一次上下都是一个周期。只有当板头随竖直运动同步俯仰时，它才算作泵动 — 技术上说：如果整个周期内快速俯仰与起伏速度乘积的平均值超过该航段中位数的30%。最后一次泵动之后逐渐衰减的振荡和小的平衡修正也会让板移动，但它们不注入能量。",
      "**航段在触水时结束。**触水点是航段最后15秒内第一个低于max(8 km/h, 航段巡航速度的60%)的干净GPS点，再减去0.7 s以补偿GPS速度的滞后。触水只能缩短航段，永远不会延长它。",
      "**滑行就是不泵动的飞行。**1.5到15秒没有泵动的片段算作滑行 — 与出水地图此前显示滑行时使用的规则相同。第一次泵动之前的助跑不算，航段的结尾算，缺少运动数据的片段完全不算。",
      "**太短无法判断的保持原样。**少于五个周期的航段没有有意义的中位数，因此保留手腕计数器的计数。"
    ],
    "p2": "在当天我们拥有的六名骑手的20条板上记录中，这些规则计出的泵动比手腕计数器**少14%**，滑行约占**水翼飞行时间的8%**。大多数真实滑行持续2到6秒；最长的一次是11.9 s，发生在一次出水中，手机在两个航段之间被转动过 — 规则假定手机牢固固定，而移位的手机会制造出从未发生过的滑行。旧值与新值并排保存，因此每一处变化都可以追溯。"
  },
  "found": {
    "h": "四次出水已经告诉了我们什么",
    "p": "这只是一小堆数据 — 四条板上记录 — 所以这些是观察，而不是定律。不过，这是我们第一次拿到描述板本身而不是骑手的数字。",
    "li": [
      "**安装方向能自动找到，而且很稳定。**在同一次出水的两个航段中，检测到的角度相差3° — 这是计算噪声，不是手机移动了。不同出水之间，角度的变化恰好等于胶带位置的差别。",
      "**泵动频率出奇地稳定。**同一次出水的两个航段分别是1.38和1.39 Hz；另一次出水是1.45 Hz。泵动看起来不太像费力，更像是有人找到了一个共振点。",
      "**起伏约为20厘米**（在这个频率下，从最低点到最高点测量，附带上文的说明）。",
      "**俯仰摆动约±19°，侧倾约±10°**（在干净的航段中）— 板的俯仰远多于侧倾。整个识别方法正是建立在这个假设之上，而此前从未有人真正验证过。"
    ]
  },
  "limits": {
    "h": "这还不能证明什么",
    "p": "我们不能断言的事情，比能断言的事情多得多，在数据增多之前也理应如此：",
    "li": [
      "**四次出水，一名骑手，一块板，一个湖。**这里没有任何结论在其他骑手身上验证过，我们的泵动计数仍然只在一个人身上校准 — 这个基础有多薄弱，请看[第3部分](/nerd-analysen-3)。",
      "**滑行时间只能在板上测量。**在手腕上，我们显示为最长滑行的数字仍然是两次*被识别到的*泵动之间的最长间隔，这并不是同一回事。",
      "**没有人会把手机贴在板上去玩。**这是测量仪器，不是功能。它的任务是提供基准真相，用来检验你手腕上的手表。"
    ]
  },
  "videorun": {
    "h": "出水实况",
    "p": "这套装备的讲解视频，在湖边拍摄：板上装了什么，怎么固定，以及能得到什么。",
    "cap": "板上的手机：GPS、陀螺仪和加速度，直接测量。"
  },
  "next": {
    "h": "下一步",
    "p": "测量仪器的意义在于把它对准某样东西。板上数据第一次为两个我们过去只能估计的问题提供了基准答案：**这个动作是不是泵动**，以及**板是什么时候停止飞行的**。这两者目前都在手腕上计数，并且只在一个人身上校准。计数是如何工作的，见[第2部分](/nerd-analysen-2)；它与第二个传感器对比表现如何，见[第3部分](/nerd-analysen-3)。"
  }
};


const pl: N4 = {
  "back": "← Część 3: Pomiar z dwoma zegarkami",
  "h1": "Część 4: Telefon przyklejony taśmą do deski",
  "subtitle": "Co możemy zmierzyć, gdy czujnik przestaje jeździć na nadgarstku",
  "intro": "Każda liczba dotycząca pompowania, którą pokazuje ta strona, pochodzi koniec końców z czujnika przypiętego do czyjejś ręki. A ta ręka robi, co chce: macha, napina się, wyciąga się, żeby złapać równowagę. Przez trzy części tej serii obchodziliśmy ten problem. We wrześniu 2026 przestaliśmy go obchodzić i **przykleiliśmy telefon do deski** — GPS, akcelerometr i żyroskop, 50 próbek na sekundę, sztywno połączone z tym, co naprawdę chcemy poznać. Ta część opowiada, co z tego wyszło.",
  "why": {
    "h": "Co nadgarstek może dać, a czego nie",
    "p": "Pierwsza niespodzianka była negatywna i warto powiedzieć to wprost, bo spodziewaliśmy się czegoś odwrotnego. Położyliśmy nagranie z deski obok nagrania z **Garmina na nadgarstku z tej samej sesji, przesuniętego o dwie minuty**, i porównaliśmy, co każdy z czujników widzi w dziedzinie częstotliwości. Gdyby nadgarstek był beznadziejny, rytm pompowania wyglądałby tam jak rozmyty garb, a na desce jak ostry pik.",
    "p2": "Na **obu** jest to ostry pik. Ten sam pik, te same 1,40 Hz, ta sama wysokość. Nadgarstek bez trudu znajduje kadencję pompowania — i właśnie dlatego nasz licznik pompnięć w ogóle działa: w tej sesji nagranie z deski naliczyło **103 pompnięcia**, a zegarek **106**, różnica zaledwie trzech. Do usłyszenia rytmu deska nie jest więc potrzebna. Daje za to coś, czego nadgarstek nigdy nie da: **położenie samej deski** — jak bardzo dziób opada, jak bardzo deska przechyla się na bok, jak wysoko całość unosi się i opada. Ręka nie może tego przekazać, choćby czujnik na niej był najlepszy.",
    "cap": "Ta sama sesja, dwa czujniki, z każdego po 20 sekund najdłuższego przejazdu. Oba widzą 1,40 Hz."
  },
  "setup": {
    "h": "Sprzęt, jeśli można to tak nazwać",
    "p": "Nie ma uchwytu, obudowy ani klamry. Telefon trafia do worka wodoszczelnego, worek pod pasek przełożony w poprzek pokładu deski, a pasek zaciska się tak mocno, żeby telefon nie mógł się przesunąć, nawet gdy deską rzuca na wszystkie strony. Całkowity koszt: jeden pasek. Cały sens polega na tym, żeby każdy mógł to powtórzyć w zwykły wtorkowy wieczór, bo dane są coś warte tylko wtedy, gdy da się je zebrać więcej niż raz.",
    "capDeck": "Cały sprzęt: worek wodoszczelny pod paskiem, w poprzek pokładu, przed masztem.",
    "capRail": "Przypięty i sprawdzony przed przejazdem — telefon, który przesunie się w trakcie sesji, psuje nagranie."
  },
  "what": {
    "h": "Co rejestruje telefon na desce",
    "p": "Telefon zapisuje dane w tym samym formacie przesyłania co wszystkie obsługiwane przez nas zegarki, plus jeden kanał, którego nie ma żaden zegarek: **żyroskop**. To właśnie ten dodatkowy kanał umożliwia całą resztę — żyroskop mierzy obrót bezpośrednio, bez zgadywania, która część zmierzonego przyspieszenia była grawitacją, a która ruchem. Z trzech surowych strumieni danych wyprowadzamy trzy kąty i jedną odległość:",
    "li": [
      "**Pochylenie (pitch)** — dziób unosi się i opada. To *jest* ruch pompowania; wszystko inne jest drugorzędne.",
      "**Przechył (roll)** — deska przechyla się w lewo i w prawo. Carving i drobne korekty między pompnięciami.",
      "**Odchylenie (yaw)** — zmiana kursu. Sprawdzane względem śladu GPS, bo oba mierzą to samo i muszą się zgadzać.",
      "**Skok (heave)** — jak bardzo deska faktycznie unosi się i opada, w centymetrach, z dwukrotnego całkowania przyspieszenia pionowego."
    ],
    "cap": "Jeden przejazd, 28 sekund. Krzywa pochylenia to pompowanie; skok pod nią to ten sam rytm, w centymetrach.",
    "capTiles": "Te same trzy kąty, które pokazuje strona, na żywo wzdłuż trasy."
  },
  "mount": {
    "h": "Problem, przed którym nikt nas nie ostrzegł: w którą stronę telefon jest przyklejony?",
    "p": "Telefon nie ma pojęcia, jak jest przyklejony do deski. Przyklej go wzdłuż, a pochylenie jest pochyleniem. Przyklej go w poprzek, a to, co telefon uważa za pochylenie, jest w rzeczywistości przechyłem deski. Przyklej go po skosie — tak było podczas pierwszej prawdziwej sesji — a czyste wahanie w pochyleniu pojawi się jako **71 % pochylenia i 71 % przechyłu jednocześnie**. Proszenie ridera o podanie orientacji działa dokładnie do chwili, gdy ktoś zmarzniętymi palcami przyklei mokry telefon od nowa.",
    "p2": "Dlatego pozwalamy odpowiedzieć danym. Pompowanie to obrót wokół poprzecznej osi deski, a żyroskop mierzy obrót bezpośrednio. Zmierzony sygnał obraca się rachunkowo przez wszystkie możliwe kąty montażu i szuka się miejsca, w którym wahanie pochylenia w paśmie pompowania (0,6–2,5 Hz) jest najsilniejsze — ten kierunek to oś poprzeczna. Obraz poniżej pokazuje takie przeszukanie dla dwóch sesji: jeden telefon przyklejony w poprzek deski, drugi po skosie. Dwie sesje, dwa czyste piki, i nikt nie musiał niczego podawać. Przeszukanie nie rozstrzygnie, czy dziób jest z przodu, czy z tyłu, bo to ta sama oś; rozstrzyga to pierwsza sekunda przejazdu, ponieważ każdy przejazd zaczyna się od opadającego dzioba.",
    "cap": "Energia pochylenia w paśmie pompowania w funkcji założonego kąta montażu. Pik jest odpowiedzią."
  },
  "heave": {
    "h": "Skok i dlaczego ta liczba wymaga zastrzeżenia",
    "p": "Jak bardzo deska naprawdę unosi się i opada, kiedy pompujesz? Dwukrotne całkowanie przyspieszenia daje odpowiedź w centymetrach i jest to dokładnie ten rodzaj liczby, która wygląda wiarygodnie, a po cichu jest krucha. Wszystko, co jest wolniejsze od zachowanego pasma, zostaje wzmocnione proporcjonalnie do kwadratu swojego okresu — mały dryf na dolnym krańcu zamienia się w metry wyimaginowanego skoku.",
    "p2": "Okno poziomowania wyznacza tę dolną granicę i nie jest to dowolny parametr. Policz ten sam przejazd z oknem 1-sekundowym, a wyjdzie 18 cm; z oknem 5-sekundowym wyjdzie 33 cm — dla dokładnie tej samej sesji. Dlatego wyprowadzamy okno ze **zmierzonej kadencji** danego przejazdu — tutaj 1,38 Hz, czyli 1,45 sekundy — i oznaczamy liczbę jako niewiarygodną, gdy ruch znajduje się zbyt blisko tej granicy. Uczciwe odczytanie tego wykresu to nie *skok wynosi 20 cm*, lecz *skok wynosi 20 cm, jeśli skokiem nazwiemy ruch w tempie pompowania*.",
    "cap": "Ten sam przejazd, te same dane, sześć różnych okien poziomowania: od 18 cm do 33 cm."
  },
  "rules": {
    "h": "Od mierzenia do liczenia: pompnięcia, szybowanie i przyziemienie",
    "p": "Gdy deska sama raportuje swój ruch, liczenie na desce nie potrzebuje już licznika z nadgarstka. Od **10 października 2026** każde nagranie z telefonem na desce jest liczone według czterech prostych reguł, które każdy może sprawdzić:",
    "li": [
      "**Pompnięcie to ruch, który dodaje energię.** Każde uniesienie i opadnięcie deski w paśmie pompowania (0,5–3 Hz) to jeden cykl. Liczy się jako pompnięcie tylko wtedy, gdy dziób kiwa się w takt ruchu pionowego — technicznie: gdy średni iloczyn szybkiego pochylenia i prędkości skoku w cyklu przekracza 30 % mediany danego przejazdu. Wygasające drgania po ostatnim pompnięciu i drobne korekty równowagi też poruszają deską, ale nie dodają energii.",
      "**Przejazd kończy się przyziemieniem.** To pierwszy czysty punkt GPS w ostatnich 15 sekundach przejazdu poniżej max(8 km/h, 60 % prędkości przelotowej przejazdu), minus 0,7 s na opóźnienie prędkości z GPS. Przyziemienie może przejazd tylko skrócić, nigdy wydłużyć.",
      "**Szybowanie to latanie bez pompowania.** Odcinki bez pompnięcia trwające od 1,5 do 15 sekund liczą się jako szybowanie — według tej samej reguły, według której mapa sesji już pokazywała szybowanie. Rozbieg przed pierwszym pompnięciem się nie liczy, koniec przejazdu tak, a odcinek z brakującymi danymi o ruchu nie liczy się wcale.",
      "**Co za krótkie do oceny, zostaje jak było.** Przejazd z mniej niż pięcioma cyklami nie ma sensownej mediany, więc zachowuje wynik licznika z nadgarstka."
    ],
    "p2": "W 20 nagraniach z deski od sześciu riderów, które mieliśmy tego dnia, reguły liczą **o 14 % mniej pompnięć** niż licznik z nadgarstka, a szybowanie stanowi **około 8 % czasu na foilu**. Większość prawdziwych szybowań trwa od 2 do 6 sekund; najdłuższe trwało 11,9 s, w sesji, w której telefon został obrócony między przejazdami — reguły zakładają solidnie zamocowany telefon, a telefon, który się przesuwa, tworzy szybowania, których nigdy nie było. Stare wartości pozostają zapisane obok nowych, więc każdą zmianę można prześledzić."
  },
  "found": {
    "h": "Co już powiedziały nam cztery sesje",
    "p": "To mała garść danych — cztery nagrania z deski — więc są to obserwacje, a nie prawa. Są to jednak pierwsze liczby, jakie mamy, które opisują deskę, a nie ridera.",
    "li": [
      "**Orientacja montażu jest znajdowana automatycznie i jest stabilna.** W dwóch przejazdach jednej sesji wykryty kąt różnił się o 3° — to szum obliczeniowy, a nie przesunięty telefon. Między sesjami różnił się dokładnie o tyle, o ile inaczej leżała taśma.",
      "**Kadencja jest zaskakująco równa.** 1,38 i 1,39 Hz w dwóch przejazdach jednej sesji; 1,45 Hz w innej. Pompowanie wygląda mniej na wysiłek, a bardziej na rezonans, który ktoś znalazł.",
      "**Skok wynosi około 20 cm** przy tej kadencji, mierzony od najniższego do najwyższego punktu, z zastrzeżeniem opisanym wyżej.",
      "**Pochylenie waha się o około ±19°, przechył o około ±10°** w czystym przejeździe — deska pochyla się więc znacznie bardziej, niż przechyla. Dokładnie to zakłada całe podejście do wykrywania, a nikt nigdy tego naprawdę nie sprawdził."
    ]
  },
  "limits": {
    "h": "Czego to jeszcze nie dowodzi",
    "p": "Lista rzeczy, których nie możemy twierdzić, jest dłuższa niż lista tych, które możemy, i tak powinno zostać, dopóki nie przybędzie danych:",
    "li": [
      "**Cztery sesje, jeden rider, jedna deska, jedno jezioro.** Nic tutaj nie zostało zweryfikowane na innych riderach, a nasze liczenie pompnięć wciąż jest skalibrowane na jednej osobie — jak cienki jest to grunt, pokazuje [Część 3](/nerd-analysen-3).",
      "**Czas szybowania mierzymy tylko na desce.** Na nadgarstku liczba, którą pokazujemy jako najdłuższe szybowanie, to nadal najdłuższa przerwa między dwoma *wykrytymi* pompnięciami, a to nie to samo.",
      "**Nikt nie pływa z telefonem przyklejonym do deski.** To przyrząd pomiarowy, a nie funkcja. Jego zadaniem jest dostarczyć prawdę, względem której mierzy się zegarek na twoim nadgarstku."
    ]
  },
  "videorun": {
    "h": "Sama sesja",
    "p": "Film objaśniający ten sprzęt, nakręcony nad jeziorem: co trafia na deskę, jak to zamocować i co z tego wychodzi.",
    "cap": "Telefon na desce: GPS, żyroskop i przyspieszenie, mierzone bezpośrednio."
  },
  "next": {
    "h": "Dokąd to prowadzi",
    "p": "Przyrząd pomiarowy jest po to, żeby na coś go skierować. Dane z deski po raz pierwszy dają nam punkt odniesienia dla dwóch pytań, na które dotąd mogliśmy odpowiadać tylko szacunkowo: **czy ten ruch jest pompnięciem** oraz **kiedy deska przestała latać**. Oba są dziś liczone na nadgarstku i skalibrowane na jednej osobie. Jak działa to liczenie, opisuje [Część 2](/nerd-analysen-2); jak dobrze wypada w porównaniu z drugim czujnikiem — [Część 3](/nerd-analysen-3)."
  }
};

export const NERD4: Partial<Record<Lang, N4>> = { pl, zh, ru, pt, "pt-PT": ptPT, nl, nb, ja, it, id, gsw, fr, fi, es, de, "de-AT": deAT, cs, en };
