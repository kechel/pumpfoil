import type { BoardAttitude as Lage } from "../lib/api";

/**
 * Das Foil als Zeichnung — Seitenansicht, Frontansicht, Draufsicht.
 *
 * MASSSTAEBLICH, in echten Zentimetern. Spannweite und Flaeche kommen aus dem Katalog, Mast- und
 * Boardlaenge aus dem Setup der Session; die mittlere Fluegeltiefe ist Flaeche/Spannweite. Fuer
 * Jans Gong SIRUS 2000 sind das 156 cm Spannweite bei 12,8 cm Tiefe, fuer den Stab Fluid H 39 cm
 * bei 4,8 cm — die Zeichnung muss nichts davon raten. Was sie (noch) raten muss, sagt der Server
 * in `rig.gemessen`: wo Mast und Fluegel LAENGS sitzen.
 *
 * KOORDINATEN: x nach vorn, y nach steuerbord, z nach oben — alles in cm, Nullpunkt ist der
 * FRONTFLUEGEL. Er traegt den Auftrieb und ist damit der Punkt, um den sich in der Realitaet das
 * Meiste dreht; in allen drei Ansichten ist er der Drehpunkt. SVG zaehlt y nach unten, deshalb
 * geht jede Koordinate durch `P`/`O`, statt irgendwo ein Minuszeichen zu vergessen.
 *
 * WARUM DIE FRONTANSICHT AUCH AUF DEN NICKWINKEL HOERT: Frontfluegel und Stab liegen rund 50 cm
 * auseinander. Nickt das Brett, hebt und senkt sich der Stab gegenueber dem Frontfluegel um
 * `x · sin(pitch)` — bei 10° also knapp 9 cm. Genau diese Verschiebung macht in der Frontansicht
 * den Unterschied zwischen „liegt flach" und „zieht an". Formel ist die normale Drehung eines
 * starren Koerpers, projiziert auf die Blickachse: z_ansicht = z·cos(pitch) + x·sin(pitch).
 */

type Rig = NonNullable<Lage["rig"]>;

// Nicht im Setup gepflegt und auch nicht sinnvoll abfragbar — reine Zeichenmasse. Ein Mast ist
// von der Seite ein Blatt von gut 12 cm Tiefe und von vorn knapp 2 cm dick; ein Pumpbrett ist
// rund 8 cm dick. Alles nur Optik, es rechnet nichts damit.
const MAST_TIEFE = 12;
const MAST_DICKE = 1.8;
const BOARD_DICKE = 8;
const RUMPF_DICKE = 2.4;

/**
 * NUR IN DER FRONTANSICHT: die duennen Masse ueberhoeht.
 *
 * Ein Frontfluegel ist an der Wurzel rund 2 cm dick — auf 156 cm Spannweite ist das eine
 * Haarlinie, und aus einer Haarlinie liest niemand einen Rollwinkel ab. Ueberhoeht sind
 * ausschliesslich Fluegeldicke und Mastbreite; Spannweiten, Hoehen und die Verschiebung aus dem
 * Nickwinkel bleiben massstaeblich. Genau so macht es jede technische Zeichnung, in der ein
 * Blech quer zur Blickrichtung steht.
 */
const FRONT_UEBERHOEHUNG = 2.6;

const breiteAusLaenge = (len: number) => Math.max(38, Math.min(52, len * 0.55));

/** Seiten-/Frontansicht: Modell (x|y, z) -> SVG. z zeigt nach oben, SVG-y nach unten. */
const P = (a: number, z: number) => `${a.toFixed(1)},${(-z).toFixed(1)}`;
/** Draufsicht: (y seitlich, x nach vorn) -> SVG, Nase zeigt nach oben. */
const O = (y: number, x: number) => `${y.toFixed(1)},${(-x).toFixed(1)}`;

/** Fluegelprofil von der SEITE: Nase nach +x, gewoelbte Oberseite, spitze Hinterkante. */
function profilSeite(cx: number, cz: number, tiefe: number): string {
  const t = tiefe * 0.19;
  return [
    `M ${P(cx + tiefe / 2, cz)}`,
    `C ${P(cx + tiefe * 0.2, cz + t)} ${P(cx - tiefe * 0.2, cz + t * 0.8)} ${P(cx - tiefe / 2, cz)}`,
    `C ${P(cx - tiefe * 0.2, cz - t * 0.25)} ${P(cx + tiefe * 0.2, cz - t * 0.5)} ${P(cx + tiefe / 2, cz)}`,
    "Z",
  ].join(" ");
}

