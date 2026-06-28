import { useState } from "react";
import { Card } from "./ui";
import { useT } from "../i18n";

// Einrichtungs-Anleitung im Uhren-Bereich. Plattform oben wählen -> nur deren Abschnitt
// wird eingeblendet (anfangs alle ausgeblendet). Texte über i18n (guide.*).
const platforms = [
  { id: "garmin", label: "Garmin" },
  { id: "apple", label: "Apple Watch" },
  { id: "wear", label: "Wear OS" },
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

export function WatchGuide({ onOpenApp, onOpenConnect }: { onOpenApp?: () => void; onOpenConnect?: () => void }) {
  const t = useT();
  const [sel, setSel] = useState<string | null>(null);
  const connectLink = (
    <button type="button" onClick={onOpenConnect} className="mx-1 text-brand-400 underline hover:text-brand-300"><b>{t("guide.connect")}</b></button>
  );
  return (
    <div className="space-y-5">
      {/* Plattform-Auswahl: nur der gewählte Abschnitt wird eingeblendet. */}
      <Card className="p-5">
        <h3 className="font-semibold">{t("guide.howto")}</h3>
        <p className="mt-1 text-sm text-slate-300">{t("guide.pick")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {platforms.map((p) => {
            const active = sel === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSel(active ? null : p.id)}
                className={
                  "rounded-lg border px-3 py-1.5 text-sm " +
                  (active
                    ? "border-brand-500 bg-brand-500 text-slate-950 font-semibold"
                    : "border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700")
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Garmin */}
      {sel === "garmin" && (
      <Card id="guide-garmin" className="scroll-mt-20 p-5">
        <h3 className="text-lg font-bold text-brand-400">Garmin</h3>
        <p className="mt-1 text-sm text-slate-300">{t("guide.garminSub")}</p>
        <ol className="mt-4 space-y-3 text-sm text-slate-200">
          <li>
            <b>{t("guide.g.s1Title")}</b> {t("guide.g.s1a")}
            <button type="button" onClick={onOpenApp} className="mx-1 text-brand-400 underline hover:text-brand-300"><b>{t("guide.g.s1Download")}</b></button>
            {t("guide.g.s1b")} <a href="https://openmtp.ganeshrvel.com/" target="_blank" rel="noopener noreferrer" className="text-brand-400 underline hover:text-brand-300"><b>OpenMTP</b></a> {t("guide.g.s1c")}
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
        <ol className="mt-4 space-y-3 text-sm text-slate-200">
          <li><b>{t("guide.w.s1Title")}</b> {t("guide.w.s1")}</li>
          <li><b>{t("guide.w.s2Title")}</b> {t("guide.w.s2a")}{connectLink}{t("guide.w.s2b")}</li>
          <li><b>{t("guide.w.s3Title")}</b> {t("guide.w.s3")}</li>
          <li><b>{t("guide.w.s4Title")}</b> {t("guide.w.s4")}</li>
        </ol>
      </Card>
      )}

      {/* Verbindung & Konto — plattformübergreifend, daher immer sichtbar. */}
      <Card id="guide-pairing" className="scroll-mt-20 p-5">
        <h3 className="text-lg font-bold text-brand-400">{t("guide.pair.title")}</h3>
        <p className="mt-1 text-sm text-slate-300">{t("guide.pair.intro")}</p>
        <ul className="mt-4 space-y-3 text-sm text-slate-200">
          <li><b>{t("guide.pair.autoTitle")}</b> {t("guide.pair.auto")}</li>
          <li><b>{t("guide.pair.codeTitle")}</b> {t("guide.pair.code")}{connectLink}</li>
        </ul>
        <p className="mt-3 text-xs text-slate-400">{t("guide.pair.note")}</p>
      </Card>
    </div>
  );
}
