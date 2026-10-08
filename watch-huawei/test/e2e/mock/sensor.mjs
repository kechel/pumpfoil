import { uhr } from "./uhr.mjs";
export default {
  subscribeAccelerometer(o) { uhr.accel = o; },
  unsubscribeAccelerometer() { uhr.accel = null; },
  subscribeHeartRate(o) { uhr.puls = o; },
  unsubscribeHeartRate() { uhr.puls = null; },
};
