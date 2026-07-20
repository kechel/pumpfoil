import { useEffect } from "react";

// Großes Hochformat-Overlay für einen YouTube-Short (Click-to-Load, youtube-nocookie —
// datensparsam, keine Cookies/Skripte bis zum Öffnen). Schließt per X/Backdrop/Escape.
export function ShortModal({ id, title, onClose }: { id: string; title?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/90 p-4" onClick={onClose}>
      <button onClick={onClose} aria-label="Close"
        className="absolute right-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      <div className="aspect-[9/16] h-[85vh] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
        <iframe
          className="h-full w-full rounded-xl"
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`}
          title={title || "Video"}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    </div>
  );
}
