import { SessionSummary } from "./api";

// Synchrones Abspielen mehrerer Sessions auf EINER Uhrzeit-Achse (Jans Wunsch 31.08.:
// „wenn zwei Sessions sich zeitlich überschneiden … einfach alles zeitlich synchron abspielen,
// und nur Pausen in denen gar keiner on-foil ist überspringen ohne Pause" — für Videos, in denen
// mehrere gleichzeitig auf dem Wasser sind).
//
// ────────────────────────────────────────────────────────────────────────────────────────────
// DIE FALLE, die hier alles entscheidet: Sample-Index ≠ Sekunden.
//
// `track_geojson` hat KEINE Zeitachse, nur Punkte. Die Wiedergabe in der Session-Detailansicht
// rechnet deshalb mit „~1 GPS-Punkt/s" — für EINE Session als grobe Vorschau in Ordnung. Für
// mehrere Sessions auf einer gemeinsamen Uhr ist es falsch: fehlt GPS (Uhr am Steg, Empfang weg),
// zählt der Index nicht weiter, die Uhrzeit aber schon. Nachgemessen an Session #470:
// innerhalb eines Laufs sind es exakt 1000 ms/Index, über die Session hinweg driftet es auf
// 1139 ms/Index — am Ende also 14 % daneben, mehrere Minuten. Zwei Fahrer liefen damit sichtbar
// auseinander.
//
// Deshalb bauen wir die Achse aus BELEGTEN Ankern statt aus einer Annahme: jedes Segment liefert
// `i_start`/`i_end` (Sample-Index) zusammen mit `t_start_session_ms`/`t_end_session_ms`
// (Millisekunden seit Aufzeichnungsstart). Dazwischen wird linear interpoliert.
//
// Das ist bewusst nur zwischen den Läufen ungenau — und genau die Strecken überspringen wir
// ohnehin. Zu den drei Zeitbegriffen siehe docs/DATA-PIPELINE.md §„Drei Zeitbegriffe";
// `t_start_session_ms` ist der, den wir hier brauchen (NICHT `t_start_ms`, der ist auf den
// Trim-Beginn re-basiert).
// ────────────────────────────────────────────────────────────────────────────────────────────

/** Ein Anker: Sample-Index ↔ Millisekunden seit Aufzeichnungsstart. */
interface Anker { i: number; ms: number }

/** Rechnet für EINE Session zwischen Sample-Index und absoluter Zeit um. */
export interface Zeitachse {
  /** Absolute Zeit (ms seit 1970) für einen — auch gebrochenen — Sample-Index. */
  zeit(i: number): number;
  /** Sample-Index (gebrochen) für eine absolute Zeit; `null` außerhalb der Aufzeichnung. */
  index(tAbs: number): number | null;
  /** Erster und letzter aufgezeichneter Zeitpunkt, absolut. */
  von: number;
  bis: number;
}

/** In einem Lauf tickt die Uhr mit der GPS-Rate — 1 Sample = 1 s. Nur außerhalb der Anker
 *  müssen wir extrapolieren, und dort ist das die beste verfügbare Annahme. */
const MS_JE_SAMPLE = 1000;

