// Inhalte für die Nerd-Analysen Teil 3 (datengetrieben, alle 8 Sprachen).
// `de` ist die Quelle der Wahrheit; die übrigen Sprachen spiegeln dieselbe Struktur.
// Rich-Markup in den Strings: **fett**, `code`, *kursiv*, [label](/pfad).
// Technische Bezeichner (Accel, RMS, Hz, km/h, GPS, Precision, Recall) bleiben unübersetzt.
// Keine geraden Anführungszeichen (") in Strings — nur typografische.
import type { Lang } from "../i18n";

export interface N3 {
  back: string;
  h1: string;
  subtitle: string;
  intro: string;
  setup: { h: string; p: string; capRumpf: string; capFuss: string };
  pump: { h: string; p: string; li: string[]; cap: string };
  glide: { h: string; p: string; li: string[]; cap: string };
  limits: { h: string; p: string };
  outlook: { h: string; p: string };
  videorun: { h: string; p: string; cap: string };
}

const de: N3 = {
  back: "← Teil 2: Wie es funktioniert",
  h1: "Teil 3: Die Doppeluhr-Messung — wo wir heute stehen",
  subtitle: "Zweites Zwei-Uhren-Experiment: Handgelenk gegen board-nahe Wahrheit",
  intro:
    "Nach Teil 1 haben wir erneut **gleichzeitig mit zwei Uhren** gemessen — diesmal, um die **Pump-Erkennung** und das **Ende eines Laufs** (Gleiten bzw. Absinken) gegen eine board-gekoppelte Wahrheit zu prüfen. Eine **Forerunner 55** am Handgelenk (GPS + 25 Hz Accel) und eine **fēnix 7X Pro** einmal am Foil-Rumpf unter Wasser, einmal am Fußgelenk (100 Hz Accel) — je über den ganzen Lauf, beide über die Systemzeit synchron und feinjustiert über den Absprung-Impuls.",
  setup: {
    h: "Das Setup",
    p: "Beide Uhren laufen auf unserer Recorder-App — nur so bekommen wir den rohen Beschleunigungs-Datenstrom. Die fēnix am **Fuß** verhält sich näherungsweise wie das Board; am **Rumpf** misst sie die Foil-Lage direkt (dort ist das GPS unter Wasser tot, der Accel läuft aber durch).",
    capRumpf: "fēnix am Foil-Rumpf, unter Wasser",
    capFuss: "fēnix am Fußgelenk, Forerunner 55 am Handgelenk",
  },
  pump: {
    h: "Pump-Erkennung — stimmt gegen die Wahrheit",
    p: "Der board-gekoppelte Sensor sieht jeden Pump als einen sauberen Zyklus. Verglichen damit trifft unser reiner **Handgelenk**-Detektor erstaunlich genau:",
    li: [
      "**Anzahl:** 56 vs 59 · 38 vs 40 · 32 vs 31 Pumps — auf ±~5 %, kein systematisches Unter-Zählen.",
      "**Kadenz** praktisch identisch (~1,36–1,45 Hz).",
      "**Pro-Pump-Timing:** 88–95 % Precision, 90 % Recall (±0,35 s).",
    ],
    cap: "Pump-Anzahl & -Kadenz: Board-Wahrheit vs. Handgelenk-Detektor",
  },
  glide: {
    h: "Das Lauf-Ende — Gleiten vs. Absinken",
    p: "Spannend wird es am Lauf-Ende. Das **GPS fällt genau dort aus** — auf beiden Uhren —, weil der Sensor abtaucht, sobald du langsamer wirst. Der Accel läuft aber durch, und der board-nahe Sensor trennt es sauber: **auf dem Foil** liegt das Board ruhig (foil-gedämpft), **abgesunken** dümpelt es frei (großes, langsames Auf und Ab).",
    li: [
      "Der Übergang „noch auf Foil / an der Oberfläche in Bewegung“ → „abgesunken“ ist im Board-Accel klar erkennbar.",
      "Unser Detektor beendet den Lauf **auf ±2 s genau** am echten Absink-Punkt — der Auslauf wird also **nicht** abgeschnitten.",
      "Die ~9-km/h-Grenze entspricht ziemlich genau der **Stall-Geschwindigkeit** des Foils.",
    ],
    cap: "Board-Bobbing (niedrig = auf Foil, hoch = dümpelt frei); grün = Detektor-Ende, lila = echter Absink-Punkt",
  },
  limits: {
    h: "Ehrliche Grenzen",
    p: "Es sind nur wenige Läufe, alle an einem Spot und pump-dicht. Das **Handgelenk allein** *sieht* den Absink-Moment nicht sauber (der Arm wackelt beim Pumpen wie beim Dümpeln). Und die richtig langen Genuss-Glides (glassy, downwind) sind in diesem Datensatz noch nicht drin.",
  },
  outlook: {
    h: "Wie es weitergeht",
    p: "Wir ändern jetzt **bewusst nichts** am Detektor, sondern verbessern **datengetrieben** — mit mehr Läufen (auch langen Glides), einer Board-Kamera (**Insta360 X5**) als visueller Wahrheit und den Daten der Nutzer auf pumpfoil.org. Genau so haben wir die Erkennung schon mehrfach nachgeschärft.",
  },
  videorun: {
    h: "Weiterer Testlauf (Video)",
    p:
      "So sieht die Messung in echt aus: **an jeder Hand eine Uhr** und das **Handy am Board** als board-nahe Referenz. Der reine Handgelenk-Detektor deckt sich dabei gut mit der board-nahen Wahrheit (Pump-Zahl auf wenige Prozent genau). Wichtige Lehre: für eine **sekundengenaue** Ausrichtung mehrerer Geräte braucht es am Anfang einen bewussten **Sync-Impuls** (z. B. 3× kräftig aufs Board tippen) — die Systemzeit allein reicht nicht.",
    cap: "Zwei Uhren am Handgelenk + Handy am Board — der Testlauf im Video",
  },
};

const gsw: N3 = {
  back: "← Teil 2: Wie's funktioniert",
  h1: "Teil 3: D Doppel-Uhr-Mässig — wo mer hüt stönd",
  subtitle: "Zweits Zwei-Uhre-Experimänt: Handglänk gäge board-nahi Wahrheit",
  intro:
    "Nach Teil 1 hend mer nomal **gliichziitig mit zwei Uhre** gmässe — die Mal, zum d **Pump-Erkennig** und s **Ändi vom ene Lauf** (Gleite bzw. Absinke) gäge en board-koppleti Wahrheit z prüefe. E **Forerunner 55** am Handglänk (GPS + 25 Hz Accel) und e **fēnix 7X Pro** eimal am Foil-Rumpf under Wasser, eimal am Fuessglänk (100 Hz Accel) — jewiils über de ganz Lauf, beidi über d Systemziit synchron und fein iigstellt über de Absprung-Impuls.",
  setup: {
    h: "S Setup",
    p: "Beidi Uhre laufed uf üsere Recorder-App — nu so überchömed mer de rohi Beschleunigungs-Datestrom. D fēnix am **Fuess** verhaltet sich öppe wie s Board; am **Rumpf** misst si d Foil-Lag diräkt (dört isch s GPS under Wasser tot, de Accel laufd aber dure).",
    capRumpf: "fēnix am Foil-Rumpf, under Wasser",
    capFuss: "fēnix am Fuessglänk, Forerunner 55 am Handglänk",
  },
  pump: {
    h: "Pump-Erkennig — stimmt gäge d Wahrheit",
    p: "De board-kopplet Sensor gseht jede Pump als eine suubere Zyklus. Vergliche demit trifft üse reine **Handglänk**-Detektor erstuunlich gnau:",
    li: [
      "**Aazahl:** 56 vs 59 · 38 vs 40 · 32 vs 31 Pumps — uf ±~5 %, kei systematischs Under-Zelle.",
      "**Kadänz** praktisch identisch (~1,36–1,45 Hz).",
      "**Pro-Pump-Timing:** 88–95 % Precision, 90 % Recall (±0,35 s).",
    ],
    cap: "Pump-Aazahl & -Kadänz: Board-Wahrheit vs. Handglänk-Detektor",
  },
  glide: {
    h: "S Lauf-Ändi — Gleite vs. Absinke",
    p: "Spannend wird's am Lauf-Ändi. S **GPS fallt genau dört us** — uf beide Uhre —, wil de Sensor abtaucht, sobald d langsamer wirsch. De Accel laufd aber dure, und de board-nahi Sensor trennt's suuber: **uf em Foil** liit s Board rueig (foil-dämpft), **abgsunke** dümpelet's frei (grosses, langsams Uuf und Ab).",
    li: [
      "De Übergang „no uf Foil / a de Oberflächi in Bewegig“ → „abgsunke“ isch im Board-Accel klar erkennbar.",
      "Üse Detektor beendet de Lauf **uf ±2 s gnau** am würkliche Absink-Punkt — de Uuslauf wird also **nöd** abgschnitte.",
      "D ~9-km/h-Gränze entspricht zimli gnau de **Stall-Gschwindigkeit** vom Foil.",
    ],
    cap: "Board-Bobbing (tüüf = uf Foil, höch = dümpelet frei); grüen = Detektor-Ändi, lila = würkliche Absink-Punkt",
  },
  limits: {
    h: "Ehrlichi Gränze",
    p: "Es sind nu weni Läuf, alli am gliiche Spot und pump-dicht. S **Handglänk elei** *gseht* de Absink-Momänt nöd suuber (de Arm wacklet bim Pumpe wie bim Dümpele). Und die würklich lange Gnuss-Glides (glassy, downwind) sind i dem Datesatz no nöd dinn.",
  },
  outlook: {
    h: "Wie's wiiter gaat",
    p: "Mer änderd jetz **bewusst nüt** am Detektor, sondern verbesseret **dategetriebe** — mit meh Läuf (au lange Glides), ere Board-Kamera (**Insta360 X5**) als visuelli Wahrheit und de Date vo de Nutzer uf pumpfoil.org. Genau so hend mer d Erkennig scho mehrmals nachgschärft.",
  },
  videorun: {
    h: "Wytere Teschtlauf (Video)",
    p:
      "So gseht d Mässig würklich us: **a jedere Hand e Uhr** und s **Händy am Board** as board-nahi Referänz. De reini Handglänk-Detektor deckt sich guet mit dere board-nahe Wahrheit (Pump-Zahl uf paar Prozänt gnau). Wichtigi Lehr: für e **sekundegnaui** Uusrichtig vo mehrere Geräte bruucht s am Aafang en bewusste **Sync-Impuls** (z. B. 3× chräftig ufs Board tippe) — d Systemziit ellei längt nöd.",
    cap: "Zwei Uhre am Handglänk + Händy am Board — de Teschtlauf im Video",
  },
};

