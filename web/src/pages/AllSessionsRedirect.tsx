import { Navigate, useSearchParams } from "react-router-dom";

// Alt-Route /alle-sessions -> vereinheitlichte /sessions-Seite (Community-Scope).
// Query (spot/name) bleibt erhalten; ohne Spot wird scope=all gesetzt.
export default function AllSessionsRedirect() {
  const [sp] = useSearchParams();
  const n = new URLSearchParams(sp);
  if (!n.get("spot")) n.set("scope", "all");
  const qs = n.toString();
  return <Navigate to={`/sessions${qs ? "?" + qs : ""}`} replace />;
}
