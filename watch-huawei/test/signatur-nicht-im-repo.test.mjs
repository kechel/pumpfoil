// Signatur NIE im (oeffentlichen) Repo: DevEco schreibt Signing Configs samt verschluesselten
// Passwoertern in build-profile.json5. Eingecheckt bleibt "signingConfigs": []; die echten Eintraege
// holt arkts/hvigorfile.ts beim Bauen aus Jans privatem Repo (signing.json). Jan, 13.10.2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const hier = path.dirname(fileURLToPath(import.meta.url));

for (const linie of ['lite', 'wearable', 'arkts']) {
  test(`${linie}/build-profile.json5: signingConfigs leer`, () => {
    const datei = path.join(hier, '..', linie, 'build-profile.json5');
    const text = readFileSync(datei, 'utf-8');
    // fehlt der Schluessel ganz (lite, wearable), ist das genauso sicher
    if (/"signingConfigs"/.test(text)) {
      assert.match(text, /"signingConfigs"\s*:\s*\[\s*\]/, `${datei}: Signatur gehoert in signing.json im privaten Repo`);
    }
    assert.doesNotMatch(text, /storePassword|keyPassword|\.p12"|\.p7b"/, `${datei}: Signatur-Material im Repo`);
  });
}

test('keine Schluessel-/Zertifikatsdateien im Repo', () => {
  const dateien = execFileSync('git', ['ls-files', '--', path.join(hier, '..')], { encoding: 'utf-8' }).split('\n');
  const verboten = dateien.filter((f) => /\.(p12|p7b|cer|csr)$|signing\.json$/i.test(f));
  assert.deepEqual(verboten, []);
});
