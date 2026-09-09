import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { api, Captions, ExportItem } from "./api";
import { Icon } from "./icons";

// Zusatz = deutsche Sprachbezeichnung, wie sie im YT Studio auszuwählen ist
const LANG_LABELS: Record<string, string> = {
  de: "🇩🇪 Deutsch",
  en: "🇬🇧 Englisch",
  fr: "🇫🇷 Französisch",
  it: "🇮🇹 Italienisch",
  es: "🇪🇸 Spanisch",
  fi: "🇫🇮 Finnisch",
  nl: "🇳🇱 Niederländisch",
  cs: "🇨🇿 Tschechisch",
  pt: "🇧🇷 Portugiesisch (Brasilien)",
  ja: "🇯🇵 Japanisch",
  zh: "🇨🇳 Chinesisch (vereinfacht)",
  ru: "🇷🇺 Russisch",
  id: "🇮🇩 Indonesisch",
  pl: "🇵🇱 Polnisch",
  ar: "🇸🇦 Arabisch",
  vi: "🇻🇳 Vietnamesisch",
  tr: "🇹🇷 Türkisch",
  th: "🇹🇭 Thai",
};

function CoverPic({ exp, t, mode, eigen }: {
  exp: ExportItem; t: number; mode: "blur" | "crop"; eigen?: boolean;
}) {
  const src = `/cover/${encodeURIComponent(exp.files?.instagram ?? exp.name)}` +
    `?t=${t.toFixed(1)}&base=instagram&mode=${mode}`;
  return (
    <a href={src} download title={`bei ${t.toFixed(1)} s`}>
      <img src={src} alt={`Cover bei ${t.toFixed(1)} s`} loading="lazy" />
      <span>{t.toFixed(1)} s{eigen ? " (eigen)" : ""}</span>
    </a>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      className="mini"
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 1200);
      }}
    >
      <Icon name="copy" size={11} /> {ok ? "kopiert!" : "kopieren"}
    </button>
  );
}

/** Eine Zelle der Texttabelle: zugeklappt EINE Zeile mit … und anklickbar zum
 *  Kopieren, aufgeklappt der volle Text (Jan, 09.09.: „den titel einzeilig mit
 *  .. so wie platz ist anklickbar zum kopieren, und rechts die beschreibung"). */
function CapCell({ copy, zeile, children }:
                 { copy?: string; zeile?: string; children?: ReactNode }) {
  const [ok, setOk] = useState(false);
  if (!copy) return <div className="capcell leer" />;
  const kopieren = () => {
    void navigator.clipboard.writeText(copy);
    setOk(true);
    setTimeout(() => setOk(false), 1200);
  };
  return (
    <div
      className={"capcell" + (ok ? " ok" : "")}
      role="button"
      tabIndex={0}
      title="Klicken kopiert den ganzen Text"
      onClick={kopieren}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); kopieren(); }
      }}
    >
      <div className="einzeiler">{(zeile ?? copy).replace(/\s+/g, " ").trim()}</div>
      <div className="voll">{children ?? <pre>{copy}</pre>}</div>
      <span className="kopiert">kopiert!</span>
    </div>
  );
}

/** Eine Zeile: Plattformname farbig und fett, dann Titel und Beschreibung. */
function CapRow({ pf, name, title, desc, titleZeile, titleFull, descFull }: {
  pf: string; name: string; title?: string; desc?: string; titleZeile?: string;
  titleFull?: ReactNode; descFull?: ReactNode;
}) {
  return (
    <div className="caprow" data-pf={pf}>
      <div className="pfname">{name}</div>
      <CapCell copy={title} zeile={titleZeile}>{titleFull}</CapCell>
      <CapCell copy={desc}>{descFull}</CapCell>
    </div>
  );
}

interface YtStatus {
  configured: boolean;
  authorized: boolean;
}

