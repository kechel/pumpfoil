// Sportart-Klassifikation durch Menschen — Anzeige-Bausteine (docs/sport-classification.md).
// EINE Quelle für Karten, Detailansicht und Admin, damit die Kategorien nirgends auseinanderlaufen.
// `sport` einer Session ist etwas ANDERES (Aktivitätstyp aus der Aufnahmedatei).

/** Auswählbare Sportarten — gültige Messungen, dürfen später eigene Rekorde begründen. */
export const SPORTS = ["pumpfoil", "wingfoil", "kitefoil", "surf_downwind", "sup_paddle",
                       "wake", "efoil", "foildrive", "other"] as const;
/** Datenqualität — Müll/Dopplung, zählt nirgends. */
export const DATA_QUALITY = ["ok", "false_data", "duplicate", "test"] as const;

/** Zeigt die Session eine abweichende Klassifikation, die man benennen sollte? */
export function isClassified(s: { sport_class?: string | null; data_quality?: string | null }): boolean {
  return (s.sport_class ?? "pumpfoil") !== "pumpfoil" || (s.data_quality ?? "ok") !== "ok";
}

/** i18n-Key des Anzeige-Labels. */
export function classLabelKey(s: { sport_class?: string | null; data_quality?: string | null }): string {
  const dq = s.data_quality ?? "ok";
  if (dq !== "ok") return `cls.dq.${dq}`;
  return `cls.sport.${s.sport_class ?? "pumpfoil"}`;
}
