/*
 * Datenseiten fuer ArkTS-Uhren — Gegenstueck zu common/seiten.js (Lite + JS-FA). Gleiche Logik,
 * gleiche Zeichenbefehle: test/arkts-seiten.test.mjs prueft beide gegeneinander. Erklaerungen zu
 * Herkunft (Zepp/Garmin), Schwellen und Format stehen in seiten.js; hier nur, was ArkTS anders macht
 * (feste Typen fuer die gemischten Layout-Listen aus dem Profil).
 */

const RUN_ENTER_MPS: number = 2.8;
const RUN_EXIT_MPS: number = 2.5;
const RUN_ENTER_DWELL: number = 4;
const RUN_EXIT_DWELL: number = 3;
const RUN_REARM_COOLDOWN_MS: number = 25000;
const SPEED_WIN_S: number = 3;
const BURST_WIN_MS: number = 15000;
const BURST_MARGIN_MPS: number = 5.0;
const MAX_FOIL_MPS: number = 32 / 3.6;
const BURST_ABS_MIN_MPS: number = 28 / 3.6;
const NOSTOP_MPS: number = 1.5;
const MIN_RUN_MS: number = 5000;
const MIN_RUN_AVG_MPS: number = 2.0;
const MAX_SPRUNG_MPS: number = 30;

/** Ein Layout-Element: [typ, x, y, groesse, farbe, flags, extra…] — extra ist Zahl oder Text. */
export type Element = (number | string)[];
/** Eine Seite: [0, a, b, c] klassisch oder [1, hintergrund, Element[]] frei. */
export type Seite = (number | Element[])[];

function zahl(v: number | string | Element[] | undefined): number {
  return typeof v === 'number' ? Math.trunc(v) : 0;
}