/**
 * Fluegel von VORN: eine flache Sichel, Spitzen tiefer als die Wurzel (Anhedral).
 *
 * Die Kontrollpunkte sind so gerechnet, dass die Kurve die gewuenschten Punkte WIRKLICH trifft:
 * eine quadratische Bezier laeuft bei t=0.5 durch (P0 + 2C + P2)/4, also C = 2·Mitte − (P0+P2)/2.
 * Ohne das liegt die Woelbung bei der Haelfte des Gewollten.
 */
function fluegelVorn(span: number, tiefe: number, z: number, extra = 1): string {
  const b = span / 2;
  const sack = span * 0.07;            // wie tief die Spitzen haengen (massstaeblich)
  const t = tiefe * 0.16 * FRONT_UEBERHOEHUNG * extra;   // Dicke an der Wurzel — s. oben
  const zSpitze = z - sack;
  return [
    `M ${P(-b, zSpitze)}`,
    `Q ${P(0, z + 2 * t + sack)} ${P(b, zSpitze)}`,
    `Q ${P(0, z - 0.6 * t + sack)} ${P(-b, zSpitze)}`,
    "Z",
  ].join(" ");
}

/** Fluegel von OBEN: nach hinten gepfeilt, Spitzen schmaler als die Wurzel. */
function fluegelOben(span: number, tiefe: number, x: number): string {
  const b = span / 2;
  const leWurzel = x + tiefe * 0.5, teWurzel = x - tiefe * 0.5;
  const leSpitze = x - tiefe * 0.35, teSpitze = x - tiefe * 0.75;
  return [
    `M ${O(-b, leSpitze)}`,
    `Q ${O(0, 2 * leWurzel - leSpitze)} ${O(b, leSpitze)}`,
    `L ${O(b, teSpitze)}`,
    `Q ${O(0, 2 * teWurzel - teSpitze)} ${O(-b, teSpitze)}`,
    "Z",
  ].join(" ");
}

function boardSeite(len: number, zUnten: number): string {
  const a = len / 2, d = BOARD_DICKE;
  return [
    `M ${P(-a, zUnten + d * 0.25)}`,
    `L ${P(a * 0.72, zUnten)}`,
    `Q ${P(a, zUnten + d * 0.2)} ${P(a * 0.9, zUnten + d)}`,
    `L ${P(-a, zUnten + d)}`,
    "Z",
  ].join(" ");
}

function boardOben(len: number, breite: number): string {
  const a = len / 2, b = breite / 2;
  return [
    `M ${O(0, a)}`,
    `C ${O(b * 0.85, a * 0.5)} ${O(b, -a * 0.2)} ${O(b * 0.75, -a)}`,
    `L ${O(-b * 0.75, -a)}`,
    `C ${O(-b, -a * 0.2)} ${O(-b * 0.85, a * 0.5)} ${O(0, a)}`,
    "Z",
  ].join(" ");
}

/**
 * viewBox, die das Rig ueber den ganzen erwarteten Winkelbereich fasst.
 *
 * Eine feste Box waere entweder zu eng (bei starkem Rollen faehrt das Brett aus dem Bild) oder
 * dauerhaft zu gross. Deshalb einmal ueber den Bereich drehen und die Huelle nehmen: der
 * Ausschnitt steht dann still, egal wie das Brett gerade liegt.
 */
function rahmen(punkte: [number, number][], maxWinkel: number, rand = 7): string {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let a = -maxWinkel; a <= maxWinkel + 1e-9; a += 5) {
    const r = (a * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
    for (const [x, z] of punkte) {
      const X = x * c - z * s, Z = x * s + z * c;
      x0 = Math.min(x0, X); x1 = Math.max(x1, X);
      z0 = Math.min(z0, Z); z1 = Math.max(z1, Z);
    }
  }
  return `${x0 - rand} ${-(z1 + rand)} ${x1 - x0 + 2 * rand} ${z1 - z0 + 2 * rand}`;
}

