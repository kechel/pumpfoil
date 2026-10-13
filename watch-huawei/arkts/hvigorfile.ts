import { appTasks, OhosAppContext, OhosPluginId } from '@ohos/hvigor-ohos-plugin';
import { hvigor, getNode } from '@ohos/hvigor';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Signatur NIE im Repo (13.10.2026, Jan: „das ist gefaehrlich"): build-profile.json5 bleibt mit
// "signingConfigs": [] eingecheckt (ein Node-Test prueft das). Die echten Eintraege liegen in Jans
// privatem Repo als signing.json — genau das, was DevEco unter Project Structure -> Signing Configs
// in build-profile.json5 schreibt, Pfade gern relativ zur signing.json:
//   { "signingConfigs": [ { "name": "release", "type": "HarmonyOS", "material": { ... } } ] }
// Gesucht wird in $PUMPFOIL_HUAWEI_SIGNING und ~/gits/rechnungen/pumpfoil-huawei/signing.json (kein Symlink, Jan).
// Build Mode „release" (DevEco oben bzw. -p buildMode=release) nimmt den Eintrag mit „release" im
// Namen, sonst bleibt „default" (Debug/Emulator). Ohne Datei: unsigniert wie bisher (VM-Build).
const KANDIDATEN: string[] = [
  process.env.PUMPFOIL_HUAWEI_SIGNING ?? '',
  path.join(os.homedir(), 'gits', 'rechnungen', 'pumpfoil-huawei', 'signing.json'),   // Jans privates Repo
].filter((k) => k !== '');

function signingDatei(): string | undefined {
  return KANDIDATEN.find((k) => fs.existsSync(k));
}

getNode(__filename).afterNodeEvaluate((node) => {
  const datei = signingDatei();
  if (datei === undefined) {
    // Sichtbar machen statt still unsigniert (13.10.2026: Jan sah nur „Will skip sign").
    console.log('Pumpfoil-Signatur: keine signing.json gefunden (gesucht: ' + KANDIDATEN.join(', ') + ') -> unsigniert');
    return;
  }
  const ctx = node.getContext(OhosPluginId.OHOS_APP_PLUGIN) as OhosAppContext;
  const opt = ctx.getBuildProfileOpt();
  const dir = path.dirname(datei);
  const neu = (JSON.parse(fs.readFileSync(datei, 'utf-8')).signingConfigs ?? []) as any[];
  for (const c of neu) {
    for (const k of ['storeFile', 'profile', 'certpath']) {
      if (c.material && typeof c.material[k] === 'string' && !path.isAbsolute(c.material[k])) {
        c.material[k] = path.join(dir, c.material[k]);
      }
    }
  }
  const namen = new Set(neu.map((c) => c.name));
  opt.app.signingConfigs = (opt.app.signingConfigs ?? []).filter((c: any) => !namen.has(c.name)).concat(neu);
  const modus = hvigor.getParameter().getExtParam('buildMode') ?? 'debug';
  const rel = neu.find((c) => /release/i.test(c.name));
  if (modus === 'release' && rel !== undefined) {
    for (const p of opt.app.products ?? []) {
      p.signingConfig = rel.name;
    }
  }
  console.log('Pumpfoil-Signatur: ' + datei + ' (' + neu.map((c) => c.name).join(', ') + '), buildMode ' + modus +
    ' -> ' + (opt.app.products ?? []).map((p: any) => p.name + '=' + p.signingConfig).join(', '));
  ctx.setBuildProfileOpt(opt);
});

export default {
  system: appTasks,  /* Built-in plugin of Hvigor. It cannot be modified. */
  plugins: []        /* Custom plugin to extend the functionality of Hvigor. */
}
