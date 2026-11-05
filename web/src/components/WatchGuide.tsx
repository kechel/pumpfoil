import { Reiterleiste, useReiter } from "./Reiter";
import { GarminBeidesHinweis } from "./GarminBeides";
import { WatchMatrix } from "./WatchMatrix";
import { Card } from "./ui";
import { useT } from "../i18n";
import { WatchDemoVideo } from "./WatchDemoVideo";
import { ConnectIqButton } from "./ConnectIqButton";
import { AppGalleryBadge, AppStoreBadge, PlayBadge, ZeppAppBadges } from "./StoreBadge";

// Einrichtungs-Anleitung im Uhren-Bereich. Plattform oben wählen -> nur deren Abschnitt
// wird eingeblendet (anfangs alle ausgeblendet). Texte über i18n (guide.*).
const platforms = [
  { id: "garmin", label: "Garmin" },
  { id: "apple", label: "Apple Watch" },
  { id: "wear", label: "Wear OS" },
  { id: "amazfit", label: "Amazfit" },
  { id: "huawei", label: "Huawei" },
];

// Garmin-Anleitungs-Screenshots (v1.0.24, rund) — Captions über i18n (guide.cap.*).
const garminShots = [
  { src: "/guide/garmin/start.webp", cap: "guide.cap.gStart" },
  { src: "/guide/garmin/settings.webp", cap: "guide.cap.gSettings" },
  { src: "/guide/garmin/pairing-code.webp", cap: "guide.cap.gPairCode" },
  { src: "/guide/garmin/pairing-success.webp", cap: "guide.cap.gPairOk" },
  { src: "/guide/garmin/alarm-1.webp", cap: "guide.cap.gAlarm1" },
  { src: "/guide/garmin/alarm-2.webp", cap: "guide.cap.gAlarm2" },
  { src: "/guide/garmin/alarm-3.webp", cap: "guide.cap.gAlarm3" },
  { src: "/guide/garmin/on-foil-1.webp", cap: "guide.cap.onFoil" },
  { src: "/guide/garmin/on-foil-2.webp", cap: "guide.cap.onFoil" },
];

// Wear-OS-Anleitungs-Screenshots (rund, wie Garmin). Flow: Verbinden -> Start ->
// Alarm -> Daten -> Übersicht -> Lauf -> Stopp.
const wearShots = [
  { src: "/guide/wear/connect.webp", cap: "guide.cap.wConnect" },
  { src: "/guide/wear/start.webp", cap: "guide.cap.wStart" },
  { src: "/guide/wear/alarm.webp", cap: "guide.cap.wAlarm" },
  { src: "/guide/wear/data.webp", cap: "guide.cap.onFoil" },
  { src: "/guide/wear/stats.webp", cap: "guide.cap.wStats" },
  { src: "/guide/wear/run.webp", cap: "guide.cap.wRun" },
  { src: "/guide/wear/stop.webp", cap: "guide.cap.wStop" },
];

// Apple-Watch-Anleitungs-Screenshots (rechteckig).
const appleShots = [
  { src: "/guide/apple/connect.webp", cap: "guide.cap.aConnect" },
  { src: "/guide/apple/code.webp", cap: "guide.cap.aCode" },
  { src: "/guide/apple/start.webp", cap: "guide.cap.aStart" },
  { src: "/guide/apple/alarm.webp", cap: "guide.cap.aAlarm" },
  { src: "/guide/apple/data-1.webp", cap: "guide.cap.onFoil" },
  { src: "/guide/apple/data-2.webp", cap: "guide.cap.onFoil" },
  { src: "/guide/apple/stop.webp", cap: "guide.cap.aStop" },
  { src: "/guide/apple/upload.webp", cap: "guide.cap.aUpload" },
];