export function meter(a: number, b: number, c: number, d: number): number {
  const r: number = Math.PI / 180;
  const dLat: number = (c - a) * r;
  const dLon: number = (d - b) * r;
  const s: number = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function maxKandidat(puffer: number[][], t: number, v: number): number {
  puffer.push([t, v]);
  while (puffer.length > 0 && t - puffer[0][0] > BURST_WIN_MS) {
    puffer.shift();
  }
  const w: number[] = puffer.map((x: number[]): number => x[1]);
  w.sort((a: number, b: number): number => a - b);
  const med: number = w.length > 0 ? w[w.length >> 1] : 0;
  let x: number = v;
  if (x > med + BURST_MARGIN_MPS && x > BURST_ABS_MIN_MPS) {
    x = med;
  }
  return x > MAX_FOIL_MPS ? 0 : x;
}

export class Stand {
  spWin: number[][] = [];
  sp3: number = 0;
  cur: number = 0;
  dist: number = 0;
  max: number = 0;
  prev: number[] | null = null;
  vorher: number[] | null = null;
  burst: number[][] = [];
  spdMaxClean: number = 0;
  hr: number = 0;
  hrSum: number = 0;
  hrN: number = 0;
  hrMax: number = 0;
  foiling: boolean = false;
  enterStreak: number = 0;
  exitStreak: number = 0;
  runEndedMs: number = -100000;
  runStartMs: number = 0;
  runStartDist: number = 0;
  runMaxMps: number = 0;
  runMaxHr: number = 0;
  runCount: number = 0;
  minSpeedSeitEnde: number = 99;
  runIstFortsetzung: boolean = false;
  lastRunStartMs: number = 0;
  lastRunStartDist: number = 0;
  lastRunDurMs: number = 0;
  lastRunDistM: number = 0;
  lastRunAvgMps: number = 0;
  lastRunMaxMps: number = 0;
  lastRunMaxHr: number = 0;
  runsSumDurMs: number = 0;
  runsSumDistM: number = 0;

  /** Ein Takt je Sekunde; speed = GPS-Tempo in m/s oder -1. true = Lauf begonnen/beendet. */
  tick(el: number, jetzt: number, fix: boolean, lat: number, lon: number, speed: number, hr: number): boolean {
    let v: number = 0;
    let sprung: boolean = false;
    if (fix) {
      const p: number[] | null = this.vorher;
      if (speed >= 0) {
        v = speed;
      } else if (p !== null) {
        const dt: number = (jetzt - p[2]) / 1000;
        if (dt > 0) {
          v = meter(p[0], p[1], lat, lon) / dt;
        }
      }
      this.vorher = [lat, lon, jetzt];
    } else {
      this.vorher = null;
    }
    if (v < 0 || v > MAX_SPRUNG_MPS) {
      v = 0;
      sprung = true;
    }
    if (hr > 0) {
      this.hr = hr;
      this.hrSum += hr;
      this.hrN++;
      if (hr > this.hrMax) {
        this.hrMax = hr;
      }
    } else {
      this.hr = 0;
    }
    this.cur = fix ? v : 0;
    if (fix) {
      const q: number[] | null = this.prev;
      if (q !== null && !sprung) {
        this.dist += meter(q[0], q[1], lat, lon);
      }
      this.prev = [lat, lon];
      this.spdMaxClean = maxKandidat(this.burst, jetzt, v);
      if (this.spdMaxClean > this.max) {
        this.max = this.spdMaxClean;
      }
    }
    this.median(this.cur, el, fix);
    const vorher: boolean = this.foiling;
    this.lauf(this.sp3, this.cur, this.dist, el);
    return vorher !== this.foiling;
  }

  median(mps: number, t: number, fix: boolean): void {
    if (fix) {
      this.spWin.push([t, mps]);
    }
    while (this.spWin.length > 0 && t - this.spWin[0][0] > SPEED_WIN_S * 1000) {
      this.spWin.shift();
    }
    const v: number[] = this.spWin.map((x: number[]): number => x[1]);
    if (v.length === 0) {
      this.sp3 = 0;
      return;
    }
    v.sort((a: number, b: number): number => a - b);
    const h: number = v.length >> 1;
    this.sp3 = (v.length % 2) === 1 ? v[h] : (v[h - 1] + v[h]) / 2;
  }

  lauf(v3: number, vInst: number, dist: number, t: number): void {
    if (!this.foiling) {
      if (vInst < this.minSpeedSeitEnde) {
        this.minSpeedSeitEnde = vInst;
      }
      const gesperrt: boolean = (t - this.runEndedMs < RUN_REARM_COOLDOWN_MS) && this.minSpeedSeitEnde < NOSTOP_MPS;
      if (gesperrt) {
        this.enterStreak = 0;
        return;
      }
      this.enterStreak = (v3 >= RUN_ENTER_MPS) ? this.enterStreak + 1 : 0;
      if (this.enterStreak < RUN_ENTER_DWELL) {
        return;
      }
      this.foiling = true;
      this.exitStreak = 0;
      this.runIstFortsetzung = this.runCount > 0 && this.minSpeedSeitEnde >= NOSTOP_MPS;
      if (this.runIstFortsetzung) {
        const luecke: number = t - this.lastRunStartMs;
        const strecke: number = dist - this.lastRunStartDist;
        if (luecke <= 0 || strecke < 0 || strecke / (luecke / 1000) > MAX_FOIL_MPS) {
          this.runIstFortsetzung = false;
        }
      }
      this.minSpeedSeitEnde = 99;
      if (this.runIstFortsetzung) {
        this.runStartMs = this.lastRunStartMs;
        this.runStartDist = this.lastRunStartDist;
        if (this.lastRunMaxMps > this.runMaxMps) {
          this.runMaxMps = this.lastRunMaxMps;
        }
        if (this.lastRunMaxHr > this.runMaxHr) {
          this.runMaxHr = this.lastRunMaxHr;
        }
        this.runsSumDurMs = Math.max(0, this.runsSumDurMs - this.lastRunDurMs);
        this.runsSumDistM = Math.max(0, this.runsSumDistM - this.lastRunDistM);
      } else {
        this.runStartMs = t - RUN_ENTER_DWELL * 1000;
        this.runStartDist = dist;
        this.runMaxMps = this.spdMaxClean;
        this.runMaxHr = this.hr > 0 ? this.hr : 0;
      }
      return;
    }
    if (this.spdMaxClean > this.runMaxMps) {
      this.runMaxMps = this.spdMaxClean;
    }
    if (this.hr > this.runMaxHr) {
      this.runMaxHr = this.hr;
    }
    this.exitStreak = (v3 < RUN_EXIT_MPS) ? this.exitStreak + 1 : 0;
    if (this.exitStreak < RUN_EXIT_DWELL) {
      return;
    }
    this.foiling = false;
    this.enterStreak = 0;
    const durMs: number = Math.max(0, t - RUN_EXIT_DWELL * 1000 - this.runStartMs);
    const distM: number = Math.max(0, dist - this.runStartDist);
    this.minSpeedSeitEnde = 99;
    this.runEndedMs = t;
    const schnell: boolean = durMs > 0 && (distM / (durMs / 1000)) >= MIN_RUN_AVG_MPS;
    if (!this.runIstFortsetzung && (durMs < MIN_RUN_MS || !schnell)) {
      this.runMaxHr = 0;
      this.runIstFortsetzung = false;
      return;
    }
    this.lastRunStartMs = this.runStartMs;
    this.lastRunStartDist = this.runStartDist;
    this.lastRunDurMs = durMs;
    this.lastRunDistM = distM;
    this.lastRunAvgMps = durMs > 0 ? distM / (durMs / 1000) : 0;
    this.lastRunMaxMps = this.runMaxMps;
    this.lastRunMaxHr = this.runMaxHr;
    this.runMaxHr = 0;
    this.runsSumDurMs += durMs;
    this.runsSumDistM += distM;
    if (!this.runIstFortsetzung) {
      this.runCount++;
    }
    this.runIstFortsetzung = false;
  }
}

function pad(n: number): string {
  return n < 10 ? '0' + n : '' + n;
}

function mmss(sec: number): string {
  return Math.floor(sec / 60) + ':' + pad(Math.floor(sec % 60));
}

function distVal(m: number): string {
  return m < 1000 ? String(Math.round(m)) : (m / 1000).toFixed(2);
}

function distUnit(m: number): string {
  return m < 1000 ? 'm' : 'km';
}

export function feldZahl(s: Stand, id: number, el: number): number | null {
  const lauf: boolean = s.runCount > 0;
  switch (id) {
    case 1: return s.sp3 * 3.6;
    case 5: return s.cur * 3.6;
    case 6: return el > 0 ? s.dist / el * 3.6 : 0;
    case 7: return s.max * 3.6;
    case 18: return lauf ? s.lastRunAvgMps * 3.6 : null;
    case 19: return lauf ? s.lastRunMaxMps * 3.6 : null;
    case 2: return s.hr > 0 ? s.hr : null;
    case 8: return s.hrN > 0 ? Math.round(s.hrSum / s.hrN) : null;
    case 9: return s.hrMax > 0 ? s.hrMax : null;
    case 21: return s.lastRunMaxHr > 0 ? s.lastRunMaxHr : null;
    default: return null;
  }
}

export type Texte = (k: string) => string;

export function feld(s: Stand, id: number, el: number, t: Texte, jetzt: Date): string[] {
  const runDurMs: number = s.foiling ? Math.max(0, el * 1000 - s.runStartMs) : s.lastRunDurMs;
  const runDistM: number = s.foiling ? Math.max(0, s.dist - s.runStartDist) : s.lastRunDistM;
  const lauf: boolean = s.runCount > 0;
  let z: number = 0;
  switch (id) {
    case 1: return [(s.sp3 * 3.6).toFixed(1), t('kmh3s')];
    case 5: return [(s.cur * 3.6).toFixed(1), 'km/h'];
    case 6: return [(el > 0 ? s.dist / el * 3.6 : 0).toFixed(1), t('kmhAvg')];
    case 7: return [(s.max * 3.6).toFixed(1), t('kmhMax')];
    case 2: return [s.hr > 0 ? '' + s.hr : '–', 'bpm'];
    case 8: return [s.hrN > 0 ? '' + Math.round(s.hrSum / s.hrN) : '–', t('bpmAvg')];
    case 9: return [s.hrMax > 0 ? '' + s.hrMax : '–', t('bpmMax')];
    case 3: return [mmss(el), t('time')];
    case 4: return [distVal(s.dist), distUnit(s.dist) + ' ' + t('dist')];
    case 12: return [pad(jetzt.getHours()) + ':' + pad(jetzt.getMinutes()), t('clock')];
    case 14: return [mmss(runDurMs / 1000), s.foiling ? t('runActive') : t('runTime')];
    case 15: return [distVal(runDistM), distUnit(runDistM) + ' ' + t('runDist')];
    case 16: return [lauf ? mmss(s.lastRunDurMs / 1000) : '–', t('lastRunTime')];
    case 17: return [lauf ? distVal(s.lastRunDistM) : '–', distUnit(s.lastRunDistM) + ' ' + t('lastRunDist')];
    case 18: return [lauf ? (s.lastRunAvgMps * 3.6).toFixed(1) : '–', t('lastRunAvg')];
    case 19: return [lauf ? (s.lastRunMaxMps * 3.6).toFixed(1) : '–', t('lastRunMax')];
    case 20: return ['' + s.runCount, t('runs')];
    case 21: return [s.lastRunMaxHr > 0 ? '' + s.lastRunMaxHr : '–', t('lastRunMaxHr')];
    case 22:
      z = s.runsSumDistM + (s.foiling ? Math.max(0, s.dist - s.runStartDist) : 0);
      return [lauf || s.foiling ? distVal(z) : '–', distUnit(z) + ' ' + t('allRunsDist')];
    case 23:
      z = s.runsSumDurMs + (s.foiling ? Math.max(0, el * 1000 - s.runStartMs) : 0);
      return [lauf || s.foiling ? mmss(z / 1000) : '–', t('allRunsTime')];
    default: return ['–', ''];
  }
}

/** Was das Handy aus /api/devices/config schickt (HuaweiBruecke.konfigFuerUhr). */
export interface KonfigDaten {
  views?: number[][];
  offFoilView?: number[];
  pauseView?: number[];
  pages?: Seite[];
  offFoilPages?: Seite[];
  pausePages?: Seite[];
  browseAll?: boolean;
  layoutsOn?: boolean;
  colorByValue?: boolean;
  hrZones?: number[];
  speedZones?: number[];
  stopMode?: string;
  autoStart?: boolean;
  waterLock?: string;
  foils?: Foil[];
  alarmEnabled?: boolean;
  alarmDefault?: string;
  speedLow?: number;
  speedHigh?: number;
  hrHigh?: number;
  alarmPatternHigh?: string;
  alarmPatternLow?: string;
  alarmPatternHr?: string;
  alarmRepeat?: string;
  alarmRepeatS?: number;
  runDistM?: number;
  runDistMode?: string;
  alarmPatternDist?: string;
  runTimeS?: number;
  runTimeMode?: string;
  alarmPatternTime?: string;
}

/** Ein Foil der Auswahl (Server devices.py _foil_alarm_list). */
export interface Foil {
  id: number;
  label: string;
  min: number;
  max: number;
}

function ganz(v: number | undefined): number {
  return v === undefined || v === null ? 0 : Math.trunc(v);
}

function gueltigeZonen(z: number[] | undefined): number[] | null {
  if (z === undefined || z === null || z.length !== 6) {
    return null;
  }
  for (let i = 0; i < 6; i++) {
    if (typeof z[i] !== 'number') {
      return null;
    }
  }
  return z;
}

export class Konfig {
  views: number[][] = [[1, 2, 0]];
  offFoilView: number[] = [12, 17, 16];
  pauseView: number[] = [12, 20, 2];
  pages: Seite[] = [];
  offFoilPages: Seite[] = [];
  pausePages: Seite[] = [];
  browseAll: boolean = true;
  layoutsOn: boolean = true;
  colorByValue: boolean = false;
  hrZones: number[] = [95, 114, 133, 152, 171, 190];
  speedZones: number[] = [8, 12, 16, 20, 24, 28];
  // Ablauf wie die anderen Uhren (Server devices.py), wie lauf.js
  stopMode: string = 'hold';
  autoStart: boolean = false;
  waterLock: string = 'auto';
  // Foils + Alarme (wie lauf.js)
  foils: Foil[] = [];
  alarmEnabled: boolean = false;
  alarmDefault: string = 'foil';
  speedLow: number = 0;
  speedHigh: number = 0;
  hrHigh: number = 0;
  patHigh: string = 'short2';
  patLow: string = 'long2';
  patHr: string = 'short1';
  repeat: string = 'once';
  repeatS: number = 5;
  runDistM: number = 0;
  runDistMode: string = 'once';
  patDist: string = 'short1';
  runTimeS: number = 0;
  runTimeMode: string = 'once';
  patTime: string = 'short2';
  layoutsServer: boolean | undefined = undefined;

  constructor(k: KonfigDaten | null) {
    if (k === null || k === undefined) {
      return;
    }
    if (k.views) {
      this.views = k.views;
    }
    if (k.offFoilView) {
      this.offFoilView = k.offFoilView;
    }
    if (k.pauseView) {
      this.pauseView = k.pauseView;
    }
    if (k.pages) {
      this.pages = k.pages;
    }
    if (k.offFoilPages) {
      this.offFoilPages = k.offFoilPages;
    }
    if (k.pausePages) {
      this.pausePages = k.pausePages;
    }
    this.browseAll = k.browseAll !== false;
    this.layoutsOn = k.layoutsOn !== false;
    this.colorByValue = k.colorByValue === true;
    const h: number[] | null = gueltigeZonen(k.hrZones);
    if (h !== null) {
      this.hrZones = h;
    }
    const g: number[] | null = gueltigeZonen(k.speedZones);
    if (g !== null) {
      this.speedZones = g;
    }
    this.stopMode = k.stopMode === 'press' ? 'press' : 'hold';
    this.autoStart = k.autoStart === true;   // fehlt -> aus (wie Zepp/Wear/Apple)
    this.waterLock = k.waterLock === 'on' || k.waterLock === 'off' ? k.waterLock : 'auto';
    this.foils = k.foils !== undefined && k.foils !== null && k.foils.length > 0 ? k.foils : [];
    this.alarmEnabled = k.alarmEnabled === true;
    this.alarmDefault = k.alarmDefault === 'fixed' ? 'fixed' : 'foil';
    this.speedLow = ganz(k.speedLow);
    this.speedHigh = ganz(k.speedHigh);
    this.hrHigh = ganz(k.hrHigh);
    this.patHigh = k.alarmPatternHigh ? k.alarmPatternHigh : 'short2';
    this.patLow = k.alarmPatternLow ? k.alarmPatternLow : 'long2';
    this.patHr = k.alarmPatternHr ? k.alarmPatternHr : 'short1';
    this.repeat = k.alarmRepeat === 'continuous' ? 'continuous' : 'once';
    this.repeatS = Math.max(2, ganz(k.alarmRepeatS) > 0 ? ganz(k.alarmRepeatS) : 5);
    this.runDistM = ganz(k.runDistM);
    this.runDistMode = k.runDistMode === 'every' ? 'every' : 'once';
    this.patDist = k.alarmPatternDist ? k.alarmPatternDist : 'short1';
    this.runTimeS = ganz(k.runTimeS);
    this.runTimeMode = k.runTimeMode === 'every' ? 'every' : 'once';
    this.patTime = k.alarmPatternTime ? k.alarmPatternTime : 'short2';
  }
}

/** Gespeicherte Wahl auf der Uhr (wie lauf.js Auswahl). */
export interface AuswahlDaten {
  gesetzt?: boolean;
  alarm?: boolean;
  quelle?: string;
  foilId?: number | null;
  layouts?: boolean | null;
  sperre?: boolean | null;
}

/** Wahl auf der Uhr (Einstellungsseite wie Zepp 4/4), einmal aus dem Profil vorbelegt (wie lauf.js Auswahl). */
export class Auswahl {
  gesetzt: boolean = false;
  alarm: boolean = false;
  quelle: string = 'foil';
  foilId: number | null = null;
  layouts: boolean | null = null;
  sperre: boolean | null = null;

  constructor(d: AuswahlDaten | null) {
    if (d === null || d === undefined) {
      return;
    }
    this.gesetzt = d.gesetzt === true;
    this.alarm = d.alarm === true;
    this.quelle = d.quelle === 'manual' ? 'manual' : 'foil';
    this.foilId = typeof d.foilId === 'number' ? d.foilId : null;
    this.layouts = typeof d.layouts === 'boolean' ? d.layouts : null;
    this.sperre = typeof d.sperre === 'boolean' ? d.sperre : null;
  }

  vorbelegen(k: Konfig): void {
    let da: boolean = false;
    for (let i = 0; i < k.foils.length; i++) {
      if (k.foils[i].id === this.foilId) {
        da = true;
      }
    }
    if (!da) {
      this.foilId = k.foils.length > 0 ? k.foils[0].id : null;
    }
    if (this.gesetzt) {
      return;
    }
    this.gesetzt = true;
    this.alarm = k.alarmEnabled;
    this.quelle = k.alarmDefault === 'foil' && k.foils.length > 0 ? 'foil' : 'manual';
  }

  foil(k: Konfig): Foil | null {
    for (let i = 0; i < k.foils.length; i++) {
      if (k.foils[i].id === this.foilId) {
        return k.foils[i];
      }
    }
    return null;
  }

  naechstesFoil(k: Konfig): void {
    const n: number = k.foils.length;
    if (n === 0) {
      this.foilId = null;
      return;
    }
    let i: number = 0;
    for (; i < n; i++) {
      if (k.foils[i].id === this.foilId) {
        break;
      }
    }
    this.foilId = k.foils[(i + 1) % n].id;
  }

  daten(): AuswahlDaten {
    return { gesetzt: this.gesetzt, alarm: this.alarm, quelle: this.quelle, foilId: this.foilId,
      layouts: this.layouts, sperre: this.sperre };
  }
}

/** Auto -> An -> Aus -> Auto. */
export function dreistufig(v: boolean | null): boolean | null {
  return v === null ? true : (v === true ? false : null);
}

/** Vibrationsalarm wie Zepp/lauf.js Alarm: liefert die Muster, die jetzt vibrieren sollen. */
export class Alarm {
  private aktiv: boolean = false;
  private hrAktiv: boolean = false;
  private letzt: number = 0;
  private lauf: number = -1;
  private distN: number = 0;
  private zeitN: number = 0;

  pruefe(k: Konfig, a: Auswahl, kmh: number, hr: number, s: Stand, el: number, jetzt: number): string[] {
    const aus: string[] = [];
    if (!a.alarm) {
      return aus;
    }
    let lo: number = k.speedLow;
    let hi: number = k.speedHigh;
    const f: Foil | null = a.quelle === 'foil' ? a.foil(k) : null;
    if (f !== null) {
      lo = f.min;
      hi = f.max;
    }
    const ueber: boolean = hi > 0 && kmh > hi;
    const unter: boolean = lo > 0 && kmh < lo && kmh >= lo - 2;
    const wieder: boolean = k.repeat === 'continuous' && jetzt - this.letzt >= k.repeatS * 1000;
    if (ueber || unter) {
      if (!this.aktiv || wieder) {
        this.aktiv = true;
        this.letzt = jetzt;
        aus.push(ueber ? k.patHigh : k.patLow);
      }
    } else {
      this.aktiv = false;
    }
    if (k.hrHigh > 0 && hr > k.hrHigh) {
      if (!this.hrAktiv || wieder) {
        this.hrAktiv = true;
        this.letzt = jetzt;
        aus.push(k.patHr);
      }
    } else {
      this.hrAktiv = false;
    }
    if (!s.foiling) {
      return aus;
    }
    if (s.runStartMs !== this.lauf) {
      this.lauf = s.runStartMs;
      this.distN = 0;
      this.zeitN = 0;
    }
    if (k.runDistM > 0 && (this.distN === 0 || k.runDistMode === 'every') &&
      s.dist - s.runStartDist >= (this.distN + 1) * k.runDistM) {
      this.distN++;
      aus.push(k.patDist);
    }
    if (k.runTimeS > 0 && (this.zeitN === 0 || k.runTimeMode === 'every') &&
      (el * 1000 - s.runStartMs) / 1000 >= (this.zeitN + 1) * k.runTimeS) {
      this.zeitN++;
      aus.push(k.patTime);
    }
    return aus;
  }
}

function klassisch(f: number[]): Seite {
  const a: number = f.length > 0 ? Math.trunc(f[0]) : 0;
  const b: number = f.length > 1 ? Math.trunc(f[1]) : 0;
  const c: number = f.length > 2 ? Math.trunc(f[2]) : 0;
  return [0, a, b, c];
}

function satz(k: Konfig, z: string): Seite[] {
  if (z === 'p') {
    return k.layoutsOn && k.pausePages.length > 0 ? k.pausePages : [klassisch(k.pauseView)];
  }
  if (z === 'on') {
    if (k.layoutsOn && k.pages.length > 0) {
      return k.pages;
    }
    const out: Seite[] = k.views.map((v: number[]): Seite => klassisch(v));
    return out.length > 0 ? out : [[0, 1, 0, 0]];
  }
  return k.layoutsOn && k.offFoilPages.length > 0 ? k.offFoilPages : [klassisch(k.offFoilView)];
}

/** z = 'p' | 'on' | 'off'. */
export function ring(k: Konfig, z: string): Seite[] {
  let out: Seite[] = satz(k, z);
  if (z === 'off' && k.browseAll) {
    out = out.concat(satz(k, 'on'));
  }
  if (z === 'p' && k.browseAll) {
    out = out.concat(satz(k, 'on'), satz(k, 'off'));
  }
  return out.length > 0 ? out : [[0, 1, 0, 0]];
}

const PALETTE: string[] = ['#ffffff', '#d0d0d0', '#808080', '#000000', '#ff0000', '#ff5500', '#ffaa00', '#ffff00',
  '#00ff00', '#00aa00', '#00ffff', '#22d3ee', '#0055ff', '#aa00ff', '#ff00aa'];
const ZONEN: string[] = ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444'];
const AUTO_WERT: string = '#ffffff';
const AUTO_LABEL: string = '#d0d0d0';
const AUTO_LINIE: string = '#808080';
const CYAN: string = '#22d3ee';
const TINTE_280: number[] = [29, 46, 50, 61, 64, 82, 99, 146, 166];

function farbe(i: number, ersatz: string): string {
  return i >= 1 && i <= PALETTE.length ? PALETTE[i - 1] : ersatz;
}

export function groesse(stufe: number, dw: number): number {
  const i: number = Math.max(0, Math.min(TINTE_280.length - 1, Math.trunc(stufe)));
  return Math.max(7, Math.round(dw * TINTE_280[i] / 1.973 / 280));
}

function zone(v: number, g: number[]): number {
  let z: number = 0;
  for (let i = 1; i < 5; i++) {
    if (v >= g[i]) {
      z = i;
    }
  }
  return z;
}

function istPuls(fid: number): boolean {
  return fid === 2 || fid === 8 || fid === 9 || fid === 21;
}

function wertFarbe(k: Konfig, fid: number, v: number | null): string | null {
  if (v === null) {
    return null;
  }
  if (istPuls(fid)) {
    return v > 0 ? ZONEN[zone(v, k.hrZones)] : null;
  }
  if (fid === 1 || fid === 5 || fid === 6 || fid === 7 || fid === 18 || fid === 19) {
    return ZONEN[zone(v, k.speedZones)];
  }
  return null;
}

function fuellgrad(k: Konfig, fid: number, v: number | null): number {
  const g: number[] = istPuls(fid) ? k.hrZones : k.speedZones;
  if (v === null || !(g[5] > g[0])) {
    return 0;
  }
  return Math.max(0, Math.min(1, (v - g[0]) / (g[5] - g[0])));
}

function mische(c: string, bg: string, f: number): string {
  let out: string = '#';
  for (let i = 0; i < 3; i++) {
    const x: number = Math.round(parseInt(c.substr(1 + 2 * i, 2), 16) * f + parseInt(bg.substr(1 + 2 * i, 2), 16) * (1 - f));
    out += (x < 16 ? '0' : '') + x.toString(16);
  }
  return out;
}

/** Zeichenbefehl (Bedeutung der Felder: seiten.js Kopf). Felder je Art wie dort, gleiche Reihenfolge. */
export interface Befehl {
  k: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  c?: string;
  s?: number;
  a?: string;
  txt?: string;
  b?: boolean;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  cx?: number;
  cy?: number;
  r?: number;
  a0?: number;
  a1?: number;
}

export interface ZeichenKontext {
  dw: number;
  dh: number;
  s: Stand;
  el: number;
  t: Texte;
  jetzt: Date;
  k: Konfig;
  idx: number;
  anzahl: number;
  pausiert: boolean;
  rund?: boolean;   // false = eckige Uhr: Rand-Grafik als Rahmensegment (wie seiten.js)
}

function rechteck(x: number, y: number, w: number, h: number, c: string): Befehl {
  const b: Befehl = { k: 'r', x: x, y: y, w: w, h: h, c: c };
  return b;
}

function text(x: number, y: number, s: number, c: string, a: string, txt: string, fett: boolean): Befehl {
  const b: Befehl = { k: 't', x: x, y: y, s: s, c: c, a: a, txt: txt, b: fett };
  return b;
}

export function zeichne(e: Seite, c: ZeichenKontext): Befehl[] {
  return e.length > 0 && e[0] === 1 ? layout(e, c) : klassik(e.length > 0 ? e : [0, 1, 0, 0], c);
}

function klassik(e: Seite, c: ZeichenKontext): Befehl[] {
  const dw: number = c.dw;
  const dh: number = c.dh;
  const out: Befehl[] = [rechteck(0, 0, dw, dh, '#000000')];
  let ids: number[] = [];
  for (let i = 1; i < 4; i++) {
    if (zahl(e[i]) > 0) {
      ids.push(zahl(e[i]));
    }
  }
  if (ids.length === 0) {
    ids = [1];
  }
  const zeile: number = dh * 0.78 / ids.length;
  const y0: number = dh * 0.12;
  for (let i = 0; i < ids.length; i++) {
    const f: string[] = feld(c.s, ids[i], c.el, c.t, c.jetzt);
    const y: number = y0 + zeile * i;
    let col: string = AUTO_WERT;
    if (c.k.colorByValue) {
      const w: string | null = wertFarbe(c.k, ids[i], feldZahl(c.s, ids[i], c.el));
      if (w !== null) {
        col = w;
      }
    }
    out.push(text(dw / 2, Math.round(y + zeile * 0.42), groesse(ids.length === 1 ? 8 : 6, dw), col, 'c', f[0], true));
    out.push(text(dw / 2, Math.round(y + zeile * 0.82), groesse(1, dw), AUTO_LABEL, 'c', f[1], false));
  }
  if (c.pausiert) {
    out.push(text(dw / 2, Math.round(dh * 0.07), groesse(2, dw), CYAN, 'c', c.t('paused'), true));
  }
  punkte(out, dw / 2, dh * 0.94, 0, c, AUTO_LABEL, '#000000');
  return out;
}

function punkte(out: Befehl[], ax: number, ay: number, fl: number, c: ZeichenKontext, col: string, bg: string): void {
  const n: number = Math.max(1, Math.min(12, Math.trunc(c.anzahl)));
  if (n <= 1) {
    return;
  }
  const d: number = Math.max(3, Math.round(c.dw * 0.022));
  const stp: number = d * 2;
  const total: number = (n - 1) * stp;
  const x0: number = (fl & 1) ? ax + d / 2 : (fl & 2) ? ax - total - d / 2 : ax - total / 2;
  for (let i = 0; i < n; i++) {
    out.push(rechteck(Math.round(x0 + i * stp - d / 2), Math.round(ay - d / 2), d, d,
      i === c.idx ? col : mische(col, bg, 0.35)));
  }
}

function layout(e: Seite, c: ZeichenKontext): Befehl[] {
  const dw: number = c.dw;
  const dh: number = c.dh;
  const els: Element[] = e.length > 2 && Array.isArray(e[2]) ? e[2] as Element[] : [];
  const bg: string = farbe(zahl(e[1]), '#000000');
  const out: Befehl[] = [rechteck(0, 0, dw, dh, bg)];
  const vorne: Befehl[] = [];
  let hatPause: boolean = false;
  for (let i = 0; i < els.length; i++) {
    const x: Element = els[i];
    if (!x || x.length < 6) {
      continue;
    }
    const typ: number = zahl(x[0]);
    const ax: number = Math.round(dw * zahl(x[1]) / 1000);
    const ay: number = Math.round(dh * zahl(x[2]) / 1000);
    const st: number = zahl(x[3]);
    const ci: number = zahl(x[4]);
    const fl: number = zahl(x[5]);
    const fid: number = x.length > 6 ? zahl(x[6]) : 0;
    const a: string = (fl & 1) ? 'l' : ((fl & 2) ? 'r' : 'c');
    if (typ === 4) {
      const l: Befehl = {
        k: 'l', x1: ax, y1: ay,
        x2: Math.round(dw * (x.length > 6 ? zahl(x[6]) : zahl(x[1])) / 1000),
        y2: Math.round(dh * (x.length > 7 ? zahl(x[7]) : zahl(x[2])) / 1000),
        w: st < 1 ? 1 : st, c: farbe(ci, AUTO_LINIE)
      };
      out.push(l);
    } else if (typ === 8 || typ === 9) {
      grafik(out, x, typ, ax, ay, st, ci, fl, fid, c);
    } else if (typ === 5) {
      if (c.pausiert) {
        continue;
      }
      const d: number = Math.max(4, Math.round(dw * 0.03));
      const fs: number = Math.max(7, Math.round(dw * 0.055));
      const gap: number = Math.round(d / 2);
      const tw: number = Math.round(fs * 0.62 * 3);
      const tot: number = d + gap + tw;
      const lx: number = a === 'l' ? ax : (a === 'r' ? ax - tot : ax - Math.round(tot / 2));
      const rc: string = farbe(ci, '#ff0000');
      vorne.push(rechteck(lx, ay - Math.round(d / 2), d, d, rc));
      vorne.push(text(lx + d + gap, ay, fs, rc, 'l', 'REC', false));
    } else if (typ === 6) {
      punkte(vorne, ax, ay, fl, c, farbe(ci, AUTO_LABEL), bg);
    } else if (typ === 7) {
      hatPause = true;
      if (c.pausiert) {
        vorne.push(text(ax, ay, groesse(st, dw), farbe(ci, CYAN), a, c.t('paused'), true));
      }
    } else if (typ === 1 || typ === 2 || typ === 3) {
      let txt: string = '';
      if (typ === 1) {
        txt = feld(c.s, fid, c.el, c.t, c.jetzt)[0];
      } else if (typ === 2) {
        txt = feld(c.s, fid, c.el, c.t, c.jetzt)[1];
      } else if (x.length > 6 && x[6] !== null && x[6] !== undefined) {
        txt = '' + x[6];
      }
      if (txt === '') {
        continue;
      }
      let col: string = farbe(ci, typ === 1 ? AUTO_WERT : AUTO_LABEL);
      if (typ === 1 && (fl & 4)) {
        const w: string | null = wertFarbe(c.k, fid, feldZahl(c.s, fid, c.el));
        if (w !== null) {
          col = w;
        }
      }
      vorne.push(text(ax, ay, groesse(st, dw), col, a, txt, typ === 1));
    }
  }
  if (c.pausiert && !hatPause) {
    vorne.push(text(Math.round(dw / 2), Math.round(dh * 0.07), groesse(2, dw), CYAN, 'c', c.t('paused'), true));
  }
  return out.concat(vorne);
}

/** Rand-Grafik auf eckigen Uhren, Rahmen ab oberer Mitte im Uhrzeigersinn (wie seiten.js rahmen). */
function rahmen(out: Befehl[], dw: number, dh: number, th: number, start: number, laenge: number, col: string): void {
  const e: number = th / 2 + 1;
  const bw: number = dw - 2 * e;
  const bh: number = dh - 2 * e;
  const u: number = 2 * (bw + bh);
  const len: number[] = [bw / 2, bh, bw, bh, bw / 2];
  const d0: number = ((start % 1000) + 1000) % 1000 / 1000 * u;
  const d1: number = d0 + Math.max(0, Math.min(1000, laenge)) / 1000 * u;
  for (let runde = 0; runde < 2; runde++) {
    let pos: number = runde * u;
    for (let i = 0; i < 5; i++) {
      const a: number = Math.max(d0, pos) - pos;
      const b: number = Math.min(d1, pos + len[i]) - pos;
      const l: number = Math.max(1, b - a);
      const h: number = th / 2;
      if (b > a) {
        const q: number[] = i === 0 ? [e + bw / 2 + a, e - h, l, th] : i === 1 ? [dw - e - h, e + a, th, l]
          : i === 2 ? [dw - e - b, dh - e - h, l, th] : i === 3 ? [e - h, dh - e - b, th, l] : [e + a, e - h, l, th];
        out.push(rechteck(Math.round(q[0]), Math.round(q[1]), Math.round(q[2]), Math.round(q[3]), col));
      }
      pos += len[i];
    }
  }
}

function grafik(out: Befehl[], x: Element, typ: number, ax: number, ay: number, st: number, ci: number,
  fl: number, fid: number, c: ZeichenKontext): void {
  const dw: number = c.dw;
  const dh: number = c.dh;
  const th: number = Math.max(2, Math.round(dw * 0.018 * Math.max(1, Math.min(4, st))));
  const v: number | null = feldZahl(c.s, fid, c.el);
  const f: number = fuellgrad(c.k, fid, v);
  const grund: string = (fl & 1) && v !== null ? ZONEN[zone(v, istPuls(fid) ? c.k.hrZones : c.k.speedZones)] : farbe(ci, CYAN);
  const leer: string = mische(grund, '#000000', 0.3);
  if (typ === 8 && c.rund === false) {   // eckige Uhr: Rahmensegment (wie seiten.js rahmen)
    const lg: number = Math.max(0, Math.min(1000, zahl(x[2])));
    rahmen(out, dw, dh, th, zahl(x[1]), lg, leer);
    if (f > 0) {
      rahmen(out, dw, dh, th, zahl(x[1]), lg * f, grund);
    }
  } else if (typ === 8) {
    const laenge: number = Math.max(0, Math.min(1000, zahl(x[2])));
    const r: number = Math.min(dw, dh) / 2 - th / 2 - 1;
    const a0: number = -90 + (zahl(x[1]) % 1000) * 0.36;
    const spur: Befehl = { k: 'a', cx: dw / 2, cy: dh / 2, r: r, w: th, a0: a0, a1: a0 + laenge * 0.36, c: leer };
    out.push(spur);
    if (f > 0) {
      const voll: Befehl = { k: 'a', cx: dw / 2, cy: dh / 2, r: r, w: th, a0: a0, a1: a0 + laenge * 0.36 * f, c: grund };
      out.push(voll);
    }
  } else {
    const bw: number = Math.round(dw * Math.max(50, Math.min(1000, x.length > 7 ? zahl(x[7]) : 400)) / 1000);
    const bx: number = ax - Math.round(bw / 2);
    const by: number = ay - Math.round(th / 2);
    out.push(rechteck(bx, by, bw, th, leer));
    if (f > 0) {
      out.push(rechteck(bx, by, Math.max(th, Math.round(bw * f)), th, grund));
    }
  }
}
