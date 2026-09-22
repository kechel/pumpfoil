// Inhalte für die Nerd-Analysen Teil 2 (datengetrieben, alle 7 Sprachen).
// `de` ist die Quelle der Wahrheit; die übrigen Sprachen spiegeln dieselbe Struktur.
// Rich-Markup in den Strings: **fett**, `code`, *kursiv*, [label](/pfad).
// WICHTIG: technische Bezeichner (FFT, RandomForest, int16, foil_rf.pkl, foil_status,
// run_pumps, GroupKFold, bandpass_fft, magnitude_g, accel_scale, RMS, Hz, km/h) bleiben
// unübersetzt. Keine geraden Anführungszeichen (") in Strings — nur typografische.
import type { Lang } from "../i18n";

type Box = [string, string];

export interface N2 {
  back: string;
  h1: string;
  subtitle: string;
  intro: string;

  raw: { h: string; p: string; li: string[]; p2: string };
  pipe: {
    h: string; p: string; cap: string;
    gps: Box; accel: Box; gpsPrep: Box; accelPrep: Box;
    model: Box; mask: Box; seg: Box; pumps: Box; glide: Box;
  };
  mag: { h: string; p: string; formula: string; p2: string; cap: string; label: string };
  vert: {
    h: string; p: string; ol: string[]; f1: string; fMid: string; f2: string; cap: string;
    gLabel: string; aLabel: string; amg: string; topNote: string; botNote: string;
  };
  win: {
    h: string; p: string; li: string[]; p2: string; li2: string[]; cap: string;
    winT: string; winT1: string; sig: string; fft: string; spec: string; band: string; freq: string;
  };
  rate: { h: string; p: string };
  ml: {
    h: string; p: string; li: string[]; p2: string; cap: string;
    featNote: string; forest: string; maskNote: string;
  };
  seg: {
    h: string; p: string; li: string[]; p2: string; cap: string;
    maskLabel: string; runs: string; run1: string; run2: string; tooShort: string;
    hyst: string; enter: string; exit: string;
  };
  se: { h: string; p: string; p2: string; cap: string; thr: string; secStart: string; snapped: string; afterPump: string };
  pump: { h: string; p: string; p2: string; cap: string; top: string; bot: string };
  glide: {
    h: string; p: string; cap: string;
    start: string; end: string; pumps: string; lead: string; tail: string; gaps: string;
  };
  gpsonly: { h: string; p: string; li: string[] };
  label: {
    h: string; p: string; p2: string; cap: string;
    fits: Box; feats: Box; rf: Box; pkl: Box; loopNote: string;
  };
  x5: { h: string; p: string };
  summary: { h: string; p1: string; p2: string };
  limits: { h: string; p: string };
}

const de: N2 = {
  back: "← Nerd-Analysen (Teil 1: das Experiment)",
  h1: "Nerd-Analysen · Teil 2",
  subtitle:
    "Wie aus rohen Sensor-Zahlen Pumps, On-Foil-Läufe, Start/Ende und Gleitphasen werden — die Signalverarbeitung, das Sliding-Window, das ML-Modell und das Labeling, schön der Reihe nach.",
  intro:
    "In [Teil 1](/nerd-analysen) ging es um die **Wahrheit**: eine zweite Uhr am Foil-Mast, die verrät, was der Foil wirklich tut. Hier geht es um die **Maschinerie**: was der Server rechnet, damit aus einem Zappel-Signal am Handgelenk eine saubere Session-Auswertung wird. Alles Folgende passiert **server-seitig** — die Uhr ist nur ein dünner Recorder.",

  raw: {
    h: "Was ankommt: die Rohdaten",
    p: "Jede Session besteht aus zwei Strömen, beide mit gemeinsamer Zeitbasis (ms ab Aufnahmestart):",
    li: [
      "**GPS**, ca. **1 Hz**: pro Sample `[t_ms, lat, lon, speed_mps, hr_bpm, h_acc_m]`. Speed und Puls können fehlen (dann aus der Position abgeleitet bzw. leer).",
      "**Beschleunigung**, je nach Uhr **10–100 Hz**: ein `int16`-Array der Form `(N × 3)` — X/Y/Z in Roh-Zählern. Ein `accel_scale` (Zähler pro g) macht daraus physikalische g.",
    ],
    p2: "Warum `int16` statt Fließkomma? Bandbreite. 100 Hz × 3 Achsen × 8 h sind Millionen Werte — als 2-Byte-Ganzzahlen halbiert das die Upload-Größe. Die Skalierung zurück nach g passiert erst am Server.",
  },
  pipe: {
    h: "Die Pipeline auf einen Blick",
    p: "Zwei Aufbereitungs-Spuren (GPS + Accel) laufen in ein ML-Modell, das **pro Sekunde** entscheidet „auf dem Foil — ja/nein“. Daraus werden zusammenhängende Läufe, deren Start/Ende feinjustiert wird, und schließlich Pumps & Gleitphasen je Lauf:",
    cap: "Die komplette Auswertung: von den zwei Rohdaten-Strömen über die Foiling-Maske zu Läufen, Pumps und Gleitphasen.",
    gps: ["GPS  ~1 Hz", "t, lat, lon, speed, hr, h_acc"],
    accel: ["Beschleunigung  10–100 Hz", "int16 (N×3) · accel_scale"],
    gpsPrep: ["GPS aufbereiten", "Spike-/Doppler-Filter · glätten · Speed"],
    accelPrep: ["Accel aufbereiten", "Betrag → Vertikale · FFT-Bandpass"],
    model: ["ML-Foil-Modell — RandomForest, ±5 s Kontext", "Fallback ohne Accel: GPS-State-Machine (Hysterese + Dwell)"],
    mask: ["Foiling-Maske", "foil / nicht-foil — je Sekunde"],
    seg: ["Segmentierung → Läufe", "Lücken schließen · mergen · Start/Ende snappen"],
    pumps: ["Pumps zählen", "kadenz-geführt, je Lauf"],
    glide: ["Gleitphasen", "Lücken zwischen Pumps"],
  },
  mag: {
    h: "Schritt 1 — Betrag statt Achsen",
    p: "Die Uhr sitzt am Handgelenk und dreht sich ständig — die drei Achsen X/Y/Z zeigen dauernd woanders hin. Ein einzelner Achswert ist deshalb wertlos. Die Rettung ist der **Betrag** des Vektors:",
    formula: "|a| = √(x² + y² + z²) / accel_scale",
    p2: "Der Betrag ist **orientierungsinvariant**: egal wie die Uhr gedreht ist, ein 2-g-Stoß bleibt ein 2-g-Stoß. Damit wird das Signal überhaupt erst vergleichbar (`magnitude_g`).",
    cap: "Drei einzeln nichtssagende Achsen (die Uhr kippt ständig) ergeben zusammen einen stabilen, orientierungsinvarianten Betrag |a|.",
    label: "|a| = √(x²+y²+z²)",
  },
  vert: {
    h: "Schritt 2 — vom Handgelenk in die Senkrechte",
    p: "Der Betrag hat einen Haken: ein Pump ist ein **Aufwärts-Push**, aber `|a|` zählt den Abstrich genauso wie den Aufstrich — jeder Pump erscheint doppelt. Besser wäre die echte **vertikale Beschleunigung gegen die Schwerkraft**. Und die lässt sich rekonstruieren, ganz ohne Gyroskop:",
    ol: [
      "Die **Schwerkraft-Richtung** ändert sich nur langsam → per **Tiefpass** (< 0,25 Hz) je Achse schätzen. Das ergibt den Vektor `g`, der immer „nach unten“ zeigt.",
      "Die **dynamische** Beschleunigung ist `a − g`.",
      "Diese auf den Schwerkraft-Einheitsvektor **projizieren** → skalares Signal: > 0 = aufwärts (Push).",
    ],
    f1: "v(t) = (a − g) · ĝ",
    fMid: "mit",
    f2: "ĝ = g / |g|",
    cap: "Die langsam driftende Schwerkraft g (Tiefpass) trennt Orientierung von Dynamik. Die dynamische Beschleunigung a−g, projiziert auf ĝ, ergibt einen sauberen Aufwärts-Push je Pump.",
    gLabel: "g (Schwerkraft)",
    aLabel: "a (gemessen)",
    amg: "a − g",
    topNote: "|Betrag|: jeder Pump doppelt",
    botNote: "v(t) gegen Schwerkraft: ein Push je Pump",
  },
  win: {
    h: "Schritt 3 — Sliding-Window & FFT-Bandpass",
    p: "Pumpen ist **rhythmisch** — und Rhythmus lebt im Frequenzraum. Deshalb schiebt ein **gleitendes Fenster** (typ. 4 s breit, alle 2 s ein Schritt) über das Signal, und für jedes Fenster rechnet eine **FFT** das Spektrum. Zwei Bänder sind wichtig:",
    li: [
      "**Filter-Band 0,3–3 Hz** — alles darunter ist Schwerkraft/Drift, alles darüber ist Splash-Rauschen. Beides wird per FFT-Bandpass genullt (`bandpass_fft`).",
      "**Pump-Band 0,5–2 Hz** — hier lebt die Pump-Kadenz (30–120 Pumps/min).",
    ],
    p2: "Pro Fenster fallen vier Merkmale ab:",
    li2: [
      "**dom_freq** — dominante Frequenz im Pump-Band (die Pump-Rate)",
      "**band_power_ratio** — Anteil der Energie im Pump-Band am Gesamt-Band (hoch = klarer Rhythmus)",
      "**rms** — Signalstärke (Amplitude der Bewegung)",
      "**spectral_entropy** — wie „aufgeräumt“ das Spektrum ist (niedrig = eine klare Frequenz = Pumpen; hoch = Chaos = Rauschen/Gleiten)",
    ],
    cap: "Ein 4-s-Fenster wandert über das gefilterte Signal (Schritt 2 s → Überlappung). Für jedes Fenster liefert die FFT ein Spektrum; die Energie im Pump-Band 0,5–2 Hz verrät Rate und Rhythmus.",
    winT: "Fenster t",
    winT1: "Fenster t+1",
    sig: "v(t) — bandpass-gefiltert (0,3–3 Hz)",
    fft: "FFT",
    spec: "Spektrum",
    band: "0,5–2 Hz",
    freq: "Frequenz →",
  },
  rate: {
    h: "Ein Nerd-Detail: die echte Abtastrate",
    p: "Manche Uhren **lügen** über ihre Rate. Eine Forerunner 55 taggt „10 Hz“, liefert real aber nur ~2,5 Hz. Frequenz-Features und Pump-Kadenz wären damit Müll. Deshalb bestimmt der Server die Rate **generisch aus den Daten selbst**: `echte_Hz = Anzahl_Accel-Samples / GPS-Dauer`. Weicht das > 25 % vom Tag ab, gilt die gemessene Rate. Und liegt sie **unter 15 Hz**, ist das Signal für Frequenzanalyse zu grob → die Session wird als **GPS-only** ausgewertet (Pumps n/a, dafür ehrliche Grenzen statt Fantasiewerte).",
  },
  ml: {
    h: "Wo bin ich auf dem Foil? — das ML-Modell",
    p: "Ob man in einer Sekunde **auf dem Foil** ist, entscheidet ein **RandomForest** — ein Wald aus Entscheidungsbäumen, die per Mehrheit abstimmen. Klein und interpretierbar, kein Deep Learning nötig. Pro Sekunde bekommt er **14 Merkmale**:",
    li: [
      "**7 aus Speed & Accel**: Speed jetzt / 3 s / 5 s (Median), Speed-Variabilität, sowie RMS in drei Bändern (gesamt, Pump-Band, hochfrequent).",
      "**7 aus der GPS-Bahn**: Speed-Änderung über 1/3/5 s, Pfadlänge, Netto-Versatz, **Geradlinigkeit** (netto/pfad) und Kursänderung. Diese Richtungs-Features waren im Experiment der größte Hebel — sie halten ruhige Gleitphasen im Lauf, statt ihn zu zerstückeln.",
    ],
    p2: "Der Clou ist der **Kontext**: jede Sekunde wird nicht isoliert klassifiziert, sondern zusammen mit den **±5 Nachbarsekunden** (das „Windowize“). Der Feature-Vektor einer Sekunde ist also 14 × 11 = 154 Zahlen lang. So sieht das Modell den Verlauf — ein kurzer Speed-Einbruch mitten im Cruise wird nicht sofort als „raus“ gewertet. Das brachte die Fragmentierung von 1,10× auf 1,00× und den F1-Score von **0,93 auf 0,97**.",
    cap: "Pro Sekunde ein 14er-Merkmalsvektor; für die Klassifikation werden die ±5 Nachbarsekunden angehängt (Center-Label). Der RandomForest stimmt ab → foil / nicht-foil.",
    featNote: "Sekunden-Fenster: 14 Merkmale je Sekunde, ±5 s Kontext",
    forest: "RandomForest (Mehrheit)",
    maskNote: "Maske je Sekunde: foil ▮ / nicht-foil ▯",
  },
  seg: {
    h: "Von der Maske zu Läufen",
    p: "Die Sekunden-Maske ist noch löchrig. Sie wird zu sauberen **Läufen** geformt:",
    li: [
      "**Kurze Lücken schließen** (bis ~2 s): eine Gleit-Pause zerteilt keinen Lauf.",
      "**Physik-Floor**: unter ~9 km/h trägt kein Foil, und ohne echte Positions-Bewegung (nicht nur Speed-Feld) ist man nicht auf Foil — beides schneidet die weichen Ränder weg.",
      "**Mindestlänge & Ø-Speed**: Segmente unter 5 s oder mit zu niedrigem Schnitt fliegen raus (schnelles Gehen ≠ Foilen).",
      "**GPS-Dropout trennt**: eine Sample-Lücke > 15 s (Uhr unter Wasser/Sturz) beendet den Lauf — die Lückenzeit zählt nicht als Fahrzeit.",
      "**„Kein-Stopp“-Merge**: fiel der Speed zwischen zwei erkannten Läufen **nie** unter ~5,4 km/h und lag kein Dropout vor, war es in Wahrheit **ein** Lauf (Modell-Aussetzer) → zusammenführen, egal wie lang.",
    ],
    p2: "Ohne brauchbare Beschleunigung (GPS-only) übernimmt eine **State-Machine** mit **Hysterese** und **Dwell**: Man wird erst „foilend“ nach mehreren Sekunden im Speed-Band *bei glattem Speed* (Gleiten ist glatt, Paddeln choppy) — und verlässt den Zustand erst nach mehreren Sekunden darunter. Zwei Schwellen (rein/raus) verhindern Flackern an der Grenze.",
    cap: "Oben: die löchrige Sekunden-Maske wird zu Läufen (Lücken schließen, mergen, Kurzsegmente verwerfen). Unten: die Hysterese der GPS-State-Machine — rein erst oberhalb, raus erst unterhalb, mit Haltezeit (Dwell).",
    maskLabel: "Maske (je Sekunde)",
    runs: "Läufe",
    run1: "Lauf 1 (Lücken geschlossen)",
    run2: "Lauf 2",
    tooShort: "· zu kurz → verworfen",
    hyst: "Hysterese + Dwell (GPS-Fallback)",
    enter: "ENTER ~10 km/h",
    exit: "EXIT ~9 km/h",
  },
  se: {
    h: "Start & Ende — sub-sekundengenau",
    p: "Das Modell arbeitet im Sekundenraster, aber der **Aufsprung** ist ein scharfes Ereignis. Deshalb wird der Lauf-Start auf den **Jump-Impuls** gesnappt: eine sehr starke Magnitude-Spitze (> 3,5× dem 95-Perzentil — im Experiment lag ein Jump bei ~4,3×, ein Pump nur bei ~2,3×, also klar trennbar). Der früheste solche Impuls im Fenster ±wenige Sekunden markiert den echten Absprung — sub-sekundengenau zwischen zwei GPS-Punkten interpoliert. Fehlt der Impuls, zieht der Server den Start über die Beschleunigungs-Rampe bis zum letzten Quasi-Stopp zurück.",
    p2: "Am **Ende** lauern zwei Fallen: **Dead-Reckoning-Drift** (die Uhr taucht unter, extrapoliert das GPS und „driftet“ an Land) wird verworfen — Prior: ein Lauf endet nie landwärtiger als sein Start. Und wo eine **OSM-Wasserfläche** bekannt ist, müssen Start und Ende **im Wasser** liegen (Punkt-in-Polygon per Ray-Casting), sonst wird auf das letzte echte Wasser-Sample zurückgeschnitten. Schließlich wird das Ende noch als **Sturz** (abrupter Speed-Einbruch von „auf Foil“ auf „im Wasser“, oder GPS-Dropout) oder **kontrollierter Stopp** klassifiziert.",
    cap: "Der erkannte Sekunden-Start (grau) wird auf den scharfen Aufsprung-Impuls im Beschleunigungs-Betrag gesnappt (cyan) — der wahre Foil-Start.",
    thr: "3,5 × p95 (Jump-Schwelle)",
    secStart: "Sekunden-Start",
    snapped: "← gesnappt auf den Aufsprung",
    afterPump: "danach: Pump-Rhythmus",
  },
  pump: {
    h: "Pumps zählen — kadenz-geführt (v3)",
    p: "Der naheliegende Weg — „zähle alle Peaks über einer Amplituden-Schwelle“ — **unterschätzt strukturell um ~2×**: er pickt nur die größten Ausschläge und verschluckt die kleineren, rhythmischen Pumps dazwischen. Gegen die **Wahrheit** (meine getippte Pump-Wahrheit, siehe unten) traf das nur ~40 %.",
    p2: "Der bessere Ansatz ist **kadenz-geführt**: In rhythmischen, energiereichen Abschnitten schätzt eine lokale FFT die **momentane Pump-Frequenz**, und dann wird **pro Kadenz-Periode genau ein** echtes lokales Maximum als Pump gewählt. Die Kadenz ist lokal-adaptiv, folgt also Tempowechseln. Ergebnis: **85–94 %** Treffer statt 40 % — und Zähler und Karten-Marker sind automatisch konsistent (beide aus denselben Positionen). Ein RMS-Gate verhindert, dass rhythmuslose Gleitphasen mitgezählt werden.",
    cap: "Amplituden-Schwelle (oben) sieht nur die dicken Peaks. Kadenz-geführt (unten): lokale Periode T schätzen, pro Periode das echte Maximum picken — auch die sanften Pumps.",
    top: "Amplituden-Schwelle — verschluckt kleine Pumps",
    bot: "Kadenz-geführt — ein Peak je Periode T",
  },
  glide: {
    h: "Gleitphasen — die Stille zwischen den Pumps",
    p: "Genau das, was Teil 1 als größtes Potenzial nannte, fällt jetzt fast geschenkt ab: Sind die Pump-Zeitpunkte bekannt, sind die **Gleitphasen einfach die Lücken dazwischen** — plus der Anlauf vom Lauf-Start bis zum ersten Pump (*lead*) und das Auslaufen vom letzten Pump bis zum Ende (*tail*). Daraus fallen pro Lauf **Anzahl**, **Ø-Gleitdauer** und **längste Gleitphase** ab — die Kennzahl dafür, wie effizient ein Foil den Schwung hält.",
    cap: "Pumps (Marker) teilen den Lauf; die Lücken dazwischen sind die Gleitphasen. lead = Start→1. Pump, tail = letzter Pump→Ende. Ein langer tail = sauberes Auslaufen.",
    start: "Start",
    end: "Ende",
    pumps: "Pumps",
    lead: "lead",
    tail: "tail (Gleiten)",
    gaps: "Lücken = Gleitphasen",
  },
  gpsonly: {
    h: "Ohne Accel: GPS-only & seine Fallstricke",
    p: "Importierte Sessions (z. B. von Polar) oder Uhren mit zu grober Rate haben **keine brauchbare Beschleunigung**. Dann trägt allein das GPS — und das hat Macken:",
    li: [
      "**Einzel-Spikes** (Doppler-Glitch, „Teleport“): gegen den lokalen Median ersetzt bzw. raus-und-zurück-Sprünge geglättet.",
      "**Mehrsekündige Doppler-Bursts** (~3 s auf 50 km/h, aber unter der 90-km/h-Glitch-Schwelle): gegen einen robusten **15-s-Median** ersetzt — der ist gegen kurze Bursts unempfindlich, ein echter gehaltener Lauf hebt ihn dagegen mit an und bleibt unangetastet. Zwei Bedingungen (relativ über Median **und** absolut über ~28 km/h) schützen echte Läufe.",
      "**30-km/h-Pumpfoil-Gate**: ohne Accel kann man Pumpfoil nicht sicher von angetriebenem Foilen (Kite/Wind/Wake) trennen. Liegt der geglättete Top-Speed über 30 km/h, gilt die Session als angetrieben → **kein** Pumpfoil. Mit Accel entfällt dieses Gate — dort vertraut die Auswertung dem Pump-/On-Foil-Signal.",
    ],
  },
  label: {
    h: "Woher die Wahrheit kommt — Pumps antippen",
    p: "Das Modell braucht eine **Wahrheit**, gegen die der kadenz-geführte Pump-Zähler kalibriert wird — und die tippe ich mir aktuell selbst. Ich schaue das **Video** eines Laufs und **tippe bei jedem echten Pump** auf einen Knopf. Das mache ich in **mehreren Takes**; die werden per Kreuzkorrelation zu einem **Konsens** verrechnet (kleine Reaktionszeit-Versätze mitteln sich raus). Ergebnis: die echte Pump-Zahl und das echte Timing je Lauf. Das ist bewusst ein **Übergang** — genau genug, um heute zu kalibrieren, aber von Hand getippt.",
    p2: "Wichtig beim Kalibrieren gegen solche Labels: **GroupKFold** statt normaler Kreuzvalidierung. Benachbarte Sekunden desselben Laufs sind fast identisch — landeten sie zugleich in Trainings- und Testmenge, würde sich das Modell selbst abfragen (Leakage) und Traumwerte melden. GroupKFold hält deshalb **ganze Sessions** zusammen: getestet wird immer auf Läufen, die das Modell nie gesehen hat.",
    cap: "Der Kreislauf: **getippte** Pump-Wahrheit → Features → RandomForest → foil_rf.pkl → Auswertung jeder Session. Neue Taps fließen zurück, das Modell wird neu kalibriert.",
    fits: ["Pumps antippen", "Video · mehrere Takes"],
    feats: ["Features", "14 × ±5 s Kontext"],
    rf: ["RandomForest", "GroupKFold-CV"],
    pkl: ["foil_rf.pkl", "→ jede Session"],
    loopNote: "neue getippte Läufe → neu kalibrieren",
  },
  x5: {
    h: "Der nächste Schritt — echte Wahrheit per Kamera (Insta360 X5)",
    p: "Antippen ist gut genug zum Bootstrappen, hängt aber an meiner Reaktionszeit. Die **physikalisch exakte** Wahrheit kommt als Nächstes von einer **Kamera am Board**: eine Insta360 X5 filmt Mast/Foil mit, und aus dem Video liest man **frame-genau** ab, wann der Foil wirklich Druck bekommt und wann er fliegt. Damit kalibrieren wir Pump-Timing und On-Foil-Erkennung gegen echte Physik statt gegen getippte Näherung. Sobald das Rig steht, kommt hier ein eigener Abschnitt mit dem ganzen Kamera-Setup.",
  },
  summary: {
    h: "Der ganze Weg in einem Satz",
    p1: "Rohe int16-Beschleunigung → **Betrag** → **Vertikale gegen die Schwerkraft** → **FFT-Bandpass** im Sliding-Window → 14 Merkmale je Sekunde mit **±5 s Kontext** → **RandomForest** sagt on-foil/nicht → **Segmentierung** zu Läufen (Hysterese, Merge, Dropout) → Start auf den **Aufsprung-Impuls** gesnappt, Ende gegen **Wasserfläche** & Drift korrigiert → **kadenz-geführte** Pump-Zählung → Gleitphasen als Lücken → Kennzahlen.",
    p2: "Und das alles aus **einer Handgelenk-Uhr** — die Mast-Uhr aus Teil 1 war nur die Referenz, die zeigt, dass es stimmt.",
  },
  limits: {
    h: "Grenzen (weiterhin ehrlich)",
    p: "Die Uhr sitzt am Handgelenk, nicht am Board — die Arme wedeln zum Balancieren und überlagern das Pump-Signal („Wrist-Confound“). Die Vertikale wird aus der Schwerkraft-Richtung geschätzt (kein Gyroskop) und ist bei anhaltender Beschleunigung leicht verfälscht. Der kadenz-geführte Zähler ist gegen App- und Video-Wahrheit kalibriert, aber die **physische** Endkalibrierung (Kamera am Board, Insta360 X5) steht noch aus. Und die GPS-only-Gates sind ein Kompromiss: lieber ehrlich „gps_only, Pumps n/a“ als erfundene Zahlen.",
  },
};

// --- Schwiizerdütsch (Züridütsch, allgemein verständlich) ---
const gsw: N2 = {
  back: "← Nerd-Analyse (Teil 1: s Experimänt)",
  h1: "Nerd-Analyse · Teil 2",
  subtitle:
    "Wie us rohe Sensor-Zahle Pumps, On-Foil-Läuf, Start/Änd und Gleitphase wärded — d Signalverarbeitig, s Sliding-Window, s ML-Modäll und s Labeling, schön dr Reihe nach.",
  intro:
    "Im [Teil 1](/nerd-analysen) isch es um d **Wahrheit** gange: e zweiti Uhr am Foil-Mast, wo verroot, was de Foil würklich macht. Do goots um d **Maschinerie**: was de Server rächnet, damit us eme Zappel-Signal am Handglänk e suuberi Session-Uswärtig wird. Alles wo chunt, passiert **server-siitig** — d Uhr isch nu en dünne Recorder.",
  raw: {
    h: "Was achunt: d Rohdate",
    p: "Jedi Session bestoot us zwei Ström, beidi mit gmeinsamer Ziitbasis (ms ab Ufnahm-Start):",
    li: [
      "**GPS**, öppe **1 Hz**: pro Sample `[t_ms, lat, lon, speed_mps, hr_bpm, h_acc_m]`. Speed und Puls chönd fähle (dänn us dr Position abgleitet bzw. läär).",
      "**Bschlünigung**, je nach Uhr **10–100 Hz**: es `int16`-Array vo dr Form `(N × 3)` — X/Y/Z i Roh-Zähler. En `accel_scale` (Zähler pro g) macht drus physikalischi g.",
    ],
    p2: "Werum `int16` statt Fliesskomma? Bandbreiti. 100 Hz × 3 Achse × 8 h sind Millione Wärt — als 2-Byte-Ganzzahle halbiert das d Upload-Grössi. S Zrugg-Skaliere uf g passiert erscht am Server.",
  },
  pipe: {
    h: "D Pipeline uf ei Blick",
    p: "Zwei Ufbereitigs-Spure (GPS + Accel) laufed i es ML-Modäll, wo **pro Sekunde** entscheidet „uf em Foil — jo/nei“. Drus wärded zämehängendi Läuf, wo ihre Start/Änd feiigstellt wird, und am Schluss Pumps & Gleitphase pro Lauf:",
    cap: "D ganz Uswärtig: vo de zwei Rohdate-Ström über d Foiling-Maske zu Läuf, Pumps und Gleitphase.",
    gps: ["GPS  ~1 Hz", "t, lat, lon, speed, hr, h_acc"],
    accel: ["Bschlünigung  10–100 Hz", "int16 (N×3) · accel_scale"],
    gpsPrep: ["GPS ufbereite", "Spike-/Doppler-Filter · glätte · Speed"],
    accelPrep: ["Accel ufbereite", "Betrag → Vertikale · FFT-Bandpass"],
    model: ["ML-Foil-Modäll — RandomForest, ±5 s Kontext", "Fallback ohni Accel: GPS-State-Machine (Hysterese + Dwell)"],
    mask: ["Foiling-Maske", "foil / nöd-foil — pro Sekunde"],
    seg: ["Segmentierig → Läuf", "Lücke schliesse · zämeführe · Start/Änd snappe"],
    pumps: ["Pumps zelle", "kadänz-gführt, pro Lauf"],
    glide: ["Gleitphase", "Lücke zwüsched Pumps"],
  },
  mag: {
    h: "Schritt 1 — Betrag statt Achse",
    p: "D Uhr sitzt am Handglänk und dreiht sich immerzue — die drei Achse X/Y/Z zeiged dauernd woanders ane. En einzelne Achswärt isch drum wärtlos. D Rettig isch de **Betrag** vom Vektor:",
    formula: "|a| = √(x² + y² + z²) / accel_scale",
    p2: "De Betrag isch **orientierigs-invariant**: egal wie d Uhr dreiht isch, en 2-g-Stoss bliibt en 2-g-Stoss. Ersch dedmit wird s Signal überhaupt vergliichbar (`magnitude_g`).",
    cap: "Drei einzeln nüützigi Achse (d Uhr chiplet dauernd) gänd zäme en stabile, orientierigs-invariante Betrag |a|.",
    label: "|a| = √(x²+y²+z²)",
  },
  vert: {
    h: "Schritt 2 — vom Handglänk i d Sänkrächti",
    p: "De Betrag hät en Hagge: en Pump isch en **Ufwärts-Push**, aber `|a|` zellt de Abstrich glich wie de Ufstrich — jede Pump erschiint doppelt. Besser wär di echti **vertikali Bschlünigung gäge d Schwärchraft**. Und die loot sich rekonstruiere, ganz ohni Gyroskop:",
    ol: [
      "D **Schwärchraft-Richtig** änderet sich nu langsam → per **Tiefpass** (< 0,25 Hz) pro Achse schätze. Das git de Vektor `g`, wo immer „ab“ zeigt.",
      "D **dynamischi** Bschlünigung isch `a − g`.",
      "Die uf de Schwärchraft-Einheitsvektor **projiziere** → skalars Signal: > 0 = ufwärts (Push).",
    ],
    f1: "v(t) = (a − g) · ĝ",
    fMid: "mit",
    f2: "ĝ = g / |g|",
    cap: "D langsam driftend Schwärchraft g (Tiefpass) trännt Orientierig vo Dynamik. D dynamischi Bschlünigung a−g, projiziert uf ĝ, git en suubere Ufwärts-Push pro Pump.",
    gLabel: "g (Schwärchraft)",
    aLabel: "a (gmässe)",
    amg: "a − g",
    topNote: "|Betrag|: jede Pump doppelt",
    botNote: "v(t) gäge Schwärchraft: ei Push pro Pump",
  },
  win: {
    h: "Schritt 3 — Sliding-Window & FFT-Bandpass",
    p: "Pumpe isch **rhythmisch** — und Rhythmus läbt im Frequänzruum. Drum schiebt es **gleitends Fänschter** (typ. 4 s breit, alli 2 s en Schritt) über s Signal, und für jedes Fänschter rächnet e **FFT** s Spektrum. Zwei Bänder sind wichtig:",
    li: [
      "**Filter-Band 0,3–3 Hz** — alles drunder isch Schwärchraft/Drift, alles drüber isch Splash-Ruusche. Beides wird per FFT-Bandpass gnullet (`bandpass_fft`).",
      "**Pump-Band 0,5–2 Hz** — do läbt d Pump-Kadänz (30–120 Pumps/min).",
    ],
    p2: "Pro Fänschter falled vier Merkmal ab:",
    li2: [
      "**dom_freq** — dominanti Frequänz im Pump-Band (d Pump-Rate)",
      "**band_power_ratio** — Aateil vo dr Energie im Pump-Band am Gsamt-Band (hoch = klare Rhythmus)",
      "**rms** — Signalstärchi (Amplitude vo dr Bewegig)",
      "**spectral_entropy** — wie „ufgruumt“ s Spektrum isch (nidrig = ei klari Frequänz = Pumpe; hoch = Chaos = Ruusche/Gleite)",
    ],
    cap: "Es 4-s-Fänschter wanderet über s gfilterete Signal (Schritt 2 s → Überlappig). Für jedes Fänschter git d FFT es Spektrum; d Energie im Pump-Band 0,5–2 Hz verroot Rate und Rhythmus.",
    winT: "Fänschter t",
    winT1: "Fänschter t+1",
    sig: "v(t) — bandpass-gfilteret (0,3–3 Hz)",
    fft: "FFT",
    spec: "Spektrum",
    band: "0,5–2 Hz",
    freq: "Frequänz →",
  },
  rate: {
    h: "Es Nerd-Detail: di echti Abtast-Rate",
    p: "Es paar Uhre **lüüged** über ihri Rate. E Forerunner 55 taggt „10 Hz“, liferet aber real nu ~2,5 Hz. Frequänz-Features und Pump-Kadänz wäred dedmit Mist. Drum bestimmt de Server d Rate **generisch us de Date sälber**: `echte_Hz = Aazahl_Accel-Samples / GPS-Duur`. Wiicht das > 25 % vom Tag ab, gilt di gmässni Rate. Und liit si **under 15 Hz**, isch s Signal für Frequänz-Analyse z grob → d Session wird als **GPS-only** uusgwärtet (Pumps n/a, defür ehrlichi Gränze statt Fantasie-Wärt).",
  },
  ml: {
    h: "Wo bin ich uf em Foil? — s ML-Modäll",
    p: "Öb me in ere Sekunde **uf em Foil** isch, entscheidet en **RandomForest** — en Wald us Entscheidigsböim, wo per Mehrheit abstimmed. Chlii und interpretierbar, kei Deep Learning nötig. Pro Sekunde übercht er **14 Merkmal**:",
    li: [
      "**7 us Speed & Accel**: Speed jetz / 3 s / 5 s (Median), Speed-Variabilität, sowie RMS i drei Bänder (gsamt, Pump-Band, hochfrequänt).",
      "**7 us dr GPS-Bahn**: Speed-Änderig über 1/3/5 s, Pfadlängi, Netto-Versatz, **Gradliinigkeit** (netto/pfad) und Kursänderig. Die Richtigs-Features sind im Experimänt de gröschti Hebel gsi — si haltet ruehigi Gleitphase im Lauf, statt en z verstückle.",
    ],
    p2: "De Clou isch de **Kontext**: jedi Sekunde wird nöd isoliert klassifiziert, sondern zäme mit de **±5 Nochbar-Sekunde** (s „Windowize“). De Feature-Vektor vo ere Sekunde isch also 14 × 11 = 154 Zahle lang. So gseht s Modäll de Verlauf — en churze Speed-Iibruch mitten im Cruise wird nöd grad als „duss“ gwärtet. Das hät d Fragmentierig vo 1,10× uf 1,00× brocht und de F1-Score vo **0,93 uf 0,97**.",
    cap: "Pro Sekunde en 14er-Merkmalsvektor; für d Klassifikation wärded d ±5 Nochbar-Sekunde ahänkt (Center-Label). De RandomForest stimmt ab → foil / nöd-foil.",
    featNote: "Sekunde-Fänschter: 14 Merkmal pro Sekunde, ±5 s Kontext",
    forest: "RandomForest (Mehrheit)",
    maskNote: "Maske pro Sekunde: foil ▮ / nöd-foil ▯",
  },
  seg: {
    h: "Vo dr Maske zu Läuf",
    p: "D Sekunde-Maske isch no löchrig. Si wird zu suubere **Läuf** gformt:",
    li: [
      "**Churzi Lücke schliesse** (bis ~2 s): e Gleit-Pause verteilt kei Lauf.",
      "**Physik-Floor**: under ~9 km/h treit kei Foil, und ohni echti Positions-Bewegig (nöd nu s Speed-Fäld) isch me nöd uf em Foil — beides schniidet d weiche Ränder wäg.",
      "**Mindeschtlängi & Ø-Speed**: Segmänt under 5 s oder mit z tüüfem Schnitt flüged use (schnälls Laufe ≠ Foile).",
      "**GPS-Dropout trännt**: e Sample-Lücke > 15 s (Uhr under Wasser/Sturz) beendet de Lauf — d Lücke-Ziit zellt nöd als Fahrziit.",
      "**„Kei-Stopp“-Merge**: isch de Speed zwüsched zwei erkännte Läuf **nie** under ~5,4 km/h gheit und isch kei Dropout gsi, isch es i Wahrheit **ei** Lauf gsi (Modäll-Ussetzer) → zämeführe, egal wie lang.",
    ],
    p2: "Ohni bruuchbari Bschlünigung (GPS-only) übernimmt e **State-Machine** mit **Hysterese** und **Dwell**: Me wird ersch „foilend“ nach paar Sekunde im Speed-Band *bi glattem Speed* (Gleite isch glatt, Paddle choppy) — und verloot de Zuestand ersch nach paar Sekunde drunder. Zwei Schwelle (ine/use) verhinderet s Flackere a dr Gränze.",
    cap: "Obe: d löchrig Sekunde-Maske wird zu Läuf (Lücke schliesse, zämeführe, Churzsegmänt verwärfe). Unde: d Hysterese vo dr GPS-State-Machine — ine ersch obedra, use ersch underhalb, mit Halteziit (Dwell).",
    maskLabel: "Maske (pro Sekunde)",
    runs: "Läuf",
    run1: "Lauf 1 (Lücke gschlosse)",
    run2: "Lauf 2",
    tooShort: "· z churz → verworfe",
    hyst: "Hysterese + Dwell (GPS-Fallback)",
    enter: "ENTER ~10 km/h",
    exit: "EXIT ~9 km/h",
  },
  se: {
    h: "Start & Änd — sub-sekunde-gnau",
    p: "S Modäll schaffet im Sekunde-Raschter, aber de **Ufsprung** isch es scharfs Ereignis. Drum wird de Lauf-Start uf de **Jump-Impuls** gsnappt: e sehr starchi Magnitude-Spitze (> 3,5× em 95-Perzentil — im Experimänt isch en Jump bi ~4,3× gsi, en Pump nu bi ~2,3×, also klar trännbar). De früeschti sone Impuls im Fänschter ±paar Sekunde markiert de echt Absprung — sub-sekunde-gnau zwüsched zwei GPS-Pünkt interpoliert. Fählt de Impuls, zieht de Server de Start über d Bschlünigungs-Rampe bis zum letschte Quasi-Stopp zrugg.",
    p2: "Am **Änd** luured zwei Falle: **Dead-Reckoning-Drift** (d Uhr taucht ab, extrapoliert s GPS und „driftet“ a Land) wird verworfe — Prior: en Lauf ändet nie landwärtiger als sin Start. Und wo e **OSM-Wasserflächi** bekannt isch, mönd Start und Änd **im Wasser** liege (Punkt-i-Polygon per Ray-Casting), susch wird uf s letscht echt Wasser-Sample zruggschnitte. Am Schluss wird s Änd no als **Sturz** (abrupte Speed-Iibruch vo „uf em Foil“ uf „im Wasser“, oder GPS-Dropout) oder **kontrollierte Stopp** klassifiziert.",
    cap: "De erkännt Sekunde-Start (grau) wird uf de scharf Ufsprung-Impuls im Bschlünigungs-Betrag gsnappt (cyan) — de wahr Foil-Start.",
    thr: "3,5 × p95 (Jump-Schwelle)",
    secStart: "Sekunde-Start",
    snapped: "← gsnappt uf de Ufsprung",
    afterPump: "denoo: Pump-Rhythmus",
  },
  pump: {
    h: "Pumps zelle — kadänz-gführt (v3)",
    p: "De naheliegend Wäg — „zell alli Peaks über ere Amplitude-Schwelle“ — **underschätzt strukturell um ~2×**: er pickt nu di gröschte Usschläg und verschluckt di chlinere, rhythmische Pumps dezwüsched. Gäge d **Wahrheit** (mini tippti Pump-Wahrheit, lueg unte) hät das nu ~40 % troffe.",
    p2: "De bessere Aasatz isch **kadänz-gführt**: I rhythmische, energieriiche Abschnitt schätzt e lokali FFT d **momentani Pump-Frequänz**, und dänn wird **pro Kadänz-Periode gnau ei** echts lokals Maximum als Pump gwählt. D Kadänz isch lokal-adaptiv, folgt also Tämpo-Wächsel. Resultat: **85–94 %** Träffer statt 40 % — und Zeller und Karte-Marker sind automatisch konsistänt (beidi us de gliiche Position). Es RMS-Gate verhinderet, dass rhythmuslosi Gleitphase mitzellt wärded.",
    cap: "Amplitude-Schwelle (obe) gseht nu di dicke Peaks. Kadänz-gführt (unde): lokali Periode T schätze, pro Periode s echt Maximum picke — au di sanfte Pumps.",
    top: "Amplitude-Schwelle — verschluckt chlini Pumps",
    bot: "Kadänz-gführt — ei Peak pro Periode T",
  },
  glide: {
    h: "Gleitphase — d Stilli zwüsched de Pumps",
    p: "Gnau das, wo Teil 1 als gröschts Potänzial gnännt hät, falt jetz fascht gschänkt ab: sind d Pump-Ziitpünkt bekannt, sind d **Gleitphase eifach d Lücke dezwüsched** — plus de Aalauf vom Lauf-Start bis zum erschte Pump (*lead*) und s Uslaufe vom letschte Pump bis zum Änd (*tail*). Drus falled pro Lauf **Aazahl**, **Ø-Gleitduur** und **längschti Gleitphase** ab — d Kennzahl defür, wie effizient en Foil de Schwung haltet.",
    cap: "Pumps (Marker) teiled de Lauf; d Lücke dezwüsched sind d Gleitphase. lead = Start→1. Pump, tail = letschte Pump→Änd. En lange tail = suubers Uslaufe.",
    start: "Start",
    end: "Änd",
    pumps: "Pumps",
    lead: "lead",
    tail: "tail (Gleite)",
    gaps: "Lücke = Gleitphase",
  },
  gpsonly: {
    h: "Ohni Accel: GPS-only & siini Fallschtrick",
    p: "Importierti Sessions (z. B. vo Polar) oder Uhre mit z grober Rate hend **kei bruuchbari Bschlünigung**. Dänn treit s GPS ellei — und das hät Macke:",
    li: [
      "**Einzel-Spikes** (Doppler-Glitch, „Teleport“): gäge de lokal Median ersetzt bzw. use-und-zrugg-Sprüng gglättet.",
      "**Mehr-sekündigi Doppler-Bursts** (~3 s uf 50 km/h, aber under dr 90-km/h-Glitch-Schwelle): gäge en robuste **15-s-Median** ersetzt — de isch gäge churzi Bursts unempfindlich, en echte ghaltene Lauf hebt en degäge mit a und bliibt unaagtaschtet. Zwei Bedingige (relativ über Median **und** absolut über ~28 km/h) schützed echti Läuf.",
      "**30-km/h-Pumpfoil-Gate**: ohni Accel cha me Pumpfoil nöd sicher vo aatriebnem Foile (Kite/Wind/Wake) tränne. Liit de gglättet Top-Speed über 30 km/h, gilt d Session als aatriebe → **kei** Pumpfoil. Mit Accel falt das Gate wäg — do vertraut d Uswärtig em Pump-/On-Foil-Signal.",
    ],
  },
  label: {
    h: "Woher d Wahrheit chunt — Pumps antippe",
    p: "S Modäll bruucht e **Wahrheit**, gäge wo de kadänz-gführt Pump-Zeller kalibriert wird — und die tipp ich mer zur Ziit sälber. Ich lueg s **Video** vo eme Lauf a und **tipp bi jedem echte Pump** uf en Chnopf. Das mach ich i **mehrere Takes**; die wärded per Kreuzkorrelation zu eme **Konsens** verrächnet (chlini Reaktionsziit-Versätz mittlet sich use). Resultat: di echti Pump-Zahl und s echte Timing pro Lauf. Das isch bewusst en **Übergang** — gnau gnueg zum hüt kalibriere, aber vo Hand tippt.",
    p2: "Wichtig bim Kalibriere gäge sonigi Labels: **GroupKFold** statt normaler Chrüzvalidierig. Nochbar-Sekunde vom gliiche Lauf sind fascht identisch — landed si zäme im Training und Test, würd sich s Modäll sälber abfroge (Leakage) und Traum-Wärt mälde. GroupKFold haltet drum **ganzi Sessions** zäme: teschtet wird immer uf Läuf, wo s Modäll nie gseh hät.",
    cap: "De Kreislauf: **tippti** Pump-Wahrheit → Features → RandomForest → foil_rf.pkl → Uswärtig vo jedere Session. Neui Taps flüssed zrugg, s Modäll wird neu kalibriert.",
    fits: ["Pumps antippe", "Video · mehrere Takes"],
    feats: ["Features", "14 × ±5 s Kontext"],
    rf: ["RandomForest", "GroupKFold-CV"],
    pkl: ["foil_rf.pkl", "→ jedi Session"],
    loopNote: "neui tippti Läuf → neu kalibriere",
  },
  x5: {
    h: "De nächscht Schritt — echti Wahrheit per Kamera (Insta360 X5)",
    p: "Antippe isch guet gnueg zum Bootstrappe, hanget aber a minere Reaktionsziit. Di **physikalisch exakti** Wahrheit chunt als Nächschts vo ere **Kamera am Board**: e Insta360 X5 filmt de Mast/Foil mit, und us em Video liest me **frame-gnau** ab, wänn de Foil würklich Druck überchunt und wänn er fliegt. Dedmit kalibriered mer Pump-Timing und On-Foil-Erkennig gäge echti Physik statt gäge tippti Näherig. Sobald s Rig stoot, chunt do en eigene Abschnitt mit em ganze Kamera-Setup.",
  },
  summary: {
    h: "De ganz Wäg in eim Satz",
    p1: "Rohi int16-Bschlünigung → **Betrag** → **Vertikale gäge d Schwärchraft** → **FFT-Bandpass** im Sliding-Window → 14 Merkmal pro Sekunde mit **±5 s Kontext** → **RandomForest** seit on-foil/nöd → **Segmentierig** zu Läuf (Hysterese, Merge, Dropout) → Start uf de **Ufsprung-Impuls** gsnappt, Änd gäge **Wasserflächi** & Drift korrigiert → **kadänz-gführti** Pump-Zellig → Gleitphase als Lücke → Kennzahle.",
    p2: "Und das alles us **einere Handglänk-Uhr** — d Mast-Uhr us Teil 1 isch nu d Referänz gsi, wo zeigt, dass es stimmt.",
  },
  limits: {
    h: "Gränze (witerhin ehrlich)",
    p: "D Uhr sitzt am Handglänk, nöd am Board — d Arme wädled zum Balanciere und überlagered s Pump-Signal („Wrist-Confound“). D Vertikale wird us dr Schwärchraft-Richtig gschätzt (kei Gyroskop) und isch bi ahaltender Bschlünigung chli verfälscht. De kadänz-gführt Zeller isch gäge App- und Video-Wahrheit kalibriert, aber di **physischi** Änd-Kalibrierig (Kamera am Board, Insta360 X5) stoot no us. Und d GPS-only-Gates sind en Kompromiss: lieber ehrlich „gps_only, Pumps n/a“ als erfundeni Zahle.",
  },
};

// --- Österreichisch (österr. Standarddeutsch mit dialektalem Anstrich) ---
const deAT: N2 = {
  back: "← Nerd-Analysen (Teil 1: das Experiment)",
  h1: "Nerd-Analysen · Teil 2",
  subtitle:
    "Wie aus rohen Sensor-Zahlen Pumps, On-Foil-Läufe, Start/Ende und Gleitphasen werden — die Signalverarbeitung, das Sliding-Window, das ML-Modell und das Labeling, schön der Reihe nach.",
  intro:
    "In [Teil 1](/nerd-analysen) ist es um die **Wahrheit** gegangen: eine zweite Uhr am Foil-Mast, die verrät, was der Foil wirklich macht. Da geht's um die **Maschinerie**: was der Server rechnet, damit aus einem Zappel-Signal am Handgelenk eine saubere Session-Auswertung wird. Alles Weitere passiert **serverseitig** — die Uhr ist eh nur ein dünner Recorder.",
  raw: {
    h: "Was daherkommt: die Rohdaten",
    p: "Jede Session besteht aus zwei Strömen, beide mit gemeinsamer Zeitbasis (ms ab Aufnahmestart):",
    li: [
      "**GPS**, ca. **1 Hz**: pro Sample `[t_ms, lat, lon, speed_mps, hr_bpm, h_acc_m]`. Speed und Puls können fehlen (dann aus der Position abgeleitet bzw. leer).",
      "**Beschleunigung**, je nach Uhr **10–100 Hz**: ein `int16`-Array der Form `(N × 3)` — X/Y/Z in Roh-Zählern. Ein `accel_scale` (Zähler pro g) macht daraus physikalische g.",
    ],
    p2: "Warum `int16` statt Fließkomma? Bandbreite. 100 Hz × 3 Achsen × 8 h sind Millionen Werte — als 2-Byte-Ganzzahlen halbiert das die Upload-Größe gscheit. Das Zurückskalieren auf g passiert erst am Server.",
  },
  pipe: {
    h: "Die Pipeline auf einen Blick",
    p: "Zwei Aufbereitungs-Spuren (GPS + Accel) laufen in ein ML-Modell, das **pro Sekunde** entscheidet „auf dem Foil — ja/nein“. Daraus werden zusammenhängende Läufe, deren Start/Ende feinjustiert wird, und schließlich Pumps & Gleitphasen pro Lauf:",
    cap: "Die ganze Auswertung: von den zwei Rohdaten-Strömen über die Foiling-Maske zu Läufen, Pumps und Gleitphasen.",
    gps: ["GPS  ~1 Hz", "t, lat, lon, speed, hr, h_acc"],
    accel: ["Beschleunigung  10–100 Hz", "int16 (N×3) · accel_scale"],
    gpsPrep: ["GPS aufbereiten", "Spike-/Doppler-Filter · glätten · Speed"],
    accelPrep: ["Accel aufbereiten", "Betrag → Vertikale · FFT-Bandpass"],
    model: ["ML-Foil-Modell — RandomForest, ±5 s Kontext", "Fallback ohne Accel: GPS-State-Machine (Hysterese + Dwell)"],
    mask: ["Foiling-Maske", "foil / nicht-foil — pro Sekunde"],
    seg: ["Segmentierung → Läufe", "Lücken schließen · mergen · Start/Ende snappen"],
    pumps: ["Pumps zählen", "kadenzgeführt, pro Lauf"],
    glide: ["Gleitphasen", "Lücken zwischen Pumps"],
  },
  mag: {
    h: "Schritt 1 — Betrag statt Achsen",
    p: "Die Uhr sitzt am Handgelenk und dreht sich dauernd — die drei Achsen X/Y/Z schauen ununterbrochen woandershin. Ein einzelner Achswert ist deshalb für die Fisch. Die Rettung ist der **Betrag** des Vektors:",
    formula: "|a| = √(x² + y² + z²) / accel_scale",
    p2: "Der Betrag ist **orientierungsinvariant**: egal wie die Uhr verdreht ist, ein 2-g-Stoß bleibt ein 2-g-Stoß. Damit wird das Signal überhaupt erst vergleichbar (`magnitude_g`).",
    cap: "Drei einzeln nichtssagende Achsen (die Uhr kippt dauernd) ergeben zusammen einen stabilen, orientierungsinvarianten Betrag |a|.",
    label: "|a| = √(x²+y²+z²)",
  },
  vert: {
    h: "Schritt 2 — vom Handgelenk in die Senkrechte",
    p: "Der Betrag hat einen Haken: ein Pump ist ein **Aufwärts-Push**, aber `|a|` zählt den Abstrich genauso wie den Aufstrich — jeder Pump kommt doppelt vor. Besser wär die echte **vertikale Beschleunigung gegen die Schwerkraft**. Und die lässt sich rekonstruieren, ganz ohne Gyroskop:",
    ol: [
      "Die **Schwerkraft-Richtung** ändert sich nur langsam → per **Tiefpass** (< 0,25 Hz) pro Achse schätzen. Das ergibt den Vektor `g`, der immer „nach unten“ zeigt.",
      "Die **dynamische** Beschleunigung ist `a − g`.",
      "Die auf den Schwerkraft-Einheitsvektor **projizieren** → skalares Signal: > 0 = aufwärts (Push).",
    ],
    f1: "v(t) = (a − g) · ĝ",
    fMid: "mit",
    f2: "ĝ = g / |g|",
    cap: "Die langsam driftende Schwerkraft g (Tiefpass) trennt Orientierung von Dynamik. Die dynamische Beschleunigung a−g, projiziert auf ĝ, ergibt einen sauberen Aufwärts-Push pro Pump.",
    gLabel: "g (Schwerkraft)",
    aLabel: "a (gemessen)",
    amg: "a − g",
    topNote: "|Betrag|: jeder Pump doppelt",
    botNote: "v(t) gegen Schwerkraft: ein Push pro Pump",
  },
  win: {
    h: "Schritt 3 — Sliding-Window & FFT-Bandpass",
    p: "Pumpen ist **rhythmisch** — und Rhythmus lebt im Frequenzraum. Deshalb schiebt ein **gleitendes Fenster** (typ. 4 s breit, alle 2 s ein Schritt) über das Signal, und für jedes Fenster rechnet eine **FFT** das Spektrum. Zwei Bänder sind wichtig:",
    li: [
      "**Filter-Band 0,3–3 Hz** — alles darunter ist Schwerkraft/Drift, alles darüber ist Splash-Rauschen. Beides wird per FFT-Bandpass genullt (`bandpass_fft`).",
      "**Pump-Band 0,5–2 Hz** — da lebt die Pump-Kadenz (30–120 Pumps/min).",
    ],
    p2: "Pro Fenster fallen vier Merkmale ab:",
    li2: [
      "**dom_freq** — dominante Frequenz im Pump-Band (die Pump-Rate)",
      "**band_power_ratio** — Anteil der Energie im Pump-Band am Gesamt-Band (hoch = klarer Rhythmus)",
      "**rms** — Signalstärke (Amplitude der Bewegung)",
      "**spectral_entropy** — wie „aufgeräumt“ das Spektrum ist (niedrig = eine klare Frequenz = Pumpen; hoch = Chaos = Rauschen/Gleiten)",
    ],
    cap: "Ein 4-s-Fenster wandert über das gefilterte Signal (Schritt 2 s → Überlappung). Für jedes Fenster liefert die FFT ein Spektrum; die Energie im Pump-Band 0,5–2 Hz verrät Rate und Rhythmus.",
    winT: "Fenster t",
    winT1: "Fenster t+1",
    sig: "v(t) — bandpass-gefiltert (0,3–3 Hz)",
    fft: "FFT",
    spec: "Spektrum",
    band: "0,5–2 Hz",
    freq: "Frequenz →",
  },
  rate: {
    h: "Ein Nerd-Detail: die echte Abtastrate",
    p: "Manche Uhren **schwindeln** bei ihrer Rate. Eine Forerunner 55 taggt „10 Hz“, liefert real aber nur ~2,5 Hz. Frequenz-Features und Pump-Kadenz wären damit für die Fisch. Deshalb bestimmt der Server die Rate **generisch aus den Daten selber**: `echte_Hz = Anzahl_Accel-Samples / GPS-Dauer`. Weicht das > 25 % vom Tag ab, gilt die gemessene Rate. Und liegt sie **unter 15 Hz**, ist das Signal für die Frequenzanalyse zu grob → die Session wird als **GPS-only** ausgewertet (Pumps n/a, dafür ehrliche Grenzen statt Fantasiewerte).",
  },
  ml: {
    h: "Wo bin ich auf dem Foil? — das ML-Modell",
    p: "Ob man in einer Sekunde **auf dem Foil** ist, entscheidet ein **RandomForest** — ein Wald aus Entscheidungsbäumen, die per Mehrheit abstimmen. Klein und interpretierbar, kein Deep Learning notwendig. Pro Sekunde kriegt er **14 Merkmale**:",
    li: [
      "**7 aus Speed & Accel**: Speed jetzt / 3 s / 5 s (Median), Speed-Variabilität, sowie RMS in drei Bändern (gesamt, Pump-Band, hochfrequent).",
      "**7 aus der GPS-Bahn**: Speed-Änderung über 1/3/5 s, Pfadlänge, Netto-Versatz, **Geradlinigkeit** (netto/pfad) und Kursänderung. Diese Richtungs-Features waren im Experiment der größte Hebel — sie halten ruhige Gleitphasen im Lauf, statt ihn zu zerstückeln.",
    ],
    p2: "Der Clou ist der **Kontext**: jede Sekunde wird nicht isoliert klassifiziert, sondern zusammen mit den **±5 Nachbarsekunden** (das „Windowize“). Der Feature-Vektor einer Sekunde ist also 14 × 11 = 154 Zahlen lang. So sieht das Modell den Verlauf — ein kurzer Speed-Einbruch mitten im Cruise wird nicht gleich als „draußen“ gewertet. Das hat die Fragmentierung von 1,10× auf 1,00× gebracht und den F1-Score von **0,93 auf 0,97**.",
    cap: "Pro Sekunde ein 14er-Merkmalsvektor; für die Klassifikation werden die ±5 Nachbarsekunden angehängt (Center-Label). Der RandomForest stimmt ab → foil / nicht-foil.",
    featNote: "Sekunden-Fenster: 14 Merkmale pro Sekunde, ±5 s Kontext",
    forest: "RandomForest (Mehrheit)",
    maskNote: "Maske pro Sekunde: foil ▮ / nicht-foil ▯",
  },
  seg: {
    h: "Von der Maske zu Läufen",
    p: "Die Sekunden-Maske ist noch löchrig. Sie wird zu sauberen **Läufen** geformt:",
    li: [
      "**Kurze Lücken schließen** (bis ~2 s): eine Gleit-Pause zerteilt keinen Lauf.",
      "**Physik-Floor**: unter ~9 km/h trägt kein Foil, und ohne echte Positions-Bewegung (nicht nur Speed-Feld) ist man nicht auf dem Foil — beides schneidet die weichen Ränder weg.",
      "**Mindestlänge & Ø-Speed**: Segmente unter 5 s oder mit zu niedrigem Schnitt fliegen raus (schnelles Gehen ≠ Foilen).",
      "**GPS-Dropout trennt**: eine Sample-Lücke > 15 s (Uhr unter Wasser/Sturz) beendet den Lauf — die Lückenzeit zählt nicht als Fahrzeit.",
      "**„Kein-Stopp“-Merge**: ist der Speed zwischen zwei erkannten Läufen **nie** unter ~5,4 km/h gefallen und lag kein Dropout vor, war's in Wahrheit **ein** Lauf (Modell-Aussetzer) → zusammenführen, egal wie lang.",
    ],
    p2: "Ohne brauchbare Beschleunigung (GPS-only) übernimmt eine **State-Machine** mit **Hysterese** und **Dwell**: Man wird erst „foilend“ nach ein paar Sekunden im Speed-Band *bei glattem Speed* (Gleiten ist glatt, Paddeln ist zach) — und verlässt den Zustand erst nach ein paar Sekunden darunter. Zwei Schwellen (rein/raus) verhindern das Flackern an der Grenze.",
    cap: "Oben: die löchrige Sekunden-Maske wird zu Läufen (Lücken schließen, mergen, Kurzsegmente verwerfen). Unten: die Hysterese der GPS-State-Machine — rein erst oberhalb, raus erst unterhalb, mit Haltezeit (Dwell).",
    maskLabel: "Maske (pro Sekunde)",
    runs: "Läufe",
    run1: "Lauf 1 (Lücken geschlossen)",
    run2: "Lauf 2",
    tooShort: "· zu kurz → verworfen",
    hyst: "Hysterese + Dwell (GPS-Fallback)",
    enter: "ENTER ~10 km/h",
    exit: "EXIT ~9 km/h",
  },
  se: {
    h: "Start & Ende — sub-sekundengenau",
    p: "Das Modell arbeitet im Sekundenraster, aber der **Aufsprung** ist ein scharfes Ereignis. Deshalb wird der Lauf-Start auf den **Jump-Impuls** gesnappt: eine sehr starke Magnitude-Spitze (> 3,5× dem 95-Perzentil — im Experiment lag ein Jump bei ~4,3×, ein Pump nur bei ~2,3×, also sauber trennbar). Der früheste solche Impuls im Fenster ±ein paar Sekunden markiert den echten Absprung — sub-sekundengenau zwischen zwei GPS-Punkten interpoliert. Fehlt der Impuls, zieht der Server den Start über die Beschleunigungs-Rampe bis zum letzten Quasi-Stopp zurück.",
    p2: "Am **Ende** lauern zwei Fallen: **Dead-Reckoning-Drift** (die Uhr taucht unter, extrapoliert das GPS und „driftet“ an Land) wird verworfen — Prior: ein Lauf endet nie landwärtiger als sein Start. Und wo eine **OSM-Wasserfläche** bekannt ist, müssen Start und Ende **im Wasser** liegen (Punkt-in-Polygon per Ray-Casting), sonst wird auf das letzte echte Wasser-Sample zurückgeschnitten. Zum Schluss wird das Ende noch als **Sturz** (abrupter Speed-Einbruch von „auf dem Foil“ auf „im Wasser“, oder GPS-Dropout) oder **kontrollierter Stopp** klassifiziert.",
    cap: "Der erkannte Sekunden-Start (grau) wird auf den scharfen Aufsprung-Impuls im Beschleunigungs-Betrag gesnappt (cyan) — der wahre Foil-Start.",
    thr: "3,5 × p95 (Jump-Schwelle)",
    secStart: "Sekunden-Start",
    snapped: "← gesnappt auf den Aufsprung",
    afterPump: "danach: Pump-Rhythmus",
  },
  pump: {
    h: "Pumps zählen — kadenzgeführt (v3)",
    p: "Der naheliegende Weg — „zähl alle Peaks über einer Amplituden-Schwelle“ — **unterschätzt strukturell um ~2×**: er pickt nur die größten Ausschläge und verschluckt die kleineren, rhythmischen Pumps dazwischen. Gegen die **Wahrheit** (meine getippte Pump-Wahrheit, siehe unten) hat das nur ~40 % getroffen.",
    p2: "Der bessere Ansatz ist **kadenzgeführt**: In rhythmischen, energiereichen Abschnitten schätzt eine lokale FFT die **momentane Pump-Frequenz**, und dann wird **pro Kadenz-Periode genau ein** echtes lokales Maximum als Pump gewählt. Die Kadenz ist lokal-adaptiv, folgt also Tempowechseln. Ergebnis: **85–94 %** Treffer statt 40 % — und Zähler und Karten-Marker sind automatisch konsistent (beide aus denselben Positionen). Ein RMS-Gate verhindert, dass rhythmuslose Gleitphasen mitgezählt werden.",
    cap: "Amplituden-Schwelle (oben) sieht nur die dicken Peaks. Kadenzgeführt (unten): lokale Periode T schätzen, pro Periode das echte Maximum picken — auch die sanften Pumps.",
    top: "Amplituden-Schwelle — verschluckt kleine Pumps",
    bot: "Kadenzgeführt — ein Peak pro Periode T",
  },
  glide: {
    h: "Gleitphasen — die Stille zwischen den Pumps",
    p: "Genau das, was Teil 1 als größtes Potenzial genannt hat, fällt jetzt fast geschenkt ab: sind die Pump-Zeitpunkte bekannt, sind die **Gleitphasen einfach die Lücken dazwischen** — plus der Anlauf vom Lauf-Start bis zum ersten Pump (*lead*) und das Auslaufen vom letzten Pump bis zum Ende (*tail*). Daraus fallen pro Lauf **Anzahl**, **Ø-Gleitdauer** und **längste Gleitphase** ab — die Kennzahl dafür, wie effizient ein Foil den Schwung hält.",
    cap: "Pumps (Marker) teilen den Lauf; die Lücken dazwischen sind die Gleitphasen. lead = Start→1. Pump, tail = letzter Pump→Ende. Ein langer tail = sauberes Auslaufen.",
    start: "Start",
    end: "Ende",
    pumps: "Pumps",
    lead: "lead",
    tail: "tail (Gleiten)",
    gaps: "Lücken = Gleitphasen",
  },
  gpsonly: {
    h: "Ohne Accel: GPS-only & seine Fallstricke",
    p: "Importierte Sessions (z. B. von Polar) oder Uhren mit zu grober Rate haben **keine brauchbare Beschleunigung**. Dann trägt allein das GPS — und das hat seine Macken:",
    li: [
      "**Einzel-Spikes** (Doppler-Glitch, „Teleport“): gegen den lokalen Median ersetzt bzw. raus-und-zurück-Sprünge geglättet.",
      "**Mehrsekündige Doppler-Bursts** (~3 s auf 50 km/h, aber unter der 90-km/h-Glitch-Schwelle): gegen einen robusten **15-s-Median** ersetzt — der ist gegen kurze Bursts unempfindlich, ein echter gehaltener Lauf hebt ihn dagegen mit an und bleibt unangetastet. Zwei Bedingungen (relativ über Median **und** absolut über ~28 km/h) schützen echte Läufe.",
      "**30-km/h-Pumpfoil-Gate**: ohne Accel kann man Pumpfoil nicht sicher von angetriebenem Foilen (Kite/Wind/Wake) trennen. Liegt der geglättete Top-Speed über 30 km/h, gilt die Session als angetrieben → **kein** Pumpfoil. Mit Accel entfällt dieses Gate — da vertraut die Auswertung dem Pump-/On-Foil-Signal.",
    ],
  },
  label: {
    h: "Woher die Wahrheit kommt — Pumps antippen",
    p: "Das Modell braucht eine **Wahrheit**, gegen die der kadenzgeführte Pump-Zähler kalibriert wird — und die tippe ich mir derzeit selber. Ich schau mir das **Video** eines Laufs an und **tippe bei jedem echten Pump** auf einen Knopf. Das mach ich in **mehreren Takes**; die werden per Kreuzkorrelation zu einem **Konsens** verrechnet (kleine Reaktionszeit-Versätze mitteln sich raus). Ergebnis: die echte Pump-Zahl und das echte Timing pro Lauf. Das ist bewusst ein **Übergang** — genau genug zum Kalibrieren heute, aber per Hand getippt.",
    p2: "Wichtig beim Kalibrieren gegen solche Labels: **GroupKFold** statt normaler Kreuzvalidierung. Nachbarsekunden desselben Laufs sind fast identisch — landeten sie gemeinsam in Trainings- und Testmenge, würde sich das Modell selber abfragen (Leakage) und Traumwerte melden. GroupKFold hält deshalb **ganze Sessions** zusammen: getestet wird immer auf Läufen, die das Modell nie gesehen hat.",
    cap: "Der Kreislauf: **getippte** Pump-Wahrheit → Features → RandomForest → foil_rf.pkl → Auswertung jeder Session. Neue Taps fließen zurück, das Modell wird neu kalibriert.",
    fits: ["Pumps antippen", "Video · mehrere Takes"],
    feats: ["Features", "14 × ±5 s Kontext"],
    rf: ["RandomForest", "GroupKFold-CV"],
    pkl: ["foil_rf.pkl", "→ jede Session"],
    loopNote: "neue getippte Läufe → neu kalibrieren",
  },
  x5: {
    h: "Der nächste Schritt — echte Wahrheit per Kamera (Insta360 X5)",
    p: "Antippen ist gut genug zum Bootstrappen, hängt aber an meiner Reaktionszeit. Die **physikalisch exakte** Wahrheit kommt als Nächstes von einer **Kamera am Board**: eine Insta360 X5 filmt Mast/Foil mit, und aus dem Video liest man **frame-genau** ab, wann der Foil wirklich Druck kriegt und wann er fliegt. Damit kalibrieren wir Pump-Timing und On-Foil-Erkennung gegen echte Physik statt gegen getippte Näherung. Sobald das Rig steht, kommt da ein eigener Abschnitt mit dem ganzen Kamera-Setup.",
  },
  summary: {
    h: "Der ganze Weg in einem Satz",
    p1: "Rohe int16-Beschleunigung → **Betrag** → **Vertikale gegen die Schwerkraft** → **FFT-Bandpass** im Sliding-Window → 14 Merkmale pro Sekunde mit **±5 s Kontext** → **RandomForest** sagt on-foil/nicht → **Segmentierung** zu Läufen (Hysterese, Merge, Dropout) → Start auf den **Aufsprung-Impuls** gesnappt, Ende gegen **Wasserfläche** & Drift korrigiert → **kadenzgeführte** Pump-Zählung → Gleitphasen als Lücken → Kennzahlen.",
    p2: "Und das alles aus **einer einzigen Handgelenk-Uhr** — die Mast-Uhr aus Teil 1 war eh nur die Referenz, die zeigt, dass es stimmt.",
  },
  limits: {
    h: "Grenzen (weiterhin ehrlich)",
    p: "Die Uhr sitzt am Handgelenk, nicht am Board — die Arme wedeln zum Balancieren und überlagern das Pump-Signal („Wrist-Confound“). Die Vertikale wird aus der Schwerkraft-Richtung geschätzt (kein Gyroskop) und ist bei anhaltender Beschleunigung a bisserl verfälscht. Der kadenzgeführte Zähler ist gegen App- und Video-Wahrheit kalibriert, aber die **physische** Endkalibrierung (Kamera am Board, Insta360 X5) steht noch aus. Und die GPS-only-Gates sind ein Kompromiss: lieber ehrlich „gps_only, Pumps n/a“ als erfundene Zahlen.",
  },
};

const en: N2 = {
  back: "← Nerd Analytics (Part 1: the experiment)",
  h1: "Nerd Analytics · Part 2",
  subtitle:
    "How raw sensor numbers become pumps, on-foil runs, start/end and glide phases — the signal processing, the sliding window, the ML model and the labeling, all nicely in order.",
  intro:
    "[Part 1](/nerd-analysen) was about the **truth**: a second watch on the foil mast that reveals what the foil really does. This one is about the **machinery**: what the server computes to turn a jittery wrist signal into a clean session analysis. Everything that follows happens **server-side** — the watch is just a thin recorder.",
  raw: {
    h: "What arrives: the raw data",
    p: "Every session consists of two streams, both with a shared time base (ms from recording start):",
    li: [
      "**GPS**, about **1 Hz**: per sample `[t_ms, lat, lon, speed_mps, hr_bpm, h_acc_m]`. Speed and heart rate may be missing (then derived from position, or left empty).",
      "**Acceleration**, depending on the watch **10–100 Hz**: an `int16` array of shape `(N × 3)` — X/Y/Z in raw counts. An `accel_scale` (counts per g) turns them into physical g.",
    ],
    p2: "Why `int16` instead of floating point? Bandwidth. 100 Hz × 3 axes × 8 h is millions of values — as 2-byte integers that halves the upload size. Scaling back to g only happens on the server.",
  },
  pipe: {
    h: "The pipeline at a glance",
    p: "Two preprocessing tracks (GPS + accel) feed into an ML model that decides **per second** “on the foil — yes/no”. From that come contiguous runs, whose start/end is fine-tuned, and finally pumps & glide phases per run:",
    cap: "The complete analysis: from the two raw-data streams via the foiling mask to runs, pumps and glide phases.",
    gps: ["GPS  ~1 Hz", "t, lat, lon, speed, hr, h_acc"],
    accel: ["Acceleration  10–100 Hz", "int16 (N×3) · accel_scale"],
    gpsPrep: ["Prepare GPS", "spike/Doppler filter · smooth · speed"],
    accelPrep: ["Prepare accel", "magnitude → vertical · FFT bandpass"],
    model: ["ML foil model — RandomForest, ±5 s context", "Fallback without accel: GPS state machine (hysteresis + dwell)"],
    mask: ["Foiling mask", "foil / not-foil — per second"],
    seg: ["Segmentation → runs", "close gaps · merge · snap start/end"],
    pumps: ["Count pumps", "cadence-guided, per run"],
    glide: ["Glide phases", "gaps between pumps"],
  },
  mag: {
    h: "Step 1 — magnitude instead of axes",
    p: "The watch sits on the wrist and keeps rotating — the three axes X/Y/Z constantly point elsewhere. A single axis value is therefore worthless. The rescue is the **magnitude** of the vector:",
    formula: "|a| = √(x² + y² + z²) / accel_scale",
    p2: "The magnitude is **orientation-invariant**: no matter how the watch is turned, a 2 g jolt stays a 2 g jolt. That is what makes the signal comparable in the first place (`magnitude_g`).",
    cap: "Three individually meaningless axes (the watch keeps tilting) together yield a stable, orientation-invariant magnitude |a|.",
    label: "|a| = √(x²+y²+z²)",
  },
  vert: {
    h: "Step 2 — from the wrist into the vertical",
    p: "The magnitude has a catch: a pump is an **upward push**, but `|a|` counts the down-stroke just like the up-stroke — every pump appears twice. Better would be the true **vertical acceleration against gravity**. And that can be reconstructed, entirely without a gyroscope:",
    ol: [
      "The **gravity direction** changes only slowly → estimate it per axis via a **low-pass** (< 0.25 Hz). That yields the vector `g`, which always points “downward”.",
      "The **dynamic** acceleration is `a − g`.",
      "**Project** it onto the gravity unit vector → scalar signal: > 0 = upward (push).",
    ],
    f1: "v(t) = (a − g) · ĝ",
    fMid: "with",
    f2: "ĝ = g / |g|",
    cap: "The slowly drifting gravity g (low-pass) separates orientation from dynamics. The dynamic acceleration a−g, projected onto ĝ, yields a clean upward push per pump.",
    gLabel: "g (gravity)",
    aLabel: "a (measured)",
    amg: "a − g",
    topNote: "|magnitude|: every pump twice",
    botNote: "v(t) against gravity: one push per pump",
  },
  win: {
    h: "Step 3 — sliding window & FFT bandpass",
    p: "Pumping is **rhythmic** — and rhythm lives in the frequency domain. That is why a **sliding window** (typically 4 s wide, one step every 2 s) moves across the signal, and for each window an **FFT** computes the spectrum. Two bands matter:",
    li: [
      "**Filter band 0.3–3 Hz** — everything below is gravity/drift, everything above is splash noise. Both are zeroed via FFT bandpass (`bandpass_fft`).",
      "**Pump band 0.5–2 Hz** — this is where the pump cadence lives (30–120 pumps/min).",
    ],
    p2: "Each window yields four features:",
    li2: [
      "**dom_freq** — dominant frequency in the pump band (the pump rate)",
      "**band_power_ratio** — share of the energy in the pump band relative to the overall band (high = clear rhythm)",
      "**rms** — signal strength (amplitude of the movement)",
      "**spectral_entropy** — how “tidy” the spectrum is (low = one clear frequency = pumping; high = chaos = noise/gliding)",
    ],
    cap: "A 4 s window travels across the filtered signal (2 s step → overlap). For each window the FFT delivers a spectrum; the energy in the pump band 0.5–2 Hz reveals rate and rhythm.",
    winT: "window t",
    winT1: "window t+1",
    sig: "v(t) — bandpass-filtered (0.3–3 Hz)",
    fft: "FFT",
    spec: "spectrum",
    band: "0.5–2 Hz",
    freq: "frequency →",
  },
  rate: {
    h: "A nerd detail: the true sampling rate",
    p: "Some watches **lie** about their rate. A Forerunner 55 tags “10 Hz” but really delivers only ~2.5 Hz. Frequency features and pump cadence would be garbage with that. That is why the server determines the rate **generically from the data itself**: `real_Hz = accel_sample_count / GPS_duration`. If that deviates > 25 % from the tag, the measured rate applies. And if it is **below 15 Hz**, the signal is too coarse for frequency analysis → the session is evaluated as **GPS-only** (pumps n/a, but with honest limits instead of fantasy values).",
  },
  ml: {
    h: "Where am I on the foil? — the ML model",
    p: "Whether you are **on the foil** in a given second is decided by a **RandomForest** — a forest of decision trees that vote by majority. Small and interpretable, no deep learning needed. Each second it gets **14 features**:",
    li: [
      "**7 from speed & accel**: speed now / 3 s / 5 s (median), speed variability, plus RMS in three bands (overall, pump band, high frequency).",
      "**7 from the GPS track**: speed change over 1/3/5 s, path length, net displacement, **straightness** (net/path) and course change. These directional features were the biggest lever in the experiment — they hold calm glide phases inside the run instead of fragmenting it.",
    ],
    p2: "The trick is the **context**: each second is not classified in isolation, but together with the **±5 neighboring seconds** (the “windowize”). The feature vector of one second is therefore 14 × 11 = 154 numbers long. That way the model sees the trajectory — a brief speed dip in the middle of the cruise is not immediately counted as “out”. That brought fragmentation from 1.10× to 1.00× and the F1 score from **0.93 to 0.97**.",
    cap: "One 14-feature vector per second; for classification the ±5 neighboring seconds are appended (center label). The RandomForest votes → foil / not-foil.",
    featNote: "second window: 14 features per second, ±5 s context",
    forest: "RandomForest (majority)",
    maskNote: "mask per second: foil ▮ / not-foil ▯",
  },
  seg: {
    h: "From the mask to runs",
    p: "The per-second mask is still full of holes. It is shaped into clean **runs**:",
    li: [
      "**Close short gaps** (up to ~2 s): a glide pause does not split a run.",
      "**Physics floor**: below ~9 km/h no foil carries, and without real positional movement (not just the speed field) you are not on the foil — both trim the soft edges away.",
      "**Minimum length & avg speed**: segments under 5 s or with too low an average are dropped (brisk walking ≠ foiling).",
      "**GPS dropout separates**: a sample gap > 15 s (watch underwater/fall) ends the run — the gap time does not count as riding time.",
      "**“No-stop” merge**: if the speed between two detected runs **never** dropped below ~5.4 km/h and there was no dropout, it was in truth **one** run (model dropout) → merge, no matter how long.",
    ],
    p2: "Without usable acceleration (GPS-only) a **state machine** with **hysteresis** and **dwell** takes over: you only become “foiling” after several seconds in the speed band *with smooth speed* (gliding is smooth, paddling choppy) — and you only leave the state after several seconds below it. Two thresholds (in/out) prevent flickering at the boundary.",
    cap: "Top: the hole-riddled per-second mask becomes runs (close gaps, merge, discard short segments). Bottom: the hysteresis of the GPS state machine — in only above, out only below, with a hold time (dwell).",
    maskLabel: "mask (per second)",
    runs: "runs",
    run1: "run 1 (gaps closed)",
    run2: "run 2",
    tooShort: "· too short → discarded",
    hyst: "hysteresis + dwell (GPS fallback)",
    enter: "ENTER ~10 km/h",
    exit: "EXIT ~9 km/h",
  },
  se: {
    h: "Start & end — sub-second accurate",
    p: "The model works on a per-second grid, but the **takeoff** is a sharp event. That is why the run start is snapped to the **jump impulse**: a very strong magnitude spike (> 3.5× the 95th percentile — in the experiment a jump was at ~4.3×, a pump only at ~2.3×, so clearly separable). The earliest such impulse in the window of ±a few seconds marks the true takeoff — interpolated sub-second between two GPS points. If the impulse is missing, the server pulls the start back along the acceleration ramp to the last quasi-stop.",
    p2: "At the **end** two traps lurk: **dead-reckoning drift** (the watch dives under, extrapolates the GPS and “drifts” onto land) is discarded — prior: a run never ends more landward than its start. And where an **OSM water surface** is known, start and end must lie **in the water** (point-in-polygon via ray casting), otherwise it is trimmed back to the last real water sample. Finally the end is classified as a **fall** (abrupt speed drop from “on foil” to “in the water”, or GPS dropout) or a **controlled stop**.",
    cap: "The detected per-second start (gray) is snapped to the sharp takeoff impulse in the acceleration magnitude (cyan) — the true foil start.",
    thr: "3.5 × p95 (jump threshold)",
    secStart: "per-second start",
    snapped: "← snapped to the takeoff",
    afterPump: "afterwards: pump rhythm",
  },
  pump: {
    h: "Counting pumps — cadence-guided (v3)",
    p: "The obvious way — “count all peaks above an amplitude threshold” — **structurally underestimates by ~2×**: it only picks the largest swings and swallows the smaller, rhythmic pumps in between. Against the **truth** (my tapped pump ground truth, see below) that hit only ~40 %.",
    p2: "The better approach is **cadence-guided**: in rhythmic, energy-rich sections a local FFT estimates the **instantaneous pump frequency**, and then **exactly one** real local maximum per cadence period is chosen as a pump. The cadence is locally adaptive, so it follows tempo changes. Result: **85–94 %** hit rate instead of 40 % — and the counter and map markers are automatically consistent (both from the same positions). An RMS gate prevents rhythmless glide phases from being counted along.",
    cap: "Amplitude threshold (top) only sees the fat peaks. Cadence-guided (bottom): estimate the local period T, pick the real maximum per period — including the gentle pumps.",
    top: "amplitude threshold — swallows small pumps",
    bot: "cadence-guided — one peak per period T",
  },
  glide: {
    h: "Glide phases — the silence between the pumps",
    p: "Exactly what Part 1 named as the biggest potential now comes almost for free: once the pump timestamps are known, the **glide phases are simply the gaps between them** — plus the run-up from the run start to the first pump (*lead*) and the run-out from the last pump to the end (*tail*). From that come **count**, **avg glide duration** and **longest glide phase** per run — the metric for how efficiently a foil holds its momentum.",
    cap: "Pumps (markers) divide the run; the gaps in between are the glide phases. lead = start→1st pump, tail = last pump→end. A long tail = clean run-out.",
    start: "start",
    end: "end",
    pumps: "pumps",
    lead: "lead",
    tail: "tail (glide)",
    gaps: "gaps = glide phases",
  },
  gpsonly: {
    h: "Without accel: GPS-only & its pitfalls",
    p: "Imported sessions (e.g. from Polar) or watches with too coarse a rate have **no usable acceleration**. Then GPS alone carries — and that has quirks:",
    li: [
      "**Single spikes** (Doppler glitch, “teleport”): replaced against the local median, or out-and-back jumps smoothed.",
      "**Multi-second Doppler bursts** (~3 s at 50 km/h, but below the 90 km/h glitch threshold): replaced against a robust **15 s median** — that is insensitive to short bursts, whereas a real sustained run lifts it along and stays untouched. Two conditions (relative above the median **and** absolute above ~28 km/h) protect real runs.",
      "**30 km/h pumpfoil gate**: without accel, pumpfoiling cannot be reliably separated from powered foiling (kite/wind/wake). If the smoothed top speed is above 30 km/h, the session counts as powered → **no** pumpfoiling. With accel this gate is dropped — there the analysis trusts the pump/on-foil signal.",
    ],
  },
  label: {
    h: "Where the truth comes from — tapping the pumps",
    p: "The model needs a **ground truth** to calibrate the cadence-guided pump counter against — and right now I tap it in myself. I watch the **video** of a run and **tap a button on every real pump**. I do this in **several takes**; they are combined into a **consensus** via cross-correlation (small reaction-time offsets average out). The result: the true pump count and timing per run. This is deliberately a **stopgap** — accurate enough to calibrate today, but hand-tapped.",
    p2: "Important when calibrating against such labels: **GroupKFold** instead of ordinary cross-validation. Neighboring seconds of the same run are almost identical — if they landed in the training and test set at the same time, the model would be quizzing itself (leakage) and report dream scores. GroupKFold therefore keeps **whole sessions** together: testing always happens on runs the model has never seen.",
    cap: "The loop: **tapped** pump truth → features → RandomForest → foil_rf.pkl → analysis of every session. New taps flow back, the model is recalibrated.",
    fits: ["tap the pumps", "video · several takes"],
    feats: ["features", "14 × ±5 s context"],
    rf: ["RandomForest", "GroupKFold CV"],
    pkl: ["foil_rf.pkl", "→ every session"],
    loopNote: "new tapped runs → recalibrate",
  },
  x5: {
    h: "The next step — real truth from a camera (Insta360 X5)",
    p: "Tapping is good enough to bootstrap, but it hinges on my reaction time. The **physically exact** truth comes next from a **camera on the board**: an Insta360 X5 films the mast/foil, and from the video you can read off **frame-accurately** when the foil actually gets pressure and when it flies. With that we calibrate pump timing and on-foil detection against real physics instead of a tapped approximation. Once the rig is set up, a dedicated section with the whole camera setup will land right here.",
  },
  summary: {
    h: "The whole path in one sentence",
    p1: "Raw int16 acceleration → **magnitude** → **vertical against gravity** → **FFT bandpass** in the sliding window → 14 features per second with **±5 s context** → **RandomForest** says on-foil/not → **segmentation** into runs (hysteresis, merge, dropout) → start snapped to the **takeoff impulse**, end corrected against the **water surface** & drift → **cadence-guided** pump counting → glide phases as gaps → metrics.",
    p2: "And all of that from **a single wrist watch** — the mast watch from Part 1 was only the reference that shows it is right.",
  },
  limits: {
    h: "Limits (still honest)",
    p: "The watch sits on the wrist, not on the board — the arms wave to balance and overlay the pump signal (“wrist confound”). The vertical is estimated from the gravity direction (no gyroscope) and is slightly distorted under sustained acceleration. The cadence-guided counter is calibrated against app and video truth, but the **physical** final calibration (camera on the board, Insta360 X5) is still pending. And the GPS-only gates are a compromise: better an honest “gps_only, pumps n/a” than made-up numbers.",
  },
};

const fr: N2 = {
  back: "← Analyses de geek (Partie 1 : l’expérience)",
  h1: "Analyses de geek · Partie 2",
  subtitle:
    "Comment des chiffres bruts de capteurs deviennent des pumps, des runs on-foil, un début/une fin et des phases de glisse — le traitement du signal, la fenêtre glissante, le modèle ML et le labeling, dans l’ordre.",
  intro:
    "Dans la [Partie 1](/nerd-analysen), il était question de la **vérité** : une seconde montre sur le mât du foil, qui révèle ce que le foil fait réellement. Ici, il s’agit de la **machinerie** : ce que le serveur calcule pour transformer un signal agité au poignet en une analyse de session propre. Tout ce qui suit se passe **côté serveur** — la montre n’est qu’un mince enregistreur.",
  raw: {
    h: "Ce qui arrive : les données brutes",
    p: "Chaque session se compose de deux flux, tous deux partageant une même base de temps (ms depuis le début de l’enregistrement) :",
    li: [
      "**GPS**, env. **1 Hz** : par échantillon `[t_ms, lat, lon, speed_mps, hr_bpm, h_acc_m]`. La vitesse et le pouls peuvent manquer (alors déduits de la position, ou laissés vides).",
      "**Accélération**, selon la montre **10–100 Hz** : un tableau `int16` de forme `(N × 3)` — X/Y/Z en comptes bruts. Un `accel_scale` (comptes par g) en fait des g physiques.",
    ],
    p2: "Pourquoi `int16` plutôt que du flottant ? La bande passante. 100 Hz × 3 axes × 8 h font des millions de valeurs — sous forme d’entiers sur 2 octets, cela réduit de moitié la taille de l’upload. La remise à l’échelle vers les g n’a lieu qu’au serveur.",
  },
  pipe: {
    h: "La pipeline en un coup d’œil",
    p: "Deux voies de préparation (GPS + accel) alimentent un modèle ML qui décide **à chaque seconde** « sur le foil — oui/non ». On en tire des runs contigus, dont le début/la fin sont ajustés finement, puis enfin les pumps et les phases de glisse par run :",
    cap: "L’analyse complète : des deux flux de données brutes, via le masque de foiling, aux runs, aux pumps et aux phases de glisse.",
    gps: ["GPS  ~1 Hz", "t, lat, lon, speed, hr, h_acc"],
    accel: ["Accélération  10–100 Hz", "int16 (N×3) · accel_scale"],
    gpsPrep: ["Préparer le GPS", "filtre spike/Doppler · lisser · vitesse"],
    accelPrep: ["Préparer l’accel", "norme → verticale · bande passante FFT"],
    model: ["Modèle foil ML — RandomForest, contexte ±5 s", "Repli sans accel : machine à états GPS (hystérésis + dwell)"],
    mask: ["Masque de foiling", "foil / non-foil — à chaque seconde"],
    seg: ["Segmentation → runs", "combler les trous · fusionner · caler début/fin"],
    pumps: ["Compter les pumps", "guidé par la cadence, par run"],
    glide: ["Phases de glisse", "trous entre les pumps"],
  },
  mag: {
    h: "Étape 1 — la norme plutôt que les axes",
    p: "La montre est au poignet et tourne sans arrêt — les trois axes X/Y/Z pointent constamment ailleurs. Une valeur d’axe isolée est donc sans intérêt. Le salut, c’est la **norme** du vecteur :",
    formula: "|a| = √(x² + y² + z²) / accel_scale",
    p2: "La norme est **invariante à l’orientation** : peu importe comment la montre est tournée, un choc de 2 g reste un choc de 2 g. C’est ce qui rend le signal comparable en premier lieu (`magnitude_g`).",
    cap: "Trois axes individuellement sans signification (la montre bascule sans arrêt) donnent ensemble une norme |a| stable et invariante à l’orientation.",
    label: "|a| = √(x²+y²+z²)",
  },
  vert: {
    h: "Étape 2 — du poignet vers la verticale",
    p: "La norme a un défaut : un pump est une **poussée vers le haut**, mais `|a|` compte la descente autant que la montée — chaque pump apparaît en double. Mieux vaudrait la vraie **accélération verticale contre la gravité**. Et elle peut se reconstruire, sans le moindre gyroscope :",
    ol: [
      "La **direction de la gravité** ne change que lentement → l’estimer par un **passe-bas** (< 0,25 Hz) sur chaque axe. On obtient le vecteur `g`, qui pointe toujours « vers le bas ».",
      "L’accélération **dynamique** est `a − g`.",
      "La **projeter** sur le vecteur unitaire de gravité → signal scalaire : > 0 = vers le haut (poussée).",
    ],
    f1: "v(t) = (a − g) · ĝ",
    fMid: "avec",
    f2: "ĝ = g / |g|",
    cap: "La gravité g qui dérive lentement (passe-bas) sépare l’orientation de la dynamique. L’accélération dynamique a−g, projetée sur ĝ, donne une poussée vers le haut nette par pump.",
    gLabel: "g (gravité)",
    aLabel: "a (mesuré)",
    amg: "a − g",
    topNote: "|norme| : chaque pump en double",
    botNote: "v(t) contre la gravité : une poussée par pump",
  },
  win: {
    h: "Étape 3 — fenêtre glissante & bande passante FFT",
    p: "Pomper est **rythmique** — et le rythme vit dans le domaine fréquentiel. C’est pourquoi une **fenêtre glissante** (typiquement 4 s de large, un pas toutes les 2 s) glisse sur le signal, et pour chaque fenêtre une **FFT** calcule le spectre. Deux bandes importent :",
    li: [
      "**Bande de filtrage 0,3–3 Hz** — tout ce qui est en dessous est gravité/dérive, tout ce qui est au-dessus est bruit d’éclaboussures. Les deux sont mis à zéro par bande passante FFT (`bandpass_fft`).",
      "**Bande de pump 0,5–2 Hz** — c’est là que vit la cadence de pump (30–120 pumps/min).",
    ],
    p2: "Par fenêtre, quatre caractéristiques ressortent :",
    li2: [
      "**dom_freq** — fréquence dominante dans la bande de pump (le taux de pump)",
      "**band_power_ratio** — part de l’énergie dans la bande de pump par rapport à la bande totale (élevé = rythme net)",
      "**rms** — force du signal (amplitude du mouvement)",
      "**spectral_entropy** — à quel point le spectre est « rangé » (bas = une fréquence nette = pomper ; haut = chaos = bruit/glisse)",
    ],
    cap: "Une fenêtre de 4 s se déplace sur le signal filtré (pas de 2 s → chevauchement). Pour chaque fenêtre, la FFT fournit un spectre ; l’énergie dans la bande de pump 0,5–2 Hz révèle le taux et le rythme.",
    winT: "Fenêtre t",
    winT1: "Fenêtre t+1",
    sig: "v(t) — filtré par bande passante (0,3–3 Hz)",
    fft: "FFT",
    spec: "Spectre",
    band: "0,5–2 Hz",
    freq: "Fréquence →",
  },
  rate: {
    h: "Un détail de geek : le vrai taux d’échantillonnage",
    p: "Certaines montres **mentent** sur leur taux. Une Forerunner 55 taggue « 10 Hz » mais ne livre en réalité que ~2,5 Hz. Les features de fréquence et la cadence de pump seraient alors bons à jeter. C’est pourquoi le serveur détermine le taux **génériquement à partir des données elles-mêmes** : `vrai_Hz = nombre_échantillons_accel / durée_GPS`. Si cela s’écarte de > 25 % du tag, le taux mesuré fait foi. Et s’il est **sous 15 Hz**, le signal est trop grossier pour l’analyse fréquentielle → la session est analysée en **GPS-only** (pumps n/a, mais des limites honnêtes plutôt que des valeurs fantaisistes).",
  },
  ml: {
    h: "Où suis-je sur le foil ? — le modèle ML",
    p: "Savoir si, à une seconde donnée, on est **sur le foil** revient à un **RandomForest** — une forêt d’arbres de décision qui votent à la majorité. Petit et interprétable, pas besoin de deep learning. Chaque seconde, il reçoit **14 caractéristiques** :",
    li: [
      "**7 issues de la vitesse & de l’accel** : vitesse maintenant / 3 s / 5 s (médiane), variabilité de la vitesse, ainsi que le RMS dans trois bandes (totale, bande de pump, haute fréquence).",
      "**7 issues de la trajectoire GPS** : variation de vitesse sur 1/3/5 s, longueur du chemin, décalage net, **rectitude** (net/chemin) et changement de cap. Ces features de direction ont été le plus gros levier dans l’expérience — elles maintiennent les phases de glisse calmes dans le run, au lieu de le morceler.",
    ],
    p2: "L’astuce, c’est le **contexte** : chaque seconde n’est pas classifiée isolément, mais avec les **±5 secondes voisines** (le « windowize »). Le vecteur de caractéristiques d’une seconde fait donc 14 × 11 = 154 nombres de long. Ainsi le modèle voit l’évolution — une brève chute de vitesse en plein cruise n’est pas aussitôt comptée comme « sorti ». Cela a fait passer la fragmentation de 1,10× à 1,00× et le F1-score de **0,93 à 0,97**.",
    cap: "Par seconde, un vecteur de 14 caractéristiques ; pour la classification, les ±5 secondes voisines sont concaténées (label du centre). Le RandomForest vote → foil / non-foil.",
    featNote: "Fenêtre de secondes : 14 caractéristiques par seconde, contexte ±5 s",
    forest: "RandomForest (majorité)",
    maskNote: "Masque par seconde : foil ▮ / non-foil ▯",
  },
  seg: {
    h: "Du masque aux runs",
    p: "Le masque par seconde est encore troué. Il est mis en forme en **runs** propres :",
    li: [
      "**Combler les courts trous** (jusqu’à ~2 s) : une pause de glisse ne coupe pas un run.",
      "**Plancher physique** : sous ~9 km/h aucun foil ne porte, et sans vrai déplacement de position (pas seulement le champ de vitesse) on n’est pas sur le foil — les deux rognent les bords mous.",
      "**Longueur minimale & vitesse moyenne** : les segments de moins de 5 s ou à moyenne trop basse dégagent (marcher vite ≠ foiler).",
      "**Un dropout GPS sépare** : un trou d’échantillons > 15 s (montre sous l’eau/chute) termine le run — le temps du trou ne compte pas comme temps de trajet.",
      "**Fusion « sans arrêt »** : si la vitesse entre deux runs détectés n’est **jamais** descendue sous ~5,4 km/h et qu’il n’y avait pas de dropout, c’était en vérité **un seul** run (défaillance du modèle) → fusionner, quelle qu’en soit la durée.",
    ],
    p2: "Sans accélération exploitable (GPS-only), une **machine à états** avec **hystérésis** et **dwell** prend le relais : on ne devient « foilant » qu’après plusieurs secondes dans la bande de vitesse *avec une vitesse lisse* (la glisse est lisse, pagayer est haché) — et on ne quitte l’état qu’après plusieurs secondes en dessous. Deux seuils (entrée/sortie) empêchent le scintillement à la frontière.",
    cap: "En haut : le masque troué par seconde devient des runs (combler les trous, fusionner, écarter les courts segments). En bas : l’hystérésis de la machine à états GPS — entrée seulement au-dessus, sortie seulement en dessous, avec temps de maintien (dwell).",
    maskLabel: "Masque (par seconde)",
    runs: "Runs",
    run1: "Run 1 (trous comblés)",
    run2: "Run 2",
    tooShort: "· trop court → écarté",
    hyst: "Hystérésis + dwell (repli GPS)",
    enter: "ENTER ~10 km/h",
    exit: "EXIT ~9 km/h",
  },
  se: {
    h: "Début & fin — à la sous-seconde près",
    p: "Le modèle travaille en grille de secondes, mais le **décollage** est un événement net. C’est pourquoi le début du run est calé sur l’**impulsion de saut** : un pic de magnitude très fort (> 3,5× le 95e percentile — dans l’expérience un saut était à ~4,3×, un pump seulement à ~2,3×, donc clairement séparables). La première impulsion de ce type dans la fenêtre de ±quelques secondes marque le vrai décollage — interpolé à la sous-seconde près entre deux points GPS. À défaut d’impulsion, le serveur remonte le début le long de la rampe d’accélération jusqu’au dernier quasi-arrêt.",
    p2: "À la **fin**, deux pièges guettent : la **dérive du dead reckoning** (la montre plonge, extrapole le GPS et « dérive » vers la terre) est rejetée — a priori : un run ne finit jamais plus vers la terre que son début. Et là où un **polygone d’eau OSM** est connu, le début et la fin doivent se situer **dans l’eau** (point-dans-polygone par ray-casting), sinon on rogne jusqu’au dernier vrai échantillon dans l’eau. Enfin, la fin est encore classée comme **chute** (chute brutale de vitesse de « sur le foil » à « dans l’eau », ou dropout GPS) ou **arrêt contrôlé**.",
    cap: "Le début par seconde détecté (gris) est calé sur l’impulsion nette de décollage dans la norme d’accélération (cyan) — le vrai début de foil.",
    thr: "3,5 × p95 (seuil de saut)",
    secStart: "Début par seconde",
    snapped: "← calé sur le décollage",
    afterPump: "ensuite : rythme de pump",
  },
  pump: {
    h: "Compter les pumps — guidé par la cadence (v3)",
    p: "La voie évidente — « compter tous les pics au-dessus d’un seuil d’amplitude » — **sous-estime structurellement d’environ 2×** : elle ne cueille que les plus grosses oscillations et avale les pumps plus petits et rythmiques entre elles. Face à la **vérité** (ma vérité de pump tapée, voir plus bas), elle n’atteignait que ~40 %.",
    p2: "La meilleure approche est **guidée par la cadence** : dans les sections rythmiques et riches en énergie, une FFT locale estime la **fréquence de pump instantanée**, puis **un seul** vrai maximum local est choisi comme pump **par période de cadence**. La cadence est localement adaptative, elle suit donc les changements de tempo. Résultat : **85–94 %** de justes au lieu de 40 % — et le compteur et les marqueurs de carte sont automatiquement cohérents (les deux issus des mêmes positions). Un RMS-gate empêche que des phases de glisse sans rythme soient comptées.",
    cap: "Le seuil d’amplitude (en haut) ne voit que les gros pics. Guidé par la cadence (en bas) : estimer la période locale T, cueillir le vrai maximum par période — même les pumps doux.",
    top: "Seuil d’amplitude — avale les petits pumps",
    bot: "Guidé par la cadence — un pic par période T",
  },
  glide: {
    h: "Phases de glisse — le silence entre les pumps",
    p: "Justement ce que la Partie 1 citait comme le plus grand potentiel tombe désormais presque gratuitement : une fois connus les instants de pump, les **phases de glisse ne sont que les trous entre eux** — plus l’élan du début du run jusqu’au premier pump (*lead*) et la décélération du dernier pump jusqu’à la fin (*tail*). On en tire par run le **nombre**, la **durée moyenne de glisse** et la **plus longue phase de glisse** — l’indicateur de l’efficacité avec laquelle un foil conserve l’élan.",
    cap: "Les pumps (marqueurs) découpent le run ; les trous entre eux sont les phases de glisse. lead = début→1er pump, tail = dernier pump→fin. Un long tail = une décélération propre.",
    start: "Début",
    end: "Fin",
    pumps: "Pumps",
    lead: "lead",
    tail: "tail (glisse)",
    gaps: "Trous = phases de glisse",
  },
  gpsonly: {
    h: "Sans accel : le GPS-only et ses pièges",
    p: "Les sessions importées (p. ex. de Polar) ou les montres au taux trop grossier n’ont **pas d’accélération exploitable**. Alors seul le GPS porte — et il a ses défauts :",
    li: [
      "**Spikes isolés** (glitch Doppler, « téléport ») : remplacés par rapport à la médiane locale, ou les sauts aller-retour sont lissés.",
      "**Bursts Doppler de plusieurs secondes** (~3 s à 50 km/h, mais sous le seuil de glitch de 90 km/h) : remplacés par une **médiane robuste sur 15 s** — celle-ci est insensible aux courts bursts, tandis qu’un vrai run tenu la relève et reste intact. Deux conditions (relatif au-dessus de la médiane **et** absolu au-dessus de ~28 km/h) protègent les vrais runs.",
      "**Gate pumpfoil à 30 km/h** : sans accel, on ne peut pas distinguer sûrement le pumpfoil d’un foil propulsé (kite/vent/wake). Si le top speed lissé dépasse 30 km/h, la session est considérée comme propulsée → **pas** de pumpfoil. Avec accel ce gate disparaît — là, l’analyse fait confiance au signal pump/on-foil.",
    ],
  },
  label: {
    h: "D’où vient la vérité — taper les pumps",
    p: "Le modèle a besoin d’une **vérité terrain** pour calibrer le compteur de pumps guidé par la cadence — et pour l’instant, c’est moi qui la tape. Je regarde la **vidéo** d’un run et je **tape sur un bouton à chaque pump réel**. Je le fais en **plusieurs prises** ; elles sont combinées en un **consensus** par corrélation croisée (les petits décalages de temps de réaction se moyennent). Résultat : le vrai nombre de pumps et le vrai timing par run. C’est volontairement une **solution transitoire** — assez précise pour calibrer aujourd’hui, mais tapée à la main.",
    p2: "Important pour calibrer contre de tels labels : **GroupKFold** plutôt qu’une validation croisée classique. Des secondes voisines d’un même run sont quasi identiques — si elles atterrissaient à la fois dans l’ensemble d’entraînement et de test, le modèle s’interrogerait lui-même (fuite) et rapporterait des valeurs de rêve. GroupKFold garde donc des **sessions entières** ensemble : on teste toujours sur des runs que le modèle n’a jamais vus.",
    cap: "Le cycle : vérité de pump **tapée** → features → RandomForest → foil_rf.pkl → analyse de chaque session. Les nouveaux taps reviennent, le modèle est recalibré.",
    fits: ["taper les pumps", "vidéo · plusieurs prises"],
    feats: ["Features", "14 × contexte ±5 s"],
    rf: ["RandomForest", "CV GroupKFold"],
    pkl: ["foil_rf.pkl", "→ chaque session"],
    loopNote: "nouveaux runs tapés → recalibrer",
  },
  x5: {
    h: "L’étape suivante — la vraie vérité par caméra (Insta360 X5)",
    p: "Taper suffit pour amorcer, mais cela dépend de mon temps de réaction. La vérité **physiquement exacte** viendra ensuite d’une **caméra sur la board** : une Insta360 X5 filme le mât/foil, et à partir de la vidéo on lit **à la frame près** quand le foil reçoit vraiment de la pression et quand il vole. On calibre ainsi le timing des pumps et la détection on-foil contre de la vraie physique plutôt que contre une approximation tapée. Dès que le rig est en place, une section dédiée avec tout le montage caméra arrivera ici.",
  },
  summary: {
    h: "Tout le parcours en une phrase",
    p1: "Accélération int16 brute → **norme** → **verticale contre la gravité** → **bande passante FFT** en fenêtre glissante → 14 caractéristiques par seconde avec **contexte ±5 s** → le **RandomForest** dit on-foil/non → **segmentation** en runs (hystérésis, fusion, dropout) → début calé sur l’**impulsion de décollage**, fin corrigée contre le **polygone d’eau** & la dérive → comptage de pumps **guidé par la cadence** → phases de glisse en tant que trous → indicateurs.",
    p2: "Et tout cela à partir d’**une seule montre au poignet** — la montre du mât de la Partie 1 n’était que la référence qui montre que c’est juste.",
  },
  limits: {
    h: "Limites (toujours honnêtes)",
    p: "La montre est au poignet, pas sur la board — les bras s’agitent pour équilibrer et se superposent au signal de pump (« wrist-confound »). La verticale est estimée à partir de la direction de la gravité (pas de gyroscope) et se trouve légèrement faussée en cas d’accélération soutenue. Le compteur guidé par la cadence est calibré contre la vérité de l’appli et de la vidéo, mais la calibration finale **physique** (caméra sur la board, Insta360 X5) reste à faire. Et les gates GPS-only sont un compromis : mieux vaut dire honnêtement « gps_only, pumps n/a » que des chiffres inventés.",
  },
};

const it: N2 = {
  back: "← Analisi da nerd (Parte 1: l'esperimento)",
  h1: "Analisi da nerd · Parte 2",
  subtitle:
    "Come da numeri grezzi dei sensori nascono pump, run on-foil, start/fine e fasi di planata — l'elaborazione del segnale, la finestra scorrevole, il modello ML e il labeling, tutto bello in ordine.",
  intro:
    "Nella [Parte 1](/nerd-analysen) si parlava della **verità**: una seconda montre sul mast del foil, che rivela cosa fa davvero il foil. Qui si parla del **macchinario**: cosa calcola il server per trasformare un segnale sussultante al polso in una valutazione pulita della sessione. Tutto ciò che segue avviene **lato server** — l'orologio è solo un sottile recorder.",
  raw: {
    h: "Cosa arriva: i dati grezzi",
    p: "Ogni sessione è composta da due flussi, entrambi con base temporale comune (ms dall'inizio della registrazione):",
    li: [
      "**GPS**, circa **1 Hz**: per ogni campione `[t_ms, lat, lon, speed_mps, hr_bpm, h_acc_m]`. Velocità e battito possono mancare (in tal caso derivati dalla posizione o vuoti).",
      "**Accelerazione**, a seconda dell'orologio **10–100 Hz**: un array `int16` di forma `(N × 3)` — X/Y/Z in conteggi grezzi. Un `accel_scale` (conteggi per g) li trasforma in g fisici.",
    ],
    p2: "Perché `int16` invece di virgola mobile? Larghezza di banda. 100 Hz × 3 assi × 8 h fanno milioni di valori — come interi a 2 byte questo dimezza la dimensione dell'upload. La riscalatura verso i g avviene solo sul server.",
  },
  pipe: {
    h: "La pipeline a colpo d'occhio",
    p: "Due tracce di preparazione (GPS + Accel) confluiscono in un modello ML che decide **al secondo** «sul foil — sì/no». Da qui nascono run contigue, il cui start/fine viene messo a punto, e infine pump e fasi di planata per ogni run:",
    cap: "La valutazione completa: dai due flussi di dati grezzi, passando per la maschera di foiling, fino a run, pump e fasi di planata.",
    gps: ["GPS  ~1 Hz", "t, lat, lon, speed, hr, h_acc"],
    accel: ["Accelerazione  10–100 Hz", "int16 (N×3) · accel_scale"],
    gpsPrep: ["Preparare il GPS", "filtro spike/Doppler · lisciare · velocità"],
    accelPrep: ["Preparare l'Accel", "modulo → verticale · bandpass FFT"],
    model: ["Modello ML del foil — RandomForest, ±5 s di contesto", "Fallback senza Accel: macchina a stati GPS (isteresi + dwell)"],
    mask: ["Maschera di foiling", "foil / non-foil — al secondo"],
    seg: ["Segmentazione → run", "chiudere lacune · unire · agganciare start/fine"],
    pumps: ["Contare i pump", "guidato dalla cadenza, per ogni run"],
    glide: ["Fasi di planata", "lacune tra i pump"],
  },
  mag: {
    h: "Passo 1 — il modulo invece degli assi",
    p: "L'orologio sta al polso e ruota di continuo — i tre assi X/Y/Z puntano costantemente altrove. Un singolo valore d'asse è perciò inutile. La salvezza è il **modulo** del vettore:",
    formula: "|a| = √(x² + y² + z²) / accel_scale",
    p2: "Il modulo è **invariante all'orientamento**: comunque sia ruotato l'orologio, un colpo da 2 g resta un colpo da 2 g. Solo così il segnale diventa confrontabile (`magnitude_g`).",
    cap: "Tre assi singolarmente privi di significato (l'orologio si inclina di continuo) insieme danno un modulo |a| stabile e invariante all'orientamento.",
    label: "|a| = √(x²+y²+z²)",
  },
  vert: {
    h: "Passo 2 — dal polso alla verticale",
    p: "Il modulo ha un difetto: un pump è una **spinta verso l'alto**, ma `|a|` conta la discesa esattamente come la salita — ogni pump appare doppio. Meglio sarebbe la vera **accelerazione verticale contro la gravità**. E quella si può ricostruire, del tutto senza giroscopio:",
    ol: [
      "La **direzione della gravità** cambia solo lentamente → stimarla con un **passa-basso** (< 0,25 Hz) per ogni asse. Ne risulta il vettore `g`, che punta sempre «verso il basso».",
      "L'accelerazione **dinamica** è `a − g`.",
      "**Proiettarla** sul versore della gravità → segnale scalare: > 0 = verso l'alto (spinta).",
    ],
    f1: "v(t) = (a − g) · ĝ",
    fMid: "con",
    f2: "ĝ = g / |g|",
    cap: "La gravità g che deriva lentamente (passa-basso) separa l'orientamento dalla dinamica. L'accelerazione dinamica a−g, proiettata su ĝ, dà una spinta verso l'alto pulita per ogni pump.",
    gLabel: "g (gravità)",
    aLabel: "a (misurata)",
    amg: "a − g",
    topNote: "|modulo|: ogni pump doppio",
    botNote: "v(t) contro la gravità: una spinta per pump",
  },
  win: {
    h: "Passo 3 — finestra scorrevole & bandpass FFT",
    p: "Pompare è **ritmico** — e il ritmo vive nello spazio delle frequenze. Perciò una **finestra scorrevole** (tipicamente larga 4 s, un passo ogni 2 s) scorre sul segnale, e per ogni finestra una **FFT** calcola lo spettro. Due bande sono importanti:",
    li: [
      "**Banda di filtro 0,3–3 Hz** — tutto ciò che sta sotto è gravità/deriva, tutto ciò che sta sopra è rumore di splash. Entrambi vengono azzerati con un bandpass FFT (`bandpass_fft`).",
      "**Banda di pump 0,5–2 Hz** — qui vive la cadenza di pompata (30–120 pump/min).",
    ],
    p2: "Per ogni finestra si ricavano quattro caratteristiche:",
    li2: [
      "**dom_freq** — frequenza dominante nella banda di pump (la pump rate)",
      "**band_power_ratio** — quota dell'energia nella banda di pump rispetto alla banda totale (alta = ritmo chiaro)",
      "**rms** — intensità del segnale (ampiezza del movimento)",
      "**spectral_entropy** — quanto è «ordinato» lo spettro (bassa = una frequenza chiara = pompare; alta = caos = rumore/planata)",
    ],
    cap: "Una finestra di 4 s scorre sul segnale filtrato (passo 2 s → sovrapposizione). Per ogni finestra la FFT fornisce uno spettro; l'energia nella banda di pump 0,5–2 Hz rivela rate e ritmo.",
    winT: "Finestra t",
    winT1: "Finestra t+1",
    sig: "v(t) — filtrato in bandpass (0,3–3 Hz)",
    fft: "FFT",
    spec: "Spettro",
    band: "0,5–2 Hz",
    freq: "Frequenza →",
  },
  rate: {
    h: "Un dettaglio da nerd: la vera frequenza di campionamento",
    p: "Alcuni orologi **mentono** sulla loro rate. Un Forerunner 55 dichiara «10 Hz», ma in realtà fornisce solo ~2,5 Hz. Le feature di frequenza e la cadenza di pump sarebbero così spazzatura. Perciò il server determina la rate **in modo generico dai dati stessi**: `vera_Hz = numero_campioni_Accel / durata_GPS`. Se questo si discosta di oltre il 25 % dall'etichetta, vale la rate misurata. E se sta **sotto i 15 Hz**, il segnale è troppo grezzo per l'analisi in frequenza → la sessione viene valutata come **GPS-only** (pump n/d, ma con limiti onesti invece di valori di fantasia).",
  },
  ml: {
    h: "Dove sono sul foil? — il modello ML",
    p: "Se in un dato secondo si è **sul foil** lo decide un **RandomForest** — una foresta di alberi decisionali che votano a maggioranza. Piccolo e interpretabile, nessun deep learning necessario. Per ogni secondo riceve **14 caratteristiche**:",
    li: [
      "**7 da velocità & Accel**: velocità adesso / 3 s / 5 s (mediana), variabilità della velocità, oltre a RMS in tre bande (totale, banda di pump, alta frequenza).",
      "**7 dalla traiettoria GPS**: variazione di velocità su 1/3/5 s, lunghezza del percorso, spostamento netto, **rettilineità** (netto/percorso) e cambio di rotta. Queste feature di direzione sono state nell'esperimento la leva più grande — mantengono le tranquille fasi di planata dentro la run, invece di spezzettarla.",
    ],
    p2: "Il colpo di genio è il **contesto**: ogni secondo non viene classificato isolatamente, ma insieme ai **±5 secondi vicini** (il «windowize»). Il vettore di feature di un secondo è quindi lungo 14 × 11 = 154 numeri. Così il modello vede l'andamento — un breve calo di velocità nel bel mezzo della crociera non viene subito considerato «fuori». Questo ha portato la frammentazione da 1,10× a 1,00× e l'F1-score da **0,93 a 0,97**.",
    cap: "Per ogni secondo un vettore di 14 caratteristiche; per la classificazione si accodano i ±5 secondi vicini (label centrale). Il RandomForest vota → foil / non-foil.",
    featNote: "Finestra al secondo: 14 caratteristiche per secondo, ±5 s di contesto",
    forest: "RandomForest (maggioranza)",
    maskNote: "Maschera al secondo: foil ▮ / non-foil ▯",
  },
  seg: {
    h: "Dalla maschera alle run",
    p: "La maschera al secondo è ancora bucherellata. Viene modellata in **run** pulite:",
    li: [
      "**Chiudere lacune brevi** (fino a ~2 s): una pausa di planata non divide una run.",
      "**Soglia fisica**: sotto i ~9 km/h nessun foil sostiene, e senza un vero movimento di posizione (non solo il campo velocità) non si è sul foil — entrambi tagliano via i bordi morbidi.",
      "**Lunghezza minima & velocità media**: segmenti sotto i 5 s o con media troppo bassa vengono scartati (camminare veloce ≠ foiling).",
      "**Il dropout GPS separa**: una lacuna tra campioni > 15 s (orologio sott'acqua/caduta) termina la run — il tempo della lacuna non conta come tempo di percorrenza.",
      "**Merge «nessuno stop»**: se tra due run riconosciute la velocità non è **mai** scesa sotto i ~5,4 km/h e non c'è stato dropout, in verità era **una sola** run (interruzione del modello) → unire, indipendentemente dalla durata.",
    ],
    p2: "Senza un'accelerazione utilizzabile (GPS-only) subentra una **macchina a stati** con **isteresi** e **dwell**: si diventa «in foiling» solo dopo diversi secondi nella banda di velocità *con velocità liscia* (planare è liscio, pagaiare è choppy) — e si lascia lo stato solo dopo diversi secondi al di sotto. Due soglie (dentro/fuori) impediscono il flickering al confine.",
    cap: "Sopra: la maschera al secondo bucherellata viene trasformata in run (chiudere lacune, unire, scartare i segmenti brevi). Sotto: l'isteresi della macchina a stati GPS — dentro solo sopra soglia, fuori solo sotto, con tempo di mantenimento (dwell).",
    maskLabel: "Maschera (al secondo)",
    runs: "Run",
    run1: "Run 1 (lacune chiuse)",
    run2: "Run 2",
    tooShort: "· troppo corta → scartata",
    hyst: "Isteresi + dwell (fallback GPS)",
    enter: "ENTER ~10 km/h",
    exit: "EXIT ~9 km/h",
  },
  se: {
    h: "Start & fine — con precisione sub-secondo",
    p: "Il modello lavora su griglia al secondo, ma il **decollo** è un evento netto. Perciò lo start della run viene agganciato all'**impulso di salto**: un picco di modulo molto forte (> 3,5× il 95° percentile — nell'esperimento un salto stava a ~4,3×, un pump solo a ~2,3×, quindi chiaramente separabili). Il primo impulso di questo tipo nella finestra di ±pochi secondi segna il vero stacco — interpolato con precisione sub-secondo tra due punti GPS. Se manca l'impulso, il server arretra lo start lungo la rampa di accelerazione fino all'ultimo quasi-stop.",
    p2: "Alla **fine** si annidano due trappole: la **deriva del dead reckoning** (l'orologio si immerge, estrapola il GPS e «deriva» verso terra) viene scartata — prior: una run non finisce mai più verso terra del suo start. E dove è noto un **poligono d'acqua OSM**, start e fine devono trovarsi **nell'acqua** (punto-nel-poligono via ray-casting), altrimenti si taglia indietro fino all'ultimo vero campione in acqua. Infine la fine viene ancora classificata come **caduta** (calo brusco di velocità da «sul foil» a «in acqua», o dropout GPS) o **stop controllato**.",
    cap: "Lo start al secondo riconosciuto (grigio) viene agganciato al netto impulso di decollo nel modulo dell'accelerazione (cyan) — il vero start del foil.",
    thr: "3,5 × p95 (soglia di salto)",
    secStart: "Start al secondo",
    snapped: "← agganciato al decollo",
    afterPump: "dopo: ritmo di pump",
  },
  pump: {
    h: "Contare i pump — guidato dalla cadenza (v3)",
    p: "La via più ovvia — «conta tutti i picchi sopra una soglia di ampiezza» — **sottostima strutturalmente di ~2×**: raccoglie solo le oscillazioni più grandi e ingoia i pump più piccoli e ritmici in mezzo. Contro la **verità** (la mia verità di pump toccata, vedi sotto) questo azzeccava solo ~40 %.",
    p2: "L'approccio migliore è **guidato dalla cadenza**: nei tratti ritmici e ricchi di energia una FFT locale stima la **frequenza di pump istantanea**, e poi **per ogni periodo di cadenza** viene scelto **esattamente un** vero massimo locale come pump. La cadenza è localmente adattiva, quindi segue i cambi di ritmo. Risultato: **85–94 %** di successi invece di 40 % — e contatore e marker sulla mappa sono automaticamente coerenti (entrambi dalle stesse posizioni). Un gate RMS impedisce che vengano conteggiate le fasi di planata prive di ritmo.",
    cap: "La soglia di ampiezza (sopra) vede solo i picchi grossi. Guidato dalla cadenza (sotto): stimare il periodo locale T, per ogni periodo raccogliere il vero massimo — anche i pump dolci.",
    top: "Soglia di ampiezza — ingoia i pump piccoli",
    bot: "Guidato dalla cadenza — un picco per periodo T",
  },
  glide: {
    h: "Fasi di planata — il silenzio tra i pump",
    p: "Proprio quello che la Parte 1 indicava come il potenziale più grande ora arriva quasi in regalo: se i momenti dei pump sono noti, le **fasi di planata sono semplicemente le lacune in mezzo** — più la rincorsa dallo start della run al primo pump (*lead*) e lo scivolamento dall'ultimo pump fino alla fine (*tail*). Da qui si ricavano per ogni run **numero**, **durata media di planata** e **fase di planata più lunga** — l'indicatore di quanto efficacemente un foil mantiene lo slancio.",
    cap: "I pump (marker) dividono la run; le lacune in mezzo sono le fasi di planata. lead = start→1° pump, tail = ultimo pump→fine. Un tail lungo = scivolamento pulito.",
    start: "Start",
    end: "Fine",
    pumps: "Pump",
    lead: "lead",
    tail: "tail (planata)",
    gaps: "Lacune = fasi di planata",
  },
  gpsonly: {
    h: "Senza Accel: GPS-only e le sue insidie",
    p: "Le sessioni importate (ad es. da Polar) o gli orologi con rate troppo grezza **non hanno un'accelerazione utilizzabile**. Allora sostiene solo il GPS — e quello ha i suoi difetti:",
    li: [
      "**Spike singoli** (glitch Doppler, «teletrasporto»): sostituiti rispetto alla mediana locale ovvero i salti avanti-e-indietro vengono lisciati.",
      "**Burst Doppler di più secondi** (~3 s a 50 km/h, ma sotto la soglia di glitch di 90 km/h): sostituiti rispetto a una robusta **mediana a 15 s** — quella è insensibile ai burst brevi, mentre una vera run mantenuta la solleva insieme a sé e resta intatta. Due condizioni (relativa sopra la mediana **e** assoluta sopra ~28 km/h) proteggono le run vere.",
      "**Gate pumpfoil a 30 km/h**: senza Accel non si può separare con certezza il pumpfoil dal foiling motorizzato (kite/vento/wake). Se la top speed lisciata supera i 30 km/h, la sessione vale come motorizzata → **niente** pumpfoil. Con l'Accel questo gate decade — lì la valutazione si fida del segnale di pump/on-foil.",
    ],
  },
  label: {
    h: "Da dove viene la verità — toccare i pump",
    p: "Il modello ha bisogno di una **verità di riferimento** per calibrare il contatore di pump guidato dalla cadenza — e per ora la tocco io stesso. Guardo il **video** di una corsa e **tocco un pulsante a ogni pump reale**. Lo faccio in **più take**; vengono combinati in un **consenso** tramite correlazione incrociata (i piccoli sfasamenti del tempo di reazione si mediano). Risultato: il vero numero di pump e il vero timing per ogni corsa. È volutamente una **soluzione transitoria** — abbastanza precisa per calibrare oggi, ma toccata a mano.",
    p2: "Importante nel calibrare contro tali label: **GroupKFold** invece della normale cross-validation. Secondi vicini della stessa corsa sono quasi identici — se finissero contemporaneamente nel set di training e di test, il modello interrogherebbe se stesso (leakage) e riporterebbe valori da sogno. GroupKFold tiene perciò **intere sessioni** insieme: si testa sempre su corse che il modello non ha mai visto.",
    cap: "Il ciclo: verità di pump **toccata** → feature → RandomForest → foil_rf.pkl → valutazione di ogni sessione. I nuovi tap rifluiscono indietro, il modello viene ricalibrato.",
    fits: ["toccare i pump", "video · più take"],
    feats: ["Feature", "14 × ±5 s di contesto"],
    rf: ["RandomForest", "CV GroupKFold"],
    pkl: ["foil_rf.pkl", "→ ogni sessione"],
    loopNote: "nuove corse toccate → ricalibrare",
  },
  x5: {
    h: "Il prossimo passo — la vera verità dalla camera (Insta360 X5)",
    p: "Toccare basta per il bootstrap, ma dipende dal mio tempo di reazione. La verità **fisicamente esatta** arriverà poi da una **camera sul board**: una Insta360 X5 filma il mast/foil, e dal video si legge **con precisione al frame** quando il foil riceve davvero pressione e quando vola. Così calibriamo il timing dei pump e il riconoscimento on-foil contro la vera fisica invece che contro un'approssimazione toccata. Non appena il rig è pronto, qui arriverà una sezione dedicata con tutto il setup della camera.",
  },
  summary: {
    h: "Tutto il percorso in una frase",
    p1: "Accelerazione grezza int16 → **modulo** → **verticale contro la gravità** → **bandpass FFT** nella finestra scorrevole → 14 caratteristiche per secondo con **±5 s di contesto** → **RandomForest** dice on-foil/no → **segmentazione** in run (isteresi, merge, dropout) → start agganciato all'**impulso di decollo**, fine corretta contro **poligono d'acqua** & deriva → conteggio dei pump **guidato dalla cadenza** → fasi di planata come lacune → indicatori.",
    p2: "E tutto questo da **un solo orologio al polso** — l'orologio sul mast della Parte 1 era solo il riferimento che dimostra che è tutto vero.",
  },
  limits: {
    h: "Limiti (onesti come sempre)",
    p: "L'orologio sta al polso, non sul board — le braccia si agitano per bilanciare e si sovrappongono al segnale di pump («wrist-confound»). La verticale viene stimata dalla direzione della gravità (nessun giroscopio) ed è leggermente falsata in caso di accelerazione prolungata. Il contatore guidato dalla cadenza è calibrato contro la verità di app e video, ma la calibrazione finale **fisica** (camera sul board, Insta360 X5) è ancora in sospeso. E i gate GPS-only sono un compromesso: meglio un onesto «gps_only, pump n/d» che numeri inventati.",
  },
};

const es: N2 = {
  back: "← Análisis para nerds (Parte 1: el experimento)",
  h1: "Análisis para nerds · Parte 2",
  subtitle:
    "Cómo unos números crudos del sensor se convierten en pumps, runs on-foil, inicio/fin y fases de planeo — el procesamiento de señal, la ventana deslizante, el modelo de ML y el etiquetado, bien ordenados por pasos.",
  intro:
    "En [la Parte 1](/nerd-analysen) hablamos de la **verdad**: un segundo reloj en el mástil del foil, que revela lo que el foil hace realmente. Aquí hablamos de la **maquinaria**: lo que calcula el servidor para que, a partir de una señal temblorosa en la muñeca, salga una evaluación limpia de la sesión. Todo lo que sigue ocurre **en el servidor** — el reloj es solo un recorder delgado.",
  raw: {
    h: "Lo que llega: los datos crudos",
    p: "Cada sesión consta de dos flujos, ambos con una base temporal común (ms desde el inicio de la grabación):",
    li: [
      "**GPS**, aprox. **1 Hz**: por muestra `[t_ms, lat, lon, speed_mps, hr_bpm, h_acc_m]`. La velocidad y el pulso pueden faltar (entonces se derivan de la posición o quedan vacíos).",
      "**Aceleración**, según el reloj **10–100 Hz**: un array `int16` de forma `(N × 3)` — X/Y/Z en cuentas crudas. Un `accel_scale` (cuentas por g) las convierte en g físicos.",
    ],
    p2: "¿Por qué `int16` en vez de coma flotante? Ancho de banda. 100 Hz × 3 ejes × 8 h son millones de valores — como enteros de 2 bytes eso reduce a la mitad el tamaño de subida. El escalado de vuelta a g ocurre recién en el servidor.",
  },
  pipe: {
    h: "La pipeline de un vistazo",
    p: "Dos vías de preparación (GPS + Accel) desembocan en un modelo de ML que decide **por segundo** «sobre el foil — ¿sí/no?». De ahí salen runs contiguos, cuyo inicio/fin se ajusta con precisión, y finalmente pumps y fases de planeo por run:",
    cap: "La evaluación completa: desde los dos flujos de datos crudos, pasando por la máscara de foiling, hasta runs, pumps y fases de planeo.",
    gps: ["GPS  ~1 Hz", "t, lat, lon, speed, hr, h_acc"],
    accel: ["Aceleración  10–100 Hz", "int16 (N×3) · accel_scale"],
    gpsPrep: ["Preparar GPS", "Filtro de spikes/Doppler · suavizar · velocidad"],
    accelPrep: ["Preparar Accel", "Módulo → vertical · bandpass FFT"],
    model: ["Modelo de foil ML — RandomForest, ±5 s de contexto", "Fallback sin Accel: máquina de estados GPS (histéresis + dwell)"],
    mask: ["Máscara de foiling", "foil / no-foil — por segundo"],
    seg: ["Segmentación → runs", "cerrar huecos · fusionar · ajustar inicio/fin"],
    pumps: ["Contar pumps", "guiado por la cadencia, por run"],
    glide: ["Fases de planeo", "huecos entre pumps"],
  },
  mag: {
    h: "Paso 1 — el módulo en vez de los ejes",
    p: "El reloj va en la muñeca y gira constantemente — los tres ejes X/Y/Z apuntan siempre a otra parte. Por eso un valor de eje aislado no vale nada. La salvación es el **módulo** del vector:",
    formula: "|a| = √(x² + y² + z²) / accel_scale",
    p2: "El módulo es **invariante a la orientación**: da igual cómo esté girado el reloj, un golpe de 2 g sigue siendo un golpe de 2 g. Solo así la señal se vuelve comparable (`magnitude_g`).",
    cap: "Tres ejes que por separado no dicen nada (el reloj se inclina sin parar) forman juntos un módulo |a| estable e invariante a la orientación.",
    label: "|a| = √(x²+y²+z²)",
  },
  vert: {
    h: "Paso 2 — de la muñeca a la vertical",
    p: "El módulo tiene una pega: un pump es un **empuje hacia arriba**, pero `|a|` cuenta el trazo hacia abajo igual que el trazo hacia arriba — cada pump aparece por partida doble. Mejor sería la verdadera **aceleración vertical contra la gravedad**. Y esa se puede reconstruir, sin ningún giroscopio:",
    ol: [
      "La **dirección de la gravedad** cambia solo lentamente → estimarla por **paso bajo** (< 0,25 Hz) en cada eje. Eso da el vector `g`, que siempre apunta «hacia abajo».",
      "La aceleración **dinámica** es `a − g`.",
      "**Proyectar** esta sobre el vector unitario de gravedad → señal escalar: > 0 = hacia arriba (empuje).",
    ],
    f1: "v(t) = (a − g) · ĝ",
    fMid: "con",
    f2: "ĝ = g / |g|",
    cap: "La gravedad g de lenta deriva (paso bajo) separa la orientación de la dinámica. La aceleración dinámica a−g, proyectada sobre ĝ, da un empuje hacia arriba limpio por cada pump.",
    gLabel: "g (gravedad)",
    aLabel: "a (medida)",
    amg: "a − g",
    topNote: "|Módulo|: cada pump por partida doble",
    botNote: "v(t) contra la gravedad: un empuje por pump",
  },
  win: {
    h: "Paso 3 — ventana deslizante y bandpass FFT",
    p: "Bombear es **rítmico** — y el ritmo vive en el espacio de frecuencias. Por eso una **ventana deslizante** (típ. 4 s de ancho, un paso cada 2 s) recorre la señal, y para cada ventana una **FFT** calcula el espectro. Dos bandas son importantes:",
    li: [
      "**Banda de filtro 0,3–3 Hz** — todo lo de abajo es gravedad/deriva, todo lo de arriba es ruido de salpicaduras. Ambos se anulan con un bandpass FFT (`bandpass_fft`).",
      "**Banda de pump 0,5–2 Hz** — aquí vive la cadencia del pump (30–120 pumps/min).",
    ],
    p2: "Por ventana caen cuatro características:",
    li2: [
      "**dom_freq** — frecuencia dominante en la banda de pump (el pump-rate)",
      "**band_power_ratio** — proporción de la energía en la banda de pump respecto a la banda total (alto = ritmo claro)",
      "**rms** — intensidad de la señal (amplitud del movimiento)",
      "**spectral_entropy** — cuán «ordenado» está el espectro (bajo = una frecuencia clara = bombeo; alto = caos = ruido/planeo)",
    ],
    cap: "Una ventana de 4 s recorre la señal filtrada (paso de 2 s → solapamiento). Para cada ventana la FFT entrega un espectro; la energía en la banda de pump 0,5–2 Hz revela rate y ritmo.",
    winT: "Ventana t",
    winT1: "Ventana t+1",
    sig: "v(t) — filtrado por bandpass (0,3–3 Hz)",
    fft: "FFT",
    spec: "Espectro",
    band: "0,5–2 Hz",
    freq: "Frecuencia →",
  },
  rate: {
    h: "Un detalle para nerds: la tasa de muestreo real",
    p: "Algunos relojes **mienten** sobre su tasa. Un Forerunner 55 etiqueta «10 Hz», pero en realidad entrega solo ~2,5 Hz. Con eso las features de frecuencia y la cadencia del pump serían basura. Por eso el servidor determina la tasa **de forma genérica a partir de los propios datos**: `Hz_reales = número_de_muestras_accel / duración_GPS`. Si eso se desvía > 25 % de la etiqueta, vale la tasa medida. Y si está **por debajo de 15 Hz**, la señal es demasiado gruesa para el análisis de frecuencia → la sesión se evalúa como **GPS-only** (pumps n/a, a cambio límites honestos en vez de valores de fantasía).",
  },
  ml: {
    h: "¿Dónde estoy sobre el foil? — el modelo de ML",
    p: "Si en un segundo dado uno está **sobre el foil** lo decide un **RandomForest** — un bosque de árboles de decisión que votan por mayoría. Pequeño e interpretable, sin necesidad de deep learning. Por segundo recibe **14 características**:",
    li: [
      "**7 de velocidad y Accel**: velocidad ahora / 3 s / 5 s (mediana), variabilidad de la velocidad, y RMS en tres bandas (total, banda de pump, alta frecuencia).",
      "**7 de la trayectoria GPS**: cambio de velocidad en 1/3/5 s, longitud del recorrido, desplazamiento neto, **rectitud** (neto/recorrido) y cambio de rumbo. Estas features de dirección fueron en el experimento la mayor palanca — mantienen las fases de planeo tranquilas dentro del run, en vez de trocearlo.",
    ],
    p2: "La clave es el **contexto**: cada segundo no se clasifica de forma aislada, sino junto con los **±5 segundos vecinos** (el «windowize»). El vector de características de un segundo tiene por tanto una longitud de 14 × 11 = 154 números. Así el modelo ve la evolución — una breve caída de velocidad en medio del cruise no se interpreta de inmediato como «fuera». Eso llevó la fragmentación de 1,10× a 1,00× y el F1-score de **0,93 a 0,97**.",
    cap: "Por segundo un vector de 14 características; para la clasificación se anexan los ±5 segundos vecinos (etiqueta del centro). El RandomForest vota → foil / no-foil.",
    featNote: "Ventana de segundos: 14 características por segundo, ±5 s de contexto",
    forest: "RandomForest (mayoría)",
    maskNote: "Máscara por segundo: foil ▮ / no-foil ▯",
  },
  seg: {
    h: "De la máscara a los runs",
    p: "La máscara por segundos aún está agujereada. Se moldea en **runs** limpios:",
    li: [
      "**Cerrar huecos cortos** (hasta ~2 s): una pausa de planeo no parte un run.",
      "**Suelo físico**: por debajo de ~9 km/h ningún foil sostiene, y sin movimiento real de posición (no solo el campo de velocidad) no se está sobre el foil — ambos recortan los bordes blandos.",
      "**Longitud mínima y velocidad media**: los segmentos por debajo de 5 s o con una media demasiado baja quedan fuera (caminar rápido ≠ foilear).",
      "**Un dropout de GPS separa**: un hueco de muestras > 15 s (reloj bajo el agua/caída) termina el run — el tiempo del hueco no cuenta como tiempo de marcha.",
      "**Fusión «sin parada»**: si la velocidad entre dos runs detectados **nunca** cayó por debajo de ~5,4 km/h y no hubo dropout, en verdad era **un** run (fallo del modelo) → fusionar, sin importar cuán largo.",
    ],
    p2: "Sin una aceleración utilizable (GPS-only) toma el relevo una **máquina de estados** con **histéresis** y **dwell**: uno pasa a «foilando» solo tras varios segundos en la banda de velocidad *con velocidad suave* (el planeo es suave, remar es choppy) — y abandona el estado solo tras varios segundos por debajo. Dos umbrales (entrada/salida) evitan el parpadeo en el límite.",
    cap: "Arriba: la máscara agujereada por segundos se convierte en runs (cerrar huecos, fusionar, descartar segmentos cortos). Abajo: la histéresis de la máquina de estados GPS — entrada solo por encima, salida solo por debajo, con tiempo de retención (dwell).",
    maskLabel: "Máscara (por segundo)",
    runs: "Runs",
    run1: "Run 1 (huecos cerrados)",
    run2: "Run 2",
    tooShort: "· demasiado corto → descartado",
    hyst: "Histéresis + dwell (fallback GPS)",
    enter: "ENTER ~10 km/h",
    exit: "EXIT ~9 km/h",
  },
  se: {
    h: "Inicio y fin — con precisión de subsegundo",
    p: "El modelo trabaja en la rejilla de segundos, pero el **despegue** es un evento nítido. Por eso el inicio del run se ajusta al **impulso de salto**: un pico de magnitud muy fuerte (> 3,5× el percentil 95 — en el experimento un salto estaba en ~4,3×, un pump solo en ~2,3×, o sea claramente separables). El impulso más temprano de este tipo en la ventana de ±unos pocos segundos marca el despegue real — interpolado con precisión de subsegundo entre dos puntos GPS. Si falta el impulso, el servidor retrocede el inicio a lo largo de la rampa de aceleración hasta la última cuasi-parada.",
    p2: "En el **fin** acechan dos trampas: la **deriva de dead-reckoning** (el reloj se sumerge, extrapola el GPS y «deriva» hacia tierra) se descarta — prior: un run nunca termina más hacia tierra que su inicio. Y donde se conoce un **polígono de agua OSM**, el inicio y el fin deben estar **en el agua** (punto en polígono por ray-casting), si no se recorta hasta la última muestra real de agua. Por último, el fin se clasifica aún como **caída** (caída abrupta de velocidad de «sobre el foil» a «en el agua», o dropout de GPS) o **parada controlada**.",
    cap: "El inicio detectado por segundos (gris) se ajusta al nítido impulso de despegue en el módulo de aceleración (cian) — el verdadero inicio de foil.",
    thr: "3,5 × p95 (umbral de salto)",
    secStart: "Inicio por segundos",
    snapped: "← ajustado al despegue",
    afterPump: "después: ritmo de pump",
  },
  pump: {
    h: "Contar pumps — guiado por la cadencia (v3)",
    p: "El camino obvio — «contar todos los picos por encima de un umbral de amplitud» — **subestima estructuralmente en ~2×**: solo espiga las mayores oscilaciones y se traga los pumps más pequeños y rítmicos de en medio. Contra la **verdad** (mi verdad de pump tocada, véase abajo) eso acertaba solo ~40 %.",
    p2: "El mejor enfoque es **guiado por la cadencia**: en tramos rítmicos y ricos en energía una FFT local estima la **frecuencia de pump instantánea**, y luego se elige como pump **exactamente un** máximo local real **por periodo de cadencia**. La cadencia es local-adaptativa, así que sigue los cambios de tempo. Resultado: **85–94 %** de acierto en vez de 40 % — y el contador y los marcadores del mapa son automáticamente consistentes (ambos salen de las mismas posiciones). Un gate de RMS evita que se cuenten fases de planeo sin ritmo.",
    cap: "El umbral de amplitud (arriba) solo ve los picos gruesos. Guiado por la cadencia (abajo): estimar el periodo local T, espigar el máximo real por periodo — también los pumps suaves.",
    top: "Umbral de amplitud — se traga los pumps pequeños",
    bot: "Guiado por la cadencia — un pico por periodo T",
  },
  glide: {
    h: "Fases de planeo — el silencio entre los pumps",
    p: "Justo lo que la Parte 1 señalaba como el mayor potencial, ahora cae casi de regalo: si se conocen los instantes de pump, las **fases de planeo son simplemente los huecos entre ellos** — más el impulso inicial desde el inicio del run hasta el primer pump (*lead*) y el frenado desde el último pump hasta el fin (*tail*). De ahí caen por run el **número**, la **duración media de planeo** y la **fase de planeo más larga** — el indicador de cuán eficientemente un foil mantiene el impulso.",
    cap: "Los pumps (marcadores) dividen el run; los huecos entre ellos son las fases de planeo. lead = inicio→1.er pump, tail = último pump→fin. Un tail largo = frenado limpio.",
    start: "Inicio",
    end: "Fin",
    pumps: "Pumps",
    lead: "lead",
    tail: "tail (planeo)",
    gaps: "Huecos = fases de planeo",
  },
  gpsonly: {
    h: "Sin Accel: GPS-only y sus trampas",
    p: "Las sesiones importadas (p. ej. de Polar) o los relojes con una tasa demasiado gruesa no tienen **aceleración utilizable**. Entonces sostiene el GPS solo — y ese tiene sus manías:",
    li: [
      "**Spikes aislados** (glitch de Doppler, «teletransporte»): se reemplazan contra la mediana local o se suavizan los saltos de ida y vuelta.",
      "**Bursts de Doppler de varios segundos** (~3 s a 50 km/h, pero por debajo del umbral de glitch de 90 km/h): se reemplazan contra una robusta **mediana de 15 s** — esta es insensible a los bursts cortos, mientras que un run real y sostenido la eleva también con él y queda intacto. Dos condiciones (relativa sobre la mediana **y** absoluta sobre ~28 km/h) protegen los runs reales.",
      "**Gate de pumpfoil de 30 km/h**: sin Accel no se puede separar con seguridad el pumpfoil del foil propulsado (kite/viento/wake). Si el top-speed suavizado supera los 30 km/h, la sesión cuenta como propulsada → **no** es pumpfoil. Con Accel este gate desaparece — ahí la evaluación confía en la señal de pump/on-foil.",
    ],
  },
  label: {
    h: "De dónde viene la verdad — tocar los pumps",
    p: "El modelo necesita una **verdad de referencia** para calibrar el contador de pumps guiado por la cadencia — y por ahora la toco yo mismo. Miro el **vídeo** de una carrera y **toco un botón en cada pump real**. Lo hago en **varias tomas**; se combinan en un **consenso** por correlación cruzada (los pequeños desfases de tiempo de reacción se promedian). Resultado: el número real de pumps y el timing real por carrera. Es a propósito una **solución transitoria** — lo bastante precisa para calibrar hoy, pero tecleada a mano.",
    p2: "Importante al calibrar contra tales labels: **GroupKFold** en vez de validación cruzada normal. Los segundos vecinos de una misma carrera son casi idénticos — si cayeran a la vez en el conjunto de entrenamiento y de test, el modelo se estaría preguntando a sí mismo (leakage) y reportaría valores de ensueño. Por eso GroupKFold mantiene juntas **sesiones enteras**: siempre se prueba con carreras que el modelo nunca ha visto.",
    cap: "El ciclo: verdad de pump **tocada** → features → RandomForest → foil_rf.pkl → evaluación de cada sesión. Los nuevos taps refluyen, el modelo se recalibra.",
    fits: ["tocar los pumps", "vídeo · varias tomas"],
    feats: ["Features", "14 × ±5 s de contexto"],
    rf: ["RandomForest", "CV con GroupKFold"],
    pkl: ["foil_rf.pkl", "→ cada sesión"],
    loopNote: "nuevas carreras tocadas → recalibrar",
  },
  x5: {
    h: "El siguiente paso — la verdad real por cámara (Insta360 X5)",
    p: "Tocar basta para arrancar, pero depende de mi tiempo de reacción. La verdad **físicamente exacta** vendrá después de una **cámara en el board**: una Insta360 X5 filma el mástil/foil, y del vídeo se lee **con precisión de frame** cuándo el foil recibe presión de verdad y cuándo vuela. Con eso calibramos el timing de los pumps y la detección on-foil contra física real en vez de una aproximación tecleada. En cuanto el rig esté montado, aquí llegará una sección propia con todo el montaje de la cámara.",
  },
  summary: {
    h: "Todo el camino en una frase",
    p1: "Aceleración int16 cruda → **módulo** → **vertical contra la gravedad** → **bandpass FFT** en la ventana deslizante → 14 características por segundo con **±5 s de contexto** → **RandomForest** dice on-foil/no → **segmentación** en runs (histéresis, fusión, dropout) → inicio ajustado al **impulso de despegue**, fin corregido contra el **polígono de agua** y la deriva → conteo de pumps **guiado por la cadencia** → fases de planeo como huecos → indicadores.",
    p2: "Y todo eso a partir de **un solo reloj de muñeca** — el reloj del mástil de la Parte 1 fue solo la referencia que demuestra que es correcto.",
  },
  limits: {
    h: "Límites (honestos como siempre)",
    p: "El reloj va en la muñeca, no en el board — los brazos se agitan para equilibrar y se superponen a la señal de pump («wrist-confound»). La vertical se estima a partir de la dirección de la gravedad (sin giroscopio) y con una aceleración sostenida queda ligeramente distorsionada. El contador guiado por la cadencia está calibrado contra la verdad de la app y del vídeo, pero la calibración final **física** (cámara en el board, Insta360 X5) aún está pendiente. Y los gates de GPS-only son un compromiso: mejor un honesto «gps_only, pumps n/a» que cifras inventadas.",
  },
};

const fi: N2 = {
  back: "← Nörttianalyysit (osa 1: koe)",
  h1: "Nörttianalyysit · osa 2",
  subtitle:
    "Miten raa'oista anturiluvuista syntyy pumppauksia, on-foil-vetoja, alku/loppu ja liitovaiheet — signaalinkäsittely, liukuva ikkuna, ML-malli ja labelointi, kaikki kauniisti järjestyksessä.",
  intro:
    "[Osassa 1](/nerd-analysen) oli kyse **totuudesta**: toinen kello foilin mastossa, joka paljastaa, mitä foil oikeasti tekee. Tässä on kyse **koneistosta**: mitä palvelin laskee, jotta ranteen sätkivästä signaalista tulee siisti session analyysi. Kaikki seuraava tapahtuu **palvelinpuolella** — kello on vain ohut nauhuri.",
  raw: {
    h: "Mitä saapuu: raakadata",
    p: "Jokainen session koostuu kahdesta virrasta, molemmilla yhteinen aikapohja (ms tallennuksen alusta):",
    li: [
      "**GPS**, noin **1 Hz**: per näyte `[t_ms, lat, lon, speed_mps, hr_bpm, h_acc_m]`. Nopeus ja syke voivat puuttua (silloin johdetaan sijainnista tai jätetään tyhjäksi).",
      "**Kiihtyvyys**, kellosta riippuen **10–100 Hz**: `int16`-taulukko muotoa `(N × 3)` — X/Y/Z raakalukuina. `accel_scale` (lukemat per g) muuttaa ne fysikaalisiksi g:iksi.",
    ],
    p2: "Miksi `int16` liukuluvun sijaan? Kaistanleveys. 100 Hz × 3 akselia × 8 h on miljoonia arvoja — 2-tavuisina kokonaislukuina se puolittaa lähetyksen koon. Skaalaus takaisin g:ihin tapahtuu vasta palvelimella.",
  },
  pipe: {
    h: "Pipeline yhdellä silmäyksellä",
    p: "Kaksi esikäsittelyraidetta (GPS + accel) syöttävät ML-mallia, joka päättää **sekunnin välein** „foililla — kyllä/ei“. Siitä syntyy yhtenäisiä vetoja, joiden alku/loppu hienosäädetään, ja lopulta pumppaukset ja liitovaiheet per veto:",
    cap: "Koko analyysi: kahdesta raakadatavirrasta foiling-maskin kautta vetoihin, pumppauksiin ja liitovaiheisiin.",
    gps: ["GPS  ~1 Hz", "t, lat, lon, speed, hr, h_acc"],
    accel: ["Kiihtyvyys  10–100 Hz", "int16 (N×3) · accel_scale"],
    gpsPrep: ["Valmistele GPS", "spike-/Doppler-suodatin · tasoita · nopeus"],
    accelPrep: ["Valmistele accel", "itseisarvo → pystysuunta · FFT-kaistanpäästö"],
    model: ["ML-foil-malli — RandomForest, ±5 s konteksti", "Vara ilman accelia: GPS-tilakone (hystereesi + dwell)"],
    mask: ["Foiling-maski", "foil / ei-foil — sekunnin välein"],
    seg: ["Segmentointi → vedot", "aukot kiinni · yhdistä · napsauta alku/loppu"],
    pumps: ["Laske pumppaukset", "kadenssiohjattu, per veto"],
    glide: ["Liitovaiheet", "aukot pumppausten välissä"],
  },
  mag: {
    h: "Vaihe 1 — itseisarvo akselien sijaan",
    p: "Kello on ranteessa ja pyörii jatkuvasti — kolme akselia X/Y/Z osoittavat alati eri suuntiin. Yksittäinen akseliarvo on siksi arvoton. Pelastus on vektorin **itseisarvo**:",
    formula: "|a| = √(x² + y² + z²) / accel_scale",
    p2: "Itseisarvo on **orientaatiosta riippumaton**: on kello käännetty miten tahansa, 2 g:n tönäisy pysyy 2 g:n tönäisynä. Vasta se tekee signaalista ylipäätään vertailukelpoisen (`magnitude_g`).",
    cap: "Kolme yksinään merkityksetöntä akselia (kello kallistelee jatkuvasti) antavat yhdessä vakaan, orientaatiosta riippumattoman itseisarvon |a|.",
    label: "|a| = √(x²+y²+z²)",
  },
  vert: {
    h: "Vaihe 2 — ranteesta pystysuuntaan",
    p: "Itseisarvossa on koukku: pumppaus on **ylöspäin työntö**, mutta `|a|` laskee alavedon aivan kuten ylävedon — jokainen pumppaus näkyy kahdesti. Parempi olisi todellinen **pystysuora kiihtyvyys painovoimaa vastaan**. Ja se voidaan rekonstruoida, täysin ilman gyroskooppia:",
    ol: [
      "**Painovoiman suunta** muuttuu vain hitaasti → arvioi se akseleittain **alipäästöllä** (< 0,25 Hz). Siitä syntyy vektori `g`, joka osoittaa aina „alaspäin“.",
      "**Dynaaminen** kiihtyvyys on `a − g`.",
      "**Projisoi** se painovoiman yksikkövektorille → skalaarisignaali: > 0 = ylöspäin (työntö).",
    ],
    f1: "v(t) = (a − g) · ĝ",
    fMid: "missä",
    f2: "ĝ = g / |g|",
    cap: "Hitaasti ajautuva painovoima g (alipäästö) erottaa orientaation dynamiikasta. Dynaaminen kiihtyvyys a−g, projisoituna ĝ:lle, antaa siistin ylöspäin työnnön per pumppaus.",
    gLabel: "g (painovoima)",
    aLabel: "a (mitattu)",
    amg: "a − g",
    topNote: "|itseisarvo|: jokainen pumppaus kahdesti",
    botNote: "v(t) painovoimaa vastaan: yksi työntö per pumppaus",
  },
  win: {
    h: "Vaihe 3 — liukuva ikkuna & FFT-kaistanpäästö",
    p: "Pumppaaminen on **rytmistä** — ja rytmi elää taajuusavaruudessa. Siksi **liukuva ikkuna** (tyyp. 4 s leveä, askel joka 2 s) liikkuu signaalin yli, ja jokaiselle ikkunalle **FFT** laskee spektrin. Kaksi kaistaa on tärkeitä:",
    li: [
      "**Suodatinkaista 0,3–3 Hz** — kaikki sen alla on painovoimaa/ajautumaa, kaikki sen yllä roiskekohinaa. Molemmat nollataan FFT-kaistanpäästöllä (`bandpass_fft`).",
      "**Pumppauskaista 0,5–2 Hz** — täällä elää pumppauskadenssi (30–120 pumppausta/min).",
    ],
    p2: "Jokaisesta ikkunasta irtoaa neljä piirrettä:",
    li2: [
      "**dom_freq** — hallitseva taajuus pumppauskaistalla (pumppausnopeus)",
      "**band_power_ratio** — pumppauskaistan energian osuus koko kaistasta (korkea = selkeä rytmi)",
      "**rms** — signaalin voimakkuus (liikkeen amplitudi)",
      "**spectral_entropy** — kuinka „siisti“ spektri on (matala = yksi selkeä taajuus = pumppausta; korkea = kaaosta = kohinaa/liitoa)",
    ],
    cap: "4 s ikkuna vaeltaa suodatetun signaalin yli (askel 2 s → limitys). Jokaiselle ikkunalle FFT antaa spektrin; energia pumppauskaistalla 0,5–2 Hz paljastaa nopeuden ja rytmin.",
    winT: "ikkuna t",
    winT1: "ikkuna t+1",
    sig: "v(t) — kaistanpäästösuodatettu (0,3–3 Hz)",
    fft: "FFT",
    spec: "spektri",
    band: "0,5–2 Hz",
    freq: "taajuus →",
  },
  rate: {
    h: "Nörttiyksityiskohta: todellinen näytteenottotaajuus",
    p: "Jotkin kellot **valehtelevat** taajuudestaan. Forerunner 55 merkitsee „10 Hz“, mutta tuottaa todellisuudessa vain ~2,5 Hz. Taajuuspiirteet ja pumppauskadenssi olisivat sillä roskaa. Siksi palvelin määrittää taajuuden **geneerisesti datasta itsestään**: `todellinen_Hz = accel-näytteiden_määrä / GPS-kesto`. Jos se poikkeaa > 25 % merkinnästä, mitattu taajuus pätee. Ja jos se on **alle 15 Hz**, signaali on taajuusanalyysille liian karkea → session arvioidaan **GPS-onlyna** (pumppaukset n/a, mutta rehelliset rajat mielikuvitusarvojen sijaan).",
  },
  ml: {
    h: "Missä olen foililla? — ML-malli",
    p: "Onko sekunnilla **foililla**, sen päättää **RandomForest** — metsä päätöspuita, jotka äänestävät enemmistöllä. Pieni ja tulkittava, ei deep learningia tarvita. Joka sekunti se saa **14 piirrettä**:",
    li: [
      "**7 nopeudesta & accelista**: nopeus nyt / 3 s / 5 s (mediaani), nopeuden vaihtelu, sekä RMS kolmella kaistalla (koko, pumppauskaista, korkeataajuinen).",
      "**7 GPS-radalta**: nopeuden muutos 1/3/5 s aikana, polun pituus, nettosiirtymä, **suoraviivaisuus** (netto/polku) ja suunnanmuutos. Nämä suuntapiirteet olivat kokeessa suurin vipu — ne pitävät rauhalliset liitovaiheet vedon sisällä sen pilkkomisen sijaan.",
    ],
    p2: "Kikka on **konteksti**: jokaista sekuntia ei luokitella eristyksissä, vaan yhdessä **±5 naapurisekunnin** kanssa („windowize“). Yhden sekunnin piirrevektori on siis 14 × 11 = 154 lukua pitkä. Näin malli näkee kulun — lyhyt nopeuden notkahdus keskellä cruisea ei heti tulkita „ulos“. Se toi fragmentaation 1,10×:stä 1,00×:ään ja F1-scoren **0,93:sta 0,97:ään**.",
    cap: "Yksi 14 piirteen vektori per sekunti; luokitusta varten ±5 naapurisekuntia liitetään perään (keskuslabel). RandomForest äänestää → foil / ei-foil.",
    featNote: "sekunti-ikkuna: 14 piirrettä per sekunti, ±5 s konteksti",
    forest: "RandomForest (enemmistö)",
    maskNote: "maski per sekunti: foil ▮ / ei-foil ▯",
  },
  seg: {
    h: "Maskista vetoihin",
    p: "Sekuntimaski on vielä täynnä reikiä. Se muotoillaan siisteiksi **vedoiksi**:",
    li: [
      "**Sulje lyhyet aukot** (~2 s asti): liitotauko ei jaa vetoa.",
      "**Fysiikan lattia**: alle ~9 km/h mikään foil ei kanna, ja ilman todellista sijainnin liikettä (ei pelkkä nopeuskenttä) et ole foililla — molemmat leikkaavat pehmeät reunat pois.",
      "**Vähimmäispituus & keskinopeus**: alle 5 s segmentit tai liian matalan keskiarvon segmentit tippuvat pois (reipas kävely ≠ foilaus).",
      "**GPS-katkos erottaa**: näyteaukko > 15 s (kello veden alla/kaatuminen) päättää vedon — aukkoaika ei laske ajoaikaan.",
      "**„Ei-pysähdystä“-yhdistys**: jos nopeus kahden havaitun vedon välissä ei **koskaan** pudonnut alle ~5,4 km/h eikä katkosta ollut, kyseessä oli todellisuudessa **yksi** veto (mallin pätkähdys) → yhdistä, olipa kuinka pitkä tahansa.",
    ],
    p2: "Ilman käyttökelpoista kiihtyvyyttä (GPS-only) hommat hoitaa **tilakone**, jossa on **hystereesi** ja **dwell**: „foilaavaksi“ tullaan vasta usean sekunnin jälkeen nopeuskaistalla *tasaisella nopeudella* (liito on tasaista, melonta katkonaista) — ja tilasta poistutaan vasta usean sekunnin jälkeen sen alla. Kaksi kynnystä (sisään/ulos) estävät värähtelyn rajalla.",
    cap: "Ylhäällä: rei'ikäs sekuntimaski muuttuu vedoiksi (sulje aukot, yhdistä, hylkää lyhyet segmentit). Alhaalla: GPS-tilakoneen hystereesi — sisään vasta yläpuolella, ulos vasta alapuolella, pitoajalla (dwell).",
    maskLabel: "maski (per sekunti)",
    runs: "vedot",
    run1: "veto 1 (aukot suljettu)",
    run2: "veto 2",
    tooShort: "· liian lyhyt → hylätty",
    hyst: "hystereesi + dwell (GPS-vara)",
    enter: "ENTER ~10 km/h",
    exit: "EXIT ~9 km/h",
  },
  se: {
    h: "Alku & loppu — alle sekunnin tarkkuudella",
    p: "Malli toimii sekuntiruudukossa, mutta **ponnistus** on terävä tapahtuma. Siksi vedon alku napsautetaan **hyppyimpulssiin**: hyvin voimakas magnitude-piikki (> 3,5× 95-persentiilistä — kokeessa hyppy oli ~4,3×, pumppaus vain ~2,3×, siis selvästi erotettavissa). Varhaisin tällainen impulssi ikkunassa ±muutama sekunti merkitsee todellisen ponnistuksen — interpoloituna alle sekunnin tarkkuudella kahden GPS-pisteen väliin. Jos impulssi puuttuu, palvelin vetää alkua taaksepäin kiihtyvyysramppia pitkin viimeiseen lähes-pysähdykseen asti.",
    p2: "**Lopussa** vaanii kaksi ansaa: **dead-reckoning-ajautuma** (kello sukeltaa alle, ekstrapoloi GPS:n ja „ajautuu“ maalle) hylätään — priori: veto ei koskaan pääty maalle päin alkuaan kauemmas. Ja missä **OSM-vesialue** tunnetaan, alun ja lopun on oltava **vedessä** (piste-monikulmiossa säteenheiton avulla), muuten leikataan takaisin viimeiseen todelliseen vesinäytteeseen. Lopuksi loppu vielä luokitellaan **kaatumiseksi** (äkillinen nopeuden pudotus „foililta“ „veteen“, tai GPS-katkos) tai **hallituksi pysähdykseksi**.",
    cap: "Havaittu sekuntialku (harmaa) napsautetaan terävään ponnistusimpulssiin kiihtyvyyden itseisarvossa (syaani) — todellinen foil-alku.",
    thr: "3,5 × p95 (hyppykynnys)",
    secStart: "sekuntialku",
    snapped: "← napsautettu ponnistukseen",
    afterPump: "sen jälkeen: pumppausrytmi",
  },
  pump: {
    h: "Pumppausten laskeminen — kadenssiohjattu (v3)",
    p: "Ilmeisin tapa — „laske kaikki piikit amplitudikynnyksen yli“ — **aliarvioi rakenteellisesti ~2×**: se poimii vain suurimmat heilahdukset ja nielaisee pienemmät, rytmiset pumppaukset niiden välistä. **Totuutta** vastaan (oma naputtelemani pumppaustotuus, katso alta) se osui vain ~40 %.",
    p2: "Parempi lähestymistapa on **kadenssiohjattu**: rytmisissä, energiarikkaissa jaksoissa paikallinen FFT arvioi **hetkellisen pumppaustaajuuden**, ja sitten **per kadenssijakso valitaan täsmälleen yksi** todellinen paikallinen maksimi pumppaukseksi. Kadenssi on paikallis-adaptiivinen, joten se seuraa tempon vaihteluita. Tulos: **85–94 %** osumia 40 %:n sijaan — ja laskuri ja karttamerkit ovat automaattisesti yhtenevät (molemmat samoista sijainneista). RMS-portti estää rytmittömien liitovaiheiden laskemisen mukaan.",
    cap: "Amplitudikynnys (ylhäällä) näkee vain paksut piikit. Kadenssiohjattu (alhaalla): arvioi paikallinen jakso T, poimi per jakso todellinen maksimi — myös hienovaraiset pumppaukset.",
    top: "amplitudikynnys — nielaisee pienet pumppaukset",
    bot: "kadenssiohjattu — yksi piikki per jakso T",
  },
  glide: {
    h: "Liitovaiheet — hiljaisuus pumppausten välissä",
    p: "Juuri se, minkä osa 1 nimesi suurimmaksi potentiaaliksi, irtoaa nyt melkein ilmaiseksi: kun pumppausten ajankohdat tunnetaan, **liitovaiheet ovat yksinkertaisesti niiden väliset aukot** — plus alkukiihdytys vedon alusta ensimmäiseen pumppaukseen (*lead*) ja loppuliuku viimeisestä pumppauksesta loppuun (*tail*). Siitä irtoaa per veto **määrä**, **keskim. liitokesto** ja **pisin liitovaihe** — mittari sille, kuinka tehokkaasti foil pitää vauhtia.",
    cap: "Pumppaukset (merkit) jakavat vedon; niiden väliset aukot ovat liitovaiheet. lead = alku→1. pumppaus, tail = viimeinen pumppaus→loppu. Pitkä tail = siisti loppuliuku.",
    start: "alku",
    end: "loppu",
    pumps: "pumppaukset",
    lead: "lead",
    tail: "tail (liito)",
    gaps: "aukot = liitovaiheet",
  },
  gpsonly: {
    h: "Ilman accelia: GPS-only & sen sudenkuopat",
    p: "Tuoduilla sessioilla (esim. Polarilta) tai kelloilla, joilla on liian karkea taajuus, **ei ole käyttökelpoista kiihtyvyyttä**. Silloin GPS kantaa yksin — ja siinä on kummallisuutensa:",
    li: [
      "**Yksittäiset piikit** (Doppler-häiriö, „teleportti“): korvataan paikallista mediaania vasten, tai edestakaiset hypyt tasoitetaan.",
      "**Monisekuntiset Doppler-purskeet** (~3 s nopeudella 50 km/h, mutta 90 km/h häiriökynnyksen alla): korvataan robustia **15 s mediaania** vasten — se ei reagoi lyhyisiin purskeisiin, kun taas todellinen ylläpidetty veto nostaa sitä mukanaan ja jää koskematta. Kaksi ehtoa (suhteellinen yli mediaanin **ja** absoluuttinen yli ~28 km/h) suojaavat todelliset vedot.",
      "**30 km/h pumpfoil-portti**: ilman accelia pumpfoilausta ei voi luotettavasti erottaa moottoroidusta foilauksesta (kite/tuuli/wake). Jos tasoitettu huippunopeus on yli 30 km/h, session lasketaan moottoroiduksi → **ei** pumpfoilausta. Accelin kanssa tämä portti jää pois — silloin analyysi luottaa pumppaus-/on-foil-signaaliin.",
    ],
  },
  label: {
    h: "Mistä totuus tulee — pumppausten naputtaminen",
    p: "Malli tarvitsee **totuuden**, jota vasten kadenssiohjattu pumppauslaskuri kalibroidaan — ja sen naputan tällä hetkellä itse. Katson vedon **videon** ja **naputan nappia jokaisella todellisella pumppauksella**. Teen tämän **usealla otolla**; ne yhdistetään ristikorrelaatiolla **konsensukseksi** (pienet reaktioaikaerot keskiarvoistuvat pois). Tuloksena: todellinen pumppausmäärä ja ajoitus per veto. Tämä on tarkoituksella **väliaikaisratkaisu** — riittävän tarkka kalibroimaan tänään, mutta käsin naputettu.",
    p2: "Tärkeää kalibroitaessa tällaisia labeleita vasten: **GroupKFold** tavallisen ristivalidoinnin sijaan. Saman vedon naapurisekunnit ovat lähes identtisiä — jos ne päätyisivät yhtä aikaa koulutus- ja testijoukkoon, malli kysyisi itseltään (leakage) ja raportoisi unelmatuloksia. GroupKFold pitää siksi **kokonaiset sessiot** koossa: testataan aina vedoilla, joita malli ei ole koskaan nähnyt.",
    cap: "Silmukka: **naputettu** pumppaustotuus → piirteet → RandomForest → foil_rf.pkl → jokaisen session analyysi. Uudet napautukset virtaavat takaisin, malli kalibroidaan uudelleen.",
    fits: ["naputa pumppaukset", "video · useita ottoja"],
    feats: ["piirteet", "14 × ±5 s konteksti"],
    rf: ["RandomForest", "GroupKFold-CV"],
    pkl: ["foil_rf.pkl", "→ jokainen session"],
    loopNote: "uudet naputetut vedot → kalibroi uudelleen",
  },
  x5: {
    h: "Seuraava askel — todellinen totuus kameralla (Insta360 X5)",
    p: "Naputtaminen on riittävän hyvä bootstrappaukseen, mutta se on kiinni reaktioajastani. **Fysikaalisesti tarkka** totuus tulee seuraavaksi **laudalla olevalta kameralta**: Insta360 X5 kuvaa mastoa/foilia, ja videosta voi lukea **kuvatarkasti**, milloin foil oikeasti saa painetta ja milloin se lentää. Sillä kalibroimme pumppausajoituksen ja on-foil-tunnistuksen todellista fysiikkaa vasten naputetun arvion sijaan. Heti kun rigi on pystyssä, tähän tulee oma osionsa koko kamerakokoonpanon kera.",
  },
  summary: {
    h: "Koko polku yhdessä lauseessa",
    p1: "Raaka int16-kiihtyvyys → **itseisarvo** → **pystysuunta painovoimaa vastaan** → **FFT-kaistanpäästö** liukuvassa ikkunassa → 14 piirrettä per sekunti **±5 s kontekstilla** → **RandomForest** sanoo on-foil/ei → **segmentointi** vedoiksi (hystereesi, yhdistys, katkos) → alku napsautettu **ponnistusimpulssiin**, loppu korjattu **vesialuetta** & ajautumaa vasten → **kadenssiohjattu** pumppauslaskenta → liitovaiheet aukkoina → tunnusluvut.",
    p2: "Ja kaikki tämä **yhdestä ranteessa olevasta kellosta** — osan 1 mastokello oli vain referenssi, joka osoittaa, että se pitää paikkansa.",
  },
  limits: {
    h: "Rajat (edelleen rehellisesti)",
    p: "Kello on ranteessa, ei laudalla — kädet heiluvat tasapainottaakseen ja peittävät pumppaussignaalin („wrist confound“). Pystysuunta arvioidaan painovoiman suunnasta (ei gyroskooppia) ja vääristyy hieman jatkuvassa kiihtyvyydessä. Kadenssiohjattu laskuri on kalibroitu sovellus- ja videototuutta vasten, mutta **fysikaalinen** loppukalibrointi (kamera laudalla, Insta360 X5) on vielä tekemättä. Ja GPS-only-portit ovat kompromissi: mieluummin rehellinen „gps_only, pumppaukset n/a“ kuin keksityt luvut.",
  },
};

const nl: N2 = {
  back: "← Nerd-analyses (deel 1: het experiment)",
  h1: "Nerd-analyses · Deel 2",
  subtitle:
    "Hoe uit ruwe sensorgetallen pumps, on-foil-runs, start/einde en glijfases ontstaan — de signaalverwerking, het sliding window, het ML-model en het labelen, netjes op volgorde.",
  intro:
    "In [deel 1](/nerd-analysen) ging het om de **waarheid**: een tweede horloge op de foil-mast dat verraadt wat de foil echt doet. Hier gaat het om de **machinerie**: wat de server rekent om van een trillerig signaal aan de pols een schone sessie-analyse te maken. Alles wat volgt gebeurt **server-side** — het horloge is slechts een dunne recorder.",

  raw: {
    h: "Wat binnenkomt: de ruwe data",
    p: "Elke sessie bestaat uit twee stromen, beide met een gemeenschappelijke tijdbasis (ms vanaf opnamestart):",
    li: [
      "**GPS**, ca. **1 Hz**: per sample `[t_ms, lat, lon, speed_mps, hr_bpm, h_acc_m]`. Speed en hartslag kunnen ontbreken (dan afgeleid uit de positie resp. leeg).",
      "**Versnelling**, afhankelijk van het horloge **10–100 Hz**: een `int16`-array van de vorm `(N × 3)` — X/Y/Z in ruwe tellerwaarden. Een `accel_scale` (tellerwaarden per g) maakt daar fysische g van.",
    ],
    p2: "Waarom `int16` in plaats van floating point? Bandbreedte. 100 Hz × 3 assen × 8 u zijn miljoenen waarden — als 2-byte-integers halveert dat de uploadgrootte. Het terugschalen naar g gebeurt pas op de server.",
  },
  pipe: {
    h: "De pipeline in één oogopslag",
    p: "Twee voorbewerkingssporen (GPS + accel) lopen in een ML-model dat **per seconde** beslist ‘op de foil — ja/nee’. Daaruit ontstaan aaneengesloten runs waarvan start/einde wordt fijngesteld, en ten slotte pumps & glijfases per run:",
    cap: "De complete analyse: van de twee ruwe datastromen via het foiling-masker naar runs, pumps en glijfases.",
    gps: ["GPS  ~1 Hz", "t, lat, lon, speed, hr, h_acc"],
    accel: ["Versnelling  10–100 Hz", "int16 (N×3) · accel_scale"],
    gpsPrep: ["GPS voorbewerken", "spike-/dopplerfilter · gladstrijken · speed"],
    accelPrep: ["Accel voorbewerken", "magnitude → verticaal · FFT-banddoorlaat"],
    model: ["ML-foil-model — RandomForest, ±5 s context", "Fallback zonder accel: GPS-state-machine (hysterese + dwell)"],
    mask: ["Foiling-masker", "foil / niet-foil — per seconde"],
    seg: ["Segmentatie → runs", "gaten sluiten · mergen · start/einde snappen"],
    pumps: ["Pumps tellen", "cadans-geleid, per run"],
    glide: ["Glijfases", "gaten tussen pumps"],
  },
  mag: {
    h: "Stap 1 — magnitude in plaats van assen",
    p: "Het horloge zit om de pols en draait voortdurend — de drie assen X/Y/Z wijzen steeds ergens anders heen. Een losse aswaarde is daarom waardeloos. De redding is de **magnitude** van de vector:",
    formula: "|a| = √(x² + y² + z²) / accel_scale",
    p2: "De magnitude is **oriëntatie-invariant**: hoe het horloge ook gedraaid is, een 2-g-stoot blijft een 2-g-stoot. Daarmee wordt het signaal überhaupt pas vergelijkbaar (`magnitude_g`).",
    cap: "Drie afzonderlijk nietszeggende assen (het horloge kantelt voortdurend) leveren samen een stabiele, oriëntatie-invariante magnitude |a|.",
    label: "|a| = √(x²+y²+z²)",
  },
  vert: {
    h: "Stap 2 — van de pols naar de verticaal",
    p: "De magnitude heeft een addertje: een pump is een **opwaartse push**, maar `|a|` telt de neergaande slag net zo goed als de opgaande — elke pump verschijnt dubbel. Beter zou de echte **verticale versnelling tegen de zwaartekracht** zijn. En die is te reconstrueren, helemaal zonder gyroscoop:",
    ol: [
      "De **zwaartekrachtrichting** verandert maar langzaam → per as schatten via een **laagdoorlaatfilter** (< 0,25 Hz). Dat levert de vector `g` op, die altijd ‘naar beneden’ wijst.",
      "De **dynamische** versnelling is `a − g`.",
      "Deze op de zwaartekracht-eenheidsvector **projecteren** → scalair signaal: > 0 = omhoog (push).",
    ],
    f1: "v(t) = (a − g) · ĝ",
    fMid: "met",
    f2: "ĝ = g / |g|",
    cap: "De langzaam driftende zwaartekracht g (laagdoorlaat) scheidt oriëntatie van dynamiek. De dynamische versnelling a−g, geprojecteerd op ĝ, levert een schone opwaartse push per pump.",
    gLabel: "g (zwaartekracht)",
    aLabel: "a (gemeten)",
    amg: "a − g",
    topNote: "|magnitude|: elke pump dubbel",
    botNote: "v(t) tegen zwaartekracht: één push per pump",
  },
  win: {
    h: "Stap 3 — sliding window & FFT-banddoorlaat",
    p: "Pompen is **ritmisch** — en ritme leeft in het frequentiedomein. Daarom schuift een **glijdend venster** (typ. 4 s breed, elke 2 s een stap) over het signaal, en voor elk venster rekent een **FFT** het spectrum uit. Twee banden zijn belangrijk:",
    li: [
      "**Filterband 0,3–3 Hz** — alles eronder is zwaartekracht/drift, alles erboven is splash-ruis. Beide worden via de FFT-banddoorlaat genuld (`bandpass_fft`).",
      "**Pump-band 0,5–2 Hz** — hier leeft de pump-cadans (30–120 pumps/min).",
    ],
    p2: "Per venster vallen vier kenmerken af:",
    li2: [
      "**dom_freq** — dominante frequentie in de pump-band (de pump-rate)",
      "**band_power_ratio** — aandeel van de energie in de pump-band t.o.v. de totale band (hoog = duidelijk ritme)",
      "**rms** — signaalsterkte (amplitude van de beweging)",
      "**spectral_entropy** — hoe ‘opgeruimd’ het spectrum is (laag = één duidelijke frequentie = pompen; hoog = chaos = ruis/glijden)",
    ],
    cap: "Een 4-s-venster schuift over het gefilterde signaal (stap 2 s → overlap). Voor elk venster levert de FFT een spectrum; de energie in de pump-band 0,5–2 Hz verraadt rate en ritme.",
    winT: "venster t",
    winT1: "venster t+1",
    sig: "v(t) — banddoorlaat-gefilterd (0,3–3 Hz)",
    fft: "FFT",
    spec: "spectrum",
    band: "0,5–2 Hz",
    freq: "frequentie →",
  },
  rate: {
    h: "Een nerd-detail: de echte samplefrequentie",
    p: "Sommige horloges **liegen** over hun rate. Een Forerunner 55 tagt ‘10 Hz’, maar levert in werkelijkheid maar ~2,5 Hz. Frequentie-features en pump-cadans zouden daarmee waardeloos zijn. Daarom bepaalt de server de rate **generiek uit de data zelf**: `echte_Hz = aantal_accel-samples / GPS-duur`. Wijkt dat > 25 % van de tag af, dan geldt de gemeten rate. En ligt die **onder 15 Hz**, dan is het signaal te grof voor frequentieanalyse → de sessie wordt als **GPS-only** geanalyseerd (pumps n/a, maar wel eerlijke grenzen in plaats van fantasiewaarden).",
  },
  ml: {
    h: "Waar ben ik op de foil? — het ML-model",
    p: "Of je in een seconde **op de foil** bent, beslist een **RandomForest** — een bos van beslisbomen die bij meerderheid stemmen. Klein en interpreteerbaar, geen deep learning nodig. Per seconde krijgt hij **14 kenmerken**:",
    li: [
      "**7 uit speed & accel**: speed nu / 3 s / 5 s (mediaan), speed-variabiliteit, plus RMS in drie banden (totaal, pump-band, hoogfrequent).",
      "**7 uit de GPS-baan**: speed-verandering over 1/3/5 s, padlengte, netto-verplaatsing, **rechtlijnigheid** (netto/pad) en koersverandering. Deze richtings-features waren in het experiment de grootste hefboom — ze houden rustige glijfases in de run, in plaats van hem te versnipperen.",
    ],
    p2: "De clou is de **context**: elke seconde wordt niet geïsoleerd geclassificeerd, maar samen met de **±5 buurseconden** (het ‘windowize’). De feature-vector van een seconde is dus 14 × 11 = 154 getallen lang. Zo ziet het model het verloop — een korte speed-dip midden in de cruise wordt niet meteen als ‘eruit’ gewaardeerd. Dat bracht de fragmentatie van 1,10× naar 1,00× en de F1-score van **0,93 naar 0,97**.",
    cap: "Per seconde een kenmerkvector van 14; voor de classificatie worden de ±5 buurseconden aangehangen (center-label). De RandomForest stemt → foil / niet-foil.",
    featNote: "seconde-venster: 14 kenmerken per seconde, ±5 s context",
    forest: "RandomForest (meerderheid)",
    maskNote: "masker per seconde: foil ▮ / niet-foil ▯",
  },
  seg: {
    h: "Van het masker naar runs",
    p: "Het seconde-masker zit nog vol gaten. Het wordt tot schone **runs** gevormd:",
    li: [
      "**Korte gaten sluiten** (tot ~2 s): een glijpauze knipt geen run doormidden.",
      "**Fysica-floor**: onder ~9 km/h draagt geen foil, en zonder echte positiebeweging (niet alleen het speed-veld) ben je niet op de foil — beide snijden de zachte randen weg.",
      "**Minimumlengte & Ø-speed**: segmenten onder 5 s of met een te laag gemiddelde vliegen eruit (snel lopen ≠ foilen).",
      "**GPS-dropout splitst**: een sample-gat > 15 s (horloge onder water/val) beëindigt de run — de gatentijd telt niet als vaartijd.",
      "**‘Geen-stop’-merge**: zakte de speed tussen twee gedetecteerde runs **nooit** onder ~5,4 km/h en was er geen dropout, dan was het in werkelijkheid **één** run (model-hapering) → samenvoegen, hoe lang ook.",
    ],
    p2: "Zonder bruikbare versnelling (GPS-only) neemt een **state-machine** met **hysterese** en **dwell** het over: je wordt pas ‘foilend’ na meerdere seconden in de speed-band *bij gladde speed* (glijden is glad, peddelen choppy) — en je verlaat de toestand pas na meerdere seconden eronder. Twee drempels (erin/eruit) voorkomen flikkeren op de grens.",
    cap: "Boven: het gatenrijke seconde-masker wordt tot runs gevormd (gaten sluiten, mergen, korte segmenten verwerpen). Onder: de hysterese van de GPS-state-machine — erin pas erboven, eruit pas eronder, met houdtijd (dwell).",
    maskLabel: "masker (per seconde)",
    runs: "runs",
    run1: "run 1 (gaten gesloten)",
    run2: "run 2",
    tooShort: "· te kort → verworpen",
    hyst: "hysterese + dwell (GPS-fallback)",
    enter: "ENTER ~10 km/h",
    exit: "EXIT ~9 km/h",
  },
  se: {
    h: "Start & einde — sub-seconde-nauwkeurig",
    p: "Het model werkt in een secondenraster, maar de **opsprong** is een scherpe gebeurtenis. Daarom wordt de run-start op de **jump-impuls** gesnapt: een zeer sterke magnitude-piek (> 3,5× het 95-percentiel — in het experiment lag een jump op ~4,3×, een pump maar op ~2,3×, dus duidelijk te scheiden). De vroegste zo’n impuls in het venster ±enkele seconden markeert de echte afsprong — sub-seconde-nauwkeurig geïnterpoleerd tussen twee GPS-punten. Ontbreekt de impuls, dan trekt de server de start via de versnellingsramp terug tot de laatste quasi-stop.",
    p2: "Aan het **einde** loeren twee valkuilen: **dead-reckoning-drift** (het horloge duikt onder, extrapoleert de GPS en ‘drift’ het land op) wordt verworpen — prior: een run eindigt nooit meer landinwaarts dan zijn start. En waar een **OSM-wateroppervlak** bekend is, moeten start en einde **in het water** liggen (punt-in-polygoon via ray-casting), anders wordt teruggesneden naar het laatste echte water-sample. Ten slotte wordt het einde nog geclassificeerd als **val** (abrupte speed-inzakking van ‘op de foil’ naar ‘in het water’, of GPS-dropout) of **gecontroleerde stop**.",
    cap: "De gedetecteerde seconde-start (grijs) wordt gesnapt op de scherpe opsprong-impuls in de versnellingsmagnitude (cyaan) — de ware foil-start.",
    thr: "3,5 × p95 (jump-drempel)",
    secStart: "seconde-start",
    snapped: "← gesnapt op de opsprong",
    afterPump: "daarna: pump-ritme",
  },
  pump: {
    h: "Pumps tellen — cadans-geleid (v3)",
    p: "De voor de hand liggende weg — ‘tel alle pieken boven een amplitudedrempel’ — **onderschat structureel met ~2×**: hij pikt alleen de grootste uitslagen en slikt de kleinere, ritmische pumps ertussen in. Tegen de **waarheid** (mijn getikte pump-waarheid, zie hieronder) trof dat maar ~40 %.",
    p2: "De betere aanpak is **cadans-geleid**: in ritmische, energierijke passages schat een lokale FFT de **momentane pump-frequentie**, en dan wordt **per cadans-periode precies één** echt lokaal maximum als pump gekozen. De cadans is lokaal-adaptief, volgt dus tempowisselingen. Resultaat: **85–94 %** raak in plaats van 40 % — en teller en kaart-markers zijn automatisch consistent (beide uit dezelfde posities). Een RMS-gate voorkomt dat ritmeloze glijfases meegeteld worden.",
    cap: "Amplitudedrempel (boven) ziet alleen de dikke pieken. Cadans-geleid (onder): lokale periode T schatten, per periode het echte maximum pikken — ook de zachte pumps.",
    top: "amplitudedrempel — slikt kleine pumps in",
    bot: "cadans-geleid — één piek per periode T",
  },
  glide: {
    h: "Glijfases — de stilte tussen de pumps",
    p: "Precies wat deel 1 als grootste potentieel noemde, valt nu bijna gratis uit de lucht: zijn de pump-tijdstippen bekend, dan zijn de **glijfases simpelweg de gaten ertussen** — plus de aanloop van de run-start tot de eerste pump (*lead*) en het uitlopen van de laatste pump tot het einde (*tail*). Daaruit vallen per run **aantal**, **Ø-glijduur** en **langste glijfase** af — het kengetal voor hoe efficiënt een foil de vaart vasthoudt.",
    cap: "Pumps (markers) delen de run op; de gaten ertussen zijn de glijfases. lead = start→1e pump, tail = laatste pump→einde. Een lange tail = schoon uitlopen.",
    start: "start",
    end: "einde",
    pumps: "pumps",
    lead: "lead",
    tail: "tail (glijden)",
    gaps: "gaten = glijfases",
  },
  gpsonly: {
    h: "Zonder accel: GPS-only & zijn valkuilen",
    p: "Geïmporteerde sessies (bijv. van Polar) of horloges met een te grove rate hebben **geen bruikbare versnelling**. Dan draagt de GPS alleen — en die heeft kuren:",
    li: [
      "**Losse spikes** (doppler-glitch, ‘teleport’): vervangen door de lokale mediaan resp. heen-en-terug-sprongen gladgestreken.",
      "**Meerseconden-doppler-bursts** (~3 s op 50 km/h, maar onder de 90-km/h-glitchdrempel): vervangen door een robuuste **15-s-mediaan** — die is ongevoelig voor korte bursts, terwijl een echte aangehouden run hem wél mee optilt en onaangetast blijft. Twee voorwaarden (relatief boven de mediaan **én** absoluut boven ~28 km/h) beschermen echte runs.",
      "**30-km/h-pumpfoil-gate**: zonder accel kun je pumpfoil niet betrouwbaar scheiden van aangedreven foilen (kite/wind/wake). Ligt de gladgestreken topsnelheid boven 30 km/h, dan geldt de sessie als aangedreven → **geen** pumpfoil. Met accel vervalt deze gate — daar vertrouwt de analyse op het pump-/on-foil-signaal.",
    ],
  },
  label: {
    h: "Waar de waarheid vandaan komt — pumps aantikken",
    p: "Het model heeft een **waarheid** nodig waartegen de cadans-geleide pump-teller wordt gekalibreerd — en die tik ik momenteel zelf in. Ik kijk de **video** van een run en **tik bij elke echte pump** op een knop. Dat doe ik in **meerdere takes**; die worden via kruiscorrelatie tot een **consensus** verrekend (kleine reactietijd-verschuivingen middelen zich uit). Resultaat: het echte pump-aantal en de echte timing per run. Dit is bewust een **overgangsfase** — nauwkeurig genoeg om vandaag te kalibreren, maar met de hand getikt.",
    p2: "Belangrijk bij het kalibreren tegen zulke labels: **GroupKFold** in plaats van normale kruisvalidatie. Naburige seconden van dezelfde run zijn bijna identiek — belandden ze tegelijk in de trainings- en testset, dan zou het model zichzelf bevragen (leakage) en droomwaarden melden. GroupKFold houdt daarom **hele sessies** bij elkaar: getest wordt altijd op runs die het model nooit heeft gezien.",
    cap: "De kringloop: **getikte** pump-waarheid → features → RandomForest → foil_rf.pkl → analyse van elke sessie. Nieuwe taps vloeien terug, het model wordt opnieuw gekalibreerd.",
    fits: ["Pumps aantikken", "video · meerdere takes"],
    feats: ["Features", "14 × ±5 s context"],
    rf: ["RandomForest", "GroupKFold-CV"],
    pkl: ["foil_rf.pkl", "→ elke sessie"],
    loopNote: "nieuwe getikte runs → opnieuw kalibreren",
  },
  x5: {
    h: "De volgende stap — echte waarheid per camera (Insta360 X5)",
    p: "Aantikken is goed genoeg om te bootstrappen, maar hangt aan mijn reactietijd. De **fysisch exacte** waarheid komt hierna van een **camera op het board**: een Insta360 X5 filmt mast/foil mee, en uit de video lees je **frame-nauwkeurig** af wanneer de foil echt druk krijgt en wanneer hij vliegt. Daarmee kalibreren we pump-timing en on-foil-detectie tegen echte fysica in plaats van tegen een getikte benadering. Zodra de rig staat, komt hier een eigen sectie met de hele camera-setup.",
  },
  summary: {
    h: "De hele weg in één zin",
    p1: "Ruwe int16-versnelling → **magnitude** → **verticaal tegen de zwaartekracht** → **FFT-banddoorlaat** in het sliding window → 14 kenmerken per seconde met **±5 s context** → **RandomForest** zegt on-foil/niet → **segmentatie** tot runs (hysterese, merge, dropout) → start op de **opsprong-impuls** gesnapt, einde tegen **wateroppervlak** & drift gecorrigeerd → **cadans-geleide** pump-telling → glijfases als gaten → kengetallen.",
    p2: "En dat alles uit **één pols-horloge** — het mast-horloge uit deel 1 was slechts de referentie die laat zien dat het klopt.",
  },
  limits: {
    h: "Grenzen (nog steeds eerlijk)",
    p: "Het horloge zit om de pols, niet op het board — de armen zwaaien om te balanceren en overlappen het pump-signaal (‘wrist confound’). De verticaal wordt geschat uit de zwaartekrachtrichting (geen gyroscoop) en is bij aanhoudende versnelling licht vertekend. De cadans-geleide teller is gekalibreerd tegen app- en video-waarheid, maar de **fysieke** eindkalibratie (camera op het board, Insta360 X5) staat nog open. En de GPS-only-gates zijn een compromis: liever eerlijk ‘gps_only, pumps n/a’ dan verzonnen getallen.",
  },
};

const cs: N2 = {
  back: "← Nerd analýzy (část 1: experiment)",
  h1: "Nerd analýzy · Část 2",
  subtitle:
    "Jak se ze surových čísel ze senzorů stanou pumpnutí, jízdy na foilu, start/konec a fáze klouzání — zpracování signálu, sliding window, ML model a labelování, pěkně popořadě.",
  intro:
    "V [části 1](/nerd-analysen) šlo o **pravdu**: druhé hodinky na stěžni foilu, které prozradí, co foil doopravdy dělá. Tady jde o **mašinerii**: co server počítá, aby se z roztřeseného signálu na zápěstí stalo čisté vyhodnocení relace. Vše následující se děje **na straně serveru** — hodinky jsou jen tenký rekordér.",

  raw: {
    h: "Co přichází: surová data",
    p: "Každá relace se skládá ze dvou toků, obou se společnou časovou základnou (ms od začátku záznamu):",
    li: [
      "**GPS**, cca **1 Hz**: na vzorek `[t_ms, lat, lon, speed_mps, hr_bpm, h_acc_m]`. Rychlost a tep mohou chybět (pak se odvodí z polohy, resp. jsou prázdné).",
      "**Zrychlení**, podle hodinek **10–100 Hz**: pole `int16` tvaru `(N × 3)` — X/Y/Z v surových jednotkách. `accel_scale` (jednotek na g) z toho udělá fyzikální g.",
    ],
    p2: "Proč `int16` místo desetinných čísel? Šířka pásma. 100 Hz × 3 osy × 8 h jsou miliony hodnot — jako 2bajtová celá čísla to zmenší velikost uploadu na polovinu. Přeškálování zpět na g proběhne až na serveru.",
  },
  pipe: {
    h: "Pipeline na jeden pohled",
    p: "Dvě přípravné stopy (GPS + zrychlení) ústí do ML modelu, který **každou sekundu** rozhoduje „na foilu — ano/ne“. Z toho vznikají souvislé jízdy, jejichž start/konec se jemně doladí, a nakonec pumpnutí a fáze klouzání pro každou jízdu:",
    cap: "Kompletní vyhodnocení: od dvou toků surových dat přes masku foilování k jízdám, pumpnutím a fázím klouzání.",
    gps: ["GPS  ~1 Hz", "t, lat, lon, speed, hr, h_acc"],
    accel: ["Zrychlení  10–100 Hz", "int16 (N×3) · accel_scale"],
    gpsPrep: ["Příprava GPS", "spike/doppler filtr · vyhlazení · rychlost"],
    accelPrep: ["Příprava zrychlení", "velikost → vertikála · FFT pásmová propust"],
    model: ["ML foil model — RandomForest, ±5 s kontext", "Záloha bez zrychlení: GPS stavový automat (hystereze + dwell)"],
    mask: ["Maska foilování", "foil / ne-foil — každou sekundu"],
    seg: ["Segmentace → jízdy", "zavření mezer · slučování · přichycení startu/konce"],
    pumps: ["Počítání pumpnutí", "vedené kadencí, na jízdu"],
    glide: ["Fáze klouzání", "mezery mezi pumpnutími"],
  },
  mag: {
    h: "Krok 1 — velikost místo os",
    p: "Hodinky sedí na zápěstí a neustále se otáčejí — tři osy X/Y/Z míří pořád jinam. Jedna hodnota osy je proto bezcenná. Záchranou je **velikost** vektoru:",
    formula: "|a| = √(x² + y² + z²) / accel_scale",
    p2: "Velikost je **invariantní vůči orientaci**: ať jsou hodinky natočené jakkoli, 2g ráz zůstane 2g rázem. Teprve tím se signál stane vůbec porovnatelným (`magnitude_g`).",
    cap: "Tři jednotlivě bezvýznamné osy (hodinky se neustále překlápějí) dají dohromady stabilní velikost |a| invariantní vůči orientaci.",
    label: "|a| = √(x²+y²+z²)",
  },
  vert: {
    h: "Krok 2 — ze zápěstí do svislice",
    p: "Velikost má háček: pumpnutí je **tah nahoru**, ale `|a|` počítá pohyb dolů stejně jako pohyb nahoru — každé pumpnutí se objeví dvakrát. Lepší by bylo skutečné **vertikální zrychlení proti gravitaci**. A to se dá zrekonstruovat, úplně bez gyroskopu:",
    ol: [
      "**Směr gravitace** se mění jen pomalu → odhadnout **dolní propustí** (< 0,25 Hz) pro každou osu. To dá vektor `g`, který vždy míří „dolů“.",
      "**Dynamické** zrychlení je `a − g`.",
      "To **promítnout** na jednotkový vektor gravitace → skalární signál: > 0 = nahoru (tah).",
    ],
    f1: "v(t) = (a − g) · ĝ",
    fMid: "kde",
    f2: "ĝ = g / |g|",
    cap: "Pomalu driftující gravitace g (dolní propust) odděluje orientaci od dynamiky. Dynamické zrychlení a−g promítnuté na ĝ dá čistý tah nahoru pro každé pumpnutí.",
    gLabel: "g (gravitace)",
    aLabel: "a (naměřené)",
    amg: "a − g",
    topNote: "|velikost|: každé pumpnutí dvakrát",
    botNote: "v(t) proti gravitaci: jeden tah na pumpnutí",
  },
  win: {
    h: "Krok 3 — sliding window a FFT pásmová propust",
    p: "Pumpování je **rytmické** — a rytmus žije ve frekvenční oblasti. Proto po signálu klouže **posuvné okno** (typicky 4 s široké, krok každé 2 s) a pro každé okno spočítá **FFT** spektrum. Důležitá jsou dvě pásma:",
    li: [
      "**Filtrační pásmo 0,3–3 Hz** — vše pod ním je gravitace/drift, vše nad ním je šum od stříkající vody. Obojí se vynuluje FFT pásmovou propustí (`bandpass_fft`).",
      "**Pumpovací pásmo 0,5–2 Hz** — tady žije kadence pumpování (30–120 pumpnutí/min).",
    ],
    p2: "Z každého okna vypadnou čtyři příznaky:",
    li2: [
      "**dom_freq** — dominantní frekvence v pumpovacím pásmu (frekvence pumpování)",
      "**band_power_ratio** — podíl energie v pumpovacím pásmu na celkovém pásmu (vysoký = jasný rytmus)",
      "**rms** — síla signálu (amplituda pohybu)",
      "**spectral_entropy** — jak „uklizené“ je spektrum (nízká = jedna jasná frekvence = pumpování; vysoká = chaos = šum/klouzání)",
    ],
    cap: "Okno o šířce 4 s putuje po filtrovaném signálu (krok 2 s → překryv). Pro každé okno dá FFT spektrum; energie v pumpovacím pásmu 0,5–2 Hz prozradí frekvenci a rytmus.",
    winT: "okno t",
    winT1: "okno t+1",
    sig: "v(t) — filtrováno pásmovou propustí (0,3–3 Hz)",
    fft: "FFT",
    spec: "spektrum",
    band: "0,5–2 Hz",
    freq: "frekvence →",
  },
  rate: {
    h: "Nerd detail: skutečná vzorkovací frekvence",
    p: "Některé hodinky o své frekvenci **lžou**. Forerunner 55 hlásí „10 Hz“, ale reálně dodá jen ~2,5 Hz. Frekvenční příznaky a kadence pumpování by s tím byly na nic. Proto server určuje frekvenci **genericky z dat samotných**: `skutečné_Hz = počet_vzorků_zrychlení / doba_GPS`. Pokud se to odchýlí o > 25 % od hlášené hodnoty, platí naměřená frekvence. A leží-li **pod 15 Hz**, je signál pro frekvenční analýzu příliš hrubý → relace se vyhodnotí jako **GPS-only** (pumpnutí n/a, zato poctivé meze místo vymyšlených hodnot).",
  },
  ml: {
    h: "Jsem na foilu? — ML model",
    p: "Jestli je člověk v dané sekundě **na foilu**, rozhoduje **RandomForest** — les rozhodovacích stromů, které hlasují většinou. Malý a interpretovatelný, žádný deep learning není potřeba. Na každou sekundu dostane **14 příznaků**:",
    li: [
      "**7 z rychlosti a zrychlení**: rychlost teď / 3 s / 5 s (medián), variabilita rychlosti a RMS ve třech pásmech (celkové, pumpovací pásmo, vysokofrekvenční).",
      "**7 z dráhy GPS**: změna rychlosti za 1/3/5 s, délka dráhy, čisté posunutí, **přímočarost** (čisté/dráha) a změna kurzu. Tyto směrové příznaky byly v experimentu největší pákou — udrží klidné fáze klouzání uvnitř jízdy, místo aby ji rozkouskovaly.",
    ],
    p2: "Fígl je v **kontextu**: každá sekunda se neklasifikuje izolovaně, ale spolu se **±5 sousedními sekundami** (tzv. „windowize“). Příznakový vektor jedné sekundy je tedy 14 × 11 = 154 čísel dlouhý. Tak model vidí průběh — krátký propad rychlosti uprostřed cruisu se nevyhodnotí hned jako „venku“. To snížilo fragmentaci z 1,10× na 1,00× a F1 skóre z **0,93 na 0,97**.",
    cap: "Na každou sekundu 14prvkový příznakový vektor; pro klasifikaci se připojí ±5 sousedních sekund (label středu). RandomForest hlasuje → foil / ne-foil.",
    featNote: "sekundové okno: 14 příznaků na sekundu, ±5 s kontext",
    forest: "RandomForest (většina)",
    maskNote: "maska po sekundách: foil ▮ / ne-foil ▯",
  },
  seg: {
    h: "Od masky k jízdám",
    p: "Sekundová maska je ještě děravá. Vytvaruje se do čistých **jízd**:",
    li: [
      "**Zavření krátkých mezer** (do ~2 s): pauza při klouzání jízdu nerozdělí.",
      "**Fyzikální práh**: pod ~9 km/h žádný foil nenese, a bez skutečného pohybu polohy (ne jen pole rychlosti) člověk na foilu není — obojí odřízne měkké okraje.",
      "**Minimální délka a průměrná rychlost**: segmenty pod 5 s nebo s příliš nízkým průměrem vypadnou (rychlá chůze ≠ foilování).",
      "**Výpadek GPS rozděluje**: mezera ve vzorcích > 15 s (hodinky pod vodou/pád) ukončí jízdu — čas mezery se nepočítá jako čas jízdy.",
      "**Sloučení „bez zastávky“**: pokud rychlost mezi dvěma rozpoznanými jízdami **nikdy** neklesla pod ~5,4 km/h a nedošlo k výpadku, šlo ve skutečnosti o **jednu** jízdu (výpadek modelu) → sloučit, ať je jakkoli dlouhá.",
    ],
    p2: "Bez použitelného zrychlení (GPS-only) přebírá řízení **stavový automat** s **hysterezí** a **dwell**: „foilujícím“ se člověk stane teprve po několika sekundách v rychlostním pásmu *při hladké rychlosti* (klouzání je hladké, pádlování sekané) — a stav opustí až po několika sekundách pod ním. Dva prahy (dovnitř/ven) brání blikání na hranici.",
    cap: "Nahoře: děravá sekundová maska se mění na jízdy (zavření mezer, slučování, zahození krátkých segmentů). Dole: hystereze GPS stavového automatu — dovnitř až nad prahem, ven až pod prahem, s dobou zdržení (dwell).",
    maskLabel: "maska (po sekundách)",
    runs: "jízdy",
    run1: "jízda 1 (mezery zavřené)",
    run2: "jízda 2",
    tooShort: "· příliš krátké → zahozeno",
    hyst: "hystereze + dwell (GPS záloha)",
    enter: "ENTER ~10 km/h",
    exit: "EXIT ~9 km/h",
  },
  se: {
    h: "Start a konec — s přesností na zlomek sekundy",
    p: "Model pracuje v sekundovém rastru, ale **naskočení** je ostrá událost. Proto se start jízdy přichytí k **impulsu skoku**: velmi silná špička velikosti (> 3,5× 95. percentil — v experimentu ležel skok na ~4,3×, pumpnutí jen na ~2,3×, tedy jasně oddělitelné). Nejranější takový impuls v okně ±pár sekund označí skutečný odraz — interpolovaný s přesností na zlomek sekundy mezi dvěma body GPS. Pokud impuls chybí, server posune start podle rampy zrychlení zpět až k poslednímu kvazi-zastavení.",
    p2: "Na **konci** číhají dvě pasti: **drift mrtvého navádění** (hodinky se potopí, extrapolují GPS a „driftují“ na souš) se zahodí — prior: jízda nikdy nekončí více k pevnině než její start. A kde je známá **vodní plocha z OSM**, musí start i konec ležet **ve vodě** (bod v polygonu pomocí ray-castingu), jinak se ořízne zpět na poslední skutečný vzorek na vodě. Nakonec se konec ještě klasifikuje jako **pád** (náhlý propad rychlosti z „na foilu“ na „ve vodě“, nebo výpadek GPS) nebo **kontrolované zastavení**.",
    cap: "Rozpoznaný sekundový start (šedě) se přichytí k ostrému impulsu naskočení ve velikosti zrychlení (azurově) — skutečný start na foilu.",
    thr: "3,5 × p95 (práh skoku)",
    secStart: "sekundový start",
    snapped: "← přichyceno k naskočení",
    afterPump: "poté: rytmus pumpování",
  },
  pump: {
    h: "Počítání pumpnutí — vedené kadencí (v3)",
    p: "Nasnadě ležící cesta — „spočítej všechny špičky nad prahem amplitudy“ — **strukturálně podhodnocuje asi 2×**: vybere jen největší výkyvy a menší, rytmická pumpnutí mezi nimi spolkne. Proti **pravdě** (mé naťukané pravdě o pumpnutích, viz níže) to trefilo jen ~40 %.",
    p2: "Lepší přístup je **vedený kadencí**: v rytmických, energeticky bohatých úsecích odhadne lokální FFT **okamžitou frekvenci pumpování** a pak se **na jednu periodu kadence vybere právě jedno** skutečné lokální maximum jako pumpnutí. Kadence je lokálně adaptivní, sleduje tedy změny tempa. Výsledek: **85–94 %** zásahů místo 40 % — a počítadlo i značky na mapě jsou automaticky konzistentní (obojí ze stejných poloh). RMS gate brání tomu, aby se počítaly bezrytmové fáze klouzání.",
    cap: "Práh amplitudy (nahoře) vidí jen tlusté špičky. Vedené kadencí (dole): odhadnout lokální periodu T, na každou periodu vybrat skutečné maximum — i jemná pumpnutí.",
    top: "práh amplitudy — spolkne malá pumpnutí",
    bot: "vedené kadencí — jedna špička na periodu T",
  },
  glide: {
    h: "Fáze klouzání — ticho mezi pumpnutími",
    p: "Přesně to, co část 1 označila za největší potenciál, teď vypadne skoro zadarmo: jsou-li známé časy pumpnutí, jsou **fáze klouzání prostě mezery mezi nimi** — plus náběh od startu jízdy k prvnímu pumpnutí (*lead*) a dojezd od posledního pumpnutí ke konci (*tail*). Z toho vypadne na jízdu **počet**, **průměrná doba klouzání** a **nejdelší fáze klouzání** — ukazatel toho, jak efektivně foil drží setrvačnost.",
    cap: "Pumpnutí (značky) dělí jízdu; mezery mezi nimi jsou fáze klouzání. lead = start→1. pumpnutí, tail = poslední pumpnutí→konec. Dlouhý tail = čistý dojezd.",
    start: "start",
    end: "konec",
    pumps: "pumpnutí",
    lead: "lead",
    tail: "tail (klouzání)",
    gaps: "mezery = fáze klouzání",
  },
  gpsonly: {
    h: "Bez zrychlení: GPS-only a jeho úskalí",
    p: "Importované relace (např. z Polaru) nebo hodinky s příliš hrubou frekvencí **nemají použitelné zrychlení**. Pak nese jen GPS — a to má své mouchy:",
    li: [
      "**Jednotlivé spiky** (dopplerovský glitch, „teleport“): nahrazeny lokálním mediánem, resp. skoky tam-a-zpět vyhlazeny.",
      "**Několikasekundové dopplerovské bursty** (~3 s na 50 km/h, ale pod prahem glitche 90 km/h): nahrazeny robustním **15s mediánem** — ten je vůči krátkým burstům necitlivý, kdežto skutečná držená jízda ho zvedne s sebou a zůstane nedotčená. Dvě podmínky (relativně nad mediánem **a** absolutně nad ~28 km/h) chrání skutečné jízdy.",
      "**30km/h pumpfoilový gate**: bez zrychlení nelze pumpfoil spolehlivě oddělit od poháněného foilování (kite/vítr/wake). Leží-li vyhlazená maximální rychlost nad 30 km/h, považuje se relace za poháněnou → **žádný** pumpfoil. Se zrychlením tento gate odpadá — tam vyhodnocení věří signálu pumpnutí/jízdy na foilu.",
    ],
  },
  label: {
    h: "Odkud se bere pravda — ťukání do pumpnutí",
    p: "Model potřebuje **pravdu**, proti které se počítadlo pumpnutí vedené kadencí kalibruje — a tu si aktuálně naťukám sám. Dívám se na **video** jedné jízdy a **při každém skutečném pumpnutí ťuknu** na tlačítko. Dělám to na **více pokusů**; ty se přes křížovou korelaci sečtou do **konsensu** (malé posuny reakční doby se zprůměrují). Výsledek: skutečný počet pumpnutí a skutečné časování na jízdu. Je to záměrně **přechodné řešení** — dost přesné na dnešní kalibraci, ale naťukané ručně.",
    p2: "Při kalibraci proti takovým labelům je důležité: **GroupKFold** místo běžné křížové validace. Sousední sekundy téže jízdy jsou téměř identické — kdyby padly zároveň do trénovací i testovací množiny, model by se sám sebe ptal (leakage) a hlásil vysněné hodnoty. GroupKFold proto drží **celé relace** pohromadě: testuje se vždy na jízdách, které model nikdy neviděl.",
    cap: "Koloběh: **naťukaná** pravda o pumpnutích → features → RandomForest → foil_rf.pkl → vyhodnocení každé relace. Nové ťuky se vracejí zpět, model se překalibruje.",
    fits: ["Ťukání do pumpnutí", "video · více pokusů"],
    feats: ["Features", "14 × ±5 s kontext"],
    rf: ["RandomForest", "GroupKFold-CV"],
    pkl: ["foil_rf.pkl", "→ každá relace"],
    loopNote: "nové naťukané jízdy → překalibrovat",
  },
  x5: {
    h: "Další krok — skutečná pravda z kamery (Insta360 X5)",
    p: "Ťukání je dost dobré na rozjezd, ale visí na mé reakční době. **Fyzikálně přesná** pravda přijde jako další z **kamery na prkně**: Insta360 X5 natáčí stěžeň/foil, a z videa se **s přesností na snímek** vyčte, kdy je foil opravdu pod tlakem a kdy letí. Tím kalibrujeme časování pumpnutí a detekci jízdy na foilu proti skutečné fyzice místo proti naťukanému přiblížení. Jakmile bude sestava hotová, přibude tu vlastní sekce s celým nastavením kamery.",
  },
  summary: {
    h: "Celá cesta v jedné větě",
    p1: "Surové int16 zrychlení → **velikost** → **vertikála proti gravitaci** → **FFT pásmová propust** v sliding window → 14 příznaků na sekundu s **±5 s kontextem** → **RandomForest** řekne na foilu/ne → **segmentace** na jízdy (hystereze, slučování, výpadek) → start přichycen k **impulsu naskočení**, konec opraven proti **vodní ploše** a driftu → **kadencí vedené** počítání pumpnutí → fáze klouzání jako mezery → ukazatele.",
    p2: "A to vše z **jedněch hodinek na zápěstí** — hodinky na stěžni z části 1 byly jen referencí, která ukazuje, že to sedí.",
  },
  limits: {
    h: "Meze (i nadále poctivě)",
    p: "Hodinky sedí na zápěstí, ne na prkně — paže mávají kvůli balancování a překrývají signál pumpnutí („wrist confound“). Vertikála se odhaduje ze směru gravitace (žádný gyroskop) a při trvalém zrychlení je lehce zkreslená. Počítadlo vedené kadencí je kalibrované proti pravdě z aplikace a videa, ale **fyzická** koncová kalibrace (kamera na prkně, Insta360 X5) teprve přijde. A GPS-only gaty jsou kompromis: raději poctivě „gps_only, pumpnutí n/a“ než vymyšlená čísla.",
  },
};

// Partial (siehe nerd1): fehlende Sprachen fallen im Consumer auf `de` zurück.

const id: N2 = {
  "back": "← Analisis Nerd (Bagian 1: eksperimen)",
  "h1": "Analisis Nerd · Bagian 2",
  "subtitle": "Bagaimana angka-angka sensor mentah menjadi pompa, lari on-foil, awal/akhir dan fase glide — pemrosesan sinyal, sliding-window, model ML dan pelabelan, satu demi satu.",
  "intro": "Di [Bagian 1](/nerd-analysen) semuanya tentang **kebenaran**: jam tangan kedua di mast foil, yang mengungkap apa yang benar-benar dilakukan foil. Di sini tentang **mesin**: apa yang dihitung server agar dari sinyal bergoyang di pergelangan tangan menjadi evaluasi sesi yang bersih. Semuanya berikut terjadi **di sisi server** — jam tangan hanya perekam tipis.",
  "raw": {
    "h": "Apa yang tiba: data mentah",
    "p": "Setiap sesi terdiri dari dua aliran, keduanya dengan basis waktu bersama (ms dari awal perekaman):",
    "li": [
      "**GPS**, sekitar **1 Hz**: per sampel `[t_ms, lat, lon, speed_mps, hr_bpm, h_acc_m]`. Kecepatan dan nadi dapat hilang (kemudian berasal dari posisi atau kosong).",
      "**Akselerasi**, tergantung jam tangan **10–100 Hz**: array `int16` dengan bentuk `(N × 3)` — X/Y/Z dalam penghitung mentah. Sebuah `accel_scale` (penghitung per g) mengubahnya menjadi g fisik."
    ],
    "p2": "Mengapa `int16` bukan float? Bandwidth. 100 Hz × 3 sumbu × 8 jam adalah jutaan nilai — sebagai bilangan bulat 2-byte menguranginya setengahnya ukuran upload. Penskalaan kembali ke g terjadi di server."
  },
  "pipe": {
    "h": "Pipeline sekilas",
    "p": "Dua trek pemrosesan (GPS + Accel) masuk ke model ML yang memutuskan **per detik** \"di foil — ya/tidak\". Dari sini menjadi lari berkesinambungan, yang awal/akhirnya disetel dengan baik, dan akhirnya pompa & fase glide per lari:",
    "cap": "Evaluasi lengkap: dari dua aliran data mentah melalui masker foiling menjadi lari, pompa dan fase glide.",
    "gps": [
      "GPS  ~1 Hz",
      "t, lat, lon, kecepatan, hr, h_acc"
    ],
    "accel": [
      "Akselerasi  10–100 Hz",
      "int16 (N×3) · accel_scale"
    ],
    "gpsPrep": [
      "Persiapkan GPS",
      "Filter spike/Doppler · merata-ratakan · kecepatan"
    ],
    "accelPrep": [
      "Persiapkan akselerasi",
      "Magnitudo → vertikal · bandpass FFT"
    ],
    "model": [
      "Model foil ML — RandomForest, ±5 s konteks",
      "Fallback tanpa akselerasi: mesin-status GPS (histeresis + dwell)"
    ],
    "mask": [
      "Masker foiling",
      "foil / bukan-foil — per detik"
    ],
    "seg": [
      "Segmentasi → lari",
      "Tutup celah · gabung · awal/akhir snap"
    ],
    "pumps": [
      "Pompa hitung",
      "terpimpin-kadence, per lari"
    ],
    "glide": [
      "Fase glide",
      "Celah antara pompa"
    ]
  },
  "mag": {
    "h": "Langkah 1 — magnitudo bukan sumbu",
    "p": "Jam tangan duduk di pergelangan tangan dan terus berputar — ketiga sumbu X/Y/Z menunjuk ke arah yang berbeda sepanjang waktu. Nilai sumbu tunggal tidak berharga. Penyelamatannya adalah **magnitudo** vektor:",
    "formula": "|a| = √(x² + y² + z²) / accel_scale",
    "p2": "Magnitudo adalah **orientation-invariant**: tidak peduli jam tangan diputar bagaimana, dorakan 2-g tetap dorakan 2-g. Ini membuat sinyal pertama kali sebanding (`magnitude_g`).",
    "cap": "Tiga sumbu individual yang tidak berarti (jam tangan terus berubah) bersama-sama menghasilkan magnitudo yang stabil dan orientation-invariant |a|.",
    "label": "|a| = √(x²+y²+z²)"
  },
  "vert": {
    "h": "Langkah 2 — dari pergelangan tangan ke vertikal",
    "p": "Magnitudo punya kelemahan: pompa adalah **dorakan ke atas**, tetapi `|a|` menghitung stroke bawah sama seperti stroke atas — setiap pompa muncul dua kali. Lebih baik adalah **akselerasi vertikal asli terhadap gravitasi**. Dan itu dapat direkonstruksi, tanpa giroskop sama sekali:",
    "ol": [
      "**Arah gravitasi** berubah perlahan saja → estimasi per sumbu via **low-pass** (< 0,25 Hz). Ini memberikan vektor `g`, yang selalu menunjuk \"ke bawah\".",
      "**Akselerasi dinamis** adalah `a − g`.",
      "Proyeksikan ini pada **vektor satuan arah gravitasi** → sinyal skalar: > 0 = ke atas (dorakan)."
    ],
    "f1": "v(t) = (a − g) · ĝ",
    "fMid": "dengan",
    "f2": "ĝ = g / |g|",
    "cap": "Gravitasi yang bergeser perlahan g (low-pass) memisahkan orientasi dari dinamika. Akselerasi dinamis a−g, diproyeksikan pada ĝ, memberikan dorakan ke atas yang bersih per pompa.",
    "gLabel": "g (gravitasi)",
    "aLabel": "a (terukur)",
    "amg": "a − g",
    "topNote": "|Magnitudo|: setiap pompa dua kali",
    "botNote": "v(t) terhadap gravitasi: satu dorakan per pompa"
  },
  "win": {
    "h": "Langkah 3 — Sliding-Window & Bandpass FFT",
    "p": "Memompa adalah **berirama** — dan ritme hidup dalam domain frekuensi. Itulah mengapa **jendela geser** (biasanya 4 detik lebar, langkah 2 detik) meluncur di atas sinyal, dan untuk setiap jendela **FFT** menghitung spektrum. Dua band penting:",
    "li": [
      "**Filter-band 0,3–3 Hz** — segala sesuatu di bawahnya adalah gravitasi/drift, di atasnya adalah kebisingan percikan. Keduanya dinolkan via bandpass FFT (`bandpass_fft`).",
      "**Pump-band 0,5–2 Hz** — di sini kadence pompa hidup (30–120 pompa/min)."
    ],
    "p2": "Per jendela empat fitur jatuh:",
    "li2": [
      "**dom_freq** — frekuensi dominan dalam pump-band (laju pompa)",
      "**band_power_ratio** — proporsi energi dalam pump-band ke band-total (tinggi = ritme jelas)",
      "**rms** — kekuatan sinyal (amplitudo gerakan)",
      "**spectral_entropy** — betapa \"teraturnya\" spektrum (rendah = satu frekuensi jelas = memompa; tinggi = kekacauan = kebisingan/glide)"
    ],
    "cap": "Jendela 4-detik meluncur di atas sinyal yang disaring (langkah 2 detik → tumpang tindih). Untuk setiap jendela FFT memberikan spektrum; energi dalam pump-band 0,5–2 Hz mengungkapkan laju dan ritme.",
    "winT": "Jendela t",
    "winT1": "Jendela t+1",
    "sig": "v(t) — bandpass-disaring (0,3–3 Hz)",
    "fft": "FFT",
    "spec": "Spektrum",
    "band": "0,5–2 Hz",
    "freq": "Frekuensi →"
  },
  "rate": {
    "h": "Detail nerd: laju sampel asli",
    "p": "Beberapa jam tangan **berbohong** tentang laju mereka. Forerunner 55 menandai \"10 Hz\", tetapi benar-benar hanya memberikan ~2,5 Hz. Fitur frekuensi dan kadence pompa akan menjadi sampah. Itulah mengapa server menentukan laju **generik dari data itu sendiri**: `real_Hz = count_Accel-samples / GPS-duration`. Jika berbeda > 25% dari yang ditandai, laju terukur berlaku. Dan jika **di bawah 15 Hz**, sinyal terlalu kasar untuk analisis frekuensi → sesi dievaluasi sebagai **GPS-only** (pompa n/a, sebagai gantinya batas jujur bukan nilai fantasi)."
  },
  "ml": {
    "h": "Di mana saya di foil? — model ML",
    "p": "Apakah Anda **di foil** dalam satu detik diputuskan oleh **RandomForest** — hutan pohon keputusan yang memilih dengan mayoritas. Kecil dan dapat ditafsirkan, tidak perlu deep learning. Per detik mendapat **14 fitur**:",
    "li": [
      "**7 dari kecepatan & akselerasi**: kecepatan sekarang / 3 detik / 5 detik (median), variabilitas kecepatan, plus RMS di tiga band (keseluruhan, pump-band, frekuensi tinggi).",
      "**7 dari jalur GPS**: perubahan kecepatan selama 1/3/5 detik, panjang jalur, offset bersih, **lurus** (bersih/jalur) dan perubahan heading. Fitur arah ini adalah leverage terbesar dalam eksperimen — mereka memegang fase glide tenang dalam lari, bukan merobek-robek."
    ],
    "p2": "Tricknya adalah **konteks**: setiap detik tidak diklasifikasikan secara terisolasi, tetapi bersama **±5 detik tetangga** (\"Windowize\"). Vektor fitur dari satu detik jadi 14 × 11 = 154 angka panjang. Jadi model melihat perjalanan — penurunan kecepatan pendek di tengah cruise tidak langsung dinilai sebagai \"keluar\". Ini membawa fragmentasi dari 1,10× ke 1,00× dan skor F1 dari **0,93 ke 0,97**.",
    "cap": "Per detik vektor fitur 14er; untuk klasifikasi detik tetangga ±5 ditambahkan (pusat-label). RandomForest memilih → foil / bukan-foil.",
    "featNote": "Jendela detik: 14 fitur per detik, ±5 detik konteks",
    "forest": "RandomForest (mayoritas)",
    "maskNote": "Masker per detik: foil ▮ / bukan-foil ▯"
  },
  "seg": {
    "h": "Dari masker ke lari",
    "p": "Masker detik masih berlubang. Dibentuk menjadi **lari** yang bersih:",
    "li": [
      "**Tutup celah pendek** (hingga ~2 detik): jeda glide tidak memisahkan lari.",
      "**Floor fisika**: di bawah ~9 km/jam tidak ada foil yang menahan, dan tanpa gerakan posisi asli (bukan hanya field kecepatan) Anda tidak di foil — keduanya memotong tepi lembut.",
      "**Panjang minimum & kecepatan rata-rata**: segmen di bawah 5 detik atau dengan rata-rata terlalu rendah terbang (berjalan cepat ≠ foiling).",
      "**GPS-dropout memisahkan**: celah sampel > 15 detik (jam tangan di bawah air/jatuh) mengakhiri lari — waktu celah tidak dihitung sebagai waktu mengemudi.",
      "**Penggabungan \"tanpa-henti\"**: jika kecepatan antara dua lari yang dikenali **tidak pernah** turun di bawah ~5,4 km/h dan tidak ada dropout, itu adalah **satu** lari sebenarnya (model-skip) → gabungkan, tidak peduli seberapa lama."
    ],
    "p2": "Tanpa akselerasi yang dapat digunakan (GPS-only) **mesin-status** dengan **histeresis** dan **dwell** menangani: Anda menjadi \"foiling\" hanya setelah beberapa detik dalam band kecepatan *dengan kecepatan mulus* (glide mulus, dayungan choppy) — dan meninggalkan keadaan hanya setelah beberapa detik di bawahnya. Dua ambang (masuk/keluar) mencegah berkedip di batas.",
    "cap": "Atas: masker detik berlubang menjadi lari (celah ditutup, digabungkan, segmen pendek dibuang). Bawah: histeresis mesin-status GPS — masuk hanya di atas, keluar hanya di bawah, dengan waktu tahan (dwell).",
    "maskLabel": "Masker (per detik)",
    "runs": "Lari",
    "run1": "Lari 1 (celah ditutup)",
    "run2": "Lari 2",
    "tooShort": "· terlalu pendek → dibuang",
    "hyst": "Histeresis + dwell (fallback GPS)",
    "enter": "MASUK ~10 km/h",
    "exit": "KELUAR ~9 km/h"
  },
  "se": {
    "h": "Awal & akhir — presisi sub-detik",
    "p": "Model bekerja dalam grid detik, tetapi **lompatan** adalah acara yang tajam. Jadi awal lari di-snap ke **impuls lompatan**: puncak magnitudo yang sangat kuat (> 3,5× persentil ke-95 — dalam eksperimen lompatan sekitar ~4,3×, pompa hanya ~2,3×, jadi jelas dapat dipisahkan). Impuls tercepat seperti itu dalam jendela ±beberapa detik menandai takeoff asli — presisi sub-detik di antara dua titik GPS yang diinterpolasi. Jika impuls hilang, server menarik awal melalui rampa akselerasi hingga berhenti quasi-terakhir.",
    "p2": "Di **akhir** dua jebakan bersembunyi: **dead-reckoning-drift** (jam tangan menyelam, mengekstrapolasi GPS dan \"melayang\" ke darat) dibuang — prioritas: lari tidak pernah berakhir lebih jauh darat dari awalnya. Dan di mana **permukaan air OSM** diketahui, awal dan akhir harus **di air** (point-in-polygon via ray-casting), atau dipotong kembali ke sampel air terakhir yang asli. Akhirnya akhir diklasifikasikan sebagai **jatuh** (penurunan kecepatan mendadak dari \"di foil\" ke \"di air\", atau GPS-dropout) atau **berhenti terkontrol**.",
    "cap": "Awal detik yang dikenali (abu-abu) di-snap ke impuls takeoff yang tajam dalam magnitudo akselerasi (cyan) — awal foil yang benar.",
    "thr": "3,5 × p95 (ambang lompatan)",
    "secStart": "Awal detik",
    "snapped": "← di-snap ke takeoff",
    "afterPump": "setelah: ritme pompa"
  },
  "pump": {
    "h": "Pompa hitung — terpimpin-kadence (v3)",
    "p": "Cara yang jelas — \"hitung semua puncak di atas ambang amplitudo\" — **secara struktural kurang ~2×**: hanya mengambil dorongan terbesar dan melewatkan yang lebih kecil, ritme pompa di antaranya. Melawan **kebenaran** (pompa kebenaran yang saya ketik, lihat di bawah) hanya mengenai ~40%.",
    "p2": "Pendekatan yang lebih baik adalah **terpimpin-kadence**: dalam bagian yang berirama dan penuh energi, FFT lokal mengestimasi **frekuensi pompa seketika**, dan kemudian **per periode kadence tepat satu** maksimum lokal asli dipilih sebagai pompa. Kadence adaptif-lokal, jadi mengikuti perubahan tempo. Hasil: **85–94%** hit bukan 40% — dan penghitung dan penanda peta secara otomatis konsisten (keduanya dari posisi yang sama). Gate RMS mencegah fase glide tanpa ritme dari dihitung.",
    "cap": "Ambang amplitudo (atas) hanya melihat puncak tebal. Terpimpin-kadence (bawah): estimasi periode lokal T, ambil maksimum asli per periode — bahkan pompa lembut.",
    "top": "Ambang amplitudo — melewatkan pompa kecil",
    "bot": "Terpimpin-kadence — satu puncak per periode T"
  },
  "glide": {
    "h": "Fase glide — ketenangan antara pompa",
    "p": "Persis apa yang bagian 1 sebut potensi terbesar, sekarang hampir gratis: dengan waktu pompa diketahui, **fase glide adalah celah di antaranya** — plus pendekatan dari awal lari ke pompa pertama (*lead*) dan peluncuran dari pompa terakhir ke akhir (*tail*). Dari ini per lari jatuh **angka**, **rata-rata durasi glide** dan **fase glide terpanjang** — penanda efisiensi berapa baik foil mempertahankan momentum.",
    "cap": "Pompa (penanda) membagi lari; celah di antaranya adalah fase glide. lead = awal→pompa 1., tail = pompa terakhir→akhir. tail panjang = peluncuran bersih.",
    "start": "Awal",
    "end": "Akhir",
    "pumps": "Pompa",
    "lead": "lead",
    "tail": "tail (glide)",
    "gaps": "Celah = fase glide"
  },
  "gpsonly": {
    "h": "Tanpa akselerasi: GPS-only & jebakan-nya",
    "p": "Sesi yang diimpor (mis. dari Polar) atau jam tangan dengan laju terlalu kasar **tidak punya akselerasi yang dapat digunakan**. Kemudian hanya GPS yang mengangkut — dan itu punya kecacatan:",
    "li": [
      "**Spike tunggal** (glitch Doppler, \"teleport\"): diganti terhadap median lokal atau lompatan keluar-dan-kembali dirata-ratakan.",
      "**Doppler-bursts multi-detik** (~3 detik pada 50 km/h, tetapi di bawah ambang glitch 90 km/h): diganti terhadap **median 15-detik** yang robust — itu tidak sensitif terhadap burst pendek, lari nyata yang tertahan mengangkatnya dan tetap tidak tersentuh. Dua kondisi (relatif di atas median **dan** absolut di atas ~28 km/h) melindungi lari nyata.",
      "**Gate 30-km/h pumpfoil**: tanpa akselerasi Anda tidak dapat memisahkan pumpfoil dengan aman dari foiling bertenaga (layang/angin/wake). Jika kecepatan teratas yang dirata-ratakan di atas 30 km/h, sesi dihitung sebagai bertenaga → **bukan** pumpfoil. Dengan akselerasi gate ini hilang — evaluasi mempercayai sinyal pompa/on-foil."
    ]
  },
  "label": {
    "h": "Dari mana kebenaran datang — pompa mengetuk",
    "p": "Model membutuhkan **kebenaran**, yang terhadapnya penghitung pompa terpimpin-kadence dikalibrasi — dan saat ini saya mengetuk sendiri. Saya menonton **video** lari dan **ketuk setiap pompa asli** pada tombol. Saya melakukan ini dalam **beberapa pengambilan**; ini dikomputasikan via cross-korelasi menjadi **konsensus** (offset waktu reaksi kecil rata-rata). Hasil: angka pompa asli dan waktu tepat per lari. Ini dengan sengaja **transisi** — cukup akurat untuk dikalibrasi hari ini, tetapi diketuk dengan tangan.",
    "p2": "Penting saat kalibrasi terhadap label seperti itu: **GroupKFold** bukan validasi silang normal. Detik tetangga dari lari yang sama hampir identik — jika mendaratkan di train dan set test secara bersamaan, model akan menanyakan dirinya sendiri (kebocoran) dan melaporkan nilai mimpi. GroupKFold jadi memegang **sesi lengkap** bersama: diuji selalu pada lari yang tidak pernah dilihat model.",
    "cap": "Lingkaran: kebenaran pompa yang **diketuk** → fitur → RandomForest → foil_rf.pkl → evaluasi setiap sesi. Ketukan baru mengalir kembali, model dikalibrasi ulang.",
    "fits": [
      "Pompa ketuk",
      "Video · beberapa pengambilan"
    ],
    "feats": [
      "Fitur",
      "14 × ±5 detik konteks"
    ],
    "rf": [
      "RandomForest",
      "GroupKFold-CV"
    ],
    "pkl": [
      "foil_rf.pkl",
      "→ setiap sesi"
    ],
    "loopNote": "lari baru diketuk → kalibrasi ulang"
  },
  "x5": {
    "h": "Langkah selanjutnya — kebenaran asli per kamera (Insta360 X5)",
    "p": "Mengetuk cukup baik untuk bootstrap, tetapi bergantung pada waktu reaksi saya. **Kebenaran fisik yang tepat** datang selanjutnya dari **kamera di papan**: Insta360 X5 merekam mast/foil, dan dari video Anda membaca **frame-presisi** kapan foil benar-benar mendapat tekanan dan kapan ia terbang. Dengan ini kami menaikkan waktu pompa dan pengenalan on-foil terhadap fisika asli bukan perkiraan yang diketuk. Segera setup rig berdiri, bagian sendiri datang di sini dengan setup kamera lengkap."
  },
  "summary": {
    "h": "Seluruh jalan dalam satu kalimat",
    "p1": "Akselerasi int16 mentah → **magnitudo** → **vertikal terhadap gravitasi** → **bandpass FFT** dalam sliding-window → 14 fitur per detik dengan **±5 detik konteks** → **RandomForest** berkata on-foil/tidak → **segmentasi** ke lari (histeresis, gabung, dropout) → awal pada **impuls lompatan**, akhir terhadap **permukaan air** & drift diperbaiki → **pompa terpimpin-kadence** → fase glide sebagai celah → metrik.",
    "p2": "Dan itu semua dari **satu jam tangan pergelangan tangan** — jam tangan mast dari bagian 1 hanya referensi, menunjukkan itu benar."
  },
  "limits": {
    "h": "Batas (tetap jujur)",
    "p": "Jam tangan duduk di pergelangan tangan, bukan di papan — lengan berayun untuk menyeimbangkan dan tumpang tindih sinyal pompa (\"wrist-confound\"). Vertikal diestimasi dari arah gravitasi (tidak ada giroskop) dan sedikit terdistorsi di bawah akselerasi berkelanjutan. Penghitung terpimpin-kadence dikalibrasi terhadap kebenaran app dan video, tetapi **kalibrasi fisik** endgame (kamera di papan, Insta360 X5) masih tertunda. Dan gate GPS-only adalah kompromi: lebih baik jujur \"gps_only, pompa n/a\" daripada angka yang dibuat-buat."
  }
};


const ja: N2 = {
  "back": "← ナード向け分析（パート1：実験）",
  "h1": "ナード向け分析 · パート2",
  "subtitle": "生のセンサー数がポンプ、オンフォイルラン、スタート/エンド、グライド段階にどう変わるか — 信号処理、スライディングウィンドウ、MLモデル、ラベリングの全部、ちゃんと順番に。",
  "intro": "[パート1](/nerd-analysen)は**真実**についてでした：フォイルマストの2番目のウォッチが、フォイルが本当に何をしているかを明かします。これは**機械**についてです：サーバーが何を計算して、リスト上のジッターするシグナルをきれいなセッション分析に変えるか。以下のすべては**サーバー側**で起きます — ウォッチはただの薄いレコーダーです。",
  "raw": {
    "h": "何が来るか：生データ",
    "p": "各セッションは2つのストリームで構成され、両方とも共通の時間ベース（記録開始からのms）を持っています：",
    "li": [
      "**GPS**、約**1 Hz**：サンプルごと`[t_ms, lat, lon, speed_mps, hr_bpm, h_acc_m]`。スピードと心拍は欠落する可能性があります（その場合、位置から導出されるか、空のままです）。",
      "**加速度**、ウォッチによって**10～100 Hz**：`int16`配列の形`(N × 3)` — 生カウントでのX/Y/Z。`accel_scale`（カウント毎g）はそれらを物理的なgに変えます。"
    ],
    "p2": "なぜ浮動小数点ではなく`int16`？帯域幅。100 Hz × 3軸 × 8時間は数百万の値 — 2バイト整数として、アップロードサイズを半分にします。スケーリングはサーバーでのみ起きます。"
  },
  "pipe": {
    "h": "パイプラインを一目で",
    "p": "2つの前処理トラック（GPS + accel）はMLモデルに流入し、**秒単位**で「フォイル上 — はい/いいえ」を決定します。そこから連続ランが来て、そのスタート/エンドが微調整され、最終的にはランごとのポンプとグライド段階：",
    "cap": "完全な分析：2つの生データストリームからフォイリングマスク経由でランへ、ポンプとグライド段階へ。",
    "gps": [
      "GPS  ~1 Hz",
      "t, lat, lon, speed, hr, h_acc"
    ],
    "accel": [
      "加速度  10～100 Hz",
      "int16 (N×3) · accel_scale"
    ],
    "gpsPrep": [
      "GPS準備",
      "スパイク/ドップラーフィルタ · スムーズ化 · スピード"
    ],
    "accelPrep": [
      "Accel準備",
      "マグニチュード → 垂直 · FFT帯域通過"
    ],
    "model": [
      "MLフォイルモデル — RandomForest、±5秒コンテキスト",
      "Accel無し時フォールバック：GPS状態機械（ヒステリシス + dwell）"
    ],
    "mask": [
      "フォイリングマスク",
      "フォイル / 非フォイル — 秒単位"
    ],
    "seg": [
      "セグメンテーション → ラン",
      "ギャップを閉じる · マージ · スタート/エンドをスナップ"
    ],
    "pumps": [
      "ポンプカウント",
      "ケイデンス主導、ランごと"
    ],
    "glide": [
      "グライド段階",
      "ポンプ間のギャップ"
    ]
  },
  "mag": {
    "h": "ステップ1 — 軸ではなくマグニチュード",
    "p": "ウォッチはリスト上に座り、常に回転します — 3つの軸X/Y/Zは常に別の方向を指しています。単一の軸値は無意味です。救いは**ベクトルのマグニチュード**です：",
    "formula": "|a| = √(x² + y² + z²) / accel_scale",
    "p2": "マグニチュードは**方向不変**：ウォッチがどう回転されても、2 gの衝撃は2 gの衝撃のままです。これがシグナルを最初に比較可能にすることです（`magnitude_g`）。",
    "cap": "3つの個別に無意味な軸（ウォッチは常に傾く）は、安定した方向不変マグニチュード|a|をもたらします。",
    "label": "|a| = √(x²+y²+z²)"
  },
  "vert": {
    "h": "ステップ2 — リストから垂直へ",
    "p": "マグニチュードには落とし穴があります：ポンプは**上向きのプッシュ**ですが、`|a|`は下ろしも上げも同等にカウント — 各ポンプが2回現れます。より良いのは真の**重力に対する垂直加速度**です。そしてそれはジャイロスコープなしで再構成できます：",
    "ol": [
      "**重力方向**はゆっくりにしか変わりません → 軸ごと**ローパス**（< 0.25 Hz）で推定します。これはベクトル`g`をもたらし、常に「下」を指しています。",
      "**動的**加速度は`a − g`です。",
      "それを重力単位ベクトルに**投影** → スカラーシグナル：> 0 = 上向き（プッシュ）。"
    ],
    "f1": "v(t) = (a − g) · ĝ",
    "fMid": "with",
    "f2": "ĝ = g / |g|",
    "cap": "ゆっくりドリフトする重力g（ローパス）は方向を動的に分離します。動的加速度a−g、投影ĝされたもの、各ポンプの清潔な上向きプッシュをもたらします。",
    "gLabel": "g（重力）",
    "aLabel": "a（測定）",
    "amg": "a − g",
    "topNote": "|マグニチュード|：各ポンプが2回",
    "botNote": "v(t)重力に対して：ポンプごと1つのプッシュ"
  },
  "win": {
    "h": "ステップ3 — スライディングウィンドウ＆FFT帯域通過",
    "p": "ポンプ運動は**リズミカル** — そしてリズムは周波数領域に住んでいます。だから**スライディングウィンドウ**（典型的に4秒幅、2秒ごとに1ステップ）がシグナルを越えて移動し、各ウィンドウに対して**FFT**がスペクトラムを計算します。2つのバンドが重要：",
    "li": [
      "**フィルタバンド0.3～3 Hz** — その下はすべて重力/ドリフト、その上はすべてスプラッシュノイズ。両方ともFFT帯域通過経由で無効化されます（`bandpass_fft`）。",
      "**ポンプバンド0.5～2 Hz** — ここにポンプケイデンスが住みます（30～120ポンプ/分）。"
    ],
    "p2": "各ウィンドウは4つの機能を生成：",
    "li2": [
      "**dom_freq** — ポンプバンドの支配的周波数（ポンプレート）",
      "**band_power_ratio** — 全バンド対ポンプバンドのエネルギー割合（高 = 明確なリズム）",
      "**rms** — シグナル強度（動き振幅）",
      "**spectral_entropy** — スペクトラムがどれほど「整頓」されているか（低 = 1つの明確な周波数 = ポンプ；高 = カオス = ノイズ/グライド）"
    ],
    "cap": "4秒ウィンドウがフィルタされたシグナルを越えて移動します（2秒ステップ → オーバーラップ）。各ウィンドウに対してFFTはスペクトラムを配信；ポンプバンド0.5～2 Hzでのエネルギーはレートとリズムを明かします。",
    "winT": "ウィンドウ t",
    "winT1": "ウィンドウ t+1",
    "sig": "v(t) — 帯域通過フィルタされた（0.3～3 Hz）",
    "fft": "FFT",
    "spec": "スペクトラム",
    "band": "0.5～2 Hz",
    "freq": "周波数 →"
  },
  "rate": {
    "h": "ナード詳細：本当のサンプリングレート",
    "p": "いくつかのウォッチは**嘘をつき**ます。Forerunner 55は「10 Hz」とタグを付けますが、本当は約2.5 Hzだけ配信します。周波数機能とポンプケイデンスはゴミになります。だからサーバーはレートを**データ自体から一般的に**決定します：`real_Hz = accel_sample_count / GPS_duration`。タグから25%以上偏差がある場合、測定レートが適用されます。そして**15 Hz未満**の場合、シグナルは周波数分析には粗すぎます → セッションは**GPS只**として評価されます（ポンプN/A、しかし幻想値の代わりに正直な限界）。"
  },
  "ml": {
    "h": "フォイル上のどこにいるか？ — MLモデル",
    "p": "所定の秒にあなたが**フォイル上**にいるかどうかは**RandomForest** — 多数決で投票する決定木の森によって決定されます。小さく解釈可能で、ディープラーニングは必要ありません。各秒は**14の機能**を取得：",
    "li": [
      "**スピード＆Accelから7つ**：スピード今/3秒/5秒（中央値）、スピード変動性、プラス3つのバンドでのRMS（全体、ポンプバンド、高周波数）。",
      "**GPSトラックから7つ**：1/3/5秒のスピード変化、パス長、ネット変位、**直線性**（ネット/パス）およびコース変更。これらの方向特性は実験で最大のレバレッジ — ランをフラグメント化する代わりに、静かなグライド段階を保ちます。"
    ],
    "p2": "トリックは**コンテキスト**：各秒は分離して分類されるのではなく、**±5隣接秒**と一緒に（「ウィンドウ化」）。1秒の機能ベクトルは14 × 11 = 154の数値が長いです。そのようにモデルは軌跡を見る — 巡航中の短いスピード低下は「アウト」としてすぐカウントされません。これはフラグメント化を1.10×から1.00×に、F1スコアを**0.93から0.97**に持ちました。",
    "cap": "秒単位で1つの14機能ベクトル；分類の為に±5隣接秒が付け加えられます（中心ラベル）。RandomForestは投票 → フォイル / 非フォイル。",
    "featNote": "秒ウィンドウ：秒単位で14機能、±5秒コンテキスト",
    "forest": "RandomForest（多数決）",
    "maskNote": "秒単位マスク：フォイル ▮ / 非フォイル ▯"
  },
  "seg": {
    "h": "マスクからランへ",
    "p": "秒単位マスクはまだ穴だらけです。それはきれいな**ラン**に成形されます：",
    "li": [
      "**短いギャップを閉じます**（～2秒まで）：グライド一時停止はランを分割しません。",
      "**物理フロア**：～9 km/h以下でフォイルは持たず、実際の位置移動なし（スピードフィールドではなく）あなたはフォイル上にいません — 両方とも柔らかいエッジを削除します。",
      "**最小長＆平均スピード**：5秒以下のセグメント、または平均が低すぎるセグメントは削除（速い歩き ≠ フォイリング）。",
      "**GPS ドロップアウト分離**：サンプルギャップ > 15秒（水中ウォッチ/落下）はランを終了 — ギャップ時間は走行時間にカウントされません。",
      "**「ノーストップ」マージ**：2つの検出されたランの間でスピードが**決して** ~5.4 km/h以下に落ちず、ドロップアウトが無かった場合、実際には**1つ**のラン（モデル欠陥）→ マージ、長さに関わらず。"
    ],
    "p2": "使用可能な加速度なし（GPS只）は、**状態機械**が**ヒステリシス**と**dwell**で引き継ぎます：あなたはスピードバンド内で複数秒後のみ「フォイリング」になります*スムーズなスピード付き*（グライドはスムーズ、パドルはチョッピー） — そしてそれ以下で複数秒後のみ状態を離れます。2つの閾値（イン/アウト）は境界でのフリッカーを防ぎます。",
    "cap": "上：穴だらけの秒単位マスクはランに成形されます（ギャップを閉じる、マージ、短いセグメント削除）。下：GPS状態機械のヒステリシス — 上でのみ入る、下でのみ出る、保持時間付き（dwell）。",
    "maskLabel": "マスク（秒単位）",
    "runs": "ラン",
    "run1": "ラン1（ギャップ閉じた）",
    "run2": "ラン2",
    "tooShort": "· 短すぎる → 削除",
    "hyst": "ヒステリシス + dwell（GPSフォールバック）",
    "enter": "ENTER ~10 km/h",
    "exit": "EXIT ~9 km/h"
  },
  "se": {
    "h": "スタート＆エンド — 秒以下精度",
    "p": "モデルは秒単位グリッドで機能しますが、**テイクオフ**は鋭いイベントです。だからランスタートは**ジャンプインパルス**にスナップされます：非常に強いマグニチュードスパイク（> 95パーセンタイルの3.5倍 — 実験ではジャンプは~4.3倍、ポンプは~2.3倍、明確に分離可能）。ウィンドウ±数秒内の最初のそのようなインパルスが本当のテイクオフをマークします — 2つのGPSポイント間で秒以下に補間。インパルスが欠落すると、サーバーは開始を加速度ランプに沿って最後の準停止まで引き戻します。",
    "p2": "**エンド**で2つのトラップが待機：**デッドレコニングドリフト**（ウォッチがダイブ、GPSを外挿して「ドリフト」は陸地へ）は削除されます — 前提：ランはスタートより陸地的に終わりません。そして**OSM水面**が既知の場所では、スタートとエンドは**水中に**ある必要があります（レイキャスト経由のポイント-イン-ポリゴン）、そうでなければ最後の本当の水サンプルに戻されます。最後に、エンドは**落下**（「フォイル上」から「水中」へのスピード急低下、またはGPSドロップアウト）または**制御された停止**として分類されます。",
    "cap": "検出された秒単位スタート（灰色）は加速度マグニチュードの鋭いテイクオフインパルス（シアン）にスナップ — 本当のフォイルスタート。",
    "thr": "3.5 × p95（ジャンプ閾値）",
    "secStart": "秒単位スタート",
    "snapped": "← テイクオフにスナップ",
    "afterPump": "その後：ポンプリズム"
  },
  "pump": {
    "h": "ポンプカウント — ケイデンス主導（v3）",
    "p": "明白な方法 — 「振幅閾値以上のすべてのピークをカウント」 — **構造的に~2倍過少推定**：最大の揺れだけを拾い、間の小さいリズミカルポンプを飲み込みます。**真実**に対して（自分のタップされたポンプ真実、下を見てください）それは~40%だけ当たりました。",
    "p2": "より良いアプローチは**ケイデンス主導**：リズミカル、エネルギーリッチセクションでは、ローカルFFTが**瞬時ポンプ周波数**を推定し、その後**ケイデンス周期ごとに正確に1つ**の本当のローカル最大値がポンプとして選ばれます。ケイデンスはローカル適応型、したがってテンポ変化に従います。結果：~40%の代わりに**85～94%**ヒット率 — およびカウンタとマップマーカーは自動的に一貫（同じ位置から）。RMSゲートはリズムレスグライド段階がカウントされるのを防ぎます。",
    "cap": "振幅閾値（上）は脂肪ピークだけを見ます。ケイデンス主導（下）：ローカル周期Tを推定、周期ごとに本当の最大値を拾う — 穏やかなポンプも含む。",
    "top": "振幅閾値 — 小さいポンプを飲み込む",
    "bot": "ケイデンス主導 — 周期Tごと1つのピーク"
  },
  "glide": {
    "h": "グライド段階 — ポンプ間の沈黙",
    "p": "パート1が最大の可能性として名付けたもの、まさに今はほぼ無料で来ます：ポンプタイムスタンプが既知の場合、**グライド段階は単にそれらの間のギャップ** — プラスランスタートから最初のポンプまでのラン（*lead*）および最後のポンプからエンドまでのラン（*tail*）。そこから各ランの**数**、**平均グライド期間**および**最長グライド段階** — フォイルが勢いをどれほど効率的に保つかの指標が出ます。",
    "cap": "ポンプ（マーカー）はランを分割；間のギャップはグライド段階。lead = スタート→1番目ポンプ、tail = 最後のポンプ→エンド。長いtail = クリーンなラン終了。",
    "start": "スタート",
    "end": "エンド",
    "pumps": "ポンプ",
    "lead": "lead",
    "tail": "tail（グライド）",
    "gaps": "ギャップ = グライド段階"
  },
  "gpsonly": {
    "h": "Accel無し：GPS只と落とし穴",
    "p": "インポートセッション（例：Polar）または粗いレートのウォッチには**使用可能な加速度がありません**。その場合、GPSだけが持つ — そしてそれは奇癖を持つ：",
    "li": [
      "**単一スパイク**（ドップラーグリッチ、「テレポート」）：ローカル中央値に対して置き換えられる、またはアウト＆バックジャンプがスムーズ化。",
      "**複数秒ドップラーバースト**（50 km/hで~3秒、しかし90 km/hグリッチ閾値以下）：堅牢な**15秒中央値**に対して置き換え — これは短いバーストに無感受、本当の持続ランはそれを持ち上げて触れられず。2つの条件（中央値を相対的に超えて**そして**~28 km/h以上）は本当のランを保護。",
      "**30 km/h pumpfoilゲート**：accel無しで、pumpfoilingは動力フォイリング（凧/風/ウェーク）から確実に分離できません。スムーズ化されたトップスピードが30 km/h以上の場合、セッションは動力として数えられます → **pumpfoilingなし**。Accelでこのゲートは削除 — そこで分析はポンプ/オンフォイルシグナルを信頼。"
    ]
  },
  "label": {
    "h": "真実が来るところ — ポンプをタップ",
    "p": "モデルは**真実**が必要 — そして今、自分でそれをタップします。ランの**ビデオ**を見て、**本当の各ポンプでボタンをタップ**します。これを**複数回**でしますが、**コンセンサス**に交差相関で組み合わされます（反応時間小さなオフセット平均アウト）。結果：本当のポンプ数とランごとのタイミング。これは意図的に**つなぎ**です — 今日を較正するのに十分正確ですが、手がタップします。",
    "p2": "そのようなラベルに対して較正するとき重要：**GroupKFold**より通常クロス検証。同じランの隣接秒はほぼ同一 — 訓練とテストセット同時に着陸すると、モデルが自分自身をクイズに（漏洩）して夢値を報告。GroupKFoldしたがって**全セッション**を一緒に保つ：テストはモデルが決して見たことのないランで常に起こります。",
    "cap": "ループ：**タップされた**ポンプ真実 → 機能 → RandomForest → foil_rf.pkl → 各セッションの分析。新タップが逆流、モデルは再較正。",
    "fits": [
      "ポンプをタップ",
      "ビデオ · 複数回"
    ],
    "feats": [
      "機能",
      "14 × ±5秒コンテキスト"
    ],
    "rf": [
      "RandomForest",
      "GroupKFold-CV"
    ],
    "pkl": [
      "foil_rf.pkl",
      "→ 各セッション"
    ],
    "loopNote": "新しいタップされたラン → 再較正"
  },
  "x5": {
    "h": "次のステップ — カメラからの本当の真実（Insta360 X5）",
    "p": "タップはブートストラップするのに十分ですが、反応時間に頼ります。**物理的に正確な**真実は次にカメラから来ます**ボード上**：Insta360 X5がマスト/フォイルをフィルム、ビデオから**フレーム正確に**読み取る時フォイルが本当に圧力を得ていつフライしているか。それでポンプタイミングとオンフォイル検出をタップされた近似の代わりに本当の物理に対して較正。リグが立つと、ここにすべてのカメラセットアップを持つ専用セクションが来ます。"
  },
  "summary": {
    "h": "全パス1文で",
    "p1": "生int16加速度 → **マグニチュード** → **重力に対する垂直** → **スライディングウィンドウでFFT帯域通過** → 秒単位で14機能**±5秒コンテキスト付き** → **RandomForest**言う on-foil/not → ランへの**セグメンテーション**（ヒステリシス、マージ、ドロップアウト）→ スタートは**テイクオフインパルス**にスナップ、エンドは**水面**と ドリフトに対して修正 → **ケイデンス主導**ポンプカウント → グライド段階ギャップとして → 指標。",
    "p2": "そして全部が**単一のリストウォッチから** — パート1のマストウォッチは真実参照でしかありませんでした。"
  },
  "limits": {
    "h": "限界（いまだに正直）",
    "p": "ウォッチはリスト上に座り、ボード上ではなく — 腕はバランス用に揺れてポンプシグナル（「リスト混同」）をオーバーレイ。垂直は重力方向から推定（ジャイロなし）で、持続加速度下でやや歪み。ケイデンス主導カウンターはアプリとビデオ真実に対して較正されますが、**物理的な**最終較正（ボード上カメラ、Insta360 X5）はまだペンディング。そしてGPS只ゲートはトレードオフ：作り上げられた数より正直な「gps_only、ポンプN/A」。"
  }
};


const nb: N2 = {
  "back": "← Nerd-analyser (Del 1: forsøket)",
  "h1": "Nerd-analyser · Del 2",
  "subtitle": "Hvordan rå sensor-tall blir til pumps, on-foil-turer, start/slutt og glidfaser — signalbehandlingen, sliding-window, ML-modellen og labeling, pent i rekkefølge.",
  "intro": "I [Del 1](/nerd-analysen) handlet det om **sannheten**: en annen klokke på foil-masten som avslører hva foilen virkelig gjør. Her handler det om **maskineriet**: hva serveren regner ut slik at fra et ristende signal på håndleddet blir en ren session-analyse. Alt som følger skjer **server-side** — klokken er bare en tynn recorder.",
  "raw": {
    "h": "Hva som ankommer: rådata",
    "p": "Hver session består av to strømmer, begge med felles tidsbasis (ms fra opptak-start):",
    "li": [
      "**GPS**, ca. **1 Hz**: pr. sample `[t_ms, lat, lon, speed_mps, hr_bpm, h_acc_m]`. Speed og puls kan mangle (da hentet fra posisjonen eller tom).",
      "**Akselerasjon**, avhengig av klokke **10–100 Hz**: en `int16`-array av formen `(N × 3)` — X/Y/Z i råtellerere. En `accel_scale` (tellere per g) gjør det til fysikalsk g."
    ],
    "p2": "Hvorfor `int16` istedenfor floating-point? Båndbredde. 100 Hz × 3 akser × 8 timer er millioner av verdier — som 2-byte heltall halverer det opplastingsstørrelsen. Skalering tilbake til g skjer først på serveren."
  },
  "pipe": {
    "h": "Pipelinjen på et øyeblikk",
    "p": "To oppbehandlings-spor (GPS + Accel) går inn i en ML-modell som **per sekund** avgjør «på foilen — ja/nei». Fra det blir sammenhengende turer, der start/slutt finjusteres, og til slutt pumps & glidfaser per tur:",
    "cap": "Hele analysen: fra de to rådata-strømmene over foiling-masken til turer, pumps og glidfaser.",
    "gps": [
      "GPS  ~1 Hz",
      "t, lat, lon, speed, hr, h_acc"
    ],
    "accel": [
      "Akselerasjon  10–100 Hz",
      "int16 (N×3) · accel_scale"
    ],
    "gpsPrep": [
      "GPS oppberedt",
      "Spike-/Doppler-filter · utjevning · Speed"
    ],
    "accelPrep": [
      "Accel oppberedt",
      "Beløp → Vertikalt · FFT-båndpass"
    ],
    "model": [
      "ML-foil-modell — RandomForest, ±5 s kontekst",
      "Fallback uten Accel: GPS-tilstandsmaskin (hysterese + dwell)"
    ],
    "mask": [
      "Foiling-maske",
      "foil / ikke-foil — per sekund"
    ],
    "seg": [
      "Segmentering → Turer",
      "Lukk hull · flett · Start/slutt snap"
    ],
    "pumps": [
      "Tell pumps",
      "kadense-ledet, per tur"
    ],
    "glide": [
      "Glidfaser",
      "Hull mellom pumps"
    ]
  },
  "mag": {
    "h": "Steg 1 — Beløp istedenfor akser",
    "p": "Klokken sitter på håndleddet og snur seg hele tiden — de tre aksene X/Y/Z peker stadig andre steder. En enkelt aksiverdi er derfor verdiløs. Redningen er **beløpet** av vektoren:",
    "formula": "|a| = √(x² + y² + z²) / accel_scale",
    "p2": "Beløpet er **orienteringsinvariant**: uansett hvordan klokken snues, forblir et 2-g-støt et 2-g-støt. Dermed blir signalet i det hele tatt sammenlignbart (`magnitude_g`).",
    "cap": "Tre individuelle meningsløse akser (klokken kipper hele tiden) gir sammen et stabilt, orienteringsinvariant beløp |a|.",
    "label": "|a| = √(x²+y²+z²)"
  },
  "vert": {
    "h": "Steg 2 — fra håndleddet inn i vertikalen",
    "p": "Beløpet har en hake: en pump er en **oppover-push**, men `|a|` teller ned-strekk like mye som oppstrek — hver pump vises to ganger. Bedre ville være den virkelige **vertikale akselerasjonen mot tyngdekraften**. Og det kan rekonstrueres helt uten gyroskop:",
    "ol": [
      "**Tyngdekraft-retningen** endres bare sakte → ved **lavpassfilter** (< 0,25 Hz) per akse estimere. Det gir vektoren `g`, som alltid peker «nedover».",
      "Den **dynamiske** akselerasjonen er `a − g`.",
      "Projekt dette på tyngdekraft-enhetsvektor **projiser** → skalär signal: > 0 = oppover (Push)."
    ],
    "f1": "v(t) = (a − g) · ĝ",
    "fMid": "med",
    "f2": "ĝ = g / |g|",
    "cap": "Den sakte driftende tyngdekraften g (lavpassfilter) skiller orientering fra dynamikk. Den dynamiske akselerasjonen a−g, projisert på ĝ, gir en ren oppover-push per pump.",
    "gLabel": "g (tyngdekraft)",
    "aLabel": "a (målt)",
    "amg": "a − g",
    "topNote": "|Beløp|: hver pump dobbelt",
    "botNote": "v(t) mot tyngdekraft: en push per pump"
  },
  "win": {
    "h": "Steg 3 — Sliding-window & FFT-båndpass",
    "p": "Pumping er **rytmisk** — og rytme lever i frekvensrommet. Derfor skjøver en **gleitende vindu** (typ. 4 s bred, alle 2 s et steg) over signalet, og for hvert vindu regner en **FFT** spektret. To bånd er viktige:",
    "li": [
      "**Filter-bånd 0,3–3 Hz** — alt under det er tyngdekraft/drift, alt over det er splash-støy. Begge nuller ut per FFT-båndpass (`bandpass_fft`).",
      "**Pump-bånd 0,5–2 Hz** — her bor pump-kadensen (30–120 pumps/min)."
    ],
    "p2": "Per vindu faller fire trekk av:",
    "li2": [
      "**dom_freq** — dominantfrekvens i pump-båndet (pump-raten)",
      "**band_power_ratio** — andel av energien i pump-båndet av total-båndet (høy = klar rytme)",
      "**rms** — signalstyrke (amplitude av bevegelsen)",
      "**spectral_entropy** — hvor «ryddig» spektret er (lav = én klar frekvens = pumping; høy = kaos = støy/gliding)"
    ],
    "cap": "Et 4-s-vindu vandrer over det filtrerte signalet (steg 2 s → overlapping). For hvert vindu gir FFT ett spektrum; energien i pump-båndet 0,5–2 Hz avslørar rate og rytme.",
    "winT": "Vindu t",
    "winT1": "Vindu t+1",
    "sig": "v(t) — båndpass-filtrert (0,3–3 Hz)",
    "fft": "FFT",
    "spec": "Spektrum",
    "band": "0,5–2 Hz",
    "freq": "Frekvens →"
  },
  "rate": {
    "h": "En nerd-detalj: den virkelige samplingsraten",
    "p": "Noen klokker **lyver** om sin rate. En Forerunner 55 taggar «10 Hz», men leverer bare ~2,5 Hz i virkeligheten. Frekvens-trekk og pump-kadense ville være søppel. Derfor bestemmer serveren raten **generisk fra dataene selv**: `virkelig_Hz = Antall_Accel-samples / GPS-varighet`. Hvis det avviker > 25 % fra tagen, gjelder den målte raten. Og ligger den **under 15 Hz**, er signalet for grovt for frekvensanalyse → sesjonen blir vurdert som **GPS-only** (Pumps n/a, istedenfor fantasi-verdier)."
  },
  "ml": {
    "h": "Hvor er jeg på foilen? — ML-modellen",
    "p": "Om man i ett sekund **er på foilen**, avgjør en **RandomForest** — en skog av beslutningstrær som stemmer ved flertall. Liten og tolkbar, ingen deep learning nødvendig. Per sekund får den **14 trekk**:",
    "li": [
      "**7 fra Speed & Accel**: Speed nå / 3 s / 5 s (median), speed-variabilitet, samt RMS i tre bånd (totalt, pump-bånd, høyfrekvens).",
      "**7 fra GPS-stien**: Speed-endring over 1/3/5 s, stilengde, netto offset, **lineæritet** (netto/sti) og kursendring. Disse retnings-trekkene var den største spaken i forsøket — de holder stille glidesfaser i turen, istedenfor å knuse den."
    ],
    "p2": "Trikset er **konteksten**: hver sekund klassifiseres ikke isolert, men sammen med **±5 nabo-sekunder** («windowize»). Trekk-vektoren for ett sekund er altså 14 × 11 = 154 tall langt. Sånn ser modellen forløpet — en kort speed-dip midt i cruising blir ikke straks vurdert som «ute». Det bragte fragmentering fra 1,10× til 1,00× og F1-score fra **0,93 til 0,97**.",
    "cap": "Per sekund en 14-trekk vektor; for klassifikasjonen legges ±5 nabo-sekunder til (center-label). RandomForest stemmer → foil / ikke-foil.",
    "featNote": "Sekund-vindu: 14 trekk per sekund, ±5 s kontekst",
    "forest": "RandomForest (Flertall)",
    "maskNote": "Maske per sekund: foil ▮ / ikke-foil ▯"
  },
  "seg": {
    "h": "Fra masken til turer",
    "p": "Sekund-masken er fortsatt hullet. Den blir formet til reine **turer**:",
    "li": [
      "**Lukk korte hull** (opp til ~2 s): en glide-pause deler ikke en tur.",
      "**Fysikk-gulv**: under ~9 km/h bærer ingen foil, og uten reell posisjons-bevegelse (ikke bare speed-felt) er du ikke på foil — begge kutter de myke kantene vekk.",
      "**Minimum lengde & Ø-speed**: Segmenter under 5 s eller med for lav gjennomsnitt faller ut (rask gåing ≠ foiling).",
      "**GPS-dropout skiller**: et sample-hull > 15 s (klokke under vann/fall) avslutter turen — hulltiden teller ikke som kjøretid.",
      "**«Ingen-stopp»-flett**: hvis speed mellom to gjenkjente turer **aldri** var under ~5,4 km/h og det var ingen dropout, var det egentlig **én** tur (modell-dropout) → slå sammen, uansett hvor langt."
    ],
    "p2": "Uten brukbar akselerasjon (GPS-only) tar en **tilstandsmaskin** over med **hysterese** og **dwell**: Du blir først «foilende» etter flere sekunder i speed-båndet *med glatt speed* (gliding er glatt, padling choppy) — og forlater tilstanden bare etter flere sekunder under. To terskler (inn/ut) forhindrer flickering på grensen.",
    "cap": "Øverst: hullet sekund-masken blir til turer (lukk hull, flett, forkast korte segmenter). Nederst: hysterese av GPS-tilstandsmaskinen — inn bare over, ut bare under, med holdtid (Dwell).",
    "maskLabel": "Maske (per sekund)",
    "runs": "Turer",
    "run1": "Tur 1 (hull lukket)",
    "run2": "Tur 2",
    "tooShort": "· for kort → forkastet",
    "hyst": "Hysterese + Dwell (GPS-fallback)",
    "enter": "INN ~10 km/h",
    "exit": "UT ~9 km/h"
  },
  "se": {
    "h": "Start & slutt — sub-sekundt nøyaktig",
    "p": "Modellen arbeider i sekundrasteret, men **oppsprånget** er en skarp hendelse. Derfor snappas tur-starten til **hoppeimpulsen**: en veldig sterk magnitude-topp (> 3,5× 95-persentilen — i forsøket var et hopp ~4,3×, en pump bare ~2,3×, så klart skilelig). Den tidligste slike impulsen i vinduet ±få sekunder markerer det virkelige avsprånget — sub-sekundt mellom to GPS-punkt interpolert. Mangler impulsen, trekker serveren starten over akselerasjons-rampen tilbake til siste quasi-stopp.",
    "p2": "Ved **slutten** ligger to feller: **Dead-Reckoning-drift** (klokken dykker ned, ekstrapolerer GPS og «driver» til land) blir forkastet — prior: en tur ender aldri landover fra sin start. Og hvor en **OSM-vannflate** er kjent, må start og slutt **være i vann** (punkt-i-polygon per ray-casting), ellers kuttes tilbake til siste virkelige vann-sample. Til slutt blir slutten klassifisert som **fall** (abrupt speed-fall fra «på foil» til «i vann», eller GPS-dropout) eller **kontrollert stopp**.",
    "cap": "Den gjenkjente sekund-start (grå) snappas til den skarpe oppsprångs-impulsen i akselerasjons-beløp (cyan) — den virkelige foil-starten.",
    "thr": "3,5 × p95 (Hopp-terskel)",
    "secStart": "Sekund-start",
    "snapped": "← snappt til oppsprånget",
    "afterPump": "deretter: pump-rytme"
  },
  "pump": {
    "h": "Tell pumps — kadense-ledet (v3)",
    "p": "Den nærliggende måten — «tell alle topper over en amplitude-terskel» — **undervurderer strukturelt omkring 2×**: den plukker bare de største utslag og mister de mindre, rytmiske pumpene imellom. Mot **sannheten** (min tappet pump-sannhet, se under) traff det bare ~40 %.",
    "p2": "Den bedre tilnærmingen er **kadense-ledet**: I rytmiske, energirike seksjoner estimerer en lokal FFT den **øyeblikk pump-frekvensen**, og så velges **per kadense-periode akkurat ett** virkelig lokalt maksimum som pump. Kadensen er lokalt-adaptiv, så den følger tempo-endringer. Resultat: **85–94 %** treff istedenfor 40 % — og teller og kart-markør er automatisk konsistent (begge fra samme posisjoner). En RMS-gate forhindrer at rytmeløse glidesfaser blir talt med.",
    "cap": "Amplitude-terskel (øverst) ser bare de store toppene. Kadense-ledet (nederst): estimer lokal periode T, plukk det virkelige maksimum per periode — også de myke pumpene.",
    "top": "Amplitude-terskel — mister små pumps",
    "bot": "Kadense-ledet — ett topp per periode T"
  },
  "glide": {
    "h": "Glidfaser — stillheten mellom pumpene",
    "p": "Akkurat det Del 1 nevnte som største potensial faller nå nesten gratis av: Når pump-tidspunktene er kjent, er **glidfasene bare hullene imellom** — pluss oppløpet fra tur-start til første pump (*lead*) og utløpet fra siste pump til slutt (*tail*). Fra det faller per tur **antall**, **Ø-glide-varighet** og **lengste glidfase** av — kjenntallet for hvor effektivt en foil holder farten.",
    "cap": "Pumps (markør) deler turen; hullene imellom er glidesfasene. lead = Start→1. Pump, tail = siste Pump→Slutt. En lang tail = rent utløp.",
    "start": "Start",
    "end": "Slutt",
    "pumps": "Pumps",
    "lead": "lead",
    "tail": "tail (Gliding)",
    "gaps": "Hull = Glidfaser"
  },
  "gpsonly": {
    "h": "Uten Accel: GPS-only & dets fallgruver",
    "p": "Importerte sesjoner (f. eks. fra Polar) eller klokker med for grov rate har **ingen brukbar akselerasjon**. Da bærer bare GPS — og det har quirks:",
    "li": [
      "**Enkelt-spikes** (Doppler-glitch, «teleport»): byttet mot lokalt median eller rund-og-tilbake-hopp glatt.",
      "**Fler-sekund Doppler-bursts** (~3 s på 50 km/h, men under 90-km/h-glitch-terskelen): byttet mot en robust **15-s-median** — den er immun mot korte bursts, en ekte holdt tur løfter den med og forblir uberørt. To vilkår (relativt over median **og** absolutt over ~28 km/h) beskytter virkelige turer.",
      "**30-km/h-Pumpfoil-gate**: uten Accel kan du ikke sikkert skille pumpfoil fra drevet foiling (kite/vind/wake). Ligger glatt top-speed over 30 km/h, telles sesjonen som drevet → **ingen** pumpfoil. Med Accel faller denne gate bort — der stoler analysen på pump-/on-foil-signalet."
    ]
  },
  "label": {
    "h": "Hvor sannheten kommer fra — Tap pumps",
    "p": "Modellen trenger en **sannhet** som kadense-ledet pump-teller kalibreres mot — og den tapper jeg meg selv for øyeblikket. Jeg ser **videoen** av en tur og **trykker på en knapp ved hver virkelig pump**. Det gjør jeg i **flere gjennomkjøringer**; de blir regnet til et **konsensus** per kryss-korrelasjon (små reaktids-offset middels seg ut). Resultat: det virkelige pump-antall og den virkelige timingen per tur. Dette er bevisst en **overgang** — nøyaktig nok til å kalibrere i dag, men hånd-tappet.",
    "p2": "Viktig når du kalibrerer mot slike labels: **GroupKFold** istedenfor normal kryss-validering. Nabo-sekunder av samme tur er nesten identiske — landet de sammen i trenings- og test-mengde, skulle modellen spørre seg selv (leakage) og rapportert drømmeverdier. GroupKFold holder derfor **hele sesjoner** sammen: testet er alltid på turer som modellen aldri har sett.",
    "cap": "Syklusen: **tappet** pump-sannhet → Trekk → RandomForest → foil_rf.pkl → Analyse av hver session. Nye taps flyter tilbake, modellen blir rekalibrert.",
    "fits": [
      "Tap pumps",
      "Video · flere gjennomkjøringer"
    ],
    "feats": [
      "Trekk",
      "14 × ±5 s kontekst"
    ],
    "rf": [
      "RandomForest",
      "GroupKFold-CV"
    ],
    "pkl": [
      "foil_rf.pkl",
      "→ hver session"
    ],
    "loopNote": "nye tappet turer → rekalibrering"
  },
  "x5": {
    "h": "Neste steg — virkelig sannhet per kamera (Insta360 X5)",
    "p": "Tapping er bra nok til å bootstrap, men henger fast på min reaktidstid. Den **fysisk eksakt** sannhet kommer som neste fra et **kamera på brettet**: en Insta360 X5 filmer mast/foil med, og fra videoen leser du **frame-nøyaktig** av når foilen virkelig får trykk og når den flyr. Med det kalibrerer vi pump-timing og on-foil-gjenkjenning mot ekte fysikk istedenfor hånd-tappet tilnærming. Når riggen står, kommer her sin egen seksjon med hele kamera-oppsettet."
  },
  "summary": {
    "h": "Hele veien i en setning",
    "p1": "Rå int16-akselerasjon → **beløp** → **vertikal mot tyngdekraft** → **FFT-båndpass** i sliding-window → 14 trekk per sekund med **±5 s kontekst** → **RandomForest** sier on-foil/ikke → **segmentering** til turer (hysterese, flett, dropout) → start snappt til **hoppe-impulsen**, slutt mot **vannflate** & drift korrigert → **kadense-ledet** pump-telling → glidfaser som hull → kjenntall.",
    "p2": "Og det alt fra **ett håndledds-klokke** — mast-klokken fra Del 1 var bare referansen som viser at det stemmer."
  },
  "limits": {
    "h": "Grenser (fortsatt ærlig)",
    "p": "Klokken sitter på håndleddet, ikke på brettet — armene vifter for balanse og overlapper pump-signalet («Wrist-Confound»). Vertikalen estimeres fra tyngdekraft-retningen (ingen gyroskop) og er litt forskjøvet ved vedvarende akselerasjon. Den kadense-ledete telleren er kalibrert mot app- og video-sannhet, men den **fysiske** sluttkalibreringen (kamera på brett, Insta360 X5) venter ennå. Og GPS-only-gatene er et kompromiss: heller ærlig «gps_only, Pumps n/a» enn oppfunne tall."
  }
};


const ptPT: N2 = {
  "back": "← Análises para nerds (Parte 1: a experiência)",
  "h1": "Análises para nerds · Parte 2",
  "subtitle": "Como os números de sensores brutos viram bombeios, sessões-em-foil, início/fim e fases de planagem — o processamento de sinal, a janela deslizante, o modelo ML e as etiquetas, tudo em ordem.",
  "intro": "Na [Parte 1](/nerd-analysen) era sobre a **verdade**: um segundo relógio no mastro do foil que revela o que o foil realmente faz. Aqui é sobre a **maquinaria**: o que o servidor calcula para que um sinal tremido na mão se torne uma avaliação de sessão limpa. Tudo o que se segue acontece **do lado do servidor** — o relógio é apenas um gravador fino.",
  "raw": {
    "h": "O que chega: os dados brutos",
    "p": "Cada sessão consiste em dois fluxos, ambos com base de tempo comum (ms desde o início da gravação):",
    "li": [
      "**GPS**, cerca de **1 Hz**: por amostra `[t_ms, lat, lon, speed_mps, hr_bpm, h_acc_m]`. Velocidade e pulsação podem faltar (depois derivadas da posição ou vazias).",
      "**Aceleração**, conforme o relógio **10–100 Hz**: um array `int16` da forma `(N × 3)` — X/Y/Z em contadores brutos. Uma `accel_scale` (contadores por g) transforma em g físicos."
    ],
    "p2": "Porque `int16` em vez de vírgula flutuante? Largura de banda. 100 Hz × 3 eixos × 8 h são milhões de valores — como números inteiros de 2 bytes reduz-se o tamanho de upload em metade. A transformação de volta para g acontece só no servidor."
  },
  "pipe": {
    "h": "A tubagem num relance",
    "p": "Duas vias de processamento (GPS + aceleração) desembocam num modelo ML que **por segundo** decide «em foil — sim/não». Disso saem sessões contíguas cujo início/fim é afinado, e finalmente bombeios e fases de planagem por sessão:",
    "cap": "A avaliação completa: dos dois fluxos de dados brutos através da máscara de foiling até sessões, bombeios e fases de planagem.",
    "gps": [
      "GPS  ~1 Hz",
      "t, lat, lon, speed, hr, h_acc"
    ],
    "accel": [
      "Aceleração  10–100 Hz",
      "int16 (N×3) · accel_scale"
    ],
    "gpsPrep": [
      "Preparar GPS",
      "Filtro espigão/Doppler · suavizar · velocidade"
    ],
    "accelPrep": [
      "Preparar aceleração",
      "Magnitude → vertical · FFT passa-banda"
    ],
    "model": [
      "Modelo ML de foil — RandomForest, ±5 s contexto",
      "Fallback sem aceleração: máquina de estados GPS (histerese + dwell)"
    ],
    "mask": [
      "Máscara de foiling",
      "foil / não-foil — por segundo"
    ],
    "seg": [
      "Segmentação → sessões",
      "Fechar buracos · juntar · encaixar início/fim"
    ],
    "pumps": [
      "Contar bombeios",
      "Guiado por cadência, por sessão"
    ],
    "glide": [
      "Fases de planagem",
      "Buracos entre bombeios"
    ]
  },
  "mag": {
    "h": "Passo 1 — Magnitude em vez de eixos",
    "p": "O relógio fica na mão e roda constantemente — os três eixos X/Y/Z apontam sempre para lado diferente. Um único valor de eixo é portanto inútil. A salvação é a **magnitude** do vetor:",
    "formula": "|a| = √(x² + y² + z²) / accel_scale",
    "p2": "A magnitude é **invariante de orientação**: seja como for que o relógio rode, um impulso de 2g fica um impulso de 2g. Isto faz o sinal finalmente ser comparável (`magnitude_g`).",
    "cap": "Três eixos isolados sem sentido (o relógio está a inclinar constantemente) formam em conjunto uma magnitude estável e invariante |a|.",
    "label": "|a| = √(x²+y²+z²)"
  },
  "vert": {
    "h": "Passo 2 — da mão para a vertical",
    "p": "A magnitude tem um problema: um bombeio é um **impulso para cima**, mas `|a|` conta o movimento para cima igual ao para baixo — cada bombeio aparece duas vezes. Melhor seria a verdadeira **aceleração vertical contra a gravidade**. E consegue-se reconstruir sem giroscópio:",
    "ol": [
      "A **direção da gravidade** muda lentamente → por **filtro passa-baixo** (< 0,25 Hz) por eixo estimar. Isto dá o vetor `g` que aponta sempre «para baixo».",
      "A **aceleração dinâmica** é `a − g`.",
      "Projectar isto no vetor unitário da gravidade **ĝ** → sinal escalar: > 0 = para cima (impulso)."
    ],
    "f1": "v(t) = (a − g) · ĝ",
    "fMid": "onde",
    "f2": "ĝ = g / |g|",
    "cap": "A gravidade lentamente à deriva g (filtro passa-baixo) separa orientação de dinâmica. A aceleração dinâmica a−g, projectada em ĝ, dá um impulso para cima limpo por bombeio.",
    "gLabel": "g (gravidade)",
    "aLabel": "a (medido)",
    "amg": "a − g",
    "topNote": "|Magnitude|: cada bombeio duas vezes",
    "botNote": "v(t) contra gravidade: um impulso por bombeio"
  },
  "win": {
    "h": "Passo 3 — Janela deslizante e FFT passa-banda",
    "p": "O bombeio é **rítmico** — e ritmo vive no espaço de frequência. Por isso uma **janela deslizante** (típ. 4 s de largura, um passo a cada 2 s) desliza pelo sinal, e para cada janela uma **FFT** calcula o espectro. Duas bandas são importantes:",
    "li": [
      "**Banda de filtro 0,3–3 Hz** — tudo abaixo é gravidade/deriva, tudo acima é ruído de salpicos. Ambos são anulados por FFT passa-banda (`bandpass_fft`).",
      "**Banda de bombeio 0,5–2 Hz** — aqui vive a cadência de bombeio (30–120 bombeios/min)."
    ],
    "p2": "Por janela caem quatro características:",
    "li2": [
      "**dom_freq** — frequência dominante na banda de bombeio (a taxa de bombeio)",
      "**band_power_ratio** — proporção da energia na banda de bombeio na banda total (alta = ritmo claro)",
      "**rms** — força do sinal (amplitude do movimento)",
      "**spectral_entropy** — quão «organizado» o espectro está (baixo = uma frequência clara = bombeio; alto = caos = ruído/planagem)"
    ],
    "cap": "Uma janela de 4s desliza pelo sinal filtrado (passo 2s → sobreposição). Para cada janela a FFT fornece um espectro; a energia na banda de bombeio 0,5–2 Hz revela taxa e ritmo.",
    "winT": "Janela t",
    "winT1": "Janela t+1",
    "sig": "v(t) — filtro passa-banda (0,3–3 Hz)",
    "fft": "FFT",
    "spec": "Espectro",
    "band": "0,5–2 Hz",
    "freq": "Frequência →"
  },
  "rate": {
    "h": "Um detalhe para nerds: a verdadeira taxa de amostragem",
    "p": "Alguns relógios **mentem** sobre a sua taxa. Um Forerunner 55 marca «10 Hz» mas fornece realmente apenas ~2,5 Hz. Características de frequência e cadência de bombeio seriam portanto lixo. Por isso o servidor determina a taxa **genericamente a partir dos dados**: `hz_real = Numero_Amostras_Accel / Duracao_GPS`. Se isto difere > 25% do marcado, usa-se a taxa medida. E se é **menor a 15 Hz**, o sinal é demasiado bruto para análise de frequência → a sessão é avaliada como **apenas GPS** (bombeios n/a, mas limites honestos em vez de números fantasma)."
  },
  "ml": {
    "h": "Onde estou no foil? — o modelo ML",
    "p": "Se em um segundo está **em foil**, um **RandomForest** decide — uma floresta de árvores de decisão que votam por maioria. Pequeno e interpretável, sem aprendizagem profunda necessária. Por segundo recebe **14 características**:",
    "li": [
      "**7 de velocidade e aceleração**: velocidade agora / 3s / 5s (mediana), variabilidade de velocidade, mais RMS em três bandas (total, banda de bombeio, alta frequência).",
      "**7 do percurso GPS**: mudança de velocidade em 1/3/5s, comprimento do caminho, deslocamento líquido, **retidão** (líquido/caminho) e mudança de curso. Estas características de direção foram o maior ganho na experiência — mantêm fases de planagem calmas na sessão, em vez de as estilhaçar."
    ],
    "p2": "O truque é o **contexto**: cada segundo não é classificado isoladamente, mas junto com os **±5 segundos vizinhos** (o «windowize»). O vetor de características de um segundo é portanto 14 × 11 = 154 números. Assim o modelo vê o fluxo — uma pequena queda de velocidade no meio de um cruzeiro não é imediatamente considerada «fora». Isto reduziu a fragmentação de 1,10× para 1,00× e o F1-score de **0,93 para 0,97**.",
    "cap": "Por segundo um vetor de 14 características; para classificação os ±5 segundos vizinhos são anexados (rótulo central). RandomForest vota → foil / não-foil.",
    "featNote": "Janela de segundos: 14 características por segundo, ±5s contexto",
    "forest": "RandomForest (maioria)",
    "maskNote": "Máscara por segundo: foil ▮ / não-foil ▯"
  },
  "seg": {
    "h": "Da máscara para sessões",
    "p": "A máscara de segundos ainda tem buracos. É moldada em **sessões** limpas:",
    "li": [
      "**Fechar buracos curtos** (até ~2s): uma pausa de planagem não divide uma sessão.",
      "**Piso de física**: abaixo de ~9 km/h nenhum foil sustém, e sem movimento real de posição (não apenas campo de velocidade) não está em foil — ambos cortam as margens suaves.",
      "**Comprimento mínimo e velocidade média**: segmentos abaixo de 5s ou com média muito baixa são descartados (caminhar rápido ≠ foiling).",
      "**Dropout de GPS separa**: um buraco de amostra > 15s (relógio debaixo de água/queda) termina a sessão — o tempo de buraco não conta como tempo de condução.",
      "**Merge «sem-paragem»**: se a velocidade entre duas sessões detetadas **nunca** caiu abaixo de ~5,4 km/h e não houve dropout, foi realmente **uma** sessão (falha do modelo) → juntar, não importa quanto tempo."
    ],
    "p2": "Sem aceleração utilizável (apenas GPS) uma **máquina de estados** com **histerese** e **dwell** assume o comando: Fica-se «foilando» apenas após vários segundos na banda de velocidade *com velocidade lisa* (planagem é lisa, remar é saltado) — e deixa-se o estado apenas após vários segundos abaixo. Dois limiares (entrada/saída) evitam cintilação na borda.",
    "cap": "Acima: a máscara de segundos cheia de buracos torna-se sessões (buracos fechados, juntos, segmentos curtos descartados). Abaixo: a histerese da máquina de estados GPS — entra apenas acima, sai apenas abaixo, com tempo de espera (dwell).",
    "maskLabel": "Máscara (por segundo)",
    "runs": "Sessões",
    "run1": "Sessão 1 (buracos fechados)",
    "run2": "Sessão 2",
    "tooShort": "· demasiado curto → descartado",
    "hyst": "Histerese + Dwell (fallback GPS)",
    "enter": "ENTRADA ~10 km/h",
    "exit": "SAÍDA ~9 km/h"
  },
  "se": {
    "h": "Início e fim — sub-segundo preciso",
    "p": "O modelo funciona na grelha de segundos, mas o **salto** é um evento afiado. Por isso o início da sessão é encaixado no **impulso de salto**: uma oscilação muito forte de magnitude (> 3,5× do percentil 95 — na experiência um salto tinha ~4,3×, um bombeio apenas ~2,3×, claramente separável). A oscilação mais cedo dessa amplitude na janela ±poucos segundos marca o verdadeiro salto — sub-segundo preciso entre dois pontos GPS interpolado. Se faltar a oscilação, o servidor puxa o início pela rampa de aceleração até ao quase-total-paragem.",
    "p2": "No **fim** espreitam duas armadilhas: **dead-reckoning-drift** (o relógio mergulha, extrapola o GPS e «à deriva» para terra) é descartado — precedente: uma sessão nunca termina mais para terra que o seu início. E onde uma **superfície de água OSM** é conhecida, início e fim devem estar **na água** (ponto-em-polígono por ray-casting), senão cortam-se para a última amostra real de água. Finalmente o fim é ainda classificado como **queda** (queda abrupta de velocidade de «em foil» para «na água», ou dropout de GPS) ou **paragem controlada**.",
    "cap": "O início da sessão detetado (cinza) é encaixado no impulso de salto afiado da magnitude de aceleração (ciano) — o verdadeiro início de foil.",
    "thr": "3,5 × p95 (limiar de salto)",
    "secStart": "Início de segundo",
    "snapped": "← encaixado no salto",
    "afterPump": "depois: ritmo de bombeio"
  },
  "pump": {
    "h": "Contar bombeios — guiado por cadência (v3)",
    "p": "O caminho óbvio — «contar todos os picos acima de um limiar de amplitude» — **subestima estruturalmente ~2×**: pega apenas nos maiores picos e deixa escorregar os menores rítmicos entre eles. Contra a **verdade** (a minha verdade de bombeio teclada, ver abaixo) isso acertava apenas ~40%.",
    "p2": "A abordagem melhor é **guiada por cadência**: em secções rítmicas e energéticas uma FFT local estima a **frequência de bombeio momentânea**, e depois **por período de cadência exatamente um** máximo local real é escolhido como bombeio. A cadência é localmente adaptativa, portanto segue mudanças de ritmo. Resultado: **85–94%** acertos em vez de 40% — e contadores e marcadores de mapa são automaticamente coerentes (ambos das mesmas posições). Um gate de RMS evita que fases de planagem sem ritmo sejam contadas.",
    "cap": "Limiar de amplitude (acima) vê apenas os picos gordos. Guiado por cadência (abaixo): estimar período local T, por período escolher o máximo real — incluindo os bombeios suaves.",
    "top": "Limiar de amplitude — deixa escorregar bombeios pequenos",
    "bot": "Guiado por cadência — um pico por período T"
  },
  "glide": {
    "h": "Fases de planagem — o silêncio entre os bombeios",
    "p": "Exatamente o que a Parte 1 nomeou como maior potencial cai agora quase de graça: com os tempos de bombeio conhecidos, as **fases de planagem são simplesmente os buracos entre eles** — mais a descida do início da sessão até ao primeiro bombeio (*lead*) e o arrefecimento do último bombeio até ao fim (*tail*). Disso caem por sessão **número**, **duração média de planagem** e **fase de planagem mais longa** — a métrica para quão eficientemente um foil mantém o impulso.",
    "cap": "Bombeios (marcadores) dividem a sessão; os buracos entre são as fases de planagem. lead = início→1º. bombeio, tail = último bombeio→fim. Um longo tail = arrefecimento limpo.",
    "start": "Início",
    "end": "Fim",
    "pumps": "Bombeios",
    "lead": "lead",
    "tail": "tail (planagem)",
    "gaps": "Buracos = fases de planagem"
  },
  "gpsonly": {
    "h": "Sem aceleração: apenas GPS e as suas armadilhas",
    "p": "Sessões importadas (p.ex. de Polar) ou relógios com taxa demasiado bruta não têm **aceleração utilizável**. Depois apenas GPS — e tem macaqueices:",
    "li": [
      "**Espigões isolados** (glitch Doppler, «teletransporte»): substituídos contra a mediana local ou saltos de ida-e-volta suavizados.",
      "**Rajadas Doppler de vários segundos** (~3s em 50 km/h, mas abaixo do limiar de glitch 90 km/h): substituídas por uma **mediana robusta de 15s** — é insensível a rajadas curtas, um verdadeiro cruzeiro sustentado a levanta com ele e fica intocado. Duas condições (relativa sobre mediana **e** absoluta acima de ~28 km/h) protegem verdadeiros cruzeiros.",
      "**Gate de 30 km/h de Pumpfoil**: sem aceleração não se consegue separar com segurança Pumpfoil de foiling motorizado (kite/vento/wake). Se a velocidade máxima suavizada está acima 30 km/h, a sessão é considerada motorizada → **nenhum** Pumpfoil. Com aceleração este gate desaparece — lá o processamento confia no sinal de bombeio/estar-em-foil."
    ]
  },
  "label": {
    "h": "De onde vem a verdade — teclando bombeios",
    "p": "O modelo precisa de uma **verdade** contra que o contador de bombeio guiado por cadência é calibrado — e eu teclo-a neste momento. Vejo o **vídeo** de uma sessão e **teclo em cada verdadeiro bombeio** num botão. Faço isto em **vários takes**; eles são calculados por correlação cruzada num **consenso** (pequenos desfasamentos de tempo reativo médiam-se). Resultado: o verdadeiro número de bombeios e o verdadeiro tempo por sessão. Isto é conscientemente uma **ponte** — precisão suficiente para calibrar hoje, mas teclado à mão.",
    "p2": "Importante ao calibrar contra tais rótulos: **GroupKFold** em vez de validação cruzada normal. Segundos vizinhos da mesma sessão são quase idênticos — se caíssem simultaneamente em lote de treino e teste, o modelo estar-se-ia a auto-interrogar (vazamento) e valores de sonho seriam dados. GroupKFold mantém portanto **sessões inteiras** juntas: testado é sempre em sessões que o modelo nunca viu.",
    "cap": "O ciclo: **verdade de bombeio teclada** → características → RandomForest → foil_rf.pkl → avaliação de cada sessão. Novos taps refluem, o modelo é recalibrado.",
    "fits": [
      "Teclagem de bombeios",
      "Vídeo · vários takes"
    ],
    "feats": [
      "Características",
      "14 × ±5s contexto"
    ],
    "rf": [
      "RandomForest",
      "GroupKFold-CV"
    ],
    "pkl": [
      "foil_rf.pkl",
      "→ cada sessão"
    ],
    "loopNote": "novos takes teclados → recalibrar"
  },
  "x5": {
    "h": "O próximo passo — verdade real por câmara (Insta360 X5)",
    "p": "Teclagem é suficiente para começar, mas pendura no meu tempo reativo. A **verdade fisicamente exata** vem a seguir de uma **câmara na prancha**: uma Insta360 X5 filma mastro/foil com, e do vídeo lê-se **frame-exatamente** quando o foil realmente recebe pressão e quando voa. Com isto calibramos o tempo de bombeio e a deteção estar-em-foil contra verdadeira física em vez de aproximação teclada. Assim que o equipamento estiver pronto, vem aqui uma secção própria com toda a configuração de câmara."
  },
  "summary": {
    "p1": "Aceleração bruta int16 → **magnitude** → **vertical contra gravidade** → **FFT passa-banda** em janela deslizante → 14 características por segundo com **±5s contexto** → **RandomForest** diz em-foil/não → **segmentação** para sessões (histerese, juntar, dropout) → início encaixado no **impulso de salto**, fim contra **superfície de água** & deriva corrigida → contagem de bombeio **guiada por cadência** → fases de planagem como buracos → métricas.",
    "p2": "E tudo isto de **um relógio de mão** — o relógio no mastro da Parte 1 era apenas a referência que mostra que é verdadeiro.",
    "h": "O caminho inteiro numa frase"
  },
  "limits": {
    "h": "Limites (continuando honesto)",
    "p": "O relógio fica na mão, não na prancha — os braços balancem para balancear e sobrepõem o sinal de bombeio («Wrist-Confound»). A vertical é estimada a partir da direção da gravidade (sem giroscópio) e é ligeiramente distorcida com aceleração sustentada. O contador guiado por cadência é calibrado contra verdade de app e vídeo, mas a **verdade física** (câmara na prancha, Insta360 X5) ainda falta. E os gates apenas GPS são um compromisso: melhor honestamente «gps_only, bombeios n/a» do que números inventados."
  }
};


const pt: N2 = {
  "back": "← Análises Nerd (Parte 1: o experimento)",
  "h1": "Análises Nerd · Parte 2",
  "subtitle": "Como números brutos de sensores se tornam pumps, sessões on-foil, início/fim e fases de glide — o processamento de sinal, a janela deslizante, o modelo ML e o labeling, passo a passo.",
  "intro": "Na [Parte 1](/nerd-analysen) tratamos da **verdade**: um segundo relógio no mastro do foil que revela o que o foil realmente faz. Aqui trata-se da **maquinaria**: o que o servidor calcula para transformar um sinal agitado no pulso numa avaliação de sessão limpa. Tudo o que segue acontece **no servidor** — o relógio é apenas um gravador fino.",
  "raw": {
    "h": "O Que Chega: Os Dados Brutos",
    "p": "Cada sessão consiste em dois fluxos, ambos com base de tempo comum (ms desde o início da gravação):",
    "li": [
      "**GPS**, aprox. **1 Hz**: por amostra `[t_ms, lat, lon, speed_mps, hr_bpm, h_acc_m]`. Velocidade e pulso podem estar faltando (então derivados da posição ou vazios).",
      "**Aceleração**, conforme o relógio **10–100 Hz**: um array `int16` da forma `(N × 3)` — X/Y/Z em contadores brutos. Uma `accel_scale` (contadores por g) transforma isso em g físico."
    ],
    "p2": "Por que `int16` em vez de ponto flutuante? Largura de banda. 100 Hz × 3 eixos × 8 h são milhões de valores — como inteiros de 2 bytes isso reduz o tamanho de upload pela metade. A conversão de volta para g acontece apenas no servidor."
  },
  "pipe": {
    "h": "A Pipeline em Uma Olhada",
    "p": "Duas trilhas de processamento (GPS + aceleração) fluem para um modelo ML que decide **por segundo** «no foil — sim/não». Disto vêm sessões contíguas cujo início/fim é ajustado finamente, e finalmente pumps & fases de glide por sessão:",
    "cap": "A avaliação completa: dos dois fluxos de dados brutos através da máscara de foiling para sessões, pumps e fases de glide.",
    "gps": [
      "GPS  ~1 Hz",
      "t, lat, lon, speed, hr, h_acc"
    ],
    "accel": [
      "Aceleração  10–100 Hz",
      "int16 (N×3) · accel_scale"
    ],
    "gpsPrep": [
      "Preparar GPS",
      "Filtro de spike/Doppler · suavização · velocidade"
    ],
    "accelPrep": [
      "Preparar aceleração",
      "Magnitude → vertical · passa-banda FFT"
    ],
    "model": [
      "Modelo ML de foil — RandomForest, contexto ±5 s",
      "Fallback sem aceleração: máquina de estado GPS (histerese + dwell)"
    ],
    "mask": [
      "Máscara de foiling",
      "foil / não-foil — por segundo"
    ],
    "seg": [
      "Segmentação → sessões",
      "Fechar lacunas · mesclar · snapar início/fim"
    ],
    "pumps": [
      "Contar pumps",
      "Guiado por cadência, por sessão"
    ],
    "glide": [
      "Fases de glide",
      "Lacunas entre pumps"
    ]
  },
  "mag": {
    "h": "Passo 1 — Magnitude em vez de Eixos",
    "p": "O relógio fica no pulso e gira o tempo todo — os três eixos X/Y/Z apontam em direções diferentes constantemente. Um valor de eixo único é portanto inútil. A salvação é a **magnitude** do vetor:",
    "formula": "|a| = √(x² + y² + z²) / accel_scale",
    "p2": "A magnitude é **invariante de orientação**: não importa como o relógio é girado, um impulso de 2 g permanece um impulso de 2 g. Isso torna o sinal comparável em primeiro lugar (`magnitude_g`).",
    "cap": "Três eixos individuais sem sentido (o relógio se inclina constantemente) juntos produzem uma magnitude orientacionalmente estável |a|.",
    "label": "|a| = √(x²+y²+z²)"
  },
  "vert": {
    "h": "Passo 2 — Do Pulso para a Vertical",
    "p": "A magnitude tem uma pegadinha: um pump é um **empurrão para cima**, mas `|a|` conta o downstroke tão bem quanto o upstroke — cada pump aparece duas vezes. Melhor seria a **aceleração vertical real contra a gravidade**. E isso pode ser reconstruído, completamente sem giroscópio:",
    "ol": [
      "A **direção da gravidade** muda apenas lentamente → estimar por **passa-baixa** (< 0,25 Hz) por eixo. Isso dá o vetor `g`, que sempre aponta «para baixo».",
      "A **aceleração dinâmica** é `a − g`.",
      "**Projetar** isso no vetor unitário de gravidade → sinal escalar: > 0 = para cima (push)."
    ],
    "f1": "v(t) = (a − g) · ĝ",
    "fMid": "com",
    "f2": "ĝ = g / |g|",
    "cap": "A gravidade lentamente flutuante g (passa-baixa) separa orientação de dinâmica. A aceleração dinâmica a−g, projetada em ĝ, dá um empurrão para cima limpo por pump.",
    "gLabel": "g (gravidade)",
    "aLabel": "a (medido)",
    "amg": "a − g",
    "topNote": "|Magnitude|: cada pump duas vezes",
    "botNote": "v(t) contra gravidade: um push por pump"
  },
  "win": {
    "h": "Passo 3 — Janela Deslizante & Passa-Banda FFT",
    "p": "Bombeio é **rítmico** — e ritmo vive no espaço de frequência. Por isso uma **janela deslizante** (typ. 4 s de largura, um passo a cada 2 s) desliza sobre o sinal, e para cada janela uma **FFT** calcula o espectro. Duas faixas são importantes:",
    "li": [
      "**Faixa de filtro 0,3–3 Hz** — tudo abaixo é gravidade/drift, tudo acima é ruído de splash. Ambos são anulados por passa-banda FFT (`bandpass_fft`).",
      "**Faixa de pump 0,5–2 Hz** — aqui vive a cadência de pump (30–120 pumps/min)."
    ],
    "p2": "Por janela, caem quatro características:",
    "li2": [
      "**dom_freq** — frequência dominante na faixa de pump (a taxa de pump)",
      "**band_power_ratio** — proporção de energia na faixa de pump na faixa geral (alta = ritmo claro)",
      "**rms** — força do sinal (amplitude do movimento)",
      "**spectral_entropy** — quão «arrumado» é o espectro (baixo = uma frequência clara = bombeio; alto = caos = ruído/glide)"
    ],
    "cap": "Uma janela de 4 s desliza sobre o sinal filtrado (passo 2 s → sobreposição). Para cada janela a FFT fornece um espectro; a energia na faixa de pump 0,5–2 Hz revela taxa e ritmo.",
    "winT": "Janela t",
    "winT1": "Janela t+1",
    "sig": "v(t) — passa-banda filtrado (0,3–3 Hz)",
    "fft": "FFT",
    "spec": "Espectro",
    "band": "0,5–2 Hz",
    "freq": "Frequência →"
  },
  "rate": {
    "h": "Um Detalhe Nerd: a Taxa de Amostragem Real",
    "p": "Alguns relógios **mentem** sobre sua taxa. Um Forerunner 55 marca «10 Hz», mas realmente entrega apenas ~2,5 Hz. Características de frequência e cadência de pump seriam lixo. Por isso o servidor determina a taxa **genericamente a partir dos dados em si**: `hz_real = Número_Amostras_Accel / Duração_GPS`. Se isso se desviar > 25 % do marcado, a taxa medida é usada. E se estiver **abaixo de 15 Hz**, o sinal é muito grosseiro para análise de frequência → a sessão é avaliada como **apenas GPS** (pumps n/a, em vez disso, limites honestos em vez de valores de fantasia)."
  },
  "ml": {
    "h": "Onde Estou no Foil? — o Modelo ML",
    "p": "Se você está **no foil** em um segundo é decidido por um **RandomForest** — uma floresta de árvores de decisão que votam por maioria. Pequeno e interpretável, sem aprendizado profundo necessário. Por segundo ele recebe **14 características**:",
    "li": [
      "**7 de velocidade & aceleração**: velocidade agora / 3 s / 5 s (mediana), variabilidade de velocidade, bem como RMS em três faixas (geral, faixa de pump, alta frequência).",
      "**7 da trilha GPS**: mudança de velocidade sobre 1/3/5 s, comprimento do caminho, deslocamento líquido, **linearidade** (líquido/caminho) e mudança de rumo. Essas características de direção foram a maior alavanca no experimento — mantêm fases de glide tranquilas na sessão, em vez de fragmentá-las."
    ],
    "p2": "O truque é o **contexto**: cada segundo não é classificado isoladamente, mas junto com os **±5 segundos vizinhos** (o «Windowize»). O vetor de características de um segundo tem portanto 14 × 11 = 154 números de comprimento. Assim o modelo vê o fluxo — uma queda curta de velocidade no meio do cruise não é imediatamente contada como «fora». Isso reduziu a fragmentação de 1,10× para 1,00× e o F1-score de **0,93 para 0,97**.",
    "cap": "Por segundo um vetor de 14 características; para classificação os ±5 segundos vizinhos são anexados (Center-Label). O RandomForest vota → foil / não-foil.",
    "featNote": "Janela de segundos: 14 características por segundo, contexto ±5 s",
    "forest": "RandomForest (maioria)",
    "maskNote": "Máscara por segundo: foil ▮ / não-foil ▯"
  },
  "seg": {
    "h": "Da Máscara para Sessões",
    "p": "A máscara de segundos é ainda furada. Ela é moldada em **sessões** limpas:",
    "li": [
      "**Fechar lacunas curtas** (até ~2 s): uma pausa de glide não fragmenta uma sessão.",
      "**Limite de física**: abaixo de ~9 km/h nenhum foil carrega, e sem movimento real de posição (não apenas campo de velocidade) você não está no foil — ambos cortam as margens suaves.",
      "**Comprimento mínimo & velocidade média**: segmentos abaixo de 5 s ou com média muito baixa são descartados (caminhada rápida ≠ foiling).",
      "**Dropout de GPS separa**: uma lacuna de amostra > 15 s (relógio embaixo da água/queda) encerra a sessão — o tempo de lacuna não conta como tempo de condução.",
      "**«Merge sem parada»**: se a velocidade entre duas sessões detectadas **nunca** caiu abaixo de ~5,4 km/h e não houve dropout, foi na verdade **uma** sessão (dropout do modelo) → mesclar, não importa quanto tempo."
    ],
    "p2": "Sem aceleração utilizável (apenas GPS) uma **máquina de estado** com **histerese** e **dwell** assume: você fica «foilando» apenas após vários segundos na faixa de velocidade *com velocidade suave* (glide é suave, paddling é agitado) — e sai do estado apenas após vários segundos abaixo. Dois limites (dentro/fora) evitam cintilação na borda.",
    "cap": "Acima: a máscara furada de segundo é moldada em sessões (fechar lacunas, mesclar, descartar segmentos curtos). Abaixo: a histerese da máquina de estado GPS — entra apenas acima, sai apenas abaixo, com tempo de manutenção (dwell).",
    "maskLabel": "Máscara (por segundo)",
    "runs": "Sessões",
    "run1": "Sessão 1 (lacunas fechadas)",
    "run2": "Sessão 2",
    "tooShort": "· muito curta → descartada",
    "hyst": "Histerese + dwell (fallback de GPS)",
    "enter": "ENTRAR ~10 km/h",
    "exit": "SAIR ~9 km/h"
  },
  "se": {
    "h": "Início & Fim — Sub-segundo-Preciso",
    "p": "O modelo funciona na grade de segundo, mas o **salto** é um evento afiado. Por isso o início da sessão é snapado para o **impulso de salto**: um spike de magnitude muito forte (> 3,5× do percentil 95 — no experimento um salto estava em ~4,3×, um pump apenas em ~2,3×, então claramente separável). O impulso mais cedo dessa espécie na janela ±alguns segundos marca a decolagem real — sub-segundo-preciso interpolado entre dois pontos de GPS. Se o impulso estiver faltando, o servidor retira o início pela rampa de aceleração até o quase-parada anterior.",
    "p2": "No **fim** espreitam duas armadilhas: **Dead-Reckoning-Drift** (o relógio mergulha, extrapola o GPS e «flutua» na terra) é descartado — prior: uma sessão nunca termina mais perto da terra que seu início. E onde uma **superfície de água OSM** é conhecida, início e fim devem estar **na água** (ponto-em-polígono por ray-casting), senão é cortado de volta para a última amostra de água real. Finalmente o fim ainda é classificado como **queda** (queda abrupta de velocidade de «no foil» para «na água», ou dropout de GPS) ou **parada controlada**.",
    "cap": "O início de segundo detectado (cinza) é snapado para o impulso nítido de decolagem na magnitude de aceleração (ciano) — o verdadeiro início do foil.",
    "thr": "3,5 × p95 (limiar de salto)",
    "secStart": "Início de segundo",
    "snapped": "← snapado para decolagem",
    "afterPump": "depois: ritmo de pump"
  },
  "pump": {
    "h": "Contar Pumps — Guiado por Cadência (v3)",
    "p": "O caminho óbvio — «conte todos os peaks acima de um limiar de amplitude» — **subestima estruturalmente por ~2×**: ele pega apenas os maiores deflexões e perde os pequenos pumps rítmicos no meio. Contra a **verdade** (meu tap de pump verdade, veja abaixo) isso acertava apenas ~40 %.",
    "p2": "A abordagem melhor é **guiada por cadência**: em seções rítmicas e energéticas, uma FFT local estima a **frequência de pump momentânea**, e então **por período de cadência exatamente um** verdadeiro máximo local é escolhido como pump. A cadência é localmente adaptativa, assim segue mudanças de tempo. Resultado: **85–94 %** acerto em vez de 40 % — e contagem e marcadores de mapa são automaticamente consistentes (ambos das mesmas posições). Um gate de RMS evita que fases de glide sem ritmo sejam contadas.",
    "cap": "Limiar de amplitude (acima) vê apenas os maiores peaks. Guiado por cadência (abaixo): estimar período local T, por período escolher o verdadeiro máximo — também os pumps suaves.",
    "top": "Limiar de amplitude — perde pequenos pumps",
    "bot": "Guiado por cadência — um peak por período T"
  },
  "glide": {
    "h": "Fases de Glide — o Silêncio Entre os Pumps",
    "p": "Exatamente aquilo que a Parte 1 nomeou como o maior potencial cai agora quase de graça: são os tempos de pump conhecidos, as **fases de glide são simplesmente as lacunas entre eles** — mais a aceleração do início da sessão até o primeiro pump (*lead*) e o arremate do último pump até o fim (*tail*). Disso caem por sessão **número**, **duração média de glide** e **fase de glide mais longa** — o indicador de quão eficientemente um foil mantém o impulso.",
    "cap": "Pumps (marcadores) dividem a sessão; as lacunas entre eles são as fases de glide. lead = início→1º pump, tail = último pump→fim. Um tail longo = arremate limpo.",
    "start": "Início",
    "end": "Fim",
    "pumps": "Pumps",
    "lead": "lead",
    "tail": "tail (glide)",
    "gaps": "Lacunas = fases de glide"
  },
  "gpsonly": {
    "h": "Sem Aceleração: GPS-Only & Suas Armadilhas",
    "p": "Sessões importadas (p. ex., de Polar) ou relógios com taxa muito grossa não têm **aceleração utilizável**. Então apenas GPS carrega — e isso tem truques:",
    "li": [
      "**Spikes individuais** (glitch de Doppler, «teletransporte»): substituído contra a mediana local ou suavizado saltos de ida e volta.",
      "**Rajadas de Doppler de vários segundos** (~3 s em 50 km/h, mas abaixo do limiar de glitch de 90 km/h): substituído contra uma **mediana robusta de 15 s** — essa é insensível a rajadas curtas, um verdadeiro lauf mantido realmente a levanta com ele e permanece intocado. Duas condições (relativa sobre mediana **e** absoluta acima de ~28 km/h) protegem verdadeiros laufs.",
      "**Gate de Pumpfoil de 30 km/h**: sem aceleração você não pode separar com segurança pumpfoil de foiling propulsado (kite/vento/wake). Se a velocidade máxima suavizada for acima de 30 km/h, a sessão é contada como propulsada → **nenhum** pumpfoil. Com aceleração esse gate cai — lá a avaliação confia no sinal de pump/on-foil."
    ]
  },
  "label": {
    "h": "De Onde Vem a Verdade — Pumps Antipatia",
    "p": "O modelo precisa de uma **verdade**, contra a qual o contador de pump guiado por cadência é calibrado — e eu a digito para mim mesmo agora. Eu vejo o **vídeo** de uma sessão e **digito em um botão a cada pump real**. Faço isso em **vários testes**; eles são calculados por correlação cruzada para um **consenso** (pequenos desvios de tempo de reação se equilibram). Resultado: o verdadeiro número de pump e o verdadeiro tempo por sessão. Isto é deliberadamente uma **transição** — preciso o bastante para calibrar hoje, mas digitado à mão.",
    "p2": "Importante ao calibrar contra rótulos assim: **GroupKFold** em vez de validação cruzada normal. Segundos vizinhos da mesma sessão são quase idênticos — se caíssem juntos em conjunto de treinamento e teste, o modelo se questionaria a si mesmo (vazamento) e relataria valores de sonho. GroupKFold portanto mantém **sessões inteiras** juntas: testado sempre em sessões que o modelo nunca viu.",
    "cap": "O ciclo: **verdade de pump tappada** → características → RandomForest → foil_rf.pkl → avaliação de cada sessão. Novos taps fluem de volta, o modelo é recalibrado.",
    "fits": [
      "Pumps Antipatia",
      "Vídeo · vários testes"
    ],
    "feats": [
      "Características",
      "14 × contexto ±5 s"
    ],
    "rf": [
      "RandomForest",
      "GroupKFold-CV"
    ],
    "pkl": [
      "foil_rf.pkl",
      "→ cada sessão"
    ],
    "loopNote": "novos laufs tappados → recalibrar"
  },
  "x5": {
    "h": "O Próximo Passo — Verdade Real por Câmera (Insta360 X5)",
    "p": "Antipatia é bom o suficiente para bootstrapping, mas depende do meu tempo de reação. A **verdade fisicamente exata** vem a seguir de uma **câmera na prancha**: uma Insta360 X5 filma mastro/foil com, e do vídeo você lê **frame-exatamente** quando o foil realmente recebe pressão e quando voa. Com isso calibramos pump-timing e reconhecimento on-foil contra física real em vez de aproximação tappada. Assim que o rig estiver pronto, vem aqui uma seção própria com o setup de câmera completo."
  },
  "summary": {
    "h": "O Caminho Inteiro em Uma Frase",
    "p1": "Aceleração bruta int16 → **magnitude** → **vertical contra gravidade** → **passa-banda FFT** em janela deslizante → 14 características por segundo com **contexto ±5 s** → **RandomForest** diz on-foil/não → **segmentação** para sessões (histerese, mesclar, dropout) → início snapado para **impulso de salto**, fim corrigido contra **superfície de água** & drift → **contagem de pump guiada por cadência** → fases de glide como lacunas → indicadores.",
    "p2": "E tudo isso de **um relógio no pulso** — o relógio do mastro da Parte 1 era apenas a referência que mostra que está correto."
  },
  "limits": {
    "h": "Limites (Continuando honesto)",
    "p": "O relógio fica no pulso, não na prancha — os braços agitam para equilibrio e sobrepõem o sinal de pump («Wrist-Confound»). A vertical é estimada a partir da direção da gravidade (sem giroscópio) e é ligeiramente distorcida com aceleração contínua. O contador guiado por cadência é calibrado contra verdade de app e vídeo, mas a **calibração física** terminal (câmera na prancha, Insta360 X5) ainda está aberta. E os gates apenas-GPS são um compromisso: melhor honestamente «apenas_gps, pumps n/a» do que números inventados."
  }
};


const ru: N2 = {
  "back": "← Нерд-анализы (Часть 1: эксперимент)",
  "h1": "Нерд-анализы · Часть 2",
  "subtitle": "Как из сырых чисел датчиков получаются Pumps, On-Foil-лауны, старт/конец и глайд-фазы — обработка сигнала, скользящее окно, ML-модель и разметка, всё по порядку.",
  "intro": "В [Части 1](/nerd-analysen) речь шла об **истине**: вторые часы на мачте фойла, которые показывают, что фойл на самом деле делает. Здесь речь о **механизме**: что считает сервер, чтобы из дрожащего сигнала на запястье получилась чистая разбор сессии. Всё дальше происходит **на сервере** — часы это просто тонкий рекордер.",
  "raw": {
    "h": "Что приходит: сырые данные",
    "p": "Каждая сессия состоит из двух потоков, оба с общей временной базой (ms от начала записи):",
    "li": [
      "**GPS**, ~**1 Hz**: за Sample `[t_ms, lat, lon, speed_mps, hr_bpm, h_acc_m]`. Speed и пульс могут отсутствовать (тогда выводятся из позиции или пусто).",
      "**Ускорение**, в зависимости от часов **10–100 Hz**: массив `int16` вида `(N × 3)` — X/Y/Z в сырых отсчётах. `accel_scale` (отсчёты на g) превращает это в физические g."
    ],
    "p2": "Почему `int16` вместо чисел с плавающей точкой? Полоса пропускания. 100 Hz × 3 оси × 8 h это миллионы значений — как 2-байтовые целые числа это вполовину сжимает размер загрузки. Масштабирование обратно в g происходит первым на сервере."
  },
  "pipe": {
    "h": "Конвейер в одном взгляде",
    "p": "Две подготовительные ветки (GPS + Accel) впадают в ML-модель, которая **в секунду** решает «на фойле — да/нет». Из этого получаются связанные лауны, их начало/конец уточняются, и наконец Pumps и глайд-фазы за лаун:",
    "cap": "Полная разработка: от двух сырых потоков данных через маску фойлинга к лаунам, Pumps и глайд-фазам.",
    "gps": [
      "GPS  ~1 Hz",
      "t, lat, lon, speed, hr, h_acc"
    ],
    "accel": [
      "Ускорение  10–100 Hz",
      "int16 (N×3) · accel_scale"
    ],
    "gpsPrep": [
      "Подготовка GPS",
      "Фильтр спайков/Доплера · сглаживание · Speed"
    ],
    "accelPrep": [
      "Подготовка Accel",
      "Величина → Вертикаль · FFT-полоса"
    ],
    "model": [
      "ML-модель фойла — RandomForest, ±5 s контекст",
      "Fallback без Accel: GPS-State-Machine (гистерезис + выдержка)"
    ],
    "mask": [
      "Маска фойлинга",
      "foil / not-foil — в секунду"
    ],
    "seg": [
      "Сегментация → лауны",
      "Закрытие лакун · слияние · старт/конец захвата"
    ],
    "pumps": [
      "Подсчёт Pumps",
      "кадансия-управляемый, за лаун"
    ],
    "glide": [
      "Глайд-фазы",
      "Лакуны между Pumps"
    ]
  },
  "mag": {
    "h": "Шаг 1 — Величина вместо осей",
    "p": "Часы на запястье и постоянно поворачиваются — три оси X/Y/Z постоянно показывают в разные стороны. Одиночное значение оси бесполезно. Спасение в **величине** вектора:",
    "formula": "|a| = √(x² + y² + z²) / accel_scale",
    "p2": "Величина **инвариантна по ориентации**: неважно как часы повёрнуты, 2-g толчок остаётся 2-g толчком. Это делает сигнал вообще сравнимым (`magnitude_g`).",
    "cap": "Три отдельно бессмысленные оси (часы постоянно кренятся) вместе дают стабильную, инвариантную по ориентации величину |a|.",
    "label": "|a| = √(x²+y²+z²)"
  },
  "vert": {
    "h": "Шаг 2 — с запястья в вертикаль",
    "p": "У величины есть подвох: Pump это **вверх-толчок**, но `|a|` считает вниз-толчок также как вверх-толчок — каждый Pump появляется дважды. Лучше была бы настоящая **вертикальное ускорение против гравитации**. И это можно восстановить, вообще без гироскопа:",
    "ol": [
      "**Направление гравитации** меняется только медленно → по **низкочастотному фильтру** (< 0,25 Hz) за каждую ось оценить. Это даёт вектор `g`, который всегда указывает «вниз».",
      "**Динамическое** ускорение это `a − g`.",
      "Это **спроецировать** на единичный вектор гравитации → скалярный сигнал: > 0 = вверх (Push)."
    ],
    "f1": "v(t) = (a − g) · ĝ",
    "fMid": "где",
    "f2": "ĝ = g / |g|",
    "cap": "Медленно дрейфующая гравитация g (низкочастотный фильтр) разделяет ориентацию от динамики. Динамическое ускорение a−g, спроецированное на ĝ, даёт чистый вверх-толчок за Pump.",
    "gLabel": "g (гравитация)",
    "aLabel": "a (измеренное)",
    "amg": "a − g",
    "topNote": "|Величина|: каждый Pump дважды",
    "botNote": "v(t) против гравитации: один Push за Pump"
  },
  "win": {
    "h": "Шаг 3 — Скользящее окно & FFT-полоса",
    "p": "Pumping это **ритмичное** — и ритм живёт в частотной области. Поэтому **скользящее окно** (типично 4 s шириной, шаг все 2 s) скользит по сигналу, и за каждое окно **FFT** вычисляет спектр. Два диапазона важны:",
    "li": [
      "**Фильтр-диапазон 0,3–3 Hz** — всё ниже это гравитация/дрейф, всё выше это шум брызг. Оба по FFT-полосе зануляются (`bandpass_fft`).",
      "**Pump-диапазон 0,5–2 Hz** — здесь живёт Pump-кадансия (30–120 Pumps/мин)."
    ],
    "p2": "За окно выпадают четыре признака:",
    "li2": [
      "**dom_freq** — доминирующая частота в Pump-диапазоне (Pump-частота)",
      "**band_power_ratio** — доля энергии в Pump-диапазоне от всего диапазона (высоко = чёткий ритм)",
      "**rms** — мощность сигнала (амплитуда движения)",
      "**spectral_entropy** — как «чистый» спектр (низко = одна чёткая частота = Pumping; высоко = хаос = шум/глайд)"
    ],
    "cap": "4-s окно идёт над фильтрованным сигналом (шаг 2 s → перекрытие). За каждое окно FFT даёт спектр; энергия в Pump-диапазоне 0,5–2 Hz выдаёт частоту и ритм.",
    "winT": "Окно t",
    "winT1": "Окно t+1",
    "sig": "v(t) — полоса-фильтрована (0,3–3 Hz)",
    "fft": "FFT",
    "spec": "Спектр",
    "band": "0,5–2 Hz",
    "freq": "Частота →"
  },
  "rate": {
    "h": "Нерд-деталь: реальная частота дискретизации",
    "p": "Некоторые часы **врут** о своей частоте. Forerunner 55 маркирует «10 Hz», доставляет на самом деле только ~2,5 Hz. Частотные признаки и Pump-кадансия были бы мусором. Поэтому сервер определяет частоту **общим способом из самих данных**: `real_Hz = Anzahl_Accel-Samples / GPS-Duration`. Если это > 25 % от дня, используется измеренная частота. И если она **ниже 15 Hz**, сигнал слишком грубый для частотного анализа → сессия вычисляется как **GPS-only** (Pumps n/a, вместо этого честные границы вместо фантазийных значений)."
  },
  "ml": {
    "h": "Где я на фойле? — ML-модель",
    "p": "Находишься ли ты **на фойле** в секунду, решает **RandomForest** — лес деревьев решений, голосующих большинством. Маленький и интерпретируемый, глубокое обучение не нужно. За секунду он получает **14 признаков**:",
    "li": [
      "**7 из Speed & Accel**: Speed сейчас / 3 s / 5 s (медиана), вариабельность Speed, плюс RMS в три диапазона (общий, Pump-диапазон, высокочастотный).",
      "**7 из GPS-пути**: изменение Speed за 1/3/5 s, длина пути, чистое смещение, **прямолинейность** (чистое/путь) и изменение курса. Эти признаки направления были самым большим рычагом в эксперименте — они держат спокойные глайд-фазы в лауне, вместо того чтобы его фрагментировать."
    ],
    "p2": "Трюк в **контексте**: каждая секунда не классифицируется изолированно, а вместе с **±5 соседних секунд** («Windowize»). Вектор признаков секунды таким образом 14 × 11 = 154 числа длинный. Так модель видит направление — короткий Speed-провал посередине круиза не сразу оценивается как «вышли». Это привело фрагментацию с 1,10× на 1,00× и F1-скор с **0,93 на 0,97**.",
    "cap": "За секунду 14-признаковый вектор; для классификации прилагаются соседние ±5 секунд (центральный лейбл). RandomForest голосует → foil / not-foil.",
    "featNote": "Секундные окна: 14 признаков в секунду, ±5 s контекст",
    "forest": "RandomForest (большинство)",
    "maskNote": "Маска в секунду: foil ▮ / not-foil ▯"
  },
  "seg": {
    "h": "От маски к лаунам",
    "p": "Маска за секунду ещё дырявая. Она формируется в чистые **лауны**:",
    "li": [
      "**Закрыть короткие лакуны** (до ~2 s): пауза глайда не разбивает лаун.",
      "**Физический минимум**: ниже ~9 km/h нет подъема фойла, и без реального смещения позиции (не просто Speed-поле) ты не на фойле — оба обрезают мягкие края.",
      "**Минимальная длина & Ø-Speed**: сегменты < 5 s или с недостаточным средним вылетают (быстрая ходьба ≠ фойлинг).",
      "**GPS-dropout разделяет**: лакуна Sample > 15 s (часы под водой/падение) заканчивает лаун — время лакуны не считается как время лауна.",
      "**«Нет-стоп»-слияние**: если Speed между двумя распознанными лаунами **никогда** не падал ниже ~5,4 km/h и не было dropout, это на самом деле был **один** лаун (выпадение модели) → объединить, неважно как долго."
    ],
    "p2": "Без хорошего ускорения (GPS-only) берёт **State-Machine** с **гистерезисом** и **выдержкой**: ты становишься «фойлящим» только после нескольких секунд в Speed-диапазоне *при гладком Speed* (глайд гладкий, гребля рубленая) — и выходишь из состояния только после нескольких секунд ниже. Два порога (вход/выход) предотвращают мерцание на краю.",
    "cap": "Вверху: дырявая маска за секунду становится лаунами (лакуны закрыты, слияние, короткие сегменты отброшены). Внизу: гистерезис GPS-State-Machine — вход только выше, выход только ниже, с выдержкой (Dwell).",
    "maskLabel": "Маска (в секунду)",
    "runs": "Лауны",
    "run1": "Лаун 1 (лакуны закрыты)",
    "run2": "Лаун 2",
    "tooShort": "· слишком короткий → отброшен",
    "hyst": "Гистерезис + Выдержка (GPS-fallback)",
    "enter": "ENTER ~10 km/h",
    "exit": "EXIT ~9 km/h"
  },
  "se": {
    "h": "Старт & Конец — с точностью к подсекунде",
    "p": "Модель работает в секундном растере, но **отрыв** это резкое событие. Поэтому начало лауна **схватывается на прыжок-импульс**: очень сильный спайк величины (> 3,5× 95-перцентиля — в эксперименте прыжок был ~4,3×, Pump только ~2,3×, таким образом чётко разделимо). Самый ранний такой импульс в окне ±несколько секунд отмечает истинный отрыв — с точностью к подсекунде между двумя GPS-точками интерполировано. Если импульса нет, сервер тащит старт по рампе ускорения до последнего квази-стопа.",
    "p2": "В **конце** ловушки двойные: **Dead-Reckoning-дрейф** (часы погружаются, экстраполируют GPS и «дрейфуют» на берег) отбрасываются — предварительное знание: лаун никогда не кончается береговнее, чем начинается. И где известна **OSM-водная поверхность**, Start и End должны быть **в воде** (точка-в-полигоне через ray-casting), иначе обрезается обратно на последний настоящий водный Sample. Наконец, конец ещё классифицируется как **падение** (абrupt Speed-падение с «на фойле» на «в воде», или GPS-dropout) или **контролируемый стоп**.",
    "cap": "Распознанный секундный старт (серый) захватывается на резкий прыжок-импульс в величине ускорения (голубой) — истинный фойл-старт.",
    "thr": "3,5 × p95 (прыжок-порог)",
    "secStart": "Секундный старт",
    "snapped": "← захвачено на прыжок",
    "afterPump": "после: Pump-ритм"
  },
  "pump": {
    "h": "Подсчёт Pumps — кадансия-управляемый (v3)",
    "p": "Очевидный путь — «подсчитай все пики выше порога амплитуды» — **структурно недооценивает в ~2×**: подбирает только самые большие взлёты и пропускает меньшие, ритмичные Pumps между ними. Против **истины** (мой припечатанный Pump-truth, см. ниже) это попало только ~40 %.",
    "p2": "Лучший подход это **кадансия-управляемый**: В ритмичных, энергетичных разделах локальная FFT оценивает **текущую Pump-частоту**, и потом **за каждый период кадансии ровно один** настоящий локальный максимум выбирается как Pump. Кадансия локально-адаптивная, так что следует изменениям темпа. Результат: **85–94 %** попаданий вместо 40 % — и счётчик и маркеры карты автоматически согласованы (оба из одних позиций). RMS-ворота предотвращают ритм-свободные глайд-фазы от подсчёта.",
    "cap": "Амплитудный порог (вверху) видит только толстые пики. Кадансия-управляемый (внизу): оценить локальный период T, за период подобрать истинный максимум — даже мягкие Pumps.",
    "top": "Амплитудный порог — пропускает мягкие Pumps",
    "bot": "Кадансия-управляемый — один пик на период T"
  },
  "glide": {
    "h": "Глайд-фазы — тишина между Pumps",
    "p": "Ровно то, что Часть 1 назвала наибольшим потенциалом, почти вылезает как подарок: Если Pump-времена известны, **глайд-фазы это просто лакуны между ними** — плюс разгон от лаун-старта до первого Pump (*lead*) и раскат от последнего Pump до конца (*tail*). Отсюда за лаун выпадают **количество**, **Ø-глайд-длительность** и **самая длинная глайд-фаза** — показатель того, как эффективно фойл держит импульс.",
    "cap": "Pumps (маркеры) разделяют лаун; лакуны между ними это глайд-фазы. lead = Start→1. Pump, tail = последний Pump→End. Длинный tail = чистый раскат.",
    "start": "Старт",
    "end": "Конец",
    "pumps": "Pumps",
    "lead": "lead",
    "tail": "tail (глайд)",
    "gaps": "Лакуны = глайд-фазы"
  },
  "gpsonly": {
    "h": "Без Accel: GPS-only и его ловушки",
    "p": "Импортированные сессии (например от Polar) или часы с слишком грубой частотой не имеют **хорошего ускорения**. Тогда несёт только GPS — и у него есть особенности:",
    "li": [
      "**Одиночные спайки** (Доплер-глич, «телепорт»): заменены против локальной медианы или сглажены скачки туда-обратно.",
      "**Многосекундные Доплер-всплески** (~3 s на 50 km/h, но ниже 90-km/h-глич-порога): заменены против робастной **15-s-медианы** — она невосприимчива к коротким всплескам, настоящий удерживаемый лаун её поднимает и остаётся нетронут. Два условия (относительно выше медианы **и** абсолютно выше ~28 km/h) защищают настоящие лауны.",
      "**30-km/h-Pumpfoil-ворота**: без Accel нельзя безопасно отличить Pumpfoil от моторизованного фойлинга (Kite/Wind/Wake). Если сглаженный топ-Speed выше 30 km/h, сессия считается моторизованной → **нет** Pumpfoil. С Accel это ворота отпадают — там расчёты доверяют Pump-/On-Foil-сигналу."
    ]
  },
  "label": {
    "h": "Откуда истина — антиппинг Pumps",
    "p": "Модели нужна **истина**, против которой кадансия-управляемый Pump-счётчик калибруется — и я ввожу её себе сейчас. Я смотрю **видео** лауна и **антипираю на каждом настоящем Pump** кнопку. Это я делаю в **нескольких takes**; они вычисляются через кросс-корреляцию в **консенсус** (малые время-реакции-сдвиги усредняются). Результат: настоящее Pump-количество и настоящее время за лаун. Это сознательно **переходный** — достаточно точный чтобы сегодня калибровать, но введённый рукой.",
    "p2": "Важное при калибровке против таких лейблов: **GroupKFold** вместо нормальной кросс-валидации. Соседние секунды одного лауна почти идентичны — попадись они вместе в тренировку и тест, модель себя спросит (утечка) и доложит мечтательные значения. GroupKFold поэтому держит **целые сессии** вместе: тестируется всегда на лаунах, которые модель никогда не видела.",
    "cap": "Цикл: **введённая** Pump-истина → признаки → RandomForest → foil_rf.pkl → разработка каждой сессии. Новые антиппы текут обратно, модель пересчитывается.",
    "fits": [
      "Antipate Pumps",
      "Видео · несколько takes"
    ],
    "feats": [
      "Признаки",
      "14 × ±5 s контекст"
    ],
    "rf": [
      "RandomForest",
      "GroupKFold-CV"
    ],
    "pkl": [
      "foil_rf.pkl",
      "→ каждая сессия"
    ],
    "loopNote": "новые введённые лауны → пересчитать"
  },
  "x5": {
    "h": "Следующий шаг — настоящая истина через камеру (Insta360 X5)",
    "p": "Антиппинг достаточно хороший для запуска, но зависит от моего времени реакции. **Физически точная** истина придёт дальше от **камеры на доске**: Insta360 X5 снимает мачту/фойл с, и из видео читают **кадр-точно** когда фойл получает давление и когда летит. С этим калибруем Pump-время и On-Foil-распознавание против настоящей физики вместо введённого приближения. Как только риг встанет, здесь приходит целая секция с полной установкой камеры."
  },
  "summary": {
    "h": "Весь путь в одном предложении",
    "p1": "Сырое int16-ускорение → **величина** → **вертикаль против гравитации** → **FFT-полоса** в скользящем окне → 14 признаков за секунду с **±5 s контекстом** → **RandomForest** говорит on-foil/не → **сегментация** в лауны (гистерезис, слияние, dropout) → старт на **прыжок-импульс** захвачен, конец против **водной поверхности** & дрейф исправлен → **кадансия-управляемый** подсчёт Pump → глайд-фазы как лакуны → показатели.",
    "p2": "И всё это из **одних часов на запястье** — часы на мачте из Части 1 были только эталоном, что это правда."
  },
  "limits": {
    "h": "Ограничения (продолжая быть честным)",
    "p": "Часы на запястье, не на доске — руки машут для баланса и накладываются на Pump-сигнал («Wrist-Confound»). Вертикаль оценивается из направления гравитации (нет гироскопа) и при длительном ускорении слегка искажена. Кадансия-управляемый счётчик калибруется против приложения и видео-истины, но **физическая** конечная калибровка (камера на доске, Insta360 X5) ещё не начата. И GPS-only ворота это компромисс: лучше честно «gps_only, Pumps n/a» чем выдуманные числа."
  }
};


const zh: N2 = {
  "back": "← 极客分析（第1部分：实验）",
  "h1": "极客分析 · 第2部分",
  "subtitle": "从原始传感器数字变成泵动、着翼运行、启动/结束和滑行阶段 — 信号处理、滑动窗口、ML模型和标记，一步步来。",
  "intro": "在[第1部分](/nerd-analysen)中，讨论的是**真相**：翼面桅杆上的第二块表，它揭示翼面真正在做什么。这里讨论的是**机器**：服务器计算什么，使得从手腕上的信号波动变成干净的会话评估。以下所有内容都发生在**服务器端** — 表只是一个薄型记录器。",
  "raw": {
    "h": "进入的东西：原始数据",
    "p": "每个会话由两个流组成，两者都有共同的时间基准（从录音开始的毫秒）：",
    "li": [
      "**GPS**，约**1 Hz**：每个样本`[t_ms, lat, lon, speed_mps, hr_bpm, h_acc_m]`。速度和脉搏可能缺失（然后从位置派生或为空）。",
      "**加速度**，取决于表**10–100 Hz**：一个`int16`数组，形式为`(N × 3)` — X/Y/Z原始计数。一个`accel_scale`（计数每g）将其转换为物理g。"
    ],
    "p2": "为什么`int16`而不是浮点？带宽。100 Hz × 3轴 × 8小时是数百万个值 — 作为2字节整数，这将上传大小减半。缩放回g发生在服务器上。"
  },
  "pipe": {
    "h": "管道一览",
    "p": "两条处理路线（GPS + Accel）进入一个ML模型，该模型**每秒**决定「在翼面上 — 是/否」。从此得出连接的运行，其启动/结束经过微调，最后是每次运行的泵动和滑行阶段：",
    "cap": "完整评估：从两个原始数据流通过着翼掩码到运行、泵动和滑行阶段。",
    "gps": [
      "GPS  约1 Hz",
      "t, lat, lon, speed, hr, h_acc"
    ],
    "accel": [
      "加速度  10–100 Hz",
      "int16 (N×3) · accel_scale"
    ],
    "gpsPrep": [
      "准备GPS",
      "尖峰/多普勒滤波 · 平滑 · 速度"
    ],
    "accelPrep": [
      "准备加速度",
      "幅度 → 竖直 · FFT带通"
    ],
    "model": [
      "ML着翼模型 — RandomForest，±5秒上下文",
      "无Accel时回退：GPS状态机（迟滞 + 驻留）"
    ],
    "mask": [
      "着翼掩码",
      "着翼 / 非着翼 — 每秒"
    ],
    "seg": [
      "分段 → 运行",
      "关闭缝隙 · 合并 · 启动/结束对齐"
    ],
    "pumps": [
      "计数泵动",
      "频率引导，每次运行"
    ],
    "glide": [
      "滑行阶段",
      "泵动之间的缝隙"
    ]
  },
  "mag": {
    "h": "步骤1 — 幅度而非轴",
    "p": "表坐在手腕上并不断旋转 — 三个轴X/Y/Z总是指向不同的方向。单个轴值因此毫无价值。救赎是向量的**幅度**：",
    "formula": "|a| = √(x² + y² + z²) / accel_scale",
    "p2": "幅度是**方向不变的**：无论表如何旋转，2g冲击仍然是2g冲击。这样信号首先变得可比较（`magnitude_g`）。",
    "cap": "三个单独的无意义轴（表不断倾斜）一起产生稳定的、方向不变的幅度|a|。",
    "label": "|a| = √(x²+y²+z²)"
  },
  "vert": {
    "h": "步骤2 — 从手腕到竖直",
    "p": "幅度有一个问题：泵动是一个**向上推动**，但`|a|`同样计算向下的划和向上的划 — 每个泵动都出现两次。更好的是真正的**对抗重力的竖直加速度**。它可以在没有陀螺仪的情况下重建：",
    "ol": [
      "**重力方向**变化缓慢 → 通过**低通**（< 0.25 Hz）估计每轴。这产生向量`g`，始终「向下」指向。",
      "**动态**加速度是`a − g`。",
      "**投影**到重力单位向量 → 标量信号：> 0 = 向上（推动）。"
    ],
    "f1": "v(t) = (a − g) · ĝ",
    "fMid": "其中",
    "f2": "ĝ = g / |g|",
    "cap": "缓慢漂移的重力g（低通）将方向与动力分开。动态加速度a−g，投影到ĝ，为每个泵动产生干净的向上推动。",
    "gLabel": "g（重力）",
    "aLabel": "a（测量）",
    "amg": "a − g",
    "topNote": "|幅度|：每个泵动加倍",
    "botNote": "v(t)对重力：每个泵动一个推动"
  },
  "win": {
    "h": "步骤3 — 滑动窗口 & FFT带通",
    "p": "泵动是**节奏性的** — 节奏在频率域中活跃。因此一个**滑动窗口**（典型4秒宽，每隔2秒一步）在信号上滑动，对每个窗口，**FFT**计算频谱。两个频带很重要：",
    "li": [
      "**滤波频带0.3–3 Hz** — 以下全是重力/漂移，以上全是飞溅噪声。两者都通过FFT带通零化（`bandpass_fft`）。",
      "**泵动频带0.5–2 Hz** — 泵动频率在这里（30–120泵/分钟）。"
    ],
    "p2": "每个窗口产生四个特征：",
    "li2": [
      "**dom_freq** — 泵动频带中的主导频率（泵动频率）",
      "**band_power_ratio** — 泵动频带中的能量占总频带的比例（高 = 清晰节奏）",
      "**rms** — 信号强度（运动幅度）",
      "**spectral_entropy** — 频谱有多「整洁」（低 = 一个清晰频率 = 泵动；高 = 混乱 = 噪声/滑行）"
    ],
    "cap": "一个4秒窗口在过滤后的信号上滑动（步骤2秒 → 重叠）。对每个窗口，FFT提供频谱；泵动频带0.5–2 Hz中的能量揭示频率和节奏。",
    "winT": "窗口t",
    "winT1": "窗口t+1",
    "sig": "v(t) — 带通过滤（0.3–3 Hz）",
    "fft": "FFT",
    "spec": "频谱",
    "band": "0.5–2 Hz",
    "freq": "频率 →"
  },
  "rate": {
    "h": "一个极客细节：真实采样率",
    "p": "某些表**谎称**它们的频率。Forerunner 55标记「10 Hz」，实际上只提供~2.5 Hz。频率特征和泵动频率会因此变成垃圾。因此服务器**从数据本身通用地**确定频率：`真实Hz = Accel样本数 / GPS持续时间`。如果这与标签偏差 > 25%，则采用测量的频率。如果它**低于15 Hz**，信号对频率分析太粗糙 → 会话被评估为**仅GPS**（泵动不适用，相反为诚实的边界而不是虚假值）。"
  },
  "ml": {
    "h": "我在翼面上吗？— ML模型",
    "p": "是否在某一秒**在翼面上**由一个**RandomForest**决定 — 一片由决策树组成的森林，通过多数投票表决。小而可解释，不需要深度学习。每秒它获得**14个特征**：",
    "li": [
      "**7来自速度和Accel**：现在/3秒/5秒的速度（中位数）、速度变率，加上三个频带中的RMS（总体、泵动频带、高频）。",
      "**7来自GPS路径**：1/3/5秒的速度变化、路径长度、净偏移、**直线性**（净/路径）和航向变化。这些方向特征在实验中是最大的杠杆 — 它们在运行中保持安静的滑行阶段，而不是将其分割。"
    ],
    "p2": "诀窍是**上下文**：每秒不是单独分类，而是与**±5个邻近秒**（「窗口化」）一起分类。一秒的特征向量因此是14 × 11 = 154个数字长。这样模型看到进展 — 巡航中的短速度下降不会立即被评估为「离开」。这将碎片化从1.10×降至1.00×，F1分数从**0.93增至0.97**。",
    "cap": "每秒一个14特征向量；为了分类，±5个邻近秒被附加（中心标签）。RandomForest投票表决 → 着翼 / 非着翼。",
    "featNote": "秒窗口：每秒14个特征，±5秒上下文",
    "forest": "RandomForest（多数）",
    "maskNote": "每秒掩码：着翼 ▮ / 非着翼 ▯"
  },
  "seg": {
    "h": "从掩码到运行",
    "p": "秒掩码仍有漏洞。它形成为干净的**运行**：",
    "li": [
      "**关闭短缝隙**（至~2秒）：滑行暂停不分割运行。",
      "**物理底线**：低于~9 km/h没有翼面支撑，没有真实位置移动（不仅仅是速度域）就不在翼面上 — 两者都切掉柔软的边缘。",
      "**最小长度和平均速度**：长度低于5秒或平均值太低的分段被舍弃（快速走路 ≠ 着翼）。",
      "**GPS掉线分割**：样本缝隙 > 15秒（表在水下/摔倒）结束运行 — 缝隙时间不计为飞行时间。",
      "**「无停止」合并**：如果两个识别的运行之间速度**从不**低于~5.4 km/h且没有掉线，实际上是**一个**运行（模型故障） → 合并，无论多长。"
    ],
    "p2": "没有可用的加速度（仅GPS），一个**状态机**用**迟滞**和**驻留**接管：在速度频带内的多个秒后，你首先变成「着翼」*伴随平滑速度*（滑行平滑，划桨不平滑） — 并在下方多个秒后离开状态。两个阈值（进/出）防止边界处的闪烁。",
    "cap": "上面：有漏洞的秒掩码变成运行（关闭缝隙、合并、舍弃短分段）。下面：GPS状态机的迟滞 — 进入在上方、离开在下方，带有驻留时间（Dwell）。",
    "maskLabel": "掩码（每秒）",
    "runs": "运行",
    "run1": "运行1（缝隙已关闭）",
    "run2": "运行2",
    "tooShort": "· 太短 → 已舍弃",
    "hyst": "迟滞 + 驻留（GPS回退）",
    "enter": "进入~10 km/h",
    "exit": "离开~9 km/h"
  },
  "se": {
    "h": "启动和结束 — 亚秒精度",
    "p": "模型在秒栅格上工作，但**起跳**是一个尖锐事件。因此运行启动在**跳跃冲击**上对齐：一个非常强的幅度尖峰（> 3.5×第95百分位 — 在实验中跳跃约4.3×，泵动仅约2.3×，所以清晰可分）。窗口±几秒内的最早这样的冲击标记真实的起跳 — 亚秒精度，在两个GPS点之间插值。缺少冲击时，服务器通过加速度斜坡将启动拉回到最后的准停止。",
    "p2": "在**结束**有两个陷阱：**死算法漂移**（表潜入水下，外推GPS并「漂移」到陆地）被舍弃 — 先验：运行永远不会在比其启动更靠陆的地方结束。还有**已知OSM水表面**，启动和结束必须**在水中**（通过光线投射的点在多边形）否则会切回到最后真实的水样本。最后，结束被分类为**摔倒**（从「在翼面上」到「在水中」的突然速度下降，或GPS掉线）或**受控停止**。",
    "cap": "识别的秒启动（灰色）对齐到加速度幅度中的尖锐起跳冲击（青绿色）— 真正的着翼启动。",
    "thr": "3.5 × p95（跳跃阈值）",
    "secStart": "秒启动",
    "snapped": "← 对齐到起跳",
    "afterPump": "之后：泵动节奏"
  },
  "pump": {
    "h": "计数泵动 — 频率引导（v3）",
    "p": "显而易见的方式 — 「计算所有幅度阈值上的峰值」— **结构性低估约2倍**：它仅挑选最大的激荡并吞掉中间的较小、节奏性泵动。反对**真相**（我的点击泵动真相，见下文）它仅命中~40%。",
    "p2": "更好的方法是**频率引导**：在节奏性、高能量的部分中，本地FFT估计**当前泵动频率**，然后**每个频率周期恰好选择一个**真实局部最大值作为泵动。频率是局部自适应的，因此遵循速度变化。结果：**85–94%**命中而不是40% — 计数器和地图标记自动一致（两者来自相同位置）。RMS门防止节奏性的滑行阶段被计入。",
    "cap": "幅度阈值（上面）仅看到粗峰值。频率引导（下面）：估计局部周期T，每个周期选择真实最大值 — 也包括温和的泵动。",
    "top": "幅度阈值 — 吞掉小泵动",
    "bot": "频率引导 — 每个周期T一个峰值"
  },
  "glide": {
    "h": "滑行阶段 — 泵动之间的寂静",
    "p": "恰好第1部分称为最大潜力的东西，现在几乎是免费得到的：已知泵动时间点后，**滑行阶段简单地是其间的缝隙** — 加上从运行启动到第一个泵动的助跑（*lead*）和从最后泵动到结束的衰减（*tail*）。从此每次运行产生**数字**、**平均滑行持续时间**和**最长滑行阶段** — 翼面保持动量效率的度量。",
    "cap": "泵动（标记）分割运行；其间的缝隙是滑行阶段。lead = 启动→1.泵动，tail = 最后泵动→结束。长tail = 干净衰退。",
    "start": "启动",
    "end": "结束",
    "pumps": "泵动",
    "lead": "lead",
    "tail": "tail（滑行）",
    "gaps": "缝隙 = 滑行阶段"
  },
  "gpsonly": {
    "h": "没有Accel：仅GPS及其陷阱",
    "p": "进口的会话（例如来自Polar）或速率太粗的表**没有可用的加速度**。那么仅GPS负责 — 它有怪癖：",
    "li": [
      "**单一尖峰**（多普勒故障、「传送」）：对本地中位数替换或往返跳跃平滑。",
      "**多秒多普勒突发**（~3秒至50 km/h，但在90 km/h故障阈值下）：对鲁棒**15秒中位数**替换 — 它对短突发不敏感，真实保持的运行用其提升并保持不变。两个条件（相对超过中位数**和**绝对超过~28 km/h）保护真实运行。",
      "**30 km/h泵翼门**：没有Accel无法安全地将泵翼与动力着翼（风筝/风/尾流）分离。如果平滑的最高速度超过30 km/h，会话被视为动力 → **无**泵翼。有Accel此门被移除 — 那里评估依赖泵动/着翼信号。"
    ]
  },
  "label": {
    "h": "真相来自哪里 — 点击泵动",
    "p": "模型需要一个**真相**，对抗该频率引导的泵动计数器被校准 — 我目前自己点击它。我看**运行视频**并在**每个真实泵动点击一个按钮**。我用**多次尝试**做这个；它们通过互相关计算为**共识**（小反应时间偏移平均出去）。结果：真实泵动数和每次运行的真实时间。这有意是一个**过渡** — 足够精确以今天校准，但手工点击。",
    "p2": "针对这样的标签校准时的重要事项：**GroupKFold**而不是正常交叉验证。同一运行的邻近秒几乎相同 — 如果它们同时进入训练和测试集，模型会自我检查（泄漏）并报告梦幻值。因此GroupKFold保持**整个会话**在一起：测试总是在模型从未见过的运行上进行。",
    "cap": "循环：**点击**泵动真相 → 特征 → RandomForest → foil_rf.pkl → 每个会话评估。新的点击流回，模型重新校准。",
    "fits": [
      "点击泵动",
      "视频 · 多次尝试"
    ],
    "feats": [
      "特征",
      "14 × ±5秒上下文"
    ],
    "rf": [
      "RandomForest",
      "GroupKFold-CV"
    ],
    "pkl": [
      "foil_rf.pkl",
      "→ 每个会话"
    ],
    "loopNote": "新点击的运行 → 重新校准"
  },
  "x5": {
    "h": "下一步 — 通过摄像机的真正真相（Insta360 X5）",
    "p": "点击足够好以自举，但挂在我的反应时间上。**物理精确**的真相接下来来自**板上摄像机**：Insta360 X5电影桅杆/翼面与，并从视频**逐帧**读取翼面何时真的受压以及何时飞行。我们用这个对真正的物理而不是点击的近似校准泵动时间和着翼识别。一旦钻机设置，这里会有完整的摄像机设置自己的部分。"
  },
  "summary": {
    "h": "整个方式一句话",
    "p1": "原始int16加速度 → **幅度** → **对重力的竖直** → **滑动窗口中的FFT带通** → 每秒14个特征带**±5秒上下文** → **RandomForest**说着翼/否则 → **分段**到运行（迟滞、合并、掉线） → 启动**对跳跃冲击**对齐，结束对**水表面**和漂移更正 → **频率引导的**泵动计数 → 滑行阶段作为缝隙 → 关键数字。",
    "p2": "所有这一切来自**一块手腕表** — 第1部分的桅杆表只是参考，显示它是正确的。"
  },
  "limits": {
    "h": "限制（继续诚实）",
    "p": "表坐在手腕上，不在板上 — 手臂挥动以平衡并覆盖泵动信号（「手腕困扰」）。竖直从重力方向估计（无陀螺仪），在持续加速时轻微失真。频率引导的计数器对应用和视频真相校准，但**物理**最终校准（板上摄像机，Insta360 X5）仍待定。仅GPS门是一个妥协：更喜欢诚实「gps_only，泵动不适用」而不是虚构的数字。"
  }
};

export const NERD2: Partial<Record<Lang, N2>> = { zh, ru, pt, "pt-PT": ptPT, nb, ja, id,
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
