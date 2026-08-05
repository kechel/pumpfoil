// Sportart-Klassifikation durch Menschen — Anzeige-Bausteine (docs/sport-classification.md).
// EINE Quelle für Karten, Detailansicht und Admin, damit die Kategorien nirgends auseinanderlaufen.
// `sport` einer Session ist etwas ANDERES (Aktivitätstyp aus der Aufnahmedatei).

/** Auswählbare Sportarten — gültige Messungen, dürfen später eigene Rekorde begründen. */
// „wake" seit 05.08. in drei Kategorien aufgeteilt (beim Pumpen sind das verschiedene Dinge):
// wakethief = Welle eines FREMDEN Boots mitnehmen · towed = am Seil hinterm Boot · surf_wave =
// Ozeanwelle am Strand. `wake` bleibt nur als Label für Altbestände (nicht mehr auswählbar).
export const SPORTS = ["pumpfoil", "wingfoil", "kitefoil", "surf_downwind", "surf_wave",
                       "sup_paddle", "wakethief", "towed", "efoil", "foildrive", "other"] as const;
/** Datenqualität — Müll/Dopplung, zählt nirgends. */
export const DATA_QUALITY = ["ok", "false_data", "duplicate", "test"] as const;

/** Zeigt die Session eine abweichende Klassifikation, die man benennen sollte? */
export function isClassified(s: { sport_class?: string | null; data_quality?: string | null }): boolean {
  return (s.sport_class ?? "pumpfoil") !== "pumpfoil" || (s.data_quality ?? "ok") !== "ok";
}

/** Beschriftbare Werte: auswählbare Sportarten + stillgelegte Altwerte. Der Server kann Kategorien
 *  hinzufügen, bevor eine App das Update hat — was hier NICHT drinsteht, bekommt das Label von
 *  „andere Sportart" statt eines rohen i18n-Keys auf dem Bildschirm. */
const LABELED_SPORTS: readonly string[] = [...SPORTS, "wake"];

/** i18n-Key des Anzeige-Labels. */
export function classLabelKey(s: { sport_class?: string | null; data_quality?: string | null }): string {
  const dq = s.data_quality ?? "ok";
  if (dq !== "ok") return `cls.dq.${dq}`;
  const sport = s.sport_class ?? "pumpfoil";
  return `cls.sport.${LABELED_SPORTS.includes(sport) ? sport : "other"}`;
}
