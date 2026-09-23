import * as hmUI from "@zos/ui";
// Eckige Zepp-OS-Geraete ziehen oben eine 64 px hohe Status-Bar ein und schreiben den `appName`
// aus app.json hinein: grau, linksbuendig, Systemschrift, deckend. Sie hat den eigenen Titel
// verdeckt und die Versionszeile angeschnitten (Jans Screenshots 18.08.) und kostet ein Siebtel
// des Schirms. Abschaltbar ab API_LEVEL 2.0 (wir verlangen 3.0), nur auf eckigen Geraeten —
// docs.zepp.com/docs/reference/device-app-api/newAPI/ui/setStatusBarVisible/
import { setStatusBarVisible } from "@zos/ui";
import { px } from "@zos/utils";
import { LocalStorage } from "@zos/storage";
import { getDeviceInfo } from "@zos/device";
import { onGesture, offGesture, GESTURE_UP, GESTURE_DOWN, GESTURE_LEFT, GESTURE_RIGHT,
         onKey, KEY_BACK, KEY_SELECT, KEY_UP, KEY_DOWN,
         KEY_EVENT_CLICK, KEY_EVENT_LONG_PRESS } from "@zos/interaction";
import { getConnectStatus } from "@zos/ble";
// Els Feldtest (T-Rex 3, 01.08.): "App verlaesst sich waehrend der Aufnahme" — Zepp beendet
// Mini-Apps beim Bildschirm-Aus, und wir haben den Gegen-Mechanismus nie aktiviert.
// setWakeUpRelaunch(true) laesst das System beim Aufwachen UNSERE App wieder oeffnen statt
// des Zifferblatts; recoverActive() nimmt dann die gesicherte Aufnahme wieder auf.
import { setWakeUpRelaunch, setPageBrightTime, resetPageBrightTime } from "@zos/display";
// `getPerformance` gibt es erst ab Zepp OS API_LEVEL 4.0; unsere app.json steht auf minVersion
// 3.0. Deshalb KEIN statischer Import — der waere auf aelteren Uhren ein Ladefehler, und ein
// Ladefehler beim Start ist genau der Absturz, den diese Messung eigentlich aufklaeren soll.
// `zosApp` bleibt null, wo es die API nicht gibt; dann meldet die Uhr eben keinen Speicher.
let zosApp = null;
try { zosApp = require("@zos/app"); } catch (e) { zosApp = null; }
import { BasePage } from "@zeppos/zml/base-page";
import { Geolocation, HeartRate, Accelerometer, Vibrator, Buzzer, FREQ_MODE_HIGH,
         FREQ_MODE_NORMAL, VIBRATOR_SCENE_SHORT_MIDDLE, VIBRATOR_SCENE_DURATION_LONG } from "@zos/sensor";
import { openSync, closeSync, writeSync, readSync, statSync, rmSync,
         O_RDONLY, O_RDWR, O_CREAT, O_TRUNC } from "@zos/fs";
import { TITLE, VER, PAGE, F0V, F0L, F1V, F1L, F2V, F2L, STATUS, BUTTON } from "zosLoader:./index.[pf].layout.js";

// Zepp reports acceleration in cm/s²; the ingest format uses signed little-endian int16 values
// with 2048 units per g, matching Garmin, Wear OS, and Apple Watch recordings.
const GPS_HZ = 1, ACCEL_DEFAULT_HZ = 25, ACCEL_SCALE = 2048, STANDARD_GRAVITY_CM_S2 = 980.665;
// Obergrenzen fuer die aus Positionen abgeleitete Geschwindigkeit (s. sample()). 100 m/s ist die
// reine Unsinns-Schwelle wie in Garmins `_saneSpeed`; 30 m/s = 108 km/h liegt weit ueber allem,
// was auf einem Foil vorkommt (schnellster Lauf im Bestand ~30 km/h) und trennt damit sauber
// zwischen "schnell gefahren" und "der Fix ist gesprungen".
const MAX_SANE_MPS = 100, MAX_PLAUSIBLE_MPS = 30;
// Kleine CHUNKs: 10 Punkte/Nachricht (~500 B) statt 60 (~3,3 KB) -> passt zuverlässig durch BLE
// (weniger Frame-Splitting; Sim-Reassemblierung + echte Hardware robuster).
const GPS_CHUNK = 10;
// Keep both the live buffer and each BLE payload small. At 25 Hz, 128 samples represent about five
// seconds and 768 raw bytes (roughly 1 KB after base64 encoding).
const ACCEL_CHUNK_SAMPLES = 128;
// Navigation, pairing, and upload: keep the screen on for five minutes instead of the ~38 seconds
// observed on the T-Rex 3. Restore the system timeout when the user actually leaves the app.
const IDLE_BRIGHT_MS = 5 * 60 * 1000;
// Zepp destroys a Device App roughly 10 seconds after the screen turns off. An App Service cannot
// use Geolocation, so recording must keep this page active. Use Zepp's documented maximum value
// (~24 days), then explicitly restore the system timeout when the session stops.
const RECORDING_BRIGHT_MS = 2147483000;
const AUTOSTART_SPEED = 7 / 3.6, AUTOSTART_TICKS = 3;
// Wie lange eine ueber `onChange` gemeldete Position als aktuell gilt. Drei Sekunden: lang genug,
// um eine flackernde Statusabfrage zu ueberbruecken, kurz genug, dass eine echte Funkluecke eine
// Luecke bleibt. Bei 1 Hz Abtastung heisst das hoechstens zwei uebersprungene Sekunden.
const GEO_CACHE_MS = 3000;

// --- LAUF-WAECHTER -----------------------------------------------------------------------
// Phasen wie bei Garmin (`SessionRecorder.mc`), damit dieselbe Zahl auf dem Server dasselbe
// bedeutet und `device_tokens.crash_phase` vergleichbar bleibt.
const PHASE_BOOT = 1;     // App-Start: Verbinden, Config, Wiederaufnahme
const PHASE_IDLE = 2;     // Startbildschirm steht, nichts laeuft
const PHASE_RECORD = 3;   // Aufnahme
const PHASE_UPLOAD = 4;   // Upload
//
// WARUM ES DEN WAECHTER GIBT (22.09.2026): César (Amazfit Active 2) meldete per Mail, seine Uhr
// habe sich waehrend eines Uploads DREIMAL neu gestartet. In unseren Daten stand
// `crash_count = 0` — nicht, weil der Merker verlorenging, sondern weil die Zepp-App ueberhaupt
// keinen hatte. Garmin meldet Abstuerze seit Wochen, Amazfit nie. Wir waren also genau bei dem
// Fehlerbild blind, das auf dieser Plattform am haeufigsten auftritt, und haben es nur durch
// eine Mail erfahren. Ohne Messung laesst sich weder sagen, wie viele Nutzer es trifft, noch ob
// eine Aenderung etwas gebracht hat.
//
// Die Marke liegt vom App-Start bis zum sauberen Ende. Kommt die App durch `onDestroy`, wird sie
// geloescht; stirbt sie vorher — Absturz ODER Neustart der Uhr —, liegt sie beim naechsten Start
// noch da und geht mit dem naechsten CONFIG-Abruf raus. Geschrieben wird nur beim PHASENWECHSEL,
// also viermal je Lauf und nicht einmal je Sekunde.
//
// BEWUSST NUR DIAGNOSE: der Waechter schaltet nichts ab. Eine Uhr, die `onDestroy` nicht
// zuverlaessig ruft, wuerde sich sonst selbst Funktionen abklemmen.
function canaryWrite(phase) {
  try {
    store.setItem("run_canary", String(phase));
    // Speicherstand MIT festhalten. Stirbt die App, liegt beim naechsten Start beides da: in
    // welcher Phase es passierte und wie nah sie am Limit stand. Getrennt gespeichert, damit
    // ein alter Waechter-Eintrag ohne Speicherwert weiterhin lesbar bleibt.
    const m = memRead();
    if (m) store.setItem("run_mem", m.peak + ":" + m.total);
  } catch (e) {}
}
// Marke des LAUFENDEN Laufs loeschen. Ruehrt `run_crash` NICHT an: ein Absturz, der noch nicht
// gemeldet werden konnte, ueberlebt auch ein sauberes Beenden.
function canaryClear() {
  try { store.setItem("run_canary", ""); store.setItem("run_mem", ""); } catch (e) {}
}
// --- SPEICHERMESSUNG -----------------------------------------------------------------------
// -> { peak, total } in KB, oder null, wenn die Uhr es nicht hergibt.
//
// Césars Uhr startete waehrend eines Uploads dreimal neu (Mail, 22.09.2026). Ob die App dabei am
// Speicherlimit stand, konnten wir nicht sagen — wir hatten keine einzige Zahl. `getPerformance`
// liefert sie: `memory.app[].peak` ist der Hoechststand seit App-Start, `memory.system.total` der
// Speicher der Uhr. Zusammen mit der Absturz-Phase beantwortet das die Frage „wie nah war sie
// dran", statt sie zu vermuten.
function memRead() {
  if (!zosApp || typeof zosApp.getPerformance !== "function") return null;
  try {
    const m = (zosApp.getPerformance("memory") || {}).memory || {};
    const eigen = (m.app || [])[0] || {};
    const kb = (v) => (typeof v === "number" && v > 0 ? Math.round(v / 1024) : 0);
    const peak = kb(eigen.peak) || kb(eigen.used);
    const total = kb((m.system || {}).total);
    return peak || total ? { peak: peak, total: total } : null;
  } catch (e) {
    return null;   // eine Diagnose darf nie die App kosten, die sie diagnostiziert
  }
}

// --- OFFENER ABSTURZ: getrennt vom laufenden Lauf gespeichert ------------------------------
// ZWEI SCHLUESSEL, und dafuer gibt es einen teuer gelernten Grund (Emulator-Testlauf 23.09.2026,
// s. watch-zepp/TESTPLAN-EMULATOR.md). Vorher gab es nur `run_canary`, und der wurde BEIM LESEN
// geloescht — also bevor die Meldung beim Server war. Scheitert sie danach, und auf dieser
// Plattform ist das der Normalfall (Handy weg, `shake timeout`), lebt die Phase nur noch im RAM.
// Der naechste App-Start ueberschreibt sie mit seiner eigenen, und die Auskunft ist weg.
// GEMESSEN: Kill mitten in der Aufnahme (Phase 3), Neustart ohne Bridge, zweiter Neustart
// meldete 2 — den Leerlauf des gescheiterten Versuchs. Mit stehender Bridge kam im selben
// Durchlauf die richtige Phase 4 an; es lag also nicht am Merker, sondern am Zeitpunkt des
// Loeschens.
//
// Jetzt wandert die Phase beim Start nach `run_crash` und bleibt dort, bis der Server sie
// bestaetigt hat (`crashGemeldet`). Ein sauberes Beenden raeumt sie NICHT weg.
//
// Zweiter Fehler derselben Stelle, gleich mit behoben: `canaryRead()` loeschte `run_mem` mit,
// und `canaryMemRead()` las es erst DANACH — der Speicherstand vom Absturzzeitpunkt war also
// immer null, und gemeldet wurde ersatzweise der aktuelle. Damit war die Frage „wie nah stand
// sie am Limit" nie zu beantworten, obwohl genau dafuer gemessen wird.
//
// Faellt ein zweiter Absturz an, bevor der erste gemeldet ist, gewinnt der ERSTE — er wird
// NICHT ueberschrieben. Das ist die entscheidende Haelfte des Fixes, und ich hatte es zuerst
// andersherum gebaut: mit „der neuere gewinnt" waere genau der gemessene Fall wieder kaputt
// gewesen. Dort starb die App in der Aufnahme (3), der Neustart ohne Bridge konnte es nicht
// melden und starb selbst im Leerlauf (2) — die 2 haette die 3 verdraengt, und uebrig bliebe
// wieder die harmlose Meldung. Der erste ungemeldete Absturz ist auch sachlich der
// interessantere: er hat die Kette angefangen, alles danach ist Folge.
//
// -> { phase, mem } des letzten NICHT sauber beendeten Laufs; phase 0 = nichts offen.
function crashUebernehmen() {
  let v = 0;
  try { v = parseInt(store.getItem("run_canary", ""), 10) || 0; } catch (e) {}
  // Nur schreiben, wenn nichts Ungemeldetes daliegt — s. oben.
  if (v > 0 && v <= 4 && crashOffen().phase === 0) {
    try {
      store.setItem("run_crash", v + ":" + String(store.getItem("run_mem", "")));
    } catch (e) {}
  }
  canaryClear();
  return crashOffen();
}
// -> der noch nicht gemeldete Absturz, ohne ihn zu verbrauchen.
function crashOffen() {
  try {
    const teile = String(store.getItem("run_crash", "")).split(":");
    const phase = parseInt(teile[0], 10) || 0;
    if (!(phase > 0 && phase <= 4)) return { phase: 0, mem: null };
    const peak = parseInt(teile[1], 10) || 0, total = parseInt(teile[2], 10) || 0;
    return { phase: phase, mem: (peak || total) ? { peak: peak, total: total } : null };
  } catch (e) {
    return { phase: 0, mem: null };
  }
}
// Erst wenn der Server geantwortet hat. Vorher nicht — s. die Begruendung oben.
function crashGemeldet() {
  try { store.setItem("run_crash", ""); } catch (e) {}
}
// ---- Lauf-/Foil-Erkennung auf der Uhr ----------------------------------------------------------
// WORTGLEICH übernommen von den beiden Uhren, die das schon gelöst haben — NICHT neu erfunden:
//   watch/source/SessionRecorder.mc:150-158 (_updateRun, Referenz-Implementierung)
//   android/wear/.../Recorder.kt:70-121     (derselbe Automat in Kotlin)
// Hysterese: rein ab ~10 km/h (4 s anhaltend), raus unter ~9 km/h (3 s anhaltend); danach 25 s
// Sperre, bevor ein neuer Lauf beginnen darf (Zurückschwimmen/Waten erzeugt sonst Phantom-Läufe).
// Die Schwellen sind am Server-Detektor abgestimmt — hier nichts nachjustieren.
const RUN_ENTER_MPS = 2.8, RUN_EXIT_MPS = 2.5;
const RUN_ENTER_DWELL = 4, RUN_EXIT_DWELL = 3, RUN_REARM_COOLDOWN_MS = 25000;
// Entschieden wird auf der GEGLÄTTETEN Geschwindigkeit, nie auf dem Rohwert: Zepp liefert nur den
// aktuellen Wert (`s.cur`), ein einzelner Doppler-Ausreißer würde sonst einen Lauf starten. 3 s
// gleitender MEDIAN — dieselbe Fensterbreite und dasselbe Verfahren wie der Server
// (SMOOTH_WINDOW_S = 3 + _running_median in server/app/analysis/gps.py) und wie Garmin
// (SessionRecorder.speed3sMed). Ohne GPS-Fix läuft das Fenster nach 3 s leer -> sp3 = 0 -> ein
// laufender Lauf endet regulär über den Exit-Dwell (statt bei stehengebliebenem Speed weiterzulaufen).
const SPEED_WIN_S = 3;
// Max-Speed saeubern — dieselben zwei Regeln wie der Server (analysis/gps.py):
//   1) BURST: mehr als 5 m/s ueber dem 15-s-Median UND absolut ueber 28 km/h -> mehrsekuendiger
//      Doppler-Burst, es gilt der Median.
//   2) DECKEL: ueber 32 km/h ist es kein Pumpfoil mehr (Glitch/Boot) -> zaehlt gar nicht.
// An 119 echten Sessions gemessen (26.08.): der Uhr-Maxwert lag im Mittel 9,4 km/h ueber dem
// ausgewerteten, schlimmster Fall 164 km/h. Mit den Regeln: Mittel +3,1, schlimmster +17,4.
// Die Anzeige des Momentanwerts bleibt unangetastet — dort ist ein Ausreisser nach einer Sekunde
// wieder weg, im Maximum bliebe er die ganze Session stehen.
const BURST_WIN_MS = 15000, BURST_MARGIN_MPS = 5.0;
// NICHT MAX_PLAUSIBLE_MPS nennen — der Name ist oben (Zeile 33) schon vergeben und meint etwas
// ANDERES: 30 m/s = 108 km/h als Unsinns-Schwelle fuer Positionsspruenge. Haette ich ihn
// wiederverwendet, waere jede Fahrt ueber 32 km/h als GPS-Sprung verworfen worden.
const MAX_FOIL_MPS = 32 / 3.6;
const BURST_ABS_MIN_MPS = 28 / 3.6;
// Ein neuer Lauf zaehlt nur nach einem ECHTEN Stopp (Speed unter NOSTOP_MPS) — der Server fuehrt
// Laeufe ohne Stopp zusammen (_merge_no_stop, ohne Zeitfenster).
const NOSTOP_MPS = 1.5;
// Zu kurz/zu langsam = kein Lauf (Server: MIN_SEGMENT_S 5 s, Positions-Floor 2,0 m/s).
// HIER STAND ZUM ZWEITEN MAL `MAX_PLAUSIBLE_MPS = 32 / 3.6` — und damit brach der Build ab
// (10.09.2026, `zeus build`: „Identifier 'MAX_PLAUSIBLE_MPS' has already been declared").
// Derselbe Fehler wie am 26.08. (`8b75da7a`), wieder eingebaut am 30.08. (`0e55cb78`) — direkt
// UNTER den Kommentar, der davor warnt. Der Wert existiert oben schon als `MAX_FOIL_MPS`.
//
// Warum der Name so anziehend ist: die anderen fuenf Recorder nennen den Pumpfoil-Deckel
// `MAX_PLAUSIBLE_MPS` (Wear: `Recorder.kt`, Server: `analysis/gps.py`). Wer eine Aenderung
// plattformweit nachzieht, bringt den Namen also mit — und hier ist er schon fuer etwas
// ANDERES vergeben (30 m/s als Schwelle fuer Positionsspruenge, Zeile 33). Beim naechsten Mal
// die Vereinheitlichung der Namen erwaegen (steht in docs/TODO.md), bis dahin: `MAX_FOIL_MPS`.
const MIN_RUN_MS = 5000, MIN_RUN_AVG_MPS = 2.0;
// Synthetische GPS-Spur fuer den Simulator. Der Wert steht NICHT hier, sondern in der
// ERZEUGTEN, gitignorierten `devflags.js` — geschrieben von `npm run dev` (true) bzw.
// `npm run build` (false), s. watch-zepp/zepp.mjs.
//
// WARUM NICHT MEHR HIER (19.09.2026): als Konstante im Quelltext musste sie fuer die
// Store-Screenshots von Hand auf true gesetzt werden — und blieb am 18.09. stehen, bis sie
// im eingereichten 1.0.11 landete. Jans Grundregel: Code wird NIE fuers Testen geaendert,
// was fotografiert wird, muss das sein, was ausgeliefert wird. Jetzt ist die Datei mit dem
// Wert gar nicht versioniert; ein `true` kann nicht mehr committet oder vergessen werden,
// und `git status` bleibt sauber. Fehlt sie, bricht der Build ab — genau richtig, dann hat
// jemand `zeus build` direkt aufgerufen statt `npm run build`.
import { DEV_FAKE_GPS } from "./devflags.js";
// MUSS mit version.name in ../app.json übereinstimmen — beides beim Bump ändern. (Zur Laufzeit
// aus dem Paket lesen ginge nur über einen weiteren @zos-Import; die sind hier ungetestet und
// können beim Laden crashen, deshalb bewusst eine Konstante.) Der Bump auf 1.0.4 hatte nur
// app.json getroffen: die Uhr zeigte weiter "v1.0.3" und meldete das auch dem Server.
const APP_VERSION = "1.0.12";

// Wie lange der Stopp-Bildschirm nach einem Tastendruck stehen bleibt, bevor die vorherige
// Seite zurueckkommt. Fuenf Sekunden reichen zum Lesen und Antippen, und ein Fehlgriff ist
// danach spurlos weg (Vorgabe Jan, 13.09.2026).
const STOP_AUTOBACK_MS = 5000;
// Update-Hinweis nur zeigen, wenn der Store-Stand WIRKLICH neuer ist. Vorher stand hier ein
// !==-Vergleich: ein Entwicklungs-Build vor dem Store (1.0.6 lokal, 1.0.4 live) hat damit zum
// "Update" auf die AELTERE Version geraten (Jans Screenshot 18.08.: "1.0.6 -> 1.0.4"). Garmin,
// Wear OS und Apple Watch machen es seit je richtig (_versionNewer bzw. istNeuer) -- das hier ist
// dieselbe Logik: Stelle fuer Stelle numerisch, fehlende Stellen als 0.
// Wert fuer den HOECHSTWERT saeubern; `puffer` ist ein Array von [t, v] der letzten 15 s.
function maxKandidat(puffer, t, v) {
  puffer.push([t, v]);
  while (puffer.length && t - puffer[0][0] > BURST_WIN_MS) puffer.shift();
  const werte = puffer.map((x) => x[1]).sort((a, b) => a - b);
  const med = werte.length ? werte[werte.length >> 1] : 0;
  let w = v;
  if (w > med + BURST_MARGIN_MPS && w > BURST_ABS_MIN_MPS) w = med;
  return w > MAX_FOIL_MPS ? 0 : w;
}

function istNeuer(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const teil = (v) => { const p = String(v).split("."); return [0, 1, 2].map((i) => parseInt(p[i], 10) || 0); };
  const pa = teil(a), pb = teil(b);
  for (let i = 0; i < 3; i++) { if (pa[i] !== pb[i]) return pa[i] > pb[i]; }
  return false;
}
const DW = (() => { try { return getDeviceInfo().width; } catch (e) { return 480; } })();
const DH = (() => { try { return getDeviceInfo().height; } catch (e) { return 480; } })();
// Tastenzahl des Modells (API_LEVEL 2.0). Sie entscheidet, ob die Touch-Sperre automatisch greift:
// wir bedienen im Aufzeichnen SELECT (lang = Stop) und UP/DOWN (lang = Touch 10 s frei, kurz =
// Seite). Erst ab drei Tasten ist das vollstaendig, darunter wuerde die Sperre Bedienung wegnehmen,
// ohne einen Ersatz zu lassen -- und auf Apple Watch und Wear OS darf man waehrend der Aufnahme
// ohnehin wischen. Deshalb Sperre automatisch nur ab 3 Tasten; ueberstimmbar im Menue.
const KEY_NUMBER = (() => { try { return getDeviceInfo().keyNumber || 0; } catch (e) { return 0; } })();
// Uhrenmodell fuer den Server. Zepp liefert keine Part-Number wie Garmin, deshalb stand bei JEDEM
// Amazfit-Geraet nur "Amazfit" — bei einer Fehlermeldung wusste niemand, um welche Uhr es geht
// (Jan, 16.08.). `deviceName` ist der Modellname, `deviceSource` die numerische Modell-ID; die ID
// geht mit, weil sie eindeutig bleibt, auch wenn der Name je Sprache/Firmware abweicht.
const DEVICE_MODEL = (() => {
  try {
    const i = getDeviceInfo() || {};
    const n = (i.deviceName || "").toString().trim();
    const src = i.deviceSource != null ? String(i.deviceSource) : "";
    if (n && src) return n + " (" + src + ")";
    return n || (src ? "Amazfit " + src : "Amazfit");
  } catch (e) { return "Amazfit"; }
})();
// Marken-Palette (docs/BRAND.md): Cyan = primäre Aktion, Rot = Stop/destruktiv, Ink = dunkler Text auf Cyan.
const CYAN = 0x22d3ee, CYAN_P = 0x0891b2, INK = 0x083344, RED = 0xdc2626, RED_P = 0xb91c1c, WHITE = 0xffffff;
const GPS_READY = 0x22c55e, GPS_READY_P = 0x16a34a, GPS_WAIT = 0x334155, GPS_WAIT_P = 0x334155, MUTED = 0x94a3b8;

// Gehaeuseform fuer die Rand-Grafik: rund -> Ringsegment, eckig -> Rahmensegment. Zepp deklariert
// in app.json den Bildschirmtyp ("r"/"s"); zur Laufzeit sagt es getDeviceInfo().screenShape
// (1 = rund). Fehlt das Feld auf einer alten Firmware, nehmen wir rund an — das ist bei Amazfit
// der Normalfall (die 390er ist die Ausnahme).
const IS_ROUND = (() => {
  try {
    const v = getDeviceInfo().screenShape;
    return v == null ? true : v === 1;
  } catch (e) { return true; }
})();

// Wert-Skalen der Layout-Grafiken. Zepp OS 4.2 KANN die Zonen der Uhr lesen
// (Workout.getUserHrZoneSettings), wir nehmen aber bewusst die aus dem PROFIL: Wear OS und watchOS
// haben keine Zonen-API, also muss die Zahl ohnehin vom Server kommen — dann soll sie auf allen
// Plattformen aus derselben Quelle stammen, sonst faerbt dieselbe Grafik je Uhr anders.
// Beide Skalen sind gleich gebaut: sechs Grenzen = fuenf Zonen (Z1-unten … Z5-oben). Sie faerben
// BEIDES — die Zahl (layWertFarbe) und die Wert-Grafiken. Bis 1.0.7 waren das zwei verschiedene
// Skalen: fest verdrahtete Stufen 12/16/20 km/h fuer die Zahl und die Alarmspanne fuer die
// Grafik, dieselbe Geschwindigkeit konnte also gruene Zahl und gelben Ring bedeuten.
// Doku: docs/COLOR-ZONES.md.
const laySkala = { hrZones: [95, 114, 133, 152, 171, 190], speedZones: [8, 12, 16, 20, 24, 28] };
// Zonen-Farben Z1…Z5 (Spiegel von ZONE_COLORS in web/src/lib/watchLayout.ts).
const ZONE_COLORS = [0x3b82f6, 0x22c55e, 0xeab308, 0xf97316, 0xef4444];
const layIstPuls = (fid) => fid === 2 || fid === 8 || fid === 9 || fid === 21;
// Fuellgrad 0…1 (ausserhalb gekappt, nicht extrapoliert).
const layZonen = (fid) => (layIstPuls(fid) ? laySkala.hrZones : laySkala.speedZones);
function layFuellgrad(fid, v) {
  const g = layZonen(fid);
  const lo = g[0], hi = g[5];
  if (!(hi > lo) || v == null) return 0;
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
}
// Zone 0…4 auf den sechs Grenzen des Feldes.
function layZoneVon(v, grenzen) {
  let z = 0;
  for (let i = 1; i < 5; i++) if (v >= grenzen[i]) z = i;
  return Math.max(0, Math.min(ZONE_COLORS.length - 1, z));
}
function layZone(fid, v) { return layZoneVon(v, layZonen(fid)); }
// --- Geometrie der Rand-Grafik ----------------------------------------------------------------
// Gezeichnet wird auf einem CANVAS mit drawPoly, NICHT mit dem ARC-Widget. Grund ist ein
// Geraetebefund aus @elmanu13s Zepp-PR (#3): "ARC always renders rounded stroke caps on the
// T-Rex 3" — ein Segment bekaeme also runde Enden statt gerader Schnitte. Der Canvas hat noch
// zwei Vorteile: EIN Widget statt vieler (kein Loeschen/Neuanlegen pro Sekunde, also auch kein
// Z-Order-Problem mit dem Text darueber) und dieselbe Zeichenweise fuer rund und eckig.
// Winkel im Canvas: 0 Grad = 3 Uhr, wachsend im Uhrzeigersinn (y zeigt nach unten). Unser
// Parameter faengt bei 12 Uhr an -> Grad = -90 + 360 * p.
const ZEPP_POLY_STEP = 4;   // Grad je Stuetzpunkt; feiner lohnt bei <=480 px nicht

