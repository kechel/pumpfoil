import { useCallback, useEffect, useRef, useState } from "react";
import { api, ExportItem, fmtDur } from "./api";
import { Icon } from "./icons";

// Upload-Tab: fertige Renders je Plattform sichten und koordiniert hochladen.
// YouTube: als geplantes Video (privat + publishAt). Instagram/TikTok folgen,
// sobald die jeweiligen Developer-Apps eingerichtet sind.

interface UpInfo {
  video_id?: string;
  publish_id?: string;
  publish_at?: string;
  uploaded_at?: number;
  languages?: number;
  privacy?: string;
}
type UpState = Record<string, Record<string, UpInfo>>;

const PF_LABEL: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok" };

interface UpProg { active: boolean; label: string; sent: number; total: number }

const mb = (n: number) => (n / 1048576).toFixed(1).replace(".", ",");

function ProgBar({ p }: { p: UpProg | null }) {
  if (!p?.active || !p.total) return null;
  return (
    <div className="prog" style={{ display: "block" }}>
      <div className="track">
        <div className="fill" style={{ width: `${((p.sent / p.total) * 100).toFixed(0)}%` }} />
      </div>
      <div className="txt">
        {PF_LABEL[p.label] ?? p.label}: {mb(p.sent)} / {mb(p.total)} MB
      </div>
    </div>
  );
}

function TtBanner({ status, refresh }: { status: { configured: boolean; authorized: boolean }; refresh: () => void }) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  if (status.authorized) return null;
  return (
    <div className="exp" style={{ borderColor: "#f59e0b88" }}>
      <div className="body">
        <div className="title">TikTok-Verbindung</div>
        {!status.configured ? (
          <div className="meta" style={{ fontSize: 12 }}>
            Client-Datei fehlt: <code>social-media/.tiktok-client.json</code> mit client_key + client_secret anlegen.
          </div>
        ) : (
          <>
            <div className="meta" style={{ fontSize: 12 }}>
              1. „Verbinden" öffnet den TikTok-Login. 2. Nach dem Bestätigen landest du auf pumpfoil.org/tiktok-oauth —
              die komplette Adresse aus der Browserzeile (oder nur den Code) hier einfügen.
            </div>
            <div className="genrow">
              <button className="btn primary" onClick={() => void api.post("/api/tiktok/login", {})}>
                Mit TikTok verbinden
              </button>
              <input
                value={code}
                spellCheck={false}
                placeholder="Redirect-URL oder Code hier einfügen"
                onChange={(e) => setCode(e.target.value)}
              />
              <button
                className="btn"
                disabled={!code.trim()}
                onClick={async () => {
                  const r = await api.post<{ ok?: boolean; error?: string }>("/api/tiktok/code", { code });
                  setMsg(r.error ? `❌ ${r.error}` : "✅ verbunden");
                  if (!r.error) refresh();
                }}
              >
                Code einlösen
              </button>
            </div>
            {msg && <div style={{ fontSize: 12 }}>{msg}</div>}
          </>
        )}
      </div>
    </div>
  );
}

