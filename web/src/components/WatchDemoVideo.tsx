// Demo-Clip (Garmin-Emulator) der Recorder-App. Selbst-gehostete Assets unter
// web/public — webm (klein) zuerst, mp4 (faststart) als Fallback. Bewusst KEIN
// autoplay: der Nutzer startet selbst (controls). Wird auf der Startseite und im
// Uhren-Guide eingebunden (stellvertretend für alle Plattformen).
export function WatchDemoVideo({ className = "", title, round = false }: { className?: string; title?: string; round?: boolean }) {
  return (
    <figure className={`mx-auto flex max-w-[280px] flex-col items-center gap-3 ${className}`}>
      {title && (
        <figcaption className="text-center text-xl font-bold text-slate-100 sm:text-2xl">{title}</figcaption>
      )}
      <video
        controls
        playsInline
        muted
        loop
        preload="metadata"
        poster="/watch-garmin-1.webp"
        className={`w-full border border-slate-800 shadow-xl ${round ? "aspect-square rounded-full object-cover" : "rounded-3xl"}`}
      >
        <source src="/watch-garmin-demo.webm" type="video/webm" />
        <source src="/watch-garmin-demo.mp4" type="video/mp4" />
      </video>
    </figure>
  );
}
