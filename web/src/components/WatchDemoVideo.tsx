import { useT } from "../i18n";

// Demo-Clip (Garmin-Emulator) der Recorder-App. Selbst-gehostete Assets unter
// web/public — webm (klein) zuerst, mp4 (faststart) als Fallback. Bewusst KEIN
// autoplay: der Nutzer startet selbst (controls). Wird auf der Startseite und im
// Uhren-Guide eingebunden (stellvertretend für alle Plattformen).
export function WatchDemoVideo({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <figure className={`mx-auto flex max-w-[280px] flex-col items-center gap-2 ${className}`}>
      <video
        controls
        playsInline
        muted
        loop
        preload="metadata"
        poster="/watch-garmin-1.webp"
        className="w-full rounded-3xl border border-slate-800 shadow-xl"
      >
        <source src="/watch-garmin-demo.webm" type="video/webm" />
        <source src="/watch-garmin-demo.mp4" type="video/mp4" />
      </video>
      <figcaption className="text-center text-xs text-slate-500">{t("watch.demoCaption")}</figcaption>
    </figure>
  );
}
