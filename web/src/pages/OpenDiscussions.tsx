import { useEffect, useState, type ReactNode } from "react";
import { ZurueckPfeil } from "../components/ZurueckPfeil";
import { ScrollToTop } from "../components/ScrollToTop";
import { api } from "../lib/api";

// Open Discussions (Jan, 08.11.2026): Fragen, die die Community gerade diskutiert — gesammelt, was dafuer und dagegen
// gesagt wurde, ohne Loesung, darunter Jans Stand. Nur Englisch, ANONYM (Rollen statt Namen; Quellen sind auch private
// Chats). VORERST NUR FUER ADMINS sichtbar (Menue-Link und Seite), bis Jan freigibt.

function H({ children }: { children: ReactNode }) {
  return <h2 className="mb-3 mt-8 border-b border-slate-800 pb-1 text-lg font-bold text-slate-100">{children}</h2>;
}
function H3({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 mt-6 font-semibold text-slate-200">{children}</h3>;
}
function Arg({ text, wer }: { text: string; wer: string }) {
  return (
    <li className="mt-2">
      <span className="text-slate-200">{text}</span>
      <span className="ml-1 text-xs text-slate-400">— {wer}</span>
    </li>
  );
}

export default function OpenDiscussions() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  useEffect(() => { api.getProfile().then((p) => setAdmin(!!p.is_admin)).catch(() => setAdmin(false)); }, []);
  if (admin === null) return null;
  if (!admin) return <div className="mx-auto max-w-2xl p-6 text-sm text-slate-400">This page isn't public yet.</div>;
  return (
    <div className="mx-auto max-w-2xl p-6" style={{ paddingTop: "calc(1.5rem + env(safe-area-inset-top))" }}>
      <ScrollToTop />
      <h1 className="mb-1 flex items-center gap-2 text-xl font-bold"><ZurueckPfeil />Open Discussions</h1>
      <p className="text-sm text-slate-400">Questions the community is debating right now. We collect what has been said, for and
        against, without a verdict — so everyone can see how decisions come about. Last updated 8 November 2026.</p>
      <p className="mt-2 rounded-lg border border-amber-600/40 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">
        Draft, visible to admins only.</p>

      <H>Foil scoot: its own sport, or part of pumpfoiling?</H>
      <p className="text-sm text-slate-300">A foil scoot is a pumpfoil board and foil with a vertical handlebar, about a metre
        high, that the rider holds while pumping. There is no motor — it is pure muscle power, like pumpfoiling. The question
        came up around the first global event and was discussed in the community chat and in private messages.</p>

      <H3>Arguments for counting foil scoot together with pumpfoil</H3>
      <ul className="list-disc pl-5 text-sm">
        <Arg text="Same board, same foil, same muscles, no external propulsion. The handlebar is a walking stick — if anything, a burden."
          wer="a foil scoot rider" />
        <Arg text="The scoot only has a real advantage at the start. All other records can be compared."
          wer="a foil scoot rider" />
        <Arg text="Having to switch to the foil scoot category to appear in the records demotivates scoot riders."
          wer="a foil scoot rider" />
        <Arg text="With a handlebar you can use your upper body more, but you lose the arm swings. That may cancel out."
          wer="a foil scoot rider" />
        <Arg text="Pumping downwind or in waves is easier than on flat water and still counts as pumpfoiling. First instinct: include foil scoots, maybe don't distinguish at all. (Not true: downwind and wave pumping are separate sports on pumpfoil.org too.)"
          wer="a pumpfoil rider" />
        <Arg text="Envy is a poor guide for comparing performances. If needed, label scoot riders instead of leaving them out of the ranking."
          wer="a foil scoot rider" />
      </ul>

      <H3>Arguments for separate rankings</H3>
      <ul className="list-disc pl-5 text-sm">
        <Arg text="At the same fitness level, scoot riders seem to pump longer and further."
          wer="pumpfoil.org" />
        <Arg text="A possible reason: in a snowboard stance the legs can't contribute equally, and they also have to steer the pitch separately. The handlebar takes over part of the balance."
          wer="pumpfoil.org" />
        <Arg text="The scoot has a clear advantage at the start — and starts decide how many runs you get."
          wer="a foil scoot rider" />
        <Arg text="Foil scoot is hard to compare with free pumpfoiling, similar to foil assist. Sub-categories make sense. (Not true: foil assist is clearly not muscle power only.)"
          wer="a pumpfoil rider" />
        <Arg text="Foil scoot sessions in the pumpfoil rankings feel unfair to some pumpfoilers."
          wer="pumpfoil riders" />
        <Arg text="Balance is easier with a handlebar."
          wer="pumpfoil.org" />
      </ul>

      <H3>What the data says</H3>
      <ul className="list-disc pl-5 text-sm text-slate-300">
        <li className="mt-2">Pump cadence, speed, distance per pump and heart rate of foil scoot riders are all in the same range as
          those of pumpfoilers.</li>
        <li className="mt-2">The wrist doesn't tell them apart either. Scoot riders move their wrist between 0.3 and 0.8 g, pumpfoilers
          between 0.15 and 2 g, and the share of sideways movement overlaps too. We had expected a hand on the bar to move far
          less sideways; the data doesn't show that.</li>
        <li className="mt-2">So we can't detect foil scoot automatically. The rider's own classification counts.</li>
        <li className="mt-2">Long runs of 15 minutes and more in one go occur with foil scoot riders as well as with pumpfoilers.</li>
        <li className="mt-2">Whether scoot riders really go further at the same fitness is an impression so far. Only riders who do
          both could measure it.</li>
      </ul>

      <H3>Proposed approaches</H3>
      <ul className="list-disc pl-5 text-sm">
        <Arg text="Mix in one direction only: scoot riders get a switch to see themselves in the pumpfoil leaderboards, while the official pumpfoil leaderboards stay pumpfoil only."
          wer="pumpfoil.org" />
        <Arg text="Keep separate rankings, but let scoot riders choose to be listed and keep their stats among pumpfoilers — as an option, not for everyone."
          wer="pumpfoil.org" />
        <Arg text="One shared leaderboard where scoot riders are marked, with a filter for pumpfoil only."
          wer="a foil scoot rider; pumpfoil.org" />
        <Arg text="Decide per metric: separate for total distance and time, where an advantage would add up; shared, with a marker, for top speed and run length."
          wer="pumpfoil.org" />
        <Arg text="Show foil scoot in the community records by default as well, since everything except the start is comparable."
          wer="a foil scoot rider" />
        <Arg text="Sub-categories for foil scoot and foil assist."
          wer="a pumpfoil rider" />
        <Arg text="Include foil scoot in pumpfoil without distinguishing."
          wer="a pumpfoil rider" />
        <Arg text="Separate foil scoot leaderboards in events, so scoot riders have their own ranking there."
          wer="pumpfoil.org (in place since 7 November)" />
      </ul>

      <H3>Current state</H3>
      <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4 text-sm text-slate-300">
        <p>Foil scoot is treated as its own sport with its own records and leaderboards. In the global event it has separate
          leaderboards. Riders set foil scoot themselves, per session or as their default sport for new sessions. Because the
          data can't tell the two apart, the rider's own classification counts; reported sessions are reviewed by hand.</p>
        <p className="mt-2">This is where things stand today, not a final decision. The discussion is open — tell us what you think
          in the community chat.</p>
        <p className="mt-2 text-xs text-slate-400">— Jan, pumpfoil.org</p>
      </div>
    </div>
  );
}