const deAT: N3 = {
  back: "← Teil 2: Wie es funktioniert",
  h1: "Teil 3: Die Doppeluhr-Messung — wo wir heute stehen",
  subtitle: "Zweites Zwei-Uhren-Experiment: Handgelenk gegen board-nahe Wahrheit",
  intro:
    "Nach Teil 1 haben wir wieder **gleichzeitig mit zwei Uhren** gemessen — diesmal, um die **Pump-Erkennung** und das **Ende eines Laufs** (Gleiten bzw. Absinken) gegen eine board-gekoppelte Wahrheit zu prüfen. Eine **Forerunner 55** am Handgelenk (GPS + 25 Hz Accel) und eine **fēnix 7X Pro** einmal am Foil-Rumpf unter Wasser, einmal am Fußgelenk (100 Hz Accel) — jeweils über den ganzen Lauf, beide über die Systemzeit synchron und fein über den Absprung-Impuls justiert.",
  setup: {
    h: "Das Setup",
    p: "Beide Uhren laufen auf unserer Recorder-App — nur so bekommen wir den rohen Beschleunigungs-Datenstrom. Die fēnix am **Fuß** verhält sich ungefähr wie das Board; am **Rumpf** misst sie die Foil-Lage direkt (dort ist das GPS unter Wasser tot, der Accel läuft aber durch).",
    capRumpf: "fēnix am Foil-Rumpf, unter Wasser",
    capFuss: "fēnix am Fußgelenk, Forerunner 55 am Handgelenk",
  },
  pump: {
    h: "Pump-Erkennung — stimmt gegen die Wahrheit",
    p: "Der board-gekoppelte Sensor sieht jeden Pump als einen sauberen Zyklus. Verglichen damit trifft unser reiner **Handgelenk**-Detektor erstaunlich genau:",
    li: [
      "**Anzahl:** 56 vs 59 · 38 vs 40 · 32 vs 31 Pumps — auf ±~5 %, kein systematisches Unter-Zählen.",
      "**Kadenz** praktisch ident (~1,36–1,45 Hz).",
      "**Pro-Pump-Timing:** 88–95 % Precision, 90 % Recall (±0,35 s).",
    ],
    cap: "Pump-Anzahl & -Kadenz: Board-Wahrheit vs. Handgelenk-Detektor",
  },
  glide: {
    h: "Das Lauf-Ende — Gleiten vs. Absinken",
    p: "Spannend wird es am Lauf-Ende. Das **GPS fällt genau dort aus** — auf beiden Uhren —, weil der Sensor abtaucht, sobald du langsamer wirst. Der Accel läuft aber durch, und der board-nahe Sensor trennt es sauber: **auf dem Foil** liegt das Board ruhig (foil-gedämpft), **abgesunken** dümpelt es frei (großes, langsames Auf und Ab).",
    li: [
      "Der Übergang „noch auf Foil / an der Oberfläche in Bewegung“ → „abgesunken“ ist im Board-Accel klar erkennbar.",
      "Unser Detektor beendet den Lauf **auf ±2 s genau** am echten Absink-Punkt — der Auslauf wird also **nicht** abgeschnitten.",
      "Die ~9-km/h-Grenze entspricht ziemlich genau der **Stall-Geschwindigkeit** des Foils.",
    ],
    cap: "Board-Bobbing (niedrig = auf Foil, hoch = dümpelt frei); grün = Detektor-Ende, lila = echter Absink-Punkt",
  },
  limits: {
    h: "Ehrliche Grenzen",
    p: "Es sind nur wenige Läufe, alle an einem Spot und pump-dicht. Das **Handgelenk allein** *sieht* den Absink-Moment nicht sauber (der Arm wackelt beim Pumpen wie beim Dümpeln). Und die richtig langen Genuss-Glides (glassy, downwind) sind in diesem Datensatz noch nicht drin.",
  },
  outlook: {
    h: "Wie es weitergeht",
    p: "Wir ändern jetzt **bewusst nichts** am Detektor, sondern verbessern **datengetrieben** — mit mehr Läufen (auch langen Glides), einer Board-Kamera (**Insta360 X5**) als visueller Wahrheit und den Daten der Nutzer auf pumpfoil.org. Genau so haben wir die Erkennung schon mehrfach nachgeschärft.",
  },
  videorun: {
    h: "Weiterer Testlauf (Video)",
    p:
      "So schaut die Messung in echt aus: **an jeder Hand eine Uhr** und das **Handy am Board** als board-nahe Referenz. Der reine Handgelenk-Detektor deckt sich dabei gut mit der board-nahen Wahrheit (Pump-Zahl auf wenige Prozent genau). Wichtige Lehre: für eine **sekundengenaue** Ausrichtung mehrerer Geräte braucht es am Anfang einen bewussten **Sync-Impuls** (z. B. 3× kräftig aufs Board tippen) — die Systemzeit allein reicht nicht.",
    cap: "Zwei Uhren am Handgelenk + Handy am Board — der Testlauf im Video",
  },
};

const en: N3 = {
  back: "← Part 2: How it works",
  h1: "Part 3: The two-watch measurement — where we stand today",
  subtitle: "Second two-watch experiment: wrist versus board-level ground truth",
  intro:
    "After Part 1 we again recorded a run **with two watches at once** — this time to check the **pump detection** and the **end of a run** (gliding vs. sinking) against a board-coupled ground truth. A **Forerunner 55** on the wrist (GPS + 25 Hz accel) and a **fēnix 7X Pro** once on the foil fuselage underwater, once on the ankle (100 Hz accel) — each over the whole run, both synced via system time and fine-aligned on the takeoff impulse.",
  setup: {
    h: "The setup",
    p: "Both watches run our recorder app — only then do we get the raw acceleration stream. The fēnix on the **foot** behaves roughly like the board; on the **fuselage** it measures the foil attitude directly (there GPS is dead underwater, but the accel keeps running).",
    capRumpf: "fēnix on the foil fuselage, underwater",
    capFuss: "fēnix on the ankle, Forerunner 55 on the wrist",
  },
  pump: {
    h: "Pump detection — it matches the truth",
    p: "The board-coupled sensor sees each pump as one clean cycle. Against that, our pure **wrist** detector is surprisingly accurate:",
    li: [
      "**Count:** 56 vs 59 · 38 vs 40 · 32 vs 31 pumps — within ±~5 %, no systematic under-counting.",
      "**Cadence** virtually identical (~1.36–1.45 Hz).",
      "**Per-pump timing:** 88–95 % precision, 90 % recall (±0.35 s).",
    ],
    cap: "Pump count & cadence: board ground truth vs. wrist detector",
  },
  glide: {
    h: "The end of a run — gliding vs. sinking",
    p: "It gets interesting at the end of a run. **GPS drops out exactly there** — on both watches — because the sensor submerges as you slow down. The accel keeps running, though, and the board-level sensor separates it cleanly: **on the foil** the board sits calm (foil-damped), **sunk** it bobs freely (large, slow up and down).",
    li: [
      "The transition „still on foil / moving at the surface“ → „sunk“ is clearly visible in the board accel.",
      "Our detector ends the run **within ±2 s** of the real sink point — so the glide-out is **not** cut off.",
      "The ~9 km/h threshold matches the foil's **stall speed** quite closely.",
    ],
    cap: "Board bobbing (low = on foil, high = bobbing freely); green = detector end, purple = real sink point",
  },
  limits: {
    h: "Honest limits",
    p: "It is only a handful of runs, all at one spot and pump-dense. The **wrist alone** does *not* cleanly see the sinking moment (the arm shakes while pumping just like while bobbing). And the really long enjoyment glides (glassy, downwind) are not in this dataset yet.",
  },
  outlook: {
    h: "Where it goes from here",
    p: "We are **deliberately changing nothing** in the detector for now, but improving it **data-driven** — with more runs (including long glides), a board camera (**Insta360 X5**) as visual ground truth, and the data of the users on pumpfoil.org. That is exactly how we have sharpened the detection several times already.",
  },
  videorun: {
    h: "Another test run (video)",
    p:
      "Here's what the measurement looks like in practice: **a watch on each wrist** plus the **phone on the board** as a board-near reference. The pure wrist detector lines up well with the board-near truth (pump count within a few percent). Key lesson: aligning several devices to **within a second** needs a deliberate **sync tap** at the start (e.g. 3 firm taps on the board) — system time alone isn't enough.",
    cap: "Two wrist watches + phone on the board — the test run on video",
  },
};

