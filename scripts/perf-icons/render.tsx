// Rendert die Performance-Icons aus web/src/components/Icons.tsx zu SVG-Strings (stdout, JSON). Aufruf ueber bauen.py.
import { renderToStaticMarkup } from "react-dom/server";
import * as I from "../../web/src/components/Icons";

const NAMEN = ["Sprint100Icon", "SprintMinuteIcon", "LongestRunIcon", "FoilTimeIcon", "CalendarCheckIcon", "BeatIcon",
  "TrophyIcon", "PodiumIcon", "MedalIcon", "SeasonCupIcon", "PlaceLineIcon", "PlacingGridIcon", "DailyAverageIcon"];
const out: Record<string, string> = {};
for (const n of NAMEN) {
  const C = (I as Record<string, (p: { className?: string }) => JSX.Element>)[n];
  out[n] = renderToStaticMarkup(<C className="" />);
}
console.log(JSON.stringify(out));
