import { uhr } from "./uhr.mjs";
export default { subscribe(o) { uhr.gps = o; }, unsubscribe() { uhr.gps = null; } };
