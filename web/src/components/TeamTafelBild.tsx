// Bestenliste als Bild teilen (Jan, 31.10.2026: „bestenliste als bild teilen find ich super!"). Vorbild ist
// die schlichte Rangliste aus dem Telefonat: Kopf mit Wappen und Teamname, darunter Rang, Name, Wert.
// Gezeichnet im Browser auf ein Canvas (4:5, passt fuer Instagram/WhatsApp), Initialen statt Profilbildern.
//
// Zwei Fallen aus ShareDialog.tsx uebernommen:
//  * Das Wappen per fetch -> Blob laden, nicht per <img src>: ein vom Service-Worker gecachtes Bild kann
//    das Canvas „verunreinigen", dann liefert toDataURL nichts.
//  * Teilen SYNCHRON in der Klick-Geste (toDataURL statt toBlob, kein await davor) — sonst lehnt iOS ab.
import { useEffect, useRef, useState } from "react";
import { TeamTafelMitZeilen } from "../lib/api";
import { TEAM_FARBEN } from "../lib/teamFarben";
import { kennzahl } from "../lib/teamKennzahlen";
import { teamInitialen } from "./TeamWappen";
import { useT } from "../i18n";

const B = 1080, H = 1350;
const SCHRIFT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

async function bildLaden(url: string): Promise<HTMLImageElement> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  const u = URL.createObjectURL(await r.blob());
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = u; });
}