// Amazfit: Koppeln aus der Fassung 1.0.6 (eckig, aus der Zepp-Rueckmeldung — neuere gibt es noch nicht), der
// Rest aus 1.0.13 (rund). Eckige Bilder bekommen abgerundete Ecken statt eines Kreises.
const amazfitShots = [
  { src: "/guide/amazfit/pair-code.webp", cap: "guide.cap.gPairCode", eckig: true },
  { src: "/guide/amazfit/pair-ok.webp", cap: "guide.cap.gPairOk", eckig: true },
  { src: "/watch-amazfit-v2-7.webp", cap: "guide.cap.wStart" },
  { src: "/watch-amazfit-v2-1.webp", cap: "guide.cap.onFoil" },
  { src: "/watch-amazfit-v2-2.webp", cap: "guide.cap.onFoil" },
  { src: "/watch-amazfit-v2-3.webp", cap: "guide.cap.onFoil" },
  { src: "/watch-amazfit-v2-6.webp", cap: "guide.cap.wRun" },
  { src: "/watch-amazfit-v2-8.webp", cap: "guide.cap.wStats" },
  { src: "/watch-amazfit-v2-4.webp", cap: "guide.cap.wStop" },
];

// HUAWEI WATCH 5 (rund, aus dem DevEco-Emulator 13.10.2026, Fassung 1.0.2). Bildunterschriften wie Wear OS,
// der Ablauf ist derselbe: Code koppeln -> Start -> Daten -> Stopp -> Upload.
const huaweiShots = [
  { src: "/guide/huawei/connect.webp", cap: "guide.cap.wConnect" },
  { src: "/guide/huawei/start.webp", cap: "guide.cap.wStart" },
  { src: "/guide/huawei/data-1.webp", cap: "guide.cap.onFoil" },
  { src: "/guide/huawei/data-2.webp", cap: "guide.cap.onFoil" },
  { src: "/guide/huawei/run.webp", cap: "guide.cap.wRun" },
  { src: "/guide/huawei/stop.webp", cap: "guide.cap.wStop" },
  { src: "/guide/huawei/upload.webp", cap: "guide.cap.aUpload" },
];

