import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, AppState, encPath, fmtDur, RenderResult, Track } from "./api";
import { pfLabel } from "./pf";
import { Icon } from "./icons";
import Uploads from "./Uploads";
import Publish from "./Publish";
import Stats from "./Stats";

// Muss zu den Server-Konstanten passen (TEXT_FADE/TEXT_HOLD/OUTRO_*)
const TXN = 10;
const TXF = 0.5;
const TXH = 2.0;
const TXS = 60;
const OUTRO_SECS = 2.5;
const OUTRO_SECS_LONG = 4.0;
const OUTRO_LONG_AB = 20.0;

// Stil je Textzeile. "text" ist der bisherige Fliesstext. Die beiden Stempel
// sind fuer die "success or fail?"-Reihe: Kopfzeile fest (SUCCESS/FAIL), der
// eingetippte Text wird zur Unterzeile darunter — beides im selben Winkel.
// Zwei unabhaengige Achsen, sonst fehlt in jeder Kombination etwas: WAS gezeigt
// wird (Text oder ein Urteil) und WIE (frei im Bild, als Balken, als Karte).
type TxStyle = "text" | "success" | "fail";
type TxShape = "plain" | "bar" | "card";
interface TextSlot {
  start: number | null;
  text: string;
  hold: number;
  size?: number;   // Schriftgröße je Zeile (Default TXS), nur bei plain+text
  style?: TxStyle;
  shape?: TxShape;
  zh?: string;     // chinesische Fassung fuer RedNote; leer = Originaltext
}
const STAMP: Record<"success" | "fail", { label: string; color: string; tilt: number }> = {
  // tilt in Grad: der Erfolg lehnt links, der Fail rechts — damit sich der
  // letzte Beat anders anfuehlt als die drei davor.
  success: { label: "SUCCESS", color: "#22c55e", tilt: -7 },
  fail: { label: "FAIL", color: "#ef4444", tilt: 6 },
};
// Ein Stempel rastet ein, er blendet nicht auf: 0,12 s statt der 0,5 s fuer Text.
const STAMP_FADE = 0.12;
const TXA = 0.8;  // Deckkraft der Textoverlays — 80 % laesst das Video durchatmen
const NAVY = "#020617";
const CARD_CHIP = "#0f172a";  // Plaettchen auf der Karte, einen Schritt heller als Navy
const CARD_K = 1.5;           // die Karte zeigt denselben Stempel, nur groesser
const CYAN = "#22d3ee";       // Markenfarbe — der Spruch spricht fuer den Kanal,
const CARD_SLOGAN = "have fun, keep pumping!";  // nicht fuer das Urteil im Stempel
const SLATE = "#94a3b8";
// Wiedererkennung der Reihe: im Hook-Banner tragen genau die beiden Woerter,
// um die es geht, ihre Urteilsfarbe — der Rest bleibt weiss.
const BANNER_WORDS: Record<string, string> = {
  success: "#22c55e", erfolg: "#22c55e",
  fail: "#ef4444", failure: "#ef4444", fehler: "#ef4444",
  or: SLATE, oder: SLATE,
};
// Diese drei haben eigene Knoepfe mit Symbol; alle weiteren Unterordner
// erscheinen als Chips daneben.
const FIXED_CATS = ["aussortiert", "privat", "never-give-up"];
// RedNote bekommt seit 10.09. einen eigenen Render, und damit koennen die
// gezeichneten Overlays dort chinesisch sein. Fest steht hier nur, was das
// Studio selbst schreibt — was Jan tippt, hat je Slot ein eigenes Feld (tx.zh);
// bleibt das leer, laeuft der Originaltext mit.
const LAT_FACE = '"Avenir Next", Avenir, "Helvetica Neue", Helvetica, sans-serif';
const ZH_FACE = '"PingFang SC", "Hiragino Sans GB", "Heiti SC", "Microsoft YaHei", sans-serif';
const ZH_LABEL: Record<"success" | "fail", string> = { success: "成功", fail: "失败" };
// „pump" bleibt stehen: so steht es auch in unseren chinesischen Captions und
// in der Kanalbeschreibung — uebersetzt sucht danach niemand.
const ZH_CARD_SLOGAN = "玩得开心，继续 pump！";
const ZH_REVEAL_SUBS = ["你试了一次", "你又试了一次", "你更接近了", "你没有放弃"];
const ZH_REVEAL_HOOK = "成功\n还是失败？";
const ZH_REVEAL_END = "去尝试，本身就是成功。\n\n剩下的只是练习。";
const ZH_REVEAL_FAIL = "待在家里的那一天";
const ZH_DEFAULT_LAST_TEXT = "玩得开心\n\n继续 pump！" + "\n".repeat(16);
const ZH_DEFAULT_2ND_LAST_TEXT =
  "加入我们的免费社区\npumpfoil.org\n\n记录、分享、对比\n你的每一次进步" + "\n".repeat(14);
// Der Text, der wirklich gezeichnet wird.
const txText = (tx: TextSlot, zh: boolean) =>
  (zh && tx.zh && tx.zh.trim()) ? tx.zh : tx.text;

const isStamp = (s?: TxStyle): s is "success" | "fail" => s === "success" || s === "fail";
const shapeOf = (tx: TextSlot): TxShape => tx.shape ?? "plain";
// Alles Gezeichnete (Urteil oder geformter Text) hat feste Masse und rastet
// hart ein; nur freier Fliesstext blendet weich und ist in der Groesse frei.
const isGfx = (tx: TextSlot) => isStamp(tx.style) || shapeOf(tx) !== "plain";
// Standardtexte in den beiden untersten Slots. Die Leerzeilen sind Absicht: die
// Zeilen werden vertikal zentriert (siehe drawText), die Leerzeilen schieben den
// Text nach oben. Die Anzahl ist so gewaehlt, dass beide Bloecke auf derselben
// Hoehe beginnen — bei 3 Zeilen braucht es 16 Leerzeilen, bei 5 nur noch 14.
const DEFAULT_LAST_TEXT = "have fun\n\nkeep pumping!" + "\n".repeat(16);
const DEFAULT_2ND_LAST_TEXT =
  "join our free community\nat https://pumpfoil.org\n\n"
  + "track, share and compare\nyour progress" + "\n".repeat(14);
const emptyTexts = (): TextSlot[] =>
  Array.from({ length: TXN }, (_, i) => ({
    start: null,
    text: i === TXN - 1 ? DEFAULT_LAST_TEXT
      : i === TXN - 2 ? DEFAULT_2ND_LAST_TEXT : "",
    zh: i === TXN - 1 ? ZH_DEFAULT_LAST_TEXT
      : i === TXN - 2 ? ZH_DEFAULT_2ND_LAST_TEXT : "",
    hold: TXH,
    size: TXS,
    style: "text",
    shape: "plain",
  }));

// Vorlage der "success or fail?"-Reihe: Hook, k Urteile, Schlusssatz, echter Fail.
const REVEAL_SUBS = ["you tried it", "you tried again", "you got closer", "you kept going"];
const REVEAL_HOOK = "success\nor fail?";
const REVEAL_END = "trying is the success.\n\nthe rest is practice.";
const REVEAL_FAIL = "the day I stayed home";

// Pegel-Abschnitte: Musik/O-Ton in Zeitfenstern um ±dB anheben/absenken (0,5-s-Rampen)
interface DuckSlot {
  start: number | null;
  end: number | null;
  music: number;
  oton: number;
}
const DUCK_N = 3;
const DUCK_FADE = 0.5;
// Endcard-Einblendung: Startzeit, Ein-/Ausblendung und Standzeit frei waehlbar,
// damit das Bild nicht im Video mitgerendert werden muss.
interface EndCard { file: string; start: number | null; fadeIn: number; hold: number;
  fadeOut: number; alpha: number; append: boolean }
const emptyEndcard = (): EndCard => ({ file: "", start: null, fadeIn: 0.3, hold: 1,
  fadeOut: 0.3, alpha: 1, append: false });
// Wieviel die Endcard das Ergebnis verlaengert. Angehaengt zaehlt nur die
// Standzeit: die Einblende ueberlappt mit der Karte davor (Ueberblendung), und
// ausgeblendet wird am Schluss nicht — danach ist das Video zu Ende.
const ecLen = (e: EndCard) => (e.append ? e.hold : e.fadeIn + e.hold + e.fadeOut);

const emptyDucks = (): DuckSlot[] =>
  Array.from({ length: DUCK_N }, () => ({ start: null, end: null, music: -12, oton: 0 }));

type PvPlatform = "youtube" | "instagram" | "tiktok" | "rednote";
type Sel = Record<PvPlatform, string | null>;
const PF_SHORT: Record<PvPlatform, string> = {
  youtube: "YT", instagram: "IG", tiktok: "TT", rednote: "RN",
};

const OUTRO_ICONS: Record<PvPlatform, [string, string][]> = {
  // Shorts, nicht der Desktop-Player: rechts stehen dort Herz, Sprechblase,
  // Teilen-Pfeil und Remix. Daumen hoch und Glocke kommen darin gar nicht vor
  // — die standen hier bis 08.09. und passten zu keinem Knopf auf dem Schirm.
  youtube: [
    ["M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z", "heart"],
    // Die Silhouette des Pfeils, nicht ein Strich mit Spitze: YouTube und TikTok
    // zeichnen einen massiven Pfeil mit Schaft und Haken unten links. Als
    // geschlossene Form, deshalb das abschliessende z.
    ["M14 7V3l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z", "share"],
  ],
  // Instagram und Facebook: Herz und Reshare. Die Sprechblase liegt
  // auskommentiert daneben — Jan will sie spaeter womoeglich zurueck
  // (08.09.). Der Papierflieger ist raus, geteilt wird dort per Reshare.
  instagram: [
    ["M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z", "heart"],
    // Zipfel unten RECHTS, so zeigt Instagrams eigene Sprechblase:
    // ["M16.1 20A9 9 0 1 1 20 16.1L22 22Z", "comment"],
    // ZWEI getrennte Haken mit je einer Kurve, nicht eine geschlossene
    // Schleife: so zeichnet Instagram es, und mit zwei Kurven je Pfeil wurden
    // die Balken so lang, dass sie sich ueberschnitten (Jan, 08.09.).
    // Alles in EINEM Pfad — die Liste setzt je Eintrag ein eigenes Symbol
    // nebeneinander; jeder Teil beginnt deshalb absolut mit M.
    // Die beiden Haken stehen diagonal 1,5 Rastereinheiten auseinander (oben
    // nach links-oben, unten nach rechts-unten). Buendig aneinander lasen sie
    // sich als geschlossener Kasten; Instagram laesst dort sichtbar Luft.
    ["M5.5 11.5v-2a3 3 0 0 1 3-3h7m-3-3 3 3-3 3M18.5 12.5v2a3 3 0 0 1-3 3H8.5m3-3-3 3 3 3", "reshare"],
  ],
  // TikTok zeichnet GEFUELLTE Symbole, nicht konturierte (siehe OUTRO_FILL).
  // Zwei Symbole, nicht vier: Liken und Speichern sind die beiden, die zaehlen
  // (Jan, 08.09.: hoechstens drei, lieber zwei). Gespeichert wird bei TikTok
  // mit einem LESEZEICHEN — der Stern, der hier bis 10.09. stand, gehoert
  // RedNote. Solange beide dieselbe Datei bekamen, war das ein Kompromiss;
  // seit RedNote einen eigenen Render hat, zeigt jede Plattform ihr Symbol.
  // Sprechblase und Teilen-Pfeil liegen auskommentiert darunter.
  tiktok: [
    ["M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z", "heart"],
    ["M6.4 2.5h11.2a1.6 1.6 0 0 1 1.6 1.6v17.4l-7.2-4.4-7.2 4.4V4.1a1.6 1.6 0 0 1 1.6-1.6z", "lesezeichen"],
    // Punkte auf y=12, dem Mittelpunkt des Blasenkreises:
    // ["M7.9 20A9 9 0 1 0 4 16.1L2 22Z"
    //  + "M6.6 12a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0"
    //  + "M10.6 12a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0"
    //  + "M14.6 12a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0", "comment"],
    // ["M14 7V3l7 7-7 7v-4.1c-5 0-8.5 1.6-11 5.1 1-5 4-10 11-11z", "share"],
  ],
  // RedNote/Xiaohongshu: Herz und STERN. Der Stern ist dort 收藏 (speichern) und
  // damit das wichtigste Symbol ueberhaupt — auf einer Such-Plattform treibt
  // Gespeichertes die Langzeit-Reichweite, nicht das Like. Die App zeigt in der
  // Leiste ausserdem eine Sprechblase; die bleibt weg, zwei reichen.
  rednote: [
    ["M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z", "heart"],
    ["M12 2.5l2.9 5.9 6.6.9-4.8 4.6 1.2 6.5-5.9-3.1-5.9 3.1 1.2-6.5L2.5 9.3l6.6-.9z", "stern"],
  ],
};

