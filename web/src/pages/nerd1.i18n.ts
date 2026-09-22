// Inhalte für die Nerd-Analysen Teil 1 (Dual-Watch-Experiment), alle 7 Sprachen.
// `de` ist die Quelle der Wahrheit. Rich-Markup: **fett**, `code`, *kursiv*, [label](/pfad).
// Eigennamen (fenix, Forerunner 55, FR55, Illmensee, Garmin Connect, FIT, GPS) unübersetzt.
// Keine geraden Anführungszeichen (") in Strings — nur typografische.
import type { Lang } from "../i18n";

export interface N1 {
  back: string;
  h1: string;
  subtitle: string;
  intro: string;
  aufbau: { h: string; p: string; alt1: string; alt2: string; alt3: string; altSpot: string };
  daten: { h: string; p: string };
  start: { h: string; p: string; cap1: string; cap2: string };
  truth: { h: string; p: string; cap: string };
  cadence: { h: string; p: string; cap: string };
  pitch: { h: string; p: string; cap: string };
  pics: { h: string; p: string; cap1: string; cap2: string; cap3: string };
  learned: { h: string; li: string[] };
  limits: { h: string; p: string };
  next: string;
}

const de: N1 = {
  back: "← Zurück",
  next: "→ Teil 2: Wie die Erkennung funktioniert",
  h1: "Nerd-Analysen",
  subtitle:
    "Dual-Watch-Pumpfoil-Experiment · Illmensee, 27.06.2026 · rohe Beschleunigungs-Daten, viel Signalverarbeitung und ein bisschen Foil-Physik. Für alle, die's genau wissen wollen.",
  intro:
    "Frage: Was kann man aus den Bewegungsdaten eines Pumpfoil-Laufs wirklich herauslesen — und können wir damit die Pump-, On-Foil- und Gleit-Erkennung verbessern? Dafür haben wir einen Lauf **gleichzeitig mit zwei Uhren** aufgezeichnet: einer am Handgelenk und einer **direkt am Foil-Mast, unter Wasser** — die „Wahrheit“ über das, was der Foil tut.",
  aufbau: {
    h: "Der Aufbau",
    p: "**fenix** am Handgelenk (25/100 Hz, gutes GPS) — das ist die Uhr, die wir später im Produkt haben. **Forerunner 55** am Foil-Mast festgezurrt, **unter Wasser**, über Kopf, mit dem Start-Knopf in Fahrtrichtung. Beide liefen auf unserer eigenen Recorder-App (v1.0.37). Die Mast-Uhr hat unter Wasser **kein GPS** — sie misst nur die rohe Beschleunigung des Foils.",
    alt1: "Foil mit Mast-Uhr am Steg",
    alt2: "FR55 am Mast — Auto-Start",
    alt3: "FR55 am Mast — GPS-Suche",
    altSpot: "Spot Illmensee bei Sonnenuntergang",
  },
  daten: {
    h: "Die Daten",
    p: "Statt der (auf der schwachen FR55 abbrechenden) Roh-Chunks haben wir die **Original-FIT-Dateien** aus Garmin Connect ausgewertet: fenix **100 Hz**, Mast **25 Hz**, jeweils über den ganzen Lauf. Beide Uhren laufen über die Systemzeit synchron.",
  },
  start: {
    h: "Die Startsequenz",
    p: "Aus den Daten lässt sich der komplette Start rekonstruieren (per Video bestätigt): Das Board liegt **auf dem Kopf** am Steg → wird um **180° gedreht** und der Foil eingetaucht (oben: FR55-Lage kippt von −1 auf +1) → kurz konzentrieren → **anschieben** mit der Uhr-Hand → die Hand **schnippt beim Loslassen hoch** (4–6 g Arm-Stoß, Sprungenergie) → **Sprung & Landung** aufs Board → Pumpen → fliegen.",
    cap1: "Der 180°-Flip des Boards (FR55-Gravitation kippt) und die Start-Zone in den 5 s danach.",
    cap2: "Start-Sequenz: Board-Flip, Vorbereiten, Push/Sprung, dann die Speed-Rampe ins Foilen.",
  },
  truth: {
    h: "Pumpen, Foilen, Gleiten — die Wahrheit vom Foil",
    p: "Der Mast sitzt am Foil und „weiß“, ob wirklich gepumpt wird und ob der Foil noch fliegt. Schön sichtbar am Auslaufen: zuerst hört das **Pumpen auf** (Wrist-Aktivität → 0), die Geschwindigkeit hält aber noch → das ist die **Gleitphase**; danach kippt der Foil weg (Mast-Ausschlag) und es ist vorbei. Genau diese Gleitphase erkennen wir bisher nicht explizit.",
    cap: "GPS-Speed · Wrist-Pump-Aktivität · Foil-Pump (Mast) · Foil-Lage. Am Ende: Pumpen stoppt → Gleiten → Foil-Drop.",
  },
  cadence: {
    h: "Die Pump-Kadenz",
    p: "Gepumpt wird mit **≈ 1,29 Hz** (~77 Pumps/Minute). Das Handgelenk trifft diese Rate sauber (Anzahl & Takt stimmen mit dem Foil-Schub überein) — die Pump-Erkennung läuft also grundsätzlich richtig.",
    cap: "Wrist-Pump-Marker vs. Foil-Schub-Peaks — gleiche Kadenz (~1,3 Hz), Takte tracken.",
  },
  pitch: {
    h: "Foil-Lage: Nicken dominiert, Vortrieb fore/aft",
    p: "Beim Pumpen kippst du den Foil über den 85-cm-Mast-Hebel **vor/zurück** (Nicken), kaum seitlich — in den Daten dominiert die Nick- die Roll-Bewegung klar. Und die Beschleunigung des Foils ist überwiegend **fore/aft (Vortrieb)**, nicht vertikal: der Foil schiebt nach vorne, wenn du Druck gibst.",
    cap: "Foil-Lage im Lauf: Nick (fore/aft) ≫ Roll. Pitch und vertikale Last sind gekoppelt.",
  },
  pics: {
    h: "Coole Bilder",
    p: "Der Track, eingefärbt nach Foil-Lage und Geschwindigkeit (weiß = 0°, rot/blau je Richtung):",
    cap1: "Foiling-Track nach Nickwinkel, Rollwinkel und Speed. Der Foil hält durchgehend leicht Nase-hoch (Auftrieb).",
    cap2: "Track nach Vortrieb (rot=vorwärts) — man sieht jeden Pump-Schub — und die einzelnen Pump-Marker auf dem Pfad.",
    cap3: "Lage-Teppich: Nick / Roll / Vortrieb über die Zeit auf einen Blick.",
  },
  learned: {
    h: "Was wir gelernt haben",
    li: [
      "**Pump-Erkennung** trifft Rate & Anzahl gut (~1,29 Hz) — deckt sich mit der Foil-Wahrheit am Mast (wenige % Abweichung).",
      "**On-Foil-Erkennung** liegt gut — sie zeigt den Steg/Absprung präzise (snappt auf den Aufsprung-Impuls).",
      "**Gleitphase / Auslaufen**: hier ist das größte Potenzial — „On-Foil ∧ Pump-Aktivität ≈ 0“ könnte das Gleiten am Ende explizit ausweisen.",
      "Alles davon ist **nur mit der Handgelenk-Uhr** machbar — die Mast-Uhr war nur die Wahrheits-Referenz.",
    ],
  },
  limits: {
    h: "Grenzen (für die Ehrlichkeit)",
    p: "Die Mast-Uhr ist unter Wasser stark gedämpft, daher sieht sie scharfe Stöße nur abgeschwächt. Die „Winkel“ stammen aus der Schwerkraft-Richtung (Tiefpass) — im stationären Gleiten echte Lage, bei anhaltender Beschleunigung leicht verfälscht; für 100 % saubere Drehwinkel bräuchte man ein Gyroskop. Und der genaue Zeit-Versatz einzelner Pumps zwischen den Uhren ließ sich nicht auf < 100 ms festnageln (kein sauberer gemeinsamer Fixpunkt; die FR55 hat unter Wasser kein GPS zum Uhr-Stellen).",
  },
};

// --- Schwiizerdütsch (Züridütsch) ---
const gsw: N1 = {
  back: "← Zrugg",
  next: "→ Teil 2: Wie d Erkennig funktioniert",
  h1: "Nerd-Analyse",
  subtitle:
    "Dual-Watch-Pumpfoil-Experimänt · Illmensee, 27.06.2026 · rohi Bschlünigungs-Date, vill Signalverarbeitig und es bitzeli Foil-Physik. Für alli, wo's gnau wüsse wänd.",
  intro:
    "Frog: Was cha me us de Bewegigs-Date vo eme Pumpfoil-Lauf würklich uselääse — und chönd mer dedmit d Pump-, On-Foil- und Gleit-Erkennig verbessere? Defür hend mer en Lauf **gliichziitig mit zwei Uhre** ufgnoo: eini am Handglänk und eini **diräkt am Foil-Mast, under Wasser** — d „Wahrheit“ über das, was de Foil macht.",
  aufbau: {
    h: "De Ufbau",
    p: "**fenix** am Handglänk (25/100 Hz, guets GPS) — das isch d Uhr, wo mer spöter im Produkt hend. **Forerunner 55** am Foil-Mast festzurrt, **under Wasser**, über Chopf, mit em Start-Chnopf i Fahrtrichtig. Beidi sind uf euserer eigene Recorder-App glaufe (v1.0.37). D Mast-Uhr hät under Wasser **kei GPS** — si misst nu di rohi Bschlünigung vom Foil.",
    alt1: "Foil mit Mast-Uhr am Steg",
    alt2: "FR55 am Mast — Auto-Start",
    alt3: "FR55 am Mast — GPS-Suech",
    altSpot: "Spot Illmensee bim Sunneuntergang",
  },
  daten: {
    h: "D Date",
    p: "Statt de (uf dr schwache FR55 abbrächende) Roh-Chunks hend mer d **Original-FIT-Dateie** us Garmin Connect uusgwärtet: fenix **100 Hz**, Mast **25 Hz**, jewiils über de ganz Lauf. Beidi Uhre laufed über d Systemziit synchron.",
  },
  start: {
    h: "D Startsequänz",
    p: "Us de Date loot sich de ganz Start rekonstruiere (per Video bestätigt): S Board liit **uf em Chopf** am Steg → wird um **180° dreiht** und de Foil iietaucht (obe: FR55-Lag chiplet vo −1 uf +1) → churz konzentriere → **aaschiebe** mit dr Uhr-Hand → d Hand **schnellt bim Loslo ufe** (4–6 g Arm-Stoss, Sprungenergie) → **Sprung & Landig** ufs Board → Pumpe → flüge.",
    cap1: "De 180°-Flip vom Board (FR55-Gravitation chiplet) und d Start-Zone i de 5 s denoo.",
    cap2: "Start-Sequänz: Board-Flip, Vorbereite, Push/Sprung, denn d Speed-Rampe is Foile.",
  },
  truth: {
    h: "Pumpe, Foile, Gleite — d Wahrheit vom Foil",
    p: "De Mast sitzt am Foil und „weiss“, öb würklich pumpt wird und öb de Foil no fliegt. Schön gseh bim Uslaufe: zerscht hört s **Pumpe uf** (Wrist-Aktivität → 0), d Gschwindigkeit haltet aber no → das isch d **Gleitphase**; denoo chiplet de Foil wäg (Mast-Usschlag) und s isch verbii. Gnau die Gleitphase erkänned mer bisher nöd explizit.",
    cap: "GPS-Speed · Wrist-Pump-Aktivität · Foil-Pump (Mast) · Foil-Lag. Am Schluss: Pumpe stoppt → Gleite → Foil-Drop.",
  },
  cadence: {
    h: "D Pump-Kadänz",
    p: "Pumpt wird mit **≈ 1,29 Hz** (~77 Pumps/Minute). S Handglänk trifft die Rate suuber (Aazahl & Takt stimmed mit em Foil-Schub überii) — d Pump-Erkennig laufft also grundsätzlich richtig.",
    cap: "Wrist-Pump-Marker vs. Foil-Schub-Peaks — gliichi Kadänz (~1,3 Hz), d Takte tracked.",
  },
  pitch: {
    h: "Foil-Lag: Nicke dominiert, Vortrieb fore/aft",
    p: "Bim Pumpe chiplisch de Foil über de 85-cm-Mast-Hebel **vor/zrugg** (Nicke), chuum siitlich — i de Date dominiert d Nick- d Roll-Bewegig klar. Und d Bschlünigung vom Foil isch überwiegend **fore/aft (Vortrieb)**, nöd vertikal: de Foil schiebt nach vorne, wenn d Druck gisch.",
    cap: "Foil-Lag im Lauf: Nick (fore/aft) ≫ Roll. Pitch und vertikali Last sind kopplet.",
  },
  pics: {
    h: "Cooli Bilder",
    p: "De Track, iigfärbt nach Foil-Lag und Gschwindigkeit (wiiss = 0°, rot/blau je Richtig):",
    cap1: "Foiling-Track nach Nickwinkel, Rollwinkel und Speed. De Foil haltet durchgehend liicht Nase-hoch (Uftrieb).",
    cap2: "Track nach Vortrieb (rot=vorwärts) — me gseht jede Pump-Schub — und di einzelne Pump-Marker uf em Pfad.",
    cap3: "Lag-Teppich: Nick / Roll / Vortrieb über d Ziit uf ei Blick.",
  },
  learned: {
    h: "Was mer glernt hend",
    li: [
      "**Pump-Erkennig** trifft Rate & Aazahl guet (~1,29 Hz) — deckt sich mit dr Foil-Wahrheit am Mast (weni % Abwiichig).",
      "**On-Foil-Erkennig** liit guet — si zeigt de Steg/Absprung präzis (snappt uf de Ufsprung-Impuls).",
      "**Gleitphase / Uslaufe**: do isch s gröschte Potänzial — „On-Foil ∧ Pump-Aktivität ≈ 0“ chönnt s Gleite am Schluss explizit uswiise.",
      "Alles devo isch **nu mit dr Handglänk-Uhr** machbar — d Mast-Uhr isch nu d Wahrheits-Referänz gsi.",
    ],
  },
  limits: {
    h: "Gränze (für d Ehrlichkeit)",
    p: "D Mast-Uhr isch under Wasser stark dämpft, drum gseht si scharfi Stöss nu abgschwächt. D „Winkel“ stämmed us dr Schwärchraft-Richtig (Tiefpass) — im stationäre Gleite echti Lag, bi ahaltender Bschlünigung liicht verfälscht; für 100 % suuberi Drehwinkel bruuchti me es Gyroskop. Und de gnau Ziit-Versatz vo einzelne Pumps zwüsched de Uhre hät sich nöd uf < 100 ms festnagle loo (kei suubere gmeinsame Fixpunkt; d FR55 hät under Wasser kei GPS zum d Uhr stelle).",
  },
};

