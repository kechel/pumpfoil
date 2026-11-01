import { useEffect, useState } from "react";
// Teambild ueber dem Teamkopf (01.11.2026). Das Bild wird nie zugeschnitten gespeichert; angezeigt wird es mit
// fester Hoehe ueber die volle Breite, und der Fokuspunkt ("x,y" in Prozent, von der Teamleitung gewaehlt)
// bleibt dabei immer sichtbar — so passt dasselbe Bild auf Handy (breit ~2,5:1) wie Rechner (~4:1).
// Kein Verlauf darueber (Markenregel: keine Verlaeufe); Wappen und Name stehen darunter, nicht darauf.

export function fokusPosition(fokus: string | null | undefined): string {
  const [x, y] = (fokus || "50,50").split(",").map((v) => Math.max(0, Math.min(100, Number(v) || 50)));
  return `${x}% ${y}%`;
}

/** Hoehen der Anzeige: auf dem Handy 140 px, ab sm 220 px. Die Vorschau in den Einstellungen nutzt dieselben. */
export const BANNER_HOEHE = "h-[140px] sm:h-[220px]";

export default function TeamBanner({ url, fokus, className = "" }: { url: string; fokus: string | null | undefined; className?: string }) {
  return (
    <img src={url} alt="" loading="lazy" style={{ objectPosition: fokusPosition(fokus) }}
      className={`block w-full rounded-2xl object-cover ${BANNER_HOEHE} ${className}`} />
  );
}

/** Teambild in einem festen Seitenverhaeltnis — fuer die Vorschau „so sieht es auf dem Handy / am Rechner aus“. */
export function BannerVorschau({ url, fokus, verhaeltnis, titel }: { url: string; fokus: string | null | undefined; verhaeltnis: number; titel: string }) {
  return (
    <figure className="min-w-0 flex-1">
      <img src={url} alt="" style={{ objectPosition: fokusPosition(fokus), aspectRatio: String(verhaeltnis) }}
        className="block w-full rounded-lg object-cover" />
      <figcaption className="mt-1 text-xs text-slate-400">{titel}</figcaption>
    </figure>
  );
}

const knopf = "rounded-xl border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50";

/** Bild hochladen, Fokuspunkt antippen, Vorschau fuer Handy und Rechner, entfernen — fuer Team- und Eventbild. */
export function BannerBearbeiten({ url, fokus: fokusIn, t, hochladen, fokusSetzen, entfernen, onFehler, texte = "team.banner" }: {
  url: string | null; fokus: string | null; t: (k: string) => string;
  hochladen: (f: File) => Promise<unknown>; fokusSetzen: (f: string) => Promise<unknown>; entfernen: () => Promise<unknown>;
  /** Schluessel-Praefix der Texte (titel, hinweis, hochladen, entfernen): Teambild oder Eventbild */
  onFehler: (e: unknown) => void; texte?: "team.banner" | "team.eventbild";
}) {
  const [fokus, setFokus] = useState(fokusIn || "50,50");
  useEffect(() => setFokus(fokusIn || "50,50"), [fokusIn]);
  const setzen = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 100);
    const y = Math.round(Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) * 100);
    const f = `${x},${y}`;
    setFokus(f);
    fokusSetzen(f).catch(onFehler);
  };
  const [fx, fy] = fokus.split(",");
  return (
    <div className="mb-3">
      <p className="mb-1 text-sm text-slate-300">{t(`${texte}.titel`)}</p>
      <p className="mb-2 text-xs text-slate-400">{t(`${texte}.hinweis`)}</p>
      {url && (
        <>
          <div className="relative mb-2 cursor-crosshair overflow-hidden rounded-lg" onClick={setzen}>
            <img src={url} alt="" className="block w-full select-none" draggable={false} />
            <span className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/40 shadow"
              style={{ left: `${fx}%`, top: `${fy}%` }} />
          </div>
          <div className="mb-2 flex gap-3">
            <BannerVorschau url={url} fokus={fokus} verhaeltnis={2.5} titel={t("team.banner.handy")} />
            <BannerVorschau url={url} fokus={fokus} verhaeltnis={4} titel={t("team.banner.rechner")} />
          </div>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <label className={`${knopf} cursor-pointer`}>
          {t(`${texte}.hochladen`)}
          <input type="file" accept="image/*" className="hidden" onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) hochladen(f).catch(onFehler);
          }} />
        </label>
        {url && <button className={knopf} onClick={() => entfernen().catch(onFehler)}>{t(`${texte}.entfernen`)}</button>}
      </div>
    </div>
  );
}
