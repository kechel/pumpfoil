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

export const NERD1: Record<Lang, N1> = {
  de,
  gsw,
  "de-AT": deAT,
  en,
  fr,
  it,
  es,
  fi,
  nl,
};
