// Bestenliste als Bild (Community und Teams, 02.11.2026). Gestaltet wie die Session-Karte (server/app/sharecard.py),
// Jan: „schau mal wie wir das beim teilen von sessions gemacht haben mit dem logo" — quadratisch 1080, Navy-Grund,
// Ueberschrift und Werte in Marken-Cyan, das weisse Logo unten rechts ohne Kasten. Die Zeilen fuellen die Flaeche,
// auch wenn nur wenige Fahrer in der Liste stehen. Initialen statt Profilbildern: fremde Bilder koennten das Canvas
// „verunreinigen" (dann liefert toDataURL nichts), und sie sollen nicht ungefragt in geteilten Bildern landen.

export const BILD_B = 1080, BILD_H = 1080;
const SCHRIFT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export type BildZeile = { rang: number; name: string | null; initialen: string; wert: string; ich?: boolean };

export type BildDaten = {
  titel: string;            // Kopfzeile gross, z. B. „Längster Lauf" oder der Teamname
  unterzeile: string;       // Sportart/Kennzahl, Zeitraum, Stand (Datum)
  zeilen: BildZeile[];      // hoechstens 10
  eigene?: BildZeile | null; // eigene Zeile unter Platz 10
  leer: string;             // Text, wenn es keine Zeilen gibt
  akzent?: string;          // Teamfarbe; sonst Marken-Cyan
  logo?: HTMLImageElement | null;   // Teamwappen links neben der Ueberschrift
  marke?: HTMLImageElement | null;  // unser Schriftzug unten rechts
};

// Dieselben Farben wie die Session-Karte (sharecard.py: NAVY, WATER, CYAN, Sekundaer).
const NAVY = "#020617", WASSER = "#0c1426", CYAN = "#22d3ee", SEK = "#cbd5e1", LEISE = "#94a3b8", WEISS = "#ffffff";

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
  const X = 90;
  g.fillStyle = NAVY;
  g.fillRect(0, 0, BILD_B, BILD_H);

  // Kopf wie bei der Session-Karte: Ueberschrift + Unterzeile oben links, optional mit Wappen davor.
  let tx = X;
  if (d.logo) {
    g.save(); g.beginPath(); g.roundRect(X, 58, 110, 110, 22); g.clip();
    g.drawImage(d.logo, X, 58, 110, 110); g.restore();
    tx = X + 110 + 32;
  }
  g.textAlign = "left"; g.textBaseline = "alphabetic";
  g.fillStyle = akzent;
  g.font = `700 58px ${SCHRIFT}`;
  g.fillText(kuerzen(g, d.titel, BILD_B - tx - X), tx, 64 + 54);
  g.font = `700 30px ${SCHRIFT}`;
  g.fillText(kuerzen(g, d.unterzeile, BILD_B - tx - X), tx, 128 + 28);

  // Zeilen: verfuegbare Hoehe zwischen Kopf und Logo gleichmaessig nutzen (hoechstens 80 px je Zeile).
  const zeilen = d.zeilen.slice(0, 10);
  const oben = 215, unten = BILD_H - 150;
  const n = Math.max(zeilen.length, 1) + (d.eigene && zeilen.length ? 1.4 : 0);
  const zh = Math.min(110, Math.floor((unten - oben) / n));
  const gross = Math.round(zh * 0.5);

  const zeile = (z: BildZeile, y: number) => {
    const mitte = y + zh / 2;
    if (z.ich) { g.fillStyle = WASSER; g.beginPath(); g.roundRect(X - 24, y + 4, BILD_B - 2 * X + 48, zh - 8, 16); g.fill(); }
    g.textBaseline = "middle";
    g.fillStyle = z.rang <= 3 ? akzent : LEISE;
    g.font = `800 ${gross}px ${SCHRIFT}`;
    g.textAlign = "right"; g.fillText(String(z.rang), X + 50, mitte);
    const r = Math.round(zh * 0.36);
    g.fillStyle = z.rang <= 3 ? akzent : "#334155";
    g.beginPath(); g.arc(X + 70 + r, mitte, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = z.rang <= 3 ? NAVY : WEISS; g.font = `700 ${Math.round(r * 0.8)}px ${SCHRIFT}`; g.textAlign = "center";
    g.fillText(z.initialen, X + 70 + r, mitte + 1);
    g.font = `700 ${gross}px ${SCHRIFT}`; g.textAlign = "right"; g.fillStyle = akzent;
    g.fillText(z.wert, BILD_B - X, mitte);
    const wb = g.measureText(z.wert).width;
    const nx = X + 70 + 2 * r + 24;
    g.font = `${z.rang === 1 || z.ich ? 700 : 500} ${Math.round(gross * 0.92)}px ${SCHRIFT}`; g.textAlign = "left"; g.fillStyle = WEISS;
    g.fillText(kuerzen(g, z.name ?? "—", BILD_B - X - wb - 30 - nx), nx, mitte);
  };
  zeilen.forEach((z, i) => {
    if (i > 0) { g.fillStyle = "#1e293b"; g.fillRect(X, oben + i * zh, BILD_B - 2 * X, 2); }
    zeile(z, oben + i * zh);
  });
  if (!zeilen.length) {
    g.fillStyle = SEK; g.font = `400 34px ${SCHRIFT}`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(d.leer, BILD_B / 2, (oben + unten) / 2);
  }
  if (d.eigene && zeilen.length) {
    const ye = oben + zeilen.length * zh + Math.round(zh * 0.4);
    g.fillStyle = LEISE; g.font = `700 ${gross}px ${SCHRIFT}`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("⋮", X + 30, ye - Math.round(zh * 0.2));
    zeile({ ...d.eigene, ich: true }, ye);
  }

  // Fuss wie bei der Session-Karte: Logo unten rechts (Hoehe 54, 90 vom Rand), Motto links.
  g.textBaseline = "alphabetic";
  if (d.marke) {
    const lh = 54, lw = d.marke.width * lh / d.marke.height;
    g.drawImage(d.marke, BILD_B - X - lw, BILD_H - X, lw, lh);
  }
  g.fillStyle = LEISE; g.font = `400 26px ${SCHRIFT}`; g.textAlign = "left";
  g.fillText("Have fun, keep pumping!", X, BILD_H - X + 38);
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
