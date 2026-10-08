import { uhr, spaeter } from "./uhr.mjs";
export default {
  writeText(o) {
    uhr.dateien.set(o.uri, o.text); uhr.geschrieben.set(o.uri, o.text);
    spaeter(() => o.success && o.success());
  },
  readText(o) {
    spaeter(() => {
      if (uhr.dateien.has(o.uri)) { if (o.success) o.success({ text: uhr.dateien.get(o.uri) }); }
      else if (o.fail) o.fail("nicht da", 301);
      if (o.complete) o.complete();
    });
  },
  delete(o) { uhr.dateien.delete(o.uri); spaeter(() => o.success && o.success()); },
};
