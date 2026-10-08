/*
 * Pumpfoil-Recorder fuer HUAWEI-Uhren mit ArkTS (Watch 5 / HarmonyOS 5+) — der reine Kern,
 * OHNE Geraete-APIs. Gegenstueck zu watch-huawei/common/kern.js (Lite + JS-FA).
 *
 * Gleiche Logik, gleiche Ausgabe: test/arkts-kern.test.mjs uebersetzt diese Datei mit tsc und
 * prueft sie gegen kern.js — Binaerformat, Chunks, Zeitachse, Sendeplan und Nachrichten-Teile
 * muessen BYTEGLEICH sein, denn Handy und Server unterscheiden die Uhren-Linien nicht.
 *
 * Bewusst im strengen ArkTS-Umfang (feste Typen, keine Tupel, kein any, keine Prototypen),
 * damit die Datei ohne Anpassung in DevEco uebersetzt.
 *
 * Unterschied zu Lite: die ArkTS-Uhr liefert eine GPS-Geschwindigkeit. Sie geht als `speed`
 * mit (m/s, -1 = unbekannt); der Server nimmt sie, wie bei Wear OS und Apple Watch.
 */

export const ACCEL_SCALE: number = 2048;          // 2048 = 1 g (docs/ingest-contract.md)
const G: number = 9.80665;
export const ACCEL_JE_BLOCK: number = 250;        // ~5 s bei 50 Hz
export const GPS_JE_BLOCK: number = 30;           // ~30 s bei 1 Hz
const MAX_FIX_ALTER_MS: number = 10 * 60 * 1000;
export const TEIL_MAX: number = 800;

const B64: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 eines Byte-Arrays (Zahlen 0-255) — wie kern.js, damit die Ausgabe gleich bleibt. */
export function b64(bytes: number[]): string {
  let out: string = '';
  let i: number = 0;
  const n: number = bytes.length;
  for (; i + 2 < n; i += 3) {
    const v: number = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64.charAt((v >> 18) & 63) + B64.charAt((v >> 12) & 63) +
      B64.charAt((v >> 6) & 63) + B64.charAt(v & 63);
  }
  if (i < n) {
    const rest: number = n - i;
    const w: number = (bytes[i] << 16) | (rest > 1 ? bytes[i + 1] << 8 : 0);
    out += B64.charAt((w >> 18) & 63) + B64.charAt((w >> 12) & 63) +
      (rest > 1 ? B64.charAt((w >> 6) & 63) : '=') + '=';
  }
  return out;
}

/** m/s^2 -> int16 in 1/2048 g, gekappt. */
export function i16(ms2: number): number {
  const v: number = Math.round(ms2 / G * ACCEL_SCALE);
  if (v > 32767) {
    return 32767;
  }
  if (v < -32768) {
    return -32768;
  }
  return v;
}

/** int16-Werte (x,y,z,x,y,z,...) -> Little-Endian-Bytes. */
export function i16Bytes(werte: number[]): number[] {
  const b: number[] = [];
  for (let i = 0; i < werte.length; i++) {
    const v: number = werte[i] & 0xffff;
    b.push(v & 0xff, (v >> 8) & 0xff);
  }
  return b;
}

/**
 * Zeitachse mit Pausen: alle Zeiten sind „aktive" ms seit Start, Pausen zaehlen nicht
 * (`pauses` im /complete: [Position auf der aktiven Achse, Dauer]).
 */
export class Zeitachse {
  startMs: number;
  pausiertMs: number = 0;
  pauseSeit: number = 0;
  pausen: number[][] = [];

  constructor(startMs: number) {
    this.startMs = startMs;
  }

  jetzt(wandMs: number): number {
    const bis: number = this.pauseSeit > 0 ? this.pauseSeit : wandMs;
    return bis - this.startMs - this.pausiertMs;
  }

  pause(wandMs: number): void {
    if (this.pauseSeit > 0) {
      return;
    }
    this.pauseSeit = wandMs;
  }

  weiter(wandMs: number): void {
    if (this.pauseSeit === 0) {
      return;
    }
    const dauer: number = wandMs - this.pauseSeit;
    const bei: number = this.pauseSeit - this.startMs - this.pausiertMs;
    if (dauer > 0) {
      this.pausen.push([bei, dauer]);
      this.pausiertMs += dauer;
    }
    this.pauseSeit = 0;
  }

