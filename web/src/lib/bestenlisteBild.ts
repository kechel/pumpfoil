// Bestenliste als Bild (Community und Teams, 02.11.2026). Gestaltet wie die Session-Karte (server/app/sharecard.py),
// Jan: „schau mal wie wir das beim teilen von sessions gemacht haben mit dem logo" — quadratisch 1080, Navy-Grund,
// Ueberschrift und Werte in Marken-Cyan, das weisse Logo unten rechts ohne Kasten. Die Zeilen fuellen die Flaeche,
// auch wenn nur wenige Fahrer in der Liste stehen. Keine Profilbilder: sie sollen nicht ungefragt in geteilten
// Bildern landen (wie die Gast-Ansicht, teams.fuer_gast). Die Initialen-Kreise stattdessen sind seit 03.11.2026 auch
// weg (Jan: „unsinnig wenn es garkeine bilder gibt") — Rang, Flagge, Name, Wert.

export const BILD_B = 1080, BILD_H = 1080;
const SCHRIFT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export type BildZeile = { rang: number; name: string | null; initialen: string; wert: string; ich?: boolean;
  land?: string | null;   // Nationalitaet (ISO-Code) -> Flagge vor dem Namen
  // Team-Bestenliste (04.11.2026): Wappen vor dem Namen — Logo, sonst die Initialen auf der Teamfarbe (wie TeamWappen).
  wappen?: { logo: string | null; initialen?: string; flaeche: string; schrift: string; flaecheHell: string; schriftHell: string };
  // Gemischte Ansicht (Jan, 09.11.2026: „das share image enthaelt die badges je fahrer noch nicht"): Sportart-Pillen hinter
  // dem Namen, wie SportAbzeichen auf der Seite. Text schon uebersetzt (s. bildAbzeichen).
  abzeichen?: { sport: string; text: string }[] };

// Farben der Sportart-Pillen je Fassung — dieselben Toene wie components/SportAbzeichen.tsx (Cyan / Bernstein).
const PILLE: Record<string, { dunkel: [string, string]; hell: [string, string] }> = {
  pumpfoil: { dunkel: ["rgba(34,211,238,0.16)", "#67e8f9"], hell: ["rgba(14,116,144,0.12)", "#0e7490"] },
  foil_scoot: { dunkel: ["rgba(245,158,11,0.18)", "#fcd34d"], hell: ["rgba(245,158,11,0.16)", "#b45309"] },
};
const PILLE_SONST = { dunkel: ["#1e293b", "#cbd5e1"] as [string, string], hell: ["#e2e8f0", "#334155"] as [string, string] };

/** Sportart-Pillen fuer eine Bildzeile; nur wenn der Server `sportarten` mitschickt (gemischte Ansicht). */
export function bildAbzeichen(t: (k: string) => string, sportarten?: string[] | null, reihenfolge: readonly string[] = []) {
  if (!sportarten?.length) return undefined;
  const pos = (x: string) => { const i = reihenfolge.indexOf(x); return i < 0 ? 999 : i; };
  return [...sportarten].sort((a, b) => pos(a) - pos(b)).map((sport) => ({ sport, text: t(`cls.sport.${sport}`) }));
}