const BOARD = "fill-brand-500";
const TEIL = "fill-slate-400";      // slate kippt selbst mit dem Theme -> nur EINE Zahl
const MAST = "fill-slate-500";      // 500 ist in beiden Themes derselbe Mittelton
// DER STAB IST BLAU (Jan, 25.09.2026): „dann sieht man ob der vor oder hinter dem foil ist und
// ueberlegt nicht jedesmal aus welcher richtung man da draufschaut." In der Frontansicht liegen
// Frontfluegel und Stab uebereinander — ohne Farbunterschied ist nicht zu sehen, welches Teil
// naeher ist, und damit auch nicht, von wo man schaut. Eine Farbe je Teil, in allen drei
// Ansichten dieselbe: sky-500 liegt wie slate-500 in beiden Themes im lesbaren Mittelfeld.
const STAB = "fill-sky-500";
// NUR DIE DICKE DES STABS, und nur in der Frontansicht (Jan, 25.09.2026: „ist nur beim yaw
// sichtbar, in der mitte vielleicht miniminimal"). Er hatte recht, und es liegt an den echten
// Massen: Jans Stab misst 39 cm Spannweite bei 4,8 cm Tiefe, der Frontfluegel 156 bei 12,8. Selbst
// mit der ueblichen Ueberhoehung bleibt davon ein Strich von zwei Zentimetern uebrig, der unter
// der Woelbung des Frontfluegels verschwindet. Dabei ist GERADE ER das Teil, das die
// Blickrichtung verraet. Spannweite, Hoehe und Lage bleiben massstaeblich — ueberhoeht ist
// ausschliesslich die Dicke, wie schon bei Fluegeldicke und Mastbreite.
const STAB_EXTRA = 2.4;

/**
 * Die WASSERLINIE als Bezug, plus Drehpunkt-Fadenkreuz am Frontfluegel.
 *
 * `hoehe` ist die Hoehe der Linie ueber dem Frontfluegel in Zentimetern. Sie lag zuerst auf
 * Hoehe des Fluegels selbst (0) — das war zwar der Drehpunkt der Zeichnung, aber eben nicht die
 * Wasseroberflaeche: beim Foilen steht der Fluegel tief unten und das Brett darueber in der
 * Luft. Jan am 21.09.2026: „zeichne die horizontale Linie mal so etwa 40 cm hoeher (oder wenn
 * die Masthoehe bekannt ist genau in der Mitte als Referenzlinie), dann entspricht das eher der
 * echten Wasserlinie". Die Masthoehe kennen wir, also genau die Mitte — bei seinem 85er Mast
 * sind das die 42,5 cm, die er geschaetzt hat. Reine Darstellung, an keiner Zahl haengt etwas.
 *
 * Das Fadenkreuz bleibt beim Fluegel: es markiert, worum sich die Zeichnung dreht.
 *
 * Die Linie ist bewusst viel breiter als jedes Bild: die viewBox schneidet ab, und so endet sie
 * nie mitten im Bild, egal wie gross der Ausschnitt gerade ausfaellt.
 */
function Bezug({ hoehe = 0 }: { hoehe?: number }) {
  return (
    <g>
      <line x1={-400} y1={-hoehe} x2={400} y2={-hoehe} className="stroke-slate-500"
        strokeDasharray="6 7" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <circle cx={0} cy={0} r={3.2} fill="none" className="stroke-slate-400"
        strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
    </g>
  );
}

/**
 * SEITENANSICHT fuer das Nicken. Nase nach rechts.
 *
 * `hub` hebt und senkt das ganze Rig gegenueber der gestrichelten Linie. Das geht ohne
 * Umrechnung, weil hier ohnehin in Zentimetern gezeichnet wird — 12 cm Hub sind 12 cm im Bild.
 * Der Bildausschnitt rechnet `hubBereich` mit ein, damit er waehrend des Abspielens still steht
 * statt mitzuatmen.
 */
