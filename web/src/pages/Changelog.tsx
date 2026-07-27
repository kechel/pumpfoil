import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useT } from "../i18n";
import { ScrollToTop } from "../components/ScrollToTop";

// Inline-Links in Changelog-Items: [label](/interner-pfad) oder [label](https://extern).
function ItemText({ text }: { text: string }): ReactNode {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0, i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const [, label, href] = m;
    out.push(href.startsWith("/")
      ? <Link key={i++} to={href} className="text-brand-400 hover:underline">{label}</Link>
      : <a key={i++} href={href} target="_blank" rel="noopener noreferrer" className="text-brand-400 hover:underline">{label}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

// Nutzer-sichtbares Changelog. Bewusst NICHT technisch und (bis auf den Menüpunkt) auf
// Englisch — eine kuratierte Liste dessen, was Nutzer wirklich merken. Neueste zuerst.
// Einträge einfach oben ergänzen; jeweils Datum + kurze, verständliche Punkte.
// Ein Punkt ist entweder reiner Text oder Text + zugehöriges Bild (unter DEM Punkt gerendert).
type Item = string | { text: string; img: string; imgAlt?: string };
type Entry = { date: string; items: Item[] };

const ENTRIES: Entry[] = [
  {
    date: "July 27, 2026",
    items: [
      "If you mostly record another sport, set it once: your profile now has a default sport for new sessions, right next to your default foil. Sessions then arrive in the right category and you don\u2019t have to sort each one afterwards. Existing sessions stay as they are, and picking it on the watch itself will come later.",
      "Sessions can now say which sport they are. If you accidentally recorded a wingfoil, foildrive or SUP session \u2014 or the GPS produced nonsense \u2014 you can label it on the session page. Labelled sessions stay in your own history but stop competing in the pumpfoil records, so the leaderboards compare like with like.",
      "Spotted a session in the community that doesn\u2019t look like pumpfoiling? There\u2019s a new button next to \u201clooks fake\u201d and \u201cinappropriate\u201d: it sends the owner a friendly request to label it properly. You stay anonymous, nobody is accused of anything, and one request alone changes nothing \u2014 it takes two people before a session is set aside, and only the owner (or we) can say what it actually was. If you think your session was pumpfoiling after all, you can say so and we\u2019ll look at it.",
      "Garmin watch app 1.0.67 (live in the Connect IQ store): your screens now follow what you\u2019re doing. Set up as many as you like for three situations \u2014 while riding, while you\u2019re not riding (which includes waiting between runs) and while the recording is paused \u2014 and page through the ones belonging to the current situation. Before, \u201cafter a run\u201d and \u201cbetween runs\u201d took exactly one screen each, and the watch switched between them on a timer. Set it up under Watch \u203a Data views; by default every screen stays reachable in every situation, and you can switch that off if you prefer a strict split.",
      "Paused screens always show a \u201cPaused\u201d marker. You can move it and colour it, but not remove it \u2014 otherwise there\u2019s no way to tell a paused recording from a frozen watch.",
      "Separator lines in your own screens can now run horizontally, vertically or diagonally: drag the line to move it, or drag either end to place it exactly.",
      "The editor now shows font sizes the way the watch really draws them. They used to be shown up to a third too small, so anything you picked came out bigger than expected on the wrist.",
      "Watch layouts from the community are now on the community page, and the gallery ranks them by how many riders actually use them.",
    ],
  },
  {
    date: "July 26, 2026",
    items: [
      "Garmin watch app 1.0.66 (live in the Connect IQ store): your own layouts now actually run on the watch. Pages you designed on pumpfoil.org show up while you ride, including your own screen for after a run and for waiting between runs. You can switch custom layouts on and off right on the watch, and if anything ever goes wrong the watch quietly falls back to the classic screens for that session instead of leaving you without data. Two more things you’ll notice: the save / pause / discard menu is white now, so it stays readable in bright sunlight, and field labels sit closer to their value. Needs a watch with enough memory — on smaller ones you can still switch it on and give it a try.",

      "Garmin watch app 1.0.65 (live in the Connect IQ store): fixed the app crashing during long sessions and large uploads on watches with less memory \u2014 f\u0113nix 5 / 6, Forerunner 55 / 245 / 645 / 935, Instinct 3 / E and similar. On those watches the app now writes movement data in half-size blocks, which halves the memory peak both while recording and while uploading. Bigger watches are unchanged. If a long session ever died on you mid-ride, update to 1.0.65.",
      "Build your own watch screens: under Watch layouts you can now place values, labels, separator lines, the REC dot and the page dots anywhere on the screen — pick a size step, a colour, the background colour and the watch shape. Preview it with sample data or field names, in your own language, and switch between watch sizes to check it fits (there\u2019s a warning if something would run off the smallest screens). Separator lines can run horizontally, vertically or diagonally, and you can drag either end. Your current 3-field views keep working exactly as before.",
      "Share layouts with the community: publish one of yours, browse what other riders published, and copy any of them into your own profile to adapt. The preview shows a layout in your watch\u2019s size, so you see right away what it would look like for you.",
      "Detailed setup per session: next to your foil you can now also record your stabiliser, mast length, shim angle and board — each one separately, with one default and an override per session (most days you only swap the stab or the shim). Pick your stab by name; if it\u2019s missing you can add the name yourself.",
      "The pause screen is configurable: choose which three values the watch shows while you\u2019re waiting between runs (it used to be fixed). Set it under Watch \u203a Data views.",
    ],
  },
  {
    date: "July 25, 2026",
    items: [
      "Garmin watch app 1.0.64 (live in the Connect IQ store): fixed the app crashing on startup (the “IQ!” error) on watches with less memory. On the fēnix 5 / quatix 5, fēnix 6 / 6S, fēnix Chronos, Enduro, Forerunner 55 / 245 / 645 / 935, Instinct E, Venu Sq and vívoactive 3 the full app runs again. The most memory-constrained watches — Instinct 2 / 2S / 2X, Instinct Crossover and Descent G1 — now run a streamlined version (GPS recording only, English, no on-watch menus) so they stay within their tighter memory. If your watch was affected, just update to 1.0.64.",
      "Apple Watch app 1.1.17 (now live in the App Store): fixed sessions getting stuck on “waiting for connection” after a ride. The watch sometimes didn’t realise it was online through your iPhone, so finished sessions never uploaded (and “Upload now” seemed to do nothing). They now upload on their own as soon as you’re back online. Just update to 1.1.17.",
      "Fixed duplicate notifications: you now get exactly one “session analysed” push per session, instead of occasionally several for the same one.",
    ],
  },
  {
    date: "July 24, 2026",
    items: [
      "Start success rate now reflects reality: a start where you pumped but never got up on foil now counts as a failed attempt. Before, only clean on-foil runs were counted, so the rate sat near 100% for almost everyone. This is applied to all your past sessions too — and the cutoff between “aborted” and “made it” stays adjustable in your profile.",
      "Watch a session upload live: on your home page and in Sessions, a session that’s still uploading now appears at the top with live progress — and its GPS map shows up as soon as the track is in, before the rest of the data finishes uploading.",
      "Garmin watch app 1.0.62 (live in the Connect IQ store): more robust uploads — your GPS track transfers first, so if an upload gets interrupted the session still shows up and can be analysed. The watch app is now also available in Dutch, Finnish and Czech.",
    ],
  },
  {
    date: "July 23, 2026",
    items: [
      "Faster loading — especially when the app updates itself: the update download is much smaller now, so you spend far less time on a loading screen after a new version ships.",
      "Five new languages: Portuguese, Japanese, Chinese (Simplified), Russian and Indonesian — 15 languages in total. Pick yours under Settings.",
      "Session lists now bundle a rider’s sessions from the same day into one row — tap to expand them. Shows the day’s totals and a combined mini-map of all runs.",
      "Carve counts on your home page: how many carves you rode by angle (90–180° / 180–360° / over 360°), per time window (today / 10 days / 30 days / 1 year / all time).",
    ],
  },
  {
    date: "July 22, 2026",
    items: [
      "Start success rate on your home page (at the bottom): the share of your starts that became real runs — over today / 10 days / 30 days / 1 year / all time. Set your own threshold: a detected run shorter than it counts as an aborted attempt, longer as a success.",
      "Like chat messages — tap the thumbs-up under a message’s avatar to react; likes show a count and you can toggle yours off again.",
    ],
  },
  {
    date: "July 21, 2026",
    items: [
      "Amazfit watches are now supported! Our recorder app is live in the Zepp App Store — records GPS + heart rate on ~40 Amazfit models (Balance, T-Rex 3, Cheetah, GTR 4, Active 2/3, and more). To install: open the Zepp phone app → Profile → your Amazfit → App Store → search “Pumpfoil”. (Pump detection from raw acceleration is still watch-dependent; GPS-based analysis works everywhere.)",
      {
        text: "Carve view on the session map: switch the map to “Carves” to see your carves highlighted — a tight turn of 90° or more (detected from your GPS track; wide, lazy turns don’t count), coloured by how hard you leaned into it (green → yellow → red, from your speed and turn radius). Includes a count of your carves by angle (90–180°, 180–360°, over 360°). Great for scrubbing through a session and spotting your carves. Works from GPS alone — no special watch needed; shown as an extra view only, not (yet) in records or stats. [See an example](/sessions/766?run=3).",
        img: "/changelog/carve-example.webp",
        imgAlt: "A carve on the session map, coloured green to orange by lean angle",
      },
      "More accurate top speed: a GPS glitch on the very first or last point of a run could report an impossible top speed (e.g. 30+ km/h on a slow board) and skew the community speed records. These edge glitches are now filtered out, so top-speed records reflect real riding.",
    ],
  },
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

// Datum des neuesten Eintrags — fürs Menü-Badge/Highlight (App.tsx) + „gesehen"-Merker.
export const LATEST_CHANGELOG_DATE = ENTRIES[0].date;
export const CHANGELOG_SEEN_KEY = "foil_changelog_seen";

export default function Changelog() {
  const t = useT();
  useEffect(() => {   // beim Öffnen als gesehen merken -> Menü-Highlight verschwindet
    try { localStorage.setItem(CHANGELOG_SEEN_KEY, LATEST_CHANGELOG_DATE); } catch { /* ignore */ }
  }, []);
  return (
    <div className="mx-auto max-w-2xl p-6">
      <ScrollToTop />
      <Link to="/" className="text-sm text-brand-400 hover:underline">{t("common.back")}</Link>
      <h1 className="mb-4 mt-4 text-xl font-bold">{t("nav.changelog")}</h1>

      <div className="space-y-8">
        {ENTRIES.map((e) => (
          <section key={e.date}>
            <h2 className="mb-2 text-sm font-semibold text-brand-300">{e.date}</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-200">
              {e.items.map((it, i) => {
                const text = typeof it === "string" ? it : it.text;
                const img = typeof it === "string" ? undefined : it.img;
                const alt = typeof it === "string" ? "" : (it.imgAlt ?? "");
                return (
                  <li key={i}>
                    <ItemText text={text} />
                    {img && (
                      <img src={img} alt={alt} loading="lazy"
                        className="mt-2 w-full max-w-[260px] rounded-lg border border-slate-800" />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
