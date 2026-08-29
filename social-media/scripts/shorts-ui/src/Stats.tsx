// Auswertungs-Tab: liest /api/stats (die von stats-snapshot.py gefüllte
// SQLite-Datei) und stellt die Zahlen aller vier Kanäle nebeneinander.
//
// Leitgedanke aus den bisherigen Auswertungen: Reichweite und Resonanz sind
// zwei verschiedene Dinge. Facebook holt die meisten Aufrufe, Instagram die
// meisten Likes je 1000 Aufrufe — deshalb steht überall beides nebeneinander
// und der Median statt des Durchschnitts (fünf Ausreißer tragen zwei Drittel
// der FB-Reichweite, ein Mittelwert wäre dort schlicht gelogen).
import { useEffect, useMemo, useState } from "react";
import {
  BarList, Legend, LineChart, PLATFORMS, PLAT_COLOR, PLAT_LABEL, Platform,
  Scatter, Series, fmt, fmt1, median,
} from "./viz";

interface Post {
  platform: Platform; post_id: string; number: number | null;
  published_at: string | null; title: string | null;
  views: number | null; likes: number | null; comments: number | null;
  shares: number | null; prev_views: number | null; prev_at: string | null; at: string;
}
interface Chan {
  platform: Platform; posts: number; views: number; likes: number | null;
  comments: number | null; followers: number | null; at: string;
}
interface Demo {
  platform: string; metric: string; timeframe: string; breakdown: string;
  dimension: string; value: number; at: string;
}
interface StatsData {
  ok: boolean; reason?: string; db_kb?: number;
  snapshots: { id: number; at: string; note: string | null }[];
  channels: Chan[]; history: Chan[]; posts: Post[]; demographics: Demo[];
  errors?: { platform: string; error: string; at: string }[];
}

type View = "ueberblick" | "videos" | "laender" | "luecken";
const VIEWS: [View, string][] = [
  ["ueberblick", "Überblick"], ["videos", "Videos"],
  ["laender", "Länder"], ["luecken", "Lücken"],
];

const DAY = 86400e3;
const iso = (s: string | null) => (s ? new Date(s).getTime() : 0);
const deDate = (t: number) => new Date(t).toLocaleDateString("de-DE",
  { day: "2-digit", month: "2-digit" });
// ISO-Kalenderwoche — Montag als Wochenstart, wie in Jans Postplan.
function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const w = Math.ceil(((+t - +y0) / DAY + 1) / 7);
  return `${t.getUTCFullYear()}-KW${String(w).padStart(2, "0")}`;
}
const per1k = (p: Post) => (p.views ? ((p.likes || 0) / p.views) * 1000 : 0);

const COUNTRY: Record<string, string> = {
  DE: "Deutschland", AT: "Österreich", CH: "Schweiz", FR: "Frankreich", IT: "Italien",
  ES: "Spanien", PL: "Polen", NL: "Niederlande", CZ: "Tschechien", GB: "Großbritannien",
  US: "USA", BR: "Brasilien", PT: "Portugal", IR: "Iran", TR: "Türkei", IQ: "Irak",
  UZ: "Usbekistan", IN: "Indien", MA: "Marokko", SY: "Syrien", DZ: "Algerien",
  RU: "Russland", ID: "Indonesien", TH: "Thailand", VN: "Vietnam", JP: "Japan",
  CN: "China", KG: "Kirgisistan", TJ: "Tadschikistan", TN: "Tunesien", SA: "Saudi-Arabien",
  JO: "Jordanien", AZ: "Aserbaidschan", CA: "Kanada", AU: "Australien", MX: "Mexiko",
  EG: "Ägypten", PK: "Pakistan", BD: "Bangladesch", NG: "Nigeria", ZA: "Südafrika",
};
const land = (c: string) => COUNTRY[c] || c;

