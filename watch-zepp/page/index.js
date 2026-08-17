import * as hmUI from "@zos/ui";
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
import { BasePage } from "@zeppos/zml/base-page";
import { Geolocation, HeartRate, Accelerometer, Vibrator, Buzzer, FREQ_MODE_HIGH } from "@zos/sensor";
import { openSync, closeSync, writeSync, readSync, statSync, rmSync,
         O_RDONLY, O_RDWR, O_CREAT, O_TRUNC } from "@zos/fs";
import { TITLE, PAGE, F0V, F0L, F1V, F1L, F2V, F2L, STATUS, BUTTON } from "zosLoader:./index.[pf].layout.js";

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
const DEV_FAKE_GPS = false;  // true = synthetische GPS-Spur (nur Simulator-UI-Demo; echte Uhr: false)
// MUSS mit version.name in ../app.json übereinstimmen — beides beim Bump ändern. (Zur Laufzeit
// aus dem Paket lesen ginge nur über einen weiteren @zos-Import; die sind hier ungetestet und
// können beim Laden crashen, deshalb bewusst eine Konstante.) Der Bump auf 1.0.4 hatte nur
// app.json getroffen: die Uhr zeigte weiter "v1.0.3" und meldete das auch dem Server.
const APP_VERSION = "1.0.5";
const DW = (() => { try { return getDeviceInfo().width; } catch (e) { return 480; } })();
const DH = (() => { try { return getDeviceInfo().height; } catch (e) { return 480; } })();
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

const store = new LocalStorage();
const getTok = () => store.getItem("deviceToken", "") || "";
const getClaim = () => store.getItem("claimToken", "") || "";
const loadPending = () => { try { return JSON.parse(store.getItem("pending", "[]")) || []; } catch (e) { return []; } };
const savePending = (a) => { try { store.setItem("pending", JSON.stringify(a)); } catch (e) {} };
const removePending = (uuid) => savePending(loadPending().filter((s) => s.uuid !== uuid));

