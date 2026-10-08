/*
 * Direkt zum Server, ohne Handy (Jan, 08.10.2026: „dann gehts ohne app und auch fuer leute mit
 * iphone"). Nur ArkTS-Uhren (Watch 5): Lite-Apps haben kein Netz.
 *
 * Koppeln wie Garmin/Amazfit (Reverse-Pairing): die Uhr holt per /api/devices/pair-init einen Code,
 * der Nutzer gibt ihn auf pumpfoil.org (Konto) ein, die Uhr fragt per /pair-poll, bis das
 * Geraete-Token da ist. Danach: Konfiguration per /api/devices/config, Sessions per Ingest — mit
 * denselben Pfaden und Koerpern wie die Android-Bruecke.
 *
 * UNGEPRUEFT auf echter Uhr: ob eine Watch 5 ohne gekoppeltes Android-Handy ins Netz kommt (WLAN,
 * eSIM oder ueber die Health-App am iPhone). Im DevEco-Emulator geht das Netz ueber den Mac.
 */
import { http } from '@kit.NetworkKit';
import { BusinessError } from '@kit.BasicServicesKit';
import { SERVER } from './Konfig';

export interface Antwort {
  code: number;   // HTTP-Status, 0 = kein Netz/Zeitueberschreitung
  text: string;
}

export interface PairInit {
  code: string;
  claim_token: string;
}

export interface PairPoll {
  device_token: string | null;
}

export interface SessionAntwort {
  received_chunks?: number[];
}

export interface ChunkAntwort {
  received?: number[];
}

interface PairInitKoerper {
  label: string;
  platform: string;
}

/** Eine Anfrage; loest nie mit einem Fehler aus, sondern liefert code 0 + Meldung. */
export function anfrage(methode: string, pfad: string, body: string, token: string): Promise<Antwort> {
  const h: Record<string, string> = {};
  h['Content-Type'] = 'application/json';
  if (token !== '') {
    h['X-Device-Token'] = token;
  }
  const req: http.HttpRequest = http.createHttp();
  const opt: http.HttpRequestOptions = {
    method: methode === 'GET' ? http.RequestMethod.GET : http.RequestMethod.POST,
    header: h,
    extraData: methode === 'GET' ? undefined : body,
    connectTimeout: 15000,
    readTimeout: 30000,
    expectDataType: http.HttpDataType.STRING
  };
  return req.request(SERVER + pfad, opt).then((r: http.HttpResponse) => {
    req.destroy();
    const a: Antwort = { code: r.responseCode, text: typeof r.result === 'string' ? r.result as string : '' };
    return a;
  }).catch((e: BusinessError) => {
    req.destroy();
    const a: Antwort = { code: 0, text: 'netz ' + e.code };
    return a;
  });
}

export function pairInitKoerper(label: string): string {
  const k: PairInitKoerper = { label: label.substring(0, 120), platform: 'huawei' };
  return JSON.stringify(k);
}
