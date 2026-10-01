// Suchtext vergleichbar machen: Gross/klein, Akzente und Markenzeichen zaehlen nicht.
//
// Anlass (Jan, 01.10.2026): in den Uhren-Stats fand „vivo" nichts, obwohl Strg-F im Browser gleich
// mehrere „vívoactive®" zeigte — Garmin schreibt seine Modelle mit Akzent (vívoactive, fēnix) und
// ®. Dieselbe Falle bei Spots: „zurich" fand Zürich nicht, „krakow" nicht Kraków. Der Browser
// vergleicht ohne Akzente; unsere Suchfelder tun es jetzt auch.
export function suchform(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")   // Akzente weg: í -> i, ē -> e, ü -> u
    .replace(/[®™©]/g, "")
    .toLowerCase()   // VOR den Buchstaben unten, sonst bleibt das grosse Ł in „Łódź" stehen
    .replace(/ß/g, "ss").replace(/ø/g, "o").replace(/æ/g, "ae").replace(/ł/g, "l")
    .replace(/\s+/g, " ").trim();
}

/** Enthaelt `text` die Suche `q` (beides in Suchform)? Leere Suche passt immer. */
export function passtZu(text: string | null | undefined, q: string): boolean {
  const s = suchform(q);
  return !s || suchform(text).includes(s);
}
