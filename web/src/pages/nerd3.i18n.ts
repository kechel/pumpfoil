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
};

export const NERD3: Record<Lang, N3> = { de, gsw, "de-AT": deAT, en, fr, it, es, fi, nl, cs };
