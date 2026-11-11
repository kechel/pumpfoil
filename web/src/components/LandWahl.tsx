import { WertungsklasseAbschnitt } from "./WertungsklasseWahl";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { LAENDER, flaggeUrl, landName } from "../lib/laender";
import { useI18n, type Lang } from "../i18n";

/** Auswahl der Nationalitaet mit Flagge (Profil und Einrichtungs-Assistent). Laendernamen in der Sprache der Oberflaeche
 *  (Intl.DisplayNames), „nicht angeben" ganz oben. */
export function LandWahl({ land, onChange }: { land: string; onChange: (v: string) => void }) {
  const { t, lang } = useI18n();
  return (
    <div className="flex items-center gap-3">
      <select value={land} onChange={(e) => onChange(e.target.value)}
        className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100">
        <option value="">{t("profile.landNone")}</option>
        {LAENDER.map((c) => ({ c, n: landName(c, lang) })).sort((a, b) => a.n.localeCompare(b.n, lang))
          .map(({ c, n }) => <option key={c} value={c}>{n}</option>)}
      </select>
      {land && <img src={flaggeUrl(land)} alt="" className="h-6 w-8 shrink-0 rounded-sm border border-slate-700 object-cover" />}
    </div>
  );
}

const LAND_JE_SPRACHE: Record<Lang, string> = {
  de: "DE", gsw: "CH", "de-AT": "AT", en: "GB", fr: "FR", it: "IT", es: "ES", fi: "FI", nl: "NL", cs: "CZ",
  pl: "PL", pt: "BR", "pt-PT": "PT", ja: "JP", zh: "CN", ru: "RU", id: "ID", nb: "NO",
};

/** Land zur Sprache: zuerst die Region aus den Browser-Sprachen, wenn sie zur gewaehlten Sprache passt (en-US -> US,
 *  fr-CA -> CA), sonst das Hauptland der Sprache. */
export function landZurSprache(l: Lang): string {
  const basis = l.split("-")[0];
  try {
    for (const b of navigator.languages ?? []) {
      const [s, region] = b.split("-");
      if (s === basis && region && /^[A-Z]{2}$/.test(region.toUpperCase()) && LAENDER.includes(region.toUpperCase())
          && (l.includes("-") ? region.toUpperCase() === LAND_JE_SPRACHE[l] : true)) return region.toUpperCase();
    }
  } catch { /* ohne navigator */ }
  return LAND_JE_SPRACHE[l] ?? "";
}

/** Karte fuer den Assistenten (Jan, 03.11.2026): im Sprach-Schritt direkt unter der Sprache. Wurde die Nationalitaet
 *  noch nie gesetzt (`land_gewaehlt`), wird die zur Sprache vorgeschlagen und gespeichert; jeder Sprachwechsel hier
 *  setzt sie neu. „Nicht angeben" bleibt waehlbar und haelt, bis die Sprache hier wieder gewechselt wird. */
export function LandKarte() {
  const { t, lang } = useI18n();
  const [land, setLand] = useState<string | null>(null);
  const letzteSprache = useRef<Lang | null>(null);
  const speichern = (v: string) => { setLand(v); api.saveSettings({ land: v }).catch(() => {}); };
  useEffect(() => {
    api.getSettings().then((s) => {
      letzteSprache.current = lang;
      if (s.land_gewaehlt || s.land) setLand((s.land as string) || ""); else speichern(landZurSprache(lang));
    }).catch(() => setLand(""));
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (letzteSprache.current === null || letzteSprache.current === lang) return;
    letzteSprache.current = lang;
    speichern(landZurSprache(lang));
  }, [lang]);
  if (land === null) return null;
  return (
    <>
      <h3 className="mb-1 mt-5 font-semibold">{t("profile.land")}</h3>
      <p className="mb-3 text-sm text-slate-300">{t("profile.landHint")}</p>
      <LandWahl land={land} onChange={speichern} />
      {/* Wertungsklasse direkt darunter (Jan, 11.11.2026). LandKarte steht nur im Einrichtungs-Assistenten. */}
      <WertungsklasseAbschnitt />
    </>
  );
}
