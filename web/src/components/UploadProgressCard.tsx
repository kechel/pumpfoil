import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, InProgressSession } from "../lib/api";
import { WatchIcon, LocationIcon, CheckIcon, UploadIcon, InfoIcon } from "./Icons";
import { useT } from "../i18n";

// Prominente Live-Upload-Karte (Home + Sessions): zeigt eigene Sessions im Zwischenzustand
// (recording/live), sobald Chunks am Server ankommen — inkl. „vorzeitige Anzeige, sobald GPS da
// ist", einem Stall-Hinweis (>5 min kein Chunk) und einem Button, die Session bewusst mit den
// bisherigen (ggf. nur GPS-)Daten abzuschließen. Pollt schnell (4 s) solange etwas läuft, sonst
// träge (20 s). Rendert nichts, wenn nichts läuft. Datenquelle: GET /api/sessions/in-progress.
//
// Farben: slate ist per CSS-Variablen theme-invertiert (tailwind.config) -> EINE slate-Klasse
// pro Element, KEIN dark:-Variant (der würde im Light-Mode brechen). dark: nur für nicht-slate
// Akzente (cyan/amber).
export function UploadProgressCard() {
  const t = useT();
  const [rows, setRows] = useState<InProgressSession[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await api.inProgress();
        if (!alive) return;
        setRows(r);
        timer.current = setTimeout(tick, r.length > 0 ? 4000 : 20000);
      } catch {
        if (!alive) return;
        timer.current = setTimeout(tick, 20000);
      }
    };
    tick();
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!rows || rows.length === 0) return null;

  return (
    <div className="mb-4 space-y-2">
      {rows.map((s) => (
        <UploadRow key={s.id} s={s} t={t} />
      ))}
    </div>
  );
}

function UploadRow({
  s,
  t,
}: {
  s: InProgressSession;
  t: ReturnType<typeof useT>;
}) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const pct =
    s.upload_total && s.upload_total > 0
      ? Math.min(100, Math.round((s.upload_received / s.upload_total) * 100))
      : null;
  // Upload steht (>5 min kein neuer Chunk) -> stärkerer Hinweis: App auf der Uhr erneut öffnen.
  const stalledMs = 5 * 60 * 1000;
  const stalled =
    !!s.last_received_at && Date.now() - new Date(s.last_received_at).getTime() > stalledMs;

  // Non-destruktiv: triggert nur eine gps_only-Vorabanalyse (Server final=False -> Status „live").
  // Kein hartes „complete" -> die Uhr wirft nichts weg, späte Accel-Daten integrieren sich weiter,
  // sobald der Upload fortgesetzt wird. Kein Bestätigungsdialog nötig (nichts geht verloren).
  const analyzeNow = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await api.finalizeSession(s.id);
      nav(`/sessions/${s.id}`);
    } catch {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={() => nav(`/sessions/${s.id}`)}
      className="cursor-pointer rounded-xl border border-cyan-500/40 bg-cyan-500/5 dark:bg-cyan-400/10 p-3 sm:p-4 transition hover:border-cyan-500/70"
    >
      <div className="flex items-center gap-3">
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-500/15 text-cyan-600 dark:text-cyan-300">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-500/30" />
          <UploadIcon className="relative h-4 w-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            {t("upload.title")}
            {s.device_label && (
              <span className="inline-flex items-center gap-1 text-xs font-normal text-slate-400">
                <WatchIcon className="h-3.5 w-3.5" />
                {s.device_label}
              </span>
            )}
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300">
            {s.has_gps ? (
              <span className="inline-flex items-center gap-1 font-medium text-cyan-700 dark:text-cyan-300">
                <LocationIcon className="h-3.5 w-3.5" />
                {t("upload.gpsReady")}
                <CheckIcon className="h-3.5 w-3.5" />
              </span>
            ) : (
              <span className="text-slate-400">{t("upload.waiting")}</span>
            )}
            <span>
              {pct !== null
                ? t("upload.progressPct", { pct: String(pct), n: String(s.upload_received), total: String(s.upload_total) })
                : t("upload.chunks", { n: String(s.upload_received) })}
            </span>
          </div>

          {/* Fortschrittsbalken: exakt bei bekanntem Total, sonst unbestimmt. Track = slate-700
              (invertiert im Light zu hellgrau). */}
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
            {pct !== null ? (
              <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${pct}%` }} />
            ) : (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-cyan-500/70" />
            )}
          </div>
        </div>
      </div>

      {/* Stall-Hinweis (>5 min kein Chunk): App auf der Uhr erneut öffnen, um fortzusetzen */}
      {stalled ? (
        <div className="mt-3 flex gap-2 rounded-lg bg-amber-500/10 p-2.5 text-[11px] leading-snug text-amber-800 dark:text-amber-200">
          <InfoIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t("upload.stalledHint")}</span>
        </div>
      ) : (
        <p className="mt-2 text-[11px] leading-snug text-slate-400">{t("upload.hint")}</p>
      )}

      {/* Bewusst mit den bisherigen (ggf. nur GPS-)Daten abschließen */}
      {s.has_gps && (
        <button
          onClick={analyzeNow}
          disabled={busy}
          className="mt-2.5 w-full rounded-lg border border-slate-600 px-3 py-2 text-xs font-medium text-slate-100 transition hover:bg-slate-800/50 disabled:opacity-60"
        >
          {busy ? t("upload.finalizeBusy") : t("upload.finalize")}
        </button>
      )}
    </div>
  );
}