export function SeitenAnsicht({ rig, pitch, hub = 0, hubBereich = 0 }: {
  rig: Rig; pitch: number; hub?: number; hubBereich?: number;
}) {
  const m = rig.mast_len_cm, a = rig.board_len_cm / 2;
  const eckpunkte: [number, number][] = [
    [a, m + BOARD_DICKE + hubBereich], [-a, m + BOARD_DICKE + hubBereich], [-a, m],
    [rig.x_stab_cm - rig.stab_chord_cm, -hubBereich], [rig.foil_chord_cm, -hubBereich],
  ];
  return (
    <svg viewBox={rahmen(eckpunkte, 25)} className="h-40 w-full" preserveAspectRatio="xMidYMid meet">
      <Bezug hoehe={rig.mast_len_cm / 2} />
      <g transform={`translate(0 ${-hub}) rotate(${-pitch})`}>
        <path d={boardSeite(rig.board_len_cm, m)} className={BOARD} />
        {/* Mast: von der Seite ein Blatt, nach unten leicht schmaler. */}
        <path className={MAST} d={[
          `M ${P(rig.x_mast_cm + MAST_TIEFE / 2, m)}`,
          `L ${P(rig.x_mast_cm + MAST_TIEFE * 0.4, 0)}`,
          `L ${P(rig.x_mast_cm - MAST_TIEFE * 0.4, 0)}`,
          `L ${P(rig.x_mast_cm - MAST_TIEFE / 2, m)}`, "Z"].join(" ")} />
        {/* Rumpf: nach vorn zum Frontfluegel, nach hinten zum Stab. */}
        <rect className={MAST} x={rig.x_stab_cm} y={-RUMPF_DICKE / 2}
          width={rig.x_foil_cm - rig.x_stab_cm} height={RUMPF_DICKE} rx={RUMPF_DICKE / 2} />
        <path d={profilSeite(rig.x_foil_cm, 0, rig.foil_chord_cm)} className={TEIL} />
        {/* Ohne Kontur, aus demselben Grund wie in der Frontansicht: die Form ist zu klein,
            eine Linie wuerde sie auffressen statt sie zu zeigen. */}
        <path d={profilSeite(rig.x_stab_cm, 0, rig.stab_chord_cm)} className={STAB} />
      </g>
    </svg>
  );
}

/**
 * FRONTANSICHT fuer das Rollen — mit der Hoehenverschiebung aus dem Nicken.
 *
 * BLICK VON HINTEN — wie hinter dem Fahrer herfahrend. Der Stab liegt rund 50 cm hinter dem
 * Frontfluegel, ist von hier aus also das NAEHERE Teil: er wird zuletzt gezeichnet, liegt damit
 * oben und ist blau. Der Frontfluegel dahinter bleibt grau. Beim Nicken wandert der Stab
 * gegenueber dem Frontfluegel sichtbar nach oben oder unten (s. unten).
 */