export type BildDaten = {
  titel: string;            // Kopfzeile gross, z. B. „Längster Lauf" oder der Teamname
  titelAnpassen?: boolean;  // Eventname als Titel: dunkel, eine Zeile bis 46 px, sonst zwei Zeilen so gross wie moeglich;
                            // das Abzeichen steht dann rechts neben der ersten kleinen Unterzeile statt neben dem Titel (07.11.2026)
  unterzeile: string;       // Sportart/Kennzahl, Zeitraum, Stand (Datum)
  unterzeile2?: string | null;   // weitere Unterzeilen, kleiner, mit \n getrennt (Events: Zeitraum, dann Kennzahl + Stand; 07.11.2026)
  zeilen: BildZeile[];      // hoechstens 10
  eigene?: BildZeile | null; // eigene Zeile unter Platz 10
  leer: string;             // Text, wenn es keine Zeilen gibt
  quelle?: string | null;   // klein ueber dem Fuss: seit 07.11.2026 IMMER die volle Plattform-Liste (s. plattformZeile)
  akzent?: string;          // Teamfarbe fuer die dunkle Fassung; sonst Marken-Cyan
  akzentHell?: string;      // Teamfarbe fuer die helle Fassung
  logo?: HTMLImageElement | null;   // Teamwappen links neben der Ueberschrift
  marke?: HTMLImageElement | null;  // unser Schriftzug unten rechts (zur Fassung passend: weiss auf dunkel, navy auf hell)
  flaggen?: Record<string, HTMLImageElement>;   // geladene Flaggen je ISO-Code (s. BestenlisteBildDialog)
  wappenBilder?: Record<string, HTMLImageElement>;   // geladene Team-Logos je URL
  wappenPlatz?: boolean;   // Platz fuer ein Wappen auch in Zeilen ohne (globale Events, Namen buendig; 07.11.2026)
  hell?: boolean;           // helle Fassung (Jan, 02.11.2026: Umschalter wie beim Teilen einer Session)
  abzeichen?: string | null; // oben rechts als Pille, z. B. „live" solange ein Event nicht final ist (06.11.2026)
  // Event-Uebersicht (Jan, 07.11.2026: „zusammengefasste event-total share moeglichkeit … und den ersten 3 plaetzen je
  // kategorie, auswaehlbar"): statt `zeilen` Summen-Kacheln und je Kategorie die ersten Plaetze. Hoehe waechst mit.
  summen?: { wert: string; label: string }[];
  gruppen?: { titel: string; zeilen: BildZeile[] }[];
  hoehe?: number;
};

/** Hoehe der Event-Uebersicht: Kopf, Summen, je Kategorie Titel + 3 Zeilen, Fuss — zwischen quadratisch und 9:16. */
export function uebersichtHoehe(summen: number, gruppen: number): number {
  return Math.max(BILD_H, Math.min(1920, 360 + (summen ? 190 : 0) + gruppen * 262 + 200));
}

// Dieselben Farben wie die Session-Karte (sharecard.py: NAVY, WATER, CYAN/DCYAN, Sekundaer), je Fassung.
const DUNKEL = { grund: "#020617", flaeche: "#0c1426", linie: "#1e293b", akzent: "#22d3ee", text: "#ffffff", sek: "#cbd5e1",
  leise: "#94a3b8", kreis: "#334155", kreisText: "#ffffff", topText: "#020617" };
