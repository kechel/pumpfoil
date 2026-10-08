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
import { common, wantAgent, WantAgent, abilityAccessCtrl } from '@kit.AbilityKit';
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
import * as D from './Direkt';
import { Stand, Konfig, KonfigDaten, Auswahl, AuswahlDaten, Alarm } from './Seiten';

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
  foil_id?: number;   // gewaehltes Foil (wie Zepp), nur wenn gewaehlt
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
  direkt: boolean;        // mit pumpfoil.org gekoppelt: laedt selbst hoch, ohne Handy
  direktFehler: number;   // Fehlversuche in Folge (0 = letzter Upload ging durch)
}

interface FixDaten {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number;
  timeStamp: number;
}

interface DirektDatei {
  t: string;
}

/** Laufendes Koppeln: Code auf der Uhr, claim_token zum Nachfragen. */
export interface Koppeln {
  code: string;
  claim: string;
  status: string;   // '' | 'netz' (kein Server) | 'fehler <code>'
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
  private gpsAbonniert: boolean = false;
  private gpsFixe: number = 0;
  private gpsNull: number = 0;   // verworfene 0,0-Fixe (nur fuers Log)   // nur fuers Log: erster Fix und jeder 60.
  private ortungGefragt: boolean = false;   // je Aufnahme hoechstens einmal fragen
  private gpsVersuch: number = 0;
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
  private ohneAccel: boolean = false;
  // Direkt-Upload (Direkt.ets): Geraete-Token aus dem Koppeln, '' = nicht gekoppelt (Wear Engine)
  private direktToken: string = '';
  private direktLaeuft: boolean = false;
  private direktFehler: number = 0;
  private direktNaechster: number = 0;   // frueheste Zeit fuer den naechsten Versuch (Backoff)
  private direktKonfigZuletzt: number = 0;
  koppeln: Koppeln | null = null;
  private koppelnLaeuft: boolean = false;
  // DevEco-Emulator: dessen GPS-Emulation kam nie bei der App an (nur 0,0, 08.10.2026) -> eigene Fahrt
  private emulator: boolean = false;
  private simTakt: number = -1;
  private simT: number = 0;
  private simLat: number = 47.229;
  private simLon: number = 8.607;
  auswahl: Auswahl = new Auswahl(null);   // Wahl auf der Uhr (Einstellungen), gespeichert in auswahl.json
  private alarm: Alarm = new Alarm();   // Sensorliste ohne ACCELEROMETER -> messweg.accel „keine"

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