// Ringsegment (runde Uhr) als gefuelltes Polygon zwischen innerem und aeusserem Radius.
function layRingPoly(start, laenge, th, inset) {
  const cx = Math.round(DW / 2), cy = Math.round(DH / 2);
  const ra = Math.round(Math.min(DW, DH) / 2 - inset);
  const ri = Math.max(1, ra - th);
  const a0 = -90 + (start % 1000) * 360 / 1000;
  const a1 = a0 + Math.max(0, Math.min(1000, laenge)) * 360 / 1000;
  const pts = [];
  const punkt = (grad, r) => ({
    x: Math.round(cx + r * Math.cos(grad * Math.PI / 180)),
    y: Math.round(cy + r * Math.sin(grad * Math.PI / 180)),
  });
  for (let a = a0; a < a1; a += ZEPP_POLY_STEP) pts.push(punkt(a, ra));
  pts.push(punkt(a1, ra));
  for (let a = a1; a > a0; a -= ZEPP_POLY_STEP) pts.push(punkt(a, ri));
  pts.push(punkt(a0, ri));
  return pts;
}

// Rahmensegment (eckige Uhr): den Umfang ab oberer Mitte im Uhrzeigersinn abgehen und je Seite
// den ueberdeckten Abschnitt als Rechteck-Polygon liefern (max. 5 Stueck).
function layRandPolys(start, laenge, th, inset) {
  const bw = DW - 2 * inset, bh = DH - 2 * inset;
  const umfang = 2 * (bw + bh);
  const rect = (x, y, w, h) => [
    { x: Math.round(x), y: Math.round(y) },
    { x: Math.round(x + w), y: Math.round(y) },
    { x: Math.round(x + w), y: Math.round(y + h) },
    { x: Math.round(x), y: Math.round(y + h) },
  ];
  const seiten = [
    [bw / 2, (a, b) => rect(inset + bw / 2 + a, inset - th / 2, Math.max(1, b - a), th)],
    [bh, (a, b) => rect(DW - inset - th / 2, inset + a, th, Math.max(1, b - a))],
    [bw, (a, b) => rect(DW - inset - b, DH - inset - th / 2, Math.max(1, b - a), th)],
    [bh, (a, b) => rect(inset - th / 2, DH - inset - b, th, Math.max(1, b - a))],
    [bw / 2, (a, b) => rect(inset + a, inset - th / 2, Math.max(1, b - a), th)],
  ];
  const d0 = ((start % 1000) + 1000) % 1000 / 1000 * umfang;
  const d1 = d0 + Math.max(0, Math.min(1000, laenge)) / 1000 * umfang;
  const out = [];
  // Zwei Runden, damit ein Segment ueber die obere Mitte hinaus mitgenommen wird.
  for (let runde = 0; runde < 2; runde++) {
    let pos = runde * umfang;
    for (let i = 0; i < seiten.length; i++) {
      const len = seiten[i][0];
      const a = Math.max(d0, pos), b = Math.min(d1, pos + len);
      if (b > a) out.push(seiten[i][1](a - pos, b - pos));
      pos += len;
    }
  }
  return out;
}

const store = new LocalStorage();
const getTok = () => store.getItem("deviceToken", "") || "";
const getClaim = () => store.getItem("claimToken", "") || "";
const loadPending = () => { try { return JSON.parse(store.getItem("pending", "[]")) || []; } catch (e) { return []; } };
const savePending = (a) => { try { store.setItem("pending", JSON.stringify(a)); } catch (e) {} };
const removePending = (uuid) => savePending(loadPending().filter((s) => s.uuid !== uuid));

// Wasserstand je Session: wie viele GPS- und Accel-Bloecke der Server schon bestaetigt hat.
// Verfahren von der Garmin-Uhr uebernommen (`_sa`/`_sg` in watch/source/Uploader.mc) — GETRENNT
// nach Art, weil beide Arten ihre eigene Nummerierung ab 0 haben.
//
// EIGENER, WINZIGER SCHLUESSEL und nicht im `pending`-Eintrag: den grossen Block anzufassen hiesse
// ihn zu parsen UND neu zu schreiben (bei zwei Stunden 287 KB), und das mitten im Upload, wo der
// Speicher ohnehin knapp ist. Hier sind es zwei Zahlen.
//
// WOFUER (GitHub #4, 13.09.2026): bis hierher begann JEDER Versuch wieder bei Block 0. Cesars
// Upload starb reproduzierbar bei Block 108 von 2341 — zehn Neustarts haetten zehnmal dieselben
// 108 Bloecke geschickt. Er hatte das im Ticket sogar beschrieben („the transfer seemed to restart
// from zero"), wir hatten es nur nicht gelesen. Jetzt kommt jeder Versuch ein Stueck weiter.
// Ein veralteter Stand ist ungefaehrlich: der Server ueberschreibt gleiche (Session, Art, Index).
const markeKey = (uuid) => "sent:" + uuid;
const ladeMarke = (uuid) => {
  try {
    const teile = String(store.getItem(markeKey(uuid), "0/0")).split("/");
    return { gps: parseInt(teile[0], 10) || 0, accel: parseInt(teile[1], 10) || 0 };
  } catch (e) { return { gps: 0, accel: 0 }; }
};
const setzeMarke = (uuid, gps, accel) => { try { store.setItem(markeKey(uuid), gps + "/" + accel); } catch (e) {} };
const loescheMarke = (uuid) => { try { store.setItem(markeKey(uuid), ""); } catch (e) {} };

const makeUuid = (now) => "zepp-" + now + "-" + Math.floor(Math.random() * 1e9).toString(36);
const pad = (n) => (n < 10 ? "0" + n : "" + n);
const mmss = (sec) => Math.floor(sec / 60) + ":" + pad(Math.floor(sec % 60));
// Distanz wie auf Garmin (RecordView._distVal/_distUnit) und Wear (distVal/distUnit): die
// EINHEIT GEHOERT INS LABEL, nicht in den Wert. Stand hier bis 1.0.7 im Wert ("90 m") — in einem
// eigenen Layout, das Wert und Label nebeneinander stellt, las sich das dann widerspruechlich
// ("90 m" mit "km" darunter, Jans Screenshot 26.08.). fmtDist bleibt fuer die Stellen, die eine
// fertige Zeichenkette brauchen (Zusammenfassung, Log).
const distVal = (m) => (m < 1000 ? String(Math.round(m)) : (m / 1000).toFixed(2));
const distUnit = (m) => (m < 1000 ? "m" : "km");
const fmtDist = (m) => distVal(m) + " " + distUnit(m);
function distM(a, b, c, d) {
  const R = 6371000, r = Math.PI / 180, dLat = (c - a) * r, dLon = (d - b) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
// Handy/Companion per BLE verbunden? (Uhr hat kein eigenes Internet.) Fallback true, falls API fehlt.
const bleOk = () => { try { return getConnectStatus() !== false; } catch (e) { return true; } };
const accelPath = (uuid) => "accel-" + uuid + ".bin";

// ---- GPS als BINAERDATEI (seit 1.0.10) -------------------------------------------------------
// VORHER lag die Spur als Array im Speicher, und `persistActive()` schrieb bei jedem zehnten
// Punkt die GANZE Aufnahme neu als JSON weg. Gemessen am 13.09.2026: nach zwei Stunden sind das
// 287 KB pro Sicherung, alle zehn Sekunden, zusammen ueber 100 MB in den Flash — und beim Upload
// parste `flushPending()` denselben Klotz als Objektgraph zurueck (gut 1,2 MB), bevor der erste
// Block rausging. Daran ist Cesars Upload gestorben (GitHub #4, "Out of Memory" bei Block 108).
//
// Jetzt wie beim Accelerometer: feste Saetze ans Dateiende anhaengen, blockweise zurueckliefern.
// Der Verbrauch haengt damit nicht mehr an der Laenge der Aufnahme. Wear und Apple machen es
// genauso (je Block eine Datei) und hatten das Problem deshalb nie.
//
// EIN SATZ = 18 Byte, little endian:
//   0  int32  t_ms          Offset zu started_at
//   4  int32  lat * 1e6
//   8  int32  lon * 1e6
//   12 int16  speed * 100   (cm/s)
//   14 int16  hr            (0 = keiner)
//   16 int16  h_acc_m       sechstes Feld des Vertrags (docs/data-format.md), bei Zepp immer 0
// Die Rundungen sind DIESELBEN wie bisher beim Erzeugen des Punktes, die hochgeladenen Zahlen
// aendern sich also nicht.
const GPS_REC_BYTES = 18;
const gpsPath = (uuid) => "gps-" + uuid + ".bin";

const gpsToBytes = (punkte) => {
  const buffer = new ArrayBuffer(punkte.length * GPS_REC_BYTES);
  const v = new DataView(buffer);
  for (let i = 0; i < punkte.length; i++) {
    const p = punkte[i], o = i * GPS_REC_BYTES;
    v.setInt32(o, p[0] | 0, true);
    v.setInt32(o + 4, Math.round(p[1] * 1e6), true);
    v.setInt32(o + 8, Math.round(p[2] * 1e6), true);
    v.setInt16(o + 12, clampI16(p[3] * 100), true);
    v.setInt16(o + 14, clampI16(p[4] || 0), true);
    v.setInt16(o + 16, clampI16(p[5] || 0), true);
  }
  return buffer;
};

const bytesToGps = (buffer, anzahl) => {
  const v = new DataView(buffer), out = [];
  for (let i = 0; i < anzahl; i++) {
    const o = i * GPS_REC_BYTES;
    out.push([v.getInt32(o, true), v.getInt32(o + 4, true) / 1e6, v.getInt32(o + 8, true) / 1e6,
              v.getInt16(o + 12, true) / 100, v.getInt16(o + 14, true), v.getInt16(o + 16, true)]);
  }
  return out;
};
const clampI16 = (v) => Math.max(-32768, Math.min(32767, Math.round(v)));
const bytesToBase64 = (bytes, length) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < length; i += 3) {
    const a = bytes[i], b = i + 1 < length ? bytes[i + 1] : 0, c = i + 2 < length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63]
      + (i + 1 < length ? chars[(n >> 6) & 63] : "=")
      + (i + 2 < length ? chars[n & 63] : "=");
  }
  return out;
};

// ---- i18n -------------------------------------------------------------------------------------
// Die UI war komplett hartcodiert deutsch, obwohl der Server die Profil-Sprache seit langem
// mitschickt (/api/devices/config -> `language`, im app-side durchgelassen) — sie wurde hier nur
// nie ausgewertet. Jetzt: kleines Woerterbuch im Code, gespeist aus genau dieser Sprache.
//
// BEWUSST KEIN @zos/i18n / kein .po: die App ist auf echter Hardware kaum getestet, und ein
// fehlschlagender Modul-Import nimmt beim Laden die ganze App mit (genau der Grund, warum im
// app-side kein @zos/settings steht). Ein Objekt-Literal kann nicht fehlschlagen. Ausserdem
// braeuchte der .po-Weg die GERAETE-Sprache; wir wollen die PROFIL-Sprache wie alle anderen Uhren.
//
// WORTLAUT NICHT NEU ERFUNDEN — 1:1 uebernommen aus:
//   watch/source/Strings.mc                            (13 Spalten: de..cs — Hauptquelle)
//   android/wear/.../I18n.kt                           (ja/zh-Overlays + Keys, die Garmin nicht hat)
//   web/src/i18n/locales/*.ts                          (f.dist=field.4, f.dur=sd.duration,
//                                                       rec.noData=watchStats.none)
// Spalten: 0 de|1 gsw|2 de-AT|3 en|4 fr|5 it|6 es|7 pt|8 id|9 ru|10 nl|11 fi|12 cs|13 ja|14 zh
// Fehlende/leere Spalte faellt auf en (3), dann de (0) zurueck — dieselbe Kette wie in den
// anderen Apps. Ein reiner String statt Array = in allen Sprachen identisch (reine Einheiten).
// ja/zh sind hier drin (anders als bei Garmin, wo die Fonts keine CJK-Glyphen haben): Zepp OS ist
// eine chinesische Plattform, die Systemfonts haben CJK. Im Simulator gegenpruefen.
const LANGS = ["de", "gsw", "de-AT", "en", "fr", "it", "es", "pt", "id", "ru", "nl", "fi", "cs", "ja", "zh", "nb", "pl"];
const S = {
  // -- Verbindung / Pairing (Garmin _a4/_a5/_a6/_a8) --
  "menu.connect":    ["Verbinden", "Verbinde", "Verbinden", "Connect", "Se connecter", "Connetti", "Conectar", "Conectar", "Hubungkan", "Подключить", "Verbinden", "Yhdistä", "Připojit", "接続", "连接"],
  "menu.connected":  ["Verbunden", "Verbunde", "Verbunden", "Connected", "Connecté", "Connesso", "Conectado", "Conectado", "Terhubung", "Подключено", "Verbonden", "Yhdistetty", "Připojeno", "接続済み", "已连接"],
  "menu.linked":     ["Konto verknüpft", "Konto verchnüpft", "Konto verknüpft", "Account linked", "Compte lié", "Account collegato", "Cuenta vinculada", "Conta vinculada", "Akun tertaut", "Аккаунт привязан", "Account gekoppeld", "Tili linkitetty", "Účet propojen"],
  "up.notLinked":    ["Nicht verbunden", "Nöd verbunde", "Nicht verbunden", "Not linked", "Non lié", "Non collegato", "No vinculado", "Não vinculado", "Tidak tertaut", "Не привязано", "Niet gekoppeld", "Ei linkitetty", "Nepropojeno", "未接続", "未连接"],
  "pair.noConn":     ["Keine Verbindung", "Kei Verbindig", "Keine Verbindung", "No connection", "Pas de connexion", "Nessuna connessione", "Sin conexión", "Sem conexão", "Tidak ada koneksi", "Нет связи", "Geen verbinding", "Ei yhteyttä", "Bez připojení"],
  "up.noPhone":      ["Kein Telefon", "Kei Telefon", "Kein Telefon", "No phone", "Pas de téléphone", "Nessun telefono", "Sin teléfono", "Sem telefone", "Tanpa HP", "Нет телефона", "Geen telefoon", "Ei puhelinta", "Bez telefonu"],
  "up.waiting":      ["Warte…", "Warte…", "Warte…", "Waiting…", "Attente…", "Attendo…", "Esperando…", "Aguardando…", "Menunggu…", "Ожидание…", "Wachten…", "Odotetaan…", "Čekání…"],
  // Button + Slot-Label fuer den Pairing-Code. nl/fi/cs bleiben leer (Garmins Wortlaut dort ist
  // fuer den 300-px-Button zu lang) -> englisch.
  "pair.gen": ["Code erzeugen", "Code erzüge", "Code erzeugen", "Generate code", "Générer un code", "Genera codice", "Generar código", "Gerar código", "Buat kode", "Создать код", "Code maken", "Luo koodi", "Vytvořit kód", "コードを生成", "生成代码"],
  "pair.code":       ["Pairing-Code", "Pairing-Code", "Pairing-Code", "Pairing code", "Code", "Codice", "Código", "Código", "Kode", "Код", "Koppelcode", "Koodi", "Párovací kód", "コード", "代码"],
  "pair.enterThere": ["eingeben", "yygeh", "eingeben", "enter it there", "à saisir ici", "inseriscilo", "introdúcelo", "insira aqui", "masukkan", "введите", "daar invoeren", "syötä se siellä", "zadejte tam"],
  "rec.repair": ["Neu verbinden", "Neu verbinde", "Neu verbinden", "Reconnect", "Reconnecter", "Ricollega", "Reconectar", "Reconectar", "Hubungkan ulang", "Переподключить", "Opnieuw koppelen", "Yhdistä uudelleen", "Spárovat znovu", "再接続", "重新连接"],
  // -- Aufnahme / Tasten --
  // START/STOPP sind Grossbuchstaben-Buttons; Wortlaut = Wear rec.start/rec.stop, nur gross.
  "btn.start": ["START", "START", "START", "START", "DÉMARRER", "AVVIA", "INICIAR", "INICIAR", "MULAI", "СТАРТ", "START", "START", "START", "スタート", "开始"],
  "btn.stop": ["STOPP", "STOPP", "STOPP", "STOP", "ARRÊTER", "STOP", "PARAR", "PARAR", "BERHENTI", "СТОП", "STOP", "STOP", "STOP", "ストップ", "停止"],
  "btn.unlock":      ["ENTSPERREN", "ENTSPERRE", "ENTSPERREN", "UNLOCK", "DÉVERROUILLER", "SBLOCCA", "DESBLOQUEAR", "DESBLOQUEAR", "BUKA", "РАЗБЛОК.", "ONTGRENDELEN", "AVAA", "ODEMKNOUT", "ロック解除", "解锁"],
  "rec.stopHold":    ["Halten", "Halte", "Halten", "Hold", "Maintenir", "Tieni", "Mantén", "Segurar", "Tahan", "Держать", "Vasthouden", "Pidä", "Podržet", "長押し", "长按"],
  "rec.holdFree":    ["2 s halten = Touch frei", "2 s halte = Touch frei", "2 s halten = Touch frei", "Hold 2 s = touch free", "2 s = tactile libre", "2 s = touch libero", "2 s = táctil libre", "2 s = toque livre", "2 s = sentuh bebas", "2 с = касания вкл.", "2 s = touch vrij", "2 s = kosketus auki", "2 s = dotyk volný", "2秒長押しでタッチ解除", "长按2秒解锁触摸"],
  "menu.touchLock":  ["Touch-Sperre", "Touch-Sperri", "Touch-Sperre", "Touch lock", "Verrou tactile", "Blocco touch", "Bloqueo táctil", "Bloqueio do toque", "Kunci sentuh", "Блокировка касаний", "Touchvergrendeling", "Kosketuslukko", "Zámek dotyku", "タッチロック", "触摸锁定"],
  "rec.noData":      ["Noch keine Daten", "No kei Date", "Noch keine Daten", "No data yet", "Pas encore de données", "Ancora nessun dato", "Aún no hay datos", "Ainda sem dados", "Belum ada data", "Пока нет данных", "Nog geen gegevens", "Ei vielä dataa", "Zatím žádná data", "まだデータがありません", "暂无数据"],
  "gps.searching":   ["GPS suchen…", "GPS sueche…", "GPS suchen…", "GPS searching…", "Recherche GPS…", "Ricerca GPS…", "Buscando GPS…", "Buscando GPS…", "Mencari GPS…", "Поиск GPS…", "GPS zoeken…", "GPS haku…", "hledání GPS…"],

  // -- Upload / Warteschlange (Garmin _a5/_a6) --
  "up.open":         ["offen", "offe", "offen", "pending", "en attente", "in sospeso", "pendientes", "pendente", "tertunda", "в очереди", "openstaand", "odottaa", "čeká"],
  "up.nothing":      ["Nichts offen", "Nüt offe", "Nichts offen", "Nothing pending", "Rien en attente", "Niente in sospeso", "Nada pendiente", "Nada pendente", "Tidak ada", "Очередь пуста", "Niets openstaand", "Ei odottavia", "Nic nečeká"],
  "up.waitConn":     ["Wartet auf Verbindung", "Wartet uf Verbindig", "Wartet auf Verbindung", "Waiting for connection", "Attente de connexion", "Attesa connessione", "Esperando conexión", "Aguardando conexão", "Menunggu koneksi", "Ожидание связи", "Wacht op verbinding", "Odottaa yhteyttä", "Čeká na spojení"],
  "up.keepOpen":     ["App offen lassen!", "App offe lah!", "App offen lassen!", "keep the app open", "garde l'app ouverte", "tieni aperta l'app", "mantén la app abierta", "mantenha o app aberto", "biarkan aplikasi terbuka", "не закрывайте приложение", "houd de app open", "pidä sovellus auki", "nech aplikaci otevřenou", "アプリを開いたままに", "请保持应用打开"],
  "up.running":      ["Upload läuft…", "Upload lauft…", "Upload läuft…", "Uploading…", "Envoi…", "Caricamento…", "Subiendo…", "Enviando…", "Mengunggah…", "Загрузка…", "Uploaden…", "Lähetetään…", "Nahrávání…", "アップロード中…", "上传中…"],
  "up.done":         ["Upload fertig", "Upload fertig", "Upload fertig", "Upload done", "Upload terminé", "Upload completato", "Subida lista", "Envio concluído", "Unggah selesai", "Загрузка готова", "Upload klaar", "Lähetys valmis", "Nahrání hotovo", "アップロード完了", "上传完成"],
  "up.later":        ["später erneut", "spöter nomal", "später erneut", "retry later", "réessai plus tard", "riprova più tardi", "reintento más tarde", "tentar depois", "coba nanti", "повтор позже", "later opnieuw", "yritä myöhemmin", "zkusit později"],
  "up.serverUnreach": ["Server nicht erreichbar", "Server nöd erreichbar", "Server nicht erreichbar", "Server unreachable", "Serveur injoignable", "Server irraggiungibile", "Servidor no disponible", "Servidor indisponível", "Server tak terjangkau", "Сервер недоступен", "Server onbereikbaar", "Palvelin ei tavoitettavissa", "Server nedostupný"],
  "rec.uploadNow": ["Jetzt hochladen", "Jetz ueglade", "Jetzt hochladen", "Upload now", "Envoyer maintenant", "Carica ora", "Subir ahora", "Enviar agora", "Unggah sekarang", "Загрузить сейчас", "Nu uploaden", "Lähetä nyt", "Nahrát teď", "今すぐアップロード", "立即上传"],
  // -- Foil & Alarm (Garmin _a0/_a7/_a8) --
  "fm.title":        ["Foil & Alarm", "Foil & Alarm", "Foil & Alarm", "Foil & alarm", "Foil & alarme", "Foil & allarme", "Foil & alarma", "Foil & alarme", "Foil & alarm", "Foil и сигнал", "Foil & alarm", "Foil & hälytys", "Foil & alarm", "フォイル & アラーム", "水翼 & 提醒"],
  "fm.alarm":        ["Alarm", "Alarm", "Alarm", "Alarm", "Alarme", "Allarme", "Alarma", "Alarme", "Alarm", "Сигнал", "Alarm", "Hälytys", "Alarm", "アラーム", "提醒"],
  "fm.thresholds":   ["Schwellen", "Schwelle", "Schwellen", "Thresholds", "Seuils", "Soglie", "Umbrales", "Limites", "Ambang", "Пороги", "Drempels", "Kynnykset", "Prahy", "しきい値", "阈值"],
  "fm.autoFoil":     ["Auto (Foil)", "Auto (Foil)", "Auto (Foil)", "Auto (foil)", "Auto (foil)", "Auto (foil)", "Auto (foil)", "Auto (foil)", "Auto (foil)", "Авто (фойл)", "Auto (foil)", "Auto (foil)", "Auto (foil)", "自動(フォイル)", "自动(水翼)"],
  "fm.manual":       ["Manuell", "Manuell", "Manuell", "Manual", "Manuel", "Manuale", "Manual", "Manual", "Manual", "Вручную", "Handmatig", "Manuaalinen", "Ručně", "手動", "手动"],
  "foil.prefix":     ["Foil: ", "Foil: ", "Foil: ", "Foil: ", "Foil : ", "Foil: ", "Foil: ", "Foil: ", "Foil: ", "Фойл: ", "Foil: ", "Foil: ", "Foil: ", "フォイル: ", "水翼: "],
  // Kurzform von menu.layouts ("Eigene Layouts" waere auf dem 300-px-Button zu lang).
  "lay.short":       ["Layouts", "Layouts", "Layouts", "Layouts", "Layouts", "Layout", "Diseños", "Layouts", "Tata letak", "Макеты", "Layouts", "Asettelut", "Rozvržení"],
  "common.on":       ["An", "Aa", "An", "On", "Activé", "On", "Sí", "Lig", "Nyala", "Вкл", "Aan", "Päällä", "Zap", "オン", "开"],
  "common.off":      ["Aus", "Us", "Aus", "Off", "Désactivé", "Off", "No", "Desl", "Mati", "Выкл", "Uit", "Pois", "Vyp", "オフ", "关"],
  "common.auto":     ["Auto", "Auto", "Auto", "Auto", "Auto", "Auto", "Auto", "Auto", "Auto", "Авто", "Auto", "Auto", "Auto", "自動", "自动"],
  "common.done": ["Fertig", "Fertig", "Fertig", "Done", "Terminé", "Fatto", "Listo", "Concluído", "Selesai", "Готово", "Klaar", "Valmis", "Hotovo", "完了", "完成"],
  "common.error":    ["Fehler", "Fähler", "Fehler", "Error", "Erreur", "Errore", "Error", "Erro", "Kesalahan", "Ошибка", "Fout", "Virhe", "Chyba", "エラー", "错误"],

  // -- Datenfeld-Labels (Garmin _a2/_a3; Einheiten bleiben unlokalisiert) --
  "f.kmh": "km/h",
  // Feld 1 = geglättete Geschwindigkeit (3-s-Median), Feld 5 = Momentanwert — bis 1.0.4 zeigten
  // beide denselben Rohwert. Wortlaut = web fw.1 ("km/h (3s)"), in allen Sprachen identisch.
  "f.kmh3s": "km/h (3s)",
  "f.bpm": "bpm",
  "f.kmhAvg":        ["km/h Ø", "km/h Ø", "km/h Ø", "km/h avg", "km/h moy", "km/h media", "km/h med", "km/h méd", "km/h rata", "km/h ср", "km/h gem", "km/h ka", "km/h prům", "平均 km/h", "平均 km/h"],
  "f.kmhMax":        ["km/h max", "km/h max", "km/h max", "km/h max", "km/h max", "km/h max", "km/h máx", "km/h máx", "km/h maks", "km/h макс", "km/h max", "km/h maks", "km/h max", "最大 km/h", "最高 km/h"],
  "f.bpmAvg":        ["bpm Ø", "bpm Ø", "bpm Ø", "bpm avg", "bpm moy", "bpm media", "bpm med", "bpm méd", "bpm rata", "bpm ср", "bpm gem", "bpm ka", "bpm prům", "平均 bpm", "平均 bpm"],
  "f.bpmMax":        ["bpm max", "bpm max", "bpm max", "bpm max", "bpm max", "bpm max", "bpm máx", "bpm máx", "bpm maks", "bpm макс", "bpm max", "bpm maks", "bpm max", "最大 bpm", "最高 bpm"],
  "f.time":          ["Zeit", "Ziit", "Zeit", "Time", "Temps", "Tempo", "Tiempo", "Tempo", "Waktu", "Время", "Tijd", "Aika", "Čas", "時間", "时间"],
  "f.clock":         ["Uhr", "Uhr", "Uhr", "Clock", "Heure", "Ora", "Hora", "Hora", "Jam", "Часы", "Klok", "Kello", "Hodiny", "時計", "时钟"],
  "f.dist":          ["Distanz", "Distanz", "Distanz", "Distance", "Distance", "Distanza", "Distancia", "Distância", "Jarak", "Дистанция", "Afstand", "Matka", "Vzdálenost", "距離", "距离"],
  "f.dur":           ["Dauer", "Duur", "Dauer", "Duration", "Durée", "Durata", "Duración", "Duração", "Durasi", "Длительность", "Duur", "Kesto", "Doba", "継続時間", "时长"],
  "f.runs":          ["Läufe", "Läuf", "Läufe", "Runs", "Runs", "Run", "Tramos", "Runs", "Run", "Заезды", "Runs", "Vedot", "Jízdy", "ラン", "航段"],
  // Aktueller Lauf (Feld 14/15). Wortlaut 1:1 aus android/wear/.../I18n.kt (f.runTime/f.runDist,
  // inkl. der pt/id/ru/ja/zh-Overlays); nl/fi/cs hat Wear dort nicht -> leer = Englisch.
  "f.runTime": ["Lauf-Zeit", "Lauf-Ziit", "Lauf-Zeit", "Run time", "Temps run", "Tempo run", "Tiempo run", "Tempo run", "Waktu run", "Время заезда", "Rit-tijd", "Vedon aika", "Čas jízdy", "ラン時間", "航段时间"],
  "f.runDist": ["Lauf-Dist", "Lauf-Dist", "Lauf-Dist", "Run dist", "Dist run", "Dist run", "Dist run", "Dist run", "Jarak run", "Дист заезда", "Rit-afst", "Vedon matka", "Vzdál. jízdy", "ラン距離", "航段距离"],
  // „Lauf läuft" — Garmin-Wortlaut (watch/source/Strings.mc f.runActive, 13 Spalten); ja/zh gibt es
  // dort nicht und Wear kennt den Key gar nicht -> leer = Englisch, statt zu raten.
  "f.runActive":     ["Lauf läuft", "Lauf lauft", "Lauf läuft", "run active", "run actif", "run attivo", "run activo", "run ativo", "run aktif", "заезд идёт", "run actief", "veto käynnissä", "jízda aktivní"],
  "f.lastRunTime": ["letzte Zeit", "letschti Ziit", "letzte Zeit", "last time", "dern. temps", "ult. tempo", "últ. tiempo", "último tempo", "waktu terakhir", "посл время", "laatste tijd", "ed. aika", "posl. čas", "前回の時間", "上次时间"],
  "f.lastRunDist": ["letzte Dist", "letschti Dist", "letzte Dist", "last dist", "dern. dist", "ult. dist", "últ. dist", "última dist", "jarak terakhir", "посл дист", "laatste afst", "ed. matka", "posl. vzdál", "前回の距離", "上次距离"],
  "f.lastRunAvg": ["letzter Ø", "letschte Ø", "letzter Ø", "last avg", "dern. moy", "ult. media", "últ. med", "última méd", "rata terakhir", "посл средн", "laatste Ø", "ed. Ø", "posl. Ø", "前回の平均", "上次平均"],
  "f.lastRunMax": ["letzter max", "letschte max", "letzter max", "last max", "dern. max", "ult. max", "últ. máx", "último máx", "maks terakhir", "посл макс", "laatste max", "ed. maks", "posl. max", "前回の最大", "上次最高"],
  "f.lastRunMaxHr": ["letzter max bpm", "letschte max bpm", "letzter max bpm", "last max bpm", "dern. max bpm", "ult. max bpm", "últ. máx bpm", "último máx bpm", "maks terakhir bpm", "посл макс bpm", "laatste max bpm", "ed. maks bpm", "posl. max bpm", "前回の最大心拍", "上次最高心率"],
};
// Norwegisch (Bokmål) als OVERLAY statt 16. Spalte: die Zeilen oben haben teils weniger
// Eintraege (fehlende Sprache = Englisch), ein Anhaengen waere dort ins Leere gelaufen.
// Anlass: erster norwegischer Nutzer (Sogndal, 05.08.2026); nn/no landen ebenfalls hier.
// Polnisch — 17. Sprache (28.08.). Wie NB als Overlay statt als weitere Spalte in 59
// Zeilen: die Tabelle oben ist schon 15 Spalten breit. Texte aus denselben Quellen wie
// bei den anderen Uhren (web-Locales bzw. einmal uebersetzt und geteilt).
const PL = {
  "btn.start": "START",
  "btn.stop": "STOP",
  "common.auto": "Auto",
  "common.done": "Gotowe",
  "common.error": "Błąd",
  "common.off": "Wył.",
  "common.on": "Wł.",
  "f.bpm": "bpm",
  "f.bpmAvg": "bpm śr.",
  "f.bpmMax": "bpm maks.",
  "f.clock": "Godzina",
  "f.dist": "Dystans",
  "f.dur": "Czas",
  "f.kmh": "km/h",
  "f.kmh3s": "km/h (3s)",
  "f.kmhAvg": "km/h śr.",
  "f.kmhMax": "km/h maks.",
  "f.lastRunAvg": "ost. śr.",
  "f.lastRunDist": "ost. dyst.",
  "f.lastRunMax": "ost. maks.",
  "f.lastRunMaxHr": "ost. maks. bpm",
  "f.lastRunTime": "ost. czas",
  "f.runActive": "przejazd trwa",
  "f.runDist": "Dyst. przejazdu",
  "f.runTime": "Czas przejazdu",
  "f.runs": "Przejazdy",
  "f.time": "Czas",
  "fm.alarm": "Alarm",
  "fm.autoFoil": "Auto (foil)",
  "fm.manual": "Ręcznie",
  "fm.thresholds": "Progi",
  "fm.title": "Foil i alarm",
  "foil.prefix": "Foil: ",
  "gps.searching": "Szukam GPS…",
  "lay.short": "Układy",
  "menu.connect": "Połącz",
  "menu.connected": "Połączono",
  "menu.linked": "Konto połączone",
  "menu.touchLock": "Blokada dotyku",
  "pair.code": "Kod parowania",
  "pair.enterThere": "wpisz go tam",
  "pair.gen": "Wygeneruj kod",
  "pair.noConn": "Brak połączenia",
  "rec.holdFree": "2 s = dotyk wolny",
  "rec.noData": "Brak danych",
  "rec.repair": "Połącz ponownie",
  "btn.unlock": "ODBLOKUJ",
  "rec.stopHold": "Trzymaj",
  "rec.uploadNow": "Wyślij teraz",
  "up.done": "Wysłano",
  "up.keepOpen": "nie zamykaj aplikacji",
  "up.later": "spróbuję później",
  "up.noPhone": "Brak telefonu",
  "up.notLinked": "Nie połączono",
  "up.nothing": "Nic w kolejce",
  "up.open": "w kolejce",
  "up.running": "Wysyłanie…",
  "up.serverUnreach": "Serwer nieosiągalny",
  "up.waitConn": "Czekam na połączenie",
  "up.waiting": "Czekam…",
};

