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

/**
 * Adresse der oeffentlichen Startseite in einer Sprache. Deutsch liegt auf `/` und bekommt
 * KEIN eigenes `/de/` — sonst gaebe es zwei Adressen mit identischem Inhalt, und genau davor
 * warnt Google („Duplikat ohne Canonical"). `/` traegt deshalb `hreflang="de"` und zugleich
 * `x-default` (s. index.html).
 */
export function sprachPfad(code: string): string {
  return code === "de" ? "/" : `/${code}/`;
}

/** Adresse von „Warum pumpfoil.org?" in einer Sprache (02.11.2026): Deutsch auf /why-pumpfoil, sonst /<code>/why-pumpfoil —
 * wie die Startseite, damit jede Sprache eine eigene, indexierbare Adresse hat. Englischer Name in der Adresse (Jan). */
export function warumPfad(code: string): string {
  return code === "de" ? "/why-pumpfoil" : `/${code}/why-pumpfoil`;
}

/** Sprachen mit eigener Adresse, wie in index.html und sitemap.xml (ohne pt-PT, das dort ebenfalls fehlt). */
export const SEO_SPRACHEN = ["de", "gsw", "de-AT", "en", "fr", "it", "es", "fi", "nl", "cs", "pl", "pt", "ja", "zh", "ru", "id", "nb"];

/** hreflang-Verweise fuer eine Seite, die es in allen Sprachen gibt; beim Verlassen wieder entfernt. */
export function useHreflang(pfad: (code: string) => string): void {
  useEffect(() => {
    const links = [...SEO_SPRACHEN.map((c) => [c, pfad(c)]), ["x-default", pfad("de")]].map(([c, p]) => {
      const l = document.createElement("link");
      l.rel = "alternate"; l.hreflang = c; l.href = "https://pumpfoil.org" + p;
      l.dataset.seite = "1";
      document.head.appendChild(l);
      return l;
    });
    // Die festen Verweise der Startseite (index.html) gelten hier nicht.
    const fest = [...document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]:not([data-seite])')];
    fest.forEach((l) => l.remove());
    return () => { links.forEach((l) => l.remove()); fest.forEach((l) => document.head.appendChild(l)); };
  }, [pfad]);
}

export function useSeo(titel: string, beschreibung?: string, pfad?: string): void {
  useEffect(() => {
    // Marke nur anhaengen, wenn sie nicht schon drinsteht — sonst „Pumpfoil … — Pumpfoil".
    document.title = !titel ? MARKE : titel.includes(MARKE) ? titel : `${titel} — ${MARKE}`;
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
