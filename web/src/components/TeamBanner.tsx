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
