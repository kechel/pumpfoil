// Referee Board (Jan, 16.11.2026): Laeufe aus der Wertung eines Events nehmen — uebersichtlich und in kontrollierten Schritten.
// Entwurf (nur Referees, keine Wirkung) -> zur Pruefung (interne Diskussion) -> veroeffentlicht (mit Bestaetigungsdialog, der
// zeigt, was oeffentlich wird) | abgelehnt; veroeffentlicht -> aufgehoben. Ein Referee reicht. Regeln: server/app/referee.py.
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type RefereeBoard as Board, type RefereeKandidat, type RefereeKorrektur, type RefereeStatus } from "../lib/api";
import { useI18n } from "../i18n";
import { Card } from "../components/ui";
import { ZurueckPfeil } from "../components/ZurueckPfeil";
import { kennzahl } from "../lib/teamKennzahlen";
import { sportLabel } from "../lib/sportClass";

const STATUS_FARBE: Record<RefereeStatus, string> = {
  entwurf: "bg-slate-800 text-slate-200",
  offen: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  veroeffentlicht: "bg-brand-500 text-slate-950",
  abgelehnt: "bg-slate-800 text-slate-400",
  aufgehoben: "bg-slate-800 text-slate-400",
};
const SPALTEN: { key: string; status: RefereeStatus[] }[] = [
  { key: "offen", status: ["offen"] },
  { key: "entwurf", status: ["entwurf"] },
  { key: "veroeffentlicht", status: ["veroeffentlicht"] },
  { key: "erledigt", status: ["abgelehnt", "aufgehoben"] },
];
const KNOPF = "rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-40";
const KNOPF_BLAU = `${KNOPF} bg-brand-500 text-slate-950 hover:bg-brand-400`;
const KNOPF_GRAU = `${KNOPF} bg-slate-800 text-slate-200 hover:bg-slate-700`;

// Server-Fehler „409: {"detail":"uebergang"}" -> eigener Text je Code.
function fehlerText(e: any, t: (k: string) => string): string {
  const roh = String(e?.message ?? e);
  const code = /"detail":"([a-z_]+)"/.exec(roh)?.[1];
  return code ? t(`ref.fehler.${code}`) : roh;
}

function zeit(iso: string | null | undefined, lang: string) {
  return iso ? new Date(iso).toLocaleString(lang, { dateStyle: "short", timeStyle: "short" }) : "";
}