  /** Wanduhr-Zeit (z. B. eines GPS-Fixes) auf die aktive Achse; -1 = unbrauchbar. */
  auf(wandMs: number, jetztWandMs: number): number {
    if (!(wandMs > 0) || Math.abs(jetztWandMs - wandMs) > MAX_FIX_ALTER_MS) {
      return -1;
    }
    const t: number = wandMs - this.startMs - this.pausiertMs;
    return t >= 0 ? t : -1;
  }
}

export interface AccelChunk {
  index: number;
  kind: string;
  encoding: string;
  t0_ms: number;
  count: number;
  data: string;
}

export interface GpsChunk {
  index: number;
  kind: string;
  encoding: string;
  t0_ms: number;
  count: number;
  data: number[][];
}

export type Chunk = AccelChunk | GpsChunk;

/** Sammelt Bloecke, gibt fertige Chunks im Upload-Format zurueck. EINE Indexfolge fuer alle Arten. */
export class Sammler {
  index: number = 0;
  accel: number[] = [];
  accelT0: number = -1;
  gps: number[][] = [];
  gpsT0: number = -1;
  letzteGpsT: number = -1;
  hr: number = 0;
  hrAnzahl: number = 0;
  accelAnzahl: number = 0;
  gpsAnzahl: number = 0;

  /** Ein Beschleunigungswert in m/s^2; t = aktive ms. Chunk, wenn der Block voll ist. */
  accelWert(x: number, y: number, z: number, t: number): AccelChunk | null {
    if (this.accelT0 < 0) {
      this.accelT0 = t;
    }
    this.accel.push(i16(x), i16(y), i16(z));
    this.accelAnzahl++;
    return this.accel.length >= ACCEL_JE_BLOCK * 3 ? this.accelBlock() : null;
  }

  accelBlock(): AccelChunk | null {
    if (this.accel.length === 0) {
      return null;
    }
    const c: AccelChunk = {
      index: this.index++, kind: 'accel', encoding: 'int16-b64',
      t0_ms: Math.max(0, Math.round(this.accelT0)), count: this.accel.length / 3,
      data: b64(i16Bytes(this.accel))
    };
    this.accel = [];
    this.accelT0 = -1;
    return c;
  }

  puls(bpm: number): void {
    if (bpm > 0 && bpm < 255) {
      this.hr = Math.round(bpm);
      this.hrAnzahl++;
    }
  }

  /**
   * Ein GPS-Fix. t = aktive ms; speed in m/s oder -1 (unbekannt). Zeit nie rueckwaerts, sonst
   * baut der Server eine Strecke mit 0 s Dauer.
   */
  gpsFix(lat: number, lon: number, genauigkeit: number, t: number, speed: number): GpsChunk | null {
    if (!(t >= 0) || t <= this.letzteGpsT) {
      return null;
    }
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180) || (lat === 0 && lon === 0)) {
      return null;
    }
    this.letzteGpsT = t;
    if (this.gpsT0 < 0) {
      this.gpsT0 = t;
    }
    const v: number = speed >= 0 ? Math.round(speed * 100) / 100 : -1;
    this.gps.push([Math.round(t), lat, lon, v, this.hr, genauigkeit > 0 ? genauigkeit : -1]);
    this.gpsAnzahl++;
    return this.gps.length >= GPS_JE_BLOCK ? this.gpsBlock() : null;
  }

  gpsBlock(): GpsChunk | null {
    if (this.gps.length === 0) {
      return null;
    }
    const c: GpsChunk = {
      index: this.index++, kind: 'gps', encoding: 'json',
      t0_ms: Math.round(this.gpsT0), count: this.gps.length, data: this.gps
    };
    this.gps = [];
    this.gpsT0 = -1;
    return c;
  }

  /** Alles, was noch im Puffer liegt (beim Stopp und vor einer Pause). */
  rest(): Chunk[] {
    const r: Chunk[] = [];
    const a: AccelChunk | null = this.accelBlock();
    if (a !== null) {
      r.push(a);
    }
    const g: GpsChunk | null = this.gpsBlock();
    if (g !== null) {
      r.push(g);
    }
    return r;
  }
}

/** Sitzungs-ID: nur [A-Za-z0-9_-]. */
export function neueId(wandMs: number, zufall: number): string {
  return 'hw-' + wandMs.toString(36) + '-' + Math.floor(zufall * 1e9).toString(36);
}

/** Dateinamen (ohne Ordner; der kommt aus der Geraete-Schicht). Handy erkennt sie am Muster. */
export function dateiMeta(id: string): string {
  return 'm_' + id + '.json';
}

export function dateiChunk(id: string, n: number): string {
  return 'c_' + id + '_' + ('00000' + n).slice(-6) + '.json';
}