// --- Österreichisch ---
const deAT: N1 = {
  back: "← Zurück",
  next: "→ Teil 2: Wie die Erkennung funktioniert",
  h1: "Nerd-Analysen",
  subtitle:
    "Dual-Watch-Pumpfoil-Experiment · Illmensee, 27.06.2026 · rohe Beschleunigungs-Daten, viel Signalverarbeitung und a bisserl Foil-Physik. Für alle, die's ganz genau wissen wollen.",
  intro:
    "Frage: Was kann man aus den Bewegungsdaten eines Pumpfoil-Laufs wirklich herauslesen — und können wir damit die Pump-, On-Foil- und Gleit-Erkennung verbessern? Dafür haben wir einen Lauf **gleichzeitig mit zwei Uhren** aufgezeichnet: eine am Handgelenk und eine **direkt am Foil-Mast, unter Wasser** — die „Wahrheit“ über das, was der Foil tut.",
  aufbau: {
    h: "Der Aufbau",
    p: "**fenix** am Handgelenk (25/100 Hz, gutes GPS) — das ist die Uhr, die wir später im Produkt haben. **Forerunner 55** am Foil-Mast festgezurrt, **unter Wasser**, über Kopf, mit dem Start-Knopf in Fahrtrichtung. Beide liefen auf unserer eigenen Recorder-App (v1.0.37). Die Mast-Uhr hat unter Wasser **kein GPS** — sie misst nur die rohe Beschleunigung des Foils.",
    alt1: "Foil mit Mast-Uhr am Steg",
    alt2: "FR55 am Mast — Auto-Start",
    alt3: "FR55 am Mast — GPS-Suche",
    altSpot: "Spot Illmensee bei Sonnenuntergang",
  },
  daten: {
    h: "Die Daten",
    p: "Statt der (auf der schwachen FR55 abbrechenden) Roh-Chunks haben wir die **Original-FIT-Dateien** aus Garmin Connect ausgewertet: fenix **100 Hz**, Mast **25 Hz**, jeweils über den ganzen Lauf. Beide Uhren laufen über die Systemzeit synchron.",
  },
  start: {
    h: "Die Startsequenz",
    p: "Aus den Daten lässt sich der komplette Start rekonstruieren (per Video bestätigt): Das Board liegt **am Kopf** am Steg → wird um **180° gedreht** und der Foil eingetaucht (oben: FR55-Lage kippt von −1 auf +1) → kurz sammeln → **anschieben** mit der Uhr-Hand → die Hand **schnippt beim Loslassen hoch** (4–6 g Arm-Stoß, Sprungenergie) → **Sprung & Landung** aufs Board → Pumpen → fliegen.",
    cap1: "Der 180°-Flip des Boards (FR55-Gravitation kippt) und die Start-Zone in den 5 s danach.",
    cap2: "Start-Sequenz: Board-Flip, Vorbereiten, Push/Sprung, dann die Speed-Rampe ins Foilen.",
  },
  truth: {
    h: "Pumpen, Foilen, Gleiten — die Wahrheit vom Foil",
    p: "Der Mast sitzt am Foil und „weiß“, ob wirklich gepumpt wird und ob der Foil noch fliegt. Schön sichtbar am Auslaufen: zuerst hört das **Pumpen auf** (Wrist-Aktivität → 0), die Geschwindigkeit hält aber noch → das ist die **Gleitphase**; danach kippt der Foil weg (Mast-Ausschlag) und es ist vorbei. Genau diese Gleitphase erkennen wir bisher nicht explizit.",
    cap: "GPS-Speed · Wrist-Pump-Aktivität · Foil-Pump (Mast) · Foil-Lage. Am Ende: Pumpen stoppt → Gleiten → Foil-Drop.",
  },
  cadence: {
    h: "Die Pump-Kadenz",
    p: "Gepumpt wird mit **≈ 1,29 Hz** (~77 Pumps/Minute). Das Handgelenk trifft diese Rate sauber (Anzahl & Takt stimmen mit dem Foil-Schub überein) — die Pump-Erkennung läuft also grundsätzlich richtig.",
    cap: "Wrist-Pump-Marker vs. Foil-Schub-Peaks — gleiche Kadenz (~1,3 Hz), Takte tracken.",
  },
  pitch: {
    h: "Foil-Lage: Nicken dominiert, Vortrieb fore/aft",
    p: "Beim Pumpen kippst du den Foil über den 85-cm-Mast-Hebel **vor/zurück** (Nicken), kaum seitlich — in den Daten dominiert die Nick- die Roll-Bewegung klar. Und die Beschleunigung des Foils ist überwiegend **fore/aft (Vortrieb)**, nicht vertikal: der Foil schiebt nach vorne, wenn du Druck gibst.",
    cap: "Foil-Lage im Lauf: Nick (fore/aft) ≫ Roll. Pitch und vertikale Last sind gekoppelt.",
  },
  pics: {
    h: "Coole Bilder",
    p: "Der Track, eingefärbt nach Foil-Lage und Geschwindigkeit (weiß = 0°, rot/blau je Richtung):",
    cap1: "Foiling-Track nach Nickwinkel, Rollwinkel und Speed. Der Foil hält durchgehend leicht Nase-hoch (Auftrieb).",
    cap2: "Track nach Vortrieb (rot=vorwärts) — man sieht jeden Pump-Schub — und die einzelnen Pump-Marker auf dem Pfad.",
    cap3: "Lage-Teppich: Nick / Roll / Vortrieb über die Zeit auf einen Blick.",
  },
  learned: {
    h: "Was wir gelernt haben",
    li: [
      "**Pump-Erkennung** trifft Rate & Anzahl gut (~1,29 Hz) — deckt sich mit der Foil-Wahrheit am Mast (wenige % Abweichung).",
      "**On-Foil-Erkennung** liegt gut — sie zeigt den Steg/Absprung präzise (snappt auf den Aufsprung-Impuls).",
      "**Gleitphase / Auslaufen**: da ist das größte Potenzial — „On-Foil ∧ Pump-Aktivität ≈ 0“ könnte das Gleiten am Ende explizit ausweisen.",
      "Alles davon ist **nur mit der Handgelenk-Uhr** machbar — die Mast-Uhr war nur die Wahrheits-Referenz.",
    ],
  },
  limits: {
    h: "Grenzen (für die Ehrlichkeit)",
    p: "Die Mast-Uhr ist unter Wasser stark gedämpft, daher sieht sie scharfe Stöße nur abgeschwächt. Die „Winkel“ stammen aus der Schwerkraft-Richtung (Tiefpass) — im stationären Gleiten echte Lage, bei anhaltender Beschleunigung a bisserl verfälscht; für 100 % saubere Drehwinkel bräuchte man ein Gyroskop. Und der genaue Zeit-Versatz einzelner Pumps zwischen den Uhren ließ sich nicht auf < 100 ms festnageln (kein sauberer gemeinsamer Fixpunkt; die FR55 hat unter Wasser kein GPS zum Uhr-Stellen).",
  },
};

const en: N1 = {
  back: "← Back",
  next: "→ Part 2: How the detection works",
  h1: "Nerd Analytics",
  subtitle:
    "Dual-watch pumpfoil experiment · Illmensee, June 27, 2026 · raw acceleration data, plenty of signal processing and a bit of foil physics. For everyone who wants to know exactly.",
  intro:
    "Question: What can you really read out of the motion data of a pumpfoil run — and can we use it to improve pump, on-foil and glide detection? For that we recorded a run **simultaneously with two watches**: one on the wrist and one **directly on the foil mast, underwater** — the ground truth about what the foil is doing.",
  aufbau: {
    h: "The setup",
    p: "**fenix** on the wrist (25/100 Hz, good GPS) — that is the watch we will have in the product later. **Forerunner 55** strapped to the foil mast, **underwater**, upside down, with the start button pointing in the direction of travel. Both ran our own recorder app (v1.0.37). The mast watch has **no GPS** underwater — it only measures the raw acceleration of the foil.",
    alt1: "Foil with mast watch at the jetty",
    alt2: "FR55 on the mast — auto-start",
    alt3: "FR55 on the mast — GPS search",
    altSpot: "Illmensee spot at sunset",
  },
  daten: {
    h: "The data",
    p: "Instead of the raw chunks (which break off on the weak FR55) we evaluated the **original FIT files** from Garmin Connect: fenix **100 Hz**, mast **25 Hz**, each over the whole run. Both watches stay in sync via system time.",
  },
  start: {
    h: "The start sequence",
    p: "The complete start can be reconstructed from the data (confirmed by video): the board lies **upside down** at the jetty → is rotated **180°** and the foil dipped in (top: FR55 orientation flips from −1 to +1) → brief focus → **push off** with the watch hand → the hand **snaps up on release** (4–6 g arm impulse, jump energy) → **jump & landing** onto the board → pumping → flying.",
    cap1: "The 180° flip of the board (FR55 gravity tips over) and the start zone in the 5 s afterward.",
    cap2: "Start sequence: board flip, prepare, push/jump, then the speed ramp into foiling.",
  },
  truth: {
    h: "Pumping, foiling, gliding — the truth from the foil",
    p: "The mast sits on the foil and “knows” whether pumping is really happening and whether the foil is still flying. Nicely visible during the run-out: first the **pumping stops** (wrist activity → 0), but the speed still holds → that is the **glide phase**; afterward the foil drops away (mast deflection) and it is over. This is exactly the glide phase we do not yet detect explicitly.",
    cap: "GPS speed · wrist pump activity · foil pump (mast) · foil orientation. At the end: pumping stops → gliding → foil drop.",
  },
  cadence: {
    h: "The pump cadence",
    p: "Pumping happens at **≈ 1.29 Hz** (~77 pumps/minute). The wrist hits this rate cleanly (count & timing match the foil surge) — so pump detection basically works correctly.",
    cap: "Wrist pump markers vs. foil surge peaks — same cadence (~1.3 Hz), the beats track.",
  },
  pitch: {
    h: "Foil orientation: pitch dominates, forward thrust fore/aft",
    p: "When pumping you tip the foil fore/aft over the 85 cm mast lever **forward/back** (pitch), hardly sideways — in the data the pitch clearly dominates over the roll motion. And the acceleration of the foil is predominantly **fore/aft (surge)**, not vertical: the foil pushes forward when you apply pressure.",
    cap: "Foil orientation over the run: pitch (fore/aft) ≫ roll. Pitch and vertical load are coupled.",
  },
  pics: {
    h: "Cool pictures",
    p: "The track, colored by foil orientation and speed (white = 0°, red/blue per direction):",
    cap1: "Foiling track by pitch angle, roll angle and speed. The foil holds a slight nose-up attitude throughout (lift).",
    cap2: "Track by surge (red=forward) — you can see every pump thrust — plus the individual pump markers on the path.",
    cap3: "Orientation carpet: pitch / roll / surge over time at a glance.",
  },
  learned: {
    h: "What we learned",
    li: [
      "**Pump detection** nails rate & count well (~1.29 Hz) — matches the foil ground truth at the mast (a few % deviation).",
      "**On-foil detection** is spot on — it pinpoints the jetty/takeoff precisely (snaps onto the takeoff impulse).",
      "**Glide phase / run-out**: this is where the biggest potential lies — “on-foil ∧ pump activity ≈ 0” could explicitly flag the gliding at the end.",
      "All of this is doable **with the wrist watch alone** — the mast watch was only the ground-truth reference.",
    ],
  },
  limits: {
    h: "Limits (for honesty)",
    p: "The mast watch is heavily damped underwater, so it sees sharp impulses only attenuated. The “angles” come from the direction of gravity (low-pass) — true orientation in steady gliding, slightly distorted under sustained acceleration; for 100 % clean rotation angles you would need a gyroscope. And the exact time offset of individual pumps between the watches could not be pinned down to < 100 ms (no clean common fixpoint; the FR55 has no GPS underwater to set its clock).",
  },
};

