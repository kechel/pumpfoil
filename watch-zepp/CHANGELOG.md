# Zepp OS changelog

This changelog covers the Zepp OS watch app only.

> **1.0.6 to 1.0.8 were reconstructed from git on 2026-09-07** — this file had been left at 1.0.5
> while three releases went out, and the release notes in `server/app/api/appmeta.py` had drifted
> into a mix of two versions because of it. The cuts are the version bumps in `app.json`: 1.0.6 in
> `3ff50081` (18 Aug), 1.0.7 in `bedb67dc` (26 Aug, 20:15), 1.0.8 in `08b69443` (31 Aug). One
> commit sits on the fence: `b07ae4e1` (distance unit, 26 Aug 22:41) landed after the 1.0.7 bump
> and possibly after the upload — it is listed under 1.0.7. **Keep this file current with every
> bump**, then nobody has to dig through commits again.

## 1.0.8 — 2026-08-31

Built and version-bumped; goes to the store right after 1.0.7 clears review.

### Colours and zones

- Take speed zones from the profile, the same way heart-rate zones already work. There used to be
  three different scales for the same thing: the number on the watch had hard-wired steps
  (12/16/20 km/h) with no derivation, while the value graphic already used the profile.

### Controls

- Honour the profile setting for stopping a recording, so a single press works instead of a long
  press. Prompted by a rider whose watch has "man overboard" on the long press, which made our menu
  unreachable. Default stays "hold".

### Run detection

- Match the server's run detection: the 25-second re-arm cooldown no longer blocks blindly after a
  short drop in speed. Verified against a rider's photo series — a simulation of the watch logic on
  her real GPS data lands within one to two metres of the photos.
- Merge two runs only when the resulting distance is plausible. A session with sentinel speeds
  (three points at 20,037,500 m/s) had produced "last run 14,709.6 m in 0:42".

### Languages

- Dutch, Finnish and Czech. They existed as columns before but were left empty in 37 cells.
- Polish, as an overlay rather than a 17th column.

## 1.0.7 — 2026-08-26

Submitted 26 August, rejected 1 September **for the store preview images only** (nothing about the
app), images replaced and resubmitted the same day. Everything below therefore reaches users with
this round, not the previous one.

### Value graphics on the watch

- Draw the two new layout elements: edge graphic and bar, filled on the field's own scale, colour
  optionally by zone. A ring segment on round watches, a frame segment on square ones — decided
  from the device's real display shape, not from the layout.
- Draw them on Canvas instead of the previous approach, after the round/square shapes turned out
  to be unreliable otherwise.
- Pass heart-rate zones and the speed scale through the phone side at all: both were missing from
  its whitelist, so the watch never received them. That is why the on-foil layout (the one with the
  graphics) stayed blank on a Balance 2 while the off-foil layout drew fine.
- Say in the log why the self-healing step kicked in, instead of just doing it.

### Controls

- Let a finger reopen the touch lock. It used to hand control back only through the hardware
  buttons — in the simulator there are none, and with thick gloves on real hardware it is the same
  trap.

### Numbers that users compare with the website

- Clean up the top speed. Measured against the server on 119 real sessions, the watch maximum was
  on average 9.4 km/h too high and in the worst case 164 km/h (one session showed 103 km/h where
  15.0 was analysed).
- Merge runs that never really stopped, instead of counting them twice.
- Put the distance unit in the label instead of into the value, like Garmin, Wear OS and iOS
  already do — "90 m" above its own label read as a contradiction.

## 1.0.6 — 2026-08-18

Approved 24 August, live in the Zepp App Store.

### Square watches

- Lay out around the system bar that Zepp OS draws on square devices, and switch it off where the
  API allows it (`setStatusBarVisible(false)`, square only — on round watches the call throws).
  That bar is 64 px tall, opaque, and filled with `appName` from `app.json`: it hid our own title,
  clipped the version line and cost a seventh of the screen.
- Title in brand cyan, test text and emoji removed.

### Round watches