export default function RefereeBoard() {
  const { slug = "", id = "" } = useParams();
  const { t, lang } = useI18n();
  const [b, setB] = useState<Board | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [neu, setNeu] = useState<RefereeKandidat | null>(null);
  const [spalte, setSpalte] = useState("offen");
  const laden = () => api.refereeBoard(slug, id).then(setB).catch((e) => setFehler(fehlerText(e, t)));
  useEffect(() => { laden(); }, [slug, id]);  // eslint-disable-line react-hooks/exhaustive-deps

  const ersetzen = (k: RefereeKorrektur) => setB((x) => x && { ...x, korrekturen: x.korrekturen.map((y) => (y.id === k.id ? k : y)) });
  const aktion = async (p: Promise<RefereeKorrektur>) => {
    try { ersetzen(await p); setFehler(null); } catch (e: any) { setFehler(fehlerText(e, t)); }
  };

  const kategorien = useMemo(() => {
    const m = new Map<string, RefereeKandidat[]>();
    for (const k of b?.kandidaten ?? []) {
      const key = `${k.kennzahl}|${k.sportart}`;
      m.set(key, [...(m.get(key) ?? []), k]);
    }
    return [...m.entries()];
  }, [b]);
  const offenFuer = (k: RefereeKandidat) => (b?.korrekturen ?? []).find((x) => x.session_id === k.session_id
    && k.lauf_start_ms != null && Math.abs(x.lauf_start_ms - k.lauf_start_ms) <= 3000 && ["entwurf", "offen", "veroeffentlicht"].includes(x.status));

  if (fehler && !b) return <div className="p-6 text-sm text-red-600 dark:text-red-300">{fehler}</div>;
  if (!b) return <div className="p-6 text-sm text-slate-400">…</div>;
  const zaehl = (st: RefereeStatus[]) => b.korrekturen.filter((k) => st.includes(k.status)).length;
  const sichtbar = b.korrekturen.filter((k) => (SPALTEN.find((s) => s.key === spalte)?.status ?? []).includes(k.status));

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4">
      <div className="flex items-center gap-3">
        <ZurueckPfeil fallback={`/teams/${slug}/events/${id}`} />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-100">{t("ref.titel")}</h1>
          <Link to={`/teams/${slug}/events/${id}`} className="text-sm text-brand-700 hover:underline dark:text-brand-300">{b.titel}</Link>
        </div>
      </div>

      <Card className="space-y-2 p-4 text-sm text-slate-300">
        <p>{t("ref.einleitung")}</p>
        <ol className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          {(["entwurf", "offen", "veroeffentlicht"] as RefereeStatus[]).map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              {i > 0 && <span className="text-slate-500">→</span>}
              <span className={`rounded-md px-2 py-0.5 ${STATUS_FARBE[s]}`}>{t(`ref.status.${s}`)}</span>
            </li>
          ))}
        </ol>
        <p className="text-slate-400">{t("ref.referees", { namen: b.referees.join(", ") })}</p>
        <p className={b.wirkung_erlaubt ? "text-slate-400" : "font-semibold text-amber-700 dark:text-amber-300"}>
          {!b.wirkung_erlaubt ? t("ref.fristAbgelaufen") : b.frist_bis ? t("ref.frist", { zeit: zeit(b.frist_bis, lang) }) : t("ref.fristOffen")}
        </p>
      </Card>

      {fehler && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{fehler}</p>}

      {/* 1. Korrekturen nach Status */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-100">{t("ref.korrekturen")}</h2>
        <div className="flex flex-wrap gap-1.5">
          {SPALTEN.map((s) => (
            <button key={s.key} onClick={() => setSpalte(s.key)}
              className={`rounded-lg px-3 py-1 text-sm ${spalte === s.key ? "bg-brand-500 font-semibold text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}>
              {t(`ref.spalte.${s.key}`)} ({zaehl(s.status)})
            </button>
          ))}
        </div>
        {sichtbar.length === 0 && <p className="text-sm text-slate-400">{t("ref.leer")}</p>}
        {sichtbar.map((k) => <KorrekturKarte key={k.id} k={k} b={b} slug={slug} id={id} aktion={aktion} />)}
      </section>

      {/* 2. Kandidaten: die Spitze je Kategorie mit Auffaelligkeiten */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-100">{t("ref.kandidaten")}</h2>
        <p className="text-sm text-slate-400">{t("ref.kandidatenHinweis")}</p>
        {kategorien.map(([key, zeilen]) => {
          const [kz, sp] = key.split("|");
          const k = kennzahl(kz);
          return (
            <Card key={key} className="p-3">
              <h3 className="mb-2 font-semibold text-brand-700 dark:text-brand-300">{t(k.labelKey)}{sp && sp !== "pumpfoil" ? ` · ${sportLabel(sp, t)}` : ""}</h3>
              <div className="divide-y divide-slate-800">
                {zeilen.map((z) => {
                  const vorhanden = offenFuer(z);
                  return (
                    <div key={`${z.user_id}-${z.session_id}`} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                      <span className="w-8 tabular-nums text-slate-400">#{z.rang}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold text-slate-100">{z.name}</span>
                      <span className="tabular-nums text-slate-200">{k.fmt(z.value)}</span>
                      {z.hinweise.map((h) => (
                        <span key={h} className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">{t(`ref.hinweis.${h}`)}</span>
                      ))}
                      <Link to={`/sessions/${z.session_id}${z.run_idx != null ? `?run=${z.run_idx}${kz.startsWith("sprint_") ? `&sprint=${kz}` : ""}` : ""}`}
                        className="text-xs text-brand-700 hover:underline dark:text-brand-300">
                        {z.run_idx != null ? t("ref.lauf", { n: z.run_idx + 1 }) : t("ref.session")}
                      </Link>
                      {vorhanden ? (
                        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_FARBE[vorhanden.status]}`}>{t(`ref.status.${vorhanden.status}`)}</span>
                      ) : (
                        <button disabled={z.lauf_start_ms == null} onClick={() => setNeu(z)} className={`${KNOPF_GRAU} py-1 text-xs`}>{t("ref.anlegen")}</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </section>

      {neu && <NeuDialog z={neu} b={b} onClose={() => setNeu(null)} onFertig={(k) => {
        setB((x) => x && { ...x, korrekturen: [k, ...x.korrekturen] }); setNeu(null); setSpalte("entwurf");
      }} slug={slug} id={id} />}
    </div>
  );
}

function Felder({ b, grund, setGrund, oeff, setOeff, intern, setIntern, grundFest = false }: {
  b: Board; grund: string; setGrund: (v: string) => void; oeff: string; setOeff: (v: string) => void; intern: string; setIntern: (v: string) => void;
  grundFest?: boolean;
}) {
  const { t } = useI18n();
  const feld = "w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100";
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-slate-200">{t("ref.feldGrund")}
        <select value={grund} disabled={grundFest} onChange={(e) => setGrund(e.target.value)} className={`${feld} mt-1 disabled:opacity-60`}>
          {b.gruende.map((g) => <option key={g} value={g}>{t(`ref.grund.${g}`)}</option>)}
        </select>
        {grundFest && <span className="mt-1 block text-xs font-normal text-slate-400">{t("ref.grundFest")}</span>}
      </label>
      <label className="block text-sm font-semibold text-slate-200">{t("ref.feldOeffentlich")}
        <textarea value={oeff} onChange={(e) => setOeff(e.target.value)} rows={2} maxLength={1000} className={`${feld} mt-1`} />
      </label>
      <label className="block text-sm font-semibold text-slate-200">{t("ref.feldIntern")}
        <textarea value={intern} onChange={(e) => setIntern(e.target.value)} rows={2} maxLength={4000} className={`${feld} mt-1`} />
      </label>
    </div>
  );
}

function NeuDialog({ z, b, slug, id, onClose, onFertig }: {
  z: RefereeKandidat; b: Board; slug: string; id: string; onClose: () => void; onFertig: (k: RefereeKorrektur) => void;
}) {
  const { t } = useI18n();
  const [grund, setGrund] = useState(z.hinweise.includes("andere_sportart") ? "andere_sportart" : b.gruende[0]);
  const [oeff, setOeff] = useState("");
  const [intern, setIntern] = useState("");
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const speichern = async () => {
    setLaeuft(true);
    try {
      onFertig(await api.refereeAnlegen(slug, id, { session_id: z.session_id, lauf_start_ms: z.lauf_start_ms!, grund,
        kommentar_oeffentlich: oeff, notiz_intern: intern }));
    } catch (e: any) { setFehler(fehlerText(e, t)); } finally { setLaeuft(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg space-y-3 rounded-2xl bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-100">{t("ref.anlegen")}</h3>
        <p className="text-sm text-slate-300">{z.name} · {t(kennzahl(z.kennzahl).labelKey)} · #{z.rang} · {z.run_idx != null ? t("ref.lauf", { n: z.run_idx + 1 }) : ""}</p>
        <Felder b={b} grund={grund} setGrund={setGrund} oeff={oeff} setOeff={setOeff} intern={intern} setIntern={setIntern} />
        <p className="text-xs text-slate-400">{t("ref.entwurfHinweis")}</p>
        {fehler && <p className="text-sm text-red-700 dark:text-red-300">{fehler}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className={KNOPF_GRAU}>{t("common.cancel")}</button>
          <button onClick={speichern} disabled={laeuft} className={KNOPF_BLAU}>{t("ref.alsEntwurf")}</button>
        </div>
      </div>
    </div>
  );
}

function KorrekturKarte({ k, b, slug, id, aktion }: {
  k: RefereeKorrektur; b: Board; slug: string; id: string; aktion: (p: Promise<RefereeKorrektur>) => Promise<void>;
}) {
  const { t, lang } = useI18n();
  const [bearbeiten, setBearbeiten] = useState(false);
  const [grund, setGrund] = useState(k.grund);
  const [oeff, setOeff] = useState(k.kommentar_oeffentlich ?? "");
  const [intern, setIntern] = useState(k.notiz_intern ?? "");
  const [text, setText] = useState("");
  const [frage, setFrage] = useState<null | "veroeffentlicht" | "aufgehoben">(null);
  const status = (s: string) => aktion(api.refereeAendern(slug, id, k.id, { status: s }));
  const lauf = k.run_idx != null ? t("ref.lauf", { n: k.run_idx + 1 }) : t("ref.session");
  // Veroeffentlicht: Kommentar/Notiz innerhalb der Frist aenderbar (Jan, 16.11.2026), Grund bleibt fest.
  const aenderbar = k.status === "entwurf" || k.status === "offen" || (k.status === "veroeffentlicht" && b.wirkung_erlaubt);
  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_FARBE[k.status]}`}>{t(`ref.status.${k.status}`)}</span>
        <span className="font-semibold text-slate-100">{k.fahrer}</span>
        <Link to={`/sessions/${k.session_id}${k.run_idx != null ? `?run=${k.run_idx}` : ""}`} className="text-sm text-brand-700 hover:underline dark:text-brand-300">{lauf}</Link>
        <span className="text-sm text-slate-300">· {t(`ref.grund.${k.grund}`)}</span>
        <span className="ml-auto text-xs text-slate-500">{t("ref.erstellt", { von: k.erstellt_von ?? "", am: zeit(k.erstellt_am, lang) })}
          {k.bearbeitet_am ? ` · ${t("ref.bearbeitetAm", { am: zeit(k.bearbeitet_am, lang) })}` : ""}</span>
      </div>

      {bearbeiten ? (
        <>
          <Felder b={b} grund={grund} setGrund={setGrund} oeff={oeff} setOeff={setOeff} intern={intern} setIntern={setIntern}
            grundFest={k.status === "veroeffentlicht"} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setBearbeiten(false)} className={KNOPF_GRAU}>{t("common.cancel")}</button>
            <button onClick={async () => { await aktion(api.refereeAendern(slug, id, k.id, k.status === "veroeffentlicht"
              ? { kommentar_oeffentlich: oeff, notiz_intern: intern } : { grund, kommentar_oeffentlich: oeff, notiz_intern: intern })); setBearbeiten(false); }}
              className={KNOPF_BLAU}>{t("ref.speichern")}</button>
          </div>
        </>
      ) : (
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("ref.feldOeffentlich")}</p>
            <p className="text-slate-200">{k.kommentar_oeffentlich || "—"}</p></div>
          <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("ref.feldIntern")}</p>
            <p className="text-slate-200">{k.notiz_intern || "—"}</p></div>
        </div>
      )}

      {k.wirkung && (
        <div className="text-xs text-slate-400">
          <span className="font-semibold">{t("ref.wirkung")}:</span>{" "}
          {Object.entries(k.wirkung.vorher).map(([key, v]) => {
            const n = k.wirkung!.nachher[key];
            const kz = kennzahl(key.split("|")[0]);
            return <span key={key} className="mr-3">{t(kz.labelKey)}: {v ? `#${v.rang} ${kz.fmt(v.value)}` : "—"} → {n ? `#${n.rang} ${kz.fmt(n.value)}` : "—"}</span>;
          })}
          {k.bestaetigt_von && <span>· {t("ref.bestaetigtVon", { von: k.bestaetigt_von })}</span>}
        </div>
      )}

      {/* Interne Diskussion */}
      <div className="space-y-1.5 rounded-xl bg-slate-900/60 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("ref.diskussion")}</p>
        {(k.kommentare ?? []).map((c) => (
          <p key={c.id} className="text-sm text-slate-200"><span className="font-semibold">{c.von}</span> <span className="text-xs text-slate-500">{zeit(c.am, lang)}</span><br />{c.text}</p>
        ))}
        <div className="flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t("ref.kommentarPlatzhalter")}
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100" />
          <button disabled={!text.trim()} onClick={async () => { await aktion(api.refereeKommentar(slug, id, k.id, text.trim())); setText(""); }}
            className={KNOPF_GRAU}>{t("ref.senden")}</button>
        </div>
      </div>

      {/* Schritte */}
      <div className="flex flex-wrap justify-end gap-2">
        {aenderbar && !bearbeiten && <button onClick={() => setBearbeiten(true)} className={KNOPF_GRAU}>{t("ref.bearbeiten")}</button>}
        {k.status === "entwurf" && <button onClick={() => status("offen")} className={KNOPF_BLAU}>{t("ref.zurPruefung")}</button>}
        {k.status === "offen" && <>
          <button onClick={() => status("entwurf")} className={KNOPF_GRAU}>{t("ref.zurueckEntwurf")}</button>
          <button onClick={() => status("abgelehnt")} className={KNOPF_GRAU}>{t("ref.ablehnen")}</button>
          <button disabled={!b.wirkung_erlaubt} onClick={() => setFrage("veroeffentlicht")} className={KNOPF_BLAU}>{t("ref.veroeffentlichen")}</button>
        </>}
        {k.status === "veroeffentlicht" && (
          <button disabled={!b.wirkung_erlaubt} onClick={() => setFrage("aufgehoben")} className={KNOPF_GRAU}>{t("ref.aufheben")}</button>
        )}
      </div>

      {frage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setFrage(null)}>
          <div className="w-full max-w-lg space-y-3 rounded-2xl bg-slate-900 p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-100">{t(frage === "veroeffentlicht" ? "ref.veroeffentlichen" : "ref.aufheben")}</h3>
            <p className="text-sm text-slate-300">{t(frage === "veroeffentlicht" ? "ref.bestaetigen" : "ref.aufhebenFrage", { fahrer: k.fahrer ?? "", lauf })}</p>
            {frage === "veroeffentlicht" && (
              <div className="rounded-xl border-2 border-brand-500 p-3 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("ref.vorschau")}</p>
                <p className="font-semibold text-slate-100">{k.fahrer} · {lauf} · {t(`ref.grund.${k.grund}`)}</p>
                {k.kommentar_oeffentlich && <p className="text-slate-200">{k.kommentar_oeffentlich}</p>}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setFrage(null)} className={KNOPF_GRAU}>{t("common.cancel")}</button>
              <button onClick={async () => { const f = frage; setFrage(null); await status(f); }} className={KNOPF_BLAU}>
                {t(frage === "veroeffentlicht" ? "ref.veroeffentlichen" : "ref.aufheben")}
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