function YtBanner({ status, refresh }: { status: YtStatus; refresh: () => void }) {
  const [waiting, setWaiting] = useState(false);
  if (status.authorized) return null;
  return (
    <div className="exp" style={{ borderColor: "#f59e0b88" }}>
      <div className="body">
        <div className="title">YouTube-Verbindung</div>
        {!status.configured ? (
          <div className="meta" style={{ fontSize: 12 }}>
            Client-Secret fehlt: OAuth-Client (Desktop-App) in der Google Cloud Console anlegen und die
            JSON-Datei als <code>social-media/.yt-client-secret.json</code> speichern — dann hier neu laden.
          </div>
        ) : (
          <div className="btns">
            <button
              className="btn primary"
              disabled={waiting}
              onClick={async () => {
                setWaiting(true);
                await api.post("/api/yt/login", {});
                const iv = window.setInterval(async () => {
                  const s = await (await fetch("/api/yt/status")).json();
                  if (s.authorized) {
                    window.clearInterval(iv);
                    setWaiting(false);
                    refresh();
                  }
                }, 1500);
              }}
            >
              {waiting ? "Warte auf Google-Login im Browser …" : "Mit YouTube verbinden"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ExportCard({ exp, ytReady, showTexts }: {
  exp: ExportItem; ytReady: boolean; showTexts: boolean;
}) {
  // Frisch erzeugte Texte zeigt die Karte von sich aus — genau die will man
  // ja gerade lesen (Jan, 09.09.). Der Schalter oben gilt fuer alles andere.
  const [frisch, setFrisch] = useState(false);
  const [title, setTitle] = useState(() =>
    exp.name
      .replace(/\.mp4$/, "")
      .replace(/^\d+-/, "")
      .replace(/^Pumpfoil-\d+-/i, "")
      .replace(/-pixabay-\d+/gi, "") // Lizenz-ID gehört nicht in den Arbeitstitel
      .replace(/-/g, " "),
  );
  const [caps, setCaps] = useState<Captions | null>(null);
  const [bili, setBili] = useState<{ title: string; description: string; chars: number } | null>(null);
  const [xhs, setXhs] = useState<{ title: string; title_full: string; description: string; chars: number } | null>(null);
  const [igLong, setIgLong] = useState<{ text: string; chars: number; limit: number } | null>(null);
  const [coverT, setCoverT] = useState("");   // eigener Zeitpunkt fürs Cover
  const [capsSource, setCapsSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ytUrl, setYtUrl] = useState("");
  const [ytBusy, setYtBusy] = useState(false);
  const [ytMsg, setYtMsg] = useState("");

  const thumbPf = exp.platforms.includes("tiktok") ? "tiktok" : exp.platforms[0];


  // Erst laden, wenn die Karte ins Bild kommt. Seit die Karten immer offen sind
  // (Jan, 09.09.) wuerden sonst alle 181 gleichzeitig /api/captions_cache
  // abfragen, und jede Abfrage liest den 876 KB grossen YT-Batch-Cache neu.
  const kartenRef = useRef<HTMLDivElement>(null);
  const [imBild, setImBild] = useState(false);
  useEffect(() => {
    const el = kartenRef.current;
    if (!el || imBild) return;
    const beobachter = new IntersectionObserver((eintraege) => {
      if (eintraege.some((e) => e.isIntersecting)) {
        setImBild(true);
        beobachter.disconnect();
      }
    }, { rootMargin: "300px" });
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, [imBild]);

  // Texte aus dem Cache anzeigen (UI- oder YT-Batch-Cache).
  useEffect(() => {
    if (!imBild || caps || busy) return;
    void fetch(`/api/captions_cache?name=${encodeURIComponent(exp.name)}`)
      .then(async (r) => r.json() as Promise<{
        cached: Captions | null; source?: string;
        bilibili?: { title: string; description: string; chars: number };
        rednote?: { title: string; title_full: string; description: string; chars: number };
        instagram_long?: { text: string; chars: number; limit: number };
      }>)
      .then((d) => {
        if (d.cached) {
          setCaps(d.cached);
          setBili(d.bilibili ?? null);
        setXhs(d.rednote ?? null);
          setXhs(d.rednote ?? null);
        setIgLong(d.instagram_long?.text ? d.instagram_long : null);
          setCapsSource(d.source === "yt-batch" ? "YouTube-Batch-Cache" : "früher generiert");
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imBild]);

  const generate = useCallback(async () => {
    setBusy(true);
    setErr("");
    setCaps(null);
    setCapsSource("");
    try {
      const d = await api.post<Captions & {
        error?: string; bilibili?: { title: string; description: string; chars: number };
        rednote?: { title: string; title_full: string; description: string; chars: number };
        instagram_long?: { text: string; chars: number; limit: number };
      }>("/api/captions", { title, name: exp.name });
      if (d.error) setErr(d.error);
      else {
        setCaps(d);
        setBili(d.bilibili ?? null);
        setIgLong(d.instagram_long?.text ? d.instagram_long : null);
        setFrisch(true);
      }
    } catch (e) {
      setErr(String(e));
    }
    setBusy(false);
  }, [title]);

  // Textfelder: der Schalter oben, oder frisch erzeugt. Die Bedienzeilen
  // (Arbeitstitel, Generieren, YouTube-Push) haengen daran mit dran — ausser
  // es gibt fuer das Video noch gar keine Texte, dann braucht man sie ja.
  const zeigeTexte = showTexts || frisch;

  const ytTitlesText = caps
    ? Object.entries(caps.titles).map(([l, t]) => `${l}: ${t}`).join("\n")
    : "";

  return (
    <div className="exp" ref={kartenRef}>
      <img className="thumb" alt="" loading="lazy"
        src={`/thumb/${encodeURIComponent(exp.files?.[thumbPf] ?? exp.name)}?t=1&base=out:${thumbPf}`}
        onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
      />
      <div className="body">
        <div className="title">{exp.name.replace(/\.mp4$/, "")}</div>
        <div className={"caps" + (zeigeTexte ? "" : " nurkoepfe")
                        + (zeigeTexte || !caps ? "" : " ohnebedienung")}>
            <div className="genrow">
              <input
                value={title}
                spellCheck={false}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Arbeitstitel / worum geht's im Video?"
              />
              <button className="btn primary" disabled={busy || !title.trim()} onClick={() => void generate()}>
                {busy ? <span className="spin" /> : caps ? "Neu generieren" : "Generieren"}
              </button>
            </div>
            {busy && <div style={{ fontSize: 12, opacity: 0.6 }}>Claude formuliert Titel in 10 Sprachen + Captions … (~30–60 s)</div>}
            {capsSource && caps && (
              <div className="quelle">
                📦 aus Cache geladen ({capsSource}) — „Neu generieren" erstellt frische Texte
              </div>
            )}
            {err && <div className="log">{err}</div>}
            {caps && (
              <>
                <div className="capblock bedien">
                  <div className="caphead" data-pf="youtube">Zu <b>YouTube</b> pushen (Titel-Lokalisierungen + Beschreibung)</div>
                  <div className="genrow">
                    <input
                      value={ytUrl}
                      spellCheck={false}
                      onChange={(e) => setYtUrl(e.target.value)}
                      placeholder="YouTube-Link des hochgeladenen Videos (Studio- oder youtu.be-Link)"
                    />
                    <button
                      className="btn primary"
                      disabled={!ytReady || ytBusy || !ytUrl.trim()}
                      title={ytReady ? "" : "Erst oben mit YouTube verbinden"}
                      onClick={async () => {
                        setYtBusy(true);
                        setYtMsg("");
                        const r = await api.post<{ ok?: boolean; written?: string[]; error?: string }>(
                          "/api/yt/localize",
                          { url: ytUrl, titles: caps.titles, descriptions: caps.descriptions, hashtags: caps.hashtags },
                        );
                        setYtMsg(r.error ? `❌ ${r.error}` : `✅ ${r.written?.length ?? 0} Sprachen geschrieben`);
                        setYtBusy(false);
                      }}
                    >
                      {ytBusy ? <span className="spin" /> : "→ YouTube"}
                    </button>
                  </div>
                  {ytMsg && <div style={{ fontSize: 12 }}>{ytMsg}</div>}
                </div>
                {/* Eine Zeile je Plattform: Name farbig und fett, dann Titel und
                    Beschreibung — beide einzeilig mit … und anklickbar zum Kopieren.
                    Aufgeklappt steht in denselben Zellen der volle Text. */}
                <div className="captab">
                  <div className="caprow kopf">
                    <div />
                    <div>Titel</div>
                    <div>Beschreibung</div>
                  </div>
                  <CapRow
                    pf="youtube" name="YouTube"
                    title={ytTitlesText}
                    titleZeile={caps.titles?.de}
                    desc={`${caps.descriptions?.de ?? ""}\n\n${caps.hashtags ?? ""}`}
                    titleFull={
                      <pre>
                        {Object.entries(caps.titles).map(([l, tt]) => (
                          <div key={l}>
                            <b>{LANG_LABELS[l] ?? l}:</b> {tt} <CopyBtn text={tt} />
                          </div>
                        ))}
                      </pre>
                    }
                  />
                  {/* Nur die lange Fassung (Caption + Standardblock) — die kurze
                      braucht Jan nicht, kopiert wird ohnehin immer der ganze Text. */}
                  <CapRow pf="instagram" name="Instagram" desc={igLong?.text ?? caps.instagram}
                    descFull={igLong && (
                      <>
                        <pre>{igLong.text}</pre>
                        <div className={"note" + (igLong.chars > igLong.limit ? " over" : "")}>
                          {igLong.chars} / {igLong.limit} Zeichen
                        </div>
                      </>
                    )} />
                  <CapRow pf="tiktok" name="TikTok" desc={caps.tiktok} />
                  {caps.kwai && (
                    <CapRow pf="kwai" name="Kwai" desc={caps.kwai}
                      descFull={
                        <>
                          <pre>{caps.kwai}</pre>
                          <div className="note">
                            Für Kwai die <b>TikTok-Datei</b> nehmen — 9:16, O-Ton, ohne
                            lizenzierte Musik. Datei aus shorts-mit-musik/tiktok/ aufs Handy und
                            in der App hochladen; eine Schnittstelle gibt es dort nicht.
                          </div>
                        </>
                      } />
                  )}
                  {xhs && (
                    <CapRow pf="rednote" name="RedNote" title={xhs.title} desc={xhs.description}
                      titleFull={
                        <>
                          <pre>{xhs.title}</pre>
                          <div className="note">
                            {xhs.title.length}/20 Zeichen
                            {xhs.title_full !== xhs.title ? ` · gekürzt aus: ${xhs.title_full}` : ""}
                          </div>
                        </>
                      }
                      descFull={
                        <>
                          <pre>{xhs.description}</pre>
                          <div className="note">
                            {xhs.chars}/1000 Zeichen · RedNote wird über die <b>Suche</b> gefunden,
                            nicht nur über den Feed — deshalb tragen Titel und Schlagworte dort
                            mehr als anderswo. Video: die <b>TikTok-Datei</b> nehmen.
                          </div>
                        </>
                      } />
                  )}
                  {bili && (
                    <CapRow pf="bilibili" name="Bilibili" title={bili.title} desc={bili.description}
                      descFull={
                        <>
                          <pre>{bili.description}</pre>
                          <div className="note">
                            {bili.chars}/2000 Zeichen · Englisch, Indonesisch, Thai
                          </div>
                        </>
                      } />
                  )}
                </div>
                {bili && (
                  <div className="capblock">
                      <div className="caphead">
                        Cover-Vorschläge (1920×1080) — anklicken zum Herunterladen
                      </div>
                      {([
                        ["blur", "ganzes Bild, unscharfe Ränder"],
                        ["crop", "Bildmitte, randlos beschnitten"],
                      ] as const).map(([mode, label]) => (
                        <div key={mode} style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 3 }}>{label}</div>
                          <div className="covers">
                            {[0.2, 0.5, 0.8].map((f) => {
                              const t = Math.max(0.5, (exp.duration ?? 20) * f);
                              return <CoverPic key={f} exp={exp} t={t} mode={mode} />;
                            })}
                            {(() => {
                              const t = parseFloat(coverT.replace(",", "."));
                              if (!isFinite(t) || t < 0) return null;
                              const tt = Math.min(Math.max(t, 0), Math.max(0, (exp.duration ?? 1e9) - 0.1));
                              return <CoverPic exp={exp} t={tt} mode={mode} eigen />;
                            })()}
                          </div>
                        </div>
                      ))}
                      <div className="genrow" style={{ alignItems: "center" }}>
                        <label style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                          eigener Zeitpunkt{" "}
                          <input
                            type="number" min={0} max={exp.duration ?? undefined} step={0.5}
                            style={{ width: 72 }} value={coverT} placeholder="Sek."
                            onChange={(e) => setCoverT(e.target.value)}
                          />{" "}
                          s{exp.duration ? ` (Video: ${exp.duration.toFixed(1)} s)` : ""}
                        </label>
                        {coverT && (
                          <button className="mini" onClick={() => setCoverT("")}>zurücksetzen</button>
                        )}
                      </div>
                    </div>
                )}
              </>
            )}
        </div>
      </div>
    </div>
  );
}

export default function Uploads() {
  const [exports, setExports] = useState<ExportItem[] | null>(null);
  const [yt, setYt] = useState<YtStatus>({ configured: false, authorized: false });
  const [filter, setFilter] = useState("");
  // Ein Schalter fuer die ganze Ansicht: die Textfelder sind zum Kopieren da,
  // nicht zum Lesen — aufgeklappt scrollt man sich sonst tot. Die Ueberschriften
  // bleiben immer stehen, und die kopieren ja selbst.
  const [showTexts, setShowTexts] = useState(
    () => localStorage.getItem("shorts_showtexts") === "1");
  const toggleTexts = () => setShowTexts((s) => {
    localStorage.setItem("shorts_showtexts", s ? "0" : "1");
    return !s;
  });

  const refreshYt = useCallback(() => {
    void fetch("/api/yt/status").then(async (r) => setYt(await r.json()));
  }, []);

  useEffect(() => {
    void fetch("/api/exports").then(async (r) => setExports((await r.json()).exports));
    refreshYt();
  }, [refreshYt]);

  if (!exports) return <div className="uploads">lade …</div>;
  // Begriffe einzeln, Reihenfolge egal — "152" oder "clean dropstart" finden
  // dasselbe. Bei 181 Exporten sonst nur Scrollen.
  const begriffe = filter.toLowerCase().split(/[\s-]+/).filter(Boolean);
  const sichtbar = exports.filter((e) => {
    const n = e.name.toLowerCase();
    return begriffe.every((s) => n.includes(s));
  });
  return (
    <div className="uploads">
      <div className="uphead">
        <h1>Fertige Exporte ({exports.length})</h1>
        <button className={"btn" + (showTexts ? " primary" : "")} onClick={toggleTexts}>
          <Icon name={showTexts ? "eye" : "eyeoff"} size={13} />{" "}
          Textfelder {showTexts ? "ausblenden" : "einblenden"}
        </button>
      </div>
      <YtBanner status={yt} refresh={refreshYt} />
      <div className="expfilter">
        <input
          type="search"
          placeholder="Exporte filtern — Nummer oder Stichwort …"
          spellCheck={false}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setFilter("");
          }}
        />
        {filter.trim() && (
          <button className="btn" onClick={() => setFilter("")}>
            {sichtbar.length}/{exports.length} ✕
          </button>
        )}
      </div>
      {exports.length === 0 && <div style={{ opacity: 0.6 }}>Noch keine Renders in shorts-mit-musik/.</div>}
      {exports.length > 0 && sichtbar.length === 0 && (
        <div style={{ opacity: 0.6 }}>Kein Export passt zum Filter.</div>
      )}
      {sichtbar.map((e) => (
        <ExportCard key={e.name} exp={e} ytReady={yt.authorized} showTexts={showTexts} />
      ))}
    </div>
  );
}
