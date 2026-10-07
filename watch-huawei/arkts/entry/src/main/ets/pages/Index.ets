/*
 * Die eine Seite des Recorders — Gegenstueck zu lite/…/pages/index (gleiche Zustaende, gleiche
 * Texte, gleiche 2-s-Halten-Gesten wie auf allen Pumpfoil-Uhren: ein nasser Aermel soll nichts
 * beenden oder pausieren). Logik in common/Recorder.ets + common/Kern.ets.
 */
import { Recorder, Zustand } from '../common/Recorder';

const HALTEN_MS: number = 2000;
const CYAN: string = '#22d3ee';

function zeitText(ms: number): string {
  const s: number = Math.floor(ms / 1000);
  const h: number = Math.floor(s / 3600);
  const m: number = Math.floor((s % 3600) / 60);
  const r: number = s % 60;
  return (h > 0 ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (r < 10 ? '0' : '') + r;
}

@Entry
@Component
struct Index {
  @State modus: string = 'bereit';
  @State zeit: string = '0:00';
  @State tempo: string = '0.0';
  @State strecke: string = '0.00';
  @State puls: string = '-- bpm';
  @State info: string = '';
  @State balken: number = 0;
  @State balkenZeigen: boolean = false;
  private haltText: string = '';
  private haltUhr: number = -1;
  private takt: number = -1;

  aboutToAppear(): void {
    this.takt = setInterval(() => this.zeigen(), 1000);
    this.zeigen();
  }

  aboutToDisappear(): void {
    clearInterval(this.takt);
  }

  /** Wischen/Zurueck waehrend einer Aufnahme beendet die App nicht (wie `wischen` bei Lite). */
  onBackPress(): boolean {
    if (this.modus !== 'bereit') {
      this.haltText = this.t($r('app.string.stopFirst'));
      this.zeigen();
      setTimeout(() => {
        this.haltText = '';
        this.zeigen();
      }, 2000);
      return true;
    }
    return false;
  }

  private t(res: Resource): string {
    try {
      return this.getUIContext().getHostContext()!.resourceManager.getStringSync(res.id);
    } catch (e) {
      return '';
    }
  }

  private zeigen(): void {
    const z: Zustand = Recorder.get().zustand();
    this.modus = z.modus;
    this.zeit = zeitText(z.ms);
    this.tempo = z.kmh.toFixed(1);
    this.strecke = (z.m / 1000).toFixed(2);
    this.puls = z.puls > 0 ? z.puls + ' bpm' : '-- bpm';
    // Eine Zeile Zustand: Halten > Fehler > GPS > Uebertragung. Fehler bleiben stehen, solange es
    // sie gibt (nie nur einmal melden).
    let info: string = '';
    if (this.haltText !== '') {
      info = this.haltText;
    } else if (z.fehler > 0) {
      info = this.t($r('app.string.errors')) + ' ' + z.fehler + ': ' + z.letzterFehler;
    } else if (z.modus === 'laeuft' && !z.gpsOk) {
      info = this.t($r('app.string.gpsWait'));
    } else if (z.offen > 0) {
      // „Zum Handy: 34/120" — Dateien (je ~5 s Aufnahme), dieselbe Zahl wie im Handy-Balken.
      info = this.t($r('app.string.toPhone')) + ' ' + z.plan.fertig + '/' + z.plan.gesamt;
      if (z.sendeFehler > 0) {
        info += ' · ' + this.t($r('app.string.openPhone')) + ' (' + z.sendeCode + ')';
      }
    } else if (z.modus === 'bereit') {
      info = this.t($r('app.string.allSent'));
    }
    this.info = info;
    // Balken nur ausserhalb der Aufnahme (waehrend der Fahrt zappelte er zwischen 0/1 und 1/1).
    this.balkenZeigen = z.modus === 'bereit' && z.offen > 0 && z.plan.gesamt > 0;
    this.balken = z.plan.gesamt > 0 ? Math.floor(100 * z.plan.fertig / z.plan.gesamt) : 0;
  }

  private halten(aktion: string, text: Resource): void {
    clearTimeout(this.haltUhr);
    this.haltText = this.t(text);
    this.zeigen();
    this.haltUhr = setTimeout(() => {
      this.haltText = '';
      const r: Recorder = Recorder.get();
      if (aktion === 'start') {
        r.start();
      } else if (aktion === 'pause') {
        r.pause();
      } else if (aktion === 'weiter') {
        r.weiter();
      } else {
        r.stopp();
      }
      this.zeigen();
    }, HALTEN_MS);
  }

  private loslassen(): void {
    clearTimeout(this.haltUhr);
    if (this.haltText !== '') {
      this.haltText = '';
      this.zeigen();
    }
  }

  @Builder
  knopf(text: Resource, farbe: string, breite: number, aktion: string, haltText: Resource) {
    Button(text)
      .width(breite)
      .height(64)
      .fontSize(22)
      .fontColor('#000000')
      .backgroundColor(farbe)
      .margin({ top: 10 })
      .onTouch((e: TouchEvent) => {
        if (e.type === TouchType.Down) {
          this.halten(aktion, haltText);
        } else if (e.type === TouchType.Up || e.type === TouchType.Cancel) {
          this.loslassen();
        }
      })
  }

  build() {
    Column() {
      Text('PUMPFOIL').fontSize(20).fontColor(CYAN).margin({ bottom: 4 })
      if (this.modus === 'bereit') {
        this.knopf($r('app.string.start'), CYAN, 200, 'start', $r('app.string.holdStart'))
        if (this.balkenZeigen) {
          Progress({ value: this.balken, total: 100, type: ProgressType.Linear })
            .width(200).color(CYAN).margin({ top: 10 })
        }
      } else {
        Text(this.zeit).fontSize(34).fontColor('#ffffff')
        Row() {
          Text(this.tempo).fontSize(30).fontColor('#ffffff').width('50%').textAlign(TextAlign.Center)
          Text(this.strecke).fontSize(30).fontColor('#ffffff').width('50%').textAlign(TextAlign.Center)
        }.width(240)
        Row() {
          Text('km/h').fontSize(16).fontColor('#94a3b8').width('50%').textAlign(TextAlign.Center)
          Text('km').fontSize(16).fontColor('#94a3b8').width('50%').textAlign(TextAlign.Center)
        }.width(240)
        Text(this.puls).fontSize(24).fontColor('#ffffff')
        if (this.modus === 'laeuft') {
          this.knopf($r('app.string.pause'), '#fbbf24', 200, 'pause', $r('app.string.holdPause'))
        } else {
          Text($r('app.string.paused')).fontSize(24).fontColor('#fbbf24')
          Row({ space: 8 }) {
            this.knopf($r('app.string.resume'), CYAN, 110, 'weiter', $r('app.string.holdResume'))
            this.knopf($r('app.string.stop'), '#f87171', 110, 'stopp', $r('app.string.holdStop'))
          }
        }
      }
      Text(this.info)
        .fontSize(16)
        .fontColor('#cbd5e1')
        .textAlign(TextAlign.Center)
        .width(260)
        .maxLines(3)
        .margin({ top: 8 })
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .backgroundColor('#000000')
  }
}
