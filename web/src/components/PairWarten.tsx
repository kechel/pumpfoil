import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useT } from "../i18n";

/**
 * Nach dem Einloesen eines Uhren-Codes: erst „verbunden" melden, wenn die UHR das Token abgeholt
 * hat (GET /api/devices/pair-confirmed/{id}), nicht schon, wenn der Code angenommen ist (Jan,
 * 14.10.2026). Anlass: eine schon verbundene Garmin-Uhr fragte beim Neu-Verbinden nie nach dem
 * Token (Fehler bis 1.0.92) — die Website zeigte Erfolg, die Uhr lud weiter ins alte Konto.
 *
 * Pollt alle 2 s, solange der Code gilt (15 min). Nach 30 s ohne Meldung kommt der Hinweis, was
 * man an der Uhr tun kann; gepollt wird trotzdem weiter.
 */
export function PairWarten({ deviceId, onConfirmed }: { deviceId: number; onConfirmed?: () => void }) {
  const t = useT();
  const [ok, setOk] = useState(false);
  const [langsam, setLangsam] = useState(false);

  useEffect(() => {
    let aus = false;
    const start = Date.now();
    const id = setInterval(() => {
      if (Date.now() - start > 15 * 60_000) { clearInterval(id); return; }
      if (Date.now() - start > 30_000) setLangsam(true);
      api.pairConfirmed(deviceId).then((r) => {
        if (aus || !r.confirmed) return;
        clearInterval(id);
        setOk(true);
        onConfirmed?.();
      }).catch(() => {});
    }, 2000);
    return () => { aus = true; clearInterval(id); };
    // onConfirmed absichtlich nicht als Abhaengigkeit: sonst startet jede neue Render-Funktion
    // das Warten von vorn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  if (ok) return <div className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">{t("account.claimOk")}</div>;
  return (
    <div className="mt-3 text-sm">
      <p className="flex items-center gap-2 text-slate-300">
        <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
        {t("account.claimWaiting")}
      </p>
      {langsam && (
        <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-amber-700 dark:text-amber-300">
          {t("account.claimSlow")}
        </p>
      )}
    </div>
  );
}
