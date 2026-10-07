/*
 * Kennungen fuer die Verbindung Uhr <-> Handy (Wear Engine). EINZIGE Stelle im JS-Code; die
 * zweite ist `supportLists` in entry/src/main/config.json beider Projekte (gleiche Werte).
 *
 * PHONE_FP = SHA-256-Fingerabdruck des Signierschluessels der Android-App, so wie Huawei ihn
 * erwartet (AppGallery Connect zeigt ihn beim Wear-Engine-Antrag). Bei Play App Signing ist das
 * der Schluessel von GOOGLE, nicht der Upload-Schluessel (Play Console -> App-Integritaet).
 * Ohne passenden Wert meldet jede Uebertragung 206 (Wear-Engine-FAQ).
 */
var PHONE_PKG = "org.pumpfoil.app";
var PHONE_FP = "PHONE_FINGERPRINT_EINTRAGEN";
/**
 * iOS-App (watch-apple, Bundle org.pumpfoil.coolwatch). iOS-Apps haben laut Huawei keinen
 * Fingerabdruck — „you can enter any text"; wir nehmen den Bundle-Namen.
 */
var IOS_PKG = "org.pumpfoil.coolwatch";
var IOS_FP = "org.pumpfoil.coolwatch";
/** Reihenfolge = Erstversuch; die Uhr merkt sich, welche zuletzt angenommen hat (kern.Gegenstelle). */
var GEGENSTELLEN = [[PHONE_PKG, PHONE_FP], [IOS_PKG, IOS_FP]];
var APP_VERSION = "1.0.1";

export default { GEGENSTELLEN: GEGENSTELLEN, APP_VERSION: APP_VERSION };