const fr: N1 = {
  back: "← Retour",
  next: "→ Partie 2 : comment fonctionne la détection",
  h1: "Analyses de geek",
  subtitle:
    "Expérience pumpfoil deux montres · Illmensee, 27/06/2026 · données brutes d’accélération, beaucoup de traitement du signal et un peu de physique du foil. Pour tous ceux qui veulent savoir précisément.",
  intro:
    "Question : que peut-on vraiment tirer des données de mouvement d’un run de pumpfoil — et pouvons-nous ainsi améliorer la détection du pump, du on-foil et de la glisse ? Pour cela, nous avons enregistré un run **simultanément avec deux montres** : une au poignet et une **directement sur le mât du foil, sous l’eau** — la vérité (terrain) sur ce que fait le foil.",
  aufbau: {
    h: "Le montage",
    p: "**fenix** au poignet (25/100 Hz, bon GPS) — c’est la montre que nous aurons plus tard dans le produit. **Forerunner 55** sanglée sur le mât du foil, **sous l’eau**, tête en bas, avec le bouton de démarrage dans le sens de la marche. Les deux tournaient sur notre propre app d’enregistrement (v1.0.37). La montre au mât n’a **pas de GPS** sous l’eau — elle mesure seulement l’accélération brute du foil.",
    alt1: "Foil avec la montre au mât sur le ponton",
    alt2: "FR55 sur le mât — démarrage auto",
    alt3: "FR55 sur le mât — recherche GPS",
    altSpot: "Spot Illmensee au coucher du soleil",
  },
  daten: {
    h: "Les données",
    p: "Au lieu des chunks bruts (qui s’interrompent sur la faible FR55), nous avons exploité les **fichiers FIT d’origine** de Garmin Connect : fenix **100 Hz**, mât **25 Hz**, chacun sur tout le run. Les deux montres sont synchronisées via l’horloge système.",
  },
  start: {
    h: "La séquence de départ",
    p: "À partir des données, on peut reconstruire tout le départ (confirmé par vidéo) : la board est posée **tête en bas** sur le ponton → on la fait pivoter de **180°** et on immerge le foil (en haut : l’orientation de la FR55 bascule de −1 à +1) → un instant de concentration → **poussée** avec la main portant la montre → la main **se détend vers le haut au lâcher** (impulsion du bras de 4–6 g, énergie de saut) → **saut & atterrissage** sur la board → pump → vol.",
    cap1: "Le flip à 180° de la board (la gravité vue par la FR55 bascule) et la zone de départ dans les 5 s qui suivent.",
    cap2: "Séquence de départ : flip de la board, préparation, poussée/saut, puis la rampe de vitesse vers le foiling.",
  },
  truth: {
    h: "Pump, foiling, glisse — la vérité du foil",
    p: "Le mât est fixé au foil et « sait » si on pump vraiment et si le foil vole encore. Bien visible à la décélération : d’abord le **pump s’arrête** (activité au poignet → 0), mais la vitesse se maintient encore → c’est la **phase de glisse** ; ensuite le foil décroche (débattement au mât) et c’est fini. C’est précisément cette phase de glisse que nous ne détectons pas encore explicitement.",
    cap: "Vitesse GPS · activité de pump au poignet · pump du foil (mât) · orientation du foil. À la fin : le pump s’arrête → glisse → décrochage du foil.",
  },
  cadence: {
    h: "La cadence de pump",
    p: "On pump à **≈ 1,29 Hz** (~77 pumps/minute). Le poignet capte cette fréquence proprement (le nombre & le rythme concordent avec la poussée du foil) — la détection de pump fonctionne donc correctement sur le principe.",
    cap: "Marqueurs de pump au poignet vs. pics de poussée du foil — même cadence (~1,3 Hz), les rythmes suivent.",
  },
  pitch: {
    h: "Orientation du foil : le tangage domine, poussée avant fore/aft",
    p: "En pumpant, tu bascules le foil **d’avant en arrière** via le bras de levier du mât de 85 cm (tangage), presque pas latéralement — dans les données, le tangage domine clairement le roulis. Et l’accélération du foil est majoritairement **fore/aft (poussée avant)**, pas verticale : le foil pousse vers l’avant quand tu appuies.",
    cap: "Orientation du foil sur le run : tangage (fore/aft) ≫ roulis. Le tangage et la charge verticale sont couplés.",
  },
  pics: {
    h: "De belles images",
    p: "Le tracé, coloré selon l’orientation du foil et la vitesse (blanc = 0°, rouge/bleu selon la direction) :",
    cap1: "Tracé de foiling selon l’angle de tangage, l’angle de roulis et la vitesse. Le foil garde en permanence le nez légèrement relevé (portance).",
    cap2: "Tracé selon la poussée avant (rouge=vers l’avant) — on voit chaque coup de pump — et les marqueurs de pump individuels sur le chemin.",
    cap3: "Tapis d’orientation : tangage / roulis / poussée avant dans le temps, d’un seul coup d’œil.",
  },
  learned: {
    h: "Ce que nous avons appris",
    li: [
      "La **détection de pump** capte bien la fréquence & le nombre (~1,29 Hz) — elle concorde avec la vérité du foil au mât (quelques % d’écart).",
      "La **détection on-foil** est bonne — elle indique précisément le ponton/décollage (elle s’aligne sur l’impulsion de décollage).",
      "**Phase de glisse / décélération** : c’est là qu’il y a le plus grand potentiel — « on-foil ∧ activité de pump ≈ 0 » pourrait signaler explicitement la glisse en fin de run.",
      "Tout cela est faisable **uniquement avec la montre au poignet** — la montre au mât n’était que la référence de vérité (terrain).",
    ],
  },
  limits: {
    h: "Limites (par honnêteté)",
    p: "La montre au mât est fortement amortie sous l’eau, elle ne voit donc les chocs francs qu’atténués. Les « angles » proviennent de la direction de la gravité (passe-bas) — en glisse stationnaire c’est l’orientation réelle, en cas d’accélération soutenue c’est légèrement faussé ; pour des angles de rotation parfaitement propres à 100 %, il faudrait un gyroscope. Et le décalage temporel exact des pumps individuels entre les montres n’a pas pu être fixé à moins de 100 ms (pas de point de référence commun net ; la FR55 n’a pas de GPS sous l’eau pour régler l’heure).",
  },
};

const it: N1 = {
  back: "← Indietro",
  next: "→ Parte 2: come funziona il riconoscimento",
  h1: "Analisi da nerd",
  subtitle:
    "Esperimento pumpfoil dual-watch · Illmensee, 27/06/2026 · dati grezzi di accelerazione, molta elaborazione del segnale e un po' di fisica del foil. Per chi vuole saperne di più.",
  intro:
    "Domanda: cosa si può davvero ricavare dai dati di movimento di una corsa pumpfoil — e possiamo usarli per migliorare il riconoscimento di pump, on-foil e planata? Per questo abbiamo registrato una corsa **contemporaneamente con due orologi**: uno al polso e uno **direttamente sul mast del foil, sott'acqua** — la «verità» su ciò che fa il foil.",
  aufbau: {
    h: "L'allestimento",
    p: "**fenix** al polso (25/100 Hz, buon GPS) — è l'orologio che avremo poi nel prodotto. **Forerunner 55** legato saldamente al mast del foil, **sott'acqua**, a testa in giù, con il pulsante di start rivolto nel senso di marcia. Entrambi giravano sulla nostra app recorder (v1.0.37). L'orologio sul mast non ha **GPS** sott'acqua — misura solo l'accelerazione grezza del foil.",
    alt1: "Foil con orologio sul mast al pontile",
    alt2: "FR55 sul mast — avvio automatico",
    alt3: "FR55 sul mast — ricerca GPS",
    altSpot: "Spot Illmensee al tramonto",
  },
  daten: {
    h: "I dati",
    p: "Invece dei chunk grezzi (che si interrompono sul debole FR55) abbiamo analizzato i **file FIT originali** da Garmin Connect: fenix **100 Hz**, mast **25 Hz**, ciascuno su tutta la corsa. Entrambi gli orologi sono sincronizzati tramite l'ora di sistema.",
  },
  start: {
    h: "La sequenza di partenza",
    p: "Dai dati si può ricostruire l'intera partenza (confermata da video): la tavola è **capovolta** al pontile → viene ruotata di **180°** e il foil immerso (in alto: l'assetto del FR55 ribalta da −1 a +1) → breve concentrazione → **spinta** con la mano dell'orologio → la mano **scatta in alto al momento del rilascio** (impulso al braccio di 4–6 g, energia di decollo) → **salto e atterraggio** sulla tavola → pump → volo.",
    cap1: "Il flip di 180° della tavola (la gravità del FR55 ribalta) e la zona di partenza nei 5 s successivi.",
    cap2: "Sequenza di partenza: flip della tavola, preparazione, push/salto, poi la rampa di velocità verso il foiling.",
  },
  truth: {
    h: "Pump, foiling, planata — la verità dal foil",
    p: "Il mast è sul foil e «sa» se si sta davvero pompando e se il foil sta ancora volando. Ben visibile nella decelerazione: prima cessa il **pump** (attività al polso → 0), ma la velocità si mantiene ancora → questa è la **fase di planata**; poi il foil si ribalta (escursione del mast) ed è finita. È proprio questa fase di planata che finora non riconosciamo esplicitamente.",
    cap: "GPS-Speed · attività pump al polso · pump del foil (mast) · assetto del foil. Alla fine: il pump si ferma → planata → foil-drop.",
  },
  cadence: {
    h: "La cadenza del pump",
    p: "Si pompa a **≈ 1,29 Hz** (~77 pump/minuto). Il polso coglie questa frequenza in modo pulito (numero e ritmo coincidono con la spinta del foil) — il riconoscimento del pump funziona quindi sostanzialmente in modo corretto.",
    cap: "Marker pump al polso vs. picchi di spinta del foil — stessa cadenza (~1,3 Hz), i ritmi si allineano.",
  },
  pitch: {
    h: "Assetto del foil: il beccheggio domina, spinta in avanti fore/aft",
    p: "Durante il pump inclini il foil sul braccio di leva del mast da 85 cm **avanti/indietro** (beccheggio), quasi mai lateralmente — nei dati il beccheggio domina chiaramente sul rollio. E l'accelerazione del foil è prevalentemente **fore/aft (spinta in avanti)**, non verticale: il foil spinge in avanti quando dai pressione.",
    cap: "Assetto del foil nella corsa: beccheggio (fore/aft) ≫ rollio. Pitch e carico verticale sono accoppiati.",
  },
  pics: {
    h: "Immagini interessanti",
    p: "Il track, colorato in base all'assetto del foil e alla velocità (bianco = 0°, rosso/blu per direzione):",
    cap1: "Track del foiling per angolo di beccheggio, angolo di rollio e velocità. Il foil mantiene costantemente il muso leggermente alto (portanza).",
    cap2: "Track per spinta in avanti (rosso=in avanti) — si vede ogni spinta di pump — e i singoli marker di pump lungo il percorso.",
    cap3: "Tappeto di assetto: beccheggio / rollio / spinta in avanti nel tempo, a colpo d'occhio.",
  },
  learned: {
    h: "Cosa abbiamo imparato",
    li: [
      "Il **riconoscimento del pump** coglie bene frequenza e numero (~1,29 Hz) — coincide con la verità del foil al mast (scarto di pochi %).",
      "Il **riconoscimento on-foil** è preciso — mostra con esattezza il pontile/decollo (si aggancia all'impulso di decollo).",
      "**Fase di planata / decelerazione**: qui c'è il potenziale maggiore — «on-foil ∧ attività pump ≈ 0» potrebbe indicare esplicitamente la planata finale.",
      "Tutto questo è realizzabile **solo con l'orologio al polso** — l'orologio sul mast era solo il riferimento di verità.",
    ],
  },
  limits: {
    h: "Limiti (per onestà)",
    p: "L'orologio sul mast è fortemente smorzato sott'acqua, perciò vede gli urti bruschi solo attenuati. Gli «angoli» derivano dalla direzione della gravità (passa-basso) — nella planata stazionaria è l'assetto reale, con accelerazione prolungata è leggermente falsato; per angoli di rotazione puliti al 100 % servirebbe un giroscopio. E lo sfasamento temporale preciso dei singoli pump tra i due orologi non è stato possibile fissarlo sotto i 100 ms (nessun punto fisso comune pulito; il FR55 sott'acqua non ha GPS per regolare l'orologio).",
  },
};

const es: N1 = {
  back: "← Volver",
  next: "→ Parte 2: cómo funciona la detección",
  h1: "Análisis para nerds",
  subtitle:
    "Experimento pumpfoil con dos relojes · Illmensee, 27/06/2026 · datos de aceleración en bruto, mucho procesamiento de señal y un poco de física del foil. Para quienes quieren saberlo con exactitud.",
  intro:
    "Pregunta: ¿qué se puede extraer realmente de los datos de movimiento de una carrera de pumpfoil — y podemos con ello mejorar la detección de pump, on-foil y planeo? Para eso registramos una carrera **simultáneamente con dos relojes**: uno en la muñeca y otro **directamente en el mástil del foil, bajo el agua** — la verdad sobre lo que hace el foil.",
  aufbau: {
    h: "El montaje",
    p: "**fenix** en la muñeca (25/100 Hz, buen GPS) — ese es el reloj que después tenemos en el producto. **Forerunner 55** amarrado al mástil del foil, **bajo el agua**, boca abajo, con el botón de inicio en el sentido de la marcha. Ambos corrían nuestra propia app de grabación (v1.0.37). El reloj del mástil no tiene **GPS** bajo el agua — solo mide la aceleración en bruto del foil.",
    alt1: "Foil con reloj en el mástil en el pantalán",
    alt2: "FR55 en el mástil — inicio automático",
    alt3: "FR55 en el mástil — búsqueda de GPS",
    altSpot: "Spot Illmensee al atardecer",
  },
  daten: {
    h: "Los datos",
    p: "En lugar de los chunks en bruto (que se cortaban en el débil FR55) evaluamos los **archivos FIT originales** de Garmin Connect: fenix **100 Hz**, mástil **25 Hz**, cada uno a lo largo de toda la carrera. Ambos relojes van sincronizados por la hora del sistema.",
  },
  start: {
    h: "La secuencia de arranque",
    p: "A partir de los datos se puede reconstruir el arranque completo (confirmado por vídeo): la tabla está **boca abajo** en el pantalán → se gira **180°** y se sumerge el foil (arriba: la orientación del FR55 pasa de −1 a +1) → concentrarse un instante → **empujar** con la mano del reloj → la mano **salta hacia arriba al soltar** (impulso de brazo de 4–6 g, energía de despegue) → **salto y aterrizaje** sobre la tabla → bombear → volar.",
    cap1: "El giro de 180° de la tabla (la gravedad del FR55 se vuelca) y la zona de arranque en los 5 s siguientes.",
    cap2: "Secuencia de arranque: giro de la tabla, preparación, empuje/salto, y luego la rampa de velocidad hacia el foiling.",
  },
  truth: {
    h: "Bombear, foilear, planear — la verdad desde el foil",
    p: "El mástil está en el foil y «sabe» si de verdad se está bombeando y si el foil aún vuela. Bien visible en el frenado: primero cesa el **bombeo** (actividad de muñeca → 0), pero la velocidad todavía se mantiene → esa es la **fase de planeo**; después el foil se vuelca (desviación del mástil) y se acabó. Precisamente esa fase de planeo no la detectamos aún de forma explícita.",
    cap: "Velocidad GPS · actividad de pump en muñeca · pump del foil (mástil) · orientación del foil. Al final: el bombeo se detiene → planeo → caída del foil.",
  },
  cadence: {
    h: "La cadencia de pump",
    p: "Se bombea a **≈ 1,29 Hz** (~77 pumps/minuto). La muñeca acierta esta tasa con limpieza (cantidad y compás coinciden con el empuje del foil) — así que la detección de pump funciona en lo esencial correctamente.",
    cap: "Marcadores de pump en muñeca vs. picos de empuje del foil — misma cadencia (~1,3 Hz), los compases se siguen.",
  },
  pitch: {
    h: "Orientación del foil: domina el cabeceo, empuje hacia delante fore/aft",
    p: "Al bombear inclinas el foil sobre la palanca del mástil de 85 cm **adelante/atrás** (cabeceo), apenas de lado — en los datos el cabeceo domina claramente sobre el alabeo. Y la aceleración del foil es predominantemente **fore/aft (empuje hacia delante)**, no vertical: el foil empuja hacia delante cuando aplicas presión.",
    cap: "Orientación del foil en la carrera: cabeceo (fore/aft) ≫ alabeo. El cabeceo y la carga vertical están acoplados.",
  },
  pics: {
    h: "Imágenes chulas",
    p: "El track, coloreado según la orientación del foil y la velocidad (blanco = 0°, rojo/azul según la dirección):",
    cap1: "Track de foiling según ángulo de cabeceo, ángulo de alabeo y velocidad. El foil mantiene de forma continua la nariz ligeramente arriba (sustentación).",
    cap2: "Track según empuje hacia delante (rojo=hacia delante) — se ve cada empuje de pump — y los marcadores de pump individuales sobre la trayectoria.",
    cap3: "Alfombra de orientación: cabeceo / alabeo / empuje hacia delante a lo largo del tiempo de un vistazo.",
  },
  learned: {
    h: "Lo que aprendimos",
    li: [
      "**La detección de pump** acierta la tasa y la cantidad bien (~1,29 Hz) — coincide con la verdad del foil en el mástil (pocos % de desviación).",
      "**La detección de on-foil** va bien — muestra con precisión el pantalán/despegue (encaja sobre el impulso de despegue).",
      "**Fase de planeo / frenado**: aquí está el mayor potencial — «on-foil ∧ actividad de pump ≈ 0» podría señalar de forma explícita el planeo al final.",
      "Todo esto es factible **solo con el reloj de muñeca** — el reloj del mástil fue únicamente la referencia de verdad.",
    ],
  },
  limits: {
    h: "Límites (por honestidad)",
    p: "El reloj del mástil está muy amortiguado bajo el agua, por eso ve los golpes bruscos solo atenuados. Los «ángulos» provienen de la dirección de la gravedad (paso bajo) — en el planeo estacionario reflejan la orientación real, con aceleración sostenida quedan algo falseados; para ángulos de giro 100 % limpios haría falta un giroscopio. Y el desfase temporal exacto de cada pump entre los relojes no se pudo fijar por debajo de 100 ms (sin un punto fijo común limpio; el FR55 no tiene GPS bajo el agua para poner en hora el reloj).",
  },
};