export function zeitachseVon(session: SessionSummary): Zeitachse | null {
  const gj = session.analysis?.track_geojson;
  const segs = session.analysis?.segments ?? [];
  const n: number = gj?.geometry?.coordinates?.length ?? 0;
  if (!n || !segs.length || !session.started_at) return null;
  const start = Date.parse(session.started_at);
  if (Number.isNaN(start)) return null;

  // Anker einsammeln und nach Index sortieren. Doppelte Indizes (zwei Segmente stoßen aneinander)
  // fallen weg — sonst entstünde eine Stufe mit Steigung 0, durch die man nicht dividieren kann.
  const roh: Anker[] = [];
  for (const s of segs) {
    if (typeof s?.i_start === "number" && typeof s?.t_start_session_ms === "number")
      roh.push({ i: s.i_start, ms: s.t_start_session_ms });
    if (typeof s?.i_end === "number" && typeof s?.t_end_session_ms === "number")
      roh.push({ i: s.i_end, ms: s.t_end_session_ms });
  }
  roh.sort((a, b) => a.i - b.i);
  const anker: Anker[] = [];
  for (const a of roh) {
    const letzter = anker[anker.length - 1];
    if (letzter && a.i === letzter.i) continue;
    // Nicht-monotone Anker verwerfen statt die Achse rückwärts laufen zu lassen.
    if (letzter && a.ms <= letzter.ms) continue;
    anker.push(a);
  }
  if (anker.length < 2) return null;

  // Ränder ergänzen: vor dem ersten und nach dem letzten Lauf mit der GPS-Rate extrapolieren.
  const erster = anker[0], letzter = anker[anker.length - 1];
  if (erster.i > 0) anker.unshift({ i: 0, ms: erster.ms - erster.i * MS_JE_SAMPLE });
  if (letzter.i < n - 1) anker.push({ i: n - 1, ms: letzter.ms + (n - 1 - letzter.i) * MS_JE_SAMPLE });

  const sessionMs = (i: number): number => {
    const x = Math.max(anker[0].i, Math.min(i, anker[anker.length - 1].i));
    let lo = 0, hi = anker.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (anker[m].i <= x) lo = m; else hi = m; }
    const a = anker[lo], b = anker[hi];
    const f = b.i === a.i ? 0 : (x - a.i) / (b.i - a.i);
    return a.ms + f * (b.ms - a.ms);
  };

  const von = start + sessionMs(anker[0].i);
  const bis = start + sessionMs(anker[anker.length - 1].i);

  return {
    von, bis,
    zeit: (i) => start + sessionMs(i),
    index: (tAbs) => {
      if (tAbs < von || tAbs > bis) return null;
      const ms = tAbs - start;
      let lo = 0, hi = anker.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (anker[m].ms <= ms) lo = m; else hi = m; }
      const a = anker[lo], b = anker[hi];
      const f = b.ms === a.ms ? 0 : (ms - a.ms) / (b.ms - a.ms);
      return a.i + f * (b.i - a.i);
    },
  };
}

export interface Zeitraum { von: number; bis: number }

/** Die Läufe einer Session als absolute Zeiträume — dort ist jemand on foil. */
export function laufZeitraeume(session: SessionSummary): Zeitraum[] {
  const segs = session.analysis?.segments ?? [];
  if (!session.started_at) return [];
  const start = Date.parse(session.started_at);
  if (Number.isNaN(start)) return [];
  const out: Zeitraum[] = [];
  for (const s of segs) {
    const a = s?.t_start_session_ms, b = s?.t_end_session_ms;
    if (typeof a === "number" && typeof b === "number" && b > a)
      out.push({ von: start + a, bis: start + b });
  }
  return out;
}

/** Kürzere Lücken NICHT überspringen: unter ein paar Sekunden wirkt ein Sprung wie ein Ruckler,
 *  und zwischen zwei Läufen desselben Fahrers ist so eine Pause oft die halbe Geschichte. */
const MIN_SPRUNG_MS = 5000;
/** Etwas Vorlauf/Nachlauf um jeden Lauf — sonst setzt das Bild genau im ersten Pump ein. */
const RAND_MS = 2000;

/** Überlappende/nahe Zeiträume zu einer aufsteigenden, überschneidungsfreien Liste verschmelzen. */
export function verschmelzen(alle: Zeitraum[]): Zeitraum[] {
  const s = [...alle].sort((a, b) => a.von - b.von);
  const out: Zeitraum[] = [];
  for (const z of s) {
    const l = out[out.length - 1];
    if (l && z.von - l.bis <= MIN_SPRUNG_MS) l.bis = Math.max(l.bis, z.bis);
    else out.push({ ...z });
  }
  return out;
}

export interface SyncPlan {
  /** Die Sessions, die wirklich mitlaufen (überschneiden sich, gleicher Spot). */
  sessions: SessionSummary[];
  achsen: Map<number, Zeitachse>;
  /** Abschnitte, in denen MINDESTENS EINER on foil ist — nur die werden abgespielt. */
  aktiv: Zeitraum[];
  /** Summe der aktiven Abschnitte in ms = die Länge der Wiedergabe. */
  dauerMs: number;
  /** Wiedergabe-Position (0…dauerMs) → absolute Uhrzeit. */
  zuUhrzeit(posMs: number): number;
}

