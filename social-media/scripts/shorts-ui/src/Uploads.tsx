import { useCallback, useEffect, useState } from "react";
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
};

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
    exp.name.replace(/\.mp4$/, "").replace(/^\d+-/, "").replace(/^Pumpfoil-\d+-/i, "").replace(/-/g, " "),
  );
  const [caps, setCaps] = useState<Captions | null>(null);
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

  const generate = useCallback(async () => {
    setBusy(true);
    setErr("");
    setCaps(null);
    try {
      const d = await api.post<Captions & { error?: string }>("/api/captions", { title });
      if (d.error) setErr(d.error);
      else setCaps(d);
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
        src={`/thumb/${encodeURIComponent(exp.name)}?t=1&base=out:${thumbPf}`}
        onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")}
      />
      <div className="body">
        <div className="title">{exp.name.replace(/\.mp4$/, "")}</div>
        <div className="meta">
          {new Date(exp.mtime * 1000).toLocaleString("de-DE")} ·{" "}
          {exp.platforms.map((p) => (p === "youtube" ? "YT" : p === "instagram" ? "IG" : "TT")).join(" + ")}
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
                {busy ? <span className="spin" /> : "Generieren"}
              </button>
            </div>
            {busy && <div style={{ fontSize: 12, opacity: 0.6 }}>Claude formuliert Titel in 10 Sprachen + Captions … (~30–60 s)</div>}
            {err && <div className="log">{err}</div>}
            {caps && (
              <>
                <div className="capblock">
                  <div className="caphead">Zu YouTube pushen (Titel-Lokalisierungen + Beschreibung)</div>
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
                          { url: ytUrl, titles: caps.titles, description: caps.yt_description },
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
                  <div className="caphead">YouTube-Titel (Lokalisierungen) <CopyBtn text={ytTitlesText} /></div>
                  <pre>
                    {Object.entries(caps.titles).map(([l, t]) => (
                      <div key={l}>
                        <b>{LANG_LABELS[l] ?? l}:</b> {t} <CopyBtn text={t} />
                      </div>
                    ))}
                  </pre>
                </div>
                <div className="capblock">
                  <div className="caphead">YouTube-Beschreibung <CopyBtn text={caps.yt_description} /></div>
                  <pre>{caps.yt_description}</pre>
                </div>
                <div className="capblock">
                  <div className="caphead">Instagram-Caption <CopyBtn text={caps.instagram} /></div>
                  <pre>{caps.instagram}</pre>
                </div>
                <div className="capblock">
                  <div className="caphead">TikTok-Caption <CopyBtn text={caps.tiktok} /></div>
                  <pre>{caps.tiktok}</pre>
                </div>
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

  const refreshYt = useCallback(() => {
    void fetch("/api/yt/status").then(async (r) => setYt(await r.json()));
  }, []);

  useEffect(() => {
    void fetch("/api/exports").then(async (r) => setExports((await r.json()).exports));
    refreshYt();
  }, [refreshYt]);

  if (!exports) return <div className="uploads">lade …</div>;
  return (
    <div className="uploads">
      <h1>Fertige Exporte ({exports.length})</h1>
      <YtBanner status={yt} refresh={refreshYt} />
      {exports.length === 0 && <div style={{ opacity: 0.6 }}>Noch keine Renders in shorts-mit-musik/.</div>}
      {exports.map((e) => (
        <ExportCard key={e.name} exp={e} onChanged={setExports} ytReady={yt.authorized} />
      ))}
    </div>
  );
}
