import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getToken, SessionSummary } from "../lib/api";
import { Button } from "./ui";
import { UploadIcon } from "./Icons";
import { useT } from "../i18n";

// Wiederverwendbarer FIT/ZIP-Upload. Nicht eingeloggt -> /login. Nach dem Upload
// ruft er onDone (falls gesetzt) auf, sonst navigiert er zur neuen Session.
export function UploadFitButton({
  onDone,
  className = "",
  variant = "primary",
}: {
  onDone?: (created: SessionSummary | null) => void;
  className?: string;
  variant?: "primary" | "ghost";
}) {
  const t = useT();
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  function click() {
    if (!getToken()) { nav("/login"); return; }
    fileRef.current?.click();
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    let fail = 0;
    // Übersprungen ist KEIN Fehler: der Garmin-Gesamtexport enthält Aktivitäten und
    // Tagesaufzeichnungen gemischt (am Dateinamen nicht unterscheidbar). Wer den Ordner hochlädt,
    // soll „12 importiert, 87 übersprungen" lesen und nicht „87 fehlgeschlagen".
    let skipped = 0;
    let skipDetail = "";
    let last: SessionSummary | null = null;
    for (let i = 0; i < files.length; i++) {
      if (files.length > 1) setProgress(`${i + 1}/${files.length}`);
      try {
        const r = await api.uploadFit(files[i]) as SessionSummary & { skipped?: string; detail?: string };
        if (r && r.skipped) { skipped++; if (!skipDetail && r.detail) skipDetail = r.detail; }
        else last = r;
      } catch { fail++; }
    }
    setProgress(null);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (fail) alert(t("sessions.uploadFail", { fail, total: files.length }));
    else if (skipped) {
      // Bei genau EINER Datei den Grund im Klartext zeigen — sonst rätselt man, warum nichts passiert.
      alert(files.length === 1 && skipDetail
        ? t("sessions.uploadSkippedOne", { reason: skipDetail })
        : t("sessions.uploadSkipped", { skipped, total: files.length }));
    }
    if (onDone) onDone(last);
    else if (last) nav(`/sessions/${last.id}`);
    else nav("/sessions");
  }

  return (
    <>
      {/* Icon vor der Beschriftung, wie beim Link in „Meine Sessions" (Jan, 07.09.2026).
          Es steht auch WAEHREND des Uploads da: sonst springt die Knopfbreite beim Klick. */}
      <Button onClick={click} variant={variant} className={className} disabled={uploading}>
        <span className="inline-flex items-center gap-1.5">
          <UploadIcon className="h-4 w-4" />
          {uploading ? `${t("sessions.importing")}${progress ? " " + progress : ""}…` : t("sessions.uploadFitZip")}
        </span>
      </Button>
      <input ref={fileRef} type="file" accept=".fit,.zip,.tcx,.gpx" multiple className="hidden" onChange={onPick} />
    </>
  );
}
