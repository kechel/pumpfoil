import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useT } from "../i18n";
import { api } from "../lib/api";
import { ScrollToTop } from "../components/ScrollToTop";
import { CHANGELOG_SEEN_KEY } from "../lib/changelogLatest";
import { ChevronIcon } from "../components/Icons";

// Inline-Links in Changelog-Items: [label](/interner-pfad) oder [label](https://extern).
function ItemText({ text }: { text: string }): ReactNode {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0, i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const [, label, href] = m;
    out.push(href.startsWith("/")
      ? <Link key={i++} to={href} className="text-brand-400 hover:underline">{label}</Link>
      : <a key={i++} href={href} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">{label}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/**
 * „Wo steht welche App gerade?" — ganz oben auf der Changelog-Seite, fuer alle sichtbar
 * (Jan, 05.09.2026). Drei Zustaende: im Store, in der Pruefung, und was als Naechstes kommt.
 *
 * Die Daten kommen komplett vom Server (`GET /api/app/releases`). Die LIVE-Zeilen stammen dort
 * aus `appmeta._APP_META` — derselben Quelle, aus der die Apps ihren Update-Hinweis holen.
 * Damit kann diese Tabelle gar nicht behaupten, eine Version sei draussen, die die Apps noch
 * nicht angeboten bekommen. Die beiden anderen Abschnitte werden in `appmeta.py` von Hand
 * gepflegt; die Regel, wann, steht dort im Kommentar.
 *
 * Faellt der Abruf aus, verschwindet der Block einfach — das Changelog darunter ist die
 * eigentliche Seite und soll nie an einer Nebensache haengen.
 */
// Eine Zeile = eine Einreichung. Handy und Uhr stehen deshalb zusammen in `name`,
// ihre Versionen in `version` ("1.1.25 / 1.2.25") — s. `appmeta.GRUPPEN`.
type Release = { name: string; version: string; note?: string; store_url?: string; items?: string[] };

/** Aufklappbare Punkteliste einer Fassung — zu, bis man sie aufmacht.
 *
 *  Bewusst `<details>`/`<summary>` statt eigenem Zustand: das Aufklappen funktioniert damit ohne
 *  JavaScript-Zustand, ist per Tastatur bedienbar und bringt die Vorlese-Semantik mit. Der
 *  Der Standard-Marker wird ZWEIMAL abgeschaltet: `list-none` fuer Chrome/Firefox und
 *  `[&::-webkit-details-marker]:hidden` fuer WebKit — Safari und die iOS-PWA zeigen das
 *  Dreieck sonst zusaetzlich zu unserem eigenen Pfeil.
 */
function Details({ anzahl, children }: { anzahl: number; children: ReactNode }) {
  const t = useT();
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-brand-400 hover:underline [&::-webkit-details-marker]:hidden">
        <ChevronIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
        {t("changelog.details", { n: String(anzahl) })}
      </summary>
      <div className="mt-1.5">{children}</div>
    </details>
  );
}


/** Ein aktuell bekanntes Problem — die Warnbox ganz oben. */
type Problem = { titel: string; text: string; note?: string };

/** Warnbox ueber bekannte Probleme, die JETZT Nutzer treffen.
 *
 *  Warum ueber der Release-Tabelle und nicht darin: die Tabelle sagt, welche Fassung wo steht,
 *  aber nicht, dass die live stehende kaputt ist. Ein Amazfit-Nutzer liest dort „Amazfit 1.0.8"
 *  und haelt das fuer den Normalbetrieb, waehrend ihm Aufnahmen abbrechen (Jan, 18.09.2026).
 *
 *  Der Server liefert die Liste; ist sie leer, verschwindet der ganze Block. Die Wartezeile
 *  („waiting for the Zepp store since 13 September — 6 days") wird dort ERZEUGT, damit die Zahl
 *  von selbst weiterlaeuft, statt von Hand nachgepflegt zu werden und zu veralten.
 */
function BekannteProbleme({ probleme }: { probleme: Problem[] }) {
  if (!probleme.length) return null;
  return (
    <section className="mb-6 rounded-xl border border-amber-600/40 bg-amber-500/10 p-4">
      <h2 className="mb-2 text-sm font-bold text-amber-800 dark:text-amber-300">Known problems right now</h2>
      <ul className="space-y-2">
        {probleme.map((p, i) => (
          <li key={i} className="text-sm text-amber-800 dark:text-amber-200">
            <span className="font-semibold">{p.titel}:</span> {p.text}
            {p.note && (
              <div className="mt-0.5 text-amber-700 dark:text-amber-400">{p.note}</div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReleaseStatus() {
  const [daten, setDaten] = useState<{
    live: Release[]; review: Release[]; rejected?: Release[]; next: Release[];
    ideen?: string[]; probleme?: Problem[];
  } | null>(null);
  useEffect(() => { api.appReleases().then(setDaten).catch(() => setDaten(null)); }, []);
  if (!daten) return null;

  // Farben je Abschnitt (Jan, 05.09.). Jede Farbe wird fuer BEIDE Modi gesetzt: die dunklen
  // Toene verschwinden auf hellem Grund fast, deshalb im Light-Mode jeweils die kraeftigere
  // Stufe derselben Farbfamilie (s. Marken-Cyan, das als brand-400 auf Weiss zu blass ist).
  const gruppen: { titel: string; farbe: string; zeilen: Release[] }[] = [
    { titel: "Live now", farbe: "text-brand-700 dark:text-brand-400", zeilen: daten.live },
    { titel: "Being reviewed", farbe: "text-emerald-700 dark:text-emerald-400", zeilen: daten.review },
    // Abgelehnt steht ZWISCHEN Review und Coming next, weil es genau dort passiert: die Fassung
    // war in Pruefung, kam nicht durch, der Nachfolger steht als Naechstes an. Die Zeile bleibt,
    // bis dieser Nachfolger freigegeben ist — sonst faellt die Erklaerung weg, warum die
    // angekuendigten Punkte immer noch fehlen (Jan, 10.09.2026). Amber statt Rot: es ist eine
    // Verzoegerung, kein Ausfall.
    //
    // Das Ausblenden macht der SERVER (`appmeta._noch_offen`): sobald jede Spur der abgelehnten
    // Fassung live ueberholt ist, liefert `rejected` sie nicht mehr mit. Hier also nichts filtern
    // — sonst gibt es zwei Wahrheiten.
    { titel: "Rejected", farbe: "text-amber-700 dark:text-amber-400", zeilen: daten.rejected ?? [] },
    // #ff5500 ist die Wunschfarbe; auf Weiss ist sie fuer kleine Versalien zu hell, dort eine
    // Stufe dunkler derselben Farbe.
    { titel: "Coming next", farbe: "text-[#c24100] dark:text-[#ff5500]", zeilen: daten.next },
  ].filter((g) => g.zeilen.length > 0);

  return (
    <>
    <BekannteProbleme probleme={daten.probleme ?? []} />
    <section className="mb-8 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <h2 className="mb-1 text-sm font-bold text-slate-100">Release status</h2>
      <p className="mb-3 text-sm text-slate-400">
        Where everything stands right now — website, phone apps and watch apps.
      </p>
      {/* KEINE Tabelle mehr. Auf dem Handy (390 px) lag die dritte Spalte komplett jenseits des
          rechten Rands: die Notizen waren NICHT lesbar, "always up to date" brach als
          "always up to da" ab, und ihr Umbruch in der unsichtbaren Spalte blies die Zeilenhoehen
          zu leeren Bloecken auf (Jans Befund 10.09.2026, im Screenshot nachgestellt). Ursache war
          `whitespace-nowrap` auf Name UND Version: "Android phone + Wear OS" und "1.1.28 / 1.2.28"
          belegen zusammen rund 250 der 360 px, der Rest floss nach rechts hinaus.

          Jetzt: auf schmalen Schirmen GESTAPELT (Name, Version, Notiz je eine Zeile), ab sm die
          drei Spalten wie vorher. Nichts scrollt mehr seitwaerts, nichts wird abgeschnitten.

          Die ersten zwei Spalten haben FESTE Breiten, keine `max-content`. Grund: jede Zeile ist
          ihr eigenes Grid, `max-content` wird also je Zeile gerechnet und die Spalten fluchten
          nicht (gemessen: Notiz-Beginn sprang zwischen x=420 und x=540). Feste Breiten sind fuer
          alle Zeilen dieselbe Vorlage. 13rem traegt "Android phone + Wear OS", 9rem "1.1.28 /
          1.2.28"; laengere Namen brechen darin um, statt das Raster zu sprengen. */}
      <div className="text-sm">
        {gruppen.map((g) => (
          <Fragment key={g.titel}>
            <div className={`pb-1 pt-3 text-xs font-semibold uppercase tracking-wide ${g.farbe}`}>
              {g.titel}
            </div>
            {g.zeilen.map((r) => (
              <Fragment key={`${g.titel}-${r.name}`}>
                <div className="border-t border-slate-800/70 py-2 sm:grid sm:grid-cols-[13rem_9rem_1fr] sm:gap-x-3 sm:py-1.5">
                  {/* Auf dem Handy traegt der Name die Zeile, deshalb dort etwas fetter. */}
                  <div className="font-medium text-slate-200 sm:font-normal">{r.name}</div>
                  <div className="font-medium text-slate-100">
                    {r.store_url
                      ? <a href={r.store_url} target="_blank" rel="noopener noreferrer"
                           className="text-brand-400 hover:underline">{r.version}</a>
                      : r.version}
                  </div>
                  {r.note && <div className="text-slate-400">{r.note}</div>}
                </div>
                {/* Was in dieser Fassung steckt. Ohne das stehen die Aenderungen einer
                    eingereichten Version nirgends, bis sie veroeffentlicht ist.
                    EINGEKLAPPT als Standard (Jan, 07.09.2026): die Uebersicht soll auf einen
                    Blick zeigen, WO etwas steht — die Punktelisten sind schnell laenger als
                    die Tabelle selbst und schoben das Changelog darunter aus dem Bild. */}
                {r.items && r.items.length > 0 && (
                  <div className="pb-2 pl-1">
                    <Details anzahl={r.items.length}>
                      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
                        {r.items.map((txt, i) => <li key={i}>{txt}</li>)}
                      </ul>
                    </Details>
                  </div>
                )}
              </Fragment>
            ))}
          </Fragment>
        ))}
      </div>
      <Ideen ideen={daten.ideen ?? []} />
    </section>
    </>
  );
}

// „Ideas for future development" — der unterste Abschnitt der Release-Uebersicht.
//
// BEWUSST OHNE Versionsnummer, Reihenfolge oder Termin: das hier ist kein Fahrplan, sondern
// was wir vorhaben. Die Liste kommt vom Server (`appmeta.IDEEN`), damit ein neuer Punkt keinen
// Neubau der PWA braucht — dieselbe Ueberlegung wie beim Changelog selbst.
//
// Die Zeile darunter fuehrt ins Feedback-Fenster (dasselbe Ereignis wie `MissingHint`), damit
// aus einer Idee im Kopf eines Fahrers eine Zeile in unserer Liste werden kann.
function Ideen({ ideen }: { ideen: string[] }) {
  if (!ideen.length) return null;
  return (
    <div className="mt-4 border-t border-slate-800/70 pt-3">
      <div className="pb-1 text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-400">
        Ideas for future development
      </div>
      <p className="mb-2 text-sm text-slate-400">
        No dates and no order — things we would like to build.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
        {ideen.map((txt, i) => <li key={i}>{txt}</li>)}
      </ul>
      <p className="mt-3 text-sm text-slate-300">
        Do you have an idea or a bug report you want added to the roadmap?{" "}
        <button
          type="button"
          className="font-semibold text-brand-600 underline hover:no-underline dark:text-brand-400"
          onClick={() => window.dispatchEvent(new CustomEvent("open-feedback"))}
        >
          Send us your input via feedback
        </button>
      </p>
    </div>
  );
}

// Nutzer-sichtbares Changelog — seit 07.09.2026 aus der DATENBANK (`changelog_items`,
// `GET /api/app/changelog`), vorher ein festes Array genau hier.
//
// Zwei Gruende, beide von Jan: jede Textzeile brauchte einen Neubau der PWA, und im Array stand
// der 7. September zweimal und der 6. dreimal. Der Server gruppiert jetzt nach einem echten
// Datum — ein doppelter Tag ist damit nicht mehr moeglich, und ein neuer Punkt ist eine Zeile
// in der Tabelle.
//
// Ein Punkt kann ein Bild tragen (`img`), das UNTER ihm gerendert wird.
type Item = {
  text: string; img?: string; img_alt?: string; mit_update?: string;
  // "ereignis" = ein Schritt im Store-Lauf (eingereicht / freigegeben), kein Funktionspunkt.
  // Fehlt das Feld, ist es ein normaler Punkt — der Server schickt nur die Ausnahme mit.
  art?: string;
  // Welche Plattform braucht welche App-Version fuer diesen Punkt? Leer/fehlt = gilt ueberall
  // sofort (Web- und Serveraenderungen sind mit dem Deploy da). Ohne diese Marke stand ein
  // Punkt, den nur eine Uhr kann, ohne jeden Hinweis darauf in der Liste (Befund 11.09.2026).
  plattformen?: { name: string; version: string }[];
};
type Entry = { date: string; items: Item[] };

// Das Datum wie bisher englisch ausgeschrieben („September 7, 2026"). Die Seite ist bewusst
// englisch (s. Memory `changelog-page`), deshalb hier fest "en" und nicht die Nutzersprache.
function tagLang(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" })
      .format(new Date(iso + "T12:00:00"));
  } catch { return iso; }
}

// Das Datum des neuesten Eintrags liegt jetzt in `lib/changelogLatest` — es kommt vom Server
// und laesst sich deshalb nicht mehr als Konstante exportieren. Der Re-Export haelt die
// bisherigen Importstellen am Leben.
export { CHANGELOG_SEEN_KEY };

export default function Changelog() {
  const t = useT();
  const [tage, setTage] = useState<Entry[] | null>(null);
  const [fehler, setFehler] = useState(false);
  useEffect(() => {
    api.changelog().then((d) => {
      setTage(d.days);
      // Beim Öffnen als gesehen merken -> Menü-Highlight verschwindet. Erst NACH dem Laden,
      // sonst gilt ein Eintrag als gesehen, den man nie zu sehen bekam.
      if (d.latest) {
        try { localStorage.setItem(CHANGELOG_SEEN_KEY, d.latest); } catch { /* ignore */ }
      }
    }).catch(() => setFehler(true));
  }, []);
  return (
    <div className="mx-auto max-w-2xl p-6"
         style={{ paddingTop: "calc(1.5rem + env(safe-area-inset-top))" }}>
      <ScrollToTop />
      <Link to="/" className="text-sm text-brand-400 hover:underline">{t("common.back")}</Link>
      <h1 className="mb-4 mt-4 text-xl font-bold">{t("nav.changelog")}</h1>

      <ReleaseStatus />

      {tage === null && !fehler && (
        <p className="text-sm text-slate-400">{t("common.loading")}</p>
      )}
      {fehler && <p className="text-sm text-slate-400">{t("common.loadFailed")}</p>}

      <div className="space-y-8">
        {(tage ?? []).map((e) => (
          <section key={e.date}>
            <h2 className="mb-2 text-sm font-semibold text-brand-600 dark:text-brand-300">{tagLang(e.date)}</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-200">
              {e.items.map((it, i) => (
                // Store-Ereignisse stehen ohne Aufzaehlungspunkt und gedaempft: sie erzaehlen
                // nicht, was du kannst, sondern wo eine Fassung steht. Die SCHRIFTGROESSE bleibt
                // gleich — kleiner setzen waere genau der Fehler, den die Regel „Hinweise nie
                // winzig" meint.
                <li key={i}
                    className={it.art === "ereignis"
                      ? "-ml-5 list-none border-l-2 border-slate-700 pl-3 text-slate-400"
                      : undefined}>
                  <ItemText text={it.text} />
                  {(it.plattformen ?? []).map((p) => (
                    <span key={p.name}
                      className="ml-1.5 whitespace-nowrap rounded-full bg-slate-800/60 px-2 py-0.5 align-middle text-xs font-medium text-slate-300">
                      {p.name} {p.version}
                    </span>
                  ))}
                  {it.img && (
                    <img src={it.img} alt={it.img_alt ?? ""} loading="lazy"
                      className="mt-2 w-full max-w-[260px] rounded-lg border border-slate-800" />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
