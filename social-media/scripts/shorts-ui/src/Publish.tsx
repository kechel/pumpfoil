import { useCallback, useEffect, useState } from "react";
import { api, ExportItem } from "./api";
import { Icon } from "./icons";

// Upload-Tab: fertige Renders je Plattform sichten und koordiniert hochladen.
// YouTube: als geplantes Video (privat + publishAt). Instagram/TikTok folgen,
// sobald die jeweiligen Developer-Apps eingerichtet sind.

interface UpInfo {
  video_id?: string;
  publish_at?: string;
  uploaded_at?: number;
  languages?: number;
  privacy?: string;
}
type UpState = Record<string, Record<string, UpInfo>>;

const PF_LABEL: Record<string, string> = { youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok" };

function PublishCard({ exp, up, ytReady, refresh }: {
  exp: ExportItem;
  up: Record<string, UpInfo> | undefined;
  ytReady: boolean;
  refresh: () => void;
}) {
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const yt = up?.youtube;

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
    setBusy(false);
  }, [when, exp.name, refresh]);

  return (
    <div className="exp">
      <div className="body">
        <div className="title">{exp.name.replace(/\.mp4$/, "")}</div>
        <div className="meta">{new Date(exp.mtime * 1000).toLocaleString("de-DE")}</div>
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
                <figcaption>{PF_LABEL[pf]}</figcaption>
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
          <button className="btn" disabled title="Kommt als Nächstes — braucht eine TikTok-Developer-App (Upload als Entwurf in die Inbox).">
            → TikTok
          </button>
        </div>
        {msg && <div style={{ fontSize: 12 }}>{msg}</div>}
      </div>
    </div>
  );
}

export default function Publish() {
  const [exports, setExports] = useState<ExportItem[] | null>(null);
  const [up, setUp] = useState<UpState>({});
  const [ytReady, setYtReady] = useState(false);

  const refresh = useCallback(() => {
    void fetch("/api/exports").then(async (r) => setExports((await r.json()).exports));
    void fetch("/api/uploads").then(async (r) => setUp((await r.json()).state ?? {}));
    void fetch("/api/yt/status").then(async (r) => setYtReady((await r.json()).authorized));
  }, []);

  useEffect(() => refresh(), [refresh]);

  if (!exports) return <div className="uploads">lade …</div>;
  return (
    <div className="uploads">
      <h1>Upload ({exports.length})</h1>
      <div className="exp" style={{ borderColor: "#3b82f688" }}>
        <div className="body" style={{ fontSize: 12, opacity: 0.85 }}>
          <b>YouTube</b> lädt als <b>geplantes Video</b> hoch (privat, wird zum Termin veröffentlicht) — Titel,
          Beschreibung und alle 13 Sprachen kommen automatisch aus dem Caption-Cache (Texte-Tab).
          ⚠️ Solange das Google-Cloud-Projekt den API-Audit nicht bestanden hat, sperrt YouTube API-Uploads auf
          „privat" — den ersten Upload danach im Studio kontrollieren. <b>Instagram/TikTok</b> folgen, sobald die
          Developer-Apps eingerichtet sind.
        </div>
      </div>
      {exports.length === 0 && <div style={{ opacity: 0.6 }}>Noch keine Renders in shorts-mit-musik/.</div>}
      {exports.map((e) => (
        <PublishCard key={e.name} exp={e} up={up[e.name]} ytReady={ytReady} refresh={refresh} />
      ))}
    </div>
  );
}
