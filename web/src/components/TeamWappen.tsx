// Team-Wappen (31.10.2026): hochgeladenes Logo, sonst die Initialen des Teams in der Teamfarbe.
// Muss innerhalb eines `.team-farbe`-Rahmens stehen (s. lib/teamFarben.ts) oder ihn selbst setzen.
import { teamFarbStil } from "../lib/teamFarben";

export function teamInitialen(name: string | null | undefined): string {
  const teile = (name || "").trim().split(/[\s._-]+/).filter(Boolean);
  if (!teile.length) return "?";
  return teile.length === 1 ? teile[0].slice(0, 2).toUpperCase() : (teile[0][0] + teile[teile.length - 1][0]).toUpperCase();
}

export default function TeamWappen({ name, logo, farbe, size = 40 }: {
  name: string | null | undefined; logo: string | null | undefined; farbe: string | null | undefined; size?: number;
}) {
  if (logo) {
    return <img src={logo} alt="" width={size} height={size} loading="lazy"
      className="shrink-0 rounded-lg object-contain" style={{ width: size, height: size }} />;
  }
  return (
    <span className="team-farbe team-knopf inline-flex shrink-0 items-center justify-center rounded-lg font-bold"
      style={{ ...teamFarbStil(farbe), width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {teamInitialen(name)}
    </span>
  );
}
