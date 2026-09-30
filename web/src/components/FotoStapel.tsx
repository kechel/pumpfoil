import { useState } from "react";
import { Lightbox } from "./Lightbox";
import { useT } from "../i18n";

export interface StapelFoto { url: string; thumb_url?: string | null }

// Bilder an einer Chat-Nachricht (Jan, 30.09.2026: „wenn mehr Bilder als eins in einer Nachricht,
// dann gestapelt"). EIN Bild: normal gross. MEHRERE: ein Stapel — das erste obenauf, bis zu zwei
// weitere leicht versetzt und gedreht dahinter, dazu die Anzahl. Ein Tipp oeffnet die Galerie
// (Lightbox, Wischen/Pfeile) mit allen Bildern der Nachricht.
export function FotoStapel({ photos, name, avatarUrl }: { photos: StapelFoto[]; name?: string | null; avatarUrl?: string | null }) {
  const t = useT();
  const [offen, setOffen] = useState<number | null>(null);
  if (!photos.length) return null;
  const klein = (p: StapelFoto) => p.thumb_url || p.url;
  const galerie = offen != null && (
    <Lightbox photos={photos.map((p) => ({ url: p.url, session_id: 0, name, avatar_url: avatarUrl }))} index={offen}
      onClose={() => setOffen(null)} readOnly />
  );
  if (photos.length === 1) {
    return (
      <>
        <button type="button" onClick={() => setOffen(0)} className="mt-1.5 block" aria-label={t("chat.photoOpen")}>
          <img src={klein(photos[0])} alt="" loading="lazy"
            className="max-h-64 max-w-[16rem] rounded-xl border border-slate-800 object-cover" />
        </button>
        {galerie}
      </>
    );
  }
  const hinten = photos.slice(1, 3);
  return (
    <>
      <button type="button" onClick={() => setOffen(0)} aria-label={t("chat.photosOpen", { n: photos.length })}
        className="relative mt-3 mb-1 ml-1 block h-40 w-52">
        {hinten.map((p, i) => (
          <img key={p.url} src={klein(p)} alt="" loading="lazy" aria-hidden
            className={`absolute inset-0 h-full w-full rounded-xl border border-slate-700 object-cover shadow-sm ${
              i === 0 ? "translate-x-2 -translate-y-1.5 rotate-3 opacity-90" : "translate-x-4 -translate-y-3 rotate-6 opacity-75"}`}
            style={{ zIndex: 2 - i }} />
        ))}
        <img src={klein(photos[0])} alt="" loading="lazy"
          className="absolute inset-0 h-full w-full rounded-xl border border-slate-800 object-cover shadow-md" style={{ zIndex: 3 }} />
        <span className="absolute bottom-1.5 right-1.5 rounded-full bg-slate-950/80 px-2 py-0.5 text-xs font-semibold text-slate-100"
          style={{ zIndex: 4 }}>
          +{photos.length - 1}
        </span>
      </button>
      {galerie}
    </>
  );
}
