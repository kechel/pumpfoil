import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Button } from "./ui";
import { useT } from "../i18n";

// base64url-VAPID-Key -> Uint8Array (applicationServerKey).
function urlB64ToUint8(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Web-Push aktivieren/deaktivieren. Versteckt sich, wenn Server keinen VAPID-Key hat
// oder der Browser keine Notifications/Push unterstützt.
export function NotificationsToggle() {
  const t = useT();
  const [supported] = useState(
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  );
  const [vapid, setVapid] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    api.pushKey().then((r) => setVapid(r.key || null)).catch(() => setVapid(null));
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((s) => setSubscribed(!!s))
      .catch(() => setSubscribed(false));
  }, [supported]);

  if (!supported || !vapid) return null;

  async function enable() {
    setBusy(true); setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setMsg(t("notif.denied")); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8(vapid!) as BufferSource,
      });
      await api.pushSubscribe(sub.toJSON());
      setSubscribed(true);
    } catch {
      setMsg(t("notif.error"));
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await api.pushUnsubscribe(sub.endpoint).catch(() => {}); await sub.unsubscribe(); }
      setSubscribed(false);
    } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {subscribed ? (
          <Button variant="ghost" onClick={disable} disabled={busy}>{t("notif.disable")}</Button>
        ) : (
          <Button onClick={enable} disabled={busy}>{t("notif.enable")}</Button>
        )}
        {subscribed && (
          <button
            onClick={() => api.pushTest().then((r) => setMsg(r.sent ? t("notif.testSent") : t("notif.testNone"))).catch(() => setMsg(t("notif.error")))}
            className="rounded-xl border border-slate-700 px-3 py-2.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            {t("notif.test")}
          </button>
        )}
      </div>
      {msg && <p className="mt-2 text-xs text-slate-400">{msg}</p>}
    </div>
  );
}
