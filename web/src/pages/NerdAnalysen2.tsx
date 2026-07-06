import { Link } from "react-router-dom";
import { NerdIcon } from "../components/Icons";

// Nerd-Analysen — Teil 2: Wie die Erkennung wirklich funktioniert.
// Der IT-/Signalverarbeitungs-/ML-Teil hinter Pump-, On-Foil-, Start/Ende- und
// Gleitphasen-Erkennung. Bewusst nur auf Deutsch. Alle Schaubilder sind selbst
// gezeichnete SVGs, die die echte Pipeline (server/app/analysis + ml) abbilden.

// ---------- kleine Bausteine (gleicher Stil wie Teil 1) ----------
function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 mt-10 border-b border-slate-800 pb-1 text-lg font-bold text-slate-100">{children}</h2>;
}
function Key({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-4 rounded-xl border border-brand-700/50 bg-brand-950/20 p-4 text-sm text-slate-200">
      {children}
    </div>
  );
}
function Diagram({ vb, children, caption }: { vb: string; children: React.ReactNode; caption: string }) {
  return (
    <figure className="my-5 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
      <svg viewBox={vb} className="w-full" role="img" aria-label={caption}>
        {children}
      </svg>
      <figcaption className="border-t border-slate-800 px-3 py-2 text-xs text-slate-400">{caption}</figcaption>
    </figure>
  );
}
function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-slate-800/70 px-1 py-0.5 text-[0.85em] text-brand-300">{children}</code>;
}

// SVG-Helfer
const C = {
  grid: "#334155", axis: "#475569", label: "#94a3b8", faint: "#64748b",
  cyan: "#22d3ee", amber: "#f59e0b", pink: "#f472b6", violet: "#a78bfa",
  green: "#34d399", box: "#0f172a", boxStroke: "#1e293b", boxText: "#cbd5e1",
};
// Punkte -> Pfad
const P = (pts: [number, number][]) =>
  pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
// n Stützstellen von x0..x1, y aus f(t) mit t in [0..1]
const S = (n: number, x0: number, x1: number, f: (t: number) => number): [number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return [x0 + t * (x1 - x0), f(t)] as [number, number];
  });
// Prozess-Box
function Box({ x, y, w, h, title, sub, accent }: { x: number; y: number; w: number; h: number; title: string; sub?: string; accent?: boolean }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={C.box} stroke={accent ? C.cyan : C.boxStroke} strokeWidth={accent ? 1.5 : 1} />
      <text x={x + w / 2} y={sub ? y + h / 2 - 4 : y + h / 2 + 4} textAnchor="middle" fontSize={13} fontWeight={600} fill={accent ? C.cyan : C.boxText}>{title}</text>
      {sub && <text x={x + w / 2} y={y + h / 2 + 12} textAnchor="middle" fontSize={10.5} fill={C.faint}>{sub}</text>}
    </g>
  );
}

