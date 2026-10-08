// Loader-Hook fuer den Ende-zu-Ende-Test: `@system.<name>` (Lite-Systemmodule) -> Attrappe in ./mock/.
// So laeuft der ECHTE common/recorder.js in Node, nicht eine Nachbildung.
export async function resolve(spec, ctx, next) {
  const m = /^@system\.(\w+)$/.exec(spec);
  if (m) return { url: new URL(`./mock/${m[1]}.mjs`, import.meta.url).href, shortCircuit: true };
  return next(spec, ctx);
}
