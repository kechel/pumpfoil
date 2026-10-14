/*
 * Kennungen der Watch-5-App — Gegenstueck zu common/konfig.js (Lite + JS-FA).
 *
 * Seit 13.10.2026 ohne Wear Engine (Jan: Huawei hat die Berechtigung abgelehnt und empfiehlt,
 * dass Uhren mit Internet selbst hochladen). Die Handy-Kennungen (PHONE_PKG/PHONE_FP, IOS_*,
 * GEGENSTELLEN) sind deshalb hier raus; Lite braucht sie weiter (common/konfig.js).
 */
export const APP_VERSION: string = '1.0.3';
/**
 * Direkt-Upload (Jan, 08.10.2026: „dann gehts ohne app und auch fuer leute mit iphone"): die Uhr
 * koppelt sich per Code wie Garmin (/api/devices/pair-init|pair-poll) und laedt selbst hoch.
 * Seit 13.10.2026 der einzige Weg der Watch 5.
 */
export const SERVER: string = 'https://pumpfoil.org';