const fi: N1 = {
  back: "← Takaisin",
  next: "→ Osa 2: Miten tunnistus toimii",
  h1: "Nörttianalyysit",
  subtitle:
    "Kahden kellon pumpfoil-koe · Illmensee, 27.6.2026 · raakaa kiihtyvyysdataa, paljon signaalinkäsittelyä ja ripaus foil-fysiikkaa. Kaikille, jotka haluavat tietää tarkkaan.",
  intro:
    "Kysymys: mitä pumpfoil-ajon liikedatasta voi oikeasti lukea — ja voimmeko sen avulla parantaa pump-, on-foil- ja liuku-tunnistusta? Sitä varten nauhoitimme yhden ajon **samanaikaisesti kahdella kellolla**: toinen ranteessa ja toinen **suoraan foilin mastossa, veden alla** — „totuus“ siitä, mitä foil tekee.",
  aufbau: {
    h: "Kokoonpano",
    p: "**fenix** ranteessa (25/100 Hz, hyvä GPS) — se on kello, joka meillä on myöhemmin tuotteessa. **Forerunner 55** sidottuna foilin mastoon, **veden alla**, ylösalaisin, start-nappi kulkusuuntaan. Molemmat pyörivät omalla recorder-apilla (v1.0.37). Mastokellolla ei ole veden alla **GPS:ää** — se mittaa vain foilin raakaa kiihtyvyyttä.",
    alt1: "Foil ja mastokello laiturilla",
    alt2: "FR55 mastossa — automaattinen start",
    alt3: "FR55 mastossa — GPS-haku",
    altSpot: "Illmensee-spotti auringonlaskussa",
  },
  daten: {
    h: "Data",
    p: "Raakojen chunkkien (jotka katkeavat heikossa FR55:ssä) sijaan analysoimme **alkuperäiset FIT-tiedostot** Garmin Connectista: fenix **100 Hz**, masto **25 Hz**, kumpikin koko ajon ajalta. Molemmat kellot pysyvät synkassa järjestelmäajan kautta.",
  },
  start: {
    h: "Aloitussekvenssi",
    p: "Datasta voi rekonstruoida koko lähdön (varmennettu videolla): board on **ylösalaisin** laiturilla → sitä käännetään **180°** ja foil upotetaan (ylhäällä: FR55:n asento kääntyy −1:stä +1:een) → hetki keskittymistä → **työntö** kellokädellä → käsi **nykäisee ylös irrotuksessa** (4–6 g käsivarren sysäys, hyppyenergia) → **hyppy & lasku** boardille → pumppaus → lento.",
    cap1: "Boardin 180°-flippi (FR55:n gravitaatio kääntyy) ja aloitusvyöhyke seuraavien 5 s aikana.",
    cap2: "Aloitussekvenssi: boardin flippi, valmistautuminen, työntö/hyppy, sitten nopeusramppi foilaukseen.",
  },
  truth: {
    h: "Pumppaus, foilaus, liuku — totuus foililta",
    p: "Masto istuu foilissa ja „tietää“, pumpataanko todella ja lentääkö foil vielä. Hienosti näkyvissä hidastuksessa: ensin **pumppaus loppuu** (ranneaktiivisuus → 0), mutta nopeus pysyy vielä → se on **liukuvaihe**; sitten foil kaatuu pois (maston heilahdus) ja se on ohi. Juuri tätä liukuvaihetta emme vielä tunnista eksplisiittisesti.",
    cap: "GPS-nopeus · ranteen pump-aktiivisuus · foilin pump (masto) · foilin asento. Lopussa: pumppaus pysähtyy → liuku → foil-drop.",
  },
  cadence: {
    h: "Pump-kadenssi",
    p: "Pumpataan noin **≈ 1,29 Hz** (~77 pumppausta/minuutti). Ranne osuu tähän tahtiin puhtaasti (määrä & tahti täsmäävät foilin työntöön) — pump-tunnistus toimii siis periaatteessa oikein.",
    cap: "Ranteen pump-merkit vs. foilin työntöpiikit — sama kadenssi (~1,3 Hz), tahdit seuraavat.",
  },
  pitch: {
    h: "Foilin asento: nyökkäys hallitsee, työntö fore/aft",
    p: "Pumpatessa kallistat foilia 85 cm:n mastovivun yli **eteen/taakse** (nyökkäys), tuskin lainkaan sivuttain — datassa nyökkäys hallitsee selvästi kallistusta. Ja foilin kiihtyvyys on pääosin **fore/aft (työntö)**, ei pystysuora: foil työntyy eteenpäin, kun annat painetta.",
    cap: "Foilin asento ajon aikana: nyökkäys (fore/aft) ≫ kallistus. Pitch ja pystykuorma ovat kytkeytyneet.",
  },
  pics: {
    h: "Siistejä kuvia",
    p: "Track, väritettynä foilin asennon ja nopeuden mukaan (valkoinen = 0°, punainen/sininen suunnan mukaan):",
    cap1: "Foilaus-track nyökkäyskulman, kallistuskulman ja nopeuden mukaan. Foil pitää koko ajan nokan hieman ylhäällä (nostovoima).",
    cap2: "Track työnnön mukaan (punainen=eteenpäin) — näkee jokaisen pump-työnnön — sekä yksittäiset pump-merkit polulla.",
    cap3: "Asento-matto: nyökkäys / kallistus / työntö ajan yli yhdellä silmäyksellä.",
  },
  learned: {
    h: "Mitä opimme",
    li: [
      "**Pump-tunnistus** osuu tahtiin & määrään hyvin (~1,29 Hz) — täsmää maston foil-totuuteen (muutaman % poikkeama).",
      "**On-foil-tunnistus** on kohdallaan — se osoittaa laiturin/lähdön tarkasti (napsahtaa lähtösysäykseen).",
      "**Liukuvaihe / hidastus**: tässä on suurin potentiaali — „on-foil ∧ pump-aktiivisuus ≈ 0“ voisi merkitä liu'un lopussa eksplisiittisesti.",
      "Kaikki tämä on tehtävissä **pelkällä rannekellolla** — mastokello oli vain totuusreferenssi.",
    ],
  },
  limits: {
    h: "Rajat (rehellisyyden vuoksi)",
    p: "Mastokello on veden alla voimakkaasti vaimennettu, joten se näkee terävät sysäykset vain heikentyneinä. „Kulmat“ tulevat gravitaation suunnasta (alipäästö) — vakaassa liu'ussa todellinen asento, jatkuvassa kiihtyvyydessä hieman vääristynyt; 100 % puhtaisiin kiertokulmiin tarvittaisiin gyroskooppi. Eikä yksittäisten pumppausten tarkkaa aikaeroa kellojen välillä saatu naulattua alle 100 ms:iin (ei puhdasta yhteistä kiintopistettä; FR55:llä ei ole veden alla GPS:ää kellon asettamiseen).",
  },
};

const nl: N1 = {
  back: "← Terug",
  next: "→ Deel 2: Hoe de detectie werkt",
  h1: "Nerd-analyses",
  subtitle:
    "Dual-watch-pumpfoil-experiment · Illmensee, 27-06-2026 · ruwe versnellingsdata, veel signaalverwerking en een beetje foil-fysica. Voor iedereen die het precies wil weten.",
  intro:
    "Vraag: wat kun je echt aflezen uit de bewegingsdata van een pumpfoil-run — en kunnen we daarmee de pump-, on-foil- en glijdetectie verbeteren? Daarvoor hebben we een run **tegelijkertijd met twee horloges** opgenomen: één om de pols en één **direct op de foil-mast, onder water** — de ‘waarheid’ over wat de foil doet.",
  aufbau: {
    h: "De opstelling",
    p: "**fenix** om de pols (25/100 Hz, goede GPS) — dat is het horloge dat we later in het product hebben. **Forerunner 55** vastgesjord op de foil-mast, **onder water**, ondersteboven, met de startknop in de vaarrichting. Beide draaiden op onze eigen recorder-app (v1.0.37). Het mast-horloge heeft onder water **geen GPS** — het meet alleen de ruwe versnelling van de foil.",
    alt1: "Foil met mast-horloge op de steiger",
    alt2: "FR55 op de mast — auto-start",
    alt3: "FR55 op de mast — GPS-zoeken",
    altSpot: "Spot Illmensee bij zonsondergang",
  },
  daten: {
    h: "De data",
    p: "In plaats van de ruwe chunks (die op de zwakke FR55 afbreken) hebben we de **originele FIT-bestanden** uit Garmin Connect geanalyseerd: fenix **100 Hz**, mast **25 Hz**, telkens over de hele run. Beide horloges lopen via de systeemtijd synchroon.",
  },
  start: {
    h: "De startsequentie",
    p: "Uit de data laat zich de complete start reconstrueren (per video bevestigd): het board ligt **ondersteboven** op de steiger → wordt **180° gedraaid** en de foil te water gelaten (boven: FR55-oriëntatie kantelt van −1 naar +1) → even concentreren → **aanduwen** met de horloge-hand → de hand **schiet bij het loslaten omhoog** (4–6 g arm-impuls, sprongenergie) → **sprong & landing** op het board → pompen → vliegen.",
    cap1: "De 180°-flip van het board (FR55-zwaartekracht kantelt) en de startzone in de 5 s erna.",
    cap2: "Startsequentie: board-flip, voorbereiden, push/sprong, dan de speed-ramp het foilen in.",
  },
  truth: {
    h: "Pompen, foilen, glijden — de waarheid van de foil",
    p: "De mast zit op de foil en ‘weet’ of er echt gepompt wordt en of de foil nog vliegt. Mooi zichtbaar bij het uitlopen: eerst stopt het **pompen** (pols-activiteit → 0), maar de snelheid houdt nog aan → dat is de **glijfase**; daarna kiept de foil weg (mast-uitslag) en is het voorbij. Precies deze glijfase detecteren we tot nu toe niet expliciet.",
    cap: "GPS-snelheid · pols-pump-activiteit · foil-pump (mast) · foil-oriëntatie. Aan het einde: pompen stopt → glijden → foil-drop.",
  },
  cadence: {
    h: "De pump-cadans",
    p: "Er wordt gepompt met **≈ 1,29 Hz** (~77 pumps/minuut). De pols treft deze rate netjes (aantal & ritme komen overeen met de foil-stuwing) — de pump-detectie werkt dus in de basis correct.",
    cap: "Pols-pump-markers vs. foil-stuwingspieken — dezelfde cadans (~1,3 Hz), de ritmes volgen elkaar.",
  },
  pitch: {
    h: "Foil-oriëntatie: stampen domineert, voortstuwing fore/aft",
    p: "Bij het pompen kantel je de foil via de 85-cm-masthefboom **voor/achter** (stampen), nauwelijks zijwaarts — in de data domineert de stampbeweging duidelijk over het rollen. En de versnelling van de foil is overwegend **fore/aft (voortstuwing)**, niet verticaal: de foil duwt naar voren als je druk geeft.",
    cap: "Foil-oriëntatie in de run: stampen (fore/aft) ≫ rollen. Pitch en verticale belasting zijn gekoppeld.",
  },
  pics: {
    h: "Coole beelden",
    p: "De track, ingekleurd naar foil-oriëntatie en snelheid (wit = 0°, rood/blauw per richting):",
    cap1: "Foiling-track naar stamphoek, rolhoek en snelheid. De foil houdt continu de neus licht omhoog (lift).",
    cap2: "Track naar voortstuwing (rood=voorwaarts) — je ziet elke pump-stuwing — en de afzonderlijke pump-markers op het pad.",
    cap3: "Oriëntatie-tapijt: stampen / rollen / voortstuwing over de tijd in één oogopslag.",
  },
  learned: {
    h: "Wat we hebben geleerd",
    li: [
      "**Pump-detectie** treft rate & aantal goed (~1,29 Hz) — komt overeen met de foil-waarheid op de mast (enkele % afwijking).",
      "**On-foil-detectie** zit goed — ze toont de steiger/afsprong precies (snapt op de opsprong-impuls).",
      "**Glijfase / uitlopen**: hier zit het grootste potentieel — ‘on-foil ∧ pump-activiteit ≈ 0’ zou het glijden aan het einde expliciet kunnen markeren.",
      "Dit alles kan **alleen met het pols-horloge** — het mast-horloge was slechts de waarheidsreferentie.",
    ],
  },
  limits: {
    h: "Grenzen (voor de eerlijkheid)",
    p: "Het mast-horloge wordt onder water sterk gedempt, daardoor ziet het scherpe stoten alleen afgezwakt. De ‘hoeken’ komen uit de zwaartekrachtrichting (laagdoorlaat) — in stationair glijden echte oriëntatie, bij aanhoudende versnelling licht vertekend; voor 100 % zuivere draaihoeken zou je een gyroscoop nodig hebben. En de exacte tijdverschuiving van afzonderlijke pumps tussen de horloges was niet op < 100 ms vast te pinnen (geen zuiver gemeenschappelijk fixpunt; de FR55 heeft onder water geen GPS om de klok gelijk te zetten).",
  },
};