/**
 * Baut den Plan — oder gibt `null` zurück, wenn synchrones Abspielen keinen Sinn ergibt.
 *
 * Bedingung (Jan): die Sessions müssen sich **zeitlich überschneiden** UND am **gleichen Spot**
 * sein. Beides zusammen, sonst laufen im Bild Leute nebeneinander her, die sich nie gesehen haben.
 */
export function syncPlan(sessions: SessionSummary[]): SyncPlan | null {
  const mitAchse = sessions
    .map((s) => ({ s, a: zeitachseVon(s) }))
    .filter((x): x is { s: SessionSummary; a: Zeitachse } => x.a != null);
  if (mitAchse.length < 2) return null;

  // Nach Spot gruppieren; ohne Spotnamen kann man Gleichzeitigkeit nicht sinnvoll behaupten.
  const nachSpot = new Map<string, typeof mitAchse>();
  for (const x of mitAchse) {
    const spot = (x.s.place_name ?? "").trim();
    if (!spot) continue;
    (nachSpot.get(spot) ?? nachSpot.set(spot, []).get(spot)!).push(x);
  }

  // Innerhalb eines Spots in ZUSAMMENHÄNGENDE Gruppen zerlegen — nicht einfach alles nehmen,
  // was sich mit irgendwem überschneidet.
  //
  // Warum das wichtig ist, zeigt Illmensee am 5. Juli: dort liegen fünf Sessions, aber es sind
  // ZWEI Ausfahrten — morgens 07:58–08:56 zu dritt, abends 18:46–18:59 zu zweit. Mit der
  // laxen Regel wären alle fünf eine Gruppe geworden, die Wiedergabe hätte elf Stunden
  // umspannt und mitten im Abspielen vom Morgen in den Abend geschnitten. Es soll aber genau
  // die eine Runde zeigen, in der man zusammen auf dem Wasser war.
  const gruppen: (typeof mitAchse)[] = [];
  for (const proSpot of nachSpot.values()) {
    const offen = [...proSpot];
    while (offen.length) {
      const gruppe = [offen.shift()!];
      // Wer die Gruppe zeitlich berührt, gehört dazu — und zieht wiederum weitere hinein.
      for (let gewachsen = true; gewachsen; ) {
        gewachsen = false;
        for (let k = offen.length - 1; k >= 0; k--) {
          const kandidat = offen[k];
          if (gruppe.some((g) => kandidat.a.von < g.a.bis && g.a.von < kandidat.a.bis)) {
            gruppe.push(kandidat); offen.splice(k, 1); gewachsen = true;
          }
        }
      }
      if (gruppe.length >= 2) gruppen.push(gruppe);
    }
  }
  // Die größte Gruppe gewinnt; bei Gleichstand die mit der längeren gemeinsamen Zeit.
  gruppen.sort((a, b) => b.length - a.length ||
    (Math.max(...b.map((x) => x.a.bis)) - Math.min(...b.map((x) => x.a.von))) -
    (Math.max(...a.map((x) => x.a.bis)) - Math.min(...a.map((x) => x.a.von))));
  const beste = gruppen[0] ?? [];
  if (beste.length < 2) return null;

  const roh: Zeitraum[] = [];
  for (const x of beste)
    for (const z of laufZeitraeume(x.s))
      roh.push({ von: z.von - RAND_MS, bis: z.bis + RAND_MS });
  const aktiv = verschmelzen(roh);
  if (!aktiv.length) return null;

  const dauerMs = aktiv.reduce((s, z) => s + (z.bis - z.von), 0);

  return {
    sessions: beste.map((x) => x.s),
    achsen: new Map(beste.map((x) => [x.s.id, x.a])),
    aktiv,
    dauerMs,
    zuUhrzeit: (posMs: number) => {
      let rest = Math.max(0, Math.min(posMs, dauerMs));
      for (const z of aktiv) {
        const laenge = z.bis - z.von;
        if (rest <= laenge) return z.von + rest;
        rest -= laenge;
      }
      return aktiv[aktiv.length - 1].bis;
    },
  };
}