const HELL = { grund: "#f8fafc", flaeche: "#e0f2fe", linie: "#e2e8f0", akzent: "#0e7490", text: "#0f172a", sek: "#475569",
  leise: "#64748b", kreis: "#cbd5e1", kreisText: "#0f172a", topText: "#ffffff" };

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
  const F = d.hell ? HELL : DUNKEL;
  const akzent = (d.hell ? d.akzentHell : d.akzent) || F.akzent;
  const X = 90;
  const H = d.hoehe ?? BILD_H;
  g.fillStyle = F.grund;
  g.fillRect(0, 0, BILD_B, H);

  // Kopf wie bei der Session-Karte: Ueberschrift + Unterzeile oben links, optional mit Wappen davor.
  let tx = X;
  if (d.logo) {
    g.save(); g.beginPath(); g.roundRect(X, 58, 110, 110, 22); g.clip();
    g.drawImage(d.logo, X, 58, 110, 110); g.restore();
    tx = X + 110 + 32;
  }
  // Abzeichen oben rechts (Event noch nicht final): Pille in der Akzentfarbe, Titel wird entsprechend kuerzer.
  let rechts = BILD_B - X;
  const pille = (by: number, bh: number, px: number) => {
    g.font = `800 ${px}px ${SCHRIFT}`;
    const text = (d.abzeichen || "").toUpperCase();
    const bw = g.measureText(text).width + Math.round(bh * 0.88), bx = BILD_B - X - bw;
    g.fillStyle = akzent;
    g.beginPath(); g.roundRect(bx, by, bw, bh, bh / 2); g.fill();
    g.fillStyle = F.topText; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, bx + bw / 2, by + bh / 2 + 1);
    g.textAlign = "left"; g.textBaseline = "alphabetic";
    return bx;
  };
  if (d.abzeichen && !d.titelAnpassen) rechts = pille(72, 50, 28) - 24;
  g.textAlign = "left"; g.textBaseline = "alphabetic";
  g.fillStyle = akzent;
  g.font = `700 58px ${SCHRIFT}`;
  let dy = 0;   // zusaetzliche Hoehe, wenn der Titel zwei Zeilen braucht
  if (d.titelAnpassen) g.fillStyle = F.text;   // Eventname dunkel bzw. weiss statt Akzentfarbe (Jan, 07.11.2026)
  if (d.titelAnpassen && g.measureText(d.titel).width > rechts - tx) {
    // Erst eine Zeile mit maessig kleinerer Schrift (bis 46 px); sonst zwei Zeilen in der groessten Schrift, bei der
    // beide passen (Jan: „etwas groesser, darf ruhig die zweite zeile auch voll ausnutzen").
    let px = 58;
    while (px > 46 && g.measureText(d.titel).width > rechts - tx) { px -= 2; g.font = `700 ${px}px ${SCHRIFT}`; }
    if (g.measureText(d.titel).width <= rechts - tx) {
      g.fillText(d.titel, tx, 64 + 54);
    } else {
      const w = d.titel.split(/\s+/), breit = rechts - tx;
      const teilen = () => {   // erste Zeile so voll wie moeglich, Rest in die zweite
        let n = 1;
        while (n < w.length && g.measureText(w.slice(0, n + 1).join(" ")).width <= breit) n++;
        return [w.slice(0, n).join(" "), w.slice(n).join(" ")];
      };
      px = 58; g.font = `700 ${px}px ${SCHRIFT}`;
      let [z1, z2] = teilen();
      while (px > 36 && (g.measureText(z1).width > breit || g.measureText(z2).width > breit)) {
        px -= 2; g.font = `700 ${px}px ${SCHRIFT}`; [z1, z2] = teilen();
      }
      const zh2 = Math.round(px * 1.12);
      g.fillText(kuerzen(g, z1, breit), tx, 64 + px - 4);
      g.fillText(kuerzen(g, z2, breit), tx, 64 + px - 4 + zh2);
      dy = px - 4 + zh2 - 54 + 14;   // + Luft zur Unterzeile
    }
  } else {
    g.fillText(kuerzen(g, d.titel, rechts - tx), tx, 64 + 54);
  }
  g.font = `700 30px ${SCHRIFT}`; g.fillStyle = akzent;
  g.fillText(kuerzen(g, d.unterzeile, BILD_B - tx - X), tx, 128 + 28 + dy);
  const weitere = (d.unterzeile2 || "").split("\n").filter(Boolean);
  // Abzeichen bei Event-Titeln rechts neben der ersten kleinen Unterzeile (Jan: „das live kann ja auch drunter").
  let rechts2 = BILD_B - X;
  if (d.abzeichen && d.titelAnpassen) rechts2 = pille(128 + 28 + dy + 38 - 30, 40, 22) - 20;
  g.fillStyle = F.sek; g.font = `600 26px ${SCHRIFT}`;
  weitere.forEach((z, i) => {
    // Lange Zeilen (Teamname · Wertung · Stand) erst bis 20 px verkleinern, dann kuerzen (08.11.2026).
    const breit = (i === 0 ? rechts2 : BILD_B - X) - tx;
    let px = 26; g.font = `600 ${px}px ${SCHRIFT}`;
    while (px > 20 && g.measureText(z).width > breit) { px -= 1; g.font = `600 ${px}px ${SCHRIFT}`; }
    g.fillText(kuerzen(g, z, breit), tx, 128 + 28 + dy + 38 * (i + 1));
  });

  // Zeilen: verfuegbare Hoehe zwischen Kopf und Logo gleichmaessig nutzen (hoechstens 80 px je Zeile).
  const zeilen = d.gruppen ? [] : d.zeilen.slice(0, 10);
  const oben = 215 + dy + 34 * weitere.length, unten = H - 150;
  const n = Math.max(zeilen.length, 1) + (d.eigene && zeilen.length ? 1.4 : 0);
  let zh = Math.min(110, Math.floor((unten - oben) / n));
  let gross = Math.round(zh * 0.5);

  const zeile = (z: BildZeile, y: number) => {
    const mitte = y + zh / 2;
    if (z.ich) { g.fillStyle = F.flaeche; g.beginPath(); g.roundRect(X - 24, y + 4, BILD_B - 2 * X + 48, zh - 8, 16); g.fill(); }
    g.textBaseline = "middle";
    g.fillStyle = z.rang <= 3 ? akzent : F.leise;
    g.font = `800 ${gross}px ${SCHRIFT}`;
    g.textAlign = "right"; g.fillText(String(z.rang), X + 50, mitte);
    g.font = `700 ${gross}px ${SCHRIFT}`; g.textAlign = "right"; g.fillStyle = akzent;
    g.fillText(z.wert, BILD_B - X, mitte);
    const wb = g.measureText(z.wert).width;
    let nx = X + 74;
    if (z.wappen) {
      const ws = Math.round(gross * 1.25), wy = mitte - ws / 2;
      const im = z.wappen.logo ? d.wappenBilder?.[z.wappen.logo] : undefined;
      g.save(); g.beginPath(); g.roundRect(nx, wy, ws, ws, 10); g.clip();
      if (im) {
        // Seitenverhaeltnis halten (object-contain wie im Web)
        const k = Math.min(ws / im.width, ws / im.height), bw = im.width * k, bh = im.height * k;
        g.drawImage(im, nx + (ws - bw) / 2, wy + (ws - bh) / 2, bw, bh);
      } else {
        g.fillStyle = d.hell ? z.wappen.flaecheHell : z.wappen.flaeche; g.fillRect(nx, wy, ws, ws);
        g.fillStyle = d.hell ? z.wappen.schriftHell : z.wappen.schrift; g.font = `700 ${Math.round(ws * 0.38)}px ${SCHRIFT}`; g.textAlign = "center";
        g.fillText(z.wappen.initialen ?? z.initialen, nx + ws / 2, mitte);
      }
      g.restore();
    }
    if (z.wappen || d.wappenPlatz) nx += Math.round(gross * 1.25) + 16;
    // Flagge 4:3 vor dem Namen, mit feinem Rand (weisse Flaggen verschwaenden sonst auf hellem Grund). Der
    // Platz bleibt auch ohne Flagge frei, damit die Namen buendig stehen (Jan, 03.11.2026).
    const fl = z.land ? d.flaggen?.[z.land] : undefined;
    const fh = Math.round(gross * 0.8), fw = Math.round(fh * 4 / 3);
    if (fl) {
      g.drawImage(fl, nx, mitte - fh / 2, fw, fh);
      g.strokeStyle = F.linie; g.lineWidth = 2; g.strokeRect(nx, mitte - fh / 2, fw, fh);
    }
    nx += fw + 16;
    // Sportart-Pillen hinter dem Namen: erst ihre Breite messen, damit der Name notfalls gekuerzt wird, nie die Pillen.
    const pp = Math.max(14, Math.round(gross * 0.5)), ph = Math.round(pp * 1.6), pad = Math.round(pp * 0.55), pg = 8;
    g.font = `600 ${pp}px ${SCHRIFT}`;
    const pb = (z.abzeichen ?? []).map((a) => g.measureText(a.text).width + 2 * pad);
    const pillen = pb.length ? pb.reduce((a, b) => a + b, 0) + pg * pb.length + 6 : 0;
    g.font = `${z.rang === 1 || z.ich ? 700 : 500} ${Math.round(gross * 0.92)}px ${SCHRIFT}`; g.textAlign = "left"; g.fillStyle = F.text;
    const name = kuerzen(g, z.name ?? "—", BILD_B - X - wb - 30 - nx - pillen);
    g.fillText(name, nx, mitte);
    let px0 = nx + g.measureText(name).width + 6 + pg;
    (z.abzeichen ?? []).forEach((a, i) => {
      const [fl, tx2] = (PILLE[a.sport] ?? PILLE_SONST)[d.hell ? "hell" : "dunkel"];
      g.fillStyle = fl; g.beginPath(); g.roundRect(px0, mitte - ph / 2, pb[i], ph, 8); g.fill();
      g.fillStyle = tx2; g.font = `600 ${pp}px ${SCHRIFT}`; g.textAlign = "center";
      g.fillText(a.text, px0 + pb[i] / 2, mitte + 1);
      px0 += pb[i] + pg;
    });
    g.textAlign = "left";
  };
  if (d.gruppen) {
    // Event-Uebersicht: Summen-Kacheln nebeneinander, darunter je Kategorie Titel + die ersten Plaetze.
    let y = oben;
    const su = d.summen ?? [];
    if (su.length) {
      const gap = 18, kb = (BILD_B - 2 * X - gap * (su.length - 1)) / su.length, kh = 150;
      su.forEach((k, i) => {
        const kx = X + i * (kb + gap);
        g.fillStyle = F.flaeche; g.beginPath(); g.roundRect(kx, y, kb, kh, 22); g.fill();
        g.strokeStyle = akzent; g.lineWidth = 3; g.stroke();
        g.textAlign = "center"; g.textBaseline = "alphabetic"; g.fillStyle = akzent;
        let px = su.length > 3 ? 46 : 56;
        g.font = `800 ${px}px ${SCHRIFT}`;
        while (px > 28 && g.measureText(k.wert).width > kb - 24) { px -= 2; g.font = `800 ${px}px ${SCHRIFT}`; }
        g.fillText(k.wert, kx + kb / 2, y + 82);
        g.fillStyle = F.sek; g.font = `600 ${su.length > 3 ? 20 : 24}px ${SCHRIFT}`;
        g.fillText(kuerzen(g, k.label, kb - 20), kx + kb / 2, y + 122);
      });
      y += kh + 40;
    }
    zh = 62; gross = 31;
    for (const gr of d.gruppen) {
      if (y + 44 + 3 * zh > H - 170) break;
      g.textAlign = "left"; g.textBaseline = "alphabetic"; g.fillStyle = F.text; g.font = `700 30px ${SCHRIFT}`;
      g.fillText(kuerzen(g, gr.titel, BILD_B - 2 * X), X, y + 30);
      y += 44;
      gr.zeilen.slice(0, 3).forEach((z, i) => {
        if (i > 0) { g.fillStyle = F.linie; g.fillRect(X, y + i * zh, BILD_B - 2 * X, 2); }
        zeile(z, y + i * zh);
      });
      if (!gr.zeilen.length) {
        g.fillStyle = F.sek; g.font = `400 26px ${SCHRIFT}`; g.textAlign = "left"; g.textBaseline = "middle";
        g.fillText(d.leer, X, y + zh / 2);
      }
      y += Math.max(1, Math.min(3, gr.zeilen.length)) * zh + 30;
    }
  }
  zeilen.forEach((z, i) => {
    if (i > 0) { g.fillStyle = F.linie; g.fillRect(X, oben + i * zh, BILD_B - 2 * X, 2); }
    zeile(z, oben + i * zh);
  });
  if (!zeilen.length && !d.gruppen) {
    g.fillStyle = F.sek; g.font = `400 34px ${SCHRIFT}`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(d.leer, BILD_B / 2, (oben + unten) / 2);
  }
  if (d.eigene && zeilen.length) {
    const ye = oben + zeilen.length * zh + Math.round(zh * 0.4);
    g.fillStyle = F.leise; g.font = `700 ${gross}px ${SCHRIFT}`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("⋮", X + 30, ye - Math.round(zh * 0.2));
    zeile({ ...d.eigene, ich: true }, ye);
  }

  // Fuss wie bei der Session-Karte: Logo unten rechts (Hoehe 54, 90 vom Rand), Motto links.
  g.textBaseline = "alphabetic";
  if (d.marke) {
    const lh = 54, lw = d.marke.width * lh / d.marke.height;
    g.drawImage(d.marke, BILD_B - X - lw, H - X, lw, lh);
  }
  // Motto in unserem Cyan (Jan, 07.11.2026), nicht in der Teamfarbe; hell die dunklere Stufe wegen des Kontrasts.
  g.fillStyle = F.akzent; g.font = `600 26px ${SCHRIFT}`; g.textAlign = "left";
  g.fillText("Have fun, keep pumping!", X, H - X + 38);
  g.fillStyle = F.leise;
  // Plattform-Liste zwischen Liste (endet bei BILD_H - 150) und Fuss, klein wie unter der Liste auf der Seite.
  if (d.quelle) {
    let px = 20;   // die volle Liste soll ganz drauf: notfalls bis 15 px kleiner
    g.font = `400 ${px}px ${SCHRIFT}`;
    while (px > 15 && g.measureText(d.quelle).width > BILD_B - 2 * X) { px -= 1; g.font = `400 ${px}px ${SCHRIFT}`; }
    g.fillText(kuerzen(g, d.quelle, BILD_B - 2 * X), X, H - X - 22);
  }
}

