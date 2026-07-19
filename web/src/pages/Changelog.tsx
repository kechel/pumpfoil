import { Link } from "react-router-dom";
import { useT } from "../i18n";

// Nutzer-sichtbares Changelog. Bewusst NICHT technisch und (bis auf den Menüpunkt) auf
// Englisch — eine kuratierte Liste dessen, was Nutzer wirklich merken. Neueste zuerst.
// Einträge einfach oben ergänzen; jeweils Datum + kurze, verständliche Punkte.
type Entry = { date: string; items: string[] };

const ENTRIES: Entry[] = [
  {
    date: "July 20, 2026",
    items: [
      "New Garmin activity type “Pumpfoil”: your recording can now show up as “Pumpfoil” in Garmin Connect instead of Surfing or Open Water — pick it in your profile under Watch.",
      "The homepage now points out that you can record a session with your phone, too.",
    ],
  },
  {
    date: "July 19, 2026",
    items: [
      "More reliable uploads on Garmin watches: if the connection drops mid-upload (a brief server or phone-signal hiccup), the watch now retries on its own — after 3, 10 and 30 seconds, and again the moment your phone reconnects. The upload screen shows a clear “Server unreachable — retrying in N s” countdown, nothing gets stuck, and no data is lost.",
      "Link Instagram and TikTok videos to a session — not just YouTube. The session list shows a small icon when a session has a video linked.",
      "iOS app 1.1.15 and Android app 1.1.13 are now live in the stores.",
      "Czech is now fully supported (website and apps) — our 10th language.",
      "Added the full Indiana foil range to the foil catalog.",
    ],
  },
  {
    date: "July 18, 2026",
    items: [
      "Add several videos to a single session, just like photos.",
      "Dutch is now available as a language (website and apps).",
      "Session times are shown in the spot’s local time, and records use the real local timezone.",
      "New community records: session distance, session time, session pumps, max heart rate, plus “Early Bird” and “Night Owl”.",
      "New intro video on the homepage.",
    ],
  },
  {
    date: "July 16, 2026",
    items: [
      "Record a session directly with your phone (Android & iOS) — no longer a beta feature. Strap the phone to your board or keep it in a pocket; no watch needed.",
      "Share a session via a public link straight from the Android app.",
      "Sortable columns in Foil Stats and Watch Stats.",
    ],
  },
  {
    date: "July 15, 2026",
    items: [
      "Delete all of your sorted-out (non-foiling) sessions at once.",
    ],
  },
];

export default function Changelog() {
  const t = useT();
  return (
    <div className="mx-auto max-w-2xl p-6">
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
