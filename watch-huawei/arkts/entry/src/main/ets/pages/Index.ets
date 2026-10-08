/*
 * Die eine Seite des Recorders — Gegenstueck zu lite/…/pages/index, im Ablauf wie Zepp/Wear/Apple
 * (Jan, 08.10.2026: „genauso von der benutzerfuehrung … wie bei anderen uhren"):
 *   START tippen; waehrend der Aufnahme die Seitenfolge [Aktion][STOPP][Daten …][STOPP][Aktion],
 *   hoch/runter gewischt, Start auf der ersten Datenseite. Aktion = Pause/Fortsetzen (2 s halten) +
 *   Verwerfen (zweimal tippen); STOPP 2 s halten (Profil stopMode „press": tippen). Nach dem Stopp die
 *   Zusammenfassung mit FERTIG. Touch-Sperre bei Profil waterLock „on". Logik in common/Recorder.ets.
 */
import { Recorder, Zustand, SeitenDaten, Letzte } from '../common/Recorder';
import { ring, zeichne, Seite, Befehl, ZeichenKontext, Konfig } from '../common/Seiten';

// Feldbeschriftungen (Schluessel wie Seiten.ets feld) — Ressourcen f_<schluessel>.
const FELDTEXTE: string[] = ['kmh3s', 'kmhAvg', 'kmhMax', 'bpmAvg', 'bpmMax', 'time', 'dist', 'clock', 'runActive',
  'runTime', 'runDist', 'lastRunTime', 'lastRunDist', 'lastRunAvg', 'lastRunMax', 'runs', 'lastRunMaxHr',
  'allRunsDist', 'allRunsTime'];

const HALTEN_MS: number = 2000;
const SPERRE_NACH_MS: number = 10000;
const CYAN: string = '#22d3ee';
const CYAN_DUNKEL: string = '#0e7490';
const ROT: string = '#b91c1c';

