// Dialog „Bestenliste als Bild teilen" — fuer Teams und Community derselbe (02.11.2026). Gezeichnet wird in
// lib/bestenlisteBild.ts; hier nur Vorschau, Teilen und Speichern.
import { useEffect, useRef, useState } from "react";
import { BILD_B, BILD_H, bildDatei, bildLaden, bildSpeichern, zeichneBestenliste, type BildDaten } from "../lib/bestenlisteBild";
import { useT } from "../i18n";
import { flaggeUrl } from "../lib/laender";
import { DownloadIcon, ShareIcon } from "./Icons";

export default function BestenlisteBildDialog({ daten, logoUrl, dateiname, titel, hinweis, onClose }: {
  daten: BildDaten; logoUrl?: string | null; dateiname: string; titel: string; hinweis?: string | null; onClose: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const [fertig, setFertig] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  // Hell/Dunkel wie beim Teilen einer Session; die Wahl merkt sich der Browser (nur Komfort).
  const [hell, setHellRoh] = useState(() => { try { return localStorage.getItem("foil_bild_hell") === "1"; } catch { return false; } });
  const setHell = (v: boolean) => { setHellRoh(v); try { localStorage.setItem("foil_bild_hell", v ? "1" : "0"); } catch { /* egal */ } };

  useEffect(() => {
    let weg = false;
    (async () => {
      const g = ref.current?.getContext("2d");
      if (!g) return;
      // Logo per fetch -> Blob, nicht per <img src>: ein vom Service-Worker gecachtes Bild kann das Canvas verunreinigen.
      let logo: HTMLImageElement | null = null;
      if (logoUrl) { try { logo = await bildLaden(logoUrl); } catch { logo = null; } }
      let marke: HTMLImageElement | null = null;
      try { marke = await bildLaden(hell ? "/wordmark-h-light.png" : "/wordmark-h-dark.png"); } catch { marke = null; }
      // Flaggen der Fahrer, die ihre Nationalitaet eingestellt haben (02.11.2026); eine fehlende Flagge laesst nur sie weg.
      const flaggen: Record<string, HTMLImageElement> = {};
      const codes = new Set([...daten.zeilen, ...(daten.eigene ? [daten.eigene] : [])].map((z) => z.land).filter(Boolean) as string[]);
      await Promise.all([...codes].map((c) => bildLaden(flaggeUrl(c)).then((im) => { flaggen[c] = im; }).catch(() => {})));
      if (weg) return;
      zeichneBestenliste(g, { ...daten, logo, marke, hell, flaggen });
      setFertig(true);
    })().catch(() => setFehler(t("share.errImage")));
    return () => { weg = true; };
  }, [daten, logoUrl, hell]);   // eslint-disable-line react-hooks/exhaustive-deps

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
        <div className="mb-3 flex gap-2">
          {([false, true] as const).map((h) => (
            <button key={String(h)} onClick={() => setHell(h)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium ${hell === h ? "bg-brand-500 text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}>
              {t(h ? "theme.light" : "theme.dark")}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={teilen} disabled={!fertig} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 font-semibold text-slate-950 hover:bg-brand-400 disabled:opacity-50">
            <ShareIcon className="h-5 w-5" /> {t("team.teilen")}
          </button>
          <button onClick={speichern} disabled={!fertig} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50">
            <DownloadIcon className="h-5 w-5" /> {t("team.bild.speichern")}
          </button>
        </div>
        <button onClick={onClose} className="mt-2 w-full text-sm text-slate-400 hover:text-slate-200">{t("common.cancel")}</button>
      </div>
    </div>
  );
}
