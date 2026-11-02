// Bestenliste als Bild (Community und Teams, 02.11.2026). Vorher zeichnete nur das Team ein Bild, auf fast schwarzem
// Grund — Jan: „besser layouted, nicht so schwarz". Jetzt EIN Aufbau fuer beide, hell und ruhig: Marken-Cyan als
// Akzent (ohne Verlaeufe, s. brand/README.md), Rang, Initialen, Name, Wert; die eigene Zeile abgesetzt darunter.
// 4:5 (1080x1350) passt fuer Instagram und WhatsApp. Initialen statt Profilbildern: fremde Bilder koennten das Canvas
// „verunreinigen" (dann liefert toDataURL nichts), und sie sollen nicht ungefragt in geteilten Bildern landen.

export const BILD_B = 1080, BILD_H = 1350;
const SCHRIFT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export type BildZeile = { rang: number; name: string | null; initialen: string; wert: string; ich?: boolean };

export type BildDaten = {
  titel: string;            // Kopfzeile gross, z. B. Teamname oder „Pumpfoil-Community"
  kennzahl: string;         // z. B. „Längster Lauf"
  unterzeile: string;       // Zeitraum, Sportart, Stand (Datum)
  zeilen: BildZeile[];      // hoechstens 10
  eigene?: BildZeile | null; // eigene Zeile unter Platz 10
  leer: string;             // Text, wenn es keine Zeilen gibt
  fussLinks: string;        // z. B. „pumpfoil.org/teams/slug"
  akzent?: string;          // Teamfarbe; sonst Marken-Cyan
  logo?: HTMLImageElement | null;
  logoText?: string;        // Initialen im Kopf, wenn es kein Logo gibt; ohne beides kein Kasten links (Community)
  marke?: HTMLImageElement | null;  // unser Schriftzug oben rechts (Jan, 02.11.2026)
};

const GRUND = "#f8fafc", KARTE = "#ffffff", LINIE = "#e2e8f0", TEXT = "#0f172a", LEISE = "#64748b", CYAN = "#0891b2";

export function initialenAus(name: string | null): string {
  const teile = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!teile.length) return "?";
  return (teile.length > 1 ? teile[0][0] + teile[teile.length - 1][0] : teile[0].slice(0, 2)).toUpperCase();
}

function kuerzen(g: CanvasRenderingContext2D, text: string, max: number): string {
  if (g.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && g.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

export async function bildLaden(url: string): Promise<HTMLImageElement> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(String(r.status));
  const u = URL.createObjectURL(await r.blob());
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = u; });
}

