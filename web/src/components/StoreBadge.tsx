// Theme-abhängiges Store-Badge: rendert beide Motive, per CSS (index.css: .storebadge-*)
// erscheint je App-Theme das passende — Dark-Mode -> dunkles, Light-Mode -> helles Badge.
export function StoreBadge({ href, darkSrc, lightSrc, alt, height = "h-11", className = "" }: {
  href: string; darkSrc: string; lightSrc: string; alt: string; height?: string; className?: string;
}) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" aria-label={alt} className={`inline-block ${className}`}>
      <img src={darkSrc} alt={alt} className={`storebadge-dark ${height} w-auto`} />
      <img src={lightSrc} alt={alt} className={`storebadge-light ${height} w-auto`} />
    </a>
  );
}

export const APP_STORE_URL = "https://apps.apple.com/app/id6783975714";
export const PLAY_URL = "https://play.google.com/store/apps/details?id=org.pumpfoil.app";

export function AppStoreBadge({ height, className }: { height?: string; className?: string }) {
  return <StoreBadge href={APP_STORE_URL} darkSrc="/badges/app-store-de.svg" lightSrc="/badges/app-store-de-light.svg"
    alt="Laden im App Store" height={height} className={className} />;
}

export function PlayBadge({ height, className }: { height?: string; className?: string }) {
  return <StoreBadge href={PLAY_URL} darkSrc="/badges/google-play-de.png" lightSrc="/badges/google-play-de-light.png"
    alt="Jetzt bei Google Play" height={height} className={className} />;
}

// Amazfit/Zepp: es gibt KEINEN öffentlichen Web-Store für einzelne Zepp-OS-Apps — man installiert
// zuerst die Zepp-Begleit-App (iOS/Android) und findet unsere App dann darin. Daher hier die
// Store-Badges der ZEPP-APP + Label. In der App: Profil → Amazfit → App Store → „Pumpfoil".
export const ZEPP_IOS_URL = "https://apps.apple.com/app/id1127269366";
export const ZEPP_ANDROID_URL = "https://play.google.com/store/apps/details?id=com.huami.watch.hmwatchmanager";

export function ZeppAppBadges({ height = "h-9" }: { height?: string }) {
  return (
    <div className="inline-flex flex-col items-center gap-1">
      <span className="flex flex-wrap items-center justify-center gap-2">
        <StoreBadge href={ZEPP_IOS_URL} darkSrc="/badges/app-store-de.svg" lightSrc="/badges/app-store-de-light.svg"
          alt="Zepp App im App Store" height={height} />
        <StoreBadge href={ZEPP_ANDROID_URL} darkSrc="/badges/google-play-de.png" lightSrc="/badges/google-play-de-light.png"
          alt="Zepp App bei Google Play" height={height} />
      </span>
      <span className="text-xs text-slate-400">Zepp App → „Pumpfoil"</span>
    </div>
  );
}