const NB = {
  "menu.connect": "Koble til",
  "menu.connected": "Tilkoblet",
  "menu.linked": "Konto tilkoblet",
  "up.notLinked": "Ikke koblet",
  "pair.noConn": "Ikke tilkoblet",
  "up.noPhone": "Ingen mobil",
  "up.waiting": "Venter…",
  "pair.gen": "Lag kode",
  "pair.code": "Koblingskode",
  "pair.enterThere": "tast den inn der",
  "rec.repair": "Koble igjen",
  "btn.start": "START",
  "btn.stop": "STOP",
  "btn.unlock": "LÅS OPP",
  "rec.stopHold": "Hold",
  "rec.holdFree": "Hold 2 s = berøring fri",
  "menu.touchLock": "Berøringslås",
  "rec.noData": "Ingen data ennå",
  "gps.searching": "GPS søker…",
  "up.open": "i kø",
  "up.nothing": "Ingenting i kø",
  "up.waitConn": "Venter på forbindelse",
  "up.keepOpen": "hold appen åpen",
  "up.running": "Laster opp…",
  "up.done": "Lastet opp",
  "up.later": "prøv senere",
  "up.serverUnreach": "Server utilgjengelig",
  "rec.uploadNow": "Last opp nå",
  "fm.title": "Foil & alarm",
  "fm.alarm": "Alarm",
  "fm.thresholds": "Grenser",
  "fm.autoFoil": "Auto (foil)",
  "fm.manual": "Manuell",
  "foil.prefix": "Foil: ",
  "lay.short": "Oppsett",
  "common.on": "På",
  "common.off": "Av",
  "common.auto": "Automatisk",
  "common.done": "Ferdig",
  "common.error": "Feil",
  "f.kmhAvg": "km/h snitt",
  "f.kmhMax": "km/h maks",
  "f.bpmAvg": "bpm snitt",
  "f.bpmMax": "bpm maks",
  "f.time": "Tid",
  "f.clock": "Klokke",
  "f.dist": "Distanse",
  "f.dur": "Varighet",
  "f.runs": "Runs",
  "f.runTime": "Run-tid",
  "f.runDist": "Run dist",
  "f.runActive": "run aktivt",
  "f.lastRunTime": "siste tid",
  "f.lastRunDist": "siste dist",
  "f.lastRunAvg": "siste snitt",
  "f.lastRunMax": "siste maks",
  "f.lastRunMaxHr": "siste maks bpm",
};
// Aktive Spalte. Default ENGLISCH (3), nicht Deutsch: die App liegt international im Store, und
// die Geraete-Systemsprache ist ohne zusaetzlichen (riskanten) @zos-Import nicht lesbar. Sobald
// die Uhr gepairt ist, kommt die Profil-Sprache vom Server und wird persistiert.
let LI = 3;
const setLang = (code) => {
  // The server normally sends short profile language codes (`fr`, `en`, etc.). Also accept BCP-47
  // variants from an old cache or another source (`fr-FR`, `nb-NO`) without ever making French
  // fall back to an unrelated language.
  const raw = String(code || "").trim().replace(/_/g, "-");
  const low = raw.toLowerCase();
  let normalized = raw;
  if (low === "de-at" || low.startsWith("de-at-")) normalized = "de-AT";
  else if (low === "de-ch" || low.startsWith("de-ch-") || low.startsWith("gsw")) normalized = "gsw";
  else if (low.startsWith("nb") || low.startsWith("nn") || low === "no" || low.startsWith("no-")) normalized = "nb";
  else if (low.indexOf("-") > 0) normalized = low.split("-")[0];
  else normalized = low;
  const i = normalized ? LANGS.indexOf(normalized) : -1;
  LI = i >= 0 ? i : 3;
};
const t = (k) => {
  // Norwegisch und Polnisch kommen aus Overlays (die Zeilen oben haben keine Spalte 15/16)
  // -> sonst Englisch.
  if (LI === 15) {
    const v = NB[k];
    if (v) { return v; }
  }
  if (LI === 16) {
    const v = PL[k];
    if (v) { return v; }
  }
  const row = S[k];
  if (row == null) { return k; }
  if (typeof row === "string") { return row; }
  const sp = (LI === 15 || LI === 16) ? 3 : LI;
  return row[sp] || row[3] || row[0] || k;
};

// ---- Layout-Renderer: Konstanten ---------------------------------------------------------------
// Eigene Datenseiten aus dem Web-Editor auf der Uhr zeichnen. Element:
//   [typ, x, y, size, color, flags, extra…]   Koordinaten in PROMILLE der Display-Breite/-Höhe
//   typ 1 = Wert eines Datenfelds   (extra = Feld-ID; flags Bit2 = Farbe nach Wert)
//   typ 2 = ÜBERSETZTES Feld-Label  (extra = Feld-ID -> t())
//   typ 3 = Freitext                (extra = Text, nie übersetzt)
//   typ 4 = Trennlinie              (extra = x2,y2; size = Strichbreite)
//   typ 5 = REC-Indikator           (Punkt UND "REC"-Text)
//   typ 6 = Seiten-Punkte           (Anzahl dynamisch)
//   typ 7 = "Pausiert"-Hinweis      (auf Zepp nie sichtbar, s. _renderLayoutPage)
//   typ 8 = Rand-Grafik             (x = Start auf dem UMFANG ab 12 Uhr im Uhrzeigersinn,
//           y = Laenge, size = Dicke 1…4, extra = Feld-ID). RUNDE Uhr -> Ringsegment,
//           ECKIGE -> Rahmensegment; beides als Polygon auf EINEM Canvas. Entscheidet der
//           Renderer, nicht der Autor.
//   typ 9 = Balken                  (x/y = Mitte, size = Dicke, extra = Feld-ID,
//           extra2 = Breite 50…1000)
//   Bei 8/9 faerbt flags Bit0 nach Zone/Skala — dort hat Bit0 NICHT die Text-Bedeutung.
//   flags Bit0 = links, Bit1 = rechts, sonst zentriert
// Vorlagen: android/wear/.../WatchLayout.kt und watch-apple/Sources/WatchLayoutRender.swift.
//
// Palette EXAKT wie server/app/api/layouts.py PALETTE (Index 1…15; 0 = "auto" -> Rolle entscheidet).
// Garmin rundet auf seine Hardware-Farben, Zepp kann die echten Hex-Werte zeichnen.
const LAY_PALETTE = [
  0xffffff, 0xd0d0d0, 0x808080, 0x000000,
  0xff0000, 0xff5500, 0xffaa00, 0xffff00,
  0x00ff00, 0x00aa00, 0x00ffff, 0x22d3ee,
  0x0055ff, 0xaa00ff, 0xff00aa,
];
const layColor = (idx, fb) => ((idx | 0) >= 1 && (idx | 0) <= LAY_PALETTE.length) ? LAY_PALETTE[(idx | 0) - 1] : fb;
// Rollen-Vorgaben für "auto" — identisch mit paletteColor() in der Web-Vorschau.
const AUTO_VALUE = 0xffffff, AUTO_LABEL = 0xd0d0d0, AUTO_LINE = 0x808080;
// Größenstufen: NICHT geschätzt. Tintenbreite von "18.5" je Stufe bei 280 px Displaybreite,
// gemessen im Connect-IQ-Simulator (web/src/lib/watchLayout.ts FONT_MEASURED, Spalte 2);
// Schriftgröße = Breite / Vorschub-pro-px / 280 × Displaybreite. Ergebnis sind ECHTE PIXEL —
// deshalb hier KEIN px() (das skaliert von der 480er-Designbasis und würde doppelt umrechnen;
// die vorhandenen Größen in showBig() rechnen aus demselben Grund direkt mit DH).
const FONT_INK_W_280 = [29, 46, 50, 61, 64, 82, 99, 146, 166];
const FONT_REF_W = 280, SAMPLE_ADV = 1.973;
const laySize = (step) => {
  let i = step | 0;
  if (i < 0) i = 0;
  if (i > FONT_INK_W_280.length - 1) i = FONT_INK_W_280.length - 1;
  return Math.max(7, Math.round(DW * FONT_INK_W_280[i] / SAMPLE_ADV / FONT_REF_W));
};
// Blasse Variante einer Farbe: Zepp-FILL_RECT hat keine verlässliche Alpha-Stütze, also gegen den
// Seiten-Hintergrund mischen (Web-Vorschau: inaktive Seiten-Punkte 35 % Deckkraft).
const layMix = (c, bg, f) => {
  const r = Math.round(((c >> 16) & 255) * f + ((bg >> 16) & 255) * (1 - f));
  const g = Math.round(((c >> 8) & 255) * f + ((bg >> 8) & 255) * (1 - f));
  const b = Math.round((c & 255) * f + (bg & 255) * (1 - f));
  return (r << 16) | (g << 8) | b;
};
// Wert-Farbe aus den PROFIL-ZONEN — derselben Skala, die auch die Wert-Grafiken faerbt.
// Historie: erst feste Stufen (12/16/20 km/h bzw. 120/150/170 bpm), die nicht zur Grafik daneben
// passten; jetzt eine einstellbare Quelle fuer alle Plattformen (docs/COLOR-ZONES.md).
const laySpeedColor = (kmh) => ZONE_COLORS[layZoneVon(kmh, laySkala.speedZones)];
const layHrColor = (bpm) => (bpm <= 0 ? null : ZONE_COLORS[layZoneVon(bpm, laySkala.hrZones)]);