const fr: N3 = {
  back: "← Partie 2 : Comment ça marche",
  h1: "Partie 3 : La mesure à deux montres — où nous en sommes",
  subtitle: "Deuxième expérience à deux montres : le poignet face à une vérité proche de la planche",
  intro:
    "Après la partie 1, nous avons de nouveau enregistré un run **avec deux montres à la fois** — cette fois pour vérifier la **détection des pumps** et la **fin d'un run** (glisse ou enfoncement) face à une vérité couplée à la planche. Une **Forerunner 55** au poignet (GPS + accéléromètre 25 Hz) et une **fēnix 7X Pro** tantôt sur le fuselage du foil sous l'eau, tantôt à la cheville (accéléromètre 100 Hz) — chacune sur tout le run, synchronisées par l'horloge système et ajustées finement sur l'impulsion de décollage.",
  setup: {
    h: "Le montage",
    p: "Les deux montres tournent sur notre app d'enregistrement — c'est la seule façon d'obtenir le flux d'accélération brut. La fēnix au **pied** se comporte à peu près comme la planche ; sur le **fuselage** elle mesure directement l'assiette du foil (là le GPS est mort sous l'eau, mais l'accéléromètre continue).",
    capRumpf: "fēnix sur le fuselage du foil, sous l'eau",
    capFuss: "fēnix à la cheville, Forerunner 55 au poignet",
  },
  pump: {
    h: "Détection des pumps — conforme à la vérité",
    p: "Le capteur couplé à la planche voit chaque pump comme un cycle net. En comparaison, notre détecteur au **poignet** seul est étonnamment précis :",
    li: [
      "**Nombre :** 56 vs 59 · 38 vs 40 · 32 vs 31 pumps — à ±~5 %, sans sous-comptage systématique.",
      "**Cadence** quasi identique (~1,36–1,45 Hz).",
      "**Timing par pump :** 88–95 % de precision, 90 % de recall (±0,35 s).",
    ],
    cap: "Nombre et cadence des pumps : vérité planche vs. détecteur poignet",
  },
  glide: {
    h: "La fin d'un run — glisser vs. s'enfoncer",
    p: "Ça devient intéressant en fin de run. Le **GPS lâche justement là** — sur les deux montres — parce que le capteur plonge dès qu'on ralentit. L'accéléromètre continue pourtant, et le capteur proche de la planche sépare nettement : **sur le foil** la planche reste calme (amortie par le foil), **enfoncée** elle ballotte librement (grand mouvement lent de haut en bas).",
    li: [
      "La transition « encore sur le foil / en mouvement à la surface » → « enfoncé » est clairement visible dans l'accéléromètre de la planche.",
      "Notre détecteur termine le run **à ±2 s près** du vrai point d'enfoncement — la glisse finale n'est donc **pas** coupée.",
      "Le seuil de ~9 km/h correspond assez précisément à la **vitesse de décrochage** du foil.",
    ],
    cap: "Ballottement de la planche (bas = sur foil, haut = ballotte) ; vert = fin détecteur, violet = vrai point d'enfoncement",
  },
  limits: {
    h: "Limites honnêtes",
    p: "Ce ne sont que quelques runs, tous au même spot et très denses en pumps. Le **poignet seul** ne *voit* pas nettement le moment d'enfoncement (le bras bouge en pumpant comme en ballottant). Et les vraies longues glisses plaisir (eau lisse, downwind) ne sont pas encore dans ce jeu de données.",
  },
  outlook: {
    h: "La suite",
    p: "Pour l'instant nous **ne changeons volontairement rien** au détecteur, mais l'améliorons **guidés par les données** — avec plus de runs (y compris de longues glisses), une caméra sur la planche (**Insta360 X5**) comme vérité visuelle, et les données des utilisateurs de pumpfoil.org. C'est exactement ainsi que nous avons déjà affiné la détection plusieurs fois.",
  },
  videorun: {
    h: "Autre run de test (vidéo)",
    p:
      "Voici à quoi ressemble la mesure en vrai : **une montre à chaque poignet** et le **téléphone sur la planche** comme référence proche de la planche. Le détecteur au poignet seul colle bien à cette référence (nombre de pumps à quelques pour cent près). Leçon importante : aligner plusieurs appareils **à la seconde** demande un **top de synchro** délibéré au début (p. ex. 3 tapes fermes sur la planche) — l'heure système seule ne suffit pas.",
    cap: "Deux montres au poignet + téléphone sur la planche — le run en vidéo",
  },
};

const it: N3 = {
  back: "← Parte 2: Come funziona",
  h1: "Parte 3: La misura con due orologi — a che punto siamo",
  subtitle: "Secondo esperimento a due orologi: il polso contro una verità vicina alla tavola",
  intro:
    "Dopo la parte 1 abbiamo di nuovo registrato una run **con due orologi insieme** — stavolta per verificare il **rilevamento delle pumpate** e la **fine di una run** (planata o affondamento) contro una verità accoppiata alla tavola. Un **Forerunner 55** al polso (GPS + accelerometro 25 Hz) e un **fēnix 7X Pro** una volta sul fuso del foil sott'acqua, una volta alla caviglia (accelerometro 100 Hz) — ciascuno sull'intera run, sincronizzati con l'orologio di sistema e regolati con precisione sull'impulso di partenza.",
  setup: {
    h: "Il setup",
    p: "Entrambi gli orologi girano sulla nostra app di registrazione — solo così otteniamo il flusso di accelerazione grezzo. Il fēnix al **piede** si comporta all'incirca come la tavola; sul **fuso** misura direttamente l'assetto del foil (lì il GPS è morto sott'acqua, ma l'accelerometro continua).",
    capRumpf: "fēnix sul fuso del foil, sott'acqua",
    capFuss: "fēnix alla caviglia, Forerunner 55 al polso",
  },
  pump: {
    h: "Rilevamento pumpate — coincide con la verità",
    p: "Il sensore accoppiato alla tavola vede ogni pumpata come un ciclo netto. In confronto, il nostro rilevatore al **polso** da solo è sorprendentemente preciso:",
    li: [
      "**Numero:** 56 vs 59 · 38 vs 40 · 32 vs 31 pumpate — entro ±~5 %, senza sottostima sistematica.",
      "**Cadenza** praticamente identica (~1,36–1,45 Hz).",
      "**Timing per pumpata:** 88–95 % di precision, 90 % di recall (±0,35 s).",
    ],
    cap: "Numero e cadenza pumpate: verità tavola vs. rilevatore polso",
  },
  glide: {
    h: "La fine di una run — planare vs. affondare",
    p: "Diventa interessante alla fine della run. Il **GPS si perde proprio lì** — su entrambi gli orologi — perché il sensore va sott'acqua quando rallenti. L'accelerometro però continua, e il sensore vicino alla tavola lo separa nettamente: **sul foil** la tavola sta calma (smorzata dal foil), **affondata** ondeggia libera (grande, lento su e giù).",
    li: [
      "La transizione « ancora sul foil / in movimento in superficie » → « affondato » è chiaramente visibile nell'accelerometro della tavola.",
      "Il nostro rilevatore chiude la run **a ±2 s** dal vero punto di affondamento — la planata finale quindi **non** viene tagliata.",
      "La soglia di ~9 km/h corrisponde abbastanza precisamente alla **velocità di stallo** del foil.",
    ],
    cap: "Ondeggio tavola (basso = sul foil, alto = ondeggia); verde = fine rilevatore, viola = vero punto di affondamento",
  },
  limits: {
    h: "Limiti onesti",
    p: "Sono solo poche run, tutte nello stesso spot e dense di pumpate. Il **polso da solo** non *vede* nettamente il momento di affondamento (il braccio si muove pumpando come ondeggiando). E le planate lunghe di puro piacere (acqua piatta, downwind) non sono ancora in questo set di dati.",
  },
  outlook: {
    h: "Come si prosegue",
    p: "Per ora **non cambiamo volutamente nulla** nel rilevatore, ma lo miglioriamo **guidati dai dati** — con più run (anche planate lunghe), una camera sulla tavola (**Insta360 X5**) come verità visiva, e i dati degli utenti su pumpfoil.org. È esattamente così che abbiamo già affinato il rilevamento più volte.",
  },
  videorun: {
    h: "Un altro test (video)",
    p:
      "Ecco com'è la misurazione dal vivo: **un orologio per polso** più il **telefono sulla tavola** come riferimento vicino alla tavola. Il rilevatore da polso combacia bene con questa verità (numero di pump entro pochi punti percentuali). Lezione chiave: allineare più dispositivi **al secondo** richiede un **impulso di sync** deliberato all'inizio (es. 3 colpi decisi sulla tavola) — l'ora di sistema da sola non basta.",
    cap: "Due orologi ai polsi + telefono sulla tavola — il test in video",
  },
};