export default function NerdAnalysen2() {
  return (
    <div className="w-full">
      <Link to="/nerd-analysen" className="text-sm text-brand-400 hover:underline">← Nerd-Analysen (Teil 1: das Experiment)</Link>
      <h1 className="mb-1 mt-4 flex items-center gap-2 text-2xl font-bold">
        <NerdIcon className="h-7 w-7 text-brand-400" /> Nerd-Analysen · Teil 2
      </h1>
      <p className="mb-2 text-sm text-slate-400">
        Wie aus rohen Sensor-Zahlen Pumps, On-Foil-Läufe, Start/Ende und Gleitphasen werden — die
        Signalverarbeitung, das Sliding-Window, das ML-Modell und das Labeling, schön der Reihe nach.
      </p>
      <p className="text-sm text-slate-300">
        In <Link to="/nerd-analysen" className="text-brand-400 hover:underline">Teil 1</Link> ging es um die
        <b> Wahrheit</b>: eine zweite Uhr am Foil-Mast, die verrät, was der Foil wirklich tut. Hier geht es um die
        <b> Maschinerie</b>: was der Server rechnet, damit aus einem Zappel-Signal am Handgelenk eine saubere
        Session-Auswertung wird. Alles Folgende passiert <b>server-seitig</b> — die Uhr ist nur ein dünner Recorder.
      </p>

      {/* ---------------- Rohdaten ---------------- */}
      <H>Was ankommt: die Rohdaten</H>
      <p className="text-sm text-slate-300">
        Jede Session besteht aus zwei Strömen, beide mit gemeinsamer Zeitbasis (ms ab Aufnahmestart):
      </p>
      <ul className="my-3 list-disc space-y-1.5 pl-5 text-sm text-slate-300">
        <li><b>GPS</b>, ca. <b>1 Hz</b>: pro Sample <Code>[t_ms, lat, lon, speed_mps, hr_bpm, h_acc_m]</Code>. Speed und Puls können fehlen (dann aus der Position abgeleitet bzw. leer).</li>
        <li><b>Beschleunigung</b>, je nach Uhr <b>10–100 Hz</b>: ein <Code>int16</Code>-Array der Form <Code>(N × 3)</Code> — X/Y/Z in Roh-Zählern. Ein <Code>accel_scale</Code> (Zähler pro g) macht daraus physikalische g.</li>
      </ul>
      <p className="text-sm text-slate-300">
        Warum <Code>int16</Code> statt Fließkomma? Bandbreite. 100 Hz × 3 Achsen × 8 h sind Millionen Werte — als
        2-Byte-Ganzzahlen halbiert das die Upload-Größe. Die Skalierung zurück nach g passiert erst am Server.
      </p>

      {/* ---------------- Master-Pipeline ---------------- */}
      <H>Die Pipeline auf einen Blick</H>
      <p className="text-sm text-slate-300">
        Zwei Aufbereitungs-Spuren (GPS + Accel) laufen in ein ML-Modell, das <b>pro Sekunde</b> entscheidet
        „auf dem Foil — ja/nein". Daraus werden zusammenhängende Läufe, deren Start/Ende feinjustiert wird,
        und schließlich Pumps &amp; Gleitphasen je Lauf:
      </p>
      <Diagram vb="0 0 800 540" caption="Die komplette Auswertung: von den zwei Rohdaten-Strömen über die Foiling-Maske zu Läufen, Pumps und Gleitphasen.">
        <defs>
          <marker id="ar" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto">
            <path d="M0 0 L7 3 L0 6 z" fill={C.faint} />
          </marker>
        </defs>
        {/* Inputs */}
        <Box x={50} y={20} w={300} h={54} title="GPS  ~1 Hz" sub="t, lat, lon, speed, hr, h_acc" />
        <Box x={450} y={20} w={300} h={54} title="Beschleunigung  10–100 Hz" sub="int16 (N×3) · accel_scale" />
        {/* GPS lane */}
        <Box x={50} y={120} w={300} h={54} title="GPS aufbereiten" sub="Spike-/Doppler-Filter · glätten · Speed" />
        {/* Accel lane */}
        <Box x={450} y={120} w={300} h={54} title="Accel aufbereiten" sub="Betrag → Vertikale · FFT-Bandpass" />
        {/* merge -> model */}
        <Box x={150} y={220} w={500} h={58} title="ML-Foil-Modell — RandomForest, ±5 s Kontext" sub="Fallback ohne Accel: GPS-State-Machine (Hysterese + Dwell)" accent />
        {/* mask */}
        <Box x={200} y={324} w={400} h={48} title="Foiling-Maske" sub="foil / nicht-foil — je Sekunde" />
        {/* segments */}
        <Box x={175} y={416} w={450} h={54} title="Segmentierung → Läufe" sub="Lücken schließen · mergen · Start/Ende snappen" />
        {/* outputs */}
        <Box x={90} y={492} w={280} h={40} title="Pumps zählen" sub="kadenz-geführt, je Lauf" />
        <Box x={430} y={492} w={280} h={40} title="Gleitphasen" sub="Lücken zwischen Pumps" />
        {/* arrows */}
        {[
          "M200 74 L200 118", "M600 74 L600 118",
          "M200 174 L280 218", "M600 174 L520 218",
          "M400 278 L400 322", "M400 372 L400 414",
          "M300 470 L250 490", "M500 470 L550 490",
        ].map((d, i) => <path key={i} d={d} stroke={C.faint} strokeWidth={1.6} fill="none" markerEnd="url(#ar)" />)}
      </Diagram>

      {/* ---------------- Betrag ---------------- */}
      <H>Schritt 1 — Betrag statt Achsen</H>
      <p className="text-sm text-slate-300">
        Die Uhr sitzt am Handgelenk und dreht sich ständig — die drei Achsen X/Y/Z zeigen dauernd woanders hin.
        Ein einzelner Achswert ist deshalb wertlos. Die Rettung ist der <b>Betrag</b> des Vektors:
      </p>
      <p className="my-2 text-center text-sm text-slate-200"><Code>|a| = √(x² + y² + z²) / accel_scale</Code></p>
      <p className="text-sm text-slate-300">
        Der Betrag ist <b>orientierungsinvariant</b>: egal wie die Uhr gedreht ist, ein 2-g-Stoß bleibt ein
        2-g-Stoß. Damit wird das Signal überhaupt erst vergleichbar (<Code>magnitude_g</Code>).
      </p>
      <Diagram vb="0 0 800 210" caption="Drei einzeln nichtssagende Achsen (die Uhr kippt ständig) ergeben zusammen einen stabilen, orientierungs­invarianten Betrag |a|.">
        {[["X", C.faint, 20, 0.9], ["Y", C.faint, 55, 1.7], ["Z", C.faint, 90, 0.6]].map(([lab, col, off, ph], k) => (
          <g key={k}>
            <text x={16} y={(off as number) + 4} fontSize={11} fill={C.label}>{lab as string}</text>
            <path d={P(S(120, 40, 470, (t) => (off as number) + 22 * Math.sin(t * 22 + (ph as number)) * Math.exp(-Math.pow((t - 0.5) * 2.2, 2)) + 9 * Math.sin(t * 7 + k)))} stroke={col as string} strokeWidth={1.2} fill="none" opacity={0.8} />
          </g>
        ))}
        <path d="M500 90 L560 90" stroke={C.faint} strokeWidth={1.6} markerEnd="url(#ar2)" fill="none" />
        <defs><marker id="ar2" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto"><path d="M0 0 L7 3 L0 6 z" fill={C.faint} /></marker></defs>
        <text x={640} y={26} textAnchor="middle" fontSize={11} fill={C.cyan}>|a| = √(x²+y²+z²)</text>
        <line x1={575} y1={150} x2={720} y2={150} stroke={C.axis} strokeWidth={1} />
        <path d={P(S(120, 578, 718, (t) => 150 - Math.abs(38 * Math.sin(t * 22) * Math.exp(-Math.pow((t - 0.5) * 2.2, 2))) - 6))} stroke={C.cyan} strokeWidth={1.6} fill="none" />
      </Diagram>

      {/* ---------------- Vertikale ---------------- */}
      <H>Schritt 2 — vom Handgelenk in die Senkrechte</H>
      <p className="text-sm text-slate-300">
        Der Betrag hat einen Haken: ein Pump ist ein <b>Aufwärts-Push</b>, aber <Code>|a|</Code> zählt den
        Abstrich genauso wie den Aufstrich — jeder Pump erscheint doppelt. Besser wäre die echte
        <b> vertikale Beschleunigung gegen die Schwerkraft</b>. Und die lässt sich rekonstruieren, ganz ohne Gyroskop:
      </p>
      <ol className="my-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-300">
        <li>Die <b>Schwerkraft-Richtung</b> ändert sich nur langsam → per <b>Tiefpass</b> (&lt; 0,25 Hz) je Achse schätzen. Das ergibt den Vektor <Code>g</Code>, der immer „nach unten" zeigt.</li>
        <li>Die <b>dynamische</b> Beschleunigung ist <Code>a − g</Code>.</li>
        <li>Diese auf den Schwerkraft-Einheitsvektor <b>projizieren</b> → skalares Signal: &gt; 0 = aufwärts (Push).</li>
      </ol>
      <p className="my-2 text-center text-sm text-slate-200"><Code>v(t) = (a − g) · ĝ</Code>&nbsp;&nbsp;mit&nbsp;&nbsp;<Code>ĝ = g / |g|</Code></p>
      <Diagram vb="0 0 800 220" caption="Die langsam driftende Schwerkraft g (Tiefpass) trennt Orientierung von Dynamik. Die dynamische Beschleunigung a−g, projiziert auf ĝ, ergibt einen sauberen Aufwärts-Push je Pump.">
        {/* left: vector decomposition */}
        <g transform="translate(150,110)">
          <line x1={-6} y1={0} x2={0} y2={80} stroke={C.axis} strokeWidth={1} />
          <line x1={0} y1={0} x2={0} y2={70} stroke={C.amber} strokeWidth={2.4} markerEnd="url(#arG)" />
          <text x={8} y={60} fontSize={11} fill={C.amber}>g (Schwerkraft)</text>
          <line x1={0} y1={0} x2={70} y2={-42} stroke={C.cyan} strokeWidth={2.4} markerEnd="url(#arC)" />
          <text x={74} y={-40} fontSize={11} fill={C.cyan}>a (gemessen)</text>
          <line x1={0} y1={70} x2={70} y2={28} stroke={C.pink} strokeWidth={2} strokeDasharray="4 3" markerEnd="url(#arP)" />
          <text x={44} y={64} fontSize={10.5} fill={C.pink}>a − g</text>
          <defs>
            <marker id="arG" markerWidth="9" markerHeight="9" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill={C.amber} /></marker>
            <marker id="arC" markerWidth="9" markerHeight="9" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill={C.cyan} /></marker>
            <marker id="arP" markerWidth="9" markerHeight="9" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill={C.pink} /></marker>
          </defs>
        </g>
        {/* right: |a| doppelt vs vertikal einfach */}
        <text x={430} y={40} fontSize={11} fill={C.faint}>|Betrag|: jeder Pump doppelt</text>
        <line x1={430} y1={70} x2={770} y2={70} stroke={C.axis} strokeWidth={0.8} />
        <path d={P(S(160, 432, 768, (t) => 70 - Math.abs(20 * Math.sin(t * 30))))} stroke={C.faint} strokeWidth={1.3} fill="none" />
        <text x={430} y={135} fontSize={11} fill={C.cyan}>v(t) gegen Schwerkraft: ein Push je Pump</text>
        <line x1={430} y1={175} x2={770} y2={175} stroke={C.axis} strokeWidth={0.8} />
        <path d={P(S(160, 432, 768, (t) => 175 - 22 * Math.max(0, Math.sin(t * 15)) + 6 * Math.min(0, Math.sin(t * 15))))} stroke={C.cyan} strokeWidth={1.6} fill="none" />
      </Diagram>

      {/* ---------------- Sliding window + FFT ---------------- */}
      <H>Schritt 3 — Sliding-Window &amp; FFT-Bandpass</H>
      <p className="text-sm text-slate-300">
        Pumpen ist <b>rhythmisch</b> — und Rhythmus lebt im Frequenzraum. Deshalb schiebt ein
        <b> gleitendes Fenster</b> (typ. 4 s breit, alle 2 s ein Schritt) über das Signal, und für jedes Fenster
        rechnet eine <b>FFT</b> das Spektrum. Zwei Bänder sind wichtig:
      </p>
      <ul className="my-3 list-disc space-y-1.5 pl-5 text-sm text-slate-300">
        <li><b>Filter-Band 0,3–3 Hz</b> — alles darunter ist Schwerkraft/Drift, alles darüber ist Splash-Rauschen. Beides wird per FFT-Bandpass genullt (<Code>bandpass_fft</Code>).</li>
        <li><b>Pump-Band 0,5–2 Hz</b> — hier lebt die Pump-Kadenz (30–120 Pumps/min).</li>
      </ul>
      <p className="text-sm text-slate-300">Pro Fenster fallen vier Merkmale ab:</p>
      <ul className="my-3 list-disc space-y-1 pl-5 text-sm text-slate-300">
        <li><b>dom_freq</b> — dominante Frequenz im Pump-Band (die Pump-Rate)</li>
        <li><b>band_power_ratio</b> — Anteil der Energie im Pump-Band am Gesamt-Band (hoch = klarer Rhythmus)</li>
        <li><b>rms</b> — Signalstärke (Amplitude der Bewegung)</li>
        <li><b>spectral_entropy</b> — wie „aufgeräumt" das Spektrum ist (niedrig = eine klare Frequenz = Pumpen; hoch = Chaos = Rauschen/Gleiten)</li>
      </ul>
      <Diagram vb="0 0 800 250" caption="Ein 4-s-Fenster wandert über das gefilterte Signal (Schritt 2 s → Überlappung). Für jedes Fenster liefert die FFT ein Spektrum; die Energie im Pump-Band 0,5–2 Hz verrät Rate und Rhythmus.">
        {/* signal with windows */}
        <line x1={30} y1={95} x2={470} y2={95} stroke={C.axis} strokeWidth={0.8} />
        <path d={P(S(220, 32, 468, (t) => 95 - 26 * Math.sin(t * 26) - 5 * Math.sin(t * 60)))} stroke={C.cyan} strokeWidth={1.4} fill="none" />
        <rect x={70} y={55} width={110} height={80} rx={4} fill={C.cyan} opacity={0.08} stroke={C.cyan} strokeDasharray="4 3" />
        <rect x={150} y={62} width={110} height={80} rx={4} fill={C.violet} opacity={0.08} stroke={C.violet} strokeDasharray="4 3" />
        <text x={70} y={48} fontSize={10} fill={C.cyan}>Fenster t</text>
        <text x={182} y={156} fontSize={10} fill={C.violet}>Fenster t+1</text>
        <text x={30} y={30} fontSize={11} fill={C.label}>v(t) — bandpass-gefiltert (0,3–3 Hz)</text>
        {/* arrow to spectrum */}
        <path d="M480 95 L515 95" stroke={C.faint} strokeWidth={1.6} markerEnd="url(#arF)" fill="none" />
        <text x={498} y={86} fontSize={9} fill={C.faint}>FFT</text>
        <defs><marker id="arF" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto"><path d="M0 0 L7 3 L0 6 z" fill={C.faint} /></marker></defs>
        {/* spectrum */}
        <g transform="translate(535,30)">
          <text x={0} y={0} fontSize={11} fill={C.label}>Spektrum</text>
          <line x1={0} y1={130} x2={240} y2={130} stroke={C.axis} strokeWidth={1} />
          <line x1={0} y1={20} x2={0} y2={130} stroke={C.axis} strokeWidth={1} />
          {/* pump band shaded */}
          <rect x={40} y={20} width={70} height={110} fill={C.pink} opacity={0.1} />
          <text x={75} y={148} textAnchor="middle" fontSize={9} fill={C.pink}>0,5–2 Hz</text>
          {/* bars */}
          {[6, 10, 46, 78, 40, 14, 22, 12, 8, 18, 10, 6].map((h, i) => (
            <rect key={i} x={8 + i * 19} y={130 - h} width={12} height={h} fill={i >= 2 && i <= 4 ? C.pink : C.faint} opacity={i >= 2 && i <= 4 ? 0.95 : 0.6} />
          ))}
          <text x={120} y={168} textAnchor="middle" fontSize={9} fill={C.faint}>Frequenz →</text>
        </g>
      </Diagram>

      {/* ---------------- effektive Rate ---------------- */}
      <H>Ein Nerd-Detail: die echte Abtastrate</H>
      <p className="text-sm text-slate-300">
        Manche Uhren <b>lügen</b> über ihre Rate. Eine Forerunner 55 taggt „10 Hz", liefert real aber nur ~2,5 Hz.
        Frequenz-Features und Pump-Kadenz wären damit Müll. Deshalb bestimmt der Server die Rate <b>generisch aus
        den Daten selbst</b>: <Code>echte_Hz = Anzahl_Accel-Samples / GPS-Dauer</Code>. Weicht das &gt; 25 % vom Tag ab,
        gilt die gemessene Rate. Und liegt sie <b>unter 15 Hz</b>, ist das Signal für Frequenzanalyse zu grob → die
        Session wird als <b>GPS-only</b> ausgewertet (Pumps n/a, dafür ehrliche Grenzen statt Fantasiewerte).
      </p>

      {/* ---------------- ML-Modell ---------------- */}
      <H>Wo bin ich auf dem Foil? — das ML-Modell</H>
      <p className="text-sm text-slate-300">
        Ob man in einer Sekunde <b>auf dem Foil</b> ist, entscheidet ein <b>RandomForest</b> — ein Wald aus
        Entscheidungsbäumen, die per Mehrheit abstimmen. Klein und interpretierbar, kein Deep Learning nötig.
        Pro Sekunde bekommt er <b>14 Merkmale</b>:
      </p>
      <ul className="my-3 list-disc space-y-1 pl-5 text-sm text-slate-300">
        <li><b>7 aus Speed &amp; Accel</b>: Speed jetzt / 3 s / 5 s (Median), Speed-Variabilität, sowie RMS in drei Bändern (gesamt, Pump-Band, hochfrequent).</li>
        <li><b>7 aus der GPS-Bahn</b>: Speed-Änderung über 1/3/5 s, Pfadlänge, Netto-Versatz, <b>Geradlinigkeit</b> (netto/pfad) und Kursänderung. Diese Richtungs-Features waren im Experiment der größte Hebel — sie halten ruhige Gleitphasen im Lauf, statt ihn zu zerstückeln.</li>
      </ul>
      <p className="text-sm text-slate-300">
        Der Clou ist der <b>Kontext</b>: jede Sekunde wird nicht isoliert klassifiziert, sondern zusammen mit den
        <b> ±5 Nachbarsekunden</b> (das „Windowize"). Der Feature-Vektor einer Sekunde ist also 14 × 11 = 154 Zahlen
        lang. So sieht das Modell den Verlauf — ein kurzer Speed-Einbruch mitten im Cruise wird nicht sofort als
        „raus" gewertet. Das brachte die Fragmentierung von 1,10× auf 1,00× und den F1-Score von <b>0,93 auf 0,97</b>.
      </p>
      <Diagram vb="0 0 800 250" caption="Pro Sekunde ein 14er-Merkmalsvektor; für die Klassifikation werden die ±5 Nachbarsekunden angehängt (Center-Label). Der RandomForest stimmt ab → foil / nicht-foil.">
        {/* per-second feature columns */}
        {Array.from({ length: 11 }, (_, i) => {
          const x = 40 + i * 44;
          const center = i === 5;
          return (
            <g key={i}>
              <rect x={x} y={40} width={30} height={70} rx={3} fill={center ? C.cyan : C.box} opacity={center ? 0.25 : 1} stroke={center ? C.cyan : C.boxStroke} strokeWidth={center ? 1.5 : 1} />
              {Array.from({ length: 4 }, (_, r) => (
                <line key={r} x1={x + 5} y1={52 + r * 15} x2={x + 25} y2={52 + r * 15} stroke={center ? C.cyan : C.faint} strokeWidth={2} opacity={0.7} />
              ))}
              <text x={x + 15} y={126} textAnchor="middle" fontSize={9} fill={center ? C.cyan : C.faint}>{i - 5}s</text>
            </g>
          );
        })}
        <text x={40} y={30} fontSize={11} fill={C.label}>Sekunden-Fenster: 14 Merkmale je Sekunde, ±5 s Kontext</text>
        <path d="M264 140 L264 165" stroke={C.faint} strokeWidth={1.6} markerEnd="url(#arM)" fill="none" />
        <defs><marker id="arM" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto"><path d="M0 0 L7 3 L0 6 z" fill={C.faint} /></marker></defs>
        {/* forest */}
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${150 + i * 70},170)`}>
            <circle cx={0} cy={0} r={3} fill={C.green} />
            <line x1={0} y1={0} x2={-10} y2={16} stroke={C.faint} strokeWidth={1} />
            <line x1={0} y1={0} x2={10} y2={16} stroke={C.faint} strokeWidth={1} />
            <circle cx={-10} cy={20} r={2.5} fill={C.faint} /><circle cx={10} cy={20} r={2.5} fill={C.faint} />
          </g>
        ))}
        <text x={200} y={225} textAnchor="middle" fontSize={10} fill={C.faint}>RandomForest (Mehrheit)</text>
        <path d="M330 195 L380 195" stroke={C.faint} strokeWidth={1.6} markerEnd="url(#arM)" fill="none" />
        {/* output strip */}
        {Array.from({ length: 11 }, (_, i) => {
          const on = i >= 2 && i <= 8;
          return <rect key={i} x={400 + i * 30} y={182} width={26} height={22} rx={3} fill={on ? C.green : C.box} opacity={on ? 0.8 : 1} stroke={C.boxStroke} />;
        })}
        <text x={400} y={172} fontSize={10} fill={C.green}>Maske je Sekunde: foil ▮ / nicht-foil ▯</text>
      </Diagram>

      {/* ---------------- Segmentierung ---------------- */}
      <H>Von der Maske zu Läufen</H>
      <p className="text-sm text-slate-300">
        Die Sekunden-Maske ist noch löchrig. Sie wird zu sauberen <b>Läufen</b> geformt:
      </p>
      <ul className="my-3 list-disc space-y-1.5 pl-5 text-sm text-slate-300">
        <li><b>Kurze Lücken schließen</b> (bis ~2 s): eine Gleit-Pause zerteilt keinen Lauf.</li>
        <li><b>Physik-Floor</b>: unter ~9 km/h trägt kein Foil, und ohne echte Positions-Bewegung (nicht nur Speed-Feld) ist man nicht auf Foil — beides schneidet die weichen Ränder weg.</li>
        <li><b>Mindestlänge &amp; Ø-Speed</b>: Segmente unter 5 s oder mit zu niedrigem Schnitt fliegen raus (schnelles Gehen ≠ Foilen).</li>
        <li><b>GPS-Dropout trennt</b>: eine Sample-Lücke &gt; 15 s (Uhr unter Wasser/Sturz) beendet den Lauf — die Lückenzeit zählt nicht als Fahrzeit.</li>
        <li><b>„Kein-Stopp"-Merge</b>: fiel der Speed zwischen zwei erkannten Läufen <b>nie</b> unter ~5,4 km/h und lag kein Dropout vor, war es in Wahrheit <b>ein</b> Lauf (Modell-Aussetzer) → zusammenführen, egal wie lang.</li>
      </ul>
      <p className="text-sm text-slate-300">
        Ohne brauchbare Beschleunigung (GPS-only) übernimmt eine <b>State-Machine</b> mit <b>Hysterese</b> und
        <b> Dwell</b>: Man wird erst „foilend" nach mehreren Sekunden im Speed-Band <i>bei glattem Speed</i> (Gleiten ist
        glatt, Paddeln choppy) — und verlässt den Zustand erst nach mehreren Sekunden darunter. Zwei Schwellen
        (rein/raus) verhindern Flackern an der Grenze.
      </p>
      <Diagram vb="0 0 800 250" caption="Oben: die löchrige Sekunden-Maske wird zu Läufen (Lücken schließen, mergen, Kurzsegmente verwerfen). Unten: die Hysterese der GPS-State-Machine — rein erst oberhalb, raus erst unterhalb, mit Haltezeit (Dwell).">
        {/* mask -> runs */}
        <text x={30} y={28} fontSize={11} fill={C.label}>Maske (je Sekunde)</text>
        {"1101111011111100000111110".split("").map((c, i) => (
          <rect key={i} x={30 + i * 22} y={38} width={18} height={18} rx={2} fill={c === "1" ? C.green : C.box} opacity={c === "1" ? 0.75 : 1} stroke={C.boxStroke} />
        ))}
        <path d="M300 80 L300 100" stroke={C.faint} strokeWidth={1.5} markerEnd="url(#arS)" fill="none" />
        <defs><marker id="arS" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto"><path d="M0 0 L7 3 L0 6 z" fill={C.faint} /></marker></defs>
        <text x={30} y={100} fontSize={11} fill={C.label}>Läufe</text>
        <rect x={30} y={108} width={278} height={18} rx={3} fill={C.cyan} opacity={0.35} stroke={C.cyan} />
        <rect x={442} y={108} width={110} height={18} rx={3} fill={C.cyan} opacity={0.35} stroke={C.cyan} />
        <text x={169} y={121} textAnchor="middle" fontSize={9} fill={C.cyan}>Lauf 1 (Lücken geschlossen)</text>
        <text x={497} y={121} textAnchor="middle" fontSize={9} fill={C.cyan}>Lauf 2</text>
        <text x={315} y={121} fontSize={9} fill={C.faint}>· zu kurz → verworfen</text>
        {/* hysteresis */}
        <g transform="translate(0,150)">
          <text x={30} y={0} fontSize={11} fill={C.label}>Hysterese + Dwell (GPS-Fallback)</text>
          <line x1={30} y1={80} x2={770} y2={80} stroke={C.axis} strokeWidth={0.8} />
          <line x1={30} y1={35} x2={770} y2={35} stroke={C.green} strokeDasharray="3 3" strokeWidth={0.8} />
          <line x1={30} y1={55} x2={770} y2={55} stroke={C.amber} strokeDasharray="3 3" strokeWidth={0.8} />
          <text x={772} y={38} fontSize={9} fill={C.green} textAnchor="end" transform="translate(0,-10)"></text>
          <text x={640} y={30} fontSize={9} fill={C.green}>ENTER ~10 km/h</text>
          <text x={640} y={68} fontSize={9} fill={C.amber}>EXIT ~9 km/h</text>
          <path d={P(S(200, 32, 768, (t) => 80 - 60 * Math.max(0, Math.min(1, (t - 0.12) * 6)) * Math.min(1, (0.95 - t) * 6) - 3 * Math.sin(t * 40)))} stroke={C.cyan} strokeWidth={1.5} fill="none" />
        </g>
      </Diagram>

      {/* ---------------- Start/Ende ---------------- */}
      <H>Start &amp; Ende — sub-sekundengenau</H>
      <p className="text-sm text-slate-300">
        Das Modell arbeitet im Sekundenraster, aber der <b>Aufsprung</b> ist ein scharfes Ereignis. Deshalb wird der
        Lauf-Start auf den <b>Jump-Impuls</b> gesnappt: eine sehr starke Magnitude-Spitze (&gt; 3,5× dem 95-Perzentil —
        im Experiment lag ein Jump bei ~4,3×, ein Pump nur bei ~2,3×, also klar trennbar). Der früheste solche Impuls
        im Fenster ±wenige Sekunden markiert den echten Absprung — sub-sekundengenau zwischen zwei GPS-Punkten
        interpoliert. Fehlt der Impuls, zieht der Server den Start über die Beschleunigungs-Rampe bis zum letzten
        Quasi-Stopp zurück.
      </p>
      <p className="text-sm text-slate-300">
        Am <b>Ende</b> lauern zwei Fallen: <b>Dead-Reckoning-Drift</b> (die Uhr taucht unter, extrapoliert das GPS
        und „driftet" an Land) wird verworfen — Prior: ein Lauf endet nie landwärtiger als sein Start. Und wo eine
        <b> OSM-Wasserfläche</b> bekannt ist, müssen Start und Ende <b>im Wasser</b> liegen (Punkt-in-Polygon per
        Ray-Casting), sonst wird auf das letzte echte Wasser-Sample zurückgeschnitten. Schließlich wird das Ende noch
        als <b>Sturz</b> (abrupter Speed-Einbruch von „auf Foil" auf „im Wasser", oder GPS-Dropout) oder
        <b> kontrollierter Stopp</b> klassifiziert.
      </p>
      <Diagram vb="0 0 800 190" caption="Der erkannte Sekunden-Start (grau) wird auf den scharfen Aufsprung-Impuls im Beschleunigungs-Betrag gesnappt (cyan) — der wahre Foil-Start.">
        <line x1={30} y1={120} x2={770} y2={120} stroke={C.axis} strokeWidth={0.8} />
        {/* accel magnitude with a big jump spike */}
        <path d={P(S(240, 32, 768, (t) => {
          const jump = 70 * Math.exp(-Math.pow((t - 0.32) * 40, 2));
          const pumps = t > 0.36 ? 16 * Math.abs(Math.sin((t - 0.36) * 55)) : 0;
          return 120 - jump - pumps - 4;
        }))} stroke={C.cyan} strokeWidth={1.4} fill="none" />
        {/* p95*3.5 threshold */}
        <line x1={30} y1={60} x2={770} y2={60} stroke={C.pink} strokeDasharray="4 3" strokeWidth={0.8} />
        <text x={34} y={54} fontSize={9} fill={C.pink}>3,5 × p95 (Jump-Schwelle)</text>
        {/* detected second-start */}
        <line x1={330} y1={30} x2={330} y2={130} stroke={C.faint} strokeDasharray="3 3" strokeWidth={1.2} />
        <text x={334} y={44} fontSize={9} fill={C.faint}>Sekunden-Start</text>
        {/* snapped start */}
        <line x1={276} y1={30} x2={276} y2={130} stroke={C.green} strokeWidth={1.6} />
        <text x={150} y={150} fontSize={9} fill={C.green}>← gesnappt auf den Aufsprung</text>
        <text x={430} y={150} fontSize={9} fill={C.cyan}>danach: Pump-Rhythmus</text>
      </Diagram>

      {/* ---------------- Pumps kadenz-geführt ---------------- */}
      <H>Pumps zählen — kadenz-geführt (v3)</H>
      <p className="text-sm text-slate-300">
        Der naheliegende Weg — „zähle alle Peaks über einer Amplituden-Schwelle" — <b>unterschätzt strukturell um
        ~2×</b>: er pickt nur die größten Ausschläge und verschluckt die kleineren, rhythmischen Pumps dazwischen.
        Gegen die <b>Wahrheit</b> (die Label-App liefert <Code>run_pumps</Code>, dazu Jans Video-Tap-Labels) traf das
        nur ~40 %.
      </p>
      <p className="text-sm text-slate-300">
        Der bessere Ansatz ist <b>kadenz-geführt</b>: In rhythmischen, energiereichen Abschnitten schätzt eine lokale
        FFT die <b>momentane Pump-Frequenz</b>, und dann wird <b>pro Kadenz-Periode genau ein</b> echtes lokales
        Maximum als Pump gewählt. Die Kadenz ist lokal-adaptiv, folgt also Tempowechseln. Ergebnis: <b>85–94 %</b>
        Treffer statt 40 % — und Zähler und Karten-Marker sind automatisch konsistent (beide aus denselben Positionen).
        Ein RMS-Gate verhindert, dass rhythmuslose Gleitphasen mitgezählt werden.
      </p>
      <Diagram vb="0 0 800 190" caption="Amplituden-Schwelle (oben) sieht nur die dicken Peaks. Kadenz-geführt (unten): lokale Periode T schätzen, pro Periode das echte Maximum picken — auch die sanften Pumps.">
        {/* top: amplitude threshold misses */}
        <text x={30} y={26} fontSize={10.5} fill={C.faint}>Amplituden-Schwelle — verschluckt kleine Pumps</text>
        <line x1={30} y1={72} x2={770} y2={72} stroke={C.axis} strokeWidth={0.7} />
        {(() => {
          const amps = [1, 0.5, 0.9, 0.45, 1, 0.5, 0.85, 0.4, 0.95, 0.5];
          return (
            <>
              <line x1={30} y1={48} x2={770} y2={48} stroke={C.pink} strokeDasharray="4 3" strokeWidth={0.7} />
              <path d={P(S(240, 32, 768, (t) => { const i = Math.min(amps.length - 1, Math.floor(t * amps.length)); return 72 - 38 * amps[i] * Math.max(0, Math.sin(t * amps.length * Math.PI)); }))} stroke={C.faint} strokeWidth={1.3} fill="none" />
              {amps.map((a, i) => a > 0.7 && <circle key={i} cx={32 + (i + 0.5) / amps.length * 736} cy={72 - 38 * a} r={3} fill={C.pink} />)}
            </>
          );
        })()}
        {/* bottom: cadence picks all */}
        <text x={30} y={110} fontSize={10.5} fill={C.cyan}>Kadenz-geführt — ein Peak je Periode T</text>
        <line x1={30} y1={162} x2={770} y2={162} stroke={C.axis} strokeWidth={0.7} />
        {(() => {
          const amps = [1, 0.5, 0.9, 0.45, 1, 0.5, 0.85, 0.4, 0.95, 0.5];
          return (
            <>
              <path d={P(S(240, 32, 768, (t) => { const i = Math.min(amps.length - 1, Math.floor(t * amps.length)); return 162 - 34 * amps[i] * Math.max(0, Math.sin(t * amps.length * Math.PI)); }))} stroke={C.cyan} strokeWidth={1.4} fill="none" />
              {amps.map((a, i) => <circle key={i} cx={32 + (i + 0.5) / amps.length * 736} cy={162 - 34 * a} r={3} fill={C.green} />)}
              {amps.map((_, i) => i > 0 && <line key={i} x1={32 + i / amps.length * 736} y1={120} x2={32 + i / amps.length * 736} y2={162} stroke={C.faint} strokeDasharray="2 3" strokeWidth={0.6} />)}
              <text x={32 + 0.5 / amps.length * 736} y={132} fontSize={9} fill={C.faint}>|←T→|</text>
            </>
          );
        })()}
      </Diagram>

      {/* ---------------- Gleitphasen ---------------- */}
      <H>Gleitphasen — die Stille zwischen den Pumps</H>
      <p className="text-sm text-slate-300">
        Genau das, was Teil 1 als größtes Potenzial nannte, fällt jetzt fast geschenkt ab: Sind die Pump-Zeitpunkte
        bekannt, sind die <b>Gleitphasen einfach die Lücken dazwischen</b> — plus der Anlauf vom Lauf-Start bis zum
        ersten Pump (<i>lead</i>) und das Auslaufen vom letzten Pump bis zum Ende (<i>tail</i>). Daraus fallen pro
        Lauf <b>Anzahl</b>, <b>Ø-Gleitdauer</b> und <b>längste Gleitphase</b> ab — die Kennzahl dafür, wie effizient
        ein Foil den Schwung hält.
      </p>
      <Diagram vb="0 0 800 130" caption="Pumps (Marker) teilen den Lauf; die Lücken dazwischen sind die Gleitphasen. lead = Start→1. Pump, tail = letzter Pump→Ende. Ein langer tail = sauberes Auslaufen.">
        <line x1={40} y1={70} x2={760} y2={70} stroke={C.cyan} strokeWidth={2} />
        <circle cx={40} cy={70} r={4} fill={C.green} /><text x={40} y={96} textAnchor="middle" fontSize={9} fill={C.green}>Start</text>
        <circle cx={760} cy={70} r={4} fill={C.amber} /><text x={760} y={96} textAnchor="middle" fontSize={9} fill={C.amber}>Ende</text>
        {[170, 250, 330, 410, 490, 570].map((x, i) => (
          <g key={i}><line x1={x} y1={58} x2={x} y2={82} stroke={C.pink} strokeWidth={2} /></g>
        ))}
        <text x={370} y={52} textAnchor="middle" fontSize={9} fill={C.pink}>Pumps</text>
        {/* lead + tail brackets */}
        <path d="M40 40 L170 40" stroke={C.faint} strokeWidth={1} /><text x={105} y={34} textAnchor="middle" fontSize={9} fill={C.faint}>lead</text>
        <path d="M570 40 L760 40" stroke={C.faint} strokeWidth={1} /><text x={665} y={34} textAnchor="middle" fontSize={9} fill={C.faint}>tail (Gleiten)</text>
        <text x={210} y={112} textAnchor="middle" fontSize={9} fill={C.faint}>Lücken = Gleitphasen</text>
      </Diagram>

      {/* ---------------- GPS-only Gates ---------------- */}
      <H>Ohne Accel: GPS-only &amp; seine Fallstricke</H>
      <p className="text-sm text-slate-300">
        Importierte Sessions (z. B. von Polar) oder Uhren mit zu grober Rate haben <b>keine brauchbare
        Beschleunigung</b>. Dann trägt allein das GPS — und das hat Macken:
      </p>
      <ul className="my-3 list-disc space-y-1.5 pl-5 text-sm text-slate-300">
        <li><b>Einzel-Spikes</b> (Doppler-Glitch, „Teleport"): gegen den lokalen Median ersetzt bzw. raus-und-zurück-Sprünge geglättet.</li>
        <li><b>Mehrsekündige Doppler-Bursts</b> (~3 s auf 50 km/h, aber unter der 90-km/h-Glitch-Schwelle): gegen einen robusten <b>15-s-Median</b> ersetzt — der ist gegen kurze Bursts unempfindlich, ein echter gehaltener Lauf hebt ihn dagegen mit an und bleibt unangetastet. Zwei Bedingungen (relativ über Median <b>und</b> absolut über ~28 km/h) schützen echte Läufe.</li>
        <li><b>30-km/h-Pumpfoil-Gate</b>: ohne Accel kann man Pumpfoil nicht sicher von angetriebenem Foilen (Kite/Wind/Wake) trennen. Liegt der geglättete Top-Speed über 30 km/h, gilt die Session als angetrieben → <b>kein</b> Pumpfoil. Mit Accel entfällt dieses Gate — dort vertraut die Auswertung dem Pump-/On-Foil-Signal.</li>
      </ul>

      {/* ---------------- Labeling / Retrain ---------------- */}
      <H>Woher das Modell lernt — Labeling &amp; der Retrain-Kreislauf</H>
      <p className="text-sm text-slate-300">
        Das Foil-Modell wird nicht geraten, sondern <b>gegen Wahrheit trainiert</b>. Quelle ist eine separate
        Label-App: ihre FIT-Dateien tragen einen <Code>foil_status</Code> (auf Foil ja/nein je Sekunde) und
        <Code> run_pumps</Code> (echte Pumpzahl je Lauf). Das ist die Ground Truth, gegen die sowohl der On-Foil-Wald
        als auch der kadenz-geführte Pump-Zähler kalibriert wurden.
      </p>
      <p className="text-sm text-slate-300">
        Wichtig beim Training: <b>GroupKFold</b> statt normaler Kreuzvalidierung. Benachbarte Sekunden derselben
        Session sind fast identisch — landeten sie zugleich in Trainings- und Testmenge, würde sich das Modell
        selbst abfragen (Leakage) und Traumwerte melden. GroupKFold hält deshalb <b>ganze Sessions</b> zusammen: das
        Modell wird immer auf Sessions getestet, die es nie gesehen hat.
      </p>
      <Diagram vb="0 0 800 170" caption="Der Kreislauf: gelabelte Wahrheit → Features → RandomForest → foil_rf.pkl → Auswertung jeder Session. Neue Labels fließen zurück, das Modell wird neu trainiert.">
        <defs><marker id="arR" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto"><path d="M0 0 L7 3 L0 6 z" fill={C.faint} /></marker></defs>
        <Box x={30} y={60} w={150} h={50} title="Label-App-FITs" sub="foil_status · run_pumps" />
        <Box x={220} y={60} w={130} h={50} title="Features" sub="14 × ±5 s Kontext" />
        <Box x={390} y={60} w={160} h={50} title="RandomForest" sub="GroupKFold-CV" accent />
        <Box x={590} y={60} w={180} h={50} title="foil_rf.pkl" sub="→ jede Session" />
        <path d="M180 85 L218 85" stroke={C.faint} strokeWidth={1.5} markerEnd="url(#arR)" fill="none" />
        <path d="M350 85 L388 85" stroke={C.faint} strokeWidth={1.5} markerEnd="url(#arR)" fill="none" />
        <path d="M550 85 L588 85" stroke={C.faint} strokeWidth={1.5} markerEnd="url(#arR)" fill="none" />
        {/* feedback loop */}
        <path d="M680 110 L680 140 L105 140 L105 112" stroke={C.faint} strokeWidth={1.2} strokeDasharray="4 3" markerEnd="url(#arR)" fill="none" />
        <text x={400} y={158} textAnchor="middle" fontSize={10} fill={C.faint}>neue gelabelte Sessions → erneutes Training</text>
      </Diagram>

      {/* ---------------- Zusammenfassung ---------------- */}
      <H>Der ganze Weg in einem Satz</H>
      <Key>
        <p className="mb-2">
          Rohe int16-Beschleunigung → <b>Betrag</b> → <b>Vertikale gegen die Schwerkraft</b> → <b>FFT-Bandpass</b> im
          Sliding-Window → 14 Merkmale je Sekunde mit <b>±5 s Kontext</b> → <b>RandomForest</b> sagt on-foil/nicht →
          <b> Segmentierung</b> zu Läufen (Hysterese, Merge, Dropout) → Start auf den <b>Aufsprung-Impuls</b> gesnappt,
          Ende gegen <b>Wasserfläche</b> &amp; Drift korrigiert → <b>kadenz-geführte</b> Pump-Zählung → Gleitphasen als
          Lücken → Kennzahlen.
        </p>
        <p className="text-slate-300">
          Und das alles aus <b>einer Handgelenk-Uhr</b> — die Mast-Uhr aus Teil 1 war nur die Referenz, die zeigt,
          dass es stimmt.
        </p>
      </Key>

      <H>Grenzen (weiterhin ehrlich)</H>
      <p className="mb-10 text-sm text-slate-400">
        Die Uhr sitzt am Handgelenk, nicht am Board — die Arme wedeln zum Balancieren und überlagern das Pump-Signal
        („Wrist-Confound"). Die Vertikale wird aus der Schwerkraft-Richtung geschätzt (kein Gyroskop) und ist bei
        anhaltender Beschleunigung leicht verfälscht. Der kadenz-geführte Zähler ist gegen App- und Video-Wahrheit
        kalibriert, aber die <b>physische</b> Endkalibrierung (Kamera am Board, Insta360 X5) steht noch aus. Und die
        GPS-only-Gates sind ein Kompromiss: lieber ehrlich „gps_only, Pumps n/a" als erfundene Zahlen.
      </p>
    </div>
  );
}
