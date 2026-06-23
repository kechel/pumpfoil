import { Card } from "../components/ui";
import { UploadFitButton } from "../components/UploadFitButton";
import { useT } from "../i18n";

// Erklärt den Garmin-Export und bietet den eigentlichen FIT/ZIP-Upload.
export default function Import() {
  const t = useT();
  return (
    <div className="w-full">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-xl font-bold">{t("import.title")}</h2>
          <p className="mt-1 text-sm text-slate-300">{t("import.intro")}</p>
        </div>
        <div className="shrink-0 sm:max-w-[16rem] sm:text-right">
          <UploadFitButton className="text-sm" />
          <p className="mt-1 text-xs text-slate-400">{t("import.uploadNote")}</p>
        </div>
      </div>

      <h3 className="mb-2 text-sm font-semibold text-slate-200">Garmin Connect</h3>
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
        </figure>
      </Card>
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
