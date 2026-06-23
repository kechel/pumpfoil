import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getToken, SessionSummary } from "../lib/api";
import { Button } from "./ui";
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
    let last: SessionSummary | null = null;
    for (let i = 0; i < files.length; i++) {
      if (files.length > 1) setProgress(`${i + 1}/${files.length}`);
      try { last = await api.uploadFit(files[i]); } catch { fail++; }
    }
    setProgress(null);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (fail) alert(t("sessions.uploadFail", { fail, total: files.length }));
    if (onDone) onDone(last);
    else if (last) nav(`/sessions/${last.id}`);
    else nav("/sessions");
  }

  return (
    <>
      <Button onClick={click} variant={variant} className={className} disabled={uploading}>
        {uploading ? `${t("sessions.importing")}${progress ? " " + progress : ""}…` : t("sessions.uploadFitZip")}
      </Button>
      <input ref={fileRef} type="file" accept=".fit,.zip" multiple className="hidden" onChange={onPick} />
    </>
  );
}
