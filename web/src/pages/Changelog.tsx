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
    date: "September 5, 2026",
    items: [
      "iPhone and Apple Watch 1.1.30: the map remembers the view you chose, shows your failed take-off attempts, and is drawn even when no runs were detected. Missing heart rate is now shown in white instead of a colour that means nothing.",
      "The watch no longer writes an old heart rate into new track points. That used to make long runs look like they were not done under your own power, and they were dropped from your stats.",
      "Comparison: a button to clear your selection.",
    ],
  },
  {
    date: "September 4, 2026",
    items: [
      "Xiaomi and Redmi watches can now bring their sessions here: connect Mi Fitness to Suunto, connect Suunto with us, and your rides arrive automatically. Instructions under linked accounts.",
      "COROS accounts can be connected too — your workouts are imported as sessions.",
      "If a watch never got a real GPS fix, you now see it: the recording says so instead of quietly showing zero, and the map is drawn even when no runs were detected.",
    ],
  },
  {
    date: "September 3, 2026",
    items: [
      "An upload that never finished keeps its hint until the recording actually arrives. If a newer session has come in since, the old one can be analysed with what we have or deleted.",
      "iPhone and Apple Watch 1.1.29: videos in the community feed play again. You can swipe through the feed now, and tapping a preview opens the video you tapped.",
    ],
  },
  {
    date: "September 2, 2026",
    items: [
      "iPhone and Apple Watch 1.1.28: the watch has GPS ready before you press start. On the phone: a map for every run in your history, spot comparison, records narrowed to comparable foils, tidying up your watches, and a download of everything we store about you.",
      "Known issue in 1.1.28: videos in the community feed stay black. Fixed in 1.1.29.",
      "Android and Wear OS 1.1.24 / 1.2.24 are live. On the phone: heart-rate zones, GPX and FIT download, spot descriptions, aspect-ratio badges and the training curve. On the watch: an always-on view and a live distance that stops when you stand still.",
      "You can choose how a recording is ended on the watch: hold for two seconds (still the default) or a single press. The setting is in your profile under the watch data fields and applies to all your watches.",
      "Garmin watch app 1.0.85 is in the store with that setting. Apple Watch, Wear OS and Amazfit follow with their next update.",
      "On the iPhone, the \u201ccomparable foils\u201d picker now reloads the records instead of only changing the heading.",
      "The session detail shows starts as well as runs: \u201c4/20\u201d means twenty attempts, four of them flew, with your success rate next to it.",
      "Polish can be selected again, and it now sticks after a restart.",
    ],
  },
  {
    date: "September 1, 2026",
    items: [
      "Comparisons can be played back: pick sessions from the same spot and time, press play, and everyone moves on one clock. Breaks are skipped, so two hours play in about ten minutes.",
      "Records and leaderboards can be narrowed to comparable foils. \u201cLike my foil\u201d shows only records set on wings close to yours in area and aspect ratio; there are also size classes and a high-aspect group.",
      "Session lists start on \u201call\u201d instead of \u201cprecise only\u201d, so you see everyone\u2019s sessions. Records and leaderboards still default to the precise ones.",
      "The progress animation at a spot no longer draws spikes across the water and shows each run in full detail.",
      "Merged sessions show the right times again \u2014 runs could be off by hours. All 48 merged sessions were rebuilt; distances, speeds and pump counts were never affected.",
      "The app now runs on the f\u0113nix 9, 9 Pro, 9 Pro Solar and the f\u0113nix 8 in 43\u202fmm \u2014 129 supported Garmin watches.",
      "New in the gear list: Levitaz Free Series Prototype 1200, AlpineFoil DK 1360, AlpineFoil HA 175 and Levitaz Stabilizer 180.",
      "Fixed: on a narrow phone, long spot names could push the page sideways.",
      "Coming with the next watch update: Apple Watch and Wear OS switch GPS on while you are still on the start screen and show when it is ready.",
    ],
  },
  {
    date: "August 31, 2026",
    items: [
      "iPhone and Apple Watch 1.1.27 is in the App Store: records and totals per foil, tiles starting on the last ten days, the satellite switch on all maps, the community video feed and file attachments in feedback.",
      "The apps are now complete in all seventeen languages \u2014 no more English buttons halfway through. Dutch, Finnish and Czech are new on the Apple Watch.",
      "Garmin 1.0.83: no more countdown to a full memory that was not full \u2014 the watch shows a remaining time only where we can measure it. Do install this one; the wrong figure sits on the watch and only the update clears it.",
      "All maps have a satellite view: session, comparison, spots, progress animation and labelling. One button switches, and your choice sticks across the app.",
      "You can attach files to feedback \u2014 up to three images or text files per message.",
      "iPhone 1.1.26 fixes the app refusing to start. The fix reached everyone through the server within the hour, before the update was even submitted.",
      "The iPhone app starts faster, and the spots map bundles pins that sit on top of each other, showing how many spots are under one dot.",
    ],
  },
  {
    date: "August 30, 2026",
    items: [
      "There is a community video feed on the [community page](/community). Add your YouTube channel in your [profile](/einstellungen) and your clips join it. Everything lands in one stream, newest first, and plays full screen right here. Nothing reaches YouTube until you press play.",
      "Liking a clip only works on YouTube itself, so there is a button that takes you straight there.",
      "Your records and totals on the home page also come per foil \u2014 farthest run, longest run, top speed, sessions and pumps for each wing you ride.",
      "The tiles start on the last ten days instead of all time; the all-time view is one tap away.",
      "Garmin 1.0.82: the watch counts a run like the website does. A short dip no longer ends a run, and very short twitches are no longer shown as your last run \u2014 the gap to the analysis drops from about a third to a few percent.",
      "Watch and analysis will never agree perfectly \u2014 the analysis also sees the accelerometer. The watch just got a lot closer.",
      "The [foil stats](/foil-stats) show the longest run as well as the farthest one, for every foil.",
    ],
  },
  {
    date: "August 27, 2026",
    items: [
      "Speed zones in your [profile](/einstellungen), like the heart rate zones: five zones, suggested from the speeds you actually ride and adjustable.",
      "Number and graphic on the watch now use the same colours \u2014 your zones, everywhere, including the layout editor and the previews.",
      "What the colours mean and how the suggestions are worked out is written down now.",
    ],
  },
  {
    date: "August 26, 2026",
    items: [
      "Watch screens can show a value as a shape: an edge graphic along the rim and a bar you can place anywhere, both filling with the value and coloured by your zones. Draw it once in the [layout editor](/layouts) and it fits every watch.",
      "Heart rate zones in your [profile](/einstellungen): five zones, suggested from your highest measured heart rate and adjustable. Your watch uses the same numbers.",
      "Garmin 1.0.80 with the graphics is in the Connect IQ store; the other watch platforms follow with their next update.",
      "Three smaller things on Garmin: a GPS glitch no longer wrecks your top speed, two runs without a real stop count as one, and the \u201csaved\u201d screen no longer hides under the upload screen.",
      "Setting your heart rate zones no longer makes the browser offer to save a password.",
      "The spot count in the community line and on the [spots](/spots) page agree again. Two spots that had stayed nameless are now on the map as well.",
    ],
  },
  {
    date: "August 25, 2026",
    items: [
      "Android 1.1.23 and Wear OS 1.2.23 are live: the full run table, run-by-run comparison, full-screen map, the layout gallery, records by sport and period, and the training curve. On the watch: active heart rate measurement, a field for the highest heart rate of your last run, and Norwegian.",
      "Dictating a chat message and tapping \u201cedit\u201d works: the text lands in the input field and the chat stays open.",
      "A recalculated session no longer shows its old numbers \u2014 list and detail page agree again.",
      "Sessions you sorted out stay out of your history curves, your spot list and the spot animation.",
      "The spot picker puts your own spots first, and \u201csorted out\u201d shows those sessions right away instead of an empty list.",
      "Wings show their aspect ratio wherever they are named \u2014 \u201cAXIS PNG V2 1300 \u00b7 AR 10.4\u201d.",
      "Two fixes on the history page: switching spots in the progress animation no longer leaves a blank panel, and sorted-out sessions no longer add spots to your list.",
    ],
  },
  {
    date: "August 24, 2026",
    items: [
      "Spots can be described by the people who ride them \u2014 how you get on the water, what the bottom is like, where to park. One block per rider, text and up to ten photos, and you can heart the ones you find useful. These are notes from other riders, not official information.",
      "Amazfit 1.0.6 counts your pumps: the watch now records acceleration, so its sessions are analysed like those from a Garmin or Apple Watch. Also new: a field for the highest heart rate of your last run and a switchable touch lock. Older recordings stay GPS only.",
      "Searching for gear no longer depends on word order: \u201caxis png 1300 v2\u201d, \u201c1300 png\u201d and \u201cpng v2 1300\u201d all find the same wing.",
    ],
  },
  {
    date: "August 21, 2026",
    items: [
      "You can download your own sessions as GPX or FIT. The FIT file is a proper activity, so Garmin Connect and Strava take it as a ride.",
    ],
  },
  {
    date: "August 20, 2026",
    items: [
      "Clicking a spot on the map opens the spot you actually clicked. Overlapping markers are gathered into one circle showing how many spots are inside; clicking it zooms in so you choose.",
      "Large numbers follow the language you picked \u2014 in the community line, on your home page and in the history charts.",
      "Duplicate spots are merged \u2014 301 entries became 172, with every session kept. Names like \u201cAnnecy 2\u201d are back to the plain name, and the session count on the map matches the one you see when you click it.",
    ],
  },
  {
    date: "August 19, 2026",
    items: [
      "Runs that were missing are back: eight runs in seven sessions, all recalculated. No run disappeared and no record changed. If a run of yours is missing, tell us the time and place.",
      "The gear list grew from 536 front wings to 849 and from 29 brands to 42 \u2014 among them CORE, GA Foils, RRD, AlpineFoil, MFC and Zeeko. Search also understands the codes printed on the wing, so FA2300 or X1240 works.",
      "Estimated figures in the gear list are marked as estimates \u2014 44 wings had been presented as measured.",
      "A handful of wings had wrong numbers and were corrected against the manufacturers\u2019 own spec sheets \u2014 AXIS ART V2, Lift Florence 71 X and Unifoil Vyper 150 among them.",
      "A new strip under the run table shows your heart rate across every run on one shared axis, so you can see where in a run it climbed. It is on the comparison page too.",
      "While playing back a session, the current heart rate now shows alongside speed and distance. It only appears if the recording has a pulse, so it never sits there as an empty dash.",
      "Heart rate colours are consistent everywhere: the scale runs from your lowest to your highest real pulse, so the same pulse is always the same colour.",
      "Fixed in the screen editor: \u201cLast run: max heart rate\u201d turned into \u201cRuns (count)\u201d on every save. If you had set it, set it once more \u2014 it stays now.",
      "iPhone and Apple Watch 1.1.24: the run table shows all thirteen columns, you can compare single runs instead of whole sessions, the map opens full screen, and chat notifications can be switched on and off in the app.",
    ],
  },
  {
    date: "August 18, 2026",
    items: [
      "The spots map stays where you left it \u2014 view and zoom are remembered instead of jumping back to the whole world.",
      "The community records page opens about six times faster. Same records, same numbers.",
      "The new “max heart rate of your last run” field has a name now. In the screen editor it was listed as Field.21, which tells you nothing, and it was missing from the list of fields you can pick. Both fixed, in all 16 languages.",
      "Your watch only tells you about updates that are actually for it \u2014 a new Garmin version no longer makes an Apple Watch or Amazfit announce one.",
      "The training curve on the history page names the 30-second mark, so you can see at a glance which points are being compared. The sentence interpreting the result for you is gone — that part you can read yourself.",
      "Four app updates are with the stores for review: the run table with all thirteen columns, comparing single runs instead of whole sessions, a full-screen map in a session, and a switch for chat notifications.",
      "Amazfit 1.0.6 is with the store: square watches no longer lose their title behind the system bar, the page indicator fits on round watches, and the touchscreen lock is now a setting.",
    ],
  },
  {
    date: "August 17, 2026",
    items: [
      "Your own records are split by sport \u2014 a wing session or a tow no longer counts towards your foiling totals. A selector above your records switches between them.",
      "Typing works again after you have looked at the map: -, _, +, *, 6, & and the arrow keys had stopped working in chat.",
      "New in the community records: most carves over 180\u00b0. It belongs to a person rather than a session and adds up every carve in the selected period.",
      "Amazfit watches are getting acceleration \u2014 our first contribution from outside, by @elmanu13 on GitHub. It makes pump count, cadence and glide phases possible on those watches. He also fixed the app closing itself mid-session, made start wait for a GPS fix, and put stop and page-turning on the physical keys.",
      "Garmin 1.0.77: you can choose how many satellite systems the watch uses, separately for each watch, under Account, Watches \u2014 fewer systems save battery. And a crash on the watch is now reported quietly the next time you open the app.",
      "You pick your own watch screens by looking at them: the button opens a row of previews instead of a list of names.",
      "If the app is draining your Garmin battery, two settings under Account help. \u201cSatellite systems \u00b7 without second frequency band\u201d saves the most for the least lost, and \u201cRecording mode \u00b7 Lite \u00b7 10 Hz\u201d costs the analysis almost nothing \u2014 pump count within half a percent. \u201cGPS only\u201d we would not recommend: it throws away pump count, cadence and glide phases.",
      "Garmin 1.0.78: watches with little memory record again \u2014 f\u0113nix 5/5S/6/6S and Chronos, Forerunner 55/245/645/935, Venu Sq, v\u00edvoactive 3, Enduro, Instinct 3 Solar and Instinct E. They now get a slimmer version of the app; it drops custom layouts and its menus are in English there. If you had given up on such a watch, please try again.",
    ],
  },
  {
    date: "August 14, 2026",
    items: [
      "Your watch no longer loses data in silence: it says \u201cupload first\u201d when something is still waiting, and shows in red while a recording is dropping data because the watch is full.",
      "Pausing a recording now uploads the sessions that are waiting, which frees space for the one you are recording. Garmin 1.0.76.",
      "One piece of bad advice is gone, too: when the storage was full the watch used to suggest reinstalling the app. That would have deleted precisely the recordings that were still waiting to be sent. It now says to upload first.",
    ],
  },
  {
    date: "August 13, 2026",
    items: [
      "Runs can be missing because the watch had no GPS position for part of the session \u2014 across all recordings here, a quarter of the time has none. A run needs the track, so those minutes cannot be counted.",
      "Garmin watches now use every satellite system they support instead of GPS alone \u2014 better positions, at the cost of battery. Version 1.0.75.",
      "Apple Watch and iPhone move to the highest accuracy setting iOS offers, for the same reason. It is version 1.1.22, in the App Store today. Apple Watch already had the best coverage of all our watches, so the gain will be smaller there.",
      "The \u201cLite \u00b7 10 Hz\u201d recording mode keeps your pump statistics: pump count differs by 0.4 %, foiling detection is 99.9 % identical. Affected sessions were recalculated and count towards records again.",
      "“GPS only” mode now says what it costs, right where you choose it: no pump count, no cadence, no glide phases, because all three come from the movement sensor.",
      "Joining two recordings no longer creates duplicates when the request is sent twice.",
    ],
  },
  {
    date: "August 10, 2026",
    items: [
      "Pump counts were too low in some sessions, and a few runs claimed a 30- or 45-second glide. Both came from a timing error in the wrist data. In the reported run the glide became 1.6 seconds and the pump count went from 42 to 120.",
      "All existing sessions were recalculated: pump counts went up, long glides got shorter. Distances, speeds, tracks and the map were never affected.",
      "Joined sessions lost wrist data through the same timing error. 30 of 33 were rebuilt in full from their original parts.",
      "Garmin 1.0.74 fixes a crash when the watch\u2019s own storage was full \u2014 the app quit with \u201cIQ!\u201d on opening. It now keeps running and says that the storage is full.",
      "Recordings waiting to upload show how much data they are, not just how many: \u201c15 waiting for upload \u00b7 4 MB\u201d.",
      "And if the app ever crashes while starting, the next launch falls back to the fixed data screens by itself instead of crashing again — your own data pages come back as soon as it starts cleanly.",
    ],
  },
  {
    date: "August 9, 2026",
    items: [
      "Android 1.1.20 and Wear OS 1.2.20: location is now a real requirement before recording \u2014 the app asks for it, warns when it is only \u201capproximate\u201d, and tells you when a session was saved without GPS. Pairing again no longer overwrites a working watch connection.",
      "The gear catalogue grew, nearly all of it from riders telling us what was missing: Beta Foils, the AXIS Fireballs 1500 and 1750, Armstrong APF, Indiana stabilizers, Takoon Carve and Pump, Sabfoil Blackbird and the first Ketos stabilizers.",
      "If you could not find your gear, it may have been in the list under the maker\u2019s name rather than the code printed on the part. Those cases are cleared up, and forty duplicate front wings were removed.",
      "A question about missing gear gets answered in the chat, and the answer may come from an AI assistant writing under its own name. The [imprint](/impressum) explains what that means for your data.",
    ],
  },
  {
    date: "August 7, 2026",
    items: [
      "Failed pairing attempts can be removed under Profile \u2192 Watch instead of piling up in your list.",
      "Your top speed comes only from your runs, so a tow back or a GPS glitch cannot set it. All sessions were recalculated.",
      "GONG Curve H V2 arrived in full (XS through 6XL), together with the Unifoil Evolution series, Roam Foils and ten stabilizers — four riders had asked for these.",
    ],
  },
  {
    date: "August 6, 2026",
    items: [
      "Pausing on a Garmin watch: START now opens a small menu \u2014 resume, cancel, or end and save \u2014 with nothing preselected. Garmin 1.0.73.",
      "The site is available in Norwegian, in full. The watch and phone apps follow with their next updates.",
      "Amazfit 1.0.4 draws your own data pages instead of one fixed screen, shows how many sessions are waiting to be sent, and keeps the foil you picked with the session.",
    ],
  },
  {
    date: "August 5, 2026",
    items: [
      "No more 100 km/h while standing on the dock: the watch checks GPS quality and shows \u201c--\u201d while it is poor. Recorded sessions were never affected. Garmin 1.0.72, other watches follow.",
      "The watch no longer records without permission to use your location \u2014 without it there is no track, no distance and no runs. It also warns when location is only \u201capproximate\u201d and says when a session got no GPS. iPhone and Apple Watch 1.1.21.",
      "Taking a boat wave, being towed on a rope and surfing an ocean wave are separate categories now, each with its own records.",
      "When a recording is not counted as pumpfoiling, the \u201cFiltered out\u201d tab explains why and lets you file it under the right sport. You can set a default sport if you often ride another one.",
    ],
  },
  {
    date: "August 4, 2026",
    items: [
      "Android 1.1.18: the phone app shows when a session was classified automatically and when runs were set aside as ridden under outside power, each with a one-tap override.",
      "Wear OS 1.2.18 is live too: while a session uploads, the watch now says “keep the app open!” — closing the app early was the main reason sessions seemed to be missing for hours.",
    ],
  },
  {
    date: "August 3, 2026",
    items: [
      "A crash no longer paints \u201cthe hardest carve of all time\u201d \u2014 the run ends at the fall instead of following you paddling back. 59 run endings were corrected; real hairpin carves are untouched.",
      "The Early Bird and Night Owl records use your time on the foil, not the recording \u2014 a recorder left running on the way home no longer wins.",
      "Spot names are back: the naming service had stopped answering, so more than half of recent sessions showed no spot. All missing names were filled in, and a second service now steps in when the first fails.",
      "In the catalogue: the complete AXIS Fireball line (880–1350), the F-One JAM pump foils (1400/1600/1900) and all ten AXIS Skinny stabilizers — every figure from the manufacturers’ own spec sheets. Thanks for the requests!",
      "Fixed: the threshold dropdown next to your start-success rate always snapped back to 0. It was a leftover from an older design — the rate has long been counted from start attempts versus completed runs, so the dropdown had no effect and is gone now.",
      "iPhone and Apple Watch 1.1.19: a session opened from a record goes back to the records list, the old logo no longer flashes at launch, and the watch reminds you to keep the app open while a session uploads.",
    ],
  },
  {
    date: "August 1, 2026",
    items: [
      "Runs clearly not ridden under your own power \u2014 a tow, a car, a motor \u2014 are set aside automatically, with the numbers behind the decision shown under the session and one tap to bring them back. Nothing is deleted.",
      "New sessions are checked for whether they look like pumpfoiling at all. If not, you get a note and the session stays out of every ranking until you file it \u2014 one click overrules it.",
      "The same check was applied to older sessions once: 39 of 827 were marked, and the community records lost several entries that were wing or transport rides — the longest genuine pumpfoil run, 42 minutes, is untouched at the top.",
      "The watch apps now say \u201ckeep the app open!\u201d while a session is uploading, and the start screen says when the watch is not linked or recordings are waiting. Garmin 1.0.71.",
      "Garmin recordings carry exact timing for each block of motion data now, so pump counts and glide phases no longer drift on long sessions.",
      "Connecting a watch: the help now describes all four brands, not only the Garmin way.",
    ],
  },
  {
    date: "July 31, 2026",
    items: [
      "If you added the site to your iPhone home screen, the login button at the top right is reachable again.",
      "Sessions lists every session again, whatever sport it is \u2014 anything that is not pumpfoiling carries a small label. Records and the per-sport views are unchanged.",
      "At a spot where nobody recorded with a motion sensor, the view switches itself to \u201call\u201d instead of showing an empty list.",
      "Session cards now show your stabilizer, mast length and board next to the foil, wherever they are known — on your home page, in Sessions and in the community list. Parts you haven’t set simply don’t appear.",
      "The phone apps caught up with the website: iPhone and Apple Watch 1.1.18, Android 1.1.17, Wear OS 1.2.17. New: labelling a session\u2019s sport, a default sport in your profile, your full setup per session, likes in the chat, and the watch data screens for all three situations.",
      "Wear OS and Apple Watch draw your own screen layouts, like the Garmin app does, and holding to stop takes two seconds instead of three.",
      "Amazfit: recorder app 1.0.3 is approved and in the Zepp App Store.",
      "Runs are no longer cut short at the end or split in two. Across all sessions this returned about an hour of foiling time and merged 45 runs back together.",
      "Speeds measured while the GPS had lost its bearings no longer count towards your top speed.",
      "Gong\u2019s new Atmo range is in the foil list \u2014 all 41 variants, including four models that were missing entirely.",
      "Gong Trail stabilizers now carry their span and area (40/43/46 cm), so the power calculation works with them too.",
    ],
  },
  {
    date: "July 30, 2026",
    items: [
      "You can take single runs \u2014 or any stretch of time \u2014 out of a session. Excluded parts stop counting towards runs, distance, pumps and records. Nothing is deleted; one click puts them back.",
      "Drives between two spots no longer count as runs. Every session was re-analysed with the stricter check.",
      "Trimming now shows the time of day, not just minutes into the recording. The run table has always shown clock times, so picking where to cut meant doing the arithmetic yourself. Both sliders now show both.",
      "Your favourite foils are at the top when you change the foil on a session, instead of off-screen. Same for stabilizers.",
      "Foil names in the catalogue no longer repeat the size twice (“Phantasm PTM 684 684”). Affected 41 entries from Moses, Sabfoil and Slingshot; searching still finds them the same way.",
      "Garmin recordings are labelled \u201cPumpfoil\u201d in Garmin Connect for everyone now. Your own choice under Profile \u203a Watch \u203a Activity type is untouched.",
      "Ketos foils are in the list: KOBUN, Karve Freefly, SPLIT, EVO, LD and Dock Start.",
    ],
  },
  {
    date: "July 29, 2026",
    items: [
      "Pump cadence can be shown as pumps per minute instead of Hz \u2014 \u201c86/min\u201d rather than \u201c1.43 Hz\u201d. Set it once in your profile; it applies everywhere and follows your account.",
    ],
  },
  {
    date: "July 28, 2026",
    items: [
      "Connecting a Suunto account works again \u2014 it had failed part way through between 19 and 28 July. If you gave up back then, try again under [Linked accounts](/konten).",
    ],
  },
  {
    date: "July 27, 2026",
    items: [
      "Garmin 1.0.68: holding STOP brings up the save / pause / discard menu after two seconds instead of three.",
      "If you mostly record another sport, set a default sport in your profile so new sessions arrive in the right category.",
      "Sessions can say which sport they are. Labelled sessions stay in your history but stop competing in the pumpfoil records.",
      "You can ask the owner of a session that does not look like pumpfoiling to label it properly \u2014 anonymously, and it takes two requests before anything is set aside.",
      "Garmin 1.0.67: your screens follow what you are doing \u2014 as many as you like for riding, not riding and paused. Set it up under Watch \u203a Data views.",
      "Paused screens always show a \u201cPaused\u201d marker. You can move it and colour it, but not remove it \u2014 otherwise there\u2019s no way to tell a paused recording from a frozen watch.",
      "Separator lines in your own screens can now run horizontally, vertically or diagonally: drag the line to move it, or drag either end to place it exactly.",
      "The editor now shows font sizes the way the watch really draws them. They used to be shown up to a third too small, so anything you picked came out bigger than expected on the wrist.",
      "Watch layouts from the community are now on the community page, and the gallery ranks them by how many riders actually use them.",
    ],
  },
  {
    date: "July 26, 2026",
    items: [
      "Garmin 1.0.66: your own layouts run on the watch, including the screens for after a run and between runs, and can be switched off right on the watch. The save menu is white now so it stays readable in sunlight.",

      "Garmin 1.0.65: fixed the app crashing during long sessions and large uploads on watches with less memory.",
      "Build your own watch screens: place values, labels, separator lines, the REC dot and the page dots anywhere, with size, colour and watch shape. Preview it with sample data in your own language. Your current 3-field views keep working.",
      "Share layouts with the community: publish yours, browse what others published, and copy any of them into your profile.",
      "Detailed setup per session: stabiliser, mast length, shim angle and board, each with a default and a per-session override.",
      "The pause screen is configurable: choose which three values the watch shows while you\u2019re waiting between runs (it used to be fixed). Set it under Watch \u203a Data views.",
    ],
  },
  {
    date: "July 25, 2026",
    items: [
      "Garmin 1.0.64: fixed the app crashing on startup (\u201cIQ!\u201d) on watches with less memory. The most constrained watches run a streamlined version \u2014 GPS only, English, no on-watch menus.",
      "Apple Watch 1.1.17: fixed sessions getting stuck on \u201cwaiting for connection\u201d after a ride. They now upload on their own as soon as you are back online.",
      "Fixed duplicate notifications: you now get exactly one “session analysed” push per session, instead of occasionally several for the same one.",
    ],
  },
  {
    date: "July 24, 2026",
    items: [
      "Start success rate reflects reality: a start where you pumped but never got up counts as a failed attempt. Applied to all past sessions; the cutoff stays adjustable in your profile.",
      "Watch a session upload live: on your home page and in Sessions, a session that’s still uploading now appears at the top with live progress — and its GPS map shows up as soon as the track is in, before the rest of the data finishes uploading.",
      "Garmin 1.0.62: your GPS track transfers first, so an interrupted upload still leaves a session that can be analysed. The watch app also speaks Dutch, Finnish and Czech now.",
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
      "Start success rate on your home page: the share of your starts that became a run, over your last sessions.",
      "Like chat messages — tap the thumbs-up under a message’s avatar to react; likes show a count and you can toggle yours off again.",
    ],
  },
  {
    date: "July 21, 2026",
    items: [
      "Amazfit watches are supported: our recorder app is live in the Zepp App Store.",
      {
        text: "Carve view on the session map: switch the map to \u201cCarves\u201d to see your carves highlighted, with the count and the sharpest one in the run table.",
        img: "/changelog/carve-example.webp",
        imgAlt: "A carve on the session map, coloured green to orange by lean angle",
      },
      "More accurate top speed: a GPS glitch on the first or last point of a run no longer sets it.",
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
      "More reliable uploads on Garmin watches: if the connection drops mid-upload, the watch picks up where it left off instead of starting over.",
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
    <div className="mx-auto max-w-2xl p-6"
         style={{ paddingTop: "calc(1.5rem + env(safe-area-inset-top))" }}>
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