export function dateiEnde(id: string): string {
  return 'e_' + id + '.json';
}

/**
 * Warteschlange zum Handy: eine Nachricht gleichzeitig, Fehler GEZAEHLT und angezeigt (Regel
 * 13.09.: nie nur einmal melden), Wartezeit 5 s, 15 s, 30 s, dann 60 s.
 */
export class Warteschlange {
  laeuft: boolean = false;
  fehlerFolge: number = 0;
  fehlerGesamt: number = 0;
  gesendet: number = 0;
  letzterCode: number = 0;
  naechsterVersuch: number = 0;

  darf(jetzt: number): boolean {
    return !this.laeuft && jetzt >= this.naechsterVersuch;
  }

  start(): void {
    this.laeuft = true;
  }

  ok(): void {
    this.laeuft = false;
    this.fehlerFolge = 0;
    this.gesendet++;
    this.naechsterVersuch = 0;
  }

  fehler(code: number, jetzt: number): void {
    this.laeuft = false;
    this.fehlerFolge++;
    this.fehlerGesamt++;
    this.letzterCode = code;
    const w: number[] = [5000, 15000, 30000, 60000];
    this.naechsterVersuch = jetzt + w[Math.min(this.fehlerFolge - 1, w.length - 1)];
  }
}

export interface PlanEintrag {
  id: string;
  n: number;    // geschriebene Chunks
  g: number;    // davon beim Handy
  m: number;    // Meta beim Handy (0/1)
  e: number;    // Ende geschrieben (0/1)
  eg: number;   // Ende beim Handy (0/1)
}

export interface PlanDaten {
  s: PlanEintrag[];
}

export interface Datei {
  id: string;
  art: string;  // m | c | e
  nr: number;
}

export interface PlanStand {
  fertig: number;
  gesamt: number;
}

/**
 * Sendeplan: WAS als Naechstes zum Handy geht, ohne Dateien aufzulisten (Zaehler je Session,
 * als kleine Datei mitgeschrieben). Reihenfolge je Session: Meta, Chunks 0..n-1, Ende.
 */
export class Sendeplan {
  s: PlanEintrag[] = [];

  constructor(daten?: PlanDaten) {
    if (daten !== undefined && daten.s !== undefined) {
      this.s = daten.s;
    }
  }

  neu(id: string): void {
    const x: PlanEintrag = { id: id, n: 0, g: 0, m: 0, e: 0, eg: 0 };
    this.s.push(x);
  }

  finde(id: string): PlanEintrag | null {
    for (let i = 0; i < this.s.length; i++) {
      if (this.s[i].id === id) {
        return this.s[i];
      }
    }
    return null;
  }

  chunk(id: string): void {
    const x: PlanEintrag | null = this.finde(id);
    if (x !== null) {
      x.n++;
    }
  }

  ende(id: string): void {
    const x: PlanEintrag | null = this.finde(id);
    if (x !== null) {
      x.e = 1;
    }
  }

  private offenIn(x: PlanEintrag): Datei | null {
    if (!x.m) {
      return { id: x.id, art: 'm', nr: -1 };
    }
    if (x.g < x.n) {
      return { id: x.id, art: 'c', nr: x.g };
    }
    if (x.e && !x.eg) {
      return { id: x.id, art: 'e', nr: -1 };
    }
    return null;
  }

  /** Naechste Datei oder null. Erledigte Sessions fallen heraus. */
  naechste(): Datei | null {
    while (this.s.length > 0) {
      const x: PlanEintrag = this.s[0];
      const d: Datei | null = this.offenIn(x);
      if (d !== null) {
        return d;
      }
      if (x.e && x.eg) {
        this.s.shift();
        continue;
      }
      // Laufende Aufnahme ohne neuen Chunk: die naechste Session darf nur ihre eigenen
      // Dateien schicken (es gibt nur eine laufende).
      for (let i = 1; i < this.s.length; i++) {
        const y: Datei | null = this.offenIn(this.s[i]);
        if (y !== null) {
          return y;
        }
      }
      return null;
    }
    return null;
  }

  erledigt(d: Datei): void {
    const x: PlanEintrag | null = this.finde(d.id);
    if (x === null) {
      return;
    }
    if (d.art === 'm') {
      x.m = 1;
    } else if (d.art === 'c' && d.nr === x.g) {
      x.g++;
    } else if (d.art === 'e') {
      x.eg = 1;
    }
  }

  offen(): number {
    let n: number = 0;
    for (let i = 0; i < this.s.length; i++) {
      const x: PlanEintrag = this.s[i];
      n += (x.m ? 0 : 1) + (x.n - x.g) + (x.e && !x.eg ? 1 : 0);
    }
    return n;
  }