export function WatchGuide({ onOpenApp, onOpenConnect }: { onOpenApp?: () => void; onOpenConnect?: () => void }) {
  const t = useT();
  // Hinter den Plattformen die Kompatibilitaetsliste (Jan, 02.11.2026; vorher ein Reiter eine Ebene hoeher).
  const [sel, setSel] = useReiter("uhrguide", [...platforms.map((p) => p.id), "compat"], platforms[0].id, { param: "plattform" });
  const connectLink = (
    <button type="button" onClick={onOpenConnect} className="mx-1 text-brand-400 underline hover:text-brand-600 dark:hover:text-brand-300"><b>{t("guide.connect")}</b></button>
  );
  return (
    <div className="space-y-5">
      {/* Plattform als einfache Reiter (Jan, 02.11.2026), vorher Knoepfe in einer Karte. Gewaehlt bleibt sie in der Adresse. */}
      <div>
        <Reiterleiste aktiv={sel} onWahl={setSel} reiter={[...platforms.map((p) => ({ id: p.id, label: p.label })), { id: "compat", label: t("account.tabCompat") }]} className="!mb-0" />
      </div>

      {sel === "compat" && (
        <Card className="p-5">
          <h3 className="mb-1 font-semibold">{t("watches.title")}</h3>
          <p className="mb-4 text-sm text-slate-300">{t("watches.intro")}</p>
          <WatchMatrix />
        </Card>
      )}

      {/* Garmin */}
      {sel === "garmin" && (
      <Card id="guide-garmin" className="scroll-mt-20 p-5">
        <h3 className="text-lg font-bold text-brand-400">Garmin</h3>
        <p className="mt-1 text-sm text-slate-300">{t("guide.garminSub")}</p>
        <div className="mt-3 rounded-xl border border-brand-500/30 bg-brand-500/10 p-3">
          <p className="mb-2 text-sm text-slate-200">{t("guide.g.storeLead")}</p>
          <ConnectIqButton />
        </div>
        <div className="mt-3"><GarminBeidesHinweis zu="gc" /></div>
        <p className="mt-4 text-xs font-medium text-slate-400">{t("guide.g.manualLead")}</p>
        <ol className="mt-2 space-y-3 text-sm text-slate-200">
          <li>
            <b>{t("guide.g.s1Title")}</b> {t("guide.g.s1a")}
            <button type="button" onClick={onOpenApp} className="mx-1 text-brand-400 underline hover:text-brand-600 dark:hover:text-brand-300"><b>{t("guide.g.s1Download")}</b></button>
            {t("guide.g.s1b")} <a href="https://openmtp.ganeshrvel.com/" target="_blank" rel="noopener noreferrer" className="text-brand-400 underline hover:text-brand-600 dark:hover:text-brand-300"><b>OpenMTP</b></a> {t("guide.g.s1c")}
            <code className="mx-1 rounded bg-slate-800 px-1">GARMIN/APPS/</code>{t("guide.g.s1d")}
          </li>
          <li><b>{t("guide.g.s2Title")}</b> {t("guide.g.s2")}</li>
          <li><b>{t("guide.g.s3Title")}</b> {connectLink}{t("guide.g.s3")}</li>
          <li><b>{t("guide.g.s4Title")}</b> {t("guide.g.s4")}</li>
          <li><b>{t("guide.g.s5Title")}</b> {t("guide.g.s5")}</li>
          <li><b>{t("guide.g.s6Title")}</b> {t("guide.g.s6")}</li>
        </ol>
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-slate-400">{t("guide.previewVer")}</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {garminShots.map((s, i) => (
              <figure key={`${s.src}-${i}`} className="flex flex-col items-center gap-1">
                <img src={s.src} alt={t(s.cap)} loading="lazy"
                  className="w-full rounded-full border border-slate-800 shadow" />
                <figcaption className="text-center text-[11px] leading-tight text-slate-500">{t(s.cap)}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </Card>
      )}

      {/* Apple Watch */}
      {sel === "apple" && (
      <Card id="guide-apple" className="scroll-mt-20 p-5">
        <h3 className="text-lg font-bold text-brand-400">Apple Watch</h3>
        <p className="mt-1 text-sm text-slate-300">{t("guide.appleSub")}</p>
        <AppStoreBadge className="mt-3" />
        <ol className="mt-4 space-y-3 text-sm text-slate-200">
          <li><b>{t("guide.a.s1Title")}</b> {t("guide.a.s1")}</li>
          <li><b>{t("guide.a.s2Title")}</b> {t("guide.a.s2a")}{connectLink}{t("guide.a.s2b")}</li>
          <li><b>{t("guide.a.s3Title")}</b> {t("guide.a.s3")}</li>
          <li><b>{t("guide.a.s4Title")}</b> {t("guide.a.s4")}</li>
        </ol>
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-slate-400">{t("guide.preview")}</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {appleShots.map((s, i) => (
              <figure key={`${s.src}-${i}`} className="flex flex-col items-center gap-1">
                <img src={s.src} alt={t(s.cap)} loading="lazy"
                  className="w-full rounded-2xl border border-slate-800 shadow" />
                <figcaption className="text-center text-[11px] leading-tight text-slate-500">{t(s.cap)}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </Card>
      )}

      {/* Wear OS */}
      {sel === "wear" && (
      <Card id="guide-wear" className="scroll-mt-20 p-5">
        <h3 className="text-lg font-bold text-brand-400">Wear OS</h3>
        <p className="mt-1 text-sm text-slate-300">{t("guide.wearSub")}</p>
        <PlayBadge className="mt-3" />
        <ol className="mt-4 space-y-3 text-sm text-slate-200">
          <li>
            <b>{t("guide.w.s1Title")}</b> {t("guide.w.s1")}
            {/* Phone- und Wear-App teilen die applicationId -> wer am Handy installiert, bekommt
                die Handy-App und wartet vergeblich auf die Uhr. Feedback 05.08. */}
            <div className="mt-1 text-sm text-amber-700 dark:text-amber-300">{t("guide.w.s1Note")}</div>
          </li>
          <li><b>{t("guide.w.s2Title")}</b> {t("guide.w.s2a")}{connectLink}{t("guide.w.s2b")}</li>
          <li><b>{t("guide.w.s3Title")}</b> {t("guide.w.s3")}</li>
          <li><b>{t("guide.w.s4Title")}</b> {t("guide.w.s4")}</li>
        </ol>
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-slate-400">{t("guide.preview")}</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {wearShots.map((s, i) => (
              <figure key={`${s.src}-${i}`} className="flex flex-col items-center gap-1">
                <img src={s.src} alt={t(s.cap)} loading="lazy"
                  className="w-full rounded-full border border-slate-800 shadow" />
                <figcaption className="text-center text-[11px] leading-tight text-slate-500">{t(s.cap)}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </Card>
      )}

      {/* Amazfit / Zepp OS */}
      {sel === "amazfit" && (
      <Card id="guide-amazfit" className="scroll-mt-20 p-5">
        <h3 className="text-lg font-bold text-brand-400">Amazfit</h3>
        <p className="mt-1 text-sm text-slate-300">{t("guide.amazfitSub")}</p>
        <div className="mt-3 rounded-xl border border-brand-500/30 bg-brand-500/10 p-3">
          <p className="mb-2 text-sm text-slate-200">{t("guide.z.store")}</p>
          <ZeppAppBadges />
        </div>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-slate-200">
          <li>{t("guide.z.s1")}</li>
          <li>{t("guide.z.s2")}</li>
          <li>{t("guide.z.s3")}{connectLink}</li>
          <li>{t("guide.z.s4")}</li>
        </ol>
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-slate-400">{t("guide.preview")}</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {amazfitShots.map((s, i) => (
              <figure key={`${s.src}-${i}`} className="flex flex-col items-center gap-1">
                <img src={s.src} alt={t(s.cap)} loading="lazy"
                  className={`w-full border border-slate-800 shadow ${s.eckig ? "rounded-2xl" : "rounded-full"}`} />
                <figcaption className="text-center text-[11px] leading-tight text-slate-500">{t(s.cap)}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </Card>
      )}

      {/* HUAWEI WATCH 5 (AppGallery seit 04.11.2026). GT/Fit/D und Watch 3/4 hier bewusst nicht: GT wartet auf
          Huaweis Wear-Engine-Freigabe, Watch 3/4 wird nicht eingereicht (docs/HUAWEI.md). */}
      {sel === "huawei" && (
      <Card id="guide-huawei" className="scroll-mt-20 p-5">
        <h3 className="text-lg font-bold text-brand-400">HUAWEI WATCH 5</h3>
        <p className="mt-1 text-sm text-slate-300">{t("guide.huaweiSub")}</p>
        {/* Bis 05.11.2026 stand hier ein nachgebauter Store-Eintrag (Icon, Name, Untertitel), weil wir kein Badge hatten.
            Jetzt das AppGallery-Badge wie die Store-Badges der anderen Reiter (Jan, Screenshot 05.11.). */}
        <AppGalleryBadge className="mt-3" />
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-slate-200">
          <li>{t("guide.h.s1")}</li>
          <li>{t("guide.h.s2")}{connectLink}</li>
          <li>{t("guide.h.s3")}</li>
          <li>{t("guide.h.s4")}</li>
        </ol>
        <div className="mt-5">
          <p className="mb-2 text-xs font-medium text-slate-400">{t("guide.preview")}</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
            {huaweiShots.map((s, i) => (
              <figure key={`${s.src}-${i}`} className="flex flex-col items-center gap-1">
                <img src={s.src} alt={t(s.cap)} loading="lazy"
                  className="w-full rounded-full border border-slate-800 shadow" />
                <figcaption className="text-center text-[11px] leading-tight text-slate-500">{t(s.cap)}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </Card>
      )}

      {sel !== "compat" && <>
      {/* Verbindung & Konto — plattformübergreifend, daher immer sichtbar. */}
      <Card id="guide-pairing" className="scroll-mt-20 p-5">
        <h3 className="text-lg font-bold text-brand-400">{t("guide.pair.title")}</h3>
        <p className="mt-1 text-sm text-slate-300">{t("guide.pair.intro")}</p>
        <ul className="mt-4 space-y-3 text-sm text-slate-200">
          <li><b>{t("guide.pair.autoTitle")}</b> {t("guide.pair.auto")}</li>
          <li><b>{t("guide.pair.codeTitle")}</b> {t("guide.pair.code")}{connectLink}</li>
          <li><b>{t("guide.pair.relinkTitle")}</b> {t("guide.pair.relink")}</li>
        </ul>
        <p className="mt-3 text-xs text-slate-400">{t("guide.pair.note")}</p>
      </Card>

      {/* Was sich AN DER UHR einstellen laesst — gehoert direkt hinter das Verbinden, weil es
          erst danach geht. Anlass (Jan, 17.08.): eine Rezension klagte ueber Akkuverbrauch,
          waehrend die Gegenmassnahme seit Wochen existierte — `gnss_mode` stand bei ALLEN 115
          Garmin-Uhren auf NULL, es hatte also nie jemand umgestellt. Die Einstellung war nicht das
          Problem, ihre Auffindbarkeit war es. Plattformuebergreifend sichtbar, aber je Punkt mit
          Plattform benannt: die Stellschrauben sind NICHT ueberall dieselben (Satellitensysteme
          nur Garmin, und Amazfit holt sich den Aufzeichnungsmodus noch gar nicht ab). */}
      <Card id="guide-settings" className="scroll-mt-20 p-5">
        <h3 className="text-lg font-bold text-brand-400">{t("guide.settings.title")}</h3>
        <p className="mt-1 text-slate-300">{t("guide.settings.intro")}{connectLink}{t("guide.settings.intro2")}</p>
        <ul className="mt-4 space-y-3 text-slate-200">
          <li><b>{t("guide.settings.recordTitle")}</b> {t("guide.settings.record")}</li>
          <li><b>{t("guide.settings.gnssTitle")}</b> {t("guide.settings.gnss")}</li>
        </ul>
        <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-amber-700 dark:text-amber-300">
          {t("guide.settings.gpsWarn")}
        </p>
        <p className="mt-3 text-slate-300">{t("guide.settings.zepp")}</p>
      </Card>

      {/* Nach der Session: WANN laedt die Uhr hoch — der Schritt, den die meisten nicht verstehen
          (Jan, 01.08.; drei Nutzer-Meldungen mit demselben Muster: Session "fehlt", lag aber nur
          noch auf der Uhr, weil der Upload nur im Vordergrund laeuft). Plattformuebergreifend. */}
      <Card id="guide-sync" className="scroll-mt-20 p-5">
        <h3 className="text-lg font-bold text-brand-400">{t("guide.sync.title")}</h3>
        <ul className="mt-4 space-y-3 text-slate-200">
          <li><b>{t("guide.sync.nowTitle")}</b> {t("guide.sync.now")}</li>
          <li><b>{t("guide.sync.retryTitle")}</b> {t("guide.sync.retry")}</li>
          <li><b>{t("guide.sync.laterTitle")}</b> {t("guide.sync.later")}</li>
        </ul>
        <p className="mt-3 text-slate-300">{t("guide.sync.note")}</p>
      </Card>

      {/* Demo-Clip ganz unten, rund (passt zur runden Uhr). */}
      <Card className="p-5">
        <WatchDemoVideo title={t("watch.demoTitle")} round />
      </Card>
      </>}
    </div>
  );
}