const es: N3 = {
  back: "← Parte 2: Cómo funciona",
  h1: "Parte 3: La medición con dos relojes — dónde estamos hoy",
  subtitle: "Segundo experimento con dos relojes: la muñeca frente a una verdad cercana a la tabla",
  intro:
    "Tras la parte 1 volvimos a registrar un run **con dos relojes a la vez** — esta vez para comprobar la **detección de pumps** y el **final de un run** (planeo o hundimiento) contra una verdad acoplada a la tabla. Un **Forerunner 55** en la muñeca (GPS + acelerómetro 25 Hz) y un **fēnix 7X Pro** una vez en el fuselaje del foil bajo el agua, otra en el tobillo (acelerómetro 100 Hz) — cada uno sobre todo el run, sincronizados por la hora del sistema y ajustados con precisión al impulso de despegue.",
  setup: {
    h: "El montaje",
    p: "Ambos relojes corren nuestra app de grabación — solo así obtenemos el flujo de aceleración en bruto. El fēnix en el **pie** se comporta más o menos como la tabla; en el **fuselaje** mide directamente la actitud del foil (allí el GPS está muerto bajo el agua, pero el acelerómetro sigue).",
    capRumpf: "fēnix en el fuselaje del foil, bajo el agua",
    capFuss: "fēnix en el tobillo, Forerunner 55 en la muñeca",
  },
  pump: {
    h: "Detección de pumps — coincide con la verdad",
    p: "El sensor acoplado a la tabla ve cada pump como un ciclo limpio. En comparación, nuestro detector de **muñeca** solo es sorprendentemente preciso:",
    li: [
      "**Número:** 56 vs 59 · 38 vs 40 · 32 vs 31 pumps — dentro de ±~5 %, sin subconteo sistemático.",
      "**Cadencia** prácticamente idéntica (~1,36–1,45 Hz).",
      "**Timing por pump:** 88–95 % de precision, 90 % de recall (±0,35 s).",
    ],
    cap: "Número y cadencia de pumps: verdad de la tabla vs. detector de muñeca",
  },
  glide: {
    h: "El final de un run — planear vs. hundirse",
    p: "Se pone interesante al final del run. El **GPS se pierde justo ahí** — en ambos relojes — porque el sensor se sumerge al frenar. Pero el acelerómetro sigue, y el sensor cercano a la tabla lo separa con nitidez: **sobre el foil** la tabla va tranquila (amortiguada por el foil), **hundida** cabecea libre (gran vaivén lento).",
    li: [
      "La transición « aún sobre el foil / en movimiento en la superficie » → « hundido » se ve claramente en el acelerómetro de la tabla.",
      "Nuestro detector termina el run **con ±2 s** del punto real de hundimiento — el planeo final por tanto **no** se recorta.",
      "El umbral de ~9 km/h coincide bastante con la **velocidad de pérdida** del foil.",
    ],
    cap: "Cabeceo de la tabla (bajo = sobre foil, alto = cabecea); verde = fin del detector, morado = punto real de hundimiento",
  },
  limits: {
    h: "Límites honestos",
    p: "Son solo unos pocos runs, todos en un spot y densos en pumps. La **muñeca sola** no *ve* con nitidez el momento de hundimiento (el brazo se mueve al pumpear igual que al cabecear). Y los planeos largos de puro disfrute (agua lisa, downwind) aún no están en este conjunto de datos.",
  },
  outlook: {
    h: "Cómo sigue",
    p: "Por ahora **no cambiamos nada a propósito** en el detector, sino que lo mejoramos **guiados por los datos** — con más runs (también planeos largos), una cámara en la tabla (**Insta360 X5**) como verdad visual, y los datos de los usuarios en pumpfoil.org. Así es exactamente como ya hemos afinado la detección varias veces.",
  },
  videorun: {
    h: "Otra prueba (vídeo)",
    p:
      "Así se ve la medición en la práctica: **un reloj en cada muñeca** y el **móvil en la tabla** como referencia cercana a la tabla. El detector solo de muñeca coincide bien con esa referencia (número de pumps con pocos por ciento de diferencia). Lección clave: alinear varios dispositivos **al segundo** requiere un **impulso de sincronización** deliberado al inicio (p. ej. 3 golpes firmes en la tabla) — la hora del sistema por sí sola no basta.",
    cap: "Dos relojes en las muñecas + móvil en la tabla — la prueba en vídeo",
  },
};

const fi: N3 = {
  back: "← Osa 2: Miten se toimii",
  h1: "Osa 3: Kahden kellon mittaus — missä olemme nyt",
  subtitle: "Toinen kahden kellon koe: ranne vastaan lautaa lähellä oleva totuus",
  intro:
    "Osan 1 jälkeen tallensimme vedon taas **kahdella kellolla yhtä aikaa** — tällä kertaa tarkistaaksemme **pumppauksen tunnistuksen** ja **vedon lopun** (liuku vai uppoaminen) lautaan kytkettyä totuutta vasten. **Forerunner 55** ranteessa (GPS + 25 Hz kiihtyvyys) ja **fēnix 7X Pro** kerran foilin rungossa veden alla, kerran nilkassa (100 Hz kiihtyvyys) — kumpikin koko vedon ajan, synkronoituna järjestelmäkellolla ja hienosäädettynä ponnistusimpulssin mukaan.",
  setup: {
    h: "Kokoonpano",
    p: "Molemmat kellot pyörittävät tallennussovellustamme — vain niin saamme raa'an kiihtyvyysvirran. **Jalassa** oleva fēnix käyttäytyy suunnilleen kuin lauta; **rungossa** se mittaa foilin asennon suoraan (siellä GPS on veden alla kuollut, mutta kiihtyvyys jatkaa).",
    capRumpf: "fēnix foilin rungossa, veden alla",
    capFuss: "fēnix nilkassa, Forerunner 55 ranteessa",
  },
  pump: {
    h: "Pumppauksen tunnistus — täsmää totuuteen",
    p: "Lautaan kytketty anturi näkee jokaisen pumppauksen yhtenä puhtaana jaksona. Siihen verrattuna pelkkä **ranne**tunnistimemme osuu yllättävän tarkasti:",
    li: [
      "**Määrä:** 56 vs 59 · 38 vs 40 · 32 vs 31 pumppausta — ±~5 % sisällä, ei järjestelmällistä alilaskentaa.",
      "**Kadenssi** käytännössä identtinen (~1,36–1,45 Hz).",
      "**Pumppauskohtainen ajoitus:** 88–95 % precision, 90 % recall (±0,35 s).",
    ],
    cap: "Pumppausten määrä ja kadenssi: laudan totuus vs. rannetunnistin",
  },
  glide: {
    h: "Vedon loppu — liuku vai uppoaminen",
    p: "Vedon lopussa käy kiinnostavaksi. **GPS katoaa juuri siinä** — molemmissa kelloissa — koska anturi sukeltaa, kun hidastut. Kiihtyvyys jatkaa kuitenkin, ja lautaa lähellä oleva anturi erottaa sen selvästi: **foililla** lauta pysyy rauhallisena (foilin vaimentamana), **uponneena** se keinuu vapaasti (suuri, hidas ylös-alas).",
    li: [
      "Siirtymä ”vielä foililla / liikkeessä pinnalla” → ”uponnut” näkyy selvästi laudan kiihtyvyydessä.",
      "Tunnistimemme päättää vedon **±2 s tarkkuudella** todellisesta uppoamiskohdasta — loppuliukua ei siis **leikata** pois.",
      "~9 km/h:n raja vastaa melko tarkasti foilin **sakkausnopeutta**.",
    ],
    cap: "Laudan keinunta (matala = foililla, korkea = keinuu vapaasti); vihreä = tunnistimen loppu, violetti = todellinen uppoamiskohta",
  },
  limits: {
    h: "Rehelliset rajat",
    p: "Kyseessä on vain muutama veto, kaikki samalla spotilla ja pumppaustiheitä. Pelkkä **ranne** ei *näe* uppoamishetkeä selvästi (käsi heiluu pumpatessa kuin keinuessakin). Ja todella pitkät nautintoliu'ut (tyyni vesi, downwind) eivät ole vielä tässä aineistossa.",
  },
  outlook: {
    h: "Miten tästä eteenpäin",
    p: "Emme **tarkoituksella muuta mitään** tunnistimessa nyt, vaan parannamme sitä **datavetoisesti** — useammilla vedoilla (myös pitkillä liu'uilla), laudalla olevalla kameralla (**Insta360 X5**) visuaalisena totuutena ja pumpfoil.org-käyttäjien datalla. Juuri näin olemme jo useaan kertaan terävöittäneet tunnistusta.",
  },
  videorun: {
    h: "Toinen testiajo (video)",
    p:
      "Näin mittaus näyttää käytännössä: **kello molemmissa ranteissa** ja **puhelin laudalla** lauta­läheisenä referenssinä. Pelkkä rannedetektori vastaa hyvin tätä referenssiä (pumppausmäärä muutaman prosentin tarkkuudella). Tärkeä oppi: usean laitteen kohdistus **sekunnin tarkkuudella** vaatii alussa tietoisen **synkkaus­napautuksen** (esim. 3 napautusta lautaan) — pelkkä järjestelmäaika ei riitä.",
    cap: "Kaksi ranne­kelloa + puhelin laudalla — testiajo videolla",
  },
};