function zeitText(ms: number): string {
  const s: number = Math.floor(ms / 1000);
  const h: number = Math.floor(s / 3600);
  const m: number = Math.floor((s % 3600) / 60);
  const r: number = s % 60;
  return (h > 0 ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (r < 10 ? '0' : '') + r;
}

/** Seitenfolge waehrend der Aufnahme (wie Zepp): 0 Aktion, 1 STOPP, 2 … n+1 Daten, n+2 STOPP, n+3 Aktion. */
function art(p: number, gesamt: number): string {
  if (p === 0 || p === gesamt - 1) {
    return 'aktion';
  }
  if (p === 1 || p === gesamt - 2) {
    return 'stopp';
  }
  return 'daten';
}

@Entry
@Component
struct Index {
  @State ansicht: string = 'bereit';   // bereit | aktion | stopp | daten | fertig
  @State zeit: string = '0:00';
  @State strecke: string = '0.00 km';
  @State info: string = '';
  @State balken: number = 0;
  @State balkenZeigen: boolean = false;
  @State halten: boolean = true;
  @State tPause: string = '';
  @State tStopp: string = '';
  @State tWeg: string = '';
  @State fZeit: string = '';
  @State fStrecke: string = '';
  @State fLaeufe: string = '';
  @State gesperrt: boolean = false;
  @State sperrHinweis: boolean = false;
  private seite: number = 2;
  private zustandVorher: string = '';
  private texte: Map<string, string> = new Map<string, string>();
  private leinwandBereit: boolean = false;
  private einstellungen: RenderingContextSettings = new RenderingContextSettings(true);
  private leinwand: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.einstellungen);
  private haltAktion: string = '';
  private haltUhr: number = -1;
  private wegScharf: boolean = false;
  private wegUhr: number = -1;
  private hinweisUhr: number = -1;
  private zeigeFertig: boolean = false;
  private letzteBedienung: number = 0;
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

  /**
   * Zurueck/rechts wischen: waehrend der Aufnahme zur STOPP-Seite (wie Zepp BACK), nie beenden; steht die
   * Zusammenfassung, schliesst es diese; sonst darf die App zu.
   */
  onBackPress(): boolean {
    if (Recorder.get().modus !== 'bereit') {
      if (!this.sperre()) {
        this.seite = 1;
        this.zeigen();
      }
      return true;
    }
    if (this.zeigeFertig) {
      this.fertig();
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
    const r: Recorder = Recorder.get();
    if (r.taktSeiten()) {
      this.seite = 2;   // Lauf begonnen/beendet -> erste Datenseite (wie Zepp)
    }
    if (r.leerlauf()) {   // Auto-Start (Profil), wie Zepp
      this.seite = 2;
      this.zeigeFertig = false;
      if (r.konfigJetzt().waterLock === 'on') {
        this.gesperrt = true;
      }
    }
    const z: Zustand = r.zustand();
    const k: Konfig = r.konfigJetzt();
    const pausiert: boolean = z.modus === 'pause';
    this.zeit = (pausiert ? this.t($r('app.string.paused')) + ' ' : '') + zeitText(z.ms);
    this.strecke = (z.m / 1000).toFixed(2) + ' km';
    this.halten = k.stopMode !== 'press';
    const zwei: string = this.halten ? ' · 2 s' : '';
    const pa: string = this.haltAktion;
    this.tPause = pa === 'pause' || pa === 'weiter' ? this.t($r('app.string.holding'))
      : (pausiert ? this.t($r('app.string.resume')) : this.t($r('app.string.pause'))) + zwei;
    this.tStopp = pa === 'stopp' ? this.t($r('app.string.holding')) : this.t($r('app.string.stop')) + zwei;
    this.tWeg = this.t($r('app.string.discard')) + (this.wegScharf ? '?' : '');
    this.info = this.sperrHinweis ? this.t($r('app.string.lock')) + ' · ' + this.t($r('app.string.lockHold'))
      : this.infoZeile(z);
    this.sperreTakt(z.modus, k);
    // Balken nur ausserhalb der Aufnahme (waehrend der Fahrt zappelte er zwischen 0/1 und 1/1).
    this.balkenZeigen = z.modus === 'bereit' && z.offen > 0 && z.plan.gesamt > 0;
    this.balken = z.plan.gesamt > 0 ? Math.floor(100 * z.plan.fertig / z.plan.gesamt) : 0;
    this.seiten();
  }

  /** Eine Zeile Zustand, Vorrang wie Lite (recorder.js infoZeile): Fehler > GPS > verworfen > Uebertragung. */
  private infoZeile(z: Zustand): string {
    if (z.fehler > 0) {
      return this.t($r('app.string.errors')) + ' ' + z.fehler + ': ' + z.letzterFehler;
    }
    if (z.modus === 'laeuft' && !z.gpsOk) {
      return this.t($r('app.string.gpsWait'));
    }
    if (z.modus === 'bereit' && z.verworfen > 0 && Date.now() - z.verworfen < 10000) {
      return this.t($r('app.string.discarded'));
    }
    const handy: string = this.t($r('app.string.openPhone'));   // ohne Fehlercode (wie Lite)
    if (z.offen > 0) {
      return z.plan.fertig + '/' + z.plan.gesamt + (z.sendeFehler > 0 ? ' · ' + handy : '');
    }
    if (z.modus === 'bereit') {
      return z.sendeFehler > 0 ? handy : this.t($r('app.string.allSent'));
    }
    return '';
  }

  private seiten(): void {
    const r: Recorder = Recorder.get();
    if (r.modus === 'bereit') {
      const l: Letzte | null = r.letzte;
      this.ansicht = this.zeigeFertig && l !== null ? 'fertig' : 'bereit';
      if (l !== null && this.ansicht === 'fertig') {
        this.fZeit = zeitText(l.ms);
        this.fStrecke = (l.m / 1000).toFixed(2) + ' km';
        this.fLaeufe = l.kmh.toFixed(1) + ' km/h · ' + l.laeufe + ' ' + (this.texte.get('runs') ?? 'Runs');
      }
      this.seite = 2;
      this.zustandVorher = '';
      this.leinwandBereit = false;
      return;
    }
    const d: SeitenDaten = r.seitenDaten();
    // Pause <-> Fahrt: auf die erste Datenseite des neuen Zustands (wie Zepp/Wear).
    if (d.zustand !== this.zustandVorher) {
      if (this.zustandVorher === 'p' || d.zustand === 'p') {
        this.seite = 2;
      }
      this.zustandVorher = d.zustand;
    }
    const seiten: Seite[] = ring(d.k, d.zustand);
    const gesamt: number = seiten.length + 4;
    this.seite = Math.max(0, Math.min(gesamt - 1, this.seite));
    const neu: string = art(this.seite, gesamt);
    if (neu !== 'daten') {
      this.leinwandBereit = false;   // die Canvas verschwindet; die neue meldet sich mit onReady
    }
    this.ansicht = neu;
    if (neu !== 'daten' || !this.leinwandBereit) {
      return;
    }
    const ctx: ZeichenKontext = {
      dw: this.leinwand.width, dh: this.leinwand.height, s: d.s, el: d.el, k: d.k, jetzt: new Date(),
      pausiert: d.pausiert, idx: this.seite - 2, anzahl: seiten.length,
      t: (k: string): string => this.texte.get(k) ?? k
    };
    const b: Befehl[] = zeichne(seiten[this.seite - 2], ctx);
    if (this.gesperrt) {   // Touch-Sperre auf den Datenseiten sichtbar (wie Zepps Zeile unten)
      b.push({ k: 't', x: ctx.dw / 2, y: Math.round(ctx.dh * 0.86), s: 16, c: '#fbbf24', a: 'c', b: false,
        txt: this.sperrHinweis ? this.t($r('app.string.lockHold')) : this.t($r('app.string.lock')) });
    }
    this.malen(b);
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

  // --- Touch-Sperre wie Zepp (Profil waterLock „on"): ab Start gesperrt, nach 10 s ohne Bedienung wieder.
  private sperreTakt(modus: string, k: Konfig): void {
    if (modus === 'bereit') {
      this.gesperrt = false;
      this.sperrHinweis = false;
      return;
    }
    if (k.waterLock === 'on' && !this.gesperrt && Date.now() - this.letzteBedienung > SPERRE_NACH_MS) {
      this.gesperrt = true;
    }
  }

  /** true = gesperrt, die Bedienung wird geschluckt (und erklaert). */
  private sperre(): boolean {
    if (!this.gesperrt) {
      this.letzteBedienung = Date.now();
      return false;
    }
    this.sperrHinweis = true;
    clearTimeout(this.hinweisUhr);
    this.hinweisUhr = setTimeout(() => {
      this.sperrHinweis = false;
      this.zeigen();
    }, 3000);
    this.zeigen();
    return true;
  }

  private entsperren(): void {
    this.gesperrt = false;
    this.sperrHinweis = false;
    this.letzteBedienung = Date.now();
    this.zeigen();
  }

  // --- Bedienung -----------------------------------------------------------------------------
  private blaettern(hoch: boolean): void {
    if (Recorder.get().modus === 'bereit' || this.sperre()) {
      return;
    }
    this.seite += hoch ? 1 : -1;   // ohne Umlauf; seiten() begrenzt
    this.zeigen();
  }

  private starten(): void {
    const r: Recorder = Recorder.get();
    if (r.modus !== 'bereit') {
      return;
    }
    this.zeigeFertig = false;
    this.seite = 2;
    r.start();
    this.letzteBedienung = Date.now();
    if (r.konfigJetzt().waterLock === 'on') {
      this.gesperrt = true;   // wie Zepp: sperrt gleich beim Start
    }
    this.zeigen();
  }

  private fertig(): void {
    this.zeigeFertig = false;
    this.zeigen();
  }

  private pauseAktion(): string {
    return Recorder.get().modus === 'pause' ? 'weiter' : 'pause';
  }

  private ausfuehren(aktion: string): void {
    const r: Recorder = Recorder.get();
    if (aktion === 'pause') {
      r.pause();
    } else if (aktion === 'weiter') {
      r.weiter();
    } else if (aktion === 'stopp') {
      r.stopp();
      this.zeigeFertig = true;   // Verwerfen: keine Zusammenfassung (wie Zepp/Wear)
    } else if (aktion === 'verwerfen') {
      r.verwerfen();
    }
    this.zeigen();
  }

  /** 2 s halten (Pause/Fortsetzen, STOPP). Der Knopf zeigt „Halten …", bis es ausloest. */
  private halteStart(aktion: string): void {
    if (this.sperre()) {
      return;
    }
    clearTimeout(this.haltUhr);
    this.haltAktion = aktion;
    this.zeigen();
    this.haltUhr = setTimeout(() => {
      this.haltAktion = '';
      this.ausfuehren(aktion);
    }, HALTEN_MS);
  }

  private loslassen(): void {
    clearTimeout(this.haltUhr);
    if (this.haltAktion !== '') {
      this.haltAktion = '';
      this.zeigen();
    }
  }

  /** Verwerfen wie Zepp: erster Tipp macht scharf („Verwerfen?"), zweiter binnen 4 s verwirft. */
  private verwerfenTipp(): void {
    if (this.sperre()) {
      return;
    }
    clearTimeout(this.wegUhr);
    if (this.wegScharf) {
      this.wegScharf = false;
      this.ausfuehren('verwerfen');
      return;
    }
    this.wegScharf = true;
    this.wegUhr = setTimeout(() => {
      this.wegScharf = false;
      this.zeigen();
    }, 4000);
    this.zeigen();
  }

  @Builder
  knopf(text: string, farbe: string, aktion: string) {
    if (this.halten) {
      Button(text).width(200).height(56).fontSize(20).fontColor('#ffffff').backgroundColor(farbe)
        .margin({ top: 8 })
        .onTouch((e: TouchEvent) => {
          if (e.type === TouchType.Down) {
            this.halteStart(aktion === 'pause' ? this.pauseAktion() : aktion);
          } else if (e.type === TouchType.Up || e.type === TouchType.Cancel) {
            this.loslassen();
          }
        })
    } else {
      Button(text).width(200).height(56).fontSize(20).fontColor('#ffffff').backgroundColor(farbe)
        .margin({ top: 8 })
        .onClick(() => {
          if (!this.sperre()) {
            this.ausfuehren(aktion === 'pause' ? this.pauseAktion() : aktion);
          }
        })
    }
  }

  @Builder
  infoText() {
    Text(this.info).fontSize(16).fontColor('#cbd5e1').textAlign(TextAlign.Center).width(260).maxLines(3)
      .margin({ top: 8 })
  }

  build() {
    Stack() {
      if (this.ansicht === 'daten') {
        Canvas(this.leinwand)
          .width('100%')
          .height('100%')
          .backgroundColor('#000000')
          .onReady(() => {
            this.leinwandBereit = true;
            this.seiten();
          })
      } else {
        this.bedienung()
      }
      // Touch-Sperre: durchsichtige Flaeche ueber allem, schluckt Tippen (Hinweis), 2 s halten = frei.
      if (this.gesperrt) {
        Column()
          .width('100%')
          .height('100%')
          .onClick(() => {
            this.sperre();
          })
          .gesture(LongPressGesture({ duration: HALTEN_MS }).onAction(() => {
            this.entsperren();
          }))
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
      if (this.ansicht === 'bereit') {
        Text('PUMPFOIL').fontSize(20).fontColor(CYAN).margin({ bottom: 4 })
        Button(this.t($r('app.string.start'))).width(200).height(56).fontSize(20).fontColor('#ffffff')
          .backgroundColor(CYAN_DUNKEL).margin({ top: 8 })
          .onClick(() => this.starten())
        if (this.balkenZeigen) {
          Progress({ value: this.balken, total: 100, type: ProgressType.Linear })
            .width(200).color(CYAN).margin({ top: 10 })
        }
      } else if (this.ansicht === 'fertig') {
        Text(this.fZeit).fontSize(30).fontColor('#ffffff')
        Text(this.fStrecke).fontSize(20).fontColor('#ffffff')
        Text(this.fLaeufe).fontSize(16).fontColor('#94a3b8')
        Button(this.t($r('app.string.done'))).width(200).height(56).fontSize(20).fontColor('#ffffff')
          .backgroundColor(CYAN_DUNKEL).margin({ top: 8 })
          .onClick(() => this.fertig())
      } else if (this.ansicht === 'aktion') {
        Text(this.zeit).fontSize(28).fontColor('#ffffff')
        this.knopf(this.tPause, CYAN_DUNKEL, 'pause')
        Button(this.tWeg).width(200).height(56).fontSize(20).fontColor('#ffffff').backgroundColor(ROT)
          .margin({ top: 8 })
          .onClick(() => this.verwerfenTipp())
      } else {
        Text(this.zeit).fontSize(28).fontColor('#ffffff')
        Text(this.strecke).fontSize(24).fontColor('#ffffff')
        this.knopf(this.tStopp, ROT, 'stopp')
      }
      this.infoText()
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .backgroundColor('#000000')
  }
}
