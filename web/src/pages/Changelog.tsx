import { Link } from "react-router-dom";
import { useT } from "../i18n";
import { ScrollToTop } from "../components/ScrollToTop";

// Nutzer-sichtbares Changelog. Bewusst NICHT technisch und (bis auf den Menüpunkt) auf
// Englisch — eine kuratierte Liste dessen, was Nutzer wirklich merken. Neueste zuerst.
// Einträge einfach oben ergänzen; jeweils Datum + kurze, verständliche Punkte.
type Entry = { date: string; items: string[] };

const ENTRIES: Entry[] = [
  {
    date: "July 20, 2026",
    items: [
      "Garmin watch stability fixes: recording could crash on start on older watches (e.g. fēnix 5), and the upload screen could crash when the phone connection dropped in and out. Update the watch app to 1.0.59 or later.",
      "Session detail: tap the pump-cadence tile to switch it between Hz and pumps per minute — your choice is remembered on this device.",
      "Spot records on the Spots page: see which spot leads for sessions, runs, pumps, foilers, foiled distance, longest run, top speed and on-foil time — with your own spot compared alongside, over any time window.",
      "New Garmin activity type “Pumpfoil”: your Garmin recordings now show up in Garmin Connect as “Pumpfoil” instead of Surfing or Open Water — set as the default for everyone. Prefer Surfing or Open Water? Change it anytime under Profile → Watch → Activity type.",
    ],
  },
  {
    date: "July 19, 2026",
    items: [
      "More reliable uploads on Garmin watches: if the connection drops mid-upload (a brief server or phone-signal hiccup), the watch now retries on its own — after 3, 10 and 30 seconds, and again the moment your phone reconnects. The upload screen shows a clear “Server unreachable — retrying in N s” countdown, nothing gets stuck, and no data is lost.",
      "Link Instagram and TikTok videos to a session — not just YouTube. The session list shows a small icon when a session has a video linked.",
      "Czech is now available — our 10th language.",
      "Added the full Indiana foil range to the foil catalog.",
    ],
  },
  {
    date: "July 18, 2026",
    items: [
      "Add several videos to a single session, just like photos.",
      "Dutch is now available as a language.",
      "Session times now show in the spot’s local time, and records use the real local timezone.",
      "New community records: session distance, session time, session pumps, max heart rate, plus “Early Bird” and “Night Owl”.",
    ],
  },
  {
    date: "July 16, 2026",
    items: [
      "Record a session directly with your phone (Android & iOS) — no watch needed. Strap the phone to your board or keep it in a pocket.",
      "Sortable columns in Foil Stats and Watch Stats.",
    ],
  },
  {
    date: "July 15, 2026",
    items: [
      "Share a session via a public link — anyone with the link can view it, no account needed, and you can revoke the link anytime.",
      "Delete all of your sorted-out (non-foiling) sessions at once.",
    ],
  },
  {
    date: "July 14, 2026",
    items: [
      "Adjustable text size (100 / 120 / 150 %) for better readability.",
    ],
  },
  {
    date: "July 13, 2026",
    items: [
      "“Spot progression”: replay all your sessions at a spot on one map, animated over time.",
      "Profile pictures (or initials) now appear throughout the session lists.",
    ],
  },
  {
    date: "July 12, 2026",
    items: [
      "Global community chat — everyone’s in by default; leave or rejoin anytime.",
      "Choose your Garmin recording’s activity type (Surfing or Open Water).",
      "Video preview thumbnails in the session lists.",
    ],
  },
  {
    date: "July 11, 2026",
    items: [
      "Suunto support: connect your account to import your sessions automatically.",
      "Choose the recording mode per watch (Full 25 Hz / Light 10 Hz / GPS only) — helps older or lower-memory watches record reliably.",
      "Highlight a single run when sharing a session.",
    ],
  },
  {
    date: "July 10, 2026",
    items: [
      "Automatic import for Suunto and Polar — new activities show up on their own once your account is connected.",
      "The web app now updates itself quietly at the next safe moment, instead of asking you to reload.",
    ],
  },
  {
    date: "July 8, 2026",
    items: [
      "Transfer a session to another user — handy when you lent out your watch.",
      "Live speed and distance overlay while replaying a session on the map.",
      "New “System architecture” page explaining the stack, security and privacy.",
    ],
  },
  {
    date: "July 7, 2026",
    items: [
      "Personal detection sensitivity (Normal / Light / Attempts) — tune how strictly your own sessions are analyzed, without changing community records.",
      "Finnish is now available as a language.",
    ],
  },
  {
    date: "July 6, 2026",
    items: [
      "Direct 1:1 messages, with the option to block.",
      "New “Nerd” pages explaining how foiling and pump detection actually work.",
    ],
  },
];

export default function Changelog() {
  const t = useT();
  return (
    <div className="mx-auto max-w-2xl p-6">
      <ScrollToTop />
      <Link to="/" className="text-sm text-brand-400 hover:underline">{t("common.back")}</Link>
      <h1 className="mb-1 mt-4 text-xl font-bold">{t("nav.changelog")}</h1>
      <p className="mb-6 text-sm text-slate-400">What’s new — the changes you can actually see.</p>

      <div className="space-y-8">
        {ENTRIES.map((e) => (
          <section key={e.date}>
            <h2 className="mb-2 text-sm font-semibold text-brand-300">{e.date}</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-200">
              {e.items.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