function kuerzen(g: CanvasRenderingContext2D, text: string, max: number): string {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

export default function TeamTafelBild({ team, tafel, zeitraum, onClose }: {
  team: { name: string; slug: string; logo_url: string | null; farbe: string | null; bestenlisten_oeffentlich?: boolean };
  tafel: TeamTafelMitZeilen; zeitraum: string; onClose: () => void;
}) {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);
  const [fertig, setFertig] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const k = kennzahl(tafel.kennzahl);

  useEffect(() => {
    let weg = false;
    (async () => {
      const c = ref.current;
      const g = c?.getContext("2d");
      if (!c || !g) return;
      const akzent = (TEAM_FARBEN[team.farbe || "cyan"] ?? TEAM_FARBEN.cyan).dunkel;
      g.fillStyle = "#0b1220";
      g.fillRect(0, 0, B, H);
      g.fillStyle = akzent;
      g.fillRect(0, 0, B, 14);

      // Kopf: Wappen + Teamname
      const W = 150, X = 64, Y = 70;
      let logo: HTMLImageElement | null = null;
      if (team.logo_url) { try { logo = await bildLaden(team.logo_url); } catch { logo = null; } }
      if (weg) return;
      if (logo) g.drawImage(logo, X, Y, W, W);
      else {
        g.fillStyle = akzent;
        g.beginPath(); g.roundRect(X, Y, W, W, 24); g.fill();
        g.fillStyle = "#020617";
        g.font = `700 64px ${SCHRIFT}`;
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(teamInitialen(team.name), X + W / 2, Y + W / 2 + 2);
      }
      g.textAlign = "left"; g.textBaseline = "alphabetic";
      const tx = X + W + 40, tmax = B - tx - 64;
      g.fillStyle = akzent;
      g.font = `800 62px ${SCHRIFT}`;
      g.fillText(kuerzen(g, team.name.toUpperCase(), tmax), tx, Y + 64);
      g.fillStyle = "#e2e8f0";
      g.font = `600 40px ${SCHRIFT}`;
      g.fillText(kuerzen(g, t(k.labelKey), tmax), tx, Y + 114);
      g.fillStyle = "#94a3b8";
      g.font = `400 32px ${SCHRIFT}`;
      g.fillText(kuerzen(g, zeitraum, tmax), tx, Y + 156);

      // Zeilen
      const zeilen = tafel.zeilen.slice(0, 10);
      const y0 = 320, zh = 88;
      zeilen.forEach((z, i) => {
        const y = y0 + i * zh;
        if (i === 0) { g.fillStyle = akzent; g.globalAlpha = 0.16; g.fillRect(40, y, B - 80, zh - 8); g.globalAlpha = 1; }
        else { g.fillStyle = "#1e293b"; g.fillRect(64, y - 4, B - 128, 2); }
        const mitte = y + (zh - 8) / 2;
        g.textBaseline = "middle";
        g.fillStyle = z.rang <= 3 ? akzent : "#94a3b8";
        g.font = `800 40px ${SCHRIFT}`;
        g.textAlign = "right"; g.fillText(String(z.rang), 120, mitte);
        // Initialen-Kreis
        g.fillStyle = "#1e293b";
        g.beginPath(); g.arc(178, mitte, 30, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#e2e8f0"; g.font = `700 24px ${SCHRIFT}`; g.textAlign = "center";
        g.fillText(z.initialen, 178, mitte + 1);
        // Wert rechts, Name dazwischen
        g.font = `700 40px ${SCHRIFT}`; g.textAlign = "right"; g.fillStyle = "#f8fafc";
        const wert = k.fmt(z.value);
        g.fillText(wert, B - 72, mitte);
        const wb = g.measureText(wert).width;
        g.font = `${i === 0 ? 700 : 500} 38px ${SCHRIFT}`; g.textAlign = "left"; g.fillStyle = "#f1f5f9";
        g.fillText(kuerzen(g, z.name ?? "—", B - 72 - wb - 40 - 230), 230, mitte);
      });
      if (!zeilen.length) {
        g.fillStyle = "#94a3b8"; g.font = `400 36px ${SCHRIFT}`; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText(t("team.tafel.leer"), B / 2, y0 + 120);
      }

      // Fuss
      g.textBaseline = "alphabetic";
      g.fillStyle = akzent; g.fillRect(64, H - 120, B - 128, 3);
      g.fillStyle = "#cbd5e1"; g.font = `600 34px ${SCHRIFT}`; g.textAlign = "left";
      g.fillText(`pumpfoil.org/teams/${team.slug}`, 64, H - 60);
      g.fillStyle = "#64748b"; g.font = `400 28px ${SCHRIFT}`; g.textAlign = "right";
      g.fillText("Have fun, keep pumping!", B - 64, H - 60);
      setFertig(true);
    })().catch(() => setFehler(t("share.errImage")));
    return () => { weg = true; };
  }, [team, tafel, zeitraum]);   // eslint-disable-line react-hooks/exhaustive-deps

  function datei(): File | null {
    const c = ref.current;
    if (!c) return null;
    try {
      const url = c.toDataURL("image/jpeg", 0.92);
      const bytes = Uint8Array.from(atob(url.split(",")[1] || ""), (x) => x.charCodeAt(0));
      if (!bytes.length) throw new Error("leer");
      return new File([bytes], `${team.slug}-${tafel.kennzahl}.jpg`, { type: "image/jpeg" });
    } catch {
      setFehler(t("share.errImage"));
      return null;
    }
  }
  function speichern() {
    const f = datei(); if (!f) return;
    const u = URL.createObjectURL(f);
    const a = document.createElement("a"); a.href = u; a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 10000);
  }
  function teilen() {
    const f = datei(); if (!f) return;
    if (navigator.canShare?.({ files: [f] })) {
      navigator.share({ files: [f] }).catch((e: { name?: string }) => { if (e?.name !== "AbortError") setFehler(t("share.errImage")); });
    } else speichern();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="max-h-full w-full max-w-sm overflow-y-auto rounded-2xl border border-slate-700 bg-white p-4 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-2 font-semibold text-slate-100">{t("team.bild.titel")}</h3>
        <canvas ref={ref} width={B} height={H} className="mb-3 w-full rounded-xl" />
        {!team.bestenlisten_oeffentlich && <p className="mb-3 text-xs text-amber-700 dark:text-amber-300">{t("team.bild.hinweisIntern")}</p>}
        {fehler && <p className="mb-3 text-sm text-red-700 dark:text-red-300">{fehler}</p>}
        <div className="flex gap-2">
          <button onClick={teilen} disabled={!fertig} className="team-knopf flex-1 rounded-xl px-4 py-2.5 font-semibold disabled:opacity-50">{t("team.teilen")}</button>
          <button onClick={speichern} disabled={!fertig} className="flex-1 rounded-xl bg-slate-800 px-4 py-2.5 font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-50">{t("team.bild.speichern")}</button>
        </div>
        <button onClick={onClose} className="mt-2 w-full text-sm text-slate-400 hover:text-slate-200">{t("common.cancel")}</button>
      </div>
    </div>
  );
}
