// QR-Code zu einem Einladungslink (31.10.2026, Jan: „qr-code fuer einladungslink … auch teilbar").
// Erzeugt im Browser (qrcode-generator, MIT) — kein Dritt-Dienst sieht den Link. Gezeichnet auf ein
// Canvas, damit es als PNG heruntergeladen und ueber das Teilen-Menue des Geraets geteilt werden kann.
// Immer schwarz auf weiss, auch im dunklen Modus: nur so lesen ihn alle Kameras sicher.
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n";

const ZELLE = 8;
const RAND = 4;   // Ruhezone in Modulen (Norm: 4)

export default function TeamQr({ url, dateiname }: { url: string; dateiname: string }) {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const [png, setPng] = useState<Blob | null>(null);

  useEffect(() => {
    let weg = false;
    import("qrcode-generator").then(({ default: qrcode }) => {
      if (weg || !ref.current) return;
      const qr = qrcode(0, "M");
      qr.addData(url);
      qr.make();
      const n = qr.getModuleCount();
      const px = (n + 2 * RAND) * ZELLE;
      const c = ref.current;
      c.width = px;
      c.height = px;
      const g = c.getContext("2d");
      if (!g) return;
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, px, px);
      g.fillStyle = "#000000";
      for (let r = 0; r < n; r++) {
        for (let s = 0; s < n; s++) {
          if (qr.isDark(r, s)) g.fillRect((s + RAND) * ZELLE, (r + RAND) * ZELLE, ZELLE, ZELLE);
        }
      }
      c.toBlob((b) => { if (!weg) setPng(b); }, "image/png");
    }).catch(() => {});
    return () => { weg = true; };
  }, [url]);

  const datei = png ? new File([png], `${dateiname}.png`, { type: "image/png" }) : null;
  const teilbar = !!datei && typeof navigator.canShare === "function" && navigator.canShare({ files: [datei] });

  const herunterladen = () => {
    if (!png) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(png);
    a.download = `${dateiname}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const teilen = () => {
    // Nur die Datei, ohne Text/Titel: sonst routen WhatsApp & Co. falsch (s. ShareDialog.tsx).
    if (datei) navigator.share({ files: [datei] }).catch(() => {});
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <canvas ref={ref} className="h-40 w-40 rounded-lg bg-white" aria-label={t("team.qr")} />
      <div className="flex flex-wrap gap-2">
        <button onClick={herunterladen} disabled={!png} className="rounded-xl border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-50">
          {t("team.qrLaden")}
        </button>
        {teilbar && (
          <button onClick={teilen} className="rounded-xl border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800">
            {t("team.qrTeilen")}
          </button>
        )}
      </div>
    </div>
  );
}