const makeUuid = (now) => "zepp-" + now + "-" + Math.floor(Math.random() * 1e9).toString(36);
const pad = (n) => (n < 10 ? "0" + n : "" + n);
const mmss = (sec) => Math.floor(sec / 60) + ":" + pad(Math.floor(sec % 60));
const fmtDist = (m) => (m < 1000 ? Math.round(m) + " m" : (m / 1000).toFixed(2) + " km");
function distM(a, b, c, d) {
  const R = 6371000, r = Math.PI / 180, dLat = (c - a) * r, dLon = (d - b) * r;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
// Handy/Companion per BLE verbunden? (Uhr hat kein eigenes Internet.) Fallback true, falls API fehlt.
const bleOk = () => { try { return getConnectStatus() !== false; } catch (e) { return true; } };
const accelPath = (uuid) => "accel-" + uuid + ".bin";
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
const LANGS = ["de", "gsw", "de-AT", "en", "fr", "it", "es", "pt", "id", "ru", "nl", "fi", "cs", "ja", "zh", "nb"];
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
  "pair.gen":        ["Code erzeugen", "Code erzüge", "Code erzeugen", "Generate code", "Générer un code", "Genera codice", "Generar código", "Gerar código", "Buat kode", "Создать код", "", "", "", "コードを生成", "生成代码"],
  "pair.code":       ["Pairing-Code", "Pairing-Code", "Pairing-Code", "Pairing code", "Code", "Codice", "Código", "Código", "Kode", "Код", "Koppelcode", "Koodi", "Párovací kód", "コード", "代码"],
  "pair.enterThere": ["eingeben", "yygeh", "eingeben", "enter it there", "à saisir ici", "inseriscilo", "introdúcelo", "insira aqui", "masukkan", "введите", "daar invoeren", "syötä se siellä", "zadejte tam"],
  "rec.repair":      ["Neu verbinden", "Neu verbinde", "Neu verbinden", "Reconnect", "Reconnecter", "Ricollega", "Reconectar", "Reconectar", "Hubungkan ulang", "Переподключить", "Opnieuw koppelen", "", "Spárovat znovu", "再接続", "重新连接"],

  // -- Aufnahme / Tasten --
  // START/STOPP sind Grossbuchstaben-Buttons; Wortlaut = Wear rec.start/rec.stop, nur gross.
  "btn.start":       ["START", "START", "START", "START", "DÉMARRER", "AVVIA", "INICIAR", "INICIAR", "MULAI", "СТАРТ", "", "", "", "スタート", "开始"],
  "btn.stop":        ["STOPP", "STOPP", "STOPP", "STOP", "ARRÊTER", "STOP", "PARAR", "PARAR", "BERHENTI", "СТОП", "", "", "", "ストップ", "停止"],
  "rec.stopHold":    ["Halten", "Halte", "Halten", "Hold", "Maintenir", "Tieni", "Mantén", "Segurar", "Tahan", "Держать", "Vasthouden", "Pidä", "Podržet", "長押し", "长按"],
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
  "rec.uploadNow":   ["Jetzt hochladen", "Jetz ueglade", "Jetzt hochladen", "Upload now", "Envoyer maintenant", "Carica ora", "Subir ahora", "Enviar agora", "Unggah sekarang", "Загрузить сейчас", "", "", "", "今すぐアップロード", "立即上传"],

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
  "common.done":     ["Fertig", "Fertig", "Fertig", "Done", "Terminé", "Fatto", "Listo", "Concluído", "Selesai", "Готово", "", "", "", "完了", "完成"],
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
  "f.runTime":       ["Lauf-Zeit", "Lauf-Ziit", "Lauf-Zeit", "Run time", "Temps run", "Tempo run", "Tiempo run", "Tempo run", "Waktu run", "Время заезда", "", "", "", "ラン時間", "航段时间"],
  "f.runDist":       ["Lauf-Dist", "Lauf-Dist", "Lauf-Dist", "Run dist", "Dist run", "Dist run", "Dist run", "Dist run", "Jarak run", "Дист заезда", "", "", "", "ラン距離", "航段距离"],
  // „Lauf läuft" — Garmin-Wortlaut (watch/source/Strings.mc f.runActive, 13 Spalten); ja/zh gibt es
  // dort nicht und Wear kennt den Key gar nicht -> leer = Englisch, statt zu raten.
  "f.runActive":     ["Lauf läuft", "Lauf lauft", "Lauf läuft", "run active", "run actif", "run attivo", "run activo", "run ativo", "run aktif", "заезд идёт", "run actief", "veto käynnissä", "jízda aktivní"],
  "f.lastRunTime":   ["letzte Zeit", "letschti Ziit", "letzte Zeit", "last time", "dern. temps", "ult. tempo", "últ. tiempo", "último tempo", "waktu terakhir", "посл время", "", "", "", "前回の時間", "上次时间"],
  "f.lastRunDist":   ["letzte Dist", "letschti Dist", "letzte Dist", "last dist", "dern. dist", "ult. dist", "últ. dist", "última dist", "jarak terakhir", "посл дист", "", "", "", "前回の距離", "上次距离"],
  "f.lastRunAvg":    ["letzter Ø", "letschte Ø", "letzter Ø", "last avg", "dern. moy", "ult. media", "últ. med", "última méd", "rata terakhir", "посл средн", "", "", "", "前回の平均", "上次平均"],
  "f.lastRunMax":    ["letzter max", "letschte max", "letzter max", "last max", "dern. max", "ult. max", "últ. máx", "último máx", "maks terakhir", "посл макс", "", "", "", "前回の最大", "上次最高"],
  "f.lastRunMaxHr":  ["letzter max bpm", "letschte max bpm", "letzter max bpm", "last max bpm", "dern. max bpm", "ult. max bpm", "últ. máx bpm", "último máx bpm", "maks terakhir bpm", "посл макс bpm", "", "", "", "前回の最大心拍", "上次最高心率"],
};
// Norwegisch (Bokmål) als OVERLAY statt 16. Spalte: die Zeilen oben haben teils weniger
// Eintraege (fehlende Sprache = Englisch), ein Anhaengen waere dort ins Leere gelaufen.
// Anlass: erster norwegischer Nutzer (Sogndal, 05.08.2026); nn/no landen ebenfalls hier.
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
  "rec.stopHold": "Hold",
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
  // Norwegisch kommt aus dem Overlay (die Zeilen oben haben keine Spalte 15) -> sonst Englisch.
  if (LI === 15) {
    const v = NB[k];
    if (v) { return v; }
  }
  const row = S[k];
  if (row == null) { return k; }
  if (typeof row === "string") { return row; }
  const sp = LI === 15 ? 3 : LI;
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
// Farbe nach Wert in VIER STUFEN (Garmin _speedColor 12/16/20 km/h, Web-Vorschau, Wear) —
// kein stufenloser Verlauf. Puls-Buckets 120/150/170 wie Wear hrColor.
const laySpeedColor = (kmh) => (kmh < 12 ? 0x3b82f6 : kmh < 16 ? 0x22c55e : kmh < 20 ? 0xeab308 : 0xef4444);
const layHrColor = (bpm) => (bpm <= 0 ? null : bpm < 120 ? 0x22c55e : bpm < 150 ? 0xeab308 : bpm < 170 ? 0xf97316 : 0xef4444);