// TikTok zeichnet seine Leiste gefuellt, YouTube und Instagram konturiert.
// Ueber Videomaterial sind gefuellte Formen sogar besser lesbar — Kontur ist
// hier keine Design-Entscheidung, sondern schlicht das, was die App zeigt.
const OUTRO_FILL: Record<PvPlatform, boolean> = {
  youtube: false, instagram: false, tiktok: true, rednote: true,
};

function drawIconPath(g: CanvasRenderingContext2D, d: string, x: number, y: number,
                      size: number, fuellen = false) {
  g.save();
  g.translate(x, y);
  g.scale(size / 24, size / 24);
  g.lineWidth = 2;
  // evenodd: die Punkte der Sprechblase liegen als eigene Kreise im selben
  // Pfad und stanzen sich damit aus der Flaeche.
  if (fuellen) g.fill(new Path2D(d), "evenodd");
  else g.stroke(new Path2D(d));
  g.restore();
}

export default function App() {
  const [tab, setTab] = useState<"studio" | "texte" | "upload" | "stats">("studio");
  return (
    <>
      <div className="tabbar">
        <span className="brand">🌊 Pumpfoil Shorts</span>
        <button className={`tab ${tab === "studio" ? "on" : ""}`} onClick={() => setTab("studio")}>
          <Icon name="film" /> Studio
        </button>
        <button className={`tab ${tab === "texte" ? "on" : ""}`} onClick={() => setTab("texte")}>
          <Icon name="wand" /> Texte
        </button>
        <button className={`tab ${tab === "upload" ? "on" : ""}`} onClick={() => setTab("upload")}>
          <Icon name="upload" /> Upload
        </button>
        <button className={`tab ${tab === "stats" ? "on" : ""}`} onClick={() => setTab("stats")}>
          <Icon name="chart" /> Auswertung
        </button>
      </div>
      {tab === "studio" ? <Studio /> : tab === "texte" ? <Uploads />
        : tab === "upload" ? <Publish /> : <Stats />}
    </>
  );
}