export default function Stats() {
  const [d, setD] = useState<StatsData | null>(null);
  const [err, setErr] = useState("");
  const [view, setView] = useState<View>("ueberblick");
  const [on, setOn] = useState<Record<Platform, boolean>>(
    { youtube: true, facebook: true, instagram: true, tiktok: true });
  const [days, setDays] = useState(0);          // 0 = alles
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"views" | "per1k" | "number" | "date">("views");

  const load = () => {
    fetch("/api/stats").then((r) => r.json()).then(setD)
      .catch((e) => setErr(String(e)));
  };
  useEffect(load, []);

  const active = PLATFORMS.filter((p) => on[p]);
  const cutoff = days ? Date.now() - days * DAY : 0;

  const posts = useMemo(() => {
    if (!d) return [];
    return d.posts.filter((p) => on[p.platform]
      && (!cutoff || iso(p.published_at) >= cutoff)
      && (!q || (p.title || "").toLowerCase().includes(q.toLowerCase())
        || String(p.number ?? "").includes(q)));
  }, [d, on, cutoff, q]);

  if (err) return <div className="stats"><p className="muted">Fehler: {err}</p></div>;
  if (!d) return <div className="stats"><p className="muted"><span className="spin" /> lädt …</p></div>;
  if (!d.ok) {
    return (
      <div className="stats">
        <div className="hint">
          <b>Noch keine Auswertungsdaten.</b><br />{d.reason}<br /><br />
          <code>cd social-media &amp;&amp; ./scripts/stats-snapshot.py</code><br />
          Danach sammelt der launchd-Timer <code>org.pumpfoil.stats-snapshot</code>
          täglich um 21:30 automatisch weiter.
        </div>
      </div>
    );
  }

  return (
    <div className="stats">
      {/* Filter in einer Zeile über den Diagrammen */}
      <div className="filterbar">
        {VIEWS.map(([k, lbl]) => (
          <button key={k} className={`chip ${view === k ? "on" : ""}`}
                  onClick={() => setView(k)}>{lbl}</button>
        ))}
        <span className="sep" />
        {PLATFORMS.map((p) => (
          <button key={p} className={`chip pf ${on[p] ? "on" : ""}`}
                  onClick={() => setOn({ ...on, [p]: !on[p] })}>
            <i style={{ background: PLAT_COLOR[p] }} />{PLAT_LABEL[p]}
          </button>
        ))}
        <span className="sep" />
        {[[0, "alles"], [30, "30 Tage"], [90, "90 Tage"]].map(([v, l]) => (
          <button key={String(v)} className={`chip ${days === v ? "on" : ""}`}
                  onClick={() => setDays(v as number)}>{l as string}</button>
        ))}
        <input className="find" placeholder="Titel oder Nummer suchen …"
               value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="mini" onClick={load} style={{ marginLeft: "auto" }}>neu laden</button>
      </div>

      <div className="scroll statsbody">
        {view === "ueberblick" && <Ueberblick d={d} posts={posts} active={active} />}
        {view === "videos" && <Videos d={d} posts={posts} active={active}
                                     sort={sort} setSort={setSort} />}
        {view === "laender" && <Laender d={d} />}
        {view === "luecken" && <Luecken d={d} />}

        <p className="dbnote">
          {d.snapshots.length} Snapshots · ältester {d.snapshots[0]?.at.slice(0, 10)} ·
          Datenbank {fmt(d.db_kb)} KB
          {d.errors?.length ? ` · letzter Lauf mit Fehler: ${d.errors.map((e) => e.platform).join(", ")}` : ""}
        </p>
      </div>
    </div>
  );
}