const cs: N1 = {
  back: "← Zpět",
  next: "→ Část 2: Jak funguje detekce",
  h1: "Nerd analýzy",
  subtitle:
    "Experiment s pumpfoilem a dvěma hodinkami · Illmensee, 27.06.2026 · surová data zrychlení, spousta zpracování signálu a trocha fyziky foilu. Pro všechny, kdo to chtějí vědět přesně.",
  intro:
    "Otázka: Co se dá z pohybových dat jedné pumpfoilové jízdy skutečně vyčíst — a můžeme tím zlepšit detekci pumpnutí, jízdy na foilu a klouzání? Proto jsme jednu jízdu zaznamenali **současně dvěma hodinkami**: jedny na zápěstí a druhé **přímo na stěžni foilu, pod vodou** — „pravda“ o tom, co foil dělá.",
  aufbau: {
    h: "Sestava",
    p: "**fenix** na zápěstí (25/100 Hz, dobré GPS) — to jsou hodinky, které budeme mít později v produktu. **Forerunner 55** pevně přivázané ke stěžni foilu, **pod vodou**, hlavou dolů, se startovacím tlačítkem ve směru jízdy. Obě běžely na naší vlastní záznamové aplikaci (v1.0.37). Hodinky na stěžni nemají pod vodou **žádné GPS** — měří jen surové zrychlení foilu.",
    alt1: "Foil s hodinkami na stěžni u mola",
    alt2: "FR55 na stěžni — automatický start",
    alt3: "FR55 na stěžni — hledání GPS",
    altSpot: "Spot Illmensee při západu slunce",
  },
  daten: {
    h: "Data",
    p: "Místo surových chunků (které se na slabé FR55 přerušují) jsme vyhodnotili **původní FIT soubory** z Garmin Connect: fenix **100 Hz**, stěžeň **25 Hz**, vždy přes celou jízdu. Obě hodinky jsou synchronizované přes systémový čas.",
  },
  start: {
    h: "Startovací sekvence",
    p: "Z dat se dá zrekonstruovat celý start (potvrzeno videem): Prkno leží **hlavou dolů** u mola → otočí se o **180°** a foil se ponoří (nahoře: poloha FR55 se překlopí z −1 na +1) → krátké soustředění → **odstrčení** rukou s hodinkami → ruka se **při puštění vymrští nahoru** (4–6 g impuls paže, energie skoku) → **skok a dopad** na prkno → pumpování → let.",
    cap1: "Překlopení prkna o 180° (gravitace na FR55 se překlápí) a startovní zóna v následujících 5 s.",
    cap2: "Startovací sekvence: překlopení prkna, příprava, odstrčení/skok, pak rychlostní rampa do foilování.",
  },
  truth: {
    h: "Pumpování, foilování, klouzání — pravda z foilu",
    p: "Stěžeň sedí na foilu a „ví“, jestli se opravdu pumpuje a jestli foil ještě letí. Krásně je to vidět při dojíždění: nejdřív **přestane pumpování** (aktivita zápěstí → 0), rychlost se ale ještě drží → to je **fáze klouzání**; poté foil odpadne (výkyv stěžně) a je konec. Právě tuto fázi klouzání zatím explicitně nedetekujeme.",
    cap: "Rychlost GPS · aktivita pumpování na zápěstí · pumpnutí foilu (stěžeň) · poloha foilu. Na konci: pumpování se zastaví → klouzání → pád foilu.",
  },
  cadence: {
    h: "Kadence pumpování",
    p: "Pumpuje se s frekvencí **≈ 1,29 Hz** (~77 pumpnutí za minutu). Zápěstí tuto frekvenci trefuje čistě (počet i takt souhlasí s tahem foilu) — detekce pumpnutí tedy v zásadě funguje správně.",
    cap: "Značky pumpnutí ze zápěstí vs. špičky tahu foilu — stejná kadence (~1,3 Hz), takty se shodují.",
  },
  pitch: {
    h: "Poloha foilu: dominuje klopení, tah fore/aft",
    p: "Při pumpování překlápíš foil přes 85cm páku stěžně **dopředu/dozadu** (klopení), sotva do stran — v datech klopení jasně dominuje nad klonivým pohybem. A zrychlení foilu je převážně **fore/aft (tah dopředu)**, ne vertikální: foil se posouvá dopředu, když zatlačíš.",
    cap: "Poloha foilu během jízdy: klopení (fore/aft) ≫ klonění. Klopení a vertikální zatížení jsou provázané.",
  },
  pics: {
    h: "Zajímavé obrázky",
    p: "Trasa obarvená podle polohy foilu a rychlosti (bílá = 0°, červená/modrá podle směru):",
    cap1: "Foilová trasa podle úhlu klopení, úhlu klonění a rychlosti. Foil drží po celou dobu lehce nos nahoru (vztlak).",
    cap2: "Trasa podle tahu (červená=dopředu) — je vidět každý tah pumpnutí — a jednotlivé značky pumpnutí na dráze.",
    cap3: "Koberec polohy: klopení / klonění / tah v čase na jeden pohled.",
  },
  learned: {
    h: "Co jsme se naučili",
    li: [
      "**Detekce pumpnutí** trefuje frekvenci i počet dobře (~1,29 Hz) — kryje se s pravdou foilu na stěžni (odchylka pár %).",
      "**Detekce jízdy na foilu** sedí dobře — ukazuje molo/odraz přesně (přichytne se k impulsu naskočení).",
      "**Fáze klouzání / dojíždění**: tady je největší potenciál — „na foilu ∧ aktivita pumpování ≈ 0“ by mohlo klouzání na konci explicitně vykázat.",
      "Všechno tohle je proveditelné **jen s hodinkami na zápěstí** — hodinky na stěžni byly jen referencí pravdy.",
    ],
  },
  limits: {
    h: "Meze (pro poctivost)",
    p: "Hodinky na stěžni jsou pod vodou silně tlumené, proto vidí ostré rázy jen zeslabené. „Úhly“ pocházejí ze směru gravitace (dolní propust) — při ustáleném klouzání skutečná poloha, při trvalém zrychlení lehce zkreslená; pro 100% čisté úhly natočení by byl potřeba gyroskop. A přesný časový posun jednotlivých pumpnutí mezi hodinkami se nepodařilo přibít na < 100 ms (žádný čistý společný pevný bod; FR55 nemá pod vodou GPS k nastavení času).",
  },
};

// Partial: Langform-Nerd-Inhalte gibt es nur in einem Teil der Sprachen; fehlende fallen im
// Consumer auf `de` zurück (NERD1[lang] ?? NERD1.de). Neue UI-Sprachen ohne Nerd-Text = OK.

const id: N1 = {
  "back": "← Kembali",
  "next": "→ Bagian 2: Cara Deteksi Bekerja",
  "h1": "Analisis Nerd",
  "subtitle": "Eksperimen dual-watch pumpfoil · Illmensee, 27 Juni 2026 · data akselerasi mentah, banyak pemrosesan sinyal dan sedikit fisika foil. Untuk semua orang yang ingin tahu persis.",
  "intro": "Pertanyaan: Apa sebenarnya yang bisa dibaca dari data gerakan lari pumpfoil — dan dapatkah kita menggunakannya untuk meningkatkan deteksi pump, on-foil, dan glide? Untuk itu kami merekam lari **secara bersamaan dengan dua jam tangan**: satu di pergelangan tangan dan satu **langsung di mast foil, di bawah air** — kebenaran dasar tentang apa yang dilakukan foil.",
  "aufbau": {
    "h": "Penyiapannya",
    "p": "**fenix** di pergelangan tangan (25/100 Hz, GPS bagus) — itulah jam tangan yang akan kami miliki di produk nanti. **Forerunner 55** terikat pada mast foil, **di bawah air**, terbalik, dengan tombol start menunjuk ke arah perjalanan. Keduanya menjalankan aplikasi recorder kami sendiri (v1.0.37). Jam tangan mast **tidak punya GPS** di bawah air — hanya mengukur akselerasi mentah foil.",
    "alt1": "Foil dengan jam tangan mast di jeti",
    "alt2": "FR55 di mast — auto-start",
    "alt3": "FR55 di mast — pencarian GPS",
    "altSpot": "Spot Illmensee saat matahari terbenam"
  },
  "daten": {
    "h": "Data-nya",
    "p": "Alih-alih chunk mentah (yang putus di FR55 yang lemah) kami mengevaluasi **file FIT asli** dari Garmin Connect: fenix **100 Hz**, mast **25 Hz**, masing-masing selama seluruh lari. Kedua jam tangan tetap sinkron melalui waktu sistem."
  },
  "start": {
    "h": "Urutan awal",
    "p": "Awal yang lengkap dapat direkonstruksi dari data (dikonfirmasi dengan video): papan berbaring **terbalik** di jeti → diputar **180°** dan foil dicelupkan (atas: orientasi FR55 berubah dari −1 menjadi +1) → fokus sebentar → **tolakan** dengan tangan jam tangan → tangan **menyentil naik saat melepas** (dorong lengan 4–6 g, energi lompatan) → **lompatan & pendaratan** di papan → memompa → terbang.",
    "cap1": "Pembalikkan 180° papan (gravitasi FR55 berubah) dan zona awal dalam 5 detik setelahnya.",
    "cap2": "Urutan awal: pembalikan papan, persiapan, dorakan/lompatan, kemudian rampa kecepatan ke foiling."
  },
  "truth": {
    "h": "Memompa, foiling, meluncur — kebenaran dari foil",
    "p": "Mast duduk di foil dan \"tahu\" apakah benar-benar memompa terjadi dan apakah foil masih terbang. Terlihat jelas pada saat peluncuran: pertama **pemompaan berhenti** (aktivitas pergelangan tangan → 0), tetapi kecepatan masih terjaga → itu adalah **fase glide**; setelahnya foil jatuh (defleksi mast) dan selesai. Persis fase glide inilah yang belum kami deteksi secara eksplisit.",
    "cap": "Kecepatan GPS · aktivitas pump pergelangan tangan · pump foil (mast) · orientasi foil. Di akhir: pompa berhenti → meluncur → foil jatuh."
  },
  "cadence": {
    "h": "Kadence pompa",
    "p": "Pemompaan terjadi pada **≈ 1,29 Hz** (~77 pompa/menit). Pergelangan tangan mengenai tingkat ini dengan bersih (jumlah & waktu cocok dengan dorongan foil) — jadi deteksi pump pada dasarnya bekerja dengan benar.",
    "cap": "Penanda pump pergelangan tangan vs. puncak dorongan foil — kadence yang sama (~1,3 Hz), ketukan melacak."
  },
  "pitch": {
    "h": "Orientasi foil: pitch mendominasi, dorongan ke depan fore/aft",
    "p": "Saat memompa Anda menggoyangkan foil ke depan/belakang di atas lever mast 85-cm **maju/mundur** (pitch), hampir tidak ada ke samping — dalam data pitch jelas mendominasi gerakan roll. Dan akselerasi foil sebagian besar adalah **fore/aft (dorongan)**, bukan vertikal: foil mendorong maju saat Anda memberikan tekanan.",
    "cap": "Orientasi foil selama lari: pitch (fore/aft) ≫ roll. Pitch dan beban vertikal terkopel."
  },
  "pics": {
    "h": "Gambar bagus",
    "p": "Trek, berwarna menurut orientasi foil dan kecepatan (putih = 0°, merah/biru per arah):",
    "cap1": "Trek foiling menurut sudut pitch, sudut roll dan kecepatan. Foil mempertahankan sikap hidung sedikit naik di seluruh (lift).",
    "cap2": "Trek menurut dorongan (merah=maju) — Anda bisa melihat setiap dorongan pompa — plus penanda pompa individual di jalur.",
    "cap3": "Karpet orientasi: pitch / roll / dorongan sepanjang waktu sekilas."
  },
  "learned": {
    "h": "Apa yang kami pelajari",
    "li": [
      "**Deteksi pump** mengenai laju & jumlah dengan baik (~1,29 Hz) — cocok dengan kebenaran foil di mast (beberapa % deviasi).",
      "**Deteksi on-foil** sempurna — menunjukkan jeti/takeoff dengan presisi (mendetik pada impuls takeoff).",
      "**Fase glide / peluncuran**: di sini potensi terbesar terletak — \"on-foil ∧ aktivitas pump ≈ 0\" dapat secara eksplisit menandai gliding di akhir.",
      "Semuanya ini dapat dilakukan **hanya dengan jam tangan pergelangan tangan** — jam tangan mast hanya referensi kebenaran."
    ]
  },
  "limits": {
    "h": "Batas (untuk kejujuran)",
    "p": "Jam tangan mast teredam kuat di bawah air, jadi hanya melihat dorongan tajam yang melemah. \"Sudut\" berasal dari arah gravitasi (low-pass) — orientasi asli dalam gliding stasioner, sedikit terdistorsi di bawah akselerasi berkelanjutan; untuk sudut rotasi 100% bersih Anda memerlukan giroskop. Dan offset waktu yang tepat dari pompa individual antara jam tangan tidak bisa dipaku ke < 100 ms (tidak ada titik tetap bersama yang jelas; FR55 tidak memiliki GPS di bawah air untuk mengatur jamnya)."
  }
};


