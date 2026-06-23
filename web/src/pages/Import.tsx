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
        <ol className="space-y-3 text-sm text-slate-200">
          <Step n={1}>{t("import.step1")}</Step>
          <Step n={2}>{t("import.step2")}</Step>
          <Step n={3}>
            {t("import.step3pre")}<span className="font-semibold text-slate-100">{t("import.step3menu")}</span>{t("import.step3post")}
          </Step>
          <Step n={4}>{t("import.step4")}</Step>
        </ol>

        <figure className="mt-5">
          <img src="/import-garmin.webp" alt={t("import.shotAlt")}
            className="w-full rounded-xl border border-slate-800" />
          <figcaption className="mt-2 text-center text-xs text-slate-500">{t("import.shotCap")}</figcaption>
        </figure>
      </Card>

      <div className="mt-6 flex flex-col items-start gap-2">
        <UploadFitButton className="text-sm" />
        <p className="text-xs text-slate-400">{t("import.uploadNote")}</p>
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-brand-400">{n}</span>
      <span>{children}</span>
    </li>
  );
}
