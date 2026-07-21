import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  ChevronIcon, WatchIcon, ChartIcon, MapIcon, CommunityIcon, UploadIcon,
  FoilIcon, FakeIcon, BellIcon, DownloadIcon, ChatBubbleIcon, LocationIcon, TagIcon,
  LockIcon, HeartIcon,
} from "../components/Icons";
import { useT } from "../i18n";
import { LanguageFlags } from "../components/LanguageSelect";
import { InstallPwa } from "../components/InstallPwa";
import { WatchMatrix } from "../components/WatchMatrix";
import { ConnectIqButton } from "../components/ConnectIqButton";
import { AppStoreBadge, PlayBadge, ZeppAppBadges } from "../components/StoreBadge";
import { PromoVideos } from "../components/PromoVideos";
import { ShortModal } from "../components/ShortModal";
import { ThemeToggle } from "../components/ThemeToggle";

// Uhr-Karussell je Plattform: EIN Screenshot breit, auto-rotierend + antippbar (statt
// mehrere Uhren × je 2 Screenshots nebeneinander → zu breit). Punkte zeigen die Anzahl.
function WatchCarousel({ images, rounded, caption, sub, badge, delay = 2800 }: {
  images: string[]; rounded: string; caption: string; sub?: string; badge: React.ReactNode; delay?: number;
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (images.length < 2) return;
    const id = setInterval(() => setI((v) => (v + 1) % images.length), delay);
    return () => clearInterval(id);
  }, [images.length, delay]);
  const cur = i % images.length;
  return (
    <figure className="flex flex-col items-center">
      <div className="relative h-28 w-28 sm:h-32 sm:w-32">
        {images.map((src, idx) => (
          <img key={src} src={src} alt={caption} loading="lazy"
            onClick={() => setI((cur + 1) % images.length)}
            className={`absolute inset-0 h-full w-full cursor-pointer object-contain ${rounded} border border-slate-800 shadow-xl transition-opacity duration-500 ${idx === cur ? "opacity-100" : "opacity-0"}`} />
        ))}
      </div>
      {images.length > 1 && (
        <div className="mt-2 flex gap-1.5">
          {images.map((_, idx) => (
            <button key={idx} onClick={() => setI(idx)} aria-label={`${caption} ${idx + 1}`}
              className={`h-1.5 w-1.5 rounded-full transition-colors ${idx === cur ? "bg-brand-400" : "bg-slate-600"}`} />
          ))}
        </div>
      )}
      <figcaption className="mt-2 text-xs leading-tight text-slate-300">{caption}</figcaption>
      <span className="whitespace-nowrap text-[11px] leading-tight text-slate-400">{sub ?? " "}</span>
      <div className="mt-2">{badge}</div>
    </figure>
  );
}