export function FrontAnsicht({ rig, roll, pitch }: { rig: Rig; roll: number; pitch: number }) {
  const r = (pitch * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const hoehe = (x: number, z: number) => z * c + x * s;   // starrer Koerper, auf die Blickachse
  const bBoard = breiteAusLaenge(rig.board_len_cm);
  const zBoard = hoehe(rig.x_mast_cm, rig.mast_len_cm);    // dort, wo der Mast das Brett trifft
  const zMastFuss = hoehe(rig.x_mast_cm, 0);
  const zStab = hoehe(rig.x_stab_cm, 0);
  const halb = Math.max(rig.foil_span_cm, bBoard) / 2;
  const eckpunkte: [number, number][] = [
    [halb, 0], [-halb, 0], [bBoard / 2, rig.mast_len_cm + BOARD_DICKE],
    [-bBoard / 2, rig.mast_len_cm + BOARD_DICKE], [0, -rig.foil_span_cm * 0.07],
  ];
  return (
    <svg viewBox={rahmen(eckpunkte, 40)} className="h-40 w-full" preserveAspectRatio="xMidYMid meet">
      <Bezug hoehe={rig.mast_len_cm / 2} />
      {/* ROLLEN DREHT ANDERSHERUM ALS NICKEN, und das ist kein Tippfehler.
          Im Brett-System zeigt die Querachse nach LINKS (Rechtssystem: x nach vorn, z nach oben),
          auf dem Bildschirm zeigt x nach RECHTS. Wer von hinten auf das Brett schaut, sieht links
          links — die seitliche Achse ist also gespiegelt, und mit ihr der Drehsinn. Jan am
          21.09.2026 an seiner ersten echten Pump-Aufnahme: „ganz am Ende beim Gleiten bin ich nach
          links gekippt und nicht nach rechts, so wie es gerade in der Animation dargestellt wird."
          Beim NICKEN gibt es das Problem nicht: dort liegt die Nase bei +x und damit rechts im
          Bild, wie es sein soll. */}
      <g transform={`rotate(${roll})`}>
        <rect className={BOARD} x={-bBoard / 2} y={-(zBoard + BOARD_DICKE)}
          width={bBoard} height={BOARD_DICKE} rx={BOARD_DICKE / 2.2} />
        <rect className={MAST} x={-(MAST_DICKE * FRONT_UEBERHOEHUNG) / 2} y={-zBoard}
          width={MAST_DICKE * FRONT_UEBERHOEHUNG} height={Math.max(1, zBoard - zMastFuss)} />
        {/* REIHENFOLGE = TIEFE, und sie war falsch herum (Jan, 25.09.2026: „entweder sind die
            richtungen vertauscht oder man schaut aktuell von vorne drauf"). Er hatte recht:
            bis hierher wurde der Stab ZUERST gezeichnet und der Frontfluegel darueber — wer
            ueberlappende Teile so stapelt, sagt damit „der Frontfluegel ist naeher", und das
            ist der Blick von VORN. Der Drehsinn stimmte dagegen fuer den Blick von HINTEN; er
            wurde am 21.09. an einer echten Aufnahme geeicht. Das Bild widersprach sich also in
            sich, und genau deshalb war die Blickrichtung nicht abzulesen.
            Jetzt konsequent VON HINTEN: erst der Frontfluegel (weiter weg), dann der Stab
            darueber (naeher) und in Blau. */}
        <path d={fluegelVorn(rig.foil_span_cm, rig.foil_chord_cm, hoehe(rig.x_foil_cm, 0))}
          className={TEIL} />
        {/* KEINE KONTUR (Jan, 25.09.2026: „blau ist nur ein 1px strich in der mitte des
            stabs"). Der Stab trug eine Linie von 1,4 px — bei rund einem Pixel je Zentimeter
            frisst die von beiden Seiten in eine Form, die selbst nur knapp fuenf Zentimeter
            dick ist. Uebrig blieb ein dunkler Rand mit einem blauen Faden darin. Die Flaeche
            allein sagt alles; eine Kontur braucht hier nichts. */}
        <path d={fluegelVorn(rig.stab_span_cm, rig.stab_chord_cm, zStab, STAB_EXTRA)}
          className={STAB} />
      </g>
    </svg>
  );
}

/** DRAUFSICHT fuer das Gieren. Nase nach oben, das Foil scheint unter dem Brett durch. */
export function Drauf({ rig, yaw }: { rig: Rig; yaw: number }) {
  const bBoard = breiteAusLaenge(rig.board_len_cm);
  const halb = Math.max(rig.foil_span_cm, bBoard) / 2;
  const eckpunkte: [number, number][] = [
    [halb, 0], [-halb, 0], [0, rig.board_len_cm / 2], [0, rig.x_stab_cm - rig.stab_chord_cm],
  ];
  return (
    <svg viewBox={rahmen(eckpunkte, 40)} className="h-40 w-full" preserveAspectRatio="xMidYMid meet">
      <Bezug />
      {/* Die Nase zeigt hier nach OBEN (Bildschirm-y = -x des Bretts). Eine Rechtskurve schwenkt
          sie also nach rechts, im Uhrzeigersinn — und genau das ist ein POSITIVER SVG-Winkel.
          Damit dreht die Draufsicht gleichsinnig mit der Zahl, anders als die Frontansicht.
          Das Vorzeichen des Gierens ist seit 21.09.2026 am GPS BELEGT und nicht mehr hergeleitet
          (Jan: „das Gieren muesste aus dem GPS-Track auch eindeutig ableitbar sein"): der Server
          zaehlt Rechtskurven positiv, so wie der Kurs ueber Grund waechst, und prueft das je
          Aufnahme am Track nach — s. `lage.gier_gegen_gps`. An #9528 und #9535 kam die Steigung
          Gieren/Kursaenderung mit 0,90 und 1,13 heraus (r 0,89 bzw. 0,60). */}
      <g transform={`rotate(${yaw})`}>
        <rect className={MAST} x={-RUMPF_DICKE / 2} y={-rig.x_foil_cm}
          width={RUMPF_DICKE} height={Math.max(1, rig.x_foil_cm - rig.x_stab_cm)} />
        <path d={fluegelOben(rig.foil_span_cm, rig.foil_chord_cm, rig.x_foil_cm)} className={TEIL} />
        <path d={fluegelOben(rig.stab_span_cm, rig.stab_chord_cm, rig.x_stab_cm)} className={STAB} />
        {/* Brett zuletzt und halbdurchsichtig: es liegt oben, das Foil soll durchscheinen. */}
        <path d={boardOben(rig.board_len_cm, bBoard)} className={`${BOARD} opacity-75`} />
      </g>
    </svg>
  );
}