const ja: N1 = {
  "back": "← 戻る",
  "next": "→ パート2：検出がどう機能するか",
  "h1": "ナード向け分析",
  "subtitle": "デュアルウォッチpumpfoil実験 · Illmensee, 2026年6月27日 · 生の加速度データ、大量の信号処理、ちょっとのフォイル物理学。本当のところを知りたい人全員向け。",
  "intro": "質問：pumpfoilラン中の動きデータから本当に何が読み取れるか — そしてそれを使ってポンプ検出、オンフォイル検出、グライド検出を改善できるか？そのために、**同時に2つのウォッチで**一度のランを記録しました：1つはリスト上、もう1つは**フォイルマストの真下、水中** — フォイルが本当に何をしているかについての本当の真実です。",
  "aufbau": {
    "h": "セットアップ",
    "p": "リスト上の**fenix**（25/100 Hz、優れたGPS） — これは後で製品に搭載されるウォッチです。**Forerunner 55**はフォイルマストに固定されて、**水中**、上下逆さまに、スタートボタンが進行方向を向くようにしてあります。両方とも自社のレコーダーアプリ（v1.0.37）を実行しました。マストウォッチは水中では**GPS がありません** — フォイルの生の加速度だけを測定します。",
    "alt1": "桟橋のマストウォッチ付きフォイル",
    "alt2": "マスト上のFR55 — オートスタート",
    "alt3": "マスト上のFR55 — GPS 検索",
    "altSpot": "日没のIllmenseeスポット"
  },
  "daten": {
    "h": "データ",
    "p": "（弱いFR55で途中で途絶える）生のチャンク の代わりに、Garmin Connectから**オリジナルのFITファイル**を分析しました：fenix **100 Hz**、マスト**25 Hz**、それぞれランの全体にわたって。両ウォッチはシステム時刻で同期しています。"
  },
  "start": {
    "h": "スタートシーケンス",
    "p": "データから完全なスタートが再構成できます（ビデオで確認済み）：ボードは桟橋で**逆さまに置いてあり** → **180°回転**してフォイルが浸される（上：FR55の方向が−1から+1に反転）→ 短く集中する → ウォッチ手で**押す** → 手が**リリース時に高くはじける**（4～6 gのアーム衝撃、跳躍エネルギー）→ **ジャンプ＆着地**ボード上 → ポンプ → フライング。",
    "cap1": "ボードの180°フリップ（FR55の重力が反転）とその後の5秒以内のスタートゾーン。",
    "cap2": "スタートシーケンス：ボードフリップ、準備、プッシュ/ジャンプ、その後フォイリングへのスピード上昇。"
  },
  "truth": {
    "h": "ポンプ、フォイリング、グライド — フォイルからの本当の真実",
    "p": "マストはフォイルの上に座り、本当にポンプがかけられているか、フォイルがまだフライしているかを「知っています」。ラン終了時に素晴らしく見えます：まず**ポンプが停止し**（リスト活動 → 0）、スピードはまだ保持される → これが**グライド段階**です；その後フォイルがドロップし（マスト偏向）、終了です。これはまさに私たちがまだ明示的に検出しないグライド段階です。",
    "cap": "GPSスピード · リスト・ポンプ活動 · フォイル・ポンプ（マスト） · フォイル姿勢。終了時：ポンプ停止 → グライド → フォイルドロップ。"
  },
  "cadence": {
    "h": "ポンプ・ケイデンス",
    "p": "ポンプは**≈ 1.29 Hz**（～77ポンプ/分）でかけられます。リストがこのレートをきちんと当てます（数と拍子がフォイル推力と一致） — つまりポンプ検出は基本的に正しく機能します。",
    "cap": "リスト・ポンプ・マーカーvs.フォイル・スラスト・ピークス — 同じケイデンス（~1.3 Hz）、拍子が追従。"
  },
  "pitch": {
    "h": "フォイル姿勢：ピッチが優位、前後の推力",
    "p": "ポンプする時、85 cmのマストレバーで**前後に**フォイルを傾けます（ピッチ）、横にはほぼ傾けません — データではピッチ運動がロール運動を明確に支配します。そしてフォイルの加速度は主に**前後（サージ）**で、垂直ではありません：圧力をかけると、フォイルは前方へ押します。",
    "cap": "ランにおけるフォイル姿勢：ピッチ（前後）≫ ロール。ピッチと垂直荷重は結合されています。"
  },
  "pics": {
    "h": "クールな写真",
    "p": "フォイル姿勢とスピードで色分けされたトラック（白 = 0°、赤/青は方向）：",
    "cap1": "ピッチ角、ロール角、スピードによるフォイリングトラック。フォイルは全体にわたってわずかに鼻を上げた姿勢を保ちます（揚力）。",
    "cap2": "サージ別トラック（赤=前方）— すべてのポンプ推力が見えます — およびパス上の個々のポンプマーカー。",
    "cap3": "姿勢カーペット：ピッチ / ロール / 推力を時間軸で一目で。"
  },
  "learned": {
    "h": "学んだこと",
    "li": [
      "**ポンプ検出**はレートと数をよく打つ（~1.29 Hz） — マストでのフォイル真実と一致（数％の偏差）。",
      "**オンフォイル検出**は万全 — 桟橋/テイクオフを正確に指摘します（テイクオフインパルスにスナップします）。",
      "**グライド段階 / ラン終了**：ここが最大の可能性 — 「オンフォイル ∧ ポンプ活動 ≈ 0」で終わりのグライドを明示的にフラグできます。",
      "これはすべて**リストウォッチだけで**可能 — マストウォッチは真実参照でしかありませんでした。"
    ]
  },
  "limits": {
    "h": "限界（正直さのために）",
    "p": "マストウォッチは水中で大きく減衰するため、鋭い衝撃は減衰した形でしか見えません。「角度」は重力方向から来ます（ローパス） — 定常グライド中の本当の姿勢、持続加速度下ではやや歪みます；100%クリーンな回転角には ジャイロスコープが必要です。そしてウォッチ間の個々のポンプの正確な時間オフセットを100 msより小さく特定できませんでした（クリーンな共通の固定点がない；FR55は水中でウォッチを設定するGPSがない）。"
  }
};


const nb: N1 = {
  "back": "← Tilbake",
  "next": "→ Del 2: Hvordan gjenkjenningen fungerer",
  "h1": "Nerd-analyser",
  "subtitle": "Dobbelt-klokkeforsøk med pumpfoil · Illmensee, 27.06.2026 · råe akselerasjonsdata, mye signalbehandling og litt foil-fysikk. For alle som vil vite sannheten.",
  "intro": "Spørsmål: Hva kan vi egentlig lese ut fra bevegelsesdataene fra en pumpfoil-tur — og kan vi bruke det til å forbedre pump-, on-foil- og glidfasegjenkjenningen? For å finne ut det målte vi én tur **samtidig med to klokker**: én på håndleddet og én **direkte på foil-masten, under vann** — «sannheten» om det foilen gjør.",
  "aufbau": {
    "h": "Oppsettet",
    "p": "**fenix** på håndleddet (25/100 Hz, godt GPS) — det er klokken vi har i produktet senere. **Forerunner 55** festet til foil-masten, **under vann**, over hodet, med startknappen i kjøreretningen. Begge kjørte på vår egen recorder-app (v1.0.37). Mast-klokken har under vann **ingen GPS** — den måler bare foilens rå akselerasjon.",
    "alt1": "Foil med mast-klokke på bryggen",
    "alt2": "FR55 på masten — autostart",
    "alt3": "FR55 på masten — GPS-søk",
    "altSpot": "Spot Illmensee ved solnedgang"
  },
  "daten": {
    "h": "Dataene",
    "p": "Istedenfor de (på FR55s svake processor) avsluttende rå-chunkene analyserte vi **originalens FIT-filer** fra Garmin Connect: fenix **100 Hz**, mast **25 Hz**, hele turen for begge. Begge klokker kjørte synkront over systemtiden."
  },
  "start": {
    "h": "Startsekvensen",
    "p": "Fra dataene kan vi rekonstruere hele starten (bekreftet på video): Brettet ligger **på hodet** på bryggen → blir **snudd 180°** og foilen senket ned (ovenfor: FR55-gravitasjonen kipper fra −1 til +1) → kort konsentrasjon → **dytt** med klokka-hånden → hånden **slipper med et klikk** (4–6 g arm-støt, hoppenergien) → **hopp & landing** på brettet → pumping → flyvning.",
    "cap1": "180°-vendig av brettet (FR55-gravitasjonen kipper) og start-sonen i de 5 sekundene etterpå.",
    "cap2": "Startsekvens: brett-flip, forberedelse, dytt/hopp, så speed-rampen inn i foiling."
  },
  "truth": {
    "h": "Pumping, foiling, gliding — sannheten fra foilen",
    "p": "Masten sitter på foilen og «vet» om det virkelig blir pumpet og om foilen fortsatt flyr. Det er flott synlig ved utløpet: først slutter **pumpingen** (wrist-aktivitet → 0), men farten holder seg → det er **glidesfasen**; deretter kipper foilen av (mast-utslag) og det er over. Akkurat denne glidesfasen gjenkjenner vi foreløpig ikke eksplisitt.",
    "cap": "GPS-fart · Wrist-pump-aktivitet · Foil-pump (mast) · Foil-posisjon. Til slutt: pumping stopper → gliding → foil-fall."
  },
  "cadence": {
    "h": "Pump-kadensen",
    "p": "Det pumpes med **≈ 1,29 Hz** (~77 pumps/minute). Håndleddet treffer denne raten veldig bra (antall og takt stemmer med foil-tøyet) — så pump-gjenkjenningen fungerer grunnleggende riktig.",
    "cap": "Wrist-pump-markører versus foil-tøy-topper — samme kadense (~1,3 Hz), takter følger etter."
  },
  "pitch": {
    "h": "Foil-posisjon: Nickling dominerer, fremover fore/aft",
    "p": "Når du pumper kipper du foilen over 85-cm-mast-spaken **fremover/bakover** (nickling), knapt sideveis — i dataene dominerer nickling langt over roll-bevegelsen. Og akselerasjonen av foilen er hovedsakelig **fore/aft (fremdrift)**, ikke vertikal: foilen skyver fremover når du gir trykk.",
    "cap": "Foil-posisjon gjennom turen: Nickling (fore/aft) ≫ Roll. Pitch og vertikal last er koblet."
  },
  "pics": {
    "h": "Kule bilder",
    "p": "Sporet, farget etter foil-posisjon og fart (hvit = 0°, rød/blå hver retning):",
    "cap1": "Foiling-spor etter nickvinkel, rollvinkel og speed. Foilen holder hele tiden litt neseopp (løft).",
    "cap2": "Spor etter fremdrift (rød=fremover) — du ser hver pump-tøy — og de individuelle pump-markørene på stien.",
    "cap3": "Posisjon-teppe: Nickling / Roll / Fremdrift over tid på ett øyeblikk."
  },
  "learned": {
    "h": "Hva vi lærte",
    "li": [
      "**Pump-gjenkjenning** treffer rate og antall bra (~1,29 Hz) — stemmer overens med foilens sannhet på masten (få % avvik).",
      "**On-foil-gjenkjenning** fungerer bra — den viser bryggen/avsprånget presist (snapper på hoppeimpulsen).",
      "**Glidfase / utløp**: her er det største potensialet — «On-foil ∧ Pump-aktivitet ≈ 0» kunne gjøre glidingen på slutten eksplisitt.",
      "Alt dette er **bare mulig med håndledds-klokken** — mast-klokken var bare sannhets-referansen."
    ]
  },
  "limits": {
    "h": "Grenser (for ærlighet)",
    "p": "Mast-klokken er sterkt dempet under vann, så den ser skarpe støt bare dempet. «Vinklene» kommer fra tyngdekraft-retningen (lavpassfilter) — i stasjonær gliding ekte posisjon, med vedvarende akselerasjon litt forskjøvet; for 100 % rene rotasjonsvinkler ville du trenge et gyroskop. Og den nøyaktige tidsforskyvningen for individuelle pumps mellom klokken kunne ikke fastslåes til < 100 ms (ingen rent felles referansepunkt; FR55 har ingen GPS under vann for klokkeinnstilling)."
  }
};


