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
    date: "August 31, 2026",
    items: [
      "Garmin watches have stopped counting down to a full memory that was not full. Riders saw \u201ctwo minutes left\u201d, then one, then zero, in the middle of an ordinary session with plenty of room to spare. The countdown rested on a guess: Connect IQ gives an app no way to ask how much space is actually free, so we work from how much a given watch model has been measured to hold \u2014 and where we had no measurement, we filled in a cautious figure and did arithmetic on that. A number we cannot stand behind is worse than no number, so now the watch simply shows nothing until we really know. Version 1.0.83, in the Connect IQ store now, and you do need the update: the wrong figure was stored on the watch itself, and only the new version clears it out.",
      "Maps have a satellite view now \u2014 all of them: your session, the comparison, the spots map, the progress-at-a-spot animation and the labelling view. One button in the corner switches, and your choice sticks across every map in the app, so you set it once. Useful for more than looking pretty: on a lake the street map is a blue shape, while the aerial image shows you the dock you launch from, where the reeds are and where the shallow bit ends. OpenStreetMap has no aerial imagery of its own \u2014 it is a data project \u2014 so those tiles come from Esri, and they are only ever requested if you actually switch. The iPhone and Android apps get the same switch.",
      "You can attach files to feedback now \u2014 a screenshot of what went wrong, or a log. Up to three per message, images or text; anything else is refused. Images are re-encoded on our side before they are stored, which is the real safeguard: whatever might be hidden in the original file does not survive that. Attachments only go to your own message and only within half an hour of sending it.",
      "The iPhone app is fixed. Version 1.1.25 could refuse to start, and the cause was on our side, not on anyone\u2019s phone: our map asks to be shown an area big enough to hold every spot we know, and once a rider in Japan uploaded a session, that area spanned from Alaska to the Pacific \u2014 wider than the map is allowed to be. iOS shut the app down rather than draw it. The day before, we were less than nine degrees short of that limit, which is why it worked until it suddenly did not. Version 1.1.26 caps the area, and the same guard now sits on every map in the app, including the one that compares two sessions from different continents. The fix reached everyone within the hour through the server, before the update was even submitted.",
      "While we were in there: the app no longer builds all seven tabs when it starts, only the one you are looking at \u2014 the spots map alone was drawing over two hundred pins before you had even opened it. And that map now bundles pins that sit on top of each other at low zoom, showing how many spots are hiding under one dot instead of quietly picking one of them when you tap.",
    ],
  },
  {
    date: "August 30, 2026",
    items: [
      "There is a community video feed now, on the [community page](/community) above the photos. Every rider can add their YouTube channel in their [profile](/einstellungen); once we have had a look at it, their clips join the feed. Everything lands in one stream, newest first, across all channels \u2014 not sorted by what an algorithm thinks you should watch, and not one channel at a time. Tap a clip and it plays right here, full screen, with arrows to go through the others; short clips loop. Nothing is sent to YouTube until you actually press play, and the preview images come from our own server, so opening the page tells Google nothing about you. One channel per person, and a channel can be removed again if it drifts off topic \u2014 this is a place for pumpfoiling. Only YouTube works for this: Instagram and TikTok stopped handing out a channel\u2019s videos, so there is no way for us to collect them.",
      "One thing the feed cannot do: like a video on your behalf. That only works inside YouTube itself, so there is a button that takes you there \u2014 on a phone it opens the app, where you are already signed in and it is a single tap. Worth doing: the people filming these clips live off it.",
      "Your records and totals on the home page now come a second time \u2014 once for every foil you ride, and once for the sessions where no foil was recorded. Same tiles, same numbers, just split by wing: farthest run, longest run, top speed, sessions, pumps, everything. It answers the question you actually have when you own more than one foil, which is not \u201chow far have I ever gone\u201d but \u201chow far have I gone on this one\u201d. Only foils you rode inside the selected period show up, so the list stays short unless you ask for all time. The idea came from a rider who suggested showing the best time and distance per foil.",
      "The tiles now start on the last ten days instead of all time. What you did this week says more about how it is going than a record from two summers ago \u2014 and the all-time view is one tap away.",
      "Your Garmin watch now counts a run the way the website does. Until today it could end a run too early: if your speed dipped for a moment \u2014 a touchdown between two pumps \u2014 the watch called it over, and then it ignored you for another twenty-five seconds while you were already riding again. Those seconds simply went uncounted. One rider photographed her watch after every single run and sent us the series; on one of her runs the watch showed 66 metres where she had ridden 144, and on another it showed 14 metres of what was really a 176-metre run. Three things changed: the watch only locks itself out after you have really stopped, a run that picks up again after a brief dip counts as the same run rather than a new one, and a twitch shorter than five seconds is no longer shown as your last run. Measured against her two sessions, the gap between watch and analysis drops from about a third to a few percent. Version 1.0.82, in the Connect IQ store now.",
      "The two will never agree perfectly, and that is worth knowing: the analysis on the server also sees the accelerometer and finds runs that GPS alone cannot show. Your watch works live, from GPS, on a wrist. It just got a lot closer.",
      "The [foil stats](/foil-stats) now show the longest run as well as the farthest one, for every foil. Distance was already there; the time it stayed up was not, and the two together say more about a wing than either alone \u2014 a foil that carries you a long way and a foil that keeps you up a long time are not always the same foil. Sortable like every other column. The phone apps get it with their next update.",
    ],
  },
  {
    date: "August 27, 2026",
    items: [
      "Speed zones \u2014 the same idea as the heart rate zones, now in your [profile](/einstellungen) as well. Five zones from slow to your own maximum, and we start you off with a suggestion built from the speeds you actually ride: we take the ninetieth percentile of your session tops rather than your single fastest reading, so one GPS glitch cannot stretch the scale to the point where nothing ever turns red again. Move a boundary and it is yours; a button puts the suggestion back.",
      "And the colours finally agree with each other. Until now the number on your watch and the graphic next to it were coloured by two different scales: the number had fixed steps baked into the app, the graphic used the range you set for the alarm. At 15 km/h you could see a green number and a yellow ring on the same screen. Both now follow your zones \u2014 on every watch, in the layout editor and in the previews. If you have never touched the settings, the first three speed boundaries are exactly the old fixed steps, so nothing looks different until you change something.",
      "What the colours mean, where they come from and how the suggestions are worked out is written down now, for anyone who wants to know rather than guess.",
    ],
  },
  {
    date: "August 26, 2026",
    items: [
      "Your watch screens can show a value as a shape now, not just as a number. Two new elements in the [layout editor](/layouts): an edge graphic that runs along the rim of the display, and a bar you can put anywhere. Both fill up according to the value \u2014 your heart rate against your zones, your speed against the range you also use for the alarm \u2014 and they can take their colour from the zone, so a glance is enough: blue is easy, red is everything you have. You draw it once and it fits every watch. On a round watch the edge graphic is a ring segment, on a square one it becomes a frame segment along the edge, and the watch works that out from its own shape \u2014 there is no round version and no square version of your layout to keep in step. Drag it around the rim in the editor, set how far it runs, pick a thickness. It works with the fields that have a scale \u2014 heart rate and speed \u2014 because a fill level without a top and a bottom would not mean anything.",
      "Which brings us to zones: you can set your heart rate zones in your [profile](/einstellungen). Five zones, and we start you off with a suggestion built from the highest heart rate we have ever measured on you \u2014 so for most riders the colours are sensible before touching anything. Move a boundary and it is yours; a button puts the suggestion back. Your watch gets the same numbers, so the ring on your wrist and the preview on the screen mean the same thing. Why we ask you rather than read it off the watch: Garmin and Amazfit know their own zones, Wear OS and Apple Watch have no way to tell us theirs. One source for all of them beats the same graphic being coloured differently on every wrist.",
      "On Garmin this is already live: version 1.0.80 is in the Connect IQ store, tested on a real watch. The other three watch platforms are built and go out with their next store round. Watches with very little memory do not get the graphics \u2014 they do not get custom screens at all, and we would rather leave them out than have them run out of memory mid-session.",
      "Your Garmin watch is also better at three smaller things now. The top speed no longer gets thrown off by a GPS glitch: a single implausible reading used to sit there for the rest of the session, and one rider\u2019s watch showed 103 km/h where the analysis said 15. The watch now applies the same two rules the website uses \u2014 ignore a reading that jumps far above the last fifteen seconds, and treat anything above 32 km/h as not pumpfoiling at all. Two runs with no real stop between them count as one, the way the site has always analysed them. And the \u201csaved\u201d screen no longer sits underneath the upload screen \u2014 one press of back is enough, and if you just pocket the watch it returns to the start screen by itself.",
      "Setting your heart rate zones no longer makes the browser offer to save a password. A rider spotted it: leave the profile page with one of the zone fields still active and Chrome asked whether to save the password \u201cfor user 161\u201d \u2014 which was a heart rate. The change-password fields further down the page were not inside a form of their own, so the browser treated the whole page as one login form and picked the nearest text field as the username. They have their own form now, with the account address marked as the username, so there is nothing left to guess.",
      "The spot count in the community line and the count on the [spots](/spots) page were telling you different numbers. Both come from the same source now, counted the same way. Chasing that down turned up two spots that were nowhere to be seen: the place lookup only accepts a town, a venue or a body of water, so a spot that a map only knows as a district or a county stayed nameless \u2014 and a nameless spot was quietly dropped from the map. Three sessions from two riders sat at those two places with no location shown and no marker on the map. They are on the map now, labelled with what we do know about them, and a spot that ends up nameless is given its district rather than nothing at all.",
    ],
  },
  {
    date: "August 25, 2026",
    items: [
      "The Android and Wear OS update is live \u2014 phone 1.1.23 and watch 1.2.23, in the Play Store now. It is the big catch-up round: the run table in a session scrolls sideways and shows all thirteen columns instead of six, you can compare single runs instead of whole sessions with fifteen figures each, the map opens full screen, the community gallery of watch layouts is browsable and copyable on the phone, records can be filtered by sport and period, the training curve (heart rate after one, two and five minutes of a run) is in the history, and the highest heart rate per run is in the run table. On the watch: heart rate is now measured actively through Health Services instead of only being read when something else happens to be measuring, there is a new data field for the highest heart rate of your last run, an invalid pairing heals itself instead of leaving you unpaired, and Norwegian was added. The switch for chat notifications also arrived on the phone \u2014 and with it a fix for a silent data loss: saving your settings in the app used to erase whichever choice you had made on the website.",
      "Dictating a chat message and then tapping \u201cedit\u201d works as it should: the text lands in the input field and the chat room stays open. Two symptoms, one cause \u2014 and it was our navigation, not the speech recognition. While the chat is open on a phone it keeps its own entries in the browser history, so a back swipe closes the room instead of leaving the page. The dictation screen does the same for itself, and when it tidied up after being closed by a button, the chat mistook that for you swiping back and closed the room. The message you had just dictated went with it. Any full-screen layer above a chat \u2014 the photo gallery, the share dialog, the full-screen map \u2014 had the same problem; all of them are fixed by the same change.",
      "A session sometimes still showed its old numbers after we had recalculated it. One rider put it exactly right: the overview said 13 runs, and opening the session showed 12. The list was computed fresh while the session page came from your device\u2019s cache \u2014 and the server never told it that anything had changed, because a recalculation did not update the \u201clast modified\u201d stamp it relies on. It does now, so every recalculation reaches you.",
      "Sessions you sorted out no longer distort your own history. If you mark a recording as something other than pumpfoiling, it now stays out of the progress curves under History, out of your spot list and out of the spot animation \u2014 it used to count towards all three. Recordings without an accelerometer keep counting, and so do sessions whose sport we have asked you about and you have not answered yet: those are still yours.",
      "The spot picker puts your own spots first. Under Sessions you now get two groups \u2014 the spots you have ridden, then everything else \u2014 instead of one long alphabetical list. And switching to \u201csorted out\u201d shows all of them right away: those recordings usually have no accelerometer data, so with the \u201caccelerometer only\u201d filter still on you were looking at an empty list under a tab that promised eight sessions.",
      "Wings now show their aspect ratio wherever they are named \u2014 \u201cAXIS PNG V2 1300 \u00b7 AR 10.4\u201d \u2014 in your sessions, in other people\u2019s, and in your profile. It is the number that tells you most about a wing\u2019s character, and it makes it obvious whether somebody else\u2019s ride is comparable to yours. Where we do not have a trustworthy area and span, no ratio is shown rather than a made-up one. The idea came from a rider who compares techniques across similar gear.",
      "Two fixes on the history page, both reported by a rider. Switching to another spot in \u201cprogress at the spot\u201d left you with a blank panel \u2014 the map was still the old one, pointing at a piece of the page that had just been thrown away, so it drew into nothing. It is rebuilt properly now when you switch. And a session you had marked as \u201cnot pumpfoiling\u201d still put its place in your spot list; sorted-out sessions no longer count towards your spots, and they stay out of the animation too. What is still counted: recordings without an accelerometer, and sessions whose sport we have asked you about but you have not answered yet \u2014 those are still yours.",
    ],
  },
  {
    date: "August 24, 2026",
    items: [
      "Spots can now be described by the people who ride them. Open a spot and you will find a new section between the weather and the sessions: how you get on the water here, what the bottom is like, where to park, whatever is worth knowing. Everyone who has a session at that spot gets their own block \u2014 one text and up to ten photos \u2014 and nobody can edit anybody else\u2019s. Several descriptions simply stand one under the other, each with the date it was last updated, and you can give the ones you find useful a heart; the most appreciated move to the top. Your photos can come straight from your own session photos at that spot instead of being uploaded again, and you decide their order. There is a filter on the spots map to show only spots that have a description. One thing to keep in mind: these are notes from other riders, not official information \u2014 on the water, trust your own judgement. The idea came from a rider, and it is a good one: a dock start, a beach start and a drop-in are three different days out, and until now there was nowhere to say which one a spot is.",
      "Amazfit watches finally count your pumps. Version 1.0.6 is in the Zepp store now, and with it the watch records raw acceleration for the first time \u2014 which is what pump detection needs. Until now an Amazfit session was GPS only: runs, distance and speed, but no pumps and no cadence. From this version on your sessions are analysed the same way as those from a Garmin, a Wear OS watch or an Apple Watch. A few other things came along: a session no longer starts a phantom run when the GPS position jumps once at the start, the watch reports its model so we can tell what a recording came from, there is a new field for the highest heart rate of your last run, and the touch lock is now a setting rather than always on \u2014 your watch is not always wet. On square watches the layout used to lose a seventh of the screen to the system bar and cut the title in half; that is fixed. Sessions you already recorded stay as they were, GPS only \u2014 the accelerometer was not in them.",
      "Searching for your gear no longer depends on the order you type the words in. Someone told us his wing was missing from the list \u2014 an AXIS PNG 1300 V2. It had been in the list for over a week: we keep it as AXIS, PNG V2, 1300, and the search was looking for his whole phrase inside a single field, so \u201cpng 1300 v2\u201d found nothing at all. You had to guess our word order to find your own equipment. Now every word is looked up on its own and the order does not matter: \u201caxis png 1300 v2\u201d, \u201c1300 png\u201d and \u201cpng v2 1300\u201d all land on the same wing, and the same goes for stabilisers. This matters beyond convenience \u2014 people who cannot find their gear add their own copy of it, which is how the duplicates we cleaned out last week got there in the first place. If yours really is missing, the \u201cmissing from the list?\u201d link still reaches us, and it is how nearly every wing in there was added.",
    ],
  },
  {
    date: "August 21, 2026",
    items: [
      "You can download your own sessions as a file now \u2014 two buttons under a session, GPX and FIT. The FIT file is a proper activity, so Garmin Connect, Strava and anything else that reads FIT will take it as a ride rather than as raw data, complete with heart rate, speed and distance. GPX is the plain track with your heart rate, for maps and anything that does not speak FIT. What you get is the session as you see it here: if you trimmed the drive home away, or sorted a run out, it is not in the file \u2014 and the distance does not count the straight line across a gap you cut out, which would otherwise invent metres you never rode. Only your own sessions, and only for you: the file is not reachable by a link somebody else could follow.",
    ],
  },
  {
    date: "August 20, 2026",
    items: [
      "Clicking a spot on the map now opens the spot you actually clicked. The markers were plain dots of a fixed size, and when the map is zoomed out to show every spot in Europe, one dot covers roughly 40 km — so most of them overlapped their neighbours, and a click landed on whichever dot happened to be drawn last. A rider reported clicking his own spot and getting a stranger's session: his spot was fine and its sessions were correct, another spot's marker was simply lying on top of it. Markers that overlap are now gathered into one circle showing how many spots are inside, and clicking it zooms in so you choose. Zoom in and the bundles come apart by themselves; a spot standing on its own behaves exactly as before.",
      "Large numbers now follow the language you picked, not the one your phone happens to be set to. The community line at the top read \u201c328.104 pumps\u201d even with the site in English \u2014 and in English a dot there is a decimal point, so the number looked a thousand times smaller than it is. Digits are now grouped the way each of our sixteen languages groups them. The same applies to the totals on your home page and in the history charts, where the German format had been wired in.",
      "The spot list had quietly filled up with duplicates, and they are merged. If you upload several sessions at once they get analysed in parallel, and each one could create its own entry for the same lake — one place had seven entries on a single point, a Polish lake had six within 17 metres. 301 entries became 172: the one with the most sessions keeps them, nothing was deleted, and every session stayed where it belongs. Names that had collected a counter because of a duplicate — \"Annecy 2\", \"Bönigen 2\" — are back to the plain name wherever it was free. Two places that turned out to be one spot under two names were joined as well. And the session count the map shows for a spot is now exactly what you get when you click it; for six spots those two numbers disagreed, because the map was only counting pumpfoil sessions while the list showed every sport.",
    ],
  },
  {
    date: "August 19, 2026",
    items: [
      "Missing runs are back. A rider pointed out that a run he had clearly ridden — plainly visible on his watch's own speed chart — was not in his session on our side. It was not a matter of thresholds: the run was fast enough for every setting we offer, and it was there in both sources, 28 seconds and 94 metres of GPS track with a clean pumping rhythm in the accelerometer. Each run is opened at the moment our detection first recognises foiling, and on this one it recognised a single second — too brief to open a run at all, so the whole run fell away before it could be measured. From now on such a moment counts when the accelerometer shows at least half a minute of uninterrupted pumping around it. We measured across all 1609 sessions that carry accelerometer data before changing anything: eight runs come back in seven sessions, and nothing else moves — no run disappears, no personal best and no record changes. Those seven sessions have been recalculated. If a run of yours is missing, do say so; a report with the time and place is what makes it findable.",
      "The gear list has grown from 536 front wings to 849, and from 29 brands to 42. Thirteen brands were missing entirely, all of them making a wing they explicitly sell for pumping or dock starts: CORE, GA Foils, RRD, Cloud IX, Horue, Liquid Force, TAAROA, Konrad Boarding, AlpineFoil, MFC, Aeromod, Zeeko and Delta. Several ranges that existed nowhere in our list are in now too — Cabrinha's whole UNION platform, which has replaced the Fusion range at the manufacturer, plus Unifoil's Aggression and Quest, Lift's Vario, Takuma's Kujira Helium, Duotone's Crest, Carve and Blitz, and the complete current Gong line-up. Searching also understands the codes printed on the product rather than only the marketing name, so typing FA2300 or X1240 finds the right wing. If yours is still not there, the “missing from the list?” link under the gear list reaches us in one click — every wing added here started as somebody doing exactly that.",
      "Where a figure is our estimate, it now says so honestly. Hardly any manufacturer publishes the thickness of the wing profile, so for most wings that number is derived and marked as such. We found two brands where our own list claimed otherwise: for 24 F-One wings and 20 AXIS wings the thickness had been calculated by a formula but was not marked, and we only noticed because a formula gives itself away — across four F-One ranges with wildly different shapes the ratio was identical to three decimal places. Those are marked now. Nothing was recalculated and no number changed; the label simply stopped overstating what we know. Gong turned out to be the honourable exception: it publishes a real thickness for every single size, so those 73 wings carry no estimate mark at all.",
      "A handful of wings had the wrong numbers, and manufacturers' own spec sheets settled it. The neatest case: AXIS prints the full specification on the wing itself, in both metric and imperial — and for two sizes the two disagree. The ART V2 819 says “647cm² (104.4in²)”, but 104.4 square inches is 674 cm², so the metric figure is a typo with two digits swapped. That confirmed the value we already had and corrected two others in the same range. Lift's Florence 71 X quotes an area, a wingspan and an aspect ratio that cannot all three be true; the area is confirmed twice over — it is printed on the wing and it is what the model is named after — so the wing could finally be added. Unifoil lists the Vyper 150 with a 140 mm wingspan, which would be a wing wider than it is long; its own area and aspect ratio give 749 mm, and that slots exactly into the rest of the range.",
      "You can now see your heart rate across a whole session at a glance. Under the run table there is a new strip for every run: time runs left to right from the start of the run, and the colour follows your pulse. All runs share one axis, so the lengths are directly comparable — and you can read where in a run your heart rate climbed. Move the pointer across it and a column on the right shows, for every run at once, the pulse and the distance at exactly that moment. Runs that had already finished stay blank rather than claiming a zero, which incidentally tells you who was still out there. The same section appears on the comparison page, where the runs of everyone you compare are stacked together. A rider asked for a way to see how the pulse rises while pumping — this is our answer to it, and his description of what he wanted was precise enough to build from.",
      "While playing back a session, the current heart rate now shows alongside speed and distance. It only appears if the recording has a pulse, so it never sits there as an empty dash.",
      "Heart rate colours were wrong on some maps, and are now consistent everywhere. When a chest strap or wrist sensor drops out, it reports a zero — and a zero is not a heartbeat, it means no reading. We were treating it as a value, so the colour scale started at 0 instead of at your actual lowest pulse, squeezing every real value into the top half of the range. Fifty sessions were affected; in one of them five stray points out of 768 were enough to distort the whole map. The scale now runs from your lowest to your highest real pulse — per session, and across all sessions when you compare — and the map, the comparison map and the new strips all use exactly the same one, so the same pulse is always the same colour.",
      "Fixed in the screen editor: “Last run: max heart rate” would not stay. Every time you saved, it silently turned into “Runs (count)”. The server capped field numbers at 20 and the new heart rate field is 21, so it was quietly replaced — with no error to explain it. Nobody in the whole database had ever managed to save this field. If you had set it and found something else there afterwards, set it once more; it stays now. Thanks to the rider who noticed and described it exactly.",
      "The iPhone and Apple Watch update is out — version 1.1.24, available now. The run table in a session finally shows everything: it scrolls sideways and lists all thirteen columns instead of six. Start time, slowest speed in your chosen window, power, metres per pump, average and peak cadence and longest glide had simply been missing on the phone. You can now compare single runs rather than whole sessions: tap the compare icon on any row of that table, mix runs from different days or riders, and each entry is described by fifteen figures instead of six, with the best value in each highlighted. The map in a session opens full screen — the button sits in its corner — and stays fully usable there: picking a run works, and your colour mode and smoothing still apply. And notifications for new chat messages can be switched on and off in the app. That switch had existed on the website only, and worse: saving your settings in the app used to quietly erase whichever choice you had made there.",
    ],
  },
  {
    date: "August 18, 2026",
    items: [
      "The spots map stays where you left it. Open a spot, look at it, go back — and the map had jumped all the way out to the whole world again, so you had to find your way back every single time. It now remembers your view and zoom for as long as you keep the site open. A rider asked for exactly this.",
      "The community records page opens about six times faster. It was doing something silly: for the two time-of-day records — earliest start and latest finish — it read the run data of every session in the community, and it did that ten times over, once for each combination of record and time range. The numbers do not change with the time range, only which session wins does, so it now reads once and picks. The rest of the wait was the maximum heart rate record, the only one not stored as a plain number, which meant digging through every session to sort them; that now has an index. Same records, same numbers — we compared all 240 of them before and after — just without the wait.",
      "The new “max heart rate of your last run” field has a name now. In the screen editor it was listed as Field.21, which tells you nothing, and it was missing from the list of fields you can pick. Both fixed, in all 16 languages.",
      "Your watch no longer tells you about updates that are not for it. Until now a new Garmin version could make an Apple Watch or an Amazfit announce an update as well — and on Amazfit any difference at all counted as newer, so a test version ahead of the store would cheerfully suggest going back to the older one. Each platform now only reports its own releases, and only when the store version really is newer.",
      "The training curve on the history page names the 30-second mark, so you can see at a glance which points are being compared. The sentence interpreting the result for you is gone — that part you can read yourself.",
      "Four app updates are with the stores for review and will arrive on their own once approved. What is in them: the run table in a session now scrolls sideways and shows all thirteen columns instead of six — start time, slowest windowed speed, power, metres per pump, average and peak cadence and longest glide were simply missing. Comparing works on single runs, not just whole sessions: tap the compare icon on any row, mix runs from different days or riders, and the comparison shows fifteen figures per entry instead of six, with the best value in each one highlighted. The map in a session opens full screen and stays fully usable there. And notifications for new chat messages can be switched on and off in the apps — the switch existed on the website only, and worse, saving your settings in an app used to quietly erase your choice.",
      "About Amazfit: version 1.0.5, announced here yesterday, was turned down by the Zepp store — not for anything in the app, but for two things around the listing: our developer name there was “zepp”, which is their trademark, and our preview images for square watches did not meet their spec. Both are sorted. While we were at it, the square watches turned out to be genuinely broken: the system draws a bar across the top of those screens, and our title sat underneath it, invisible, with the version line cut in half. That bar is off now, the title is back in place and in our own colour, and the page indicator on round watches no longer runs off the edge of the circle. The touchscreen lock that arrived with 1.0.5 became a setting, because a watch is not wet for a whole session and the other platforms let you swipe. Version 1.0.6 is with the store now.",
    ],
  },
  {
    date: "August 17, 2026",
    items: [
      "Your own records are now split by sport. If you have recorded anything that is not pumpfoiling — a wing session, a tow, a test ride on land — it no longer counts towards your foiling totals. The page opens on whichever sport you have recorded most, and a selector above your records switches between them, exactly like the one in the community records. Nothing is hidden and nothing needs deleting: the other sessions are still there, just counted where they belong. A rider spotted this: he had marked a skate ride as another sport, saw it disappear from the community as intended, and then found it still inflating his personal run count. He was right — the session list had always filtered by sport, only the statistics did not.",
      "Typing works again after you have looked at the map. On the spots map, clicking a spot left the map listening for its zoom keys across the whole page, even after you had moved on. In the chat you then could not type -, _, +, *, 6 or & and the arrow keys did nothing, while pasting still worked — and the number 6 stopped selecting runs in a session. That is because those are the keys a map uses to zoom and pan. The maps now hand the keyboard back when you leave them, and they stay quiet whenever you are typing in a text field. Thanks to the rider who wrote down exactly which characters failed; that list was what identified it.",
      "New in the community records: most carves over 180°. Unlike the other records this one belongs to a person rather than a single session — it adds up every carve you turned in the selected period. It follows the same time range and sport as the rest of the board.",
      "Amazfit watches are getting acceleration — our first contribution from outside. @elmanu13 on GitHub owns a T-Rex 3, offered to help, and sent a substantial pull request: the watch now records raw movement alongside GPS, which is what makes pump count, cadence and glide phases possible in the first place. Amazfit sessions have been GPS-only until now. He also fixed the app closing itself mid-session, made the start button wait for a GPS fix, locked the touchscreen while you ride so waves cannot press buttons, and put stop and page-turning on the physical keys. Version 1.0.5 is with the Zepp store for review. Thank you — that is a lot of careful work, and it arrived tested.",
      "Garmin 1.0.77 is live. Two things in it. First: you can now choose how many satellite systems the watch uses, separately for each watch, under Account, Watches. All of them find your position fastest and most reliably, which is what the app has been asking for since the last update — but it costs battery, and on a watch with a long battery life you may prefer the smaller setting. And second, one you will hopefully never notice: when the app crashes on a watch it now says so quietly the next time you open it, including what it was doing at the time. Until now we were blind to that. The choice of satellite systems takes effect immediately, no update needed on the watch side beyond version 1.0.77, which is in the Connect IQ store and in the website download.",
      "You now pick your own watch screens by looking at them. Adding one of your custom screens to the watch used to mean choosing it from a list of names, which works only if you remember what you called it — and after copying a screen from the community you usually don't, because the copy keeps the original's name. So several of them can read the same. The button now opens a row of previews instead, the same picture you see in your screen list and in the editor, and you tap the one you want.",
      "If the app is draining your Garmin battery, two settings fix most of it, and both are already there — under Account, next to your watches. The bigger one is “Satellite systems”. Since the update before last the app asks your watch for the best reception it can manage: every satellite system at once, across two frequency bands. That finds your position fastest and holds onto it best, which is why it is the default, but it is genuinely expensive. Setting it to “Without second frequency band” keeps every satellite system and drops only the costly extra band — the most saved for the least lost. The second setting is “Recording mode”, where “Lite · 10 Hz” records your movement 10 times a second instead of 25. We measured what that costs the analysis before recommending it, running both rates over the same sessions: your pump count lands within half a percent, and which parts of a session count as foiling is 99.9% identical. So it is nearly free. What we would not recommend is “GPS only”. It saves the most, but it throws away pump count, cadence and glide phases altogether — the numbers this whole app is built around. Both settings are per watch and take effect the next time you open the app on it; there is nothing to install. A rider raised the battery question in a store review, and he was right that it deserved an answer.",
      "Garmin 1.0.78: some watches had quietly stopped recording altogether, and now they work again. If you ride a fēnix 5, 5S, 6, 6S or Chronos, a Forerunner 55, 245, 645 or 935, a Venu Sq, a vívoactive 3, an Enduro, an Instinct 3 Solar or an Instinct E, this is the important one for you. These watches have the least memory of any we support, and the app has grown a lot over the summer — on a Forerunner 55 the free memory had shrunk to a fifth of what it was in July. Past a certain point the app simply dies moments after you press start: the session appears, then nothing follows it, and you get a short recording or none at all with no error to explain why. One rider's watch made it plain — the same watch, same week, recorded fine on an older version and then failed six times in a row on the current one. Looking at every watch of this class, four of the seven had never produced a single session in their whole life. Those watches now get a slimmer version of the app with roughly three times the free memory. The menus and everything you do while riding are unchanged; what goes is the custom layouts feature, which was barely usable on those screens anyway, and the app's own texts are in English there rather than your language. That is a deliberate trade: reliable recording matters more than a translated menu. If you have one of these watches and had given up on it, please try again. Version 1.0.78 is in the Connect IQ store and in the website download.",
    ],
  },
  {
    date: "August 14, 2026",
    items: [
      "Your watch no longer loses data in silence. A rider reported a 54-minute session where only one run showed up — and he was right twice over: the watch had uploaded everything it still had, but almost all of it was already gone before the upload started. His previous session was still sitting on the watch, unsent, and once the watch's own storage is full our app throws the new data away rather than crash. It did that without a word, so the session simply looked short. An Instinct 2 fills up at around one longer recording. Now the watch says “upload first” before you start when something is still waiting, and if data is being dropped during a recording you see it in red while it happens — early enough to do something about it. A second rider hit the same thing the same day.",
      "And pausing now uploads. While a recording is paused the watch sends the sessions that are waiting, which frees space for the one you are recording. That is aimed at the days when you spend more time on the dock than on the water — helping friends get started, waiting for wind — which is exactly when the storage used to fill up. The recording you are in is never touched, only the ones already finished. Garmin 1.0.76 is in the Connect IQ store and in the website download.",
      "One piece of bad advice is gone, too: when the storage was full the watch used to suggest reinstalling the app. That would have deleted precisely the recordings that were still waiting to be sent. It now says to upload first.",
    ],
  },
  {
    date: "August 13, 2026",
    items: [
      "Two riders said runs were missing from their sessions, and both were right — but not for the reason we expected. It is not the detection being too strict: it finds every run the track shows. The runs are missing because there was no position at all for part of the session. In one one-hour recording on a Garmin watch, 16 minutes had no position, in 17 dropouts between 12 seconds and three and a half minutes, while the movement sensor kept recording without a single gap. A run needs the track to exist — distance, speed and duration all come from it — so whatever happened in those minutes cannot be counted. Across all sessions ever recorded here, a quarter of the time has no position. That is the real problem, and it was invisible until now.",
      "So Garmin watches now use every satellite system they can, instead of GPS alone. Watches offer GPS, GLONASS, Galileo and BeiDou, and newer ones can receive two frequency bands — but an app has to ask for that explicitly, and ours had been asking for plain GPS without knowing it. Each watch is now asked for the best it supports, falling back step by step on older models. This costs battery, deliberately: a missing run is worse than a shorter runtime. It is version 1.0.75, in the Connect IQ store and in the website download.",
      "Apple Watch and iPhone move to the highest accuracy setting iOS offers, for the same reason. It is version 1.1.22, in the App Store today. Apple Watch already had the best coverage of all our watches, so the gain will be smaller there.",
      "The “Lite · 10 Hz” recording mode no longer costs you your pump statistics. A rider switched to it to save space on his watch — his watch fills up when he spends a long session on the dock helping friends rather than foiling — and found the pump count, cadence and glide phases were gone. That was our threshold, not his watch: our analysis ignored movement data recorded slower than 15 times per second, a limit set because of one watch model that reports 25 and actually delivers 2.5. We measured whether the limit is needed at 10: on twenty sessions recalculated at the lower rate the pump count came out 0.4 % different, and the recognition of when you are up on the foil was 99.9 % identical. At 2.5 it does break — a pump cycle can no longer be seen there at all. The limit is now 8 instead of 15, so Lite mode keeps everything, and the watch that really delivers 2.5 stays excluded. Affected sessions have been recalculated, and they now count towards records and leaderboards as well.",
      "“GPS only” mode now says what it costs, right where you choose it: no pump count, no cadence, no glide phases, because all three come from the movement sensor.",
      "Joining two recordings into one no longer creates duplicates. Joining takes as long as the analysis — around a minute and a half for a three-hour session — and if the request was sent again in that time, by reloading or out of impatience, the whole thing was calculated a second time. One rider ended up with the same three-hour session three times in his list, counting three times towards his statistics and records. Repeated requests now wait for the first one and get its result.",
    ],
  },
  {
    date: "August 10, 2026",
    items: [
      "Pump counts were too low in some sessions, and a few runs claimed a glide of 30 or 45 seconds — which is simply not possible on a pumpfoil. A rider said exactly that: either the number is wrong, or something else was pushing him along. He was right, and the cause was on our side. Watches report how often they record wrist movement, but some deliver a different rate than they report — fifty measurements per second where twenty-five were asked for. Our analysis believed the reported rate, so the longer a session ran, the further the wrist data drifted away from the part of the track it belonged to: in the middle of a two-and-a-half-hour recording it was about two minutes off. It was reading a moment when the rider stood still between two runs, found no pumping there, and turned that into a long “glide”. The recording rate is now taken from the data itself, and the timing is anchored to the moment each piece of data was actually recorded. In the reported run the 45-second glide became 1.6 seconds, the pump count went from 42 to 120, and the cadence from 0.5 to 1.6 pumps per second — a realistic value.",
      "All existing sessions have been recalculated. Where this applied, pump counts went up and long glides got shorter; your distances, speeds, tracks and the map were never affected by it. If you have wondered before why a session showed fewer pumps than it felt like, this may be why.",
      "Joining two recordings into one session had the same problem twice over, and it cost data. When we stitched the parts together we placed them using the rate the watch reported rather than the one it delivered — so on those watches the second part landed halfway into the first and overwrote it. In one session only about 200,000 of 584,000 wrist measurements survived. Joined sessions also lost the timing marks that let us place the data exactly, so they could never be repaired later. Both are fixed, and the affected sessions have been rebuilt from their original parts, which were still stored: 30 of 33 could be restored in full. The rider who reported the 45-second glide had reported a 14-second one five days earlier on a joined session — that run is now at 1.9 seconds, with 1257 pumps instead of 1019.",
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