  /** Fortschritt fuer die Anzeige: Dateien ueber alle Sessions im Plan. */
  stand(): PlanStand {
    let f: number = 0;
    let g: number = 0;
    for (let i = 0; i < this.s.length; i++) {
      const x: PlanEintrag = this.s[i];
      g += 1 + x.n + (x.e ? 1 : 0);
      f += (x.m ? 1 : 0) + x.g + (x.eg ? 1 : 0);
    }
    const r: PlanStand = { fertig: f, gesamt: g };
    return r;
  }

  /** Session verwerfen: aus dem Plan nehmen, ungesendete Dateien nennen (wie kern.js Sendeplan.weg). */
  weg(id: string): string[] {
    const aus: string[] = [];
    for (let i = 0; i < this.s.length; i++) {
      const x: PlanEintrag = this.s[i];
      if (x.id !== id) {
        continue;
      }
      if (x.m === 0) {
        aus.push(dateiMeta(id));
      }
      for (let k = x.g; k < x.n; k++) {
        aus.push(dateiChunk(id, k));
      }
      if (x.e !== 0 && x.eg === 0) {
        aus.push(dateiEnde(id));
      }
      this.s.splice(i, 1);
      break;
    }
    return aus;
  }

  daten(): PlanDaten {
    const d: PlanDaten = { s: this.s };
    return d;
  }
}

export function dateiVon(d: Datei): string {
  if (d.art === 'm') {
    return dateiMeta(d.id);
  }
  if (d.art === 'e') {
    return dateiEnde(d.id);
  }
  return dateiChunk(d.id, d.nr);
}

/** Nicht-ASCII als \uXXXX — in unseren JSON-Texten gueltig, und Zeichen = Bytes. */
export function ascii(s: string): string {
  return s.replace(/[\u0080-￿]/g, (c: string): string =>
    '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4));
}

/**
 * Datei in Nachrichten-Teile: `PF1|<datei>|<teil>|<anzahl>|<rest>|<inhalt>` — dasselbe Format
 * wie Lite/JS-FA (kern.js `teile`), die Handy-Bruecken kennen nur dieses.
 */
export function teile(name: string, text: string, rest: number, max?: number): string[] {
  const t: string = ascii(text);
  const m: number = max !== undefined && max > 0 ? max : TEIL_MAX;
  const z: number = Math.max(1, rest);
  const n: number = Math.max(1, Math.ceil(t.length / m));
  const r: string[] = [];
  for (let i = 0; i < n; i++) {
    r.push('PF1|' + name + '|' + i + '|' + n + '|' + z + '|' + t.substring(i * m, (i + 1) * m));
  }
  return r;
}

/**
 * Gegenstelle: Android (org.pumpfoil.app) oder iOS (org.pumpfoil.coolwatch). Wer zuletzt
 * angenommen hat, bleibt; nach 3 Fehlschlaegen in Folge wird gewechselt.
 */
export class Gegenstelle {
  liste: string[][];
  i: number;
  folge: number = 0;

  constructor(liste: string[][], aktiv: number) {
    this.liste = liste;
    this.i = aktiv > 0 && aktiv < liste.length ? aktiv : 0;
  }

  jetzt(): string[] {
    return this.liste[this.i];
  }

  ok(): void {
    this.folge = 0;
  }

  /** true = gewechselt. */
  fehler(): boolean {
    this.folge++;
    if (this.folge >= 3 && this.liste.length > 1) {
      this.i = (this.i + 1) % this.liste.length;
      this.folge = 0;
      return true;
    }
    return false;
  }
}

/** Strecke zwischen zwei Punkten in m (nur Anzeige; der Server rechnet selbst). */
export function meter(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r: number = 6371000;
  const k: number = Math.PI / 180;
  const dLat: number = (lat2 - lat1) * k;
  const dLon: number = (lon2 - lon1) * k;
  const a: number = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * k) * Math.cos(lat2 * k) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Anzeige: Strecke und Tempo. Liefert das GPS ein Tempo, wird es genommen; sonst Strecke der
 * letzten ~5 s durch die Zeit. Spruenge ueber 15 m/s und Fixe mit Genauigkeit > 30 m zaehlen nicht.
 */
/** Auto-Start wie Zepp/kern.js: drei Fixe in Folge schneller als 7 km/h (aus Weg/Zeit). */
const AUTOSTART_MPS: number = 7 / 3.6;
const AUTOSTART_TICKS: number = 3;

export class AutoStart {
  private letzter: number[] | null = null;
  ticks: number = 0;

  /** true = jetzt starten. */
  fix(lat: number, lon: number, tMs: number): boolean {
    const p: number[] | null = this.letzter;
    this.letzter = [lat, lon, tMs];
    if (p === null) {
      return false;
    }
    const dt: number = (tMs - p[2]) / 1000;
    const v: number = dt > 0 ? meter(p[0], p[1], lat, lon) / dt : 0;
    if (dt > 0 && dt <= 5 && v > AUTOSTART_MPS && v < 30) {
      this.ticks++;
      return this.ticks >= AUTOSTART_TICKS;
    }
    this.ticks = 0;
    return false;
  }
}

export class Anzeige {
  pkt: number[][] = [];
  strecke: number = 0;
  tempo: number = 0;

  fix(lat: number, lon: number, gen: number, t: number, speed: number): void {
    if (gen > 30) {
      return;
    }
    const p: number[][] = this.pkt;
    if (p.length > 0) {
      const l: number[] = p[p.length - 1];
      const d: number = meter(l[0], l[1], lat, lon);
      const dt: number = (t - l[2]) / 1000;
      if (dt <= 0 || d / dt > 15) {
        return;
      }
      this.strecke += d;
    }
    p.push([lat, lon, t]);
    while (p.length > 1 && t - p[0][2] > 5000) {
      p.shift();
    }
    if (speed >= 0) {
      this.tempo = speed;
    } else if (p.length > 1) {
      let s: number = 0;
      for (let i = 1; i < p.length; i++) {
        s += meter(p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]);
      }
      const dt2: number = (p[p.length - 1][2] - p[0][2]) / 1000;
      this.tempo = dt2 > 0 ? s / dt2 : 0;
    }
  }
}

