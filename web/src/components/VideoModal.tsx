import { CloseIcon } from "./Icons";
import { useCloseOnBack } from "../lib/useCloseOnBack";

// YouTube-Video-ID aus einer URL ziehen (watch?v=, youtu.be/, shorts/, embed/).
export function ytId(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("/")[0];
    if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || "";
    if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] || "";
    return u.searchParams.get("v") || "";
  } catch {
    return "";
  }
}

// Plattform eines Video-Links (gemeinsam für Detail + Liste). YouTube = einbettbar (nocookie);
// Instagram/TikTok = kein Embed (CSP/Datenschutz) -> Kachel öffnet extern.
export type VideoPlatform = "youtube" | "instagram" | "tiktok" | null;
export function videoPlatform(url: string | null | undefined): VideoPlatform {
  if (!url) return null;
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (h.includes("youtube") || h.includes("youtu.be")) return "youtube";
    if (h.includes("instagram")) return "instagram";
    if (h.includes("tiktok")) return "tiktok";
  } catch { /* ignore */ }
  return null;
}

// Fullscreen-Popup mit eingebettetem YouTube-Video (nocookie). Schließt per Backdrop/X.
export function VideoModal({ url, onClose }: { url: string; onClose: () => void }) {
  const id = ytId(url);
  useCloseOnBack(!!id, onClose);
  if (!id) return null;
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      <button onClick={onClose} aria-label="Close"
        style={{ top: "calc(0.75rem + env(safe-area-inset-top))", right: "calc(0.75rem + env(safe-area-inset-right))" }}
        className="absolute rounded-full bg-white/10 p-1.5 text-white hover:bg-white/20"><CloseIcon className="h-5 w-5" /></button>
      <div className="aspect-video" style={{ width: "min(96vw, calc((100vh - 5rem) * 16 / 9))" }} onClick={(e) => e.stopPropagation()}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}`}
          title="YouTube"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="h-full w-full rounded-xl"
        />
      </div>
    </div>
  );
}