/** Alle Uhren, Konten und Wege, mit denen man aufnehmen kann — in JEDEM Teilen-Bild statt der Quellen der einzelnen
 *  Liste (Jan, 07.11.2026: „vollstaendige liste und garkeine einzelne quellenliste nur fuer garmin"; „das ist ja werbung
 *  fuer uns wenn die teilnehmer das am sonntag abend ueberall teilen"). Garmin steht damit auch in jedem Bild.
 *  Herstellernamen unuebersetzt, nur Handy und Datei-Upload. Neue Plattform -> hier ergaenzen. */
export function plattformZeile(t: (k: string) => string): string {
  return ["Garmin", "Apple Watch", "Wear OS", "Huawei", "Amazfit", "Suunto", "Polar", "COROS", "Xiaomi",
    t("quellen.phone"), t("quellen.file")].join(" · ");
}

/** Text als Dateinamen-Teil (Jan, 07.11.2026: „event-bezeichnung dateinamenfreundlich"): ohne Akzente, klein,
 *  nur a-z, 0-9 und Bindestriche. Schriften ohne lateinische Buchstaben ergeben "" -> Aufrufer nimmt einen Ersatz. */
export function dateiTeil(s: string | null | undefined): string {
  return (s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ß/g, "ss").replace(/[łŁ]/g, "l")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
}

/** Zeitstempel vor die Endung (lokale Zeit, „…-2026-11-07-1412.jpg"), damit Downloads sich nicht ueberschreiben. */
export function mitZeitstempel(name: string, jetzt = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const st = `${jetzt.getFullYear()}-${p(jetzt.getMonth() + 1)}-${p(jetzt.getDate())}-${p(jetzt.getHours())}${p(jetzt.getMinutes())}`;
  const i = name.lastIndexOf(".");
  return i > 0 ? `${name.slice(0, i)}-${st}${name.slice(i)}` : `${name}-${st}`;
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
