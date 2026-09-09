import { useCallback, useEffect, useState } from "react";
import { pfLabel } from "./pf";
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

function ExportCard({ exp, onChanged, ytReady }: { exp: ExportItem; onChanged: (list: ExportItem[]) => void; ytReady: boolean }) {
  const [showCaps, setShowCaps] = useState(false);
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

  const discard = useCallback(async () => {
    if (!confirm(`Export "${exp.name}" verwerfen?\nLöscht die ${exp.platforms.length} gerenderten Dateien` +
        (exp.source ? ` und verschiebt das Quellvideo zurück nach neue-videos-ungesichtet.` : `.`)))
      return;
    const d = await api.post<{ exports: ExportItem[]; error?: string }>("/api/discard_export", { name: exp.name });
    if (d.error) setErr(d.error);
    else onChanged(d.exports);
  }, [exp, onChanged]);

  // Beim Aufklappen: bereits generierte Texte aus dem Cache anzeigen (UI- oder YT-Batch-Cache)
  useEffect(() => {
    if (!showCaps || caps || busy) return;
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
  }, [showCaps]);

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
      }
    } catch (e) {
      setErr(String(e));
    }
    setBusy(false);
  }, [title]);

  const ytTitlesText = caps
    ? Object.entries(caps.titles).map(([l, t]) => `${l}: ${t}`).join("\n")
    : "";

  return (
    <div className="exp">
      <img className="thumb" alt="" loading="lazy"
        src={`/thumb/${encodeURIComponent(exp.files?.[thumbPf] ?? exp.name)}?t=1&base=out:${thumbPf}`}
        onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
      />
      <div className="body">
        <div className="title">{exp.name.replace(/\.mp4$/, "")}</div>
        <div className="meta">
          {new Date(exp.mtime * 1000).toLocaleString("de-DE")} ·{" "}
          {exp.platforms.map(pfLabel).join(" + ")}
          {exp.source ? ` · Quelle: ${exp.source}` : " · Quelle nicht gefunden"}
        </div>
        <div className="btns">
          <button className="btn" onClick={() => setShowCaps((s) => !s)}>
            <Icon name="wand" size={13} /> Titel &amp; Captions
          </button>
          <button className="btn" onClick={() => void api.post("/api/reveal", { name: exp.name })}>
            <Icon name="folder" size={13} /> Im Finder zeigen
          </button>
          <button className="btn" onClick={() => void discard()}>
            <Icon name="trash" size={13} /> Verwerfen
          </button>
        </div>
        {showCaps && (
          <div className="caps">
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
              <div style={{ fontSize: 12, opacity: 0.6 }}>
                📦 aus Cache geladen ({capsSource}) — „Neu generieren" erstellt frische Texte
              </div>
            )}
            {err && <div className="log">{err}</div>}
            {caps && (
              <>
                <div className="capblock">
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
                <div className="capblock">
                  <div className="caphead" data-pf="youtube"><b>YouTube</b>-Titel (Lokalisierungen) <CopyBtn text={ytTitlesText} /></div>
                  <pre>
                    {Object.entries(caps.titles).map(([l, t]) => (
                      <div key={l}>
                        <b>{LANG_LABELS[l] ?? l}:</b> {t} <CopyBtn text={t} />
                      </div>
                    ))}
                  </pre>
                </div>
                <div className="capblock">
                  <div className="caphead" data-pf="youtube">
                    <b>YouTube</b>-Kurzbeschreibung (de) — beim Push kommen Hashtags + Standard-Block je Sprache automatisch dazu
                    <CopyBtn text={`${caps.descriptions?.de ?? ""}\n\n${caps.hashtags ?? ""}`} />
                  </div>
                  <pre>{(caps.descriptions?.de ?? "") + "\n\n" + (caps.hashtags ?? "")}</pre>
                </div>
                <div className="capblock">
                  <div className="caphead" data-pf="instagram"><b>Instagram</b>-Caption <CopyBtn text={caps.instagram} /></div>
                  <pre>{caps.instagram}</pre>
                </div>
                {igLong && (
                  <div className="capblock">
                    <div className="caphead" data-pf="instagram">
                      <b>Instagram</b>-Caption + Standardblock (EN)
                      <CopyBtn text={igLong.text} />
                      <span className={"chars" + (igLong.chars > igLong.limit ? " over" : "")}>
                        {igLong.chars} / {igLong.limit}
                      </span>
                    </div>
                    <pre>{igLong.text}</pre>
                  </div>
                )}
                <div className="capblock">
                  <div className="caphead" data-pf="tiktok"><b>TikTok</b>-Caption <CopyBtn text={caps.tiktok} /></div>
                  <pre>{caps.tiktok}</pre>
                </div>
                {caps.kwai && (
                  <div className="capblock">
                    <div className="caphead" data-pf="kwai">
                      <b>Kwai</b>-Caption (pt-BR) <CopyBtn text={caps.kwai} />
                    </div>
                    <pre>{caps.kwai}</pre>
                    <div style={{ fontSize: 11, opacity: 0.6 }}>
                      Für Kwai die <b>TikTok-Datei</b> nehmen — 9:16, O-Ton, ohne lizenzierte
                      Musik. „Im Finder zeigen“ oben, dann aufs Handy und in der App hochladen;
                      eine Schnittstelle gibt es dort nicht.
                    </div>
                  </div>
                )}
                {xhs && (
                  <>
                    <div className="capblock">
                      <div className="caphead" data-pf="rednote">
                        <b>RedNote</b>-Titel ({xhs.title.length}/20 Zeichen) <CopyBtn text={xhs.title} />
                      </div>
                      <pre>{xhs.title}</pre>
                      {xhs.title_full !== xhs.title && (
                        <div style={{ fontSize: 11, opacity: 0.6 }}>
                          gekürzt aus: {xhs.title_full}
                        </div>
                      )}
                    </div>
                    <div className="capblock">
                      <div className="caphead" data-pf="rednote">
                        <b>RedNote</b>-Text — Chinesisch ({xhs.chars}/1000 Zeichen)
                        <CopyBtn text={xhs.description} />
                      </div>
                      <pre>{xhs.description}</pre>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>
                        RedNote wird über die <b>Suche</b> gefunden, nicht nur über den Feed —
                        deshalb tragen Titel und Schlagworte dort mehr als anderswo, und alte
                        Beiträge werden weiter gefunden. Video: die <b>TikTok-Datei</b> nehmen.
                      </div>
                    </div>
                  </>
                )}
                {bili && (
                  <>
                    <div className="capblock">
                      <div className="caphead" data-pf="bilibili">
                        <b>Bilibili</b>-Titel <CopyBtn text={bili.title} />
                      </div>
                      <pre>{bili.title}</pre>
                    </div>
                    <div className="capblock">
                      <div className="caphead" data-pf="bilibili">
                        <b>Bilibili</b>-Beschreibung — Englisch, Indonesisch, Thai ({bili.chars}/2000 Zeichen)
                        <CopyBtn text={bili.description} />
                      </div>
                      <pre>{bili.description}</pre>
                    </div>
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
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Uploads() {
  const [exports, setExports] = useState<ExportItem[] | null>(null);
  const [yt, setYt] = useState<YtStatus>({ configured: false, authorized: false });
  const [filter, setFilter] = useState("");

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
      <h1>Fertige Exporte ({exports.length})</h1>
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
        <ExportCard key={e.name} exp={e} onChanged={setExports} ytReady={yt.authorized} />
      ))}
    </div>
  );
}