// --- Direkt-Upload (Uhr -> Server ohne Handy, nur ArkTS) ------------------------------------
//
// Gekoppelt laedt die Uhr eine Session erst hoch, wenn sie ABGESCHLOSSEN ist — mit allen Dateien
// am Stueck, genau wie die Android-Bruecke (HuaweiBruecke.uploadVon/uploadReihenfolge): Meta mit
// expected_chunks, GPS-Chunks zuerst in Paketen zu 30, dann /complete. Nur Sessions, von denen noch
// NICHTS per Wear Engine ging; angefangene laufen ueber das Handy zu Ende.

/** Erste Session, die fertig und noch unberuehrt ist, sonst null. */
export function direktBereit(p: Sendeplan): PlanEintrag | null {
  for (let i = 0; i < p.s.length; i++) {
    const x: PlanEintrag = p.s[i];
    if (x.e && !x.m && x.g === 0 && !x.eg) {
      return x;
    }
  }
  return null;
}

export interface ChunkPaket {
  chunks: ChunkKopf[];
}

export interface ChunkKopf {
  index: number;
  kind: string;
}

export interface DirektUpload {
  meta: string;        // Meta mit expected_chunks
  pakete: string[];    // Bodies fuer /chunks: {"chunks":[…]}, GPS zuerst
  anzahl: number;      // Chunks insgesamt
}

/**
 * Bodies fuer den Upload. Die Chunk-Texte gehen UNVERAENDERT in die Pakete (keine zweite
 * Serialisierung, die Zahlen anders schreiben koennte). `schonDa` = was der Server laut
 * received_chunks schon hat (abgebrochener Upload): geht nicht noch einmal raus.
 */
export function direktUpload(metaText: string, chunkTexte: string[], schonDa: number[], groesse: number): DirektUpload {
  const t: string = metaText.trim();
  const meta: string = t.substring(0, t.length - 1) + ',"expected_chunks":' + chunkTexte.length + '}';
  const gps: string[] = [];
  const rest: string[] = [];
  for (let i = 0; i < chunkTexte.length; i++) {
    const k: ChunkKopf = JSON.parse(chunkTexte[i]) as ChunkKopf;
    if (schonDa.indexOf(k.index) >= 0) {
      continue;
    }
    if (k.kind === 'gps') {
      gps.push(chunkTexte[i]);
    } else {
      rest.push(chunkTexte[i]);
    }
  }
  const alle: string[] = gps.concat(rest);
  const pakete: string[] = [];
  for (let i = 0; i < alle.length; i += groesse) {
    pakete.push('{"chunks":[' + alle.slice(i, i + groesse).join(',') + ']}');
  }
  const aus: DirektUpload = { meta: meta, pakete: pakete, anzahl: chunkTexte.length };
  return aus;
}
