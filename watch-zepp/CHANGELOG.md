# Zepp OS changelog

This changelog covers the Zepp OS watch app only.

## 1.0.10 — 2026-08-16

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
- Derive speed from consecutive GPS coordinates because Zepp OS Geolocation does not expose the previously assumed speed method.
- Restore run detection and the last-run time and distance values using the computed speed.
- Add diagnostic logs for heart-rate activation and detected run starts and ends.

### Upload stability

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

- Update the Zepp app version from 1.0.4 to 1.0.10 (build code 13).
- Target Zepp OS API 4.0 while retaining compatibility with API 3.0.
