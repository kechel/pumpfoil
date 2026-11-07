// Bestenliste als Bild teilen (Jan, 31.10.2026: „bestenliste als bild teilen find ich super!"). Seit 02.11.2026 mit
// demselben Aufbau wie die Community-Bestenliste und die Session-Karte (lib/bestenlisteBild.ts).
import { useMemo } from "react";
import { TeamTafelMitZeilen } from "../lib/api";
import { TEAM_FARBEN } from "../lib/teamFarben";
import { kennzahl } from "../lib/teamKennzahlen";
import BestenlisteBildDialog from "./BestenlisteBildDialog";
import { teamInitialen } from "./TeamWappen";
import { useT } from "../i18n";

/** Wappen des (ersten) Teams eines Fahrers im Bild — globale Events, wie die Spalte in der Liste (07.11.2026). */
function wappenVon(x?: { name: string; logo_url: string | null; farbe: string | null }) {
  if (!x) return undefined;
  const f = TEAM_FARBEN[x.farbe || "cyan"] ?? TEAM_FARBEN.cyan;
  return { logo: x.logo_url, initialen: teamInitialen(x.name), flaeche: f.dunkelFlaeche ?? f.dunkel, schrift: f.dunkelAuf ?? "#020617",
           flaecheHell: f.hellFlaeche ?? f.hell, schriftHell: f.hellAuf ?? "#ffffff" };
}

export default function TeamTafelBild({ team, tafel, zeitraum, onClose, stand, abzeichen, dateiBasis, teamsZeigen = false, eventZeile, ohneLogo = false }: {
  team: { name: string; slug: string; logo_url: string | null; farbe: string | null; bestenlisten_oeffentlich?: boolean };
  tafel: TeamTafelMitZeilen; zeitraum: string; onClose: () => void;
  /** Events: „Stand 14:32" bzw. „Endstand" in der Unterzeile (Jan, 06.11.2026). */
  stand?: string | null;
  /** Pille oben rechts, z. B. „live", solange das Event nicht final ist. */
  abzeichen?: string | null;
  /** Anfang des Dateinamens (Events: der Event-Name, dateinamenfreundlich); sonst der Team-Slug. */
  dateiBasis?: string;
  /** Globale Events: Team-Wappen je Fahrer. */
  teamsZeigen?: boolean;
  /** Events: [Eventname, Zeitraum des Events] — Eventname als Titel, darunter „Teamname · Zeitraum", dann Kennzahl + Stand
   *  (Jan, 07.11.2026: „teamname und eventname noch vertauschen"). */
  eventZeile?: [string, string];
  /** Globale Events: kein Wappen oben links, das pumpfoil.org-Logo steht ja unten rechts (Jan, 07.11.2026). */
  ohneLogo?: boolean;
}) {
  const t = useT();
  const k = kennzahl(tafel.kennzahl);
  const daten = useMemo(() => ({
    titel: eventZeile ? eventZeile[0] : team.name,
    titelAnpassen: !!eventZeile,
    // Sportart dazu, sobald es nicht Pumpfoil ist — sonst weiss im geteilten Bild niemand, welche gemeint ist (02.11.2026).
    unterzeile: eventZeile ? [team.name, t(k.labelKey), tafel.sportart && tafel.sportart !== "pumpfoil" ? t(`cls.sport.${tafel.sportart}`) : null].filter(Boolean).join(" · ") : [t(k.labelKey), tafel.sportart && tafel.sportart !== "pumpfoil" ? t(`cls.sport.${tafel.sportart}`) : null, zeitraum,
      stand].filter(Boolean).join(" · "),
    unterzeile2: eventZeile ? [eventZeile[1], stand].filter(Boolean).join("\n") : null,
    zeilen: tafel.zeilen.slice(0, 10).map((z) => ({ rang: z.rang, name: z.name, initialen: z.initialen, land: z.land, wert: k.fmt(z.value),
      wappen: teamsZeigen ? wappenVon(z.teams?.[0]) : undefined })),
    wappenPlatz: teamsZeigen && tafel.zeilen.slice(0, 10).some((z) => z.teams?.length),
    // Eigene Zeile hinter Platz 10 (globale Events), im Dialog abwaehlbar (07.11.2026).
    eigene: tafel.eigene && tafel.eigene.rang > 10
      ? { rang: tafel.eigene.rang, name: tafel.eigene.name, initialen: tafel.eigene.initialen, land: tafel.eigene.land,
          wert: k.fmt(tafel.eigene.value), wappen: teamsZeigen ? wappenVon(tafel.eigene.teams?.[0]) : undefined }
      : null,
    leer: t("team.tafel.leer"),
    // `dunkel` = Textfarbe fuer den DUNKLEN Modus (helle Stufe, s. lib/teamFarben.ts) — auf Navy muss sie leuchten.
    akzent: (TEAM_FARBEN[team.farbe || "cyan"] ?? TEAM_FARBEN.cyan).dunkel,
    akzentHell: (TEAM_FARBEN[team.farbe || "cyan"] ?? TEAM_FARBEN.cyan).hell,
    abzeichen,
  }), [team, tafel, zeitraum, stand, abzeichen, teamsZeigen, eventZeile]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <BestenlisteBildDialog daten={daten} logoUrl={ohneLogo ? null : team.logo_url} dateiname={`${dateiBasis || team.slug}-${tafel.kennzahl}.jpg`}
      titel={t("team.bild.titel")} hinweis={team.bestenlisten_oeffentlich ? null : t("team.bild.hinweisIntern")} onClose={onClose} />
  );
}