// Recorder wie Garmin. Wischbare Seiten:
//   Ruhe:     0 Daten(+START) · 1 Verbindung/Code · 2 Upload-Queue
//   Aufnahme: 0..N-1 Datenseiten (kein Button) · N Stopp-Screen(+STOPP)
// GPS ab Ruhe-Screen, Auto-Start, Pairing+Upload im Hintergrund. Aufnahme wird laufend persistent
// gepuffert (Absturz-sicher); nach Stopp Summary mit Upload-Fortschritt; offline -> später senden.
Page(
  BasePage({
    state: {
      screen: "idle", idlePage: 0, page: 0,
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
      views: [[1, 3, 4]], offFoil: [12, 17, 16], autoStart: false,
      // Seiten-Sätze je Zustand (Server, getaggte Listen: [0,a,b,c] klassisch | [1,bg,[el…]] Layout).
      // browseAll = im Off-Foil-Zustand auch durch die On-Foil-Seiten blättern. _ringKey cached den
      // zuletzt gebauten Ring (Zustand + Layout-Schalter) — bei Config-Änderung auf null setzen.
      pages: [], offFoilPages: [], browseAll: true, _ringCache: null, _ringKey: null,
      // Update-Hinweis + Layout-Zustand. layoutsPref wird aus LocalStorage geladen (siehe init),
      // null = automatisch; layoutsServerDefault ist nur die Vorbelegung vom Server.
      updateVersion: "", layoutsPref: null, layoutsServerDefault: false,
      // Foil & Alarm (entkoppelt): Foil = Metadaten (+ Auto-Schwellen); Alarm An/Aus; Quelle Auto/Manuell.
      foils: [], foilId: null, foilLabel: "—", almOn: false, almSrc: "foil", almLow: 0, almHigh: 0,
      vibrator: null, buzzer: null, _almActive: false, _foilInit: false,
      timer: null, pollTimer: null, hbTimer: null, lockTimer: null, unlockTimer: null,
      touchLocked: false, brightMode: "system", brightUntilMs: 0,
      geo: null, geoSpeedPrev: null, hrSensor: null, hrCallback: null, hrUpdatedMs: 0, _hrLogged: false, w: {},
      accelSensor: null, accelCallback: null, accelFd: -1, accelBuffer: [], accelSamples: 0,
      accelFirstMs: 0, accelLastMs: 0, accelChunkT0: [], accelFile: "", _accelLogged: false,
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

    _flushAccelBuffer() {
      const s = this.state;
      if (s.accelFd < 0 || !s.accelBuffer.length) return;
      const values = s.accelBuffer;
      const buffer = new ArrayBuffer(values.length * 2);
      const view = new DataView(buffer);
      for (let i = 0; i < values.length; i++) view.setInt16(i * 2, values[i], true);
      try {
        const written = writeSync({ fd: s.accelFd, buffer });
        if (written !== buffer.byteLength) throw new Error("short accelerometer write");
        s.accelBuffer = [];
      } catch (e) {
        console.log("[pumpfoil] accelerometer write failed " + ((e && e.message) || e));
      }
    },

    _startAccel() {
      const s = this.state;
      s.accelFile = accelPath(s.uuid); s.accelBuffer = []; s.accelSamples = 0;
      s.accelFirstMs = 0; s.accelLastMs = 0; s.accelChunkT0 = []; s._accelLogged = false;
      try {
        s.accelFd = openSync({ path: s.accelFile, flag: O_RDWR | O_CREAT | O_TRUNC });
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
        s.accelSensor.setFreqMode(FREQ_MODE_HIGH);
        s.accelSensor.start();
      } catch (e) {
        console.log("[pumpfoil] accelerometer unavailable " + ((e && e.message) || e));
        this._stopAccel();
      }
    },

    _stopAccel() {
      const s = this.state;
      try { s.accelSensor && s.accelCallback && s.accelSensor.offChange(s.accelCallback); } catch (e) {}
      try { s.accelSensor && s.accelSensor.stop(); } catch (e) {}
      this._flushAccelBuffer();
      try { if (s.accelFd >= 0) closeSync({ fd: s.accelFd }); } catch (e) {}
      s.accelFd = -1; s.accelSensor = null; s.accelCallback = null;
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
      // Sprache aus der letzten Sitzung (vom Server geliefert, s. connect()) — VOR dem ersten
      // Rendern setzen, damit die App auch offline/ungepairt gleich in der richtigen Sprache
      // startet. Leer/unbekannt -> Englisch.
      setLang(store.getItem("lang", ""));
      this._setBrightMode("idle", true);
      w.title = hmUI.createWidget(hmUI.widget.TEXT, { ...TITLE });
      w.page = hmUI.createWidget(hmUI.widget.TEXT, { ...PAGE });
      w.f = [
        [hmUI.createWidget(hmUI.widget.TEXT, { ...F0V }), hmUI.createWidget(hmUI.widget.TEXT, { ...F0L })],
        [hmUI.createWidget(hmUI.widget.TEXT, { ...F1V }), hmUI.createWidget(hmUI.widget.TEXT, { ...F1L })],
        [hmUI.createWidget(hmUI.widget.TEXT, { ...F2V }), hmUI.createWidget(hmUI.widget.TEXT, { ...F2L })],
      ];
      w.status = hmUI.createWidget(hmUI.widget.TEXT, { ...STATUS });
      w.ver = hmUI.createWidget(hmUI.widget.TEXT, { x: 0, y: TITLE.y + TITLE.h, w: DW, h: px(22), color: 0x64748b, text_size: px(18), align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V, text: "v" + APP_VERSION });

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
                if (long || click) this._showTouchLock();
                return true;
              }
              return false;
            }
            if (!long && !click) return false;      // PRESS/RELEASE ignorieren (sonst doppelt)
            if (s.recording) {
              if (key === KEY_SELECT && long) { this.stop(); return true; }
              if ((key === KEY_UP || key === KEY_DOWN) && long) {
                this._unlockTouchTemporarily();
                return true;
              }
              if (key === KEY_SELECT && click) { if (s.touchLocked) this._showTouchLock(); return true; }
              if (!click || (key !== KEY_UP && key !== KEY_DOWN)) return false;
              if (s.touchLocked) this._showTouchLock();
              // Seitenzahl aus dem Ring des AKTUELLEN Zustands (on-foil/off-foil), nicht mehr aus
              // s.views — die Sätze sind unterschiedlich lang (s. _ring).
              const last = this._ringLen() + 1;
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
            } catch (e) { return false; }
          },
        });
      } catch (e) {}

      onGesture({
        callback: (e) => {
          if (s.recording && s.touchLocked) { this._showTouchLock(); return true; }
          const dir = (e === GESTURE_LEFT || e === GESTURE_UP) ? 1
                    : (e === GESTURE_RIGHT || e === GESTURE_DOWN) ? -1 : 0;
          if (dir === 0) return false;
          if (s.recording) {
            // Seiten: [STOPP] + Ring des Zustands + [STOPP] — beide Enden = Stop-Screen, kein Wrap.
            const last = this._ringLen() + 1;
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

      try { s.geo = new Geolocation(); s.geo.start(); } catch (e) {}
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
      this.reqQ({ method: "CONFIG", token: getTok(), version: APP_VERSION, model: DEVICE_MODEL,
                  wantLayouts: s.layoutsPref !== false }).then((r) => {
        if (r && r.revoked) { store.setItem("deviceToken", ""); s.paired = false; this.beginPairing(); return; }
        // Update-Hinweis: neuere Version im Store als die hier laufende -> kurz anzeigen.
        if (r && r.latestVersion && r.latestVersion !== APP_VERSION) s.updateVersion = r.latestVersion;
        // Profil-Sprache (kam schon immer mit, wurde nur nie ausgewertet). Persistieren, damit der
        // naechste App-Start auch ohne Verbindung sofort richtig lokalisiert ist. Server schickt ""
        // wenn im Profil keine Sprache steht -> setLang() faellt dann auf Englisch.
        if (r && typeof r.language !== "undefined") { store.setItem("lang", r.language || ""); setLang(r.language); }
        if (r && typeof r.layoutsOn !== "undefined") s.layoutsServerDefault = !!r.layoutsOn;
        if (r && Array.isArray(r.views) && r.views.length) s.views = r.views;
        if (r && Array.isArray(r.offFoilView) && r.offFoilView.length) s.offFoil = r.offFoilView;
        if (r && typeof r.autoStart !== "undefined") s.autoStart = !!r.autoStart;
        // Seiten-Sätze (F3). Der Server liefert getaggte Listen INLINE — es gibt keine Layout-IDs
        // und kein `layouts`-Wörterbuch (server/app/api/devices.py:_layouts_for_watch):
        //   [0,a,b,c]         klassische Seite mit drei Feld-IDs
        //   [1,bg,[elemente]] eigenes Layout, Hintergrund + Elemente inline
        // `pausePages` wird BEWUSST nicht gelesen: die Zepp-App hat kein manuelles Pausieren
        // (Taste halten = Stopp), der Zustand kann also nie eintreten.
        if (r && Array.isArray(r.pages) && r.pages.length) s.pages = r.pages;
        if (r && Array.isArray(r.offFoilPages) && r.offFoilPages.length) s.offFoilPages = r.offFoilPages;
        if (r && typeof r.browseAll !== "undefined") s.browseAll = !!r.browseAll;
        // Ring + gezeichnete Layout-Widgets neu aufbauen lassen (Inhalt kann sich geändert haben).
        s._ringKey = null; s.w.layKey = null;
        // Foil-/Alarm-Config übernehmen; Default-Auswahl einmalig (bis App-Ende).
        if (r && Array.isArray(r.foils)) s.foils = r.foils.map((f) => ({ id: f.id, label: f.label, min: f.min, max: f.max }));
        if (r) { s.almLow = r.speedLow || 0; s.almHigh = r.speedHigh || 0; }
        if (r && !s._foilInit) {
          s._foilInit = true;
          s.almOn = !!r.alarmEnabled;
          if ((r.alarmDefault || "foil") === "foil" && s.foils.length) { s.foilId = s.foils[0].id; s.foilLabel = s.foils[0].label; s.almSrc = "foil"; }
          else { s.foilId = null; s.foilLabel = "—"; s.almSrc = "manual"; }
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
      if (s.recording) return;
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
    _showTouchLock() {
      const s = this.state, w = s.w;
      if (!s.recording || !s.touchLocked || !w.touchShield) return;
      if (s.lockTimer) { clearTimeout(s.lockTimer); s.lockTimer = null; }
      if (!w.lockIcon) {
        w.lockIcon = w.touchShield.createWidget(hmUI.widget.TEXT, {
          x: 0, y: Math.round(DH * 0.32), w: DW, h: Math.round(DH * 0.28),
          text: "🔒", text_size: Math.round(DH * 0.16), color: WHITE,
          align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
        });
        try { w.lockIcon.setEnable(false); } catch (e) {}
      }
      s.lockTimer = setTimeout(() => {
        try { if (w.lockIcon) hmUI.deleteWidget(w.lockIcon); } catch (e) {}
        w.lockIcon = null; s.lockTimer = null;
      }, 1200);
    },
    _lockTouch() {
      const s = this.state, w = s.w;
      if (!s.recording) return;
      if (s.unlockTimer) { clearTimeout(s.unlockTimer); s.unlockTimer = null; }
      s.touchLocked = true;
      if (w.touchShield) return;
      console.log("[pumpfoil] touch locked");
      // A transparent modal container stays above the recording widgets and absorbs water taps.
      w.touchShield = hmUI.createWidget(hmUI.widget.VIEW_CONTAINER, {
        x: 0, y: 0, w: DW, h: DH, z_index: 6, modal: 1, scroll_enable: 0,
      });
      w.touchCanvas = w.touchShield.createWidget(hmUI.widget.CANVAS, { x: 0, y: 0, w: DW, h: DH });
      w.touchCanvas.addEventListener(hmUI.event.CLICK_DOWN, () => this._showTouchLock());
    },
    _removeTouchShield() {
      const s = this.state, w = s.w;
      if (s.lockTimer) { clearTimeout(s.lockTimer); s.lockTimer = null; }
      try { if (w.touchShield) hmUI.deleteWidget(w.touchShield); } catch (e) {}
      w.touchShield = null; w.touchCanvas = null; w.lockIcon = null;
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
    applyButton() {
      const s = this.state;
      if (s.recording) {
        if (s.page === 0 || s.page >= this._ringLen() + 1) this.setButton(t("btn.stop"), RED, RED_P, WHITE, () => this.stop());
        else this.hideButton();
      } else if (s.screen === "summary") {
        this.setButton(t("common.done"), CYAN, CYAN_P, INK, () => this.done());
      } else if (s.idlePage === 0) {
        if (s.fix && !s.uploading) this.setButton(t("btn.start"), GPS_READY, GPS_READY_P, INK, () => this.start());
        else this.setButton(t("btn.start"), GPS_WAIT, GPS_WAIT_P, MUTED, () => {});
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
        const hint = ((bleOk() && !getTok())
          ? (s.code ? s.code + " → pumpfoil.org" : t("up.notLinked") + " · → " + t("menu.connect"))
          : (s.upStatus || gps) + (s.almOn ? " · " + t("fm.alarm") : "") + " · " + conn)
          + (pend ? " · " + pend + " " + t("up.open") : "");
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
      const ys = round
        ? [px(104), px(188), px(272), px(356)]
        : [Math.round(DH * 0.14), Math.round(DH * 0.33), Math.round(DH * 0.52), Math.round(DH * 0.71)];
      const mk = (y, text, fn) => hmUI.createWidget(hmUI.widget.BUTTON, {
        x: round ? px(80) : px(24), y: y, w: round ? DW - px(160) : DW - px(48),
        h: round ? px(60) : px(56), radius: round ? px(30) : px(28),
        text: text, text_size: px(27), normal_color: 0x1f2937, press_color: 0x374151, color: 0xffffff, click_func: fn });
      // Vierter Knopf: eigene Layouts, dreistufig Automatisch/An/Aus wie im Garmin-Menue. Anders
      // als die drei darueber wird DIESE Wahl persistiert (store), damit sie einen App-Start
      // ueberlebt -- der Server-Wert ist nur die Vorbelegung, nicht ein Veto.
      const onOff = (v) => t(v ? "common.on" : "common.off");
      const layTxt = s.layoutsPref === null
        ? t("common.auto") + " (" + onOff(s.layoutsServerDefault) + ")"
        : onOff(s.layoutsPref);
      w.foilBtns = [
        mk(ys[0], t("fm.alarm") + ": " + onOff(s.almOn), () => { s.almOn = !s.almOn; this.renderIdle(); }),
        mk(ys[1], t("fm.thresholds") + ": " + (s.almSrc === "foil" ? t("fm.autoFoil") : t("fm.manual")), () => { s.almSrc = s.almSrc === "foil" ? "manual" : "foil"; this.renderIdle(); }),
        mk(ys[2], t("foil.prefix") + s.foilLabel, () => { this._cycleFoil(); this.renderIdle(); }),
        mk(ys[3], t("lay.short") + ": " + layTxt, () => { this._cycleLayoutsPref(); this.renderIdle(); }),
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
        if (tMs - s.runEndedMs < RUN_REARM_COOLDOWN_MS) {
          s.enterStreak = 0;
        } else {
          s.enterStreak = (v3 >= RUN_ENTER_MPS) ? s.enterStreak + 1 : 0;
          if (s.enterStreak >= RUN_ENTER_DWELL) {
            s.foiling = true; s.exitStreak = 0;
            // Lauf-Start auf den ersten schnellen Tick zurückdatieren (wie Garmin/Wear).
            s.runStartMs = tMs - RUN_ENTER_DWELL * 1000;
            s.runStartDist = dist;
            s.runMaxMps = vInst;
            s.runMaxHr = s.hr > 0 ? s.hr : 0;
            console.log("[pumpfoil] run start speed=" + (v3 * 3.6).toFixed(1));
          }
        }
      } else {
        if (vInst > s.runMaxMps) s.runMaxMps = vInst;
        if (s.hr > s.runMaxHr) s.runMaxHr = s.hr;
        s.exitStreak = (v3 < RUN_EXIT_MPS) ? s.exitStreak + 1 : 0;
        if (s.exitStreak >= RUN_EXIT_DWELL) {
          s.foiling = false; s.enterStreak = 0;
          // Ende auf den ersten langsamen Tick zurückdatieren; Kennzahlen festhalten.
          let durMs = tMs - RUN_EXIT_DWELL * 1000 - s.runStartMs;
          if (durMs < 0) durMs = 0;
          s.lastRunDurMs = durMs;
          s.lastRunDistM = Math.max(0, dist - s.runStartDist);
          s.lastRunAvgMps = durMs > 0 ? s.lastRunDistM / (durMs / 1000) : 0;
          s.lastRunMaxMps = s.runMaxMps;
          s.lastRunMaxHr = s.runMaxHr;
          s.runMaxHr = 0;
          s.runCount++;
          s.runEndedMs = tMs;   // Re-Arm-Sperre starten
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
      if (trip && !s._almActive) { s._almActive = true; this._vibrate(); }
      else if (!trip) { s._almActive = false; }
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
      w.layW = null; w.layKey = null; w.layDyn = null;
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

      const list = [], dyn = [];
      const bg = layColor(entry[1] | 0, 0x000000);
      // RANDLOS über das ganze Display: die Promille-Koordinaten beziehen sich aufs ganze Display,
      // ein Innenabstand würde alles verkleinern und nach innen versetzen (der Wear-Fehler).
      list.push(hmUI.createWidget(hmUI.widget.FILL_RECT, { x: 0, y: 0, w: DW, h: DH, color: bg }));
      // Linien zuerst, danach alles andere — sonst liegen Striche über den Werten (wie Garmin/Wear).
      const sorted = els.slice().sort((a, b) => ((a && a[0] === 4) ? 0 : 1) - ((b && b[0] === 4) ? 0 : 1));
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
      w.layW = list; w.layDyn = dyn; w.layKey = key;
    },
    // 1×/s: nur die Wert-Elemente nachziehen (Labels/Freitext/Linien/Punkte sind statisch).
    _updateLayoutDyn() {
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
        w.status.setProperty(hmUI.prop.TEXT, t("rec.stopHold") + " = " + t("btn.stop"));
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
          s.layoutsPref = false; s._ringKey = null;
          this.renderRecording();   // einmalige Rekursion: der neue Eintrag ist garantiert klassisch
          return;
        }
      }
      this._clearLayout();
      w.page.setProperty(hmUI.prop.TEXT, (pg + 1) + "/" + n);
      this.renderFields([entry[1], entry[2], entry[3]]);
      w.status.setProperty(hmUI.prop.TEXT, (s.fix ? "GPS ●" : t("gps.searching"))
        + (s.foiling ? " · " + t("f.runActive") : "")
        + " · " + t("rec.stopHold") + " = " + t("btn.stop"));
    },
    renderSummary() {
      const s = this.state, w = s.w, last = s.last || { dist: 0, dur: 0, avg: 0, max: 0 };
      this._clearLayout();
      w.page.setProperty(hmUI.prop.TEXT, "");
      this.setSlots([fmtDist(last.dist), t("f.dist")], [mmss(last.dur), t("f.dur")], [last.avg.toFixed(1), t("f.kmhAvg")]);
      w.status.setProperty(hmUI.prop.TEXT, s.upStatus);
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
        case 4: return [fmtDist(s.dist), t("f.dist")];
        case 12: { const d = new Date(); return [pad(d.getHours()) + ":" + pad(d.getMinutes()), t("f.clock")]; }
        // 14/15 = AKTUELLER Lauf, 16-19 = LETZTER Lauf, 20 = Lauf-Zähler. Bis 1.0.4 zeigte 14/15
        // die Gesamt-Session (= dasselbe wie 3/4) und 16-19 die letzte SESSION statt des letzten
        // Laufs — die Feld-IDs bedeuten aber Läufe (web fw.14…fw.20), und ohne On-Watch-Erkennung
        // gab es keine Lauf-Daten. Jetzt liefert Paket 1 sie.
        case 14: return [mmss(runDurMs / 1000), s.foiling ? t("f.runActive") : t("f.runTime")];
        case 15: return [fmtDist(runDistM), t("f.runDist")];
        case 16: return [hasRun ? mmss(s.lastRunDurMs / 1000) : "–", t("f.lastRunTime")];
        case 17: return [hasRun ? fmtDist(s.lastRunDistM) : "–", t("f.lastRunDist")];
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
          s.gps.push([el, Math.round(lat * 1e6) / 1e6, Math.round(lon * 1e6) / 1e6, Math.round(speedRaw * 100) / 100, hr, 0]);
          // Distanz NICHT ueber einen Sprung hinweg aufsummieren — sonst waechst die angezeigte
          // Strecke um den Sprung, und der Lauf daneben bekommt eine Distanz, die es nie gab.
          if (s.prev && !jump) s.dist += distM(s.prev[0], s.prev[1], lat, lon);
          s.prev = [lat, lon];
          if (speed > s.max) s.max = speed;
          if (s.almOn) this._checkAlarm(speed * 3.6);   // Vibrationsalarm bei Speed-Grenzen
          if (s.gps.length % GPS_CHUNK === 0) this.persistActive();
        }
        // Lauf-Erkennung: erst glätten (auch ohne Fix, damit das Fenster altert), dann Automat.
        this._pushSpeed(s.cur, el, fix);
        this._updateRun(s.sp3, s.cur, s.dist, el);
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
        store.setItem("active", JSON.stringify({ uuid: s.uuid, startedAtMs: s.startedAtMs, gps: s.gps,
          foilId: s.foilId, accelFile: s.accelFile, accelSamples: s.accelSamples,
          accelHz: this._accelHz(), accelChunkT0: s.accelChunkT0 }));
      } catch (e) {}
    },
    recoverActive() {
      let a = null; try { a = JSON.parse(store.getItem("active", "null")); } catch (e) {}
      if (a && a.gps && a.gps.length) {
        const end = a.startedAtMs + (a.gps[a.gps.length - 1][0] || 0);
        let samples = a.accelSamples || 0;
        try {
          const info = a.accelFile ? statSync({ path: a.accelFile }) : null;
          if (info && info.size > 0) samples = Math.floor(info.size / 6);
        } catch (e) {}
        const hz = a.accelHz || ACCEL_DEFAULT_HZ;
        const t0s = a.accelChunkT0 || [];
        const needed = Math.ceil(samples / ACCEL_CHUNK_SAMPLES);
        while (t0s.length < needed) t0s.push(Math.round(t0s.length * ACCEL_CHUNK_SAMPLES / hz * 1000));
        const list = loadPending(); list.push({ uuid: a.uuid, startedAtMs: a.startedAtMs, endedAtMs: end,
          gps: a.gps, foilId: a.foilId, accelFile: a.accelFile, accelSamples: samples,
          accelHz: hz, accelChunkT0: t0s }); savePending(list);
      } else if (a && a.accelFile) {
        // A session without a persisted GPS point cannot be analyzed or uploaded. Do not leave its
        // binary sensor file orphaned after a reboot during the first seconds of recording.
        try { rmSync({ path: a.accelFile }); } catch (e) {}
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
      this._startAccel();
      this.persistActive();
      this.hideBar();
      this.applyButton();
      this.renderRecording();
      this._lockTouch();
    },
    stop() {
      const s = this.state, now = Date.now();
      this._stopAccel();
      this._disableTouchLock();
      this._setBrightMode("idle", true);
      s.recording = false;
      const el = (now - s.startedAtMs) / 1000;
      s.last = { dur: el, dist: s.dist, avg: el > 0 ? s.dist / el * 3.6 : 0, max: s.max * 3.6 };
      if (s.gps.length) {
        s.screen = "summary"; s.upPct = 0; s.upStatus = t("up.running") + " 0% · " + t("up.keepOpen");
        const list = loadPending(); list.push({ uuid: s.uuid, startedAtMs: s.startedAtMs, endedAtMs: now,
          gps: s.gps.slice(), foilId: s.foilId, accelFile: s.accelFile,
          accelSamples: s.accelSamples, accelHz: this._accelHz(), accelChunkT0: s.accelChunkT0.slice() }); savePending(list);
        store.setItem("active", "");
        this.applyButton(); this.renderSummary(); this.showBar(0);
        this.flushPending();
      } else {
        s.screen = "idle"; s.idlePage = 0; s.upStatus = t("rec.noData");
        if (s.accelFile) { try { rmSync({ path: s.accelFile }); } catch (e) {} }
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
      const gpsChunkCount = Math.ceil(sess.gps.length / GPS_CHUNK);
      const accelChunkCount = hasAccel ? Math.ceil(sess.accelSamples / ACCEL_CHUNK_SAMPLES) : 0;
      const dataChunkCount = gpsChunkCount + accelChunkCount;
      const total = dataChunkCount + 2; let done = 0;
      const bump = () => { done++; if (onProg) onProg(Math.min(100, Math.round(done / total * 100))); };
      // Direkter this.request (wie Pairing) — kein Retry (der würde Folge-Requests feuern);
      // r.ok muss echt kommen, sonst Fehler (kein Schein-Erfolg).
      const req = (p) => this.reqQ(p).then((r) => {
        if (r && r.error) throw new Error(r.error);
        if (!r || r.ok !== true) throw new Error(t("up.serverUnreach"));
        return r;
      });
      // Build and release one GPS slice at a time. Keeping every slice alive for a long session —
      // especially when several flush workers accidentally overlapped — exhausted watch memory.
      const sendGpsChunk = (index) => {
        if (index >= gpsChunkCount) return Promise.resolve();
        const data = sess.gps.slice(index * GPS_CHUNK, (index + 1) * GPS_CHUNK);
        return req({ method: "CHUNK", token: tok, session_uuid: sess.uuid, index,
                     kind: "gps", encoding: "json", count: data.length, data })
          .then(() => { bump(); return sendGpsChunk(index + 1); });
      };
      const sendAccelChunks = () => {
        if (!accelChunkCount) return Promise.resolve();
        let fd = -1;
        try { fd = openSync({ path: sess.accelFile, flag: O_RDONLY }); }
        catch (e) { return Promise.reject(new Error("accelerometer file unavailable")); }
        const send = (index) => {
          if (index >= accelChunkCount) return Promise.resolve();
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
            .then(() => { bump(); return send(index + 1); });
        };
        return send(0).then((value) => { try { closeSync({ fd }); } catch (e) {} return value; },
          (err) => { try { closeSync({ fd }); } catch (e) {} throw err; });
      };
      return req({ method: "START", token: tok, meta }).then(() => { bump(); return sendGpsChunk(0); })
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
      if (!list.length) { if (inSummary) { s.upStatus = t("up.done") + " ✓"; this.showBar(100); this.renderSummary(); } this.applyButton(); return; }
      s.uploading = true;
      // Upload requires the Device App to stay alive for BLE/ZML. Keep the page awake for the whole
      // worker lifetime; the normal five-minute idle policy resumes on completion or failure.
      this._setBrightMode("uploading");
      console.log("[pumpfoil] upload worker start sessions=" + list.length);
      const onProg = (pct) => { s.upPct = pct; s.upStatus = t("up.running") + " " + pct + "% · " + t("up.keepOpen"); if (inSummary) { this.showBar(pct); this.renderSummary(); } else this.renderIdle(); };
      const step = (i) => {
        if (i >= list.length) {
          s.uploading = false;
          this._setBrightMode("idle", true);
          console.log("[pumpfoil] upload worker done");
          s.upStatus = t("up.done") + " ✓"; if (inSummary) { this.showBar(100); this.renderSummary(); } else this.renderIdle(); this.applyButton(); return;
        }
        const sess = list[i];
        this.uploadSession(sess, onProg)
          .then(() => {
            if (sess.accelFile) { try { rmSync({ path: sess.accelFile }); } catch (e) {} }
            removePending(sess.uuid); step(i + 1);
          })
          .catch((err) => {
            s.uploading = false;
            this._setBrightMode("idle", true);
            console.log("[pumpfoil] upload worker failed " + ((err && err.message) || "?"));
            s.upStatus = t("common.error") + ": " + ((err && err.message) || "?"); this.rerender(); this.applyButton();
          });
      };
      step(0);
    },

    onDestroy() {
      const s = this.state;
      this._setBrightMode("system");
      if (s.timer) clearInterval(s.timer);
      if (s.pollTimer) clearTimeout(s.pollTimer);
      if (s.hbTimer) clearInterval(s.hbTimer);
      this._disableTouchLock();
      if (s.recording) { this._stopAccel(); this.persistActive(); }
      try { offGesture(); } catch (e) {}
      try { s.geo && s.geo.stop && s.geo.stop(); } catch (e) {}
      try { s.hrSensor && s.hrCallback && s.hrSensor.offCurrentChange(s.hrCallback); } catch (e) {}
    },
  })
);
