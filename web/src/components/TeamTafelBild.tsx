// Bestenliste als Bild teilen (Jan, 31.10.2026: „bestenliste als bild teilen find ich super!"). Seit 02.11.2026 mit
// demselben hellen Aufbau wie die Community-Bestenliste (lib/bestenlisteBild.ts) — vorher fast schwarz.
import { useMemo } from "react";
import { TeamTafelMitZeilen } from "../lib/api";
import { TEAM_FARBEN } from "../lib/teamFarben";
import { kennzahl } from "../lib/teamKennzahlen";
import { teamInitialen } from "./TeamWappen";
import BestenlisteBildDialog from "./BestenlisteBildDialog";
import { useT } from "../i18n";

export default function TeamTafelBild({ team, tafel, zeitraum, onClose }: {
  team: { name: string; slug: string; logo_url: string | null; farbe: string | null; bestenlisten_oeffentlich?: boolean };
  tafel: TeamTafelMitZeilen; zeitraum: string; onClose: () => void;
}) {
  const t = useT();
  const k = kennzahl(tafel.kennzahl);
  const daten = useMemo(() => ({
    titel: team.name,
    kennzahl: t(k.labelKey),
    unterzeile: zeitraum,
    zeilen: tafel.zeilen.slice(0, 10).map((z) => ({ rang: z.rang, name: z.name, initialen: z.initialen, wert: k.fmt(z.value) })),
    leer: t("team.tafel.leer"),
    fussLinks: `pumpfoil.org/teams/${team.slug}`,
    akzent: (TEAM_FARBEN[team.farbe || "cyan"] ?? TEAM_FARBEN.cyan).dunkel,
    logoText: teamInitialen(team.name),
  }), [team, tafel, zeitraum]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <BestenlisteBildDialog daten={daten} logoUrl={team.logo_url} dateiname={`${team.slug}-${tafel.kennzahl}.jpg`}
      titel={t("team.bild.titel")} hinweis={team.bestenlisten_oeffentlich ? null : t("team.bild.hinweisIntern")} onClose={onClose} />
  );
}