// Studio-Einstellungen überleben Reloads via localStorage
const SETTINGS_KEY = "shorts-studio-v1";
function loadSaved(): Record<string, unknown> {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function Studio() {
  const [saved] = useState(loadSaved);
  const sv = <T,>(key: string, fallback: T): T =>
    (saved[key] !== undefined ? (saved[key] as T) : fallback);

  const [state, setState] = useState<AppState | null>(null);
  const [curVideo, setCurVideo] = useState<string | null>(sv("curVideo", null));
  const [curPlay, setCurPlay] = useState<string | null>(null);
  const [renderingVideo, setRenderingVideo] = useState<string | null>(null);
  const [sel, setSel] = useState<Sel>(
    { youtube: null, instagram: null, tiktok: null, rednote: null, ...sv("sel", {}) });
  const [pvPlatform, setPvPlatform] = useState<PvPlatform>(sv("pvPlatform", "youtube"));
  const [trim, setTrim] = useState<{ start: number | null; end: number | null }>(sv("trim", { start: null, end: null }));
  // gespeicherte Slots auffüllen, falls TXN inzwischen größer ist — fehlende
  // Slots bekommen den Default an ihrer eigenen Position, nicht den von vorne
  const [texts, setTexts] = useState<TextSlot[]>(() => {
    const saved = sv("texts", [] as (TextSlot & { card?: boolean })[]);
    // Aeltere Zustaende kannten "banner" als Stil und "card" als Schalter —
    // beides ist jetzt die Form. Ohne diese Umschrift verlierst du beim ersten
    // Laden, was du eingestellt hattest.
    const alt = (s: TextSlot & { card?: boolean }): TextSlot => {
      const style = (s.style as string) === "banner" ? "text" : s.style;
      const shape: TxShape = s.shape ?? ((s.style as string) === "banner" ? "bar"
        : s.card ? "card" : "plain");
      return { ...s, style, shape, card: undefined } as TextSlot;
    };
    return emptyTexts().map((d, i) => (saved[i] ? alt(saved[i]) : d));
  });
  const [gain, setGain] = useState(sv("gain", -12));
  const [otonGain, setOtonGain] = useState(sv("otonGain", 0));
  const [ducks, setDucks] = useState<DuckSlot[]>(sv("ducks", emptyDucks()));
  // Rechte Spalte: Einstellungen und Musiksuche teilen sich die Hoehe nicht mehr,
  // sondern loesen einander ab — es wurde schlicht zu eng.
  const [sideTab, setSideTab] = useState<"set" | "musik">(sv("sideTab", "set"));
  // Mittelspalte: die zehn Rohzeilen, oder die Beat-Liste der Reveal-Reihe.
  // Beides schreibt in dieselben texts-Slots, nur anders bedient.
  const [midTab, setMidTab] = useState<"texte" | "reveal">(sv("midTab", "texte"));
  const [beats, setBeats] = useState<number>(sv("beats", 3));
  const [cardSlogan, setCardSlogan] = useState<boolean>(sv("cardSlogan", true));
  const [txAlpha, setTxAlpha] = useState<number>(sv("txAlpha", TXA));
  const [tailSecs, setTailSecs] = useState<number>(sv("tailSecs", 0));
  // Endcard: ganzflaechiges Bild an frei gewaehlter Stelle, Zeiten in Sekunden
  const [endcard, setEndcard] = useState<EndCard>(() => {
    // Vorgaben zuerst, gespeicherte Werte darueber — so fehlt bei aelteren
    // Staenden kein Feld (z. B. alpha, das es frueher nicht gab).
    const e: EndCard = { ...emptyEndcard(), ...(sv("endcard", {}) as Partial<EndCard>) };
    // Einmalige Umstellung: wer noch exakt auf den alten Vorgabewerten sitzt
    // (0,6 / 3 / 0,6), bekommt die neuen — eine eigene Einstellung bleibt.
    return e.fadeIn === 0.6 && e.hold === 3 && e.fadeOut === 0.6
      ? { ...e, ...emptyEndcard(), file: e.file, start: e.start } : e;
  });
  const ecImgRef = useRef<HTMLImageElement | null>(null);
  const [fade, setFade] = useState(sv("fade", 2));
  const [outName, setOutName] = useState(sv("outName", ""));
  const [ovOn, setOvOn] = useState(sv("ovOn", true));
  const [ovSel, setOvSel] = useState(sv("ovSel", ""));
  const [ovAlpha, setOvAlpha] = useState(sv("ovAlpha", 0.5));
  const [outroOn, setOutroOn] = useState(sv("outroOn", true));
  const [fltYT, setFltYT] = useState(sv("fltYT", true));
  const [fltIG, setFltIG] = useState(sv("fltIG", true));
  const [fltTT, setFltTT] = useState(sv("fltTT", true));
  const [fltRN, setFltRN] = useState(sv("fltRN", true));
  const [search, setSearch] = useState("");
  const [vfilter, setVfilter] = useState("");

  // Ein Objekt, zwei Zwecke: es ueberlebt den Reload im localStorage UND geht
  // mit jedem Render als Rezept an den Server. Vorher lag es nur im Browser
  // und wurde bei jeder Aenderung ueberschrieben — was in einem fertigen Video
  // steckte, war hinterher nicht mehr feststellbar (Jan, 10.09.).
  const studioState = useMemo(() => ({
    curVideo, sel, pvPlatform, trim, texts, gain, otonGain, ducks, fade,
    sideTab, endcard, midTab, beats, cardSlogan, txAlpha, tailSecs,
    outName, ovOn, ovSel, ovAlpha, outroOn, fltYT, fltIG, fltTT, fltRN,
  }), [curVideo, sel, pvPlatform, trim, texts, gain, otonGain, ducks, fade, outName, ovOn, ovSel, ovAlpha, outroOn, fltYT, fltIG, fltTT, fltRN, sideTab, endcard, midTab, beats, cardSlogan, txAlpha, tailSecs]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(studioState));
  }, [studioState]);
  const [browserOpen, setBrowserOpen] = useState(false);
  const [dirInput, setDirInput] = useState("");
  const [log, setLog] = useState("");
  const [aMsg, setAMsg] = useState("");
  const [prog, setProg] = useState<{ label: string; pct: number } | null>(null);
  const [rendering, setRendering] = useState(false);

  // Angehaengter Teil. Was ein Overlay hinten ueberhaengt, verlaengert das
  // Ergebnis VON SELBST — das Feld in der Trim-Zeile ist nur ein Mindestwert.
  // Danach kommt, falls angehakt, die Endcard.
  // Laenge der Quelldatei. Steht als Zahl unter dem Player: die Zeiten fuer
  // Trim, Texte und Endcard liegen auf derselben Achse, und dafuer braucht man
  // das Ende auf die Zehntelsekunde (Jan, 09.09.).
  const srcDur = curVideo ? state?.vdurs?.[curVideo] ?? 0 : 0;
  const vidEnd = useMemo(() => trim.end ?? srcDur, [srcDur, trim.end]);
  const overhang = useMemo(() => {
    if (!vidEnd) return 0;
    let o = 0;
    for (const tx of texts) {
      if (tx.start == null || !(tx.text.trim() || isStamp(tx.style))) continue;
      const fd = isGfx(tx) ? STAMP_FADE : TXF;
      o = Math.max(o, tx.start + 2 * fd + tx.hold - vidEnd);
    }
    return Math.max(0, o);
  }, [texts, vidEnd]);
  const tailTotal = useMemo(
    () => Math.max(tailSecs, overhang) + (endcard.file && endcard.append ? ecLen(endcard) : 0),
    [tailSecs, overhang, endcard],
  );

  const tailRef = useRef<{ at: number | null }>({ at: null });
  const vidRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const txovRefs = useRef<(HTMLElement | null)[]>([]);
  // Die Vorschau zeigt genau das PNG, das auch gerendert wird — nicht mehr
  // eine CSS-Nachbildung. Neu erzeugt nur bei Aenderung, nicht je Frame.
  const [txPreview, setTxPreview] = useState<(string | null)[]>([]);
  const outroImgRef = useRef<HTMLImageElement>(null);
  const allowPlayRef = useRef(0);
  const playTimerRef = useRef<number | undefined>(undefined);
  const lastTRef = useRef(0);
  const outroCacheRef = useRef<{ key: string; url: string }>({ key: "", url: "" });

  // Live-Werte für den rAF-Loop (State-Snapshot ohne Re-Subscribe)
  const live = useRef({ trim, texts, outroOn, pvPlatform, curPlay, ducks, gain, otonGain, endcard, tailSecs, tailTotal, overhang });
  live.current = { trim, texts, outroOn, pvPlatform, curPlay, ducks, gain, otonGain, endcard, tailSecs, tailTotal, overhang };

  const load = useCallback(async () => {
    const s = await api.list();
    setState(s);
    return s;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-Pick: beim ersten Laden das gemerkte Video wiederherstellen,
  // sonst das erste wählen, wenn keins (mehr) gewählt ist
  const initedRef = useRef(false);
  useEffect(() => {
    if (!state) return;
    setDirInput((d) => (d === "" || !document.activeElement?.classList?.contains("dirinput") ? state.video_dir : d));
    if (!initedRef.current) {
      initedRef.current = true;
      if (curVideo && state.videos.includes(curVideo)) {
        pickVideo(curVideo);
        return;
      }
    }
    if ((!curVideo || !state.videos.includes(curVideo)) && state.videos.length) {
      pickVideo(state.videos[0]);
    }
    if (!state.overlays.includes(ovSel)) {
      const def = "youtube-overlay-xxsmall-noshadow-1080x1920.png";
      setOvSel(state.overlays.includes(def) ? def : (state.overlays[0] ?? ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const stopMusic = useCallback(() => {
    musicRef.current?.pause();
    setCurPlay(null);
  }, []);

  // Studio verlassen (Tab-Wechsel) → Wiedergabe hart beenden. Ein aus dem DOM
  // genommenes <video>/<audio> läuft sonst unsichtbar weiter.
  useEffect(() => {
    const els = [vidRef.current, musicRef.current];
    return () => {
      window.clearTimeout(playTimerRef.current);
      allowPlayRef.current = Infinity;  // späte Play-Versuche abwürgen
      for (const el of els) {
        if (!el) continue;
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
    };
  }, []);

  const pickVideo = useCallback(
    (v: string) => {
      const vid = vidRef.current;
      setCurVideo(v);
      if (vid) {
        vid.pause();
        vid.src = "/media/video/" + encodeURIComponent(v);
        window.clearTimeout(playTimerRef.current);
        // Wächter: bis der Timer abläuft, wird JEDES Play sofort wieder pausiert
        allowPlayRef.current = performance.now() + 950;
        playTimerRef.current = window.setTimeout(() => {
          allowPlayRef.current = 0;
          // nur starten, wenn der Player noch im DOM hängt (Tab-Wechsel!) und
          // die Seite sichtbar ist — sonst spielt es unbemerkt im Hintergrund
          const cur = vidRef.current;
          if (cur && cur.isConnected && !document.hidden) cur.play().catch(() => {});
        }, 1000);
      }
      stopMusic();
    },
    [stopMusic],
  );

  // Video-Events: Play-Wächter, Musik-Sync
  useEffect(() => {
    const vid = vidRef.current;
    const music = musicRef.current;
    if (!vid || !music) return;
    const onPlay = () => {
      if (performance.now() < allowPlayRef.current) {
        vid.pause();
        return;
      }
      if (live.current.curPlay && music.paused) void music.play();
    };
    const onPause = () => music.pause();
    const onSeeked = () => {
      if (live.current.curPlay && music.duration) {
        music.currentTime = Math.max(0, vid.currentTime - (live.current.trim.start ?? 0)) % music.duration;
      }
    };
    vid.addEventListener("play", onPlay);
    vid.addEventListener("pause", onPause);
    vid.addEventListener("seeked", onSeeked);
    return () => {
      vid.removeEventListener("play", onPlay);
      vid.removeEventListener("pause", onPause);
      vid.removeEventListener("seeked", onSeeked);
    };
  }, []);

  // rAF-Loop: Trim-Loop + Text-Overlay-Vorschau + Outro-Vorschau
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const vid = vidRef.current;
      if (vid) {
        const { trim, texts, outroOn, pvPlatform, ducks, gain, otonGain, endcard,
                tailSecs, tailTotal } = live.current;
        const vdur = isFinite(vid.duration) ? vid.duration : 0;
        const endT = trim.end ?? vdur;
        // Der angehaengte Teil existiert im <video> nicht. Also: am Ende
        // anhalten (das haelt das letzte Bild, wie tpad im Render) und die Zeit
        // fuer die Overlays weiterlaufen lassen.
        let t = vid.currentTime;
        const tl = tailRef.current;
        if (tl.at != null) {
          const el = (performance.now() - tl.at) / 1000;
          if (!vid.paused || tailTotal <= 0 || el >= tailTotal) {
            tailRef.current = { at: null };
            if (tailTotal > 0 && vid.paused) {
              vid.currentTime = trim.start ?? 0;
              void vid.play();
            }
          } else {
            t = endT + el;
          }
        } else if (!vid.paused) {
          if (endT > 0 && t >= endT - 0.03) {
            if (tailTotal > 0) {
              tailRef.current = { at: performance.now() };
              vid.pause();
              t = endT;
            } else if (trim.end != null) vid.currentTime = trim.start ?? 0;
          } else if (trim.start && t < trim.start && lastTRef.current > t + 1) {
            vid.currentTime = trim.start;
          }
        }
        lastTRef.current = vid.currentTime;
        // Pegel-Vorschau: Musik/O-Ton-Lautstärke inkl. Pegel-Abschnitten
        // (Browser kann nicht über 100 % — O-Ton-Boost hört man erst im Render voll)
        const duckF = (key: "music" | "oton") => {
          let f = 1;
          for (const d of ducks) {
            if (d.start == null && d.end == null) continue;
            const s = d.start ?? 0; // offene Grenzen wie im Render: ab 0 bzw. bis Videoende
            if (d.end != null && d.end <= s) continue;
            const db = key === "music" ? d.music : d.oton;
            if (!db) continue;
            const r = Math.min(Math.max((t - s) / DUCK_FADE, 0), 1) *
                      (d.end == null ? 1 : Math.min(Math.max((d.end + DUCK_FADE - t) / DUCK_FADE, 0), 1));
            f *= 1 + (Math.pow(10, db / 20) - 1) * r;
          }
          return f;
        };
        vid.volume = Math.min(1, Math.pow(10, otonGain / 20) * duckF("oton"));
        if (musicRef.current)
          musicRef.current.volume = Math.min(1, Math.pow(10, gain / 20) * duckF("music"));
        texts.forEach((tx, i) => {
          const el = txovRefs.current[i];
          if (!el) return;
          if (tx.start == null) {
            el.style.opacity = "0";
            return;
          }
          const fd = isGfx(tx) ? STAMP_FADE : TXF;
          const e = tx.start + 2 * fd + (tx.hold ?? TXH);
          const a = Math.max(0, Math.min(Math.min((t - tx.start) / fd, (e - t) / fd), 1));
          el.style.opacity = String(a);
        });
        const ec = ecImgRef.current;
        if (ec) {
          const on = endcard.file && (endcard.append || endcard.start != null);
          if (!on) ec.style.opacity = "0";
          else {
            const s0 = endcard.append
              ? Math.max(0, endT + Math.max(tailSecs, overhang) - endcard.fadeIn)
              : (endcard.start as number);
            const e0 = s0 + endcard.fadeIn + endcard.hold;
            const auf = (t - s0) / Math.max(0.05, endcard.fadeIn);
            const ab = endcard.append ? 1
              : (e0 + endcard.fadeOut - t) / Math.max(0.05, endcard.fadeOut);
            ec.style.opacity = String(endcard.alpha * Math.max(0, Math.min(Math.min(auf, ab), 1)));
          }
        }
        const oi = outroImgRef.current;
        if (oi) {
          const dur = vid.duration;
          if (outroOn && isFinite(dur) && dur > 0) {
            const end = trim.end ?? dur;
            const effLen = end - (trim.start ?? 0);
            const secs = effLen > OUTRO_LONG_AB ? OUTRO_SECS_LONG : OUTRO_SECS;
            const st = Math.max(trim.start ?? 0, end - secs);
            const a = Math.max(0, Math.min((t - st) / TXF, 1))
              * (tailTotal > 0 ? Math.max(0, Math.min((end - t) / TXF, 1)) : 1);
            const key = pvPlatform + "|" + vid.videoWidth;
            if (a > 0 && outroCacheRef.current.key !== key) {
              outroCacheRef.current = { key, url: outroPng(pvPlatform, vid) };
              oi.src = outroCacheRef.current.url;
            }
            oi.style.opacity = String(a);
          } else {
            oi.style.opacity = "0";
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Musik-Lautstärke aus Gain
  useEffect(() => {
    if (musicRef.current) musicRef.current.volume = Math.pow(10, gain / 20);
  }, [gain, curPlay]);

  function outroPng(pf: PvPlatform, vid: HTMLVideoElement): string {
    const w = vid.videoWidth || 1080;
    const h = vid.videoHeight || 1920;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    const items = OUTRO_ICONS[pf];
    const size = 110;
    const gap = 54;
    const total = items.length * size + (items.length - 1) * gap;
    let x = (w - total) / 2;
    // YT: unteres Drittel wie gehabt; IG/TikTok: exakt mittig (Safe-Space)
    const y = pf === "youtube" ? h * 0.68 : h / 2 - size / 2;
    const fuellen = OUTRO_FILL[pf];
    g.strokeStyle = "#fff";
    g.fillStyle = "#fff";
    g.shadowColor = "rgba(0,0,0,0.7)";
    g.shadowBlur = 8;
    g.shadowOffsetX = 2;
    g.shadowOffsetY = 2;
    g.lineCap = "round";
    g.lineJoin = "round";
    for (const [d] of items) {
      drawIconPath(g, d, x, y, size, fuellen);
      x += size + gap;
    }
    return flatten(c, txAlpha);
  }

  // Einheitliche Deckkraft: erst deckend zeichnen, dann als Ganzes abblenden.
  // Direkt mit globalAlpha zu zeichnen wuerde die Ueberlappungen im Stempel
  // (Rahmen auf Flaeche, Stempel auf Karte) unterschiedlich dicht machen.
  function flatten(c: HTMLCanvasElement, a: number): string {
    if (a >= 0.999) return c.toDataURL("image/png");
    const o = document.createElement("canvas");
    o.width = c.width;
    o.height = c.height;
    const g = o.getContext("2d")!;
    g.globalAlpha = Math.max(0.05, a);
    g.drawImage(c, 0, 0);
    return o.toDataURL("image/png");
  }

  // Abgerundetes Rechteck ohne roundRect() — arcTo laeuft ueberall.
  function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // Balken ueber die ganze Breite. Gerade gesetzt, damit die schraegen Stempel
  // sich davon abheben. Zwei Faelle:
  //   Text   — die Frage der Reihe, gruene Kante oben und rote unten (noch
  //            keine Antwort), "success"/"fail" im Text in ihrer Urteilsfarbe.
  //   Urteil — Haken bzw. Kreuz mit SUCCESS/FAIL als Kopfzeile und dem Textfeld
  //            als Unterzeile, Kanten oben UND unten in der Urteilsfarbe.
  function barPng(tx: TextSlot, w: number, h: number, zh: boolean): string {
    if (isStamp(tx.style)) return verdictBarPng(tx, w, h, STAMP[tx.style], zh);
    return hookBarPng(tx, w, h, zh);
  }

  function verdictBarPng(tx: TextSlot, w: number, h: number,
                         cfg: { label: string; color: string }, zh: boolean): string {
    const k = w / 1080;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    const face = zh ? ZH_FACE : LAT_FACE;
    const label = zh ? ZH_LABEL[tx.style as "success" | "fail"] : cfg.label;
    // Auf einem Balken ueber die ganze Breite darf das Urteil nicht so klein
    // sein wie im Stempel — sonst schwimmen vier Buchstaben in einer leeren
    // Zeile. Alle Masse haengen deshalb an FS und wachsen mit.
    const EDGE = 10 * k;
    let FS = 148 * k, LS = 0.07 * FS;
    let ICON = 0.85 * FS, IGAP = 0.28 * FS, PADY = 0.42 * FS, GAP = 0.2 * FS;

    const setz = () => {
      g.font = `800 ${FS}px ${face}`;
      g.letterSpacing = `${LS}px`;
      return g.measureText(label);
    };
    let m = setz();
    // measureText zaehlt die Sperrung hinter dem letzten Zeichen mit — weg damit.
    const kopf = () => ICON + IGAP + m.width - LS;
    if (kopf() > w * 0.86) {
      const f = (w * 0.86) / kopf();
      FS *= f;
      LS *= f;
      ICON *= f;
      IGAP *= f;
      PADY *= f;
      GAP *= f;
      m = setz();
    }
    const SUB_FS = 0.38 * FS;
    const capA = m.actualBoundingBoxAscent || FS * 0.72;
    const capD = m.actualBoundingBoxDescent || 0;

    const sub = txText(tx, zh).trim().split("\n").map((s) => s.trim()).filter(Boolean);
    let subFs = SUB_FS;
    if (sub.length) {
      g.font = `600 ${subFs}px ${face}`;
      g.letterSpacing = `${2 * k}px`;
      const breit = Math.max(...sub.map((l) => g.measureText(l).width));
      if (breit > w * 0.88) subFs *= (w * 0.88) / breit;
    }
    const subH = sub.length ? sub.length * subFs * 1.2 : 0;
    const barH = PADY * 2 + (capA + capD) + (sub.length ? GAP + subH : 0);
    const top = h * 0.42 - barH / 2;

    g.fillStyle = NAVY;
    g.fillRect(0, top, w, barH);
    g.fillStyle = cfg.color;
    g.fillRect(0, top, w, EDGE);
    g.fillRect(0, top + barH - EDGE, w, EDGE);

    // Kopfzeile: Icon und Wort als ein Block in der Mitte
    const kb = kopf();
    let x = (w - kb) / 2;
    const mid = top + PADY + (capA + capD) / 2;
    g.save();
    g.translate(x, mid - ICON / 2);
    g.scale(ICON / 24, ICON / 24);
    g.strokeStyle = cfg.color;
    g.lineWidth = 3.6;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    if (tx.style === "success") {
      g.moveTo(4, 12.5); g.lineTo(9.5, 18); g.lineTo(20, 6.5);
    } else {
      g.moveTo(6, 6); g.lineTo(18, 18); g.moveTo(18, 6); g.lineTo(6, 18);
    }
    g.stroke();
    g.restore();
    g.font = `800 ${FS}px ${face}`;
    g.letterSpacing = `${LS}px`;
    g.fillStyle = cfg.color;
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    g.fillText(label, x + ICON + IGAP, mid + (capA - capD) / 2);

    if (sub.length) {
      g.font = `600 ${subFs}px ${face}`;
      g.letterSpacing = `${2 * k}px`;
      g.fillStyle = "#ffffff";
      g.textAlign = "center";
      g.textBaseline = "middle";
      let y = top + PADY + (capA + capD) + GAP + subFs * 0.6;
      for (const l of sub) {
        g.fillText(l, w / 2, y);
        y += subFs * 1.2;
      }
    }
    return flatten(c, txAlpha);
  }

  function hookBarPng(tx: TextSlot, w: number, h: number, zh: boolean): string {
    const k = w / 1080;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    const face = zh ? ZH_FACE : LAT_FACE;
    const lines = txText(tx, zh).split("\n").map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return c.toDataURL("image/png");

    const widest = (fs: number, ls: number) => {
      g.font = `800 ${fs}px ${face}`;
      g.letterSpacing = `${ls}px`;
      return Math.max(...lines.map((l) => g.measureText(l).width));
    };
    // Schrift so gross wie moeglich, aber der Text muss in den Balken passen.
    let fs = 96 * k, ls = 6 * k;
    const nat = widest(fs, ls);
    const maxW = w * 0.9;
    if (nat > maxW) {
      const f = maxW / nat;
      fs *= f;
      ls *= f;
    }

    const EDGE = 10 * k, PADY = 44 * k, LEAD = 1.18;
    const lineH = fs * LEAD;
    const barH = PADY * 2 + lineH * lines.length;
    const top = h * 0.42 - barH / 2;
    g.fillStyle = NAVY;
    g.fillRect(0, top, w, barH);
    g.fillStyle = STAMP.success.color;
    g.fillRect(0, top, w, EDGE);
    g.fillStyle = STAMP.fail.color;
    g.fillRect(0, top + barH - EDGE, w, EDGE);

    g.font = `800 ${fs}px ${face}`;
    g.letterSpacing = `${ls}px`;
    g.textBaseline = "middle";
    g.textAlign = "left";
    lines.forEach((line, i) => {
      // Wort fuer Wort setzen, damit "success" und "fail" ihre Farbe bekommen;
      // Satzzeichen werden abgetrennt und bleiben weiss. Chinesisch kennt keine
      // Wortluecken — dort wird an genau den beiden Woertern getrennt, sonst
      // faende die Tabelle nie einen Treffer ("还是失败" ist EIN Wort fuer \p{L}).
      const parts = (zh ? line.split(/(成功|失败)/).filter(Boolean)
                        : line.match(/[\p{L}]+|[^\p{L}]+/gu)) ?? [line];
      let x = (w - g.measureText(line).width) / 2;
      const y = top + PADY + lineH * (i + 0.5);
      for (const part of parts) {
        g.fillStyle = BANNER_WORDS[part.toLowerCase()] ?? "#ffffff";
        g.fillText(part, x, y);
        x += g.measureText(part).width;
      }
    });
    return flatten(c, txAlpha);
  }

  // Grund jeder Karte: Navy ueber das ganze Bild, dazu dieselben Kanten wie am
  // Balken — gruen oben, rot unten. Karte und Balken sind damit sichtbar
  // dasselbe Format.
  function cardGround(g: CanvasRenderingContext2D, w: number, h: number) {
    g.fillStyle = NAVY;
    g.fillRect(0, 0, w, h);
    const edge = 10 * (w / 1080);
    g.fillStyle = STAMP.success.color;
    g.fillRect(0, 0, w, edge);
    g.fillStyle = STAMP.fail.color;
    g.fillRect(0, h - edge, w, edge);
  }

  // Alle Stempelmasse an einem Ort: sie sind fuer 1080 Breite entworfen und
  // haengen linear an k, damit die Karte denselben Stempel nur groesser zeigt.
  function stampMetrics(g: CanvasRenderingContext2D, tx: TextSlot, label: string,
                        k: number, face: string, zh: boolean) {
    const B = 12 * k, R = 20 * k, PX = 50 * k, GAP = 28 * k;
    const FS = 92 * k, LS = 10 * k, ICON = 84 * k;
    const SUB_FS = 48 * k, SUB_PY = 18 * k, SUB_PX = 40 * k, SUB_R = 12 * k, SUB_GAP = 20 * k;
    g.font = `800 ${FS}px ${face}`;
    g.letterSpacing = `${LS}px`;
    // measureText zaehlt die Sperrung HINTER dem letzten Zeichen mit — die ist
    // aber nicht zu sehen. Ungekuerzt sitzt der Text sichtbar zu weit links.
    const m = g.measureText(label);
    const labelW = m.width - LS;
    // Versalien in der Kastenmitte: nicht ueber die Schriftgroesse rechnen
    // (da haengt Unterlaenge drin, die "SUCCESS" gar nicht hat), sondern ueber
    // die tatsaechliche Hoehe der Buchstaben.
    const capA = m.actualBoundingBoxAscent || FS * 0.72;
    const capD = m.actualBoundingBoxDescent || 0;
    const capH = capA + capD;
    const boxW = PX * 2 + ICON + GAP + labelW;
    const boxH = 41 * k * 2 + capH;
    const sub = txText(tx, zh).trim();
    let subW = 0, subH = 0;
    if (sub) {
      g.font = `600 ${SUB_FS}px ${face}`;
      g.letterSpacing = `${2 * k}px`;
      subW = g.measureText(sub).width - 2 * k + SUB_PX * 2;
      subH = SUB_FS + SUB_PY * 2;
    }
    return { B, R, PX, GAP, FS, LS, ICON, capA, capD, capH, labelW,
             SUB_FS, SUB_PY, SUB_PX, SUB_R, SUB_GAP,
             boxW, boxH, sub, subW, subH, blockH: boxH + (sub ? SUB_GAP + subH : 0) };
  }

  // Stempel: Navy-Flaeche, farbiger Rahmen, Haken bzw. Kreuz, darunter die
  // Unterzeile im selben Winkel. Als Karte deckt er das ganze Bild ab und faellt
  // dabei groesser aus — dann konkurriert er mit keinem Video mehr.
  function stampPng(tx: TextSlot, w: number, h: number, slogan: boolean,
                    card: boolean, zh: boolean): string {
    const cfg = STAMP[tx.style as "success" | "fail"];
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    const face = zh ? ZH_FACE : LAT_FACE;
    const label = zh ? ZH_LABEL[tx.style as "success" | "fail"] : cfg.label;
    if (card) {
      cardGround(g, w, h);
    }

    // Erst messen, dann notfalls kleiner rechnen: eine lange Unterzeile darf
    // nicht aus dem Bild laufen. 0,88 laesst Platz fuer die Schraeglage.
    let k = (w / 1080) * (card ? CARD_K : 1);
    let m = stampMetrics(g, tx, label, k, face, zh);
    const maxW = w * 0.88;
    const wide = Math.max(m.boxW, m.subW);
    if (wide > maxW) {
      k *= maxW / wide;
      m = stampMetrics(g, tx, label, k, face, zh);
    }

    g.translate(w / 2, h * (card ? 0.5 : 0.46));
    g.rotate((cfg.tilt * Math.PI) / 180);
    g.textAlign = "left";
    g.textBaseline = "middle";

    // Stempel
    const bx = -m.boxW / 2, by = -m.blockH / 2;
    if (!card) {
      // Schlagschatten braucht es nur ueber dem Video; auf Navy ist er unsichtbar.
      g.shadowColor = "rgba(2,6,23,0.45)";
      g.shadowBlur = 34 * k;
      g.shadowOffsetY = 10 * k;
    }
    g.fillStyle = NAVY;
    rrect(g, bx, by, m.boxW, m.boxH, m.R);
    g.fill();
    g.shadowColor = "transparent";
    g.shadowBlur = 0;
    g.shadowOffsetY = 0;
    g.strokeStyle = cfg.color;
    g.lineWidth = m.B;
    rrect(g, bx + m.B / 2, by + m.B / 2, m.boxW - m.B, m.boxH - m.B, m.R - m.B / 2);
    g.stroke();

    // Haken / Kreuz, aus dem 24er Raster der Outro-Icons
    const s = m.ICON / 24;
    g.save();
    g.translate(bx + m.PX, by + m.boxH / 2 - m.ICON / 2);
    g.scale(s, s);
    g.strokeStyle = cfg.color;
    g.lineWidth = 3.6;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    if (tx.style === "success") {
      g.moveTo(4, 12.5); g.lineTo(9.5, 18); g.lineTo(20, 6.5);
    } else {
      g.moveTo(6, 6); g.lineTo(18, 18); g.moveTo(18, 6); g.lineTo(6, 18);
    }
    g.stroke();
    g.restore();

    g.font = `800 ${m.FS}px ${face}`;
    g.letterSpacing = `${m.LS}px`;
    g.fillStyle = cfg.color;
    g.textBaseline = "alphabetic";
    g.fillText(label, bx + m.PX + m.ICON + m.GAP,
               by + m.boxH / 2 + (m.capA - m.capD) / 2);
    g.textBaseline = "middle";

    // Unterzeile: auf der Karte braucht das Plaettchen einen Hauch mehr Helligkeit
    // als der Grund, sonst verschwindet es und die Zeile schwebt frei.
    if (m.sub) {
      const sy = by + m.boxH + m.SUB_GAP;
      g.fillStyle = card ? CARD_CHIP : NAVY;
      rrect(g, -m.subW / 2, sy, m.subW, m.subH, m.SUB_R);
      g.fill();
      g.font = `600 ${m.SUB_FS}px ${face}`;
      g.letterSpacing = `${2 * k}px`;
      g.fillStyle = "#ffffff";
      g.fillText(m.sub, -m.subW / 2 + m.SUB_PX, sy + m.subH / 2);
    }

    // Der Standardspruch steht gerade und unten — er gehoert zum Kanal, nicht
    // zum Urteil, deshalb Markenfarbe statt Gruen/Rot und keine Schraeglage.
    if (card && slogan) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      const sk = w / 1080;
      g.font = `600 ${64 * sk}px ${face}`;
      g.letterSpacing = `${2 * sk}px`;
      g.textAlign = "center";
      g.fillStyle = CYAN;
      g.fillText(zh ? ZH_CARD_SLOGAN : CARD_SLOGAN, w / 2, h * 0.8);
    }
    // Die Karte bleibt deckend: sie ersetzt das Bild, statt darueber zu liegen —
    // sonst geistert das Video (und das Logo-Overlay) durch das Navy.
    return flatten(c, card ? 1 : txAlpha);
  }

  function textPng(tx: TextSlot, zh = false): string {
    const vid = vidRef.current;
    const w = vid?.videoWidth || 1080;
    const h = vid?.videoHeight || 1920;
    const shape = shapeOf(tx);
    if (shape === "bar") return barPng(tx, w, h, zh);
    if (isStamp(tx.style)) return stampPng(tx, w, h, cardSlogan, shape === "card", zh);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    // Text als Karte: derselbe Navy-Grund wie beim Urteil, damit der
    // Schlusssatz dasselbe Format hat — und der Spruch darunter.
    const karte = shape === "card";
    const fs = karte ? 76 * (w / 1080) : (tx.size ?? TXS);
    if (karte) cardGround(g, w, h);
    g.font = zh ? `${fs}px ${ZH_FACE}` : `${fs}px Arial`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = "#fff";
    if (!karte) {
      // Schatten braucht es nur ueber dem Video; auf Navy ist er unsichtbar.
      g.shadowColor = "rgba(0,0,0,0.7)";
      g.shadowBlur = 6;
      g.shadowOffsetX = 2;
      g.shadowOffsetY = 2;
    }
    // Auf der Karte fallen die angehaengten Leerzeilen der Standardtexte weg:
    // die schieben den Text ueber dem Video nach oben, hier gibt es kein Video,
    // das freigehalten werden muss. Leerzeilen MITTEN im Text bleiben.
    let lines = txText(tx, zh).split("\n");
    if (karte) {
      lines = lines.map((s) => s.trimEnd());
      while (lines.length && !lines[lines.length - 1]) lines.pop();
    }
    const lh = fs * 1.15;
    const mitte = karte ? h * 0.44 : h / 2;
    const y0 = mitte - ((lines.length - 1) / 2) * lh;
    lines.forEach((ln, i) => g.fillText(ln, w / 2, y0 + i * lh));
    if (karte && cardSlogan) {
      const sk = w / 1080;
      g.font = `600 ${64 * sk}px ${zh ? ZH_FACE : LAT_FACE}`;
      g.letterSpacing = `${2 * sk}px`;
      g.fillStyle = CYAN;
      g.fillText(zh ? ZH_CARD_SLOGAN : CARD_SLOGAN, w / 2, h * 0.8);
    }
    return flatten(c, txAlpha);
  }

  // Die Vorschau zeigt, was fuer die GEWAEHLTE Plattform gerendert wird — beim
  // Outro war das schon so, Texte und Endcard zogen bis 10.09. nicht mit.
  const zhVorschau = pvPlatform === "rednote";

  useEffect(() => {
    setTxPreview(texts.map((tx) =>
      tx.start != null && (tx.text.trim() || isStamp(tx.style))
        ? textPng(tx, zhVorschau) : null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texts, curVideo, cardSlogan, txAlpha, zhVorschau]);

  // Slot-Plan der Reihe: Hook, k Urteile, Schluss, echter Fail — auf die
  // vorhandenen Textslots abgebildet, damit am Render nichts anzupassen ist.
  const revealRows = useMemo(() => {
    const r: { slot: number; label: string; hint: string }[] = [
      { slot: 0, label: "Hook", hint: "über dem ersten Frame" },
    ];
    for (let b = 0; b < beats; b++)
      r.push({ slot: 1 + b, label: `Urteil ${b + 1}`, hint: "auf den Aufprall setzen" });
    r.push({ slot: beats + 1, label: "Schluss", hint: "die Aussage" });
    r.push({ slot: beats + 2, label: "Echter Fail", hint: "Standbild o. ä." });
    return r;
  }, [beats]);

  function seedReveal() {
    setTexts((ts) =>
      ts.map((t, i): TextSlot => {
        if (i === 0) return { ...t, text: REVEAL_HOOK, zh: ZH_REVEAL_HOOK, style: "text", shape: "bar", hold: 1.2 };
        if (i >= 1 && i <= beats)
          return { ...t, text: REVEAL_SUBS[(i - 1) % REVEAL_SUBS.length],
                   zh: ZH_REVEAL_SUBS[(i - 1) % ZH_REVEAL_SUBS.length],
                   style: "success", shape: "plain", hold: 1.2 };
        if (i === beats + 1) return { ...t, text: REVEAL_END, zh: ZH_REVEAL_END, style: "text", shape: "card", hold: 2.2 };
        if (i === beats + 2) return { ...t, text: REVEAL_FAIL, zh: ZH_REVEAL_FAIL, style: "fail", shape: "card", hold: 2.2 };
        return t;
      }),
    );
  }

  const setDir = useCallback(
    async (dir: string) => {
      const d = await api.post<AppState & { error?: string }>("/api/setdir", { dir });
      if (d.error) {
        setLog(d.error);
        return;
      }
      setCurVideo(null);
      stopMusic();
      setState(d);
    },
    [stopMusic],
  );

  const toggleStar = useCallback(async (v: string, on: boolean) => {
    setState(await api.post<AppState>("/api/star", { video: v, on }));
  }, []);

  const sortedVids = useCallback((): string[] => {
    if (!state) return [];
    const starred = new Set(state.stars);
    // Suchbegriffe einzeln und in beliebiger Reihenfolge: "charly fail" findet
    // 20260904-charly-fail.mp4, egal ob mit Bindestrich oder Leerzeichen getippt.
    const terms = vfilter.toLowerCase().split(/[\s-]+/).filter(Boolean);
    const hit = (v: string) => {
      const n = v.toLowerCase();
      return terms.every((s) => n.includes(s));
    };
    return [...state.videos]
      .filter(hit)
      .sort((a, b) => (starred.has(b) ? 1 : 0) - (starred.has(a) ? 1 : 0) || a.localeCompare(b));
  }, [state, vfilter]);

  const discard = useCallback(
    async (v: string, category: string) => {
      const order = sortedVids();
      const idx = order.indexOf(v);
      const d = await api.post<AppState & { error?: string }>("/api/discard", { video: v, category });
      if (d.error) {
        setLog(d.error);
        return;
      }
      // nächstes Video in Listenreihenfolge wählen (sonst das davor)
      let next: string | null = null;
      for (let i = idx + 1; i < order.length; i++) if (d.videos.includes(order[i])) { next = order[i]; break; }
      if (!next) for (let i = idx - 1; i >= 0; i--) if (d.videos.includes(order[i])) { next = order[i]; break; }
      setState(d);
      if (curVideo === v) {
        if (next) pickVideo(next);
        else setCurVideo(null);
      }
    },
    [curVideo, pickVideo, sortedVids],
  );

  const undo = useCallback(async () => {
    const d = await api.post<AppState & { undone: string | null }>("/api/undo", {});
    const u = d.undone;
    setState(d);
    setAMsg(u ? `wiederhergestellt: ${u}` : "nichts rückgängig zu machen");
    if (u && d.videos.includes(u)) pickVideo(u);
  }, [pickVideo]);

  const togglePlay = useCallback(
    (t: Track) => {
      const music = musicRef.current;
      const vid = vidRef.current;
      if (!music) return;
      if (curPlay === t.rel) {
        stopMusic();
        return;
      }
      setCurPlay(t.rel);
      music.src = "/media/musik/" + encPath(t.rel);
      music.volume = Math.pow(10, gain / 20);
      void music.play();
      if (vid?.src) {
        allowPlayRef.current = 0;
        window.clearTimeout(playTimerRef.current);
        vid.currentTime = trim.start ?? 0;
        vid.muted = false;
        void vid.play();
      }
    },
    [curPlay, gain, stopMusic, trim.start],
  );

  const playSelected = useCallback(
    (pf: PvPlatform) => {
      setPvPlatform(pf);
      outroCacheRef.current = { key: "", url: "" };
      const vid = vidRef.current;
      const rel = sel[pf];
      if (!rel) {
        stopMusic();
        // ohne Track = O-Ton pur → Video trotzdem abspielen
        if (vid?.src) {
          allowPlayRef.current = 0;
          window.clearTimeout(playTimerRef.current);
          vid.currentTime = trim.start ?? 0;
          vid.muted = false;
          void vid.play();
        }
        return;
      }
      const track = state?.tracks.find((t) => t.rel === rel);
      if (track) togglePlay(track);
    },
    [sel, state, stopMusic, togglePlay, trim.start],
  );

  const selectTrack = useCallback((pf: PvPlatform, rel: string) => {
    setSel((s) => {
      const selecting = s[pf] !== rel;
      if (selecting) {
        // Filter der zugewiesenen Plattform ausblenden; alle aus → alle wieder an
        const flt = { youtube: fltYT, instagram: fltIG, tiktok: fltTT,
                      rednote: fltRN, [pf]: false };
        if (!flt.youtube && !flt.instagram && !flt.tiktok && !flt.rednote) {
          setFltYT(true); setFltIG(true); setFltTT(true); setFltRN(true);
        } else {
          setFltYT(flt.youtube); setFltIG(flt.instagram);
          setFltTT(flt.tiktok); setFltRN(flt.rednote);
        }
      }
      return { ...s, [pf]: selecting ? rel : null };
    });
  }, [fltYT, fltIG, fltTT, fltRN]);

  const effLen = useCallback((): number | null => {
    const vid = vidRef.current;
    const end = trim.end ?? (vid && isFinite(vid.duration) ? vid.duration : null);
    if (end == null) return null;
    return end - (trim.start ?? 0) + tailTotal;
  }, [trim, tailTotal]);

  // ---- Rezepte: gesicherte Einstellungen eines frueheren Renders ----------
  const [rezepte, setRezepte] = useState<
    { name: string; out_name: string; at: string; quellvideo: string; plattformen: string[] }[]
  >([]);
  useEffect(() => {
    void fetch("/api/rezepte")
      .then(async (r) => setRezepte((await r.json()).rezepte ?? []))
      .catch(() => {});
  }, [state]);

  const ladeRezept = useCallback(async (name: string) => {
    if (!name) return;
    let r: { studio?: Record<string, unknown>; quellvideo?: string; out_name?: string };
    try {
      r = await (await fetch(`/api/rezept?name=${encodeURIComponent(name)}`)).json();
    } catch (e) {
      setLog(`Rezept nicht lesbar: ${e}`);
      return;
    }
    const s = r.studio;
    if (!s || !Object.keys(s).length) {
      setLog("Dieses Rezept hat keine Studio-Einstellungen — es ist vor dem Archiv entstanden.");
      return;
    }
    const nimm = <T,>(k: string, fallback: T): T => (s[k] === undefined ? fallback : (s[k] as T));
    setSel({ youtube: null, instagram: null, tiktok: null, rednote: null, ...nimm("sel", {}) });
    setTrim(nimm("trim", { start: null, end: null }));
    // Alte Rezepte kennen das zh-Feld nicht — emptyTexts() fuellt die Luecken.
    const gespeichert = nimm<TextSlot[]>("texts", []);
    setTexts(emptyTexts().map((leer, i) => ({ ...leer, ...(gespeichert[i] ?? {}) })));
    setGain(nimm("gain", -12));
    setOtonGain(nimm("otonGain", 0));
    setDucks(nimm("ducks", emptyDucks()));
    setFade(nimm("fade", 2));
    setEndcard(nimm("endcard", { file: "", start: null, fadeIn: 0.3, hold: 1, fadeOut: 0.3, alpha: 1, append: false }));
    setBeats(nimm("beats", 3));
    setCardSlogan(nimm("cardSlogan", true));
    setTxAlpha(nimm("txAlpha", TXA));
    setTailSecs(nimm("tailSecs", 0));
    setOutName(nimm("outName", ""));
    setOvOn(nimm("ovOn", false));
    setOvSel(nimm("ovSel", ""));
    setOvAlpha(nimm("ovAlpha", 1));
    setOutroOn(nimm("outroOn", true));
    // Das Quellvideo liegt nach einem Render in videos-verarbeitet und steht
    // dann nicht mehr zur Auswahl — dann bleibt alles andere trotzdem gesetzt.
    const quelle = nimm<string | null>("curVideo", null);
    if (quelle && state?.videos.includes(quelle)) {
      pickVideo(quelle);
      setLog("");
    } else {
      setLog(`Einstellungen geladen. Das Quellvideo „${r.quellvideo || quelle || "?"}“ `
             + "liegt nicht mehr im aktuellen Ordner — aus videos-verarbeitet zurueckholen "
             + "oder ein anderes waehlen.");
    }
  }, [state, pickVideo]);

  const resetAll = useCallback(() => {
    if (!window.confirm("Alle Studio-Einstellungen zurücksetzen (Texte, Trim, Musikwahl, Name …)?")) return;
    localStorage.removeItem(SETTINGS_KEY);
    setSel({ youtube: null, instagram: null, tiktok: null, rednote: null });
    setFltTT(true);
    setFltRN(true);
    setPvPlatform("youtube");
    setTrim({ start: null, end: null });
    setTailSecs(0);
    setTexts(emptyTexts());
    setGain(-12);
    setOtonGain(0);
    setDucks(emptyDucks());
    setEndcard(emptyEndcard());
    setFade(2);
    setOutName("");
    setOvOn(true);
    setOvAlpha(0.5);
    setOutroOn(true);
    setFltYT(true);
    setFltIG(true);
    setSearch("");
    setAMsg("");
    setLog("");
    if (state?.videos.length) pickVideo(state.videos[0]);
  }, [state, pickVideo]);

  // Pixabay-Track-IDs, die der Render je Plattform anhängt (Lizenznachweis)
  const pxSuffix = useMemo(
    () =>
      (["youtube", "instagram", "tiktok", "rednote"] as PvPlatform[]).flatMap((pf) => {
        const rel = sel[pf];
        if (!rel || !/(^|\/)pixabay\//i.test(rel)) return [];
        const m = rel.replace(/\.[^./]+$/, "").match(/-(\d{4,})$/);
        return m ? [{ pf, id: m[1] }] : [];
      }),
    [sel],
  );

  const ready = !!(curVideo && outName.trim());

  const doRender = useCallback(async () => {
    if (!ready || !curVideo) return;
    // Ohne Track = O-Ton pur — bei YT/IG kurz rückfragen (nicht versehentlich ohne Musik)
    const noMusic = (["youtube", "instagram"] as PvPlatform[]).filter((pf) => !sel[pf]);
    if (noMusic.length && !window.confirm(
      `Ohne Musik (nur O-Ton) rendern für: ${noMusic.map((pf) => PF_SHORT[pf]).join(" + ")} — ok?`)) return;
    setRendering(true);
    setLog("");
    stopMusic();
    vidRef.current?.pause();
    setRenderingVideo(curVideo);
    setProg({ label: "", pct: 0 });
    const iv = window.setInterval(async () => {
      try {
        const p = await api.progress();
        if (p.active) setProg({ label: p.label, pct: p.pct });
      } catch {
        /* ignore */
      }
    }, 400);
    try {
      const r = await api.post<RenderResult>("/api/render", {
        video: curVideo,
        tracks: sel,
        gain_db: gain,
        oton_gain_db: otonGain,
        ducks: ducks
          .filter((d) => (d.start != null || d.end != null) && (d.music !== 0 || d.oton !== 0)
            && (d.start == null || d.end == null || d.end > d.start))
          .map((d) => ({ start: d.start, end: d.end, music_db: d.music, oton_db: d.oton })),
        fade_out: fade,
        overlay: (ovOn && ovSel) || null,
        overlay_alpha: ovAlpha,
        endcard: endcard.file && (endcard.append || endcard.start != null)
          ? { file: endcard.file, start: endcard.start ?? 0, fade_in: endcard.fadeIn,
              hold: endcard.hold, fade_out: endcard.fadeOut, alpha: endcard.alpha,
              append: endcard.append }
          : null,
        trim_start: trim.start,
        trim_end: trim.end,
        tail_secs: tailSecs,
        out_name: outName,
        // Rezept: alles, woraus sich dieser Render wiederholen laesst
        studio: studioState,
        texts: texts
          // Ein Stempel zaehlt auch ohne Unterzeile — nur Fliesstext braucht Inhalt.
          .filter((t) => t.start != null && (t.text.trim() || isStamp(t.style)))
          .map((t) => ({ start: t.start, hold: t.hold,
                         fade: isGfx(t) ? STAMP_FADE : TXF,
                         png: textPng(t),
                         // Zweites Bild nur, wo Chinesisch ueberhaupt etwas
                         // aendert: eigener Text, ein Urteil (成功/失败) oder
                         // eine Karte mit Spruch. Sonst waere es dieselbe
                         // Datei ein zweites Mal durch die Leitung.
                         png_zh: (t.zh?.trim() || isStamp(t.style)
                                  || (shapeOf(t) === "card" && cardSlogan))
                           ? textPng(t, true) : null })),
        outros: outroOn && vidRef.current
          ? {
              youtube: outroPng("youtube", vidRef.current),
              instagram: outroPng("instagram", vidRef.current),
              tiktok: outroPng("tiktok", vidRef.current),
              rednote: outroPng("rednote", vidRef.current),
            }
          : null,
      });
      const errs = Object.entries(r.results).filter(([, res]) => !res.ok);
      setLog(errs.map(([pf, res]) => `✗ ${pf}: ${res.error}`).join("\n"));
      // verwendeten Namen (inkl. Nummer) behalten → erneutes Rendern überschreibt
      const first = Object.values(r.results).find((res) => res.ok && res.out);
      if (first?.out) setOutName(first.out.split("/").pop()!.replace(/\.mp4$/, ""));
    } catch (e) {
      setLog(`Fehler: ${e}`);
    }
    window.clearInterval(iv);
    setProg(null);
    setRenderingVideo(null);
    setRendering(false);
    void load();
  }, [ready, curVideo, sel, gain, otonGain, ducks, fade, ovOn, ovSel, trim, outName, texts, outroOn, endcard, tailSecs, stopMusic, load, studioState, cardSlogan]);

  if (!state) return <div style={{ padding: 20, opacity: 0.6 }}>lade …</div>;

  const starred = new Set(state.stars);
  const vids = sortedVids();
  const len = effLen();
  const q = search.trim().toLowerCase();
  const want: string[] = [];
  if (fltYT) want.push("youtube");
  if (fltIG) want.push("instagram");
  if (fltTT) want.push("tiktok");
  if (fltRN) want.push("rednote");
  const isSel = (t: Track) =>
    sel.youtube === t.rel || sel.instagram === t.rel
    || sel.tiktok === t.rel || sel.rednote === t.rel;
  const tooShort = (t: Track) => !!(t.dur && len && t.dur < len - 0.5);
  const selTracks = state.tracks.filter(isSel);
  const listTracks = state.tracks.filter(
    (t) =>
      !isSel(t) &&
      (!q || t.rel.toLowerCase().includes(q)) &&
      t.platforms.some((p) => want.includes(p)) &&
      !tooShort(t),
  );
  const isStarred = !!(curVideo && starred.has(curVideo));
  const pvTrackName =
    sel[pvPlatform]?.split("/").pop()?.replace(/\.[^.]+$/, "")
    ?? "O-Ton, ohne Musik";

  const trackRow = (t: Track) => (
    <div key={t.rel} className={`item trk ${curPlay === t.rel ? "playing" : ""}`}>
      <button className="mini playbtn" onClick={() => togglePlay(t)}>
        <Icon name={curPlay === t.rel ? "pause" : "play"} filled size={11} />
      </button>
      <div className="name">
        {t.rel.split("/").pop()!.replace(/\.[^.]+$/, "")}{" "}
        <span className="folder">
          {t.folder}
          {t.dur ? ` · ${Math.round(t.dur)}s` : ""}
        </span>
        {tooShort(t) && <span title="kürzer als das Video — wird beim Rendern geloopt"> ⚠️</span>}
      </div>
      {t.platforms.map((pf) => (
        <button
          key={pf}
          className={`mini ${sel[pf as PvPlatform] === t.rel ? "sel" : ""}`}
          title={pf === "youtube" && t.folder !== "youtube"
            ? "Achtung: freie Musik kann auf YouTube Content-ID-Ansprüche auslösen"
            : ""}
          onClick={() => selectTrack(pf as PvPlatform, t.rel)}
        >
          {pfLabel(pf)}
        </button>
      ))}
    </div>
  );

  return (
    <div className="studio">
      {/* ---------- linke Spalte: Videos ---------- */}
      <div className="col left">
        <h2 className="dirtitle">{state.video_dir.split("/").pop() || "/"}</h2>
        <div className="dirrow">
          <input
            className="dirinput"
            spellCheck={false}
            value={dirInput}
            onChange={(e) => setDirInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void setDir(dirInput)}
            title="Ordner mit den Videos"
          />
          <button className="btn" title="Ordner durchsuchen" onClick={() => setBrowserOpen((b) => !b)}>
            <Icon name="folder" size={14} />
          </button>
          <button className="btn" onClick={() => void setDir(dirInput)}>Laden</button>
        </div>
        <div className="quickrow">
          {state.quick_dirs.map((qd) => (
            <button
              key={qd.dir}
              className={`chip ${qd.dir === state.video_dir ? "on" : ""}`}
              title={qd.dir}
              onClick={() => void setDir(qd.dir)}
            >
              {qd.label}
            </button>
          ))}
        </div>
        {browserOpen && (
          <div className="browser">
            {state.parent !== state.video_dir && (
              <div className="item" onClick={() => void setDir(state.parent)}>
                <Icon name="up" size={13} /> ..
              </div>
            )}
            {state.subdirs.map((s) => (
              <div key={s.name} className="item" onClick={() => void setDir(state.video_dir + "/" + s.name)}>
                <Icon name="folder" size={13} /> {s.name}
                {s.mp4s ? ` (${s.mp4s})` : ""}
              </div>
            ))}
            {!state.subdirs.length && <div className="item" style={{ opacity: 0.5, cursor: "default" }}>keine Unterordner</div>}
          </div>
        )}
        <div className="vsearch">
          <input
            type="search"
            placeholder="Videos filtern …"
            spellCheck={false}
            value={vfilter}
            title="Mehrere Begriffe erlaubt, Reihenfolge egal — z. B. „charly fail“"
            onChange={(e) => setVfilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setVfilter("");
            }}
          />
          {vfilter.trim() && (
            <button className="mini" title="Filter aufheben" onClick={() => setVfilter("")}>
              {vids.length}/{state.videos.length} ✕
            </button>
          )}
        </div>
        <div className="scroll">
          {vids.map((v) => (
            <div
              key={v}
              className={`item vid ${v === curVideo ? "active" : ""} ${v === renderingVideo ? "rendering" : ""}`}
              onClick={() => pickVideo(v)}
            >
              <div className="hdr">
                <span className="vn">
                  {starred.has(v) && (
                    <span className="starmark">
                      <Icon name="star" filled size={11} />
                    </span>
                  )}
                  {v.replace(/\.mp4$/, "")}
                  {(state.rendered[v] ?? []).map((pf) => (
                    <span key={pf} className="badge done" title={pf}>
                      {pfLabel(pf)}
                    </span>
                  ))}
                </span>
                <span className="vdur">{fmtDur(state.vdurs[v])}</span>
              </div>
              <div className="thumbs">
                {[1, 5].map((t) => (
                  <img
                    key={t}
                    loading="lazy"
                    alt=""
                    src={`/thumb/${encodeURIComponent(v)}?t=${t}`}
                    onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
                  />
                ))}
              </div>
            </div>
          ))}
          {!vids.length && (
            <div className="item" style={{ opacity: 0.5, cursor: "default" }}>
              {state.videos.length ? "kein Video passt zum Filter" : "keine Videos im Ordner"}
            </div>
          )}
        </div>
      </div>

      {/* ---------- Mitte: Player + Aktionen ---------- */}
      <div className="col center">
        <div className="stage">
          <div className="vwrap">
            <video ref={vidRef} controls playsInline loop={tailTotal <= 0} />
            {ovOn && ovSel && (
              <img className="ovimg" alt="" style={{ opacity: ovAlpha }} src={`/media/overlay/${encodeURIComponent(ovSel)}`} />
            )}
            {endcard.file && (
              <img ref={ecImgRef} className="ovimg" alt="" style={{ opacity: 0 }}
                   src={`/media/endcard/${encodeURIComponent(endcard.file)}`
                        + (zhVorschau ? "?zh=1" : "")} />
            )}
            <img ref={outroImgRef} className="outroimg" alt="" style={{ opacity: 0 }} />
            {texts.map((_, i) =>
              txPreview[i] ? (
                <img key={i} ref={(el) => { txovRefs.current[i] = el; }} className="ovimg"
                     alt="" style={{ opacity: 0 }} src={txPreview[i] as string} />
              ) : null,
            )}
          </div>
          <div className="actions">
            <div className="abtns">
              <button className={`abtn ${isStarred ? "starred" : ""}`} onClick={() => curVideo && void toggleStar(curVideo, !isStarred)}>
                <Icon name="star" filled={isStarred} size={14} /> {isStarred ? "gemerkt" : "merken"}
              </button>
              <button className="abtn" onClick={() => curVideo && void discard(curVideo, "privat")}>
                <Icon name="lock" size={14} /> privat
              </button>
              <button className="abtn" onClick={() => curVideo && void discard(curVideo, "never-give-up")}>
                <Icon name="dumbbell" size={14} /> never-give-up
              </button>
              <button className="abtn" onClick={() => curVideo && void discard(curVideo, "aussortiert")}>
                <Icon name="trash" size={14} /> aussortieren
              </button>
              <button className="abtn" onClick={() => void undo()}>
                <Icon name="undo" size={14} /> rückgängig
              </button>
            </div>
            {/* Die uebrigen Unterordner von videos-verarbeitet: was im Finder
                angelegt ist, ist hier ein Ziel — keine Liste im Code. */}
            {(state.categories ?? []).filter((c) => !FIXED_CATS.includes(c)).length > 0 && (
              <div className="sortrow">
                <span className="sortlbl">einsortieren</span>
                {(state.categories ?? []).filter((c) => !FIXED_CATS.includes(c)).map((c) => (
                  <button key={c} className="chip" title={`nach videos-verarbeitet/${c} verschieben`}
                          onClick={() => curVideo && void discard(curVideo, c)}>
                    {c}
                  </button>
                ))}
              </div>
            )}
            <div className="midtabs">
              <button className={midTab === "texte" ? "on" : ""} onClick={() => setMidTab("texte")}>
                Texte
              </button>
              <button className={midTab === "reveal" ? "on" : ""} onClick={() => setMidTab("reveal")}>
                Reveal
              </button>
              <label className="txalpha" title="Deckkraft aller gezeichneten Overlays (Texte, Stempel, Banner, Outro) in Prozent">
                <input type="number" min={5} max={100} step={5}
                       value={Math.round(txAlpha * 100)}
                       onChange={(e) => setTxAlpha(Math.min(1, Math.max(0.05, (+e.target.value || 100) / 100)))} />
                %
              </label>
            </div>
            <div className="reveal" hidden={midTab !== "reveal"}>
              <div className="rvhead">
                <label title="Wie viele Crashs zwischen Hook und Schluss">
                  Urteile
                  <input type="number" min={1} max={4} step={1} value={beats}
                         onChange={(e) => setBeats(Math.min(4, Math.max(1, +e.target.value || 3)))} />
                </label>
                <label title="„have fun, keep pumping!“ unten auf die ganzseitige Karte setzen">
                  <input type="checkbox" checked={cardSlogan}
                         onChange={(e) => setCardSlogan(e.target.checked)} />
                  Spruch
                </label>
                <button className="abtn" onClick={seedReveal} title="Texte, Stil und Standzeiten der Reihe in die Slots schreiben — Startzeiten bleiben">
                  Vorlage einsetzen
                </button>
              </div>
              {revealRows.map((r) => {
                const tx = texts[r.slot];
                if (!tx) return null;
                return (
                  <div key={r.slot} className="rvrow">
                    <span className="rvlbl" title={r.hint}>{r.label}</span>
                    <button className="mini" title="Startzeit = aktuelle Videoposition übernehmen"
                      onClick={() =>
                        setTexts((ts) => ts.map((s, j) =>
                          j === r.slot ? { ...s, start: Math.round((vidRef.current?.currentTime ?? 0) * 10) / 10 } : s))
                      }>@</button>
                    <input type="number" className="tstart" min={0} step={0.1} placeholder="–"
                      title="Startzeit in Sekunden — Doppelklick springt im Video dorthin"
                      value={tx.start ?? ""}
                      onChange={(e) =>
                        setTexts((ts) => ts.map((s, j) =>
                          j === r.slot
                            ? { ...s, start: e.target.value === "" ? null : Math.max(0, +e.target.value) }
                            : s))
                      }
                      onDoubleClick={() => {
                        const vid = vidRef.current;
                        if (vid && tx.start != null) vid.currentTime = tx.start;
                      }} />
                    <textarea className="rvtxt" rows={1} spellCheck={false}
                      placeholder={isStamp(tx.style) ? "Unterzeile …" : shapeOf(tx) === "bar" ? "Frage der Reihe …" : "Text …"}
                      value={tx.text}
                      onChange={(e) => setTexts((ts) => ts.map((s, j) => (j === r.slot ? { ...s, text: e.target.value } : s)))} />
                    <textarea className="rvtxt zh" rows={1} spellCheck={false} lang="zh-CN"
                      title="Chinesische Fassung — nur fuer RedNote. Leer: derselbe Text wie links."
                      placeholder="中文 (RedNote) …"
                      value={tx.zh ?? ""}
                      onChange={(e) => setTexts((ts) => ts.map((s, j) => (j === r.slot ? { ...s, zh: e.target.value } : s)))} />
                    <div className="txstyle">
                      {(["bar", "card"] as TxShape[]).map((sh) => (
                        <button key={sh}
                          className={`${sh === "bar" ? "bnr" : "card"} ${shapeOf(tx) === sh ? "on" : ""}`}
                          title={sh === "bar" ? "Als Balken über die ganze Breite"
                                              : "Als ganzseitige Karte"}
                          onClick={() => setTexts((ts) => ts.map((s, j) =>
                            j === r.slot ? { ...s, shape: shapeOf(s) === sh ? "plain" : sh } : s))}>
                          {sh === "bar" ? "▭" : "▣"}
                        </button>
                      ))}
                    </div>
                    <input type="number" className="thold" min={0} max={60} step={0.1}
                      title="Anzeigedauer in Sekunden" value={tx.hold}
                      onChange={(e) => setTexts((ts) => ts.map((s, j) => (j === r.slot ? { ...s, hold: Math.max(0, +e.target.value || 0) } : s)))} />
                  </div>
                );
              })}
              <div className="rvhint">
                Schreibt in dieselben Textslots wie nebenan — dort kannst du jede Zeile
                einzeln nachjustieren.
              </div>
            </div>
            <div className="texts" hidden={midTab !== "texte"}>
              {texts.map((tx, i) => (
                <div key={i} className="txrow">
                  <button
                    className="mini"
                    title="Startzeit = aktuelle Videoposition übernehmen"
                    onClick={() =>
                      setTexts((ts) =>
                        ts.map((t, j) =>
                          j === i ? { ...t, start: Math.round((vidRef.current?.currentTime ?? 0) * 10) / 10 } : t,
                        ),
                      )
                    }
                  >
                    @
                  </button>
                  <input
                    type="number"
                    className="tstart"
                    min={0}
                    step={0.1}
                    placeholder="–"
                    title="Startzeit in Sekunden — frei eintippbar; Doppelklick springt im Video dorthin"
                    value={tx.start ?? ""}
                    onChange={(e) =>
                      setTexts((ts) =>
                        ts.map((t, j) =>
                          j === i
                            ? { ...t, start: e.target.value === "" ? null : Math.max(0, +e.target.value) }
                            : t,
                        ),
                      )
                    }
                    onDoubleClick={() => {
                      const vid = vidRef.current;
                      if (vid && tx.start != null) vid.currentTime = tx.start;
                    }}
                  />
                  <div className="txstyle">
                    {(["text", "success", "fail"] as TxStyle[]).map((s) => (
                      <button
                        key={s}
                        className={(tx.style ?? "text") === s ? "on" : ""}
                        title={s === "text" ? "Text"
                          : s === "success" ? "Urteil SUCCESS (Text wird zur Unterzeile)"
                          : "Urteil FAIL (Text wird zur Unterzeile)"}
                        onClick={() => setTexts((ts) => ts.map((t, j) => (j === i ? { ...t, style: s } : t)))}
                      >
                        {s === "text" ? "T" : s === "success" ? "✓" : "✕"}
                      </button>
                    ))}
                    <span className="txsep" />
                    {(["bar", "card"] as TxShape[]).map((sh) => (
                      <button
                        key={sh}
                        className={`${sh === "bar" ? "bnr" : "card"} ${shapeOf(tx) === sh ? "on" : ""}`}
                        title={sh === "bar"
                          ? "Als Balken über die ganze Breite"
                          : "Als ganzseitige Karte — Navy deckt das Video ab"}
                        onClick={() => setTexts((ts) => ts.map((t, j) =>
                          j === i ? { ...t, shape: shapeOf(t) === sh ? "plain" : sh } : t))}
                      >
                        {sh === "bar" ? "▭" : "▣"}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="txt"
                    rows={2}
                    placeholder={isStamp(tx.style) ? "Unterzeile …" : shapeOf(tx) === "bar" ? "Frage der Reihe …" : "Text …"}
                    spellCheck={false}
                    value={tx.text}
                    onChange={(e) => setTexts((ts) => ts.map((t, j) => (j === i ? { ...t, text: e.target.value } : t)))}
                  />
                  {/* Nur RedNote bekommt diesen Text. Bleibt er leer, laeuft
                      dort derselbe wie links — 成功/失败 und der Spruch auf der
                      Karte sind ohnehin immer chinesisch. */}
                  <textarea
                    className="txt zh"
                    rows={2}
                    lang="zh-CN"
                    title="Chinesische Fassung — nur fuer RedNote. Leer: derselbe Text wie oben."
                    placeholder="中文 (RedNote) …"
                    spellCheck={false}
                    value={tx.zh ?? ""}
                    onChange={(e) => setTexts((ts) => ts.map((t, j) => (j === i ? { ...t, zh: e.target.value } : t)))}
                  />
                  <input
                    type="number"
                    className="thold"
                    min={0}
                    max={60}
                    step={1}
                    value={tx.hold}
                    title="Anzeigedauer in Sekunden (ohne Ein-/Ausblenden)"
                    onChange={(e) =>
                      setTexts((ts) => ts.map((t, j) => (j === i ? { ...t, hold: Math.max(0, +e.target.value || 0) } : t)))
                    }
                  />
                  <input
                    type="number"
                    className="tsize"
                    min={16}
                    max={200}
                    step={4}
                    value={tx.size ?? TXS}
                    disabled={isGfx(tx)}
                    title={isGfx(tx)
                      ? "Bei Urteil, Balken und Karte steht die Größe fest"
                      : "Schriftgröße in Pixeln (bezogen auf 1080×1920)"}
                    onChange={(e) =>
                      setTexts((ts) =>
                        ts.map((t, j) => (j === i ? { ...t, size: Math.max(8, +e.target.value || TXS) } : t)),
                      )
                    }
                  />
                  <button
                    className="mini"
                    title="löschen"
                    onClick={() => setTexts((ts) => ts.map((t, j) => (j === i ? { start: null, text: "", hold: TXH, size: TXS, style: "text", shape: "plain" } : t)))}
                  >
                    <Icon name="x" size={11} />
                  </button>
                </div>
              ))}
            </div>
            <div className="ducks"
              title="Pegel-Abschnitte: Musik/O-Ton in Zeitfenstern um ±dB anheben oder absenken (weich über 0,5 s). Musik −60 dB = kurz ausgeblendet.">
              <div className="duckhead">Pegel-Abschnitte 🎵/🎙 ±dB</div>
              {ducks.map((d, i) => (
                <div className="duckrow" key={i}>
                  <button className="mini" title="Start = aktuelle Videoposition" onClick={() =>
                    setDucks((ds) => ds.map((x, j) => {
                      if (j !== i) return x;
                      const s = vidRef.current?.currentTime ?? 0;
                      return { ...x, start: s, end: x.end != null && x.end <= s ? null : x.end };
                    }))}>
                    [ {d.start != null ? d.start.toFixed(1) + "s" : d.end != null ? "0s" : "–"}
                  </button>
                  <button className="mini" title="Ende = aktuelle Videoposition" onClick={() =>
                    setDucks((ds) => ds.map((x, j) => {
                      if (j !== i) return x;
                      const e = vidRef.current?.currentTime ?? 0;
                      return { ...x, end: e, start: x.start != null && x.start >= e ? null : x.start };
                    }))}>
                    {d.end != null ? d.end.toFixed(1) + "s" : d.start != null ? "Ende" : "–"} ]
                  </button>
                  <label title="Musik-Änderung in diesem Abschnitt (−60 = stumm)">
                    🎵 <input type="number" min={-60} max={12} step={3} value={d.music}
                      onChange={(e) => setDucks((ds) => ds.map((x, j) => (j === i ? { ...x, music: +e.target.value } : x)))} />
                  </label>
                  <label title="O-Ton-Änderung in diesem Abschnitt">
                    🎙 <input type="number" min={-60} max={12} step={3} value={d.oton}
                      onChange={(e) => setDucks((ds) => ds.map((x, j) => (j === i ? { ...x, oton: +e.target.value } : x)))} />
                  </label>
                  <button className="mini" title="Abschnitt löschen" onClick={() =>
                    setDucks((ds) => ds.map((x, j) => (j === i ? { start: null, end: null, music: -12, oton: 0 } : x)))}>
                    <Icon name="x" size={11} />
                  </button>
                </div>
              ))}
            </div>
            <div className="amsg">{aMsg}</div>
          </div>
        </div>
        <div className="pvbar">
          <span className="nm">{curVideo ?? ""}</span>
          {srcDur > 0 && (
            <span className="vsecs" title="Laenge der Quelldatei in Sekunden — dieselbe Achse wie Trim, Texte, Endcard">
              {srcDur.toFixed(1)} s
            </span>
          )}
          {(["youtube", "instagram", "tiktok", "rednote"] as PvPlatform[]).map((pf) => (
            <button key={pf} className={`mini ${pvPlatform === pf ? "sel" : ""}`} onClick={() => playSelected(pf)}>
              {pfLabel(pf)}
            </button>
          ))}
          <span className="trkname">{pvTrackName}</span>
          <select className="mini rezept" style={{ marginLeft: "auto" }} value=""
                  title="Einstellungen eines frueheren Renders laden — Texte, Stempel, Overlay, Endcard, Musik, Trim"
                  onChange={(e) => { void ladeRezept(e.target.value); e.target.value = ""; }}>
            <option value="">Rezept laden …</option>
            {rezepte.map((r) => (
              <option key={r.name} value={r.name}>
                {r.at.slice(0, 10)} · {r.out_name.replace(/\.mp4$/, "").slice(0, 52)}
              </option>
            ))}
          </select>
          <button className="mini" title="Alle Studio-Einstellungen zurücksetzen" onClick={resetAll}>
            Reset
          </button>
        </div>
      </div>

      {/* ---------- rechte Spalte: Musik + Render ---------- */}
      <div className="col right">
        <div className="sidetabs">
          <button className={sideTab === "set" ? "on" : ""} onClick={() => setSideTab("set")}>
            Einstellungen
          </button>
          <button className={sideTab === "musik" ? "on" : ""} onClick={() => setSideTab("musik")}>
            Musik{selTracks.length ? ` (${selTracks.length})` : ""}
          </button>
        </div>
        <div className="panel" hidden={sideTab !== "set"}>
          <div className="row">
            Musik-Pegel
            <input type="range" min={-30} max={0} step={1} value={gain} onChange={(e) => setGain(+e.target.value)} />
            <span>{gain} dB</span>
          </div>
          <div className="row" title="Lautstärke des Original-Tons (Vorschau kann Verstärkung nur bis 0 dB wiedergeben — der Render macht's richtig)">
            O-Ton-Pegel
            <input type="range" min={-30} max={12} step={1} value={otonGain} onChange={(e) => setOtonGain(+e.target.value)} />
            <span>{otonGain > 0 ? "+" : ""}{otonGain} dB</span>
          </div>
          <div className="row">
            Fade-out
            <input type="number" min={0} max={15} step={0.5} value={fade} onChange={(e) => setFade(+e.target.value)} /> s
          </div>
          <div className="row">
            <label>
              <input type="checkbox" checked={ovOn} onChange={(e) => setOvOn(e.target.checked)} /> Overlay
            </label>
            <select value={ovSel} onChange={(e) => { setOvSel(e.target.value); if (e.target.value) setOvOn(true); }}>
              {state.overlays.map((o) => (
                <option key={o} value={o}>{o.replace(/\.png$/, "")}</option>
              ))}
            </select>
          </div>
          <div className="row" style={{ paddingLeft: 24 }}>
            Deckkraft
            <input type="range" min={0.05} max={1} step={0.05} value={ovAlpha} onChange={(e) => setOvAlpha(+e.target.value)} />
            <span>{Math.round(ovAlpha * 100)} %</span>
          </div>
          <div className="row">
            <label>
              <input type="checkbox" checked={outroOn} onChange={(e) => setOutroOn(e.target.checked)} /> Outro-Icons (letzte 2,5–4 s)
            </label>
          </div>
          {/* Endcard: statt ins Video gerendert erst hier entschieden */}
          <div className="ecard">
            {/* Zwei Zeilen statt einer: Beschriftung und „keine" oben, die
                Varianten darunter. In einer Zeile war das die breiteste Stelle
                der ganzen Spalte und hat sie auf 380 px festgenagelt — Platz,
                der in der Mitte bei der Vorschau fehlte (Jan, 13.09.). */}
            <div className="row ecpick">
              Endcard
              <button className={`chip ${endcard.file ? "" : "on"}`}
                      onClick={() => setEndcard({ ...endcard, file: "" })}>keine</button>
            </div>
            <div className="row ecpick ecvar">
              {(state?.endcards ?? []).map((f) => (
                <button key={f} className={`chip ${endcard.file === f ? "on" : ""}`}
                        title={f}
                        onClick={() => setEndcard({ ...endcard, file: f })}>
                  {f.replace(/^shorts-endcard-/, "").replace(/-\d+x\d+\.png$/, "")}
                </button>
              ))}
            </div>
            {!endcard.file && (
              <div className="echint">
                Bild wählen, dann erscheinen Startzeit und Blenddauern.
              </div>
            )}
            {endcard.file && (
              <>
                <div className="row">
                  <label className="ecapp" title="Endcard hinten anhängen, statt sie ins Video zu legen — das Video wird um ihre Dauer länger">
                    <input type="checkbox" checked={endcard.append}
                           onChange={(e) => setEndcard({ ...endcard, append: e.target.checked,
                             hold: e.target.checked && endcard.hold <= 1 ? 2.5 : endcard.hold })} />
                    ans Ende
                  </label>
                  {endcard.append ? (
                    <span style={{ opacity: 0.7 }}>
                      blendet über die Karte davor ein ({endcard.fadeIn.toFixed(1)} s)
                      und steht {endcard.hold.toFixed(1)} s bis zum Schluss
                    </span>
                  ) : (
                    <>
                      ab
                      <button className="mini" title="aktuelle Abspielposition übernehmen"
                              onClick={() => vidRef.current
                                && setEndcard({ ...endcard, start: +vidRef.current.currentTime.toFixed(1) })}>
                        @
                      </button>
                      <input type="number" min={0} step={0.1} value={endcard.start ?? ""}
                             placeholder="—"
                             onChange={(e) => setEndcard({ ...endcard,
                               start: e.target.value === "" ? null : +e.target.value })} /> s
                    </>
                  )}
                </div>
                <div className="row ectimes">
                  <label title="Einblenddauer">▲<input type="number" min={0.1} max={5} step={0.1}
                    value={endcard.fadeIn}
                    onChange={(e) => setEndcard({ ...endcard, fadeIn: +e.target.value })} /></label>
                  <label title="Standzeit bei voller Deckkraft">■<input type="number" min={0} max={30} step={0.5}
                    value={endcard.hold}
                    onChange={(e) => setEndcard({ ...endcard, hold: +e.target.value })} /></label>
                  <label title={endcard.append
                    ? "Beim Anhängen ohne Wirkung: die Endcard bleibt bis zum letzten Bild stehen"
                    : "Ausblenddauer"}>▼<input type="number" min={0.1} max={5} step={0.1}
                    value={endcard.fadeOut} disabled={endcard.append}
                    onChange={(e) => setEndcard({ ...endcard, fadeOut: +e.target.value })} /></label>
                  <label title="Deckkraft der Endcard" className="ecalpha">
                    ◐<input type="range" min={0.05} max={1} step={0.05} value={endcard.alpha}
                      onChange={(e) => setEndcard({ ...endcard, alpha: +e.target.value })} />
                    <b>{Math.round(endcard.alpha * 100)} %</b>
                  </label>
                  <span className="ecsum">
                    {endcard.append ? `+${ecLen(endcard).toFixed(1)} s am Schluss`
                      : endcard.start == null ? "Startzeit fehlt"
                      : `${endcard.start.toFixed(1)}–${(endcard.start + ecLen(endcard)).toFixed(1)} s`}
                  </span>
                </div>
              </>
            )}
          </div>
          <div className="row">
            Trim
            <button
              className="mini"
              onClick={() =>
                setTrim((tr) => {
                  const s = vidRef.current?.currentTime ?? 0;
                  return { start: s, end: tr.end != null && tr.end <= s ? null : tr.end };
                })
              }
            >
              [ Start
            </button>
            <button
              className="mini"
              onClick={() =>
                setTrim((tr) => {
                  const e = vidRef.current?.currentTime ?? 0;
                  return { start: tr.start != null && tr.start >= e ? null : tr.start, end: e };
                })
              }
            >
              Ende ]
            </button>
            <button className="mini" onClick={() => setTrim({ start: null, end: null })}>
              <Icon name="x" size={11} />
            </button>
            <span style={{ opacity: 0.7 }}>
              {trim.start == null && trim.end == null
                ? "–"
                : `${trim.start != null ? trim.start.toFixed(1) + "s" : "0s"} → ${trim.end != null ? trim.end.toFixed(1) + "s" : "Ende"}`}
            </span>
            <label className="tail" title="Mindestens so viele Sekunden anhängen. Was ein Overlay hinten überhängt, wird ohnehin automatisch angehängt — das letzte Bild friert dabei ein.">
              anhängen mind.
              <input type="number" min={0} max={30} step={0.5} value={tailSecs}
                     onChange={(e) => setTailSecs(Math.min(30, Math.max(0, +e.target.value || 0)))} />
              s
            </label>
            {tailTotal > 0 && (
              <span style={{ opacity: 0.6 }} title="Ergebnislänge inklusive allem, was hinten angehängt wird">
                → {(len ?? 0).toFixed(1)} s gesamt (+{tailTotal.toFixed(1)} s
                {overhang > tailSecs ? ", davon automatisch" : ""}
                {endcard.file && endcard.append ? `, Endcard ${ecLen(endcard).toFixed(1)} s` : ""})
              </span>
            )}
          </div>
          <div className="namebox">
            <div className="nfix">
              Name <span>{String(state.next_number).padStart(3, "0")}-{state.name_prefix}</span>
            </div>
            <input
              type="text"
              placeholder="z.B. sunset-carving"
              spellCheck={false}
              value={outName}
              onChange={(e) => setOutName(e.target.value)}
            />
            {pxSuffix.length > 0 && (
              <div className="nfix" title="Pixabay-Track-ID — hängt der Render je Plattform automatisch an (Lizenznachweis bei Content-ID-Claims)">
                {pxSuffix.map(({ pf, id }) => (
                  <span key={pf}>{PF_SHORT[pf]}: -pixabay-{id}</span>
                ))}
              </div>
            )}
          </div>
          <button
            className="renderbtn"
            disabled={!ready || rendering}
            title={ready ? "" : "Erst einen Namen eintragen"}
            onClick={() => void doRender()}
          >
            {rendering ? "Rendere …" : "Rendern → shorts-mit-musik/"}
          </button>
          <button
            className="btn"
            style={{ width: "100%", marginTop: 6 }}
            title="Gerenderte Dateien des letzten Renders löschen und das Quellvideo zurückholen (Original bleibt erhalten)"
            onClick={async () => {
              if (!window.confirm("Letzten Render zurückholen?\nDie 3 gerenderten Dateien werden gelöscht, das Quellvideo kommt zurück in die Auswahl.")) return;
              const d = await api.post<AppState & { restored?: string; error?: string }>("/api/redo_last", {});
              if (d.error) {
                setLog(d.error);
                return;
              }
              setState(d);
              if (d.restored) pickVideo(d.restored);
            }}
          >
            ↩ Letzten Render zurückholen
          </button>
          {prog && (
            <div className="prog" style={{ display: "block" }}>
              <div className="track">
                <div className="fill" style={{ width: `${prog.pct.toFixed(0)}%` }} />
              </div>
              <div className="txt">
                {{ youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok" }[prog.label] ?? prog.label} {prog.pct.toFixed(0)} %
              </div>
            </div>
          )}
          {log && <div className="log">{log}</div>}
        </div>
        <div className="searchrow" hidden={sideTab !== "musik"}>
          <input
            type="search"
            placeholder="Musik durchsuchen …"
            spellCheck={false}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <label>
            <input type="checkbox" checked={fltYT} onChange={(e) => setFltYT(e.target.checked)} /> YT
          </label>
          <label>
            <input type="checkbox" checked={fltIG} onChange={(e) => setFltIG(e.target.checked)} /> IG
          </label>
          <label>
            <input type="checkbox" checked={fltTT} onChange={(e) => setFltTT(e.target.checked)} /> TT
          </label>
          <label>
            <input type="checkbox" checked={fltRN} onChange={(e) => setFltRN(e.target.checked)} /> RN
          </label>
        </div>
        <div className="scroll" hidden={sideTab !== "musik"}>
          {selTracks.length > 0 && <div className="seltracks">{selTracks.map(trackRow)}</div>}
          {listTracks.map(trackRow)}
        </div>
        <audio ref={musicRef} loop />
      </div>
    </div>
  );
}
