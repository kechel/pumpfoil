// Attrappe fuer @system.fetch (Watch 3/4 Direkt-Upload): der Test setzt den „Server" per setzeServer.
// Antworten kommen asynchron wie auf der Uhr.
import { spaeter } from "./uhr.mjs";
let server = () => ({ code: 0, data: "kein Server" });
export function setzeServer(fn) { server = fn; }
export default {
  fetch(o) {
    spaeter(() => {
      const r = server(o);
      if (r.code === 0) { if (o.fail) o.fail(r.data, 1); }
      else if (o.success) o.success({ code: r.code, data: r.data, headers: {} });
    });
  },
};
