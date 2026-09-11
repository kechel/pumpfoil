import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Foil, type PairedDevice } from "../lib/api";
import { Button, Card, ErrorBox, Spinner } from "../components/ui";
import { ChatBubbleIcon, CheckIcon, ChevronIcon, FoilIcon, MailIcon, StarIcon, TrashIcon, WatchIcon } from "../components/Icons";
import { LanguageGrid } from "../components/LanguageSelect";
import { AppleIcon, GoogleIcon, PLATTFORM_LOGOS } from "../components/BrandIcons";
import { ConnectIqButton } from "../components/ConnectIqButton";
import { AppStoreBadge, PlayBadge, ZeppAppBadges } from "../components/StoreBadge";
import { openChatOverlay } from "../components/DmWidget";
import { gearMatches } from "../lib/gearSearch";
import { useI18n } from "../i18n";

/**
 * Einrichtungs-Assistent fuer neue Konten. NOCH NICHT VERLINKT (Jan, 11.09.2026: „kannst du
 * jetzt gern anfangen aber noch nirgendwo verlinken, aber ich komme ja dann ueber die url da
 * schon drauf") — nur direkt ueber /onboarding erreichbar, genau wie /foiler/:id am 08.09.
 *
 * WARUM: von 497 Konten haben 249 je eine Session, und 143 Konten haben ein Geraete-Token, das
 * NIE benutzt wurde (`device_tokens.last_seen_at` bleibt NULL) — 133 davon ohne jede Session.
 * Zusammen mit 79 Konten ohne alles sind 212 von 497 nie ueber die Einrichtung hinausgekommen.
 * Wer es schafft, schafft es sofort: 138 der 249 hatten die erste Session binnen EINER STUNDE
 * nach der Registrierung. Es gibt also kaum ein „spaeter mal".
 *
 * GRUNDSAETZE (Vorgabe Jan): Schritt fuer Schritt, wenig Text, jeder Schritt optional und
 * ueberspringbar, und ueberall die VORHANDENEN Werte des Nutzers vorbelegt — der Assistent ist
 * auch fuer ein bestehendes Konto gefahrlos zu oeffnen. Jeder Schritt speichert sofort einzeln,
 * damit ein Abbruch das Beantwortete behaelt.
 *
 * Die nativen Apps (Android/iOS) ziehen ERST NACH, wenn das hier in der PWA fertig ist und gut
 * aussieht (Jan: „android & ios machen wir erst gaaaanz am ende … nicht einfach damit anfangen").
 */

// Reihenfolge nach fallender Abbruchgefahr, nicht nach Wichtigkeit: erst drei Fragen, die in
// Sekunden erledigt sind, dann der grosse Schritt (Uhr) — bei dem viele die Uhr gar nicht zur
// Hand haben und der deshalb „mache ich spaeter" gleichberechtigt anbietet.
const SCHRITTE = ["lang", "level", "sport", "foil", "watch", "done"] as const;

// Koennen -> Erkennungs-Empfindlichkeit. VORSCHLAG, kein Naturgesetz: `SENSITIVITY_PRESETS`
// (server/app/analysis/gps.py:57) sind drei feste Geschwindigkeitsschwellen OHNE Gewichtsterm,
// eine Ableitung aus dem Gewicht waere also erfunden. Das Gewicht fragen wir aus einem anderen,
// belegten Grund (s. Gewichts-Schritt unten).
//
// Wichtig fuer den Text: die gewaehlte Stufe ist die MASSGEBLICHE Auswertung — ueberall, auch in
// Community und Rekorden (gps.py:45-55, dort mit Nachmessung belegt). Sie ist also keine reine
// Privatansicht; deshalb steht hier ein Satz dazu und nicht nur „empfindlicher".
const KOENNEN: { id: string; sens: string }[] = [
  { id: "beginner", sens: "attempts" },
  { id: "inter", sens: "light" },
  { id: "pro", sens: "normal" },
];

// Recorder-Apps (eigene App auf der Uhr) — dieselben vier wie in `WatchGuide`.
const UHREN = [
  { id: "garmin", label: "Garmin" },
  { id: "apple", label: "Apple Watch" },
  { id: "wear", label: "Wear OS" },
  { id: "amazfit", label: "Amazfit" },
] as const;

// Konto-Verknuepfungen (die Uhr zeichnet mit ihrer eigenen App auf, wir holen die Aufnahme ab).
// Sie liegen heute auf einer anderen Seite als die Recorder-Anleitungen — fuer den Einstieg
// gehoeren beide Wege in EINE Auswahl, sonst sucht ein Suunto-Fahrer unter „Uhr verbinden"
// vergeblich nach seiner Marke.
const VERKNUEPFUNGEN = [
  { id: "polar", label: "Polar" },
  { id: "coros", label: "COROS" },
  { id: "suunto", label: "Suunto" },
] as const;

// Die Kurzanleitung ist JE PLATTFORM eine andere — der Weg auf die Uhr unterscheidet sich
// wirklich, und die generische Fassung („App auf der Uhr starten, Code eintragen") war fuer
// Apple und Wear schlicht falsch:
//   garmin  Eigene App auf der Uhr, Code ist der einzige Weg: auf dem Handy laeuft Garmin
//           Connect, eine FREMDE App, die fuer uns kein Token minten kann.
//   apple   EIN Bundle: die Watch-App ist in die iPhone-App eingebettet (project.yml,
//           `embed: true`) und landet mit auf der gekoppelten Uhr — nichts einzeln zu
//           installieren. Die angemeldete iPhone-App schiebt dann das Token per
//           WatchConnectivity auf die Uhr (kein Code).
//   wear    Sieht wie Apple aus, ist es aber NICHT: die Uhren-App kommt nicht von allein auf
//           die Uhr. Unser eigener Code sagt es ("man kann die Uhr-App nicht vom Phone aus
//           pushen", `WatchSync.installOnWatch`), deshalb hat die Handy-App den Knopf "Auf der
//           Uhr installieren", der den Play Store AUF DER UHR oeffnet. Genau daran scheiterte am
//           05.08. ein Nutzer, der auf dem Handy installiert hatte und auf die Uhr wartete.
//   amazfit Unsere App kommt aus dem Zepp-App-Store, installiert ueber die Zepp-App am Handy.
// Der Code bleibt bei Apple und Wear als RUECKFALL sichtbar (die Uhr-App zeigt einen, wenn das
// Token sie nicht erreicht hat) — nur nicht mehr als der Hauptweg.
const SCHRITT_PRAEFIX: Record<string, string> = {
  garmin: "g", apple: "a", wear: "w", amazfit: "z",
};