- Fix the page indicator: "1/4" sat outside the visible circle and was cut diagonally, showing as
  "1/". Measured in the raw image (light pixels to device x 407, circle ends at 391) and the indent
  recomputed for three text heights.

### Update hint

- Compare store versions digit by digit instead of with `!==`. Any difference used to trigger the
  hint, including an older store version — a development build ahead of the store recommended a
  downgrade. Garmin, Wear OS and Apple Watch had compared numerically all along; only Zepp did not.

### Settings and data

- Make the touch lock configurable.
- Data field 21: maximum heart rate of the last run. The session maximum existed already; per run
  is new.
- Rename the app from "zepp" to "pumpfoil".

## 1.0.5 — 2026-08-16

### Recording reliability

- Keep the app awake for up to five minutes while idle, pairing, or browsing screens.
- Keep the app awake for the full duration of an active recording and restore the normal timeout afterward.
- Preserve and recover an interrupted active recording through Zepp OS wake-up relaunch support.
- Block session start until a valid GPS fix is available.
- Show a dimmed start button while waiting for GPS and turn it green when GPS is ready.
- Signal GPS readiness with vibration and, when enabled by the watch settings, a short buzzer sound.

### Physical controls and water protection

- Use UP and DOWN to navigate backward and forward through screens.
- Use SELECT to start a recording from the main screen.
- Lock the touchscreen automatically during recording to prevent water-triggered actions.
- Show a lock indicator when a blocked touch or short button press is detected.
- Temporarily unlock touch for ten seconds with a long press on UP or DOWN.
- Stop and save with a long press on SELECT.
- Consume BACK while recording so an accidental press cannot exit the app and lose the session.

### Sensor and session data

- Request the correct Zepp OS heart-rate permission.
- Read continuous heart-rate values through the supported sensor callback and include them in session statistics and GPS samples.
- Record raw three-axis acceleration through the official Zepp OS accelerometer API while a session is active.
- Convert Zepp's cm/s² values to the shared signed int16 format with 2048 units per g.
- Measure and report the effective accelerometer callback rate for each session instead of assuming a fixed frequency.
- Derive speed from consecutive GPS coordinates because Zepp OS Geolocation does not expose the previously assumed speed method.
- Reject implausible derived speeds (position jumps) so a single bad fix can no longer inflate the
  live speed, the session maximum, the distance, the alarm or run detection. Uploaded samples are
  unchanged — the gate only affects what the watch shows and decides.
- Restore run detection and the last-run time and distance values using the computed speed.
- Add diagnostic logs for heart-rate activation and detected run starts and ends.
- Report the watch model (`getDeviceInfo`) when pairing and on every config call, so support
  requests can be tied to an actual device instead of a generic "Amazfit".

### Upload stability

- Persist acceleration progressively to a binary file instead of retaining a full session in JavaScript memory or LocalStorage.
- Upload 128-sample acceleration blocks sequentially as `int16-b64` with per-block timestamps.
- Retain the binary file across interrupted uploads or app restarts and delete it only after confirmed completion.
- Ensure only one pending-session upload worker can run at a time.
- Upload sessions and GPS chunks sequentially to prevent duplicate concurrent transfers and erratic progress values.
- Create GPS chunks on demand instead of retaining every chunk in memory.
- Keep the app awake for the entire upload and resume the normal idle timeout afterward.
- Pause background configuration requests while an upload owns the BLE request queue.
- Add upload lifecycle diagnostics.

### Interface and localization

- Increase font sizes throughout the watch app and settings page.
- Reposition fields, labels, status text, page numbers, buttons, and settings controls for round and square displays.
- Improve the T-Rex 3 round-screen layout so enlarged text remains inside the safe display area.
- Normalize stored and server-provided language codes, including BCP-47 variants, Norwegian variants, and Swiss/Austrian German variants.
- Preserve the selected profile language across launches so the watch UI also uses it offline.

### Platform metadata

- Update the Zepp app version from 1.0.4 to 1.0.5 (build code 8).
- Target Zepp OS API 4.0 while retaining compatibility with API 3.0.
