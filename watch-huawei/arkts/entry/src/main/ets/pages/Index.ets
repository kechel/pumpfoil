/*
 * Die eine Seite des Recorders — Gegenstueck zu lite/…/pages/index (gleiche Zustaende, gleiche
 * Texte, gleiche 2-s-Halten-Gesten wie auf allen Pumpfoil-Uhren: ein nasser Aermel soll nichts
 * beenden oder pausieren). Logik in common/Recorder.ets + common/Kern.ets.
 */
import { Recorder, Zustand, SeitenDaten } from '../common/Recorder';
import { ring, zeichne, Seite, Befehl, ZeichenKontext } from '../common/Seiten';

// Feldbeschriftungen (Schluessel wie Seiten.ets feld) — Ressourcen f_<schluessel>.
const FELDTEXTE: string[] = ['kmh3s', 'kmhAvg', 'kmhMax', 'bpmAvg', 'bpmMax', 'time', 'dist', 'clock', 'runActive',
  'runTime', 'runDist', 'lastRunTime', 'lastRunDist', 'lastRunAvg', 'lastRunMax', 'runs', 'lastRunMaxHr',
  'allRunsDist', 'allRunsTime'];

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
  // Seite 0 = Bedienung (Pause/Weiter/Stopp), 1 … n = Datenseiten des aktuellen Zustands.
  @State datenseite: boolean = false;
  private seite: number = 1;
  private zustandVorher: string = '';
  private texte: Map<string, string> = new Map<string, string>();
  private leinwandBereit: boolean = false;
  private einstellungen: RenderingContextSettings = new RenderingContextSettings(true);
  private leinwand: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.einstellungen);
  private haltText: string = '';
  private haltUhr: number = -1;
  private takt: number = -1;

  aboutToAppear(): void {
    const ctx: Context | undefined = this.getUIContext().getHostContext();
    if (ctx !== undefined) {
      for (let i = 0; i < FELDTEXTE.length; i++) {
        try {
          this.texte.set(FELDTEXTE[i], ctx.resourceManager.getStringByNameSync('f_' + FELDTEXTE[i]));
        } catch (e) {
          this.texte.set(FELDTEXTE[i], FELDTEXTE[i]);
        }
      }
    }
    this.texte.set('paused', this.t($r('app.string.paused')));
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
    if (Recorder.get().taktSeiten()) {
      this.seite = 1;   // Lauf begonnen/beendet -> erste Datenseite (wie Zepp)
    }
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
      // Nichts offen, aber das Handy antwortet nicht: sagen statt „Alles uebertragen" (wie Lite).
      info = z.sendeFehler > 0 ? this.t($r('app.string.openPhone')) + ' (' + z.sendeCode + ')'
        : this.t($r('app.string.allSent'));
    }
    this.info = info;
    // Balken nur ausserhalb der Aufnahme (waehrend der Fahrt zappelte er zwischen 0/1 und 1/1).
    this.balkenZeigen = z.modus === 'bereit' && z.offen > 0 && z.plan.gesamt > 0;
    this.balken = z.plan.gesamt > 0 ? Math.floor(100 * z.plan.fertig / z.plan.gesamt) : 0;
    this.datenseiten();
  }

  private ringJetzt(d: SeitenDaten): Seite[] {
    return ring(d.k, d.zustand);
  }

  private datenseiten(): void {
    const r: Recorder = Recorder.get();
    if (r.modus === 'bereit') {
      this.datenseite = false;
      this.seite = 1;
      return;
    }
    const d: SeitenDaten = r.seitenDaten();
    if (d.zustand !== this.zustandVorher) {
      this.zustandVorher = d.zustand;
      this.seite = 1;
    }
    const seiten: Seite[] = this.ringJetzt(d);
    if (this.seite > seiten.length) {
      this.seite = seiten.length;
    }
    this.datenseite = this.seite > 0 && this.haltText === '';
    if (!this.datenseite) {
      this.leinwandBereit = false;   // die Canvas verschwindet; die neue meldet sich mit onReady
      return;
    }
    if (!this.leinwandBereit) {
      return;
    }
    const ctx: ZeichenKontext = {
      dw: this.leinwand.width, dh: this.leinwand.height, s: d.s, el: d.el, k: d.k, jetzt: new Date(),
      pausiert: d.pausiert, idx: this.seite - 1, anzahl: seiten.length,
      t: (k: string): string => this.texte.get(k) ?? k
    };
    this.malen(zeichne(seiten[this.seite - 1], ctx));
  }

  /** Zeichenbefehle aus Seiten.ets auf der Canvas ausfuehren (Einheit vp wie die Canvas selbst). */
  private malen(befehle: Befehl[]): void {
    const c: CanvasRenderingContext2D = this.leinwand;
    c.textBaseline = 'middle';
    for (let i = 0; i < befehle.length; i++) {
      const b: Befehl = befehle[i];
      const farbe: string = b.c ?? '#ffffff';
      if (b.k === 'r') {
        c.fillStyle = farbe;
        c.fillRect(b.x ?? 0, b.y ?? 0, b.w ?? 0, b.h ?? 0);
      } else if (b.k === 't') {
        c.fillStyle = farbe;
        c.font = (b.b === true ? 'bold ' : '') + (b.s ?? 16) + 'vp sans-serif';
        c.textAlign = b.a === 'l' ? 'left' : (b.a === 'r' ? 'right' : 'center');
        c.fillText(b.txt ?? '', b.x ?? 0, b.y ?? 0);
      } else if (b.k === 'l') {
        c.strokeStyle = farbe;
        c.lineWidth = b.w ?? 1;
        c.beginPath();
        c.moveTo(b.x1 ?? 0, b.y1 ?? 0);
        c.lineTo(b.x2 ?? 0, b.y2 ?? 0);
        c.stroke();
      } else if (b.k === 'a') {
        c.strokeStyle = farbe;
        c.lineWidth = b.w ?? 1;
        c.beginPath();
        c.arc(b.cx ?? 0, b.cy ?? 0, b.r ?? 0, (b.a0 ?? 0) * Math.PI / 180, (b.a1 ?? 0) * Math.PI / 180);
        c.stroke();
      }
    }
  }

  /** Hoch/runter wischen blaettert waehrend der Aufnahme (wie Lite; rechts wischen = Zurueck). */
  private blaettern(hoch: boolean): void {
    const r: Recorder = Recorder.get();
    if (r.modus === 'bereit') {
      return;
    }
    const n: number = this.ringJetzt(r.seitenDaten()).length;
    this.seite = hoch ? Math.min(n, this.seite + 1) : Math.max(0, this.seite - 1);
    this.datenseiten();
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
    Stack() {
      if (this.datenseite) {
        Canvas(this.leinwand)
          .width('100%')
          .height('100%')
          .backgroundColor('#000000')
          .onReady(() => {
            this.leinwandBereit = true;
            this.datenseiten();
          })
      } else {
        this.bedienung()
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#000000')
    .gesture(PanGesture({ direction: PanDirection.Vertical }).onActionEnd((e: GestureEvent) => {
      this.blaettern(e.offsetY < 0);
    }))
  }

  @Builder
  bedienung() {
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
