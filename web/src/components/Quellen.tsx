import { useT } from "../i18n";

/** Quellen einer Anzeige, klein darunter wie die Wetterquelle (Jan, 05.11.2026): „Daten von: Garmin · Apple Watch · …".
 *  Der Server liefert die Codes je Anzeige (community.quellen). Erfuellt Garmins Markenvorgabe — sobald Daten aus
 *  Garmin-Geraeten drinstecken, steht „Garmin" da — und zeigt nebenbei, womit alles aufgezeichnet wird.
 *  Herstellernamen bleiben unuebersetzt, nur „Handy" und „Datei-Upload" haben Texte. */
const NAMEN: Record<string, string> = {
  garmin: "Garmin", apple: "Apple Watch", wear: "Wear OS", amazfit: "Amazfit", huawei: "Huawei",
  polar: "Polar", suunto: "Suunto", coros: "COROS",
};

/** Derselbe Satz als Text, fuer das Teilen-Bild der Bestenlisten. */
export function quellenText(quellen: string[] | null | undefined, t: (k: string) => string): string | null {
  if (!quellen?.length) return null;
  return `${t("quellen.titel")}: ${quellen.map((q) => NAMEN[q] ?? (q === "phone" ? t("quellen.phone") : q === "file" ? t("quellen.file") : q)).join(" · ")}`;
}

export function Quellen({ quellen, className = "" }: { quellen?: string[] | null; className?: string }) {
  const t = useT();
  if (!quellen?.length) return null;
  const namen = quellen.map((q) => NAMEN[q] ?? (q === "phone" ? t("quellen.phone") : q === "file" ? t("quellen.file") : q));
  return <p className={`mt-2 text-[10px] text-slate-500 ${className}`}>{t("quellen.titel")}: {namen.join(" · ")}</p>;
}