// Merker „Assistent laeuft" (nur dieser Browser). Absichtlich localStorage und nicht der
// Server-Merker `settings.onboarding`: der sagt „einmal durch", dieser hier „gerade mitten
// drin" — zwei verschiedene Fragen. Jeder Zugriff in try/catch, in einem privaten Fenster
// wirft der Zugriff selbst.
export const ONB_OFFEN = "foil_onb_offen";
export function offenMerken(offen: boolean) {
  try { if (offen) localStorage.setItem(ONB_OFFEN, "1"); else localStorage.removeItem(ONB_OFFEN); }
  catch { /* privates Fenster / Speicher gesperrt */ }
}
export function istOffen(): boolean {
  try { return localStorage.getItem(ONB_OFFEN) === "1"; } catch { return false; }
}

// Der ERREICHTE Schritt, daneben. Wer mitten im Assistenten woanders hingeht (die ausfuehrliche
// Uhren-Anleitung, der Sprung zum Hersteller) und ueber das Band zurueckkommt, soll dort
// weitermachen, wo er war — nicht wieder bei der Sprache (Jan, 11.09.2026).
//
// Gespeichert wird die ID, nicht der Index: eine umsortierte Reihenfolge wuerde sonst stumm auf
// den falschen Schritt zeigen. Unbekannte ID -> von vorn.
const ONB_SCHRITT = "foil_onb_schritt";
function schrittLesen(): number {
  try {
    const i = (SCHRITTE as readonly string[]).indexOf(localStorage.getItem(ONB_SCHRITT) || "");
    return i >= 0 ? i : 0;
  } catch { return 0; }
}
function schrittMerken(i: number | null) {
  try {
    if (i === null) localStorage.removeItem(ONB_SCHRITT);
    else localStorage.setItem(ONB_SCHRITT, SCHRITTE[i]);
  } catch { /* egal */ }
}

const SPORTARTEN = ["pumpfoil", "wingfoil", "kitefoil", "surf_downwind", "efoil", "foildrive", "other"];