// Öffentliche Startseite (ohne Login erreichbar) — erklärt, wofür Pumpfoil da ist.
// Nötig für die Google-OAuth-Prüfung: Homepage muss ohne Anmeldung den App-Zweck zeigen.
export default function Landing() {
  const t = useT();
  // Kompakter Lieblings-Short ganz oben (Click-to-Load-Fassade, datensparsam).
  const [heroVideoOn, setHeroVideoOn] = useState(false);
  const features = [
    { icon: WatchIcon, title: t("land.f1Title"), body: t("land.f1Body") },
    { icon: ChartIcon, title: t("land.f2Title"), body: t("land.f2Body") },
    { icon: MapIcon, title: t("land.f3Title"), body: t("land.f3Body") },
    { icon: CommunityIcon, title: t("land.f4Title"), body: t("land.f4Body") },
    { icon: UploadIcon, title: t("land.f5Title"), body: t("land.f5Body") },
    { icon: FoilIcon, title: t("land.f7Title"), body: t("land.f7Body") },
    { icon: FakeIcon, title: t("land.f8Title"), body: t("land.f8Body") },
    { icon: BellIcon, title: t("land.f9Title"), body: t("land.f9Body") },
    { icon: DownloadIcon, title: t("land.f10Title"), body: t("land.f10Body") },
    { icon: ChatBubbleIcon, title: t("land.f11Title"), body: t("land.f11Body") },
    { icon: LocationIcon, title: t("land.f12Title"), body: t("land.f12Body") },
    { icon: TagIcon, title: t("land.f6Title"), body: t("land.f6Body") },
  ];
  // Mobile-App-Screenshots (Hochformat, Android). Je Slot ein Paar dark/light
  // (mobile-dark-N.webp / mobile-light-N.webp) — CSS zeigt via html.theme-light das passende.
  const SHOTS = Array.from({ length: 8 }, (_, i) => i + 1);
  // Desktop 2 nebeneinander pro Slide, Mobile 1.
  const [perView, setPerView] = useState(1);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const upd = () => setPerView(mq.matches ? 2 : 1);
    upd();
    mq.addEventListener("change", upd);
    return () => mq.removeEventListener("change", upd);
  }, []);
  const pages = Math.ceil(SHOTS.length / perView);
  const [page, setPage] = useState(0);
  const cur = Math.min(page, pages - 1);
  const goPage = (d: number) => setPage((p) => (Math.min(p, pages - 1) + d + pages) % pages);
  // Swipe auf Mobile: Finger zieht den Track mit (drag px), beim Loslassen schnappt er
  // und wechselt ab ~40 px die Seite. Während des Ziehens ist die Transition aus.
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const onTouchStart = (e: React.TouchEvent) => { startX.current = e.touches[0].clientX; setDragging(true); };
  const onTouchMove = (e: React.TouchEvent) => { if (dragging) setDrag(e.touches[0].clientX - startX.current); };
  const onTouchEnd = () => {
    setDragging(false);
    const dx = drag; setDrag(0);
    if (dx < -40) goPage(1);
    else if (dx > 40) goPage(-1);
  };
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Hero-Band mit Hintergrund-Video (Hoch-/Querformat, Scrim, reduced-motion).
          Header + Logo liegen darüber; der Scrim blendet unten in den Seiten-Hintergrund. */}
      <div className="relative overflow-hidden">
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/login-bg-landscape-poster.jpg"
          // Portrait-Video ist bereits oben um 20 % beschnitten (fest im File) -> kein CSS-Trick nötig.
          className="pointer-events-none absolute inset-0 h-full w-full object-cover motion-reduce:hidden"
        >
          <source src="/login-bg-portrait.mp4" media="(max-aspect-ratio: 1/1)" type="video/mp4" />
          <source src="/login-bg-landscape.mp4" type="video/mp4" />
        </video>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/55 to-slate-950" />

        {/* Kein Wortmark-Link links: der große Hero-PNG-Titel direkt darunter wäre sonst
            doppelt. Nur Sprachwahl + Login rechts. */}
        <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-end px-5 py-3">
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <LanguageFlags />
            <Link
              to="/login"
              className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-brand-400"
            >
              {t("land.login")}
            </Link>
          </div>
        </header>

        <div className="relative z-10 mx-auto max-w-5xl px-5">
          {/* Hero */}
          <section className="pb-6 pt-0 text-center sm:pb-10 sm:pt-0">
            {/* Haupttitel = Wortmarke + Tagline „TRACK EVERY PUMP" (PNG: schriftunabhängig
                identisch auf allen Geräten). Alt-Text trägt die H1-Semantik. */}
            <h1>
              <img src="/wordmark-stacked-dark.png" alt="Pumpfoil.org — Track every pump"
                className="logo-dark mx-auto h-auto w-full max-w-sm sm:max-w-md" />
              <img src="/wordmark-stacked-light.png" alt="Pumpfoil.org — Track every pump"
                className="logo-light mx-auto h-auto w-full max-w-sm sm:max-w-md" />
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-base text-slate-300 sm:text-lg">{t("land.heroSub")}</p>

            {/* Kompakter Promo-Block: aktueller Lieblings-Short (Click-to-Load, datensparsam);
                rechts daneben der Titel (größer) + Social-Links darunter. */}
            <div className="mt-5 flex flex-col items-center justify-center gap-4 sm:flex-row sm:gap-6">
              <div className="w-32 shrink-0 sm:w-36">
                <div className="relative aspect-[7/8] overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-lg">
                  {/* Schöner Standbild-Screenshot aus dem Video als Preview; öffnet den Short in
                      einem großen Overlay (Click-to-Load). YouTube-Logo mittig -> vor dem Klick
                      klar erkennbar, dass es ein YouTube-Video ist. */}
                  <button onClick={() => setHeroVideoOn(true)} className="group absolute inset-0 h-full w-full" aria-label={t("land.illmenseeTitle")}>
                    <img src="/illmensee-preview.webp" alt={t("land.illmenseeTitle")} loading="lazy"
                      className="h-full w-full object-cover transition group-hover:scale-105" />
                    <span className="absolute inset-0 bg-gradient-to-t from-slate-950/35 to-transparent" />
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 drop-shadow-lg transition group-hover:scale-110">
                      <svg viewBox="0 0 68 48" className="h-11 w-auto" aria-hidden="true">
                        <path fill="#FF0000" d="M66.5 7.7c-.8-2.9-3-5.1-5.9-5.9C55.3.5 34 .5 34 .5S12.7.5 7.4 1.8C4.5 2.6 2.3 4.8 1.5 7.7.2 13 .2 24 .2 24s0 11 1.3 16.3c.8 2.9 3 5.1 5.9 5.9C12.7 47.5 34 47.5 34 47.5s21.3 0 26.6-1.3c2.9-.8 5.1-3 5.9-5.9C67.8 35 67.8 24 67.8 24s0-11-1.3-16.3z" />
                        <path fill="#fff" d="M27 34l18-10-18-10z" />
                      </svg>
                    </span>
                  </button>
                </div>
              </div>

              {/* Titel (größer) rechts + Social-Links darunter */}
              <div className="flex flex-col items-center gap-3 sm:items-start">
                <p className="text-xl font-semibold text-slate-100 sm:text-2xl">{t("land.illmenseeTitle")}</p>
                <div className="flex items-center gap-5">
                  <a href="https://www.youtube.com/@pumpfoil-org/shorts" target="_blank" rel="noopener noreferrer"
                    aria-label="YouTube" className="text-slate-300 hover:text-brand-300">
                    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true">
                      <path d="M23 12s0-3.5-.4-5.1a2.6 2.6 0 0 0-1.8-1.8C19.2 4.7 12 4.7 12 4.7s-7.2 0-8.8.4A2.6 2.6 0 0 0 1.4 6.9C1 8.5 1 12 1 12s0 3.5.4 5.1a2.6 2.6 0 0 0 1.8 1.8c1.6.4 8.8.4 8.8.4s7.2 0 8.8-.4a2.6 2.6 0 0 0 1.8-1.8C23 15.5 23 12 23 12ZM9.8 15.3V8.7l6 3.3-6 3.3Z" />
                    </svg>
                  </a>
                  <a href="https://www.instagram.com/pumpfoil_org/" target="_blank" rel="noopener noreferrer"
                    aria-label="Instagram" className="text-slate-300 hover:text-brand-300">
                    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="2" y="2" width="20" height="20" rx="5" />
                      <circle cx="12" cy="12" r="4" />
                      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                    </svg>
                  </a>
                  <a href="https://www.tiktok.com/@pumpfoil.org" target="_blank" rel="noopener noreferrer"
                    aria-label="TikTok" className="text-slate-300 hover:text-brand-300">
                    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true">
                      <path d="M16.5 3c.3 2.2 1.5 3.7 3.6 4v2.5c-1.3.1-2.5-.2-3.6-.9v5.9c0 3.3-2.4 5.5-5.4 5.5A5.2 5.2 0 0 1 6 14.9c0-3.2 3-5.6 6.3-4.8v2.7a2.3 2.3 0 0 0-1-.2 2.5 2.5 0 0 0 .1 5c1.4 0 2.5-1.1 2.5-2.7V3h2.6Z" />
                    </svg>
                  </a>
                </div>
                {/* Verweis auf die Illmensee-Homepage (unser Haus-Spot). */}
                <a href="https://www.illmensee.de/" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-black hover:text-brand-400 dark:text-slate-300">
                  <LocationIcon className="h-4 w-4" /> illmensee.de
                </a>
              </div>
            </div>

            {heroVideoOn && (
              <ShortModal id="5ooOkm8QgAI" title={t("land.illmenseeTitle")} onClose={() => setHeroVideoOn(false)} />
            )}
          </section>

          {/* „Auf der Uhr" liegt noch im Hero-Band -> vom Video hinterlegt (Apple rechteckig, Wear rund). */}
          <section className="pb-8">
            <h2 className="mb-2 text-center text-xl font-bold sm:text-2xl">{t("land.watchTitle")}</h2>
            <p className="mx-auto mb-6 max-w-2xl text-center text-slate-300">{t("land.watchBody")}</p>
            {/* Feste Bildhöhe -> Captions gleich; Subline-Zeile in ALLEN Spalten (ggf. leer) -> Badges exakt gleich hoch. */}
            <div className="flex flex-wrap items-start justify-center gap-x-10 gap-y-6">
              <WatchCarousel rounded="rounded-full" caption="Garmin"
                images={["/watch-garmin-1.webp", "/watch-garmin-2.webp", "/watch-garmin-3.webp", "/watch-garmin-4.webp"]}
                badge={<ConnectIqButton className="mt-2" />} />
              <WatchCarousel rounded="rounded-[1.5rem]" caption="Apple Watch"
                images={["/watch-apple-1.webp", "/watch-apple-2.webp", "/watch-apple-3.webp"]}
                badge={<AppStoreBadge className="mt-2" />} />
              <WatchCarousel rounded="rounded-full" caption="Wear OS" sub="Samsung · Pixel · TicWatch …"
                images={["/watch-wear-1.webp", "/watch-wear-2.webp", "/watch-wear-3.webp"]}
                badge={<PlayBadge className="mt-2" />} />
              <WatchCarousel rounded="rounded-full" caption="Amazfit" sub="Zepp OS"
                images={["/watch-amazfit-1.webp", "/watch-amazfit-2.webp", "/watch-amazfit-3.webp"]}
                badge={<ZeppAppBadges />} />
            </div>
          </section>
        </div>
      </div>

      {/* Uhr-App Key-Features — unterhalb des Video-Bands (Band endet an den Store-Buttons). */}
      <div className="mx-auto max-w-5xl px-5">
        <section className="pb-8">
            <div className="mx-auto mt-2 max-w-3xl rounded-3xl border border-brand-500/30 bg-gradient-to-b from-brand-500/10 to-slate-900/40 p-6 sm:p-8">
              <h3 className="mb-7 text-center text-base font-bold sm:text-lg">
                {t("land.watchFeatIntro")}
              </h3>
              <ul className="flex flex-col gap-6">
                <li className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-400">
                    <BellIcon className="h-6 w-6" />
                  </span>
                  <div>
                    <h4 className="font-semibold">{t("land.watchFeat1Title")}</h4>
                    <p className="mt-1 text-sm text-slate-400">{t("land.watchFeat1Body")}</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-400">
                    <FoilIcon className="h-6 w-6" />
                  </span>
                  <div>
                    <h4 className="font-semibold">{t("land.watchFeat2Title")}</h4>
                    <p className="mt-1 text-sm text-slate-400">{t("land.watchFeat2Body")}</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-400">
                    <WatchIcon className="h-6 w-6" />
                  </span>
                  <div>
                    <h4 className="font-semibold">{t("land.watchFeat3Title")}</h4>
                    <p className="mt-1 text-sm text-slate-400">{t("land.watchFeat3Body")}</p>
                  </div>
                </li>
              </ul>
              <p className="mt-6 text-center text-sm font-medium text-brand-400">
                {t("land.watchFeatMore")}
              </p>
            </div>
        </section>
      </div>

      <main className="mx-auto max-w-5xl px-5">

        {/* Schon eine Sportuhr? Bestehendes Suunto-/Polar-Konto verbinden (Import ohne unsere App). */}
        <section className="pb-12 pt-2">
          <h2 className="mb-2 text-center text-xl font-bold sm:text-2xl">{t("land.connectTitle")}</h2>
          <p className="mx-auto mb-6 max-w-2xl text-center text-slate-300">{t("land.connectBody")}</p>
          <div className="flex flex-wrap items-center justify-center gap-6">
            <span className="inline-block rounded-xl bg-white px-5 py-3 shadow-sm">
              <img src="/suunto-logo.png" alt="Suunto" loading="lazy" className="h-14 w-auto" />
            </span>
            <span className="inline-block rounded-xl bg-white px-5 py-3 shadow-sm">
              <img src="/polar-logo.jpg" alt="Polar" loading="lazy" className="h-7 w-auto" />
            </span>
          </div>
        </section>

        {/* Keine Uhr? Session direkt mit dem Handy aufnehmen (native Android-/iOS-App). */}
        <section className="pb-12">
          <h2 className="mb-2 text-center text-xl font-bold sm:text-2xl">{t("land.phoneRecTitle")}</h2>
          <p className="mx-auto max-w-2xl text-center text-slate-300">{t("land.phoneRecBody")}</p>
        </section>

        {/* App-Screens: Mobile-Slider, Desktop 2 nebeneinander / Mobile 1 */}
        <section className="pb-10">
          <h2 className="mb-5 text-center text-xl font-bold sm:text-2xl">{t("land.appShotsTitle")}</h2>
          <div className="mx-auto flex items-center justify-center gap-1 sm:gap-4">
            <button
              onClick={() => goPage(-1)}
              aria-label={t("land.prev")}
              className="flex shrink-0 items-center px-1 text-slate-500 hover:text-brand-400"
            ><ChevronIcon className="h-12 w-12 rotate-180 sm:h-16 sm:w-16" /></button>
            {/* Viewport + horizontal verschiebbarer Track: gleitet animiert (translateX),
                statt die Bilder hart auszutauschen. Eine „Seite" = perView Screenshots. */}
            <div
              className="w-[230px] touch-pan-y overflow-hidden rounded-[30px] sm:w-[560px]"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              <div
                className={`flex ${dragging ? "" : "transition-transform duration-500 ease-out"}`}
                style={{ transform: `translateX(calc(-${cur * 100}% + ${drag}px))` }}
              >
                {Array.from({ length: pages }, (_, p) => (
                  <div key={p} className="flex w-full shrink-0 items-center justify-center gap-4 sm:gap-8">
                    {SHOTS.slice(p * perView, p * perView + perView).map((n) => (
                      <div
                        key={n}
                        className="w-[230px] shrink-0 sm:w-[256px]"
                      >
                        <img
                          src={`/mobile-dark-${n}.webp`}
                          alt="Pumpfoil App"
                          loading="lazy"
                          className="shot-dark block w-full"
                        />
                        <img
                          src={`/mobile-light-${n}.webp`}
                          alt="Pumpfoil App"
                          loading="lazy"
                          className="shot-light block w-full"
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <button
              onClick={() => goPage(1)}
              aria-label={t("land.next")}
              className="flex shrink-0 items-center px-1 text-slate-500 hover:text-brand-400"
            ><ChevronIcon className="h-12 w-12 sm:h-16 sm:w-16" /></button>
          </div>
          {/* Vorschau-Punkte (eine pro Seite) */}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {Array.from({ length: pages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                aria-label={`${i + 1}`}
                className={`h-2.5 rounded-full transition-all ${i === cur ? "w-6 bg-brand-400" : "w-2.5 bg-slate-600 hover:bg-slate-500"}`}
              />
            ))}
          </div>

          {/* Native Apps: offizielle Store-Badges + QR-Codes zum Abscannen vom PC.
              Direkt unter den Mobile-Screenshots (kein eigener Abschnitts-Titel). */}
          <div className="mt-8 flex flex-col items-center justify-center gap-8 sm:flex-row sm:items-start sm:gap-12">
            {/* Android (Google Play) */}
            <div className="flex flex-col items-center gap-3">
              <a
                href="https://play.google.com/store/apps/details?id=org.pumpfoil.app"
                target="_blank"
                rel="noreferrer"
                aria-label="Jetzt bei Google Play"
              >
                <img src="/badges/google-play-de.png" alt="Jetzt bei Google Play" className="h-14 w-auto" />
              </a>
              <span className="text-xs font-medium text-slate-300">{t("land.inclWear")}</span>
              <img
                src="/badges/qr-google-play.svg"
                alt="QR-Code: Google Play"
                className="h-28 w-28 rounded-lg bg-white p-1.5"
              />
            </div>
            {/* iPhone + Apple Watch (App Store) */}
            <div className="flex flex-col items-center gap-3">
              <a
                href="https://apps.apple.com/app/id6783975714"
                target="_blank"
                rel="noreferrer"
                aria-label="Laden im App Store"
              >
                <img src="/badges/app-store-de.svg" alt="Laden im App Store" className="h-14 w-auto" />
              </a>
              <span className="text-xs font-medium text-slate-300">{t("land.inclWatch")}</span>
              <img
                src="/badges/qr-app-store.svg"
                alt="QR-Code: App Store"
                className="h-28 w-28 rounded-lg bg-white p-1.5"
              />
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-slate-400">{t("land.qrHint")}</p>
        </section>

        {/* Promo-Videos vom YouTube-Kanal (live, selbst-aktualisierend) */}
        <PromoVideos />

        {/* Was ist Pumpfoil? */}
        <section className="mx-auto max-w-3xl pb-4 text-center">
          <h2 className="text-xl font-bold sm:text-2xl">{t("land.whatTitle")}</h2>
          <p className="mt-3 text-slate-300">{t("land.whatBody")}</p>
        </section>

        {/* Features */}
        <section className="grid gap-4 py-10 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <f.icon className="h-7 w-7 text-brand-400" />
              <h3 className="mt-2 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{f.body}</p>
            </div>
          ))}
        </section>

        {/* Unterstützte Uhren — Kompatibilitäts-Matrix */}
        <section className="pb-10">
          <h2 className="text-center text-xl font-bold sm:text-2xl">{t("watches.title")}</h2>
          <p className="mx-auto mb-6 mt-2 max-w-2xl text-center text-slate-300">{t("watches.intro")}</p>
          <WatchMatrix />
        </section>

        {/* Datenschutz & Open Source */}
        <section className="grid gap-4 pb-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <LockIcon className="h-7 w-7 text-brand-400" />
            <h3 className="mt-2 font-semibold">{t("land.privacyTitle")}</h3>
            <p className="mt-1 text-sm text-slate-400">{t("land.privacyBody")}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <HeartIcon className="h-7 w-7 text-brand-400" filled />
            <h3 className="mt-2 font-semibold">{t("land.openTitle")}</h3>
            <p className="mt-1 text-sm text-slate-400">{t("land.openBody")}</p>
            <a
              href="https://github.com/kechel/pumpfoil"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-sm font-medium text-brand-400 hover:text-brand-300"
            >
              {t("land.openLink")}
            </a>
          </div>
        </section>

        {/* Abschluss-CTA */}
        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 px-6 py-10 text-center">
          <h2 className="text-xl font-bold sm:text-2xl">{t("land.ctaTitle")}</h2>
          <p className="mx-auto mt-2 max-w-xl text-slate-300">{t("land.ctaBody")}</p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/login"
              className="inline-block rounded-xl bg-brand-500 px-8 py-3 text-sm font-semibold text-slate-950 hover:bg-brand-400"
            >
              {t("land.login")}
            </Link>
            <InstallPwa />
          </div>
        </section>
      </main>

      <footer className="mx-auto mt-10 max-w-5xl px-5 py-8 text-center text-xs text-slate-500">
        <Link to="/impressum" className="hover:text-slate-300">{t("nav.imprint")}</Link>
        <span className="mx-2">·</span>
        <span>{t("land.footerLicense")}</span>
        <span className="mx-2">·</span>
        <span>© Pumpfoil</span>
      </footer>
    </div>
  );
}