// Recorder wie Garmin. Wischbare Seiten:
//   Ruhe:     0 Daten(+START) · 1 Verbindung/Code · 2 Upload-Queue
//   Aufnahme: 0..N-1 Datenseiten (kein Button) · N Stopp-Screen(+STOPP)
// GPS ab Ruhe-Screen, Auto-Start, Pairing+Upload im Hintergrund. Aufnahme wird laufend persistent
// gepuffert (Absturz-sicher); nach Stopp Summary mit Upload-Fortschritt; offline -> später senden.
Page(
  BasePage({
    state: {
      screen: "idle", idlePage: 0, page: 0,
      idleHint: "", idleHintTimer: null,   // kurzlebige Auskunft in der Statuszeile
      recording: false, startedAtMs: 0, uuid: "",
      paired: false, code: "",
      fix: false, autoTicks: 0,
      gps: [], dist: 0, max: 0, cur: 0, hr: 0, hrSum: 0, hrN: 0, hrMax: 0, prev: null,
      last: null, upStatus: "", upPct: 0,
      uploading: false,
      // Lauf-/Foil-Erkennung (Paket 1). sp3 = 3-s-Median in m/s, spWin = [[tMs, mps], …].
      sp3: 0, spWin: [], foiling: false, _prevFoil: false,
      enterStreak: 0, exitStreak: 0, runEndedMs: -100000,
      runStartMs: 0, runStartDist: 0, runMaxMps: 0, runCount: 0,
      // Hoechstpuls IM Lauf (Feld 21). Der Session-Hoechstpuls ist Feld 9 — je Lauf fuehrt den
      // niemand, also selbst mitschreiben wie das Lauf-Hoechsttempo.
      runMaxHr: 0, lastRunMaxHr: 0,
      lastRunDurMs: 0, lastRunDistM: 0, lastRunAvgMps: 0, lastRunMaxMps: 0,
      views: [[1, 3, 4]], offFoil: [12, 17, 16], autoStart: false, stopMode: "hold",
      // Seiten-Sätze je Zustand (Server, getaggte Listen: [0,a,b,c] klassisch | [1,bg,[el…]] Layout).
      // browseAll = im Off-Foil-Zustand auch durch die On-Foil-Seiten blättern. _ringKey cached den
      // zuletzt gebauten Ring (Zustand + Layout-Schalter) — bei Config-Änderung auf null setzen.
      pages: [], offFoilPages: [], browseAll: true, _ringCache: null, _ringKey: null,
      // Update-Hinweis + Layout-Zustand. layoutsPref wird aus LocalStorage geladen (siehe init),
      // null = automatisch; layoutsServerDefault ist nur die Vorbelegung vom Server.
      updateVersion: "", layoutsPref: null, layoutsServerDefault: false,
      // null = automatisch (haengt an der Tastenzahl, s. _useTouchLock), true/false = Wahl.
      touchLockPref: null,
      // Vorbelegung vom Server ("auto" | "on" | "off"); "auto" laesst die Tastenzahl
      // entscheiden — genau das Verhalten von vorher, es aendert sich also fuer niemanden
      // etwas, der nichts einstellt.
      waterLockServer: "auto",
      // Foil & Alarm (entkoppelt): Foil = Metadaten (+ Auto-Schwellen); Alarm An/Aus; Quelle Auto/Manuell.
      foils: [], foilId: null, foilLabel: "—", almOn: false, almSrc: "foil", almLow: 0, almHigh: 0,
      // Puls-Grenze (0 = aus) + Vibrationsmuster je Grenze + Wiederholung. Kamen bis
      // 18.09.2026 gar nicht an der Uhr an (s. app-side/index.js).
      almHrHigh: 0, almPatHigh: "short2", almPatLow: "long2", almPatHr: "short1",
      almRepeat: "once", almRepeatS: 5,
      // Marken IM LAUF: Punkte, die man ERREICHT (Strecke und Zeit koennen nicht weniger
      // werden) — je ein eigener Modus ("once" = nur bei N | "every" = jedes Vielfache) und
      // KEIN almRepeat/almRepeatS. _markDistN/_markTimeN zaehlen je Lauf.
      runDistM: 0, runDistMode: "once", almPatDist: "short1",
      runTimeS: 0, runTimeMode: "once", almPatTime: "short2",
      _markDistN: 0, _markTimeN: 0,
      // Aufzeichnungsmodus aus dem Profil: full (25 Hz) | lite (sparsam) | gps (nur GPS).
      recordMode: "full",
      vibrator: null, buzzer: null, _almActive: false, _almHrActive: false,
      _almLetztMs: 0, _almPattTimer: null, _foilInit: false,
      timer: null, pollTimer: null, hbTimer: null, lockTimer: null, unlockTimer: null,
      // Rueckkehr vom Stopp-Bildschirm nach einem versehentlichen Tastendruck, s. _toStopScreen.
      stopBackTimer: null, stopBackPage: 0,
      lockHoldTimer: null,   // laeuft, solange auf die Touch-Sperre gedrueckt wird
      touchLocked: false, brightMode: "system", brightUntilMs: 0,
      geo: null, geoSpeedPrev: null, geoCallback: null, geoLast: null, hrSensor: null, hrCallback: null, hrUpdatedMs: 0, _hrLogged: false, w: {},
      accelSensor: null, accelCallback: null, accelBuffer: [], accelSamples: 0, accelBytes: 0,
      accelFirstMs: 0, accelLastMs: 0, accelChunkT0: [], accelFile: "", _accelLogged: false,
      // GPS-Datei. `gps` bleibt als RUECKFALL bestehen: laesst sich die Datei nicht oeffnen,
      // zeichnet die Uhr wie vor 1.0.10 in den Speicher auf, statt gar nichts aufzuzeichnen.
      gpsFile: "", gpsBuffer: [], gpsCount: 0, gpsLastMs: 0, gpsFehler: 0,
      _fi: 0, _flat: null, _flon: null,
    },

    // WICHTIG: zml macht pro Request einen BLE-Shake; PARALLELE Requests würgen sich gegenseitig ab
    // (undefined/shake timeout). Daher ALLE Requests hier serialisieren — immer nur EINER gleichzeitig
    // (FIFO), KEIN Retry. So kollidiert z.B. der Heartbeat-CONFIG nie mit einem laufenden Upload.
    reqQ(payload) {
      const prev = this._chain || Promise.resolve();
      const p = prev.catch(() => {}).then(() => this.request(payload));
      this._chain = p.catch(() => {});
      return p;
    },

    _accelHz() {
      const s = this.state;
      const span = s.accelLastMs - s.accelFirstMs;
      return s.accelSamples > 1 && span > 0
        ? Math.max(1, Math.round((s.accelSamples - 1) * 1000 / span))
        : ACCEL_DEFAULT_HZ;
    },

    /**
     * Wie `_flushGpsBuffer`: OEFFNEN, an fester Position schreiben, SCHLIESSEN.
     *
     * Diese Datei blieb bis 13.09.2026 waehrend der ganzen Aufnahme offen, und das ging jahrelang
     * gut — SOLANGE ES DIE EINZIGE WAR. Seit die Spur ebenfalls in eine Datei geht, schrieb der
     * Accelerometer nur noch seinen ersten Block: 128 Samples (7,5 s) in einer 13-Minuten-Aufnahme,
     * waehrend GPS seine 65 Bloecke vollstaendig ablegte. Die Reihenfolge passt genau — Accel
     * schreibt zuerst (nach 7,5 s), GPS zum ersten Mal nach 12,6 s, und ab da war Schluss.
     *
     * Zepp OS vertraegt offenbar keine zweite offene Datei. Deshalb ist ab hier NIE MEHR ALS EINE
     * gleichzeitig offen, und beide schreiben an einer ausdruecklichen Position statt auf einen
     * Dateizeiger zu vertrauen.
     */
    _flushAccelBuffer() {
      const s = this.state;
      if (!s.accelFile || !s.accelBuffer.length) return;
      const values = s.accelBuffer;
      const buffer = new ArrayBuffer(values.length * 2);
      const view = new DataView(buffer);
      for (let i = 0; i < values.length; i++) view.setInt16(i * 2, values[i], true);
      let fd = -1;
      try {
        fd = openSync({ path: s.accelFile, flag: O_RDWR });
        const written = writeSync({ fd, buffer,
          options: { offset: 0, length: buffer.byteLength, position: s.accelBytes } });
        closeSync({ fd }); fd = -1;
        if (written !== buffer.byteLength) throw new Error("short accelerometer write " + written);
        s.accelBytes += buffer.byteLength;
        s.accelBuffer = [];
      } catch (e) {
        if (fd >= 0) { try { closeSync({ fd }); } catch (e2) {} }
        console.log("[pumpfoil] accelerometer write failed " + ((e && e.message) || e));
      }
    },

    _startGps() {
      const s = this.state;
      s.gpsFile = gpsPath(s.uuid); s.gpsBuffer = []; s.gpsCount = 0; s.gpsLastMs = 0;
      s.gpsFehler = 0;
      try {
        // Nur ANLEGEN und sofort wieder schliessen. Die Datei bleibt NICHT offen — s. _flushGpsBuffer.
        const fd = openSync({ path: s.gpsFile, flag: O_RDWR | O_CREAT | O_TRUNC });
        closeSync({ fd });
      } catch (e) {
        // Kein Abbruch: ohne Datei laeuft der alte Weg ueber `s.gps` weiter.
        s.gpsFile = "";
        console.log("[pumpfoil] gps file unavailable, keeping track in memory");
      }
    },

    /**
     * Puffer an die Datei anhaengen: OEFFNEN, an fester Position schreiben, SCHLIESSEN.
     *
     * WARUM NICHT EINE DAUERHAFT OFFENE DATEI (Befund 13.09.2026 im Emulator): so war es zuerst
     * gebaut, und dann schrieb jede Aufnahme GENAU EINEN Block — GPS wie Accelerometer. Drei
     * Sessions in Folge hatten exakt 10 Punkte und exakt 128 Samples, waehrend dieselbe Fassung
     * ohne die GPS-Datei 27 Punkte ueber drei Bloecke schrieb. Die zweite dauerhaft offene Datei
     * hat also auch den Accel-Pfad mitgerissen, der vorher monatelang lief.
     *
     * Woran genau es lag, weiss ich nicht — deshalb ist das hier so gebaut, dass es unabhaengig
     * von der Vermutung stimmt: es ist nie eine zweite Datei dauerhaft offen, und geschrieben
     * wird an einer AUSDRUECKLICHEN Position (`gpsCount * 18`) statt auf einen Dateizeiger zu
     * vertrauen, den wir nicht kontrollieren. Bei einem GPS-Punkt pro Sekunde faellt das alle
     * zehn Sekunden an — das kostet nichts.
     */
    _flushGpsBuffer() {
      const s = this.state;
      if (!s.gpsFile || !s.gpsBuffer.length) return;
      let fd = -1;
      try {
        const buffer = gpsToBytes(s.gpsBuffer);
        fd = openSync({ path: s.gpsFile, flag: O_RDWR });
        const written = writeSync({ fd, buffer,
          options: { offset: 0, length: buffer.byteLength, position: s.gpsCount * GPS_REC_BYTES } });
        closeSync({ fd }); fd = -1;
        if (written !== buffer.byteLength) throw new Error("short gps write " + written);
        s.gpsCount += s.gpsBuffer.length;
        s.gpsBuffer = [];
        s.gpsFehler = 0;
      } catch (e) {
        if (fd >= 0) { try { closeSync({ fd }); } catch (e2) {} }
        // JEDEN Fehlschlag melden, nicht nur den ersten. Die erste Fassung loggte einmal und
        // schwieg dann — dadurch sah ein kaputter Schreibpfad wie „die Aufnahme hoert auf" aus,
        // und ich habe einen Abend lang die falsche Stelle gesucht.
        console.log("[pumpfoil] gps write failed " + ((e && e.message) || e));
        // Nach drei Fehlschlaegen in Folge zurueck auf den Weg von 1.0.9: Spur im Speicher. Der
        // ist erprobt. Lieber viel Speicher als eine Aufnahme, die stumm bei zehn Punkten endet.
        //
        // ABER nur, solange noch NICHTS in der Datei steht: waere schon ein Block geschrieben,
        // wuerde der Wechsel ihn abhaengen (der Upload liest entweder Datei ODER Array, nicht
        // beides) und damit genau die Daten wegwerfen, die schon sicher waren. Dann lieber
        // weiter versuchen — der Puffer waechst, aber das ist das Verhalten von 1.0.9 und
        // niemand verliert etwas.
        if (++s.gpsFehler >= 3 && s.gpsCount === 0) {
          console.log("[pumpfoil] gps file giving up, keeping track in memory");
          for (const p of s.gpsBuffer) s.gps.push(p);
          s.gpsBuffer = []; s.gpsFile = ""; s.gpsCount = 0;
        }
      }
    },

    _stopGps() {
      this._flushGpsBuffer();
    },

    /** Wie viele GPS-Punkte die laufende Aufnahme hat — egal ob Datei oder Rueckfall. */
    _gpsGesamt() {
      const s = this.state;
      return s.gpsFile ? s.gpsCount + s.gpsBuffer.length : s.gps.length;
    },

    _startAccel() {
      const s = this.state;
      // Aufzeichnungsmodus aus dem Profil (bis 18.09.2026 kam er hier nie an, s.
      // app-side/index.js — die Uhr nahm IMMER 25 Hz, egal was im Profil stand).
      //
      //   "gps"  -> Beschleunigungssensor gar nicht starten. Der Server sieht dann eine reine
      //             GPS-Aufnahme, genau wie bei einer Uhr ohne brauchbaren Sensor.
      //   "lite" -> niedrigere Sensorrate (FREQ_MODE_NORMAL statt HIGH). Die ECHTE Rate misst
      //             die Uhr ohnehin selbst und meldet sie mit (`_accelHz`), der Server rechnet
      //             also mit dem, was wirklich ankam.
      //   "full" -> wie bisher.
      //
      // Entschieden wird NUR hier, beim Start einer Aufnahme. Waehrend eine laeuft, wird nichts
      // umgeschaltet: der Aufnahmeweg ist der gefaehrlichere von beiden.
      if (s.recordMode === "gps") {
        s.accelFile = ""; s.accelSensor = null; s.accelCallback = null;
        s.accelBuffer = []; s.accelSamples = 0; s.accelBytes = 0;
        s.accelFirstMs = 0; s.accelLastMs = 0; s.accelChunkT0 = []; s._accelLogged = false;
        console.log("[pumpfoil] recordMode=gps -> accelerometer aus");
        return;
      }
      s.accelFile = accelPath(s.uuid); s.accelBuffer = []; s.accelSamples = 0; s.accelBytes = 0;
      s.accelFirstMs = 0; s.accelLastMs = 0; s.accelChunkT0 = []; s._accelLogged = false;
      try {
        // Nur ANLEGEN und sofort wieder schliessen — s. _flushAccelBuffer.
        const fd = openSync({ path: s.accelFile, flag: O_RDWR | O_CREAT | O_TRUNC });
        closeSync({ fd });
        s.accelSensor = new Accelerometer();
        s.accelCallback = () => {
          if (!s.recording) return;
          try {
            const a = s.accelSensor.getCurrent();
            if (!a) return;
            const now = Date.now();
            if (!s.accelFirstMs) s.accelFirstMs = now;
            if (s.accelSamples % ACCEL_CHUNK_SAMPLES === 0) {
              s.accelChunkT0.push(Math.max(0, now - s.startedAtMs));
            }
            const scale = ACCEL_SCALE / STANDARD_GRAVITY_CM_S2;
            s.accelBuffer.push(clampI16(a.x * scale), clampI16(a.y * scale), clampI16(a.z * scale));
            s.accelSamples++; s.accelLastMs = now;
            if (s.accelBuffer.length >= ACCEL_CHUNK_SAMPLES * 3) this._flushAccelBuffer();
            if (!s._accelLogged) {
              s._accelLogged = true;
              console.log("[pumpfoil] accelerometer active");
            }
          } catch (e) {}
        };
        s.accelSensor.onChange(s.accelCallback);
        s.accelSensor.setFreqMode(s.recordMode === "lite" ? FREQ_MODE_NORMAL : FREQ_MODE_HIGH);
        s.accelSensor.start();
      } catch (e) {
        console.log("[pumpfoil] accelerometer unavailable " + ((e && e.message) || e));
        // Ohne Datei gibt es nichts zu schreiben. Den Namen loeschen, sonst versucht jeder
        // Puffer-Lauf vergeblich zu oeffnen und fuellt das Log.
        s.accelFile = "";
        this._stopAccel();
      }
    },

    _stopAccel() {
      const s = this.state;
      try { s.accelSensor && s.accelCallback && s.accelSensor.offChange(s.accelCallback); } catch (e) {}
      try { s.accelSensor && s.accelSensor.stop(); } catch (e) {}
      this._flushAccelBuffer();
      s.accelSensor = null; s.accelCallback = null;
      // The file is authoritative. If a storage write failed, never advertise samples that are not
      // actually recoverable; otherwise every retry would end in a short-read failure.
      try {
        const info = s.accelFile ? statSync({ path: s.accelFile }) : null;
        if (info) s.accelSamples = Math.floor(info.size / 6);
      } catch (e) {}
      s.accelChunkT0 = s.accelChunkT0.slice(0, Math.ceil(s.accelSamples / ACCEL_CHUNK_SAMPLES));
      if (s.accelSamples) console.log("[pumpfoil] accelerometer samples=" + s.accelSamples + " hz=" + this._accelHz());
    },

    _setBrightMode(mode, restartIdle) {
      const s = this.state;
      try {
        let result;
        if (mode === "recording" || mode === "uploading") {
          s.brightUntilMs = 0;
          result = setPageBrightTime({ brightTime: RECORDING_BRIGHT_MS });
        } else if (mode === "idle") {
          const now = Date.now();
          if (restartIdle || s.brightMode !== "idle" || !s.brightUntilMs) s.brightUntilMs = now + IDLE_BRIGHT_MS;
          const remaining = s.brightUntilMs - now;
          if (remaining <= 0) {
            result = resetPageBrightTime(); mode = "system"; s.brightUntilMs = 0;
          } else {
            // T-Rex 3: the five-minute value appears to be lost or capped after certain events
            // (pairing completes -> app destroyed about 62 seconds later). Reapply the REMAINING
            // TIME every 20 seconds without extending the absolute deadline.
            result = setPageBrightTime({ brightTime: Math.max(1000, remaining) });
          }
        } else {
          s.brightUntilMs = 0;
          result = resetPageBrightTime();
        }
        s.brightMode = mode;
        console.log("[pumpfoil] bright mode=" + mode + " result=" + result
          + " remaining=" + Math.max(0, s.brightUntilMs - Date.now()));
      } catch (e) {}
    },

    build() {
      const s = this.state, w = s.w;
      // Ist der letzte Lauf sauber zu Ende gekommen? Lesen, BEVOR wir unsere eigene Marke
      // setzen — sonst ueberschreiben wir genau die Auskunft, die wir holen wollen.
      const _offen = crashUebernehmen();
      s.crashPhase = _offen.phase;
      s.crashMem = _offen.mem;
      canaryWrite(PHASE_BOOT);
      // Sprache aus der letzten Sitzung (vom Server geliefert, s. connect()) — VOR dem ersten
      // Rendern setzen, damit die App auch offline/ungepairt gleich in der richtigen Sprache
      // startet. Leer/unbekannt -> Englisch.
      setLang(store.getItem("lang", ""));
      // Auf runden Geraeten gibt es die Status-Bar nicht, dort wirft der Aufruf -> abfangen.
      try { setStatusBarVisible(false); } catch (e) {}
      this._setBrightMode("idle", true);
      w.title = hmUI.createWidget(hmUI.widget.TEXT, { ...TITLE });
      w.page = hmUI.createWidget(hmUI.widget.TEXT, { ...PAGE });
      w.f = [
        [hmUI.createWidget(hmUI.widget.TEXT, { ...F0V }), hmUI.createWidget(hmUI.widget.TEXT, { ...F0L })],
        [hmUI.createWidget(hmUI.widget.TEXT, { ...F1V }), hmUI.createWidget(hmUI.widget.TEXT, { ...F1L })],
        [hmUI.createWidget(hmUI.widget.TEXT, { ...F2V }), hmUI.createWidget(hmUI.widget.TEXT, { ...F2L })],
      ];
      w.status = hmUI.createWidget(hmUI.widget.TEXT, { ...STATUS });
      // Position kommt aus dem Layout, NICHT aus TITLE.y + TITLE.h: auf eckigen Geraeten ist der
      // Titel leer und seine Box liegt im System-Balken (s. index.s.layout.js) — die Version haette
      // dann unter dem Balken geklebt und waere oben angeschnitten worden.
      w.ver = hmUI.createWidget(hmUI.widget.TEXT, { ...VER, text: "v" + APP_VERSION });

      // Alle Wisch-Gesten konsumieren (return true) → kein versehentliches Verlassen der App
      // (Zepp deutet den Horizontal-Wisch sonst als Zurück/Exit). Richtung egal: hoch=links (vor),
      // runter=rechts (zurück). Verlassen der App nur über die Hardware-Taste.
      // HARDWARE-TASTE (Nutzer-Meldung per Instagram, 2026-07-27): „Stoppen geht leider nur über wischen und
      // nicht über eine taste. Das funktioniert nicht wenn das display nass ist mit nassen Fingern."
      // Genau der Fall, für den es Tasten gibt — nass ist der Normalzustand beim Pumpfoilen. Deshalb
      // Recording controls remain usable in water: short UP/DOWN navigates, long SELECT stops and
      // saves, and long UP/DOWN temporarily unlocks touch. BACK is consumed while recording.
      // Zepp erlaubt nur EINE onKey-Registrierung — deshalb ein Callback für alle Tasten.
      try {
        onKey({
          callback: (key, event) => {
            // Alles hier drin abgesichert: der Tasten-Pfad ist auf echter Hardware UNGETESTET
            // (der Simulator hat keine Hardware-Tasten). Eine Ausnahme in diesem Callback würde
            // sonst die laufende Aufnahme mitnehmen — lieber tut die Taste nichts, als dass die
            // App abstürzt und die Session verloren geht.
            try {
            const long = (event === KEY_EVENT_LONG_PRESS);
            const click = (event === KEY_EVENT_CLICK);
            if (key === KEY_BACK) {
              if (s.recording) {
                if (long || click) { this._showTouchLock(); this._toStopScreen(); }
                return true;
              }
              return false;
            }
            // PRESS/RELEASE ignorieren (sonst doppelt) — aber WAEHREND DER AUFNAHME trotzdem
            // konsumieren, s. Begruendung unten.
            if (!long && !click) return s.recording;
            if (s.recording) {
              if (key === KEY_SELECT && long) { this.stop(); return true; }
              if ((key === KEY_UP || key === KEY_DOWN) && long) {
                this._unlockTouchTemporarily();
                return true;
              }
              // Kurzer Druck: im press-Modus beendet er die Aufnahme (Profil-Einstellung) —
              // sonst zeigt er nur den Touch-Sperr-Hinweis wie bisher. Das lange Halten bleibt
              // in BEIDEN Faellen erhalten, es faellt also kein Weg weg.
              if (key === KEY_SELECT && click) {
                if (s.stopMode === "press") { this.stop(); return true; }
                if (s.touchLocked) this._showTouchLock();
                this._toStopScreen();
                return true;
              }
              // JEDE andere Taste konsumieren statt sie ans System zu geben.
              //
              // Das war die Ursache der leeren Amazfit-Aufnahmen (Sam Barnes, Active 2 Round,
              // 13.09.2026): „if a button is pressed it exits the app straight away. Accidental
              // presses are quite easy." Hier stand `return false` — und ein `false` heisst bei
              // Zepp nicht „nichts tun", sondern „das System soll es behandeln", und das System
              // beendet die App. Mit ihr stirbt die laufende Aufnahme. Die Active 2 hat genau
              // EINE Taste, deren Code offenbar keiner unserer vier Konstanten entspricht; damit
              // fiel JEDER Druck in diesen Zweig.
              //
              // Im Bestand passte das Muster: 17 von 21 Amazfit-Aufnahmen hatten nur eine
              // Handvoll Datenpakete, Sam allein sechs Fehlversuche. Waehrend der Aufnahme gibt
              // es deshalb keinen Weg mehr, auf dem eine Taste die App verlassen kann —
              // beendet wird ueber langes SELECT (bzw. kurzes, wenn im Profil so eingestellt).
              if (!click || (key !== KEY_UP && key !== KEY_DOWN)) {
                if (s.touchLocked) this._showTouchLock();
                this._toStopScreen();
                return true;
              }
              if (s.touchLocked) this._showTouchLock();
              // Seitenzahl aus dem Ring des AKTUELLEN Zustands (on-foil/off-foil), nicht mehr aus
              // s.views — die Sätze sind unterschiedlich lang (s. _ring).
              const last = this._ringLen() + 1;
              this._cancelStopBack();   // er blaettert selbst -> nicht mehr automatisch zurueck
              if (key === KEY_UP) s.page = s.page <= 0 ? last : s.page - 1;
              else s.page = s.page >= last ? 0 : s.page + 1;
              this.applyButton(); this.renderRecording();
              return true;
            }
            if (s.screen === "summary") {
              if (key === KEY_SELECT) { this.done(); return true; }
              return false;
            }
            if (s.screen === "idle") {
              if (key === KEY_SELECT) {
                if (s.idlePage === 0) this.start();
                return true;
              }
              if (!click || (key !== KEY_UP && key !== KEY_DOWN)) return false;
              if (key === KEY_UP) s.idlePage = s.idlePage <= 0 ? 3 : s.idlePage - 1;
              else s.idlePage = s.idlePage >= 3 ? 0 : s.idlePage + 1;
              this.applyButton(); this.renderIdle();
              return true;
            }
            return false;
            // Auch im Fehlerfall waehrend der Aufnahme konsumieren: ein `false` wuerde die App
            // beenden und die Aufnahme mitnehmen. Der alte Kommentar sagte „lieber tut die Taste
            // nichts" — `return false` tat aber nicht nichts, sondern genau das Schlimmste.
            } catch (e) { return !!s.recording; }
          },
        });
      } catch (e) {}

      onGesture({
        callback: (e) => {
          if (s.recording && s.touchLocked) { this._showTouchLock(); return true; }
          const dir = (e === GESTURE_LEFT || e === GESTURE_UP) ? 1
                    : (e === GESTURE_RIGHT || e === GESTURE_DOWN) ? -1 : 0;
          // Unbekannte Geste waehrend der Aufnahme: konsumieren, nicht weiterreichen. Dasselbe
          // Loch wie beim Tasten-Callback — `false` heisst „System behandelt es", und das
          // beendet die App samt laufender Aufnahme (Sam Barnes, 13.09.2026: „it will close if
          // I swipe back").
          if (dir === 0) return !!s.recording;
          if (s.recording) {
            // Seiten: [STOPP] + Ring des Zustands + [STOPP] — beide Enden = Stop-Screen, kein Wrap.
            const last = this._ringLen() + 1;
            this._cancelStopBack();   // er wischt selbst -> nicht mehr automatisch zurueck
            s.page = Math.max(0, Math.min(last, s.page + dir));
            this.applyButton(); this.renderRecording();
            return true;
          }
          if (s.screen === "idle") {
            // Zurück-Wisch (rechts/runter): auf dem Start-Screen die App beenden — return false,
            // dann behandelt das System den Rechts-Wisch als App-Exit (Root-Seite). Sonst eine
            // Seite zurück. Vorwärts (links/hoch): eine Seite weiter. Kein Wrap.
            if (dir < 0) {
              if (s.idlePage === 0) return false;
              s.idlePage -= 1;
            } else {
              s.idlePage = Math.min(3, s.idlePage + 1);
            }
            this.applyButton(); this.renderIdle();
            // Verbindungs-Seite, NUR bei noch nie gepairter Uhr (kein Token): Code erzeugen (falls
            // keiner da) bzw. Poll wieder aufnehmen (nach Zurückwischen). Bereits gepairt -> Button.
            if (s.idlePage === 1 && !getTok() && bleOk()) {
              if (!s.code) this.beginPairing();
              else if (!s.pollTimer) this.startPoll();
            }
            // Beim Verlassen der Verbindungs-Seite den Poll stoppen.
            if (s.idlePage > 1 && s.pollTimer) { clearTimeout(s.pollTimer); s.pollTimer = null; }
            return true;
          }
          return true;
        },
      });

      this.recoverActive();   // unbeendete Aufnahme aus letztem Lauf in die Queue übernehmen
      canaryWrite(PHASE_IDLE);   // die gefaehrliche Startphase ist ueberstanden

      try {
        s.geo = new Geolocation();
        s.geo.start();
        // RUECKRUF ZUSAETZLICH ZUM TAKT (22.09.2026). Unsere Abtastung laeuft mit 1 Hz und
        // verwirft jede Sekunde, in der `getStatus()` gerade nicht „A" sagt. Gemessen an neun
        // Aufnahmen ueber fuenf Minuten (fuenf Modelle, vier Nutzer) kostet das 48 bis 87 % der
        // Aufnahmezeit: GPS liefert im Median nur VIER Sekunden am Stueck, dann 22 Sekunden
        // nichts. Zum Vergleich kommen Garmin auf 0,84 und Apple auf 0,86 Punkte je Sekunde,
        // Amazfit auf 0,23 — und nie besser als 0,52.
        //
        // Das offizielle Beispiel der Zepp-Doku benutzt `onChange` und prueft den Status DARIN.
        // Wir fragten stattdessen im festen Takt ab und trafen den Sensor dabei offenbar oft
        // zwischen zwei Aktualisierungen an. Der Rueckruf haelt die zuletzt GUELTIGE Position
        // fest; die Abtastung unten greift darauf zurueck, wenn ihr eigener Blick nichts ergibt.
        //
        // ES KANN NICHTS ERFINDEN: benutzt wird der Zwischenspeicher nur, wenn er juenger als
        // GEO_CACHE_MS ist. Schweigt die Ortung wirklich, bleibt die Luecke eine Luecke — das
        // soll sie auch, sonst malen wir eine Spur, die niemand gefahren ist.
        s.geoCallback = () => {
          try {
            if (s.geo.getStatus && s.geo.getStatus() !== "A") return;
            const la = s.geo.getLatitude(), lo = s.geo.getLongitude();
            if (la != null && lo != null) s.geoLast = [la, lo, Date.now()];
          } catch (e) {}
        };
        if (s.geo.onChange) s.geo.onChange(s.geoCallback);
      } catch (e) {}
      // Zepp's getCurrent() is valid only inside an onCurrentChange callback. Registering the
      // callback also starts continuous heart-rate measurement (API 2.1+).
      try {
        s.hrSensor = new HeartRate();
        s.hrCallback = () => {
          try {
            const value = s.hrSensor.getCurrent() || 0;
            if (value > 0) {
              s.hr = value; s.hrUpdatedMs = Date.now();
              if (!s._hrLogged) { s._hrLogged = true; console.log("[pumpfoil] heart-rate active"); }
            }
          } catch (e) {}
        };
        s.hrSensor.onCurrentChange(s.hrCallback);
      } catch (e) { s.hrSensor = null; s.hrCallback = null; }
      s.timer = setInterval(() => this.sample(), 1000 / GPS_HZ);
      s.hbTimer = setInterval(() => this.heartbeat(), 20000);

      if (getTok()) s.paired = true;
      // Layout-Wahl von der letzten Sitzung wiederherstellen ("" = automatisch).
      const lp = store.getItem("layoutsPref", "");
      s.layoutsPref = lp === "1" ? true : (lp === "0" ? false : null);
      const tl = store.getItem("touchLockPref", "");
      s.touchLockPref = tl === "1" ? true : (tl === "0" ? false : null);
      // Local-first: App startet ganz normal auf dem START-Screen (auch ungepaart aufnehmbar).
      // Ungepaart wird der Pairing-Code SOFORT erzeugt und direkt auf dem Start-Screen gezeigt
      // (Els Feldtest: der Code auf Seite 2/4 war nicht auffindbar). Der Poll laeuft auf den
      // Seiten 1+2, solange nicht aufgenommen wird.
      this.applyButton();
      this.renderIdle();
      this.connect();
      if (!getTok() && bleOk()) this.beginPairing();
    },

    // ---- Verbindung / Pairing (Hintergrund) ----
    connect() {
      const s = this.state;
      if (!bleOk()) { this.rerender(); return; }
      if (!getTok()) { this.rerender(); return; }   // kein Auto-Pairing — nur per Button t("pair.gen")
      // Version melden (Update-Hinweis) und Layouts anfordern, solange der Nutzer sie nicht
      // abgeschaltet hat. layoutsPref: null = automatisch (Server entscheidet), true/false = Wahl
      // auf der Uhr -- dieselbe Dreistufigkeit wie bei Garmin.
      // `crash`: Phase des LETZTEN Laufs, wenn er nicht sauber endete (s. Lauf-Waechter oben).
      // Nur einmal melden — danach auf 0, sonst zaehlt der Server denselben Absturz bei jedem
      // Heartbeat erneut.
      const crash = s.crashPhase || 0;
      // Speicher: beim ersten Abruf nach einem Absturz der Stand VON DAMALS — er beantwortet die
      // Frage, wie nah die App dran war. Sonst der aktuelle Hoechststand dieses Laufs; der
      // Server behaelt ohnehin nur das Maximum.
      const mem = (crash && s.crashMem) || memRead();
      this.reqQ({ method: "CONFIG", token: getTok(), version: APP_VERSION, model: DEVICE_MODEL,
                  crash: crash, mem: mem && mem.peak, memtot: mem && mem.total,
                  wantLayouts: s.layoutsPref !== false }).then((r) => {
        // ERST HIER loeschen, nicht beim Lesen: der Server hat geantwortet, die Auskunft ist
        // angekommen. Scheitert der Abruf, bleibt sie liegen und geht beim naechsten Versuch raus
        // — auch ueber einen App-Neustart hinweg.
        if (crash) { s.crashPhase = 0; s.crashMem = null; crashGemeldet(); }
        if (r && r.revoked) { store.setItem("deviceToken", ""); s.paired = false; this.beginPairing(); return; }
        // Update-Hinweis: neuere Version im Store als die hier laufende -> kurz anzeigen.
        if (r && r.latestVersion && istNeuer(r.latestVersion, APP_VERSION)) s.updateVersion = r.latestVersion;
        // Profil-Sprache (kam schon immer mit, wurde nur nie ausgewertet). Persistieren, damit der
        // naechste App-Start auch ohne Verbindung sofort richtig lokalisiert ist. Server schickt ""
        // wenn im Profil keine Sprache steht -> setLang() faellt dann auf Englisch.
        if (r && typeof r.language !== "undefined") { store.setItem("lang", r.language || ""); setLang(r.language); }
        if (r && typeof r.layoutsOn !== "undefined") s.layoutsServerDefault = !!r.layoutsOn;
        if (r && typeof r.waterLock === "string" && r.waterLock) s.waterLockServer = r.waterLock;
        if (r && Array.isArray(r.views) && r.views.length) s.views = r.views;
        if (r && Array.isArray(r.offFoilView) && r.offFoilView.length) s.offFoil = r.offFoilView;
        if (r && typeof r.autoStart !== "undefined") s.autoStart = !!r.autoStart;
        // Profil-Einstellung: "hold" (Default) = SELECT lang halten, "press" = kurzer Druck
        // genuegt. Gilt fuer alle Uhren des Nutzers (kein Geraete-Override).
        if (r && typeof r.stopMode !== "undefined") s.stopMode = r.stopMode || "hold";
        // Seiten-Sätze (F3). Der Server liefert getaggte Listen INLINE — es gibt keine Layout-IDs
        // und kein `layouts`-Wörterbuch (server/app/api/devices.py:_layouts_for_watch):
        //   [0,a,b,c]         klassische Seite mit drei Feld-IDs
        //   [1,bg,[elemente]] eigenes Layout, Hintergrund + Elemente inline
        // `pausePages` wird BEWUSST nicht gelesen: die Zepp-App hat kein manuelles Pausieren
        // (Taste halten = Stopp), der Zustand kann also nie eintreten.
        if (r && Array.isArray(r.pages) && r.pages.length) s.pages = r.pages;
        if (r && Array.isArray(r.offFoilPages) && r.offFoilPages.length) s.offFoilPages = r.offFoilPages;
        if (r && typeof r.browseAll !== "undefined") s.browseAll = !!r.browseAll;
        // Wert-Skalen der Layout-Grafiken (Puls-Zonen + Geschwindigkeitsspanne aus dem Profil).
        if (r && Array.isArray(r.hrZones) && r.hrZones.length === 6) laySkala.hrZones = r.hrZones;
        if (r && Array.isArray(r.speedZones) && r.speedZones.length === 6) {
          laySkala.speedZones = r.speedZones;
        }
        // Ring + gezeichnete Layout-Widgets neu aufbauen lassen (Inhalt kann sich geändert haben).
        s._ringKey = null; s.w.layKey = null;
        // Foil-/Alarm-Config übernehmen; Default-Auswahl einmalig (bis App-Ende).
        if (r && Array.isArray(r.foils)) s.foils = r.foils.map((f) => ({ id: f.id, label: f.label, min: f.min, max: f.max }));
        if (r) { s.almLow = r.speedLow || 0; s.almHigh = r.speedHigh || 0; }
        if (r) {
          // Puls-Grenze, Muster und Wiederholung. Die Vorgaben stehen im Zustand, ein
          // fehlender Schluessel (aelterer Server) aendert also nichts.
          if (typeof r.hrHigh === "number") s.almHrHigh = r.hrHigh;
          if (r.alarmPatternHigh) s.almPatHigh = r.alarmPatternHigh;
          if (r.alarmPatternLow) s.almPatLow = r.alarmPatternLow;
          if (r.alarmPatternHr) s.almPatHr = r.alarmPatternHr;
          if (r.alarmRepeat) s.almRepeat = r.alarmRepeat;
          if (typeof r.alarmRepeatS === "number") s.almRepeatS = r.alarmRepeatS;
          if (typeof r.runDistM === "number") s.runDistM = r.runDistM;
          if (r.runDistMode) s.runDistMode = r.runDistMode;
          if (r.alarmPatternDist) s.almPatDist = r.alarmPatternDist;
          if (typeof r.runTimeS === "number") s.runTimeS = r.runTimeS;
          if (r.runTimeMode) s.runTimeMode = r.runTimeMode;
          if (r.alarmPatternTime) s.almPatTime = r.alarmPatternTime;
          // Aufzeichnungsmodus NUR merken — er wirkt beim naechsten START der Aufnahme
          // (`_startAccel`), nicht mitten in einer laufenden. Der Aufnahmeweg ist der
          // gefaehrlichere, dort wird nichts umgeschaltet, waehrend er schreibt.
          if (r.recordMode === "full" || r.recordMode === "lite" || r.recordMode === "gps") {
            s.recordMode = r.recordMode;
          }
        }
        if (r && !s._foilInit) {
          s._foilInit = true;
          s.almOn = !!r.alarmEnabled;
          // Foil und Schwellen-Quelle sind ZWEI DINGE (bis 18.09.2026 verkoppelt, wie auf Garmin
          // bis 10.09.): wer im Profil feste Schwellen waehlt, faehrt trotzdem seine Foil. Vorher
          // stand hier „kein Foil", waehrend der Server beim Upload den Profil-Standard einsetzte.
          // Foil also IMMER vorwaehlen (der Server sortiert den Standard nach vorne), nur almSrc
          // folgt der Profil-Vorwahl.
          if (s.foils.length) { s.foilId = s.foils[0].id; s.foilLabel = s.foils[0].label; }
          else { s.foilId = null; s.foilLabel = "—"; }
          s.almSrc = ((r.alarmDefault || "foil") === "foil" && s.foils.length) ? "foil" : "manual";
        }
        s.paired = true;
        if (s.brightMode === "idle") this._setBrightMode("idle");
        this.applyButton(); this.rerender();
        this.flushPending();
      }).catch(() => { this.applyButton(); this.rerender(); this.flushPending(); });
    },
    // Pairing/Poll: DIREKTER this.request (ein Request pro Aufruf). Kein call()-Retry — der würde
    // Folge-Requests feuern, die im Sim keine Antwort bekommen; der einzelne Request lief zuverlässig.
    beginPairing() {
      const s = this.state;
      s.paired = false;
      this._setBrightMode("idle", true);
      this.reqQ({ method: "PAIR_INIT", model: DEVICE_MODEL }).then((r) => {
        if (!r || !r.code) { this.rerender(); return; }
        s.code = r.code; store.setItem("claimToken", r.claim_token || ""); this.applyButton(); this.rerender(); this.startPoll();
      }).catch(() => this.rerender());
    },
    startPoll() {
      const s = this.state;
      if (s.pollTimer) { clearTimeout(s.pollTimer); s.pollTimer = null; }
      const tick = () => {
        // Nur pollen, solange die Verbindungs-Seite offen ist (nicht gepairt, keine Aufnahme).
        if (s.paired || s.recording || s.idlePage > 1) { s.pollTimer = null; return; }
        this.reqQ({ method: "PAIR_POLL", claimToken: getClaim() }).then((r) => {
          if (r && r.paired && r.device_token) {
            store.setItem("deviceToken", r.device_token); store.setItem("claimToken", "");
            s.pollTimer = null; s.paired = true; s.code = "";
            this._setBrightMode("idle", true);
            this.connect();
            return;
          }
          s.pollTimer = setTimeout(tick, 3000);
        }).catch(() => { s.pollTimer = setTimeout(tick, 3000); });
      };
      s.pollTimer = setTimeout(tick, 500);
    },
    // Hintergrund-Reconnect: alle 20s (außer Aufnahme) neu verbinden/Config holen + Queue senden.
    heartbeat() {
      const s = this.state;
      if (s.recording) {
        // BILDSCHIRMZEIT AUCH WAEHREND DER AUFNAHME AUFFRISCHEN (u352, GTR 4, 21.09.2026:
        // „Nach circa 4,5 Minuten kommt dann das Ziffernblatt und anschliessend, wenn ich die
        // App wieder reinwill, ist sie beendet.").
        //
        // Beim Start setzen wir sie auf RECORDING_BRIGHT_MS (~24 Tage) — einmal. Dass dieser
        // Wert verlorengeht oder gekappt wird, wissen wir seit dem T-Rex-3-Feldtest; genau
        // deshalb frischt der LEERLAUF-Pfad unten alle 20 s nach (s. Kommentar in
        // `_setBrightMode`). Der Aufnahme-Pfad hat dieselbe Behandlung nie bekommen, weil diese
        // Funktion vorher in der ersten Zeile ausgestiegen ist — und dann schaltet der
        // Bildschirm ab und Zepp raeumt die App rund 10 Sekunden spaeter weg.
        //
        // Nur das Auffrischen, sonst nichts: Verbinden und Senden bleiben waehrend der Aufnahme
        // aus, damit die BLE-Warteschlange dem Upload-Worker gehoert.
        this._setBrightMode("recording");
        return;
      }
      if (s.brightMode === "idle") this._setBrightMode("idle");
      // Do not enqueue CONFIG requests while the single upload worker owns the BLE request queue.
      if (s.uploading) return;
      if (!bleOk()) { this.rerender(); return; }
      if (getTok()) this.connect();
      // Kein Auto-Pairing im Hintergrund — Pairing/Poll passiert nur auf der Verbindungs-Seite.
    },

    // ---- Fortschrittsbalken (oben) ----
    showBar(pct) {
      const w = this.state.w;
      if (!w.barBg) w.barBg = hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 0, y: px(2), w: DW, h: px(6), color: 0x334155 });
      const width = Math.max(px(2), Math.round(DW * Math.min(100, Math.max(0, pct)) / 100));
      if (!w.barFill) w.barFill = hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 0, y: px(2), w: width, h: px(6), color: 0x22d3ee });
      else w.barFill.setProperty(hmUI.prop.MORE, { x: 0, y: px(2), w: width, h: px(6), color: 0x22d3ee });
    },
    hideBar() {
      const w = this.state.w;
      if (w.barFill) { hmUI.deleteWidget(w.barFill); w.barFill = null; }
      if (w.barBg) { hmUI.deleteWidget(w.barBg); w.barBg = null; }
    },

    // ---- Button pro Screen/Seite ----
    setButton(text, nc, pc, ink, fn) { const w = this.state.w; if (w.btn) hmUI.deleteWidget(w.btn); w.btn = hmUI.createWidget(hmUI.widget.BUTTON, { ...BUTTON, text, normal_color: nc, press_color: pc, color: ink, click_func: fn }); },
    hideButton() { const w = this.state.w; if (w.btn) { hmUI.deleteWidget(w.btn); w.btn = null; } },
    /** Auf den Stopp-Bildschirm springen (Seite 0 des Aufnahme-Rings).
     *
     *  So verhalten sich die eingebauten Zepp-Aktivitaeten: ein Tastendruck waehrend der Aufnahme
     *  zeigt die Stopp-Auswahl, statt stumm nichts zu tun. Vorgeschlagen von Sam Barnes am
     *  13.09.2026 („On other activities when you press a button it gives a menu with stop, pause,
     *  resume. Which helps avoid accidently ending the recording."), Entscheidung Jan am selben
     *  Tag: wenn es Zepp-ueblich ist, genau so.
     *
     *  Wichtig ist der Unterschied zu vorher: der Druck BEENDET nichts, er macht nur sichtbar,
     *  wo das Beenden liegt. Ein Fehlgriff ist damit folgenlos UND erkennbar — vorher beendete er
     *  die ganze App samt Aufnahme, und danach (nach dem Fix von heute) tat er sichtbar gar
     *  nichts, was genauso ratlos macht.
     */
    _toStopScreen() {
      const s = this.state;
      if (!s.recording || s.page === 0) return;
      s.stopBackPage = s.page;
      s.page = 0;
      this.applyButton();
      this.renderRecording();
      // Nach STOP_AUTOBACK_MS von selbst zurueck auf die Seite, die vorher zu sehen war
      // (Vorgabe Jan, 13.09.2026). Ohne das bliebe ein Fehlgriff den Rest der Fahrt stehen: man
      // faehrt weiter und schaut auf den Stopp-Bildschirm statt auf Tempo und Puls — mit nassen
      // Fingern und aktiver Wassersperre kommt man da nicht ohne Weiteres wieder weg.
      // Die Aufnahme laeuft dabei durchgehend; diese Seite ist nur eine Ansicht.
      this._cancelStopBack();
      s.stopBackTimer = setTimeout(() => {
        s.stopBackTimer = null;
        // Nur zurueck, wenn seither NICHTS passiert ist: noch am Aufnehmen und noch auf Seite 0.
        // Hat der Mensch inzwischen selbst geblaettert, hat er entschieden — dann nicht
        // hineinregieren.
        if (!s.recording || s.page !== 0) return;
        s.page = Math.max(0, Math.min(this._ringLen() + 1, s.stopBackPage));
        this.applyButton();
        this.renderRecording();
      }, STOP_AUTOBACK_MS);
    },

    /** Die Rueckkehr abbestellen — sobald der Mensch selbst blaettert oder stoppt. */
    _cancelStopBack() {
      const s = this.state;
      if (s.stopBackTimer) { clearTimeout(s.stopBackTimer); s.stopBackTimer = null; }
    },

    _showTouchLock() {
      const s = this.state, w = s.w;
      if (!s.recording || !s.touchLocked || !w.touchShield) return;
      if (s.lockTimer) { clearTimeout(s.lockTimer); s.lockTimer = null; }
      // Kein Emoji (Projektregel: keine Standard-Emojis in der UI) und keine reine Grafik: ein
      // Schloss allein sagt nicht, wie man weiterkommt. Zwei Zeilen auf deckendem Grund -- was
      // los ist, und der Ausweg, zusammengesetzt aus vorhandenen Keys.
      if (!w.lockIcon) {
        // Deckende Flaeche AUF DEN CANVAS gezeichnet, NICHT als eigenes Widget.
        //
        // Erst war es ein FILL_RECT im Schild — damit lag ein Widget UEBER w.touchCanvas, und
        // das ist der Empfaenger von CLICK_DOWN/CLICK_UP: das 2-s-Halten zum Entsperren ging
        // nicht mehr (Jan, 10.09.2026: "dafuer funktioniert 2s hold nicht mehr zum unlocken").
        // Gezeichnet statt gestapelt aendert die Trefferpruefung nicht — der Canvas bleibt das
        // oberste bedienbare Element im Schild.
        //
        // Warum es die Flaeche braucht: das Schild ist absichtlich transparent (es soll waehrend
        // der ganzen Fahrt nur Wasser-Tipper abfangen, nicht die Messwerte verdecken), also
        // standen die Sperr-Texte sonst AUF der laufenden Anzeige.
        try {
          w.lockCanvas.drawPoly({
            data_array: [{ x: 0, y: 0 }, { x: DW, y: 0 }, { x: DW, y: DH }, { x: 0, y: DH }],
            color: 0x000000,
          });
        } catch (e) { console.log("[pumpfoil] lock backdrop failed " + ((e && e.message) || "?")); }
        w.lockIcon = w.touchShield.createWidget(hmUI.widget.TEXT, {
          x: 0, y: Math.round(DH * 0.38), w: DW, h: Math.round(DH * 0.12),
          text: t("menu.touchLock"), text_size: Math.round(DH * 0.075), color: WHITE,
          align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
        });
        w.lockHint = w.touchShield.createWidget(hmUI.widget.TEXT, {
          x: 0, y: Math.round(DH * 0.50), w: DW, h: Math.round(DH * 0.10),
          // Der Ausweg aus der SPERRE, nicht der aus der Aufnahme (Jan, 10.09.2026: "nicht
          // 'HOLD = STOP' sondern 'HOLD = UNLOCK'"). Hier stand vorher btn.stop — auf einem
          // Sperrschirm, dessen zweite Zeile das Entsperren erklaert, war das widerspruechlich.
          // Eine Aussage statt zwei: die Dauer steht hier, die frueher zweite Zeile
          // (rec.holdFree, "2 s halten = Touch frei") sagte fast dasselbe und ist raus
          // (Jan, 10.09.2026). Zusammengesetzt aus vorhandenen Schluesseln, damit keine
          // 17 neuen Uebersetzungen noetig sind — laengste Fassung ist Franzoesisch
          // "2 s Maintenir = DÉVERROUILLER" mit 29 Zeichen und passt bei 26 px auf
          // volle Breite in der Bildschirmmitte.
          text: "2 s " + t("rec.stopHold") + " = " + t("btn.unlock"),
          text_size: Math.round(DH * 0.055),
          color: 0x9aa4b2, align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
        });
        // JE EINZELN abfangen. Vorher standen alle in EINEM try: das erste, das wirft,
        // nahm die anderen mit — und ein nicht abgeschaltetes Text-Widget schluckt die
        // Druck-Ereignisse, die den Canvas erreichen muessen.
        try { w.lockIcon.setEnable(false); } catch (e) {}
        try { w.lockHint.setEnable(false); } catch (e) {}
      }
      // Solange der Finger noch liegt (lockHoldTimer laeuft), NICHT abraeumen — sondern
      // spaeter nochmal nachsehen. Widgets unter dem Finger zu loeschen bricht die Beruehrung
      // ab und nimmt damit das 2-s-Entsperren mit.
      const aufraeumen = () => {
        if (s.lockHoldTimer) { s.lockTimer = setTimeout(aufraeumen, 400); return; }
        try { if (w.lockIcon) hmUI.deleteWidget(w.lockIcon); } catch (e) {}
        try { if (w.lockHint) hmUI.deleteWidget(w.lockHint); } catch (e) {}
        try { if (w.lockCanvas) w.lockCanvas.clear({ x: 0, y: 0, w: DW, h: DH }); } catch (e) {}
        w.lockIcon = null; w.lockHint = null; s.lockTimer = null;
      };
      s.lockTimer = setTimeout(aufraeumen, 1200);
    },
    // Automatisch = nur ab 3 Tasten (Begruendung an KEY_NUMBER), sonst die Wahl aus dem Menue.
    // Automatisch = erst der Server-Wert, und nur bei "auto" die Tastenzahl. Ab drei Tasten,
    // weil man sich auf einer Uhr mit zweien sonst aussperrt. Eine Wahl im Uhr-Menue
    // (touchLockPref) schlaegt beides und ueberlebt den App-Start.
    _useTouchLock() {
      const s = this.state;
      if (s.touchLockPref !== null) return !!s.touchLockPref;
      if (s.waterLockServer === "on") return true;
      if (s.waterLockServer === "off") return false;
      return KEY_NUMBER >= 3;
    },
    _lockTouch() {
      const s = this.state, w = s.w;
      if (!s.recording || !this._useTouchLock()) return;
      if (s.unlockTimer) { clearTimeout(s.unlockTimer); s.unlockTimer = null; }
      s.touchLocked = true;
      if (w.touchShield) return;
      console.log("[pumpfoil] touch locked");
      // A transparent modal container stays above the recording widgets and absorbs water taps.
      w.touchShield = hmUI.createWidget(hmUI.widget.VIEW_CONTAINER, {
        x: 0, y: 0, w: DW, h: DH, z_index: 6, modal: 1, scroll_enable: 0,
      });
      // ZWEI Canvas: unten die Flaeche fuer die Sperr-Meldung, darueber der, der die
      // Druck-Ereignisse bekommt. Getrennt, weil Zeichnen und Loeschen auf dem
      // EREIGNIS-Canvas die laufende Beruehrung abbricht — dann feuert CLICK_UP, der
      // Halte-Timer wird geloescht und das 2-s-Entsperren kommt nie an (Jan, 10.09.2026:
      // "das overlay verschwindet einfach aber touch-lock bleibt aktiv"). Ein leerer
      // Canvas ist durchsichtig, die Messwerte bleiben also sichtbar.
      w.lockCanvas = w.touchShield.createWidget(hmUI.widget.CANVAS, { x: 0, y: 0, w: DW, h: DH });
      // DAUERHAFTE Zustandsanzeige, schmal am unteren Rand.
      //
      // Bis 18.09.2026 gab es hier gar keine: die Sperre war unsichtbar, bis man die Uhr
      // beruehrte — dann erschien fuer 1,2 s die Meldung und verschwand wieder. Wer die Uhr nur
      // ansah, konnte nicht wissen, ob gesperrt ist. Auf Wear OS zeigt dafuer seit heute ein
      // Schloss an der Stelle des Wassertropfens; hier gibt es keinen Tropfen (die Sperre kommt
      // aus dem Menue), deshalb eine Zeile mit dem vorhandenen, uebersetzten Text — kein Emoji
      // (Projektregel) und keine 17 neuen Uebersetzungen.
      //
      // VOR den Ereignis-Canvas angelegt und mit setEnable(false): ein bedienbares Widget
      // darueber wuerde die Druck-Ereignisse schlucken, die das 2-s-Entsperren braucht (genau
      // der Fehler vom 10.09.2026, s. Kommentar unten).
      try {
        w.lockMark = w.touchShield.createWidget(hmUI.widget.TEXT, {
          x: 0, y: Math.round(DH * 0.88), w: DW, h: Math.round(DH * 0.09),
          text: t("menu.touchLock"), text_size: Math.round(DH * 0.05),
          color: 0x9aa4b2, align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
        });
        w.lockMark.setEnable(false);
      } catch (e) { w.lockMark = null; }
      w.touchCanvas = w.touchShield.createWidget(hmUI.widget.CANVAS, { x: 0, y: 0, w: DW, h: DH });
      // Kurzer Tipper = nur der Hinweis. LANGES Druecken (2 s) gibt Touch frei — dieselbe Geste,
      // die auch UP/DOWN lang macht.
      //
      // Warum das noetig ist: die Sperre nimmt einem die Bedienung weg und gab sie NUR ueber die
      // Hardware-Tasten zurueck. Wer keine erreicht — im Simulator gibt es keine anklickbaren, mit
      // dicken Handschuhen trifft man sie schlecht — sass in der Aufnahme fest.
      // Bewusst KEINE Simulator-Erkennung: der einzige Marker waere „development build", und den
      // trägt auch ein `zeus preview` auf der ECHTEN Uhr — die Sperre waere damit ausgerechnet im
      // nassen Feldtest aus, fuer den es sie gibt. Zwei Sekunden gehaltener Druck kommt von Wasser
      // nicht, das ist derselbe Gedanke wie beim langen Druecken zum Stoppen.
      w.touchCanvas.addEventListener(hmUI.event.CLICK_DOWN, () => {
        this._showTouchLock();
        if (s.lockHoldTimer) clearTimeout(s.lockHoldTimer);
        s.lockHoldTimer = setTimeout(() => {
          s.lockHoldTimer = null;
          if (s.touchLocked) {
            console.log("[pumpfoil] touch unlock by long press");
            this._unlockTouchTemporarily();
          }
        }, 2000);
      });
      w.touchCanvas.addEventListener(hmUI.event.CLICK_UP, () => {
        if (s.lockHoldTimer) { clearTimeout(s.lockHoldTimer); s.lockHoldTimer = null; }
      });
    },
    _removeTouchShield() {
      const s = this.state, w = s.w;
      if (s.lockTimer) { clearTimeout(s.lockTimer); s.lockTimer = null; }
      if (s.lockHoldTimer) { clearTimeout(s.lockHoldTimer); s.lockHoldTimer = null; }
      try { if (w.touchShield) hmUI.deleteWidget(w.touchShield); } catch (e) {}
      // `lockMark` haengt IM Schild, wird also mit ihm geloescht — den Zeiger trotzdem nullen,
      // sonst verweist er auf ein weggeraeumtes Widget.
      w.touchShield = null; w.touchCanvas = null; w.lockCanvas = null; w.lockIcon = null;
      w.lockHint = null; w.lockMark = null;
    },
    _unlockTouchTemporarily() {
      const s = this.state;
      if (!s.recording) return;
      s.touchLocked = false;
      this._removeTouchShield();
      console.log("[pumpfoil] touch unlocked for 10s");
      if (s.unlockTimer) clearTimeout(s.unlockTimer);
      s.unlockTimer = setTimeout(() => {
        s.unlockTimer = null;
        if (s.recording) { this._lockTouch(); this._showTouchLock(); }
      }, 10000);
    },
    _disableTouchLock() {
      const s = this.state;
      s.touchLocked = false;
      if (s.unlockTimer) { clearTimeout(s.unlockTimer); s.unlockTimer = null; }
      this._removeTouchShield();
    },
    /**
     * Warum der Start-Knopf gerade nicht geht — fuer vier Sekunden in die Statuszeile.
     *
     * Er war bisher ausgegraut MIT LEEREM HANDLER: tippen tat nichts, und nichts erklaerte es.
     * Genau so liest sich das als kaputte App. Anlass ist u352 am 21.09.2026, der nach einem
     * Neustart der App meldete „beim zweiten Start kommt auch kein Start bzw. Stop mehr" —
     * der Knopf war da, nur grau und stumm. Welcher der beiden Gruende es war, liesse sich am
     * Bildschirm jetzt ablesen.
     *
     * Dieselbe Linie wie „Berechtigungen nie stumm scheitern": ein Ergebnis, das der Nutzer
     * nicht sieht, ist kein Ergebnis.
     */
    _warumKeinStart() {
      const s = this.state;
      s.idleHint = s.uploading ? t("up.running") : t("gps.searching");
      if (s.idleHintTimer) { try { clearTimeout(s.idleHintTimer); } catch (e) {} }
      s.idleHintTimer = setTimeout(() => {
        s.idleHint = ""; s.idleHintTimer = null;
        try { this.renderIdle(); } catch (e) {}
      }, 4000);
      this.renderIdle();
    },

    applyButton() {
      const s = this.state;
      if (s.recording) {
        if (s.page === 0 || s.page >= this._ringLen() + 1) this.setButton(t("btn.stop"), RED, RED_P, WHITE, () => this.stop());
        else this.hideButton();
      } else if (s.screen === "summary") {
        this.setButton(t("common.done"), CYAN, CYAN_P, INK, () => this.done());
      } else if (s.idlePage === 0) {
        if (s.fix && !s.uploading) this.setButton(t("btn.start"), GPS_READY, GPS_READY_P, INK, () => this.start());
        else this.setButton(t("btn.start"), GPS_WAIT, GPS_WAIT_P, MUTED, () => this._warumKeinStart());
      } else if (s.idlePage === 1) {
        if (s.paired) this.setButton(t("rec.repair"), CYAN, CYAN_P, INK, () => this.repair());
        else this.setButton(t("pair.gen"), CYAN, CYAN_P, INK, () => this.beginPairing());
      } else if (s.idlePage === 2 && loadPending().length && getTok()) {
        this.setButton(t("rec.uploadNow"), CYAN, CYAN_P, INK, () => this.flushPending());
      } else this.hideButton();
    },

    // ---- Rendering ----
    rerender() { const s = this.state; if (s.recording) this.renderRecording(); else if (s.screen === "summary") this.renderSummary(); else this.renderIdle(); },
    fieldPair(id) { if (!id || id === 0) return ["", ""]; return this.fieldValue(id); },
    setSlots(a, b, c) { this.hideBig(); const w = this.state.w, arr = [a, b, c]; for (let i = 0; i < 3; i++) { w.f[i][0].setProperty(hmUI.prop.TEXT, arr[i][0]); w.f[i][1].setProperty(hmUI.prop.TEXT, arr[i][1]); } },
    // Großes, zentriertes Einzelfeld (wenn eine Datenseite nur 1 Feld hat).
    showBig(v, l) {
      const w = this.state.w;
      if (!w.bigV) w.bigV = hmUI.createWidget(hmUI.widget.TEXT, { x: 0, y: Math.round(DH * 0.30), w: DW, h: Math.round(DH * 0.26), color: 0x22d3ee, text_size: Math.round(DH * 0.19), align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V, text: "" });
      if (!w.bigL) w.bigL = hmUI.createWidget(hmUI.widget.TEXT, { x: 0, y: Math.round(DH * 0.57), w: DW, h: Math.round(DH * 0.09), color: 0x9aa4b2, text_size: Math.round(DH * 0.06), align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V, text: "" });
      w.bigV.setProperty(hmUI.prop.TEXT, v); w.bigL.setProperty(hmUI.prop.TEXT, l);
    },
    hideBig() { const w = this.state.w; if (w.bigV) { hmUI.deleteWidget(w.bigV); w.bigV = null; } if (w.bigL) { hmUI.deleteWidget(w.bigL); w.bigL = null; } },
    // Datenseite rendern: 1 Feld -> groß & mittig; sonst bis zu 3 Slots.
    renderFields(ids) {
      const w = this.state.w;
      const f = (ids || []).filter((id) => id && id !== 0).slice(0, 3);
      if (f.length === 1) {
        for (let i = 0; i < 3; i++) { w.f[i][0].setProperty(hmUI.prop.TEXT, ""); w.f[i][1].setProperty(hmUI.prop.TEXT, ""); }
        const [v, l] = this.fieldValue(f[0]); this.showBig(v, l); return;
      }
      this.hideBig();
      for (let i = 0; i < 3; i++) {
        if (i < f.length) { const [v, l] = this.fieldValue(f[i]); w.f[i][0].setProperty(hmUI.prop.TEXT, v); w.f[i][1].setProperty(hmUI.prop.TEXT, l); }
        else { w.f[i][0].setProperty(hmUI.prop.TEXT, ""); w.f[i][1].setProperty(hmUI.prop.TEXT, ""); }
      }
    },
    // Update-Hinweis (Audit-Rückstand): im vorhandenen Versions-Widget, bewusst OHNE Worte —
    // "v1.0.3 → 1.0.4" braucht keine Übersetzung und passt in die schmale Zeile.
    _verText() {
      const s = this.state, w = s.w;
      if (!w.ver) return;
      w.ver.setProperty(hmUI.prop.MORE, {
        text: s.updateVersion ? "v" + APP_VERSION + " → " + s.updateVersion : "v" + APP_VERSION,
        color: s.updateVersion ? 0x22d3ee : 0x64748b,
      });
    },
    renderIdle() {
      const s = this.state, w = s.w;
      this._clearFoilBtns();   // Foil-Seite: Buttons nur dort, sonst wegräumen
      this._clearLayout();
      this._verText();
      w.page.setProperty(hmUI.prop.TEXT, (s.idlePage + 1) + "/4");
      const gps = s.fix ? "GPS ●" : t("gps.searching");
      const conn = !bleOk() ? t("up.noPhone") : (s.paired ? t("menu.connected") + " ✓" : t("up.waiting"));
      if (s.idlePage === 0) {
        this.renderFields(s.offFoil);
        // Der Alarm-Hinweis war ein Glocken-Emoji — Standard-Emojis sind in der UI verboten
        // (Projektregel), also das lokalisierte Wort. "→ Verbinden" statt "wische weiter":
        // der Pfeil braucht keine Uebersetzung.
        // Ungepairt steht der CODE direkt hier (kein Suchen mehr); solange er noch vom Server
        // kommt, der bisherige Verweis. Und: warten Aufnahmen, steht deren Zahl immer dabei —
        // die Session "fehlt" sonst aus Nutzersicht kommentarlos (drittes Support-Muster).
        const pend = loadPending().length;
        // Laeuft ein Upload, steht NUR seine Meldung in der Zeile. Vorher hing Alarm,
        // Verbindung und die Zahl offener Aufnahmen mit dran — zusammen lief das weit ueber
        // den Rand hinaus (Jans Emulator-Runde 10.09.2026: "in einer zeile viiiiiiel zu lang
        // ueber den gesamten screen hinaus"). Der Rest ist eine Sekunde spaeter wieder da.
        const hint = s.idleHint ? s.idleHint : s.upStatus ? s.upStatus
          : (((bleOk() && !getTok())
              ? (s.code ? s.code + " → pumpfoil.org" : t("up.notLinked") + " · → " + t("menu.connect"))
              : gps + (s.almOn ? " · " + t("fm.alarm") : "") + " · " + conn)
             + (pend ? " · " + pend + " " + t("up.open") : ""));
        w.status.setProperty(hmUI.prop.TEXT, hint);
      } else if (s.idlePage === 3) {
        this.hideBig();
        this.setSlots(["", ""], ["", ""], ["", ""]);
        w.status.setProperty(hmUI.prop.TEXT, t("fm.title"));
        this._buildFoilBtns();
      } else if (s.idlePage === 1) {
        if (!bleOk()) { this.setSlots(["—", t("up.noPhone")], ["", ""], ["", ""]); w.status.setProperty(hmUI.prop.TEXT, t("pair.noConn")); }
        else if (s.paired) { this.setSlots(["✓", t("menu.connected")], ["", ""], ["", ""]); w.status.setProperty(hmUI.prop.TEXT, t("menu.linked")); }
        else { this.setSlots([s.code || "—", t("pair.code")], ["", ""], ["", ""]); w.status.setProperty(hmUI.prop.TEXT, "pumpfoil.org → " + t("pair.enterThere")); }
      } else {
        const n = loadPending().length;
        this.setSlots(["" + n, t("up.open")], ["", ""], ["", ""]);
        w.status.setProperty(hmUI.prop.TEXT, s.upStatus || (n ? t("up.waitConn") : t("up.nothing")));
      }
    },
    // Foil-/Alarm-Seite: drei Tap-Buttons (Alarm An/Aus, Schwellen Auto/Manuell, Foil zyklisch).
    // Min/Max manuell setzt man im Web (Zepp-Eingabe ist zu knapp) — hier nur Auto/Manuell.
    _buildFoilBtns() {
      const s = this.state, w = s.w;
      this._clearFoilBtns();
      const round = DW >= 450;
      // FUENF Knoepfe (die Touch-Sperre ist dazugekommen) -> engere Staffelung. Rund: bei y 84 ist
      // die Kreisbreite noch 364 px (Halbsehne sqrt(240^2-156^2)), der Knopf braucht 320 -- passt.
      // Eckig: die Status-Bar ist abgeschaltet, also steht die volle Hoehe zur Verfuegung.
      const ys = round
        ? [px(84), px(150), px(216), px(282), px(348)]
        : [0.04, 0.215, 0.39, 0.565, 0.74].map((f) => Math.round(DH * f));
      const mk = (y, text, fn) => hmUI.createWidget(hmUI.widget.BUTTON, {
        x: round ? px(80) : px(24), y: y, w: round ? DW - px(160) : DW - px(48),
        h: round ? px(52) : Math.round(DH * 0.13), radius: round ? px(26) : Math.round(DH * 0.065),
        text: text, text_size: px(25), normal_color: 0x1f2937, press_color: 0x374151, color: 0xffffff, click_func: fn });
      // Vierter Knopf: eigene Layouts, dreistufig Automatisch/An/Aus wie im Garmin-Menue. Anders
      // als die drei darueber wird DIESE Wahl persistiert (store), damit sie einen App-Start
      // ueberlebt -- der Server-Wert ist nur die Vorbelegung, nicht ein Veto.
      const onOff = (v) => t(v ? "common.on" : "common.off");
      const layTxt = s.layoutsPref === null
        ? t("common.auto") + " (" + onOff(s.layoutsServerDefault) + ")"
        : onOff(s.layoutsPref);
      // Gleiches Muster fuer die Touch-Sperre: bei "Automatisch" steht der aufgeloeste Zustand
      // dahinter, damit sichtbar ist, was die Tastenzahl des Modells ergibt.
      const lockTxt = s.touchLockPref === null
        ? t("common.auto") + " (" + onOff(this._useTouchLock()) + ")"
        : onOff(s.touchLockPref);
      w.foilBtns = [
        mk(ys[0], t("fm.alarm") + ": " + onOff(s.almOn), () => { s.almOn = !s.almOn; this.renderIdle(); }),
        mk(ys[1], t("fm.thresholds") + ": " + (s.almSrc === "foil" ? t("fm.autoFoil") : t("fm.manual")), () => { s.almSrc = s.almSrc === "foil" ? "manual" : "foil"; this.renderIdle(); }),
        mk(ys[2], t("foil.prefix") + s.foilLabel, () => { this._cycleFoil(); this.renderIdle(); }),
        mk(ys[3], t("lay.short") + ": " + layTxt, () => { this._cycleLayoutsPref(); this.renderIdle(); }),
        mk(ys[4], t("menu.touchLock") + ": " + lockTxt, () => { this._cycleTouchLockPref(); this.renderIdle(); }),
      ];
    },
    _clearFoilBtns() {
      const w = this.state.w;
      if (w.foilBtns) { w.foilBtns.forEach((b) => hmUI.deleteWidget(b)); w.foilBtns = null; }
    },
    // Automatisch -> An -> Aus -> Automatisch, persistiert (im Gegensatz zu Alarm/Schwellen, die
    // nur fuer die laufende Sitzung gelten).
    _cycleLayoutsPref() {
      const s = this.state;
      s.layoutsPref = s.layoutsPref === null ? true : (s.layoutsPref ? false : null);
      store.setItem("layoutsPref", s.layoutsPref === null ? "" : (s.layoutsPref ? "1" : "0"));
      s._ringKey = null; s.w.layKey = null;   // Ring + gezeichnete Layout-Widgets neu aufbauen
    },
    // Automatisch -> An -> Aus -> Automatisch, persistiert. Greift sofort: laeuft gerade eine
    // Aufzeichnung, wird die Sperre entsprechend gesetzt oder aufgehoben (das Menue ist waehrend
    // der Aufnahme zwar nicht erreichbar, aber die Wahl soll auch nicht bis zum Neustart warten).
    _cycleTouchLockPref() {
      const s = this.state;
      s.touchLockPref = s.touchLockPref === null ? true : (s.touchLockPref ? false : null);
      store.setItem("touchLockPref", s.touchLockPref === null ? "" : (s.touchLockPref ? "1" : "0"));
      if (s.recording) { if (this._useTouchLock()) this._lockTouch(); else this._disableTouchLock(); }
    },
    _cycleFoil() {
      const s = this.state;
      if (!s.foils.length) { s.foilId = null; s.foilLabel = "—"; return; }
      const idx = s.foils.findIndex((f) => f.id === s.foilId) + 1;   // -1(keine)->0; letzte->length(keine)
      if (idx >= s.foils.length) { s.foilId = null; s.foilLabel = "—"; }
      else { s.foilId = s.foils[idx].id; s.foilLabel = s.foils[idx].label; }
    },
    // ---- Lauf-/Foil-Erkennung (Paket 1) --------------------------------------------------------
    // 3-s-Fenster pflegen und den Median bilden. IMMER pro Tick aufrufen (auch ohne Fix): dann
    // altert das Fenster weg und ein laufender Lauf endet regulär, statt am letzten Speed zu kleben.
    _pushSpeed(mps, tMs, hasFix) {
      const s = this.state;
      if (hasFix) s.spWin.push([tMs, mps]);
      while (s.spWin.length && tMs - s.spWin[0][0] > SPEED_WIN_S * 1000) s.spWin.shift();
      const v = [];
      for (let i = 0; i < s.spWin.length; i++) v.push(s.spWin[i][1]);
      if (!v.length) { s.sp3 = 0; return; }
      v.sort((a, b) => a - b);
      const h = v.length >> 1;
      s.sp3 = (v.length % 2) ? v[h] : (v[h - 1] + v[h]) / 2;
    },
    // Zustands-Automat, 1:1 aus SessionRecorder.mc:_updateRun / Recorder.kt:updateFoilingRun.
    // tMs = verstrichene Aufnahmezeit (nicht Wall-Clock), v3 = geglättete m/s, vInst = Rohwert.
    // Gibt true zurück, wenn in diesem Tick ein Lauf zu Ende gegangen ist.
    _updateRun(v3, vInst, dist, tMs) {
      const s = this.state;
      if (!s.foiling) {
        // Minimum IMMER mitfuehren (auch waehrend der Sperre) — dort zeigt sich ein echter Stopp.
        if (vInst < s.minSpeedSeitEnde) s.minSpeedSeitEnde = vInst;
        // Re-Arm-Sperre nur nach einem ECHTEN Stopp; sonst ist es die Fortsetzung desselben Laufs.
        const gesperrt = (tMs - s.runEndedMs < RUN_REARM_COOLDOWN_MS) && s.minSpeedSeitEnde < NOSTOP_MPS;
        if (gesperrt) {
          s.enterStreak = 0;
        } else {
          s.enterStreak = (v3 >= RUN_ENTER_MPS) ? s.enterStreak + 1 : 0;
          if (s.enterStreak >= RUN_ENTER_DWELL) {
            s.foiling = true; s.exitStreak = 0;
            // Kein echter Stopp seit dem letzten Lauf-Ende -> derselbe Lauf, nicht neu zaehlen.
            s.runIstFortsetzung = s.runCount > 0 && s.minSpeedSeitEnde >= NOSTOP_MPS;
            // Sprung im Kilometerzaehler ist keine Fortsetzung (s. Garmin-Recorder).
            if (s.runIstFortsetzung) {
              const luecke = tMs - s.lastRunStartMs, strecke = dist - s.lastRunStartDist;
              if (luecke <= 0 || strecke < 0 || strecke / (luecke / 1000) > MAX_FOIL_MPS) {
                s.runIstFortsetzung = false;
              }
            }
            s.minSpeedSeitEnde = 99;
            if (s.runIstFortsetzung) {
              // Denselben Lauf weiterfuehren -> Dauer/Distanz zeigen den GANZEN Lauf.
              s.runStartMs = s.lastRunStartMs;
              s.runStartDist = s.lastRunStartDist;
              if (s.lastRunMaxMps > s.runMaxMps) s.runMaxMps = s.lastRunMaxMps;
              if (s.lastRunMaxHr > s.runMaxHr) s.runMaxHr = s.lastRunMaxHr;
            } else {
              // Lauf-Start auf den ersten schnellen Tick zurückdatieren (wie Garmin/Wear).
              s.runStartMs = tMs - RUN_ENTER_DWELL * 1000;
              s.runStartDist = dist;
              s.runMaxMps = s.spdMaxClean;
              s.runMaxHr = s.hr > 0 ? s.hr : 0;
              s._markDistN = 0; s._markTimeN = 0;   // neuer Lauf -> Marken von vorn
            }
            console.log("[pumpfoil] run start speed=" + (v3 * 3.6).toFixed(1));
          }
        }
      } else {
        if (s.spdMaxClean > s.runMaxMps) s.runMaxMps = s.spdMaxClean;
        if (s.hr > s.runMaxHr) s.runMaxHr = s.hr;
        s.exitStreak = (v3 < RUN_EXIT_MPS) ? s.exitStreak + 1 : 0;
        if (s.exitStreak >= RUN_EXIT_DWELL) {
          s.foiling = false; s.enterStreak = 0;
          // Ende auf den ersten langsamen Tick zurückdatieren; Kennzahlen festhalten.
          let durMs = tMs - RUN_EXIT_DWELL * 1000 - s.runStartMs;
          if (durMs < 0) durMs = 0;
          const distM = Math.max(0, dist - s.runStartDist);
          s.minSpeedSeitEnde = 99;
          s.runEndedMs = tMs;   // Re-Arm-Sperre starten
          // Zu kurz/zu langsam = kein Lauf: weder zaehlen noch anzeigen.
          const schnellGenug = durMs > 0 && (distM / (durMs / 1000)) >= MIN_RUN_AVG_MPS;
          if (!s.runIstFortsetzung && (durMs < MIN_RUN_MS || !schnellGenug)) {
            s.runMaxHr = 0;
            s.runIstFortsetzung = false;
            return false;
          }
          s.lastRunStartMs = s.runStartMs;
          s.lastRunStartDist = s.runStartDist;
          s.lastRunDurMs = durMs;
          s.lastRunDistM = distM;
          s.lastRunAvgMps = durMs > 0 ? s.lastRunDistM / (durMs / 1000) : 0;
          s.lastRunMaxMps = s.runMaxMps;
          s.lastRunMaxHr = s.runMaxHr;
          s.runMaxHr = 0;
          if (!s.runIstFortsetzung) s.runCount++;
          s.runIstFortsetzung = false;
          console.log("[pumpfoil] run end count=" + s.runCount
            + " duration=" + Math.round(durMs / 1000) + " distance=" + Math.round(s.lastRunDistM));
          return true;
        }
      }
      return false;
    },
    _resetRun() {
      const s = this.state;
      s.spWin = []; s.sp3 = 0;
      s.foiling = false; s._prevFoil = false;
      s.enterStreak = 0; s.exitStreak = 0; s.runEndedMs = -100000;
      s.runStartMs = 0; s.runStartDist = 0; s.runMaxMps = 0; s.runCount = 0;
      s._markDistN = 0; s._markTimeN = 0;
      // burstBuf = 15-s-Fenster fuer die Max-Saeuberung; spdMaxClean = gesaeuberter Wert des
      // LAUFENDEN Ticks (maxKandidat darf pro Tick nur EINMAL laufen, sonst halbiert sich das
      // Fenster durch Doppel-Eintraege).
      s.burstBuf = []; s.spdMaxClean = 0; s.minSpeedSeitEnde = 99; s.runIstFortsetzung = false;
      s.lastRunStartMs = 0; s.lastRunStartDist = 0;
      s.lastRunDurMs = 0; s.lastRunDistM = 0; s.lastRunAvgMps = 0; s.lastRunMaxMps = 0;
      s._ringKey = null;
    },

    // ---- Seiten-Ring je Zustand (F3) -----------------------------------------------------------
    // Portiert von watch/source/RecordView.mc:_state/_setFor/_ring. Zepp kennt nur zwei Zustände
    // (onFoil/offFoil) — ein manuelles Pausieren gibt es hier nicht, also auch kein :paused.
    _useLayouts() { const s = this.state; return s.layoutsPref === null ? !!s.layoutsServerDefault : !!s.layoutsPref; },
    _setFor(onFoil) {
      const s = this.state, dyn = this._useLayouts();
      if (onFoil) {
        if (dyn && s.pages.length) return s.pages;
        const out = [];
        for (let i = 0; i < s.views.length; i++) { const v = s.views[i] || []; out.push([0, v[0] | 0, v[1] | 0, v[2] | 0]); }
        return out.length ? out : [[0, 1, 0, 0]];
      }
      if (dyn && s.offFoilPages.length) return s.offFoilPages;
      const f = s.offFoil || [];
      return [[0, f[0] | 0, f[1] | 0, f[2] | 0]];
    },
    _ring(onFoil) {
      const s = this.state;
      const key = (onFoil ? "1" : "0") + (this._useLayouts() ? "1" : "0");
      if (s._ringCache && s._ringKey === key) return s._ringCache;
      // Einmal je Wechsel sagen, WORAUS der Ring gebaut wird. Genau diese Zeile fehlte, als Jans
      // Balance 2 klassische On-Foil-Seiten zeigte: so sieht man sofort, ob es an den gelieferten
      // Seiten (pages=0) oder am Schalter (layouts=off) liegt.
      try {
        console.log("[pumpfoil] ring " + (onFoil ? "on-foil" : "off-foil")
          + " layouts=" + (this._useLayouts() ? "on" : "off")
          + " pages=" + s.pages.length + " offFoilPages=" + s.offFoilPages.length
          + " pref=" + String(s.layoutsPref) + " serverDefault=" + String(s.layoutsServerDefault));
      } catch (e) {}
      let out = this._setFor(onFoil);
      // „Auch die übrigen Seiten": im Off-Foil-Zustand hängen die On-Foil-Seiten hinten dran —
      // feste Reihenfolge, vorhersehbar statt clever (RecordView.mc:150-162).
      if (!onFoil && s.browseAll) out = out.concat(this._setFor(true));
      if (!out.length) out = [[0, 1, 0, 0]];
      s._ringCache = out; s._ringKey = key;
      return out;
    },
    _ringLen() { const n = this._ring(this.state.foiling).length; return n > 0 ? n : 1; },
    // Seite in den gültigen Bereich holen (Ring kann durch Zustands-/Config-Wechsel schrumpfen).
    _clampPage() {
      const s = this.state;
      if (!s.recording) return;
      const last = this._ringLen() + 1;
      if (s.page > last) { s.page = last; this.applyButton(); }
    },

    // Vibrationsalarm: effektive Schwellen (Foil oder manuell) gegen die aktuelle km/h.
    //
    // Bis 18.09.2026 gab es hier EIN Muster fuer alles und nur einmal pro Ueberschreitung —
    // „zu schnell" war von „zu langsam" nicht zu unterscheiden, und eine Wiederholung
    // („continuous") kannte die Uhr nicht. Beides hatten Garmin, Wear OS und Apple Watch
    // laengst; die Werte kamen hier nur nie an (s. app-side/index.js).
    _checkAlarm(kmh) {
      const s = this.state;
      let lo = s.almLow, hi = s.almHigh;
      if (s.almSrc === "foil" && s.foilId != null) {
        const f = s.foils.find((x) => x.id === s.foilId);
        if (f) { lo = f.min; hi = f.max; }
      }
      const over = hi > 0 && kmh > hi;
      const under = lo > 0 && kmh < lo && kmh >= lo - 2;
      const trip = over || under;
      if (trip) {
        // Neu ueberschritten -> sofort. Weiter ueberschritten -> nur bei „continuous", und
        // dann im Profil-Abstand (min. 2 s, wie der Server ihn begrenzt).
        const jetzt = Date.now();
        const neu = !s._almActive;
        const wieder = s.almRepeat === "continuous" &&
                       jetzt - s._almLetztMs >= Math.max(2, s.almRepeatS) * 1000;
        if (neu || wieder) {
          s._almActive = true;
          s._almLetztMs = jetzt;
          this._vibratePattern(over ? s.almPatHigh : s.almPatLow);
        }
      } else {
        s._almActive = false;
      }
      this._checkHrAlarm();
    },

    // Dritte Grenze: Puls. Eigenes Muster, eigener Merker — sie kann gleichzeitig mit der
    // Geschwindigkeit ausloesen, und dann sollen es zwei unterscheidbare Meldungen sein.
    _checkHrAlarm() {
      const s = this.state;
      const hr = (s.hrUpdatedMs && Date.now() - s.hrUpdatedMs <= 10000) ? s.hr : 0;
      const ueber = s.almHrHigh > 0 && hr > 0 && hr > s.almHrHigh;
      if (ueber) {
        const jetzt = Date.now();
        const wieder = s.almRepeat === "continuous" &&
                       jetzt - s._almLetztMs >= Math.max(2, s.almRepeatS) * 1000;
        if (!s._almHrActive || wieder) {
          s._almHrActive = true;
          s._almLetztMs = jetzt;
          this._vibratePattern(s.almPatHr);
        }
      } else {
        s._almHrActive = false;
      }
    },

    // Marken im Lauf (Strecke/Zeit): einmal je Tick, solange ein Lauf laeuft. Ohne Hysterese —
    // beide Groessen wachsen nur, deshalb reicht der Vergleich mit der naechsten Marke.
    _checkMarks(dist, tMs) {
      const s = this.state;
      if (s.runDistM > 0 && (s._markDistN === 0 || s.runDistMode === "every")) {
        if (dist - s.runStartDist >= (s._markDistN + 1) * s.runDistM) {
          s._markDistN++;
          this._vibratePattern(s.almPatDist);
        }
      }
      if (s.runTimeS > 0 && (s._markTimeN === 0 || s.runTimeMode === "every")) {
        if ((tMs - s.runStartMs) / 1000 >= (s._markTimeN + 1) * s.runTimeS) {
          s._markTimeN++;
          this._vibratePattern(s.almPatTime);
        }
      }
    },

    // Muster-ID -> Folge von Vibrationen. IDs identisch mit Web, Garmin und Wear OS
    // (`vibratePattern` in MainActivity.kt): short1 · short2 · long2 · lsl.
    //
    // Zepp OS kennt keine Millisekunden-Wellenform, sondern Szenen mit geraetedefinierter
    // Laenge (`VIBRATOR_SCENE_*`). Deckungsgleich nachbauen geht also nicht — was zaehlt, ist
    // dass die drei Alarme UNTERSCHEIDBAR sind. Lang = DURATION_LONG, kurz = SHORT_MIDDLE,
    // mehrere Stoesse mit Pause dazwischen.
    _vibratePattern(muster) {
      const s = this.state;
      const L = VIBRATOR_SCENE_DURATION_LONG, K = VIBRATOR_SCENE_SHORT_MIDDLE;
      const folge = muster === "short1" ? [K]
                  : muster === "long2"  ? [L, L]
                  : muster === "lsl"    ? [L, K, L]
                  : [K, K];                        // short2 (Vorgabe)
      if (s._almPattTimer) { clearTimeout(s._almPattTimer); s._almPattTimer = null; }
      const stoss = (i) => {
        if (i >= folge.length) return;
        try {
          if (!s.vibrator) s.vibrator = new Vibrator();
          s.vibrator.stop();
          s.vibrator.setMode({ mode: folge[i] });
          s.vibrator.start();
        } catch (e) {}
        if (i + 1 < folge.length) {
          s._almPattTimer = setTimeout(() => stoss(i + 1), 450);
        }
      };
      stoss(0);
    },
    _vibrate() {
      const s = this.state;
      try {
        if (!s.vibrator) s.vibrator = new Vibrator();
        s.vibrator.stop();
        s.vibrator.start();
      } catch (e) {}
    },
    _gpsReadyFeedback() {
      const s = this.state;
      this._vibrate();
      // Buzzer is available from API 3.6 (T-Rex 3: API 4.0). Play the sound only when the user has
      // enabled the "Other" buzzer scene in the watch settings.
      try {
        if (!s.buzzer) s.buzzer = new Buzzer();
        if (s.buzzer.isEnabled()) {
          const types = s.buzzer.getSourceType();
          s.buzzer.start(types.SUCCESS);
        }
      } catch (e) {}
    },

    // ---- Layout-Renderer (Paket 2) --------------------------------------------------------------
    // Zepp ist widget-basiert (createWidget/deleteWidget/setProperty) — es gibt kein dc/onUpdate.
    // Muster wie _buildFoilBtns/_clearFoilBtns bzw. showBar/hideBar: Widgets in einer Liste halten
    // und beim Verlassen der Seite ALLE löschen, sonst wachsen sie sich zu.
    _clearLayout() {
      const w = this.state.w;
      if (!w.layW) return;
      for (let i = 0; i < w.layW.length; i++) { try { hmUI.deleteWidget(w.layW[i]); } catch (e) {} }
      w.layW = null; w.layKey = null; w.layDyn = null; w.layGfx = null; w.layCanvas = null;
      // Chrome zurückholen, das die Layout-Seite geleert hatte (die Renderer setzen Seite/Status
      // selbst; Titel + Versionszeile nicht).
      try { if (w.title) w.title.setProperty(hmUI.prop.TEXT, TITLE.text); } catch (e) {}
      this._verText();
    },
    // Farbe nach Wert für ein Feld; null = keine (Aufrufer nimmt die Palette-/auto-Farbe).
    _fieldColor(id) {
      const s = this.state, last = s.last;
      const el = s.recording ? (Date.now() - s.startedAtMs) / 1000 : 0;
      switch (id) {
        case 1: return laySpeedColor(s.sp3 * 3.6);
        case 5: return laySpeedColor(s.cur * 3.6);
        case 6: return laySpeedColor(s.recording ? (el > 0 ? s.dist / el * 3.6 : 0) : (last ? last.avg : 0));
        case 7: return laySpeedColor(s.recording ? s.max * 3.6 : (last ? last.max : 0));
        case 18: return s.runCount ? laySpeedColor(s.lastRunAvgMps * 3.6) : null;
        case 19: return s.runCount ? laySpeedColor(s.lastRunMaxMps * 3.6) : null;
        case 2: return layHrColor(s.hr);
        case 8: return layHrColor(s.hrN ? Math.round(s.hrSum / s.hrN) : 0);
        case 9: return layHrColor(s.hrMax);
        default: return null;
      }
    },
    // Text-Widget an (ax, ay) verankern. Zepp-TEXT kennt nur ein Rechteck + align_h, also wird die
    // Ausrichtung über die Box gebaut: links = Box ab ax, rechts = Box bis ax, zentriert = Box
    // symmetrisch um ax. Vertikal immer mittig (wie TEXT_JUSTIFY_VCENTER bei Garmin).
    _layText(ax, ay, flags, size, color, txt) {
      let gx, gw, ah;
      if (flags & 1) { gx = ax; gw = Math.max(1, DW - ax); ah = hmUI.align.LEFT; }
      else if (flags & 2) { gx = 0; gw = Math.max(1, ax); ah = hmUI.align.RIGHT; }
      else { const half = Math.min(ax, DW - ax); gx = ax - half; gw = Math.max(1, 2 * half); ah = hmUI.align.CENTER_H; }
      const h = Math.round(size * 1.7);
      return hmUI.createWidget(hmUI.widget.TEXT, {
        x: gx, y: ay - Math.round(h / 2), w: gw, h: h,
        color: color, text_size: size, align_h: ah, align_v: hmUI.align.CENTER_V, text: txt,
      });
    },
    // Eine Layout-Seite zeichnen. Bei gleichem Schlüssel werden nur die Wert-Widgets aktualisiert
    // (1×/s) — jede Sekunde alles neu zu erzeugen wäre auf der Uhr nicht tragbar.
    _renderLayoutPage(entry, idx, count, recording) {
      const s = this.state, w = s.w;
      const els = (entry && Array.isArray(entry[2])) ? entry[2] : [];
      const key = idx + "/" + count + "/" + (recording ? 1 : 0) + "/" + els.length + "/" + (entry[1] | 0);
      if (w.layKey === key && w.layDyn) { this._updateLayoutDyn(); return; }
      this._clearLayout();
      // Klassische Widgets leeren. Der Layout-Hintergrund deckt sie zwar ab (Zepp zeichnet in
      // Erzeugungsreihenfolge, das Layout entsteht später), aber leer ist leer.
      this.hideBig();
      for (let i = 0; i < 3; i++) { w.f[i][0].setProperty(hmUI.prop.TEXT, ""); w.f[i][1].setProperty(hmUI.prop.TEXT, ""); }
      w.page.setProperty(hmUI.prop.TEXT, "");
      w.status.setProperty(hmUI.prop.TEXT, "");
      try { if (w.title) w.title.setProperty(hmUI.prop.TEXT, ""); } catch (e) {}
      try { if (w.ver) w.ver.setProperty(hmUI.prop.MORE, { text: "", color: 0x000000 }); } catch (e) {}

      const list = [], dyn = [], gfx = [];
      const bg = layColor(entry[1] | 0, 0x000000);
      // RANDLOS über das ganze Display: die Promille-Koordinaten beziehen sich aufs ganze Display,
      // ein Innenabstand würde alles verkleinern und nach innen versetzen (der Wear-Fehler).
      list.push(hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 0, y: 0, w: DW, h: DH, color: bg }));
      // Canvas fuer die Wert-Grafiken JETZT anlegen (direkt nach dem Hintergrund), damit er hinter
      // allem Text liegt. Ob er gebraucht wird, wissen wir erst nach der Schleife — ein leerer
      // Canvas kostet nichts und wird mit der Seite geloescht.
      const gfxCanvas = hmUI.createWidget(hmUI.widget.CANVAS, { x: 0, y: 0, w: DW, h: DH });
      list.push(gfxCanvas);
      // Linien zuerst, danach alles andere — sonst liegen Striche über den Werten (wie Garmin/Wear).
      // Linien UND Wert-Grafiken zuerst — beide liegen hinter dem Text (Zepp zeichnet in
      // Erzeugungsreihenfolge).
      const hinten = (x) => (x && (x[0] === 4 || x[0] === 8 || x[0] === 9)) ? 0 : 1;
      const sorted = els.slice().sort((a, b) => hinten(a) - hinten(b));
      for (let i = 0; i < sorted.length; i++) {
        const e = sorted[i];
        if (!e || e.length < 6) continue;
        const typ = e[0] | 0;
        const ax = Math.round(DW * (e[1] | 0) / 1000), ay = Math.round(DH * (e[2] | 0) / 1000);
        const step = e[3] | 0, ci = e[4] | 0, fl = e[5] | 0;
        if (typ === 4) {
          // Trennlinie. Zepp kann nur Rechtecke zeichnen: achsparallele Linien werden exakt,
          // SCHRÄGE legen wir auf die dominante Achse (Editor-Linien sind praktisch immer
          // Trenner). Bewusste, dokumentierte Abweichung von Garmin/Wear (dort echte drawLine).
          const bx = Math.round(DW * (e.length > 6 ? (e[6] | 0) : (e[1] | 0)) / 1000);
          const by = Math.round(DH * (e.length > 7 ? (e[7] | 0) : (e[2] | 0)) / 1000);
          const th = step < 1 ? 1 : step;
          const col = layColor(ci, AUTO_LINE);
          if (Math.abs(bx - ax) >= Math.abs(by - ay)) {
            list.push(hmUI.createWidget(hmUI.widget.FILL_RECT, {
              x: Math.min(ax, bx), y: Math.round((ay + by) / 2 - th / 2),
              w: Math.max(1, Math.abs(bx - ax)), h: th, color: col }));
          } else {
            list.push(hmUI.createWidget(hmUI.widget.FILL_RECT, {
              x: Math.round((ax + bx) / 2 - th / 2), y: Math.min(ay, by),
              w: th, h: Math.max(1, Math.abs(by - ay)), color: col }));
          }
          continue;
        }
        if (typ === 5) {
          // REC = Punkt UND "REC"-Text (Garmin _drawRec, Vorschau EL_REC): Punkt 3 % der Breite,
          // Schrift 5,5 %, Abstand halber Punkt. Die Textbreite wird geschätzt (Zepp hat hier keine
          // verlässliche Messung) — nur die Gruppen-Ausrichtung hängt davon ab.
          if (!recording) continue;
          const d = Math.max(4, Math.round(DW * 0.03)), fs = Math.max(7, Math.round(DW * 0.055));
          const gap = Math.round(d / 2), tw = Math.round(fs * 0.62 * 3);
          const total = d + gap + tw;
          const left = (fl & 1) ? ax : ((fl & 2) ? ax - total : ax - Math.round(total / 2));
          const col = layColor(ci, 0xff0000);
          list.push(hmUI.createWidget(hmUI.widget.FILL_RECT, {
            x: left, y: ay - Math.round(d / 2), w: d, h: d, radius: Math.round(d / 2), color: col }));
          list.push(hmUI.createWidget(hmUI.widget.TEXT, {
            x: left + d + gap, y: ay - fs, w: Math.max(1, DW - (left + d + gap)), h: 2 * fs,
            color: col, text_size: fs, align_h: hmUI.align.LEFT, align_v: hmUI.align.CENTER_V, text: "REC" }));
          continue;
        }
        if (typ === 6) {
          // Seiten-Punkte AN DER ELEMENT-POSITION (Vorschau: Durchmesser 2,2 % der Breite, Abstand
          // = Durchmesser, inaktiv 35 %). Garmin ignoriert x/y und zeichnet fest unten mittig —
          // fürs Standard-Element (500/920) kommt dasselbe heraus, verschoben stimmt nur das hier.
          const nn = Math.max(1, Math.min(12, count | 0));
          if (nn <= 1) continue;
          const d = Math.max(3, Math.round(DW * 0.022)), stp = d * 2, total = (nn - 1) * stp;
          const startX = (fl & 1) ? ax + Math.round(d / 2)
                       : (fl & 2) ? ax - total - Math.round(d / 2)
                       : ax - Math.round(total / 2);
          const col = layColor(ci, AUTO_LABEL), dim = layMix(col, bg, 0.35);
          for (let k = 0; k < nn; k++) {
            list.push(hmUI.createWidget(hmUI.widget.FILL_RECT, {
              x: startX + k * stp - Math.round(d / 2), y: ay - Math.round(d / 2),
              w: d, h: d, radius: Math.round(d / 2), color: k === idx ? col : dim }));
          }
          continue;
        }
        if (typ === 8 || typ === 9) {
          const fid = (e.length > 6) ? (e[6] | 0) : 0;
          const th = Math.max(2, Math.round(DW * 0.018 * Math.max(1, Math.min(4, step))));
          const eintrag = { typ: typ, e: e, th: th, ci: ci, fid: fid, frac: -1 };
          if (typ === 8) {
            eintrag.inset = th / 2 + 1;
            eintrag.laenge = Math.max(0, Math.min(1000, e[2] | 0));
          } else {
            const bw2 = Math.max(50, Math.min(1000, e.length > 7 ? (e[7] | 0) : 400));
            eintrag.breite = Math.round(DW * bw2 / 1000);
            eintrag.bx = ax - Math.round(eintrag.breite / 2);
            eintrag.by = ay - Math.round(th / 2);
          }
          gfx.push(eintrag);
          continue;
        }
        // typ 7 ("Pausiert") wird auf Zepp NIE gezeichnet: es gibt kein manuelles Pausieren, der
        // Hinweis wäre also immer falsch. Genau wie Wear (paused = hart false), bis es eine Pause gibt.
        if (typ === 7) continue;
        if (typ !== 1 && typ !== 2 && typ !== 3) continue;
        const fid = (e.length > 6) ? (e[6] | 0) : 0;
        const txt = typ === 1 ? this.fieldValue(fid)[0]
                  : typ === 2 ? this.fieldValue(fid)[1]
                  : ((e.length > 6 && e[6] != null) ? "" + e[6] : "");
        // Freitext/Label ohne Inhalt braucht kein Widget; Werte schon (sie ändern sich noch).
        if (typ !== 1 && !txt) continue;
        const byVal = (typ === 1 && (fl & 4)) ? 1 : 0;
        const base = layColor(ci, typ === 1 ? AUTO_VALUE : AUTO_LABEL);
        let col = base;
        if (byVal) { const c2 = this._fieldColor(fid); if (c2 != null) col = c2; }
        const wg = this._layText(ax, ay, fl, laySize(step), col, txt);
        list.push(wg);
        if (typ === 1) dyn.push([wg, fid, byVal, base]);
      }
      w.layW = list; w.layDyn = dyn; w.layGfx = gfx; w.layKey = key;
      w.layCanvas = gfx.length ? gfxCanvas : null;
      if (w.layCanvas) this._updateLayoutGfx();
    },
    // 1×/s: den gefuellten Anteil der Wert-Grafiken nachziehen. Auf runden Uhren aendert das nur
    // den Endwinkel des ARC-Widgets; auf eckigen muessen die Rechtecke neu entstehen (Zepp kann ein
    // FILL_RECT nicht in der Breite umsetzen). Neu erzeugte Widgets liegen VOR dem Text — bei einer
    // Rand-Grafik ist das unkritisch (sie sitzt am Displayrand), einen Balken sollte man deshalb
    // nicht unter einen Wert legen.
    // Zeichenfehler einer Wert-Grafik melden — je Art nur EINMAL pro Sitzung, sonst floetet
    // das Log im Sekundentakt zu.
    _gfxFehler(wo, e) {
      const s = this.state;
      if (!s._gfxErr) s._gfxErr = {};
      if (s._gfxErr[wo]) return;
      s._gfxErr[wo] = true;
      try { console.log("[pumpfoil] value graphic failed at " + wo + ": " + ((e && e.message) || e)); } catch (e2) {}
    },
    _updateLayoutGfx() {
      const w = this.state.w, gfx = w.layGfx || [], canvas = w.layCanvas;
      if (!canvas || !gfx.length) return;
      // Nur neu malen, wenn sich wirklich etwas geaendert hat (1 % Schritte reichen fuer die Optik).
      let aendert = false;
      for (let i = 0; i < gfx.length; i++) {
        const v = this.fieldNumber(gfx[i].fid);
        const frac = v == null ? 0 : layFuellgrad(gfx[i].fid, v);
        if (Math.abs(frac - gfx[i].frac) >= 0.01) { aendert = true; }
        gfx[i].neu = frac;
        gfx[i].wert = v;
      }
      if (!aendert) return;
      try { canvas.clear({ x: 0, y: 0, w: DW, h: DH }); }
      catch (e) { this._gfxFehler("canvas.clear", e); }
      for (let i = 0; i < gfx.length; i++) {
        const g = gfx[i];
        g.frac = g.neu;
        const grund = ((g.e[5] | 0) & 1) !== 0 && g.wert != null
          ? ZONE_COLORS[layZone(g.fid, g.wert)] : layColor(g.ci, CYAN);
        // "Leerer" Track: der Canvas kennt keine Deckkraft, also eine dunkle Mischung als Ersatz.
        const leer = layMix(grund, 0x000000, 0.3);
        if (g.typ === 8) {
          const track = IS_ROUND ? [layRingPoly(g.e[1] | 0, g.laenge, g.th, g.inset)]
                                 : layRandPolys(g.e[1] | 0, g.laenge, g.th, g.inset);
          for (let k = 0; k < track.length; k++) {
            try { canvas.drawPoly({ data_array: track[k], color: leer }); }
            catch (e) { this._gfxFehler("drawPoly track", e); }
          }
          if (g.frac > 0) {
            const voll = IS_ROUND ? [layRingPoly(g.e[1] | 0, g.laenge * g.frac, g.th, g.inset)]
                                  : layRandPolys(g.e[1] | 0, g.laenge * g.frac, g.th, g.inset);
            for (let k = 0; k < voll.length; k++) {
              try { canvas.drawPoly({ data_array: voll[k], color: grund }); }
              catch (e) { this._gfxFehler("drawPoly fill", e); }
            }
          }
        } else {
          const rechteck = (x, y, bb, hh, c) => {
            try {
              canvas.drawPoly({ data_array: [
                { x: x, y: y }, { x: x + bb, y: y }, { x: x + bb, y: y + hh }, { x: x, y: y + hh },
              ], color: c });
            } catch (e) { this._gfxFehler("drawPoly bar", e); }
          };
          rechteck(g.bx, g.by, g.breite, g.th, leer);
          if (g.frac > 0) {
            rechteck(g.bx, g.by, Math.max(g.th, Math.round(g.breite * g.frac)), g.th, grund);
          }
        }
      }
    },
    // 1×/s: nur die Wert-Elemente nachziehen (Labels/Freitext/Linien/Punkte sind statisch).
    _updateLayoutDyn() {
      this._updateLayoutGfx();
      const dyn = this.state.w.layDyn || [];
      for (let i = 0; i < dyn.length; i++) {
        const d = dyn[i];
        const v = this.fieldValue(d[1])[0];
        try {
          if (d[2]) {
            const c = this._fieldColor(d[1]);
            d[0].setProperty(hmUI.prop.MORE, { text: v, color: c == null ? d[3] : c });
          } else {
            d[0].setProperty(hmUI.prop.TEXT, v);
          }
        } catch (e) {}
      }
    },

    renderRecording() {
      const s = this.state, w = s.w;
      this._clearFoilBtns();
      this._clampPage();
      const ring = this._ring(s.foiling), n = ring.length;
      if (s.page === 0 || s.page >= n + 1) {
        this._clearLayout();
        w.page.setProperty(hmUI.prop.TEXT, "");
        const el = (Date.now() - s.startedAtMs) / 1000;
        this.setSlots([mmss(el), t("f.time")], [fmtDist(s.dist), t("f.dist")], ["", ""]);
        // Tasten-Hinweis: "Halten = STOPP". Das frueher angehaengte "kurz = Seite" ist entfallen —
        // fuer "Seite" gibt es in den anderen Uhr-Apps keinen Wortlaut, und die Seitenanzeige
        // (n/N) steht ohnehin oben rechts. Keinen Text erfinden.
        w.status.setProperty(hmUI.prop.TEXT,
          s.stopMode === "press" ? t("btn.stop") : t("rec.stopHold") + " = " + t("btn.stop"));
        return;
      }
      const pg = s.page - 1, entry = ring[pg] || ring[0];
      // Tag-Byte entscheidet: 1 = eigenes Layout (Hintergrund + Elemente inline), sonst klassische
      // Seite mit Feld-IDs AB INDEX 1 (das Tag gehört nicht dazu).
      if (entry && entry[0] === 1) {
        try {
          this._renderLayoutPage(entry, pg, n, true);
          return;
        } catch (err) {
          // Selbstheilung: scheitert das Zeichnen (unbekannte Widget-Property, kaputtes Element),
          // darf das NIE die laufende Aufnahme mitnehmen — Widgets wegräumen, Layouts für DIESE
          // Sitzung abschalten (nicht persistieren) und klassisch weiterzeichnen. Sinngleich mit
          // Garmins Canary, aber ohne dessen Speicher-Maschinerie (die gehört zu den 96-KB-Uhren).
          try { this._clearLayout(); } catch (e2) {}
          // Den Grund NENNEN. Bis 26.08. schwieg die Selbstheilung — Jans Balance 2 fiel auf die
          // klassischen Seiten zurueck, und weder Uhr-Log noch Server verrieten warum.
          try {
            console.log("[pumpfoil] layout render failed -> classic for this session: "
              + ((err && err.message) || err));
          } catch (e3) {}
          s.layoutsPref = false; s._ringKey = null;
          this.renderRecording();   // einmalige Rekursion: der neue Eintrag ist garantiert klassisch
          return;
        }
      }
      this._clearLayout();
      w.page.setProperty(hmUI.prop.TEXT, (pg + 1) + "/" + n);
      this.renderFields([entry[1], entry[2], entry[3]]);
      // Auf den DATENSEITEN steht kein „Halten = STOPP" mehr (Jan, 13.09.2026: „was soll diese
      // anzeige Hold = STOP auf allen seiten?"). Der Hinweis kam daher, dass hier der rote
      // STOPP-Knopf ausgeblendet ist — er sollte sagen, dass langes Halten trotzdem ueberall
      // beendet. Seit heute bringt JEDER Tastendruck den Stopp-Bildschirm, der Weg ist also von
      // selbst auffindbar. Damit bleibt in der Zeile nur noch, was sich wirklich aendert: der
      // GPS-Zustand und ob gerade ein Lauf laeuft. Auf dem Stopp-Bildschirm selbst steht der
      // Hinweis weiterhin — dort ist er die Bedienung und keine Wiederholung.
      // DIE LAUFZEIT STEHT HIER, und zwar zuerst. Ohne sie sieht eine Datenseite waehrend der
      // Aufnahme genauso aus wie der Startbildschirm: gleicher Titel, Felder, "GPS ●" — und der
      // STOPP-Knopf ist hier bewusst ausgeblendet. u352 hat daraus am 21.09.2026 geschlossen,
      // die App sei kaputt ("beim zweiten Start kommt auch kein Start bzw. Stop mehr"), waehrend
      // sie in Wahrheit aufzeichnete; sein Foto zeigt genau diese Seite ("1/2").
      //
      // Das ist KEIN Wiederholen des Hinweises "Halten = STOPP", der hier zu Recht raus ist
      // (Jan, 13.09.): eine laufende Uhr ist ZUSTAND, und genau dafuer ist diese Zeile da.
      const laufzeit = mmss(Math.max(0, (Date.now() - s.startedAtMs) / 1000));
      w.status.setProperty(hmUI.prop.TEXT, laufzeit + " · " + (s.fix ? "GPS ●" : t("gps.searching"))
        + (s.foiling ? " · " + t("f.runActive") : ""));
    },
    renderSummary() {
      const s = this.state, w = s.w, last = s.last || { dist: 0, dur: 0, avg: 0, max: 0 };
      this._clearLayout();
      w.page.setProperty(hmUI.prop.TEXT, "");
      this.setSlots([fmtDist(last.dist), t("f.dist")], [mmss(last.dur), t("f.dur")], [last.avg.toFixed(1), t("f.kmhAvg")]);
      w.status.setProperty(hmUI.prop.TEXT, s.upStatus);
    },
    // Rohwert der skalierbaren Felder fuer die Wert-Grafiken (km/h bzw. bpm); null = kein Messwert
    // -> die Grafik bleibt leer, statt 0 zu zeigen (0 hiesse "ganz unten in Zone 1").
    fieldNumber(id) {
      const s = this.state, last = s.last;
      const el = s.recording ? (Date.now() - s.startedAtMs) / 1000 : 0;
      const hasRun = s.runCount > 0;
      switch (id) {
        case 1: return s.sp3 * 3.6;
        case 5: return s.cur * 3.6;
        case 6: return s.recording ? (el > 0 ? s.dist / el * 3.6 : 0) : (last ? last.avg : 0);
        case 7: return s.recording ? s.max * 3.6 : (last ? last.max : 0);
        case 18: return hasRun ? s.lastRunAvgMps * 3.6 : null;
        case 19: return hasRun ? s.lastRunMaxMps * 3.6 : null;
        case 2: return s.hr ? s.hr : null;
        case 8: return s.hrN ? Math.round(s.hrSum / s.hrN) : null;
        case 9: return s.hrMax ? s.hrMax : null;
        case 21: return s.lastRunMaxHr > 0 ? s.lastRunMaxHr : null;
        default: return null;
      }
    },
    fieldValue(id) {
      const s = this.state, last = s.last;
      const el = s.recording ? (Date.now() - s.startedAtMs) / 1000 : 0;
      // Lauf-Kennzahlen: läuft gerade ein Lauf -> dessen Live-Werte, sonst die des letzten
      // (identisch mit _rec.runDurationMs()/runDistanceM() bei Garmin und Recorder.kt:393-395).
      const runDurMs = s.foiling ? Math.max(0, el * 1000 - s.runStartMs) : s.lastRunDurMs;
      const runDistM = s.foiling ? Math.max(0, s.dist - s.runStartDist) : s.lastRunDistM;
      const hasRun = s.runCount > 0;
      switch (id) {
        // Feld 1 = 3-s-Median (der Wert, auf dem auch die Lauf-Erkennung entscheidet),
        // Feld 5 = Momentanwert. Vorher lieferten beide s.cur.
        case 1: return [(s.sp3 * 3.6).toFixed(1), t("f.kmh3s")];
        case 5: return [(s.cur * 3.6).toFixed(1), t("f.kmh")];
        case 6: return [(s.recording ? (el > 0 ? s.dist / el * 3.6 : 0) : (last ? last.avg : 0)).toFixed(1), t("f.kmhAvg")];
        case 7: return [(s.recording ? s.max * 3.6 : (last ? last.max : 0)).toFixed(1), t("f.kmhMax")];
        case 2: return [s.hr ? "" + s.hr : "–", t("f.bpm")];
        case 8: return [s.hrN ? "" + Math.round(s.hrSum / s.hrN) : "–", t("f.bpmAvg")];
        case 9: return [s.hrMax ? "" + s.hrMax : "–", t("f.bpmMax")];
        case 3: return [mmss(el), t("f.time")];
        case 4: return [distVal(s.dist), distUnit(s.dist) + " " + t("f.dist")];
        case 12: { const d = new Date(); return [pad(d.getHours()) + ":" + pad(d.getMinutes()), t("f.clock")]; }
        // 14/15 = AKTUELLER Lauf, 16-19 = LETZTER Lauf, 20 = Lauf-Zähler. Bis 1.0.4 zeigte 14/15
        // die Gesamt-Session (= dasselbe wie 3/4) und 16-19 die letzte SESSION statt des letzten
        // Laufs — die Feld-IDs bedeuten aber Läufe (web fw.14…fw.20), und ohne On-Watch-Erkennung
        // gab es keine Lauf-Daten. Jetzt liefert Paket 1 sie.
        case 14: return [mmss(runDurMs / 1000), s.foiling ? t("f.runActive") : t("f.runTime")];
        case 15: return [distVal(runDistM), distUnit(runDistM) + " " + t("f.runDist")];
        case 16: return [hasRun ? mmss(s.lastRunDurMs / 1000) : "–", t("f.lastRunTime")];
        case 17: return [hasRun ? distVal(s.lastRunDistM) : "–",
                         distUnit(s.lastRunDistM) + " " + t("f.lastRunDist")];
        case 18: return [hasRun ? (s.lastRunAvgMps * 3.6).toFixed(1) : "–", t("f.lastRunAvg")];
        case 19: return [hasRun ? (s.lastRunMaxMps * 3.6).toFixed(1) : "–", t("f.lastRunMax")];
        case 20: return ["" + s.runCount, t("f.runs")];
        case 21: return [s.lastRunMaxHr > 0 ? "" + s.lastRunMaxHr : "–", t("f.lastRunMaxHr")];
        default: return ["–", ""];
      }
    },

    // ---- Sampling ----
    sample() {
      const s = this.state;
      const sampleNow = Date.now();
      let fix = false, lat = null, lon = null, speed = 0;
      if (DEV_FAKE_GPS) {
        fix = true;
        if (s._flat == null) { s._flat = 47.66; s._flon = 9.355; }
        if (s.recording) { s._fi = (s._fi || 0) + 1; speed = (19 + 5 * Math.sin(s._fi / 6)) / 3.6; s._flat += (speed / 111320) * 0.7; s._flon += (speed / (111320 * 0.673)) * 0.4; }
        lat = s._flat; lon = s._flon;
      } else if (s.geo) {
        try {
          const st = s.geo.getStatus ? s.geo.getStatus() : "A";
          lat = s.geo.getLatitude(); lon = s.geo.getLongitude();
          fix = st === "A" && lat != null && lon != null;
        } catch (e) {}
        // Nichts gesehen? Dann die zuletzt vom Rueckruf gemeldete Position nehmen, solange sie
        // frisch ist (s. `GEO_CACHE_MS` und die Begruendung bei `onChange`).
        if (!fix && s.geoLast && sampleNow - s.geoLast[2] <= GEO_CACHE_MS) {
          lat = s.geoLast[0]; lon = s.geoLast[1]; fix = true;
        }
      }
      // Geolocation has no documented getSpeed() method. Derive m/s from consecutive WGS-84
      // positions instead; this is also consistent with the distance accumulated below.
      //
      // QUALITAETS-GATE (Garmin `_saneSpeed` + `gpsPoor`, Wear `poor`): Zepp liefert keine
      // Genauigkeit in Metern, nur getStatus() "A". Bei einer AUS POSITIONEN abgeleiteten
      // Geschwindigkeit ist der Sprung aber selbst das Signal — springt der Fix (Kaltstart,
      // Handgelenk im Wasser), sind es sofort dreistellige m/s. Ohne Gate wanderte das in
      // Live-Anzeige, Hoechstgeschwindigkeit, Alarm, Lauferkennung UND Distanz: ein einziger
      // 300-m-Sprung haette die Session um 300 m verlaengert und einen Phantom-Lauf ausgeloest.
      // Genau dieser Fall ist auf Garmin belegt (Nutzer-Video, 100,1 km/h im Stehen am Steg).
      //
      // Die ROHDATEN bleiben unberuehrt: hochgeladen wird weiter der abgeleitete Wert, der Server
      // hat seine eigenen Filter und sieht die Positionen ohnehin. Das Gate wirkt nur auf das,
      // was die UHR anzeigt und entscheidet — dieselbe Trennung wie bei Garmin.
      let speedRaw = 0, jump = false, stepM = 0;
      if (fix && !DEV_FAKE_GPS) {
        const p = s.geoSpeedPrev;
        if (p) {
          const dt = (sampleNow - p[2]) / 1000;
          if (dt > 0) {
            stepM = distM(p[0], p[1], lat, lon);
            speedRaw = stepM / dt;
            speed = speedRaw;
          }
        }
        s.geoSpeedPrev = [lat, lon, sampleNow];
      } else if (!fix) {
        s.geoSpeedPrev = null;
      }
      if (speed < 0 || speed > MAX_SANE_MPS) { speed = 0; jump = true; }   // wie Garmin _saneSpeed
      else if (speed > MAX_PLAUSIBLE_MPS) { speed = 0; jump = true; }      // Positionssprung, kein Fahrer
      // Treat a value as current for ten seconds. The callback owns getCurrent(); this 1 Hz loop
      // only snapshots the latest valid value into session statistics and GPS payloads.
      let hr = (s.hrUpdatedMs && sampleNow - s.hrUpdatedMs <= 10000) ? s.hr : 0;
      if (!hr) s.hr = 0;
      if (hr) { s.hr = hr; if (s.recording) { s.hrSum += hr; s.hrN++; if (hr > s.hrMax) s.hrMax = hr; } }
      const fixChanged = fix !== s.fix;
      const acquiredFix = fix && !s.fix;
      s.fix = fix;
      s.cur = fix ? speed : 0;

      if (s.recording) {
        const el = Date.now() - s.startedAtMs;
        if (fix) {
          const punkt = [el, Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6,
                         Math.round(speedRaw * 100) / 100, hr, 0];
          s.gpsLastMs = el;
          if (s.gpsFile) s.gpsBuffer.push(punkt); else s.gps.push(punkt);
          // Distanz NICHT ueber einen Sprung hinweg aufsummieren — sonst waechst die angezeigte
          // Strecke um den Sprung, und der Lauf daneben bekommt eine Distanz, die es nie gab.
          if (s.prev && !jump) s.dist += distM(s.prev[0], s.prev[1], lat, lon);
          s.prev = [lat, lon];
          s.spdMaxClean = maxKandidat(s.burstBuf || (s.burstBuf = []), sampleNow, speed);
          if (s.spdMaxClean > s.max) s.max = s.spdMaxClean;
          if (s.almOn) this._checkAlarm(speed * 3.6);   // Vibrationsalarm bei Speed-Grenzen
          // Alle zehn Punkte an die Datei anhaengen und die (winzigen) Kopfdaten sichern.
          if (s.gpsFile) {
            if (s.gpsBuffer.length >= GPS_CHUNK) { this._flushGpsBuffer(); this.persistActive(); }
          } else if (s.gps.length % GPS_CHUNK === 0) this.persistActive();
        }
        // Lauf-Erkennung: erst glätten (auch ohne Fix, damit das Fenster altert), dann Automat.
        this._pushSpeed(s.cur, el, fix);
        this._updateRun(s.sp3, s.cur, s.dist, el);
        if (s.almOn && s.foiling) this._checkMarks(s.dist, el);
        // Zustandswechsel: Ring des neuen Zustands von vorne (erste Datenseite = 1, Seite 0 ist der
        // Stopp-Screen) + eine kurze Vibration als Rückmeldung — wie RecordView._vibeSwitch bzw.
        // die Wear-Flanke. Es gibt auf Zepp nur den einen Vibrator (auch fürs Alarm-Signal).
        if (s.foiling !== s._prevFoil) {
          s._prevFoil = s.foiling;
          s._ringKey = null; s.w.layKey = null;
          s.page = 1;
          this._vibrate();
          this.applyButton();
        }
        this.renderRecording();
      } else if (s.screen === "idle") {
        if (fixChanged) this.applyButton();
        if (acquiredFix) this._gpsReadyFeedback();
        if (s.autoStart && fix && speed > AUTOSTART_SPEED) { s.autoTicks++; if (s.autoTicks >= AUTOSTART_TICKS) { this.start(); return; } }
        else s.autoTicks = 0;
        this.renderIdle();
      }
    },

    // ---- Persistente Aufnahme (Absturz-sicher) ----
    persistActive() {
      const s = this.state;
      try {
        // Nur noch KOPFDATEN. Die Spur liegt in der Datei — frueher stand sie hier mit drin und
        // wurde bei jedem zehnten Punkt vollstaendig neu geschrieben (nach zwei Stunden 287 KB,
        // alle zehn Sekunden). Jetzt haengt die Groesse dieses Eintrags nicht mehr an der Laenge
        // der Aufnahme.
        const a = { uuid: s.uuid, startedAtMs: s.startedAtMs, foilId: s.foilId,
          accelFile: s.accelFile, accelSamples: s.accelSamples, accelHz: this._accelHz(),
          accelChunkT0: s.accelChunkT0, gpsLastMs: s.gpsLastMs };
        if (s.gpsFile) { a.gpsFile = s.gpsFile; a.gpsCount = s.gpsCount; }
        else a.gps = s.gps;                       // Rueckfall ohne Datei
        store.setItem("active", JSON.stringify(a));
      } catch (e) {}
    },
    recoverActive() {
      let a = null; try { a = JSON.parse(store.getItem("active", "null")); } catch (e) {}
      // Zwei Formate: seit 1.0.10 liegt die Spur in einer Datei, davor als Array im Eintrag.
      // Eine Aufnahme, die vor dem Update lief, muss trotzdem hochgehen.
      let gpsCount = 0;
      if (a && a.gpsFile) {
        // Die DATEIGROESSE zaehlt, nicht der gemerkte Stand: ein Absturz kann angehaengt haben,
        // ohne dass die Kopfdaten noch geschrieben wurden.
        try {
          const g = statSync({ path: a.gpsFile });
          if (g && g.size > 0) gpsCount = Math.floor(g.size / GPS_REC_BYTES);
        } catch (e) {}
      }
      // Ende der Aufnahme: aus dem LETZTEN Satz der Datei, nicht aus den Kopfdaten. Die werden
      // nur alle zehn Punkte geschrieben, nach einem Absturz laege das Ende sonst bis zu neun
      // Sekunden zu frueh. Ein Satz sind 18 Byte — das kostet nichts.
      let letzteMs = (a && a.gpsLastMs) || 0;
      if (gpsCount) {
        try {
          const fd = openSync({ path: a.gpsFile, flag: O_RDONLY });
          const buffer = new ArrayBuffer(GPS_REC_BYTES);
          const n = readSync({ fd, buffer, options: { position: (gpsCount - 1) * GPS_REC_BYTES,
            length: GPS_REC_BYTES } });
          try { closeSync({ fd }); } catch (e) {}
          if (n === GPS_REC_BYTES) letzteMs = bytesToGps(buffer, 1)[0][0];
        } catch (e) {}
      }
      const altGps = (a && a.gps && a.gps.length) ? a.gps : null;
      if (a && (gpsCount || altGps)) {
        const end = a.startedAtMs + (altGps ? (altGps[altGps.length - 1][0] || 0) : letzteMs);
        let samples = a.accelSamples || 0;
        try {
          const info = a.accelFile ? statSync({ path: a.accelFile }) : null;
          if (info && info.size > 0) samples = Math.floor(info.size / 6);
        } catch (e) {}
        const hz = a.accelHz || ACCEL_DEFAULT_HZ;
        const t0s = a.accelChunkT0 || [];
        // Fehlende Chunk-Startzeiten ergaenzen: die Kopfdaten werden nur alle zehn GPS-Punkte
        // geschrieben, nach einem Absturz fehlen also die letzten ein, zwei Eintraege.
        //
        // FORTSCHREIBEN statt neu rechnen. Bis 13.09.2026 stand hier
        //     t0s.push(Math.round(t0s.length * ACCEL_CHUNK_SAMPLES / hz * 1000))
        // — die mittlere Rate ab Null. Der Wert landet damit HINTER dem letzten echten Eintrag,
        // und ein einziger Rueckschritt genuegt: der Server verwirft dann die exakte Zeitachse
        // komplett und faellt auf die gemessene Durchschnittsrate zurueck (`timebase.py`:
        // „t0_ms nicht streng wachsend"). Belegt an einer 17-Minuten-Session, bei der genau der
        // LETZTE von 142 Eintraegen fehlte: 1 010 254 ms gemessen, 1 002 667 ms aus der Formel —
        // 7,6 Sekunden rueckwaerts, und die ganze Achse war hin. Genau die schlechtere Achse hat
        // am 10.08. schon einmal 124 Sekunden Fehler verursacht (docs/DATA-PIPELINE.md §9.1).
        const needed = Math.ceil(samples / ACCEL_CHUNK_SAMPLES);
        const schritt = Math.round(ACCEL_CHUNK_SAMPLES / hz * 1000);
        while (t0s.length < needed) {
          t0s.push(t0s.length ? t0s[t0s.length - 1] + schritt : 0);
        }
        const eintrag = { uuid: a.uuid, startedAtMs: a.startedAtMs, endedAtMs: end,
          foilId: a.foilId, accelFile: a.accelFile, accelSamples: samples,
          accelHz: hz, accelChunkT0: t0s };
        if (altGps) eintrag.gps = altGps;
        else { eintrag.gpsFile = a.gpsFile; eintrag.gpsCount = gpsCount; }
        const list = loadPending(); list.push(eintrag); savePending(list);
      } else if (a && (a.accelFile || a.gpsFile)) {
        // A session without a persisted GPS point cannot be analyzed or uploaded. Do not leave its
        // binary sensor files orphaned after a reboot during the first seconds of recording.
        if (a.accelFile) { try { rmSync({ path: a.accelFile }); } catch (e) {} }
        if (a.gpsFile) { try { rmSync({ path: a.gpsFile }); } catch (e) {} }
      }
      store.setItem("active", "");
    },

    // ---- Aufnahme ----
    start() {
      const s = this.state, now = Date.now();
      // Every start path goes through here (touchscreen, SELECT, and auto-start), so no session can
      // begin before a valid GPS position is available.
      if (!s.fix || s.uploading) return;
      this._setBrightMode("recording");
      s.recording = true; s.screen = "recording"; s.startedAtMs = now; s.uuid = makeUuid(now);
      s.gps = []; s.dist = 0; s.max = 0; s.hrSum = 0; s.hrN = 0; s.hrMax = 0; s.prev = null; s.page = 1; s.autoTicks = 0; s.upStatus = "";
      s._fi = 0;
      // Ueberleben bei Bildschirm-Aus: beim Aufwachen wieder DIESE App oeffnen. In try/catch wie
      // alles Ungetestete auf Hardware — schlaegt es fehl, laeuft die Aufnahme normal weiter.
      try { setWakeUpRelaunch({ relaunch: true }); } catch (e) {}
      this._resetRun();   // Lauf-Zähler/-Kennzahlen gehören zur Session (wie Garmin/Wear)
      this._startGps();
      this._startAccel();
      this.persistActive();
      this.hideBar();
      this.applyButton();
      this.renderRecording();
      canaryWrite(PHASE_RECORD);
      this._lockTouch();
    },
    stop() {
      const s = this.state, now = Date.now();
      this._stopGps();
      this._stopAccel();
      this._disableTouchLock();
      this._setBrightMode("idle", true);
      s.recording = false;
      canaryWrite(s.uploading ? PHASE_UPLOAD : PHASE_IDLE);
      const el = (now - s.startedAtMs) / 1000;
      s.last = { dur: el, dist: s.dist, avg: el > 0 ? s.dist / el * 3.6 : 0, max: s.max * 3.6 };
      if (this._gpsGesamt()) {
        s.screen = "summary"; s.upPct = 0; s.upStatus = t("up.keepOpen");
        const eintrag = { uuid: s.uuid, startedAtMs: s.startedAtMs, endedAtMs: now,
          foilId: s.foilId, accelFile: s.accelFile, accelSamples: s.accelSamples,
          accelHz: this._accelHz(), accelChunkT0: s.accelChunkT0.slice() };
        if (s.gpsFile) { eintrag.gpsFile = s.gpsFile; eintrag.gpsCount = s.gpsCount; }
        else eintrag.gps = s.gps.slice();
        const list = loadPending(); list.push(eintrag); savePending(list);
        store.setItem("active", "");
        this.applyButton(); this.renderSummary(); this.showBar(0);
        this.flushPending();
      } else {
        s.screen = "idle"; s.idlePage = 0; s.upStatus = t("rec.noData");
        if (s.accelFile) { try { rmSync({ path: s.accelFile }); } catch (e) {} }
        if (s.gpsFile) { try { rmSync({ path: s.gpsFile }); } catch (e) {} }
        store.setItem("active", "");
        this.applyButton(); this.renderIdle();
      }
    },
    done() { const s = this.state; s.screen = "idle"; s.idlePage = 0; s.upStatus = ""; this._setBrightMode(s.uploading ? "uploading" : "idle", true); try { setWakeUpRelaunch({ relaunch: false }); } catch (e) {} this.hideBar(); this.applyButton(); this.renderIdle(); },
    repair() { const s = this.state; store.setItem("deviceToken", ""); store.setItem("claimToken", ""); s.paired = false; s.code = ""; this.applyButton(); this.renderIdle(); this.beginPairing(); },

    // ---- Upload / Offline-Queue ----
    uploadSession(sess, onProg) {
      const tok = getTok();
      if (!tok) return Promise.reject(new Error("not paired"));
      // app_version: dieselbe Konstante, die der Update-Hinweis vergleicht -> der Server haengt
      // die Version an die Session (bisher kannte er sie nur vom Geraet, aus dem CONFIG-Abruf).
      const hasAccel = !!(sess.accelFile && sess.accelSamples > 0);
      const accelHz = hasAccel ? (sess.accelHz || ACCEL_DEFAULT_HZ) : 0;
      const meta = { session_uuid: sess.uuid, started_at_ms: sess.startedAtMs, sport: "pumpfoil",
        gps_hz: GPS_HZ, accel_hz: accelHz, accel_scale: hasAccel ? ACCEL_SCALE : 0, app_version: APP_VERSION };
      if (sess.foilId != null) meta.foil_id = sess.foilId;   // gewählte Foil (Metadaten)
      // Seit 1.0.10 liegt die Spur in einer Datei. Der alte Weg ueber das Array bleibt drin:
      // Aufnahmen, die vor dem Update gemacht wurden, warten noch in der Warteschlange (Cesar hat
      // genau so eine) und muessen weiter hochgehen.
      const gpsAusDatei = !!(sess.gpsFile && sess.gpsCount > 0);
      const gpsAnzahl = gpsAusDatei ? sess.gpsCount : ((sess.gps && sess.gps.length) || 0);
      const gpsChunkCount = Math.ceil(gpsAnzahl / GPS_CHUNK);
      const accelChunkCount = hasAccel ? Math.ceil(sess.accelSamples / ACCEL_CHUNK_SAMPLES) : 0;
      const dataChunkCount = gpsChunkCount + accelChunkCount;
      // Wo der letzte Versuch stehen geblieben ist. Nie weiter als das, was es zu senden gibt —
      // sonst bliebe nach einer Aenderung an den Blockgroessen ein Rest ungesendet.
      const marke = ladeMarke(sess.uuid);
      const vonGps = Math.min(marke.gps, gpsChunkCount);
      const vonAccel = Math.min(marke.accel, accelChunkCount);
      // Die Anzeige zaehlt das schon Erledigte mit, sonst faengt ein fortgesetzter Upload
      // wieder bei "1/2341" an, obwohl er in Wahrheit bei 109 weitermacht.
      const total = dataChunkCount + 2; let done = vonGps + vonAccel;
      // done/total gehen MIT: die Anzeige zeigt "5/34" statt Prozent (Jan, 10.09.2026 —
      // "das abkuerzen als 'Uploading 5/34'"). Der Balken braucht weiter die Prozent.
      const bump = () => { done++; if (onProg) onProg(Math.min(100, Math.round(done / total * 100)), done, total); };
      // Direkter this.request (wie Pairing) — kein Retry (der würde Folge-Requests feuern);
      // r.ok muss echt kommen, sonst Fehler (kein Schein-Erfolg).
      const req = (p) => this.reqQ(p).then((r) => {
        if (r && r.error) throw new Error(r.error);
        if (!r || r.ok !== true) throw new Error(t("up.serverUnreach"));
        return r;
      });
      // Bloecke NACHEINANDER senden, ohne die Promises aneinanderzuhaengen.
      //
      // WARUM NICHT REKURSIV (Fehlerbild vom 13.09.2026, GitHub #4, César/mesarpe): die alte
      // Fassung gab die Promise des NAECHSTEN Blocks zurueck —
      //     return req({...}).then(() => sendGpsChunk(index + 1));
      // Damit blieb Ebene 0 offen, bis die letzte Ebene fertig war, und weil die `.then`-Funktion
      // im Gueltigkeitsbereich von `sendGpsChunk(index)` entsteht, hielt sie diesen Bereich samt
      // `data` am Leben. Es lag also nicht EIN Block im Speicher, sondern alle bisherigen. Bei
      // einer Zwei-Stunden-Session (2339 Bloecke) starb die Uhr bei Block 108 mit "Out of Memory"
      // — noch in den GPS-Bloecken, die Accel-Datei war da nicht einmal geoeffnet. Die Absicht im
      // alten Kommentar ("build and release one slice at a time") war richtig; die Promise-Kette
      // hat sie zunichte gemacht.
      //
      // `folge` ruft den naechsten Schritt AUS dem Erfolgs-Handler heraus auf und gibt ihn NICHT
      // zurueck. Damit endet der Gueltigkeitsbereich jedes Schrittes, sobald er gesendet ist, und
      // offen ist immer nur die eine aeussere Promise. Der Aufrufstapel waechst nicht mit: jeder
      // Schritt laeuft in einer eigenen Microtask.
      const folge = (von, anzahl, schritt) => new Promise((fertig, fehler) => {
        const naechster = (i) => {
          if (i >= anzahl) return fertig();
          let p;
          try { p = schritt(i); } catch (e) { return fehler(e); }
          p.then(() => {
            // ACHTUNG, der Preis der Schleife: dieser Schritt haengt an KEINER Promise mehr, die
            // jemand prueft. Wirft hier etwas — und `bump()` zeichnet den Bildschirm neu, also
            // UI-Code —, stirbt die Kette STUMM: die aeussere Promise wird nie erfuellt,
            // `s.uploading` bleibt true, und der Upload-Knopf tut bis zum App-Neustart nichts
            // mehr. Die alte rekursive Fassung hat solche Fehler nach aussen gereicht; hier muss
            // man sie von Hand weiterreichen. (Gefunden 13.09.2026 beim Emulator-Test.)
            try { bump(); naechster(i + 1); } catch (e) { fehler(e); }
          }, fehler);
        };
        naechster(von);
      });

      // Wasserstand nur alle 25 Bloecke schreiben. Jeder Schreibvorgang geht in den Flash; bei
      // 2341 Bloecken waeren das 2341 Schreibzugriffe fuer nichts. Verliert ein Absturz die
      // letzten paar Bloecke, werden sie beim naechsten Versuch erneut gesendet — der Server
      // ueberschreibt gleiche (Session, Art, Index).
      const gpsMarke = (index) => {
        if (index % 25 === 24 || index === gpsChunkCount - 1) setzeMarke(sess.uuid, index + 1, vonAccel);
      };

      // Aus der Datei: immer nur EIN Block im Speicher, genau wie beim Accelerometer.
      const sendGpsAusDatei = () => {
        let fd = -1;
        try { fd = openSync({ path: sess.gpsFile, flag: O_RDONLY }); }
        catch (e) { return Promise.reject(new Error("gps file unavailable")); }
        const send = folge(vonGps, gpsChunkCount, (index) => {
          const von = index * GPS_CHUNK;
          const count = Math.min(GPS_CHUNK, gpsAnzahl - von);
          const byteLength = count * GPS_REC_BYTES;
          const buffer = new ArrayBuffer(byteLength);
          let bytesRead = 0;
          try {
            bytesRead = readSync({ fd, buffer, options: { position: von * GPS_REC_BYTES,
              length: byteLength } });
          } catch (e) { return Promise.reject(e); }
          if (bytesRead !== byteLength) return Promise.reject(new Error("short gps read"));
          const data = bytesToGps(buffer, count);
          return req({ method: "CHUNK", token: tok, session_uuid: sess.uuid, index,
                       kind: "gps", encoding: "json", count, data })
            .then((r) => { gpsMarke(index); return r; });
        });
        return send.then((value) => { try { closeSync({ fd }); } catch (e) {} return value; },
          (err) => { try { closeSync({ fd }); } catch (e) {} throw err; });
      };

      // Rueckfall: Spur steht als Array im Eintrag (Aufnahmen von vor 1.0.10).
      const sendGpsAusArray = () => folge(vonGps, gpsChunkCount, (index) => {
        const von = index * GPS_CHUNK;
        const data = sess.gps.slice(von, von + GPS_CHUNK);
        return req({ method: "CHUNK", token: tok, session_uuid: sess.uuid, index,
                     kind: "gps", encoding: "json", count: data.length, data })
          .then((r) => {
            // Gesendete Punkte SOFORT freigeben. `flushPending` hat die ganze Warteschlange per
            // JSON.parse im Speicher — bei zwei Stunden sind das rund 7200 Punkte und damit gut
            // 1,2 MB, die liegen, bevor der erste Block rausgeht. Genau daran ist der Upload
            // gestorben (GitHub #4: „Out of Memory" bei Block 108 von 2341, noch in den
            // GPS-Bloecken). Ab hier sinkt der Verbrauch waehrend des Uploads, statt zu stehen.
            //
            // UNGEFAEHRLICH, weil `list` in `flushPending` nur eine PARSE-KOPIE ist: der
            // persistente Stand in `store` wird erst bei `removePending` angefasst. Bricht der
            // Upload ab, faellt diese Kopie weg und der naechste Versuch liest frisch.
            for (let i = von; i < von + data.length; i++) sess.gps[i] = 0;
            gpsMarke(index);
            return r;
          });
      });

      const sendGpsChunks = () => (!gpsChunkCount ? Promise.resolve()
        : gpsAusDatei ? sendGpsAusDatei() : sendGpsAusArray());
      const sendAccelChunks = () => {
        if (!accelChunkCount) return Promise.resolve();
        let fd = -1;
        try { fd = openSync({ path: sess.accelFile, flag: O_RDONLY }); }
        catch (e) { return Promise.reject(new Error("accelerometer file unavailable")); }
        // Dieselbe Kette wie oben, und hier waere sie noch teurer: je Ebene haengen ein
        // ArrayBuffer (768 Byte) UND die Base64-Zeichenkette (~1 KB) mit drin.
        const send = folge(vonAccel, accelChunkCount, (index) => {
          const count = Math.min(ACCEL_CHUNK_SAMPLES, sess.accelSamples - index * ACCEL_CHUNK_SAMPLES);
          const byteLength = count * 6;
          const buffer = new ArrayBuffer(byteLength);
          let bytesRead = 0;
          try {
            bytesRead = readSync({ fd, buffer, options: { position: index * ACCEL_CHUNK_SAMPLES * 6,
              length: byteLength } });
          } catch (e) { return Promise.reject(e); }
          if (bytesRead !== byteLength) return Promise.reject(new Error("short accelerometer read"));
          const data = bytesToBase64(new Uint8Array(buffer), bytesRead);
          const t0s = sess.accelChunkT0 || [];
          const t0 = t0s[index] != null ? t0s[index] : Math.round(index * ACCEL_CHUNK_SAMPLES / accelHz * 1000);
          return req({ method: "CHUNK", token: tok, session_uuid: sess.uuid, index,
                       kind: "accel", encoding: "int16-b64", t0_ms: t0, count, data })
            .then((r) => {
              if (index % 25 === 24 || index === accelChunkCount - 1)
                setzeMarke(sess.uuid, gpsChunkCount, index + 1);
              return r;
            });
        });
        return send.then((value) => { try { closeSync({ fd }); } catch (e) {} return value; },
          (err) => { try { closeSync({ fd }); } catch (e) {} throw err; });
      };
      return req({ method: "START", token: tok, meta }).then(() => { bump(); return sendGpsChunks(); })
        .then(() => sendAccelChunks())
        .then(() => req({ method: "COMPLETE", token: tok, session_uuid: sess.uuid,
                          ended_at_ms: sess.endedAtMs, total_chunks: dataChunkCount })).then(bump);
    },
    flushPending() {
      const s = this.state;
      // connect(), heartbeat, the upload button, and stop() may all request a flush. Only one worker
      // may read and mutate the persistent queue; otherwise progress callbacks interleave and the
      // same session is uploaded multiple times concurrently.
      if (s.uploading) return;
      const inSummary = s.screen === "summary";
      const list = loadPending();
      if (!getTok()) { if (list.length) { s.upStatus = t("up.later") + " (" + list.length + ")"; this.rerender(); } return; }
      if (!list.length) { if (inSummary) { s.upStatus = "✓ " + t("up.done"); this.showBar(100); this.renderSummary(); } this.applyButton(); return; }
      s.uploading = true;
      canaryWrite(PHASE_UPLOAD);
      // Upload requires the Device App to stay alive for BLE/ZML. Keep the page awake for the whole
      // worker lifetime; the normal five-minute idle policy resumes on completion or failure.
      this._setBrightMode("uploading");
      console.log("[pumpfoil] upload worker start sessions=" + list.length);
      // KURZ: "Upload laeuft 5/34". Vorher stand hier zusaetzlich der Prozentwert UND
      // "App offen lassen!" — auf einer runden Uhr lief die Zeile weit ueber den Rand.
      // Das "…" aus up.running fliegt raus, sonst stuende "Upload laeuft… 5/34".
      // Der Hinweis, die App offen zu lassen, steht jetzt EINMAL am Anfang (s. stop()).
      // Neu gezeichnet wird nur, wenn sich das ANGEZEIGTE aendert — also beim Prozentsprung.
      // Vorher lief bei JEDEM Block ein voller Bildaufbau: bei einer Zwei-Stunden-Session sind
      // das 2341 Neuzeichnungen fuer 100 sichtbare Zustaende. Das kostete Rechenzeit, die dem
      // Aufraeumen fehlte, und liess die Uhr waehrend des Uploads traege wirken.
      let letztesPct = -1;
      const onProg = (pct, done, total) => { s.upPct = pct;
        s.upStatus = t("up.running").replace("…", "") + " " + done + "/" + total;
        if (pct === letztesPct) return;
        letztesPct = pct;
        if (inSummary) { this.showBar(pct); this.renderSummary(); } else this.renderIdle(); };
      const step = (i) => {
        if (i >= list.length) {
          s.uploading = false;
          canaryWrite(PHASE_IDLE);
          this._setBrightMode("idle", true);
          console.log("[pumpfoil] upload worker done");
          s.upStatus = "✓ " + t("up.done"); if (inSummary) { this.showBar(100); this.renderSummary(); } else this.renderIdle(); this.applyButton(); return;
        }
        const sess = list[i];
        this.uploadSession(sess, onProg)
          .then(() => {
            if (sess.accelFile) { try { rmSync({ path: sess.accelFile }); } catch (e) {} }
            if (sess.gpsFile) { try { rmSync({ path: sess.gpsFile }); } catch (e) {} }
            loescheMarke(sess.uuid);   // Session ist durch — der Wasserstand hat keinen Zweck mehr
            removePending(sess.uuid); step(i + 1);
          })
          .catch((err) => {
            s.uploading = false;
            canaryWrite(PHASE_IDLE);
            this._setBrightMode("idle", true);
            console.log("[pumpfoil] upload worker failed " + ((err && err.message) || "?"));
            s.upStatus = t("common.error") + ": " + ((err && err.message) || "?"); this.rerender(); this.applyButton();
          });
      };
      step(0);
    },

    onDestroy() {
      const s = this.state;
      // Sauberes Ende: die Marke darf nicht liegenbleiben, sonst meldet der naechste Start
      // einen Absturz, den es nie gab.
      canaryClear();
      this._setBrightMode("system");
      if (s.timer) clearInterval(s.timer);
      if (s.pollTimer) clearTimeout(s.pollTimer);
      if (s.hbTimer) clearInterval(s.hbTimer);
      if (s.stopBackTimer) clearTimeout(s.stopBackTimer);
      this._disableTouchLock();
      if (s.recording) { this._stopGps(); this._stopAccel(); this.persistActive(); }
      try { offGesture(); } catch (e) {}
      try { s.geo && s.geoCallback && s.geo.offChange && s.geo.offChange(s.geoCallback); } catch (e) {}
      try { s.geo && s.geo.stop && s.geo.stop(); } catch (e) {}
      try { s.hrSensor && s.hrCallback && s.hrSensor.offCurrentChange(s.hrCallback); } catch (e) {}
    },
  })
);
