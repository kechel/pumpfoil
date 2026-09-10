// Kuerzel je Ausgabe-Ordner. RedNote hat seit 10.09. einen eigenen Render —
// vorher lief dort die TikTok-Fassung mit. Ohne diese Tabelle hiesse RedNote
// "RE"; die Zahlen dazu kommen weiter von Hand herein (rednote-import.py).
export const PF_LABEL: Record<string, string> = {
  youtube: "YT", instagram: "IG", tiktok: "TT", rednote: "RN",
};
export const pfLabel = (pf: string) => PF_LABEL[pf] ?? pf.slice(0, 2).toUpperCase();
