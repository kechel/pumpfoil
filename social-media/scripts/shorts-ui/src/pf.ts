// Kuerzel je Ausgabe-Ordner. rednote bekommt keinen eigenen Render — dort liegt
// ein harter Link auf die TikTok-Fassung —, braucht aber ein eigenes Kuerzel,
// sonst stuende in der Liste faelschlich "TT".
export const PF_LABEL: Record<string, string> = {
  youtube: "YT", instagram: "IG", tiktok: "TT", rednote: "RN",
};
export const pfLabel = (pf: string) => PF_LABEL[pf] ?? pf.slice(0, 2).toUpperCase();
