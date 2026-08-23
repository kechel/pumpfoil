# Zepp OS reliability, upload and T-Rex 3 interface update

## Summary

This pull request turns the Zepp OS recorder from an early draft into a field-tested beta for the
Amazfit T-Rex 3. It focuses on recording safety, complete sensor data, recoverable uploads,
hardware-button operation and a readable default interface designed for a round 480 px display.

The changes are limited to `watch-zepp`; Garmin, Wear OS, Apple Watch and the web application are
not modified.

## Main changes

- Target Zepp OS API 4.2 while retaining API 3.0 compatibility, and use the Workout permission to
  read the user's configured five-zone heart-rate ranges.
- Record GPS, continuous heart rate and raw high-frequency acceleration in the shared Pumpfoil
  ingest format.
- Persist acceleration incrementally to the filesystem and resume interrupted session uploads.
- Keep watch-to-phone BLE requests serialized for stability, but decouple them from the phone's
  network work: the Side Service uploads four bounded chunks concurrently and confirms completion
  only after every server request succeeds.
- Prevent speed-based automatic session starts; starting now requires PUMP or SELECT and a valid
  GPS fix. Heart rate is optional.
- Keep the app awake during recording and refresh the bright-screen window while a run is detected.
- Lock touch during recording on watches with sufficient hardware buttons; use UP/DOWN to navigate,
  long SELECT to stop and long UP/DOWN to unlock touch temporarily. BACK is consumed while recording.
- Reject stationary GPS wander from live distance and on-watch run detection while preserving raw
  uploaded coordinates for server-side analysis.
- Provide three curated default recording pages: session/stop, last run and active run.
- Redesign the idle, pairing, pending-upload, settings, summary and recording interfaces for the
  round T-Rex 3 display, including localized text and larger typography.
- Add a five-color active-run heart-rate ring drawn as straight-edged annular canvas sectors. The
  active zone expands inward and displays the current BPM along the sector.
- Update launcher assets to the current 248 px Zepp requirement.

## Verification completed

- App builds successfully with Zeus CLI without warnings.
- Pairing and reconnection work on a physical T-Rex 3.
- French localization is displayed on the physical watch.
- GPS readiness blocks start correctly; heart rate no longer blocks start.
- Physical-watch sessions contain GPS, heart-rate and acceleration data accepted by pumpfoil.org.
- Stationary GPS drift no longer increases the displayed distance.
- Interrupted/pending sessions can be recovered and uploaded after restarting Zepp/the watch app.
- All H and R screens have been visually approved on both the simulator and the physical T-Rex 3.
- All three Zepp heart-rate-zone modes return ranges matching the Zepp app: reserve (`type=0`),
  maximum (`type=1`) and lactate threshold (`type=2`).
- Synthetic-GPS simulator mode is disabled in the proposed watch build.

## Regression fixes awaiting T-Rex 3 retest

- The factory off-foil page can arrive as either the historical `[12,17,16]` tuple or the current
  `[17,16,0]` tuple. Treat both as the same curated R2, normalize legacy marker `12` and deduplicate
  ring entries. This corrects the observed R1–R2–R2–R3 navigation.
- Remove Zepp's extra 2 m/s net-motion condition from the Garmin/Wear run-state machine. It could
  let the displayed session distance increase while preventing the run state from starting.
- Do not add repeated identical coordinates as zero-speed samples to the three-second median;
  derive speed over the actual interval between distinct Zepp GPS updates.

## Final T-Rex 3 field validation

- [x] Record a real multi-run pumping session.
- [ ] Confirm the recording ring contains exactly R1, R2 and R3.
- [ ] Confirm R3 opens automatically when a run is detected.
- [ ] Confirm R3 remains lit during strong pumping wrist motion.
- [ ] Confirm R3 returns to zero time/distance between runs while R2 retains the completed run.
- [x] Confirm touch lock, UP/DOWN navigation and long-SELECT stop throughout a wet session.
- [ ] Confirm the full corrected session uploads and pumpfoil.org detects runs, GPS, BPM and acceleration.

Keep this pull request as a draft until the corrected run-state path passes the physical-watch test.

## Known limitation / follow-up

R3 reads the six configured BPM bounds through Zepp OS 4.2
`Workout.getUserHrZoneSettings()` and uses them for its five sectors. The returned type, resting
heart rate and range are logged for real-device validation. T-Rex 3 tests confirmed `type=0` for
heart-rate reserve, `type=1` for maximum heart rate and the publicly undocumented `type=2` for
lactate threshold; all three returned ranges matched the Zepp app. Any well-formed six-value range
is accepted regardless of type and invalid/unavailable data falls back to the former fixed
thresholds.

## Screenshots

All captures are approved 360×360 assets committed under `watch-zepp/screenshots/`.

| H1 — GPS acquisition | H1 — ready | H2 — pairing |
|---|---|---|
| ![H1 GPS acquisition](https://raw.githubusercontent.com/elmanu13/pumpfoil/codex/zepp-start-screen/watch-zepp/screenshots/H1_1-WAIT.png) | ![H1 ready](https://raw.githubusercontent.com/elmanu13/pumpfoil/codex/zepp-start-screen/watch-zepp/screenshots/H1_2-READY.png) | ![H2 pairing](https://raw.githubusercontent.com/elmanu13/pumpfoil/codex/zepp-start-screen/watch-zepp/screenshots/H2_1-CONNECT.png) |

| H2 — connected | H3 — pending upload | H4 — settings |
|---|---|---|
| ![H2 connected](https://raw.githubusercontent.com/elmanu13/pumpfoil/codex/zepp-start-screen/watch-zepp/screenshots/H2_2-CONNECTED.png) | ![H3 pending upload](https://raw.githubusercontent.com/elmanu13/pumpfoil/codex/zepp-start-screen/watch-zepp/screenshots/H3.png) | ![H4 settings](https://raw.githubusercontent.com/elmanu13/pumpfoil/codex/zepp-start-screen/watch-zepp/screenshots/H4.png) |

| R1 — session totals | R2 — last run | R3 — active run |
|---|---|---|
| ![R1 session totals](https://raw.githubusercontent.com/elmanu13/pumpfoil/codex/zepp-start-screen/watch-zepp/screenshots/R1.png) | ![R2 last run](https://raw.githubusercontent.com/elmanu13/pumpfoil/codex/zepp-start-screen/watch-zepp/screenshots/R2.png) | ![R3 active run](https://raw.githubusercontent.com/elmanu13/pumpfoil/codex/zepp-start-screen/watch-zepp/screenshots/R3.png) |

## Follow-up

- Port the curated T-Rex H/R screens to dedicated rectangular-watch layouts. The current square
  renderer deliberately keeps the conservative original interface so the round screens are not
  stretched onto incompatible display geometry.
