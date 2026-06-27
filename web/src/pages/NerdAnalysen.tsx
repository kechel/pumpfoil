import { Link } from "react-router-dom";
import { NerdIcon } from "../components/Icons";

// Nerd-Analysen — Easter-Egg-Seite: das Dual-Watch-Pumpfoil-Experiment (2026-06-27)
// mit allen relevanten Grafiken & Erkenntnissen. Bewusst nur auf Deutsch.
// Bilder: Analyse-Plots unter /nerd/, Aufbau-Fotos unter /media/photos/.

function Fig({ src, caption }: { src: string; caption: string }) {
  return (
    <figure className="my-5 overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
      <a href={src} target="_blank" rel="noreferrer">
        <img src={src} alt={caption} loading="lazy" className="w-full bg-slate-950" />
      </a>
      <figcaption className="px-3 py-2 text-xs text-slate-400">{caption}</figcaption>
    </figure>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 rounded-xl border border-brand-700/50 bg-brand-950/20 p-4 text-sm text-slate-200">
      {children}
    </div>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-10 border-b border-slate-800 pb-1 text-lg font-bold text-slate-100">{children}</h2>;
}

export default function NerdAnalysen() {
  const photo = (h: string) => `/media/photos/${h}.webp`;
  return (
    <div className="w-full">
      <Link to="/" className="text-sm text-brand-400 hover:underline">← Zurück</Link>
      <h1 className="mb-1 mt-4 flex items-center gap-2 text-2xl font-bold">
        <NerdIcon className="h-7 w-7 text-brand-400" /> Nerd-Analysen
      </h1>
      <p className="mb-2 text-sm text-slate-400">
        Dual-Watch-Pumpfoil-Experiment · Illmensee, 27.06.2026 · rohe Beschleunigungs-Daten,
        viel Signalverarbeitung und ein bisschen Foil-Physik. Für alle, die's genau wissen wollen.
      </p>

      <p className="text-sm text-slate-300">
        Frage: Was kann man aus den Bewegungsdaten eines Pumpfoil-Laufs wirklich herauslesen — und
        können wir damit die Pump-, On-Foil- und Gleit-Erkennung verbessern? Dafür haben wir einen
        Lauf <b>gleichzeitig mit zwei Uhren</b> aufgezeichnet: einer am Handgelenk und einer
        <b> direkt am Foil-Mast, unter Wasser</b> — die „Wahrheit" über das, was der Foil tut.
      </p>

      <H>Der Aufbau</H>
      <p className="text-sm text-slate-300">
        <b>fenix</b> am Handgelenk (25/100 Hz, gutes GPS) — das ist die Uhr, die wir später im Produkt
        haben. <b>Forerunner 55</b> am Foil-Mast festgezurrt, <b>unter Wasser</b>, über Kopf, mit dem
        Start-Knopf in Fahrtrichtung. Beide liefen auf unserer eigenen Recorder-App (v1.0.37). Die
        Mast-Uhr hat unter Wasser <b>kein GPS</b> — sie misst nur die rohe Beschleunigung des Foils.
      </p>
      <div className="my-5 grid grid-cols-3 gap-3">
        <img src={photo("54d4248e35634dd6a9a4cda1a5f71b37")} alt="Foil mit Mast-Uhr am Steg" className="aspect-[3/4] w-full rounded-xl border border-slate-800 object-cover" />
        <img src={photo("0bb596ff35864bfe8951cfa594038052")} alt="FR55 am Mast — Auto-Start" className="aspect-[3/4] w-full rounded-xl border border-slate-800 object-cover" />
        <img src={photo("979ca9ffa5f44f9cb0441f0b430bfd22")} alt="FR55 am Mast — GPS-Suche" className="aspect-[3/4] w-full rounded-xl border border-slate-800 object-cover" />
      </div>
      <img src={photo("4987d350f41c4e93813eda148c85f625")} alt="Spot Illmensee bei Sonnenuntergang" className="my-3 w-full rounded-xl border border-slate-800" />

      <H>Die Daten</H>
      <p className="text-sm text-slate-300">
        Statt der (auf der schwachen FR55 abbrechenden) Roh-Chunks haben wir die <b>Original-FIT-Dateien</b>
        aus Garmin Connect ausgewertet: fenix <b>100 Hz</b>, Mast <b>25 Hz</b>, jeweils über den ganzen Lauf.
        Beide Uhren laufen über die Systemzeit synchron. Nebenbei fiel ein Skalierungs-Bug auf: Garmin
        liefert die Beschleunigung in Milli-g (÷1000 = g), unsere App deklarierte fälschlich „2048" — das
        verschluckt in der Server-Analyse reale Pump-Fenster (To-do: Fix auf 1000).
      </p>

      <H>Die Startsequenz</H>
      <p className="text-sm text-slate-300">
        Aus den Daten lässt sich der komplette Start rekonstruieren (per Video bestätigt): Das Board liegt
        <b> auf dem Kopf</b> am Steg → wird um <b>180° gedreht</b> und der Foil eingetaucht (oben: FR55-Lage
        kippt von −1 auf +1) → kurz konzentrieren → <b>anschieben</b> mit der Uhr-Hand → die Hand
        <b> schnippt beim Loslassen hoch</b> (4–6 g Arm-Stoß, Sprungenergie) → <b>Sprung & Landung</b> aufs
        Board → Pumpen → fliegen.
      </p>
      <Fig src="/nerd/16_flip_marked.png" caption="Der 180°-Flip des Boards (FR55-Gravitation kippt) und die Start-Zone in den 5 s danach." />
      <Fig src="/nerd/06_start_sequence.png" caption="Start-Sequenz: Board-Flip, Vorbereiten, Push/Sprung, dann die Speed-Rampe ins Foilen." />

      <H>Pumpen, Foilen, Gleiten — die Wahrheit vom Foil</H>
      <p className="text-sm text-slate-300">
        Der Mast sitzt am Foil und „weiß", ob wirklich gepumpt wird und ob der Foil noch fliegt. Schön
        sichtbar am Auslaufen: zuerst hört das <b>Pumpen auf</b> (Wrist-Aktivität → 0), die Geschwindigkeit
        hält aber noch → das ist die <b>Gleitphase</b>; danach kippt der Foil weg (Mast-Ausschlag) und es
        ist vorbei. Genau diese Gleitphase erkennen wir bisher nicht explizit.
      </p>
      <Fig src="/nerd/10_pump_glide_truth.png" caption="GPS-Speed · Wrist-Pump-Aktivität · Foil-Pump (Mast) · Foil-Lage. Am Ende: Pumpen stoppt → Gleiten → Foil-Drop." />

      <H>Die Pump-Kadenz</H>
      <p className="text-sm text-slate-300">
        Gepumpt wird mit <b>≈ 1,29 Hz</b> (~77 Pumps/Minute). Das Handgelenk trifft diese Rate sauber
        (Anzahl & Takt stimmen mit dem Foil-Schub überein) — die Pump-Erkennung läuft also grundsätzlich
        richtig.
      </p>
      <Fig src="/nerd/12_pump_timing.png" caption="Wrist-Pump-Marker vs. Foil-Schub-Peaks — gleiche Kadenz (~1,3 Hz), Takte tracken." />

      <H>Foil-Lage: Nicken dominiert, Vortrieb fore/aft</H>
      <p className="text-sm text-slate-300">
        Beim Pumpen kippst du den Foil über den 85-cm-Mast-Hebel <b>vor/zurück</b> (Nicken), kaum seitlich —
        in den Daten dominiert die Nick- die Roll-Bewegung klar. Und die Beschleunigung des Foils ist
        überwiegend <b>fore/aft (Vortrieb)</b>, nicht vertikal: der Foil schiebt nach vorne, wenn du Druck
        gibst.
      </p>
      <Fig src="/nerd/07_p3_pitch_fit.png" caption="Foil-Lage im Lauf: Nick (fore/aft) ≫ Roll. Pitch und vertikale Last sind gekoppelt." />

      <H>Coole Bilder</H>
      <p className="text-sm text-slate-300">
        Der Track, eingefärbt nach Foil-Lage und Geschwindigkeit (weiß = 0°, rot/blau je Richtung):
      </p>
      <Fig src="/nerd/19_track_colored.png" caption="Foiling-Track nach Nickwinkel, Rollwinkel und Speed. Der Foil hält durchgehend leicht Nase-hoch (Auftrieb)." />
      <Fig src="/nerd/20_track_surge_pumps.png" caption="Track nach Vortrieb (rot=vorwärts) — man sieht jeden Pump-Schub — und die einzelnen Pump-Marker auf dem Pfad." />
      <Fig src="/nerd/21_lage_teppich.png" caption="Lage-Teppich: Nick / Roll / Vortrieb über die Zeit auf einen Blick." />

      <H>Was wir gelernt haben</H>
      <Key>
        <ul className="list-disc space-y-1.5 pl-5">
          <li><b>Pump-Erkennung</b> trifft Rate & Anzahl (~1,29 Hz). Größter Hebel: den accel_scale-Bug (2048 → 1000) fixen.</li>
          <li><b>On-Foil-Erkennung</b> liegt gut — sie zeigt den Steg/Absprung präzise (snappt auf den Aufsprung-Impuls).</li>
          <li><b>Gleitphase / Auslaufen</b>: hier ist das größte Potenzial — „On-Foil ∧ Pump-Aktivität ≈ 0" könnte das Gleiten am Ende explizit ausweisen.</li>
          <li>Alles davon ist <b>nur mit der Handgelenk-Uhr</b> machbar — die Mast-Uhr war nur die Wahrheits-Referenz.</li>
        </ul>
      </Key>

      <H>Grenzen (für die Ehrlichkeit)</H>
      <p className="mb-10 text-sm text-slate-400">
        Die Mast-Uhr ist unter Wasser stark gedämpft, daher sieht sie scharfe Stöße nur abgeschwächt. Die
        „Winkel" stammen aus der Schwerkraft-Richtung (Tiefpass) — im stationären Gleiten echte Lage, bei
        anhaltender Beschleunigung leicht verfälscht; für 100 % saubere Drehwinkel bräuchte man ein Gyroskop.
        Und der genaue Zeit-Versatz einzelner Pumps zwischen den Uhren ließ sich nicht auf {"<"}100 ms
        festnageln (kein sauberer gemeinsamer Fixpunkt; die FR55 hat unter Wasser kein GPS zum Uhr-Stellen).
      </p>
    </div>
  );
}
