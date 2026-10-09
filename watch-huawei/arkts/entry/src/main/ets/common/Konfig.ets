/*
 * Kennungen fuer die Verbindung Uhr <-> Handy (Wear Engine) — Gegenstueck zu common/konfig.js.
 *
 * PHONE_FP = Fingerabdruck der Android-App, wie Huawei ihn erwartet. Ohne passenden Wert meldet
 * jede Uebertragung einen Fehler (bei Lite 206). Huaweis Forum nennt fuer Wear Engine teils die
 * Form `<Paketname>_<Base64-Public-Key>` — welche Form die ArkTS-Seite will, beim Eintragen gegen
 * die Konsole pruefen (docs/HUAWEI.md).
 */
export const PHONE_PKG: string = 'org.pumpfoil.app';
// Play App-Signaturschluessel (SHA-256, ohne Doppelpunkte, Play Console 09.10.2026). VERMUTUNG: dieselbe Form wie bei
// Lite/Watch 3/4 — erst die erste echte Verbindung (Cloud-Debugging) belegt, ob ArkTS sie so annimmt.
export const PHONE_FP: string = '50A78D3EE9627F96B63A13C7E8750250778E996F0CD3E48A586F38CD7A450FBB';
/** iOS-App: laut Huawei kein Fingerabdruck („enter any text") — wir nehmen den Bundle-Namen. */
export const IOS_PKG: string = 'org.pumpfoil.coolwatch';
export const IOS_FP: string = 'org.pumpfoil.coolwatch';
/** Reihenfolge = Erstversuch; die Uhr merkt sich, welche zuletzt angenommen hat. */
export const GEGENSTELLEN: string[][] = [[PHONE_PKG, PHONE_FP], [IOS_PKG, IOS_FP]];
export const APP_VERSION: string = '1.0.2';
/**
 * Direkt-Upload ohne Handy (Jan, 08.10.2026: „dann gehts ohne app und auch fuer leute mit iphone"):
 * die Uhr koppelt sich per Code wie Garmin (/api/devices/pair-init|pair-poll) und laedt selbst hoch.
 */
export const SERVER: string = 'https://pumpfoil.org';