export function zeichneBestenliste(g: CanvasRenderingContext2D, d: BildDaten) {
  const akzent = d.akzent || CYAN;
  g.fillStyle = GRUND;
  g.fillRect(0, 0, BILD_B, BILD_H);

  // Kopf: farbiges Band mit Logo/Initialen, Titel und Kennzahl
  g.fillStyle = akzent;
  g.fillRect(0, 0, BILD_B, 250);
  const W = 140, X = 64, Y = 55;
  const mitKasten = !!(d.logo || d.logoText);
  if (d.logo) {
    g.fillStyle = KARTE;
    g.beginPath(); g.roundRect(X - 6, Y - 6, W + 12, W + 12, 28); g.fill();
    g.drawImage(d.logo, X, Y, W, W);
  } else if (d.logoText) {
    g.fillStyle = KARTE;
    g.beginPath(); g.roundRect(X, Y, W, W, 28); g.fill();
    g.fillStyle = akzent;
    g.font = `800 60px ${SCHRIFT}`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(d.logoText, X + W / 2, Y + W / 2 + 2);
  }
  // Schriftzug oben rechts auf weissem Feld — direkt auf dem Cyan verschwaende das „.org".
  let rechts = BILD_B - 64;
  if (d.marke) {
    const mw = 280, mh = mw * d.marke.height / d.marke.width, pad = 18;
    const px = BILD_B - 48 - mw - 2 * pad, py = 40;
    g.fillStyle = KARTE;
    g.beginPath(); g.roundRect(px, py, mw + 2 * pad, mh + 2 * pad, 20); g.fill();
    g.drawImage(d.marke, px + pad, py + pad, mw, mh);
    rechts = px - 30;
  }
  g.textAlign = "left"; g.textBaseline = "alphabetic";
  const tx = mitKasten ? X + W + 40 : X;
  g.fillStyle = "#ffffff";
  g.font = `800 58px ${SCHRIFT}`;
  g.fillText(kuerzen(g, d.titel, rechts - tx), tx, Y + 62);
  g.font = `600 40px ${SCHRIFT}`;
  g.fillText(kuerzen(g, d.kennzahl, (d.marke ? BILD_B - 64 : rechts) - tx), tx, Y + 125);

  g.fillStyle = LEISE;
  g.font = `500 32px ${SCHRIFT}`;
  g.fillText(kuerzen(g, d.unterzeile, BILD_B - 128), 64, 310);

  // Zeilen als Karte
  const y0 = 345, zh = 70;
  const zeilen = d.zeilen.slice(0, 10);
  const hoehe = Math.max(zeilen.length, 1) * zh + 24;
  g.fillStyle = KARTE;
  g.beginPath(); g.roundRect(40, y0, BILD_B - 80, hoehe, 28); g.fill();
  g.strokeStyle = LINIE; g.lineWidth = 2; g.stroke();

  const zeile = (z: BildZeile, y: number, trenner: boolean) => {
    const mitte = y + zh / 2;
    if (z.ich) { g.fillStyle = akzent; g.globalAlpha = 0.12; g.beginPath(); g.roundRect(52, y + 4, BILD_B - 104, zh - 8, 18); g.fill(); g.globalAlpha = 1; }
    else if (trenner) { g.fillStyle = LINIE; g.fillRect(84, y, BILD_B - 168, 2); }
    g.textBaseline = "middle";
    g.fillStyle = z.rang <= 3 ? akzent : LEISE;
    g.font = `800 38px ${SCHRIFT}`;
    g.textAlign = "right"; g.fillText(String(z.rang), 140, mitte);
    g.fillStyle = z.rang <= 3 ? akzent : "#94a3b8";
    g.beginPath(); g.arc(200, mitte, 28, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#ffffff"; g.font = `700 22px ${SCHRIFT}`; g.textAlign = "center";
    g.fillText(z.initialen, 200, mitte + 1);
    g.font = `700 38px ${SCHRIFT}`; g.textAlign = "right"; g.fillStyle = TEXT;
    g.fillText(z.wert, BILD_B - 84, mitte);
    const wb = g.measureText(z.wert).width;
    g.font = `${z.rang === 1 || z.ich ? 700 : 500} 36px ${SCHRIFT}`; g.textAlign = "left"; g.fillStyle = TEXT;
    g.fillText(kuerzen(g, z.name ?? "—", BILD_B - 84 - wb - 40 - 250), 250, mitte);
  };
  zeilen.forEach((z, i) => zeile(z, y0 + 12 + i * zh, i > 0));
  if (!zeilen.length) {
    g.fillStyle = LEISE; g.font = `400 34px ${SCHRIFT}`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(d.leer, BILD_B / 2, y0 + hoehe / 2);
  }
  if (d.eigene && zeilen.length) {
    const ye = y0 + hoehe + 22;
    g.fillStyle = KARTE;
    g.beginPath(); g.roundRect(40, ye, BILD_B - 80, zh + 24, 28); g.fill();
    g.strokeStyle = LINIE; g.lineWidth = 2; g.stroke();
    zeile({ ...d.eigene, ich: true }, ye + 12, false);
  }

  // Fuss
  g.textBaseline = "alphabetic";
  g.fillStyle = akzent; g.fillRect(64, BILD_H - 110, BILD_B - 128, 4);
  g.fillStyle = TEXT; g.font = `700 34px ${SCHRIFT}`; g.textAlign = "left";
  g.fillText(d.fussLinks, 64, BILD_H - 52);
  g.fillStyle = LEISE; g.font = `400 28px ${SCHRIFT}`; g.textAlign = "right";
  g.fillText("Have fun, keep pumping!", BILD_B - 64, BILD_H - 52);
}

/** Bild als Datei — SYNCHRON in der Klick-Geste (toDataURL statt toBlob), sonst lehnt iOS das Teilen ab. */
export function bildDatei(c: HTMLCanvasElement | null, name: string): File | null {
  if (!c) return null;
  try {
    const url = c.toDataURL("image/jpeg", 0.92);
    const bytes = Uint8Array.from(atob(url.split(",")[1] || ""), (x) => x.charCodeAt(0));
    if (!bytes.length) return null;
    return new File([bytes], name, { type: "image/jpeg" });
  } catch {
    return null;
  }
}

export function bildSpeichern(f: File) {
  const u = URL.createObjectURL(f);
  const a = document.createElement("a"); a.href = u; a.download = f.name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 10000);
}
