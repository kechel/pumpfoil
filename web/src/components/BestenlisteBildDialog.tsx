// Dialog „Bestenliste als Bild teilen" — fuer Teams und Community derselbe (02.11.2026). Gezeichnet wird in
// lib/bestenlisteBild.ts; hier nur Vorschau, Teilen und Speichern.
import { useEffect, useRef, useState } from "react";
import { BILD_B, BILD_H, bildDatei, bildLaden, bildSpeichern, zeichneBestenliste, type BildDaten } from "../lib/bestenlisteBild";
import { useT } from "../i18n";

export default function BestenlisteBildDialog({ daten, logoUrl, dateiname, titel, hinweis, onClose }: {
  daten: BildDaten; logoUrl?: string | null; dateiname: string; titel: string; hinweis?: string | null; onClose: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const [fertig, setFertig] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let weg = false;
    (async () => {
      const g = ref.current?.getContext("2d");
      if (!g) return;
      // Logo per fetch -> Blob, nicht per <img src>: ein vom Service-Worker gecachtes Bild kann das Canvas verunreinigen.
      let logo: HTMLImageElement | null = null;
      if (logoUrl) { try { logo = await bildLaden(logoUrl); } catch { logo = null; } }
      let marke: HTMLImageElement | null = null;
      try { marke = await bildLaden("/wordmark-h-light.png"); } catch { marke = null; }
      if (weg) return;
      zeichneBestenliste(g, { ...daten, logo, marke });
      setFertig(true);
    })().catch(() => setFehler(t("share.errImage")));
    return () => { weg = true; };
  }, [daten, logoUrl]);   // eslint-disable-line react-hooks/exhaustive-deps

  const datei = () => {
    const f = bildDatei(ref.current, dateiname);
    if (!f) setFehler(t("share.errImage"));
    return f;
  };
  const speichern = () => { const f = datei(); if (f) bildSpeichern(f); };
  const teilen = () => {
    const f = datei(); if (!f) return;
    if (navigator.canShare?.({ files: [f] })) {
      navigator.share({ files: [f] }).catch((e: { name?: string }) => { if (e?.name !== "AbortError") setFehler(t("share.errImage")); });
    } else bildSpeichern(f);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-full w-full max-w-sm overflow-y-auto rounded-2xl border border-slate-700 bg-white p-4 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-2 font-semibold text-slate-100">{titel}</h3>
        <canvas ref={ref} width={BILD_B} height={BILD_H} className="mb-3 w-full rounded-xl border border-slate-700" />
        {hinweis && <p className="mb-3 text-xs text-amber-700 dark:text-amber-300">{hinweis}</p>}
        {fehler && <p className="mb-3 text-sm text-red-700 dark:text-red-300">{fehler}</p>}
        <div className="flex gap-2">
          <button onClick={teilen} disabled={!fertig} className="flex-1 rounded-xl bg-brand-500 px-4 py-2.5 font-semibold text-slate-950 hover:bg-brand-400 disabled:opacity-50">{t("team.teilen")}</button>
          <button onClick={speichern} disabled={!fertig} className="flex-1 rounded-xl bg-slate-800 px-4 py-2.5 font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50">{t("team.bild.speichern")}</button>
        </div>
        <button onClick={onClose} className="mt-2 w-full text-sm text-slate-400 hover:text-slate-200">{t("common.cancel")}</button>
      </div>
    </div>
  );
}
