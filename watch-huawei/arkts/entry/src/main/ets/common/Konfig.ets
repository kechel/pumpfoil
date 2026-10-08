/*
 * Kennungen fuer die Verbindung Uhr <-> Handy (Wear Engine) — Gegenstueck zu common/konfig.js.
 *
 * PHONE_FP = Fingerabdruck der Android-App, wie Huawei ihn erwartet. Ohne passenden Wert meldet
 * jede Uebertragung einen Fehler (bei Lite 206). Huaweis Forum nennt fuer Wear Engine teils die
 * Form `<Paketname>_<Base64-Public-Key>` — welche Form die ArkTS-Seite will, beim Eintragen gegen
 * die Konsole pruefen (docs/HUAWEI.md).
 */
export const PHONE_PKG: string = 'org.pumpfoil.app';
export const PHONE_FP: string = 'PHONE_FINGERPRINT_EINTRAGEN';
/** iOS-App: laut Huawei kein Fingerabdruck („enter any text") — wir nehmen den Bundle-Namen. */
export const IOS_PKG: string = 'org.pumpfoil.coolwatch';
export const IOS_FP: string = 'org.pumpfoil.coolwatch';
/** Reihenfolge = Erstversuch; die Uhr merkt sich, welche zuletzt angenommen hat. */
export const GEGENSTELLEN: string[][] = [[PHONE_PKG, PHONE_FP], [IOS_PKG, IOS_FP]];
export const APP_VERSION: string = '1.0.2';