const nl: N3 = {
  back: "← Deel 2: Hoe het werkt",
  h1: "Deel 3: De dubbel-horloge-meting — waar we vandaag staan",
  subtitle: "Tweede twee-horloges-experiment: pols tegen board-nabije waarheid",
  intro:
    "Na deel 1 hebben we opnieuw **tegelijkertijd met twee horloges** gemeten — dit keer om de **pump-detectie** en het **einde van een run** (glijden dan wel wegzakken) tegen een board-gekoppelde waarheid te toetsen. Een **Forerunner 55** om de pols (GPS + 25 Hz accel) en een **fēnix 7X Pro** de ene keer op de foil-fuselage onder water, de andere keer om de enkel (100 Hz accel) — telkens over de hele run, beide via de systeemtijd synchroon en fijn uitgelijnd op de afsprong-impuls.",
  setup: {
    h: "De opstelling",
    p: "Beide horloges draaien op onze recorder-app — alleen zo krijgen we de ruwe versnellings-datastroom. De fēnix aan de **voet** gedraagt zich bij benadering als het board; op de **fuselage** meet hij de foil-oriëntatie direct (daar is de GPS onder water dood, maar de accel loopt door).",
    capRumpf: "fēnix op de foil-fuselage, onder water",
    capFuss: "fēnix om de enkel, Forerunner 55 om de pols",
  },
  pump: {
    h: "Pump-detectie — klopt tegen de waarheid",
    p: "De board-gekoppelde sensor ziet elke pump als één schone cyclus. Daarmee vergeleken treft onze pure **pols**-detector verrassend nauwkeurig:",
    li: [
      "**Aantal:** 56 vs 59 · 38 vs 40 · 32 vs 31 pumps — binnen ±~5 %, geen systematisch ondertellen.",
      "**Cadans** praktisch identiek (~1,36–1,45 Hz).",
      "**Per-pump-timing:** 88–95 % precision, 90 % recall (±0,35 s).",
    ],
    cap: "Pump-aantal & -cadans: board-waarheid vs. pols-detector",
  },
  glide: {
    h: "Het run-einde — glijden vs. wegzakken",
    p: "Interessant wordt het aan het run-einde. De **GPS valt precies daar uit** — op beide horloges — omdat de sensor onderduikt zodra je langzamer wordt. De accel loopt echter door, en de board-nabije sensor scheidt het netjes: **op de foil** ligt het board rustig (foil-gedempt), **weggezakt** dobbert het vrij (groot, langzaam op-en-neer).",
    li: [
      "De overgang ‘nog op de foil / aan het oppervlak in beweging’ → ‘weggezakt’ is in de board-accel duidelijk herkenbaar.",
      "Onze detector beëindigt de run **op ±2 s nauwkeurig** bij het echte wegzak-punt — de uitloop wordt dus **niet** afgesneden.",
      "De ~9-km/h-grens komt vrij precies overeen met de **stall-snelheid** van de foil.",
    ],
    cap: "Board-gedobber (laag = op de foil, hoog = dobbert vrij); groen = detector-einde, paars = echt wegzak-punt",
  },
  limits: {
    h: "Eerlijke grenzen",
    p: "Het zijn maar een paar runs, allemaal op één spot en pump-dicht. De **pols alleen** *ziet* het wegzak-moment niet zuiver (de arm schudt bij het pompen net als bij het dobberen). En de echt lange genot-glides (glassy, downwind) zitten nog niet in deze dataset.",
  },
  outlook: {
    h: "Hoe het verdergaat",
    p: "We veranderen nu **bewust niets** aan de detector, maar verbeteren **datagedreven** — met meer runs (ook lange glides), een board-camera (**Insta360 X5**) als visuele waarheid en de data van de gebruikers op pumpfoil.org. Precies zo hebben we de detectie al meermaals aangescherpt.",
  },
  videorun: {
    h: "Nog een testrun (video)",
    p:
      "Zo ziet de meting er in het echt uit: **een horloge om elke pols** en de **telefoon op de board** als board-nabije referentie. De pure pols-detector komt hier goed mee overeen (aantal pumps op een paar procent na). Belangrijke les: meerdere apparaten **op de seconde** uitlijnen vereist een bewuste **sync-tik** aan het begin (bijv. 3× stevig op de board tikken) — systeemtijd alleen is niet genoeg.",
    cap: "Twee horloges om de pols + telefoon op de board — de testrun op video",
  },
};

const cs: N3 = {
  back: "← Část 2: Jak to funguje",
  h1: "Část 3: Měření se dvěma hodinkami — kde dnes stojíme",
  subtitle: "Druhý experiment se dvěma hodinkami: zápěstí proti pravdě u prkna",
  intro:
    "Po části 1 jsme znovu měřili **současně dvěma hodinkami** — tentokrát, abychom prověřili **detekci pumpnutí** a **konec jízdy** (klouzání, resp. potopení) proti pravdě navázané na prkno. Jedny **Forerunner 55** na zápěstí (GPS + 25 Hz zrychlení) a jedny **fēnix 7X Pro** jednou na trupu foilu pod vodou, jednou na kotníku (100 Hz zrychlení) — vždy přes celou jízdu, obojí synchronizované přes systémový čas a jemně doladěné podle impulsu odrazu.",
  setup: {
    h: "Sestava",
    p: "Obě hodinky běží na naší záznamové aplikaci — jen tak dostaneme surový datový tok zrychlení. Hodinky fēnix na **noze** se chovají přibližně jako prkno; na **trupu** měří polohu foilu přímo (tam je GPS pod vodou mrtvé, ale zrychlení běží dál).",
    capRumpf: "fēnix na trupu foilu, pod vodou",
    capFuss: "fēnix na kotníku, Forerunner 55 na zápěstí",
  },
  pump: {
    h: "Detekce pumpnutí — souhlasí s pravdou",
    p: "Senzor navázaný na prkno vidí každé pumpnutí jako jeden čistý cyklus. V porovnání s ním trefuje náš čistě **zápěstní** detektor překvapivě přesně:",
    li: [
      "**Počet:** 56 vs 59 · 38 vs 40 · 32 vs 31 pumpnutí — na ±~5 %, žádné systematické podpočítávání.",
      "**Kadence** prakticky identická (~1,36–1,45 Hz).",
      "**Časování jednotlivých pumpnutí:** 88–95 % precision, 90 % recall (±0,35 s).",
    ],
    cap: "Počet a kadence pumpnutí: pravda z prkna vs. zápěstní detektor",
  },
  glide: {
    h: "Konec jízdy — klouzání vs. potopení",
    p: "Zajímavé to začne být na konci jízdy. **GPS vypadne přesně tam** — na obou hodinkách — protože senzor se potopí, jakmile zpomalíš. Zrychlení ale běží dál a senzor u prkna to čistě rozliší: **na foilu** leží prkno klidně (tlumené foilem), **potopené** se volně kolébá (velké, pomalé nahoru a dolů).",
    li: [
      "Přechod „ještě na foilu / v pohybu na hladině“ → „potopeno“ je ve zrychlení prkna jasně rozpoznatelný.",
      "Náš detektor ukončí jízdu **s přesností ±2 s** ve skutečném bodě potopení — dojezd se tedy **neusekne**.",
      "Hranice ~9 km/h odpovídá docela přesně **pádové rychlosti** foilu.",
    ],
    cap: "Kolébání prkna (nízko = na foilu, vysoko = volně se kolébá); zelená = konec detektoru, fialová = skutečný bod potopení",
  },
  limits: {
    h: "Poctivé meze",
    p: "Je to jen pár jízd, všechny na jednom spotu a s hustým pumpováním. **Samotné zápěstí** okamžik potopení *nevidí* čistě (paže se při pumpování třese stejně jako při kolébání). A opravdu dlouhá požitkářská klouzání (glassy, downwind) v tomto datasetu ještě nejsou.",
  },
  outlook: {
    h: "Jak to půjde dál",
    p: "Na detektoru teď **záměrně nic neměníme**, ale zlepšujeme ho **na základě dat** — s více jízdami (i dlouhými klouzáními), s kamerou na prkně (**Insta360 X5**) jako vizuální pravdou a s daty uživatelů na pumpfoil.org. Přesně takhle jsme detekci už několikrát doostřili.",
  },
  videorun: {
    h: "Další testovací jízda (video)",
    p:
      "Takto vypadá měření v praxi: **hodinky na každém zápěstí** a **telefon na prkně** jako referenci blízko prkna. Samotný zápěstní detektor s touto referencí dobře souhlasí (počet pumpů s odchylkou několika procent). Důležité ponaučení: zarovnat více zařízení **na sekundu** vyžaduje na začátku vědomý **synchronizační ťuk** (např. 3× pevně ťuknout do prkna) — samotný systémový čas nestačí.",
    cap: "Dvoje hodinky na zápěstích + telefon na prkně — testovací jízda ve videu",
  },
};

// Partial (siehe nerd1): fehlende Sprachen fallen im Consumer auf `de` zurück.

