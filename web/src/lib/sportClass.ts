// Sportart-Klassifikation durch Menschen — Anzeige-Bausteine (docs/sport-classification.md).
// EINE Quelle für Karten, Detailansicht und Admin, damit die Kategorien nirgends auseinanderlaufen.
// `sport` einer Session ist etwas ANDERES (Aktivitätstyp aus der Aufnahmedatei).

/** Auswählbare Sportarten — gültige Messungen, dürfen später eigene Rekorde begründen. */
// „wake" seit 05.08. in drei Kategorien aufgeteilt (beim Pumpen sind das verschiedene Dinge):
// wakethief = Welle eines FREMDEN Boots mitnehmen · towed = am Seil hinterm Boot · surf_wave =
// Ozeanwelle am Strand. `wake` bleibt nur als Label für Altbestände (nicht mehr auswählbar).
// `parawing` seit 13.09.2026: Lowkite / Parawing / Parakite sind dasselbe (Jan) — ein Wert,
// alle drei Namen im Label.
export const SPORTS = ["pumpfoil", "wingfoil", "kitefoil", "parawing", "kitesurf", "windsurf", "snowkite", "kite_atb", "kitebuggy", "surf_downwind",
                       "surf_wave", "sup_paddle", "wakethief", "towed", "efoil",
                       "foildrive", "foil_scoot", "other"] as const;
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

// Sportart-Gruppen wie server/app/sportprofil.py GRUPPE (19.10.2026) — fuer Anzeigen, die vom
// Server kein Profil mitbekommen (z. B. Rekord-Kacheln einer gewaehlten Sportart).
export const WIND_SPORTS = ["wingfoil", "kitefoil", "parawing", "kitesurf", "windsurf", "snowkite", "kite_atb", "kitebuggy"];
export const MOTOR_SPORTS = ["efoil", "foildrive", "towed"];

// Sortierung aller Sportart-Listen (Jan, 25.10.2026: „die sportartenliste bitte immer alphabetisch sortieren, nur
// pumpfoil (oder das eigene default) ganz oben"): eigene Standard-Sportart zuerst, „other" als Sammelposten zuletzt,
// dazwischen nach dem ANGEZEIGTEN Namen in der gewaehlten Sprache. Die Standard-Sportart merkt sich der Browser beim
// Laden/Speichern der Einstellungen (api.getSettings/saveSettings) — nur eine Bequemlichkeit, Pumpfoil als Rueckfall.
let standardSport = (() => { try { return localStorage.getItem("foil_std_sport") || "pumpfoil"; } catch { return "pumpfoil"; } })();
export function setzeStandardSport(s?: string | null) {
  if (!s) return;
  standardSport = s;
  try { localStorage.setItem("foil_std_sport", s); } catch { /* privat: nur fuer diese Sitzung */ }
}
export function sortiereSports<T extends string>(ids: readonly T[], t: (k: string) => string): T[] {
  const rang = (id: string) => (id === standardSport ? 0 : id === "other" ? 2 : 1);
  return [...ids].sort((a, b) => rang(a) - rang(b) || t(`cls.sport.${a}`).localeCompare(t(`cls.sport.${b}`)));
}
export function sortiereNachSport<T>(liste: readonly T[], sp: (x: T) => string, t: (k: string) => string): T[] {
  const ord = sortiereSports(liste.map(sp), t);
  return [...liste].sort((a, b) => ord.indexOf(sp(a)) - ord.indexOf(sp(b)));
}
