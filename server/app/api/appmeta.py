"""App-Meta: neueste Store-Version der Phone-Apps (fuer den In-App-Update-Hinweis).

WICHTIG (Jan): der Server kennt die Store-Version NICHT automatisch. Nach jedem
Store-Release, der durch den Review ist, die Werte hier von Hand aktualisieren.
Solange `latest` leer ist, zeigt die App KEINEN Hinweis (kein Fehlalarm auf eine
noch nicht verfuegbare Version).

- latest:        neueste im Store verfuegbare Version (z. B. "1.1.8"); leer = kein Hinweis
- min_supported: erzwingt ein Update (App zeigt Hard-Gate), leer = kein Zwang
- store_url:     Ziel des "Aktualisieren"-Buttons
"""
from fastapi import APIRouter

router = APIRouter(prefix="/api/app", tags=["app"])

# ---- MANUELL PFLEGEN nach jedem Store-Release (siehe Modul-Docstring) ----
_APP_META: dict[str, dict[str, str]] = {
    "ios": {
        "latest": "",          # TODO Jan: nach Review setzen, z. B. "1.1.8"
        "min_supported": "",
        "store_url": "https://apps.apple.com/app/pumpfoil/id0000000000",  # TODO Jan: echte App-ID
    },
    "android": {
        "latest": "",          # TODO Jan: nach Review setzen, z. B. "1.1.6"
        "min_supported": "",
        "store_url": "https://play.google.com/store/apps/details?id=org.pumpfoil.app",
    },
}


@router.get("/latest")
def latest(platform: str = "") -> dict:
    """Neueste Store-Version je Plattform (ios|android). Werte werden manuell gepflegt.
    Die App vergleicht `latest` mit ihrer eigenen Bundle-Version und blendet ggf. einen
    nicht-blockierenden Hinweis ein (Hard-Gate optional ueber `min_supported`)."""
    m = _APP_META.get(platform.lower().strip())
    if not m:
        return {"latest": "", "min_supported": "", "store_url": ""}
    return dict(m)