const id: N3 = {
  "back": "← Bagian 2: Cara Kerjanya",
  "h1": "Bagian 3: Pengukuran Dual-Watch — di mana kami hari ini",
  "subtitle": "Eksperimen dua-jam tangan kedua: pergelangan tangan versus kebenaran dekat-papan",
  "intro": "Setelah bagian 1 kami kembali mengukur **secara bersamaan dengan dua jam tangan** — kali ini, untuk menguji **deteksi pompa** dan **akhir lari** (glide atau jatuh) terhadap kebenaran yang terikat-papan. Sebuah **Forerunner 55** di pergelangan tangan (GPS + 25 Hz akselerasi) dan sebuah **fēnix 7X Pro** sekali di rumpun foil di bawah air, sekali di pergelangan kaki (100 Hz akselerasi) — masing-masing selama seluruh lari, keduanya sinkron melalui waktu sistem dan disetel halus melalui impuls takeoff.",
  "setup": {
    "h": "Penyiapannya",
    "p": "Kedua jam tangan menjalankan aplikasi recorder kami — hanya begitu kami mendapatkan aliran data akselerasi mentah. fēnix di **kaki** berperilaku kurang lebih seperti papan; di **rumpun** itu mengukur orientasi foil secara langsung (GPS mati di sana di bawah air, tetapi akselerasi terus melalui).",
    "capRumpf": "fēnix di rumpun foil, di bawah air",
    "capFuss": "fēnix di pergelangan kaki, Forerunner 55 di pergelangan tangan"
  },
  "pump": {
    "h": "Deteksi pompa — cocok terhadap kebenaran",
    "p": "Sensor yang terikat-papan melihat setiap pompa sebagai satu siklus bersih. Dibandingkan dengan itu, detektor **pergelangan tangan** murni kami memukul dengan akurat mengejutkan:",
    "li": [
      "**Angka:** 56 vs 59 · 38 vs 40 · 32 vs 31 pompa — pada ±~5%, tanpa under-counting sistematis.",
      "**Kadence** hampir identik (~1,36–1,45 Hz).",
      "**Waktu per-pompa:** presisi 88–95%, recall 90% (±0,35 detik)."
    ],
    "cap": "Angka & kadence pompa: kebenaran-papan vs. detektor pergelangan tangan"
  },
  "glide": {
    "h": "Akhir lari — glide vs. jatuh",
    "p": "Menjadi menarik di akhir lari. **GPS jatuh persis di sana** — pada kedua jam tangan — karena sensor menyelam segera setelah Anda melambat. Tetapi akselerasi terus melalui, dan sensor dekat-papan memisahkannya dengan bersih: **di foil** papan diam (foil-teredam), **jatuh** itu bergoyang bebas (besar, naik-turun lambat).",
    "li": [
      "Transisi \"masih di foil / di permukaan bergerak\" → \"jatuh\" jelas terlihat dalam akselerasi papan.",
      "Detektor kami mengakhiri lari **pada ±2 detik presisi** pada titik jatuh yang asli — peluncuran jadi **tidak** dipotong pendek.",
      "Batas ~9-km/h sesuai dengan **kecepatan stall** foil dengan cukup baik."
    ],
    "cap": "Papan-bobbing (rendah = di foil, tinggi = bergoyang bebas); hijau = akhir detektor, ungu = titik jatuh asli"
  },
  "limits": {
    "h": "Batas jujur",
    "p": "Hanya beberapa lari, semua di satu spot dan padat-pompa. **Pergelangan tangan sendiri** tidak *melihat* momen jatuh dengan bersih (lengan bergoyang saat memompa seperti saat bergoyang). Dan glides genua-panjang yang benar-benar nyaman (glassy, downwind) belum ada dalam kumpulan data ini."
  },
  "outlook": {
    "h": "Bagaimana terusnya",
    "p": "Kami sekarang **dengan sengaja mengubah apa-apa** pada detektor, tetapi meningkatkan **didorong-data** — dengan lebih banyak lari (juga glides panjang), kamera papan (**Insta360 X5**) sebagai kebenaran visual dan data pengguna di pumpfoil.org. Itulah cara kami telah menajamkan pengenalan beberapa kali sebelumnya."
  },
  "videorun": {
    "h": "Lari uji lebih lanjut (Video)",
    "p": "Inilah pengukuran yang terlihat dalam kehidupan nyata: **jam tangan di setiap tangan** dan **handy di papan** sebagai referensi dekat-papan. Detektor pergelangan tangan murni sesuai dengan baik dengan kebenaran dekat-papan (angka pompa akurat hingga beberapa persen). Pelajaran penting: untuk penyelarasan **presisi-detik** dari beberapa perangkat, diperlukan **impuls sinkronisasi sadar** di awal (mis. 3× ketuk papan dengan kuat) — waktu sistem saja tidak cukup.",
    "cap": "Dua jam tangan di pergelangan tangan + handy di papan — lari uji dalam video"
  }
};


const ja: N3 = {
  "back": "← パート2：機能方法",
  "h1": "パート3：デュアルウォッチ計測 — 今日の立場",
  "subtitle": "2番目のデュアルウォッチ実験：リスト対ボード近傍真実",
  "intro": "パート1の後、再び**同時に2つのウォッチ**で計測 — 今回は**ポンプ検出**とランの**エンド**（グライド対沈下）をボード結合真実に対してチェック。リスト上の**Forerunner 55**（GPS + 25 Hz accel）と**fēnix 7X Pro**はフォイルフューセラージ水中、足首（100 Hz accel）の一度 — ランの全体に越えて、両方ともシステム時刻経由で同期され、テイクオフインパルス上で微調整。",
  "setup": {
    "h": "セットアップ",
    "p": "両方のウォッチは自社レコーダーアプリで実行 — そのようにしてだけ生加速度データストリームを得ます。**足**上のfēnixは大まかにボードのような振舞い；**フューセラージ**上でそれはフォイル姿勢を直接計測（GPS無し水中、しかしaccelが走り抜ける）。",
    "capRumpf": "フォイルフューセラージ上のfēnix、水中",
    "capFuss": "足首上のfēnix、リスト上のForerunner 55"
  },
  "pump": {
    "h": "ポンプ検出 — 真実に対して一致",
    "p": "ボード結合センサーは各ポンプを1つのクリーンサイクルとして見ます。それに対して、純粋な**リスト**検出器は驚くほど正確：",
    "li": [
      "**数：** 56対59 · 38対40 · 32対31ポンプ — ±~5%内、体系的な過少カウントなし。",
      "**ケイデンス**実質的に同一（~1.36～1.45 Hz）。",
      "**ポンプごとタイミング：** 88～95%精度、90%リコール（±0.35秒）。"
    ],
    "cap": "ポンプ数とケイデンス：ボード真実対リスト検出器"
  },
  "glide": {
    "h": "ラン終了 — グライド対沈下",
    "p": "ラン終了で興味深くなります。**GPSはちょうどそこで外れます** — 両ウォッチで — センサーが沈むから、スロー時間を減らします。Accelは走り抜けますが、ボード近傍センサーはきれいに分離：**フォイル上**ボードは静か（フォイル減衰）、**沈下**それは自由に動揺（大きく、遅い上下）。",
    "li": [
      "トランジション「まだフォイル上 / 表面上で動く」 → 「沈下」はボードAccelで明確に見える。",
      "当社検出器は本当の沈下ポイントで**±2秒内**ランを終了 — グライドアウトは**カット**されません。",
      "~9 km/h限界はフォイルの**失速速度**にかなり一致。"
    ],
    "cap": "ボード揺れ（低 = フォイル上、高 = 自由に動揺）；緑 = 検出器エンド、紫 = 本当の沈下ポイント"
  },
  "limits": {
    "h": "正直な限界",
    "p": "それはただの少数ランで、すべて1つのスポット、ポンプ密度。**リストだけ**は沈下モーメントを*クリーンに見ない*（腕はポンプ中と動揺中に動く）。そして本当に長い楽しみグライド（ガラス質、ダウンウインド）はまだこのデータセットにありません。"
  },
  "outlook": {
    "h": "どこへ進むか",
    "p": "私たちは今**意図的に何も変わらない**検出器で、しかし改善を**データドリブン** — より多くのラン（長いグライドも含む）、ボードカメラ（**Insta360 X5**）視覚真実として、および pumpfoil.org上のユーザーデータで。これは正確にどのように既に何度も検出を研ぎ澄ましてきました。"
  },
  "videorun": {
    "h": "別の試験ラン（ビデオ）",
    "p": "計測が実際にどう見えるか：**各手に1つのウォッチ**およびボード近傍参照として**ボード上の携帯**。純粋なリスト検出器はボード近傍真実とよく並ぶ（ポンプ数は数パーセント内）。重要な教訓：複数デバイスを**秒内**に調整するには、最初に意識的な**シンク衝撃**が必要（例ボード上で3回力強くタップ） — システム時刻だけでは十分。",
    "cap": "リスト上の2つのウォッチ + ボード上の携帯 — ビデオ内の試験ラン"
  }
};


