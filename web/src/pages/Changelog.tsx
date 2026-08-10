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
    date: "August 10, 2026",
    items: [
      "Pump counts were too low in some sessions, and a few runs claimed a glide of 30 or 45 seconds — which is simply not possible on a pumpfoil. A rider said exactly that: either the number is wrong, or something else was pushing him along. He was right, and the cause was on our side. Watches report how often they record wrist movement, but some deliver a different rate than they report — fifty measurements per second where twenty-five were asked for. Our analysis believed the reported rate, so the longer a session ran, the further the wrist data drifted away from the part of the track it belonged to: in the middle of a two-and-a-half-hour recording it was about two minutes off. It was reading a moment when the rider stood still between two runs, found no pumping there, and turned that into a long “glide”. The recording rate is now taken from the data itself, and the timing is anchored to the moment each piece of data was actually recorded. In the reported run the 45-second glide became 1.6 seconds, the pump count went from 42 to 120, and the cadence from 0.5 to 1.6 pumps per second — a realistic value.",
      "All existing sessions are being recalculated. Where this applied, pump counts go up and long glides get shorter; your distances, speeds, tracks and the map were never affected by it. If you have wondered before why a session showed fewer pumps than it felt like, this may be why.",
      "Garmin 1.0.74 is in the Connect IQ store, and it fixes a crash that was hard to escape. When the watch’s own storage filled up — which happens when recordings pile up unsent, for example while you are away from your phone — the app quit with “IQ!” the moment you opened it. Deleting and reinstalling appeared to help, because that empties the storage, so the real cause stayed hidden. The app now keeps running and says on the start screen that the storage is full. One rider on a Forerunner 970 reported this with fifteen recordings waiting; his log made it possible to reproduce it exactly.",
      "Recordings waiting to upload now show how much data they are, not just how many there are: “15 waiting for upload · 4 MB”. Twenty short sessions are far less data than three long ones, so a count on its own told you nothing about whether the watch was about to run out of room.",
      "And if the app ever crashes while starting, the next launch falls back to the fixed data screens by itself instead of crashing again — your own data pages come back as soon as it starts cleanly.",
    ],
  },
  {
    date: "August 9, 2026",
    items: [
      "Android and Wear OS are updated in the Play Store: phone 1.1.20 and watch 1.2.20. This is the update that makes location a real requirement before recording — if the permission is missing the app now asks, and if you decline it says so instead of saving a session with no track. It also warns you when location is only “approximate”, tells you when a session was saved without GPS, and no longer overwrites a working watch connection when you pair again. Wear OS was the last platform still waiting for these fixes.",
      "The gear catalogue grew a lot, and nearly all of it came from riders telling us what was missing. New: Beta Foils — the Freefoil wing and its three tails, a brand that wasn’t in the list at all — the two new AXIS Fireballs (1500 and 1750), Armstrong’s APF front wings, Indiana’s monobloc and flat-mount stabilizers, Takoon’s Carve and Pump ranges, Sabfoil’s Blackbird stabilizers, and the first Ketos stabilizers we have ever had: there were sixteen Ketos front wings in the list but not a single tail. Every entry was checked against the manufacturer’s own page. Where a maker doesn’t publish a profile thickness, ours is marked as an estimate — and it isn’t used in any calculation.",
      "If you couldn’t find your gear before, it may have been in the list under a different name. Several riders had created their own private entries because they searched for the code printed on the part — SDW/375, 150AR — while the list shows the name the maker advertises, like “Downwind Kraken 375”. Those cases are cleared up: you can pick the catalogue entry now and delete your private one. Forty front wings that appeared twice have been removed as well.",
      "A question about missing gear now gets answered in the chat, and the answer may come from an AI assistant writing under its own name (“Claude Code AI”). It looks up the manufacturer’s specifications, adds what’s missing and tells you what it found — including when the thing you asked for doesn’t exist, or turns out to be a front wing rather than a stabilizer. The [imprint](/impressum) explains what that means for your data: sessions, feedback and chat messages can be sent to Anthropic for analysis, for improving our detection models, for developing the app, and for this catalogue research.",
    ],
  },
  {
    date: "August 7, 2026",
    items: [
      "Failed pairing attempts can be removed. If pairing a watch didn’t work the first time, every attempt stayed in your profile as a watch of its own, with no way to clear them — one rider ended up with a whole list of them and told us he couldn’t get rid of any. Profile → Watch lets you remove them now, and it says to start the app on the watch first, which was the missing step in most failed attempts.",
      "Your top speed now comes only from your runs. Until now the fastest reading of the entire session counted, so a boat transfer, a tow back to the start or a GPS glitch could set your record. It is now taken from the runs the analysis actually recognises, and the speed a run has to reach was lowered from 40 to 32 km/h so that lighter riders and slower foils aren’t left out. All existing sessions were recalculated, so the number you see is the corrected one.",
      "GONG Curve H V2 arrived in full (XS through 6XL), together with the Unifoil Evolution series, Roam Foils and ten stabilizers — four riders had asked for these.",
    ],
  },
  {
    date: "August 6, 2026",
    items: [
      "Pausing on a Garmin watch got a proper way out. Until now a short press of START simply ended the pause, and if you wanted to finish the session from there you had to resume first and then hold the button. Now START opens a small menu — resume, cancel, or end and save — with nothing preselected, so pressing START twice does nothing and the choice is always deliberate. Everything else about pausing is unchanged, including your own data pages for the paused state. Garmin 1.0.73 is in the Connect IQ store and on the website.",
      "The site is now available in Norwegian, in full — every text, not just the important ones. It arrived because of the first session ever recorded in Norway, at Sogndal. The watch and phone apps follow with their next updates. If you read Norwegian and something sounds off, please tell us: the translation is careful but it hasn’t been reviewed by a native speaker yet.",
      "Amazfit 1.0.4 is in the Zepp App Store. The watch now draws your own data pages — the same ones you build on the website for the other watches — instead of one fixed screen. It also tells you to keep the app open while a session is uploading, shows how many sessions are still waiting to be sent, and keeps the foil you picked with the session.",
    ],
  },
  {
    date: "August 5, 2026",
    items: [
      "No more 100 km/h while standing on the dock. Right after starting, a GPS chip can report garbage speeds for a few seconds, and the watches displayed them unfiltered — one rider filmed his watch showing 100.1 km/h while standing still. The watch now checks the GPS quality for every reading and shows “--” while it’s poor, and the on-watch run detection ignores those values too. Your recorded sessions were never affected — the analysis has always filtered these spikes. Garmin 1.0.72 is on the website now; Apple Watch and Wear OS follow with their next updates. Thanks for the video!",
      "The watch no longer records without permission to use your location. If that permission is missing, a watch app can still record motion — but not a single position, so the session has no track, no distance and no runs. That is exactly what happened to one rider: several recordings over hours, some of them 2 to 3 hours long, with plenty of motion data and no GPS at all. He assumed his watch wasn’t supported and bought a newer one, which wasn’t necessary. Now the app asks for the permission when you press start and, if you decline, says so instead of recording something unusable. It also warns you when location is granted as “approximate” only — approximate positions carry no usable speed. And after a session that got no GPS, the watch says that too, rather than quietly saving it. iPhone and Apple Watch 1.1.21 is in the App Store now (it also brings the GPS quality check above); Wear OS follows with its next update.",
      "Different ways of using a wave are now separate categories, because they are different things: taking the wave of a passing boat, being towed behind one on a rope, and surfing an ocean wave. Previously all three shared one “Wake / boat” label. Each has its own records and rankings, and your pumpfoil comparisons stay clean — the rider who asked for this said it best: he wanted to share the ride, but not have it counted as pumpfoiling.",
      "When a recording isn’t counted as pumpfoiling, it is easier to find out why. The “Filtered out” tab now shows how many there are and highlights when something recent landed there, and the view itself explains what happened and that you can file the recording under the right sport yourself — it then counts in that sport’s category. If you often ride one of the other sports, you can set it as your default so new recordings land correctly from the start.",
    ],
  },
  {
    date: "August 4, 2026",
    items: [
      "Android 1.1.18 is live in the Play Store. The phone app now shows the same notices the website got last week: when a session was classified automatically (with the exact numbers behind the call, and a one-tap override), and when runs were set aside as ridden under outside power — with a “bring it back” button. If your app offers an update, this time the button in Play will actually deliver it.",
      "Wear OS 1.2.18 is live too: while a session uploads, the watch now says “keep the app open!” — closing the app early was the main reason sessions seemed to be missing for hours.",
    ],
  },
  {
    date: "August 3, 2026",
    items: [
      "A crash no longer paints “the hardest carve of all time”. When you fall, the watch keeps seeing movement — you paddling back — and if that’s faster than walking pace the run kept growing into it, drawing a sharp hook at the end of the track. The detector now recognises the crash signature (the track reverses direction within seconds while the speed collapses) and ends the run right at the turn. Measured against all 4,855 recorded runs, this corrected 59 run endings — and deliberately left every real hairpin turn alone: a genuine 180° carve keeps its speed, a crash doesn’t. Thanks to the rider whose precise report caught this, his third confirmed find.",
      "The Early Bird and Night Owl records now use your time on the foil, not the recording. A session where the recorder kept running on the train home held “Night Owl” with a time long after the last real run — both records are now taken from the first run’s start and the last run’s end.",
      "Spot names are back. The service that turns coordinates into place names had silently stopped answering us, so more than half of recent sessions showed no spot — which is also why several of you looked for a “create spot” button. All missing names have been filled in, a second naming service now steps in when the first fails, and the Spots page finally says how spots work: they appear automatically when someone uploads a session at a new location, named from OpenStreetMap.",
      "In the catalogue: the complete AXIS Fireball line (880–1350), the F-One JAM pump foils (1400/1600/1900) and all ten AXIS Skinny stabilizers — every figure from the manufacturers’ own spec sheets. Thanks for the requests!",
      "Fixed: the threshold dropdown next to your start-success rate always snapped back to 0. It was a leftover from an older design — the rate has long been counted from start attempts versus completed runs, so the dropdown had no effect and is gone now.",
      "iPhone and Apple Watch 1.1.19 is in the App Store: session views opened from a record now go back to the records list instead of stepping through previously viewed sessions, the old logo no longer flashes at launch, and the watch reminds you to keep the app open while a session uploads.",
    ],
  },
  {
    date: "August 1, 2026",
    items: [
      "Runs that were clearly not ridden under your own power — being towed by a boat, sitting in a car or train with the recorder still running, or riding with a motor — are now set aside automatically. The detector compares your heart rate during the run against your resting level right before it: pumping is hard work, a ride on outside power isn't. Each set-aside run is shown under the session with the exact numbers that led to the decision, and one tap brings it back if the detector got it wrong — nothing is deleted, ever. Measured against every confirmed case we have: not a single genuine run was touched, including the longest recorded pumpfoil runs.",
      "New sessions are now checked automatically for whether they look like pumpfoiling at all. If one doesn’t, you get a friendly note asking you to file it correctly, and until you do it stays out of every ranking — yours and everyone else’s. Where the evidence is clear the sport is filled in for you (a motor leaves an unmistakable trace: ten minutes at a steady speed while your heart rate goes down); where it isn’t, nothing is claimed and the session simply waits for your answer. You can always overrule it in one click, and the note tells you exactly which numbers led to it. The check is deliberately shy: it only speaks up for runs longer than four minutes where the effort doesn’t show, because a pumping run lasts 27 seconds on average across 5658 recorded runs.",
      "The same check was applied to older sessions once: 39 of 827 were marked, and the community records lost several entries that were wing or transport rides — the longest genuine pumpfoil run, 42 minutes, is untouched at the top.",
      "The watch apps now speak up at the two moments that caused most support questions. While a session is still uploading they say “keep the app open!” — the transfer runs only while the app is in the foreground, and closing it early was the reason sessions seemed to be missing for hours. And when the watch isn’t linked to your account, or recordings are waiting to upload, the start screen says so clearly. Garmin 1.0.71 is on the website for direct download now (the store update follows); Amazfit gets the same in its next release, plus the pairing code right on the start screen and a fix for the app closing mid-session when the display turns off.",
      "Garmin recordings now carry exact timing for each block of motion-sensor data, like the other watches already did. Until now the analysis had to estimate the sensor rate, and when a watch deviated from its nominal rate the motion data could drift minutes away from the GPS track over a long session — pump counts and glide phases suffered quietly. New recordings with 1.0.71 are exact.",
      "Connecting a watch: the help text described the Garmin way only (“hold MENU”), for all four watch brands. On an Amazfit there is neither that button nor that menu — you swipe left from the start screen instead — and on Wear OS and Apple Watch the pairing screen appears by itself. All four are now described, in every language.",
    ],
  },
  {
    date: "July 31, 2026",
    items: [
      "If you added the site to your iPhone home screen, the login button at the top right is reachable again. In that mode iOS lays its translucent status bar over the top of the page, and the button sat underneath it — the only way in was to scroll all the way down to the second login button. Thanks to the rider who reported it. Same fix on the imprint, the changelog and the login screen.",
      "Sessions lists every session again, whatever sport it is. Since sports could be labelled, that list had quietly narrowed to pumpfoiling only — so a wingfoil, eFoil or wake session you recorded stopped showing up there. It is back to being the plain “what’s new” list, and anything that isn’t pumpfoiling now carries a small label so you can tell at a glance. The separate per-sport views and all the records are unchanged: those still each cover exactly one sport.",
      "Open a spot where nobody has recorded with a motion sensor and you no longer get an empty list — the view switches itself to “all” for that spot. It is not remembered: leave the spot and the setting goes back to what your own watch delivers, and if you flip the switch yourself your choice stays.",
      "Session cards now show your stabilizer, mast length and board next to the foil, wherever they are known — on your home page, in Sessions and in the community list. Parts you haven’t set simply don’t appear.",
      "The phone apps caught up with the website — a big release on all platforms. iPhone and Apple Watch 1.1.18 (App Store, live since 29 July), Android 1.1.17 and Wear OS 1.2.17 (Play Store, live today). New in them: label a session\u2019s sport and flag someone else\u2019s that doesn\u2019t look like pumpfoiling, with the polite request and the appeal that the website already had; a default sport in your profile so new sessions land in the right category; your full setup per session (stabilizer, mast length, shim angle, board) with a page to keep your own gear list; likes in the chat; and the watch data screens with all three situations (riding, not riding, paused) instead of one screen each.",
      "Wear OS and Apple Watch now draw your own screen layouts, like the Garmin app does — the ones you build under Watch \u203a Data views, with your fields, colours and sizes, plus the Automatic/On/Off switch on the watch itself. Holding to stop or discard now takes two seconds instead of three. Several rendering details were corrected along the way: font sizes were up to a third too small, the palette was slightly off, the REC marker was missing its label, and layouts now use the full round display instead of leaving a border.",
      "Amazfit: recorder app 1.0.3 is approved and in the Zepp App Store.",
      "Runs are no longer cut short at the end, and no longer split in two. Two riders reported it and both were right. First: when you ride back towards the dock, the end of the run was being discarded — that check exists to throw away the fake positions a watch produces when it goes under water, but it was catching real riding as well. It now looks at the shape of the track: an underwater watch draws a dead-straight line at a constant speed, while real riding curves and varies. Second: if the watch briefly reported a much lower speed than the GPS track shows, or if you touched down and pumped straight back up, the run was ended and a new one started. Both now stay one run. Across all sessions this returned about an hour of foiling time that had been dropped, and merged 45 runs back together.",
      "Speeds measured while the GPS had lost its bearings no longer count. After a crash a watch can report a jump of 30 km/h with 20+ metres of position error — one of those was holding the top-speed record. There was already a limit for GPS accuracy, but it only applied to sessions recorded without a motion sensor. It now applies everywhere, for the top speed of a session as well.",
      "Gong's new Atmo range is in the foil list — all 41 variants: Sirus and Trail (both Perf and Team), Hyper Trail, Supra Trail, Ultra Trail, Veloce DW and Veloce XTR. Four of those models were missing from the catalogue entirely, Atmo or not. Every figure is the manufacturer's own, and each row was checked against the published aspect ratio before it went in.",
      "Gong Trail stabilizers now carry their span and area (40/43/46 cm), so the power calculation works with them too.",
    ],
  },
  {
    date: "July 30, 2026",
    items: [
      "Forgot to stop the recording and drove home? You can now take single runs — or any stretch of time — out of a session. Open a session you own, and each run in the run table has a button to set it aside; for a part that isn’t a run at all, use “Exclude range” in the Trim panel and pick the two times. Excluded parts stop counting towards runs, foiling time, distance, pumps and records, and disappear from the totals and the map. Nothing is deleted: the recording stays complete and you can put any part back with one click.",
      "Drives between two spots no longer count as runs. A run is now also checked against its average speed, not just its top speed, so a car ride at a steady 70 km/h can’t pass as a very good ride any more. Every session was re-analysed with the stricter check.",
      "Trimming now shows the time of day, not just minutes into the recording. The run table has always shown clock times, so picking where to cut meant doing the arithmetic yourself. Both sliders now show both.",
      "Your favourite foils are always right there when you change the foil on a session. The list used to open at whichever foil was selected — if that one sat deep in the full catalogue, your favourites were off-screen and you had to scroll back up. Same fix for stabilizers.",
      "Foil names in the catalogue no longer repeat the size twice (“Phantasm PTM 684 684”). Affected 41 entries from Moses, Sabfoil and Slingshot; searching still finds them the same way.",
      "Garmin recordings are labelled “Pumpfoil” in Garmin Connect for everyone now. That was announced on 20 July, but only applied to accounts that existed back then — anyone who signed up later still got “Surfing”. If you deliberately picked Surfing or Open Water, your choice is untouched (Profile › Watch › Activity type).",
      "Ketos foils are now in the foil list: KOBUN, Karve Freefly, SPLIT, EVO, LD and Dock Start. Where the manufacturer publishes only part of the numbers, the missing ones are worked out from the rest of the range and the entry says so, so you can tell which figures are exact.",
    ],
  },
  {
    date: "July 29, 2026",
    items: [
      "Pump cadence can now be shown as pumps per minute instead of Hz. “1.43 Hz” is hard to picture, “86/min” is not. Choose it once in your profile under Pump cadence and it applies everywhere: session pages and run tables, your history, comparisons and the community tables. Tapping the cadence tile on a session still flips it, and the choice now follows your account instead of only this device. Nothing is recalculated — it is only how the number is written.",
    ],
  },
  {
    date: "July 28, 2026",
    items: [
      "Connecting a Suunto account works again. Between July 19 and 28 it stopped part way through: you could log in at Suunto, and then it gave up. That was on Suunto’s side, not yours — nothing was wrong with your password or your watch. If you gave up back then, please give it another go under [Linked accounts](/konten); your workouts then import as sessions.",
    ],
  },
  {
    date: "July 27, 2026",
    items: [
      "Garmin watch app 1.0.68 (live in the Connect IQ store): holding STOP now brings up the save / pause / discard menu after two seconds instead of three. Since that menu appeared, holding no longer ends the recording by itself \u2014 so there was no reason to make you wait as long.",
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