export default function Onboarding() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [i, setI] = useState(schrittLesen);
  const [laden, setLaden] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  // Vorhandene Werte — der Assistent zeigt an, was schon gesetzt ist, statt bei null anzufangen.
  const [sens, setSens] = useState("normal");
  const [gewicht, setGewicht] = useState("");
  const [sport, setSport] = useState("pumpfoil");
  const [meineFoils, setMeineFoils] = useState<number[]>([]);
  const [standardFoil, setStandardFoil] = useState<number | null>(null);
  const [foils, setFoils] = useState<Foil[] | null>(null);
  const [geraete, setGeraete] = useState<PairedDevice[]>([]);
  // Social-Freigabe: das Chat-Overlay haengt in App.tsx an `social_allowed !== false`
  // (Alters-Riegel unter 13, Apple-Vorgabe). Ist es nicht montiert, laeuft das
  // Oeffnen-Event ins Leere -> dann gehoert der Chat-Knopf gar nicht auf die Seite.
  const [social, setSocial] = useState(true);
  // Anzeigename: bei der Registrierung mit E-Mail ist er Pflichtfeld, bei Google und Apple wird
  // er NIE gefragt — dort kommt er still vom Anbieter (oauth.py), bei Google also meist der
  // echte Vor- und Nachname. Das betrifft 297 der 498 Konten (gemessen 11.09.2026), 108 davon
  // tragen einen Namen mit Leerzeichen. Er steht oeffentlich unter jeder Aufnahme — deshalb
  // gehoert er in den Assistenten, einmal sichtbar und aenderbar.
  const [name, setName] = useState("");

  // „Der Assistent laeuft" merken, solange er nicht beendet oder abgebrochen wurde. Daran
  // haengt das Band im App-Rahmen, das von jeder anderen Seite zurueckfuehrt — es gibt Wege
  // hinaus, die wir nicht abschaffen wollen (die ausfuehrliche Uhren-Anleitung, und der
  // OAuth-Sprung zum Hersteller geht ohnehin nicht anders).
  useEffect(() => { offenMerken(true); }, []);
  useEffect(() => { schrittMerken(i); }, [i]);

  useEffect(() => {
    Promise.all([
      api.getProfile().catch(() => null),
      api.getSettings().catch(() => null),
      api.myDevices().catch(() => [] as PairedDevice[]),
    ]).then(([p, s, d]) => {
      if (p?.foil_sensitivity) setSens(p.foil_sensitivity);
      if (p) { setSocial(p.social_allowed !== false); setName(p.display_name || ""); }
      if (s) {
        const w = Number(s.weight_kg ?? 0);
        setGewicht(w > 0 ? String(w) : "");
        setSport((s.default_sport_class as string) ?? "pumpfoil");
        setMeineFoils((s.my_foils as number[]) ?? []);
        setStandardFoil((s.foil_id as number) ?? null);
      }
      setGeraete(d.filter((x) => !x.revoked_at));
      setLaden(false);
    });
  }, []);

  const schritt = SCHRITTE[i];
  const weiter = () => setI((c) => Math.min(c + 1, SCHRITTE.length - 1));
  const zurueck = () => setI((c) => Math.max(c - 1, 0));

  // Jeder Schritt speichert fuer sich. Fehler werden gezeigt, halten den Assistenten aber nicht
  // auf: eine verschluckte Einstellung ist aergerlich, ein blockierter Einstieg schlimmer.
  const speichern = useCallback((patch: Record<string, unknown>) => {
    api.saveSettings(patch).catch((e) => setFehler((e as Error).message));
  }, []);

  // Zwei Wege hinaus, und der Unterschied ist GENAU der Merker (Vorgabe Jan):
  //   `spaeter()`  laesst ihn leer -> eine spaetere Weiche zeigt den Assistenten wieder.
  //   `beenden()`  setzt ihn -> er kommt nicht mehr von selbst. „Fertig" am Ende auch.
  // Beides verlaesst die Seite; das Beantwortete ist ohnehin schon Schritt fuer Schritt
  // gespeichert. Heute ist der sichtbare Unterschied noch keiner, weil die Weiche fehlt — der
  // Merker soll aber von Anfang an richtig stehen, damit sie spaeter nicht auf halbe Daten
  // trifft. Ueber /onboarding kommt man in beiden Faellen jederzeit zurueck.
  // „Spaeter fortsetzen" laesst BEIDE Merker stehen — den Schritt und das „laeuft". Das ist die
  // Zusage des Knopfs, und das Band oben bleibt damit der Weg zurueck. Vorher loeschte dieser
  // Ausgang das „laeuft" und widersprach so dem gemerkten Schritt: der Assistent haette
  // weitergemacht, wo man war, nur fand man ihn nicht mehr (Jans Befund, 11.09.2026).
  //   Weg ist das Band erst nach „Nicht mehr zeigen" oder „Fertig" — also genau bei „beendet
  //   oder abgebrochen", wie vorgegeben. Die beiden raeumen auch den Schritt weg: wer den
  //   Assistenten spaeter freiwillig aus dem Profil holt, faengt vorn an und nicht auf dem
  //   Schlussbildschirm.
  const spaeter = () => nav("/home");
  const beenden = () => {
    offenMerken(false);
    schrittMerken(null);
    speichern({ onboarding: { done_at: new Date().toISOString(), version: 1 } });
    nav("/home");
  };

  if (laden) return <Spinner />;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h2 className="text-xl font-bold">{t("onb.welcome")}</h2>
      <p className="mb-4 mt-1 text-slate-300">{t("onb.intro")}</p>

      <Fortschritt aktiv={i} anzahl={SCHRITTE.length} />

      {fehler && <div className="mb-4"><ErrorBox message={fehler} /></div>}

      {schritt === "lang" && <SprachSchritt name={name} setName={setName} />}

      {schritt === "level" && (
        <KoennenSchritt
          sens={sens} gewicht={gewicht}
          onSens={(v) => {
            setSens(v);
            // NUR bei echter Aenderung senden: der Server startet dann eine Reanalyse aller
            // eigenen Sessions (api/auth.py:220-230). Fuer ein neues Konto ist das gratis, fuer
            // ein bestehendes nicht — deshalb kein Schreiben, wenn der Wert schon stimmt.
            if (v !== sens) api.updateFoilSensitivity(v).catch((e) => setFehler((e as Error).message));
          }}
          onGewicht={(v) => {
            setGewicht(v);
            const n = Number(v);
            if (v === "" || (Number.isFinite(n) && n >= 0 && n <= 300)) {
              speichern({ weight_kg: v === "" ? 0 : Math.round(n) });
            }
          }}
        />
      )}

      {schritt === "sport" && (
        <SportSchritt sport={sport} onSport={(v) => { setSport(v); speichern({ default_sport_class: v }); }} />
      )}

      {schritt === "foil" && (
        <FoilSchritt
          foils={foils} setFoils={setFoils}
          meine={meineFoils} standard={standardFoil}
          onWahl={(id) => {
            const nm = meineFoils.includes(id) ? meineFoils : [...meineFoils, id];
            setMeineFoils(nm); setStandardFoil(id);
            speichern({ my_foils: nm, foil_id: id });
          }}
          onEntfernen={(id) => {
            const nm = meineFoils.filter((x) => x !== id);
            // War es das Standard-Foil, MUSS `foil_id` mit weg: der Server erzwingt „Default
            // impliziert Mitgliedschaft" (api/settings.py) und wuerde das Foil sonst sofort
            // wieder in `my_foils` aufnehmen — das Entfernen waere wirkungslos.
            const nd = standardFoil === id ? null : standardFoil;
            setMeineFoils(nm); setStandardFoil(nd);
            speichern({ my_foils: nm, foil_id: nd });
          }}
        />
      )}

      {schritt === "watch" && <UhrSchritt geraete={geraete} setGeraete={setGeraete} />}

      {schritt === "done" && <FertigSchritt geraete={geraete} social={social} />}

      {/* Navigation. „Ueberspringen" ist IMMER sichtbar und gleich gross wie „Weiter" — ein
          Assistent, aus dem man nicht herauskommt, ist schlimmer als keiner. */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {i > 0 && (
          <Button variant="ghost" onClick={zurueck}>
            <span className="flex items-center gap-1"><ChevronIcon className="h-4 w-4 rotate-180" />{t("onb.back")}</span>
          </Button>
        )}
        <div className="flex-1" />
        {schritt !== "done" ? (
          <>
            {/* Ueberspringen bekommt das doppelte Winkelzeichen (»), Weiter das einfache —
                dieselbe Richtung, aber unterscheidbar, und beide aus dem vorhandenen
                ChevronIcon statt aus einem Emoji (memory no-standard-emojis-in-ui). Das zweite
                Winkel liegt bewusst dicht am ersten, sonst liest es sich wie zwei Knoepfe. */}
            <Button variant="ghost" onClick={weiter}>
              <span className="flex items-center gap-1">
                {t("onb.skip")}
                <span className="flex items-center" aria-hidden>
                  <ChevronIcon className="h-4 w-4" />
                  <ChevronIcon className="-ml-2 h-4 w-4" />
                </span>
              </span>
            </Button>
            <Button onClick={weiter}>
              <span className="flex items-center gap-1">{t("onb.next")}<ChevronIcon className="h-4 w-4" /></span>
            </Button>
          </>
        ) : (
          <Button onClick={beenden}>{t("onb.finish")}</Button>
        )}
      </div>

      {/* Zwei Wege hinaus, unten links abgesetzt (Vorgabe Jan): einmal mit Wiedervorlage,
          einmal endgueltig. Bewusst als Textlinks und nicht als Knoepfe — sie sollen erreichbar
          sein, aber nicht mit „Weiter" um Aufmerksamkeit ringen. */}
      <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-800 pt-4">
        <button type="button" onClick={spaeter}
          className="text-slate-400 underline hover:text-slate-300">
          {t("onb.later")}
        </button>
        <button type="button" onClick={beenden}
          className="text-slate-400 underline hover:text-slate-300">
          {t("onb.never")}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function Fortschritt({ aktiv, anzahl }: { aktiv: number; anzahl: number }) {
  const { t } = useI18n();
  return (
    <div className="mb-5">
      <div className="flex items-center gap-1.5">
        {Array.from({ length: anzahl }, (_, n) => (
          <div key={n} aria-hidden
            className={`h-1.5 flex-1 rounded-full ${n <= aktiv ? "bg-brand-500" : "bg-slate-800"}`} />
        ))}
      </div>
      <p className="mt-2 text-sm text-slate-400">{t("onb.step", { n: aktiv + 1, total: anzahl })}</p>
    </div>
  );
}

/** Schritt 1: Sprache. Bewusst KEINE Frage, sondern die Auswahl gleich sichtbar und aenderbar
 *  (Vorgabe Jan) — es gab Nutzer, die vor der Registrierung keine Sprache gewaehlt hatten. Der
 *  Wechsel wirkt sofort und wird ueber `setLang` auch am Konto gespeichert. */
function SprachSchritt({ name, setName }: { name: string; setName: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <>
      <Card className="p-5">
        <h3 className="mb-3 font-semibold">{t("lang.label")}</h3>
        <LanguageGrid />
      </Card>
      <NameKarte name={name} setName={setName} />
    </>
  );
}

/** Anzeigename — im SELBEN Schritt direkt unter der Sprachwahl (Vorgabe Jan). Aufbau bewusst
 *  wie im Profil (Feld + Speichern + Fehlermeldung), damit es niemand zweimal lernen muss.
 *
 *  Beim BEARBEITEN nummeriert der Server einen belegten Namen NICHT durch (anders als beim
 *  Anlegen) — er antwortet 409. Die Meldung muss also stehen, sonst tippt jemand einen Namen ein,
 *  der lautlos nicht ankommt. Gespeichert wird per Knopf und nicht bei jedem Tastendruck: eine
 *  Eindeutigkeitspruefung je Buchstabe waere sinnlos und laut. */
function NameKarte({ name, setName }: { name: string; setName: (v: string) => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function speichern() {
    setErr(null); setOk(false); setBusy(true);
    try {
      const p = await api.updateProfile(name.trim());
      setOk(true);
      // Wie im Profil: den App-Rahmen mitziehen, damit der Name in der Seitenleiste sofort stimmt.
      window.dispatchEvent(new CustomEvent("foil:profile", { detail: p }));
    } catch (e) {
      const st = String(e);
      setErr(st.includes("bereits") ? t("profile.nameTaken")
           : st.includes("2–40") ? t("profile.nameLen") : t("profile.saveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-4 p-5">
      <h3 className="mb-1 font-semibold">{t("profile.displayName")}</h3>
      <p className="mb-3 text-slate-300">{t("onb.name.sub")}</p>
      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); setOk(false); setErr(null); }}
          maxLength={40}
          placeholder={t("profile.namePlaceholder")}
          className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
        />
        <Button onClick={() => { void speichern(); }} disabled={busy || name.trim().length < 2} className="shrink-0">
          {busy ? "…" : <><CheckIcon className="h-4 w-4 sm:hidden" /><span className="hidden sm:inline">{t("common.save")}</span></>}
        </Button>
      </div>
      {ok && <p className="mt-2 text-emerald-700 dark:text-emerald-400">{t("profile.saved")}</p>}
      {err && <p className="mt-2 text-red-700 dark:text-red-300">{err}</p>}
    </Card>
  );
}

function KoennenSchritt({ sens, gewicht, onSens, onGewicht }: {
  sens: string; gewicht: string;
  onSens: (v: string) => void; onGewicht: (v: string) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <Card className="p-5">
        <h3 className="mb-1 font-semibold">{t("onb.level.title")}</h3>
        <p className="mb-4 text-slate-300">{t("onb.level.sub")}</p>
        <div className="grid gap-2">
          {KOENNEN.map((k) => {
            const aktiv = sens === k.sens;
            return (
              <button key={k.id} type="button" onClick={() => onSens(k.sens)} aria-pressed={aktiv}
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-left transition ${
                  aktiv ? "border-brand-400 bg-brand-500/10 ring-1 ring-brand-400"
                        : "border-slate-700 bg-slate-900/60 hover:border-slate-600"}`}>
                <span className={`mt-0.5 shrink-0 ${aktiv ? "text-brand-400" : "text-slate-600"}`}>
                  <CheckIcon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-slate-100">{t(`onb.level.${k.id}`)}</span>
                  <span className="block text-sm text-slate-400">{t(`foilsens.${k.sens}`)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Gewicht: NICHT „fuer spaeter". Es bestimmt heute schon die Alarmgrenzen je Foil
          (`foil_physics.alarm_speeds`), und ohne Angabe rechnet der Server mit 95 kg
          (api/devices.py:477) — das steht im Hinweistext, damit die Frage einen Grund hat. */}
      <Card className="mt-4 p-5">
        <h3 className="mb-1 font-semibold">{t("profile.weight")}</h3>
        <p className="mb-3 text-slate-300">{t("onb.weight.sub")}</p>
        <div className="flex items-center gap-2">
          <input
            type="number" inputMode="numeric" min={0} max={300}
            value={gewicht}
            onChange={(e) => onGewicht(e.target.value)}
            placeholder="95"
            className="w-28 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
          />
          <span className="text-slate-300">kg</span>
        </div>
      </Card>
    </>
  );
}

function SportSchritt({ sport, onSport }: { sport: string; onSport: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <Card className="p-5">
      <h3 className="mb-3 font-semibold">{t("onb.sport.title")}</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SPORTARTEN.map((s) => {
          const aktiv = sport === s;
          return (
            <button key={s} type="button" onClick={() => onSport(s)} aria-pressed={aktiv}
              className={`min-w-0 rounded-xl border px-3 py-2.5 text-left transition ${
                aktiv ? "border-brand-400 bg-brand-500/10 ring-1 ring-brand-400"
                      : "border-slate-700 bg-slate-900/60 hover:border-slate-600"}`}>
              <span className={`block truncate ${aktiv ? "font-semibold text-slate-100" : "text-slate-200"}`}>
                {t(`cls.sport.${s}`)}
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/** Schritt 4: Foil. Optional (Jan: „ist ja alles optional"). Der Katalog hat ueber 1000
 *  Eintraege, deshalb ein Suchfeld statt einer Liste — und nur die ersten Treffer, damit der
 *  Schritt nicht zur Katalogseite wird. Ein Link auf /foils stand hier kurz und ist wieder raus:
 *  er verlaesst den Assistenten (Jan). Wer sein Foil nicht findet, kann es stattdessen von hier
 *  aus melden — derselbe Weg wie unter den Katalog-Listen (`MissingHint`). */
function FoilSchritt({ foils, setFoils, meine, standard, onWahl, onEntfernen }: {
  foils: Foil[] | null; setFoils: (f: Foil[]) => void;
  meine: number[]; standard: number | null;
  onWahl: (id: number) => void; onEntfernen: (id: number) => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState("");
  useEffect(() => {
    if (foils === null) api.foils().then(setFoils).catch(() => setFoils([]));
  }, [foils, setFoils]);

  const gewaehlt = useMemo(
    () => (foils ?? []).filter((f) => f.id === standard || meine.includes(f.id)),
    [foils, standard, meine]);

  const treffer = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql || !foils) return [];
    // Zweitbezeichnungen mitsuchen wie auf der Foil-Seite: Nutzer tippen den Produktcode ein.
    return foils
      .filter((f) => gearMatches(`${f.brand} ${f.model} ${f.size} ${f.aliases ?? ""}`, ql))
      .slice(0, 8);
  }, [foils, q]);

  return (
    <Card className="p-5">
      <h3 className="mb-1 flex items-center gap-2 font-semibold">
        <FoilIcon className="h-5 w-5 text-brand-400" /> {t("onb.foil.title")}
      </h3>
      <p className="mb-3 text-slate-300">{t("onb.foil.sub")}</p>

      {/* Schon gewaehlte Foils: JEDE ZEILE anklickbar, um sie zum Standard zu machen (Vorgabe
          Jan) — wer mehrere aus dem Profil mitbringt, entscheidet hier, welches vorne steht,
          ohne den Assistenten fuer die Katalogseite zu verlassen. */}
      {gewaehlt.length > 0 && (
        <div className="mb-3 rounded-xl border border-brand-500/30 bg-brand-500/10 p-3">
          <p className="mb-2 text-sm font-medium text-slate-300">{t("onb.foil.chosen")}</p>
          <div className="grid gap-1">
            {gewaehlt.map((f) => {
              const ist = f.id === standard;
              // Zwei Ziele in einer Zeile, deshalb KEIN Knopf im Knopf (das erlaubt HTML nicht):
              // links Stern + Name als Standard-Wahl, rechts der Papierkorb.
              return (
                <div key={f.id}
                  className={`flex items-center gap-1 rounded-lg transition ${ist ? "bg-brand-500/15" : ""}`}>
                  <button type="button" onClick={() => onWahl(f.id)} aria-pressed={ist}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-800/60">
                    <StarIcon className={`h-4 w-4 shrink-0 ${ist ? "text-brand-400" : "text-slate-500"}`} filled={ist} />
                    <span className="min-w-0 truncate text-slate-100">
                      {f.brand} {f.model} <span className="text-slate-400">{f.size}</span>
                    </span>
                  </button>
                  {/* Versehen direkt zurueecknehmen (Vorgabe Jan) — ohne Rueckfrage, es ist eine
                      Einstellung, keine Loeschung von Daten: das Foil bleibt im Katalog. */}
                  <button type="button" onClick={() => onEntfernen(f.id)}
                    title={t("foils.remove")} aria-label={t("foils.remove")}
                    className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-800/60 hover:text-red-700 dark:hover:text-red-300">
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
          {gewaehlt.length > 1 && <p className="mt-2 text-sm text-slate-400">{t("onb.foil.defaultHint")}</p>}
        </div>
      )}

      <input
        value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={t("onb.foil.search")}
        className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100"
      />
      {foils === null && <div className="mt-3"><Spinner /></div>}
      {q.trim() !== "" && foils !== null && (
        <div className="mt-3 grid gap-2">
          {treffer.length === 0 && <p className="text-slate-400">{t("onb.foil.none")}</p>}
          {treffer.map((f) => (
            <button key={f.id} type="button" onClick={() => onWahl(f.id)}
              className="flex items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-900/60 px-3 py-2.5 text-left hover:border-slate-600">
              <span className="min-w-0">
                <span className="block truncate text-slate-100">{f.brand} {f.model} <span className="text-slate-400">{f.size}</span></span>
                {f.area_cm2 ? <span className="block text-sm text-slate-400">{f.area_cm2} cm²</span> : null}
              </span>
              <span className="shrink-0 text-sm font-medium text-brand-400">{t("foils.add")}</span>
            </button>
          ))}
        </div>
      )}

      {/* Foil nicht im Katalog? Dann nicht in der Sackgasse stehen lassen, sondern melden —
          oeffnet das globale Feedback-Panel mit vorbelegtem Text (Event, s. FeedbackWidget).
          Genau dafuer gibt es das Muster schon unter den Katalog-Listen. */}
      <div className="mt-4 border-t border-slate-800 pt-3">
        <p className="font-medium text-slate-100">{t("onb.foil.missing")}</p>
        <p className="mt-1 text-slate-300">{t("onb.foil.missingHow")}</p>
        <button type="button"
          onClick={() => window.dispatchEvent(new CustomEvent("open-feedback", { detail: t("onb.foil.missing") }))}
          className="mt-2 inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline dark:text-brand-300">
          <MailIcon className="h-4 w-4" /> {t("foils.missingCta")}
        </button>
      </div>
    </Card>
  );
}

/** Schritt 5: Uhr verbinden — der Schritt, an dem es heute bricht. Zwei Wege in EINER Auswahl:
 *  eigene Recorder-App (4 Plattformen) oder Konto-Verknuepfung (3), beide mit Marken-Zeichen.
 *
 *  WICHTIG, und hier stand es zuerst falsch: der Pairing-CODE ist nicht der Weg fuer alle vier
 *  Uhren. Bei Apple Watch und Wear OS mintet die angemeldete HANDY-App ein Token und schiebt es
 *  per WatchConnectivity bzw. Wearable Data Layer auf die Uhr (`devices.mint_device`) — da tippt
 *  niemand einen Code ab. Der Code-Bildschirm erscheint dort nur als Rueckfall, wenn das Token
 *  die Uhr nicht erreicht hat (Wear: `MainActivity`, nur bei leerem Token). Garmin und Amazfit
 *  brauchen den Code dagegen immer: auf dem Handy laeuft dort eine FREMDE App (Garmin Connect,
 *  Zepp), die fuer uns nichts minten kann. Deshalb je Plattform eine andere Kurzanleitung.
 */
function UhrSchritt({ geraete, setGeraete }: {
  geraete: PairedDevice[]; setGeraete: (d: PairedDevice[]) => void;
}) {
  const { t } = useI18n();
  const [wahl, setWahl] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Wie viele Geraete es beim Betreten des Schritts gab — kommt eines dazu, ist das DER Erfolg,
  // auf den der Nutzer wartet. Ref, damit das Nachladen den Vergleichswert nicht verschiebt.
  const vorher = useRef(geraete.length);

  // Solange dieser Schritt offen ist, nachsehen, ob die Uhr sich gemeldet hat. Dasselbe Signal
  // nutzt schon der Uhren-Bereich (Account.tsx), dort zum Tab-Wechsel.
  useEffect(() => {
    const id = setInterval(() => {
      api.myDevices().then((d) => setGeraete(d.filter((x) => !x.revoked_at))).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [setGeraete]);

  const neu = geraete.length > vorher.current;
  const istUhr = UHREN.some((u) => u.id === wahl);
  const perCode = wahl === "garmin" || wahl === "amazfit";

  async function einloesen() {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await api.pairClaim(code.trim().toUpperCase());
      setMsg(r.already ? t("account.claimAlready") : t("account.claimOk"));
      setCode("");
      api.myDevices().then((d) => setGeraete(d.filter((x) => !x.revoked_at))).catch(() => {});
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <>
      <Card className="p-5">
        <h3 className="mb-1 flex items-center gap-2 font-semibold">
          <WatchIcon className="h-5 w-5 text-brand-400" /> {t("onb.watch.title")}
        </h3>
        <p className="mb-4 text-slate-300">{t("onb.watch.sub")}</p>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {UHREN.map((u) => (
            <Kachel key={u.id} id={u.id} label={u.label} aktiv={wahl === u.id} onClick={() => setWahl(u.id)} />
          ))}
        </div>

        <p className="mb-2 mt-4 text-sm font-medium text-slate-400">{t("onb.watch.linked")}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {VERKNUEPFUNGEN.map((v) => (
            <Kachel key={v.id} id={v.id} label={v.label} aktiv={wahl === v.id} onClick={() => setWahl(v.id)} />
          ))}
        </div>
      </Card>

      {/* Recorder-Plattform gewaehlt: Store-Badge + Kurzanleitung. Die ausfuehrliche Anleitung
          mit Screenshots bleibt im Uhren-Bereich — hier absichtlich nur das Noetigste. */}
      {istUhr && (
        <Card className="mt-4 p-5">
          <div className="mb-3">
            {wahl === "garmin" && <ConnectIqButton />}
            {wahl === "apple" && <AppStoreBadge />}
            {wahl === "wear" && <PlayBadge />}
            {wahl === "amazfit" && <ZeppAppBadges row />}
          </div>
          <ol className="list-decimal space-y-2 pl-5 text-slate-200">
            {[1, 2, 3].map((n) => (
              <li key={n}>{t(`onb.watch.${SCHRITT_PRAEFIX[wahl as string]}${n}`)}</li>
            ))}
          </ol>

          <div className="mt-4">
            <p className="mb-2 font-medium text-slate-100">
              {perCode ? t("account.claimTitle") : t("onb.watch.codeFallback")}
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8}
                placeholder={t("account.claimPlaceholder")}
                className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-mono tracking-widest text-slate-100"
              />
              <Button onClick={() => { void einloesen(); }} disabled={busy || code.trim().length < 4}>
                {busy ? "…" : t("account.claimBtn")}
              </Button>
            </div>
            {msg && <p className="mt-3 text-emerald-700 dark:text-emerald-400">{msg}</p>}
            {err && <div className="mt-3"><ErrorBox message={err} /></div>}
          </div>

          <p className="mt-4 text-sm text-slate-400">
            <Link to={`/account?tab=guide#guide-${wahl}`} className="underline hover:text-slate-300">
              {t("onb.watch.fullGuide")}
            </Link>
          </p>
        </Card>
      )}

      {/* Konto-Verknuepfung: direkt hier, ohne Umweg ueber /konten (Vorgabe Jan). Den Sprung zum
          Hersteller selbst kann uns niemand ersparen — OAuth laeuft ueber dessen Anmeldeseite.
          Deshalb steht der Satz daneben, dass es kurz hinausgeht und die Antworten bleiben. */}
      {wahl && !istUhr && <KontoSchritt dienst={wahl} />}

      {/* Uhr gemeldet — der Moment, auf den es ankommt. */}
      {(neu || geraete.length > 0) && (
        <Card className="mt-4 p-5">
          <p className="font-medium text-emerald-700 dark:text-emerald-400">
            {neu ? t("onb.watch.justConnected") : t("onb.watch.already")}
          </p>
          <ul className="mt-2 space-y-1 text-slate-200">
            {geraete.map((d) => (
              <li key={d.id}>{d.model || d.label || "—"}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* „Keine Uhr?" — mit dem echten Weg dahinter statt nur als Hinweis (Vorgabe Jan).
          WICHTIG: es gibt nichts „einzuschalten". Der Handy-Recorder laeuft NUR in den nativen
          Apps; im Browser stoppt das System die Sensoren, sobald der Bildschirm aus geht
          (`phonerec.pwaNote`). Ein Knopf „aktivieren" waere hier also ein Knopf, der nicht
          halten kann, was er verspricht — die Store-Knoepfe sind die Handlung. Aufbau und Texte
          bewusst wie die Karte im Profil, die dasselbe erklaert: eine Fassung, nicht zwei. */}
      <Card className="mt-4 p-5">
        <h3 className="mb-1 font-semibold">{t("phonerec.label")}</h3>
        <p className="mb-2 text-slate-300">{t("onb.watch.noWatch")}</p>
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">{t("phonerec.pwaNote")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <PlayBadge />
          <AppStoreBadge />
        </div>
      </Card>
    </>
  );
}

/** Eine Konto-Verknuepfung im Assistenten: Zustand holen, verbinden, fertig. Bewusst OHNE die
 *  Sync-Steuerung und die Sportart-Filter von /konten — das ist Feinjustierung fuer spaeter, im
 *  Einstieg zaehlt nur, dass die Verbindung steht. Ist der Dienst serverseitig nicht
 *  eingerichtet (`available: false`), sagt die Karte das, statt einen toten Knopf zu zeigen. */
function KontoSchritt({ dienst }: { dienst: string }) {
  const { t } = useI18n();
  const [st, setSt] = useState<{ available: boolean; linked: boolean } | null>(null);
  // COROS hat zwei Wege: MCP (seit 04.09., ohne Partner-Vertrag) und die klassische Partner-API.
  // MCP hat Vorrang, sobald er eingerichtet ist — genau wie auf /konten, damit nie beides dasteht.
  const [mcp, setMcp] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let weg = false;
    (async () => {
      if (dienst === "coros") {
        const m = await api.corosMcpStatus().catch(() => null);
        if (m?.available) { if (!weg) { setMcp(true); setSt(m); } return; }
        const c = await api.corosStatus().catch(() => null);
        if (!weg) { setMcp(false); setSt(c); }
        return;
      }
      const s = dienst === "polar" ? await api.polarStatus().catch(() => null)
              : dienst === "suunto" ? await api.suuntoStatus().catch(() => null)
              : null;
      if (!weg) setSt(s);
    })();
    return () => { weg = true; };
  }, [dienst]);

  async function verbinden() {
    try {
      const r = dienst === "polar" ? await api.polarConnect()
              : dienst === "suunto" ? await api.suuntoConnect()
              : mcp ? await api.corosMcpConnect() : await api.corosConnect();
      // Der Merker steht schon (beim Betreten gesetzt) — der OAuth-Rueckweg liegt serverseitig
      // fest auf `/konten?<dienst>=…`, und von dort fuehrt das Band im App-Rahmen zurueck.
      window.location.href = r.authorize_url;
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (st === null) return <Card className="mt-4 p-5"><Spinner /></Card>;

  const logo = PLATTFORM_LOGOS[dienst];
  return (
    <Card className="mt-4 p-5">
      <div className="mb-3 flex items-center gap-3">
        {logo && <img src={logo} alt="" className="h-7 w-auto rounded bg-white p-1" />}
        <h3 className="font-semibold">{t(`settings.${dienst}.title`)}</h3>
      </div>
      {!st.available ? (
        <p className="text-slate-300">{t("onb.link.unavailable")}</p>
      ) : st.linked ? (
        <p className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
          <CheckIcon className="h-5 w-5" /> {t("onb.link.linked")}
        </p>
      ) : (
        <>
          <p className="mb-3 text-slate-300">{t("onb.link.leaves")}</p>
          <Button onClick={() => { void verbinden(); }}>{t(`settings.${dienst}.connect`)}</Button>
        </>
      )}
      {err && <div className="mt-3"><ErrorBox message={err} /></div>}
    </Card>
  );
}

/** Auswahl-Kachel mit Marken-Zeichen. Welche Zeichen echt sind und welche Naeherung, steht in
 *  BrandIcons (`PLATTFORM_LOGOS`) — fuer Garmin und Amazfit liegt kein Logo im Repo, dort steht
 *  unser neutrales Uhr-Symbol statt eines nachgezeichneten Markenzeichens. */
function Kachel({ id, label, aktiv, onClick }: {
  id: string; label: string; aktiv: boolean; onClick: () => void;
}) {
  // Fehlt die Logo-Datei noch (Garmin, Amazfit), meldet das <img> einen Fehler und wir zeigen
  // das neutrale Uhr-Symbol. Dadurch reicht spaeter das ABLEGEN der Datei unter dem in
  // PLATTFORM_LOGOS eingetragenen Namen — ohne Code-Aenderung.
  const [logoFehlt, setLogoFehlt] = useState(false);
  const logo = logoFehlt ? undefined : PLATTFORM_LOGOS[id];
  return (
    <button type="button" onClick={onClick} aria-pressed={aktiv}
      className={`flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition ${
        aktiv ? "border-brand-400 bg-brand-500/10 ring-1 ring-brand-400"
              : "border-slate-700 bg-slate-900/60 hover:border-slate-600"}`}>
      {/* Zwei Sorten Zeichen, zwei Groessen-Regeln. Die Hersteller-Logos sind WORTMARKEN mit
          Verhaeltnis 2,5:1 (Suunto) bis 5,4:1 (Polar) — in einem quadratischen 24er-Kaestchen
          werden sie dadurch nur ein paar Pixel hoch und unlesbar (Jans Befund an den
          Konto-Kacheln). Also ueber die HOEHE skalieren und die Breite frei lassen, nur nach
          oben begrenzt, damit die Kachel auf dem Handy (zwei Spalten) nicht platzt. Die
          Marken-SVGs (Apple, Google) sind quadratisch und bleiben bei 20 px. */}
      <span className="flex h-7 shrink-0 items-center">
        {logo ? <img src={logo} alt="" onError={() => setLogoFehlt(true)}
                     className="h-6 w-auto max-w-[4rem] rounded bg-white object-contain p-0.5" />
         : id === "apple" ? <AppleIcon className="h-5 w-5 text-slate-100" />
         : id === "wear" ? <GoogleIcon className="h-5 w-5" />
         : <WatchIcon className="h-5 w-5 text-slate-400" />}
      </span>
      <span className={`truncate ${aktiv ? "font-semibold text-slate-100" : "text-slate-200"}`}>{label}</span>
    </button>
  );
}

function FertigSchritt({ geraete, social }: { geraete: PairedDevice[]; social: boolean }) {
  const { t } = useI18n();
  return (
    <Card className="p-5">
      <h3 className="mb-1 font-semibold">{t("onb.done.title")}</h3>
      <p className="text-slate-300">{geraete.length > 0 ? t("onb.done.withWatch") : t("onb.done.noWatch")}</p>
      {/* Wann die Uhr wirklich hochlaedt (Vorgabe Jan) — der Schritt, den die meisten nicht
          verstehen: drei Nutzermeldungen mit demselben Muster, "Session fehlt", lag aber noch auf
          der Uhr, weil der Upload nur im Vordergrund laeuft. Nur mit verbundener Uhr zeigen, sonst
          ist es Text ohne Anlass. Absichtlich plattform-neutral formuliert und mit Garmin als
          benanntem Fall: Garmin hat MENU -> Einstellungen -> Upload / Sync, Apple und Wear zeigen
          stattdessen "Jetzt hochladen" samt Fortschritt, sobald etwas aussteht. */}
      {geraete.length > 0 && (
        /* Der erste Satz ist die Bedingung, an der die meisten scheitern — deshalb fett. Die
           Auszeichnung laeuft ueber die §-Marken im Text (dieselbe Konvention wie beim
           Community-Satz, s. CommunityStats): ungerade Abschnitte werden hervorgehoben. So
           bleibt die Wortstellung je Sprache erhalten, statt den Satz im Code zu zerschneiden. */
        <p className="mt-3 text-slate-300">
          {t("onb.done.upload").split("§").map((teil, n) =>
            n % 2 === 1 ? <strong key={n} className="font-semibold text-slate-100">{teil}</strong>
                        : <span key={n}>{teil}</span>)}
        </p>
      )}
      {/* Wo es weitergeht (Vorgabe Jan): der Assistent fragt absichtlich nur das Wichtigste ab —
          also sagen, dass unter Profil viel mehr steht, je Uhr noch mehr, und wo weitere Konten
          hinkommen. Sonst wirkt das Wenige hier wie alles, was es gibt. */}
      <p className="mt-3 text-slate-300">{t("onb.done.more")}</p>

      {/* Community-Chat + Feedback zum Schluss (Vorgabe Jan, 11.09.2026). Keine Floskel: „nur mit
          dem vielen feedback aus der community war es mir moeglich pumpfoil.org so schnell so
          voranzutreiben" — deshalb in der ICH-Form und am Ende, wo jemand gerade fertig
          eingerichtet hat und das erste Mal etwas sagen koennte. Der Knopf oeffnet dasselbe
          Panel wie der Briefkasten rechts (Event, s. FeedbackWidget). */}
      <div className="mt-4 border-t border-slate-800 pt-4">
        <p className="text-slate-300">{t("onb.done.feedback")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {/* Oeffnet das Chat-Overlay direkt im globalen Community-Chat (Vorgabe Jan) — nicht
              die Community-SEITE. Derselbe Weg, den die Spot-Chat-Knoepfe nehmen
              (`openChatOverlay`, s. DmWidget); der Assistent bleibt dabei stehen. */}
          {social && (
            <Button variant="ghost" onClick={() => openChatOverlay("global:main", t("chat.globalName"))}>
              <span className="flex items-center gap-1.5"><ChatBubbleIcon className="h-4 w-4" />{t("chat.globalName")}</span>
            </Button>
          )}
          <Button variant="ghost"
            onClick={() => window.dispatchEvent(new CustomEvent("open-feedback", { detail: "" }))}>
            <span className="flex items-center gap-1.5"><MailIcon className="h-4 w-4" />{t("feedback.open")}</span>
          </Button>
        </div>
        {/* Unser Spruch als letztes Wort (Vorgabe Jan). Bewusst NICHT ueber i18n und bewusst
            NICHT uebersetzt: er ist in jeder Sprache derselbe (memory motto) — 18 gleiche
            Eintraege waeren nur Gelegenheit, dass einer davon abweicht. */}
        <p className="mt-7 text-center text-lg font-semibold text-brand-600 dark:text-brand-300">Have fun, keep pumping!</p>
      </div>
    </Card>
  );
}