  /**
   * Welche Sensoren die Uhr hat, einmal ins Log (Jan, 08.10.2026: Forenbeitrag „How to Obtain the List of
   * Device Sensors"). Die erste Aufnahme auf einer Watch 5 zeigt damit, was es gibt und wie schnell
   * (minSamplePeriod in ns). Fehlt der Beschleunigungssensor: Zustand, kein Fehler — wie Lite.
   */
  private sensorenAuflisten(): void {
    try {
      const liste: sensor.Sensor[] = sensor.getSensorListSync();
      let accel: boolean = false;
      let text: string = '';
      for (let i = 0; i < liste.length; i++) {
        const x: sensor.Sensor = liste[i];
        if (x.sensorId === sensor.SensorId.ACCELEROMETER) {
          accel = true;
        }
        text += (i > 0 ? ', ' : '') + x.sensorId + ':' + x.sensorName + '/' + x.minSamplePeriod;
      }
      this.ohneAccel = !accel;
      console.info('Pumpfoil Sensoren (' + liste.length + '): ' + text);
    } catch (e) {
      console.error('Pumpfoil Sensorliste: ' + (e as BusinessError).code);
    }
  }

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
    this.gpsAbonniert = false;
    this.ortungGefragt = false;
    this.gpsAbo();
  }

  /**
   * GPS abonnieren. Schlaegt es fehl (3301100 = Ortung in den Systemeinstellungen aus), versucht
   * taktSeiten es alle 5 s erneut — schaltet der Fahrer die Ortung waehrend der Aufnahme ein, kommt
   * GPS ohne Neustart dazu. Jeder Fehlversuch wird gezaehlt und geloggt (nicht nur der erste).
   */
  private gpsAbo(): void {
    if (this.emulator) {
      this.simAn((lat: number, lon: number, v: number) => this.fixVerarbeiten(lat, lon, 4, v, Date.now()));
      this.gpsAbonniert = true;
      return;
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
      this.gpsAbonniert = true;
      this.gpsFixe = 0;
      console.info('Pumpfoil GPS abonniert');
      try {
        const l: geoLocationManager.Location = geoLocationManager.getLastLocation();
        console.info('Pumpfoil GPS letzte bekannte Position ' + l.latitude + ',' + l.longitude + ' alt ' +
          Math.round((Date.now() - l.timeStamp) / 1000) + ' s');
      } catch (e) {
        console.info('Pumpfoil GPS keine letzte Position (' + (e as BusinessError).code + ')');
      }
      if (this.letzterFehler.indexOf('3301100') >= 0) {
        this.letzterFehler = '';   // Ortung ist inzwischen an: der Hinweis darf weg (der Zaehler bleibt)
      }
    } catch (e) {
      const code: number = (e as BusinessError).code;
      if (code === 3301100) {
        // Ortung aus ist ein ZUSTAND, kein Fehler der Aufnahme: jeder Versuch wird geloggt, aber nicht
        // gezaehlt (sonst stand nach 5 min „Errors 38" da, Emulator 08.10.2026). Die Infozeile sagt
        // „GPS aus: Ortung einschalten", solange das gilt.
        this.letzterFehler = 'GPS 3301100';
        console.error('Pumpfoil GPS 3301100 (Ortung aus)');
        this.ortungErfragen();
      } else {
        this.fehler('gps', 'GPS ' + code);
      }
    }
  }

  /**
   * NUR DIAGNOSE: kommt per Abo 10 s lang kein (gueltiger) Fix, einmal je 10 s direkt fragen und das
   * Ergebnis loggen (Emulator 08.10.2026: Abo lieferte nur 0,0, obwohl das GPX-Replay lief). Zeigt,
   * ob das System eine Position hat, die nur das Abo nicht weitergibt. Aufgezeichnet wird daraus nichts.
   */
  private gpsProbe(): void {
    try {
      const frage: geoLocationManager.SingleLocationRequest = {
        locatingPriority: geoLocationManager.LocatingPriority.PRIORITY_LOCATING_SPEED,
        locatingTimeoutMs: 5000
      };
      geoLocationManager.getCurrentLocation(frage)
        .then((l: geoLocationManager.Location) => {
          console.info('Pumpfoil GPS Probe: ' + l.latitude.toFixed(5) + ',' + l.longitude.toFixed(5) +
            ' acc ' + l.accuracy + ' speed ' + l.speed + ' (Abo lieferte 10 s nichts)');
        })
        .catch((e: BusinessError) => {
          console.error('Pumpfoil GPS Probe fehlgeschlagen: ' + e.code);
        });
    } catch (e) {
      console.error('Pumpfoil GPS Probe: ' + (e as BusinessError).code);
    }
  }

  /**
   * Ortung im System aus (3301100): einmal je Aufnahme den System-Dialog zeigen, der sie einschaltet
   * (API 12). Im DevEco-Emulator steht der Schalter ab Werk aus, auf echten Uhren schalten Leute ihn
   * zum Akkusparen ab. Der Neuversuch in taktSeiten holt GPS danach ohne Neustart.
   */
  private ortungErfragen(): void {
    if (this.ortungGefragt || this.ctx === null) {
      return;
    }
    this.ortungGefragt = true;
    try {
      abilityAccessCtrl.createAtManager().requestGlobalSwitch(this.ctx, abilityAccessCtrl.SwitchType.LOCATION)
        .then((an: boolean) => {
          console.info('Pumpfoil Ortung-Dialog: ' + (an ? 'eingeschaltet' : 'abgelehnt'));
        })
        .catch((e: BusinessError) => {
          console.error('Pumpfoil Ortung-Dialog: ' + e.code);
        });
    } catch (e) {
      console.error('Pumpfoil Ortung-Dialog: ' + (e as BusinessError).code);
    }
  }

  private gpsRueckruf = (g: geoLocationManager.Location): void => {
    this.fixVerarbeiten(g.latitude, g.longitude, g.accuracy, g.speed, g.timeStamp);
  }

  /** Ein GPS-Fix, egal woher (System oder Emulator-Fahrt). */
  private fixVerarbeiten(lat: number, lon: number, acc: number, speed: number, ts: number): void {
    const g: FixDaten = { latitude: lat, longitude: lon, accuracy: acc, speed: speed, timeStamp: ts };
    const jetzt: number = Date.now();
    if (g.latitude === 0 && g.longitude === 0) {
      // „Null Island": Platzhalter ohne echte Position (Emulator 08.10.2026: erster Fix 0,0 acc 6.5).
      // Nie aufzeichnen — sonst Sprung um Tausende km in Strecke und Spur.
      this.gpsNull++;
      if (this.gpsNull === 1 || this.gpsNull % 60 === 0) {
        console.info('Pumpfoil GPS Fix 0,0 verworfen (' + this.gpsNull + ' bisher)');
      }
      return;
    }
    let t: number = this.achse.auf(g.timeStamp, jetzt);
    if (t < 0) {
      t = this.achse.jetzt(jetzt);
    }
    this.gpsLetzt = jetzt;
    this.gpsFixe++;
    if (this.gpsFixe === 1 || this.gpsFixe % 60 === 0) {
      console.info('Pumpfoil GPS Fix ' + this.gpsFixe + ': ' + g.latitude.toFixed(5) + ',' + g.longitude.toFixed(5) +
        ' acc ' + g.accuracy + ' speed ' + g.speed);
    }
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
    this.simAus();
  }

  /**
   * NUR DevEco-Emulator (deviceInfo „emulator"): dessen GPS-Emulation erreichte die App nie, das
   * System kannte nur 0,0 (08.10.2026). Stattdessen jede Sekunde ein Fix entlang einer Pumpfoil-Fahrt
   * wie common/sim-gps.js fuer Lite: 30 s Lauf mit ~17-19 km/h, 20 s zurueck mit 3 km/h. Echte Uhren
   * heissen nie „emulator" und kommen hier nie hin.
   */
  private simAn(ziel: (lat: number, lon: number, v: number) => void): void {
    this.simAus();
    console.info('Pumpfoil SIM: GPS-Fahrt (Emulator)');
    this.simTakt = setInterval(() => {
      this.simT++;
      const p: number = this.simT % 50;
      const kmh: number = p < 30 ? 17 + 2 * Math.sin(this.simT / 3) : 3;
      const v: number = kmh / 3.6;
      this.simLat += v * 0.7071 / 111320;
      this.simLon += v * 0.7071 / (111320 * Math.cos(this.simLat * Math.PI / 180));
      ziel(this.simLat, this.simLon, v);
    }, 1000);
  }

  private simAus(): void {
    if (this.simTakt >= 0) {
      clearInterval(this.simTakt);
      this.simTakt = -1;
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
    if (this.auswahl.foilId !== null) {
      meta.foil_id = this.auswahl.foilId;
    }
    this.alarm = new Alarm();
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
    this.abschliessen(this.id, this.sammler.index, jetzt, this.achse.pausen, this.sammler.hrAnzahl,
      this.ohneAccel ? 'keine' : 'arkts');
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
        this.simAus();
      }
      return false;
    }
    if (!this.leerGpsAn) {
      this.leerGpsAn = true;
      this.auto = new K.AutoStart();
      if (this.emulator) {
        this.simAn((lat: number, lon: number, v: number) => {
          if (this.auto !== null && this.auto.fix(lat, lon, Date.now())) {
            this.autoLos = true;
          }
        });
        return false;
      }
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
    this.simAus();
    this.start();
    return true;
  }

  private leerGps = (g: geoLocationManager.Location): void => {
    if (g.latitude === 0 && g.longitude === 0) {
      return;   // Platzhalter 0,0 (s. gpsRueckruf): wuerde als Riesensprung den Auto-Start ausloesen
    }
    if (this.auto !== null && this.auto.fix(g.latitude, g.longitude, g.timeStamp > 0 ? g.timeStamp : Date.now())) {
      this.autoLos = true;
    }
  }

  // --- Uebertragung zum Handy (Nachrichten in Teilen, wie Lite) ---------------------------

  private senden(): void {
    if (this.direktToken !== '') {
      this.direktTakt();   // gekoppelt: alles direkt zum Server, die Wear Engine bleibt still
      return;
    }
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

  // --- Direkt zum Server (gekoppelt, ohne Handy; Direkt.ets) -------------------------------

  gekoppelt(): boolean {
    return this.direktToken !== '';
  }

  /** Koppeln beginnen: Code holen (pair-init). Die Seite zeigt koppeln.code an. */
  koppelnStart(): void {
    if (this.koppelnLaeuft) {
      return;
    }
    this.koppelnLaeuft = true;
    this.koppeln = { code: '', claim: '', status: '' };
    D.anfrage('POST', '/api/devices/pair-init', D.pairInitKoerper(this.modell), '').then((a: D.Antwort) => {
      this.koppelnLaeuft = false;
      if (a.code !== 200) {
        this.koppeln = { code: '', claim: '', status: a.code === 0 ? 'netz' : 'fehler ' + a.code };
        console.error('Pumpfoil koppeln pair-init ' + a.code + ' ' + a.text.substring(0, 80));
        return;
      }
      const p: D.PairInit = JSON.parse(a.text) as D.PairInit;
      this.koppeln = { code: p.code, claim: p.claim_token, status: '' };
      console.info('Pumpfoil koppeln: Code da');
    });
  }

  /** Alle paar Sekunden, solange die Koppel-Ansicht offen ist: wurde der Code eingeloest? */
  koppelnTakt(): void {
    const k: Koppeln | null = this.koppeln;
    if (this.koppelnLaeuft || this.direktToken !== '') {
      return;
    }
    if (k === null || k.claim === '') {
      this.koppelnStart();   // noch kein Code (oder kein Netz beim letzten Versuch): neu holen
      return;
    }
    this.koppelnLaeuft = true;
    D.anfrage('GET', '/api/devices/pair-poll?claim_token=' + k.claim, '', '').then((a: D.Antwort) => {
      this.koppelnLaeuft = false;
      if (a.code === 404) {
        this.koppeln = null;   // abgelaufen: beim naechsten Takt ein neuer Code
        return;
      }
      if (a.code !== 200) {
        k.status = a.code === 0 ? 'netz' : 'fehler ' + a.code;
        return;
      }
      k.status = '';
      const p: D.PairPoll = JSON.parse(a.text) as D.PairPoll;
      if (p.device_token !== null && p.device_token !== undefined && p.device_token !== '') {
        this.direktToken = p.device_token;
        const d: DirektDatei = { t: p.device_token };
        this.schreibe('direkt.json', JSON.stringify(d));
        this.koppeln = null;
        this.direktKonfigZuletzt = 0;
        this.direktNaechster = 0;
        console.info('Pumpfoil koppeln: gekoppelt');
      }
    });
  }

  /** Entkoppeln: zurueck zur Wear Engine (Handy). Nichts Aufgezeichnetes geht verloren. */
  trennen(): void {
    this.direktToken = '';
    this.koppeln = null;
    this.direktFehler = 0;
    this.loesche('direkt.json');
    console.info('Pumpfoil direkt getrennt');
  }

  /** Token vom Server abgelehnt (in pumpfoil.org entfernt): entkoppeln, damit die Uhr nicht ewig 401 sammelt. */
  private abgelehnt(wo: string): void {
    console.error('Pumpfoil direkt 401 bei ' + wo + ' -> entkoppelt');
    this.letzterFehler = 'pumpfoil.org 401';
    this.trennen();
  }

  private direktFehlschlag(was: string, a: D.Antwort): void {
    this.direktLaeuft = false;
    this.direktFehler++;
    // 30 s, 60 s, 2 min, dann 5 min — jeder Fehlversuch geloggt, nie nur der erste
    const warte: number = this.direktFehler <= 1 ? 30000 : this.direktFehler === 2 ? 60000
      : this.direktFehler === 3 ? 120000 : 300000;
    this.direktNaechster = Date.now() + warte;
    console.error('Pumpfoil direkt ' + was + ' ' + a.code + ' ' + a.text.substring(0, 80) + ' (Fehler ' + this.direktFehler + ')');
  }

  /** Vom Sendetakt (alle 3 s), wenn gekoppelt: Konfiguration halbstuendlich, fertige Sessions hochladen. */
  private direktTakt(): void {
    const jetzt: number = Date.now();
    if (this.direktLaeuft || jetzt < this.direktNaechster) {
      return;
    }
    if (jetzt - this.direktKonfigZuletzt > HALLO_ALLE_MS) {
      this.direktLaeuft = true;
      const tok: string = this.direktToken;
      D.anfrage('GET', '/api/devices/config?p=huawei&v=' + APP_VERSION, '', tok).then((a: D.Antwort) => {
        if (a.code === 401) {
          this.direktLaeuft = false;
          this.abgelehnt('config');
          return;
        }
        if (a.code !== 200) {
          this.direktFehlschlag('config', a);
          return;
        }
        this.direktLaeuft = false;
        this.direktKonfigZuletzt = Date.now();
        try {
          this.konfigAnwenden(new Konfig(JSON.parse(a.text) as KonfigDaten));
          this.schreibe('konfig.json', a.text);
        } catch (e) {
          this.fehler('speicher', 'Konfig kaputt');
        }
      });
      return;
    }
    const x: K.PlanEintrag | null = K.direktBereit(this.plan);
    if (x === null) {
      return;
    }
    this.hochladen(x.id, x.n);
  }

  /** Eine abgeschlossene Session: Meta, Chunks in Paketen (GPS zuerst), /complete — wie HuaweiBruecke.session. */
  private hochladen(id: string, n: number): void {
    const meta: string | null = this.lies(K.dateiMeta(id));
    const ende: string | null = this.lies(K.dateiEnde(id));
    if (meta === null || ende === null) {
      this.fehler('speicher', 'direkt: Meta/Ende fehlt ' + id);
      this.direktNaechster = Date.now() + 300000;
      return;
    }
    const chunks: string[] = [];
    for (let i = 0; i < n; i++) {
      const c: string | null = this.lies(K.dateiChunk(id, i));
      if (c === null) {
        this.fehler('speicher', 'fehlt ' + K.dateiChunk(id, i));   // geht ohne ihn hoch, gezaehlt
      } else {
        chunks.push(c);
      }
    }
    this.direktLaeuft = true;
    const tok: string = this.direktToken;
    console.info('Pumpfoil direkt: lade ' + id + ' (' + chunks.length + ' Chunks)');
    let up: K.DirektUpload = K.direktUpload(meta, chunks, [], 30);
    D.anfrage('POST', '/api/ingest/session', up.meta, tok).then((a: D.Antwort): Promise<D.Antwort> => {
      if (a.code === 401) {
        return Promise.resolve(a);
      }
      if (a.code !== 200) {
        return Promise.resolve(a);
      }
      const r: D.SessionAntwort = JSON.parse(a.text) as D.SessionAntwort;
      const da: number[] = r.received_chunks !== undefined ? r.received_chunks : [];
      up = K.direktUpload(meta, chunks, da, 30);   // was schon da ist, geht nicht noch einmal
      return this.pakete(id, up.pakete, 0, tok);
    }).then((a: D.Antwort): Promise<D.Antwort> => {
      if (a.code !== 200) {
        return Promise.resolve(a);
      }
      return D.anfrage('POST', '/api/ingest/session/' + id + '/complete', ende, tok);
    }).then((a: D.Antwort) => {
      if (a.code === 401) {
        this.direktLaeuft = false;
        this.abgelehnt('ingest');
        return;
      }
      if (a.code !== 200) {
        this.direktFehlschlag('upload ' + id, a);
        return;
      }
      // Erst NACH /complete loeschen (wie die Bruecke): bricht es vorher ab, ist alles noch da.
      const weg: string[] = this.plan.weg(id);
      for (let i = 0; i < weg.length; i++) {
        this.loesche(weg[i]);
      }
      this.planSichern();
      this.direktLaeuft = false;
      this.direktFehler = 0;
      console.info('Pumpfoil direkt: ' + id + ' hochgeladen');
    });
  }

  /** Pakete nacheinander; jedes muss vollstaendig quittiert sein, sonst Abbruch (Wiederaufnahme spaeter). */
  private pakete(id: string, pakete: string[], i: number, tok: string): Promise<D.Antwort> {
    if (i >= pakete.length) {
      const ok: D.Antwort = { code: 200, text: '' };
      return Promise.resolve(ok);
    }
    return D.anfrage('POST', '/api/ingest/session/' + id + '/chunks', pakete[i], tok).then((a: D.Antwort): Promise<D.Antwort> => {
      if (a.code !== 200) {
        return Promise.resolve(a);
      }
      const soll: number = (JSON.parse(pakete[i]) as K.ChunkPaket).chunks.length;
      const r: D.ChunkAntwort = JSON.parse(a.text) as D.ChunkAntwort;
      const ist: number = r.received !== undefined ? r.received.length : 0;
      if (ist < soll) {
        const kurz: D.Antwort = { code: 500, text: 'nur ' + ist + ' von ' + soll + ' quittiert' };
        return Promise.resolve(kurz);
      }
      return this.pakete(id, pakete, i + 1, tok);
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
      this.konfigAnwenden(new Konfig(JSON.parse(ganz) as KonfigDaten));
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
    this.sensorenAuflisten();
    const name: string = deviceInfo.marketName !== '' ? deviceInfo.marketName : deviceInfo.productModel;
    // Roh ins Log: daraus wird der Uhrenname am Server (Verkaufsname oder Code?).
    console.info('Pumpfoil Geraeteinfo marketName=' + deviceInfo.marketName + ' productModel=' + deviceInfo.productModel +
      ' brand=' + deviceInfo.brand + ' manufacture=' + deviceInfo.manufacture);
    this.modell = ('HUAWEI ' + name).replace(new RegExp('^HUAWEI HUAWEI', 'i'), 'HUAWEI').trim() + ' · HarmonyOS';
    this.emulator = deviceInfo.marketName === 'emulator' || deviceInfo.productModel === 'emulator';
    const dt: string | null = this.lies('direkt.json');
    if (dt !== null) {
      try {
        this.direktToken = (JSON.parse(dt) as DirektDatei).t;
        console.info('Pumpfoil direkt gekoppelt');
      } catch (e) {
        this.direktToken = '';
      }
    }
    const gt: string | null = this.lies('gegenstelle.json');
    if (gt !== null) {
      try {
        this.gegen = new K.Gegenstelle(GEGENSTELLEN, (JSON.parse(gt) as GegenDatei).i);
      } catch (e) {
        // Standard
      }
    }
    const at: string | null = this.lies('auswahl.json');
    if (at !== null) {
      try {
        this.auswahl = new Auswahl(JSON.parse(at) as AuswahlDaten);
      } catch (e) {
        // neu
      }
    }
    const kt: string | null = this.lies('konfig.json');
    if (kt !== null) {
      try {
        this.konfigAnwenden(new Konfig(JSON.parse(kt) as KonfigDaten));
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
    if (!this.gpsAbonniert && jetzt - this.gpsVersuch >= 5000) {
      this.gpsVersuch = jetzt;
      this.gpsAbo();
    } else if (this.gpsAbonniert && jetzt - this.gpsLetzt > 10000 && jetzt - this.gpsVersuch >= 10000) {
      this.gpsVersuch = jetzt;
      this.gpsProbe();
    }
    const f: number[] | null = this.fixNeu;
    this.fixNeu = null;
    const el: number = this.achse.jetzt(jetzt);
    const wechsel: boolean = this.stand.tick(el, jetzt, f !== null, f !== null ? f[0] : 0,
      f !== null ? f[1] : 0, f !== null ? f[2] : -1, this.sammler.hr);
    const muster: string[] = this.alarm.pruefe(this.konfig, this.auswahl, this.stand.sp3 * 3.6, this.sammler.hr,
      this.stand, el / 1000, jetzt);
    for (let i = 0; i < muster.length; i++) {
      this.vibrieren(muster[i], i * 1500);
    }
    return wechsel;
  }

  /** Muster-ID -> Stoesse in ms (wie Wear vibratePattern): short1 · short2 · long2 · lsl. */
  private vibrieren(muster: string, nach: number): void {
    const folge: number[] = muster === 'short1' ? [150] : muster === 'long2' ? [500, 500]
      : muster === 'lsl' ? [500, 150, 500] : [150, 150];
    let t: number = nach;
    for (let i = 0; i < folge.length; i++) {
      const d: number = folge[i];
      setTimeout(() => {
        try {
          vibrator.startVibration({ type: 'time', duration: d }, { id: 0, usage: 'alarm' });
        } catch (e) {
          // ohne Vibration geht es auch
        }
      }, t);
      t += d + 250;
    }
  }

  /** Neue Konfiguration: Auswahl vorbelegen, Layouts-Wahl darueberlegen, Auswahl sichern (wie recorder.js). */
  private konfigAnwenden(k: Konfig): void {
    this.konfig = k;
    k.layoutsServer = k.layoutsOn;
    this.auswahl.vorbelegen(k);
    this.auswahlAnwenden();
  }

  /** Nach einer Aenderung auf der Einstellungsseite: Layouts-Wahl wirken lassen und speichern. */
  auswahlAnwenden(): void {
    const k: Konfig = this.konfig;
    if (k.layoutsServer === undefined) {
      k.layoutsServer = k.layoutsOn;
    }
    k.layoutsOn = this.auswahl.layouts === null ? (k.layoutsServer === true) : this.auswahl.layouts;
    this.schreibe('auswahl.json', JSON.stringify(this.auswahl.daten()));
  }

  /** Touch-Sperre: Wahl auf der Uhr, sonst Profil (waterLock „on"). */
  sperreAn(): boolean {
    return this.auswahl.sperre === null ? this.konfig.waterLock === 'on' : this.auswahl.sperre;
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
      this.simAus();
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
      verworfen: this.verworfen,
      direkt: this.direktToken !== '', direktFehler: this.direktFehler
    };
  }

  /** Seiten-Konfiguration samt Ablauf-Einstellungen (stopMode, autoStart, waterLock) fuer die Seite. */
  konfigJetzt(): Konfig {
    return this.konfig;
  }
}
