// Kuerzel je Ausgabe-Ordner. RedNote hat keinen eigenen — dort wird die
// TikTok-Fassung hochgeladen, geholt ueber die laufende Nummer aus tiktok/.
export const PF_LABEL: Record<string, string> = {
  youtube: "YT", instagram: "IG", tiktok: "TT",
};
export const pfLabel = (pf: string) => PF_LABEL[pf] ?? pf.slice(0, 2).toUpperCase();
