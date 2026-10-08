/*
 * Geraete-Schicht des Huawei-Recorders fuer ArkTS-Uhren (Watch 5, HarmonyOS 5+). Gegenstueck
 * zu common/recorder.js (Lite + JS-FA): gleicher Ablauf, gleiche Dateien, gleiche Uebertragung —
 * nur die Geraete-APIs sind die von HarmonyOS (Kits statt @system-Module).
 *
 * Uebersetzt auf der VM mit den HarmonyOS Command Line Tools (SDK API 24, hvigor) — NOCH NIE
 * AUF EINER UHR GELAUFEN. UNGEPRUEFT: ob die Continuous Task (Modus location) bei dunklem Display
 * auch den Accel weiterlaufen laesst; das Ergebnis geht als messweg.bg im /complete mit.
 *
 * Was die ArkTS-Uhr mehr kann als Lite: GPS liefert Tempo (geht als `speed` mit), es gibt eine
 * Hintergrund-Aufgabe, und Dateien gehen synchron (fileIo).
 */
import { common, wantAgent, WantAgent } from '@kit.AbilityKit';
import { sensor, vibrator } from '@kit.SensorServiceKit';
import { geoLocationManager } from '@kit.LocationKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { window } from '@kit.ArkUI';
import { backgroundTaskManager } from '@kit.BackgroundTasksKit';
import { deviceInfo, BusinessError } from '@kit.BasicServicesKit';
import { wearEngine } from '@kit.WearEngine';
import { util } from '@kit.ArkTS';
import * as K from './Kern';
import { GEGENSTELLEN, APP_VERSION } from './Konfig';
import { Stand, Konfig, KonfigDaten } from './Seiten';

/** Seiten-Konfiguration halbstuendlich neu anfragen (Antwort des Handys auf das Hallo). */
const HALLO_ALLE_MS: number = 30 * 60 * 1000;

const ACCEL_NS: number = 20000000;   // 20 ms = 50 Hz

interface Diagnose {
  speicher: number;
  accel: number;
  gps: number;
  puls: number;
}

interface Lauf {
  id: string;
  n: number;
  start: number;
  zuletzt: number;
  pausen: number[][];
  hr: number;
}

interface GegenDatei {
  i: number;
}

interface Messweg {
  gps: string;
  accel: string;
  bg: string;
}

interface Meta {
  session_uuid: string;
  started_at: string;
  sport: string;
  gps_hz: number;
  accel_hz: number;
  accel_scale: number;
  device_model: string;
  app_version: string;
}

interface Ende {
  ended_at: string;
  total_chunks: number;
  hr_samples: number;
  hr_source: string;
  messweg: Messweg;
  pauses?: number[][];
}

export interface Zustand {
  modus: string;
  ms: number;
  kmh: number;
  m: number;
  puls: number;
  gpsOk: boolean;
  offen: number;
  plan: K.PlanStand;
  sendeFehler: number;
  sendeCode: number;
  fehler: number;
  letzterFehler: string;
  verworfen: number;
}

interface OffeneDatei {
  d: K.Datei;
  pfad: string;
  teile: string[];
  nr: number;
  hallo: boolean;
}

interface Hallo {
  device_model: string;
  app_version: string;
}

/** Was die Datenseiten zum Zeichnen brauchen (Index.ets). */
/** Zusammenfassung nach dem Stopp (wie Zepp: Dauer, Strecke + Schnitt, Laeufe). */
export interface Letzte {
  ms: number;
  m: number;
  kmh: number;
  laeufe: number;
}