const ptPT: N1 = {
  "back": "← Voltar",
  "next": "→ Parte 2: Como funciona a deteção",
  "h1": "Análises para nerds",
  "subtitle": "Experiência de dupla relógio: Pumpfoil · Illmensee, 27.06.2026 · dados brutos de aceleração, muito processamento de sinal e um pouco de física de foil. Para quem quer saber de verdade.",
  "intro": "Pergunta: o que se consegue extrair dos dados de movimento de uma sessão de Pumpfoil — e conseguimos melhorar a deteção de bombeio, estar-em-foil e planagem? Para isso, registámos uma sessão **em simultâneo com dois relógios**: um na mão e um **diretamente no mastro do foil, debaixo de água** — a «verdade» sobre o que o foil realmente faz.",
  "aufbau": {
    "h": "O equipamento",
    "p": "**fénix** na mão (25/100 Hz, GPS bom) — este é o relógio que queremos ter depois no produto. **Forerunner 55** preso ao mastro do foil, **debaixo de água**, de cabeça para cima, com o botão de arranque apontado para a frente. Ambos funcionavam na nossa app de gravação própria (v1.0.37). O relógio no mastro não tem **GPS debaixo de água** — apenas mede a aceleração bruta do foil.",
    "alt1": "Foil com relógio de mastro no cais",
    "alt2": "FR55 no mastro — arranque automático",
    "alt3": "FR55 no mastro — procura de GPS",
    "altSpot": "Spot Illmensee ao pôr do sol"
  },
  "daten": {
    "h": "Os dados",
    "p": "Em vez dos chunks brutos (que cortavam no FR55 fraco), analisámos os **ficheiros FIT originais** do Garmin Connect: fénix **100 Hz**, mastro **25 Hz**, ao longo de toda a sessão. Ambos os relógios funcionam em sincronia pela hora do sistema."
  },
  "start": {
    "h": "A sequência de arranque",
    "p": "A partir dos dados conseguimos reconstruir o arranque completo (confirmado por vídeo): a prancha está **de cabeça para baixo** no cais → é rodada **180°** e o foil mergulhado (acima: posição FR55 muda de −1 para +1) → concentração breve → **impulso** com a mão do relógio → a mão **estala para cima ao soltar** (4–6 g choque no braço, energia de salto) → **salto e aterragem** na prancha → bombeio → voo.",
    "cap1": "O flip 180° da prancha (gravidade FR55 muda) e a zona de arranque nos 5 s seguintes.",
    "cap2": "Sequência de arranque: flip da prancha, preparação, impulso/salto, depois a rampa de velocidade para foiling."
  },
  "truth": {
    "h": "Bombeio, estar-em-foil, planagem — a verdade do foil",
    "p": "O mastro fica no foil e «sabe» se se está realmente a bombear e se o foil ainda está a voar. Bem visível no arrefecimento: primeiro o **bombeio para** (atividade de mão → 0), mas a velocidade mantém-se → isso é a **fase de planagem**; depois o foil bascula (oscilação do mastro) e acabou. Exatamente esta fase de planagem não detetamos explicitamente.",
    "cap": "Velocidade GPS · Atividade de bombeio na mão · Bombeio do foil (mastro) · Posição do foil. No fim: bombeio para → planagem → queda do foil."
  },
  "cadence": {
    "h": "A cadência de bombeio",
    "p": "O bombeio é feito com **≈ 1,29 Hz** (~77 bombeios/minuto). A mão apanha esta taxa com precisão (número e ritmo combinam com o impulso do foil) — portanto a deteção de bombeio funciona bem em princípio.",
    "cap": "Marcadores de bombeio na mão vs. picos de impulso do foil — mesma cadência (~1,3 Hz), ritmos rastreados."
  },
  "pitch": {
    "h": "Posição do foil: inclinação domina, impulso frente/trás",
    "p": "Ao bombear, inclinas o foil sobre a alavanca de 85 cm do mastro **para frente/trás** (inclinação), pouco lateral — nos dados a inclinação domina claramente sobre o movimento lateral. E a aceleração do foil é sobretudo **frente/trás (impulso)**, não vertical: o foil empurra para a frente quando exerces pressão.",
    "cap": "Posição do foil na sessão: inclinação (frente/trás) ≫ lateral. Inclinação e carga vertical estão acopladas."
  },
  "pics": {
    "h": "Imagens fixes",
    "p": "O percurso, colorido pela posição do foil e velocidade (branco = 0°, vermelho/azul conforme direção):",
    "cap1": "Percurso de foiling por ângulo de inclinação, ângulo lateral e velocidade. O foil mantém leve inclinação para cima (sustentação).",
    "cap2": "Percurso por impulso (vermelho=para frente) — vê-se cada impulso de bombeio — e os marcadores de bombeio individuais no caminho.",
    "cap3": "Tapete de posição: inclinação / lateral / impulso ao longo do tempo num piscar de olhos."
  },
  "learned": {
    "h": "O que aprendemos",
    "li": [
      "**Deteção de bombeio** acerta taxa e número bem (~1,29 Hz) — coincide com a verdade do foil no mastro (poucos % de desvio).",
      "**Deteção estar-em-foil** fica bem — mostra o cais/impulso com precisão (encaixa no impulso de salto).",
      "**Fase de planagem / arrefecimento**: aqui está o maior potencial — «estar-em-foil ∧ atividade de bombeio ≈ 0» poderia indicar explicitamente o final da planagem.",
      "Tudo isto é **possível apenas com o relógio na mão** — o relógio no mastro era apenas a referência de verdade."
    ]
  },
  "limits": {
    "h": "Limites (pela honestidade)",
    "p": "O relógio no mastro é muito amortecido debaixo de água, por isso vê choques afiados apenas amortecidos. Os «ângulos» vêm da direção da gravidade (filtro passa-baixo) — em planagem estacionária é a posição real, em aceleração sustentada é ligeiramente distorcido; para ângulos de rotação 100% exatos seria necessário um giroscópio. E o desfasamento exato de cada bombeio entre os relógios não conseguiu prender-se a < 100 ms (sem um ponto de sincronismo comum limpo; o FR55 não tem GPS debaixo de água para acertar a hora)."
  }
};


const pt: N1 = {
  "back": "← Voltar",
  "next": "→ Parte 2: Como o reconhecimento funciona",
  "h1": "Análises Nerd",
  "subtitle": "Experimento dual-relógio de pumpfoil · Illmensee, 27.06.2026 · dados de aceleração brutos, muito processamento de sinal e um pouco de física do foil. Para quem quer saber os detalhes.",
  "intro": "Pergunta: O que você consegue realmente extrair dos dados de movimento de uma sessão de pumpfoil — e como conseguimos melhorar o reconhecimento de pumps, on-foil e glide? Para isso, gravamos uma sessão **simultaneamente com dois relógios**: um no pulso e outro **direto no mastro do foil, embaixo da água** — a verdade sobre o que o foil realmente faz.",
  "aufbau": {
    "h": "O Setup",
    "p": "**fenix** no pulso (25/100 Hz, GPS bom) — este é o relógio que temos depois no produto. **Forerunner 55** presa no mastro do foil, **embaixo da água**, de cabeça para baixo, com o botão de início na direção da viagem. Ambos rodavam nosso próprio app de gravador (v1.0.37). O relógio do mastro não tem **GPS embaixo da água** — mede apenas a aceleração bruta do foil.",
    "alt1": "Foil com relógio do mastro no cais",
    "alt2": "FR55 no mastro — início automático",
    "alt3": "FR55 no mastro — busca de GPS",
    "altSpot": "Spot Illmensee ao pôr do sol"
  },
  "daten": {
    "h": "Os Dados",
    "p": "Em vez dos chunks brutos (que se interrompem no FR55 fraco), analisamos os **arquivos FIT originais** do Garmin Connect: fenix **100 Hz**, mastro **25 Hz**, cada um durante toda a sessão. Ambos os relógios rodam sincronizados via hora do sistema."
  },
  "start": {
    "h": "A Sequência de Início",
    "p": "A partir dos dados é possível reconstruir o início completo (confirmado por vídeo): A prancha está **de cabeça para baixo** no cais → é virada **180°** e o foil é imerso (acima: o FR55 muda de −1 para +1) → concentração rápida → **empurrão** com a mão do relógio → a mão **estala para cima ao soltar** (4–6 g de impulso no braço, energia de salto) → **salto e pouso** na prancha → bombeio → voo.",
    "cap1": "O giro de 180° da prancha (a gravidade do FR55 muda) e a zona de início nos 5 s seguintes.",
    "cap2": "Sequência de início: giro da prancha, preparação, empurrão/salto, depois a aceleração de velocidade até foiling."
  },
  "truth": {
    "h": "Bombeio, Foiling, Glide — a Verdade do Foil",
    "p": "O mastro está no foil e sabe se você está realmente bombeando e se o foil ainda está voando. Bem visível no arremate: primeiro o **bombeio cessa** (atividade do pulso → 0), mas a velocidade ainda se mantém → essa é a **fase de glide**; depois o foil cai (deflexão do mastro) e acabou. Essa fase de glide é exatamente o que ainda não reconhecemos explicitamente.",
    "cap": "Velocidade GPS · atividade de pump no pulso · pump do foil (mastro) · posição do foil. No final: bombeio cessa → glide → queda do foil."
  },
  "cadence": {
    "h": "A Cadência de Pump",
    "p": "O bombeio é feito com **≈ 1,29 Hz** (~77 pumps/minuto). O pulso acerta essa taxa perfeitamente (a contagem e o ritmo coincidem com o empurrão do foil) — então o reconhecimento de pump está funcionando corretamente em princípio.",
    "cap": "Marcadores de pump no pulso vs. peaks de empurrão do foil — mesma cadência (~1,3 Hz), os batidas acompanham."
  },
  "pitch": {
    "h": "Posição do Foil: Arfagem Domina, Propulsão Frente/Trás",
    "p": "Quando você bombeia, você inclina o foil sobre o alavanca de 85 cm do mastro **para frente/trás** (arfagem), pouco lateralmente — nos dados a movimento de arfagem claramente domina o roll. E a aceleração do foil é principalmente **frente/trás (propulsão)**, não vertical: o foil empurra para frente quando você dá pressão.",
    "cap": "Posição do foil na sessão: arfagem (frente/trás) ≫ roll. Pitch e carga vertical estão acoplados."
  },
  "pics": {
    "h": "Imagens Legais",
    "p": "O percurso, colorido por posição do foil e velocidade (branco = 0°, vermelho/azul conforme direção):",
    "cap1": "Percurso de foiling por ângulo de arfagem, ângulo de roll e velocidade. O foil mantém o nariz levemente para cima durante toda a sessão (sustentação).",
    "cap2": "Percurso por propulsão (vermelho = para frente) — você vê cada empurrão de pump — e os marcadores de pump individuais no caminho.",
    "cap3": "Tapete de posição: arfagem / roll / propulsão ao longo do tempo de uma vez."
  },
  "learned": {
    "h": "O Que Aprendemos",
    "li": [
      "**Reconhecimento de pump** acerta taxa e contagem bem (~1,29 Hz) — coincide com a verdade do foil no mastro (poucas % de desvio).",
      "**Reconhecimento on-foil** fica bem — mostra o cais/decolagem com precisão (se encaixa no impulso de decolagem).",
      "**Fase de glide / arremate**: aqui está o maior potencial — on-foil ∧ atividade de pump ≈ 0 poderia indicar explicitamente o glide no final.",
      "Tudo isso é **apenas possível com o relógio do pulso** — o relógio do mastro era apenas a referência de verdade."
    ]
  },
  "limits": {
    "h": "Limites (Pela Honestidade)",
    "p": "O relógio do mastro é fortemente amortecido embaixo da água, então vê apenas impactos bem agudos de forma enfraquecida. Os ângulos vêm da direção da gravidade (passa-baixa) — na glide estacionária a posição é real, com aceleração contínua fica um pouco distorcida; para ângulos de rotação 100 % limpos você precisaria de um giroscópio. E o desvio de tempo exato entre pumps individuais nos dois relógios não foi fixado em < 100 ms (nenhum ponto de sincronia bem definido; o FR55 não tem GPS embaixo da água para configurar a hora)."
  }
};


const ru: N1 = {
  "back": "← Назад",
  "next": "→ Часть 2: Как работает детекция",
  "h1": "Нерд-анализы",
  "subtitle": "Эксперимент с двумя часами на Pumpfoil · Illmensee, 27.06.2026 · сырые данные ускорения, много обработки сигнала и немного физики фойла. Для тех, кто хочет узнать точные детали.",
  "intro": "Вопрос: что на самом деле можно извлечь из данных движения сессии Pumpfoil — и можем ли мы улучшить детекцию Pump, On-Foil и Glide? Для этого мы записали один лаун **одновременно двумя часами**: одни на запястье и одни **прямо на мачте фойла, под водой** — «истина» о том, что фойл на самом деле делает.",
  "aufbau": {
    "h": "Установка",
    "p": "**fenix** на запястье (25/100 Hz, хороший GPS) — это часы, которые позже будут в продукте. **Forerunner 55** прикреплена к мачте фойла, **под водой**, перевернута вверх дном, с кнопкой старта в направлении движения. Обе работали на нашем собственном приложении-рекордере (v1.0.37). Часы на мачте **без GPS под водой** — они только измеряют сырое ускорение фойла.",
    "alt1": "Фойл с часами на мачте у причала",
    "alt2": "FR55 на мачте — автозапуск",
    "alt3": "FR55 на мачте — поиск GPS",
    "altSpot": "Spot Illmensee на закате"
  },
  "daten": {
    "h": "Данные",
    "p": "Вместо сырых чанков (которые обрывались на слабой FR55) мы анализировали **исходные FIT-файлы** из Garmin Connect: fenix **100 Hz**, мачта **25 Hz**, на протяжении всего лауна. Обе часы синхронизированы по системному времени."
  },
  "start": {
    "h": "Последовательность старта",
    "p": "Из данных можно восстановить полный старт (подтверждено видео): доска лежит **вверх дном** у причала → переворачивается на **180°** и фойл входит в воду (выше: положение FR55 переходит с −1 на +1) → быстро сконцентрируешься → **толчок** рукой с часами → рука **резко вздергивается при отпускании** (4–6 g толчок руки, энергия прыжка) → **прыжок & приземление** на доску → Pump → полет.",
    "cap1": "Переворот доски на 180° (гравитация FR55 переходит) и зона старта в течение 5 s после.",
    "cap2": "Последовательность старта: переворот доски, подготовка, толчок/прыжок, потом разгон в фойле."
  },
  "truth": {
    "h": "Pump, Foile, Glide — истина фойла",
    "p": "Мачта сидит на фойле и «знает», происходит ли настоящий Pump и летит ли фойл. Хорошо видно при раскате: сначала **Pump прекращается** (активность запястья → 0), скорость еще держится → это **фаза глайда**; потом фойл заваливается (отклонение мачты) и всё. Именно эту фазу глайда мы пока не распознаём явно.",
    "cap": "GPS-Speed · Pump-активность запястья · Foil-Pump (мачта) · Положение фойла. В конце: Pump прекращается → Glide → Foil-drop."
  },
  "cadence": {
    "h": "Pump-кадансия",
    "p": "Pump происходит с **≈ 1,29 Hz** (~77 Pumps/минута). Запястье попадает в эту частоту идеально (количество и такт совпадают с толчком фойла) — так что Pump-детекция в принципе работает правильно.",
    "cap": "Wrist-Pump-маркеры vs. Foil-толчок-пики — одинаковая кадансия (~1,3 Hz), такты совпадают."
  },
  "pitch": {
    "h": "Положение фойла: Pitch доминирует, Thrust fore/aft",
    "p": "При Pump ты наклоняешь фойл через рычаг мачты 85 cm **вперёд/назад** (Pitch), едва боком — в данных Pitch явно доминирует над Roll. И ускорение фойла в основном **fore/aft (тяга)**, не вертикальное: фойл движется вперёд, когда ты давишь.",
    "cap": "Положение фойла в лауне: Pitch (fore/aft) ≫ Roll. Pitch и вертикальная нагрузка связаны."
  },
  "pics": {
    "h": "Классные картинки",
    "p": "Трек, раскрашенный по положению фойла и скорости (белый = 0°, красный/синий по направлению):",
    "cap1": "Foiling-трек по Pitch-углу, Roll-углу и Speed. Фойл держит нос чуть вверх на протяжении всего лауна (подъём).",
    "cap2": "Трек по Thrust (красный=вперёд) — видно каждый Pump-толчок — и отдельные Pump-маркеры на пути.",
    "cap3": "Ковёр положения: Pitch / Roll / Thrust за время в одном взгляде."
  },
  "learned": {
    "h": "Чему мы научились",
    "li": [
      "**Pump-детекция** хорошо попадает по частоте и количеству (~1,29 Hz) — совпадает с фойл-истиной на мачте (несколько % отклонения).",
      "**On-Foil-детекция** работает хорошо — она точно показывает причал/отрыв (срабатывает на импульс прыжка).",
      "**Глайд-фаза / раскат**: здесь наибольший потенциал — «On-Foil ∧ Pump-активность ≈ 0» могла бы явно выделять глайд в конце.",
      "Всё это возможно **только с часами на запястье** — часы на мачте были только эталоном истины."
    ]
  },
  "limits": {
    "h": "Ограничения (для честности)",
    "p": "Часы на мачте сильно затухают под водой, поэтому видят резкие удары только ослабленными. «Углы» происходят из направления гравитации (низкочастотный фильтр) — при статичном глайде это настоящее положение, при продолжающемся ускорении слегка искажено; для 100 % чистых углов поворота нужен гироскоп. И точный временной сдвиг отдельных Pumps между часами не удалось зафиксировать < 100 ms (нет чистой общей контрольной точки; FR55 под водой не имеет GPS для синхронизации времени)."
  }
};


