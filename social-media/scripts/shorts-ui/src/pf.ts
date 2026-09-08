// Kuerzel je Ausgabe-Ordner. RedNote hat keinen eigenen — dort wird die
// TikTok-Fassung hochgeladen, geholt ueber die laufende Nummer aus tiktok/.
export const PF_LABEL: Record<string, string> = {
  youtube: "YT", instagram: "IG", tiktok: "TT",
  // Kein Ausgabe-Ordner, aber eine Zeile in der Auswertung: die RedNote-Zahlen
  // kommen von Hand herein (scripts/rednote-import.py), sonst hiesse es "RE".
  rednote: "RN",
};
export const pfLabel = (pf: string) => PF_LABEL[pf] ?? pf.slice(0, 2).toUpperCase();