const nb: N3 = {
  "back": "← Del 2: Hvordan det fungerer",
  "h1": "Del 3: Dobbelt-klokke-målingen — hvor vi står i dag",
  "subtitle": "Andre to-klokke-forsøk: håndleddet mot board-nær sannhet",
  "intro": "Etter Del 1 målte vi igjen **samtidig med to klokker** — denne gangen for å teste **pump-gjenkjenningen** og **slutten av en tur** (gliding eller synking) mot en board-koplet sannhet. En **Forerunner 55** på håndleddet (GPS + 25 Hz Accel) og en **fēnix 7X Pro** en gang på foil-skroget under vann, en gang på ankelen (100 Hz Accel) — hele turen for begge, begge synkront via systemtiden og fininjustert via hoppe-impulsen.",
  "setup": {
    "h": "Oppsettet",
    "p": "Begge klokker kjørte på vår recorder-app — bare sånn får vi råakselerasjons-datastrømmen. Fenix på **ankelen** oppfører seg omtrent som brettet; på **skroget** måler den foil-posisjonen direkte (der er GPS dødvann under vann, men Accel går igjennom).",
    "capRumpf": "fēnix på foil-skroget, under vann",
    "capFuss": "fēnix på ankelen, Forerunner 55 på håndleddet"
  },
  "pump": {
    "h": "Pump-gjenkjenning — stemmer mot sannheten",
    "p": "Den board-koplet sensor ser hver pump som en ren syklus. Sammenlignet med det treffer vår rene **håndledds**-detektor overraskende nøyaktig:",
    "li": [
      "**Antall:** 56 vs 59 · 38 vs 40 · 32 vs 31 pumps — på ±~5 %, ingen systematisk under-telling.",
      "**Kadense** praktisk identisk (~1,36–1,45 Hz).",
      "**Per-pump-timing:** 88–95 % Precision, 90 % Recall (±0,35 s)."
    ],
    "cap": "Pump-antall & -kadense: Board-sannhet vs. håndledds-detektor"
  },
  "glide": {
    "h": "Tur-slutten — gliding vs. synking",
    "p": "Spennende blir det ved tur-slutten. **GPS faller akkurat der ut** — på begge klokker — fordi sensoren dykker ned når du blir saktere. Accel går dog igjennom, og den board-nær sensor skiller det rent: **på foilen** ligger brettet stille (foil-dempet), **sunket** duver det fritt (stort, langsomt opp og ned).",
    "li": [
      "Overgangen «fortsatt på foil / på overflaten i bevegelse» → «sunket» er klart synlig i board-Accel.",
      "Vår detektor avslutter turen **på ±2 s nøyaktig** ved det virkelige synke-punktet — utløpet blir altså **ikke** klippet av.",
      "~9-km/h-grensen svarer ganske nøyaktig til foilens **stallhastighet**."
    ],
    "cap": "Board-bobbing (lavt = på foil, høyt = duver fritt); grønt = detektor-slutt, lilla = virkelig synke-punkt"
  },
  "limits": {
    "h": "Ærlige grenser",
    "p": "Det er bare få turer, alle på ett spot og pump-tette. **Håndleddet alene** *ser* synke-øyeblikket ikke rent (armen vifter like mye under pumping som under duving). Og de virkelig lange glede-glides (glassy, nedvind) er ikke ennå i dette datasettet."
  },
  "outlook": {
    "h": "Hvordan det fortsetter",
    "p": "Vi endrer nå **ingenting bevisst** på detektoren, men forbedrer **datadrevet** — med flere turer (også lange glides), ett board-kamera (**Insta360 X5**) som visuell sannhet og dataene fra brukerne på pumpfoil.org. Akkurat sånn har vi skarpt gjenkjenningen flere ganger før."
  },
  "videorun": {
    "h": "Annen testtur (Video)",
    "p": "Sånn ser målingen ut i virkeligheten: **på hver hånd en klokke** og **mobilen på brettet** som board-nær referanse. Den rene håndledds-detektoren stemmer godt med board-nær sannhet (pump-antall på få prosent nøyaktig). Viktig læring: for **sekundnøyaktig** justering av flere enheter trenger du på begynnelsen en bevisst **sync-impuls** (f. eks. 3× hardt slå på brettet) — systemtiden alene reker ikke.",
    "cap": "To klokker på håndleddet + mobil på brettet — testuren i videoen"
  }
};


const ptPT: N3 = {
  "back": "← Parte 2: Como funciona",
  "h1": "Parte 3: A medição de dupla relógio — onde estamos hoje",
  "subtitle": "Segunda experiência de dupla relógio: mão contra verdade próxima da prancha",
  "intro": "Após a Parte 1 medimos novamente **em simultâneo com dois relógios** — desta vez, para testar a **deteção de bombeio** e o **fim de uma sessão** (planagem e afundamento) contra uma verdade próxima da prancha. Um **Forerunner 55** na mão (GPS + 25 Hz aceleração) e um **fēnix 7X Pro** uma vez no casco do foil debaixo de água, uma vez no tornozelo (100 Hz aceleração) — cada um ao longo de toda a sessão, ambos sincronizados pela hora do sistema e afinados pelo impulso de salto.",
  "setup": {
    "h": "O equipamento",
    "p": "Ambos os relógios funcionam na nossa app de gravação — só assim obtemos o fluxo de aceleração bruto. O fēnix no **pé** comporta-se aproximadamente como a prancha; no **casco** mede a posição do foil diretamente (lá o GPS está morto debaixo de água, mas a aceleração funciona através).",
    "capRumpf": "fēnix no casco do foil, debaixo de água",
    "capFuss": "fēnix no pé, Forerunner 55 na mão"
  },
  "pump": {
    "h": "Deteção de bombeio — correto contra a verdade",
    "p": "O sensor próximo da prancha vê cada bombeio como um ciclo limpo. Comparado com isto o nosso puro detetor de **mão** é surpreendentemente preciso:",
    "li": [
      "**Número:** 56 vs 59 · 38 vs 40 · 32 vs 31 bombeios — ~±5%, sem subestimação sistemática.",
      "**Cadência** praticamente idêntica (~1,36–1,45 Hz).",
      "**Tempo por bombeio:** 88–95% precisão, 90% recall (±0,35s)."
    ],
    "cap": "Número e cadência de bombeio: verdade de prancha vs. detetor de mão"
  },
  "glide": {
    "h": "O fim da sessão — planagem vs. afundamento",
    "p": "Fica interessante no fim da sessão. O **GPS falha exatamente lá** — em ambos os relógios — porque o sensor mergulha assim que fica mais lento. Mas a aceleração funciona, e o sensor próximo da prancha separa-o bem: **em foil** a prancha fica quieta (amortecida por foil), **afundada** balança livremente (grande, lento sobe e desce).",
    "li": [
      "A transição «ainda em foil / à superfície em movimento» → «afundada» é claramente reconhecível na aceleração próxima da prancha.",
      "O nosso detetor termina a sessão **±2s preciso** no ponto real de afundamento — o arrefecimento portanto **não** é cortado.",
      "O limite ~9 km/h corresponde bastante bem à **velocidade de paragem** do foil."
    ],
    "cap": "Balançamento de prancha (baixo = em foil, alto = balança livre); verde = fim do detetor, roxo = ponto real de afundamento"
  },
  "limits": {
    "h": "Limites honestos",
    "p": "São apenas poucas sessões, todas num spot e cheias de bombeios. A **mão sozinha** *vê* o momento de afundamento não limpo (o braço balança ao bombear como ao oscilar). E os longos deslizes de desfrute reais (glassy, downwind) ainda não estão neste conjunto de dados."
  },
  "outlook": {
    "h": "Como continua",
    "p": "Agora **conscientemente não mudamos nada** no detetor, mas melhoramos **baseado em dados** — com mais sessões (também deslizes longos), uma câmara de prancha (**Insta360 X5**) como verdade visual e os dados dos utilizadores em pumpfoil.org. Exatamente assim já afiámos a deteção várias vezes."
  },
  "videorun": {
    "h": "Outro teste (vídeo)",
    "p": "Assim é a medição em realidade: **um relógio em cada mão** e o **telemóvel na prancha** como referência próxima da prancha. O puro detetor de mão combina bem com a verdade próxima da prancha (número de bombeios para poucos %). Lição importante: para alinhamento **segundo-preciso** de vários aparelhos precisa-se de um **impulso de sincronismo** consciencioso no início (p.ex. bater 3× firmemente na prancha) — a hora do sistema sozinha não chega.",
    "cap": "Dois relógios na mão + telemóvel na prancha — o teste em vídeo"
  }
};


const pt: N3 = {
  "back": "← Parte 2: Como funciona",
  "h1": "Parte 3: A Medição Dual-Relógio — Onde Estamos Agora",
  "subtitle": "Segundo experimento de dois relógios: pulso contra verdade próxima à prancha",
  "intro": "Depois da Parte 1, medimos novamente **simultaneamente com dois relógios** — desta vez, para testar o **reconhecimento de pump** e o **fim de uma sessão** (glide ou afundamento) contra uma verdade acoplada à prancha. Um **Forerunner 55** no pulso (GPS + 25 Hz aceleração) e um **fēnix 7X Pro** uma vez no casco do foil embaixo da água, uma vez no tornozelo (100 Hz aceleração) — cada um durante toda a sessão, ambos sincronizados via hora do sistema e ajustados com precisão pelo impulso de salto.",
  "setup": {
    "h": "O Setup",
    "p": "Ambos os relógios rodam em nosso app de gravador — apenas assim conseguimos o fluxo de aceleração bruto. O fēnix no **tornozelo** se comporta aproximadamente como a prancha; no **casco** mede a posição do foil diretamente (lá o GPS fica embaixo da água, a aceleração segue).",
    "capRumpf": "fēnix no casco do foil, embaixo da água",
    "capFuss": "fēnix no tornozelo, Forerunner 55 no pulso"
  },
  "pump": {
    "h": "Reconhecimento de Pump — Correto Contra a Verdade",
    "p": "O sensor acoplado à prancha vê cada pump como um ciclo limpo. Comparado com isso, nosso puro detetor de **pulso** acerta surpreendentemente bem:",
    "li": [
      "**Número:** 56 vs 59 · 38 vs 40 · 32 vs 31 pumps — em ±~5 %, nenhuma contagem sistemática baixa.",
      "**Cadência** praticamente idêntica (~1,36–1,45 Hz).",
      "**Tempo por pump:** 88–95 % precisão, 90 % recall (±0,35 s)."
    ],
    "cap": "Número e cadência de pump: verdade de prancha vs. detetor de pulso"
  },
  "glide": {
    "h": "O Fim da Sessão — Glide vs. Afundamento",
    "p": "Fica interessante no fim da sessão. O **GPS cai exatamente ali** — em ambos os relógios —, porque o sensor mergulha assim que você fica mais lento. Mas a aceleração segue, e o sensor próximo à prancha separa bem: **no foil** a prancha fica quieta (amortecida pelo foil), **afundada** ela cabeceia livremente (grande e lento para cima e para baixo).",
    "li": [
      "A transição «ainda no foil / na superfície em movimento» → «afundada» é claramente reconhecível na aceleração da prancha.",
      "Nosso detetor encerra a sessão **com ±2 s de precisão** no ponto real de afundamento — o arremate portanto **não é** cortado.",
      "O limite de ~9 km/h corresponde bastante bem à **velocidade de parada** do foil."
    ],
    "cap": "Bobbing da prancha (baixo = no foil, alto = cabeceia livremente); verde = fim do detetor, roxo = ponto real de afundamento"
  },
  "limits": {
    "h": "Limites Honestos",
    "p": "São apenas poucos laufs, todos em um spot e densos em pump. O **pulso sozinho** *não vê* o momento de afundamento nitidamente (o braço se agita ao bombear como ao cabecear). E os verdadeiros glides de aproveitamento longo (glassy, downwind) ainda não estão neste conjunto de dados."
  },
  "outlook": {
    "h": "Como Continua",
    "p": "Agora **intencionalmente não mudamos nada** no detetor, mas melhoramos **orientado por dados** — com mais laufs (também glides longos), uma câmera de prancha (**Insta360 X5**) como verdade visual e os dados de usuários em pumpfoil.org. Exatamente assim já afiamos o reconhecimento várias vezes."
  },
  "videorun": {
    "h": "Mais um Testlauf (Vídeo)",
    "p": "Assim é como fica a medição na prática: **um relógio em cada mão** e o **celular na prancha** como referência próxima à prancha. O puro detetor de pulso fica bem com a verdade próxima à prancha (número de pump com alguns porcento de precisão). Lição importante: para alinhamento **segundo-preciso** de vários aparelhos você precisa de um **impulso de sincronia** consciente no início (p. ex., bater 3× na prancha) — apenas o tempo do sistema não é suficiente.",
    "cap": "Dois relógios no pulso + celular na prancha — o testlauf no vídeo"
  }
};


