# Pumpfoil GT 1.0.7 — notes for the AppGallery reviewer

Thank you for the detailed report on 1.0.6 (2026-11-23). Changes in 1.0.7:

1. Start time: the start screen now appears before the connection to the phone is set up, and texts are loaded only once per app run.
2. Page changes: switching between the start screen and settings no longer turns GPS and the display off and on again, and the connection to the phone only resumes one second after a page is shown.
3. Crown: the crown now reacts to every single step. On the start screen, one step forward opens the settings.
4. Settings: one setting per page. Turn the crown or swipe to move between pages; turning or swiping back past the first setting returns to the start screen. Swiping right also returns. Tap a page to change its value.

How to test:
- Tap START to record, swipe up/down (or turn the crown) to see the data pages. Hold PAUSE or STOP for 1.5 seconds; swiping right during a recording jumps to the STOP page.
- Swiping right on the start screen closes the app.
- Recordings are sent to the phone through Wear Engine and need the Pumpfoil app for Android 1.1.49 or later. Without the phone app the watch keeps every recording and shows "open app on phone"; recording itself works without the phone.