export interface SeitenDaten {
  s: Stand;
  k: Konfig;
  el: number;
  pausiert: boolean;
  zustand: string;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export class Recorder {
  private static inst: Recorder | null = null;

  static get(): Recorder {
    if (Recorder.inst === null) {
      Recorder.inst = new Recorder();
    }
    return Recorder.inst;
  }

  modus: string = 'bereit';   // bereit | laeuft | pause
  private ctx: common.UIAbilityContext | null = null;
  private dir: string = '';
  private id: string = '';
  private achse: K.Zeitachse = new K.Zeitachse(0);
  private sammler: K.Sammler = new K.Sammler();
  private anzeige: K.Anzeige = new K.Anzeige();
  private plan: K.Sendeplan = new K.Sendeplan();
  private gegen: K.Gegenstelle = new K.Gegenstelle(GEGENSTELLEN, 0);
  private schlange: K.Warteschlange = new K.Warteschlange();
  private startWand: number = 0;
  private modell: string = 'HUAWEI';
  private f: Diagnose = { speicher: 0, accel: 0, gps: 0, puls: 0 };
  private letzterFehler: string = '';
  private gpsLetzt: number = 0;
  private bg: string = 'aus';
  private offenDatei: OffeneDatei | null = null;
  private takt: number = -1;
  private wache: number = -1;
  // Datenseiten (Seiten.ets): Lauf-Stand, Konfiguration vom Handy, frischer GPS-Punkt [lat, lon, m/s]
  private stand: Stand = new Stand();
  private konfig: Konfig = new Konfig(null);
  private fixNeu: number[] | null = null;
  private kTeile: string[] | null = null;
  private halloOffen: boolean = false;
  private halloZuletzt: number = 0;
  private empfangAn: boolean = false;
  letzte: Letzte | null = null;
  private verworfen: number = 0;
  private auto: K.AutoStart | null = null;
  private autoLos: boolean = false;
  private leerGpsAn: boolean = false;

  // --- Dateien --------------------------------------------------------------------------

  private pfad(name: string): string {
    return this.dir + '/' + name;
  }

  private fehler(art: string, text: string): void {
    if (art === 'speicher') {
      this.f.speicher++;
    } else if (art === 'accel') {
      this.f.accel++;
    } else if (art === 'gps') {
      this.f.gps++;
    } else {
      this.f.puls++;
    }
    this.letzterFehler = text;
    console.error('Pumpfoil ' + text);
  }

  /** Atomar: erst in eine Zwischendatei, dann umbenennen — ein Absturz hinterlaesst keine halbe Datei. */
  private schreibe(name: string, text: string): boolean {
    const ziel: string = this.pfad(name);
    const tmp: string = ziel + '.tmp';
    try {
      const datei: fs.File = fs.openSync(tmp, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY | fs.OpenMode.TRUNC);
      fs.writeSync(datei.fd, text);
      fs.closeSync(datei);
      fs.renameSync(tmp, ziel);
      return true;
    } catch (e) {
      const err: BusinessError = e as BusinessError;
      this.fehler('speicher', 'Speicher ' + err.code + ' ' + name);
      return false;
    }
  }

  private lies(name: string): string | null {
    try {
      return fs.readTextSync(this.pfad(name));
    } catch (e) {
      return null;
    }
  }

  private loesche(name: string): void {
    try {
      fs.unlinkSync(this.pfad(name));
    } catch (e) {
      // war nicht da
    }
  }

  private planSichern(): void {
    this.schreibe('plan.json', JSON.stringify(this.plan.daten()));
  }

  private laufSichern(): void {
    if (this.modus === 'bereit') {
      return;
    }
    const l: Lauf = {
      id: this.id, n: this.sammler.index, start: this.startWand, zuletzt: Date.now(),
      pausen: this.achse.pausen, hr: this.sammler.hrAnzahl
    };
    this.schreibe('laufend.json', JSON.stringify(l));
  }

  // Jeder vergebene Index zaehlt im Plan — auch wenn das Schreiben scheitert, sonst wartete der
  // Plan ewig auf eine Datei, die nie kommt (eine fehlende Datei ueberspringt `senden`, gezaehlt).
  private chunkSchreiben(c: K.Chunk): void {
    this.schreibe(K.dateiChunk(this.id, c.index), JSON.stringify(c));
    this.plan.chunk(this.id);
    this.planSichern();
  }

  // --- Sensoren ---------------------------------------------------------------------------

  private sensorenAn(): void {
    try {
      sensor.on(sensor.SensorId.ACCELEROMETER, (r: sensor.AccelerometerResponse) => {
        const c: K.AccelChunk | null = this.sammler.accelWert(r.x, r.y, r.z, this.achse.jetzt(Date.now()));
        if (c !== null) {
          this.chunkSchreiben(c);
          this.laufSichern();
        }
      }, { interval: ACCEL_NS });
    } catch (e) {
      this.fehler('accel', 'Accel ' + (e as BusinessError).code);
    }
    try {
      sensor.on(sensor.SensorId.HEART_RATE, (r: sensor.HeartRateResponse) => {
        this.sammler.puls(r.heartRate);
      });
    } catch (e) {
      this.fehler('puls', 'Puls ' + (e as BusinessError).code);
    }
    try {
      const anfrage: geoLocationManager.LocationRequest = {
        priority: geoLocationManager.LocationRequestPriority.ACCURACY,
        scenario: geoLocationManager.LocationRequestScenario.UNSET,
        timeInterval: 1,
        distanceInterval: 0,
        maxAccuracy: 0
      };
      geoLocationManager.on('locationChange', anfrage, this.gpsRueckruf);
    } catch (e) {
      this.fehler('gps', 'GPS ' + (e as BusinessError).code);
    }
  }

  private gpsRueckruf = (g: geoLocationManager.Location): void => {
    const jetzt: number = Date.now();
    let t: number = this.achse.auf(g.timeStamp, jetzt);
    if (t < 0) {
      t = this.achse.jetzt(jetzt);
    }
    this.gpsLetzt = jetzt;
    const v: number = g.speed >= 0 ? g.speed : -1;
    this.fixNeu = [g.latitude, g.longitude, v];
    this.anzeige.fix(g.latitude, g.longitude, g.accuracy, t, v);
    const c: K.GpsChunk | null = this.sammler.gpsFix(g.latitude, g.longitude, g.accuracy, t, v);
    if (c !== null) {
      this.chunkSchreiben(c);
    }
  }

  private sensorenAus(): void {
    try {
      sensor.off(sensor.SensorId.ACCELEROMETER);
    } catch (e) {
      // war nicht an
    }
    try {
      sensor.off(sensor.SensorId.HEART_RATE);
    } catch (e) {
      // war nicht an
    }
    try {
      geoLocationManager.off('locationChange', this.gpsRueckruf);
    } catch (e) {
      // war nicht an
    }
  }

  private bildschirmAn(an: boolean): void {
    if (this.ctx === null) {
      return;
    }
    window.getLastWindow(this.ctx).then((w: window.Window) => {
      w.setWindowKeepScreenOn(an);
    }).catch((e: BusinessError) => {
      this.fehler('speicher', 'Display ' + e.code);
    });
  }

  /**
   * Hintergrund-Aufgabe (Modus location), damit die Aufnahme bei dunklem Display weiterlaeuft.
   * Das Ergebnis geht als messweg.bg mit — „ok", „fehler <code>" oder „aus" (nie gestartet).
   */
  private hintergrundAn(): void {
    if (this.ctx === null) {
      return;
    }
    const ctx: common.UIAbilityContext = this.ctx;
    const info: wantAgent.WantAgentInfo = {
      wants: [{ bundleName: ctx.abilityInfo.bundleName, abilityName: ctx.abilityInfo.name }],
      actionType: wantAgent.OperationType.START_ABILITY,
      requestCode: 0,
      actionFlags: [wantAgent.WantAgentFlags.UPDATE_PRESENT_FLAG]
    };
    wantAgent.getWantAgent(info).then((agent: WantAgent) => {
      return backgroundTaskManager.startBackgroundRunning(ctx, backgroundTaskManager.BackgroundMode.LOCATION, agent);
    }).then(() => {
      this.bg = 'ok';
    }).catch((e: BusinessError) => {
      this.bg = 'fehler ' + e.code;
      this.fehler('speicher', 'Hintergrund ' + e.code);
    });
  }

  private hintergrundAus(): void {
    if (this.ctx === null || this.bg !== 'ok') {
      return;
    }
    backgroundTaskManager.stopBackgroundRunning(this.ctx).catch((e: BusinessError) => {
      console.error('Pumpfoil Hintergrund-Ende ' + e.code);
    });
  }

  private kurzVibrieren(): void {
    try {
      vibrator.startVibration({ type: 'time', duration: 60 }, { id: 0, usage: 'touch' });
    } catch (e) {
      // ohne Vibration geht es auch
    }
  }

  private restSchreiben(): void {
    const r: K.Chunk[] = this.sammler.rest();
    for (let i = 0; i < r.length; i++) {
      this.chunkSchreiben(r[i]);
    }
  }

  // --- Aufnahme ---------------------------------------------------------------------------

  start(): void {
    if (this.modus !== 'bereit') {
      return;
    }
    const jetzt: number = Date.now();
    this.id = K.neueId(jetzt, Math.random());
    this.startWand = jetzt;
    this.achse = new K.Zeitachse(jetzt);
    this.sammler = new K.Sammler();
    this.anzeige = new K.Anzeige();
    this.f = { speicher: 0, accel: 0, gps: 0, puls: 0 };
    this.letzterFehler = '';
    this.verworfen = 0;
    this.bg = 'aus';
    this.stand = new Stand();
    this.fixNeu = null;
    this.plan.neu(this.id);
    const meta: Meta = {
      session_uuid: this.id, started_at: iso(jetzt), sport: 'pumpfoil',
      gps_hz: 1, accel_hz: 50, accel_scale: K.ACCEL_SCALE,
      device_model: this.modell, app_version: APP_VERSION
    };
    this.schreibe(K.dateiMeta(this.id), JSON.stringify(meta));
    this.planSichern();
    this.modus = 'laeuft';
    this.laufSichern();
    this.kurzVibrieren();
    this.bildschirmAn(true);
    this.hintergrundAn();
    this.sensorenAn();
  }

  pause(): void {
    if (this.modus !== 'laeuft') {
      return;
    }
    this.sensorenAus();
    this.restSchreiben();
    this.achse.pause(Date.now());
    this.modus = 'pause';
    this.kurzVibrieren();
    this.laufSichern();
  }

  weiter(): void {
    if (this.modus !== 'pause') {
      return;
    }
    this.achse.weiter(Date.now());
    this.modus = 'laeuft';
    this.kurzVibrieren();
    this.laufSichern();
    this.sensorenAn();
  }

  private abschliessen(id: string, n: number, endeWand: number, pausen: number[][], hr: number,
    accel: string): void {
    const e: Ende = {
      ended_at: iso(endeWand), total_chunks: n, hr_samples: hr,
      hr_source: hr > 0 ? 'active' : 'none',
      messweg: { gps: 'arkts', accel: accel, bg: this.bg }
    };
    if (pausen.length > 0) {
      e.pauses = pausen;
    }
    if (this.schreibe(K.dateiEnde(id), JSON.stringify(e))) {
      this.plan.ende(id);
      this.planSichern();
      this.loesche('laufend.json');
    }
  }

  stopp(): void {
    if (this.modus === 'bereit') {
      return;
    }
    const jetzt: number = Date.now();
    if (this.modus === 'laeuft') {
      this.sensorenAus();
      this.restSchreiben();
    } else {
      this.achse.weiter(jetzt);   // Stopp aus der Pause: die Pause endet hier
    }
    const aktiv: number = this.achse.jetzt(jetzt);
    this.letzte = { ms: aktiv, m: this.anzeige.strecke, laeufe: this.stand.runCount,
      kmh: aktiv > 0 ? this.anzeige.strecke / (aktiv / 1000) * 3.6 : 0 };
    this.modus = 'bereit';
    this.kurzVibrieren();
    this.bildschirmAn(false);
    this.hintergrundAus();
    this.abschliessen(this.id, this.sammler.index, jetzt, this.achse.pausen, this.sammler.hrAnzahl, 'arkts');
  }

  /**
   * Aufnahme VERWERFEN (wie Zepp/Wear/Apple und Lite R.verwerfen): Sensoren aus, nichts mehr senden,
   * ungesendete Dateien loeschen, kein Ende. Was schon beim Handy ist, bleibt dort unvollstaendig.
   */
  verwerfen(): void {
    if (this.modus === 'bereit') {
      return;
    }
    if (this.modus === 'laeuft') {
      this.sensorenAus();
    }
    this.modus = 'bereit';
    this.kurzVibrieren();
    this.bildschirmAn(false);
    this.hintergrundAus();
    if (this.offenDatei !== null && !this.offenDatei.hallo && this.offenDatei.d.id === this.id) {
      this.offenDatei = null;
    }
    const weg: string[] = this.plan.weg(this.id);
    for (let i = 0; i < weg.length; i++) {
      this.loesche(weg[i]);
    }
    this.planSichern();
    this.loesche('laufend.json');
    this.verworfen = Date.now();
  }

  /** Einmal je Sekunde im Bereit-Zustand: Auto-Start wie Zepp; GPS laeuft dafuer nur, wenn das Profil es will. */
  leerlauf(): boolean {
    if (this.modus !== 'bereit') {
      return false;
    }
    if (!this.konfig.autoStart) {
      if (this.leerGpsAn) {
        try {
          geoLocationManager.off('locationChange', this.leerGps);
        } catch (e) {
          // war nicht an
        }
        this.leerGpsAn = false;
      }
      return false;
    }
    if (!this.leerGpsAn) {
      this.leerGpsAn = true;
      this.auto = new K.AutoStart();
      try {
        const anfrage: geoLocationManager.LocationRequest = {
          priority: geoLocationManager.LocationRequestPriority.ACCURACY,
          scenario: geoLocationManager.LocationRequestScenario.UNSET,
          timeInterval: 1, distanceInterval: 0, maxAccuracy: 0
        };
        geoLocationManager.on('locationChange', anfrage, this.leerGps);
      } catch (e) {
        this.fehler('gps', 'GPS Auto-Start ' + (e as BusinessError).code);
      }
    }
    if (!this.autoLos) {
      return false;
    }
    this.autoLos = false;
    this.auto = null;
    try {
      geoLocationManager.off('locationChange', this.leerGps);
    } catch (e) {
      // gleich neu in sensorenAn
    }
    this.leerGpsAn = false;
    this.start();
    return true;
  }

  private leerGps = (g: geoLocationManager.Location): void => {
    if (this.auto !== null && this.auto.fix(g.latitude, g.longitude, g.timeStamp > 0 ? g.timeStamp : Date.now())) {
      this.autoLos = true;
    }
  }

  // --- Uebertragung zum Handy (Nachrichten in Teilen, wie Lite) ---------------------------

  private senden(): void {
    if (!this.schlange.darf(Date.now()) || this.ctx === null) {
      return;
    }
    if (this.offenDatei !== null) {
      this.teilSenden();
      return;
    }
    if (!this.empfangAn) {
      this.empfangen();
    }
    if (Date.now() - this.halloZuletzt > HALLO_ALLE_MS) {
      this.halloOffen = true;
    }
    if (this.halloOffen) {
      // Hallo zuerst: Modell + Version -> das Handy antwortet mit der Seiten-Konfiguration.
      const h: Hallo = { device_model: this.modell, app_version: APP_VERSION };
      this.offenDatei = {
        d: { id: '', art: 'h', nr: -1 }, pfad: '', teile: K.teile('h_hallo.json', JSON.stringify(h), 1), nr: 0, hallo: true
      };
      this.teilSenden();
      return;
    }
    const d: K.Datei | null = this.plan.naechste();
    if (d === null) {
      return;
    }
    const name: string = K.dateiVon(d);
    const text: string | null = this.lies(name);
    if (text === null) {
      // Datei fehlt (Schreiben scheiterte): ueberspringen, gezaehlt — nie ewig warten.
      this.fehler('speicher', 'fehlt ' + name);
      this.plan.erledigt(d);
      this.planSichern();
      return;
    }
    this.offenDatei = { d: d, pfad: name, teile: K.teile(name, text, this.plan.offen()), nr: 0, hallo: false };
    this.teilSenden();
  }

  private teilSenden(): void {
    const o: OffeneDatei | null = this.offenDatei;
    if (o === null || this.ctx === null || !this.schlange.darf(Date.now())) {
      return;
    }
    const ctx: common.UIAbilityContext = this.ctx;
    this.schlange.start();
    let fertig: boolean = false;
    // Kommt nie eine Antwort (Verbindung weg mitten im Senden), haengt die Schlange nicht fest.
    clearTimeout(this.wache);
    this.wache = setTimeout(() => {
      if (!fertig) {
        fertig = true;
        this.fehlschlag(-1);
      }
    }, 60000);
    const g: string[] = this.gegen.jetzt();
    const app: wearEngine.P2pAppParam = { remoteApp: { bundleName: g[0], fingerprint: g[1] } };
    const nachricht: wearEngine.P2pMessage = { content: new util.TextEncoder().encodeInto(o.teile[o.nr]) };
    wearEngine.getDeviceClient(ctx).getConnectedDevices().then((geraete: wearEngine.Device[]) => {
      if (geraete.length === 0) {
        throw new Error('kein Handy');
      }
      return wearEngine.getP2pClient(ctx).sendMessage(geraete[0].randomId, app, nachricht);
    }).then((r: wearEngine.P2pResult) => {
      if (fertig) {
        return;
      }
      fertig = true;
      clearTimeout(this.wache);
      const code: number = r.code !== undefined ? r.code : 0;
      if (code === wearEngine.P2pResultCode.COMMUNICATION_SUCCESS) {
        this.gegen.ok();
        this.schlange.laeuft = false;
        o.nr++;
        if (o.nr >= o.teile.length) {
          if (o.hallo) {
            this.halloOffen = false;
            this.halloZuletzt = Date.now();
          } else {
            this.plan.erledigt(o.d);
            this.planSichern();
            this.loesche(o.pfad);
          }
          this.offenDatei = null;
          this.schlange.ok();
        } else {
          this.teilSenden();   // gleich weiter, solange es laeuft
        }
      } else {
        this.fehlschlag(code);
      }
    }).catch((e: BusinessError) => {
      if (fertig) {
        return;
      }
      fertig = true;
      clearTimeout(this.wache);
      this.fehlschlag(typeof e.code === 'number' ? e.code : 0);
    });
  }

  /** Rueckweg Handy -> Uhr: die Seiten-Konfiguration, in Teilen wie hin (PF1|k_konfig.json|…). */
  private empfangen(): void {
    if (this.ctx === null) {
      return;
    }
    const ctx: common.UIAbilityContext = this.ctx;
    const g: string[] = this.gegen.jetzt();
    const app: wearEngine.P2pAppParam = { remoteApp: { bundleName: g[0], fingerprint: g[1] } };
    this.empfangAn = true;
    wearEngine.getDeviceClient(ctx).getConnectedDevices().then((geraete: wearEngine.Device[]) => {
      if (geraete.length === 0) {
        throw new Error('kein Handy');
      }
      return wearEngine.getP2pClient(ctx).registerMessageReceiver(geraete[0].randomId, app, (m: wearEngine.P2pMessage) => {
        const opt: util.TextDecoderOptions = { fatal: false, ignoreBOM: true };
        this.konfigTeil(util.TextDecoder.create('utf-8', opt).decodeToString(m.content));
      });
    }).catch((e: BusinessError) => {
      this.empfangAn = false;   // beim naechsten Sendetakt noch einmal
      console.error('Pumpfoil Empfang ' + e.code);
    });
  }

  private konfigTeil(text: string): void {
    const f: string[] = text.split('|');
    if (f.length < 6 || f[0] !== 'PF1' || f[1] !== 'k_konfig.json') {
      return;
    }
    const nr: number = parseInt(f[2], 10);
    const n: number = parseInt(f[3], 10);
    if (!(n >= 1 && n <= 200 && nr >= 0 && nr < n)) {
      return;
    }
    if (this.kTeile === null || this.kTeile.length !== n) {
      this.kTeile = new Array<string>(n).fill('\u0000');
    }
    this.kTeile[nr] = f.slice(5).join('|');
    if (this.kTeile.indexOf('\u0000') >= 0) {
      return;
    }
    const ganz: string = this.kTeile.join('');
    this.kTeile = null;
    try {
      this.konfig = new Konfig(JSON.parse(ganz) as KonfigDaten);
      this.schreibe('konfig.json', ganz);
    } catch (e) {
      this.fehler('speicher', 'Konfig kaputt');
    }
  }

  private fehlschlag(code: number): void {
    this.schlange.fehler(code, Date.now());
    if (this.gegen.fehler()) {
      // Andere Handy-App versuchen (Android <-> iOS); gemerkt wird, was zuletzt angenommen hat.
      const g: GegenDatei = { i: this.gegen.i };
      this.schreibe('gegenstelle.json', JSON.stringify(g));
    }
  }

  // --- Lebenslauf -------------------------------------------------------------------------

  /** Einmal beim Start der Ability: Ordner, Plan, abgebrochene Aufnahme abschliessen, Sendetakt. */
  init(ctx: common.UIAbilityContext): void {
    if (this.ctx !== null) {
      return;
    }
    this.ctx = ctx;
    this.dir = ctx.filesDir;
    const name: string = deviceInfo.marketName !== '' ? deviceInfo.marketName : deviceInfo.productModel;
    this.modell = ('HUAWEI ' + name).replace(new RegExp('^HUAWEI HUAWEI', 'i'), 'HUAWEI').trim() + ' · HarmonyOS';
    const gt: string | null = this.lies('gegenstelle.json');
    if (gt !== null) {
      try {
        this.gegen = new K.Gegenstelle(GEGENSTELLEN, (JSON.parse(gt) as GegenDatei).i);
      } catch (e) {
        // Standard
      }
    }
    const kt: string | null = this.lies('konfig.json');
    if (kt !== null) {
      try {
        this.konfig = new Konfig(JSON.parse(kt) as KonfigDaten);
      } catch (e) {
        // Standardseiten
      }
    }
    const pt: string | null = this.lies('plan.json');
    if (pt !== null) {
      try {
        this.plan = new K.Sendeplan(JSON.parse(pt) as K.PlanDaten);
      } catch (e) {
        // neu
      }
    }
    const lt: string | null = this.lies('laufend.json');
    if (lt !== null && this.modus === 'bereit') {
      try {
        const l: Lauf = JSON.parse(lt) as Lauf;
        if (this.plan.finde(l.id) === null) {
          this.plan.neu(l.id);
        }
        const x: K.PlanEintrag | null = this.plan.finde(l.id);
        if (x !== null) {
          if (l.n > x.n) {
            x.n = l.n;
          }
          this.abschliessen(l.id, x.n, l.zuletzt > 0 ? l.zuletzt : Date.now(), l.pausen, l.hr, 'arkts-abgebrochen');
        }
      } catch (e) {
        this.loesche('laufend.json');
      }
    }
    // P2P nicht gleich beim Start (bei Lite friert das die Uhr ein) — hier vorsichtshalber genauso.
    setTimeout(() => {
      this.takt = setInterval(() => this.senden(), 3000);
    }, 3000);
  }

  /** Einmal je Sekunde von der Seite (nur waehrend der Aufnahme). true = Lauf begonnen/beendet. */
  taktSeiten(): boolean {
    if (this.modus !== 'laeuft') {
      return false;
    }
    const jetzt: number = Date.now();
    const f: number[] | null = this.fixNeu;
    this.fixNeu = null;
    return this.stand.tick(this.achse.jetzt(jetzt), jetzt, f !== null, f !== null ? f[0] : 0,
      f !== null ? f[1] : 0, f !== null ? f[2] : -1, this.sammler.hr);
  }

  seitenDaten(): SeitenDaten {
    return {
      s: this.stand, k: this.konfig,
      el: this.modus === 'bereit' ? 0 : this.achse.jetzt(Date.now()) / 1000,
      pausiert: this.modus === 'pause',
      zustand: this.modus === 'pause' ? 'p' : (this.stand.foiling ? 'on' : 'off')
    };
  }

  ende(): void {
    if (this.leerGpsAn) {
      try {
        geoLocationManager.off('locationChange', this.leerGps);
      } catch (e) {
        // war nicht an
      }
      this.leerGpsAn = false;
    }
    this.sensorenAus();
    this.bildschirmAn(false);
    this.hintergrundAus();
    clearInterval(this.takt);
  }

  zustand(): Zustand {
    const jetzt: number = Date.now();
    return {
      modus: this.modus, ms: this.modus === 'bereit' ? 0 : this.achse.jetzt(jetzt),
      kmh: this.anzeige.tempo * 3.6, m: this.anzeige.strecke, puls: this.sammler.hr,
      gpsOk: this.gpsLetzt > 0 && jetzt - this.gpsLetzt < 5000,
      offen: this.plan.offen(), plan: this.plan.stand(),
      // Fehler IN FOLGE (nach einem Erfolg wieder 0), wie common/recorder.js.
      sendeFehler: this.schlange.fehlerFolge, sendeCode: this.schlange.letzterCode,
      fehler: this.f.speicher + this.f.accel + this.f.gps, letzterFehler: this.letzterFehler,
      verworfen: this.verworfen
    };
  }

  /** Seiten-Konfiguration samt Ablauf-Einstellungen (stopMode, autoStart, waterLock) fuer die Seite. */
  konfigJetzt(): Konfig {
    return this.konfig;
  }
}