const ru: N3 = {
  "back": "← Часть 2: Как это работает",
  "h1": "Часть 3: Двойные часы — где мы сейчас",
  "subtitle": "Второй эксперимент с двумя часами: запястье против истины рядом с доской",
  "intro": "После Части 1 мы снова **одновременно измеряли двумя часами** — на этот раз чтобы проверить **Pump-распознавание** и **конец лауна** (глайд или опускание) против истины связанной с доской. **Forerunner 55** на запястье (GPS + 25 Hz Accel) и **fēnix 7X Pro** один раз на фойл-корпусе под водой, один раз на щиколотке (100 Hz Accel) — оба на протяжении всего лауна, оба синхронизированы через системное время и точно настроены через прыжок-импульс.",
  "setup": {
    "h": "Установка",
    "p": "Обе часы работают на нашем приложении-рекордере — только так получаем сырой поток данных ускорения. Fēnix на **щиколотке** ведёт себя примерно как доска; на **корпусе** измеряет положение фойла напрямую (там GPS под водой мёртв, но Accel идёт дальше).",
    "capRumpf": "fēnix на корпусе фойла, под водой",
    "capFuss": "fēnix на щиколотке, Forerunner 55 на запястье"
  },
  "pump": {
    "h": "Pump-распознавание — совпадает с истиной",
    "p": "Датчик связанный с доской видит каждый Pump как чистый цикл. Сравнивая с этим, наш чистый **запястный** детектор удивительно точен:",
    "li": [
      "**Количество:** 56 vs 59 · 38 vs 40 · 32 vs 31 Pumps — на ±~5 %, нет систематического недосчёта.",
      "**Кадансия** практически идентична (~1,36–1,45 Hz).",
      "**Время за Pump:** 88–95 % точность, 90 % полнота (±0,35 s)."
    ],
    "cap": "Pump-количество и кадансия: доска-истина vs. запястный детектор"
  },
  "glide": {
    "h": "Конец лауна — глайд vs. опускание",
    "p": "Интересно становится в конце лауна. **GPS падает там же** — на обеих часах — потому что датчик погружается как только медленнеешь. Но Accel идёт дальше, и датчик связанный с доской разделяет чётко: **на фойле** доска спокойна (фойл-затухание), **опустилась** качается свободно (большое, медленное вверх-вниз).",
    "li": [
      "Переход «ещё на фойле / на поверхности в движении» → «опустилась» чётко виден в доска-Accel.",
      "Наш детектор заканчивает лаун **на ±2 s точно** в точке реального опускания — раскат таким образом **не** обрезан.",
      "~9-km/h граница примерно соответствует **скорости сваливания** фойла."
    ],
    "cap": "Доска-качание (низко = на фойле, высоко = качается свободно); зелёный = конец детектора, фиолетовый = точка реального опускания"
  },
  "limits": {
    "h": "Честные ограничения",
    "p": "Это только несколько лаунов, все в одном месте и Pump-плотные. **Запястье одно** *видит* момент опускания не чётко (рука машет при Pump как при качании). И по-настоящему длинные Glide для удовольствия (стеклянные, по ветру) в этом наборе данных ещё нет."
  },
  "outlook": {
    "h": "Как это идёт дальше",
    "p": "Мы **сознательно ничего не меняем** в детекторе, а улучшаем **данными** — с большим количеством лаунов (включая длинные глайды), доска-камерой (**Insta360 X5**) как визуальной истиной и данными пользователей на pumpfoil.org. Ровно так мы уже несколько раз заострили распознавание."
  },
  "videorun": {
    "h": "Дополнительный тестовый лаун (видео)",
    "p": "Вот как измерение выглядит на самом деле: **на каждой руке по часам** и **телефон на доске** как датчик рядом с доской. Чистый запястный детектор хорошо совпадает при этом с истиной рядом с доской (Pump-количество на несколько процентов точно). Важный урок: для **секунд-точной** синхронизации нескольких устройств нужен в начале сознательный **синх-импульс** (например 3× сильно постучать по доске) — системное время одно недостаточно.",
    "cap": "Двое часов на запястье + телефон на доске — тестовый лаун в видео"
  }
};


const zh: N3 = {
  "back": "← 第2部分：工作原理",
  "h1": "第3部分：双表测量 — 我们今天的立场",
  "subtitle": "第二个双表实验：手腕对板近真相",
  "intro": "在第1部分之后，我们再次**同时用两块表**测量 — 这次，为了对板耦合真相测试**泵动识别**和**运行的结束**（滑行或下沉）。一块**Forerunner 55**在手腕上（GPS + 25 Hz Accel）和一块**fēnix 7X Pro**一次在翼面船体水下，一次在脚踝（100 Hz Accel）— 整个运行长度都有，两个通过系统时间同步并通过起跳冲击进行微调。",
  "setup": {
    "h": "设置",
    "p": "两块表在我们的记录器应用上运行 — 这样我们才能获得原始加速度数据流。**脚部**上的fēnix表现得大约像板；**船体**上的它直接测量翼面姿态（那里GPS在水下死亡，Accel贯穿）。",
    "capRumpf": "fēnix在翼面船体，水下",
    "capFuss": "fēnix在脚踝，Forerunner 55在手腕"
  },
  "pump": {
    "h": "泵动识别 — 对真相是准确的",
    "p": "板耦合的传感器看到每个泵动作为一个干净周期。相比之下，我们纯**手腕**探测器惊人地精确：",
    "li": [
      "**数字**：56对59 · 38对40 · 32对31泵 — 在±~5%，没有系统性欠计数。",
      "**频率**几乎相同（~1.36–1.45 Hz）。",
      "**每个泵动时间**：88–95% Precision，90% Recall（±0.35秒）。"
    ],
    "cap": "泵动数字和频率：板真相对手腕探测器"
  },
  "glide": {
    "h": "运行结束 — 滑行对下沉",
    "p": "有趣的是在运行的结尾。**GPS在那里恰好掉线** — 在两块表上 — 因为一旦你减速传感器就沉下去。但Accel贯穿，板近传感器干净地分离它：**在翼面上**板保持镇静（翼面阻尼），**沉下去**它自由漂移（大的、缓慢的上下）。",
    "li": [
      "从「仍在翼面上 / 在水面在运动」到「沉下去」的过渡在板Accel中清晰可见。",
      "我们的探测器在**±2秒精度**时结束运行在真实的下沉点 — 衰退因此**不会**被切掉。",
      "~9 km/h限制对应相当准确的**失速速度**翼面。"
    ],
    "cap": "板摇晃（低 = 在翼面上，高 = 自由漂移）；绿色 = 探测器结束，紫色 = 真实下沉点"
  },
  "limits": {
    "h": "诚实的限制",
    "p": "这些只是少数运行，都在一个垂钓点和泵动密集。**单独的手腕***看不到*下沉时刻干净（手臂在泵动和漂移时都晃动）。长享受滑行（玻璃般，逆风）还没有在这个数据集中。"
  },
  "outlook": {
    "h": "接下来会怎样",
    "p": "我们现在**有意什么都不改变**探测器，而是**数据驱动地**改进 — 用更多的运行（也长滑行），一个板摄像机（**Insta360 X5**）作为视觉真相，和pumpfoil.org用户的数据。我们已经多次以完全相同的方式锐化识别。"
  },
  "videorun": {
    "h": "进一步的测试运行（视频）",
    "p": "测量实际看起来像这样：**每只手一块表**并且**手机在板上**作为板近参考。纯手腕探测器与板近真相很好地吻合（泵动数到几个百分点精确）。重要的教训：为了**秒精度**多个设备的对齐，在开始时需要一个有意的**同步冲击**（例如3×用力点击板） — 系统时间本身不够。",
    "cap": "两块表在手腕 + 手机在板 — 视频中的测试运行"
  }
};

export const NERD3: Partial<Record<Lang, N3>> = { zh, ru, pt, "pt-PT": ptPT, nb, ja, id, de, gsw, "de-AT": deAT, en, fr, it, es, fi, nl, cs };