function PublishCard({ exp, up, ytReady, ttReady, refresh }: {
  exp: ExportItem;
  up: Record<string, UpInfo> | undefined;
  ytReady: boolean;
  ttReady: boolean;
  refresh: () => void;
}) {
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [ttBusy, setTtBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [prog, setProg] = useState<UpProg | null>(null);
  const yt = up?.youtube;
  const tt = up?.tiktok;

  const pollProgress = useCallback(() => {
    return window.setInterval(async () => {
      try {
        const p = (await (await fetch("/api/upload/progress")).json()) as UpProg;
        setProg(p.active ? p : null);
      } catch {
        /* ignore */
      }
    }, 400);
  }, []);

  const uploadTt = useCallback(async () => {
    if (!confirm(`"${exp.name}" (TikTok-Variante) als Entwurf in deine TikTok-Inbox laden?`)) return;
    setTtBusy(true);
    setMsg("");
    const iv = pollProgress();
    try {
      const r = await api.post<{ ok?: boolean; error?: string }>("/api/upload/tiktok", { name: exp.name });
      setMsg(r.error ? `❌ ${r.error}` : "✅ in deiner TikTok-Inbox — in der App finalisieren");
      if (!r.error) refresh();
    } catch (e) {
      setMsg(`❌ ${e}`);
    }
    window.clearInterval(iv);
    setProg(null);
    setTtBusy(false);
  }, [exp.name, refresh, pollProgress]);

  const uploadYt = useCallback(async () => {
    if (!when) {
      setMsg("Bitte erst den Veröffentlichungszeitpunkt setzen.");
      return;
    }
    const local = new Date(when);
    if (local.getTime() < Date.now() + 5 * 60_000) {
      setMsg("Zeitpunkt liegt in der Vergangenheit (oder < 5 min) — bitte anpassen.");
      return;
    }
    if (!confirm(`"${exp.name}" zu YouTube hochladen?\nGeplante Veröffentlichung: ${local.toLocaleString("de-DE")}`)) return;
    setBusy(true);
    setMsg("");
    const iv = pollProgress();
    try {
      const r = await api.post<UpInfo & { ok?: boolean; error?: string }>(
        "/api/upload/youtube",
        { name: exp.name, publish_at: local.toISOString() },
      );
      if (r.error) setMsg(`❌ ${r.error}`);
      else {
        setMsg(`✅ hochgeladen — ${r.languages} Sprachen, Status: ${r.privacy}`);
        refresh();
      }
    } catch (e) {
      setMsg(`❌ ${e}`);
    }
    window.clearInterval(iv);
    setProg(null);
    setBusy(false);
  }, [when, exp.name, refresh, pollProgress]);

  return (
    <div className="exp">
      <div className="body">
        <div className="title">{exp.name.replace(/\.mp4$/, "")}</div>
        <div className="meta">
          {new Date(exp.mtime * 1000).toLocaleString("de-DE")}
          {exp.duration ? ` · ${fmtDur(exp.duration)}` : ""}
        </div>
        <div className="pubvids">
          {(["youtube", "instagram", "tiktok"] as const).map((pf) =>
            exp.platforms.includes(pf) ? (
              <figure key={pf}>
                <video
                  controls
                  preload="none"
                  poster={`/thumb/${encodeURIComponent(exp.name)}?t=1&base=out:${pf}`}
                  src={`/media/out/${pf}/${encodeURIComponent(exp.name)}`}
                />
                <figcaption>
                  {PF_LABEL[pf]}
                  {exp.sizes?.[pf] ? ` · ${(exp.sizes[pf] / 1048576).toFixed(1).replace(".", ",")} MB` : ""}
                </figcaption>
              </figure>
            ) : null,
          )}
        </div>
        <div className="genrow" style={{ alignItems: "center" }}>
          <label style={{ fontSize: 12, whiteSpace: "nowrap" }}>
            Veröffentlichen am{" "}
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>
          {yt?.video_id ? (
            <a
              className="btn"
              href={`https://studio.youtube.com/video/${yt.video_id}/edit`}
              target="_blank"
              rel="noreferrer"
            >
              ✅ YT geplant
              {yt.publish_at ? ` (${new Date(yt.publish_at).toLocaleString("de-DE")})` : ""} — im Studio öffnen
            </a>
          ) : (
            <button
              className="btn primary"
              disabled={!ytReady || busy || !when}
              title={ytReady ? "Upload als geplantes Video (privat bis zum Termin)" : "Erst im Texte-Tab mit YouTube verbinden"}
              onClick={() => void uploadYt()}
            >
              {busy ? <span className="spin" /> : <><Icon name="upload" size={13} /> → YouTube (geplant)</>}
            </button>
          )}
          <button className="btn" disabled title="Kommt als Nächstes — braucht eine Meta-Developer-App (Business-Konto). Cross-Post zu Facebook dann automatisch.">
            → Instagram
          </button>
          {tt?.publish_id ? (
            <span className="btn" style={{ cursor: "default" }}>
              ✅ TT-Entwurf in der Inbox
              {tt.uploaded_at ? ` (${new Date(tt.uploaded_at * 1000).toLocaleString("de-DE")})` : ""}
            </span>
          ) : (
            <button
              className="btn"
              disabled={!ttReady || ttBusy || !exp.platforms.includes("tiktok")}
              title={ttReady ? "Als Entwurf in deine TikTok-Inbox (Feinschliff + Posten in der App)" : "Erst oben mit TikTok verbinden"}
              onClick={() => void uploadTt()}
            >
              {ttBusy ? <span className="spin" /> : "→ TikTok (Entwurf)"}
            </button>
          )}
        </div>
        <ProgBar p={prog} />
        {msg && <div style={{ fontSize: 12 }}>{msg}</div>}
      </div>
    </div>
  );
}

export default function Publish() {
  const [exports, setExports] = useState<ExportItem[] | null>(null);
  const [up, setUp] = useState<UpState>({});
  const [ytReady, setYtReady] = useState(false);
  const [tt, setTt] = useState({ configured: false, authorized: false });
  // Knoten merken (nie auf null zurücksetzen — beim Unmount brauchen wir ihn noch)
  const rootRef = useRef<HTMLDivElement | null>(null);
  const setRoot = useCallback((el: HTMLDivElement | null) => {
    if (el) rootRef.current = el;
  }, []);

  // Tab verlassen → laufende Vorschauen stoppen (sonst spielen sie
  // aus dem DOM entfernt unsichtbar weiter)
  useEffect(
    () => () => {
      rootRef.current?.querySelectorAll("video").forEach((v) => {
        v.pause();
        v.removeAttribute("src");
        v.load();
      });
    },
    [],
  );

  const refresh = useCallback(() => {
    void fetch("/api/exports").then(async (r) => setExports((await r.json()).exports));
    void fetch("/api/uploads").then(async (r) => setUp((await r.json()).state ?? {}));
    void fetch("/api/yt/status").then(async (r) => setYtReady((await r.json()).authorized));
    void fetch("/api/tiktok/status").then(async (r) => setTt(await r.json()));
  }, []);

  useEffect(() => refresh(), [refresh]);

  if (!exports) return <div className="uploads">lade …</div>;
  return (
    <div className="uploads" ref={setRoot}>
      <h1>Upload ({exports.length})</h1>
<TtBanner status={tt} refresh={refresh} />
      {exports.length === 0 && <div style={{ opacity: 0.6 }}>Noch keine Renders in shorts-mit-musik/.</div>}
      {exports.map((e) => (
        <PublishCard key={e.name} exp={e} up={up[e.name]} ytReady={ytReady} ttReady={tt.authorized} refresh={refresh} />
      ))}
    </div>
  );
}
