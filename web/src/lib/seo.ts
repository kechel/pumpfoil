import { useEffect } from "react";

/**
 * Titel, Beschreibung und Canonical je Seite setzen.
 *
 * Warum ueberhaupt: die App ist eine SPA mit EINER `index.html`. Ohne diesen Haken tragen alle
 * oeffentlichen Seiten denselben Titel („Pumpfoil — Pump-Foiling aufzeichnen und auswerten"),
 * und Google sieht vier Adressen mit identischem Titel und identischer Beschreibung — im
 * Browser nachgemessen am 06.09.2026. Der Titel ist das staerkste Signal, das eine Seite hat.
 *
 * React 18 kennt noch kein Hoisting von `<title>`/`<meta>` aus Komponenten (das kam erst mit 19),
 * deshalb von Hand am `document`. Beim Verlassen wird NICHTS zurueckgesetzt: die naechste Seite
 * setzt ihren eigenen Titel, und die Landing-Page traegt den aus `index.html`.
 *
 * `titel` bitte OHNE Markennamen uebergeben — der wird hier angehaengt, damit das Schlagwort
 * garantiert in jedem Titel steht und die Schreibweise nie auseinanderlaeuft.
 */
const MARKE = "Pumpfoil";

export function useSeo(titel: string, beschreibung?: string, pfad?: string): void {
  useEffect(() => {
    document.title = titel ? `${titel} — ${MARKE}` : MARKE;
    if (beschreibung) setzeMeta("description", beschreibung);
    // Canonical mitziehen: sonst zeigen alle Unterseiten auf die Startseite und Google
    // betrachtet sie als deren Duplikat.
    const url = "https://pumpfoil.org" + (pfad ?? window.location.pathname);
    let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "canonical";
      document.head.appendChild(link);
    }
    link.href = url;
    setzeMeta("og:title", titel ? `${titel} — ${MARKE}` : MARKE, true);
    if (beschreibung) setzeMeta("og:description", beschreibung, true);
    setzeMeta("og:url", url, true);
  }, [titel, beschreibung, pfad]);
}

function setzeMeta(name: string, inhalt: string, og = false): void {
  const attr = og ? "property" : "name";
  let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.content = inhalt;
}