/* =========================================================== Überblick === */
function Ueberblick({ d, posts, active }: { d: StatsData; posts: Post[]; active: Platform[] }) {
  const byPf = (p: Platform) => posts.filter((x) => x.platform === p);
  const hist: Series[] = active.map((p) => ({
    key: p, label: PLAT_LABEL[p], color: PLAT_COLOR[p],
    points: d.history.filter((h) => h.platform === p)
      .map((h) => ({ x: iso(h.at), y: h.views })),
  })).filter((s) => s.points.length > 1);

  // Median je Kalenderwoche — die Größe, die den FB-Anstieg sichtbar gemacht hat
  const weeks = useMemo(() => {
    const m = new Map<string, Map<Platform, number[]>>();
    posts.forEach((p) => {
      if (!p.published_at || !p.views) return;
      const w = isoWeek(new Date(p.published_at));
      if (!m.has(w)) m.set(w, new Map());
      const g = m.get(w)!;
      g.set(p.platform, [...(g.get(p.platform) || []), p.views]);
    });
    return [...m.entries()].sort().slice(-10);
  }, [posts]);
  const wMax = Math.max(1, ...weeks.flatMap(([, g]) => [...g.values()].map(median)));

  return (
    <>
      <div className="kpis">
        {active.map((p) => {
          const ps = byPf(p);
          const ch = d.channels.find((c) => c.platform === p);
          const vs = ps.map((x) => x.views || 0);
          const growing = ps.filter((x) => x.prev_views !== null && (x.views || 0) > x.prev_views!);
          return (
            <div className="kpi" key={p} style={{ borderTopColor: PLAT_COLOR[p] }}>
              <h3><i style={{ background: PLAT_COLOR[p] }} />{PLAT_LABEL[p]}</h3>
              <div className="big">{fmt(vs.reduce((a, b) => a + b, 0))}</div>
              <div className="sub">Aufrufe · {ps.length} Beiträge</div>
              <dl>
                <div><dt>Median</dt><dd>{fmt(Math.round(median(vs)))}</dd></div>
                <div><dt>Likes/1000</dt><dd>{fmt1(median(ps.map(per1k)))}</dd></div>
                <div><dt>Follower</dt><dd>{ch?.followers ? fmt(ch.followers) : "—"}</dd></div>
                <div><dt>zuletzt gewachsen</dt><dd>{growing.length}</dd></div>
              </dl>
            </div>
          );
        })}
      </div>

      <section>
        <h3>Aufrufe insgesamt im Zeitverlauf</h3>
        {hist.length ? (
          <>
            <Legend items={active.map((p) => ({ label: PLAT_LABEL[p], color: PLAT_COLOR[p] }))} />
            <LineChart series={hist} yLabel="Aufrufe" xFormat={(x) => deDate(x)} />
          </>
        ) : (
          <p className="muted">
            Erst ab dem zweiten Snapshot mit veränderten Zahlen zeichenbar — der Timer
            sammelt täglich um 21:30 weiter.
          </p>
        )}
      </section>

      <section>
        <h3>Median-Aufrufe je Kalenderwoche <span className="q">nach Veröffentlichungsdatum</span></h3>
        <Legend items={active.map((p) => ({ label: PLAT_LABEL[p], color: PLAT_COLOR[p] }))} />
        <div className="weeks">
          {weeks.map(([w, g]) => (
            <div className="week" key={w}>
              <div className="cols">
                {active.map((p) => {
                  const v = g.get(p);
                  const m = v ? median(v) : 0;
                  return (
                    <span key={p} className="wcol" title={`${PLAT_LABEL[p]}: ${fmt(Math.round(m))} (n=${v?.length || 0})`}>
                      <b style={{ height: `${(m / wMax) * 100}%`, background: PLAT_COLOR[p] }} />
                    </span>
                  );
                })}
              </div>
              <span className="wlbl">{w.split("-")[1]}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3>Reichweite gegen Resonanz <span className="q">Aufrufe (logarithmisch) × Likes je 1000</span></h3>
        <p className="muted small">
          Ein Feld je Plattform statt vier Farben in einem Bild — bei einer Punktwolke
          steht jedes Farbpaar gegen jedes andere, dafür reichen vier unterscheidbare
          Töne nicht. Punkt anklicken kopiert die Videonummer.
        </p>
        <div className="facets">
          {active.map((p) => (
            <Scatter key={p} color={PLAT_COLOR[p]} title={PLAT_LABEL[p]}
                     points={posts.filter((x) => x.platform === p && x.views)
                       .map((x) => ({
                         id: p + x.post_id, x: x.views!, y: per1k(x),
                         label: (x.number ? `#${x.number} · ` : "") + (x.title || "").slice(0, 60),
                       }))}
                     onPick={(id) => navigator.clipboard?.writeText(id)} />
          ))}
        </div>
      </section>
    </>
  );
}

/* ============================================================== Videos === */
function Videos({ d, posts, active, sort, setSort }: {
  d: StatsData; posts: Post[]; active: Platform[];
  sort: string; setSort: (s: any) => void;
}) {
  // Ein Video kann auf mehreren Plattformen liegen — hier je Nummer zusammengezogen.
  const rows = useMemo(() => {
    const m = new Map<number, { n: number; title: string; by: Partial<Record<Platform, Post>> }>();
    posts.forEach((p) => {
      if (p.number === null) return;
      if (!m.has(p.number)) m.set(p.number, { n: p.number, title: "", by: {} });
      const r = m.get(p.number)!;
      r.by[p.platform] = p;
      if (!r.title && p.title) r.title = p.title.replace(/\s+/g, " ").slice(0, 70);
    });
    const list = [...m.values()];
    const tot = (r: typeof list[0]) =>
      active.reduce((a, p) => a + (r.by[p]?.views || 0), 0);
    const res = (r: typeof list[0]) => {
      const ps = active.map((p) => r.by[p]).filter(Boolean) as Post[];
      return ps.length ? median(ps.map(per1k)) : 0;
    };
    list.sort((a, b) =>
      sort === "number" ? b.n - a.n
        : sort === "per1k" ? res(b) - res(a)
          : sort === "date" ? iso(Object.values(b.by)[0]?.published_at ?? null)
            - iso(Object.values(a.by)[0]?.published_at ?? null)
            : tot(b) - tot(a));
    return list;
  }, [posts, active, sort]);

  const unmatched = posts.filter((p) => p.number === null).length;

  return (
    <section>
      <h3>Jedes Video über alle Plattformen <span className="q">{rows.length} Nummern</span></h3>
      <div className="sortrow">
        sortieren:
        {[["views", "Aufrufe"], ["per1k", "Likes/1000"], ["number", "Nummer"], ["date", "Datum"]]
          .map(([k, l]) => (
            <button key={k} className={`mini ${sort === k ? "sel" : ""}`}
                    onClick={() => setSort(k)}>{l}</button>
          ))}
        {unmatched > 0 && (
          <span className="muted small">
            {unmatched} Beiträge ohne erkennbare Nummer (ältere Posts, fremdsprachige
            Captions) — sie fehlen in dieser Tabelle, nicht in den Summen.
          </span>
        )}
      </div>
      <div className="tblwrap">
        <table className="stat">
          <thead>
            <tr>
              <th>Nr</th><th>Titel</th>
              {active.map((p) => (
                <th key={p} colSpan={2} className="pfhead">
                  <i style={{ background: PLAT_COLOR[p] }} />{PLAT_LABEL[p]}
                </th>
              ))}
            </tr>
            <tr className="sub">
              <th /><th />
              {active.map((p) => (
                <>
                  <th key={p + "v"}>Aufrufe</th>
                  <th key={p + "l"}>/1000</th>
                </>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 300).map((r) => (
              <tr key={r.n}>
                <td className="num">{String(r.n).padStart(3, "0")}</td>
                <td className="ttl" title={r.title}>{r.title}</td>
                {active.map((p) => {
                  const x = r.by[p];
                  return (
                    <>
                      <td key={p + "v"} className="n">{x ? fmt(x.views) : <span className="gap">–</span>}</td>
                      <td key={p + "l"} className="n dim">{x && x.views ? fmt1(per1k(x)) : ""}</td>
                    </>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ============================================================== Länder === */
function Laender({ d }: { d: StatsData }) {
  const metrics = useMemo(() => {
    const s = new Set<string>();
    d.demographics.forEach((x) => s.add(`${x.platform}|${x.metric}|${x.timeframe}`));
    return [...s].sort();
  }, [d]);
  const [sel, setSel] = useState(metrics[0] || "");
  const [bd, setBd] = useState("country");
  const cur = sel || metrics[0] || "";
  const [pf, metric, tf] = cur.split("|");

  const rows = useMemo(() => {
    const r = d.demographics
      .filter((x) => x.platform === pf && x.metric === metric
        && x.timeframe === tf && x.breakdown === bd)
      .sort((a, b) => b.value - a.value);
    const tot = r.reduce((a, b) => a + b.value, 0) || 1;
    return r.slice(0, 20).map((x) => ({
      label: bd === "country" ? `${land(x.dimension)} (${x.dimension})` : x.dimension,
      value: x.value, sub: `${((x.value / tot) * 100).toFixed(1)} %`,
    }));
  }, [d, pf, metric, tf, bd]);

  // Der interessanteste Vergleich: wen erreicht der Kanal gegen wen er hält?
  const compare = useMemo(() => {
    const grab = (m: string, t: string) => {
      const r = d.demographics.filter((x) => x.metric === m && x.timeframe === t
        && x.breakdown === "country");
      const tot = r.reduce((a, b) => a + b.value, 0) || 1;
      return new Map(r.map((x) => [x.dimension, (x.value / tot) * 100]));
    };
    const reach = grab("reached_audience_demographics", "this_month");
    const foll = grab("follower_demographics", "lifetime");
    if (!reach.size || !foll.size) return [];
    return [...new Set([...reach.keys(), ...foll.keys()])]
      .map((c) => ({ c, r: reach.get(c) || 0, f: foll.get(c) || 0 }))
      .filter((x) => x.r >= 1 || x.f >= 2)
      .sort((a, b) => b.r - a.r).slice(0, 14);
  }, [d]);

  if (!metrics.length) {
    return (
      <section>
        <h3>Länder</h3>
        <div className="hint">
          Bisher liefert nur <b>Instagram</b> Länderdaten. Facebook braucht dafür den
          Scope <code>read_insights</code> in der Meta-App; YouTube die aktivierte
          YouTube-Analytics-API plus <code>yt-analytics.readonly</code>. Beides holt
          der Sammler automatisch ab, sobald es freigeschaltet ist — die
          Fehlversuche stehen bis dahin im Roh-Archiv.
        </div>
      </section>
    );
  }
  return (
    <>
      <section>
        <h3>Wen der Kanal erreicht — und wen er behält</h3>
        {compare.length ? (
          <>
            <p className="muted small">
              Links der Anteil an den <b>erreichten</b> Konten dieses Monats, rechts der
              Anteil an den <b>Followern</b>. Klaffen die auseinander, spielt der
              Algorithmus in Regionen aus, die nicht hängenbleiben.
            </p>
            <table className="stat cmp">
              <thead><tr><th>Land</th><th>erreicht</th><th>Follower</th><th>Differenz</th></tr></thead>
              <tbody>
                {compare.map((x) => (
                  <tr key={x.c}>
                    <td>{land(x.c)}</td>
                    <td className="n">{x.r.toFixed(1)} %</td>
                    <td className="n">{x.f.toFixed(1)} %</td>
                    <td className={"n " + (x.r - x.f > 5 ? "warn" : x.f - x.r > 5 ? "good" : "dim")}>
                      {(x.r - x.f > 0 ? "+" : "") + (x.r - x.f).toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : <p className="muted">Für den Vergleich fehlen noch Follower- oder Reichweitendaten.</p>}
      </section>
      <section>
        <h3>Verteilung im Detail</h3>
        <div className="sortrow">
          <select value={cur} onChange={(e) => setSel(e.target.value)}>
            {metrics.map((m) => {
              const [p, me, t] = m.split("|");
              const nice: Record<string, string> = {
                follower_demographics: "Follower",
                reached_audience_demographics: "erreichte Konten",
                engaged_audience_demographics: "interagierende Konten",
              };
              const tn: Record<string, string> = {
                lifetime: "gesamt", this_week: "diese Woche", this_month: "dieser Monat",
              };
              return <option key={m} value={m}>{PLAT_LABEL[p as Platform] || p} · {nice[me] || me} · {tn[t] || t}</option>;
            })}
          </select>
          {["country", "city", "age", "gender"].map((b) => (
            <button key={b} className={`mini ${bd === b ? "sel" : ""}`} onClick={() => setBd(b)}>
              {{ country: "Land", city: "Stadt", age: "Alter", gender: "Geschlecht" }[b]}
            </button>
          ))}
        </div>
        {rows.length
          ? <BarList rows={rows} color={PLAT_COLOR[(pf as Platform)] || "var(--s-ig)"} />
          : <p className="muted">Für diese Kombination liegen keine Werte vor.</p>}
      </section>
    </>
  );
}

/* ============================================================== Lücken === */
// Welche Videos liegen auf YouTube, aber noch nicht auf den anderen Kanälen?
function Luecken({ d }: { d: StatsData }) {
  const [target, setTarget] = useState<Platform>("facebook");
  const gaps = useMemo(() => {
    const have = new Map<Platform, Set<number>>();
    PLATFORMS.forEach((p) => have.set(p, new Set()));
    d.posts.forEach((p) => { if (p.number !== null) have.get(p.platform)!.add(p.number); });
    const yt = new Map<number, Post>();
    d.posts.forEach((p) => { if (p.platform === "youtube" && p.number !== null) yt.set(p.number, p); });
    return [...yt.values()]
      .filter((p) => !have.get(target)!.has(p.number!))
      .sort((a, b) => (b.views || 0) - (a.views || 0));
  }, [d, target]);

  // Ein Beitrag ohne erkennbare Nummer sieht wie eine Lücke aus, ist aber keine.
  const blind = d.posts.filter((p) => p.platform === target && p.number === null).length;

  return (
    <section>
      <h3>Noch nicht gepostet <span className="q">Basis: alle nummerierten YouTube-Videos</span></h3>
      <div className="sortrow">
        Ziel:
        {PLATFORMS.filter((p) => p !== "youtube").map((p) => (
          <button key={p} className={`mini ${target === p ? "sel" : ""}`}
                  onClick={() => setTarget(p)}>{PLAT_LABEL[p]}</button>
        ))}
        <span className="muted small">{gaps.length} Lücken</span>
      </div>
      {blind > 0 && (
        <p className="muted small warnnote">
          Achtung: {blind} {PLAT_LABEL[target]}-Beiträge lassen sich keiner Nummer
          zuordnen (ältere Posts ohne Caption, fremdsprachige Texte). Sie zählen hier
          fälschlich als Lücke — die echte Zahl liegt entsprechend niedriger.
        </p>
      )}
      <p className="muted small">
        Nach YouTube-Aufrufen sortiert — das ist ein schwacher Hinweis, mehr nicht:
        die Kanäle belohnen Verschiedenes. Auf Facebook zieht, wo etwas passiert oder
        erklärt wird; schöne Glides laufen dort regelmäßig unter 1000, auf YouTube
        dagegen stark. Die Reihenfolge hier ersetzt kein Draufschauen.
      </p>
      <div className="tblwrap">
        <table className="stat">
          <thead><tr><th>Nr</th><th>Titel</th><th>YT-Aufrufe</th><th>YT /1000</th></tr></thead>
          <tbody>
            {gaps.slice(0, 200).map((p) => (
              <tr key={p.post_id}>
                <td className="num">{String(p.number).padStart(3, "0")}</td>
                <td className="ttl">{(p.title || "").replace(/^\d+\s+/, "")}</td>
                <td className="n">{fmt(p.views)}</td>
                <td className="n dim">{fmt1(per1k(p))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
