# Zepp OS changelog

This changelog covers the Zepp OS watch app only.

## 1.0.6 — 2026-08-22

This version is the Zepp OS multi-user field-test candidate. Its T-Rex 3 interface, sensor capture,
recovery and upload path have been exercised on a physical watch. The approved 360×360
store/repository screenshots are included under `screenshots/`; the final recording-state
regression fixes below still require one physical-watch retest before wider distribution.

### Zepp OS platform

- Target Zepp OS API 4.2 and read the user's five configured heart-rate zones through
  `Workout.getUserHrZoneSettings()`. Log the returned type, resting heart rate and six BPM bounds
  so maximum-HR, reserve-HR and lactate modes can be verified on a real T-Rex 3. Real-device tests
  confirmed `type=0` for heart-rate reserve, `type=1` for maximum heart rate and the previously
  undocumented `type=2` for lactate threshold. Invalid or unavailable device data safely falls
  back to the former fixed thresholds.
- Replace the undersized 124 px Zepp launcher assets with 248 px sources, satisfying the current
  Zepp OS icon requirement and removing the build warning without changing the icon artwork.
- Delete H1's dynamically recreated battery-fill widget when leaving the start screen, preventing
  its light-grey rectangle from remaining visible over R1, R2 and R3.
- Redesign H4 as three compact text-and-switch rows for alarm, automatic thresholds and layouts,
  plus a separate thin foil-name selector, replacing the four oversized blue buttons.

### Recording safety

- Recognize both historical and current factory last-run page tuples, normalize the legacy R2
  marker and deduplicate identical ring entries. This fixes the real-device R1–R2–R2–R3 sequence
  and restores the intended R1–R2–R3 navigation.
- Restore the proven Garmin/Wear run-state thresholds without Zepp's additional 2 m/s net-motion
  gate, which could allow session distance to grow while permanently blocking run detection.
- Ignore repeated identical Zepp coordinates when building the three-second speed median and keep
  the timestamp of the last distinct GPS update, preventing artificial zero-speed samples from
  suppressing a real run.
- Keep the screen continuously lit during a detected run by applying a 60-second lighting window
  immediately on entry to R3 and refreshing it every ten seconds until the run ends.
- Allow recording to start as soon as GPS is ready even when heart rate is unavailable; heart-rate
  samples remain optional and are recorded whenever the sensor begins providing them.
- Require an explicit tap on PUMP or press on SELECT to start a session; ignore the legacy
  speed-based auto-start setting on Zepp so travelling cannot create an unintended recording.

### Upload performance

- Decouple the BLE transfer from the phone's HTTP upload. The watch now feeds a bounded Side
  Service queue while the Zepp phone process uploads four chunks concurrently, instead of waiting
  for one complete BLE + HTTP round trip before sending the next chunk. `COMPLETE` remains a
  durable barrier and local watch data is deleted only after every server request succeeds.
- Apply back-pressure at 16 outstanding chunks to bound phone memory, report `expected_chunks` to
  the server, remove full base64 payloads from logs and emit compact pipeline timing statistics.
- Double GPS upload chunks from 10 to 20 points and acceleration upload chunks from 128 to 256
  samples, reducing the sequential BLE/HTTP request count by roughly half.
- Keep acceleration recording and timestamp blocks at 128 samples so memory use stays bounded and
  pending sessions created by earlier builds remain compatible.

### Pre-session screens

- Turn H1's battery icon into a live gauge with a medium-grey body, proportional white fill and
  optically bold black numeric text without the percent symbol. Recreate its dynamic layers when
  the value changes because T-Rex 3 did not render in-place rectangle resizing reliably.
- Replace H3's thin upload line and detached percentage with the same large button-area progress
  capsule used by the post-session summary.
- Split the start-screen synchronization label and percentage across two lines.
- Enlarge the pairing code, pairing instructions and code-generation control.
- Redesign the pending-session screen with a larger queue count, prominent upload percentage and
  a progress bar; show the manual upload action only when an automatic upload is not already active.
- Increase settings-button typography and use dark text on the cyan background for better contrast.

### Recording screens and live GPS

- Make R3 strictly represent the active run: show zero time and distance between runs, begin both
  counters on run detection, and leave completed-run values frozen exclusively on R2.
- Redesign R3 around the active run: large 108 px timer and distance, five bezel-following
  blue/green/yellow/orange/red heart-rate sectors, and no redundant standalone BPM or Z1-Z5 labels.
- Draw the zones as canvas-filled annular sectors with straight boundaries rather than rounded ARC
  strokes. The final round layout uses center 240/240, 480 px outer diameter, 460 px inactive inner
  diameter and 360 px active inner diameter.
- Render the active BPM in optically bold white curved text on a 476 px positioning diameter,
  aligned upright with its sector, and keep inactive zones thin while the active zone grows inward.
- Add the detected run number to R2 as a stacked R/U/N/number column, separated vertically from
  the unchanged large last-distance and last-time typography.
- Reduce the default Amazfit recording ring to R1 (stop/session), R2 (last run) and R3 (primary
  run), removing the redundant R4 in both detected-run states. Custom/community rings are unchanged.
- Deduplicate server-provided classic last-run pages from the internal curated last-run page after
  browseAll merges both state rings, so the default navigation contains exactly three screens.
- Restore the shared field geometry before rendering the post-session summary, preventing the R1
  positions from carrying over and superimposing duration, average-speed and upload-status text.
- Explicitly hide shared branding on recording pages to work around Zepp retaining glyphs after an
  empty-text update, and remove the redundant top-edge upload bar from the round summary screen.
- Replace the summary's top-edge upload indicator and premature Done button with a large progress
  capsule in the button area; show Done only after the upload has completed successfully.
- Move unused shared title/version widgets off-screen on classic recording pages, preventing the
  T-Rex 3 text cache from retaining a blue Pumpfoil title on R2 before the first detected run.
- Prevent R2's enlarged last-run layout from spreading TITLE's default `Pumpfoil` text back into
  the already-cleared title widget.
- Standardize the REC marker on every recording screen using the approved primary-run position.
- Redesign the stop screen with a compact grey clock, separators, larger time and distance values,
  and the SELECT long-press instruction inside the enlarged stop button.
- Enlarge the stop-screen clock, remove the duplicated STOP label from its button and explicitly
  clear residual app branding from classic recording pages.
- Enlarge the last-run distance and time with a separating rule, and use the available space more
  effectively on the detailed run screen.
- Add the current clock time to the session stop screen.
- Remove Pumpfoil/version branding and the persistent GPS/SELECT instruction from recording data
  pages, and show the corresponding run number on the last-run page.
- Reject stationary coordinate wander from live distance and run-state decisions by requiring
  coherent net displacement over a five-second window. Raw uploaded GPS data remains unchanged so
  the server keeps full control of final cleaning and analysis.

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
