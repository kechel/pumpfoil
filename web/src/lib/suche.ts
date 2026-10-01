// Suchtext vergleichbar machen — dieselbe Regel wie der Server (server/app/suche.py).
//
// Anlass (Jan, 01.10.2026): in den Uhren-Stats fand „vivo" nichts, obwohl Strg-F im Browser gleich
// mehrere „vívoactive®" zeigte — Garmin schreibt seine Modelle mit Akzent (vívoactive, fēnix) und
// ®. Dieselbe Falle bei Spots („zurich" fand Zürich nicht) und im Katalog („fone" fand F-One nicht).
// Regel: der Suchtext zerfaellt in WORTE, jedes muss vorkommen; verglichen wird klein, ohne Akzente,
// ohne Bindestriche, Leerzeichen und ®™©.
const MEHR: Record<string, string> = { "ß": "ss", "æ": "ae", "œ": "oe" };
const EXTRA: Record<string, string> = { "ł": "l", "đ": "d", "ø": "o", "ı": "i", "ħ": "h", "þ": "t" };

export function suchform(s: string | null | undefined): string {
  let x = (s ?? "").toLowerCase();   // VOR den Buchstaben unten, sonst bleibt das grosse Ł stehen
  x = x.replace(/[ßæœ]/g, (c) => MEHR[c]).replace(/[łđøıħþ]/g, (c) => EXTRA[c]);
  x = x.normalize("NFD").replace(/[̀-ͯ]/g, "");   // Akzente weg: í -> i, ē -> e, ü -> u
  return x.replace(/[-‐–—_®™©'’\s]/g, "");
}

/** Suchtext -> Woerter in Suchform. */
export function suchworte(q: string | null | undefined): string[] {
  return (q ?? "").split(/\s+/).map(suchform).filter(Boolean);
}

/** Kommt jedes Wort der Suche `q` in `text` vor? Leere Suche passt immer. */
export function passtZu(text: string | null | undefined, q: string): boolean {
  const ws = suchworte(q);
  if (ws.length === 0) return true;
  const t = suchform(text);
  return ws.every((w) => t.includes(w));
}