const zh: N1 = {
  "back": "← 返回",
  "next": "→ 第2部分：识别如何工作",
  "h1": "极客分析",
  "subtitle": "双表泵翼实验 · Illmensee，2026年6月27日 · 原始加速度数据、大量信号处理和一点翼面物理学。针对想要深入了解的人。",
  "intro": "问题：从泵翼运行的运动数据中实际上能读取什么 — 我们能改进泵、着翼和滑行识别吗？为此，我们**同时用两块表**记录了一次运行：一块在手腕上，一块**直接在翼面桅杆上、水下** — 关于翼面实际做什么的「真相」。",
  "aufbau": {
    "h": "装置",
    "p": "**fenix**在手腕上（25/100 Hz，良好GPS）— 这是我们稍后在产品中拥有的表。**Forerunner 55**固定在翼面桅杆上，**在水下**，上下颠倒，启动按钮朝向行进方向。两者都在我们自己的记录器应用上运行（v1.0.37）。桅杆表在水下**没有GPS** — 它只测量翼面的原始加速度。",
    "alt1": "翼面与桅杆表在码头",
    "alt2": "FR55在桅杆 — 自动启动",
    "alt3": "FR55在桅杆 — GPS搜索",
    "altSpot": "日落时的Illmensee垂钓点"
  },
  "daten": {
    "h": "数据",
    "p": "不使用（在性能弱的FR55上中断的）原始块，我们评估了来自Garmin Connect的**原始FIT文件**：fenix **100 Hz**，桅杆**25 Hz**，整个运行过程中各自都有。两块表通过系统时间同步运行。"
  },
  "start": {
    "h": "启动序列",
    "p": "从数据可以重建完整的启动（通过视频确认）：冲浪板**倒在码头** → 旋转**180°**并浸入翼面（上面：FR55方向从−1翻到+1）→ 短暂集中 → **用表的手推动** → 手在释放时**甩高**（4–6 g手臂推动，起跳能量）→ **跳跃和着陆**在冲浪板上 → 泵动 → 飞行。",
    "cap1": "冲浪板的180°翻转（FR55重力翻转）和之后5秒内的启动区。",
    "cap2": "启动序列：冲浪板翻转、准备、推动/跳跃，然后进入泵翼的速度斜坡。"
  },
  "truth": {
    "h": "泵动、着翼、滑行 — 翼面的真相",
    "p": "桅杆坐在翼面上，「知道」是否真的在泵动以及翼面是否仍在飞行。在衰退中清晰可见：首先**泵动停止**（手腕活动 → 0），但速度仍保持 → 这是**滑行阶段**；之后翼面倾倒（桅杆偏转），结束了。恰好这个滑行阶段我们目前没有明确识别。",
    "cap": "GPS速度 · 手腕泵动活动 · 翼面泵动（桅杆）· 翼面姿态。结尾：泵动停止 → 滑行 → 翼面下降。"
  },
  "cadence": {
    "h": "泵动频率",
    "p": "泵动的频率约为**≈ 1.29 Hz**（~77泵/分钟）。手腕完美命中这个频率（数字和节奏与翼面推力一致）— 所以泵动识别基本上是正确的。",
    "cap": "手腕泵动标记与翼面推力峰值 — 频率相同（~1.3 Hz），节奏匹配。"
  },
  "pitch": {
    "h": "翼面姿态：俯仰占主导，前后推进",
    "p": "泵动时，你通过85厘米桅杆杠杆**前后**倾斜翼面（俯仰），几乎没有侧向动作 — 在数据中，俯仰动作清楚地主导滚转动作。翼面的加速度主要是**前后（推进）**，不是竖直：当你施加压力时，翼面向前推动。",
    "cap": "运行过程中的翼面姿态：俯仰（前后）≫ 滚转。俯仰和竖直负荷耦合。"
  },
  "pics": {
    "h": "漂亮的图片",
    "p": "轨迹，按翼面姿态和速度着色（白色 = 0°，红色/蓝色各方向）：",
    "cap1": "着翼轨迹按俯仰角、滚转角和速度。翼面全程保持轻微机头向上（升力）。",
    "cap2": "轨迹按推进力（红色=前向）— 你能看到每个泵动推力 — 以及路径上的各个泵动标记。",
    "cap3": "姿态地毯：俯仰 / 滚转 / 推进随时间一览。"
  },
  "learned": {
    "h": "我们学到了什么",
    "li": [
      "**泵动识别**很好地命中频率和数字（~1.29 Hz）— 与桅杆的翼面真相一致（偏差几个百分点）。",
      "**着翼识别**很好 — 它精确显示码头/起跳（在起跳冲击时自动调整）。",
      "**滑行阶段 / 衰退**：这是最大的潜力 — 「着翼 ∧ 泵动活动 ≈ 0」可以明确显示滑行。",
      "所有这一切都**仅用手腕表就能做到** — 桅杆表只是真相参考。"
    ]
  },
  "limits": {
    "h": "限制（诚实起见）",
    "p": "桅杆表在水下被严重衰减，因此它只能看到尖锐冲击的衰减。「角度」来自重力方向（低通）— 在静止滑行中是真实姿态，在持续加速期间轻微失真；要获得100%干净的旋转角度，需要陀螺仪。表之间单个泵动的确切时间偏移无法精确到 < 100 ms（没有干净的共同参考点；FR55在水下没有GPS来设置时间）。"
  }
};


const pl: N1 = {
  "back": "← Wróć",
  "next": "→ Część 2: Jak działa detekcja",
  "h1": "Analizy dla nerdy",
  "subtitle": "Eksperyment z dwoma zegarkami · Illmensee, 27.06.2026 · surowe dane przyspieszenia, dużo przetwarzania sygnału i trochę fizyki foila. Dla tych, którzy chcą wiedzieć dokładnie.",
  "intro": "Pytanie: co można wyciągnąć z danych ruchu z sesji Pumpfoil — i czy możemy poprawić detekcję pompowania, bycia na foilu i fazy szybowania? W tym celu nagrywaliśmy jedną sesję **jednocześnie na dwóch zegarach**: jeden na nadgarstku i jeden **bezpośrednio na maszcie foila, pod wodą** — \"prawda\" o tym, co robi foil.",
  "aufbau": {
    "h": "Układ",
    "p": "**fenix** na nadgarstku (25/100 Hz, dobre GPS) — to jest zegarek, który chcemy mieć w produkcie. **Forerunner 55** przywiązany do masztu foila, **pod wodą**, głowicą w górę, przyciskiem startu skierowanym w kierunku jazdy. Oba działały na naszej własnej aplikacji rekodera (v1.0.37). Zegarek na maszcie nie ma **GPS pod wodą** — mierzy tylko surowe przyspieszenie foila.",
    "alt1": "Foil z zegarkiem na maszcie na molo",
    "alt2": "FR55 na maszcie — automatyczny start",
    "alt3": "FR55 na maszcie — wyszukiwanie GPS",
    "altSpot": "Spot Illmensee o zachodzie słońca"
  },
  "daten": {
    "h": "Dane",
    "p": "Zamiast surowych chunks (które się przerywały na słabym FR55), analizowaliśmy **oryginalne pliki FIT** z Garmin Connect: fenix **100 Hz**, maszt **25 Hz**, przez całą sesję. Oba zegarki działały zsynchronizowane przez czas systemowy."
  },
  "start": {
    "h": "Sekwencja startu",
    "p": "Z danych można zrekonstruować cały start (potwierdzony wideo): deska leży **do góry nogami** na molo → jest obracana **o 180°** i foil zanurzony (powyżej: orientacja FR55 przechodzi z −1 na +1) → krótka koncentracja → **pchnięcie** ręką z zegarkiem → ręka **wyrzuca się w górę podczas wypuszczania** (4–6 g uderzenie ramienia, energia skoku) → **skok i lądowanie** na desce → pompowanie → lot.",
    "cap1": "Obrót deski o 180° (grawitacja FR55 się zmienia) i strefa startu w następne 5 sekund.",
    "cap2": "Sekwencja startu: obrót deski, przygotowanie, pchnięcie/skok, potem rampa prędkości do foilingu."
  },
  "truth": {
    "h": "Pompowanie, bycie na foilu, szybowanie — prawda foila",
    "p": "Maszt siedzi na foilu i \"wie\", czy naprawdę się pompuje i czy foil wciąż lata. Wyraźnie widać na końcu: najpierw **pompowanie ustaje** (aktywność nadgarstka → 0), ale prędkość się trzyma → to jest **faza szybowania**; potem foil opada (wychylenie masztu) i koniec. Dokładnie tę fazę szybowania nie detektujemy jawnie.",
    "cap": "Prędkość GPS · Aktywność pompowania na nadgarstku · Pompowanie foila (maszt) · Orientacja foila. Na końcu: pompowanie ustaje → szybowanie → upadek foila."
  },
  "cadence": {
    "h": "Kadencja pompowania",
    "p": "Pompuje się z **≈ 1,29 Hz** (~77 pompowań/minutę). Nadgarstek trafia tę szybkość czysto (liczba i takt zgadzają się z impulsem foila) — detekcja pompowania działa więc zasadniczo dobrze.",
    "cap": "Markery pompowania na nadgarstku vs. piki impulsu foila — ta sama kadencja (~1,3 Hz), takty się śledzą."
  },
  "pitch": {
    "h": "Orientacja foila: pochylenie dominuje, napęd do przodu/do tyłu",
    "p": "Gdy pompujesz, przychylasz foil na dźwigni 85 cm masztu **do przodu/do tyłu** (pochylenie), mało bocznie — w danych pochylenie wyraźnie dominuje nad ruchem bocznym. A przyspieszenie foila to przede wszystkim **napęd do przodu/do tyłu**, nie pionowo: foil pcha się do przodu, gdy aplikujesz nacisk.",
    "cap": "Orientacja foila w sesji: pochylenie (przód/tył) ≫ boczne. Pochylenie i obciążenie pionowe są sprzężone."
  },
  "pics": {
    "h": "Fajne obrazki",
    "p": "Ścieżka, pokolorowana według orientacji foila i prędkości (biały = 0°, czerwony/niebieski dla kierunku):",
    "cap1": "Ścieżka foilingu według kąta pochylenia, kąta przechyłu i prędkości. Foil przez cały czas lekko trzyma nos w górę (siła nośna).",
    "cap2": "Ścieżka według napędu (czerwony=w przód) — widać każdy impuls pompowania — i pojedyncze markery pompowania na ścieżce.",
    "cap3": "Dywan orientacji: pochylenie / przechył / napęd w funkcji czasu na jednym widoku."
  },
  "learned": {
    "h": "Czego się nauczyliśmy",
    "li": [
      "**Detekcja pompowania** trafia szybkość i liczbę dobrze (~1,29 Hz) — zgadza się z prawdą foila na maszcie (kilka % różnicy).",
      "**Detekcja bycia na foilu** jest dobra — pokazuje molo/odbicie precyzyjnie (przyciąga się do impulsu skoku).",
      "**Faza szybowania / rozbiegu**: tu jest największy potencjał — \"on-foil ∧ aktywność pompowania ≈ 0\" mogłoby jawnie oznaczać szybowanie na końcu.",
      "Wszystko to **jest możliwe tylko z zegarkiem na nadgarstku** — zegarek na maszcie był tylko referencją prawdy."
    ]
  },
  "limits": {
    "h": "Ograniczenia (dla uczciwości)",
    "p": "Zegarek na maszcie jest pod wodą silnie tłumiony, dlatego widzi ostre uderzenia tylko osłabione. \"Kąty\" pochodzą z kierunku grawitacji (filtr dolnoprzepustowy) — przy stacjonarnym szybowaniu prawdziwa orientacja, przy trwającym przyspieszeniu lekko zniekształcona; do 100% czystych kątów obrotu potrzebny byłby żyroskop. I dokładny czasowy offset poszczególnych pompowań między zegarkami nie mógł być ustabilizowany na < 100 ms (brak czystego wspólnego punktu odniesienia; FR55 nie ma GPS pod wodą do ustawiania czasu)."
  }
};

export const NERD1: Partial<Record<Lang, N1>> = { pl, zh, ru, pt, "pt-PT": ptPT, nb, ja, id,
  de,
  gsw,
  "de-AT": deAT,
  en,
  fr,
  it,
  es,
  fi,
  nl,
  cs,
};
