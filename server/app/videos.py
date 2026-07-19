"""Video-Plattform-Helfer + Client-Fähigkeits-Gate.

Instagram/TikTok-Links dürfen NUR an Clients, die sie auch anzeigen können: die Web-PWA
und (künftig) App-Versionen mit entsprechender Anzeige. Alte/aktuelle Apps, die nur YouTube
rendern, bekommen die Links gar nicht erst — sie senden die Kennung nicht bzw. eine zu
niedrige Version.
"""
from __future__ import annotations

# App-Version (X-Pumpfoil-Client: "android/1.2.x" | "ios/1.2.x"), ab der die App IG/TikTok
# ANZEIGEN kann -> dann darf sie sie auch empfangen. Bis dahin: nur Web (Kennung "web").
# HOCHSETZEN, sobald die Apps IG/TikTok-Kacheln haben (aktuell: keine App-Version kann es).
_MIN_APP_ALL_VIDEO = (99, 0, 0)


def is_youtube(url: str | None) -> bool:
    if not url:
        return False
    u = url.lower()
    return "youtube.com" in u or "youtu.be" in u


def client_wants_all_videos(request) -> bool:
    """True = Client kann alle Video-Plattformen anzeigen (Web, oder App >= Mindestversion).
    False (Default, u. a. fehlende Kennung = alte Apps) -> nur YouTube ausliefern."""
    c = (request.headers.get("X-Pumpfoil-Client") or "").strip().lower()
    if c.startswith("web"):
        return True
    if c.startswith(("android/", "ios/")):
        try:
            ver = tuple(int(x) for x in c.split("/", 1)[1].split(".")[:3])
            return ver >= _MIN_APP_ALL_VIDEO
        except (ValueError, IndexError):
            return False
    return False


def filter_videos(rows: list[dict], request) -> list[dict]:
    """rows: [{id, youtube_url}, …]. Für nicht-fähige Clients auf YouTube reduzieren."""
    if client_wants_all_videos(request):
        return rows
    return [r for r in rows if is_youtube(r.get("youtube_url"))]
