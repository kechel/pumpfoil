import { Link } from "react-router-dom";
import { Card } from "../components/ui";
import { ChevronIcon } from "../components/Icons";
import { UploadFitButton } from "../components/UploadFitButton";
import { useT } from "../i18n";

// Erklärt den Garmin-Export und bietet den eigentlichen FIT/ZIP-Upload.
export default function Import() {
  const t = useT();
  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-300 hover:text-slate-200">
        <ChevronIcon className="h-4 w-4 rotate-180" /> {t("common.back")}
      </Link>
      <h2 className="mb-1 text-xl font-bold">{t("import.title")}</h2>
      <p className="mb-5 text-sm text-slate-300">{t("import.intro")}</p>

      <Card className="p-5">
        <img src="/import-garmin.webp" alt={t("import.shotAlt")}
          className="w-full rounded-xl border border-slate-800" />
        <p className="mt-3 text-sm text-slate-200">{t("import.desc")}</p>
      </Card>

      <div className="mt-6 flex flex-col items-start gap-2">
        <UploadFitButton className="text-sm" />
        <p className="text-xs text-slate-400">{t("import.uploadNote")}</p>
      </div>
    </div>
  );
}
